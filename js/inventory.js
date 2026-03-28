import { state } from './state.js';
import { addMessage } from './ui.js';

export const FOOD_VALUES = {
    fruit:        30,
    coconut:      25,
    berries:      20,
    mushroom:     15,
    herb:         10,
    roots:        15,
    raw_fish:     15,
    cooked_fish:  40,
    crab:         35,
    raw_meat:     20,
    cooked_meat:  50,
};

export const WATER_VALUES = {
    fresh_water:   40,
    coconut_water: 25,
};

// Item IDs that spoil: days before spoiling from pickup
export const SPOIL_DAYS = {
    fruit:       3,
    berries:     2,
    raw_fish:    2,
    cooked_fish: 4,
    raw_meat:    2,
    cooked_meat: 3,
};

/** Returns number of free inventory slots */
export function getFreeSlots() {
    return state.player.maxSlots - state.player.inventory.length;
}

/**
 * Slot-based inventory: 1 item = 1 slot, no stacking.
 * Tries to add `qty` items; adds as many as fit.
 * Returns number of items actually added.
 */
export function addItem(id, qty = 1, silent = false) {
    const inv = state.player.inventory;
    const maxSlots = state.player.maxSlots;
    let added = 0;

    for (let i = 0; i < qty; i++) {
        if (inv.length >= maxSlots) break;
        const spoilDay = SPOIL_DAYS[id] ? state.player.day + SPOIL_DAYS[id] : null;
        inv.push({ id, qty: 1, spoilDay });
        added++;
    }

    if (!silent && added < qty) {
        if (added === 0) {
            addMessage('Backpack full! Drop something first.', 'warning');
        } else {
            addMessage(`Backpack full. Carried ${added} of ${qty} ${id.replace(/_/g, ' ')}.`, 'warning');
        }
    }

    return added;
}

/**
 * Removes `qty` individual slots of the item with given id.
 * Returns true if all qty were removed.
 */
export function removeItem(id, qty = 1) {
    const inv = state.player.inventory;
    let removed = 0;
    for (let i = 0; i < qty; i++) {
        const idx = inv.findIndex(s => s.id === id);
        if (idx === -1) break;
        inv.splice(idx, 1);
        removed++;
    }
    return removed === qty;
}

export function hasItem(id, qty = 1) {
    return getItemCount(id) >= qty;
}

export function getItemCount(id) {
    return state.player.inventory.filter(s => s.id === id).length;
}

export function getInventory() {
    return state.player.inventory.slice();
}

export function checkSpoilage() {
    const day = state.player.day;
    const inv = state.player.inventory;
    const survived = [];
    for (const slot of inv) {
        if (slot.spoilDay !== null && slot.spoilDay !== undefined && slot.spoilDay <= day) {
            addMessage(`Your ${slot.id.replace(/_/g, ' ')} has spoiled.`, 'warning');
        } else {
            survived.push(slot);
        }
    }
    state.player.inventory = survived;
}
