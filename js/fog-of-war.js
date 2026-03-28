import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { getNeighbors } from './grid.js';
import { updateHexFog, updateAllFog } from './render.js';

/** Set all hexes to undiscovered (called at game start) */
export function initFog() {
    state.hexData.forEach(data => {
        data.fogState = 'undiscovered';
    });
}

/**
 * Update fog when player moves to (q, r).
 * - Previous current -> visited
 * - All old previews -> undiscovered (if never visited) or visited
 * - New position -> current
 * - Reachable neighbors of new position -> preview
 */
export function updateFogForPosition(q, r) {
    // Reset all existing preview/current states
    state.hexData.forEach(data => {
        if (data.fogState === 'current') {
            data.fogState = 'visited';
        } else if (data.fogState === 'preview') {
            // Previews that were never visited go back to undiscovered
            data.fogState = data.visited ? 'visited' : 'undiscovered';
        }
    });

    // Set new current
    const cur = getHexData(q, r);
    if (cur) {
        cur.fogState = 'current';
        cur.visited  = true;
    }

    // Set preview for reachable neighbors
    const neighbors = getNeighbors(q, r);
    for (const nb of neighbors) {
        const nbData = getHexData(nb.q, nb.r);
        if (!nbData) continue;
        if (nbData.fogState === 'visited' || nbData.fogState === 'current') continue;
        // Only preview if there is a legal connection OR we just show all adjacent
        // (player can see all direct neighbors even if connection is not yet discovered)
        if (nbData.fogState === 'undiscovered') {
            nbData.fogState = 'preview';
        }
    }

    // Refresh all fog graphics
    updateAllFog();
}

/** God mode: reveal/hide all */
export function setGodMode(enabled) {
    state.godMode = enabled;
    updateAllFog();
}

export function getFogAlpha(fogState) {
    if (state.godMode) return 0.0;
    return CONFIG.FOG_ALPHA[fogState] ?? 1.0;
}
