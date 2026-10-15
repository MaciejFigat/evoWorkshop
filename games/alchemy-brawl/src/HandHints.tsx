import {
  compareCombinations,
  round1Combination,
  sameCard,
  type Card,
  type Category,
  type Combination,
  type HandView,
  type Phase,
} from '@evo/alchemy-brawl/engine';
import { useState } from 'react';
import { Icon } from './Icon';
import { CardRow } from './MiniCard';
import type { Selection } from './selection';
import { categoryName } from './text';

const card = (element: Card['element'], power: number): Card => ({ element, power });

type Rung = { category: Category; name: string; example: Card[] };

// Best first, as the player reads it; the engine's rank maps run the other way. The example shows
// the pattern: same element for a flush, consecutive powers for a straight.
const THREE_CARD_LADDER: Rung[] = [
  { category: 'straightFlush', name: 'Straight flush', example: [card('fire', 7), card('fire', 8), card('fire', 9)] },
  { category: 'three', name: 'Three of a kind', example: [card('fire', 5), card('water', 5), card('earth', 5)] },
  { category: 'straight', name: 'Straight', example: [card('earth', 4), card('air', 5), card('water', 6)] },
  { category: 'flush', name: 'Flush', example: [card('water', 2), card('water', 7), card('water', 11)] },
  { category: 'pair', name: 'Pair', example: [card('fire', 9), card('earth', 9), card('air', 4)] },
  { category: 'high', name: 'High card', example: [card('air', 2), card('earth', 7), card('fire', 12)] },
];

// Five-card poker for the Final (spec §5.2): a flush beats a straight here. Examples are laid out
// the way the engine orders a live combination: groups first, then kickers, high powers first.
const FIVE_CARD_LADDER: Rung[] = [
  {
    category: 'straightFlush',
    name: 'Straight flush',
    example: [card('earth', 9), card('earth', 8), card('earth', 7), card('earth', 6), card('earth', 5)],
  },
  {
    category: 'four',
    name: 'Four of a kind',
    example: [card('fire', 8), card('water', 8), card('earth', 8), card('air', 8), card('water', 3)],
  },
  {
    category: 'fullHouse',
    name: 'Full house',
    example: [card('fire', 7), card('air', 7), card('earth', 7), card('water', 4), card('fire', 4)],
  },
  {
    category: 'flush',
    name: 'Flush',
    example: [card('water', 12), card('water', 9), card('water', 7), card('water', 5), card('water', 2)],
  },
  {
    category: 'straight',
    name: 'Straight',
    example: [card('air', 10), card('fire', 9), card('earth', 8), card('water', 7), card('air', 6)],
  },
  {
    category: 'three',
    name: 'Three of a kind',
    example: [card('fire', 5), card('water', 5), card('earth', 5), card('air', 11), card('fire', 3)],
  },
  {
    category: 'twoPair',
    name: 'Two pair',
    example: [card('earth', 11), card('air', 11), card('fire', 6), card('water', 6), card('earth', 2)],
  },
  {
    category: 'pair',
    name: 'Pair',
    example: [card('fire', 9), card('earth', 9), card('air', 12), card('water', 7), card('fire', 4)],
  },
  {
    category: 'high',
    name: 'High card',
    example: [card('fire', 12), card('earth', 10), card('air', 7), card('water', 5), card('earth', 2)],
  },
];

type Round = { ladder: Rung[]; dot: 'round1' | 'final'; short: string; label: string; next: string };

// The short labels match the history's R1 / F.
const ROUND1: Round = { ladder: THREE_CARD_LADDER, dot: 'round1', short: 'R1 · 3 cards', label: 'Round 1 · 3 cards', next: 'F · 5 cards' };
const FINAL: Round = { ladder: FIVE_CARD_LADDER, dot: 'final', short: 'F · 5 cards', label: 'Final · 5 cards', next: 'showdown' };

// Round 1 ranks three cards; the Final five (spec §5.3). Without a hand the ladder shows Round 1.
function roundFor(phase: Phase | null): Round {
  switch (phase) {
    case null:
    case 'decide':
    case 'round1End':
      return ROUND1;
    case 'bet':
    case 'reveal':
    case 'done':
      return FINAL;
  }
}

