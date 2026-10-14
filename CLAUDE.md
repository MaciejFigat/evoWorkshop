# CLAUDE.md

## Why this repository exists

A playground for game ideas the company can use. An idea comes in one of two kinds:

- **Mechanic**: an arcade mechanic to embed into a live casino game or a slot, whole or as a
  bonus feature. It maps onto one of the eight math cores (below) or is explicitly marked as
  a feel experiment with no path to embedding.
- **Game**: a complete game that stands as a product of its own, for example a multiplayer
  table game with its own server and lobby. It may use a core or none; its passport names
  the business model and the licence category it needs.

We do not build games for their own sake: every idea has a passport that says which kind it
is and how the company could ship it.

The playground must answer three questions about every idea:

1. Is it playable on its own, as rectangles and numbers, before any art.
2. Does it fit server-side gambling math. For a mechanic: a server-side random process plus
   EV-neutral risk decisions by the player. For a game: a stated business model
   (house-banked with a fixed RTP, rake from player pots, or play money) and a server that
   decides every outcome.
3. How engaging is it, according to the telemetry the playground records itself.

Context: a 48-hour hackathon prototype for a live-casino operator. We optimise for a live
demo, not for production. Three engineers, no artists, no QA.

## What exists now

One server app serves everything: the pages, the JSON API, the WebSocket and every game.

```
apps/web/                      @evo/web: the single server, http://localhost:5180
  src/server/catalog.ts        scanGames(repo) → { games, errors }: the folder tree is the registry; catalogEntry(game) → urls
  src/server/*.ts              Node http + ws; Vite middleware mode in dev, apps/web/dist in prod
  pages/shell.html             EVO Playground pages: lobby, library grid, game page, stats, gamers board, add, my games; mock data inline
  vite.config.ts               Vite root = repo root; every games/<id>/ page is a build input; outDir apps/web/dist; vitest over src
  tsconfig.json                typechecks games/*/main.ts (DOM); tsconfig.server.json: src/server (Node, erasable syntax only)
games/                         every game, one folder each; the folder tree is the registry
  <id>/                        a game page: manifest.json, index.html, main.ts, cover (d20, sunset-break, warsaw-streets)
  _template/                   copied by yarn new-game; folders starting with "_" are not games
  project-phlebas/             solo CS-history space shooter, feel experiment — see its passport
  alchemy-brawl/               a game with its own tables, still one folder: @evo/alchemy-brawl
    manifest.json index.html cover.svg spec.md assets/   the page, the rules (v0.3), the SVG art
    src/                       the client: React lobby + CSS HUD, Phaser table
    engine/                    @evo/alchemy-brawl/engine: pure hand engine, scoring, per-seat view, zod protocol
    tables/                    @evo/alchemy-brawl/tables: lobby, tables by code, timers, bots; mounted by apps/web on /ws
  project-phlebas-coop/        2-player co-op port of games/project-phlebas, one folder: @evo/project-phlebas-coop
    manifest.json index.html cover.svg src/   the page; host-relay netcode — the host's browser
                                runs the actual simulation, the guest only renders and sends input (see its passport for why)
    shared/                    @evo/project-phlebas-coop/shared: zod protocol — room/share-link
                                messages plus Snapshot (positions, bullets, enemies, score, lives)
    logic/                     @evo/project-phlebas-coop/logic: Lobby/Room, create/join rooms by a
                                short code; mounted by apps/web on /games/project-phlebas-coop/ws
                                (not bare /ws — see "Routes"), never runs the game itself
packages/protocol/             zod: manifest, host↔game messages; parseWith → { ok, value } | { ok, reason }
packages/rng/                  mulberry32 → { next, int, shuffle }; the only place Math.random may appear
packages/game-sdk/             connect(onInit): game:ready → host:init → session { seed, sessionId, sandbox, rng, emit }
scripts/new-game.mjs           yarn new-game <id> [Title]: copies the template, nothing else to register
docs/passports/<id>.md         one passport per game, written before its code
```

A game that needs its own server-side state is still one folder `games/<id>/`, as
`games/alchemy-brawl/` and `games/project-phlebas-coop/` are: the page (`manifest.json`,
`index.html`, `src/`), plus one or two subfolders of pure server-side code — `engine`/`tables`
for Alchemy Brawl's hand engine and lobby, `shared`/`logic` for Project Phlebas Co-op's zod
protocol and relay lobby (name them for what they hold, not for a fixed pair). The folder is
one workspace package with a subpath export per subfolder (`@evo/<id>/tables`,
`@evo/project-phlebas-coop/logic`, and so on). The server-side folders have no process of
their own: `apps/web` imports them and mounts their `Lobby` on a ws path — Alchemy Brawl's
bare `/ws`, since it was first; any game added after it gets its own path instead
(`/games/<id>/ws`; Project Phlebas Co-op uses `/games/project-phlebas-coop/ws` — see "Routes",
and `app.ts`'s two `WebSocketServer({ noServer: true })` instances and its single `'upgrade'`
dispatcher), so a second multiplayer game never has to share the first one's endpoint or
protocol. The page opens from the library like any other game and still emits `round` through
`@evo/game-sdk`, so the same telemetry covers it. The server-side code owns every hidden bit
of state and sends each seat only its own view; the client renders that view and the events.
The root `workspaces` lists `games/*`; a plain game page has no `package.json` and is not a
workspace.

