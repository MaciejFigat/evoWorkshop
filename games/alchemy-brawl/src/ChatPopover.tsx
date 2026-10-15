import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ChatLine, Net } from './net';

const MAX_TEXT = 200;
const SHOWN_LINES = 6;
const PHRASES = ['Nice hand', 'Good luck', 'Well played', 'Oops', 'Thanks', 'gg'];

// The table chat as a round button in the top-left corner of the board: a badge counts the lines that
// arrived while it was closed; the popover below it shows the last lines, quick phrases and an input.
export function ChatPopover({ net, lines, playerId }: { net: Net; lines: ChatLine[]; playerId: string | null }) {
  const [open, setOpen] = useState(false);
  // The last line seen with the popover open; the net keeps only the newest 50 lines, so the count
  // of unread lines is measured from that line, not from the length of the list.
  const [seen, setSeen] = useState<ChatLine | null>(lines[lines.length - 1] ?? null);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const unread = open ? 0 : lines.length - 1 - (seen === null ? -1 : lines.lastIndexOf(seen));

  useEffect(() => {
    if (open) {
      setSeen(lines[lines.length - 1] ?? null);
      list.current?.scrollTo({ top: list.current.scrollHeight });
    }
  }, [open, lines]);

  const send = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed !== '') {
      net.send({ type: 'chat', text: trimmed });
    }
  };

  return (
    <div className="chat-pop">
      <button type="button" className={`chat-button${open ? ' active' : ''}`} onClick={() => setOpen((value) => !value)} aria-label="Chat">
        <Icon name="chat" size={16} />
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-lines" ref={list}>
            {lines.slice(-SHOWN_LINES).map((line, i) => {
              const mine = line.playerId === playerId;
              return (
                <div key={`${lines.length}-${i}`} className="chat-line">
                  <span className={mine ? 'mine' : 'other'}>{mine ? 'You' : line.from}</span>
                  <span className="sep"> · </span>
                  {line.text}
                </div>
              );
            })}
          </div>
          <div className="chat-phrases">
            {PHRASES.map((phrase) => (
              <button type="button" key={phrase} className="chat-phrase" onClick={() => send(phrase)}>
                {phrase}
              </button>
            ))}
          </div>
          <form
            className={`chat-input${text.trim() === '' ? '' : ' ready'}`}
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
              setText('');
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT} placeholder="Message" aria-label="Chat message" />
            <button type="submit" aria-label="Send">
              <Icon name="send" size={20} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
