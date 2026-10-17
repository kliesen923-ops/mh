// Character look options and the standing character drawn in a 3/4 view.
// The options follow RuneRaidU's appearance system (hair style, hair color, skin
// tone, outfit), and the color ramps come from its HumanoidParts; the drawing is mh's own.
const HERO_LOOK_ROWS = [
    { key: 'hair', label: '머리 모양', values: ['짧은 머리', '긴 머리', '묶은 머리'] },
    { key: 'hairColor', label: '머리색', values: ['밤색', '금색', '흑색', '적갈색'] },
    { key: 'skinColor', label: '피부색', values: ['밝은색', '중간색', '짙은색'] },
    { key: 'outfit', label: '옷 색', values: ['주황', '청록', '보라', '빨강', '파랑', '초록'] },
];
// [shadow, base, light] for each option.
const HERO_HAIR_TONES = [
    ['#483630', '#805c46', '#b88c61'],
    ['#775335', '#be914b', '#f0ce7d'],
    ['#252b37', '#434954', '#686b78'],
    ['#623d3a', '#a75d4b', '#d49267'],
];
const HERO_SKIN_TONES = [
    ['#be8365', '#eabd91', '#ffdcb0'],
    ['#9b6150', '#cf926e', '#edd0a0'],
    ['#6c443c', '#a36d4e', '#cf9a70'],
];
const HERO_OUTFIT_TONES = [
    ['#a8571a', '#e67e22', '#f5a65b'],
    ['#244751', '#4b8080', '#a0bbb0'],
    ['#393048', '#715778', '#b194b0'],
    ['#7b241c', '#c0392b', '#e57368'],
    ['#1b4f72', '#2e86c1', '#7fb3d5'],
    ['#1e7b45', '#27ae60', '#7dcea0'],
];
const HERO_STUN_TONES = ['#6c3483', '#9b59b6', '#c39bd3'];
const HERO_PANTS = '#34495e';
const HERO_SHOES = '#1f2a36';
// In-game size of the figure relative to drawHeroFigure's units.
const HERO_FIGURE_SCALE = 1.2;
// How high the hands (and so the weapon) sit above the ground point, in figure units.
const HERO_HAND_LIFT = 22;
const HERO_HEAD_Y = -44;

function normalizeHeroLook(look) {
    const src = look && typeof look === 'object' ? look : {};
    const result = {};
    HERO_LOOK_ROWS.forEach((row) => {
        const n = Math.floor(Number(src[row.key]));
        result[row.key] = Number.isFinite(n) ? Math.max(0, Math.min(row.values.length - 1, n)) : 0;
    });
    return result;
}

function getHeroSkinTone(look) {
    return HERO_SKIN_TONES[normalizeHeroLook(look).skinColor][1];
}

function heroRoundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
}

