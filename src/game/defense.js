// Server-side timing for guards and dodges, so a client can't hold them up forever.
const { GUARD_DURATION_MS } = require('../config');

// Slack on top of the client's timings for network delay.
const GUARD_SLACK_MS = 100;
const DODGE_ACTIVE_MS = 300;

// A guard counts only within its duration after being raised.
function isGuardActive(p, now = Date.now()) {
    if (!p || !p.isGuarding) return false;
    return now - (p.guardStartTime || 0) <= GUARD_DURATION_MS + GUARD_SLACK_MS;
}

// A dodge counts only for its short dash after it starts.
function isDodgeActive(p, now = Date.now()) {
    if (!p || !p.isDodging) return false;
    return now - (Number.isFinite(p.dodgeStartAt) ? p.dodgeStartAt : now) <= DODGE_ACTIVE_MS;
}

module.exports = { isGuardActive, isDodgeActive };
