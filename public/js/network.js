socket.on('connect', () => { myId = socket.id; });
socket.on('currentPlayers', (data) => { 
    allPlayers = data; 
    if(data[myId]) { player.x = data[myId].x; player.y = data[myId].y; player.hp = data[myId].hp; player.weapon = normalizeWeapon(data[myId].weapon); player.stats = normalizeStats(data[myId].stats); player.maxHp = getMaxHpFromStats(player.stats); player.level = data[myId].level; player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 }, data[myId].upgradeCounts || {}); player.giantScale = Number.isFinite(data[myId].giantScale) ? data[myId].giantScale : 1; player.giantAttackMult = Number.isFinite(data[myId].giantAttackMult) ? data[myId].giantAttackMult : 1; player.giantActive = Boolean(data[myId].giantActive); player.giantEndsAt = Number.isFinite(data[myId].giantEndsAt) ? data[myId].giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(data[myId].giantRecoveryEndsAt) ? data[myId].giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), data[myId].gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), data[myId].ultimate || {}); player.skill = normalizeSkill(data[myId].skill); updateSkillButtonLabel(); updateHUD(); }
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
    if (data.action.ultimate) noteUltimateCast(data.id, data.action.ultimate);
});
// Shows the ultimate's name over the caster and shakes the screen for big hits nearby.
function noteUltimateCast(playerId, ultimate) {
    if (!ultimate || !ultimate.active || !ultimate.startAt || seenUltimateStarts[playerId] === ultimate.startAt) return;
    seenUltimateStarts[playerId] = ultimate.startAt;
    const type = normalizeWeapon(ultimate.type);
    ultimateBanners.push({ playerId, type, text: ULTIMATE_NAMES[type] || '궁극기', life: 1.3, maxLife: 1.3 });
    const caster = playerId === myId ? player : allPlayers[playerId];
    const nearby = caster && Math.abs(caster.x - player.x) < canvas.width && Math.abs(caster.y - player.y) < canvas.height;
    if (nearby) playSound('ult');
    if (nearby && (type === 'hammer' || type === 'bow')) {
        screenShake.until = Date.now() + (type === 'hammer' ? 380 : 260);
        screenShake.strength = type === 'hammer' ? 9 : 5;
    }
}
function pushDamageText(x, y, amount, options = {}) {
    const value = Math.floor(Number(amount) || 0);
    if (value <= 0) return;
    // Rapid hits on the same spot add up into one growing number instead of piling up.
    const recent = damageTexts.find((text) => text.maxLife - text.life < 0.35 && Math.hypot(text.x - x, text.y - y) < 28);
    if (recent) {
        recent.value += value;
        recent.text = String(recent.value);
        recent.life = recent.maxLife;
        recent.size = Math.min(30, recent.size + 1.5);
        if (options.color) recent.color = options.color;
        return;
    }
    damageTexts.push({
        x: Number(x) || 0,
        y: Number(y) || 0,
        value,
        text: String(value),
        color: options.color || (options.ultimate ? '#ffb347' : '#ffffff'),
        size: options.ultimate ? 22 : 15,
        drift: (Math.random() - 0.5) * 24,
        life: 0.8,
        maxLife: 0.8,
    });
}
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
    playSound('levelUp');
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
        rangeDesc.innerHTML = isBow ? '화살이 <b>1발</b> 늘고<br>용의 화살도 <b>1발</b> 추가' : '공격·궁극기 범위가<br><b>15%</b> 증가합니다.';
    }
    
    Object.keys(keys).forEach(k => keys[k] = false);
    upgradeTimeLeft = UPGRADE_PICK_SECONDS;
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
    if(data[myId]) { player.hp = data[myId].hp; player.weapon = normalizeWeapon(data[myId].weapon); player.stats = normalizeStats(data[myId].stats); player.maxHp = getMaxHpFromStats(player.stats); player.level = data[myId].level; player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 }, data[myId].upgradeCounts || {}); player.giantScale = Number.isFinite(data[myId].giantScale) ? data[myId].giantScale : 1; player.giantAttackMult = Number.isFinite(data[myId].giantAttackMult) ? data[myId].giantAttackMult : 1; player.giantActive = Boolean(data[myId].giantActive); player.giantEndsAt = Number.isFinite(data[myId].giantEndsAt) ? data[myId].giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(data[myId].giantRecoveryEndsAt) ? data[myId].giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), data[myId].gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), data[myId].ultimate || {}); player.skill = normalizeSkill(data[myId].skill); updateSkillButtonLabel(); updateHUD(); }
    updateLeaderboard(); 
});

