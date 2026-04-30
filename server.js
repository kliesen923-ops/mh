const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mh.html'));
});

const ACCOUNT_FILE = path.join(__dirname, 'account.txt');
let players = {};
let attackSequences = {};
let attackHitTargets = new Map();
const MAX_MOVE_SPEED = 1500;
const MOVE_TOLERANCE = 80;
const ATTACK_ARC = Math.PI * 0.65;
const WIRE_COOLDOWN_MS = 900;
const MAX_CHAT_LENGTH = 50;
const MAX_NAME_LENGTH = 10;

function ensureAccountFile() {
    if (!fs.existsSync(ACCOUNT_FILE)) {
        fs.writeFileSync(ACCOUNT_FILE, '', 'utf8');
    }
}

function sanitizeAccountId(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[,]/g, '')
        .replace(/[^\p{L}\p{N}_.-]/gu, '')
        .slice(0, 20);
}

function sanitizeAccountPassword(value) {
    return String(value || '')
        .trim()
        .replace(/[\r\n,]/g, '')
        .slice(0, 32);
}

function sanitizeWeapon(value) {
    const weapon = String(value || '').trim().toLowerCase();
    if (weapon === 'hammer') return 'hammer';
    return 'sword';
}

function loadAccounts() {
    ensureAccountFile();
    const raw = fs.readFileSync(ACCOUNT_FILE, 'utf8').trim();
    if (!raw) return [];
    return raw.split(/\r?\n/).map((line) => {
        const [id, nickname, password, kills, deaths] = line.split(',');
        return {
            id: id || '',
            nickname: nickname || '',
            password: password || '',
            kills: Number.parseInt(kills, 10) || 0,
            deaths: Number.parseInt(deaths, 10) || 0,
        };
    }).filter((account) => account.id && account.nickname && account.password);
}

function saveAccounts(accounts) {
    const body = accounts.map((account) => [
        account.id,
        account.nickname,
        account.password,
        Number.isFinite(account.kills) ? account.kills : 0,
        Number.isFinite(account.deaths) ? account.deaths : 0,
    ].join(',')).join('\n');
    fs.writeFileSync(ACCOUNT_FILE, body ? `${body}\n` : '', 'utf8');
}

function findAccountById(id) {
    return loadAccounts().find((account) => account.id === id);
}

function createBaseStatsForWeapon(weapon) {
    if (sanitizeWeapon(weapon) === 'hammer') {
        return { dmg: 1.8, range: 0.72, speed: 0.58, move: 0.88 };
    }
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0 };
}

function getAccountById(id) {
    return loadAccounts().find((account) => account.id === id);
}

function updateAccountScore(accountId, field, delta) {
    const id = sanitizeAccountId(accountId);
    if (!id || !Number.isFinite(delta)) return null;
    const accounts = loadAccounts();
    const account = accounts.find((entry) => entry.id === id);
    if (!account) return null;
    account[field] = Math.max(0, (Number.isFinite(account[field]) ? account[field] : 0) + delta);
    saveAccounts(accounts);
    return account;
}

app.post('/api/auth/register', (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const nickname = sanitizeName(req.body && req.body.nickname, '');
    const password = sanitizeAccountPassword(req.body && req.body.password);
    const confirmPassword = sanitizeAccountPassword(req.body && req.body.confirmPassword);

    if (!id || id.length < 2) return res.status(400).json({ ok: false, error: '아이디는 2자 이상이어야 합니다.' });
    if (!nickname || nickname.length < 2) return res.status(400).json({ ok: false, error: '닉네임은 2자 이상이어야 합니다.' });
    if (!password) return res.status(400).json({ ok: false, error: '비밀번호를 입력하세요.' });
    if (password !== confirmPassword) return res.status(400).json({ ok: false, error: '비밀번호 확인이 일치하지 않습니다.' });

    const accounts = loadAccounts();
    if (accounts.some((account) => account.id === id)) {
        return res.status(409).json({ ok: false, error: '이미 사용 중인 아이디입니다.' });
    }
    if (accounts.some((account) => account.nickname === nickname)) {
        return res.status(409).json({ ok: false, error: '이미 사용 중인 닉네임입니다.' });
    }

    accounts.push({ id, nickname, password, kills: 0, deaths: 0 });
    saveAccounts(accounts);
    return res.json({ ok: true, id, nickname });
});

app.post('/api/auth/login', (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const password = sanitizeAccountPassword(req.body && req.body.password);
    if (!id || !password) return res.status(400).json({ ok: false, error: '아이디와 비밀번호를 입력하세요.' });

    const account = findAccountById(id);
    if (!account || account.password !== password) {
        return res.status(401).json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({ ok: true, id: account.id, nickname: account.nickname });
});

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

function createDefaultStats() {
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0 };
}

