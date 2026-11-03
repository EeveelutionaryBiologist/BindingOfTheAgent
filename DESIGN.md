# The Binding of the Agent — Design Doc

> *A discount roguelite about a small, helpful agent descending into ever-deeper codebases.
> Shoot tokens at bugs. Pick up items of questionable value. Die to a Merge Conflict. Repeat.*

Status: **v1 implemented** · Scope: team distraction, not a product · Audience: the dev team (and whoever has to review this)

---

## 1. Pitch & pillars

You are **Claude**, a small coral-coloured agent. Each floor is a randomly generated grid of rooms,
Binding-of-Isaac style: clear a room and the doors open, find the item room, find the boss, drop through
the trapdoor, go deeper. There is no ending. There is only *the next floor*.

| Pillar | What it means in practice |
|---|---|
| **Zero install** | Double-click `index.html`. No build, no npm, no server, no network, no admin rights. |
| **Short runs, instant retry** | A run lasts 3–15 minutes. Death → `R` → new run in under a second. |
| **Snark density** | Every item, enemy, boss, floor and death has a line. Writing is a first-class feature. |
| **Discount, not cheap** | Few features, but tight controls and juicy feedback (hit flash, knockback, shake, particles, blips). |

### Non-goals
Meta-progression, unlocks, save games, story, an actual ending, multiplayer, touch controls, curated
pixel art, and anything taken from the original game (no names, sprites, items, sounds). We clone
*mechanics* (which are fair game), not content.

---

## 2. Tech stack — "as much as needed, not too much overhead"

| Choice | Why |
|---|---|
| **Vanilla JavaScript (ES2020)** | Every teammate has a browser. No toolchain to install, no `node_modules` the size of a small moon. |
| **HTML5 Canvas 2D** | Plenty for a few hundred sprites at 60 fps. |
| **Classic `<script>` tags, one global namespace `BOTA`** | ES modules are blocked from `file://` in Chromium (CORS), so modules would force a local web server. Classic scripts loaded in a fixed order keep "double-click to play" working. |
| **Procedural pixel art from ASCII sprite maps** | Sprites are strings in JS files → no asset pipeline, no licensing questions, diff-able in code review. |
| **Web Audio API, synthesized SFX** | Oscillators + noise. No audio files. |
| **No dependencies at all** | Nothing to audit, nothing to update, nothing that phones home. |

