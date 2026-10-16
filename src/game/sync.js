const state = require('./state');
const { STATS_FLUSH_MS } = require('../config');

let statsDirty = false;
let lastFlushAt = 0;

// Frequent changes (mob contact damage, XP gains) mark stats dirty instead of
// broadcasting the whole player table on every hit.
function markStatsDirty() {
    statsDirty = true;
}

function flushStats(now = Date.now()) {
    if (!statsDirty || now - lastFlushAt < STATS_FLUSH_MS) return;
    statsDirty = false;
    lastFlushAt = now;
    state.io.emit('statsUpdate', state.players);
}

module.exports = { markStatsDirty, flushStats };
