/* sprites.js — Focusling pixel art.
 * Every sprite is a grid of characters; each character maps to a colour in the
 * sprite's palette and '.' is transparent. Pets are 16×16 and face right.
 * Add a new avatar here + one entry in Core.AVATARS and it shows up in the picker. */
(function (root) {
  'use strict';

  const PETS = {
    osci: {
      // Osci Bear — evolves as it levels up. Base palette; stages may add colours.
      palette: { b: '#5a3a1e', B: '#a86b32', L: '#f2d3a5', k: '#1c1410', c: '#39d4ff', p: '#e88a8a' },
      shot: '#39d4ff',
      stages: [
        {
          level: 1, name: 'Osci Cub', blurb: 'A tiny cub with a big appetite for knowledge.',
          rows: [
            '................',
            '................',
            '....bb....bb....',
            '...bBBb..bBBb...',
            '...bBBbbbbBBb...',
            '..bBBBBBBBBBBb..',
            '..bBBkBBBBkBBb..',
            '..bBpBBLLBBpBb..',
            '..bBBBLLkLLBBb..',
            '...bBBBLLLBBb...',
            '...bBBBBBBBBb...',
            '..bBBBLcLcLBBb..',
            '..bBBBBLLLBBBb..',
            '...bBBb..bBBb...',
            '...bbbb..bbbb...',
            '................',
          ],
        },
        {
          level: 5, name: 'Osci Bear', blurb: 'All grown up. Runs on honey and clean sine waves.',
          rows: [
            '...bb......bb...',
            '..bBBb....bBBb..',
            '..bBBbbbbbbBBb..',
            '..bBBBBBBBBBBb..',
            '.bBBBBBBBBBBBBb.',
            '.bBBkBBBBBBkBBb.',
            '.bBBBBBLLLBBBBb.',
            '.bBpBBLLLLLBBpb.',
            '.bBBBBLLkLLBBBb.',
            '..bBBBBLLLBBBb..',
            '..bbBBBBBBBBbb..',
            '.bBBBLcLLLcLLBb.',
            '.bBBBLLcLcLcLBb.',
            '.bBBBBLLLLLBBBb.',
            '..bBBb....bBBb..',
            '..bbbb....bbbb..',
          ],
        },
        {
          level: 10, name: 'Scholar Osci', blurb: 'Glasses, scarf, and a reading list longer than yours.',
          palette: { f: '#2b2b2b', s: '#3b82f6' },
          rows: [
            '...bb......bb...',
            '..bBBb....bBBb..',
            '..bBBbbbbbbBBb..',
            '..bBBBBBBBBBBb..',
            '.bBfffBBBBfffBb.',
            '.bBfkfBffBfkfBb.',
            '.bBBfffLLLfffBb.',
            '.bBpBBLLLLLBBpb.',
            '.bBBBBLLkLLBBBb.',
            '..bBBBBLLLBBBb..',
            '..bbssssssssbb..',
            '.bBBBLcLLLcLLBb.',
            '.bBBBLLcLcLcLBb.',
            '.bBBBBLLLLLBBBb.',
            '..bBBb....bBBb..',
            '..bbbb....bbbb..',
          ],
        },
        {
          level: 18, name: 'Knight Osci', blurb: 'Armoured against distraction. The aliens fear the helmet.',
          palette: { m: '#b4bcc9', d: '#5c6370', r: '#ff4d6d' },
          rows: [
            '...dd..rr..dd...',
            '..dmmd.rr.dmmd..',
            '..dmmddddddmmd..',
            '..dmmmmmmmmmmd..',
            '.dmmmmmmmmmmmmd.',
            '.bBBkBBBBBBkBBb.',
            '.bBBBBBLLLBBBBb.',
            '.bBpBBLLLLLBBpb.',
            '.bBBBBLLkLLBBBb.',
            '..bBBBBLLLBBBb..',
            '..ddmmmmmmmmdd..',
            '.dmmmmcmmmcmmmd.',
            '.dmmmmmcmcmcmmd.',
            '.dmmmmmmmmmmmmd.',
            '..bBBb....bBBb..',
            '..bbbb....bbbb..',
          ],
        },
        {
          level: 28, name: 'Cosmic Osci', blurb: 'Made of starlight and focus. The final form.',
          palette: { b: '#8a5a00', B: '#f5b301', L: '#fff1c2', w: '#ffffff', c: '#39d4ff' },
          glow: '#ffd166',
          rows: [
            '...bb......bb...',
            '..bBBb....bBBb..',
            '..bBBbbbbbbBBb..',
            '..bBBwBBBBBBBb..',
            '.bBBBBBBBBBwBBb.',
            '.bBBkBBBBBBkBBb.',
            '.bBBBBBLLLBBBBb.',
            '.bBpBBLLLLLBBpb.',
            '.bBBBBLLkLLBBBb.',
            '..bBBBBLLLBBBb..',
            '..bbBBBBBBBBbb..',
            '.bBwBLcLLLcLLBb.',
            '.bBBBLLcLcLcLBb.',
            '.bBBBBLLLLLBwBb.',
            '..bBBb....bBBb..',
            '..bbbb....bbbb..',
          ],
        },
      ],
    },
    nyan: {
      // Nyan Cat — grey cat, pink pop-tart body. Has a rainbow trail.
      palette: { t: '#f3c58a', P: '#ff9fd0', s: '#ff3d9a', g: '#9a9a9a', k: '#1a1a1a', r: '#ff8fb0', w: '#ffffff' },
      shot: '#ff3d9a',
      trail: 'rainbow',
      rows: [
        '................',
        '................',
        '...tttttttt.....',
        '..tPPPPPPPPt....',
        '..tPPPPPPPPtg.g.',
        'ggtPPsPPsPPtgggg',
        '.gtPPPPPPPPggggg',
        '..tPPPsPPPPgkgkg',
        '..tPPPPPPPPggggg',
        '..tPPPPPPPPgrgrg',
        '..tPPPPPPPPtgggg',
        '...tttttttt.gg..',
        '..g.gg....gg.g..',
        '................',
        '................',
        '................',
      ],
    },
    slime: {
      palette: { g: '#1f8a3a', G: '#6fe08a', k: '#0b2b12', w: '#d8ffe0' },
      shot: '#6fe08a',
      rows: [
        '................',
        '................',
        '................',
        '................',
        '.....gggggg.....',
        '...ggGGGGGGgg...',
        '..gGwwGGGGGGGg..',
        '.gGGwGkGGGGkGGg.',
        '.gGGGGkGGGGkGGg.',
        '.gGGGGGGGGGGGGg.',
        '.gGGGGGkkkGGGGg.',
        '.gGGGGGGGGGGGGg.',
        '.gGGGGGGGGGGGGg.',
        '..gGGGGGGGGGGg..',
        '...gggggggggg...',
        '................',
      ],
    },
    duck: {
      palette: { y: '#c9930a', Y: '#ffd43b', o: '#ff8c1a', k: '#1a1a1a', w: '#ffffff' },
      shot: '#ff8c1a',
      rows: [
        '................',
        '......yyyy......',
        '.....yYYYYy.....',
        '....yYYkYYYy....',
        '....yYYYYYYyoo..',
        '....yYYYYYYyooo.',
        '.....yYYYYyoo...',
        '......yYYy......',
        '....yyyYYyyy....',
        '..yyYYYYYYYYYy..',
        '.yYYYYYYYYYYYYy.',
        '.yYYYYYYYYYYYYy.',
        '.yYYYYYYYYYYYy..',
        '..yYYYYYYYYYy...',
        '...yyyyyyyyy....',
        '................',
      ],
    },
    ghost: {
      palette: { w: '#8fa3c7', W: '#eef3ff', k: '#20243a', b: '#5b7cff', r: '#ffb3c6' },
      shot: '#b9c6ff',
      float: true,
      rows: [
        '................',
        '.....wwwwww.....',
        '...wwWWWWWWww...',
        '..wWWWWWWWWWWw..',
        '..wWWkkWWWkkWw..',
        '.wWWWkbWWWkbWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWrWWWWWWrWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWWWWWWWWWWWw.',
        '.wWWwwWWWwwWWWw.',
        '.www..www..www..',
        '................',
      ],
    },
    frog: {
      palette: { g: '#1e6b2e', G: '#5ccf5c', W: '#ffffff', k: '#111111', p: '#ff9aa2' },
      shot: '#b6ff5c',
      rows: [
        '................',
        '................',
        '..ggg.....ggg...',
        '.gWWWg...gWWWg..',
        '.gWkWg...gWkWg..',
        '.gGGGGgggGGGGg..',
        '.gGGGGGGGGGGGGg.',
        '.gGGGGGGGGGGGGg.',
        '.gGpGGGGGGGGpGg.',
        '.gGGGkkkkkkkGGg.',
        '.gGGGGGGGGGGGGg.',
        '..gGGGGGGGGGGg..',
        '..gGgGGGGGGgGg..',
        '.ggGg.gggg.gGgg.',
        '.gggg......gggg.',
        '................',
      ],
    },
    robot: {
      palette: { m: '#4b5563', M: '#b4bcc9', c: '#4ee1ff', r: '#ff5c5c', k: '#1f2430' },
      shot: '#4ee1ff',
      rows: [
        '.......k........',
        '......rrr.......',
        '...mmmmmmmmmm...',
        '..mMMMMMMMMMMm..',
        '..mMcccMMcccMm..',
        '..mMcccMMcccMm..',
        '..mMMMMMMMMMMm..',
        '..mMMkkkkkkMMm..',
        '...mmmmmmmmmm...',
        '....mMMMMMMm....',
        '.mm.mMMrrMMm.mm.',
        '.mMmmMMrrMMmmMm.',
        '.mm.mMMMMMMm.mm.',
        '....mmmmmmmm....',
        '....mm....mm....',
        '....mm....mm....',
      ],
    },
    dragon: {
      palette: { r: '#8f2418', R: '#ff5a3c', Y: '#ffd166', k: '#111111', w: '#ffffff' },
      shot: '#ffb347',
      rows: [
        '................',
        '....r......r....',
        '....rr....rr....',
        '...rRRRRRRRRr...',
        '..rRRRkRRRRRRr..',
        '..rRRRRRRRRRRRr.',
        '..rRRRRRRRRRRrr.',
        '...rRRRRRRRwr...',
        '.rrrRRYYYYRRr...',
        '.rRrRRYYYYRRr...',
        '.rRRrRYYYYRRr...',
        '.rRRRRRYYRRRr...',
        '..rRRRRRRRRRr...',
        '..rrRrr..rRr....',
        '..rr.....rr.....',
        '................',
      ],
    },
  };

  const MONSTERS = {
    alien: {
      palette: { g: '#2a7a2a', G: '#7ef07e', k: '#0a1a0a' },
      hpMul: 1, xp: 1, speed: 1, wobble: 0.3,
      rows: [
        '....gggg....',
        '..ggGGGGgg..',
        '.gGGGGGGGGg.',
        '.gGkkGGkkGg.',
        '.gGkkGGkkGg.',
        '.gGGGGGGGGg.',
        '..gGGGGGGg..',
        '...gGkkGg...',
        '....gggg....',
        '...gg..gg...',
        '..gg....gg..',
        '............',
      ],
    },
    ufo: {
      palette: { c: '#4a7fbf', C: '#bfe3ff', m: '#5a5f6b', M: '#c7ccd6', y: '#ffe066' },
      hpMul: 1.5, xp: 2, speed: 0.8, wobble: 0.15,
      rows: [
        '....cccc....',
        '...cCCCCc...',
        '...cCCCCc...',
        '.mmmmmmmmmm.',
        'mMMyMMMMyMMm',
        'mMMMMyMMMMMm',
        '.mmmmmmmmmm.',
        '...m....m...',
        '............',
        '............',
        '............',
        '............',
      ],
    },
    bat: {
      palette: { p: '#4a2a7a', P: '#9b6cff', k: '#ffe066' },
      hpMul: 0.7, xp: 1, speed: 1.5, wobble: 1.2,
      rows: [
        '............',
        '............',
        'p.........p.',
        'pp...pp...pp',
        'ppp.pPPp.ppp',
        'pppppPPppppp',
        '.pppPkPkppp.',
        '..pppPPppp..',
        '...pp..pp...',
        '............',
        '............',
        '............',
      ],
    },
    eye: {
      palette: { w: '#b03050', W: '#ffe8ee', b: '#3070ff', k: '#000000', v: '#ff6f91' },
      hpMul: 1.2, xp: 2, speed: 0.9, wobble: 0.6,
      rows: [
        '............',
        '...wwwwww...',
        '..wWWWWWWw..',
        '.wWWWbbWWWw.',
        'wWWWbbbbWWWw',
        'wWWWbkkbWWWw',
        'wWWWbbbbWWWw',
        '.wWWWbbWWWw.',
        '..wWWWWWWw..',
        '...wwwwww...',
        '..v..v..v...',
        '............',
      ],
    },
    boss: {
      // Mothership — drawn at double size.
      palette: { c: '#7a3fbf', C: '#e2bfff', m: '#2f2f3a', M: '#8a8aa0', y: '#ff4d6d' },
      hpMul: 8, xp: 10, speed: 0.35, wobble: 0.2, scaleMul: 2,
      rows: [
        '....cccc....',
        '...cCCCCc...',
        '..cCCyyCCc..',
        '.mmmmmmmmmm.',
        'mMyMMMMMMyMm',
        'mMMMMyyMMMMm',
        '.mmmmmmmmmm.',
        '..m..mm..m..',
        '............',
        '............',
        '............',
        '............',
      ],
    },
  };

  const MISC = {
    tombstone: {
      palette: { s: '#6b7280', S: '#a1a8b3', k: '#374151', g: '#3f8f3f' },
      rows: [
        '....SSSSSSSS....',
        '...SSSSSSSSSS...',
        '..SSSSSSSSSSSS..',
        '..SSSSSkkSSSSS..',
        '..SSSSSkkSSSSS..',
        '..SSSkkkkkkSSS..',
        '..SSSSSkkSSSSS..',
        '..SSSSSkkSSSSS..',
        '..SSSSSkkSSSSS..',
        '..SSSSSSSSSSSS..',
        '..SSSSSSSSSSSS..',
        '..SSSSSSSSSSSS..',
        '..ssssssssssss..',
        '.gggggggggggggg.',
        'gggggggggggggggg',
        '................',
      ],
    },
  };

  const cache = new Map();

  /** Pre-render a sprite to an offscreen canvas at the given pixel scale. */
  function render(sprite, scale, opts) {
    opts = opts || {};
    const key = `${sprite.rows.join('|')}|${scale}|${opts.tint || ''}|${opts.flip ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    const h = sprite.rows.length, w = sprite.rows[0].length;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = sprite.rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === undefined) continue;
        ctx.fillStyle = opts.tint || sprite.palette[ch] || '#ff00ff';
        const px = opts.flip ? (w - 1 - x) : x;
        ctx.fillRect(px * scale, y * scale, scale, scale);
      }
    }
    cache.set(key, c);
    return c;
  }

  const RAINBOW = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#3b82f6', '#8b5cf6'];

  /** Evolution stage of an avatar at a level: { index, stage, next } (next = the stage after, or null). */
  function stageFor(id, level) {
    const pet = PETS[id] || PETS.osci;
    if (!pet.stages) return { index: 0, stage: null, next: null, total: 1 };
    let index = 0;
    for (let i = 0; i < pet.stages.length; i++) if (level >= pet.stages[i].level) index = i;
    return { index, stage: pet.stages[index], next: pet.stages[index + 1] || null, total: pet.stages.length };
  }

  /** The drawable sprite for an avatar at a level (stage palette merged over the base palette). */
  function petSprite(id, level) {
    const pet = PETS[id] || PETS.osci;
    if (!pet.stages) return pet;
    const { stage } = stageFor(id, level == null ? 999 : level);
    return { palette: Object.assign({}, pet.palette, stage.palette || {}), rows: stage.rows, shot: pet.shot, trail: pet.trail, glow: stage.glow, name: stage.name };
  }

  root.Sprites = { PETS, MONSTERS, MISC, RAINBOW, render, stageFor, petSprite };
})(typeof globalThis !== 'undefined' ? globalThis : this);
