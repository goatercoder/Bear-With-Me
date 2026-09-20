/* background.js — watches what you do and hurts or heals Oski accordingly.
 * Activity kinds: good (working in the browser), bad (on a distracting site),
 * idle (no keyboard/mouse for a minute), away (browser not focused), off.
 * Time is charged at each activity change, on a 30-second alarm, and whenever
 * the window/overlay asks for state, so the picture stays smooth. */
if (typeof importScripts === 'function' && typeof Rules === 'undefined') importScripts('rules.js');

const api = globalThis.browser ?? globalThis.chrome;
const KEY = 'oski';
const TICK = 'oski-tick';
const IDLE_SECONDS = 60;
const WINDOW_URL = api.runtime.getURL('window.html');

let chain = Promise.resolve();
function withState(fn) {
  const run = chain.then(async () => {
    const got = await api.storage.local.get(KEY);
    const now = Date.now();
    let state = Rules.migrate(got[KEY], now);
    const result = await fn(state, now);
    await api.storage.local.set({ [KEY]: state });
    updateBadge(state);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

// ---- figuring out what you're doing ----------------------------------------

async function currentActivity(state) {
  if (!state.enabled) return { kind: 'off', host: '' };
  try {
    const idle = await api.idle.queryState(IDLE_SECONDS);
    if (idle !== 'active') return { kind: 'idle', host: '' };
  } catch (e) { /* no idle API */ }
  let focused = null;
  try {
    const wins = await api.windows.getAll({ populate: true, windowTypes: ['normal'] });
    focused = wins.find(w => w.focused) || null;
    if (!focused) {
      // Oski's own little window has focus → count as good (you're looking at him).
      const all = await api.windows.getAll({ populate: true });
      const oskiWin = all.find(w => w.focused && w.tabs && w.tabs.some(t => (t.url || '').startsWith(WINDOW_URL)));
      return oskiWin ? { kind: 'good', host: '' } : { kind: 'away', host: '' };
    }
  } catch (e) { return { kind: 'good', host: '' }; }
  const tab = (focused.tabs || []).find(t => t.active);
  const host = Rules.hostOf(tab && tab.url || '');
  return Rules.isBadHost(host, state.sites) ? { kind: 'bad', host } : { kind: 'good', host };
}

async function reclassify() {
  return withState(async (state, now) => {
    const a = await currentActivity(state);
    const events = Rules.setActivity(state, a.kind, a.host, now);
    announce(state, events);
    return state;
  });
}

// ---- notifications & badge ---------------------------------------------------

function notify(id, title, message) {
  if (!api.notifications) return;
  try { api.notifications.create(`oski-${id}-${Date.now()}`, { type: 'basic', iconUrl: api.runtime.getURL('icons/icon128.png'), title, message }); } catch (e) { /* best effort */ }
}
function announce(state, events) {
  if (!state.notifications) return;
  for (const ev of events) {
    const where = ev.host ? ` on ${ev.host}` : ev.kind === 'idle' ? ' while you were idle' : '';
    if (ev.type === 'warn' && ev.mark === 50) notify('warn50', 'Oski is bleeding', `He's at 50%${where}. Get back to work.`);
    else if (ev.type === 'warn' && ev.mark === 20) notify('warn20', 'Oski is dying', `20% left${where}. He can still be saved.`);
    else if (ev.type === 'died') notify('died', 'Oski is dead', `You let him die${where}. Click the Oski icon to bring him back.`);
  }
}
function updateBadge(state) {
  let text = '', color = '#b3111b';
  if (!state.enabled) { text = 'off'; color = '#6b7280'; }
  else if (!state.alive) { text = 'RIP'; color = '#111111'; }
  else if (state.health < 100) { text = String(Math.ceil(state.health)); color = state.health > 50 ? '#fdb515' : '#b3111b'; }
  try { api.action.setBadgeText({ text }); api.action.setBadgeBackgroundColor({ color }); if (api.action.setBadgeTextColor) api.action.setBadgeTextColor({ color: '#ffffff' }); } catch (e) { /* older browsers */ }
}

// ---- events ------------------------------------------------------------------

async function ensureAlarm() {
  const a = await api.alarms.get(TICK);
  if (!a) await api.alarms.create(TICK, { periodInMinutes: 0.5 });
}
api.alarms.onAlarm.addListener((a) => { if (a.name === TICK) reclassify(); });
// Chrome only injects content scripts into pages loaded after the extension was
// (re)loaded, so put Oski into every tab that is already open.
async function injectEverywhere() {
  if (!api.scripting) return;
  let tabs = [];
  try { tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const t of tabs) {
    try { await api.scripting.executeScript({ target: { tabId: t.id }, files: ['rules.js', 'oski.js', 'overlay.js'] }); } catch (e) { /* chrome://, store pages, discarded tabs */ }
  }
}
api.runtime.onInstalled.addListener(async () => { await ensureAlarm(); await reclassify(); await injectEverywhere(); });
api.runtime.onStartup.addListener(async () => { await ensureAlarm(); await reclassify(); });
ensureAlarm().catch(() => {});

api.tabs.onActivated.addListener(() => reclassify());
api.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') reclassify(); });
api.windows.onFocusChanged.addListener(() => reclassify());
if (api.idle) { try { api.idle.setDetectionInterval(IDLE_SECONDS); } catch (e) { /* firefox */ } api.idle.onStateChanged.addListener(() => reclassify()); }

// ---- the corner window ----------------------------------------------------------

async function findWindow() {
  try {
    const wins = await api.windows.getAll({ populate: true });
    return wins.find(w => w.type === 'popup' && w.tabs && w.tabs.some(t => (t.url || t.pendingUrl || '').startsWith(WINDOW_URL))) || null;
  } catch (e) { return null; }
}
async function openWindow() {
  const existing = await findWindow();
  if (existing) { try { await api.windows.update(existing.id, { focused: true, drawAttention: true }); return; } catch (e) { /* fallthrough */ } }
  try { await api.windows.create({ url: WINDOW_URL, type: 'popup', width: 132, height: 150, focused: true }); }
  catch (e) { await api.tabs.create({ url: WINDOW_URL }); }
}

// Toolbar click: start Oski (and revive him if he's dead) and show his window.
api.action.onClicked.addListener(async () => {
  await withState(async (state, now) => {
    Rules.settle(state, now);
    if (!state.enabled) { state.enabled = true; state.lastSettle = now; }
    if (!state.alive) Rules.revive(state, now);
  });
  await openWindow();
  await reclassify();
});

// ---- messages from the window & overlay ------------------------------------------

async function handle(msg) {
  switch (msg.type) {
    case 'get':
      return withState(async (state, now) => { announce(state, Rules.settle(state, now)); return state; });
    case 'revive':
      return withState(async (state, now) => { Rules.settle(state, now); Rules.revive(state, now); state.enabled = true; return state; });
    case 'toggle':
      return withState(async (state, now) => {
        Rules.settle(state, now);
        state.enabled = msg.enabled != null ? !!msg.enabled : !state.enabled;
        state.activity = { kind: state.enabled ? 'good' : 'off', since: now, host: '' };
        return state;
      }).then(() => reclassify());
    case 'settings':
      return withState(async (state) => {
        if (Array.isArray(msg.sites)) state.sites = msg.sites.map(Rules.normalizeHost).filter(Boolean).slice(0, 200);
        if ('overlay' in msg) state.overlay = !!msg.overlay;
        if ('onlyOnTaboo' in msg) state.onlyOnTaboo = !!msg.onlyOnTaboo;
        if ('notifications' in msg) state.notifications = !!msg.notifications;
        return state;
      }).then(() => reclassify());
    case 'setPos':
      return withState(async (state) => {
        // Where Oski was dragged to on a web page — every tab follows.
        if (msg.pos) state.pos = Rules.clampPos(msg.pos, 1, 1, 0, 0);
        // Where his own window was dragged to on screen.
        if (msg.winPos && Number.isFinite(msg.winPos.left)) state.winPos = { left: Math.round(msg.winPos.left), top: Math.round(msg.winPos.top) };
        return state;
      });
    case 'fitWindow': {
      if (msg.windowId == null || !api.windows) return { ok: false };
      const patch = {};
      if (msg.state) patch.state = msg.state; // 'minimized' while pinned on top, 'normal' to bring it back
      for (const k of ['width', 'height', 'left', 'top']) if (Number.isFinite(msg[k])) patch[k] = Math.max(0, Math.round(msg[k]));
      try { await api.windows.update(msg.windowId, patch); return { ok: true }; } catch (e) { return { ok: false }; }
    }
    case 'reset':
      return withState(async (state, now) => { Object.assign(state, Rules.defaultState(now)); return state; });
    default:
      throw new Error('unknown message ' + (msg && msg.type));
  }
}
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});