// Draws the standing character with its feet at (0, 0), in screen-upright space.
// facing is the world-space angle the character looks toward.
function drawHeroFigure(g, rawLook, facing, state = {}) {
    const look = normalizeHeroLook(rawLook);
    const hair = HERO_HAIR_TONES[look.hairColor];
    const skin = HERO_SKIN_TONES[look.skinColor];
    const outfit = state.stunned ? HERO_STUN_TONES : HERO_OUTFIT_TONES[look.outfit];
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);
    const towardCamera = fy > -0.25;
    const hx = fx * 1.5;
    const hy = HERO_HEAD_Y;
    const swing = state.moving ? Math.sin((state.t || Date.now()) / 80) * 3 : 0;

    const drawLongHairBack = () => {
        g.fillStyle = hair[0];
        g.beginPath(); g.ellipse(hx - fx * 2, hy + 12, 13, 15, 0, 0, Math.PI * 2); g.fill();
    };
    const drawPonytail = () => {
        const px = hx - fx * 12;
        const py = hy + (towardCamera ? -2 : 3);
        g.fillStyle = hair[0];
        g.beginPath(); g.ellipse(px, py + 7, 4, 9, -fx * 0.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = hair[1];
        g.beginPath(); g.ellipse(px, py, 4.5, 4, 0, 0, Math.PI * 2); g.fill();
    };

    if (towardCamera && look.hair === 1) drawLongHairBack();
    if (towardCamera && look.hair === 2) drawPonytail();

    // Legs and shoes; the stepping leg lifts.
    [-5, 5].forEach((lx, i) => {
        const lift = Math.max(0, i === 0 ? swing : -swing);
        g.fillStyle = HERO_PANTS;
        heroRoundRect(g, lx - 3.5, -15 - lift, 7, 13, 3); g.fill();
        g.fillStyle = HERO_SHOES;
        heroRoundRect(g, lx - 4, -4 - lift, 8, 4, 2); g.fill();
    });

    // Torso, belt and sleeves.
    g.fillStyle = outfit[1];
    heroRoundRect(g, -11, -33, 22, 21, 7); g.fill();
    g.fillStyle = outfit[0];
    heroRoundRect(g, -11, -18, 22, 6, 3); g.fill();
    g.fillStyle = outfit[2];
    heroRoundRect(g, -8 + fx * 2, -31, 7, 9, 3); g.fill();
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    g.fillRect(-11, -19, 22, 2);
    g.fillStyle = outfit[0];
    g.beginPath(); g.ellipse(-12, -27, 3.5, 6, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(12, -27, 3.5, 6, -0.2, 0, Math.PI * 2); g.fill();

    // Head.
    g.fillStyle = skin[1];
    g.beginPath(); g.arc(hx, hy, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = skin[2];
    g.beginPath(); g.arc(hx - 4, hy - 3, 5, 0, Math.PI * 2); g.fill();

    if (towardCamera) {
        // Hair cap with a fringe, pushed to the back of the head when looking sideways.
        g.fillStyle = hair[1];
        g.beginPath(); g.arc(hx, hy - 1, 12.6, Math.PI * 1.02, Math.PI * 1.98); g.fill();
        g.beginPath(); g.ellipse(hx - fx * 5, hy - 4, 10 - Math.abs(fx) * 3, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = hair[2];
        g.beginPath(); g.ellipse(hx - fx * 3 - 3, hy - 9, 4, 2, -0.3, 0, Math.PI * 2); g.fill();
        if (look.hair === 1) {
            g.fillStyle = hair[1];
            if (Math.abs(fx) < 0.6) {
                // Facing the camera: locks frame both sides of the face.
                g.beginPath(); g.ellipse(hx - 9, hy + 6, 4, 10, 0, 0, Math.PI * 2); g.fill();
                g.beginPath(); g.ellipse(hx + 9, hy + 6, 4, 10, 0, 0, Math.PI * 2); g.fill();
            } else {
                // Side view: the hair falls from the back of the head.
                g.beginPath(); g.ellipse(hx - fx * 7, hy + 5, 6, 12, 0, 0, Math.PI * 2); g.fill();
            }
        }
        // Eyes look the way the character faces.
        g.fillStyle = '#1b1f2a';
        const ex = hx + fx * 5;
        if (Math.abs(fx) > 0.85) {
            g.beginPath(); g.ellipse(ex + fx * 2, hy + 1, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill();
        } else {
            g.beginPath(); g.ellipse(ex - 4, hy + 1, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.ellipse(ex + 4, hy + 1, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill();
        }
    } else {
        // Seen from behind: hair covers the head.
        g.fillStyle = hair[1];
        g.beginPath(); g.arc(hx, hy, 12.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = hair[2];
        g.beginPath(); g.ellipse(hx - 3, hy - 6, 5, 3, -0.3, 0, Math.PI * 2); g.fill();
        if (look.hair === 1) {
            g.fillStyle = hair[1];
            heroRoundRect(g, hx - 11, hy + 2, 22, 16, 7); g.fill();
            g.fillStyle = hair[0];
            g.fillRect(hx - 1, hy + 4, 2, 13);
        }
        if (look.hair === 2) drawPonytail();
    }
}
