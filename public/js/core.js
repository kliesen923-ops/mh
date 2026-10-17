const socket = window.io ? io() : { on() {}, emit() {}, id: null };
const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 640;
const VIEW_Y_SCALE = 0.7;
// The world is larger than the 1280x640 viewport; the camera follows the player.
const WORLD_WIDTH = 3840;
const WORLD_HEIGHT = 1920;
const camera = { x: 0, y: 0 };
const WEAPON_PRESETS = {
    sword: { label: '한손검', stats: { dmg: 1.0, range: 1.0, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 } },
    hammer: { label: '망치', stats: { dmg: 1.8, range: 1.0, speed: 0.68, move: 0.9, dodge: 1.0, projectile: 1.0, hp: 120 } },
    spear: { label: '창', stats: { dmg: 1.24, range: 1.34, speed: 1.0, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 } },
    dual: { label: '쌍검', stats: { dmg: 0.82, range: 0.82, speed: 1.45, move: 1.02, dodge: 1.0, projectile: 1.0, hp: 92 } },
    bow: { label: '활', stats: { dmg: 1.2, range: 1.0, speed: 0.84, move: 1.08, dodge: 1.0, projectile: 1.0, hp: 90 } },
    scythe: { label: '낫', stats: { dmg: 1.3, range: 1.0, speed: 0.85, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 100 } },
    gauntlet: { label: '건틀릿', stats: { dmg: 0.7, range: 1.0, speed: 1.7, move: 1.05, dodge: 1.0, projectile: 1.0, hp: 95 } },
    staff: { label: '지팡이', stats: { dmg: 1.0, range: 1.0, speed: 0.8, move: 1.0, dodge: 1.0, projectile: 1.0, hp: 85 } },
};
const ATTACK_PROFILES = {
    sword: { reach: 85, arc: Math.PI * 0.65, lineWidth: 20 },
    hammer: { reach: 96, arc: Math.PI * 0.5, lineWidth: 22 },
    spear: { reach: 126, arc: Math.PI * 0.14, lineWidth: 40 },
    dual: { reach: 72, arc: Math.PI * 0.72, lineWidth: 18 },
    bow: { reach: 560, arc: Math.PI * 0.08, lineWidth: 8 },
    scythe: { reach: 105, arc: Math.PI * 0.4, lineWidth: 22 },
    gauntlet: { reach: 62, arc: Math.PI * 0.5, lineWidth: 18 },
    staff: { reach: 380, arc: Math.PI * 0.08, lineWidth: 10 },
};
// The third hit of a combo reaches further (and, for the spear, wider). Matches the server.
const COMBO_FINISHER = {
    hammer: { reach: 1.25, width: 1 },
    spear: { reach: 1.35, width: 1.4 },
    scythe: { reach: 1.15, width: 1 },
};
// Attack-speed picks shorten the ultimate cooldown (matches the server).
const ULTIMATE_COOLDOWN_CUT_PER_SPEED = 0.08;
const ULTIMATE_MAX_COOLDOWN_CUT = 0.4;
const ULTIMATE_NAMES = {
    sword: '검기 난무',
    hammer: '대지 분쇄',
    spear: '반사 결계',
    bow: '용의 화살',
    dual: '광폭화',
    scythe: '사신의 원무',
    gauntlet: '연타 러시',
    staff: '운석 낙하',
};
const SKILL_PRESETS = {
    wire: { label: '땡겨', cooldown: 2.0 },
    ash: { label: '애쉬궁', cooldown: 2.0 },
    gear: { label: '입체기동', cooldown: 3.0 },
    trap: { label: '덫', cooldown: 6.0 },
    blink: { label: '표식', cooldown: 10.0 },
    potion: { label: '포션', cooldown: 14.0 },
};
// Staff orb numbers the HUD shows (matches the server's STAFF_ORB).
const STAFF_ORB_DAMAGE = 16;
const STAFF_ORB_FINISHER_DAMAGE = 26;
const BLINK_MARK_SEC = 4;
// How far the ash arrow flies (matches the server's PROJECTILES.ash).
const ASH_RANGE = 900;
const ULTIMATE_PRESETS = {
    sword: { cooldown: 11.0, duration: 1.2 },
    hammer: { cooldown: 13.0, duration: 0.7 },
    spear: { cooldown: 15.0, duration: 2.2 },
    bow: { cooldown: 14.0, duration: 0.8 },
    dual: { cooldown: 14.0, duration: 4.0 },
    scythe: { cooldown: 13.0, duration: 0.9 },
    gauntlet: { cooldown: 12.0, duration: 0.7 },
    staff: { cooldown: 15.0, duration: 1.0 },
};
const DUAL_RUSH_WINDUP_SEC = 0.18;
const DUAL_RUSH_SLASH_INTERVAL_SEC = 0.025;
const DUAL_RUSH_SLASH_COUNT = 10;
const GUARD_DURATION_SEC = 0.5;
const JUST_GUARD_WINDOW_SEC = 0.1;

