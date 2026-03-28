import { getHexData } from './state.js';
import { getNeighbors } from './grid.js';

const DESCRIPTIONS = {
    beach: [
        'Sun-bleached sand crunches under your feet. The waves roll in with a relentless rhythm. Debris from some long-forgotten wreck dots the shoreline.',
        'Warm sand stretches in both directions. Coconut shells and twisted driftwood mark the tide line. The ocean gleams beyond.',
        'The beach is quiet here. Footprints in the sand — yours now — will be gone by morning. A salt-crusted rope coils near the water\'s edge.',
        'Coarse sand mixed with broken shells. The smell of brine is strong. Something catches the light half-buried near the waterline.',
        'A sheltered cove. The water is calmer here, almost inviting. Old wooden planks have washed up, bleached white by the sun.',
    ],
    jungle: [
        'The canopy closes above you, cutting the light to a green twilight. Vines hang like curtains. Something moves in the undergrowth.',
        'Dense vegetation presses in from all sides. The air is thick with moisture and the sound of unseen insects. Roots snake across the ground.',
        'Shafts of light pierce the forest ceiling. The jungle is alive with sound — birds, rustling leaves, the distant drip of water.',
        'The undergrowth is thicker here. Broad leaves brush against you. A fruiting tree sags under the weight of its cargo above.',
        'An older part of the jungle. The trees are massive, their roots forming chambers and passages. Moss covers everything.',
    ],
    swamp: [
        'The ground squelches with each step. Dark water pools around gnarled roots. The air smells of rot and wet earth.',
        'Twisted mangroves rise from black water. Something ripples the surface nearby. Insects swarm in dense clouds.',
        'The swamp is eerily quiet. Mist clings to the surface of the still water. You can\'t see more than a few metres in any direction.',
        'Thick mud tries to claim your feet with each step. Strange plants grow here that you\'ve never seen before. Some might be edible.',
        'Standing water reflects a grey sky. Reeds grow tall along the edges. The wet season has been generous here.',
    ],
    plains: [
        'Open grassland stretches ahead. The wind ripples through tall grass. You can see a long way — which means others can see you too.',
        'A wide clearing. The ground is relatively flat and dry. Scrubby plants compete for space in the sun-baked soil.',
        'The grass here is waist-high. Birds scatter as you approach. In the distance, the treeline marks the edge of the jungle.',
        'A gentle slope of open land. The views are good. Berries cluster on low-growing bushes at the field\'s edge.',
        'Rolling grassland, dotted with occasional boulders. The sky feels close here, unobstructed by trees.',
    ],
    hills: [
        'The ground rises steeply. Loose stones shift underfoot. From the crest of this hill, you might be able to see more of the island.',
        'Rocky hillside. Scrub vegetation clings to the slopes. A narrow animal path winds upward through the brush.',
        'The hill gives a good vantage point over the surrounding terrain. The wind is stronger up here. Your legs ache from the climb.',
        'Boulders and sparse trees dot the slope. The soil is thin and stony. Under an overhang, the ground is dry and sheltered.',
        'A series of ridges, each higher than the last. Between them, small gullies might hide water. The footing is uncertain.',
    ],
    mountains: [
        'Cold. The rock face looms above, offering no easy passage. The wind bites at exposed skin. The view is extraordinary.',
        'A cliff-flanked ledge. The air is thin and cold. The island spreads out below, smaller than you imagined.',
        'Sheer faces of dark rock. Ice-cold water seeps from a crack in the stone. The sound of the wind is constant and loud.',
        'A mountain pass of sorts. The stone is ancient, cracked by frost. Nothing grows here except a pale lichen.',
        'The summit ridge. The world falls away on both sides. Somewhere far below, the sea glitters. The island looks tiny from here.',
    ],
    rocks: [
        'A jumble of massive boulders. Narrow passages thread between them, leading in several directions. The stone is warm from the sun.',
        'Weathered rock formations, shaped by wind and rain into strange pillars. Shadows hide the ground between them.',
        'An outcrop of dark volcanic rock. Sharp-edged and hostile. Crabs pick their way among the crevices near the sea.',
        'Fallen columns of stone. This might have been something once — a cairn, a structure. Hard to say now.',
        'Smooth, rounded boulders, polished by centuries of tide. Seabirds nest in the crevices. The ground is treacherous.',
    ],
    volcano: [
        'The ground is hot underfoot. The smell of sulphur is heavy in the air. Fissures vent steam with a hiss. This place is dangerous.',
        'Black volcanic rock, scorched and cracked. The vent above occasionally rumbles. Nothing lives here willingly.',
        'A recent lava flow has cooled into rippled stone. The heat radiating from the ground is uncomfortable. Do not linger.',
    ],
    water: [
        'Open water. The sea stretches to the horizon.',
    ],
};

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function describeNeighborContext(q, r) {
    const neighbors = getNeighbors(q, r);
    const types = neighbors.map(nb => {
        const nd = getHexData(nb.q, nb.r);
        return nd ? nd.terrain : 'water';
    });

    const hasSea    = types.includes('water');
    const hasJungle = types.includes('jungle');
    const hasMtn    = types.includes('mountains') || types.includes('volcano');
    const hasSwamp  = types.includes('swamp');
    const hasBeach  = types.includes('beach');

    const notes = [];
    if (hasSea)    notes.push('The ocean is close.');
    if (hasJungle) notes.push('Dense jungle presses in nearby.');
    if (hasMtn)    notes.push('The mountains loom overhead.');
    if (hasSwamp)  notes.push('The swamp begins nearby.');
    if (hasBeach && !['beach'].includes(getHexData(q, r)?.terrain)) {
        notes.push('The beach is not far.');
    }

    return notes.length ? ' ' + pickRandom(notes) : '';
}

export function generateDescription(q, r) {
    const data = getHexData(q, r);
    if (!data) return 'An unremarkable place.';
    if (data.locationDescription) return data.locationDescription;

    const pool = DESCRIPTIONS[data.terrain] || ['An unremarkable place.'];
    const base = pickRandom(pool);
    const context = describeNeighborContext(q, r);
    const full = base + context;
    data.locationDescription = full;
    return full;
}
