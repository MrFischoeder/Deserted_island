import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { spendAP, hasAP } from './action-points.js';
import { addMessage, updateHUD } from './ui.js';
import { rollQty, addToGroundLoot, showLootItems } from './loot.js';
import { triggerWildlifeEncounter } from './wildlife.js';
import { STRUCTURE_DEFINITIONS } from './structures.js';
import { getIcon } from './icons.js';

// ── Outcome weight tables ─────────────────────────────────────────────────────
// Keys: mat, food, empty, wildlife, special

const SCAVENGE_OUTCOMES = {
    beach:     { mat: 74, food:  1, empty: 15, wildlife:  5, special:  5 },
    jungle:    { mat: 65, food:  1, empty: 22, wildlife: 12, special:  8 },  // total ≠ 100 — weights are relative
    swamp:     { mat: 57, food:  1, empty: 28, wildlife: 14, special:  6 },
    plains:    { mat: 72, food:  1, empty: 17, wildlife:  5, special:  5 },
    hills:     { mat: 80, food:  1, empty: 10, wildlife:  5, special:  4 },
    mountains: { mat: 79, food:  1, empty: 11, wildlife:  5, special:  4 },
    rocks:     { mat: 81, food:  1, empty:  9, wildlife:  3, special:  6 },
    volcano:   { mat: 66, food:  1, empty: 21, wildlife:  7, special:  5 },
};

const FORAGE_OUTCOMES = {
    beach:     { food: 74, mat:  1, empty: 15, wildlife:  5, special:  5 },
    jungle:    { food: 80, mat:  1, empty:  6, wildlife:  7, special:  6 },
    swamp:     { food: 67, mat:  1, empty: 20, wildlife: 12, special:  6 },
    plains:    { food: 75, mat:  1, empty: 12, wildlife:  5, special:  7 },
    hills:     { food: 56, mat:  1, empty: 27, wildlife:  6, special: 10 },
    mountains: { food: 40, mat:  1, empty: 41, wildlife:  8, special: 10 },
    rocks:     { food: 30, mat:  1, empty: 51, wildlife:  5, special: 13 },
    volcano:   { food: 20, mat:  1, empty: 61, wildlife: 10, special:  8 },
};

// ── Item loot tables ──────────────────────────────────────────────────────────

// Primary material yields for Scavenge
const SCAVENGE_MAT_TABLES = {
    beach:     [ {id:'wood',  qty:'1-3', w:50}, {id:'vine',  qty:'1-2', w:50} ],
    jungle:    [ {id:'wood',  qty:'3-5', w:50}, {id:'vine',  qty:'3-5', w:50} ],
    swamp:     [ {id:'vine',  qty:'2-4', w:60}, {id:'wood',  qty:'1-2', w:40} ],
    plains:    [ {id:'wood',  qty:'1-2', w:50}, {id:'vine',  qty:'1-3', w:50} ],
    hills:     [ {id:'stone', qty:'2-4', w:70}, {id:'wood',  qty:'1-2', w:30} ],
    mountains: [ {id:'stone', qty:'3-6', w:100} ],
    rocks:     [ {id:'stone', qty:'2-5', w:100} ],
    volcano:   [ {id:'stone', qty:'3-5', w:100} ],
};

// Primary food yields for Forage
const FORAGE_FOOD_TABLES = {
    beach:     [ {id:'coconut',  qty:'1-2', w:60}, {id:'fruit',    qty:1,     w:40} ],
    jungle:    [ {id:'coconut',  qty:'1-2', w:35}, {id:'berries',  qty:'1-3', w:30},
                 {id:'fruit',    qty:'1-2', w:25}, {id:'mushroom', qty:'1-2', w:10} ],
    swamp:     [ {id:'mushroom', qty:'1-2', w:50}, {id:'herb',     qty:'1-2', w:30},
                 {id:'roots',    qty:'1-2', w:20} ],
    plains:    [ {id:'berries',  qty:'1-3', w:40}, {id:'fruit',    qty:'1-2', w:30},
                 {id:'roots',    qty:'1-2', w:20}, {id:'herb',     qty:1,     w:10} ],
    hills:     [ {id:'berries',  qty:'1-2', w:50}, {id:'roots',    qty:'1-2', w:30},
                 {id:'mushroom', qty:1,     w:20} ],
    mountains: [ {id:'roots',    qty:1,     w:60}, {id:'herb',     qty:1,     w:40} ],
    rocks:     [ {id:'roots',    qty:1,     w:100} ],
    volcano:   [ {id:'roots',    qty:1,     w:60}, {id:'herb',     qty:1,     w:40} ],
};

