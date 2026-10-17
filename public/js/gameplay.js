function updateCombatEffects(dt) {
    combatEffects = combatEffects.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
    });
}

function updateHealingTexts(dt) {
    healingTexts = healingTexts.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
    });
}

function updateAshProjectiles(dt) {
    ashProjectiles = ashProjectiles.filter((effect) => {
        effect.progress = Math.min(1, (effect.progress || 0) + dt / Math.max(0.001, effect.duration || 0.35));
        return effect.progress < 1;
    });
}

// Arrows are flown by the server; this only animates them until it says they stopped.
function updateBowProjectiles(dt) {
    bowProjectiles = bowProjectiles.filter((effect) => {
        effect.progress = Math.min(1, (effect.progress || 0) + dt / Math.max(0.001, effect.duration || 0.4));
        return effect.progress < 1;
    });
}

function updateDragonProjectiles(dt) {
    dragonProjectiles = dragonProjectiles.filter((effect) => {
        effect.progress = Math.min(1, (effect.progress || 0) + dt / Math.max(0.001, (effect.duration || 0.6) / 1000));
        return effect.progress < 1;
    });
}

function updateGearRush(dt) {
    if (!player.gearRush || !player.gearRush.active) return;
    const rush = player.gearRush;
    const now = Date.now();
    const duration = Math.max(0.08, Number(rush.duration) || 0.24);
    const windupMs = rush.mode === 'dualRush' ? Math.round(DUAL_RUSH_WINDUP_SEC * 1000) : 0;
    const effectiveElapsed = Math.max(0, (now - Number(rush.startTime || now) - windupMs) / 1000);
    const progress = Math.max(0, Math.min(1, effectiveElapsed / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const startX = Number.isFinite(rush.startX) ? rush.startX : player.x;
    const startY = Number.isFinite(rush.startY) ? rush.startY : player.y;
    const tx = Number.isFinite(rush.tx) ? rush.tx : player.x;
    const ty = Number.isFinite(rush.ty) ? rush.ty : player.y;
    const prevX = player.x;
    const prevY = player.y;
    if (rush.mode === 'dualRush' && now < Number(rush.pauseUntil || 0)) {
        player.animTime += dt * 12;
        player.moveDir = { x: 0, y: 0 };
        socket.emit('playerAction', {
            gearRush: {
                active: true,
                startX: rush.startX,
                startY: rush.startY,
                tx: rush.tx,
                ty: rush.ty,
                startTime: rush.startTime,
                duration: rush.duration,
                mode: rush.mode,
                comboId: rush.comboId,
                pauseUntil: rush.pauseUntil,
                slashIndex: rush.slashIndex,
                lastSlashAt: rush.lastSlashAt,
                startResolved: rush.startResolved,
            }
        });
        return;
    }
    player.x = startX + (tx - startX) * eased;
    player.y = startY + (ty - startY) * eased;
    player.angle = Math.atan2(ty - startY, tx - startX);
    player.animTime += dt * 12;
    player.moveDir = { x: 0, y: 0 };
    if (rush.mode === 'dualRush' && progress > 0 && rush.slashIndex < DUAL_RUSH_SLASH_COUNT) {
        const slashIntervalMs = Math.round(DUAL_RUSH_SLASH_INTERVAL_SEC * 1000);
        if (!rush.lastSlashAt || (now - rush.lastSlashAt) >= slashIntervalMs) {
            const slashIndex = rush.slashIndex++;
            rush.lastSlashAt = now;
            socket.emit('dualRushSlash', {
                comboId: rush.comboId,
                slashIndex,
                startX: prevX,
                startY: prevY,
                endX: player.x,
                endY: player.y,
                angle: player.angle,
                weapon: player.weapon,
            });
            if (rush.slashIndex >= DUAL_RUSH_SLASH_COUNT) {
                rush.mode = 'rush';
            }
        }
    }
    socket.emit('playerAction', {
        gearRush: {
            active: true,
            startX: rush.startX,
            startY: rush.startY,
            tx: rush.tx,
            ty: rush.ty,
            startTime: rush.startTime,
            duration: rush.duration,
            mode: rush.mode,
            comboId: rush.comboId,
            pauseUntil: rush.pauseUntil,
            slashIndex: rush.slashIndex,
            lastSlashAt: rush.lastSlashAt,
            startResolved: rush.startResolved,
        }
    });
    if (progress >= 1) {
        player.gearRush.active = false;
        socket.emit('playerAction', { gearRush: { active: false } });
    }
}

function getMobRadius(mob) {
    if (mob.boss) return BOSS_RADIUS;
    const tier = mobTiers[mob.tier];
    return tier && Number.isFinite(tier.radius) ? tier.radius : 16;
}

// Nearest point on the mob's body to `from`, so weapon reach counts the mob's size.
function getMobNearestPoint(mob, from) {
    const distance = Math.hypot(mob.x - from.x, mob.y - from.y) || 1;
    const inset = Math.min(getMobRadius(mob), distance);
    return {
        x: mob.x - ((mob.x - from.x) / distance) * inset,
        y: mob.y - ((mob.y - from.y) / distance) * inset,
    };
}

// Mob positions arrive ~20 times a second; ease toward them for smooth movement.
function updateMobVisuals(dt) {
    const blend = Math.min(1, dt * 14);
    mobs.forEach((mob) => {
        mob.x += (mob.tx - mob.x) * blend;
        mob.y += (mob.ty - mob.y) * blend;
        if (mob.flash > 0) mob.flash -= dt;
    });
    mobDeathEffects = mobDeathEffects.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
    });
    collectingOrbs = collectingOrbs.filter((orb) => {
        orb.life -= dt;
        return orb.life > 0;
    });
}

