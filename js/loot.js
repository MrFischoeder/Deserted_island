import { state, getHexData } from './state.js';
import { addItem } from './inventory.js';
import { getIcon } from './icons.js';
import { addMessage } from './ui.js';

export function rollQty(qtyStr) {
    if (typeof qtyStr === 'number') return qtyStr;
    const parts = String(qtyStr).split('-').map(Number);
    if (parts.length === 1) return parts[0];
    return Math.floor(Math.random() * (parts[1] - parts[0] + 1)) + parts[0];
}

export function generateLootFromTable(table) {
    if (!table || table.length === 0) return [];
    const result = [];
    const shuffled = [...table].sort(() => Math.random() - 0.5);
    const count = Math.min(shuffled.length, Math.floor(Math.random() * 3) + 1);
    for (let i = 0; i < count; i++) {
        const entry = shuffled[i];
        if (Math.random() < (entry.chance || 0.7)) {
            const qty = rollQty(entry.qty || 1);
            const info = getIcon(entry.id);
            result.push({ id: entry.id, name: info.name, icon: info.icon, qty });
        }
    }
    return result;
}

/**
 * Adds items to ground loot on a hex.
 * @param {boolean} _skipEmit  Pass true when applying a remote sync (to avoid echo).
 */
export function addToGroundLoot(q, r, items, _skipEmit = false) {
    const data = getHexData(q, r);
    if (!data) return;
    for (const item of items) {
        // Items added via search/combat share a stack (no expiry); dropped items are separate
        const existing = data.groundLoot.find(l => l.id === item.id && !l.expiresAtDay && !item.expiresAtDay);
        if (existing) {
            existing.qty += item.qty;
        } else {
            data.groundLoot.push({ ...item });
        }
    }
    // Sync to other players in multiplayer
    if (!_skipEmit) _syncLootAdd(q, r, items);
}

/**
 * Drops a single item from player inventory onto current hex as temporary ground loot.
 * Dropped items expire after 2–3 days (randomised).
 * After expiry the item is lost — consumed by jungle growth, sea wash, or decay.
 * Only items stored in camp structures are truly persistent.
 */
export function dropItemToGround(item) {
    const { q, r } = state.player;
    const data = getHexData(q, r);
    if (!data) return;
    const info = getIcon(item.id);
    const expiresAfterDays = Math.floor(Math.random() * 2) + 2; // 2 or 3 days
    const entry = {
        id: item.id,
        name: info.name,
        icon: info.icon,
        qty: 1,
        droppedAtDay: state.player.day,
        expiresAfterDays,
        expiresAtDay: state.player.day + expiresAfterDays,
    };
    data.groundLoot.push(entry);
    // Sync to other players in multiplayer
    _syncLootAdd(q, r, [entry]);
}

/**
 * Removes qty of id from ground loot on a hex.
 * @param {boolean} _skipEmit  Pass true when applying a remote sync.
 */
export function removeFromGroundLoot(q, r, id, qty, _skipEmit = false) {
    const data = getHexData(q, r);
    if (!data) return;
    const idx = data.groundLoot.findIndex(l => l.id === id);
    if (idx === -1) return;
    data.groundLoot[idx].qty -= qty;
    if (data.groundLoot[idx].qty <= 0) data.groundLoot.splice(idx, 1);
    // Sync to other players in multiplayer
    if (!_skipEmit) _syncLootTake(q, r, id, qty);
}

export function takeAllGroundLoot(q, r) {
    const data = getHexData(q, r);
    if (!data) return;
    for (const item of data.groundLoot) {
        addItem(item.id, item.qty);
        addMessage(`Picked up ${item.qty}x ${item.name}.`, 'success');
    }
    data.groundLoot = [];
    // Clear all ground loot on this hex for other players
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (isMultiplayer()) {
            import('./network.js').then(m => m.emit('world:loot-clear', { q, r }));
        }
    });
}

/**
 * Removes expired dropped items from all hexes. Called at day start.
 * Items left loose on a hex vanish after 2–3 days:
 * washed away by the sea, swallowed by jungle growth, or simply lost.
 */
export function checkGroundLootExpiry() {
    const day = state.player.day;
    const { q: pq, r: pr } = state.player;

    state.hexData.forEach(data => {
        if (!data.groundLoot || data.groundLoot.length === 0) return;
        const before = data.groundLoot.length;
        data.groundLoot = data.groundLoot.filter(item => {
            if (item.expiresAtDay !== undefined && item.expiresAtDay <= day) return false;
            return true;
        });
        if (data.groundLoot.length < before && data.q === pq && data.r === pr) {
            addMessage(
                'Items left on the ground have been reclaimed by the island — washed away or swallowed by the undergrowth.',
                'warning'
            );
        }
    });
}

export function getGroundLootDisplay(q, r) {
    const data = getHexData(q, r);
    if (!data) return [];
    return data.groundLoot.filter(l => l.qty > 0);
}

export function showLootItems(items, q, r) {
    import('./ui.js').then(mod => mod.showLootWindow(items, q, r));
}

export function takeGroundLoot(q, r) {
    const data = getHexData(q, r);
    if (!data || data.groundLoot.length === 0) {
        addMessage('Nothing on the ground here.', '');
        return;
    }
    const items = data.groundLoot.filter(l => l.qty > 0);
    showLootItems(items, q, r);
}

// ── Internal MP sync helpers ──────────────────────────────────────────────────

function _syncLootAdd(q, r, items) {
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (isMultiplayer()) {
            import('./network.js').then(m => m.emit('world:loot-add', { q, r, items }));
        }
    });
}

function _syncLootTake(q, r, id, qty) {
    import('./multiplayer-state.js').then(({ isMultiplayer }) => {
        if (isMultiplayer()) {
            import('./network.js').then(m => m.emit('world:loot-take', { q, r, id, qty }));
        }
    });
}
