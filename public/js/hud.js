function updateLeaderboard() {
    const list = document.getElementById('score-list'); if(!list) return; list.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'score-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['이름', '킬', '데스'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    Object.values(allPlayers).sort((a,b) => b.kills - a.kills).forEach(p => {
        const lvlTxt = "Lv." + (p.level || 1);
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const nameWrap = document.createElement('span');
        nameWrap.className = 'name-cell';
        const badge = document.createElement('span');
        badge.className = 'level-badge';
        badge.textContent = lvlTxt;
        const nameText = document.createElement('span');
        nameText.className = 'name-text';
        nameText.textContent = p.name || 'Hunter';
        nameWrap.appendChild(badge);
        nameWrap.appendChild(nameText);
        nameCell.appendChild(nameWrap);
        const killsCell = document.createElement('td');
        killsCell.textContent = p.kills || 0;
        const deathsCell = document.createElement('td');
        deathsCell.textContent = p.deaths || 0;
        row.appendChild(nameCell);
        row.appendChild(killsCell);
        row.appendChild(deathsCell);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    list.appendChild(table);
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
    return weapon === 'hammer' ? 'hammer' : (weapon === 'spear' ? 'spear' : (weapon === 'dual' ? 'dual' : (weapon === 'bow' ? 'bow' : 'sword')));
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
    return profile.reach * statRange * (normalizeWeapon(weapon) === 'bow' ? 1 : giantScale) * ultimateRangeMult;
}

function getVisualAttackRange(weapon, stats, sourcePlayer) {
    const profile = getWeaponAttackProfile(weapon);
    const statRange = Number.isFinite(stats && stats.range) ? stats.range : 1.0;
    const giantScale = Math.max(1, Number.isFinite(sourcePlayer && sourcePlayer.giantScale) ? sourcePlayer.giantScale : 1);
    const ultimate = getUltimateState(sourcePlayer);
    const ultimateRangeMult = ultimate.active && ultimate.type === 'dual' ? 1.45 : 1;
    return profile.reach * statRange * (normalizeWeapon(weapon) === 'bow' ? 1 : giantScale) * ultimateRangeMult;
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
    updateXpBar();

    player.stats = normalizeStats(player.stats);
    const dmgScale = Number.isFinite(player.stats.dmg) ? player.stats.dmg : 1;
    const isBow = normalizeWeapon(player.weapon) === 'bow';
    basicDamage.textContent = formatDamage((isBow ? 11 : 10) * dmgScale);
    secondDamage.textContent = formatDamage(20 * dmgScale);
    heavyDamage.textContent = formatDamage(35 * dmgScale);
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
    updateCooldownButton('btn-ultimate', getUltimateCooldownRemaining(player), ULTIMATE_PRESETS[weapon]?.cooldown || 1.0);
}
