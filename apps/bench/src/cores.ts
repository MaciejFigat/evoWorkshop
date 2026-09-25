export type Core = 'ladder' | 'mines' | 'pick' | 'draw' | 'cascade' | 'race' | 'board' | 'collect';

export type CoreInfo = { id: Core; label: string; hint: string; icon: string };

// Icons are 24×24 stroke paths; the tile draws them with the current colour.
export const CORES: readonly CoreInfo[] = [
  {
    id: 'ladder',
    label: 'Ladder',
    hint: 'Multiplier climbs until a hidden bust point; the player picks the exit',
    icon: 'M5 20V4M19 20V4M5 8h14M5 12h14M5 16h14',
  },
  {
    id: 'mines',
    label: 'Mines',
    hint: 'Grid with hidden mines; the player picks the density',
    icon: 'M4 4h16v16H4zM4 10.7h16M4 15.3h16M10.7 4v16M15.3 4v16M13 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
  {
    id: 'pick',
    label: 'Pick',
    hint: 'Choose one of N; every position is worth the same',
    icon: 'M8 6h8v14H8zM6 8H4v12h2M18 8h2v12h-2M12 11v4',
  },
  {
    id: 'draw',
    label: 'Draw',
    hint: 'One weighted draw per round: dice, darts, wheel',
    icon: 'M12 3l7 4v10l-7 4-7-4V7zM12 3v18M5 7l7 4 7-4M5 17l7-4 7 4',
  },
  {
    id: 'cascade',
    label: 'Cascade',
    hint: 'Physical drop; the server picks the slot, the client fits the path',
    icon: 'M12 3v3M8 9h.01M16 9h.01M12 12h.01M6 15h.01M18 15h.01M12 18h.01M4 21h16',
  },
  {
    id: 'race',
    label: 'Race',
    hint: 'Field thinned down to one winner; bet before the start',
    icon: 'M5 21V4M5 4h13l-2 4 2 4H5',
  },
  {
    id: 'board',
    label: 'Board',
    hint: 'Movement across a board; the path shapes the distribution',
    icon: 'M4 4h16v16H4zM4 12h16M12 4v16M8 8h.01M16 16h.01',
  },
  {
    id: 'collect',
    label: 'Collect',
    hint: 'Accumulate up to a threshold; progress survives a break',
    icon: 'M4 20h16M6 20v-6M10 20V9M14 20v-9M18 20V5',
  },
];
