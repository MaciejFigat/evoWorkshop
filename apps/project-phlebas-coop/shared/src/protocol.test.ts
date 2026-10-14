import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from './protocol.ts';

const SNAPSHOT = {
  phase: 'play' as const,
  paused: false,
  eraIndex: 0,
  score: 10,
  lives: 3,
  playerXs: [100, 200] as [number, number],
  bullets: [{ x: 1, y: 2, vx: 0, vy: -1, kind: 'relay' as const, originY: 2, split: false }],
  enemies: [],
  beamCharges: [0, 0] as [number, number],
};

describe('parseClientMessage', () => {
  it('accepts a valid hello', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', name: 'Ada' }))).toEqual({
      ok: true,
      value: { type: 'hello', name: 'Ada' },
    });
  });

  it('rejects malformed JSON', () => {
    expect(parseClientMessage('not json').ok).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'nope' })).ok).toBe(false);
  });

  it('accepts create with no payload (always a 2-seat room)', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'create' }))).toEqual({ ok: true, value: { type: 'create' } });
  });

  it('accepts a valid input message', () => {
    const value = { type: 'input', keys: ['ArrowLeft', 'Space'] };
    expect(parseClientMessage(JSON.stringify(value))).toEqual({ ok: true, value });
  });

  it('accepts a valid snapshot message', () => {
    const value = { type: 'snapshot', payload: SNAPSHOT };
    expect(parseClientMessage(JSON.stringify(value))).toEqual({ ok: true, value });
  });

  it('rejects a snapshot with a malformed enemy', () => {
    const value = { type: 'snapshot', payload: { ...SNAPSHOT, enemies: [{ kind: 'not-a-kind' }] } };
    expect(parseClientMessage(JSON.stringify(value)).ok).toBe(false);
  });
});

describe('parseServerMessage', () => {
  it('accepts a valid room message', () => {
    const message = {
      type: 'room',
      code: 'ABCD',
      maxPlayers: 2,
      players: [{ id: '1', name: 'Ada', ready: false }],
      roundNo: 0,
      roundSeed: null,
      firstPlayerId: null,
      hostId: '1',
    };
    expect(parseServerMessage(JSON.stringify(message))).toEqual({ ok: true, value: message });
  });

  it('accepts a valid snapshot message', () => {
    const value = { type: 'snapshot', payload: SNAPSHOT };
    expect(parseServerMessage(JSON.stringify(value))).toEqual({ ok: true, value });
  });

  it('rejects an unknown error reason', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'error', reason: 'nope' })).ok).toBe(false);
  });
});
