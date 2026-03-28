import { CONFIG } from './config.js';
import { state } from './state.js';

// Callback fired (once, deferred) when AP reaches 0 after a spend.
let _onExhausted     = null;
let _exhaustedPending = false;

/**
 * Register a function to call automatically when the player's AP hits 0.
 * Used by game-mode.js to trigger auto end-of-day.
 */
export function registerAPExhaustedCallback(fn) {
    _onExhausted = fn;
}

export function spendAP(amount) {
    if (state.player.ap < amount) return false;
    state.player.ap -= amount;

    // Fire auto-end callback once per AP-exhaustion event
    if (amount > 0 && state.player.ap <= 0 && _onExhausted && !_exhaustedPending) {
        _exhaustedPending = true;
        setTimeout(() => {
            _exhaustedPending = false;
            // Re-check: don't fire if AP was restored in the meantime (e.g. god mode)
            if (state.player.ap <= 0) _onExhausted();
        }, 120);
    }

    return true;
}

export function hasAP(amount) {
    return state.player.ap >= amount;
}

export function refillAP() {
    state.player.ap = state.player.maxAp;
}

export function getAPCostForMove(terrain) {
    return CONFIG.TERRAIN_MOVE_COST[terrain] || 1;
}
