const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connectClient } = require('socket.io-client');
const { createServer } = require('../src/app');
const state = require('../src/game/state');

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

async function connect() {
    const client = connectClient(baseUrl, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    await once(client, 'currentPlayers');
    return client;
}

async function readyPlayer(client) {
    const updated = once(client, 'statsUpdate');
    client.emit('setLoadoutReady');
    await updated;
    return state.players[client.id];
}

test('serves the game page and static assets', async () => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /js\/core\.js/);
    assert.equal((await fetch(`${baseUrl}/js/core.js`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/style.css`)).status, 200);
});

test('does not expose server source or package metadata', async () => {
    for (const file of ['/server.js', '/src/app.js', '/package.json']) {
        assert.equal((await fetch(`${baseUrl}${file}`)).status, 404, file);
    }
});

test('auth endpoints validate input before touching the database', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'a' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).ok, false);
});

test('melee hit damages and a lethal hit kills, levels up and respawns', async () => {
    const attackerClient = await connect();
    const targetClient = await connect();
    const attacker = await readyPlayer(attackerClient);
    const target = await readyPlayer(targetClient);

    Object.assign(attacker, { x: 300, y: 300, angle: 0, weapon: 'sword' });
    Object.assign(target, { x: 350, y: 300, hp: 100 });

    const swing = async () => {
        attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
        attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
        const updated = once(attackerClient, 'statsUpdate');
        attackerClient.emit('playerHitTarget', targetClient.id);
        await updated;
    };

    await swing();
    assert.equal(target.hp, 90);

    // Same swing cannot hit the same target twice.
    attackerClient.emit('playerHitTarget', targetClient.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(target.hp, 90);

    target.hp = 5;
    const died = once(targetClient, 'playerDied');
    const levelUp = once(attackerClient, 'levelUp');
    await swing();
    const [death] = await died;
    assert.deepEqual(death, { victimId: targetClient.id, attackerId: attackerClient.id });
    assert.deepEqual((await levelUp)[0], { newLevel: 2, count: 1 });
    assert.equal(attacker.kills, 1);
    assert.equal(target.deaths, 1);
    assert.equal(target.isSelectingLoadout, true);
    assert.equal(attacker.isUpgrading, true);

    const [respawned] = await once(targetClient, 'playerRespawn');
    assert.equal(respawned.id, targetClient.id);
    assert.equal(respawned.hp, 100);
});

test('hammer ultimate damages targets in front and goes on cooldown', async () => {
    const attackerClient = await connect();
    const targetClient = await connect();
    const attacker = await readyPlayer(attackerClient);
    const target = await readyPlayer(targetClient);

    let weaponSet = once(attackerClient, 'statsUpdate');
    attackerClient.emit('setWeapon', 'hammer');
    await weaponSet;
    Object.assign(attacker, { x: 600, y: 300, angle: 0, aAngle: 0 });
    Object.assign(target, { x: 680, y: 300, hp: 100 });

    let updated = once(attackerClient, 'statsUpdate');
    attackerClient.emit('useUltimate');
    await updated;
    assert.equal(target.hp, 100 - Math.floor(28 * 1.8));
    assert.ok(attacker.ultimate.cooldownEndsAt > Date.now());

    // Second use during cooldown is ignored.
    const hpAfterFirst = target.hp;
    attackerClient.emit('useUltimate');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(target.hp, hpAfterFirst);
});

test('disconnect removes the player for everyone', async () => {
    const watcher = await connect();
    const leaver = await connect();
    const leaverId = leaver.id;
    assert.ok(state.players[leaverId]);
    const gone = once(watcher, 'playerDisconnected');
    leaver.close();
    assert.equal((await gone)[0], leaverId);
    assert.equal(state.players[leaverId], undefined);
});
