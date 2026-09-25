import type { LocalGame } from './registry';

// The registry is the folder tree: every games/<id>/manifest.json is a game, the template is not.
const manifests = import.meta.glob(['../games/*/manifest.json', '!../games/_*/**'], {
  eager: true,
  import: 'default',
});

const covers = import.meta.glob<string>('../games/*/*.{svg,png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const DIR = /^\.\.\/games\/([^/]+)\//;

function dirOf(modulePath: string): string | undefined {
  return DIR.exec(modulePath)?.[1];
}

export function localGames(): LocalGame[] {
  const out: LocalGame[] = [];
  for (const [path, manifest] of Object.entries(manifests)) {
    const dir = dirOf(path);
    if (dir === undefined) {
      continue;
    }
    const cover = coverOf(manifest);
    const coverUrl = cover === undefined ? undefined : covers[`../games/${dir}/${cover}`];
    out.push({ dir, manifest, coverUrl });
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

function coverOf(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('cover' in manifest)) {
    return undefined;
  }
  const cover = manifest.cover;
  return typeof cover === 'string' ? cover : undefined;
}
