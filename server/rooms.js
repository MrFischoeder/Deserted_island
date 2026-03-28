// Room management: create, join, leave, query
'use strict';

const rooms = new Map(); // roomCode -> room object

function _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function createRoom(socketId, playerName) {
    let code;
    do { code = _generateCode(); } while (rooms.has(code));
    const room = {
        code,
        hostId: socketId,
        started: false,
        day: 1,
        endedDay: new Set(),
        players: new Map([[socketId, { id: socketId, name: playerName }]]),
    };
    rooms.set(code, room);
    return room;
}

function joinRoom(code, socketId, playerName) {
    const room = rooms.get(code);
    if (!room)                       return { error: 'Room not found.' };
    if (room.started)                return { error: 'Game already started.' };
    if (room.players.size >= 10)     return { error: 'Room is full (max 10 players).' };
    if (room.players.has(socketId))  return { error: 'Already in this room.' };
    room.players.set(socketId, { id: socketId, name: playerName });
    return { room };
}

function leaveRoom(code, socketId) {
    const room = rooms.get(code);
    if (!room) return null;
    room.players.delete(socketId);
    room.endedDay.delete(socketId);
    if (room.players.size === 0) { rooms.delete(code); return null; }
    if (room.hostId === socketId) room.hostId = room.players.keys().next().value;
    return room;
}

function getRoom(code)           { return rooms.get(code) || null; }

function getRoomByPlayer(socketId) {
    for (const room of rooms.values()) {
        if (room.players.has(socketId)) return room;
    }
    return null;
}

function roomPlayerList(room) {
    return [...room.players.values()].map(p => ({
        id:     p.id,
        name:   p.name,
        isHost: p.id === room.hostId,
    }));
}

module.exports = { createRoom, joinRoom, leaveRoom, getRoom, getRoomByPlayer, roomPlayerList };
