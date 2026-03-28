import { Grid, defineHex, Orientation, Direction, rectangle } from 'honeycomb-grid';
import { CONFIG } from './config.js';
import { state, hexKey, getHexData } from './state.js';

// Direction indices 0-5 mapped to Honeycomb Direction enum (POINTY-TOP orientation).
//
// Honeycomb v4 has 8 direction values: N=0,NE=1,E=2,SE=3,S=4,SW=5,W=6,NW=7.
// For POINTY-TOP hexes, Direction.N and Direction.S return null neighbors
// (those are vertex directions, not edge directions).
// The 6 valid POINTY edge-directions are: NE, E, SE, SW, W, NW.
//
// Visual layout (POINTY-TOP, y-axis pointing down):
//   idx 0 = NW → axial (0,-1)  → upper-left  (angle -120°)
//   idx 1 = NE → axial (1,-1)  → upper-right (angle  -60°)
//   idx 2 = E  → axial (1, 0)  → pure right  (angle    0°)
//   idx 3 = SE → axial (0,+1)  → lower-right (angle  +60°)
//   idx 4 = SW → axial (-1,+1) → lower-left  (angle +120°)
//   idx 5 = W  → axial (-1, 0) → pure left   (angle +180°)
//
// This order matches the SVG hex edges in location-view.js (_edgeDir formula).
export const DIR_ORDER = [
    Direction.NW,  // 0 – upper-left
    Direction.NE,  // 1 – upper-right
    Direction.E,   // 2 – pure right
    Direction.SE,  // 3 – lower-right
    Direction.SW,  // 4 – lower-left
    Direction.W,   // 5 – pure left
];

export const DIR_NAMES = ['NW', 'NE', 'E', 'SE', 'SW', 'W'];

// Index of opposite direction (0↔3, 1↔4, 2↔5)
export const OPPOSITE_DIR = [3, 4, 5, 0, 1, 2];

let HexClass = null;
// Cache: 'q,r' -> Honeycomb hex object for O(1) lookups
let _hexCache = new Map();

export function initGrid(mapSize) {
    const { width, height } = CONFIG.MAP_SIZES[mapSize];
    HexClass = defineHex({
        dimensions: CONFIG.HEX_SIZE,
        orientation: Orientation.POINTY,
        origin: { x: 0, y: 0 },
    });
    state.hexGrid = new Grid(HexClass, rectangle({ width, height }));
    state.gridWidth = width;
    state.gridHeight = height;
    // Build hex cache
    _hexCache.clear();
    state.hexGrid.forEach(hex => {
        _hexCache.set(`${hex.q},${hex.r}`, hex);
    });
}

function _getHex(q, r) {
    return _hexCache.get(`${q},${r}`) || state.hexGrid.getHex({ q, r });
}

/** Returns array of { q, r, dirIndex } for all in-bounds neighbors */
export function getNeighbors(q, r) {
    const hex = _getHex(q, r);
    if (!hex) return [];
    const result = [];
    for (let i = 0; i < 6; i++) {
        try {
            const neighbor = state.hexGrid.neighborOf(hex, DIR_ORDER[i], { allowOutside: false });
            if (neighbor) {
                result.push({ q: neighbor.q, r: neighbor.r, dirIndex: i });
            }
        } catch (_) { /* out of bounds */ }
    }
    return result;
}

/** Get specific neighbor in direction dirIndex; returns { q, r } or null */
export function getNeighborInDir(q, r, dirIndex) {
    const hex = state.hexGrid.getHex({ q, r });
    if (!hex) return null;
    try {
        const neighbor = state.hexGrid.neighborOf(hex, DIR_ORDER[dirIndex], { allowOutside: false });
        if (!neighbor) return null;
        return { q: neighbor.q, r: neighbor.r };
    } catch (_) {
        return null;
    }
}

/** Convert screen coordinates (accounting for camera) to hex { q, r } or null */
export function screenToHex(screenX, screenY) {
    if (!state.hexGrid || !state.cameraContainer) return null;
    const cam = state.cameraContainer;
    const zoom = cam.scale.x;
    const worldX = (screenX - cam.x) / zoom;
    const worldY = (screenY - cam.y) / zoom;
    try {
        const hex = state.hexGrid.pointToHex(
            { x: worldX, y: worldY },
            { allowOutside: false }
        );
        if (!hex) return null;
        if (!state.hexData.has(hexKey(hex.q, hex.r))) return null;
        return { q: hex.q, r: hex.r };
    } catch (_) {
        return null;
    }
}

/** Get pixel center of hex (q, r) in world space */
export function hexToPixel(q, r) {
    if (!state.hexGrid) return { x: 0, y: 0 };
    const hex = _getHex(q, r);
    if (!hex) return { x: 0, y: 0 };
    return { x: hex.x, y: hex.y };
}

/** Create default hex data object */
export function createHexData(q, r, terrain) {
    return {
        q, r,
        terrain,
        elevation: 0,
        moisture: 0,
        // 6-direction connections: physical (generated) and player-known
        connections: [true, true, true, true, true, true],
        discoveredConnections: [false, false, false, false, false, false],
        // Fog of war
        fogState: 'undiscovered',
        visited: false,
        // Exploration states
        resourcesSearched: false,
        lastResourceSearchDay: null,
        resourceRespawnDays: null,
        // Separate cooldowns for Scavenge and Forage
        lastScavengeDay: null,
        scavengeRespawnDays: null,
        lastForageDay: null,
        forageRespawnDays: null,
        pathSearched: false,
        // Water
        hasWaterSource: false,
        waterSourceDiscovered: false,
        // Structure
        persistentStructure: null,
        structureDiscovered: false,
        structureExplored: false,
        // Loot on ground
        groundLoot: [],
        // Description (generated on first visit)
        locationDescription: null,
        // Wildlife
        wildlifePresent: false,
        wildlifeId: null,
        // Player camp
        hasCamp: false,
        campStructures: [],       // [{ id, builtAtDay, items? }]
        // Island classification (populated by island-generator)
        isMainIsland:    false,
        isIslet:         false,
        isSpawnEligible: false,
    };
}