function selectUpgrade(type) {
    if (upgradeTimerInterval) clearInterval(upgradeTimerInterval);
    socket.emit('selectUpgrade', type);
}

function update(dt) {
    const canTickCooldowns = gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0;
    if (canTickCooldowns) {
        if(player.guardCooldown > 0) player.guardCooldown -= dt;
        if(player.dodgeCooldown > 0) player.dodgeCooldown -= dt;
        if(player.wireCooldown > 0) player.wireCooldown -= dt;
        updateCooldownUI();
    }
    if (gameState !== 'PLAYING' || isChatting || isUpgrading || player.hp <= 0 || player.isStunned) return;
    const prev = { x: player.x, y: player.y, angle: player.angle };
    let mx = 0, my = 0;
    if(keys['KeyW']) my -= 1; if(keys['KeyS']) my += 1; if(keys['KeyA']) mx -= 1; if(keys['KeyD']) mx += 1;
    if(player.moveDir.x !== 0 || player.moveDir.y !== 0) { mx = player.moveDir.x; my = player.moveDir.y; }

    if(player.gearRush && player.gearRush.active) {
        updateGearRush(dt);
    } else if(player.isDodging) {
        player.stats = normalizeStats(player.stats);
        const dodgeMultiplier = Number.isFinite(player.stats.dodge) ? player.stats.dodge : 1;
        player.x += player.dDX * 800 * dodgeMultiplier * dt; player.y += player.dDY * 800 * dodgeMultiplier * dt;
        player.dTimer -= dt; if(player.dTimer <= 0) { player.isDodging = false; socket.emit('playerAction', { isDodging: false }); }
    } else if(player.isAttacking || isRootedByUltimate()) {
        // Attacks are swung in place, and the hammer slam plants you until it fades.
    } else if(mx !== 0 || my !== 0) {
        player.stats = normalizeStats(player.stats);
        const d = Math.hypot(mx, my), s = (player.isGuarding ? 175 : 350) * player.stats.move * dt;
        player.x += (mx/d) * s; player.y += (my/d) * s;
        if (aimMode !== 'mouse') player.angle = Math.atan2(my, mx);
        player.animTime += dt * 10;
    } else player.animTime = 0;

    if(player.wire.active) {
        const wire = player.wire;
        if (!wire.holdUntil) wire.progress = Math.min(1, (wire.progress || 0) + dt * (wire.kind === 'ash' ? 3.6 : 3.2));
        // The server decides what the wire or ash arrow hits (see skillShotEnd); this only draws it.
        if (wire.progress >= 1 && !wire.holdUntil) {
            endWire();
        } else if (wire.holdUntil && Date.now() >= wire.holdUntil) {
            endWire();
        } else if (!wire.holdUntil) {
            socket.emit('playerAction', { wire: { active: true, kind: wire.kind || 'wire', tx: wire.tx, ty: wire.ty, progress: wire.progress, maxDistance: wire.maxDistance || 500 } });
        }
    }

    player.x = Math.max(25, Math.min(WORLD_WIDTH - 25, player.x));
    player.y = Math.max(25, Math.min(WORLD_HEIGHT - 25, player.y));
    if (player.isGuarding) { player.guardActiveTimer += dt; if (player.guardActiveTimer >= GUARD_DURATION_SEC) releaseGuard(); }
    
    updateCombatReadouts();

    if(allPlayers[myId]) {
        Object.assign(allPlayers[myId], {
            x: player.x, y: player.y, angle: player.angle, animTime: player.animTime, 
            isGuarding: player.isGuarding, guardActiveTimer: player.guardActiveTimer,
            isAttacking: player.isAttacking, isDodging: player.isDodging,
            comboStep: player.comboStep, attackPhase: player.attackPhase, aAngle: player.aAngle,
            gearRush: {
                active: player.gearRush.active,
                startX: player.gearRush.startX,
                startY: player.gearRush.startY,
                tx: player.gearRush.tx,
                ty: player.gearRush.ty,
                startTime: player.gearRush.startTime,
                duration: player.gearRush.duration,
                mode: player.gearRush.mode,
                comboId: player.gearRush.comboId,
                pauseUntil: player.gearRush.pauseUntil,
                slashIndex: player.gearRush.slashIndex,
                lastSlashAt: player.gearRush.lastSlashAt,
                startResolved: player.gearRush.startResolved,
            },
            wire: { active: player.wire.active, kind: player.wire.kind, tx: player.wire.tx, ty: player.wire.ty, progress: player.wire.progress, maxDistance: player.wire.maxDistance },
            level: player.level, weapon: player.weapon, skill: player.skill, stats: player.stats, isUpgrading: isUpgrading
        });
    }
    if(prev.x !== player.x || prev.y !== player.y || prev.angle !== player.angle) socket.emit('playerMovement', { x: player.x, y: player.y, angle: player.angle });
    if(player.isAttacking) updateAttack(dt);
}

