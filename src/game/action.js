const { sanitizeSkill } = require('../utils/sanitize');
const { createDefaultGearRush } = require('./stats');
const { createProjectileId } = require('../utils/geometry');
const { getUltimateSpeedMultiplier, grantMoveBudget } = require('./movement');
const { GUARD_DURATION_MS, SKILL_COOLDOWN_MS, SKILL_COOLDOWN_SLACK_MS } = require('../config');

// Fraction of the client's own timings the server insists on (room for lag and frame jitter).
const TIMING_SLACK = 0.75;
const GUARD_COOLDOWN_MS = 1000;
const DODGE_COOLDOWN_MS = 1000;
const DODGE_DISTANCE = 160;
const RUSH_DISTANCE = 340;

function sanitizeAction(p, actionData) {
    const action = {};
    if (!actionData || typeof actionData !== 'object') return action;

    if (typeof actionData.isGuarding === 'boolean') {
        // A broken guard (gauntlet finisher) can't be raised again until it recovers.
        const guardBroken = actionData.isGuarding && (p.guardBrokenUntil || 0) > Date.now();
        action.isGuarding = actionData.isGuarding && !guardBroken;
        if (action.isGuarding) action.guardStartTime = Date.now();
    }
    if (typeof actionData.isAttacking === 'boolean') action.isAttacking = actionData.isAttacking;
    if (typeof actionData.isDodging === 'boolean') action.isDodging = actionData.isDodging;

    if (Number.isInteger(actionData.comboStep) && actionData.comboStep >= 1 && actionData.comboStep <= 3) {
        action.comboStep = actionData.comboStep;
    }
    if (Number.isInteger(actionData.attackPhase) && actionData.attackPhase >= 0 && actionData.attackPhase <= 3) {
        action.attackPhase = actionData.attackPhase;
    }
    if (Number.isFinite(actionData.aAngle)) action.aAngle = actionData.aAngle;

    if (actionData.wire && typeof actionData.wire === 'object') {
        const wire = { active: Boolean(actionData.wire.active) };
        wire.kind = sanitizeSkill(actionData.wire.kind);
        if (Number.isFinite(actionData.wire.tx) && Number.isFinite(actionData.wire.ty)) {
            const dx = actionData.wire.tx - p.x;
            const dy = actionData.wire.ty - p.y;
            const distance = Math.hypot(dx, dy);
            const maxDistance = 520;
            if (distance > maxDistance) {
                wire.tx = p.x + (dx / distance) * maxDistance;
                wire.ty = p.y + (dy / distance) * maxDistance;
            } else {
                wire.tx = actionData.wire.tx;
                wire.ty = actionData.wire.ty;
            }
        } else if (!wire.active) {
            wire.tx = p.wire.tx;
            wire.ty = p.wire.ty;
        }
        if (Number.isFinite(actionData.wire.progress)) wire.progress = Math.max(0, Math.min(1, actionData.wire.progress));
        if (Number.isFinite(actionData.wire.maxDistance)) wire.maxDistance = Math.max(0, actionData.wire.maxDistance);
        action.wire = wire;
    }

    if (actionData.gearRush && typeof actionData.gearRush === 'object') {
        const gearRush = createDefaultGearRush();
        gearRush.active = Boolean(actionData.gearRush.active);
        if (Number.isFinite(actionData.gearRush.startX)) gearRush.startX = actionData.gearRush.startX;
        if (Number.isFinite(actionData.gearRush.startY)) gearRush.startY = actionData.gearRush.startY;
        if (Number.isFinite(actionData.gearRush.tx) && Number.isFinite(actionData.gearRush.ty)) {
            const dx = actionData.gearRush.tx - p.x;
            const dy = actionData.gearRush.ty - p.y;
            const distance = Math.hypot(dx, dy);
            const maxDistance = 340;
            if (distance > maxDistance) {
                gearRush.tx = p.x + (dx / distance) * maxDistance;
                gearRush.ty = p.y + (dy / distance) * maxDistance;
            } else {
                gearRush.tx = actionData.gearRush.tx;
                gearRush.ty = actionData.gearRush.ty;
            }
        }
        if (Number.isFinite(actionData.gearRush.startTime)) gearRush.startTime = actionData.gearRush.startTime;
        if (Number.isFinite(actionData.gearRush.duration)) gearRush.duration = Math.max(0.08, Math.min(1.0, actionData.gearRush.duration));
        if (typeof actionData.gearRush.mode === 'string') gearRush.mode = actionData.gearRush.mode === 'dualRush' ? 'dualRush' : 'rush';
        if (typeof actionData.gearRush.comboId === 'string') gearRush.comboId = actionData.gearRush.comboId.slice(0, 64);
        if (Number.isFinite(actionData.gearRush.pauseUntil)) gearRush.pauseUntil = actionData.gearRush.pauseUntil;
        if (Number.isInteger(actionData.gearRush.slashIndex)) gearRush.slashIndex = Math.max(0, actionData.gearRush.slashIndex);
        if (Number.isFinite(actionData.gearRush.lastSlashAt)) gearRush.lastSlashAt = actionData.gearRush.lastSlashAt;
        if (typeof actionData.gearRush.startResolved === 'boolean') gearRush.startResolved = actionData.gearRush.startResolved;
        action.gearRush = gearRush;
    }

    return action;
}

