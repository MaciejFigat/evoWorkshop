# Alchemy Brawl — Game Specification

**Version:** 0.1 (draft) · **Date:** 12 Oct 2026 · **Status:** concept, before the first prototype

> **Pitch.** Poker's betting and bluffing, rebuilt around a simultaneous reveal. Every round, all players cast a spell face down and flip at once: equal spells collide and burn, the round's element trumps the rest, and the final round is worth double. One shared deck, no collections, no card sales — the house earns from the pot, not from packs.

---

## 1. Vision

### 1.1 Design pillars

1. **The reveal is the show.** Every round ends with all players flipping their cards in the same moment. Rules, betting and presentation all exist to make that moment tense.
2. **Visible threats, not random surprises.** Comebacks come from things the table can see coming — a half-built recipe, the double-value Final — so a reversal feels earned.
3. **Fair table.** One shared 52-card deck with a public composition and a built-in card tracker. Nobody can buy an advantage. Skill decides the long run; luck keeps every hand open.
4. **Short hands.** A hand takes 90–120 seconds and starts from zero; nothing carries over between hands. Casting is simultaneous, so more players does not mean more waiting.
5. **Learn in a minute.** Seven rules (§4). Depth comes from timing, reading opponents and betting, not from rules text.

### 1.2 Why this business model

Collectible card games earn by selling new cards, which forces power creep, rotations and paying to keep up. Alchemy Brawl takes a rake from pots, like an online poker room: revenue grows with hands played, so the deck can stay the same forever.

### 1.3 Assumptions (to confirm)

- Players: 18+, poker players and casual card players.
- Platform: mobile-first (portrait), plus desktop/web. Online multiplayer.
- Launch with play money to validate the fun; real money only after licensing.

---

## 2. Components

| Component | Specification |
|---|---|
| Deck | 52 cards = 4 elements × 13 powers, one copy of each |
| Elements | Fire, Water, Earth, Air — each with its own color **and** shape icon |
| Powers | 1 (lowest) to 13 (highest) |
| Button | Marks the dealer seat, moves one seat clockwise each hand, sets the betting order |
| Sigils | Points scored within a hand; reset every hand |
| Chips | Play money or real money |

**Paper prototype:** a standard deck works as-is — suits = elements, A = 1, J = 11, Q = 12, K = 13. Jokers can stand in for Quicksilver (§10).

---

## 3. Glossary

| Term | Meaning | Poker equivalent |
|---|---|---|
| Hand | One deal: ante → 3 rounds → payout | Hand |
| Round | Draw → cast → Catalyst → (bet) → reveal | Street |
| Cast | Place one card from your hand face down | — |
| Reveal | All casts flip at the same time | — |
| Collision | Two or more revealed casts with the same power; all of them **burn** | — |
| Catalyst | Card flipped from the deck after casting; its element dominates the round | Trump |
| Sigil | Point: 1 for winning round 1 or 2, 2 for the Final, +1 per recipe | — |
| Recipe | Bonus pattern in your three casts: Essence or Chain Reaction | Hand ranking |
| Reserve | Your three unplayed cards at the end of the hand; breaks ties | Kickers |
| Philosopher's Stone | All four cards of one power among your six cards; triggers the jackpot | Jackpot hand |

---

## 4. Rules in seven lines (player-facing)

1. You start with 3 cards and draw 1 at the start of each of the 3 rounds.
2. Each round, everyone casts one card face down at the same time. A Catalyst card is flipped, there is a betting round (rounds 2 and 3 only), and then all casts are revealed together.
3. Equal powers collide and burn: they can't win the round.
4. The highest surviving card wins the round, but any card of the Catalyst's element beats every card of another element.
5. Rounds 1 and 2 are worth 1 sigil; the Final (round 3) is worth 2.
6. Recipes in your three casts add +1 sigil each: Essence (all one element) and Chain Reaction (three powers in a row).
7. Most sigils wins the pot. On a tie, the highest unplayed card decides.

That is the whole rulebook a new player needs. The rest of this document is for implementation and tuning.

---

## 5. Hand flow

### 5.1 Setup

