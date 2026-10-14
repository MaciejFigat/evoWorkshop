import type { Rng } from '@evo/rng';
import {
  BEAM_DPS_BASE,
  BEAM_DPS_RAMP,
  BEAM_MAX_CHARGE_T,
  BEAM_WIDTH,
  BOARD_H,
  BOARD_W,
  BOSS_HP,
  BULLET_HIT_RADIUS,
  BULLET_SPEED,
  LOOP_ANGULAR_SPEED,
  LOOP_DESCEND,
  LOOP_RADIUS,
  PLAYER_Y,
  QUICKSORT_SPLIT_DIST,
} from './constants';
import type { Bullet, Era, Enemy, GameState, WeaponId } from './types';

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function spawnBullet(state: GameState, kind: WeaponId, vx: number, player: 0 | 1): void {
  const x = state.playerXs[player];
  state.bullets.push({ x, y: PLAYER_Y - 14, vx, vy: -BULLET_SPEED, kind, originY: PLAYER_Y - 14, split: false });
}

export function spawnEnemy(state: GameState, era: Era): void {
  const kind = era.enemy;
  if (kind === 'loop') {
    const centerX = state.rng.int(80, BOARD_W - 80);
    state.enemies.push({
      kind,
      x: centerX,
      y: -20,
      hp: 2,
      r: 14,
      decoy: false,
      angle: 0,
      centerX,
      centerY: -20,
      vulnerable: false,
      baseX: centerX,
      t: 0,
      groupId: -1,
      bitValue: false,
    });
    return;
  }
  const x = state.rng.int(30, BOARD_W - 30);
  const decoy = kind === 'hallucination' && state.rng.int(0, 99) < 30;
  const r = kind === 'bubble' ? 16 : kind === 'byte' ? 18 : 13;
  state.enemies.push({
    kind,
    x,
    y: -20,
    hp: 1,
    r,
    decoy,
    angle: 0,
    centerX: x,
    centerY: -20,
    vulnerable: true,
    baseX: x,
    t: 0,
    groupId: -1,
    bitValue: false,
  });
}

export function spawnBoss(state: GameState): void {
  state.enemies.push({
    kind: 'boss',
    x: BOARD_W / 2,
    y: 90,
    hp: BOSS_HP,
    r: 46,
    decoy: false,
    angle: 0,
    centerX: BOARD_W / 2,
    centerY: 90,
    vulnerable: true,
    baseX: BOARD_W / 2,
    t: 0,
    groupId: -1,
    bitValue: false,
  });
}

// A byte shatters into its 8 bits on the killing hit; each bit starts biased toward 1
// so there's always real work to do zeroing it, never a free clear.
function shatterByteIntoBits(byte: Enemy, groupId: number, rng: Rng): Enemy[] {
  const values = Array.from({ length: 8 }, () => rng.int(0, 99) < 65);
  if (!values.some(Boolean)) {
    const forced = rng.int(0, 7);
    values[forced] = true;
  }
  return values.map((bitValue, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = byte.x + (col - 1.5) * 24;
    const y = byte.y + (row - 0.5) * 24;
    return {
      kind: 'bit' as const,
      x,
      y,
      hp: 1,
      r: 9,
      decoy: false,
      angle: 0,
      centerX: x,
      centerY: y,
      vulnerable: true,
      baseX: x,
      t: 0,
      groupId,
      bitValue,
    };
  });
}

export function shatterDeadBytes(state: GameState, enemies: Enemy[]): Enemy[] {
  return enemies.flatMap((enemy) => {
    if (enemy.kind === 'byte' && enemy.hp <= 0) {
      const groupId = state.nextGroupId;
      state.nextGroupId += 1;
      return shatterByteIntoBits(enemy, groupId, state.rng);
    }
    return [enemy];
  });
}

export function clearCompletedByteGroups(enemies: Enemy[]): { remaining: Enemy[]; scoreDelta: number; realKills: number } {
  const groups = new Map<number, Enemy[]>();
  const others: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.kind !== 'bit') {
      others.push(enemy);
      continue;
    }
    const group = groups.get(enemy.groupId) ?? [];
    group.push(enemy);
    groups.set(enemy.groupId, group);
  }
  let scoreDelta = 0;
  let realKills = 0;
  const remainingBits: Enemy[] = [];
  for (const bits of groups.values()) {
    if (bits.every((bit) => !bit.bitValue)) {
      scoreDelta += 15;
      realKills += 1;
      continue;
    }
    remainingBits.push(...bits);
  }
  return { remaining: [...others, ...remainingBits], scoreDelta, realKills };
}

