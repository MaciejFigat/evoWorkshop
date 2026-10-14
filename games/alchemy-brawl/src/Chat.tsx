import { useEffect, useRef, useState } from 'react';
import type { ChatLine, Net } from './net';

const MAX_TEXT = 200;

// The table chat panel: lines from the server, an input that sends on Enter. Disabled until seated.
export function Chat({ net, lines, playerId, enabled }: { net: Net; lines: ChatLine[]; playerId: string | null; enabled: boolean }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="panel chat">
      <h3>Chat</h3>
      <div className="chat-lines" ref={list}>
        {lines.length === 0 && <p className="muted">{enabled ? 'Say hello to the table.' : 'Chat opens at a table.'}</p>}
        {lines.map((line, i) => (
          <div key={i} className={`chat-line${line.playerId === playerId ? ' mine' : ''}`}>
            <b>{line.playerId === playerId ? 'You' : line.from}</b>
            <span>{line.text}</span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (enabled && trimmed !== '') {
            net.send({ type: 'chat', text: trimmed });
            setText('');
          }
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_TEXT}
          placeholder={enabled ? 'Message' : ''}
          disabled={!enabled}
          aria-label="Chat message"
        />
        <button type="submit" disabled={!enabled || text.trim() === ''}>
          Send
        </button>
      </form>
    </div>
  );
}
