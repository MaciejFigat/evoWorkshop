import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LobbyTable } from '@evo/brawl-shared';
import { catalogEntry, type Catalog } from './catalog.ts';

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(res.req.method === 'HEAD' ? undefined : text);
}

export function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  catalog: Catalog,
  tables: () => LobbyTable[],
): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  if (pathname === '/api/games') {
    sendJson(res, 200, { games: catalog.games.map(catalogEntry), errors: catalog.errors });
    return;
  }
  if (pathname === '/api/tables') {
    sendJson(res, 200, { tables: tables() });
    return;
  }
  const game = /^\/api\/games\/([a-z0-9-]+)$/.exec(pathname);
  const id = game?.[1];
  if (id !== undefined) {
    const found = catalog.games.find((entry) => entry.id === id);
    if (found !== undefined) {
      sendJson(res, 200, catalogEntry(found));
      return;
    }
  }
  sendJson(res, 404, { error: 'not_found' });
}
