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
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: '#14110f',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new TableScene(net)],
    });
    return () => game.destroy(true);
  }, [net]);

  return <div className="board" ref={host} />;
}
