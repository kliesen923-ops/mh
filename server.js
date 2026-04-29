const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mh.html'));
});

let players = {};
let attackSequences = {};
let attackHitTargets = new Map();
const MAX_MOVE_SPEED = 1500;
const MOVE_TOLERANCE = 80;
const ATTACK_ARC = Math.PI * 0.65;
const WIRE_COOLDOWN_MS = 900;
const MAX_CHAT_LENGTH = 50;

function getAngleDiff(a1, a2) {
    let diff = a1 - a2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff);
}

function distToSegment(p1, p2, p) {
    const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

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
        action.wire = wire;
    }

    return action;
}

io.on('connection', (socket) => {
    console.log('플레이어 접속:', socket.id);

    players[socket.id] = {
        id: socket.id,
        name: "Hunter_" + socket.id.substring(0, 4),
        x: 200 + Math.random() * 600,
        y: 200 + Math.random() * 400,
        hp: 100,
        angle: 0,
        kills: 0,
        deaths: 0,
        level: 1,
        isAttacking: false,
        attackPhase: 0,
        comboStep: 0,
        isGuarding: false,
        guardStartTime: 0,
        isStunned: false,
        isUpgrading: false,
        pendingUpgrades: 0,
        wire: { active: false, tx: 0, ty: 0 },
        stats: { dmg: 1.0, range: 1.0, speed: 1.0 },
        lastMoveAt: Date.now(),
        lastWireAt: 0
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && !players[socket.id].isStunned) {
            const p = players[socket.id];
            const now = Date.now();
            const dt = Math.max((now - (p.lastMoveAt || now)) / 1000, 1 / 60);
            const nextX = Number(movementData.x);
            const nextY = Number(movementData.y);
            const nextAngle = Number(movementData.angle);
            if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextAngle)) return;

            const maxDistance = MAX_MOVE_SPEED * dt + MOVE_TOLERANCE;
            const dx = nextX - p.x;
            const dy = nextY - p.y;
            const distance = Math.hypot(dx, dy);
            if (distance > maxDistance) {
                const scale = maxDistance / distance;
                p.x += dx * scale;
                p.y += dy * scale;
            } else {
                p.x = nextX;
                p.y = nextY;
            }
            p.angle = nextAngle;
            p.lastMoveAt = now;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('playerAction', (actionData) => {
        if (players[socket.id]) {
            const action = sanitizeAction(players[socket.id], actionData);
            if (action.isAttacking === true && action.attackPhase === 1) resetAttackHits(socket.id);
            Object.assign(players[socket.id], action);
            socket.broadcast.emit('playerActionUpdate', { id: socket.id, action });
        }
    });

    socket.on('selectUpgrade', (type) => {
        const p = players[socket.id];
        if (!p) return;
        if (type === 'dmg') p.stats.dmg += 0.2;
        else if (type === 'range') p.stats.range += 0.15;
        else if (type === 'speed') p.stats.speed += 0.25;
        p.pendingUpgrades--;
        if (p.pendingUpgrades <= 0) {
            p.pendingUpgrades = 0;
            p.isUpgrading = false;
        }
        io.emit('statsUpdate', players);
        socket.emit('upgradeApplied');
    });

    socket.on('wireGrabHit', (targetId) => {
        let attackerId = socket.id;
        let finalAttacker = players[attackerId];
        let finalTarget = players[targetId];
        if (!finalAttacker || !finalTarget || finalTarget.isUpgrading) return;

        const now = Date.now();
        if ((now - (finalAttacker.lastWireAt || 0)) < WIRE_COOLDOWN_MS) return;
        const wireEnd = {
            x: finalAttacker.x + Math.cos(finalAttacker.angle) * 500,
            y: finalAttacker.y + Math.sin(finalAttacker.angle) * 500
        };
        if (distToSegment(finalAttacker, wireEnd, finalTarget) >= 35) return;
        finalAttacker.lastWireAt = now;

        const angleToAttacker = Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x);
        const isFacingAttacker = getAngleDiff(finalTarget.angle, angleToAttacker) < (Math.PI / 3);

        if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < 500) {
            const tempId = attackerId; attackerId = targetId; targetId = tempId;
            finalAttacker = players[attackerId]; finalTarget = players[targetId];
            io.emit('chatMessage', { id: 'SYSTEM', message: `⚔️ ${finalAttacker.name}의 완벽한 반격!` });
        }

        if (finalAttacker && finalTarget && !finalTarget.isStunned) {
            finalTarget.isStunned = true;
            io.emit('playerStunned', { id: targetId, stunned: true });
            let steps = 10;
            let currentStep = 0;
            let pullInterval = setInterval(() => {
                if (!players[attackerId] || !players[targetId]) { clearInterval(pullInterval); return; }
                const destX = finalAttacker.x + Math.cos(finalAttacker.angle) * 50;
                const destY = finalAttacker.y + Math.sin(finalAttacker.angle) * 50;
                finalTarget.x += (destX - finalTarget.x) * 0.5;
                finalTarget.y += (destY - finalTarget.y) * 0.5;
                io.emit('playerMoved', finalTarget);
                currentStep++;
                if (currentStep >= steps) {
                    clearInterval(pullInterval);
                    setTimeout(() => {
                        if (players[targetId]) {
                            players[targetId].isStunned = false;
                            io.emit('playerStunned', { id: targetId, stunned: false });
                        }
                    }, 1500);
                }
            }, 30);
        }
    });

    socket.on('playerHitTarget', (targetId) => {
        const attacker = players[socket.id];
        const target = players[targetId];
        if (attacker && target && target.hp > 0 && !target.isUpgrading) {
            const now = Date.now();
            const attackRange = 85 * attacker.stats.range;
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const distance = Math.hypot(dx, dy);
            const targetAngle = Math.atan2(dy, dx);
            const attackAngle = Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle;
            const inArc = getAngleDiff(attackAngle, targetAngle) <= ATTACK_ARC;
            const hasValidAngle = attacker.comboStep === 3 || inArc;
            const canHit = attacker.isAttacking && attacker.attackPhase === 2 && distance <= attackRange && hasValidAngle;
            if (!canHit) return;
            if (hasHitTargetThisAttack(socket.id, targetId)) return;

            const baseDamage = attacker.comboStep === 3 ? 35 : (attacker.comboStep === 2 ? 20 : 10);
            let damage = Math.floor(baseDamage * attacker.stats.dmg);
            const angleToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
            const isFacingAttacker = getAngleDiff(target.angle, angleToAttacker) < (Math.PI / 3);
            if (target.isGuarding && isFacingAttacker) damage = Math.floor(damage * 0.5);
            target.hp -= damage;
            if (target.hp <= 0) {
                target.hp = 0; target.deaths++; attacker.kills++;
                let levelsGained = 0;
                if (attacker.level < 10) {
                    levelsGained = Math.max(1, target.level - attacker.level);
                    levelsGained = Math.min(levelsGained, 10 - attacker.level);
                    attacker.level += levelsGained;
                    attacker.hp = Math.min(100, attacker.hp + 50);
                    attacker.isUpgrading = true;
                    attacker.pendingUpgrades += levelsGained;
                }
                target.level = 1;
                target.stats = { dmg: 1.0, range: 1.0, speed: 1.0 };
                target.pendingUpgrades = 0;
                target.isUpgrading = false;
                io.emit('playerDied', { victimId: targetId, attackerId: socket.id });
                if (levelsGained > 0) socket.emit('levelUp', { newLevel: attacker.level, count: levelsGained });
                setTimeout(() => {
                    if (players[targetId]) {
                        players[targetId].hp = 100;
                        players[targetId].x = 100 + Math.random() * 800;
                        players[targetId].y = 100 + Math.random() * 500;
                        players[targetId].isStunned = false;
                        players[targetId].isGuarding = false;
                        io.emit('playerRespawn', players[targetId]);
                    }
                }, 3000);
            }
            io.emit('statsUpdate', players);
        }
    });

    socket.on('chatMessage', (msg) => {
        const message = String(msg || '').trim().slice(0, MAX_CHAT_LENGTH);
        if (!message) return;
        io.emit('chatMessage', { id: socket.id, message });
    });
    socket.on('disconnect', () => {
        delete players[socket.id];
        delete attackSequences[socket.id];
        for (const key of attackHitTargets.keys()) {
            if (key.startsWith(`${socket.id}:`)) attackHitTargets.delete(key);
        }
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`서버 실행 중: 포트 ${PORT}`); });