function normalizeStats(stats) {
    return Object.assign(createDefaultStats(), stats || {});
}

function sanitizeName(name, fallback) {
    const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '')
        .slice(0, MAX_NAME_LENGTH);
    return cleaned.length >= 2 ? cleaned : fallback;
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
        if (Number.isFinite(actionData.wire.progress)) wire.progress = Math.max(0, Math.min(1, actionData.wire.progress));
        if (Number.isFinite(actionData.wire.maxDistance)) wire.maxDistance = Math.max(0, actionData.wire.maxDistance);
        action.wire = wire;
    }

    return action;
}

io.on('connection', (socket) => {
    console.log('플레이어 접속:', socket.id);

    players[socket.id] = {
        id: socket.id,
        accountId: '',
        name: "Hunter_" + socket.id.substring(0, 4),
        weapon: 'sword',
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
        stats: createBaseStatsForWeapon('sword'),
        lastMoveAt: Date.now(),
        lastWireAt: 0
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('setName', (name) => {
        const p = players[socket.id];
        if (!p) return;
        p.name = sanitizeName(name, p.name);
        io.emit('statsUpdate', players);
    });

    socket.on('setAccount', (accountId) => {
        const p = players[socket.id];
        if (!p) return;
        const account = getAccountById(accountId);
        if (!account) return;
        p.accountId = account.id;
        p.kills = Number.isFinite(account.kills) ? account.kills : 0;
        p.deaths = Number.isFinite(account.deaths) ? account.deaths : 0;
        io.emit('statsUpdate', players);
    });

    socket.on('setWeapon', (weapon) => {
        const p = players[socket.id];
        if (!p) return;
        const nextWeapon = sanitizeWeapon(weapon);
        p.weapon = nextWeapon;
        p.stats = normalizeStats(createBaseStatsForWeapon(nextWeapon));
        io.emit('statsUpdate', players);
    });

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
        p.stats = normalizeStats(p.stats);
        if (type === 'dmg') p.stats.dmg += 0.2;
        else if (type === 'range') p.stats.range += 0.15;
        else if (type === 'speed') p.stats.speed += 0.25;
        else if (type === 'move') p.stats.move += 0.1;
        p.pendingUpgrades--;
        if (p.pendingUpgrades <= 0) {
            p.pendingUpgrades = 0;
            p.isUpgrading = false;
        }
        io.emit('statsUpdate', players);
        socket.emit('upgradeApplied');
    });

    socket.on('wireGrabHit', (payloadData) => {
        const payload = (payloadData && typeof payloadData === 'object') ? payloadData : { targetId: payloadData };
        let attackerId = socket.id;
        let targetId = payload.targetId;
        let finalAttacker = players[attackerId];
        let finalTarget = players[targetId];
        if (!finalAttacker || !finalTarget || finalTarget.isUpgrading) return;

        const now = Date.now();
        if ((now - (finalAttacker.lastWireAt || 0)) < WIRE_COOLDOWN_MS) return;
        const wireProgress = Number.isFinite(payload.progress)
            ? Math.max(0, Math.min(1, payload.progress))
            : Math.max(0, Math.min(1, finalAttacker.wire && Number.isFinite(finalAttacker.wire.progress) ? finalAttacker.wire.progress : 1));
        const wireTx = Number.isFinite(payload.tx)
            ? payload.tx
            : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.tx) ? finalAttacker.wire.tx : finalAttacker.x);
        const wireTy = Number.isFinite(payload.ty)
            ? payload.ty
            : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.ty) ? finalAttacker.wire.ty : finalAttacker.y);
        const wireTip = {
            x: finalAttacker.x + (wireTx - finalAttacker.x) * wireProgress,
            y: finalAttacker.y + (wireTy - finalAttacker.y) * wireProgress
        };
        if (Math.hypot(finalTarget.x - wireTip.x, finalTarget.y - wireTip.y) > 35) return;
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
            io.emit('combatEffect', {
                x: target.x,
                y: target.y,
                angle: attackAngle,
                weapon: attacker.weapon || 'sword',
            });
            target.hp -= damage;
            if (target.hp <= 0) {
                target.hp = 0; target.deaths++; attacker.kills++;
                updateAccountScore(attacker.accountId, 'kills', 1);
                updateAccountScore(target.accountId, 'deaths', 1);
                let levelsGained = 0;
                levelsGained = Math.max(1, target.level - attacker.level);
                attacker.level += levelsGained;
                attacker.hp = Math.min(100, attacker.hp + 50);
                attacker.isUpgrading = true;
                attacker.pendingUpgrades += levelsGained;
                target.level = 1;
                target.stats = createBaseStatsForWeapon(target.weapon);
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
