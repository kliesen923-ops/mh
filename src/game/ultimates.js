const state = require('./state');
const { getAngleDiff, distToSegment, getRayWorldEdge, createProjectileId } = require('../utils/geometry');
const {
    getWeaponAttackProfile,
    getAttackMultiplier,
    getUltimateConfig,
    clearUltimateState,
} = require('./stats');
const { hasHitTargetForKey } = require('./hits');
const { resolveKill } = require('./combat');

const { players } = state;

function broadcastUltimateState(playerId) {
    const current = players[playerId];
    if (!current) return;
    state.io.emit('playerActionUpdate', { id: playerId, action: { ultimate: current.ultimate } });
}

function applySwordUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    attacker.ultimate = {
        active: true,
        type: 'sword',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + config.cooldownMs,
        radius: 126,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    const slashCount = 8;
    const slashInterval = Math.max(80, Math.floor(config.durationMs / slashCount));
    for (let i = 0; i < slashCount; i++) {
        setTimeout(() => {
            const current = players[playerId];
            if (!current || !current.ultimate || !current.ultimate.active || current.ultimate.type !== 'sword') return;
            const key = `${playerId}:ult-sword:${now}:${i}`;
            const slashAngle = current.angle + (-0.9 + i * 0.28);
            state.io.emit('combatEffect', {
                x: current.x,
                y: current.y,
                angle: slashAngle,
                weapon: 'ult-sword',
            });
            for (const [targetId, target] of Object.entries(players)) {
                if (targetId === playerId || !target || target.hp <= 0 || target.isUpgrading || target.isSelectingLoadout) continue;
                const dx = target.x - current.x;
                const dy = target.y - current.y;
                if (Math.hypot(dx, dy) > 126) continue;
                if (hasHitTargetForKey(key, targetId)) continue;
                const damage = Math.floor((8 + (i % 3)) * (current.stats && Number.isFinite(current.stats.dmg) ? current.stats.dmg : 1) * getAttackMultiplier(current));
                target.hp -= damage;
                state.io.emit('combatEffect', { x: target.x, y: target.y, angle: slashAngle, weapon: 'ult-sword' });
                if (target.hp <= 0) resolveKill(playerId, targetId);
            }
            state.io.emit('statsUpdate', players);
        }, i * slashInterval);
    }
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === 'sword') {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, config.durationMs);
}

function applyHammerUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    attacker.ultimate = {
        active: true,
        type: 'hammer',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + config.cooldownMs,
        radius: 0,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    const profile = getWeaponAttackProfile(attacker.weapon);
    const coneRange = Math.max(118, profile.reach * 1.7);
    const coneArc = Math.PI * 0.7;
    const attackAngle = attacker.aAngle || attacker.angle;
    state.io.emit('combatEffect', { x: attacker.x, y: attacker.y, angle: attackAngle, weapon: 'ult-hammer' });
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !target || target.hp <= 0 || target.isUpgrading || target.isSelectingLoadout) continue;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        if (Math.hypot(dx, dy) > coneRange) continue;
        if (getAngleDiff(attackAngle, Math.atan2(dy, dx)) > coneArc) continue;
        const damage = Math.floor(28 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
        target.hp -= damage;
        const stunMs = 350;
        target.isStunned = true;
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle: attackAngle, weapon: 'ult-hammer' });
        state.io.emit('playerStunned', { id: targetId, stunned: true, stunEndsAt: now + stunMs, stunMs });
        setTimeout(() => {
            if (players[targetId]) {
                players[targetId].isStunned = false;
                state.io.emit('playerStunned', { id: targetId, stunned: false, stunEndsAt: 0 });
            }
        }, stunMs);
        if (target.hp <= 0) resolveKill(playerId, targetId);
    }
    state.io.emit('statsUpdate', players);
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === 'hammer') {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, config.durationMs);
}

function applySpearUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    attacker.ultimate = {
        active: true,
        type: 'spear',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + config.cooldownMs,
        radius: 180,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    state.io.emit('combatEffect', { x: attacker.x, y: attacker.y, angle: attacker.angle, weapon: 'spear-ult' });
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !target || target.hp <= 0 || target.isUpgrading || target.isSelectingLoadout) continue;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        if (Math.hypot(dx, dy) > attacker.ultimate.radius) continue;
        const damage = Math.floor(18 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
        target.hp -= damage;
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle: Math.atan2(dy, dx), weapon: 'spear-ult' });
        if (target.hp <= 0) resolveKill(playerId, targetId);
    }
    state.io.emit('statsUpdate', players);
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === 'spear') {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, config.durationMs);
}

function applyBowUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    attacker.ultimate = {
        active: true,
        type: 'bow',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + config.cooldownMs,
        radius: 0,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    const angle = attacker.aAngle || attacker.angle;
    const edge = getRayWorldEdge(attacker.x, attacker.y, angle);
    const endX = edge.x;
    const endY = edge.y;
    const attackRange = Math.max(1, Math.hypot(endX - attacker.x, endY - attacker.y));
    const projectileId = createProjectileId('dragon');
    state.io.emit('dragonProjectile', {
        projectileId,
        originId: playerId,
        startX: attacker.x,
        startY: attacker.y,
        endX,
        endY,
        angle,
        duration: Math.max(1000, Math.min(1800, Math.round(attackRange * 1.15))),
        reflected: false,
    });
    const hitKey = `${playerId}:ult-bow:${now}`;
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !target || target.hp <= 0 || target.isUpgrading || target.isSelectingLoadout) continue;
        if (distToSegment({ x: attacker.x, y: attacker.y }, { x: endX, y: endY }, target) > 54) continue;
        if (hasHitTargetForKey(hitKey, targetId)) continue;
        const damage = Math.floor(26 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
        target.hp -= damage;
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle, weapon: 'dragon' });
        if (target.hp <= 0) resolveKill(playerId, targetId);
    }
    state.io.emit('statsUpdate', players);
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === 'bow') {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, config.durationMs);
}

function applyDualUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    attacker.ultimate = {
        active: true,
        type: 'dual',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + config.cooldownMs,
        radius: 0,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    state.io.emit('combatEffect', { x: attacker.x, y: attacker.y, angle: attacker.angle, weapon: 'ult-dual' });
    state.io.emit('statsUpdate', players);
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === 'dual') {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, config.durationMs);
}

const ULTIMATE_HANDLERS = {
    sword: applySwordUltimate,
    hammer: applyHammerUltimate,
    spear: applySpearUltimate,
    bow: applyBowUltimate,
    dual: applyDualUltimate,
};

module.exports = {
    ULTIMATE_HANDLERS,
    broadcastUltimateState,
};
