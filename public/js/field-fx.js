// Ground objects (traps, burning patches, heal zones, blink marks), staff orbs and their
// one-off flashes. Everything here is drawn in world space, from timestamps.
const STAFF_ORB_COLOR = '255, 122, 217';

function fieldTime(serverTime) {
    return serverTime + (fieldState.clockOffset || 0);
}

function drawTrap(trap, now) {
    const mine = trap.ownerId === myId;
    const armed = now >= fieldTime(trap.armedAt);
    ctx.save();
    ctx.translate(trap.x, trap.y);
    // Enemies' traps are faint: easy to miss if you are not looking.
    ctx.globalAlpha = mine ? 0.95 : 0.35;
    drawBearTrap(mine, armed, now);
    ctx.restore();
}

function drawZone(zone, now) {
    const startAt = fieldTime(zone.startAt);
    const endsAt = fieldTime(zone.endsAt);
    if (now < startAt || now >= endsAt) return;
    const remain = Math.max(0, Math.min(1, (endsAt - now) / Math.max(1, endsAt - startAt)));
    const pulse = 1 + Math.sin(now / 120) * 0.04;
    ctx.save();
    ctx.translate(zone.x, zone.y);
    if (zone.kind === 'heal') {
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, zone.radius);
        gradient.addColorStop(0, 'rgba(120, 255, 170, 0.35)');
        gradient.addColorStop(1, 'rgba(46, 204, 113, 0.12)');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(0, 0, zone.radius * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(140, 255, 190, 0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -now / 40;
        ctx.beginPath(); ctx.arc(0, 0, zone.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Rising crosses.
        ctx.fillStyle = 'rgba(200, 255, 220, 0.85)';
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI * 2 * i) / 4 + now / 900;
            const rise = ((now / 14 + i * 40) % 60);
            const cx = Math.cos(a) * zone.radius * 0.5;
            const cy = Math.sin(a) * zone.radius * 0.5 - rise;
            ctx.fillRect(cx - 5, cy - 1.5, 10, 3);
            ctx.fillRect(cx - 1.5, cy - 5, 3, 10);
        }
        drawUltimateTimer(zone.radius + 6, remain, '#7dffb0');
        ctx.restore();
        drawUpright(zone.x, zone.y, () => drawHealFlask(zone.x, zone.y, now, remain));
        return;
    } else {
        ctx.fillStyle = `rgba(255, 90, 60, ${0.18 + 0.08 * Math.sin(now / 70)})`;
        ctx.beginPath(); ctx.arc(0, 0, zone.radius * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 170, 80, 0.7)';
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6 + i;
            const r = zone.radius * (0.25 + ((i * 37) % 10) / 16);
            const flicker = 4 + Math.sin(now / 60 + i) * 2;
            ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, flicker, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

function drawBlinkMark(mark, now) {
    const mine = mark.ownerId === myId;
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.globalAlpha = mine ? 0.95 : 0.45;
    drawBlinkRune(now);
    ctx.restore();
    drawUpright(mark.x, mark.y, () => {
        ctx.save();
        ctx.globalAlpha = mine ? 1 : 0.5;
        drawBlinkCrystal(mark.x, mark.y, now);
        ctx.restore();
    });
    if (mine) {
        const remain = Math.max(0, (fieldTime(mark.expiresAt) - now) / 1000);
        drawUpright(mark.x, mark.y, () => {
            ctx.save();
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillStyle = '#d8d2ff';
            ctx.strokeText(`${remain.toFixed(1)}초`, mark.x, mark.y - 58);
            ctx.fillText(`${remain.toFixed(1)}초`, mark.x, mark.y - 58);
            ctx.restore();
        });
    }
}

// Under the characters.
function drawFieldObjects() {
    const now = Date.now();
    fieldState.zones.forEach((zone) => drawZone(zone, now));
    fieldState.traps.forEach((trap) => drawTrap(trap, now));
    fieldState.marks.forEach((mark) => drawBlinkMark(mark, now));
}

function drawStaffOrb(x, y, big, now) {
    const r = big ? 13 : 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = `rgba(${STAFF_ORB_COLOR}, 0.95)`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(${STAFF_ORB_COLOR}, 0.9)`;
    ctx.beginPath(); ctx.arc(0, 0, r + Math.sin(now / 50) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 240, 255, 0.95)';
    ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// Above the characters: flying orbs, bursts and flashes.
function drawFieldEffects() {
    const now = Date.now();
    staffOrbs = staffOrbs.filter((orb) => now - orb.bornAt < orb.durationMs + 400);
    staffOrbs.forEach((orb) => {
        const t = Math.min(1, (now - orb.bornAt) / Math.max(1, orb.durationMs));
        const x = orb.startX + (orb.endX - orb.startX) * t;
        const y = orb.startY + (orb.endY - orb.startY) * t;
        // A short fading trail.
        for (let i = 1; i <= 3; i++) {
            const tt = Math.max(0, t - i * 0.05);
            ctx.fillStyle = `rgba(${STAFF_ORB_COLOR}, ${0.25 / i})`;
            ctx.beginPath();
            ctx.arc(orb.startX + (orb.endX - orb.startX) * tt, orb.startY + (orb.endY - orb.startY) * tt, (orb.big ? 11 : 7) - i, 0, Math.PI * 2);
            ctx.fill();
        }
        drawStaffOrb(x, y, orb.big, now);
    });

    staffBlasts = staffBlasts.filter((blast) => now - blast.bornAt < 380);
    staffBlasts.forEach((blast) => {
        const p = (now - blast.bornAt) / 380;
        ctx.save();
        ctx.translate(blast.x, blast.y);
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = `rgba(${STAFF_ORB_COLOR}, 0.35)`;
        ctx.beginPath(); ctx.arc(0, 0, blast.radius * (0.6 + p * 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 220, 250, 0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, blast.radius * (0.6 + p * 0.4), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });

    fieldFx = fieldFx.filter((fx) => now - fx.bornAt < fx.life);
    fieldFx.forEach((fx) => {
        const p = (now - fx.bornAt) / fx.life;
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.globalAlpha = 1 - p;
        if (fx.kind === 'trap') {
            // Jaws snapping shut.
            ctx.strokeStyle = 'rgba(230, 233, 239, 0.95)';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(0, 0, 26 - p * 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 26 - p * 10, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
        } else if (fx.kind === 'heal') {
            // The potion bursts open where it is set down.
            ctx.strokeStyle = 'rgba(140, 255, 190, 0.95)';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(0, 0, 20 + p * 70, 0, Math.PI * 2); ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(180, 165, 255, 0.95)';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, 14 + p * 30, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(155, 140, 255, 0.35)';
            ctx.beginPath(); ctx.arc(0, 0, 26 * (1 - p), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });
}
