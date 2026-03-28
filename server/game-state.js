'use strict';

function makePlayerState(socketId, name, spawnIndex) {
    return {
        id: socketId,
        name,
        spawnIndex,
        q: 0, r: 0,
        ap: 10, maxAp: 10,
        hp: 100, food: 80, water: 80, energy: 100,
    };
}

function buildSpawnAssignments(room) {
    const assignments = {};
    let i = 0;
    for (const [id] of room.players) assignments[id] = i++;
    return assignments;
}

// ── Shared world state per room ───────────────────────────────────────────────
// Keyed by "q,r". Stores only the fields that must be shared across all players:
//
//   resourcesSearched     — has any player searched this hex for resources?
//   lastResourceSearchDay — which game-day was it last searched? (respawn: 3–5 days)
//   resourceRespawnDays   — random 3–5, set on search
//   waterSourceDiscovered — freshwater source found by any player
//   structureDiscovered   — persistent structure found by any player
//
//   discoveredConnections — array[6] of booleans, OR-merged across all players.
//                           When one player discovers a path it is available to all
//                           (shared world, single exploration cost).
//
//   groundLoot            — items left loose on the hex (expire after 2–3 days).
//                           Only items in camp structures are truly persistent.

function _ws(room) {
    if (!room.worldState) room.worldState = new Map();
    return room.worldState;
}

function _key(q, r) { return `${q},${r}`; }

function getWorldHex(room, q, r) {
    return _ws(room).get(_key(q, r)) || {};
}

function applyHexUpdate(room, q, r, updates) {
    const ws  = _ws(room);
    const key = _key(q, r);
    const cur = ws.get(key) || {};

    // discoveredConnections: OR-merge so that a discovered path is never forgotten
    if (updates.discoveredConnections && cur.discoveredConnections) {
        updates = {
            ...updates,
            discoveredConnections: updates.discoveredConnections.map(
                (v, i) => v || cur.discoveredConnections[i]
            ),
        };
    }
    ws.set(key, { ...cur, ...updates });
}

function applyLootAdd(room, q, r, items) {
    const ws  = _ws(room);
    const key = _key(q, r);
    const cur = ws.get(key) || {};
    const loot = cur.groundLoot ? [...cur.groundLoot] : [];

    for (const item of items) {
        const idx = loot.findIndex(
            l => l.id === item.id && !l.expiresAtDay && !item.expiresAtDay
        );
        if (idx !== -1) {
            loot[idx] = { ...loot[idx], qty: loot[idx].qty + item.qty };
        } else {
            loot.push({ ...item });
        }
    }
    ws.set(key, { ...cur, groundLoot: loot });
}

function applyLootTake(room, q, r, id, qty) {
    const ws  = _ws(room);
    const key = _key(q, r);
    const cur = ws.get(key) || {};
    let loot  = cur.groundLoot ? [...cur.groundLoot] : [];

    const idx = loot.findIndex(l => l.id === id);
    if (idx !== -1) {
        loot[idx] = { ...loot[idx], qty: loot[idx].qty - qty };
        if (loot[idx].qty <= 0) loot.splice(idx, 1);
    }
    ws.set(key, { ...cur, groundLoot: loot });
}

function applyLootClear(room, q, r) {
    const ws  = _ws(room);
    const key = _key(q, r);
    const cur = ws.get(key) || {};
    ws.set(key, { ...cur, groundLoot: [] });
}

// ── Search locks ──────────────────────────────────────────────────────────────
// Stored separately from worldState since they are transient (timer-scoped).

function _sl(room) {
    if (!room.searchLocks) room.searchLocks = new Map();
    return room.searchLocks;
}

function applySearchLock(room, q, r, playerId, type) {
    _sl(room).set(_key(q, r), { playerId, type });
}

function applySearchUnlock(room, q, r) {
    _sl(room).delete(_key(q, r));
}

/** Remove all locks held by playerId; returns [{q,r}] of released hexes. */
function clearPlayerSearchLocks(room, playerId) {
    const released = [];
    for (const [key, lock] of _sl(room)) {
        if (lock.playerId === playerId) {
            _sl(room).delete(key);
            const [q, r] = key.split(',').map(Number);
            released.push({ q, r });
        }
    }
    return released;
}

module.exports = {
    makePlayerState, buildSpawnAssignments,
    getWorldHex, applyHexUpdate,
    applyLootAdd, applyLootTake, applyLootClear,
    applySearchLock, applySearchUnlock, clearPlayerSearchLocks,
};
