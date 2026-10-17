const { ATTACK_PROFILES, COMBO_FINISHER, ULTIMATE_COOLDOWN_CUT_PER_SPEED, ULTIMATE_MAX_COOLDOWN_CUT } = require('../config');
const { sanitizeWeapon } = require('../utils/sanitize');
const { getAngleDiff, distToSegment } = require('../utils/geometry');

function createBaseStatsForWeapon(weapon) {
    const nextWeapon = sanitizeWeapon(weapon);
    if (nextWeapon === 'hammer') {
        return { dmg: 1.8, range: 1.0, speed: 0.68, move: 0.9, dodge: 1.0, projectile: 1.0, hp: 120 };
    }
    if (nextWeapon === 'spear') {
        return { dmg: 1.24, range: 1.34, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
    }
    if (nextWeapon === 'dual') {
        return { dmg: 0.82, range: 0.82, speed: 1.45, move: 1.02, dodge: 1.0, projectile: 1.0, hp: 92 };
    }
    if (nextWeapon === 'bow') {
        return { dmg: 1.2, range: 1.0, speed: 0.84, move: 1.08, dodge: 1.0, projectile: 1.0, hp: 90 };
    }
    if (nextWeapon === 'scythe') {
        return { dmg: 1.3, range: 1.0, speed: 0.85, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
    }
    if (nextWeapon === 'gauntlet') {
        return { dmg: 0.7, range: 1.0, speed: 1.7, move: 1.05, dodge: 1.0, projectile: 1.0, hp: 95 };
    }
    if (nextWeapon === 'staff') {
        return { dmg: 1.0, range: 1.0, speed: 0.8, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 85 };
    }
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
}

// Ranged weapons fire projectiles instead of swinging.
function isRangedWeapon(weapon) {
    const nextWeapon = sanitizeWeapon(weapon);
    return nextWeapon === 'bow' || nextWeapon === 'staff';
}

function getWeaponAttackProfile(weapon) {
    return ATTACK_PROFILES[sanitizeWeapon(weapon)] || ATTACK_PROFILES.sword;
}

function getComboFinisher(weapon, comboStep) {
    return (comboStep === 3 && COMBO_FINISHER[sanitizeWeapon(weapon)]) || { reach: 1, width: 1 };
}

function isTargetInWeaponAttack(attacker, target) {
    if (!attacker || !target) return false;
    const profile = getWeaponAttackProfile(attacker.weapon);
    if (isRangedWeapon(attacker.weapon)) return false;
    const finisher = getComboFinisher(attacker.weapon, attacker.comboStep);
    const attackAngle = Number.isFinite(attacker.aAngle) ? attacker.aAngle : attacker.angle;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    const attackRange = profile.reach * (attacker.stats && Number.isFinite(attacker.stats.range) ? attacker.stats.range : 1) * getAttackRangeMultiplier(attacker) * finisher.reach;
    if (distance > attackRange) return false;
    if (sanitizeWeapon(attacker.weapon) === 'spear') {
        const endX = attacker.x + Math.cos(attackAngle) * attackRange;
        const endY = attacker.y + Math.sin(attackAngle) * attackRange;
        return distToSegment({ x: attacker.x, y: attacker.y }, { x: endX, y: endY }, target) <= profile.lineWidth * finisher.width;
    }
    if (attacker.comboStep === 3) return true;
    const targetAngle = Math.atan2(dy, dx);
    return getAngleDiff(attackAngle, targetAngle) <= profile.arc;
}

function getMaxHpFromStats(stats) {
    return Math.max(1, Math.floor(Number.isFinite(stats && stats.hp) ? stats.hp : 100));
}

function getAttackMultiplier(player) {
    return Math.max(1, Number.isFinite(player && player.giantAttackMult) ? player.giantAttackMult : 1);
}

function getAttackRangeMultiplier(player) {
    const weapon = sanitizeWeapon(player && player.weapon);
    if (isRangedWeapon(weapon)) return 1;
    const giantScale = Math.max(1, Number.isFinite(player && player.giantScale) ? player.giantScale : 1);
    const ultimate = player && player.ultimate && player.ultimate.active && player.ultimate.type === 'dual' ? 1.45 : 1;
    return giantScale * ultimate;
}

function createUpgradeCounts() {
    return { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 };
}

function createDefaultGearRush() {
    return {
        active: false,
        startX: 0,
        startY: 0,
        tx: 0,
        ty: 0,
        startTime: 0,
        duration: 0.24,
        mode: 'rush',
        comboId: '',
        pauseUntil: 0,
        slashIndex: 0,
        lastSlashAt: 0,
        startResolved: false,
    };
}

function createDefaultUltimate() {
    return {
        active: false,
        type: '',
        startAt: 0,
        endsAt: 0,
        cooldownEndsAt: 0,
        radius: 0,
        angle: 0,
        extra: 0,
    };
}

function getUltimateConfig(weapon) {
    const nextWeapon = sanitizeWeapon(weapon);
    if (nextWeapon === 'hammer') return { cooldownMs: 13000, durationMs: 700 };
    if (nextWeapon === 'spear') return { cooldownMs: 15000, durationMs: 2200 };
    if (nextWeapon === 'bow') return { cooldownMs: 14000, durationMs: 800 };
    if (nextWeapon === 'dual') return { cooldownMs: 14000, durationMs: 4000 };
    if (nextWeapon === 'scythe') return { cooldownMs: 13000, durationMs: 900 };
    if (nextWeapon === 'gauntlet') return { cooldownMs: 12000, durationMs: 700 };
    if (nextWeapon === 'staff') return { cooldownMs: 15000, durationMs: 1000 };
    return { cooldownMs: 11000, durationMs: 1200 };
}

// Range upgrades grow ultimate areas, relative to the weapon's starting range, and the
// giant potion grows them the same way it grows basic attack reach (not for the bow).
function getUltimateRangeMultiplier(player) {
    const base = createBaseStatsForWeapon(player && player.weapon).range || 1;
    const current = player && player.stats && Number.isFinite(player.stats.range) ? player.stats.range : base;
    const giantScale = isRangedWeapon(player && player.weapon)
        ? 1
        : Math.max(1, Number.isFinite(player && player.giantScale) ? player.giantScale : 1);
    return Math.max(1, current / base) * giantScale;
}

// Attack-speed upgrades shorten the ultimate cooldown.
function getUltimateCooldownMs(player) {
    const config = getUltimateConfig(player && player.weapon);
    const picks = Math.max(0, Math.floor((player && player.upgradeCounts && player.upgradeCounts.speed) || 0));
    return Math.round(config.cooldownMs * (1 - Math.min(ULTIMATE_MAX_COOLDOWN_CUT, picks * ULTIMATE_COOLDOWN_CUT_PER_SPEED)));
}

// Same count as normal bow volleys: one extra per projectile upgrade.
function getBowShotCount(player) {
    const projectile = player && player.stats && Number.isFinite(player.stats.projectile) ? player.stats.projectile : 1;
    return 1 + Math.max(0, Math.floor((projectile - 0.999) / 0.2));
}

function clearUltimateState(player) {
    if (!player) return;
    player.ultimate = createDefaultUltimate();
}

function createDefaultStats() {
    return { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 };
}

function normalizeStats(stats) {
    return Object.assign(createDefaultStats(), stats || {});
}

module.exports = {
    createBaseStatsForWeapon,
    createDefaultStats,
    normalizeStats,
    isRangedWeapon,
    getWeaponAttackProfile,
    isTargetInWeaponAttack,
    getComboFinisher,
    getMaxHpFromStats,
    getAttackMultiplier,
    getAttackRangeMultiplier,
    createUpgradeCounts,
    createDefaultGearRush,
    createDefaultUltimate,
    getUltimateConfig,
    getUltimateRangeMultiplier,
    getUltimateCooldownMs,
    getBowShotCount,
    clearUltimateState,
};
