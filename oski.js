/* oski.js — the 8-bit Oski sprite and his injuries.
 * Base sprite is a 24×24 character grid. Damage is drawn as cumulative overlay
 * patches: [row, col, chars] where each char replaces the base pixel and '_'
 * erases it. Stage N applies patches 1..N, so Oski gets steadily worse.
 * Shared by the corner window, the on-page overlay and the icon generator. */
(function (root) {
  'use strict';

  const PALETTE = {
    b: '#3b2412', // outline / dark fur
    B: '#8b5a2b', // fur
    L: '#e9c99b', // muzzle
    k: '#111111', // black
    w: '#ffffff', // white / teeth / bone
    p: '#e0507a', // tongue
    u: '#003262', // Berkeley blue
    y: '#fdb515', // California gold
    r: '#b3111b', // blood
    R: '#e8202c', // fresh blood
    v: '#4a1d6e', // bruise
    g: '#8a8f99', // bone shadow
  };

  const BASE = [
    '....bbb..........bbb....',
    '...bBBBb........bBBBb...',
    '...bBBBBbbbbbbbbBBBBb...',
    '...bBBBBBBBBBBBBBBBBb...',
    '....bBBBBBBBBBBBBBBb....',
    '...bBBBBBBBBBBBBBBBBb...',
    '..bBBBwwkBBBBBBkwwBBBb..',
    '..bBBBwkkBBBBBBkkwBBBb..',
    '..bBBBBBBLLLLLLBBBBBBb..',
    '..bBBBBLLLLLLLLLLBBBBb..',
    '..bBBBBLLLkkkkLLLBBBBb..',
    '..bBBBBLLLLkkLLLLBBBBb..',
    '..bBBBLkkkkkkkkkkLBBBb..',
    '..bBBBLkwwwwwwwwkLBBBb..',
    '..bBBBBLkkppppkkLBBBBb..',
    '...bBBBBLLkkkkLLBBBBb...',
    '....bBBBBBBBBBBBBBBb....',
    '.....bbbbbbbbbbbbbb.....',
    '...buuuuuuuuuuuuuuuub...',
    '..buuuuuuuyyyyuuuuuuub..',
    '.bBbuuuuuyyuuuuuuuuubBb.',
    '.bBbuuuuuyyuuuuuuuuubBb.',
    '.bBbuuuuuuyyyyuuuuuubBb.',
    '..bbbbbbbbbbbbbbbbbbbb..',
  ];

  // Injuries, in the order they appear as health drops.
  const STAGES = [
    { below: 80, name: 'bruised', patches: [
      [5, 15, 'vvv'], [6, 15, 'v'], [7, 18, 'v'],        // black eye
      [3, 8, 'r'], [4, 9, 'r'], [5, 10, 'r'],              // scratch on the forehead
      [13, 10, 'k'],                                       // a tooth knocked out
    ] },
    { below: 60, name: 'bleeding', patches: [
      [6, 10, 'R'], [7, 10, 'r'], [8, 10, 'r'],            // scratch bleeds down the face
      [0, 4, '___'], [1, 4, '_'], [1, 5, 'r'],             // torn left ear
      [14, 17, 'R'], [15, 17, 'r'], [16, 17, 'r'],         // blood from the mouth
      [13, 13, 'k'],                                       // another tooth gone
      [20, 14, 'k'], [21, 14, 'kk'], [22, 15, 'k'],        // sweater ripped
    ] },
    { below: 40, name: 'broken', patches: [
      [6, 6, 'kwk'], [7, 6, 'wkw'],                        // left eye X'd out
      [2, 12, 'RR'], [3, 12, 'rr'], [4, 13, 'r'], [5, 13, 'r'], // deep gash on the head
      [20, 21, 'w'], [21, 21, 'w'], [21, 20, 'R'],         // bone showing on the right paw
      [19, 4, 'rr'], [20, 4, 'r'], [18, 15, 'r'],          // blood on the sweater
      [23, 5, 'rrr'], [23, 15, 'rrrr'],                    // blood pooling underneath
      [11, 7, 'R'], [12, 7, 'r'],                          // muzzle cut
    ] },
    { below: 20, name: 'dying', patches: [
      [3, 14, 'wwww'], [4, 14, 'wwwww'], [5, 15, 'wwww'], [4, 16, 'k'], [3, 17, 'k'], // skull exposed
      [20, 1, '__'], [21, 1, '__'], [22, 1, '__'], [20, 3, 'R'], [21, 3, 'R'], [22, 3, 'r'], // left arm gone
      [20, 6, 'w'], [21, 6, 'w'], [20, 8, 'w'], [21, 8, 'w'], [20, 7, 'r'], [21, 7, 'r'],   // ribs through the sweater
      [15, 12, 'pp'], [16, 12, 'pp'], [16, 11, 'r'],       // tongue hanging out
      [15, 15, 'kwk'], [7, 16, 'kw'],                      // right eye going
      [23, 2, 'rrrrrrrrrrrrrrrrrrrr'],                     // big pool of blood
    ] },
  ];

  const DEAD_PATCHES = [
    [6, 15, 'kwk'], [7, 15, 'wkw'],                        // both eyes X
    [12, 7, 'kkkkkkkkkk'], [13, 7, 'LLLLLLLLLL'], [14, 8, 'LLLLLLLL'], // mouth shut
    [22, 2, 'rrrrrrrrrrrrrrrrrrrr'],                       // pool spreads
  ];

  /** Index of the worst stage reached at this health (0 = unharmed, 4 = dying). */
  function stageFor(health) {
    let n = 0;
    for (const s of STAGES) if (health < s.below) n++;
    return n;
  }
  function stageName(health, alive) {
    if (!alive) return 'dead';
    const n = stageFor(health);
    return n === 0 ? 'healthy' : STAGES[n - 1].name;
  }

  /** Compose the 24×24 grid for a given health/alive state. */
  function compose(health, alive) {
    const grid = BASE.map(r => r.split(''));
    const apply = (patches) => { for (const [row, col, chars] of patches) for (let i = 0; i < chars.length; i++) grid[row][col + i] = chars[i]; };
    const n = alive ? stageFor(health) : STAGES.length;
    for (let i = 0; i < n; i++) apply(STAGES[i].patches);
    if (!alive) apply(DEAD_PATCHES);
    return grid.map(r => r.join(''));
  }

  const cache = new Map();

  /** Pre-render a composed grid at a pixel scale to an offscreen canvas. */
  function sprite(health, alive, scale, doc) {
    const stage = alive ? stageFor(health) : 'dead';
    const key = `${stage}|${scale}`;
    if (cache.has(key)) return cache.get(key);
    const rows = compose(health, alive);
    const c = (doc || document).createElement('canvas');
    c.width = 24 * scale; c.height = 24 * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === '_') continue;
      ctx.fillStyle = PALETTE[ch] || '#ff00ff';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    cache.set(key, c);
    return c;
  }

  /**
   * Draw Oski into a canvas with a little life: breathing bob, twitching when
   * dying, drips of blood when bleeding, grey when dead. `t` is a timestamp in ms.
   */
  function draw(canvas, health, alive, t) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const scale = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 26));
    const img = sprite(health, alive, scale, canvas.ownerDocument);
    const stage = alive ? stageFor(health) : 5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x0 = Math.floor((canvas.width - img.width) / 2);
    let bob = 0, shake = 0;
    if (alive) {
      const rate = stage >= 3 ? 220 : 700;                          // panting when badly hurt
      bob = Math.round(Math.sin(t / rate) * (stage >= 3 ? 0.6 : 1) * scale);
      if (stage >= 4 && Math.floor(t / 90) % 7 === 0) shake = (Math.floor(t / 30) % 2 ? 1 : -1) * scale; // twitch
    }
    const y0 = Math.floor((canvas.height - img.height) / 2) + bob;
    if (!alive) ctx.filter = 'saturate(0.25) brightness(0.8)';
    ctx.drawImage(img, x0 + shake, y0);
    ctx.filter = 'none';
    // drips
    if (alive && stage >= 2) {
      const drips = stage >= 4 ? 4 : stage >= 3 ? 3 : 1;
      const spots = [[10, 6], [17, 15], [13, 13], [9, 3]];
      for (let i = 0; i < drips; i++) {
        const [col, row] = spots[i];
        const period = 1400 + i * 350;
        const p = ((t + i * 500) % period) / period;
        const dy = Math.floor(p * 8 * scale);
        ctx.fillStyle = PALETTE.R;
        ctx.globalAlpha = 1 - p * 0.6;
        ctx.fillRect(x0 + col * scale, y0 + row * scale + dy, scale, scale);
      }
      ctx.globalAlpha = 1;
    }
    if (!alive && Math.floor(t / 600) % 2 === 0) {
      // a fly
      ctx.fillStyle = PALETTE.k;
      const fx = x0 + (12 + Math.sin(t / 300) * 6) * scale, fy = y0 + (4 + Math.cos(t / 420) * 3) * scale;
      ctx.fillRect(fx, fy, scale, scale);
    }
  }

  root.Oski = { PALETTE, BASE, STAGES, stageFor, stageName, compose, sprite, draw };
})(typeof globalThis !== 'undefined' ? globalThis : this);
