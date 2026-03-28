import { state, getHexData } from './state.js';
import { setGodMode } from './fog-of-war.js';
import { addMessage } from './ui.js';
import { getIcon } from './icons.js';
import { addToGroundLoot } from './loot.js';

// ── Spawnable items (all non-structure ICONS entries) ─────────────────────────

const SPAWN_CATALOG = [
    // Materials
    { id: 'wood',          category: 'Materials' },
    { id: 'vine',          category: 'Materials' },
    { id: 'stone',         category: 'Materials' },
    { id: 'rope',          category: 'Materials' },
    { id: 'plank',         category: 'Materials' },
    { id: 'flint',         category: 'Materials' },
    { id: 'shell',         category: 'Materials' },
    { id: 'bone',          category: 'Materials' },
    { id: 'hide',          category: 'Materials' },
    { id: 'metal_scrap',   category: 'Materials' },
    { id: 'fabric_scrap',  category: 'Materials' },
    // Food
    { id: 'coconut',       category: 'Food' },
    { id: 'fruit',         category: 'Food' },
    { id: 'berries',       category: 'Food' },
    { id: 'mushroom',      category: 'Food' },
    { id: 'herb',          category: 'Food' },
    { id: 'roots',         category: 'Food' },
    { id: 'raw_fish',      category: 'Food' },
    { id: 'cooked_fish',   category: 'Food' },
    { id: 'crab',          category: 'Food' },
    { id: 'raw_meat',      category: 'Food' },
    { id: 'cooked_meat',   category: 'Food' },
    // Water
    { id: 'fresh_water',   category: 'Water' },
    { id: 'coconut_water', category: 'Water' },
    // Tools
    { id: 'knife',         category: 'Tools' },
    { id: 'axe',           category: 'Tools' },
    { id: 'shovel',        category: 'Tools' },
    { id: 'spear',         category: 'Tools' },
    { id: 'harpoon',       category: 'Tools' },
    { id: 'fishing_rod',   category: 'Tools' },
    { id: 'fishing_net',   category: 'Tools' },
    { id: 'torch',         category: 'Tools' },
    // Crafted
    { id: 'rope_crafted',     category: 'Crafted' },
    { id: 'wooden_bowl',      category: 'Crafted' },
    { id: 'bandage',          category: 'Crafted' },
    { id: 'raft_part',        category: 'Crafted' },
    { id: 'leather_backpack', category: 'Crafted' },
    // Special
    { id: 'map_fragment', category: 'Special' },
    { id: 'key',          category: 'Special' },
    { id: 'notebook',     category: 'Special' },
];

// ── Panel state ───────────────────────────────────────────────────────────────

let _panel      = null;
let _selectedId = null;
let _filterText = '';

// ── Public API ────────────────────────────────────────────────────────────────

export function toggleGodMode() {
    state.godMode = !state.godMode;
    setGodMode(state.godMode); // updates fog overlay (alpha 0 for all hexes)

    const btn = document.getElementById('btn-god-mode');
    if (btn) btn.classList.toggle('active', state.godMode);

    if (state.godMode) {
        addMessage('God Mode ON — full map revealed.', 'info');
        _showSpawnPanel();
        // Switch to world map (PixiJS canvas) so the fog-cleared map is visible
        import('./location-view.js').then(m => m.showMapView());
        // Zoom out and center so the whole island is visible
        import('./render.js').then(m => {
            // Reduce zoom to overview level then center on player
            if (state.cameraContainer) {
                const targetZoom = Math.max(0.55, state.cameraContainer.scale.x * 0.35);
                state.cameraContainer.scale.set(targetZoom);
            }
            m.centerCameraOnPlayer();
        });
    } else {
        addMessage('God Mode OFF — fog restored.', 'info');
        _hideSpawnPanel();
        // restoreLocationView resets _mapViewOpen then renders the hex view
        const { q, r } = state.player;
        import('./location-view.js').then(m => m.restoreLocationView(q, r));
    }
}

export function isGodMode() {
    return state.godMode;
}

// ── Spawn panel ───────────────────────────────────────────────────────────────

function _showSpawnPanel() {
    if (!_panel) _buildPanel();
    _selectedId = null;
    document.getElementById('god-spawn-selected').textContent = '';
    _filterText = '';
    const filterEl = document.getElementById('god-spawn-filter');
    if (filterEl) filterEl.value = '';
    _renderList();
    _panel.style.display = 'flex';
}

function _hideSpawnPanel() {
    if (_panel) _panel.style.display = 'none';
    _selectedId = null;
}

