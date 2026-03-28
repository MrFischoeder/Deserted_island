import { state, getHexData } from './state.js';
import { addMessage, updateHUD } from './ui.js';
import { hasItem, addItem } from './inventory.js';
import { hasAP, spendAP } from './action-points.js';
import { WILDLIFE_TYPES, startCombat } from './wildlife.js';
import { rollQty } from './loot.js';

export const HUNT_AP_COST = 2;
const HUNT_ENCOUNTER_CHANCE = 0.75;

// Terrains where hunting is possible
const HUNTABLE_TERRAINS = ['jungle', 'plains', 'hills', 'swamp', 'rocks', 'beach'];

// Animals that flee rather than fight (quick catch roll)
const PASSIVE_PREY = ['bird', 'monkey'];

export function canHunt(q, r) {
    const data = getHexData(q, r);
    if (!data) return { can: false, reason: 'No terrain data.' };
    if (!HUNTABLE_TERRAINS.includes(data.terrain)) return { can: false, reason: 'Nothing to hunt here.' };
    if (!hasItem('spear', 1) && !hasItem('knife', 1)) {
        return { can: false, reason: 'Need a spear or knife to hunt.' };
    }
    if (!hasAP(HUNT_AP_COST)) return { can: false, reason: `Not enough AP (need ${HUNT_AP_COST}).` };
    return { can: true };
}

export function hunt(q, r) {
    const check = canHunt(q, r);
    if (!check.can) {
        addMessage(check.reason, 'warning');
        return;
    }

    spendAP(HUNT_AP_COST);
    updateHUD();

    if (Math.random() > HUNT_ENCOUNTER_CHANCE) {
        addMessage('You search the area but find no game today. The forest is quiet.', 'info');
        return;
    }

    const data = getHexData(q, r);
    const validAnimals = Object.values(WILDLIFE_TYPES).filter(w => w.terrains.includes(data.terrain));
    if (validAnimals.length === 0) {
        addMessage('No suitable game found here.', 'info');
        return;
    }

    const animal = validAnimals[Math.floor(Math.random() * validAnimals.length)];

    // Passive prey — quick catch or escape
    if (PASSIVE_PREY.includes(animal.id)) {
        if (Math.random() < 0.55) {
            const lootItems = [];
            for (const entry of animal.lootTable) {
                const qty = rollQty(entry.qty || 1);
                addItem(entry.id, qty);
                lootItems.push(`${qty}x ${entry.id.replace(/_/g, ' ')}`);
            }
            addMessage(`You catch a ${animal.name}! Got: ${lootItems.join(', ')}.`, 'success');
        } else {
            addMessage(`A ${animal.name} spots you and flees before you can strike.`, 'info');
        }
        return;
    }

    // Dangerous animal — start combat encounter
    addMessage(`A ${animal.name} emerges from the undergrowth!`, 'warning');
    setTimeout(() => startCombat(animal.id, q, r), 300);
}
