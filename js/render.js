import * as PIXI from 'pixi.js';
import { CONFIG } from './config.js';
import { state, hexKey, getHexData } from './state.js';
import { screenToHex, hexToPixel, getNeighbors } from './grid.js';

// =================== OTHER PLAYERS (MULTIPLAYER) ===================

const _otherSprites = new Map(); // socketId → PIXI.Container
let _cachedOtherPlayers = [];
let _playerHexOffset    = { x: 0, y: 0 };

/** Evenly-spaced slot offsets for N players sharing one hex. */
function _slotOffsets(n) {
    if (n <= 1) return [{ x: 0, y: 0 }];
    const radius = n === 2 ? 9 : n <= 4 ? 11 : 13;
    return Array.from({ length: n }, (_, i) => {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        return { x: Math.round(Math.cos(angle) * radius),
                 y: Math.round(Math.sin(angle) * radius) };
    });
}

function _showPlayerPopup(name, screenX, screenY) {
    let popup = document.getElementById('player-info-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'player-info-popup';
        popup.style.cssText = [
            'position:fixed', 'z-index:9200',
            'background:#1a1612', 'border:1px solid #6a5030',
            'border-radius:6px', 'padding:7px 13px',
            'color:#d4c09a', 'font-family:inherit', 'font-size:.85em',
            'pointer-events:none', 'white-space:nowrap',
            'box-shadow:0 2px 12px rgba(0,0,0,.7)',
            'display:none',
        ].join(';');
        document.body.appendChild(popup);
    }
    popup.textContent = `👤 ${name}`;
    popup.style.left = (screenX + 14) + 'px';
    popup.style.top  = (screenY - 36) + 'px';
    popup.style.display = 'block';
    clearTimeout(popup._t);
    popup._t = setTimeout(() => { popup.style.display = 'none'; }, 2500);
}

function _makeOtherPlayerSprite(id, name, color) {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor    = 'pointer';

    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x000000, 1);
    g.beginFill(color || 0xff4444, 1);
    g.drawCircle(0, 0, 11);
    g.endFill();
    g.beginFill(0xffffff, 0.4);
    g.drawCircle(0, 0, 4);
    g.endFill();
    container.addChild(g);

    const label = new PIXI.Text(name || '?', {
        fontSize:        9,
        fill:            0xffffff,
        stroke:          0x000000,
        strokeThickness: 2,
        fontFamily:      'Courier New, monospace',
    });
    label.anchor.set(0.5, 1.8);
    container.addChild(label);

    container.on('pointerdown', (e) => {
        e.stopPropagation();
        _showPlayerPopup(name || id, e.global.x, e.global.y);
    });

    return container;
}

/**
 * Sync PIXI sprites for all other connected players.
 * Players with null q/r (not yet spawned) are skipped entirely.
 * When multiple players share a hex they are fanned into slots so no sprite
 * overlaps. The local player is also shifted when others share its hex.
 * @param {Array<{id, name, q, r, color}>} players
 */