**Important `ws` gotcha, if a third multiplayer game joins this list**: don't attach a second
`WebSocketServer` the obvious way (`new WebSocketServer({ server: http, path })`, one per
game) — confirmed with a minimal repro that two or more instances attached that way to the
same `http.Server` corrupt each other's frames (`Invalid WebSocket frame: RSV1 must be clear`,
or unexplained 400s), even though each is documented to filter by its own `path`. `app.ts`
already uses the pattern that actually works (`noServer: true` + a shared `'upgrade'` listener
that calls `handleUpgrade` on the matching instance only) for exactly this reason — copy that
shape, not the simpler-looking one.

## Commands

```
yarn install
yarn dev          # http://localhost:5180, one process: pages, API, websocket, games via Vite middleware
yarn start        # production: the same server serving apps/web/dist, after yarn build
yarn typecheck    # tsc --noEmit
yarn test         # vitest run
yarn build
yarn new-game <id> [Title words...]
```

## Routes

All on one origin, http://localhost:5180:

- Pages, a server-rendered `shell.html` with mock data and `window.EVO_CATALOG` (the list of
  `catalogEntry`) injected as a script before the page's own scripts: `/`, `/library`,
  `/game/:id`, `/game/:id/:tab`, `/stats`, `/stats/board`, `/add`, `/my`.
- JSON: `/api/games`, `/api/games/:id`, `/api/tables`.
- Game pages: `/games/<id>/` (dev: Vite transforms them; prod: from `apps/web/dist`).
- WebSocket: `/ws` for Alchemy Brawl's `Lobby`; `/games/project-phlebas-coop/ws` for Project
  Phlebas Co-op's — each game's own path, not a shared one, so a second multiplayer game never
  has to share the first one's endpoint or protocol.

The game page opens in an iframe on the same origin; the shell plays the host side of the
postMessage protocol. Each multiplayer game's client connects to its own
`ws(s)://location.host/<its path>` from inside that iframe.

## Game contract

A game is a folder `games/<id>/` with `manifest.json`, `index.html`, `main.ts` (or `src/`
for a game with its own tables) and a cover. Nothing else
is registered: the server scans the folder tree (`catalog.ts`), and `yarn test` fails on a
manifest that does not parse, an `id` that differs from the folder name, a missing `entry`
or `cover`, or a duplicate id. Start a game with `yarn new-game <id>`; the template already
speaks the protocol and emits `round`. Games on another origin are not supported: every game
is served by this server.

`main.ts` is strict TypeScript under the same rules as the server. It gets the session from
`connect()` in `@evo/game-sdk` and randomness from `session.rng`; it never talks to
`postMessage` or the PRNG directly.

`manifest.json`: `id` (`[a-z0-9-]`), `version`, `title`, `description`, `cover`, `entry`,
optional `core`, one of `ladder | mines | pick | draw | cascade | race | board | collect`;
omitted for a game that maps onto no core.

postMessage, protocol 1 (`PROTOCOL_VERSION` in `packages/protocol`):

- game → host on load: `{ type: "game:ready", protocol: 1 }`
- host → game in reply: `{ type: "host:init", protocol: 1, sessionId, seed, sandbox: true }`
- game → host at any time: `{ type: "game:event", name, data? }`

The host accepts messages only from its own iframe window and only with an origin equal to
the origin of `entry`; everything else goes to the log as `protocol error`. When changing
the contract, bump `PROTOCOL_VERSION` and update `packages/protocol`, `packages/game-sdk`,
the tests, README, the template and the d20 example in the same commit.

## Rules for games on the playground

- All randomness comes from the host `seed` through `session.rng`. One seed, one deal; the
  "Relaunch" button must reproduce the session. Without a host, `connect()` supplies seed 1
  and the game works standalone. A game with its own server draws all randomness on the
  server, one seed per hand, and the client never draws any.
- `Math.random()` is allowed only inside `packages/rng`. Games never call it.
- Money is in integer units. Multipliers may be fractional; the payout is rounded down at
  exactly one point, after summing.
- Wireframe facade first: rectangles and numbers. If the idea does not hold interest
  that way, art will not save it. Art comes after the passport and telemetry say "yes".
