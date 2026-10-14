import { CardRow } from './MiniCard';
import type { HistoryEntry } from './net';

const NOTE: Record<NonNullable<HistoryEntry['note']>, string> = {
  unopposed: 'unopposed',
  rolled: 'rolled over',
  fold: 'fold',
};

// One row per settled round, newest first: the hand, the stage, who took what and the winning cards.
export function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="panel history">
      <h3>History</h3>
      {entries.length === 0 && <p className="muted">No hands finished yet.</p>}
      <ul>
        {entries.map((entry) => (
          <li key={`${entry.handNo}-${entry.stage}`}>
            <span className="hist-hand">Hand {entry.handNo}</span>
            <span className="hist-stage">{entry.stage === 'round1' ? 'R1' : 'F'}</span>
            <span className="hist-winners">
              {entry.winners.map((winner, i) => (
                <span key={`${i}-${winner.name}`} className="hist-winner">
                  {winner.name} <b>+{winner.amount}</b>
                </span>
              ))}
            </span>
            {entry.note === null ? <CardRow cards={entry.cards} size="sm" /> : <span className="hist-note">{NOTE[entry.note]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
