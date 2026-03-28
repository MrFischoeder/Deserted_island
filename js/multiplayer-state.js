/**
 * Client-side multiplayer state.
 * Also exports setupMpListeners() — wire all in-game socket events once the game starts.
 */

export const mpState = {
    active:       false,
    roomCode:     null,
    isHost:       false,
    myId:         null,
    myName:       null,
    players:      new Map(),   // socketId → { id, name, q, r, color }
    dayEndedByMe: false,
};

const PLAYER_COLORS = [
    0xff4444, 0x44aaff, 0x44ff88, 0xff8844, 0xcc44ff,
    0xffff44, 0xff44cc, 0x44ffff, 0xaaff44, 0xff8888,
];
let _colorIdx = 0;

export function isMultiplayer() { return mpState.active; }

export function upsertPlayer(id, data) {
    const existing = mpState.players.get(id);
    if (existing) {
        Object.assign(existing, data);
    } else {
        mpState.players.set(id, {
            id,
            name:  data.name || 'Player',
            q:     null,   // null until the player has actually spawned
            r:     null,
            color: PLAYER_COLORS[_colorIdx++ % PLAYER_COLORS.length],
            ...data,
        });
    }
}

export function removePlayer(id)  { mpState.players.delete(id); }

/**
 * Returns all players except the local player that have a known spawn position.
 */
export function getOtherPlayers() {
    return [...mpState.players.values()].filter(
        p => p.id !== mpState.myId && p.q !== null && p.r !== null
    );
}

export function markSelfEndedDay() { mpState.dayEndedByMe = true; }

export function onDayAdvance() {
    mpState.dayEndedByMe = false;
    for (const p of mpState.players.values()) p.endedDay = false;
}

// ── In-game socket listeners ──────────────────────────────────────────────────

export function setupMpListeners() {
    Promise.all([
        import('./network.js'),
        import('./render.js'),
        import('./ui.js'),
        import('./day-cycle.js'),
        import('./state.js'),
    ]).then(([net, render, ui, dayCycle, stateModule]) => {
        const { getHexData, state } = stateModule;

        // ── Player presence ──────────────────────────────────────────────────

        net.on('player:moved', ({ id, q, r }) => {
            upsertPlayer(id, { q, r });
            render.renderOtherPlayers(getOtherPlayers());
        });

        net.on('player:updated', ({ id, ...data }) => {
            upsertPlayer(id, data);
        });

        net.on('player:spawned', ({ id, q, r }) => {
            upsertPlayer(id, { q, r });
            render.renderOtherPlayers(getOtherPlayers());
        });

        /**
         * players:sync — sent by server when we spawn, so we immediately know
         * where all already-spawned players are without waiting for their next move.
         */
        net.on('players:sync', ({ players }) => {
            for (const p of players) {
                if (p.q !== null && p.r !== null) {
                    upsertPlayer(p.id, { name: p.name, q: p.q, r: p.r });
                }
            }
            render.renderOtherPlayers(getOtherPlayers());
        });

        net.on('player:left', ({ id }) => {
            removePlayer(id);
            render.renderOtherPlayers(getOtherPlayers());
            ui.addMessage('A player has left the island.', 'warning');
            import('./search-lock.js').then(m => m.clearPlayerLocks(id));
        });

        // ── Day cycle ────────────────────────────────────────────────────────

        net.on('day:status', (status) => {
            ui.updateDayStatus(status);
        });

        net.on('day:advance', ({ newDay }) => {
            onDayAdvance();
            ui.updateDayStatus(null);
            ui.setEndDayWaiting(false);
            dayCycle.runNightPhase(() => {
                dayCycle.applyNightPhaseMP(newDay);
                import('./location-view.js').then(m => m.render(state.player.q, state.player.r));
            });
        });

        // ── Search locks ─────────────────────────────────────────────────────

        net.on('hex:search-locked', ({ q, r, playerId, type }) => {
            import('./search-lock.js').then(m => m.applyRemoteLock(q, r, playerId, type));
            import('./hex-location-panel.js').then(m => m.refreshLocationPanel());
        });

        net.on('hex:search-unlocked', ({ q, r }) => {
            import('./search-lock.js').then(m => m.applyRemoteUnlock(q, r));
            import('./hex-location-panel.js').then(m => m.refreshLocationPanel());
        });

        // ── Shared world: hex exploration ────────────────────────────────────

        net.on('world:hex-updated', ({ q, r, updates }) => {
            const hexData = getHexData(q, r);
            if (!hexData) return;

            const { discoveredConnections, ...rest } = updates;
            Object.assign(hexData, rest);

            if (discoveredConnections) {
                for (let i = 0; i < 6; i++) {
                    if (discoveredConnections[i]) hexData.discoveredConnections[i] = true;
                }
            }

            if (updates.waterSourceDiscovered) {
                import('./render.js').then(m => m.updateWaterMarker(q, r));
            }
        });

        // ── Shared world: ground loot ─────────────────────────────────────────

        net.on('world:loot-added', ({ q, r, items }) => {
            const hexData = getHexData(q, r);
            if (!hexData) return;
            for (const item of items) {
                const existing = hexData.groundLoot.find(
                    l => l.id === item.id && !l.expiresAtDay && !item.expiresAtDay
                );
                if (existing) {
                    existing.qty += item.qty;
                } else {
                    hexData.groundLoot.push({ ...item });
                }
            }
            ui.refreshGroundLootPanel(q, r);
        });

        net.on('world:loot-taken', ({ q, r, id, qty }) => {
            const hexData = getHexData(q, r);
            if (!hexData) return;
            const idx = hexData.groundLoot.findIndex(l => l.id === id);
            if (idx === -1) return;
            hexData.groundLoot[idx].qty -= qty;
            if (hexData.groundLoot[idx].qty <= 0) hexData.groundLoot.splice(idx, 1);
            ui.refreshGroundLootPanel(q, r);
        });

        net.on('world:loot-cleared', ({ q, r }) => {
            const hexData = getHexData(q, r);
            if (hexData) hexData.groundLoot = [];
            ui.refreshGroundLootPanel(q, r);
        });
    });
}
