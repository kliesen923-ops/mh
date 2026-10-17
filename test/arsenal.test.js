const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connectClient } = require('socket.io-client');
// Server log lines written mid-test can corrupt the test runner's output stream.
process.env.QUIET_LOGS = '1';
const { createServer } = require('../src/app');
const state = require('../src/game/state');
const { tickField, clearField, getFieldState } = require('../src/game/field');
const { clearAllMobs, spawnMob } = require('../src/game/mobs');

let server;
let baseUrl;
const clients = [];

test.before(async () => {
    server = createServer();
    server.httpServer.listen(0);
    await once(server.httpServer, 'listening');
    baseUrl = `http://localhost:${server.httpServer.address().port}`;
});

test.after(() => {
    for (const client of clients) client.close();
    server.io.close();
});

test.beforeEach(() => {
    clearField();
    clearAllMobs();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
    const client = connectClient(baseUrl, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    await once(client, 'currentPlayers');
    return client;
}

async function readyPair(weapon, skill) {
    const attackerClient = await connect();
    const targetClient = await connect();
    attackerClient.emit('setWeapon', weapon);
    if (skill) attackerClient.emit('setSkill', skill);
    for (const client of [attackerClient, targetClient]) {
        const updated = once(client, 'statsUpdate');
        client.emit('setLoadoutReady');
        await updated;
    }
    await wait(30);
    const attacker = state.players[attackerClient.id];
    const target = state.players[targetClient.id];
    Object.assign(attacker, { x: 300, y: 300, angle: 0, aAngle: 0 });
    Object.assign(target, { x: 360, y: 300, angle: Math.PI, hp: 100, isGuarding: false, isStunned: false });
    return { attackerClient, targetClient, attacker, target };
}

async function swing(client, comboStep, targetId) {
    Object.assign(state.players[client.id], { serverCombo: comboStep - 1, lastAttackAt: 0 });
    client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep, aAngle: 0 });
    client.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep, aAngle: 0 });
    if (targetId) client.emit('playerHitTarget', targetId);
    await wait(60);
}

test('new weapons and skills are accepted by name', async () => {
    const client = await connect();
    for (const weapon of ['scythe', 'gauntlet', 'staff']) {
        client.emit('setWeapon', weapon);
        await wait(30);
        assert.equal(state.players[client.id].weapon, weapon);
    }
    for (const skill of ['trap', 'blink', 'potion']) {
        client.emit('setSkill', skill);
        await wait(30);
        assert.equal(state.players[client.id].skill, skill);
    }
});

test('the scythe finisher drags the target in front of the reaper', async () => {
    const { attackerClient, targetClient, target } = await readyPair('scythe');
    Object.assign(target, { x: 400, y: 300 });
    await swing(attackerClient, 3, targetClient.id);
    assert.ok(target.hp < 100);
    assert.ok(Math.abs(target.x - 348) < 1, `pulled to ${target.x}`);
});

test('the gauntlet finisher breaks a guard and blocks raising it again', async () => {
    const { attackerClient, targetClient, target } = await readyPair('gauntlet');
    Object.assign(target, { isGuarding: true, guardStartTime: Date.now() - 500 });
    const broken = once(targetClient, 'guardBroken');
    await swing(attackerClient, 3, targetClient.id);
    await broken;
    assert.equal(target.isGuarding, false);
    targetClient.emit('playerAction', { isGuarding: true });
    await wait(40);
    assert.equal(target.isGuarding, false, 'guard stays down while broken');
});

test('a staff orb bursts on the first body it reaches and leaves a burning patch', async () => {
    const { attackerClient, target } = await readyPair('staff');
    Object.assign(target, { x: 450, y: 300 });
    Object.assign(state.players[attackerClient.id], { serverCombo: 1 - 1, lastAttackAt: 0 });
    attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
    const orb = once(attackerClient, 'staffOrb');
    attackerClient.emit('staffCast', { angle: 0 });
    const [cast] = await orb;
    assert.equal(cast.big, false);
    // Only one orb per swing.
    attackerClient.emit('staffCast', { angle: 0 });
    tickField(Date.now() + 300);
    assert.equal(target.hp, 84);
    const patch = getFieldState().zones.find((zone) => zone.kind === 'burn');
    assert.ok(patch, 'burning patch left behind');
    tickField(patch.startAt + 1600);
    assert.equal(target.hp, 84 - 4 * 3, 'patch burns three times');
    assert.equal(getFieldState().zones.length, 0);
});

test('scythe, gauntlet and staff ultimates', async () => {
    const scythe = await readyPair('scythe');
    Object.assign(scythe.target, { x: 440, y: 300 });
    scythe.attackerClient.emit('useUltimate', { angle: 0 });
    await wait(700);
    assert.ok(scythe.target.x < 360, `pulled in to ${scythe.target.x}`);
    assert.equal(scythe.target.hp, 100 - 18 * 3);

    const gauntlet = await readyPair('gauntlet');
    gauntlet.attackerClient.emit('useUltimate', { angle: 0 });
    await wait(80);
    assert.equal(gauntlet.attacker.ultimate.type, 'gauntlet');
    gauntlet.attackerClient.emit('playerMovement', { x: 320, y: 300, angle: 0 });
    await wait(600);
    assert.equal(gauntlet.attacker.x, 300, 'rooted during the rush');
    assert.equal(gauntlet.target.hp, 100 - (7 * 4 + 12));
    assert.equal(gauntlet.target.isStunned, true);

    const staff = await readyPair('staff');
    Object.assign(staff.target, { x: 580, y: 300 });
    staff.attackerClient.emit('useUltimate', { angle: 0 });
    await wait(300);
    assert.equal(staff.target.hp, 100, 'meteor lands after a delay');
    await wait(700);
    assert.equal(staff.target.hp, 58);
});

