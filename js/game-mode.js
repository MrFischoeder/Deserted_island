import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { getNeighbors, getNeighborInDir, DIR_ORDER, DIR_NAMES, OPPOSITE_DIR, hexToPixel } from './grid.js';
import { animatePlayerMove } from './movement-animation.js';
import { updateFogForPosition } from './fog-of-war.js';
import { autoDiscoverConnections, discoverPath, getPathDiscoveryCost } from './path-discovery.js';
import { renderPlayer, centerCameraOnPlayer, renderHex, refreshPlayerOffsets } from './render.js';
import { closeLocationPanel } from './hex-location-panel.js';
import { addMessage, updateHUD, showModal, setEndDayWaiting, showPathDiscoveryConfirm } from './ui.js';
import { spendAP, hasAP, getAPCostForMove, registerAPExhaustedCallback } from './action-points.js';
import { endDay, runNightPhase } from './day-cycle.js';
import { isMountainTerrain, climbMountain } from './mountain-traversal.js';
import { generateDescription } from './location-descriptions.js';
import { triggerRandomEvent } from './events.js';
import { showIntro } from './intro.js';
import { isMultiplayer, markSelfEndedDay } from './multiplayer-state.js';
import { startActionTimer, isTimerActive } from './action-timer.js';

// =================== SPAWN ===================

export function spawnPlayer(spawnIndex = null) {
    // Register AP-exhaustion → auto end day
    registerAPExhaustedCallback(handleEndDay);

    // Priority 1: spawn-eligible hexes (main-island beach, flagged by generator)
    let beaches = [];
    state.hexData.forEach(data => { if (data.isSpawnEligible) beaches.push(data); });

    // Priority 2: any main-island beach
    if (beaches.length === 0) {
        state.hexData.forEach(data => {
            if (data.terrain === 'beach' && data.isMainIsland) beaches.push(data);
        });
    }

    // Priority 3: any coastal beach (borders water)
    if (beaches.length === 0) {
        state.hexData.forEach(data => {
            if (data.terrain !== 'beach') return;
            const bordersWater = getNeighbors(data.q, data.r).some(nb => {
                const nd = getHexData(nb.q, nb.r);
                return nd && nd.terrain === 'water';
            });
            if (bordersWater) beaches.push(data);
        });
    }

    // Priority 4: any non-water land (last resort)
    if (beaches.length === 0) {
        state.hexData.forEach(d => { if (d.terrain !== 'water') beaches.push(d); });
        if (beaches.length === 0) return;
    }

    // Sort for deterministic multiplayer index-based selection
    beaches.sort((a, b) => (a.q - b.q) || (a.r - b.r));

    let spawn;
    if (spawnIndex !== null) {
        spawn = beaches[spawnIndex % beaches.length];
    } else {
        spawn = beaches[Math.floor(Math.random() * beaches.length)];
    }

    state.player.q = spawn.q;
    state.player.r = spawn.r;
    spawn.visited  = true;
    spawn.fogState = 'current';

    generateDescription(spawn.q, spawn.r);
    autoDiscoverConnections(spawn.q, spawn.r);
    updateFogForPosition(spawn.q, spawn.r);
    renderPlayer();
    refreshPlayerOffsets();

    if (isMultiplayer()) {
        import('./network.js').then(m => m.emit('player:spawned', { q: spawn.q, r: spawn.r }));
    }

    // Init location view and render it for the spawn hex
    import('./location-view.js').then(m => m.render(spawn.q, spawn.r));

    setTimeout(() => showIntro(spawn.q, spawn.r), 160);
}

// =================== HEX CLICK ===================

export function onHexClick(q, r) {
    if (!state.gameStarted) return;
    if (state.isAnimating) return;
    if (isTimerActive()) return;
    if (state.activeModal && state.activeModal !== 'location-panel') return;

    const data = getHexData(q, r);
    if (!data) return;

    const isPlayerHere = (q === state.player.q && r === state.player.r);

    if (isPlayerHere) {
        import('./hex-location-panel.js').then(m => m.openLocationPanel(q, r));
        return;
    }

    if (data.fogState === 'undiscovered') return;

    _attemptMove(q, r);
}

// =================== MOVEMENT ===================

/**
 * Exported for location-view edge clicks.
 * Resolves the neighbor hex for the given direction and attempts movement.
 */