Considered and rejected: *Python + pygame* (needs Python + pip install on every machine, awkward on locked-down
Windows boxes), *Electron/Tauri* (hundreds of MB for a joke), *Phaser/Pixi* (fine engines, but a CDN or a vendored
1 MB file for features we don't need).

---

## 3. Controls

| Action | Keyboard | (Stretch) Gamepad |
|---|---|---|
| Move | `W A S D` | Left stick |
| Shoot (4-directional, last pressed wins) | `↑ ↓ ← →` | Right stick / face buttons |
| Force Push (bomb) | `E` | LB |
| Use active item | `Space` | RB |
| Pause / item list | `Esc` or `P` | Start |
| Restart run | `R` on death screen, hold `R` 1 s in-game | Select |
| Mute | `M` | – |
| Debug overlay (dev only) | `F2` or `?debug` in URL | – |

---

## 4. Core loop & game states

```
 title ──Enter──▶ floorCard ──▶ play ◀──▶ pause
                     ▲            │ ├──door──▶ roomTransition ──▶ play
                     │            │ ├──boss room──▶ bossIntro ──▶ play
                     └─trapdoor───┘ └──hp = 0──▶ dead ──R──▶ floorCard (new run)
```

* **play**: fixed-timestep update at 60 Hz (accumulator), render every animation frame.
* Entering an uncleared room with enemies **closes the doors**; killing the last enemy opens them,
  plays a chime, may drop a reward (35 % + luck) and charges the active item by 1.
* Room transitions are a quick slide (~0.25 s); the player appears at the opposite door.
* Killing the boss spawns a **trapdoor**, a boss-pool **item pedestal** and a heart.

---

## 5. Player

Base stats (all items modify these):

| Stat | Base | Meaning |
|---|---|---|
| `health` / `maxHealth` | 6 / 6 | In **half hearts** (3 hearts). Max 24 (12 hearts). |
| `guardrails` | 0 | Blue "Guardrail" half hearts — absorb damage first, not refillable by red hearts. |
| `speed` | 1.0 | Multiplier on 240 px/s. Clamped 0.4–2.0. |
| `damage` | 3.5 | Per shot. |
| `fireDelay` | 0.38 s | Seconds between shots. Min 0.08. |
| `shotSpeed` | 1.0 | Multiplier on 480 px/s. |
| `range` | 420 px | Distance a shot travels before it drops. |
| `shotSize` | 1.0 | Multiplier on shot radius (9 px). |
| `luck` | 0 | Drop chances. |

* Movement uses acceleration/friction so it feels slidey-but-precise; shots inherit 30 % of player velocity.
* Getting hit: lose half a heart (bosses/charges: a full heart), 1 s invulnerability with blinking, screen shake.
* Resources: **Credits** (coins), **Force Pushes** (bombs, *"`git push --force` — rewrites history and rocks"*),
  **Approvals** (keys, *"LGTM"*). Max 99 each.

---

## 6. Dungeon generation

Per floor, deterministic from `hash(runSeed + depth)`:

1. Grid of 9 × 9 map cells, start room in the centre.
2. Target room count: `min(20, floor(3.3 · depth) + 6 + rand(0..2))`.
3. Breadth-first random expansion (BoI-style): a neighbour cell becomes a room only if it is empty, has
   at most one already-filled neighbour (keeps it tree-ish, avoids blobs), and a coin flip agrees.
4. Retry until the target count is met **and** there are ≥ 3 dead ends.
5. Special rooms are assigned to dead ends: **Boss** (farthest from start by BFS distance), **Treasure**, **Shop**.
6. **Secret room**: an empty cell adjacent to ≥ 2 rooms but not to the boss room. Its doors are hidden walls
   until a Force Push explodes next to them.
7. From depth 2 onwards, Treasure and Shop doors are **locked** (cost one Approval).
8. From depth 2 onwards, one combat room per floor is picked to drop a **guaranteed Approval** when cleared
   (on top of the normal clear reward), so at least one locked door can always be opened.

All rooms are single-size (13 × 7 interior tiles). No L-shapes, no 2×2 rooms — discount, remember.

### Rooms
The screen is exactly one room: **15 × 9 tiles of 64 px** (outer ring = walls) = 960 × 576 px, plus a 64 px HUD
strip on top → canvas **960 × 640**, scaled to the window with integer-ish scaling and `image-rendering: pixelated`.
Doors sit in the middle of each wall.

Obstacle layouts are 13 × 7 ASCII templates:

```
.............   .  floor          r  rock (Force Push destroys it, may drop loot)
..r.......r..   b  block (indestructible)
.............   p  pit (blocks walkers, not flyers)
......e......   s  spikes (hurt the player)
.............   e  preferred enemy spawn point
..r.......r..
.............
```

Every layout is validated: all four door tiles and the centre must be mutually reachable for a walker.

---

## 7. Enemies

Data-driven: each enemy is a definition (stats, sprite, behaviour id + params) plus a reusable behaviour
function. Difficulty scales enemy HP by `1 + 0.15 · (depth − 1)` and unlocks enemies by `minFloor`.

| Enemy | Behaviour | Notes | Flavour |
|---|---|---|---|
| **Bug** | wander | slow, bumbling | *"It's not a bug, it's a feature. A feature with mandibles."* |
| **Null Pointer** | fly-chase | fast, flying, fragile | *"Points at nothing. Charges at you anyway."* |
| **Memory Leak** | chase + split | splits into 2 Leaklets on death | *"Gets bigger the longer you ignore it."* |
| **Flaky Test** | blink | teleports, fires one aimed shot, invulnerable while faded | *"Passes on my machine."* |
| **Merge Conflict** | charge | dashes when aligned with you on an axis | *"<<<<<<< HEAD"* |
| **Jira Ticket** | turret | stationary, 4-way bursts alternating + / × | *"Priority: Blocker. Assignee: you."* |
| **Deprecation Warning** | orbit | circles you at distance, shoots occasionally | *"Will be removed in a future release. Not this one."* |
| **Spaghetti Code** | shooter | wanders, fires 3-way spreads | *"Nobody knows where it starts. Or ends."* |
| **Zombie Process** | chase + revive | gets back up once at half HP | *"`kill -9` recommended."* |
| **Scope Creep** | grow | slowly grows in size and HP | *"Just one more small feature."* |
| **Hallucination** | mimic | looks like a Credit, Half Heart or Approval until you get close (real ones lie around too) | *"Looked real. Was, in fact, not real."* |
| **Graphics Glitch** | glitch | jumps 1–3 tiles at a time; touching you scrambles part of the HUD for 7 s | *"Is it supposed to look like this...?"* |
| **Race Condition** | zigzag | always spawns in pairs, erratic | *"Sometimes it hits first. Sometimes you do. Sometimes both."* |

Contact damage: half a heart. Enemy shots: half a heart.

## 8. Bosses

One per floor, random from the pool (never the previous floor's boss again, and bosses already met this run are
less likely), HP scaled by `1 + 0.3 · (depth − 1)`. BoI-style intro card:
**CLAUDE vs THE MONOLITH**, with a subtitle.

| Boss | Pattern | Subtitle |
|---|---|---|
| **The Monolith** | Lumbers toward you; stomps release a 12-shot ring. At 50 % HP it "decomposes into microservices" (spawns minions) and speeds up. | *"Single point of failure since 1998."* |
| **The Stakeholder** | Floats around firing rotating "requirement" spirals and aimed "urgent request" fans. Below 40 % it *changes the requirements*: patterns swap and speed up. | *"Just a quick question."* |
| **Friday Deploy** (floor 4+) | A burning server rack bouncing around the room DVD-logo style; every wall hit vents a burst of fire shots; periodically "rolls back" to the centre. | *"What could go wrong at 16:55?"* |
| **The Infinite Loop** | A segmented worm circling the room; the head hunts you, body segments shoot outward. Shared HP pool. | *"while (true) { suffer(); }"* |
| **Rogue Agent Swarm** (floor 2+) | Four rogue copies of the player in formation with one shared health bar. Each one that falls says a parting line, heals the rest a little and makes them faster (single shots, then fans, then rings); the last one dashes and spirals. | *"Turns out the sandbox was not safe after all..."* |
| **The Antagonistic Reviewer** (floor 4+) | A floating face with mirrored glasses. Mouth laser (tracking line, freeze, beam), rows of "nitpick" bullets with one gap, and "REJECTED" stamps on your position. At 50 % it turns red: sweeping laser, double rows, triple stamps. | *"This does, in fact, NOT look good to me."* |

---

## 9. Items

Items are data definitions with stat deltas, flags and optional hooks. Picking one up shows a BoI-style banner:
big **name**, small *tagline*. The pause screen lists collected items with their full (snarky) description.

### Passive items (initial set)

| Item | Tagline | Effect | Description |
|---|---|---|---|
| Cold Brew | Speed up | speed +0.25 | Caffeine: the original agentic framework. |
| Mechanical Keyboard | Fire rate up | fireDelay −0.06 | Clack clack clack. Your open-plan office has filed a complaint. |
| Stack Overflow Printout | Damage up | damage +1 | Marked as duplicate. Worked anyway. |
| Extended Context Window | Range up | range +150, shot speed −0.1 | Two million tokens of things you'll forget by the next room. |
| Prompt Caching | Fire rate way up | fireDelay ×0.75 | Same tokens, 90 % cheaper. You've basically printed money. |
| Temperature 1.5 | Damage up, aim… creative | damage +1.5, wobbly shots | More creative. Less correct. Like your commit messages. |
| Few-Shot Examples | Triple shot | 3-way spread, fireDelay ×1.35 | Three examples. Same mistake, three times. |
| Regex | Now you have two problems | double parallel shot | You solved it with a regex. Now you have two shots and two problems. |
| Chain of Thought | Piercing shots | piercing | Let's think step by step. Through the enemy. And the one behind it. |
| Confident Hallucination | Homing shots | homing | The target is wherever I say it is. |
| Rubber Duck | A friend who listens | familiar that shoots | Never says anything. Still the best senior engineer on the team. |
| Unit Tests | Orbital protection | 2 orbitals block shots | They test nothing, but they're always around you. Coverage: 100 %. |
| Linter | Bouncing shots | shots bounce off walls | Your shots bounce now. Also: 4,812 warnings. |
| Dark Mode | Spectral shots | shots pass through obstacles | Easier on the eyes. Harder on the enemies. |
| The Cloud | Flight | fly over pits & rocks | It's just someone else's computer. But it floats. |
| RLHF | HP up | +1 heart container, full heal | Fine-tuned to be more likable. Mostly by people paid per click. |
| Constitutional Guardrails | Guardrails up | +2 guardrail hearts | Principles: has them, mentions them, often. |
| Technical Debt | Damage way up… for now | damage ×1.6, −1 heart container | Ship now, pay later. With interest. Compounding. |
| Monorepo | Shot size up | shotSize +0.6, damage +0.5, shot speed −0.2 | Everything in one giant blob. What could go wrong. |
| Microservices | Shots split on impact | split | You had one problem. Now it's distributed across four services. |
| Kubernetes | All stats up? Probably? | small bump to everything | Nobody knows what it does. Everyone agrees you need it. |
| Blockchain | Revolutionary | nothing at all | Disruptive. Decentralised. Does absolutely nothing. Market cap: $4B. |
| Off-by-One Error | Damage up by 1. Or 0. Or 2. | damage + rand(0..2) | We counted from zero. Or did we. |
| YAML Config | Stats shuffled | every stat randomly ± | Your stats are now whitespace-sensitive. |
| Retry with Backoff | Extra life | revive once, speed −0.1 | Failed? Try again. Slower. |
| Code Review | See enemy HP | HP bars, luck +1 | Now you can see exactly how bad things are. |
| Daily Standup | Freeze on entry | enemies frozen 2 s on room entry | Everyone stops what they're doing for "15 minutes". |
| LGTM | +2 Approvals | approvals +2 | Didn't read it. Approved it. Twice. |
| git blame | Damage up when desperate | +2 damage at ≤ 1 heart | It was never your fault. The logs prove it. |
| Vibe Coding | Damage: vibes | each shot random size & damage ×0.5–2 | Accept all. Don't read the diff. Feel the vibes. |
| Tab Completion | Fire rate up, range down | fireDelay −0.08, range −80 | Accepts the first suggestion. Every time. Without reading. |
| Max Effort | Thinking harder | damage +1, speed −0.1 | Reasoning effort: max. Everything takes longer, but hits harder. |

### Active items (`Space`, recharge 1 per cleared room)

| Item | Charge | Effect | Description |
|---|---|---|---|
| Regenerate Response | 2 | Rerolls item pedestals in the room | Same prompt. Different answer. Same disappointment. |
| Stop Generating | 3 | Freezes all enemies for 4 s | ■ Stop. Everyone stop. Thank you. |
| `rm -rf node_modules` | 4 | 25 damage to every enemy in the room | Freed 4.2 GB. Feels incredible. Nothing builds anymore. |
| /compact | 6 | Heals 2 hearts | Forget everything except the important bits. You feel lighter. |

### Pickups
Half/full red heart, Guardrail heart, Credit (1), Credit stack (5), Force Push (1/2), Approval, Chest (random
loot; locked chests cost an Approval). **Shop** prices: pickups 3–5 credits, items 15 credits.

---

## 10. Presentation

### Art direction
Chunky pixel art from ASCII sprite maps (≈ 16 × 16 px, scaled ×4), flat palette, a soft drop shadow under every
entity. The **Claude avatar** is an original design: a round coral/terracotta blob with two dot eyes and a little
sparkle antenna that bobs when walking — friendly, not a logo. Each floor has its own palette
(floor checker, wall, door tint).

### Juice checklist
White hit flash (0.08 s) · knockback · screen shake on hurt/explosions/stomps · death particle bursts in the enemy's
colour · shot splash on walls · door slam · item-get pose with the item held overhead · room-clear chime.

### HUD (64 px strip on top)
Active item + charge bar · hearts (2 rows if needed, guardrails in blue after red) · credits / force pushes /
approvals · floor name · minimap overlay in the room's top-right corner (visited rooms filled, adjacent rooms
outlined, icons for boss/treasure/shop once seen) · boss HP bar at the bottom during boss fights.

