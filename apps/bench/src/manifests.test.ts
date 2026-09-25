import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseManifest } from '@evo/protocol';
import { describe, expect, it } from 'vitest';
import { localGames } from './localGames';

const gamesDir = resolve(import.meta.dirname, '../games');

describe('games folder', () => {
  const games = localGames();

  it('has at least one game', () => {
    expect(games.length).toBeGreaterThan(0);
  });

  it.each(games.map((g) => [g.dir, g] as const))('%s has a valid manifest', (dir, game) => {
    const parsed = parseManifest(game.manifest);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.id).toBe(dir);
    expect(existsSync(resolve(gamesDir, dir, parsed.value.entry))).toBe(true);
    expect(existsSync(resolve(gamesDir, dir, parsed.value.cover))).toBe(true);
    expect(game.coverUrl).toBeDefined();
  });

  it('has unique ids', () => {
    const ids = games.map((g) => g.dir);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
