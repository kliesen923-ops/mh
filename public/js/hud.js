const LEADERBOARD_ROWS = 5;
function makeRankRow(p, position) {
    const row = document.createElement('div');
    row.className = 'rank-row' + (p.id === myId ? ' me' : '');
    const pos = document.createElement('span');
    pos.className = 'rank-pos';
    pos.textContent = String(position);
    const name = document.createElement('span');
    name.className = 'rank-name';
    name.textContent = p.name || 'Hunter';
    const level = document.createElement('span');
    level.className = 'rank-level';
    level.textContent = `Lv.${p.level || 1}`;
    const kills = document.createElement('span');
    kills.className = 'rank-kills';
    kills.textContent = `${p.kills || 0}킬`;
    row.append(pos, name, level, kills);
    return row;
}
function updateLeaderboard() {
    const list = document.getElementById('score-list');
    if (!list) return;
    const ranked = Object.values(allPlayers)
        .filter((p) => !p.isSelectingLoadout || p.id === myId)
        .sort((a, b) => (b.level || 1) - (a.level || 1) || (b.kills || 0) - (a.kills || 0));
    list.textContent = '';
    ranked.slice(0, LEADERBOARD_ROWS).forEach((p, i) => list.append(makeRankRow(p, i + 1)));
    const myIndex = ranked.findIndex((p) => p.id === myId);
    if (myIndex >= LEADERBOARD_ROWS) {
        const gap = document.createElement('div');
        gap.className = 'rank-gap';
        gap.textContent = '···';
        list.append(gap, makeRankRow(ranked[myIndex], myIndex + 1));
    }
}

function formatDamage(value) {
    return String(Math.floor(value));
}

function formatPercentStat(multiplier) {
    return String(Math.round((Number.isFinite(multiplier) ? multiplier : 1) * 100));
}

function getBowProjectileCount(stats) {
    const projectileMultiplier = Number.isFinite(stats && stats.projectile) ? stats.projectile : 1;
    return Math.max(1, 1 + Math.max(0, Math.floor((projectileMultiplier - 0.999) / 0.2)));
}

function normalizeStats(stats) {
    return Object.assign({ dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 }, stats || {});
}

function normalizeWeapon(weapon) {
    return Object.prototype.hasOwnProperty.call(WEAPON_PRESETS, weapon) ? weapon : 'sword';
}

// Ranged weapons fire projectiles instead of swinging (matches the server).
function isRangedWeapon(weapon) {
    const nextWeapon = normalizeWeapon(weapon);
    return nextWeapon === 'bow' || nextWeapon === 'staff';
}

function createBaseStatsForWeapon(weapon) {
    return Object.assign({}, WEAPON_PRESETS[normalizeWeapon(weapon)].stats);
}

function getWeaponLabel(weapon) {
    return WEAPON_PRESETS[normalizeWeapon(weapon)].label;
}

function getWeaponAttackProfile(weapon) {
    return ATTACK_PROFILES[normalizeWeapon(weapon)] || ATTACK_PROFILES.sword;
}

function getUltimateState(sourcePlayer) {
    return Object.assign(createDefaultUltimate(), sourcePlayer && sourcePlayer.ultimate ? sourcePlayer.ultimate : {});
}

function getUltimateCooldownSec(sourcePlayer) {
    const base = ULTIMATE_PRESETS[normalizeWeapon(sourcePlayer && sourcePlayer.weapon)]?.cooldown || 1.0;
    const picks = Math.max(0, Math.floor((sourcePlayer && sourcePlayer.upgradeCounts && sourcePlayer.upgradeCounts.speed) || 0));
    return base * (1 - Math.min(ULTIMATE_MAX_COOLDOWN_CUT, picks * ULTIMATE_COOLDOWN_CUT_PER_SPEED));
}

function getUltimateSpeedMultiplier(sourcePlayer) {
    const ultimate = getUltimateState(sourcePlayer);
    if (ultimate.active && ultimate.type === 'dual') return 1.9;
    return 1;
}