```
┌────────────────────────────────────────────────────────────────────┐
│ [⟳]▮▮▯   ♥♥♥♡◆     ¢ 07   ✦ 02   ✓ 01        B2 · LEGACY CODEBASE │ ← HUD strip
├─────────────────────────────── ▢ ──────────────────────────────────┤
│▓                                                        ┌─┬─┬─┐  ▓│
│▓    ██                 ¤ Bug                            ├─■─┼─┤  ▓│ ← minimap
│▓    ██                                                  └─┴─┴─┘  ▓│
│▢                          (•ᴗ•)✶   ∘  ∘  →                       ▢│ ← side doors
│▓              ◇ Jira Ticket                       ██            ▓│
│▓                                                  ██            ▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▢ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└────────────────────────────────────────────────────────────────────┘
```

### Screens
* **Title**: logo text, random tagline (*"Now with 40 % fewer bugs than your backlog."*), controls.
* **Floor card**: *"Floor 2 — Legacy Codebase"* + subtitle (*"Written by someone who left in 2009."*).
* **Boss intro**: split-screen **CLAUDE vs BOSS** card, 1.5 s.
* **Pause**: collected items with descriptions, current stats, run seed.
* **Death**: random epitaph, *"Killed by: Merge Conflict"*, floor reached, items, seed, `R` to retry.

