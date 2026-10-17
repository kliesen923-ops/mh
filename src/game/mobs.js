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
    BOSS,
} = require('../config');
const { getAngleDiff } = require('../utils/geometry');
const { hasHitTargetForKey } = require('./hits');
const { getMaxMobTier, pickMobTier } = require('./tiers');
const { getMaxHpFromStats } = require('./stats');
const { updateXpOrbs, dropXpOrb, scatterXp } = require('./xpOrbs');
const { markStatsDirty, flushStats } = require('./sync');
const { isGuardActive, isDodgeActive } = require('./defense');

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

function isBoss(mob) {
    return Boolean(mob && mob.kind === 'boss');
}

function spawnBoss(ownerId, options = {}) {
    const owner = players[ownerId];
    if (!owner) return null;
    const position = Number.isFinite(options.x) && Number.isFinite(options.y) ? { x: options.x, y: options.y } : pickSpawnPoint(owner);
    if (!position) return null;
    const level = Math.max(1, owner.level || 1);
    const hp = BOSS.hpBase + level * BOSS.hpPerLevel;
    const mob = {
        id: nextMobId++,
        ownerId,
        kind: 'boss',
        tier: MOB_TIERS.length - 1,
        level,
        x: position.x,
        y: position.y,
        hp,
        maxHp: hp,
        speed: BOSS.speed,
        damage: BOSS.contactDamageBase + level,
        slamDamage: Math.round(BOSS.slamDamageBase + level * 1.5),
        xp: BOSS.xpBase + level * BOSS.xpPerLevel,
        radius: BOSS.radius,
        lastContactAt: 0,
        nextSlamAt: Date.now() + 2500,
        slamAt: 0,
    };
    mobs.set(mob.id, mob);
    state.io.emit('bossSpawned', { id: mob.id, ownerId, ownerName: owner.name, level });
    return mob;
}

// Starts a telegraphed slam when the owner is close, and lands it after the windup.
function updateBoss(boss, ownerId, owner, now) {
    if (boss.slamAt && now >= boss.slamAt) {
        boss.slamAt = 0;
        boss.nextSlamAt = now + BOSS.slamCooldownMs;
        state.io.emit('bossSlamHit', { id: boss.id, x: boss.x, y: boss.y, radius: BOSS.slamRadius });
        if (isDodgeActive(owner) || Math.hypot(owner.x - boss.x, owner.y - boss.y) > BOSS.slamRadius) return false;
        let damage = boss.slamDamage;
        if (isGuardActive(owner) && getAngleDiff(owner.angle, Math.atan2(boss.y - owner.y, boss.x - owner.x)) < Math.PI / 3) damage = Math.floor(damage * 0.5);
        owner.hp -= damage;
        state.io.to(ownerId).emit('mobDamage', { amount: damage });
        markStatsDirty();
        if (owner.hp <= 0) {
            const { resolveKill } = require('./combat');
            resolveKill(null, ownerId);
            return true;
        }
        return false;
    }
    if (!boss.slamAt && now >= boss.nextSlamAt && Math.hypot(owner.x - boss.x, owner.y - boss.y) <= BOSS.slamTriggerDistance) {
        boss.slamAt = now + BOSS.slamWindupMs;
        state.io.emit('bossSlam', { id: boss.id, x: boss.x, y: boss.y, radius: BOSS.slamRadius, windupMs: BOSS.slamWindupMs });
    }
    return false;
}

function getMob(mobId) {
    return mobs.get(Number(mobId));
}

