export type Rules = {
  ante: number;
  // Percent of the ante pot that goes to Round 1; the rest seeds the Final pot.
  round1SharePercent: number;
  // The Final is no-limit: this is the smallest bet and the smallest raise increment.
  minBet: number;
};

export type TableConfig = {
  maxPlayers: number;
  buyIn: number;
  decideTimerMs: number;
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
  minBet: 30,
};

export const DEFAULT_TABLE: TableConfig = {
  maxPlayers: DEFAULT_SEATS,
  buyIn: 1000,
  decideTimerMs: 20_000,
  actionTimerMs: 10_000,
  rules: DEFAULT_RULES,
};

// A seat that cannot post the ante and one minimum bet is topped up to the buy-in before the hand.
export function rebuyBelow(rules: Rules): number {
  return rules.ante + rules.minBet;
}

// Rounded down once; the odd unit stays in the Final pot.
export function round1Pot(rules: Rules, players: number): number {
  return Math.floor((rules.ante * players * rules.round1SharePercent) / 100);
}
