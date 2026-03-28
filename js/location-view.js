/**
 * location-view.js
 * Primary game view: one large hexagon representing the current location.
 * Active whenever the player does NOT possess a "map" item.
 * The PixiJS world-map canvas is hidden while this view is active.
 */

import { CONFIG }      from './config.js';
import { state, getHexData } from './state.js';
import { getNeighborInDir }  from './grid.js';
import { hasItem }           from './inventory.js';
import { getOtherPlayers }   from './multiplayer-state.js';

// Must match DIR_NAMES in grid.js (POINTY-TOP valid edge directions, clockwise from upper-left)
const DIR_NAMES = ['NW', 'NE', 'E', 'SE', 'SW', 'W'];

// SVG coordinate space
const SVG_W  = 700;
const SVG_H  = 700;
const CX     = SVG_W / 2;
const CY     = SVG_H / 2;
const HEX_R  = 240; // main hex radius

// Pointy-top hex: vertex i at angle (60*i − 90)°
function _verts(cx, cy, r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        v.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return v;
}

// Edge i (between vertex i and i+1) faces direction (i+1) % 6
function _edgeDir(ei) { return (ei + 1) % 6; }

// ── Module state ──────────────────────────────────────────────────────────────

let _container    = null;
let _mapBtn       = null;
let _mapViewOpen  = false;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function _ensureInit() {
    if (_container) return;

    _container = document.createElement('div');
    _container.id = 'location-view';
    _container.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:10',
        'background:#090806',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'overflow:hidden', 'font-family:inherit',
        'padding:108px 8px 20px',
    ].join(';');

    _container.innerHTML = `
        <div id="lv-header" style="text-align:center;margin-bottom:6px;user-select:none;pointer-events:none;">
            <div id="lv-terrain-label" style="font-size:1.25em;font-weight:700;color:#e8c97a;letter-spacing:.07em;"></div>
            <div id="lv-description"   style="font-size:.80em;color:#a08878;margin-top:3px;max-width:420px;line-height:1.4;"></div>
        </div>
        <div id="lv-svg-wrap"></div>
        <div id="lv-badges" style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-top:8px;max-width:500px;"></div>`;

    document.body.appendChild(_container);

    // World-map toggle button (visible only after player has Map item)
    _mapBtn = document.createElement('button');
    _mapBtn.id = 'btn-map-toggle';
    _mapBtn.textContent = '🗺️ World Map';
    _mapBtn.style.cssText = [
        'position:fixed', 'top:10px', 'right:200px', 'z-index:200',
        'padding:5px 13px', 'background:#1a1410', 'border:1px solid #6a5030',
        'color:#e8c97a', 'border-radius:5px', 'cursor:pointer',
        'font-family:inherit', 'font-size:.80em', 'display:none',
    ].join(';');
    _mapBtn.addEventListener('click', _toggleMap);
    document.body.appendChild(_mapBtn);
}

function _toggleMap() {
    _mapViewOpen = !_mapViewOpen;
    const canvas = document.getElementById('game-canvas');
    if (_mapViewOpen) {
        if (canvas) { canvas.style.display = ''; canvas.style.pointerEvents = 'auto'; }
        if (_container) _container.style.display = 'none';
        if (_mapBtn) _mapBtn.textContent = '🏝️ Location';
    } else {
        if (canvas) { canvas.style.display = 'none'; canvas.style.pointerEvents = 'none'; }
        if (_container) _container.style.display = 'flex';
        if (_mapBtn) _mapBtn.textContent = '🗺️ World Map';
        render(state.player.q, state.player.r);
    }
}

/** True when the world map (PixiJS canvas) is currently shown instead of the location view. */
export function isMapViewOpen() { return _mapViewOpen; }

/**
 * Force-switch to the world map view (used by God Mode).
 * No-op if already in map view.
 */
export function showMapView() {
    if (_mapViewOpen) return;
    _mapViewOpen = true;
    const canvas = document.getElementById('game-canvas');
    if (canvas) { canvas.style.display = ''; canvas.style.pointerEvents = 'auto'; }
    if (_container) _container.style.display = 'none';
    if (_mapBtn) _mapBtn.textContent = '🏝️ Location';
}

/**
 * Force-switch back to the location view (used by God Mode OFF).
 * Resets the map-open flag then re-renders the current hex.
 */
