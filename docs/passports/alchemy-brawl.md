## Passport: Alchemy Brawl

Kind: game
Core: none. The pot goes to the best three-card poker combination made of a hidden cast plus two shared table cards; the full rules are in `games/alchemy-brawl/spec.md` (v0.3)
Source of randomness: shuffled deck, one server seed per hand; the client never draws
Player decisions:
- Round 1, stay or skip, all seats at once: which card to risk as the cast and which card to show. Rewards reading the table cards and bluffing with the shown card, which stays public for the rest of the hand
- Final cast: which card to play against three table cards. Rewards reading the table and the opponents' shown cards
- Final betting, fixed limit: check / bet / call / raise / fold in turn. Rewards reading opponents, their shown cards and pot odds, as in fixed-limit poker
Removed from the original: nothing; this is an original design, not a port
Kept: the simultaneous Round 1 decision, the shown card as public information, the reveal
Round format: multiplayer table, 3 to 11 seats (6 by default), create a table or join one by its code; a hand lasts 60 to 90 s
Business model: rake from pots (real money, peer-to-peer licence category, poker-like); this prototype runs play money only
Embedding level: A standalone game
Red flags: collusion (soft-play, chip dumping, coordinated folding); bots at real-money tables; appeal to children through the art style; the split rate, about 30% of revealed rounds in the spec's simulation, to be measured in real play
Free when porting: theme, art, sound, pace, input. Requires recertification: deck, combination ranking, ante, Final bet, bet cap, the 30/70 split, timers
