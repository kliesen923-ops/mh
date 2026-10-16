const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function lockLandscape() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

// Must be called from a user gesture (tap/click), or the browser rejects it.
function enterFullscreen() {
    if (isFullscreen()) return;
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return;
    const result = request.call(root, { navigationUI: 'hide' });
    if (result && result.then) result.then(lockLandscape).catch(() => {});
    else lockLandscape();
}

function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit && isFullscreen()) exit.call(document);
}

function requestGameFullscreen() {
    if (isTouchDevice) enterFullscreen();
}

function updateFullscreenButton() {
    const button = document.getElementById('btn-fullscreen');
    if (!button) return;
    const active = isFullscreen();
    button.textContent = active ? '✕' : '⛶';
    button.setAttribute('aria-label', active ? '전체화면 종료' : '전체화면');
}

document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) {
    document.getElementById('btn-fullscreen')?.classList.add('hidden');
}
