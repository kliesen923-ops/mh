// The weapons characters hold. Drawn in the hand's frame: +x points where the character
// aims, the hand sits around (30, 23), and lengths are in unscaled body units.

function steelFill(x0, y0, x1, y1, finisher) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    if (finisher) {
        g.addColorStop(0, '#fff6c8');
        g.addColorStop(0.5, '#f5c542');
        g.addColorStop(1, '#a8740c');
    } else {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, '#d3dbe8');
        g.addColorStop(1, '#6f7c92');
    }
    return g;
}

function woodFill(x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#b07a4a');
    g.addColorStop(1, '#5a361d');
    return g;
}

function goldFill(x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#fff0b8');
    g.addColorStop(1, '#c68a10');
    return g;
}

function glowIf(finisher, color) {
    ctx.shadowColor = finisher ? 'rgba(255, 210, 90, 0.95)' : (color || 'rgba(0, 0, 0, 0)');
    ctx.shadowBlur = finisher || color ? 12 : 0;
}

function drawSwordModel(s) {
    const finisher = s.comboStep === 3;
    const tip = 41 + Math.max(24, s.weaponLength);
    // Grip with leather wrap and a pommel.
    ctx.fillStyle = '#3b2617';
    heroRoundRect(ctx, 27, 20, 11, 6, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 170, 0.35)';
    ctx.lineWidth = 1;
    for (let x = 29; x < 37; x += 2.5) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x + 1.5, 26); ctx.stroke(); }
    ctx.fillStyle = goldFill(23, 20, 23, 26);
    ctx.beginPath(); ctx.arc(26, 23, 3, 0, Math.PI * 2); ctx.fill();
    // Blade.
    glowIf(finisher);
    ctx.fillStyle = steelFill(0, 18.5, 0, 27.5, finisher);
    ctx.beginPath();
    ctx.moveTo(41, 19.5);
    ctx.lineTo(tip - 9, 19.5);
    ctx.lineTo(tip, 23);
    ctx.lineTo(tip - 9, 26.5);
    ctx.lineTo(41, 26.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(70, 80, 100, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80, 90, 110, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(45, 23); ctx.lineTo(tip - 12, 23); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(43, 20.3); ctx.lineTo(tip - 10, 20.3); ctx.stroke();
    // Crossguard with curled ends.
    ctx.fillStyle = goldFill(37, 13, 37, 33);
    heroRoundRect(ctx, 37, 14, 4.5, 18, 2); ctx.fill();
    ctx.beginPath(); ctx.arc(39.2, 13.5, 2.4, 0, Math.PI * 2); ctx.arc(39.2, 32.5, 2.4, 0, Math.PI * 2); ctx.fill();
}

function drawDualModel(s) {
    const finisher = s.comboStep === 3;
    const bladeLength = Math.max(18, (s.localReach - 26) / 0.94);
    const pose = s.dualPose;
    const attacking = s.isAttacking;
    const phase = s.attackPhase;
    const rightWindup = attacking ? (phase === 1 ? 1.0 : (phase === 2 ? -0.35 : 1.05)) : pose;
    const leftWindup = attacking ? (phase === 1 ? -0.35 : (phase === 2 ? 1.0 : 1.05)) : pose;
    const rightTilt = phase === 1 ? 0.58 : (phase === 2 ? -0.35 : 0.72);
    const leftTilt = phase === 2 ? -0.58 : (phase === 1 ? 0.35 : -0.72);
    const blades = [
        { x: 28 + rightWindup * 10, y: 15 - rightWindup * 3, tilt: rightTilt },
        { x: 28 - leftWindup * 10, y: 31 + leftWindup * 3, tilt: leftTilt },
    ];
    blades.forEach((blade) => {
        ctx.save();
        ctx.translate(blade.x, blade.y);
        ctx.rotate(blade.tilt);
        // A slightly curved short blade.
        if (s.dualUltimateActive) {
            ctx.shadowColor = 'rgba(255, 40, 40, 0.95)';
            ctx.shadowBlur = 12;
            ctx.fillStyle = (() => { const g = ctx.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, '#ffb0a0'); g.addColorStop(1, '#a01010'); return g; })();
        } else {
            glowIf(finisher);
            ctx.fillStyle = steelFill(0, -3, 0, 3, finisher);
        }
        ctx.beginPath();
        ctx.moveTo(2, -2.6);
        ctx.quadraticCurveTo(bladeLength * 0.6, -3.6, bladeLength, -0.6);
        ctx.quadraticCurveTo(bladeLength * 0.6, 1.4, 2, 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(4, -2); ctx.quadraticCurveTo(bladeLength * 0.6, -3, bladeLength - 2, -0.8); ctx.stroke();
        // Small guard and wrapped grip.
        ctx.fillStyle = s.dualUltimateActive ? '#7a0b0b' : goldFill(0, -5, 0, 5);
        heroRoundRect(ctx, -0.5, -4.5, 2.5, 9, 1); ctx.fill();
        ctx.fillStyle = '#2f1d12';
        heroRoundRect(ctx, -9, -2, 8.5, 4, 1.5); ctx.fill();
        ctx.restore();
    });
}

function drawHammerModel(s) {
    const finisher = s.comboStep === 3;
    const headSize = Math.max(18, Math.min(34, 14 + s.localReach * 0.12));
    const handleLength = Math.max(18, s.localReach - 35 - headSize);
    const headX = 35 + handleLength - 2;
    // Handle with a wrapped grip near the hand.
    ctx.fillStyle = woodFill(0, 19, 0, 28);
    heroRoundRect(ctx, 22, 19.5, handleLength + 14, 7, 3); ctx.fill();
    ctx.fillStyle = '#2f1d12';
    heroRoundRect(ctx, 24, 19, 14, 8, 2); ctx.fill();
    // Head: a heavy block with gold bands and a bright striking face.
    glowIf(finisher, 'rgba(255, 140, 60, 0.0)');
    ctx.fillStyle = steelFill(headX, 9, headX, 37, finisher);
    heroRoundRect(ctx, headX, 9, headSize, 28, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(60, 70, 90, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = goldFill(headX, 9, headX, 37);
    ctx.fillRect(headX + headSize * 0.22, 9, 3, 28);
    ctx.fillRect(headX + headSize * 0.68, 9, 3, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(headX + headSize - 4, 11, 2.5, 24);
    ctx.fillRect(headX + 2, 10.5, headSize - 4, 2);
}

function drawSpearModel(s) {
    const finisher = s.comboStep === 3;
    const fullThrustX = 28 + 1.45 * 12;
    let tipLength = 24;
    // Held a quarter of the way up the shaft, so only a short butt sticks out behind.
    const grip = 0.25;
    let shaftLength = Math.max(38, (s.thrustReach - fullThrustX - tipLength) / (1 - grip));
    tipLength = Math.max(16, Math.min(30, shaftLength * 0.18));
    shaftLength = Math.max(38, (s.thrustReach - fullThrustX - tipLength) / (1 - grip));
    const shaftY = 20 - s.spearThrust * 1.5;
    const shaftX = 28 + s.spearThrust * 12 - shaftLength * grip;
    const endX = shaftX + shaftLength;
    const midY = shaftY + 3;
    ctx.fillStyle = woodFill(0, shaftY, 0, shaftY + 6);
    heroRoundRect(ctx, shaftX, shaftY, shaftLength, 6, 3); ctx.fill();
    // Butt cap.
    ctx.fillStyle = goldFill(0, shaftY - 1, 0, shaftY + 7);
    heroRoundRect(ctx, shaftX - 3, shaftY - 0.5, 5, 7, 2); ctx.fill();
    // Red tassel swaying under the collar.
    const sway = Math.sin(performance.now() / 160) * 2;
    ctx.strokeStyle = '#d63a2f';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(endX - 2, midY + 2);
        ctx.quadraticCurveTo(endX - 6 + sway, midY + 9 + i * 2, endX - 12 + sway * 1.5, midY + 14 + i * 3);
        ctx.stroke();
    }
    // Collar and leaf-shaped point with a raised midrib.
    ctx.fillStyle = goldFill(0, midY - 5, 0, midY + 5);
    heroRoundRect(ctx, endX - 3, midY - 4.5, 6, 9, 2); ctx.fill();
    glowIf(finisher);
    ctx.fillStyle = steelFill(0, midY - 8, 0, midY + 8, finisher);
    ctx.beginPath();
    ctx.moveTo(endX + 2, midY);
    ctx.quadraticCurveTo(endX + tipLength * 0.35, midY - 8, endX + tipLength + 2, midY);
    ctx.quadraticCurveTo(endX + tipLength * 0.35, midY + 8, endX + 2, midY);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(90, 100, 120, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(endX + 3, midY); ctx.lineTo(endX + tipLength, midY); ctx.stroke();
}

// A recurve bow held upright across the aim, with a string that is drawn back (arrow
// nocked) during the wind-up and snaps straight on release.
function drawBowModel(s) {
    const finisher = s.comboStep === 3;
    const drawing = s.isAttacking && s.attackPhase === 1;
    const cx = 38 + s.bowThrust * 3;
    const cy = 23;
    const half = 30;
    const tipTop = { x: cx - 4, y: cy - half };
    const tipBottom = { x: cx - 4, y: cy + half };
    // Limbs: bend forward from the grip, then curl back at the tips.
    glowIf(finisher);
    ctx.strokeStyle = woodFill(cx - 6, cy - half, cx + 10, cy + half);
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy + dir * 5);
        ctx.quadraticCurveTo(cx + 12, cy + dir * half * 0.55, cx - 2, cy + dir * (half - 2));
        ctx.quadraticCurveTo(cx - 5, cy + dir * half, cx - 1, cy + dir * (half + 4));
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // Gold tips and a leather grip.
    ctx.fillStyle = goldFill(0, 0, 0, 4);
    ctx.beginPath(); ctx.arc(cx - 1, cy - half - 4, 2.2, 0, Math.PI * 2); ctx.arc(cx - 1, cy + half + 4, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f1d12';
    heroRoundRect(ctx, cx - 1, cy - 6, 6, 12, 2); ctx.fill();
    ctx.fillStyle = goldFill(0, cy - 6, 0, cy + 6);
    ctx.fillRect(cx - 1, cy - 6.5, 6, 1.5);
    ctx.fillRect(cx - 1, cy + 5, 6, 1.5);
    // The string, pulled back to the nock while drawing.
    const pullX = drawing ? cx - 22 : tipTop.x + (s.isAttacking && s.attackPhase === 2 ? Math.sin(performance.now() / 15) * 1.5 : 0);
    ctx.strokeStyle = finisher ? 'rgba(255, 230, 150, 0.95)' : 'rgba(245, 240, 225, 0.9)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(tipTop.x, tipTop.y);
    ctx.lineTo(pullX, cy);
    ctx.lineTo(tipBottom.x, tipBottom.y);
    ctx.stroke();
    if (drawing) {
        // Nocked arrow: shaft, steel head past the bow, fletching at the string.
        ctx.strokeStyle = '#d9c09a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pullX, cy); ctx.lineTo(cx + 22, cy); ctx.stroke();
        ctx.fillStyle = steelFill(0, cy - 4, 0, cy + 4, finisher);
        ctx.beginPath(); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 21, cy - 4); ctx.lineTo(cx + 23, cy); ctx.lineTo(cx + 21, cy + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.moveTo(pullX, cy); ctx.lineTo(pullX + 7, cy - 4); ctx.lineTo(pullX + 9, cy); ctx.lineTo(pullX + 7, cy + 4); ctx.closePath(); ctx.fill();
    }
}

function drawScytheModel(s) {
    // A reaper's war-scythe: a long ebony snath with a violet wrap, and a huge crescent
    // blade swept back from the head, so it never reads as a sword.
    const finisher = s.comboStep === 3;
    const now = performance.now();
    const shaftEnd = Math.max(56, s.localReach - 4);
    const y = 23;
    // Snath, very slightly bowed.
    const ebony = ctx.createLinearGradient(0, y - 4, 0, y + 4);
    ebony.addColorStop(0, '#5a4a66'); ebony.addColorStop(0.5, '#2a2030'); ebony.addColorStop(1, '#120c16');
    ctx.strokeStyle = ebony;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, y + 1); ctx.quadraticCurveTo(shaftEnd * 0.5, y + 4, shaftEnd, y); ctx.stroke();
    // Butt spike.
    ctx.fillStyle = steelFill(0, y - 3, 0, y + 3, false);
    ctx.beginPath(); ctx.moveTo(4, y - 3); ctx.lineTo(-8, y + 1); ctx.lineTo(4, y + 4); ctx.closePath(); ctx.fill();
    // Violet cloth wraps and the second grip peg.
    ctx.strokeStyle = '#7d4bd6';
    ctx.lineWidth = 1.6;
    for (const x of [20, 25, 30, shaftEnd * 0.62, shaftEnd * 0.62 + 5]) {
        ctx.beginPath(); ctx.moveTo(x - 2, y - 3.5); ctx.lineTo(x + 2, y + 4); ctx.stroke();
    }
    ctx.fillStyle = '#2a2030';
    heroRoundRect(ctx, shaftEnd * 0.45, y + 2, 4, 9, 1.5); ctx.fill();
    // Head: an iron socket with a little skull-like boss.
    ctx.fillStyle = steelFill(0, y - 7, 0, y + 7, false);
    heroRoundRect(ctx, shaftEnd - 9, y - 6.5, 12, 13, 3); ctx.fill();
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath(); ctx.arc(shaftEnd - 3, y, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1420';
    ctx.beginPath(); ctx.arc(shaftEnd - 4.4, y - 0.8, 0.9, 0, Math.PI * 2); ctx.arc(shaftEnd - 1.6, y - 0.8, 0.9, 0, Math.PI * 2); ctx.fill();
    // The crescent blade: spine bulging out past the head, edge curving back to a hooked tip.
    const tipX = shaftEnd - 62;
    const tipY = y - 50;
    glowIf(finisher, 'rgba(160, 110, 255, 0.9)');
    const blade = ctx.createLinearGradient(shaftEnd, y, tipX, tipY);
    if (finisher) {
        blade.addColorStop(0, '#fff6c8'); blade.addColorStop(0.6, '#e0a82a'); blade.addColorStop(1, '#8a5a06');
    } else {
        blade.addColorStop(0, '#3c3448'); blade.addColorStop(0.45, '#8f86a8'); blade.addColorStop(1, '#e9e4f7');
    }
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(shaftEnd + 1, y - 6);
    ctx.bezierCurveTo(shaftEnd + 22, y - 30, shaftEnd - 18, tipY - 10, tipX, tipY);
    ctx.bezierCurveTo(shaftEnd - 30, tipY + 4, shaftEnd - 6, y - 22, shaftEnd - 8, y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bright cutting edge on the inner curve, and a darker spine ridge.
    ctx.strokeStyle = finisher ? 'rgba(255, 250, 220, 0.95)' : 'rgba(205, 180, 255, 0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.bezierCurveTo(shaftEnd - 30, tipY + 4, shaftEnd - 6, y - 22, shaftEnd - 8, y - 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(20, 14, 26, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(shaftEnd + 1, y - 6); ctx.bezierCurveTo(shaftEnd + 18, y - 28, shaftEnd - 18, tipY - 7, tipX + 6, tipY + 1); ctx.stroke();
    // Soul wisps drifting off the blade.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
        const t = (now / 900 + i / 4) % 1;
        const along = 0.25 + i * 0.18;
        const wx = shaftEnd + (tipX - shaftEnd) * along - t * 10;
        const wy = y - 8 + (tipY - y + 8) * along - t * 14 + Math.sin(now / 200 + i) * 2;
        ctx.fillStyle = `rgba(170, 120, 255, ${0.45 * (1 - t)})`;
        ctx.beginPath(); ctx.arc(wx, wy, 2.4 * (1 - t) + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function drawGauntletModel(s) {
    const finisher = s.comboStep === 3;
    const punch = s.isAttacking ? (s.attackPhase === 2 ? 14 : (s.attackPhase === 1 ? -4 : 6)) : 0;
    ctx.save();
    ctx.translate(punch, 0);
    // Wrist cuff with rivets.
    ctx.fillStyle = (() => { const g = ctx.createLinearGradient(0, 13, 0, 33); g.addColorStop(0, '#5d6576'); g.addColorStop(1, '#262a33'); return g; })();
    heroRoundRect(ctx, 16, 14, 13, 18, 3); ctx.fill();
    ctx.fillStyle = goldFill(0, 15, 0, 31);
    for (const y of [17, 23, 29]) { ctx.beginPath(); ctx.arc(22, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    // Armoured fist: plated back of the hand and four knuckle guards.
    glowIf(finisher);
    ctx.fillStyle = steelFill(0, 11, 0, 35, finisher);
    heroRoundRect(ctx, 28, 12, 18, 22, 6); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(60, 70, 90, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = steelFill(0, 12 + i * 5.5, 0, 17 + i * 5.5, finisher);
        heroRoundRect(ctx, 44, 12.5 + i * 5.3, 7, 4.6, 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(31, 14, 10, 1.8);
    ctx.restore();
}

function drawStaffModel(s) {
    const charging = s.isAttacking && s.attackPhase === 1;
    const glow = (s.comboStep === 3 && s.isAttacking ? 1.5 : 1) * (charging ? 1.25 : 1);
    // A gnarled shaft: two tones twisting around each other.
    ctx.strokeStyle = woodFill(0, 18, 0, 28);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 24); ctx.lineTo(58, 22); ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 35, 18, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 8; x <= 56; x += 2) ctx.lineTo(x, 23 + Math.sin(x * 0.45) * 1.8);
    ctx.stroke();
    // Gold claw holding the orb.
    ctx.strokeStyle = goldFill(0, 12, 0, 32);
    ctx.lineWidth = 2.2;
    for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(58, 22 + dir * 2);
        ctx.quadraticCurveTo(62, 22 + dir * 11, 70, 22 + dir * 9);
        ctx.stroke();
    }
    // The orb, pulsing; brighter while it charges a shot.
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    const r = 7 * glow * pulse;
    ctx.shadowColor = 'rgba(255, 122, 217, 0.95)';
    ctx.shadowBlur = 16 * glow;
    const orb = ctx.createRadialGradient(68, 20, 1, 69, 22, r);
    orb.addColorStop(0, '#fff0fb');
    orb.addColorStop(0.45, '#ff7ad9');
    orb.addColorStop(1, '#9b2fd0');
    ctx.fillStyle = orb;
    ctx.beginPath(); ctx.arc(69, 22, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
}

const WEAPON_MODELS = {
    sword: drawSwordModel,
    dual: drawDualModel,
    hammer: drawHammerModel,
    spear: drawSpearModel,
    bow: drawBowModel,
    scythe: drawScytheModel,
    gauntlet: drawGauntletModel,
    staff: drawStaffModel,
};

function drawWeaponModel(weapon, state) {
    (WEAPON_MODELS[weapon] || drawSwordModel)(state);
}
