import { CONFIG } from './config.js';
import { state, getHexData } from './state.js';
import { isInstantMode } from './action-timer.js';
import { applyDayEndCosts } from './survival-needs.js';
import { refillAP } from './action-points.js';
import { checkSpoilage } from './inventory.js';
import { addMessage, updateHUD } from './ui.js';
import { triggerNightEvents } from './events.js';
import { checkGroundLootExpiry } from './loot.js';
import { checkStorageSpoilage } from './storage.js';

export function endDay() {
    const p = state.player;
    const hexData = getHexData(p.q, p.r);

    // Check camp structures (directly on hexData, no import needed)
    const hasCampfire = !!(hexData && hexData.hasCamp &&
        hexData.campStructures.some(s => s.id === 'campfire'));
    const hasShelter = !!(hexData && hexData.hasCamp &&
        hexData.campStructures.some(s => s.id === 'shelter'));

    // Night rest energy
    _applyNightRest(hasCampfire, hasShelter);

    // Night events (storms, predators, theft)
    triggerNightEvents(p.q, p.r, hexData);

    // Daily survival costs + spoilage
    const result = applyDayEndCosts();
    checkSpoilage();
    checkStorageSpoilage();

    if (result.died) {
        import('./game-mode.js').then(mod => mod.checkGameOver());
        return;
    }

    state.player.day++;

    // Expire dropped ground loot (now that day has advanced)
    checkGroundLootExpiry();

    refillAP();
    addMessage(`Day ${state.player.day} begins.`, 'info');
    updateHUD();
    updateSunPosition();
}

function _applyNightRest(hasCampfire, hasShelter) {
    const p = state.player;
    let energyGain;
    let msg;

    if (hasCampfire && hasShelter) {
        energyGain = 70;
        msg = '🔥🏕️ The campfire and shelter give you a restful night. +70 energy.';
    } else if (hasCampfire) {
        energyGain = 50;
        msg = '🔥 The campfire crackles through the night. +50 energy.';
    } else if (hasShelter) {
        energyGain = 30;
        msg = '🏕️ Your shelter keeps you dry. +30 energy.';
    } else {
        energyGain = -10;
        msg = '🌑 You sleep exposed under the open sky. -10 energy.';
    }

    if (energyGain > 0) {
        p.energy = Math.min(p.maxEnergy, p.energy + energyGain);
        addMessage(msg, 'success');
    } else {
        p.energy = Math.max(0, p.energy + energyGain);
        addMessage(msg, 'warning');
    }
}

/**
 * Multiplayer-only night phase: runs all end-of-day effects but receives
 * the new day number from the server instead of incrementing locally.
 * Called when the server emits 'day:advance'.
 */
export function applyNightPhaseMP(newDay) {
    const p       = state.player;
    const hexData = getHexData(p.q, p.r);
    const hasCampfire = !!(hexData && hexData.hasCamp &&
        hexData.campStructures.some(s => s.id === 'campfire'));
    const hasShelter  = !!(hexData && hexData.hasCamp &&
        hexData.campStructures.some(s => s.id === 'shelter'));

    _applyNightRest(hasCampfire, hasShelter);
    triggerNightEvents(p.q, p.r, hexData);

    const result = applyDayEndCosts();
    checkSpoilage();
    checkStorageSpoilage();

    if (result.died) {
        import('./game-mode.js').then(mod => mod.checkGameOver());
        return;
    }

    // Server is authoritative for the day number
    p.day = newDay;

    checkGroundLootExpiry();
    refillAP();
    addMessage(`Day ${p.day} begins.`, 'info');
    updateHUD();
    updateSunPosition();
}

export function updateSunPosition() {
    const sunEl = document.getElementById('sun-circle');
    if (!sunEl) return;
    const p = state.player;
    const ratio = 1 - (p.ap / p.maxAp);
    const angle = Math.PI * ratio;
    const cx = 100 - 90 * Math.cos(angle);
    const cy = 100 - 90 * Math.sin(angle);
    sunEl.setAttribute('cx', cx.toFixed(1));
    sunEl.setAttribute('cy', cy.toFixed(1));
}

// =================== NIGHT PHASE ===================

const NIGHT_DURATION = 10000; // ms

/**
 * Play a 10-second night animation then call onDone.
 * If instant mode is active, skips the animation entirely.
 */
export function runNightPhase(onDone) {
    if (isInstantMode()) {
        onDone();
        return;
    }
    _playNightAnimation(onDone);
}

function _playNightAnimation(onDone) {
    // ── overlay ──────────────────────────────────────────────────────────────
    let overlay = document.getElementById('night-phase-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'night-phase-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:7000',
            'background:rgba(4,6,22,0)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'pointer-events:all',
            'transition:background 1.1s ease',
        ].join(';');
        const lbl = document.createElement('div');
        lbl.id = 'night-phase-label';
        lbl.style.cssText = [
            'color:#8899cc', 'font-size:1.2em', 'letter-spacing:.14em',
            'text-transform:uppercase', 'opacity:0',
            'transition:opacity 1.1s ease', 'user-select:none',
        ].join(';');
        lbl.textContent = '🌙  Night';
        overlay.appendChild(lbl);
        document.body.appendChild(overlay);
    }

    const moonEl = document.getElementById('moon-circle');
    const sunEl  = document.getElementById('sun-circle');
    const lbl    = document.getElementById('night-phase-label');

    // Show overlay & label
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'all';
    overlay.getBoundingClientRect(); // force layout flush
    overlay.style.background = 'rgba(4,6,22,0.80)';
    if (lbl) lbl.style.opacity = '1';

    // Hide sun, show moon at dawn position
    if (sunEl) sunEl.style.display = 'none';
    if (moonEl) {
        moonEl.style.display = '';
        moonEl.setAttribute('cx', '10');
        moonEl.setAttribute('cy', '100');
    }

    // ── animate moon along arc ────────────────────────────────────────────────
    const startTime = performance.now();

    function tick(now) {
        const t = Math.min((now - startTime) / NIGHT_DURATION, 1);
        if (moonEl) {
            const angle = Math.PI * t;
            const cx = 100 - 90 * Math.cos(angle);
            const cy = 100 - 90 * Math.sin(angle);
            moonEl.setAttribute('cx', cx.toFixed(1));
            moonEl.setAttribute('cy', cy.toFixed(1));
        }
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            // Fade out overlay
            if (lbl) lbl.style.opacity = '0';
            overlay.style.background = 'rgba(4,6,22,0)';
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.style.pointerEvents = 'none';
                if (moonEl) moonEl.style.display = 'none';
                if (sunEl) {
                    sunEl.style.display = '';
                    sunEl.setAttribute('cx', '10');
                    sunEl.setAttribute('cy', '100');
                }
                onDone();
            }, 1100);
        }
    }
    requestAnimationFrame(tick);
}

export function getDayPhaseText() {
    const p = state.player;
    const ratio = p.ap / p.maxAp;
    if (ratio > 0.85) return 'Dawn';
    if (ratio > 0.65) return 'Morning';
    if (ratio > 0.45) return 'Midday';
    if (ratio > 0.20) return 'Afternoon';
    return 'Dusk';
}
