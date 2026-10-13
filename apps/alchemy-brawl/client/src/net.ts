import {
  parseServerMessage,
  type ClientMessage,
  type HandEvent,
  type LobbyTable,
  type ServerError,
  type ServerMessage,
  type TableView,
} from '@evo/brawl-shared';

export type NetState = {
  status: 'connecting' | 'open' | 'closed';
  name: string | null;
  playerId: string | null;
  lobby: LobbyTable[];
  table: TableView | null;
  events: HandEvent[];
  seq: number;
  receivedAt: number;
  error: ServerError | null;
};

export type Net = {
  getState: () => NetState;
  subscribe: (listener: () => void) => () => void;
  setName: (name: string) => void;
  send: (message: ClientMessage) => void;
};

type Emit = (name: string, data?: unknown) => void;

const RECONNECT_MS = 1_000;
const NAME_KEY = 'brawl.name';
// Per tab, so two tabs on one machine are two players, and a reload keeps the seat.
const TOKEN_KEY = 'brawl.token';

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    return;
  }
}

function sessionToken(): string {
  const existing = read(() => sessionStorage, TOKEN_KEY);
  if (existing !== null) {
    return existing;
  }
  const token = crypto.randomUUID();
  write(() => sessionStorage, TOKEN_KEY, token);
  return token;
}

export function createConnection(emit: Emit): Net {
  const token = sessionToken();
  const listeners = new Set<() => void>();
  let socket: WebSocket | null = null;
  let state: NetState = {
    status: 'connecting',
    name: read(() => localStorage, NAME_KEY),
    playerId: null,
    lobby: [],
    table: null,
    events: [],
    seq: 0,
    receivedAt: 0,
    error: null,
  };

  const update = (patch: Partial<NetState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const send = (message: ClientMessage): void => {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const hello = (): void => {
    if (state.name !== null) {
      send({ type: 'hello', token, name: state.name });
    }
  };

  const receive = (message: ServerMessage): void => {
    switch (message.type) {
      case 'welcome':
        update({ playerId: message.playerId });
        return;
      case 'lobby':
        update({ lobby: message.tables, table: null, events: [] });
        return;
      case 'table':
        update({ table: message.view, events: message.events, seq: state.seq + 1, receivedAt: Date.now() });
        reportRounds(message.view, message.events, emit);
        return;
      case 'left':
        update({ table: null, events: [] });
        return;
      case 'error':
        update({ error: message.reason });
        return;
    }
  };

  const open = (): void => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    socket = ws;
    update({ status: 'connecting' });
    ws.addEventListener('open', () => {
      update({ status: 'open' });
      hello();
    });
    ws.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
      if (parsed?.ok === true) {
        receive(parsed.value);
      }
    });
    ws.addEventListener('close', () => {
      update({ status: 'closed' });
      setTimeout(open, RECONNECT_MS);
    });
  };

  open();

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setName: (name) => {
      write(() => localStorage, NAME_KEY, name);
      update({ name });
      hello();
    },
    send: (message) => {
      update({ error: null });
      send(message);
    },
  };
}

// The bench scorecard reads `round` events: one per finished hand, from this player's seat.
function reportRounds(view: TableView, events: HandEvent[], emit: Emit): void {
  const seat = view.hand?.you?.seat;
  const player = seat === undefined ? undefined : view.hand?.players[seat];
  for (const event of events) {
    if (event.type === 'handEnded' && seat !== undefined && player !== undefined) {
      emit('round', {
        round: view.handNo,
        seed: view.handSeed,
        stake: player.committed,
        payout: event.outcome.payouts[seat] ?? 0,
        balance: player.stack,
        table: view.code,
        reason: event.outcome.reason,
        winners: event.outcome.winners,
      });
    }
  }
}
