import { useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION, parseGameMessage, type HostMessage } from '@evo/protocol';
import type { GameEntry } from './registry';

type Session = { id: string; seed: number };

type LogEntry =
  | { ts: number; kind: 'ready' }
  | { ts: number; kind: 'init_sent'; sessionId: string; seed: number }
  | { ts: number; kind: 'game_event'; name: string; data: unknown }
  | { ts: number; kind: 'protocol_error'; reason: string };

const LOG_LIMIT = 200;

function newSession(seed: number): Session {
  return { id: crypto.randomUUID(), seed };
}

function stringify(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function describeEntry(entry: LogEntry): string {
  switch (entry.kind) {
    case 'ready':
      return 'game:ready';
    case 'init_sent':
      return `host:init seed=${entry.seed}`;
    case 'game_event':
      return `${entry.name} ${stringify(entry.data)}`;
    case 'protocol_error':
      return `protocol error: ${entry.reason}`;
  }
}

type Props = { game: GameEntry; onBack: () => void };

export function Player({ game, onBack }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [seedInput, setSeedInput] = useState('1');
  const [session, setSession] = useState<Session>(() => newSession(1));
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const push = (entry: LogEntry) => setLog((prev) => [...prev, entry].slice(-LOG_LIMIT));

    const onMessage = (event: MessageEvent<unknown>) => {
      const frame = frameRef.current;
      if (frame === null || event.source !== frame.contentWindow) {
        return;
      }
      if (event.origin !== game.origin) {
        push({
          ts: Date.now(),
          kind: 'protocol_error',
          reason: `origin ${event.origin} does not match ${game.origin}`,
        });
        return;
      }
      const parsed = parseGameMessage(event.data);
      if (!parsed.ok) {
        push({ ts: Date.now(), kind: 'protocol_error', reason: parsed.reason });
        return;
      }
      const message = parsed.value;
      if (message.type === 'game:ready') {
        push({ ts: Date.now(), kind: 'ready' });
        const init: HostMessage = {
          type: 'host:init',
          protocol: PROTOCOL_VERSION,
          sessionId: session.id,
          seed: session.seed,
          sandbox: true,
        };
        frame.contentWindow?.postMessage(init, game.origin);
        push({ ts: Date.now(), kind: 'init_sent', sessionId: session.id, seed: session.seed });
        return;
      }
      push({ ts: Date.now(), kind: 'game_event', name: message.name, data: message.data });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [game.origin, session]);

  const relaunch = () => {
    const parsedSeed = Number.parseInt(seedInput, 10);
    const seed = Number.isFinite(parsedSeed) && parsedSeed >= 0 ? parsedSeed : 0;
    setSeedInput(String(seed));
    setSession(newSession(seed));
    setLog([]);
  };

  const exportLog = () => {
    const payload = { game: game.manifest.id, version: game.manifest.version, session, log };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${game.manifest.id}-${session.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const firstTs = log[0]?.ts;

  return (
    <main className="player">
      <header className="topbar">
        <button type="button" className="ghost back" onClick={onBack}>
          ‹ Games
        </button>
        <h1>{game.manifest.title}</h1>
        <label className="seed">
          seed
          <input
            value={seedInput}
            inputMode="numeric"
            onChange={(event) => setSeedInput(event.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={relaunch}>
          Relaunch
        </button>
        <button type="button" className="ghost" onClick={exportLog} disabled={log.length === 0}>
          Download log
        </button>
      </header>
      <div className="player-body">
        <iframe
          key={session.id}
          ref={frameRef}
          className="game-frame"
          src={game.entryUrl}
          title={game.manifest.title}
          sandbox="allow-scripts allow-same-origin"
        />
        <aside className="log">
          <h2>
            Events <span className="count">{log.length}</span>
          </h2>
          {log.length === 0 ? (
            <p className="muted log-empty">The game has not sent anything yet.</p>
          ) : (
            <ol>
              {log.map((entry, index) => (
                <li key={`${entry.ts}-${index}`} className={entry.kind === 'protocol_error' ? 'err' : ''}>
                  <time>+{firstTs === undefined ? 0 : entry.ts - firstTs}ms</time>
                  <span>{describeEntry(entry)}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  );
}
