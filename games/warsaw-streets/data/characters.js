/* Character and enemy definitions - pure data. Adding a fighter = adding an entry here (plus an
   atlas from tools/extract.html); the animation / combat / AI engine does not change.

   Frame lists:  [frameId, ticks, extra]   (60 ticks = 1 second)
     extra.act    -> this frame is an ATTACK-ACTIVE frame (hitbox is live while it is shown)
     extra.vx     -> forward lunge speed (px/tick) while this frame is shown
   Attack phases come from the animation: frames before the first `act` = startup,
   `act` frames = active, frames after = recovery.

   Boxes are [x, y, w, h] relative to the foot pivot, x measured FORWARD (towards facing),
   y measured UP from the feet as a negative number. Sprite size and collision boxes are
   deliberately separate from the (mostly transparent) sprite rectangle. */
window.CHARACTERS = {

  nina: {
    name: 'NINA', atlas: 'nina', player: true,
    maxHp: 100, speed: 1.5, depthSpeed: 1.0,
    jumpV: 4.7, gravity: 0.30,
    hurtbox: { w: 26, h: 80 },
    downTicks: 38, getupInvuln: 50,
    anims: {
      idle:   { loop: true, frames: [['idle0', 10], ['idle1', 10], ['idle2', 10], ['idle1', 10]] },
      walk:   { loop: true, frames: [['walk0', 8], ['idle1', 4], ['walk1', 8], ['idle1', 4]] },
      block:  { loop: true, frames: [['block', 6]] },
      jump:   { loop: true, frames: [['jump', 6]] },
      land:   { frames: [['crouch', 5]] },
      hurt:   { frames: [['hurt', 16]] },
      fall:   { frames: [['fall0', 8]] },
      down:   { loop: true, frames: [['down', 1]] },
      getup:  { frames: [['crouch', 12], ['idle0', 6]] },
      dead:   { loop: true, frames: [['down', 1]] },
      // attacks: startup / active / recovery
      jab:      { frames: [['idle0', 3], ['punch', 4, { act: 1 }], ['idle0', 7]] },
      combo:    { frames: [['combo0', 3], ['combo1', 4, { act: 1 }], ['combo0', 8]] },
      finisher: { frames: [['idle1', 5], ['highkick', 6, { act: 1 }], ['idle1', 14]] },
      kick:     { frames: [['idle1', 3], ['kick', 5, { act: 1 }], ['idle1', 10]] },
      special:  { frames: [['crouch', 9], ['special', 7, { act: 1, vx: 1.6 }], ['idle0', 20]] },
      airkick:  { frames: [['kick', 14, { act: 1 }], ['kick', 8]] },
    },
    attacks: {
      jab:      { anim: 'jab',      damage: 5,  box: [14, -76, 40, 20],  push: 1.4, stun: 18, hitstop: 4, shake: 0, next: { attack: 'combo', kick: 'kick' } },
      combo:    { anim: 'combo',    damage: 6,  box: [10, -72, 52, 22],  push: 1.8, stun: 20, hitstop: 4, shake: 0, next: { attack: 'finisher' } },
      finisher: { anim: 'finisher', damage: 10, box: [10, -102, 50, 36], push: 3.0, hitstop: 7, shake: 3, knockdown: true },
      kick:     { anim: 'kick',     damage: 7,  box: [14, -66, 60, 22],  push: 2.2, stun: 20, hitstop: 5, shake: 1 },
      special:  { anim: 'special',  damage: 14, box: [20, -70, 88, 26],  push: 3.6, hitstop: 8, shake: 4, knockdown: true },
      airkick:  { anim: 'airkick',  damage: 8,  box: [10, -58, 62, 32],  push: 2.4, stun: 22, hitstop: 5, shake: 1, air: true },
    },
    // which attack a key starts from the ground / in the air
    keys: { attack: 'jab', kick: 'kick', special: 'special', air: 'airkick' },
  },

  goon: {
    name: 'MAFIA GOON', atlas: 'goon',
    maxHp: 36, speed: 0.7, depthSpeed: 0.5,
    gravity: 0.30,
    hurtbox: { w: 26, h: 84 },
    downTicks: 55, getupInvuln: 20,
    score: 500,
    anims: {
      idle:   { loop: true, frames: [['idle', 22], ['guard', 22]] },
      walk:   { loop: true, frames: [['walk', 9], ['stalk', 9]] },
      hurt:   { frames: [['guard', 16]] },
      fall:   { frames: [['grab', 8]] },
      down:   { loop: true, frames: [['down', 1]] },
      getup:  { frames: [['guard', 14], ['idle', 6]] },
      dead:   { loop: true, frames: [['down', 1]] },
      // enemy attacks have long, readable startups (the wind-up is the warning)
      punch:  { frames: [['guard', 18], ['punch', 5, { act: 1 }], ['guard', 18]] },
      kick:   { frames: [['stalk', 22], ['kick', 6, { act: 1 }], ['guard', 22]] },
    },
    attacks: {
      punch: { anim: 'punch', damage: 6, box: [14, -72, 24, 18], push: 1.6, stun: 18, hitstop: 4, shake: 0 },
      kick:  { anim: 'kick',  damage: 9, box: [12, -82, 38, 24], push: 2.2, stun: 20, hitstop: 5, shake: 1 },
    },
    ai: { range: 36, cooldown: [55, 120], attacks: [['punch', 3], ['kick', 2]], orbit: 120 },
  },
};
