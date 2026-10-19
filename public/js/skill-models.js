// Drawings for the skills (sub-weapons): grapple wire, ash arrow, gear-rush cables,
// bear trap, blink rune and the healing flask. Ground pieces are drawn flat in world
// space; anything that stands up goes through drawUpright.

// ── Grapple wire ────────────────────────────────────────────────────────────────
// A braided steel cable that sags while it flies out and pulls taut as it lands.
function drawGrappleCable(fromX, fromY, tipX, tipY, progress) {
    const length = Math.hypot(tipX - fromX, tipY - fromY);
    if (length < 2) return;
    const sag = Math.min(26, length * 0.12) * (1 - Math.min(1, progress));
    const nx = -(tipY - fromY) / length;
    const ny = (tipX - fromX) / length;
    const cx = (fromX + tipX) / 2 + nx * sag;
    const cy = (fromY + tipY) / 2 + ny * sag;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(30, 32, 38, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(205, 212, 224, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    // Braid: short gold ticks along the curve.
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.9)';
    ctx.lineWidth = 1.4;
    const ticks = Math.floor(length / 14);
    for (let i = 1; i < ticks; i++) {
        const t = i / ticks;
        const x = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * cx + t * t * tipX;
        const y = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * cy + t * t * tipY;
        ctx.beginPath(); ctx.moveTo(x - nx * 2.5 - ny * 2, y - ny * 2.5 + nx * 2); ctx.lineTo(x + nx * 2.5 + ny * 2, y + ny * 2.5 - nx * 2); ctx.stroke();
    }
    ctx.restore();
}

// A three-pronged steel grappling claw; the prongs close as it reaches the end.
function drawGrappleClaw(tipX, tipY, angle, progress) {
    const close = Math.min(1, Math.max(0, progress)) * 0.35;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 214, 120, 0.6)';
    ctx.shadowBlur = 10;
    // Collar where the cable ties on.
    const collar = ctx.createLinearGradient(0, -5, 0, 5);
    collar.addColorStop(0, '#f6e7a8'); collar.addColorStop(0.5, '#d4a017'); collar.addColorStop(1, '#7a5a08');
    ctx.fillStyle = collar;
    heroRoundRect(ctx, -9, -4.5, 9, 9, 2.5); ctx.fill();
    ctx.shadowBlur = 0;
    // Prongs.
    const steel = ctx.createLinearGradient(0, -10, 0, 10);
    steel.addColorStop(0, '#f4f7fb'); steel.addColorStop(0.5, '#a9b2c0'); steel.addColorStop(1, '#4b5361');
    ctx.strokeStyle = steel;
    ctx.lineWidth = 3.2;
    for (const side of [-1, 0, 1]) {
        const spread = side * (0.9 - close);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const midX = 9;
        const midY = Math.sin(spread) * 10;
        ctx.quadraticCurveTo(midX, midY * 1.2, 15 + Math.abs(side) * -1, midY);
        // Hooked tip curling back toward the middle.
        ctx.lineTo(13 + Math.abs(side) * -1, midY - side * 4);
        ctx.stroke();
    }
    ctx.fillStyle = '#e9edf3';
    ctx.beginPath(); ctx.arc(1, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// ── Ash arrow ───────────────────────────────────────────────────────────────────
// A faceted ice-blue crystal bolt with a glowing streak and drifting ash motes behind.
function drawAshBolt(originX, originY, tipX, tipY, angle, progress) {
    const now = performance.now();
    const travelled = Math.hypot(tipX - originX, tipY - originY);
    const tail = Math.min(140, travelled);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    if (tail > 4) {
        const streak = ctx.createLinearGradient(-tail, 0, 0, 0);
        streak.addColorStop(0, 'rgba(60, 140, 255, 0)');
        streak.addColorStop(1, 'rgba(120, 210, 255, 0.55)');
        ctx.fillStyle = streak;
        ctx.beginPath(); ctx.moveTo(-tail, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
        // Motes peel off the streak and drift sideways.
        for (let i = 0; i < 7; i++) {
            const t = ((now / 260 + i / 7) % 1);
            const x = -12 - t * tail;
            const y = Math.sin(i * 2.3 + now / 120) * (2 + t * 9);
            ctx.fillStyle = `rgba(170, 225, 255, ${0.7 * (1 - t)})`;
            ctx.beginPath(); ctx.arc(x, y, 1.8 * (1 - t) + 0.6, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.globalCompositeOperation = 'source-over';
    // Crystal body: two facets, dark and light, with a bright core.
    ctx.shadowColor = 'rgba(90, 190, 255, 0.95)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#2a7bff';
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-12, -6); ctx.lineTo(-34, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8fd6ff';
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-12, 6); ctx.lineTo(-34, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230, 248, 255, 0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-34, 0); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-8, -1.6); ctx.lineTo(-14, 0); ctx.lineTo(-8, 1.6); ctx.closePath(); ctx.fill();
    // Two small shards orbiting the shaft.
    for (let i = 0; i < 2; i++) {
        const a = now / 90 + i * Math.PI;
        const x = -20 + Math.cos(a) * 3;
        const y = Math.sin(a) * 9;
        ctx.fillStyle = 'rgba(200, 240, 255, 0.9)';
        ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x, y - 2); ctx.lineTo(x - 3, y); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}

// ── Gear rush ───────────────────────────────────────────────────────────────────
// Twin steel cables from the hips to an anchor bolt at the target, with gas puffs behind.
function drawRushCables(leftX, leftY, rightX, rightY, tipX, tipY, angle, progress, scale) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const [x, y] of [[leftX, leftY], [rightX, rightY]]) {
        ctx.strokeStyle = 'rgba(25, 28, 34, 0.8)';
        ctx.lineWidth = 3.6 * scale;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tipX, tipY); ctx.stroke();
        ctx.strokeStyle = 'rgba(225, 232, 242, 0.95)';
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tipX, tipY); ctx.stroke();
        // Gas puffs drifting back from the launchers.
        for (let i = 0; i < 3; i++) {
            const t = Math.min(1, progress * 1.4 + i * 0.12);
            const px = x - Math.cos(angle) * (8 + t * 26) * scale;
            const py = y - Math.sin(angle) * (8 + t * 26) * scale;
            ctx.fillStyle = `rgba(235, 240, 248, ${0.3 * (1 - t)})`;
            ctx.beginPath(); ctx.arc(px, py, (5 + t * 9) * scale, 0, Math.PI * 2); ctx.fill();
        }
    }
    // Anchor bolt: a steel dart with a gold band and a spark where it bites in.
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    const steel = ctx.createLinearGradient(0, -5, 0, 5);
    steel.addColorStop(0, '#f4f7fb'); steel.addColorStop(0.5, '#9aa4b3'); steel.addColorStop(1, '#3f4654');
    ctx.fillStyle = steel;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-2, -5); ctx.lineTo(-8, -3); ctx.lineTo(-8, 3); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-6, -3.2, 2.4, 6.4);
    if (progress < 0.4) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 230, 140, 0.9)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            const a = (i - 2) * 0.5;
            ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(11 + Math.cos(a) * 9, Math.sin(a) * 9); ctx.stroke();
        }
    }
    ctx.restore();
}

