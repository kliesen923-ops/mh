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

function updateBowProjectiles(dt) {
    bowProjectiles = bowProjectiles.filter((effect) => {
        const prevProgress = effect.progress || 0;
        effect.progress = Math.min(1, prevProgress + dt / Math.max(0.001, effect.duration || 0.4));
        const tipX = effect.startX + (effect.endX - effect.startX) * effect.progress;
        const tipY = effect.startY + (effect.endY - effect.startY) * effect.progress;
        const prevTipX = effect.startX + (effect.endX - effect.startX) * prevProgress;
        const prevTipY = effect.startY + (effect.endY - effect.startY) * prevProgress;
        if (effect.originId === myId && !effect.hitSent) {
            const hit = findBowHitTarget(prevTipX, prevTipY, tipX, tipY, effect);
            if (hit && hit.mobId) {
                effect.hitSent = true;
                socket.emit('bowArrowHitMob', {
                    projectileId: effect.id,
                    mobId: hit.mobId,
                    endX: tipX,
                    endY: tipY,
                    angle: effect.angle,
                });
                return false;
            }
            if (hit) {
                effect.hitSent = true;
                socket.emit('bowArrowHit', {
                    projectileId: effect.id,
                    targetId: hit.id,
                    startX: effect.startX,
                    startY: effect.startY,
                    endX: tipX,
                    endY: tipY,
                    angle: effect.angle,
                    maxDistance: Math.max(1, Math.hypot(effect.endX - effect.startX, effect.endY - effect.startY)),
                    reflected: effect.reflected,
                });
                return false;
            }
        }
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

function findBowHitTarget(prevTipX, prevTipY, tipX, tipY, effect) {
    const candidates = [];
    for (const id of Object.keys(allPlayers)) {
        if (id === myId) continue;
        const target = allPlayers[id];
        if (!target || target.hp <= 0 || target.upgradeShield) continue;
        const distance = distToSegment({ x: prevTipX, y: prevTipY }, { x: tipX, y: tipY }, target);
        if (distance > 26) continue;
        const score = Math.hypot(target.x - effect.startX, target.y - effect.startY);
        candidates.push({ id, score });
    }
    mobs.forEach((mob) => {
        const radius = getMobRadius(mob);
        if (distToSegment({ x: prevTipX, y: prevTipY }, { x: tipX, y: tipY }, mob) > radius + 8) return;
        candidates.push({ mobId: mob.id, score: Math.hypot(mob.x - effect.startX, mob.y - effect.startY) });
    });
    candidates.sort((a, b) => a.score - b.score);
    return candidates.length ? candidates[0] : null;
}

function getMobRadius(mob) {
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
    } else if(player.isAttacking) {
        if (normalizeWeapon(player.weapon) !== 'bow') {
            player.x += Math.cos(player.aAngle) * 150 * dt; player.y += Math.sin(player.aAngle) * 150 * dt;
        }
    } else if(mx !== 0 || my !== 0) {
        player.stats = normalizeStats(player.stats);
        const d = Math.hypot(mx, my), s = (player.isGuarding ? 175 : 350) * player.stats.move * dt;
        player.x += (mx/d) * s; player.y += (my/d) * s;
        if (aimMode !== 'mouse') player.angle = Math.atan2(my, mx);
        player.animTime += dt * 10;
    } else player.animTime = 0;

    if(player.wire.active) {
        const wire = player.wire;
        const prevProgress = wire.progress || 0;
        const nextProgress = Math.min(1, (wire.progress || 0) + dt * (wire.kind === 'ash' ? 3.6 : 3.2));
        wire.progress = nextProgress;
        const prevTipX = player.x + (wire.tx - player.x) * prevProgress;
        const prevTipY = player.y + (wire.ty - player.y) * prevProgress;
        const tipX = player.x + (wire.tx - player.x) * wire.progress;
        const tipY = player.y + (wire.ty - player.y) * wire.progress;
        const hitId = findSecondaryHitTarget(tipX, tipY, prevTipX, prevTipY, wire.kind);
        if (hitId) {
            if (wire.kind === 'ash') resolveAshHit(hitId);
            else resolveWireHit(hitId);
        } else if (wire.progress >= 1) {
            if (wire.kind === 'ash') resolveAshHit();
            else resolveWireHit();
        } else {
            socket.emit('playerAction', { wire: { active: true, kind: wire.kind || 'wire', tx: wire.tx, ty: wire.ty, progress: wire.progress, maxDistance: wire.maxDistance || 500 } });
        }
    }

    player.x = Math.max(25, Math.min(WORLD_WIDTH - 25, player.x));
    player.y = Math.max(25, Math.min(WORLD_HEIGHT - 25, player.y));
    if (player.isGuarding) { player.guardActiveTimer += dt; if (player.guardActiveTimer >= GUARD_DURATION_SEC) releaseGuard(); }
    
    updateCombatReadouts();
    updateCombatEffects(dt);
    updateAshProjectiles(dt);
    updateBowProjectiles(dt);
    updateDragonProjectiles(dt);

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
    updateHealingTexts(dt);
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

function startGuard() { if (player.hp > 0 && !player.isStunned && player.guardCooldown <= 0) { player.isGuarding = true; player.guardActiveTimer = 0; socket.emit('playerAction', { isGuarding: true, guardStartTime: Date.now() }); } }
function releaseGuard() { if (player.isGuarding) { player.isGuarding = false; player.guardCooldown = 1.0; socket.emit('playerAction', { isGuarding: false }); } }
function releaseGuardForAction() { if (player.isGuarding) releaseGuard(); }
function startDodge() { if (player.hp <= 0 || player.isStunned || player.isDodging || player.isAttacking || player.dodgeCooldown > 0 || (player.gearRush && player.gearRush.active)) { releaseGuardForAction(); return; } releaseGuardForAction(); player.stats = normalizeStats(player.stats); player.isDodging = true; player.dTimer = 0.2; player.dDX = Math.cos(player.angle); player.dDY = Math.sin(player.angle); player.dodgeCooldown = 1.0; socket.emit('playerAction', { isDodging: true }); }
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
        cooldownEndsAt: Date.now() + Math.round(config.cooldown * 1000),
        radius: weapon === 'spear' ? 180 : 0,
        extra: 0,
    };
    updateHUD();
    socket.emit('useUltimate', { weapon });
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
    const angle = player.aAngle || player.angle;
    const projectileMultiplier = Number.isFinite(player.stats.projectile) ? player.stats.projectile : 1;
    const giantBonus = getBowProjectileBonus(player);
    const totalShots = Math.max(1, 1 + Math.max(0, Math.floor((projectileMultiplier - 0.999) / 0.2)) + giantBonus);
    const spreadStep = Math.min(0.24, Math.max(0.05, 0.05 + (totalShots - 1) * 0.035));
    const centerOffset = (totalShots - 1) / 2;
    for (let i = 0; i < totalShots; i++) {
        const offset = (i - centerOffset) * spreadStep;
        const shotAngle = angle + offset;
        // Arrows fly to the edge of the visible screen.
        const edge = getRayCanvasEdge(player.x, player.y, shotAngle);
        const projectileId = `${myId || 'bow'}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}:${i}`;
        bowProjectiles.push({
            id: projectileId,
            originId: myId || '',
            startX: player.x,
            startY: player.y,
            endX: edge.x,
            endY: edge.y,
            angle: shotAngle,
            duration: Math.max(0.18, Math.min(0.8, Math.max(1, Math.hypot(edge.x - player.x, edge.y - player.y)) * 0.9 / 1000)),
            progress: 0,
            reflected: false,
        });
        socket.emit('playerBowShot', {
            projectileId,
            startX: player.x,
            startY: player.y,
            endX: edge.x,
            endY: edge.y,
            angle: shotAngle,
            maxDistance: Math.max(1, Math.hypot(edge.x - player.x, edge.y - player.y)),
        });
    }
}
function startGearRush() {
    releaseGuardForAction();
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
    startWireGrab();
}

function startAshArrow() {
    releaseGuardForAction();
    if(player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('ash');
    const edge = getRayCanvasEdge(player.x, player.y, player.angle);
    const tx = edge.x;
    const ty = edge.y;
    player.wire.active = true;
    player.wire.kind = 'ash';
    player.wire.tx = tx;
    player.wire.ty = ty;
    player.wire.progress = 0;
    player.wire.maxDistance = Math.max(1, Math.hypot(tx - player.x, ty - player.y));
    socket.emit('playerAction', { wire: { active: true, kind: 'ash', tx: player.wire.tx, ty: player.wire.ty, progress: 0, maxDistance: player.wire.maxDistance } });
}

// Where a ray from the origin leaves the visible part of the world.
function getRayCanvasEdge(originX, originY, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const left = camera.x;
    const top = camera.y;
    const right = camera.x + canvas.width;
    const bottom = camera.y + canvas.height;
    const candidates = [];
    const pushCandidate = (t) => {
        if (!Number.isFinite(t) || t <= 0) return;
        const x = originX + dx * t;
        const y = originY + dy * t;
        if (x >= left && x <= right && y >= top && y <= bottom) {
            candidates.push({ t, x, y });
        }
    };
    if (Math.abs(dx) > 1e-6) {
        pushCandidate((left - originX) / dx);
        pushCandidate((right - originX) / dx);
    }
    if (Math.abs(dy) > 1e-6) {
        pushCandidate((top - originY) / dy);
        pushCandidate((bottom - originY) / dy);
    }
    if (!candidates.length) {
        return { x: originX, y: originY };
    }
    candidates.sort((a, b) => a.t - b.t);
    return candidates[candidates.length - 1];
}

function findSecondaryHitTarget(tipX, tipY, prevTipX, prevTipY, kind) {
    return Object.keys(allPlayers).find((id) => {
        if (id === myId) return false;
        const target = allPlayers[id];
        if (!target || target.hp <= 0) return false;
        const hitRadius = kind === 'ash' ? 28 : 35;
        if (Number.isFinite(prevTipX) && Number.isFinite(prevTipY)) {
            return distToSegment({ x: prevTipX, y: prevTipY }, { x: tipX, y: tipY }, target) <= hitRadius;
        }
        return Math.hypot(target.x - tipX, target.y - tipY) <= hitRadius;
    });
}

function resolveWireHit(forcedHitId) {
    if (!player.wire.active) return;
    const wire = player.wire;
    const progress = Math.max(0, Math.min(1, wire.progress || 1));
    const tipX = player.x + (wire.tx - player.x) * progress;
    const tipY = player.y + (wire.ty - player.y) * progress;
    const hitId = forcedHitId || findSecondaryHitTarget(tipX, tipY, null, null, 'wire');
    if (hitId) {
        socket.emit('wireGrabHit', { targetId: hitId, progress, tx: wire.tx, ty: wire.ty, maxDistance: wire.maxDistance || 500, kind: 'wire' });
        const target = allPlayers[hitId];
        wire.tx = target ? target.x : wire.tx;
        wire.ty = target ? target.y : wire.ty;
        wire.progress = progress;
        socket.emit('playerAction', { wire: { active: true, kind: 'wire', tx: wire.tx, ty: wire.ty, progress, maxDistance: wire.maxDistance || 500 } });
        setTimeout(() => {
            wire.active = false;
            socket.emit('playerAction', { wire: { active: false } });
        }, 300);
        return;
    }
    wire.active = false;
    socket.emit('playerAction', { wire: { active: false } });
}

function resolveAshHit(forcedHitId) {
    if (!player.wire.active) return;
    const wire = player.wire;
    const progress = Math.max(0, Math.min(1, wire.progress || 1));
    const tipX = player.x + (wire.tx - player.x) * progress;
    const tipY = player.y + (wire.ty - player.y) * progress;
    const hitId = forcedHitId || findSecondaryHitTarget(tipX, tipY, null, null, 'ash');
    if (hitId) {
        socket.emit('ashArrowHit', { targetId: hitId, progress, tx: wire.tx, ty: wire.ty, maxDistance: wire.maxDistance || 500, kind: 'ash' });
    }
    wire.active = false;
    socket.emit('playerAction', { wire: { active: false } });
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
