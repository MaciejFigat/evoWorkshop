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

export type GameState = {
  rng: Rng;
  emit: (name: string, data?: unknown) => void;
  eraIndex: number;
  eraKills: number;
  phase: Phase;
  paused: boolean;
  score: number;
  lives: number;
  playerX: number;
  keys: Set<string>;
  bullets: Bullet[];
  enemies: Enemy[];
  fireCooldown: number;
  burstCount: number;
  beamCharge: number;
  spawnTimer: number;
  lastTs: number | undefined;
  nextGroupId: number;
  speedMultiplier: number;
  stayInEra: boolean;
};
