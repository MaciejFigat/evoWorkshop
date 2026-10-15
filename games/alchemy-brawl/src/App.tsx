import { useState, useSyncExternalStore } from 'react';
import { Chat } from './Chat';
import { CombinationTable, activeCombination } from './CombinationTable';
import { History } from './History';
import { Lobby } from './Lobby';
import type { Net, NetState } from './net';
import { Rules } from './Rules';
import { selection } from './selection';
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

// The name screen and the lobby share the table's shell: a slim top row, then the panels centred.
function Welcome({ net, state }: { net: Net; state: NetState }) {
  return (
    <>
      <header className="topbar">
        <span className="topbar-title">Alchemy Brawl</span>
        <span className="topbar-text muted">{state.name ?? ''}</span>
        <span className={`dot ${state.status}`} title={state.status} />
      </header>
      <div className="centre-body">{state.name === null ? <NameForm net={net} /> : <Lobby net={net} tables={state.lobby} />}</div>
    </>
  );
}

export function App({ net }: { net: Net }) {
  const state = useSyncExternalStore(net.subscribe, net.getState);
  const picked = useSyncExternalStore(selection.subscribe, selection.getState);
  const table = state.name === null ? null : state.table;
  const hand = table?.hand ?? null;

  return (
    <main className="shell">
      <aside className="side">
        <Chat net={net} lines={state.chat} playerId={state.playerId} enabled={table !== null} />
      </aside>
      <section className="centre">
        {state.error !== null && <p className="error">{state.error.replaceAll('_', ' ')}</p>}
        {table === null ? (
          <Welcome net={net} state={state} />
        ) : (
          <TableScreen net={net} table={table} seq={state.seq} receivedAt={state.receivedAt} status={state.status} />
        )}
      </section>
      <aside className="side">
        {table === null ? (
          <div className="panel rules-panel">
            <Rules compact />
          </div>
        ) : (
          <>
            <div className="panel hands">
              <h3>Hands</h3>
              <CombinationTable phase={hand?.phase ?? null} active={hand === null ? null : activeCombination(hand, picked)} />
            </div>
            <History entries={state.history} />
          </>
        )}
      </aside>
    </main>
  );
}
