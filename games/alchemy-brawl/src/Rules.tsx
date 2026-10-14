import type { Card } from '@evo/alchemy-brawl/engine';
import type { ReactNode } from 'react';
import { CardRow, MiniBack, MiniCard, type MiniSize } from './MiniCard';

const card = (element: Card['element'], power: number): Card => ({ element, power });

// One worked hand runs through the four steps: the 9 Water shown in Round 1 makes a straight with
// the table; in the Final the 10 Fire joins the two fire table cards for the best three.
const SHOWN = card('water', 9);
const ROUND1_TABLE = [card('air', 10), card('earth', 11)];
const FINAL_TABLE = [card('fire', 3), card('fire', 6), card('earth', 9)];
const FINAL_HAND = [SHOWN, card('fire', 10), card('earth', 4), card('air', 2)];

function Backs({ count, size }: { count: number; size: MiniSize }) {
  return (
    <span className="mini-row">
      {Array.from({ length: count }, (_, i) => (
        <MiniBack key={i} size={size} />
      ))}
    </span>
  );
}

function Step({ number, title, caption, children }: { number: number; title: string; caption: string; children: ReactNode }) {
  return (
    <li className="step">
      <span className="step-badge">{number}</span>
      <span className="step-title">{title}</span>
      <span className="step-diagram">{children}</span>
      <p className="step-caption">{caption}</p>
    </li>
  );
}

// The short rules card: stacked beside the name form (compact), a 2x2 grid in the overlay over the board.
export function Rules({ compact = false }: { compact?: boolean }) {
  const size: MiniSize = compact ? 'sm' : 'md';
  return (
    <div className={`rules${compact ? ' compact' : ''}`}>
      <h2>How to play</h2>
      <p className="rules-lead">A poker-family game in two rounds; the pot is paid in two stages.</p>
      <ol className="steps">
        <Step number={1} title="Deal" caption="Everyone antes 10 and gets 3 cards.">
          <Backs count={3} size={size} />
          <span className="rules-ante">10</span>
        </Step>
        <Step
          number={2}
          title="Round 1: show or skip"
          caption="To stay, turn one card face up. It plays with the two table cards for 30% of the antes and stays visible. Skip and keep everything hidden."
        >
          <span className="mini-row">
            <MiniBack size={size} />
            <MiniCard card={SHOWN} size={size} />
            <MiniBack size={size} />
          </span>
          <span className="step-arrow">→</span>
          <CardRow cards={ROUND1_TABLE} size={size} />
          <span className="step-label">straight</span>
        </Step>
        <Step
          number={3}
          title="Draw and bet"
          caption="Everyone draws to 4. Three table cards go up, then fixed-limit betting for 70% plus the bets."
        >
          <Backs count={4} size={size} />
          <span className="step-gap" />
          <CardRow cards={FINAL_TABLE} size={size} />
          <span className="rules-bets">
            <span className="rules-bet fold">Fold</span>
            <span className="rules-bet call">Call</span>
            <span className="rules-bet raise">Raise</span>
          </span>
        </Step>
        <Step number={4} title="Showdown" caption="Best three cards among your hand and the table win. Equal hands split. Nothing is ever discarded.">
          <CardRow cards={FINAL_HAND} size={size} lit={[1]} />
          <span className="step-gap" />
          <CardRow cards={FINAL_TABLE} size={size} lit={[0, 1]} />
          <span className="step-label">fire flush</span>
        </Step>
      </ol>
    </div>
  );
}