- The `round` event is mandatory for every game. Minimum `data` fields: `round`, `seed`,
  `stake`, `payout`, `balance`; the rest is game-specific (for d20: `roll` and `bets`). The
  scorecard is computed from these logs, so do not rename these fields. In a game, one
  round is one hand or deal.
- For interactive cores (`ladder`, `mines`, `pick` with a ladder) all hidden state, such as
  the bust point, mine positions or card order, is generated in full at the start of the
  round; player decisions only index into it. Replay = `(seed, config version, bets,
  decision log)`.
- Everything in the repository is in English: UI strings, docs, comments, identifiers,
  commit messages. A code comment appears only where it explains a non-obvious decision
  (for example, where exactly the rounding point is).

## Cores and the embeddability filter

This filter applies to mechanics. A mechanic is embeddable if (a) the server can resolve the outcome before any player action
and (b) every player action leaves the expected value unchanged and only changes the shape
of the variance. Execution skill goes away, risk skill stays.

| core    | core mechanic                              | what maps onto it                          | remove / keep                                      |
| ------- | ------------------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| ladder  | ladder with a bust risk                    | runner, waves, tower, diving               | remove dodging and reaction; keep the exit moment  |
| mines   | grid with mines, player picks the density  | minesweeper, treasure map, room crawl      | remove deduction; all cells are equal              |
| pick    | choose one of N, all positions EV-equal    | cards, chests, doors, loot box             | order is shuffled, no skill                        |
| draw    | single weighted draw                       | dice, darts, fishing, claw, penalty kick   | remove aiming; keep the gesture, shuffle the prizes |
| cascade | physical drop                              | plinko, pachinko, marble race              | server picks the outcome, client fits the path     |
| race    | field thinned down to one winner           | races, battle royale, bracket              | bet before the start, odds are fixed               |
| board   | movement across a board                    | board games, room-by-room dungeon crawl    | the path structure defines the distribution        |
| collect | accumulation up to a threshold             | levelling, collections, merge              | progress must survive a break                      |

`ladder`, `mines` and `pick` are one engine: a mine grid is a ladder with a user-chosen hazard
density, and a pick from N is a ladder one step long. One `sequentialHazard` engine and one
RTP test cover all three cores.

Does not convert into an embedded mechanic: execution skill (platformers, shooters, rhythm),
deduction and information (real minesweeper, puzzles: the optimal strategy is computable,
bots within a week), PvP for money (a different licence category), a session longer than a
betting round. A game may still be built on decision skill or PvP as a standalone product
(as poker is), as long as its passport names the licence category and the business model.
Execution skill and computable puzzles stay out in both kinds.

Changes freely, without recomputing the math: theme, art, sound, pace, win ceremony, input
gesture, round length. Everything that lives in config, such as paytable, hazard curve and
RTP, is math, and any change requires updating the RTP test.

## Passport, before code

File `docs/passports/<id>.md`, filled in before the first line of game code. If the kind or
the core is not obvious, ask; this is not trivia.

```
## Passport: <name>
Kind: mechanic / game
Core: one of 8 / none (mechanic: a feel experiment, not a candidate for embedding; game: say what decides the outcome)
Source of randomness: single draw / sequential hazard / drop / race / board / shuffled deck
Player decisions: list; mechanic: what each changes in the variance shape and why it leaves EV untouched; game: what skill each rewards
Removed from the original: execution skill / deduction / information
Kept: gesture / exit moment / risk profile / pick from N
Round format: shared per table (live) / individual (slot) / multiplayer table (seats, create or join); round length, sec
Business model: house-banked with RTP / rake from pots / play money; licence category
Embedding level: A standalone game / B bonus feature / C presentation only
Red flags: illusion of control / appeal to children / progress that burns / artificial near-miss / collusion
Free when porting: theme, art, sound, pace, input. Requires recertification: everything in config
```

Level B is legitimate: most arcade mechanics will not become a standalone game but work well
as a bonus. The live format requires one shared outcome per table (`draw`, `race`, `board` as
the base round; `ladder` as a shared crash, `pick` with simultaneous choice and `cascade` as
a bonus). Slots are individual per spin (`ladder`, `mines`, `pick`, `cascade`, `collect` as
bonus features).

## Code rules

- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Node 22+, Yarn 4
  workspaces with the `node-modules` linker; the release is vendored in `.yarn/releases`.
  TypeScript 7 is installed under the alias `typescript7` because Yarn's built-in TypeScript
  compat patch does not understand the TS 7 package layout; the `tsc` binary resolves as usual.
- The stack is pinned: React + Vite, zod, vitest, ws for the server, Phaser for the board
  (tweens, particles, camera shake and flash, sprite-sheet animations are built in).
