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
document.getElementById('btn-signup')?.addEventListener('click', () => {
    requestGameFullscreen();
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

