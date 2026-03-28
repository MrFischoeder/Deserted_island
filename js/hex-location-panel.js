import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { updateHUD, addMessage, openInventoryWindow, openCraftingWindow } from './ui.js';
import { isSearchLocked, getSearchLock, acquireLock, releaseLock } from './search-lock.js';
import { generateDescription } from './location-descriptions.js';
import { STRUCTURE_DEFINITIONS } from './structures.js';
import { DIR_NAMES } from './grid.js';
import { canFish } from './fishing.js';
import { hasAP } from './action-points.js';
import { getInventory, hasItem } from './inventory.js';
import { getGroundLootDisplay } from './loot.js';
import { canHunt, HUNT_AP_COST } from './hunting.js';
import { establishCamp, openCampWindow } from './camp.js';
import { startActionTimer } from './action-timer.js';

let _currentQ = null, _currentR = null;
let _panelX = null, _panelY = null;
let _dragging = false;
let _dragOffX = 0, _dragOffY = 0;
let _dragListenersAttached = false;

// =================== PUBLIC API ===================

export function openLocationPanel(q, r) {
    _currentQ = q;
    _currentR = r;
    _renderPanel(q, r);

    const el = document.getElementById('location-panel');
    if (!el) return;

    if (_panelX === null) { _panelX = 80; _panelY = 80; }
    el.style.left = _panelX + 'px';
    el.style.top  = _panelY + 'px';
    el.classList.remove('hidden');
    state.activeModal = 'location-panel';
    _setupDrag(el);
}

export function refreshLocationPanel() {
    if (_currentQ === null) return;
    const data = getHexData(_currentQ, _currentR);
    if (!data || data.fogState !== 'current') return;
    _renderPanel(_currentQ, _currentR);
}

export function closeLocationPanel() {
    _currentQ = null;
    _currentR = null;
    const el = document.getElementById('location-panel');
    if (el) el.classList.add('hidden');
    if (state.activeModal === 'location-panel') state.activeModal = null;
}

// =================== DRAG ===================

function _setupDrag(panelEl) {
    if (!_dragListenersAttached) {
        _dragListenersAttached = true;
        document.addEventListener('mousemove', (e) => {
            if (!_dragging) return;
            const el = document.getElementById('location-panel');
            if (!el) return;
            const x = Math.max(0, Math.min(window.innerWidth  - 60, e.clientX - _dragOffX));
            const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - _dragOffY));
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
            _panelX = x; _panelY = y;
        });
        document.addEventListener('mouseup', () => { _dragging = false; });
    }

    const header = panelEl.querySelector('.hex-panel-header');
    if (header && !header._dragSetup) {
        header._dragSetup = true;
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('close-btn')) return;
            const rect = panelEl.getBoundingClientRect();
            _dragOffX = e.clientX - rect.left;
            _dragOffY = e.clientY - rect.top;
            _dragging = true;
            e.preventDefault();
        });
    }
}

// =================== RENDER ===================