let gameState = 'TITLE', isChatting = false, isUpgrading = false, myId = null, allPlayers = {};
const UPGRADE_PICK_SECONDS = 6;
let pendingUpgrades = 0, upgradeTimerInterval = null, upgradeTimeLeft = UPGRADE_PICK_SECONDS;
let pendingAuth = null;
let lastDeathSummary = null;
let lastDeathRecords = null;
let currentSession = null;
const isLocalAuthBypass = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
let selectedWeapon = 'sword';
let selectedSkill = 'wire';
let combatEffects = [];
let ashProjectiles = [];
let bowProjectiles = [];
let dragonProjectiles = [];
let staffOrbs = [];
let staffBlasts = [];
let fieldFx = [];
let fieldState = { traps: [], zones: [], marks: [] };
let healingCrosses = [];
let healingTexts = [];
let giantPotions = [];
let mobs = new Map();
let mobTiers = [];
let mobDeathEffects = [];
let xpOrbs = [];
let collectingOrbs = [];
let damageTexts = [];
let ultimateBanners = [];
const seenUltimateStarts = {};
const screenShake = { until: 0, strength: 0 };
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
        angle: 0,
        angles: [],
        x: 0,
        y: 0,
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
    upgradeCounts: { dmg: 0, range: 0, speed: 0, move: 0, dodge: 0, projectile: 0, hp: 0 },
    giantScale: 1,
    giantAttackMult: 1,
    giantActive: false,
    giantEndsAt: 0,
    giantRecoveryEndsAt: 0,
    gearRush: createDefaultGearRush(),
    ultimate: createDefaultUltimate(),
    skill: 'wire'
};

// The view is always GAME_HEIGHT tall; its width follows the screen's aspect ratio
// (within limits) so phones get no black bars at the sides.
const MIN_VIEW_ASPECT = 1.6;
const MAX_VIEW_ASPECT = 2.4;
// Screen height the touch control layout (hud.css) is measured against.
const CONTROLS_DESIGN_HEIGHT = 591;
function resize() {
    const screenW = Math.max(1, window.innerWidth);
    const screenH = Math.max(1, window.innerHeight);
    const aspect = Math.max(MIN_VIEW_ASPECT, Math.min(MAX_VIEW_ASPECT, screenW / screenH));
    canvas.height = GAME_HEIGHT;
    canvas.width = Math.round(GAME_HEIGHT * aspect);
    const cssWidth = Math.min(screenW, screenH * aspect);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssWidth / aspect}px`;
    const scale = Math.max(0.1, Math.min(screenW / GAME_WIDTH, screenH / GAME_HEIGHT, 1));
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    document.documentElement.style.setProperty('--game-ui-scale', String(scale));
    document.documentElement.style.setProperty('--hud-scale', String(Math.max(0.62, scale)));
    // Touch controls are laid out for a 591px-tall screen and scale with the screen height, so
    // their size and distance from the edges stay the same share of the screen (and so about
    // the same distance from the thumbs on any phone). Capped so tablets and PCs don't get huge buttons.
    document.documentElement.style.setProperty('--touch-scale', String(Math.max(0.5, Math.min(1, screenH / CONTROLS_DESIGN_HEIGHT))));
}
window.addEventListener('resize', resize); resize();
