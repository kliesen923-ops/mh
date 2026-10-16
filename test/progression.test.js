const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../src/game/state');
const { xpToNextLevel, grantXp } = require('../src/game/progression');
const { getAverageMobXp, pickMobTier } = require('../src/game/tiers');
const { UPGRADE_SHIELD_MS } = require('../src/config');

state.io = { emit() {}, to() { return { emit() {} }; } };

test('levels take a similar number of kills as mobs get stronger', () => {
    for (let level = 1; level <= 30; level++) {
        const kills = xpToNextLevel(level) / getAverageMobXp(level);
        assert.ok(kills >= 6 && kills <= 16, `level ${level} needs ~${kills.toFixed(1)} kills`);
    }
    assert.equal(xpToNextLevel(1), 7);
});

test('tier picks follow the 60/30/10 mix', () => {
    assert.equal(pickMobTier(16, 0.0), 3);
    assert.equal(pickMobTier(16, 0.15), 4);
    assert.equal(pickMobTier(16, 0.5), 5);
});

test('the upgrade shield turns off after its timer', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    state.players.p1 = { id: 'p1', level: 1, xp: 0, totalXp: 0, pendingUpgrades: 0, isUpgrading: false };
    grantXp('p1', xpToNextLevel(1));
    assert.equal(state.players.p1.upgradeShield, true);
    t.mock.timers.tick(UPGRADE_SHIELD_MS - 1);
    assert.equal(state.players.p1.upgradeShield, true);
    t.mock.timers.tick(1);
    assert.equal(state.players.p1.upgradeShield, false);
    assert.equal(state.players.p1.isUpgrading, true, 'menu stays open, only the shield ends');
    delete state.players.p1;
});