// ── Bear trap ───────────────────────────────────────────────────────────────────
// Flat on the ground: a chained steel ring, two toothed jaws laid open around a brass
// pressure plate. Not yet armed, the jaws are still folded in and dull.
function drawBearTrap(mine, armed, now) {
    const steel = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24);
    steel.addColorStop(0, '#eef1f6'); steel.addColorStop(0.6, '#8a93a1'); steel.addColorStop(1, '#3d434e');
    // Chain to a stake.
    ctx.strokeStyle = '#6b717c';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(24 + i * 6, 6 + i * 3, 3.2, 2, 0.45, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#4a3527';
    ctx.beginPath(); ctx.arc(43, 15, 3.4, 0, Math.PI * 2); ctx.fill();
    // Base ring.
    ctx.fillStyle = 'rgba(28, 31, 38, 0.8)';
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = steel;
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
    // Two jaws, each a half ring with teeth pointing at the plate.
    const open = armed ? 1 : 0.55;
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(1, open);
        ctx.strokeStyle = armed ? steel : '#6f7682';
        ctx.lineWidth = 3;
        const a0 = side < 0 ? Math.PI * 1.06 : Math.PI * 0.06;
        const a1 = side < 0 ? Math.PI * 1.94 : Math.PI * 0.94;
        ctx.beginPath(); ctx.arc(0, 0, 17, a0, a1); ctx.stroke();
        ctx.fillStyle = armed ? '#f2f4f8' : '#9aa0aa';
        for (let i = 0; i < 6; i++) {
            const a = a0 + ((a1 - a0) * (i + 0.5)) / 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - 0.12) * 16, Math.sin(a - 0.12) * 16);
            ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5);
            ctx.lineTo(Math.cos(a + 0.12) * 16, Math.sin(a + 0.12) * 16);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
    // Hinges at the sides.
    ctx.fillStyle = '#c3c9d3';
    ctx.beginPath(); ctx.arc(-19, 0, 3, 0, Math.PI * 2); ctx.arc(19, 0, 3, 0, Math.PI * 2); ctx.fill();
    // Pressure plate with the owner's colour.
    const plate = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
    plate.addColorStop(0, '#fbe7a1'); plate.addColorStop(1, '#a8740c');
    ctx.fillStyle = plate;
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mine ? '#e67e22' : '#e74c3c';
    ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
    // Your own armed trap glints now and then so you can find it again.
    if (mine && armed) {
        const glint = Math.max(0, Math.sin(now / 420)) ** 8;
        if (glint > 0.02) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 245, 210, ${0.8 * glint})`;
            ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-7, -8); ctx.lineTo(-3, -11); ctx.lineTo(-7, -14); ctx.closePath(); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
    }
}

// ── Blink mark ──────────────────────────────────────────────────────────────────
// A rune circle on the ground (outer ring of glyph ticks and a counter-rotating
// star) and, standing over it, a floating violet crystal.
function drawBlinkRune(now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
    glow.addColorStop(0, 'rgba(170, 150, 255, 0.45)');
    glow.addColorStop(1, 'rgba(110, 80, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.rotate(now / 1400);
    ctx.strokeStyle = 'rgba(190, 175, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.stroke();
    // Glyph ticks between the two rings.
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        if (i % 3 === 0) { ctx.moveTo(23.5, -2); ctx.lineTo(27.5, 0); ctx.lineTo(23.5, 2); }
        else if (i % 3 === 1) { ctx.moveTo(24, 0); ctx.lineTo(27.5, 0); }
        else { ctx.arc(25.7, 0, 1.3, 0, Math.PI * 2); }
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
    // Counter-rotating six-pointed star.
    ctx.save();
    ctx.rotate(-now / 900);
    ctx.strokeStyle = 'rgba(215, 205, 255, 0.9)';
    ctx.lineWidth = 1.6;
    for (const offset of [0, Math.PI / 3]) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = offset + (Math.PI * 2 * i) / 3 - Math.PI / 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); else ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
        }
        ctx.closePath();
        ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
}

// Drawn upright, at (x, y - lift): a two-tone diamond with a highlight and a soft halo.
function drawBlinkCrystal(x, y, now) {
    const bob = Math.sin(now / 300) * 4;
    const cy = y - 34 + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, cy, 1, x, cy, 20);
    halo.addColorStop(0, 'rgba(200, 185, 255, 0.55)');
    halo.addColorStop(1, 'rgba(120, 90, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, cy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const turn = Math.cos(now / 380);
    const w = 8 * (0.45 + 0.55 * Math.abs(turn));
    ctx.fillStyle = '#6c4fe0';
    ctx.beginPath(); ctx.moveTo(x, cy - 13); ctx.lineTo(x - w, cy); ctx.lineTo(x, cy + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b9a8ff';
    ctx.beginPath(); ctx.moveTo(x, cy - 13); ctx.lineTo(x + w, cy); ctx.lineTo(x, cy + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath(); ctx.moveTo(x, cy - 11); ctx.lineTo(x + w * 0.4, cy - 3); ctx.lineTo(x, cy - 1); ctx.closePath(); ctx.fill();
    // A thin beam down to the rune.
    ctx.strokeStyle = 'rgba(180, 165, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, cy + 14); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
}

// ── Healing flask ───────────────────────────────────────────────────────────────
// Drawn upright at the centre of the heal zone: a round glass flask of glowing green
// tonic, corked, that bobs gently while bubbles rise inside.
function drawHealFlask(x, y, now, remain) {
    const bob = Math.sin(now / 350) * 2.5;
    const cy = y - 26 + bob;
    const r = 11;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, cy, 2, x, cy, 30);
    halo.addColorStop(0, 'rgba(120, 255, 170, 0.5)');
    halo.addColorStop(1, 'rgba(46, 204, 113, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, cy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Glass bulb.
    ctx.fillStyle = 'rgba(220, 255, 235, 0.25)';
    ctx.strokeStyle = 'rgba(235, 255, 245, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Tonic, its level dropping as the zone runs out.
    const level = cy + r - (2 * r) * (0.25 + 0.6 * remain);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, cy, r - 1.5, 0, Math.PI * 2); ctx.clip();
    const tonic = ctx.createLinearGradient(0, level, 0, cy + r);
    tonic.addColorStop(0, '#9dffbf'); tonic.addColorStop(1, '#16a35a');
    ctx.fillStyle = tonic;
    ctx.fillRect(x - r, level + Math.sin(now / 160) * 0.8, r * 2, cy + r - level + 2);
    ctx.fillStyle = 'rgba(240, 255, 245, 0.85)';
    for (let i = 0; i < 3; i++) {
        const t = ((now / 900 + i / 3) % 1);
        const by = cy + r - 2 - t * (cy + r - level);
        ctx.beginPath(); ctx.arc(x - 4 + i * 4, by, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Neck, cork and a highlight on the glass.
    ctx.fillStyle = 'rgba(220, 255, 235, 0.35)';
    ctx.strokeStyle = 'rgba(235, 255, 245, 0.9)';
    ctx.beginPath(); ctx.rect(x - 3.5, cy - r - 7, 7, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9b6b3c';
    heroRoundRect(ctx, x - 4.5, cy - r - 12, 9, 6, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath(); ctx.ellipse(x - 4.5, cy - 4, 2, 4, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}
