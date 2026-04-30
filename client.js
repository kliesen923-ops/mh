
const socket = window.io ? io() : { on() {}, emit() {}, id: null };
const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 640;
const VIEW_Y_SCALE = 0.7;
const WEAPON_PRESETS = {
    sword: { label: '한손검', stats: { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 } },
    hammer: { label: '망치', stats: { dmg: 1.8, range: 0.72, speed: 0.58, move: 0.88, dodge: 1.0, projectile: 1.0, hp: 115 } },
    spear: { label: '창', stats: { dmg: 1.24, range: 1.34, speed: 0.9, move: 0.96, dodge: 1.0, projectile: 1.0, hp: 95 } },
    dual: { label: '쌍검', stats: { dmg: 0.82, range: 0.82, speed: 1.45, move: 1.02, dodge: 1.0, projectile: 1.0, hp: 92 } },
    bow: { label: '활', stats: { dmg: 1.2, range: 1.0, speed: 0.84, move: 0.98, dodge: 1.0, projectile: 1.0, hp: 90 } },
};
const ATTACK_PROFILES = {
    sword: { reach: 85, arc: Math.PI * 0.65, lineWidth: 20 },
    hammer: { reach: 78, arc: Math.PI * 0.42, lineWidth: 22 },
    spear: { reach: 126, arc: Math.PI * 0.14, lineWidth: 24 },
    dual: { reach: 72, arc: Math.PI * 0.72, lineWidth: 18 },
    bow: { reach: 560, arc: Math.PI * 0.08, lineWidth: 8 },
};
const SKILL_PRESETS = {
    wire: { label: '땡겨', cooldown: 2.0 },
    ash: { label: '애쉬궁', cooldown: 2.0 },
    gear: { label: '입체기동', cooldown: 3.0 },
};
const ULTIMATE_PRESETS = {
    sword: { cooldown: 11.0, duration: 1.2 },
    hammer: { cooldown: 13.0, duration: 0.7 },
    spear: { cooldown: 15.0, duration: 2.2 },
    bow: { cooldown: 14.0, duration: 0.8 },
    dual: { cooldown: 14.0, duration: 4.0 },
};
const DUAL_RUSH_WINDUP_SEC = 0.18;
const DUAL_RUSH_SLASH_INTERVAL_SEC = 0.025;
const DUAL_RUSH_SLASH_COUNT = 10;
const GUARD_DURATION_SEC = 0.5;
const JUST_GUARD_WINDOW_SEC = 0.1;

let gameState = 'TITLE', isChatting = false, isUpgrading = false, myId = null, allPlayers = {};
let pendingUpgrades = 0, upgradeTimerInterval = null, upgradeTimeLeft = 9;
let pendingAuth = null;
let currentSession = null;
const isLocalAuthBypass = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
let selectedWeapon = 'sword';
let selectedSkill = 'wire';
let combatEffects = [];
let ashProjectiles = [];
let bowProjectiles = [];
let dragonProjectiles = [];
let healingCrosses = [];
let healingTexts = [];
let giantPotions = [];
const keys = {};
function getMaxHpFromStats(stats) {
    return Math.max(1, Math.floor(Number.isFinite(stats && stats.hp) ? stats.hp : 100));
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
        extra: 0,
    };
}

const player = {
    x: 400, y: 300, hp: 100, maxHp: 100, angle: 0, level: 1,
    weapon: 'sword',
    isGuarding: false, guardCooldown: 0, guardActiveTimer: 0,
    isAttacking: false, isStunned: false, comboStep: 0, attackPhase: 0, attackTimer: 0, aAngle: 0,
    bowShotFired: false,
    isDodging: false, dTimer: 0, dDX: 0, dDY: 0, dodgeCooldown: 0,
    wire: { active: false, kind: 'wire', tx: 0, ty: 0, progress: 0, maxDistance: 500 }, wireCooldown: 0,
    moveDir: { x: 0, y: 0 }, animTime: 0,
    stats: { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 },
    upgradeCounts: { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 },
    giantScale: 1,
    giantAttackMult: 1,
    giantActive: false,
    giantEndsAt: 0,
    giantRecoveryEndsAt: 0,
    gearRush: createDefaultGearRush(),
    ultimate: createDefaultUltimate(),
    skill: 'wire'
};

function resize() {
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    const scale = Math.max(0.1, Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT, 1));
    document.documentElement.style.setProperty('--game-ui-scale', String(scale));
}
window.addEventListener('resize', resize); resize();

socket.on('connect', () => { myId = socket.id; });
socket.on('currentPlayers', (data) => { 
    allPlayers = data; 
    if(data[myId]) { player.x = data[myId].x; player.y = data[myId].y; player.hp = data[myId].hp; player.weapon = normalizeWeapon(data[myId].weapon); player.stats = normalizeStats(data[myId].stats); player.maxHp = getMaxHpFromStats(player.stats); player.level = data[myId].level; player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 }, data[myId].upgradeCounts || {}); player.giantScale = Number.isFinite(data[myId].giantScale) ? data[myId].giantScale : 1; player.giantAttackMult = Number.isFinite(data[myId].giantAttackMult) ? data[myId].giantAttackMult : 1; player.giantActive = Boolean(data[myId].giantActive); player.giantEndsAt = Number.isFinite(data[myId].giantEndsAt) ? data[myId].giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(data[myId].giantRecoveryEndsAt) ? data[myId].giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), data[myId].gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), data[myId].ultimate || {}); player.skill = normalizeSkill(data[myId].skill); updateSkillButtonLabel(); updateHUD(); }
    updateLeaderboard(); 
});
socket.on('newPlayer', (p) => { allPlayers[p.id] = p; updateLeaderboard(); });
socket.on('playerMoved', (p) => { 
    if(allPlayers[p.id]) { 
        allPlayers[p.id].x = p.x; allPlayers[p.id].y = p.y; allPlayers[p.id].angle = p.angle; 
        if(p.id === myId && player.isStunned) { player.x = p.x; player.y = p.y; }
    } 
});
socket.on('playerActionUpdate', (data) => {
    if (!data || !data.action) return;
    if (allPlayers[data.id]) Object.assign(allPlayers[data.id], data.action);
    if (data.id === myId && data.action.ultimate) {
        player.ultimate = Object.assign(createDefaultUltimate(), data.action.ultimate || {});
    }
});
socket.on('playerStunned', (data) => {
    if(allPlayers[data.id]) {
        allPlayers[data.id].isStunned = data.stunned;
        allPlayers[data.id].stunEndsAt = data.stunned ? (data.stunEndsAt || (Date.now() + (data.stunMs || 0))) : 0;
    }
    if(data.id === myId) {
        player.isStunned = data.stunned;
        player.stunEndsAt = data.stunned ? (data.stunEndsAt || (Date.now() + (data.stunMs || 0))) : 0;
    }
});

socket.on('levelUp', (data) => {
    player.level = data.newLevel;
    pendingUpgrades += data.count;
    if (!isUpgrading) showUpgradeUI();
});

function showUpgradeUI() {
    isUpgrading = true;
    const upgradeOverlay = document.getElementById('overlay-upgrade');
    upgradeOverlay.classList.remove('hidden');
    upgradeOverlay.querySelector('h1').innerText = `LEVEL ${player.level} UP!`;
    document.querySelectorAll('[data-upgrade-level]').forEach((node) => {
        const type = node.getAttribute('data-upgrade-level');
        node.textContent = getUpgradeLevelLabel(type);
    });
    const rangeCard = document.getElementById('upgrade-range-card');
    const rangeTitle = document.getElementById('upgrade-range-title');
    const rangeDesc = document.getElementById('upgrade-range-desc');
    const isBow = normalizeWeapon(player.weapon) === 'bow';
    if (rangeCard && rangeTitle && rangeDesc) {
        rangeCard.setAttribute('onclick', isBow ? "selectUpgrade('projectile')" : "selectUpgrade('range')");
        rangeTitle.textContent = isBow ? '투사체 증가' : '사거리 강화';
        rangeDesc.innerHTML = isBow ? '활의 화살이<br><b>부채꼴 멀티샷</b>으로 늘어납니다.' : '공격의 도달 범위가 <br><b>15%</b> 증가합니다.';
    }
    
    Object.keys(keys).forEach(k => keys[k] = false);
    upgradeTimeLeft = 9;
    const timerEl = document.getElementById('upgrade-timer');
    timerEl.innerText = '업그레이드 시간: ' + upgradeTimeLeft + '초';
    if (upgradeTimerInterval) clearInterval(upgradeTimerInterval);
    upgradeTimerInterval = setInterval(() => {
        upgradeTimeLeft--;
        timerEl.innerText = '업그레이드 시간: ' + upgradeTimeLeft + '초';
        if (upgradeTimeLeft <= 0) { clearInterval(upgradeTimerInterval); selectUpgrade('dmg'); }
    }, 1000);
}

socket.on('upgradeApplied', () => {
    if (upgradeTimerInterval) clearInterval(upgradeTimerInterval);
    pendingUpgrades--;
    if (pendingUpgrades > 0) setTimeout(showUpgradeUI, 200);
    else { isUpgrading = false; document.getElementById('overlay-upgrade').classList.add('hidden'); }
});

socket.on('statsUpdate', (data) => { 
    allPlayers = data; 
    if(data[myId]) { player.hp = data[myId].hp; player.weapon = normalizeWeapon(data[myId].weapon); player.stats = normalizeStats(data[myId].stats); player.maxHp = getMaxHpFromStats(player.stats); player.level = data[myId].level; player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 }, data[myId].upgradeCounts || {}); player.giantScale = Number.isFinite(data[myId].giantScale) ? data[myId].giantScale : 1; player.giantAttackMult = Number.isFinite(data[myId].giantAttackMult) ? data[myId].giantAttackMult : 1; player.giantActive = Boolean(data[myId].giantActive); player.giantEndsAt = Number.isFinite(data[myId].giantEndsAt) ? data[myId].giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(data[myId].giantRecoveryEndsAt) ? data[myId].giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), data[myId].gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), data[myId].ultimate || {}); player.skill = normalizeSkill(data[myId].skill); updateSkillButtonLabel(); updateHUD(); }
    updateLeaderboard(); 
});

