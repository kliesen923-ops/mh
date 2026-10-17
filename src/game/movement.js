// Movement checks. Each player has a distance budget that refills at their walking speed;
// dodges and rushes add one-off grants. A move beyond the budget is cut short and the
// client is snapped back to the server's position.
const { GAME_WIDTH, GAME_HEIGHT, WORLD_MARGIN } = require('../config');

const WALK_SPEED = 350;
// Room for frame timing and network jitter on top of the client's own speed.
const SPEED_SLACK = 1.25;
// How much unused movement can be saved up (seconds of walking), plus a flat margin.
const BUDGET_SECONDS = 0.4;
const BUDGET_MARGIN = 40;

function getUltimateSpeedMultiplier(p) {
    const ult = p && p.ultimate;
    return ult && ult.active && ult.type === 'dual' ? 1.9 : 1;
}

function getWalkSpeed(p) {
    const move = p && p.stats && Number.isFinite(p.stats.move) ? p.stats.move : 1;
    return WALK_SPEED * move * SPEED_SLACK;
}

function getBudgetCap(p) {
    return getWalkSpeed(p) * BUDGET_SECONDS + BUDGET_MARGIN;
}

// One-off allowance for a dash (dodge, rush), on top of the walking budget.
function grantMoveBudget(p, distance) {
    const current = Number.isFinite(p.moveBudget) ? p.moveBudget : getBudgetCap(p);
    p.moveBudget = current + distance * SPEED_SLACK;
}

// Moves p toward (x, y) as far as its budget allows. Returns true if the move was cut short.
function applyMovement(p, x, y, now = Date.now()) {
    const dt = Math.max(0, Math.min(1, (now - (p.lastMoveAt || now)) / 1000));
    const cap = getBudgetCap(p);
    let budget = Number.isFinite(p.moveBudget) ? p.moveBudget : cap;
    if (budget < cap) budget = Math.min(cap, budget + getWalkSpeed(p) * dt);
    const dx = x - p.x;
    const dy = y - p.y;
    const distance = Math.hypot(dx, dy);
    let cut = false;
    if (distance <= budget) {
        p.x = x;
        p.y = y;
        budget -= distance;
    } else {
        const scale = budget / distance;
        p.x += dx * scale;
        p.y += dy * scale;
        budget = 0;
        cut = true;
    }
    p.x = Math.max(WORLD_MARGIN, Math.min(GAME_WIDTH - WORLD_MARGIN, p.x));
    p.y = Math.max(WORLD_MARGIN, Math.min(GAME_HEIGHT - WORLD_MARGIN, p.y));
    p.moveBudget = budget;
    p.lastMoveAt = now;
    return cut;
}

module.exports = { getUltimateSpeedMultiplier, grantMoveBudget, applyMovement };
