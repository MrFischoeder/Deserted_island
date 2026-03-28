import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { updateSunPosition, getDayPhaseText } from './day-cycle.js';
import { getIcon, ICONS } from './icons.js';
import { addItem, FOOD_VALUES } from './inventory.js';
import { resolveCombat, getCombatState } from './wildlife.js';

// =================== MESSAGES ===================

export function addMessage(text, type = '') {
    const list = document.getElementById('message-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'message-entry' + (type ? ' ' + type : '');
    div.textContent = text;
    list.prepend(div);
    while (list.children.length > CONFIG.MAX_MESSAGES) {
        list.removeChild(list.lastChild);
    }
}

// =================== HUD ===================

export function updateHUD() {
    const p = state.player;
    function setBar(id, val, max) {
        const fill = document.getElementById(id + '-fill');
        const label = document.getElementById(id + '-value');
        if (fill)  fill.style.width = Math.round((val / max) * 100) + '%';
        if (label) label.textContent = Math.round(val);
        if (fill) fill.classList.toggle('low', val / max < 0.25);
    }
    setBar('hp',     p.hp,     p.maxHp);
    setBar('food',   p.food,   p.maxFood);
    setBar('water',  p.water,  p.maxWater);
    setBar('energy', p.energy, p.maxEnergy);

    const dayEl = document.getElementById('day-number');
    const apEl  = document.getElementById('ap-display');
    const phEl  = document.getElementById('day-phase');
    if (dayEl) dayEl.textContent = `Day ${p.day}`;
    if (apEl)  apEl.textContent  = `AP: ${p.ap}/${p.maxAp}`;
    if (phEl)  phEl.textContent  = getDayPhaseText();

    updateSunPosition();
}

// =================== MODALS ===================

export function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    state.activeModal = id;
}

export function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    if (state.activeModal === id) state.activeModal = null;
}

export function closeActiveModal() {
    if (state.activeModal) closeModal(state.activeModal);
}

// =================== PATH DISCOVERY CONFIRM ===================

export function showPathDiscoveryConfirm(terrainName, cost, onConfirm, onCancel) {
    const MODAL_ID = 'path-discovery-modal';

    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9000',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:rgba(0,0,0,.55)',
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'background:#1a1612', 'border:1px solid #6a5030',
            'border-radius:8px', 'padding:22px 26px', 'max-width:340px', 'width:90%',
            'box-shadow:0 4px 24px rgba(0,0,0,.7)', 'color:#d4c09a', 'font-family:inherit',
        ].join(';');
        box.innerHTML = `
            <div id="path-disc-title" style="font-size:1.05em;font-weight:700;margin-bottom:10px;color:#e8c97a;">
                Uncharted Path
            </div>
            <div id="path-disc-body" style="font-size:.88em;line-height:1.55;margin-bottom:16px;"></div>
            <div id="path-disc-actions" style="display:flex;gap:10px;justify-content:flex-end;"></div>`;
        modal.appendChild(box);
        document.body.appendChild(modal);
    }

    document.getElementById('path-disc-body').textContent =
        `You venture toward the ${terrainName}, pushing through unknown terrain. ` +
        `Exploring this path will cost ${cost} AP. Proceed?`;

    const actDiv = document.getElementById('path-disc-actions');
    actDiv.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:7px 16px;border:1px solid #555;background:#2a2420;color:#aaa;border-radius:5px;cursor:pointer;font-family:inherit;';
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (state.activeModal === MODAL_ID) state.activeModal = null;
        if (onCancel) onCancel();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = `Explore  (${cost} AP)`;
    confirmBtn.style.cssText = 'padding:7px 16px;border:1px solid #c8962a;background:#3a2a10;color:#f0c060;border-radius:5px;cursor:pointer;font-family:inherit;font-weight:600;';
    confirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (state.activeModal === MODAL_ID) state.activeModal = null;
        onConfirm();
    });

    actDiv.appendChild(cancelBtn);
    actDiv.appendChild(confirmBtn);

    modal.style.display = 'flex';
    state.activeModal = MODAL_ID;
}

