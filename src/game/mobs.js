const state = require('./state');
const {
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    MOB_TIERS,
    MOB_SPAWN_INTERVAL_MS,
    MOB_SPAWN_DISTANCE,
    MOB_MIN_SPAWN_DISTANCE,
    MOB_CONTACT_COOLDOWN_MS,
    MOB_VIEW_DISTANCE,
} = require('../config');
const { getAngleDiff } = require('../utils/geometry');
const { hasHitTargetForKey } = require('./hits');
const { getMaxMobTier, pickMobTier } = require('./tiers');
const { getMaxHpFromStats } = require('./stats');
const { updateXpOrbs, dropXpOrb } = require('./xpOrbs');
const { markStatsDirty, flushStats } = require('./sync');

const { players } = state;
const mobs = new Map();
const lastSpawnAt = new Map();
const lastSentCount = new Map();
let nextMobId = 1;
let lastTickAt = 0;

const PLAYER_BODY_RADIUS = 22;

function getMaxMobsForLevel(level) {
    const current = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
    return Math.min(40, 8 + current * 2);
}

function isOwnerActive(p) {
    return Boolean(p && p.hp > 0 && !p.isSelectingLoadout);
}

function clampToWorld(value, max) {
    return Math.max(WORLD_MARGIN, Math.min(max - WORLD_MARGIN, value));
}

function pickSpawnPoint(owner) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = MOB_SPAWN_DISTANCE.min + Math.random() * (MOB_SPAWN_DISTANCE.max - MOB_SPAWN_DISTANCE.min);
        const x = clampToWorld(owner.x + Math.cos(angle) * distance, GAME_WIDTH);
        const y = clampToWorld(owner.y + Math.sin(angle) * distance, GAME_HEIGHT);
        if (Math.hypot(x - owner.x, y - owner.y) >= MOB_MIN_SPAWN_DISTANCE) return { x, y };
    }
    return null;
}

function spawnMob(ownerId, options = {}) {
    const owner = players[ownerId];
    if (!owner) return null;
    const tierIndex = Number.isInteger(options.tier)
        ? Math.max(0, Math.min(MOB_TIERS.length - 1, options.tier))
        : pickMobTier(owner.level);
    const position = Number.isFinite(options.x) && Number.isFinite(options.y)
        ? { x: options.x, y: options.y }
        : pickSpawnPoint(owner);
    if (!position) return null;
    const tier = MOB_TIERS[tierIndex];
    const levelScale = 1 + (Math.max(1, owner.level || 1) - 1) * 0.04;
    const hp = Math.round(tier.hp * levelScale);
    const mob = {
        id: nextMobId++,
        ownerId,
        tier: tierIndex,
        x: position.x,
        y: position.y,
        hp,
        maxHp: hp,
        speed: tier.speed,
        damage: Math.round(tier.damage * (1 + (Math.max(1, owner.level || 1) - 1) * 0.02)),
        xp: tier.xp,
        radius: tier.radius,
        lastContactAt: 0,
    };
    mobs.set(mob.id, mob);
    return mob;
}

function getMob(mobId) {
    return mobs.get(Number(mobId));
}

function getMobsForOwner(ownerId) {
    return [...mobs.values()].filter((mob) => mob.ownerId === ownerId);
}

function clearMobsForOwner(ownerId) {
    for (const [id, mob] of mobs) {
        if (mob.ownerId === ownerId) mobs.delete(id);
    }
    lastSpawnAt.delete(ownerId);
}

function clearAllMobs() {
    mobs.clear();
    lastSpawnAt.clear();
    lastSentCount.clear();
}

// Any player can damage any mob. A killed mob drops its XP as an orb anyone can pick up.
function damageMob(mobId, attackerId, damage, angle) {
    const mob = getMob(mobId);
    const attacker = players[attackerId];
    const amount = Math.max(1, Math.floor(Number(damage) || 0));
    if (!mob || !attacker) return false;
    mob.hp -= amount;
    if (mob.hp <= 0) {
        mobs.delete(mob.id);
        // Small heal per kill so long fights are survivable without pickups.
        if (attacker.hp > 0) attacker.hp = Math.min(getMaxHpFromStats(attacker.stats), attacker.hp + 1 + mob.tier);
        state.io.emit('mobKilled', { id: mob.id, x: mob.x, y: mob.y, tier: mob.tier, killerId: attackerId });
        dropXpOrb(mob.x, mob.y, mob.xp);
    } else {
        state.io.emit('mobDamaged', { id: mob.id, x: mob.x, y: mob.y, angle: Number.isFinite(angle) ? angle : 0, weapon: attacker.weapon || 'sword' });
    }
    return true;
}

// Damages every mob passing `test`. `hitKey` prevents hitting the same mob twice with one attack.
function hitMobs(attackerId, test, damage, angle, hitKey) {
    let hits = 0;
    for (const mob of [...mobs.values()]) {
        if (!test(mob)) continue;
        if (hitKey && hasHitTargetForKey(hitKey, `mob:${mob.id}`)) continue;
        damageMob(mob.id, attackerId, damage, angle);
        hits++;
    }
    return hits;
}