// Effects and projectiles keep moving whatever the player is doing (stunned, picking an
// upgrade, chatting); only the player's own actions pause.
function updateVisuals(dt) {
    updateCombatEffects(dt);
    updateAshProjectiles(dt);
    updateBowProjectiles(dt);
    updateDragonProjectiles(dt);
    updateHealingTexts(dt);
}

// Being stunned cuts off whatever the player was doing, cleanly.
function cancelActionsOnStun() {
    if (player.isAttacking || player.attackPhase) {
        player.isAttacking = false;
        player.attackPhase = 0;
        player.bowShotFired = false;
        socket.emit('playerAction', { isAttacking: false, attackPhase: 0 });
    }
    if (player.gearRush && player.gearRush.active) {
        player.gearRush.active = false;
        socket.emit('playerAction', { gearRush: { active: false } });
    }
    if (player.isDodging) player.isDodging = false;
    if (player.isGuarding) player.isGuarding = false;
    if (player.wire.active) endWire();
    player.moveDir = { x: 0, y: 0 };
}

function updateAttack(dt) {
    player.attackTimer -= dt;
    const speedMult = getUltimateSpeedMultiplier(player);
    if(player.attackPhase === 1 && player.attackTimer <= 0) {
        player.attackPhase = 2;
        if (normalizeWeapon(player.weapon) === 'bow') {
            player.attackTimer = 0.05 / (player.stats.speed * speedMult);
            socket.emit('playerAction', { attackPhase: 2 });
            if (!player.bowShotFired) {
                startBowShot();
                player.bowShotFired = true;
            }
        } else if (normalizeWeapon(player.weapon) === 'staff') {
            // The server flies the orb; one per swing.
            player.attackTimer = 0.08 / (player.stats.speed * speedMult);
            socket.emit('playerAction', { attackPhase: 2 });
            if (!player.bowShotFired) {
                socket.emit('staffCast', { angle: player.aAngle || player.angle });
                player.bowShotFired = true;
            }
        } else {
            player.attackTimer = 0.08 / (player.stats.speed * speedMult);
            socket.emit('playerAction', { attackPhase: 2 });
            const attackRange = getStrikeRange(player.weapon, player.stats, player);
            Object.keys(allPlayers).forEach(id => {
                if(id !== myId && allPlayers[id].hp > 0 && isTargetInAttackArc(allPlayers[id], attackRange)) socket.emit('playerHitTarget', id);
            });
            mobs.forEach((mob) => {
                if (isTargetInAttackArc(getMobNearestPoint(mob, player), attackRange)) socket.emit('mobHit', mob.id);
            });
        }
    } else if(player.attackPhase === 2 && player.attackTimer <= 0) { player.attackPhase = 3; player.attackTimer = 0.15 / (player.stats.speed * speedMult); socket.emit('playerAction', { attackPhase: 3 }); }
    else if(player.attackPhase === 3 && player.attackTimer <= 0) { endAttack(); }
}

