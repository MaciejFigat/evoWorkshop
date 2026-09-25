import { connect, type GameSession } from '@evo/game-sdk';

const SIDES = 20;
const START_BALANCE = 1000;
const CHIPS = [10, 25, 50, 100, 500] as const;
// Total return per unit staked, in tenths. Rounded down once, after summing.
const PAY_TENTHS = { straight: 180, parity: 19, dc15: 30 } as const;
const ROLL_MS = 900;
const FLICKER_MS = 60;
// Faces shown while the die tumbles. A fixed sequence: the outcome is decided before the animation starts
// and the flicker must not touch the seeded RNG, or replays would diverge.
const FLICKER = [7, 14, 3, 19, 11, 2, 16, 8, 20, 5, 12, 1, 17, 9, 4, 15, 10, 6, 18, 13] as const;

type Parity = 'even' | 'odd' | '';
type Bets = {
  straight: { n: number; amount: number };
  parity: { side: Parity; amount: number };
  dc15: number;
};

function el<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof ctor)) {
    throw new Error(`#${id} is missing or not a ${ctor.name}`);
  }
  return node;
}

const ui = {
  status: el('status', HTMLDivElement),
  die: el('die', HTMLDivElement),
  dieFace: el('dieFace', HTMLSpanElement),
  result: el('result', HTMLDivElement),
  spotNumber: el('spotNumber', HTMLDivElement),
  numbers: el('numbers', HTMLDivElement),
  spotEven: el('spotEven', HTMLButtonElement),
  spotOdd: el('spotOdd', HTMLButtonElement),
  spotDc: el('spotDc', HTMLButtonElement),
  stackStraight: el('stackStraight', HTMLSpanElement),
  stackEven: el('stackEven', HTMLSpanElement),
  stackOdd: el('stackOdd', HTMLSpanElement),
  stackDc: el('stackDc', HTMLSpanElement),
  chips: el('chips', HTMLDivElement),
  undo: el('undo', HTMLButtonElement),
  clear: el('clear', HTMLButtonElement),
  balance: el('balance', HTMLElement),
  totalBet: el('totalBet', HTMLElement),
  lastWin: el('lastWin', HTMLElement),
  roll: el('roll', HTMLButtonElement),
};

function emptyBets(): Bets {
  return { straight: { n: 0, amount: 0 }, parity: { side: '', amount: 0 }, dc15: 0 };
}

function cloneBets(bets: Bets): Bets {
  return { straight: { ...bets.straight }, parity: { ...bets.parity }, dc15: bets.dc15 };
}

function stakeOf(bets: Bets): number {
  return bets.straight.amount + bets.parity.amount + bets.dc15;
}

function payoutFor(bets: Bets, roll: number): number {
  let tenths = 0;
  if (bets.straight.n === roll) {
    tenths += bets.straight.amount * PAY_TENTHS.straight;
  }
  const parity: Parity = roll % 2 === 0 ? 'even' : 'odd';
  if (bets.parity.side === parity) {
    tenths += bets.parity.amount * PAY_TENTHS.parity;
  }
  if (roll >= 15) {
    tenths += bets.dc15 * PAY_TENTHS.dc15;
  }
  return Math.floor(tenths / 10);
}

function setStack(node: HTMLElement, amount: number): void {
  node.textContent = amount > 0 ? String(amount) : '';
  node.classList.toggle('on', amount > 0);
}

