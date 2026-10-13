export type Rules = {
  ante: number;
  smallBet: number;
  bigBet: number;
  maxBetsPerRound: number;
  finalRoundValue: number;
  burnedCountsForRecipes: boolean;
};

export type TableConfig = {
  maxPlayers: number;
  buyIn: number;
  castTimerMs: number;
  actionTimerMs: number;
  rules: Rules;
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const DEFAULT_RULES: Rules = {
  ante: 1,
  smallBet: 2,
  bigBet: 4,
  maxBetsPerRound: 3,
  finalRoundValue: 2,
  burnedCountsForRecipes: true,
};

export const DEFAULT_TABLE: TableConfig = {
  maxPlayers: MAX_PLAYERS,
  buyIn: 100,
  castTimerMs: 12_000,
  actionTimerMs: 10_000,
  rules: DEFAULT_RULES,
};

// The most one player can put into a single hand: the ante plus a capped round 2 and round 3.
// Stacks are topped up to cover it before every hand, so nobody goes all-in and no side pots exist.
export function maxHandCost(rules: Rules): number {
  return rules.ante + rules.maxBetsPerRound * (rules.smallBet + rules.bigBet);
}
