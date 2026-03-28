export const ICONS = {
    // Materials
    wood:             { icon: '🪵', name: 'Wood' },
    rope:             { icon: '🧵', name: 'Rope' },
    vine:             { icon: '🌿', name: 'Vine' },
    plank:            { icon: '🪵', name: 'Plank' },
    fabric_scrap:     { icon: '🧶', name: 'Fabric Scrap' },
    metal_scrap:      { icon: '🔩', name: 'Metal Scrap' },
    stone:            { icon: '🪨', name: 'Stone' },
    flint:            { icon: '🔸', name: 'Flint' },
    shell:            { icon: '🐚', name: 'Shell' },
    bone:             { icon: '🦴', name: 'Bone' },
    hide:             { icon: '🐾', name: 'Animal Hide' },
    // Food
    fruit:            { icon: '🍊', name: 'Fruit' },
    coconut:          { icon: '🥥', name: 'Coconut' },
    berries:          { icon: '🫐', name: 'Berries' },
    mushroom:         { icon: '🍄', name: 'Mushroom' },
    herb:             { icon: '🌱', name: 'Herb' },
    roots:            { icon: '🥕', name: 'Roots' },
    // Fish & Meat
    raw_fish:         { icon: '🐟', name: 'Raw Fish' },
    cooked_fish:      { icon: '🍣', name: 'Cooked Fish' },
    crab:             { icon: '🦀', name: 'Crab' },
    raw_meat:         { icon: '🥩', name: 'Raw Meat' },
    cooked_meat:      { icon: '🍖', name: 'Cooked Meat' },
    // Water
    fresh_water:      { icon: '💧', name: 'Fresh Water' },
    coconut_water:    { icon: '🥤', name: 'Coconut Water' },
    // Tools & Crafted
    spear:            { icon: '🗡️',  name: 'Spear' },
    harpoon:          { icon: '🔱', name: 'Harpoon' },
    fishing_rod:      { icon: '🎣', name: 'Fishing Rod' },
    fishing_net:      { icon: '🕸️',  name: 'Fishing Net' },
    knife:            { icon: '🔪', name: 'Knife' },
    axe:              { icon: '🪓', name: 'Axe' },
    shovel:           { icon: '⛏️',  name: 'Shovel' },
    rope_crafted:     { icon: '🪢', name: 'Braided Rope' },
    wooden_bowl:      { icon: '🥣', name: 'Wooden Bowl' },
    torch:            { icon: '🔦', name: 'Torch' },
    bandage:          { icon: '🩹', name: 'Bandage' },
    raft_part:        { icon: '🛖', name: 'Raft Part' },
    // Equipment & Upgrades
    leather_backpack: { icon: '🎒', name: 'Leather Backpack' },
    // Structures (built in-world — never go to inventory, just for display)
    storage_chest:    { icon: '🗃️', name: 'Storage Chest' },
    simple_shelter:   { icon: '🏕️', name: 'Simple Shelter' },
    campfire:         { icon: '🔥', name: 'Campfire' },
    // Misc
    map_fragment:     { icon: '🗺️',  name: 'Map Fragment' },
    key:              { icon: '🗝️',  name: 'Old Key' },
    notebook:         { icon: '📓', name: 'Notebook' },
};

export function getIcon(id) {
    return ICONS[id] || { icon: '❓', name: id };
}
