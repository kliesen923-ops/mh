const state = require('./state');
const { JUST_GUARD_WINDOW_MS } = require('../config');
const { getAngleDiff, createProjectileId } = require('../utils/geometry');
const { updateAccountScore } = require('../db');
const {
    createBaseStatsForWeapon,
    getWeaponAttackProfile,
    getMaxHpFromStats,
    getAttackRangeMultiplier,
    createUpgradeCounts,
    createDefaultGearRush,
    clearUltimateState,
    getKillLevelGain,
} = require('./stats');

const { players } = state;

function resolveKill(attackerId, targetId) {
    const attacker = players[attackerId];
    const target = players[targetId];
    if (!attacker || !target) return;
    target.hp = 0;
    target.deaths++;
    attacker.kills++;
    updateAccountScore(attacker.accountId, 'kills', 1);
    updateAccountScore(target.accountId, 'deaths', 1);
    const levelsGained = getKillLevelGain(target.level);
    attacker.level += levelsGained;
    attacker.hp = Math.min(getMaxHpFromStats(attacker.stats), attacker.hp + Math.floor(getMaxHpFromStats(attacker.stats) * 0.5));
    attacker.isUpgrading = true;
    attacker.pendingUpgrades += levelsGained;
    target.level = 1;
    target.stats = createBaseStatsForWeapon(target.weapon);
    target.upgradeCounts = createUpgradeCounts();
    target.pendingUpgrades = 0;
    target.isUpgrading = false;
    target.isSelectingLoadout = true;
    clearUltimateState(target);
    target.gearRush = createDefaultGearRush();
    target.giantActive = false;
    target.giantScale = 1;
    target.giantAttackMult = 1;
    target.giantEndsAt = 0;
    target.giantRecoveryEndsAt = 0;
    target.giantRecoveryArmed = false;
    state.io.emit('playerDied', { victimId: targetId, attackerId });
    if (levelsGained > 0) state.io.to(attackerId).emit('levelUp', { newLevel: attacker.level, count: levelsGained });
    setTimeout(() => {
        if (players[targetId]) {
            players[targetId].hp = getMaxHpFromStats(players[targetId].stats);
            players[targetId].x = 100 + Math.random() * 800;
            players[targetId].y = 100 + Math.random() * 500;
            players[targetId].isStunned = false;
            players[targetId].isGuarding = false;
            players[targetId].isSelectingLoadout = true;
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

function applyBowImpact(attackerId, targetId, payload, reflected) {
    const finalAttacker = players[attackerId];
    const finalTarget = players[targetId];
    if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout) return;

    const now = Date.now();
    const startX = Number.isFinite(payload.startX) ? payload.startX : finalAttacker.x;
    const startY = Number.isFinite(payload.startY) ? payload.startY : finalAttacker.y;
    const endX = Number.isFinite(payload.endX) ? payload.endX : finalTarget.x;
    const endY = Number.isFinite(payload.endY) ? payload.endY : finalTarget.y;
    const projectileId = String(payload.projectileId || createProjectileId('bow'));
    const attackRange = getWeaponAttackProfile(finalAttacker.weapon).reach * (finalAttacker.stats && Number.isFinite(finalAttacker.stats.range) ? finalAttacker.stats.range : 1) * getAttackRangeMultiplier(finalAttacker);
    if (Math.hypot(finalTarget.x - endX, finalTarget.y - endY) > 26) return;

    const angle = Number.isFinite(payload.angle) ? payload.angle : Math.atan2(endY - startY, endX - startX);
    const angleToAttacker = Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x);
    const isFacingAttacker = getAngleDiff(finalTarget.angle, angleToAttacker) < (Math.PI / 3);
    let damage = Math.floor(11 * (finalAttacker.stats && Number.isFinite(finalAttacker.stats.dmg) ? finalAttacker.stats.dmg : 1));
    if (shouldReflectFromSpearUltimate(finalTarget, startX, startY) && !reflected) {
        const reflectedId = createProjectileId('bowr');
        const reflectedPayload = {
            projectileId: reflectedId,
            startX: finalTarget.x,
            startY: finalTarget.y,
            endX: finalAttacker.x,
            endY: finalAttacker.y,
            angle: Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x),
            maxDistance: Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y)),
        };
        state.io.emit('bowProjectileResolved', { projectileId });
        state.io.emit('bowProjectile', {
            projectileId: reflectedId,
            originId: targetId,
            startX: reflectedPayload.startX,
            startY: reflectedPayload.startY,
            endX: reflectedPayload.endX,
            endY: reflectedPayload.endY,
            angle: reflectedPayload.angle,
            reflected: true,
            duration: Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))),
        });
        setTimeout(() => applyBowImpact(targetId, attackerId, reflectedPayload, true), Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))));
        return;
    }
    if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < JUST_GUARD_WINDOW_MS && !reflected) {
        const reflectedId = createProjectileId('bowr');
        const reflectedPayload = {
            projectileId: reflectedId,
            startX: finalTarget.x,
            startY: finalTarget.y,
            endX: finalAttacker.x,
            endY: finalAttacker.y,
            angle: Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x),
            maxDistance: Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y)),
        };
        state.io.emit('bowProjectileResolved', { projectileId });
        state.io.emit('bowProjectile', {
            projectileId: reflectedId,
            originId: targetId,
            startX: reflectedPayload.startX,
            startY: reflectedPayload.startY,
            endX: reflectedPayload.endX,
            endY: reflectedPayload.endY,
            angle: reflectedPayload.angle,
            reflected: true,
            duration: Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))),
        });
        setTimeout(() => applyBowImpact(targetId, attackerId, reflectedPayload, true), Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))));
        return;
    }

    if (finalTarget.isGuarding && isFacingAttacker) {
        damage = Math.floor(damage * 0.5);
    }

    state.io.emit('bowProjectileResolved', { projectileId });
    state.io.emit('combatEffect', {
        x: finalTarget.x,
        y: finalTarget.y,
        angle,
        weapon: 'bow',
    });
    finalTarget.hp -= damage;
    if (finalTarget.hp <= 0) {
        finalTarget.hp = 0;
        finalTarget.deaths++;
        finalAttacker.kills++;
        updateAccountScore(finalAttacker.accountId, 'kills', 1);
        updateAccountScore(finalTarget.accountId, 'deaths', 1);
        const levelsGained = getKillLevelGain(finalTarget.level);
        finalAttacker.level += levelsGained;
        finalAttacker.hp = Math.min(getMaxHpFromStats(finalAttacker.stats), finalAttacker.hp + Math.floor(getMaxHpFromStats(finalAttacker.stats) * 0.5));
        finalAttacker.isUpgrading = true;
        finalAttacker.pendingUpgrades += levelsGained;
        finalTarget.level = 1;
        finalTarget.stats = createBaseStatsForWeapon(finalTarget.weapon);
        finalTarget.upgradeCounts = createUpgradeCounts();
        finalTarget.pendingUpgrades = 0;
        finalTarget.isUpgrading = false;
        state.io.emit('playerDied', { victimId: targetId, attackerId });
        if (levelsGained > 0) state.io.to(attackerId).emit('levelUp', { newLevel: finalAttacker.level, count: levelsGained });
        setTimeout(() => {
            if (players[targetId]) {
                players[targetId].hp = getMaxHpFromStats(players[targetId].stats);
                players[targetId].x = 100 + Math.random() * 800;
                players[targetId].y = 100 + Math.random() * 500;
                players[targetId].isStunned = false;
                players[targetId].isGuarding = false;
                state.io.emit('playerRespawn', players[targetId]);
            }
        }, 3000);
    }
    state.io.emit('statsUpdate', players);
}

