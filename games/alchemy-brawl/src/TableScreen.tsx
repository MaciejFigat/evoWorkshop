import { sameCard, type BetKind, type Card, type HandView, type TableView } from '@evo/alchemy-brawl/engine';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Net, NetState } from './net';
import { RoundStrip } from './RoundStrip';
import { Rules } from './Rules';
import { selection, type Selection } from './selection';
import { PhaserTable } from './table/PhaserTable';
import { cardName, describeCombination, finalText, nameResolver, round1Text } from './text';

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

// One frame of the action cluster under the table: a status line over the buttons, a hint under them.
type Frame = { status: string; actions: ReactNode; hint: string };

function Pill({ kind, amount, onClick, disabled = false }: { kind: string; amount?: number; onClick: () => void; disabled?: boolean }) {
  const primary = kind === 'stay' || kind === 'call' || kind === 'check';
  return (
    <button
      type="button"
      className={`pill${primary ? ' primary' : ''}${kind === 'fold' ? ' quiet' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>
        {kind}
        {amount !== undefined && amount > 0 && <small>{amount}</small>}
      </span>
    </button>
  );
}

function decideFrame(net: Net, hand: HandView, picked: Selection): Frame {
  const show = picked.show;
  const stay = (): void => {
    if (show !== null) {
      net.send({ type: 'decide', decision: { kind: 'stay', show } });
      selection.clear();
    }
  };
  const skip = (): void => {
    net.send({ type: 'decide', decision: { kind: 'skip' } });
    selection.clear();
  };
  return {
    status: 'Round 1: stay or skip. Click the card you will show.',
    actions: (
      <>
        <Pill kind="stay" disabled={show === null} onClick={stay} />
        <Pill kind="skip" onClick={skip} />
      </>
    ),
    hint:
      show === null
        ? 'No chips at risk in Round 1. The shown card stays face up until the end of the hand.'
        : `Show ${cardName(show)}: ${optionFor(hand, show)}. It stays face up until the end of the hand.`,
  };
}

const FINAL_STATUS = 'Final: all your cards play. Fixed-limit betting.';

function betFrame(net: Net, table: TableView, hand: HandView): Frame {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  if (you === null || you.legalBets.length === 0) {
    const actor = hand.betting?.actor;
    return {
      status: FINAL_STATUS,
      actions: null,
      hint: actor === null || actor === undefined ? '' : `${nameOf(actor)} to act.`,
    };
  }
  const call = you.legalBets.includes('call') ? betAmount(hand, 'call') : 0;
  const rate = call > 0 ? ((call / (hand.finalPot + call)) * 100).toFixed(1) : null;
  return {
    status: `${FINAL_STATUS} Your turn.`,
    actions: you.legalBets.map((kind) => (
      <Pill key={kind} kind={kind} amount={betAmount(hand, kind)} onClick={() => net.send({ type: 'bet', kind })} />
    )),
    hint: rate === null ? '' : `Call ${call} into ${hand.finalPot}: worth it if you win more than ${rate}% of the time.`,
  };
}

function frameFor(net: Net, table: TableView, hand: HandView, picked: Selection): Frame {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  const idle = (status: string, hint = ''): Frame => ({ status, actions: null, hint });
  if (you === null) {
    return { status: 'Watching: you join from the next hand.', actions: null, hint: '' };
  }
  switch (hand.phase) {
    case 'decide':
      return you.canDecide ? decideFrame(net, hand, picked) : idle('Locked in. Waiting for the window to close.');
    case 'round1End':
      return idle(hand.round1 === null ? 'Round 1 over.' : round1Text(hand.round1, nameOf));
    case 'bet':
      return betFrame(net, table, hand);
    case 'reveal':
      return idle('Showdown.');
    case 'done':
      return idle(hand.final === null ? 'Hand over.' : finalText(hand.final, nameOf), 'Next hand in a few seconds.');
  }
}

export function TableScreen({
  net,
  table,
  receivedAt,
  status,
}: {
  net: Net;
  table: TableView;
  receivedAt: number;
  status: NetState['status'];
}) {
  const picked = useSyncExternalStore(selection.subscribe, selection.getState);
  const [showRules, setShowRules] = useState(false);
  const hand = table.hand;
  const canDecide = hand?.you?.canDecide === true;

  useEffect(() => {
    if (!canDecide) {
      selection.clear();
    }
  }, [canDecide, table.handNo]);

  const frame: Frame =
    hand === null
      ? { status: 'Waiting for the hand to start.', actions: null, hint: '' }
      : frameFor(net, table, hand, picked);

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

        <footer className="hud">
          <div className={`hud-actions${frame.actions === null ? ' no-actions' : ''}`}>
            <span className="hud-status" title={frame.status}>
              {frame.status}
            </span>
            <div className="hud-buttons">{frame.actions}</div>
            <p className="hud-hint" title={frame.hint}>
              {frame.hint}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
