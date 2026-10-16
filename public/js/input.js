window.addEventListener('keydown', e => {
    if (gameState === 'TITLE' && e.target && e.target.id === 'nickname-input') {
        if (e.code === 'Enter') startGame();
        return;
    }
    if (gameState !== 'PLAYING') return;
    if (isChatting && e.code !== 'Enter') return;
    if (isUpgrading) return;
    if (e.code === 'Enter') { if (!isChatting) { isChatting = true; document.getElementById('chat-container').classList.add('active'); document.getElementById('chat-input-container').style.display = 'block'; Object.keys(keys).forEach(k => keys[k] = false); setTimeout(() => document.getElementById('chat-input').focus(), 10); e.preventDefault(); } return; }
    if (player.hp <= 0 || player.isStunned) return;
    keys[e.code] = true; if(e.code === 'Space') startDodge(); if(e.code === 'ShiftLeft') startGuard();
    if(e.code === 'KeyR') useUltimate();
    if(e.code === 'KeyF') beginAttack();
});
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.code === 'Enter') { if (e.target.value.trim()) socket.emit('chatMessage', e.target.value); e.target.value = ''; e.target.blur(); isChatting = false; document.getElementById('chat-container').classList.remove('active'); document.getElementById('chat-input-container').style.display = 'none'; e.preventDefault(); e.stopPropagation(); } });
window.addEventListener('keyup', e => { keys[e.code] = false; if(e.code === 'ShiftLeft') releaseGuard(); });
const attackHoldSources = new Set();
window.addEventListener('mousedown', e => { if(canStartAttack()) { if(e.button === 0) { attackHoldSources.add('mouse'); beginAttack(); } if(e.button === 2) { e.preventDefault(); startWire(); } } });
window.addEventListener('mouseup', e => { if(e.button === 0) attackHoldSources.delete('mouse'); });
window.addEventListener('contextmenu', e => e.preventDefault());
