# Alchemy Brawl — Main Variant Specification

**Version:** 0.3 (draft) · **Date:** 14 Oct 2026 · **Status:** round structure locked for the paper prototype · **Replaces:** §3–§8 of v0.1

> **Pitch.** Two rounds, one hidden card each, shared cards on the table. Your card plus two table cards make a three-card poker hand. Round 1 is a cheap gamble with no betting: stay and risk a card for a small share of the antes, or skip and keep it. The Final holds most of the money and the only betting.

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
| Final | Second round. The only betting round. Worth 70% of the ante pot plus all bets |
| Table cards | Shared face-up cards in the center: 2 in Round 1, 3 in the Final, fresh each round |
| Cast | The one card from your hand you play in a round, face down until the reveal |
| Combination | Your cast plus two table cards, ranked as a three-card poker hand (§5) |
| Stay / skip | Round 1 decision. Stay: cast a card for the Round 1 pot (it is spent) and show another card. Skip: play nothing this round |
| Shown card | A card a Round 1 stayer turns face up. It stays in their hand, visible to everyone until the end of the hand |
| Reveal | The casts of everyone still contesting flip at the same time |
| Spent | Every card cast in a round leaves play after that round, the winner's included |

---

## 3. Rules in seven lines (player-facing)

1. Everyone antes. 30% of the antes go to Round 1, 70% to the Final.
2. You get 3 cards. Each round starts with table cards turned face up: 2 in Round 1, 3 in the Final.
3. Your card plus two table cards make a three-card poker hand: straight flush, three of a kind, straight, flush, pair, high card.
4. Round 1 has no bets. Within 20 seconds everyone decides at once: stay (play a card face down and show another one) or skip. If you're the only one who stays, you take the pot without revealing.
5. Everyone draws 1 card. In the Final, everyone plays a card face down, then there is fixed-limit betting.
6. The best combination wins the round's pot. Equal combinations split it.
7. Every card you play is spent. If you skip Round 1, your cards stay in your hand.

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
   - **stays**: picks a card to cast face down **and** picks one other card from their hand to show face up; or
   - **skips**: plays nothing.

   Choices are locked when made and hidden until the window closes. On timeout the player skips.
3. **Show** — when the window closes, everyone sees who stayed and each stayer's shown card. Shown cards stay in their owners' hands, face up until the end of the hand, and can be cast in the Final.
4. **Resolve:**
   - No stayers: the Round 1 pot rolls into the Final pot.
   - One stayer: takes the Round 1 pot. Their cast is discarded face down, unrevealed.
   - Two or more stayers: their casts are revealed. The best combination (§5) takes the Round 1 pot; equal best combinations split it.
5. **Spend** — every stayer's cast leaves play. The Round 1 table cards are discarded.

### 4.3 Draw

Every player draws 1 card. Players who stayed in Round 1 now hold 3 cards; players who skipped hold 4.

### 4.4 Final

1. **Table** — turn up 3 fresh table cards.
2. **Cast** — everyone simultaneously places one card face down, under the cast timer.
3. **Betting** — fixed limit (§6). A player who folds is out of the hand; their cast is discarded unrevealed.
4. **Reveal and resolve:**
   - If only one player is left after betting, they win the Final pot without a reveal.
   - Otherwise the remaining casts flip together. The best combination takes the Final pot; equal best combinations split it.
5. **Payout** — the Final pot holds 70% of the antes, all bets and any Round 1 rollover.

### 4.5 Round summary

| | Round 1 | Final |
|---|---|---|
| Hand at the decision | 3 | 3 (stayed in Round 1) or 4 (skipped) |
| Table cards | 2 | 3 |
| Your combination | Cast + both table cards | Cast + the best two of the three table cards |
| Decision | Stay (cast + show a card) or skip, all at once | Check, bet, call, raise, fold, in turn |
| Chips at risk | None; you risk a card | Fixed-limit bets |
| Pot | 30% of the antes | 70% of the antes + bets + rollover |
| Reveal | Only if 2+ players stay | Only if 2+ players remain |
| Bluff | Stay alone with a weak card; choose what card to show | Standard betting bluff, supported by your shown card |

### 4.6 Odd chips

When a pot is split, any odd chip goes to the first tied player clockwise from the button.

### 4.7 End of the hand

The button moves one seat clockwise. Nothing carries over between hands.

---

## 5. Combinations

Your combination is always **your cast plus exactly two table cards**. In the Final you use the best two of the three table cards. You can't play the table cards alone.

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
- A straight ranks above a flush because, with these table counts, a player makes a straight less often than a flush (§8).

```text
best_combination(cast, table):
    return max(rank(cast, a, b) for each pair (a, b) of table cards)

rank(x, y, z):
    returns (category, comparison values) as in the table above

winner(contestants):
    best = max(best_combination(c.cast, table) for c in contestants)
    return all contestants whose combination equals best    # split if more than one
```

---

## 6. Betting (Final only)

| Parameter | Default |
|---|---|
| Structure | Fixed limit |
| Ante | 1 unit |
| Final bet | 3 units |
| Cap | 3 bets per betting round (a bet and two raises) |
| Order | First active player clockwise from the button; the button acts last |

- Actions: check, bet, call, raise, fold.
- **All-in and side pots:** standard poker table-stakes rules. An all-in player stays in the hand and can win only the pots they contributed to.
- **Pot-odds hint** on the Call button: required win rate = call ÷ (pot + call). No win-probability calculators at real-money tables.
- Largest possible pot at 6 players: 6 (antes) + 6 × 9 (capped bets) = 60 units.

