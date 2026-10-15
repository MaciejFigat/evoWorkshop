import { DEFAULT_TABLE, type HandView } from '@evo/alchemy-brawl/engine';
import { useEffect, useState } from 'react';
import { ASSETS, TURN_BANNER } from './assets';

const TICK_MS = 100;
// The fuse is gold while it is long and reddens over its last quarter.
const EMBER_FROM = 0.25;

function phaseLength(phase: HandView['phase'] | undefined): number | null {
  switch (phase) {
    case 'decide':
      return DEFAULT_TABLE.decideTimerMs;
    case 'bet':
      return DEFAULT_TABLE.actionTimerMs;
    default:
      return null;
  }
}

function bannerLabel(hand: HandView | null): string {
  if (hand === null) {
    return 'Waiting';
  }
  if (hand.phase === 'decide' || hand.phase === 'round1End') {
    return 'Round 1';
  }
  if (hand.phase === 'reveal' || (hand.phase === 'done' && hand.final?.reason === 'showdown')) {
    return 'Showdown';
  }
  return 'Final';
}

// The round banner and the burning fuse sit above the table, outside the board.
export function RoundStrip({ hand, timeLeftMs, receivedAt }: { hand: HandView | null; timeLeftMs: number | null; receivedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const fullMs = phaseLength(hand?.phase);
  const remaining = timeLeftMs === null ? null : Math.max(0, receivedAt + timeLeftMs - now);
  const fraction = fullMs === null || remaining === null ? null : Math.min(1, remaining / fullMs);
  const heat = fraction === null || fraction >= EMBER_FROM ? 0 : 1 - fraction / EMBER_FROM;
  const ember = `color-mix(in srgb, #c9a227, #d0342c ${Math.round(heat * 100)}%)`;
  return (
    <div className="strip">
      <div className="banner" style={{ backgroundImage: `url(${ASSETS[TURN_BANNER] ?? ''})` }}>
        {bannerLabel(hand)}
      </div>
      {fraction !== null && remaining !== null && (
        <div className="fuse">
          <div className="fuse-lit" style={{ width: `${fraction * 100}%`, background: ember }} />
          <div className="fuse-spark" style={{ left: `${fraction * 100}%`, background: ember, boxShadow: `0 0 10px 3px ${ember}` }}>
            <span>{Math.ceil(remaining / 1000)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