function isTargetInAttackArc(target, range) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const profile = getWeaponAttackProfile(player.weapon);
    if (Math.hypot(dx, dy) > range) return false;
    const attackAngle = player.aAngle || player.angle;
    if (normalizeWeapon(player.weapon) === 'spear') {
        const endX = player.x + Math.cos(attackAngle) * range;
        const endY = player.y + Math.sin(attackAngle) * range;
        return distToSegment({ x: player.x, y: player.y }, { x: endX, y: endY }, target) <= profile.lineWidth * getComboFinisher(player.weapon, player.comboStep).width;
    }
    if (player.comboStep === 3) return true;
    const targetAngle = Math.atan2(dy, dx);
    const diff = getAngleDiff(attackAngle, targetAngle);
    return diff <= profile.arc;
}

function getAngleDiff(a1, a2) {
    let diff = a1 - a2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff);
}

function isGuardBroken() { return (player.guardBrokenUntil || 0) > Date.now(); }
function startGuard() { if (player.hp > 0 && !player.isStunned && player.guardCooldown <= 0 && !isGuardBroken()) { player.isGuarding = true; player.guardActiveTimer = 0; socket.emit('playerAction', { isGuarding: true, guardStartTime: Date.now() }); } }
function releaseGuard() { if (player.isGuarding) { player.isGuarding = false; player.guardCooldown = 1.0; socket.emit('playerAction', { isGuarding: false }); } }
function releaseGuardForAction() { if (player.isGuarding) releaseGuard(); }
function startDodge() { if (player.hp <= 0 || player.isStunned || player.isDodging || isRootedByUltimate() || player.isAttacking || player.dodgeCooldown > 0 || (player.gearRush && player.gearRush.active)) { releaseGuardForAction(); return; } releaseGuardForAction(); player.stats = normalizeStats(player.stats); player.isDodging = true; player.dTimer = 0.2; player.dDX = Math.cos(player.angle); player.dDY = Math.sin(player.angle); player.dodgeCooldown = 1.0; socket.emit('playerAction', { isDodging: true }); }
function canStartAttack() { return gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned; }
function beginAttack() {
    releaseGuardForAction();
    if (!canStartAttack() || player.isAttacking) return;
    if (player.gearRush && player.gearRush.active) {
        return;
    }
    player.isAttacking = true;
    player.comboStep = (player.comboStep % 3) + 1;
    player.attackPhase = 1;
    player.attackTimer = 0.12 / player.stats.speed;
    player.aAngle = player.angle;
    player.bowShotFired = false;
    socket.emit('playerAction', { isAttacking: true, comboStep: player.comboStep, attackPhase: 1, aAngle: player.aAngle });
}
function canUseUltimate() {
    return gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned;
}
function getUltimateCooldownRemaining(sourcePlayer) {
    const ultimate = getUltimateState(sourcePlayer);
    return Math.max(0, (ultimate.cooldownEndsAt || 0) - Date.now());
}
function useUltimate() {
    if (!canUseUltimate()) return;
    const weapon = normalizeWeapon(player.weapon);
    const config = ULTIMATE_PRESETS[weapon];
    if (!config) return;
    if (getUltimateCooldownRemaining(player) > 0) return;
    player.ultimate = {
        active: true,
        type: weapon,
        startAt: Date.now(),
        endsAt: Date.now() + Math.round(config.duration * 1000),
        cooldownEndsAt: Date.now() + Math.round(getUltimateCooldownSec(player) * 1000),
        radius: weapon === 'spear' ? 180 : 0,
        extra: 0,
        // Shown right away for the cooldown; the server's copy replaces it with the real area.
        predicted: true,
    };
    updateHUD();
    socket.emit('useUltimate', { weapon, angle: player.angle });
}
function isAttackHeld() { return attackHoldSources.size > 0; }
function endAttack() {
    if (!player.isAttacking && player.attackPhase === 0) return;
    player.isAttacking = false;
    player.attackPhase = 0;
    player.bowShotFired = false;
    socket.emit('playerAction', { isAttacking: false, attackPhase: 0 });
    if (isAttackHeld()) beginAttack();
}
function triggerDualRushSlash() {
    const rush = player.gearRush;
    if (!rush || !rush.active || normalizeWeapon(player.weapon) !== 'dual') return;
    if (rush.mode === 'dualRush') return;
    const now = Date.now();
    rush.mode = 'dualRush';
    rush.comboId = `${myId || 'dual'}:${now}:${Math.random().toString(16).slice(2, 8)}`;
    rush.pauseUntil = now + Math.round(DUAL_RUSH_WINDUP_SEC * 1000);
    rush.slashIndex = 0;
    rush.lastSlashAt = 0;
    rush.startResolved = false;
    socket.emit('playerAction', {
        gearRush: {
            active: true,
            startX: rush.startX,
            startY: rush.startY,
            tx: rush.tx,
            ty: rush.ty,
            startTime: rush.startTime,
            duration: rush.duration,
            mode: rush.mode,
            comboId: rush.comboId,
            pauseUntil: rush.pauseUntil,
            slashIndex: rush.slashIndex,
            lastSlashAt: rush.lastSlashAt,
            startResolved: rush.startResolved,
        }
    });
}
function startBowShot() {
    releaseGuardForAction();
    if(player.isDodging || player.hp <= 0 || player.isStunned) return;
    // Drawn right away; the server flies the same arrows (same ids) and decides the hits.
    const angle = player.aAngle || player.angle;
    const projectileMultiplier = Number.isFinite(player.stats.projectile) ? player.stats.projectile : 1;
    const shots = 1 + Math.max(0, Math.floor((projectileMultiplier - 0.999) / 0.2)) + getBowProjectileBonus(player);
    const spread = Math.min(0.24, Math.max(0.05, 0.05 + (shots - 1) * 0.035));
    const shotId = (Date.now() % 1e9).toString(36) + Math.random().toString(36).slice(2, 6);
    for (let i = 0; i < shots; i++) {
        const shotAngle = angle + (i - (shots - 1) / 2) * spread;
        const end = getShotEnd(player.x, player.y, shotAngle, BOW_RANGE);
        bowProjectiles.push({
            id: `${myId}:${shotId}:${i}`,
            originId: myId,
            startX: player.x,
            startY: player.y,
            endX: end.x,
            endY: end.y,
            angle: shotAngle,
            duration: Math.max(0.06, Math.hypot(end.x - player.x, end.y - player.y) / BOW_SPEED),
            progress: 0,
            reflected: false,
        });
    }
    socket.emit('playerBowShot', { angle, shotId });
}