function getEffectiveMoveMultiplier() {
    const guardMultiplier = player.isGuarding ? 0.5 : 1;
    return (Number.isFinite(player.stats.move) ? player.stats.move : 1) * guardMultiplier;
}

function getAttackMultiplier() {
    return Math.max(1, Number.isFinite(player.giantAttackMult) ? player.giantAttackMult : 1);
}

function getEffectiveAttackRange(weapon, stats, sourcePlayer) {
    const profile = getWeaponAttackProfile(weapon);
    const statRange = Number.isFinite(stats && stats.range) ? stats.range : 1.0;
    const giantScale = Math.max(1, Number.isFinite(sourcePlayer && sourcePlayer.giantScale) ? sourcePlayer.giantScale : 1);
    const ultimate = getUltimateState(sourcePlayer);
    const ultimateRangeMult = ultimate.active && ultimate.type === 'dual' ? 1.45 : 1;
    return profile.reach * statRange * (isRangedWeapon(weapon) ? 1 : giantScale) * ultimateRangeMult;
}

function getComboFinisher(weapon, comboStep) {
    return (comboStep === 3 && COMBO_FINISHER[normalizeWeapon(weapon)]) || { reach: 1, width: 1 };
}

// Reach of the swing in progress, including the combo finisher bonus.
function getStrikeRange(weapon, stats, sourcePlayer) {
    const finisher = getComboFinisher(weapon, sourcePlayer && sourcePlayer.comboStep);
    return getEffectiveAttackRange(weapon, stats, sourcePlayer) * finisher.reach;
}

function getVisualAttackRange(weapon, stats, sourcePlayer) {
    const profile = getWeaponAttackProfile(weapon);
    const statRange = Number.isFinite(stats && stats.range) ? stats.range : 1.0;
    const giantScale = Math.max(1, Number.isFinite(sourcePlayer && sourcePlayer.giantScale) ? sourcePlayer.giantScale : 1);
    const ultimate = getUltimateState(sourcePlayer);
    const ultimateRangeMult = ultimate.active && ultimate.type === 'dual' ? 1.45 : 1;
    return profile.reach * statRange * (isRangedWeapon(weapon) ? 1 : giantScale) * ultimateRangeMult;
}

function getBowProjectileBonus(sourcePlayer) {
    return normalizeWeapon(sourcePlayer && sourcePlayer.weapon) === 'bow' && Number.isFinite(sourcePlayer && sourcePlayer.giantScale) && sourcePlayer.giantScale > 1 ? 2 : 0;
}

function getVisualScale() {
    return Math.max(1, Number.isFinite(player.giantScale) ? player.giantScale : 1);
}

function getUpgradeLevelLabel(type) {
    const counts = player.upgradeCounts || {};
    if (type === 'dmg') return `Lv.${(counts.dmg || 0) + 1}`;
    if (type === 'range') return `Lv.${(counts.range || 0) + 1}`;
    if (type === 'speed') return `Lv.${(counts.speed || 0) + 1}`;
    if (type === 'move') return `Lv.${(counts.move || 0) + 1}`;
    if (type === 'dodge') return `Lv.${(counts.dodge || 0) + 1}`;
    if (type === 'projectile') return `Lv.${(counts.projectile || 0) + 1}`;
    if (type === 'hp') return `Lv.${(counts.hp || 0) + 1}`;
    return 'Lv.1';
}

