/* Enemy AI. A Brain only produces an *intent* (same shape the keyboard produces); the Fighter
   state machine does the rest. Readability rules:
   - only `maxAttackers` enemies may attack at once (attack tokens); the rest circle at a distance
   - every attack has a long startup animation, which is the visible warning
   - after an attack the enemy backs off and waits a randomised cooldown */
(function () {
  'use strict';
  const WS = window.WS;

  class Brain {
    constructor(fighter, side) {
      this.f = fighter;
      this.side = side || (WS.random() < 0.5 ? -1 : 1);   // which side of the player to stand on
      this.yOff = WS.rand(-10, 10);                         // depth offset so enemies do not stack
      this.cool = WS.randInt(30, 80);
      this.backoff = 0;
      this.wasAttacking = false;
    }

    chooseAttack() {
      const list = this.f.def.ai.attacks;
      let total = 0;
      for (const [, w] of list) total += w;
      let r = WS.random() * total;
      for (const [id, w] of list) { if ((r -= w) <= 0) return id; }
      return list[0][0];
    }

    think(game) {
      const f = this.f, p = game.player, ai = f.def.ai;
      const intent = { mx: 0, my: 0, attack: null, jump: false, block: false, faceTo: p.x };

      if (f.state === 'attack') { this.wasAttacking = true; return intent; }
      if (f.busy) {                         // hurt / falling / lying / getting up
        game.releaseToken(f);
        if (this.wasAttacking) { this.wasAttacking = false; this.cool = WS.randInt(ai.cooldown[0], ai.cooldown[1]); }
        return intent;
      }
      if (this.wasAttacking) {              // an attack just finished: step back, then wait
        this.wasAttacking = false;
        game.releaseToken(f);
        this.cool = WS.randInt(ai.cooldown[0], ai.cooldown[1]);
        this.backoff = WS.randInt(18, 45);
        if (WS.random() < 0.35) this.side = -this.side;
      }
      if (!p.alive || p.state === 'dead') { intent.faceTo = null; return intent; }

      const dx = p.x - f.x, dy = p.y - f.y;
      if (this.cool > 0) this.cool--;

      if (this.backoff > 0) {
        this.backoff--;
        intent.mx = -WS.sign(dx);
        return intent;
      }

      let engage = false;
      if (this.cool <= 0) engage = game.requestToken(f);
      else game.releaseToken(f);

      const tx = p.x + this.side * (engage ? ai.range * 0.9 : ai.orbit);
      const ty = p.y + (engage ? this.yOff * 0.3 : this.yOff);
      const ex = tx - f.x, ey = ty - f.y;
      if (Math.abs(ex) > 3) intent.mx = WS.sign(ex);
      if (Math.abs(ey) > 2) intent.my = WS.sign(ey);

      if (engage && Math.abs(dx) <= ai.range + 8 && Math.abs(dy) <= 7) {
        intent.attack = this.chooseAttack();
        intent.mx = 0; intent.my = 0;
      }
      return intent;
    }
  }

  WS.Brain = Brain;
})();
