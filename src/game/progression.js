const state = require('./state');
const { UPGRADE_SHIELD_MS } = require('../config');
const { markStatsDirty } = require('./sync');
const { getAverageMobXp } = require('./tiers');

// Scales with the XP that mobs at this level give, so each level takes a
// similar, slowly growing number of kills (about 7 early, 15 late).
function xpToNextLevel(level) {
    const current = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
    return Math.ceil(getAverageMobXp(current) * (6 + current * 0.3));
}

function createProgression() {
    return { xp: 0, totalXp: 0, xpToNext: xpToNextLevel(1) };
}

function resetProgression(player) {
    player.level = 1;
    Object.assign(player, createProgression());
}

// Adds XP and handles level-ups. Each level grants one upgrade pick.
function grantXp(playerId, amount) {
    const p = state.players[playerId];
    const value = Math.floor(Number(amount) || 0);
    if (!p || value <= 0) return 0;
    p.xp = (p.xp || 0) + value;
    p.totalXp = (p.totalXp || 0) + value;
    let levelsGained = 0;
    while (p.xp >= xpToNextLevel(p.level)) {
        p.xp -= xpToNextLevel(p.level);
        p.level += 1;
        levelsGained += 1;
    }
    p.xpToNext = xpToNextLevel(p.level);
    if (levelsGained > 0) {
        if (!p.isUpgrading) startUpgradeShield(playerId);
        p.isUpgrading = true;
        p.pendingUpgrades = (p.pendingUpgrades || 0) + levelsGained;
        state.io.to(playerId).emit('levelUp', { newLevel: p.level, count: levelsGained });
    }
    markStatsDirty();
    return levelsGained;
}

// Briefly protects a player from PvP while the upgrade menu is open.
function startUpgradeShield(playerId) {
    const p = state.players[playerId];
    if (!p) return;
    const token = (p.upgradeShieldToken || 0) + 1;
    p.upgradeShieldToken = token;
    p.upgradeShield = true;
    setTimeout(() => {
        const current = state.players[playerId];
        if (!current || current.upgradeShieldToken !== token || !current.upgradeShield) return;
        current.upgradeShield = false;
        markStatsDirty();
    }, UPGRADE_SHIELD_MS);
}

module.exports = {
    xpToNextLevel,
    createProgression,
    resetProgression,
    grantXp,
};
