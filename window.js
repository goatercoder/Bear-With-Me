/* window.js — Oski's little corner window. Just him, a hidden gear, and a pin
 * that moves him into an always-on-top picture-in-picture window. */
(function () {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  // Elements are cached once: the stage moves into another document when pinned,
  // so document.getElementById would stop finding them.
  const el = {};
  for (const id of ['stage', 'oski', 'tip', 'pin', 'gear', 'panel', 'sites', 'overlay', 'notif', 'off', 'save', 'back', 'reset', 'ver']) el[id] = document.getElementById(id);
  const $ = (id) => el[id];
  const SCALE = 4, H = 26 * SCALE;
  let state = null, win = null, parked = false, pip = null, pipTimer = 0;

  const send = (msg) => api.runtime.sendMessage(msg);
  const attacked = () => !!(state && state.enabled && state.alive && state.activity.kind === 'bad');

  async function fit() {
    if (!win || pip) return;
    const frameW = Math.max(0, window.outerWidth - window.innerWidth), frameH = Math.max(0, window.outerHeight - window.innerHeight);
    const box = $('panel').hidden ? $('stage') : $('panel');
    const width = box.offsetWidth + frameW, height = box.offsetHeight + frameH;
    const msg = { type: 'fitWindow', windowId: win.id, width, height };
    if (!parked) {
      // Use the spot you last dragged him to; otherwise the top-right corner.
      const saved = state && state.winPos;
      msg.left = saved ? saved.left : Math.max(0, (screen.availLeft || 0) + (screen.availWidth || 1200) - width - 6);
      msg.top = saved ? saved.top : (screen.availTop || 0) + 6;
    }
    try { const r = await send(msg); if (r && r.ok) parked = true; } catch (e) { /* fine */ }
  }

  // ---- drag Oski to move his window around the screen ------------------------
  function addWindowDragging() {
    const stage = $('stage');
    let drag = null, pending = null, raf = 0;
    const flush = () => {
      raf = 0;
      if (!pending || !win) return;
      send({ type: 'fitWindow', windowId: win.id, left: pending.left, top: pending.top }).catch(() => {});
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pip || e.target === $('gear') || e.target === $('pin')) return;
      // Where the pointer sits inside the window frame, so the cursor keeps its grip.
      drag = { pointerId: e.pointerId, offX: e.screenX - window.screenX, offY: e.screenY - window.screenY, moved: false };
      stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const left = Math.round(e.screenX - drag.offX), top = Math.round(e.screenY - drag.offY);
      if (Math.abs(left - window.screenX) > 3 || Math.abs(top - window.screenY) > 3) drag.moved = true;
      pending = { left: Math.max(0, left), top: Math.max(0, top) };
      if (!raf) raf = requestAnimationFrame(flush);
    });
    const end = async (e) => {
      if (!drag || (e && e.pointerId !== drag.pointerId)) return;
      const moved = drag.moved;
      stage.classList.remove('dragging');
      drag = null;
      if (moved) { parked = true; if (pending) send({ type: 'setPos', winPos: pending }).catch(() => {}); }
      else if (state && !state.alive) { state = await send({ type: 'revive' }); render(); }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  function describe(s) {
    if (!s.enabled) return 'Oski is off · click ⚙';
    if (!s.alive) return `Oski is dead · click him to revive (${s.deaths} death${s.deaths === 1 ? '' : 's'})`;
    const pct = Math.ceil(s.health), k = s.activity.kind;
    const doing = k === 'bad' ? `the Tree is killing him on ${s.activity.host}` : k === 'idle' ? 'idle… he is fading' : k === 'away' ? 'waiting' : s.health < 100 ? 'healing' : 'happy';
    return `${pct}% · ${doing}` + (pip ? '' : ' · drag to move');
  }

  function layout() {
    const tree = attacked();
    const w = Oski.widthFor(SCALE, tree);
    const c = $('oski');
    if (c.width !== w) { c.width = w; c.height = H; }
    $('stage').classList.toggle('tree', tree);
    if (pip) { try { pip.resizeTo(tree ? 200 : 126, H + 12); } catch (e) { /* needs a gesture in some versions */ } }
    else fit();
  }

  function render() {
    if (!state) return;
    $('tip').textContent = describe(state);
    document.title = state.alive ? `Oski ${Math.ceil(state.health)}%` : 'Oski is dead';
    layout();
  }

  function frame(t) {
    if (state) Oski.draw($('oski'), state.health, state.alive, t, { tree: attacked(), hitAt: state.lastHitAt, scale: SCALE });
    (pip || window).requestAnimationFrame(frame);
  }

  async function refresh() { try { const s = await send({ type: 'get' }); if (s && !s.error) { state = s; render(); } } catch (e) { /* worker restarting */ } }

  function showPanel(show) {
    $('panel').hidden = !show; $('stage').hidden = show;
    if (show) {
      $('sites').value = state.sites.join('\n');
      $('overlay').checked = !!state.overlay; $('notif').checked = !!state.notifications;
      $('off').textContent = state.enabled ? 'Turn Oski off' : 'Turn Oski on';
    }
    fit();
  }

  // ---- always on top (Document Picture-in-Picture, Chrome 116+) ----------------
  async function pin() {
    if (pip) { pip.focus(); return; }
    if (!('documentPictureInPicture' in window)) { $('tip').textContent = 'Needs Chrome 116+ for always-on-top'; return; }
    const stage = $('stage');
    try {
      pip = await window.documentPictureInPicture.requestWindow({ width: attacked() ? 200 : 126, height: H + 12 });
    } catch (e) { $('tip').textContent = 'Could not open the floating window'; return; }
    for (const ss of document.styleSheets) {
      try { const st = pip.document.createElement('style'); st.textContent = [...ss.cssRules].map(r => r.cssText).join('\n'); pip.document.head.appendChild(st); } catch (e) { /* ignore */ }
    }
    pip.document.body.style.cssText = 'margin:0;background:#0b0d14;overflow:hidden;display:grid;place-items:center;height:100vh';
    pip.document.body.appendChild(stage);
    $('pin').textContent = '↩'; $('pin').title = 'Back to the normal window';
    $('tip').textContent = 'Drag the bar at the top of this window to move Oski';
    // the floating window is visible, so its timers are never throttled — poll from there
    pipTimer = pip.setInterval(refresh, 1000);
    pip.addEventListener('pagehide', () => {
      pip.clearInterval(pipTimer); pip = null;
      document.body.prepend(stage);
      $('pin').textContent = '📌'; $('pin').title = 'Keep Oski on top of everything (picture-in-picture)';
      if (win) send({ type: 'fitWindow', windowId: win.id, state: 'normal' }).then(fit).catch(() => {});
      layout();
    });
    // tuck the opener window away; it has to stay open for the floating one to live
    if (win) { try { await send({ type: 'fitWindow', windowId: win.id, state: 'minimized' }); } catch (e) { /* fine */ } }
  }

  async function init() {
    try { $('ver').textContent = api.runtime.getManifest().version; } catch (e) { /* not an extension page */ }
    try { const w = api.windows && await api.windows.getCurrent(); if (w && w.type === 'popup') win = { id: w.id }; } catch (e) { /* tab */ }
    await refresh();
    requestAnimationFrame(frame);
    fit();
    setInterval(refresh, 1000);
    api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.oski && ch.oski.newValue) { state = ch.oski.newValue; render(); } });
    addWindowDragging();
    $('pin').addEventListener('click', () => { if (pip) pip.close(); else pin(); });
    $('gear').addEventListener('click', () => { if (pip) pip.close(); showPanel(true); });
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
