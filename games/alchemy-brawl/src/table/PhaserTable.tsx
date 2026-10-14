import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { Net } from '../net';
import { HEIGHT, WIDTH } from './draw';
import { TableScene } from './TableScene';

export function PhaserTable({ net }: { net: Net }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) {
      return;
    }
    // The canvas holds device pixels; CSS scales it down to fit the board, so a Retina screen gets a crisp table.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: WIDTH * dpr,
      height: HEIGHT * dpr,
      backgroundColor: '#14110f',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new TableScene(net, dpr)],
    });
    return () => game.destroy(true);
  }, [net]);

  return <div className="board" ref={host} />;
}
