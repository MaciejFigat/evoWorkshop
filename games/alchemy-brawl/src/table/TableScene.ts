import {
  sameCard,
  type Card,
  type HandEvent,
  type HandView,
  type PlayerView,
  type SeatCombination,
  type TableView,
} from '@evo/alchemy-brawl/engine';
import * as Phaser from 'phaser';
import {
  ASSETS,
  AVATAR,
  COUNT_BADGE,
  DECK_STACK,
  HOURGLASS,
  NAMEPLATE,
  SEAT_FRAME,
  TABLE,
  TIMER_FRAME,
  TURN_BANNER,
} from '../assets';
import type { Net } from '../net';
import { selection } from '../selection';
import { GOLD, GOLD_CSS, HEIGHT, LINE, MUTED, PALE, PANEL, WIDTH, cardView, text, type CardFace } from './draw';

type Point = { x: number; y: number };
type HandCard = {
  card: Card;
  view: Phaser.GameObjects.Container;
  castRing: Phaser.GameObjects.Rectangle;
  showRing: Phaser.GameObjects.Rectangle;
};

const ARC = { x: WIDTH / 2, y: 330, rx: 450, ry: 250, from: 190, to: 350 };
const MY_SEAT: Point = { x: 200, y: 600 };
const MY_CAST: Point = { x: WIDTH / 2, y: 452 };
const HAND_Y = 634;
const HAND = { w: 110, h: 154, gap: 14 };
const TABLE_CARD = { w: 100, h: 140, gap: 24 };
const TABLE_Y = 292;
const SEAT_CARD = { w: 48, h: 67 };
const MY_CAST_CARD = { w: 72, h: 101 };
const POTS: Point = { x: WIDTH / 2, y: 182 };
const BANNER: Point = { x: WIDTH / 2, y: 48 };
const TIMER: Point = { x: 1200, y: 70 };
const DECK: Point = { x: 1070, y: 606 };
const LIFT = { hover: 14, show: 22, cast: 40 };
const FLIP_MS = 260;

export class TableScene extends Phaser.Scene {
  private readonly net: Net;
  private root: Phaser.GameObjects.Container | null = null;
  private seq = -1;
  private seatAt = new Map<number, Point>();
  private seatViews = new Map<number, Phaser.GameObjects.Container>();
  private castSlots = new Map<number, Phaser.GameObjects.Container>();
  private tableCards: Phaser.GameObjects.Container[] = [];
  private handCards: HandCard[] = [];
  private timerText: Phaser.GameObjects.Text | null = null;
  private timerSeconds = -1;

  constructor(net: Net) {
    super('table');
    this.net = net;
  }

  preload(): void {
    for (const [key, url] of Object.entries(ASSETS)) {
      this.load.image(key, url);
    }
  }

