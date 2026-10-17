// Arrows, ash arrows and grab wires, flown and hit-checked by the server. Clients only
// say which way they aimed; tickProjectiles() moves everything and decides what it hits.
const state = require('./state');
const {
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    BOW_ARROW_DAMAGE,
    BOW_PIERCE,
    BOW_MOB_KNOCKBACK,
    WIRE_STUN_MS,
    PROJECTILES,
} = require('../config');
const { getAngleDiff, distToSegment, createProjectileId } = require('../utils/geometry');
const { getBowShotCount } = require('./stats');
const { isJustGuarding, shouldReflectFromSpearUltimate, damagePlayerFrom, stunPlayer } = require('./combat');
const { isGuardActive } = require('./defense');
const { getMobList, damageMob } = require('./mobs');
const { markStatsDirty } = require('./sync');

const { players } = state;
let projectiles = [];

function canBeHit(p) {
    return Boolean(p && p.hp > 0 && !p.upgradeShield && !p.isSelectingLoadout);
}

// End point of a straight shot, stopped at the world's edge.
function shotEnd(x, y, angle, range) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let t = range;
    if (dx > 0) t = Math.min(t, (GAME_WIDTH - WORLD_MARGIN - x) / dx);
    if (dx < 0) t = Math.min(t, (WORLD_MARGIN - x) / dx);
    if (dy > 0) t = Math.min(t, (GAME_HEIGHT - WORLD_MARGIN - y) / dy);
    if (dy < 0) t = Math.min(t, (WORLD_MARGIN - y) / dy);
    t = Math.max(1, t);
    return { x: x + dx * t, y: y + dy * t };
}

function launch(kind, ownerId, startX, startY, angle, options = {}) {
    const config = PROJECTILES[kind];
    const end = options.end || shotEnd(startX, startY, angle, config.range);
    const distance = Math.max(1, Math.hypot(end.x - startX, end.y - startY));
    const projectile = {
        id: createProjectileId(kind),
        kind,
        ownerId,
        startX,
        startY,
        endX: end.x,
        endY: end.y,
        x: startX,
        y: startY,
        angle,
        distance,
        durationMs: Math.max(60, Math.round((distance / config.speed) * 1000)),
        startAt: Date.now(),
        reflected: Boolean(options.reflected),
        pierced: new Set(),
    };
    projectiles.push(projectile);
    if (kind === 'bow') {
        state.io.emit('bowProjectile', {
            projectileId: projectile.id,
            originId: ownerId,
            startX,
            startY,
            endX: end.x,
            endY: end.y,
            angle,
            duration: projectile.durationMs,
            reflected: projectile.reflected,
        });
    } else if (projectile.reflected) {
        state.io.emit('ashProjectile', { projectileId: projectile.id, originId: ownerId, startX, startY, endX: end.x, endY: end.y, reflected: true, duration: projectile.durationMs });
    }
    return projectile;
}

// A volley in a fan, one more arrow per projectile upgrade (two more while giant).
function fireBowVolley(ownerId, angle) {
    const owner = players[ownerId];
    if (!owner) return [];
    const giantBonus = owner.giantScale > 1 ? 2 : 0;
    const shots = getBowShotCount(owner) + giantBonus;
    const spread = Math.min(0.24, Math.max(0.05, 0.05 + (shots - 1) * 0.035));
    return Array.from({ length: shots }, (_, i) => launch('bow', ownerId, owner.x, owner.y, angle + (i - (shots - 1) / 2) * spread));
}

function fireSkillShot(kind, ownerId, angle) {
    const owner = players[ownerId];
    if (!owner) return null;
    return launch(kind, ownerId, owner.x, owner.y, angle);
}

