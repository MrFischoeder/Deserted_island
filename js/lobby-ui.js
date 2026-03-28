/**
 * Lobby UI — handles the multiplayer lobby screen:
 * connect, create room, join room, wait for host to start.
 * Host can select map size before starting the game.
 */
import { connect, emit, on, isConnected } from './network.js';
import { mpState, upsertPlayer } from './multiplayer-state.js';

export function initLobbyUI(onGameStart) {
    const screen      = document.getElementById('lobby-screen');
    const nameInput   = document.getElementById('lobby-name-input');
    const codeInput   = document.getElementById('lobby-code-input');
    const createBtn   = document.getElementById('lobby-create-btn');
    const joinBtn     = document.getElementById('lobby-join-btn');
    const startBtn    = document.getElementById('lobby-start-btn');
    const backBtn     = document.getElementById('lobby-back-btn');
    const statusEl    = document.getElementById('lobby-status');
    const listEl      = document.getElementById('lobby-player-list');
    const codeDisplay = document.getElementById('lobby-code-display');
    const infoEl      = document.getElementById('lobby-info');
    const mapSizeEl   = document.getElementById('lobby-map-size');
    if (!screen) return;

    // Show lobby, hide start screen
    document.getElementById('start-screen').classList.add('hidden');
    screen.classList.remove('hidden');

    // ── Map size selection (host only) ─────────────────────────────────────────

    let _selectedMapSize = 'medium';

    document.querySelectorAll('.lobby-size-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            _selectedMapSize = btn.dataset.mapsize;
            document.querySelectorAll('.lobby-size-opt').forEach(b => {
                b.style.borderColor = '#6a5030';
                b.style.background  = '#2a1e10';
                b.classList.remove('active');
            });
            btn.style.borderColor = '#d4a020';
            btn.style.background  = '#3a2a10';
            btn.classList.add('active');
        });
    });

    // ── Helpers ────────────────────────────────────────────────────────────────

    function status(msg, cls = '') {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className   = 'lobby-status' + (cls ? ' ' + cls : '');
    }

    function renderPlayers(players, hostId) {
        if (!listEl) return;
        listEl.innerHTML = '';
        for (const p of players) {
            const li = document.createElement('li');
            li.className   = 'lobby-player-item';
            li.textContent = (p.id === hostId ? '👑 ' : '   ') + p.name;
            if (p.id === mpState.myId) li.classList.add('self');
            listEl.appendChild(li);
        }
        // Start button + map size only visible to host
        const isHost = mpState.myId === hostId;
        if (startBtn)  startBtn.classList.toggle('hidden', !isHost);
        if (mapSizeEl) mapSizeEl.classList.toggle('hidden', !isHost);
    }

    async function _connectIfNeeded() {
        if (isConnected()) return;
        status('Connecting to server…');
        console.log('[lobby] Attempting connect, origin:', window.location.origin);
        const socketId  = await connect();
        mpState.myId    = socketId;
        mpState.myName  = (nameInput?.value.trim() || 'Survivor').slice(0, 20);
        console.log('[lobby] Connected. myId:', socketId);
        status('Connected.', 'ok');
    }

    function _connectionErrorMsg(err) {
        const origin = window.location.origin;
        return `Nie można połączyć się z serwerem gry.\n` +
               `Sprawdź:\n` +
               `• Czy serwer działa? (npm start)\n` +
               `• Czy otworzyłeś grę przez ${origin} — nie przez plik?\n` +
               `• Czy firewall przepuszcza port 3000?\n` +
               `Błąd: ${err.message}`;
    }

    // ── Button handlers ────────────────────────────────────────────────────────

    createBtn?.addEventListener('click', async () => {
        try {
            await _connectIfNeeded();
            emit('lobby:create', { name: mpState.myName });
        } catch (e) {
            console.error('[lobby] connect failed:', e);
            status(_connectionErrorMsg(e), 'error');
        }
    });

    joinBtn?.addEventListener('click', async () => {
        const code = codeInput?.value.trim().toUpperCase();
        if (!code) { status('Wpisz kod pokoju.', 'error'); return; }
        try {
            await _connectIfNeeded();
            emit('lobby:join', { code, name: mpState.myName });
        } catch (e) {
            console.error('[lobby] connect failed:', e);
            status(_connectionErrorMsg(e), 'error');
        }
    });

    startBtn?.addEventListener('click', () => {
        emit('game:start', { mapSize: _selectedMapSize });
    });

    backBtn?.addEventListener('click', () => {
        screen.classList.add('hidden');
        document.getElementById('start-screen')?.classList.remove('hidden');
    });

    // ── Socket events ──────────────────────────────────────────────────────────

    on('lobby:created', ({ code, players, hostId }) => {
        mpState.roomCode = code;
        mpState.isHost   = true;
        if (codeDisplay) codeDisplay.textContent = code;
        infoEl?.classList.remove('hidden');
        status(`Room created — share code: ${code}`, 'ok');
        renderPlayers(players, hostId);
    });

    on('lobby:joined', ({ code, players, hostId }) => {
        mpState.roomCode = code;
        mpState.isHost   = (mpState.myId === hostId);
        if (codeDisplay) codeDisplay.textContent = code;
        infoEl?.classList.remove('hidden');
        status(`Joined room ${code}`, 'ok');
        renderPlayers(players, hostId);
    });

    on('lobby:update', ({ players, hostId }) => {
        mpState.isHost = (mpState.myId === hostId);
        renderPlayers(players, hostId);
        status('Player list updated.', 'ok');
    });

    on('lobby:error', ({ message }) => status(message, 'error'));

    on('game:start', (data) => {
        // data = { seed, spawnIndex, players, hostId, mapSize }
        screen.classList.add('hidden');

        // Register all other players in mpState so sprites can be created later
        for (const p of data.players) {
            if (p.id !== mpState.myId) upsertPlayer(p.id, { name: p.name });
        }

        onGameStart(data);
    });
}
