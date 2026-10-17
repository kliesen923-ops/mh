const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connectClient } = require('socket.io-client');
// Server log lines written mid-test can corrupt the test runner's output stream.
process.env.QUIET_LOGS = '1';
const { createServer } = require('../src/app');
const state = require('../src/game/state');
const { spawnMob, tickMobs, getMobsForOwner, clearAllMobs } = require('../src/game/mobs');
const { scatterXp, clearXpOrbs, getXpOrbList } = require('../src/game/xpOrbs');
const { grantXp } = require('../src/game/progression');

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
    const manifest = await (await fetch(`${baseUrl}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, 'fullscreen');
    assert.equal(manifest.orientation, 'landscape');
    for (const icon of manifest.icons) {
        assert.equal((await fetch(`${baseUrl}/${icon.src}`)).status, 200, icon.src);
    }
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

test('melee hit damages and a lethal hit kills, scatters XP and respawns', async () => {
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
    Object.assign(target, { level: 4, xp: 2, totalXp: 30 });
    const died = once(targetClient, 'playerDied');
    const orbsDropped = once(attackerClient, 'xpOrbsAdded');
    await swing();
    const [death] = await died;
    assert.deepEqual(death, { victimId: targetClient.id, attackerId: attackerClient.id });
    const [orbs] = await orbsDropped;
    assert.equal(orbs.reduce((sum, orb) => sum + orb.value, 0), 30);
    for (const orb of orbs) {
        const distance = Math.hypot(orb.x - 350, orb.y - 300);
        assert.ok(distance >= 89 && distance <= 261, `orb scattered ${distance}px away`);
    }
    assert.equal(attacker.kills, 1);
    assert.equal(target.deaths, 1);
    assert.equal(target.isSelectingLoadout, true);
    assert.deepEqual([target.level, target.xp, target.totalXp], [1, 0, 0]);
    clearXpOrbs();

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
    assert.equal(attacker.ultimate.angle, 0, 'clients get the cast direction to draw the cone');
    assert.ok(attacker.ultimate.radius >= 160);

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

test('mobs chase only their owner and are reported to nearby players', async () => {
    clearAllMobs();
    const ownerClient = await connect();
    const owner = await readyPlayer(ownerClient);
    Object.assign(owner, { x: 2000, y: 1000, hp: 100 });

    const mob = spawnMob(ownerClient.id, { x: 2300, y: 1000, tier: 0 });
    const snapshot = once(ownerClient, 'mobs');
    tickMobs(Date.now(), { spawn: false });
    const [mobsSeen] = await snapshot;
    const entry = mobsSeen.find(([id]) => id === mob.id);
    assert.ok(entry, 'owner sees their mob');
    assert.equal(entry[5], 1, 'flagged as the owner\'s mob');
    assert.ok(mob.x < 2300, 'mob moved toward the owner');
    clearAllMobs();
});

test('mobs deal contact damage, and a killed mob drops XP to pick up', async () => {
    clearAllMobs();
    const ownerClient = await connect();
    const owner = await readyPlayer(ownerClient);
    Object.assign(owner, { x: 1000, y: 1000, hp: 100, angle: 0, weapon: 'sword', isGuarding: false, isDodging: false });

    const biter = spawnMob(ownerClient.id, { x: 1010, y: 1000, tier: 0 });
    const bitten = once(ownerClient, 'mobDamage');
    tickMobs(Date.now(), { spawn: false });
    const [{ amount }] = await bitten;
    assert.equal(amount, biter.damage);
    assert.equal(owner.hp, 100 - biter.damage);

    owner.hp = 100;
    const xpBefore = owner.totalXp;
    const killed = once(ownerClient, 'mobKilled');
    const dropped = once(ownerClient, 'xpOrbsAdded');
    biter.hp = 1;
    ownerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    ownerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
    ownerClient.emit('mobHit', biter.id);
    const [kill] = await killed;
    assert.equal(kill.id, biter.id);
    assert.equal(kill.killerId, ownerClient.id);
    const [[orb]] = await dropped;
    assert.deepEqual([orb.x, orb.y, orb.value], [biter.x, biter.y, biter.xp], 'orb left where the mob died');
    assert.equal(owner.totalXp, xpBefore, 'XP is not granted until the orb is picked up');
    assert.equal(owner.hp, 100, 'already at full health');

    const collected = once(ownerClient, 'xpOrbsRemoved');
    tickMobs(Date.now(), { spawn: false });
    const [[removed]] = await collected;
    assert.deepEqual(removed, { id: orb.id, by: ownerClient.id, value: biter.xp });
    assert.equal(owner.totalXp, xpBefore + biter.xp);
    assert.equal(getMobsForOwner(ownerClient.id).length, 0);
});

test('stronger mob tiers appear as the owner levels up', () => {
    const { pickMobTier, getMaxMobTier } = require('../src/game/mobs');
    assert.equal(getMaxMobTier(1), 0);
    assert.equal(getMaxMobTier(4), 1);
    assert.equal(getMaxMobTier(100), 5);
    assert.equal(pickMobTier(10, 0.9), 3);
    assert.equal(pickMobTier(10, 0.2), 2);
    assert.equal(pickMobTier(10, 0.05), 1);
    assert.equal(pickMobTier(1, 0.05), 0);
});

test('XP levels players up and pauses their mobs during the upgrade pick', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { x: 1500, y: 800, hp: 100, level: 1, xp: 0, totalXp: 0, pendingUpgrades: 0 });

    const leveled = once(client, 'levelUp');
    grantXp(client.id, 7 + 7 + 1);
    assert.deepEqual((await leveled)[0], { newLevel: 3, count: 2 });
    assert.equal(p.xp, 1);
    assert.equal(p.isUpgrading, true);
    assert.equal(p.upgradeShield, true);

    const mob = spawnMob(client.id, { x: 1700, y: 800, tier: 0 });
    tickMobs(Date.now(), { spawn: false });
    assert.equal(mob.x, 1700, 'mob frozen while upgrading');

    const firstPick = once(client, 'upgradeApplied');
    client.emit('selectUpgrade', 'range');
    await firstPick;
    assert.ok(Math.abs(p.stats.range - 1.15) < 1e-9, 'range upgrade applies');
    const hpBefore = p.hp;
    const secondPick = once(client, 'upgradeApplied');
    client.emit('selectUpgrade', 'hp');
    await secondPick;
    assert.equal(p.stats.hp, 120);
    assert.equal(p.hp, Math.min(120, hpBefore + 20));
    assert.equal(p.isUpgrading, false);
    assert.equal(p.upgradeShield, false);
    assert.deepEqual([p.upgradeCounts.range, p.upgradeCounts.hp], [1, 1]);

    // No pending picks left: extra requests are ignored.
    client.emit('selectUpgrade', 'dmg');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(p.stats.dmg, 1);
    clearAllMobs();
});

test('players can be hit again once the upgrade shield runs out', async () => {
    const attackerClient = await connect();
    const targetClient = await connect();
    const attacker = await readyPlayer(attackerClient);
    const target = await readyPlayer(targetClient);
    Object.assign(attacker, { x: 2600, y: 1400, angle: 0, weapon: 'sword' });
    Object.assign(target, { x: 2650, y: 1400, hp: 100, isUpgrading: true });

    const swing = () => {
        attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
        attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
        attackerClient.emit('playerHitTarget', targetClient.id);
    };

    target.upgradeShield = true;
    swing();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(target.hp, 100, 'shielded right after the menu opens');

    target.upgradeShield = false;
    const hit = once(attackerClient, 'statsUpdate');
    swing();
    await hit;
    assert.equal(target.hp, 90, 'hittable while still picking once the shield is gone');
    target.isUpgrading = false;
});

test('scattered XP orbs are collected by walking over them', async () => {
    clearXpOrbs();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { x: 600, y: 600, hp: 100, level: 1, xp: 0, totalXp: 0 });
    const orbs = scatterXp(3000, 1500, 9);
    assert.equal(orbs.reduce((sum, orb) => sum + orb.value, 0), 9);

    for (const orb of orbs) {
        p.x = orb.x;
        p.y = orb.y;
        tickMobs(Date.now(), { spawn: false });
    }
    assert.equal(getXpOrbList().length, 0);
    assert.equal(p.totalXp, 9);
});

test('dying to your own mobs counts as a death with no killer', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    Object.assign(p, { x: 900, y: 900, hp: 2, isDodging: false, isGuarding: false, isUpgrading: false });
    spawnMob(client.id, { x: 905, y: 900, tier: 0 });

    const died = once(client, 'playerDied');
    tickMobs(Date.now(), { spawn: false });
    assert.deepEqual((await died)[0], { victimId: client.id, attackerId: null });
    tickMobs(Date.now(), { spawn: false });
    assert.equal(getMobsForOwner(client.id).length, 0, 'mobs vanish when their owner dies');
    clearXpOrbs();
});

test('picking a loadout before the respawn timer still leaves the player active', async () => {
    const attackerClient = await connect();
    const victimClient = await connect();
    const attacker = await readyPlayer(attackerClient);
    const victim = await readyPlayer(victimClient);
    Object.assign(attacker, { x: 3000, y: 300, angle: 0, weapon: 'sword' });
    Object.assign(victim, { x: 3050, y: 300, hp: 5 });

    const died = once(victimClient, 'playerDied');
    attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    attackerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
    attackerClient.emit('playerHitTarget', victimClient.id);
    await died;

    // Player confirms weapon and skill right away, before the 3s respawn.
    await readyPlayer(victimClient);
    assert.equal(victim.isSelectingLoadout, false);
    await new Promise((resolve) => {
        victimClient.on('playerRespawn', (p) => { if (p.id === victimClient.id) resolve(); });
    });
    assert.equal(victim.hp > 0, true);
    assert.equal(victim.isSelectingLoadout, false, 'respawn must not put the player back into loadout selection');
    clearXpOrbs();
});

test('the victim gets a record of the life that just ended', async () => {
    clearAllMobs();
    const killerClient = await connect();
    const victimClient = await connect();
    const killer = await readyPlayer(killerClient);
    const victim = await readyPlayer(victimClient);
    Object.assign(killer, { x: 400, y: 1700, angle: 0, weapon: 'sword', name: 'Killer' });
    Object.assign(victim, { x: 450, y: 1700, hp: 100, level: 5, totalXp: 42, lifeStartedAt: Date.now() - 65000 });

    // The victim kills one mob first.
    const mob = spawnMob(victimClient.id, { x: 480, y: 1700, tier: 0 });
    mob.hp = 1;
    victim.angle = 0;
    victimClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    victimClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
    const mobDown = once(victimClient, 'mobKilled');
    victimClient.emit('mobHit', mob.id);
    await mobDown;
    victim.totalXp = 42;

    victim.hp = 5;
    const summary = once(victimClient, 'deathSummary');
    killerClient.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep: 1, aAngle: 0 });
    killerClient.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep: 1, aAngle: 0 });
    killerClient.emit('playerHitTarget', victimClient.id);
    const [record] = await summary;
    assert.equal(record.killerName, 'Killer');
    assert.equal(record.level, 5);
    assert.equal(record.totalXp, 42);
    assert.equal(record.mobKills, 1);
    assert.equal(record.playerKills, 0);
    assert.ok(record.survivedMs >= 65000 && record.survivedMs < 70000, `survived ${record.survivedMs}ms`);
    assert.equal(killer.lifePlayerKills, 1);
    assert.deepEqual([victim.lifeStartedAt, victim.lifeMobKills], [0, 0], 'life stats reset for the next run');
    clearXpOrbs();
    clearAllMobs();
});

test('hammer hits knock mobs back, and the finisher stuns them', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    const weaponSet = once(client, 'statsUpdate');
    client.emit('setWeapon', 'hammer');
    await weaponSet;
    Object.assign(p, { x: 1000, y: 600, angle: 0, hp: 9999 });

    const mob = spawnMob(client.id, { x: 1060, y: 600, tier: 5 });
    const swing = async (comboStep) => {
        client.emit('playerAction', { isAttacking: true, attackPhase: 1, comboStep, aAngle: 0 });
        client.emit('playerAction', { isAttacking: true, attackPhase: 2, comboStep, aAngle: 0 });
        const damaged = once(client, 'mobDamaged');
        client.emit('mobHit', mob.id);
        return (await damaged)[0];
    };

    const first = await swing(1);
    assert.ok(first.damage > 0, 'damage number sent to clients');
    assert.equal(Math.round(mob.x), 1090, 'normal hit pushes the mob 30px');
    assert.equal(mob.stunUntil || 0, 0);

    mob.x = 1060;
    await swing(3);
    assert.equal(Math.round(mob.x), 1120, 'finisher pushes the mob 60px');
    assert.ok(mob.stunUntil > Date.now(), 'finisher stuns');

    const x = mob.x;
    tickMobs(Date.now(), { spawn: false });
    assert.equal(mob.x, x, 'stunned mobs do not move');
    clearAllMobs();
});

test('the spear ultimate keeps mobs outside its barrier', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    const weaponSet = once(client, 'statsUpdate');
    client.emit('setWeapon', 'spear');
    await weaponSet;
    Object.assign(p, { x: 2000, y: 1000, angle: 0, hp: 9999 });
    const mob = spawnMob(client.id, { x: 2040, y: 1000, tier: 5 });

    const updated = once(client, 'statsUpdate');
    client.emit('useUltimate');
    await updated;
    for (let i = 0; i < 5; i++) tickMobs(Date.now(), { spawn: false });
    const distance = Math.hypot(mob.x - p.x, mob.y - p.y);
    assert.ok(distance >= 180 + mob.radius - 1, `mob held at ${distance.toFixed(0)}px`);
    clearAllMobs();
});

test('hammer ultimate stuns the mobs it hits', async () => {
    clearAllMobs();
    const client = await connect();
    const p = await readyPlayer(client);
    const weaponSet = once(client, 'statsUpdate');
    client.emit('setWeapon', 'hammer');
    await weaponSet;
    Object.assign(p, { x: 3000, y: 1000, angle: 0, aAngle: 0, hp: 9999 });
    const mob = spawnMob(client.id, { x: 3080, y: 1000, tier: 5 });

    const updated = once(client, 'statsUpdate');
    client.emit('useUltimate');
    await updated;
    assert.ok(mob.stunUntil > Date.now());
    assert.ok(mob.x > 3150, 'pushed away from the slam');
    clearAllMobs();
});

test('upgrades carry over to ultimates', async () => {
    const client = await connect();
    const p = await readyPlayer(client);
    // A sword ultimate keeps sending statsUpdate for each slash, so wait for the update
    // that actually reflects the request rather than whichever arrives next.
    const nextStats = (predicate) => new Promise((resolve) => {
        const onUpdate = (data) => {
            if (!predicate(data[client.id] || {})) return;
            client.off('statsUpdate', onUpdate);
            resolve();
        };
        client.on('statsUpdate', onUpdate);
    });
    const useWeapon = async (weapon) => {
        const set = nextStats((me) => me.weapon === weapon);
        client.emit('setWeapon', weapon);
        await set;
        Object.assign(p, { x: 1200, y: 1600, hp: 9999, angle: 0, aAngle: 0 });
    };
    const cast = async () => {
        p.ultimate.cooldownEndsAt = 0;
        const updated = nextStats((me) => me.ultimate && me.ultimate.cooldownEndsAt > 0);
        client.emit('useUltimate');
        await updated;
        return p.ultimate;
    };

    // Range picks grow the area, relative to the weapon's starting range.
    await useWeapon('sword');
    p.stats.range = 1.3;
    assert.equal((await cast()).radius, Math.round(126 * 1.3));
    await useWeapon('spear');
    p.stats.range = 1.34 * 1.15;
    assert.equal((await cast()).radius, Math.round(180 * 1.15));

    // Attack-speed picks cut the cooldown by 8% each, up to 40%.
    await useWeapon('hammer');
    p.upgradeCounts.speed = 2;
    let ult = await cast();
    assert.ok(Math.abs((ult.cooldownEndsAt - Date.now()) - 13000 * 0.84) < 200);
    p.upgradeCounts.speed = 9;
    ult = await cast();
    assert.ok(Math.abs((ult.cooldownEndsAt - Date.now()) - 13000 * 0.6) < 200);

    // Projectile picks add dragons.
    await useWeapon('bow');
    p.stats.projectile = 1.4;
    const dragons = [];
    const onDragon = (d) => dragons.push(d);
    client.on('dragonProjectile', onDragon);
    ult = await cast();
    await new Promise((resolve) => setTimeout(resolve, 50));
    client.off('dragonProjectile', onDragon);
    assert.equal(ult.angles.length, 3);
    assert.equal(dragons.length, 3);
});

test('bow and hammer ultimates fire where the player is facing, not the last attack direction', async () => {
    const client = await connect();
    const p = await readyPlayer(client);
    for (const weapon of ['bow', 'hammer']) {
        const set = new Promise((resolve) => {
            const onUpdate = (data) => {
                if ((data[client.id] || {}).weapon !== weapon) return;
                client.off('statsUpdate', onUpdate);
                resolve();
            };
            client.on('statsUpdate', onUpdate);
        });
        client.emit('setWeapon', weapon);
        await set;
        // Last attack went right (0), but the player has since turned to face down (PI / 2).
        Object.assign(p, { x: 2000, y: 900, hp: 9999, aAngle: 0, angle: 0 });
        p.ultimate.cooldownEndsAt = 0;
        const cast = new Promise((resolve) => {
            const onUpdate = (data) => {
                const me = data[client.id] || {};
                if (!(me.ultimate && me.ultimate.cooldownEndsAt > 0)) return;
                client.off('statsUpdate', onUpdate);
                resolve();
            };
            client.on('statsUpdate', onUpdate);
        });
        client.emit('useUltimate', { weapon, angle: Math.PI / 2 });
        await cast;
        const fired = weapon === 'bow' ? p.ultimate.angles[Math.floor(p.ultimate.angles.length / 2)] : p.ultimate.angle;
        assert.ok(Math.abs(fired - Math.PI / 2) < 1e-9, `${weapon} ultimate fired at ${fired}`);
    }
});

test('players can set their look, and others see it', async () => {
    const client = await connect();
    const watcher = await connect();
    await readyPlayer(client);
    const seen = new Promise((resolve) => {
        const onUpdate = (data) => {
            const look = (data[client.id] || {}).look;
            if (!look || look.outfit !== 3) return;
            watcher.off('statsUpdate', onUpdate);
            resolve(look);
        };
        watcher.on('statsUpdate', onUpdate);
    });
    client.emit('setLook', { hair: 1, hairColor: 2, skinColor: 2, outfit: 3, extra: 'ignored' });
    assert.deepEqual(await seen, { hair: 1, hairColor: 2, skinColor: 2, outfit: 3 });
});

test('hammer ultimate is a long, narrow wedge and roots the caster until it ends', async () => {
    const attackerClient = await connect();
    const attacker = await readyPlayer(attackerClient);
    const targets = [];
    for (let i = 0; i < 3; i++) targets.push(await readyPlayer(await connect()));
    const set = new Promise((resolve) => {
        const onUpdate = (data) => {
            if ((data[attackerClient.id] || {}).weapon !== 'hammer') return;
            attackerClient.off('statsUpdate', onUpdate);
            resolve();
        };
        attackerClient.on('statsUpdate', onUpdate);
    });
    attackerClient.emit('setWeapon', 'hammer');
    await set;
    Object.assign(attacker, { x: 2400, y: 1500, angle: 0, aAngle: 0, hp: 9999 });
    const [far, offAxis, beside] = targets;
    Object.assign(far, { x: 2400 + 230, y: 1500, hp: 1000 });                                   // straight ahead, past the old 163 reach
    Object.assign(offAxis, { x: 2400 + Math.cos(0.45) * 120, y: 1500 + Math.sin(0.45) * 120, hp: 1000 }); // ~26° off: inside
    Object.assign(beside, { x: 2400, y: 1500 + 100, hp: 1000 });                               // 90° to the side: outside now

    const cast = new Promise((resolve) => {
        const onUpdate = (data) => {
            const me = data[attackerClient.id] || {};
            if (!(me.ultimate && me.ultimate.cooldownEndsAt > 0 && me.ultimate.type === 'hammer')) return;
            attackerClient.off('statsUpdate', onUpdate);
            resolve();
        };
        attackerClient.on('statsUpdate', onUpdate);
    });
    attackerClient.emit('useUltimate', { weapon: 'hammer', angle: 0 });
    await cast;
    assert.ok(far.hp < 1000, 'long reach straight ahead');
    assert.ok(offAxis.hp < 1000, 'inside the narrow wedge');
    assert.equal(beside.hp, 1000, 'outside the wedge to the side');
    assert.ok(Math.abs(attacker.ultimate.extra - Math.PI / 6) < 1e-9, 'half-angle sent to clients is 30°');
    assert.ok(attacker.ultimate.radius >= 240);

    // Movement is ignored while the ultimate is still landing.
    attacker.lastMoveAt = Date.now() - 1000;
    attackerClient.emit('playerMovement', { x: 2450, y: 1500, angle: 0 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual([attacker.x, attacker.y], [2400, 1500], 'rooted during the ultimate');
    attacker.ultimate.endsAt = Date.now() - 1;
    attacker.lastMoveAt = Date.now() - 1000;
    attackerClient.emit('playerMovement', { x: 2450, y: 1500, angle: 0 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(attacker.x, 2450, 'free to move once it ends');
});
