import * as PIXI from 'pixi.js';
console.log('[main] Module evaluating...');

import { CONFIG }    from './config.js';
import { state }     from './state.js';
import { initGrid }  from './grid.js';
import { initRenderer, renderMap, centerCameraOnPlayer, setInitialGameZoom } from './render.js';
import { generateIsland } from './island-generator.js';
import { initUI, addMessage, updateHUD } from './ui.js';
import { spawnPlayer } from './game-mode.js';
import { activateSeed, deactivateSeed } from './seeded-random.js';
import { mpState, setupMpListeners } from './multiplayer-state.js';

console.log('[main] All imports resolved — module ready.');

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function setLoadingStatus(text) {
    console.log('[loading]', text);
    const el = document.getElementById('loading-status');
    if (el) el.textContent = text;
}

function setProgress(p) {
    const bar = document.getElementById('loading-progress');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
}

/**
 * @param {string} mapSize  'small' | 'medium' | 'large'
 * @param {{ seed?: number, spawnIndex?: number } | null} mpOptions
 */
export async function startGame(mapSize, mpOptions = null) {
    console.log('[main] startGame()', mapSize, mpOptions);

    document.getElementById('start-screen')?.classList.add('hidden');
    document.getElementById('lobby-screen')?.classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');

    setProgress(0.05);
    setLoadingStatus('Initialising grid...');
    await delay(30);

    state.mapSize = mapSize;
    initGrid(mapSize);
    console.log('[main] Grid initialised. hexData size:', state.hexData.size);
    setProgress(0.15);
    await delay(30);

    setLoadingStatus('Carving island...');
    if (mpOptions?.seed) activateSeed(mpOptions.seed);
    await generateIsland(mapSize, p => setProgress(0.15 + p * 0.65));
    if (mpOptions?.seed) deactivateSeed();
    console.log('[main] Island generated.');
    setProgress(0.82);

    setLoadingStatus('Building renderer...');
    await delay(40);
    initRenderer();
    setProgress(0.88);

    setLoadingStatus('Painting map...');
    await delay(40);
    renderMap();
    setProgress(0.94);

    setLoadingStatus('Placing survivor...');
    await delay(40);
    spawnPlayer(mpOptions?.spawnIndex ?? null);
    setProgress(1.0);
    await delay(120);

    state.gameStarted = true;
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    setInitialGameZoom();
    centerCameraOnPlayer();
    updateHUD();
    addMessage('Click an adjacent hex to move. Click your hex to interact.', '');

    // Wire multiplayer in-game events now that game objects exist
    if (mpState.active) {
        setupMpListeners();
    }

    console.log('[main] Game started!');
}

async function init() {
    console.log('[main] init() called');
    console.log('[main] PIXI version:', PIXI.VERSION ?? '?');

    const app = new PIXI.Application({
        width:           window.innerWidth,
        height:          window.innerHeight,
        backgroundColor: 0x04080c,
        resolution:      window.devicePixelRatio || 1,
        autoDensity:     true,
        antialias:       false,
        powerPreference: 'high-performance',
    });

    state.app = app;

    const placeholder = document.getElementById('game-canvas');
    if (placeholder) {
        placeholder.parentNode.replaceChild(app.view, placeholder);
        app.view.id = 'game-canvas';
    } else {
        document.getElementById('game-container').appendChild(app.view);
        app.view.id = 'game-canvas';
    }

    window.addEventListener('resize', () => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
    });

    initUI();
    console.log('[main] UI initialised');

    // ── Start Game button → always goes to multiplayer lobby ──────────────────
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        import('./lobby-ui.js').then(mod => {
            mod.initLobbyUI((mpData) => {
                // mpData = { seed, spawnIndex, players, hostId, mapSize }
                mpState.active = true;
                startGame(mpData.mapSize || 'medium', { seed: mpData.seed, spawnIndex: mpData.spawnIndex })
                    .catch(err => {
                        console.error('[main] startGame error:', err);
                        document.getElementById('loading-screen')?.classList.add('hidden');
                        document.getElementById('lobby-screen')?.classList.remove('hidden');
                        alert('Error starting game: ' + err.message);
                    });
            });
        });
    });

    // ── Restart button (game-over screen) ─────────────────────────────────────
    document.getElementById('btn-restart')?.addEventListener('click', () => {
        document.getElementById('game-over-screen')?.classList.add('hidden');
        document.getElementById('start-screen')?.classList.remove('hidden');
    });

    console.log('[main] init() complete — waiting for player input');
}

// Boot
init().catch(err => {
    console.error('[main] Fatal init error:', err);
    document.body.innerHTML = `<div style="color:#e74c3c;padding:40px;font-family:monospace;background:#000;min-height:100vh;">
        <h2>Failed to start</h2>
        <pre style="margin-top:12px;font-size:.85em;color:#ff6b6b;">${err.stack || err}</pre>
        <p style="margin-top:20px;color:#888;font-size:.8em;">Open DevTools (F12) → Console for details.</p>
    </div>`;
});