export function restoreLocationView(q, r) {
    _mapViewOpen = false;
    const canvas = document.getElementById('game-canvas');
    if (canvas) { canvas.style.display = 'none'; canvas.style.pointerEvents = 'none'; }
    if (_container) _container.style.display = 'flex';
    if (_mapBtn) _mapBtn.textContent = '🗺️ World Map';
    render(q, r);
}

// ── Main render ───────────────────────────────────────────────────────────────

/**
 * Refresh the location view for hex (q, r).
 * Called after every move, on spawn, and after any action that changes hex state.
 */
export function render(q, r) {
    _ensureInit();

    const data = getHexData(q, r);
    if (!data) return;

    // Show/hide the Map toggle button based on item possession
    if (_mapBtn) _mapBtn.style.display = hasItem('map', 1) ? '' : 'none';

    // If world map is active, don't overwrite it
    if (_mapViewOpen) return;

    // Ensure location view covers the canvas
    if (_container.style.display === 'none') _container.style.display = 'flex';
    const canvas = document.getElementById('game-canvas');
    if (canvas && canvas.style.display !== 'none') {
        canvas.style.display = 'none';
        canvas.style.pointerEvents = 'none';
    }

    // Header
    const icon = CONFIG.TERRAIN_ICONS[data.terrain] || '';
    const name = CONFIG.TERRAIN_NAMES[data.terrain] || data.terrain;
    document.getElementById('lv-terrain-label').textContent = `${icon}  ${name}`;
    document.getElementById('lv-description').textContent   = data.description || '';

    // SVG hex
    const wrap = document.getElementById('lv-svg-wrap');
    wrap.innerHTML = '';
    wrap.appendChild(_buildSVG(q, r, data));

    // Badges
    _renderBadges(data, q, r);
}

// ── SVG construction ──────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg';

function _buildSVG(q, r, data) {
    const verts     = _verts(CX, CY, HEX_R);
    const pointsStr = verts.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svg.setAttribute('xmlns',   'http://www.w3.org/2000/svg');
    svg.style.cssText = `width:min(${SVG_W}px,92vw,calc(100vh - 230px));height:auto;display:block;overflow:visible;`;

    // Hex fill (clickable → opens location panel)
    const fill  = _css(CONFIG.TERRAIN_COLORS[data.terrain]       || 0x2a2418);
    const bord  = _css(CONFIG.TERRAIN_BORDER_COLORS[data.terrain] || 0x1a1410);
    const poly  = _el('polygon');
    poly.setAttribute('points', pointsStr);
    poly.setAttribute('fill',   fill);
    poly.setAttribute('stroke', bord);
    poly.setAttribute('stroke-width', '3');
    poly.style.cursor = 'pointer';
    poly.addEventListener('click', () =>
        import('./hex-location-panel.js').then(m => m.openLocationPanel(q, r))
    );
    svg.appendChild(poly);

    // Subtle hint
    const hint = _text(CX, CY + HEX_R * 0.54, 'tap to interact', 12,
                       'rgba(255,255,255,0.18)', 'middle');
    hint.setAttribute('pointer-events', 'none');
    svg.appendChild(hint);

    // Player tokens
    _appendPlayerTokens(svg, q, r);

    // Edges
    for (let ei = 0; ei < 6; ei++) _appendEdge(svg, ei, q, r, data, verts);

    // Inner markers
    if (data.waterSourceDiscovered) _appendEmoji(svg, CX + HEX_R * 0.52, CY - HEX_R * 0.52, '💧', 20);
    if (data.hasCamp)               _appendEmoji(svg, CX - HEX_R * 0.52, CY - HEX_R * 0.52, '⛺', 20);
    if ((data.groundLoot || []).some(l => l.qty > 0))
                                    _appendEmoji(svg, CX - HEX_R * 0.52, CY + HEX_R * 0.52, '📦', 18);

    return svg;
}

