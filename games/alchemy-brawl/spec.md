# Alchemy Brawl — Main Variant Specification

**Version:** 0.6 (draft) · **Date:** 15 Oct 2026 · **Status:** No-limit Final; the third table card joins the Round 1 pair · **Replaces:** §2–§4, §6–§9 and the Appendix of v0.5

> **Pitch.** Two rounds, shared cards on the table. Round 1 is a free gamble with no betting: stay by turning one card face up for a small share of the antes, or skip and keep your hand hidden. Nobody ever discards a card. The Final holds most of the money and the only betting, no-limit, and there every card you hold plays: your best three cards among your four and the three table cards, the Round 1 pair plus one more.

---

## 1. Components

| Component | Specification |
|---|---|
| Deck | 52 cards = 4 elements × 13 powers, one copy of each |
| Elements | Fire, Water, Earth, Air, each with its own color **and** shape icon. Elements work as poker suits |
| Powers | 1 (lowest) to 13 (highest). Powers work as poker ranks |
| Button | Marks the dealer seat, moves one seat clockwise each hand, sets the betting order |
| Chips | Play money or real money |

**Paper prototype:** a standard deck works as-is (suits = elements, A = 1, J = 11, Q = 12, K = 13).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| Hand | One deal: ante → Round 1 → draw → Final → payout |
| Round 1 | First round. No betting. Worth 30% of the ante pot |
| Final | Second round. The only betting round, no-limit. Worth 70% of the ante pot plus all bets |
| Table cards | Shared face-up cards in the center: 2 in Round 1; the Final keeps them and turns up a third |
| Shown card | The Round 1 play: the one card a stayer turns face up. It plays for the Round 1 pot, stays in their hand and is visible to everyone until the end of the hand |
| Combination | A three-card poker hand (§5). Round 1: your shown card plus both table cards. Final: the best three cards among your hand and the three table cards |
| Stay / skip | Round 1 decision. Stay: show one card for the Round 1 pot. Skip: show nothing this round |
| Show | Round 1: when the window closes, the shown cards of everyone who stayed go face up at the same time. Final: every remaining player's hand is shown |

---

## 3. Rules in seven lines (player-facing)

1. Everyone antes. 30% of the antes go to Round 1, 70% to the Final.
2. You get 3 cards. Round 1 starts with 2 table cards turned face up; the Final adds a third next to them.
3. Three cards make a poker hand: straight flush, three of a kind, straight, flush, pair, high card.
4. Round 1 has no bets. Within 20 seconds everyone decides at once: stay (turn one card face up) or skip. Your shown card plus both table cards is your combination. If you're the only one who stays, you take the pot.
5. Nobody discards anything: the shown card stays in your hand, face up, until the hand ends.
6. Everyone draws 1 card, to 4. In the Final all your cards play: no-limit betting, then the best three cards among your hand and the three table cards.
7. The best combination wins the round's pot. Equal combinations split it.

---

## 4. Hand flow

### 4.1 Setup

1. Every seated player posts the ante (1 unit).
2. The server shuffles the deck (certified CSPRNG).
3. Each player is dealt 3 cards face down.
4. The ante pot splits: **Round 1 pot = 30%**, **Final pot = 70%**.

### 4.2 Round 1

1. **Table** — turn up 2 table cards.
2. **Decide** — one simultaneous window of 20 seconds. Each player either:
   - **stays**: picks one card from their hand to show face up; or
   - **skips**: shows nothing.

   Choices are locked when made and hidden until the window closes: the other seats see only that a player has decided. On timeout the player skips.
3. **Show** — when the window closes, everyone sees who stayed and each stayer's shown card. Shown cards stay in their owners' hands, face up until the end of the hand, and play in the Final.
4. **Resolve:**
   - No stayers: the Round 1 pot rolls into the Final pot.
   - One stayer: takes the Round 1 pot without a contest.
   - Two or more stayers: each stayer's combination is their shown card plus both table cards. The best combination (§5) takes the Round 1 pot; equal best combinations split it.

   Nothing is spent: every player keeps all 3 cards. The Round 1 table cards stay on the table for the Final.

