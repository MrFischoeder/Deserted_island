/**
 * Thin wrapper around the Socket.IO client (loaded via <script> tag).
 * Handlers registered before connect() are queued and flushed on connect.
 *
 * Connection target = window.location.origin — works correctly for both:
 *   http://localhost:3000       (host machine)
 *   http://192.168.1.162:3000  (other LAN machines)
 * Never hardcode localhost or 127.0.0.1 here.
 */

let _socket      = null;
const _pendingOn = [];   // { event, fn } — queued before socket exists

export function connect(serverUrl) {
    return new Promise((resolve, reject) => {
        if (typeof window.io !== 'function') {
            const msg =
                'Socket.IO client script not loaded.\n' +
                'The game server must be running (npm start) and ' +
                'you must open the game via http://HOST:3000, not from a file.';
            console.error('[network] ERROR:', msg);
            reject(new Error(msg));
            return;
        }

        // Already connected — return existing socket id immediately
        if (_socket && _socket.connected) {
            console.log('[network] Already connected, reusing socket:', _socket.id);
            resolve(_socket.id);
            return;
        }

        // Use window.location.origin so LAN clients connect to the right host
        const target = serverUrl || window.location.origin;
        console.log('[network] Connecting to:', target, '  (origin:', window.location.origin, ')');

        _socket = window.io(target, {
            reconnectionAttempts: 5,
            timeout: 8000,
        });

        _socket.once('connect', () => {
            console.log('[network] Connected. socket.id =', _socket.id);
            // Flush handlers registered before connect
            for (const { event, fn } of _pendingOn) _socket.on(event, fn);
            _pendingOn.length = 0;
            resolve(_socket.id);
        });

        _socket.once('connect_error', (err) => {
            console.error('[network] connect_error:', err.message);
            reject(err);
        });

        _socket.on('disconnect', (reason) => {
            console.warn('[network] Disconnected:', reason);
        });
    });
}

export function emit(event, data) {
    if (_socket) _socket.emit(event, data);
}

export function on(event, fn) {
    if (_socket) _socket.on(event, fn);
    else _pendingOn.push({ event, fn });
}

export function off(event, fn) {
    if (_socket) _socket.off(event, fn);
}

export function isConnected() { return !!(_socket && _socket.connected); }
export function getSocketId() { return _socket ? _socket.id : null; }