// =================== LOOT WINDOW ===================

export function showLootWindow(items, q, r) {
    const content = document.getElementById('loot-content');
    if (!content) return;

    let pending = [...items];

    function render() {
        content.innerHTML = '';
        if (pending.length === 0) {
            closeModal('loot-window');
            import('./hex-location-panel.js').then(m => m.refreshLocationPanel());
            return;
        }
        for (let i = 0; i < pending.length; i++) {
            const item = pending[i];
            const div = document.createElement('div');
            div.className = 'loot-item';
            div.innerHTML = `
                <div class="loot-item-icon">${item.icon || '❓'}</div>
                <div class="loot-item-info">
                    <div class="loot-item-name">${item.name || item.id}</div>
                    <div class="loot-item-qty">x${item.qty}</div>
                </div>
                <div class="loot-item-actions">
                    <button class="take-btn" data-idx="${i}">Take</button>
                    <button class="leave-btn" data-idx="${i}">Leave</button>
                </div>`;
            content.appendChild(div);
        }

        content.querySelectorAll('.take-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const it = pending[idx];
                const added = addItem(it.id, it.qty, true);
                if (added > 0) {
                    import('./loot.js').then(m => m.removeFromGroundLoot(q, r, it.id, added));
                    if (added < it.qty) {
                        pending[idx] = { ...it, qty: it.qty - added };
                        addMessage(`Backpack full. Took ${added}/${it.qty} ${it.name || it.id}.`, 'warning');
                    } else {
                        addMessage(`Took ${it.qty}× ${it.name || it.id}.`, 'success');
                        pending.splice(idx, 1);
                    }
                } else {
                    addMessage('Backpack full! Drop something first.', 'warning');
                }
                render();
            });
        });
        content.querySelectorAll('.leave-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                pending.splice(idx, 1);
                render();
            });
        });
    }

    const takeAllBtn = document.getElementById('take-all-btn');
    if (takeAllBtn) {
        const newBtn = takeAllBtn.cloneNode(true);
        takeAllBtn.parentNode.replaceChild(newBtn, takeAllBtn);
        newBtn.addEventListener('click', () => {
            import('./loot.js').then(m => {
                const remaining = [];
                for (const it of pending) {
                    const added = addItem(it.id, it.qty, true);
                    if (added > 0) m.removeFromGroundLoot(q, r, it.id, added);
                    if (added < it.qty) remaining.push({ ...it, qty: it.qty - added });
                }
                if (remaining.length > 0) {
                    addMessage(`Backpack full! ${remaining.length} item(s) left on the ground.`, 'warning');
                }
                pending = remaining;
                render();
            });
        });
    }

    render();
    showModal('loot-window');
}

// =================== EVENT WINDOW ===================

export function showEventWindow(title, description, choices) {
    document.getElementById('event-title').textContent = title;
    document.getElementById('event-content').textContent = description;
    const actionsDiv = document.getElementById('event-actions');
    actionsDiv.innerHTML = '';
    for (const choice of choices) {
        const btn = document.createElement('button');
        btn.className = 'event-choice-btn';
        btn.textContent = choice.text;
        btn.addEventListener('click', () => {
            choice.effect();
            closeModal('event-window');
            import('./hex-location-panel.js').then(m => m.refreshLocationPanel());
        });
        actionsDiv.appendChild(btn);
    }
    showModal('event-window');
}

// =================== COMBAT WINDOW ===================

