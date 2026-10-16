const state = require('./state');
const {
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    XP_ORB_LIFETIME_MS,
    XP_ORB_PICKUP_RADIUS,
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

function emitXpOrbs() {
    state.io.emit('xpOrbs', orbs);
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
        const orb = {
            id: createProjectileId('xp'),
            x: Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, x + Math.cos(angle) * distance)),
            y: Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, y + Math.sin(angle) * distance)),
            value: base + (i < remainder ? 1 : 0),
            expiresAt: now + XP_ORB_LIFETIME_MS,
        };
        if (orb.value > 0) created.push(orb);
    }
    orbs = orbs.concat(created);
    emitXpOrbs();
    return created;
}

function updateXpOrbs(now = Date.now()) {
    if (orbs.length === 0) return;
    let changed = false;
    orbs = orbs.filter((orb) => {
        if (now >= orb.expiresAt) {
            changed = true;
            return false;
        }
        for (const [id, p] of Object.entries(players)) {
            if (!p || p.hp <= 0 || p.isSelectingLoadout) continue;
            const reach = XP_ORB_PICKUP_RADIUS * Math.max(1, p.giantScale || 1);
            if (Math.hypot(p.x - orb.x, p.y - orb.y) <= reach) {
                grantXp(id, orb.value);
                changed = true;
                return false;
            }
        }
        return true;
    });
    if (changed) emitXpOrbs();
}

function clearXpOrbs() {
    orbs = [];
}

module.exports = {
    getXpOrbList,
    scatterXp,
    updateXpOrbs,
    clearXpOrbs,
};
