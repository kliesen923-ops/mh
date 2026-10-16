const { attackSequences, attackHitTargets } = require('./state');

function resetAttackHits(playerId) {
    attackSequences[playerId] = (attackSequences[playerId] || 0) + 1;
    attackHitTargets.set(`${playerId}:${attackSequences[playerId]}`, new Set());
}

function hasHitTargetThisAttack(playerId, targetId) {
    const key = `${playerId}:${attackSequences[playerId] || 0}`;
    let targets = attackHitTargets.get(key);
    if (!targets) {
        targets = new Set();
        attackHitTargets.set(key, targets);
    }
    if (targets.has(targetId)) return true;
    targets.add(targetId);
    return false;
}

function hasHitTargetForKey(key, targetId) {
    let targets = attackHitTargets.get(key);
    if (!targets) {
        targets = new Set();
        attackHitTargets.set(key, targets);
    }
    if (targets.has(targetId)) return true;
    targets.add(targetId);
    return false;
}

function clearPlayerHits(playerId) {
    delete attackSequences[playerId];
    for (const key of attackHitTargets.keys()) {
        if (key.startsWith(`${playerId}:`)) attackHitTargets.delete(key);
    }
}

module.exports = {
    resetAttackHits,
    hasHitTargetThisAttack,
    hasHitTargetForKey,
    clearPlayerHits,
};
