import { CONFIG } from './config.js';
import { state } from './state.js';

export function distributeWaterSources() {
    const totalLand = Array.from(state.hexData.values()).filter(d => d.terrain !== 'water').length;
    const maxSources = Math.floor(totalLand * CONFIG.WATER_SOURCE_MAX_PERCENT);
    let assigned = 0;

    // Shuffle iteration order for fairness
    const entries = Array.from(state.hexData.values()).filter(d => d.terrain !== 'water');
    shuffleArray(entries);

    for (const data of entries) {
        if (assigned >= maxSources) break;
        const chance = CONFIG.WATER_SOURCE_CHANCE[data.terrain] || 0;
        if (Math.random() < chance) {
            data.hasWaterSource = true;
            assigned++;
        }
    }
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}
