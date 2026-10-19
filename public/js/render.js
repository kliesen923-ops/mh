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
            drawGrappleCable(x, y, tipX, tipY, wireProgress);
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
    } else if (weapon === 'scythe') {
        // Carried with the blade raised behind; swings sweep wider than a sword's.
        if (isAttacking) {
            if (attackPhase === 1) sRot = comboStep === 2 ? 1.9 : -1.9;
            else if (attackPhase === 2) sRot = comboStep === 2 ? -1.5 : 1.5;
            else if (attackPhase === 3) sRot = comboStep === 2 ? -0.7 : 0.7;
        } else if (isGuarding) sRot = 0.3;
        else sRot = 1.25;
    } else if(isAttacking) {
        if(attackPhase === 1) sRot = (comboStep===2?1.5:-1.5); else if(attackPhase === 2) sRot = (comboStep===2?-1.2:1.2); else if(attackPhase === 3) sRot = (comboStep===2?-0.5:0.5);
    } else if(isGuarding) sRot = 0.2;
    const spearThrust = weapon === 'spear' ? (isAttacking ? (attackPhase === 1 ? -1.35 : (attackPhase === 2 ? 1.45 : 0.35)) : spearPose) : 0;
    const bowThrust = weapon === 'bow' ? (isAttacking ? (attackPhase === 1 ? -1 : (attackPhase === 2 ? 1 : 0.3)) : bowPose) : 0;
    ctx.rotate(sRot);
    ctx.fillStyle = getHeroSkinTone(p.look);
    ctx.fillRect(15 + spearThrust * 7 + bowThrust * 5, 18 - spearThrust * 2 - bowThrust * 1.5, 20 + spearThrust * 5, 10);
    drawWeaponModel(weapon, {
        localReach, weaponLength, comboStep, isAttacking, attackPhase, dualPose, spearThrust, bowThrust,
        thrustReach: (isAttacking ? attackRange : visualAttackRange) / bodyScale, dualUltimateActive,
    });
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
    noteAttackPhase(p, weapon, attackRange);
}