### Floors (names cycle with roman numerals after the last one)
1. **The Backlog** — *Where tickets go to die.*
2. **Legacy Codebase** — *Written by someone who left in 2009.*
3. **Forgotten Branches** — *It is probably for the best that these never got merged.* (added 2026-11-01: forest look
   with moss, leaves, twigs, ivy and fireflies; roots drawn as a little `git log --graph`; birdsong in the music;
   more branching maps with at least 7 dead ends; its own room-clear quips and epitaphs)
4. **Dependency Hell** — *node_modules now has its own gravitational field.*
5. **Production** — *Don't touch anything. Especially on a Friday.*
6. **The Training Data** — *It's mostly forum arguments.*
7. **The Latent Space** — *Here be embeddings.*
8. **Undefined Behavior** — *Anything can happen. Mostly bad things.*
9. **/dev/null** — *Everything you send here is gone. Including you.*
10. **The Context Limit** — *You've been here before. You don't remember.*

### Death epitaphs (sample)
*"Claude was unable to complete this request."* · *"Context window exceeded."* · *"Error 529: Overloaded."* ·
*"I apologize for the confusion. You have died."* · *"Task failed successfully."* ·
*"This conversation has reached its maximum length."*

### Audio
~12 synthesized SFX (shoot, hit, enemy death, hurt, pickup, item fanfare, door open/close, explosion, room clear,
purchase, error buzz for locked doors). `M` mutes; the setting is remembered. Music is a stretch goal.

