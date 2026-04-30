const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Pool = null;
if (process.env.DATABASE_URL) {
    try {
        ({ Pool } = require('pg'));
    } catch (error) {
        console.warn('pg module is unavailable:', error.message);
    }
}

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mh.html'));
});

let players = {};
let attackSequences = {};
let attackHitTargets = new Map();
let healingCross = null;
let healingCrossTimer = null;
let giantPotion = null;
let giantPotionTimer = null;
const MAX_MOVE_SPEED = 1500;
const MOVE_TOLERANCE = 80;
const ATTACK_ARC = Math.PI * 0.65;
const WIRE_COOLDOWN_MS = 900;
const WIRE_STUN_MS = 1000;
const GUARD_DURATION_MS = 500;
const JUST_GUARD_WINDOW_MS = 100;
const MAX_CHAT_LENGTH = 50;
const MAX_NAME_LENGTH = 10;
const ATTACK_PROFILES = {
    sword: { reach: 85, arc: Math.PI * 0.65, lineWidth: 20 },
    hammer: { reach: 78, arc: Math.PI * 0.42, lineWidth: 22 },
    spear: { reach: 126, arc: Math.PI * 0.14, lineWidth: 16 },
    dual: { reach: 72, arc: Math.PI * 0.72, lineWidth: 18 },
    bow: { reach: 560, arc: Math.PI * 0.08, lineWidth: 8 },
};
const HEAL_CROSS_SPAWN_DELAY_MS = 18000;
const HEAL_CROSS_LIFETIME_MS = 12000;
const HEAL_CROSS_BOUNDS = { xMin: 120, xMax: 1160, yMin: 110, yMax: 530 };
const HEAL_CROSS_PICKUP_RADIUS = 34;
const GIANT_POTION_SPAWN_DELAY_MS = 28000;
const GIANT_POTION_LIFETIME_MS = 14000;
const GIANT_POTION_BOUNDS = { xMin: 120, xMax: 1160, yMin: 110, yMax: 530 };
const GIANT_POTION_PICKUP_RADIUS = 36;
const GIANT_POTION_DURATION_MS = 9000;
const GIANT_POTION_RECOVERY_STUN_MS = 1000;
const dbPool = Pool && process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
}) : null;

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
    if (weapon === 'spear') return 'spear';
    if (weapon === 'dual') return 'dual';
    if (weapon === 'bow') return 'bow';
    return 'sword';
}

