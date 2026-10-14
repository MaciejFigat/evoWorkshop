export type Rules = {
  ante: number;
  // Percent of the ante pot that goes to Round 1; the rest seeds the Final pot.
  round1SharePercent: number;
  finalBet: number;
  maxBetsPerRound: number;
};

export type TableConfig = {
  maxPlayers: number;
  buyIn: number;
  decideTimerMs: number;
  castTimerMs: number;
  actionTimerMs: number;
  rules: Rules;
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 11;
export const DEFAULT_SEATS = 6;

// Ante 10 keeps the 30/70 split integer for any number of players (3 units per ante go to Round 1).
export const DEFAULT_RULES: Rules = {
  ante: 10,
  round1SharePercent: 30,
  finalBet: 30,
  maxBetsPerRound: 3,
};

export const DEFAULT_TABLE: TableConfig = {
  maxPlayers: DEFAULT_SEATS,
  buyIn: 1000,
  decideTimerMs: 20_000,
  castTimerMs: 12_000,
  actionTimerMs: 10_000,
  rules: DEFAULT_RULES,
};

// The most one player can put into a single hand: the ante plus a capped Final.
// Stacks are topped up to cover it before every hand, so nobody goes all-in and no side pots exist.
export function maxHandCost(rules: Rules): number {
  return rules.ante + rules.maxBetsPerRound * rules.finalBet;
}

// Rounded down once; the odd unit stays in the Final pot.
export function round1Pot(rules: Rules, players: number): number {
  return Math.floor((rules.ante * players * rules.round1SharePercent) / 100);
}
