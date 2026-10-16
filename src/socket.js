const state = require('./game/state');
const {
    MAX_MOVE_SPEED,
    MOVE_TOLERANCE,
    WIRE_COOLDOWN_MS,
    WIRE_STUN_MS,
    JUST_GUARD_WINDOW_MS,
    MAX_CHAT_LENGTH,
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    MOB_TIERS,
    BOW_MAX_DISTANCE,
} = require('./config');
const { sanitizeWeapon, sanitizeSkill, sanitizeName } = require('./utils/sanitize');
const { getAngleDiff, distToSegment, createProjectileId, randomWorldPoint } = require('./utils/geometry');
const { getAccountById } = require('./db');
const {
    createBaseStatsForWeapon,
    normalizeStats,
    getWeaponAttackProfile,
    isTargetInWeaponAttack,
    getMaxHpFromStats,
    getAttackMultiplier,
    getAttackRangeMultiplier,
    createUpgradeCounts,
    createDefaultGearRush,
    createDefaultUltimate,
    getUltimateConfig,
    clearUltimateState,
} = require('./game/stats');
const { sanitizeAction } = require('./game/action');
const { resetAttackHits, hasHitTargetThisAttack, hasHitTargetForKey, clearPlayerHits } = require('./game/hits');
const { resolveKill, applyBowImpact, applyAshImpact } = require('./game/combat');
const { ULTIMATE_HANDLERS } = require('./game/ultimates');
const { getHealingCrossList, getGiantPotionList } = require('./game/pickups');
const { createProgression } = require('./game/progression');
const { getXpOrbList } = require('./game/xpOrbs');
const { getMob, damageMob, hitMobs, clearMobsForOwner } = require('./game/mobs');

const { players } = state;