export function stepAndMaybeSplit(bullet: Bullet, dt: number): Bullet[] {
  const moved = { ...bullet, x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
  if (moved.y < -20 || moved.y > BOARD_H + 20 || moved.x < -20 || moved.x > BOARD_W + 20) {
    return [];
  }
  // Quicksort forks once, mid-flight, into two diverging shots: divide the problem, conquer the pieces.
  if (moved.kind === 'quicksort' && !moved.split && moved.originY - moved.y > QUICKSORT_SPLIT_DIST) {
    const forked = { ...moved, split: true };
    return [forked, { ...forked, vx: -140 }, { ...forked, vx: 140 }];
  }
  return [moved];
}

export function stepEnemy(enemy: Enemy, era: Era, dt: number): Enemy {
  if (enemy.kind === 'byte' || enemy.kind === 'hallucination') {
    return { ...enemy, y: enemy.y + era.enemySpeed * dt };
  }
  if (enemy.kind === 'bit') {
    return { ...enemy, y: enemy.y + era.enemySpeed * 0.6 * dt };
  }
  if (enemy.kind === 'bubble') {
    const t = enemy.t + dt;
    return { ...enemy, t, x: enemy.baseX + 40 * Math.sin(t * 3), y: enemy.y + era.enemySpeed * dt };
  }
  if (enemy.kind === 'loop') {
    const angle = enemy.angle + LOOP_ANGULAR_SPEED * dt;
    const centerY = enemy.centerY + LOOP_DESCEND * dt;
    // Only exposed once per lap, near the bottom of its circle — the rest of the cycle it simply isn't there to hit.
    const vulnerable = Math.cos(angle) < -0.4;
    return {
      ...enemy,
      angle,
      centerY,
      vulnerable,
      x: enemy.centerX + LOOP_RADIUS * Math.sin(angle),
      y: centerY + LOOP_RADIUS * 0.5 * Math.cos(angle),
    };
  }
  const t = enemy.t + dt;
  return { ...enemy, t, x: BOARD_W / 2 + 70 * Math.sin(t * 0.6) };
}

export function applyBulletHits(bullets: Bullet[], enemies: Enemy[]): { bullets: Bullet[]; enemies: Enemy[] } {
  const consumed = bullets.map(() => false);
  const updatedEnemies = enemies.map((enemy) => {
    if (enemy.kind === 'loop' && !enemy.vulnerable) {
      return enemy;
    }
    if (enemy.kind === 'bit' && !enemy.bitValue) {
      return enemy;
    }
    let hit = false;
    for (let i = 0; i < bullets.length; i += 1) {
      if (hit) {
        break;
      }
      if (consumed[i] === true) {
        continue;
      }
      const bullet = bullets[i];
      if (bullet === undefined) {
        continue;
      }
      if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < BULLET_HIT_RADIUS + enemy.r) {
        consumed[i] = true;
        hit = true;
      }
    }
    if (!hit) {
      return enemy;
    }
    // A bit is flipped by a hit, not destroyed — zeroing the data is the point, not deleting it.
    return enemy.kind === 'bit' ? { ...enemy, bitValue: false } : { ...enemy, hp: enemy.hp - 1 };
  });
  return { bullets: bullets.filter((_, i) => consumed[i] !== true), enemies: updatedEnemies };
}

// Attention era: both ships can hold a beam at once. Each is its own charge
// and its own damage column, so two held beams on the same enemy stack —
// more firepower, no friendly-fire concept to get in the way of co-op.
export function applyBeamDamage(state: GameState, dt: number): void {
  for (const player of [0, 1] as const) {
    const held = state.keysByPlayer[player].has('Space');
    if (!held) {
      state.beamCharges[player] = 0;
      continue;
    }
    state.beamCharges[player] = Math.min(state.beamCharges[player] + dt, BEAM_MAX_CHARGE_T);
    const dps = BEAM_DPS_BASE + Math.min(state.beamCharges[player] / BEAM_MAX_CHARGE_T, 1) * BEAM_DPS_RAMP;
    const damage = dps * dt;
    const halfWidth = BEAM_WIDTH / 2;
    const playerX = state.playerXs[player];
    state.enemies = state.enemies.map((enemy) =>
      Math.abs(enemy.x - playerX) <= halfWidth + enemy.r * 0.4 ? { ...enemy, hp: enemy.hp - damage } : enemy,
    );
  }
}

export function finalizeDeaths(enemies: Enemy[]): { alive: Enemy[]; scoreDelta: number; livesDelta: number; realKills: number } {
  let scoreDelta = 0;
  let livesDelta = 0;
  let realKills = 0;
  const alive: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.hp > 0) {
      alive.push(enemy);
      continue;
    }
    if (enemy.kind === 'hallucination' && enemy.decoy) {
      livesDelta -= 1;
      continue;
    }
    scoreDelta += enemy.kind === 'boss' ? 50 : 10;
    if (enemy.kind !== 'boss') {
      realKills += 1;
    }
  }
  return { alive, scoreDelta, livesDelta, realKills };
}

export function partitionEscaped(enemies: Enemy[]): { remaining: Enemy[]; livesDelta: number } {
  let livesDelta = 0;
  const remaining: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.kind === 'boss' || enemy.y <= BOARD_H + 30) {
      remaining.push(enemy);
      continue;
    }
    const alreadyHarmless = (enemy.kind === 'hallucination' && enemy.decoy) || (enemy.kind === 'bit' && !enemy.bitValue);
    if (!alreadyHarmless) {
      livesDelta -= 1;
    }
  }
  return { remaining, livesDelta };
}
