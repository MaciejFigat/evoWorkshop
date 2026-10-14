# evo-playground

Workshop for game ideas the company can use: arcade mechanics to embed into live casino
games and slots, and complete games that stand as products of their own. A folder per game →
card in the library → iframe → event log. See `CLAUDE.md` for why the playground exists and
what a game must satisfy.

## Run

```
yarn install
yarn dev            # http://localhost:5180: pages, API, websocket and games in one process
yarn start          # production: the same server serving apps/web/dist, after yarn build
yarn typecheck
yarn test
yarn build
yarn new-game <id> [Title words...]
```

## Layout

```
apps/web/                   @evo/web, the single server
  src/server/               Node http + ws; Vite middleware in dev, apps/web/dist in prod; catalog.ts scans the games
  pages/shell.html          EVO Playground pages: lobby, library, game page, stats, gamers board, add, my games (mock data)
  games/<id>/               one folder per game page: manifest.json, index.html, main.ts, cover.svg
  games/_template/          copied by yarn new-game
  vite.config.ts            Vite root = repo root, every game page is a build input
apps/alchemy-brawl/         Alchemy Brawl, a multiplayer table game in one folder
  spec.md                   the rules, v0.3
  assets/                   SVG art: Cards, HUD, UI, Items, Props
  shared/                   @evo/brawl-shared: pure hand engine, scoring, per-seat view, zod protocol
  server/                   @evo/brawl-server: lobby, tables by code, timers, bots; mounted by apps/web on /ws
  client/                   @evo/brawl-client: the game page at /games/alchemy-brawl/ (React lobby, CSS HUD, Phaser table)
packages/protocol/          zod schemas: manifest, host↔game messages
packages/rng/               mulberry32 → { next, int, shuffle }; the only place Math.random may appear
packages/game-sdk/          connect(onInit): handshake with the host, seed → rng, emit()
scripts/new-game.mjs        scaffolds a game from the template
docs/passports/<id>.md      one passport per game, written before its code
```

## Routes

Everything is on one origin, http://localhost:5180:

- Pages: `/`, `/library`, `/game/:id`, `/game/:id/:tab`, `/stats`, `/stats/board`, `/add`,
  `/my`. The server renders `shell.html` with mock data and injects `window.EVO_CATALOG`,
  the list of games it found, before the page's own scripts.
- JSON: `/api/games`, `/api/games/:id`, `/api/tables`.
- Game pages: `/games/<id>/`. In dev Vite transforms them on the fly; in prod they come from
  `apps/web/dist`.
- WebSocket: `/ws`, the Alchemy Brawl lobby.

The game page opens in a same-origin iframe; the shell plays the host side of the
postMessage protocol below.

## Alchemy Brawl

Open http://localhost:5180, pick Alchemy Brawl in the library, enter a name, create a table
or join one by its code, and add bots to fill the seats. Each browser tab is a separate
player, and a reload keeps the seat. Rules: `apps/alchemy-brawl/spec.md` (v0.3); passport:
`docs/passports/alchemy-brawl.md`.

The rules in five lines:

1. Everyone antes 10 units; 30% of the antes make the Round 1 pot, 70% seed the Final pot.
   Each player gets 3 cards.
2. Round 1: 2 table cards are turned up. Within 20 seconds everyone decides at once: stay
   (cast a card face down and show another one) or skip. No betting. A lone stayer takes
   the pot unrevealed; otherwise the stayers' casts flip together.
3. Everyone draws 1 card.
4. Final: 3 fresh table cards. Everyone casts a card face down, then fixed-limit betting
   (bet 30, three bets per round: a bet and two raises). The last player standing, or the
   best combination at the reveal, takes 70% of the antes plus all bets.
5. A combination is your cast plus two table cards, ranked as a three-card poker hand:
   straight flush, three of a kind, straight, flush, pair, high card. Equal combinations
   split the pot. Every card you cast is spent.

Tables seat 3 to 11 players, 6 by default. The prototype plays play money, and stacks are
topped up before every hand so that nobody goes all-in and there are no side pots. The time
bank from the spec is not implemented: the action timer alone decides.

## Adding a game

```
yarn new-game mines Mine Grid
```

That creates `apps/web/games/mines/` from the template and the game is already on the
server at `/games/mines/` and in the library: there is no registry file to edit. Then write
`docs/passports/mines.md` and replace `main.ts`. Every game's `index.html` is a Vite page of
its own, so `main.ts` is strict TypeScript with the same rules as the server and can import
`@evo/game-sdk` and `@evo/rng`.

A game with its own server lives in `apps/<id>/` with `shared`, `server` and `client`
workspaces; the server mounts `apps/<id>/client/` at `/games/<id>/`, and its game page is
a normal entry in the library.

`yarn test` validates every manifest: schema, `id` equal to the folder name, `entry` and
`cover` present on disk, unique ids. A broken folder fails the tests instead of silently
disappearing from the library.

## Game code

```ts
import { connect } from '@evo/game-sdk';

connect((session) => {
  // session.seed, session.sessionId, session.sandbox
  const roll = session.rng.int(1, 20);
  session.emit('round', { round: 1, seed: session.seed, stake: 10, payout: 0, balance: 990 });
});
```

`connect` posts `game:ready`, waits for `host:init` from the parent window, builds the PRNG
from the seed and calls back. Without a host (the page opened directly) it calls back with
seed 1 and a no-op `emit`, so a game also runs standalone.

## Contract

`manifest.json`

```json
{
  "id": "d20",
  "version": "0.1.0",
  "title": "Lightning d20",
  "description": "…",
  "cover": "cover.svg",
  "entry": "index.html",
  "core": "draw"
}
```

`core` is optional and takes one of: `ladder`, `mines`, `pick`, `draw`, `cascade`,
`race`, `board`, `collect`; a complete game that maps onto no core omits it. `id` is
`[a-z0-9-]` only and must equal the folder name.

Messages go over `postMessage`, protocol 1 (`PROTOCOL_VERSION` in `@evo/protocol`):

- game → host on load: `{ "type": "game:ready", "protocol": 1 }`
- host → game in reply: `{ "type": "host:init", "protocol": 1, "sessionId": "…", "seed": 1, "sandbox": true }`
- game → host at any time: `{ "type": "game:event", "name": "round", "data": { … } }`

The host accepts messages only from its own iframe window and only with an origin equal
to the origin of `entry`. Everything else lands in the log as `protocol error`. A game must
take all of its randomness from `seed`, so the same seed yields the same deal and the
"Relaunch" button reproduces the session. A game with its own server draws every card on
the server, one seed per hand, and the client never draws any.

The event log keeps the last 200 entries with time measured from the first event and can
be downloaded as JSON with the "Download log" button.
