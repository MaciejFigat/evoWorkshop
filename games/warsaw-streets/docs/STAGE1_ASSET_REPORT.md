# WARSAW STREETS — Stage 1: Asset Inspection & Asset Specification

## 1. What was inspected

No game exists yet. `Desktop/TESTING` contains an unrelated React/Vite app (`gmp-create-certificate`), a chatbot prototype and a symlink to Day Log. None of it was touched. The game lives in the new folder `warsaw-streets/`.

Five images were attached. They are copied unmodified to `assets/reference/`:

| Attached | Stored as | Content | Size |
|---|---|---|---|
| 1 | `stages_strips.webp` | 3 stacked stage panoramas (Stare Miasto sunset, Vistula riverfront night, downtown skyline + metro "Centrum") | 2000×667 |
| 2 | `ray_sheet.webp` | RAY character-select + pose sheet | 1536×1024 |
| 3 | `roster_enemies.webp` | Roster / enemy sprite strips + 4 stage mock-ups with HUD | 1536×1024 |
| 4 | `mitsuyo_sheet.webp` | MITSUYO character-select + pose sheet | 1536×1024 |
| 5 | (not stored) | **Byte-identical duplicate of 4** (`cmp` confirmed) | — |

**Nina's own sheet was not among the attachments.** The brief calls the first reference "Nina's character selection screen"; the files contain Ray's and Mitsuyo's sheets instead.

## 2. Technical findings (measured, not guessed)

- **No transparency.** None of the images has an alpha channel. Every sprite sits on a navy background.
- **The background is not a flat colour.** It varies by a few RGB values (e.g. 20,32,58 vs 19,31,56) because of compression noise, so exact colour-keying leaves a halo. Sampling found 54k–108k distinct colours per sheet. These are AI-rendered, anti-aliased "pixel-style" images, not true indexed pixel art. Extraction needs tolerance-based keying plus edge cleanup, and the result will look softer than genuine 16-bit sprites.
- **Labels and UI are baked in** (WALK, JAB, HURT, portraits, stat bars, titles). Cutting must be by hand-picked rectangles, never by equal-width slicing.
- **Equal-width slicing would fail.** Sprite widths on Ray's sheet range from 93 to 214 px. On Ray's first row the jab / straight / hook / uppercut poses merge into one 489-px connected blob (their limbs and shadows touch), so even gap detection cannot separate them automatically.
- **Foot baselines are consistent within a row** (Ray row 1 foot-Y 585–591, row 2 829–831; Mitsuyo row 1 573–580, row 2 822–827). That is good: a shared foot pivot is achievable. Standing height is ~170–180 px on both sheets, so scale is roughly consistent between Ray and Mitsuyo.

## 3. Per-asset verdict

| Asset | Usable? | Why |
|---|---|---|
| **Ray sheet (2)** | Partly. Good source for poses, not a sprite sheet | 3 idle frames, 2 walk frames, and one pose each for guard, jab, straight, hook, uppercut, dodge, block, hurt, knockdown, crouch, jump, finisher. Missing: attack startup/recovery frames, walk cycle beyond 2 frames, get-up/recovery, dead frame. GRAB / THROW / GROUND CONTROL are baked together with a camo-trousered enemy that is not in the roster, so they are **unusable** (and conflict with Ray being a pure boxer). |
| **Mitsuyo sheet (4)** | Partly | 3 idle frames, single poses for walk, guard, stalk, grab, push, hurt, knockdown, crouch, jump. Takedown, ground control, submission, grab, throw, back control and finisher poses have a blue-gi opponent merged into the same sprite. These cannot be reused against independent enemies. They need separate attacker and victim art. |
| **Nina** | **No** | No dedicated sheet. She appears only as ~55-px strips in the roster sheet: 1 frame per action (idle, walk, guard, punch, kick, grab, knockdown) and a greyed-out select portrait. In those strips she has a **ponytail, not the specified long braid**. |
| **Roster sheet (3) — player rows** | **No** | The rows labelled RAY / NINA / MITSUYO mix characters: white-gi karateka with headbands and Nina's sprites share strips, and labels are clipped ("GRAB", "KNOCKDOWN" cut off). The portrait above "RAY" is a headband karateka, which contradicts Ray's own sheet (curly hair, boxing gloves). |
| **Enemies (3)** — Italian mafia goon, Pimp, Polish Uncle, Bad Girl | Concept only | Tiny (~55–70 px tall), 1 frame per action, no attack startup/recovery, inconsistent scale against the 175-px heroes. Usable as design reference and as a palette/costume guide. |
| **Stage strips (1)** | Backdrops only, not parallax layers | Each panorama is ~2000×222. The walkable pavement is only the bottom ~40 px, there are no separate sky / far / near layers, and the left and right edges carry unique foreground props (pillars, signs), so **they do not tile seamlessly**. They cover stage 1 only (downtown) and its variants. Stages 2–6 (subway, warehouse, garage, mafia HQ, boss arena) have no art. |
| **HUD mock-ups (3)** | Reference only | Show the intended HUD layout (portrait, name, red health bar, 6-digit score, PRESS START). Rebuild in canvas/CSS rather than cropping. |