socket.on('playerRespawn', (p) => { 
    allPlayers[p.id] = p; 
    if(p.id === myId) { 
        player.x = p.x; player.y = p.y; player.hp = p.hp; 
        player.isStunned = false; player.isGuarding = false; 
        player.level = p.level; player.weapon = normalizeWeapon(p.weapon); player.stats = normalizeStats(p.stats); player.maxHp = getMaxHpFromStats(player.stats); player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 }, p.upgradeCounts || {}); player.giantScale = Number.isFinite(p.giantScale) ? p.giantScale : 1; player.giantAttackMult = Number.isFinite(p.giantAttackMult) ? p.giantAttackMult : 1; player.giantActive = Boolean(p.giantActive); player.giantEndsAt = Number.isFinite(p.giantEndsAt) ? p.giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(p.giantRecoveryEndsAt) ? p.giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), p.gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), p.ultimate || {}); player.skill = normalizeSkill(p.skill); updateSkillButtonLabel();
        updateHUD();
    } 
    updateLeaderboard(); 
});

socket.on('playerDisconnected', (id) => { delete allPlayers[id]; updateLeaderboard(); });
socket.on('playerDied', (data) => {
    if (data && data.victimId === myId) {
        gameState = 'TITLE';
        showWeaponPanel(currentSession || { id: localStorage.getItem('mh_last_login_id') || '', nickname: player.name || 'Hunter' });
        setWeaponError('사망했습니다. 무기를 다시 선택하세요.');
    }
});
socket.on('skillChanged', (data) => {
    if (data && data.id === myId) {
        player.skill = normalizeSkill(data.skill);
        updateSkillButtonLabel();
    }
});
socket.on('combatEffect', (effect) => {
    if (!effect) return;
    combatEffects.push({
        x: Number(effect.x) || 0,
        y: Number(effect.y) || 0,
        angle: Number(effect.angle) || 0,
        weapon: normalizeWeapon(effect.weapon),
        life: 0.22,
        maxLife: 0.22,
    });
});
socket.on('healingCrossUpdate', (data) => {
    healingCrosses = Array.isArray(data) ? data : [];
});
socket.on('giantPotionUpdate', (data) => {
    giantPotions = Array.isArray(data) ? data : [];
});
socket.on('healFloatingText', (data) => {
    if (!data || !data.playerId) return;
    const amount = Math.max(0, Math.floor(Number(data.amount) || 0));
    if (amount <= 0) return;
    healingTexts.push({
        playerId: String(data.playerId),
        text: `+${amount}`,
        life: 1.0,
        maxLife: 1.0,
    });
});
socket.on('ashProjectile', (effect) => {
    if (!effect) return;
    ashProjectiles.push({
        id: String(effect.projectileId || `${effect.originId || 'ash'}:${Date.now()}`),
        startX: Number(effect.startX) || 0,
        startY: Number(effect.startY) || 0,
        endX: Number(effect.endX) || 0,
        endY: Number(effect.endY) || 0,
        angle: Math.atan2((Number(effect.endY) || 0) - (Number(effect.startY) || 0), (Number(effect.endX) || 0) - (Number(effect.startX) || 0)),
        duration: Math.max(0.14, Math.min(0.7, (Number(effect.duration) || 400) / 1000)),
        progress: 0,
        reflected: Boolean(effect.reflected),
    });
});
socket.on('bowProjectile', (effect) => {
    if (!effect) return;
    const projectile = {
        id: String(effect.projectileId || `${effect.originId || 'bow'}:${Date.now()}`),
        originId: String(effect.originId || ''),
        startX: Number(effect.startX) || 0,
        startY: Number(effect.startY) || 0,
        endX: Number(effect.endX) || 0,
        endY: Number(effect.endY) || 0,
        angle: Math.atan2((Number(effect.endY) || 0) - (Number(effect.startY) || 0), (Number(effect.endX) || 0) - (Number(effect.startX) || 0)),
        duration: Math.max(0.18, Math.min(0.8, (Number(effect.duration) || 400) / 1000)),
        progress: 0,
        reflected: Boolean(effect.reflected),
    };
    const existingIndex = bowProjectiles.findIndex((p) => p.id === projectile.id);
    if (existingIndex >= 0) bowProjectiles[existingIndex] = projectile;
    else bowProjectiles.push(projectile);
});
socket.on('dragonProjectile', (effect) => {
    if (!effect) return;
    dragonProjectiles.push({
        id: String(effect.projectileId || `${effect.originId || 'dragon'}:${Date.now()}`),
        originId: String(effect.originId || ''),
        startX: Number(effect.startX) || 0,
        startY: Number(effect.startY) || 0,
        endX: Number(effect.endX) || 0,
        endY: Number(effect.endY) || 0,
        angle: Number(effect.angle) || 0,
        progress: 0,
        duration: Math.max(220, Number(effect.duration) || 600),
        reflected: Boolean(effect.reflected),
    });
});
socket.on('bowProjectileResolved', (effect) => {
    if (!effect) return;
    const resolvedId = String(effect.projectileId || '');
    bowProjectiles = bowProjectiles.filter((p) => p.id !== resolvedId);
});
socket.on('chatMessage', (data) => {
    const msgEl = document.createElement('div');
    const nameEl = document.createElement('b');
    nameEl.style.color = '#f1c40f';
    nameEl.textContent = `${String(data.id).substring(0,4)}:`;
    msgEl.appendChild(nameEl);
    msgEl.appendChild(document.createTextNode(` ${String(data.message)}`));
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
});

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
}

function updateCombatEffects(dt) {
    combatEffects = combatEffects.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
    });
}

function updateHealingTexts(dt) {
    healingTexts = healingTexts.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
    });
}

function updateAshProjectiles(dt) {
    ashProjectiles = ashProjectiles.filter((effect) => {
        effect.progress = Math.min(1, (effect.progress || 0) + dt / Math.max(0.001, effect.duration || 0.35));
        return effect.progress < 1;
    });
}

function updateBowProjectiles(dt) {
    bowProjectiles = bowProjectiles.filter((effect) => {
        const prevProgress = effect.progress || 0;
        effect.progress = Math.min(1, prevProgress + dt / Math.max(0.001, effect.duration || 0.4));
        const tipX = effect.startX + (effect.endX - effect.startX) * effect.progress;
        const tipY = effect.startY + (effect.endY - effect.startY) * effect.progress;
        const prevTipX = effect.startX + (effect.endX - effect.startX) * prevProgress;
        const prevTipY = effect.startY + (effect.endY - effect.startY) * prevProgress;
        if (effect.originId === myId && !effect.hitSent) {
            const hitId = findBowHitTarget(prevTipX, prevTipY, tipX, tipY, effect);
            if (hitId) {
                effect.hitSent = true;
                socket.emit('bowArrowHit', {
                    projectileId: effect.id,
                    targetId: hitId,
                    startX: effect.startX,
                    startY: effect.startY,
                    endX: tipX,
                    endY: tipY,
                    angle: effect.angle,
                    maxDistance: Math.max(1, Math.hypot(effect.endX - effect.startX, effect.endY - effect.startY)),
                    reflected: effect.reflected,
                });
                return false;
            }
        }
        return effect.progress < 1;
    });
}

function updateDragonProjectiles(dt) {
    dragonProjectiles = dragonProjectiles.filter((effect) => {
        effect.progress = Math.min(1, (effect.progress || 0) + dt / Math.max(0.001, (effect.duration || 0.6) / 1000));
        return effect.progress < 1;
    });
}

