const state = require('./game/state');
const {
    PARRY_STAGGER_MS,
    HAMMER_FINISHER_PLAYER_STUN_MS,
    DUAL_FLANK_DAMAGE_MULT,
    SCYTHE_PULL_DISTANCE,
    GAUNTLET_GUARD_BREAK_MS,
    MAX_CHAT_LENGTH,
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    MOB_TIERS,
    MOB_HIT_IMPACT,
    DUAL_RUSH_SLASH_COUNT,
    RUSH_PATH_SLACK,
} = require('./config');
const { sanitizeWeapon, sanitizeSkill, sanitizeName, sanitizeLook } = require('./utils/sanitize');
const { getAngleDiff, distToSegment, createProjectileId, randomWorldPoint } = require('./utils/geometry');
const { getAccountById } = require('./db');
const {
    createBaseStatsForWeapon,
    normalizeStats,
    getWeaponAttackProfile,
    isTargetInWeaponAttack,
    isRangedWeapon,
    getMaxHpFromStats,
    getAttackMultiplier,
    getAttackRangeMultiplier,
    createUpgradeCounts,
    createDefaultGearRush,
    createDefaultUltimate,
    getUltimateCooldownMs,
    clearUltimateState,
} = require('./game/stats');
const { sanitizeAction, enforceActionRules, trySpendSkill } = require('./game/action');
const { applyMovement } = require('./game/movement');
const { resetAttackHits, hasHitTargetThisAttack, hasHitTargetForKey, clearPlayerHits } = require('./game/hits');
const { resolveKill, isJustGuarding, stunPlayer, forcePlayerPosition } = require('./game/combat');
const { isGuardActive } = require('./game/defense');
const { fireBowVolley, fireSkillShot } = require('./game/projectiles');
const { castStaffOrb, placeHealPotion, placeTrap, getBlinkMark, placeBlinkMark, clearBlinkMark, getFieldState, clearFieldForOwner } = require('./game/field');
const { ULTIMATE_HANDLERS, isRootedByUltimate } = require('./game/ultimates');
const { getHealingCrossList, getGiantPotionList } = require('./game/pickups');
const { createProgression } = require('./game/progression');
const { getXpOrbList } = require('./game/xpOrbs');
const { getMob, damageMob, hitMobs, clearMobsForOwner } = require('./game/mobs');

const { players } = state;

// Weapon-specific extras of a third combo hit landing on a player.
function applyFinisherToPlayer(attacker, weapon, targetId, target, now) {
    if (weapon === 'hammer') {
        stunPlayer(targetId, HAMMER_FINISHER_PLAYER_STUN_MS);
    } else if (weapon === 'scythe') {
        // Drags the target in to just in front of the reaper.
        const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        if (Math.hypot(target.x - attacker.x, target.y - attacker.y) > SCYTHE_PULL_DISTANCE) {
            forcePlayerPosition(targetId, attacker.x + Math.cos(angle) * SCYTHE_PULL_DISTANCE, attacker.y + Math.sin(angle) * SCYTHE_PULL_DISTANCE);
        }
    } else if (weapon === 'gauntlet') {
        // Breaks the guard: it drops now and can't be raised again for a moment.
        target.isGuarding = false;
        target.guardBrokenUntil = now + GAUNTLET_GUARD_BREAK_MS;
        state.io.emit('guardBroken', { id: targetId, until: target.guardBrokenUntil, ms: GAUNTLET_GUARD_BREAK_MS });
    }
}

