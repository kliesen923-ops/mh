function drawCharacter(p, color) {
    const { x, y, angle, animTime, isDodging, isGuarding, guardActiveTimer, isAttacking, isStunned, isUpgrading, comboStep, attackPhase, hp, name, aAngle, wire, stats, stunEndsAt } = p;
    const weapon = normalizeWeapon(p.weapon);
    const profile = getWeaponAttackProfile(weapon);
    const attackRange = getEffectiveAttackRange(weapon, stats, p);
    const visualAttackRange = getVisualAttackRange(weapon, stats, p);
    const weaponLength = Math.max(28, visualAttackRange - 28);
    const bodyScale = Math.max(1, Number.isFinite(p.giantScale) ? p.giantScale : 1);
    const ultimate = getUltimateState(p);
    const dualUltimateActive = weapon === 'dual' && ultimate.active && ultimate.type === 'dual';
    const nameOffset = 65 * bodyScale;
    const hpOffset = 60 * bodyScale;
    const stunOffset = 82 * bodyScale;
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
        ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE);
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
    ctx.save(); if (isDodging) ctx.globalAlpha = 0.2; if (isUpgrading) { ctx.globalAlpha = 0.5; ctx.shadowBlur = 15; ctx.shadowColor = "#fff"; } ctx.fillStyle = "white"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(name, x, y - nameOffset);
    const maxHp = getMaxHpFromStats(stats);
    const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    ctx.fillStyle = "#444"; ctx.fillRect(x-25, y-hpOffset, 50, 6);
    ctx.fillStyle = isStunned ? "#9b59b6" : (hpRatio > 0.3 ? "#2ecc71" : "#e74c3c"); ctx.fillRect(x-25, y-hpOffset, hpRatio*50, 6);
    ctx.save(); ctx.translate(x, y); ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE); const leg = Math.sin(animTime || 0); ctx.fillStyle = "#34495e"; ctx.fillRect(-15, (leg>0?-8:8), 10, 25); ctx.fillRect(5, (leg<0?-8:8), 10, 25); ctx.rotate(angle); ctx.fillStyle = isStunned ? "#9b59b6" : color; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.fill(); ctx.fillStyle = "#ffdbac"; ctx.beginPath(); ctx.arc(0,-12,14,0,Math.PI*2); ctx.fill();
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
    ctx.fillStyle = "#ffdbac";
    ctx.fillRect(15 + spearThrust * 7 + bowThrust * 5, 18 - spearThrust * 2 - bowThrust * 1.5, 20 + spearThrust * 5, 10);
    if (weapon === 'hammer') {
        const handleLength = Math.max(18, weaponLength * 0.7);
        const headSize = Math.max(18, Math.min(40, 20 + Math.max(0, weaponLength - 28) * 0.28));
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(35, 19, handleLength, 9);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35 + handleLength - 2, 12, headSize, 26);
        ctx.fillRect(35 + handleLength + headSize - 4, 11, 5, 28);
    } else if (weapon === 'spear') {
        const shaftLength = Math.max(38, weaponLength * 0.95 + spearThrust * 14);
        const tipLength = Math.max(16, Math.min(30, shaftLength * 0.18));
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
        const bladeLength = Math.max(18, weaponLength * 0.58);
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
    } else {
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35,18,weaponLength,10);
    }
    ctx.restore(); ctx.restore(); ctx.restore();
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
            ctx.strokeText(label, x, y - stunOffset);
            ctx.fillText(label, x, y - stunOffset);
            ctx.restore();
        }
    }
    if(isAttacking && attackPhase === 2) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, VIEW_Y_SCALE);
        const ba = aAngle || angle;
        if (weapon === 'spear') {
            const tipX = Math.cos(ba) * attackRange;
            const tipY = Math.sin(ba) * attackRange;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.85)":"rgba(255,255,255,0.85)";
            ctx.lineWidth = profile.lineWidth;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
            ctx.fillStyle = comboStep===3?"rgba(255,200,0,0.95)":"rgba(255,255,255,0.9)";
            ctx.fill();
        } else if (weapon === 'bow') {
            ctx.strokeStyle = "rgba(255, 230, 170, 0.95)";
            ctx.lineWidth = 2.4;
            const bowReach = Math.max(28, visualAttackRange * 0.32);
            ctx.beginPath();
            ctx.moveTo(12, 0);
            ctx.lineTo(12 + bowReach, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(12 + bowReach, 0);
            ctx.lineTo(12 + bowReach - 8, -3);
            ctx.lineTo(12 + bowReach - 8, 3);
            ctx.closePath();
            ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
            ctx.fill();
        } else {
            ctx.beginPath();
            let sA = ba-2.0, eA = ba+0.5; let counter = false;
            if(comboStep===2) { sA = ba+2.0; eA = ba-0.5; counter = true; } else if(comboStep===3) { sA = ba-2.8; eA = ba+2.8; }
            ctx.arc(0,0,attackRange,sA,eA,counter);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.8)":"rgba(255,255,255,0.8)";
            ctx.lineWidth = 20;
            ctx.lineCap = "round";
            ctx.stroke();
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
        ctx.scale(1, VIEW_Y_SCALE);
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
        ctx.scale(1, VIEW_Y_SCALE);
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
        ctx.scale(1, VIEW_Y_SCALE);
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
        ctx.scale(1, VIEW_Y_SCALE);
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
        ctx.strokeText(effect.text, x, y);
        ctx.fillText(effect.text, x, y);
        ctx.restore();
    });
}