function updateGearRush(dt) {
    if (!player.gearRush || !player.gearRush.active) return;
    const rush = player.gearRush;
    const now = Date.now();
    const duration = Math.max(0.08, Number(rush.duration) || 0.24);
    const windupMs = rush.mode === 'dualRush' ? Math.round(DUAL_RUSH_WINDUP_SEC * 1000) : 0;
    const effectiveElapsed = Math.max(0, (now - Number(rush.startTime || now) - windupMs) / 1000);
    const progress = Math.max(0, Math.min(1, effectiveElapsed / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const startX = Number.isFinite(rush.startX) ? rush.startX : player.x;
    const startY = Number.isFinite(rush.startY) ? rush.startY : player.y;
    const tx = Number.isFinite(rush.tx) ? rush.tx : player.x;
    const ty = Number.isFinite(rush.ty) ? rush.ty : player.y;
    const prevX = player.x;
    const prevY = player.y;
    if (rush.mode === 'dualRush' && now < Number(rush.pauseUntil || 0)) {
        player.animTime += dt * 12;
        player.moveDir = { x: 0, y: 0 };
        socket.emit('playerAction', {
            gearRush: {
                active: true,
                startX: rush.startX,
                startY: rush.startY,
                tx: rush.tx,
                ty: rush.ty,
                startTime: rush.startTime,
                duration: rush.duration,
                mode: rush.mode,
                comboId: rush.comboId,
                pauseUntil: rush.pauseUntil,
                slashIndex: rush.slashIndex,
                lastSlashAt: rush.lastSlashAt,
                startResolved: rush.startResolved,
            }
        });
        return;
    }
    player.x = startX + (tx - startX) * eased;
    player.y = startY + (ty - startY) * eased;
    player.angle = Math.atan2(ty - startY, tx - startX);
    player.animTime += dt * 12;
    player.moveDir = { x: 0, y: 0 };
    if (rush.mode === 'dualRush' && progress > 0 && rush.slashIndex < DUAL_RUSH_SLASH_COUNT) {
        const slashIntervalMs = Math.round(DUAL_RUSH_SLASH_INTERVAL_SEC * 1000);
        if (!rush.lastSlashAt || (now - rush.lastSlashAt) >= slashIntervalMs) {
            const slashIndex = rush.slashIndex++;
            rush.lastSlashAt = now;
            socket.emit('dualRushSlash', {
                comboId: rush.comboId,
                slashIndex,
                startX: prevX,
                startY: prevY,
                endX: player.x,
                endY: player.y,
                angle: player.angle,
                weapon: player.weapon,
            });
            if (rush.slashIndex >= DUAL_RUSH_SLASH_COUNT) {
                rush.mode = 'rush';
            }
        }
    }
    socket.emit('playerAction', {
        gearRush: {
            active: true,
            startX: rush.startX,
            startY: rush.startY,
            tx: rush.tx,
            ty: rush.ty,
            startTime: rush.startTime,
            duration: rush.duration,
            mode: rush.mode,
            comboId: rush.comboId,
            pauseUntil: rush.pauseUntil,
            slashIndex: rush.slashIndex,
            lastSlashAt: rush.lastSlashAt,
            startResolved: rush.startResolved,
        }
    });
    if (progress >= 1) {
        player.gearRush.active = false;
        socket.emit('playerAction', { gearRush: { active: false } });
    }
}

function findBowHitTarget(prevTipX, prevTipY, tipX, tipY, effect) {
    const candidates = [];
    for (const id of Object.keys(allPlayers)) {
        if (id === myId) continue;
        const target = allPlayers[id];
        if (!target || target.hp <= 0 || target.isUpgrading) continue;
        const distance = distToSegment({ x: prevTipX, y: prevTipY }, { x: tipX, y: tipY }, target);
        if (distance > 26) continue;
        const score = Math.hypot(target.x - effect.startX, target.y - effect.startY);
        candidates.push({ id, target, score });
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates.length ? candidates[0].id : null;
}

function selectUpgrade(type) {
    if (upgradeTimerInterval) clearInterval(upgradeTimerInterval);
    socket.emit('selectUpgrade', type);
}

function update(dt) {
    const canTickCooldowns = gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0;
    if (canTickCooldowns) {
        if(player.guardCooldown > 0) player.guardCooldown -= dt;
        if(player.dodgeCooldown > 0) player.dodgeCooldown -= dt;
        if(player.wireCooldown > 0) player.wireCooldown -= dt;
        updateCooldownUI();
    }
    if (gameState !== 'PLAYING' || isChatting || isUpgrading || player.hp <= 0 || player.isStunned) return;
    const prev = { x: player.x, y: player.y, angle: player.angle };
    let mx = 0, my = 0;
    if(keys['KeyW']) my -= 1; if(keys['KeyS']) my += 1; if(keys['KeyA']) mx -= 1; if(keys['KeyD']) mx += 1;
    if(player.moveDir.x !== 0 || player.moveDir.y !== 0) { mx = player.moveDir.x; my = player.moveDir.y; }

    if(player.gearRush && player.gearRush.active) {
        updateGearRush(dt);
    } else if(player.isDodging) {
        player.stats = normalizeStats(player.stats);
        const dodgeMultiplier = Number.isFinite(player.stats.dodge) ? player.stats.dodge : 1;
        player.x += player.dDX * 800 * dodgeMultiplier * dt; player.y += player.dDY * 800 * dodgeMultiplier * dt;
        player.dTimer -= dt; if(player.dTimer <= 0) { player.isDodging = false; socket.emit('playerAction', { isDodging: false }); }
    } else if(player.isAttacking) {
        if (normalizeWeapon(player.weapon) !== 'bow') {
            player.x += Math.cos(player.aAngle) * 150 * dt; player.y += Math.sin(player.aAngle) * 150 * dt;
        }
    } else if(mx !== 0 || my !== 0) {
        player.stats = normalizeStats(player.stats);
        const d = Math.hypot(mx, my), s = (player.isGuarding ? 175 : 350) * player.stats.move * dt;
        player.x += (mx/d) * s; player.y += (my/d) * s;
        if (aimMode !== 'mouse') player.angle = Math.atan2(my, mx);
        player.animTime += dt * 10;
    } else player.animTime = 0;

    if(player.wire.active) {
        const wire = player.wire;
        const prevProgress = wire.progress || 0;
        const nextProgress = Math.min(1, (wire.progress || 0) + dt * (wire.kind === 'ash' ? 3.6 : 3.2));
        wire.progress = nextProgress;
        const prevTipX = player.x + (wire.tx - player.x) * prevProgress;
        const prevTipY = player.y + (wire.ty - player.y) * prevProgress;
        const tipX = player.x + (wire.tx - player.x) * wire.progress;
        const tipY = player.y + (wire.ty - player.y) * wire.progress;
        const hitId = findSecondaryHitTarget(tipX, tipY, prevTipX, prevTipY, wire.kind);
        if (hitId) {
            if (wire.kind === 'ash') resolveAshHit(hitId);
            else resolveWireHit(hitId);
        } else if (wire.progress >= 1) {
            if (wire.kind === 'ash') resolveAshHit();
            else resolveWireHit();
        } else {
            socket.emit('playerAction', { wire: { active: true, kind: wire.kind || 'wire', tx: wire.tx, ty: wire.ty, progress: wire.progress, maxDistance: wire.maxDistance || 500 } });
        }
    }

    player.x = Math.max(25, Math.min(canvas.width - 25, player.x));
    player.y = Math.max(25, Math.min(canvas.height - 25, player.y));
    if (player.isGuarding) { player.guardActiveTimer += dt; if (player.guardActiveTimer >= GUARD_DURATION_SEC) releaseGuard(); }
    
    updateCombatReadouts();
    updateCombatEffects(dt);
    updateAshProjectiles(dt);
    updateBowProjectiles(dt);
    updateDragonProjectiles(dt);

    if(allPlayers[myId]) {
        Object.assign(allPlayers[myId], {
            x: player.x, y: player.y, angle: player.angle, animTime: player.animTime, 
            isGuarding: player.isGuarding, guardActiveTimer: player.guardActiveTimer,
            isAttacking: player.isAttacking, isDodging: player.isDodging,
            comboStep: player.comboStep, attackPhase: player.attackPhase, aAngle: player.aAngle,
            gearRush: {
                active: player.gearRush.active,
                startX: player.gearRush.startX,
                startY: player.gearRush.startY,
                tx: player.gearRush.tx,
                ty: player.gearRush.ty,
                startTime: player.gearRush.startTime,
                duration: player.gearRush.duration,
                mode: player.gearRush.mode,
                comboId: player.gearRush.comboId,
                pauseUntil: player.gearRush.pauseUntil,
                slashIndex: player.gearRush.slashIndex,
                lastSlashAt: player.gearRush.lastSlashAt,
                startResolved: player.gearRush.startResolved,
            },
            wire: { active: player.wire.active, kind: player.wire.kind, tx: player.wire.tx, ty: player.wire.ty, progress: player.wire.progress, maxDistance: player.wire.maxDistance },
            level: player.level, weapon: player.weapon, skill: player.skill, stats: player.stats, isUpgrading: isUpgrading
        });
    }
    if(prev.x !== player.x || prev.y !== player.y || prev.angle !== player.angle) socket.emit('playerMovement', { x: player.x, y: player.y, angle: player.angle });
    if(player.isAttacking) updateAttack(dt);
    updateHealingTexts(dt);
}

function updateAttack(dt) {
    player.attackTimer -= dt;
    const speedMult = getUltimateSpeedMultiplier(player);
    if(player.attackPhase === 1 && player.attackTimer <= 0) {
        player.attackPhase = 2;
        if (normalizeWeapon(player.weapon) === 'bow') {
            player.attackTimer = 0.05 / (player.stats.speed * speedMult);
            socket.emit('playerAction', { attackPhase: 2 });
            if (!player.bowShotFired) {
                startBowShot();
                player.bowShotFired = true;
            }
        } else {
            player.attackTimer = 0.08 / (player.stats.speed * speedMult);
            socket.emit('playerAction', { attackPhase: 2 });
            const attackRange = getEffectiveAttackRange(player.weapon, player.stats, player);
            Object.keys(allPlayers).forEach(id => {
                if(id !== myId && allPlayers[id].hp > 0 && isTargetInAttackArc(allPlayers[id], attackRange)) socket.emit('playerHitTarget', id);
            });
        }
    } else if(player.attackPhase === 2 && player.attackTimer <= 0) { player.attackPhase = 3; player.attackTimer = 0.15 / (player.stats.speed * speedMult); socket.emit('playerAction', { attackPhase: 3 }); }
    else if(player.attackPhase === 3 && player.attackTimer <= 0) { endAttack(); }
}

function isTargetInAttackArc(target, range) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const profile = getWeaponAttackProfile(player.weapon);
    if (Math.hypot(dx, dy) > range) return false;
    const attackAngle = player.aAngle || player.angle;
    if (normalizeWeapon(player.weapon) === 'spear') {
        const endX = player.x + Math.cos(attackAngle) * range;
        const endY = player.y + Math.sin(attackAngle) * range;
        return distToSegment({ x: player.x, y: player.y }, { x: endX, y: endY }, target) <= profile.lineWidth;
    }
    if (player.comboStep === 3) return true;
    const targetAngle = Math.atan2(dy, dx);
    const diff = getAngleDiff(attackAngle, targetAngle);
    return diff <= profile.arc;
}

function getAngleDiff(a1, a2) {
    let diff = a1 - a2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff);
}

function startGuard() { if (player.hp > 0 && !player.isStunned && player.guardCooldown <= 0) { player.isGuarding = true; player.guardActiveTimer = 0; socket.emit('playerAction', { isGuarding: true, guardStartTime: Date.now() }); } }
function releaseGuard() { if (player.isGuarding) { player.isGuarding = false; player.guardCooldown = 1.0; socket.emit('playerAction', { isGuarding: false }); } }
function releaseGuardForAction() { if (player.isGuarding) releaseGuard(); }
function startDodge() { if (player.hp <= 0 || player.isStunned || player.isDodging || player.isAttacking || player.dodgeCooldown > 0 || (player.gearRush && player.gearRush.active)) { releaseGuardForAction(); return; } releaseGuardForAction(); player.stats = normalizeStats(player.stats); player.isDodging = true; player.dTimer = 0.2; player.dDX = Math.cos(player.angle); player.dDY = Math.sin(player.angle); player.dodgeCooldown = 1.0; socket.emit('playerAction', { isDodging: true }); }
function canStartAttack() { return gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned; }
function beginAttack() {
    releaseGuardForAction();
    if (!canStartAttack() || player.isAttacking) return;
    if (player.gearRush && player.gearRush.active) {
        return;
    }
    player.isAttacking = true;
    player.comboStep = (player.comboStep % 3) + 1;
    player.attackPhase = 1;
    player.attackTimer = 0.12 / player.stats.speed;
    player.aAngle = player.angle;
    player.bowShotFired = false;
    socket.emit('playerAction', { isAttacking: true, comboStep: player.comboStep, attackPhase: 1, aAngle: player.aAngle });
}
function canUseUltimate() {
    return gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned;
}
function getUltimateCooldownRemaining(sourcePlayer) {
    const ultimate = getUltimateState(sourcePlayer);
    return Math.max(0, (ultimate.cooldownEndsAt || 0) - Date.now());
}
function useUltimate() {
    if (!canUseUltimate()) return;
    const weapon = normalizeWeapon(player.weapon);
    const config = ULTIMATE_PRESETS[weapon];
    if (!config) return;
    if (getUltimateCooldownRemaining(player) > 0) return;
    player.ultimate = {
        active: true,
        type: weapon,
        startAt: Date.now(),
        endsAt: Date.now() + Math.round(config.duration * 1000),
        cooldownEndsAt: Date.now() + Math.round(config.cooldown * 1000),
        radius: weapon === 'spear' ? 180 : 0,
        extra: 0,
    };
    updateHUD();
    socket.emit('useUltimate', { weapon });
}
function isAttackHeld() { return attackHoldSources.size > 0; }
function endAttack() {
    if (!player.isAttacking && player.attackPhase === 0) return;
    player.isAttacking = false;
    player.attackPhase = 0;
    player.bowShotFired = false;
    socket.emit('playerAction', { isAttacking: false, attackPhase: 0 });
    if (isAttackHeld()) beginAttack();
}
function triggerDualRushSlash() {
    const rush = player.gearRush;
    if (!rush || !rush.active || normalizeWeapon(player.weapon) !== 'dual') return;
    if (rush.mode === 'dualRush') return;
    const now = Date.now();
    rush.mode = 'dualRush';
    rush.comboId = `${myId || 'dual'}:${now}:${Math.random().toString(16).slice(2, 8)}`;
    rush.pauseUntil = now + Math.round(DUAL_RUSH_WINDUP_SEC * 1000);
    rush.slashIndex = 0;
    rush.lastSlashAt = 0;
    rush.startResolved = false;
    socket.emit('playerAction', {
        gearRush: {
            active: true,
            startX: rush.startX,
            startY: rush.startY,
            tx: rush.tx,
            ty: rush.ty,
            startTime: rush.startTime,
            duration: rush.duration,
            mode: rush.mode,
            comboId: rush.comboId,
            pauseUntil: rush.pauseUntil,
            slashIndex: rush.slashIndex,
            lastSlashAt: rush.lastSlashAt,
            startResolved: rush.startResolved,
        }
    });
}
function startBowShot() {
    releaseGuardForAction();
    if(player.isDodging || player.hp <= 0 || player.isStunned) return;
    const angle = player.aAngle || player.angle;
    const attackRange = getEffectiveAttackRange(player.weapon, player.stats, player);
    const projectileMultiplier = Number.isFinite(player.stats.projectile) ? player.stats.projectile : 1;
    const giantBonus = getBowProjectileBonus(player);
    const totalShots = Math.max(1, 1 + Math.max(0, Math.floor((projectileMultiplier - 0.999) / 0.2)) + giantBonus);
    const spreadStep = Math.min(0.24, Math.max(0.05, 0.05 + (totalShots - 1) * 0.035));
    const centerOffset = (totalShots - 1) / 2;
    for (let i = 0; i < totalShots; i++) {
        const offset = (i - centerOffset) * spreadStep;
        const shotAngle = angle + offset;
        const edge = {
            x: player.x + Math.cos(shotAngle) * attackRange,
            y: player.y + Math.sin(shotAngle) * attackRange,
        };
        const projectileId = `${myId || 'bow'}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}:${i}`;
        bowProjectiles.push({
            id: projectileId,
            originId: myId || '',
            startX: player.x,
            startY: player.y,
            endX: edge.x,
            endY: edge.y,
            angle: shotAngle,
            duration: Math.max(0.18, Math.min(0.8, Math.max(1, Math.hypot(edge.x - player.x, edge.y - player.y)) * 0.9 / 1000)),
            progress: 0,
            reflected: false,
        });
        socket.emit('playerBowShot', {
            projectileId,
            startX: player.x,
            startY: player.y,
            endX: edge.x,
            endY: edge.y,
            angle: shotAngle,
            maxDistance: Math.max(1, Math.hypot(edge.x - player.x, edge.y - player.y)),
        });
    }
}
function startGearRush() {
    releaseGuardForAction();
    if (player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('gear');
    const angle = player.angle;
    const dashDistance = 320;
    const tx = Math.max(25, Math.min(canvas.width - 25, player.x + Math.cos(angle) * dashDistance));
    const ty = Math.max(25, Math.min(canvas.height - 25, player.y + Math.sin(angle) * dashDistance));
    player.gearRush = {
        active: true,
        startX: player.x,
        startY: player.y,
        tx,
        ty,
        startTime: Date.now(),
        duration: 0.24,
        mode: 'rush',
        comboId: '',
        pauseUntil: 0,
        slashIndex: 0,
        lastSlashAt: 0,
        startResolved: false,
    };
    socket.emit('playerAction', { gearRush: player.gearRush });
    if (normalizeWeapon(player.weapon) === 'dual') triggerDualRushSlash();
}
function startWireGrab() {
    releaseGuardForAction();
    if(player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('wire');
    const rawTx = player.x + Math.cos(player.angle) * 500;
    const rawTy = player.y + Math.sin(player.angle) * 500;
    const tx = Math.max(25, Math.min(canvas.width - 25, rawTx));
    const ty = Math.max(25, Math.min(canvas.height - 25, rawTy));
    player.wire.active = true;
    player.wire.kind = 'wire';
    player.wire.tx = tx;
    player.wire.ty = ty;
    player.wire.progress = 0;
    player.wire.maxDistance = Math.max(1, Math.hypot(tx - player.x, ty - player.y));
    socket.emit('playerAction', { wire: { active: true, kind: 'wire', tx: player.wire.tx, ty: player.wire.ty, progress: 0, maxDistance: player.wire.maxDistance } });
}
function startWire() {
    if (selectedSkill === 'ash') {
        startAshArrow();
        return;
    }
    if (selectedSkill === 'gear') {
        startGearRush();
        return;
    }
    startWireGrab();
}

function startAshArrow() {
    releaseGuardForAction();
    if(player.isAttacking || player.isDodging || player.hp <= 0 || player.isStunned || player.wireCooldown > 0 || (player.gearRush && player.gearRush.active)) return;
    player.wireCooldown = getSkillCooldown('ash');
    const edge = getRayCanvasEdge(player.x, player.y, player.angle);
    const tx = edge.x;
    const ty = edge.y;
    player.wire.active = true;
    player.wire.kind = 'ash';
    player.wire.tx = tx;
    player.wire.ty = ty;
    player.wire.progress = 0;
    player.wire.maxDistance = Math.max(1, Math.hypot(tx - player.x, ty - player.y));
    socket.emit('playerAction', { wire: { active: true, kind: 'ash', tx: player.wire.tx, ty: player.wire.ty, progress: 0, maxDistance: player.wire.maxDistance } });
}

function getRayCanvasEdge(originX, originY, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const candidates = [];
    const pushCandidate = (t) => {
        if (!Number.isFinite(t) || t <= 0) return;
        const x = originX + dx * t;
        const y = originY + dy * t;
        if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
            candidates.push({ t, x, y });
        }
    };
    if (Math.abs(dx) > 1e-6) {
        pushCandidate((0 - originX) / dx);
        pushCandidate((canvas.width - originX) / dx);
    }
    if (Math.abs(dy) > 1e-6) {
        pushCandidate((0 - originY) / dy);
        pushCandidate((canvas.height - originY) / dy);
    }
    if (!candidates.length) {
        return { x: originX, y: originY };
    }
    candidates.sort((a, b) => a.t - b.t);
    return candidates[candidates.length - 1];
}

function findSecondaryHitTarget(tipX, tipY, prevTipX, prevTipY, kind) {
    return Object.keys(allPlayers).find((id) => {
        if (id === myId) return false;
        const target = allPlayers[id];
        if (!target || target.hp <= 0) return false;
        const hitRadius = kind === 'ash' ? 28 : 35;
        if (Number.isFinite(prevTipX) && Number.isFinite(prevTipY)) {
            return distToSegment({ x: prevTipX, y: prevTipY }, { x: tipX, y: tipY }, target) <= hitRadius;
        }
        return Math.hypot(target.x - tipX, target.y - tipY) <= hitRadius;
    });
}

function resolveWireHit(forcedHitId) {
    if (!player.wire.active) return;
    const wire = player.wire;
    const progress = Math.max(0, Math.min(1, wire.progress || 1));
    const tipX = player.x + (wire.tx - player.x) * progress;
    const tipY = player.y + (wire.ty - player.y) * progress;
    const hitId = forcedHitId || findSecondaryHitTarget(tipX, tipY, null, null, 'wire');
    if (hitId) {
        socket.emit('wireGrabHit', { targetId: hitId, progress, tx: wire.tx, ty: wire.ty, maxDistance: wire.maxDistance || 500, kind: 'wire' });
        const target = allPlayers[hitId];
        wire.tx = target ? target.x : wire.tx;
        wire.ty = target ? target.y : wire.ty;
        wire.progress = progress;
        socket.emit('playerAction', { wire: { active: true, kind: 'wire', tx: wire.tx, ty: wire.ty, progress, maxDistance: wire.maxDistance || 500 } });
        setTimeout(() => {
            wire.active = false;
            socket.emit('playerAction', { wire: { active: false } });
        }, 300);
        return;
    }
    wire.active = false;
    socket.emit('playerAction', { wire: { active: false } });
}

function resolveAshHit(forcedHitId) {
    if (!player.wire.active) return;
    const wire = player.wire;
    const progress = Math.max(0, Math.min(1, wire.progress || 1));
    const tipX = player.x + (wire.tx - player.x) * progress;
    const tipY = player.y + (wire.ty - player.y) * progress;
    const hitId = forcedHitId || findSecondaryHitTarget(tipX, tipY, null, null, 'ash');
    if (hitId) {
        socket.emit('ashArrowHit', { targetId: hitId, progress, tx: wire.tx, ty: wire.ty, maxDistance: wire.maxDistance || 500, kind: 'ash' });
    }
    wire.active = false;
    socket.emit('playerAction', { wire: { active: false } });
}
function drawGearRush(p) {
    const rush = p.gearRush;
    if (!rush || !rush.active) return;
    const startX = Number.isFinite(rush.startX) ? rush.startX : p.x;
    const startY = Number.isFinite(rush.startY) ? rush.startY : p.y;
    const tx = Number.isFinite(rush.tx) ? rush.tx : p.x;
    const ty = Number.isFinite(rush.ty) ? rush.ty : p.y;
    const duration = Math.max(0.08, Number(rush.duration) || 0.24);
    const elapsed = Math.max(0, (Date.now() - Number(rush.startTime || Date.now())) / 1000);
    const progress = Math.max(0, Math.min(1, elapsed / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const tipX = startX + (tx - startX) * eased;
    const tipY = startY + (ty - startY) * eased;
    const angle = Math.atan2(ty - startY, tx - startX);
    const scale = Math.max(1, Number.isFinite(p.giantScale) ? p.giantScale : 1);
    const handSpread = 14 * scale;
    const handLift = 6 * scale;
    const leftStartX = startX + Math.cos(angle + Math.PI / 2) * handSpread;
    const leftStartY = startY + Math.sin(angle + Math.PI / 2) * handSpread - handLift;
    const rightStartX = startX + Math.cos(angle - Math.PI / 2) * handSpread;
    const rightStartY = startY + Math.sin(angle - Math.PI / 2) * handSpread - handLift;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 240, 140, 0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 220, 120, 0.45)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(leftStartX, leftStartY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightStartX, rightStartY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 245, 190, 0.95)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (rush.mode === 'dualRush' && Date.now() < Number(rush.pauseUntil || 0)) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 240, 120, 0.98)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('!', tipX, tipY - 28);
        ctx.fillText('!', tipX, tipY - 28);
        ctx.restore();
    }
    ctx.restore();
}
function distToSegment(p1, p2, p) { const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2); if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y); let t = Math.max(0, Math.min(1, ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2)); return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y))); }

