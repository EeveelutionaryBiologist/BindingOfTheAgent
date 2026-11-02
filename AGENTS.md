# AGENTS.md — Technical handoff: The Binding of the Agent

This is the doc to read before changing anything. It explains how the game is put together, the rules you can't
break, how to check your work, and where the rough edges are. If you need a fact that isn't here, look in the file
header comments: every source file starts with a contract/overview block in German.

Related docs: `README.md` (player-facing: controls, debug keys), `DESIGN.md` (game design, content tables, original
build plan, and an "Implementation status" section at the end of §13), plus `documents/items.md` and
`documents/enemies.md` (hand-edited lists of all items and pickups, and of all enemies and bosses, with sprites; update
them when you add or change content).

---

## 0. TL;DR

- **What it is:** a Binding-of-Isaac-style roguelite in which a small Claude avatar descends random dungeon floors
  forever. It's an internal team distraction, with no ending and no meta-progression.
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
`.nextFloor()`, `.reveal()`, `.gotoRoom('start'|'treasure'|'shop'|'boss'|'secret')`, `.resources(n)`.
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
  about 30 % of floors, only in normal rooms, and reveals every room except the secret room;
- pipes appear in about 10 % of combat rooms after clearing (never by a door), never lead to the boss room, the
  secret room or the current room, and can't ping-pong during their cooldown;
- floor names and themes have the same length, floor 3 is Forgotten Branches, and its maps have ≥ 7 dead ends;
- breakable objects use the floor's kinds, stay off spawn points, door fronts and the centre, never cut a room in two,
  and break from player shots and explosions but not from enemy shots;
- the Off-Brand GPU turns about 12 % of shots into duds that deal no damage, and the GPU prices are 30¢ / 20¢;
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
`documents/images/`. Run it after art changes; it never edits the Markdown. `node tools/export-pdf.js` renders every
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
entities/entity → projectile → player → enemy → boss → pickup → familiar → effects
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
| `C`, `DIRS`, `OPPOSITE`, `TILES` | namespace | constants, directions, tile enum (FLOOR, WALL, ROCK, BLOCK, PIT, SPIKES, DOOR, PROP) |
| `bus` | namespace | event bus `on/off/emit`; listener exceptions are caught and logged |
| `storage`, `params` | namespace | validated localStorage (`muted, bestFloor, runs, deaths`); validated URL params |
| `ITEMS, ENEMIES, BOSSES, BEHAVIORS, BOSS_BEHAVIORS, PICKUP_TYPES, LAYOUTS, TEXT` | namespace (filled by data/entities) | content registries |
| `RNG`, `hashString`, `randomSeed` | rng | mulberry32 PRNG (`next/float/int/chance/pick/weighted/shuffle/angle`), FNV-1a hash |
| `M` | math | `clamp, lerp, approach, dist, norm, angleDiff, circlesOverlap, circleRectPush, …` |
| `input` | input | `down(code)`, `pressed(code)` (edge since the last sim step), `moveVector()`, `shootDir()`, `_simulate()` |
| `defineSprite, drawSprite, hasSprite, spriteSize, spriteFrameCount` | sprites | ASCII sprite registry; unknown names draw a magenta placeholder |
| `audio` | audio | `unlock, play(name), toggleMute, tone, names(), music.start/stop` |
| `FONT, COLORS, FLOOR_THEMES, themeFor(depth)` | palette | colours and 10 floor themes (`gen` is read by the map generator) |
| `floorInfo(depth)`, `TEXT.*` | text | floor names/subtitles (cycling with roman numerals) and all snark lists; `TEXT.pick(list)` |
| `Room`, `Floor` | world | room model and floor generator |
| `Entity, Projectile, Bomb, Player, Enemy, Boss, AI, BossHelpers` | entities | gameplay classes and AI helpers |
| `Pickup, Pedestal, Trapdoor, rollRandomPickup, openChest, rerollPickup, drawSpriteIfExists` | pickup | economy objects |
| `syncFollowers, Duck, UnitTest` | familiar | followers (Rubber Duck, Unit Tests orbitals) |
| `FX, Particle` | effects | visual effects API |
| `itemPrice, itemFx` | items | price helper, pop-up text fallback |
| `enemyWeightAt, rollRoomEnemies, rollBoss, validateLayout` | data | spawn and layout logic |
| `Renderer, text`, `HUD, pixelText, pixelTextWidth`, `Screens` | render | drawing |
| `Game`, `game`, `debug` | game, main | state machine instance and debug API |
| `spriteTools` | sprites-core | `shiftRow, stamp, mirror, padRows` helpers for composing sprites |

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
Global keys handled in every state: `M` (mute) and `F2` (debug). Holding `R` for 1 s in play or pause restarts the run
(`game.restartHold` drives the HUD ring).