1. Every seated player posts the ante.
2. The server shuffles the deck (certified CSPRNG).
3. Each player is dealt 3 cards face down.

### 5.2 Rounds

| Round | Draw | Cast | Catalyst | Betting | Winner gets |
|---|---|---|---|---|---|
| 1 | +1 (hand = 4) | simultaneous | yes | **none** | 1 sigil |
| 2 | +1 (hand = 4) | simultaneous | yes | small bet | 1 sigil |
| 3 — Final | +1 (hand = 4) | simultaneous | yes | big bet | **2 sigils** |

Every round runs these steps:

1. **Draw** — each player still in the hand draws 1 card.
2. **Cast** — everyone secretly picks one card and places it face down, all at once, under a timer. A locked choice cannot change, and nobody sees it until the reveal.
3. **Catalyst** — the top card of the deck is turned face up. Its element dominates this round. The card is then out of play and shows in the tracker.
4. **Betting** (rounds 2 and 3 only) — see §7. A player who folds loses the hand; their face-down cast is discarded unrevealed.
5. **Reveal** — all remaining casts flip at once.
6. **Resolve** — see §6.1.

**Why round 1 has no betting.** The whole table sees at least one reveal every hand, so the core moment is never skipped by early folds. The minimum cost of a hand is the ante.

**Why the draw and the Catalyst come before betting.** When you bet, you know your new card and whether your cast matches the Catalyst; your opponents don't. That information gap is what makes bluffing and value betting work.

### 5.3 End of the hand

- If everyone but one player folds, that player wins the pot at once: no reveal, no recipe check.
- Otherwise, after round 3 resolves, go to the showdown (§6.2).
- Each player at the showdown has seen 6 cards: 3 casts and 3 in reserve.

---

## 6. Resolution and scoring

### 6.1 Round resolution

```text
resolve_round(casts, catalyst_element, value):
    # casts = revealed cards of players still in the hand
    1. Collision: every card whose power appears more than once burns.
    2. No survivors -> nobody wins the round.
    3. If any survivor has catalyst_element -> candidates = those survivors,
       else candidates = all survivors.
    4. Winner = candidate with the highest power
       (always unique: survivors have distinct powers).
    5. Winner gains `value` sigils (1 in rounds 1-2, 2 in round 3).
```

- Collisions ignore elements: Fire 9 and Water 9 burn each other.
- Collision comes before the Catalyst: a burned Catalyst-element card cannot win.
- All-in players still cast and reveal, so their cards still collide with everyone else's.
- Burned casts still count toward their owner's recipes (default; flag `burned_counts_for_recipes`, §10).

### 6.2 Showdown

`score = sigils won in rounds + recipe bonuses`

