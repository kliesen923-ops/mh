const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mh.html'));
});

// 게임 데이터 관리
let players = {};
let boss = { 
    x: 500, y: 300, hp: 1000, maxHp: 1000, 
    state: 'idle', angle: 0, timer: 100, targetId: null,
    size: 75
};

// 보스 AI 루프 (초당 30회 업데이트)
setInterval(() => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) {
        boss.state = 'idle';
        return;
    }

    // 타겟 선정 (가장 가까운 플레이어)
    if (!boss.targetId || !players[boss.targetId]) {
        let minDist = Infinity;
        playerIds.forEach(id => {
            let d = Math.hypot(players[id].x - boss.x, players[id].y - boss.y);
            if (d < minDist) { minDist = d; boss.targetId = id; }
        });
    }

    const target = players[boss.targetId];
    if (!target) return;

    boss.timer--;

    if (boss.state === 'idle') {
        boss.angle = Math.atan2(target.y - boss.y, target.x - boss.x);
        if (boss.timer <= 0) {
            boss.state = 'charge';
            boss.timer = 40; // 돌진 준비 및 수행 시간
        }
    } else if (boss.state === 'charge') {
        if (boss.timer > 10) {
            // 돌진 전 흔들림 효과 유도 (각도만 살짝씩 변경)
        } else {
            // 실제 돌진
            boss.x += Math.cos(boss.angle) * 15;
            boss.y += Math.sin(boss.angle) * 15;

            // 플레이어 충돌 판정
            playerIds.forEach(id => {
                const p = players[id];
                if (Math.hypot(p.x - boss.x, p.y - boss.y) < boss.size + 25) {
                    // 데미지 전송 (클라이언트에서 처리하도록 이벤트 발송)
                    io.to(id).emit('playerHit', 15);
                    boss.state = 'idle';
                    boss.timer = 90;
                    boss.targetId = null; // 타격 후 타겟 초기화
                }
            });
        }

        if (boss.timer <= -20) {
            boss.state = 'idle';
            boss.timer = 90;
            boss.targetId = null;
        }
    }

    // 화면 경계 제한 (서버 기준)
    boss.x = Math.max(100, Math.min(1200, boss.x));
    boss.y = Math.max(100, Math.min(800, boss.y));
    boss.animTime = (boss.animTime || 0) + 0.1;

    io.emit('bossUpdate', {
        x: boss.x,
        y: boss.y,
        hp: boss.hp,
        maxHp: boss.maxHp,
        angle: boss.angle,
        state: boss.state,
        animTime: boss.animTime,
        isHit: boss.isHit
    });
}, 33);

io.on('connection', (socket) => {
    console.log('새로운 플레이어 접속:', socket.id);

    // 새 플레이어 초기화
    players[socket.id] = {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        hp: 100,
        angle: 0,
        comboStep: 0,
        isAttacking: false,
        isGuarding: false,
        isDodging: false
    };

    // 현재 플레이어 목록과 보스 상태 전송
    socket.emit('currentPlayers', players);
    socket.emit('bossUpdate', boss);

    // 다른 사람들에게 새 플레이어 알림
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // 플레이어 움직임 업데이트
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            players[socket.id].animTime = movementData.animTime;
            // 다른 사람들에게 이 플레이어의 위치 전송
            socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
        }
    });

    // 공격 등 액션 동기화
    socket.on('playerAction', (actionData) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], actionData);
            socket.broadcast.emit('playerActionUpdate', { id: socket.id, action: actionData });
        }
    });

    // 보스 타격 판정 (간단한 버전)
    socket.on('bossHit', (damage) => {
        boss.hp -= damage;
        io.emit('bossUpdate', boss); // 모든 사람에게 보스 체력 업데이트
    });

    // 접속 종료 처리
    socket.on('disconnect', () => {
        console.log('플레이어 접속 종료:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`서버가 시작되었습니다! http://localhost:${PORT}`);
});
