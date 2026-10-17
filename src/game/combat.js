const state = require('./state');
const { JUST_GUARD_WINDOW_MS, SWORD_JUST_GUARD_WINDOW_MS } = require('../config');
const { isGuardActive } = require('./defense');
const { sanitizeWeapon } = require('../utils/sanitize');
const { getAngleDiff, createProjectileId, randomWorldPoint } = require('../utils/geometry');
const { GAME_WIDTH, GAME_HEIGHT } = require('../config');
const { updateAccountScore } = require('../db');
const { recordRun } = require('../records');
const {
    createBaseStatsForWeapon,
    getWeaponAttackProfile,
    getMaxHpFromStats,
    getAttackRangeMultiplier,
    createUpgradeCounts,
    createDefaultGearRush,
    clearUltimateState,
} = require('./stats');
const { resetProgression } = require('./progression');
const { scatterXp } = require('./xpOrbs');

const { players } = state;

// True while the target is inside the just-guard window of a guard it just raised.
function isJustGuarding(target, now = Date.now()) {
    if (!isGuardActive(target, now)) return false;
    const windowMs = sanitizeWeapon(target.weapon) === 'sword' ? SWORD_JUST_GUARD_WINDOW_MS : JUST_GUARD_WINDOW_MS;
    return (now - (target.guardStartTime || 0)) < windowMs;
}

// Moves a player on the server's say-so (pulls, teleports); the client snaps to it.
function forcePlayerPosition(id, x, y) {
    const p = players[id];
    if (!p) return;
    p.x = Math.max(25, Math.min(GAME_WIDTH - 25, x));
    p.y = Math.max(25, Math.min(GAME_HEIGHT - 25, y));
    p.lastMoveAt = Date.now();
    state.io.emit('playerMoved', { id, x: p.x, y: p.y, angle: p.angle, forced: true });
}

// Hit from an area or projectile: guarding while facing the source halves it.
function damagePlayerFrom(attackerId, targetId, amount, fromX, fromY, effectWeapon) {
    const target = players[targetId];
    if (!target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) return false;
    const angleToSource = Math.atan2(fromY - target.y, fromX - target.x);
    let damage = Math.max(1, Math.floor(amount));
    if (isGuardActive(target) && getAngleDiff(target.angle, angleToSource) < Math.PI / 3) damage = Math.max(1, Math.floor(damage * 0.5));
    target.hp -= damage;
    state.io.emit('combatEffect', { x: target.x, y: target.y, angle: angleToSource + Math.PI, weapon: effectWeapon, damage });
    if (target.hp <= 0) resolveKill(attackerId, targetId);
    return true;
}

// Stuns a player for ms unless they are already stunned.
function stunPlayer(id, ms) {
    const p = players[id];
    if (!p || p.isStunned || p.hp <= 0) return;
    const stunEndsAt = Date.now() + ms;
    p.isStunned = true;
    p.isAttacking = false;
    state.io.emit('playerStunned', { id, stunned: true, stunEndsAt, stunMs: ms });
    setTimeout(() => {
        if (players[id] && players[id].isStunned) {
            players[id].isStunned = false;
            state.io.emit('playerStunned', { id, stunned: false, stunEndsAt: 0 });
        }
    }, ms);
}

// attackerId is null when the victim was killed by their own mobs.
function resolveKill(attackerId, targetId) {
    const attacker = attackerId ? players[attackerId] : null;
    const target = players[targetId];
    if (!target || (attackerId && !attacker)) return;
    target.hp = 0;
    target.deaths++;
    updateAccountScore(target.accountId, 'deaths', 1);
    // Sent before the stats reset so the victim's death screen shows this life's record.
    const summary = {
        killerName: attacker ? attacker.name : null,
        survivedMs: target.lifeStartedAt ? Math.max(0, Date.now() - target.lifeStartedAt) : 0,
        level: target.level,
        totalXp: target.totalXp || 0,
        mobKills: target.lifeMobKills || 0,
        playerKills: target.lifePlayerKills || 0,
    };
    state.io.to(targetId).emit('deathSummary', summary);
    recordRun({ accountId: target.accountId, name: target.name, ...summary })
        .then((records) => state.io.to(targetId).emit('deathRecords', records))
        .catch((error) => console.error('Failed to save record:', error.message));
    target.lifeStartedAt = 0;
    target.lifeMobKills = 0;
    target.lifePlayerKills = 0;
    if (attacker) {
        attacker.lifePlayerKills = (attacker.lifePlayerKills || 0) + 1;
        attacker.kills++;
        updateAccountScore(attacker.accountId, 'kills', 1);
        attacker.hp = Math.min(getMaxHpFromStats(attacker.stats), attacker.hp + Math.floor(getMaxHpFromStats(attacker.stats) * 0.5));
    }
    scatterXp(target.x, target.y, target.totalXp);
    resetProgression(target);
    target.stats = createBaseStatsForWeapon(target.weapon);
    target.upgradeCounts = createUpgradeCounts();
    target.pendingUpgrades = 0;
    target.isUpgrading = false;
    target.upgradeShield = false;
    target.isSelectingLoadout = true;
    clearUltimateState(target);
    target.gearRush = createDefaultGearRush();
    target.giantActive = false;
    target.giantScale = 1;
    target.giantAttackMult = 1;
    target.giantEndsAt = 0;
    target.giantRecoveryEndsAt = 0;
    target.giantRecoveryArmed = false;
    state.io.emit('playerDied', { victimId: targetId, attackerId: attackerId || null });
    setTimeout(() => {
        if (players[targetId]) {
            const spawn = randomWorldPoint();
            players[targetId].hp = getMaxHpFromStats(players[targetId].stats);
            players[targetId].x = spawn.x;
            players[targetId].y = spawn.y;
            players[targetId].isStunned = false;
            players[targetId].isGuarding = false;
            players[targetId].gearRush = createDefaultGearRush();
            clearUltimateState(players[targetId]);
            players[targetId].giantActive = false;
            players[targetId].giantScale = 1;
            players[targetId].giantAttackMult = 1;
            players[targetId].giantEndsAt = 0;
            players[targetId].giantRecoveryEndsAt = 0;
            players[targetId].giantRecoveryArmed = false;
            state.io.emit('playerRespawn', players[targetId]);
        }
    }, 3000);
}

function shouldReflectFromSpearUltimate(finalTarget, projectileStartX, projectileStartY) {
    if (!finalTarget || !finalTarget.ultimate || !finalTarget.ultimate.active || finalTarget.ultimate.type !== 'spear') return false;
    if (Date.now() >= Number(finalTarget.ultimate.endsAt || 0)) return false;
    const radius = Math.max(120, Number(finalTarget.ultimate.radius) || 180);
    return Math.hypot(projectileStartX - finalTarget.x, projectileStartY - finalTarget.y) > radius;
}

module.exports = {
    isJustGuarding,
    forcePlayerPosition,
    damagePlayerFrom,
    stunPlayer,
    resolveKill,
    shouldReflectFromSpearUltimate,
};
