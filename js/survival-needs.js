import { CONFIG } from './config.js';
import { state } from './state.js';
import { addMessage, updateHUD } from './ui.js';
import { spendAP, hasAP } from './action-points.js';
import { removeItem, hasItem, FOOD_VALUES, WATER_VALUES } from './inventory.js';

export function applyDayEndCosts() {
    const p = state.player;
    const result = { foodLow: false, waterLow: false, energyLow: false, died: false };

    p.food   = Math.max(0, p.food   - CONFIG.DAILY_FOOD_COST);
    p.water  = Math.max(0, p.water  - CONFIG.DAILY_WATER_COST);
    p.energy = Math.max(0, p.energy - CONFIG.DAILY_ENERGY_COST);

    if (p.food <= 0) {
        p.hp -= CONFIG.STARVATION_DAMAGE;
        addMessage('You are starving! -' + CONFIG.STARVATION_DAMAGE + ' HP.', 'danger');
        result.foodLow = true;
    } else if (p.food < 30) {
        addMessage('You are very hungry.', 'warning');
        result.foodLow = true;
    }

    if (p.water <= 0) {
        p.hp -= CONFIG.DEHYDRATION_DAMAGE;
        addMessage('Severe dehydration! -' + CONFIG.DEHYDRATION_DAMAGE + ' HP.', 'danger');
        result.waterLow = true;
    } else if (p.water < 25) {
        addMessage('You are very thirsty.', 'warning');
        result.waterLow = true;
    }

    if (p.energy <= 0) {
        p.hp -= CONFIG.EXHAUSTION_DAMAGE;
        addMessage('Exhaustion is taking its toll! -' + CONFIG.EXHAUSTION_DAMAGE + ' HP.', 'danger');
        result.energyLow = true;
    }

    p.hp = Math.max(0, p.hp);
    if (p.hp <= 0) {
        p.isAlive = false;
        result.died = true;
    }

    updateHUD();
    return result;
}

export function eat(itemId) {
    const value = FOOD_VALUES[itemId];
    if (!value) return false;
    if (!hasItem(itemId, 1)) return false;
    removeItem(itemId, 1);
    const p = state.player;
    p.food = Math.min(p.maxFood, p.food + value);
    addMessage(`You eat ${itemId.replace(/_/g, ' ')}. +${value} food.`, 'success');
    updateHUD();
    return true;
}

export function drink(source) {
    const p = state.player;
    // source = 'water_source' (from hex) or item ID
    if (source === 'water_source') {
        p.water = Math.min(p.maxWater, p.water + 50);
        addMessage('You drink fresh water. +50 water.', 'success');
        updateHUD();
        return true;
    }
    const value = WATER_VALUES[source];
    if (!value) return false;
    if (!hasItem(source, 1)) return false;
    removeItem(source, 1);
    p.water = Math.min(p.maxWater, p.water + value);
    addMessage(`You drink ${source.replace(/_/g, ' ')}. +${value} water.`, 'success');
    updateHUD();
    return true;
}

export function rest() {
    if (!hasAP(CONFIG.AP_COSTS.rest)) {
        addMessage('Not enough AP to rest.', 'warning');
        return false;
    }
    spendAP(CONFIG.AP_COSTS.rest);
    const p = state.player;
    const gain = 25;
    p.energy = Math.min(p.maxEnergy, p.energy + gain);
    addMessage(`You rest. +${gain} energy.`, 'success');
    updateHUD();
    return true;
}

export function useBandage() {
    if (!hasItem('bandage', 1)) {
        addMessage('You have no bandages.', 'warning');
        return false;
    }
    removeItem('bandage', 1);
    const p = state.player;
    const gain = 20;
    p.hp = Math.min(p.maxHp, p.hp + gain);
    addMessage(`You apply a bandage. +${gain} HP.`, 'success');
    updateHUD();
    return true;
}

export function checkCritical() {
    const p = state.player;
    const warnings = [];
    if (p.food  < 20) warnings.push({ type: 'danger', msg: 'Critical hunger!' });
    else if (p.food < 40) warnings.push({ type: 'warning', msg: 'Feeling hungry.' });
    if (p.water < 20) warnings.push({ type: 'danger', msg: 'Critical thirst!' });
    else if (p.water < 35) warnings.push({ type: 'warning', msg: 'Feeling thirsty.' });
    if (p.energy < 15) warnings.push({ type: 'warning', msg: 'Nearly exhausted.' });
    if (p.hp < 30) warnings.push({ type: 'danger', msg: 'Critically wounded!' });
    return warnings;
}