  create(): void {
    const unsubscribeNet = this.net.subscribe(() => this.sync());
    const unsubscribeSelection = selection.subscribe(() => this.styleHand());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      unsubscribeNet();
      unsubscribeSelection();
    });
    this.sync();
  }

  update(): void {
    const { table, receivedAt } = this.net.getState();
    if (this.timerText === null || table === null || table.timeLeftMs === null) {
      return;
    }
    const seconds = Math.max(0, Math.ceil((receivedAt + table.timeLeftMs - Date.now()) / 1000));
    if (seconds !== this.timerSeconds) {
      this.timerSeconds = seconds;
      this.timerText.setText(String(seconds));
    }
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
    this.time.removeAllEvents();
    this.root?.destroy();
    this.seatAt.clear();
    this.seatViews.clear();
    this.castSlots.clear();
    this.tableCards = [];
    this.handCards = [];
    this.timerText = null;
    this.timerSeconds = -1;
    const root = this.add.container(0, 0);
    this.root = root;
    root.add(this.add.image(WIDTH / 2, HEIGHT / 2, TABLE).setDisplaySize(WIDTH, HEIGHT));
    const hand = table?.hand;
    if (!table || !hand) {
      const names = table?.seats.map((s) => s.name).join(' · ') ?? '';
      const seated = table?.seats.length ?? 0;
      const waiting = seated < 3 ? `Waiting for players: ${seated} of 3 needed` : 'Next hand is starting';
      root.add([
        text(this, WIDTH / 2, TABLE_Y, waiting, 26).setOrigin(0.5),
        text(this, WIDTH / 2, TABLE_Y + 40, names, 16, MUTED).setOrigin(0.5),
      ]);
      return;
    }
    this.placeSeats(hand);
    hand.players.forEach((_, seat) => root.add(this.drawSeat(table, hand, seat)));
    root.add(this.drawCenter(hand));
    root.add(this.drawBanner(hand));
    root.add(this.drawTimer(table));
    root.add(this.drawMyCast(hand));
    root.add(this.drawHand(hand));
    this.styleHand();
  }

  // Your seat sits at the bottom left; the others follow clockwise on an arc over the table.
  private placeSeats(hand: HandView): void {
    const count = hand.players.length;
    const mine = hand.you?.seat ?? null;
    const start = mine ?? -1;
    const others = Array.from({ length: mine === null ? count : count - 1 }, (_, i) => (start + 1 + i) % count);
    const step = others.length > 1 ? (ARC.to - ARC.from) / (others.length - 1) : 0;
    others.forEach((seat, i) => {
      const angle = Phaser.Math.DegToRad(others.length > 1 ? ARC.from + i * step : 270);
      this.seatAt.set(seat, { x: ARC.x + ARC.rx * Math.cos(angle), y: ARC.y + ARC.ry * Math.sin(angle) });
    });
    if (mine !== null) {
      this.seatAt.set(mine, MY_SEAT);
    }
  }

  private status(hand: HandView, seat: number, player: PlayerView): string {
    if (player.folded) {
      return 'folded';
    }
    if (hand.phase === 'decide') {
      return player.decided ? 'locked' : 'deciding';
    }
    if (hand.betting?.actor === seat) {
      return 'to act';
    }
    if (hand.phase === 'cast') {
      return player.castLocked ? 'locked' : 'casting';
    }
    if (player.stayed === true) {
      return 'stayed';
    }
    return player.stayed === false ? 'skipped' : '';
  }

  // What lies in an opponent's cast slot: nothing while the choice is secret, a back while it is
  // face down, the card once it is public.
  private seatCastFace(hand: HandView, seat: number, player: PlayerView): CardFace | null {
    switch (hand.phase) {
      case 'decide':
        return null;
      case 'round1End': {
        if (player.stayed !== true) {
          return null;
        }
        const cast = hand.round1?.casts.find((entry) => entry.seat === seat);
        return cast === undefined ? { kind: 'back' } : { kind: 'face', card: cast.card };
      }
      case 'cast':
      case 'bet':
      case 'reveal':
        return !player.folded && player.castLocked ? { kind: 'back' } : null;
      case 'done': {
        const cast = hand.final?.casts.find((entry) => entry.seat === seat);
        if (cast !== undefined) {
          return { kind: 'face', card: cast.card };
        }
        return !player.folded && player.castLocked ? { kind: 'back' } : null;
      }
    }
  }

  private winners(hand: HandView): number[] {
    if (hand.phase === 'round1End') {
      return hand.round1?.winners ?? [];
    }
    return hand.phase === 'done' ? (hand.final?.winners ?? []) : [];
  }

  private drawSeat(table: TableView, hand: HandView, seat: number): Phaser.GameObjects.Container {
    const player = hand.players[seat];
    const at = this.seatAt.get(seat) ?? MY_SEAT;
    const container = this.add.container(at.x, at.y);
    if (!player) {
      return container;
    }
    const info = table.seats.find((s) => s.id === player.id);
    const acting = hand.betting?.actor === seat;
    const tags = [this.status(hand, seat, player), info?.bot === true ? 'bot' : '', info?.connected === false ? 'offline' : '']
      .filter((tag) => tag !== '')
      .join(' · ');
    container.add([
      this.add.image(0, -26, SEAT_FRAME).setDisplaySize(78, 78),
      this.add.image(0, -26, AVATAR).setDisplaySize(58, 58),
      this.add.image(0, 28, NAMEPLATE).setDisplaySize(164, 36),
      text(this, -70, 28, info?.name ?? player.id, 13).setOrigin(0, 0.5),
      text(this, 70, 28, String(player.stack), 13, GOLD_CSS).setOrigin(1, 0.5),
      this.add.image(36, -54, COUNT_BADGE).setDisplaySize(28, 28),
      text(this, 36, -54, String(player.handCount), 12).setOrigin(0.5),
      text(this, 0, 54, tags, 12, MUTED).setOrigin(0.5),
    ]);
    if (acting) {
      container.add(this.add.circle(0, -26, 41).setStrokeStyle(3, GOLD));
    }
    if (seat === hand.button) {
      container.add([this.add.circle(-36, -54, 11, GOLD), text(this, -36, -54, 'B', 12, '#14110f').setOrigin(0.5)]);
    }
    if (hand.you?.seat !== seat) {
      container.add(this.drawSeatCards(hand, seat, player));
    }
    this.seatViews.set(seat, container);
    container.setAlpha(player.folded ? 0.45 : 1);
    return container;
  }

  private drawSeatCards(hand: HandView, seat: number, player: PlayerView): Phaser.GameObjects.Container {
    const row = this.add.container(0, 98);
    const cast = this.seatCastFace(hand, seat, player);
    const shown = player.shown;
    const castX = shown === null ? 0 : 30;
    if (shown !== null) {
      row.add(cardView(this, cast === null ? 0 : -30, 0, SEAT_CARD.w, SEAT_CARD.h, { kind: 'face', card: shown }));
    }
    if (cast !== null) {
      const slot = cardView(this, castX, 0, SEAT_CARD.w, SEAT_CARD.h, cast);
      if (this.winners(hand).includes(seat)) {
        slot.add(this.add.rectangle(0, 0, SEAT_CARD.w + 8, SEAT_CARD.h + 8).setStrokeStyle(3, GOLD));
      }
      this.castSlots.set(seat, slot);
      row.add(slot);
    }
    return row;
  }

  private drawCenter(hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const slots = hand.phase === 'decide' || hand.phase === 'round1End' ? 2 : 3;
    for (let i = 0; i < slots; i += 1) {
      const x = WIDTH / 2 + (i - (slots - 1) / 2) * (TABLE_CARD.w + TABLE_CARD.gap);
      const card = hand.table[i];
      const face: CardFace = card === undefined ? { kind: 'slot' } : { kind: 'face', card };
      const view = cardView(this, x, TABLE_Y, TABLE_CARD.w, TABLE_CARD.h, face);
      this.tableCards.push(view);
      container.add(view);
    }
    const potLines =
      hand.phase === 'done'
        ? [`Pot paid: ${hand.final?.pot ?? 0}`]
        : hand.round1Pot > 0
          ? [`Round 1 pot ${hand.round1Pot}`, `Final pot ${hand.finalPot}`]
          : [`Final pot ${hand.finalPot}`];
    container.add(this.add.rectangle(POTS.x, POTS.y, 300, 26 + potLines.length * 22, PANEL, 0.7).setStrokeStyle(1, LINE));
    potLines.forEach((line, i) => {
      container.add(text(this, POTS.x, POTS.y - ((potLines.length - 1) * 22) / 2 + i * 22, line, 18, GOLD_CSS).setOrigin(0.5));
    });
    container.add([
      this.add.image(DECK.x, DECK.y, DECK_STACK).setDisplaySize(64, 88),
      text(this, DECK.x, DECK.y + 58, `deck ${hand.deckCount}`, 12, MUTED).setOrigin(0.5),
    ]);
    return container;
  }

  private drawBanner(hand: HandView): Phaser.GameObjects.Container {
    const label =
      hand.phase === 'decide' || hand.phase === 'round1End'
        ? 'Round 1'
        : hand.phase === 'reveal' || (hand.phase === 'done' && hand.final?.reason === 'showdown')
          ? 'Showdown'
          : 'Final';
    return this.add.container(BANNER.x, BANNER.y, [
      this.add.image(0, 0, TURN_BANNER).setDisplaySize(300, 66),
      text(this, 0, 0, label, 22).setOrigin(0.5),
    ]);
  }

  private drawTimer(table: TableView): Phaser.GameObjects.Container {
    const container = this.add.container(TIMER.x, TIMER.y);
    if (table.timeLeftMs === null) {
      return container;
    }
    this.timerText = text(this, 0, 0, '', 24).setOrigin(0.5);
    container.add([
      this.add.image(0, 0, TIMER_FRAME).setDisplaySize(84, 84),
      this.add.image(-60, 0, HOURGLASS).setDisplaySize(30, 30),
      this.timerText,
    ]);
    return container;
  }

  // Your own cast lies face up in front of you; everyone else sees a back there.
  private drawMyCast(hand: HandView): Phaser.GameObjects.Container {
    const you = hand.you;
    const container = this.add.container(MY_CAST.x, MY_CAST.y);
    if (you === null) {
      return container;
    }
    const inRound1 = hand.phase === 'decide' || hand.phase === 'round1End';
    const card = inRound1 ? (you.decision?.kind === 'stay' ? you.decision.cast : null) : you.pendingCast;
    const slot = cardView(this, 0, 0, MY_CAST_CARD.w, MY_CAST_CARD.h, card === null ? { kind: 'slot' } : { kind: 'face', card });
    if (this.winners(hand).includes(you.seat)) {
      slot.add(this.add.rectangle(0, 0, MY_CAST_CARD.w + 8, MY_CAST_CARD.h + 8).setStrokeStyle(3, GOLD));
    }
    this.castSlots.set(you.seat, slot);
    container.add([text(this, 0, -MY_CAST_CARD.h / 2 - 14, 'your cast', 12, MUTED).setOrigin(0.5), slot]);
    return container;
  }

  private drawHand(hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const you = hand.you;
    if (you === null) {
      return container;
    }
    const me = hand.players[you.seat];
    const shown = you.decision?.kind === 'stay' ? you.decision.show : (me?.shown ?? null);
    const interactive = you.canDecide || you.canCast;
    you.hand.forEach((card, i) => {
      const x = WIDTH / 2 + (i - (you.hand.length - 1) / 2) * (HAND.w + HAND.gap);
      const view = cardView(this, x, HAND_Y, HAND.w, HAND.h, { kind: 'face', card });
      const castRing = this.add.rectangle(0, 0, HAND.w + 10, HAND.h + 10).setStrokeStyle(4, GOLD).setVisible(false);
      const showRing = this.add.rectangle(0, 0, HAND.w + 10, HAND.h + 10).setStrokeStyle(3, PALE).setVisible(false);
      view.add([castRing, showRing]);
      if (shown !== null && sameCard(shown, card)) {
        view.add(text(this, 0, -HAND.h / 2 - 12, 'shown', 12, MUTED).setOrigin(0.5));
      }
      const entry: HandCard = { card, view, castRing, showRing };
      if (interactive) {
        view.setInteractive({ useHandCursor: true });
        view.on('pointerover', () => {
          if (!castRing.visible && !showRing.visible) {
            view.setY(HAND_Y - LIFT.hover);
          }
        });
        view.on('pointerout', () => this.styleHand());
        view.on('pointerdown', () => {
          if (you.canDecide) {
            selection.pick(card);
          } else {
            this.net.send({ type: 'cast', card });
          }
        });
      } else {
        view.setAlpha(0.75);
      }
      this.handCards.push(entry);
      container.add(view);
    });
    return container;
  }

  private styleHand(): void {
    const picked = selection.getState();
    for (const { card, view, castRing, showRing } of this.handCards) {
      const isCast = picked.cast !== null && sameCard(picked.cast, card);
      const isShow = picked.show !== null && sameCard(picked.show, card);
      castRing.setVisible(isCast);
      showRing.setVisible(isShow);
      view.setY(HAND_Y - (isCast ? LIFT.cast : isShow ? LIFT.show : 0));
    }
  }

  private play(hand: HandView, events: HandEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'round1Started':
        case 'finalStarted':
          this.flipIn(this.tableCards, 120);
          this.flipIn(
            this.handCards.map((entry) => entry.view),
            80,
          );
          break;
        case 'decisionLocked':
          this.pop(this.seatViews.get(event.seat), 1.18);
          break;
        case 'castLocked':
          this.pop(this.seatViews.get(event.seat), 1.18);
          if (hand.you?.seat === event.seat) {
            this.pop(this.castSlots.get(event.seat), 1.3);
          }
          break;
        case 'round1Resolved':
          this.reveal(
            event.result.casts.map((entry) => entry.seat),
            event.result.winners,
            event.result.payouts,
            event.result.combinations,
          );
          if (event.result.rolledOver) {
            this.floatAt(POTS, 'rolls into the Final', MUTED, 0);
          }
          break;
        case 'betPlaced':
          this.float(event.seat, event.amount > 0 ? `${event.kind} ${event.amount}` : event.kind, MUTED, 0);
          break;
        case 'handEnded':
          this.reveal(
            event.result.casts.map((entry) => entry.seat),
            event.result.winners,
            event.result.payouts,
            event.result.combinations,
          );
          break;
      }
    }
  }

  // All casts flip on the same frame; the winners glow and collect once the flip has landed.
  private reveal(seats: number[], winners: number[], payouts: number[], combinations: SeatCombination[]): void {
    for (const seat of seats) {
      this.flip(this.castSlots.get(seat), 0);
    }
    const delay = seats.length > 0 ? FLIP_MS + 160 : 0;
    for (const seat of winners) {
      this.pop(this.castSlots.get(seat) ?? this.seatViews.get(seat), 1.35, delay);
      this.glow(seat, delay);
      this.chips(seat, payouts[seat] ?? 0, delay);
    }
    if (combinations.some((entry) => entry.combination.category === 'straightFlush')) {
      this.time.delayedCall(delay, () => this.cameras.main.flash(500, 201, 162, 39));
    }
  }

  private flipIn(targets: Phaser.GameObjects.Container[], stepMs: number): void {
    targets.forEach((target, i) => this.flip(target, i * stepMs));
  }

  private flip(target: Phaser.GameObjects.Container | undefined, delay: number): void {
    if (target) {
      target.setScale(0, 1);
      this.tweens.add({ targets: target, scaleX: 1, delay, duration: FLIP_MS, ease: 'Back.Out' });
    }
  }

  private pop(target: Phaser.GameObjects.Container | undefined, from: number, delay = 0): void {
    if (target) {
      this.time.delayedCall(delay, () => {
        target.setScale(from);
        this.tweens.add({ targets: target, scale: 1, duration: 320, ease: 'Back.Out' });
      });
    }
  }

  private glow(seat: number, delay: number): void {
    const at = this.seatAt.get(seat);
    if (!at || !this.root) {
      return;
    }
    const ring = this.add.circle(at.x, at.y - 26, 46).setStrokeStyle(4, GOLD).setAlpha(0);
    this.root.add(ring);
    this.tweens.add({ targets: ring, alpha: 1, delay, duration: 250, yoyo: true, hold: 900, onComplete: () => ring.destroy() });
  }

  private chips(seat: number, amount: number, delay: number): void {
    const at = this.seatAt.get(seat);
    if (!at || !this.root || amount <= 0) {
      return;
    }
    const note = text(this, POTS.x, POTS.y, `+${amount}`, 22, GOLD_CSS).setOrigin(0.5);
    this.root.add(note);
    this.tweens.add({
      targets: note,
      x: at.x,
      y: at.y - 70,
      delay,
      duration: 900,
      ease: 'Sine.InOut',
      onComplete: () => this.tweens.add({ targets: note, alpha: 0, duration: 600, onComplete: () => note.destroy() }),
    });
  }

  private float(seat: number, label: string, color: string, delay: number): void {
    const at = this.seatAt.get(seat);
    if (at) {
      this.floatAt({ x: at.x, y: at.y - 74 }, label, color, delay);
    }
  }

  private floatAt(at: Point, label: string, color: string, delay: number): void {
    if (!this.root) {
      return;
    }
    const note = text(this, at.x, at.y, label, 16, color).setOrigin(0.5, 1);
    this.root.add(note);
    this.tweens.add({ targets: note, y: at.y - 28, alpha: 0, delay, duration: 1400, onComplete: () => note.destroy() });
  }
}
