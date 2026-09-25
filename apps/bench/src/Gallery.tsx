import { useState } from 'react';
import { CORES, type Core } from './cores';
import type { GameEntry, LoadResult } from './registry';

type Props = { result: LoadResult; onOpen: (game: GameEntry) => void };

type Filter = 'all' | Core;

function CoreIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function Gallery({ result, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const countOf = (core: Core) => result.games.filter((g) => g.manifest.core === core).length;
  const shown = filter === 'all' ? result.games : result.games.filter((g) => g.manifest.core === filter);
  const activeLabel = filter === 'all' ? 'All mechanics' : CORES.find((c) => c.id === filter)?.label ?? filter;

  return (
    <section>
      <nav className="cores" aria-label="Mechanic cores">
        <button type="button" className={`core-tile${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          <span className="core-icon">
            <CoreIcon path="M4 6h16M4 12h16M4 18h16" />
          </span>
          <span className="core-label">All</span>
          <span className="core-count">{result.games.length}</span>
        </button>
        {CORES.map((core) => {
          const count = countOf(core.id);
          return (
            <button
              key={core.id}
              type="button"
              className={`core-tile${filter === core.id ? ' active' : ''}${count === 0 ? ' no-games' : ''}`}
              title={core.hint}
              onClick={() => setFilter(core.id)}
            >
              <span className="core-icon">
                <CoreIcon path={core.icon} />
              </span>
              <span className="core-label">{core.label}</span>
              <span className="core-count">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="section-head">
        <h1>{activeLabel}</h1>
        {filter !== 'all' && <p className="muted">{CORES.find((c) => c.id === filter)?.hint}</p>}
      </div>
      {result.errors.length > 0 && (
        <ul className="errors">
          {result.errors.map((error) => (
            <li key={`${error.kind}:${error.url}`}>
              <code>{error.kind}</code> {error.url}: {error.detail}
            </li>
          ))}
        </ul>
      )}
      {shown.length === 0 && result.errors.length === 0 && (
        <p className="empty">
          No games for this core yet. Run <code>yarn new-game {'<id>'}</code> and set <code>"core": "{filter}"</code> in its
          manifest.
        </p>
      )}
      <div className="grid">
        {shown.map((game) => (
          <button key={game.manifest.id} type="button" className="card" onClick={() => onOpen(game)}>
            <div className="card-cover">
              <img src={game.coverUrl} alt="" />
              {game.manifest.core !== undefined && <span className="core-badge">{game.manifest.core}</span>}
            </div>
            <div className="card-title">{game.manifest.title}</div>
            <div className="card-meta">
              <span className="money">v{game.manifest.version}</span>
              <span>{game.manifest.id}</span>
            </div>
            <p className="card-desc">{game.manifest.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
