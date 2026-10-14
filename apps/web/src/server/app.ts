import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { LobbyTable, ServerMessage } from '@evo/alchemy-brawl/engine';
import type { ServerMessage as PhlebasServerMessage } from '@evo/project-phlebas-coop/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { handleApi } from './api.ts';
import { catalogEntry, type Catalog } from './catalog.ts';
import { sendText } from './files.ts';
import type { Frontend } from './frontend.ts';
import { isPageRoute, renderShell, shellReader } from './pages.ts';

export type Connection = { send(message: ServerMessage): void };
export type PhlebasConnection = { send(message: PhlebasServerMessage): void };

export type LobbyLike = {
  receive(conn: Connection, raw: string): void;
  disconnect(conn: Connection): void;
  tables(): LobbyTable[];
};

export type PhlebasLobbyLike = {
  receive(conn: PhlebasConnection, raw: string): void;
  disconnect(conn: PhlebasConnection): void;
};

export type AppOptions = {
  shellFile: string;
  cacheShell: boolean;
  // Vite's HMR websocket upgrades on '/' with its own subprotocol; in dev those are its to handle.
  hmr: boolean;
  frontend: Frontend;
  lobby: LobbyLike;
  phlebasLobby: PhlebasLobbyLike;
  catalog: () => Catalog;
  ideasWebhookUrl: string | undefined;
};

const MAX_FRAME_BYTES = 64 * 1024;
const GAME_PATH = /^\/games\/([a-z0-9-]+)(?:\/(.*))?$/;
// Project Phlebas Co-op's ws lives under its own game path, not bare /ws like Alchemy
// Brawl — the day a third multiplayer game joins, each one gets a path here rather than
// every game racing for the one bare /ws.
const PHLEBAS_WS_PATH = '/games/project-phlebas-coop/ws';

const VITE_PROTOCOLS = ['vite-hmr', 'vite-ping'];

function attach(socket: WebSocket, lobby: LobbyLike): void {
  const conn: Connection = {
    send(message) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
  };
  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      lobby.receive(conn, data.toString());
    }
  });
  // ws emits 'error' on a bad frame and closes the socket; without a listener Node would rethrow it.
  socket.on('error', () => socket.terminate());
  socket.on('close', () => lobby.disconnect(conn));
}

function attachPhlebas(socket: WebSocket, lobby: PhlebasLobbyLike): void {
  const conn: PhlebasConnection = {
    send(message) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
  };
  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      lobby.receive(conn, data.toString());
    }
  });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => lobby.disconnect(conn));
}

export function createApp(options: AppOptions): Server {
  const shell = shellReader(options.shellFile, options.cacheShell);

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    if (isPageRoute(pathname)) {
      sendText(res, 200, renderShell(shell(), options.catalog().games.map(catalogEntry)), 'text/html; charset=utf-8');
      return;
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, {
        catalog: options.catalog(),
        tables: () => options.lobby.tables(),
        ideasWebhookUrl: options.ideasWebhookUrl,
      });
      return;
    }
    const game = GAME_PATH.exec(pathname);
    if (game !== null) {
      const id = game[1] ?? '';
      const subpath = game[2];
      const folder = options.catalog().games.find((entry) => entry.id === id);
      if (folder === undefined) {
        sendText(res, 404, 'not found');
        return;
      }
      if (subpath === undefined) {
        // Relative urls inside the page resolve against /games/<id>/, never /games/.
        res.writeHead(302, { location: `${pathname}/${url.search}` });
        res.end();
        return;
      }
      if (await options.frontend.serveGame(req, res, folder, subpath)) {
        return;
      }
      sendText(res, 404, 'not found');
      return;
    }
    if (await options.frontend.serveOther(req, res)) {
      return;
    }
    sendText(res, 404, 'not found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) {
        sendText(res, 500, 'internal error');
      } else {
        res.end();
      }
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const phlebasWss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => attach(ws, options.lobby));
      return;
    }
    if (pathname === PHLEBAS_WS_PATH) {
      phlebasWss.handleUpgrade(req, socket, head, (ws) => attachPhlebas(ws, options.phlebasLobby));
      return;
    }
    const protocol = req.headers['sec-websocket-protocol'] ?? '';
    if (!(options.hmr && pathname === '/' && VITE_PROTOCOLS.includes(protocol))) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    }
  });
  server.on('close', () => {
    wss.close();
    phlebasWss.close();
  });
  return server;
}