// Server-side check of secondary skill cooldowns.
function trySpendSkill(p, kind, now) {
    const cooldownMs = SKILL_COOLDOWN_MS[kind] || 0;
    const last = (p.skillUsedAt && p.skillUsedAt[kind]) || 0;
    if (now - last < cooldownMs - SKILL_COOLDOWN_SLACK_MS) return false;
    p.skillUsedAt = Object.assign({}, p.skillUsedAt, { [kind]: now });
    return true;
}

// Shortest time between two attack swings at this attack speed (the client's swing is
// 0.12s wind-up plus at least 0.2s of strike and recovery, the latter sped up by the dual ultimate).
function getMinAttackIntervalMs(p) {
    const speed = Math.max(0.1, p.stats && Number.isFinite(p.stats.speed) ? p.stats.speed : 1);
    return ((0.12 + 0.2 / getUltimateSpeedMultiplier(p)) / speed) * 1000 * TIMING_SLACK;
}

// Applies the server's timing rules to a sanitized action: drops starts that come too soon,
// numbers the combo itself, and fixes where a rush starts. Updates p's bookkeeping fields.
function enforceActionRules(p, action, now = Date.now()) {
    if (action.isAttacking === true && action.attackPhase === 1) {
        if (now - (p.lastAttackAt || 0) < getMinAttackIntervalMs(p)) {
            delete action.isAttacking;
            delete action.attackPhase;
            delete action.comboStep;
            delete action.aAngle;
        } else {
            p.lastAttackAt = now;
            p.serverCombo = ((p.serverCombo || 0) % 3) + 1;
            action.comboStep = p.serverCombo;
        }
    } else {
        delete action.comboStep;
    }

    if (action.isGuarding === true && !p.isGuarding) {
        if (now < (p.guardReadyAt || 0)) {
            delete action.isGuarding;
            delete action.guardStartTime;
        } else {
            p.guardReadyAt = now + (GUARD_DURATION_MS + GUARD_COOLDOWN_MS) * TIMING_SLACK;
        }
    } else if (action.isGuarding === true) {
        // Already guarding: a repeat doesn't restart the guard window.
        delete action.isGuarding;
        delete action.guardStartTime;
    } else if (action.isGuarding === false && p.isGuarding) {
        p.guardReadyAt = Math.min(p.guardReadyAt || 0, now + GUARD_COOLDOWN_MS * TIMING_SLACK);
    }

    if (action.isDodging === true) {
        if (p.isDodging || now < (p.dodgeReadyAt || 0)) {
            delete action.isDodging;
        } else {
            action.dodgeStartAt = now;
            p.dodgeReadyAt = now + DODGE_COOLDOWN_MS * TIMING_SLACK;
            const dodge = p.stats && Number.isFinite(p.stats.dodge) ? p.stats.dodge : 1;
            grantMoveBudget(p, DODGE_DISTANCE * dodge);
        }
    }

    if (action.gearRush) {
        const wasActive = Boolean(p.gearRush && p.gearRush.active);
        if (action.gearRush.active && !wasActive) {
            // A new rush: only with the rush skill, off cooldown, from where the player stands.
            if (sanitizeSkill(p.skill) !== 'gear' || !trySpendSkill(p, 'gear', now)) {
                delete action.gearRush;
            } else {
                action.gearRush.startX = p.x;
                action.gearRush.startY = p.y;
                p.rushId = createProjectileId('rush');
                p.rushSlashes = 0;
                grantMoveBudget(p, RUSH_DISTANCE);
            }
        } else if (action.gearRush.active && wasActive) {
            // Mid-rush updates can't redirect it.
            Object.assign(action.gearRush, { startX: p.gearRush.startX, startY: p.gearRush.startY, tx: p.gearRush.tx, ty: p.gearRush.ty });
        }
    }
    return action;
}

module.exports = { sanitizeAction, enforceActionRules, trySpendSkill };
