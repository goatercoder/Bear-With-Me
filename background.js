/* background.js — Focusling's brain.
 * Runs as a service worker (Chrome) or event page (Firefox).
 * Owns the Pomodoro timer, HP decay, notifications, the toolbar badge and the
 * distraction shield. All state lives in chrome.storage.local under one key and
 * every mutation goes through withState() so writes never race. */
if (typeof importScripts === 'function' && typeof Core === 'undefined') importScripts('core.js');

const api = globalThis.browser ?? globalThis.chrome;
const KEY = 'focusling';
const TICK = 'focusling-tick';
const SESSION_END = 'focusling-session-end';

let chain = Promise.resolve();

/** Load → mutate → save, serialised so concurrent messages can't clobber each other. */
function withState(fn) {
  const run = chain.then(async () => {
    const got = await api.storage.local.get(KEY);
    const now = Date.now();
    let state = got[KEY];
    state = state ? Core.migrate(state, now) : Core.defaultState(now);
    const result = await fn(state, now);
    await api.storage.local.set({ [KEY]: state });
    await updateBadge(state, now);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

// ---- timer -----------------------------------------------------------------

function durationFor(state, mode) {
  const s = state.settings;
  const min = mode === 'focus' ? s.focusMin : mode === 'short' ? s.shortMin : s.longMin;
  return Math.max(1, min) * Core.MIN_MS;
}

function elapsedMs(timer, now) {
  return timer.accumulatedMs + (timer.phase === 'running' ? Math.max(0, now - timer.segmentStart) : 0);
}

async function startTimer(state, mode, now) {
  const t = state.timer;
  const duration = durationFor(state, mode);
  Object.assign(t, {
    mode, phase: 'running', endsAt: now + duration, remainingMs: duration,
    durationMs: duration, segmentStart: now, accumulatedMs: 0,
  });
  if (mode === 'focus') state.stats.lastFocusAt = now;
  await api.alarms.create(SESSION_END, { when: t.endsAt });
}

async function readyTimer(state, mode) {
  const t = state.timer;
  const duration = durationFor(state, mode);
  Object.assign(t, {
    mode, phase: 'ready', endsAt: 0, remainingMs: duration, durationMs: duration,
    segmentStart: 0, accumulatedMs: 0,
  });
  await api.alarms.clear(SESSION_END);
}

async function pauseTimer(state, now) {
  const t = state.timer;
  if (t.phase !== 'running') return;
  t.accumulatedMs += Math.max(0, now - t.segmentStart);
  t.remainingMs = Math.max(0, t.endsAt - now);
  t.phase = 'paused';
  await api.alarms.clear(SESSION_END);
}

async function resumeTimer(state, now) {
  const t = state.timer;
  if (t.phase !== 'paused') return;
  t.phase = 'running';
  t.segmentStart = now;
  t.endsAt = now + t.remainingMs;
  if (t.mode === 'focus') state.stats.lastFocusAt = now;
  await api.alarms.create(SESSION_END, { when: t.endsAt });
}

/** A block reached zero. Hand out rewards and line up the next block. */
async function finishSession(state, now) {
  const t = state.timer;
  const s = state.settings;
  if (t.mode === 'focus') {
    const report = Core.completeFocus(state, elapsedMs(t, now), true, now);
    t.cycle += 1;
    state.report = report;
    state.lastEvent = { type: 'focusDone', at: now };
    const next = t.cycle % Math.max(1, s.longEvery) === 0 ? 'long' : 'short';
    const name = Core.petDisplayName(state.pet);
    notify('focus-done', `Focus complete! +${report.xpStudy + report.xpKills} XP`,
      `${name} fought off ${report.kills} monsters while you studied. Time for a ${next === 'long' ? 'long' : 'short'} break.`, s);
    if (s.autoStartBreaks) await startTimer(state, next, now); else await readyTimer(state, next);
  } else {
    state.lastEvent = { type: 'breakDone', at: now };
    notify('break-done', "Break's over", `${Core.petDisplayName(state.pet)} is ready for the next round.`, s);
    if (s.autoStartFocus) await startTimer(state, 'focus', now); else await readyTimer(state, 'focus');
  }
}

/** Stop early: partial credit for a focus block, nothing for a break. */
async function abandonSession(state, now) {
  const t = state.timer;
  if (t.mode === 'focus' && t.phase !== 'ready') {
    const elapsed = elapsedMs(t, now);
    if (elapsed >= Core.MIN_MS) {
      state.report = Core.completeFocus(state, elapsed, false, now);
      state.lastEvent = { type: 'focusStopped', at: now };
    }
  }
  await readyTimer(state, 'focus');
}

// ---- notifications & badge --------------------------------------------------

function notify(id, title, message, settings) {
  if (!settings.notifications || !api.notifications) return;
  try {
    api.notifications.create(`focusling-${id}-${Date.now()}`, {
      type: 'basic',
      iconUrl: api.runtime.getURL('icons/icon128.png'),
      title, message,
    });
  } catch (e) { /* notifications are best effort */ }
}

async function updateBadge(state, now) {
  const t = state.timer;
  let text = '', color = '#e5484d';
  if (!state.pet.alive) { text = 'RIP'; color = '#6b7280'; }
  else if (t.phase === 'running') {
    text = String(Math.max(1, Math.ceil((t.endsAt - now) / Core.MIN_MS)));
    color = t.mode === 'focus' ? '#e5484d' : '#30a46c';
  } else if (t.phase === 'paused') { text = '❚❚'; color = '#f5a524'; }
  try {
    await api.action.setBadgeText({ text });
    await api.action.setBadgeBackgroundColor({ color });
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ color: '#ffffff' });
  } catch (e) { /* older browsers */ }
}

// ---- periodic upkeep --------------------------------------------------------

async function tick() {
  await withState(async (state, now) => {
    Core.ensureDay(state, now);
    const t = state.timer;
    if (t.phase === 'running' && t.endsAt <= now) {
      await finishSession(state, now);
    } else if (t.phase === 'running' && t.mode === 'focus') {
      state.stats.lastFocusAt = now; // studying right now → no decay
    }
    const wasAlive = state.pet.alive;
    const events = Core.applyDecay(state, now);
    const name = Core.petDisplayName(state.pet);
    for (const ev of events) {
      if (ev.type === 'died' && wasAlive) {
        notify('died', `${name} has fainted…`, 'Your pet starved from neglect. Open Focusling to revive it and start fresh.', state.settings);
      } else if (ev.type === 'shield') {
        notify('shield', `${name} used a shield`, 'A streak shield saved your pet. Study soon to keep it alive!', state.settings);
      }
    }
    const day = Core.dayKey(now);
    if (state.pet.alive && state.pet.hp < 25 && state.notified.lowHpDay !== day) {
      state.notified.lowHpDay = day;
      notify('hungry', `${name} is starving!`, 'Start a focus session to feed your pet before it faints.', state.settings);
    }
  });
}

async function ensureAlarms() {
  const existing = await api.alarms.get(TICK);
  if (!existing) await api.alarms.create(TICK, { periodInMinutes: 1 });
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK || alarm.name === SESSION_END) tick();
});