export function moveInDirection(dirIndex) {
    if (!state.gameStarted) return;
    if (state.isAnimating) return;
    if (isTimerActive()) return;
    if (state.activeModal && state.activeModal !== 'location-panel') return;

    const { q, r } = state.player;

    // Debug: direction + neighbor resolution (visible in DevTools console)
    const nb = getNeighborInDir(q, r, dirIndex);
    {
        const allNbs = getNeighbors(q, r);
        console.debug(
            `[dir] click dirIndex=${dirIndex} (${DIR_NAMES[dirIndex] ?? '?'})` +
            `  from=(${q},${r})  target=${nb ? `(${nb.q},${nb.r})` : 'null'}` +
            '\n  neighbors: ' + allNbs.map(n =>
                `${DIR_NAMES[n.dirIndex]}=(${n.q},${n.r})`).join('  ')
        );
    }

    if (!nb) return;

    const nbData = getHexData(nb.q, nb.r);
    if (!nbData || nbData.fogState === 'undiscovered') return;

    _attemptMove(nb.q, nb.r);
}

function _findDirIndex(fromQ, fromR, toQ, toR) {
    const neighbors = getNeighbors(fromQ, fromR);
    const nb = neighbors.find(n => n.q === toQ && n.r === toR);
    return nb ? nb.dirIndex : -1;
}

function _attemptMove(toQ, toR) {
    if (state.isAnimating) return;
    if (isTimerActive()) return;

    const fromQ = state.player.q;
    const fromR = state.player.r;

    const dirIndex = _findDirIndex(fromQ, fromR, toQ, toR);
    if (dirIndex === -1) {
        addMessage('That hex is not adjacent.', '');
        return;
    }

    const fromData = getHexData(fromQ, fromR);
    if (!fromData) return;

    const toData = getHexData(toQ, toR);
    if (!toData) return;

    const terrainName = CONFIG.TERRAIN_NAMES[toData.terrain] || toData.terrain;

    // Mountain traversal (separate flow)
    if (isMountainTerrain(toData.terrain)) {
        _doClimb(fromQ, fromR, toQ, toR);
        return;
    }

    // ── Path not yet discovered ───────────────────────────────────────────────
    if (!fromData.discoveredConnections[dirIndex]) {
        const discoveryCost = getPathDiscoveryCost(toData.terrain);

        if (!hasAP(discoveryCost)) {
            addMessage(
                `Not enough AP to explore that path. Need ${discoveryCost} AP (${terrainName}).`,
                'warning'
            );
            return;
        }

        showPathDiscoveryConfirm(terrainName, discoveryCost, () => {
            if (!hasAP(discoveryCost)) {
                addMessage('Not enough AP anymore.', 'warning');
                return;
            }
            closeLocationPanel();
            startActionTimer(discoveryCost, `⛰️ Exploring ${terrainName}…`, () => {
                spendAP(discoveryCost);
                updateHUD();

                const result = discoverPath(fromQ, fromR, dirIndex);
                if (!result.open) {
                    addMessage(result.reason || 'No passage found.', '');
                    // Refresh location view to show newly discovered (blocked) edge
                    import('./location-view.js').then(m => m.render(fromQ, fromR));
                    return;
                }

                animatePlayerMove(fromQ, fromR, toQ, toR, () => { _onArrival(toQ, toR); });
            });
        });

        return;
    }

    // ── Path already discovered ───────────────────────────────────────────────
    if (!fromData.connections[dirIndex]) {
        addMessage('The way is blocked.', '');
        return;
    }

    const apCost = CONFIG.PATH_TRAVEL_COST;
    if (!hasAP(apCost)) {
        addMessage(`Not enough AP. Need ${apCost} AP.`, 'warning');
        return;
    }

    closeLocationPanel();
    startActionTimer(apCost, `🚶 Moving to ${terrainName}…`, () => {
        spendAP(apCost);
        updateHUD();
        animatePlayerMove(fromQ, fromR, toQ, toR, () => { _onArrival(toQ, toR); });
    });
}

function _doClimb(fromQ, fromR, toQ, toR) {
    const toData = getHexData(toQ, toR);
    const terrainName = CONFIG.TERRAIN_NAMES[toData?.terrain] || 'Mountains';
    const climbCost   = CONFIG.TERRAIN_MOVE_COST[toData?.terrain] || 3;

    if (!hasAP(climbCost)) {
        addMessage(`Not enough AP to climb. Need ${climbCost} AP.`, 'warning');
        return;
    }

    closeLocationPanel();
    startActionTimer(climbCost, `🏔️ Climbing ${terrainName}…`, () => {
        const result = climbMountain(fromQ, fromR, toQ, toR);
        if (!result.success) { updateHUD(); return; }
        animatePlayerMove(fromQ, fromR, toQ, toR, () => { _onArrival(toQ, toR); });
    });
}

