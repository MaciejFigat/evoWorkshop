## Passport: Project Phlebas Co-op

Kind: neither, same as the solo version (`docs/passports/project-phlebas.md`) — a feel experiment,
not a candidate for embedding. This passport only covers what's different: two players sharing
one simulation over a server relay, instead of one player in a bench iframe.

Core: none — unchanged from solo. The space-shooter loop (aim, dodge, timing) is execution
skill, which the embeddability filter excludes regardless of player count.

Source of randomness: one seed per match, drawn server-side the moment both players ready up
(`logic/src/room.ts` `setReady`, same `randomInt` → `mulberry32` shape as every other
server-backed game), handed to the host's browser as `mulberry32(roundSeed)`. The guest's
browser never touches randomness at all — it only ever renders what the host sends it.

## What's actually different from solo play

**Topology**: `apps/project-phlebas-coop/` (shared + logic + client), mounted into `apps/web`
exactly like Alchemy Brawl — `logic` has no process of its own, `apps/web` imports its `Lobby`
and mounts it on `/games/project-phlebas-coop/ws`; the client is a game page at
`/games/project-phlebas-coop/`, opened the same way as any other game in the library. `logic`
is a dumb relay — it never runs game logic, only forwards `input` (guest → host) and `snapshot`
(host → guest) messages to the right seat. The entire simulation (`update.ts`, `entities.ts`)
is unchanged in spirit from the solo version, just indexed by player `0 | 1` instead of a single
value, and it only ever runs in the host's tab.

**Netcode — host-relay, chosen over server-authoritative.** The host's browser is the one and
only simulation; the guest is a thin renderer plus an input source. This was the deliberate
trade-off for a first version:

- Cheap: reuses the solo game's `update.ts`/`entities.ts` almost unchanged, and reuses
  `_server-template`'s room/share-link code verbatim (`logic/src/lobby.ts`, `room.ts`).
- Costly: the guest's own ship moves with the round-trip latency to the host baked in (their
  keypress → server → host → next host snapshot → back to their screen), and if the host's tab
  closes, the match simply stops — there's no handoff to a new host mid-game (see
  `logic/src/room.ts`'s `hostId` comment).
- The alternative — porting the simulation onto the server as a tick loop, both clients as
  pure input/render — is the "correct" fix if this ever needs to feel solid over a real
  network instead of a LAN/same-machine demo. Not done here; flagging it so it isn't mistaken
  for an oversight.

**Snapshot, not delta-compressed or throttled.** The host sends a full `Snapshot` (positions,
bullets, enemies, score, lives) every rendered frame, no throttling. Fine for the handful of
objects this game ever has on screen; a real multiplayer game would throttle and diff this.

**2-player design: co-op, shared everything.** Both ships fire the era's one weapon at the same
shared wave of enemies, with shared lives and shared score — not two independent runs, not
versus. `GameState.playerXs`/`keysByPlayer`/`fireCooldowns`/`burstCounts`/`beamCharges` are all
2-tuples indexed by seat; `score`/`lives`/`eraIndex`/`bullets`/`enemies` stay singular/shared.

**Pause is host-authoritative.** Only the host's `P` key does anything; the guest's `P` is a
no-op (see the comment in `client/src/GameView.tsx`'s `runGuest`). The guest's overlay still
shows "Paused" correctly, since it's driven by the `paused` field in every snapshot, not a
local toggle.

**No reconnect.** Same as `_server-template`: closing a tab drops that seat for good. A
browser refresh mid-match loses your ship.

Red flags: none apply — no bets, no payouts, same as solo.

Free when porting: everything about the netcode model is swappable later (server-authoritative,
reconnect, more than 2 seats) without touching the actual game feel — `update.ts`/`entities.ts`
don't know or care that they're being relayed anywhere.