socket.on('playerRespawn', (p) => { 
    allPlayers[p.id] = p; 
    if(p.id === myId) { 
        player.x = p.x; player.y = p.y; player.hp = p.hp; 
        player.isStunned = false; player.isGuarding = false; 
        player.level = p.level; player.weapon = normalizeWeapon(p.weapon); player.stats = normalizeStats(p.stats); player.maxHp = getMaxHpFromStats(player.stats); player.upgradeCounts = Object.assign({ dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 }, p.upgradeCounts || {}); player.giantScale = Number.isFinite(p.giantScale) ? p.giantScale : 1; player.giantAttackMult = Number.isFinite(p.giantAttackMult) ? p.giantAttackMult : 1; player.giantActive = Boolean(p.giantActive); player.giantEndsAt = Number.isFinite(p.giantEndsAt) ? p.giantEndsAt : 0; player.giantRecoveryEndsAt = Number.isFinite(p.giantRecoveryEndsAt) ? p.giantRecoveryEndsAt : 0; player.gearRush = Object.assign(createDefaultGearRush(), p.gearRush || {}); player.ultimate = Object.assign(createDefaultUltimate(), p.ultimate || {}); player.skill = normalizeSkill(p.skill); updateSkillButtonLabel();
        updateHUD();
    } 
    updateLeaderboard(); 
});

