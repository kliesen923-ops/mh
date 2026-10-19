// Weapon swing trails and hit effects, each weapon with its own look, plus the small
// particles they throw off. Drawn in world space (inside the ground squash).
const WEAPON_FX = {
    sword: { core: '235, 246, 255', glow: '120, 200, 255', finisher: '255, 214, 90' },
    dual: { core: '255, 255, 255', glow: '255, 90, 90', finisher: '255, 214, 90' },
    hammer: { core: '255, 210, 150', glow: '255, 120, 40', finisher: '255, 170, 60' },
    spear: { core: '230, 245, 255', glow: '110, 190, 255', finisher: '255, 214, 90' },
    scythe: { core: '235, 220, 255', glow: '150, 90, 255', finisher: '210, 150, 255' },
    gauntlet: { core: '255, 240, 210', glow: '255, 160, 60', finisher: '255, 214, 90' },
    bow: { core: '255, 240, 200', glow: '255, 200, 110', finisher: '255, 214, 90' },
    staff: { core: '255, 230, 250', glow: '255, 122, 217', finisher: '255, 122, 217' },
};
// How long each weapon's swing trail lingers (s).
const TRAIL_LIFE = { sword: 0.26, dual: 0.18, hammer: 0.34, spear: 0.22, scythe: 0.36, gauntlet: 0.2 };
// How long each weapon's hit effect lingers (s).
const HIT_LIFE = { sword: 0.3, dual: 0.26, hammer: 0.42, spear: 0.3, scythe: 0.38, gauntlet: 0.32, bow: 0.28 };

let swingTrails = [];
let hitParticles = [];
const lastAttackPhase = new Map();

function fxColor(weapon, comboStep) {
    const fx = WEAPON_FX[weapon] || WEAPON_FX.sword;
    return comboStep === 3 ? { core: '255, 250, 225', glow: fx.finisher } : fx;
}

// Starts a trail when a player's swing reaches its strike (attack phase 2).
function noteAttackPhase(p, weapon, range) {
    const phase = p.isAttacking ? p.attackPhase : 0;
    const previous = lastAttackPhase.get(p.id);
    lastAttackPhase.set(p.id, phase);
    if (phase !== 2 || previous === 2 || !TRAIL_LIFE[weapon]) return;
    swingTrails.push({
        playerId: p.id,
        weapon,
        comboStep: p.comboStep || 1,
        angle: Number.isFinite(p.aAngle) && p.aAngle ? p.aAngle : (p.angle || 0),
        range,
        bornAt: performance.now(),
        life: TRAIL_LIFE[weapon] * 1000,
        ult: weapon === 'dual' && getUltimateState(p).active,
    });
}

// Sweep start/end angles for an arc swing: alternating sides, a full spin on the finisher.
function getSweep(angle, comboStep, width) {
    if (comboStep === 3) return [angle - Math.PI, angle + Math.PI];
    const half = width / 2;
    return comboStep === 2 ? [angle + half, angle - half] : [angle - half, angle + half];
}

// A crescent from a0 to a1 (radius r, thickest in the middle), drawn up to `reach` of the way.
function crescentPath(r, thickness, a0, a1, reach) {
    const steps = 24;
    const end = a0 + (a1 - a0) * reach;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
        const a = a0 + (end - a0) * (i / steps);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let i = steps; i >= 0; i--) {
        const u = i / steps;
        const a = a0 + (end - a0) * u;
        // Thick near the leading edge, thin at the tail.
        const inner = r - thickness * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1));
        ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    }
    ctx.closePath();
}

