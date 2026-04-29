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
        isAttacking: false,
        attackPhase: 0,
        comboStep: 0,
        isGuarding: false,
        isStunned: false,
        wire: { active: false, tx: 0, ty: 0 }
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

    socket.on('wireGrabHit', (targetId) => {
        const attacker = players[socket.id];
        const target = players[targetId];

        if (attacker && target && !target.isStunned) {
            target.isStunned = true;
            io.emit('playerStunned', { id: targetId, stunned: true });

            // 끌어오기 처리 (0.3초간 빠르게 당김)
            let steps = 10;
            let currentStep = 0;
            let pullInterval = setInterval(() => {
                if (!players[socket.id] || !players[targetId]) {
                    clearInterval(pullInterval);
                    return;
                }
                
                const destX = attacker.x + Math.cos(attacker.angle) * 50;
                const destY = attacker.y + Math.sin(attacker.angle) * 50;
                
                target.x += (destX - target.x) * 0.5;
                target.y += (destY - target.y) * 0.5;
                
                io.emit('playerMoved', target);
                
                currentStep++;
                if (currentStep >= steps) {
                    clearInterval(pullInterval);
                    // 당기기가 끝난 후 0.5초 뒤에 경직 해제 (이미 당기는데 약 0.3초 소요됨)
                    setTimeout(() => {
                        if (players[targetId]) {
                            players[targetId].isStunned = false;
                            io.emit('playerStunned', { id: targetId, stunned: false });
                        }
                    }, 500);
                }
            }, 30);
        }
    });

    socket.on('playerHitTarget', (targetId) => {
        const attacker = players[socket.id];
        const target = players[targetId];
        if (attacker && target && target.hp > 0) {
            let damage = attacker.comboStep === 3 ? 30 : 15;
            if (target.isGuarding) damage = Math.floor(damage * 0.2);
            target.hp -= damage;
            if (target.hp <= 0) {
                target.hp = 0; target.deaths++; attacker.kills++;
                io.emit('playerDied', { victimId: targetId, attackerId: socket.id });
                setTimeout(() => {
                    if (players[targetId]) {
                        players[targetId].hp = 100;
                        players[targetId].x = 100 + Math.random() * 800;
                        players[targetId].y = 100 + Math.random() * 500;
                        players[targetId].isStunned = false;
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
