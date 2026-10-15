import { sameCard, type Card } from '@evo/alchemy-brawl/engine';

// The Round 1 choice in progress: the card you will show. Clicking it again clears the pick.
// Both React (the HUD) and the Phaser scene read it, so it lives outside either tree.
export type Selection = { show: Card | null };

const EMPTY: Selection = { show: null };
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
    set(state.show !== null && sameCard(state.show, card) ? EMPTY : { show: card });
  },
  clear: (): void => {
    if (state !== EMPTY) {
      set(EMPTY);
    }
  },
};
