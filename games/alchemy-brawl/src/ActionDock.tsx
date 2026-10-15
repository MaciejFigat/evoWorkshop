import {
  DEFAULT_TABLE,
  MIN_PLAYERS,
  sameCard,
  type BetOptions,
  type Card,
  type ClientMessage,
  type HandView,
  type TableView,
} from '@evo/alchemy-brawl/engine';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Net } from './net';
import { selection } from './selection';
import { cardName, describeCombination, finalText, nameResolver, round1Text } from './text';

const TICK_MS = 100;
// The timer ring turns from ember to blood over its last seconds.
const LAST_MS = 5_000;

type Tone = 'fold' | 'neutral' | 'primary';
type Shortcuts = Record<string, () => void>;

function phaseLength(phase: HandView['phase']): number | null {
  switch (phase) {
    case 'decide':
      return DEFAULT_TABLE.decideTimerMs;
    case 'bet':
      return DEFAULT_TABLE.actionTimerMs;
    default:
      return null;
  }
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// Letters act only while nothing takes text: the chat line and the raise amount keep their keys.
// The slider is a control, not text entry, so a shortcut still fires after the thumb was dragged.
function typing(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return false;
  }
  if (active.isContentEditable || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return true;
  }
  return active instanceof HTMLInputElement && active.type !== 'range';
}

function useShortcuts(shortcuts: Shortcuts): void {
  const current = useRef(shortcuts);
  current.current = shortcuts;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || typing()) {
        return;
      }
      const handler = current.current[event.key.toLowerCase()];
      if (handler !== undefined) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// The dock grows and shrinks with its rows; the slot under the board keeps its height, so the board never moves.
function useMeasuredHeight(): { ref: (node: HTMLDivElement | null) => void; height: number | null } {
  const [height, setHeight] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null): void => {
    observer.current?.disconnect();
    observer.current = null;
    if (node !== null) {
      const measure = (): void => setHeight(node.offsetHeight);
      measure();
      observer.current = new ResizeObserver(measure);
      observer.current.observe(node);
    }
  }, []);
  return { ref, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function TurnTimer({ remainingMs, fullMs }: { remainingMs: number; fullMs: number }) {
  const fraction = Math.min(1, remainingMs / fullMs);
  const color = remainingMs <= LAST_MS ? 'var(--blood)' : 'var(--ember)';
  return <span className="dock-timer" style={{ background: `conic-gradient(${color} ${fraction * 360}deg, var(--raised) 0)` }} />;
}

// Numbers are display type; words (a card, a combination) are body text, as Cinzel has no lower case.
function Stat({ label, value, words = false }: { label: string; value: string; words?: boolean }) {
  return (
    <span className="dock-stat">
      <span className="dock-label">{label}</span>
      <span className={words ? 'dock-words' : 'dock-value'}>{value}</span>
    </span>
  );
}

function Emblem({ card }: { card: Card | undefined }) {
  return card === undefined ? null : <span className={`dock-emblem ${card.element}`} />;
}

function DockButton({
  tone,
  label,
  amount,
  keycap,
  disabled,
  onClick,
}: {
  tone: Tone;
  label: string;
  amount?: number;
  keycap: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`dock-btn ${tone}`} disabled={disabled} onClick={onClick}>
      <span className="dock-btn-text">
        {label}
        {amount !== undefined && <span className="dock-btn-amount">{amount}</span>}
      </span>
      <kbd className="dock-key">{keycap}</kbd>
    </button>
  );
}

type Preset = { label: string; to: number };

function presetsFor(bet: BetOptions, level: number, pot: number): Preset[] {
  const raise = bet.raise;
  if (raise === null) {
    return [];
  }
  const within = (to: number): number => clamp(to, raise.min, raise.max);
  return [
    { label: 'Min', to: raise.min },
    { label: '½ Pot', to: within(level + Math.round(pot / 2)) },
    { label: 'Pot', to: within(level + pot) },
    { label: 'All-in', to: raise.max },
  ];
}

