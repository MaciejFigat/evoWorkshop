import { parseManifest, parseRegistry, type Manifest } from '@evo/protocol';

export type GameEntry = {
  manifest: Manifest;
  manifestUrl: string;
  entryUrl: string;
  coverUrl: string;
  origin: string;
};

export type RegistryError =
  | { kind: 'fetch_failed'; url: string; detail: string }
  | { kind: 'invalid_json'; url: string; detail: string }
  | { kind: 'invalid_registry'; url: string; detail: string }
  | { kind: 'invalid_manifest'; url: string; detail: string };

export type LoadResult = { games: GameEntry[]; errors: RegistryError[] };

export function manifestUrlFor(gameBase: string, baseHref: string): string {
  const withSlash = gameBase.endsWith('/') ? gameBase : `${gameBase}/`;
  return new URL('manifest.json', new URL(withSlash, baseHref)).href;
}

export function resolveGame(manifest: Manifest, manifestUrl: string): GameEntry {
  const entry = new URL(manifest.entry, manifestUrl);
  const cover = new URL(manifest.cover, manifestUrl);
  return {
    manifest,
    manifestUrl,
    entryUrl: entry.href,
    coverUrl: cover.href,
    origin: entry.origin,
  };
}

export type LocalGame = { dir: string; manifest: unknown; coverUrl: string | undefined };

export function resolveLocalGames(games: LocalGame[], baseHref: string): LoadResult {
  const result: LoadResult = { games: [], errors: [] };
  for (const game of games) {
    const manifestUrl = manifestUrlFor(`games/${game.dir}/`, baseHref);
    const parsed = parseManifest(game.manifest);
    if (!parsed.ok) {
      result.errors.push({ kind: 'invalid_manifest', url: manifestUrl, detail: parsed.reason });
      continue;
    }
    if (parsed.value.id !== game.dir) {
      result.errors.push({
        kind: 'invalid_manifest',
        url: manifestUrl,
        detail: `id "${parsed.value.id}" does not match folder "${game.dir}"`,
      });
      continue;
    }
    const entry = resolveGame(parsed.value, manifestUrl);
    result.games.push(
      game.coverUrl === undefined ? entry : { ...entry, coverUrl: new URL(game.coverUrl, baseHref).href },
    );
  }
  return result;
}

export async function loadExternalGames(
  registry: unknown,
  registryUrl: string,
  baseHref: string,
): Promise<LoadResult> {
  const parsed = parseRegistry(registry);
  if (!parsed.ok) {
    return {
      games: [],
      errors: [{ kind: 'invalid_registry', url: registryUrl, detail: parsed.reason }],
    };
  }

  const loaded = await Promise.all(
    parsed.value.games.map((base) => loadOne(manifestUrlFor(base, baseHref))),
  );
  const games: GameEntry[] = [];
  const errors: RegistryError[] = [];
  for (const item of loaded) {
    if (item.ok) {
      games.push(item.value);
    } else {
      errors.push(item.error);
    }
  }
  return { games, errors };
}

type LoadOne = { ok: true; value: GameEntry } | { ok: false; error: RegistryError };

async function loadOne(manifestUrl: string): Promise<LoadOne> {
  const fetched = await fetchJson(manifestUrl);
  if (!fetched.ok) {
    return fetched;
  }
  const manifest = parseManifest(fetched.body);
  if (!manifest.ok) {
    return {
      ok: false,
      error: { kind: 'invalid_manifest', url: manifestUrl, detail: manifest.reason },
    };
  }
  return { ok: true, value: resolveGame(manifest.value, manifestUrl) };
}

type FetchJson = { ok: true; body: unknown } | { ok: false; error: RegistryError };

async function fetchJson(url: string): Promise<FetchJson> {
  const response = await fetchOrError(url);
  if (!(response instanceof Response)) {
    return { ok: false, error: response };
  }
  if (!response.ok) {
    return { ok: false, error: { kind: 'fetch_failed', url, detail: `HTTP ${response.status}` } };
  }
  try {
    const body: unknown = await response.json();
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: { kind: 'invalid_json', url, detail: describe(error) } };
  }
}

async function fetchOrError(url: string): Promise<Response | RegistryError> {
  try {
    return await fetch(url);
  } catch (error) {
    return { kind: 'fetch_failed', url, detail: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
