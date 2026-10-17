const MAX_MOVE_SPEED = 1500;
const MOVE_TOLERANCE = 80;
const ATTACK_ARC = Math.PI * 0.65;
const WIRE_COOLDOWN_MS = 900;
const WIRE_STUN_MS = 1000;
const GUARD_DURATION_MS = 500;
const JUST_GUARD_WINDOW_MS = 100;
// The sword is the parrying weapon: its just-guard window is twice as forgiving.
const SWORD_JUST_GUARD_WINDOW_MS = 200;
// A just guard against a melee hit blocks it and staggers the attacker this long.
const PARRY_STAGGER_MS = 600;
// The hammer's third hit briefly stuns players too (mobs get MOB_HIT_IMPACT's stun).
const HAMMER_FINISHER_PLAYER_STUN_MS = 300;
// Dual blades hit harder from the side or behind (target facing more than 90° away).
const DUAL_FLANK_DAMAGE_MULT = 1.3;
const BOW_ARROW_DAMAGE = 14;
const MAX_CHAT_LENGTH = 50;
const MAX_NAME_LENGTH = 10;
// World size. The client shows a 1280x640 viewport that follows the player.
const GAME_WIDTH = 3840;
const GAME_HEIGHT = 1920;
const WORLD_MARGIN = 25;
// Longest straight line inside the widest view, measured in world units: 1536 wide and
// 640 / 0.7 tall because the tilted ground shows more world vertically (~1790).
// Arrows fly to the screen edge.
const BOW_MAX_DISTANCE = 1850;
const ATTACK_PROFILES = {
    sword: { reach: 85, arc: Math.PI * 0.65, lineWidth: 20 },
    hammer: { reach: 96, arc: Math.PI * 0.5, lineWidth: 22 },
    spear: { reach: 126, arc: Math.PI * 0.14, lineWidth: 40 },
    dual: { reach: 72, arc: Math.PI * 0.72, lineWidth: 18 },
    bow: { reach: 560, arc: Math.PI * 0.08, lineWidth: 8 },
    scythe: { reach: 105, arc: Math.PI * 0.4, lineWidth: 22 },
    gauntlet: { reach: 62, arc: Math.PI * 0.5, lineWidth: 18 },
    // The staff's reach is how far its orb flies.
    staff: { reach: 380, arc: Math.PI * 0.08, lineWidth: 10 },
};
// The third hit of a combo reaches further (and, for the spear, wider).
const COMBO_FINISHER = {
    hammer: { reach: 1.25, width: 1 },
    spear: { reach: 1.35, width: 1.4 },
    scythe: { reach: 1.15, width: 1 },
};
// Knockback (px) and stun (ms) that melee hits apply to mobs. The hammer's finisher
// pushes less than its reach so stunned mobs stay in range for the next swing.
const MOB_HIT_IMPACT = {
    hammer: { knockback: 30, finisherKnockback: 60, finisherStunMs: 600 },
    spear: { knockback: 18, finisherKnockback: 50, finisherStunMs: 0 },
    // Negative knockback pulls toward the attacker.
    scythe: { knockback: 0, finisherKnockback: -70, finisherStunMs: 300 },
};
// The scythe's third hit drags players to this distance in front of the attacker.
const SCYTHE_PULL_DISTANCE = 48;
// The gauntlet's third hit stops the target from guarding for this long.
const GAUNTLET_GUARD_BREAK_MS = 1000;
// Staff orbs fly slowly and burst on the first body they touch or at the end of their path,
// leaving a burning patch behind.
const STAFF_ORB = {
    speed: 600,
    hitRadius: 24,
    blastRadius: 56,
    finisherBlastScale: 1.4,
    damage: 16,
    finisherDamage: 26,
    patchRadius: 50,
    patchMs: 1500,
    patchTickMs: 500,
    patchDamage: 4,
};
// Secondary skills: cooldowns are checked on the server too (with a little slack for lag).
// Long enough that crowd control (wire pull, ash stun, trap root) can't be chained into a lock.
const SKILL_COOLDOWN_MS = { wire: 7000, ash: 8000, gear: 5000, trap: 8000, blink: 10000, potion: 14000 };
const SKILL_COOLDOWN_SLACK_MS = 150;
const TRAP = { maxPerOwner: 2, lifetimeMs: 30000, armMs: 400, radius: 32, rootMs: 1200, mobStunMs: 1500, damage: 6 };
const BLINK_MARK_MS = 4000;
// Set down at your feet, like a healing field.
const HEAL_POTION = { radius: 90, durationMs: 3000, tickMs: 500, healPerTick: 4 };
// Upgrades that also power up ultimates: each attack-speed pick shortens the cooldown.
const ULTIMATE_COOLDOWN_CUT_PER_SPEED = 0.08;
const ULTIMATE_MAX_COOLDOWN_CUT = 0.4;
// Angle between the bow ultimate's dragons when projectile upgrades add more.
const DRAGON_SPREAD = 0.16;
// Bow ultimate dragons: all fly at one speed; their body (head back this far) hits what it passes.
const DRAGON = { speed: 800, bodyLength: 380, tickMs: 50 };
// Several pickups can be on the 3840x1920 map at once; a new one spawns every delay
// while the map has fewer than the max.
const HEAL_CROSS_MAX = 5;
const HEAL_CROSS_SPAWN_DELAY_MS = 6000;
const HEAL_CROSS_LIFETIME_MS = 40000;
const HEAL_CROSS_BOUNDS = { xMin: 120, xMax: GAME_WIDTH - 120, yMin: 110, yMax: GAME_HEIGHT - 110 };
const HEAL_CROSS_PICKUP_RADIUS = 34;
const GIANT_POTION_MAX = 2;
const GIANT_POTION_SPAWN_DELAY_MS = 15000;
const GIANT_POTION_LIFETIME_MS = 40000;
const GIANT_POTION_BOUNDS = { xMin: 120, xMax: GAME_WIDTH - 120, yMin: 110, yMax: GAME_HEIGHT - 110 };
const GIANT_POTION_PICKUP_RADIUS = 36;
const GIANT_POTION_DURATION_MS = 9000;
const GIANT_POTION_RECOVERY_STUN_MS = 1000;

