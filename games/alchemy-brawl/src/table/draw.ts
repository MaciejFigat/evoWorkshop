import type { Card } from '@evo/alchemy-brawl/engine';
import type * as Phaser from 'phaser';
import { CARD_BACK, CARD_SLOT, cardKey } from '../assets';

export const WIDTH = 1280;
export const HEIGHT = 720;

export const FONT = 'Georgia, serif';
export const INK = '#e8dcc4';
export const MUTED = '#9a8f7e';
export const GOLD_CSS = '#c9a227';
export const GOLD = 0xc9a227;
export const PANEL = 0x1d1a17;
export const LINE = 0x4a4038;
export const PALE = 0xe8dcc4;

export type CardFace = { kind: 'face'; card: Card } | { kind: 'back' } | { kind: 'slot' };

export function text(scene: Phaser.Scene, x: number, y: number, value: string, size: number, color = INK) {
  return scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color });
}

function textureFor(face: CardFace): string {
  switch (face.kind) {
    case 'face':
      return cardKey(face.card);
    case 'back':
      return CARD_BACK;
    case 'slot':
      return CARD_SLOT;
  }
}

// All card art is 180x252; a slot background sits under a face so an empty slot and a dealt one line up.
export function cardView(scene: Phaser.Scene, x: number, y: number, w: number, h: number, face: CardFace) {
  const container = scene.add.container(x, y);
  if (face.kind !== 'slot') {
    container.add(scene.add.image(0, 0, CARD_SLOT).setDisplaySize(w, h).setAlpha(0.6));
  }
  container.add(scene.add.image(0, 0, textureFor(face)).setDisplaySize(w, h));
  container.setSize(w, h);
  return container;
}