api.runtime.onInstalled.addListener(async () => {
  await ensureAlarms();
  await withState(async () => {});
});
api.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await tick();
});
// Service workers are also woken by messages/alarms; make sure the tick exists.
ensureAlarms().catch(() => {});

// ---- messages from the popup / arena ---------------------------------------

async function handle(msg) {
  switch (msg.type) {
    case 'get':
      return withState(async (state, now) => {
        Core.ensureDay(state, now);
        if (state.timer.phase === 'running' && state.timer.endsAt <= now) await finishSession(state, now);
        Core.applyDecay(state, now);
        return state;
      });
    case 'timer':
      return withState(async (state, now) => {
        const t = state.timer;
        switch (msg.action) {
          case 'start':
            if (!state.pet.alive) break;
            await startTimer(state, msg.mode || t.mode, now);
            state.onboarded = true;
            break;
          case 'pause': await pauseTimer(state, now); break;
          case 'resume': await resumeTimer(state, now); break;
          case 'stop': await abandonSession(state, now); break;
          case 'skip':
            if (t.mode === 'focus') await abandonSession(state, now);
            else await readyTimer(state, 'focus');
            break;
          case 'reset-cycle': t.cycle = 0; await readyTimer(state, 'focus'); break;
        }
        return state;
      });
    case 'setTask':
      return withState(async (state) => { state.timer.task = String(msg.task || '').slice(0, 120); return state; });
    case 'setAvatar':
      return withState(async (state) => {
        if (state.unlocked.includes(msg.id)) state.pet.avatar = msg.id;
        return state;
      });
    case 'rename':
      return withState(async (state) => {
        const name = String(msg.name || '').trim().slice(0, 24);
        if (name) state.pet.name = name;
        return state;
      });
    case 'settings':
      return withState(async (state, now) => {
        const s = state.settings;
        const p = msg.patch || {};
        const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Core.clamp(Math.round(n), lo, hi) : d; };
        if ('focusMin' in p) s.focusMin = num(p.focusMin, 1, 180, s.focusMin);
        if ('shortMin' in p) s.shortMin = num(p.shortMin, 1, 60, s.shortMin);
        if ('longMin' in p) s.longMin = num(p.longMin, 1, 120, s.longMin);
        if ('longEvery' in p) s.longEvery = num(p.longEvery, 1, 12, s.longEvery);
        if ('graceHours' in p) s.graceHours = num(p.graceHours, 0, 168, s.graceHours);
        if ('hoursToDie' in p) s.hoursToDie = num(p.hoursToDie, 1, 720, s.hoursToDie);
        for (const k of ['autoStartBreaks', 'autoStartFocus', 'notifications', 'sound', 'decayEnabled', 'shieldEnabled']) {
          if (k in p) s[k] = !!p[k];
        }
        if (Array.isArray(p.shieldDomains)) {
          s.shieldDomains = p.shieldDomains.map(d => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean).slice(0, 100);
        }
        if (state.timer.phase === 'ready') await readyTimer(state, state.timer.mode);
        state.lastDecayAt = now;
        return state;
      });
    case 'kills':
      return withState(async (state, now) => {
        const r = Core.addArenaKills(state, msg, now);
        return Object.assign({ state }, r);
      });
    case 'ackReport':
      return withState(async (state) => { state.report = null; return state; });
    case 'revive':
      return withState(async (state, now) => {
        if (!state.pet.alive) Core.revive(state, now);
        await readyTimer(state, 'focus');
        return state;
      });
    case 'fitWindow': {
      // {windowId, width, height, left, top} — sizes are outer sizes computed by the page.
      const w = msg.windowId;
      if (w == null || !api.windows) return { ok: false };
      const patch = {};
      for (const k of ['width', 'height', 'left', 'top']) if (Number.isFinite(msg[k])) patch[k] = Math.max(0, Math.round(msg[k]));
      try { await api.windows.update(w, patch); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
    }
    case 'onboarded':
      return withState(async (state) => { state.onboarded = true; return state; });
    case 'reset':
      return withState(async (state, now) => {
        const fresh = Core.defaultState(now);
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, fresh);
        await api.alarms.clear(SESSION_END);
        return state;
      });
    default:
      throw new Error(`Unknown message type: ${msg && msg.type}`);
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg).then(sendResponse, (err) => sendResponse({ error: String(err && err.message || err) }));
  return true; // keep the channel open for the async response
});

