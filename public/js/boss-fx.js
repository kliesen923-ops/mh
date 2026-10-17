// Boss look, slam telegraphs, the boss health bar and center-screen announcements.
const BOSS_RADIUS = 44;
let bossSlams = [];
let bossSlamBursts = [];
let announcements = [];
const bossLevels = {};

function announce(text, color) {
    announcements.push({ text, color, life: 2.2, maxLife: 2.2 });
}

function updateBossFx(dt) {
    const now = Date.now();
    bossSlams = bossSlams.filter((slam) => now < slam.hitAt + 150);
    bossSlamBursts = bossSlamBursts.filter((burst) => {
        burst.life -= dt;
        return burst.life > 0;
    });
    announcements = announcements.filter((item) => {
        item.life -= dt;
        return item.life > 0;
    });
}

function drawBoss(mob) {
    const now = Date.now();
    const r = BOSS_RADIUS;
    const winding = bossSlams.some((slam) => slam.id === mob.id);
    const pulse = winding ? 1 + Math.sin(now / 45) * 0.06 : 1 + Math.sin(now / 220 + mob.seed) * 0.03;
    ctx.save();
    ctx.translate(mob.x, mob.y);
    ctx.globalAlpha = mob.mine ? 1 : 0.7;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.8, r * 1.05, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(pulse, pulse);
    ctx.shadowColor = winding ? 'rgba(255, 60, 60, 0.95)' : 'rgba(160, 30, 30, 0.8)';
    ctx.shadowBlur = winding ? 26 : 14;
    ctx.fillStyle = mob.flash > 0 ? '#ffffff' : '#7b1010';
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // Horns.
    ctx.fillStyle = '#e8d9b0';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.45, -r * 0.75);
        ctx.lineTo(side * r * 0.95, -r * 1.35);
        ctx.lineTo(side * r * 0.75, -r * 0.55);
        ctx.closePath();
        ctx.fill();
    }
    // Crown.
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.82);
    ctx.lineTo(-r * 0.4, -r * 1.12);
    ctx.lineTo(-r * 0.2, -r * 0.95);
    ctx.lineTo(0, -r * 1.22);
    ctx.lineTo(r * 0.2, -r * 0.95);
    ctx.lineTo(r * 0.4, -r * 1.12);
    ctx.lineTo(r * 0.4, -r * 0.82);
    ctx.closePath();
    ctx.fill();
    // Angry eyes that track the owner.
    const look = mob.mine ? Math.atan2(player.y - mob.y, player.x - mob.x) : 0;
    const ex = Math.cos(look) * r * 0.12;
    const ey = Math.sin(look) * r * 0.12;
    ctx.fillStyle = '#ffe066';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.12 + ex, -r * 0.18 + ey);
        ctx.lineTo(side * r * 0.55 + ex, -r * 0.34 + ey);
        ctx.lineTo(side * r * 0.5 + ex, -r * 0.02 + ey);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
    if (mob.hpPct < 100) {
        const w = r * 2.4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(mob.x - w / 2, mob.y - r * 1.5 - 12, w, 6);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(mob.x - w / 2, mob.y - r * 1.5 - 12, w * Math.max(0, mob.hpPct) / 100, 6);
    }
}

// Red circle that fills up until the slam lands.
function drawBossSlams() {
    const now = Date.now();
    bossSlams.forEach((slam) => {
        const t = Math.max(0, Math.min(1, 1 - (slam.hitAt - now) / slam.windupMs));
        ctx.save();
        ctx.translate(slam.x, slam.y);
        ctx.fillStyle = 'rgba(231, 76, 60, 0.12)';
        ctx.beginPath(); ctx.arc(0, 0, slam.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(231, 76, 60, 0.28)';
        ctx.beginPath(); ctx.arc(0, 0, slam.radius * t, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, 90, 70, ${0.6 + 0.4 * Math.sin(now / 60)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, slam.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });
    bossSlamBursts.forEach((burst) => {
        const p = Math.max(0, burst.life / burst.maxLife);
        ctx.save();
        ctx.translate(burst.x, burst.y);
        ctx.globalAlpha = p;
        ctx.strokeStyle = 'rgba(255, 200, 120, 0.95)';
        ctx.lineWidth = 8 * p + 2;
        ctx.beginPath(); ctx.arc(0, 0, burst.radius * (1 + (1 - p) * 0.25), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });
}

// Health bar for the player's own boss at the top of the screen (HTML, see hud.css).
let shownBossBar = '';
function updateBossBar() {
    let boss = null;
    mobs.forEach((mob) => { if (mob.boss && mob.mine) boss = mob; });
    const bar = document.getElementById('boss-bar');
    if (!bar) return;
    const state = boss ? `${boss.id}:${boss.hpPct}:${bossLevels[boss.id] || ''}` : '';
    if (state === shownBossBar) return;
    shownBossBar = state;
    bar.classList.toggle('hidden', !boss);
    if (!boss) return;
    const level = bossLevels[boss.id];
    document.getElementById('boss-bar-name').textContent = level ? `보스 Lv.${level}` : '보스';
    document.getElementById('boss-bar-fill').style.width = `${Math.max(0, boss.hpPct)}%`;
}

function drawAnnouncements() {
    announcements.forEach((item, i) => {
        const age = item.maxLife - item.life;
        const pop = age < 0.2 ? 1.6 - (age / 0.2) * 0.6 : 1;
        ctx.save();
        // Below the player, clear of the top HUD (minimap, boss bar).
        ctx.translate(canvas.width / 2, canvas.height * 0.64 + i * 46);
        ctx.scale(pop, pop);
        ctx.globalAlpha = Math.min(1, item.life / 0.4);
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillStyle = item.color;
        ctx.strokeText(item.text, 0, 0);
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
    });
}