// Survivor-style mobs. Each player gets their own swarm; stronger tiers unlock with level.
const MOB_TIERS = [
    { name: '초록', color: '#2ecc71', hp: 16, speed: 70, damage: 3, xp: 1, radius: 14 },
    { name: '파랑', color: '#3498db', hp: 34, speed: 82, damage: 5, xp: 3, radius: 15 },
    { name: '보라', color: '#9b59b6', hp: 65, speed: 92, damage: 8, xp: 6, radius: 17 },
    { name: '주황', color: '#e67e22', hp: 110, speed: 102, damage: 12, xp: 10, radius: 19 },
    { name: '빨강', color: '#e74c3c', hp: 180, speed: 112, damage: 16, xp: 16, radius: 21 },
    { name: '검정', color: '#2c2c2c', hp: 280, speed: 120, damage: 22, xp: 25, radius: 23 },
];
const MOB_LEVELS_PER_TIER = 3;
// Chance of a spawn being the strongest unlocked tier, one below, or two below.
const MOB_TIER_MIX = [0.6, 0.3, 0.1];
const MOB_TICK_MS = 50;
const MOB_SPAWN_INTERVAL_MS = 1100;
const MOB_SPAWN_DISTANCE = { min: 700, max: 860 };
const MOB_MIN_SPAWN_DISTANCE = 450;
const MOB_CONTACT_COOLDOWN_MS = 900;
const MOB_VIEW_DISTANCE = 1000;
const STATS_FLUSH_MS = 150;
// Every BOSS_EVERY_LEVELS levels a player's own boss spawns. Bosses ignore knockback,
// stuns and the spear barrier, and periodically slam the ground around themselves.
const BOSS = {
    everyLevels: 5,
    radius: 44,
    speed: 64,
    hpBase: 500,
    hpPerLevel: 90,
    contactDamageBase: 16,
    xpBase: 40,
    xpPerLevel: 6,
    slamRadius: 150,
    slamWindupMs: 1100,
    slamCooldownMs: 4500,
    slamTriggerDistance: 260,
    slamDamageBase: 24,
    killHealRatio: 0.3,
};
// Players can't be hit by other players for this long after a level-up menu opens.
const UPGRADE_SHIELD_MS = 3000;

