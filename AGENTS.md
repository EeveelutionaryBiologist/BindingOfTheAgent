# AGENTS.md — Technical handoff: The Binding of the Agent

This is the doc to read before changing anything. It explains how the game is put together, the rules you can't
break, how to check your work, and where the rough edges are. If you need a fact that isn't here, look in the file
header comments: every source file starts with a contract/overview block in German.

Related docs: `README.md` (player-facing: controls, debug keys), `DESIGN.md` (game design, content tables, original
build plan, and an "Implementation status" section at the end of §13), plus `documents/items.md`,
`documents/enemies.md` and `documents/floors.md` (hand-edited lists of all items and pickups, of all enemies and bosses,
and of all floor themes with screenshots and colours; update them when you add or change content). Unbuilt enemy
ideas live in `ENEMY_IDEAS.md`; remove an entry there once it's built.

---

## 0. TL;DR

- **What it is:** a Binding-of-Isaac-style roguelite in which a small Claude avatar descends random dungeon floors
  forever. It's an internal team distraction with no meta-progression. There's no real ending: after the 11th floor a
  score card offers to keep going (The Backlog II) or start over.
- **Stack:** vanilla JavaScript (ES2020), Canvas 2D and Web Audio, with **zero dependencies and no build step**.
  `index.html` loads about 30 classic `<script>` files in a fixed order, and everything hangs off `window.BOTA`.
- **Run:** open `index.html` directly from disk (`file://`). Use `?seed=ABCD-1234` for a fixed run and `?debug` for cheats.
- **Verify:** `node tools/smoke-test.js` (needs Playwright with Chromium; see §2). Exit code 0 means no console errors and
  all content checks pass.
- **Where things go:** content lives in `src/data/*`, behaviour in `src/entities/*`, drawing in `src/render/*`, and the
  engine in `src/core/*`, `src/world/*`, `src/game.js` and `src/main.js`.

---

## 1. Hard constraints (non-negotiable)