function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('새 플레이어 연결:', socket.id);
        const spawnPoint = randomWorldPoint();

        players[socket.id] = {
            id: socket.id,
            accountId: '',
            name: "Hunter_" + socket.id.substring(0, 4),
            weapon: 'sword',
            x: spawnPoint.x,
            y: spawnPoint.y,
            hp: getMaxHpFromStats(createBaseStatsForWeapon('sword')),
            angle: 0,
            kills: 0,
            deaths: 0,
            level: 1,
            ...createProgression(),
            isAttacking: false,
            attackPhase: 0,
            comboStep: 0,
            isGuarding: false,
            guardStartTime: 0,
            isStunned: false,
            isUpgrading: false,
            upgradeShield: false,
            pendingUpgrades: 0,
            isSelectingLoadout: true,
            upgradeCounts: createUpgradeCounts(),
            giantActive: false,
            giantScale: 1,
            giantAttackMult: 1,
            giantEndsAt: 0,
            giantRecoveryEndsAt: 0,
            giantRecoveryArmed: false,
            gearRush: createDefaultGearRush(),
            ultimate: createDefaultUltimate(),
            wire: { active: false, tx: 0, ty: 0 },
            stats: createBaseStatsForWeapon('sword'),
            skill: 'wire',
            lastMoveAt: Date.now(),
            lastWireAt: 0
        };

        socket.emit('currentPlayers', players);
        socket.emit('healingCrossUpdate', getHealingCrossList());
        socket.emit('giantPotionUpdate', getGiantPotionList());
        socket.emit('mobTiers', MOB_TIERS.map(({ name, color, radius }) => ({ name, color, radius })));
        socket.emit('xpOrbs', getXpOrbList());
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
            clearUltimateState(p);
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

        socket.on('useUltimate', () => {
            const p = players[socket.id];
            if (!p || p.hp <= 0 || p.isStunned || p.isSelectingLoadout || p.isUpgrading) return;
            const weapon = sanitizeWeapon(p.weapon);
            const config = getUltimateConfig(weapon);
            const now = Date.now();
            const currentCooldown = Number.isFinite(p.ultimate && p.ultimate.cooldownEndsAt) ? p.ultimate.cooldownEndsAt : 0;
            if (currentCooldown > now) return;
            const applyUltimate = ULTIMATE_HANDLERS[weapon];
            if (!applyUltimate) return;
            applyUltimate(socket.id);
            p.ultimate.cooldownEndsAt = now + config.cooldownMs;
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
                p.x = Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, p.x));
                p.y = Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, p.y));
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
            if (!(p.pendingUpgrades > 0)) {
                // Nothing to apply (e.g. the player died mid-pick); just let the client close the menu.
                socket.emit('upgradeApplied');
                return;
            }
            p.stats = normalizeStats(p.stats);
            p.upgradeCounts = Object.assign(createUpgradeCounts(), p.upgradeCounts || {});
            if (type === 'dmg') p.stats.dmg += 0.2;
            else if (type === 'range') p.stats.range += 0.15;
            else if (type === 'hp') {
                p.stats.hp += 20;
                p.hp = Math.min(getMaxHpFromStats(p.stats), p.hp + 20);
            }
            else if (type === 'projectile') p.stats.projectile += 0.2;
            else if (type === 'speed') p.stats.speed += 0.25;
            else if (type === 'move') p.stats.move += 0.1;
            else if (type === 'dodge') p.stats.dodge += 0.15;
            if (Object.prototype.hasOwnProperty.call(p.upgradeCounts, type)) p.upgradeCounts[type] += 1;
            p.pendingUpgrades--;
            if (p.pendingUpgrades <= 0) {
                p.pendingUpgrades = 0;
                p.isUpgrading = false;
                p.upgradeShield = false;
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
            if (!finalAttacker || !finalTarget || finalTarget.upgradeShield || finalTarget.isSelectingLoadout) return;
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
            if (!finalAttacker || !finalTarget || finalTarget.upgradeShield || finalTarget.isSelectingLoadout) return;
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
            if (!attacker || !target || sanitizeWeapon(attacker.weapon) !== 'bow' || target.upgradeShield || target.isSelectingLoadout) return;
            applyBowImpact(socket.id, targetId, payload, Boolean(payload.reflected));
        });

        socket.on('playerHitTarget', (targetId) => {
            const attacker = players[socket.id];
            const target = players[targetId];
            if (attacker && sanitizeWeapon(attacker.weapon) === 'bow') return;
            if (attacker && target && target.hp > 0 && !target.upgradeShield && !target.isSelectingLoadout) {
                const now = Date.now();
                const attackRange = getWeaponAttackProfile(attacker.weapon).reach * (attacker.stats && Number.isFinite(attacker.stats.range) ? attacker.stats.range : 1) * getAttackRangeMultiplier(attacker);
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
                if (target.hp <= 0) resolveKill(socket.id, targetId);
                io.emit('statsUpdate', players);
            }
        });

        socket.on('mobHit', (mobId) => {
            const attacker = players[socket.id];
            const mob = getMob(mobId);
            if (!attacker || !mob || attacker.hp <= 0 || sanitizeWeapon(attacker.weapon) === 'bow') return;
            if (!attacker.isAttacking || attacker.attackPhase !== 2) return;
            // Measure to the edge of the mob's body nearest the attacker.
            const distance = Math.hypot(mob.x - attacker.x, mob.y - attacker.y) || 1;
            const inset = Math.min(mob.radius, distance);
            const nearestPoint = {
                x: mob.x - ((mob.x - attacker.x) / distance) * inset,
                y: mob.y - ((mob.y - attacker.y) / distance) * inset,
            };
            if (!isTargetInWeaponAttack(attacker, nearestPoint)) return;
            if (hasHitTargetThisAttack(socket.id, `mob:${mob.id}`)) return;
            const baseDamage = attacker.comboStep === 3 ? 35 : (attacker.comboStep === 2 ? 20 : 10);
            const damage = Math.floor(baseDamage * attacker.stats.dmg * getAttackMultiplier(attacker));
            damageMob(mob.id, socket.id, damage, Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle);
        });

        socket.on('bowArrowHitMob', (payloadData) => {
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            const attacker = players[socket.id];
            const mob = getMob(payload.mobId);
            if (!attacker || !mob || attacker.hp <= 0 || sanitizeWeapon(attacker.weapon) !== 'bow') return;
            const endX = Number.isFinite(payload.endX) ? payload.endX : mob.x;
            const endY = Number.isFinite(payload.endY) ? payload.endY : mob.y;
            if (Math.hypot(mob.x - endX, mob.y - endY) > mob.radius + 40) return;
            if (Math.hypot(mob.x - attacker.x, mob.y - attacker.y) > BOW_MAX_DISTANCE + mob.radius + 120) return;
            const hitKey = `${socket.id}:bowmob:${String(payload.projectileId || '').slice(0, 80)}`;
            if (hasHitTargetForKey(hitKey, `mob:${mob.id}`)) return;
            const damage = Math.floor(11 * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1));
            damageMob(mob.id, socket.id, damage, Number(payload.angle) || 0);
        });

        socket.on('dualRushSlash', (payloadData) => {
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            const attacker = players[socket.id];
            if (!attacker || sanitizeWeapon(attacker.weapon) !== 'dual' || !attacker.gearRush || !attacker.gearRush.active) return;
            if ((attacker.gearRush.mode || 'rush') !== 'dualRush') return;
            const startX = Number.isFinite(payload.startX) ? payload.startX : attacker.x;
            const startY = Number.isFinite(payload.startY) ? payload.startY : attacker.y;
            const endX = Number.isFinite(payload.endX) ? payload.endX : attacker.x;
            const endY = Number.isFinite(payload.endY) ? payload.endY : attacker.y;
            const slashIndex = Number.isInteger(payload.slashIndex) ? Math.max(0, payload.slashIndex) : 0;
            const comboId = String(payload.comboId || attacker.gearRush.comboId || createProjectileId('dualrush')).slice(0, 64);
            const slashKey = `${socket.id}:dualRush:${comboId}:${slashIndex}`;
            const attackRange = Math.max(40, Math.hypot(endX - startX, endY - startY) + 18);
            const profile = getWeaponAttackProfile(attacker.weapon);
            const slashWidth = profile.lineWidth + 10;
            const attackAngle = Number.isFinite(payload.angle) ? payload.angle : Math.atan2(endY - startY, endX - startX);
            let hitAny = false;

            io.emit('combatEffect', {
                x: (startX + endX) / 2,
                y: (startY + endY) / 2,
                angle: attackAngle,
                weapon: 'dual',
            });

            for (const [targetId, target] of Object.entries(players)) {
                if (targetId === socket.id || !target || target.hp <= 0 || target.upgradeShield || target.isSelectingLoadout) continue;
                if (Math.hypot(target.x - startX, target.y - startY) > attackRange) continue;
                if (distToSegment({ x: startX, y: startY }, { x: endX, y: endY }, target) > slashWidth) continue;
                if (hasHitTargetForKey(slashKey, targetId)) continue;

                const baseDamage = 6 + Math.min(5, Math.floor(slashIndex / 2));
                let damage = Math.floor(baseDamage * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
                const angleToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
                const isFacingAttacker = getAngleDiff(target.angle, angleToAttacker) < (Math.PI / 3);
                if (target.isGuarding && isFacingAttacker) damage = Math.floor(damage * 0.5);
                io.emit('combatEffect', {
                    x: target.x,
                    y: target.y,
                    angle: attackAngle,
                    weapon: 'dual',
                });
                target.hp -= damage;
                hitAny = true;
                if (target.hp <= 0) resolveKill(socket.id, targetId);
            }
            const mobDamage = Math.floor((6 + Math.min(5, Math.floor(slashIndex / 2))) * (attacker.stats && Number.isFinite(attacker.stats.dmg) ? attacker.stats.dmg : 1) * getAttackMultiplier(attacker));
            hitMobs(socket.id, (mob) => Math.hypot(mob.x - startX, mob.y - startY) <= attackRange + mob.radius
                && distToSegment({ x: startX, y: startY }, { x: endX, y: endY }, mob) <= slashWidth + mob.radius, mobDamage, attackAngle, slashKey);
            if (hitAny) io.emit('statsUpdate', players);
        });

        socket.on('chatMessage', (msg) => {
            const message = String(msg || '').trim().slice(0, MAX_CHAT_LENGTH);
            if (!message) return;
            io.emit('chatMessage', { id: socket.id, message });
        });
        socket.on('disconnect', () => {
            delete players[socket.id];
            clearPlayerHits(socket.id);
            clearMobsForOwner(socket.id);
            io.emit('playerDisconnected', socket.id);
        });
    });
}

module.exports = { registerSocketHandlers };
