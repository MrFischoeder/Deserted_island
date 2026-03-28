import { CONFIG } from './config.js';
import { state } from './state.js';
import { hexToPixel } from './grid.js';

/**
 * Animate player graphic from hex (fromQ,fromR) to (toQ,toR).
 * Calls onComplete() when done.
 */
export function animatePlayerMove(fromQ, fromR, toQ, toR, onComplete) {
    // Skip PixiJS animation when the canvas is hidden (location view is active)
    const canvas = document.getElementById('game-canvas');
    if (canvas && canvas.style.display === 'none') {
        state.isAnimating = false;
        if (onComplete) onComplete();
        return;
    }

    const from = hexToPixel(fromQ, fromR);
    const to   = hexToPixel(toQ,   toR);
    const duration = CONFIG.MOVE_ANIMATION_DURATION;
    let startTime = null;
    state.isAnimating = true;

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = easeInOut(t);

        const curX = from.x + (to.x - from.x) * ease;
        const curY = from.y + (to.y - from.y) * ease;

        if (state.playerGfx) {
            state.playerGfx.x = curX;
            state.playerGfx.y = curY;
        }

        // Smooth camera follow when zoomed into game-mode level
        const cam = state.cameraContainer;
        const app = state.app;
        if (cam && app && cam.scale.x >= 1.5) {
            const zoom = cam.scale.x;
            cam.x = app.renderer.width  / 2 - curX * zoom;
            cam.y = app.renderer.height / 2 - curY * zoom;
        }

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            if (state.playerGfx) {
                state.playerGfx.x = to.x;
                state.playerGfx.y = to.y;
            }
            state.isAnimating = false;
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(step);
}