| Rule | Why |
|---|---|
| **No dependencies, no bundler, no npm runtime packages, no CDNs, no web fonts.** | "Double-click to play" on locked-down machines; nothing to audit. |
| **Classic scripts only, no ES modules.** Every file is `(function (B) { 'use strict'; … })(window.BOTA);`. | Chromium blocks ES modules from `file://` (CORS). |
| **A new `.js` file must be added to `index.html` in the right load order.** | There is no module system; a file can only use what was loaded before it. |
| **No network.** The CSP in `index.html` sets `connect-src 'none'`. Don't loosen it. | Org policy: the game must not phone home. |
| **No `eval`, `new Function`, `innerHTML`, or string timers.** Draw text with `fillText` or the helpers; never into the DOM. | No code-injection path; required by the CSP (no `unsafe-eval`). |
| **Validate any new input** (URL params, storage). See `B.params` and `B.storage` in `namespace.js`. | Seed must match `[A-Za-z0-9-]{1,32}`; storage is size-limited and type-checked. |
| **Code comments are in German and thorough**; player-facing text is in English. | Team convention plus org requirement (every non-trivial block explained). |
| **Content must be original.** No assets, names, items or characters from The Binding of Isaac (or any other game), no real logos or brands (Kubernetes is drawn as a generic ship's wheel), no real people's names. The avatar is an original coral blob, **not** the Anthropic logo. Keep it PG-13 and aim jokes at tech culture, not at groups of people. | IP and taste. |
| **No personal data or secrets** anywhere in code, comments, or test fixtures. | Org policy. |
| **Determinism:** gameplay randomness goes through `game.rng` (or a floor's `rng` during generation), never `Math.random`. `Math.random` is allowed only for purely visual effects (particles, shake) and `randomSeed()`. | Seeds must reproduce runs, so teams can share seeds. |
| **No admin/sudo-requiring commands** in docs or tooling. | Org policy. |

---

## 2. Running, debugging, testing

### Run
Open `index.html` in Chromium, Edge or Firefox (Firefox under `file://` is **untested**, but the CSP includes `file:` as a
safeguard). No server is needed. If you want one anyway, any static server works, e.g. `python -m http.server`.

### URL parameters
- `?seed=XXXX-XXXX` sets a deterministic run seed (normalised to upper case).
- `?debug` shows the debug overlay. `F2` toggles it in-game.

### Debug keys (only while debug is enabled, during play)
`G` god mode · `I` random item · `K` kill all · `N` next floor · `V` reveal map · `B` teleport to boss room ·
`T` teleport to treasure room · `H` 10 of each resource and full heal.

### Scriptable debug API (works with or without the overlay)
`BOTA.debug.god(on?)`, `.giveItem(id?)`, `.spawn(enemyId, x?, y?)`, `.spawnBoss(bossId, x?, y?)`, `.killAll()`,
`.nextFloor()`, `.reveal()`, `.gotoRoom('start'|'treasure'|'shop'|'boss'|'secret'|'encounter')`, `.resources(n)`
(`'encounter'` = the floor's first side-quest room, floor 8+).
Live state is under `BOTA.game` (`.player`, `.room`, `.floor`, `.depth`, `.state`, `.rng`, `.followers`).

### Automated tests
`tools/smoke-test.js` is a headless Playwright run over `file://`. It checks:
- no console errors, warnings or unhandled exceptions;
- every item has a sprite and can be given without errors (all items at once);
- every enemy and boss sprite exists, and every enemy and boss spawns, acts and dies;
- every layout passes `validateLayout(…, {strict: true})`;
- 300 fuzzed floors each have start, boss, treasure and shop rooms, plus exactly one guaranteed-key combat room from depth 2;
- clearing the key room on floor 2 drops an Approval;
- loose loot appears only in combat rooms (about 18 %) and is placed on entry; the Hallucination rolls every
  disguise type and a nearby explosion reveals it;
- a Graphics Glitch touching you scrambles the HUD (a new hit restarts the timer), every glitch area renders, and its
  jumps never land inside obstacles;
- the Antagonistic Reviewer's laser and stamps hit exactly where drawn, and every nitpick row has one gap;
- the Rogue Agent Swarm spawns 4 members with one health bar, ghosts before dying, heals survivors by 10 %, goes solo
  for the last member and emits exactly one boss death;
- bosses never repeat on consecutive floors (300 simulated runs plus a real floor sequence), and README.md appears on
  about 50 % of floors, only in normal rooms, and reveals every room except the secret room;
- pipes appear in about 10 % of combat rooms after clearing (never by a door), never lead to the boss room, the
  secret room or the current room, and can't ping-pong during their cooldown;
- floor names and themes have the same length, floor 3 is Forgotten Branches, and its maps have ≥ 7 dead ends;
- floor 6 is Sandbox Borders; cacti appear only there, only where the layout had a rock, never in front of a door,
  at about the theme's `cacti` share; a cactus pricks once (then i-frames) with knockback, is solid like a rock,
  and explosions break it;
- `themes` / `themeOnly` on enemies and bosses only name existing theme keys with factors ≥ 0, every floor of two full
  theme cycles fills its rooms with allowed enemies and has an allowed boss, and temporary test entries confirm
  that exclusion (before floor 8), the lift from floor 8, weight factors, bonus chances and the no-repeat boss rule
  all respect the floor theme;
- floor rosters (§4): on floors 1–7 the generic enemies at home match the roster table in the test, enemies away from
  home count exactly `AWAY`, rooms still hold ≥ 3 enemies on average, and the away share stays at 5–45 %;
- the cacophony: `mixAt` is 0 before floor 8, 0.25 on 8, +0.1 per floor, 1 from 16; `themeWeight` without a depth
  is unchanged; every family member (incl. the Orphan Commit) appears on floors 8–10 and gets more common by floor 12;
  the Octopus Merge leaks at weight 3 × mix; floors stay deterministic and encounters don't touch the floor RNG;
- side quests: none before floor 8, exactly 1 on floors 8–9, 1–2 (about half 2) from 10; only combat rooms, almost
  never next to the start, an open `special` arena with a free centre, no props, no normal enemies, never the floor
  boss, never two of the same; each of the four bosses entered through a door spawns (4 Swarm members), has
  `ENCOUNTER_HP` × its floor-boss HP, triggers no intro, acts, clears the room and leaves no entities, trapdoor or
  pedestal;
- breakable objects use the floor's kinds, stay off spawn points, door fronts and the centre, never cut a room in two,
  and break from player shots and explosions but not from enemy shots;
- The Context Limit is the only theme with `ambient: 'rain'`; there `updateAmbience` emits whispers (texts from
  `TEXT.CONTEXT_WHISPERS`, shown as a room effect) and lightning without touching `game.rng`, other floors get
  neither, and rooms bake their puddle list and draw rain and ripples without console errors (screenshot
  `08-context-rain`);
- the heart items (on a fresh player): Long-Term Support gives +1 at once and +1 every 2 floors down (at most 3
  more), Swap File takes hearts at full health and turns every 2 banked hearts (overflow included) into a container,
  up to 3, then stops taking them; Electron App +2 and speed −0.15, Reserved Instances is shop-only at 30, Graceful
  Degradation +2 with −0.2 damage per missing full heart; without Swap File hearts at full health stay on the floor;
- the Off-Brand GPU turns about 12 % of shots into duds that deal no damage, and the GPU prices are 30¢ / 20¢;
- the Forgotten Branches family (see §4):
  - **Stale Branch** appears only on its floor (before floor 8), ages through its leaf stages, speeds up, counts up its counter,
    and lunges only after the windup (2 damage, then back to 1); leaf effects and family sounds fire on hit and death;
  - **Detached HEAD** spawns as a linked pair; body dies first → head panics, head dies first → body wanders with
    contact damage only; the room clears only when both are dead, and `killAll` leaves nothing behind;
  - **Cherry-Pick** rolls come in pairs that link up; a hit angers the *partner* for about 3 s (it spits a pit),
    a widowed cherry stays angry, the stem never stretches past its leash, and a solo spawn grows a partner;
  - **Orphan Commit** is a rare bonus only on its floor before floor 8 (at most 1 per room, close to its `bonusChance` ×
    the theme factor), never
    holds the doors, flees into a corner, drops 2–3 credits when caught (even while frozen) or shot, and is
    garbage-collected after its warning without loot or a kill;
- the Sandbox Borders family: Deprecation Warnings weigh ×2.5 and Hallucinations ×2 there; the **Spinlock**'s body
  shields its head, it coils on a ring, rattles ≥ 0.6 s before lunging (2 damage) without the chain tearing, and its
  body falls apart with the head; the **Rootkit** can't be hurt while buried, surfaces on free sand near the player
  after its telegraph with a ring of 8 shots, and a bomb flushes it out without the ring;
- the **Rogue Agent** never rolls before floor 7, keeps its distance, and every volley (two 3-shot fans or three
  single shots) comes after its green glow at 165–260 px/s;
- the Context Limit family never rolls before floor 8 and weighs more on The Context Limit than on any other floor
  from 8. **Overflow Buffer:** fill rises on its own (full after 6–8 s) and by exactly `hitFill` per hit (none during
  the telegraph); it bursts only after the full ≥ 0.6 s telegraph into exactly 8 coral droplets at 165–260 px/s along
  the telegraphed rays, then starts empty; its puddle slows a walking player to ×0.6 inside its radius only (never
  stacked, never flying, never after it faded at 4 s). **Summarizer:** at most 1 per room, keeps its distance, merges
  only after the full telegraph, a hit or a dead target cancels, a merge sums HP and max HP, grows the radius within
  its cap and removes the other without `enemyDeath` or a kill (the room still clears), ineligible enemies (bosses,
  minions, linked pairs, Hallucinations, Dry Run, Spinlock, Port Scanner, Orphan Commit, Memory Leak, Scope Creep,
  Jira Ticket, Stale Branch, a lying Zombie Process, other Summarizers) are never chosen, and nobody is summarized more
  than twice. **Lost in the Middle:** intangible, harmless and silent in the middle third of the width, solid and
  hurting at the edges, every volley after its full 0.6 s telegraph with exactly 3 coral shots at 165–260 px/s (cancelled
  when pushed into the middle), regularly solid even with the player parked in the middle for 30 s, inside the room.
  All three die cleanly and `killAll` leaves no enemies, puddles or zone marker behind;
- the **Dust Daemon** and **Dry Run** roll only on their home floors within depths 1–7 (Sandbox Borders / The Training
  Data); the Dust Daemon bends player shots in its spin direction (never outside its radius, while exhausted or
  frozen, or enemy shots), shots aimed at its core always hit, some shots flying with the wind get carried into it,
  and its throw comes after spin-up + hold with 4 clods (one aimed at the player) at 165–260 px/s; the Dry Run's
  body repeats the ghost's path and shots exactly `delay` ticks later (same tick offset, angle, speed and start
  point, even after a freeze, knockback or explosion), every attack has its full windup, the ghost never hurts,
  and the ghost vanishes when the body dies;
- the **Stack Trace** (Legacy Codebase): on depths 1–7 it only rolls on its floor (at most `maxPerRoom`); every sting
  comes after the full trace telegraph (≥ `track + lock`) and its windup event; the stinger deals 2, the unrolled
  paper 1, folding back is harmless; the exception shot (1 damage, 165–260 px/s, along the locked line) only flies
  when the player stood beyond reach and vanishes when it dies; walls shorten the tail and stop the shot; the stack
  unwinds 5 → 4 → 3 sheets at 2/3 and 1/3 HP; the `legacy` sounds exist; `killAll` leaves nothing behind;
- the Dependency Hell family (checked on depths 1–7: Honeypot only on Dependency Hell, Rolling Release only there and
  on Sandbox Borders): the **Honeypot** only pulls after its ≥ 0.5 s telegraph, pulls inside its funnel only, never
  faster than 60 % of the player's current speed (also at speed 0.5), a player running away escapes unbitten, one
  standing still gets a 2-damage bite after a ≥ 0.4 s jaw warning, nobody is dragged into a pit, walkers are pulled
  and bitten but flyers aren't, and a bomb in its jaws goes off; the **Rolling Release** aims ≥ 0.5 s before rolling,
  bounces off walls and rocks without getting stuck, speeds up by exactly `bump` per bounce up to its cap (≤ 260 px/s),
  takes half damage rolling and 150 % unpacked, its Breaking Change quakes ≥ 0.5 s before a ring of 6 shots at
  165–260 px/s, and it repacks at base speed; both die cleanly;
- the Production family (floors 1–7: only on Production; cyan shots at 165–260 px/s): the **Rate Limiter** fires
  exactly 3 shots per burst, only after its aim telegraph, one lamp going dark per shot; then its "429" pause lasts
  the full window, is harmless and takes 1.5× damage, and the lamps refill one at a time before the next burst;
  the **Port Scanner**'s ports never sit on obstacles, spawn points, the centre or door fronts, keep their minimum
  gap and are numbered upwards clockwise (checked on 12 floors' worth of rooms); it surfaces exactly on the ports in
  that fixed order, each time after its ping, fires its fan only after the aim line, is untouchable while
  underground, skips a port the player stands on ("FILTERED"), leaves no ports after death or `killAll`, and
  turns into a turret if its ports are gone;
- the **Nested Infinite Loop** replaces the Infinite Loop from floor 8 (never before, and the Loop never after); it has
  rings of 14 / 9 / 5 parts, only the outermost living ring fires and can be hit, the rings break at 50 % and
  16.67 % (one `bossPhase` each), its shots stay at 165–260 px/s, its parts stay inside the room, and it dies once
  with no parts left over;
- **The Megalith** and **The Shareholder** never roll before floor 7, the Monolith and the Stakeholder never as floor
  bosses from floor 7, and a side quest is never the floor boss or the boss it `replaces`; every Megalith row has a
  safe gap reachable from the previous row's (checked on 400 generated functions), phase 2 has exactly one marker
  row, and rows, search highlights, the stomp ring and falling chunks all wait for their telegraph; "Refactor
  rejected" at 50 % brings 4 modules that land away from it, an arriving module heals exactly 4 % (never above 50 %,
  no kill) and a shot one heals nothing; the Shareholder's `beamPath` reflects correctly and stays in the room, the
  beam hits on the bounced segment (not beside it) and only after aim and lock, dividends burst into 6 each, coins
  only hurt on landing, real credits stay within `coinCap` and expire, "Hostile takeover" comes at 40 %, the
  buyback freezes all shots and sends them to him, a missed quarter stuns (and the damage factor goes away again),
  a beaten one rings only after its tell and speeds him up; all their shots stay at 165–260 px/s and each dies once;
- **The Memory Hog** only rolls on floors 4–9, more often on Dependency Hell. In every boss layout and both phases each
  reservation keeps the free floor connected (no more parts than the room has by itself), stays within `cap`, leaves
  a free tile within `escape` steps of the player and only takes free floor. Zeros are harmless, ones cost half a
  heart (flyers too, never beside the tile) and expire; the first block lands on the player and malloc gets greedier;
  Page Fault's aim tracks, locks, and only then does he charge, and his trail never splits the room; the Quill Dump
  ring has exactly two gaps and waits for its telegraph; GC comes at 40 % or on "Out of memory", sweeps everything,
  opens the damage window and resets afterwards; a bomb frees whole blocks only; phase 2 comes once, its fragments
  never touch edge to edge and Page Fault runs twice; he dies once, the overlay disappears, and shots stay at
  165–260 px/s;
- the **Octopus Merge** is only rolled on Forgotten Branches before floor 8 (at its weight share there, and anywhere from
  floor 8, on a first visit); it has 8 arms of
  5 segments that pass 60 % of their damage to the knot and stay inside the room; every sweep, slam, tip shot and
  stream has its telegraph first; an arm merges every 12 % of HP (at least one stays), phase 2 starts once at 50 %
  with opposing streams; arms hurt on contact along their whole length; the death is a single boss death and no
  segments survive it;
- the Final Score: the values match `B.SCORE_VALUES`; coins count by value (not hearts or Seed Funding), kills leave
  out bosses, boss segments and boss minions, Approvals count at doors and locked chests, an item counts once (taking a
  swapped active item back doesn't), floor bosses and side quests count once via `onRoomClear`; the score card comes
  after floor 11 and 22 but not floor 10, ignores keys for 0.8 s, doesn't touch `game.rng`, Enter leads to The Backlog II
  keeping score and cycles, R starts at zero; the post-mortem shows the same score;
- the door transition, special rooms, pause screen and death screen work.

Screenshots go to `tools/out/` (scratch; don't commit or ship). One-time setup without admin rights:
```bash
bash tools/setup-dev.sh         # Playwright (pinned) into ./node_modules (gitignored) + headless Chromium into ~/.cache
node tools/smoke-test.js        # exit 0 = green
```
`setup-dev.sh` is idempotent (rerun it any time), never writes a `package.json` or lock file, and ends with a quick
browser launch check. The Playwright version is pinned in the script so the package and the browser build match;
raise it there when updating. A "your OS is not officially supported" warning on newer Linux versions is harmless.
Always look at the screenshots after visual changes. A clean console doesn't mean the art looks right.

`node tools/export-sprites.js` (same Playwright setup) re-exports the sprites used by `documents/*.md` into
`documents/images/`. Run it after art changes; it never edits the Markdown. `node tools/export-floors.js` does the same
for `documents/floors.md`: one screenshot of a typical combat room per floor theme (`floor_<key>.jpg`) and a small colour
swatch (`floor_<key>_swatch.png`). Run it after changing a theme, pattern or decor. `node tools/export-pdf.js` renders every
`documents/*.md` to `documents/pdf/<name>.pdf` (A4 landscape, images embedded). Rerun it after editing the lists.

Testing tips:
- Headless Chromium can't play audio. Instead, check `BOTA.audio.play(name)` doesn't throw after a key press unlocks the AudioContext.
- Use `page.keyboard.down/up` for movement and `BOTA.debug.*` for setup.
- `teleport`/`gotoRoom` **skip the boss intro card**, which only triggers when you walk through a door (see §8).
- God mode doesn't stop "Retry with Backoff" from intercepting a lethal hit. To force death, call `hurt` repeatedly.

---

## 3. Architecture

### 3.1 Load order (`index.html`)
```
core/namespace → core/rng → core/math → core/input → core/sprites → core/audio
data/palette → data/text → data/sprites-core → data/sprites-enemies → data/sprites-items
data/layouts → data/enemies → data/bosses → data/items
world/room → world/dungeon
entities/entity → projectile → player → enemy → boss → bosses-late → boss-memory-hog → pickup → familiar → effects
render/renderer → render/hud → render/screens
game → main
```
Data files only *register* things. Cross-file lookups (e.g. `B.ITEMS[id]`, `B.hasSprite(name)`) happen at runtime,
so data files can refer to sprites or behaviours defined later. Class inheritance (`extends B.Entity`) **does**
depend on load order.

### 3.2 Coordinates and constants (`B.C` in `namespace.js`)
- **Logical canvas:** 960 × 640. There is a 64 px HUD strip on top (`HUD_H`); the room is drawn below it at 960 × 576.
- **Room grid:** `TILE` = 64, 15 × 9 tiles (`COLS`, `ROWS`). The outer ring is wall, so the playable interior is 13 × 7.
- **Room coordinates:** origin at the top-left of the wall ring. The renderer translates by `HUD_H`. All entities,
  effects and collisions use room coordinates.
- **Doors** sit mid-wall at `DOOR_TILES`: up (7,0), down (7,8), left (0,4), right (14,4).
- **Simulation:** fixed at 60 Hz (`DT` = 1/60). `main.js` uses an accumulator capped at 100 ms per frame.
- **Rendering scale:** `B.renderScale` = CSS scale × devicePixelRatio. The context is pre-scaled, so draw code uses
  logical px. Sprites are baked at their own pixel scale (usually 4) and drawn with smoothing off.

### 3.3 Globals on `window.BOTA` (abbreviated `B`)

| Global | File | What |
|---|---|---|
| `C`, `DIRS`, `OPPOSITE`, `TILES` | namespace | constants, directions, tile enum (FLOOR, WALL, ROCK, BLOCK, PIT, SPIKES, DOOR, PROP, CACTUS) |
| `bus` | namespace | event bus `on/off/emit`; listener exceptions are caught and logged |
| `storage`, `params` | namespace | validated localStorage (`muted, bestFloor, runs, deaths`); validated URL params |
| `ITEMS, ENEMIES, BOSSES, BEHAVIORS, BOSS_BEHAVIORS, PICKUP_TYPES, LAYOUTS, TEXT` | namespace (filled by data/entities) | content registries |
| `RNG`, `hashString`, `randomSeed` | rng | mulberry32 PRNG (`next/float/int/chance/pick/weighted/shuffle/angle`), FNV-1a hash |
| `M` | math | `clamp, lerp, approach, dist, norm, angleDiff, circlesOverlap, circleRectPush, …` |
| `input` | input | `down(code)`, `pressed(code)` (edge since the last sim step), `moveVector()`, `shootDir()`, `_simulate()` |
| `defineSprite, drawSprite, hasSprite, spriteSize, spriteFrameCount` | sprites | ASCII sprite registry; unknown names draw a magenta placeholder |
| `audio` | audio | `unlock, play(name), toggleMute, tone, names(), music.start/stop` |
| `FONT, COLORS, FLOOR_THEMES, themeFor(depth)` | palette | colours and 11 floor themes (`gen`, `props`, `cacti` are read by the map generator; `tiles` swaps tile sprites; `ambient` / `wallDecor` add per-frame or baked atmosphere, e.g. `rain`) |
| `floorInfo(depth)`, `TEXT.*` | text | floor names/subtitles (cycling with roman numerals) and all snark lists; `TEXT.pick(list)` |
| `Room`, `Floor` | world | room model and floor generator |
| `Entity, Projectile, Bomb, Player, Enemy, Boss, AI, BossHelpers` | entities | gameplay classes and AI helpers |
| `Pickup, Pedestal, Trapdoor, rollRandomPickup, openChest, rerollPickup, drawSpriteIfExists` | pickup | economy objects |
| `syncFollowers, Duck, UnitTest` | familiar | followers (Rubber Duck, Unit Tests orbitals) |
| `FX, Particle, Leaf` | effects | visual effects API (`Leaf` = falling leaf, used by the branches family) |
| `itemPrice, itemFx` | items | price helper, pop-up text fallback |
| `themeKeyAt, themeFactor, themeWeight, mixAt, AWAY, MIX_FROM, enemyWeightAt, rollRoomEnemies, bossWeightAt, rollBoss, rollBossVaried, validateLayout` | data | spawn and layout logic (floor themes, rosters, cacophony: §4) |
| `ENCOUNTER_BOSSES, ENCOUNTER_HP, ENCOUNTER_FROM` | bosses | side-quest bosses from floor 8 (§3.6 step 10) |
| `Renderer, text`, `HUD, pixelText, pixelTextWidth`, `Screens` | render | drawing |
| `Game`, `game`, `debug`, `SCORE_VALUES`, `SCORE_ROWS` | game, main | state machine instance, debug API, Final Score table (§4) |
| `spriteTools` | sprites-core | `shiftRow, stamp, mirror, padRows` helpers for composing sprites |
| `BRANCH_LEAVES` | sprites-enemies | shared Forgotten Branches palette (`outline, bark, green, yellow, brown`); use it for new family members |

### 3.4 Main loop and state machine (`main.js`, `game.js`)
`main.js` sets up the canvas, scaling, input and storage, then runs `requestAnimationFrame`. Each frame it runs N fixed
`game.update(DT)` steps, calls `B.input.endStep()` after each one (which clears the "pressed" edges), then calls
`B.Renderer.frame(ctx, game)`. Exceptions in update or render are logged but don't stop the loop.

```
title ─Enter─▶ floorCard ─(2.2 s or key)─▶ play ◀──Esc/P──▶ pause
                   ▲                          │ ├─ door ─▶ roomTransition (0.28 s slide) ─▶ play | bossIntro ─▶ play
                   │                          │ ├─ trapdoor ─▶ floorTransition (0.6 s) ─▶ enterFloor(depth+1) ─▶ floorCard
                   └──── newRun(seed) ◀──R────┴─ hp 0 ─▶ dead
```
On the last floor of a cycle (`isCycleEnd()`: depth divisible by the number of themes) `floorTransition` leads to
`scoreCard` instead of `enterFloor`: after 0.8 s Enter continues with `enterFloor(depth + 1)` and R calls `newRun`.
Global keys handled in every state: `M` (mute) and `F2` (debug). Holding `R` for 1 s in play or pause restarts the run
(`game.restartHold` drives the HUD ring).

### 3.5 World API (`game` is passed to every behaviour and hook)
`game.player · game.room · game.floor · game.depth · game.rng · game.followers · game.seed · game.runStats ·
game.score · game.cycles`
- `spawnProjectile(opts)`, `spawnEnemy(id, x, y, room?)`, `spawnBoss(id, x, y, room?, opts?)` (`opts = {hpMult,
  encounter}`; kept in `game.bossSpawnOpts` during the constructor, so bosses spawned in `init`, i.e. the Swarm, inherit it)
- `spawnPickup(type, x, y, opts?, room?)`, `spawnPedestal(itemId, x, y, {price}?, room?)`
- `explode(x, y, radius, damage, source)`: damages enemies and the player (2 halves), breaks rocks and cacti (8 % loot), reveals
  hidden doors, flings pickups, shakes the screen, emits `explosion`
- `addScore(kind, n?)` · `scoreTotal()` (Final Score, §4)
- `shake(intensity, seconds)` · `banner(title, subtitle)` · `freezeEnemies(seconds)` · `rollItem(pool)` ·
  `nearestFreePos(x, y, room?)` · `nextFloor()` · `teleport(room)` · `pipeWarp(pipe)` · `glitchHud(seconds)` (scrambles one HUD area,
  stored in `game.hudGlitch`; a new call restarts the timer instead of stacking)

### 3.6 Dungeon generation (`world/dungeon.js`)
1. A 9 × 9 cell grid with the start room in the centre. Target room count is `min(20, floor(3.3·depth) + 6 + rand(0..2))`.
2. Rooms are added by randomised BFS. A cell is accepted only if it is empty, has ≤ 1 filled neighbour, and a coin flip
   agrees. Generation retries (up to 500 times) until the target count is reached with ≥ 3 dead ends. A floor theme can
   raise that with `gen.minDeadEnds` (Forgotten Branches: 7, so its maps branch more); other floors are unaffected.
3. Dead ends become the **boss** room (farthest BFS distance), the **treasure** room and the **shop**. The **secret**
   room is an empty cell with ≥ 2 room neighbours that isn't next to the boss; its door edges are `hidden`.
4. Edges are shared objects `{kind, locked, hidden}` between the two rooms' `doors[dir]`. Kind priority is
   boss > secret > treasure > shop. Treasure and shop edges are `locked` from depth 2.
   Every floor gets a secret room whenever a candidate cell exists, which in practice is always (100 % of 10,000
   sampled floors). It can only be opened by an explosion within about 140 px of the hidden door tile.
5. Each room's `build(rng)` stamps walls, a layout (`'normal'` tag for combat rooms, `'special'` for everything else),
   door tiles, and **pre-rolls** `plannedEnemies` / `bossId` with the floor RNG.
6. From depth 2, `assignKeyRoom` marks one combat room `guaranteedKey` (stored as `floor.keyRoom`). It uses its own RNG
   stream (`hashString(floorSeed + ':key')`), so the floor RNG and existing maps are unchanged. `game.dropGuaranteedKey`
   drops the Approval when that room is cleared (or on entry if it has no enemies), without drawing from `game.rng`.
7. `assignLooseLoot` gives 18 % of combat rooms 1–2 pickups (`room.looseLoot`) that already lie on the floor on first
   entry. It uses its own stream too (`':loot'`); `game.populate` places them like enemies (spawn points first).
   The table `B.LOOSE_LOOT` (in `pickup.js`) is shared with the Hallucination's disguises, so that real and fake
   loot always have the same types and odds. Change both together, or the fake becomes obvious again.
8. `assignReadme` puts a `readme` pickup (README.md) into one random normal room on 50 % of floors (30 % until 2026-11-03) (`room.hasReadme`,
   `floor.readmeRoom`, own stream `':readme'`). Collecting it calls `floor.documentMap()`: every room except the secret
   room becomes `seen`, and `floor.documented` makes the minimap draw connections between unvisited rooms too.
9. `assignPipes` marks about 10 % of combat rooms `hasPipe` (own stream `':pipe'`). `game.onRoomClear` →
   `placePipe` drops a `B.Pipe` (in `room.pickups`, not near doors or the centre). Walking onto it calls
   `game.pipeWarp`, which teleports to a random room other than boss, secret and the current one (via `game.rng`).
   Pipes only trigger on the step *onto* them, and `game.pipeCooldown` (1 s) blocks all pipes after a jump.
10. `assignEncounters` (floor 8+, own stream `':encounter'`, runs after `assignPipes` and before `assignProps`) turns
   1 combat room (floors 8–9) or 1–2 (from 10, 50 %) into a **side quest**: preferably not next to the start room
   (`dist ≥ 2`) or another encounter. The room is re-stamped with a `special` layout (`room.stampLayout`, the boss
   room pool: open centre), `plannedEnemies` is emptied and `room.encounterBoss` is set by `pickEncounterBosses(avoid)`
   (own stream `':encounter:boss'`, uniform from `B.ENCOUNTER_BOSSES` = Monolith, Swarm, Infinite Loop, Stakeholder,
   never `avoid` or the boss it `replaces`, no duplicates). `game.assignFloorBoss` calls it again with the final floor boss. Props skip these
   rooms; key, loose loot, README and pipe stay. `game.populate` → `spawnEncounter` spawns the boss in the centre with
   `hpMult: B.ENCOUNTER_HP` (0.5) and `encounter: true`, plus a banner (boss name, `TEXT.ENCOUNTER_LINES`). There is
   no intro card and no boss music (`pendingBossIntro` is only set for `type === 'boss'`), no trapdoor or boss
   pedestal (`onRoomClear` treats it as a normal room, plus one guaranteed random pickup). The HUD boss bar shows
   "SIDE QUEST: <name>".
11. `assignProps` places breakable objects (tile `PROP`, data in `room.props` keyed `"c,r"`) in normal rooms, with kinds,
   chance and max count from the floor theme's `props` (`B.PROP_KINDS` in `layouts.js`). Own stream `':props'`. Never
   on spawn points, the centre or the 3 × 3 area in front of a door, and `fullyWalkable` must still hold afterwards
   (all walkable tiles form **one** connected area; the search starts from a single door front, because starting from
   all of them at once let a row of props split a room between two doors, a soft-lock on the tree-shaped map).
   Player shots call `game.hitProp` (in `projectile.js`), spectral shots too (once per prop while passing through),
   explosions call `game.breakProp`; enemy shots don't damage them. Breaking drops a random pickup with `B.PROP_LOOT_CHANCE` (10 %). Props are drawn per frame (`drawProps` in
   `renderer.js`), not baked into the background.
12. `assignCacti` (own stream `':cacti'`) turns each rock in a normal room into a `CACTUS` tile with the theme's
   `cacti` share (Sandbox Borders: 0.5), never in the 3 × 3 area in front of a door. Cacti are as solid as rocks, so
   walkability is unchanged. `game.checkCactus` (from `updatePlay`, not while flying) pricks the player for half a
   heart with knockback when their circle touches a cactus tile; `explode` breaks cacti like rocks.

**Boss choice:** each room build still pre-rolls `bossId` with `B.rollBoss` (so the floor RNG is unchanged), but
`game.enterFloor` then calls `assignFloorBoss`, which replaces it with `B.rollBossVaried(rng, depth, game.bossHistory)`.
The previous floor's boss is excluded, and bosses already met count `weight · theme factor / (1 + times met)`
(theme factor incl. the floor-8 cacophony: §4, Floor themes). Its RNG is seeded with
`hashString(seed + ':boss:' + depth)`, and the history only depends on earlier floors, so runs stay reproducible.

**Seeds:**
- Each floor's generator RNG is seeded with `hashString(seed + ':floor:' + depth)`, so a seed always gives the same
  maps, layouts and enemy lists.
- `game.rng` is seeded with `hashString(seed + ':run')` and drives drops, item rolls and AI. Because
  `populate()` (items, shop wares) uses `game.rng` on first entry, **item rolls depend on the order rooms are visited**.

### 3.7 Rooms (`world/room.js`)
- **Tiles:** a `Uint8Array(COLS*ROWS)`. Use `tileAt/setTile` (`setTile` marks `bgDirty` and invalidates the flow field).
  `stampLayout(layout)` (no RNG) writes walls, a layout and door tiles; `build` uses it, and `assignEncounters`
  re-stamps side-quest rooms with it.
- **Collision modes for `isSolid(c, r, mode, isPlayer)`:**

  | Tile | walk | fly | shot | spectral |
  |---|---|---|---|---|
  | WALL | solid | solid | solid | solid |
  | DOOR | solid unless `isPlayer` and the door is open | same | solid | solid |
  | ROCK / BLOCK / PROP / CACTUS | solid | — | solid | — |
  | PIT | solid | — | — | — |
  | SPIKES / FLOOR | — | — | — | — |

  A door is open when it isn't locked, isn't hidden, and `!room.combatClosed`.
- **Pathfinding:** `updateFlow(tx, ty)` runs a BFS distance field from the player's tile (refreshed every 0.15 s by game).
  `flowDir(x, y, tx, ty)` returns a unit vector toward the target; it doesn't cut corners and falls back to a straight line.
- **Lists:** `enemies, projectiles` (both teams plus `Bomb`s), `pickups` (pickups, pedestals, trapdoor) and `effects`.
  `room.update()` iterates them with index loops, so spawning mid-update is safe, then filters out `dead` entries.
  Only the current room updates.
- **State:** `seen / visited / cleared / populated / combatClosed`. `hasLivingEnemies()` ignores `e.ignoreForClear`.
  `game.updatePlay` calls `onRoomClear` **once**, when a populated, uncleared room has no living enemies.
- **Caches:** the background is baked into `room.bgCanvas` (rebaked when `bgDirty` or the scale changes). Door
  animations are drawn per frame.

### 3.8 Entities
- **`Entity`:** circle collider (`x, y, r`), `vx/vy` plus decaying knockback `kbx/kby`. `moveAndCollide` substeps
  against tiles and returns whether it hit anything. Other fields: `flash` (white hit silhouette), `t` (age), `flying`,
  `isPlayer`, `dead`.
- **`Player`:**
  - **Health** is counted in **half hearts**: `health/maxHealth` (red, max 24 halves total) plus `guardrails` (blue, absorbed first).
  - **Resources:** `credits / pushes (bombs) / approvals (keys)`, each capped at 99.
  - **Stat pipeline (`recalcStats`):**
    1. Start from `BASE`: speed 1.0 (×240 px/s), damage 3.5, fireDelay 0.38 s, shotSpeed 1.0 (×480 px/s), range 420,
       shotSize 1.0 (×9 px radius), luck 0.
    2. Add `player.bonus`, then every item's `add` and `dynamic().add`.
    3. Multiply by the product of the items' `mult`.
    4. Clamp to `LIMITS`.
  - **Flags:** booleans are OR'ed (`piercing, homing, spectral, bounce, wobble, split, flying, parallel, showHp`),
    `multishot` takes the max, and other numbers are summed (`duck, unitTests`).
  - **Hooks:** `fireHook(name, …)` calls `onPickup, onShoot, onHitEnemy, onRoomEnter, onRoomClear, onHurt, onLethal,
    onOverheal, update` on all passive items and the active item, and catches errors per item.
  - **Shooting:** 4-directional (the last arrow key pressed wins); shots inherit 30 % of the player's velocity.
    `multishot` fires a fan (`spread`, default 12°), or a parallel pair when `parallel` is set and the count is 2.
  - **Slowdowns:** `slowBy(f)` (0 ≤ f < 1) slows the player for exactly one tick, keeping the strongest factor
    instead of multiplying (no stacking) and ignoring flying players; a source calls it every tick (Overflow Buffer
    puddle). It is applied in `update()` via `slowNext` and is not a stat.
  - **Getting hurt:** `hurt()` sets 1 s of invulnerability (i-frames) and emits `playerHurt`. On lethal damage the
    `onLethal` hooks run, and returning `true` survives. Otherwise `game.onPlayerDeath(killer)` is called.
  - **Active items:** `giveItem` swaps the active item and returns the old one, which the pedestal keeps (agent A
    preserved charges on swap). `chargeActive(n)` adds charge; one charge is gained per cleared room.
- **`Projectile`:**
  - Teams are `player` and `enemy`. Range is tracked as distance travelled.
  - Wall collision is tested at the centre, per axis, so `bounce` can reflect up to 3 times.
  - `split` produces 4 children at half damage. Player shots test `room.enemies`; enemy shots test followers with
    `blocksShots` first, then the player (hitbox 0.7 × r).
  - An enemy marked `intangible` lets shots pass through; one marked `invulnerable` absorbs them.
  - **Shot fields:** every tick, before moving, a player shot calls the behaviour hook `bendShot(e, shot, dt, game)`
    of every living enemy in the room that has one (the Dust Daemon's swirl). It may change `vx/vy` and must be
    deterministic. Enemy shots are never bent.
- **`Bomb`:** sits in `room.projectiles` with a 1.5 s fuse, then calls `game.explode(…, 110, 30)`. It hurts the player too.
- **`Enemy`** (`entities/enemy.js`):
  - **Behaviour contract:** `init`, `update`, `afterMove`, `onDeath`, `onLethal`, `onExplosion`, `onHitPlayer`,
    `bendShot` (see Projectile), `draw` / `drawUnder` / `drawOver`. `afterMove` is optional and runs **every** tick after movement and separation,
    even during `spawnDelay` or while frozen (Cherry-Pick enforces its stem leash there).
  - **Common fields:** `e.state` (free scratch space), `e.params`, `spawnDelay` (0.5 s with no action and no contact
    damage), `frozen`.
  - **Optional flags:** `intangible, invulnerable, static, noKnockback, ignoreForClear, noHpBar, noSeparate`.
  - **Damage forwarding:** `proxy` / `proxyMult` pass damage to another enemy (worm segments → head).
  - **Area damage:** `aoeDedupe` makes sourceless damage count once per tick.
  - **Damage taken:** `damageTakenMult` (optional) multiplies every hit (Rate Limiter: 1.5 during its "429" pause).
  - **Sprite size:** `sizeMult` (optional) scales the sprite in `AI.drawBody` (Summarizer's merged enemies).
  - **Speech:** `sayText`.
  - **Scaling:** HP grows ×(1 + 0.15·(depth−1)).
  - **Helpers in `B.AI`:** movement (`toward, pathToward, wander, stop, turn, clampToRoom, findSpot`), shooting
    (`shoot, shootAt, ring, fan, fanAngle`, scaled by `shotSpeed(game, base)` / `cooldown(game, base)`), and
    telegraphs (`say, drawMark, drawTargetRing, drawRays, drawGlow, drawBody`).
  - **Projectile cap:** `AI.shoot` won't create enemy shots once a room holds `AI.MAX_PROJECTILES` (200).
- **`Boss`** (`entities/boss.js`) extends Enemy:
  - HP grows ×(1 + 0.3·(depth−1)), times `hpMult` from `game.bossSpawnOpts`; `noKnockback`, `noSeparate`.
    `e.encounter` marks a side-quest boss (§3.6 step 10). Behaviours live in `B.BOSS_BEHAVIORS`, with shared
    helpers in `B.BossHelpers`.
  - Bosses emit `bossPhase / bossStomp / bossBounce`.
  - The Infinite Loop's body is made of separate `loop_segment` enemies (`ignoreForClear`, `proxy` → head).
  - **Boss groups:** the Rogue Agent Swarm is four real `Boss` entities. The first one's `init` spawns the other three
    and all share `e.bossGroup` (one array), which the HUD sums into a single health bar. Non-final members set
    `isBoss = false` in `onDeath`, so only the last death plays the boss explosion and fanfare.
- **`Pickup / Pedestal / Trapdoor`** (`entities/pickup.js`):
  - A pickup type is `{name, sprite, color, r, weight, price?, heavy?, keepShell?, collect(player, game, pickup) → bool}`.
    Returning false means it isn't picked up (e.g. full HP), and the pickup is nudged away.
  - A `price` turns a pickup or pedestal into a shop item.
  - `chest_locked` costs an approval.
  - The trapdoor arms after 1 s, then calls `game.nextFloor()`.
- **Followers** (`entities/familiar.js`):
  - `game.followers` persists across rooms and floors. `B.syncFollowers(game)` reconciles it with `flags.duck` and
    `flags.unitTests`.
  - Followers don't collide with tiles.
  - Unit Tests set `blocksShots` and deal contact damage.

### 3.9 Rendering (`render/*`)
- **`Renderer.frame(ctx, game)`:**
  1. Clear the canvas.
  2. Title screen, or the room, clipped to the room area with screen shake applied (both rooms during the slide
     transition).
  3. HUD.
  4. The overlay screen for the current state.
  5. The debug overlay, if on.
- **Entity sort:** by `drawLayer`, then by `y`. Shadows are drawn first (`noShadow` opts out). Code Review's
  `showHp` draws enemy HP bars.
- **Drawing contract:** entities draw themselves via `draw(ctx, game)` in room coordinates.
- **Text:** `B.text(ctx, str, x, y, {size, color, align, baseline, bold, shadow, maxWidth, alpha})` for the system
  monospace font, and `B.pixelText(ctx, str, x, y, {scale, color, align, baseline, shadow, outline, alpha})` for the
  5×7 pixel font. The pixel font is uppercase only; unknown characters render as `?`.
- **HUD (`hud.js`):** hearts, resource counters, the active item with a segmented charge bar, stat readout with ▲/▼
  after changes, floor name and timer, a minimap (7 × 5 window around the current room), the item banner, the boss
  bar, and the hold-R ring. While `game.hudGlitch` is set, one area (hearts, active item, stats or minimap) is drawn
  as static or scrambled text; the noise is purely visual.
- **Screens (`screens.js`):** title, floor card, boss intro VS card, pause (item grid browsed with the arrow keys),
  the death "POST-MORTEM" (with final score and cycles), and the end-of-cycle score card.
  - Note: the pause screen registers its **own `window` keydown listener** for arrow-key browsing. It's display only,
    and it's the one input listener outside `input.js`.

### 3.10 Sprites
- **Format:** `defineSprite(name, {palette: {ch: '#hex'}, rows: [...] | frames: [[...], ...], scale: 4})`. `.` and
  space are transparent, and characters missing from the palette are transparent too. Sprites are baked lazily into
  offscreen canvases, plus a white "flash" variant.
- **Naming:**
  - `player_{down,up,left,right}` (4 walk frames), `player_hurt`, `player_itemget`, `player_dead`
  - `tile_{rock(3 frames),block,pit,spikes}`, `tile_cactus` and `tile_sandstone` (3 frames each), `tile_border`
    (3 frames: barrier, fence across, fence down), `hud_*`, `map_{boss,treasure,shop,secret}`, `pipe` (2 frames, generated),
    `tile_mem_zero` and `tile_mem_one` (2 frames; the Memory Hog's reserved floor, a drawn overlay, not real tiles),
    `prop_{crate,bush,package,carton}` (frame 1 = damaged)
  - `item_<id>`, `pickup_<type>`, `pedestal`, `trapdoor`, `bomb`, `familiar_duck`, `orbital_test`
  - `enemy_<id>`, `boss_<id>`
  - **Count:** about 175 sprites. All of them are original pixel art written as ASCII in code.

### 3.11 Event bus (who emits → who listens)
Payloads usually include `game, x, y` and often `color`.

| Event | Emitted by | Typical listeners |
|---|---|---|
| `shoot`, `familiarShoot` | player, familiar | audio |
| `enemyHit`, `enemyDeath` (`boss`, `segment`) | enemy | audio, effects |
| `enemyReveal`, `enemyRevive` | enemy behaviours | audio, effects |
| `enemyShed` (`colors, count, big`), `enemyWindup` (`sound`?) | Stale Branch, Spinlock, Rootkit, Stack Trace, Dust Daemon (`gust`), Dry Run (`rehearse` / `replay`), Rate Limiter (`token`), Port Scanner (`portPing`) | audio (`rustle`; windup: `sound` if given, else the family's), effects (falling leaves) |
| `enemyBurrow` (`up`) | Rootkit | audio (`sandPop`), effects (sand fountain / dust) |
| `enemyThrottle` | Rate Limiter (enters its "429" pause) | audio (`throttle`), effects (steam, "Too Many Requests") |
| `portScan` (`kind`: open/filtered) | Port Scanner | audio (`denied` when filtered), effects (cyan ring / "FILTERED") |
| `orphanCaught` (`count`), `enemyVanish` (`color, text`) | Orphan Commit; Dry Run's ghost on death | audio (`rescue`, `gcSweep`), effects (sparkles / puff and text) |
| `hudGlitch` (`kind`) | game (`glitchHud`) | audio |
| `ambientWhisper` (`text, x, y`), `ambientThunder` | game (`updateAmbience`, only on themes with `ambient: 'rain'`; uses `Math.random`, never `game.rng`) | audio (`whisper`, `thunder`), effects (`Whisper` text, soft room tint) |
| `pipeAppear`, `pipeWarp`, `pipeArrive` (`to`) | game | audio, effects |
| `propHit`, `propBreak` (`kind, color`) | game | audio, effects |
| `bossSpawn`, `bossIntro`, `bossPhase`, `bossStomp`, `bossBounce`, `bossBeam`, `bossMerge` (`left`) | game, boss | audio (boss music, `merge`), effects ("Merged!" pop) |
| `bossSearch`, `bossReplace`, `bossAbsorb` | Megalith (Ctrl+F starts, a match is replaced, a module merges back in) | audio (`search`, `replace`, `merge`), effects (yellow flash, "+1 import") |
| `bossMoney` (`kind`: coin/expire/buyback/beat/missed) | Shareholder | audio (`coinDrop`, `cash`, `denied`), effects (gold sparkles, "vested elsewhere") |
| `bossAlloc`, `bossReserve`, `bossFree`, `bossGc` (`kind`: warn/start/end) | Memory Hog (malloc starts, tiles flip to ones, a bomb frees memory, Stop-the-World) | audio (`malloc`, `reserve`, `freeMem`, `denied`, `gcSweep`), effects ("free()", green ring) |
| `bossExit` (`kind`: segfault/parachute/oom) | Megalith, Shareholder, Memory Hog (`onDeath`) | effects ("SEGMENTATION FAULT", golden parachute, "KILLED (out of memory)") |
| `playerHurt`, `playerDeath` | player, game | audio, effects, HUD |
| `pickup` (`type`), `itemGet` (`id, def`), `purchase`, `chestOpen` | pickup, player | audio, effects, HUD |
| `denied` (`reason`: credits/locked/bomb/charge) | various | audio, effects |
| `roomEnter` (`first`), `roomClear`, `doorsOpen`, `doorsClose`, `unlock`, `secretFound`, `rockBreak` (`kind`: rock/cactus) | game, room | audio, effects |
| `cactusPrick` | game (`checkCactus`) | audio (`prick`), effects (spines) |
| `enemyOverflow` (`r`) | Overflow Buffer (bursts) | audio (`overflowBurst`), effects (splash, glass shards) |
| `enemyChomp` (`r, ate`), `enemyBounce`, `enemyUnpack` | Honeypot, Rolling Release | audio (`chomp`, `bump`, `unbox`), effects (cyan ring, dust, packing peanuts) |
| `explosion` (`radius`), `bombPlaced`, `projectileEnd` (`team, impact`) | game, projectile, player | audio, effects |
| `activeUsed`, `activeCharged` | player | audio, HUD |
| `runStart`, `floorEnter` (`depth`), `descend` | game | audio (music), screens |
| `cycleComplete` (`cycles, score`) | game (`showScoreCard`) | audio (`itemGet`) |

Rule: audio and effects **only listen**. Game logic never calls them directly, except `game.shake`/`banner`, which
are game state.

### 3.12 Audio (`core/audio.js`) and effects (`entities/effects.js`)
- **Audio:** 82 synthesized SFX in total, plus a looping rain bed (two filtered noise layers) that `music.start` switches
  on for themes with `ambient: 'rain'` and `music.stop` switches off. Every sound has a name; `audio.names()` lists them.
  - Bus routing: voices → sfx/music bus → master → compressor.
  - Per-name rate limits (`RATE`) and a 40-voice cap keep it from getting noisy.
  - There is a procedural chiptune loop per floor plus a boss variant. Mute is persisted in storage; there's no
    separate music toggle.
  - The AudioContext unlocks on the first key press.
- **Effects:** use `B.FX.burst / ring / flash / smoke / debris / sparkles / text / shimmer / tint / leaves / later(game, delay, fn)`.
- **Enemy families:** an enemy def with `family: 'branches'` gets leafy hit/death effects (`FAMILY_FX` in `effects.js`)
  and sounds (`FAMILY_SOUNDS` in `audio.js`: `leafHit`, `branchDeath`, plus `creak` on windup) instead of the
  defaults; `family: 'sandbox'` gets sand bursts and dry crunches (`sandHit`, `sandDeath`); `family: 'legacy'` gets dust
  puffs, fluttering printer paper and old-hardware sounds (`legacyHit`, `legacyDeath`, `dotMatrix` on windup);
  `family: 'dephell'` gets cardboard thuds and packing peanuts (`boxHit`, `boxDeath`); `family: 'production'`
  gets metal sparks and steel debris (`clank`, `scrap`, plus `servo` on windup); `family: 'context'` gets splashes and
  soggy paper scraps (`dripHit`, `soggyDeath`, plus `gurgle` on windup). It's purely
  presentational; a new family needs an entry in both tables.
  Each room holds at most 300 effects; "important" ones (text, rings, flashes) push out the oldest particles.
  Effects use `Math.random` only.

---

## 4. Content registries (current state)

**Items:** 50 in total, 45 passive and 5 active (marked `*`). Pools: t = treasure, s = shop, b = boss, s/s = shop+secret.
```
cold_brew mech_keyboard stack_overflow context_window prompt_caching tab_completion max_effort monorepo
kubernetes blockchain technical_debt temperature few_shot regex chain_of_thought confident_hallucination
linter dark_mode microservices vibe_coding the_cloud rlhf constitutional_guardrails retry_backoff code_review
daily_standup lgtm off_by_one yaml_config git_blame rubber_duck unit_tests copy_paste on_call_pager
garbage_collector seed_funding benchmark_overfitting feature_flag extra_gpu offbrand_gpu long_term_support
swap_file electron_app reserved_instances graceful_degradation
regenerate_response* stop_generating* rm_rf* compact* ctrl_z*
```
Item conventions:
- Per-run rolled values go in `player.bonus`, and one-shot state in `player.itemState[id]`.
- Active items return `false` from `use()` to keep their charge (and should emit `denied`).
- A player shot with `damage <= 0` is a dud (Off-Brand GPU): it fizzles on enemies and breakable objects without
  damage, knockback or `onHitEnemy` hooks (`projectile.js`).
- The default price is 15 (`B.itemPrice(id)`).
- **Heart containers** (2026-11-03): besides RLHF, five items add max health (Long-Term Support, Swap File, Electron
  App, Reserved Instances, Graceful Degradation; see `documents/items.md`). Heart pickups go through `healPickup` in
  `pickup.js`: healing beyond full health is offered to the item hook `onOverheal(player, halves, game)`, and the
  pickup is taken if it healed or a hook returned `true` (Swap File banks it; its bar is `drawSwap` in `hud.js`).

**Enemies** (id: behaviour, minFloor, base HP):

| id | behaviour | minFloor | HP |
|---|---|---|---|
| bug | wander | 1 | 8 |
| null_pointer | fly_chase | 1 | 5 |
| memory_leak | split | 1 | 14 |
| hallucination | mimic | 1 | 6 (bonus spawn) |
| flaky_test | blink | 2 | 10 |
| merge_conflict | charge | 2 | 18 |
| jira_ticket | turret | 2 | 18 |
| spaghetti_code | shooter | 2 | 14 |
| race_condition | zigzag | 2 | 6 (pack of 2) |
| graphics_glitch | glitch | 2 | 10 |
| deprecation_warning | orbit | 2 (was 3 until 2026-11-03) | 12 |
| zombie_process | revive | 2 (was 3 until 2026-11-03) | 14 |
| scope_creep | grow | 4 | 10 |
| rogue_agent | rogue_agent | 7 | 16 |
| stale_branch | stale | 3, Forgotten Branches only | 12 |
| detached_head | detached_body (+ head `detached_tag`) | 3, Forgotten Branches only | 12 + 6 |
| cherry_pick | cherry | 3, Forgotten Branches only | 7 (pair of 2) |
| orphan_commit | orphan | 3, Forgotten Branches only | 6 (bonus spawn, harmless) |
| spinlock | spinlock (+ 4 `spinlock_segment`) | Sandbox Borders only | 16 |
| rootkit | rootkit | Sandbox Borders only | 12 |
| dust_daemon | dust_daemon | Sandbox Borders only | 14 |
| dry_run | dry_run | 7, The Training Data only | 14 |
| stack_trace | stack_trace | 2, Legacy Codebase only | 14 |
| honeypot | honeypot | 4, Dependency Hell only | 22 |
| rolling_release | rolling_release | 4, Dependency Hell + Sandbox Borders (×0.6) | 18 |
| rate_limiter | rate_limiter | 5, Production and The Context Limit only | 16 |
| port_scanner | port_scanner (+ 4 `port_scanner_port`) | 5, Production only | 12 (max 1 per room) |
| overflow_buffer | overflow_buffer (+ `overflow_puddle`) | 8, The Context Limit only | 18 (max 2 per room) |
| summarizer | summarizer | 8, The Context Limit only | 16 (max 1 per room) |
| lost_in_the_middle | lost_in_the_middle | 8, The Context Limit only | 14 (max 2 per room) |

The **Rogue Agent** (floor 7+, "outside the box") reuses the Rogue Agent Swarm's four sprites (one per agent, picked
with `game.rng`) and its green shots. It strafes at 200–320 px and cuts inward for 0.5 s after bumping into
something, so it doesn't get stuck shuffling in corners.

The last four are the **Forgotten Branches family** (`themeOnly: ['branches']`, `family: 'branches'`). The first
three have weight 6 each: on floor 3 they make up about 54 % of enemies since the floor rosters (2026-11-03; it was
about 24 % before). The Orphan Commit is a bonus spawn like the Hallucination (`bonusChance` 0.12, about 14 %
of combat rooms on floor 3); it is the one enemy that drops loot (2–3 credits) and it never attacks.

The **Sandbox Borders family** (`themeOnly: ['sandbox']`, `family: 'sandbox'`, weight 6 each) is the Spinlock and the
Rootkit. On that floor Deprecation Warnings also weigh ×2.5 and the Hallucination's bonus chance doubles (mirages; the
25 % cap still applies), via `themes: { sandbox: … }` on the existing definitions. Desert enemies must be **dark**
with a strong outline and fire non-sand colours (brick red), because the sand is the one mid-bright floor.
The Spinlock places its body segments in `afterMove`, after its head has moved, so the chain never lags a frame.
The **Dust Daemon** (weight 5, cost 1.8, flying) joined the family on 2026-11-03: its swirl (radius 130) bends player
shots through the `bendShot` hook (§3.8) by up to 0.008 rad per px flown, fading to 0 at the rim, always in its spin
direction (`state.spin`, rolled per instance). A shot whose straight path passes within `eye` (26 px) of the core is
never bent, so aimed shots always land. After 0.8 s spin-up and a 0.35 s hold with dashed throw lines it slings 4
brick-red clods along their tangents (190 px/s), the first set so that one tangent passes through the player, then
rests 1.4 s with no swirl and rebuilds it over 0.8 s.

The **Dry Run** (`themeOnly: ['training']`, weight 6, cost 2, 2026-11-03) is a crash-test dummy that plays in two
layers: a ghost (`state.g`, a plain `B.Entity`, not an enemy, so harmless and intangible) plans and rehearses
everything with `game.rng`, and the body (`static`, `noKnockback`, `noSeparate`) replays the recorded frames exactly
`params.delay` = 60 ticks later: position, mode (windup, dash with 2 damage) and shots (angle, speed, start point).
Nothing may move the body directly, or the replay would no longer match. Freezing pauses both layers. It's not in
the Sandbox Borders family on purpose: a bright dummy breaks the desert rule above, and that family already has three.

The **Stack Trace** is the first **Legacy Codebase** enemy (`themeOnly: ['legacy']`, `family: 'legacy'`, weight 6,
cost 1.8, max 2 per room): a beige old-hardware scorpion whose tail is fan-fold printer paper (5 sheets = stack frames,
plus a stinger). It keeps 110–230 px away and, after a 0.85 s telegraph (dashed amber line that tracks for 0.5 s,
then locks with "!" while a pulse runs up the tail), unfolds the tail along the line up to `r + 4 + 30·sheets` px:
stinger 2, unrolled paper 1 during the 0.4 s hold, folding back harmless. Walls and rocks cut the tail short (shot
collision, so it reaches over pits). If the player stood beyond reach at lock time, the stinger throws one
"uncaught exception" (200 px/s base) further along the same line. At 2/3 and 1/3 HP a sheet pops off (`enemyShed`),
so the tail and its reach shrink to 4 and 3 sheets. The tail is **not** a separate entity: the behaviour computes its
points (`stLayout`), draws them and checks contact itself, so nothing is left behind on death; its in-flight shots
are removed in `onDeath`. Because the tail is drawn above the body when curled, it sets `e.sayOffset`.

The **Dependency Hell family** (`family: 'dephell'`) is the Honeypot and the Rolling Release. Their danger colour is
**cyan** (`DEP_WARN` in `enemy.js`), the complement of the orange ember floor; lines get a dark under-stroke so they
also read on other floors. The **Honeypot** (`themeOnly: ['dephell']`, weight 5, max 1 per room) is a static golden
jar in a 190 px funnel that is always faintly drawn (on `drawLayer` −1, under everything). Cycle: idle 1.4–2.2 s →
lid pops (0.7 s, no pull yet) → 2.4 s pull toward the centre (60 px/s at the rim to 130 px/s near the middle, hard-capped
at 55 % of the player's current speed; it only moves positions and then resolves tiles, so nothing is pulled into pits
or rocks) → the last 0.6 s show a jaw ring → snap: 2 halves to the player inside 54 px, 14 damage to other enemies
there, and bombs there explode at once → chew 1.2 s. Flyers, bosses, static or intangible enemies and anything with
`noKnockback` (a rolling Rolling Release, a dashing Merge Conflict) aren't pulled. The **Rolling Release**
(`themeOnly: ['dephell', 'sandbox']`, `themes: { sandbox: 0.6 }`, weight 6, max 2 per room) aims for 0.6 s (dashed
arrow), then rolls diagonally from 130 px/s, bouncing off walls, rocks, pits and props in `afterMove`; every bounce is a
version bump (+24 px/s, cap 250, label `V1.n` under it). After 7 bounces (or 13 s) it brakes, quakes 0.6 s with rays
("BREAKING CHANGE"), bursts into a ring of 6 cyan shots and lies unpacked for 1.8 s, then repacks at base speed as
`V2.0`. It takes ×0.5 damage while packed and ×1.5 unpacked (its `init` wraps `takeHit` on that one instance; the
Enemy class is unchanged). Sandbox Borders is its second home because a rolling bundle there is simply a tumbleweed.

The **Production family** (`family: 'production'`, since 2026-11-03) is the Rate Limiter (weight 6, cost 2, max 2;
`themeOnly: ['production', 'context']`, because The Context Limit is all about tokens and limits) and the Port
Scanner (weight 5, cost 1.8, max 1; `themeOnly: ['production']`). Production's floor is dark and red, so the family
is light steel with a dark outline, and its shots and telegraph lines are **cyan** (`#5fe0ff`); amber marks warnings.
- **Rate Limiter:** a token bucket on legs (a turnstile cabinet whose three lamps are its tokens). It keeps 150–290 px
  away, aims for 0.55 s (lamps blink, a dashed line follows you, "!"), then fires one aimed shot per token, 0.24 s
  apart (each lamp goes dark, the rotor clicks on). Then it is throttled: a "429" sign and a draining Retry-After ring
  for 2.1 s, no contact damage, no shots and 1.5× damage taken (`damageTakenMult`). The lamps refill one by one
  (0.22 s each, the warning for the next burst).
- **Port Scanner:** on spawn it places 4 ports (floor sockets, `port_scanner_port`) at least 150 px apart, never on
  obstacles, spawn points, the centre or a door front, and numbers them upwards clockwise (22 → 80 → 443 …). It
  scans them in that fixed order: underground (untouchable) it follows a visible dashed scan line, the target port
  lights up, pings for 0.6 s ("!"), then it pops out, shows an aim line for 0.45 s, fires a 3-shot fan and dives
  again. A port the player stands on is "FILTERED" and skipped, so it never surfaces under you. Unlike the Rootkit,
  it never comes to you: the ports are fixed and you can pre-aim at the next one. Its ports close when it dies;
  without ports it stays up as a turret.

The **Context Limit family** (`family: 'context'`, `themeOnly: ['context']`, minFloor 8, all 2026-11-03) lives in
`entities/enemies-context.js` (one section per member). Floor 11 is past `MIX_FROM`, so the family is at home on The
Context Limit and leaks, weaker, onto every other floor from 8. Look: pale and waterlogged (glass, ink, soggy paper,
shared palette `B.CONTEXT_COLORS`); because the rain is light blue, **danger is never blue**: telegraphs are amber
`#ffb347`, shots coral `#ff8a5c` (`B.CONTEXT_DANGER`). Family effects are splashes and paper scraps, family sounds
`dripHit`, `soggyDeath` and `gurgle` (windup).
- **Overflow Buffer** (weight 5, cost 1.8, max 2): a glass tank on legs. Its fill rises from empty to full in 7 s and
  every damaging hit adds 7 % (`hitFill`; its `init` wraps `takeHit` on that one instance), so you burst it down fast
  or bait the overflow and dodge. When full it stands still for 0.8 s: the glass cracks, "[OVERFLOW]", dashed amber
  rays show the exact shot lines (ring offset from `game.rng`) and a dashed ring shows the puddle; `enemyWindup` plays
  the gurgle. Then a ring of 8 coral droplets (200 px/s base) and a puddle, 0.6 s rest, and it fills again from 0. The
  puddle is a minion `overflow_puddle` (static, intangible, `ignoreForClear`, no damage, `drawLayer` −1, drawn without
  a sprite): it grows to 80 px, lives 4 s (fading over the last 1.2 s), survives its tank, and each tick in `afterMove`
  calls `player.slowBy(0.6)` while the player's centre is inside the drawn circle. The burst emits `enemyOverflow`.
- **Summarizer** (weight 4, cost 2, max 1): a hooded scribe that never attacks (contact 1 only) and keeps 200–320 px
  away. Every 6–8 s (`game.rng`, `AI.cooldown`; first try after 3.5–5 s) it picks the closest pair of eligible enemies
  at most 300 px apart (no RNG) and telegraphs for 1.5 s: a dashed amber line between them, corner brackets,
  "compacting...", `enemyWindup`. A hit on it during the telegraph cancels it (flustered 1.3 s, next try after 3 s); a
  target that dies or leaves cancels too. On success the smaller target (radius, then HP) is absorbed: the survivor
  gains its `hp` and `maxHp`, radius ×1.15 (cap ×1.35 of `summaryBaseR`), `sizeMult` for the sprite, `summaries` +1
  and a "[summary]" tag (drawn by wrapping that one instance's `draw`). The absorbed enemy is set `dead` without
  `die()`: no `onDeath`, no `enemyDeath`, no kill, no loot; `enemyVanish` (`text: 'summarized'`) shows the puff. Only
  behaviours on the whitelist `SUMMARY_BEHAVIORS` qualify (wander, fly_chase, blink, charge, orbit, shooter, revive (not
  while down), zigzag, glitch, rogue_agent), plus flag checks (no boss or boss group, no `spawn: false`, `proxy`,
  `ignoreForClear`, `static`, `invulnerable`, `noSeparate`; not intangible or spawning when picked); at most 2
  summaries per enemy. **A new behaviour that manages its own radius or a partner must stay off the list.**
- **Lost in the Middle** (weight 5, cost 1.6, max 2, flying): a faded chat-bubble ghost named after the LLM weakness
  of forgetting the middle of a long context. Its zone is the middle third of the interior **width** at full height
  (x 341.3–618.7, `B.BEHAVIORS.lost_in_the_middle.ZONE`; a band, because a context is a sequence and a central box would
  be too small to read), judged by its centre with 6 px hysteresis. Outside it is solid: drifts toward the player at
  70 px/s, contact 1, and every 2–3 s after a 0.6 s telegraph (amber glow, "!", dashed fan lines, `enemyWindup`) fires
  3 coral word shots (`shot_lost_word`, 0.26 rad apart, 195 px/s base). Inside it is `intangible` with contact 0 and
  never attacks; it turns harmless the tick it crosses in, but only solid again after its 0.3 s fade-in ("solid =
  fully visible"); a telegraph is cancelled if it's knocked into the zone. Anti-stall: after 4 s in a row in the zone
  it drifts out at 110 px/s (toward the player's side, else the nearer edge) and holds ≥ 40 px outside for 2.2 s, so
  a player camping in the middle still gets a solid target about every 10 s. While one is alive a floor overlay
  (`LostZoneMark`, an update/draw object in `room.pickups`, `drawLayer` −2, `noShadow`) draws the two boundaries as
  dotted lines with a faint haze; it is not an enemy, so killAll and room clearing ignore it, and it removes itself
  when none are left.

Minions (`spawn: false`): `leaklet`, `microservice`, `megalith_module` (Megalith phase 2; crawls back and heals it), `loop_segment`, `nested_loop_part`, `detached_head_tag` (Detached HEAD's head),
`octo_arm` (Octopus Merge arm segment), `spinlock_segment` (Spinlock body; invulnerable, shields the head),
`port_scanner_port` (Port Scanner's port; intangible floor socket, doesn't count for clearing), `overflow_puddle` (Overflow
Buffer's slowing puddle; static, intangible, harmless, doesn't count for clearing).

Room spawning (`rollRoomEnemies`) works on a **budget**:
- Each enemy has a `cost`. The budget is `min(11, 2.4 + 0.9·depth + rand(0..1.5))`, and a room starts with at most
  `min(8, 3 + depth)` enemies.
- Spawn chances shift with depth (`weightPerFloor`), and `maxPerRoom` caps some types.
- A layout's `bias` can favour enemy tags (`fly, ranged, melee, charge, turret`).
- `bonusChance` adds extras outside the budget (the Hallucination).

**Floor themes** (spawn weights per floor theme, since 2026-11-02). Enemies and bosses can carry two optional fields,
both keyed by the theme `key` from `B.FLOOR_THEMES` (`B.themeKeyAt(depth)`):
- `themes: { branches: 3, devnull: 0 }` multiplies the weight on floors with that theme; 0 excludes it there.
- `themeOnly: ['branches']` limits it to those themes. `minFloor` still applies on top.

`B.themeWeight(def, theme)` computes the factor (0 = excluded, otherwise the `themes` value or 1). It applies after
`weightPerFloor` / `minWeight` / `maxWeight`, it scales `bonusChance` too (still capped at 25 % per room), and an
excluded enemy is skipped entirely, including its bonus roll. Bosses use the same helper through `B.bossWeightAt`,
in both `rollBoss` and `rollBossVaried`. Because themes repeat every 11 floors, a `branches` enemy also appears on
floors 14, 25, … The roll functions take an optional `theme` argument (default: the depth's theme) for tests.
Content without these fields rolls exactly as before (same RNG draws), so **existing seeds only change once you give
an enemy or boss a theme field**; say so in that commit. In use by the Forgotten Branches and Sandbox Borders
families (below).

**Floor rosters** (since 2026-11-03): a third field, `home: ['legacy', 'production']`, lists an enemy's home themes.
On any other theme its factor is `B.AWAY` (0.2) unless `themes` names that theme (explicit entries win; a `null`
theme ignores `home`). `B.themeFactor(def, theme)` is this raw factor. Every generic enemy has a home, so floors 1–7
each have their own crowd (spawn shares measured with 2,000 rooms per floor, 2026-11-03):

| # | theme | at home | away share |
|---|---|---|---|
| 1 | backlog | bug, null_pointer, memory_leak (unchanged, floor-1 seeds identical) | 0 % |
| 2 | legacy | bug, null_pointer, spaghetti_code, jira_ticket, zombie_process, deprecation_warning | 12 % |
| 3 | branches | merge_conflict + the family (54 % of enemies) | 33 % |
| 4 | dephell | memory_leak, scope_creep, zombie_process, race_condition | 32 % |
| 5 | production | race_condition, graphics_glitch, flaky_test, jira_ticket, merge_conflict, null_pointer | 15 % |
| 6 | sandbox | deprecation_warning (×2.5) + the family | 35 % |
| 7 | training | rogue_agent (×1.5), spaghetti_code, flaky_test, deprecation_warning | 32 % |

The Hallucination has no home (bonus spawn everywhere; ×2 on sandbox, ×1.5 on training). Floors 4, 6 and 7 have
the thinnest home crowd and the highest away share; the themed enemies planned for them fill that gap. A new generic
enemy needs a `home` and an entry in the smoke test's `ROSTER` table.

**Cacophony from floor 8** (`B.MIX_FROM`): `B.mixAt(depth)` is 0 before 8, then 0.25, +0.1 per floor, 1 from 16.
`B.themeWeight(def, theme, depth)` lifts any factor below 1 (AWAY, `themeOnly` exclusion, explicit 0) to
`f + (1 − f) · mix`; factors ≥ 1 stay. Without `depth` it returns the raw factor (old behaviour, used by tests).
`enemyWeightAt`, `rollRoomEnemies` (pool, exclusion and bonus chance) and the boss functions pass the depth, so the
families show up on every floor from 8 (about 21 % of enemies on floor 8, 27 % on 12; the Orphan Commit too) and
generic enemies return to equal odds. Floors 8–11 have no home crowd at all. Bosses use the same lift, but a boss
away from home weighs at most 3 (`BOSS_LEAK_WEIGHT` in `bosses.js`): the Octopus Merge is about 5 % on floor 8 and
16 % on floor 16 instead of dominating. Check that themed content reads on any floor: dark floors are fine for both
families (screenshots 2026-11-03); cacti stay a Sandbox Borders floor feature.

**Bosses** (base HP): `monolith` 360 (floors 1–6), `stakeholder` 250 (floors 1–6), `friday_deploy` 240 (floor 4+),
`infinite_loop` 300 (floors 2–7), `memory_hog` 300 (floors 4–9, ×2 on Dependency Hell), `megalith` 460 (floor 7+, replaces the Monolith), `shareholder` 380 (floor 7+,
replaces the Stakeholder), `nested_loop` 450 (floor 8+, replaces the Infinite Loop), `rogue_swarm` 4 × 80, `reviewer`
340 (floor 4+), `octopus_merge` 300 (330 until 2026-11-03; Forgotten Branches only, weight 12: about 52 % on
floor 3, about 41 % on floors 14, 25, …). Each replacement has its predecessor's weight and a `replaces` field, so
a floor never has the predecessor as a side quest (the side quests keep the retired bosses alive past their `maxFloor`). Friday Deploy and the Reviewer moved from floors 2 and 3 to floor 4 on
2026-11-02, which gives floor 3 to the Octopus Merge and floor 2 to Monolith, Stakeholder, Loop and Swarm.
- **Octopus Merge** works like the Infinite Loop: the knot is the boss, its 8 arms are 5 `octo_arm` segments each
  (`proxy`, 60 %). The knot positions them every tick and draws the arms itself; only the tip (a commit dot) draws
  as a sprite. Arm contact is checked along the drawn line, not per segment. Speed-ups from merges (`state.sm`)
  shorten pauses and swings, never telegraphs.
- **Side quests** (floor 8+, §3.6 step 10): Monolith, Rogue Agent Swarm, Infinite Loop (also after its `maxFloor`)
  and Stakeholder can appear as a combat-room encounter at `B.ENCOUNTER_HP` (0.5) × the floor boss HP of that depth,
  alone (they bring their own minions and segments), with no intro, trapdoor or boss pedestal.
- **The Megalith and The Shareholder** (2026-11-03) live in `entities/bosses-late.js` (`boss.js` was too long);
  the header there lists every attack. Shared beam code is in `B.BossHelpers` (`beamPath` with wall bounces,
  `beamHits`, `drawBeam`); the Reviewer's laser draws through it too. A boss behaviour may define
  `barText(e, game) → {text, color}` for a second HUD line under the boss bar (`hud.js`).
  - **Megalith:** its main attack, *scroll*, fires rows of syntax-coloured bullets (one per 40 px slot) from the wall
    farther from the player. A row is a line of code: indentation leaves a gap on the left, the line end a gap on the
    right, and indentation changes by at most one level. `megaBody` only accepts a row if one of its gaps is
    reachable from one of the previous row's gaps in the time between rows (60 % of the player's 240 px/s), and
    falls back to repeating the previous row; the next row is always shown faintly at the wall. Phase 2 adds one
    merge-marker row (no indentation, one 3-slot hole). *Ctrl+F* places 4/6 search highlights (the first on the
    player) that are replaced after their tell (half a heart inside, plus a cross of 4 shots); *Ctrl+S* is the
    Monolith's stomp (16-shot ring, doubled in phase 2) plus 3/5 falling chunks on target rings (2 damage). At 50 %
    ("Refactor rejected") 4 `megalith_module`s land ≥ 170 px away and walk back in a straight line; each one that
    arrives heals 4 % of max HP (never above 50 %) and disappears without counting as a kill. Up to 2 more come every
    10 s (max 4). The HUD line counts "lines" (6,000,000 × HP share).
  - **Shareholder:** *glint* is the Reviewer's aim → lock → fire sequence from the monocle (`MONOCLE` offset), but
    the 14/16 px gold beam bounces off the walls 1/2 times, and the aim line shows the full path. *dividend* throws
    3/5 slow gold orbs that swell and burst into rings of 6; *rain* drops 6/9 coins onto target rings (half a heart),
    and about every fourth leaves a real credit for 3 s (`coinCap` 6 per fight). Below 40 % ("Hostile takeover")
    *buyback* freezes every enemy shot in the room for 0.5 s with gold lines to him, then sends them back (each
    vanishes on arrival via its `range`). **Quarterly earnings** run all fight: every 12 s, between attacks, he is
    stunned for 1.5 s with `damageTakenMult` 1.25 if the player took ≥ 8 % of his max HP that quarter, otherwise he
    fires a telegraphed 10-shot ring and gets 8 % faster (at most 3 times). The HUD line shows the quarter clock.
- **The Memory Hog** (2026-11-04) lives in `entities/boss-memory-hog.js`; the header there lists every attack, all
  numbers are in `HOG`. A squat, front-facing steel-blue hog whose quills are `1`-bits. **Keep him a hog:** no upright
  stance, no rolling or spin attack; a blue hedgehog must not drift toward a famous mascot (§1). Floor 3 stays the
  Octopus Merge's. *malloc* reserves 3×3 blocks (2, then 3 per cast since the last GC; the first on the player): 1 s of
  faint zeros, then ones for 8 s, half a heart. *Page Fault* tracks, locks, charges at 340 px/s and leaves a trail of
  reserved tiles. *Quill Dump* is a ring of 14 bits with two 3-slot gaps. malloc alternates with the other two, so the
  floor reliably fills. **Stop-the-World** comes at 40 % of the floor, or when a malloc finds no room: 1.1 s warning,
  a sweep frees everything in 0.7 s, and he stands still for 2.6 s with no contact damage and `damageTakenMult` 1.5.
  At 50 % ("Heap fragmentation") the room is swept and malloc reserves 16–20 single tiles, never edge to edge. The HUD
  line shows the heap share. Reserved memory is the class `ReservedMemory`, an overlay in `room.pickups` like
  `LostZoneMark`: real tiles never change, and it keeps running while he is frozen. It hurts flyers on purpose, or a
  flight item would switch off his main attack, and uses the same foot point as layout spikes. A bomb frees every group
  it reaches, always the whole group. `canTake` guards every reservation, trail tiles included: **all new ways of
  reserving must go through it**, or the room can split (random 3×3 blocks did in 113 of 400 tries). He isn't a side
  quest.
- **Nested Infinite Loop:** the boss entity is an invisible, intangible controller at the centre that only holds the
  shared HP pool (so the HUD shows one bar). The three rings are `nested_loop_part` enemies with `proxy` to it,
  placed every tick in `afterMove`. Only the outermost living ring is tangible, fires and hurts on contact; the
  inner rings spin along as ghosts. Rings break at 50 % and 16.67 % (parts pop, shots cleared, banner, 1.6 s
  pause). Shots are colour-coded per ring (cyan, violet, coral). Bosses can now end at a depth via `maxFloor`
  (`B.bossEligible` checks min/max floor and theme).

Each has 2 phases and
telegraphed attacks; enemy bullets travel at 165–260 px/s.

**Final Score** (2026-11-04): `game.score` counts events, `game.scoreTotal()` multiplies them by `B.SCORE_VALUES` (top of
`game.js`): coins 1 (a Credit Stack is 5 coins), kills 2, Approvals used 6, items taken 25, floor bosses 80, side quests
40, rooms cleared 4. It's shown on the post-mortem and the score card, and it survives "keep going"; there's no
live HUD display and nothing is stored between runs. Only credits from pickups count. Kills skip anything in
`B.BOSSES`, `proxy` or `ignoreForClear` parts and minions with `state.owner` (boss-refilled, so they can't be farmed);
keep that in mind when a new enemy respawns things. Bosses and rooms count in `onRoomClear`, so the Swarm's four
entities score once. `game.cycles` counts finished cycles and resets with the run.

**Pickups:** `heart_half heart guardrail credit credit5 push push2 approval chest chest_locked readme` (`readme` is never
a random drop; see §3.6 step 8).
- **Drop economy:** apart from the shop and chests, pickups only come from the room-clear roll (35 % + 3 % per luck)
  and broken rocks (8 %). Enemies drop nothing. That's roughly 0.2 Approvals and 1–3 credits per floor from random
  drops, plus the guaranteed Approval from depth 2. Exception: a caught Orphan Commit drops 2–3 credits (Forgotten
  Branches only). Loose loot in combat rooms (§3.6 step 7) adds about
  1–2.5 credits, 0.3–0.8 half hearts and 0.15–0.45 Approvals per floor (floors 1–6).

**Layouts:** 30 in total (27 tagged `normal`, plus special ones; `empty` carries both tags). `validateLayout(l)`
checks the format and that all 4 door tiles are clear and mutually reachable. `{strict: true}` adds three house rules:
every floor tile must be reachable, there must be no spikes next to doors, and special rooms need a clear centre.

**Text** (`B.TEXT`): `FLOORS` (11), `EPITAPHS` (25), `TAGLINES`, `SHOP_LINES`, `ENCOUNTER_LINES` (side-quest banner), `CLEAR_QUIPS`, `DENIED`, `PICKUP`, `EVENTS`, `RANKS`,
plus per-floor extras `THEME_QUIPS` / `THEME_EPITAPHS` keyed by theme `key` (currently `branches`, `sandbox` and `context`),
and `CONTEXT_WHISPERS` (The Context Limit's floor fragments and whispers).

---

## 5. Recipes

**Add a passive item**
1. `src/data/items.js`: add `B.ITEMS.my_item = { name, tagline, desc, pools: ['treasure', …], sprite: 'item_my_item', add/mult/flags/hooks }`.
2. `src/data/sprites-items.js`: `spr('item_my_item', [...rows], {palette overrides})`. Use 12–16 px art, a 1 px dark outline and 3–5 colours.
3. If the item needs a new **flag**, consume it where it matters: shot flags in `player.shoot` / `projectile.js`,
   follower flags in `syncFollowers`. Booleans OR together automatically; numbers are summed.
4. Run the smoke test. It fails if the sprite is missing or `giveItem` throws.

**Add an active item:** same as above, plus `active: true, maxCharge: N, use(player, game) { …; return true; }`.

**Add an enemy**
1. In `src/data/enemies.js`, add a definition with `behavior`, `minFloor`, `weight`, `cost` and `color`. For a
   floor-specific enemy, add `themeOnly` or `themes` (§4, Floor themes); the smoke test rejects unknown theme keys.
   A generic enemy gets a `home` list and an entry in the smoke test's `ROSTER` table (§4, Floor rosters).
2. If needed, add a new behaviour in `src/entities/enemy.js` (`B.BEHAVIORS.name = {update(e, dt, game) {…}}`). Use
   the `B.AI` helpers, and **telegraph** every attack (wind-up glow, `!`, target ring).
3. Add the sprite as `enemy_<id>` in `sprites-enemies.js`, with 2 frames.
4. Check fairness: enemy shots at 165–260 px/s (the player moves at 240), contact damage of 1 half heart (2 for charges/bosses).

**Add a boss:** add a `B.BOSSES.id` entry with `name`, `subtitle` (shown on the intro card), `hp`, `r`, `behavior`, `sprite`
and `color` (optionally `themes` / `themeOnly`, §4, `maxFloor` to retire it on deeper floors, and `replaces` on its successor), plus a `B.BOSS_BEHAVIORS.id` entry in `boss.js`. Give it ≥ 2 attacks and a phase change at a HP threshold
(emit `bossPhase`, show a `game.banner`), and place it with `BossHelpers.placeAwayFromPlayer`. Optional: `barText(e, game)`
for a second HUD line under the boss bar. `boss.js` is long; new bosses can go into `bosses-late.js` or a new file.

**Add a layout:** use `L(id, ['normal'], weight, [7 rows × 13 chars], bias?)` in `layouts.js`. The characters are
`. r b p s e` (`e` marks a preferred spawn point). It must pass `validateLayout(l, {strict: true})`.

**Add a sound:** add an entry to `SOUNDS` in `audio.js` built from `voice({...})` / `noise({...})` / `arp(...)`, then
hook it with `on('event', () => p('name'))`. Rate-limit it in `RATE` if it can fire every frame.

**Add a floor:** add an entry at the same position in `B.TEXT.FLOORS` (name + subtitle) and `B.FLOOR_THEMES` (colours,
`pattern`, `decor`, optional `wallDecor`/`ambient`/`gen`/`tiles`/`cacti`, music), keeping the two lists the same length (the smoke test
checks). Depths cycle through the list modulo its length, with roman-numeral suffixes on later passes. New `pattern` /
`decor` / `wallDecor` / `ambient` values need a case in `renderer.js`. Inserting in the middle shifts the names of all
later floors (Forgotten Branches went in at position 3 on 2026-11-01, Sandbox Borders at position 6 on 2026-11-02);
enemy and boss unlocks follow depth, not names, but themed content moves with its theme (Forgotten Branches came back
on floor 13 before Sandbox Borders, now on 14). `theme.tiles` swaps the sprites of rocks, blocks or spikes for one
floor (`blockJoin: true` picks fence frames by neighbouring blocks).
Afterwards run `node tools/export-floors.js` and add the floor to `documents/floors.md` (its "Colour coverage" section
lists which hues are still free).

**Add a new source file:** add the `<script>` tag in `index.html` at the right place in the load order (§3.1) and
wrap the file in the IIFE pattern.

**Change a contract** (`game` API, entity fields, event names): grep every use (`grep -rn "eventName" src`). Several
modules rely on these implicitly through the bus.

---

## 6. Known issues and gotchas

- **Boss intro only on door entry.** `pendingBossIntro` is set in `enterRoom` and consumed at the end of a room
  transition, so debug teleports skip the VS card. It's only set for `room.type === 'boss'`, which is what keeps
  side-quest bosses (normal rooms) without intro and boss music; don't widen that check to `isBoss`.
- **Side quests and the minimap.** Side-quest rooms aren't marked on the minimap on purpose (you find out on entry).
  Their arena layout comes from the `special` pool, so a new `special` layout must keep the centre free (strict
  validation already requires it).
- **Item repeats.** Once every item has been seen in a run, `rollItem` falls back to the full list. Duplicate follower
  items then stack (several ducks or orbitals).
- **Few-Shot plus Regex** gives a 3-way fan, because the larger `multishot` wins and `parallel` only applies to a count of 2.
- **Flat item damage.** `rm_rf` (25) and On-Call Pager (10) deal fixed damage while enemy HP scales with depth, so
  they get weaker deeper down.
- **Stat recalculation timing.** `player.recalcStats()` runs on item pickup, hurt and heal, but **not** when guardrail
  pickups are collected. `git_blame` works around this with an `update` hook.
- **Hallucination and room clearing.** While disguised it is `ignoreForClear`. Because `onRoomClear` fires only once,
  a Hallucination revealed after the room was cleared must not lock the doors; agent B handled that inside the behaviour.
- **Hallucination must stay indistinguishable.** Before 2026-10-31 any coin on the floor during a fight was always the
  Hallucination, because real pickups only appeared after clearing. Now it rolls a disguise from `B.LOOSE_LOOT` and
  real loose loot uses the same table and placement. A bomb that would fling a real pickup also reveals it
  (`onExplosion` behaviour hook, called from `game.explode`). Keep these in sync when changing either side.
- **No separate music toggle.** Storage only persists `muted`; `M` mutes everything.
- **Untested areas.** Balance hasn't been playtested by humans: bot runs suggest boss fights of 45–120 s, but treat
  that as a guess. Firefox under `file://` is untested.
- **Determinism caveat.** See §3.6: item and shop rolls depend on the order rooms are visited.
- **Debug teleport placement.** `teleport()` places the player near the room centre or bottom, not at a door.
- **Stakeholder pacing.** It's set in `STAKE_PACE` / `STAKE_SPIRAL_GAP` in `boss.js`. The breaks go through
  `AI.cooldown` (unchanged on floor 1, up to −25 % deeper); the spiral gap deliberately doesn't scale with depth.
- **Secret rooms are deliberately subtle.** The only hint is a small dark crack on the wall next to the hidden door
  (in the background bake, `renderer.js`), and the minimap hides the room until it's opened. On 2026-10-31 the crack
  was made a little more visible after players reported never finding one; before that it was practically invisible.

## 7. History and ownership
v1 was built in one session (2026-10-30). A lead wrote the design doc and the core engine (core, world, game, main,
player, projectile, entity, and the original renderer, HUD and screens). Three agents then worked **in parallel on
disjoint files**:
- **A — items and economy:** `items.js`, `sprites-items.js`, `pickup.js`, `familiar.js`
- **B — enemies, bosses and layouts:** `enemies.js`, `bosses.js`, `layouts.js`, `sprites-enemies.js`, `enemy.js`, `boss.js`
- **C — presentation:** `sprites-core.js`, `palette.js`, `text.js`, `audio.js`, `effects.js`, `hud.js`, `screens.js`,
  plus drawing-only changes in `renderer.js`

The only change outside an agent's own files is in `player.draw()` (pose sprites), marked `// [agent-C]`. If you split
work again, the same file-ownership split works well.

## 8. Security checklist for any change
- [ ] No new network access; the CSP is unchanged or stricter.
- [ ] No `eval`, `new Function`, `innerHTML` or string `setTimeout`/`setInterval`; text only via canvas.
- [ ] New input (URL params, storage keys) is validated with whitelist regexes, size limits and type checks, with
      safe defaults on failure.
- [ ] No personal data, secrets or tokens in code, comments, sprites or test fixtures.
- [ ] No new third-party code or assets. If one is ever truly needed, vendor it locally and review its licence.
- [ ] `node tools/smoke-test.js` passes, and you've looked at the screenshots.

## 9. Backlog
- Gamepad support (`navigator.getGamepads()` polled in `input.js`).
- Seed entry on the title screen.
- Curse rooms ("Terms of Service": pay half a heart for an item).
- A daily seed with a local leaderboard.
- A separate music toggle (extend the `storage` schema with validation).
- Scale item damage with depth.
- Better item-pool exhaustion handling (e.g. hand out `blockchain` forever).
- A human balance pass on boss HP and spawn budgets, and on enemy and boss odds per floor (`minFloor`, `weight`,
  `weightPerFloor`, `themes`, `home`, `AWAY`, the `mixAt` curve, side-quest HP and count). The floor-3/4 boss shuffle
  on 2026-11-02 and the floor rosters on 2026-11-03 were first steps; the rest is untuned.
- Ideas from the 2026-11-01 brainstorm, in planned order:
  - ~~Floor-based enemy variety~~: done 2026-11-02 (`themes` / `themeOnly`, see §4, Floor themes). The themed
    content below builds on it.
  - **Forgotten Branches enemies (themed via §4 Floor themes, ideally `themeOnly: ['branches']` or a high
    multiplier there).** Shared visual language, so they read as one family on that floor:
    - **Look:** organic and woody, like the floor and its bush props. Bark browns (`#5a3d22`, `#a3602c`), leaf greens
      (`#4f7a30`, `#6f9a3c`, `#86ad4a`) and the dark green outline `#16240f` (`prop_bush`), not the usual black.
      Scale 4, 2 frames, 10–14 px art like the other enemies. Git puns go into the shapes (commit dots, branch
      lines, tags), not into on-sprite text (too small to read).
    - **Contrast:** the floor is green, so nothing dangerous may be green. Enemy shots and telegraphs use warm
      colours (amber `#ffcf4d`, coral `#ff7a5c`, cherry `#d64545`); green is only for harmless or friendly things.
    - **Sound and effects:** leafy rustles and wood knocks instead of metal clicks. Small falling-leaf particles on
      hits fit (`FX.burst` with leaf colours via a bus listener; effects only listen).
    - ~~Detached HEAD~~, ~~Stale Branch~~, ~~Cherry-Pick~~, ~~Orphan Commit~~: done 2026-11-02 (§4). The rules
      above still apply to new members; reuse `B.BRANCH_LEAVES` and set `family: 'branches'`.
  - **Stash rooms** (`git stash`): a small optional room whose doorway is closed by a **hedge wall** of bush props
    (`prop_bush`, a whole row) instead of a door, which you shoot open. Inside: a cosy storage look (a few crates,
    one labelled with a little tag), 2–3 pickups and sometimes a chest. Minimap icon: a small box. Mostly on
    Forgotten Branches, rarely elsewhere. Note that props deliberately never block doors today (`assignProps`), so
    this needs its own placement code, and the walkability check must treat the stash entrance as a door.
  - **Bosses:**
    - ~~Octopus Merge~~: done 2026-11-02 (§4).
    - ~~Nested Infinite Loop~~: done 2026-11-02 (§4), as the Infinite Loop's replacement from floor 8.
  - ~~More Sandbox Borders enemies~~ (brainstorm 2026-11-02): all seven built on 2026-11-03 and spread over several
    floors (§4): Stack Trace (Legacy Codebase), Honeypot and Rolling Release (Dependency Hell), Rate Limiter and
    Port Scanner (Production), Dust Daemon (Sandbox Borders), Dry Run (The Training Data).
  - **Next enemy ideas per floor:** see `ENEMY_IDEAS.md` (eight ideas for floors 2–7 from the 2026-11-03 build
    round, plus leftovers from the late-boss brainstorm).
