'use strict';

/**
 * Called when a player emits 'day:end'.
 * Tracks who has ended; once all players agree, advances the day and emits 'day:advance'.
 */
function handleDayEnd(io, room, socketId) {
    room.endedDay.add(socketId);

    const totalPlayers = room.players.size;
    const endedCount   = room.endedDay.size;

    // Broadcast status so clients can show "X/Y ready"
    io.to(room.code).emit('day:status', {
        ended:     endedCount,
        total:     totalPlayers,
        playerIds: [...room.endedDay],
    });

    // Advance day only when every player has ended
    if (endedCount >= totalPlayers) {
        room.day = (room.day || 1) + 1;
        room.endedDay.clear();
        io.to(room.code).emit('day:advance', { newDay: room.day });
    }
}

module.exports = { handleDayEnd };