function start(session: GameSession): void {
  let balance = START_BALANCE;
  let round = 0;
  let chip: number = CHIPS[0];
  let bets = emptyBets();
  let history: Bets[] = [];
  let rolling = false;

  const numberButtons: HTMLButtonElement[] = [];
  const chipButtons: HTMLButtonElement[] = [];

  ui.numbers.replaceChildren();
  for (let n = 1; n <= SIDES; n += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'num';
    button.textContent = String(n);
    button.addEventListener('click', () => place({ kind: 'straight', n }));
    numberButtons.push(button);
    ui.numbers.append(button);
  }

  ui.chips.replaceChildren();
  for (const value of CHIPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = String(value);
    button.addEventListener('click', () => {
      chip = value;
      render();
    });
    chipButtons.push(button);
    ui.chips.append(button);
  }

  ui.spotEven.onclick = () => place({ kind: 'parity', side: 'even' });
  ui.spotOdd.onclick = () => place({ kind: 'parity', side: 'odd' });
  ui.spotDc.onclick = () => place({ kind: 'dc15' });
  ui.undo.onclick = () => {
    const previous = history.pop();
    if (previous !== undefined) {
      bets = previous;
      render();
    }
  };
  ui.clear.onclick = () => {
    history.push(cloneBets(bets));
    bets = emptyBets();
    render();
  };
  ui.roll.onclick = roll;

  ui.status.textContent = `seed ${session.seed} · session ${session.sessionId.slice(0, 8)}`;
  ui.balance.textContent = String(balance);
  ui.lastWin.textContent = '0';
  render();

  type Placement = { kind: 'straight'; n: number } | { kind: 'parity'; side: 'even' | 'odd' } | { kind: 'dc15' };

  function place(placement: Placement): void {
    if (rolling || stakeOf(bets) + chip > balance) {
      ui.result.innerHTML = rolling ? '' : `Not enough balance for a <b>${chip}</b> chip.`;
      return;
    }
    history.push(cloneBets(bets));
    switch (placement.kind) {
      case 'straight':
        bets.straight = { n: placement.n, amount: bets.straight.amount + chip };
        break;
      case 'parity':
        bets.parity = { side: placement.side, amount: bets.parity.amount + chip };
        break;
      case 'dc15':
        bets.dc15 += chip;
        break;
    }
    render();
  }

  function render(): void {
    const stake = stakeOf(bets);
    numberButtons.forEach((button, index) => {
      button.classList.toggle('selected', bets.straight.amount > 0 && index + 1 === bets.straight.n);
      button.classList.remove('hit');
      button.disabled = rolling;
    });
    chipButtons.forEach((button, index) => {
      button.classList.toggle('selected', CHIPS[index] === chip);
      button.disabled = rolling;
    });
    setStack(ui.stackStraight, bets.straight.amount);
    setStack(ui.stackEven, bets.parity.side === 'even' ? bets.parity.amount : 0);
    setStack(ui.stackOdd, bets.parity.side === 'odd' ? bets.parity.amount : 0);
    setStack(ui.stackDc, bets.dc15);
    ui.spotNumber.classList.toggle('has-bet', bets.straight.amount > 0);
    ui.spotEven.classList.toggle('has-bet', bets.parity.side === 'even' && bets.parity.amount > 0);
    ui.spotOdd.classList.toggle('has-bet', bets.parity.side === 'odd' && bets.parity.amount > 0);
    ui.spotDc.classList.toggle('has-bet', bets.dc15 > 0);
    for (const spot of [ui.spotNumber, ui.spotEven, ui.spotOdd, ui.spotDc]) {
      spot.classList.remove('won');
    }
    ui.spotEven.disabled = rolling;
    ui.spotOdd.disabled = rolling;
    ui.spotDc.disabled = rolling;
    ui.undo.disabled = rolling || history.length === 0;
    ui.clear.disabled = rolling || stake === 0;
    ui.roll.disabled = rolling || stake === 0;
    ui.totalBet.textContent = String(stake);
  }

  function roll(): void {
    const stake = stakeOf(bets);
    if (rolling || stake === 0 || stake > balance) {
      return;
    }
    // The outcome is fixed here, before a single frame of animation: the client only plays it back.
    const value = session.rng.int(1, SIDES);
    const payout = payoutFor(bets, value);
    const placed = cloneBets(bets);
    balance += payout - stake;
    round += 1;
    session.emit('round', { round, seed: session.seed, roll: value, bets: placed, stake, payout, balance });

    rolling = true;
    history = [];
    render();
    ui.result.textContent = '';
    ui.die.className = 'die rolling';

    let frame = 0;
    const flicker = window.setInterval(() => {
      ui.dieFace.textContent = String(FLICKER[frame % FLICKER.length]);
      frame += 1;
    }, FLICKER_MS);

    window.setTimeout(() => {
      window.clearInterval(flicker);
      ui.dieFace.textContent = String(value);
      ui.die.className = `die settle${value === SIDES ? ' crit' : value === 1 ? ' fumble' : ''}`;
      showOutcome(placed, value, stake, payout);
      rolling = false;
      render();
    }, ROLL_MS);
  }

  function showOutcome(placed: Bets, value: number, stake: number, payout: number): void {
    ui.balance.textContent = String(balance);
    ui.lastWin.textContent = String(payout);
    const hitButton = numberButtons[value - 1];
    if (placed.straight.n === value && hitButton !== undefined) {
      hitButton.classList.add('hit');
      ui.spotNumber.classList.add('won');
    }
    const parity: Parity = value % 2 === 0 ? 'even' : 'odd';
    if (placed.parity.side === parity && placed.parity.amount > 0) {
      (parity === 'even' ? ui.spotEven : ui.spotOdd).classList.add('won');
    }
    if (value >= 15 && placed.dc15 > 0) {
      ui.spotDc.classList.add('won');
    }
    const label = value === SIDES ? 'Critical' : value === 1 ? 'Fumble' : `Rolled <b>${value}</b>`;
    ui.result.innerHTML =
      payout > 0
        ? `Round ${round} · ${label} · <span class="win">+${payout}</span> on ${stake}`
        : `Round ${round} · ${label} · no win on ${stake}`;
  }
}

connect(start);
