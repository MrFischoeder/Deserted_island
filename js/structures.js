import { state, getHexData } from './state.js';
import { addMessage } from './ui.js';
import { spendAP, hasAP } from './action-points.js';
import { CONFIG } from './config.js';
import { generateLootFromTable, addToGroundLoot, showLootItems } from './loot.js';

export const STRUCTURE_DEFINITIONS = {
    cave: {
        id: 'cave', name: 'Cave', icon: '🕳️',
        description: 'A dark cave entrance. Who knows what lurks inside, or what was left behind.',
        rarity: 0.06,
        terrains: ['hills', 'mountains', 'rocks', 'jungle'],
        lootTable: [
            { id: 'stone', qty: '3-6', chance: 0.8 },
            { id: 'bone',  qty: '1-3', chance: 0.5 },
            { id: 'flint', qty: '2-4', chance: 0.7 },
            { id: 'fresh_water', qty: 1, chance: 0.4 },
        ],
    },
    ruins: {
        id: 'ruins', name: 'Ancient Ruins', icon: '🏛️',
        description: 'Crumbling stone walls, half-consumed by vegetation. Someone was here long before you.',
        rarity: 0.04,
        terrains: ['jungle', 'hills', 'plains'],
        lootTable: [
            { id: 'stone', qty: '2-4', chance: 0.9 },
            { id: 'metal_scrap', qty: '1-2', chance: 0.5 },
            { id: 'map_fragment', qty: 1, chance: 0.25 },
            { id: 'key', qty: 1, chance: 0.1 },
        ],
    },
    bunker: {
        id: 'bunker', name: 'Concrete Bunker', icon: '🔒',
        description: 'A wartime bunker, half-buried. The door is rusted but might open. Military gear could be inside.',
        rarity: 0.008,
        terrains: ['plains', 'hills', 'jungle', 'beach'],
        lootTable: [
            { id: 'metal_scrap', qty: '3-6', chance: 0.9 },
            { id: 'fabric_scrap', qty: '2-4', chance: 0.8 },
            { id: 'notebook', qty: 1, chance: 0.4 },
            { id: 'bandage', qty: '2-4', chance: 0.6 },
            { id: 'torch', qty: '1-3', chance: 0.7 },
        ],
    },
    plane_wreck: {
        id: 'plane_wreck', name: 'Plane Wreck', icon: '✈️',
        description: 'The twisted fuselage of a light aircraft. Scorch marks. No survivors, but maybe something useful remains.',
        rarity: 0.006,
        terrains: ['plains', 'jungle', 'beach', 'hills'],
        lootTable: [
            { id: 'metal_scrap', qty: '4-8', chance: 0.95 },
            { id: 'fabric_scrap', qty: '3-5', chance: 0.9 },
            { id: 'rope', qty: '2-4', chance: 0.7 },
            { id: 'notebook', qty: 1, chance: 0.5 },
            { id: 'fresh_water', qty: 2, chance: 0.3 },
        ],
    },
    boat_wreck: {
        id: 'boat_wreck', name: 'Wrecked Boat', icon: '⛵',
        description: 'The splintered hull of a wooden boat. Salt and time have done their work, but there may still be something useful.',
        rarity: 0.05,
        terrains: ['beach'],
        lootTable: [
            { id: 'plank', qty: '3-6', chance: 0.9 },
            { id: 'rope', qty: '2-4', chance: 0.8 },
            { id: 'metal_scrap', qty: '1-3', chance: 0.6 },
            { id: 'fabric_scrap', qty: '1-3', chance: 0.6 },
        ],
    },
    grotto: {
        id: 'grotto', name: 'Sea Grotto', icon: '🌊',
        description: 'A partially submerged sea grotto. Tide pools glitter with shells and small marine creatures.',
        rarity: 0.07,
        terrains: ['rocks', 'beach'],
        lootTable: [
            { id: 'shell', qty: '3-6', chance: 0.9 },
            { id: 'crab',  qty: '1-2', chance: 0.5 },
            { id: 'fresh_water', qty: 1, chance: 0.2 },
        ],
    },
    old_camp: {
        id: 'old_camp', name: 'Old Camp', icon: '🏕️',
        description: 'The remnants of a camp. Charred fire pit, a few rusted tins, rotten canvas. Someone tried to survive here.',
        rarity: 0.04,
        terrains: ['beach', 'plains', 'jungle'],
        lootTable: [
            { id: 'fabric_scrap', qty: '1-3', chance: 0.7 },
            { id: 'rope', qty: '1-2', chance: 0.6 },
            { id: 'wood', qty: '2-4', chance: 0.8 },
            { id: 'notebook', qty: 1, chance: 0.2 },
        ],
    },
    spanish_ruins: {
        id: 'spanish_ruins', name: 'Spanish Ruins', icon: '🗿',
        description: 'Carved stone, faded frescoes, the ghost of a colonial outpost. A cross marks a crumbled wall.',
        rarity: 0.015,
        terrains: ['jungle', 'hills', 'plains'],
        lootTable: [
            { id: 'stone', qty: '3-6', chance: 0.9 },
            { id: 'metal_scrap', qty: '2-4', chance: 0.6 },
            { id: 'key', qty: 1, chance: 0.15 },
            { id: 'map_fragment', qty: 1, chance: 0.3 },
        ],
    },
};

export function placeStructures() {
    const singletons = { bunker: false, plane_wreck: false };

    state.hexData.forEach(data => {
        if (data.terrain === 'water') return;
        for (const [id, def] of Object.entries(STRUCTURE_DEFINITIONS)) {
            if (!def.terrains.includes(data.terrain)) continue;
            if (singletons[id] === false && singletons.hasOwnProperty(id)) {
                if (Math.random() < def.rarity) {
                    data.persistentStructure = id;
                    singletons[id] = true;
                    break;
                }
            } else if (!singletons.hasOwnProperty(id)) {
                if (Math.random() < def.rarity) {
                    data.persistentStructure = id;
                    break;
                }
            }
        }
    });
}

export function exploreStructure(q, r) {
    if (!hasAP(CONFIG.AP_COSTS.exploreStructure)) {
        addMessage('Not enough AP.', 'warning');
        return null;
    }
    const data = getHexData(q, r);
    if (!data || !data.persistentStructure) {
        addMessage('Nothing to explore here.', '');
        return null;
    }
    if (data.structureExplored) {
        addMessage('You\'ve already searched this structure.', '');
        return null;
    }

    spendAP(CONFIG.AP_COSTS.exploreStructure);
    data.structureExplored = true;

    const def = STRUCTURE_DEFINITIONS[data.persistentStructure];
    if (!def) return null;

    const loot = generateLootFromTable(def.lootTable);
    if (loot.length > 0) {
        addToGroundLoot(q, r, loot);
        showLootItems(loot, q, r);
        addMessage(`You search the ${def.name}...`, 'info');
    } else {
        addMessage(`You search the ${def.name} — nothing useful remains.`, '');
    }
    return loot;
}

export function getStructureActions(q, r) {
    const data = getHexData(q, r);
    if (!data || !data.persistentStructure || !data.structureDiscovered) return [];
    const def = STRUCTURE_DEFINITIONS[data.persistentStructure];
    if (!def) return [];

    const actions = [];
    if (!data.structureExplored) {
        actions.push({
            label: `Explore ${def.name}`,
            apCost: CONFIG.AP_COSTS.exploreStructure,
            action: 'exploreStructure',
        });
    } else {
        actions.push({
            label: `${def.name} (searched)`,
            apCost: 0,
            action: 'none',
            disabled: true,
        });
    }
    return actions;
}
