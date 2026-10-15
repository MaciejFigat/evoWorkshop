import type { TableView } from '@evo/alchemy-brawl/engine';
import { useEffect, useState } from 'react';
import { ActionDock } from './ActionDock';
import type { Net, NetState } from './net';
import { RoundStrip } from './RoundStrip';
import { Rules } from './Rules';
import { selection } from './selection';
import { PhaserTable } from './table/PhaserTable';

export function TableScreen({
  net,
  table,
  seq,
  receivedAt,
  status,
}: {
  net: Net;
  table: TableView;
  seq: number;
  receivedAt: number;
  status: NetState['status'];
}) {
  const [showRules, setShowRules] = useState(false);
  const hand = table.hand;
  const canDecide = hand?.you?.canDecide === true;

  useEffect(() => {
    if (!canDecide) {
      selection.clear();
    }
  }, [canDecide, table.handNo]);

  return (
    <>
      <header className="topbar">
        <span className="topbar-text">
          Table <code>{table.code}</code> · {table.seats.length}/{table.maxPlayers} · hand {table.handNo}
        </span>
        <span className={`dot ${status}`} title={status} />
        <span className="spacer" />
        <button type="button" onClick={() => setShowRules((open) => !open)}>
          Rules
        </button>
        <button type="button" disabled={table.seats.length >= table.maxPlayers} onClick={() => net.send({ type: 'addBot' })}>
          Add bot
        </button>
        <button type="button" onClick={() => net.send({ type: 'leave' })}>
          Leave
        </button>
      </header>

      <div className="play">
        <RoundStrip hand={hand} timeLeftMs={table.timeLeftMs} receivedAt={receivedAt} />
        <div className="stage">
          <PhaserTable net={net} />
          {showRules && (
            <div className="overlay" onClick={() => setShowRules(false)}>
              <div className="panel" onClick={(e) => e.stopPropagation()}>
                <Rules />
                <button type="button" onClick={() => setShowRules(false)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
        <ActionDock net={net} table={table} seq={seq} receivedAt={receivedAt} />
      </div>
    </>
  );
}
