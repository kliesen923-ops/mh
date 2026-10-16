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
