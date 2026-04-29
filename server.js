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

function getAngleDiff(a1, a2) {
    let diff = a1 - a2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff);
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
        stats: { dmg: 1.0, range: 1.0, speed: 1.0 }
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && !players[socket.id].isStunned) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('playerAction', (actionData) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], actionData);
            socket.broadcast.emit('playerActionUpdate', { id: socket.id, action: actionData });
        }
    });

    socket.on('selectUpgrade', (type) => {
        const p = players[socket.id];
        if (!p) return;
        if (type === 'dmg') p.stats.dmg += 0.25;
        else if (type === 'range') p.stats.range += 0.2;
        else if (type === 'speed') p.stats.speed += 0.15;
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
            let damage = (attacker.comboStep === 3 ? 30 : 15) * attacker.stats.dmg;
            const angleToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
            const isFacingAttacker = getAngleDiff(target.angle, angleToAttacker) < (Math.PI / 3);
            if (target.isGuarding && isFacingAttacker) damage = Math.floor(damage * 0.2);
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

    socket.on('chatMessage', (msg) => { io.emit('chatMessage', { id: socket.id, message: msg }); });
    socket.on('disconnect', () => { delete players[socket.id]; io.emit('playerDisconnected', socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`서버 실행 중: 포트 ${PORT}`); });
