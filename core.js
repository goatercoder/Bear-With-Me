/* core.js — Focusling game rules.
 * Pure functions shared by the background worker, the popup and the tests.
 * No browser APIs in here. */
(function (root) {
  'use strict';

  const MIN_MS = 60000;
  const HOUR_MS = 3600000;
  const XP_PER_MIN = 2;          // studying is the main source of power
  const SESSION_BONUS_XP = 10;   // for finishing a focus block without giving up
  const XP_PER_KILL = 1;
  const MAX_HP = 100;
  const SHIELD_EVERY_STREAK = 7; // a streak of 7, 14, 21... days earns a shield

  const AVATARS = [
    { id: 'osci',   name: 'Osci Bear', unlockLevel: 1,  blurb: 'The original study buddy. Runs on honey and clean sine waves.' },
    { id: 'nyan',   name: 'Nyan Cat',  unlockLevel: 1,  blurb: 'Half cat, half pop-tart. Leaves a rainbow wherever it goes.' },
    { id: 'slime',  name: 'Gloop',     unlockLevel: 3,  blurb: 'A friendly blob. Absorbs knowledge (and crumbs).' },
    { id: 'duck',   name: 'Quackers',  unlockLevel: 5,  blurb: 'Explain your problem to the duck. The duck listens.' },
    { id: 'ghost',  name: 'Boo',       unlockLevel: 7,  blurb: 'Haunts your to-do list until it is done.' },
    { id: 'frog',   name: 'Ribbit',    unlockLevel: 9,  blurb: 'Eats bugs. Especially the ones in your code.' },
    { id: 'robot',  name: 'Bolt',      unlockLevel: 12, blurb: 'Beep boop. Optimised for deep work.' },
    { id: 'dragon', name: 'Ember',     unlockLevel: 15, blurb: 'Only the most disciplined scholars can tame a dragon.' },
  ];

  const DEFAULT_SETTINGS = {
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    longEvery: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    notifications: true,
    sound: true,
    decayEnabled: true,
    graceHours: 8,       // no HP is lost for this long after your last study session
    hoursToDie: 48,      // after the grace period, full HP drains to zero over this many hours
    shieldEnabled: false,
    shieldDomains: ['youtube.com', 'twitter.com', 'x.com', 'reddit.com', 'tiktok.com', 'instagram.com', 'netflix.com', 'twitch.tv'],
  };

  const QUEST_POOL = [
    { id: 'sessions', text: 'Complete {n} focus sessions', goal: 3, reward: 40 },
    { id: 'minutes',  text: 'Study for {n} minutes', goal: 60, reward: 50 },
    { id: 'kills',    text: 'Defeat {n} monsters', goal: 25, reward: 30 },
    { id: 'combo',    text: 'Reach a {n}-kill combo in the arena', goal: 10, reward: 30 },
    { id: 'boss',     text: 'Defeat {n} boss', goal: 1, reward: 40 },
  ];

  // ---- helpers -------------------------------------------------------------

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + n, 12).getTime());
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Small seeded PRNG so daily quests are the same on every device/day.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function levelForXp(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40)); }
  function xpForLevel(level) { return 40 * (level - 1) * (level - 1); }

  function combatStats(level) {
    return {
      damage: 1 + Math.floor(level / 2),
      fireIntervalMs: Math.max(220, 700 - level * 30),
      bullets: level >= 15 ? 3 : level >= 8 ? 2 : 1,
      monsterHp: 2 + level,
      spawnMs: Math.max(650, 1700 - level * 45),
    };
  }

  function romanSuffix(gen) {
    if (gen <= 1) return '';
    const romans = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return ' ' + (romans[gen - 1] || gen);
  }

  function avatarById(id) { return AVATARS.find(a => a.id === id) || AVATARS[0]; }

  // ---- state ---------------------------------------------------------------

  function newPet(avatar, name, now, generation) {
    return {
      name: name || avatarById(avatar).name,
      avatar,
      xp: 0,
      hp: MAX_HP,
      shields: 0,
      kills: 0,
      born: now,
      alive: true,
      diedAt: 0,
      generation: generation || 1,
    };
  }

  function defaultState(now) {
    const day = dayKey(now);
    return {
      version: 1,
      pet: newPet('osci', 'Osci Bear', now, 1),
      timer: {
        mode: 'focus',       // focus | short | long
        phase: 'ready',      // ready | running | paused
        endsAt: 0,
        remainingMs: DEFAULT_SETTINGS.focusMin * MIN_MS,
        durationMs: DEFAULT_SETTINGS.focusMin * MIN_MS,
        segmentStart: 0,
        accumulatedMs: 0,
        cycle: 0,            // focus blocks finished since the last long break
        task: '',
      },
      settings: Object.assign({}, DEFAULT_SETTINGS, { shieldDomains: DEFAULT_SETTINGS.shieldDomains.slice() }),
      stats: {
        totalFocusMs: 0,
        sessions: 0,
        totalKills: 0,
        bosses: 0,
        streak: 0,
        bestStreak: 0,
        lastFocusDay: '',
        lastFocusAt: now,
        petsLost: 0,
      },
      today: { day, focusMs: 0, sessions: 0, kills: 0 },
      history: {},           // day -> focus minutes (last 90 days)
      quests: { day, list: rollQuests(day) },
      unlocked: ['osci', 'nyan'],
      memorial: [],
      report: null,          // battle report waiting to be shown in the UI
      lastEvent: null,       // {type, at} used by the UI for sounds
      lastDecayAt: now,
      notified: { lowHpDay: '' },
      onboarded: false,
    };
  }

  function rollQuests(day) {
    const rng = mulberry32(hashString(day));
    const pool = QUEST_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3).map(q => ({
      id: q.id, goal: q.goal, reward: q.reward, progress: 0, done: false,
      text: q.text.replace('{n}', q.goal),
    }));
  }

  /** Reset per-day counters and quests when the calendar day changes. */
  function ensureDay(state, now) {
    const day = dayKey(now);
    if (state.today.day === day) return false;
    state.today = { day, focusMs: 0, sessions: 0, kills: 0 };
    state.quests = { day, list: rollQuests(day) };
    // trim history to 90 days
    const keys = Object.keys(state.history).sort();
    while (keys.length > 90) delete state.history[keys.shift()];
    return true;
  }

  /** Advance a quest. `set` means "record a high-water mark" (e.g. combo). Returns XP awarded. */
  function questProgress(state, id, amount, set) {
    let xp = 0;
    for (const q of state.quests.list) {
      if (q.id !== id || q.done) continue;
      q.progress = set ? Math.max(q.progress, amount) : q.progress + amount;
      if (q.progress >= q.goal) {
        q.progress = q.goal;
        q.done = true;
        xp += q.reward;
      }
    }
    if (xp) state.pet.xp += xp;
    return xp;
  }

  /** Unlock avatars for the pet's level. Returns newly unlocked ids. */
  function checkUnlocks(state) {
    const level = levelForXp(state.pet.xp);
    const fresh = [];
    for (const a of AVATARS) {
      if (level >= a.unlockLevel && !state.unlocked.includes(a.id)) {
        state.unlocked.push(a.id);
        fresh.push(a.id);
      }
    }
    return fresh;
  }

  /** Drain HP while the pet is neglected. Returns a list of events. */
  function applyDecay(state, now) {
    const events = [];
    const s = state.settings;
    const last = state.lastDecayAt || now;
    state.lastDecayAt = now;
    if (!state.pet.alive || !s.decayEnabled) return events;
    const dt = now - last;
    if (dt <= 0) return events;
    const idleMs = now - (state.stats.lastFocusAt || state.pet.born);
    const graceMs = s.graceHours * HOUR_MS;
    if (idleMs <= graceMs) return events;
    const effective = Math.min(dt, idleMs - graceMs);
    const loss = MAX_HP * effective / (s.hoursToDie * HOUR_MS);
    state.pet.hp -= loss;
    if (state.pet.hp <= 0) {
      if (state.pet.shields > 0) {
        state.pet.shields -= 1;
        state.pet.hp = 50;
        state.stats.lastFocusAt = now; // the shield buys a fresh grace period
        events.push({ type: 'shield' });
      } else {
        state.pet.hp = 0;
        state.pet.alive = false;
        state.pet.diedAt = now;
        state.stats.petsLost += 1;
        state.memorial.unshift({
          name: petDisplayName(state.pet),
          avatar: state.pet.avatar,
          level: levelForXp(state.pet.xp),
          xp: state.pet.xp,
          kills: state.pet.kills,
          born: state.pet.born,
          died: now,
        });
        state.memorial = state.memorial.slice(0, 20);
        events.push({ type: 'died' });
      }
    }
    return events;
  }

  function updateStreak(state, now) {
    const day = dayKey(now);
    const st = state.stats;
    let earnedShield = false;
    if (st.lastFocusDay !== day) {
      st.streak = st.lastFocusDay === addDays(day, -1) ? st.streak + 1 : 1;
      st.lastFocusDay = day;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      if (st.streak > 0 && st.streak % SHIELD_EVERY_STREAK === 0) {
        state.pet.shields += 1;
        earnedShield = true;
      }
    }
    return earnedShield;
  }

  /** The streak as it should be displayed: 0 once a day has been missed. */
  function effectiveStreak(state, now) {
    const day = dayKey(now);
    const last = state.stats.lastFocusDay;
    if (last === day || last === addDays(day, -1)) return state.stats.streak;
    return 0;
  }

  /**
   * Credit a focus block. `completed` is false when the user stopped early.
   * Returns a battle report for the UI.
   */
  function completeFocus(state, elapsedMs, completed, now, rng) {
    rng = rng || Math.random;
    ensureDay(state, now);
    const pet = state.pet;
    const minutes = Math.floor(elapsedMs / MIN_MS);
    const levelFrom = levelForXp(pet.xp);
    const day = dayKey(now);

    const xpStudy = minutes * XP_PER_MIN + (completed ? SESSION_BONUS_XP : 0);
    // Monsters your pet fought off in the background while you were studying.
    const kills = minutes >= 1 ? Math.round(minutes * (0.5 + levelFrom * 0.1) * (0.8 + 0.4 * rng())) : 0;
    const xpKills = kills * XP_PER_KILL;
    const hpGain = pet.alive ? Math.min(30, 5 + minutes) : 0;

    if (pet.alive) {
      pet.xp += xpStudy + xpKills;
      pet.hp = clamp(pet.hp + hpGain, 0, MAX_HP);
      pet.kills += kills;
    }
    state.stats.totalFocusMs += elapsedMs;
    state.stats.totalKills += kills;
    state.today.focusMs += elapsedMs;
    state.today.kills += kills;
    state.history[day] = (state.history[day] || 0) + minutes;
    state.stats.lastFocusAt = now;
    state.lastDecayAt = now;

    let xpQuests = 0;
    if (completed) {
      state.stats.sessions += 1;
      state.today.sessions += 1;
      xpQuests += questProgress(state, 'sessions', 1);
    }
    xpQuests += questProgress(state, 'minutes', minutes);
    xpQuests += questProgress(state, 'kills', kills);

    const shieldEarned = minutes >= 1 ? updateStreak(state, now) : false;
    const unlocked = checkUnlocks(state);
    const levelTo = levelForXp(pet.xp);

    return {
      at: now, minutes, completed, xpStudy, xpKills, xpQuests, kills, hpGain,
      levelFrom, levelTo, unlocked, shieldEarned, streak: state.stats.streak,
    };
  }

  /** Kills made live in the arena while the popup/arena tab was open. */
  function addArenaKills(state, batch, now) {
    ensureDay(state, now);
    const pet = state.pet;
    const kills = batch.kills | 0, bosses = batch.bosses | 0, xp = batch.xp | 0;
    const levelFrom = levelForXp(pet.xp);
    if (pet.alive) { pet.xp += xp; pet.kills += kills; }
    state.stats.totalKills += kills;
    state.stats.bosses += bosses;
    state.today.kills += kills;
    let xpQuests = questProgress(state, 'kills', kills);
    if (bosses) xpQuests += questProgress(state, 'boss', bosses);
    if (batch.maxCombo) xpQuests += questProgress(state, 'combo', batch.maxCombo, true);
    const unlocked = checkUnlocks(state);
    return { levelFrom, levelTo: levelForXp(pet.xp), unlocked, xpQuests };
  }

  function revive(state, now) {
    const old = state.pet;
    state.pet = newPet(old.avatar, old.name, now, old.generation + 1);
    state.stats.lastFocusAt = now;
    state.lastDecayAt = now;
    state.report = null;
  }

  function petDisplayName(pet) { return pet.name + romanSuffix(pet.generation); }

  function hpStatus(pet) {
    if (!pet.alive) return { label: 'Fainted', emoji: '💀', tone: 'dead' };
    const hp = pet.hp;
    if (hp >= 80) return { label: 'Thriving', emoji: '😄', tone: 'great' };
    if (hp >= 55) return { label: 'Happy', emoji: '🙂', tone: 'good' };
    if (hp >= 35) return { label: 'Hungry', emoji: '😐', tone: 'meh' };
    if (hp >= 15) return { label: 'Starving', emoji: '😟', tone: 'bad' };
    return { label: 'Critical', emoji: '😱', tone: 'critical' };
  }

  /** Milliseconds until the pet starves if you never study again (Infinity when decay is off). */
  function timeUntilStarve(state, now) {
    const s = state.settings;
    if (!s.decayEnabled || !state.pet.alive) return Infinity;
    const idle = now - (state.stats.lastFocusAt || state.pet.born);
    const graceLeft = Math.max(0, s.graceHours * HOUR_MS - idle);
    return graceLeft + (state.pet.hp / MAX_HP) * s.hoursToDie * HOUR_MS;
  }

  /** Bring an older stored state up to date with new fields. */
  function migrate(state, now) {
    const fresh = defaultState(now);
    for (const k of Object.keys(fresh)) if (state[k] === undefined) state[k] = fresh[k];
    for (const k of Object.keys(fresh.settings)) if (state.settings[k] === undefined) state.settings[k] = fresh.settings[k];
    for (const k of Object.keys(fresh.stats)) if (state.stats[k] === undefined) state.stats[k] = fresh.stats[k];
    for (const k of Object.keys(fresh.pet)) if (state.pet[k] === undefined) state.pet[k] = fresh.pet[k];
    for (const k of Object.keys(fresh.timer)) if (state.timer[k] === undefined) state.timer[k] = fresh.timer[k];
    return state;
  }

  function formatDuration(ms) {
    const totalMin = Math.round(ms / MIN_MS);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  const Core = {
    MIN_MS, HOUR_MS, MAX_HP, XP_PER_MIN, SESSION_BONUS_XP, XP_PER_KILL,
    AVATARS, DEFAULT_SETTINGS, QUEST_POOL,
    dayKey, addDays, clamp, levelForXp, xpForLevel, combatStats, avatarById,
    defaultState, newPet, rollQuests, ensureDay, questProgress, checkUnlocks,
    applyDecay, updateStreak, effectiveStreak, completeFocus, addArenaKills, revive,
    petDisplayName, hpStatus, timeUntilStarve, migrate, formatDuration,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.Core = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
