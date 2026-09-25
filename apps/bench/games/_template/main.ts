import { connect, type GameSession } from '@evo/game-sdk';

const START_BALANCE = 1000;
const SIDES = 6;
const WIN_ON = 6;
// Total return per unit staked, in tenths (5.7x on a 6 → RTP 95%). Rounded down once, after summing.
const PAY_TENTHS = 57;

function el<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof ctor)) {
    throw new Error(`#${id} is missing or not a ${ctor.name}`);
  }
  return node;
}

const ui = {
  status: el('status', HTMLDivElement),
  outcome: el('outcome', HTMLDivElement),
  stake: el('stake', HTMLInputElement),
  play: el('play', HTMLButtonElement),
  balance: el('balance', HTMLElement),
  result: el('result', HTMLDivElement),
};

function readStake(max: number): number {
  const n = Math.floor(Number(ui.stake.value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

function payoutFor(stake: number, outcome: number): number {
  return outcome === WIN_ON ? Math.floor((stake * PAY_TENTHS) / 10) : 0;
}

function start(session: GameSession): void {
  let balance = START_BALANCE;
  let round = 0;

  ui.balance.textContent = String(balance);
  ui.status.textContent = `seed ${session.seed}, session ${session.sessionId}`;
  ui.result.textContent = '';
  ui.outcome.textContent = '?';
  ui.play.disabled = false;

  ui.play.onclick = () => {
    const stake = readStake(balance);
    if (stake === 0) {
      ui.result.textContent = 'Enter a stake.';
      return;
    }
    const outcome = session.rng.int(1, SIDES);
    const payout = payoutFor(stake, outcome);
    balance += payout - stake;
    round += 1;
    ui.outcome.textContent = String(outcome);
    ui.balance.textContent = String(balance);
    ui.result.textContent = `Round ${round}: stake ${stake}, payout ${payout}.`;
    session.emit('round', { round, seed: session.seed, outcome, stake, payout, balance });
  };
}

connect(start);
