'use strict';

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const { registerHandlers } = require('./socket-handlers.js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));
console.log('[express] Serving static files from:', path.join(__dirname, '..'));

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for']
        || socket.handshake.address;
    console.log(`[socket] connected    id=${socket.id}  ip=${clientIp}`);

    registerHandlers(io, socket);

    socket.on('disconnect', (reason) => {
        console.log(`[socket] disconnected id=${socket.id}  reason=${reason}`);
    });
});

// ── Listen ────────────────────────────────────────────────────────────────────
// BIND_HOST controls which interface to bind on.
// Always use 0.0.0.0 so both localhost AND LAN IP work simultaneously.
// Never bind to a specific IP (e.g. 192.168.x.x) — that would break localhost.
const PORT      = process.env.PORT      || 3000;
const BIND_HOST = '0.0.0.0';                          // always all interfaces
const LAN_IP    = process.env.LAN_IP    || '192.168.1.162'; // display only

server.listen(PORT, BIND_HOST, () => {
    console.log('');
    console.log('======================================');
    console.log('  DESERTED ISLAND — MULTIPLAYER SERVER');
    console.log('======================================');
    console.log(`  Bind:      ${BIND_HOST}:${PORT}`);
    console.log(`  Local:     http://localhost:${PORT}`);
    console.log(`  LAN:       http://${LAN_IP}:${PORT}`);
    console.log('  Ctrl+C to stop');
    console.log('======================================');
    console.log('');
});