function sanitizeSkill(value) {
    const skill = String(value || '').trim().toLowerCase();
    if (skill === 'ash') return 'ash';
    return 'wire';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
    return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
    const [salt, derived] = String(storedHash || '').split(':');
    if (!salt || !derived) return false;
    const nextDerived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(nextDerived, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function initDatabase() {
    if (!dbPool) return;
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            kills INTEGER NOT NULL DEFAULT 0,
            deaths INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

function getAccountById(id) {
    const accountId = sanitizeAccountId(id);
    if (!accountId) return Promise.resolve(null);
    if (!dbPool) return Promise.resolve(null);
    return dbPool.query(
        'SELECT id, nickname, password_hash, kills, deaths FROM accounts WHERE id = $1',
        [accountId]
    ).then((result) => result.rows[0] || null);
}

function createBaseStatsForWeapon(weapon) {
    const nextWeapon = sanitizeWeapon(weapon);
    if (nextWeapon === 'hammer') {
        return { dmg: 1.8, range: 0.72, speed: 0.58, move: 0.88, dodge: 1.0, projectile: 1.0, hp: 115 };
    }
    if (nextWeapon === 'spear') {
        return { dmg: 1.24, range: 1.34, speed: 0.9, move: 0.96, dodge: 1.0, projectile: 1.0, hp: 95 };
    }
    if (nextWeapon === 'dual') {
        return { dmg: 0.82, range: 0.82, speed: 1.45, move: 1.02, dodge: 1.0, projectile: 1.0, hp: 92 };
    }
    if (nextWeapon === 'bow') {
        return { dmg: 1.2, range: 1.0, speed: 0.84, move: 0.98, dodge: 1.0, projectile: 1.0, hp: 90 };
    }
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
}

function getWeaponAttackProfile(weapon) {
    return ATTACK_PROFILES[sanitizeWeapon(weapon)] || ATTACK_PROFILES.sword;
}

function isTargetInWeaponAttack(attacker, target) {
    if (!attacker || !target) return false;
    const profile = getWeaponAttackProfile(attacker.weapon);
    if (sanitizeWeapon(attacker.weapon) === 'bow') return false;
    const attackAngle = Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    const attackRange = profile.reach * (attacker.stats && Number.isFinite(attacker.stats.range) ? attacker.stats.range : 1) * getAttackMultiplier(attacker);
    if (distance > attackRange) return false;
    if (sanitizeWeapon(attacker.weapon) === 'spear') {
        const endX = attacker.x + Math.cos(attackAngle) * attackRange;
        const endY = attacker.y + Math.sin(attackAngle) * attackRange;
        return distToSegment({ x: attacker.x, y: attacker.y }, { x: endX, y: endY }, target) <= profile.lineWidth;
    }
    if (attacker.comboStep === 3) return true;
    const targetAngle = Math.atan2(dy, dx);
    return getAngleDiff(attackAngle, targetAngle) <= profile.arc;
}

async function updateAccountScore(accountId, field, delta) {
    const id = sanitizeAccountId(accountId);
    if (!id || !Number.isFinite(delta)) return null;
    if (!dbPool) return null;
    if (field !== 'kills' && field !== 'deaths') return null;
    const result = await dbPool.query(
        `UPDATE accounts
         SET ${field} = GREATEST(0, ${field} + $1),
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, nickname, password_hash, kills, deaths`,
        [delta, id]
    );
    return result.rows[0] || null;
}

function getMaxHpFromStats(stats) {
    return Math.max(1, Math.floor(Number.isFinite(stats && stats.hp) ? stats.hp : 100));
}

function getAttackMultiplier(player) {
    return Math.max(1, Number.isFinite(player && player.giantAttackMult) ? player.giantAttackMult : 1);
}

function createProjectileId(prefix) {
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
}

function createUpgradeCounts() {
    return { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 };
}

function emitHealingCrossUpdate() {
    io.emit('healingCrossUpdate', healingCross ? [healingCross] : []);
}

function emitGiantPotionUpdate() {
    io.emit('giantPotionUpdate', giantPotion ? [giantPotion] : []);
}

function spawnHealingCross() {
    healingCrossTimer = null;
    healingCross = {
        id: createProjectileId('heal'),
        x: HEAL_CROSS_BOUNDS.xMin + Math.random() * (HEAL_CROSS_BOUNDS.xMax - HEAL_CROSS_BOUNDS.xMin),
        y: HEAL_CROSS_BOUNDS.yMin + Math.random() * (HEAL_CROSS_BOUNDS.yMax - HEAL_CROSS_BOUNDS.yMin),
        createdAt: Date.now(),
        expiresAt: Date.now() + HEAL_CROSS_LIFETIME_MS,
    };
    emitHealingCrossUpdate();
}

function scheduleNextHealingCross(delayMs = HEAL_CROSS_SPAWN_DELAY_MS) {
    if (healingCrossTimer) clearTimeout(healingCrossTimer);
    healingCrossTimer = setTimeout(spawnHealingCross, delayMs);
}

function clearHealingCross(scheduleNext = true) {
    healingCross = null;
    emitHealingCrossUpdate();
    if (scheduleNext) scheduleNextHealingCross();
}

function spawnGiantPotion() {
    giantPotionTimer = null;
    giantPotion = {
        id: createProjectileId('giant'),
        x: GIANT_POTION_BOUNDS.xMin + Math.random() * (GIANT_POTION_BOUNDS.xMax - GIANT_POTION_BOUNDS.xMin),
        y: GIANT_POTION_BOUNDS.yMin + Math.random() * (GIANT_POTION_BOUNDS.yMax - GIANT_POTION_BOUNDS.yMin),
        createdAt: Date.now(),
        expiresAt: Date.now() + GIANT_POTION_LIFETIME_MS,
    };
    emitGiantPotionUpdate();
}

function scheduleNextGiantPotion(delayMs = GIANT_POTION_SPAWN_DELAY_MS) {
    if (giantPotionTimer) clearTimeout(giantPotionTimer);
    giantPotionTimer = setTimeout(spawnGiantPotion, delayMs);
}

function clearGiantPotion(scheduleNext = true) {
    giantPotion = null;
    emitGiantPotionUpdate();
    if (scheduleNext) scheduleNextGiantPotion();
}

function endGiantPotion(playerId) {
    const p = players[playerId];
    if (!p || !p.giantActive) return;
    p.giantActive = false;
    p.giantScale = 1;
    p.giantAttackMult = 1;
    p.giantEndsAt = 0;
    p.giantRecoveryEndsAt = 0;
    p.giantRecoveryArmed = false;
    io.emit('statsUpdate', players);
    const stunEndsAt = Date.now() + GIANT_POTION_RECOVERY_STUN_MS;
    p.isStunned = true;
    p.stunEndsAt = stunEndsAt;
    io.emit('playerStunned', { id: playerId, stunned: true, stunEndsAt, stunMs: GIANT_POTION_RECOVERY_STUN_MS });
    setTimeout(() => {
        const current = players[playerId];
        if (!current) return;
        current.isStunned = false;
        current.stunEndsAt = 0;
        io.emit('playerStunned', { id: playerId, stunned: false, stunEndsAt: 0, stunMs: 0 });
        io.emit('statsUpdate', players);
    }, GIANT_POTION_RECOVERY_STUN_MS);
}

function pickupGiantPotion(playerId) {
    const p = players[playerId];
    if (!p || !giantPotion || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) return;
    const distance = Math.hypot(p.x - giantPotion.x, p.y - giantPotion.y);
    if (distance > GIANT_POTION_PICKUP_RADIUS) return;
    p.giantActive = true;
    p.giantScale = 4;
    p.giantAttackMult = 2;
    p.giantEndsAt = Date.now() + GIANT_POTION_DURATION_MS;
    p.giantRecoveryEndsAt = 0;
    p.giantRecoveryArmed = false;
    io.emit('statsUpdate', players);
    clearGiantPotion(true);
}

function updateGiantPotions() {
    const now = Date.now();
    if (giantPotion && now >= giantPotion.expiresAt) {
        clearGiantPotion(true);
    }
    for (const [id, p] of Object.entries(players)) {
        if (!p || !p.giantActive) continue;
        if (!p.giantRecoveryArmed && now >= (p.giantEndsAt || 0)) {
            p.giantRecoveryArmed = true;
            p.giantActive = false;
            p.giantScale = 1;
            p.giantAttackMult = 1;
            p.giantRecoveryEndsAt = now + GIANT_POTION_RECOVERY_STUN_MS;
            const stunEndsAt = p.giantRecoveryEndsAt;
            p.isStunned = true;
            p.stunEndsAt = stunEndsAt;
            io.emit('playerStunned', { id, stunned: true, stunEndsAt, stunMs: GIANT_POTION_RECOVERY_STUN_MS });
            io.emit('statsUpdate', players);
            setTimeout(() => {
                const current = players[id];
                if (!current || !current.giantRecoveryArmed) return;
                if (Date.now() < (current.giantRecoveryEndsAt || 0)) return;
                current.isStunned = false;
                current.stunEndsAt = 0;
                current.giantRecoveryArmed = false;
                current.giantRecoveryEndsAt = 0;
                io.emit('playerStunned', { id, stunned: false, stunEndsAt: 0, stunMs: 0 });
                io.emit('statsUpdate', players);
            }, GIANT_POTION_RECOVERY_STUN_MS);
        }
    }
}

function pickupHealingCross(playerId) {
    const p = players[playerId];
    if (!p || !healingCross || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) return;
    const distance = Math.hypot(p.x - healingCross.x, p.y - healingCross.y);
    if (distance > HEAL_CROSS_PICKUP_RADIUS) return;
    const maxHp = getMaxHpFromStats(p.stats);
    const amount = Math.min(Math.max(0, maxHp - p.hp), Math.max(1, Math.floor(maxHp * 0.3)));
    if (amount <= 0) {
        clearHealingCross(true);
        return;
    }
    p.hp = Math.min(maxHp, p.hp + amount);
    io.emit('healFloatingText', { playerId, amount, x: p.x, y: p.y });
    io.emit('statsUpdate', players);
    clearHealingCross(true);
}

function updateHealingCrosses() {
    if (!healingCross) return;
    if (Date.now() >= healingCross.expiresAt) {
        clearHealingCross(true);
        return;
    }
    for (const [id, p] of Object.entries(players)) {
        if (!p || p.hp <= 0 || p.isSelectingLoadout || p.isUpgrading) continue;
        if (Math.hypot(p.x - healingCross.x, p.y - healingCross.y) <= HEAL_CROSS_PICKUP_RADIUS) {
            pickupHealingCross(id);
            return;
        }
    }
}

function getKillLevelGain(victimLevel) {
    const level = Math.max(1, Math.floor(Number.isFinite(victimLevel) ? victimLevel : 1));
    return Math.max(1, Math.ceil(level * 0.5));
}

function applyBowImpact(attackerId, targetId, payload, reflected) {
    const finalAttacker = players[attackerId];
    const finalTarget = players[targetId];
    if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout) return;

    const now = Date.now();
    const startX = Number.isFinite(payload.startX) ? payload.startX : finalAttacker.x;
    const startY = Number.isFinite(payload.startY) ? payload.startY : finalAttacker.y;
    const endX = Number.isFinite(payload.endX) ? payload.endX : finalTarget.x;
    const endY = Number.isFinite(payload.endY) ? payload.endY : finalTarget.y;
    const projectileId = String(payload.projectileId || createProjectileId('bow'));
    const attackRange = getWeaponAttackProfile(finalAttacker.weapon).reach * (finalAttacker.stats && Number.isFinite(finalAttacker.stats.range) ? finalAttacker.stats.range : 1) * getAttackMultiplier(finalAttacker);
    if (Math.hypot(finalTarget.x - endX, finalTarget.y - endY) > 26) return;

    const angle = Number.isFinite(payload.angle) ? payload.angle : Math.atan2(endY - startY, endX - startX);
    const angleToAttacker = Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x);
    const isFacingAttacker = getAngleDiff(finalTarget.angle, angleToAttacker) < (Math.PI / 3);
    let damage = Math.floor(11 * (finalAttacker.stats && Number.isFinite(finalAttacker.stats.dmg) ? finalAttacker.stats.dmg : 1));
    if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < JUST_GUARD_WINDOW_MS && !reflected) {
        const reflectedId = createProjectileId('bowr');
        const reflectedPayload = {
            projectileId: reflectedId,
            startX: finalTarget.x,
            startY: finalTarget.y,
            endX: finalAttacker.x,
            endY: finalAttacker.y,
            angle: Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x),
            maxDistance: Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y)),
        };
        io.emit('bowProjectileResolved', { projectileId });
        io.emit('bowProjectile', {
            projectileId: reflectedId,
            originId: targetId,
            startX: reflectedPayload.startX,
            startY: reflectedPayload.startY,
            endX: reflectedPayload.endX,
            endY: reflectedPayload.endY,
            angle: reflectedPayload.angle,
            reflected: true,
            duration: Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))),
        });
        setTimeout(() => applyBowImpact(targetId, attackerId, reflectedPayload, true), Math.max(180, Math.min(800, Math.round(reflectedPayload.maxDistance * 0.9))));
        return;
    }

    if (finalTarget.isGuarding && isFacingAttacker) {
        damage = Math.floor(damage * 0.5);
    }

    io.emit('bowProjectileResolved', { projectileId });
    io.emit('combatEffect', {
        x: finalTarget.x,
        y: finalTarget.y,
        angle,
        weapon: 'bow',
    });
    finalTarget.hp -= damage;
    if (finalTarget.hp <= 0) {
        finalTarget.hp = 0;
        finalTarget.deaths++;
        finalAttacker.kills++;
        updateAccountScore(finalAttacker.accountId, 'kills', 1);
        updateAccountScore(finalTarget.accountId, 'deaths', 1);
        const levelsGained = getKillLevelGain(finalTarget.level);
        finalAttacker.level += levelsGained;
        finalAttacker.hp = Math.min(getMaxHpFromStats(finalAttacker.stats), finalAttacker.hp + Math.floor(getMaxHpFromStats(finalAttacker.stats) * 0.5));
        finalAttacker.isUpgrading = true;
        finalAttacker.pendingUpgrades += levelsGained;
        finalTarget.level = 1;
        finalTarget.stats = createBaseStatsForWeapon(finalTarget.weapon);
        finalTarget.upgradeCounts = createUpgradeCounts();
        finalTarget.pendingUpgrades = 0;
        finalTarget.isUpgrading = false;
        io.emit('playerDied', { victimId: targetId, attackerId });
        if (levelsGained > 0) io.to(attackerId).emit('levelUp', { newLevel: finalAttacker.level, count: levelsGained });
        setTimeout(() => {
            if (players[targetId]) {
                players[targetId].hp = getMaxHpFromStats(players[targetId].stats);
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

app.post('/api/auth/register', async (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const nickname = sanitizeName(req.body && req.body.nickname, '');
    const password = sanitizeAccountPassword(req.body && req.body.password);
    const confirmPassword = sanitizeAccountPassword(req.body && req.body.confirmPassword);

    if (!id || id.length < 2) return res.status(400).json({ ok: false, error: '아이디는 2자 이상이어야 합니다.' });
    if (!nickname || nickname.length < 2) return res.status(400).json({ ok: false, error: '닉네임은 2자 이상이어야 합니다.' });
    if (!password) return res.status(400).json({ ok: false, error: '비밀번호를 입력해 주세요.' });
    if (password !== confirmPassword) return res.status(400).json({ ok: false, error: '비밀번호가 일치하지 않습니다.' });
    if (!dbPool) return res.status(500).json({ ok: false, error: 'DATABASE_URL이 설정되지 않았습니다.' });

    const existing = await dbPool.query('SELECT 1 FROM accounts WHERE id = $1 OR nickname = $2 LIMIT 1', [id, nickname]);
    if (existing.rowCount > 0) {
        return res.status(409).json({ ok: false, error: '이미 사용 중인 아이디 또는 닉네임입니다.' });
    }

    await dbPool.query(
        'INSERT INTO accounts (id, nickname, password_hash, kills, deaths) VALUES ($1, $2, $3, 0, 0)',
        [id, nickname, hashPassword(password)]
    );
    return res.json({ ok: true, id, nickname });
});

app.post('/api/auth/login', async (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const password = sanitizeAccountPassword(req.body && req.body.password);
    if (!id || !password) return res.status(400).json({ ok: false, error: '아이디와 비밀번호를 입력해 주세요.' });
    if (!dbPool) return res.status(500).json({ ok: false, error: 'DATABASE_URL이 설정되지 않았습니다.' });

    const result = await dbPool.query('SELECT id, nickname, password_hash FROM accounts WHERE id = $1', [id]);
    const account = result.rows[0];
    if (!account || !verifyPassword(password, account.password_hash)) {
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

function emitAshProjectile(originId, impactId, startX, startY, endX, endY, reflected) {
    io.emit('ashProjectile', {
        originId,
        impactId,
        startX,
        startY,
        endX,
        endY,
        reflected: Boolean(reflected),
        duration: Math.max(140, Math.min(700, Math.round(Math.hypot(endX - startX, endY - startY) * 1.15))),
    });
}

function applyAshImpact(attackerId, targetId, payload, reflected) {
    const finalAttacker = players[attackerId];
    const finalTarget = players[targetId];
    if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout || finalTarget.isStunned) return;

    const now = Date.now();
    const wireProgress = Number.isFinite(payload.progress)
        ? Math.max(0, Math.min(1, payload.progress))
        : Math.max(0, Math.min(1, finalAttacker.wire && Number.isFinite(finalAttacker.wire.progress) ? finalAttacker.wire.progress : 1));
    const wireTx = Number.isFinite(payload.tx)
        ? payload.tx
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.tx) ? finalAttacker.wire.tx : finalAttacker.x);
    const wireTy = Number.isFinite(payload.ty)
        ? payload.ty
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.ty) ? finalAttacker.wire.ty : finalAttacker.y);
    const maxDistance = Number.isFinite(payload.maxDistance)
        ? Math.max(1, payload.maxDistance)
        : (finalAttacker.wire && Number.isFinite(finalAttacker.wire.maxDistance) ? finalAttacker.wire.maxDistance : 500);
    const wireTip = {
        x: finalAttacker.x + (wireTx - finalAttacker.x) * wireProgress,
        y: finalAttacker.y + (wireTy - finalAttacker.y) * wireProgress
    };
    if (Math.hypot(finalTarget.x - wireTip.x, finalTarget.y - wireTip.y) > 28) return;
    finalAttacker.lastWireAt = now;

    const distanceTravelled = Math.max(0, Math.min(maxDistance, maxDistance * wireProgress));
    const ratio = maxDistance > 0 ? distanceTravelled / maxDistance : 0;
    let stunMs = Math.round((0.3 + (ratio * 1.7)) * 1000);
    stunMs = Math.max(300, Math.min(2000, stunMs));
    const angleToAttacker = Math.atan2(finalAttacker.y - finalTarget.y, finalAttacker.x - finalTarget.x);
    const isFacingAttacker = getAngleDiff(finalTarget.angle, angleToAttacker) < (Math.PI / 3);

    if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < JUST_GUARD_WINDOW_MS) {
        const reflectDistance = Math.max(1, Math.hypot(finalAttacker.x - finalTarget.x, finalAttacker.y - finalTarget.y));
        const reflectedPayload = {
            targetId: attackerId,
            progress: 0,
            tx: finalAttacker.x,
            ty: finalAttacker.y,
            maxDistance: reflectDistance,
            kind: 'ash',
            reflectedFrom: targetId,
        };
        io.emit('combatEffect', {
            x: finalTarget.x,
            y: finalTarget.y,
            angle: Math.atan2(finalTarget.y - finalAttacker.y, finalTarget.x - finalAttacker.x),
            weapon: 'ash',
        });
        emitAshProjectile(targetId, attackerId, finalTarget.x, finalTarget.y, finalAttacker.x, finalAttacker.y, true);
        setTimeout(() => {
            applyAshImpact(targetId, attackerId, reflectedPayload, true);
        }, Math.max(140, Math.min(700, Math.round(reflectDistance * 1.15))));
        return;
    }

    if (finalTarget.isGuarding && isFacingAttacker) {
        stunMs = Math.round(stunMs * 0.5);
    }

    const stunEndsAt = Date.now() + stunMs;
    io.emit('combatEffect', {
        x: finalTarget.x,
        y: finalTarget.y,
        angle: Math.atan2(finalTarget.y - finalAttacker.y, finalTarget.x - finalAttacker.x),
        weapon: 'ash',
    });
    finalTarget.isStunned = true;
    io.emit('playerStunned', { id: targetId, stunned: true, stunEndsAt, stunMs });
    setTimeout(() => {
        if (players[targetId]) {
            players[targetId].isStunned = false;
            io.emit('playerStunned', { id: targetId, stunned: false, stunEndsAt: 0 });
        }
    }, stunMs);
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
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
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

    return action;
}

io.on('connection', (socket) => {
    console.log('새 플레이어 연결:', socket.id);

    players[socket.id] = {
        id: socket.id,
        accountId: '',
        name: "Hunter_" + socket.id.substring(0, 4),
        weapon: 'sword',
        x: 200 + Math.random() * 600,
        y: 200 + Math.random() * 400,
        hp: getMaxHpFromStats(createBaseStatsForWeapon('sword')),
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
        isSelectingLoadout: true,
        upgradeCounts: createUpgradeCounts(),
        giantActive: false,
        giantScale: 1,
        giantAttackMult: 1,
        giantEndsAt: 0,
        giantRecoveryEndsAt: 0,
        giantRecoveryArmed: false,
        wire: { active: false, tx: 0, ty: 0 },
        stats: createBaseStatsForWeapon('sword'),
        skill: 'wire',
        lastMoveAt: Date.now(),
        lastWireAt: 0
    };

    socket.emit('currentPlayers', players);
    socket.emit('healingCrossUpdate', healingCross ? [healingCross] : []);
    socket.emit('giantPotionUpdate', giantPotion ? [giantPotion] : []);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('setName', (name) => {
        const p = players[socket.id];
        if (!p) return;
        p.name = sanitizeName(name, p.name);
        io.emit('statsUpdate', players);
    });

    socket.on('setAccount', async (accountId) => {
        const p = players[socket.id];
        if (!p) return;
        const account = await getAccountById(accountId);
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
        p.hp = getMaxHpFromStats(p.stats);
        io.emit('statsUpdate', players);
    });

    socket.on('setSkill', (skill) => {
        const p = players[socket.id];
        if (!p) return;
        p.skill = sanitizeSkill(skill);
        io.emit('statsUpdate', players);
    });

    socket.on('setLoadoutReady', () => {
        const p = players[socket.id];
        if (!p) return;
        p.isSelectingLoadout = false;
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
        p.upgradeCounts = p.upgradeCounts || createUpgradeCounts();
        if (type === 'dmg') p.stats.dmg += 0.2;
        else if (type === 'projectile') p.stats.projectile += 0.2;
        else if (type === 'speed') p.stats.speed += 0.25;
        else if (type === 'move') p.stats.move += 0.1;
        else if (type === 'dodge') p.stats.dodge += 0.15;
        if (Object.prototype.hasOwnProperty.call(p.upgradeCounts, type)) p.upgradeCounts[type] += 1;
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
        if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout) return;
        if (sanitizeSkill(payload.kind || finalAttacker.skill) !== 'wire') return;

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

        if (finalTarget.isGuarding && isFacingAttacker && (now - (finalTarget.guardStartTime || 0)) < JUST_GUARD_WINDOW_MS) {
            const tempId = attackerId; attackerId = targetId; targetId = tempId;
            finalAttacker = players[attackerId]; finalTarget = players[targetId];
            io.emit('chatMessage', { id: 'SYSTEM', message: `저스트 가드 성공! ${finalAttacker.name}에게 반격했습니다.` });
        }

        if (finalAttacker && finalTarget && !finalTarget.isStunned) {
            const stunEndsAt = Date.now() + WIRE_STUN_MS;
            finalTarget.isStunned = true;
            io.emit('playerStunned', { id: targetId, stunned: true, stunEndsAt, stunMs: WIRE_STUN_MS });
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
                            io.emit('playerStunned', { id: targetId, stunned: false, stunEndsAt: 0 });
                        }
                    }, WIRE_STUN_MS);
                }
            }, 30);
        }
    });

    socket.on('ashArrowHit', (payloadData) => {
        const payload = (payloadData && typeof payloadData === 'object') ? payloadData : { targetId: payloadData };
        let attackerId = socket.id;
        let targetId = payload.targetId;
        const finalAttacker = players[attackerId];
        const finalTarget = players[targetId];
        if (!finalAttacker || !finalTarget || finalTarget.isUpgrading || finalTarget.isSelectingLoadout) return;
        if (sanitizeSkill(payload.kind || finalAttacker.skill) !== 'ash') return;
        applyAshImpact(attackerId, targetId, payload, false);
    });

    socket.on('playerBowShot', (payloadData) => {
        const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
        const attacker = players[socket.id];
        if (!attacker || sanitizeWeapon(attacker.weapon) !== 'bow' || attacker.hp <= 0 || attacker.isStunned) return;
        const projectileId = String(payload.projectileId || createProjectileId('bow'));
        const angle = Number.isFinite(payload.angle) ? payload.angle : (Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle);
        const startX = Number.isFinite(payload.startX) ? payload.startX : attacker.x;
        const startY = Number.isFinite(payload.startY) ? payload.startY : attacker.y;
        const endX = Number.isFinite(payload.endX) ? payload.endX : (startX + Math.cos(angle) * 600);
        const endY = Number.isFinite(payload.endY) ? payload.endY : (startY + Math.sin(angle) * 600);
        const maxDistance = Number.isFinite(payload.maxDistance) ? Math.max(1, payload.maxDistance) : Math.max(1, Math.hypot(endX - startX, endY - startY));
        io.emit('bowProjectile', {
            projectileId,
            originId: socket.id,
            startX,
            startY,
            endX,
            endY,
            angle,
            reflected: false,
            duration: Math.max(180, Math.min(800, Math.round(maxDistance * 0.9))),
        });
    });

    socket.on('bowArrowHit', (payloadData) => {
        const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
        const attacker = players[socket.id];
        const targetId = payload.targetId;
        const target = players[targetId];
        if (!attacker || !target || sanitizeWeapon(attacker.weapon) !== 'bow' || target.isUpgrading || target.isSelectingLoadout) return;
        applyBowImpact(socket.id, targetId, payload, Boolean(payload.reflected));
    });

    socket.on('playerHitTarget', (targetId) => {
        const attacker = players[socket.id];
        const target = players[targetId];
        if (attacker && sanitizeWeapon(attacker.weapon) === 'bow') return;
        if (attacker && target && target.hp > 0 && !target.isUpgrading && !target.isSelectingLoadout) {
            const now = Date.now();
            const attackRange = getWeaponAttackProfile(attacker.weapon).reach * (attacker.stats && Number.isFinite(attacker.stats.range) ? attacker.stats.range : 1) * getAttackMultiplier(attacker);
            const canHit = attacker.isAttacking && attacker.attackPhase === 2 && isTargetInWeaponAttack(attacker, target);
            if (!canHit) return;
            if (hasHitTargetThisAttack(socket.id, targetId)) return;

            const baseDamage = attacker.comboStep === 3 ? 35 : (attacker.comboStep === 2 ? 20 : 10);
            let damage = Math.floor(baseDamage * attacker.stats.dmg * getAttackMultiplier(attacker));
            const angleToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
            const isFacingAttacker = getAngleDiff(target.angle, angleToAttacker) < (Math.PI / 3);
            if (target.isGuarding && isFacingAttacker) damage = Math.floor(damage * 0.5);
            io.emit('combatEffect', {
                x: target.x,
                y: target.y,
                angle: Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle,
                weapon: attacker.weapon || 'sword',
            });
            target.hp -= damage;
            if (target.hp <= 0) {
                target.hp = 0; target.deaths++; attacker.kills++;
                updateAccountScore(attacker.accountId, 'kills', 1);
                updateAccountScore(target.accountId, 'deaths', 1);
                const levelsGained = getKillLevelGain(target.level);
                attacker.level += levelsGained;
                attacker.hp = Math.min(getMaxHpFromStats(attacker.stats), attacker.hp + Math.floor(getMaxHpFromStats(attacker.stats) * 0.5));
                attacker.isUpgrading = true;
                attacker.pendingUpgrades += levelsGained;
                target.level = 1;
                target.stats = createBaseStatsForWeapon(target.weapon);
                target.upgradeCounts = createUpgradeCounts();
                target.pendingUpgrades = 0;
                target.isUpgrading = false;
                target.isSelectingLoadout = true;
                target.giantActive = false;
                target.giantScale = 1;
                target.giantAttackMult = 1;
                target.giantEndsAt = 0;
                target.giantRecoveryEndsAt = 0;
                target.giantRecoveryArmed = false;
                io.emit('playerDied', { victimId: targetId, attackerId: socket.id });
                if (levelsGained > 0) socket.emit('levelUp', { newLevel: attacker.level, count: levelsGained });
                setTimeout(() => {
                    if (players[targetId]) {
                        players[targetId].hp = getMaxHpFromStats(players[targetId].stats);
                        players[targetId].x = 100 + Math.random() * 800;
                        players[targetId].y = 100 + Math.random() * 500;
                        players[targetId].isStunned = false;
                        players[targetId].isGuarding = false;
                        players[targetId].isSelectingLoadout = true;
                        players[targetId].giantActive = false;
                        players[targetId].giantScale = 1;
                        players[targetId].giantAttackMult = 1;
                        players[targetId].giantEndsAt = 0;
                        players[targetId].giantRecoveryEndsAt = 0;
                        players[targetId].giantRecoveryArmed = false;
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

initDatabase().catch((error) => {
    console.error('Database init failed:', error);
});

const PORT = process.env.PORT || 3000;
scheduleNextHealingCross(8000);
setInterval(updateHealingCrosses, 100);
scheduleNextGiantPotion(12000);
setInterval(updateGiantPotions, 100);
http.listen(PORT, () => { console.log(`서버 실행 중: ${PORT}`); });