### 3.5 World API (`game` is passed to every behaviour and hook)
`game.player · game.room · game.floor · game.depth · game.rng · game.followers · game.seed · game.runStats`
- `spawnProjectile(opts)`, `spawnEnemy(id, x, y, room?)`, `spawnBoss(id, x, y, room?)`
- `spawnPickup(type, x, y, opts?, room?)`, `spawnPedestal(itemId, x, y, {price}?, room?)`
- `explode(x, y, radius, damage, source)`: damages enemies and the player (2 halves), breaks rocks (8 % loot), reveals
  hidden doors, flings pickups, shakes the screen, emits `explosion`
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
8. `assignReadme` puts a `readme` pickup (README.md) into one random normal room on 30 % of floors (`room.hasReadme`,
   `floor.readmeRoom`, own stream `':readme'`). Collecting it calls `floor.documentMap()`: every room except the secret
   room becomes `seen`, and `floor.documented` makes the minimap draw connections between unvisited rooms too.
9. `assignPipes` marks about 10 % of combat rooms `hasPipe` (own stream `':pipe'`). `game.onRoomClear` →
   `placePipe` drops a `B.Pipe` (in `room.pickups`, not near doors or the centre). Walking onto it calls
   `game.pipeWarp`, which teleports to a random room other than boss, secret and the current one (via `game.rng`).
   Pipes only trigger on the step *onto* them, and `game.pipeCooldown` (1 s) blocks all pipes after a jump.
10. `assignProps` places breakable objects (tile `PROP`, data in `room.props` keyed `"c,r"`) in normal rooms, with kinds,
   chance and max count from the floor theme's `props` (`B.PROP_KINDS` in `layouts.js`). Own stream `':props'`. Never
   on spawn points, the centre or the 3 × 3 area in front of a door, and `fullyWalkable` must still hold afterwards
   (all walkable tiles form **one** connected area; the search starts from a single door front, because starting from
   all of them at once let a row of props split a room between two doors, a soft-lock on the tree-shaped map).
   Player shots call `game.hitProp` (in `projectile.js`), spectral shots too (once per prop while passing through),
   explosions call `game.breakProp`; enemy shots don't damage them. Breaking drops a random pickup with `B.PROP_LOOT_CHANCE` (10 %). Props are drawn per frame (`drawProps` in
   `renderer.js`), not baked into the background.

**Boss choice:** each room build still pre-rolls `bossId` with `B.rollBoss` (so the floor RNG is unchanged), but
`game.enterFloor` then calls `assignFloorBoss`, which replaces it with `B.rollBossVaried(rng, depth, game.bossHistory)`.
The previous floor's boss is excluded, and bosses already met count `weight / (1 + times met)`. Its RNG is seeded with
`hashString(seed + ':boss:' + depth)`, and the history only depends on earlier floors, so runs stay reproducible.

**Seeds:**
- Each floor's generator RNG is seeded with `hashString(seed + ':floor:' + depth)`, so a seed always gives the same
  maps, layouts and enemy lists.