function optionCombination(hand: HandView, card: Card | null): Combination | null {
  if (card === null) {
    return null;
  }
  return hand.you?.options.find((entry) => sameCard(entry.card, card))?.combination ?? null;
}

function bestOption(hand: HandView): Combination | null {
  let best: Combination | null = null;
  for (const { combination } of hand.you?.options ?? []) {
    if (best === null || compareCombinations(combination, best) > 0) {
      best = combination;
    }
  }
  return best;
}

// The rung that is live right now: in Round 1 the card you show (locked, picked, else your best
// option); after Round 1 your shown card's combination if you stayed; in the Final your best five
// cards among the hand and the table. Null when you skipped Round 1 or are not seated.
export function activeCombination(hand: HandView, picked: Selection): Combination | null {
  const you = hand.you;
  if (you === null) {
    return null;
  }
  switch (hand.phase) {
    case 'decide': {
      const decision = you.decision;
      if (decision !== null) {
        return decision.kind === 'stay' ? round1Combination(decision.show, hand.table) : null;
      }
      return optionCombination(hand, picked.show) ?? bestOption(hand);
    }
    case 'round1End': {
      const shown = hand.players[you.seat]?.shown ?? null;
      if (shown === null) {
        return null;
      }
      return hand.round1?.combinations.find((entry) => entry.seat === you.seat)?.combination ?? round1Combination(shown, hand.table);
    }
    case 'bet':
    case 'reveal':
      return you.best;
    case 'done':
      return hand.final?.combinations.find((entry) => entry.seat === you.seat)?.combination ?? you.best;
  }
}

// The capsule has one short line next to the counter and the round label, so it names the group
// ('pair of 10s') or just the category; the ladder row and the dock carry the full description.
function capsuleTitle(combination: Combination): string {
  const power = combination.key[1] ?? 0;
  switch (combination.category) {
    case 'pair':
      return `pair of ${power}s`;
    case 'three':
      return `three ${power}s`;
    case 'four':
      return `four ${power}s`;
    default:
      return categoryName(combination.category);
  }
}

type Standing = 'beats' | 'you' | 'below' | 'none';

const TAG: Record<Standing, string> = { beats: 'Beats you', you: 'You', below: 'Below', none: '' };

// A capsule with your current combination and how many rungs beat it (none: the counter is left out,
// which also keeps 'straight flush' on one line); click to unfold the ladder of the current round with
// your position on it.
export function HandHints({ phase, active }: { phase: Phase | null; active: Combination | null }) {
  const [open, setOpen] = useState(true);
  const round = roundFor(phase);
  const youAt = active === null ? -1 : round.ladder.findIndex((rung) => rung.category === active.category);
  const title = active === null ? (phase === 'decide' || phase === 'round1End' ? 'Skipped' : 'No hand') : capsuleTitle(active);
  return (
    <div className="hints">
      <button type="button" className="hints-capsule" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`hints-dot ${round.dot}`} />
        <span className="hints-title" title={title}>
          {title}
        </span>
        {youAt > 0 && <span className="hints-above">{youAt} above</span>}
        <span className="spacer" />
        <span className="hints-round">{round.short}</span>
        <span className="hints-chevron">
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} />
        </span>
      </button>
      {open && (
        <div className="hints-ladder">
          <div className="hints-head">
            <span className="hints-head-round">{round.label}</span>
            <span className="hints-head-next">next: {round.next}</span>
          </div>
          {round.ladder.map((rung, i) => {
            const standing: Standing = youAt < 0 ? 'none' : i < youAt ? 'beats' : i === youAt ? 'you' : 'below';
            return (
              <div key={rung.category} className={`rung ${standing}`}>
                <span className="rung-name">{rung.name}</span>
                <CardRow cards={standing === 'you' && active !== null ? active.cards : rung.example} size="xs" />
                <span className="rung-tag">{TAG[standing]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
