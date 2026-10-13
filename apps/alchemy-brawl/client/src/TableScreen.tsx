import type { BetKind, HandView, TableView } from '@evo/brawl-shared';
import { useEffect, useState } from 'react';
import type { Net } from './net';
import { PhaserTable } from './table/PhaserTable';

const TICK_MS = 200;

function useSecondsLeft(timeLeftMs: number | null, receivedAt: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return timeLeftMs === null ? null : Math.max(0, Math.ceil((receivedAt + timeLeftMs - now) / 1000));
}

function betAmount(hand: HandView, kind: BetKind): number {
  const betting = hand.betting;
  const me = hand.you === null ? undefined : hand.players[hand.you.seat];
  if (betting === null || me === undefined) {
    return 0;
  }
  const level = kind === 'bet' || kind === 'raise' ? betting.level + betting.unit : betting.level;
  return kind === 'fold' ? 0 : level - me.roundCommitted;
}

function prompt(table: TableView, hand: HandView): string {
  const you = hand.you;
  if (you === null) {
    return 'Watching: you join from the next hand.';
  }
  if (hand.phase === 'cast') {
    return you.canCast ? 'Pick a card to cast.' : 'Locked in. Waiting for the others.';
  }
  if (hand.phase === 'bet') {
    const actor = hand.betting?.actor;
    const id = actor === null || actor === undefined ? undefined : hand.players[actor]?.id;
    return you.legalBets.length > 0 ? 'Your turn to bet.' : `${table.seats.find((s) => s.id === id)?.name ?? '…'} to act.`;
  }
  return hand.phase === 'done' ? 'Next hand in a few seconds.' : 'Reveal.';
}

export function TableScreen({ net, table, receivedAt }: { net: Net; table: TableView; receivedAt: number }) {
  const secondsLeft = useSecondsLeft(table.timeLeftMs, receivedAt);
  const hand = table.hand;
  const legal = hand?.you?.legalBets ?? [];
  const call = hand !== null && legal.includes('call') ? betAmount(hand, 'call') : 0;

  return (
    <section className="table-screen">
      <header className="table-bar">
        <span>
          Table <code>{table.code}</code> · {table.seats.length}/{table.maxPlayers} seats
        </span>
        {secondsLeft !== null && <span className="clock">{secondsLeft}s</span>}
        <span className="spacer" />
        <button
          type="button"
          disabled={table.seats.length >= table.maxPlayers}
          onClick={() => net.send({ type: 'addBot' })}
        >
          Add bot
        </button>
        <button type="button" onClick={() => net.send({ type: 'leave' })}>
          Leave
        </button>
      </header>

      <PhaserTable net={net} />

      <footer className="hud">
        <p className="prompt">{hand === null ? 'Waiting for the hand to start.' : prompt(table, hand)}</p>
        <div className="bets">
          {hand !== null &&
            legal.map((kind) => {
              const amount = betAmount(hand, kind);
              return (
                <button key={kind} type="button" onClick={() => net.send({ type: 'bet', kind })}>
                  {kind}
                  {amount > 0 ? ` ${amount}` : ''}
                </button>
              );
            })}
        </div>
        {hand !== null && call > 0 && (
          <p className="muted">
            Call {call} into {hand.pot}: worth it if you win more than {((call / (hand.pot + call)) * 100).toFixed(1)}%
            of the time.
          </p>
        )}
      </footer>
    </section>
  );
}
