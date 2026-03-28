export const RECIPES = [
    // =================== WEAPONS ===================
    {
        id: 'spear',
        name: 'Crude Spear',
        icon: '🗡️',
        description: 'A sharpened stick. Good for hunting and basic self-defense.',
        category: 'weapons',
        ingredients: [
            { id: 'wood', qty: 2 },
            { id: 'flint', qty: 1 },
            { id: 'vine', qty: 1 },
        ],
        result: { id: 'spear', qty: 1 },
        apCost: 1,
    },
    // =================== TOOLS ===================
    {
        id: 'harpoon',
        name: 'Harpoon',
        icon: '🔱',
        description: 'A weighted spear for fishing in shallow water. Works at 40% success rate.',
        category: 'tools',
        ingredients: [
            { id: 'wood', qty: 2 },
            { id: 'flint', qty: 2 },
            { id: 'rope', qty: 1 },
        ],
        result: { id: 'harpoon', qty: 1 },
        apCost: 2,
    },
    {
        id: 'fishing_rod',
        name: 'Fishing Rod',
        icon: '🎣',
        description: 'A simple rod with a rope line. 60% chance to catch fish. Requires processed rope.',
        category: 'tools',
        ingredients: [
            { id: 'wood', qty: 1 },
            { id: 'rope', qty: 1 },
        ],
        result: { id: 'fishing_rod', qty: 1 },
        apCost: 1,
    },
    {
        id: 'fishing_net',
        name: 'Fishing Net',
        icon: '🕸️',
        description: 'A woven net for catching multiple fish. 70% success, 2–3 fish. Requires rope and braided rope.',
        category: 'tools',
        ingredients: [
            { id: 'rope', qty: 2 },
            { id: 'rope_crafted', qty: 1 },
        ],
        result: { id: 'fishing_net', qty: 1 },
        apCost: 2,
    },
    {
        id: 'knife',
        name: 'Flint Knife',
        icon: '🔪',
        description: 'A sharp flint knife knapped from flint and stone. Good for cutting, skinning and crafting.',
        category: 'tools',
        ingredients: [
            { id: 'flint', qty: 1 },
            { id: 'stone', qty: 1 },
        ],
        result: { id: 'knife', qty: 1 },
        apCost: 1,
    },
    {
        id: 'stone_knife',
        name: 'Stone Knife',
        icon: '🗡️',
        description: 'A rough knife knapped from two stones. Less sharp than flint but functional as a tool.',
        category: 'tools',
        ingredients: [
            { id: 'stone', qty: 2 },
        ],
        result: { id: 'knife', qty: 1 },
        apCost: 1,
    },
    {
        id: 'wooden_bowl',
        name: 'Wooden Bowl',
        icon: '🥣',
        description: 'A carved bowl for storing and carrying water or food.',
        category: 'tools',
        ingredients: [
            { id: 'wood', qty: 2 },
            { id: 'stone', qty: 1 },
        ],
        result: { id: 'wooden_bowl', qty: 1 },
        apCost: 1,
    },
    {
        id: 'torch',
        name: 'Torch',
        icon: '🔦',
        description: 'A makeshift torch. Useful for exploring dark structures.',
        category: 'tools',
        ingredients: [
            { id: 'wood', qty: 1 },
            { id: 'fabric_scrap', qty: 1 },
        ],
        result: { id: 'torch', qty: 2 },
        apCost: 1,
    },
    {
        id: 'shovel',
        name: 'Digging Stick',
        icon: '⛏️',
        description: 'A sturdy stick for digging.',
        category: 'tools',
        ingredients: [
            { id: 'wood', qty: 2 },
            { id: 'stone', qty: 2 },
            { id: 'vine', qty: 1 },
        ],
        result: { id: 'shovel', qty: 1 },
        apCost: 2,
    },
    // =================== MATERIALS ===================
    {
        id: 'rope',
        name: 'Rope',
        icon: '🧵',
        description: 'Simple rope twisted from vines. Requires a stone, shell or knife to process — the tool is not consumed.',
        category: 'materials',
        ingredients: [
            { id: 'vine', qty: 2 },
        ],
        tools: [
            { anyOf: ['stone', 'shell', 'knife'], qty: 1, label: 'Stone / Shell / Knife' },
        ],
        result: { id: 'rope', qty: 2 },
        apCost: 1,
    },
    {
        id: 'rope_crafted',
        name: 'Braided Rope',
        icon: '🪢',
        description: 'Stronger rope braided from multiple vines. Required for advanced crafting.',
        category: 'materials',
        ingredients: [
            { id: 'vine', qty: 4 },
        ],
        result: { id: 'rope_crafted', qty: 2 },
        apCost: 1,
    },
    // =================== MEDICAL ===================
    {
        id: 'bandage',
        name: 'Bandage',
        icon: '🩹',
        description: 'Cloth bandage. Restores 20 HP when used.',
        category: 'medical',
        ingredients: [
            { id: 'fabric_scrap', qty: 2 },
            { id: 'herb', qty: 1 },
        ],
        result: { id: 'bandage', qty: 2 },
        apCost: 1,
    },
    // =================== EQUIPMENT ===================
    {
        id: 'leather_backpack',
        name: 'Leather Backpack',
        icon: '🎒',
        description: 'A sturdy backpack made from hides. Expands carrying capacity from 9 to 15 slots.',
        category: 'equipment',
        ingredients: [
            { id: 'hide', qty: 3 },
            { id: 'rope', qty: 2 },
            { id: 'vine', qty: 1 },
        ],
        result: { id: 'leather_backpack', qty: 1 },
        apCost: 2,
        effect: 'expand_backpack',
    },
    // =================== ESCAPE ===================
    {
        id: 'raft_part',
        name: 'Raft Section',
        icon: '🛖',
        description: 'A section of a makeshift raft. Collect several to build an escape vessel.',
        category: 'escape',
        ingredients: [
            { id: 'plank', qty: 3 },
            { id: 'rope_crafted', qty: 2 },
            { id: 'vine', qty: 2 },
        ],
        result: { id: 'raft_part', qty: 1 },
        apCost: 3,
    },
];

export function getRecipe(id) {
    return RECIPES.find(r => r.id === id) || null;
}
