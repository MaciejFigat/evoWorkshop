import { BOARD_W, PC_GAP, PC_REST, PLAYER_HALF_W, PLAYER_SPEED, QUICKSORT_COOLDOWN, RELAY_COOLDOWN } from './constants';
import { refreshOverlay, type Ui } from './dom';
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

function advanceToEra(state: GameState, ui: Ui, index: number): void {
  state.eraIndex = index;
  state.eraKills = 0;
  state.enemies = [];
  state.bullets = [];
  state.paused = true;
  refreshOverlay(ui, state);
}

function enterBossPhase(state: GameState, ui: Ui): void {
  state.phase = 'boss';
  state.enemies = [];
  state.bullets = [];
  spawnBoss(state);
  state.paused = true;
  refreshOverlay(ui, state);
}

// Dev-panel era jump (host only): unlike the automatic transition, this can
// fire from any phase (including after a loss), so it also resets phase and
// lives before moving.
export function goToEra(state: GameState, ui: Ui, index: number): void {
  state.phase = 'play';
  if (state.lives <= 0) {
    state.lives = 3;
  }
  advanceToEra(state, ui, Math.min(Math.max(index, 0), ERAS.length - 1));
}

export function nextEra(state: GameState, ui: Ui): void {
  if (state.phase !== 'play') {
    return;
  }
  if (state.eraIndex < ERAS.length - 1) {
    goToEra(state, ui, state.eraIndex + 1);
    return;
  }
  if (state.lives <= 0) {
    state.lives = 3;
  }
  enterBossPhase(state, ui);
}

export function prevEra(state: GameState, ui: Ui): void {
  if (state.phase === 'boss' || state.phase === 'won' || state.phase === 'over') {
    goToEra(state, ui, ERAS.length - 1);
    return;
  }
  if (state.eraIndex > 0) {
    goToEra(state, ui, state.eraIndex - 1);
  }
}

function updateFiring(state: GameState, era: Era, dt: number, player: 0 | 1): void {
  if (era.weapon === 'attention') {
    return; // applyBeamDamage handles both players' beams directly
  }
  state.fireCooldowns[player] = Math.max(0, state.fireCooldowns[player] - dt);
  if (!state.keysByPlayer[player].has('Space')) {
    state.burstCounts[player] = 0;
    return;
  }
  if (state.fireCooldowns[player] > 0) {
    return;
  }
  if (era.weapon === 'relay') {
    spawnBullet(state, 'relay', 0, player);
    state.fireCooldowns[player] = RELAY_COOLDOWN;
  } else if (era.weapon === 'pcbeam') {
    spawnBullet(state, 'pcbeam', 0, player);
    state.burstCounts[player] += 1;
    if (state.burstCounts[player] >= 3) {
      state.burstCounts[player] = 0;
      state.fireCooldowns[player] = PC_REST;
    } else {
      state.fireCooldowns[player] = PC_GAP;
    }
  } else {
    spawnBullet(state, 'quicksort', 0, player);
    state.fireCooldowns[player] = QUICKSORT_COOLDOWN;
  }
}

export function update(state: GameState, ui: Ui, dt: number): void {
  for (const player of [0, 1] as const) {
    const keys = state.keysByPlayer[player];
    if (keys.has('ArrowLeft') || keys.has('KeyA')) {
      state.playerXs[player] -= PLAYER_SPEED * dt;
    }
    if (keys.has('ArrowRight') || keys.has('KeyD')) {
      state.playerXs[player] += PLAYER_SPEED * dt;
    }
    state.playerXs[player] = Math.min(BOARD_W - PLAYER_HALF_W, Math.max(PLAYER_HALF_W, state.playerXs[player]));
  }

  const era = requireEra(Math.min(state.eraIndex, ERAS.length - 1));
  updateFiring(state, era, dt, 0);
  updateFiring(state, era, dt, 1);
  if (era.weapon === 'attention') {
    applyBeamDamage(state, dt);
  }

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
    refreshOverlay(ui, state);
    return;
  }

  if (state.phase === 'boss') {
    if (!state.enemies.some((e) => e.kind === 'boss')) {
      state.phase = 'won';
      state.paused = true;
      refreshOverlay(ui, state);
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
      advanceToEra(state, ui, state.eraIndex + 1);
    } else {
      enterBossPhase(state, ui);
    }
  }
}
