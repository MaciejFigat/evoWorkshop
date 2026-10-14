import {
  parseServerMessage,
  type ClientMessage,
  type PlayerInfo,
  type ServerError,
  type ServerMessage,
  type Snapshot,
} from '@evo/project-phlebas-coop-shared';

export type RoomState = {
  code: string;
  maxPlayers: number;
  players: PlayerInfo[];
  roundNo: number;
  roundSeed: number | null;
  firstPlayerId: string | null;
  hostId: string | null;
};

export type NetState = {
  status: 'connecting' | 'open' | 'closed';
  name: string | null;
  playerId: string | null;
  room: RoomState | null;
  joinCodeFromUrl: string | null;
  error: ServerError | null;
};

export type Net = {
  getState: () => NetState;
  subscribe: (listener: () => void) => () => void;
  setName: (name: string) => void;
  create: () => void;
  join: (code: string) => void;
  leave: () => void;
  ready: () => void;
  // High-frequency match traffic, kept out of NetState/subscribe on purpose:
  // a snapshot arrives up to ~60 times a second, and funneling that through
  // React state would mean a re-render per frame for no reason — the game
  // draws straight to canvas instead (see GameView.tsx).
  sendInput: (keys: string[]) => void;
  sendSnapshot: (payload: Snapshot) => void;
  onInput: (handler: (keys: string[]) => void) => () => void;
  onSnapshot: (handler: (payload: Snapshot) => void) => () => void;
};

const RECONNECT_MS = 1_000;
const NAME_KEY = 'project-phlebas-coop.name';
const ROOM_PARAM = 'room';

// sessionStorage, not localStorage: a shared link is opened in a *new* tab,
// which gets its own empty sessionStorage even on the same machine/origin —
// so the second player is asked for their own name instead of silently
// inheriting the host's. (Only an auxiliary tab opened via a clicked link or
// window.open() inherits it; a pasted URL in a fresh tab never does.)
function readName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

function writeName(name: string): void {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    return;
  }
}

function readRoomCodeFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get(ROOM_PARAM);
  return code === null || code.trim() === '' ? null : code.trim().toUpperCase();
}

// Reflects the seated room in the address bar, so copying the bar's URL is
// the same as pressing "copy link" — and a reload rejoins the same room.
function writeRoomCodeToUrl(code: string | null): void {
  const url = new URL(location.href);
  if (code === null) {
    url.searchParams.delete(ROOM_PARAM);
  } else {
    url.searchParams.set(ROOM_PARAM, code);
  }
  history.replaceState(null, '', url);
}

type Emit = (name: string, data?: unknown) => void;

export function createConnection(emit: Emit): Net {
  const listeners = new Set<() => void>();
  const inputListeners = new Set<(keys: string[]) => void>();
  const snapshotListeners = new Set<(payload: Snapshot) => void>();
  let socket: WebSocket | null = null;
  let autoJoinCode = readRoomCodeFromUrl();
  let state: NetState = {
    status: 'connecting',
    name: readName(),
    playerId: null,
    room: null,
    joinCodeFromUrl: autoJoinCode,
    error: null,
  };

  const update = (patch: Partial<NetState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const sendRaw = (message: ClientMessage): void => {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const hello = (): void => {
    if (state.name !== null) {
      sendRaw({ type: 'hello', name: state.name });
    }
  };

  const receive = (message: ServerMessage): void => {
    switch (message.type) {
      case 'welcome':
        update({ playerId: message.playerId, error: null });
        if (autoJoinCode !== null) {
          const code = autoJoinCode;
          autoJoinCode = null;
          sendRaw({ type: 'join', code });
        }
        return;
      case 'room': {
        const previousSeed = state.room?.roundSeed ?? null;
        if (message.roundSeed !== null && message.roundSeed !== previousSeed) {
          // The host's scorecard reads `round` events: one per started match.
          emit('round', { round: message.roundNo, seed: message.roundSeed, stake: 0, payout: 0, balance: 0 });
        }
        writeRoomCodeToUrl(message.code);
        update({
          room: {
            code: message.code,
            maxPlayers: message.maxPlayers,
            players: message.players,
            roundNo: message.roundNo,
            roundSeed: message.roundSeed,
            firstPlayerId: message.firstPlayerId,
            hostId: message.hostId,
          },
          error: null,
        });
        return;
      }
      case 'left':
        writeRoomCodeToUrl(null);
        update({ room: null });
        return;
      case 'input':
        inputListeners.forEach((handler) => handler(message.keys));
        return;
      case 'snapshot':
        snapshotListeners.forEach((handler) => handler(message.payload));
        return;
      case 'error':
        update({ error: message.reason });
        return;
    }
  };

  const open = (): void => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    // /ws standalone (own server, own origin); /phlebas-coop/ws when
    // co-hosted behind apps/web — see build:embedded's .env.embedded.
    const wsPath = import.meta.env.VITE_WS_PATH ?? '/ws';
    const ws = new WebSocket(`${protocol}://${location.host}${wsPath}`);
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
      writeName(name);
      update({ name });
      hello();
    },
    create: () => {
      update({ error: null });
      sendRaw({ type: 'create' });
    },
    join: (code) => {
      update({ error: null });
      sendRaw({ type: 'join', code: code.trim().toUpperCase() });
    },
    leave: () => sendRaw({ type: 'leave' }),
    ready: () => sendRaw({ type: 'ready' }),
    sendInput: (keys) => sendRaw({ type: 'input', keys }),
    sendSnapshot: (payload) => sendRaw({ type: 'snapshot', payload }),
    onInput: (handler) => {
      inputListeners.add(handler);
      return () => inputListeners.delete(handler);
    },
    onSnapshot: (handler) => {
      snapshotListeners.add(handler);
      return () => snapshotListeners.delete(handler);
    },
  };
}