---

## 11. Architecture

```
index.html                 canvas + <script> tags in load order (+ CSP, see §12)
src/core/        namespace.js  constants, BOTA namespace, event bus
                 rng.js        seeded RNG (mulberry32) + string hash
                 math.js       vectors, clamp/lerp, collision helpers
                 input.js      keyboard state with pressed-this-frame edges
                 audio.js      WebAudio SFX, subscribes to the event bus
                 sprites.js    sprite registry: defineSprite / drawSprite, bake to offscreen canvases
src/data/        palette.js    colours + floor themes
                 sprites-*.js  ASCII sprite maps (core, enemies, items)
                 items.js      item definitions
                 enemies.js    enemy definitions + spawn pools
                 bosses.js     boss definitions
                 layouts.js    room obstacle templates
                 text.js       floor names, epitaphs, taglines, shop lines
src/world/       dungeon.js    floor map generation
                 room.js       Room: tiles, doors, entity lists, clear state, collision queries
src/entities/    entity.js     base Entity (circle collider, tile collision, hit flash, knockback)
                 player.js     Player: input → movement/shooting, stats, items, hooks
                 projectile.js shots for both teams (piercing/homing/spectral/bounce/split/wobble)
                 enemy.js      Enemy + behaviour library
                 boss.js       boss behaviours
                 pickup.js     pickups, pedestals, shop slots, chests, trapdoor
                 familiar.js   familiars & orbitals
                 effects.js    particles, explosions, floating text
src/render/      renderer.js   room, obstacles, entities (y-sorted), effects
                 hud.js        HUD strip, minimap, banners, boss bar
                 screens.js    title, floor card, boss intro, pause, death
src/game.js      state machine, fixed-timestep loop, room/floor transitions, world API
src/main.js      bootstrap
```

### Key contracts (so parallel work plugs together)

**Event bus** — `BOTA.bus.on(evt, fn)` / `BOTA.bus.emit(evt, payload)`. Core emits: `shoot`, `enemyHit`,
`enemyDeath`, `playerHurt`, `playerDeath`, `pickup`, `itemGet`, `roomEnter`, `roomClear`, `doorsOpen`,
`doorsClose`, `explosion`, `bossSpawn`, `bossDeath`, `floorEnter`, `purchase`, `denied`. Audio and effects
only listen — they never need to be called directly.

