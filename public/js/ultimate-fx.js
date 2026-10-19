// Ultimate hit areas, ultimate name banners, damage numbers and screen shake.
// Areas are drawn as true circles/cones in world space so they match the server's hit checks.
const ULTIMATE_COLORS = {
    sword: '#ffe08a',
    hammer: '#ff8a4c',
    spear: '#8fd8ff',
    bow: '#5ad8ff',
    dual: '#ff5a5a',
    scythe: '#b58cff',
    gauntlet: '#ffb35a',
    staff: '#ff7ad9',
};

function updateFloatingFx(dt) {
    damageTexts = damageTexts.filter((text) => {
        text.life -= dt;
        return text.life > 0;
    });
    ultimateBanners = ultimateBanners.filter((banner) => {
        banner.life -= dt;
        return banner.life > 0;
    });
}

function getScreenShakeOffset() {
    const remaining = screenShake.until - Date.now();
    if (remaining <= 0) return { x: 0, y: 0 };
    const strength = screenShake.strength * Math.min(1, remaining / 200);
    return { x: (Math.random() - 0.5) * 2 * strength, y: (Math.random() - 0.5) * 2 * strength };
}

function rayToWorldEdge(originX, originY, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (WORLD_WIDTH - originX) / dx);
    if (dx < -1e-6) t = Math.min(t, -originX / dx);
    if (dy > 1e-6) t = Math.min(t, (WORLD_HEIGHT - originY) / dy);
    if (dy < -1e-6) t = Math.min(t, -originY / dy);
    return Number.isFinite(t) ? Math.max(0, t) : 1000;
}

// Thin ring segment showing how much of a lasting ultimate is left.
function drawUltimateTimer(radius, remain, color) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawSwordUltimateArea(ult, elapsed, remain) {
    const r = ult.radius || 126;
    ctx.fillStyle = `rgba(255, 220, 120, ${0.1 + 0.05 * Math.sin(elapsed / 60)})`;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -elapsed / 15;
    ctx.strokeStyle = 'rgba(255, 230, 150, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Blades sweeping around the caster.
    for (let i = 0; i < 3; i++) {
        const a = elapsed / 110 + (i * Math.PI * 2) / 3;
        ctx.strokeStyle = 'rgba(255, 250, 235, 0.85)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.78, a, a + 0.9); ctx.stroke();
    }
    drawUltimateTimer(r + 8, remain, ULTIMATE_COLORS.sword);
}

function drawHammerUltimateArea(ult, elapsed, remain) {
    const r = ult.radius || 160;
    const arc = ult.extra || Math.PI * 0.7;
    const angle = ult.angle || 0;
    const grow = Math.min(1, elapsed / 220);
    ctx.globalAlpha = Math.min(1, remain * 1.6);
    ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * grow, angle - arc, angle + arc); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 90, 0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, r * grow, angle - arc, angle + arc); ctx.stroke();
    // Ground cracks.
    ctx.strokeStyle = 'rgba(60, 30, 20, 0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
        const a = angle - arc + (arc * 2 * (i + 0.5)) / 9;
        const len = r * grow * (0.6 + 0.4 * (((i * 37) % 10) / 10));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.lineTo(Math.cos(a + 0.08) * len * 0.55, Math.sin(a + 0.08) * len * 0.55);
        ctx.lineTo(Math.cos(a - 0.05) * len, Math.sin(a - 0.05) * len);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawSpearUltimateArea(ult, elapsed, remain) {
    const r = ult.radius || 180;
    ctx.globalAlpha = remain < 0.2 && Math.floor(elapsed / 70) % 2 ? 0.45 : 1;
    const gradient = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
    gradient.addColorStop(0, 'rgba(120, 200, 255, 0)');
    gradient.addColorStop(1, 'rgba(120, 200, 255, 0.28)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170, 230, 255, 0.95)';
    ctx.lineWidth = 4 + Math.sin(elapsed / 90) * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([20, 12]);
    ctx.lineDashOffset = elapsed / 12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r - 10, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawUltimateTimer(r + 9, remain, '#ffffff');
}

function drawBowUltimateArea(ult, originX, originY, elapsed, remain) {
    const angles = Array.isArray(ult.angles) && ult.angles.length ? ult.angles : [ult.angle || 0];
    angles.forEach((angle) => {
        ctx.save();
        drawDragonBeam(angle, ult.radius || 54, originX, originY, elapsed, remain);
        ctx.restore();
    });
}

function drawDragonBeam(angle, halfWidth, originX, originY, elapsed, remain) {
    const len = rayToWorldEdge(originX, originY, angle);
    const grow = Math.min(1, elapsed / 160);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, remain * 1.8);
    // A soft lane of light, brightest down the middle and fading toward its far end.
    const across = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
    across.addColorStop(0, 'rgba(60, 190, 255, 0)');
    across.addColorStop(0.5, 'rgba(60, 190, 255, 0.22)');
    across.addColorStop(1, 'rgba(60, 190, 255, 0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, -halfWidth, len * grow, halfWidth * 2);
    const along = ctx.createLinearGradient(0, 0, len * grow, 0);
    along.addColorStop(0, 'rgba(200, 245, 255, 0.6)');
    along.addColorStop(1, 'rgba(200, 245, 255, 0)');
    ctx.strokeStyle = along;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * grow, 0); ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawDualUltimateArea(source, elapsed, remain) {
    const range = getEffectiveAttackRange(source.weapon, source.stats, source);
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -elapsed / 20;
    ctx.strokeStyle = 'rgba(255, 90, 90, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Flickering aura.
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + elapsed / 300;
        const len = 34 + Math.abs(Math.sin(elapsed / 80 + i * 1.7)) * 18;
        ctx.strokeStyle = i % 2 ? 'rgba(255, 60, 60, 0.75)' : 'rgba(255, 150, 120, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
    }
    drawUltimateTimer(range + 8, remain, ULTIMATE_COLORS.dual);
}

