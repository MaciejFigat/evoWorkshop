import { resolve } from 'node:path';
import { DEFAULT_TABLE } from '@evo/brawl-shared';
import { Lobby } from '@evo/brawl-server';
import { Lobby as PhlebasLobby } from '@evo/project-phlebas-coop-logic';
import { createServer } from 'vite';
import { createApp } from './app.ts';
import { scanGames, type Catalog } from './catalog.ts';
import { distFrontend, viteFrontend, type Frontend } from './frontend.ts';

const PORT = Number(process.env.PORT ?? 5180);
const repo = resolve(import.meta.dirname, '../../../..');
const mode = process.env.NODE_ENV === 'production' ? 'dist' : 'dev';
const dev = mode === 'dev';

// In dev the folder tree is rescanned per request so a new game shows up without a restart.
const scanned: Catalog = scanGames(repo);
const catalog = dev ? () => scanGames(repo) : () => scanned;

const lobby = new Lobby(DEFAULT_TABLE);
const phlebasLobby = new PhlebasLobby();

// The http server exists before Vite so its HMR websocket can share the same listener.
let frontend: Frontend = distFrontend(resolve(repo, 'apps/web/dist'));
const server = createApp({
  shellFile: resolve(repo, 'apps/web/pages/shell.html'),
  cacheShell: !dev,
  hmr: dev,
  frontend: {
    serveGame: (req, res, game, subpath) => frontend.serveGame(req, res, game, subpath),
    serveOther: (req, res) => frontend.serveOther(req, res),
  },
  lobby,
  phlebasLobby,
  catalog,
});

if (dev) {
  const vite = await createServer({
    configFile: resolve(repo, 'apps/web/vite.config.ts'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  frontend = viteFrontend(vite);
}

server.listen(PORT, () => {
  console.log(`EVO Playground on http://localhost:${PORT} (${mode})`);
});