### 4.3 Draw

Every player draws 1 card. Everyone now holds 4 cards, whether they stayed or skipped.

### 4.4 Final

1. **Table** — the two Round 1 table cards stay and one more is turned up next to them: 3 table cards. Every card in your hand plays.
2. **Betting** — no-limit (§6), starting at once with the first player clockwise from the button. A player who folds is out of the hand; their hand stays hidden. A player who is all-in stays in the hand without acting further.
3. **Showdown:**
   - If only one player is left after betting, they win every pot without showing anything.
   - Otherwise every remaining player's whole hand is shown. Each player's combination is the best three cards among their hand and the three table cards (§5); the three table cards alone may be that best. Each pot (§6) goes to the best combination among the players eligible for it; equal best combinations split it.
4. **Payout** — the Final pot holds 70% of the antes, all bets and any Round 1 rollover.

### 4.5 Round summary

| | Round 1 | Final |
|---|---|---|
| Hand at the decision | 3 | 4 |
| Table cards | 2 | The same 2 + 1 |
| Your combination | Shown card + both table cards | Best three cards among your hand and the three table cards |
| Decision | Stay (show one card) or skip, all at once | Check, call, raise, fold, in turn |
| Chips at risk | None; you give away information | No-limit bets, up to your whole stack |
| Pot | 30% of the antes | 70% of the antes + bets + rollover |
| Shown | The stayers' shown cards, once the window closes | Hands shown if 2+ players remain |
| Bluff | Stay alone with a weak card; choose which card to show | Standard betting bluff, supported by your shown card |

### 4.6 Odd chips

When a pot is split, any odd chip goes to the first tied player clockwise from the button.

### 4.7 End of the hand

The button moves one seat clockwise. Nothing carries over between hands.

---

## 5. Combinations

A combination is always exactly three cards.

- **Round 1:** your shown card plus both table cards. One shown card, one combination.
- **Final:** the best three cards among your four cards and the three table cards. Any three of them count, so the board may play: if the three table cards make the best combination, every remaining player holds at least that.

Ranking, as in three-card poker, highest first:

| Rank | Combination | Definition | Compare equal combinations by |
|---|---|---|---|
| 1 | Straight flush | Three consecutive powers of one element | Highest card |
| 2 | Three of a kind | Three cards of one power | Power |
| 3 | Straight | Three consecutive powers | Highest card |
| 4 | Flush | Three cards of one element | Highest card, then the next, then the lowest |
| 5 | Pair | Two cards of one power | Pair power, then the third card |
| 6 | High card | None of the above | Highest card, then the next, then the lowest |

- Powers run 1 to 13 with no wrap: 1-2-3 is the lowest straight, 11-12-13 the highest, 12-13-1 is not a straight.
- Elements have no order. Combinations that are equal under the table above split the pot.
- A straight ranks above a flush, as in three-card poker. In Round 1 a player makes a straight less often than a flush; in the Final, with 7 cards to choose from, a player makes a straight more often than a flush (§8). See §9.

```text
round1_combination(shown, table):
    return rank(shown, table[0], table[1])

best_of(cards):                                  # Final: cards = hand + the three table cards
    return max(rank(x, y, z) for each triple (x, y, z) of cards)

rank(x, y, z):
    returns (category, comparison values) as in the table above

winner(contestants):
    best = max(c.combination for c in contestants)
    return all contestants whose combination equals best    # split if more than one
```

---

## 6. Betting (Final only)

| Parameter | Default |
|---|---|
| Structure | No-limit |
| Ante | 1 unit |
| Minimum bet | 3 units (30 chips at ante 10) |
| Minimum raise | The size of the last raise, never below the minimum bet |
| Order | First active player clockwise from the button; the button acts last |

