import { parseWith, type ParseResult } from '@evo/protocol';
import { z } from 'zod';
import { ELEMENTS, MAX_POWER, MIN_POWER, type Card } from './cards.ts';
import { MAX_PLAYERS, MIN_PLAYERS } from './config.ts';
import {
  CATEGORIES,
  type BetKind,
  type Combination,
  type Decision,
  type FinalResult,
  type HandEvent,
  type HandView,
  type Round1Result,
  type StepError,
} from './types.ts';

export type SeatInfo = { id: string; name: string; stack: number; bot: boolean; connected: boolean };

export type TableView = {
  code: string;
  maxPlayers: number;
  you: string;
  seats: SeatInfo[];
  handNo: number;
  // Published once the hand is over, so a finished hand can be replayed from its seed.
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

export const BET_KINDS = ['check', 'bet', 'call', 'raise', 'fold'] as const satisfies readonly BetKind[];

const SERVER_ERRORS = [
  'not_enough_players',
  'deck_too_small',
  'wrong_phase',
  'unknown_seat',
  'folded',
  'already_decided',
  'already_cast',
  'card_not_in_hand',
  'same_card',
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

export const CardSchema: z.ZodType<Card> = z.object({
  element: z.enum(ELEMENTS),
  power: z.number().int().min(MIN_POWER).max(MAX_POWER),
});

const DecisionSchema: z.ZodType<Decision> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stay'), cast: CardSchema, show: CardSchema }),
  z.object({ kind: z.literal('skip') }),
]);

const SeatCardSchema = z.object({ seat: z.number().int(), card: CardSchema });

const CombinationSchema: z.ZodType<Combination> = z.object({
  category: z.enum(CATEGORIES),
  cards: z.array(CardSchema),
  key: z.array(z.number().int()),
});

const SeatCombinationSchema = z.object({ seat: z.number().int(), combination: CombinationSchema });

const Round1ResultSchema: z.ZodType<Round1Result> = z.object({
  table: z.array(CardSchema),
  pot: z.number().int(),
  stayers: z.array(z.number().int()),
  shown: z.array(SeatCardSchema),
  casts: z.array(SeatCardSchema),
  combinations: z.array(SeatCombinationSchema),
  winners: z.array(z.number().int()),
  payouts: z.array(z.number().int()),
  rolledOver: z.boolean(),
});

const FinalResultSchema: z.ZodType<FinalResult> = z.object({
  reason: z.enum(['fold', 'showdown']),
  table: z.array(CardSchema),
  pot: z.number().int(),
  casts: z.array(SeatCardSchema),
  combinations: z.array(SeatCombinationSchema),
  winners: z.array(z.number().int()),
  payouts: z.array(z.number().int()),
});

const HandEventSchema: z.ZodType<HandEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('round1Started'), table: z.array(CardSchema) }),
  z.object({ type: z.literal('decisionLocked'), seat: z.number().int() }),
  z.object({ type: z.literal('round1Resolved'), result: Round1ResultSchema }),
  z.object({ type: z.literal('finalStarted'), table: z.array(CardSchema) }),
  z.object({ type: z.literal('castLocked'), seat: z.number().int() }),
  z.object({ type: z.literal('betPlaced'), seat: z.number().int(), kind: z.enum(BET_KINDS), amount: z.number().int() }),
  z.object({ type: z.literal('handEnded'), result: FinalResultSchema }),
]);

const HandViewSchema: z.ZodType<HandView> = z.object({
  phase: z.enum(['decide', 'round1End', 'cast', 'bet', 'reveal', 'done']),
  button: z.number().int(),
  round1Pot: z.number().int(),
  finalPot: z.number().int(),
  table: z.array(CardSchema),
  deckCount: z.number().int(),
  players: z.array(
    z.object({
      id: z.string(),
      stack: z.number().int(),
      handCount: z.number().int(),
      decided: z.boolean(),
      stayed: z.boolean().nullable(),
      shown: CardSchema.nullable(),
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
  round1: Round1ResultSchema.nullable(),
  final: FinalResultSchema.nullable(),
  you: z
    .object({
      seat: z.number().int(),
      hand: z.array(CardSchema),
      decision: DecisionSchema.nullable(),
      pendingCast: CardSchema.nullable(),
      canDecide: z.boolean(),
      canCast: z.boolean(),
      legalBets: z.array(z.enum(BET_KINDS)),
      options: z.array(z.object({ card: CardSchema, combination: CombinationSchema })),
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

export const LobbyTableSchema: z.ZodType<LobbyTable> = z.object({
  code: z.string(),
  players: z.number().int(),
  maxPlayers: z.number().int(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string().min(8).max(64), name: z.string().trim().min(1).max(20) }),
  z.object({ type: z.literal('create'), maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS) }),
  z.object({ type: z.literal('join'), code: z.string().min(1).max(8) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('addBot') }),
  z.object({ type: z.literal('decide'), decision: DecisionSchema }),
  z.object({ type: z.literal('cast'), card: CardSchema }),
  z.object({ type: z.literal('bet'), kind: z.enum(BET_KINDS) }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), playerId: z.string(), name: z.string() }),
  z.object({ type: z.literal('lobby'), tables: z.array(LobbyTableSchema) }),
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
