import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LobbyTable } from '@evo/alchemy-brawl/engine';
import { parseWith } from '@evo/protocol';
import { z } from 'zod';
import { catalogEntry, type Catalog } from './catalog.ts';

export type ApiOptions = {
  catalog: Catalog;
  tables: () => LobbyTable[];
  // Slack workflow webhook that receives submitted ideas; unset means the feature is off.
  ideasWebhookUrl: string | undefined;
};

const MAX_BODY_BYTES = 64 * 1024;

const IdeaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  imageUrl: z.union([z.literal(''), z.string().trim().url()]).default(''),
  submittedBy: z.string().trim().min(1).max(100),
});

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(res.req.method === 'HEAD' ? undefined : text);
}

type Body = { ok: true; text: string } | { ok: false; reason: 'too_large' };

function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve({ ok: false, reason: 'too_large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve({ ok: true, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => resolve({ ok: false, reason: 'too_large' }));
  });
}

async function postIdea(req: IncomingMessage, res: ServerResponse, webhookUrl: string | undefined): Promise<void> {
  if (webhookUrl === undefined || webhookUrl === '') {
    sendJson(res, 503, { error: 'webhook_not_configured' });
    return;
  }
  const body = await readBody(req);
  if (!body.ok) {
    sendJson(res, 413, { error: body.reason });
    return;
  }
  let data: unknown;
  try {
    data = JSON.parse(body.text);
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }
  const idea = parseWith(IdeaSchema, data);
  if (!idea.ok) {
    sendJson(res, 400, { error: 'invalid_idea', reason: idea.reason });
    return;
  }
  // The payload keys are the variables of the Slack workflow; keep them stable.
  const payload = {
    title: idea.value.title,
    description: idea.value.description,
    image_url: idea.value.imageUrl,
    submitted_by: idea.value.submittedBy,
  };
  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!upstream.ok) {
      sendJson(res, 502, { error: 'webhook_failed', status: upstream.status });
      return;
    }
  } catch {
    sendJson(res, 502, { error: 'webhook_unreachable' });
    return;
  }
  sendJson(res, 200, { ok: true });
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, options: ApiOptions): Promise<void> {
  if (pathname === '/api/ideas') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    await postIdea(req, res, options.ideasWebhookUrl);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const { catalog } = options;
  if (pathname === '/api/games') {
    sendJson(res, 200, { games: catalog.games.map(catalogEntry), errors: catalog.errors });
    return;
  }
  if (pathname === '/api/tables') {
    sendJson(res, 200, { tables: options.tables() });
    return;
  }
  const game = /^\/api\/games\/([a-z0-9-]+)$/.exec(pathname);
  const id = game?.[1];
  if (id !== undefined) {
    const found = catalog.games.find((entry) => entry.id === id);
    if (found !== undefined) {
      sendJson(res, 200, catalogEntry(found));
      return;
    }
  }
  sendJson(res, 404, { error: 'not_found' });
}
