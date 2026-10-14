import { sameCard, type BetKind, type Card, type HandView, type TableView } from '@evo/alchemy-brawl/engine';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Net } from './net';
import { selection, type Selection } from './selection';
import { PhaserTable } from './table/PhaserTable';
import { cardName, describeCombination, finalText, nameResolver, round1Text } from './text';

const TICK_MS = 200;

function useSecondsLeft(timeLeftMs: number | null, receivedAt: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return timeLeftMs === null ? null : Math.max(0, Math.ceil((receivedAt + timeLeftMs - now) / 1000));
}

// Chips the action adds to your round commitment: a call matches the level, a bet or raise goes one unit above it.
function betAmount(hand: HandView, kind: BetKind): number {
  const betting = hand.betting;
  const me = hand.you === null ? undefined : hand.players[hand.you.seat];
  if (betting === null || me === undefined || kind === 'fold' || kind === 'check') {
    return 0;
  }
  const level = kind === 'call' ? betting.level : betting.level + betting.unit;
  return Math.max(0, level - me.roundCommitted);
}

function optionFor(hand: HandView, card: Card | null): string {
  if (card === null) {
    return '';
  }
  const option = hand.you?.options.find((entry) => sameCard(entry.card, card));
  return option === undefined ? '' : describeCombination(option.combination);
}

function DecideHud({ net, hand, picked }: { net: Net; hand: HandView; picked: Selection }) {
  const ready = picked.cast !== null && picked.show !== null;
  const stay = (): void => {
    if (picked.cast !== null && picked.show !== null) {
      net.send({ type: 'decide', decision: { kind: 'stay', cast: picked.cast, show: picked.show } });
      selection.clear();
    }
  };
  return (
    <>
      <p className="prompt">Round 1: stay or skip. Click one card to cast, another to show.</p>
      <p className="choice">
        Cast: {picked.cast === null ? '—' : `${cardName(picked.cast)} (${optionFor(hand, picked.cast)})`} · Show:{' '}
        {picked.show === null ? '—' : cardName(picked.show)}
      </p>
      <div className="bets">
        <button type="button" disabled={!ready} onClick={stay}>
          Stay
        </button>
        <button
          type="button"
          onClick={() => {
            net.send({ type: 'decide', decision: { kind: 'skip' } });
            selection.clear();
          }}
        >
          Skip
        </button>
      </div>
    </>
  );
}

function Options({ hand }: { hand: HandView }) {
  return (
    <ul className="options">
      {(hand.you?.options ?? []).map((entry) => (
        <li key={`${entry.card.element}-${entry.card.power}`}>
          <span>{cardName(entry.card)}</span>
          <span className="muted">{describeCombination(entry.combination)}</span>
        </li>
      ))}
    </ul>
  );
}

function BetHud({ net, table, hand }: { net: Net; table: TableView; hand: HandView }) {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  const cast = you?.pendingCast ?? null;
  const yours = cast === null ? '' : `Your cast: ${cardName(cast)} · ${optionFor(hand, cast)}`;
  if (you === null || you.legalBets.length === 0) {
    const actor = hand.betting?.actor;
    return (
      <>
        <p className="prompt">{actor === null || actor === undefined ? 'Betting' : `${nameOf(actor)} to act.`}</p>
        <p className="muted">{yours}</p>
      </>
    );
  }
  const call = you.legalBets.includes('call') ? betAmount(hand, 'call') : 0;
  const rate = call > 0 ? ((call / (hand.finalPot + call)) * 100).toFixed(1) : null;
  return (
    <>
      <p className="prompt">Your turn to bet.</p>
      <p className="muted">{yours}</p>
      <div className="bets">
        {you.legalBets.map((kind) => {
          const amount = betAmount(hand, kind);
          return (
            <button key={kind} type="button" onClick={() => net.send({ type: 'bet', kind })}>
              {kind}
              {amount > 0 ? ` ${amount}` : ''}
            </button>
          );
        })}
      </div>
      {rate !== null && (
        <p className="muted">
          Call {call} into {hand.finalPot}: worth it if you win more than {rate}% of the time.
        </p>
      )}
    </>
  );
}

function Hud({ net, table, hand, picked }: { net: Net; table: TableView; hand: HandView; picked: Selection }) {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  if (you === null) {
    return <p className="prompt">Watching: you join from the next hand.</p>;
  }
  const me = hand.players[you.seat];
  switch (hand.phase) {
    case 'decide':
      return you.canDecide ? (
        <DecideHud net={net} hand={hand} picked={picked} />
      ) : (
        <p className="prompt">Locked in. Waiting for the window to close.</p>
      );
    case 'round1End':
      return <p className="prompt">{hand.round1 === null ? 'Round 1 over.' : round1Text(hand.round1, nameOf)}</p>;
    case 'cast':
      if (me?.folded === true) {
        return <p className="prompt">You are out of this hand.</p>;
      }
      return you.canCast ? (
        <>
          <p className="prompt">Final: play a card face down. Click a card to cast it.</p>
          <Options hand={hand} />
        </>
      ) : (
        <p className="prompt">Locked in. Waiting for the others.</p>
      );
    case 'bet':
      return <BetHud net={net} table={table} hand={hand} />;
    case 'reveal':
      return <p className="prompt">Reveal…</p>;
    case 'done':
      return (
        <>
          <p className="prompt">{hand.final === null ? 'Hand over.' : finalText(hand.final, nameOf)}</p>
          <p className="muted">Next hand in a few seconds.</p>
        </>
      );
  }
}

export function TableScreen({ net, table, receivedAt }: { net: Net; table: TableView; receivedAt: number }) {
  const secondsLeft = useSecondsLeft(table.timeLeftMs, receivedAt);
  const picked = useSyncExternalStore(selection.subscribe, selection.getState);
  const hand = table.hand;
  const canDecide = hand?.you?.canDecide === true;

  useEffect(() => {
    if (!canDecide) {
      selection.clear();
    }
  }, [canDecide, table.handNo]);

  return (
    <section className="table-screen">
      <header className="table-bar">
        <span>
          Table <code>{table.code}</code> · {table.seats.length}/{table.maxPlayers} seats · hand {table.handNo}
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
        {hand === null ? (
          <p className="prompt">Waiting for the hand to start.</p>
        ) : (
          <Hud net={net} table={table} hand={hand} picked={picked} />
        )}
      </footer>
    </section>
  );
}
