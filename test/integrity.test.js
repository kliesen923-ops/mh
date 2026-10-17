// Cheat attempts a modified client could make, and what the server does about them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connectClient } = require('socket.io-client');
// Server log lines written mid-test can corrupt the test runner's output stream.
process.env.QUIET_LOGS = '1';
const { createServer } = require('../src/app');
const state = require('../src/game/state');
const { tickField, clearField } = require('../src/game/field');
const { clearAllMobs } = require('../src/game/mobs');
const { isGuardActive, isDodgeActive } = require('../src/game/defense');

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

// Each test starts with no other players around to block shots.
test.beforeEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await wait(50);
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

async function ready(weapon = 'sword', skill = 'wire') {
    const client = await connect();
    client.emit('setWeapon', weapon);
    client.emit('setSkill', skill);
    const updated = once(client, 'statsUpdate');
    client.emit('setLoadoutReady');
    await updated;
    await wait(30);
    const p = state.players[client.id];
    Object.assign(p, { x: 1000, y: 1000, angle: 0, lastMoveAt: Date.now(), moveBudget: undefined });
    return { client, p };
}

test('a teleport is cut short and the client is snapped back', async () => {
    const { client, p } = await ready();
    const snapped = once(client, 'playerMoved');
    client.emit('playerMovement', { x: 1800, y: 1000, angle: 0 });
    const [moved] = await snapped;
    assert.equal(moved.forced, true);
    assert.ok(p.x < 1250, `only moved to ${p.x}`);
    // Normal walking right after is fine.
    await wait(200);
    const before = p.x;
    client.emit('playerMovement', { x: before + 60, y: 1000, angle: 0 });
    await wait(40);
    assert.equal(p.x, before + 60);
});

test('a dodge grants its dash distance once per cooldown', async () => {
    const { client, p } = await ready();
    p.moveBudget = 0;
    client.emit('playerAction', { isDodging: true });
    await wait(30);
    assert.equal(isDodgeActive(p), true);
    client.emit('playerMovement', { x: 1150, y: 1000, angle: 0 });
    await wait(30);
    assert.equal(p.x, 1150, 'the dash distance is allowed');
    client.emit('playerAction', { isDodging: false });
    client.emit('playerAction', { isDodging: true });
    await wait(30);
    assert.equal(p.isDodging, false, 'a second dodge right away is refused');
    p.isDodging = true;
    p.dodgeStartAt = Date.now() - 1000;
    assert.equal(isDodgeActive(p), false, 'a dodge never ended by the client still runs out');
});

test('attacks faster than the weapon allows are dropped, and the server numbers the combo', async () => {
    const { client, p } = await ready();
    client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 3, aAngle: 0 });
    await wait(30);
    assert.equal(p.comboStep, 1, 'a claimed finisher starts as the first hit');
    client.emit('playerAction', { isAttacking: false, attackPhase: 0 });
    client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 2, aAngle: 0 });
    await wait(30);
    assert.equal(p.isAttacking, false, 'the second swing came too soon');
    await wait(300);
    client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    await wait(30);
    assert.equal(p.comboStep, 2);
});

test('a guard runs out on its own and cannot be re-raised straight away', async () => {
    const { client, p } = await ready();
    client.emit('playerAction', { isGuarding: true });
    await wait(30);
    assert.equal(isGuardActive(p), true);
    p.guardStartTime = Date.now() - 700;
    assert.equal(isGuardActive(p), false, 'held past its duration it no longer blocks');
    client.emit('playerAction', { isGuarding: false });
    client.emit('playerAction', { isGuarding: true });
    await wait(30);
    assert.equal(p.isGuarding, false, 'still on cooldown');
});