- Actions: check, call, raise, fold. A raise names the total you will have in the betting round after it ("raise to"); the first bet of the round is a raise from 0.
- **Check** only when you have matched the current level. **Call** pays the difference up to your stack.
- **Raise** must be at least the minimum raise above the current level: the first bet is at least the minimum bet; after a raise, the next raise must add at least as much as that raise did. A full raise reopens the action for every other player still able to act.
- **All-in:** you may always put in your whole stack, even below a call or below the minimum raise. An all-in raise below the minimum raise lifts the level but does not reopen the action for players who have already acted since the last full raise. An all-in player stays in the hand and acts no more.
- **Side pots:** standard table stakes. Pots are built by contribution level; a player is eligible for every pot they contributed to in full, folded players fund the pots but never win them. Each pot goes to the best combination among its eligible players; the main pot is split first, odd chips as in §4.6.
- **Betting ends** when every player still able to act has matched the level, or when at most one player is left able to act and nobody is owed a call.
- **Pot-odds hint** on the Call button: required win rate = call ÷ (pot + call). No win-probability calculators at real-money tables.
- Largest possible pot: the sum of the stacks at the table. A stack below ante + minimum bet is topped up to the buy-in before the hand.

---

## 7. Table rules and timing

| Item | Default |
|---|---|
| Seats | 3–11; 6-max is the main format |
| Round 1 decision window | 20 s, simultaneous; on timeout, skip |
| Action timer | 10 s + 20 s time bank; on timeout check if possible, otherwise fold |
| Rebuy | A stack below ante + minimum bet is topped up to the buy-in before the hand |
| Target | Median hand ≤ 90 s at 6 players (to validate in the prototype) |

**Card budget:** 4 cards per player + 3 table cards per hand.

| Players | 4 | 6 | 8 | 10 | 11 |
|---|---|---|---|---|---|
| Cards used | 19 | 27 | 35 | 43 | 47 |

**Round 1 prize measured in antes** = 0.3 × number of players: 0.9 at 3 players (does not cover the ante), 1.2 at 4, 1.8 at 6, 2.4 at 8, 3.0 at 10.

---

## 8. Combination odds

Monte Carlo, 40,000 rounds each, seed fixed, reproduced by the engine's simulation test. "Player's best" is how often a player's best combination falls in that category with the cards they hold. "Wins the round" is the category of the winning combination when all 6 players reveal their best, so it is an upper bound for real rounds, where some players skip or fold.

The Final is measured at 6 players, each holding 4 cards, the only shape the round structure produces now that nothing is spent. The Final table is the Round 1 pair plus one card: three random cards, so the numbers are the same as for three fresh cards. What changes is information, not odds: two of the three Final table cards are known in Round 1.

| Combination | Round 1, table 2, hand 3: player's best | Round 1: wins the round | Final, table 3, hand 4: player's best | Final: wins the round (6 × hand 4) |
|---|---|---|---|---|
| Straight flush | 0.6% | 3.3% | 6.5% | 32.4% |
| Three of a kind | 0.7% | 3.6% | 7.5% | 25.8% |
| Straight | 7.9% | 21.7% | 43.1% | 41.0% |
| Flush | 11.5% | 17.4% | 34.9% | 0.9% |
| Pair | 30.8% | 51.4% | 7.2% | 0.0% |
| High card | 48.5% | 2.7% | 0.8% | 0.0% |
| **Exact ties for the win** | | **31.8%** | | **13.0%** |

**Known issue — ties.** In Round 1 each player owns only one card in the combination and the table is shared, so two players holding the same power usually make identical combinations: with all 6 players revealing, about a third of Round 1 reveals end in a split. The Final splits far less often, 13.0% with all 6 revealing, mostly on shared straights. Real rounds will split less often, because fewer players reveal; the prototype has to measure the real rate.

---

## 9. Open decisions

