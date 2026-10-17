const state = require('./state');
const {
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    XP_ORB_LIFETIME_MS,
    XP_ORB_PICKUP_RADIUS,
    XP_ORB_MAX_TOTAL,
    BOW_XP_MAGNET_RANGE,
    XP_ORB_SCATTER_RADIUS,
    XP_ORB_MAX_COUNT_PER_DEATH,
} = require('../config');
const { createProjectileId } = require('../utils/geometry');
const { grantXp } = require('./progression');

const { players } = state;
let orbs = [];

function getXpOrbList() {
    return orbs;
}

function createOrb(x, y, value, now, magnetTo = null) {
    return {
        id: createProjectileId('xp'),
        x: Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, x)),
        y: Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, y)),
        value,
        expiresAt: now + XP_ORB_LIFETIME_MS,
        magnetTo,
    };
}

// Orbs change often (every mob kill), so clients get deltas rather than the full list.
function addOrbs(created) {
    if (created.length === 0) return;
    orbs = orbs.concat(created);
    state.io.emit('xpOrbsAdded', created);
    if (orbs.length > XP_ORB_MAX_TOTAL) {
        const dropped = orbs.splice(0, orbs.length - XP_ORB_MAX_TOTAL);
        state.io.emit('xpOrbsRemoved', dropped.map((orb) => ({ id: orb.id })));
    }
}

// A killed mob leaves its XP on the ground. `magnetTo` (a bow kill's archer) pulls it
// to that player from up to BOW_XP_MAGNET_RANGE away.
function dropXpOrb(x, y, value, magnetTo = null, now = Date.now()) {
    const amount = Math.floor(Number(value) || 0);
    if (amount <= 0) return null;
    const orb = createOrb(x, y, amount, now, magnetTo);
    addOrbs([orb]);
    return orb;
}

// Drops a dead player's XP as orbs spread around where they died.
function scatterXp(x, y, totalXp, now = Date.now()) {
    const total = Math.floor(Number(totalXp) || 0);
    if (total <= 0) return [];
    const count = Math.min(XP_ORB_MAX_COUNT_PER_DEATH, Math.max(1, Math.ceil(total / 3)));
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    const created = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = XP_ORB_SCATTER_RADIUS.min + Math.random() * (XP_ORB_SCATTER_RADIUS.max - XP_ORB_SCATTER_RADIUS.min);
        const value = base + (i < remainder ? 1 : 0);
        if (value > 0) created.push(createOrb(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, value, now));
    }
    addOrbs(created);
    return created;
}

function updateXpOrbs(now = Date.now()) {
    if (orbs.length === 0) return;
    const removed = [];
    orbs = orbs.filter((orb) => {
        if (now >= orb.expiresAt) {
            removed.push({ id: orb.id });
            return false;
        }
        for (const [id, p] of Object.entries(players)) {
            if (!p || p.hp <= 0 || p.isSelectingLoadout) continue;
            const reach = orb.magnetTo === id ? BOW_XP_MAGNET_RANGE : XP_ORB_PICKUP_RADIUS * Math.max(1, p.giantScale || 1);
            if (Math.abs(p.x - orb.x) > reach || Math.abs(p.y - orb.y) > reach) continue;
            if (Math.hypot(p.x - orb.x, p.y - orb.y) <= reach) {
                grantXp(id, orb.value);
                removed.push({ id: orb.id, by: id, value: orb.value });
                return false;
            }
        }
        return true;
    });
    if (removed.length > 0) state.io.emit('xpOrbsRemoved', removed);
}

function clearXpOrbs() {
    orbs = [];
}

module.exports = {
    getXpOrbList,
    dropXpOrb,
    scatterXp,
    updateXpOrbs,
    clearXpOrbs,
};
