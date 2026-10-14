import { randomInt, randomUUID } from 'node:crypto';
import { ROOM_SIZE, parseClientMessage, type ClientMessage, type ServerMessage, type Snapshot } from '@evo/project-phlebas-coop/shared';
import { Room } from './room.ts';
import { createMemoryStore, type Store } from './store.ts';

export type Connection = { send: (message: ServerMessage) => void };

type Player = { id: string; name: string; conn: Connection; room: Room | null };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, hard to misread out loud
const CODE_LENGTH = 4;

export class Lobby {
  private readonly store: Store;
  private readonly byConn = new Map<Connection, Player>();
  private readonly rooms = new Map<string, Room>();

  constructor(store: Store = createMemoryStore()) {
    this.store = store;
  }

  receive(conn: Connection, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      conn.send({ type: 'error', reason: 'invalid_message' });
      return;
    }
    const message = parsed.value;
    if (message.type === 'hello') {
      this.hello(conn, message.name);
      return;
    }
    const player = this.byConn.get(conn);
    if (player === undefined) {
      conn.send({ type: 'error', reason: 'not_identified' });
      return;
    }
    this.handle(player, message);
  }

  disconnect(conn: Connection): void {
    const player = this.byConn.get(conn);
    this.byConn.delete(conn);
    if (player !== undefined) {
      this.leaveRoom(player);
    }
  }

  private hello(conn: Connection, name: string): void {
    const player: Player = { id: randomUUID(), name, conn, room: null };
    this.byConn.set(conn, player);
    this.store.savePlayer({ id: player.id, name: player.name });
    conn.send({ type: 'welcome', playerId: player.id });
  }

  private handle(player: Player, message: Exclude<ClientMessage, { type: 'hello' }>): void {
    switch (message.type) {
      case 'create':
        this.create(player);
        return;
      case 'join':
        this.join(player, message.code.toUpperCase());
        return;
      case 'leave':
        this.leaveRoom(player);
        return;
      case 'ready':
        if (player.room === null) {
          player.conn.send({ type: 'error', reason: 'not_seated' });
          return;
        }
        player.room.setReady(player.id);
        this.broadcastRoom(player.room);
        return;
      case 'input':
        this.relayInput(player, message.keys);
        return;
      case 'snapshot':
        this.relaySnapshot(player, message.payload);
        return;
    }
  }

  private create(player: Player): void {
    if (player.room !== null) {
      player.conn.send({ type: 'error', reason: 'already_seated' });
      return;
    }
    const room = new Room(this.newCode(), ROOM_SIZE);
    this.rooms.set(room.code, room);
    this.seat(player, room);
  }

  // The one entry point for the "share a link" flow: the room's code comes
  // straight from the URL (?room=<code>), and whoever opens it takes the
  // next free seat, up to maxPlayers.
  private join(player: Player, code: string): void {
    if (player.room !== null) {
      player.conn.send({ type: 'error', reason: 'already_seated' });
      return;
    }
    const room = this.rooms.get(code);
    if (room === undefined) {
      player.conn.send({ type: 'error', reason: 'no_such_room' });
      return;
    }
    if (room.full) {
      player.conn.send({ type: 'error', reason: 'room_full' });
      return;
    }
    this.seat(player, room);
  }

  private seat(player: Player, room: Room): void {
    room.join(player.id, player.name);
    player.room = room;
    this.broadcastRoom(room);
  }

  private leaveRoom(player: Player): void {
    const room = player.room;
    if (room === null) {
      return;
    }
    room.leave(player.id);
    player.room = null;
    player.conn.send({ type: 'left' });
    if (room.empty) {
      this.rooms.delete(room.code);
    } else {
      this.broadcastRoom(room);
    }
  }

  private broadcastRoom(room: Room): void {
    const message: ServerMessage = { type: 'room', ...room.info() };
    for (const player of this.playersIn(room)) {
      player.conn.send(message);
    }
  }

  // Both relays below are a dumb pipe: the server never interprets `input`
  // or `snapshot`, it only forwards them to the right seat(s). The actual
  // game simulation lives entirely in the host's browser tab.
  private relayInput(sender: Player, keys: string[]): void {
    const room = sender.room;
    if (room === null) {
      sender.conn.send({ type: 'error', reason: 'not_seated' });
      return;
    }
    const host = this.playersIn(room).find((p) => p.id === room.hostId);
    host?.conn.send({ type: 'input', keys });
  }

  private relaySnapshot(sender: Player, payload: Snapshot): void {
    const room = sender.room;
    if (room === null) {
      sender.conn.send({ type: 'error', reason: 'not_seated' });
      return;
    }
    if (room.hostId !== sender.id) {
      sender.conn.send({ type: 'error', reason: 'not_host' });
      return;
    }
    for (const other of this.playersIn(room)) {
      if (other.id !== sender.id) {
        other.conn.send({ type: 'snapshot', payload });
      }
    }
  }

  private playersIn(room: Room): Player[] {
    return [...this.byConn.values()].filter((p) => p.room === room);
  }

  private newCode(): string {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length))).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