function moveMobsForOwner(owner, ownerMobs, dt) {
    for (const mob of ownerMobs) {
        const dx = owner.x - mob.x;
        const dy = owner.y - mob.y;
        const distance = Math.hypot(dx, dy);
        const stopDistance = mob.radius + PLAYER_BODY_RADIUS * Math.max(1, owner.giantScale || 1) - 4;
        if (distance > stopDistance) {
            const step = Math.min(distance - stopDistance, mob.speed * dt);
            mob.x += (dx / distance) * step;
            mob.y += (dy / distance) * step;
        }
    }
    // Push overlapping mobs apart so the swarm spreads out around the player.
    for (let i = 0; i < ownerMobs.length; i++) {
        for (let j = i + 1; j < ownerMobs.length; j++) {
            const a = ownerMobs[i];
            const b = ownerMobs[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.hypot(dx, dy) || 0.01;
            const overlap = a.radius + b.radius - distance;
            if (overlap <= 0) continue;
            const push = overlap / 2;
            a.x -= (dx / distance) * push;
            a.y -= (dy / distance) * push;
            b.x += (dx / distance) * push;
            b.y += (dy / distance) * push;
        }
    }
    for (const mob of ownerMobs) {
        mob.x = clampToWorld(mob.x, GAME_WIDTH);
        mob.y = clampToWorld(mob.y, GAME_HEIGHT);
    }
}

// Returns true if the owner died from contact damage.
function applyContactDamage(ownerId, owner, ownerMobs, now) {
    if (owner.isDodging) return false;
    const contactRange = PLAYER_BODY_RADIUS * Math.max(1, owner.giantScale || 1);
    for (const mob of ownerMobs) {
        if (now - mob.lastContactAt < MOB_CONTACT_COOLDOWN_MS) continue;
        if (Math.hypot(owner.x - mob.x, owner.y - mob.y) > mob.radius + contactRange) continue;
        mob.lastContactAt = now;
        let damage = mob.damage;
        const angleToMob = Math.atan2(mob.y - owner.y, mob.x - owner.x);
        if (owner.isGuarding && getAngleDiff(owner.angle, angleToMob) < Math.PI / 3) damage = Math.floor(damage * 0.5);
        if (damage <= 0) continue;
        owner.hp -= damage;
        state.io.to(ownerId).emit('mobDamage', { amount: damage });
        markStatsDirty();
        if (owner.hp <= 0) {
            const { resolveKill } = require('./combat');
            resolveKill(null, ownerId);
            return true;
        }
    }
    return false;
}

function emitMobSnapshots() {
    const all = [...mobs.values()];
    for (const [playerId, viewer] of Object.entries(players)) {
        const visible = [];
        for (const mob of all) {
            if (Math.abs(mob.x - viewer.x) > MOB_VIEW_DISTANCE || Math.abs(mob.y - viewer.y) > MOB_VIEW_DISTANCE) continue;
            visible.push([
                mob.id,
                Math.round(mob.x),
                Math.round(mob.y),
                mob.tier,
                Math.max(0, Math.round((mob.hp / mob.maxHp) * 100)),
                mob.ownerId === playerId ? 1 : 0,
            ]);
        }
        if (visible.length === 0 && !lastSentCount.get(playerId)) continue;
        lastSentCount.set(playerId, visible.length);
        state.io.to(playerId).emit('mobs', visible);
    }
    for (const playerId of lastSentCount.keys()) {
        if (!players[playerId]) lastSentCount.delete(playerId);
    }
}

function tickMobs(now = Date.now(), options = {}) {
    const spawn = options.spawn !== false;
    const dt = lastTickAt ? Math.max(0, Math.min(0.2, (now - lastTickAt) / 1000)) : 0.05;
    lastTickAt = now;

    for (const [id, mob] of mobs) {
        if (!isOwnerActive(players[mob.ownerId])) mobs.delete(id);
    }

    const byOwner = new Map();
    for (const mob of mobs.values()) {
        if (!byOwner.has(mob.ownerId)) byOwner.set(mob.ownerId, []);
        byOwner.get(mob.ownerId).push(mob);
    }

    for (const [ownerId, owner] of Object.entries(players)) {
        if (!isOwnerActive(owner) || owner.isUpgrading) continue;
        const ownerMobs = byOwner.get(ownerId) || [];
        if (spawn && ownerMobs.length < getMaxMobsForLevel(owner.level)
            && now - (lastSpawnAt.get(ownerId) || 0) >= MOB_SPAWN_INTERVAL_MS) {
            lastSpawnAt.set(ownerId, now);
            const mob = spawnMob(ownerId);
            if (mob) ownerMobs.push(mob);
        }
        if (ownerMobs.length === 0) continue;
        moveMobsForOwner(owner, ownerMobs, dt);
        applyContactDamage(ownerId, owner, ownerMobs, now);
    }

    updateXpOrbs(now);
    emitMobSnapshots();
    flushStats(now);
}

module.exports = {
    getMaxMobTier,
    pickMobTier,
    getMaxMobsForLevel,
    spawnMob,
    getMob,
    getMobsForOwner,
    clearMobsForOwner,
    clearAllMobs,
    damageMob,
    hitMobs,
    tickMobs,
};