// Turns a shot back at whoever fired it, from where it was stopped.
function reflectShot(projectile, reflectorId) {
    const shooter = players[projectile.ownerId];
    const reflector = players[reflectorId];
    if (!shooter || !reflector) return;
    const angle = Math.atan2(shooter.y - reflector.y, shooter.x - reflector.x);
    const end = { x: shooter.x, y: shooter.y };
    // Overshoots a little so a shooter who stands still is hit.
    const extra = 40;
    end.x += Math.cos(angle) * extra;
    end.y += Math.sin(angle) * extra;
    launch(projectile.kind, reflectorId, reflector.x, reflector.y, angle, { reflected: true, end });
    state.io.emit('combatEffect', { x: reflector.x, y: reflector.y, angle, weapon: projectile.kind === 'bow' ? 'bow' : 'ash' });
}

function findPlayerHit(projectile, fromX, fromY, toX, toY) {
    const radius = PROJECTILES[projectile.kind].hitRadius;
    let best = null;
    for (const [id, p] of Object.entries(players)) {
        if (id === projectile.ownerId || !canBeHit(p)) continue;
        if (distToSegment({ x: fromX, y: fromY }, { x: toX, y: toY }, p) > radius) continue;
        const along = Math.hypot(p.x - fromX, p.y - fromY);
        if (!best || along < best.along) best = { id, along };
    }
    return best && best.id;
}

// Returns true if the shot was stopped (hit or turned back).
function hitPlayer(projectile, targetId) {
    const shooter = players[projectile.ownerId];
    const target = players[targetId];
    if (!target) return false;
    const now = Date.now();
    const angleToShooter = Math.atan2(projectile.startY - target.y, projectile.startX - target.x);
    const facing = getAngleDiff(target.angle, angleToShooter) < Math.PI / 3;
    // The spear barrier and a just guard send arrows and ash arrows back (once).
    if (!projectile.reflected && projectile.kind !== 'wire'
        && (shouldReflectFromSpearUltimate(target, projectile.startX, projectile.startY) || (facing && isJustGuarding(target, now)))) {
        reflectShot(projectile, targetId);
        return true;
    }
    if (projectile.kind === 'bow') {
        const scale = shooter ? (shooter.stats && Number.isFinite(shooter.stats.dmg) ? shooter.stats.dmg : 1) : 1;
        damagePlayerFrom(projectile.ownerId, targetId, BOW_ARROW_DAMAGE * scale, projectile.startX, projectile.startY, 'bow');
        markStatsDirty();
        return true;
    }
    if (projectile.kind === 'ash') {
        if (target.isStunned) return true;
        // Longer flights stun longer: 0.3s point blank up to 2s at full range.
        const travelled = Math.hypot(target.x - projectile.startX, target.y - projectile.startY);
        const ratio = Math.max(0, Math.min(1, travelled / PROJECTILES.ash.range));
        let stunMs = Math.round((0.3 + ratio * 1.7) * 1000);
        if (isGuardActive(target, now) && facing) stunMs = Math.round(stunMs * 0.5);
        state.io.emit('combatEffect', { x: target.x, y: target.y, angle: projectile.angle, weapon: 'ash' });
        stunPlayer(targetId, Math.max(300, Math.min(2000, stunMs)));
        return true;
    }
    // Wire: a just guard pulls the thrower in instead.
    let pullerId = projectile.ownerId;
    let pulledId = targetId;
    if (facing && isJustGuarding(target, now)) {
        pullerId = targetId;
        pulledId = projectile.ownerId;
        const puller = players[pullerId];
        if (puller) state.io.emit('chatMessage', { id: 'SYSTEM', message: `저스트 가드 성공! ${puller.name}에게 반격했습니다.` });
    }
    pullPlayer(pullerId, pulledId);
    return true;
}