function drawCombatEffects() {
    combatEffects.forEach((effect) => {
        const t = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        const alpha = t;
        ctx.save();
        ctx.translate(effect.x, effect.y);
        ctx.globalAlpha = alpha;
        // Ultimate hit marks are light: overlapping ones add up.
        if (SPECIAL_EFFECTS.has(effect.weapon)) ctx.globalCompositeOperation = 'lighter';
        if (WEAPON_FX[effect.weapon]) {
            drawWeaponHit(effect, t);
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
            // The dragon's bite: a cold flash and fangs of light.
            const r = 20 + (1 - t) * 50;
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            g.addColorStop(0, 'rgba(230, 250, 255, 0.95)');
            g.addColorStop(1, 'rgba(60, 180, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.rotate(effect.angle);
            ctx.fillStyle = 'rgba(200, 245, 255, 0.95)';
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(-10, side * 6);
                ctx.lineTo(18 + (1 - t) * 14, side * 2);
                ctx.lineTo(-4, side * 16);
                ctx.closePath();
                ctx.fill();
            }
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
            drawWeaponHit(effect, t);
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

// Arrows fly at hand height (the bow is held there), with a fading streak behind and a
// faint shadow on the ground under them.
function drawBowProjectiles() {
    const lift = (HERO_HAND_LIFT * HERO_FIGURE_SCALE) / VIEW_Y_SCALE;
    bowProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const tipX = effect.startX + (effect.endX - effect.startX) * p;
        const tipY = effect.startY + (effect.endY - effect.startY) * p;
        const tailBack = Math.min(90, Math.hypot(tipX - effect.startX, tipY - effect.startY));
        const tailX = tipX - Math.cos(effect.angle) * tailBack;
        const tailY = tipY - Math.sin(effect.angle) * tailBack;
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
        const streak = ctx.createLinearGradient(tailX, tailY - lift, tipX, tipY - lift);
        const tint = effect.reflected ? '255, 150, 130' : '255, 230, 170';
        streak.addColorStop(0, `rgba(${tint}, 0)`);
        streak.addColorStop(1, `rgba(${tint}, 0.75)`);
        ctx.strokeStyle = streak;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(tailX, tailY - lift); ctx.lineTo(tipX, tipY - lift); ctx.stroke();
        ctx.restore();
        drawBowArrow(effect.startX, effect.startY - lift, tipX, tipY - lift, effect.angle, p, effect.reflected);
    });
}
// The bow ultimate: an eastern dragon that flies low over the ground, its body winding
// behind the head, with a shadow under it.
const DRAGON_SEGMENTS = 20;
const DRAGON_SPACING = 20;
// Size of the head relative to its drawing units.
const DRAGON_HEAD_SCALE = 1.7;
function drawDragonProjectiles() {
    const lift = (HERO_HAND_LIFT * HERO_FIGURE_SCALE * 1.4) / VIEW_Y_SCALE;
    dragonProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const distance = Math.hypot(effect.endX - effect.startX, effect.endY - effect.startY);
        const travelled = distance * p;
        const dirX = Math.cos(effect.angle);
        const dirY = Math.sin(effect.angle);
        const normX = -dirY;
        const normY = dirX;
        const wave = (performance.now() / 1000) * 9 + (effect.seed || 0);
        const palette = effect.reflected
            ? { body: '220, 70, 70', belly: '255, 210, 170', glow: '255, 120, 120', mane: '255, 230, 200' }
            : { body: '40, 150, 255', belly: '200, 245, 255', glow: '90, 220, 255', mane: '235, 255, 255' };
        // Fades in from the bow and out at the edge of its flight.
        const fade = Math.min(1, p * 8) * Math.min(1, (1 - p) * 6 + 0.25);
        // Points along the body, head first; the body only exists behind where it has flown.
        const points = [];
        for (let i = 0; i < DRAGON_SEGMENTS; i++) {
            const along = travelled - i * DRAGON_SPACING;
            if (along < 0) break;
            const sway = Math.sin(wave - i * 0.5) * 22 * Math.min(1, i / 3);
            points.push({
                x: effect.startX + dirX * along + normX * sway,
                y: effect.startY + dirY * along + normY * sway,
                w: (i === 0 ? 22 : 24 * (1 - i / DRAGON_SEGMENTS) + 5),
            });
        }
        if (points.length < 2) return;
        ctx.save();
        ctx.globalAlpha = fade;
        // Shadow on the ground.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 30;
        ctx.beginPath();
        points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
        ctx.translate(0, -lift);
        // Glow, then the body as tapering segments from tail to head.
        ctx.shadowColor = `rgba(${palette.glow}, 0.95)`;
        ctx.shadowBlur = 24;
        for (let i = points.length - 1; i > 0; i--) {
            const a = points[i];
            const b = points[i - 1];
            ctx.strokeStyle = `rgba(${palette.body}, 0.95)`;
            ctx.lineWidth = a.w * 2;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // Pale belly stripe and scale marks.
        ctx.strokeStyle = `rgba(${palette.belly}, 0.75)`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
        for (let i = 2; i < points.length - 1; i += 2) {
            const pt = points[i];
            const next = points[i - 1];
            const segAngle = Math.atan2(next.y - pt.y, next.x - pt.x);
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(segAngle);
            // Dorsal fin.
            ctx.fillStyle = `rgba(${palette.mane}, 0.85)`;
            ctx.beginPath();
            ctx.moveTo(-8, -pt.w + 2);
            ctx.lineTo(3, -pt.w - 13);
            ctx.lineTo(8, -pt.w + 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // Head: snout, open jaw, horns, eye and whiskers.
        const head = points[0];
        const neck = points[1];
        const headAngle = Math.atan2(head.y - neck.y, head.x - neck.x);
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(headAngle);
        ctx.scale(DRAGON_HEAD_SCALE, DRAGON_HEAD_SCALE);
        ctx.shadowColor = `rgba(${palette.glow}, 1)`;
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(${palette.body}, 1)`;
        ctx.beginPath();
        ctx.moveTo(-12, -14);
        ctx.quadraticCurveTo(14, -16, 30, -5);
        ctx.lineTo(16, -1);
        ctx.lineTo(28, 6);
        ctx.quadraticCurveTo(10, 14, -12, 12);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${palette.belly}, 0.9)`;
        ctx.beginPath(); ctx.moveTo(16, -1); ctx.lineTo(28, 6); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(${palette.mane}, 0.95)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-6, -12); ctx.quadraticCurveTo(-16, -26, -28, -24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(-8, -30, -20, -32); ctx.stroke();
        ctx.lineWidth = 1.6;
        const whisker = Math.sin(wave) * 6;
        ctx.beginPath(); ctx.moveTo(24, -4); ctx.quadraticCurveTo(10, -18 + whisker, -14, -20 + whisker); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(22, 6); ctx.quadraticCurveTo(8, 18 - whisker, -14, 20 - whisker); ctx.stroke();
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath(); ctx.ellipse(8, -7, 4, 2.6, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#10223a';
        ctx.beginPath(); ctx.arc(9, -7, 1.6, 0, Math.PI * 2); ctx.fill();
        // Breath glow at the mouth.
        ctx.fillStyle = `rgba(${palette.mane}, 0.7)`;
        ctx.beginPath(); ctx.arc(32, 1, 5 + Math.sin(wave * 2) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
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
    drawAshBolt(originX, originY, tipX, tipY, angle, progress);
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
    drawGrappleClaw(tipX, tipY, angle, progress);
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
    drawSwingTrails();
    // Standing characters overlap, so draw the ones further back (smaller y) first.
    Object.values(allPlayers).filter(p => p.hp > 0).sort((a, b) => a.y - b.y)
        .forEach(p => drawCharacter(p, (p.id === myId) ? "#e67e22" : "#3498db"));
    drawHealingTexts();
    drawCombatEffects();
    drawHitParticles();
    drawCastPillars();
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
