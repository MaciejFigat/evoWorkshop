## Passport: Sunset Break

Kind: mechanic
Core: ladder. A crash game: one multiplier climbs from 1.00x while the wave builds and stops at a hidden bust point; whoever has cashed out before it keeps stake times the multiplier at the moment of exit
Source of randomness: sequential hazard. The bust point is drawn at round start from the seed, before the ride, as `max(1.06, floor(99 / (1 - r)) / 100)`; the optional bonus point (a faster climb rate, 58% of waves) is drawn right after it and always lies below the bust point. The ride only plays the drawn state back
Player decisions:
- Stake size: scales the whole return distribution, EV per unit staked unchanged
- Cash-out moment, by tap or by an armed auto target: picks a point on the ladder. An early exit trades a small sure multiplier for a high hit rate, a late exit the reverse; both are evaluated against a bust point fixed before the ride, so the choice reshapes the variance and never the EV
Removed from the original: nothing physical. The surf, the pop-up, the carve down the line and the spray are presentation only; nothing the player does moves the rider or the wave
Kept: the exit moment
Round format: shared per table (live), one wave for everyone in the water; 6 s betting window, a ride of a few seconds up to about 20 s, 3 s wipeout reset, 20 to 30 s per round in total
Business model: house-banked, target RTP 96%. The prototype's crash distribution pays about 98 to 99% to any fixed cash-out target (2M-round simulation of the formula) and has to be retuned to the target before certification
Embedding level: A standalone game or B bonus round
Red flags: illusion of control around the cash-out timing (the bust point is set before the ride, the tone must not suggest reading the wave helps); the other riders in the feed are simulated and must read as such; near-miss by frame overshoot is excluded (an auto target at or above the bust point loses, below it pays the target exactly)
Free when porting: theme, art, sound, pace, input. Requires recertification: the crash distribution, the floor of 1.06, the bonus chance and bonus range, the climb rates, the betting window, the stake limits
