import {
  DEFAULT_TABLE,
  parseServerMessage,
  rebuyBelow,
  type HandEvent,
  type ServerMessage,
  type TableView,
} from '@evo/alchemy-brawl/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Connection } from './lobby.ts';
import { ROUND1_END_DELAY_MS, START_DELAY_MS } from './table.ts';

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

function events(c: Client): HandEvent[] {
  return c.inbox.flatMap((m) => (m.type === 'table' ? m.events : []));
}

const hello = (token: string, name: string) => ({ type: 'hello', token, name });

// One human who never acts plus two bots: the table runs on timers alone.
function soloTable(lobby: Lobby): Client {
  const a = client(lobby);
  a.say(hello('token-aaaa', 'Ada'));
  a.say({ type: 'create', maxPlayers: 3 });
  a.say({ type: 'addBot' });
  a.say({ type: 'addBot' });
  return a;
}

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
    a.say({ type: 'create', maxPlayers: 2 });
    a.say({ type: 'create', maxPlayers: 12 });
    expect(a.inbox).toEqual([
      { type: 'error', reason: 'not_identified' },
      { type: 'error', reason: 'invalid_message' },
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
    a.say({ type: 'addBot' });

    // Past the start delay and the bots' reaction time, but inside the Round 1 window.
    vi.advanceTimersByTime(START_DELAY_MS + 2_000);
    const viewA = lastTable(a);
    const viewB = lastTable(b);
    expect(viewA.hand?.phase).toBe('decide');
    expect(viewA.hand?.you?.hand).toHaveLength(3);
    expect(viewB.hand?.you?.hand).toHaveLength(3);
    expect(viewA.hand?.players.some((p) => p.decided)).toBe(true);
    const json = JSON.stringify(viewA);
    for (const held of viewB.hand?.you?.hand ?? []) {
      expect(json).not.toContain(JSON.stringify(held));
    }
    for (const player of viewA.hand?.players ?? []) {
      expect(player.shown).toBeNull();
      expect(player.stayed).toBeNull();
      expect(player.handCount).toBe(3);
    }
    expect(json).not.toContain('"kind":"stay"');
    expect(json).not.toContain('"kind":"skip"');
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
    expect(lastTable(second).seats.map((s) => s.connected)).toEqual([true]);
  });

  it('plays hands on its own with bots while the only human times out', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = soloTable(lobby);
    vi.advanceTimersByTime(300_000);

    const ended = events(a).filter((e) => e.type === 'handEnded');
    const handNo = lastTable(a).handNo;
    expect(handNo).toBeGreaterThan(1);
    expect(ended.length).toBeGreaterThanOrEqual(handNo - 1);
    for (const event of ended) {
      expect(event.result.payouts).toHaveLength(3);
      expect(event.result.payouts.reduce((sum, p) => sum + p, 0)).toBe(event.result.pot);
      expect(event.result.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(event.result.pot);
      for (const pot of event.result.pots) {
        expect(pot.winners.length).toBeGreaterThan(0);
        expect(pot.winners.every((seat) => pot.eligible.includes(seat))).toBe(true);
      }
      expect(event.result.hands).toHaveLength(event.result.reason === 'fold' ? 0 : event.result.combinations.length);
    }
    expect(ended.some((e) => e.result.reason === 'showdown')).toBe(true);
    // Every stack goes on through the table: nobody is ever below rebuyBelow when a hand starts.
    const started = a.inbox.flatMap((m) => (m.type === 'table' && m.events.some((e) => e.type === 'round1Started') ? [m.view] : []));
    for (const view of started) {
      for (const player of view.hand?.players ?? []) {
        expect(player.stack + player.committed).toBeGreaterThanOrEqual(rebuyBelow(DEFAULT_TABLE.rules));
      }
    }
    // Hands come out only in the showdown and only for the seats that did not fold.
    const views = a.inbox.flatMap((m) => (m.type === 'table' && m.events.some((e) => e.type === 'handEnded') ? [m.view] : []));
    for (const view of views) {
      const final = view.hand?.final;
      if (final?.reason !== 'showdown') {
        continue;
      }
      const unfolded = (view.hand?.players ?? []).flatMap((p, seat) => (p.folded ? [] : [seat]));
      expect(final.hands.map((h) => h.seat)).toEqual(unfolded);
      for (const revealed of final.hands) {
        expect(revealed.cards.length).toBeGreaterThanOrEqual(3);
      }
    }
    expect(a.inbox.some((m) => m.type === 'error')).toBe(false);
    expect(a.inbox.some((m) => m.type === 'chat')).toBe(false);
  });

  it('shows every stayer one card face up after the Round 1 window and deals everyone to four', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = soloTable(lobby);
    vi.advanceTimersByTime(START_DELAY_MS + 100);
    expect(lastTable(a).hand?.phase).toBe('decide');
    const mine = lastTable(a).hand?.you?.hand ?? [];
    const show = mine[0];
    if (show === undefined) {
      throw new Error('no hand dealt');
    }
    a.say({ type: 'decide', decision: { kind: 'stay', show } });
    expect(a.inbox.some((m) => m.type === 'error')).toBe(false);
    // The window closes as soon as every seat has locked in, so read the view that came with each event.
    vi.advanceTimersByTime(DEFAULT_TABLE.decideTimerMs + ROUND1_END_DELAY_MS);
    const viewWith = (type: HandEvent['type']) =>
      a.inbox.flatMap((m) => (m.type === 'table' && m.events.some((e) => e.type === type) ? [m.view.hand] : []))[0] ?? null;
    const closed = viewWith('round1Resolved');
    expect(closed?.phase).toBe('round1End');
    const you = closed?.you?.seat ?? -1;
    expect(closed?.players[you]?.shown).toEqual(show);
    expect(closed?.players[you]?.handCount).toBe(3);
    expect(closed?.you?.hand).toHaveLength(3);
    for (const player of closed?.players ?? []) {
      expect(player.shown === null).toBe(player.stayed === false);
    }
    expect(closed?.round1?.shown.map((s) => s.seat)).toEqual(closed?.round1?.stayers);
    const final = viewWith('finalStarted');
    expect(final?.phase).toBe('bet');
    expect(final?.you?.hand).toHaveLength(4);
    expect(final?.players.map((p) => p.handCount)).toEqual([4, 4, 4]);
    expect(final?.players[you]?.shown).toEqual(show);
  });

  it('relays a chat line to every human at the table under the sender name', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    const c = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 4 });
    const code = lastTable(a).code;
    b.say(hello('token-bbbb', 'Ben'));
    b.say({ type: 'join', code });
    c.say(hello('token-cccc', 'Cid'));
    a.say({ type: 'addBot' });
    const ada = lastTable(a).you;
    b.say({ type: 'chat', text: '  good luck  ' });
    const line = { type: 'chat', from: 'Ben', playerId: lastTable(b).you, text: 'good luck' };
    expect(a.inbox.at(-1)).toEqual(line);
    expect(b.inbox.at(-1)).toEqual(line);
    expect(c.inbox.some((m) => m.type === 'chat')).toBe(false);
    a.say({ type: 'chat', text: 'thanks' });
    expect(b.inbox.at(-1)).toEqual({ type: 'chat', from: 'Ada', playerId: ada, text: 'thanks' });
    expect(a.inbox.at(-1)).toEqual({ type: 'chat', from: 'Ada', playerId: ada, text: 'thanks' });
  });

  it('answers an error to a chat before hello, without a table or with an empty line', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    a.say({ type: 'chat', text: 'hi' });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'not_identified' });
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'chat', text: 'hi' });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'not_seated' });
    a.say({ type: 'create', maxPlayers: 3 });
    a.say({ type: 'chat', text: '   ' });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'invalid_message' });
    a.say({ type: 'chat', text: 'x'.repeat(201) });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'invalid_message' });
  });

  it('closes the Round 1 window on decideTimerMs and opens Final betting straight after round1End', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = soloTable(lobby);
    vi.advanceTimersByTime(START_DELAY_MS);
    expect(lastTable(a).hand?.phase).toBe('decide');
    vi.advanceTimersByTime(DEFAULT_TABLE.decideTimerMs - 1);
    expect(lastTable(a).hand?.phase).toBe('decide');
    vi.advanceTimersByTime(1);
    expect(lastTable(a).hand?.phase).toBe('round1End');

    vi.advanceTimersByTime(ROUND1_END_DELAY_MS);
    const view = lastTable(a);
    expect(view.hand?.phase).toBe('bet');
    expect(view.hand?.table).toHaveLength(3);
    expect(view.hand?.you?.best).not.toBeNull();
    expect(events(a).some((e) => e.type === 'finalStarted' && e.table.length === 3)).toBe(true);
  });

  it('answers wrong_phase to a bet sent during the Round 1 window', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = soloTable(lobby);
    vi.advanceTimersByTime(START_DELAY_MS);
    expect(lastTable(a).hand?.phase).toBe('decide');
    a.say({ type: 'bet', action: { kind: 'check' } });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'wrong_phase' });
  });

  it('answers bad_raise_size to a raise below the minimum and takes a legal one', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 3 });
    const code = lastTable(a).code;
    b.say(hello('token-bbbb', 'Ben'));
    b.say({ type: 'join', code });
    a.say({ type: 'addBot' });
    // Nobody acts in Round 1; the first seat after the button (Ben) opens the Final.
    vi.advanceTimersByTime(START_DELAY_MS + DEFAULT_TABLE.decideTimerMs + ROUND1_END_DELAY_MS);
    const opened = lastTable(b);
    expect(opened.hand?.phase).toBe('bet');
    expect(opened.hand?.betting).toEqual({ level: 0, minRaise: DEFAULT_TABLE.rules.minBet, actor: opened.hand?.you?.seat });
    expect(opened.hand?.you?.bet).toEqual({
      canCheck: true,
      call: 0,
      callAllIn: false,
      raise: { min: DEFAULT_TABLE.rules.minBet, max: DEFAULT_TABLE.buyIn - DEFAULT_TABLE.rules.ante },
    });
    b.say({ type: 'bet', action: { kind: 'raise', to: 0 } });
    expect(b.inbox.at(-1)).toEqual({ type: 'error', reason: 'invalid_message' });
    b.say({ type: 'bet', action: { kind: 'raise', to: DEFAULT_TABLE.rules.minBet - 1 } });
    expect(b.inbox.at(-1)).toEqual({ type: 'error', reason: 'bad_raise_size' });
    b.say({ type: 'bet', action: { kind: 'raise', to: DEFAULT_TABLE.buyIn } });
    expect(b.inbox.at(-1)).toEqual({ type: 'error', reason: 'insufficient_stack' });
    b.say({ type: 'bet', action: { kind: 'call' } });
    expect(b.inbox.at(-1)).toEqual({ type: 'error', reason: 'illegal_bet' });
    a.say({ type: 'bet', action: { kind: 'check' } });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'not_your_turn' });
    b.say({ type: 'bet', action: { kind: 'raise', to: 2 * DEFAULT_TABLE.rules.minBet } });
    expect(b.inbox.at(-1)).toMatchObject({ type: 'table' });
    expect(events(b).at(-1)).toEqual({
      type: 'betPlaced',
      seat: opened.hand?.you?.seat,
      kind: 'raise',
      amount: 2 * DEFAULT_TABLE.rules.minBet,
      allIn: false,
    });
    expect(lastTable(b).hand?.betting).toMatchObject({ level: 2 * DEFAULT_TABLE.rules.minBet, minRaise: 2 * DEFAULT_TABLE.rules.minBet });
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
    expect(lobby.tables()).toEqual([]);
    a.say({ type: 'addBot' });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'not_seated' });
  });

  it('refuses a second seat for a player who left mid-hand and came back by code', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 3 });
    const code = lastTable(a).code;
    b.say(hello('token-bbbb', 'Ben'));
    b.say({ type: 'join', code });
    a.say({ type: 'addBot' });
    vi.advanceTimersByTime(START_DELAY_MS + 100);
    expect(lastTable(a).hand?.phase).toBe('decide');
    a.say({ type: 'leave' });
    a.say({ type: 'join', code });
    expect(a.inbox.at(-1)).toEqual({ type: 'error', reason: 'already_seated' });
    expect(lastTable(b).seats.filter((s) => s.id === lastTable(a).you)).toHaveLength(1);
  });

  it('replays handEnded to a seat that reconnects while the finished hand is on the table', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 3 });
    const code = lastTable(a).code;
    b.say(hello('token-bbbb', 'Ben'));
    b.say({ type: 'join', code });
    a.say({ type: 'addBot' });
    vi.advanceTimersByTime(START_DELAY_MS + 100);
    lobby.disconnect(a.conn);
    const ended = (c: Client) => c.inbox.flatMap((m) => (m.type === 'table' ? m.events : [])).filter((e) => e.type === 'handEnded');
    while (ended(b).length === 0) {
      vi.advanceTimersByTime(1_000);
    }
    expect(ended(a)).toHaveLength(0);
    const back = client(lobby);
    back.say(hello('token-aaaa', 'Ada'));
    expect(lastTable(back).hand?.phase).toBe('done');
    expect(ended(back)).toHaveLength(1);
  });

  it('lists the same tables through tables() and the lobby message', () => {
    const lobby = new Lobby(DEFAULT_TABLE);
    const a = client(lobby);
    const b = client(lobby);
    a.say(hello('token-aaaa', 'Ada'));
    a.say({ type: 'create', maxPlayers: 5 });
    a.say({ type: 'addBot' });
    b.say(hello('token-bbbb', 'Ben'));
    const lobbyMessage = b.inbox.at(-1);
    expect(lobbyMessage?.type).toBe('lobby');
    expect(lobby.tables()).toEqual([{ code: lastTable(a).code, players: 2, maxPlayers: 5 }]);
    expect(lobbyMessage).toEqual({ type: 'lobby', tables: lobby.tables() });
  });
});
