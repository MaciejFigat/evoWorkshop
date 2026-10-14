import { readFileSync } from 'node:fs';
import type { CatalogEntry } from './catalog.ts';

export const PAGE_ROUTES = ['/', '/library', '/game/:id', '/game/:id/:tab', '/stats', '/stats/board', '/add', '/my'] as const;

function matches(pattern: string, pathname: string): boolean {
  const want = pattern.split('/');
  const have = pathname.split('/');
  return want.length === have.length && want.every((segment, i) => (segment.startsWith(':') ? have[i] !== '' : segment === have[i]));
}

export function isPageRoute(pathname: string): boolean {
  const bare = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return PAGE_ROUTES.some((pattern) => matches(pattern, bare));
}

// Dev reads the file on every request so edits show on reload; prod reads it once.
export function shellReader(file: string, cache: boolean): () => string {
  let cached: string | null = null;
  return () => {
    if (cache && cached !== null) {
      return cached;
    }
    cached = readFileSync(file, 'utf8');
    return cached;
  };
}

// The catalog goes in before the page's own scripts so they can read window.EVO_CATALOG on load.
// "<" is escaped so a "</script>" inside a description cannot close the tag.
export function renderShell(html: string, entries: CatalogEntry[]): string {
  const json = JSON.stringify(entries).replaceAll('<', '\\u003c');
  const script = `<script>window.EVO_CATALOG = ${json};</script>\n`;
  const body = html.indexOf('<body');
  const firstScript = body === -1 ? -1 : html.indexOf('<script', body);
  if (firstScript !== -1) {
    return html.slice(0, firstScript) + script + html.slice(firstScript);
  }
  const bodyEnd = html.lastIndexOf('</body>');
  return bodyEnd === -1 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}