---

## 7. Table rules and timing

| Item | Default |
|---|---|
| Seats | 3–11; 6-max is the main format |
| Round 1 decision window | 20 s, simultaneous; on timeout, skip |
| Final cast timer | 12 s; on timeout the lowest-power card in hand is cast |
| Action timer | 10 s + 20 s time bank; on timeout check if possible, otherwise fold |
| Target | Median hand ≤ 90 s at 6 players (to validate in the prototype) |

**Card budget:** 4 cards per player + 5 table cards per hand.

| Players | 4 | 6 | 8 | 10 | 11 |
|---|---|---|---|---|---|
| Cards used | 21 | 29 | 37 | 45 | 49 |

**Round 1 prize measured in antes** = 0.3 × number of players: 0.9 at 3 players (does not cover the ante), 1.2 at 4, 1.8 at 6, 2.4 at 8, 3.0 at 10.

---

## 8. Combination odds

Monte Carlo, 40,000 rounds, 6 players. "Player's best" is how often a player can make that combination as their best with the cards they hold. "Wins the round" is the winning combination when all 6 players reveal their best, so it is an upper bound for real rounds, where some players skip or fold.

| Combination | Round 1, table 2, hand 3: player's best | Round 1: wins the round | Final, table 3, hand 3: player's best | Final: wins the round | Final, table 3, hand 4: player's best | Final: wins the round |
|---|---|---|---|---|---|---|
| Straight flush | 0.6% | 3.3% | 1.8% | 9.7% | 2.4% | 12.2% |
| Three of a kind | 0.7% | 3.6% | 2.1% | 9.7% | 2.7% | 11.7% |
| Straight | 7.9% | 21.7% | 20.2% | 47.1% | 25.0% | 47.3% |
| Flush | 11.5% | 17.4% | 24.7% | 20.3% | 27.3% | 17.7% |
| Pair | 30.8% | 51.4% | 31.2% | 13.1% | 29.6% | 11.2% |
| High card | 48.5% | 2.7% | 20.1% | 0.1% | 13.0% | 0.0% |
| **Exact ties for the win** | | **31.8%** | | **30.1%** | | **39.9%** |

**Known issue — ties.** Each player owns only one card in the combination and the table is shared, so two players holding the same power usually make identical combinations. With all 6 players revealing, about a third of rounds end in a split. Real rounds will split less often, because fewer players reveal; the prototype has to measure the real rate.

---

## 9. Open decisions

1. Split rate: measure how often pots are split in real play.
2. Final bet size: 3 units by default; 2 and 4 to compare.
3. 3-player tables: the Round 1 pot (0.9 ante) doesn't cover the ante. Either guarantee one ante in Round 1 or start tables at 4 seats.
4. Rake on the Round 1 pot, where no bets are made.
5. Round names, and poker names or alchemy names for the combinations.
6. Heads-up tables: launch later or tune separately.
7. Bot simulation of betting and bluffing under these rules, to set reference numbers.

---

## Appendix — Example hand

4 players (Ana, Boris, Vera, Gleb). Ante 10 → ante pot 40: Round 1 pot 12, Final pot 28. Final bet 30. The button is Ana, so Boris acts first in the Final.

**Deal.** Boris: 3 Earth, 10 Fire, 12 Water. Vera: 6 Water, 13 Earth, 9 Air. Gleb: 2 Fire, 11 Air, 5 Water. Ana: 7 Fire, 12 Earth, 13 Air.

**Round 1.** Table: 10 Air, 11 Earth. A 9 or a 12 makes a straight; a 10 or an 11 makes a pair.

- Within the 20-second window, at the same time:
  - Boris stays, casts 3 Earth and shows 12 Water. He hopes to be alone; the shown 12 suggests he could hold a straight.
  - Vera stays, casts 9 Air and shows 6 Water.
  - Gleb and Ana skip. Ana keeps her 12 Earth for the Final.
- The window closes: everyone sees that Boris and Vera stayed, and their shown cards.
- Reveal: Boris has high card (11-10-3), Vera a straight (9-10-11). Vera takes 12 and covers her ante. Boris's bluff failed: in a simultaneous decision he couldn't know Vera would stay.

**Draw.** Boris: 10 Fire, 12 Water (shown), 5 Fire. Vera: 13 Earth, 6 Water (shown), 7 Water. Gleb: 2 Fire, 11 Air, 5 Water, 4 Fire. Ana: 7 Fire, 12 Earth, 13 Air, 1 Earth.

**Final.** Table: 3 Fire, 6 Fire, 9 Earth.

- Casts: Boris 10 Fire, Vera 6 Water, Gleb 4 Fire, Ana 7 Fire.
- Their best combinations: Boris a Fire flush 10-6-3, Ana a Fire flush 7-6-3, Gleb a Fire flush 6-4-3, Vera a pair of 6s.
- Betting: Boris bets 30, Vera and Gleb call. Ana reads Boris as weak, because his shown card, 12 Water, doesn't fit a Fire table, and raises to 60. Boris raises to 90 (the cap). Vera and Gleb fold, Ana calls. Final pot: 28 + 30 + 30 + 90 + 90 = 268.
- Reveal: Boris's flush 10-6-3 beats Ana's flush 7-6-3. Boris takes 268.

**Result.** Boris +168, Vera −28, Gleb −40, Ana −100. Boris's shown card did its job in the Final: it was real, but it pointed the table away from his actual hand.
