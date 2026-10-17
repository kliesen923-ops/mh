// Synthesized sound effects (no audio files). playSound(name) is safe to call any
// time: it does nothing until the first tap/key unlocks audio, or while muted.
const SOUND_THROTTLE_MS = { hit: 55, kill: 60, orb: 45, hurt: 120 };
const lastSoundAt = {};
let audioCtx = null;
let masterGain = null;
let soundMuted = false;
try { soundMuted = localStorage.getItem('mh_sound_muted') === '1'; } catch (e) { soundMuted = false; }

function unlockAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.35;
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

function tone(type, from, to, duration, volume, delay = 0) {
    const start = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

function noise(duration, volume, filterFrom, filterTo, delay = 0) {
    const start = audioCtx.currentTime + delay;
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), start + duration);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(start);
}

const SOUNDS = {
    hit: () => { noise(0.07, 0.35, 3000, 600); tone('square', 220, 120, 0.06, 0.08); },
    kill: () => { tone('triangle', 520, 880, 0.09, 0.18); noise(0.08, 0.15, 5000, 1500); },
    orb: () => tone('sine', 1100 + Math.random() * 300, 1700, 0.07, 0.12),
    hurt: () => { tone('sawtooth', 180, 70, 0.16, 0.2); noise(0.1, 0.2, 1200, 300); },
    heal: () => { tone('sine', 660, 990, 0.18, 0.16); tone('sine', 990, 1320, 0.18, 0.12, 0.08); },
    levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.14, 0.2, i * 0.07)),
    ult: () => { noise(0.35, 0.3, 6000, 300); tone('sawtooth', 300, 900, 0.3, 0.12); },
    slam: () => { tone('sine', 120, 35, 0.45, 0.5); noise(0.3, 0.35, 900, 100); },
    bossSpawn: () => { tone('sawtooth', 110, 98, 0.7, 0.25); tone('sawtooth', 165, 147, 0.7, 0.15); },
    bossDown: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, 0.22, i * 0.09)),
    death: () => [440, 349, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.22, 0.2, i * 0.14)),
};

function playSound(name) {
    if (soundMuted || !audioCtx || audioCtx.state !== 'running' || !SOUNDS[name]) return;
    const now = performance.now();
    const gap = SOUND_THROTTLE_MS[name] || 0;
    if (gap && now - (lastSoundAt[name] || 0) < gap) return;
    lastSoundAt[name] = now;
    try { SOUNDS[name](); } catch (e) { /* ignore audio errors */ }
}

// True when a world position is on screen, so far-away fights stay quiet.
function isOnScreen(x, y) {
    return x >= camera.x - 40 && x <= camera.x + canvas.width + 40 && y >= camera.y - 40 && y <= camera.y + canvas.height + 40;
}

function updateSoundButton() {
    const button = document.getElementById('btn-sound');
    if (!button) return;
    button.textContent = soundMuted ? '🔇' : '🔊';
    button.setAttribute('aria-label', soundMuted ? '소리 켜기' : '소리 끄기');
}

document.getElementById('btn-sound')?.addEventListener('click', () => {
    soundMuted = !soundMuted;
    try { localStorage.setItem('mh_sound_muted', soundMuted ? '1' : '0'); } catch (e) { /* ignore */ }
    updateSoundButton();
    unlockAudio();
});
updateSoundButton();
