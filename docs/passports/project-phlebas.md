## Mechanic passport: Project Phlebas

Core: none — a feel experiment, not a candidate for embedding. The core loop is a space-ship
shooter (execution skill: aiming, dodging, timing), which the embeddability filter explicitly
excludes (`Does not convert: execution skill (platformers, shooters, rhythm)`). This is a
hackathon-demo entry, not a math core.

Source of randomness: none required for the core loop. Enemy spawn timing/placement could use
`packages/rng` for variety, but no payout or EV depends on it.

Player decisions: aim, fire, dodge, when to hold the charge weapon, which weapon to swap to.
None of these are EV-neutral risk decisions — they are skill decisions. Not applicable to the
variance-shape framing the passport normally asks for.

Removed from the original: nothing removed, since nothing here is being adapted from a casino
mechanic. This is a forward build, not a reduction of an existing game.

Kept: n/a (see above).

Round format: individual, continuous session (not a per-round bet structure). A "round" in the
telemetry sense doesn't apply; this does not emit the mandatory `round` event and is not wired
into the betting/RNG contract.

Embedding level: C — presentation only. Built to demo well and carry the CS-education theme,
not to become a live game, slot, or bonus feature.

Red flags: none of the regulator-relevant ones apply (no bets, no payouts, no near-miss or
chase dynamics) — this is a straightforward arcade/education game, out of scope for the
responsible-gambling checks the rest of the bench cares about.

Free when porting: n/a, this isn't going into config/math. Everything below is the actual design.

---

## Concept

A top-down/side space-ship shooter where weapons and enemies are computer science concepts,
progressing chronologically from early CS (logic gates, binary) through to modern AI
(transformers, attention). The player's arsenal gets more sophisticated at the same pace the
enemies do. Pausing the game shows a short tooltip explaining the real-world concept behind
whatever weapon or enemy was just encountered — reinforcement after the player has already felt
the mechanic, not a lecture before it.

Visual style: as simple as possible. 16-bit-era, ideally monochrome/black-and-white, leaning
into the "the machine you're fighting is primitive early on and gets visually denser as the
concepts get denser" as free environmental storytelling.

## Concept → weapon/enemy mapping

| Era | Concept | Player weapon | Enemy | Why it teaches the concept |
|---|---|---|---|---|
| 1. Logic | Boolean gates / binary | **Relay Gun** — single straight shot, two states (on/off) | **Byte** — shatters on the killing hit into 8 bit-fragments (each showing 1 or 0); killing it for real means shooting every `1` bit to flip it to `0` | Not a one-hit kill: clearing a byte is literally zeroing its bits, one at a time |
| 2. Stored-program computing | Loops, GOTO | **Program Counter Beam** — fires in a repeating pattern | **Infinite Loop** — moves in a closed circle, only vulnerable once per cycle | Timing a shot against a repeating cycle makes loops tangible |
| 3. Algorithms | Divide & conquer, sorting | **Quicksort Cannon** — each shot splits into two smaller shots on impact | **Bubble Sort Crawler** — slow, swaps position with the enemy next to it, heavily telegraphed | Recursive splitting weapon vs. a visibly dumb/slow sort |
| 4. Data structures | Linked lists, recursion | same weapon, upgraded range | **Linked List Chain** — enemies tethered together; **Recursion Boss** spawns a smaller copy of itself on hit until it can't | Destroying a node detaches the chain; the boss demonstrates stack depth directly |
| 5. Operating systems | Scheduling, deadlock | **Round-Robin Shotgun** — cycles its spread across whichever enemies are on screen | **Deadlock Pair** — two enemies that regenerate each other unless both die in the same frame | Forces a synchronize-or-fail interaction, which is deadlock |
| 6. Networking | Packets, dropped packets | **Packet Scatter** — shots fragment and reassemble into full damage only if all fragments land | **Packet Loss Ghost** — flickers in/out of existence, sometimes untargetable | Lost packets become felt, missed damage |
| 7. Databases | Indexing / O(1) lookup | **Hash Lookup Shot** — locks on and instantly hits one enemy regardless of position | **Linear Scan Walker** — plain, slow, predictable enemy | Contrast of instant lookup vs. plodding scan |
| 8. Cryptography | Public/private keys | **Key-Pair Blaster** — fires two linked shots, full damage only if both land | **Brute Force Swarm** — many weak enemies that overwhelm by sheer numbers | Pairing mechanic vs. "just try everything" swarm |
| 9. Machine learning | Gradient descent, overfitting | **Gradient Missile** — slowly curves and converges onto a target over ~1 second | **Overfit Clone** — mirrors the player's last few moves exactly, breaks completely on anything novel | Missile "learns" a trajectory; enemy is trained on stale data |
| 10. Modern AI | Attention, transformers | **Attention Beam** — damage ramps the longer it's held on one target | **Hallucination Decoys** — fake enemies mixed with real ones, hitting a fake costs the player | Sustained-focus-rewards mirrors attention weighting; decoys mirror hallucination |
| Final boss | — | — | **The Transformer** — multi-phase, requires switching between 3–4 earlier weapons in sequence | Capstone: "trained on everything before it," beating it requires everything learned so far |

## Tooltip design

Triggered on first encounter with each new weapon or enemy, pausing the game. One or two lines,
shown after the mechanic has already been felt, e.g.:

> "Deadlock: two processes each waiting on the other. Neither moves until both let go."

## Scope for a 48-hour build

Full ten-era arc is a backlog, not an MVP. Suggested 4-era slice for the hackathon:

1. Era 1 — Relay Gun / Byte (shatter-and-zero mechanic, implemented)
2. Era 2 — Program Counter Beam / Infinite Loop (timing mechanic)
3. Era 3 — Quicksort Cannon / Bubble Sort Crawler (split-shot mechanic)
4. Era 9 or 10 as a single "jump to the end" final boss, to bookend early CS against modern AI
   without building the full middle of the arc.

Deadlock-pair and recursion-boss mechanics are the most dev-expensive (synchronized-kill
detection, self-spawning enemies) — good backlog candidates, not MVP. Hash-lookup (a homing
shot) and the attention beam (hold-to-charge) are cheap to build and punch above their weight
thematically — worth keeping even in a trimmed build.

## Open questions

- Platformer-vs-shooter was the other pitch on the table; shooter was chosen because weapons/
  enemies map 1:1 onto concepts, giving the education a mechanical home rather than making it
  decorative.
- Not wired into `packages/game-sdk` / the bench's seed-replay contract, since this isn't a
  betting mechanic — if it ends up living in `apps/bench/games/`, it would need its own
  standalone entry (manifest, no `core`, no mandatory `round` event) rather than following the
  gambling game contract.