function _buildPanel() {
    _panel = document.createElement('div');
    _panel.id = 'god-spawn-panel';
    _panel.style.cssText = [
        'position:fixed', 'left:14px', 'top:165px', 'z-index:35',
        'width:228px', 'max-height:calc(100vh - 200px)',
        'background:rgba(10,7,4,0.97)', 'border:1px solid #8a4820',
        'border-radius:7px', 'display:none', 'flex-direction:column',
        'font-family:inherit', 'color:#d4c09a', 'overflow:hidden',
        'box-shadow:0 4px 20px rgba(0,0,0,0.7)',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 10px 6px;border-bottom:1px solid #5a3010;flex-shrink:0;';
    header.innerHTML = `
        <div style="font-size:.80em;font-weight:700;color:#e8c97a;margin-bottom:6px;letter-spacing:.06em;">
            👁️ GOD SPAWN
        </div>
        <input id="god-spawn-filter" type="text" placeholder="Filter items…"
            style="width:100%;background:#1a1208;border:1px solid #5a3818;color:#d4c09a;
                   padding:4px 8px;border-radius:4px;font-family:inherit;font-size:.78em;
                   outline:none;box-sizing:border-box;">`;
    _panel.appendChild(header);

    // Item list
    const listWrap = document.createElement('div');
    listWrap.id = 'god-spawn-list';
    listWrap.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;min-height:0;';
    _panel.appendChild(listWrap);

    // Spawn controls (footer)
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:8px 10px;border-top:1px solid #5a3010;flex-shrink:0;';
    footer.innerHTML = `
        <div id="god-spawn-selected"
             style="font-size:.75em;color:#a08060;margin-bottom:6px;min-height:1.3em;"></div>
        <div style="display:flex;gap:6px;align-items:center;">
            <label style="font-size:.75em;color:#888;">Qty:</label>
            <input id="god-spawn-qty" type="number" min="1" max="99" value="1"
                style="width:52px;background:#1a1208;border:1px solid #5a3818;color:#d4c09a;
                       padding:3px 6px;border-radius:4px;font-family:inherit;font-size:.80em;
                       outline:none;">
            <button id="god-spawn-btn"
                style="flex:1;padding:5px 8px;background:#3a1a08;border:1px solid #c8620a;
                       color:#f0a040;border-radius:4px;cursor:pointer;font-family:inherit;
                       font-size:.80em;font-weight:600;">
                ⬇ Spawn
            </button>
        </div>`;
    _panel.appendChild(footer);

    document.body.appendChild(_panel);

    // Bind filter
    document.getElementById('god-spawn-filter').addEventListener('input', (e) => {
        _filterText = e.target.value.toLowerCase();
        _renderList();
    });

    // Bind spawn button
    document.getElementById('god-spawn-btn').addEventListener('click', () => {
        _doSpawn();
    });
}

function _renderList() {
    const listWrap = document.getElementById('god-spawn-list');
    if (!listWrap) return;
    listWrap.innerHTML = '';

    const categories = {};
    for (const entry of SPAWN_CATALOG) {
        const info = getIcon(entry.id);
        const searchTarget = (entry.id + ' ' + info.name + ' ' + entry.category).toLowerCase();
        if (_filterText && !searchTarget.includes(_filterText)) continue;
        if (!categories[entry.category]) categories[entry.category] = [];
        categories[entry.category].push({ ...entry, ...info });
    }

    const catEntries = Object.entries(categories);
    if (catEntries.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px 10px;font-size:.78em;color:#555;text-align:center;';
        empty.textContent = 'No items match.';
        listWrap.appendChild(empty);
        return;
    }

    for (const [cat, items] of catEntries) {
        const catLabel = document.createElement('div');
        catLabel.style.cssText = 'padding:4px 10px 2px;font-size:.68em;font-weight:700;' +
            'color:#8a6840;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;';
        catLabel.textContent = cat;
        listWrap.appendChild(catLabel);

        for (const item of items) {
            const isSelected = (_selectedId === item.id);
            const row = document.createElement('div');
            row.style.cssText = [
                'display:flex', 'align-items:center', 'gap:8px',
                'padding:5px 10px', 'cursor:pointer', 'font-size:.80em',
                'transition:background .1s',
                isSelected
                    ? 'background:rgba(200,98,10,0.30);color:#f0c060;'
                    : 'color:#c8b090;',
            ].join(';');
            row.innerHTML =
                `<span style="font-size:1.1em;line-height:1;flex-shrink:0;">${item.icon}</span>` +
                `<span>${item.name}</span>`;

            // Capture item data in closure for this specific row
            const itemId   = item.id;
            const itemName = item.name;
            const itemIcon = item.icon;

            row.addEventListener('click', () => {
                _selectedId = itemId;
                const selEl = document.getElementById('god-spawn-selected');
                if (selEl) selEl.textContent = `${itemIcon}  ${itemName}`;
                _renderList(); // re-render to update highlight
            });

            row.addEventListener('mouseenter', () => {
                if (_selectedId !== itemId) row.style.background = 'rgba(255,255,255,0.06)';
            });
            row.addEventListener('mouseleave', () => {
                if (_selectedId !== itemId) row.style.background = '';
            });

            listWrap.appendChild(row);
        }
    }
}

function _doSpawn() {
    if (!_selectedId) {
        addMessage('Select an item to spawn first.', 'warning');
        return;
    }

    const qtyInput = document.getElementById('god-spawn-qty');
    const qty = Math.max(1, Math.min(99, parseInt(qtyInput?.value ?? '1', 10) || 1));

    const { q, r } = state.player;
    const hexData = getHexData(q, r);
    if (!hexData) {
        addMessage('No hex at current position.', 'warning');
        return;
    }

    const info = getIcon(_selectedId);
    const item = { id: _selectedId, name: info.name, icon: info.icon, qty };

    // Add to ground loot — _syncLootAdd inside will handle multiplayer sync
    addToGroundLoot(q, r, [item]);

    addMessage(`[God] Spawned ${qty}× ${info.name} on current hex.`, 'info');

    // Refresh nearby ground loot panel if inventory is open
    import('./ui.js').then(m => m.refreshGroundLootPanel(q, r));

    // Refresh location view badges (only if location view is active, not map)
    import('./location-view.js').then(m => {
        if (!m.isMapViewOpen()) m.render(q, r);
    });
}