- `game.rng` is seeded with `hashString(seed + ':run')` and drives drops, item rolls and AI. Because
  `populate()` (items, shop wares) uses `game.rng` on first entry, **item rolls depend on the order rooms are visited**.

### 3.7 Rooms (`world/room.js`)
- **Tiles:** a `Uint8Array(COLS*ROWS)`. Use `tileAt/setTile` (`setTile` marks `bgDirty` and invalidates the flow field).
- **Collision modes for `isSolid(c, r, mode, isPlayer)`:**

  | Tile | walk | fly | shot | spectral |
  |---|---|---|---|---|
  | WALL | solid | solid | solid | solid |
  | DOOR | solid unless `isPlayer` and the door is open | same | solid | solid |
  | ROCK / BLOCK / PROP | solid | — | solid | — |
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
    update` on all passive items and the active item, and catches errors per item.
  - **Shooting:** 4-directional (the last arrow key pressed wins); shots inherit 30 % of the player's velocity.
    `multishot` fires a fan (`spread`, default 12°), or a parallel pair when `parallel` is set and the count is 2.
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
- **`Bomb`:** sits in `room.projectiles` with a 1.5 s fuse, then calls `game.explode(…, 110, 30)`. It hurts the player too.
- **`Enemy`** (`entities/enemy.js`):
  - **Behaviour contract:** `init`, `update`, `onDeath`, `onLethal`, `onExplosion`, `onHitPlayer`, `draw` / `drawUnder` / `drawOver`.
  - **Common fields:** `e.state` (free scratch space), `e.params`, `spawnDelay` (0.5 s with no action and no contact
    damage), `frozen`.
  - **Optional flags:** `intangible, invulnerable, static, noKnockback, ignoreForClear, noHpBar, noSeparate`.
  - **Damage forwarding:** `proxy` / `proxyMult` pass damage to another enemy (worm segments → head).
  - **Area damage:** `aoeDedupe` makes sourceless damage count once per tick.
  - **Speech:** `sayText`.
  - **Scaling:** HP grows ×(1 + 0.15·(depth−1)).
  - **Helpers in `B.AI`:** movement (`toward, pathToward, wander, stop, turn, clampToRoom, findSpot`), shooting
    (`shoot, shootAt, ring, fan, fanAngle`, scaled by `shotSpeed(game, base)` / `cooldown(game, base)`), and
    telegraphs (`say, drawMark, drawTargetRing, drawRays, drawGlow, drawBody`).
  - **Projectile cap:** `AI.shoot` won't create enemy shots once a room holds `AI.MAX_PROJECTILES` (200).
- **`Boss`** (`entities/boss.js`) extends Enemy:
  - HP grows ×(1 + 0.3·(depth−1)); `noKnockback`, `noSeparate`. Behaviours live in `B.BOSS_BEHAVIORS`, with shared
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
  and the death "POST-MORTEM".
  - Note: the pause screen registers its **own `window` keydown listener** for arrow-key browsing. It's display only,
    and it's the one input listener outside `input.js`.

### 3.10 Sprites
- **Format:** `defineSprite(name, {palette: {ch: '#hex'}, rows: [...] | frames: [[...], ...], scale: 4})`. `.` and
  space are transparent, and characters missing from the palette are transparent too. Sprites are baked lazily into
  offscreen canvases, plus a white "flash" variant.
- **Naming:**
  - `player_{down,up,left,right}` (4 walk frames), `player_hurt`, `player_itemget`, `player_dead`
  - `tile_{rock(3 frames),block,pit,spikes}`, `hud_*`, `map_{boss,treasure,shop,secret}`, `pipe` (2 frames, generated),
    `prop_{crate,bush,package,carton}` (frame 1 = damaged)
  - `item_<id>`, `pickup_<type>`, `pedestal`, `trapdoor`, `bomb`, `familiar_duck`, `orbital_test`
  - `enemy_<id>`, `boss_<id>`
- **Count:** about 107 sprites. All of them are original pixel art written as ASCII in code.

### 3.11 Event bus (who emits → who listens)
Payloads usually include `game, x, y` and often `color`.

| Event | Emitted by | Typical listeners |
|---|---|---|
| `shoot`, `familiarShoot` | player, familiar | audio |
| `enemyHit`, `enemyDeath` (`boss`, `segment`) | enemy | audio, effects |
| `enemyReveal`, `enemyRevive` | enemy behaviours | audio, effects |
| `hudGlitch` (`kind`) | game (`glitchHud`) | audio |
| `pipeAppear`, `pipeWarp`, `pipeArrive` (`to`) | game | audio, effects |
| `propHit`, `propBreak` (`kind, color`) | game | audio, effects |
| `bossSpawn`, `bossIntro`, `bossPhase`, `bossStomp`, `bossBounce`, `bossBeam` | game, boss | audio (boss music), effects |
| `playerHurt`, `playerDeath` | player, game | audio, effects, HUD |
| `pickup` (`type`), `itemGet` (`id, def`), `purchase`, `chestOpen` | pickup, player | audio, effects, HUD |
| `denied` (`reason`: credits/locked/bomb/charge) | various | audio, effects |
| `roomEnter` (`first`), `roomClear`, `doorsOpen`, `doorsClose`, `unlock`, `secretFound`, `rockBreak` | game, room | audio, effects |
| `explosion` (`radius`), `bombPlaced`, `projectileEnd` (`team, impact`) | game, projectile, player | audio, effects |
| `activeUsed`, `activeCharged` | player | audio, HUD |
| `runStart`, `floorEnter` (`depth`), `descend` | game | audio (music), screens |

Rule: audio and effects **only listen**. Game logic never calls them directly, except `game.shake`/`banner`, which
are game state.

### 3.12 Audio (`core/audio.js`) and effects (`entities/effects.js`)
- **Audio:** 35 synthesized SFX in total. Every sound has a name; `audio.names()` lists them.
  - Bus routing: voices → sfx/music bus → master → compressor.
  - Per-name rate limits (`RATE`) and a 40-voice cap keep it from getting noisy.
  - There is a procedural chiptune loop per floor plus a boss variant. Mute is persisted in storage; there's no
    separate music toggle.
  - The AudioContext unlocks on the first key press.
- **Effects:** use `B.FX.burst / ring / flash / smoke / debris / sparkles / text / shimmer / tint / later(game, delay, fn)`.
  Each room holds at most 300 effects; "important" ones (text, rings, flashes) push out the oldest particles.
  Effects use `Math.random` only.

---

## 4. Content registries (current state)

**Items:** 45 in total, 40 passive and 5 active (marked `*`). Pools: t = treasure, s = shop, b = boss, s/s = shop+secret.
```
cold_brew mech_keyboard stack_overflow context_window prompt_caching tab_completion max_effort monorepo
kubernetes blockchain technical_debt temperature few_shot regex chain_of_thought confident_hallucination
linter dark_mode microservices vibe_coding the_cloud rlhf constitutional_guardrails retry_backoff code_review
daily_standup lgtm off_by_one yaml_config git_blame rubber_duck unit_tests copy_paste on_call_pager
garbage_collector seed_funding benchmark_overfitting feature_flag extra_gpu offbrand_gpu
regenerate_response* stop_generating* rm_rf* compact* ctrl_z*
```
Item conventions:
- Per-run rolled values go in `player.bonus`, and one-shot state in `player.itemState[id]`.
- Active items return `false` from `use()` to keep their charge (and should emit `denied`).
- A player shot with `damage <= 0` is a dud (Off-Brand GPU): it fizzles on enemies and breakable objects without
  damage, knockback or `onHitEnemy` hooks (`projectile.js`).
- The default price is 15 (`B.itemPrice(id)`).

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
| deprecation_warning | orbit | 3 | 12 |
| zombie_process | revive | 3 | 14 |
| scope_creep | grow | 4 | 10 |

Minions (`spawn: false`): `leaklet`, `microservice`, `loop_segment`.

Room spawning (`rollRoomEnemies`) works on a **budget**:
- Each enemy has a `cost`. The budget is `min(11, 2.4 + 0.9·depth + rand(0..1.5))`, and a room starts with at most
  `min(8, 3 + depth)` enemies.
- Spawn chances shift with depth (`weightPerFloor`), and `maxPerRoom` caps some types.
- A layout's `bias` can favour enemy tags (`fly, ranged, melee, charge, turret`).
- `bonusChance` adds extras outside the budget (the Hallucination).

**Bosses** (base HP): `monolith` 360, `stakeholder` 250, `friday_deploy` 240, `infinite_loop` 300, `rogue_swarm` 4 × 80,
`reviewer` 340 (floor 3+).
Each has 2 phases and
telegraphed attacks; enemy bullets travel at 165–260 px/s.

**Pickups:** `heart_half heart guardrail credit credit5 push push2 approval chest chest_locked readme` (`readme` is never
a random drop; see §3.6 step 8).
- **Drop economy:** apart from the shop and chests, pickups only come from the room-clear roll (35 % + 3 % per luck)
  and broken rocks (8 %). Enemies drop nothing. That's roughly 0.2 Approvals and 1–3 credits per floor from random
  drops, plus the guaranteed Approval from depth 2. Loose loot in combat rooms (§3.6 step 7) adds about
  1–2.5 credits, 0.3–0.8 half hearts and 0.15–0.45 Approvals per floor (floors 1–6).

**Layouts:** 30 in total (27 tagged `normal`, plus special ones; `empty` carries both tags). `validateLayout(l)`
checks the format and that all 4 door tiles are clear and mutually reachable. `{strict: true}` adds three house rules:
every floor tile must be reachable, there must be no spikes next to doors, and special rooms need a clear centre.

**Text** (`B.TEXT`): `FLOORS` (10), `EPITAPHS` (25), `TAGLINES`, `SHOP_LINES`, `CLEAR_QUIPS`, `DENIED`, `PICKUP`, `EVENTS`, `RANKS`,
plus per-floor extras `THEME_QUIPS` / `THEME_EPITAPHS` keyed by theme `key` (currently only `branches`).

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
1. In `src/data/enemies.js`, add a definition with `behavior`, `minFloor`, `weight`, `cost` and `color`.
2. If needed, add a new behaviour in `src/entities/enemy.js` (`B.BEHAVIORS.name = {update(e, dt, game) {…}}`). Use
   the `B.AI` helpers, and **telegraph** every attack (wind-up glow, `!`, target ring).
3. Add the sprite as `enemy_<id>` in `sprites-enemies.js`, with 2 frames.
4. Check fairness: enemy shots at 165–260 px/s (the player moves at 240), contact damage of 1 half heart (2 for charges/bosses).

**Add a boss:** add a `B.BOSSES.id` entry with `name`, `subtitle` (shown on the intro card), `hp`, `r`, `behavior`, `sprite`
and `color`, plus a `B.BOSS_BEHAVIORS.id` entry in `boss.js`. Give it ≥ 2 attacks and a phase change at a HP threshold
(emit `bossPhase`, show a `game.banner`), and place it with `BossHelpers.placeAwayFromPlayer`.

**Add a layout:** use `L(id, ['normal'], weight, [7 rows × 13 chars], bias?)` in `layouts.js`. The characters are
`. r b p s e` (`e` marks a preferred spawn point). It must pass `validateLayout(l, {strict: true})`.

**Add a sound:** add an entry to `SOUNDS` in `audio.js` built from `voice({...})` / `noise({...})` / `arp(...)`, then
hook it with `on('event', () => p('name'))`. Rate-limit it in `RATE` if it can fire every frame.

**Add a floor:** add an entry at the same position in `B.TEXT.FLOORS` (name + subtitle) and `B.FLOOR_THEMES` (colours,
`pattern`, `decor`, optional `wallDecor`/`ambient`/`gen`, music), keeping the two lists the same length (the smoke test
checks). Depths cycle through the list modulo its length, with roman-numeral suffixes on later passes. New `pattern` /
`decor` / `wallDecor` / `ambient` values need a case in `renderer.js`. Inserting in the middle shifts the names of all
later floors (Forgotten Branches went in at position 3 on 2026-11-01); enemy and boss unlocks follow depth, not names.

**Add a new source file:** add the `<script>` tag in `index.html` at the right place in the load order (§3.1) and
wrap the file in the IIFE pattern.

**Change a contract** (`game` API, entity fields, event names): grep every use (`grep -rn "eventName" src`). Several
modules rely on these implicitly through the bus.

---

## 6. Known issues and gotchas

- **Boss intro only on door entry.** `pendingBossIntro` is set in `enterRoom` and consumed at the end of a room
  transition, so debug teleports skip the VS card.
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
- A human balance pass on boss HP and spawn budgets.
- Ideas from the 2026-11-01 brainstorm, in planned order:
  - **Floor-based enemy variety (do this first; the themed enemies below need it).** Today spawns depend only on
    depth (`minFloor`, `weight`, `weightPerFloor` in `enemies.js`; `rollRoomEnemies(rng, depth)`), so every floor of
    the same depth looks alike and nothing can be tied to a theme. Suggested design:
    - An optional per-enemy field such as `themes: { branches: 3, dephell: 0.5 }` that multiplies the weight on
      floors with that theme `key` (`B.themeFor(depth).key`). A multiplier of 0 excludes an enemy there.
    - An optional `themeOnly: ['branches']` for enemies that should never appear elsewhere (`minFloor` still applies).
    - Pass the theme key into `rollRoomEnemies` (it is called from `room.build` with the floor RNG). Changing the
      weights changes enemy lists for existing seeds; that's acceptable, but say so in the commit.
    - Keep the room budget (`cost`) logic unchanged, and extend the smoke test: themed enemies only on their floors,
      and every floor can still fill a room.
    - Optionally the same for bosses (e.g. a future Octopus Merge preferred on Forgotten Branches) via the same field
      in `bosses.js` and `B.rollBossVaried`.
  - **Forgotten Branches enemies (themed via the mechanism above, ideally `themeOnly: ['branches']` or a high
    multiplier there).** Shared visual language, so they read as one family on that floor:
    - **Look:** organic and woody, like the floor and its bush props. Bark browns (`#5a3d22`, `#a3602c`), leaf greens
      (`#4f7a30`, `#6f9a3c`, `#86ad4a`) and the dark green outline `#16240f` (`prop_bush`), not the usual black.
      Scale 4, 2 frames, 10–14 px art like the other enemies. Git puns go into the shapes (commit dots, branch
      lines, tags), not into on-sprite text (too small to read).
    - **Contrast:** the floor is green, so nothing dangerous may be green. Enemy shots and telegraphs use warm
      colours (amber `#ffcf4d`, coral `#ff7a5c`, cherry `#d64545`); green is only for harmless or friendly things.
    - **Sound and effects:** leafy rustles and wood knocks instead of metal clicks. Small falling-leaf particles on
      hits fit (`FX.burst` with leaf colours via a bus listener; effects only listen).
    - **Detached HEAD** (pair: head about 6 HP, body about 12 HP, floor 3+):
      - *Look:* two parts joined by a thin **dashed tether** (the detached pointer, drawn in `drawUnder` like the
        Graphics Glitch's landing preview). The **head** is a floating wooden tag in the shape of an arrow label,
        with one big eye; it bobs. The **body** is a stubby walking stump on twig legs with an empty glowing socket
        on top, where the head belongs.
      - *Behaviour:* the body walks slowly toward the player (`pathToward`); the head orbits it at about 80–140 px
        and fires one slow aimed amber shot every ~2.2 s. Warning: its eye glows for 0.4 s first.
        Kill the body first and the tether snaps ("HEAD detached!"): the head panics, flies erratically
        and shoots more often, but has little HP. Kill the head first and the body wanders aimlessly
        ("where is my HEAD?") and only does contact damage.
      - *Code:* two enemies linked via `state.partner` (not `proxy`: they have separate HP); spawn the second in
        the first one's `init`, as the Rogue Agent Swarm does with `game.spawnEnemy`. Count it as one spawn
        (`pack`-like) in the room budget.
    - **Stale Branch** (about 12 HP, floor 3+):
      - *Look:* a twig creature carrying a few leaves. As it ages, the leaves go **green → yellow → brown → bare**
        (switch `e.spriteName` between 3–4 variants), and dead leaves drop off as particles. A small counter floats
        above it, e.g. "-12", for "commits behind" (`AI.say` or a `drawOver` with the pixel font), going up every
        2–3 s.
      - *Behaviour:* starts slow (~60 px/s) and gets faster with age, up to ~150 px/s after 20 s. Once bare, it
        shudders for 0.5 s (warning), then lunges along a line at the player every few seconds. Killing it early
        is easy, waiting is punished.
    - **Cherry-Pick** (pair via `pack: 2`, about 7 HP each, floor 3+):
      - *Look:* two cherries joined by a green stem that is drawn as a stretchy line between them (max ~140 px).
        They hop in small arcs: a squash before the jump, a separate shadow, a squash on landing.
      - *Behaviour:* they hop around the player. Hitting one makes the **other** angry for 3 s: darker red,
        narrowed eyes, faster hops straight at you, and it spits a pit (one slow aimed shot, warning: puffed
        cheeks). If one dies, the other stays angry for good.
    - **Orphan Commit** (about 6 HP, contact damage 0, `ignoreForClear`, rare bonus spawn like the Hallucination):
      - *Look:* a small white commit dot with a leaf hat and big sad eyes, trailing a faint dashed line (its lost
        history). A soft sparkle now and then hints that it's a reward, not a threat.
      - *Behaviour:* never attacks and flees from the player (reverse flow field, prefers corners). Catching it
        drops 2–3 credits. If you don't within ~12 s, it gets garbage-collected: fades out with a puff.
      - *Note:* `ignoreForClear` so it doesn't hold the doors shut; same care as the Hallucination when it outlives
        the room clear.
  - **Stash rooms** (`git stash`): a small optional room whose doorway is closed by a **hedge wall** of bush props
    (`prop_bush`, a whole row) instead of a door, which you shoot open. Inside: a cosy storage look (a few crates,
    one labelled with a little tag), 2–3 pickups and sometimes a chest. Minimap icon: a small box. Mostly on
    Forgotten Branches, rarely elsewhere. Note that props deliberately never block doors today (`assignProps`), so
    this needs its own placement code, and the walkability check must treat the stash entrance as a door.
  - **Bosses:**
    - **Octopus Merge** (Forgotten Branches, via the boss side of the theme mechanism):
      - *Look:* a **tangle of roots and branches** around a big knot in the middle (the merge commit). 6–8 woody
        tentacles each end in a commit dot. It must read as plant matter, **not** as a cartoon octopus: no face
        with cat ears or anything resembling a well-known code-hosting company's octopus-cat mascot. Use the
        floor's bark and leaf palette and the dark green outline.
      - *Fight:* tentacles sweep and slam (each with a target line first), and the commit dots at their tips fire
        amber shots. Every ~12 % of HP lost, one tentacle **merges** into the body: it retracts with a "Merged!"
        pop and the remaining ones get faster. Phase 2 at 50 %: "CONFLICT" — red `<<<<<<<` and `>>>>>>>` markers
        appear around the room and the knot spits shots in two opposing streams.
      - *Code:* the Infinite Loop already shows segments as separate enemies with `proxy` to a shared head;
        tentacles can follow that pattern.
    - **"Human in the Loop"** (meta joke): still just a name. Needs a concept first.
