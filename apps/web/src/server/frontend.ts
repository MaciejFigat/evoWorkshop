import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { ViteDevServer } from 'vite';
import type { GameFolder } from './catalog.ts';
import { safeJoin, sendFile, sendText } from './files.ts';

// true = the response was handled; false = nothing matched, the caller answers 404.
export type Frontend = {
  serveGame(req: IncomingMessage, res: ServerResponse, game: GameFolder, subpath: string): Promise<boolean>;
  serveOther(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
};

function isEntry(game: GameFolder, subpath: string): boolean {
  return subpath === '' || subpath === 'index.html' || subpath === game.manifest.entry;
}

// Connect ends the response itself when a middleware handles the request and calls next otherwise.
function runMiddlewares(vite: ViteDevServer, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return new Promise((done) => {
    res.once('finish', () => done(true));
    res.once('close', () => done(true));
    vite.middlewares(req, res, () => done(false));
  });
}

export function viteFrontend(vite: ViteDevServer): Frontend {
  return {
    async serveGame(req, res, game, subpath) {
      if (isEntry(game, subpath)) {
        const entry = game.manifest.entry;
        const url = `/${game.rel}/${entry}`;
        const html = readFileSync(resolve(game.dir, entry), 'utf8');
        const transformed = await vite.transformIndexHtml(url, html, req.url);
        sendText(res, 200, transformed, 'text/html; charset=utf-8');
        return true;
      }
      req.url = `/${game.rel}/${subpath}`;
      return runMiddlewares(vite, req, res);
    },
    serveOther(req, res) {
      return runMiddlewares(vite, req, res);
    },
  };
}

export function distFrontend(distDir: string): Frontend {
  return {
    async serveGame(_req, res, game, subpath) {
      const wanted = isEntry(game, subpath) ? game.manifest.entry : subpath;
      const built = safeJoin(resolve(distDir, game.rel), wanted);
      if (built === null) {
        return false;
      }
      if (existsSync(built)) {
        await sendFile(res, built);
        return true;
      }
      // Covers and manifests are not build inputs, so they come straight from the source folder.
      const source = safeJoin(game.dir, wanted);
      if (source === null) {
        return false;
      }
      await sendFile(res, source);
      return true;
    },
    async serveOther(req, res) {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (!pathname.startsWith('/assets/')) {
        return false;
      }
      const file = safeJoin(resolve(distDir, 'assets'), pathname.slice('/assets/'.length));
      if (file === null) {
        return false;
      }
      await sendFile(res, file);
      return true;
    },
  };
}