function RaiseRow({
  bet,
  level,
  pot,
  raw,
  to,
  onChange,
}: {
  bet: BetOptions;
  level: number;
  pot: number;
  raw: number;
  to: number;
  onChange: (raw: number) => void;
}) {
  const raise = bet.raise;
  if (raise === null) {
    return null;
  }
  const fill = raise.max === raise.min ? 100 : ((to - raise.min) / (raise.max - raise.min)) * 100;
  return (
    <div className="dock-raise">
      <div className="dock-presets">
        {presetsFor(bet, level, pot).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`dock-preset${preset.to === to ? ' active' : ''}`}
            onClick={() => onChange(preset.to)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <input
        type="range"
        className="dock-slider"
        min={raise.min}
        max={raise.max}
        step={1}
        value={to}
        style={{ backgroundSize: `${fill}% 100%, 100% 100%` }}
        aria-label="Raise to"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className="dock-amount"
        min={raise.min}
        max={raise.max}
        step={1}
        value={raw}
        aria-label="Raise amount"
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => onChange(to)}
      />
    </div>
  );
}

// One frame of the dock: the status strip, the raise controls, the action buttons, the shortcuts behind them.
type Frame = { status: ReactNode; raise: ReactNode; actions: ReactNode; hint: string | null; shortcuts: Shortcuts };

const EMPTY: Frame = { status: null, raise: null, actions: null, hint: null, shortcuts: {} };

