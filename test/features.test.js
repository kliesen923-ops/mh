const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connectClient } = require('socket.io-client');
// Server log lines written mid-test can corrupt the test runner's output stream.
process.env.QUIET_LOGS = '1';
const { createServer } = require('../src/app');
const state = require('../src/game/state');
const { spawnMob, spawnBoss, tickMobs, getMobsForOwner, clearAllMobs, isBoss } = require('../src/game/mobs');
const { clearXpOrbs, getXpOrbList } = require('../src/game/xpOrbs');
const { grantXp, xpToNextLevel } = require('../src/game/progression');
const { updateHealingCrosses, updateGiantPotions, getHealingCrossList, getGiantPotionList } = require('../src/game/pickups');
const { recordRun, clearMemoryRecords } = require('../src/records');
const { resolveKill } = require('../src/game/combat');
const { BOSS, HEAL_CROSS_MAX, GIANT_POTION_MAX, HEAL_CROSS_SPAWN_DELAY_MS, GIANT_POTION_SPAWN_DELAY_MS } = require('../src/config');

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

async function readyPlayer(client, weapon = 'sword') {
    let updated = once(client, 'statsUpdate');
    client.emit('setWeapon', weapon);
    await updated;
    updated = once(client, 'statsUpdate');
    client.emit('setLoadoutReady');
    await updated;
    return state.players[client.id];
}

test('several healing crosses and giant potions can be on the map at once', () => {
    let now = 1e12;
    for (let i = 0; i < HEAL_CROSS_MAX + 3; i++) {
        updateHealingCrosses(now);
        now += HEAL_CROSS_SPAWN_DELAY_MS;
    }
    assert.equal(getHealingCrossList().length, HEAL_CROSS_MAX);
    for (let i = 0; i < GIANT_POTION_MAX + 3; i++) {
        updateGiantPotions(now);
        now += GIANT_POTION_SPAWN_DELAY_MS;
    }
    assert.equal(getGiantPotionList().length, GIANT_POTION_MAX);
    // Old pickups expire (a fresh one may spawn in the same update).
    const oldIds = new Set([...getHealingCrossList(), ...getGiantPotionList()].map((item) => item.id));
    updateHealingCrosses(now + 1e7);
    updateGiantPotions(now + 1e7);
    const remaining = [...getHealingCrossList(), ...getGiantPotionList()];
    assert.ok(remaining.every((item) => !oldIds.has(item.id)));
    assert.ok(remaining.length <= 2);
});

test('reaching every fifth level brings out a boss once the menu closes', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { x: 1900, y: 1000, hp: 9999, level: 4, xp: 0 });
    grantXp(client.id, xpToNextLevel(4));
    assert.equal(p.level, 5);
    assert.equal(p.pendingBoss, true);

    tickMobs(Date.now(), { spawn: false });
    assert.equal(getMobsForOwner(client.id).filter(isBoss).length, 0, 'no boss while picking an upgrade');

    p.isUpgrading = false;
    const spawned = once(client, 'bossSpawned');
    tickMobs(Date.now(), { spawn: false });
    const [info] = await spawned;
    assert.equal(info.ownerId, client.id);
    assert.equal(info.level, 5);
    assert.equal(p.pendingBoss, false);
    const bosses = getMobsForOwner(client.id).filter(isBoss);
    assert.equal(bosses.length, 1);
    assert.equal(bosses[0].maxHp, BOSS.hpBase + 5 * BOSS.hpPerLevel);
    clearAllMobs();
});

test('boss slams are telegraphed, can be dodged, and hit otherwise', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { x: 1000, y: 1000, hp: 500, isDodging: false, isGuarding: false });
    p.stats.hp = 500;
    const boss = spawnBoss(client.id, { x: 1100, y: 1000 });
    boss.nextSlamAt = 0;
    boss.damage = 0;

    const warned = once(client, 'bossSlam');
    tickMobs(Date.now(), { spawn: false });
    const [slam] = await warned;
    assert.equal(slam.radius, BOSS.slamRadius);
    const heldX = boss.x;
    tickMobs(Date.now(), { spawn: false });
    assert.equal(boss.x, heldX, 'boss holds still while winding up');

    p.isDodging = true;
    tickMobs(boss.slamAt + 1, { spawn: false });
    assert.equal(p.hp, 500, 'dodging avoids the slam');

    p.isDodging = false;
    boss.nextSlamAt = 0;
    tickMobs(Date.now(), { spawn: false });
    const hurt = once(client, 'mobDamage');
    tickMobs(boss.slamAt + 1, { spawn: false });
    assert.equal((await hurt)[0].amount, boss.slamDamage);
    assert.equal(p.hp, 500 - boss.slamDamage);
    clearAllMobs();
});