function _renderPanel(q, r) {
    const data = getHexData(q, r);
    if (!data) return;

    document.getElementById('location-terrain-icon').textContent = CONFIG.TERRAIN_ICONS[data.terrain] || '?';
    document.getElementById('location-terrain-name').textContent = CONFIG.TERRAIN_NAMES[data.terrain] || data.terrain;

    const desc = generateDescription(q, r);
    document.getElementById('location-description').textContent = desc;

    // Status badges
    const statusDiv = document.getElementById('location-status-items');
    statusDiv.innerHTML = '';

    function badge(text, cls) {
        const b = document.createElement('span');
        b.className = 'status-badge' + (cls ? ' ' + cls : '');
        b.textContent = text;
        statusDiv.appendChild(b);
    }

    if (data.visited) badge('Visited', '');

    // Scavenge / Forage cooldown badges (independent, no exact day count)
    {
        const sd = data.lastScavengeDay;
        if (sd !== null && sd !== undefined) {
            const left = (data.scavengeRespawnDays || 3) - (state.player.day - sd);
            badge(left > 0 ? '🔄 Scavenge Recovering' : '🪓 Scavenged', left > 0 ? 'recovering' : 'discovered');
        }
        const fd = data.lastForageDay;
        if (fd !== null && fd !== undefined) {
            const left = (data.forageRespawnDays || 3) - (state.player.day - fd);
            badge(left > 0 ? '🔄 Forage Recovering' : '🌿 Foraged', left > 0 ? 'recovering' : 'discovered');
        }
    }

    if (data.waterSourceDiscovered) badge('💧 Water Source', 'has-water');

    // Camp badges
    if (data.hasCamp) {
        badge('⛺ Camp', 'has-struct');
        const cs = data.campStructures || [];
        if (cs.some(s => s.id === 'campfire')) badge('🔥 Campfire', 'has-struct');
        if (cs.some(s => s.id === 'shelter'))  badge('🏕️ Shelter',  'has-struct');
        const chests = cs.filter(s => s.id === 'chest');
        if (chests.length > 0) badge(`🗃️ Chest ×${chests.length}`, 'has-struct');
        if (cs.some(s => s.id === 'shelf'))        badge('📦 Shelf',       'has-struct');
        if (cs.some(s => s.id === 'wood_storage')) badge('🌲 Wood Storage', 'has-struct');
    }

    if (data.structureDiscovered) {
        const def = STRUCTURE_DEFINITIONS[data.persistentStructure];
        badge((def ? def.icon + ' ' : '') + (def ? def.name : data.persistentStructure), 'has-struct');
    }

    const groundLoot = getGroundLootDisplay(q, r);
    if (groundLoot.length > 0) badge(`📦 Ground Loot (${groundLoot.length})`, 'has-item');

    // Discovered connections
    for (let i = 0; i < 6; i++) {
        if (data.discoveredConnections[i]) {
            const nb = _getNeighborInDirSync(q, r, i);
            if (!nb) continue;
            const nbData = getHexData(nb.q, nb.r);
            if (!nbData || nbData.terrain === 'water') continue;
            const open = data.connections[i];
            badge(`${open ? '➡️' : '🚫'} ${DIR_NAMES[i]}: ${CONFIG.TERRAIN_NAMES[nbData.terrain] || nbData.terrain}`, '');
        }
    }

    _renderActions(q, r, data);

    // Footer: Inventory + Crafting
    const footer = document.getElementById('location-panel-footer');
    if (footer) {
        footer.innerHTML = '';
        const invBtn = document.createElement('button');
        invBtn.className = 'panel-quick-btn';
        invBtn.textContent = '🎒 Inventory';
        invBtn.addEventListener('click', () => openInventoryWindow());
        footer.appendChild(invBtn);

        const craftBtn = document.createElement('button');
        craftBtn.className = 'panel-quick-btn';
        craftBtn.textContent = '⚒️ Crafting';
        craftBtn.addEventListener('click', () => openCraftingWindow());
        footer.appendChild(craftBtn);
    }

    document.getElementById('close-location-panel').onclick = () => closeLocationPanel();
}

function _renderActions(q, r, data) {
    const actDiv = document.getElementById('action-buttons-list');
    actDiv.innerHTML = '';

    function makeBtn(label, apCost, action, disabled = false, extraClass = '') {
        const btn = document.createElement('button');
        const enoughAP = hasAP(apCost) || apCost === 0;
        btn.className = 'action-btn' + (extraClass ? ' ' + extraClass : '');
        btn.disabled = disabled || (!enoughAP && apCost > 0);
        btn.innerHTML = `<span>${label}</span>
            <span class="ap-cost${!enoughAP && apCost > 0 ? ' no-ap' : ''}">${apCost > 0 ? apCost + ' AP' : ''}</span>`;
        btn.addEventListener('click', () => _handleAction(action, q, r));
        actDiv.appendChild(btn);
        return btn;
    }

    function makeNotice(text) {
        const div = document.createElement('div');
        div.className = 'action-notice';
        div.style.cssText = 'padding:8px 10px;margin:4px 0;font-size:.82em;color:#a08060;background:rgba(80,60,30,.25);border-radius:5px;border-left:3px solid #a08060;line-height:1.4;';
        div.textContent = text;
        actDiv.appendChild(div);
        return div;
    }

    // ── Scavenge + Forage (share a single lock notice when blocked) ───────────
    {
        const locked = isSearchLocked(q, r);

        const sd   = data.lastScavengeDay;
        const sLeft = (sd !== null && sd !== undefined)
            ? (data.scavengeRespawnDays || 3) - (state.player.day - sd)
            : 0;
        if (locked) {
            makeNotice('🔒 Someone is already searching this location. Wait until they finish.');
        } else if (sLeft > 0) {
            makeNotice('🔄 This place has been searched recently. Try coming back later and see if fortune favors you then.');
        } else {
            makeBtn('🪓 Scavenge', CONFIG.AP_COSTS.scavenge, 'scavenge');
        }

        const fd   = data.lastForageDay;
        const fLeft = (fd !== null && fd !== undefined)
            ? (data.forageRespawnDays || 3) - (state.player.day - fd)
            : 0;
        if (locked) {
            // Lock notice already shown above — skip forage silently
        } else if (fLeft > 0) {
            makeNotice('🌿 This place has been searched recently. Try coming back later and see if fortune favors you then.');
        } else {
            makeBtn('🌿 Forage', CONFIG.AP_COSTS.forage, 'forage');
        }
    }

    // Drink from water source
    if (data.waterSourceDiscovered) {
        makeBtn('💧 Drink from Source', 0, 'drinkSource');
    }

    // Fish
    if (canFish(q, r).can) {
        makeBtn('🎣 Fish', CONFIG.AP_COSTS.fish, 'fish');
    }

    // Rest
    makeBtn('😴 Rest', CONFIG.AP_COSTS.rest, 'rest');

    // Explore structure
    if (data.structureDiscovered && data.persistentStructure) {
        const def = STRUCTURE_DEFINITIONS[data.persistentStructure];
        const sname = def ? def.name : data.persistentStructure;
        const icon  = def ? def.icon  : '🏚️';
        makeBtn(`${icon} Explore ${sname}`, CONFIG.AP_COSTS.exploreStructure, 'exploreStructure',
                data.structureExplored);
    }

    // Hunt
    const huntCheck = canHunt(q, r);
    {
        const needsWeapon = !hasItem('spear', 1) && !hasItem('knife', 1);
        const showHunt = huntCheck.can || needsWeapon ||
            ['jungle','plains','hills','swamp','rocks','beach'].includes(data.terrain);
        if (showHunt) {
            const btn = makeBtn('🏹 Hunt', HUNT_AP_COST, 'hunt', !huntCheck.can);
            if (!huntCheck.can) btn.title = huntCheck.reason || 'Need a spear or knife.';
        }
    }

    // Camp: Establish or Manage
    if (!data.hasCamp) {
        const canAfford = hasItem('wood', 1) && hasItem('stone', 2) && hasAP(1);
        const btn = makeBtn('⛺ Establish Camp (🪵×1 🪨×2)', 1, 'establishCamp', !canAfford);
        btn.title = 'Requires Wood×1, Stone×2 and 1 AP to establish base camp.';
        btn.style.borderColor = '#c8962a';
        btn.style.color = '#e0c060';
    } else {
        const campBtn = makeBtn('🏕️ Manage Camp', 0, 'openCamp');
        campBtn.style.borderColor = '#c8962a';
        campBtn.style.color = '#e0c060';
    }

    // Use bandage
    const inv = getInventory();
    if (inv.find(s => s.id === 'bandage')) {
        makeBtn('🩹 Use Bandage', 0, 'bandage');
    }

    // End Day
    const endDayBtn = makeBtn('🌙 End Day', 0, 'endDay');
    endDayBtn.style.borderColor = '#555';
    endDayBtn.style.color = '#888';
}