- Servers run TypeScript directly on Node's type stripping, with no build step: this covers
  `apps/web/src/server`, `games/alchemy-brawl/tables`, `games/project-phlebas-coop/logic` and
  the pure code they load (`games/alchemy-brawl/engine`, `games/project-phlebas-coop/shared`).
  Relative imports there carry the `.ts` extension, and only erasable syntax is allowed (no
  enums, namespaces or parameter properties); `erasableSyntaxOnly` enforces it. Workspace
  imports use package names (`@evo/alchemy-brawl/engine`, `@evo/project-phlebas-coop/shared`,
  `@evo/protocol`, `@evo/rng`, `@evo/game-sdk`).
  Ask before adding any new dependency.
- No `any`, no non-null assertions, no `as` except at parsing boundaries. `as const` does not
  count.
- Errors are typed discriminated unions, not thrown strings. External data is parsed with zod
  `safeParse`, result `{ ok, value } | { ok, reason }`.
- Engine functions are pure with all inputs explicit: no wall clock, no IO, no globals. The
  server decides every outcome; the client only draws and animates.
- No dead code, commented-out blocks or TODOs. Unfinished work goes in the reply, not in the
  file.
- One file, one thing. This is a two-day codebase; a clever abstraction costs more than a
  duplicate here.

## Check before "done"

Before any report of a completed task run `yarn typecheck && yarn test && yarn build` and
quote the actual output. Not run means not done.

For the engine, once it exists: unit tests for every function with payout math; Monte Carlo
over 10M rounds with RTP within 0.15% of config and a bounded max win (for a rake game
without RTP: Monte Carlo against the probabilities in its spec); state machine tests
(a bet after LOCK is rejected with a typed error, a duplicate betId is ignored, a
disconnected player still receives the payout). Changing a paytable without updating the RTP
test is a build error.

## Telemetry and evaluation

There is no "fun" metric. There are three layers, and the playground must supply raw material
for all of them:

- From config, without people: hit rate, distribution of losing streaks, share of outcomes
  ≥5x/≥20x/≥100x, suspense/surprise curve (Ely, Frankel, Kamenica 2015), comparison of K bot
  policies (equal EV, different shapes, otherwise the decision is fictitious), an adversarial
  agent that must not beat the RTP.
- Bots: scripted policies through the same `Decision` a human uses. In a game with
  skill, bots also measure the skill gradient: a stronger bot must beat a weaker one over
  many hands while the weaker one still wins single hands.
- People, from playground logs: rounds until voluntary exit, latency of risk decisions, stake
  dynamics after losses, tab focus loss, one question "want more?" on a 1–5 scale. Everyone
  gets the same set of seeds, comparison is relative only.

Suspense, near-miss, dead-streak length and chase dynamics are levers regulators watch. They
are descriptive comparators with ceilings, not targets to maximise.

## IP and compliance

- Mechanics are free, expression is not. Do not reproduce the art, card frames, card names,
  lines, fonts or UI language of Hearthstone/Blizzard; do not use Dungeons & Dragons or D&D
  marks, settings (Forgotten Realms, Waterdeep, Ravenloft, Eberron, Azeroth) or WotC Product
  Identity (beholder, mind flayer, illithid, displacer beast, umber hulk, yuan-ti, slaad,
  githyanki, kuo-toa).
- The narrator is called Game Master, GM or by its own name. Never "Dungeon Master" or "DM".
- Dragon, goblin, lich, dungeon, d20, DC, saving throw, critical success are generic terms and
  free to use. SRD 5.1/5.2 mechanics are available under CC-BY-4.0 with attribution.
- Visual style is dark "book" fantasy, not bright cartoon: appeal to children is a direct
  question from UKGC, Spelinspektionen and KSA.
- In house-banked play, neither the rules nor the interface tone may hint that skill
  improves return. In a peer-to-peer game skill is the product and may be said so; the house
  earns from rake, never from the outcome. The narrator
  never urges the player to continue; losses are narrated neutrally. We do not build progress
  that burns when the session ends.
- If an LLM is used: it receives an already-resolved outcome object and returns text only.
  Its output is validated by a schema and a denylist filter; on timeout or failure a static
  template is used. Nothing flows back into game state, payouts or RNG.

## Out of scope

Auth, persistence beyond process memory, i18n, mobile layout, accessibility audit,
responsible-gaming flow, admin panel, currency conversion, sound beyond a couple of SFX.
Do not build until asked.

## How to respond

- Full files or minimal diffs. No pseudocode, no stubs.
- Ambiguous requirement: one line with the assumption taken, then proceed. Do not stop for
  trivia; do stop for the core of a mechanic and for new dependencies.
- On completing a task: what changed, what was verified (with actual command output).
  Nothing else.