function drawAshArrow(originX, originY, tipX, tipY, angle, progress) {
    const crystalScale = 0.92;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(crystalScale, crystalScale * VIEW_Y_SCALE);
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
    ctx.scale(1, VIEW_Y_SCALE);
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
    ctx.scale(palmScale, palmScale * VIEW_Y_SCALE);
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
function updateCamera() {
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, player.x - canvas.width / 2));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, player.y - canvas.height / 2));
}

function drawWorldBackground() {
    const left = camera.x;
    const top = camera.y;
    const right = camera.x + canvas.width;
    const bottom = camera.y + canvas.height;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#333";
    for (let x = Math.floor(left / 80) * 80; x <= right; x += 80) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    ctx.strokeStyle = "#262626";
    for (let y = Math.floor(top / 56) * 56; y <= bottom; y += 56) { ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(231, 76, 60, 0.7)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, WORLD_WIDTH - 6, WORLD_HEIGHT - 6);
}

function drawXpOrbs() {
    const now = Date.now();
    xpOrbs.forEach((orb) => {
        const size = 6 + Math.min(6, orb.value);
        const bob = Math.sin(now / 250 + orb.x) * 3;
        ctx.save();
        ctx.translate(orb.x, orb.y + bob);
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
    });
}

function drawMobs() {
    const now = Date.now();
    mobs.forEach((mob) => {
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
        if (mob.hpPct < 100) {
            const w = r * 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(mob.x - w / 2, mob.y - r - 10, w, 4);
            ctx.fillStyle = tier.color === '#2c2c2c' ? '#f1c40f' : tier.color;
            ctx.fillRect(mob.x - w / 2, mob.y - r - 10, w * Math.max(0, mob.hpPct) / 100, 4);
        }
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

function drawMinimap() {
    const w = 180;
    const h = 90;
    const x = (canvas.width - w) / 2;
    const y = 104;
    const sx = w / WORLD_WIDTH;
    const sy = h / WORLD_HEIGHT;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, canvas.width * sx, canvas.height * sy);
    ctx.fillStyle = '#5ad8ff';
    xpOrbs.forEach((orb) => ctx.fillRect(x + orb.x * sx - 1, y + orb.y * sy - 1, 2, 2));
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
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawWorldBackground();
    drawXpOrbs();
    drawHealingCrosses();
    drawGiantPotions();
    drawMobs();
    Object.values(allPlayers).forEach(p => { if(p.hp > 0) drawCharacter(p, (p.id === myId) ? "#e67e22" : "#3498db"); });
    drawHealingTexts();
    drawCombatEffects();
    drawAshProjectiles();
    drawBowProjectiles();
    drawDragonProjectiles();
    ctx.restore();
    if (gameState === 'PLAYING') drawMinimap();
    if(player.hp <= 0 && gameState === 'PLAYING') { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = "white"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center"; ctx.fillText("사망했습니다! 3초 후 부활합니다.", canvas.width/2, canvas.height/2); }
    requestAnimationFrame(loop);
}
