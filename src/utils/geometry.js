const { GAME_WIDTH, GAME_HEIGHT } = require('../config');

function getAngleDiff(a1, a2) {
    let diff = a1 - a2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff);
}

function distToSegment(p1, p2, p) {
    const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

function getRayWorldEdge(originX, originY, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const candidates = [];
    const pushCandidate = (t) => {
        if (!Number.isFinite(t) || t <= 0) return;
        const x = originX + dx * t;
        const y = originY + dy * t;
        if (x >= 0 && x <= GAME_WIDTH && y >= 0 && y <= GAME_HEIGHT) {
            candidates.push({ t, x, y });
        }
    };
    if (dx !== 0) {
        pushCandidate((0 - originX) / dx);
        pushCandidate((GAME_WIDTH - originX) / dx);
    }
    if (dy !== 0) {
        pushCandidate((0 - originY) / dy);
        pushCandidate((GAME_HEIGHT - originY) / dy);
    }
    candidates.sort((a, b) => a.t - b.t);
    return candidates[0] || { x: originX + dx * 1000, y: originY + dy * 1000, t: 1000 };
}

function createProjectileId(prefix) {
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
}

module.exports = {
    getAngleDiff,
    distToSegment,
    getRayWorldEdge,
    createProjectileId,
};
