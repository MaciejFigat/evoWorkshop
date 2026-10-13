import { randomInt } from 'node:crypto';
import {
  MIN_PLAYERS,
  fullDeck,
  maxHandCost,
  startHand,
  step,
  viewFor,
  type BetKind,
  type Card,
  type HandAction,
  type HandEvent,
  type HandState,
  type LobbyTable,
  type ServerError,
  type ServerMessage,
  type StepResult,
  type TableConfig,
  type TableView,
} from '@evo/brawl-shared';
import { mulberry32, type Rng } from '@evo/rng';
import { chooseBotMove } from './bot.ts';

// Pauses that give the client time to play the Catalyst flip, the reveal and the payout.
export const START_DELAY_MS = 1_500;
export const REVEAL_DELAY_MS = 1_500;
export const ROUND_END_DELAY_MS = 3_000;
export const NEXT_HAND_DELAY_MS = 5_000;
const BOT_MIN_DELAY_MS = 600;
const BOT_EXTRA_DELAY_MS = 900;
const SEED_RANGE = 2 ** 31;

export type PlayerMove = { type: 'cast'; card: Card } | { type: 'bet'; kind: BetKind };

export type TableHooks = {
  deliver: (playerId: string, message: ServerMessage) => void;
  onSeatsChanged: () => void;
};

type Seat = {
  id: string;
  name: string;
  stack: number;
  bot: Rng | null;
  connected: boolean;
  leaving: boolean;
};

type Timer = ReturnType<typeof setTimeout>;

export class Table {
  readonly code: string;
  readonly config: TableConfig;
  private readonly hooks: TableHooks;
  private seats: Seat[] = [];
  private hand: HandState | null = null;
  private handNo = 0;
  private handSeed = 0;
  private button = -1;
  private bots = 0;
  private deadline: number | null = null;
  private timer: Timer | null = null;
  private botTimers: Timer[] = [];

  constructor(code: string, config: TableConfig, hooks: TableHooks) {
    this.code = code;
    this.config = config;
    this.hooks = hooks;
  }

  info(): LobbyTable {
    return { code: this.code, players: this.seats.filter((s) => !s.leaving).length, maxPlayers: this.config.maxPlayers };
  }

  has(id: string): boolean {
    return this.seats.some((s) => s.id === id && !s.leaving);
  }

  humanCount(): number {
    return this.seats.filter((s) => s.bot === null && !s.leaving).length;
  }

  join(id: string, name: string): ServerError | null {
    if (this.info().players >= this.config.maxPlayers) {
      return 'table_full';
    }
    this.seats.push({ id, name, stack: this.config.buyIn, bot: null, connected: true, leaving: false });
    this.broadcast([]);
    this.maybeStart();
    return null;
  }

  addBot(): ServerError | null {
    if (this.info().players >= this.config.maxPlayers) {
      return 'table_full';
    }
    this.bots += 1;
    this.seats.push({
      id: `bot-${this.bots}`,
      name: `Bot ${this.bots}`,
      stack: this.config.buyIn,
      bot: mulberry32(randomInt(SEED_RANGE)),
      connected: true,
      leaving: false,
    });
    this.broadcast([]);
    this.maybeStart();
    return null;
  }

  // A player who leaves mid-hand stays in it on timeouts and is removed before the next hand.
  leave(id: string): void {
    const inHand = this.hand !== null && this.hand.phase !== 'done' && this.hand.players.some((p) => p.id === id);
    if (inHand) {
      this.seats = this.seats.map((s) => (s.id === id ? { ...s, leaving: true, connected: false } : s));
    } else {
      this.seats = this.seats.filter((s) => s.id !== id);
    }
    this.broadcast([]);
  }

  setConnected(id: string, connected: boolean): void {
    this.seats = this.seats.map((s) => (s.id === id ? { ...s, connected } : s));
    this.broadcast([]);
  }

  act(id: string, move: PlayerMove): ServerError | null {
    const seat = this.hand?.players.findIndex((p) => p.id === id) ?? -1;
    if (this.hand === null || seat < 0) {
      return 'not_in_hand';
    }
    const result = step(this.hand, { ...move, seat });
    if (!result.ok) {
      return result.reason;
    }
    this.apply(result);
    return null;
  }

  close(): void {
    this.clearTimers();
    this.seats = [];
    this.hand = null;
  }

  private maybeStart(): void {
    const idle = this.hand === null || this.hand.phase === 'done';
    if (idle && this.timer === null && this.seats.length >= MIN_PLAYERS) {
      this.timer = setTimeout(() => this.dealNextHand(), START_DELAY_MS);
    }
  }

