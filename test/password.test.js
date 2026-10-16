const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/auth/password');

test('hashPassword produces salt:hash that verifies', () => {
    const stored = hashPassword('secret123');
    assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.equal(verifyPassword('secret123', stored), true);
    assert.equal(verifyPassword('wrong', stored), false);
});

test('hashPassword salts each hash', () => {
    assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('verifyPassword rejects malformed hashes', () => {
    assert.equal(verifyPassword('x', ''), false);
    assert.equal(verifyPassword('x', 'nosep'), false);
    assert.equal(verifyPassword('x', null), false);
});