export function renderOtherPlayers(players) {
    if (!state.layers.entities) return;

    // Only render players that have a confirmed spawn position
    const spawned = players.filter(p => p.q !== null && p.r !== null);
    _cachedOtherPlayers = spawned;

    // Remove sprites for players no longer present (or no longer spawned)
    for (const [id, sprite] of _otherSprites) {
        if (!spawned.find(p => p.id === id)) {
            state.layers.entities.removeChild(sprite);
            _otherSprites.delete(id);
        }
    }

    // Create sprites for newly visible players
    for (const p of spawned) {
        if (!_otherSprites.has(p.id)) {
            const sprite = _makeOtherPlayerSprite(p.id, p.name, p.color);
            state.layers.entities.addChild(sprite);
            _otherSprites.set(p.id, sprite);
        }
    }

    // Group by hex
    const hexGroups = new Map(); // 'q,r' → [player, …]
    for (const p of spawned) {
        const key = `${p.q},${p.r}`;
        if (!hexGroups.has(key)) hexGroups.set(key, []);
        hexGroups.get(key).push(p);
    }

    const lq = state.player.q;
    const lr = state.player.r;
    _playerHexOffset = { x: 0, y: 0 };

    for (const [key, group] of hexGroups) {
        const [q, r] = key.split(',').map(Number);
        const pix      = hexToPixel(q, r);
        const localHere = (q === lq && r === lr);
        const total     = group.length + (localHere ? 1 : 0);
        const offsets   = _slotOffsets(total);

        let slot = 0;
        if (localHere) {
            _playerHexOffset = offsets[slot++]; // local player gets slot 0
        }
        for (const p of group) {
            const sprite = _otherSprites.get(p.id);
            if (!sprite) continue;
            const off = offsets[slot++] ?? { x: 0, y: 0 };
            sprite.x = pix.x + off.x;
            sprite.y = pix.y + off.y;
        }
    }

    // Apply offset to local player graphic
    if (state.playerGfx) {
        const pix = hexToPixel(lq, lr);
        state.playerGfx.x = pix.x + _playerHexOffset.x;
        state.playerGfx.y = pix.y + _playerHexOffset.y;
    }
}

/**
 * Re-apply group offsets using cached player list.
 * Call after renderPlayer() whenever the local player position changes.
 */
export function refreshPlayerOffsets() {
    renderOtherPlayers(_cachedOtherPlayers);
}

// =================== HEX POLYGON ===================

export function getHexPolygonPoints(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2; // pointy top
        pts.push(cx + size * Math.cos(angle));
        pts.push(cy + size * Math.sin(angle));
    }
    return pts;
}

// =================== INIT ===================

export function initRenderer() {
    const app = state.app;

    // Camera container (pan + zoom)
    const cam = new PIXI.Container();
    cam.sortableChildren = false;
    app.stage.addChild(cam);
    state.cameraContainer = cam;

    // Layers inside camera
    const terrainLayer     = new PIXI.Container();
    const decorationsLayer = new PIXI.Container();
    const fogLayer         = new PIXI.Container();
    const entityLayer      = new PIXI.Container();

    cam.addChild(terrainLayer);
    cam.addChild(decorationsLayer);
    cam.addChild(fogLayer);
    cam.addChild(entityLayer);

    state.layers.terrain      = terrainLayer;
    state.layers.decorations  = decorationsLayer;
    state.layers.fog          = fogLayer;
    state.layers.entities     = entityLayer;

    // Player graphic
    const pg = new PIXI.Graphics();
    drawPlayerGfx(pg);
    entityLayer.addChild(pg);
    state.playerGfx = pg;

    // Input events
    app.stage.eventMode = 'static';
    app.stage.hitArea   = new PIXI.Rectangle(0, 0, 1e6, 1e6);

    app.stage.on('pointerdown',      onPointerDown);
    app.stage.on('pointermove',      onPointerMove);
    app.stage.on('pointerup',        onPointerUp);
    app.stage.on('pointerupoutside', onPointerUp);

    // Wheel zoom
    app.view.addEventListener('wheel', onWheel, { passive: false });

    // Tooltip DOM element
    let tooltip = document.getElementById('hex-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'hex-tooltip';
        tooltip.className = 'hidden';
        document.getElementById('game-container')?.appendChild(tooltip);
    }
}

function drawPlayerGfx(g) {
    g.clear();
    g.lineStyle(2.5, 0x000000, 1);
    g.beginFill(0xFFE033, 1);
    g.drawCircle(0, 0, 11);
    g.endFill();
    g.beginFill(0xCC8800, 1);
    g.drawCircle(0, 0, 4);
    g.endFill();
}

// =================== RENDER MAP ===================

