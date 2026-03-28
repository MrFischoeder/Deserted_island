/**
 * search-lock.js
 * Client-side search lock state.
 * Prevents concurrent Scavenge / Forage on the same hex in multiplayer.
 */

const _locks = new Map(); // 'q,r' → { playerId, type }

/** True if any player currently holds a search lock on this hex. */
export function isSearchLocked(q, r) {
    return _locks.has(`${q},${r}`);
}

export function getSearchLock(q, r) {
    return _locks.get(`${q},${r}`) || null;
}

/** Acquire lock locally and broadcast to server in multiplayer. */
export function acquireLock(q, r, type) {
    _locks.set(`${q},${r}`, { playerId: '__local__', type });
    _broadcast('hex:search-lock', { q, r, type });
}

/** Release lock locally and broadcast to server. */
export function releaseLock(q, r) {
    if (!_locks.has(`${q},${r}`)) return;
    _locks.delete(`${q},${r}`);
    _broadcast('hex:search-unlock', { q, r });
}

/** Called when server forwards another player's lock event. */
export function applyRemoteLock(q, r, playerId, type) {
    _locks.set(`${q},${r}`, { playerId, type });
}

/** Called when server forwards another player's unlock event. */
export function applyRemoteUnlock(q, r) {
    _locks.delete(`${q},${r}`);
}

/** Remove all locks held by a given player (called when they disconnect). */
export function clearPlayerLocks(playerId) {
    for (const [key, lock] of _locks) {
        if (lock.playerId === playerId) _locks.delete(key);
    }
}

function _broadcast(event, data) {
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (!isMultiplayer()) return;
        import('./network.js').then(m => m.emit(event, data));
    });
}