## 4. Corrections needed

1. Provide Nina's sheet, or approve placeholder art for her.
2. Pick one canonical Ray (the boxer on sheet 2) and discard the roster-sheet "Ray".
3. Decide Nina's hair: braid (spec and select screens) versus ponytail (roster strips).
4. Grab / throw / ground-control sprites need attacker and victim drawn separately (or a grapple system that overlays two ordinary sprites).
5. Enemies need redrawing at hero scale, with more frames.

## 5. Asset specification (what the engine will consume)

**Format.** One PNG per character, 32-bit RGBA with a transparent background, no labels, no shadows baked in (the engine draws a shadow). Alongside it, one JSON file listing frames.

**Cell.** Fixed 192×192 px cells. Foot pivot is the bottom-centre of the standing pose at (96, 176). Standing height is about 140 px in every cell for every character. Attack poses extend sideways but keep the same pivot, so the engine never has to correct offsets. Frames face **right**. The engine mirrors them for left.

**Folder layout.**
```
warsaw-streets/
  index.html
  css/style.css
  src/            engine.js, animation.js, input.js, combat.js, ai.js, stage.js, hud.js, main.js
  data/           characters.json, enemies.json, stages.json   (animations, frame lists, timings, hitboxes)
  assets/
    reference/    original concept sheets (read-only)
    sprites/      ray.png, nina.png, mitsuyo.png, enemy_*.png
    stages/       stage1_far.png, stage1_mid.png, stage1_near.png ...
    ui/           portraits, font
    audio/
  docs/           this report, controls, known limitations
```

**Minimum frame list per player character** (≥ 3 frames for anything with startup, active and recovery):

| Animation | Frames | Notes |
|---|---|---|
| idle | 3–4 | loop |
| walk | 4–6 | loop |
| guard | 1–2 | hold |
| attack 1 / 2 / 3 (combo) | 3 each | startup, active, recovery |
| special / heavy | 4 | |
| jump (up / peak / fall / land) | 4 | |
| hurt | 1–2 | |
| knockdown | 3 | fall, impact, lying |
| getup | 3 | |
| dead | 1 | lying, flashing in-engine |
| victory | 2 | optional |

Character-specific moves:
- **Nina:** jab-cross, low kick, high kick, spinning kick, run.
- **Ray:** jab, straight, hook, uppercut, dodge, block. No kicks.
- **Mitsuyo:** grab, push, takedown, throw, ground control, submission. No strikes. Victim sprites are separate or generic.

**Enemies:** the same list, with at least idle, walk, 2 attacks, hurt, knockdown, getup and dead.

**Stages (per stage):** 3–4 transparent or opaque layers (sky, far skyline, mid buildings, near street), each at least 2× the screen width. They tile horizontally or have a defined start and end. A ground band about 80 px tall is reserved for characters to walk in, with a marked horizon line.

## 6. Resolution decision for Stage 2

The concept art is ~175 px per character, much larger than real 16-bit games, where characters are ~100–120 px on a 384×224 screen. Proposal: internal canvas **640×360**, integer-scaled to the window, with characters ~130 px tall. Concept sprites scale ×0.75, so extracted sprites will look slightly soft. This needs your sign-off.

## 7. Plan for Stage 2 (pending answers)

- **Option A (recommended):** write a small one-off extraction script that cuts Ray's and Mitsuyo's usable poses out of the sheets with hand-defined rectangles, removes the background with tolerance keying and edge erosion, trims each frame to its bounding box, and aligns it to the 192×192 foot pivot. Build the animation engine against that output and run Ray against the Italian goon.
- **Option B:** generate temporary placeholder sprites in code so the engine, combat and AI can be tested right now, and swap in real art later without touching the engine.