window.addEventListener('keydown', e => {
    if (gameState === 'TITLE' && e.target && e.target.id === 'nickname-input') {
        if (e.code === 'Enter') startGame();
        return;
    }
    if (gameState !== 'PLAYING') return;
    if (isChatting && e.code !== 'Enter') return;
    if (isUpgrading) return;
    if (e.code === 'Enter') { if (!isChatting) { isChatting = true; document.getElementById('chat-container').classList.add('active'); document.getElementById('chat-input-container').style.display = 'block'; Object.keys(keys).forEach(k => keys[k] = false); setTimeout(() => document.getElementById('chat-input').focus(), 10); e.preventDefault(); } return; }
    if (player.hp <= 0 || player.isStunned) return;
    keys[e.code] = true; if(e.code === 'Space') startDodge(); if(e.code === 'ShiftLeft') startGuard();
    if(e.code === 'KeyR') useUltimate();
    if(e.code === 'KeyF') beginAttack();
});
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.code === 'Enter') { if (e.target.value.trim()) socket.emit('chatMessage', e.target.value); e.target.value = ''; e.target.blur(); isChatting = false; document.getElementById('chat-container').classList.remove('active'); document.getElementById('chat-input-container').style.display = 'none'; e.preventDefault(); e.stopPropagation(); } });
window.addEventListener('keyup', e => { keys[e.code] = false; if(e.code === 'ShiftLeft') releaseGuard(); });
const attackHoldSources = new Set();
window.addEventListener('mousedown', e => { if(canStartAttack()) { if(e.button === 0) { attackHoldSources.add('mouse'); beginAttack(); } if(e.button === 2) { e.preventDefault(); startWire(); } } });
window.addEventListener('mouseup', e => { if(e.button === 0) attackHoldSources.delete('mouse'); });
window.addEventListener('contextmenu', e => e.preventDefault());

