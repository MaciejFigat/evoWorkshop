import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { LobbyTable } from '@evo/brawl-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp, type Connection, type LobbyLike, type PhlebasConnection, type PhlebasLobbyLike } from './app.ts';
import { scanGames, type CatalogEntry } from './catalog.ts';
import { sendText } from './files.ts';
import type { Frontend } from './frontend.ts';
import { isPageRoute, renderShell } from './pages.ts';

const repo = resolve(import.meta.dirname, '../../../..');

const SHELL = `<!doctype html>
<html><head><title>EVO Playground</title><script>window.HEAD = 1;</script></head>
<body><div id="app"></div>
<script>window.PAGE = window.EVO_CATALOG;</script>
</body></html>`;

const TABLES: LobbyTable[] = [{ code: 'ABCD', players: 2, maxPlayers: 6 }];

type StubLobby = LobbyLike & { received: string[]; disconnected: Connection[] };

function stubLobby(): StubLobby {
  const received: string[] = [];
  const disconnected: Connection[] = [];
  return {
    received,
    disconnected,
    receive: (_conn, raw) => {
      received.push(raw);
    },
    disconnect: (conn) => {
      disconnected.push(conn);
    },
    tables: () => TABLES,
  };
}

type StubPhlebasLobby = PhlebasLobbyLike & { received: string[]; disconnected: PhlebasConnection[] };

function stubPhlebasLobby(): StubPhlebasLobby {
  const received: string[] = [];
  const disconnected: PhlebasConnection[] = [];
  return {
    received,
    disconnected,
    receive: (_conn, raw) => {
      received.push(raw);
    },
    disconnect: (conn) => {
      disconnected.push(conn);
    },
  };
}

const stubFrontend: Frontend = {
  serveGame: (_req, res, game, subpath) => {
    sendText(res, 200, `game:${game.id}:${subpath}`);
    return Promise.resolve(true);
  },
  serveOther: () => Promise.resolve(false),
};

