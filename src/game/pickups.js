const state = require('./state');
const {
    HEAL_CROSS_SPAWN_DELAY_MS,
    HEAL_CROSS_LIFETIME_MS,
    HEAL_CROSS_BOUNDS,
    HEAL_CROSS_PICKUP_RADIUS,
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
let healingCross = null;
let healingCrossTimer = null;
let giantPotion = null;
let giantPotionTimer = null;

function getHealingCrossList() {
    return healingCross ? [healingCross] : [];
}

function getGiantPotionList() {
    return giantPotion ? [giantPotion] : [];
}

function emitHealingCrossUpdate() {
    state.io.emit('healingCrossUpdate', healingCross ? [healingCross] : []);
}

function emitGiantPotionUpdate() {
    state.io.emit('giantPotionUpdate', giantPotion ? [giantPotion] : []);
}

function spawnHealingCross() {
    healingCrossTimer = null;
    healingCross = {
        id: createProjectileId('heal'),
        x: HEAL_CROSS_BOUNDS.xMin + Math.random() * (HEAL_CROSS_BOUNDS.xMax - HEAL_CROSS_BOUNDS.xMin),
        y: HEAL_CROSS_BOUNDS.yMin + Math.random() * (HEAL_CROSS_BOUNDS.yMax - HEAL_CROSS_BOUNDS.yMin),
        createdAt: Date.now(),
        expiresAt: Date.now() + HEAL_CROSS_LIFETIME_MS,
    };
    emitHealingCrossUpdate();
}

function scheduleNextHealingCross(delayMs = HEAL_CROSS_SPAWN_DELAY_MS) {
    if (healingCrossTimer) clearTimeout(healingCrossTimer);
    healingCrossTimer = setTimeout(spawnHealingCross, delayMs);
}

function clearHealingCross(scheduleNext = true) {
    healingCross = null;
    emitHealingCrossUpdate();
    if (scheduleNext) scheduleNextHealingCross();
}

function spawnGiantPotion() {
    giantPotionTimer = null;
    giantPotion = {
        id: createProjectileId('giant'),
        x: GIANT_POTION_BOUNDS.xMin + Math.random() * (GIANT_POTION_BOUNDS.xMax - GIANT_POTION_BOUNDS.xMin),
        y: GIANT_POTION_BOUNDS.yMin + Math.random() * (GIANT_POTION_BOUNDS.yMax - GIANT_POTION_BOUNDS.yMin),
        createdAt: Date.now(),
        expiresAt: Date.now() + GIANT_POTION_LIFETIME_MS,
    };
    emitGiantPotionUpdate();
}

function scheduleNextGiantPotion(delayMs = GIANT_POTION_SPAWN_DELAY_MS) {
    if (giantPotionTimer) clearTimeout(giantPotionTimer);
    giantPotionTimer = setTimeout(spawnGiantPotion, delayMs);
}

function clearGiantPotion(scheduleNext = true) {
    giantPotion = null;
    emitGiantPotionUpdate();
    if (scheduleNext) scheduleNextGiantPotion();
}

function endGiantPotion(playerId) {
    const p = players[playerId];
    if (!p || !p.giantActive) return;
    p.giantActive = false;
    p.giantScale = 1;
    p.giantAttackMult = 1;
    p.giantEndsAt = 0;
    p.giantRecoveryEndsAt = 0;
    p.giantRecoveryArmed = false;
    state.io.emit('statsUpdate', players);
    const stunEndsAt = Date.now() + GIANT_POTION_RECOVERY_STUN_MS;
    p.isStunned = true;
    p.stunEndsAt = stunEndsAt;
    state.io.emit('playerStunned', { id: playerId, stunned: true, stunEndsAt, stunMs: GIANT_POTION_RECOVERY_STUN_MS });
    setTimeout(() => {
        const current = players[playerId];
        if (!current) return;
        current.isStunned = false;
        current.stunEndsAt = 0;
        state.io.emit('playerStunned', { id: playerId, stunned: false, stunEndsAt: 0, stunMs: 0 });
        state.io.emit('statsUpdate', players);
    }, GIANT_POTION_RECOVERY_STUN_MS);
}

function pickupGiantPotion(playerId) {
    const p = players[playerId];
    if (!p || !giantPotion || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) return;
    const distance = Math.hypot(p.x - giantPotion.x, p.y - giantPotion.y);
    if (distance > GIANT_POTION_PICKUP_RADIUS) return;
    p.giantActive = true;
    p.giantScale = 1.9;
    p.giantAttackMult = 2;
    p.giantEndsAt = Date.now() + GIANT_POTION_DURATION_MS;
    p.giantRecoveryEndsAt = 0;
    p.giantRecoveryArmed = false;
    state.io.emit('statsUpdate', players);
    clearGiantPotion(true);
}

function updateGiantPotions() {
    const now = Date.now();
    if (giantPotion && now >= giantPotion.expiresAt) {
        clearGiantPotion(true);
    }
    if (giantPotion) {
        for (const [id, p] of Object.entries(players)) {
            if (!p || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) continue;
            if (Math.hypot(p.x - giantPotion.x, p.y - giantPotion.y) <= GIANT_POTION_PICKUP_RADIUS) {
                pickupGiantPotion(id);
                return;
            }
        }
    }
    for (const [id, p] of Object.entries(players)) {
        if (!p || !p.giantActive) continue;
        if (!p.giantRecoveryArmed && now >= (p.giantEndsAt || 0)) {
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
    }
}

function pickupHealingCross(playerId) {
    const p = players[playerId];
    if (!p || !healingCross || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) return;
    const distance = Math.hypot(p.x - healingCross.x, p.y - healingCross.y);
    if (distance > HEAL_CROSS_PICKUP_RADIUS) return;
    const maxHp = getMaxHpFromStats(p.stats);
    const amount = Math.min(Math.max(0, maxHp - p.hp), Math.max(1, Math.floor(maxHp * 0.3)));
    if (amount <= 0) {
        clearHealingCross(true);
        return;
    }
    p.hp = Math.min(maxHp, p.hp + amount);
    state.io.emit('healFloatingText', { playerId, amount, x: p.x, y: p.y });
    state.io.emit('statsUpdate', players);
    clearHealingCross(true);
}

function updateHealingCrosses() {
    if (!healingCross) return;
    if (Date.now() >= healingCross.expiresAt) {
        clearHealingCross(true);
        return;
    }
    for (const [id, p] of Object.entries(players)) {
        if (!p || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) continue;
        if (Math.hypot(p.x - healingCross.x, p.y - healingCross.y) <= HEAL_CROSS_PICKUP_RADIUS) {
            pickupHealingCross(id);
            return;
        }
    }
}

function startPickupLoops() {
    scheduleNextHealingCross(8000);
    scheduleNextGiantPotion(12000);
    return [
        setInterval(updateHealingCrosses, 100),
        setInterval(updateGiantPotions, 100),
    ];
}

function stopPickupLoops(intervals) {
    for (const interval of intervals || []) clearInterval(interval);
    if (healingCrossTimer) clearTimeout(healingCrossTimer);
    if (giantPotionTimer) clearTimeout(giantPotionTimer);
    healingCrossTimer = null;
    giantPotionTimer = null;
}

module.exports = {
    getHealingCrossList,
    getGiantPotionList,
    startPickupLoops,
    stopPickupLoops,
};