export function showCombatWindow(wildlife, q, r) {
    document.getElementById('combat-title').textContent = `${wildlife.icon} ${wildlife.name}!`;
    const combatContent = document.getElementById('combat-content');
    combatContent.innerHTML = `
        <div style="display:flex;gap:20px;margin-bottom:10px;">
            <div><strong style="color:#e74c3c;">Enemy HP:</strong>
                <span id="enemy-hp-display">${wildlife.hp}/${wildlife.hp}</span>
            </div>
            <div><strong style="color:#e74c3c;">Your HP:</strong>
                <span id="player-hp-combat">${state.player.hp}/${state.player.maxHp}</span>
            </div>
        </div>`;
    const logDiv = document.getElementById('combat-log');
    logDiv.innerHTML = '';
    renderCombatActions(q, r);
    showModal('combat-window');
}

function renderCombatActions(q, r) {
    const actDiv = document.getElementById('combat-actions');
    actDiv.innerHTML = '';

    const actions = [
        { id: 'attack', label: '⚔️ Attack' },
        { id: 'flee',   label: '🏃 Flee' },
        { id: 'sneak',  label: '🤫 Sneak Past' },
    ];

    for (const act of actions) {
        const btn = document.createElement('button');
        btn.className = 'combat-action-btn';
        btn.textContent = act.label;
        btn.addEventListener('click', () => {
            const result = resolveCombat(act.id);
            const logDiv = document.getElementById('combat-log');
            const logEntry = document.createElement('div');
            logEntry.textContent = result.log;
            logDiv.prepend(logEntry);

            const ehp = document.getElementById('enemy-hp-display');
            const php = document.getElementById('player-hp-combat');
            if (ehp) ehp.textContent = `${Math.max(0, result.wildlifeHp)}/${result.wildlifeMaxHp}`;
            if (php) php.textContent = `${state.player.hp}/${state.player.maxHp}`;
            updateHUD();

            if (result.done) {
                closeModal('combat-window');
                import('./hex-location-panel.js').then(m => m.refreshLocationPanel());
            }
        });
        actDiv.appendChild(btn);
    }
}

// =================== INVENTORY WINDOW ===================

