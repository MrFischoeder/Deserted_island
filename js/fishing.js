import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { spendAP, hasAP } from './action-points.js';
import { addItem, hasItem } from './inventory.js';
import { addMessage, updateHUD } from './ui.js';
import { getNeighbors } from './grid.js';

export function getFishingEquipment() {
    const gear = [];
    if (hasItem('fishing_net',  1)) gear.push('fishing_net');
    if (hasItem('fishing_rod',  1)) gear.push('fishing_rod');
    if (hasItem('harpoon',      1)) gear.push('harpoon');
    return gear;
}

export function canFish(q, r) {
    const neighbors = getNeighbors(q, r);
    const adjacentWater = neighbors.some(nb => {
        const nd = getHexData(nb.q, nb.r);
        return nd && nd.terrain === 'water';
    });
    if (!adjacentWater) return { can: false, reason: 'No water nearby.' };

    const gear = getFishingEquipment();
    if (gear.length === 0) return { can: false, reason: 'You need a harpoon, fishing rod, or net.' };

    return { can: true, gear };
}

export function fish(q, r) {
    const check = canFish(q, r);
    if (!check.can) {
        addMessage(check.reason, 'warning');
        return { success: false };
    }

    if (!hasAP(CONFIG.AP_COSTS.fish)) {
        addMessage('Not enough AP to fish.', 'warning');
        return { success: false };
    }

    spendAP(CONFIG.AP_COSTS.fish);
    updateHUD();

    const gear = check.gear;
    let successChance = 0;
    let fishQtyMin = 1, fishQtyMax = 1;
    let extraLoot = null;

    // Best gear determines the fishing roll
    if (gear.includes('fishing_net')) {
        successChance = 0.70;
        fishQtyMin = 2; fishQtyMax = 3;
        extraLoot = Math.random() < 0.2 ? 'crab' : null;
    } else if (gear.includes('fishing_rod')) {
        successChance = 0.60;
        fishQtyMin = 1; fishQtyMax = 2;
    } else if (gear.includes('harpoon')) {
        successChance = 0.40;
        fishQtyMin = 1; fishQtyMax = 1;
    }

    if (Math.random() < successChance) {
        const qty = fishQtyMin + Math.floor(Math.random() * (fishQtyMax - fishQtyMin + 1));
        addItem('raw_fish', qty);
        const items = [{ id: 'raw_fish', qty }];
        if (extraLoot) {
            addItem(extraLoot, 1);
            items.push({ id: extraLoot, qty: 1 });
        }
        addMessage(`You catch ${qty} raw fish!`, 'success');
        updateHUD();
        return { success: true, items };
    } else {
        addMessage('You fish for a while but catch nothing this time.', '');
        return { success: false, items: [] };
    }
}