test('arrows are flown by the server; a forged hit report does nothing', async () => {
    const archer = await ready('bow');
    const target = await ready();
    Object.assign(target.p, { x: 1300, y: 1000, angle: 0, hp: 100 });
    archer.client.emit('bowArrowHit', { targetId: target.client.id, endX: 1300, endY: 1000 });
    await wait(40);
    assert.equal(target.p.hp, 100);

    // A shot without a swing is ignored too.
    archer.client.emit('playerBowShot', { angle: 0 });
    await wait(30);
    tickField(Date.now() + 800);
    assert.equal(target.p.hp, 100);

    archer.client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    archer.client.emit('playerAction', { isAttacking: true, attackPhase: 2 });
    const fired = once(archer.client, 'bowProjectile');
    archer.client.emit('playerBowShot', { angle: 0 });
    archer.client.emit('playerBowShot', { angle: 0 });
    await fired;
    await wait(30);
    tickField(Date.now() + 800);
    assert.equal(target.p.hp, 100 - Math.floor(14 * 1.2), 'one volley per swing');
});

test('wire and ash shots are resolved by the server and respect cooldowns', async () => {
    const thrower = await ready('sword', 'wire');
    const target = await ready();
    Object.assign(target.p, { x: 1300, y: 1000, angle: 0 });
    thrower.client.emit('useSkill', { kind: 'wire', angle: 0 });
    await wait(30);
    tickField(Date.now() + 400);
    assert.equal(target.p.isStunned, true, 'the wire caught them');
    await wait(500);
    assert.ok(target.p.x < 1150, `pulled in to ${target.p.x}`);

    const archer = await ready('sword', 'ash');
    const victim = await ready();
    Object.assign(archer.p, { x: 2000, y: 400 });
    Object.assign(victim.p, { x: 2400, y: 400, angle: 0 });
    archer.client.emit('useSkill', { kind: 'ash', angle: 0 });
    await wait(30);
    tickField(Date.now() + 400);
    assert.equal(victim.p.isStunned, true);
    // A second shot within the cooldown never launches.
    victim.p.isStunned = false;
    archer.client.emit('useSkill', { kind: 'ash', angle: 0 });
    await wait(30);
    tickField(Date.now() + 400);
    assert.equal(victim.p.isStunned, false);
});

test('switching weapons mid-game does not heal', async () => {
    const { client, p } = await ready('sword');
    p.hp = 20;
    client.emit('setWeapon', 'hammer');
    await wait(40);
    assert.equal(p.weapon, 'hammer');
    assert.equal(p.hp, 20);
});

test('dual-blade rush slashes only count along the rush, ten per rush', async () => {
    const { client, p } = await ready('dual', 'gear');
    const target = await ready();
    // Off cooldown is required to start a rush at all.
    client.emit('playerAction', { gearRush: { active: true, startX: 0, startY: 0, tx: 1320, ty: 1000, mode: 'dualRush' } });
    await wait(30);
    assert.equal(p.gearRush.active, true);
    assert.deepEqual([p.gearRush.startX, p.gearRush.startY], [1000, 1000], 'the rush starts where the server has the player');

    Object.assign(target.p, { x: 2000, y: 1600, hp: 100 });
    client.emit('dualRushSlash', { startX: 1990, startY: 1600, endX: 2010, endY: 1600, angle: 0 });
    await wait(30);
    assert.equal(target.p.hp, 100, 'a slash far off the rush path is ignored');

    Object.assign(target.p, { x: 1100, y: 1000 });
    for (let i = 0; i < 14; i++) client.emit('dualRushSlash', { startX: 1090, startY: 1000, endX: 1110, endY: 1000, angle: 0 });
    await wait(60);
    assert.equal(p.rushSlashes, 10);
});

test('an ultimate stays on cooldown after it ends', async () => {
    const { client, p } = await ready('hammer');
    client.emit('useUltimate', { angle: 0 });
    await wait(40);
    const firstStart = p.ultimate.startAt;
    const cooldownEndsAt = p.ultimate.cooldownEndsAt;
    assert.ok(cooldownEndsAt > Date.now() + 10000, 'the hammer cooldown is 13s');
    // The slam lasts 0.7s; once it ends the cooldown must still be running.
    await wait(800);
    assert.equal(p.ultimate.active, false);
    assert.equal(p.ultimate.cooldownEndsAt, cooldownEndsAt);
    client.emit('useUltimate', { angle: 0 });
    await wait(40);
    assert.equal(p.ultimate.active, false, 'a second cast during the cooldown is refused');
    assert.notEqual(p.ultimate.startAt, firstStart + 1);
});
