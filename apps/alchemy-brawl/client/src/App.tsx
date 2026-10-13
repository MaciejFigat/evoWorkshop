import { useState, useSyncExternalStore } from 'react';
import { Lobby } from './Lobby';
import type { Net } from './net';
import { TableScreen } from './TableScreen';

function NameForm({ net }: { net: Net }) {
  const [name, setName] = useState('');
  return (
    <form
      className="panel name-form"
      onSubmit={(e) => {
        e.preventDefault();
        net.setName(name.trim());
      }}
    >
      <h2>Your name at the table</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
      <button type="submit" disabled={name.trim() === ''}>
        Enter
      </button>
    </form>
  );
}

export function App({ net }: { net: Net }) {
  const state = useSyncExternalStore(net.subscribe, net.getState);

  return (
    <main>
      <header className="top">
        <h1>Alchemy Brawl</h1>
        <span className="muted">
          {state.name ?? ''} · {state.status}
        </span>
      </header>
      {state.error !== null && <p className="error">{state.error.replaceAll('_', ' ')}</p>}
      {state.name === null ? (
        <NameForm net={net} />
      ) : state.table !== null ? (
        <TableScreen net={net} table={state.table} receivedAt={state.receivedAt} />
      ) : (
        <Lobby net={net} tables={state.lobby} />
      )}
    </main>
  );
}