test('traps arm, root the first enemy to step in, and each owner keeps two', async () => {
    const { attackerClient, targetClient, target } = await readyPair('sword', 'trap');
    Object.assign(target, { x: 900, y: 900 });
    attackerClient.emit('useSkill', { kind: 'trap' });
    await wait(40);
    const trap = getFieldState().traps[0];
    assert.ok(trap);
    Object.assign(target, { x: trap.x + 10, y: trap.y });
    tickField(trap.armedAt - 50);
    assert.equal(target.isStunned, false, 'not armed yet');
    tickField(trap.armedAt + 10);
    assert.equal(target.isStunned, true);
    assert.equal(target.hp, 94);
    assert.equal(getFieldState().traps.length, 0);

    // Cooldown, then the third trap replaces the oldest.
    const attacker = state.players[attackerClient.id];
    for (let i = 0; i < 3; i++) {
        attacker.skillUsedAt = {};
        attacker.x = 300 + i * 100;
        attackerClient.emit('useSkill', { kind: 'trap' });
        await wait(30);
    }
    assert.deepEqual(getFieldState().traps.map((t) => t.x), [400, 500]);

    // The owner's own mobs walk over it without setting it off; anyone else's do.
    const [first] = getFieldState().traps;
    const own = spawnMob(attackerClient.id, { tier: 0, x: first.x, y: first.y });
    tickField(first.armedAt + 10);
    assert.equal(getFieldState().traps.length, 2);
    own.x = 3000;
    spawnMob(targetClient.id, { tier: 0, x: first.x, y: first.y });
    tickField(first.armedAt + 20);
    assert.equal(getFieldState().traps.length, 1);
    attackerClient.emit('useSkill', { kind: 'trap' });
    await wait(30);
    assert.equal(getFieldState().traps.length, 1, 'still on cooldown');
});

test('a blink mark sends its owner back on the second press', async () => {
    const { attackerClient, attacker } = await readyPair('sword', 'blink');
    attackerClient.emit('useSkill', { kind: 'blink' });
    await wait(40);
    assert.equal(getFieldState().marks.length, 1);
    attacker.x = 700;
    const moved = once(attackerClient, 'blinked');
    attackerClient.emit('useSkill', { kind: 'blink' });
    await moved;
    assert.equal(attacker.x, 300);
    assert.equal(getFieldState().marks.length, 0);
    attackerClient.emit('useSkill', { kind: 'blink' });
    await wait(40);
    assert.equal(getFieldState().marks.length, 0, 'on cooldown after the jump');
});

test('a heal potion is set down at your feet and heals only its owner', async () => {
    const { attackerClient, attacker, target } = await readyPair('sword', 'potion');
    Object.assign(attacker, { hp: 50 });
    Object.assign(target, { hp: 50 });
    attackerClient.emit('useSkill', { kind: 'potion' });
    await wait(40);
    const zone = getFieldState().zones.find((z) => z.kind === 'heal');
    assert.ok(zone);
    assert.deepEqual([zone.x, zone.y], [300, 300]);
    // An enemy standing in it gets nothing.
    Object.assign(target, { x: 310, y: 300 });
    tickField(zone.startAt + 1100);
    assert.equal(attacker.hp, 59, 'three heal ticks while standing in it');
    assert.equal(target.hp, 50, 'enemies are not healed');
    attacker.x = 600;
    tickField(zone.startAt + 1600);
    assert.equal(attacker.hp, 59, 'nothing once the owner steps out');
});

test('bow ultimate dragons all fly at one speed, hit as they pass, and root the archer', async () => {
    const { attackerClient, attacker, target } = await readyPair('bow');
    // Two extra dragons from projectile upgrades.
    attacker.stats.projectile = 1.4;
    Object.assign(target, { x: 700, y: 300 });
    const dragons = [];
    attackerClient.on('dragonProjectile', (d) => dragons.push(d));
    attackerClient.emit('useUltimate', { angle: 0 });
    await wait(150);
    assert.equal(dragons.length, 3);
    for (const d of dragons) {
        const speed = Math.hypot(d.endX - d.startX, d.endY - d.startY) / (d.duration / 1000);
        assert.ok(Math.abs(speed - 800) < 2, `dragon speed ${speed}`);
    }
    assert.equal(target.hp, 100, 'the dragons have not reached the target 400px away yet');
    attackerClient.emit('playerMovement', { x: 330, y: 300, angle: 0 });
    await wait(50);
    assert.equal(attacker.x, 300, 'rooted while casting');
    await wait(400);
    assert.ok(target.hp < 100, 'hit once the dragon passes');
});