// Harvest: the crescent ahead darkens and fills from the reaper outward during the
// wind-up (when it reaches the edge, the sweep lands), then fades.
const SCYTHE_HARVEST_WINDUP_MS = 450;
function drawScytheUltimateArea(ult, elapsed, remain) {
    const r = ult.radius || 230;
    const half = ult.extra || Math.PI * 0.6;
    const angle = ult.angle || 0;
    const charge = Math.min(1, elapsed / SCYTHE_HARVEST_WINDUP_MS);
    const swept = elapsed >= SCYTHE_HARVEST_WINDUP_MS;
    ctx.save();
    ctx.rotate(angle);
    // Whole reach, faint.
    ctx.fillStyle = swept ? `rgba(90, 40, 160, ${0.25 * remain})` : 'rgba(60, 20, 110, 0.22)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -half, half); ctx.closePath(); ctx.fill();
    if (!swept) {
        // The charge creeping outward.
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * charge + 1);
        g.addColorStop(0, 'rgba(40, 0, 70, 0.1)');
        g.addColorStop(1, 'rgba(170, 110, 255, 0.45)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * charge, -half, half); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = `rgba(200, 160, 255, ${swept ? 0.6 * remain : 0.9})`;
    ctx.lineWidth = 3;
    ctx.setLineDash(swept ? [] : [12, 8]);
    ctx.lineDashOffset = -elapsed / 30;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -half, half); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawUltimateTimer(42, remain, ULTIMATE_COLORS.scythe);
}

