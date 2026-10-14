import type { Rng } from '@evo/rng';

export type WeaponId = 'relay' | 'pcbeam' | 'quicksort' | 'attention';
export type EnemyId = 'byte' | 'loop' | 'bubble' | 'hallucination';
export type EnemyKind = EnemyId | 'boss' | 'bit';

export type Era = {
  id: string;
  label: string;
  weapon: WeaponId;
  enemy: EnemyId;
  weaponTooltip: string;
  enemyTooltip: string;
  killsToAdvance: number;
  spawnSeconds: number;
  enemySpeed: number;
};

export type Bullet = { x: number; y: number; vx: number; vy: number; kind: WeaponId; originY: number; split: boolean };

export type Enemy = {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  r: number;
  decoy: boolean;
  angle: number;
  centerX: number;
  centerY: number;
  vulnerable: boolean;
  baseX: number;
  t: number;
  groupId: number;
  bitValue: boolean;
};

export type Phase = 'play' | 'boss' | 'won' | 'over';

// 2-tuples indexed by seat: [0] is always the host (who runs this GameState
// and the real simulation), [1] is always the guest (who only ever renders
// a received Snapshot — see net.ts / GameView.tsx).
export type PlayerPair<T> = [T, T];

// Everything render()/updateHud()/refreshOverlay() need to draw a frame.
// GameState below satisfies this structurally, so the exact same functions
// run for the host (from its live simulation) and the guest (from the
// latest Snapshot relayed over the wire) without needing two code paths.
export type RenderableState = {
  phase: Phase;
  paused: boolean;
  eraIndex: number;
  score: number;
  lives: number;
  playerXs: PlayerPair<number>;
  bullets: Bullet[];
  enemies: Enemy[];
  beamCharges: PlayerPair<number>;
};

export type GameState = RenderableState & {
  rng: Rng;
  eraKills: number;
  keysByPlayer: PlayerPair<Set<string>>;
  fireCooldowns: PlayerPair<number>;
  burstCounts: PlayerPair<number>;
  spawnTimer: number;
  lastTs: number | undefined;
  nextGroupId: number;
  speedMultiplier: number;
  stayInEra: boolean;
};
