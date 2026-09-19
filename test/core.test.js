// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

const H = Core.HOUR_MS, M = Core.MIN_MS;
const T0 = new Date(2026, 8, 19, 10, 0, 0).getTime(); // local time, mid-morning

test('levels grow with the square root of XP', () => {
  assert.equal(Core.levelForXp(0), 1);
  assert.equal(Core.levelForXp(39), 1);
  assert.equal(Core.levelForXp(40), 2);
  assert.equal(Core.levelForXp(160), 3);
  assert.equal(Core.xpForLevel(5), 640);
  assert.equal(Core.levelForXp(Core.xpForLevel(10)), 10);
});

test('a finished 25-minute block feeds and levels the pet', () => {
  const s = Core.defaultState(T0);
  const r = Core.completeFocus(s, 25 * M, true, T0 + 25 * M, () => 0.5);
  assert.equal(r.minutes, 25);
  assert.equal(r.xpStudy, 25 * Core.XP_PER_MIN + Core.SESSION_BONUS_XP);
  assert.ok(r.kills > 0);
  assert.equal(r.levelFrom, 1);
  assert.equal(r.levelTo, 2);
  assert.equal(s.stats.sessions, 1);
  assert.equal(s.today.sessions, 1);
  assert.equal(s.stats.streak, 1);
  assert.equal(s.history[Core.dayKey(T0)], 25);
  assert.equal(s.pet.hp, 100); // capped
});

test('stopping early gives partial XP and no session credit', () => {
  const s = Core.defaultState(T0);
  const r = Core.completeFocus(s, 7 * M + 30000, false, T0 + 8 * M);
  assert.equal(r.minutes, 7);
  assert.equal(r.xpStudy, 14);
  assert.equal(s.stats.sessions, 0);
  assert.equal(s.stats.streak, 1); // still counts as studying today
});

test('HP does not drop during the grace period, then drains linearly', () => {
  const s = Core.defaultState(T0);
  s.settings.graceHours = 8; s.settings.hoursToDie = 48;
  Core.applyDecay(s, T0 + 7 * H);
  assert.equal(s.pet.hp, 100);
  Core.applyDecay(s, T0 + 8 * H + 24 * H);
  assert.ok(Math.abs(s.pet.hp - 50) < 0.01, `hp was ${s.pet.hp}`);
  assert.ok(s.pet.alive);
});

test('the pet dies after grace + hoursToDie and goes to the memorial', () => {
  const s = Core.defaultState(T0);
  s.pet.name = 'Testy';
  const events = Core.applyDecay(s, T0 + (8 + 48) * H + 1000);
  assert.deepEqual(events, [{ type: 'died' }]);
  assert.equal(s.pet.alive, false);
  assert.equal(s.pet.hp, 0);
  assert.equal(s.memorial.length, 1);
  assert.equal(s.memorial[0].name, 'Testy');
  assert.equal(s.stats.petsLost, 1);
  Core.revive(s, T0 + 60 * H);
  assert.equal(s.pet.alive, true);
  assert.equal(s.pet.generation, 2);
  assert.equal(Core.petDisplayName(s.pet), 'Testy II');
  assert.equal(s.pet.xp, 0);
});

test('a shield saves the pet once', () => {
  const s = Core.defaultState(T0);
  s.pet.shields = 1;
  const events = Core.applyDecay(s, T0 + 100 * H);
  assert.deepEqual(events, [{ type: 'shield' }]);
  assert.equal(s.pet.alive, true);
  assert.equal(s.pet.hp, 50);
  assert.equal(s.pet.shields, 0);
});

test('decay can be switched off', () => {
  const s = Core.defaultState(T0);
  s.settings.decayEnabled = false;
  Core.applyDecay(s, T0 + 1000 * H);
  assert.equal(s.pet.hp, 100);
  assert.equal(Core.timeUntilStarve(s, T0), Infinity);
});

