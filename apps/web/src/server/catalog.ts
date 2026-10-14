import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseManifest, type Manifest } from '@evo/protocol';

// A game page is a folder with a manifest.json: either apps/web/games/<id>/ (folders starting
// with "_" are templates, not games) or apps/<id>/client/ for a game with its own server.
export type GameFolder = { id: string; dir: string; rel: string; manifest: Manifest };

export type CatalogError = { rel: string; reason: string };

export type Catalog = { games: GameFolder[]; errors: CatalogError[] };

function subdirs(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return { ok: true, value };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function load(repo: string, rel: string, expectedId: string, into: Catalog): void {
  const dir = resolve(repo, rel);
  const file = resolve(dir, 'manifest.json');
  if (!existsSync(file)) {
    return;
  }
  const json = readJson(file);
  if (!json.ok) {
    into.errors.push({ rel, reason: json.reason });
    return;
  }
  const parsed = parseManifest(json.value);
  if (!parsed.ok) {
    into.errors.push({ rel, reason: parsed.reason });
    return;
  }
  const manifest = parsed.value;
  if (manifest.id !== expectedId) {
    into.errors.push({ rel, reason: `id "${manifest.id}" does not match folder "${expectedId}"` });
    return;
  }
  for (const field of ['entry', 'cover'] as const) {
    if (!existsSync(resolve(dir, manifest[field]))) {
      into.errors.push({ rel, reason: `${field} "${manifest[field]}" is missing` });
      return;
    }
  }
  if (into.games.some((game) => game.id === manifest.id)) {
    into.errors.push({ rel, reason: `duplicate id "${manifest.id}"` });
    return;
  }
  into.games.push({ id: manifest.id, dir, rel, manifest });
}

export function scanGames(repo: string): Catalog {
  const catalog: Catalog = { games: [], errors: [] };
  for (const id of subdirs(resolve(repo, 'apps/web/games'))) {
    if (!id.startsWith('_')) {
      load(repo, `apps/web/games/${id}`, id, catalog);
    }
  }
  for (const id of subdirs(resolve(repo, 'apps'))) {
    if (id !== 'web') {
      load(repo, `apps/${id}/client`, id, catalog);
    }
  }
  return catalog;
}

// What the pages and /api/games see: urls on this server, never folders.
export type CatalogEntry = {
  id: string;
  title: string;
  description: string;
  version: string;
  core: Manifest['core'] | null;
  entryUrl: string;
  coverUrl: string;
  rel: string;
};

export function catalogEntry(game: GameFolder): CatalogEntry {
  return {
    id: game.id,
    title: game.manifest.title,
    description: game.manifest.description,
    version: game.manifest.version,
    core: game.manifest.core ?? null,
    entryUrl: `/games/${game.id}/`,
    coverUrl: `/games/${game.id}/${game.manifest.cover}`,
    rel: game.rel,
  };
}
