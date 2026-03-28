import { state, setHexData } from './state.js';
import { addMessage, updateHUD } from './ui.js';
import { renderMap, renderPlayer, centerCameraOnPlayer } from './render.js';
import { updateAllFog } from './fog-of-war.js';

const SAVE_PREFIX = 'deserted_island_v1_slot_';

export function saveGame(slot) {
    if (!state.gameStarted) return false;

    const saveData = {
        version: 1,
        timestamp: new Date().toLocaleString(),
        mapSize: state.mapSize,
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        islandCenterQ: state.islandCenterQ,
        islandCenterR: state.islandCenterR,
        player: { ...state.player, inventory: [...state.player.inventory.map(s => ({ ...s }))] },
        hexData: [],
    };

    // Serialize hex data (Map -> array)
    state.hexData.forEach((data) => {
        saveData.hexData.push({
            q: data.q,
            r: data.r,
            terrain: data.terrain,
            elevation: data.elevation,
            moisture: data.moisture,
            connections: [...data.connections],
            discoveredConnections: [...data.discoveredConnections],
            fogState: data.fogState,
            visited: data.visited,
            resourcesSearched: data.resourcesSearched,
            lastResourceSearchDay: data.lastResourceSearchDay ?? null,
            resourceRespawnDays: data.resourceRespawnDays ?? null,
            lastScavengeDay: data.lastScavengeDay ?? null,
            scavengeRespawnDays: data.scavengeRespawnDays ?? null,
            lastForageDay: data.lastForageDay ?? null,
            forageRespawnDays: data.forageRespawnDays ?? null,
            pathSearched: data.pathSearched,
            hasWaterSource: data.hasWaterSource,
            waterSourceDiscovered: data.waterSourceDiscovered,
            persistentStructure: data.persistentStructure,
            structureDiscovered: data.structureDiscovered,
            structureExplored: data.structureExplored,
            groundLoot: [...data.groundLoot],
            locationDescription: data.locationDescription,
            wildlifePresent: data.wildlifePresent,
            wildlifeId: data.wildlifeId,
            hasCamp: data.hasCamp ?? false,
            campStructures: data.campStructures ? JSON.parse(JSON.stringify(data.campStructures)) : [],
        });
    });

    try {
        localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(saveData));
        addMessage(`Game saved to slot ${slot}.`, 'success');
        return true;
    } catch (e) {
        addMessage('Save failed (storage full?).', 'danger');
        return false;
    }
}

export function loadGame(slot) {
    const raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw) {
        addMessage('No save in that slot.', 'warning');
        return false;
    }

    let saveData;
    try {
        saveData = JSON.parse(raw);
    } catch (e) {
        addMessage('Save file corrupted.', 'danger');
        return false;
    }

    // Restore state
    state.mapSize         = saveData.mapSize;
    state.gridWidth       = saveData.gridWidth;
    state.gridHeight      = saveData.gridHeight;
    state.islandCenterQ   = saveData.islandCenterQ;
    state.islandCenterR   = saveData.islandCenterR;

    // Restore player
    Object.assign(state.player, saveData.player);
    state.player.inventory = saveData.player.inventory.map(s => ({ ...s }));

    // Rebuild hex data Map
    state.hexData.clear();
    for (const hex of saveData.hexData) {
        setHexData(hex.q, hex.r, {
            q: hex.q,
            r: hex.r,
            terrain: hex.terrain,
            elevation: hex.elevation || 0,
            moisture: hex.moisture || 0,
            connections: hex.connections || [true,true,true,true,true,true],
            discoveredConnections: hex.discoveredConnections || [false,false,false,false,false,false],
            fogState: hex.fogState || 'undiscovered',
            visited: hex.visited || false,
            resourcesSearched: hex.resourcesSearched || false,
            lastResourceSearchDay: hex.lastResourceSearchDay ?? null,
            resourceRespawnDays: hex.resourceRespawnDays ?? null,
            lastScavengeDay: hex.lastScavengeDay ?? null,
            scavengeRespawnDays: hex.scavengeRespawnDays ?? null,
            lastForageDay: hex.lastForageDay ?? null,
            forageRespawnDays: hex.forageRespawnDays ?? null,
            pathSearched: hex.pathSearched || false,
            hasWaterSource: hex.hasWaterSource || false,
            waterSourceDiscovered: hex.waterSourceDiscovered || false,
            persistentStructure: hex.persistentStructure || null,
            structureDiscovered: hex.structureDiscovered || false,
            structureExplored: hex.structureExplored || false,
            groundLoot: hex.groundLoot || [],
            locationDescription: hex.locationDescription || null,
            wildlifePresent: hex.wildlifePresent || false,
            wildlifeId: hex.wildlifeId || null,
            hasCamp: hex.hasCamp || false,
            campStructures: hex.campStructures ? JSON.parse(JSON.stringify(hex.campStructures)) : [],
        });
    }

    // Re-init grid with correct map size
    import('./grid.js').then(gridMod => {
        gridMod.initGrid(state.mapSize);

        // Clear and re-render
        state.hexGraphicsCache.clear();
        if (state.layers.terrain) state.layers.terrain.removeChildren();
        if (state.layers.fog)     state.layers.fog.removeChildren();
        if (state.layers.decorations) state.layers.decorations.removeChildren();

        renderMap();
        updateAllFog();
        renderPlayer();
        centerCameraOnPlayer();
        updateHUD();
        state.gameStarted = true;

        document.getElementById('start-screen')?.classList.add('hidden');
        document.getElementById('hud')?.classList.remove('hidden');

        addMessage(`Loaded save from slot ${slot}. Day ${state.player.day}.`, 'success');
        // Location panel not auto-opened — player clicks their hex
    });

    return true;
}

export function getSaveSlots() {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
        const raw = localStorage.getItem(SAVE_PREFIX + i);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                slots.push({
                    slot: i,
                    exists: true,
                    timestamp: data.timestamp || 'Unknown',
                    day: data.player?.day || 1,
                    mapSize: data.mapSize || '?',
                });
            } catch {
                slots.push({ slot: i, exists: false });
            }
        } else {
            slots.push({ slot: i, exists: false });
        }
    }
    return slots;
}

export function deleteSave(slot) {
    localStorage.removeItem(SAVE_PREFIX + slot);
    addMessage(`Slot ${slot} deleted.`, '');
}
