import type { HandEvent, HandView, RoundResult, TableView } from '@evo/brawl-shared';
import * as Phaser from 'phaser';
import type { Net } from '../net';
import {
  BURN,
  ELEMENT_COLOR,
  GOLD,
  HEIGHT,
  LINE,
  MUTED,
  PANEL,
  WIDTH,
  drawCard,
  text,
  type CardFace,
} from './draw';

type Point = { x: number; y: number };

const SEAT_W = 184;
const SEAT_H = 110;
const SLOT_W = 36;
const SLOT_H = 50;
const HAND_W = 72;
const HAND_H = 102;
const ARC = { x: WIDTH / 2, y: 300, rx: 390, ry: 220, from: 195, to: 345 };
const MY_SEAT = { x: WIDTH / 2, y: 392 };
const HAND_Y = 528;
const CATALYST = { x: WIDTH / 2 - 90, y: 206 };
const CENTER = { x: WIDTH / 2, y: 206 };
const TINT_ALPHA = 0.07;

export class TableScene extends Phaser.Scene {
  private readonly net: Net;
  private root: Phaser.GameObjects.Container | null = null;
  private seq = -1;
  private seatAt = new Map<number, Point>();
  private slots = new Map<string, Phaser.GameObjects.Container>();
  private catalyst: Phaser.GameObjects.Container | null = null;
  private tint: Phaser.GameObjects.Rectangle | null = null;
  private banner: Phaser.GameObjects.Container | null = null;

  constructor(net: Net) {
    super('table');
    this.net = net;
  }

  create(): void {
    const unsubscribe = this.net.subscribe(() => this.sync());
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
    this.sync();
  }

  private sync(): void {
    const { table, events, seq } = this.net.getState();
    if (seq === this.seq) {
      return;
    }
    this.seq = seq;
    this.draw(table);
    if (table?.hand) {
      this.play(table.hand, events);
    }
  }

