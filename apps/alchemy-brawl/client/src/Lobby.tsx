import { MAX_PLAYERS, MIN_PLAYERS, type LobbyTable } from '@evo/brawl-shared';
import { useState } from 'react';
import type { Net } from './net';

const SEAT_CHOICES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export function Lobby({ net, tables }: { net: Net; tables: LobbyTable[] }) {
  const [seats, setSeats] = useState(MAX_PLAYERS);
  const [code, setCode] = useState('');

  return (
    <section className="lobby">
      <div className="panel">
        <h2>New table</h2>
        <label>
          Seats{' '}
          <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {SEAT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => net.send({ type: 'create', maxPlayers: seats })}>
          Create
        </button>
      </div>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          net.send({ type: 'join', code: code.trim() });
        }}
      >
        <h2>Join by code</h2>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD" maxLength={8} />
        <button type="submit" disabled={code.trim() === ''}>
          Join
        </button>
      </form>

      <div className="panel wide">
        <h2>Open tables</h2>
        {tables.length === 0 && <p className="muted">No tables yet.</p>}
        <ul className="tables">
          {tables.map((t) => (
            <li key={t.code}>
              <code>{t.code}</code>
              <span>
                {t.players}/{t.maxPlayers}
              </span>
              <button
                type="button"
                disabled={t.players >= t.maxPlayers}
                onClick={() => net.send({ type: 'join', code: t.code })}
              >
                Join
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