export function renderMap() {
    state.layers.terrain.removeChildren();
    state.layers.fog.removeChildren();
    state.layers.decorations.removeChildren();
    state.hexGraphicsCache.clear();

    state.hexData.forEach((data) => {
        _renderHexTerrain(data);
        _renderHexFog(data);
        if (data.hasWaterSource) _renderWaterMarker(data);
        if (data.hasCamp)        _renderCampMarker(data);
    });
}

function _renderHexTerrain(data) {
    const { q, r, terrain } = data;
    const pix = hexToPixel(q, r);
    const size = CONFIG.HEX_SIZE;

    const g = new PIXI.Graphics();
    const color  = CONFIG.TERRAIN_COLORS[terrain]  || 0x333333;
    const border = CONFIG.TERRAIN_BORDER_COLORS[terrain] || 0x222222;

    g.lineStyle(1.2, border, 1);
    g.beginFill(color, 1);
    g.drawPolygon(getHexPolygonPoints(pix.x, pix.y, size - 0.5));
    g.endFill();

    state.layers.terrain.addChild(g);

    const cached = state.hexGraphicsCache.get(hexKey(q, r)) || {};
    cached.terrain = g;
    state.hexGraphicsCache.set(hexKey(q, r), cached);
}

function _renderHexFog(data) {
    const { q, r } = data;
    const pix = hexToPixel(q, r);
    const size = CONFIG.HEX_SIZE;

    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 1);
    g.drawPolygon(getHexPolygonPoints(pix.x, pix.y, size - 0.5));
    g.endFill();

    const alpha = CONFIG.FOG_ALPHA[data.fogState] ?? 1.0;
    g.alpha = alpha;

    state.layers.fog.addChild(g);

    const cached = state.hexGraphicsCache.get(hexKey(q, r)) || {};
    cached.fog = g;
    state.hexGraphicsCache.set(hexKey(q, r), cached);
}

// =================== WATER MARKERS ===================

function _renderWaterMarker(data) {
    const { q, r } = data;
    const pix = hexToPixel(q, r);

    const g = new PIXI.Graphics();

    // Outer glow ring
    g.lineStyle(1.5, 0x7fb3d3, 0.7);
    g.beginFill(0x1a6dad, 0.85);
    g.drawCircle(0, 0, 6);
    g.endFill();

    // Inner highlight
    g.beginFill(0xa8d8f0, 0.6);
    g.drawCircle(-1.5, -1.5, 2.5);
    g.endFill();

    // Position at top-right of hex
    g.x = pix.x + CONFIG.HEX_SIZE * 0.42;
    g.y = pix.y - CONFIG.HEX_SIZE * 0.42;

    // Only visible when discovered
    g.visible = !!data.waterSourceDiscovered;

    state.layers.decorations.addChild(g);

    const cached = state.hexGraphicsCache.get(hexKey(q, r)) || {};
    cached.waterMarker = g;
    state.hexGraphicsCache.set(hexKey(q, r), cached);
}

export function updateWaterMarker(q, r) {
    const data = getHexData(q, r);
    if (!data) return;
    const cached = state.hexGraphicsCache.get(hexKey(q, r));
    if (!cached) return;

    // Create marker if it was missing (hex had no source at render time)
    if (!cached.waterMarker && data.hasWaterSource) {
        _renderWaterMarker(data);
        return;
    }
    if (!cached.waterMarker) return;

    // Respect fog — hide if hex fully undiscovered
    const fogOk = data.fogState !== 'undiscovered';
    cached.waterMarker.visible = !!data.waterSourceDiscovered && (fogOk || !!state.godMode);
}

export function updateAllWaterMarkers() {
    state.hexData.forEach((data) => {
        if (data.hasWaterSource) updateWaterMarker(data.q, data.r);
    });
}

// =================== CAMP MARKERS ===================

