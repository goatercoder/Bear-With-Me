/* app.js — Focusling popup / arena UI.
 * The background worker owns all state; this file only renders it, sends
 * commands and runs the arena animation while the page is open. */
(function () {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const KEY = 'focusling';
  const $ = (id) => document.getElementById(id);

  let state = null;
  let game = null;
  let lastEventAt = 0;
  let lastLevel = null;
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
  function timerRemaining(t, now) {
    return t.phase === 'running' ? t.endsAt - now : t.remainingMs;
  }
  function modeName(mode) { return mode === 'focus' ? 'Focus' : mode === 'short' ? 'Short break' : 'Long break'; }

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

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
  function drawMini(canvas, avatarId, scale) {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(Sprites.render(Sprites.PETS[avatarId] || Sprites.PETS.osci, scale), 0, 0);
  }

  function render() {
    if (!state) return;
    const now = Date.now();
    const pet = state.pet, t = state.timer, s = state.settings;
    const level = Core.levelForXp(pet.xp);
    const name = Core.petDisplayName(pet);
    document.title = `${name} · Focusling`;

    $('petName').textContent = name;
    $('levelBadge').textContent = `Lv ${level}`;
    const mood = Core.hpStatus(pet);
    $('mood').textContent = `${mood.emoji} ${mood.label}`;
    drawMini($('avatarMini'), pet.avatar, 2);

    // bars
    const hpPct = Core.clamp(pet.hp, 0, 100);
    $('hpFill').style.width = `${hpPct}%`;
    $('hpFill').classList.toggle('low', hpPct < 35);
    $('hpText').textContent = `${Math.ceil(hpPct)} / ${Core.MAX_HP}`;
    const lvlStart = Core.xpForLevel(level), lvlNext = Core.xpForLevel(level + 1);
    const xpPct = ((pet.xp - lvlStart) / (lvlNext - lvlStart)) * 100;
    $('xpFill').style.width = `${Core.clamp(xpPct, 0, 100)}%`;
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
    modeEl.textContent = t.phase === 'paused' ? `${modeName(t.mode)} · paused` : t.phase === 'ready' ? `${modeName(t.mode)} · ready` : modeName(t.mode);
    modeEl.className = `mode ${t.mode === 'focus' ? 'focus' : 'break'}`;
    const every = Math.max(1, s.longEvery);
    const done = t.cycle % every;
    $('cycleDots').innerHTML = Array.from({ length: every }, (_, i) => i < done ? '<b>●</b>' : '○').join('');
    renderClock();
    const task = $('task');
    if (document.activeElement !== task) task.value = t.task || '';

    const btns = $('timerButtons');
    btns.innerHTML = '';
    const mk = (label, cls, onClick, disabled) => {
      const b = document.createElement('button');
      b.className = `btn ${cls || ''}`; b.textContent = label; b.disabled = !!disabled;
      b.addEventListener('click', onClick); btns.appendChild(b); return b;
    };
    if (!pet.alive) {
      mk('Revive your pet', 'primary', () => $('deathModal').hidden = false);
    } else if (t.phase === 'ready') {
      mk(t.mode === 'focus' ? `Start focus (${s.focusMin} min)` : `Start ${modeName(t.mode).toLowerCase()}`, 'primary', () => timer('start'));
      if (t.mode !== 'focus') mk('Skip break', '', () => timer('skip'));
      else if (t.cycle > 0) mk('Reset cycle', 'small', () => timer('reset-cycle'));
    } else if (t.phase === 'running') {
      mk('Pause', '', () => timer('pause'));
      mk(t.mode === 'focus' ? 'Give up' : 'Skip', 'danger', () => timer(t.mode === 'focus' ? 'stop' : 'skip'));
    } else {
      mk('Resume', 'primary', () => timer('resume'));
      mk(t.mode === 'focus' ? 'Give up' : 'Skip', 'danger', () => timer(t.mode === 'focus' ? 'stop' : 'skip'));
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
    const max = Math.max(1, ...days.map(d => (state.history[d] || 0) + (d === today ? Math.floor(state.today.focusMs / 60000) - (state.history[d] || 0) : 0)));
    for (const d of days) {
      const min = d === today ? Math.floor(state.today.focusMs / 60000) : (state.history[d] || 0);
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
    else { ov.hidden = false; ov.textContent = state.stats.sessions === 0 ? `Start a focus block and ${name} will fight for you.` : `Start a focus block to send ${name} into battle.`; }

    // game context
    if (game) {
      game.setContext({ avatar: pet.avatar, level, hp: pet.hp, alive: pet.alive, mode: t.mode, running: t.phase === 'running' });
    }
    if (lastLevel !== null && level > lastLevel && !document.hidden) toast(`Level up! ${name} is now level ${level}`);
    lastLevel = level;

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
    if (r.levelTo > r.levelFrom) lines.push(`<div class="line"><span>Level up!</span><b>Lv ${r.levelFrom} → ${r.levelTo}</b></div>`);
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

  function renderAvatars() {
    const grid = $('avatarGrid'); grid.innerHTML = '';
    const level = Core.levelForXp(state.pet.xp);
    for (const a of Core.AVATARS) {
      const unlocked = state.unlocked.includes(a.id);
      const card = document.createElement('div');
      card.className = `avatar-card${unlocked ? '' : ' locked'}${state.pet.avatar === a.id ? ' selected' : ''}`;
      card.title = a.blurb + (unlocked ? '' : ` — unlocks at level ${a.unlockLevel} (you are ${level})`);
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48;
      drawMini(cv, a.id, 3);
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<div class="a-name">${a.name}</div><div class="a-sub">${unlocked ? (state.pet.avatar === a.id ? 'current' : 'tap to pick') : `🔒 Lv ${a.unlockLevel}`}</div>`);
      if (unlocked) card.addEventListener('click', async () => { state = await send({ type: 'setAvatar', id: a.id }); render(); renderAvatars(); });
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
    $('app').hidden = false;

    game = new Game($('arena'));
    game.onKill = (k) => {
      pendingKills.kills += 1; pendingKills.xp += k.xp; pendingKills.bosses += k.boss;
      pendingKills.maxCombo = Math.max(pendingKills.maxCombo, k.combo);
    };
    game.start();
    render();

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

    // header
    $('petName').addEventListener('click', async () => {
      const name = prompt('Name your pet', state.pet.name);
      if (name && name.trim()) { state = await send({ type: 'rename', name }); render(); }
    });
    $('avatarBtn').addEventListener('click', () => { renderAvatars(); $('avatarModal').hidden = false; });
    $('avatarClose').addEventListener('click', () => $('avatarModal').hidden = true);
    $('settingsBtn').addEventListener('click', () => { fillSettings(); $('settingsModal').hidden = false; });
    $('settingsClose').addEventListener('click', () => $('settingsModal').hidden = true);
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
      $('settingsModal').hidden = true; render(); toast('Settings saved');
    });
    $('resetBtn').addEventListener('click', async () => {
      if (!confirm('Reset Focusling completely? Your pet, XP, stats and settings will be erased.')) return;
      state = await send({ type: 'reset' }); $('settingsModal').hidden = true; render();
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
      if (e.key === 'Escape') for (const m of document.querySelectorAll('.modal')) if (m.id !== 'deathModal') m.hidden = true;
    });
  }

  init().catch((e) => {
    document.body.innerHTML = `<p style="padding:16px">Focusling could not start: ${e.message}</p>`;
  });
})();
