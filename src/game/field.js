// Things that live on the ground for a while: staff orbs and their burning patches, traps,
// heal-potion zones and blink marks. tickField() moves and resolves them.
const state = require('./state');
const { GAME_WIDTH, GAME_HEIGHT, WORLD_MARGIN, STAFF_ORB, TRAP, BLINK_MARK_MS, HEAL_POTION } = require('../config');
const { distToSegment, createProjectileId } = require('../utils/geometry');
const { getAttackMultiplier, getMaxHpFromStats } = require('./stats');
const { damagePlayerFrom, stunPlayer } = require('./combat');
const { getMobList, hitMobs } = require('./mobs');
const { markStatsDirty } = require('./sync');

const { players } = state;
let orbs = [];
let zones = [];
let traps = [];
const marks = new Map();

function clampX(x) {
    return Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, x));
}

function clampY(y) {
    return Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, y));
}

function canBeHit(p) {
    return Boolean(p && p.hp > 0 && !p.upgradeShield && !p.isSelectingLoadout);
}

function damageScaleOf(p) {
    return (p && p.stats && Number.isFinite(p.stats.dmg) ? p.stats.dmg : 1) * getAttackMultiplier(p);
}

function getFieldState() {
    return {
        serverNow: Date.now(),
        traps: traps.map(({ id, ownerId, x, y, armedAt }) => ({ id, ownerId, x, y, armedAt })),
        zones: zones.map(({ id, kind, ownerId, x, y, radius, startAt, endsAt }) => ({ id, kind, ownerId, x, y, radius, startAt, endsAt })),
        marks: [...marks.entries()].map(([ownerId, mark]) => ({ ownerId, x: mark.x, y: mark.y, expiresAt: mark.expiresAt })),
    };
}

function emitFieldState() {
    state.io.emit('fieldState', getFieldState());
}

// ── Staff ───────────────────────────────────────────────────────────────────────

function castStaffOrb(ownerId, angle, options = {}) {
    const owner = players[ownerId];
    if (!owner) return null;
    const range = Number.isFinite(options.range) ? options.range : 380;
    const endX = clampX(owner.x + Math.cos(angle) * range);
    const endY = clampY(owner.y + Math.sin(angle) * range);
    const durationMs = Math.max(120, Math.round((Math.hypot(endX - owner.x, endY - owner.y) / STAFF_ORB.speed) * 1000));
    const now = Date.now();
    const orb = {
        id: createProjectileId('orb'),
        ownerId,
        startX: owner.x,
        startY: owner.y,
        endX,
        endY,
        x: owner.x,
        y: owner.y,
        startAt: now,
        durationMs,
        big: Boolean(options.big),
    };
    orbs.push(orb);
    state.io.emit('staffOrb', {
        id: orb.id,
        originId: ownerId,
        startX: orb.startX,
        startY: orb.startY,
        endX,
        endY,
        durationMs,
        big: orb.big,
    });
    return orb;
}

function findOrbHit(orb, fromX, fromY, toX, toY) {
    for (const [id, p] of Object.entries(players)) {
        if (id === orb.ownerId || !canBeHit(p)) continue;
        if (distToSegment({ x: fromX, y: fromY }, { x: toX, y: toY }, p) <= STAFF_ORB.hitRadius) return true;
    }
    return getMobList().some((mob) => distToSegment({ x: fromX, y: fromY }, { x: toX, y: toY }, mob) <= STAFF_ORB.hitRadius + mob.radius);
}

function burstOrb(orb, now) {
    const owner = players[orb.ownerId];
    const radius = STAFF_ORB.blastRadius * (orb.big ? STAFF_ORB.finisherBlastScale : 1);
    state.io.emit('staffBlast', { id: orb.id, x: orb.x, y: orb.y, radius });
    if (!owner) return;
    const damage = (orb.big ? STAFF_ORB.finisherDamage : STAFF_ORB.damage) * damageScaleOf(owner);
    for (const [id, p] of Object.entries(players)) {
        if (id === orb.ownerId || !canBeHit(p)) continue;
        if (Math.hypot(p.x - orb.x, p.y - orb.y) > radius) continue;
        damagePlayerFrom(orb.ownerId, id, damage, orb.x, orb.y, 'staff');
    }
    hitMobs(orb.ownerId, (mob) => Math.hypot(mob.x - orb.x, mob.y - orb.y) <= radius + mob.radius, Math.floor(damage), 0, null);
    zones.push({
        id: createProjectileId('burn'),
        kind: 'burn',
        ownerId: orb.ownerId,
        x: orb.x,
        y: orb.y,
        radius: STAFF_ORB.patchRadius * (orb.big ? STAFF_ORB.finisherBlastScale : 1),
        startAt: now,
        endsAt: now + STAFF_ORB.patchMs,
        nextTickAt: now + STAFF_ORB.patchTickMs,
    });
    markStatsDirty();
}