// Stuns the pulled player and drags them to just in front of the puller.
function pullPlayer(pullerId, pulledId) {
    const puller = players[pullerId];
    const pulled = players[pulledId];
    if (!puller || !pulled || pulled.isStunned) return;
    const stunEndsAt = Date.now() + WIRE_STUN_MS;
    pulled.isStunned = true;
    state.io.emit('playerStunned', { id: pulledId, stunned: true, stunEndsAt, stunMs: WIRE_STUN_MS });
    let step = 0;
    const steps = 10;
    const pullInterval = setInterval(() => {
        const current = players[pulledId];
        const anchor = players[pullerId];
        if (!current || !anchor) { clearInterval(pullInterval); return; }
        const destX = anchor.x + Math.cos(anchor.angle) * 50;
        const destY = anchor.y + Math.sin(anchor.angle) * 50;
        current.x += (destX - current.x) * 0.5;
        current.y += (destY - current.y) * 0.5;
        current.lastMoveAt = Date.now();
        state.io.emit('playerMoved', { id: pulledId, x: current.x, y: current.y, angle: current.angle, forced: true });
        step++;
        if (step >= steps) {
            clearInterval(pullInterval);
            setTimeout(() => {
                if (players[pulledId]) {
                    players[pulledId].isStunned = false;
                    state.io.emit('playerStunned', { id: pulledId, stunned: false, stunEndsAt: 0 });
                }
            }, WIRE_STUN_MS);
        }
    }, 30);
}

// Arrows pass through a few mobs, pushing each; ash arrows and wires ignore mobs.
function hitMobsAlong(projectile, fromX, fromY, toX, toY) {
    if (projectile.kind !== 'bow') return;
    const shooter = players[projectile.ownerId];
    if (!shooter) return;
    const damage = Math.floor(BOW_ARROW_DAMAGE * (shooter.stats && Number.isFinite(shooter.stats.dmg) ? shooter.stats.dmg : 1));
    const passed = getMobList()
        .filter((mob) => !projectile.pierced.has(mob.id) && distToSegment({ x: fromX, y: fromY }, { x: toX, y: toY }, mob) <= mob.radius + 8)
        .sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY));
    for (const mob of passed) {
        if (projectile.pierced.size >= BOW_PIERCE) break;
        projectile.pierced.add(mob.id);
        damageMob(mob.id, projectile.ownerId, damage, projectile.angle, { fromX: projectile.startX, fromY: projectile.startY, knockback: BOW_MOB_KNOCKBACK });
    }
}

function finish(projectile, hitId) {
    if (projectile.kind === 'bow') {
        state.io.emit('bowProjectileResolved', { projectileId: projectile.id });
    } else if (!projectile.reflected) {
        // The thrower's client is drawing the wire/ash arrow; tell it where it stopped.
        state.io.emit('skillShotEnd', { ownerId: projectile.ownerId, kind: projectile.kind, x: projectile.x, y: projectile.y, hitId: hitId || null });
    }
}

function tickProjectiles(now = Date.now()) {
    projectiles = projectiles.filter((projectile) => {
        if (!players[projectile.ownerId]) return false;
        const progress = Math.min(1, (now - projectile.startAt) / projectile.durationMs);
        const nextX = projectile.startX + (projectile.endX - projectile.startX) * progress;
        const nextY = projectile.startY + (projectile.endY - projectile.startY) * progress;
        const fromX = projectile.x;
        const fromY = projectile.y;
        const hitId = findPlayerHit(projectile, fromX, fromY, nextX, nextY);
        // Stop at the player if one is hit; mobs before them still take the arrow.
        let toX = nextX;
        let toY = nextY;
        if (hitId) {
            toX = players[hitId].x;
            toY = players[hitId].y;
        }
        hitMobsAlong(projectile, fromX, fromY, toX, toY);
        projectile.x = toX;
        projectile.y = toY;
        if (projectile.kind === 'bow' && projectile.pierced.size >= BOW_PIERCE) {
            finish(projectile);
            return false;
        }
        if (hitId && hitPlayer(projectile, hitId)) {
            finish(projectile, hitId);
            return false;
        }
        if (progress >= 1) {
            finish(projectile);
            return false;
        }
        return true;
    });
}

function clearProjectilesForOwner(ownerId) {
    projectiles = projectiles.filter((projectile) => projectile.ownerId !== ownerId);
}

function clearProjectiles() {
    projectiles = [];
}

module.exports = {
    fireBowVolley,
    fireSkillShot,
    tickProjectiles,
    clearProjectilesForOwner,
    clearProjectiles,
};
