// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../rules.js');
require('../oski.js'); const Oski = globalThis.Oski;
const T0 = 1_800_000_000_000;
const min = (n) => n * 60000;

test('landing on a taboo site draws blood instantly, then 20 minutes kills him', () => {
  const s = Rules.defaultState(T0);
  let ev = Rules.setActivity(s, 'bad', 'youtube.com', T0);
  assert.equal(s.health, 100 - Rules.ENTRY_HIT);
  assert.equal(s.lastHitAt, T0);
  assert.deepEqual(ev, [{ type: 'hit', host: 'youtube.com' }]);
  Rules.setActivity(s, 'bad', 'youtube.com', T0 + 1000);            // same site: no second hit
  assert.ok(s.health > 100 - 2 * Rules.ENTRY_HIT);
  Rules.setActivity(s, 'bad', 'reddit.com', T0 + 2000);             // hopping to another taboo site: hit again
  assert.ok(s.health < 100 - 2 * Rules.ENTRY_HIT + 0.1);
  s.health = 100; s.lastSettle = T0;
  ev = Rules.settle(s, T0 + min(10));
  assert.ok(Math.abs(s.health - 50) < 0.01, `health ${s.health}`);
  assert.deepEqual(ev, [{ type: 'warn', mark: 50, host: 'reddit.com' }]);
  ev = Rules.settle(s, T0 + min(16));
  assert.equal(ev[0].mark, 20);
  ev = Rules.settle(s, T0 + min(21));
  assert.equal(s.alive, false); assert.equal(s.health, 0); assert.equal(s.deaths, 1);
  assert.equal(ev[0].type, 'died'); assert.equal(ev[0].host, 'reddit.com');
});

test('idle hurts slowly, away does nothing, good heals', () => {
  const s = Rules.defaultState(T0);
  Rules.setActivity(s, 'idle', '', T0);
  Rules.settle(s, T0 + min(60));
  assert.ok(Math.abs(s.health - 50) < 0.01);
  Rules.setActivity(s, 'away', '', T0 + min(60));
  Rules.settle(s, T0 + min(600));
  assert.ok(Math.abs(s.health - 50) < 0.01);
  Rules.setActivity(s, 'good', 'docs.google.com', T0 + min(600));
  Rules.settle(s, T0 + min(618));
  assert.ok(Math.abs(s.health - 70) < 0.01, `health ${s.health}`);
  Rules.settle(s, T0 + min(2000));
  assert.equal(s.health, 100);
});

test('switching activity charges the old one first', () => {
  const s = Rules.defaultState(T0);
  Rules.setActivity(s, 'bad', 'reddit.com', T0);
  Rules.setActivity(s, 'good', 'github.com', T0 + min(2));
  assert.ok(Math.abs(s.health - (100 - Rules.ENTRY_HIT - 10)) < 0.01, `health ${s.health}`);
  assert.equal(s.activity.kind, 'good');
});

test('nothing happens while Oski is off or dead; revive restores him', () => {
  const s = Rules.defaultState(T0);
  s.enabled = false; Rules.setActivity(s, 'bad', 'x.com', T0); Rules.settle(s, T0 + min(500));
  assert.equal(s.health, 100);
  s.enabled = true; Rules.settle(s, T0 + min(600)); Rules.setActivity(s, 'bad', 'x.com', T0 + min(600)); Rules.settle(s, T0 + min(700));
  assert.equal(s.alive, false);
  Rules.settle(s, T0 + min(800));
  assert.equal(s.deaths, 1);
  Rules.revive(s, T0 + min(800));
  assert.equal(s.alive, true); assert.equal(s.health, 100); assert.deepEqual(s.warned, {});
});

test('host matching handles subdomains and normalisation', () => {
  const sites = Rules.DEFAULT_SITES;
  assert.equal(Rules.isBadHost(Rules.hostOf('https://www.youtube.com/watch?v=1'), sites), true);
  assert.equal(Rules.isBadHost(Rules.hostOf('https://m.reddit.com/r/x'), sites), true);
  assert.equal(Rules.isBadHost(Rules.hostOf('https://royaleapi.com/player/abc'), sites), true);
  assert.equal(Rules.isBadHost(Rules.hostOf('https://x.com/home'), sites), true);
  assert.equal(Rules.isBadHost(Rules.hostOf('https://notx.com/'), sites), false);
  assert.equal(Rules.isBadHost(Rules.hostOf('https://docs.google.com/'), sites), false);
  assert.equal(Rules.isBadHost(Rules.hostOf('chrome://extensions'), sites), false);
  assert.equal(Rules.normalizeHost(' https://www.Twitch.tv/some/path '), 'twitch.tv');
});

test('injury stages get worse as health drops and the grids stay valid', () => {
  assert.equal(Oski.stageName(100, true), 'healthy');
  assert.equal(Oski.stageName(84, true), 'bleeding eyes');
  assert.equal(Oski.stageName(64, true), 'bleeding');
  assert.equal(Oski.stageName(39, true), 'broken');
  assert.equal(Oski.stageName(17, true), 'dying');
  assert.equal(Oski.TREE.length, 24);
  assert.equal(Oski.stageName(0, false), 'dead');
  let prevRed = -1;
  for (const [h, alive] of [[100, true], [70, true], [50, true], [30, true], [10, true], [0, false]]) {
    const g = Oski.compose(h, alive);
    assert.equal(g.length, 24); for (const r of g) assert.equal(r.length, 24);
    const red = g.join('').split('').filter(c => c === 'r' || c === 'R').length;
    assert.ok(red >= prevRed, `blood should not decrease at ${h}`); prevRed = red;
  }
  assert.ok(prevRed > 30, 'the dead Oski should be very bloody');
});

test('a dragged position is kept on screen and survives a resize', () => {
  // 900x600 viewport, Oski is 90x78
  const fit = (p) => Rules.clampPos(p, 900, 600, 90, 78);
  assert.deepEqual(fit({ rx: 0.5, ty: 0.5 }), { rx: 0.5, ty: 0.5 });
  // dragged past the left edge → clamped so he stays fully visible
  assert.equal(fit({ rx: 5, ty: 0 }).rx, (900 - 90) / 900);
  assert.equal(fit({ rx: 0, ty: 9 }).ty, (600 - 78) / 600);
  // dragged past the right/top edge
  assert.deepEqual(fit({ rx: -3, ty: -3 }), { rx: 0, ty: 0 });
  // junk falls back to the default corner
  assert.deepEqual(fit(null), { rx: 0.01, ty: 0.02 });
  assert.deepEqual(fit({ rx: 'x', ty: undefined }), { rx: 0.01, ty: 0.02 });
  // the same fractions land at the matching spot on a smaller window
  const p = fit({ rx: 0.25, ty: 0.5 });
  assert.deepEqual(Rules.clampPos(p, 450, 300, 90, 78), { rx: 0.25, ty: 0.5 });
  assert.deepEqual(Rules.defaultState(T0).pos, { rx: 0.01, ty: 0.02 });
});
