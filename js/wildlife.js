import { state, getHexData } from './state.js';
import { addMessage, updateHUD } from './ui.js';
import { addItem } from './inventory.js';
import { rollQty } from './loot.js';

export const WILDLIFE_TYPES = {
    crab: {
        id:'crab', name:'Giant Crab', icon:'🦀',
        hp:20, damage:8, fleeChance:0.7,
        terrains:['beach','rocks'],
        lootTable:[{id:'crab',qty:1},{id:'shell',qty:'1-2'}],
    },
    wild_boar: {
        id:'wild_boar', name:'Wild Boar', icon:'🐗',
        hp:45, damage:18, fleeChance:0.5,
        terrains:['jungle','plains'],
        lootTable:[{id:'raw_meat',qty:'2-3'},{id:'bone',qty:'1-2'},{id:'hide',qty:1}],
    },
    snake: {
        id:'snake', name:'Venomous Snake', icon:'🐍',
        hp:15, damage:22, fleeChance:0.6,
        terrains:['swamp','jungle'],
        lootTable:[{id:'raw_meat',qty:1}],
    },
    bird: {
        id:'bird', name:'Aggressive Seabird', icon:'🦅',
        hp:12, damage:6, fleeChance:0.85,
        terrains:['beach','plains','hills'],
        lootTable:[{id:'raw_meat',qty:1}],
    },
    monkey: {
        id:'monkey', name:'Angry Monkey', icon:'🐒',
        hp:18, damage:10, fleeChance:0.7,
        terrains:['jungle'],
        lootTable:[{id:'fruit',qty:'1-2'}],
    },
    spider: {
        id:'spider', name:'Giant Spider', icon:'🕷️',
        hp:25, damage:14, fleeChance:0.55,
        terrains:['jungle','rocks'],
        lootTable:[{id:'vine',qty:'1-3'}],
    },
    komodo: {
        id:'komodo', name:'Monitor Lizard', icon:'🦎',
        hp:60, damage:25, fleeChance:0.35,
        terrains:['jungle','plains'],
        lootTable:[{id:'raw_meat',qty:'2-4'},{id:'bone',qty:'1-3'},{id:'hide',qty:'1-2'}],
    },
};

// Wildlife chance per terrain
const WILDLIFE_CHANCE = {
    beach:0.10, jungle:0.22, swamp:0.18, plains:0.14,
    hills:0.10, mountains:0.05, rocks:0.12, volcano:0.04, water:0,
};

export function placeWildlife() {
    state.hexData.forEach(data => {
        if (data.terrain === 'water') return;
        const chance = WILDLIFE_CHANCE[data.terrain] || 0;
        if (Math.random() < chance) {
            // Pick a wildlife type for this terrain
            const valid = Object.values(WILDLIFE_TYPES).filter(w => w.terrains.includes(data.terrain));
            if (valid.length > 0) {
                const chosen = valid[Math.floor(Math.random() * valid.length)];
                data.wildlifePresent = true;
                data.wildlifeId = chosen.id;
            }
        }
    });
}

// Active combat state
let combatState = null;

export function triggerWildlifeEncounter(q, r) {
    const data = getHexData(q, r);
    if (!data || !data.wildlifePresent || !data.wildlifeId) return;

    const wildlife = WILDLIFE_TYPES[data.wildlifeId];
    if (!wildlife) return;

    combatState = {
        q, r,
        wildlife: { ...wildlife, currentHp: wildlife.hp },
        playerHpAtStart: state.player.hp,
        round: 1,
    };

    import('./ui.js').then(mod => mod.showCombatWindow(wildlife, q, r));
}

export function startCombat(wildlifeId, q, r) {
    const wildlife = WILDLIFE_TYPES[wildlifeId];
    if (!wildlife) return;
    combatState = {
        q, r,
        wildlife: { ...wildlife, currentHp: wildlife.hp },
        playerHpAtStart: state.player.hp,
        round: 1,
    };
    import('./ui.js').then(mod => mod.showCombatWindow(wildlife, q, r));
}

export function resolveCombat(action) {
    if (!combatState) return { done: false };
    const { wildlife, q, r } = combatState;
    const p = state.player;
    let log = '';
    let done = false;
    let won = false;

    if (action === 'attack') {
        const playerDmg = 15 + Math.floor(Math.random() * 11);
        wildlife.currentHp -= playerDmg;
        log += `You strike the ${wildlife.name} for ${playerDmg} damage. `;

        if (wildlife.currentHp <= 0) {
            done = true; won = true;
            log += `The ${wildlife.name} is defeated!`;
        } else {
            const enemyDmg = Math.floor(wildlife.damage * (0.7 + Math.random() * 0.6));
            p.hp = Math.max(0, p.hp - enemyDmg);
            log += `It retaliates for ${enemyDmg} damage.`;
            if (p.hp <= 0) {
                done = true; won = false;
                p.isAlive = false;
                log += ' You fall.';
            }
        }
    } else if (action === 'flee') {
        if (Math.random() < wildlife.fleeChance) {
            done = true; won = false;
            log = `You successfully flee from the ${wildlife.name}.`;
        } else {
            const enemyDmg = Math.floor(wildlife.damage * 0.8);
            p.hp = Math.max(0, p.hp - enemyDmg);
            log = `You fail to escape! The ${wildlife.name} claws you for ${enemyDmg} damage.`;
            if (p.hp <= 0) { done = true; p.isAlive = false; }
        }
    } else if (action === 'sneak') {
        if (Math.random() < 0.35) {
            done = true; won = false;
            log = `You sneak past the ${wildlife.name} undetected.`;
        } else {
            const enemyDmg = Math.floor(wildlife.damage * 0.6);
            p.hp = Math.max(0, p.hp - enemyDmg);
            log = `The ${wildlife.name} spots you and attacks! ${enemyDmg} damage.`;
        }
    }

    updateHUD();

    if (done) {
        if (won) {
            // Give loot
            const lootItems = [];
            for (const entry of wildlife.lootTable) {
                const qty = rollQty(entry.qty || 1);
                addItem(entry.id, qty);
                lootItems.push({ id: entry.id, qty });
            }
            addMessage(`${wildlife.name} defeated! Looted: ${lootItems.map(l=>l.id).join(', ')}.`, 'success');
            // Remove wildlife from hex
            const data = getHexData(q, r);
            if (data) { data.wildlifePresent = false; data.wildlifeId = null; }
        }
        combatState = null;
        if (!p.isAlive) {
            import('./game-mode.js').then(mod => mod.checkGameOver());
        }
    }

    combatState && combatState.round++;

    return { done, won, log, wildlifeHp: done ? 0 : wildlife.currentHp, wildlifeMaxHp: wildlife.hp };
}

export function getCombatState() { return combatState; }
