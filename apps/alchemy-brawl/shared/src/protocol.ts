import { parseWith, type ParseResult } from '@evo/protocol';
import { z } from 'zod';
import { ELEMENTS, MAX_POWER, MIN_POWER, type Card } from './cards.ts';
import { MAX_PLAYERS, MIN_PLAYERS } from './config.ts';
import type { BetKind, HandEvent, HandOutcome, RoundResult, StepError } from './engine/types.ts';
import type { HandView } from './engine/view.ts';

export type SeatInfo = { id: string; name: string; stack: number; bot: boolean; connected: boolean };

export type TableView = {
  code: string;
  maxPlayers: number;
  you: string;
  seats: SeatInfo[];
  handNo: number;
  handSeed: number | null;
  hand: HandView | null;
  timeLeftMs: number | null;
};

export type LobbyTable = { code: string; players: number; maxPlayers: number };

export type ServerError =
  | StepError
  | 'invalid_message'
  | 'not_identified'
  | 'no_such_table'
  | 'table_full'
  | 'already_seated'
  | 'not_seated'
  | 'not_in_hand';

const BET_KINDS = ['check', 'bet', 'call', 'raise', 'fold'] as const satisfies readonly BetKind[];

const SERVER_ERRORS = [
  'not_enough_players',
  'deck_too_small',
  'wrong_phase',
  'unknown_seat',
  'folded',
  'already_cast',
  'card_not_in_hand',
  'not_your_turn',
  'illegal_bet',
  'insufficient_stack',
  'invalid_message',
  'not_identified',
  'no_such_table',
  'table_full',
  'already_seated',
  'not_seated',
  'not_in_hand',
] as const satisfies readonly ServerError[];

const CardSchema: z.ZodType<Card> = z.object({
  element: z.enum(ELEMENTS),
  power: z.number().int().min(MIN_POWER).max(MAX_POWER),
});

const SeatCardSchema = z.object({ seat: z.number().int(), card: CardSchema });

const RoundResultSchema: z.ZodType<RoundResult> = z.object({
  round: z.number().int(),
  catalyst: CardSchema,
  casts: z.array(SeatCardSchema),
  burned: z.array(z.number().int()),
  winner: z.number().int().nullable(),
  value: z.number().int(),
});

const HandOutcomeSchema: z.ZodType<HandOutcome> = z.object({
  reason: z.enum(['fold', 'showdown']),
  scores: z.array(
    z.object({
      seat: z.number().int(),
      sigils: z.number().int(),
      recipes: z.array(z.enum(['essence', 'chain'])),
      score: z.number().int(),
    }),
  ),
  winners: z.array(z.number().int()),
  payouts: z.array(z.number().int()),
  shownReserves: z.array(z.object({ seat: z.number().int(), reserve: z.array(CardSchema) })),
  stones: z.array(z.object({ seat: z.number().int(), power: z.number().int() })),
});

const HandEventSchema: z.ZodType<HandEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roundStarted'), round: z.number().int() }),
  z.object({ type: z.literal('castLocked'), seat: z.number().int() }),
  z.object({ type: z.literal('catalyst'), card: CardSchema }),
  z.object({ type: z.literal('betPlaced'), seat: z.number().int(), kind: z.enum(BET_KINDS), amount: z.number().int() }),
  z.object({ type: z.literal('revealed'), result: RoundResultSchema }),
  z.object({ type: z.literal('handEnded'), outcome: HandOutcomeSchema }),
]);

const HandViewSchema: z.ZodType<HandView> = z.object({
  round: z.number().int(),
  phase: z.enum(['cast', 'bet', 'reveal', 'roundEnd', 'done']),
  button: z.number().int(),
  pot: z.number().int(),
  deckCount: z.number().int(),
  catalyst: CardSchema.nullable(),
  players: z.array(
    z.object({
      id: z.string(),
      stack: z.number().int(),
      sigils: z.number().int(),
      casts: z.array(CardSchema),
      castLocked: z.boolean(),
      folded: z.boolean(),
      committed: z.number().int(),
      roundCommitted: z.number().int(),
    }),
  ),
  betting: z
    .object({
      level: z.number().int(),
      bets: z.number().int(),
      cap: z.number().int(),
      unit: z.number().int(),
      actor: z.number().int().nullable(),
    })
    .nullable(),
  results: z.array(RoundResultSchema),
  outcome: HandOutcomeSchema.nullable(),
  you: z
    .object({
      seat: z.number().int(),
      hand: z.array(CardSchema),
      pendingCast: CardSchema.nullable(),
      canCast: z.boolean(),
      legalBets: z.array(z.enum(BET_KINDS)),
    })
    .nullable(),
});

const TableViewSchema: z.ZodType<TableView> = z.object({
  code: z.string(),
  maxPlayers: z.number().int(),
  you: z.string(),
  seats: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      stack: z.number().int(),
      bot: z.boolean(),
      connected: z.boolean(),
    }),
  ),
  handNo: z.number().int(),
  handSeed: z.number().int().nullable(),
  hand: HandViewSchema.nullable(),
  timeLeftMs: z.number().int().nullable(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string().min(8).max(64), name: z.string().trim().min(1).max(20) }),
  z.object({ type: z.literal('create'), maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS) }),
  z.object({ type: z.literal('join'), code: z.string().min(1).max(8) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('addBot') }),
  z.object({ type: z.literal('cast'), card: CardSchema }),
  z.object({ type: z.literal('bet'), kind: z.enum(BET_KINDS) }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), playerId: z.string(), name: z.string() }),
  z.object({
    type: z.literal('lobby'),
    tables: z.array(z.object({ code: z.string(), players: z.number().int(), maxPlayers: z.number().int() })),
  }),
  z.object({ type: z.literal('table'), view: TableViewSchema, events: z.array(HandEventSchema) }),
  z.object({ type: z.literal('left') }),
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