function drawCharacter(p, color) {
    const { x, y, angle, animTime, isDodging, isGuarding, guardActiveTimer, isAttacking, isStunned, isUpgrading, comboStep, attackPhase, hp, name, aAngle, wire, stats, stunEndsAt } = p;
    const weapon = normalizeWeapon(p.weapon);
    const profile = getWeaponAttackProfile(weapon);
    const attackRange = getEffectiveAttackRange(weapon, stats, p);
    const visualAttackRange = getVisualAttackRange(weapon, stats, p);
    const weaponLength = Math.max(28, visualAttackRange - 28);
    const bodyScale = Math.max(1, Number.isFinite(p.giantScale) ? p.giantScale : 1);
    const ultimate = getUltimateState(p);
    const nameOffset = 65 * bodyScale;
    const hpOffset = 60 * bodyScale;
    const stunOffset = 82 * bodyScale;
    if (p.gearRush && p.gearRush.active) {
        drawGearRush(p);
    } else if(wire && wire.active) {
        const wireProgress = wire.progress ?? 1;
        const tipX = x + (wire.tx - x) * wireProgress;
        const tipY = y + (wire.ty - y) * wireProgress;
        const handAngle = Math.atan2(wire.ty - y, wire.tx - x);
        ctx.save();
        if (wire.kind === 'ash') {
            drawAshArrow(x, y, tipX, tipY, handAngle, wireProgress);
        } else {
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x, y);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = "#f1c40f";
            ctx.lineWidth = 2;
            ctx.stroke();
            drawWireHand(tipX, tipY, handAngle, wireProgress);
        }
        ctx.restore();
    }
    if (ultimate.active) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE);
        const pulse = 1 + Math.sin((Date.now() - (ultimate.startAt || 0)) / 80) * 0.04;
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 20;
        ctx.shadowColor = ultimate.type === 'dual' ? 'rgba(255, 40, 40, 0.9)' : 'rgba(255, 220, 120, 0.9)';
        ctx.strokeStyle = ultimate.type === 'dual' ? 'rgba(255, 60, 60, 0.95)' : 'rgba(255, 230, 150, 0.95)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    if(isGuarding) { const isPerfect = (guardActiveTimer < JUST_GUARD_WINDOW_SEC); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.arc(0, 0, 45, -Math.PI/3, Math.PI/3); ctx.strokeStyle = isPerfect ? "rgba(0, 200, 255, 0.9)" : "rgba(52, 152, 219, 0.3)"; ctx.lineWidth = isPerfect ? 8 : 3; ctx.stroke(); ctx.fillStyle = isPerfect ? "rgba(0, 200, 255, 0.2)" : "rgba(52, 152, 219, 0.05)"; ctx.lineTo(0,0); ctx.fill(); ctx.restore(); }
    ctx.save(); if (isDodging) ctx.globalAlpha = 0.2; if (isUpgrading) { ctx.globalAlpha = 0.5; ctx.shadowBlur = 15; ctx.shadowColor = "#fff"; } ctx.fillStyle = "white"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(name, x, y - nameOffset);
    const maxHp = getMaxHpFromStats(stats);
    const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    ctx.fillStyle = "#444"; ctx.fillRect(x-25, y-hpOffset, 50, 6);
    ctx.fillStyle = isStunned ? "#9b59b6" : (hpRatio > 0.3 ? "#2ecc71" : "#e74c3c"); ctx.fillRect(x-25, y-hpOffset, hpRatio*50, 6);
    ctx.save(); ctx.translate(x, y); ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.scale(bodyScale, bodyScale * VIEW_Y_SCALE); const leg = Math.sin(animTime || 0); ctx.fillStyle = "#34495e"; ctx.fillRect(-15, (leg>0?-8:8), 10, 25); ctx.fillRect(5, (leg<0?-8:8), 10, 25); ctx.rotate(angle); ctx.fillStyle = isStunned ? "#9b59b6" : color; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.fill(); ctx.fillStyle = "#ffdbac"; ctx.beginPath(); ctx.arc(0,-12,14,0,Math.PI*2); ctx.fill();
    ctx.save(); let sRot = 0.8;
    let spearPose = 0;
    let bowPose = 0;
    let dualPose = 0;
    if (weapon === 'spear') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = -0.16; spearPose = -1.35; }
            else if (attackPhase === 2) { sRot = 0.03; spearPose = 1.45; }
            else if (attackPhase === 3) { sRot = 0.08; spearPose = 0.35; }
        } else if (isGuarding) {
            sRot = 0.14;
            spearPose = -0.15;
        } else {
            sRot = 0.06;
        }
    } else if (weapon === 'bow') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = -0.26; bowPose = -1; }
            else if (attackPhase === 2) { sRot = 0.02; bowPose = 1; }
            else if (attackPhase === 3) { sRot = 0.09; bowPose = 0.3; }
        } else if (isGuarding) {
            sRot = 0.12;
            bowPose = -0.15;
        } else {
            sRot = 0.03;
        }
    } else if (weapon === 'dual') {
        if (isAttacking) {
            if (attackPhase === 1) { sRot = comboStep === 2 ? 1.08 : -1.08; dualPose = -1; }
            else if (attackPhase === 2) { sRot = comboStep === 2 ? -0.06 : 0.06; dualPose = 1.05; }
            else if (attackPhase === 3) { sRot = comboStep === 2 ? 0.24 : -0.24; dualPose = 0.22; }
        } else if (isGuarding) {
            sRot = 0.1;
            dualPose = -0.12;
        } else {
            sRot = 0.02;
        }
    } else if(isAttacking) {
        if(attackPhase === 1) sRot = (comboStep===2?1.5:-1.5); else if(attackPhase === 2) sRot = (comboStep===2?-1.2:1.2); else if(attackPhase === 3) sRot = (comboStep===2?-0.5:0.5);
    } else if(isGuarding) sRot = 0.2;
    const spearThrust = weapon === 'spear' ? (isAttacking ? (attackPhase === 1 ? -1.35 : (attackPhase === 2 ? 1.45 : 0.35)) : spearPose) : 0;
    const bowThrust = weapon === 'bow' ? (isAttacking ? (attackPhase === 1 ? -1 : (attackPhase === 2 ? 1 : 0.3)) : bowPose) : 0;
    const dualThrust = weapon === 'dual' ? (isAttacking ? (attackPhase === 1 ? -0.95 : (attackPhase === 2 ? 1.05 : 0.2)) : dualPose) : 0;
    ctx.rotate(sRot);
    ctx.fillStyle = "#ffdbac";
    ctx.fillRect(15 + spearThrust * 7 + bowThrust * 5, 18 - spearThrust * 2 - bowThrust * 1.5, 20 + spearThrust * 5, 10);
    if (weapon === 'hammer') {
        const handleLength = Math.max(18, weaponLength * 0.7);
        const headSize = Math.max(18, Math.min(40, 20 + Math.max(0, weaponLength - 28) * 0.28));
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(35, 19, handleLength, 9);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35 + handleLength - 2, 12, headSize, 26);
        ctx.fillRect(35 + handleLength + headSize - 4, 11, 5, 28);
    } else if (weapon === 'spear') {
        const shaftLength = Math.max(38, weaponLength * 0.95 + spearThrust * 14);
        const tipLength = Math.max(16, Math.min(30, shaftLength * 0.18));
        const shaftY = 20 - spearThrust * 1.5;
        const shaftX = 28 + spearThrust * 12 - shaftLength * 0.5;
        ctx.fillStyle = "#7b5a3a";
        ctx.fillRect(shaftX, shaftY, shaftLength, 6);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.beginPath();
        ctx.moveTo(shaftX + shaftLength, 23 - spearThrust * 1.5);
        ctx.lineTo(shaftX + shaftLength + tipLength, 15 - spearThrust * 1.5);
        ctx.lineTo(shaftX + shaftLength + tipLength, 31 - spearThrust * 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(shaftX + shaftLength - 3, 21 - spearThrust * 1.5, 4, 4);
    } else if (weapon === 'dual') {
        const bladeLength = Math.max(18, weaponLength * 0.58);
        const rightWindup = isAttacking ? (attackPhase === 1 ? 1.0 : (attackPhase === 2 ? -0.35 : 1.05)) : dualPose;
        const leftWindup = isAttacking ? (attackPhase === 1 ? -0.35 : (attackPhase === 2 ? 1.0 : 1.05)) : dualPose;
        const rightTilt = attackPhase === 1 ? 0.58 : (attackPhase === 2 ? -0.35 : 0.72);
        const leftTilt = attackPhase === 2 ? -0.58 : (attackPhase === 1 ? 0.35 : -0.72);
        const rightGripX = 28 + rightWindup * 10;
        const rightGripY = 15 - rightWindup * 3;
        const leftGripX = 28 - leftWindup * 10;
        const leftGripY = 31 + leftWindup * 3;
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(rightGripX - 5, rightGripY - 5, 9, 9);
        ctx.fillRect(leftGripX - 5, leftGripY - 5, 9, 9);
        ctx.save();
        ctx.translate(rightGripX, rightGripY);
        ctx.rotate(rightTilt);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(0, -2, bladeLength, 4);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(-3, -1, 4, 2);
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(-6, -2, 6, 4);
        ctx.restore();
        ctx.save();
        ctx.translate(leftGripX, leftGripY);
        ctx.rotate(leftTilt);
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(0, -2, bladeLength, 4);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(-3, -1, 4, 2);
        ctx.fillStyle = "#6e4b2f";
        ctx.fillRect(-6, -2, 6, 4);
        ctx.restore();
    } else if (weapon === 'bow') {
        const bowX = 38 + bowThrust * 10;
        const crescentY = 22 - bowThrust * 1.5;
        ctx.fillStyle = "#7b5a3a";
        ctx.beginPath();
        ctx.arc(bowX, crescentY, 18, -1.25, 1.25, false);
        ctx.arc(bowX + 5, crescentY, 13, 1.25, -1.25, true);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#5d4028";
        ctx.beginPath();
        ctx.arc(bowX + 1, crescentY, 16, -1.18, 1.18, false);
        ctx.arc(bowX + 4, crescentY, 10, 1.18, -1.18, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = comboStep===3?"rgba(255,220,120,0.95)":"rgba(240,240,240,0.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bowX - 12, crescentY);
        ctx.lineTo(bowX + 12, crescentY);
        ctx.stroke();
        if (isAttacking && attackPhase === 1) {
            ctx.strokeStyle = "rgba(255, 235, 190, 0.95)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bowX - 10, crescentY);
            ctx.lineTo(bowX - 26, crescentY);
            ctx.stroke();
            ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
            ctx.beginPath();
            ctx.moveTo(bowX - 26, crescentY);
            ctx.lineTo(bowX - 33, crescentY - 3);
            ctx.lineTo(bowX - 33, crescentY + 3);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        ctx.fillStyle = comboStep===3?"#f1c40f":"#bdc3c7";
        ctx.fillRect(35,18,weaponLength,10);
    }
    ctx.restore(); ctx.restore(); ctx.restore();
    if (isStunned && Number.isFinite(stunEndsAt)) {
        const stunRemaining = Math.max(0, (stunEndsAt - Date.now()) / 1000);
        if (stunRemaining > 0) {
            ctx.save();
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(0,0,0,0.65)";
            ctx.fillStyle = "#ffffff";
            const label = `${stunRemaining.toFixed(1)}초`;
            ctx.strokeText(label, x, y - stunOffset);
            ctx.fillText(label, x, y - stunOffset);
            ctx.restore();
        }
    }
    if(isAttacking && attackPhase === 2) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, VIEW_Y_SCALE);
        const ba = aAngle || angle;
        if (weapon === 'spear') {
            const tipX = Math.cos(ba) * attackRange;
            const tipY = Math.sin(ba) * attackRange;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.85)":"rgba(255,255,255,0.85)";
            ctx.lineWidth = profile.lineWidth;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
            ctx.fillStyle = comboStep===3?"rgba(255,200,0,0.95)":"rgba(255,255,255,0.9)";
            ctx.fill();
        } else if (weapon === 'bow') {
            ctx.strokeStyle = "rgba(255, 230, 170, 0.95)";
            ctx.lineWidth = 2.4;
            const bowReach = Math.max(28, visualAttackRange * 0.32);
            ctx.beginPath();
            ctx.moveTo(12, 0);
            ctx.lineTo(12 + bowReach, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(12 + bowReach, 0);
            ctx.lineTo(12 + bowReach - 8, -3);
            ctx.lineTo(12 + bowReach - 8, 3);
            ctx.closePath();
            ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
            ctx.fill();
        } else {
            ctx.beginPath();
            let sA = ba-2.0, eA = ba+0.5; let counter = false;
            if(comboStep===2) { sA = ba+2.0; eA = ba-0.5; counter = true; } else if(comboStep===3) { sA = ba-2.8; eA = ba+2.8; }
            ctx.arc(0,0,attackRange,sA,eA,counter);
            ctx.strokeStyle = comboStep===3?"rgba(255,200,0,0.8)":"rgba(255,255,255,0.8)";
            ctx.lineWidth = 20;
            ctx.lineCap = "round";
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawCombatEffects() {
    combatEffects.forEach((effect) => {
        const t = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        const alpha = t;
        ctx.save();
        ctx.translate(effect.x, effect.y);
        ctx.scale(1, VIEW_Y_SCALE);
        ctx.globalAlpha = alpha;
        if (effect.weapon === 'hammer') {
            const burst = 20 + (1 - t) * 34;
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
            ctx.fillStyle = 'rgba(231, 76, 60, 0.55)';
            ctx.lineWidth = 4;
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 10 + (1 - t) * 8, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'bow') {
            const burst = 16 + (1 - t) * 18;
            ctx.strokeStyle = 'rgba(255, 214, 140, 0.95)';
            ctx.fillStyle = 'rgba(255, 245, 200, 0.7)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 / 4) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 7 + (1 - t) * 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'spear') {
            const burst = 26 + (1 - t) * 22;
            ctx.strokeStyle = 'rgba(255, 240, 180, 0.95)';
            ctx.fillStyle = 'rgba(241, 196, 15, 0.55)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(effect.angle) * burst, Math.sin(effect.angle) * burst);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(Math.cos(effect.angle) * burst, Math.sin(effect.angle) * burst, 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'dual') {
            const slashLen = 42 + (1 - t) * 20;
            const burstScale = 1 + (1 - t) * 0.35;
            ctx.lineWidth = 3.4;
            ctx.lineCap = 'round';
            const strokes = [
                { color: 'rgba(255, 255, 255, 0.95)', ang: effect.angle + 0.78, len: 0.82, offX: -4, offY: -2 },
                { color: 'rgba(241, 196, 15, 0.92)', ang: effect.angle - 0.92, len: 0.72, offX: 3, offY: 1 },
                { color: 'rgba(255, 255, 255, 0.78)', ang: effect.angle + 1.62, len: 0.58, offX: -1, offY: 4 },
                { color: 'rgba(241, 196, 15, 0.72)', ang: effect.angle - 1.68, len: 0.52, offX: 5, offY: -3 },
            ];
            strokes.forEach((stroke) => {
                ctx.save();
                ctx.translate(stroke.offX * burstScale, stroke.offY * burstScale);
                ctx.rotate(stroke.ang);
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                ctx.moveTo(-slashLen * stroke.len, -slashLen * 0.14);
                ctx.lineTo(slashLen * stroke.len, slashLen * 0.14);
                ctx.stroke();
                ctx.restore();
            });
            ctx.fillStyle = 'rgba(255, 245, 180, 0.55)';
            ctx.beginPath();
            ctx.arc(0, 0, 5 + (1 - t) * 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'dragon') {
            const beamLen = 78 + (1 - t) * 28;
            ctx.strokeStyle = 'rgba(70, 220, 255, 0.95)';
            ctx.fillStyle = 'rgba(30, 150, 255, 0.9)';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.rotate(effect.angle);
            ctx.moveTo(-beamLen, -12);
            ctx.quadraticCurveTo(-beamLen * 0.55, -30, -beamLen * 0.1, -14);
            ctx.quadraticCurveTo(beamLen * 0.18, -36, beamLen * 0.52, -10);
            ctx.quadraticCurveTo(beamLen * 0.78, -18, beamLen, 0);
            ctx.quadraticCurveTo(beamLen * 0.78, 18, beamLen * 0.52, 10);
            ctx.quadraticCurveTo(beamLen * 0.18, 36, -beamLen * 0.1, 14);
            ctx.quadraticCurveTo(-beamLen * 0.55, 30, -beamLen, 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (effect.weapon === 'ult-sword') {
            const slashLen = 58 + (1 - t) * 18;
            ctx.lineWidth = 4.6;
            ctx.lineCap = 'round';
            for (let i = 0; i < 3; i++) {
                ctx.save();
                ctx.rotate(effect.angle + (i - 1) * 0.65);
                ctx.strokeStyle = i === 1 ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 210, 120, 0.88)';
                ctx.beginPath();
                ctx.moveTo(-slashLen * 0.9, -slashLen * 0.08);
                ctx.lineTo(slashLen * 0.9, slashLen * 0.08);
                ctx.stroke();
                ctx.restore();
            }
        } else if (effect.weapon === 'ult-hammer') {
            const burst = 32 + (1 - t) * 22;
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
            ctx.fillStyle = 'rgba(231, 76, 60, 0.48)';
            ctx.lineWidth = 4.5;
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 12 + (1 - t) * 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.weapon === 'spear-ult') {
            const ring = 36 + (1 - t) * 26;
            ctx.strokeStyle = 'rgba(255, 245, 180, 0.9)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, ring, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, ring + 14, 0, Math.PI * 2);
            ctx.stroke();
        } else if (effect.weapon === 'ash') {
            const burst = 18 + (1 - t) * 24;
            ctx.strokeStyle = 'rgba(120, 210, 255, 0.95)';
            ctx.fillStyle = 'rgba(45, 125, 255, 0.55)';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i + effect.angle;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
                ctx.lineTo(Math.cos(a) * burst, Math.sin(a) * burst);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 8 + (1 - t) * 6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const slashLen = 44 + (1 - t) * 18;
            const slashWidth = 4 + (1 - t) * 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = slashWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.rotate(effect.angle + Math.PI / 10);
            ctx.moveTo(-slashLen * 0.6, -slashLen * 0.22);
            ctx.lineTo(slashLen * 0.6, slashLen * 0.22);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-slashLen * 0.25, slashLen * 0.16);
            ctx.lineTo(slashLen * 0.72, -slashLen * 0.12);
            ctx.stroke();
        }
        ctx.restore();
    });
}

function drawAshProjectiles() {
    ashProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const tipX = effect.startX + (effect.endX - effect.startX) * p;
        const tipY = effect.startY + (effect.endY - effect.startY) * p;
        drawAshArrow(effect.startX, effect.startY, tipX, tipY, effect.angle, p);
    });
}

function drawBowProjectiles() {
    bowProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const tipX = effect.startX + (effect.endX - effect.startX) * p;
        const tipY = effect.startY + (effect.endY - effect.startY) * p;
        drawBowArrow(effect.startX, effect.startY, tipX, tipY, effect.angle, p, effect.reflected);
    });
}