test('streaks count consecutive days and break after a gap', () => {
  const s = Core.defaultState(T0);
  Core.completeFocus(s, 25 * M, true, T0);
  Core.completeFocus(s, 25 * M, true, T0 + 3 * H);        // same day, no change
  assert.equal(s.stats.streak, 1);
  Core.completeFocus(s, 25 * M, true, T0 + 24 * H);       // next day
  assert.equal(s.stats.streak, 2);
  assert.equal(Core.effectiveStreak(s, T0 + 48 * H), 2);  // still valid the day after
  assert.equal(Core.effectiveStreak(s, T0 + 72 * H), 0);  // missed a day
  Core.completeFocus(s, 25 * M, true, T0 + 72 * H);
  assert.equal(s.stats.streak, 1);
  assert.equal(s.stats.bestStreak, 2);
});

test('a 7-day streak earns a shield', () => {
  const s = Core.defaultState(T0);
  for (let d = 0; d < 7; d++) Core.completeFocus(s, 25 * M, true, T0 + d * 24 * H);
  assert.equal(s.stats.streak, 7);
  assert.equal(s.pet.shields, 1);
});

test('avatars unlock by level', () => {
  const s = Core.defaultState(T0);
  assert.deepEqual(s.unlocked, ['osci', 'nyan']);
  s.pet.xp = Core.xpForLevel(5);
  const fresh = Core.checkUnlocks(s);
  assert.deepEqual(fresh, ['slime', 'duck']);
  assert.deepEqual(Core.checkUnlocks(s), []);
});

test('daily quests are deterministic per day and reset on a new day', () => {
  const a = Core.rollQuests('2026-09-19'), b = Core.rollQuests('2026-09-19'), c = Core.rollQuests('2026-09-20');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.notDeepEqual(a.map(q => q.id), c.map(q => q.id));
  const s = Core.defaultState(T0);
  s.today.focusMs = 5 * M;
  assert.equal(Core.ensureDay(s, T0 + 24 * H), true);
  assert.equal(s.today.focusMs, 0);
  assert.equal(s.quests.day, Core.dayKey(T0 + 24 * H));
});

test('quest progress awards XP once', () => {
  const s = Core.defaultState(T0);
  s.quests.list = [{ id: 'kills', goal: 5, reward: 30, progress: 0, done: false, text: '' }];
  assert.equal(Core.questProgress(s, 'kills', 3), 0);
  assert.equal(Core.questProgress(s, 'kills', 3), 30);
  assert.equal(Core.questProgress(s, 'kills', 3), 0);
  assert.equal(s.pet.xp, 30);
  assert.equal(s.quests.list[0].progress, 5);
});

test('arena kills add XP, quest progress and unlocks', () => {
  const s = Core.defaultState(T0);
  s.quests.list = [{ id: 'combo', goal: 10, reward: 30, progress: 0, done: false, text: '' }];
  const r = Core.addArenaKills(s, { kills: 12, xp: 45, bosses: 1, maxCombo: 11 }, T0);
  assert.equal(s.pet.xp, 45 + 30);
  assert.equal(s.stats.totalKills, 12);
  assert.equal(s.stats.bosses, 1);
  assert.equal(r.xpQuests, 30);
  assert.equal(r.levelTo, 2);
});

test('migrate fills in missing fields without touching existing ones', () => {
  const old = { pet: { name: 'Old', avatar: 'nyan', xp: 500 }, settings: { focusMin: 50 }, stats: {}, timer: {} };
  const s = Core.migrate(old, T0);
  assert.equal(s.pet.name, 'Old');
  assert.equal(s.pet.alive, true);
  assert.equal(s.settings.focusMin, 50);
  assert.equal(s.settings.shortMin, 5);
  assert.ok(Array.isArray(s.unlocked));
  assert.ok(s.quests.list.length === 3);
});

test('combat scales with level', () => {
  const l1 = Core.combatStats(1), l10 = Core.combatStats(10), l15 = Core.combatStats(15);
  assert.ok(l10.damage > l1.damage);
  assert.ok(l10.fireIntervalMs < l1.fireIntervalMs);
  assert.equal(l1.bullets, 1); assert.equal(l10.bullets, 2); assert.equal(l15.bullets, 3);
});
