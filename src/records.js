// Best single-life records per player and the top-records ranking. Stored on the
// accounts table when a database is configured, otherwise kept in memory (local play).
const { dbPool } = require('./db');
const { sanitizeAccountId } = require('./utils/sanitize');

const TOP_LIMIT = 5;
const memoryRecords = new Map();

function toRecord(row) {
    return {
        name: row.name,
        level: Number(row.level) || 0,
        survivedMs: Number(row.survivedMs) || 0,
        totalXp: Number(row.totalXp) || 0,
    };
}

function compareRecords(a, b) {
    return b.level - a.level || b.survivedMs - a.survivedMs || b.totalXp - a.totalXp;
}

async function saveToDatabase(accountId, run) {
    const before = await dbPool.query(
        'SELECT nickname, best_level, best_survival_ms, best_xp FROM accounts WHERE id = $1',
        [accountId]
    );
    const row = before.rows[0];
    if (!row) return null;
    const previous = toRecord({ name: row.nickname, level: row.best_level, survivedMs: row.best_survival_ms, totalXp: row.best_xp });
    await dbPool.query(
        `UPDATE accounts
         SET best_level = GREATEST(best_level, $2),
             best_survival_ms = GREATEST(best_survival_ms, $3),
             best_xp = GREATEST(best_xp, $4),
             updated_at = NOW()
         WHERE id = $1`,
        [accountId, run.level, Math.round(run.survivedMs), run.totalXp]
    );
    return previous;
}

async function loadTopFromDatabase() {
    const result = await dbPool.query(
        `SELECT nickname, best_level, best_survival_ms, best_xp FROM accounts
         WHERE best_level > 0
         ORDER BY best_level DESC, best_survival_ms DESC, best_xp DESC
         LIMIT $1`,
        [TOP_LIMIT]
    );
    return result.rows.map((r) => toRecord({ name: r.nickname, level: r.best_level, survivedMs: r.best_survival_ms, totalXp: r.best_xp }));
}

// Records a finished life and returns the player's best, which parts are new bests,
// and the current top ranking.
async function recordRun({ accountId, name, level, survivedMs, totalXp }) {
    const run = toRecord({ name, level, survivedMs, totalXp });
    const id = sanitizeAccountId(accountId);
    let previous;
    let top;
    if (dbPool && id) {
        previous = await saveToDatabase(id, run);
        top = await loadTopFromDatabase();
    }
    if (!previous) {
        const key = id || `name:${name}`;
        previous = memoryRecords.get(key) || toRecord({ name, level: 0, survivedMs: 0, totalXp: 0 });
        memoryRecords.set(key, {
            name,
            level: Math.max(previous.level, run.level),
            survivedMs: Math.max(previous.survivedMs, run.survivedMs),
            totalXp: Math.max(previous.totalXp, run.totalXp),
        });
        top = [...memoryRecords.values()].sort(compareRecords).slice(0, TOP_LIMIT);
    }
    const best = {
        level: Math.max(previous.level, run.level),
        survivedMs: Math.max(previous.survivedMs, run.survivedMs),
        totalXp: Math.max(previous.totalXp, run.totalXp),
    };
    const newBest = {
        level: run.level > previous.level,
        survivedMs: run.survivedMs > previous.survivedMs,
        totalXp: run.totalXp > previous.totalXp,
    };
    return { best, newBest, top };
}

function clearMemoryRecords() {
    memoryRecords.clear();
}

module.exports = { recordRun, clearMemoryRecords };