function wait<T>(what: (done: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  return new Promise(what);
}

describe('createApp', () => {
  let dir = '';
  let base = '';
  let lobby: StubLobby;
  let phlebasLobby: StubPhlebasLobby;
  let server: ReturnType<typeof createApp>;

  beforeEach(async () => {
    dir = mkdtempSync(resolve(tmpdir(), 'evo-app-'));
    const shellFile = resolve(dir, 'shell.html');
    writeFileSync(shellFile, SHELL);
    lobby = stubLobby();
    phlebasLobby = stubPhlebasLobby();
    const catalog = scanGames(repo);
    server = createApp({ shellFile, cacheShell: true, hmr: false, frontend: stubFrontend, lobby, phlebasLobby, catalog: () => catalog });
    await wait<void>((done) => server.listen(0, '127.0.0.1', done));
    const address: AddressInfo | string | null = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('no address');
    }
    base = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await wait<void>((done) => server.close(() => done()));
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(['/', '/library', '/game/d20', '/game/d20/telemetry', '/stats', '/stats/board', '/add', '/my'])(
    'serves the shell with the catalog on %s',
    async (path) => {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      const html = await res.text();
      expect(html).toContain('window.EVO_CATALOG');
      expect(html).toContain('"entryUrl":"/games/d20/"');
      expect(html.indexOf('window.EVO_CATALOG')).toBeLessThan(html.indexOf('window.PAGE'));
      expect(html.indexOf('window.EVO_CATALOG')).toBeGreaterThan(html.indexOf('window.HEAD'));
    },
  );

  it('lists games with urls on /api/games', async () => {
    const res = await fetch(`${base}/api/games`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body: unknown = await res.json();
    expect(body).toMatchObject({ errors: [] });
    const games = (body as { games: CatalogEntry[] }).games;
    expect(games.find((game) => game.id === 'd20')).toMatchObject({
      entryUrl: '/games/d20/',
      coverUrl: '/games/d20/cover.svg',
      core: 'draw',
    });
    expect(games.find((game) => game.id === 'alchemy-brawl')).toMatchObject({
      entryUrl: '/games/alchemy-brawl/',
      coverUrl: '/games/alchemy-brawl/cover.svg',
      core: null,
      rel: 'apps/alchemy-brawl/client',
    });
  });

  it('answers one game on /api/games/:id and 404 json for an unknown one', async () => {
    const found = await fetch(`${base}/api/games/d20`);
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ id: 'd20', title: 'Lightning d20' });
    const missing = await fetch(`${base}/api/games/nope`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await missing.json()).toEqual({ error: 'not_found' });
    const other = await fetch(`${base}/api/whatever`);
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: 'not_found' });
  });

  it('answers the lobby tables on /api/tables', async () => {
    const res = await fetch(`${base}/api/tables`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tables: TABLES });
  });

  it('rejects non-GET on /api with 405', async () => {
    const res = await fetch(`${base}/api/games`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(405);
  });

  it('hands /games/<id>/<subpath> to the frontend', async () => {
    const page = await fetch(`${base}/games/d20/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('game:d20:');
    const cover = await fetch(`${base}/games/d20/cover.svg`);
    expect(await cover.text()).toBe('game:d20:cover.svg');
    const nested = await fetch(`${base}/games/alchemy-brawl/src/main.tsx`);
    expect(await nested.text()).toBe('game:alchemy-brawl:src/main.tsx');
  });

  it('redirects /games/<id> to the trailing slash', async () => {
    const res = await fetch(`${base}/games/d20?seed=7`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/games/d20/?seed=7');
  });

  it('answers 404 for an unknown game and an unknown path', async () => {
    const game = await fetch(`${base}/games/nope/`);
    expect(game.status).toBe(404);
    const path = await fetch(`${base}/nope`);
    expect(path.status).toBe(404);
    expect(path.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('passes /ws frames to the lobby as raw text and disconnects on close', async () => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    await wait<void>((done, fail) => {
      socket.once('open', done);
      socket.once('error', fail);
    });
    const hello = '{"type":"hello","token":"0123456789","name":"Ada"}';
    socket.send(hello);
    socket.send(Buffer.from([1, 2, 3]));
    await wait<void>((done) => {
      const poll = (): void => {
        if (lobby.received.length > 0) {
          done();
        } else {
          setTimeout(poll, 5);
        }
      };
      poll();
    });
    expect(lobby.received).toEqual([hello]);
    socket.close();
    await wait<void>((done) => {
      const poll = (): void => {
        if (lobby.disconnected.length > 0) {
          done();
        } else {
          setTimeout(poll, 5);
        }
      };
      poll();
    });
    expect(lobby.disconnected).toHaveLength(1);
  });

  it('routes /games/project-phlebas-coop/ws to the phlebas lobby only, independent of /ws', async () => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/games/project-phlebas-coop/ws`);
    await wait<void>((done, fail) => {
      socket.once('open', done);
      socket.once('error', fail);
    });
    const hello = '{"type":"hello","name":"Ada"}';
    socket.send(hello);
    await wait<void>((done) => {
      const poll = (): void => {
        if (phlebasLobby.received.length > 0) {
          done();
        } else {
          setTimeout(poll, 5);
        }
      };
      poll();
    });
    expect(phlebasLobby.received).toEqual([hello]);
    expect(lobby.received).toEqual([]);
    socket.close();
    await wait<void>((done) => {
      const poll = (): void => {
        if (phlebasLobby.disconnected.length > 0) {
          done();
        } else {
          setTimeout(poll, 5);
        }
      };
      poll();
    });
    expect(phlebasLobby.disconnected).toHaveLength(1);
    expect(lobby.disconnected).toEqual([]);
  });

  it('refuses an upgrade on another path without touching the lobby', async () => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/other`, { handshakeTimeout: 2000 });
    const error = await wait<Error>((done) => {
      socket.once('error', done);
    });
    expect(error.message).toMatch(/404/);
    expect(lobby.received).toEqual([]);
    expect(lobby.disconnected).toEqual([]);
    const still = await fetch(`${base}/api/tables`);
    expect(still.status).toBe(200);
  });
});

describe('isPageRoute', () => {
  it('matches the shell routes and nothing else', () => {
    for (const path of ['/', '/library', '/game/d20', '/game/d20/stats', '/stats', '/stats/board', '/add', '/my']) {
      expect(isPageRoute(path), path).toBe(true);
    }
    for (const path of ['/nope', '/game', '/game/', '/game/d20/a/b', '/api/games', '/games/d20/', '/library/x']) {
      expect(isPageRoute(path), path).toBe(false);
    }
  });
});

describe('renderShell', () => {
  const entry: CatalogEntry = {
    id: 'x',
    title: 'X',
    description: 'has </script><b>tag</b> inside',
    version: '1',
    core: null,
    entryUrl: '/games/x/',
    coverUrl: '/games/x/cover.svg',
    rel: 'apps/web/games/x',
  };

  it('injects before the first script in the body', () => {
    const html = renderShell(SHELL, [entry]);
    const at = html.indexOf('<script>window.EVO_CATALOG');
    expect(at).toBeGreaterThan(html.indexOf('<body'));
    expect(at).toBeLessThan(html.indexOf('<script>window.PAGE'));
    expect(html.indexOf('window.HEAD')).toBeLessThan(at);
  });

  it('falls back to the end of the body when the body has no script', () => {
    const html = renderShell('<html><head><script>1</script></head><body><p>hi</p></body></html>', [entry]);
    expect(html).toContain('<p>hi</p><script>window.EVO_CATALOG');
    expect(html.endsWith('</script>\n</body></html>')).toBe(true);
  });

  it('escapes < so a description cannot close the script tag', () => {
    const html = renderShell(SHELL, [entry]);
    const script = html.slice(html.indexOf('<script>window.EVO_CATALOG'), html.indexOf('<script>window.PAGE'));
    expect(script).not.toContain('</script><b>');
    expect(script).toContain('\\u003c/script>');
    const json = script.slice(script.indexOf('= ') + 2, script.indexOf(';</script>'));
    expect(JSON.parse(json)).toEqual([entry]);
  });
});
