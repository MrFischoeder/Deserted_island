'use strict';

const { createRoom, joinRoom, leaveRoom, getRoomByPlayer, roomPlayerList } = require('./rooms.js');
const { buildSpawnAssignments,
        applyHexUpdate, applyLootAdd, applyLootTake, applyLootClear,
        applySearchLock, applySearchUnlock, clearPlayerSearchLocks } = require('./game-state.js');
const { handleDayEnd } = require('./day-cycle.js');

function registerHandlers(io, socket) {

    // ── Lobby ──────────────────────────────────────────────────────────────────

    socket.on('lobby:create', ({ name } = {}) => {
        const room = createRoom(socket.id, (name || 'Survivor').slice(0, 20));
        socket.join(room.code);
        socket.emit('lobby:created', {
            code:    room.code,
            players: roomPlayerList(room),
            hostId:  room.hostId,
        });
    });

    socket.on('lobby:join', ({ code, name } = {}) => {
        if (!code) { socket.emit('lobby:error', { message: 'No room code supplied.' }); return; }
        const result = joinRoom(code.toUpperCase(), socket.id, (name || 'Survivor').slice(0, 20));
        if (result.error) { socket.emit('lobby:error', { message: result.error }); return; }
        const room = result.room;
        socket.join(room.code);
        const list = roomPlayerList(room);
        socket.emit('lobby:joined', { code: room.code, players: list, hostId: room.hostId });
        socket.to(room.code).emit('lobby:update', { players: list, hostId: room.hostId });
    });

    socket.on('lobby:leave', () => _handleLeave(io, socket));

    // ── Game Start ─────────────────────────────────────────────────────────────

    socket.on('game:start', ({ mapSize } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room)                     { socket.emit('lobby:error', { message: 'Not in a room.' }); return; }
        if (room.hostId !== socket.id) { socket.emit('lobby:error', { message: 'Only the host can start.' }); return; }
        if (room.started)              return;

        room.started         = true;
        room.day             = 1;
        room.endedDay        = new Set();
        room.worldState      = new Map();
        room.playerPositions = {};       // socketId → { q, r }

        const validSizes = ['small', 'medium', 'large'];
        const safeMapSize = validSizes.includes(mapSize) ? mapSize : 'medium';

        const seed             = Date.now();
        const spawnAssignments = buildSpawnAssignments(room);
        const players          = roomPlayerList(room);

        for (const [id] of room.players) {
            io.to(id).emit('game:start', {
                seed,
                spawnIndex: spawnAssignments[id],
                players,
                hostId:  room.hostId,
                mapSize: safeMapSize,
            });
        }
    });

    // ── Player position / state ────────────────────────────────────────────────

    socket.on('player:move', ({ q, r, ap } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        // Track position server-side for late-joining sync
        if (room.playerPositions && q != null && r != null) {
            room.playerPositions[socket.id] = { q, r };
        }
        socket.to(room.code).emit('player:moved', { id: socket.id, q, r, ap });
    });

    socket.on('player:update', (data = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        socket.to(room.code).emit('player:updated', { id: socket.id, ...data });
    });

    socket.on('player:spawned', ({ q, r } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room) return;

        // Record this player's spawn position
        room.playerPositions = room.playerPositions || {};
        room.playerPositions[socket.id] = { q, r };

        // Broadcast to other players that this player has spawned
        socket.to(room.code).emit('player:spawned', { id: socket.id, q, r });

        // Send back all other already-spawned players' positions to the new spawner
        const allPlayers = roomPlayerList(room);
        const syncPlayers = allPlayers
            .filter(p => p.id !== socket.id && room.playerPositions[p.id] != null)
            .map(p => ({
                id:   p.id,
                name: p.name,
                q:    room.playerPositions[p.id].q,
                r:    room.playerPositions[p.id].r,
            }));

        if (syncPlayers.length > 0) {
            socket.emit('players:sync', { players: syncPlayers });
        }
    });

    // ── Shared world state: hex exploration ───────────────────────────────────

    socket.on('world:hex-update', ({ q, r, updates } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        console.log(`[world] hex-update (${q},${r}) by ${socket.id}:`, Object.keys(updates || {}));
        applyHexUpdate(room, q, r, updates);
        socket.to(room.code).emit('world:hex-updated', { q, r, updates });
    });

    // ── Shared world state: ground loot ───────────────────────────────────────

    socket.on('world:loot-add', ({ q, r, items } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        applyLootAdd(room, q, r, items);
        socket.to(room.code).emit('world:loot-added', { q, r, items });
    });

    socket.on('world:loot-take', ({ q, r, id, qty } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        applyLootTake(room, q, r, id, qty);
        socket.to(room.code).emit('world:loot-taken', { q, r, id, qty });
    });

    socket.on('world:loot-clear', ({ q, r } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        applyLootClear(room, q, r);
        socket.to(room.code).emit('world:loot-cleared', { q, r });
    });

    // ── Search locks ──────────────────────────────────────────────────────────

    socket.on('hex:search-lock', ({ q, r, type } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        applySearchLock(room, q, r, socket.id, type);
        socket.to(room.code).emit('hex:search-locked', { q, r, playerId: socket.id, type });
    });

    socket.on('hex:search-unlock', ({ q, r } = {}) => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        applySearchUnlock(room, q, r);
        socket.to(room.code).emit('hex:search-unlocked', { q, r });
    });

    // ── Day end ────────────────────────────────────────────────────────────────

    socket.on('day:end', () => {
        const room = getRoomByPlayer(socket.id);
        if (!room?.started) return;
        handleDayEnd(io, room, socket.id);
    });

    // ── Disconnect ─────────────────────────────────────────────────────────────

    socket.on('disconnect', () => _handleLeave(io, socket));
}

function _handleLeave(io, socket) {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const code        = room.code;
    const updatedRoom = leaveRoom(code, socket.id);
    socket.leave(code);

    // Clean up position tracking
    if (room.playerPositions) delete room.playerPositions[socket.id];

    if (updatedRoom) {
        const list = roomPlayerList(updatedRoom);
        io.to(code).emit('lobby:update', { players: list, hostId: updatedRoom.hostId });
        if (updatedRoom.started) {
            io.to(code).emit('player:left', { id: socket.id });
            // Release any search locks held by the disconnected player
            const released = clearPlayerSearchLocks(updatedRoom, socket.id);
            for (const { q, r } of released) {
                io.to(code).emit('hex:search-unlocked', { q, r });
            }
        }
    }
}

module.exports = { registerHandlers };
