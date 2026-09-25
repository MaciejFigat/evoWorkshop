import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  cover: z.string().min(1),
  entry: z.string().min(1),
  core: z
    .enum(['ladder', 'mines', 'pick', 'draw', 'cascade', 'race', 'board', 'collect'])
    .optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const RegistrySchema = z.object({
  games: z.array(z.string().min(1)),
});
export type Registry = z.infer<typeof RegistrySchema>;

export const GameMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('game:ready'),
    protocol: z.literal(PROTOCOL_VERSION),
  }),
  z.object({
    type: z.literal('game:event'),
    name: z.string().min(1),
    data: z.unknown().optional(),
  }),
]);
export type GameMessage = z.infer<typeof GameMessageSchema>;

export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('host:init'),
    protocol: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().min(1),
    seed: z.number().int().nonnegative(),
    sandbox: z.boolean(),
  }),
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function parseWith<T>(schema: z.ZodType<T>, data: unknown): ParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const reason = result.error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  return { ok: false, reason };
}

export function parseManifest(data: unknown): ParseResult<Manifest> {
  return parseWith(ManifestSchema, data);
}

export function parseRegistry(data: unknown): ParseResult<Registry> {
  return parseWith(RegistrySchema, data);
}

export function parseGameMessage(data: unknown): ParseResult<GameMessage> {
  return parseWith(GameMessageSchema, data);
}

export function parseHostMessage(data: unknown): ParseResult<HostMessage> {
  return parseWith(HostMessageSchema, data);
}
