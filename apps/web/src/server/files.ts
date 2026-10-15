import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Resolves a url subpath under root; null when it decodes badly, contains NUL or escapes root.
export function safeJoin(root: string, subpath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(subpath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  const base = resolve(root);
  const file = resolve(base, decoded);
  return file === base || file.startsWith(base + sep) ? file : null;
}

export function sendText(res: ServerResponse, status: number, text: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text) });
  res.end(res.req.method === 'HEAD' ? undefined : text);
}

export async function sendFile(res: ServerResponse, file: string): Promise<void> {
  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      sendText(res, 404, 'not found');
      return;
    }
    size = info.size;
  } catch {
    sendText(res, 404, 'not found');
    return;
  }
  res.writeHead(200, { 'content-type': contentType(file), 'content-length': size });
  if (res.req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
