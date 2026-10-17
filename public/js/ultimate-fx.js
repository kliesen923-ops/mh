// Ultimate hit areas, ultimate name banners, damage numbers and screen shake.
// Areas are drawn as true circles/cones in world space so they match the server's hit checks.
const ULTIMATE_COLORS = {
    sword: '#ffe08a',
    hammer: '#ff8a4c',
    spear: '#8fd8ff',
    bow: '#5ad8ff',
    dual: '#ff5a5a',
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
    ctx.fillStyle = 'rgba(60, 190, 255, 0.24)';
    ctx.fillRect(0, -halfWidth, len * grow, halfWidth * 2);
    ctx.strokeStyle = 'rgba(160, 235, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -halfWidth); ctx.lineTo(len * grow, -halfWidth);
    ctx.moveTo(0, halfWidth); ctx.lineTo(len * grow, halfWidth);
    ctx.stroke();
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
        // Hammer and bow fire once from where they were cast; the others follow the caster.
        const fixed = type === 'hammer' || type === 'bow';
        const originX = fixed && ult.x ? ult.x : source.x;
        const originY = fixed && ult.y ? ult.y : source.y;
        ctx.save();
        ctx.translate(originX, originY);
        if (type === 'sword') drawSwordUltimateArea(ult, elapsed, remain);
        else if (type === 'hammer') drawHammerUltimateArea(ult, elapsed, remain);
        else if (type === 'spear') drawSpearUltimateArea(ult, elapsed, remain);
        else if (type === 'bow') drawBowUltimateArea(ult, originX, originY, elapsed, remain);
        else if (type === 'dual') drawDualUltimateArea(source, elapsed, remain);
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
