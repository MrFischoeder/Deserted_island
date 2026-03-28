export const state = {
    // PIXI Application
    app: null,

    // Game status
    gameStarted: false,
    mapSize: null,

    // Honeycomb grid instance
    hexGrid: null,
    gridWidth: 0,
    gridHeight: 0,

    // All hex data: key='q,r' -> hexData object
    hexData: new Map(),

    // Player
    player: {
        q: 0, r: 0,
        hp: 100, maxHp: 100,
        food: 80, maxFood: 100,
        water: 80, maxWater: 100,
        energy: 100, maxEnergy: 100,
        ap: 10, maxAp: 10,
        day: 1,
        inventory: [],
        maxSlots: 9,
        isAlive: true,
    },

    // Camera / viewport
    camera: {
        x: 0, y: 0,
        zoom: 1.0,
        isDragging: false,
        dragStart: null,
        cameraStart: null,
        dragMoved: false,
    },

    // PIXI containers
    cameraContainer: null,
    layers: {
        terrain: null,
        decorations: null,
        fog: null,
        entities: null,
    },

    // Flags
    godMode: false,
    isAnimating: false,
    activeModal: null,
    introShown: false,
    startingBeachTutorialDone: false,

    // Graphics cache per hex
    hexGraphicsCache: new Map(),

    // Player graphic
    playerGfx: null,

    // Island center (approximate)
    islandCenterQ: 0,
    islandCenterR: 0,
};

export function hexKey(q, r) {
    return `${q},${r}`;
}

export function getHexData(q, r) {
    return state.hexData.get(hexKey(q, r));
}

export function setHexData(q, r, data) {
    state.hexData.set(hexKey(q, r), data);
}
