/* overlay.js — content script: a small Oski pinned over every web page, so he
 * bleeds right there on YouTube in front of you. The Stanford Tree walks in
 * from the left and beats him while you're there.
 * Drag him anywhere on the page; the spot is remembered and every other tab
 * moves him to match. */
(function () {
  'use strict';
  if (window.top !== window || document.getElementById('oski-corner-host')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  const SCALE = 3, H = 26 * SCALE;
  let state = null, host = null, canvas = null, tip = null, box = null;
  let drag = null;       // { pointerId, startX, startY, rx, ty, moved }

  const attacked = () => !!(state && state.enabled && state.alive && state.activity.kind === 'bad');

  function mount() {
    host = document.createElement('div');
    host.id = 'oski-corner-host';
    host.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;height:' + H + 'px;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .box { position: relative; height: ${H}px; pointer-events: auto; cursor: grab; touch-action: none; }
      .box.dragging { cursor: grabbing; }
      canvas { image-rendering: pixelated; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      .tip { position: absolute; top: 100%; right: 0; margin-top: 2px; background: rgba(11,13,20,.92); color: #e8ebf7; font: 11px system-ui, sans-serif; padding: 3px 7px; border-radius: 6px; white-space: nowrap; opacity: 0; transition: opacity .15s; pointer-events: none; }
      .box:hover .tip { opacity: 1; }`;
    box = document.createElement('div'); box.className = 'box';
    canvas = document.createElement('canvas'); canvas.width = Oski.widthFor(SCALE, false); canvas.height = H;
    tip = document.createElement('div'); tip.className = 'tip';
    box.appendChild(canvas); box.appendChild(tip);
    root.appendChild(style); root.appendChild(box);
    addDragging();
    (document.body || document.documentElement).appendChild(host);
    place();
  }

  /** Put him where he was last dragged to, anchored on his right edge so the
   *  Tree can appear beside him without pushing him off the screen. */
  function place() {
    if (!host || drag) return;
    const p = fitPos(state && state.pos);
    host.style.right = Math.round(p.rx * window.innerWidth) + 'px';
    host.style.top = Math.round(p.ty * window.innerHeight) + 'px';
  }

  const fitPos = (pos) => Rules.clampPos(pos, window.innerWidth, window.innerHeight, (canvas && canvas.width) || 90, H);

  /** Is THIS page one of the taboo sites? Asked per page, not per browser. */
  function tabooHere() {
    return !!(state && Rules.isBadHost(Rules.hostOf(location.href), state.sites || []));
  }

  /** Should he be drawn over this page at all? */
  function visible() {
    if (!state || !state.enabled || !state.overlay) return false;
    return state.onlyOnTaboo ? tabooHere() : true;
  }

  function addDragging() {
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = fitPos(state && state.pos);
      drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, rx: p.rx, ty: p.ty, moved: false };
      box.classList.add('dragging');
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      // dragging right shrinks the gap from the right edge
      const next = fitPos({ rx: drag.rx - dx / window.innerWidth, ty: drag.ty + dy / window.innerHeight });
      host.style.right = Math.round(next.rx * window.innerWidth) + 'px';
      host.style.top = Math.round(next.ty * window.innerHeight) + 'px';
      drag.next = next;
    });
    const end = async (e) => {
      if (!drag || (e && e.pointerId !== drag.pointerId)) return;
      const moved = drag.moved, next = drag.next;
      box.classList.remove('dragging');
      drag = null;
      if (moved && next) { try { state = await api.runtime.sendMessage({ type: 'setPos', pos: next }); } catch (err) { /* ignore */ } }
      else if (state && !state.alive) { try { state = await api.runtime.sendMessage({ type: 'revive' }); } catch (err) { /* ignore */ } }
      place();
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    window.addEventListener('resize', place);
  }

  function describe(s) {
    if (!s.alive) return 'Oski is dead — click to revive · drag to move';
    const k = s.activity.kind, pct = Math.ceil(s.health);
    return k === 'bad' ? `${pct}% · the Tree is killing Oski. Leave this site.` : s.health < 100 ? `${pct}% · healing · drag to move` : 'Oski is fine · drag to move';
  }

  async function refresh() {
    if (document.hidden) return;
    try { state = await api.runtime.sendMessage({ type: 'get' }); } catch (e) { return; }
    if (!state || state.error) return;
    const show = visible();
    if (show && !host) mount();
    if (host) {
      host.style.display = show ? '' : 'none';
      tip.textContent = describe(state);
      const w = Oski.widthFor(SCALE, attacked());
      if (canvas.width !== w) { canvas.width = w; canvas.height = H; }
      place();
    }
  }

  function frame(t) {
    if (state && host && host.style.display !== 'none') Oski.draw(canvas, state.health, state.alive, t, { tree: attacked(), hitAt: state.lastHitAt, scale: SCALE });
    requestAnimationFrame(frame);
  }

  refresh(); setInterval(refresh, 1000); requestAnimationFrame(frame);
})();
