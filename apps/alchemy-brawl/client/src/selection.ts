import { sameCard, type Card } from '@evo/brawl-shared';

// The Round 1 choice in progress: the first clicked card is the cast, the second one the card to show.
// Both React (the HUD) and the Phaser scene read it, so it lives outside either tree.
export type Selection = { cast: Card | null; show: Card | null };

const EMPTY: Selection = { cast: null, show: null };
const listeners = new Set<() => void>();
let state: Selection = EMPTY;

function set(next: Selection): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export const selection = {
  getState: (): Selection => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  pick: (card: Card): void => {
    const { cast, show } = state;
    if (cast === null) {
      set(show !== null && sameCard(show, card) ? { cast: card, show: null } : { cast: card, show });
    } else if (sameCard(cast, card)) {
      set({ cast: null, show });
    } else if (show !== null && sameCard(show, card)) {
      set({ cast, show: null });
    } else {
      set({ cast, show: card });
    }
  },
  clear: (): void => {
    if (state !== EMPTY) {
      set(EMPTY);
    }
  },
};