function drawDragonProjectiles() {
    dragonProjectiles.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.progress || 0));
        const x = effect.startX + (effect.endX - effect.startX) * p;
        const y = effect.startY + (effect.endY - effect.startY) * p;
        const len = 110 + (1 - p) * 70;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(effect.angle);
        ctx.scale(1, VIEW_Y_SCALE);
        ctx.globalAlpha = 0.95 - p * 0.25;
        ctx.shadowColor = effect.reflected ? 'rgba(255, 120, 120, 0.9)' : 'rgba(70, 220, 255, 0.95)';
        ctx.shadowBlur = 24;
        ctx.fillStyle = effect.reflected ? 'rgba(255, 90, 90, 0.92)' : 'rgba(35, 170, 255, 0.92)';
        ctx.strokeStyle = effect.reflected ? 'rgba(255, 220, 210, 0.95)' : 'rgba(190, 250, 255, 0.96)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-len * 0.95, 0);
        ctx.quadraticCurveTo(-len * 0.5, -26, -len * 0.12, -8);
        ctx.quadraticCurveTo(len * 0.18, -30, len * 0.42, -8);
        ctx.quadraticCurveTo(len * 0.6, -20, len * 0.98, 0);
        ctx.quadraticCurveTo(len * 0.6, 18, len * 0.42, 8);
        ctx.quadraticCurveTo(len * 0.18, 30, -len * 0.12, 8);
        ctx.quadraticCurveTo(-len * 0.5, 26, -len * 0.95, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-len * 0.35, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = effect.reflected ? 'rgba(255, 180, 180, 0.95)' : 'rgba(210, 255, 255, 0.95)';
        ctx.fill();
        ctx.restore();
    });
}

