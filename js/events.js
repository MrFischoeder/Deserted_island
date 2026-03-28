import { state, getHexData } from './state.js';
import { addMessage, updateHUD, showEventWindow } from './ui.js';
import { addItem } from './inventory.js';

export const EVENTS = [
    {
        id: 'storm_warning',
        title: '⛈️ Storm Clouds',
        description: 'Dark clouds gather on the horizon. A storm is coming. You have a little time to prepare.',
        terrains: ['beach', 'plains', 'hills'],
        choices: [
            {
                text: 'Find shelter quickly',
                effect() {
                    state.player.energy = Math.max(0, state.player.energy - 8);
                    addMessage('You find shelter before the storm. Wise.', 'success');
                    updateHUD();
                },
            },
            {
                text: 'Press on regardless',
                effect() {
                    const dmg = 10 + Math.floor(Math.random() * 10);
                    state.player.hp = Math.max(0, state.player.hp - dmg);
                    addMessage(`The storm batters you. -${dmg} HP.`, 'danger');
                    updateHUD();
                },
            },
        ],
    },
    {
        id: 'found_supplies',
        title: '📦 Washed-Up Debris',
        description: 'Pieces of a wrecked vessel have washed ashore — wood and tangled rope-like vines.',
        terrains: ['beach'],
        choices: [
            {
                text: 'Salvage what you can',
                effect() {
                    addItem('wood', 3);
                    addItem('vine', 2);
                    addItem('stone', 1);
                    addMessage('You salvage wood, vines, and a stone. Useful.', 'success');
                },
            },
            {
                text: 'Leave it',
                effect() { addMessage('You leave the debris alone.', ''); },
            },
        ],
    },
    {
        id: 'strange_noise',
        title: '🔊 Strange Noise',
        description: 'A rhythmic thumping echoes from nearby. It could be an animal — or something else.',
        terrains: ['jungle', 'swamp', 'hills'],
        choices: [
            {
                text: 'Investigate carefully',
                effect() {
                    if (Math.random() < 0.5) {
                        addItem('wood', 3);
                        addMessage('Just a fallen tree in the wind. You grab some wood.', 'success');
                    } else {
                        const dmg = 8;
                        state.player.hp = Math.max(0, state.player.hp - dmg);
                        addMessage(`A startled animal charges you! -${dmg} HP.`, 'danger');
                        updateHUD();
                    }
                },
            },
            {
                text: 'Stay still and wait',
                effect() { addMessage('The noise fades. You relax slightly.', ''); },
            },
        ],
    },
    {
        id: 'old_footprints',
        title: '👣 Old Footprints',
        description: 'You notice human footprints in the ground. Old, but unmistakably human. Someone else has been here.',
        terrains: ['beach', 'jungle', 'plains', 'hills'],
        choices: [
            {
                text: 'Follow the trail',
                effect() {
                    if (Math.random() < 0.6) {
                        addItem('wood', 2);
                        addItem('stone', 1);
                        addMessage('The trail leads to a small cache of gathered materials.', 'success');
                    } else {
                        addMessage('The trail goes cold. You find nothing.', '');
                    }
                },
            },
            {
                text: 'Mark the location and move on',
                effect() { addMessage('You note the location for later.', 'info'); },
            },
        ],
    },
    {
        id: 'plant_toxin',
        title: '🌿 Toxic Plants',
        description: 'You brush against a plant with unusual sap. Your skin starts to burn.',
        terrains: ['jungle', 'swamp'],
        choices: [
            {
                text: 'Wash it off with water',
                effect() {
                    if (Math.random() < 0.7) {
                        state.player.water = Math.max(0, state.player.water - 10);
                        addMessage('You wash off the sap. Crisis averted.', 'success');
                    } else {
                        const dmg = 12;
                        state.player.hp = Math.max(0, state.player.hp - dmg);
                        addMessage(`The toxin still burns. -${dmg} HP.`, 'danger');
                        updateHUD();
                    }
                },
            },
            {
                text: 'Scrape it off with a stone',
                effect() {
                    const dmg = 5;
                    state.player.hp = Math.max(0, state.player.hp - dmg);
                    addMessage(`Crude but effective. -${dmg} HP from scraping.`, 'warning');
                    updateHUD();
                },
            },
        ],
    },
    {
        id: 'lucky_find',
        title: '✨ Lucky Discovery',
        description: 'Something catches your eye half-buried in the ground — the glint of something useful.',
        terrains: ['beach', 'plains', 'hills', 'jungle', 'rocks'],
        choices: [
            {
                text: 'Dig it out',
                effect() {
                    // Simplified: only basic resources during testing
                    const options = ['stone', 'stone', 'wood', 'vine'];
                    const id  = options[Math.floor(Math.random() * options.length)];
                    const qty = 1 + Math.floor(Math.random() * 2);
                    addItem(id, qty);
                    addMessage(`You find ${qty}x ${id}!`, 'success');
                },
            },
            {
                text: 'Leave it',
                effect() { addMessage('You leave it. Maybe next time.', ''); },
            },
        ],
    },
    {
        id: 'fresh_spring',
        title: '💧 Hidden Spring',
        description: 'You hear water trickling. Following the sound, you find a small but clear spring.',
        terrains: ['jungle', 'hills', 'mountains', 'swamp'],
        choices: [
            {
                text: 'Drink deeply',
                effect() {
                    state.player.water = Math.min(state.player.maxWater, state.player.water + 40);
                    addMessage('You drink from the spring. +40 water.', 'success');
                    updateHUD();
                },
            },
            {
                text: 'Fill your bowl if you have one',
                effect() {
                    const hasBowl = state.player.inventory.find(s => s.id === 'wooden_bowl');
                    if (hasBowl) {
                        addItem('fresh_water', 2);
                        addMessage('You fill the bowl. +2 Fresh Water.', 'success');
                    } else {
                        state.player.water = Math.min(state.player.maxWater, state.player.water + 20);
                        addMessage('You cup your hands and drink what you can. +20 water.', 'success');
                        updateHUD();
                    }
                },
            },
        ],
    },
    {
        id: 'vulture',
        title: '🦅 Scavenging Birds',
        description: 'A cluster of large birds circle overhead. They land nearby, eying you warily.',
        terrains: ['beach', 'plains', 'hills'],
        choices: [
            {
                text: 'Drive them off and check what they found',
                effect() {
                    if (Math.random() < 0.55) {
                        addItem('wood', 2);
                        addMessage('You scare them off and find some dry wood nearby.', 'success');
                    } else {
                        addMessage('Nothing there. Just birds.', '');
                    }
                },
            },
            {
                text: 'Ignore them',
                effect() { addMessage('You ignore the birds. They eventually fly off.', ''); },
            },
        ],
    },
];

