/**
 * Park–Miller LCG — deterministic replacement for Math.random.
 * Call activateSeed(seed) before world generation,
 * then deactivateSeed() immediately after to restore the original Math.random.
 */

let _seed     = 0;
let _original = null;

export function activateSeed(seed) {
    _seed     = (seed >>> 0) || 1;
    _original = Math.random;
    Math.random = _seededRandom;
}

export function deactivateSeed() {
    if (_original !== null) {
        Math.random = _original;
        _original   = null;
    }
}

// Schrage's method — avoids 32-bit overflow
function _seededRandom() {
    _seed = (_seed * 16807) % 2147483647;
    return (_seed - 1) / 2147483646;
}
