import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExternalGames, manifestUrlFor, resolveGame, resolveLocalGames } from './registry';

const base = 'http://localhost:5180/';

describe('url resolution', () => {
  it('builds the manifest url with or without a trailing slash', () => {
    expect(manifestUrlFor('/games/d20/', base)).toBe('http://localhost:5180/games/d20/manifest.json');
    expect(manifestUrlFor('/games/d20', base)).toBe('http://localhost:5180/games/d20/manifest.json');
    expect(manifestUrlFor('games/mines/', base)).toBe('http://localhost:5180/games/mines/manifest.json');
  });

  it('resolves entry and cover relative to the manifest and reports the game origin', () => {
    const entry = resolveGame(
      {
        id: 'd20',
        version: '0.1.0',
        title: 'd20',
        description: '',
        cover: 'cover.svg',
        entry: 'index.html',
      },
      'http://localhost:5180/games/d20/manifest.json',
    );
    expect(entry.entryUrl).toBe('http://localhost:5180/games/d20/index.html');
    expect(entry.coverUrl).toBe('http://localhost:5180/games/d20/cover.svg');
    expect(entry.origin).toBe('http://localhost:5180');
  });

  it('keeps an absolute entry on another origin', () => {
    const entry = resolveGame(
      {
        id: 'ext',
        version: '1.0.0',
        title: 'ext',
        description: '',
        cover: 'cover.png',
        entry: 'http://localhost:5181/play/',
      },
      'http://localhost:5181/manifest.json',
    );
    expect(entry.entryUrl).toBe('http://localhost:5181/play/');
    expect(entry.origin).toBe('http://localhost:5181');
  });
});

describe('resolveLocalGames', () => {
  const manifest = {
    id: 'd20',
    version: '0.1.0',
    title: 'd20',
    description: '',
    cover: 'cover.svg',
    entry: 'index.html',
  };

  it('resolves a folder game under /games/<dir>/ and prefers the bundled cover url', () => {
    const result = resolveLocalGames(
      [{ dir: 'd20', manifest, coverUrl: '/assets/cover-abc123.svg' }],
      base,
    );
    expect(result.errors).toEqual([]);
    expect(result.games[0]?.entryUrl).toBe('http://localhost:5180/games/d20/index.html');
    expect(result.games[0]?.coverUrl).toBe('http://localhost:5180/assets/cover-abc123.svg');
    expect(result.games[0]?.origin).toBe('http://localhost:5180');
  });

  it('falls back to the cover next to the manifest when nothing was bundled', () => {
    const result = resolveLocalGames([{ dir: 'd20', manifest, coverUrl: undefined }], base);
    expect(result.games[0]?.coverUrl).toBe('http://localhost:5180/games/d20/cover.svg');
  });

  it('rejects an invalid manifest and an id that does not match its folder', () => {
    const result = resolveLocalGames(
      [
        { dir: 'broken', manifest: { id: 'broken' }, coverUrl: undefined },
        { dir: 'other', manifest, coverUrl: undefined },
      ],
      base,
    );
    expect(result.games).toEqual([]);
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid_manifest', 'invalid_manifest']);
    expect(result.errors[1]?.detail).toContain('does not match folder');
  });
});

describe('loadExternalGames', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads valid manifests and reports broken ones as typed errors', async () => {
    const files = new Map<string, unknown>([
      [
        'http://localhost:5181/d20/manifest.json',
        { id: 'd20', version: '0.1.0', title: 'd20', description: '', cover: 'cover.svg', entry: 'index.html' },
      ],
      ['http://localhost:5181/broken/manifest.json', { id: 'broken', title: 'no entry' }],
    ]);
    vi.stubGlobal('fetch', (input: string | URL | Request) => {
      const url = String(input);
      const body = files.get(url);
      return Promise.resolve(
        body === undefined
          ? new Response('not found', { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 }),
      );
    });

    const result = await loadExternalGames(
      { games: ['http://localhost:5181/d20/', 'http://localhost:5181/missing/', 'http://localhost:5181/broken/'] },
      'games.external.json',
      base,
    );

    expect(result.games.map((g) => g.manifest.id)).toEqual(['d20']);
    expect(result.games[0]?.origin).toBe('http://localhost:5181');
    expect(result.errors.map((e) => e.kind)).toEqual(['fetch_failed', 'invalid_manifest']);
    expect(result.errors[0]?.url).toBe('http://localhost:5181/missing/manifest.json');
  });

  it('reports a malformed registry without fetching anything', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await loadExternalGames({ games: 'nope' }, 'games.external.json', base);
    expect(result.games).toEqual([]);
    expect(result.errors[0]?.kind).toBe('invalid_registry');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a network failure per manifest', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    const result = await loadExternalGames({ games: ['http://localhost:5181/x/'] }, 'games.external.json', base);
    expect(result.errors).toEqual([
      { kind: 'fetch_failed', url: 'http://localhost:5181/x/manifest.json', detail: 'offline' },
    ]);
  });
});
