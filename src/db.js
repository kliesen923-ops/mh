const { sanitizeAccountId } = require('./utils/sanitize');

let Pool = null;
if (process.env.DATABASE_URL) {
    try {
        ({ Pool } = require('pg'));
    } catch (error) {
        console.warn('pg module is unavailable:', error.message);
    }
}

const dbPool = Pool && process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
}) : null;

async function initDatabase() {
    if (!dbPool) return;
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            kills INTEGER NOT NULL DEFAULT 0,
            deaths INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

function getAccountById(id) {
    const accountId = sanitizeAccountId(id);
    if (!accountId) return Promise.resolve(null);
    if (!dbPool) return Promise.resolve(null);
    return dbPool.query(
        'SELECT id, nickname, password_hash, kills, deaths FROM accounts WHERE id = $1',
        [accountId]
    ).then((result) => result.rows[0] || null);
}

async function updateAccountScore(accountId, field, delta) {
    const id = sanitizeAccountId(accountId);
    if (!id || !Number.isFinite(delta)) return null;
    if (!dbPool) return null;
    if (field !== 'kills' && field !== 'deaths') return null;
    const result = await dbPool.query(
        `UPDATE accounts
         SET ${field} = GREATEST(0, ${field} + $1),
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, nickname, password_hash, kills, deaths`,
        [delta, id]
    );
    return result.rows[0] || null;
}

module.exports = {
    dbPool,
    initDatabase,
    getAccountById,
    updateAccountScore,
};