  private draw(table: TableView | null): void {
    this.tweens.killAll();
    this.root?.destroy();
    this.seatAt.clear();
    this.slots.clear();
    this.catalyst = null;
    this.tint = null;
    this.banner = null;
    const root = this.add.container(0, 0);
    this.root = root;
    const hand = table?.hand;
    if (!table || !hand) {
      const names = table?.seats.map((s) => s.name).join(' · ') ?? '';
      const waiting = (table?.seats.length ?? 0) < 2 ? 'Waiting for a second player' : 'Next hand is starting';
      root.add([
        text(this, CENTER.x, CENTER.y, waiting, 24).setOrigin(0.5),
        text(this, CENTER.x, CENTER.y + 36, names, 16, MUTED).setOrigin(0.5),
      ]);
      return;
    }
    if (hand.catalyst) {
      this.tint = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, ELEMENT_COLOR[hand.catalyst.element], TINT_ALPHA);
      root.add(this.tint);
    }
    this.placeSeats(hand);
    hand.players.forEach((_, seat) => root.add(this.drawSeat(table, hand, seat)));
    root.add(this.drawCenter(table, hand));
    root.add(this.drawHand(hand));
  }

  // Your seat sits at the bottom (a spectator gets seat 0 there); the others follow clockwise on an arc.
  private placeSeats(hand: HandView): void {
    const count = hand.players.length;
    const bottom = hand.you?.seat ?? 0;
    const others = Array.from({ length: count - 1 }, (_, i) => (bottom + 1 + i) % count);
    const step = others.length > 1 ? (ARC.to - ARC.from) / (others.length - 1) : 0;
    others.forEach((seat, i) => {
      const angle = Phaser.Math.DegToRad(others.length > 1 ? ARC.from + i * step : 270);
      this.seatAt.set(seat, { x: ARC.x + ARC.rx * Math.cos(angle), y: ARC.y + ARC.ry * Math.sin(angle) });
    });
    this.seatAt.set(bottom, MY_SEAT);
  }

  private drawSeat(table: TableView, hand: HandView, seat: number): Phaser.GameObjects.Container {
    const player = hand.players[seat];
    const at = this.seatAt.get(seat) ?? CENTER;
    const container = this.add.container(at.x, at.y);
    if (!player) {
      return container;
    }
    const info = table.seats.find((s) => s.id === player.id);
    const acting = hand.betting?.actor === seat;
    const status = player.folded
      ? 'folded'
      : hand.phase === 'cast'
        ? player.castLocked
          ? 'locked'
          : 'casting'
        : acting
          ? 'to act'
          : '';
    const tags = [seat === hand.button ? 'button' : '', info?.bot ? 'bot' : '', info?.connected === false ? 'offline' : '']
      .filter(Boolean)
      .join(' · ');
    container.add([
      this.add.rectangle(0, 0, SEAT_W, SEAT_H, PANEL).setStrokeStyle(acting ? 3 : 1, acting ? GOLD : LINE),
      text(this, -SEAT_W / 2 + 8, -SEAT_H / 2 + 6, info?.name ?? player.id, 15),
      text(this, SEAT_W / 2 - 8, -SEAT_H / 2 + 6, String(player.stack), 15).setOrigin(1, 0),
      text(this, -SEAT_W / 2 + 8, -SEAT_H / 2 + 26, `sigils ${player.sigils} · in ${player.committed}`, 12, MUTED),
      text(this, -SEAT_W / 2 + 8, SEAT_H / 2 - 18, status, 12, MUTED),
      text(this, SEAT_W / 2 - 8, SEAT_H / 2 - 18, tags, 12, MUTED).setOrigin(1, 0),
    ]);
    for (let round = 1; round <= 3; round += 1) {
      const slot = drawCard(this, (round - 2) * (SLOT_W + 12), 10, SLOT_W, SLOT_H, this.slotFace(hand, seat, round));
      this.styleResult(slot, hand.results[round - 1], seat);
      this.slots.set(`${seat}:${round}`, slot);
      container.add(slot);
    }
    container.setAlpha(player.folded ? 0.45 : 1);
    return container;
  }

  private slotFace(hand: HandView, seat: number, round: number): CardFace {
    const cast = hand.players[seat]?.casts[round - 1];
    if (cast) {
      return { kind: 'face', card: cast };
    }
    if (round !== hand.round || !hand.players[seat]?.castLocked) {
      return { kind: 'empty' };
    }
    const mine = hand.you?.seat === seat ? hand.you.pendingCast : null;
    return mine ? { kind: 'face', card: mine } : { kind: 'back' };
  }

  private styleResult(slot: Phaser.GameObjects.Container, result: RoundResult | undefined, seat: number): void {
    if (!result) {
      return;
    }
    if (result.burned.includes(seat)) {
      slot.add(this.add.line(0, 0, 0, 0, SLOT_W, SLOT_H, BURN));
      slot.setAlpha(0.4);
    }
    if (result.winner === seat) {
      slot.add(this.add.rectangle(0, 0, SLOT_W + 6, SLOT_H + 6).setStrokeStyle(2, GOLD));
    }
  }

  private drawCenter(table: TableView, hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    this.catalyst = drawCard(
      this,
      CATALYST.x,
      CATALYST.y,
      56,
      80,
      hand.catalyst ? { kind: 'face', card: hand.catalyst } : { kind: 'empty' },
    );
    const final = hand.round === 3 ? ' · Final, worth 2' : '';
    container.add([
      text(this, CATALYST.x, CATALYST.y - 52, 'Catalyst', 13, MUTED).setOrigin(0.5),
      this.catalyst,
      text(this, CENTER.x - 30, CENTER.y - 36, `Hand ${table.handNo} · Round ${hand.round} of 3${final}`, 16),
      text(this, CENTER.x - 30, CENTER.y - 10, `Pot ${hand.pot}`, 26),
      text(this, CENTER.x - 30, CENTER.y + 24, `Deck ${hand.deckCount}`, 13, MUTED),
    ]);
    if (hand.outcome) {
      this.banner = this.drawOutcome(table, hand);
      container.add(this.banner);
    }
    return container;
  }

  private drawOutcome(table: TableView, hand: HandView): Phaser.GameObjects.Container {
    const outcome = hand.outcome;
    const nameOf = (seat: number): string => {
      const id = hand.players[seat]?.id;
      return table.seats.find((s) => s.id === id)?.name ?? `Seat ${seat + 1}`;
    };
    const container = this.add.container(CENTER.x, CENTER.y + 86);
    if (!outcome) {
      return container;
    }
    const won = outcome.winners.map((seat) => `${nameOf(seat)} +${outcome.payouts[seat] ?? 0}`).join(', ');
    const scores = outcome.scores
      .map((s) => `${nameOf(s.seat)} ${s.score}${s.recipes.length > 0 ? ` (${s.recipes.join(', ')})` : ''}`)
      .join(' · ');
    const stones = outcome.stones.map((s) => `Philosopher's Stone: ${nameOf(s.seat)}, four ${s.power}s`).join(' · ');
    container.add([
      this.add.rectangle(0, 0, 560, 70, PANEL, 0.92).setStrokeStyle(2, GOLD),
      text(this, 0, -22, outcome.reason === 'fold' ? `${won}, everyone else folded` : won, 20).setOrigin(0.5),
      text(this, 0, 6, scores, 13, MUTED).setOrigin(0.5),
      text(this, 0, 24, stones, 13).setOrigin(0.5),
    ]);
    return container;
  }

  private drawHand(hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const cards = hand.you?.hand ?? [];
    const canCast = hand.you?.canCast === true;
    cards.forEach((card, i) => {
      const x = WIDTH / 2 + (i - (cards.length - 1) / 2) * (HAND_W + 14);
      const view = drawCard(this, x, HAND_Y, HAND_W, HAND_H, { kind: 'face', card });
      if (canCast) {
        view.setSize(HAND_W, HAND_H).setInteractive({ useHandCursor: true });
        view.on('pointerover', () => view.setY(HAND_Y - 12));
        view.on('pointerout', () => view.setY(HAND_Y));
        view.on('pointerdown', () => this.net.send({ type: 'cast', card }));
      } else {
        view.setAlpha(0.7);
      }
      container.add(view);
    });
    return container;
  }

  private play(hand: HandView, events: HandEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'castLocked':
          this.pop(this.slots.get(`${event.seat}:${hand.round}`), 1.25);
          break;
        case 'catalyst':
          this.flip(this.catalyst, 0);
          if (this.tint) {
            this.tweens.add({ targets: this.tint, alpha: { from: 0.35, to: TINT_ALPHA }, duration: 700 });
          }
          break;
        case 'betPlaced':
          this.float(event.seat, event.amount > 0 ? `${event.kind} ${event.amount}` : event.kind, MUTED);
          break;
        case 'revealed':
          this.reveal(event.result);
          break;
        case 'handEnded':
          this.pop(this.banner ?? undefined, 0.6);
          if (event.outcome.stones.length > 0) {
            this.cameras.main.flash(500, 201, 162, 39);
          }
          break;
        case 'roundStarted':
          break;
      }
    }
  }

  // All casts flip on the same frame; collisions hit right after the flip, the winner glows last.
  private reveal(result: RoundResult): void {
    for (const { seat } of result.casts) {
      this.flip(this.slots.get(`${seat}:${result.round}`), 0);
    }
    if (result.burned.length > 0) {
      this.time.delayedCall(300, () => this.cameras.main.shake(260, 0.012));
      for (const seat of result.burned) {
        const slot = this.slots.get(`${seat}:${result.round}`);
        if (slot) {
          this.tweens.add({ targets: slot, alpha: { from: 1, to: 0.4 }, delay: 300, duration: 400 });
        }
      }
    }
    if (result.winner !== null) {
      this.pop(this.slots.get(`${result.winner}:${result.round}`), 1.4, 550);
      this.float(result.winner, `+${result.value} sigil${result.value > 1 ? 's' : ''}`, '#c9a227', 550);
    }
  }

  private flip(target: Phaser.GameObjects.Container | null | undefined, delay: number): void {
    if (target) {
      this.tweens.add({ targets: target, scaleX: { from: 0, to: 1 }, delay, duration: 260, ease: 'Back.Out' });
    }
  }

  private pop(target: Phaser.GameObjects.Container | undefined, from: number, delay = 0): void {
    if (target) {
      this.tweens.add({ targets: target, scale: { from, to: 1 }, delay, duration: 320, ease: 'Back.Out' });
    }
  }

  private float(seat: number, label: string, color: string, delay = 0): void {
    const at = this.seatAt.get(seat);
    if (!at || !this.root) {
      return;
    }
    const note = text(this, at.x, at.y - SEAT_H / 2 - 4, label, 16, color).setOrigin(0.5, 1).setAlpha(0);
    this.root.add(note);
    this.tweens.add({ targets: note, y: note.y - 28, alpha: { from: 1, to: 0 }, delay, duration: 1400 });
  }
}