function _renderCampMarker(data) {
    const { q, r } = data;
    const pix = hexToPixel(q, r);

    const g = new PIXI.Graphics();

    // Orange circle base
    g.lineStyle(1.5, 0x4a3000, 0.8);
    g.beginFill(0xFF8C00, 0.92);
    g.drawCircle(0, 0, 7);
    g.endFill();

    // White cross / flag marker inside
    g.lineStyle(1.5, 0xFFFFFF, 0.95);
    g.moveTo(-3, 0); g.lineTo(3, 0);
    g.moveTo(0, -3); g.lineTo(0, 3);

    // Position at top-left of hex (opposite corner from water marker)
    g.x = pix.x - CONFIG.HEX_SIZE * 0.42;
    g.y = pix.y - CONFIG.HEX_SIZE * 0.42;

    g.visible = data.fogState !== 'undiscovered';

    state.layers.decorations.addChild(g);

    const cached = state.hexGraphicsCache.get(hexKey(q, r)) || {};
    cached.campMarker = g;
    state.hexGraphicsCache.set(hexKey(q, r), cached);
}

export function updateCampMarker(q, r) {
    const data = getHexData(q, r);
    if (!data) return;

    const cached = state.hexGraphicsCache.get(hexKey(q, r));
    if (!cached) return;

    // Create marker if newly established camp
    if (!cached.campMarker && data.hasCamp) {
        _renderCampMarker(data);
        return;
    }
    if (!cached.campMarker) return;

    const fogOk = state.godMode || data.fogState !== 'undiscovered';
    cached.campMarker.visible = !!data.hasCamp && fogOk;
}

// =================== UPDATE FOG ===================

export function updateAllFog() {
    state.hexData.forEach((data) => {
        updateHexFog(data.q, data.r);
    });
}

export function updateHexFog(q, r) {
    const data = getHexData(q, r);
    if (!data) return;
    const cached = state.hexGraphicsCache.get(hexKey(q, r));
    if (!cached || !cached.fog) return;

    const alpha = state.godMode ? 0.0 : (CONFIG.FOG_ALPHA[data.fogState] ?? 1.0);
    cached.fog.alpha = alpha;

    const fogOk = state.godMode || data.fogState !== 'undiscovered';
    if (cached.waterMarker) {
        cached.waterMarker.visible = !!data.waterSourceDiscovered && fogOk;
    }
    if (cached.campMarker) {
        cached.campMarker.visible = !!data.hasCamp && fogOk;
    }
}

export function renderHex(q, r) {
    const data = getHexData(q, r);
    if (!data) return;
    const cached = state.hexGraphicsCache.get(hexKey(q, r));
    if (!cached) return;

    if (cached.terrain) {
        const pix = hexToPixel(q, r);
        const g = cached.terrain;
        g.clear();
        const color  = CONFIG.TERRAIN_COLORS[data.terrain]  || 0x333333;
        const border = CONFIG.TERRAIN_BORDER_COLORS[data.terrain] || 0x222222;
        g.lineStyle(1.2, border, 1);
        g.beginFill(color, 1);
        g.drawPolygon(getHexPolygonPoints(pix.x, pix.y, CONFIG.HEX_SIZE - 0.5));
        g.endFill();
    }

    updateHexFog(q, r);
}

// =================== PLAYER ===================

export function renderPlayer() {
    // Reset offset — refreshPlayerOffsets() will recompute it after this call
    _playerHexOffset = { x: 0, y: 0 };
    const { q, r } = state.player;
    const pix = hexToPixel(q, r);
    if (!state.playerGfx) return;
    state.playerGfx.x = pix.x;
    state.playerGfx.y = pix.y;
}

// =================== CAMERA ===================

export function centerCameraOnPlayer() {
    const { q, r } = state.player;
    centerCameraOn(q, r);
}

export function centerCameraOn(q, r) {
    const app = state.app;
    const pix = hexToPixel(q, r);
    const cam = state.cameraContainer;
    const zoom = cam.scale.x;
    cam.x = app.renderer.width  / 2 - pix.x * zoom;
    cam.y = app.renderer.height / 2 - pix.y * zoom;
}

