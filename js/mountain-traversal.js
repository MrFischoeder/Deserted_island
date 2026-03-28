import { CONFIG } from './config.js';
import { getHexData } from './state.js';
import { spendAP, hasAP } from './action-points.js';
import { addMessage, updateHUD } from './ui.js';
import { state } from './state.js';

export const MOUNTAIN_TERRAINS = new Set(['mountains', 'volcano']);

export function isMountainTerrain(terrain) {
    return MOUNTAIN_TERRAINS.has(terrain);
}

export function canClimb(fromQ, fromR, toQ, toR) {
    const toData = getHexData(toQ, toR);
    return toData && isMountainTerrain(toData.terrain);
}

export function climbMountain(fromQ, fromR, toQ, toR) {
    const apCost = CONFIG.AP_COSTS.moveMountain;
    if (!hasAP(apCost)) {
        addMessage('Not enough AP to climb.', 'warning');
        return { success: false };
    }

    spendAP(apCost);

    const success = Math.random() < 0.82;
    if (success) {
        addMessage('You scramble up the rocky slope.', 'info');
        return { success: true };
    } else {
        const dmg = 5;
        state.player.hp = Math.max(0, state.player.hp - dmg);
        addMessage(`You slip on the rocks! -${dmg} HP. You stay put.`, 'danger');
        updateHUD();
        return { success: false, damage: dmg };
    }
}
