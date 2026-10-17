const test = require('node:test');
const assert = require('node:assert/strict');
const {
    sanitizeAccountId,
    sanitizeAccountPassword,
    sanitizeWeapon,
    sanitizeSkill,
    sanitizeName,
} = require('../src/utils/sanitize');

test('sanitizeAccountId strips whitespace, commas and symbols and caps at 20 chars', () => {
    assert.equal(sanitizeAccountId('  hun ter,01! '), 'hunter01');
    assert.equal(sanitizeAccountId('사냥꾼_a.b-c'), '사냥꾼_a.b-c');
    assert.equal(sanitizeAccountId('a'.repeat(30)).length, 20);
    assert.equal(sanitizeAccountId(null), '');
});

test('sanitizeAccountPassword removes newlines/commas and caps at 32 chars', () => {
    assert.equal(sanitizeAccountPassword(' pa,ss\nword '), 'password');
    assert.equal(sanitizeAccountPassword('x'.repeat(40)).length, 32);
});

test('sanitizeWeapon falls back to sword', () => {
    for (const weapon of ['hammer', 'spear', 'dual', 'bow']) {
        assert.equal(sanitizeWeapon(` ${weapon.toUpperCase()} `), weapon);
    }
    assert.equal(sanitizeWeapon('laser'), 'sword');
    assert.equal(sanitizeWeapon(undefined), 'sword');
});

test('sanitizeSkill falls back to wire', () => {
    assert.equal(sanitizeSkill('ASH'), 'ash');
    assert.equal(sanitizeSkill('gear'), 'gear');
    assert.equal(sanitizeSkill('teleport'), 'wire');
});

test('sanitizeName replaces spaces, drops symbols and enforces 2..10 chars', () => {
    assert.equal(sanitizeName('big hunter', 'fb'), 'big_hunter');
    assert.equal(sanitizeName('<b>x</b>', 'fb'), 'bxb');
    assert.equal(sanitizeName('a', 'fallback'), 'fallback');
    assert.equal(sanitizeName('abcdefghijkl', 'fb'), 'abcdefghij');
});

test('sanitizeLook clamps each option and defaults bad values to 0', () => {
    const { sanitizeLook } = require('../src/utils/sanitize');
    assert.deepEqual(sanitizeLook({ hair: 2, hairColor: 3, skinColor: 1, outfit: 5 }), { hair: 2, hairColor: 3, skinColor: 1, outfit: 5 });
    assert.deepEqual(sanitizeLook({ hair: 9, hairColor: -1, skinColor: 'x', outfit: 2.7, cape: true }), { hair: 2, hairColor: 0, skinColor: 0, outfit: 2 });
    assert.deepEqual(sanitizeLook(null), { hair: 0, hairColor: 0, skinColor: 0, outfit: 0 });
});
