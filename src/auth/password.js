const crypto = require('crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
    return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
    const [salt, derived] = String(storedHash || '').split(':');
    if (!salt || !derived) return false;
    const nextDerived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(nextDerived, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
