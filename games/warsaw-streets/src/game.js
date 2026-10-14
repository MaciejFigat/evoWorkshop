/* Game: fixed-timestep simulation, camera, waves, combat resolution, effects, HUD, scenes.
   tick() advances the simulation by exactly 1/60 s regardless of display frame rate;
   render() only draws. */
(function () {
  'use strict';
  const WS = window.WS;
  const MAX_ATTACKERS = 2;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.scene = 'loading';       // loading | title | play | gameover | clear | error
      this.paused = false;
      this.debug = false;
      this.error = null;
      this.time = 0;                // ticks since boot (animation of menus / blinking)
      this.stageIdx = 0;
      this.hero = 'nina';
      this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
    }

    /* ---------------- boot ---------------- */

    async boot() {
      try {
        await WS.Atlas.load(['nina', 'goon']);
        for (const k of Object.keys(window.CHARACTERS)) {      // compile + validate all animation data up front
          const d = window.CHARACTERS[k];
          d._compiled = WS.compileAnims(d.anims, d.atlas, k);
          for (const [id, atk] of Object.entries(d.attacks || {})) {
            const a = d._compiled[atk.anim];
            if (!a) throw new Error(k + '.attacks.' + id + ' uses unknown animation ' + atk.anim);
            if (a.firstActive < 0) throw new Error(k + '.attacks.' + id + ': animation has no active (act) frame');
          }
        }
        this.bgImages = {};
        for (const s of window.STAGES) {
          if (s.placeholder) continue;
          this.bgImages[s.id] = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('Could not load ' + s.bg));
            i.src = s.bg;
          });
        }
        this.loadStage(0);
        this.scene = 'title';
      } catch (e) {
        this.fail(e);
      }
    }

    fail(e) {
      console.error(e);
      this.error = String(e && e.message || e);
      this.scene = 'error';
    }

    loadStage(idx) {
      const def = window.STAGES[idx];
      this.stageIdx = idx;
      this.stageDef = def;
      this.stage = new WS.Stage(def, this.bgImages[def.id]);
    }

    /* ---------------- run setup ---------------- */

    // One run = one round for the playground telemetry: reported once, when it ends.
    endRun(result) {
      if (WS.onRun) WS.onRun({ result, score: this.score, stage: this.stageIdx + 1, lives: this.lives });
    }

    startRun() {
      this.score = 0;
      this.lives = 3;
      this.startStage(0);
    }

    startStage(idx) {
      this.loadStage(idx);
      const st = this.stage, def = this.stageDef;
      this.camX = 0; this.camMin = 0; this.camMax = st.maxCam;
      this.shake = 0;
      this.player = new WS.Fighter(this.hero, { x: def.startX, y: (st.floorTop + st.floorBottom) / 2 + 4, facing: 1 });
      this.enemies = [];
      this.brains = new Map();
      this.tokens = new Set();
      this.effects = [];
      this.spawnQueue = [];
      this.waveIdx = 0;
      this.locked = false;
      this.goArrow = 0;
      this.lastEnemy = null; this.lastEnemyT = 0;
      this.respawnT = 0;
      this.stageBanner = 150;
      this.displayHp = this.player.hp;
      this.scene = 'play';
      this.paused = false;
    }

    /* ---------------- tokens (limit simultaneous attackers) ---------------- */

    requestToken(f) {
      if (this.tokens.has(f)) return true;
      if (this.tokens.size >= MAX_ATTACKERS) return false;
      this.tokens.add(f);
      return true;
    }
    releaseToken(f) { this.tokens.delete(f); }

    /* ---------------- fixed update ---------------- */

    tick() {
      this.time++;
      const pressed = WS.Input.takePressed();

      if (pressed.has('debug')) this.debug = !this.debug;

      if (this.scene === 'title' || this.scene === 'gameover' || this.scene === 'clear') {
        if (pressed.has('start')) this.startRun();
        return;
      }
      if (this.scene !== 'play') return;

      if (pressed.has('restart')) { this.startRun(); return; }
      if (pressed.has('pause')) this.paused = !this.paused;
      if (this.paused) return;

      this.updatePlay(pressed);
    }

    playerIntent(pressed) {
      const I = WS.Input;
      let attack = null;
      if (pressed.has('attack')) attack = 'attack';
      else if (pressed.has('kick')) attack = 'kick';
      else if (pressed.has('special')) attack = 'special';
      return {
        mx: (I.held('right') ? 1 : 0) - (I.held('left') ? 1 : 0),
        my: (I.held('downK') ? 1 : 0) - (I.held('up') ? 1 : 0),
        attack, jump: pressed.has('jump'), block: I.held('block'), faceTo: null,
      };
    }

    updatePlay(pressed) {
      const p = this.player;

      // --- fighters ---
      if (p.state !== 'dead') p.update(this, this.playerIntent(pressed));
      else p.update(this, WS.NEUTRAL);
      for (const e of this.enemies) e.update(this, this.brains.get(e).think(this));

      // --- cleanup ---
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i].removeMe) { this.tokens.delete(this.enemies[i]); this.brains.delete(this.enemies[i]); this.enemies.splice(i, 1); }
      }

      this.updateWaves();
      this.updateEffects();
      this.updateCamera();
      this.updatePlayerLife();

      // smooth "damage lag" bar
      if (this.displayHp > p.hp) this.displayHp = Math.max(p.hp, this.displayHp - 0.6);
      else this.displayHp = p.hp;
      if (this.stageBanner > 0) this.stageBanner--;
      if (this.goArrow > 0) this.goArrow--;
      if (this.lastEnemyT > 0) this.lastEnemyT--;
    }

    /* ---------------- movement & bounds ---------------- */

    moveFighter(f) {
      f.x += f.vx;
      f.y += f.vy;
      const st = this.stage;
      f.y = st.clampY(f.y);
      if (f.entering) {                                   // walking in from off-screen
        if (f.x > this.camX + 14 && f.x < this.camX + WS.W - 14) f.entering = false;
      } else {
        f.x = WS.clamp(f.x, this.camX + 12, this.camX + WS.W - 12);
      }
      f.x = WS.clamp(f.x, 8, st.width - 8);
    }

    /* ---------------- combat ---------------- */

    resolveHits(att) {
      const hb = att.hitbox();
      if (!hb) return;
      const targets = att.team === 0 ? this.enemies : [this.player];
      const atk = att.attack;
      for (const t of targets) {
        if (t === att || att.hitSet.has(t)) continue;
        const hu = t.hurtbox();
        if (!hu) continue;
        if (Math.abs(att.y - t.y) > (atk.depth || 12)) continue;   // different depth lane
        if (!WS.overlap(hb, hu)) continue;
        const result = t.takeHit(att, atk);
        if (!result) continue;
        att.hitSet.add(t);
        att.onHitLanded(atk);
        const cx = (Math.max(hb.x, hu.x) + Math.min(hb.x + hb.w, hu.x + hu.w)) / 2;
        const cy = (Math.max(hb.y, hu.y) + Math.min(hb.y + hb.h, hu.y + hu.h)) / 2;
        this.addSpark(cx, cy, result === 'blocked' ? 'block' : (atk.knockdown ? 'big' : 'hit'));
        if (result === 'hit') {
          this.shake = Math.max(this.shake, atk.shake || 0);
          if (att.isPlayer) {
            this.score += atk.damage * 10;
            this.lastEnemy = t; this.lastEnemyT = 150;
            if (!t.alive && !t.scored) { t.scored = true; this.score += t.def.score || 0; }
          } else if (t.isPlayer) {
            this.displayHp = Math.max(this.displayHp, t.hp + atk.damage);
          }
        }
      }
    }

    onLanded(f) {
      this.addDust(f.x, f.y);
      this.shake = Math.max(this.shake, f.isPlayer ? 2 : 1);
    }

    /* ---------------- waves / camera ---------------- */

    spawnEnemy(type, side) {
      const st = this.stage;
      const x = this.camX + (side > 0 ? WS.W + 28 : -28);
      const y = WS.rand(st.floorTop + 2, st.floorBottom - 2);
      const e = new WS.Fighter(type, { x, y, facing: side > 0 ? -1 : 1 });
      e.entering = true;
      this.enemies.push(e);
      this.brains.set(e, new WS.Brain(e, side > 0 ? 1 : -1));
    }

    updateWaves() {
      const waves = this.stageDef.waves;
      // process delayed spawns
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (--this.spawnQueue[i].t <= 0) {
          const s = this.spawnQueue.splice(i, 1)[0];
          this.spawnEnemy(s.type, s.side);
        }
      }
      if (!this.locked) {
        const w = waves[this.waveIdx];
        if (w && this.camX >= w.at) {
          this.locked = true;
          this.camMax = Math.max(this.camX, this.camMin);
          this.camX = this.camMax;
          for (const s of w.enemies) this.spawnQueue.push({ t: s.delay + 1, type: s.type, side: s.side });
        }
      } else if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.locked = false;
        this.waveIdx++;
        this.camMax = this.stage.maxCam;
        this.goArrow = 240;
      }
      // stage end
      if (!this.locked && this.waveIdx >= waves.length && this.player.x >= this.stage.width - 40 && this.player.alive) {
        this.scene = 'clear';
        this.endRun('clear');
      }
    }

    updateCamera() {
      const p = this.player;
      const target = p.x - WS.W / 2 + p.facing * 18;
      let cam = this.camX + (target - this.camX) * 0.1;
      cam = Math.max(cam, this.camX);                       // never scroll backwards
      cam = WS.clamp(cam, this.camMin, this.camMax);
      this.camX = cam;
      this.camMin = Math.max(this.camMin, Math.floor(cam));
      this.shake *= 0.84;
      if (this.shake < 0.3) this.shake = 0;
    }

    updatePlayerLife() {
      const p = this.player;
      if (p.state === 'dead') {
        if (++this.respawnT === 1) { this.lives--; this.tokens.clear(); }
        if (this.respawnT > 110) {
          if (this.lives > 0) {
            const x = this.camX + 40;
            this.player = new WS.Fighter(this.hero, { x, y: (this.stage.floorTop + this.stage.floorBottom) / 2 + 4, facing: 1 });
            this.player.invuln = 120;
            this.displayHp = this.player.hp;
            this.respawnT = 0;
          } else { this.scene = 'gameover'; this.endRun('gameover'); }
        }
      }
    }

    /* ---------------- effects ---------------- */

    addSpark(x, y, kind) { this.effects.push({ type: 'spark', kind, x, y, t: 0, life: kind === 'big' ? 16 : 10 }); }
    addDust(x, y) { this.effects.push({ type: 'dust', x, y: y - 2, t: 0, life: 18 }); }
    updateEffects() {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        if (++this.effects[i].t >= this.effects[i].life) this.effects.splice(i, 1);
      }
    }

    /* ---------------- rendering ---------------- */

    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05050f';
      ctx.fillRect(0, 0, WS.W, WS.H);

      if (this.scene === 'loading') { WS.text(ctx, 'LOADING...', WS.W / 2, 128, '#fff', 'center'); return; }
      if (this.scene === 'error') { this.renderError(ctx); return; }
      if (this.scene === 'title') { this.renderTitle(ctx); return; }

      const sx = this.shake ? Math.round((WS.random() * 2 - 1) * this.shake) : 0;
      const sy = this.shake ? Math.round((WS.random() * 2 - 1) * this.shake * 0.6) : 0;
      ctx.save();
      ctx.translate(sx, sy);
      const cam = Math.round(this.camX);
      this.stage.draw(ctx, cam);

      const all = [this.player, ...this.enemies].sort((a, b) => a.y - b.y);
      for (const f of all) this.drawShadow(ctx, f, cam);
      for (const f of all) this.drawFighter(ctx, f, cam);
      for (const e of this.effects) this.drawEffect(ctx, e, cam);
      if (this.debug) for (const f of all) this.drawDebug(ctx, f, cam);
      ctx.restore();

      this.drawHud(ctx);
      if (this.paused) this.renderOverlay(ctx, 'PAUSED', 'P: RESUME   R: RESTART');
      if (this.scene === 'gameover') this.renderOverlay(ctx, 'GAME OVER', 'SCORE ' + WS.pad(this.score, 6) + '   ENTER: TRY AGAIN');
      if (this.scene === 'clear') this.renderOverlay(ctx, 'STAGE CLEAR', 'SCORE ' + WS.pad(this.score, 6) + '   ENTER: PLAY AGAIN');
      if (this.debug) this.drawDebugHud(ctx);
    }

    drawShadow(ctx, f, cam) {
      if (f.state === 'dead' && f.deadT > 70) return;
      const k = 1 - Math.min(0.6, f.z / 120);
      const w = (f.state === 'down' || f.state === 'dead' ? 30 : 17) * k;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.ellipse(Math.round(f.x - cam), Math.round(f.y), w, 4 * k + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawFighter(ctx, f, cam) {
      if (f.isPlayer && f.invuln > 0 && f.state !== 'dead' && ((this.time >> 2) & 1)) return;   // player i-frame blink
      if (f.state === 'dead' && f.deadT > 55 && ((this.time >> 2) & 1)) return;                           // corpse blink-out
      const fr = f.anim.frame;
      WS.drawFrame(ctx, f.def.atlas, fr.f, f.x - cam, f.y - f.z, f.facing, f.flash > 0);
    }

    drawEffect(ctx, e, cam) {
      const x = Math.round(e.x - cam), y = Math.round(e.y);
      const k = e.t / e.life;
      if (e.type === 'spark') {
        const r = Math.round((e.kind === 'big' ? 5 : 3) + k * (e.kind === 'big' ? 12 : 7));
        const c1 = e.kind === 'block' ? '#8fd0ff' : '#fff7b0', c2 = e.kind === 'block' ? '#3a7cff' : '#ff5a2a';
        ctx.fillStyle = c2;
        ctx.fillRect(x - r, y - 1, r * 2, 3); ctx.fillRect(x - 1, y - r, 3, r * 2);
        const d = Math.round(r * 0.7);
        for (const [dx, dy] of [[-d, -d], [d, -d], [-d, d], [d, d]]) ctx.fillRect(x + dx - 1, y + dy - 1, 3, 3);
        ctx.fillStyle = c1;
        const r2 = Math.max(1, Math.round(r * (1 - k)));
        ctx.fillRect(x - r2, y - 1, r2 * 2, 1); ctx.fillRect(x - 1, y - r2, 1, r2 * 2);
        ctx.fillRect(x - 2, y - 2, 4, 4);
      } else {
        const r = 4 + Math.round(k * 12);
        ctx.fillStyle = 'rgba(190,190,210,' + (0.5 * (1 - k)).toFixed(2) + ')';
        ctx.fillRect(x - r - 6, y - Math.round(k * 6) - 2, r, 3);
        ctx.fillRect(x + 6, y - Math.round(k * 6) - 2, r, 3);
      }
    }

    drawDebug(ctx, f, cam) {
      const hu = f.hurtbox();
      ctx.lineWidth = 1;
      if (hu) { ctx.strokeStyle = '#3cff6a'; ctx.strokeRect(Math.round(hu.x - cam) + 0.5, Math.round(hu.y) + 0.5, hu.w, hu.h); }
      const hb = f.hitbox();
      if (hb) { ctx.strokeStyle = '#ff3030'; ctx.strokeRect(Math.round(hb.x - cam) + 0.5, Math.round(hb.y) + 0.5, hb.w, hb.h); }
      ctx.strokeStyle = '#ffd400';
      const px = Math.round(f.x - cam), py = Math.round(f.y);
      ctx.beginPath(); ctx.moveTo(px - 4, py + 0.5); ctx.lineTo(px + 5, py + 0.5); ctx.moveTo(px + 0.5, py - 4); ctx.lineTo(px + 0.5, py + 5); ctx.stroke();
      WS.text(ctx, f.state + ' ' + f.anim.name + (f.anim.phase ? ':' + f.anim.phase[0] : ''), px, Math.round(f.y - f.z - 100), '#ffd400', 'center');
    }

    drawDebugHud(ctx) {
      WS.text(ctx, 'FPS ' + this.fps + '  CAM ' + Math.round(this.camX) + '  WAVE ' + this.waveIdx + (this.locked ? ' LOCK' : '') +
        '  ENEMIES ' + this.enemies.length + '  TOK ' + this.tokens.size, 4, WS.H - 10, '#3cff6a');
    }

    drawHud(ctx) {
      const p = this.player;
      // portrait cropped from the idle frame (head and shoulders)
      const atlas = WS.Atlas.get(p.def.atlas), fr = atlas.frames.idle0;
      ctx.fillStyle = '#1a0b2a'; ctx.fillRect(5, 5, 32, 32);
      ctx.drawImage(atlas.img, fr.x + 4, fr.y, 30, 30, 6, 6, 30, 30);
      ctx.strokeStyle = '#ff3d9a'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, 33, 33);

      WS.text(ctx, p.def.name, 42, 6, '#ff6fb5');
      WS.text(ctx, 'x' + Math.max(0, this.lives), 42 + WS.textWidth(p.def.name) + 8, 6, '#ffffff');
      this.drawBar(ctx, 42, 16, 96, 7, p.hp / p.def.maxHp, this.displayHp / p.def.maxHp, '#e8203c');
      WS.text(ctx, WS.pad(this.score, 6), 42, 27, '#ffe066');

      if (this.lastEnemyT > 0 && this.lastEnemy) {
        const e = this.lastEnemy;
        WS.text(ctx, e.def.name, WS.W - 8, 6, '#8fb4ff', 'right');
        const w = 96, x = WS.W - 8 - w;
        this.drawBar(ctx, x, 16, w, 7, Math.max(0, e.hp) / e.def.maxHp, Math.max(0, e.hp) / e.def.maxHp, '#3c6cff');
      }
      if (this.goArrow > 0 && (this.time >> 4) & 1) {
        WS.text(ctx, 'GO >', WS.W - 20, 120, '#ffe066', 'right');
      }
      if (this.stageBanner > 0) {
        const a = Math.min(1, this.stageBanner / 30);
        ctx.globalAlpha = a;
        WS.text(ctx, 'STAGE ' + this.stageDef.id, WS.W / 2, 70, '#ffffff', 'center');
        WS.text(ctx, this.stageDef.name, WS.W / 2, 82, '#ff6fb5', 'center');
        ctx.globalAlpha = 1;
      }
    }

    drawBar(ctx, x, y, w, h, frac, lagFrac, color) {
      ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#3a0f1e'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffcf3a'; ctx.fillRect(x, y, Math.round(w * WS.clamp(lagFrac, 0, 1)), h);
      ctx.fillStyle = color; ctx.fillRect(x, y, Math.round(w * WS.clamp(frac, 0, 1)), h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, Math.round(w * WS.clamp(frac, 0, 1)), 2);
    }

    renderOverlay(ctx, title, sub) {
      ctx.fillStyle = 'rgba(0,0,12,0.6)'; ctx.fillRect(0, 0, WS.W, WS.H);
      ctx.save(); ctx.scale(3, 3);
      WS.text(ctx, title, WS.W / 6, 36, '#ffffff', 'center');
      ctx.restore();
      WS.text(ctx, sub, WS.W / 2, 140, '#ffe066', 'center');
    }

    renderTitle(ctx) {
      this.stage.draw(ctx, 600);
      ctx.fillStyle = 'rgba(0,0,12,0.55)'; ctx.fillRect(0, 0, WS.W, WS.H);
      ctx.save(); ctx.scale(4, 4);
      WS.text(ctx, 'WARSAW', WS.W / 8, 14, '#ff6fb5', 'center');
      WS.text(ctx, 'STREETS', WS.W / 8, 26, '#ffffff', 'center');
      ctx.restore();
      if ((this.time >> 5) & 1) WS.text(ctx, 'PRESS ENTER', WS.W / 2, 150, '#ffe066', 'center');
      const lines = ['ARROWS / WASD  MOVE', 'J / Z  PUNCH COMBO    K / X  KICK', 'L / C  SPECIAL    SPACE  JUMP + J  AIR KICK', 'SHIFT  BLOCK    P  PAUSE    R  RESTART', 'F1  SHOW HIT BOXES'];
      lines.forEach((t, i) => WS.text(ctx, t, WS.W / 2, 178 + i * 11, '#b9c4ff', 'center'));
      WS.drawFrame(ctx, 'nina', 'idle' + ((this.time >> 4) % 3), 80, 236, 1);
    }

    renderError(ctx) {
      WS.text(ctx, 'ERROR', 10, 10, '#ff4040');
      const words = this.error.split(' ');
      let line = '', y = 26;
      for (const w of words) {
        if ((line + ' ' + w).length > 76) { WS.text(ctx, line, 10, y, '#fff'); y += 11; line = w; }
        else line = line ? line + ' ' + w : w;
      }
      WS.text(ctx, line, 10, y, '#fff');
      WS.text(ctx, 'IF THIS IS A FILE LOAD PROBLEM SEE THE README', 10, y + 22, '#aaa');
    }
  }

  WS.Game = Game;
})();
