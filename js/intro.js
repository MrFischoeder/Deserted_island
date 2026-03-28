import { state } from './state.js';

export function showIntro(q, r) {
    if (state.introShown) return;

    state.introShown = true;
    state.activeModal = 'intro-modal';

    const modal = document.getElementById('intro-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('intro-btn-continue')?.addEventListener('click', () => {
        modal.classList.add('hidden');
        state.activeModal = null;
        state.startingBeachTutorialDone = true;
    }, { once: true });
}
