const { MOB_TIERS, MOB_LEVELS_PER_TIER, MOB_TIER_MIX } = require('../config');

function getMaxMobTier(level) {
    const current = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
    return Math.min(MOB_TIERS.length - 1, Math.floor((current - 1) / MOB_LEVELS_PER_TIER));
}

// Mostly the strongest unlocked tier, with some weaker ones mixed in.
function pickMobTier(level, roll = Math.random()) {
    const maxTier = getMaxMobTier(level);
    let threshold = 0;
    for (let offset = MOB_TIER_MIX.length - 1; offset > 0; offset--) {
        threshold += MOB_TIER_MIX[offset];
        if (roll < threshold) return Math.max(0, maxTier - offset);
    }
    return maxTier;
}

// Expected XP per kill for mobs spawned at this level.
function getAverageMobXp(level) {
    const maxTier = getMaxMobTier(level);
    return MOB_TIER_MIX.reduce((sum, chance, offset) => sum + chance * MOB_TIERS[Math.max(0, maxTier - offset)].xp, 0);
}

module.exports = { getMaxMobTier, pickMobTier, getAverageMobXp };