function updateOrbs(now) {
    let changed = false;
    orbs = orbs.filter((orb) => {
        const progress = Math.min(1, (now - orb.startAt) / orb.durationMs);
        const nextX = orb.startX + (orb.endX - orb.startX) * progress;
        const nextY = orb.startY + (orb.endY - orb.startY) * progress;
        const hit = findOrbHit(orb, orb.x, orb.y, nextX, nextY);
        orb.x = nextX;
        orb.y = nextY;
        if (!hit && progress < 1) return true;
        burstOrb(orb, now);
        changed = true;
        return false;
    });
    return changed;
}

// ── Zones (staff burn patches, heal potions) ────────────────────────────────────

function throwHealPotion(ownerId, angle) {
    const owner = players[ownerId];
    if (!owner) return null;
    const x = clampX(owner.x + Math.cos(angle) * HEAL_POTION.throwDistance);
    const y = clampY(owner.y + Math.sin(angle) * HEAL_POTION.throwDistance);
    const now = Date.now();
    const startAt = now + HEAL_POTION.flightMs;
    state.io.emit('potionThrown', { originId: ownerId, startX: owner.x, startY: owner.y, x, y, flightMs: HEAL_POTION.flightMs });
    const zone = {
        id: createProjectileId('heal'),
        kind: 'heal',
        ownerId,
        x,
        y,
        radius: HEAL_POTION.radius,
        startAt,
        endsAt: startAt + HEAL_POTION.durationMs,
        nextTickAt: startAt,
    };
    zones.push(zone);
    emitFieldState();
    return zone;
}

function tickZone(zone, now) {
    if (zone.kind === 'heal') {
        // Heals everyone standing in it, enemies included.
        for (const [id, p] of Object.entries(players)) {
            if (p.hp <= 0 || p.isSelectingLoadout) continue;
            if (Math.hypot(p.x - zone.x, p.y - zone.y) > zone.radius) continue;
            const maxHp = getMaxHpFromStats(p.stats);
            const amount = Math.min(HEAL_POTION.healPerTick, Math.max(0, maxHp - p.hp));
            if (amount <= 0) continue;
            p.hp += amount;
            state.io.emit('healFloatingText', { playerId: id, amount, x: p.x, y: p.y });
            markStatsDirty();
        }
        return;
    }
    const owner = players[zone.ownerId];
    if (!owner) return;
    const damage = STAFF_ORB.patchDamage * damageScaleOf(owner);
    for (const [id, p] of Object.entries(players)) {
        if (id === zone.ownerId || !canBeHit(p)) continue;
        if (Math.hypot(p.x - zone.x, p.y - zone.y) > zone.radius) continue;
        damagePlayerFrom(zone.ownerId, id, damage, zone.x, zone.y, 'burn');
        markStatsDirty();
    }
    hitMobs(zone.ownerId, (mob) => Math.hypot(mob.x - zone.x, mob.y - zone.y) <= zone.radius + mob.radius, Math.floor(damage), 0, null);
}

function updateZones(now) {
    const before = zones.length;
    zones = zones.filter((zone) => {
        while (zone.nextTickAt <= now && zone.nextTickAt <= zone.endsAt) {
            tickZone(zone, now);
            zone.nextTickAt += zone.kind === 'heal' ? HEAL_POTION.tickMs : STAFF_ORB.patchTickMs;
        }
        return now < zone.endsAt;
    });
    return zones.length !== before;
}

// ── Traps ───────────────────────────────────────────────────────────────────────

