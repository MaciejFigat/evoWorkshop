import {
  FINAL_TABLE,
  ROUND1_TABLE,
  sameCard,
  type Card,
  type HandEvent,
  type HandView,
  type PlayerView,
  type SeatCombination,
  type TableView,
} from '@evo/alchemy-brawl/engine';
import * as Phaser from 'phaser';
import { ASSETS, AVATAR, COUNT_BADGE, DECK_STACK, NAMEPLATE, SEAT_FRAME, TABLE } from '../assets';
import type { Net } from '../net';
import { selection } from '../selection';
import { GOLD, GOLD_CSS, HEIGHT, LINE, MUTED, PANEL, WIDTH, cardView, text, type CardFace } from './draw';
import { elementalOrb, type Source } from './effects';

type Point = { x: number; y: number };
type HandCard = { card: Card; view: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Rectangle };

const ARC = { x: WIDTH / 2, y: 330, rx: 450, ry: 250, from: 190, to: 350 };
const MY_SEAT: Point = { x: 200, y: 600 };
// The dock overlaps the bottom rim of the board; the hand sits clear of it.
const HAND_Y = 612;
const HAND = { w: 110, h: 154, gap: 14 };
const TABLE_CARD = { w: 100, h: 140, gap: 24 };
const TABLE_Y = 292;
const SEAT_CARD = { w: 48, h: 67, gap: 6 };
const POTS: Point = { x: WIDTH / 2, y: 182 };
const GLOW = { quality: 10, distance: 24 };
const PULSE = { card: { from: 2, to: 8 }, ms: 900 };
const DECK: Point = { x: 1070, y: 606 };
const LIFT = { hover: 14, show: 22 };
const FLIP_MS = 260;

export class TableScene extends Phaser.Scene {
  private readonly net: Net;
  private root: Phaser.GameObjects.Container | null = null;
  private seq = -1;
  private seatAt = new Map<number, Point>();
  private seatViews = new Map<number, Phaser.GameObjects.Container>();
  // Cards that were secret until the current phase: the shown cards of the Round 1 stayers, then the
  // rest of every hand at the showdown.
  private revealed = new Map<number, Phaser.GameObjects.Container[]>();
  private tableCards: Phaser.GameObjects.Container[] = [];
  // Where every face-up card was drawn this frame, so an effect can start from the cards it is about.
  private cardAt = new Map<string, Point>();
  private handCards: HandCard[] = [];
  // Your hand as drawn last time, so the Final's draw can animate only the card that is new.
  private lastHand: Card[] = [];
  private readonly dpr: number;

  constructor(net: Net, dpr: number) {
    super('table');
    this.net = net;
    this.dpr = dpr;
  }

  // SVGs rasterise at device resolution; every image is placed with setDisplaySize in logical units.
  preload(): void {
    for (const [key, url] of Object.entries(ASSETS)) {
      this.load.svg(key, url, { scale: this.dpr });
    }
  }