**World API** (the `game` object passed to behaviours and hooks):
`game.player`, `game.room`, `game.floor`, `game.rng`, `game.spawnProjectile(opts)`,
`game.spawnEnemy(id, x, y)`, `game.spawnPickup(type, x, y, opts)`, `game.explode(x, y, radius, dmg)`,
`game.shake(intensity, seconds)`, `game.banner(title, subtitle)`, `game.freezeEnemies(seconds)`.

**Enemy definition** —
```js
BOTA.ENEMIES.bug = { name: 'Bug', hp: 8, r: 18, speed: 70, contactDamage: 1, flying: false,
                     behavior: 'wander', params: {}, sprite: 'enemy_bug', minFloor: 1, weight: 10,
                     desc: "It's not a bug, it's a feature. A feature with mandibles." };
BOTA.BEHAVIORS.wander = { init(e, game) {}, update(e, dt, game) {}, onDeath(e, game) {} };
```

**Item definition** —
```js
BOTA.ITEMS.cold_brew = {
  name: 'Cold Brew', tagline: 'Speed up', desc: 'Caffeine: the original agentic framework.',
  pools: ['treasure', 'shop'], sprite: 'item_cold_brew',
  add:   { speed: 0.25 },            // additive stat deltas
  mult:  { fireDelay: 0.75 },        // multiplicative, applied after add
  flags: { piercing: true },         // booleans OR-ed, numbers summed/maxed
  onPickup(player, game) {},         // one-shot (heal, give resources, …)
  // optional hooks: onShoot, onHitEnemy, onRoomEnter, onRoomClear, onHurt, onLethal → true = survive, update
  // active items: active: true, maxCharge: 3, use(player, game) → true if consumed
};
```

**Sprites** — `BOTA.defineSprite(name, { palette: { o: '#d97757', k: '#1a1a1a' }, rows: ['..oo..', …], scale: 4 })`,
`BOTA.drawSprite(ctx, name, x, y, { flash, alpha, flipX })` (centred). Unknown sprite names render a magenta
placeholder instead of crashing, so content can land before art does.

**Debug hooks** (`F2` / `?debug`): god mode, give item, spawn enemy/boss, kill all, next floor, reveal map.
Also exposed as `BOTA.debug.*` for automated tests.

---

## 12. Security & compliance notes

The game is offline by design. Security-relevant points, and how they're handled:

