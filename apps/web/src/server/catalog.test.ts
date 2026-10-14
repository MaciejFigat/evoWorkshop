import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogEntry, scanGames } from './catalog.ts';

const repo = resolve(import.meta.dirname, '../../../..');

describe('scanGames on the repository', () => {
  const catalog = scanGames(repo);

  it('has no errors', () => {
    expect(catalog.errors).toEqual([]);
  });

  it('finds d20 and alchemy-brawl in their folders', () => {
    const rels = Object.fromEntries(catalog.games.map((game) => [game.id, game.rel]));
    expect(rels['d20']).toBe('games/d20');
    expect(rels['alchemy-brawl']).toBe('games/alchemy-brawl');
  });

  it('skips folders starting with an underscore', () => {
    expect(catalog.games.some((game) => game.id === '_template' || game.rel.includes('/_'))).toBe(false);
  });

  it('has unique ids', () => {
    const ids = catalog.games.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(catalog.games.map((game) => [game.id, game] as const))('%s has its entry and cover on disk', (_id, game) => {
    expect(existsSync(resolve(game.dir, game.manifest.entry))).toBe(true);
    expect(existsSync(resolve(game.dir, game.manifest.cover))).toBe(true);
  });

  it('maps d20 onto urls on this server', () => {
    const d20 = catalog.games.find((game) => game.id === 'd20');
    expect(d20).toBeDefined();
    if (d20 === undefined) {
      return;
    }
    expect(catalogEntry(d20)).toMatchObject({
      id: 'd20',
      core: 'draw',
      entryUrl: '/games/d20/',
      coverUrl: '/games/d20/cover.svg',
      rel: 'games/d20',
    });
  });
});

describe('scanGames on a broken tree', () => {
  let root = '';

  function game(id: string, manifest: string, files: string[]): void {
    const dir = resolve(root, 'games', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'manifest.json'), manifest);
    for (const file of files) {
      writeFileSync(resolve(dir, file), '');
    }
  }

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports a typed error per bad folder and keeps the good ones', () => {
    root = mkdtempSync(resolve(tmpdir(), 'evo-catalog-'));
    const good = { id: 'good', version: '1', title: 'Good', description: '', cover: 'cover.svg', entry: 'index.html' };
    game('good', JSON.stringify(good), ['index.html', 'cover.svg']);
    game('broken', '{ not json', ['index.html', 'cover.svg']);
    game('other', JSON.stringify({ ...good, id: 'mismatch' }), ['index.html', 'cover.svg']);
    game('nocover', JSON.stringify({ ...good, id: 'nocover' }), ['index.html']);
    game('_template', JSON.stringify({ ...good, id: '_template' }), ['index.html', 'cover.svg']);

    const catalog = scanGames(root);
    expect(catalog.games.map((entry) => entry.id)).toEqual(['good']);
    expect(catalog.errors).toHaveLength(3);
    expect(catalog.errors.map((error) => error.rel).sort()).toEqual([
      'games/broken',
      'games/nocover',
      'games/other',
    ]);
    const reasons = Object.fromEntries(catalog.errors.map((error) => [error.rel, error.reason]));
    expect(reasons['games/other']).toBe('id "mismatch" does not match folder "other"');
    expect(reasons['games/nocover']).toBe('cover "cover.svg" is missing');
    expect(reasons['games/broken']).toMatch(/JSON/);
  });
});
