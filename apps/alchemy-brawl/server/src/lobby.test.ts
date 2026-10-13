import { DEFAULT_TABLE, parseServerMessage, type ServerMessage, type TableView } from '@evo/brawl-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Connection } from './lobby.ts';
import { START_DELAY_MS } from './table.ts';

type Client = { conn: Connection; inbox: ServerMessage[]; say: (message: object) => void };

// Every message goes through JSON and the client-side schema, as it would over the wire.
function client(lobby: Lobby): Client {
  const inbox: ServerMessage[] = [];
  const conn: Connection = {
    send: (message) => {
      const parsed = parseServerMessage(JSON.stringify(message));
      if (!parsed.ok) {
        throw new Error(parsed.reason);
      }
      inbox.push(parsed.value);
    },
  };
  return { conn, inbox, say: (message) => lobby.receive(conn, JSON.stringify(message)) };
}

function lastTable(c: Client): TableView {
  const message = [...c.inbox].reverse().find((m) => m.type === 'table');
  if (message?.type !== 'table') {
    throw new Error('no table view received');
  }
  return message.view;
}

const hello = (token: string, name: string) => ({ type: 'hello', token, name });

describe('Lobby', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects messages before hello and anything that is not a valid message', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    a.say({ type: 'create', maxPlayers: 4 });
    lobby.receive(a.conn, 'not json');
    a.say({ type: 'create', maxPlayers: 9 });
    expect(a.inbox).toEqual([
      { type: 'error', reason: 'not_identified' },
      { type: 'error', reason: 'invalid_message' },
      { type: 'error', reason: 'invalid_message' },
    ]);
  });

  it('creates a table, seats a second player by code and deals each only their own cards', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 4 });
    const code = lastTable(a).code;
    b.say(hello('token-bbbb', 'Ben'));
    expect(b.inbox.at(-1)).toEqual({ type: 'lobby', tables: [{ code, players: 1, maxPlayers: 4 }] });
    b.say({ type: 'join', code: code.toLowerCase() });
    expect(lastTable(a).seats.map((s) => s.name)).toEqual(['Ada', 'Ben']);

    vi.advanceTimersByTime(START_DELAY_MS);
    const viewA = lastTable(a);
    const viewB = lastTable(b);
    expect(viewA.hand?.phase).toBe('cast');
    expect(viewA.hand?.you?.hand).toHaveLength(4);
    expect(viewB.hand?.you?.hand).toHaveLength(4);
    const json = JSON.stringify(viewA);
    for (const held of viewB.hand?.you?.hand ?? []) {
      expect(json).not.toContain(JSON.stringify(held));
    }
  });

  it('gives the seat back after a reconnect with the same token', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const first = client(lobby);
    first.say(hello('token-aaaa', 'Ada'));
    first.say({ type: 'create', maxPlayers: 4 });
    const welcome = first.inbox[0];
    lobby.disconnect(first.conn);

    const second = client(lobby);
    second.say(hello('token-aaaa', 'Ada'));
    expect(second.inbox[0]).toEqual(welcome);
    expect(lastTable(second).code).toBe(lastTable(first).code);
  });

  it('plays hands on its own with bots while the only human times out', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 3 });
    a.say({ type: 'addBot' });
    a.say({ type: 'addBot' });
    vi.advanceTimersByTime(300_000);

    const ended = a.inbox.flatMap((m) => (m.type === 'table' ? m.events : [])).filter((e) => e.type === 'handEnded');
    expect(ended.length).toBeGreaterThan(1);
    expect(lastTable(a).handNo).toBeGreaterThan(1);
    expect(a.inbox.some((m) => m.type === 'error')).toBe(false);
  });

  it('closes the table when the last human leaves', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 3 });
    a.say({ type: 'addBot' });
    vi.advanceTimersByTime(START_DELAY_MS);
    a.say({ type: 'leave' });
    expect(a.inbox.slice(-2)).toEqual([{ type: 'left' }, { type: 'lobby', tables: [] }]);
    a.say({ type: 'addBot' });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'not_seated' });
  });
});