function placeTrap(ownerId) {
    const owner = players[ownerId];
    if (!owner) return null;
    const now = Date.now();
    const trap = { id: createProjectileId('trap'), ownerId, x: owner.x, y: owner.y, armedAt: now + TRAP.armMs, expiresAt: now + TRAP.lifetimeMs };
    traps.push(trap);
    // Only the newest few traps of each owner stay on the map.
    const own = traps.filter((t) => t.ownerId === ownerId);
    if (own.length > TRAP.maxPerOwner) {
        const oldest = own[0];
        traps = traps.filter((t) => t !== oldest);
    }
    emitFieldState();
    return trap;
}

function springTrap(trap) {
    state.io.emit('trapSprung', { id: trap.id, x: trap.x, y: trap.y });
    const owner = players[trap.ownerId];
    const damage = TRAP.damage * (owner ? damageScaleOf(owner) : 1);
    for (const [id, p] of Object.entries(players)) {
        if (id === trap.ownerId || !canBeHit(p)) continue;
        if (Math.hypot(p.x - trap.x, p.y - trap.y) > TRAP.radius + 8) continue;
        damagePlayerFrom(trap.ownerId, id, damage, trap.x, trap.y, 'trap');
        stunPlayer(id, TRAP.rootMs);
    }
    if (owner) {
        hitMobs(trap.ownerId, (mob) => mob.ownerId !== trap.ownerId && Math.hypot(mob.x - trap.x, mob.y - trap.y) <= TRAP.radius + mob.radius,
            Math.floor(damage), 0, null, { stunMs: TRAP.mobStunMs });
    }
    markStatsDirty();
}

function isTrapTriggered(trap) {
    for (const [id, p] of Object.entries(players)) {
        if (id === trap.ownerId || !canBeHit(p)) continue;
        if (Math.hypot(p.x - trap.x, p.y - trap.y) <= TRAP.radius) return true;
    }
    // Your own mobs chase you over your traps all the time, so only others' mobs set them off.
    return getMobList().some((mob) => mob.ownerId !== trap.ownerId && Math.hypot(mob.x - trap.x, mob.y - trap.y) <= TRAP.radius + mob.radius * 0.5);
}

function updateTraps(now) {
    const before = traps.length;
    traps = traps.filter((trap) => {
        if (now >= trap.expiresAt || !players[trap.ownerId]) return false;
        if (now < trap.armedAt || !isTrapTriggered(trap)) return true;
        springTrap(trap);
        return false;
    });
    return traps.length !== before;
}

// ── Blink marks ─────────────────────────────────────────────────────────────────

function getBlinkMark(ownerId, now = Date.now()) {
    const mark = marks.get(ownerId);
    return mark && now < mark.expiresAt ? mark : null;
}

function placeBlinkMark(ownerId) {
    const owner = players[ownerId];
    if (!owner) return null;
    const mark = { x: owner.x, y: owner.y, expiresAt: Date.now() + BLINK_MARK_MS };
    marks.set(ownerId, mark);
    emitFieldState();
    return mark;
}

function clearBlinkMark(ownerId) {
    if (marks.delete(ownerId)) emitFieldState();
}

function updateMarks(now) {
    let changed = false;
    for (const [ownerId, mark] of marks) {
        if (now >= mark.expiresAt || !players[ownerId]) {
            marks.delete(ownerId);
            changed = true;
        }
    }
    return changed;
}

// ── Tick ────────────────────────────────────────────────────────────────────────

function tickField(now = Date.now()) {
    updateOrbs(now);
    const changed = [updateZones(now), updateTraps(now), updateMarks(now)].some(Boolean);
    if (changed) emitFieldState();
}

// Drops everything a player left on the map (on disconnect).
function clearFieldForOwner(ownerId) {
    orbs = orbs.filter((orb) => orb.ownerId !== ownerId);
    zones = zones.filter((zone) => zone.ownerId !== ownerId);
    traps = traps.filter((trap) => trap.ownerId !== ownerId);
    marks.delete(ownerId);
    emitFieldState();
}

function clearField() {
    orbs = [];
    zones = [];
    traps = [];
    marks.clear();
}

module.exports = {
    castStaffOrb,
    throwHealPotion,
    placeTrap,
    getBlinkMark,
    placeBlinkMark,
    clearBlinkMark,
    getFieldState,
    tickField,
    clearFieldForOwner,
    clearField,
};
