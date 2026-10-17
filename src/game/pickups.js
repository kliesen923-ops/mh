const state = require('./state');
const {
    HEAL_CROSS_MAX,
    HEAL_CROSS_SPAWN_DELAY_MS,
    HEAL_CROSS_LIFETIME_MS,
    HEAL_CROSS_BOUNDS,
    HEAL_CROSS_PICKUP_RADIUS,
    GIANT_POTION_MAX,
    GIANT_POTION_SPAWN_DELAY_MS,
    GIANT_POTION_LIFETIME_MS,
    GIANT_POTION_BOUNDS,
    GIANT_POTION_PICKUP_RADIUS,
    GIANT_POTION_DURATION_MS,
    GIANT_POTION_RECOVERY_STUN_MS,
} = require('../config');
const { createProjectileId } = require('../utils/geometry');
const { getMaxHpFromStats } = require('./stats');

const { players } = state;
let healingCrosses = [];
let giantPotions = [];
let nextHealSpawnAt = 0;
let nextGiantSpawnAt = 0;

function getHealingCrossList() {
    return healingCrosses;
}

function getGiantPotionList() {
    return giantPotions;
}

function emitHealingCrossUpdate() {
    state.io.emit('healingCrossUpdate', healingCrosses);
}

function emitGiantPotionUpdate() {
    state.io.emit('giantPotionUpdate', giantPotions);
}

function createPickup(prefix, bounds, lifetimeMs, now) {
    return {
        id: createProjectileId(prefix),
        x: bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin),
        y: bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin),
        createdAt: now,
        expiresAt: now + lifetimeMs,
    };
}

function canPickUp(p) {
    return Boolean(p && p.hp > 0 && !p.isSelectingLoadout && !p.isUpgrading);
}

// First player within reach of the pickup, if any.
function findCollector(pickup, radius) {
    for (const [id, p] of Object.entries(players)) {
        if (canPickUp(p) && Math.hypot(p.x - pickup.x, p.y - pickup.y) <= radius) return id;
    }
    return null;
}

function applyHealingCross(playerId) {
    const p = players[playerId];
    const maxHp = getMaxHpFromStats(p.stats);
    const amount = Math.min(Math.max(0, maxHp - p.hp), Math.max(1, Math.floor(maxHp * 0.3)));
    if (amount <= 0) return;
    p.hp = Math.min(maxHp, p.hp + amount);
    state.io.emit('healFloatingText', { playerId, amount, x: p.x, y: p.y });
    state.io.emit('statsUpdate', players);
}

function applyGiantPotion(playerId) {
    const p = players[playerId];
    p.giantActive = true;
    p.giantScale = 1.9;
    p.giantAttackMult = 2;
    p.giantEndsAt = Date.now() + GIANT_POTION_DURATION_MS;
    p.giantRecoveryEndsAt = 0;
    p.giantRecoveryArmed = false;
    state.io.emit('statsUpdate', players);
}

function updateHealingCrosses(now = Date.now()) {
    let changed = false;
    healingCrosses = healingCrosses.filter((cross) => {
        if (now >= cross.expiresAt) {
            changed = true;
            return false;
        }
        const collector = findCollector(cross, HEAL_CROSS_PICKUP_RADIUS);
        if (!collector) return true;
        applyHealingCross(collector);
        changed = true;
        return false;
    });
    if (healingCrosses.length < HEAL_CROSS_MAX && now >= nextHealSpawnAt) {
        healingCrosses.push(createPickup('heal', HEAL_CROSS_BOUNDS, HEAL_CROSS_LIFETIME_MS, now));
        nextHealSpawnAt = now + HEAL_CROSS_SPAWN_DELAY_MS;
        changed = true;
    }
    if (changed) emitHealingCrossUpdate();
}

function endGiantForm(id, p, now) {
    p.giantRecoveryArmed = true;
    p.giantActive = false;
    p.giantScale = 1;
    p.giantAttackMult = 1;
    p.giantRecoveryEndsAt = now + GIANT_POTION_RECOVERY_STUN_MS;
    const stunEndsAt = p.giantRecoveryEndsAt;
    p.isStunned = true;
    p.stunEndsAt = stunEndsAt;
    state.io.emit('playerStunned', { id, stunned: true, stunEndsAt, stunMs: GIANT_POTION_RECOVERY_STUN_MS });
    state.io.emit('statsUpdate', players);
    setTimeout(() => {
        const current = players[id];
        if (!current || !current.giantRecoveryArmed) return;
        if (Date.now() < (current.giantRecoveryEndsAt || 0)) return;
        current.isStunned = false;
        current.stunEndsAt = 0;
        current.giantRecoveryArmed = false;
        current.giantRecoveryEndsAt = 0;
        state.io.emit('playerStunned', { id, stunned: false, stunEndsAt: 0, stunMs: 0 });
        state.io.emit('statsUpdate', players);
    }, GIANT_POTION_RECOVERY_STUN_MS);
}

function updateGiantPotions(now = Date.now()) {
    let changed = false;
    giantPotions = giantPotions.filter((potion) => {
        if (now >= potion.expiresAt) {
            changed = true;
            return false;
        }
        const collector = findCollector(potion, GIANT_POTION_PICKUP_RADIUS);
        if (!collector) return true;
        applyGiantPotion(collector);
        changed = true;
        return false;
    });
    if (giantPotions.length < GIANT_POTION_MAX && now >= nextGiantSpawnAt) {
        giantPotions.push(createPickup('giant', GIANT_POTION_BOUNDS, GIANT_POTION_LIFETIME_MS, now));
        nextGiantSpawnAt = now + GIANT_POTION_SPAWN_DELAY_MS;
        changed = true;
    }
    if (changed) emitGiantPotionUpdate();
    for (const [id, p] of Object.entries(players)) {
        if (p && p.giantActive && !p.giantRecoveryArmed && now >= (p.giantEndsAt || 0)) endGiantForm(id, p, now);
    }
}

function startPickupLoops() {
    const now = Date.now();
    nextHealSpawnAt = now + 3000;
    nextGiantSpawnAt = now + 10000;
    return [
        setInterval(() => updateHealingCrosses(), 100),
        setInterval(() => updateGiantPotions(), 100),
    ];
}

function stopPickupLoops(intervals) {
    for (const interval of intervals || []) clearInterval(interval);
}

module.exports = {
    getHealingCrossList,
    getGiantPotionList,
    updateHealingCrosses,
    updateGiantPotions,
    startPickupLoops,
    stopPickupLoops,
};
