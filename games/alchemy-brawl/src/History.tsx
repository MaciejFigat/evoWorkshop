import { Icon } from './Icon';
import { CardRow } from './MiniCard';
import type { HistoryEntry } from './net';

const NOTE: Record<NonNullable<HistoryEntry['note']>, string> = {
  unopposed: 'unopposed',
  rolled: 'rolled over',
  fold: 'fold',
};

type Group = { handNo: number; entries: HistoryEntry[] };

// Settled rounds grouped by hand, newest hand first; within a hand the Final sits above Round 1.
function groupByHand(entries: HistoryEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.handNo === entry.handNo) {
      last.entries.push(entry);
    } else {
      groups.push({ handNo: entry.handNo, entries: [entry] });
    }
  }
  return groups;
}

export function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="history">
      <div className="history-head">
        <Icon name="history" size={20} />
        History
      </div>
      <div className="history-body">
        {entries.length === 0 && <p className="muted">No hands finished yet.</p>}
        {groupByHand(entries).map((group) => (
          <div key={group.handNo} className="hist-group">
            <span className="hist-hand">Hand {group.handNo}</span>
            {group.entries.map((entry) => (
              <div key={entry.stage} className="hist-row">
                <span className={`hist-stage ${entry.stage}`}>{entry.stage === 'round1' ? 'R1' : 'F'}</span>
                <span className="hist-winners">
                  {entry.winners.map((winner, i) => (
                    <span key={`${i}-${winner.name}`} className="hist-winner">
                      {winner.name} <b>+{winner.amount}</b>
                    </span>
                  ))}
                </span>
                {entry.note === null ? <CardRow cards={entry.cards} size="xs" /> : <span className="hist-note">{NOTE[entry.note]}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
