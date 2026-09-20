// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../rules.js');
require('../oski.js'); const Oski = globalThis.Oski;
const T0 = 1_800_000_000_000;
const min = (n) => n * 60000;

test('30 minutes of doomscrolling kills a healthy Oski', () => {
  const s = Rules.defaultState(T0);
  Rules.setActivity(s, 'bad', 'youtube.com', T0);
  let ev = Rules.settle(s, T0 + min(15));
  assert.ok(Math.abs(s.health - 50) < 0.01, `health ${s.health}`);
  assert.deepEqual(ev, [{ type: 'warn', mark: 50, host: 'youtube.com' }]);
  ev = Rules.settle(s, T0 + min(24));
  assert.equal(ev[0].mark, 20);
  ev = Rules.settle(s, T0 + min(31));
  assert.equal(s.alive, false); assert.equal(s.health, 0); assert.equal(s.deaths, 1);
  assert.equal(ev[0].type, 'died'); assert.equal(ev[0].host, 'youtube.com');
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
  Rules.setActivity(s, 'good', 'github.com', T0 + min(3));
  assert.ok(Math.abs(s.health - 90) < 0.01);
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
  assert.equal(Oski.stageName(79, true), 'bruised');
  assert.equal(Oski.stageName(59, true), 'bleeding');
  assert.equal(Oski.stageName(39, true), 'broken');
  assert.equal(Oski.stageName(19, true), 'dying');
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