export function ActionDock({ net, table, seq, receivedAt }: { net: Net; table: TableView; seq: number; receivedAt: number }) {
  const picked = useSyncExternalStore(selection.subscribe, selection.getState);
  const [actedAt, setActedAt] = useState(-1);
  const [draft, setDraft] = useState<{ seq: number; raw: number } | null>(null);
  const hand = table.hand;
  const fullMs = hand === null ? null : phaseLength(hand.phase);
  const now = useNow(fullMs !== null && table.timeLeftMs !== null);
  const { ref, height } = useMeasuredHeight();

  const acted = actedAt === seq;
  const act = (message: ClientMessage): void => {
    net.send(message);
    setActedAt(seq);
    selection.clear();
  };

  const remaining = table.timeLeftMs === null ? null : Math.max(0, receivedAt + table.timeLeftMs - now);
  const timer = fullMs !== null && remaining !== null ? <TurnTimer remainingMs={remaining} fullMs={fullMs} /> : null;
  const turn = (text: string, mine: boolean): ReactNode => (
    <span className="dock-turn">
      {timer}
      <span className={mine ? 'dock-mine' : 'dock-waiting'}>{text}</span>
    </span>
  );
  const sentence = (text: string): ReactNode => <span className="dock-sentence">{text}</span>;
  const strip = (left: ReactNode, centre: ReactNode = null, right: ReactNode = null): ReactNode => (
    <>
      {left}
      {centre}
      {right}
    </>
  );

  const frame = ((): Frame => {
    if (hand === null) {
      return { ...EMPTY, status: sentence(table.seats.length < MIN_PLAYERS ? 'Waiting for players.' : 'Next hand is starting.') };
    }
    const you = hand.you;
    if (you === null) {
      return { ...EMPTY, status: <span className="dock-waiting">Watching</span> };
    }
    const nameOf = nameResolver(table, hand);
    switch (hand.phase) {
      case 'decide': {
        const show = picked.show;
        const option = show === null ? undefined : you.options.find((entry) => sameCard(entry.card, show));
        const centre = (
          <span className="dock-centre">
            <Stat label="Round 1 pot" value={String(hand.round1Pot)} />
            {you.canDecide && show !== null && (
              <Stat label="Show" words value={`${cardName(show)}${option === undefined ? '' : ` · ${describeCombination(option.combination)}`}`} />
            )}
            {you.canDecide && show === null && <span className="dock-label">Pick a card to show</span>}
          </span>
        );
        if (!you.canDecide) {
          return { ...EMPTY, status: strip(turn('Locked in · waiting for the table…', false), centre) };
        }
        const stay = (): void => {
          if (show !== null) {
            act({ type: 'decide', decision: { kind: 'stay', show } });
          }
        };
        const skip = (): void => act({ type: 'decide', decision: { kind: 'skip' } });
        return {
          ...EMPTY,
          status: strip(turn('Your turn', true), centre),
          actions: (
            <div className="dock-actions two">
              <DockButton tone="neutral" label="Skip" keycap="K" disabled={acted} onClick={skip} />
              <DockButton tone="primary" label="Stay" keycap="S" disabled={acted || show === null} onClick={stay} />
            </div>
          ),
          shortcuts: acted ? {} : { k: skip, s: stay },
        };
      }
      case 'round1End':
        return { ...EMPTY, status: sentence(hand.round1 === null ? 'Round 1 over.' : round1Text(hand.round1, nameOf)) };
      case 'bet':
      case 'reveal': {
        const bet = you.bet;
        const level = hand.betting?.level ?? 0;
        const actor = hand.betting?.actor ?? null;
        const best = you.best;
        const right = best === null ? null : (
          <span className="dock-right">
            <span className="dock-label">Best</span>
            <Emblem card={best.cards[0]} />
            <span className="dock-best">{describeCombination(best)}</span>
          </span>
        );
        const centre = (
          <span className="dock-centre">
            <Stat label="Pot" value={String(hand.finalPot)} />
            {bet !== null && bet.call > 0 && <Stat label="To call" value={String(bet.call)} />}
          </span>
        );
        if (hand.phase === 'reveal') {
          return { ...EMPTY, status: strip(<span className="dock-waiting">Showdown</span>, centre, right) };
        }
        if (bet === null) {
          const waiting = actor === null ? 'Waiting…' : `Waiting for ${nameOf(actor)}…`;
          return { ...EMPTY, status: strip(turn(waiting, false), centre, right) };
        }
        const raise = bet.raise;
        const raw = draft !== null && draft.seq === seq ? draft.raw : (raise?.min ?? 0);
        const to = raise === null ? 0 : clamp(raw, raise.min, raise.max);
        const fold = (): void => act({ type: 'bet', action: { kind: 'fold' } });
        const callOrCheck = (): void => act({ type: 'bet', action: { kind: bet.call > 0 ? 'call' : 'check' } });
        const raiseTo = (): void => {
          if (raise !== null) {
            act({ type: 'bet', action: { kind: 'raise', to } });
          }
        };
        const callLabel = bet.callAllIn ? 'All-in' : bet.call > 0 ? 'Call' : 'Check';
        return {
          status: strip(turn('Your turn', true), centre, right),
          raise:
            raise === null ? null : (
              <RaiseRow bet={bet} level={level} pot={hand.finalPot} raw={raw} to={to} onChange={(next) => setDraft({ seq, raw: next })} />
            ),
          actions: (
            <div className="dock-actions">
              <DockButton tone="fold" label="Fold" keycap="F" disabled={acted} onClick={fold} />
              <DockButton tone="neutral" label={callLabel} amount={bet.call > 0 ? bet.call : undefined} keycap="C" disabled={acted} onClick={callOrCheck} />
              <DockButton tone="primary" label="Raise" amount={raise === null ? undefined : to} keycap="R" disabled={acted || raise === null} onClick={raiseTo} />
            </div>
          ),
          hint: null,
          shortcuts: acted ? {} : { f: fold, c: callOrCheck, r: raiseTo },
        };
      }
      case 'done':
        return { ...EMPTY, status: sentence(hand.final === null ? 'Hand over.' : finalText(hand.final, nameOf)), hint: 'Next hand in a few seconds.' };
    }
  })();

  useShortcuts(frame.shortcuts);

  return (
    <div className="dock-slot">
      <div className="dock" style={{ height: height === null ? undefined : height + 2 }}>
        <div className="dock-body" ref={ref}>
          <div className="dock-status">{frame.status}</div>
          {frame.raise}
          {frame.actions}
          {frame.hint !== null && <p className="dock-hint">{frame.hint}</p>}
        </div>
      </div>
    </div>
  );
}