| Recipe | Condition (the player's 3 casts only) | Bonus |
|---|---|---|
| Essence | All three share one element | +1 |
| Chain Reaction | Three consecutive powers in any order and any elements, e.g. 4-5-6. No wrap-around: 12-13-1 is not a chain | +1 |

A same-element chain counts as both (+2).

Recipes count casts only, never the reserve. If all six cards counted, about 60% of players would hold three of one element and Essence would stop meaning anything. Because casts are revealed one round at a time, recipe progress is public: the table sees two Fire casts and has to guess whether the third is under the face-down card.

**Winner.** The highest score takes the pot, minus rake.

**Tiebreak.** Tied players compare reserves like poker kickers: highest reserve card first, then the second, then the third (power only). Fully equal reserves split the pot; an odd chip goes to the first tied player clockwise from the button.

*Example:* Mia and Leo finish on 2 sigils. Mia's reserve is 13-7-3, Leo's is 12-12-5: Mia wins on her 13. Had her top card been a 12, the second card would decide (7 against 12, so Leo).

About one showdown in five ends in a tie (Appendix A), so the reserve is a real decision: spend a 13 to win a round, or keep it as a tiebreaker.

### 6.3 Philosopher's Stone

- **Trigger:** a player who has not folded holds all four cards of one power among the cards they received this hand (casts plus reserve).
- **Effect:** pays the jackpot (§9.2). It does not change who wins the pot.
- Detected automatically; gets its own celebration effect.
- Side effect worth knowing: if you hold all four 9s, nobody else can cast a 9, so your 9s can never collide.

---

## 7. Betting

| Parameter | Default |
|---|---|
| Structure | Fixed limit |
| Stakes | ante / small bet / big bet = 1 / 2 / 4 units |
| Round 1 | No betting |
| Round 2 | Bets and raises in small bets (2) |
| Round 3 | Bets and raises in big bets (4): the Final doubles both the sigils and the bet |
| Cap | 3 bets per betting round (a bet and two raises) |
| Order | First active player clockwise from the button; the button acts last |

- Actions: check, bet, call, raise, fold.
- **All-in and side pots:** standard poker table-stakes rules. An all-in player keeps casting until the hand ends and can win only the pots they contributed to.
- **Pot-odds hint** on the Call button: "Call 20 into 100: worth it if you win more than 16.7% of the time" (required win rate = call ÷ (pot + call)). No win-probability calculators at real-money tables.
- Largest possible pot at 6 players: 6 + 36 + 72 = 114 units.

**Why antes and a button, not blinds only:** with blinds only, most players fold before the first reveal. Antes plus a free first round keep the whole table in for the core moment, and the button still gives the feeling of control: whoever acts last knows the most.

**Why fixed limit:** newcomers never have to size a bet, and experts can't bully them with all-ins.

---

## 8. Table rules and timing

| Item | Default |
|---|---|
| Seats | 2–6; 6-max is the main format |
| 8-max | Experimental: uses 51 of 52 cards, so it can't run Transmute or Open Ingredient |
| Cast timer | 12 s; on timeout the lowest-power card in hand is cast |
| Action timer | 10 s + 20 s time bank; on timeout check if possible, otherwise fold |
| Joining | From the next hand; only the ante, no blinds to post |
| Disconnect | Timeouts apply; the player sits out after the hand |
| Target | Median hand ≤ 120 s at 6 players |

- Deck use per hand: 6 cards per player + 3 Catalysts, so 39 cards at 6 players and 51 at 8.
- Speed features: pre-select a cast before the timer ends, auto-check/fold toggles, a fast-animation setting.
- Heads-up (2 players) works but plays differently: every collision leaves the round without a winner (5.9–10.5% of rounds in simulation). Consider launching it later with `rollover` on.

---

## 9. Economy

### 9.1 Revenue

- **Rake** (real-money tables): a percentage of each pot with a cap per pot. Values TBD; benchmark against online poker rooms. Also decide whether pots with no bets (antes only) are raked (`no_bet_no_rake`, the analog of poker's "no flop, no drop").
- **Tournaments** (later): entry fee.
- **Cosmetics:** card backs, tables, avatars, emotes, effect skins. Never anything that affects play; card faces stay standard for readability.
- **Never:** card sales, packs, power progression. The deck is the same for everyone, forever.

### 9.2 Jackpot

- Funded by a **drop**: a small fixed amount from each pot above a threshold.
- Frequency is the constraint. A Philosopher's Stone appears for 1 in 1,388 players who see all six cards, which is about once every 230 hands at a full 6-max table where nobody folds. Across many tables that is far too frequent for a large progressive jackpot, so two tiers are proposed:

| Tier | Trigger | Per player (all 6 cards) | Full 6-max table, nobody folds | Payout (placeholder) |
|---|---|---|---|---|
| Philosopher's Stone | Four of any power | 1 in 1,388 | ~1 in 230 hands | Fixed bonus, e.g. 20 antes |
| Magnum Opus | Four 13s | 1 in 18,048 | ~1 in 3,000 hands | Share of the progressive pool |

- **Table share:** part of every jackpot is split among the other players dealt into that hand, so the whole table celebrates. Placeholder split for the progressive: 50% holder, 40% table, 10% reseed.
- **Qualification:** at least 3 players dealt in, a minimum stake level, and the holder has not folded.
- If Magnum Opus is still too frequent at network scale, make it rarer (for example, it must also win the pot) or limit it to higher stakes. Model the drop, frequency and payouts in a spreadsheet before setting any values.

### 9.3 Play-money mode

- Free chips with daily refills; same rules and tables. This is where fun, retention and pacing get validated first.
- Selling play chips can itself be regulated in some markets (social-casino rules), so get a legal review before monetizing it.

---

## 10. Playtest flags and optional modules

Every rule variant is a server flag so it can be A/B tested. **Bold** = v0.1 default.

| Flag | Values | Effect |
|---|---|---|
| `final_round_value` | 1 / **2** | Sigils for winning the Final |
| `recipe_bonus` | 0 / **1** | Sigils per recipe. With 0, recipes don't score and become the first tiebreaker, ahead of the reserve |
| `burned_counts_for_recipes` | **true** / false | With false, a burned cast also leaves your recipe, so opponents can try to "snipe" a visible recipe by guessing its power. More interaction, more variance |
| `tiebreak` | **reserve** / split | Reserve kickers, or split the pot |
| `catalyst_source` | **deck** / element_deck | `element_deck` flips the Catalyst from a separate 4-card element deck, freeing 3 main-deck cards per hand (useful for 8-max) |
| `apprentice_reflection` | on / **off** | If the round winner is a 13 and a 1 survived the collision step, the 1 wins instead, whatever its element. Flavor: the apprentice reflects the archmage's spell |
| `quicksilver` | on / **off** | Adds 2 Quicksilver cards (deck = 54). A cast Quicksilver takes the power of the highest other revealed card, so the two collide and burn. Never counts toward recipes or the Stone. If only Quicksilvers are revealed, they all burn |
| `transmute` | on / **off** | Once per hand, during the cast step of round 2 or 3, pay one bet of that round into the pot to swap a card from your hand for the top card of the deck. 6-max only |
| `rollover` | on / **off** | If a round has no winner, its sigils add to the next round; unclaimed Final sigils are lost |

### 10.1 Watch: recipes are easy to aim for

Random casting completes a recipe in about 8% of hands, but a player who plays only for a recipe completes one in about 60% (Essence 47.5%, Chain Reaction 30.2%; Appendix A). Recipes are a real strategy, not a lottery ticket: chasing one costs round wins, and the table can see it coming. If bots or playtests show recipe-chasing dominates, the levers are `recipe_bonus = 0`, `burned_counts_for_recipes = false`, or a stricter Essence.

### 10.2 Later modes

- **Open Ingredient:** in rounds 1 and 2, a face-up Ingredient card lies in the center, and the round winner takes it instead of their next blind draw. Everyone sees who needs it, and the fight for it stays simultaneous. A separate queue splits the player base, so launch it only when tables fill easily.
- Pot-limit tables, heads-up tables, sit-and-go tournaments.

---

## 11. Skill layers

| Level | What the player does |
|---|---|
| Beginner | Casts high cards; wins rounds when lucky |
| Intermediate | Saves strong cards for the Final and for the tiebreak; checks the tracker for remaining high cards |
| Advanced | Uses card removal (holding three 13s, your 13 can only collide with one card); casts mid cards when the top is crowded; reads and races visible recipes |
| Expert | Bets on information gaps (own cast vs. the Catalyst); bluffs with an unknown face-down cast; uses position (the button acts last); prices every call with pot odds |

The rules punish autopilot: when everyone always casts their highest card, 86% of rounds at 6 players have a collision (about two-thirds with random casts).

**Target:** a beginner wins individual hands regularly; an expert wins over hundreds of hands. Validate with bots (§16).

---

## 12. UX

### 12.1 Information

| Information | Who sees it |
|---|---|
| Deck composition | Everyone, always |
| Your hand | You |
| Face-down casts | Nobody until the reveal (held on the server) |
| Revealed casts, burns, Catalysts, sigils, recipe progress | Everyone |
| Folded casts | Nobody (discarded unrevealed) |
| Reserves | Owner; tied players' reserves are shown at the showdown |

### 12.2 Table screen (mobile portrait)

- **Opponents** (top and sides): chips, a 3-slot cast row, sigils, a recipe-progress badge ("2× Fire", "8-9 chain"), status (casting / locked / folded).
- **Center:** Catalyst slot, collision zone, pot.
- **Bottom:** your hand (4 cards while casting), your cast row, betting buttons with fixed amounts, pot-odds hint.
- **Tracker drawer:** a 4 × 13 grid of every card, marked seen (your hand, revealed casts, Catalysts) or unseen, with unseen counts per power. Built in, so third-party trackers give no edge.

### 12.3 Reveal choreography

About 3–4 s per round; the fast setting halves it.

1. Each player's slot seals when they lock in.
2. Catalyst flip: element flash and sound; the table tints to that element.
3. Betting (rounds 2–3).
4. All casts flip on the same frame.
5. **Collision, the signature moment:** matching cards slam together in the center and burst, with screen shake, particles in their element colors and a heavy impact sound.
6. The winning card glows; sigils fly to the winner (bigger for the Final).
7. Showdown: recipe badges pop; on a tie, reserves flip one card at a time.
8. Stone or Magnum Opus: a table-wide celebration.

### 12.4 Onboarding

- Three interactive lessons against bots: Collision → Catalyst → Recipes and the Final.
- Practice tables with bots (play money).
- The seven rules (§4) one tap away at all times.

### 12.5 Accessibility

- Elements told apart by color + shape + label; colorblind-safe palette.
- Large power numerals; reduced-motion mode turns off shake and particles.

---

## 13. Setting and art

- **Fiction:** rival alchemists brawl over a table; the cards are spells of four elements. Optional rank names: 1 = Apprentice, 13 = Archmage.
- **Theme explains the rules:** elements are suits, the Catalyst decides the dominant element, equal spells cancel out, and the Philosopher's Stone and Magnum Opus are the jackpots.
- **Optional flavor:** rounds named Nigredo, Albedo and Rubedo after the stages of the alchemical Great Work, with Rubedo as the Final.
- **Art scope:** 52 card faces (element frame + large numeral + motif), card backs, table, Catalyst frame, sigil, element icons, effects. One artist or a small team can deliver this.
- **AI art:** for concepts, mood boards and the prototype. Final assets by artists: AI output struggles with a consistent style, purely generated images may not be protectable by copyright in some jurisdictions, and part of the audience reacts badly to AI art.
- **Feel over detail:** as Balatro shows, motion, sound and feedback carry the excitement more than illustration does. Spend first on the collision effect.
- **Name:** "Alchemy Brawl" is a working title. Run a trademark search; "Alchemy" and "Brawl" are also format names in MTG Arena, which crowds search results.

---

## 14. Integrity and compliance

> Not legal advice. Real-money play counts as gambling in most jurisdictions. Bring in a gambling lawyer early: the license decides which markets you can serve and shapes the architecture.

- **Licensing:** jurisdiction TBD. Some countries ban online gambling or run it as a state monopoly; geo-block every market you are not licensed for.
- **Player protection:** 18+ (or the local legal age), KYC/AML, deposit/loss/session limits, reality checks, cool-off, self-exclusion.
- **RNG and game math:** server-side CSPRNG certified by an accredited test lab; game math audited.
- **Server authority:** clients never receive hidden cards or face-down casts; casts are committed to the server and broadcast only at the reveal.
- **Collusion:** the rules contain no "target player X" actions; everyone competes for shared rewards. On top of that: hand-history analytics for soft-play, chip dumping and coordinated folding; IP and device linking; seating restrictions.
- **Bots and real-time assistance:** behavioral analytics (timing, decision patterns), device integrity checks, a fair-play policy and an enforcement team. Decide whether cross-hand stats (HUDs) are banned or offered natively to everyone.
- **Data protection:** GDPR in the EU and local equivalents elsewhere.

---

## 15. Technical notes

- **Hand state machine:**
  `WAITING → ANTE → DEAL → [DRAW → CAST → CATALYST → BET (rounds 2–3) → REVEAL → RESOLVE] × 3 → SHOWDOWN → JACKPOT_CHECK → PAYOUT → NEXT_HAND`
- **Simultaneous cast:** the server collects locked casts and broadcasts the reveal to all clients atomically.
- **Replays:** store the shuffle seed and action log per hand; hand history as JSON.
- **Rules engine:** pure and headless, shared by the server, bots and the simulation harness. Every flag in §10 is configuration.
- **Bots:** for tutorials, practice tables and balance simulation; never at real-money tables.

Default configuration:

```yaml
table:
  max_players: 6
  stakes: {ante: 1, small_bet: 2, big_bet: 4}
  max_bets_per_round: 3
  cast_timer_s: 12
  action_timer_s: 10
  time_bank_s: 20
rules:
  final_round_value: 2
  recipe_bonus: 1
  burned_counts_for_recipes: true
  tiebreak: reserve          # reserve | split
  catalyst_source: deck      # deck | element_deck
modules:
  apprentice_reflection: false
  quicksilver: false
  transmute: false
  rollover: false
economy:                     # TBD after economy modelling and legal review
  rake_pct: null
  rake_cap: null
  no_bet_no_rake: null
  jackpot_drop: null
  jackpot_min_pot: null
```

---

## 16. Roadmap

| Phase | What | Done when |
|---|---|---|
| 0. Paper prototype | Standard deck + chips, 4–6 people, 30+ hands | The reveal is fun; the rules fit on one card; first opinions on the §10 flags |
| 1. Engine + simulation | Headless rules engine; random, heuristic and search bots | Stronger bots beat weaker ones by a clear margin; §17 metrics in range |
| 2. Digital prototype | Online play-money tables, timers, basic effects | Median hand ≤ 120 s; testers ask for "one more hand" |
| 3. Play-money soft launch | Art, audio, tutorial, telemetry, A/B flags | Healthy retention and session data |
| 4. Real money | License, compliance, payments, jackpot | Live in a licensed market |
| Later | Open Ingredient, tournaments, pot-limit, heads-up | The player base can fill extra queues |

---

## 17. Metrics

Baselines come from Appendix A (random casting, nobody folds). Targets are first guesses, to recalibrate after phases 0–1.

| Metric | Why it matters | Baseline, 6 players | Target |
|---|---|---|---|
| Median hand length | More hands per hour, less waiting | — | ≤ 120 s |
| Players at the final reveal | The reveal is the product | 6 (no folds) | ≥ 2 on average |
| Comebacks: the sole leader after round 2 doesn't win | Keeps everyone in the hand | 42.9% | 30–50% |
| Rounds with a collision | The signature moment | 65.5% (86.4% if everyone casts high) | Most rounds |
| Rounds with no winner | Empty rounds feel flat | 0.3% | < 5% |
| Showdowns decided by the reserve | A spice, not the main event | 19.6% | ≤ 25% |
| Players completing a recipe | Visible and reachable, not automatic | ~8% | 15–35% |
| Skill gradient | Skill must pay over time | — | Expert bot clearly beats novice bot over 10k hands; novice still wins single hands often |

---

## 18. Open decisions

1. The §10 flags, especially `recipe_bonus`, `burned_counts_for_recipes` and `apprentice_reflection`, after the paper prototype.
2. Jackpot tiers, drop and payouts (economy model).
3. Rake values and the no-bet rule.
4. Licensing jurisdiction and launch markets.
5. Platform priority (mobile-first assumed).
6. HUD/stats policy.
7. Final name, after the trademark search.

---

## Appendix A — Probabilities and simulation

### A.1 Exact (52-card deck)

| Event | Probability |
|---|---|
| ≥ 3 cards of one element among 6 cards | 60.4% |
| 3 random casts share an element (Essence) | 5.18% |
| 3 random casts are consecutive (Chain Reaction) | 3.19% |
| Both at once | 0.20% |
| Philosopher's Stone: four of one power among 6 cards | 0.072% (1 in 1,388) |
| Magnum Opus: four 13s among 6 cards | 0.0055% (1 in 18,048) |

There are 20,358,520 possible 6-card sets.

### A.2 Recipe chase (upper bound)

A player who ignores rounds and plays only for the recipe, choosing casts optimally over the two remaining draws:

| Recipe | Completion |
|---|---|
| Essence | 47.5% |
| Chain Reaction | 30.2% |
| Either | 60.0% |

### A.3 Baseline simulation

100,000 hands per row, nobody folds, no betting. **Random:** each player casts a random card. **High:** each player always casts their highest card.

| Players | Casting | Rounds with a collision | Rounds with no winner | Ties at the top | Decided by reserve | Split | Comebacks* |
|---|---|---|---|---|---|---|---|
| 2 | random | 5.9% | 5.9% | 20.7% | 20.7% | 0.0% | 27.8% |
| 2 | high | 10.5% | 10.5% | 16.9% | 16.8% | 0.1% | 24.8% |
| 4 | random | 32.3% | 1.1% | 21.5% | 21.5% | 0.0% | 40.6% |
| 4 | high | 51.7% | 3.3% | 21.7% | 21.6% | 0.1% | 42.8% |
| 6 | random | 65.5% | 0.3% | 19.6% | 19.6% | 0.0% | 42.9% |
| 6 | high | 86.4% | 1.8% | 22.2% | 22.1% | 0.1% | 48.9% |
| 8 | random | 88.9% | 0.1% | 18.6% | 18.6% | 0.0% | 45.3% |
| 8 | high | 98.4% | 1.6% | 21.8% | 21.7% | 0.1% | 57.4% |

\* Hands with a sole sigil leader after round 2 in which that leader does not win the pot.

Sanity check: random casting reproduces the exact recipe rates (Essence 5.1–5.3%, Chain Reaction 3.2%). Always casting high produces more Chain Reactions (10.6% of players, since high cards sit next to each other) and fewer Essences (4.2%).

Takeaways:

- Collisions are the norm at 6+ players, so the collision effect must stay quick and readable. Heads-up they are rare, and each one leaves the round without a winner.
- About one showdown in five is a tie, so the reserve rule belongs in the core rules (rule 7).
- The double Final produces comebacks in 41–49% of hands at 4–6 players: reversals are built in.
- Recipes are a strategy, not luck (§10.1).

### A.4 Card budget

| Players | Cards used per hand (6 each + 3 Catalysts) | Left in the deck |
|---|---|---|
| 6 | 39 | 13 |
| 8 | 51 | 1 |

---

## Appendix B — Example hand

Four players, stakes 1/2/4. Ada has the button, so betting goes Ben → Cleo → Dan → Ada. Cards are written as power + element: F Fire, W Water, E Earth, A Air (9E = Earth 9).

Antes: pot = 4.

**Round 1** (no betting)

- Casts: Ada 11W · Ben 11F · Cleo 6F · Dan 9E. Catalyst: 3A, so Air dominates.
- Reveal: Ada's and Ben's 11s collide and burn. No Air card survives, so the highest survivor wins: **Dan +1** with 9E.

**Round 2** (small bet = 2)

- Casts: Ada 13A · Ben 2F · Cleo 8F · Dan 10E. Catalyst: 5F, so Fire dominates.
- Betting: Ben checks. Cleo bets 2: her cast is Fire, and her second Fire toward Essence. Dan calls. Ada raises to 4: her 13A is not Fire, but with 11W already cast, 13A now and 12W in hand, her Chain Reaction is locked in. Ben folds. Cleo and Dan call. Pot = 16.
- Reveal (Ada, Cleo, Dan): no collision. 8F is the only Fire card, so **Cleo +1**, beating Ada's 13. Ben's 2F is discarded unseen.

**Round 3 — Final** (big bet = 4, winner +2)

- Casts: Ada 12W · Cleo 4F · Dan 9W. Catalyst: 7W, so Water dominates.
- Betting: Cleo bets 4: three Fire casts, so Essence is secured. Dan raises to 8: his 9W is Water. Ada re-raises to 12, the cap: her 12W is Water too, and it completes her chain. Cleo and Dan call. Pot = 52.
- Reveal: no collision. Water cards: 12W and 9W, so **Ada +2**.

**Showdown**

| Player | Round sigils | Casts | Recipes | Score |
|---|---|---|---|---|
| Ada | 2 | 11W 13A 12W | Chain Reaction 11-12-13 (the burned 11W still counts) | **3** |
| Cleo | 1 | 6F 8F 4F | Essence (Fire) | 2 |
| Dan | 1 | 9E 10E 9W | — | 1 |

Ada wins the 52-unit pot, minus rake.