function getMobList() {
    return [...mobs.values()];
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

function isUltimateActive(p) {
    return Boolean(p && p.ultimate && p.ultimate.active);
}

function isMobStunned(mob, now = Date.now()) {
    return (mob.stunUntil || 0) > now;
}

// Pushes a mob away from (fromX, fromY) and/or stuns it.
function applyMobImpact(mob, impact, now = Date.now()) {
    if (!impact || isBoss(mob)) return;
    const knockback = Number(impact.knockback) || 0;
    if (knockback !== 0 && Number.isFinite(impact.fromX) && Number.isFinite(impact.fromY)) {
        const dx = mob.x - impact.fromX;
        const dy = mob.y - impact.fromY;
        const distance = Math.hypot(dx, dy) || 1;
        // A negative knockback pulls the mob in, stopping just short of the attacker.
        const move = knockback > 0 ? knockback : -Math.min(-knockback, Math.max(0, distance - mob.radius - PLAYER_BODY_RADIUS));
        mob.x = clampToWorld(mob.x + (dx / distance) * move, GAME_WIDTH);
        mob.y = clampToWorld(mob.y + (dy / distance) * move, GAME_HEIGHT);
    }
    const stunMs = Number(impact.stunMs) || 0;
    if (stunMs > 0) mob.stunUntil = Math.max(mob.stunUntil || 0, now + stunMs);
}

// Any player can damage any mob. A killed mob drops its XP as an orb anyone can pick up.
function damageMob(mobId, attackerId, damage, angle, impact = null) {
    const mob = getMob(mobId);
    const attacker = players[attackerId];
    const amount = Math.max(1, Math.floor(Number(damage) || 0));
    if (!mob || !attacker) return false;
    mob.hp -= amount;
    if (mob.hp <= 0) {
        mobs.delete(mob.id);
        attacker.lifeMobKills = (attacker.lifeMobKills || 0) + 1;
        // Small heal per kill so long fights are survivable without pickups; bosses heal more.
        const maxHp = getMaxHpFromStats(attacker.stats);
        const heal = isBoss(mob) ? Math.floor(maxHp * BOSS.killHealRatio) : 1 + mob.tier;
        if (attacker.hp > 0) attacker.hp = Math.min(maxHp, attacker.hp + heal);
        state.io.emit('mobKilled', { id: mob.id, x: mob.x, y: mob.y, tier: mob.tier, killerId: attackerId, damage: amount, ultimate: isUltimateActive(attacker), boss: isBoss(mob) });
        if (isBoss(mob)) {
            scatterXp(mob.x, mob.y, mob.xp);
            state.io.emit('bossDefeated', { id: mob.id, ownerId: mob.ownerId, killerId: attackerId, killerName: attacker.name });
        } else {
            dropXpOrb(mob.x, mob.y, mob.xp, attacker.weapon === 'bow' ? attackerId : null);
        }
    } else {
        applyMobImpact(mob, impact);
        state.io.emit('mobDamaged', { id: mob.id, x: mob.x, y: mob.y, angle: Number.isFinite(angle) ? angle : 0, weapon: attacker.weapon || 'sword', damage: amount, ultimate: isUltimateActive(attacker) });
    }
    return true;
}

// Damages every mob passing `test`. `hitKey` prevents hitting the same mob twice with one attack.
function hitMobs(attackerId, test, damage, angle, hitKey, impact = null) {
    let hits = 0;
    for (const mob of [...mobs.values()]) {
        if (!test(mob)) continue;
        if (hitKey && hasHitTargetForKey(hitKey, `mob:${mob.id}`)) continue;
        damageMob(mob.id, attackerId, damage, angle, impact);
        hits++;
    }
    return hits;
}

function moveMobsForOwner(owner, ownerMobs, dt, now) {
    for (const mob of ownerMobs) {
        // Stunned mobs and bosses winding up a slam hold still.
        if (isMobStunned(mob, now) || mob.slamAt) continue;
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
    if (isDodgeActive(owner)) return false;
    const contactRange = PLAYER_BODY_RADIUS * Math.max(1, owner.giantScale || 1);
    for (const mob of ownerMobs) {
        if (now - mob.lastContactAt < MOB_CONTACT_COOLDOWN_MS || isMobStunned(mob, now)) continue;
        if (Math.hypot(owner.x - mob.x, owner.y - mob.y) > mob.radius + contactRange) continue;
        mob.lastContactAt = now;
        let damage = mob.damage;
        const angleToMob = Math.atan2(mob.y - owner.y, mob.x - owner.x);
        if (isGuardActive(owner) && getAngleDiff(owner.angle, angleToMob) < Math.PI / 3) damage = Math.floor(damage * 0.5);
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
                isMobStunned(mob) ? 1 : 0,
                isBoss(mob) ? 1 : 0,
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

// Spear ultimate: a barrier that keeps every mob outside its radius.
function pushMobsFromBarriers(now) {
    for (const p of Object.values(players)) {
        const ult = p && p.ultimate;
        if (!ult || !ult.active || ult.type !== 'spear' || p.hp <= 0 || now >= (ult.endsAt || 0)) continue;
        const radius = ult.radius || 180;
        for (const mob of mobs.values()) {
            if (isBoss(mob)) continue;
            const dx = mob.x - p.x;
            const dy = mob.y - p.y;
            const distance = Math.hypot(dx, dy) || 0.01;
            const edge = radius + mob.radius;
            if (distance >= edge) continue;
            mob.x = clampToWorld(p.x + (dx / distance) * edge, GAME_WIDTH);
            mob.y = clampToWorld(p.y + (dy / distance) * edge, GAME_HEIGHT);
        }
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

    const active = [];
    for (const [ownerId, owner] of Object.entries(players)) {
        if (!isOwnerActive(owner) || owner.isUpgrading) continue;
        const ownerMobs = byOwner.get(ownerId) || [];
        if (owner.pendingBoss && !ownerMobs.some(isBoss)) {
            const boss = spawnBoss(ownerId);
            if (boss) {
                owner.pendingBoss = false;
                ownerMobs.push(boss);
            }
        }
        if (spawn && ownerMobs.length < getMaxMobsForLevel(owner.level)
            && now - (lastSpawnAt.get(ownerId) || 0) >= MOB_SPAWN_INTERVAL_MS) {
            lastSpawnAt.set(ownerId, now);
            const mob = spawnMob(ownerId);
            if (mob) ownerMobs.push(mob);
        }
        if (ownerMobs.length === 0) continue;
        moveMobsForOwner(owner, ownerMobs, dt, now);
        active.push([ownerId, owner, ownerMobs]);
    }
    pushMobsFromBarriers(now);
    for (const [ownerId, owner, ownerMobs] of active) {
        if (applyContactDamage(ownerId, owner, ownerMobs, now)) continue;
        for (const mob of ownerMobs) {
            if (isBoss(mob) && updateBoss(mob, ownerId, owner, now)) break;
        }
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
    getMobList,
    getMobsForOwner,
    clearMobsForOwner,
    clearAllMobs,
    damageMob,
    isMobStunned,
    isBoss,
    spawnBoss,
    hitMobs,
    tickMobs,
};
