export const CONFIG = {
    MAP_SIZES: {
        small:  { width: 25, height: 20 },
        medium: { width: 40, height: 32 },
        large:  { width: 60, height: 48 },
    },

    HEX_SIZE: 38,

    TERRAIN_COLORS: {
        water:     0x1b4f72,
        beach:     0xd4b483,
        jungle:    0x1e6b2e,
        swamp:     0x3d5c3a,
        plains:    0x7a9e5a,
        hills:     0x8b7355,
        mountains: 0x707080,
        rocks:     0x595959,
        volcano:   0x8b2200,
    },

    TERRAIN_BORDER_COLORS: {
        water:     0x0d2a44,
        beach:     0xa07840,
        jungle:    0x0a3a18,
        swamp:     0x1d3c1a,
        plains:    0x3a5e2a,
        hills:     0x5b4535,
        mountains: 0x484858,
        rocks:     0x383838,
        volcano:   0x5b1100,
    },

    TERRAIN_ICONS: {
        water:     '🌊',
        beach:     '🏖️',
        jungle:    '🌴',
        swamp:     '🌿',
        plains:    '🌾',
        hills:     '⛰️',
        mountains: '🏔️',
        rocks:     '🪨',
        volcano:   '🌋',
    },

    TERRAIN_NAMES: {
        water:     'Open Water',
        beach:     'Beach',
        jungle:    'Jungle',
        swamp:     'Swamp',
        plains:    'Plains',
        hills:     'Hills',
        mountains: 'Mountains',
        rocks:     'Rocky Outcrop',
        volcano:   'Volcano',
    },

    // AP to enter terrain (paid when moving INTO hex along a discovered path)
    TERRAIN_MOVE_COST: {
        water:     999,
        beach:     1,
        jungle:    2,
        swamp:     2,
        plains:    1,
        hills:     2,
        mountains: 3,
        rocks:     2,
        volcano:   3,
    },

    AP_PER_DAY: 10,

    AP_COSTS: {
        move:             1,
        moveHills:        2,
        moveMountain:     3,
        moveSwamp:        2,
        scavenge:         2,
        forage:           2,
        collect:          1,
        fish:             3,
        exploreStructure: 2,
        eat:              0,
        drink:            0,
        rest:             2,
        craft:            2,
    },

    PLAYER_STATS: {
        hp:        100,
        maxHp:     100,
        food:      80,
        maxFood:   100,
        water:     80,
        maxWater:  100,
        energy:    100,
        maxEnergy: 100,
    },

    DAILY_FOOD_COST:   20,
    DAILY_WATER_COST:  25,
    DAILY_ENERGY_COST: 15,

    STARVATION_DAMAGE:    15,
    DEHYDRATION_DAMAGE:   20,
    EXHAUSTION_DAMAGE:    10,

    FOG_ALPHA: {
        undiscovered: 1.0,
        preview:      0.65,
        visited:      0.35,
        current:      0.0,
    },

    WATER_SOURCE_CHANCE: {
        water:     0.0,
        beach:     0.05,
        jungle:    0.25,
        swamp:     0.20,
        plains:    0.08,
        hills:     0.12,
        mountains: 0.15,
        rocks:     0.10,
        volcano:   0.05,
    },
    WATER_SOURCE_MAX_PERCENT: 0.20,

    // Loot search probabilities
    MATERIAL_CHANCE: 0.70,
    FOOD_CHANCE:     0.35,
    EVENT_CHANCE:    0.06, // chance of triggering random event on move

    // AP cost to discover (explore for the first time) a path to an adjacent hex.
    // Paid once; after discovery that connection costs PATH_TRAVEL_COST to traverse.
    pathDiscoveryCostByTerrain: {
        beach:     2,
        plains:    2,
        jungle:    3,
        hills:     3,
        mountains: 3,
        rocks:     3,
        swamp:     2,
        volcano:   3,
    },

    // AP cost to travel along an already-discovered path (always 1).
    PATH_TRAVEL_COST: 1,

    ISLAND_MARGIN: 3,

    MIN_ZOOM:  0.35,
    MAX_ZOOM:  4.0,
    ZOOM_STEP: 0.12,
    INITIAL_GAME_ZOOM: 3.2,

    MOVE_ANIMATION_DURATION: 220,

    // Real-time seconds per 1 AP spent on an action timer
    ACTION_TIMER_SECS_PER_AP: 5,

    // Probability (0–1) that a volcano spawns on any given map
    VOLCANO_CHANCE: 0.40,

    MAX_MESSAGES: 22,
};
