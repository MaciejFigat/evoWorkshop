import { connect, type GameSession } from '@evo/game-sdk';
import { BOARD_W } from './constants';
import { hideOverlay, refreshOverlay, ui } from './dom';
import { render, updateHud } from './render';
import { nextEra, prevEra, update } from './update';
import type { GameState } from './types';

function createInitialState(session: GameSession): GameState {
  return {
    rng: session.rng,
    emit: session.emit,
    eraIndex: 0,
    eraKills: 0,
    phase: 'play',
    paused: true,
    score: 0,
    lives: 3,
    playerX: BOARD_W / 2,
    keys: new Set(),
    bullets: [],
    enemies: [],
    fireCooldown: 0,
    burstCount: 0,
    beamCharge: 0,
    spawnTimer: 0.5,
    lastTs: undefined,
    nextGroupId: 0,
    speedMultiplier: 1,
    stayInEra: false,
  };
}

function wireDevPanel(state: GameState): void {
  const speedButtons = [
    { button: ui.speedSlow, value: 0.5 },
    { button: ui.speedNormal, value: 1 },
    { button: ui.speedFast, value: 2 },
  ];
  for (const { button, value } of speedButtons) {
    button.onclick = () => {
      state.speedMultiplier = value;
      for (const other of speedButtons) {
        other.button.classList.toggle('active', other.value === value);
      }
    };
  }
  ui.stayInEra.onchange = () => {
    state.stayInEra = ui.stayInEra.checked;
  };
  ui.eraPrev.onclick = () => prevEra(state);
  ui.eraNext.onclick = () => nextEra(state);
}

const CONTROL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'KeyP']);

function wireKeyboard(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    if (CONTROL_KEYS.has(ev.code)) {
      ev.preventDefault();
    }
    if (ev.code === 'KeyP') {
      if (state.phase === 'over' || state.phase === 'won') {
        return;
      }
      state.paused = !state.paused;
      if (state.paused) {
        refreshOverlay(state);
      } else {
        hideOverlay();
      }
      return;
    }
    state.keys.add(ev.code);
  });
  window.addEventListener('keyup', (ev) => {
    state.keys.delete(ev.code);
  });
}

function start(session: GameSession): void {
  ui.status.textContent = `seed ${session.seed}, session ${session.sessionId}`;

  const state = createInitialState(session);
  wireDevPanel(state);
  wireKeyboard(state);
  refreshOverlay(state);

  function loop(ts: number): void {
    if (state.lastTs === undefined) {
      state.lastTs = ts;
    }
    const dt = Math.min((ts - state.lastTs) / 1000, 0.05) * state.speedMultiplier;
    state.lastTs = ts;
    if (!state.paused) {
      update(state, dt);
    }
    render(state, ts);
    updateHud(state);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

connect(start);