  private dealNextHand(): void {
    this.clearTimers();
    const before = this.seats.length;
    this.seats = this.seats.filter((s) => !s.leaving && (s.bot !== null || s.connected));
    if (this.seats.length !== before) {
      this.hooks.onSeatsChanged();
    }
    if (this.seats.length < MIN_PLAYERS || this.humanCount() === 0) {
      this.hand = null;
      this.broadcast([]);
      return;
    }
    const floor = maxHandCost(this.config.rules);
    this.seats = this.seats.map((s) => (s.stack < floor ? { ...s, stack: this.config.buyIn } : s));
    this.button = (this.button + 1) % this.seats.length;
    this.handSeed = randomInt(SEED_RANGE);
    this.handNo += 1;
    const deck = mulberry32(this.handSeed).shuffle(fullDeck());
    const result = startHand(this.config.rules, this.seats, this.button, deck);
    if (result.ok) {
      this.apply(result);
    }
  }

  private apply(result: Extract<StepResult, { ok: true }>): void {
    this.hand = result.state;
    for (const player of result.state.players) {
      this.seats = this.seats.map((s) => (s.id === player.id ? { ...s, stack: player.stack } : s));
    }
    this.schedule();
    this.broadcast(result.events);
  }

  private engineStep(action: HandAction): void {
    if (this.hand === null) {
      return;
    }
    const result = step(this.hand, action);
    if (result.ok) {
      this.apply(result);
    }
  }

  private schedule(): void {
    this.clearTimers();
    const hand = this.hand;
    if (hand === null) {
      return;
    }
    switch (hand.phase) {
      case 'cast':
        this.startClock(this.config.castTimerMs);
        break;
      case 'bet':
        this.startClock(this.config.actionTimerMs);
        break;
      case 'reveal':
        this.timer = setTimeout(() => this.engineStep({ type: 'advance' }), REVEAL_DELAY_MS);
        break;
      case 'roundEnd':
        this.timer = setTimeout(() => this.engineStep({ type: 'advance' }), ROUND_END_DELAY_MS);
        break;
      case 'done':
        this.timer = setTimeout(() => this.dealNextHand(), NEXT_HAND_DELAY_MS);
        break;
    }
    this.scheduleBots(hand);
  }

  private startClock(ms: number): void {
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this.engineStep({ type: 'timeout' }), ms);
  }

  private scheduleBots(hand: HandState): void {
    const waiting =
      hand.phase === 'cast'
        ? hand.players.filter((p) => !p.folded && p.pendingCast === null).map((p) => p.id)
        : hand.phase === 'bet' && hand.betting !== null
          ? hand.betting.toAct.slice(0, 1).flatMap((seat) => hand.players[seat]?.id ?? [])
          : [];
    for (const id of waiting) {
      const rng = this.seats.find((s) => s.id === id)?.bot;
      if (rng !== undefined && rng !== null) {
        const delay = BOT_MIN_DELAY_MS + rng.int(0, BOT_EXTRA_DELAY_MS);
        this.botTimers.push(setTimeout(() => this.botMove(id, rng), delay));
      }
    }
  }

  private botMove(id: string, rng: Rng): void {
    const hand = this.hand;
    const seat = hand?.players.findIndex((p) => p.id === id) ?? -1;
    if (hand === null || seat < 0) {
      return;
    }
    const move = chooseBotMove(viewFor(hand, seat), rng);
    if (move !== null) {
      this.engineStep({ ...move, seat });
    }
  }

  private clearTimers(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.botTimers.forEach(clearTimeout);
    this.timer = null;
    this.botTimers = [];
    this.deadline = null;
  }

  private broadcast(events: HandEvent[]): void {
    for (const seat of this.seats) {
      if (seat.bot === null && seat.connected && !seat.leaving) {
        this.hooks.deliver(seat.id, { type: 'table', view: this.viewOf(seat.id), events });
      }
    }
  }

  private viewOf(id: string): TableView {
    const hand = this.hand;
    const seat = hand === null ? -1 : hand.players.findIndex((p) => p.id === id);
    return {
      code: this.code,
      maxPlayers: this.config.maxPlayers,
      you: id,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        stack: s.stack,
        bot: s.bot !== null,
        connected: s.connected,
      })),
      handNo: this.handNo,
      handSeed: hand !== null && hand.phase === 'done' ? this.handSeed : null,
      hand: hand === null ? null : viewFor(hand, seat < 0 ? null : seat),
      timeLeftMs: this.deadline === null ? null : Math.max(0, this.deadline - Date.now()),
    };
  }
}