function drawGauntletUltimateArea(ult, elapsed, remain) {
    const r = ult.radius || 120;
    const arc = ult.extra || Math.PI / 4;
    const angle = ult.angle || 0;
    ctx.fillStyle = `rgba(255, 179, 90, ${0.16 + 0.1 * Math.abs(Math.sin(elapsed / 60))})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, angle - arc, angle + arc); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 210, 140, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, angle - arc, angle + arc); ctx.stroke();
    ctx.globalAlpha = 1;
}

// The meteor's landing circle fills up until it strikes.
function drawStaffUltimateArea(ult, elapsed) {
    const r = ult.radius || 150;
    const impactMs = ult.extra || 800;
    const fill = Math.min(1, elapsed / impactMs);
    if (fill >= 1) return;
    ctx.fillStyle = 'rgba(255, 90, 60, 0.14)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 120, 60, 0.3)';
    ctx.beginPath(); ctx.arc(0, 0, r * fill, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 150, 90, ${0.6 + 0.4 * Math.sin(elapsed / 50)})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    // The falling rock, shown high above the circle and dropping in.
    const drop = (1 - fill) * 260 / VIEW_Y_SCALE;
    ctx.fillStyle = '#5b3a2a';
    ctx.shadowColor = 'rgba(255, 140, 60, 0.9)';
    ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, -drop, 18 + fill * 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
}

// Glowing extras drawn on top of each ultimate's area (additive light).
function drawUltimateFlourish(type, ult, source, elapsed, remain) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (type === 'sword') {
        // Three crescents of sword energy orbiting the caster.
        const r = (ult.radius || 126) * 0.85;
        for (let i = 0; i < 3; i++) {
            const a = elapsed / 140 + (i * Math.PI * 2) / 3;
            ctx.save();
            ctx.rotate(a);
            const g = ctx.createLinearGradient(-r, 0, r, 0);
            g.addColorStop(0, 'rgba(255, 230, 150, 0)');
            g.addColorStop(1, 'rgba(255, 245, 210, 0.85)');
            ctx.strokeStyle = g;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.shadowColor = 'rgba(255, 220, 120, 1)';
            ctx.shadowBlur = 18;
            ctx.beginPath(); ctx.arc(0, 0, r, -0.9, 0.2); ctx.stroke();
            ctx.restore();
        }
    } else if (type === 'spear') {
        // A shimmering hex lattice and turning rune marks on the barrier.
        const r = ult.radius || 180;
        ctx.strokeStyle = `rgba(160, 225, 255, ${0.18 + 0.12 * Math.sin(elapsed / 90)})`;
        ctx.lineWidth = 1.2;
        for (let ring = 1; ring <= 3; ring++) {
            const rr = (r * ring) / 3.2;
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
                const a = (k / 6) * Math.PI * 2 + elapsed / 2000;
                if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200, 240, 255, 0.85)';
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 - elapsed / 600;
            ctx.save();
            ctx.translate(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
            ctx.rotate(a);
            ctx.fillRect(-1.5, -6, 3, 12);
            ctx.restore();
        }
    } else if (type === 'dual') {
        // Red flames licking up around the berserker.
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + elapsed / 500;
            const h = 26 + Math.abs(Math.sin(elapsed / 70 + i * 2.1)) * 30;
            const bx = Math.cos(a) * 26;
            const by = Math.sin(a) * 26;
            const g = ctx.createLinearGradient(bx, by, bx, by - h);
            g.addColorStop(0, 'rgba(255, 60, 30, 0.7)');
            g.addColorStop(1, 'rgba(255, 200, 80, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(bx - 6, by);
            ctx.quadraticCurveTo(bx - 4, by - h * 0.6, bx, by - h);
            ctx.quadraticCurveTo(bx + 4, by - h * 0.6, bx + 6, by);
            ctx.closePath();
            ctx.fill();
        }
    } else if (type === 'scythe') {
        // Souls drawn into the blade while it winds up.
        const r = ult.radius || 230;
        if (elapsed < SCYTHE_HARVEST_WINDUP_MS) {
            const angle = ult.angle || 0;
            const half = ult.extra || Math.PI * 0.6;
            for (let i = 0; i < 9; i++) {
                const phase = ((elapsed / 450) + i / 9) % 1;
                const a = angle - half + ((i * 0.37) % 1) * half * 2;
                const rr = r * (1 - phase);
                const x = Math.cos(a) * rr;
                const y = Math.sin(a) * rr;
                const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
                g.addColorStop(0, `rgba(225, 205, 255, ${0.9 * phase})`);
                g.addColorStop(1, 'rgba(150, 90, 255, 0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
            }
        }
    } else if (type === 'gauntlet') {
        // Fist afterimages streaking down the cone.
        const r = ult.radius || 120;
        const angle = ult.angle || 0;
        for (let i = 0; i < 6; i++) {
            const phase = ((elapsed / 120) + i / 6) % 1;
            const off = ((i * 37) % 10) / 10 - 0.5;
            const a = angle + off * (ult.extra || Math.PI / 4);
            const d = r * (0.25 + phase * 0.75);
            const x = Math.cos(a) * d;
            const y = Math.sin(a) * d;
            ctx.fillStyle = `rgba(255, 200, 120, ${0.7 * (1 - phase)})`;
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255, 240, 210, ${0.6 * (1 - phase)})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 24, y - Math.sin(a) * 24); ctx.lineTo(x, y); ctx.stroke();
        }
    } else if (type === 'staff') {
        // A fiery trail behind the falling rock.
        const impactMs = ult.extra || 800;
        const fill = Math.min(1, elapsed / impactMs);
        if (fill < 1) {
            const drop = (1 - fill) * 260 / VIEW_Y_SCALE;
            const g = ctx.createLinearGradient(0, -drop - 160, 0, -drop);
            g.addColorStop(0, 'rgba(255, 120, 40, 0)');
            g.addColorStop(1, 'rgba(255, 190, 90, 0.9)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(-14, -drop - 160);
            ctx.lineTo(14, -drop - 160);
            ctx.lineTo(24, -drop);
            ctx.lineTo(-24, -drop);
            ctx.closePath();
            ctx.fill();
        }
    } else if (type === 'hammer') {
        // A bright shockwave front running out along the wedge.
        const r = ult.radius || 160;
        const arc = ult.extra || Math.PI / 6;
        const angle = ult.angle || 0;
        const front = r * Math.min(1, elapsed / 300);
        ctx.strokeStyle = `rgba(255, 220, 140, ${Math.min(1, remain * 2)})`;
        ctx.lineWidth = 8;
        ctx.shadowColor = 'rgba(255, 140, 60, 1)';
        ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(0, 0, front, angle - arc, angle + arc); ctx.stroke();
    }
    ctx.restore();
}

function drawUltimateAreas() {
    const now = Date.now();
    Object.values(allPlayers).forEach((p) => {
        const source = p.id === myId ? player : p;
        if (!source || source.hp <= 0) return;
        const ult = getUltimateState(source);
        if (!ult.active || now >= ult.endsAt) return;
        const elapsed = Math.max(0, now - (ult.startAt || now));
        const remain = Math.max(0, Math.min(1, (ult.endsAt - now) / Math.max(1, ult.endsAt - ult.startAt)));
        const type = normalizeWeapon(ult.type);
        // Hammer, bow, gauntlet and staff fire from where they were cast; the others follow the caster.
        const fixed = type === 'hammer' || type === 'bow' || type === 'gauntlet' || type === 'staff' || type === 'scythe';
        // Their direction, size and origin come from the server, so wait for its copy
        // instead of drawing the local guess (which pointed right until it arrived).
        if (fixed && ult.predicted) return;
        const originX = fixed && ult.x ? ult.x : source.x;
        const originY = fixed && ult.y ? ult.y : source.y;
        ctx.save();
        ctx.translate(originX, originY);
        if (type === 'sword') drawSwordUltimateArea(ult, elapsed, remain);
        else if (type === 'hammer') drawHammerUltimateArea(ult, elapsed, remain);
        else if (type === 'spear') drawSpearUltimateArea(ult, elapsed, remain);
        else if (type === 'bow') drawBowUltimateArea(ult, originX, originY, elapsed, remain);
        else if (type === 'dual') drawDualUltimateArea(source, elapsed, remain);
        else if (type === 'scythe') drawScytheUltimateArea(ult, elapsed, remain);
        else if (type === 'gauntlet') drawGauntletUltimateArea(ult, elapsed, remain);
        else if (type === 'staff') drawStaffUltimateArea(ult, elapsed);
        drawUltimateFlourish(type, ult, source, elapsed, remain);
        ctx.restore();
    });
}

function drawUltimateBanners() {
    ultimateBanners.forEach((banner) => {
        const caster = banner.playerId === myId ? player : allPlayers[banner.playerId];
        if (!caster) return;
        const age = banner.maxLife - banner.life;
        const pop = age < 0.15 ? 1.5 - (age / 0.15) * 0.5 : 1;
        const scale = Math.max(1, caster.giantScale || 1);
        ctx.save();
        ctx.translate(caster.x, caster.y);
        ctx.scale(1, 1 / VIEW_Y_SCALE);
        ctx.translate(0, -92 * scale - age * 14);
        ctx.scale(pop, pop);
        ctx.globalAlpha = Math.min(1, banner.life / 0.3);
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillStyle = ULTIMATE_COLORS[banner.type] || '#ffffff';
        ctx.strokeText(banner.text, 0, 0);
        ctx.fillText(banner.text, 0, 0);
        ctx.restore();
    });
}

function drawDamageTexts() {
    damageTexts.forEach((text) => {
        const p = Math.max(0, text.life / text.maxLife);
        const x = text.x + text.drift * (1 - p);
        const y = text.y - 30 - (1 - p) * 34;
        ctx.save();
        ctx.translate(text.x, text.y);
        ctx.scale(1, 1 / VIEW_Y_SCALE);
        ctx.translate(-text.x, -text.y);
        ctx.globalAlpha = Math.min(1, p * 2);
        ctx.font = `bold ${text.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillStyle = text.color;
        ctx.strokeText(text.text, x, y);
        ctx.fillText(text.text, x, y);
        ctx.restore();
    });
}

// Spinning stars over a stunned mob.
function drawMobStun(mob, radius) {
    const t = Date.now() / 180 + mob.seed;
    ctx.save();
    ctx.translate(mob.x, mob.y - radius - 14);
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * radius * 0.7;
        const sy = Math.sin(a) * 4;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
            const pa = (k * Math.PI * 4) / 5 - Math.PI / 2;
            ctx.lineTo(sx + Math.cos(pa) * 4, sy + Math.sin(pa) * 4);
        }
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}