export function triggerRandomEvent(q, r) {
    const hexData = getHexData(q, r);
    const terrain = hexData ? hexData.terrain : 'beach';
    const valid = EVENTS.filter(e => e.terrains.includes(terrain));
    if (valid.length === 0) return;
    const event = valid[Math.floor(Math.random() * valid.length)];
    showEventWindow(event.title, event.description, event.choices);
}

// =================== NIGHT EVENTS ===================

export function triggerNightEvents(q, r, hexData) {
    const p = state.player;
    const hasCampfire = !!(hexData && hexData.hasCamp &&
        hexData.campStructures && hexData.campStructures.some(s => s.id === 'campfire'));
    const hasShelter = !!(hexData && hexData.hasCamp &&
        hexData.campStructures && hexData.campStructures.some(s => s.id === 'shelter'));

    // Storm
    if (Math.random() < (hasShelter ? 0.08 : 0.22)) {
        if (hasShelter) {
            addMessage('⛈️ A storm rages outside, but your shelter holds. You sleep soundly.', 'info');
        } else if (hasCampfire) {
            const dmg = 5 + Math.floor(Math.random() * 8);
            p.hp = Math.max(0, p.hp - dmg);
            addMessage(`⛈️ A storm blows through the night. -${dmg} HP.`, 'danger');
        } else {
            const dmg = 12 + Math.floor(Math.random() * 12);
            p.hp = Math.max(0, p.hp - dmg);
            addMessage(`⛈️ A violent storm batters you through the night. -${dmg} HP.`, 'danger');
        }
        return;
    }

    // Predator visit
    if (Math.random() < (hasCampfire ? 0.06 : 0.16)) {
        if (hasCampfire) {
            addMessage('🔥 Glowing eyes watch from the treeline, but the campfire keeps them away.', 'info');
        } else {
            const dmg = 8 + Math.floor(Math.random() * 10);
            p.hp = Math.max(0, p.hp - dmg);
            addMessage(`🐆 Something attacks you in your sleep! You wake bleeding. -${dmg} HP.`, 'danger');
        }
        return;
    }

    // Monkey theft (only without shelter)
    if (!hasShelter && Math.random() < 0.10) {
        const inv = p.inventory;
        const stealable = inv.filter(s => ['coconut', 'raw_fish', 'cooked_fish'].includes(s.id));
        if (stealable.length > 0) {
            const target = stealable[Math.floor(Math.random() * stealable.length)];
            const idx = inv.findIndex(s => s.id === target.id);
            if (idx !== -1) {
                inv.splice(idx, 1);
                addMessage(`🐒 Monkeys raid your camp during the night and steal your ${target.id.replace(/_/g, ' ')}!`, 'warning');
                return;
            }
        }
    }

    // Lucky night (rare)
    if (Math.random() < 0.07) {
        addMessage('✨ You have a strangely peaceful night and wake feeling refreshed.', 'success');
        p.energy = Math.min(p.maxEnergy, p.energy + 15);
    }
}