  create(): void {
    this.cameras.main.setZoom(this.dpr).centerOn(WIDTH / 2, HEIGHT / 2);
    const unsubscribeNet = this.net.subscribe(() => this.sync());
    const unsubscribeSelection = selection.subscribe(() => this.styleHand());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      unsubscribeNet();
      unsubscribeSelection();
    });
    this.sync();
  }

  private sync(): void {
    const { table, events, seq } = this.net.getState();
    if (seq === this.seq) {
      return;
    }
    this.seq = seq;
    const previous = this.lastHand;
    this.draw(table);
    if (table?.hand) {
      this.play(table.hand, events, previous);
    }
    this.lastHand = table?.hand?.you?.hand ?? [];
  }

  private draw(table: TableView | null): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.root?.destroy();
    this.seatAt.clear();
    this.cardAt.clear();
    this.seatViews.clear();
    this.revealed.clear();
    this.tableCards = [];
    this.handCards = [];
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
    if (player.allIn) {
      return 'all-in';
    }
    if (player.stayed === true) {
      return 'stayed';
    }
    return player.stayed === false ? 'skipped' : '';
  }

  // The cards a seat shows at the showdown besides its shown card; empty until the hand is over.
  private seatRevealed(hand: HandView, seat: number, player: PlayerView): Card[] {
    const cards = hand.phase === 'done' ? (hand.final?.hands.find((entry) => entry.seat === seat)?.cards ?? []) : [];
    return cards.filter((card) => player.shown === null || !sameCard(card, player.shown));
  }

  private winners(hand: HandView): number[] {
    if (hand.phase === 'round1End') {
      return hand.round1?.winners ?? [];
    }
    return hand.phase === 'done' ? (hand.final?.winners ?? []) : [];
  }

  // The cards of a winning combination (three in Round 1, five in the Final), per winner, so they can be
  // highlighted wherever they lie.
  // A lone Round 1 stayer wins without a contest and has no combination to highlight.
  private winningCards(hand: HandView, seat: number): Card[] {
    if (!this.winners(hand).includes(seat)) {
      return [];
    }
    const combinations = hand.phase === 'round1End' ? hand.round1?.combinations : hand.phase === 'done' ? hand.final?.combinations : undefined;
    return combinations?.find((entry) => entry.seat === seat)?.combination.cards ?? [];
  }

  private highlight(view: Phaser.GameObjects.Container): void {
    view.add(this.add.rectangle(0, 0, view.width + 8, view.height + 8).setStrokeStyle(3, GOLD));
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

  // The shown card first, then the rest of the hand at the showdown. In the Round 1 result the shown
  // card is the secret that flips; at the showdown it is already public and the other cards flip.
  private drawSeatCards(hand: HandView, seat: number, player: PlayerView): Phaser.GameObjects.Container {
    const row = this.add.container(0, 104);
    const cards: Card[] = player.shown === null ? [] : [player.shown];
    cards.push(...this.seatRevealed(hand, seat, player));
    const winning = this.winningCards(hand, seat);
    const secret: Phaser.GameObjects.Container[] = [];
    cards.forEach((card, i) => {
      const x = (i - (cards.length - 1) / 2) * (SEAT_CARD.w + SEAT_CARD.gap);
      const view = cardView(this, x, 0, SEAT_CARD.w, SEAT_CARD.h, { kind: 'face', card });
      const seatAt = this.seatAt.get(seat);
      if (seatAt !== undefined) {
        this.cardAt.set(cardId(card), { x: seatAt.x + x, y: seatAt.y + 104 });
      }
      const isShown = player.shown !== null && sameCard(card, player.shown);
      if (isShown === (hand.phase === 'round1End')) {
        secret.push(view);
      }
      if (winning.some((entry) => sameCard(entry, card))) {
        this.highlight(view);
      }
      row.add(view);
    });
    this.revealed.set(seat, secret);
    return row;
  }

  private drawCenter(hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    // Three slots in every phase: the Round 1 pair never moves and the third slot waits for the Final.
    const slots = FINAL_TABLE;
    for (let i = 0; i < slots; i += 1) {
      const x = WIDTH / 2 + (i - (slots - 1) / 2) * (TABLE_CARD.w + TABLE_CARD.gap);
      const card = hand.table[i];
      const face: CardFace = card === undefined ? { kind: 'slot' } : { kind: 'face', card };
      const view = cardView(this, x, TABLE_Y, TABLE_CARD.w, TABLE_CARD.h, face);
      if (card !== undefined) {
        this.cardAt.set(cardId(card), { x, y: TABLE_Y });
      }
      if (card !== undefined && this.winners(hand).some((seat) => this.winningCards(hand, seat).some((c) => sameCard(c, card)))) {
        this.highlight(view);
      }
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

  // A glow around an outline-only shape: the glow filter spreads from the stroke and the shape has no
  // fill to paint over. It lives in its own container so the filter framebuffer, which is the
  // container's size padded by the glow distance, never resamples the art it surrounds.
  private halo(
    outline: Phaser.GameObjects.Shape,
    size: number,
    color: number,
    strength: number,
  ): { view: Phaser.GameObjects.Container; glow: Phaser.Filters.Glow | undefined } {
    const view = this.add.container(0, 0, [outline.setStrokeStyle(2, color)]);
    view.setSize(size + 2 * GLOW.distance, size + 2 * GLOW.distance);
    const glow = view.enableFilters().filters?.internal.addGlow(color, strength, 0, 1, false, GLOW.quality, GLOW.distance);
    return { view, glow };
  }

  // A breathing gold glow behind everything the player may click right now; draw() kills it with the tweens.
  // The outline sits just inside the card edge, under the art.
  private pulse(target: Phaser.GameObjects.Container, range: { from: number; to: number }): void {
    const outline = this.add.rectangle(0, 0, target.width - 4, target.height - 4);
    const { view, glow } = this.halo(outline, Math.max(target.width, target.height), GOLD, range.from);
    target.addAt(view, 0);
    if (glow !== undefined) {
      this.tweens.add({ targets: glow, outerStrength: range.to, duration: PULSE.ms, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  }

  private drawHand(hand: HandView): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const you = hand.you;
    if (you === null) {
      return container;
    }
    const me = hand.players[you.seat];
    const shown = you.decision?.kind === 'stay' ? you.decision.show : (me?.shown ?? null);
    const winning = this.winningCards(hand, you.seat);
    you.hand.forEach((card, i) => {
      const x = WIDTH / 2 + (i - (you.hand.length - 1) / 2) * (HAND.w + HAND.gap);
      const view = cardView(this, x, HAND_Y, HAND.w, HAND.h, { kind: 'face', card });
      this.cardAt.set(cardId(card), { x, y: HAND_Y });
      const ring = this.add.rectangle(0, 0, HAND.w + 10, HAND.h + 10).setStrokeStyle(4, GOLD).setVisible(false);
      view.add(ring);
      if (shown !== null && sameCard(shown, card)) {
        view.add(text(this, 0, -HAND.h / 2 - 12, 'shown', 12, MUTED).setOrigin(0.5));
      }
      if (winning.some((c) => sameCard(c, card))) {
        this.highlight(view);
      }
      const entry: HandCard = { card, view, ring };
      if (you.canDecide) {
        this.pulse(view, PULSE.card);
        view.setInteractive({ useHandCursor: true });
        view.on('pointerover', () => {
          if (!ring.visible) {
            view.setY(HAND_Y - LIFT.hover);
          }
        });
        view.on('pointerout', () => this.styleHand());
        view.on('pointerdown', () => selection.pick(card));
      } else if (hand.phase === 'decide') {
        view.setAlpha(0.75);
      }
      this.handCards.push(entry);
      container.add(view);
    });
    return container;
  }

  private styleHand(): void {
    const picked = selection.getState();
    for (const { card, view, ring } of this.handCards) {
      const isShow = picked.show !== null && sameCard(picked.show, card);
      ring.setVisible(isShow);
      view.setY(HAND_Y - (isShow ? LIFT.show : 0));
    }
  }

  // `previous` is your hand before this message: on the Final's draw only the new cards animate.
  private play(hand: HandView, events: HandEvent[], previous: Card[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'round1Started':
          this.flipIn(this.tableCards.slice(0, ROUND1_TABLE), 120);
          this.flipIn(
            this.handCards.map((entry) => entry.view),
            80,
          );
          break;
        case 'finalStarted': {
          this.flipIn(this.tableCards.slice(ROUND1_TABLE), 0);
          const drawn = this.handCards.filter((entry) => !previous.some((card) => sameCard(card, entry.card)));
          this.flipIn(
            drawn.map((entry) => entry.view),
            80,
          );
          for (const [seat, view] of this.seatViews) {
            if (seat !== hand.you?.seat && hand.players[seat]?.folded === false) {
              this.pop(view, 1.12);
            }
          }
          break;
        }
        case 'decisionLocked':
          this.pop(this.seatViews.get(event.seat), 1.18);
          break;
        case 'round1Resolved':
          this.reveal(
            event.result.stayers.filter((seat) => seat !== hand.you?.seat),
            event.result.winners,
            event.result.payouts,
            event.result.combinations,
          );
          if (event.result.rolledOver) {
            this.floatAt(POTS, 'rolls into the Final', MUTED, 0);
          }
          break;
        case 'betPlaced':
          this.float(event.seat, betLabel(event), MUTED, 0);
          break;
        case 'handEnded':
          this.reveal(
            event.result.hands.map((entry) => entry.seat).filter((seat) => seat !== hand.you?.seat),
            event.result.winners,
            event.result.payouts,
            event.result.combinations,
          );
          break;
      }
    }
  }

  // Every revealed card flips on the same frame; the winners glow and collect once the flip has landed.
  // The orb plays only for a contested win: a lone stayer has no combination.
  private reveal(seats: number[], winners: number[], payouts: number[], combinations: SeatCombination[]): void {
    for (const seat of seats) {
      for (const view of this.revealed.get(seat) ?? []) {
        this.flip(view, 0);
      }
    }
    const delay = seats.length > 0 ? FLIP_MS + 160 : 0;
    for (const seat of winners) {
      this.pop(this.seatViews.get(seat), 1.35, delay);
      this.glow(seat, delay);
      this.chips(seat, payouts[seat] ?? 0, delay);
      this.orb(seat, combinations.find((entry) => entry.seat === seat)?.combination.cards ?? [], delay);
    }
    if (combinations.some((entry) => entry.combination.category === 'straightFlush')) {
      this.time.delayedCall(delay, () => this.cameras.main.flash(500, 201, 162, 39));
    }
  }

  // The winning combination's elements stream from its cards and knot into an orb over the winner.
  private orb(seat: number, cards: Card[], delay: number): void {
    const at = this.seatAt.get(seat);
    if (!at || !this.root) {
      return;
    }
    const sources: Source[] = cards.map((card) => ({ at: this.cardAt.get(cardId(card)) ?? at, element: card.element }));
    elementalOrb(this, this.root, sources, { x: at.x, y: at.y - 26 }, delay);
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

function cardId(card: Card): string {
  return `${card.element}-${card.power}`;
}

function betLabel(event: Extract<HandEvent, { type: 'betPlaced' }>): string {
  const paid = event.amount > 0 ? ` ${event.amount}` : '';
  return event.allIn && event.amount > 0 ? `all-in${paid}` : `${event.kind}${paid}`;
}
