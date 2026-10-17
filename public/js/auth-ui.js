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
    if (skill === 'trap') return 'trap';
    if (skill === 'blink') return 'blink';
    if (skill === 'potion') return 'potion';
    return 'wire';
}
function getSkillLabel(skill) {
    return SKILL_PRESETS[normalizeSkill(skill)]?.label || SKILL_PRESETS.wire.label;
}
function getSkillCooldown(skill) {
    return SKILL_PRESETS[normalizeSkill(skill)]?.cooldown || SKILL_PRESETS.wire.cooldown;
}
// The attack and skill buttons show the art of the chosen weapon and skill.
let shownControlArt = '';
function updateControlIcons() {
    const weapon = normalizeWeapon(player.weapon || selectedWeapon);
    const skill = normalizeSkill(player.skill || selectedSkill);
    if (shownControlArt === `${weapon}:${skill}`) return;
    shownControlArt = `${weapon}:${skill}`;
    const copyArt = (cardSelector, buttonId) => {
        const source = document.querySelector(`${cardSelector} svg.art`);
        const target = document.querySelector(`#${buttonId} .btn-icon`);
        if (!source || !target) return;
        target.setAttribute('viewBox', source.getAttribute('viewBox'));
        target.innerHTML = source.innerHTML;
    };
    copyArt(`.weapon-card[data-weapon="${weapon}"]`, 'btn-attack');
    copyArt(`.weapon-card[data-skill="${skill}"]`, 'btn-wire');
}
function updateSkillButtonLabel() {
    updateControlIcons();
    const label = document.getElementById('btn-wire-label');
    if (!label) return;
    const skill = normalizeSkill(player.skill || selectedSkill);
    // A placed blink mark turns the button into "return".
    label.textContent = skill === 'blink' && getOwnBlinkMark() ? '귀환' : getSkillLabel(skill);
}
function setAuthMode(mode) {
    const loginPanel = document.getElementById('login-panel');
    const registerPanel = document.getElementById('register-panel');
    const loadoutPanel = document.getElementById('loadout-panel');
    if (loginPanel) loginPanel.classList.toggle('hidden', mode !== 'login');
    if (registerPanel) registerPanel.classList.toggle('hidden', mode !== 'register');
    if (loadoutPanel) loadoutPanel.classList.toggle('hidden', mode !== 'loadout');
    document.getElementById('overlay-start')?.classList.toggle('mode-loadout', mode === 'loadout');
}
function setAuthError(target, message) {
    const errorEl = document.getElementById(target + '-error');
    if (errorEl) errorEl.textContent = message || '';
}
// Shows what is picked so far, e.g. "주무기 한손검 · 보조무기 땡겨".
function updateLoadoutNote() {
    const note = document.getElementById('loadout-note');
    if (note) note.textContent = `주무기 ${getWeaponLabel(selectedWeapon)} · 보조무기 ${getSkillLabel(selectedSkill)}`;
    const desc = document.getElementById('loadout-desc');
    if (desc) {
        // The card text breaks lines with <br>; join them with a space instead.
        const describe = (selector) => (document.querySelector(selector)?.querySelector('p')?.innerHTML || '')
            .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
        desc.textContent = [describe(`.weapon-card[data-weapon="${selectedWeapon}"]`), describe(`.weapon-card[data-skill="${selectedSkill}"]`)].filter(Boolean).join(' / ');
    }
}
function setWeaponSelection(weapon) {
    selectedWeapon = normalizeWeapon(weapon);
    document.querySelectorAll('.weapon-card').forEach((card) => {
        if (card.dataset.weapon) card.classList.toggle('selected', card.dataset.weapon === selectedWeapon);
    });
    updateLoadoutNote();
}
function setSkillSelection(skill) {
    selectedSkill = normalizeSkill(skill);
    document.querySelectorAll('.weapon-card').forEach((card) => {
        if (card.dataset.skill) card.classList.toggle('selected', card.dataset.skill === selectedSkill);
    });
    updateLoadoutNote();
}

// ── Look picker ─────────────────────────────────────────────────────────────────

function loadSavedLook() {
    try {
        return normalizeHeroLook(JSON.parse(localStorage.getItem('mh_hero_look') || 'null'));
    } catch (error) {
        return normalizeHeroLook(null);
    }
}
let selectedLook = loadSavedLook();

function stepLook(key, delta) {
    const row = HERO_LOOK_ROWS.find((item) => item.key === key);
    if (!row) return;
    const count = row.values.length;
    selectedLook = normalizeHeroLook(Object.assign({}, selectedLook, { [key]: (selectedLook[key] + delta + count) % count }));
    try { localStorage.setItem('mh_hero_look', JSON.stringify(selectedLook)); } catch (error) { /* private mode */ }
    renderLookRows();
}

