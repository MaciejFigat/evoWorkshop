/* Atlas loading + data-driven animation playback.

   An animation definition is plain data:
     { loop: true|false, speed: 1, frames: [ [frameId, ticks, extra?], ... ] }
   `extra` may carry: act (attack-active frame), vx (lunge speed while on this frame).
   Durations are in simulation ticks (1/60 s) and are scaled by Animator.speed. */
(function () {
  'use strict';
  const WS = window.WS;

  /* ---------------- atlas library ---------------- */
  const atlases = {};

  WS.Atlas = {
    /** Load every atlas the data files registered in window.ATLAS (plus a white "hit flash" copy). */
    load(names) {
      return Promise.all(names.map(name => new Promise((resolve, reject) => {
        const meta = (window.ATLAS || {})[name];
        if (!meta) return reject(new Error('Missing atlas data for "' + name + '" (data/atlas_' + name + '.js)'));
        const img = new Image();
        img.onload = () => {
          const flash = document.createElement('canvas');
          flash.width = img.width; flash.height = img.height;
          const c = flash.getContext('2d');
          c.drawImage(img, 0, 0);
          c.globalCompositeOperation = 'source-in';
          c.fillStyle = '#ffffff';
          c.fillRect(0, 0, flash.width, flash.height);
          atlases[name] = { name, img, flash, frames: meta.frames };
          resolve(atlases[name]);
        };
        img.onerror = () => reject(new Error('Could not load ' + meta.src));
        img.src = meta.src;
      })));
    },
    get(name) {
      const a = atlases[name];
      if (!a) throw new Error('Atlas not loaded: ' + name);
      return a;
    },
  };

  /* ---------------- animation data ---------------- */

  /** Turn the compact [id, ticks, extra] frame lists into objects and precompute attack phases. */
  WS.compileAnims = function (anims, atlasName, ownerName) {
    const atlas = WS.Atlas.get(atlasName);
    const out = {};
    for (const key of Object.keys(anims)) {
      const src = anims[key];
      const frames = src.frames.map(f => {
        const o = Object.assign({ f: f[0], t: f[1] }, f[2] || {});
        if (!atlas.frames[o.f]) {
          throw new Error(ownerName + '.' + key + ': frame "' + o.f + '" is not in atlas ' + atlasName);
        }
        if (!(o.t > 0)) throw new Error(ownerName + '.' + key + ': frame "' + o.f + '" needs a duration > 0');
        return o;
      });
      let first = -1, last = -1;
      frames.forEach((f, i) => { if (f.act) { if (first < 0) first = i; last = i; } });
      out[key] = {
        name: key, loop: !!src.loop, speed: src.speed || 1, frames,
        firstActive: first, lastActive: last,
        length: frames.reduce((s, f) => s + f.t, 0),
      };
    }
    return out;
  };

  /* ---------------- animator ---------------- */

  class Animator {
    constructor(anims) {
      this.anims = anims;
      this.name = null; this.def = null;
      this.i = 0; this.t = 0; this.acc = 0;
      this.done = false;
      this.speed = 1;            // playback speed multiplier (slow-mo, haste ...)
    }

    /** Start `name`. Calling it again with the same name is a no-op, so state code can call
        play() every tick without restarting the animation. Pass force=true to restart. */
    play(name, force) {
      if (name === this.name && !force) return false;
      const def = this.anims[name];
      if (!def) throw new Error('Unknown animation "' + name + '"');
      this.name = name; this.def = def;
      this.i = 0; this.t = 0; this.acc = 0; this.done = false;
      this.fresh = true;          // do not tick in the update that started it: frame 0 gets its full duration
      return true;
    }

    get frame() { return this.def.frames[this.i]; }

    /** 'startup' | 'active' | 'recovery' for attack animations, otherwise null. */
    get phase() {
      const d = this.def;
      if (d.firstActive < 0) return null;
      if (this.i < d.firstActive) return 'startup';
      if (this.i > d.lastActive) return 'recovery';
      return 'active';
    }

    tick() {
      if (this.fresh) { this.fresh = false; return; }
      if (this.done) return;
      this.acc += this.speed * this.def.speed;
      while (this.acc >= 1 && !this.done) {
        this.acc -= 1;
        this.t++;
        if (this.t >= this.def.frames[this.i].t) {
          this.t = 0;
          this.i++;
          if (this.i >= this.def.frames.length) {
            if (this.def.loop) this.i = 0;
            else { this.i = this.def.frames.length - 1; this.done = true; }  // hold last frame
          }
        }
      }
    }
  }
  WS.Animator = Animator;

  /** Draw one atlas frame with its foot pivot at (x, y). dir = +1 (as drawn, facing right) or -1. */
  WS.drawFrame = function (ctx, atlasName, frameId, x, y, dir, flash) {
    const a = WS.Atlas.get(atlasName);
    const fr = a.frames[frameId];
    const src = flash ? a.flash : a.img;
    x = Math.round(x); y = Math.round(y);
    if (dir < 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(src, fr.x, fr.y, fr.w, fr.h, -fr.px, -fr.py, fr.w, fr.h);
      ctx.restore();
    } else {
      ctx.drawImage(src, fr.x, fr.y, fr.w, fr.h, x - fr.px, y - fr.py, fr.w, fr.h);
    }
  };
})();
