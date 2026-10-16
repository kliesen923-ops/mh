const test = require('node:test');
const assert = require('node:assert/strict');
const { getAngleDiff, distToSegment, getRayWorldEdge, createProjectileId } = require('../src/utils/geometry');
const { GAME_WIDTH, GAME_HEIGHT } = require('../src/config');

test('getAngleDiff wraps around ±π', () => {
    assert.ok(Math.abs(getAngleDiff(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
    assert.equal(getAngleDiff(0, 0), 0);
    assert.ok(Math.abs(getAngleDiff(0, Math.PI / 2) - Math.PI / 2) < 1e-9);
});

test('distToSegment measures to the closest point on the segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    assert.equal(distToSegment(a, b, { x: 5, y: 3 }), 3);
    assert.equal(distToSegment(a, b, { x: 13, y: 4 }), 5);
    assert.equal(distToSegment(a, a, { x: 3, y: 4 }), 5);
});

test('getRayWorldEdge hits the arena boundary', () => {
    assert.deepEqual(getRayWorldEdge(100, 100, 0), { t: GAME_WIDTH - 100, x: GAME_WIDTH, y: 100 });
    const down = getRayWorldEdge(100, 100, Math.PI / 2);
    assert.ok(Math.abs(down.y - GAME_HEIGHT) < 1e-9);
});

test('createProjectileId uses the prefix and is unique', () => {
    const a = createProjectileId('bow');
    const b = createProjectileId('bow');
    assert.match(a, /^bow:\d+:[0-9a-f]+$/);
    assert.notEqual(a, b);
});
