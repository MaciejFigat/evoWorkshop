# CLAUDE.md

## Why this repository exists

This is not a collection of games. It is a test bench for mini-game mechanics with one goal:
find the ones that can later be embedded into a live casino game or a slot, either whole or
as a bonus feature. Every game here either maps onto one of the eight math cores (below) or
is explicitly marked as a feel experiment with no path to embedding. We do not build games
for their own sake.

The bench must answer three questions:

1. Is the mechanic playable on its own, as rectangles and numbers, before any art.
2. Does it fit server-side gambling math: a server-side random process plus EV-neutral
   risk decisions by the player.
3. How engaging is it, according to the telemetry the bench records itself.

Context: a 48-hour hackathon prototype for a live-casino operator. We optimise for a live
demo, not for production. Three engineers, no artists, no QA.

## What exists now

```
apps/bench/                    React + Vite, the bench itself
  games/<id>/                  one folder per game: manifest.json, index.html, main.ts, cover.svg
  games/_template/             copied by yarn new-game; folders starting with "_" are not games
  games.external.json          games hosted on another origin, base URLs of their manifest folders
  src/localGames.ts            import.meta.glob over games/*/manifest.json: the folder tree is the registry
  src/registry.ts              manifest → urls, typed error union, loading of external manifests
  src/Gallery.tsx              game cards
  src/Player.tsx               iframe, handshake, seed and relaunch, event log, JSON export
  src/App.tsx  main.tsx  styles.css
  src/*.test.ts                vitest, node environment; manifests.test.ts validates every game folder
  vite.config.ts               every games/<id>/index.html is a build input of its own
packages/protocol/             zod: manifest, registry, host↔game messages; parseWith → { ok, value } | { ok, reason }
packages/rng/                  mulberry32 → { next, int, shuffle }; the only place Math.random may appear
packages/game-sdk/             connect(onInit): game:ready → host:init → session { seed, sessionId, rng, emit }
scripts/new-game.mjs           yarn new-game <id> [Title]: copies the template, nothing else to register
```

Target layout as code appears (do not create earlier than needed):

```
packages/engine    pure cores, zero dependencies, zero IO
apps/server        round loop, ws, bet ledger
apps/client        Pixi board, CSS HUD
```

## Commands

```
yarn install
yarn dev          # http://localhost:5180
yarn typecheck    # tsc --noEmit
yarn test         # vitest run
yarn build
yarn new-game <id> [Title words...]
```

## Game contract

A game is a folder `apps/bench/games/<id>/` with `manifest.json`, `index.html`, `main.ts` and a
cover. Nothing else is registered: the bench globs the folder tree, and `yarn test` fails on
a manifest that does not parse, an `id` that differs from the folder name, a missing `entry`
or `cover`, or a duplicate id. Start a game with `yarn new-game <id>`; the template already
speaks the protocol and emits `round`. A game may also live on another origin: list the base
URL of its manifest folder in `apps/bench/games.external.json`; `entry` and `cover` resolve
relative to `manifest.json`.

`main.ts` is strict TypeScript under the same rules as the bench. It gets the session from
`connect()` in `@evo/game-sdk` and randomness from `session.rng`; it never talks to
`postMessage` or the PRNG directly.

`manifest.json`: `id` (`[a-z0-9-]`), `version`, `title`, `description`, `cover`, `entry`,
optional `core`, one of `ladder | mines | pick | draw | cascade | race | board | collect`.

postMessage, protocol 1 (`PROTOCOL_VERSION` in `packages/protocol`):

- game → host on load: `{ type: "game:ready", protocol: 1 }`
- host → game in reply: `{ type: "host:init", protocol: 1, sessionId, seed, sandbox: true }`
- game → host at any time: `{ type: "game:event", name, data? }`

The host accepts messages only from its own iframe window and only with an origin equal to
the origin of `entry`; everything else goes to the log as `protocol error`. When changing
the contract, bump `PROTOCOL_VERSION` and update `packages/protocol`, `packages/game-sdk`,
the tests, README, the template and the d20 example in the same commit.

## Rules for games on the bench

- All randomness comes from the host `seed` through `session.rng`. One seed, one deal; the
  "Relaunch" button must reproduce the session. Without a host, `connect()` supplies seed 1
  and the game works standalone.
- `Math.random()` is allowed only inside `packages/rng`. Games never call it.
- Money is in integer units. Multipliers may be fractional; the payout is rounded down at
  exactly one point, after summing.
- Wireframe facade first: rectangles and numbers. If the mechanic does not hold interest
  that way, art will not save it. Art comes after the passport and telemetry say "yes".
- The `round` event is mandatory for every game. Minimum `data` fields: `round`, `seed`,
  `stake`, `payout`, `balance`; the rest is game-specific (for d20: `roll` and `bets`). The
  scorecard is computed from these logs, so do not rename these fields.
- For interactive cores (`ladder`, `mines`, `pick` with a ladder) all hidden state, such as
  the bust point, mine positions or card order, is generated in full at the start of the
  round; player decisions only index into it. Replay = `(seed, config version, bets,
  decision log)`.
- Everything in the repository is in English: UI strings, docs, comments, identifiers,
  commit messages. A code comment appears only where it explains a non-obvious decision
  (for example, where exactly the rounding point is).

## Cores and the embeddability filter

A mechanic is embeddable if (a) the server can resolve the outcome before any player action
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

Does not convert: execution skill (platformers, shooters, rhythm), deduction and information
(real minesweeper, puzzles: the optimal strategy is computable, bots within a week), PvP for
money (a different licence category), a session longer than a betting round.

Changes freely, without recomputing the math: theme, art, sound, pace, win ceremony, input
gesture, round length. Everything that lives in config, such as paytable, hazard curve and
RTP, is math, and any change requires updating the RTP test.

## Mechanic passport, before code

File `docs/passports/<id>.md`, filled in before the first line of game code. If the core is
not obvious, ask; this is not trivia.

```
## Mechanic passport: <name>
Core: one of 8 / none (then a feel experiment, not a candidate for embedding)
Source of randomness: single draw / sequential hazard / drop / race / board
Player decisions: list; for each, what it changes in the variance shape and why it leaves EV untouched
Removed from the original: execution skill / deduction / information
Kept: gesture / exit moment / risk profile / pick from N
Round format: shared per table (live) / individual (slot) / both; round length, sec
Embedding level: A standalone live game / B bonus feature / C presentation only
Red flags: illusion of control / appeal to children / progress that burns / artificial near-miss
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
- The stack is pinned: React + Vite, zod, vitest, ws for the server, PixiJS for the board.
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
over 10M rounds with RTP within 0.15% of config and a bounded max win; state machine tests
(a bet after LOCK is rejected with a typed error, a duplicate betId is ignored, a
disconnected player still receives the payout). Changing a paytable without updating the RTP
test is a build error.

## Telemetry and evaluation

There is no "fun" metric. There are three layers, and the bench must supply raw material for
all of them:

- From config, without people: hit rate, distribution of losing streaks, share of outcomes
  ≥5x/≥20x/≥100x, suspense/surprise curve (Ely, Frankel, Kamenica 2015), comparison of K bot
  policies (equal EV, different shapes, otherwise the decision is fictitious), an adversarial
  agent that must not beat the RTP.
- Bots: scripted policies through the same `Decision` a human uses.
- People, from bench logs: rounds until voluntary exit, latency of risk decisions, stake
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
- Neither the rules nor the interface tone may hint that skill improves return. The narrator
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
