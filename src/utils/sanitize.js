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
    return 'sword';
}

function sanitizeSkill(value) {
    const skill = String(value || '').trim().toLowerCase();
    if (skill === 'ash') return 'ash';
    if (skill === 'gear') return 'gear';
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

module.exports = {
    sanitizeAccountId,
    sanitizeAccountPassword,
    sanitizeWeapon,
    sanitizeSkill,
    sanitizeName,
};