function drawArcTrail(trail, p, options) {
    const { r, thickness, width, color, glowBlur, edge } = options;
    const [a0, a1] = getSweep(trail.angle, trail.comboStep, width);
    const reach = Math.min(1, p * 2.6);
    const fade = p < 0.35 ? 1 : 1 - (p - 0.35) / 0.65;
    ctx.globalAlpha = fade;
    const gradient = ctx.createRadialGradient(0, 0, Math.max(1, r - thickness), 0, 0, r);
    gradient.addColorStop(0, `rgba(${color.glow}, 0)`);
    gradient.addColorStop(0.7, `rgba(${color.glow}, 0.45)`);
    gradient.addColorStop(1, `rgba(${color.core}, 0.95)`);
    ctx.fillStyle = gradient;
    ctx.shadowColor = `rgba(${color.glow}, 0.9)`;
    ctx.shadowBlur = glowBlur;
    crescentPath(r, thickness, a0, a1, reach);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (edge) {
        // A crisp bright rim along the blade's path.
        const end = a0 + (a1 - a0) * reach;
        const start = a0 + (end - a0) * 0.35;
        ctx.strokeStyle = `rgba(${color.core}, ${0.9 * fade})`;
        ctx.lineWidth = edge;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.min(start, end), Math.max(start, end));
        ctx.stroke();
    }
}