export function openInventoryWindow() {
    const content = document.getElementById('inventory-content');
    if (!content) return;

    // Rebuild two-column layout every open so crafting reflects latest inventory
    content.innerHTML = '';
    content.style.cssText = 'display:flex;gap:0;overflow:hidden;max-height:68vh;';

    // ── Left column: stats + backpack + ground loot ─────────────────────────
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:1.25;overflow-y:auto;padding-right:14px;border-right:1px solid #2a2010;min-width:0;';

    const statsPanel  = document.createElement('div');
    statsPanel.id = 'character-stats-panel';
    statsPanel.className = 'inventory-section';

    const itemsPanel  = document.createElement('div');
    itemsPanel.id = 'inventory-items-panel';
    itemsPanel.className = 'inventory-section';

    const groundPanel = document.createElement('div');
    groundPanel.id = 'ground-loot-panel';
    groundPanel.className = 'inventory-section ground-loot-section';

    leftCol.append(statsPanel, itemsPanel, groundPanel);

    // ── Right column: crafting ───────────────────────────────────────────────
    const rightCol = document.createElement('div');
    rightCol.id = 'inv-crafting-col';
    rightCol.style.cssText = 'flex:1;overflow-y:auto;padding-left:14px;min-width:0;';

    content.append(leftCol, rightCol);

    // ── Populate left column ─────────────────────────────────────────────────
    const p = state.player;

    statsPanel.innerHTML = `<h3>Character</h3>
        <div class="character-stat"><span class="label">Day</span><span class="value">${p.day}</span></div>
        <div class="character-stat"><span class="label">HP</span><span class="value">${p.hp}/${p.maxHp}</span></div>
        <div class="character-stat"><span class="label">Food</span><span class="value">${Math.round(p.food)}/${p.maxFood}</span></div>
        <div class="character-stat"><span class="label">Water</span><span class="value">${Math.round(p.water)}/${p.maxWater}</span></div>
        <div class="character-stat"><span class="label">Energy</span><span class="value">${p.energy}/${p.maxEnergy}</span></div>
        <div class="character-stat"><span class="label">AP</span><span class="value">${p.ap}/${p.maxAp}</span></div>
    `;

    const inv = p.inventory;
    const slotCount = p.maxSlots || 9;
    itemsPanel.innerHTML = `<h3>Backpack (${inv.length}/${slotCount})</h3>`;

    const grid = document.createElement('div');
    grid.className = 'inventory-grid';

    for (let i = 0; i < slotCount; i++) {
        const stack = inv[i];
        const slot = document.createElement('div');
        if (stack) {
            const info = getIcon(stack.id);
            slot.className = 'inventory-slot' + (stack.spoilDay ? ' spoilable' : '') + (FOOD_VALUES[stack.id] ? ' food-item' : '');
            slot.title = stack.spoilDay ? `${info.name} (spoils day ${stack.spoilDay})` : info.name;
            slot.innerHTML = `
                <div class="item-icon">${info.icon}</div>
                <div class="item-name">${info.name}</div>`;

            if (FOOD_VALUES[stack.id]) {
                const eatBtn = document.createElement('button');
                eatBtn.className = 'slot-eat-btn';
                eatBtn.textContent = `Eat (+${FOOD_VALUES[stack.id]})`;
                const capturedId = stack.id;
                eatBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    import('./survival-needs.js').then(m => {
                        const ok = m.eat(capturedId);
                        if (ok) {
                            closeModal('inventory-window');
                            setTimeout(openInventoryWindow, 50);
                        }
                    });
                });
                slot.appendChild(eatBtn);
            }

            const dropBtn = document.createElement('button');
            dropBtn.className = 'slot-drop-btn';
            dropBtn.textContent = 'Drop';
            const capturedSlotIndex = i;
            dropBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const removed = inv.splice(capturedSlotIndex, 1)[0];
                if (!removed) return;
                import('./loot.js').then(m => m.dropItemToGround(removed));
                const dInfo = getIcon(removed.id);
                addMessage(`Dropped ${dInfo.name} on the ground. Store it in camp to keep it safe.`, 'info');
                closeModal('inventory-window');
                setTimeout(openInventoryWindow, 50);
            });
            slot.appendChild(dropBtn);
        } else {
            slot.className = 'inventory-slot empty-slot drop-target';
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('drag-over');
            });
            slot.addEventListener('dragleave', () => {
                slot.classList.remove('drag-over');
            });
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    _pickOneFromGround(data.id);
                } catch (_) { /* ignore bad drag data */ }
            });
        }
        grid.appendChild(slot);
    }
    itemsPanel.appendChild(grid);

    _renderGroundLootPanel(groundPanel, p.q, p.r);

    // ── Populate right column with crafting ──────────────────────────────────
    _renderInventoryCrafting(rightCol);

    showModal('inventory-window');
}

function _renderInventoryCrafting(container) {
    const hdr = document.createElement('h3');
    hdr.style.cssText = 'color:#666;font-size:.82em;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px;';
    hdr.textContent = '⚒️ Crafting';
    container.appendChild(hdr);

    const recipeList = document.createElement('div');
    recipeList.id = 'inv-recipe-list';
    container.appendChild(recipeList);

    const detailBox = document.createElement('div');
    detailBox.id = 'inv-recipe-detail';
    detailBox.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #2a2010;';
    detailBox.innerHTML = '<p style="color:#555;font-size:.82em;margin:0;">Select a recipe.</p>';
    container.appendChild(detailBox);

    import('./crafting.js').then(mod => {
        const recipes = mod.getAvailableRecipes();
        recipeList.innerHTML = '';

        for (const recipe of recipes) {
            const info = getIcon(recipe.result.id);
            const row  = document.createElement('div');
            row.className = 'recipe-item' + (recipe.canCraft ? ' craftable' : '');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:4px;cursor:pointer;margin-bottom:2px;';
            row.innerHTML = `
                <span style="font-size:1.15em;">${info.icon}</span>
                <div>
                    <div style="font-size:.84em;">${recipe.name}</div>
                    <div style="font-size:.72em;color:${recipe.canCraft ? '#6aaa6a' : '#666'};">
                        ${recipe.canCraft ? '✓ Ready' : '✗ Missing items'}
                    </div>
                </div>`;
            row.addEventListener('click', () => {
                recipeList.querySelectorAll('.recipe-item').forEach(el => el.classList.remove('selected'));
                row.classList.add('selected');
                _renderRecipeDetail(mod, recipe, detailBox);
            });
            recipeList.appendChild(row);
        }

        if (recipes.length === 0) {
            recipeList.innerHTML = '<p style="color:#555;font-size:.82em;">No recipes available.</p>';
        }
    });
}

