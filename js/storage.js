import { state, getHexData } from './state.js';
import { addMessage, updateHUD, showModal, closeModal } from './ui.js';
import { getIcon } from './icons.js';
import { CAMP_STRUCTURES } from './camp.js';

/**
 * Opens the storage window for campStructures[structureIndex] on a camp hex.
 * Only valid for structures with storageCapacity > 0.
 */
export function openCampStorageWindow(q, r, structureIndex) {
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) {
        addMessage('No camp here.', 'warning');
        return;
    }
    const s = data.campStructures[structureIndex];
    if (!s) { addMessage('Storage not found.', 'warning'); return; }

    const def = CAMP_STRUCTURES[s.id];
    if (!def || def.storageCapacity === 0) {
        addMessage('This structure has no storage.', 'warning');
        return;
    }
    if (!Array.isArray(s.items)) s.items = [];

    const win = document.getElementById('storage-window');
    if (!win) return;

    _renderStorageWindow(q, r, structureIndex, def, s);
    showModal('storage-window');

    const closeBtn = document.getElementById('close-storage');
    if (closeBtn) {
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        newBtn.addEventListener('click', () => closeModal('storage-window'));
    }
}

function _renderStorageWindow(q, r, structureIndex, def, s) {
    const inv = state.player.inventory;
    const storage = s.items;
    const content = document.getElementById('storage-content');
    if (!content) return;

    // Update header
    const header = document.querySelector('#storage-window .modal-header h2');
    if (header) header.textContent = `${def.icon} ${def.name}`;

    function render() {
        content.innerHTML = '';

        // ── Chest / Storage column ──────────────────────────
        const stCol = document.createElement('div');
        stCol.className = 'storage-col';

        const stTitle = document.createElement('h3');
        stTitle.textContent = `${def.icon} ${def.name} (${storage.length}/${def.storageCapacity})`;
        stCol.appendChild(stTitle);

        if (def.storageType === 'wood') {
            const hint = document.createElement('p');
            hint.className = 'storage-type-hint';
            hint.textContent = 'Accepts wood only.';
            stCol.appendChild(hint);
        }

        const stGrid = document.createElement('div');
        stGrid.className = 'inventory-grid';

        for (let i = 0; i < def.storageCapacity; i++) {
            const slot = document.createElement('div');
            if (storage[i]) {
                const item = storage[i];
                const info = getIcon(item.id);
                slot.className = 'inventory-slot';
                slot.title = `${info.name} — click to take`;
                slot.innerHTML = `<div class="item-icon">${info.icon}</div><div class="item-name">${info.name}</div>`;
                slot.addEventListener('click', () => {
                    if (inv.length >= state.player.maxSlots) {
                        addMessage('Backpack full!', 'warning');
                        return;
                    }
                    const removed = storage.splice(i, 1)[0];
                    inv.push({ id: removed.id, qty: 1, spoilDay: removed.spoilDay || null });
                    addMessage(`Took ${getIcon(removed.id).name}.`, 'info');
                    updateHUD();
                    render();
                });
            } else {
                slot.className = 'inventory-slot empty-slot';
            }
            stGrid.appendChild(slot);
        }
        stCol.appendChild(stGrid);
        content.appendChild(stCol);

        // ── Backpack column ──────────────────────────────────
        const invCol = document.createElement('div');
        invCol.className = 'storage-col';

        const invTitle = document.createElement('h3');
        invTitle.textContent = `🎒 Backpack (${inv.length}/${state.player.maxSlots})`;
        invCol.appendChild(invTitle);

        const invGrid = document.createElement('div');
        invGrid.className = 'inventory-grid';

        for (let i = 0; i < state.player.maxSlots; i++) {
            const slot = document.createElement('div');
            if (inv[i]) {
                const item = inv[i];
                const info = getIcon(item.id);

                // Wood storage only accepts wood
                const canDeposit = def.storageType === 'any' || item.id === def.storageType;

                slot.className = 'inventory-slot' + (canDeposit ? '' : ' no-deposit');
                slot.title = canDeposit
                    ? `${info.name} — click to store`
                    : `${info.name} — not accepted here`;
                slot.innerHTML = `<div class="item-icon">${info.icon}</div><div class="item-name">${info.name}</div>`;

                if (canDeposit) {
                    slot.addEventListener('click', () => {
                        if (storage.length >= def.storageCapacity) {
                            addMessage(`${def.name} is full!`, 'warning');
                            return;
                        }
                        const removed = inv.splice(i, 1)[0];
                        storage.push({ id: removed.id, qty: 1, spoilDay: removed.spoilDay || null });
                        addMessage(`Stored ${getIcon(removed.id).name}.`, 'info');
                        updateHUD();
                        render();
                    });
                }
            } else {
                slot.className = 'inventory-slot empty-slot';
            }
            invGrid.appendChild(slot);
        }
        invCol.appendChild(invGrid);
        content.appendChild(invCol);
    }

    render();
}

/**
 * Checks all camp storage structures for spoiled food items.
 * Called at end of day. Items whose spoilDay <= current day are removed.
 */
export function checkStorageSpoilage() {
    const day = state.player.day;
    const { q: pq, r: pr } = state.player;
    const msgs = [];

    state.hexData.forEach(data => {
        if (!data.hasCamp || !Array.isArray(data.campStructures)) return;
        for (const s of data.campStructures) {
            if (!Array.isArray(s.items) || s.items.length === 0) continue;
            s.items = s.items.filter(item => {
                if (item.spoilDay !== null && item.spoilDay !== undefined && item.spoilDay <= day) {
                    if (data.q === pq && data.r === pr) {
                        msgs.push(`${getIcon(item.id).name} in storage has spoiled.`);
                    }
                    return false;
                }
                return true;
            });
        }
    });

    for (const msg of msgs) addMessage(msg, 'warning');
}
