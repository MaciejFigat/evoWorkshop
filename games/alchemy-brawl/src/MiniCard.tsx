import type { Card } from '@evo/alchemy-brawl/engine';

export type MiniSize = 'md' | 'sm';

// A card as a small glyph: the element is the colour, the power is the number.
export function MiniCard({ card, size = 'md', lit = false }: { card: Card; size?: MiniSize; lit?: boolean }) {
  return <span className={`mini ${card.element}${size === 'sm' ? ' sm' : ''}${lit ? ' lit' : ''}`}>{card.power}</span>;
}

export function MiniBack({ size = 'md' }: { size?: MiniSize }) {
  return <span className={`mini back${size === 'sm' ? ' sm' : ''}`} />;
}

export function CardRow({ cards, size = 'md', lit = [] }: { cards: Card[]; size?: MiniSize; lit?: number[] }) {
  return (
    <span className="mini-row">
      {cards.map((card, i) => (
        <MiniCard key={`${card.element}-${card.power}-${i}`} card={card} size={size} lit={lit.includes(i)} />
      ))}
    </span>
  );
}