function _renderRecipeDetail(mod, recipe, detailBox) {
    const info         = getIcon(recipe.result.id);
    const missingIngs  = mod.getMissingIngredients(recipe);
    const missingTools = mod.getMissingTools ? mod.getMissingTools(recipe) : [];

    let html = `<div style="font-weight:600;margin-bottom:4px;">${info.icon} ${recipe.name}</div>`;
    if (recipe.description) {
        html += `<p style="font-size:.8em;color:#777;margin:0 0 8px;">${recipe.description}</p>`;
    }

    if (recipe.ingredients && recipe.ingredients.length > 0) {
        html += `<div style="font-size:.72em;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Consumes</div>`;
        for (const ing of recipe.ingredients) {
            const iinfo   = getIcon(ing.id);
            const missing = missingIngs.find(m => m.id === ing.id);
            const have    = missing ? missing.have : ing.qty;
            const col     = missing ? '#c06060' : '#60aa60';
            html += `<div style="font-size:.82em;color:${col};margin-bottom:2px;">
                ${iinfo.icon} ${iinfo.name} ×${ing.qty}
                <span style="color:#555;">(have ${have})</span>
            </div>`;
        }
    }

    if (recipe.tools && recipe.tools.length > 0) {
        html += `<div style="font-size:.72em;color:#666;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 4px;">Requires (kept)</div>`;
        for (const tool of recipe.tools) {
            const isMissing = tool.anyOf
                ? missingTools.some(m => m.anyOf)
                : missingTools.some(m => m.id === tool.id);
            const col   = isMissing ? '#c06060' : '#60aa60';
            const label = tool.anyOf ? (tool.label || tool.anyOf.join('/')) : getIcon(tool.id).name;
            html += `<div style="font-size:.82em;color:${col};margin-bottom:2px;">🔧 ${label}</div>`;
        }
    }

    html += `<div style="font-size:.78em;color:#666;margin-top:8px;">AP cost: ${recipe.apCost || 1}</div>`;

    detailBox.innerHTML = html;

    if (recipe.canCraft) {
        const btn = document.createElement('button');
        btn.className = 'craft-btn';
        btn.style.cssText = 'margin-top:10px;width:100%;padding:8px;';
        btn.textContent = `⚒️ Craft ${recipe.name}`;
        btn.addEventListener('click', () => {
            const result = mod.craft(recipe.id);
            addMessage(result.message, result.success ? 'success' : 'warning');
            if (result.success) {
                closeModal('inventory-window');
                setTimeout(openInventoryWindow, 50);
            }
        });
        detailBox.appendChild(btn);
    }
}

/**
 * Refreshes only the ground loot section of the inventory window.
 * Called by multiplayer listeners when another player changes loot on the current hex.
 * No-op if inventory window is not open or player is not on the affected hex.
 */
export function refreshGroundLootPanel(q, r) {
    const win = document.getElementById('inventory-window');
    if (!win || win.classList.contains('hidden')) return;
    if (state.player.q !== q || state.player.r !== r) return;
    const groundPanel = document.getElementById('ground-loot-panel');
    if (!groundPanel) return;
    _renderGroundLootPanel(groundPanel, q, r);
}