const XP_ORB_LIFETIME_MS = 60000;
// Orbs within this distance fly to the player and are collected.
const XP_ORB_PICKUP_RADIUS = 80;
const XP_ORB_MAX_TOTAL = 600;
// Orbs from bow kills fly to the archer from this far away.
const BOW_XP_MAGNET_RANGE = 900;
// Arrows pierce through this many mobs, and nudge each one back a little. A big
// knockback made archers spread damage over the swarm instead of finishing kills.
const BOW_PIERCE = 3;
const BOW_MOB_KNOCKBACK = 10;
// The dual-blade rush: slashes per rush, and how far a slash may stray from the rush's path.
const DUAL_RUSH_SLASH_COUNT = 10;
const RUSH_PATH_SLACK = 60;
// Server-flown shots: speed (px/s), how far they go and how close counts as a hit.
// Wire and ash timings match how fast the client draws them.
const PROJECTILES = {
    bow: { speed: 1300, range: 1000, hitRadius: 26 },
    ash: { speed: 3200, range: 900, hitRadius: 28 },
    wire: { speed: 1600, range: 500, hitRadius: 35 },
};
const XP_ORB_SCATTER_RADIUS = { min: 90, max: 260 };
const XP_ORB_MAX_COUNT_PER_DEATH = 24;

module.exports = {
    MAX_MOVE_SPEED,
    MOVE_TOLERANCE,
    ATTACK_ARC,
    WIRE_COOLDOWN_MS,
    WIRE_STUN_MS,
    GUARD_DURATION_MS,
    JUST_GUARD_WINDOW_MS,
    SWORD_JUST_GUARD_WINDOW_MS,
    PARRY_STAGGER_MS,
    HAMMER_FINISHER_PLAYER_STUN_MS,
    DUAL_FLANK_DAMAGE_MULT,
    BOW_ARROW_DAMAGE,
    MAX_CHAT_LENGTH,
    MAX_NAME_LENGTH,
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    BOW_MAX_DISTANCE,
    ATTACK_PROFILES,
    COMBO_FINISHER,
    MOB_HIT_IMPACT,
    SCYTHE_PULL_DISTANCE,
    GAUNTLET_GUARD_BREAK_MS,
    STAFF_ORB,
    SKILL_COOLDOWN_MS,
    SKILL_COOLDOWN_SLACK_MS,
    TRAP,
    BLINK_MARK_MS,
    HEAL_POTION,
    ULTIMATE_COOLDOWN_CUT_PER_SPEED,
    ULTIMATE_MAX_COOLDOWN_CUT,
    DRAGON_SPREAD,
    DRAGON,
    HEAL_CROSS_MAX,
    HEAL_CROSS_SPAWN_DELAY_MS,
    HEAL_CROSS_LIFETIME_MS,
    HEAL_CROSS_BOUNDS,
    HEAL_CROSS_PICKUP_RADIUS,
    GIANT_POTION_MAX,
    GIANT_POTION_SPAWN_DELAY_MS,
    GIANT_POTION_LIFETIME_MS,
    GIANT_POTION_BOUNDS,
    GIANT_POTION_PICKUP_RADIUS,
    GIANT_POTION_DURATION_MS,
    GIANT_POTION_RECOVERY_STUN_MS,
    MOB_TIERS,
    MOB_LEVELS_PER_TIER,
    MOB_TIER_MIX,
    MOB_TICK_MS,
    MOB_SPAWN_INTERVAL_MS,
    MOB_SPAWN_DISTANCE,
    MOB_MIN_SPAWN_DISTANCE,
    MOB_CONTACT_COOLDOWN_MS,
    MOB_VIEW_DISTANCE,
    STATS_FLUSH_MS,
    BOSS,
    UPGRADE_SHIELD_MS,
    XP_ORB_LIFETIME_MS,
    XP_ORB_PICKUP_RADIUS,
    XP_ORB_MAX_TOTAL,
    BOW_XP_MAGNET_RANGE,
    BOW_MOB_KNOCKBACK,
    BOW_PIERCE,
    PROJECTILES,
    DUAL_RUSH_SLASH_COUNT,
    RUSH_PATH_SLACK,
    XP_ORB_SCATTER_RADIUS,
    XP_ORB_MAX_COUNT_PER_DEATH,
};
