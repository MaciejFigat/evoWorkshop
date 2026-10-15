## Passport: Alchemy Brawl

Kind: game
Core: none. The Round 1 pot goes to the best three-card poker combination made of the one card a stayer turns face up plus the two shared table cards, or to a lone stayer without a contest; the Final pot goes to the best three cards among a player's whole hand and the three shared table cards, or to the last player standing after fixed-limit betting; the full rules are in `games/alchemy-brawl/spec.md` (v0.5)
Source of randomness: shuffled deck, one server seed per hand; the client never draws
Player decisions:
- Round 1, stay or skip, all seats at once: which one card to show. Nothing is spent or discarded; the shown card plays for the Round 1 pot with the two table cards and stays in the hand, face up, until the hand ends. Rewards reading the table cards and weighing the pot against the information given away
- Final, fixed limit: check / bet / call / raise / fold in turn, with the whole hand of 4 cards in play against three table cards, after everyone has drawn one. Rewards reading opponents, their shown cards and pot odds, as in fixed-limit poker
Removed from the original: nothing; this is an original design, not a port
Kept: the simultaneous Round 1 decision, the shown card as public information, the Final showdown of whole hands
Round format: multiplayer table, 3 to 11 seats (6 by default), create a table or join one by its code; a hand lasts 60 to 90 s
Business model: rake from pots (real money, peer-to-peer licence category, poker-like); this prototype runs play money only
Embedding level: A standalone game
Red flags: collusion (soft-play, chip dumping, coordinated folding); bots at real-money tables; appeal to children through the art style; the split rate, about 30% of revealed rounds in the spec's simulation, to be measured in real play
Free when porting: theme, art, sound, pace, input. Requires recertification: deck, combination ranking, ante, Final bet, bet cap, the 30/70 split, timers