// ---- mini window --------------------------------------------------------------
// Clicking the toolbar icon opens (or focuses) a small always-available window
// with the arena. The page itself parks the window in the top-right corner
// because only a page knows the screen size.

const MINI_URL = api.runtime.getURL('popup.html');
const MINI = { width: 384, height: 300 };

async function findMiniWindow() {
  try {
    const wins = await api.windows.getAll({ populate: true });
    for (const w of wins) {
      if (w.type !== 'popup' || !w.tabs) continue;
      if (w.tabs.some(t => (t.url || t.pendingUrl || '').startsWith(MINI_URL))) return w;
    }
  } catch (e) { /* no windows API */ }
  return null;
}

async function openMini() {
  const existing = await findMiniWindow();
  if (existing) {
    try { await api.windows.update(existing.id, { focused: true, drawAttention: true }); return; } catch (e) { /* fallthrough */ }
  }
  try {
    await api.windows.create({ url: MINI_URL, type: 'popup', width: MINI.width, height: MINI.height, focused: true });
  } catch (e) {
    // No windows API (e.g. some mobile browsers): fall back to a tab.
    await api.tabs.create({ url: MINI_URL });
  }
}

if (api.action && api.action.onClicked) api.action.onClicked.addListener(() => { openMini(); });

// ---- distraction shield -----------------------------------------------------

function hostBlocked(url, domains) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  if (!/^https?:/.test(url)) return false;
  return domains.some(d => host === d || host.endsWith('.' + d));
}

if (api.tabs && api.tabs.onUpdated) {
  api.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    const url = info.url || (info.status === 'loading' ? tab && tab.url : null);
    if (!url) return;
    const got = await api.storage.local.get(KEY);
    const state = got[KEY];
    if (!state || !state.settings.shieldEnabled) return;
    const t = state.timer;
    if (!(t.mode === 'focus' && t.phase === 'running' && t.endsAt > Date.now())) return;
    if (!hostBlocked(url, state.settings.shieldDomains || [])) return;
    try {
      await api.tabs.update(tabId, { url: api.runtime.getURL('blocked.html') + '?from=' + encodeURIComponent(url) });
    } catch (e) { /* tab may have closed */ }
  });
}
