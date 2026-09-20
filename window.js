/* window.js — Oski's little corner window. Just him, plus a hidden gear. */
(function () {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const $ = (id) => document.getElementById(id);
  let state = null, win = null, parked = false;

  const send = (msg) => api.runtime.sendMessage(msg);

  async function fit() {
    if (!win) return;
    const frameW = Math.max(0, window.outerWidth - window.innerWidth), frameH = Math.max(0, window.outerHeight - window.innerHeight);
    const el = $('panel').hidden ? $('stage') : $('panel');
    const width = el.offsetWidth + frameW, height = el.offsetHeight + frameH;
    const msg = { type: 'fitWindow', windowId: win.id, width, height };
    if (!parked) { msg.left = Math.max(0, (screen.availLeft || 0) + (screen.availWidth || 1200) - width - 6); msg.top = (screen.availTop || 0) + 6; }
    try { const r = await send(msg); if (r && r.ok) parked = true; } catch (e) { /* fine */ }
  }

  function describe(s) {
    if (!s.enabled) return 'Oski is off · click ⚙';
    if (!s.alive) return `Oski is dead · click him to revive (${s.deaths} death${s.deaths === 1 ? '' : 's'})`;
    const pct = Math.ceil(s.health);
    const k = s.activity.kind;
    const doing = k === 'bad' ? `bleeding on ${s.activity.host}` : k === 'idle' ? 'idle… he is fading' : k === 'away' ? 'waiting' : s.health < 100 ? 'healing' : 'happy';
    return `${pct}% · ${doing}`;
  }

  function render() {
    if (!state) return;
    $('tip').textContent = describe(state);
    document.title = state.alive ? `Oski ${Math.ceil(state.health)}%` : 'Oski is dead';
  }

  function frame(t) { if (state) Oski.draw($('oski'), state.health, state.alive, t); requestAnimationFrame(frame); }

  async function refresh() { try { state = await send({ type: 'get' }); render(); } catch (e) { /* worker restarting */ } }

  function showPanel(show) {
    $('panel').hidden = !show; $('stage').hidden = show;
    if (show) {
      $('sites').value = state.sites.join('\n');
      $('overlay').checked = !!state.overlay; $('notif').checked = !!state.notifications;
      $('off').textContent = state.enabled ? 'Turn Oski off' : 'Turn Oski on';
    }
    fit();
  }

  async function init() {
    try { $('ver').textContent = api.runtime.getManifest().version; } catch (e) { /* not an extension page */ }
    try { const w = api.windows && await api.windows.getCurrent(); if (w && w.type === 'popup') win = { id: w.id }; } catch (e) { /* tab */ }
    await refresh();
    requestAnimationFrame(frame);
    fit();
    setInterval(refresh, 1000);
    api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.oski && ch.oski.newValue) { state = ch.oski.newValue; render(); } });
    $('stage').addEventListener('click', async (e) => {
      if (e.target === $('gear')) return;
      if (state && !state.alive) { state = await send({ type: 'revive' }); render(); }
    });
    $('gear').addEventListener('click', () => showPanel(true));
    $('back').addEventListener('click', () => showPanel(false));
    $('save').addEventListener('click', async () => {
      state = await send({ type: 'settings', sites: $('sites').value.split(/[\n,]+/), overlay: $('overlay').checked, notifications: $('notif').checked });
      showPanel(false);
    });
    $('off').addEventListener('click', async () => { state = await send({ type: 'toggle' }); showPanel(false); render(); });
    $('reset').addEventListener('click', async () => { if (confirm('Reset Oski completely?')) { state = await send({ type: 'reset' }); showPanel(false); render(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('panel').hidden) showPanel(false); });
  }
  init();
})();
