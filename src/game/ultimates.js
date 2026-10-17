const state = require('./state');
const { getAngleDiff, distToSegment, getRayWorldEdge, createProjectileId } = require('../utils/geometry');
const {
    getWeaponAttackProfile,
    getAttackMultiplier,
    getUltimateConfig,
    getUltimateRangeMultiplier,
    getUltimateCooldownMs,
    getBowShotCount,
    clearUltimateState,
} = require('./stats');
const { DRAGON_SPREAD } = require('../config');
const { hasHitTargetForKey } = require('./hits');
const { resolveKill } = require('./combat');
const { hitMobs } = require('./mobs');

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
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius: Math.round(126 * getUltimateRangeMultiplier(attacker)),
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
                if (targetId === playerId || !target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) continue;
                const dx = target.x - current.x;
                const dy = target.y - current.y;
                if (Math.hypot(dx, dy) > current.ultimate.radius) continue;
                if (hasHitTargetForKey(key, targetId)) continue;
                const damage = Math.floor((8 + (i % 3)) * (current.stats && Number.isFinite(current.stats.dmg) ? current.stats.dmg : 1) * getAttackMultiplier(current));
                target.hp -= damage;
                state.io.emit('combatEffect', { x: target.x, y: target.y, angle: slashAngle, weapon: 'ult-sword', damage, ultimate: true });
                if (target.hp <= 0) resolveKill(playerId, targetId);
            }
            const mobDamage = Math.floor((8 + (i % 3)) * (current.stats && Number.isFinite(current.stats.dmg) ? current.stats.dmg : 1) * getAttackMultiplier(current));
            hitMobs(playerId, (mob) => Math.hypot(mob.x - current.x, mob.y - current.y) <= current.ultimate.radius + mob.radius, mobDamage, slashAngle, key);
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
    const profile = getWeaponAttackProfile(attacker.weapon);
    const coneRange = Math.max(118, profile.reach * 1.7) * getUltimateRangeMultiplier(attacker);
    const coneArc = Math.PI * 0.7;
    const attackAngle = attacker.aAngle || attacker.angle;
    // Position, direction and size go to clients so they can draw the exact hit area.
    attacker.ultimate = {
        active: true,
        type: 'hammer',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius: coneRange,
        angle: attackAngle,
        x: attacker.x,
        y: attacker.y,
        extra: coneArc,
    };
    broadcastUltimateState(playerId);
    state.io.emit('combatEffect', { x: attacker.x, y: attacker.y, angle: attackAngle, weapon: 'ult-hammer' });
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) continue;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        if (Math.hypot(dx, dy) > coneRange) continue;
        if (getAngleDiff(attackAngle, Math.atan2(dy, dx)) > coneArc) continue;
        const damage = Math.floor(28 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
        target.hp -= damage;
        const stunMs = 350;
        target.isStunned = true;
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle: attackAngle, weapon: 'ult-hammer', damage, ultimate: true });
        state.io.emit('playerStunned', { id: targetId, stunned: true, stunEndsAt: now + stunMs, stunMs });
        setTimeout(() => {
            if (players[targetId]) {
                players[targetId].isStunned = false;
                state.io.emit('playerStunned', { id: targetId, stunned: false, stunEndsAt: 0 });
            }
        }, stunMs);
        if (target.hp <= 0) resolveKill(playerId, targetId);
    }
    const hammerMobDamage = Math.floor(28 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
    hitMobs(playerId, (mob) => {
        const dx = mob.x - attacker.x;
        const dy = mob.y - attacker.y;
        return Math.hypot(dx, dy) <= coneRange + mob.radius && getAngleDiff(attackAngle, Math.atan2(dy, dx)) <= coneArc;
    }, hammerMobDamage, attackAngle, null, { fromX: attacker.x, fromY: attacker.y, knockback: 120, stunMs: 1000 });
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
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius: Math.round(180 * getUltimateRangeMultiplier(attacker)),
        extra: 0,
    };
    broadcastUltimateState(playerId);
    state.io.emit('combatEffect', { x: attacker.x, y: attacker.y, angle: attacker.angle, weapon: 'spear-ult' });
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) continue;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        if (Math.hypot(dx, dy) > attacker.ultimate.radius) continue;
        const damage = Math.floor(18 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
        target.hp -= damage;
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle: Math.atan2(dy, dx), weapon: 'spear-ult', damage, ultimate: true });
        if (target.hp <= 0) resolveKill(playerId, targetId);
    }
    const spearMobDamage = Math.floor(18 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
    hitMobs(playerId, (mob) => Math.hypot(mob.x - attacker.x, mob.y - attacker.y) <= attacker.ultimate.radius + mob.radius, spearMobDamage, attacker.angle);
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
    const baseAngle = attacker.aAngle || attacker.angle;
    // Projectile upgrades add dragons in a fan; range upgrades widen each one.
    const shots = getBowShotCount(attacker);
    const angles = Array.from({ length: shots }, (_, i) => baseAngle + (i - (shots - 1) / 2) * DRAGON_SPREAD);
    const halfWidth = Math.round(54 * getUltimateRangeMultiplier(attacker));
    attacker.ultimate = {
        active: true,
        type: 'bow',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius: halfWidth,
        angle: baseAngle,
        angles,
        x: attacker.x,
        y: attacker.y,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    const damageScale = (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker);
    angles.forEach((angle, shot) => {
        const edge = getRayWorldEdge(attacker.x, attacker.y, angle);
        const endX = edge.x;
        const endY = edge.y;
        const attackRange = Math.max(1, Math.hypot(endX - attacker.x, endY - attacker.y));
        state.io.emit('dragonProjectile', {
            projectileId: createProjectileId('dragon'),
            originId: playerId,
            startX: attacker.x,
            startY: attacker.y,
            endX,
            endY,
            angle,
            duration: Math.max(1000, Math.min(1800, Math.round(attackRange * 1.15))),
            reflected: false,
        });
        // Each dragon can hit a target once; overlapping dragons can both hit it.
        const hitKey = `${playerId}:ult-bow:${now}:${shot}`;
        for (const [targetId, target] of Object.entries(players)) {
            if (targetId === playerId || !target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) continue;
            if (distToSegment({ x: attacker.x, y: attacker.y }, { x: endX, y: endY }, target) > halfWidth) continue;
            if (hasHitTargetForKey(hitKey, targetId)) continue;
            const damage = Math.floor(26 * damageScale);
            target.hp -= damage;
            state.io.emit('combatEffect', { x: target.x, y: target.y, angle, weapon: 'dragon', damage, ultimate: true });
            if (target.hp <= 0) resolveKill(playerId, targetId);
        }
        hitMobs(playerId, (mob) => distToSegment({ x: attacker.x, y: attacker.y }, { x: endX, y: endY }, mob) <= halfWidth + mob.radius, Math.floor(26 * damageScale), angle, hitKey);
    });
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
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
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
