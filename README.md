# evo-playground

Workshop for game ideas the company can use: arcade mechanics to embed into live casino
games and slots, and complete games that stand as products of their own. A folder per game →
card in the gallery → iframe → event log. See `CLAUDE.md` for why the bench exists and what a
game must satisfy.

## Run

```
yarn install
yarn dev            # http://localhost:5180
yarn typecheck
yarn test
yarn build
yarn new-game <id> [Title words...]
yarn brawl          # Alchemy Brawl: server ws://localhost:5191/ws + client http://localhost:5190
```

## Layout

```
apps/bench/                 React + Vite host: gallery, player, event log
  games/<id>/               one folder per game: manifest.json, index.html, main.ts, cover.svg
  games/_template/          copied by yarn new-game
  games.external.json       games hosted on another origin (base URLs of their manifest folders)
  src/localGames.ts         import.meta.glob over games/*/manifest.json — the registry is the folder tree
  src/registry.ts           manifest → urls, typed errors, loading of external manifests
  src/Player.tsx            iframe, handshake, seed and relaunch, log, JSON export
packages/protocol/          zod schemas: manifest, registry, host↔game messages
packages/rng/               mulberry32 → { next, int, shuffle }; the only place Math.random may appear
packages/game-sdk/          connect(onInit): handshake with the host, seed → rng, emit()
apps/alchemy-brawl/         multiplayer game with its own server, three workspaces:
  shared/                   pure hand engine, scoring, per-seat view, zod protocol
  server/                   Node + ws: lobby, tables by 4-letter code, timers, bots
  client/                   Vite + React lobby and HUD, Phaser table
scripts/new-game.mjs        scaffolds a game from the template
```

## Alchemy Brawl

`yarn brawl` starts the server and the client together; open http://localhost:5190, enter a
name, create a table or join one by its code, and add bots to fill the seats. Each browser
tab is a separate player, and a reload keeps the seat. Rules: `alchemy_brawl_spec.md`;
passport: `docs/passports/alchemy-brawl.md`. The prototype plays money only, and stacks are
topped up before every hand, so nobody goes all-in and there are no side pots.

## Adding a game

```
yarn new-game mines Mine Grid
```

That creates `apps/bench/games/mines/` from the template and the game is already in the
gallery: there is no registry file to edit. Then write `docs/passports/mines.md` and replace
`main.ts`. Every game's `index.html` is a Vite page of its own, so `main.ts` is strict
TypeScript with the same rules as the bench and can import `@evo/game-sdk` and `@evo/rng`.

`yarn test` validates every manifest: schema, `id` equal to the folder name, `entry` and
`cover` present on disk, unique ids. A broken folder fails the tests instead of silently
disappearing from the gallery.

A game hosted elsewhere is listed in `apps/bench/games.external.json` by the base URL of the
folder that holds its `manifest.json`; `entry` and `cover` resolve relative to that manifest.

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
"Relaunch" button reproduces the session.

The event log keeps the last 200 entries with time measured from the first event and can
be downloaded as JSON with the "Download log" button.