| Area | Handling |
|---|---|
| **Network** | None. A `Content-Security-Policy` meta tag sets `connect-src 'none'` (no fetch/XHR/WebSocket), `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. No CDNs, no web fonts, no telemetry. |
| **Code injection** | No `eval`, `new Function`, `innerHTML`, or string-based `setTimeout`. Everything renders to canvas. |
| **Input validation** | URL parameters (`?seed=`, `?debug`) are read via `URLSearchParams`; the seed is restricted to `[A-Za-z0-9-]{1,32}`, anything else is ignored. |
| **Local storage** | Only non-sensitive settings (mute, best floor, run count) under one key; reads are wrapped in `try/catch` and schema-checked, so a corrupted or tampered entry falls back to defaults. |
| **Data** | No personal data, no accounts, no secrets anywhere in the code or assets. |
| **Privileges** | Running needs nothing but a browser. No installer, no admin/sudo, no background processes. |
| **Debug mode** | Cheats only; it cannot reach anything outside the page. |

---

## 13. Build plan

| Milestone | Owner | Content |
|---|---|---|
| **M0** Design doc | lead | this document |
| **M1** Playable skeleton | lead | loop, input, RNG, dungeon gen, rooms & doors, player move/shoot, placeholder enemy, renderer, HUD stub, debug hooks — *defines the contracts above in real code* |
| **M2a** Items & economy | agent A | `items.js`, item hooks, `pickup.js`, shop, chests, pedestals, `familiar.js`, item sprites |
| **M2b** Enemies & bosses | agent B | `enemies.js`, behaviours, `bosses.js`, `boss.js`, `layouts.js`, spawn pools, enemy/boss sprites |
| **M2c** Presentation | agent C | core sprites (player, tiles, doors), `audio.js`, `effects.js`, `hud.js`, `screens.js`, `text.js`, palettes |
| **M3** Integration & QA | lead + QA agent | headless-browser smoke tests: no console errors, screenshots of every state, 1,000-seed generation fuzz, layout reachability check, boss fights via debug hooks |
| **M4** Delivery | lead | files in the shared folder, short README |

Agents own disjoint files; shared files (`game.js`, `player.js`, `room.js`, `renderer.js`) only get small,
clearly marked hook additions.

### Implementation status (v1)
All milestones done. What shipped, compared with this doc:
- **Items:** 45 (40 passive, 5 active). There are 9 extras beyond §9, e.g. Ctrl+C Ctrl+V, On-Call Pager,
  Garbage Collector, Feature Flag, Ctrl+Z (active), and the Extra GPU / Off-Brand GPU pair (added 2026-11-02). Locked chests cost an Approval.
- **Enemies and bosses:** 22 spawnable enemies plus 7 minions (4 of the enemies are the Forgotten Branches family and 3 the Sandbox Borders family, added 2026-11-02/03; the Dust Daemon bends your shots, and the Dry Run on The Training Data rehearses every move as a ghost before doing it for real, added 2026-11-03). Each of the 8 bosses has phases and telegraphed attacks; the Octopus Merge (2026-11-02) is the floor boss of Forgotten Branches, and the Nested Infinite Loop (2026-11-02) replaces the Infinite Loop from floor 8.
- **Stack Trace (2026-11-03):** first Legacy Codebase enemy, a paper-tailed scorpion that stings along a telegraphed line (see AGENTS.md §4).
- **Layouts:** 30 (27 combat, the rest for special rooms), all validated.
- **Presentation:**
  - 11 floor themes (Sandbox Borders, a desert with cacti and border fences, added 2026-11-02) and an animated avatar with 4 directions plus hurt and item poses.
  - 51 synthesized SFX and a procedural chiptune loop per floor, with a boss variant.
  - Pixel-font HUD and screens, including the "post-mortem" death report.
- **QA:** headless-browser tests found zero console errors and held 60 fps with all items, 30 enemies and about 150 bullets.
  They also covered 300+ fuzzed floors, every enemy and boss, and multi-floor runs.
- **Known gaps:**
  - Balance hasn't been playtested by humans.
  - Once the item pools run dry, items can repeat.
  - Gamepad support and seed entry on the title screen are still stretch goals.
- **Balance pass (2026-10-31), after player reports:**
  - The Stakeholder takes longer breaks between attacks (1.5 s / 1.1 s by phase instead of 1.1 / 0.8),
    waits longer between fan volleys, and its phase-1 spiral is a bit sparser. On floor 1 that's about
    15 % fewer shots per second in both phases. The breaks shrink with depth, back to roughly the old pace.
  - Guaranteed Approval per floor from depth 2 (see §6, step 8). Before this, 55–80 % of floors had no
    Approval drop at all.
- **Floor themes for spawns (2026-11-02):** enemies and bosses can be weighted per floor theme (`themes`) or limited
  to certain themes (`themeOnly`), so a floor like Forgotten Branches can get its own enemy family. Details in
  AGENTS.md §4. First users: Stale Branch, Detached HEAD, Cherry-Pick and Orphan Commit, which only appear on Forgotten Branches.
- **Floor rosters, cacophony and side quests (2026-11-03):** every generic enemy has home floors (`home`); elsewhere it
  spawns at a fifth of its odds, so floors 1–7 each have their own crowd (Zombie Process and Deprecation Warning now
  start on floor 2, for Legacy Codebase). From floor 8 the floor identity fades step by step until everything mixes
  on floor 16, and the floor families and the Octopus Merge turn up anywhere. From floor 8, 1–2 combat rooms per floor
  are side quests: Monolith, Stakeholder, Infinite Loop or Rogue Agent Swarm at half the floor-boss HP, without intro or
  trapdoor. Details in AGENTS.md §3.6 and §4.
- **Dependency Hell family (2026-11-03):** the Honeypot (a static jar whose funnel pulls you toward its jaws, then
  bites) and the Rolling Release (a bundle of packages that bounces faster after every bump until a "Breaking Change"
  leaves it unpacked and vulnerable); see AGENTS.md §4.

## 14. Stretch goals
Gamepad support · procedural chiptune loop · seed entry on the title screen · trinkets · curse rooms
("Terms of Service": pay half a heart for an item) · a daily seed for team leaderboards (local only) ·
achievements with even worse jokes.