function updateCombatReadouts() {
    const rangeValue = document.getElementById('range-value');
    const attackSpeedValue = document.getElementById('attack-speed-value');
    const moveSpeedValue = document.getElementById('move-speed-value');
    const dodgeDistanceValue = document.getElementById('dodge-distance-value');
    const basicLabel = document.getElementById('damage-basic-label');
    const secondLabel = document.getElementById('damage-second-label');
    const heavyLabel = document.getElementById('damage-heavy-label');
    const basicRow = document.getElementById('damage-basic-row');
    const secondRow = document.getElementById('damage-second-row');
    const heavyRow = document.getElementById('damage-heavy-row');
    const rangeLabel = document.getElementById('range-label');
    if (!rangeValue || !attackSpeedValue || !moveSpeedValue || !dodgeDistanceValue || !basicLabel || !secondLabel || !heavyLabel || !basicRow || !secondRow || !heavyRow || !rangeLabel) return;

    player.stats = normalizeStats(player.stats);
    const isBow = normalizeWeapon(player.weapon) === 'bow';
    basicRow.style.display = '';
    secondRow.style.display = isBow ? 'none' : '';
    heavyRow.style.display = isBow ? 'none' : '';
    basicLabel.textContent = isBow ? '공격력' : '1타';
    secondLabel.textContent = '2타';
    heavyLabel.textContent = '3타';
    if (isBow) {
        rangeLabel.textContent = '투사체수';
        rangeValue.textContent = String(getBowProjectileCount(player.stats));
    } else {
        rangeLabel.textContent = '사거리';
        rangeValue.textContent = formatPercentStat(player.stats.range);
    }
    attackSpeedValue.textContent = formatPercentStat(player.stats.speed);
    moveSpeedValue.textContent = String(Math.round(getEffectiveMoveMultiplier() * 100));
    dodgeDistanceValue.textContent = formatPercentStat(player.stats.dodge);
}

function updateXpBar() {
    const me = allPlayers[myId];
    const levelText = document.getElementById('level-text');
    const xpText = document.getElementById('xp-text');
    const xpFill = document.getElementById('xp-fill');
    if (!me || !levelText || !xpText || !xpFill) return;
    const xp = Math.max(0, Math.floor(me.xp || 0));
    const xpToNext = Math.max(1, Math.floor(me.xpToNext || 1));
    levelText.textContent = `Lv.${me.level || 1}`;
    xpText.textContent = `${xp}/${xpToNext}`;
    xpFill.style.width = `${Math.min(100, (xp / xpToNext) * 100)}%`;
    const name = document.getElementById('hud-name');
    if (name) name.textContent = me.name || 'Hunter';
}

function updateHUD() {
    const hpText = document.getElementById('hp-text');
    const hpFill = document.getElementById('hp-fill');
    const basicDamage = document.getElementById('damage-basic');
    const secondDamage = document.getElementById('damage-second');
    const heavyDamage = document.getElementById('damage-heavy');
    if (!hpText || !hpFill || !basicDamage || !secondDamage || !heavyDamage) return;

    const maxHp = getMaxHpFromStats(player.stats);
    const hp = Math.max(0, Math.ceil(player.hp || 0));
    hpText.textContent = `${hp}/${maxHp}`;
    hpFill.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
    document.getElementById('hud')?.classList.toggle('hp-low', hp / maxHp <= 0.3);
    updateXpBar();

    player.stats = normalizeStats(player.stats);
    const dmgScale = Number.isFinite(player.stats.dmg) ? player.stats.dmg : 1;
    const isBow = normalizeWeapon(player.weapon) === 'bow';
    const isStaff = normalizeWeapon(player.weapon) === 'staff';
    basicDamage.textContent = formatDamage((isBow ? 14 : (isStaff ? STAFF_ORB_DAMAGE : 10)) * dmgScale);
    secondDamage.textContent = formatDamage((isStaff ? STAFF_ORB_DAMAGE : 20) * dmgScale);
    heavyDamage.textContent = formatDamage((isStaff ? STAFF_ORB_FINISHER_DAMAGE : 35) * dmgScale);
    updateCombatReadouts();
}

function updateCooldownButton(id, remaining, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    const progress = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
    el.style.setProperty('--cooldown-progress', progress.toFixed(3));
    el.classList.toggle('cooling', remaining > 0);
}

function updateCooldownUI() {
    updateCooldownButton('btn-dodge', player.dodgeCooldown, 1.0);
    updateCooldownButton('btn-guard', player.guardCooldown, 1.0);
    updateCooldownButton('btn-wire', player.wireCooldown, SKILL_PRESETS[normalizeSkill(player.skill || selectedSkill)]?.cooldown || 1.0);
    const weapon = normalizeWeapon(player.weapon);
    updateCooldownButton('btn-ultimate', getUltimateCooldownRemaining(player), getUltimateCooldownSec(player));
}
