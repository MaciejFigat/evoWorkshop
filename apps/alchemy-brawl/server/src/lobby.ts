import { randomInt, randomUUID } from 'node:crypto';
import {
  parseClientMessage,
  type ClientMessage,
  type ServerError,
  type ServerMessage,
  type TableConfig,
} from '@evo/brawl-shared';
import { Table } from './table.ts';

export type Connection = { send: (message: ServerMessage) => void };

type Player = { id: string; token: string; name: string; conn: Connection | null; table: Table | null };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

export class Lobby {
  private readonly config: TableConfig;
  private readonly byToken = new Map<string, Player>();
  private readonly byId = new Map<string, Player>();
  private readonly byConn = new Map<Connection, Player>();
  private readonly tables = new Map<string, Table>();

  constructor(config: TableConfig) {
    this.config = config;
  }

  receive(conn: Connection, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      conn.send({ type: 'error', reason: 'invalid_message' });
      return;
    }
    const message = parsed.value;
    if (message.type === 'hello') {
      this.hello(conn, message.token, message.name);
      return;
    }
    const player = this.byConn.get(conn);
    const error = player === undefined ? 'not_identified' : this.handle(player, message);
    if (error !== null) {
      conn.send({ type: 'error', reason: error });
    }
  }

  disconnect(conn: Connection): void {
    const player = this.byConn.get(conn);
    this.byConn.delete(conn);
    if (player !== undefined && player.conn === conn) {
      player.conn = null;
      player.table?.setConnected(player.id, false);
    }
  }

  private hello(conn: Connection, token: string, name: string): void {
    const known = this.byToken.get(token);
    const player = known ?? { id: randomUUID(), token, name, conn: null, table: null };
    if (known === undefined) {
      this.byToken.set(token, player);
      this.byId.set(player.id, player);
    }
    if (player.conn !== null) {
      this.byConn.delete(player.conn);
    }
    player.conn = conn;
    this.byConn.set(conn, player);
    conn.send({ type: 'welcome', playerId: player.id, name: player.name });
    if (player.table === null) {
      conn.send(this.lobbyMessage());
    } else {
      player.table.setConnected(player.id, true);
    }
  }

  private handle(player: Player, message: Exclude<ClientMessage, { type: 'hello' }>): ServerError | null {
    switch (message.type) {
      case 'create':
        return this.create(player, message.maxPlayers);
      case 'join':
        return this.join(player, message.code.toUpperCase());
      case 'leave':
        return this.leave(player);
      case 'addBot':
        return player.table === null ? 'not_seated' : this.afterChange(player.table.addBot());
      case 'cast':
        return player.table === null ? 'not_seated' : player.table.act(player.id, message);
      case 'bet':
        return player.table === null ? 'not_seated' : player.table.act(player.id, message);
    }
  }

  private create(player: Player, maxPlayers: number): ServerError | null {
    if (player.table !== null) {
      return 'already_seated';
    }
    const code = this.newCode();
    const table: Table = new Table(code, { ...this.config, maxPlayers }, {
      deliver: (id, message) => this.byId.get(id)?.conn?.send(message),
      onSeatsChanged: () => this.syncSeats(table),
    });
    this.tables.set(code, table);
    return this.join(player, code);
  }

  private join(player: Player, code: string): ServerError | null {
    const table = this.tables.get(code);
    if (table === undefined) {
      return 'no_such_table';
    }
    if (player.table !== null) {
      return 'already_seated';
    }
    const error = table.join(player.id, player.name);
    if (error === null) {
      player.table = table;
    }
    return this.afterChange(error);
  }

  private leave(player: Player): ServerError | null {
    const table = player.table;
    if (table === null) {
      return 'not_seated';
    }
    table.leave(player.id);
    player.table = null;
    player.conn?.send({ type: 'left' });
    this.syncSeats(table);
    return null;
  }

  private syncSeats(table: Table): void {
    for (const player of this.byId.values()) {
      if (player.table === table && !table.has(player.id)) {
        player.table = null;
        player.conn?.send({ type: 'left' });
      }
    }
    if (table.humanCount() === 0) {
      table.close();
      this.tables.delete(table.code);
    }
    this.broadcastLobby();
  }

  private afterChange(error: ServerError | null): ServerError | null {
    if (error === null) {
      this.broadcastLobby();
    }
    return error;
  }

  private lobbyMessage(): ServerMessage {
    return { type: 'lobby', tables: [...this.tables.values()].map((t) => t.info()) };
  }

  private broadcastLobby(): void {
    const message = this.lobbyMessage();
    for (const player of this.byId.values()) {
      if (player.table === null) {
        player.conn?.send(message);
      }
    }
  }

  private newCode(): string {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length))).join('');
    } while (this.tables.has(code));
    return code;
  }
}