function _renderGroundLootPanel(groundPanel, q, r) {
    if (!groundPanel) return;

    const hexData   = getHexData(q, r);
    const groundLoot = hexData ? hexData.groundLoot.filter(l => l.qty > 0) : [];

    groundPanel.innerHTML = '<h3>Nearby Ground Loot</h3>';

    if (groundLoot.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'ground-loot-empty';
        msg.textContent = 'Nothing on the ground here.';
        groundPanel.appendChild(msg);
        return;
    }

    const hint = document.createElement('p');
    hint.className = 'ground-loot-hint';
    hint.textContent = 'Click or drag to backpack (1 per slot). Items left outside vanish after 2–3 days.';
    groundPanel.appendChild(hint);

    const groundGrid = document.createElement('div');
    groundGrid.className = 'ground-loot-grid';

    for (const item of groundLoot) {
        const gslot = document.createElement('div');
        gslot.className = 'inventory-slot ground-loot-slot';
        gslot.draggable = true;
        const expiry = item.expiresAtDay !== undefined ? ` — expires day ${item.expiresAtDay}` : '';
        gslot.title = `${item.name || item.id} ×${item.qty}${expiry} — click or drag to backpack`;
        gslot.innerHTML = `
            <div class="item-icon">${item.icon || '❓'}</div>
            <div class="item-name">${item.name || item.id}</div>
            <div class="item-qty">×${item.qty}</div>`;

        gslot.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id }));
            e.dataTransfer.effectAllowed = 'move';
            gslot.classList.add('dragging');
        });
        gslot.addEventListener('dragend', () => gslot.classList.remove('dragging'));
        gslot.addEventListener('click', () => _pickOneFromGround(item.id));

        groundGrid.appendChild(gslot);
    }
    groundPanel.appendChild(groundGrid);
}

function _pickOneFromGround(itemId) {
    const { q, r } = state.player;
    const hexData = getHexData(q, r);
    if (!hexData) return;
    const added = addItem(itemId, 1, true);
    if (added > 0) {
        import('./loot.js').then(m => m.removeFromGroundLoot(q, r, itemId, 1));
        const info = getIcon(itemId);
        addMessage(`Picked up ${info.name}.`, 'success');
    } else {
        addMessage('Backpack full! Drop something first.', 'warning');
    }
    closeModal('inventory-window');
    setTimeout(openInventoryWindow, 50);
}

// =================== CRAFTING WINDOW ===================

