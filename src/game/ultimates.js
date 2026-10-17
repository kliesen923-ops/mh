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
const { DRAGON_SPREAD, SCYTHE_PULL_DISTANCE, GAME_WIDTH, GAME_HEIGHT, WORLD_MARGIN } = require('../config');
const { hasHitTargetForKey } = require('./hits');
const { resolveKill, forcePlayerPosition, damagePlayerFrom, stunPlayer } = require('./combat');
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

const HAMMER_ULT_HALF_ARC = Math.PI / 6;

// The hammer slam and the gauntlet rush plant the caster until they end.
function isRootedByUltimate(player, now = Date.now()) {
    const ult = player && player.ultimate;
    return Boolean(ult && ult.active && (ult.type === 'hammer' || ult.type === 'gauntlet') && now < (ult.endsAt || 0));
}

function applyHammerUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    const profile = getWeaponAttackProfile(attacker.weapon);
    // A long, narrow wedge straight ahead: 30° to each side (about 1.3 slices of an
    // 8-slice pizza), reaching well past a normal swing.
    const coneRange = Math.max(240, profile.reach * 2.6) * getUltimateRangeMultiplier(attacker);
    const coneArc = HAMMER_ULT_HALF_ARC;
    // Fire where the player faces, not toward their last basic attack.
    const attackAngle = attacker.angle;
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
    const baseAngle = attacker.angle;
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

function canBeHit(target) {
    return Boolean(target && target.hp > 0 && !target.upgradeShield && !target.isSelectingLoadout);
}

function damageScaleOf(p) {
    return (p.stats && Number.isFinite(p.stats.dmg) ? p.stats.dmg : 1) * getAttackMultiplier(p);
}

function endUltimateLater(playerId, type, durationMs) {
    setTimeout(() => {
        if (players[playerId] && players[playerId].ultimate && players[playerId].ultimate.type === type) {
            clearUltimateState(players[playerId]);
            broadcastUltimateState(playerId);
        }
    }, durationMs);
}

// Reaper's dance: drags everyone nearby in, then spins three times.
function applyScytheUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    const radius = Math.round(170 * getUltimateRangeMultiplier(attacker));
    attacker.ultimate = {
        active: true,
        type: 'scythe',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius,
        extra: 0,
    };
    broadcastUltimateState(playerId);
    for (const [targetId, target] of Object.entries(players)) {
        if (targetId === playerId || !canBeHit(target)) continue;
        const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
        if (distance > radius || distance <= SCYTHE_PULL_DISTANCE) continue;
        const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        forcePlayerPosition(targetId, attacker.x + Math.cos(angle) * SCYTHE_PULL_DISTANCE, attacker.y + Math.sin(angle) * SCYTHE_PULL_DISTANCE);
    }
    const spins = 3;
    for (let i = 0; i < spins; i++) {
        setTimeout(() => {
            const current = players[playerId];
            if (!current || !current.ultimate || current.ultimate.type !== 'scythe') return;
            const key = `${playerId}:ult-scythe:${now}:${i}`;
            const damage = 14 * damageScaleOf(current);
            state.io.emit('combatEffect', { x: current.x, y: current.y, angle: current.angle + i * 2.1, weapon: 'ult-scythe' });
            for (const [targetId, target] of Object.entries(players)) {
                if (targetId === playerId || !canBeHit(target)) continue;
                if (Math.hypot(target.x - current.x, target.y - current.y) > radius) continue;
                if (hasHitTargetForKey(key, targetId)) continue;
                damagePlayerFrom(playerId, targetId, damage, current.x, current.y, 'ult-scythe');
            }
            hitMobs(playerId, (mob) => Math.hypot(mob.x - current.x, mob.y - current.y) <= radius + mob.radius, Math.floor(damage), current.angle, key,
                i === 0 ? { fromX: current.x, fromY: current.y, knockback: -radius } : null);
            state.io.emit('statsUpdate', players);
        }, i * 300);
    }
    endUltimateLater(playerId, 'scythe', config.durationMs);
}