export function setInitialGameZoom() {
    const cam = state.cameraContainer;
    if (!cam) return;
    cam.scale.set(CONFIG.INITIAL_GAME_ZOOM);
}

// =================== TOOLTIP ===================

function _showTooltip(screenX, screenY, text) {
    const tooltip = document.getElementById('hex-tooltip');
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.style.left = (screenX + 16) + 'px';
    tooltip.style.top  = (screenY - 32) + 'px';
    tooltip.classList.remove('hidden');
}

function _hideTooltip() {
    const tooltip = document.getElementById('hex-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
}

function _updateHoverTooltip(e) {
    if (!state.gameStarted || state.activeModal) { _hideTooltip(); return; }

    const coords = screenToHex(e.global.x, e.global.y);
    if (!coords) { _hideTooltip(); return; }

    const { q: pq, r: pr } = state.player;
    // Don't show tooltip on player's own hex
    if (coords.q === pq && coords.r === pr) { _hideTooltip(); return; }

    const data = getHexData(coords.q, coords.r);
    if (!data || data.fogState === 'undiscovered') { _hideTooltip(); return; }

    // Only show for hexes adjacent to player
    const neighbors = getNeighbors(pq, pr);
    const isNeighbor = neighbors.some(nb => nb.q === coords.q && nb.r === coords.r);
    if (!isNeighbor) { _hideTooltip(); return; }

    const icon = CONFIG.TERRAIN_ICONS[data.terrain] || '';
    const name = CONFIG.TERRAIN_NAMES[data.terrain] || data.terrain;
    const cost = CONFIG.TERRAIN_MOVE_COST[data.terrain];
    const costStr = (cost && cost < 999) ? ` · ${cost} AP` : '';
    _showTooltip(e.global.x, e.global.y, `${icon} ${name}${costStr}`);
}

// =================== INPUT ===================

let _dragStartX = 0, _dragStartY = 0;
let _camStartX  = 0, _camStartY  = 0;
let _dragMoved  = false;
let _dragging   = false;

function onPointerDown(e) {
    if (!state.gameStarted) return;
    _hideTooltip();
    _dragging   = true;
    _dragMoved  = false;
    _dragStartX = e.global.x;
    _dragStartY = e.global.y;
    _camStartX  = state.cameraContainer.x;
    _camStartY  = state.cameraContainer.y;
}

function onPointerMove(e) {
    if (!_dragging) {
        _updateHoverTooltip(e);
        return;
    }
    const dx = e.global.x - _dragStartX;
    const dy = e.global.y - _dragStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _dragMoved = true;
    if (_dragMoved) {
        state.cameraContainer.x = _camStartX + dx;
        state.cameraContainer.y = _camStartY + dy;
        _hideTooltip();
    }
}

function onPointerUp(e) {
    _hideTooltip();
    if (!state.gameStarted) { _dragging = false; return; }
    if (!_dragMoved) {
        const coords = screenToHex(e.global.x, e.global.y);
        if (coords) {
            import('./game-mode.js').then(mod => mod.onHexClick(coords.q, coords.r));
        }
    }
    _dragging  = false;
    _dragMoved = false;
}

function onWheel(e) {
    if (!state.gameStarted) return;
    e.preventDefault();
    _hideTooltip();
    const cam  = state.cameraContainer;
    const oldZ = cam.scale.x;
    let newZ    = oldZ - e.deltaY * CONFIG.ZOOM_STEP * 0.01;
    newZ = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, newZ));

    const mx = e.clientX, my = e.clientY;
    const wx = (mx - cam.x) / oldZ;
    const wy = (my - cam.y) / oldZ;
    cam.scale.set(newZ);
    cam.x = mx - wx * newZ;
    cam.y = my - wy * newZ;
}
