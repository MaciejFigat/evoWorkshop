## Passport: Alchemy Brawl

Kind: game
Core: none. The pot goes to the best score after three simultaneous reveals; the full rules are in `alchemy_brawl_spec.md`
Source of randomness: shuffled deck, one server seed per hand; the Catalysts are the deck's next cards
Player decisions:
- which card to cast each round: rewards card reading (collisions, the Catalyst, the reserve as a tiebreaker)
- check / bet / call / raise / fold in rounds 2 and 3: rewards reading opponents and pot odds, as in fixed-limit poker
Removed from the original: nothing; this is an original design, not a port
Kept: the simultaneous reveal, the collision, the double-value Final
Round format: multiplayer table, 2–6 seats, create a table or join one by its code; a hand lasts 90–120 s
Business model: rake from pots (real money, peer-to-peer licence category, poker-like); this prototype runs play money only
Embedding level: A standalone game
Red flags: collusion (soft-play, chip dumping, coordinated folding); bots at real-money tables; appeal to children through the art style
Free when porting: theme, art, sound, pace, input. Requires recertification: deck, scoring, stakes, the rule flags in config
