import { parseServerMessage, type ServerMessage } from '@evo/project-phlebas-coop-shared';
import { describe, expect, it } from 'vitest';
import { Lobby, type Connection } from './lobby.ts';

function fakeConnection(): { conn: Connection; messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { conn: { send: (message) => messages.push(message) }, messages };
}

function send(lobby: Lobby, conn: Connection, message: unknown): void {
  lobby.receive(conn, JSON.stringify(message));
}

function roomCodeFrom(messages: ServerMessage[]): string {
  const room = messages.find((m) => m.type === 'room');
  if (room?.type !== 'room') {
    throw new Error('no room message received');
  }
  return room.code;
}

function seatTwo(lobby: Lobby): { host: ReturnType<typeof fakeConnection>; guest: ReturnType<typeof fakeConnection>; code: string } {
  const host = fakeConnection();
  const guest = fakeConnection();
  send(lobby, host.conn, { type: 'hello', name: 'Ada' });
  send(lobby, host.conn, { type: 'create' });
  const code = roomCodeFrom(host.messages);
  send(lobby, guest.conn, { type: 'hello', name: 'Bea' });
  send(lobby, guest.conn, { type: 'join', code });
  return { host, guest, code };
}

describe('Lobby', () => {
  it('rejects a message before hello', () => {
    const lobby = new Lobby();
    const { conn, messages } = fakeConnection();
    send(lobby, conn, { type: 'ready' });
    expect(messages).toEqual([{ type: 'error', reason: 'not_identified' }]);
  });

  it('a created room is always 2 seats, and the host is the first seat', () => {
    const lobby = new Lobby();
    const { host, guest, code } = seatTwo(lobby);
    const afterGuest = host.messages.at(-1);
    expect(afterGuest).toMatchObject({ type: 'room', code, maxPlayers: 2, players: [{ name: 'Ada' }, { name: 'Bea' }] });
    if (afterGuest?.type === 'room') {
      expect(afterGuest.hostId).toEqual(afterGuest.players[0]?.id);
    }

    const late = fakeConnection();
    send(lobby, late.conn, { type: 'hello', name: 'Cai' });
    send(lobby, late.conn, { type: 'join', code });
    expect(late.messages.at(-1)).toEqual({ type: 'error', reason: 'room_full' });
  });

  it('rejects a join to a code that does not exist', () => {
    const lobby = new Lobby();
    const { conn, messages } = fakeConnection();
    send(lobby, conn, { type: 'hello', name: 'Ada' });
    send(lobby, conn, { type: 'join', code: 'ZZZZ' });
    expect(messages.at(-1)).toEqual({ type: 'error', reason: 'no_such_room' });
  });

  it('starts a match with a seed once both seated players are ready', () => {
    const lobby = new Lobby();
    const { host, guest } = seatTwo(lobby);

    send(lobby, host.conn, { type: 'ready' });
    send(lobby, guest.conn, { type: 'ready' });
    const afterBoth = host.messages.at(-1);
    expect(afterBoth).toMatchObject({ type: 'room', roundNo: 1 });
    if (afterBoth?.type === 'room') {
      expect(afterBoth.roundSeed).not.toBeNull();
      expect(afterBoth.players.every((p) => !p.ready)).toBe(true);
    }
  });

  it('relays input from the guest to the host only', () => {
    const lobby = new Lobby();
    const { host, guest } = seatTwo(lobby);
    send(lobby, guest.conn, { type: 'input', keys: ['ArrowLeft'] });
    expect(host.messages.at(-1)).toEqual({ type: 'input', keys: ['ArrowLeft'] });
    expect(guest.messages.at(-1)?.type).not.toBe('input');
  });

  it('relays a snapshot from the host to every other seat', () => {
    const lobby = new Lobby();
    const { host, guest } = seatTwo(lobby);
    const payload = {
      phase: 'play' as const,
      paused: false,
      eraIndex: 0,
      score: 0,
      lives: 3,
      playerXs: [100, 200] as [number, number],
      bullets: [],
      enemies: [],
      beamCharges: [0, 0] as [number, number],
    };
    send(lobby, host.conn, { type: 'snapshot', payload });
    expect(guest.messages.at(-1)).toEqual({ type: 'snapshot', payload });
  });

  it('rejects a snapshot sent by the guest', () => {
    const lobby = new Lobby();
    const { guest } = seatTwo(lobby);
    const payload = {
      phase: 'play' as const,
      paused: false,
      eraIndex: 0,
      score: 0,
      lives: 3,
      playerXs: [0, 0] as [number, number],
      bullets: [],
      enemies: [],
      beamCharges: [0, 0] as [number, number],
    };
    send(lobby, guest.conn, { type: 'snapshot', payload });
    expect(guest.messages.at(-1)).toEqual({ type: 'error', reason: 'not_host' });
  });

  it('frees the seat on leave, and deletes an empty room', () => {
    const lobby = new Lobby();
    const { host, guest, code } = seatTwo(lobby);

    send(lobby, host.conn, { type: 'leave' });
    expect(host.messages.at(-1)).toEqual({ type: 'left' });
    expect(guest.messages.at(-1)).toMatchObject({ type: 'room', players: [{ name: 'Bea' }] });

    lobby.disconnect(guest.conn);
    const rejoin = fakeConnection();
    send(lobby, rejoin.conn, { type: 'hello', name: 'Cai' });
    send(lobby, rejoin.conn, { type: 'join', code });
    expect(rejoin.messages.at(-1)).toEqual({ type: 'error', reason: 'no_such_room' });
  });

  it('round-trips server messages through the wire schema', () => {
    const lobby = new Lobby();
    const { conn, messages } = fakeConnection();
    send(lobby, conn, { type: 'hello', name: 'Ada' });
    const raw = JSON.stringify(messages[0]);
    const parsed = parseServerMessage(raw);
    expect(parsed).toEqual({ ok: true, value: messages[0] });
  });
});
