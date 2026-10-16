const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createBaseStatsForWeapon,
    normalizeStats,
    getMaxHpFromStats,
    getAttackRangeMultiplier,
    isTargetInWeaponAttack,
    getUltimateConfig,
} = require('../src/game/stats');
const { sanitizeAction } = require('../src/game/action');

test('weapons have distinct base HP', () => {
    assert.equal(createBaseStatsForWeapon('hammer').hp, 115);
    assert.equal(createBaseStatsForWeapon('bow').hp, 90);
    assert.equal(createBaseStatsForWeapon('unknown').hp, 100);
});

test('normalizeStats fills missing fields with defaults', () => {
    assert.deepEqual(normalizeStats({ dmg: 2 }), { dmg: 2, range: 1, speed: 1, move: 1, dodge: 1, projectile: 1, hp: 100 });
});

test('getMaxHpFromStats floors and defaults', () => {
    assert.equal(getMaxHpFromStats({ hp: 99.9 }), 99);
    assert.equal(getMaxHpFromStats(null), 100);
    assert.equal(getMaxHpFromStats({ hp: -5 }), 1);
});

test('range multiplier: giant scale applies, bow is unaffected, dual ultimate boosts', () => {
    assert.equal(getAttackRangeMultiplier({ weapon: 'sword', giantScale: 1.9 }), 1.9);
    assert.equal(getAttackRangeMultiplier({ weapon: 'bow', giantScale: 1.9 }), 1);
    assert.equal(getAttackRangeMultiplier({ weapon: 'dual', ultimate: { active: true, type: 'dual' } }), 1.45);
});

test('isTargetInWeaponAttack respects reach and arc', () => {
    const attacker = { weapon: 'sword', x: 0, y: 0, angle: 0, aAngle: 0, stats: { range: 1 } };
    assert.equal(isTargetInWeaponAttack(attacker, { x: 60, y: 0 }), true);
    assert.equal(isTargetInWeaponAttack(attacker, { x: 100, y: 0 }), false);
    assert.equal(isTargetInWeaponAttack(attacker, { x: -60, y: 0 }), false);
    assert.equal(isTargetInWeaponAttack({ ...attacker, comboStep: 3 }, { x: -60, y: 0 }), true);
});

test('spear hits along a narrow line', () => {
    const attacker = { weapon: 'spear', x: 0, y: 0, angle: 0, stats: { range: 1 } };
    assert.equal(isTargetInWeaponAttack(attacker, { x: 120, y: 10 }), true);
    assert.equal(isTargetInWeaponAttack(attacker, { x: 60, y: 40 }), false);
});

test('bow never counts as a melee hit', () => {
    assert.equal(isTargetInWeaponAttack({ weapon: 'bow', x: 0, y: 0, angle: 0 }, { x: 10, y: 0 }), false);
});

test('ultimate cooldowns per weapon', () => {
    assert.deepEqual(getUltimateConfig('sword'), { cooldownMs: 11000, durationMs: 1200 });
    assert.deepEqual(getUltimateConfig('spear'), { cooldownMs: 15000, durationMs: 2200 });
});


test('sanitizeAction keeps only valid fields and clamps wire distance', () => {
    const player = { x: 0, y: 0, wire: { tx: 0, ty: 0 } };
    const action = sanitizeAction(player, {
        isAttacking: true,
        comboStep: 7,
        attackPhase: 2,
        hp: 9999,
        wire: { active: true, kind: 'ash', tx: 1040, ty: 0, progress: 3 },
    });
    assert.equal(action.isAttacking, true);
    assert.equal(action.attackPhase, 2);
    assert.equal('comboStep' in action, false);
    assert.equal('hp' in action, false);
    assert.equal(action.wire.kind, 'ash');
    assert.equal(action.wire.tx, 520);
    assert.equal(action.wire.progress, 1);
    assert.deepEqual(sanitizeAction(player, 'garbage'), {});
});