// Where a straight shot stops at the world's edge (matches the server's shotEnd).
function getShotEnd(x, y, angle, range) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let t = range;
    if (dx > 0) t = Math.min(t, (WORLD_WIDTH - 25 - x) / dx);
    if (dx < 0) t = Math.min(t, (25 - x) / dx);
    if (dy > 0) t = Math.min(t, (WORLD_HEIGHT - 25 - y) / dy);
    if (dy < 0) t = Math.min(t, (25 - y) / dy);
    t = Math.max(1, t);
    return { x: x + dx * t, y: y + dy * t };
}
// The hammer slam, gauntlet rush and bow dragons root their caster until the cast ends
// (matches the server).
function isRootedByUltimate() {
    const ult = getUltimateState(player);
    return Boolean(ult && ult.active && ['hammer', 'gauntlet', 'bow'].includes(ult.type) && Date.now() < (ult.endsAt || 0));
}
function startGearRush() {
    releaseGuardForAction();
    if (isRootedByUltimate()) return;
    if (player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('gear');
    const angle = player.angle;
    const dashDistance = 320;
    const tx = Math.max(25, Math.min(WORLD_WIDTH - 25, player.x + Math.cos(angle) * dashDistance));
    const ty = Math.max(25, Math.min(WORLD_HEIGHT - 25, player.y + Math.sin(angle) * dashDistance));
    player.gearRush = {
        active: true,
        startX: player.x,
        startY: player.y,
        tx,
        ty,
        startTime: Date.now(),
        duration: 0.24,
        mode: 'rush',
        comboId: '',
        pauseUntil: 0,
        slashIndex: 0,
        lastSlashAt: 0,
        startResolved: false,
    };
    socket.emit('playerAction', { gearRush: player.gearRush });
    if (normalizeWeapon(player.weapon) === 'dual') triggerDualRushSlash();
}
function startWireGrab() {
    releaseGuardForAction();
    if(player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('wire');
    const rawTx = player.x + Math.cos(player.angle) * 500;
    const rawTy = player.y + Math.sin(player.angle) * 500;
    const tx = Math.max(25, Math.min(WORLD_WIDTH - 25, rawTx));
    const ty = Math.max(25, Math.min(WORLD_HEIGHT - 25, rawTy));
    player.wire.active = true;
    player.wire.kind = 'wire';
    player.wire.tx = tx;
    player.wire.ty = ty;
    player.wire.progress = 0;
    player.wire.maxDistance = Math.max(1, Math.hypot(tx - player.x, ty - player.y));
    player.wire.holdUntil = 0;
    socket.emit('useSkill', { kind: 'wire', angle: player.angle });
    socket.emit('playerAction', { wire: { active: true, kind: 'wire', tx: player.wire.tx, ty: player.wire.ty, progress: 0, maxDistance: player.wire.maxDistance } });
}
function startWire() {
    if (selectedSkill === 'ash') {
        startAshArrow();
        return;
    }
    if (selectedSkill === 'gear') {
        startGearRush();
        return;
    }
    if (selectedSkill === 'trap' || selectedSkill === 'blink' || selectedSkill === 'potion') {
        useFieldSkill(selectedSkill);
        return;
    }
    startWireGrab();
}

function getOwnBlinkMark() {
    return fieldState.marks.find((mark) => mark.ownerId === myId) || null;
}

// Trap, blink mark and heal potion: the server places them; the second blink press returns.
function useFieldSkill(kind) {
    releaseGuardForAction();
    if (player.hp <= 0 || player.isStunned) return;
    const returning = kind === 'blink' && getOwnBlinkMark();
    if (!returning && player.wireCooldown > 0) return;
    if (!returning) player.wireCooldown = getSkillCooldown(kind);
    socket.emit('useSkill', { kind, angle: player.angle });
}

function startAshArrow() {
    releaseGuardForAction();
    if(player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('ash');
    // Same range as the server's ash arrow.
    const tx = Math.max(25, Math.min(WORLD_WIDTH - 25, player.x + Math.cos(player.angle) * ASH_RANGE));
    const ty = Math.max(25, Math.min(WORLD_HEIGHT - 25, player.y + Math.sin(player.angle) * ASH_RANGE));
    player.wire.active = true;
    player.wire.holdUntil = 0;
    player.wire.kind = 'ash';
    player.wire.tx = tx;
    player.wire.ty = ty;
    player.wire.progress = 0;
    player.wire.maxDistance = Math.max(1, Math.hypot(tx - player.x, ty - player.y));
    socket.emit('useSkill', { kind: 'ash', angle: player.angle });
    socket.emit('playerAction', { wire: { active: true, kind: 'ash', tx: player.wire.tx, ty: player.wire.ty, progress: 0, maxDistance: player.wire.maxDistance } });
}

function endWire() {
    if (!player.wire.active) return;
    player.wire.active = false;
    player.wire.holdUntil = 0;
    socket.emit('playerAction', { wire: { active: false } });
}

// The server says where our wire or ash arrow stopped: a wire that caught someone holds
// on them briefly while it pulls; anything else just ends.
function onSkillShotEnd(data) {
    const wire = player.wire;
    if (!data || data.ownerId !== myId || !wire.active || data.kind !== wire.kind) return;
    if (data.kind === 'wire' && data.hitId) {
        wire.tx = data.x;
        wire.ty = data.y;
        wire.progress = 1;
        wire.holdUntil = Date.now() + 300;
        socket.emit('playerAction', { wire: { active: true, kind: 'wire', tx: wire.tx, ty: wire.ty, progress: 1, maxDistance: wire.maxDistance || 500 } });
        return;
    }
    endWire();
}
function drawGearRush(p) {
    const rush = p.gearRush;
    if (!rush || !rush.active) return;
    const startX = Number.isFinite(rush.startX) ? rush.startX : p.x;
    const startY = Number.isFinite(rush.startY) ? rush.startY : p.y;
    const tx = Number.isFinite(rush.tx) ? rush.tx : p.x;
    const ty = Number.isFinite(rush.ty) ? rush.ty : p.y;
    const duration = Math.max(0.08, Number(rush.duration) || 0.24);
    const elapsed = Math.max(0, (Date.now() - Number(rush.startTime || Date.now())) / 1000);
    const progress = Math.max(0, Math.min(1, elapsed / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const tipX = startX + (tx - startX) * eased;
    const tipY = startY + (ty - startY) * eased;
    const angle = Math.atan2(ty - startY, tx - startX);
    const scale = Math.max(1, Number.isFinite(p.giantScale) ? p.giantScale : 1);
    const handSpread = 14 * scale;
    const handLift = 6 * scale;
    const leftStartX = startX + Math.cos(angle + Math.PI / 2) * handSpread;
    const leftStartY = startY + Math.sin(angle + Math.PI / 2) * handSpread - handLift;
    const rightStartX = startX + Math.cos(angle - Math.PI / 2) * handSpread;
    const rightStartY = startY + Math.sin(angle - Math.PI / 2) * handSpread - handLift;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 240, 140, 0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 220, 120, 0.45)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(leftStartX, leftStartY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightStartX, rightStartY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 245, 190, 0.95)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (rush.mode === 'dualRush' && Date.now() < Number(rush.pauseUntil || 0)) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 240, 120, 0.98)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('!', tipX, tipY - 28);
        ctx.fillText('!', tipX, tipY - 28);
        ctx.restore();
    }
    ctx.restore();
}
function distToSegment(p1, p2, p) { const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2); if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y); let t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2)); return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y))); }