1. Split rate: measure how often pots are split in real play.
2. Minimum bet: 3 units by default; 2 and 4 to compare. The no-limit structure makes a stack, not a cap, the ceiling on a hand; validate that the median hand stays within target.
3. 3-player tables: the Round 1 pot (0.9 ante) doesn't cover the ante. Either guarantee one ante in Round 1 or start tables at 4 seats.
4. Rake on the Round 1 pot, where no bets are made.
5. Round names, and poker names or alchemy names for the combinations.
6. Heads-up tables: launch later or tune separately.
7. Bot simulation of betting and bluffing under these rules, to set reference numbers, including raise sizing.
8. Staying costs only information: a stayer risks no chips and no card, only the knowledge of one card in their hand. Validate in the prototype whether players stay too often for Round 1 to be a decision at all; if so, a price for staying (a card, a chip) goes back on the table.
9. Straight above flush: in the Final a 4-card hand makes a straight more often than a flush (§8), which contradicts the three-card poker reason for the order. Either keep the familiar order or swap the two for the Final; a swap changes the engine ranking and the odds table.
10. Short all-in raises: the prototype never reopens the action on a raise below the minimum. Poker lets players who already acted still call the extra amount; decide whether that is worth the extra state.
11. The Round 1 pair carrying into the Final gives everyone two of the three Final table cards in advance; the shown card now points at the Final board too. Measure whether stays become more informative than intended.

---

## Appendix — Example hand

4 players (Ana, Boris, Vera, Gleb). Ante 10 → ante pot 40: Round 1 pot 12, Final pot 28. Minimum bet 30, no-limit; everyone sits with 1000. The button is Ana, so Boris acts first in the Final.

**Deal.** Boris: 3 Earth, 10 Fire, 12 Water. Vera: 6 Water, 13 Earth, 9 Air. Gleb: 2 Fire, 11 Air, 5 Water. Ana: 7 Fire, 12 Earth, 13 Air.

**Round 1.** Table: 10 Air, 11 Earth. A 9 or a 12 makes a straight; a 10 or an 11 makes a pair.

- Within the 20-second window, at the same time:
  - Boris stays and shows 3 Earth. Showing the 12 would make a straight, but it would also tell the table what he holds; with the 3 he wins only if he is alone, and staying costs him nothing but that one card's secret.
  - Vera stays and shows 9 Air.
  - Gleb and Ana skip. Ana keeps her 12 Earth hidden for the Final.
- The window closes: everyone sees that Boris and Vera stayed, and their shown cards. Boris has high card (11-10-3), Vera a straight (9-10-11). Vera takes 12 and covers her ante. Boris's bluff failed: in a simultaneous decision he couldn't know Vera would stay.
- Nothing is spent. Boris still holds 3 Earth (face up), 10 Fire, 12 Water; Vera holds 6 Water, 13 Earth, 9 Air (face up). The 10 Air and 11 Earth stay on the table.

**Draw.** Everyone draws to 4. Boris: 3 Earth (shown), 10 Fire, 12 Water, 5 Fire. Vera: 6 Water, 13 Earth, 9 Air (shown), 7 Water. Gleb: 2 Fire, 11 Air, 5 Water, 8 Water. Ana: 7 Fire, 12 Earth, 13 Air, 1 Water.

**Final.** Table: 10 Air, 11 Earth and the new card, 10 Water. Everyone's whole hand plays with the table.

- The card sets and the best three of each:
  - Boris: 3 Earth, 10 Fire, 12 Water, 5 Fire + 10 Air, 11 Earth, 10 Water → three 10s.
  - Vera: 6 Water, 13 Earth, 9 Air, 7 Water + table → straight 9-10-11 (the Water flush 10-7-6 is weaker).
  - Gleb: 2 Fire, 11 Air, 5 Water, 8 Water + table → Water flush 10-8-5 (the pair of 11s is weaker).
  - Ana: 7 Fire, 12 Earth, 13 Air, 1 Water + table → straight 11-12-13, the highest straight there is.
- Betting: Boris bets 30, Vera and Gleb call. Ana holds the top straight and reads Boris as weak, because his shown card, 3 Earth, has nothing to do with a board of tens; she raises to 60. Boris raises to 90, a raise of 30, the minimum. Vera and Gleb fold, Ana calls. One pot: 28 + 30 + 30 + 90 + 90 = 268; nobody was all-in, so there is no side pot.
- Showdown: Boris and Ana show their hands; Vera's and Gleb's stay hidden. Boris's three 10s beat Ana's straight. Boris takes 268.

**Result.** Boris +168, Vera −28, Gleb −40, Ana −100. Boris's shown card did its job in the Final: it was real, but it pointed the table away from his actual hand, and the two table cards he could see in Round 1 were already two of the three that made it.
