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

function optionFor(hand: HandView, card: Card): string {
  const option = hand.you?.options.find((entry) => sameCard(entry.card, card));
  return option === undefined ? '' : describeCombination(option.combination);
}

// One frame of the action cluster under the table: a status line, a row of info chips, the buttons,
// a hint under them. Chips and buttons are null in frames that have none.
type Frame = { status: string; chips: ReactNode; actions: ReactNode; hint: string };

function Chip({ label, value }: { label: string; value?: string }) {
  return (
    <span className="act-chip">
      <span className="act-chip-label">{label}</span>
      {value !== undefined && <b>{value}</b>}
    </span>
  );
}

type ActionKind = BetKind | 'stay' | 'skip';

// Fold reads as a warning, raise and stay as the move the table expects, the rest stays neutral.
const TONE: Record<ActionKind, 'fold' | 'neutral' | 'gold'> = {
  fold: 'fold',
  check: 'neutral',
  call: 'neutral',
  skip: 'neutral',
  bet: 'gold',
  raise: 'gold',
  stay: 'gold',
};

// Poker-room order: fold, check or call, bet or raise.
const BET_ORDER: BetKind[] = ['fold', 'check', 'call', 'bet', 'raise'];

function Action({ kind, amount = 0, onClick, disabled = false }: { kind: ActionKind; amount?: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`act act-${TONE[kind]}`} disabled={disabled} onClick={onClick}>
      <span>
        {kind}
        {amount > 0 && <small>{amount}</small>}
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
    status: 'Round 1: stay or skip. Your turn.',
    chips: (
      <>
        <Chip label="Round 1 pot" value={String(hand.round1Pot)} />
        {show === null ? <Chip label="Pick a card to show" /> : <Chip label="Show" value={`${cardName(show)} · ${optionFor(hand, show)}`} />}
      </>
    ),
    actions: (
      <>
        <Action kind="skip" onClick={skip} />
        <Action kind="stay" disabled={show === null} onClick={stay} />
      </>
    ),
    hint: 'No chips at risk in Round 1. The shown card stays face up until the end of the hand.',
  };
}

function betFrame(net: Net, table: TableView, hand: HandView): Frame {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  const yourTurn = you !== null && you.legalBets.length > 0;
  const call = yourTurn && you.legalBets.includes('call') ? betAmount(hand, 'call') : 0;
  const rate = call > 0 ? ((call / (hand.finalPot + call)) * 100).toFixed(1) : null;
  const actor = hand.betting?.actor;
  const chips = (
    <>
      <Chip label="Pot" value={String(hand.finalPot)} />
      {call > 0 && <Chip label="To call" value={String(call)} />}
      {you !== null && you.best !== null && <Chip label="Best" value={describeCombination(you.best)} />}
    </>
  );
  if (you === null || !yourTurn) {
    return { status: actor === null || actor === undefined ? 'Final: fixed-limit betting.' : `${nameOf(actor)} to act.`, chips, actions: null, hint: '' };
  }
  const legal = BET_ORDER.filter((kind) => you.legalBets.includes(kind));
  return {
    status: 'Your turn.',
    chips,
    actions: legal.map((kind) => <Action key={kind} kind={kind} amount={betAmount(hand, kind)} onClick={() => net.send({ type: 'bet', kind })} />),
    hint: rate === null ? '' : `Call ${call} into ${hand.finalPot}: worth it if you win more than ${rate}% of the time.`,
  };
}

function frameFor(net: Net, table: TableView, hand: HandView, picked: Selection): Frame {
  const you = hand.you;
  const nameOf = nameResolver(table, hand);
  const idle = (status: string, hint = ''): Frame => ({ status, chips: null, actions: null, hint });
  if (you === null) {
    return idle('Watching: you join from the next hand.');
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
      ? { status: 'Waiting for the hand to start.', chips: null, actions: null, hint: '' }
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
            {frame.chips !== null && <div className="act-chips">{frame.chips}</div>}
            {frame.actions !== null && <div className="hud-buttons">{frame.actions}</div>}
            <p className="hud-hint" title={frame.hint}>
              {frame.hint}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
