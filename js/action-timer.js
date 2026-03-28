/**
 * action-timer.js
 * Animated circular progress timer for AP-costing actions.
 * Duration: AP_cost × CONFIG.ACTION_TIMER_SECS_PER_AP seconds of real time.
 */
import { CONFIG } from './config.js';

const R    = 40;
const CIRC = 2 * Math.PI * R;

let _el          = null;
let _raf         = null;
let _active      = false;
let _instantMode = false;

/** True while a timer is running — use to gate input. */
export function isTimerActive() { return _active; }

/** True when instant mode is on (timers are bypassed). */
export function isInstantMode() { return _instantMode; }

/** Enable or disable instant-action mode. */
export function setInstantMode(v) { _instantMode = !!v; }

/**
 * Start an action timer.
 * @param {number}   apCost     AP cost (controls duration)
 * @param {string}   label      Text shown inside the ring
 * @param {Function} onComplete Called when timer finishes naturally
 */
export function startActionTimer(apCost, label, onComplete) {
    if (_active) return;

    // Instant mode: skip animation, run callback immediately
    if (_instantMode) {
        if (onComplete) onComplete();
        return;
    }

    _active = true;
    _ensure();

    const secsPerAP = CONFIG.ACTION_TIMER_SECS_PER_AP ?? 5;
    const duration  = apCost * secsPerAP * 1000;

    const fill = _el.querySelector('.at-fill');
    _el.querySelector('.at-label').textContent = label;
    fill.style.strokeDashoffset = CIRC;
    _el.classList.remove('at-hidden');

    const start = performance.now();

    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        fill.style.strokeDashoffset = CIRC * (1 - t);
        if (t < 1) {
            _raf = requestAnimationFrame(tick);
        } else {
            _done();
            if (onComplete) onComplete();
        }
    }
    _raf = requestAnimationFrame(tick);
}

/** Cancel the active timer without triggering its callback. */
export function cancelActionTimer() {
    if (!_active) return;
    _done();
}

// ── internals ─────────────────────────────────────────────────────────────────

function _done() {
    _active = false;
    cancelAnimationFrame(_raf);
    _raf = null;
    if (_el) _el.classList.add('at-hidden');
}

function _ensure() {
    if (_el) return;

    if (!document.getElementById('at-style')) {
        const s = document.createElement('style');
        s.id = 'at-style';
        s.textContent = `
#at-overlay{
    position:fixed;inset:0;z-index:8500;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.52);pointer-events:all;
}
#at-overlay.at-hidden{display:none;}
.at-box{
    display:flex;flex-direction:column;align-items:center;gap:16px;
    background:rgba(16,12,7,.96);
    border:1px solid #7a5a28;border-radius:14px;
    padding:32px 44px;
    box-shadow:0 8px 48px rgba(0,0,0,.9),0 0 0 1px rgba(180,130,40,.15);
}
.at-svg{display:block;filter:drop-shadow(0 0 10px rgba(212,160,32,.35));}
.at-bg { stroke:#2a2010; }
.at-fill{ stroke:#d4a020; transition:none; }
.at-label{
    color:#c8b07a;font-size:.95em;font-family:inherit;
    letter-spacing:.06em;text-align:center;
    max-width:200px;line-height:1.45;
}`;
        document.head.appendChild(s);
    }

    _el = document.createElement('div');
    _el.id = 'at-overlay';
    _el.className = 'at-hidden';
    _el.innerHTML = `<div class="at-box">
        <svg class="at-svg" width="100" height="100" viewBox="0 0 100 100">
            <circle class="at-bg" cx="50" cy="50" r="${R}"
                fill="none" stroke-width="7"/>
            <circle class="at-fill" cx="50" cy="50" r="${R}"
                fill="none" stroke-width="7"
                stroke-dasharray="${CIRC.toFixed(2)}"
                stroke-dashoffset="${CIRC.toFixed(2)}"
                transform="rotate(-90 50 50)"/>
        </svg>
        <div class="at-label">Working…</div>
    </div>`;
    document.body.appendChild(_el);
}