function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        if (!process.env.QUIET_LOGS) console.log('새 플레이어 연결:', socket.id);
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
            lifeStartedAt: 0,
            lifeMobKills: 0,
            lifePlayerKills: 0,
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
            look: sanitizeLook(null),
            lastMoveAt: Date.now(),
            lastWireAt: 0
        };

        socket.emit('currentPlayers', players);
        socket.emit('healingCrossUpdate', getHealingCrossList());
        socket.emit('giantPotionUpdate', getGiantPotionList());
        socket.emit('mobTiers', MOB_TIERS.map(({ name, color, radius }) => ({ name, color, radius })));
        socket.emit('xpOrbs', getXpOrbList());
        socket.emit('fieldState', getFieldState());
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
            // Full health only when picking a loadout; switching mid-game is no free heal.
            p.hp = p.isSelectingLoadout ? getMaxHpFromStats(p.stats) : Math.min(p.hp, getMaxHpFromStats(p.stats));
            clearUltimateState(p);
            io.emit('statsUpdate', players);
        });

        socket.on('setLook', (look) => {
            const p = players[socket.id];
            if (!p) return;
            p.look = sanitizeLook(look);
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
            if (!p.lifeStartedAt) p.lifeStartedAt = Date.now();
            io.emit('statsUpdate', players);
        });

        socket.on('useUltimate', (payloadData) => {
            const p = players[socket.id];
            if (!p || p.hp <= 0 || p.isStunned || p.isSelectingLoadout || p.isUpgrading) return;
            // Aim where the player faces right now; movement updates can lag a fresh turn.
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            if (Number.isFinite(payload.angle)) p.angle = payload.angle;
            const weapon = sanitizeWeapon(p.weapon);
            const now = Date.now();
            const currentCooldown = Number.isFinite(p.ultimate && p.ultimate.cooldownEndsAt) ? p.ultimate.cooldownEndsAt : 0;
            if (currentCooldown > now) return;
            const applyUltimate = ULTIMATE_HANDLERS[weapon];
            if (!applyUltimate) return;
            applyUltimate(socket.id);
            p.ultimate.cooldownEndsAt = now + getUltimateCooldownMs(p);
            io.emit('statsUpdate', players);
        });

        socket.on('playerMovement', (movementData) => {
            if (!movementData || typeof movementData !== 'object') return;
            if (players[socket.id] && !players[socket.id].isStunned) {
                const p = players[socket.id];
                const now = Date.now();
                if (isRootedByUltimate(p, now)) return;
                const nextX = Number(movementData.x);
                const nextY = Number(movementData.y);
                const nextAngle = Number(movementData.angle);
                if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextAngle)) return;
                // Too far for the time since the last move: cut short and snap the client back.
                if (applyMovement(p, nextX, nextY, now)) {
                    socket.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, angle: nextAngle, forced: true });
                }
                p.angle = nextAngle;
                socket.broadcast.emit('playerMoved', players[socket.id]);
            }
        });

        socket.on('playerAction', (actionData) => {
            if (players[socket.id]) {
                const action = enforceActionRules(players[socket.id], sanitizeAction(players[socket.id], actionData));
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

        // The client only says it fired; the server flies the volley and decides the hits.
        socket.on('playerBowShot', (payloadData) => {
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            const attacker = players[socket.id];
            if (!attacker || sanitizeWeapon(attacker.weapon) !== 'bow' || attacker.hp <= 0 || attacker.isStunned || attacker.isSelectingLoadout) return;
            if (!attacker.isAttacking || attacker.attackPhase !== 2) return;
            if (hasHitTargetThisAttack(socket.id, 'bow-shot')) return;
            const angle = Number.isFinite(payload.angle) ? payload.angle : (Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle);
            fireBowVolley(socket.id, angle);
        });

        socket.on('playerHitTarget', (targetId) => {
            const attacker = players[socket.id];
            const target = players[targetId];
            if (attacker && isRangedWeapon(attacker.weapon)) return;
            if (attacker && target && target.hp > 0 && !target.upgradeShield && !target.isSelectingLoadout) {
                const now = Date.now();
                const attackRange = getWeaponAttackProfile(attacker.weapon).reach * (attacker.stats && Number.isFinite(attacker.stats.range) ? attacker.stats.range : 1) * getAttackRangeMultiplier(attacker);
                const canHit = attacker.isAttacking && attacker.attackPhase === 2 && isTargetInWeaponAttack(attacker, target);
                if (!canHit) return;
                if (hasHitTargetThisAttack(socket.id, targetId)) return;

                const angleToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
                const facingDiff = getAngleDiff(target.angle, angleToAttacker);
                const isFacingAttacker = facingDiff < (Math.PI / 3);
                // Just guard: the hit is blocked and the attacker is staggered.
                if (isFacingAttacker && isJustGuarding(target, now)) {
                    io.emit('combatEffect', { x: target.x, y: target.y, angle: angleToAttacker, weapon: 'parry' });
                    stunPlayer(socket.id, PARRY_STAGGER_MS);
                    return;
                }
                const weapon = sanitizeWeapon(attacker.weapon);
                const baseDamage = attacker.comboStep === 3 ? 35 : (attacker.comboStep === 2 ? 20 : 10);
                let damage = Math.floor(baseDamage * attacker.stats.dmg * getAttackMultiplier(attacker));
                if (weapon === 'dual' && facingDiff > Math.PI / 2) damage = Math.floor(damage * DUAL_FLANK_DAMAGE_MULT);
                if (isGuardActive(target, now) && isFacingAttacker) damage = Math.floor(damage * 0.5);
                io.emit('combatEffect', {
                    x: target.x,
                    y: target.y,
                    angle: Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle,
                    weapon: attacker.weapon || 'sword',
                    damage,
                });
                target.hp -= damage;
                if (target.hp <= 0) resolveKill(socket.id, targetId);
                else if (attacker.comboStep === 3) applyFinisherToPlayer(attacker, weapon, targetId, target, now);
                io.emit('statsUpdate', players);
            }
        });

        socket.on('mobHit', (mobId) => {
            const attacker = players[socket.id];
            const mob = getMob(mobId);
            if (!attacker || !mob || attacker.hp <= 0 || isRangedWeapon(attacker.weapon)) return;
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
            const hitImpact = MOB_HIT_IMPACT[sanitizeWeapon(attacker.weapon)];
            const isFinisher = attacker.comboStep === 3;
            const impact = hitImpact ? {
                fromX: attacker.x,
                fromY: attacker.y,
                knockback: isFinisher ? hitImpact.finisherKnockback : hitImpact.knockback,
                stunMs: isFinisher ? hitImpact.finisherStunMs : 0,
            } : null;
            damageMob(mob.id, socket.id, damage, Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle, impact);
        });

        socket.on('dualRushSlash', (payloadData) => {
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            const attacker = players[socket.id];
            if (!attacker || sanitizeWeapon(attacker.weapon) !== 'dual' || !attacker.gearRush || !attacker.gearRush.active) return;
            if ((attacker.gearRush.mode || 'rush') !== 'dualRush') return;
            // Ten slashes per rush, counted here, and only along the rush's own path.
            if ((attacker.rushSlashes || 0) >= DUAL_RUSH_SLASH_COUNT) return;
            const rushPath = [{ x: attacker.gearRush.startX, y: attacker.gearRush.startY }, { x: attacker.gearRush.tx, y: attacker.gearRush.ty }];
            const onPath = (x, y) => Number.isFinite(x) && Number.isFinite(y) && distToSegment(rushPath[0], rushPath[1], { x, y }) <= RUSH_PATH_SLACK;
            if (!onPath(payload.startX, payload.startY) || !onPath(payload.endX, payload.endY)) return;
            const { startX, startY, endX, endY } = payload;
            const slashIndex = attacker.rushSlashes || 0;
            attacker.rushSlashes = slashIndex + 1;
            const slashKey = `${socket.id}:dualRush:${attacker.rushId}:${slashIndex}`;
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
                if (isGuardActive(target) && isFacingAttacker) damage = Math.floor(damage * 0.5);
                io.emit('combatEffect', {
                    x: target.x,
                    y: target.y,
                    angle: attackAngle,
                    weapon: 'dual',
                    damage,
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

        socket.on('staffCast', (payloadData) => {
            const p = players[socket.id];
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            if (!p || p.hp <= 0 || p.isStunned || p.isSelectingLoadout || sanitizeWeapon(p.weapon) !== 'staff') return;
            if (!p.isAttacking || p.attackPhase !== 2) return;
            if (hasHitTargetThisAttack(socket.id, 'staff-cast')) return;
            const angle = Number.isFinite(payload.angle) ? payload.angle : (Number.isFinite(p.aAngle) ? p.aAngle : p.angle);
            const range = getWeaponAttackProfile('staff').reach * (p.stats && Number.isFinite(p.stats.range) ? p.stats.range : 1);
            castStaffOrb(socket.id, angle, { range, big: p.comboStep === 3 });
        });

        // Wire, ash arrow, trap, blink mark and heal potion (the rush starts through playerAction).
        socket.on('useSkill', (payloadData) => {
            const p = players[socket.id];
            const payload = (payloadData && typeof payloadData === 'object') ? payloadData : {};
            if (!p || p.hp <= 0 || p.isStunned || p.isSelectingLoadout || p.isUpgrading) return;
            const kind = sanitizeSkill(p.skill);
            if (sanitizeSkill(payload.kind) !== kind) return;
            const now = Date.now();
            if (kind === 'blink') {
                // Second press inside the window: jump back to the mark.
                const mark = getBlinkMark(socket.id, now);
                if (mark) {
                    clearBlinkMark(socket.id);
                    io.emit('blinked', { id: socket.id, fromX: p.x, fromY: p.y, x: mark.x, y: mark.y });
                    forcePlayerPosition(socket.id, mark.x, mark.y);
                    return;
                }
                if (trySpendSkill(p, kind, now)) placeBlinkMark(socket.id);
                return;
            }
            if (!trySpendSkill(p, kind, now)) return;
            const angle = Number.isFinite(payload.angle) ? payload.angle : p.angle;
            if (kind === 'wire' || kind === 'ash') fireSkillShot(kind, socket.id, angle);
            else if (kind === 'trap') placeTrap(socket.id);
            else if (kind === 'potion') placeHealPotion(socket.id);
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
            clearFieldForOwner(socket.id);
            io.emit('playerDisconnected', socket.id);
        });
    });
}

module.exports = { registerSocketHandlers };
