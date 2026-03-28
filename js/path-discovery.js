import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { getNeighbors, getNeighborInDir, OPPOSITE_DIR } from './grid.js';

const BLOCK_TERRAINS = new Set(['mountains', 'volcano']);

/**
 * Returns the AP cost to discover a path leading into the given terrain type.
 */
export function getPathDiscoveryCost(terrain) {
    return CONFIG.pathDiscoveryCostByTerrain[terrain] ?? 2;
}

/**
 * Auto-discover connections when entering or spawning on a hex.
 * Only marks water and impassable-terrain neighbors as known-blocked (free — they are visible).
 * All other directions remain undiscovered until the player explicitly explores them.
 */
export function autoDiscoverConnections(q, r) {
    const data = getHexData(q, r);
    if (!data) return;

    const neighbors = getNeighbors(q, r);
    for (const nb of neighbors) {
        const nbData = getHexData(nb.q, nb.r);
        // Out-of-bounds or water: obviously not traversable, mark as seen
        if (!nbData || nbData.terrain === 'water') {
            data.discoveredConnections[nb.dirIndex] = true;
            continue;
        }
        // Impassable terrain (cliffs, volcano): visible from outside
        if (BLOCK_TERRAINS.has(nbData.terrain)) {
            data.discoveredConnections[nb.dirIndex] = true;
            continue;
        }
        // Everything else stays undiscovered until the player tries to enter
    }
}

/**
 * Discovers the path from (fromQ, fromR) in the given direction.
 * Does NOT spend AP — the caller is responsible for AP deduction.
 * Marks discoveredConnections in both directions (bidirectional path).
 * Syncs to other players in multiplayer.
 *
 * @returns {{ open: boolean, reason: string }}
 *   open = true  → path exists and is traversable
 *   open = false → path leads to blocked / impassable terrain
 */
export function discoverPath(fromQ, fromR, dirIndex) {
    const fromData = getHexData(fromQ, fromR);
    if (!fromData) return { open: false, reason: 'Invalid position.' };

    const nb = getNeighborInDir(fromQ, fromR, dirIndex);
    if (!nb) return { open: false, reason: 'No hex in that direction.' };

    const toData = getHexData(nb.q, nb.r);

    // Mark from-side as discovered regardless of what is found
    fromData.discoveredConnections[dirIndex] = true;

    if (!toData || toData.terrain === 'water') {
        _syncHexPath(fromQ, fromR, fromData, dirIndex, null, null, null);
        return { open: false, reason: "That's the ocean." };
    }
    if (BLOCK_TERRAINS.has(toData.terrain)) {
        _syncHexPath(fromQ, fromR, fromData, dirIndex, null, null, null);
        return { open: false, reason: 'Impassable terrain blocks the way.' };
    }

    // Bidirectional: mark reverse direction on destination hex too
    const oppDir = OPPOSITE_DIR[dirIndex];
    if (oppDir !== undefined) {
        toData.discoveredConnections[oppDir] = true;
    }

    _syncHexPath(fromQ, fromR, fromData, dirIndex, nb.q, nb.r, toData, oppDir);

    const open = !!fromData.connections[dirIndex];
    return { open, reason: open ? '' : 'The path leads to a dead end.' };
}

/**
 * Check if the player can move from (fromQ, fromR) in dirIndex.
 * Requires the path to already be discovered (discoveredConnections) and open (connections).
 */
export function canMoveTo(fromQ, fromR, dirIndex) {
    const fromData = getHexData(fromQ, fromR);
    if (!fromData) return { canMove: false, reason: 'Invalid position.' };

    const nb = getNeighborInDir(fromQ, fromR, dirIndex);
    if (!nb) return { canMove: false, reason: 'No hex in that direction.' };

    const toData = getHexData(nb.q, nb.r);
    if (!toData) return { canMove: false, reason: 'No hex there.' };

    if (toData.terrain === 'water') return { canMove: false, reason: "That's the ocean." };

    if (BLOCK_TERRAINS.has(toData.terrain)) {
        return { canMove: false, reason: 'Impassable terrain.' };
    }

    if (!fromData.discoveredConnections[dirIndex]) {
        return { canMove: false, reason: 'Path not yet discovered.' };
    }

    if (!fromData.connections[dirIndex]) {
        return { canMove: false, reason: 'The way is blocked.' };
    }

    return { canMove: true, reason: '' };
}

// ── Internal sync helpers ─────────────────────────────────────────────────────

function _syncHexPath(fromQ, fromR, fromData, dirIndex, toQ, toR, toData, oppDir) {
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (!isMultiplayer()) return;
        import('./network.js').then(m => {
            // Sync from-hex discovery
            m.emit('world:hex-update', {
                q: fromQ, r: fromR,
                updates: {
                    discoveredConnections: [...fromData.discoveredConnections],
                },
            });
            // Sync to-hex reverse discovery if applicable
            if (toData && oppDir !== undefined) {
                m.emit('world:hex-update', {
                    q: toQ, r: toR,
                    updates: {
                        discoveredConnections: [...toData.discoveredConnections],
                    },
                });
            }
        });
    });
}
