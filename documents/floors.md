# The Binding of the Agent: Floors and themes

All floor themes in the game, what each one looks and sounds like, and what (if anything) changes in gameplay.


## How floors work

**Cycle.** There are 11 floor themes. Floor *n* uses theme *(n − 1) mod 11*, so the list repeats forever: floor 12 is
The Backlog again, floor 14 is Forgotten Branches again, and so on. Repeated floors get a roman numeral on the floor
card ("The Backlog II").

**Depth vs. theme.** Difficulty follows the **depth** (floor number), never the theme: enemy unlocks, room budgets, HP
scaling and boss pools all go by depth. The theme decides the look, the music, the breakable objects and a few
theme-specific extras (marked *Gameplay* below).

**What a theme controls** (`B.FLOOR_THEMES` in `src/data/palette.js`, names in `B.TEXT.FLOORS` in `src/data/text.js`):
- **Colours:** floor checkerboard, walls, doors, an accent colour (floor card, HUD floor name, minimap frame), a soft
  light in the room centre and the vignette tint.
- **Floor pattern** and **decor** (background details baked into the room), optionally **wall decor** and an animated
  **ambient** layer.
- **Breakable objects:** which kinds appear, in how many combat rooms, and how many per room.
- **Music:** root note, scale, tempo and lead instrument of the procedural chiptune loop.
- **Tile sprites (optional):** a theme can swap the look of rocks, blocks or spikes (`tiles`); Sandbox Borders uses
  this for sandstone boulders and border fences.
- *Gameplay (optional):* map shape (`gen`), cacti (`cacti`), themed enemies and bosses (`themes` / `themeOnly`),
  extra quips and epitaphs.

Things that look **the same on every floor**: pits and spikes, doors and the special rooms (treasure, shop, boss,
secret); rocks and blocks too, except on Sandbox Borders.

---

## Overview

| | # | Floor | Pattern | Decor | Breakables | Music | Extras |
|---|---|---|---|---|---|---|---|
| ![The Backlog](images/floor_backlog_swatch.png) | 1 | **The Backlog** `backlog` | Wooden planks | Sticky notes and paper scraps | Crates | D dorian, 104 bpm, square | — |
| ![Legacy Codebase](images/floor_legacy_swatch.png) | 2 | **Legacy Codebase** `legacy` | Irregular stone slabs | Cobwebs in corners | Crates | A minor, 92 bpm, triangle | — |
| ![Forgotten Branches](images/floor_branches_swatch.png) | 3 | **Forgotten Branches** `branches` | Moss, soil and grass | Roots drawn like a `git log --graph` | Bushes | G dorian, 98 bpm, triangle, bird calls | Ivy, fireflies, branchier maps, own enemy family and boss |
| ![Dependency Hell](images/floor_dephell_swatch.png) | 4 | **Dependency Hell** `dephell` | Square tiles | Glowing cracks and embers | Packages, cartons | B phrygian, 128 bpm, sawtooth | — |
| ![Production](images/floor_production_swatch.png) | 5 | **Production** `production` | Checker plate with rivets | Hazard stripes at doors, cables | Packages, cartons | A harmonic minor, 138 bpm, square | — |
| ![Sandbox Borders](images/floor_sandbox_swatch.png) | 6 | **Sandbox Borders** `sandbox` | Rippled sand | Bleached bones, pebbles, dry grass | Sandcastles | D phrygian, 100 bpm, triangle | Cacti (solid, prick), border fences, sandstone, tumbleweeds |
| ![The Training Data](images/floor_training_swatch.png) | 7 | **The Training Data** `training` | Graph paper | Scattered characters (`0 1 {} lol tl;dr nan`) | Cartons, crates | E major, 116 bpm, triangle | — |
| ![The Latent Space](images/floor_latent_swatch.png) | 8 | **The Latent Space** `latent` | Dot grid | Stars and a constellation | Bushes, packages | C lydian, 96 bpm, sine | — |
| ![Undefined Behavior](images/floor_undefined_swatch.png) | 9 | **Undefined Behavior** `undefined` | Square tiles | Shifted colour stripes (glitches) | All four kinds | B♭ locrian, 144 bpm, square | — |
| ![/dev/null](images/floor_devnull_swatch.png) | 10 | **/dev/null** `devnull` | Dot grid | Almost nothing: a few lost bits | Crates, packages | G minor, 80 bpm, triangle | — |
| ![The Context Limit](images/floor_context_swatch.png) | 11 | **The Context Limit** `context` | Square tiles | Fading fragments of earlier context | All four kinds | C♯ mixolydian, 108 bpm, square | — |

