const { MAX_NAME_LENGTH } = require('../config');

function sanitizeAccountId(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[,]/g, '')
        .replace(/[^\p{L}\p{N}_.-]/gu, '')
        .slice(0, 20);
}

function sanitizeAccountPassword(value) {
    return String(value || '')
        .trim()
        .replace(/[\r\n,]/g, '')
        .slice(0, 32);
}

function sanitizeWeapon(value) {
    const weapon = String(value || '').trim().toLowerCase();
    if (weapon === 'hammer') return 'hammer';
    if (weapon === 'spear') return 'spear';
    if (weapon === 'dual') return 'dual';
    if (weapon === 'bow') return 'bow';
    if (weapon === 'scythe') return 'scythe';
    if (weapon === 'gauntlet') return 'gauntlet';
    if (weapon === 'staff') return 'staff';
    return 'sword';
}

function sanitizeSkill(value) {
    const skill = String(value || '').trim().toLowerCase();
    if (skill === 'ash') return 'ash';
    if (skill === 'gear') return 'gear';
    if (skill === 'trap') return 'trap';
    if (skill === 'blink') return 'blink';
    if (skill === 'potion') return 'potion';
    return 'wire';
}

function sanitizeName(name, fallback) {
    const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '')
        .slice(0, MAX_NAME_LENGTH);
    return cleaned.length >= 2 ? cleaned : fallback;
}

// Character look: hair style, hair color, skin tone and outfit color, each an index.
// Option lists live in public/js/hero-look.js; these are their counts.
const LOOK_OPTION_COUNTS = { hair: 3, hairColor: 4, skinColor: 3, outfit: 6 };

function sanitizeLook(value) {
    const look = value && typeof value === 'object' ? value : {};
    const result = {};
    for (const [key, count] of Object.entries(LOOK_OPTION_COUNTS)) {
        const n = Math.floor(Number(look[key]));
        result[key] = Number.isFinite(n) ? Math.max(0, Math.min(count - 1, n)) : 0;
    }
    return result;
}

module.exports = {
    LOOK_OPTION_COUNTS,
    sanitizeLook,
    sanitizeAccountId,
    sanitizeAccountPassword,
    sanitizeWeapon,
    sanitizeSkill,
    sanitizeName,
};
