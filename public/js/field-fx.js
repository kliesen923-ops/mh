// Ground objects (traps, burning patches, heal zones, blink marks), staff orbs, thrown
// potions and their one-off flashes. Everything here is drawn in world space, from timestamps.
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
    ctx.strokeStyle = armed ? '#c8ccd4' : 'rgba(200, 204, 212, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(40, 44, 52, 0.75)';
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    // Teeth around the jaw.
    ctx.fillStyle = armed ? '#e6e9ef' : '#8a8f99';
    for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
        ctx.lineTo(Math.cos(a + 0.16) * 9, Math.sin(a + 0.16) * 9);
        ctx.lineTo(Math.cos(a + 0.32) * 17, Math.sin(a + 0.32) * 17);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = mine ? '#e67e22' : '#e74c3c';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
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
    ctx.rotate(now / 400);
    ctx.strokeStyle = '#9b8cff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 190, 255, 0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
        ctx.stroke();
    }
    ctx.restore();
    if (mine) {
        const remain = Math.max(0, (fieldTime(mark.expiresAt) - now) / 1000);
        drawUpright(mark.x, mark.y, () => {
            ctx.save();
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillStyle = '#d8d2ff';
            ctx.strokeText(`${remain.toFixed(1)}초`, mark.x, mark.y - 38);
            ctx.fillText(`${remain.toFixed(1)}초`, mark.x, mark.y - 38);
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

// Above the characters: flying orbs and potions, bursts and flashes.
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

    potionFlights = potionFlights.filter((flight) => now - flight.bornAt < flight.flightMs + 250);
    potionFlights.forEach((flight) => {
        const t = Math.min(1, (now - flight.bornAt) / Math.max(1, flight.flightMs));
        if (t >= 1) {
            // Splash where it lands.
            const p = (now - flight.bornAt - flight.flightMs) / 250;
            ctx.save();
            ctx.globalAlpha = 1 - p;
            ctx.strokeStyle = 'rgba(140, 255, 190, 0.95)';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(flight.x, flight.y, 20 + p * 50, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            return;
        }
        const x = flight.startX + (flight.x - flight.startX) * t;
        const y = flight.startY + (flight.y - flight.startY) * t;
        // Arcs up through the air (screen-up is -y in world units after the squash).
        const lift = Math.sin(t * Math.PI) * 70 / VIEW_Y_SCALE;
        drawUpright(x, y - lift, () => {
            ctx.save();
            ctx.translate(x, y - lift);
            ctx.rotate(t * 8);
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#d7f5e3';
            ctx.fillRect(-3, -10, 6, 6);
            ctx.fillStyle = '#8e5a2b';
            ctx.fillRect(-3.5, -12, 7, 3);
            ctx.restore();
        });
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
