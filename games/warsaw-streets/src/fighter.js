/* Fighter: one state machine shared by the player and every enemy.

   States:  idle | walk | block | attack | jump | hurt | fall | down | getup | dead
   Position: x (world), y (depth on the ground plane = screen y of the feet), z (height above ground).
   Every state that plays an animation calls anim.play(name) each tick, which is a no-op when
   the animation is already running, so nothing restarts accidentally. */
(function () {
  'use strict';
  const WS = window.WS;

  const NEUTRAL = Object.freeze({ mx: 0, my: 0, attack: null, jump: false, block: false, faceTo: null });

  class Fighter {
    constructor(defName, opts) {
      const def = window.CHARACTERS[defName];
      if (!def) throw new Error('Unknown fighter ' + defName);
      this.key = defName;
      this.def = def;
      this.anims = def._compiled || (def._compiled = WS.compileAnims(def.anims, def.atlas, defName));
      this.isPlayer = !!def.player;
      this.team = this.isPlayer ? 0 : 1;

      this.x = opts.x; this.y = opts.y; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.facing = opts.facing || 1;
      this.hp = def.maxHp;
      this.anim = new WS.Animator(this.anims);

      this.state = 'idle';
      this.stateT = 0;
      this.invuln = 0;        // ticks of damage immunity (blinks)
      this.hitstop = 0;       // frozen ticks after a hit lands / is received
      this.flash = 0;         // white hit-flash ticks
      this.attack = null;     // current attack definition
      this.attackId = null;
      this.hitSet = new Set();// targets already struck by the current attack
      this.buffer = null;     // queued attack key (combo chaining)
      this.bufferT = 0;
      this.airAttacked = false;
      this.comboHits = 0;     // hits taken since last standing up (3 -> forced knockdown)
      this.lastHitBy = null;
      this.removeMe = false;
      this.deadT = 0;
      this.anim.play('idle');
    }

    get alive() { return this.hp > 0; }
    get busy() { return this.state !== 'idle' && this.state !== 'walk'; }

    /* ---------- collision boxes (world / screen space, y down) ---------- */

    /** Where the body can be hit. null while lying down or dead. */
    hurtbox() {
      if (this.state === 'down' || this.state === 'dead') return null;
      const hb = this.def.hurtbox;
      return { x: this.x - hb.w / 2, y: this.y - this.z - hb.h, w: hb.w, h: hb.h };
    }

    /** The live attack hitbox, or null when not in an active frame. */
    hitbox() {
      const atk = this.attack;
      if (!atk || (this.state !== 'attack' && !(this.state === 'jump' && this.airAttacked))) return null;
      if (this.anim.phase !== 'active' || !this.anim.frame.act) return null;
      const [bx, by, bw, bh] = atk.box;
      const x0 = this.facing > 0 ? this.x + bx : this.x - bx - bw;
      return { x: x0, y: this.y - this.z + by, w: bw, h: bh };
    }

    /* ---------- state helpers ---------- */

    setState(s) { this.state = s; this.stateT = 0; }

    toIdle() {
      this.setState('idle');
      this.attack = null; this.buffer = null;
      this.vx = 0; this.vy = 0;
      this.anim.play('idle');
    }

    startAttack(id) {
      const atk = this.def.attacks[id];
      if (!atk) throw new Error(this.key + ' has no attack "' + id + '"');
      this.attack = atk; this.attackId = id;
      this.hitSet.clear();
      this.buffer = null; this.bufferT = 0;
      this.vx = 0; this.vy = 0;
      if (atk.air) {
        this.airAttacked = true;
        this.anim.play(atk.anim, true);
      } else {
        this.setState('attack');
        this.anim.play(atk.anim, true);
      }
    }

    startJump(mx) {
      this.setState('jump');
      this.vz = this.def.jumpV;
      this.vx = mx * this.def.speed;
      this.airAttacked = false; this.attack = null;
      this.anim.play('jump');
    }

    /** Called by the game when this fighter lands a hit (gives hitstop on the attacker's side). */
    onHitLanded(atk) { this.hitstop = Math.max(this.hitstop, atk.hitstop || 3); }

    /** Receive a hit. Returns 'hit' | 'blocked' | null (ignored). */
    takeHit(att, atk) {
      if (this.invuln > 0) return null;
      if (this.state === 'down' || this.state === 'dead') return null;
      const dir = att.x <= this.x ? 1 : -1;        // knockback direction (away from attacker)

      // blocking: only against hits coming from the front, never against knockdown specials
      if (this.state === 'block' && att.x * this.facing > this.x * this.facing - 1 && !atk.knockdown) {
        this.hp = Math.max(1, this.hp - Math.ceil(atk.damage * 0.2));
        this.vx = dir * (atk.push || 1) * 0.5;
        this.flash = 2;
        this.hitstop = Math.max(this.hitstop, 3);
        return 'blocked';
      }

      this.hp -= atk.damage;
      this.lastHitBy = att;
      this.flash = 5;
      this.hitstop = Math.max(this.hitstop, atk.hitstop || 3);
      this.facing = -dir;                           // turn to face the attacker
      this.attack = null; this.buffer = null;
      this.comboHits++;

      const airborne = this.z > 0.5;
      if (this.hp <= 0 || atk.knockdown || airborne || this.comboHits >= 3) {
        this.setState('fall');
        this.vz = this.def.jumpV ? 2.9 : 3.2;
        this.vx = dir * (atk.push || 2) * 1.1;
        this.vy = 0;
        this.anim.play('fall', true);
      } else {
        this.setState('hurt');
        this.vx = dir * (atk.push || 1);
        this.vy = 0;
        this.stunT = atk.stun || 16;
        this.anim.play('hurt', true);
        if (this.isPlayer) this.invuln = this.stunT + 12;   // no stun-lock on the player
      }
      return 'hit';
    }

    /* ---------- per-tick update ---------- */

    update(game, intent) {
      intent = intent || NEUTRAL;
      if (this.hitstop > 0) { this.hitstop--; return; }
      if (this.invuln > 0) this.invuln--;
      if (this.flash > 0) this.flash--;
      if (this.bufferT > 0 && --this.bufferT === 0) this.buffer = null;
      this.stateT++;

      switch (this.state) {
        case 'idle':
        case 'walk': this.tickFree(game, intent); break;
        case 'block': this.tickBlock(intent); break;
        case 'attack': this.tickAttack(game, intent); break;
        case 'jump': this.tickJump(game, intent); break;
        case 'hurt': this.tickHurt(); break;
        case 'fall': this.tickFall(game); break;
        case 'down': this.tickDown(); break;
        case 'getup': this.tickGetup(); break;
        case 'dead': this.tickDead(); break;
      }
      this.anim.tick();
      game.moveFighter(this);
    }

    tickFree(game, intent) {
      if (intent.faceTo !== null && intent.faceTo !== undefined) {
        const d = intent.faceTo - this.x;
        if (Math.abs(d) > 2) this.facing = d > 0 ? 1 : -1;
      }
      if (intent.block && this.def.anims.block) { this.setState('block'); this.vx = this.vy = 0; this.anim.play('block'); return; }
      if (intent.attack) {
        const id = this.def.keys ? this.def.keys[intent.attack] : intent.attack;
        if (id) {
          if (intent.mx && intent.faceTo == null) this.facing = intent.mx > 0 ? 1 : -1;
          this.startAttack(id);
          return;
        }
      }
      if (intent.jump && this.def.jumpV) { this.startJump(intent.mx); return; }

      this.vx = intent.mx * this.def.speed;
      this.vy = intent.my * this.def.depthSpeed;
      if (intent.mx && intent.faceTo === null) this.facing = intent.mx > 0 ? 1 : -1;
      if (intent.mx || intent.my) { this.state = 'walk'; this.anim.play('walk'); }
      else { this.state = 'idle'; this.anim.play('idle'); }
    }

    tickBlock(intent) {
      this.vx *= 0.8;
      if (!intent.block) this.toIdle();
    }

    tickAttack(game, intent) {
      const atk = this.attack;
      const fr = this.anim.frame;
      this.vx = fr.vx ? fr.vx * this.facing : this.vx * 0.7;
      this.vy = 0;

      // queue a follow-up (combo chain) pressed at any time during the attack
      if (intent.attack && atk.next && atk.next[intent.attack]) { this.buffer = intent.attack; this.bufferT = 18; }

      if (this.anim.phase === 'active') game.resolveHits(this);

      const phase = this.anim.phase;
      const canChain = (phase === 'recovery' || this.anim.done) && this.buffer && atk.next && atk.next[this.buffer];
      if (canChain) { this.startAttack(atk.next[this.buffer]); return; }
      if (this.anim.done) this.toIdle();
    }

    tickJump(game, intent) {
      this.vz -= this.def.gravity;
      this.z += this.vz;
      this.vy = intent.my * this.def.depthSpeed * 0.5;
      if (intent.attack && !this.airAttacked && this.def.keys && this.def.keys.air) {
        this.startAttack(this.def.keys.air);
      }
      if (this.airAttacked && this.anim.phase === 'active') game.resolveHits(this);
      if (this.z <= 0) {
        this.z = 0; this.vz = 0; this.vx = 0;
        this.airAttacked = false; this.attack = null;
        if (this.anims.land) { this.setState('getup'); this.landing = true; this.anim.play('land', true); }
        else this.toIdle();
      }
    }

    tickHurt() {
      this.vx *= 0.82;
      if (this.stateT >= (this.stunT || 16) && this.anim.done) { this.comboHits = 0; this.toIdle(); }
    }

    tickFall(game) {
      this.vz -= this.def.gravity;
      this.z += this.vz;
      this.vx *= 0.992;
      if (this.z <= 0 && this.vz < 0) {
        this.z = 0; this.vz = 0; this.vx *= 0.4;
        this.setState(this.alive ? 'down' : 'dead');
        this.anim.play(this.alive ? 'down' : 'dead', true);
        game.onLanded(this);
      }
    }

    tickDown() {
      this.vx *= 0.85;
      if (this.stateT >= this.def.downTicks) {
        this.setState('getup'); this.landing = false;
        this.invuln = this.def.getupInvuln;
        this.comboHits = 0;
        this.anim.play('getup', true);
      }
    }

    tickGetup() {
      this.vx *= 0.8;
      if (this.anim.done) { this.comboHits = 0; this.toIdle(); }
    }

    tickDead() {
      this.vx *= 0.85;
      this.deadT++;
      if (!this.isPlayer && this.deadT > 100) this.removeMe = true;
    }
  }

  WS.Fighter = Fighter;
  WS.NEUTRAL = NEUTRAL;
})();
