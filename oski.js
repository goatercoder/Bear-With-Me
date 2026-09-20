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

  // Injuries, in the order they appear as health drops. Cumulative.
  const STAGES = [
    { below: 85, name: 'bleeding eyes', patches: [
      [7, 6, 'wRR'], [7, 15, 'RRw'],                       // eyes fill with blood
      [8, 7, 'R'], [9, 7, 'R'], [10, 7, 'r'], [11, 7, 'r'], // blood pours down from the left eye
      [8, 16, 'R'], [9, 16, 'R'], [10, 16, 'r'], [11, 16, 'r'], // ...and the right eye
      [5, 15, 'vvv'],                                      // bruise
    ] },
    { below: 65, name: 'bleeding', patches: [
      [3, 8, 'R'], [4, 9, 'R'], [5, 10, 'r'], [6, 10, 'r'],  // gash on the forehead
      [0, 4, '___'], [1, 4, '_'], [1, 5, 'R'], [2, 5, 'r'], // torn left ear
      [14, 17, 'R'], [15, 17, 'R'], [16, 17, 'r'],         // blood from the mouth
      [13, 10, 'k'], [13, 13, 'k'],                        // teeth knocked out
      [20, 14, 'k'], [21, 14, 'kk'], [22, 15, 'k'], [19, 4, 'rr'], [20, 4, 'r'], // sweater ripped, bloody
      [23, 5, 'rrr'], [23, 15, 'rrrr'],                    // blood pooling underneath
    ] },
    { below: 40, name: 'broken', patches: [
      [6, 6, 'kRk'], [7, 6, 'RkR'],                        // left eye X'd out
      [2, 12, 'RR'], [3, 12, 'rr'], [4, 13, 'r'], [5, 13, 'r'], // deep gash on the head
      [20, 21, 'w'], [21, 21, 'w'], [21, 20, 'R'],         // bone showing on the right paw
      [18, 15, 'r'], [11, 8, 'R'], [12, 8, 'r'],           // more blood
      [23, 2, 'rrrrrrrrrrrrrrrrrrrr'],                     // pool spreads
    ] },
    { below: 18, name: 'dying', patches: [
      [3, 14, 'wwww'], [4, 14, 'wwwww'], [5, 15, 'wwww'], [4, 16, 'k'], [3, 17, 'k'], [2, 15, 'R'], // skull exposed
      [20, 1, '__'], [21, 1, '__'], [22, 1, '__'], [20, 3, 'R'], [21, 3, 'R'], [22, 3, 'r'], // left arm gone
      [20, 6, 'w'], [21, 6, 'w'], [20, 8, 'w'], [21, 8, 'w'], [20, 7, 'r'], [21, 7, 'r'],   // ribs through the sweater
      [15, 12, 'pp'], [16, 12, 'pp'], [16, 11, 'r'],       // tongue hanging out
      [15, 15, 'kwk'], [7, 16, 'kw'],                      // right eye going
      [22, 2, 'rrrrrrrrrrrrrrrrrrrr'],                     // big pool of blood
    ] },
  ];

  const DEAD_PATCHES = [
    [6, 15, 'kwk'], [7, 15, 'wkw'],                        // both eyes X
    [12, 7, 'kkkkkkkkkk'], [13, 7, 'LLLLLLLLLL'], [14, 8, 'LLLLLLLL'], // mouth shut
    [21, 4, 'rrrrrrrrrrrrrrrr'],                           // pool spreads
  ];

  // The Stanford Tree, as a pine: three tiers of boughs, a trunk, and a face.
  const TREE = [
    '.......gg.......',
    '......gGGg......',
    '.....gGGGGg.....',
    '....gGGGGGGg....',
    '......gGGg......',
    '.....gGGGGg.....',
    '....gGGrGGGg....',
    '...gGGGGGGGGg...',
    '.....gGGGGg.....',
    '....gGGGGGGg....',
    '...gGGGGGGGGg...',
    '..gGGwwGGwwGGg..',
    '..gGGwkGGwkGGg..',
    '.gGGGGGGGGGGGGg.',
    '.gGGGrrrrrrGGGg.',
    '.gGGGrRRRRrGGGg.',
    'gGGGGrRRRRrGGGGg',
    'gGGGGGrrrrGGGGGg',
    'gGGrGGGGGGGGrGGg',
    '.gggggggggggggg.',
    '.......tT.......',
    '.......tT.......',
    '.......tT.......',
    '....tttttttt....',
  ];
  const TREE_PALETTE = { g: '#14532d', G: '#2e8b3d', w: '#ffffff', k: '#111111', r: '#8c1515', R: '#d3202a', t: '#4a2f14', T: '#7a4a1f' };

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

  /** Compose the 24x24 grid for a given health/alive state. */
  function compose(health, alive) {
    const grid = BASE.map(r => r.split(''));
    const apply = (patches) => { for (const [row, col, chars] of patches) for (let i = 0; i < chars.length; i++) grid[row][col + i] = chars[i]; };
    const n = alive ? stageFor(health) : STAGES.length;
    for (let i = 0; i < n; i++) apply(STAGES[i].patches);
    if (!alive) apply(DEAD_PATCHES);
    return grid.map(r => r.join(''));
  }

  const cache = new Map();

  function renderGrid(rows, palette, scale, doc) {
    const c = (doc || document).createElement('canvas');
    c.width = rows[0].length * scale; c.height = rows.length * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === '_') continue;
      ctx.fillStyle = palette[ch] || '#ff00ff';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    return c;
  }

  /** Pre-render a composed grid at a pixel scale to an offscreen canvas. */
  function sprite(health, alive, scale, doc) {
    const stage = alive ? stageFor(health) : 'dead';
    const key = `oski|${stage}|${scale}`;
    if (!cache.has(key)) cache.set(key, renderGrid(compose(health, alive), PALETTE, scale, doc));
    return cache.get(key);
  }
  function treeSprite(scale, doc) {
    const key = `tree|${scale}`;
    if (!cache.has(key)) cache.set(key, renderGrid(TREE, TREE_PALETTE, scale, doc));
    return cache.get(key);
  }

  /** Canvas width needed for Oski alone or Oski + the Tree at a scale. */
  function widthFor(scale, tree) { return (tree ? 24 + 14 : 24) * scale + 2 * scale; }

  /**
   * Draw Oski (and the Tree, if he's being attacked) into a canvas.
   * opts: { tree: bool, hitAt: timestamp of the last instant hit, scale }
   * Oski is always anchored to the right edge so the Tree can walk in from the left.
   */
  function draw(canvas, health, alive, t, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const scale = opts.scale || Math.max(1, Math.floor(canvas.height / 26));
    const doc = canvas.ownerDocument;
    const img = sprite(health, alive, scale, doc);
    const stage = alive ? stageFor(health) : 5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x0 = canvas.width - img.width - scale;
    let bob = 0, shake = 0;
    if (alive) {
      const rate = stage >= 3 ? 220 : 700;                          // panting when badly hurt
      bob = Math.round(Math.sin(t / rate) * (stage >= 3 ? 0.6 : 1) * scale);
      if (stage >= 4 && Math.floor(t / 90) % 7 === 0) shake = (Math.floor(t / 30) % 2 ? 1 : -1) * scale; // twitch
    }
    const y0 = Math.floor((canvas.height - img.height) / 2) + bob;

    // the Tree lunges at him once a second while you're on a taboo site
    let hit = false;
    if (opts.tree && alive) {
      const tree = treeSprite(scale, doc);
      const p = (t % 1000) / 1000;
      const lunge = p < 0.12 ? p / 0.12 : p < 0.3 ? 1 - (p - 0.12) / 0.18 : 0;
      hit = p >= 0.1 && p < 0.35;
      const tx = x0 - tree.width + 2 * scale + Math.round(lunge * 5 * scale);
      const ty = Math.floor((canvas.height - tree.height) / 2) + Math.round(Math.sin(t / 250) * scale);
      ctx.save();
      ctx.translate(tx + tree.width / 2, ty + tree.height);
      ctx.rotate(lunge * 0.35);
      ctx.drawImage(tree, -tree.width / 2, -tree.height);
      ctx.restore();
      if (hit) shake += (Math.floor(t / 40) % 2 ? 1 : -1) * scale;
    }

    if (!alive) ctx.filter = 'saturate(0.25) brightness(0.8)';
    ctx.drawImage(img, x0 + shake, y0);
    ctx.filter = 'none';

    // blood: drips from the wounds, steady
    if (alive && stage >= 1) {
      const spots = [[8, 8], [17, 8], [10, 4], [17, 15], [13, 13], [9, 2]];
      const drips = Math.min(spots.length, stage + 1);
      for (let i = 0; i < drips; i++) {
        const [col, row] = spots[i];
        const period = 1100 + i * 300;
        const p = ((t + i * 430) % period) / period;
        const dy = Math.floor(p * 9 * scale);
        ctx.fillStyle = PALETTE.R;
        ctx.globalAlpha = 1 - p * 0.6;
        ctx.fillRect(x0 + col * scale, y0 + row * scale + dy, scale, scale);
      }
      ctx.globalAlpha = 1;
    }
    // blood: a burst when he's hit (entering a taboo site, or a Tree lunge)
    const sinceHit = opts.hitAt ? t - opts.hitAt : Infinity;
    if (alive && (sinceHit < 700 || hit)) {
      const p = hit ? ((t % 1000) / 1000 - 0.1) / 0.25 : sinceHit / 700;
      const cx = x0 + 12 * scale, cy = y0 + 8 * scale;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4, d = (2 + (i % 4)) * scale * (0.4 + p * 2.2);
        ctx.fillStyle = i % 2 ? PALETTE.R : PALETTE.r;
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d + p * p * 6 * scale), scale, scale);
      }
      ctx.globalAlpha = 1;
    }
    if (!alive && Math.floor(t / 600) % 2 === 0) {
      ctx.fillStyle = PALETTE.k;   // a fly
      const fx = x0 + (12 + Math.sin(t / 300) * 6) * scale, fy = y0 + (4 + Math.cos(t / 420) * 3) * scale;
      ctx.fillRect(fx, fy, scale, scale);
    }
  }

  root.Oski = { PALETTE, BASE, STAGES, TREE, stageFor, stageName, compose, sprite, treeSprite, widthFor, draw };
})(typeof globalThis !== 'undefined' ? globalThis : this);
