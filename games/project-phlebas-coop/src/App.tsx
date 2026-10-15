import { useState, useSyncExternalStore } from 'react';
import { GameView } from './GameView';
import type { Net, RoomState } from './net';

function NameForm({ net }: { net: Net }) {
  const [name, setName] = useState('');
  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        net.setName(name.trim());
      }}
    >
      <h2>Your name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
      <button type="submit" disabled={name.trim() === ''}>
        Continue
      </button>
    </form>
  );
}

function JoinOrCreate({ net, error }: { net: Net; error: string | null }) {
  const [code, setCode] = useState('');
  return (
    <div className="join-or-create">
      {error !== null && <p className="error">{error.replaceAll('_', ' ')}</p>}
      <button type="button" onClick={() => net.create()}>
        Create a new game
      </button>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() !== '') {
            net.join(code);
          }
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="or enter a code"
          maxLength={8}
          className="code-input"
        />
        <button type="submit" disabled={code.trim() === ''}>
          Join
        </button>
      </form>
    </div>
  );
}

function RoomView({ net, playerId, room }: { net: Net; playerId: string | null; room: RoomState }) {
  const shareUrl = `${location.origin}${location.pathname}?room=${room.code}`;
  const [copied, setCopied] = useState(false);
  const me = room.players.find((p) => p.id === playerId);
  const openSlots = room.maxPlayers - room.players.length;

  return (
    <>
      <div className="share">
        <p className="room-code">
          Room <strong>{room.code}</strong>
        </p>
        <p className="muted">
          Share this link — the next {openSlots === 1 ? 'person' : `${openSlots} people`} to open it {openSlots === 1 ? 'takes' : 'take'} a
          free slot:
        </p>
        <div className="share-row">
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(shareUrl)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => undefined);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id} className={p.id === playerId ? 'me' : ''}>
            {p.name} — {p.ready ? 'ready' : 'waiting'}
          </li>
        ))}
        {Array.from({ length: openSlots }, (_, i) => (
          <li key={`open-${i}`} className="open-slot">
            open slot
          </li>
        ))}
      </ul>
      <div className="room-actions">
        <button type="button" disabled={me?.ready ?? false} onClick={() => net.ready()}>
          Ready
        </button>
        <button type="button" className="ghost" onClick={() => net.leave()}>
          Leave
        </button>
      </div>
    </>
  );
}

export function App({ net }: { net: Net }) {
  const state = useSyncExternalStore(net.subscribe, net.getState);
  const joining = state.joinCodeFromUrl !== null && state.room === null && state.error === null && state.playerId !== null;

  // Both seats ready draws the match seed (see logic/src/room.ts setReady) —
  // that's the one signal that flips this from the lobby to the game.
  if (state.room !== null && state.room.roundSeed !== null && state.playerId !== null) {
    const isHost = state.playerId === state.room.hostId;
    return <GameView net={net} seed={state.room.roundSeed} isHost={isHost} />;
  }

  return (
    <main>
      <header className="top">
        <h1>Project Phlebas Co-op</h1>
        <span className="muted">{state.status}</span>
      </header>
      {state.name === null ? (
        <NameForm net={net} />
      ) : joining ? (
        <p className="muted">Joining game {state.joinCodeFromUrl}…</p>
      ) : state.room === null ? (
        <JoinOrCreate net={net} error={state.error} />
      ) : (
        <RoomView net={net} playerId={state.playerId} room={state.room} />
      )}
    </main>
  );
}
