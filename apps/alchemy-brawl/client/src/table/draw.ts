import type { Card, Element } from '@evo/brawl-shared';
import type * as Phaser from 'phaser';

export const WIDTH = 960;
export const HEIGHT = 600;

export const FONT = 'Georgia, serif';
export const INK = '#e8dcc4';
export const MUTED = '#9a8f7e';
export const GOLD = 0xc9a227;
export const PANEL = 0x1d1a17;
export const LINE = 0x4a4038;
export const BURN = 0xd0342c;
const FACE = 0x2a241f;
const BACK = 0x3b2f4a;

export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xe4572e,
  water: 0x3a86ff,
  earth: 0x6a994e,
  air: 0xb8b8d1,
};

const ELEMENT_LETTER: Record<Element, string> = { fire: 'F', water: 'W', earth: 'E', air: 'A' };

export type CardFace = { kind: 'face'; card: Card } | { kind: 'back' } | { kind: 'empty' };

export function text(scene: Phaser.Scene, x: number, y: number, value: string, size: number, color = INK) {
  return scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color });
}

// A wireframe card: a frame in the element colour, the power as a numeral, the element as a letter.
export function drawCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number, face: CardFace) {
  const container = scene.add.container(x, y);
  if (face.kind === 'empty') {
    container.add(scene.add.rectangle(0, 0, w, h).setStrokeStyle(1, LINE));
    return container;
  }
  if (face.kind === 'back') {
    container.add([
      scene.add.rectangle(0, 0, w, h, BACK).setStrokeStyle(1, GOLD),
      text(scene, 0, 0, '?', Math.round(h * 0.35), MUTED).setOrigin(0.5),
    ]);
    return container;
  }
  const color = ELEMENT_COLOR[face.card.element];
  container.add([
    scene.add.rectangle(0, 0, w, h, FACE).setStrokeStyle(2, color),
    text(scene, 0, 2, String(face.card.power), Math.round(h * 0.4)).setOrigin(0.5),
    text(scene, -w / 2 + 4, -h / 2 + 2, ELEMENT_LETTER[face.card.element], Math.round(h * 0.2), toCss(color)),
  ]);
  return container;
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
