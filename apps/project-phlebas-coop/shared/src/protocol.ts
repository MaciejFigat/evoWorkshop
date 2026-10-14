import { parseWith, type ParseResult } from '@evo/protocol';
import { z } from 'zod';

// Always a 2-seat room: this game is co-op for exactly two players, not a
// configurable lobby size.
export const ROOM_SIZE = 2;

// --- Project Phlebas game shapes, carried inside `snapshot` -----------------
// Mirrors apps/bench/games/project-phlebas/types.ts (Bullet/Enemy are already
// plain data there); kept here, not imported, since this app doesn't share a
// package with the single-player bench game.

const WEAPON_IDS = ['relay', 'pcbeam', 'quicksort', 'attention'] as const;
const WeaponIdSchema = z.enum(WEAPON_IDS);
export type WeaponId = (typeof WEAPON_IDS)[number];

const ENEMY_KINDS = ['byte', 'loop', 'bubble', 'hallucination', 'boss', 'bit'] as const;
const EnemyKindSchema = z.enum(ENEMY_KINDS);
export type EnemyKind = (typeof ENEMY_KINDS)[number];

const PHASES = ['play', 'boss', 'won', 'over'] as const;
const PhaseSchema = z.enum(PHASES);
export type Phase = (typeof PHASES)[number];

const BulletSchema = z.object({
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  kind: WeaponIdSchema,
  originY: z.number(),
  split: z.boolean(),
});
export type Bullet = z.infer<typeof BulletSchema>;

const EnemySchema = z.object({
  kind: EnemyKindSchema,
  x: z.number(),
  y: z.number(),
  hp: z.number(),
  r: z.number(),
  decoy: z.boolean(),
  angle: z.number(),
  centerX: z.number(),
  centerY: z.number(),
  vulnerable: z.boolean(),
  baseX: z.number(),
  t: z.number(),
  groupId: z.number(),
  bitValue: z.boolean(),
});
export type Enemy = z.infer<typeof EnemySchema>;

// Everything render()/updateHud() need to draw a frame — the host's full
// simulation state satisfies this shape too, so the same render() runs for
// both the host (from its own state) and the guest (from the latest
// received snapshot).
export const SnapshotSchema = z.object({
  phase: PhaseSchema,
  paused: z.boolean(),
  eraIndex: z.number().int(),
  score: z.number().int(),
  lives: z.number().int(),
  playerXs: z.tuple([z.number(), z.number()]),
  bullets: z.array(BulletSchema),
  enemies: z.array(EnemySchema),
  beamCharges: z.tuple([z.number(), z.number()]),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

// --- Room / lobby messages, same shape as the plain party/lobby template ---

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), name: z.string().trim().min(1).max(20) }),
  z.object({ type: z.literal('create') }),
  z.object({ type: z.literal('join'), code: z.string().min(1).max(8) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ready') }),
  // In-match messages, once both players are seated and ready. The server
  // never interprets these — it only relays them (see logic/src/lobby.ts).
  z.object({ type: z.literal('input'), keys: z.array(z.string()) }),
  z.object({ type: z.literal('snapshot'), payload: SnapshotSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

const PlayerInfoSchema = z.object({ id: z.string(), name: z.string(), ready: z.boolean() });
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

const SERVER_ERRORS = [
  'invalid_message',
  'not_identified',
  'already_seated',
  'not_seated',
  'no_such_room',
  'room_full',
  'not_host',
] as const;
export type ServerError = (typeof SERVER_ERRORS)[number];

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), playerId: z.string() }),
  z.object({
    type: z.literal('room'),
    code: z.string(),
    maxPlayers: z.number().int(),
    players: z.array(PlayerInfoSchema),
    roundNo: z.number().int(),
    roundSeed: z.number().int().nullable(),
    firstPlayerId: z.string().nullable(),
    hostId: z.string().nullable(),
  }),
  z.object({ type: z.literal('left') }),
  z.object({ type: z.literal('input'), keys: z.array(z.string()) }),
  z.object({ type: z.literal('snapshot'), payload: SnapshotSchema }),
  z.object({ type: z.literal('error'), reason: z.enum(SERVER_ERRORS) }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

function parseJson<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  return parseWith(schema, data);
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseJson(ClientMessageSchema, raw);
}

export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseJson(ServerMessageSchema, raw);
}
