/* rules.js — how Oski gets hurt and heals. Pure functions, no browser APIs. */
(function (root) {
  'use strict';

  // Health per second for each kind of activity.
  const RATES = {
    bad:  -100 / (20 * 60),   // 20 minutes on distracting sites kills a healthy Oski
    idle: -100 / (120 * 60),  // 2 hours of not touching the computer kills him
    away: 0,                  // browser not focused (you might be reading a book) — nothing happens
    good: +100 / (90 * 60),   // 90 minutes of real browsing heals him fully
    off: 0,                   // Oski is switched off
  };

  const ENTRY_HIT = 8;        // instant damage the moment you land on a taboo site

  const DEFAULT_SITES = ['clashroyaleapi.com', 'reddit.com', 'youtube.com', 'instagram.com'];

  // The list shipped before 2.3.0. If someone still has exactly this, they never
  // edited it, so an upgrade quietly moves them to the new defaults.
  const LEGACY_DEFAULT_SITES = [
    'youtube.com', 'instagram.com', 'reddit.com', 'twitter.com', 'x.com',
    'royaleapi.com', 'clashroyale.com', 'statsroyale.com', 'tiktok.com',
  ];

  function defaultState(now) {
    return {
      version: 3,
      enabled: true,
      health: 100,
      alive: true,
      deaths: 0,
      sites: DEFAULT_SITES.slice(),
      overlay: true,           // show Oski on web pages, not just in his window
      onlyOnTaboo: false,      // ...and if this is on, only while you're on a taboo site
      notifications: true,
      activity: { kind: 'good', since: now, host: '' },
      lastSettle: now,
      warned: {},              // { '50': true, '20': true } reset on revive
      lastHitAt: 0,            // for the blood-burst animation
      pos: { rx: 0.01, ty: 0.02 },  // where Oski sits on a web page, as fractions of the viewport
      winPos: null,            // where you dragged his own little window to, in screen pixels
      diedAt: 0,
    };
  }

  function normalizeHost(s) {
    return String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
  }

  function hostOf(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; }
    catch (e) { return ''; }
  }

  function isBadHost(host, sites) {
    if (!host) return false;
    return sites.some(d => host === d || host.endsWith('.' + d));
  }

  /** Apply the time since the last settle at the current activity's rate. Returns events. */
  function settle(state, now) {
    const events = [];
    const dt = Math.max(0, now - (state.lastSettle || now)) / 1000;
    state.lastSettle = now;
    if (!state.enabled || !state.alive || dt === 0) return events;
    const kind = state.activity.kind;
    const before = state.health;
    state.health = Math.max(0, Math.min(100, state.health + RATES[kind] * dt));
    for (const mark of [50, 20]) {
      if (before > mark && state.health <= mark && !state.warned[mark]) { state.warned[mark] = true; events.push({ type: 'warn', mark, host: state.activity.host }); }
    }
    if (state.health <= 0) {
      state.alive = false; state.diedAt = now; state.deaths += 1;
      events.push({ type: 'died', host: state.activity.host, kind });
    }
    return events;
  }

  /** Switch activity (settling first so the old one is charged correctly). */
  function setActivity(state, kind, host, now) {
    const events = settle(state, now);
    const prev = state.activity;
    if (prev.kind !== kind || prev.host !== host) {
      state.activity = { kind, since: now, host: host || '' };
      // Landing on a taboo site (or hopping to another one) draws blood immediately.
      if (kind === 'bad' && state.enabled && state.alive && (prev.kind !== 'bad' || prev.host !== host)) {
        state.health = Math.max(0, state.health - ENTRY_HIT);
        state.lastHitAt = now;
        events.push({ type: 'hit', host });
        if (state.health <= 0) { state.alive = false; state.diedAt = now; state.deaths += 1; events.push({ type: 'died', host, kind }); }
      }
    }
    return events;
  }

  function revive(state, now) {
    state.health = 100; state.alive = true; state.warned = {}; state.lastSettle = now; state.diedAt = 0;
  }

  /**
   * Keep a dragged position on screen. `rx` is the gap from the right edge and
   * `ty` the gap from the top, both as fractions of the viewport, so the spot
   * survives a window resize or a different monitor.
   */
  function clampPos(pos, viewW, viewH, oskiW, oskiH) {
    const rx = Number(pos ? pos.rx : NaN), ty = Number(pos ? pos.ty : NaN);
    const maxRx = viewW > 0 ? Math.max(0, (viewW - oskiW) / viewW) : 0;
    const maxTy = viewH > 0 ? Math.max(0, (viewH - oskiH) / viewH) : 0;
    return {
      rx: Math.min(maxRx, Math.max(0, Number.isFinite(rx) ? rx : 0.01)),
      ty: Math.min(maxTy, Math.max(0, Number.isFinite(ty) ? ty : 0.02)),
    };
  }

  function sameList(a, b) {
    return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
  }

  /**
   * Bring a stored state up to date without losing the pet. Unknown-but-missing
   * fields get their defaults; everything already there is kept.
   */
  function migrate(state, now) {
    if (!state || typeof state !== 'object') return defaultState(now);
    const fresh = defaultState(now);
    for (const k of Object.keys(fresh)) if (state[k] === undefined || state[k] === null) state[k] = fresh[k];
    if (sameList(state.sites, LEGACY_DEFAULT_SITES)) state.sites = DEFAULT_SITES.slice();
    state.pos = clampPos(state.pos, 1, 1, 0, 0);
    state.version = fresh.version;
    return state;
  }

  const Rules = { RATES, ENTRY_HIT, DEFAULT_SITES, LEGACY_DEFAULT_SITES, clampPos, migrate, defaultState, normalizeHost, hostOf, isBadHost, settle, setActivity, revive };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
  root.Rules = Rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