// =================== ACTION HANDLER ===================

function _handleAction(action, q, r) {
    // ── Search lock gate (must happen BEFORE closeLocationPanel) ─────────────
    if (action === 'scavenge' || action === 'forage') {
        if (isSearchLocked(q, r)) {
            addMessage('Someone is already searching this location. Wait until they finish.', 'warning');
            return; // keep panel open
        }
        acquireLock(q, r, action);
    }

    closeLocationPanel();

    if (action === 'scavenge') {
        startActionTimer(CONFIG.AP_COSTS.scavenge, '🪓 Scavenging…', () => {
            import('./search-system.js').then(m => {
                m.scavenge(q, r);
                releaseLock(q, r);
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'forage') {
        startActionTimer(CONFIG.AP_COSTS.forage, '🌿 Foraging…', () => {
            import('./search-system.js').then(m => {
                m.forage(q, r);
                releaseLock(q, r);
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'drinkSource') {
        import('./survival-needs.js').then(m => {
            m.drink('water_source');
            openLocationPanel(q, r);
        });

    } else if (action === 'fish') {
        startActionTimer(CONFIG.AP_COSTS.fish, '🎣 Fishing…', () => {
            import('./fishing.js').then(m => {
                m.fish(q, r);
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'rest') {
        startActionTimer(CONFIG.AP_COSTS.rest, '😴 Resting…', () => {
            import('./survival-needs.js').then(m => {
                m.rest();
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'exploreStructure') {
        startActionTimer(CONFIG.AP_COSTS.exploreStructure, '🏚️ Exploring…', () => {
            import('./structures.js').then(m => {
                m.exploreStructure(q, r);
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'hunt') {
        startActionTimer(HUNT_AP_COST, '🏹 Hunting…', () => {
            import('./hunting.js').then(m => {
                m.hunt(q, r);
                updateHUD();
                openLocationPanel(q, r);
            });
        });

    } else if (action === 'establishCamp') {
        const ok = establishCamp(q, r);
        if (ok) openLocationPanel(q, r);
        else    openLocationPanel(q, r);

    } else if (action === 'openCamp') {
        openCampWindow(q, r);

    } else if (action === 'bandage') {
        import('./survival-needs.js').then(m => {
            m.useBandage();
            openLocationPanel(q, r);
        });

    } else if (action === 'endDay') {
        import('./game-mode.js').then(m => m.handleEndDay());
    }
}

// =================== HELPERS ===================

function _getNeighborInDirSync(q, r, dirIndex) {
    const OFFSETS = [
        { dq:  0, dr: -1 }, // N
        { dq:  1, dr: -1 }, // NE
        { dq:  1, dr:  0 }, // SE
        { dq:  0, dr:  1 }, // S
        { dq: -1, dr:  1 }, // SW
        { dq: -1, dr:  0 }, // NW
    ];
    const off = OFFSETS[dirIndex];
    if (!off) return null;
    return { q: q + off.dq, r: r + off.dr };
}