The swatch is a tiny room in the theme's colours: wall, floor checkerboard, door (top) and accent (centre dot).

### Colour coverage

Almost all floors are **dark**: the floors sit at low brightness so that sprites, pickups and enemy shots stand out.
Sandbox Borders is the one mid-bright floor; its sand is muted on purpose so yellow and amber shots stay readable. By hue:

- **Browns / warm:** The Backlog (brown), Dependency Hell (rust with orange embers), Production (grey with red walls).
- **Sand / yellow:** Sandbox Borders (dusky sand, sun-yellow accent).
- **Greens:** Forgotten Branches (forest green), The Training Data (muted green).
- **Blues / violets:** Legacy Codebase (blue-grey), The Latent Space (indigo), The Context Limit (pale fog blue).
- **Other:** Undefined Behavior (magenta-purple), /dev/null (near black).

**Gaps:** nothing cyan or teal, and nothing truly bright (white, snow, light stone). Several enemies fire yellow or
amber shots, so check contrast with screenshots before settling on a bright palette.

---

## The floors

### 1. The Backlog

*Where tickets go to die.*

![The Backlog](images/floor_backlog.jpg)

- **Look:** warm cardboard brown; horizontal wooden planks with staggered joints; forgotten sticky notes (yellow, pink,
  blue, green) and paper scraps on the floor. Accent: coral `#d97757` (the avatar's colour).
- **Breakables:** crates in 60 % of combat rooms, up to 3 per room.
- **Music:** D dorian, 104 bpm, square lead.

### 2. Legacy Codebase

*Written by someone who left in 2009.*

![Legacy Codebase](images/floor_legacy.jpg)

- **Look:** dusty blue-grey; old, irregular stone slabs (1, 2 or 4 per tile); cobwebs in the inner corners. Accent:
  steel blue `#7fb0c9`.
- **Breakables:** crates in 65 % of combat rooms, up to 3 per room.
- **Music:** A minor, 92 bpm, triangle lead.

### 3. Forgotten Branches

*It is probably for the best that these never got merged.*

![Forgotten Branches](images/floor_branches.jpg)

- **Look:** forest floor of moss cushions, soil patches and grass blades instead of joints. Roots on the floor are a
  little `git log --graph`: a trunk with commit dots and one or two branches that split off and never merge back. Ivy
  hangs from the walls and fireflies drift through the room. Accent: leaf green `#a6d36b`.
- **Breakables:** bushes in 80 % of combat rooms, up to 4 per room.
- **Music:** G dorian, 98 bpm, triangle lead, with an occasional bird call (never during the boss fight).
- **Gameplay, maps:** branchier, with at least 7 dead ends per floor instead of 3 (`gen.minDeadEnds`).
- **Gameplay, enemies:** an own family found only here: Stale Branch, Detached HEAD, Cherry-Pick and the Orphan
  Commit (see the enemies list). They share a woody look, leaf effects and wood-knock sounds.
- **Gameplay, boss:** the Octopus Merge, about 52 % on floor 3 and 41 % on floors 14, 25, … on a first visit.
- **Extra text:** room-clear quips ("Branch deleted", "Stale for 847 days", "Rebased onto nothing", …) and epitaphs
  ("Died on a branch nobody remembers.", …) mixed into the general lists.

### 4. Dependency Hell

*node_modules now has its own gravitational field.*

![Dependency Hell](images/floor_dephell.jpg)

- **Look:** rusty dark brown; square tiles with bevelled edges; glowing cracks and ember dots. The strongest light of
  all floors (orange). Accent: amber `#f0a03c`.
- **Breakables:** packages and cartons in 70 % of combat rooms, up to 4 per room.
- **Music:** B phrygian, 128 bpm, sawtooth lead.

### 5. Production

*Don't touch anything. Especially on a Friday.*

![Production](images/floor_production.jpg)

- **Look:** industrial grey checker plate with diagonal studs and riveted seams; dark red walls; yellow-black hazard
  stripes in front of the doors and cables across the floor. Accent: signal red `#e05a4f`.
- **Breakables:** packages and cartons in 70 % of combat rooms, up to 4 per room.
- **Music:** A harmonic minor, 138 bpm, square lead.

### 6. Sandbox Borders

*Nobody mentioned the cacti. Or the lack of water.*

![Sandbox Borders](images/floor_sandbox.jpg)

- **Look:** the edge of the sandbox: dusky, rippled sand (muted, so yellow and amber shots stay readable),
  sandstone walls, bleached bones in the sand (horned skulls, ribcages, single bones), pebbles and dry grass. Now and
  then a tumbleweed rolls across the room. Accent: sun yellow `#f2b84b`.
- **Obstacles:** rocks become sandstone boulders, and indestructible blocks become the border itself: chain-link
  fences with barbed wire where blocks line up, striped concrete barriers where they stand alone.
- **Gameplay, cacti:** half of the rocks in combat rooms are cacti instead. They are solid like rocks but prick you
  on contact (half a heart and a push back); bombs blow them up. Never right in front of a door.
- **Breakables:** sandcastles in 75 % of combat rooms, up to 4 per room; when damaged, a tower collapses.
- **Music:** D phrygian, 100 bpm, triangle lead.
- **Extra text:** room-clear quips ("Permission denied", "Sandbox violation logged", "No water found", …) and
  epitaphs ("Escaped the sandbox. Not the cactus.", …).

### 7. The Training Data

*It's mostly forum arguments.*

![The Training Data](images/floor_training.jpg)

- **Look:** muted green graph paper (fine lines every 16 px, stronger every 64 px); scattered characters from the
  "training data": `0`, `1`, `{`, `}`, `;`, `+1`, `lol`, `?!`, `tl;dr`, `nan`, … Accent: lime `#8bc34a`.
- **Breakables:** cartons and crates in 70 % of combat rooms, up to 4 per room.
- **Music:** E major, 116 bpm, triangle lead.

### 8. The Latent Space

*Here be embeddings.*

![The Latent Space](images/floor_latent.jpg)

- **Look:** deep indigo with a dot grid; stars (embeddings) and one constellation per room. Accent: lavender
  `#a78bfa`.
- **Breakables:** bushes and packages in 75 % of combat rooms, up to 4 per room.
- **Music:** C lydian, 96 bpm, sine lead.

### 9. Undefined Behavior

*Anything can happen. Mostly bad things.*

![Undefined Behavior](images/floor_undefined.jpg)

- **Look:** dark purple tiles with shifted magenta and turquoise stripes, like rendering glitches. Accent: hot pink
  `#ff4fa3`.
- **Breakables:** all four kinds (crates, bushes, packages, cartons) in 80 % of combat rooms, up to 5 per room.
- **Music:** B♭ locrian, 144 bpm, square lead (the fastest loop).

### 10. /dev/null

*Everything you send here is gone. Including you.*

![/dev/null](images/floor_devnull.jpg)

- **Look:** almost black and monochrome; a faint dot grid and almost nothing else, just a few lost bits. Accent:
  pale grey `#d0d0d8`.
- **Breakables:** crates and packages in 75 % of combat rooms, up to 5 per room.
- **Music:** G minor, 80 bpm, triangle lead (the slowest loop).

### 11. The Context Limit

*You've been here before. You don't remember.*

![The Context Limit](images/floor_context.jpg)

- **Look:** pale fog blue tiles with soft fog patches; faint, half-faded fragments of earlier context on the floor
  ("[...]", "(truncated)", "as I said earlier", "[context compacted]", …). Accent: light blue `#9ec5ff`.
- **Breakables:** all four kinds in 80 % of combat rooms, up to 5 per room.
- **Music:** C♯ mixolydian, 108 bpm, square lead.

---

## Adding a floor

The step-by-step recipe is in AGENTS.md (§5, "Add a floor"). In short: add an entry at the same position in
`B.TEXT.FLOORS` and `B.FLOOR_THEMES`; new patterns, decor, wall decor or ambient layers need a case in
`src/render/renderer.js`. Inserting a floor in the middle shifts every later floor down by one and changes the cycle
length, so themed content (like Forgotten Branches) repeats on different floor numbers afterwards. Then run
`node tools/export-floors.js` and add the new floor to this document.