function drawHealingCrosses() {
    const now = Date.now();
    healingCrosses.forEach((cross) => {
        const remaining = Math.max(0, Number(cross.expiresAt || 0) - now);
        const lifeRatio = Math.max(0, Math.min(1, remaining / 12000));
        const bob = Math.sin(now / 220 + Number(cross.x || 0) * 0.01) * 4;
        const blink = remaining <= 3000 ? (Math.floor(now / 140) % 2 === 0) : true;
        if (!blink) return;
        ctx.save();
        ctx.translate(Number(cross.x) || 0, (Number(cross.y) || 0) + bob);
        ctx.scale(1, VIEW_Y_SCALE);
        ctx.globalAlpha = remaining <= 3000 ? Math.max(0.25, lifeRatio) : 1;
        ctx.shadowColor = 'rgba(80, 255, 120, 0.85)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(70, 220, 100, 0.95)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(170, 255, 180, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.restore();
    });
}

function drawGiantPotions() {
    const now = Date.now();
    giantPotions.forEach((potion) => {
        const remaining = Math.max(0, Number(potion.expiresAt || 0) - now);
        const lifeRatio = Math.max(0, Math.min(1, remaining / 14000));
        const bob = Math.sin(now / 240 + Number(potion.x || 0) * 0.01) * 4;
        const blink = remaining <= 3000 ? (Math.floor(now / 120) % 2 === 0) : true;
        if (!blink) return;
        const x = Number(potion.x) || 0;
        const y = Number(potion.y) || 0;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.scale(1, VIEW_Y_SCALE);
        ctx.globalAlpha = remaining <= 3000 ? Math.max(0.25, lifeRatio) : 1;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.18)';
        ctx.shadowBlur = 12;

        ctx.fillStyle = 'rgba(25, 25, 30, 0.95)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-12, -24, 24, 38, 7);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-12, -24, 24, 38);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(55, 60, 70, 0.96)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-8, -39, 16, 18, 5);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-8, -39, 16, 18);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(120, 190, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-8, -39);
        ctx.lineTo(8, -39);
        ctx.lineTo(6, -51);
        ctx.lineTo(-6, -51);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(10, 10, 10, 0.95)';
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(-13, -6, 26, 16, 4);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.rect(-13, -6, 26, 16);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-13, -2);
        ctx.lineTo(13, -2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.beginPath();
        ctx.arc(0, 1, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-5, 5);
        ctx.lineTo(5, 5);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(235, 235, 235, 0.96)';
        ctx.beginPath();
        ctx.arc(-1.8, -0.5, 0.9, 0, Math.PI * 2);
        ctx.arc(1.8, -0.5, 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(120, 255, 170, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -25, 28, 39);
        ctx.restore();
    });
}

function drawHealingTexts() {
    healingTexts.forEach((effect) => {
        const p = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        const target = allPlayers[effect.playerId] || (effect.playerId === myId ? player : null);
        if (!target) return;
        const rise = (1 - p) * 36;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillStyle = '#46e06a';
        const x = target.x;
        const y = target.y - 78 - rise;
        ctx.strokeText(effect.text, x, y);
        ctx.fillText(effect.text, x, y);
        ctx.restore();
    });
}