// One row per option: label, ◀, current value, ▶. Tapping the value also steps forward.
function renderLookRows() {
    const container = document.getElementById('look-rows');
    if (!container) return;
    container.textContent = '';
    HERO_LOOK_ROWS.forEach((row) => {
        const line = document.createElement('div');
        line.className = 'look-row';
        const label = document.createElement('span');
        label.className = 'look-label';
        label.textContent = row.label;
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'look-arrow';
        prev.textContent = '◀';
        prev.setAttribute('aria-label', `${row.label} 이전`);
        prev.addEventListener('click', () => stepLook(row.key, -1));
        const value = document.createElement('button');
        value.type = 'button';
        value.className = 'look-value';
        value.textContent = row.values[selectedLook[row.key]];
        value.addEventListener('click', () => stepLook(row.key, 1));
        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'look-arrow';
        next.textContent = '▶';
        next.setAttribute('aria-label', `${row.label} 다음`);
        next.addEventListener('click', () => stepLook(row.key, 1));
        line.append(label, prev, value, next);
        container.append(line);
    });
}

// The preview turns through all eight directions while the loadout screen is open.
let lookPreviewFrame = 0;
function drawLookPreview(now) {
    const canvasEl = document.getElementById('look-preview');
    const panel = document.getElementById('loadout-panel');
    if (!canvasEl || !panel || panel.classList.contains('hidden')) {
        lookPreviewFrame = 0;
        return;
    }
    const g = canvasEl.getContext('2d');
    g.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const facing = Math.PI / 2 - Math.floor(now / 900) * (Math.PI / 4);
    g.save();
    g.translate(canvasEl.width / 2, canvasEl.height - 14);
    g.scale(2, 2);
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    g.beginPath(); g.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2); g.fill();
    drawHeroFigure(g, selectedLook, facing, { moving: true, t: now });
    g.restore();
    lookPreviewFrame = requestAnimationFrame(drawLookPreview);
}
function startLookPreview() {
    if (!lookPreviewFrame) lookPreviewFrame = requestAnimationFrame(drawLookPreview);
}
function formatSurvivalTime(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
function renderDeathSummary() {
    const summary = lastDeathSummary || {};
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('death-cause', summary.killerName ? `${summary.killerName}에게 쓰러졌습니다.` : '몬스터에게 쓰러졌습니다.');
    setText('death-time', formatSurvivalTime(summary.survivedMs));
    setText('death-level', `Lv.${summary.level || 1}`);
    setText('death-xp', String(summary.totalXp || 0));
    setText('death-mob-kills', String(summary.mobKills || 0));
    setText('death-player-kills', String(summary.playerKills || 0));
}
// Personal best line, NEW badges on beaten records, and the top ranking.
function renderDeathRecords() {
    const records = lastDeathRecords;
    const bestEl = document.getElementById('death-best');
    const topEl = document.getElementById('death-top');
    document.querySelectorAll('.death-stat[data-best]').forEach((card) => {
        card.classList.toggle('new-best', Boolean(records && records.newBest && records.newBest[card.dataset.best]));
    });
    if (!bestEl || !topEl) return;
    if (!records || !records.best) {
        bestEl.textContent = '';
        topEl.textContent = '';
        return;
    }
    bestEl.innerHTML = `내 최고 기록 <b>Lv.${records.best.level}</b> · 생존 <b>${formatSurvivalTime(records.best.survivedMs)}</b> · 경험치 <b>${records.best.totalXp}</b>`;
    topEl.textContent = '';
    const myName = (currentSession && currentSession.nickname) || player.name;
    (records.top || []).forEach((entry, i) => {
        const item = document.createElement('span');
        item.className = 'death-top-entry' + (entry.name === myName ? ' me' : '');
        const rank = document.createElement('b');
        rank.textContent = `${i + 1}위`;
        item.append(rank, ` ${entry.name} Lv.${entry.level} · ${formatSurvivalTime(entry.survivedMs)}`);
        topEl.append(item);
    });
}
function showDeathScreen() {
    renderDeathSummary();
    renderDeathRecords();
    document.getElementById('overlay-death')?.classList.remove('hidden');
}
function hideDeathScreen() {
    document.getElementById('overlay-death')?.classList.add('hidden');
}
// Look, main weapon and secondary skill are all picked on this one screen.
function showLoadoutPanel(auth) {
    pendingAuth = auth;
    document.getElementById('overlay-start')?.classList.remove('hidden');
    setAuthMode('loadout');
    setWeaponSelection(normalizeWeapon(auth && auth.weapon ? auth.weapon : selectedWeapon));
    setSkillSelection(selectedSkill);
    renderLookRows();
    startLookPreview();
}
function hideLoadoutPanel() {
    document.getElementById('loadout-panel')?.classList.add('hidden');
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
function enterGame(nickname, accountId, weapon, skill, look) {
    document.body.classList.add('in-game');
    currentSession = { id: accountId || '', nickname: nickname || 'Hunter' };
    if (accountId) localStorage.setItem('mh_last_login_id', accountId);
    if (accountId) socket.emit('setAccount', accountId);
    if (nickname) socket.emit('setName', nickname);
    if (weapon) {
        player.weapon = normalizeWeapon(weapon);
        player.stats = normalizeStats(createBaseStatsForWeapon(player.weapon));
        player.maxHp = getMaxHpFromStats(player.stats);
        player.hp = player.maxHp;
        player.upgradeCounts = { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 };
        player.gearRush = createDefaultGearRush();
        socket.emit('setWeapon', player.weapon);
    }
    player.skill = normalizeSkill(skill);
    updateSkillButtonLabel();
    socket.emit('setSkill', player.skill);
    player.look = normalizeHeroLook(look);
    socket.emit('setLook', player.look);
    socket.emit('setLoadoutReady');
    updateHUD();
    hideLoadoutPanel();
    document.getElementById('overlay-start').classList.add('hidden');
    gameState = 'PLAYING';
    requestGameFullscreen();
    requestAnimationFrame(loop);
}
async function handleLogin() {
    requestGameFullscreen();
    const id = normalizeAccountId(document.getElementById('login-id')?.value);
    const password = normalizeAccountPassword(document.getElementById('login-password')?.value);
    try {
        setAuthError('login', '');
        if (isLocalAuthBypass) {
            const localId = id || 'local-test';
            showLoadoutPanel({ id: localId, nickname: localId });
            return;
        }
        const result = await postAuth('/api/auth/login', { id, password });
        showLoadoutPanel(result);
    } catch (error) {
        setAuthError('login', error.message);
    }
}
async function handleRegister() {
    requestGameFullscreen();
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
        showLoadoutPanel(result);
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
// The panels are forms, so the Enter key and a phone keyboard's Go/Done button submit them.
document.getElementById('login-panel')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin();
});
document.getElementById('btn-signup')?.addEventListener('click', () => {
    requestGameFullscreen();
    setAuthMode('register');
    setAuthError('register', '');
});
document.getElementById('register-panel')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleRegister();
});
document.getElementById('btn-stats')?.addEventListener('click', (e) => {
    const hud = document.getElementById('hud');
    const open = !hud.classList.contains('show-stats');
    hud.classList.toggle('show-stats', open);
    e.currentTarget.setAttribute('aria-expanded', String(open));
});
// HUD buttons sit over the arena; keep their clicks from starting an attack.
document.querySelectorAll('.ui-click').forEach((el) => {
    ['mousedown', 'pointerdown', 'touchstart'].forEach((type) => el.addEventListener(type, (e) => e.stopPropagation()));
});
document.getElementById('btn-restart')?.addEventListener('click', () => {
    hideDeathScreen();
    showLoadoutPanel(currentSession || { id: localStorage.getItem('mh_last_login_id') || '', nickname: player.name || 'Hunter' });
});
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
document.getElementById('btn-loadout-back')?.addEventListener('click', () => {
    pendingAuth = null;
    hideLoadoutPanel();
    setAuthMode('login');
    setAuthError('login', '');
});
document.getElementById('btn-loadout-start')?.addEventListener('click', () => {
    if (!pendingAuth) return;
    enterGame(pendingAuth.nickname, pendingAuth.id, normalizeWeapon(selectedWeapon), normalizeSkill(selectedSkill), selectedLook);
    pendingAuth = null;
});
// Enter (or Next) in a field moves on to the next empty field; otherwise the form submits.
// Phone keyboards leave e.code empty, so check e.key and keyCode.
document.querySelectorAll('.auth-panel').forEach((form) => {
    form.addEventListener('keydown', (e) => {
        if (!(e.key === 'Enter' || e.keyCode === 13) || e.isComposing) return;
        const fields = [...form.querySelectorAll('.auth-field')];
        const index = fields.indexOf(e.target);
        if (index < 0) return;
        const next = fields.slice(index + 1).find((field) => !field.value);
        if (next) {
            e.preventDefault();
            next.focus();
        }
    });
});

