import { useEffect, useState } from 'react';
import { Gallery } from './Gallery';
import { Ideas } from './Ideas';
import { Player } from './Player';
import { localGames } from './localGames';
import { loadExternalGames, resolveLocalGames, type GameEntry, type LoadResult } from './registry';
import external from '../games.external.json';

type View = { kind: 'gallery' } | { kind: 'ideas' } | { kind: 'player'; game: GameEntry };
type Catalog = { status: 'loading' } | { status: 'ready'; result: LoadResult };

const EXTERNAL_REGISTRY = 'games.external.json';

export function App() {
  const [catalog, setCatalog] = useState<Catalog>({ status: 'loading' });
  const [view, setView] = useState<View>({ kind: 'gallery' });

  useEffect(() => {
    let cancelled = false;
    const baseHref = new URL(import.meta.env.BASE_URL, window.location.href).href;
    const local = resolveLocalGames(localGames(), baseHref);
    void loadExternalGames(external, EXTERNAL_REGISTRY, baseHref).then((remote) => {
      if (!cancelled) {
        setCatalog({
          status: 'ready',
          result: {
            games: [...local.games, ...remote.games],
            errors: [...local.errors, ...remote.errors],
          },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.kind === 'player') {
    return <Player game={view.game} onBack={() => setView({ kind: 'gallery' })} />;
  }

  return (
    <>
      <header className="topbar">
        <div className="wordmark">
          evo<span>playground</span>
        </div>
        <nav className="tabs">
          <button type="button" className={view.kind === 'gallery' ? 'active' : 'ghost'} onClick={() => setView({ kind: 'gallery' })}>
            Gallery
          </button>
          <button type="button" className={view.kind === 'ideas' ? 'active' : 'ghost'} onClick={() => setView({ kind: 'ideas' })}>
            Ideas
          </button>
        </nav>
      </header>
      <main className="shell">
        {view.kind === 'ideas' ? (
          <Ideas />
        ) : catalog.status === 'loading' ? (
          <p className="muted">Loading games…</p>
        ) : (
          <Gallery result={catalog.result} onOpen={(game) => setView({ kind: 'player', game })} />
        )}
      </main>
    </>
  );
}