// Secondary food (side-find while scavenging)
const SCAVENGE_SECONDARY_FOOD = {
    beach:     [ {id:'coconut',  qty:1} ],
    jungle:    [ {id:'berries',  qty:1}, {id:'coconut', qty:1} ],
    swamp:     [ {id:'mushroom', qty:1} ],
    plains:    [ {id:'berries',  qty:1} ],
    hills:     [ {id:'berries',  qty:1}, {id:'roots',   qty:1} ],
    mountains: [ {id:'roots',    qty:1} ],
    rocks:     [ {id:'roots',    qty:1} ],
    volcano:   [],
};

// Secondary materials (side-find while foraging)
const FORAGE_SECONDARY_MAT = {
    beach:     [ {id:'wood',  qty:'1-2'}, {id:'vine',  qty:1}     ],
    jungle:    [ {id:'vine',  qty:'1-2'}, {id:'wood',  qty:1}     ],
    swamp:     [ {id:'vine',  qty:'1-2'}                           ],
    plains:    [ {id:'wood',  qty:1}                               ],
    hills:     [ {id:'stone', qty:'1-2'}                           ],
    mountains: [ {id:'stone', qty:'1-2'}                           ],
    rocks:     [ {id:'stone', qty:'1-3'}                           ],
    volcano:   [ {id:'stone', qty:'1-2'}                           ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pickWeighted(table) {
    const total = table.reduce((s, e) => s + (e.w || 1), 0);
    let rng = Math.random() * total;
    for (const entry of table) {
        rng -= (entry.w || 1);
        if (rng <= 0) return entry;
    }
    return table[table.length - 1];
}

function _rollOutcome(weights) {
    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    let rng = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
        rng -= w;
        if (rng <= 0) return key;
    }
    return 'empty';
}

function _makeItem(id, qtyStr) {
    const qty  = rollQty(qtyStr || 1);
    const info = getIcon(id);
    return { id, name: info.name, icon: info.icon, qty };
}

function _pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Pre-search validation (separate per action type) ─────────────────────────

function _preSearch(q, r, apCost, type) {
    if (!hasAP(apCost)) {
        addMessage(`Not enough AP to search. Need ${apCost} AP.`, 'warning');
        return null;
    }
    const data = getHexData(q, r);
    if (!data) return null;

    const lastDayField    = type === 'scavenge' ? 'lastScavengeDay'     : 'lastForageDay';
    const respawnField    = type === 'scavenge' ? 'scavengeRespawnDays' : 'forageRespawnDays';

    const lastDay = data[lastDayField];
    if (lastDay !== null && lastDay !== undefined) {
        const respawnDays = data[respawnField] || 3;
        const daysLeft    = respawnDays - (state.player.day - lastDay);
        if (daysLeft > 0) {
            addMessage(
                `This place has been searched recently. Try coming back later and see if fortune favors you then.`,
                'warning'
            );
            return null;
        }
    }

    spendAP(apCost);
    data[lastDayField]  = state.player.day;
    data[respawnField]  = Math.floor(Math.random() * 3) + 3; // 3–5 days
    updateHUD();
    return data;
}

// ── Special find (shared) ─────────────────────────────────────────────────────

function _handleSpecial(q, r, data, foundItems) {
    // Priority 1: undiscovered water source
    if (!data.waterSourceDiscovered && data.hasWaterSource) {
        data.waterSourceDiscovered = true;
        addMessage('You stumble upon a freshwater source here! 💧', 'success');
        import('./render.js').then(m => m.updateWaterMarker(q, r));
        return { water: true, structure: false };
    }
    // Priority 2: undiscovered persistent structure
    if (data.persistentStructure && !data.structureDiscovered) {
        data.structureDiscovered = true;
        const def   = STRUCTURE_DEFINITIONS[data.persistentStructure];
        const sname = def ? def.name : data.persistentStructure;
        addMessage(`You discover something: ${sname}!`, 'success');
        return { water: false, structure: true };
    }
    // Priority 3: random artifact bonus
    const bonusPool = ['map_fragment', 'key', 'notebook', 'flint', 'shell'];
    const id   = bonusPool[Math.floor(Math.random() * bonusPool.length)];
    const info = getIcon(id);
    foundItems.push({ id, name: info.name, icon: info.icon, qty: 1 });
    addMessage(`You find something unexpected: ${info.name}!`, 'success');
    return { water: false, structure: false };
}

// ── MP sync ───────────────────────────────────────────────────────────────────

function _syncHexExploration(q, r, data, type, waterDiscovered, structureDiscovered) {
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (!isMultiplayer()) return;
        const updates = type === 'scavenge'
            ? { lastScavengeDay: data.lastScavengeDay, scavengeRespawnDays: data.scavengeRespawnDays }
            : { lastForageDay:   data.lastForageDay,   forageRespawnDays:   data.forageRespawnDays  };
        if (waterDiscovered)     updates.waterSourceDiscovered = true;
        if (structureDiscovered) updates.structureDiscovered   = true;
        import('./network.js').then(m => m.emit('world:hex-update', { q, r, updates }));
    });
}

