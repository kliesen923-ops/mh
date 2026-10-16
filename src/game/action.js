const { sanitizeSkill } = require('../utils/sanitize');
const { createDefaultGearRush } = require('./stats');

function sanitizeAction(p, actionData) {
    const action = {};
    if (!actionData || typeof actionData !== 'object') return action;

    if (typeof actionData.isGuarding === 'boolean') {
        action.isGuarding = actionData.isGuarding;
        if (actionData.isGuarding) action.guardStartTime = Date.now();
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

module.exports = { sanitizeAction };
