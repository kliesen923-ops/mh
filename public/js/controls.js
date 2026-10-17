const joyContainer = document.getElementById('joy-container'), joyStick = document.getElementById('joy-stick');
let joyId = null;
let aimMode = 'none';
function setMouseAimFromPoint(clientX, clientY) {
    if (joyId !== null || isChatting || isUpgrading || player.hp <= 0 || player.isStunned) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const worldX = (clientX - rect.left) / Math.max(0.0001, scaleX) + camera.x;
    const worldY = (clientY - rect.top) / Math.max(0.0001, scaleY) / VIEW_Y_SCALE + camera.y;
    const dx = worldX - player.x;
    const dy = worldY - player.y;
    if (dx === 0 && dy === 0) return;
    player.angle = Math.atan2(dy, dx);
    aimMode = 'mouse';
}
joyContainer.addEventListener('pointerdown', e => {
    if(gameState === 'PLAYING' && !isChatting && !isUpgrading && player.hp > 0 && !player.isStunned) {
        joyId = e.pointerId;
        joyContainer.setPointerCapture(e.pointerId);
        aimMode = 'touch';
    }
});
window.addEventListener('pointermove', e => {
    if(joyId === e.pointerId) {
        const r = joyContainer.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        // Travel reaches the ring's edge; the knob is moved in the container's unscaled pixels.
        const travel = r.width * 0.32, scale = r.width / joyContainer.offsetWidth;
        const d = Math.hypot(dx, dy);
        if(d > travel) { dx *= travel/d; dy *= travel/d; }
        joyStick.style.transform = `translate(${dx/scale}px, ${dy/scale}px)`;
        player.moveDir = { x: dx/travel, y: (dy/travel)/VIEW_Y_SCALE };
        aimMode = 'touch';
    }
});
window.addEventListener('pointerup', e => { if(joyId === e.pointerId) { joyId = null; joyStick.style.transform = 'translate(0,0)'; player.moveDir = { x: 0, y: 0 }; aimMode = 'none'; } });
window.addEventListener('mousemove', e => { setMouseAimFromPoint(e.clientX, e.clientY); });
window.addEventListener('mouseleave', () => { if (aimMode === 'mouse') aimMode = 'none'; });
const bind = (id, fn, end) => { const el = document.getElementById(id); if(!el) return; el.addEventListener('pointerdown', e => { e.preventDefault(); if(gameState === 'PLAYING' && !isChatting && !isUpgrading) fn(e); }); if(end) { el.addEventListener('pointerup', end); el.addEventListener('pointerleave', end); el.addEventListener('pointercancel', end); } };
bind('btn-attack', () => { attackHoldSources.add('button'); beginAttack(); }, () => { attackHoldSources.delete('button'); });
bind('btn-dodge', startDodge); bind('btn-guard', startGuard, releaseGuard); bind('btn-wire', startWire); bind('btn-ultimate', useUltimate);
let lastTime = 0; function loop(t) { if(!lastTime) lastTime = t; let dt = (t - lastTime)/1000; if(dt > 0.1) dt = 0.1; lastTime = t; update(dt); updateMobVisuals(dt); updateFloatingFx(dt); updateBossFx(dt); updateCooldownUI(); draw(); }
