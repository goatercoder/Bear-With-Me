/* game.js — the Focusling arena.
 * Your pet floats on the left and auto-fires at monsters flying in from the
 * right. Its damage, fire rate and bullet count come from its level, which
 * comes from studying. The arena only runs while a Focusling page is open;
 * kills are batched and reported to the background worker via onKill(). */
(function (root) {
  'use strict';

  const MONSTER_WEIGHTS = [['alien', 5], ['bat', 3], ['ufo', 2], ['eye', 2]];
  const BOSS_EVERY = 12;

  function pick(weights) {
    let total = 0; for (const [, w] of weights) total += w;
    let r = Math.random() * total;
    for (const [k, w] of weights) { if ((r -= w) < 0) return k; }
    return weights[0][0];
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.W = canvas.width; this.H = canvas.height;
      this.u = Math.max(2, Math.round(this.H / 60)); // pixel scale
      this.ctx_ = { avatar: 'osci', level: 1, hp: 100, alive: true, mode: 'focus', running: false };
      this.pet = { x: 14 * this.u, y: this.H / 2, targetY: this.H / 2, lastShot: 0, hitFlash: 0 };
      this.bullets = []; this.monsters = []; this.particles = []; this.floaters = [];
      this.stars = Array.from({ length: 48 }, () => ({ x: Math.random() * this.W, y: Math.random() * this.H, z: 0.3 + Math.random() * 1, tw: Math.random() * 6 }));
      this.trail = [];
      this.time = 0; this.lastTs = 0; this.spawnAt = 0;
      this.combo = 0; this.maxCombo = 0; this.sessionKills = 0; this.killsSinceBoss = 0;
      this.powerReady = 0; this.bossActive = false;
      this.onKill = null; this.onEvent = null;
      this.raf = 0; this.running = false;
      this._tick = this._tick.bind(this);
      canvas.addEventListener('pointerdown', (e) => this.powerShot(e));
    }

    setContext(c) {
      const prev = this.ctx_;
      this.ctx_ = Object.assign({}, prev, c);
      if (prev.level !== undefined && c.level > prev.level) {
        const evolved = Sprites.stageFor(this.ctx_.avatar, c.level).index > Sprites.stageFor(prev.avatar, prev.level).index && prev.avatar === this.ctx_.avatar;
        this.celebrate(evolved ? 'EVOLVED!' : `LEVEL ${c.level}!`);
      }
      if (!this.ctx_.running || this.ctx_.mode !== 'focus') { this.bossActive = false; }
      if (!this.ctx_.alive) { this.monsters = []; this.bullets = []; }
    }

    start() { if (this.running) return; this.running = true; this.lastTs = 0; this.raf = requestAnimationFrame(this._tick); }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    get stats() { return Core.combatStats(this.ctx_.level); }
    get fighting() { return this.ctx_.alive && this.ctx_.mode === 'focus' && this.ctx_.running; }

    celebrate(text) {
      this.floaters.push({ x: this.W / 2, y: this.H / 2, vy: -0.25, life: 1600, text, big: true, color: '#ffd166' });
      for (let i = 0; i < 40; i++) this.burst(this.W / 2 + (Math.random() - 0.5) * this.W * 0.6, this.H / 2 + (Math.random() - 0.5) * 40, Sprites.RAINBOW[i % 6], 1.4);
    }

    burst(x, y, color, spread) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random() * 1.2) * (spread || 1);
        this.particles.push({ x, y, vx: Math.cos(a) * s * this.u * 0.5, vy: Math.sin(a) * s * this.u * 0.5, life: 350 + Math.random() * 300, color });
      }
    }

    powerShot() {
      if (!this.fighting || this.time < this.powerReady) return;
      this.powerReady = this.time + 1500;
      const st = this.stats;
      this.bullets.push({ x: this.pet.x + 6 * this.u, y: this.pet.y, vx: 0.9 * this.u, dmg: st.damage * 5, size: 3 * this.u, color: '#ffffff', power: true });
      this.floaters.push({ x: this.pet.x, y: this.pet.y - 8 * this.u, vy: -0.1, life: 600, text: 'POW!', color: '#fff' });
    }

    spawn() {
      const st = this.stats;
      let type;
      if (this.killsSinceBoss >= BOSS_EVERY && !this.bossActive) { type = 'boss'; this.bossActive = true; this.killsSinceBoss = 0; }
      else type = pick(MONSTER_WEIGHTS);
      const def = Sprites.MONSTERS[type];
      const scale = this.u * (def.scaleMul || 1);
      const size = 12 * scale;
      this.monsters.push({
        type, def, scale, size,
        x: this.W + size, y: size / 2 + Math.random() * (this.H - size), baseY: 0,
        hp: Math.max(1, Math.round(st.monsterHp * def.hpMul)), maxHp: Math.max(1, Math.round(st.monsterHp * def.hpMul)),
        vx: -(0.045 + Math.random() * 0.02) * def.speed * this.u, phase: Math.random() * 6.28, wobble: def.wobble, flash: 0,
      });
      const m = this.monsters[this.monsters.length - 1]; m.baseY = m.y;
      if (type === 'boss') this.floaters.push({ x: this.W / 2, y: 14 * this.u, vy: 0, life: 1400, text: 'MOTHERSHIP INCOMING', big: true, color: '#e2bfff' });
    }

    shoot(target) {
      const st = this.stats;
      const sprite = Sprites.petSprite(this.ctx_.avatar, this.ctx_.level);
      const n = st.bullets;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.12;
        const dx = target.x - this.pet.x, dy = target.y - this.pet.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = 0.5 * this.u;
        const ang = Math.atan2(dy, dx) + off;
        this.bullets.push({ x: this.pet.x + 6 * this.u, y: this.pet.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: st.damage, size: this.u, color: sprite.shot, len });
      }
      this.pet.recoil = 120;
    }

    _tick(ts) {
      if (!this.running) return;
      if (!this.lastTs) this.lastTs = ts;
      const dt = Math.min(50, ts - this.lastTs); this.lastTs = ts;
      this.time += dt;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this._tick);
    }

    update(dt) {
      const u = this.u, pet = this.pet, st = this.stats;
      // stars
      for (const s of this.stars) { s.x -= s.z * 0.02 * u * dt / 16; if (s.x < 0) { s.x = this.W; s.y = Math.random() * this.H; } }

      // pet movement: follow the nearest monster's altitude, otherwise bob in the middle
      let target = null;
      if (this.fighting) {
        for (const m of this.monsters) if (!target || m.x < target.x) target = m;
        if (this.time >= this.spawnAt) { this.spawn(); this.spawnAt = this.time + st.spawnMs * (0.7 + Math.random() * 0.6); }
      }
      pet.targetY = target ? Core.clamp(target.y, 10 * u, this.H - 10 * u) : this.H / 2;
      pet.y += (pet.targetY - pet.y) * Math.min(1, dt / 220);
      pet.recoil = Math.max(0, (pet.recoil || 0) - dt);

      const bobAmp = this.ctx_.mode !== 'focus' && this.ctx_.alive ? 3 : 1.5;
      const bobY = Math.sin(this.time / 400) * bobAmp * u;
      this.trail.unshift({ x: pet.x, y: pet.y + bobY });
      if (this.trail.length > 22) this.trail.pop();

      if (target && this.time - pet.lastShot > st.fireIntervalMs && target.x > pet.x + 8 * u) {
        pet.lastShot = this.time; this.shoot(target);
      }

      // bullets
      for (const b of this.bullets) { b.x += b.vx * dt / 16; b.y += (b.vy || 0) * dt / 16; }
      this.bullets = this.bullets.filter(b => b.x < this.W + 20 && b.y > -20 && b.y < this.H + 20);

      // monsters
      for (const m of this.monsters) {
        m.x += m.vx * dt / 16;
        m.phase += dt / 300;
        m.y = m.baseY + Math.sin(m.phase) * m.wobble * 6 * u;
        m.y = Core.clamp(m.y, m.size / 2, this.H - m.size / 2);
        m.flash = Math.max(0, m.flash - dt);
        for (const b of this.bullets) {
          if (b.dead) continue;
          if (Math.abs(b.x - m.x) < m.size / 2 + b.size && Math.abs(b.y - m.y) < m.size / 2 + b.size) {
            m.hp -= b.dmg; m.flash = 80; if (!b.power) b.dead = true;
            this.burst(b.x, b.y, b.color, 0.5);
          }
        }
        if (m.hp <= 0 && !m.dead) {
          m.dead = true; this.kill(m);
        } else if (m.x < pet.x - 4 * u && !m.dead) {
          // it slipped past — combo broken
          m.dead = true; this.combo = 0; pet.hitFlash = 250;
          this.floaters.push({ x: pet.x, y: pet.y - 10 * u, vy: -0.12, life: 700, text: 'combo lost', color: '#ff7b7b' });
          if (m.type === 'boss') this.bossActive = false;
        }
      }
      this.bullets = this.bullets.filter(b => !b.dead);
      this.monsters = this.monsters.filter(m => !m.dead);
      if (!this.fighting) this.monsters = [];

      pet.hitFlash = Math.max(0, pet.hitFlash - dt);
      for (const p of this.particles) { p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.01 * u * dt / 16; p.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.floaters) { f.y += f.vy * u * dt / 16; f.life -= dt; }
      this.floaters = this.floaters.filter(f => f.life > 0);
    }

    kill(m) {
      const xp = m.def.xp;
      this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.sessionKills += 1; this.killsSinceBoss += 1;
      if (m.type === 'boss') this.bossActive = false;
      this.burst(m.x, m.y, m.def.palette[Object.keys(m.def.palette)[1]] || '#fff', m.type === 'boss' ? 3 : 1.2);
      this.floaters.push({ x: m.x, y: m.y - m.size / 2, vy: -0.2, life: 700, text: `+${xp} XP`, color: '#ffd166' });
      if (this.combo > 1 && this.combo % 5 === 0) this.floaters.push({ x: this.W / 2, y: 12 * this.u, vy: 0, life: 900, text: `${this.combo} COMBO`, big: true, color: '#7ee787' });
      if (this.onKill) this.onKill({ xp, boss: m.type === 'boss' ? 1 : 0, combo: this.combo });
    }

    draw() {
      const c = this.ctx, u = this.u, pet = this.pet;
      c.imageSmoothingEnabled = false;
      // background
      const g = c.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#0b1026'); g.addColorStop(1, '#1a1140');
      c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
      for (const s of this.stars) {
        const a = 0.35 + 0.5 * Math.abs(Math.sin(this.time / 900 + s.tw));
        c.fillStyle = `rgba(255,255,255,${a * s.z})`;
        const sz = s.z > 1 ? 2 : 1; c.fillRect(s.x, s.y, sz, sz);
      }

      const sprite = Sprites.petSprite(this.ctx_.avatar, this.ctx_.level);
      const bobAmp = this.ctx_.mode !== 'focus' && this.ctx_.alive ? 3 : 1.5;
      const bobY = Math.sin(this.time / 400) * bobAmp * u;

      if (!this.ctx_.alive) {
        const tomb = Sprites.render(Sprites.MISC.tombstone, u);
        c.drawImage(tomb, pet.x - 8 * u, this.H - 16 * u - 2 * u);
        c.globalAlpha = 0.35 + 0.1 * Math.sin(this.time / 500);
        const ghost = Sprites.render(sprite, u);
        c.drawImage(ghost, pet.x - 8 * u, pet.y - 8 * u + bobY - 10 * u);
        c.globalAlpha = 1;
      } else {
        // rainbow trail (Nyan) — a wavy ribbon behind the pet
        if (sprite.trail === 'rainbow') {
          const bands = Sprites.RAINBOW, bh = Math.max(1, Math.round(u * 0.9));
          for (let i = 1; i < this.trail.length; i++) {
            const p = this.trail[i], prev = this.trail[i - 1];
            const off = Math.sin((this.time / 90) - i * 0.6) * u * 0.6;
            for (let b = 0; b < bands.length; b++) {
              c.fillStyle = bands[b];
              c.globalAlpha = 1 - i / this.trail.length;
              c.fillRect(p.x - 6 * u - i * 1.4 * u, p.y - 3 * u + b * bh + off, Math.abs(prev.x - p.x) + 1.6 * u, bh);
            }
          }
          c.globalAlpha = 1;
        }
        const low = this.ctx_.hp < 35;
        const img = Sprites.render(sprite, u);
        const recoil = (pet.recoil || 0) > 0 ? -u * 0.5 : 0;
        if (pet.hitFlash > 0 && Math.floor(this.time / 60) % 2 === 0) c.globalAlpha = 0.5;
        if (low) c.filter = 'saturate(0.35) brightness(0.9)';
        if (sprite.glow) { c.shadowColor = sprite.glow; c.shadowBlur = 6 * u * (0.7 + 0.3 * Math.sin(this.time / 500)); }
        c.drawImage(img, Math.round(pet.x - 8 * u + recoil), Math.round(pet.y - 8 * u + bobY));
        c.shadowBlur = 0; c.filter = 'none'; c.globalAlpha = 1;
        if (low && Math.floor(this.time / 700) % 2 === 0) this.text('?', pet.x + 9 * u, pet.y - 9 * u, '#ff7b7b', false);
        if (this.ctx_.mode !== 'focus' && this.ctx_.running && Math.floor(this.time / 800) % 2 === 0) this.text('z', pet.x + 9 * u, pet.y - 8 * u + bobY, '#b9c6ff', false);
      }

      for (const b of this.bullets) {
        c.fillStyle = b.color;
        if (b.power) { c.shadowColor = '#fff'; c.shadowBlur = 12; c.beginPath(); c.arc(b.x, b.y, b.size, 0, 6.28); c.fill(); c.shadowBlur = 0; }
        else c.fillRect(b.x - b.size, b.y - b.size / 2, b.size * 2, b.size);
      }
      for (const m of this.monsters) {
        const img = Sprites.render(m.def, m.scale, m.flash > 0 ? { tint: '#ffffff' } : undefined);
        c.drawImage(img, Math.round(m.x - m.size / 2), Math.round(m.y - m.size / 2));
        if (m.maxHp > 3 && m.hp < m.maxHp) {
          const w = m.size, h = Math.max(2, u / 2);
          c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(m.x - w / 2, m.y - m.size / 2 - h - 2, w, h);
          c.fillStyle = m.type === 'boss' ? '#ff4d6d' : '#7ee787'; c.fillRect(m.x - w / 2, m.y - m.size / 2 - h - 2, w * m.hp / m.maxHp, h);
        }
      }
      for (const p of this.particles) { c.globalAlpha = Math.min(1, p.life / 300); c.fillStyle = p.color; c.fillRect(p.x, p.y, u * 0.7, u * 0.7); }
      c.globalAlpha = 1;
      for (const f of this.floaters) { c.globalAlpha = Math.min(1, f.life / 300); this.text(f.text, f.x, f.y, f.color, f.big); }
      c.globalAlpha = 1;

      // HUD
      if (this.fighting) {
        this.text(`⚔ ${this.sessionKills}   combo ${this.combo}`, 2 * u, 2 * u, 'rgba(255,255,255,.75)', false, 'left');
        const pw = Math.min(1, 1 - Math.max(0, this.powerReady - this.time) / 1500);
        const bw = 8 * u, bx = this.W - bw - 2 * u, bh = Math.max(2, u / 2);
        c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(bx, 2 * u, bw, bh);
        c.fillStyle = pw >= 1 ? '#fff' : '#ffd166'; c.fillRect(bx, 2 * u, bw * pw, bh);
        this.text(pw >= 1 ? 'click: POW' : 'charging', this.W - 2 * u, 2 * u + bh + 2, 'rgba(255,255,255,.6)', false, 'right');
      }
    }

    text(str, x, y, color, big, align) {
      const c = this.ctx;
      c.font = `${big ? 'bold ' : ''}${Math.round(this.u * (big ? 4 : 2.6))}px ui-monospace, Menlo, monospace`;
      c.textAlign = align || 'center'; c.textBaseline = 'top';
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(str, x + 1, y + 1);
      c.fillStyle = color; c.fillText(str, x, y);
    }
  }

  root.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