function _onArrival(q, r) {
    state.player.q = q;
    state.player.r = r;

    const data = getHexData(q, r);
    if (data) {
        data.visited  = true;
        data.fogState = 'current';
        generateDescription(q, r);
    }

    autoDiscoverConnections(q, r);
    updateFogForPosition(q, r);
    renderPlayer();
    refreshPlayerOffsets();
    updateHUD();

    // Refresh location view
    import('./location-view.js').then(m => m.render(q, r));

    if (isMultiplayer()) {
        import('./network.js').then(m => m.emit('player:move', {
            q, r, ap: state.player.ap,
        }));
    }

    _softCenterCamera(q, r);
    _checkCriticalWarnings();

    if (Math.random() < CONFIG.EVENT_CHANCE) {
        setTimeout(() => triggerRandomEvent(q, r), 400);
    }
}

function _softCenterCamera(q, r) {
    const app = state.app;
    const cam = state.cameraContainer;
    if (!cam || !app) return;

    const pix  = hexToPixel(q, r);
    const zoom = cam.scale.x;
    const vw   = app.renderer.width;
    const vh   = app.renderer.height;

    if (zoom >= 1.5) {
        cam.x = vw / 2 - pix.x * zoom;
        cam.y = vh / 2 - pix.y * zoom;
        return;
    }

    const px  = pix.x * zoom + cam.x;
    const py  = pix.y * zoom + cam.y;
    const pad = 120;
    if (px < pad || px > vw - pad || py < pad || py > vh - pad) {
        cam.x = vw / 2 - pix.x * zoom;
        cam.y = vh / 2 - pix.y * zoom;
    }
}

function _checkCriticalWarnings() {
    const p = state.player;
    if (p.food  < 20) addMessage('⚠️ You are starving!',           'danger');
    if (p.water < 20) addMessage('⚠️ Critically dehydrated!',      'danger');
    if (p.hp    < 20) addMessage('⚠️ Near death!',                 'danger');
}

// =================== END DAY ===================

export function handleEndDay() {
    if (isMultiplayer()) {
        import('./network.js').then(m => m.emit('day:end', {}));
        markSelfEndedDay();
        setEndDayWaiting(true);
        addMessage('⏳ Waiting for other players to end their day…', 'info');
        return;
    }
    runNightPhase(() => {
        endDay();
        if (!state.player.isAlive) {
            checkGameOver();
            return;
        }
        updateHUD();
        import('./location-view.js').then(m => m.render(state.player.q, state.player.r));
    });
}

// =================== GAME OVER ===================

export function checkGameOver() {
    if (!state.player.isAlive) showGameOver();
}

export function showGameOver() {
    state.gameStarted = false;
    const screen = document.getElementById('game-over-screen');
    const reason  = document.getElementById('game-over-reason');
    if (!screen) return;

    const p = state.player;
    let msg = 'You perished on the island.';
    if (p.food  <= 0) msg = 'You starved to death on the island.';
    else if (p.water <= 0) msg = 'You died of dehydration.';
    else if (p.energy <= 0) msg = 'Exhaustion claimed you.';
    else if (p.hp <= 0) msg = 'Your wounds were fatal.';

    if (reason) reason.textContent = msg;
    screen.classList.remove('hidden');

    document.getElementById('btn-restart')?.addEventListener('click', () => {
        screen.classList.add('hidden');
        document.getElementById('start-screen')?.classList.remove('hidden');
        document.getElementById('hud')?.classList.add('hidden');
        state.gameStarted = false;
        state.hexData.clear();
        state.hexGraphicsCache.clear();
        if (state.layers.terrain)     state.layers.terrain.removeChildren();
        if (state.layers.fog)         state.layers.fog.removeChildren();
        if (state.layers.decorations) state.layers.decorations.removeChildren();
        if (state.layers.entities)    state.layers.entities.removeChildren();
        state.introShown = false;
        state.startingBeachTutorialDone = false;
        state.player = {
            q: 0, r: 0,
            hp: 100, maxHp: 100,
            food: 80, maxFood: 100,
            water: 80, maxWater: 100,
            energy: 100, maxEnergy: 100,
            ap: 10, maxAp: 10,
            day: 1,
            inventory: [],
            maxSlots: 9,
            isAlive: true,
        };
    }, { once: true });
}
