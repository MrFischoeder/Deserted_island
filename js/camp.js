import { state, getHexData } from './state.js';
import { addMessage, updateHUD, showModal, closeModal } from './ui.js';
import { hasItem, removeItem, getItemCount } from './inventory.js';
import { hasAP, spendAP } from './action-points.js';
import { getIcon } from './icons.js';

// =================== STRUCTURE DEFINITIONS ===================

const CAMP_COST = [{ id: 'wood', qty: 1 }, { id: 'stone', qty: 2 }];

export const CAMP_STRUCTURES = {
    camp_marker: {
        id: 'camp_marker',
        name: 'Camp Site',
        icon: '⛺',
        description: 'The established camp base.',
        ingredients: [],
        apCost: 0,
        storageCapacity: 0,
        storageType: null,
        unique: true,
        autoBuilt: true,
    },
    campfire: {
        id: 'campfire',
        name: 'Campfire',
        icon: '🔥',
        description: 'A permanent fire pit. +50 energy overnight, deters predators.',
        ingredients: [{ id: 'wood', qty: 2 }, { id: 'flint', qty: 1 }],
        apCost: 1,
        storageCapacity: 0,
        storageType: null,
        unique: true,
    },
    shelter: {
        id: 'shelter',
        name: 'Shelter',
        icon: '🏕️',
        description: 'A lean-to shelter. +30 energy overnight, protects from storms.',
        ingredients: [{ id: 'wood', qty: 6 }, { id: 'vine', qty: 3 }, { id: 'fabric_scrap', qty: 2 }],
        apCost: 3,
        storageCapacity: 0,
        storageType: null,
        unique: true,
    },
    chest: {
        id: 'chest',
        name: 'Storage Chest',
        icon: '🗃️',
        description: 'A wooden chest. Stores up to 20 items of any kind.',
        ingredients: [{ id: 'wood', qty: 4 }, { id: 'rope', qty: 2 }, { id: 'stone', qty: 2 }],
        apCost: 2,
        storageCapacity: 20,
        storageType: 'any',
        unique: false,
    },
    shelf: {
        id: 'shelf',
        name: 'Shelf',
        icon: '📦',
        description: 'A simple wooden shelf. Stores up to 10 items.',
        ingredients: [{ id: 'wood', qty: 3 }, { id: 'rope', qty: 1 }],
        apCost: 1,
        storageCapacity: 10,
        storageType: 'any',
        unique: false,
    },
    wood_storage: {
        id: 'wood_storage',
        name: 'Wood Storage',
        icon: '🌲',
        description: 'A wood rack. Stores up to 30 wood only.',
        ingredients: [{ id: 'wood', qty: 4 }, { id: 'vine', qty: 2 }],
        apCost: 2,
        storageCapacity: 30,
        storageType: 'wood',
        unique: true,
    },
};

// =================== QUERIES ===================

export function hasCampStructure(q, r, structureId) {
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) return false;
    return data.campStructures.some(s => s.id === structureId);
}

export function getCampStructure(q, r, structureId) {
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) return null;
    return data.campStructures.find(s => s.id === structureId) || null;
}

export function getCampStorageStructures(q, r) {
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) return [];
    return data.campStructures
        .map((s, idx) => ({ ...s, _idx: idx }))
        .filter(s => {
            const def = CAMP_STRUCTURES[s.id];
            return def && def.storageCapacity > 0;
        });
}

// =================== ESTABLISH CAMP ===================

export function establishCamp(q, r) {
    if (!hasAP(1)) {
        addMessage('Not enough AP to establish camp.', 'warning');
        return false;
    }
    for (const ing of CAMP_COST) {
        if (!hasItem(ing.id, ing.qty)) {
            const info = getIcon(ing.id);
            addMessage(`Need ${ing.qty}× ${info.name} to establish camp.`, 'warning');
            return false;
        }
    }
    const data = getHexData(q, r);
    if (!data) return false;
    if (data.hasCamp) {
        addMessage('Camp already established here.', 'warning');
        return false;
    }
    spendAP(1);
    for (const ing of CAMP_COST) removeItem(ing.id, ing.qty);
    data.hasCamp = true;
    data.campStructures = [{ id: 'camp_marker', builtAtDay: state.player.day }];
    addMessage('⛺ Camp established! You can now build structures here.', 'success');
    updateHUD();
    import('./render.js').then(m => m.updateCampMarker(q, r));
    return true;
}

// =================== BUILD ===================

export function canBuildStructure(q, r, structureId) {
    const def = CAMP_STRUCTURES[structureId];
    if (!def) return { can: false, reason: 'Unknown structure.' };
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) return { can: false, reason: 'No camp here.' };
    if (def.unique && data.campStructures.some(s => s.id === structureId)) {
        return { can: false, reason: `${def.name} already built.` };
    }
    if (!hasAP(def.apCost)) return { can: false, reason: `Need ${def.apCost} AP.` };
    for (const ing of def.ingredients) {
        if (!hasItem(ing.id, ing.qty)) {
            const info = getIcon(ing.id);
            return { can: false, reason: `Need ${ing.qty}× ${info.name}.` };
        }
    }
    return { can: true };
}

