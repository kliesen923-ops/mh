const state = require('./state');
const { markStatsDirty } = require('./sync');

function xpToNextLevel(level) {
    const current = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
    return 4 + current * 3;
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
        p.isUpgrading = true;
        p.pendingUpgrades = (p.pendingUpgrades || 0) + levelsGained;
        state.io.to(playerId).emit('levelUp', { newLevel: p.level, count: levelsGained });
    }
    markStatsDirty();
    return levelsGained;
}

module.exports = {
    xpToNextLevel,
    createProgression,
    resetProgression,
    grantXp,
};