function emitAshProjectile(originId, impactId, startX, startY, endX, endY, reflected) {
    state.io.emit('ashProjectile', {
        originId,
        impactId,
        startX,
        startY,
        endX,
        endY,
        reflected: Boolean(reflected),
        duration: Math.max(140, Math.min(700, Math.round(Math.hypot(endX - startX, endY - startY) * 1.15))),
    });
}

function applyAshImpact(attackerId, targetId, payload, reflected) {
    const finalAttacker = players[attackerId];
    const finalTarget = players[targetId];
    if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout || finalTarget.isStunned) return;

    const now = Date.now();
    const wireProgress = Number.isFinite(payload.progress)
        ? Math.max(0, Math.min(1, payload.progress))
        : Math.max(0, Math.min(1, finalAttacker.wire && Number.isFinite(finalAttacker.wire.progress) ? finalAttacker.wire.progress : 1));
    const wireTx = Number.isFinite(payload.tx)
        ? payload.tx
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.tx) ? finalAttacker.wire.tx : finalAttacker.x);
    const wireTy = Number.isFinite(payload.ty)
        ? payload.ty
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.ty) ? finalAttacker.wire.ty : finalAttacker.y);
    const maxDistance = Number.isFinite(payload.maxDistance)
        ? Math.max(1, payload.maxDistance)
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.maxDistance) ? finalAttacker.wire.maxDistance : 500);
    const wireTip = {
        x: finalAttacker.x + (wireTx - finalAttacker.x) * wireProgress,
        y: finalAttacker.y + (wireTy - finalAttacker.y) * wireProgress
    };
    if (Math.hypot(finalTarget.x - wireTip.x, finalTarget.y - wireTip.y) > 28) return;
    finalAttacker.lastWireAt = now;

    const distanceTravelled = Math.max(0, Math.min(maxDistance, maxDistance * wireProgress));
    const ratio = maxDistance > 0 ? distanceTravelled / maxDistance : 0;
    let stunMs = Math.round((0.3 + (ratio * 1.7)) * 1000);
    stunMs = Math.max(300, Math.min(2000, stunMs));
    const angleToAttacker = Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x);
    const isFacingAttacker = getAngleDiff(finalTarget.angle, angleToAttacker) < (Math.PI / 3);

    if (shouldReflectFromSpearUltimate(finalTarget, finalAttacker.x, finalAttacker.y) && !reflected) {
        const reflectDistance = Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y));
        const reflectedPayload = {
            targetId: attackerId,
            progress: 0,
            tx: finalAttacker.x,
            ty: finalAttacker.y,
            maxDistance: reflectDistance,
            kind: 'ash',
            reflectedFrom: targetId,
        };
        state.io.emit('combatEffect', {
            x: finalTarget.x,
            y: finalTarget.y,
            angle: Math.atan2(finalTarget.y - finalAttacker.y, finalTarget.x - finalAttacker.x),
            weapon: 'ash',
        });
        emitAshProjectile(targetId, attackerId, finalTarget.x, finalTarget.y, finalAttacker.x, finalAttacker.y, true);
        setTimeout(() => {
            applyAshImpact(targetId, attackerId, reflectedPayload, true);
        }, Math.max(140, Math.min(700, Math.round(reflectDistance * 1.15))));
        return;
    }

    if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < JUST_GUARD_WINDOW_MS) {
        const reflectDistance = Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y));
        const reflectedPayload = {
            targetId: attackerId,
            progress: 0,
            tx: finalAttacker.x,
            ty: finalAttacker.y,
            maxDistance: reflectDistance,
            kind: 'ash',
            reflectedFrom: targetId,
        };
        state.io.emit('combatEffect', {
            x: finalTarget.x,
            y: finalTarget.y,
            angle: Math.atan2(finalTarget.y - finalAttacker.y, finalTarget.x - finalAttacker.x),
            weapon: 'ash',
        });
        emitAshProjectile(targetId, attackerId, finalTarget.x, finalTarget.y, finalAttacker.x, finalAttacker.y, true);
        setTimeout(() => {
            applyAshImpact(targetId, attackerId, reflectedPayload, true);
        }, Math.max(140, Math.min(700, Math.round(reflectDistance * 1.15))));
        return;
    }

    if (finalTarget.isGuarding && isFacingAttacker) {
        stunMs = Math.round(stunMs * 0.5);
    }

    const stunEndsAt = Date.now() + stunMs;
    state.io.emit('combatEffect', {
        x: finalTarget.x,
        y: finalTarget.y,
        angle: Math.atan2(finalTarget.y - finalAttacker.y, finalTarget.x - finalAttacker.x),
        weapon: 'ash',
    });
    finalTarget.isStunned = true;
    state.io.emit('playerStunned', { id: targetId, stunned: true, stunEndsAt, stunMs });
    setTimeout(() => {
        if (players[targetId]) {
            players[targetId].isStunned = false;
            state.io.emit('playerStunned', { id: targetId, stunned: false, stunEndsAt: 0 });
        }
    }, stunMs);
}

function shouldReflectFromSpearUltimate(finalTarget, projectileStartX, projectileStartY) {
    if (!finalTarget || !finalTarget.ultimate || !finalTarget.ultimate.active || finalTarget.ultimate.type !== 'spear') return false;
    if (Date.now() >= Number(finalTarget.ultimate.endsAt || 0)) return false;
    const radius = Math.max(120, Number(finalTarget.ultimate.radius) || 180);
    return Math.hypot(projectileStartX - finalTarget.x, projectileStartY - finalTarget.y) > radius;
}

module.exports = {
    resolveKill,
    applyBowImpact,
    applyAshImpact,
    emitAshProjectile,
    shouldReflectFromSpearUltimate,
};