// Rush of five punches straight ahead; the last one stuns.
function applyGauntletUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    const reach = Math.round(120 * getUltimateRangeMultiplier(attacker));
    const halfArc = Math.PI / 4;
    const angle = attacker.angle;
    attacker.ultimate = {
        active: true,
        type: 'gauntlet',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius: reach,
        angle,
        x: attacker.x,
        y: attacker.y,
        extra: halfArc,
    };
    broadcastUltimateState(playerId);
    const punches = 5;
    for (let i = 0; i < punches; i++) {
        setTimeout(() => {
            const current = players[playerId];
            if (!current || !current.ultimate || current.ultimate.type !== 'gauntlet') return;
            const last = i === punches - 1;
            const key = `${playerId}:ult-gauntlet:${now}:${i}`;
            const damage = (last ? 18 : 10) * damageScaleOf(current);
            state.io.emit('combatEffect', { x: current.x + Math.cos(angle) * reach * 0.5, y: current.y + Math.sin(angle) * reach * 0.5, angle, weapon: 'ult-gauntlet' });
            const inCone = (t) => {
                const dx = t.x - current.x;
                const dy = t.y - current.y;
                return Math.hypot(dx, dy) <= reach + (t.radius || 0) && getAngleDiff(angle, Math.atan2(dy, dx)) <= halfArc;
            };
            for (const [targetId, target] of Object.entries(players)) {
                if (targetId === playerId || !canBeHit(target) || !inCone(target)) continue;
                if (hasHitTargetForKey(key, targetId)) continue;
                damagePlayerFrom(playerId, targetId, damage, current.x, current.y, 'ult-gauntlet');
                if (last) stunPlayer(targetId, 500);
            }
            hitMobs(playerId, inCone, Math.floor(damage), angle, key, last ? { fromX: current.x, fromY: current.y, knockback: 60, stunMs: 800 } : null);
            state.io.emit('statsUpdate', players);
        }, i * 120);
    }
    endUltimateLater(playerId, 'gauntlet', config.durationMs);
}

// Meteor: a marked circle ahead, struck after a short delay.
function applyStaffUltimate(playerId) {
    const attacker = players[playerId];
    if (!attacker) return;
    const now = Date.now();
    const config = getUltimateConfig(attacker.weapon);
    const mult = getUltimateRangeMultiplier(attacker);
    const radius = Math.round(150 * mult);
    const distance = 280 * mult;
    const angle = attacker.angle;
    const x = Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, attacker.x + Math.cos(angle) * distance));
    const y = Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, attacker.y + Math.sin(angle) * distance));
    const impactDelayMs = 800;
    attacker.ultimate = {
        active: true,
        type: 'staff',
        startAt: now,
        endsAt: now + config.durationMs,
        cooldownEndsAt: now + getUltimateCooldownMs(attacker),
        radius,
        angle,
        x,
        y,
        extra: impactDelayMs,
    };
    broadcastUltimateState(playerId);
    setTimeout(() => {
        const current = players[playerId];
        if (!current) return;
        const damage = 42 * damageScaleOf(current);
        state.io.emit('combatEffect', { x, y, angle, weapon: 'meteor' });
        for (const [targetId, target] of Object.entries(players)) {
            if (targetId === playerId || !canBeHit(target)) continue;
            if (Math.hypot(target.x - x, target.y - y) > radius) continue;
            damagePlayerFrom(playerId, targetId, damage, x, y, 'meteor');
            stunPlayer(targetId, 400);
        }
        hitMobs(playerId, (mob) => Math.hypot(mob.x - x, mob.y - y) <= radius + mob.radius, Math.floor(damage), angle, null, { fromX: x, fromY: y, knockback: 50, stunMs: 1000 });
        state.io.emit('statsUpdate', players);
    }, impactDelayMs);
    endUltimateLater(playerId, 'staff', config.durationMs);
}

const ULTIMATE_HANDLERS = {
    sword: applySwordUltimate,
    hammer: applyHammerUltimate,
    spear: applySpearUltimate,
    bow: applyBowUltimate,
    dual: applyDualUltimate,
    scythe: applyScytheUltimate,
    gauntlet: applyGauntletUltimate,
    staff: applyStaffUltimate,
};

module.exports = {
    isRootedByUltimate,
    ULTIMATE_HANDLERS,
    broadcastUltimateState,
};
