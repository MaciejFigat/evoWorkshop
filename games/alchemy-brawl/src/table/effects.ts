import type { Element } from '@evo/alchemy-brawl/engine';
import * as Phaser from 'phaser';

export type Point = { x: number; y: number };
export type Source = { at: Point; element: Element };

export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xe4572e,
  water: 0x3a86ff,
  earth: 0x6a994e,
  air: 0xd9d3b6,
};

// The orb is about the size of a seat avatar.
const ORB_RADIUS = 40;
const STREAM = { particles: 14, spacingMs: 36, travelMs: 720, radius: 4, twist: 2.5, amplitude: 46 };
const ORB = { formMs: 360, holdMs: 1000, burstMs: 520, spinMs: 1400 };
const GLOW = { quality: 8, distance: 32 };
const SPARKS = 12;

function lighten(color: number, amount: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red + (255 - c.red) * amount),
    Math.round(c.green + (255 - c.green) * amount),
    Math.round(c.blue + (255 - c.blue) * amount),
  );
}

// Motes of each card's element spiral into one point: the streams twist around the straight line so
// they read as braiding together before they merge.
function stream(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, source: Source, target: Point, delay: number, phase: number): void {
  const dx = target.x - source.at.x;
  const dy = target.y - source.at.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  for (let i = 0; i < STREAM.particles; i += 1) {
    const mote = scene.add.circle(source.at.x, source.at.y, STREAM.radius, ELEMENT_COLOR[source.element]).setAlpha(0);
    layer.add(mote);
    const progress = { t: 0 };
    scene.tweens.add({
      targets: progress,
      t: 1,
      delay: delay + i * STREAM.spacingMs,
      duration: STREAM.travelMs,
      ease: 'Sine.In',
      onStart: () => mote.setAlpha(0.95),
      onUpdate: () => {
        const t = progress.t;
        const swing = Math.sin(t * Math.PI * STREAM.twist + phase) * STREAM.amplitude * (1 - t);
        mote.setPosition(source.at.x + dx * t + nx * swing, source.at.y + dy * t + ny * swing);
        mote.setScale(1 - 0.5 * t);
      },
      onComplete: () => mote.destroy(),
    });
  }
}

function singleOrb(scene: Phaser.Scene, element: Element): Phaser.GameObjects.Container {
  const color = ELEMENT_COLOR[element];
  const orb = scene.add.container(0, 0);
  const tongues = scene.add.container(0, 0);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    tongues.add(scene.add.ellipse(Math.cos(angle) * 28, Math.sin(angle) * 28, 22, 40, color, 0.85).setRotation(angle + Math.PI / 2));
  }
  orb.add([
    tongues,
    scene.add.circle(0, 0, ORB_RADIUS, color, 0.95),
    scene.add.circle(0, 0, ORB_RADIUS * 0.58, lighten(color, 0.45), 0.95),
    scene.add.circle(0, 0, ORB_RADIUS * 0.26, lighten(color, 0.85), 1),
  ]);
  scene.tweens.add({ targets: tongues, angle: 360, duration: ORB.spinMs, repeat: -1 });
  return orb;
}

// Several elements: coloured wedges spin one way while motes of each element orbit the other way inside.
function mixedOrb(scene: Phaser.Scene, elements: Element[]): Phaser.GameObjects.Container {
  const orb = scene.add.container(0, 0);
  const wedges = scene.add.graphics();
  const step = (Math.PI * 2) / elements.length;
  elements.forEach((element, i) => {
    wedges.fillStyle(ELEMENT_COLOR[element], 0.9);
    wedges.slice(0, 0, ORB_RADIUS, i * step, (i + 1) * step, false);
    wedges.fillPath();
  });
  const orbit = scene.add.container(0, 0);
  elements.forEach((element, i) => {
    for (let k = 0; k < 3; k += 1) {
      const angle = i * step + (k / 3) * Math.PI * 2;
      const radius = 14 + k * 7;
      orbit.add(scene.add.circle(Math.cos(angle) * radius, Math.sin(angle) * radius, 5, lighten(ELEMENT_COLOR[element], 0.5), 0.95));
    }
  });
  orb.add([wedges, scene.add.circle(0, 0, ORB_RADIUS * 0.55, 0x1d1a17, 0.6), orbit]);
  scene.tweens.add({ targets: wedges, angle: 360, duration: ORB.spinMs, repeat: -1 });
  scene.tweens.add({ targets: orbit, angle: -360, duration: ORB.spinMs * 0.7, repeat: -1 });
  return orb;
}

function burst(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, target: Point, elements: Element[]): void {
  for (let i = 0; i < SPARKS; i += 1) {
    const element = elements[i % elements.length];
    if (element === undefined) {
      return;
    }
    const angle = (i / SPARKS) * Math.PI * 2;
    const spark = scene.add.circle(target.x, target.y, 4, lighten(ELEMENT_COLOR[element], 0.3));
    layer.add(spark);
    scene.tweens.add({
      targets: spark,
      x: target.x + Math.cos(angle) * 110,
      y: target.y + Math.sin(angle) * 110,
      alpha: 0,
      scale: 0.3,
      duration: ORB.burstMs,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy(),
    });
  }
}

// The winning combination's elements gather over the winner: one element makes a dense ball of that
// element, several make a knot of their energies. Everything lives in `layer`, so a redraw cleans it up.
export function elementalOrb(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, sources: Source[], target: Point, delay: number): void {
  if (sources.length === 0) {
    return;
  }
  sources.forEach((source, i) => stream(scene, layer, source, target, delay + i * 40, (i * Math.PI * 2) / sources.length));
  const elements = [...new Set(sources.map((source) => source.element))];
  const first = elements[0];
  if (first === undefined) {
    return;
  }
  const orb = elements.length === 1 ? singleOrb(scene, first) : mixedOrb(scene, elements);
  orb.setPosition(target.x, target.y).setScale(0);
  orb.setSize((ORB_RADIUS + GLOW.distance) * 2, (ORB_RADIUS + GLOW.distance) * 2);
  orb.enableFilters().filters?.internal.addGlow(elements.length === 1 ? ELEMENT_COLOR[first] : 0xc9a227, 5, 0, 1, false, GLOW.quality, GLOW.distance);
  layer.add(orb);
  const formAt = delay + STREAM.travelMs * 0.8;
  scene.tweens.add({ targets: orb, scale: 1, delay: formAt, duration: ORB.formMs, ease: 'Back.Out' });
  scene.tweens.add({ targets: orb, scale: 1.1, delay: formAt + ORB.formMs, duration: ORB.holdMs / 4, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
  scene.time.delayedCall(formAt + ORB.formMs + ORB.holdMs, () => {
    if (!orb.active) {
      return;
    }
    burst(scene, layer, target, elements);
    scene.tweens.add({ targets: orb, scale: 1.8, alpha: 0, duration: ORB.burstMs, ease: 'Cubic.Out', onComplete: () => orb.destroy() });
  });
}
