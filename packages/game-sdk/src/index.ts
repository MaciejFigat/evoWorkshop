import { PROTOCOL_VERSION, parseHostMessage, type GameMessage } from '@evo/protocol';
import { mulberry32, type Rng } from '@evo/rng';

export type GameSession = {
  seed: number;
  sessionId: string;
  sandbox: boolean;
  rng: Rng;
  emit: (name: string, data?: unknown) => void;
};

const STANDALONE_SEED = 1;

export function connect(onInit: (session: GameSession) => void): void {
  if (window.parent === window) {
    onInit({
      seed: STANDALONE_SEED,
      sessionId: 'standalone',
      sandbox: true,
      rng: mulberry32(STANDALONE_SEED),
      emit: () => undefined,
    });
    return;
  }

  const parent = window.parent;
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== parent) {
      return;
    }
    const parsed = parseHostMessage(event.data);
    if (!parsed.ok) {
      return;
    }
    const init = parsed.value;
    const hostOrigin = event.origin;
    const emit = (name: string, data?: unknown): void => {
      const message: GameMessage = { type: 'game:event', name, data };
      parent.postMessage(message, hostOrigin);
    };
    onInit({
      seed: init.seed,
      sessionId: init.sessionId,
      sandbox: init.sandbox,
      rng: mulberry32(init.seed),
      emit,
    });
  });

  const ready: GameMessage = { type: 'game:ready', protocol: PROTOCOL_VERSION };
  parent.postMessage(ready, '*');
}