test('bosses ignore knockback, and drop a burst of XP and a big heal when killed', async () => {
    clearAllMobs();
    clearXpOrbs();
    const client = await connect();
    const p = await readyPlayer(client, 'hammer');
    Object.assign(p, { x: 2600, y: 600, angle: 0, hp: 10 });
    const boss = spawnBoss(client.id, { x: 2660, y: 600 });
    const swing = async (comboStep) => {
        client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep, aAngle: 0 });
        client.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep, aAngle: 0 });
    };
    await swing(3);
    const damaged = once(client, 'mobDamaged');
    client.emit('mobHit', boss.id);
    await damaged;
    assert.equal(boss.x, 2660, 'not pushed');
    assert.ok(!(boss.stunUntil > Date.now()), 'not stunned');

    boss.hp = 1;
    await swing(1);
    const defeated = once(client, 'bossDefeated');
    client.emit('mobHit', boss.id);
    assert.equal((await defeated)[0].killerId, client.id);
    assert.ok(getXpOrbList().length > 1, 'XP scattered as several orbs');
    assert.equal(getXpOrbList().reduce((sum, orb) => sum + orb.value, 0), boss.xp);
    assert.equal(p.hp, 10 + Math.floor(120 * BOSS.killHealRatio));
    clearXpOrbs();
});

test('bow kills pull their XP to the archer from far away, and arrows push mobs', async () => {
    clearAllMobs();
    clearXpOrbs();
    const client = await connect();
    const p = await readyPlayer(client, 'bow');
    Object.assign(p, { x: 1000, y: 1700, angle: 0 });
    const mob = spawnMob(client.id, { x: 1500, y: 1700, tier: 5 });

    const damaged = once(client, 'mobDamaged');
    client.emit('bowArrowHitMob', { mobId: mob.id, endX: 1500, endY: 1700, angle: 0, projectileId: 'a1' });
    await damaged;
    assert.ok(mob.x > 1505, 'arrow nudged the mob back');

    mob.hp = 1;
    const dropped = once(client, 'xpOrbsAdded');
    client.emit('bowArrowHitMob', { mobId: mob.id, endX: mob.x, endY: mob.y, angle: 0, projectileId: 'a2' });
    const [[orb]] = await dropped;
    assert.equal(orb.magnetTo, client.id);
    const before = p.totalXp;
    tickMobs(Date.now(), { spawn: false });
    assert.equal(p.totalXp, before + orb.value, 'collected from ~535px away');
    clearXpOrbs();
});

test('records keep each player\'s best life and rank the top five', async () => {
    clearMemoryRecords();
    const first = await recordRun({ accountId: '', name: 'Alpha', level: 6, survivedMs: 90000, totalXp: 120 });
    assert.deepEqual(first.newBest, { level: true, survivedMs: true, totalXp: true });
    const worse = await recordRun({ accountId: '', name: 'Alpha', level: 3, survivedMs: 120000, totalXp: 40 });
    assert.deepEqual(worse.newBest, { level: false, survivedMs: true, totalXp: false });
    assert.deepEqual(worse.best, { level: 6, survivedMs: 120000, totalXp: 120 });

    for (const [name, level] of [['B', 9], ['C', 2], ['D', 7], ['E', 4], ['F', 1]]) {
        await recordRun({ accountId: '', name, level, survivedMs: 1000, totalXp: 1 });
    }
    const { top } = await recordRun({ accountId: '', name: 'G', level: 1, survivedMs: 500, totalXp: 1 });
    assert.deepEqual(top.map((r) => r.name), ['B', 'D', 'Alpha', 'E', 'C']);
});

test('dying sends the victim their records', async () => {
    clearMemoryRecords();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { name: 'Victim', level: 8, totalXp: 77, lifeStartedAt: Date.now() - 30000 });
    const records = once(client, 'deathRecords');
    resolveKill(null, client.id);
    const [result] = await records;
    assert.equal(result.best.level, 8);
    assert.equal(result.newBest.level, true);
    assert.equal(result.top[0].name, 'Victim');
    clearXpOrbs();
});

test('one arrow pierces up to three mobs', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client, 'bow');
    Object.assign(p, { x: 400, y: 400, angle: 0 });
    const line = [0, 1, 2, 3].map((i) => spawnMob(client.id, { x: 600 + i * 60, y: 400, tier: 5 }));
    const hpBefore = line.map((m) => m.hp);
    for (const mob of line) {
        client.emit('bowArrowHitMob', { mobId: mob.id, endX: mob.x, endY: mob.y, angle: 0, projectileId: 'pierce-1' });
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    const hit = line.map((m, i) => m.hp < hpBefore[i]);
    assert.deepEqual(hit, [true, true, true, false]);
    clearAllMobs();
    clearXpOrbs();
});