socket.on('playerDisconnected', (id) => { delete allPlayers[id]; updateLeaderboard(); });
socket.on('playerDied', (data) => {
    if (data && data.victimId === myId) {
        playSound('death');
        announcements = [];
        if (upgradeTimerInterval) clearInterval(upgradeTimerInterval);
        pendingUpgrades = 0;
        isUpgrading = false;
        document.getElementById('overlay-upgrade').classList.add('hidden');
        gameState = 'TITLE';
        showDeathScreen();
    }
});
socket.on('deathSummary', (data) => {
    lastDeathSummary = data || null;
    lastDeathRecords = null;
    renderDeathSummary();
});
socket.on('deathRecords', (data) => {
    lastDeathRecords = data || null;
    renderDeathRecords();
});
socket.on('skillChanged', (data) => {
    if (data && data.id === myId) {
        player.skill = normalizeSkill(data.skill);
        updateSkillButtonLabel();
    }
});
socket.on('combatEffect', pushCombatEffect);
// Effects with their own drawing; any other weapon name falls back to a basic slash.
const SPECIAL_EFFECTS = new Set(['ult-sword', 'ult-hammer', 'spear-ult', 'dragon', 'ult-dual', 'ash']);
function pushCombatEffect(effect) {
    if (!effect) return;
    const special = SPECIAL_EFFECTS.has(effect.weapon);
    const life = special ? 0.45 : 0.22;
    combatEffects.push({
        x: Number(effect.x) || 0,
        y: Number(effect.y) || 0,
        angle: Number(effect.angle) || 0,
        weapon: special ? effect.weapon : normalizeWeapon(effect.weapon),
        life,
        maxLife: life,
    });
    if (effect.damage) {
        pushDamageText(effect.x, effect.y, effect.damage, { ultimate: effect.ultimate || special });
        if (isOnScreen(effect.x, effect.y)) playSound('hit');
    }
}
socket.on('mobTiers', (data) => {
    mobTiers = Array.isArray(data) ? data : [];
});
socket.on('mobs', (data) => {
    const seen = new Set();
    (Array.isArray(data) ? data : []).forEach(([id, x, y, tier, hpPct, mine, stunned, boss]) => {
        seen.add(id);
        const mob = mobs.get(id);
        if (mob) {
            Object.assign(mob, { tx: x, ty: y, tier, hpPct, mine: mine === 1, stunned: stunned === 1, boss: boss === 1 });
        } else {
            mobs.set(id, { id, x, y, tx: x, ty: y, tier, hpPct, mine: mine === 1, stunned: stunned === 1, boss: boss === 1, flash: 0, seed: Math.random() * Math.PI * 2 });
        }
    });
    for (const id of mobs.keys()) {
        if (!seen.has(id)) mobs.delete(id);
    }
});
socket.on('mobDamaged', (data) => {
    if (!data) return;
    const mob = mobs.get(data.id);
    if (mob) mob.flash = 0.12;
    pushCombatEffect(data);
});
socket.on('mobKilled', (data) => {
    if (!data) return;
    const mob = mobs.get(data.id);
    const tier = mobTiers[data.tier];
    mobDeathEffects.push({
        x: mob ? mob.x : Number(data.x) || 0,
        y: mob ? mob.y : Number(data.y) || 0,
        color: tier ? tier.color : '#2ecc71',
        radius: tier ? tier.radius : 16,
        life: 0.35,
        maxLife: 0.35,
    });
    pushDamageText(mob ? mob.x : data.x, mob ? mob.y : data.y, data.damage, { ultimate: data.ultimate, color: data.ultimate ? '#ffb347' : '#ffe066' });
    if (isOnScreen(Number(data.x) || 0, Number(data.y) || 0)) playSound('kill');
    mobs.delete(data.id);
});
socket.on('bossSpawned', (data) => {
    if (!data) return;
    bossLevels[data.id] = data.level;
    if (data.ownerId === myId) {
        announce(`보스 등장! Lv.${data.level}`, '#ff5a5a');
        playSound('bossSpawn');
    }
});
socket.on('bossSlam', (data) => {
    if (!data) return;
    bossSlams.push({ id: data.id, x: data.x, y: data.y, radius: data.radius, windupMs: data.windupMs, hitAt: Date.now() + data.windupMs });
});
socket.on('bossSlamHit', (data) => {
    if (!data) return;
    bossSlams = bossSlams.filter((slam) => slam.id !== data.id);
    bossSlamBursts.push({ x: data.x, y: data.y, radius: data.radius, life: 0.4, maxLife: 0.4 });
    if (Math.hypot(data.x - player.x, data.y - player.y) < canvas.width * 0.7) {
        screenShake.until = Date.now() + 320;
        screenShake.strength = 8;
        playSound('slam');
    }
});
socket.on('bossDefeated', (data) => {
    if (!data) return;
    delete bossLevels[data.id];
    if (data.ownerId === myId || data.killerId === myId) {
        announce(data.killerId === myId ? '보스 처치!' : `${data.killerName}이(가) 보스를 처치!`, '#f1c40f');
        playSound('bossDown');
    }
});
socket.on('mobDamage', (data) => {
    const amount = Math.floor(Number(data && data.amount) || 0);
    if (amount <= 0) return;
    playSound('hurt');
    healingTexts.push({ playerId: myId, text: `-${amount}`, color: '#ff5a5a', life: 0.7, maxLife: 0.7 });
});
socket.on('xpOrbs', (data) => {
    xpOrbs = Array.isArray(data) ? data : [];
});
socket.on('xpOrbsAdded', (data) => {
    if (Array.isArray(data)) xpOrbs = xpOrbs.concat(data);
});
socket.on('xpOrbsRemoved', (data) => {
    if (!Array.isArray(data) || data.length === 0) return;
    const byId = new Map(data.map((entry) => [entry.id, entry]));
    let myXp = 0;
    xpOrbs = xpOrbs.filter((orb) => {
        const entry = byId.get(orb.id);
        if (!entry) return true;
        // Picked-up orbs fly into whoever collected them.
        if (entry.by) {
            // Far pickups (bow magnet) fly a little longer so the pull is visible.
            const collector = entry.by === myId ? player : allPlayers[entry.by];
            const distance = collector ? Math.hypot(collector.x - orb.x, collector.y - orb.y) : 0;
            const life = Math.max(0.22, Math.min(0.6, distance / 1400));
            collectingOrbs.push({ x: orb.x, y: orb.y, value: orb.value, by: entry.by, life, maxLife: life });
        }
        if (entry.by === myId) myXp += orb.value;
        return false;
    });
    if (myXp > 0) playSound('orb');
    if (myXp > 0) healingTexts.push({ playerId: myId, text: `+${myXp} XP`, color: '#5ad8ff', life: 0.9, maxLife: 0.9 });
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
    if (data.playerId === myId) playSound('heal');
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