export function openCraftingWindow() {
    import('./crafting.js').then(mod => {
        const recipes = mod.getAvailableRecipes();
        const list    = document.getElementById('crafting-recipes-list');
        const details = document.getElementById('crafting-details');
        if (!list || !details) return;

        list.innerHTML = '<h3 style="color:#666;font-size:.82em;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">Recipes</h3>';

        function renderDetails(recipe) {
            const info         = getIcon(recipe.result.id);
            const missingIngs  = mod.getMissingIngredients(recipe);
            const missingTools = mod.getMissingTools ? mod.getMissingTools(recipe) : [];

            let html = `<h4>${info.icon} ${recipe.name}</h4>
                <p style="font-size:.82em;color:#888;margin:6px 0 12px;">${recipe.description}</p>`;

            if (recipe.ingredients && recipe.ingredients.length > 0) {
                html += `<p style="font-size:.8em;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;">Consumes:</p>`;
                for (const ing of recipe.ingredients) {
                    const iinfo  = getIcon(ing.id);
                    const isMiss = missingIngs.find(m => m.id === ing.id);
                    const have   = isMiss ? isMiss.have : ing.qty;
                    html += `<div class="ingredient-line ${isMiss ? 'bad' : 'ok'}">
                        ${iinfo.icon} ${iinfo.name} × ${ing.qty} <span style="color:#666;">(have ${have})</span></div>`;
                }
            }

            if (recipe.tools && recipe.tools.length > 0) {
                html += `<p style="font-size:.8em;color:#6a8a6a;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.08em;">Requires (kept):</p>`;
                for (const tool of recipe.tools) {
                    const isMissing = tool.anyOf
                        ? missingTools.some(m => m.anyOf)
                        : missingTools.some(m => m.id === tool.id);
                    if (tool.anyOf) {
                        html += `<div class="ingredient-line tool-req ${isMissing ? 'bad' : 'ok'}">
                            🔧 ${tool.label || tool.anyOf.join(' / ')} <span style="color:#6a8a6a;font-size:.85em;">(tool — not consumed)</span>
                            <span style="color:#666;">(${isMissing ? '✗ none in pack' : '✓ have one'})</span></div>`;
                    } else {
                        const tinfo = getIcon(tool.id);
                        html += `<div class="ingredient-line tool-req ${isMissing ? 'bad' : 'ok'}">
                            ${tinfo.icon} ${tinfo.name} × ${tool.qty || 1} <span style="color:#6a8a6a;font-size:.85em;">(tool — not consumed)</span></div>`;
                    }
                }
            }

            html += `<p style="font-size:.8em;color:#666;margin-top:10px;">AP Cost: ${recipe.apCost || 1}</p>`;
            details.innerHTML = html;

            const craftBtn = document.createElement('button');
            craftBtn.className = 'craft-btn';
            craftBtn.textContent = recipe.canCraft ? `⚒️ Craft ${recipe.name}` : 'Cannot Craft';
            craftBtn.disabled = !recipe.canCraft;
            craftBtn.addEventListener('click', () => {
                const result = mod.craft(recipe.id);
                if (result.success) {
                    closeModal('crafting-window');
                    addMessage(result.message, 'success');
                } else {
                    addMessage(result.message, 'warning');
                }
            });
            details.appendChild(craftBtn);
        }

        for (const recipe of recipes) {
            const info = getIcon(recipe.result.id);
            const item = document.createElement('div');
            item.className = 'recipe-item' + (recipe.canCraft ? ' craftable' : '');
            item.innerHTML = `<div class="recipe-item-icon">${info.icon}</div>
                <div><div class="recipe-name">${recipe.name}</div>
                <div class="recipe-tag">${recipe.category}</div></div>`;
            item.addEventListener('click', () => {
                list.querySelectorAll('.recipe-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                renderDetails(recipe);
            });
            list.appendChild(item);
        }

        showModal('crafting-window');
    });
}

// =================== SAVE/LOAD WINDOW ===================

export function openSaveLoadWindow(mode = 'save') {
    import('./save-load.js').then(mod => {
        const title   = document.getElementById('save-load-title');
        const content = document.getElementById('save-load-content');
        if (!title || !content) return;
        title.textContent = mode === 'save' ? 'Save Game' : 'Load Game';

        content.innerHTML = `
            <div class="save-load-tabs">
                <button class="sl-tab ${mode==='save'?'active':''}" id="sl-save-tab">Save</button>
                <button class="sl-tab ${mode==='load'?'active':''}" id="sl-load-tab">Load</button>
            </div>
            <div id="sl-slots"></div>`;

        document.getElementById('sl-save-tab').addEventListener('click', () => openSaveLoadWindow('save'));
        document.getElementById('sl-load-tab').addEventListener('click', () => openSaveLoadWindow('load'));

        const slots    = mod.getSaveSlots();
        const slotsDiv = document.getElementById('sl-slots');

        for (const slot of slots) {
            const div = document.createElement('div');
            div.className = 'save-slot';
            if (slot.exists) {
                div.innerHTML = `
                    <div class="save-slot-info">
                        <div class="slot-name">Slot ${slot.slot} — Day ${slot.day} (${slot.mapSize})</div>
                        <div class="slot-date">${slot.timestamp}</div>
                    </div>
                    <div class="save-slot-actions">
                        ${mode==='save' ? `<button class="slot-action-btn save-btn" data-slot="${slot.slot}">Overwrite</button>` : ''}
                        ${mode==='load' ? `<button class="slot-action-btn load-btn" data-slot="${slot.slot}">Load</button>` : ''}
                        <button class="slot-action-btn del-btn" data-slot="${slot.slot}">Delete</button>
                    </div>`;
            } else {
                div.innerHTML = `
                    <div class="save-slot-info">
                        <div class="slot-name">Slot ${slot.slot}</div>
                        <div class="slot-date slot-empty">Empty</div>
                    </div>
                    <div class="save-slot-actions">
                        ${mode==='save' ? `<button class="slot-action-btn save-btn" data-slot="${slot.slot}">Save Here</button>` : ''}
                    </div>`;
            }
            div.querySelectorAll('.save-btn').forEach(btn => {
                btn.addEventListener('click', () => { mod.saveGame(parseInt(btn.dataset.slot)); closeModal('save-load-window'); });
            });
            div.querySelectorAll('.load-btn').forEach(btn => {
                btn.addEventListener('click', () => { mod.loadGame(parseInt(btn.dataset.slot)); closeModal('save-load-window'); });
            });
            div.querySelectorAll('.del-btn').forEach(btn => {
                btn.addEventListener('click', () => { mod.deleteSave(parseInt(btn.dataset.slot)); openSaveLoadWindow(mode); });
            });
            slotsDiv.appendChild(div);
        }

        showModal('save-load-window');
    });
}

// =================== MULTIPLAYER DAY STATUS ===================

export function updateDayStatus(status) {
    const panel = document.getElementById('day-status-panel');
    const text  = document.getElementById('day-status-text');
    if (!panel) return;
    if (!status) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    if (text) text.textContent = `⏳ ${status.ended}/${status.total} players ready`;
}

export function setEndDayWaiting(waiting) {
    const panel = document.getElementById('day-status-panel');
    const text  = document.getElementById('day-status-text');
    if (!panel) return;
    if (waiting) {
        panel.classList.remove('hidden');
        if (text && text.textContent === '') text.textContent = '⏳ Waiting for other players…';
    } else {
        panel.classList.add('hidden');
    }
}

// =================== INIT UI ===================

export function initUI() {
    document.getElementById('close-loot-window')?.addEventListener('click',  () => closeModal('loot-window'));
    document.getElementById('close-inventory')?.addEventListener('click',    () => closeModal('inventory-window'));
    document.getElementById('close-crafting')?.addEventListener('click',     () => closeModal('crafting-window'));
    document.getElementById('close-save-load')?.addEventListener('click',    () => closeModal('save-load-window'));
    document.getElementById('close-camp')?.addEventListener('click',         () => closeModal('camp-window'));

    document.getElementById('btn-god-mode')?.addEventListener('click', () => {
        import('./god-mode.js').then(m => m.toggleGodMode());
    });
    document.getElementById('btn-instant-actions')?.addEventListener('click', () => {
        import('./action-timer.js').then(m => {
            m.setInstantMode(!m.isInstantMode());
            const btn = document.getElementById('btn-instant-actions');
            if (btn) btn.style.background = m.isInstantMode() ? 'rgba(200,160,0,.35)' : '';
            addMessage(m.isInstantMode() ? '⚡ Instant actions ON.' : '⚡ Instant actions OFF.', 'info');
        });
    });
    document.getElementById('btn-save')?.addEventListener('click', () => openSaveLoadWindow('save'));
    document.getElementById('btn-load')?.addEventListener('click', () => openSaveLoadWindow('load'));

    document.addEventListener('keydown', (e) => {
        if (!state.gameStarted) return;
        if (e.key === 'Escape') closeActiveModal();
        if (e.key === 'i' || e.key === 'I') {
            if (state.activeModal === 'inventory-window') closeModal('inventory-window');
            else openInventoryWindow();
        }
        if (e.key === 'c' || e.key === 'C') {
            if (state.activeModal === 'crafting-window') closeModal('crafting-window');
            else openCraftingWindow();
        }
        if (e.key === 'g' || e.key === 'G') {
            import('./god-mode.js').then(m => m.toggleGodMode());
        }
    });
}
