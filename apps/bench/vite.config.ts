import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;
const gamesDir = resolve(root, 'games');

// Every games/<id>/index.html is its own page, so the iframe can load it in dev and after build.
// Folders starting with "_" (the template) are not games.
const gameInputs = Object.fromEntries(
  readdirSync(gamesDir, { withFileTypes: true })
    .filter((dir) => dir.isDirectory() && !dir.name.startsWith('_'))
    .map((dir) => resolve(gamesDir, dir.name, 'index.html'))
    .filter((html) => existsSync(html))
    .map((html) => [html.slice(root.length + 1, -'/index.html'.length), html]),
);

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    rollupOptions: {
      input: { main: resolve(root, 'index.html'), ...gameInputs },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