// ── Scavenge — primarily materials ───────────────────────────────────────────

export function scavenge(q, r) {
    const data = _preSearch(q, r, CONFIG.AP_COSTS.scavenge, 'scavenge');
    if (!data) return null;

    const terrain    = data.terrain;
    const weights    = SCAVENGE_OUTCOMES[terrain] || SCAVENGE_OUTCOMES.beach;
    const outcome    = _rollOutcome(weights);
    const foundItems = [];
    let waterDiscovered = false, structureDiscovered = false;

    if (outcome === 'mat') {
        const matTable = SCAVENGE_MAT_TABLES[terrain] || [];
        if (matTable.length > 0) {
            const e = _pickWeighted(matTable);
            foundItems.push(_makeItem(e.id, e.qty));
            if (Math.random() < 0.30) {
                const e2 = _pickWeighted(matTable);
                foundItems.push(_makeItem(e2.id, e2.qty));
            }
        }
        addMessage('You scavenge the area and find some useful materials.', 'success');

    } else if (outcome === 'food') {
        const pool = SCAVENGE_SECONDARY_FOOD[terrain] || [];
        const e = _pickRandom(pool);
        if (e) {
            foundItems.push(_makeItem(e.id, e.qty));
            addMessage('While scavenging, you stumble upon something edible.', 'success');
        } else {
            addMessage('You search carefully but find nothing useful here.', '');
        }

    } else if (outcome === 'empty') {
        addMessage('You search the area thoroughly but find nothing of use.', '');

    } else if (outcome === 'wildlife') {
        if (foundItems.length > 0) addToGroundLoot(q, r, foundItems);
        _syncHexExploration(q, r, data, 'scavenge', false, false);
        triggerWildlifeEncounter(q, r);
        return { foundItems };

    } else if (outcome === 'special') {
        const flags = _handleSpecial(q, r, data, foundItems);
        waterDiscovered     = flags.water;
        structureDiscovered = flags.structure;
    }

    _syncHexExploration(q, r, data, 'scavenge', waterDiscovered, structureDiscovered);
    if (foundItems.length > 0) {
        addToGroundLoot(q, r, foundItems);
        showLootItems(foundItems, q, r);
    }
    return { foundItems };
}

// ── Forage — primarily food ───────────────────────────────────────────────────

export function forage(q, r) {
    const data = _preSearch(q, r, CONFIG.AP_COSTS.forage, 'forage');
    if (!data) return null;

    const terrain    = data.terrain;
    const weights    = FORAGE_OUTCOMES[terrain] || FORAGE_OUTCOMES.beach;
    const outcome    = _rollOutcome(weights);
    const foundItems = [];
    let waterDiscovered = false, structureDiscovered = false;

    if (outcome === 'food') {
        const foodTable = FORAGE_FOOD_TABLES[terrain] || [];
        if (foodTable.length > 0) {
            const e = _pickWeighted(foodTable);
            foundItems.push(_makeItem(e.id, e.qty));
            if (Math.random() < 0.25) {
                const e2 = _pickWeighted(foodTable);
                foundItems.push(_makeItem(e2.id, e2.qty));
            }
        }
        addMessage('You forage the area and find something edible.', 'success');

    } else if (outcome === 'mat') {
        const pool = FORAGE_SECONDARY_MAT[terrain] || [];
        const e = _pickRandom(pool);
        if (e) {
            foundItems.push(_makeItem(e.id, e.qty));
            addMessage('While foraging, you find some useful materials instead.', 'success');
        } else {
            addMessage('You search carefully but find nothing useful here.', '');
        }

    } else if (outcome === 'empty') {
        addMessage('You search for edible plants and fruits, but find nothing today.', '');

    } else if (outcome === 'wildlife') {
        if (foundItems.length > 0) addToGroundLoot(q, r, foundItems);
        _syncHexExploration(q, r, data, 'forage', false, false);
        triggerWildlifeEncounter(q, r);
        return { foundItems };

    } else if (outcome === 'special') {
        const flags = _handleSpecial(q, r, data, foundItems);
        waterDiscovered     = flags.water;
        structureDiscovered = flags.structure;
    }

    _syncHexExploration(q, r, data, 'forage', waterDiscovered, structureDiscovered);
    if (foundItems.length > 0) {
        addToGroundLoot(q, r, foundItems);
        showLootItems(foundItems, q, r);
    }
    return { foundItems };
}
