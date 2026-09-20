/* app.js — Focusling window / arena UI.
 * The background worker owns all state; this file only renders it, sends
 * commands and runs the arena animation while the page is open.
 * popup.html is opened as a small window in the top-right corner; the same
 * file with a bigger canvas is arena.html (a normal tab). */
(function () {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const KEY = 'focusling';
  const MINI_WIDTH = 360;
  const $ = (id) => document.getElementById(id);

  let state = null;
  let game = null;
  let lastEventAt = 0;
  let lastLevel = null;
  let lastStage = null;
  let miniWindow = null;   // { id } when this page lives in its own popup window
  let parked = false;      // window has been placed in the top-right corner
  const pendingKills = { kills: 0, xp: 0, bosses: 0, maxCombo: 0 };

  async function send(msg) {
    const res = await api.runtime.sendMessage(msg);
    if (res && res.error) throw new Error(res.error);
    return res;
  }

  function fmtClock(ms) {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function timerRemaining(t, now) { return t.phase === 'running' ? t.endsAt - now : t.remainingMs; }
  function modeName(mode) { return mode === 'focus' ? 'Focus' : mode === 'short' ? 'Short break' : 'Long break'; }

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---- window management ---------------------------------------------------
  // Park the popup window in the top-right corner and size it to the content.
  async function fitWindow() {
    if (!miniWindow) return;
    const frameW = Math.max(0, window.outerWidth - window.innerWidth);
    const frameH = Math.max(0, window.outerHeight - window.innerHeight);
    const width = MINI_WIDTH + frameW;
    const height = Math.min($('app').scrollHeight + frameH, (screen.availHeight || 800) - 16);
    const msg = { type: 'fitWindow', windowId: miniWindow.id, width, height };
    if (!parked) {
      msg.left = Math.max(0, (screen.availLeft || 0) + (screen.availWidth || 1200) - width - 8);
      msg.top = (screen.availTop || 0) + 8;
    }
    try { const r = await send(msg); if (r && r.ok) parked = true; } catch (e) { /* not fatal */ }
  }

  async function detectWindow() {
    if (!api.windows || document.body.classList.contains('arena-page')) return;
    try {
      const w = await api.windows.getCurrent();
      if (w && w.type === 'popup') miniWindow = { id: w.id };
    } catch (e) { /* not in an extension window */ }
  }

  // ---- drawer ----------------------------------------------------------------
  function openDrawer(tab) {
    const drawer = $('drawer');
    drawer.hidden = false;
    for (const b of drawer.querySelectorAll('.tabs button[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
    for (const p of drawer.querySelectorAll('.tab-panel')) p.hidden = p.dataset.panel !== tab;
    if (tab === 'pets') renderPets();
    if (tab === 'settings') fillSettings();
    fitWindow();
  }
  function closeDrawer() { $('drawer').hidden = true; fitWindow(); }
  function drawerTab() { const b = document.querySelector('.tabs button.active'); return b ? b.dataset.tab : 'stats'; }

  // ---- sound ---------------------------------------------------------------
  function beep(kind) {
    if (!state || !state.settings.sound) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'focusDone' ? [523, 659, 784, 1047] : kind === 'breakDone' ? [784, 659, 523] : [440];
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + i * 0.12 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.12 + 0.11);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + i * 0.12); o.stop(ac.currentTime + i * 0.12 + 0.12);
      });
    } catch (e) { /* no audio, no problem */ }
  }

  // ---- render --------------------------------------------------------------
  function drawMini(canvas, avatarId, level, scale) {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(Sprites.render(Sprites.petSprite(avatarId, level), scale), 0, 0);
  }

  function render() {
    if (!state) return;
    const now = Date.now();
    const pet = state.pet, t = state.timer, s = state.settings;
    const level = Core.levelForXp(pet.xp);
    const name = Core.petDisplayName(pet);
    const stage = Sprites.stageFor(pet.avatar, level);
    document.title = `${name} · Focusling`;

    $('petName').textContent = name;
    $('levelBadge').textContent = `Lv ${level}`;
    const mood = Core.hpStatus(pet);
    $('mood').textContent = `${mood.emoji} ${stage.stage ? stage.stage.name.replace(/^Osci\s|\sOsci$/, '') : mood.label}`;
    $('mood').title = `${mood.label}${stage.stage ? ' · ' + stage.stage.name : ''}`;
    drawMini($('avatarMini'), pet.avatar, level, 2);

    // bars (strip under the arena + full bars in the drawer)
    const hpPct = Core.clamp(pet.hp, 0, 100);
    const lvlStart = Core.xpForLevel(level), lvlNext = Core.xpForLevel(level + 1);
    const xpPct = Core.clamp(((pet.xp - lvlStart) / (lvlNext - lvlStart)) * 100, 0, 100);
    for (const id of ['hpFill', 'hpFill2']) { $(id).style.width = `${hpPct}%`; $(id).classList.toggle('low', hpPct < 35); }
    for (const id of ['xpFill', 'xpFill2']) $(id).style.width = `${xpPct}%`;
    $('hpText').textContent = `${Math.ceil(hpPct)} / ${Core.MAX_HP}`;
    $('xpText').textContent = `${pet.xp - lvlStart} / ${lvlNext - lvlStart}`;

    const starve = $('starve');
    const until = Core.timeUntilStarve(state, now);
    if (!pet.alive) { starve.textContent = ''; }
    else if (!s.decayEnabled) { starve.textContent = 'HP decay is off — your pet is safe.'; starve.className = 'hint'; }
    else if (t.mode === 'focus' && t.phase === 'running') { starve.textContent = `Studying now · +${Math.min(30, 5 + s.focusMin)} HP when this block ends`; starve.className = 'hint'; }
    else {
      const h = until / Core.HOUR_MS;
      starve.textContent = h < 12 ? `⚠ ${name} starves in about ${Math.max(1, Math.round(h))}h. Study to feed them!` : `Without studying, ${name} starves in ~${Math.round(h / 24 * 10) / 10} days.`;
      starve.className = h < 12 ? 'hint warn' : 'hint';
    }

    // timer
    const modeEl = $('modeLabel');
    modeEl.textContent = t.phase === 'paused' ? 'Paused' : t.phase === 'ready' ? (t.mode === 'focus' ? 'Ready' : 'Break ready') : (t.mode === 'focus' ? 'Focus' : 'Break');
    modeEl.title = modeName(t.mode);
    modeEl.className = `mode ${t.mode === 'focus' ? 'focus' : 'break'}`;
    const every = Math.max(1, s.longEvery);
    const done = t.cycle % every;
    $('cycleDots').innerHTML = Array.from({ length: every }, (_, i) => i < done ? '<b>●</b>' : '○').join('');
    renderClock();
    const task = $('task');
    if (document.activeElement !== task) task.value = t.task || '';

    const btns = $('timerButtons');
    btns.innerHTML = '';
    const mk = (label, cls, title, onClick) => {
      const b = document.createElement('button');
      b.className = `btn ${cls || ''}`; b.textContent = label; b.title = title || label;
      b.addEventListener('click', onClick); btns.appendChild(b); return b;
    };
    if (!pet.alive) {
      mk('Revive', 'primary', 'Revive your pet', () => $('deathModal').hidden = false);
    } else if (t.phase === 'ready') {
      mk(t.mode === 'focus' ? '▶ Start' : '▶ Break', 'primary', t.mode === 'focus' ? `Start a ${s.focusMin} minute focus block` : `Start ${modeName(t.mode).toLowerCase()}`, () => timer('start'));
      if (t.mode !== 'focus') mk('⏭', 'icon', 'Skip the break', () => timer('skip'));
    } else if (t.phase === 'running') {
      mk('❚❚', 'icon', 'Pause', () => timer('pause'));
      mk('✕', 'icon danger', t.mode === 'focus' ? 'Give up this block' : 'Skip the break', () => timer(t.mode === 'focus' ? 'stop' : 'skip'));
    } else {
      mk('▶', 'primary icon', 'Resume', () => timer('resume'));
      mk('✕', 'icon danger', t.mode === 'focus' ? 'Give up this block' : 'Skip the break', () => timer(t.mode === 'focus' ? 'stop' : 'skip'));
    }

    // stats
    $('sToday').textContent = Core.formatDuration(state.today.focusMs);
    $('sStreak').textContent = Core.effectiveStreak(state, now);
    $('sSessions').textContent = state.stats.sessions;
    $('sKills').textContent = state.stats.totalKills;
    $('sTotal').textContent = Core.formatDuration(state.stats.totalFocusMs);
    $('sShields').textContent = pet.shields;

    // quests
    const ql = $('questList'); ql.innerHTML = '';
    for (const q of state.quests.list) {
      const li = document.createElement('li');
      li.className = `quest${q.done ? ' done' : ''}`;
      li.innerHTML = `<div class="q-text">${q.text}<div class="q-bar"><i style="width:${Math.min(100, q.progress / q.goal * 100)}%"></i></div></div><span class="q-progress">${q.progress}/${q.goal}</span><span class="q-reward">+${q.reward} XP</span>`;
      ql.appendChild(li);
    }

    // last 7 days
    const week = $('week'); week.innerHTML = '';
    const today = Core.dayKey(now);
    const days = Array.from({ length: 7 }, (_, i) => Core.addDays(today, i - 6));
    const minsFor = (d) => d === today ? Math.floor(state.today.focusMs / 60000) : (state.history[d] || 0);
    const max = Math.max(1, ...days.map(minsFor));
    for (const d of days) {
      const min = minsFor(d);
      const el = document.createElement('div');
      el.className = `day${d === today ? ' today' : ''}`; el.title = `${d}: ${min} min`;
      el.innerHTML = `<i style="height:${Math.max(4, min / max * 40)}px"></i><span>${['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d + 'T12:00:00').getDay()]}</span>`;
      week.appendChild(el);
    }

    // arena overlay text
    const ov = $('arenaOverlay');
    if (!pet.alive) { ov.hidden = false; ov.textContent = `${name} has fainted. Revive to start a new adventure.`; }
    else if (t.mode === 'focus' && t.phase === 'running') { ov.hidden = true; }
    else if (t.phase === 'paused') { ov.hidden = false; ov.textContent = 'Paused. The monsters are waiting…'; }
    else if (t.mode !== 'focus' && t.phase === 'running') { ov.hidden = false; ov.textContent = `${name} is resting. Stretch, drink water, look away from the screen.`; }
    else if (t.mode !== 'focus') { ov.hidden = false; ov.textContent = `Break time is ready. ${name} deserves it.`; }
    else { ov.hidden = false; ov.textContent = state.stats.sessions === 0 ? `Press ▶ Start and ${name} will fight for you.` : `Press ▶ Start to send ${name} into battle.`; }

    // game context
    if (game) game.setContext({ avatar: pet.avatar, level, hp: pet.hp, alive: pet.alive, mode: t.mode, running: t.phase === 'running' });
    if (lastLevel !== null && level > lastLevel && !document.hidden) {
      if (lastStage !== null && stage.index > lastStage) toast(`✨ ${name} evolved into ${stage.stage.name}!`);
      else toast(`Level up! ${name} is now level ${level}`);
    }
    lastLevel = level; lastStage = stage.index;

    if (!$('drawer').hidden && drawerTab() === 'pets') renderPets();

    // modals driven by state
    if (state.report && $('deathModal').hidden) showReport(state.report);
    if (!pet.alive && $('reportModal').hidden) showDeath();
    if (!state.onboarded && state.stats.sessions === 0 && pet.alive && !state.report) $('welcomeModal').hidden = false;

    // sound on block end
    if (state.lastEvent && state.lastEvent.at > lastEventAt) {
      if (lastEventAt) beep(state.lastEvent.type);
      lastEventAt = state.lastEvent.at;
    }
  }

  function renderClock() {
    if (!state) return;
    const t = state.timer;
    const clock = $('clock');
    clock.textContent = fmtClock(timerRemaining(t, Date.now()));
    clock.classList.toggle('paused', t.phase === 'paused');
  }

  function showReport(r) {
    const pet = state.pet, name = Core.petDisplayName(pet);
    $('reportTitle').textContent = r.completed ? 'Focus complete! 🎉' : 'Stopped early';
    const lines = [];
    lines.push(`<div class="big">+${r.xpStudy + r.xpKills + r.xpQuests} XP</div>`);
    lines.push(`<div class="line"><span>${r.minutes} min studied${r.completed ? ' + finish bonus' : ''}</span><b>+${r.xpStudy} XP</b></div>`);
    lines.push(`<div class="line"><span>${name} fought off ${r.kills} monster${r.kills === 1 ? '' : 's'}</span><b>+${r.xpKills} XP</b></div>`);
    if (r.xpQuests) lines.push(`<div class="line"><span>Daily quest complete</span><b>+${r.xpQuests} XP</b></div>`);
    if (r.hpGain) lines.push(`<div class="line"><span>${name} ate well</span><b>+${r.hpGain} HP</b></div>`);
    if (r.levelTo > r.levelFrom) {
      lines.push(`<div class="line"><span>Level up!</span><b>Lv ${r.levelFrom} → ${r.levelTo}</b></div>`);
      const a = Sprites.stageFor(pet.avatar, r.levelFrom), b = Sprites.stageFor(pet.avatar, r.levelTo);
      if (b.index > a.index) lines.push(`<div class="line"><span>✨ Evolved!</span><b>${b.stage.name}</b></div>`);
    }
    for (const id of r.unlocked || []) lines.push(`<div class="line"><span>New pet unlocked</span><b>${Core.avatarById(id).name}</b></div>`);
    if (r.shieldEarned) lines.push(`<div class="line"><span>${r.streak}-day streak!</span><b>+1 shield 🛡</b></div>`);
    else if (r.streak) lines.push(`<div class="line"><span>Streak</span><b>${r.streak} day${r.streak === 1 ? '' : 's'} 🔥</b></div>`);
    $('reportBody').innerHTML = lines.join('');
    $('reportModal').hidden = false;
  }

  function showDeath() {
    const pet = state.pet, name = Core.petDisplayName(pet);
    $('deathTitle').textContent = `${name} has fainted 💀`;
    const days = Math.max(1, Math.round((pet.diedAt - pet.born) / 86400000));
    $('deathBody').innerHTML = `${name} reached <b>level ${Core.levelForXp(pet.xp)}</b> and defeated <b>${pet.kills}</b> monsters over ${days} day${days === 1 ? '' : 's'}, then starved from neglect.<br><br>Revive to start over at level 1. Your unlocked pets, lifetime stats and streak history are kept.`;
    const mem = $('memorial'); mem.innerHTML = '';
    for (const m of state.memorial.slice(0, 5)) {
      const li = document.createElement('li');
      li.textContent = `🪦 ${m.name} · Lv ${m.level} · ${m.kills} kills · ${new Date(m.born).toLocaleDateString()} – ${new Date(m.died).toLocaleDateString()}`;
      mem.appendChild(li);
    }
    $('deathModal').hidden = false;
  }

  function renderPets() {
    const level = Core.levelForXp(state.pet.xp);
    const pet = state.pet;

    // evolution card for the current pet
    const ev = $('evolution'); ev.innerHTML = '';
    const st = Sprites.stageFor(pet.avatar, level);
    if (st.stage) {
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48; drawMini(cv, pet.avatar, level, 3);
      ev.appendChild(cv);
      const info = document.createElement('div'); info.style.flex = '1';
      const stages = Sprites.PETS[pet.avatar].stages;
      let sub, bar = '';
      if (st.next) {
        const from = Core.xpForLevel(st.stage.level), to = Core.xpForLevel(st.next.level);
        const pct = Core.clamp((pet.xp - from) / (to - from) * 100, 0, 100);
        const hoursLeft = Math.ceil((to - pet.xp) / Core.XP_PER_MIN / 60);
        sub = `Evolves into <b>${st.next.name}</b> at level ${st.next.level} — roughly ${hoursLeft}h of study to go.`;
        bar = `<div class="ev-bar"><i style="width:${pct}%"></i></div>`;
      } else sub = 'Final form reached. Legendary.';
      info.innerHTML = `<div class="ev-title">${st.stage.name} <span class="badge">stage ${st.index + 1}/${st.total}</span></div><div class="ev-sub">${st.stage.blurb}</div><div class="ev-sub">${sub}</div>${bar}<div class="ev-stages">${stages.map((s, i) => `<span class="${i <= st.index ? 'done' : ''}" title="${s.name}">Lv ${s.level}</span>`).join('')}</div>`;
      ev.appendChild(info);
    } else {
      ev.innerHTML = `<div class="ev-sub">${Core.avatarById(pet.avatar).blurb}</div>`;
    }

    const grid = $('avatarGrid'); grid.innerHTML = '';
    for (const a of Core.AVATARS) {
      const unlocked = state.unlocked.includes(a.id);
      const card = document.createElement('div');
      card.className = `avatar-card${unlocked ? '' : ' locked'}${pet.avatar === a.id ? ' selected' : ''}`;
      card.title = a.blurb + (unlocked ? '' : ` — unlocks at level ${a.unlockLevel} (you are ${level})`);
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48;
      drawMini(cv, a.id, level, 3);
      card.appendChild(cv);
      const stages = Sprites.PETS[a.id] && Sprites.PETS[a.id].stages;
      card.insertAdjacentHTML('beforeend', `<div class="a-name">${a.name}</div><div class="a-sub">${unlocked ? (pet.avatar === a.id ? 'current' : stages ? 'evolves' : 'tap to pick') : `🔒 Lv ${a.unlockLevel}`}</div>`);
      if (unlocked) card.addEventListener('click', async () => { state = await send({ type: 'setAvatar', id: a.id }); render(); renderPets(); });
      grid.appendChild(card);
    }
  }

  function fillSettings() {
    const f = $('settingsForm'), s = state.settings;
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = !!s[el.name];
      else if (el.name === 'shieldDomains') el.value = (s.shieldDomains || []).join('\n');
      else el.value = s[el.name];
    }
  }

  // ---- actions -------------------------------------------------------------
  async function timer(action) {
    try { state = await send({ type: 'timer', action }); render(); }
    catch (e) { toast(e.message); }
  }

  async function flushKills() {
    if (!pendingKills.kills) return;
    const batch = Object.assign({ type: 'kills' }, pendingKills);
    pendingKills.kills = 0; pendingKills.xp = 0; pendingKills.bosses = 0; pendingKills.maxCombo = 0;
    try {
      const res = await send(batch);
      if (res && res.state) { state = res.state; render(); }
      if (res && res.xpQuests) toast(`Quest complete! +${res.xpQuests} XP`);
    } catch (e) { /* will retry with the next batch */ }
  }

  // ---- init ----------------------------------------------------------------
  async function init() {
    state = await send({ type: 'get' });
    lastEventAt = state.lastEvent ? state.lastEvent.at : 0;
    lastLevel = Core.levelForXp(state.pet.xp);
    lastStage = Sprites.stageFor(state.pet.avatar, lastLevel).index;
    $('app').hidden = false;
    try { $('version').textContent = 'v' + api.runtime.getManifest().version; } catch (e) { /* not in an extension */ }
    await detectWindow();

    game = new Game($('arena'));
    game.onKill = (k) => {
      pendingKills.kills += 1; pendingKills.xp += k.xp; pendingKills.bosses += k.boss;
      pendingKills.maxCombo = Math.max(pendingKills.maxCombo, k.combo);
    };
    game.start();
    render();
    fitWindow();

    setInterval(renderClock, 250);
    setInterval(flushKills, 2000);
    setInterval(() => { if (state && state.timer.phase === 'running' && state.timer.endsAt <= Date.now()) send({ type: 'get' }).then(s => { state = s; render(); }).catch(() => {}); }, 1000);

    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY] || !changes[KEY].newValue) return;
      if (document.activeElement === $('task')) return; // don't fight the user's typing
      state = changes[KEY].newValue; render();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushKills(); else game.start(); });
    window.addEventListener('pagehide', flushKills);

    // header & drawer
    $('petName').addEventListener('click', async () => {
      const name = prompt('Name your pet', state.pet.name);
      if (name && name.trim()) { state = await send({ type: 'rename', name }); render(); }
    });
    $('avatarBtn').addEventListener('click', () => openDrawer('pets'));
    $('settingsBtn').addEventListener('click', () => { if ($('drawer').hidden) openDrawer(drawerTab()); else closeDrawer(); });
    $('drawerClose').addEventListener('click', closeDrawer);
    for (const b of document.querySelectorAll('.tabs button[data-tab]')) b.addEventListener('click', () => openDrawer(b.dataset.tab));
    $('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, patch = {};
      for (const el of f.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') patch[el.name] = el.checked;
        else if (el.name === 'shieldDomains') patch[el.name] = el.value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
        else patch[el.name] = Number(el.value);
      }
      state = await send({ type: 'settings', patch });
      render(); toast('Settings saved');
    });
    $('resetBtn').addEventListener('click', async () => {
      if (!confirm('Reset Focusling completely? Your pet, XP, stats and settings will be erased.')) return;
      state = await send({ type: 'reset' }); closeDrawer(); render();
    });
    $('reportOk').addEventListener('click', async () => { $('reportModal').hidden = true; state = await send({ type: 'ackReport' }); render(); });
    $('reviveBtn').addEventListener('click', async () => { $('deathModal').hidden = true; state = await send({ type: 'revive' }); render(); toast(`Welcome back, ${Core.petDisplayName(state.pet)}!`); });
    $('welcomeOk').addEventListener('click', async () => { $('welcomeModal').hidden = true; state = await send({ type: 'onboarded' }); });
    const taskEl = $('task');
    let taskTimer = 0;
    taskEl.addEventListener('input', () => { clearTimeout(taskTimer); taskTimer = setTimeout(() => send({ type: 'setTask', task: taskEl.value }).catch(() => {}), 400); });
    taskEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { taskEl.blur(); if (state.timer.phase === 'ready' && state.timer.mode === 'focus') timer('start'); } });
    document.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); const p = state.timer.phase; timer(p === 'running' ? 'pause' : p === 'paused' ? 'resume' : 'start'); }
      if (e.key === 'Escape') { for (const m of document.querySelectorAll('.modal')) if (m.id !== 'deathModal') m.hidden = true; if (!$('drawer').hidden) closeDrawer(); }
    });
  }

  init().catch((e) => {
    document.body.innerHTML = `<p style="padding:16px">Focusling could not start: ${e.message}</p>`;
  });
})();
