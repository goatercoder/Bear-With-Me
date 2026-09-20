/* overlay.js — content script: a small Oski pinned to the top-right corner of
 * every web page, so he bleeds right there on YouTube in front of you. */
(function () {
  'use strict';
  if (window.top !== window || document.getElementById('oski-corner-host')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  const SIZE = 78;
  let state = null, host = null, canvas = null, tip = null, box = null;

  function mount() {
    host = document.createElement('div');
    host.id = 'oski-corner-host';
    host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;width:' + SIZE + 'px;height:' + SIZE + 'px;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .box { position: relative; width: ${SIZE}px; height: ${SIZE}px; pointer-events: auto; cursor: default; }
      canvas { image-rendering: pixelated; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      .tip { position: absolute; top: 100%; right: 0; margin-top: 2px; background: rgba(11,13,20,.92); color: #e8ebf7; font: 11px system-ui, sans-serif; padding: 3px 7px; border-radius: 6px; white-space: nowrap; opacity: 0; transition: opacity .15s; pointer-events: none; }
      .box:hover .tip { opacity: 1; }
      .dead { cursor: pointer; }`;
    box = document.createElement('div'); box.className = 'box';
    canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
    tip = document.createElement('div'); tip.className = 'tip';
    box.appendChild(canvas); box.appendChild(tip);
    root.appendChild(style); root.appendChild(box);
    box.addEventListener('click', async () => { if (state && !state.alive) { try { state = await api.runtime.sendMessage({ type: 'revive' }); } catch (e) { /* ignore */ } } });
    (document.body || document.documentElement).appendChild(host);
  }

  function describe(s) {
    if (!s.alive) return 'Oski is dead — click to revive';
    const k = s.activity.kind, pct = Math.ceil(s.health);
    return k === 'bad' ? `${pct}% · this site is killing Oski` : s.health < 100 ? `${pct}% · healing` : 'Oski is fine';
  }

  async function refresh() {
    if (document.hidden) return;
    try { state = await api.runtime.sendMessage({ type: 'get' }); } catch (e) { return; }
    if (!state || state.error) return;
    const show = state.enabled && state.overlay;
    if (show && !host) mount();
    if (host) {
      host.style.display = show ? '' : 'none';
      tip.textContent = describe(state);
      box.classList.toggle('dead', !state.alive);
    }
  }

  function frame(t) { if (state && host && host.style.display !== 'none') Oski.draw(canvas, state.health, state.alive, t); requestAnimationFrame(frame); }

  refresh(); setInterval(refresh, 1000); requestAnimationFrame(frame);
})();
