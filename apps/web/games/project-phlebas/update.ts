import { BOARD_W, PC_GAP, PC_REST, PLAYER_HALF_W, PLAYER_SPEED, QUICKSORT_COOLDOWN, RELAY_COOLDOWN } from './constants';
import { refreshOverlay } from './dom';
import { ERAS, requireEra } from './eras';
import {
  applyBeamDamage,
  applyBulletHits,
  clearCompletedByteGroups,
  finalizeDeaths,
  partitionEscaped,
  shatterDeadBytes,
  spawnBoss,
  spawnBullet,
  spawnEnemy,
  stepAndMaybeSplit,
  stepEnemy,
} from './entities';
import type { Era, GameState } from './types';

function advanceToEra(state: GameState, index: number): void {
  state.eraIndex = index;
  state.eraKills = 0;
  state.enemies = [];
  state.bullets = [];
  state.paused = true;
  state.emit('era', { era: requireEra(index).id, score: state.score });
  refreshOverlay(state);
}

function enterBossPhase(state: GameState): void {
  state.phase = 'boss';
  state.enemies = [];
  state.bullets = [];
  spawnBoss(state);
  state.paused = true;
  state.emit('boss', { score: state.score });
  refreshOverlay(state);
}

// Dev-panel era jump: unlike the automatic transition, this can fire from any phase
// (including after a loss), so it also resets phase and lives before moving.
export function goToEra(state: GameState, index: number): void {
  state.phase = 'play';
  if (state.lives <= 0) {
    state.lives = 3;
  }
  advanceToEra(state, Math.min(Math.max(index, 0), ERAS.length - 1));
}

export function nextEra(state: GameState): void {
  if (state.phase !== 'play') {
    return;
  }
  if (state.eraIndex < ERAS.length - 1) {
    goToEra(state, state.eraIndex + 1);
    return;
  }
  if (state.lives <= 0) {
    state.lives = 3;
  }
  enterBossPhase(state);
}

export function prevEra(state: GameState): void {
  if (state.phase === 'boss' || state.phase === 'won' || state.phase === 'over') {
    goToEra(state, ERAS.length - 1);
    return;
  }
  if (state.eraIndex > 0) {
    goToEra(state, state.eraIndex - 1);
  }
}

function updateFiring(state: GameState, era: Era, dt: number): void {
  if (era.weapon === 'attention') {
    applyBeamDamage(state, dt);
    return;
  }
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  if (!state.keys.has('Space')) {
    state.burstCount = 0;
    return;
  }
  if (state.fireCooldown > 0) {
    return;
  }
  if (era.weapon === 'relay') {
    spawnBullet(state, 'relay', 0);
    state.fireCooldown = RELAY_COOLDOWN;
  } else if (era.weapon === 'pcbeam') {
    spawnBullet(state, 'pcbeam', 0);
    state.burstCount += 1;
    if (state.burstCount >= 3) {
      state.burstCount = 0;
      state.fireCooldown = PC_REST;
    } else {
      state.fireCooldown = PC_GAP;
    }
  } else {
    spawnBullet(state, 'quicksort', 0);
    state.fireCooldown = QUICKSORT_COOLDOWN;
  }
}

export function update(state: GameState, dt: number): void {
  if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) {
    state.playerX -= PLAYER_SPEED * dt;
  }
  if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) {
    state.playerX += PLAYER_SPEED * dt;
  }
  state.playerX = Math.min(BOARD_W - PLAYER_HALF_W, Math.max(PLAYER_HALF_W, state.playerX));

  const era = requireEra(Math.min(state.eraIndex, ERAS.length - 1));
  updateFiring(state, era, dt);

  state.bullets = state.bullets.flatMap((b) => stepAndMaybeSplit(b, dt));
  state.enemies = state.enemies.map((e) => stepEnemy(e, era, dt));

  const escaped = partitionEscaped(state.enemies);
  state.enemies = escaped.remaining;
  state.lives += escaped.livesDelta;

  const hits = applyBulletHits(state.bullets, state.enemies);
  state.bullets = hits.bullets;
  const shattered = shatterDeadBytes(state, hits.enemies);
  const cleared = clearCompletedByteGroups(shattered);
  const finalized = finalizeDeaths(cleared.remaining);
  state.enemies = finalized.alive;
  state.score += finalized.scoreDelta + cleared.scoreDelta;
  state.lives += finalized.livesDelta;

  if (state.lives <= 0) {
    state.phase = 'over';
    state.paused = true;
    state.emit('game-over', { score: state.score });
    refreshOverlay(state);
    return;
  }

  if (state.phase === 'boss') {
    if (!state.enemies.some((e) => e.kind === 'boss')) {
      state.phase = 'won';
      state.paused = true;
      state.emit('won', { score: state.score });
      refreshOverlay(state);
    }
    return;
  }

  state.eraKills += finalized.realKills + cleared.realKills;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, era);
    state.spawnTimer = era.spawnSeconds * (0.85 + state.rng.next() * 0.3);
  }

  if (!state.stayInEra && state.eraKills >= era.killsToAdvance) {
    if (state.eraIndex < ERAS.length - 1) {
      advanceToEra(state, state.eraIndex + 1);
    } else {
      enterBossPhase(state);
    }
  }
}
