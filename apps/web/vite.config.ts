import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { scanGames } from './src/server/catalog.ts';

// The Vite root is the repository, so a game page can live in apps/web/games/<id>/ or in
// apps/<id>/client/ and still be a build input; the server maps /games/<id>/ onto that folder.
const repo = resolve(import.meta.dirname, '../..');
const inputs = Object.fromEntries(scanGames(repo).games.map((game) => [game.rel, resolve(game.dir, game.manifest.entry)]));

export default defineConfig({
  root: repo,
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: inputs },
    // Phaser alone is about 1.6 MB minified; the warning would fire on every build.
    chunkSizeWarningLimit: 2000,
  },
  test: { environment: 'node', dir: resolve(import.meta.dirname, 'src'), include: ['**/*.test.ts'] },
});