function drawAshArrow(originX, originY, tipX, tipY, angle, progress) {
    const crystalScale = 0.92;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(crystalScale, crystalScale * VIEW_Y_SCALE);
    ctx.shadowColor = 'rgba(90, 180, 255, 0.75)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.95)';
    ctx.fillStyle = 'rgba(80, 160, 255, 0.92)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, -4);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(35, 120, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-16, -2.4);
    ctx.lineTo(-34, 0);
    ctx.lineTo(-16, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(195, 245, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-10, -1.4);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawBowArrow(originX, originY, tipX, tipY, angle, progress, reflected) {
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(1, VIEW_Y_SCALE);
    ctx.shadowColor = reflected ? 'rgba(255, 120, 120, 0.9)' : 'rgba(255, 210, 120, 0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = reflected ? 'rgba(255, 180, 160, 1)' : 'rgba(240, 200, 145, 1)';
    ctx.fillStyle = reflected ? 'rgba(255, 210, 190, 1)' : 'rgba(140, 95, 45, 1)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = reflected ? 'rgba(255, 140, 120, 0.96)' : 'rgba(115, 75, 35, 0.96)';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-34, 0);
    ctx.strokeStyle = reflected ? 'rgba(255, 170, 140, 0.98)' : 'rgba(235, 205, 155, 0.98)';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(-44, -3.5);
    ctx.lineTo(-44, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawWireHand(tipX, tipY, angle, progress) {
    const palmScale = 0.9 + Math.min(0.25, Math.max(0, progress) * 0.18);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.scale(palmScale, palmScale * VIEW_Y_SCALE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 214, 140, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 225, 195, 0.95)';
    ctx.strokeStyle = 'rgba(110, 70, 35, 0.75)';
    ctx.lineWidth = 1.4;
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(-8, -7, 16, 14, 5);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.rect(-8, -7, 16, 14);
        ctx.fill();
        ctx.stroke();
    }
    const fingerYs = [-6, -2.5, 1.5, 5];
    fingerYs.forEach((fy, idx) => {
        ctx.beginPath();
        ctx.moveTo(6, fy);
        ctx.lineTo(16 + idx * 0.3, fy * 0.72);
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(4, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-1, -1, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 240, 220, 0.95)';
    ctx.fill();
    ctx.restore();
}
function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=80) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
    drawHealingCrosses();
    drawGiantPotions();
    Object.values(allPlayers).forEach(p => { if(p.hp > 0) drawCharacter(p, (p.id === myId) ? "#e67e22" : "#3498db"); });
    drawHealingTexts();
    drawCombatEffects();
    drawAshProjectiles();
    drawBowProjectiles();
    drawDragonProjectiles();
    if(player.hp <= 0 && gameState === 'PLAYING') { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = "white"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center"; ctx.fillText("사망했습니다! 3초 후 부활합니다.", canvas.width/2, canvas.height/2); }
    requestAnimationFrame(loop);
}
const joyContainer = document.getElementById('joy-container'), joyStick = document.getElementById('joy-stick');
let joyId = null;
let aimMode = 'none';
function setMouseAimFromPoint(clientX, clientY) {
    if (joyId !== null || isChatting || isUpgrading || player.hp <= 0 || player.isStunned) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const worldX = (clientX - rect.left) / Math.max(0.0001, scaleX);
    const worldY = (clientY - rect.top) / Math.max(0.0001, scaleY);
    const dx = worldX - player.x;
    const dy = worldY - player.y;
    if (dx === 0 && dy === 0) return;
    player.angle = Math.atan2(dy, dx);
    aimMode = 'mouse';
}
joyContainer.addEventListener('pointerdown', e => {
    if(gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned) {
        joyId = e.pointerId;
        joyContainer.setPointerCapture(e.pointerId);
        aimMode = 'touch';
    }
});
window.addEventListener('pointermove', e => {
    if(joyId === e.pointerId) {
        const r = joyContainer.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        if(d > 50) { dx *= 50/d; dy *= 50/d; }
        joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
        player.moveDir = { x: dx/50, y: (dy/50)/VIEW_Y_SCALE };
        aimMode = 'touch';
    }
});
window.addEventListener('pointerup', e => { if(joyId === e.pointerId) { joyId = null; joyStick.style.transform = 'translate(0,0)'; player.moveDir = { x: 0, y: 0 }; aimMode = 'none'; } });
window.addEventListener('mousemove', e => { setMouseAimFromPoint(e.clientX, e.clientY); });
window.addEventListener('mouseleave', () => { if (aimMode === 'mouse') aimMode = 'none'; });
const bind = (id, fn, end) => { const el = document.getElementById(id); if(!el) return; el.addEventListener('pointerdown', e => { e.preventDefault(); if(gameState === 'PLAYING' && !isChatting && !isUpgrading) fn(e); }); if(end) { el.addEventListener('pointerup', end); el.addEventListener('pointerleave', end); el.addEventListener('pointercancel', end); } };
bind('btn-attack', () => { attackHoldSources.add('button'); beginAttack(); }, () => { attackHoldSources.delete('button'); });
bind('btn-dodge', startDodge); bind('btn-guard', startGuard, releaseGuard); bind('btn-wire', startWire);
let lastTime = 0; function loop(t) { if(!lastTime) lastTime = t; let dt = (t - lastTime)/1000; if(dt > 0.1) dt = 0.1; lastTime = t; update(dt); updateCooldownUI(); draw(); }
function normalizeNameInput(value) {
    return String(value || '').trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 10);
}
function normalizeAccountId(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/[,]/g, '').replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 20);
}
function normalizeAccountPassword(value) {
    return String(value || '').trim().replace(/[\r\n,]/g, '').slice(0, 32);
}
function normalizeSkill(value) {
    const skill = String(value || '').trim().toLowerCase();
    if (skill === 'ash') return 'ash';
    if (skill === 'gear') return 'gear';
    return 'wire';
}
function getSkillLabel(skill) {
    return SKILL_PRESETS[normalizeSkill(skill)]?.label || SKILL_PRESETS.wire.label;
}
function getSkillCooldown(skill) {
    return SKILL_PRESETS[normalizeSkill(skill)]?.cooldown || SKILL_PRESETS.wire.cooldown;
}
function updateSkillButtonLabel() {
    const btn = document.getElementById('btn-wire');
    if (btn) btn.textContent = getSkillLabel(player.skill || selectedSkill);
}
function setAuthMode(mode) {
    const loginPanel = document.getElementById('login-panel');
    const registerPanel = document.getElementById('register-panel');
    const weaponPanel = document.getElementById('weapon-panel');
    const skillPanel = document.getElementById('skill-panel');
    if (loginPanel) loginPanel.classList.toggle('hidden', mode !== 'login');
    if (registerPanel) registerPanel.classList.toggle('hidden', mode !== 'register');
    if (weaponPanel) weaponPanel.classList.toggle('hidden', mode !== 'weapon');
    if (skillPanel) skillPanel.classList.toggle('hidden', mode !== 'skill');
}
function setAuthError(target, message) {
    const errorEl = document.getElementById(target + '-error');
    if (errorEl) errorEl.textContent = message || '';
}
function setWeaponError(message) {
    const errorEl = document.getElementById('weapon-note');
    if (errorEl) errorEl.textContent = message || '한손검, 망치, 창, 활 중 하나를 선택하세요.';
}
function setSkillError(message) {
    const errorEl = document.getElementById('skill-note');
    if (errorEl) errorEl.textContent = message || '땡겨, 입체기동 또는 애쉬궁 중 하나를 선택하세요.';
}
function setWeaponSelection(weapon) {
    selectedWeapon = normalizeWeapon(weapon);
    document.querySelectorAll('.weapon-card').forEach((card) => {
        if (card.dataset.weapon) card.classList.toggle('selected', card.dataset.weapon === selectedWeapon);
    });
    setWeaponError(`${getWeaponLabel(selectedWeapon)}가 선택되었습니다.`);
}
function setSkillSelection(skill) {
    selectedSkill = normalizeSkill(skill);
    document.querySelectorAll('.weapon-card').forEach((card) => {
        if (card.dataset.skill) card.classList.toggle('selected', card.dataset.skill === selectedSkill);
    });
    setSkillError(`${getSkillLabel(selectedSkill)}가 선택되었습니다.`);
}
function showWeaponPanel(auth) {
    pendingAuth = auth;
    document.getElementById('overlay-start')?.classList.remove('hidden');
    setAuthMode('weapon');
    const weaponPanel = document.getElementById('weapon-panel');
    if (weaponPanel) weaponPanel.classList.remove('hidden');
    const skillPanel = document.getElementById('skill-panel');
    if (skillPanel) skillPanel.classList.add('hidden');
    const loginPanel = document.getElementById('login-panel');
    const registerPanel = document.getElementById('register-panel');
    if (loginPanel) loginPanel.classList.add('hidden');
    if (registerPanel) registerPanel.classList.add('hidden');
    setWeaponSelection(normalizeWeapon(auth && auth.weapon ? auth.weapon : selectedWeapon));
}
function showSkillPanel(auth, weapon) {
    pendingAuth = Object.assign({}, auth || {}, { weapon: normalizeWeapon(weapon || selectedWeapon) });
    document.getElementById('overlay-start')?.classList.remove('hidden');
    setAuthMode('skill');
    const weaponPanel = document.getElementById('weapon-panel');
    if (weaponPanel) weaponPanel.classList.add('hidden');
    const skillPanel = document.getElementById('skill-panel');
    if (skillPanel) skillPanel.classList.remove('hidden');
    setSkillSelection('wire');
}
function hideWeaponPanel() {
    const weaponPanel = document.getElementById('weapon-panel');
    if (weaponPanel) weaponPanel.classList.add('hidden');
}
function hideSkillPanel() {
    const skillPanel = document.getElementById('skill-panel');
    if (skillPanel) skillPanel.classList.add('hidden');
}
async function postAuth(path, payload) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
        throw new Error(data.error || '요청을 처리하지 못했습니다.');
    }
    return data;
}
function enterGame(nickname, accountId, weapon, skill) {
    currentSession = { id: accountId || '', nickname: nickname || 'Hunter' };
    if (accountId) localStorage.setItem('mh_last_login_id', accountId);
    if (accountId) socket.emit('setAccount', accountId);
    if (nickname) socket.emit('setName', nickname);
    if (weapon) {
        player.weapon = normalizeWeapon(weapon);
        player.stats = normalizeStats(createBaseStatsForWeapon(player.weapon));
        player.maxHp = getMaxHpFromStats(player.stats);
        player.hp = player.maxHp;
        player.upgradeCounts = { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0 };
        player.gearRush = createDefaultGearRush();
        socket.emit('setWeapon', player.weapon);
    }
    player.skill = normalizeSkill(skill);
    updateSkillButtonLabel();
    socket.emit('setSkill', player.skill);
    socket.emit('setLoadoutReady');
    updateHUD();
    hideWeaponPanel();
    hideSkillPanel();
    document.getElementById('overlay-start').classList.add('hidden');
    gameState = 'PLAYING';
    requestAnimationFrame(loop);
}
async function handleLogin() {
    const id = normalizeAccountId(document.getElementById('login-id')?.value);
    const password = normalizeAccountPassword(document.getElementById('login-password')?.value);
    try {
        setAuthError('login', '');
        if (isLocalAuthBypass) {
            const localId = id || 'local-test';
            showWeaponPanel({ id: localId, nickname: localId });
            return;
        }
        const result = await postAuth('/api/auth/login', { id, password });
        showWeaponPanel(result);
    } catch (error) {
        setAuthError('login', error.message);
    }
}
async function handleRegister() {
    const id = normalizeAccountId(document.getElementById('register-id')?.value);
    const nickname = normalizeNameInput(document.getElementById('register-nickname')?.value);
    const password = normalizeAccountPassword(document.getElementById('register-password')?.value);
    const confirmPassword = normalizeAccountPassword(document.getElementById('register-password-confirm')?.value);
    try {
        setAuthError('register', '');
        const result = await postAuth('/api/auth/register', { id, nickname, password, confirmPassword });
        setAuthMode('login');
        const loginId = document.getElementById('login-id');
        const loginPassword = document.getElementById('login-password');
        if (loginId) loginId.value = result.id;
        if (loginPassword) loginPassword.value = '';
        showWeaponPanel(result);
    } catch (error) {
        setAuthError('register', error.message);
    }
}
function startGame() {
    handleLogin();
}
const savedLoginId = normalizeAccountId(localStorage.getItem('mh_last_login_id') || '');
if (savedLoginId) {
    const loginId = document.getElementById('login-id');
    if (loginId) loginId.value = savedLoginId;
}
setAuthMode('login');
updateSkillButtonLabel();
document.getElementById('btn-login')?.addEventListener('click', handleLogin);
document.getElementById('btn-signin')?.addEventListener('click', () => {
    setAuthMode('register');
    setAuthError('register', '');
});
document.getElementById('btn-register')?.addEventListener('click', handleRegister);
document.getElementById('btn-back-login')?.addEventListener('click', () => {
    setAuthMode('login');
    setAuthError('login', '');
});
document.querySelectorAll('.weapon-card').forEach((card) => {
    card.addEventListener('click', () => {
        if (card.dataset.weapon) setWeaponSelection(card.dataset.weapon);
        if (card.dataset.skill) setSkillSelection(card.dataset.skill);
    });
    card.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            if (card.dataset.weapon) setWeaponSelection(card.dataset.weapon);
            if (card.dataset.skill) setSkillSelection(card.dataset.skill);
        }
    });
});
document.getElementById('btn-weapon-back')?.addEventListener('click', () => {
    pendingAuth = null;
    hideWeaponPanel();
    setAuthMode('login');
    setAuthError('login', '');
});
document.getElementById('btn-weapon-confirm')?.addEventListener('click', async () => {
    if (!pendingAuth) return;
    setWeaponError('');
    hideWeaponPanel();
    showSkillPanel(pendingAuth, selectedWeapon);
});
document.getElementById('btn-skill-back')?.addEventListener('click', () => {
    if (!pendingAuth) return;
    hideSkillPanel();
    showWeaponPanel(pendingAuth);
    setSkillError('');
});
document.getElementById('btn-skill-confirm')?.addEventListener('click', async () => {
    if (!pendingAuth) return;
    setSkillError('');
    enterGame(pendingAuth.nickname, pendingAuth.id, normalizeWeapon(selectedWeapon), normalizeSkill(selectedSkill));
    pendingAuth = null;
});
document.getElementById('login-id')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleLogin();
    }
});
document.getElementById('login-password')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleLogin();
    }
});
document.getElementById('register-id')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleRegister();
    }
});
document.getElementById('register-nickname')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleRegister();
    }
});
document.getElementById('register-password')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleRegister();
    }
});
document.getElementById('register-password-confirm')?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        e.preventDefault();
        handleRegister();
    }
});