function _appendEdge(svg, ei, fromQ, fromR, fromData, verts) {
    const dirIndex = _edgeDir(ei);
    const v0 = verts[ei];
    const v1 = verts[(ei + 1) % 6];

    // Outward normal from center to edge midpoint
    const midX = (v0.x + v1.x) / 2;
    const midY = (v0.y + v1.y) / 2;
    const dx = midX - CX, dy = midY - CY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len, ny = dy / len;

    // Determine neighbor state
    const nb     = getNeighborInDir(fromQ, fromR, dirIndex);
    const nbData = nb ? getHexData(nb.q, nb.r) : null;

    let state_  = 'ocean';   // 'ocean' | 'undiscovered' | 'blocked' | 'open'
    let label   = 'Sea';
    let clickable = false;

    if (!nb || !nbData || nbData.terrain === 'water') {
        state_ = 'ocean'; label = '〜 Sea';
    } else if (!fromData.discoveredConnections[dirIndex]) {
        state_ = 'undiscovered';
        label  = '?  ' + (CONFIG.TERRAIN_NAMES[nbData.terrain] || '');
        clickable = true;
    } else if (!fromData.connections[dirIndex]) {
        state_ = 'blocked';
        label  = '✖ ' + (CONFIG.TERRAIN_NAMES[nbData.terrain] || nbData.terrain);
    } else {
        state_ = 'open';
        label  = (CONFIG.TERRAIN_ICONS[nbData.terrain] || '') + ' ' + (CONFIG.TERRAIN_NAMES[nbData.terrain] || nbData.terrain);
        clickable = true;
    }

    const edgeColor  = state_ === 'open' ? '#4a9a4a' : state_ === 'ocean' ? '#2a557a' : '#6a5030';
    const dashArray  = state_ === 'undiscovered' ? '6 4' : '';

    // Edge line
    const line = _el('line');
    line.setAttribute('x1', v0.x.toFixed(1)); line.setAttribute('y1', v0.y.toFixed(1));
    line.setAttribute('x2', v1.x.toFixed(1)); line.setAttribute('y2', v1.y.toFixed(1));
    line.setAttribute('stroke',           edgeColor);
    line.setAttribute('stroke-width',     state_ === 'open' ? '4.5' : '2');
    if (dashArray) line.setAttribute('stroke-dasharray', dashArray);
    line.setAttribute('pointer-events', 'none');
    svg.appendChild(line);

    // Click zone (extends outward from edge)
    if (clickable) {
        const DEPTH = 46;
        const p0x = v0.x + nx * DEPTH, p0y = v0.y + ny * DEPTH;
        const p1x = v1.x + nx * DEPTH, p1y = v1.y + ny * DEPTH;
        const zone = _el('polygon');
        zone.setAttribute('points', [
            `${v0.x.toFixed(1)},${v0.y.toFixed(1)}`,
            `${v1.x.toFixed(1)},${v1.y.toFixed(1)}`,
            `${p1x.toFixed(1)},${p1y.toFixed(1)}`,
            `${p0x.toFixed(1)},${p0y.toFixed(1)}`,
        ].join(' '));

        const zoneFill = state_ === 'open' ? 'rgba(60,120,60,0.15)' : 'rgba(100,80,40,0.12)';
        zone.setAttribute('fill',   zoneFill);
        zone.setAttribute('stroke', 'none');
        zone.style.cursor = 'pointer';
        zone.addEventListener('mouseenter', () => zone.setAttribute('fill', 'rgba(255,210,100,0.22)'));
        zone.addEventListener('mouseleave', () => zone.setAttribute('fill', zoneFill));
        const capDir = dirIndex;
        zone.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./game-mode.js').then(m => m.moveInDirection(capDir));
        });
        svg.appendChild(zone);
    }

    // Label outside the hex
    const LABEL_R = HEX_R * 1.32;
    const lx = CX + nx * LABEL_R;
    const ly = CY + ny * LABEL_R;

    const bg = _el('rect');
    const bw = label.length * 7.2 + 18;
    bg.setAttribute('x',      (lx - bw / 2).toFixed(1));
    bg.setAttribute('y',      (ly - 13).toFixed(1));
    bg.setAttribute('width',  bw.toFixed(1));
    bg.setAttribute('height', '21');
    bg.setAttribute('rx',     '4');
    bg.setAttribute('fill',   'rgba(8,6,3,0.80)');
    bg.setAttribute('stroke', state_ === 'open' ? '#4a7a4a' : 'rgba(80,60,30,0.5)');
    bg.setAttribute('stroke-width', '1');
    bg.setAttribute('pointer-events', 'none');
    svg.appendChild(bg);

    const txtColor = state_ === 'open' ? '#8dd88d' : state_ === 'ocean' ? '#5090b0' : '#987850';
    const lbl = _text(lx, ly + 1.5, label, 12, txtColor, 'middle', state_ === 'open' ? '600' : '400');
    lbl.setAttribute('pointer-events', 'none');
    svg.appendChild(lbl);

    // Direction hint inside hex near edge
    const dhx = CX + nx * HEX_R * 0.76;
    const dhy = CY + ny * HEX_R * 0.76;
    const dh  = _text(dhx, dhy, DIR_NAMES[dirIndex], 9, 'rgba(255,255,255,0.22)', 'middle');
    dh.setAttribute('pointer-events', 'none');
    svg.appendChild(dh);
}

