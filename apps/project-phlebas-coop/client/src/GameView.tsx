import { useEffect, useRef } from 'react';
import type { Snapshot } from '@evo/project-phlebas-coop-shared';
import { mulberry32, type Rng } from '@evo/rng';
import { BOARD_H, BOARD_W } from './constants';
import { createUi, get2dContext, hideOverlay, refreshOverlay, type Ui } from './dom';
import { render, updateHud } from './render';
import { nextEra, prevEra, update } from './update';
import type { GameState, Phase } from './types';
import type { Net } from './net';

const CONTROL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'KeyP']);

function createInitialState(rng: Rng, ownKeys: Set<string>): GameState {
  return {
    rng,
    eraIndex: 0,
    eraKills: 0,
    phase: 'play',
    paused: true,
    score: 0,
    lives: 3,
    playerXs: [BOARD_W / 2 - 40, BOARD_W / 2 + 40],
    keysByPlayer: [ownKeys, new Set()],
    bullets: [],
    enemies: [],
    fireCooldowns: [0, 0],
    burstCounts: [0, 0],
    beamCharges: [0, 0],
    spawnTimer: 0.5,
    lastTs: undefined,
    nextGroupId: 0,
    speedMultiplier: 1,
    stayInEra: false,
  };
}

function buildSnapshot(state: GameState): Snapshot {
  return {
    phase: state.phase,
    paused: state.paused,
    eraIndex: state.eraIndex,
    score: state.score,
    lives: state.lives,
    playerXs: [state.playerXs[0], state.playerXs[1]],
    bullets: state.bullets,
    enemies: state.enemies,
    beamCharges: [state.beamCharges[0], state.beamCharges[1]],
  };
}

function wireDevPanel(state: GameState, ui: Ui): void {
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
  ui.eraPrev.onclick = () => prevEra(state, ui);
  ui.eraNext.onclick = () => nextEra(state, ui);
}

function runHost(ui: Ui, ctx: CanvasRenderingContext2D, net: Net, seed: number): () => void {
  const ownKeys = new Set<string>();
  const state = createInitialState(mulberry32(seed), ownKeys);
  wireDevPanel(state, ui);
  // Starts paused with the era-1 tooltip up, same as solo play — both
  // screens show it, since the guest's overlay mirrors state.paused too.
  refreshOverlay(ui, state);

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (CONTROL_KEYS.has(ev.code)) {
      ev.preventDefault();
    }
    if (ev.code === 'KeyP') {
      state.paused = !state.paused;
      if (state.paused) {
        refreshOverlay(ui, state);
      } else {
        hideOverlay(ui);
      }
      return;
    }
    ownKeys.add(ev.code);
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    ownKeys.delete(ev.code);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const unsubscribeInput = net.onInput((keys) => {
    state.keysByPlayer[1] = new Set(keys);
  });

  let raf = 0;
  const loop = (ts: number): void => {
    if (state.lastTs === undefined) {
      state.lastTs = ts;
    }
    const dt = Math.min((ts - state.lastTs) / 1000, 0.05) * state.speedMultiplier;
    state.lastTs = ts;
    if (!state.paused) {
      update(state, ui, dt);
    }
    render(ctx, state, ts);
    updateHud(ui, state);
    // No throttling: a frame's worth of bullets/enemies is tiny JSON, and
    // this is a same-process-or-nearby-deploy demo, not a production game.
    net.sendSnapshot(buildSnapshot(state));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    unsubscribeInput();
    cancelAnimationFrame(raf);
  };
}

function runGuest(ui: Ui, ctx: CanvasRenderingContext2D, net: Net): () => void {
  let latest: Snapshot | null = null;
  let previousPaused = false;
  let previousPhase: Phase = 'play';

  const ownKeys = new Set<string>();
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (CONTROL_KEYS.has(ev.code)) {
      ev.preventDefault();
    }
    if (ev.code === 'KeyP') {
      return; // pause is host-authoritative; see root CLAUDE.md note on this app
    }
    ownKeys.add(ev.code);
    net.sendInput([...ownKeys]);
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    ownKeys.delete(ev.code);
    net.sendInput([...ownKeys]);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const unsubscribeSnapshot = net.onSnapshot((payload) => {
    const changed = payload.paused !== previousPaused || payload.phase !== previousPhase;
    if (changed) {
      if (payload.paused || payload.phase !== 'play') {
        refreshOverlay(ui, payload);
      } else {
        hideOverlay(ui);
      }
    }
    previousPaused = payload.paused;
    previousPhase = payload.phase;
    latest = payload;
  });

  let raf = 0;
  const loop = (ts: number): void => {
    if (latest !== null) {
      render(ctx, latest, ts);
      updateHud(ui, latest);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    unsubscribeSnapshot();
    cancelAnimationFrame(raf);
  };
}

export function GameView({ net, seed, isHost }: { net: Net; seed: number; isHost: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (root === null) {
      return;
    }
    const ui = createUi(root);
    const ctx = get2dContext(ui.board);
    return isHost ? runHost(ui, ctx, net, seed) : runGuest(ui, ctx, net);
  }, [net, seed, isHost]);

  return (
    <div className="phlebas" ref={containerRef}>
      <header className="hud-top">
        <div className="title">Project Phlebas Co-op</div>
        <div id="status">{isHost ? 'You are the host — this tab runs the match' : 'Playing as guest'}</div>
      </header>
      <main className="layout">
        <div className="stage">
          <canvas id="board" width={BOARD_W} height={BOARD_H} />
          <div id="overlay" className="overlay">
            <div className="overlay-card">
              <h2 id="overlayTitle">Paused</h2>
              <p id="overlayWeapon" />
              <p id="overlayEnemy" />
              <div className="hint">{isHost ? 'Press P to resume' : 'Waiting on the host'}</div>
            </div>
          </div>
        </div>
        <aside className="devpanel">
          <h2>Dev controls{!isHost && ' (host only)'}</h2>
          <div className="group">
            <span className="label">Tempo</span>
            <div className="btnrow">
              <button type="button" id="speedSlow" disabled={!isHost}>
                Slow
              </button>
              <button type="button" id="speedNormal" className="active" disabled={!isHost}>
                Normal
              </button>
              <button type="button" id="speedFast" disabled={!isHost}>
                Fast
              </button>
            </div>
          </div>
          <div className="group">
            <label className="checkbox">
              <input type="checkbox" id="stayInEra" disabled={!isHost} /> Stay in era
            </label>
          </div>
          <div className="group">
            <span className="label">Era</span>
            <div className="btnrow">
              <button type="button" id="eraPrev" disabled={!isHost}>
                ◀ Prev
              </button>
              <button type="button" id="eraNext" disabled={!isHost}>
                Next ▶
              </button>
            </div>
          </div>
        </aside>
      </main>
      <footer className="hud">
        <div>
          Score <b id="score">0</b>
        </div>
        <div>
          Lives <b id="lives">3</b>
        </div>
        <div>
          Era <b id="era">—</b>
        </div>
        <div className="spacer">Arrows/A-D move your ship · Space fire{isHost ? ' · P pause' : ''}</div>
      </footer>
    </div>
  );
}