export function buildStructure(q, r, structureId) {
    const check = canBuildStructure(q, r, structureId);
    if (!check.can) {
        addMessage(check.reason, 'warning');
        return false;
    }
    const def = CAMP_STRUCTURES[structureId];
    const data = getHexData(q, r);

    for (const ing of def.ingredients) removeItem(ing.id, ing.qty);
    spendAP(def.apCost);

    const entry = { id: structureId, builtAtDay: state.player.day };
    if (def.storageCapacity > 0) entry.items = [];
    data.campStructures.push(entry);

    addMessage(`${def.icon} ${def.name} built at camp!`, 'success');
    updateHUD();

    // Refresh camp window if open
    const win = document.getElementById('camp-window');
    if (win && !win.classList.contains('hidden')) _renderCampWindow(q, r);
    return true;
}

// =================== CAMP WINDOW ===================

export function openCampWindow(q, r) {
    const data = getHexData(q, r);
    if (!data || !data.hasCamp) {
        addMessage('No camp here.', 'warning');
        return;
    }
    const win = document.getElementById('camp-window');
    if (!win) return;
    _renderCampWindow(q, r);
    showModal('camp-window');
}

function _renderCampWindow(q, r) {
    const data = getHexData(q, r);
    const content = document.getElementById('camp-content');
    if (!content || !data) return;
    content.innerHTML = '';

    // ── Built structures ──────────────────────────────────
    const builtSection = document.createElement('div');
    builtSection.className = 'camp-section';

    const builtTitle = document.createElement('h3');
    builtTitle.className = 'camp-section-title';
    builtTitle.textContent = '🏗️ Built Structures';
    builtSection.appendChild(builtTitle);

    const visibleStructures = data.campStructures.filter(s => {
        const def = CAMP_STRUCTURES[s.id];
        return def && !def.autoBuilt;
    });

    if (visibleStructures.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'camp-empty';
        empty.textContent = 'Nothing built yet. Build your first structure below.';
        builtSection.appendChild(empty);
    } else {
        for (let idx = 0; idx < data.campStructures.length; idx++) {
            const s = data.campStructures[idx];
            const def = CAMP_STRUCTURES[s.id];
            if (!def || def.autoBuilt) continue;

            const row = document.createElement('div');
            row.className = 'camp-struct-row';

            const label = document.createElement('span');
            label.className = 'camp-struct-label';
            label.textContent = `${def.icon} ${def.name}`;
            row.appendChild(label);

            if (def.storageCapacity > 0 && Array.isArray(s.items)) {
                const cap = document.createElement('span');
                cap.className = 'camp-struct-cap';
                cap.textContent = `${s.items.length}/${def.storageCapacity}`;
                row.appendChild(cap);

                const openBtn = document.createElement('button');
                openBtn.className = 'camp-struct-btn';
                openBtn.textContent = 'Open';
                const capturedIdx = idx;
                openBtn.addEventListener('click', () => {
                    closeModal('camp-window');
                    import('./storage.js').then(m => m.openCampStorageWindow(q, r, capturedIdx));
                });
                row.appendChild(openBtn);
            }

            builtSection.appendChild(row);
        }
    }
    content.appendChild(builtSection);

    // ── Build new ─────────────────────────────────────────
    const buildSection = document.createElement('div');
    buildSection.className = 'camp-section';

    const buildTitle = document.createElement('h3');
    buildTitle.className = 'camp-section-title';
    buildTitle.textContent = '🔨 Build Structure';
    buildSection.appendChild(buildTitle);

    for (const [structId, def] of Object.entries(CAMP_STRUCTURES)) {
        if (def.autoBuilt) continue;
        if (def.unique && data.campStructures.some(s => s.id === structId)) continue;

        const item = document.createElement('div');
        item.className = 'build-item';

        const check = canBuildStructure(q, r, structId);

        const nameEl = document.createElement('div');
        nameEl.className = 'build-item-name';
        nameEl.textContent = `${def.icon} ${def.name}`;
        item.appendChild(nameEl);

        const descEl = document.createElement('div');
        descEl.className = 'build-item-desc';
        descEl.textContent = def.description;
        item.appendChild(descEl);

        const ingEl = document.createElement('div');
        ingEl.className = 'build-item-ingredients';
        const parts = def.ingredients.map(ing => {
            const info = getIcon(ing.id);
            const have = getItemCount(ing.id);
            const ok = have >= ing.qty;
            return `<span class="${ok ? 'ing-ok' : 'ing-miss'}">${info.icon} ${ing.qty}</span>`;
        });
        ingEl.innerHTML = parts.join(' · ') + ` &nbsp;·&nbsp; <span style="color:#666">${def.apCost} AP</span>`;
        item.appendChild(ingEl);

        const buildBtn = document.createElement('button');
        buildBtn.className = 'build-btn' + (check.can ? ' can-build' : '');
        buildBtn.disabled = !check.can;
        buildBtn.textContent = '⚒️ Build';
        buildBtn.title = check.can ? def.description : (check.reason || '');
        buildBtn.addEventListener('click', () => {
            buildStructure(q, r, structId);
        });
        item.appendChild(buildBtn);

        buildSection.appendChild(item);
    }

    content.appendChild(buildSection);
}
