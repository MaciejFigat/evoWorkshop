import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, parseGameMessage, parseManifest, parseRegistry } from './index';

const validManifest = {
  id: 'd20',
  version: '0.1.0',
  title: 'Lightning d20',
  description: 'one roll',
  cover: 'cover.svg',
  entry: 'index.html',
  core: 'draw',
};

describe('manifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseManifest(validManifest)).toEqual({ ok: true, value: validManifest });
  });

  it('accepts a manifest without core', () => {
    const { core, ...rest } = validManifest;
    expect(core).toBe('draw');
    expect(parseManifest(rest)).toEqual({ ok: true, value: rest });
  });

  it('rejects an unknown core', () => {
    const result = parseManifest({ ...validManifest, core: 'platformer' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('core');
    }
  });

  it('rejects an id with unsafe characters', () => {
    expect(parseManifest({ ...validManifest, id: '../etc' }).ok).toBe(false);
  });

  it('rejects a manifest without entry', () => {
    const { entry, ...rest } = validManifest;
    expect(entry).toBe('index.html');
    const result = parseManifest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('entry');
    }
  });
});

describe('registry', () => {
  it('accepts a list of game base urls', () => {
    expect(parseRegistry({ games: ['/games/d20/', 'http://localhost:5181/'] }).ok).toBe(true);
  });

  it('rejects a registry without games', () => {
    expect(parseRegistry({}).ok).toBe(false);
  });
});

describe('game messages', () => {
  it('accepts ready with the current protocol', () => {
    expect(parseGameMessage({ type: 'game:ready', protocol: PROTOCOL_VERSION })).toEqual({
      ok: true,
      value: { type: 'game:ready', protocol: PROTOCOL_VERSION },
    });
  });

  it('rejects ready with another protocol version', () => {
    expect(parseGameMessage({ type: 'game:ready', protocol: 99 }).ok).toBe(false);
  });

  it('accepts an event with arbitrary data', () => {
    const data = { roll: 20, bets: [{ n: 20, amount: 10 }] };
    expect(parseGameMessage({ type: 'game:event', name: 'round', data })).toEqual({
      ok: true,
      value: { type: 'game:event', name: 'round', data },
    });
  });

  it('rejects an event without a name', () => {
    expect(parseGameMessage({ type: 'game:event' }).ok).toBe(false);
  });

  it('rejects unknown message types and non-objects', () => {
    expect(parseGameMessage({ type: 'host:init' }).ok).toBe(false);
    expect(parseGameMessage('hello').ok).toBe(false);
    expect(parseGameMessage(null).ok).toBe(false);
  });
});