function drawSwingTrail(trail, p) {
    const color = fxColor(trail.weapon, trail.comboStep);
    const r = trail.range;
    if (trail.weapon === 'sword') {
        drawArcTrail(trail, p, { r, thickness: r * 0.42, width: 2.5, color, glowBlur: 16, edge: 2.5 });
    } else if (trail.weapon === 'dual') {
        // Two quick thin blades crossing.
        const c = trail.ult ? { core: '255, 220, 220', glow: '255, 40, 40' } : color;
        drawArcTrail(trail, p, { r, thickness: r * 0.32, width: 2.4, color: c, glowBlur: 14, edge: 2 });
        ctx.save();
        ctx.rotate(trail.comboStep === 2 ? -0.5 : 0.5);
        drawArcTrail({ ...trail, comboStep: trail.comboStep === 3 ? 3 : 3 - trail.comboStep }, p, { r: r * 0.9, thickness: r * 0.26, width: 2.2, color: c, glowBlur: 12, edge: 1.6 });
        ctx.restore();
    } else if (trail.weapon === 'hammer') {
        drawArcTrail(trail, p, { r, thickness: r * 0.55, width: 2.2, color, glowBlur: 20, edge: 0 });
        if (trail.comboStep === 3) {
            // Ground-shaking shockwave and cracks.
            const ring = r * (0.5 + p * 0.7);
            ctx.globalAlpha = 1 - p;
            ctx.strokeStyle = `rgba(${color.glow}, 0.9)`;
            ctx.lineWidth = 8 * (1 - p) + 2;
            ctx.beginPath(); ctx.arc(0, 0, ring, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(${color.glow}, ${0.18 * (1 - p)})`;
            ctx.beginPath(); ctx.arc(0, 0, ring, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(70, 40, 20, ${0.8 * (1 - p)})`;
            ctx.lineWidth = 2.5;
            for (let i = 0; i < 10; i++) {
                const a = (Math.PI * 2 * i) / 10 + trail.angle;
                const len = r * (0.55 + ((i * 37) % 10) / 22);
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
                ctx.lineTo(Math.cos(a + 0.1) * len * 0.6, Math.sin(a + 0.1) * len * 0.6);
                ctx.lineTo(Math.cos(a - 0.05) * len, Math.sin(a - 0.05) * len);
                ctx.stroke();
            }
        }
    } else if (trail.weapon === 'scythe') {
        // A wide reaping crescent with a dark wisp trailing it.
        drawArcTrail(trail, p, { r: r * 1.04, thickness: r * 0.5, width: 2.8, color, glowBlur: 22, edge: 3 });
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        drawArcTrail(trail, Math.min(1, p + 0.12), { r: r * 0.78, thickness: r * 0.3, width: 2.8, color: { core: '90, 50, 140', glow: '40, 10, 70' }, glowBlur: 0, edge: 0 });
        ctx.restore();
    } else if (trail.weapon === 'spear') {
        // A tapered thrust with speed streaks.
        const finisher = trail.comboStep === 3;
        const reach = Math.min(1, p * 3);
        const fade = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
        const half = (finisher ? 26 : 18);
        ctx.rotate(trail.angle);
        ctx.globalAlpha = fade;
        const gradient = ctx.createLinearGradient(0, 0, r, 0);
        gradient.addColorStop(0, `rgba(${color.glow}, 0)`);
        gradient.addColorStop(0.5, `rgba(${color.glow}, 0.6)`);
        gradient.addColorStop(1, `rgba(${color.core}, 1)`);
        ctx.fillStyle = gradient;
        ctx.shadowColor = `rgba(${color.glow}, 1)`;
        ctx.shadowBlur = 20;
        // A long spike: wide behind the point, sharp at the tip.
        ctx.beginPath();
        ctx.moveTo(r * 0.1, -half * 0.25);
        ctx.quadraticCurveTo(r * 0.6 * reach, -half * 0.5, r * reach * 1.04, 0);
        ctx.quadraticCurveTo(r * 0.6 * reach, half * 0.5, r * 0.1, half * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(r * 0.3, 0); ctx.lineTo(r * reach, 0); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(${color.core}, ${0.7 * fade})`;
        ctx.lineWidth = 1.4;
        for (const offset of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(r * 0.25, offset * half * 1.3);
            ctx.lineTo(r * 0.8 * reach, offset * half * 0.9);
            ctx.stroke();
        }
        // A small flare at the point.
        ctx.fillStyle = `rgba(${color.core}, ${fade})`;
        ctx.beginPath(); ctx.arc(r * reach, 0, finisher ? 6 : 4, 0, Math.PI * 2); ctx.fill();
    } else if (trail.weapon === 'gauntlet') {
        // Speed lines into the fist and a burst where it lands.
        const fade = 1 - p;
        ctx.rotate(trail.angle);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = `rgba(${color.core}, 0.85)`;
        ctx.lineWidth = 2;
        for (const offset of [-12, -4, 4, 12]) {
            ctx.beginPath();
            ctx.moveTo(r * 0.1, offset);
            ctx.lineTo(r * (0.55 + p * 0.3), offset * 0.4);
            ctx.stroke();
        }
        const burst = (trail.comboStep === 3 ? 26 : 16) * (0.6 + p * 0.8);
        ctx.fillStyle = `rgba(${color.glow}, ${0.55 * fade})`;
        ctx.shadowColor = `rgba(${color.glow}, 0.9)`;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 * i) / 12;
            const rr = i % 2 ? burst * 0.45 : burst;
            ctx.lineTo(r + Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(${color.core}, ${fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r, 0, burst * 1.3, 0, Math.PI * 2); ctx.stroke();
    }
}

function drawSwingTrails() {
    const now = performance.now();
    swingTrails = swingTrails.filter((trail) => now - trail.bornAt < trail.life);
    swingTrails.forEach((trail) => {
        // Trails follow their swinger.
        const owner = trail.playerId === myId ? player : allPlayers[trail.playerId];
        if (!owner) return;
        const p = Math.min(1, (now - trail.bornAt) / trail.life);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(owner.x, owner.y);
        drawSwingTrail(trail, p);
        ctx.restore();
    });
}

// ── Hits ────────────────────────────────────────────────────────────────────────

function addParticle(x, y, angle, speed, life, size, color, kind) {
    hitParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, bornAt: performance.now(), life: life * 1000, size, color, kind });
}

// Particles thrown off by a weapon hit (called when the hit effect arrives).
function spawnHitParticles(effect) {
    const weapon = effect.weapon;
    if (!HIT_LIFE[weapon]) return;
    const { x, y, angle } = effect;
    const color = WEAPON_FX[weapon];
    const spray = (count, spread, speedMin, speedMax, life, size, c, kind) => {
        for (let i = 0; i < count; i++) {
            addParticle(x, y, angle + (Math.random() - 0.5) * spread, speedMin + Math.random() * (speedMax - speedMin), life, size, c, kind);
        }
    };
    // A soft flash on every hit, and a little shake when it happens close to you.
    emitParticles('glow', x, y, { color: color.glow, size: weapon === 'hammer' ? 60 : 36, life: 0.2 });
    if (isNearMe(x, y, 260)) shakeScreen(weapon === 'hammer' ? 4 : 2, weapon === 'hammer' ? 160 : 90);
    if (weapon === 'hammer') {
        spray(9, Math.PI * 2, 80, 220, 0.5, 4, '120, 80, 50', 'chunk');
        spray(6, Math.PI * 2, 30, 70, 0.6, 14, '180, 150, 120', 'mist');
    } else if (weapon === 'scythe') {
        spray(8, 1.6, 120, 260, 0.35, 2, color.core, 'spark');
        spray(5, Math.PI * 2, 20, 60, 0.6, 12, '60, 20, 100', 'mist');
    } else if (weapon === 'spear') {
        spray(10, 0.6, 220, 420, 0.3, 2, color.core, 'spark');
    } else if (weapon === 'gauntlet') {
        spray(10, Math.PI * 2, 120, 280, 0.3, 2.4, color.glow, 'spark');
    } else if (weapon === 'bow') {
        spray(5, 1.2, 60, 160, 0.3, 2, color.core, 'spark');
    } else if (weapon === 'dual') {
        spray(10, Math.PI * 2, 120, 300, 0.25, 1.8, color.glow, 'spark');
    } else {
        spray(8, 1.8, 140, 320, 0.28, 2, color.core, 'spark');
    }
}

function drawHitParticles() {
    const now = performance.now();
    hitParticles = hitParticles.filter((part) => now - part.bornAt < part.life);
    hitParticles.forEach((part) => {
        const t = (now - part.bornAt) / 1000;
        const p = (now - part.bornAt) / part.life;
        // Slows down as it flies.
        const drift = t * (1 - p * 0.5);
        const x = part.x + part.vx * drift;
        const y = part.y + part.vy * drift;
        if (p < 0) return;
        ctx.save();
        if (part.kind === 'glow' || part.kind === 'ember' || part.kind === 'ring' || part.kind === 'shard') {
            ctx.globalCompositeOperation = 'lighter';
            drawGlowParticle(part, part.kind === 'ring' ? part.x : x, part.kind === 'ring' ? part.y : y, p);
            ctx.restore();
            return;
        }
        ctx.globalAlpha = 1 - p;
        if (part.kind === 'spark') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(${part.color}, 1)`;
            ctx.lineWidth = part.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - part.vx * 0.04, y - part.vy * 0.04);
            ctx.stroke();
        } else if (part.kind === 'chunk') {
            ctx.translate(x, y);
            ctx.rotate(t * 10);
            ctx.fillStyle = `rgba(${part.color}, 1)`;
            ctx.fillRect(-part.size / 2, -part.size / 2, part.size, part.size);
        } else {
            ctx.fillStyle = `rgba(${part.color}, 0.35)`;
            ctx.beginPath(); ctx.arc(x, y, part.size * (0.6 + p), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });
}

// A long thin lens (a slash mark) centered on the origin along +x.
function lensPath(length, width) {
    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.quadraticCurveTo(0, -width, length / 2, 0);
    ctx.quadraticCurveTo(0, width * 0.35, -length / 2, 0);
    ctx.closePath();
}

// Draws the hit mark for a weapon at the origin. t runs from 1 (new) to 0.
function drawWeaponHit(effect, t) {
    const weapon = WEAPON_FX[effect.weapon] ? effect.weapon : 'sword';
    const color = WEAPON_FX[weapon];
    const grow = 1 - t;
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = `rgba(${color.glow}, 0.9)`;
    ctx.shadowBlur = 14;
    if (weapon === 'sword') {
        ctx.rotate(effect.angle + Math.PI / 2.6);
        ctx.fillStyle = `rgba(${color.core}, 0.95)`;
        lensPath(58 + grow * 26, 7 * t + 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${color.glow}, 0.5)`;
        lensPath(70 + grow * 30, 12 * t + 3);
        ctx.fill();
    } else if (weapon === 'dual') {
        for (const turn of [0.75, -0.75]) {
            ctx.save();
            ctx.rotate(effect.angle + turn);
            ctx.fillStyle = turn > 0 ? `rgba(${color.core}, 0.95)` : `rgba(${color.glow}, 0.9)`;
            lensPath(46 + grow * 20, 5 * t + 1.5);
            ctx.fill();
            ctx.restore();
        }
    } else if (weapon === 'hammer') {
        // Crater ring and a heavy flash.
        ctx.fillStyle = `rgba(${color.core}, ${0.7 * t})`;
        ctx.beginPath(); ctx.arc(0, 0, 14 + grow * 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${color.glow}, 0.95)`;
        ctx.lineWidth = 6 * t + 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 18 + grow * 42, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 240, 200, ${0.6 * t})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10 + grow * 26, 0, Math.PI * 2); ctx.stroke();
    } else if (weapon === 'spear') {
        // A streak straight through the target and a flare where it comes out.
        ctx.rotate(effect.angle);
        const gradient = ctx.createLinearGradient(-40, 0, 46 + grow * 20, 0);
        gradient.addColorStop(0, `rgba(${color.glow}, 0)`);
        gradient.addColorStop(1, `rgba(${color.core}, 1)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-40, -3 * t - 1);
        ctx.lineTo(46 + grow * 20, 0);
        ctx.lineTo(-40, 3 * t + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(${color.core}, ${t})`;
        ctx.beginPath(); ctx.arc(30 + grow * 16, 0, 5 + grow * 6, 0, Math.PI * 2); ctx.fill();
    } else if (weapon === 'scythe') {
        // A curved reaping cut.
        ctx.rotate(effect.angle - Math.PI / 2);
        ctx.strokeStyle = `rgba(${color.core}, 0.95)`;
        ctx.lineWidth = 6 * t + 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(-18, 0, 34 + grow * 8, -0.9, 0.9); ctx.stroke();
        ctx.strokeStyle = `rgba(${color.glow}, 0.7)`;
        ctx.lineWidth = 12 * t + 2;
        ctx.beginPath(); ctx.arc(-18, 0, 30 + grow * 8, -0.7, 0.7); ctx.stroke();
    } else if (weapon === 'gauntlet') {
        // A punch star and rings.
        const burst = 16 + grow * 18;
        ctx.fillStyle = `rgba(${color.glow}, ${0.8 * t + 0.1})`;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
            const a = effect.angle + (Math.PI * 2 * i) / 16;
            const r = i % 2 ? burst * 0.42 : burst;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${color.core}, ${t})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, burst * 1.4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, burst * 2, 0, Math.PI * 2); ctx.stroke();
    } else if (weapon === 'bow') {
        // The arrow's point bites in.
        ctx.rotate(effect.angle);
        ctx.fillStyle = `rgba(${color.core}, ${t})`;
        ctx.beginPath(); ctx.arc(0, 0, 6 + grow * 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${color.glow}, ${t})`;
        ctx.lineWidth = 2;
        for (const a of [-0.6, 0, 0.6]) {
            ctx.beginPath();
            ctx.moveTo(Math.cos(a + Math.PI) * 6, Math.sin(a + Math.PI) * 6);
            ctx.lineTo(Math.cos(a + Math.PI) * (16 + grow * 14), Math.sin(a + Math.PI) * (16 + grow * 14));
            ctx.stroke();
        }
    }
    ctx.shadowBlur = 0;
}

// ── Extra juice: glow particles, shockwave rings, ultimate cast flashes, shake ────

// Adds a few particles of a kind around (x, y). kind: glow (soft light), ember (rises and
// flickers), shard (spinning chip), ring (expanding shockwave).
function emitParticles(kind, x, y, options = {}) {
    const count = options.count || 1;
    for (let i = 0; i < count; i++) {
        const angle = Number.isFinite(options.angle) ? options.angle + (Math.random() - 0.5) * (options.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
        const speed = (options.speedMin ?? 0) + Math.random() * ((options.speedMax ?? 0) - (options.speedMin ?? 0));
        hitParticles.push({
            x: x + (Math.random() - 0.5) * (options.jitter || 0),
            y: y + (Math.random() - 0.5) * (options.jitter || 0),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            bornAt: performance.now() + (options.delay || 0) * Math.random(),
            life: (options.life || 0.5) * 1000,
            size: options.size || 4,
            color: options.color || '255, 255, 255',
            kind,
        });
    }
}

// Screen shake that never weakens one already running.
function shakeScreen(strength, ms) {
    const now = Date.now();
    if (now < screenShake.until && screenShake.strength > strength) return;
    screenShake.strength = strength;
    screenShake.until = now + ms;
}

function isNearMe(x, y, distance) {
    return Math.hypot(x - player.x, y - player.y) < distance;
}

// Glowing kinds are drawn additively so overlapping light gets brighter.
function drawGlowParticle(part, x, y, p) {
    if (part.kind === 'glow') {
        const r = part.size * (0.6 + p * 0.8);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${part.color}, ${0.9 * (1 - p)})`);
        g.addColorStop(1, `rgba(${part.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'ember') {
        const flicker = 0.6 + Math.sin(performance.now() / 40 + part.bornAt) * 0.4;
        ctx.fillStyle = `rgba(${part.color}, ${(1 - p) * flicker})`;
        ctx.beginPath(); ctx.arc(x, y - p * 60, part.size * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
    } else if (part.kind === 'ring') {
        ctx.strokeStyle = `rgba(${part.color}, ${1 - p})`;
        ctx.lineWidth = Math.max(1, part.size * (1 - p));
        ctx.beginPath(); ctx.arc(x, y, 10 + p * (part.vx || 120), 0, Math.PI * 2); ctx.stroke();
    } else if (part.kind === 'shard') {
        ctx.translate(x, y);
        ctx.rotate(p * 12 + part.bornAt);
        ctx.fillStyle = `rgba(${part.color}, ${1 - p})`;
        ctx.beginPath(); ctx.moveTo(0, -part.size); ctx.lineTo(part.size * 0.6, part.size * 0.7); ctx.lineTo(-part.size * 0.6, part.size * 0.5); ctx.closePath(); ctx.fill();
    }
}

const ULT_FX_COLORS = {
    sword: '255, 225, 140', hammer: '255, 140, 60', spear: '140, 215, 255', bow: '90, 220, 255',
    dual: '255, 70, 70', scythe: '180, 130, 255', gauntlet: '255, 180, 90', staff: '255, 122, 217',
};

// The moment an ultimate goes off: a pillar of light, shockwave rings and rising embers.
function spawnUltimateCastFx(type, x, y) {
    const color = ULT_FX_COLORS[type] || '255, 255, 255';
    castPillars.push({ x, y, color, bornAt: performance.now(), life: 700 });
    emitParticles('ring', x, y, { color, size: 10, life: 0.6 });
    hitParticles[hitParticles.length - 1].vx = 220;
    emitParticles('ring', x, y, { color: '255, 255, 255', size: 4, life: 0.45 });
    hitParticles[hitParticles.length - 1].vx = 150;
    emitParticles('ember', x, y, { color, count: 22, jitter: 70, size: 3, life: 0.9 });
    emitParticles('glow', x, y, { color, size: 120, life: 0.4 });
    if (isNearMe(x, y, 700)) shakeScreen(4, 220);
}

let castPillars = [];
function drawCastPillars() {
    const now = performance.now();
    castPillars = castPillars.filter((pillar) => now - pillar.bornAt < pillar.life);
    castPillars.forEach((pillar) => {
        const p = (now - pillar.bornAt) / pillar.life;
        const width = 46 * (1 - p * 0.6);
        const height = 260 / VIEW_Y_SCALE;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(pillar.x, pillar.y, pillar.x, pillar.y - height);
        g.addColorStop(0, `rgba(${pillar.color}, ${0.75 * (1 - p)})`);
        g.addColorStop(1, `rgba(${pillar.color}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(pillar.x - width / 2, pillar.y - height, width, height);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - p)})`;
        ctx.fillRect(pillar.x - width / 8, pillar.y - height * 0.9, width / 4, height * 0.9);
        ctx.restore();
    });
}

// Particles and shake for the hit marks of ultimates.
function spawnUltimateHitFx(effect) {
    const { x, y, angle, weapon } = effect;
    const near = isNearMe(x, y, 500);
    if (weapon === 'ult-sword') {
        emitParticles('spark', x, y, { angle, spread: 1.2, count: 8, speedMin: 200, speedMax: 420, life: 0.3, size: 2, color: '255, 245, 210' });
        emitParticles('glow', x, y, { color: '255, 225, 140', size: 40, life: 0.25 });
    } else if (weapon === 'ult-hammer') {
        emitParticles('chunk', x, y, { count: 12, speedMin: 120, speedMax: 320, life: 0.6, size: 5, color: '120, 80, 50' });
        emitParticles('glow', x, y, { color: '255, 140, 60', size: 70, life: 0.35 });
        if (near) shakeScreen(7, 260);
    } else if (weapon === 'spear-ult') {
        emitParticles('shard', x, y, { count: 8, speedMin: 100, speedMax: 240, life: 0.5, size: 6, color: '190, 235, 255' });
        emitParticles('glow', x, y, { color: '140, 215, 255', size: 50, life: 0.3 });
    } else if (weapon === 'ult-dual') {
        emitParticles('spark', x, y, { count: 10, speedMin: 160, speedMax: 360, life: 0.25, size: 2, color: '255, 90, 90' });
    } else if (weapon === 'dragon') {
        emitParticles('glow', x, y, { color: '90, 220, 255', size: 70, life: 0.35 });
        emitParticles('shard', x, y, { angle, spread: 1.6, count: 10, speedMin: 150, speedMax: 320, life: 0.5, size: 5, color: '200, 245, 255' });
        if (near) shakeScreen(5, 200);
    } else if (weapon === 'ult-scythe') {
        emitParticles('mist', x, y, { count: 4, speedMin: 10, speedMax: 50, life: 0.7, size: 16, color: '70, 20, 120' });
        emitParticles('ember', x, y, { count: 8, jitter: 40, size: 3, life: 0.7, color: '200, 160, 255' });
    } else if (weapon === 'execute') {
        emitParticles('mist', x, y, { count: 6, speedMin: 20, speedMax: 70, life: 1.0, size: 22, color: '60, 10, 100' });
        emitParticles('glow', x, y, { color: '190, 140, 255', size: 90, life: 0.4 });
        emitParticles('ember', x, y, { count: 14, jitter: 30, size: 3, life: 1.0, color: '230, 210, 255' });
        if (near) shakeScreen(6, 220);
    } else if (weapon === 'ult-gauntlet') {
        emitParticles('spark', x, y, { angle, spread: 1.4, count: 8, speedMin: 200, speedMax: 400, life: 0.25, size: 2.4, color: '255, 200, 120' });
        if (near) shakeScreen(3, 120);
    } else if (weapon === 'meteor') {
        emitParticles('chunk', x, y, { count: 22, speedMin: 150, speedMax: 420, life: 0.8, size: 6, color: '90, 50, 35' });
        emitParticles('ember', x, y, { count: 30, jitter: 140, size: 4, life: 1.2, color: '255, 150, 60' });
        emitParticles('glow', x, y, { color: '255, 150, 60', size: 220, life: 0.5 });
        emitParticles('mist', x, y, { count: 8, speedMin: 40, speedMax: 120, life: 1.2, size: 30, color: '80, 60, 50' });
    }
}
