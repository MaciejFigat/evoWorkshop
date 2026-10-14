import type { Card } from '@evo/alchemy-brawl/engine';

// Vite rewrites each path to a served url (dev: /games/alchemy-brawl/assets/..., prod: hashed in dist/assets).
const files = import.meta.glob('../assets/**/*.svg', { eager: true, query: '?url', import: 'default' });

const INLINE_PREFIX = 'data:image/svg+xml,';

// Vite inlines files under its size limit as URL-encoded data URIs; Phaser's loader decodes only base64 ones.
function loadable(url: string): string {
  if (!url.startsWith(INLINE_PREFIX)) {
    return url;
  }
  const bytes = new TextEncoder().encode(decodeURIComponent(url.slice(INLINE_PREFIX.length)));
  return `data:image/svg+xml;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
}

// Keys are repository paths relative to the assets folder without the extension: 'Cards/fire-01', 'HUD/table'.
export const ASSETS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/assets\//, '').replace(/\.svg$/, ''), loadable(url)]),
);

export const CARD_SLOT = 'HUD/card-slot';
export const TABLE = 'HUD/table';
export const SEAT_FRAME = 'HUD/seat-frame';
export const AVATAR = 'HUD/avatar-default';
export const NAMEPLATE = 'HUD/nameplate';
export const COUNT_BADGE = 'HUD/count-badge';
export const TURN_BANNER = 'HUD/turn-banner';
export const DECK_STACK = 'HUD/deck-stack';

export function cardKey(card: Card): string {
  return `Cards/${card.element}-${String(card.power).padStart(2, '0')}`;
}
