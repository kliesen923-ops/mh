const MAX_MOVE_SPEED = 1500;
const MOVE_TOLERANCE = 80;
const ATTACK_ARC = Math.PI * 0.65;
const WIRE_COOLDOWN_MS = 900;
const WIRE_STUN_MS = 1000;
const GUARD_DURATION_MS = 500;
const JUST_GUARD_WINDOW_MS = 100;
const MAX_CHAT_LENGTH = 50;
const MAX_NAME_LENGTH = 10;
// World size. The client shows a 1280x640 viewport that follows the player.
const GAME_WIDTH = 3840;
const GAME_HEIGHT = 1920;
const WORLD_MARGIN = 25;
const ATTACK_PROFILES = {
    sword: { reach: 85, arc: Math.PI * 0.65, lineWidth: 20 },
    hammer: { reach: 78, arc: Math.PI * 0.42, lineWidth: 22 },
    spear: { reach: 126, arc: Math.PI * 0.14, lineWidth: 24 },
    dual: { reach: 72, arc: Math.PI * 0.72, lineWidth: 18 },
    bow: { reach: 560, arc: Math.PI * 0.08, lineWidth: 8 },
};
const HEAL_CROSS_SPAWN_DELAY_MS = 18000;
const HEAL_CROSS_LIFETIME_MS = 12000;
const HEAL_CROSS_BOUNDS = { xMin: 120, xMax: GAME_WIDTH - 120, yMin: 110, yMax: GAME_HEIGHT - 110 };
const HEAL_CROSS_PICKUP_RADIUS = 34;
const GIANT_POTION_SPAWN_DELAY_MS = 28000;
const GIANT_POTION_LIFETIME_MS = 14000;
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
// Players can't be hit by other players for this long after a level-up menu opens.
const UPGRADE_SHIELD_MS = 3000;

const XP_ORB_LIFETIME_MS = 60000;
const XP_ORB_PICKUP_RADIUS = 48;
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
    MAX_CHAT_LENGTH,
    MAX_NAME_LENGTH,
    GAME_WIDTH,
    GAME_HEIGHT,
    WORLD_MARGIN,
    ATTACK_PROFILES,
    HEAL_CROSS_SPAWN_DELAY_MS,
    HEAL_CROSS_LIFETIME_MS,
    HEAL_CROSS_BOUNDS,
    HEAL_CROSS_PICKUP_RADIUS,
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
    UPGRADE_SHIELD_MS,
    XP_ORB_LIFETIME_MS,
    XP_ORB_PICKUP_RADIUS,
    XP_ORB_SCATTER_RADIUS,
    XP_ORB_MAX_COUNT_PER_DEATH,
};
