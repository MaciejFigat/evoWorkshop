import type { Era } from './types';

export const ERAS: readonly Era[] = [
  {
    id: 'logic',
    label: 'Era 1 — Binary Battle',
    weapon: 'relay',
    enemy: 'byte',
    weaponTooltip: 'Relay Gun: one shot, two states — on or off. Computing starts with a switch.',
    enemyTooltip: "Byte: eight bits of state. Shoot it and it shatters — zero every bit before it's actually cleared.",
    killsToAdvance: 3,
    spawnSeconds: 1.6,
    enemySpeed: 55,
  },
  {
    id: 'loops',
    label: 'Era 2 — Loops',
    weapon: 'pcbeam',
    enemy: 'loop',
    weaponTooltip: 'Program Counter Beam: fires the same short burst, over and over — a counter stepping through instructions.',
    enemyTooltip: 'Infinite Loop: cycles endlessly, only exposed once per lap.',
    killsToAdvance: 6,
    spawnSeconds: 1.3,
    enemySpeed: 0,
  },
  {
    id: 'algorithms',
    label: 'Era 3 — Algorithms',
    weapon: 'quicksort',
    enemy: 'bubble',
    weaponTooltip: 'Quicksort Cannon: every shot splits itself in two mid-flight — divide the problem, conquer the pieces.',
    enemyTooltip: 'Bubble Sort Crawler: slow, and it only ever swaps with its neighbour. Every step is telegraphed.',
    killsToAdvance: 6,
    spawnSeconds: 0.85,
    enemySpeed: 55,
  },
  {
    id: 'modern',
    label: 'Era 4 — Modern AI',
    weapon: 'attention',
    enemy: 'hallucination',
    weaponTooltip: 'Attention Beam: damage builds the longer you hold it on one target — focus is the whole mechanic.',
    enemyTooltip: 'Hallucination: some of these are not real. A decoy flickers — shoot one and it costs you a life.',
    killsToAdvance: 5,
    spawnSeconds: 1.0,
    enemySpeed: 45,
  },
];

export function requireEra(index: number): Era {
  const era = ERAS[index];
  if (era === undefined) {
    throw new Error(`no era at index ${index}`);
  }
  return era;
}