function _appendPlayerTokens(svg, q, r) {
    const others = getOtherPlayers().filter(p => p.q === q && p.r === r);
    const tokens = [
        { name: 'You', color: 0xFFE033 },
        ...others.map(p => ({ name: p.name || '?', color: p.color || 0xff4444 })),
    ];

    const radius   = tokens.length > 1 ? HEX_R * 0.27 : 0;
    const positions = _radialPos(tokens.length, CX, CY, radius);

    tokens.forEach((tok, i) => {
        const { x, y } = positions[i];
        const col = _css(tok.color);

        const circle = _el('circle');
        circle.setAttribute('cx', x.toFixed(1));
        circle.setAttribute('cy', y.toFixed(1));
        circle.setAttribute('r',  '14');
        circle.setAttribute('fill',         col);
        circle.setAttribute('stroke',       '#000');
        circle.setAttribute('stroke-width', '2.5');
        circle.setAttribute('pointer-events', 'none');
        svg.appendChild(circle);

        const shine = _el('circle');
        shine.setAttribute('cx', (x - 4).toFixed(1));
        shine.setAttribute('cy', (y - 4).toFixed(1));
        shine.setAttribute('r',  '4');
        shine.setAttribute('fill', 'rgba(255,255,255,0.45)');
        shine.setAttribute('pointer-events', 'none');
        svg.appendChild(shine);

        const name = _text(x, y + 26, tok.name, 11, '#fff', 'middle', '600');
        name.setAttribute('stroke',           '#000');
        name.setAttribute('stroke-width',     '2.5');
        name.setAttribute('paint-order',      'stroke');
        name.setAttribute('pointer-events',   'none');
        svg.appendChild(name);
    });
}

function _radialPos(count, cx, cy, r) {
    if (count === 1) return [{ x: cx, y: cy }];
    return Array.from({ length: count }, (_, i) => {
        const a = (2 * Math.PI / count) * i - Math.PI / 2;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
}

function _appendEmoji(svg, x, y, emoji, size) {
    const t = _el('text');
    t.setAttribute('x', x.toFixed(1));
    t.setAttribute('y', y.toFixed(1));
    t.setAttribute('text-anchor',       'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size',         String(size));
    t.setAttribute('pointer-events',    'none');
    t.textContent = emoji;
    svg.appendChild(t);
}

// ── Badges ────────────────────────────────────────────────────────────────────

function _renderBadges(data, q, r) {
    const div = document.getElementById('lv-badges');
    if (!div) return;
    div.innerHTML = '';

    function b(text, color) {
        const s = document.createElement('span');
        s.style.cssText = `padding:2px 9px;border-radius:11px;font-size:.75em;background:rgba(30,22,12,.85);border:1px solid ${color};color:${color};`;
        s.textContent = text;
        div.appendChild(s);
    }

    if (data.hasCamp)               b('⛺ Camp',           '#c8962a');
    if (data.waterSourceDiscovered) b('💧 Water',          '#4a8aaa');
    if (data.structureDiscovered)   b('🏚️ Structure',      '#8a6040');

    const loot = (data.groundLoot || []).filter(l => l.qty > 0).length;
    if (loot > 0) b(`📦 Ground Loot (${loot})`, '#8a8030');

    {
        const sd = data.lastScavengeDay;
        if (sd != null) {
            const left = (data.scavengeRespawnDays || 3) - (state.player.day - sd);
            if (left > 0) b(`🪓 Scavenge ${left}d`, '#707030');
        }
        const fd = data.lastForageDay;
        if (fd != null) {
            const left = (data.forageRespawnDays || 3) - (state.player.day - fd);
            if (left > 0) b(`🌿 Forage ${left}d`, '#506030');
        }
    }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function _el(tag)  { return document.createElementNS(NS, tag); }

function _text(x, y, content, size, fill, anchor, weight) {
    const t = _el('text');
    t.setAttribute('x',                x.toFixed(1));
    t.setAttribute('y',                y.toFixed(1));
    t.setAttribute('text-anchor',      anchor || 'middle');
    t.setAttribute('dominant-baseline','middle');
    t.setAttribute('fill',             fill  || '#ffffff');
    t.setAttribute('font-size',        String(size || 12));
    t.setAttribute('font-family',      'inherit');
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = content;
    return t;
}

function _css(num) {
    return '#' + (num >>> 0).toString(16).padStart(6, '0');
}
