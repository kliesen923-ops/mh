// The world is drawn on a ground plane tilted away from the camera, like a MOBA view:
// draw() squashes world y by VIEW_Y_SCALE, so circles on the ground (attack ranges,
// ultimate areas) show as ellipses while hit checks stay true circles in world space.
// Things that stand up off the ground (text, health bars, mobs) go through drawUpright.
function drawUpright(x, y, draw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 / VIEW_Y_SCALE);
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
}

// Other players' walk cycles come from how their position changes between frames.
const heroMotion = new Map();
function isHeroMoving(p) {
    if (p.id === myId) return (p.animTime || 0) > 0;
    const now = Date.now();
    const seen = heroMotion.get(p.id);
    if (!seen) {
        heroMotion.set(p.id, { x: p.x, y: p.y, until: 0 });
        return false;
    }
    if (Math.hypot(p.x - seen.x, p.y - seen.y) > 0.5) {
        seen.until = now + 150;
        seen.x = p.x;
        seen.y = p.y;
    }
    return now < seen.until;
}

function drawCharacter(p, color) {
    const { x, y, angle, isDodging, isGuarding, guardActiveTimer, isAttacking, isStunned, upgradeShield, comboStep, attackPhase, hp, name, aAngle, wire, stats, stunEndsAt } = p;
    const weapon = normalizeWeapon(p.weapon);
    const profile = getWeaponAttackProfile(weapon);
    const attackRange = getStrikeRange(weapon, stats, p);
    const visualAttackRange = getVisualAttackRange(weapon, stats, p);
    const bodyScale = Math.max(1, Number.isFinite(p.giantScale) ? p.giantScale : 1);
    // The weapon is drawn inside the body's giant-scale transform, so its length is in
    // unscaled units; dividing keeps the tip at the real reach instead of scaling twice.
    const localReach = visualAttackRange / bodyScale;
    const weaponLength = Math.max(28, localReach - 28);
    const ultimate = getUltimateState(p);
    const dualUltimateActive = weapon === 'dual' && ultimate.active && ultimate.type === 'dual';
    const nameOffset = 84 * bodyScale;
    const hpOffset = 78 * bodyScale;
    const stunOffset = 100 * bodyScale;
    if (p.gearRush && p.gearRush.active) {
        drawGearRush(p);
    } else if(wire && wire.active) {
        const wireProgress = wire.progress ?? 1;
        const tipX = x + (wire.tx - x) * wireProgress;
        const tipY = y + (wire.ty - y) * wireProgress;
        const handAngle = Math.atan2(wire.ty - y, wire.tx - x);
        ctx.save();
        if (wire.kind === 'ash') {
            drawAshArrow(x, y, tipX, tipY, handAngle, wireProgress);
        } else {
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x, y);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = "#f1c40f";
            ctx.lineWidth = 2;
            ctx.stroke();
            drawWireHand(tipX, tipY, handAngle, wireProgress);
        }
        ctx.restore();
    }
    if (ultimate.active) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(bodyScale, bodyScale);
        const pulse = 1 + Math.sin((Date.now() - (ultimate.startAt || 0)) / 80) * 0.04;
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 20;
        ctx.shadowColor = ultimate.type === 'dual' ? 'rgba(255, 40, 40, 0.9)' : 'rgba(255, 220, 120, 0.9)';
        ctx.strokeStyle = ultimate.type === 'dual' ? 'rgba(255, 60, 60, 0.95)' : 'rgba(255, 230, 150, 0.95)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    if(isGuarding) { const isPerfect = (guardActiveTimer < JUST_GUARD_WINDOW_SEC); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.arc(0, 0, 45, -Math.PI/3, Math.PI/3); ctx.strokeStyle = isPerfect ? "rgba(0, 200, 255, 0.9)" : "rgba(52, 152, 219, 0.3)"; ctx.lineWidth = isPerfect ? 8 : 3; ctx.stroke(); ctx.fillStyle = isPerfect ? "rgba(0, 200, 255, 0.2)" : "rgba(52, 152, 219, 0.05)"; ctx.lineTo(0,0); ctx.fill(); ctx.restore(); }
    ctx.save(); if (isDodging) ctx.globalAlpha = 0.2; if (upgradeShield) { ctx.globalAlpha = 0.5; ctx.shadowBlur = 15; ctx.shadowColor = "#fff"; } ctx.fillStyle = "white"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; drawUpright(x, y, () => ctx.fillText(name, x, y - nameOffset));
    const maxHp = getMaxHpFromStats(stats);
    const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    drawUpright(x, y, () => {
        ctx.fillStyle = "#444"; ctx.fillRect(x-25, y-hpOffset, 50, 6);
        ctx.fillStyle = isStunned ? "#9b59b6" : (hpRatio > 0.3 ? "#2ecc71" : "#e74c3c"); ctx.fillRect(x-25, y-hpOffset, hpRatio*50, 6);
    });
    // Shadow and a ring at the feet: orange for you, blue for everyone else.
    ctx.save(); ctx.translate(x, y); ctx.scale(bodyScale, bodyScale); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = color; ctx.globalAlpha *= 0.85; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI*2); ctx.stroke(); ctx.restore();
    // The body stands upright (3/4 view); the weapon swings at hand height around it,
    // in front of the body when facing the camera and behind it when facing away.
    const facing = isAttacking && Number.isFinite(aAngle) ? aAngle : angle;
    const facingAway = Math.sin(facing) <= -0.25;
    const drawBody = () => drawUpright(x, y, () => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(bodyScale * HERO_FIGURE_SCALE, bodyScale * HERO_FIGURE_SCALE);
        drawHeroFigure(ctx, p.look, facing, { moving: isHeroMoving(p), stunned: isStunned });
        ctx.restore();
    });
    if (!facingAway) drawBody();
    ctx.save(); ctx.translate(x, y - (HERO_HAND_LIFT * HERO_FIGURE_SCALE * bodyScale) / VIEW_Y_SCALE); ctx.scale(bodyScale, bodyScale); ctx.rotate(angle);
    ctx.save(); let sRot = 0.8;
    let spearPose = 0;
    let bowPose = 0;
    let dualPose = 0;
    if (weapon === 'spear') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = -0.16; spearPose = -1.35; }
            else if (attackPhase === 2) { sRot = 0.03; spearPose = 1.45; }
            else if (attackPhase === 3) { sRot = 0.08; spearPose = 0.35; }
        } else if (isGuarding) {
            sRot = 0.14;
            spearPose = -0.15;
        } else {
            sRot = 0.06;
        }
    } else if (weapon === 'bow') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = -0.26; bowPose = -1; }
            else if (attackPhase === 2) { sRot = 0.02; bowPose = 1; }
            else if (attackPhase === 3) { sRot = 0.09; bowPose = 0.3; }
        } else if (isGuarding) {
            sRot = 0.12;
            bowPose = -0.15;
        } else {
            sRot = 0.03;
        }
    } else if (weapon === 'dual') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = comboStep === 2 ? 1.08 : -1.08; dualPose = -1; }
            else if (attackPhase === 2) { sRot = comboStep === 2 ? -0.06 : 0.06; dualPose = 1.05; }
            else if (attackPhase === 3) { sRot = comboStep === 2 ? 0.24 : -0.24; dualPose = 0.22; }
        } else if (isGuarding) {
            sRot = 0.1;
            dualPose = -0.12;
        } else {
            sRot = 0.02;
        }
    } else if(isAttacking) {
        if(attackPhase === 1) sRot = (comboStep===2?1.5:-1.5); else if(attackPhase === 2) sRot = (comboStep===2?-1.2:1.2); else if(attackPhase === 3) sRot = (comboStep===2?-0.5:0.5);
    } else if(isGuarding) sRot = 0.2;
    const spearThrust = weapon === 'spear' ? (isAttacking ? (attackPhase === 1 ? -1.35 : (attackPhase === 2 ? 1.45 : 0.35)) : spearPose) : 0;
    const bowThrust = weapon === 'bow' ? (isAttacking ? (attackPhase === 1 ? -1 : (attackPhase === 2 ? 1 : 0.3)) : bowPose) : 0;
    const dualThrust = weapon === 'dual' ? (isAttacking ? (attackPhase === 1 ? -0.95 : (attackPhase === 2 ? 1.05 : 0.2)) : dualPose) : 0;
    ctx.rotate(sRot);
    ctx.fillStyle = getHeroSkinTone(p.look);
    ctx.fillRect(15 + spearThrust * 7 + bowThrust * 5, 18 - spearThrust * 2 - bowThrust * 1.5, 20 + spearThrust * 5, 10);
    if (weapon === 'hammer') {
        // Head ends at the hammer's reach.
        const headSize = Math.max(18, Math.min(34, 14 + localReach * 0.12));
        const handleLength = Math.max(18, localReach - 35 - headSize);
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(35, 19, handleLength, 9);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35 + handleLength - 2, 12, headSize, 26);
        ctx.fillRect(35 + handleLength + headSize - 4, 11, 5, 28);
    } else if (weapon === 'spear') {
        // Sized so the tip lands on the thrust's reach (finisher included) at full extension.
        const thrustReach = (isAttacking ? attackRange : visualAttackRange) / bodyScale;
        const fullThrustX = 28 + 1.45 * 12;
        let tipLength = 24;
        let shaftLength = Math.max(38, (thrustReach - fullThrustX - tipLength) * 2);
        tipLength = Math.max(16, Math.min(30, shaftLength * 0.18));
        shaftLength = Math.max(38, (thrustReach - fullThrustX - tipLength) * 2);
        const shaftY = 20 - spearThrust * 1.5;
        const shaftX = 28 + spearThrust * 12 - shaftLength * 0.5;
        ctx.fillStyle = "#7b5a3a";
        ctx.fillRect(shaftX, shaftY, shaftLength, 6);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.beginPath();
        ctx.moveTo(shaftX + shaftLength, 23 - spearThrust * 1.5);
        ctx.lineTo(shaftX + shaftLength + tipLength, 15 - spearThrust * 1.5);
        ctx.lineTo(shaftX + shaftLength + tipLength, 31 - spearThrust * 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(shaftX + shaftLength - 3, 21 - spearThrust * 1.5, 4, 4);
    } else if (weapon === 'dual') {
        // Blade tips reach the swing's range from the grip.
        const bladeLength = Math.max(18, (localReach - 26) / 0.94);
        const rightWindup = isAttacking ? (attackPhase === 1 ? 1.0 : (attackPhase === 2 ? -0.35 : 1.05)) : dualPose;
        const leftWindup = isAttacking ? (attackPhase === 1 ? -0.35 : (attackPhase === 2 ? 1.0 : 1.05)) : dualPose;
        const rightTilt = attackPhase === 1 ? 0.58 : (attackPhase === 2 ? -0.35 : 0.72);
        const leftTilt = attackPhase === 2 ? -0.58 : (attackPhase === 1 ? 0.35 : -0.72);
        const rightGripX = 28 + rightWindup * 10;
        const rightGripY = 15 - rightWindup * 3;
        const leftGripX = 28 - leftWindup * 10;
        const leftGripY = 31 + leftWindup * 3;
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(rightGripX - 5, rightGripY - 5, 9, 9);
        ctx.fillRect(leftGripX - 5, leftGripY - 5, 9, 9);
        const dualBladeColor = dualUltimateActive ? '#ff3b3b' : (comboStep===3?"#f1c40f":"#bdc3c7");
        const dualAccentColor = dualUltimateActive ? 'rgba(255,90,90,0.6)' : 'rgba(255,255,255,0.45)';
        const dualHiltColor = dualUltimateActive ? '#7a0b0b' : '#6e4b2f';
        ctx.save();
        ctx.translate(rightGripX, rightGripY);
        ctx.rotate(rightTilt);
        ctx.fillStyle = dualBladeColor;
        ctx.fillRect(0, -2, bladeLength, 4);
        ctx.fillStyle = dualAccentColor;
        ctx.fillRect(-3, -1, 4, 2);
        ctx.fillStyle = dualHiltColor;
        ctx.fillRect(-6, -2, 6, 4);
        ctx.restore();
        ctx.save();
        ctx.translate(leftGripX, leftGripY);
        ctx.rotate(leftTilt);
        ctx.fillStyle = dualBladeColor;
        ctx.fillRect(0, -2, bladeLength, 4);
        ctx.fillStyle = dualAccentColor;
        ctx.fillRect(-3, -1, 4, 2);
        ctx.fillStyle = dualHiltColor;
        ctx.fillRect(-6, -2, 6, 4);
        ctx.restore();
    } else if (weapon === 'bow') {
        const bowX = 38 + bowThrust * 10;
        const crescentY = 22 - bowThrust * 1.5;
        ctx.fillStyle = "#7b5a3a";
        ctx.beginPath();
        ctx.arc(bowX, crescentY, 18, -1.25, 1.25, false);
        ctx.arc(bowX + 5, crescentY, 13, 1.25, -1.25, true);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#5d4028";
        ctx.beginPath();
        ctx.arc(bowX + 1, crescentY, 16, -1.18, 1.18, false);
        ctx.arc(bowX + 4, crescentY, 10, 1.18, -1.18, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = comboStep===3?"rgba(255,220,120,0.95)":"rgba(240,240,240,0.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bowX - 12, crescentY);
        ctx.lineTo(bowX + 12, crescentY);
        ctx.stroke();
        if (isAttacking && attackPhase === 1) {
            ctx.strokeStyle = "rgba(255, 235, 190, 0.95)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bowX - 10, crescentY);
            ctx.lineTo(bowX - 26, crescentY);
            ctx.stroke();
            ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
            ctx.beginPath();
            ctx.moveTo(bowX - 26, crescentY);
            ctx.lineTo(bowX - 33, crescentY - 3);
            ctx.lineTo(bowX - 33, crescentY + 3);
            ctx.closePath();
            ctx.fill();
        }
    } else if (weapon === 'scythe') {
        // Long shaft with a curved blade at the end that hooks back toward the wielder.
        const shaftEnd = Math.max(50, localReach - 6);
        ctx.fillStyle = "#4a3426";
        ctx.fillRect(14, 20, shaftEnd - 14, 6);
        ctx.fillStyle = comboStep===3 ? "#f1c40f" : "#c9cfe0";
        ctx.beginPath();
        ctx.moveTo(shaftEnd + 2, 18);
        ctx.quadraticCurveTo(shaftEnd + 6, -14, shaftEnd - 38, -16);
        ctx.quadraticCurveTo(shaftEnd - 10, -6, shaftEnd - 4, 22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(160, 120, 255, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    } else if (weapon === 'gauntlet') {
        // An armoured fist that punches forward on the hit.
        const punch = isAttacking ? (attackPhase === 2 ? 14 : (attackPhase === 1 ? -4 : 6)) : 0;
        ctx.save();
        ctx.translate(punch, 0);
        ctx.fillStyle = comboStep===3 ? "#f1c40f" : "#8d96a8";
        heroRoundRect(ctx, 28, 12, 22, 22, 6); ctx.fill();
        ctx.fillStyle = "#5d6576";
        heroRoundRect(ctx, 20, 15, 10, 16, 3); ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(48, 16 + i * 7, 2.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
    } else if (weapon === 'staff') {
        const glow = comboStep === 3 && isAttacking ? 1.5 : 1;
        ctx.fillStyle = "#6b4a2f";
        ctx.fillRect(8, 20, 56, 5);
        ctx.fillStyle = "#3f2a1a";
        ctx.fillRect(58, 17, 5, 11);
        ctx.shadowColor = "rgba(255, 122, 217, 0.9)";
        ctx.shadowBlur = 12 * glow;
        ctx.fillStyle = "rgba(255, 122, 217, 0.95)";
        ctx.beginPath(); ctx.arc(69, 22, 7 * glow, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35,18,weaponLength,10);
    }
    ctx.restore(); ctx.restore();
    if (facingAway) drawBody();
    ctx.restore();
    if (isStunned && Number.isFinite(stunEndsAt)) {
        const stunRemaining = Math.max(0, (stunEndsAt - Date.now()) / 1000);
        if (stunRemaining > 0) {
            ctx.save();
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(0,0,0,0.65)";
            ctx.fillStyle = "#ffffff";
            const label = `${stunRemaining.toFixed(1)}초`;
            drawUpright(x, y, () => {
                ctx.strokeText(label, x, y - stunOffset);
                ctx.fillText(label, x, y - stunOffset);
            });
            ctx.restore();
        }
    }
    if(isAttacking && attackPhase === 2) {
        ctx.save();
        ctx.translate(x, y);
        const ba = aAngle || angle;
        if (weapon === 'spear') {
            const tipX = Math.cos(ba) * attackRange;
            const tipY = Math.sin(ba) * attackRange;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.85)":"rgba(255,255,255,0.85)";
            ctx.lineWidth = profile.lineWidth * getComboFinisher(weapon, comboStep).width;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
            ctx.fillStyle = comboStep===3?"rgba(255,200,0,0.95)":"rgba(255,255,255,0.9)";
            ctx.fill();
        } else if (isRangedWeapon(weapon)) {
            // The projectile itself shows the shot.
        } else {
            ctx.beginPath();
            let sA = ba-2.0, eA = ba+0.5; let counter = false;
            if(comboStep===2) { sA = ba+2.0; eA = ba-0.5; counter = true; } else if(comboStep===3) { sA = ba-2.8; eA = ba+2.8; }
            ctx.arc(0,0,attackRange,sA,eA,counter);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.8)":"rgba(255,255,255,0.8)";
            ctx.lineWidth = 20;
            ctx.lineCap = "round";
            ctx.stroke();
            if (weapon === 'hammer' && comboStep === 3) {
                // Finisher slam: a full shockwave around the hammer.
                ctx.beginPath();
                ctx.arc(0, 0, attackRange, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 150, 60, 0.18)";
                ctx.fill();
                ctx.strokeStyle = "rgba(255, 190, 90, 0.75)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

function drawCombatEffects() {
    combatEffects.forEach((effect) => {
        const t = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        const alpha = t;
        ctx.save();
        ctx.translate(effect.x, effect.y);
        ctx.globalAlpha = alpha;
        if (effect.weapon === 'hammer') {
            const burst = 20 + (1 - t) * 34;
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
            ctx.fillStyle = 'rgba(231, 76, 60, 0.55)';
            ctx.lineWidth = 4;
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 10 + (1 - t) * 8, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'bow') {
            const burst = 16 + (1 - t) * 18;
            ctx.strokeStyle = 'rgba(255, 214, 140, 0.95)';
            ctx.fillStyle = 'rgba(255, 245, 200, 0.7)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 / 4) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 7 + (1 - t) * 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'spear') {
            const burst = 26 + (1 - t) * 22;
            ctx.strokeStyle = 'rgba(255, 240, 180, 0.95)';
            ctx.fillStyle = 'rgba(241, 196, 15, 0.55)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(effect.angle) * burst, Math.sin(effect.angle) * burst);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(Math.cos(effect.angle) * burst, Math.sin(effect.angle) * burst, 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'dual') {
            const slashLen = 42 + (1 - t) * 20;
            const burstScale = 1 + (1 - t) * 0.35;
            ctx.lineWidth = 3.4;
            ctx.lineCap = 'round';
            const strokes = [
                { color: 'rgba(255, 255, 255, 0.95)', ang: effect.angle + 0.78, len: 0.82, offX: -4, offY: -2 },
                { color: 'rgba(241, 196, 15, 0.92)', ang: effect.angle - 0.92, len: 0.72, offX: 3, offY: 1 },
                { color: 'rgba(255, 255, 255, 0.78)', ang: effect.angle + 1.62, len: 0.58, offX: -1, offY: 4 },
                { color: 'rgba(241, 196, 15, 0.72)', ang: effect.angle - 1.68, len: 0.52, offX: 5, offY: -3 },
            ];
            strokes.forEach((stroke) => {
                ctx.save();
                ctx.translate(stroke.offX * burstScale, stroke.offY * burstScale);
                ctx.rotate(stroke.ang);
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                ctx.moveTo(-slashLen * stroke.len, -slashLen * 0.14);
                ctx.lineTo(slashLen * stroke.len, slashLen * 0.14);
                ctx.stroke();
                ctx.restore();
            });
            ctx.fillStyle = 'rgba(255, 245, 180, 0.55)';
            ctx.beginPath();
            ctx.arc(0, 0, 5 + (1 - t) * 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'ult-dual') {
            const slashLen = 52 + (1 - t) * 28;
            const burstScale = 1.15 + (1 - t) * 0.45;
            ctx.lineWidth = 4.8;
            ctx.lineCap = 'round';
            const strokes = [
                { color: 'rgba(255, 80, 80, 0.98)', ang: effect.angle + 0.68, len: 1.0, offX: -5, offY: -2 },
                { color: 'rgba(190, 0, 0, 0.96)', ang: effect.angle - 0.95, len: 0.88, offX: 4, offY: 1 },
                { color: 'rgba(255, 120, 120, 0.92)', ang: effect.angle + 1.56, len: 0.72, offX: -2, offY: 5 },
                { color: 'rgba(120, 0, 0, 0.9)', ang: effect.angle - 1.62, len: 0.66, offX: 6, offY: -4 },
            ];
            strokes.forEach((stroke) => {
                ctx.save();
                ctx.translate(stroke.offX * burstScale, stroke.offY * burstScale);
                ctx.rotate(stroke.ang);
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                ctx.moveTo(-slashLen * stroke.len, -slashLen * 0.18);
                ctx.lineTo(slashLen * stroke.len, slashLen * 0.18);
                ctx.stroke();
                ctx.restore();
            });
            ctx.fillStyle = 'rgba(255, 120, 120, 0.7)';
            ctx.beginPath();
            ctx.arc(0, 0, 8 + (1 - t) * 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'dragon') {
            const beamLen = 122 + (1 - t) * 36;
            ctx.strokeStyle = 'rgba(70, 220, 255, 0.98)';
            ctx.fillStyle = 'rgba(30, 150, 255, 0.95)';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.rotate(effect.angle);
            ctx.moveTo(-beamLen, -16);
            ctx.quadraticCurveTo(-beamLen * 0.56, -40, -beamLen * 0.08, -18);
            ctx.quadraticCurveTo(beamLen * 0.18, -44, beamLen * 0.56, -14);
            ctx.quadraticCurveTo(beamLen * 0.86, -24, beamLen, 0);
            ctx.quadraticCurveTo(beamLen * 0.86, 24, beamLen * 0.56, 14);
            ctx.quadraticCurveTo(beamLen * 0.18, 44, -beamLen * 0.08, 18);
            ctx.quadraticCurveTo(-beamLen * 0.56, 40, -beamLen, 16);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (effect.weapon === 'ult-sword') {
            const slashLen = 64 + (1 - t) * 22;
            ctx.lineWidth = 6.2;
            ctx.lineCap = 'round';
            ctx.save();
            ctx.rotate(effect.angle);
            ctx.strokeStyle = 'rgba(255, 250, 240, 0.98)';
            ctx.beginPath();
            ctx.moveTo(-slashLen * 0.08, -slashLen * 0.12);
            ctx.lineTo(slashLen * 1.08, slashLen * 0.12);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(0, -slashLen * 0.2);
            ctx.lineTo(slashLen * 1.18, slashLen * 0.02);
            ctx.stroke();
            ctx.restore();
        } else if (effect.weapon === 'ult-hammer') {
            const burst = 42 + (1 - t) * 26;
            ctx.save();
            ctx.rotate(effect.angle);
            ctx.fillStyle = 'rgba(231, 76, 60, 0.24)';
            ctx.strokeStyle = 'rgba(255, 230, 120, 0.95)';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, burst, -Math.PI * 0.42, Math.PI * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            for (let i = -1; i <= 1; i++) {
                ctx.save();
                ctx.rotate(effect.angle + i * 0.18);
                ctx.strokeStyle = i === 0 ? 'rgba(255, 240, 160, 0.95)' : 'rgba(231, 76, 60, 0.85)';
                ctx.lineWidth = i === 0 ? 5.5 : 3;
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(burst, i * 12);
                ctx.stroke();
                ctx.restore();
            }
        } else if (effect.weapon === 'spear-ult') {
            const ring = 36 + (1 - t) * 26;
            ctx.strokeStyle = 'rgba(255, 245, 180, 0.9)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, ring, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, ring + 14, 0, Math.PI * 2);
            ctx.stroke();
        } else if (effect.weapon === 'ult-scythe') {
            // A full reaping circle.
            const ring = 60 + (1 - t) * 90;
            ctx.strokeStyle = `rgba(181, 140, 255, ${0.3 + t * 0.6})`;
            ctx.lineWidth = 12 * t + 3;
            ctx.beginPath();
            ctx.arc(0, 0, ring, effect.angle, effect.angle + Math.PI * 1.7);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, ring - 10, effect.angle + 0.3, effect.angle + Math.PI * 1.5);
            ctx.stroke();
        } else if (effect.weapon === 'ult-gauntlet') {
            // Impact star in front of the fist.
            const burst = 20 + (1 - t) * 26;
            ctx.fillStyle = `rgba(255, 179, 90, ${0.5 * t + 0.2})`;
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const a = effect.angle + (Math.PI * 2 * i) / 16;
                const r = i % 2 ? burst * 0.45 : burst;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
        } else if (effect.weapon === 'meteor') {
            const blast = 40 + (1 - t) * 130;
            ctx.fillStyle = `rgba(255, 120, 60, ${0.45 * t})`;
            ctx.beginPath(); ctx.arc(0, 0, blast, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255, 230, 160, ${t})`;
            ctx.lineWidth = 8 * t + 2;
            ctx.beginPath(); ctx.arc(0, 0, blast, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(255, 250, 220, ${t})`;
            ctx.beginPath(); ctx.arc(0, 0, 28 * t, 0, Math.PI * 2); ctx.fill();
        } else if (effect.weapon === 'staff' || effect.weapon === 'burn' || effect.weapon === 'trap') {
            const color = effect.weapon === 'staff' ? '255, 122, 217' : (effect.weapon === 'burn' ? '255, 140, 60' : '220, 225, 235');
            ctx.fillStyle = `rgba(${color}, ${0.6 * t})`;
            ctx.beginPath(); ctx.arc(0, 0, 10 + (1 - t) * 12, 0, Math.PI * 2); ctx.fill();
        } else if (effect.weapon === 'parry') {
            // Just guard: a gold flash ring with sparks thrown back at the attacker.
            const ring = 20 + (1 - t) * 30;
            ctx.strokeStyle = `rgba(255, 216, 74, ${0.3 + t * 0.7})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, ring, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 2.5;
            for (let i = -2; i <= 2; i++) {
                const a = effect.angle + i * 0.32;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * ring * 0.5, Math.sin(a) * ring * 0.5);
                ctx.lineTo(Math.cos(a) * (ring + 14), Math.sin(a) * (ring + 14));
                ctx.stroke();
            }
        } else if (effect.weapon === 'ash') {
            const burst = 18 + (1 - t) * 24;
            ctx.strokeStyle = 'rgba(120, 210, 255, 0.95)';
            ctx.fillStyle = 'rgba(45, 125, 255, 0.55)';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 8 + (1 - t) * 6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const slashLen = 44 + (1 - t) * 18;
            const slashWidth = 4 + (1 - t) * 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = slashWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.rotate(effect.angle + Math.PI / 10);
            ctx.moveTo(-slashLen * 0.6, -slashLen * 0.22);
            ctx.lineTo(slashLen * 0.6, slashLen * 0.22);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-slashLen * 0.25, slashLen * 0.16);
            ctx.lineTo(slashLen * 0.72, -slashLen * 0.12);
            ctx.stroke();
        }
        ctx.restore();
    });
}

function drawAshProjectiles() {
    ashProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const tipX = effect.startX + (effect.endX - effect.startX) * p;
        const tipY = effect.startY + (effect.endY - effect.startY) * p;
        drawAshArrow(effect.startX, effect.startY, tipX, tipY, effect.angle, p);
    });
}

function drawBowProjectiles() {
    bowProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const tipX = effect.startX + (effect.endX - effect.startX) * p;
        const tipY = effect.startY + (effect.endY - effect.startY) * p;
        drawBowArrow(effect.startX, effect.startY, tipX, tipY, effect.angle, p, effect.reflected);
    });
}

function drawDragonProjectiles() {
    dragonProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const x = effect.startX + (effect.endX - effect.startX) * p;
        const y = effect.startY + (effect.endY - effect.startY) * p;
        const len = 140 + (1 - p) * 90;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(effect.angle);
        ctx.globalAlpha = 0.95 - p * 0.25;
        ctx.shadowColor = effect.reflected ? 'rgba(255, 120, 120, 0.95)' : 'rgba(70, 220, 255, 0.98)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = effect.reflected ? 'rgba(255, 90, 90, 0.95)' : 'rgba(35, 170, 255, 0.96)';
        ctx.strokeStyle = effect.reflected ? 'rgba(255, 230, 220, 0.98)' : 'rgba(210, 255, 255, 0.98)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-len * 0.98, 0);
        ctx.quadraticCurveTo(-len * 0.68, -36, -len * 0.18, -16);
        ctx.quadraticCurveTo(len * 0.1, -42, len * 0.5, -14);
        ctx.quadraticCurveTo(len * 0.8, -26, len, 0);
        ctx.quadraticCurveTo(len * 0.8, 26, len * 0.5, 14);
        ctx.quadraticCurveTo(len * 0.1, 42, -len * 0.18, 16);
        ctx.quadraticCurveTo(-len * 0.68, 36, -len * 0.98, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-len * 0.42, 0, 18, 0, Math.PI * 2);
        ctx.fillStyle = effect.reflected ? 'rgba(255, 180, 180, 0.98)' : 'rgba(210, 255, 255, 0.98)';
        ctx.fill();
        ctx.restore();
    });
}

function drawHealingCrosses() {
    const now = Date.now();
    healingCrosses.forEach((cross) => {
        const remaining = Math.max(0, Number(cross.expiresAt || 0) - now);
        const lifeRatio = Math.max(0, Math.min(1, remaining / 12000));
        const bob = Math.sin(now / 220 + Number(cross.x || 0) * 0.01) * 4;
        const blink = remaining <= 3000 ? (Math.floor(now / 140) % 2 === 0) : true;
        if (!blink) return;
        ctx.save();
        ctx.translate(Number(cross.x) || 0, (Number(cross.y) || 0) + bob);
        ctx.globalAlpha = remaining <= 3000 ? Math.max(0.25, lifeRatio) : 1;
        ctx.shadowColor = 'rgba(80, 255, 120, 0.85)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(70, 220, 100, 0.95)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(170, 255, 180, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.restore();
    });
}

function drawGiantPotions() {
    const now = Date.now();
    giantPotions.forEach((potion) => {
        const remaining = Math.max(0, Number(potion.expiresAt || 0) - now);
        const lifeRatio = Math.max(0, Math.min(1, remaining / 14000));
        const bob = Math.sin(now / 240 + Number(potion.x || 0) * 0.01) * 4;
        const blink = remaining <= 3000 ? (Math.floor(now / 120) % 2 === 0) : true;
        if (!blink) return;
        const x = Number(potion.x) || 0;
        const y = Number(potion.y) || 0;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.globalAlpha = remaining <= 3000 ? Math.max(0.25, lifeRatio) : 1;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.18)';
        ctx.shadowBlur = 12;

        ctx.fillStyle = 'rgba(25, 25, 30, 0.95)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-12, -24, 24, 38, 7);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-12, -24, 24, 38);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(55, 60, 70, 0.96)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-8, -39, 16, 18, 5);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-8, -39, 16, 18);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(120, 190, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-8, -39);
        ctx.lineTo(8, -39);
        ctx.lineTo(6, -51);
        ctx.lineTo(-6, -51);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(10, 10, 10, 0.95)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-13, -6, 26, 16, 4);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-13, -6, 26, 16);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-13, -2);
        ctx.lineTo(13, -2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.beginPath();
        ctx.arc(0, 1, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-5, 5);
        ctx.lineTo(5, 5);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.beginPath();
        ctx.arc(-1.8, -0.5, 0.9, 0, Math.PI * 2);
        ctx.arc(1.8, -0.5, 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(120, 255, 170, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -25, 28, 39);
        ctx.restore();
    });
}

function drawHealingTexts() {
    healingTexts.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        const target = allPlayers[effect.playerId] || (effect.playerId === myId ? player : null);
        if (!target) return;
        const rise = (1 - p) * 36;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillStyle = effect.color || '#46e06a';
        const x = target.x;
        const y = target.y - 78 - rise;
        drawUpright(target.x, target.y, () => {
            ctx.strokeText(effect.text, x, y);
            ctx.fillText(effect.text, x, y);
        });
        ctx.restore();
    });
}

function drawAshArrow(originX, originY, tipX, tipY, angle, progress) {
    const crystalScale = 0.92;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(crystalScale, crystalScale);
    ctx.shadowColor = 'rgba(90, 180, 255, 0.75)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.95)';
    ctx.fillStyle = 'rgba(80, 160, 255, 0.92)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, -4);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(35, 120, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-16, -2.4);
    ctx.lineTo(-34, 0);
    ctx.lineTo(-16, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(195, 245, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-10, -1.4);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawBowArrow(originX, originY, tipX, tipY, angle, progress, reflected) {
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.shadowColor = reflected ? 'rgba(255, 120, 120, 0.9)' : 'rgba(255, 210, 120, 0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = reflected ? 'rgba(255, 180, 160, 1)' : 'rgba(240, 200, 145, 1)';
    ctx.fillStyle = reflected ? 'rgba(255, 210, 190, 1)' : 'rgba(140, 95, 45, 1)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = reflected ? 'rgba(255, 140, 120, 0.96)' : 'rgba(115, 75, 35, 0.96)';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-34, 0);
    ctx.strokeStyle = reflected ? 'rgba(255, 170, 140, 0.98)' : 'rgba(235, 205, 155, 0.98)';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(-44, -3.5);
    ctx.lineTo(-44, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawWireHand(tipX, tipY, angle, progress) {
    const palmScale = 0.9 + Math.min(0.25, Math.max(0, progress) * 0.18);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(palmScale, palmScale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 214, 140, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 225, 195, 0.95)';
    ctx.strokeStyle = 'rgba(110, 70, 35, 0.75)';
    ctx.lineWidth = 1.4;
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(-8, -7, 16, 14, 5);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.rect(-8, -7, 16, 14);
        ctx.fill();
        ctx.stroke();
    }
    const fingerYs = [-6, -2.5, 1.5, 5];
    fingerYs.forEach((fy, idx) => {
        ctx.beginPath();
        ctx.moveTo(6, fy);
        ctx.lineTo(16 + idx * 0.3, fy * 0.72);
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(4, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-1, -1, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 240, 220, 0.95)';
    ctx.fill();
    ctx.restore();
}
// How much of the world fits on screen; the tilted ground shows more of it vertically.
function getViewWorldHeight() {
    return canvas.height / VIEW_Y_SCALE;
}

function updateCamera() {
    const viewHeight = getViewWorldHeight();
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, player.x - canvas.width / 2));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - viewHeight, player.y - viewHeight / 2));
}

function drawWorldBackground() {
    const left = camera.x;
    const top = camera.y;
    const right = camera.x + canvas.width;
    const bottom = camera.y + getViewWorldHeight();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#333";
    for (let x = Math.floor(left / 80) * 80; x <= right; x += 80) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    ctx.strokeStyle = "#262626";
    for (let y = Math.floor(top / 80) * 80; y <= bottom; y += 80) { ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(231, 76, 60, 0.7)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, WORLD_WIDTH - 6, WORLD_HEIGHT - 6);
}

function drawXpOrbs() {
    const now = Date.now();
    const visible = (orb) => orb.x > camera.x - 30 && orb.x < camera.x + canvas.width + 30 && orb.y > camera.y - 30 && orb.y < camera.y + getViewWorldHeight() + 30;
    xpOrbs.forEach((orb) => {
        if (visible(orb)) drawXpGem(orb.x, orb.y + Math.sin(now / 250 + orb.x) * 3, orb.value, 1);
    });
    collectingOrbs.forEach((orb) => {
        const collector = orb.by === myId ? player : allPlayers[orb.by];
        if (!collector) return;
        const t = 1 - Math.max(0, orb.life / orb.maxLife);
        const eased = t * t;
        drawXpGem(orb.x + (collector.x - orb.x) * eased, orb.y + (collector.y - 20 - orb.y) * eased, orb.value, 1 - t * 0.6);
    });
}

function drawXpGem(x, y, value, scale) {
    const size = (6 + Math.min(6, value)) * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 / VIEW_Y_SCALE);
    ctx.shadowColor = '#5ad8ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#5ad8ff';
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(size * 0.3, 0);
    ctx.lineTo(0, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawMob(mob, now) {
    const tier = mobTiers[mob.tier] || { color: '#2ecc71', radius: 16 };
    const r = tier.radius || 16;
    const wobble = 1 + Math.sin(now / 140 + mob.seed) * 0.06;
    ctx.save();
    ctx.translate(mob.x, mob.y);
    ctx.globalAlpha = mob.mine ? 1 : 0.6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.75, r * 0.95, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(wobble, (2 - wobble) * 0.9);
    ctx.fillStyle = mob.flash > 0 ? '#ffffff' : tier.color;
    ctx.strokeStyle = mob.tier === mobTiers.length - 1 ? '#f1c40f' : 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = mob.tier === mobTiers.length - 1 ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const target = mob.mine ? player : null;
    const look = target ? Math.atan2(target.y - mob.y, target.x - mob.x) : 0;
    const ex = Math.cos(look) * r * 0.25;
    const ey = Math.sin(look) * r * 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r * 0.32 + ex, -r * 0.15 + ey, r * 0.24, 0, Math.PI * 2); ctx.arc(r * 0.32 + ex, -r * 0.15 + ey, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mob.tier >= 4 ? '#c0392b' : '#111';
    ctx.beginPath(); ctx.arc(-r * 0.32 + ex * 1.3, -r * 0.15 + ey * 1.3, r * 0.11, 0, Math.PI * 2); ctx.arc(r * 0.32 + ex * 1.3, -r * 0.15 + ey * 1.3, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (mob.stunned) drawMobStun(mob, r);
    if (mob.hpPct < 100) {
        const w = r * 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(mob.x - w / 2, mob.y - r - 10, w, 4);
        ctx.fillStyle = tier.color === '#2c2c2c' ? '#f1c40f' : tier.color;
        ctx.fillRect(mob.x - w / 2, mob.y - r - 10, w * Math.max(0, mob.hpPct) / 100, 4);
    }
}

function drawMobs() {
    const now = Date.now();
    mobs.forEach((mob) => {
        if (mob.boss) {
            drawUpright(mob.x, mob.y, () => drawBoss(mob));
            return;
        }
        drawUpright(mob.x, mob.y, () => drawMob(mob, now));
    });
    mobDeathEffects.forEach((effect) => {
        const p = Math.max(0, effect.life / effect.maxLife);
        ctx.save();
        ctx.globalAlpha = p;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (1 + (1 - p) * 1.4), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });
}

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

// Draws into the HUD's own canvas, sized for the device's pixel ratio.
function drawMinimap() {
    if (!minimapCtx) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const w = minimapCanvas.clientWidth || 200;
    const h = minimapCanvas.clientHeight || 100;
    if (minimapCanvas.width !== Math.round(w * ratio) || minimapCanvas.height !== Math.round(h * ratio)) {
        minimapCanvas.width = Math.round(w * ratio);
        minimapCanvas.height = Math.round(h * ratio);
    }
    const ctx = minimapCtx;
    const pad = 6;
    const x = pad;
    const y = pad;
    const sx = (w - pad * 2) / WORLD_WIDTH;
    const sy = (h - pad * 2) / WORLD_HEIGHT;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(x, y, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, canvas.width * sx, getViewWorldHeight() * sy);
    ctx.fillStyle = '#5ad8ff';
    xpOrbs.forEach((orb) => ctx.fillRect(x + orb.x * sx - 1, y + orb.y * sy - 1, 2, 2));
    ctx.fillStyle = '#46e06a';
    healingCrosses.forEach((cross) => ctx.fillRect(x + cross.x * sx - 2, y + cross.y * sy - 2, 4, 4));
    ctx.fillStyle = '#c86bff';
    giantPotions.forEach((potion) => ctx.fillRect(x + potion.x * sx - 2, y + potion.y * sy - 2, 4, 4));
    mobs.forEach((mob) => {
        if (!mob.boss) return;
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath(); ctx.arc(x + mob.x * sx, y + mob.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    });
    Object.values(allPlayers).forEach((p) => {
        if (p.hp <= 0 || p.isSelectingLoadout) return;
        const isMe = p.id === myId;
        const px = isMe ? player.x : p.x;
        const py = isMe ? player.y : p.y;
        ctx.fillStyle = isMe ? '#e67e22' : '#3498db';
        ctx.beginPath(); ctx.arc(x + px * sx, y + py * sy, isMe ? 3.5 : 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    updateCamera();
    const shake = getScreenShakeOffset();
    ctx.save();
    ctx.translate(-camera.x + shake.x, -camera.y * VIEW_Y_SCALE + shake.y);
    ctx.scale(1, VIEW_Y_SCALE);
    drawWorldBackground();
    drawFieldObjects();
    drawUltimateAreas();
    drawBossSlams();
    drawXpOrbs();
    drawHealingCrosses();
    drawGiantPotions();
    drawMobs();
    // Standing characters overlap, so draw the ones further back (smaller y) first.
    Object.values(allPlayers).filter(p => p.hp > 0).sort((a, b) => a.y - b.y)
        .forEach(p => drawCharacter(p, (p.id === myId) ? "#e67e22" : "#3498db"));
    drawHealingTexts();
    drawCombatEffects();
    drawAshProjectiles();
    drawBowProjectiles();
    drawDragonProjectiles();
    drawFieldEffects();
    drawDamageTexts();
    drawUltimateBanners();
    ctx.restore();
    if (gameState === 'PLAYING') {
        drawMinimap();
        updateBossBar();
    }
    drawAnnouncements();
    if(player.hp <= 0 && gameState === 'PLAYING') { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = "white"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center"; ctx.fillText("사망했습니다! 3초 후 부활합니다.", canvas.width/2, canvas.height/2); }
    requestAnimationFrame(loop);
}
