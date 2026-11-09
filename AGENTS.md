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
  `index.html` loads 38 classic `<script>` files in a fixed order, and everything hangs off `window.BOTA`.
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

### Title and end-of-run keys
- **Title:** `Enter` random run (or the `?seed=` seed), `S` enter a seed, `D` daily run.
- **Seed dialog:** letters, digits and hyphen, at most 32, upper-cased. `Backspace` deletes, `Ctrl+V` pastes, `Enter`
  starts, `Esc` goes back. A `?seed=` value is pre-filled.
- **Post-mortem:** `R` / `Enter` new random run, `T` same seed. **Score card:** `Enter` keep going, `R` start over, `T` same
  seed. It's `T` and not `S` on purpose: `S` is a movement key, and players are still pressing it when they die.

### Debug keys (only while debug is enabled, during play)
`G` god mode · `I` random item · `K` kill all · `N` next floor · `V` reveal map · `B` teleport to boss room ·
`T` teleport to treasure room · `H` 10 of each resource and full heal.

### Scriptable debug API (works with or without the overlay)
`BOTA.debug.god(on?)`, `.giveItem(id?)`, `.spawn(enemyId, x?, y?)`, `.spawnBoss(bossId, x?, y?)`, `.killAll()`,
`.nextFloor()`, `.reveal()`, `.gotoRoom('start'|'treasure'|'shop'|'boss'|'secret'|'terms'|'encounter')`, `.resources(n)`
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
- **Ransomware** only rolls from floor 8 (×3 on /dev/null). Its locks really stop the active item, force pushes and fire
  rate, never lock what the player doesn't have, and end with the fight or the floor; a key fragment frees the oldest lock,
  the terminal frees everything but only for credits and then costs more; flying padlocks deal no damage and can be
  shot down; windows keep their gap, never cover the terminal or fragments, push the player out, swallow shots
  (not spectral ones) and close through their 1-HP X or their timer; enough damage extends the deadline, otherwise the wipe
  waits for its telegraph, its safe columns are reachable and safe, phase 2 runs a second pass on other columns; shots
  stay at 165–260 px/s, he never jumps next to the player, and he leaves nothing behind;
- **The System Prompt** is the boss of every Context Limit floor (two cycles and floor 33) and nowhere else, while `rollBoss` still
  draws exactly once; the script never lies (the first line is always the next action, the HUD shows three, Compact sits two
  after every Restore, never two Truncates in a row); it walks at exactly `SP.walk` and can't be knocked back; in every boss
  layout each Truncate band leaves dry parts of ≥ `minDry` tiles within `reach` steps and the window holds at columns 5–9 without
  strips; a flood hurts only after its telegraph and only inside (flyers too) and slows there; Recall fires only after its full
  telegraph along the locked line (6 shots, 12 as a V); Echoes follow `bossHistory` in order without the current boss, and every
  Echo attack waits for fade-in plus telegraph and fades away; the kill log takes only scored kills without `game.rng`; tombstones
  restore the newest eligible kill first (else the roster), keep their distance, count hits, not damage, die to explosions, restore
  only after `tombRise`; restored and compacted enemies score nothing, Compact waits for its telegraph, emits no `enemyDeath` and
  heals within the phase cap; phases 2 and 3 come once each, the window never runs beside a band; the seed line shows the run's seed,
  fight whispers come from its own list; dying in the fight gives its epitaph; it dies once, leaves nothing, the floor turns calm
  (no whispers), and the next floor isn't; shots stay at 165–260 px/s;
- the **Trojan** rolls as a bonus spawn from floor 5 (at most 1 per room), disguises itself as one of the floor's prop kinds
  on a tile centre, and gives nothing away; being close, a shot (absorbed like on a real prop) or an explosion reveals
  it, the ring of 6 and its contact damage wait for the telegraph, its fan waits for the hatch, it never locks a cleared
  room, and it dies as a normal kill;
- the **Agent Swarm (/xhigh)** replaces the Rogue Agent Swarm from floor 7 (which stays a side quest); its laser waits for the
  full aim and lock, only hits in the beam and on the line, and the formation holds fire during lock and beam; subagents
  come after a target ring, depth 2 is smaller and never goes deeper, the cap of 4 holds, the last agent still lasers;
  subagents die with the swarm, score nothing, and there is one boss death;
- the Rogue Agent Swarm spawns 4 members with one health bar, ghosts before dying, heals survivors by 10 %, goes solo
  for the last member and emits exactly one boss death;
- bosses never repeat on consecutive floors (300 simulated runs plus a real floor sequence), and README.md appears on
  about 50 % of floors, only in normal rooms, and reveals every room except secret rooms;
- pipes appear in about 10 % of combat rooms after clearing (never by a door), never lead to the boss room, the
  secret room, the current room or a room without an unlocked exit (a locked treasure room or shop, until it's
  unlocked), and can't ping-pong during their cooldown;
- floor names and themes have the same length, floor 3 is Forgotten Branches, and its maps have ≥ 7 dead ends;
- floor 6 is Sandbox Borders; cacti appear only there, only where the layout had a rock, never in front of a door,
  at about the theme's `cacti` share; a cactus pricks once (then i-frames) with knockback, is solid like a rock,
  and explosions break it;
- `themes` / `themeOnly` on enemies and bosses only name existing theme keys with factors ≥ 0, every floor of two full
  theme cycles fills its rooms with allowed enemies and has an allowed boss, and temporary test entries confirm
  that exclusion (before floor 8), the lift from floor 8, that an explicit `themes: 0` is never lifted, weight factors, bonus chances and the no-repeat boss rule
  all respect the floor theme;
- floor rosters (§4): on floors 1–7 the generic enemies at home match the roster table in the test, enemies away from
  home count exactly `AWAY`, rooms still hold ≥ 3 enemies on average, and the away share stays at 5–45 %;
- the cacophony: `mixAt` is 0 before floor 8, 0.25 on 8, +0.1 per floor, 1 from 16; `themeWeight` without a depth
  is unchanged; every family member (incl. the Orphan Commit, but not the Context Limit family) appears on floors 8–10, and enemies leave it again on floor 12, where the next cycle starts;
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
- the team items: all five are in the treasure, shop and boss pools; Von Neumann Architecture has its exact stats;
  Sharp Left Turn shots turn exactly once, 90° left in every firing direction, after 140–200 px, at unchanged speed;
  the Calculator's result only depends on enemies × rooms, stays in its bounds with a small lean to the positive, never
  draws from `game.rng`, ignores disguised Hallucinations and doesn't change in empty rooms; Deep Packet Inspection
  marks the boss and all secret rooms without changing `room.seen` and drops a mark once visited; To the Moon ignores
  spikes, cacti and puddles (checked against a player without it) while cacti, pits and rocks stay solid;
- retirement: the Bug ends after floor 7 and the Null Pointer after 9, and both return with the next cycle; Friday Deploy and the
  Reviewer end after floors 7 and 9 for good, and every floor keeps at least two possible bosses;
- the Game-breaking Bug and Dangling Pointer match the Bug and Null Pointer except for 2 contact damage, never roll
  before floor 8, stay at 2.5–9 % of enemies on floors 8–11 and 19–22 and at 0 on 12–18 (the Game-breaking Bug also at 0 on The Latent Space), and one touch costs a full heart;
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
- the Context Limit family only rolls on The Context Limit (not before it and not on floor 12, where the next cycle
  starts). **Overflow Buffer:** fill rises on its own (full after 6–8 s) and by exactly `hitFill` per hit (none during
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
  with opposing streams that take turns with the arms (never a stream and an arm attack together, never two arms);
  arms hurt on contact along their whole length; the death is a single boss death and no
  segments survive it;
- the Final Score: the values match `B.SCORE_VALUES`; coins count by value (not hearts or Seed Funding), kills leave
  out bosses, boss segments and boss minions, Approvals count at doors and locked chests, an item counts once (taking a
  swapped active item back doesn't), floor bosses and side quests count once via `onRoomClear`; the score card comes
  after floor 11 and 22 but not floor 10, ignores keys for 0.8 s, doesn't touch `game.rng`, Enter leads to The Backlog II
  keeping score and cycles, R starts at zero; the post-mortem shows the same score;
- the floor 8–10 enemies never roll before their `minFloor` in a cycle, have full weight on their home floor and on the next cycle, and
  only `weight × mix` later in the cycle. **Cosine Similarity** reaches its mirror point, keeps ≥ 85 px when the player is near the
  centre, goes around a player in the way, never shoots unless the player does, returns exactly the opposite direction
  after the full windup in all four directions, hits on the axis and misses off it, stays ≥ 0.59 s apart under sustained
  fire, and never replays frozen or earlier shots. **Heisenbug**'s cone is exact (30° seen, 40° not); observed it doesn't
  move, shoot, hurt or take shots; shots in flight hit after release or turning away; its ring of 6 comes after the full
  telegraph along its rays, and looking cancels it; observation holds while frozen, with the clock stopped; explosions
  hit it observed, homing shots ignore it, and tap fire clears the room exactly once. **Bit Bucket** swallows normal,
  spectral and piercing shots at the rim, spares shots fired inside, swallows a returning shot, leaves enemy shots alone,
  shields enemies inside the disc, lets nothing hit in the swallowing tick, stops swallowing while frozen, takes
  explosions, and flushes 5 shots in the locked direction after the full telegraph, then empties. All shots stay at
  165–260 px/s, Cosine Similarity and Bit Bucket draw nothing from `game.rng`, `killAll` leaves nothing, and bus listener
  counts don't change;
- Terms of Service rooms: none on floor 1, 30–65 % of floors otherwise; one per floor at most, dead ends only, never the
  key, README, encounter, boss, secret or start room; a `special` layout with a free centre and no enemies, props, cacti,
  loot or pipe; every other room identical to the same floor without it, deterministic per seed. The deal takes exactly 2
  halves and the clause once, guardrails don't pay, no hit event, the item is scored once, refused at 2 and 1 halves,
  3 halves leaves 1; running through or standing still doesn't sign; god mode pays and Retry with Backoff doesn't
  interfere; a reroll keeps the clause; a swapped active item is free and doesn't score again; the entry banner gives
  way to the contract, other banners don't; signing by keyboard works in the real loop and shows on the timeline;
- the seed dialog only accepts `[A-Z0-9-]` up to 32 and upper-cases; Backspace, Esc and Enter on empty work; paste is read
  only in the dialog and is filtered; characters come from `e.key` (a QWERTZ `y` stays `Y`); M and F2 do nothing there,
  and a held S types nothing more; the seed gives the same floor as `newRun` with it, and a URL seed is pre-filled;
- the daily seed is `DAILY-YYYYMMDD` and `D` starts it; storage drops tampered `dailyDate`/`dailyBest`; a new day resets the
  best; only today's daily seed counts, at death and on the score card, and `game.rng` stays untouched;
- same seed: `T` only after the lockout, on the post-mortem and the score card, with the same floor and a fresh score; `S`
  does nothing there and `R` changes the seed;
- `game.runLog` records floors, items, secret rooms, bosses, side quests and the death line, holds at most 40 entries,
  empties on a new run, survives "keep going" and never draws from `game.rng`;
- the wobble phase is the same for identical shots, differs across a fan, is well spread over 0–2π, and uses neither
  `Math.random` nor `game.rng`; `rm -rf` and the On-Call Pager deal 25/10 on floor 1 and 51.25/20.5 on floor 8;
- hard exclusions (§4): the `BANS` and `BOSS_BANS` tables in the test match every `themes: 0` in the data; on floors 1–22 those
  enemies have weight 0 and never roll, those bosses are never eligible, rooms still hold ≥ 3 enemies on average, every floor
  keeps at least two possible bosses, and factors on other themes are unchanged;
- cycles: `spawnDepth` wraps every 11 floors; every enemy weighs the same on a floor and on that floor in the next three cycles; floors
  12–22 only roll what their first-cycle floor allows; Backlog II holds more enemies than Backlog I; bosses stay on the real depth;
- secret rooms: 0–3 per floor at about 20/60/15/5 %, never next to the boss room or another secret room, at least two doors, all
  hidden, deterministic per seed; a bomb opens only the door it lands by; Deep Packet Inspection marks all of them; a floor
  without one still documents and scans cleanly;
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
- `teleport`/`gotoRoom` **skip the boss intro card**, which only triggers when you walk through a door (see §6).
- God mode doesn't stop "Retry with Backoff" from intercepting a lethal hit. To force death, call `hurt` repeatedly.

---

## 3. Architecture

### 3.1 Load order (`index.html`)
```
core/namespace → core/rng → core/math → core/input → core/sprites → core/audio
data/palette → data/text → data/sprites-core → data/sprites-enemies → data/sprites-items
data/layouts → data/enemies → data/bosses → data/items
world/room → world/dungeon
entities/entity → projectile → player → enemy → enemies-context → enemies-deep → boss → bosses-late → boss-memory-hog → boss-agent-swarm → boss-ransomware → boss-system-prompt → enemy-trojan → pickup → familiar → effects
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
| `storage`, `params` | namespace | validated localStorage (`muted, bestFloor, runs, deaths, dailyDate, dailyBest`; `dailyBestFor(key)`, `recordDaily(key, score)`); validated URL params |
| `spawnDepth` | enemies | the floor within its cycle; every enemy roll uses it (§4, Cycles) |
| `cleanSeed, dailyKey, dailySeed, hpScale` | namespace | the only path for seed input (whitelist, 32 characters), local `YYYYMMDD`, `DAILY-YYYYMMDD`, enemy HP factor per depth (flat-damage items use it too) |
| `ITEMS, ENEMIES, BOSSES, BEHAVIORS, BOSS_BEHAVIORS, PICKUP_TYPES, LAYOUTS, TEXT` | namespace (filled by data/entities) | content registries |
| `RNG`, `hashString`, `randomSeed` | rng | mulberry32 PRNG (`next/float/int/chance/pick/weighted/shuffle/angle`), FNV-1a hash |
| `M` | math | `clamp, lerp, approach, dist, norm, angleDiff, circlesOverlap, circleRectPush, …` |
| `input` | input | `down(code)`, `pressed(code)` (edge since the last sim step), `moveVector()`, `shootDir()`, `_simulate()`; text input: `textMode` (set only by `game.setState` for `seedEntry`), `typed()`, `BACKSPACE`. Controls use `e.code`, typed text uses `e.key` (German keyboards) |
| `defineSprite, drawSprite, hasSprite, spriteSize, spriteFrameCount` | sprites | ASCII sprite registry; unknown names draw a magenta placeholder |
| `audio` | audio | `unlock, play(name), toggleMute, tone, names(), music.start/stop` |
| `FONT, COLORS, FLOOR_THEMES, themeFor(depth)` | palette | colours and 11 floor themes (`gen`, `props`, `cacti` are read by the map generator; `tiles` swaps tile sprites; `ambient` / `wallDecor` add per-frame or baked atmosphere, e.g. `rain`) |
| `floorInfo(depth)`, `TEXT.*` | text | floor names/subtitles (cycling with roman numerals) and all snark lists; `TEXT.pick(list)` |
| `Room`, `Floor` | world | room model and floor generator |
| `Entity, Projectile, Bomb, Player, Enemy, Boss, AI, BossHelpers` | entities | gameplay classes and AI helpers |
| `Pickup, Pedestal, Trapdoor, rollRandomPickup, openChest, rerollPickup, drawSpriteIfExists` | pickup | economy objects |
| `TERMS, rollTermsClause, TermsNotice` | pickup | Terms of Service deal: numbers, clause roll, contract overlay (§3.8) |
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
`scoreCard` instead of `enterFloor`: after 0.8 s Enter continues with `enterFloor(depth + 1)`, R calls `newRun` and T
calls `newRun(game.seed)`, as on the death screen. On the title, `D` starts the daily run and `S` opens `seedEntry`
(Enter: `newRun(seedInput)`, Esc: back to `title`); `Screens.title` draws that dialog over the title, because no room
exists before the first run.
Global keys handled in every state except `seedEntry`: `M` (mute) and `F2` (debug). Holding `R` for 1 s in play or pause restarts the run
(`game.restartHold` drives the HUD ring).

### 3.5 World API (`game` is passed to every behaviour and hook)
`game.player · game.room · game.floor · game.depth · game.rng · game.followers · game.seed · game.runStats ·
game.score · game.cycles`
- `spawnProjectile(opts)`, `spawnEnemy(id, x, y, room?)`, `spawnBoss(id, x, y, room?, opts?)` (`opts = {hpMult,
  encounter}`; kept in `game.bossSpawnOpts` during the constructor, so bosses spawned in `init`, i.e. the Swarm, inherit it)
- `spawnPickup(type, x, y, opts?, room?)`, `spawnPedestal(itemId, x, y, {price}?, room?)`
- `explode(x, y, radius, damage, source)`: damages enemies and the player (2 halves), breaks rocks and cacti (8 % loot), reveals
  hidden doors, flings pickups, shakes the screen, emits `explosion`
- `addScore(kind, n?)` · `scoreTotal()` (Final Score, §4) · `recordDaily()` · `logRun(text)` (`game.runLog`, §4)
- `shake(intensity, seconds)` · `banner(title, subtitle)` · `freezeEnemies(seconds)` · `rollItem(pool)` ·
  `nearestFreePos(x, y, room?)` · `nextFloor()` · `teleport(room)` · `pipeWarp(pipe)` · `glitchHud(seconds)` (scrambles one HUD area,
  stored in `game.hudGlitch`; a new call restarts the timer instead of stacking)

### 3.6 Dungeon generation (`world/dungeon.js`)
1. A 9 × 9 cell grid with the start room in the centre. Target room count is `min(20, floor(3.3·depth) + 6 + rand(0..2))`.
2. Rooms are added by randomised BFS. A cell is accepted only if it is empty, has ≤ 1 filled neighbour, and a coin flip
   agrees. Generation retries (up to 500 times) until the target count is reached with ≥ 3 dead ends. A floor theme can
   raise that with `gen.minDeadEnds` (Forgotten Branches: 7, so its maps branch more); other floors are unaffected.
3. Dead ends become the **boss** room (farthest BFS distance), the **treasure** room and the **shop**. `placeSecretRooms`
   adds 0–3 **secret** rooms (`SECRET_COUNTS`: 20/60/15/5 %, mean 1.05, so the loot per floor stays about the same): empty
   cells with ≥ 2 room neighbours, not next to the boss or another secret room; their door edges are `hidden`. Count and
   extra rooms come from their own stream (`':secret'`). The first pick always uses the floor RNG, even on a floor that
   then gets none, so a floor with exactly one is unchanged from before. With 0, 2 or 3, later rooms in map order roll
   differently, because each room's `build` draws from the floor RNG.
4. Edges are shared objects `{kind, locked, hidden}` between the two rooms' `doors[dir]`. Kind priority is
   boss > secret > treasure > shop. Treasure and shop edges are `locked` from depth 2.
   A secret room can only be opened by an explosion within about 140 px of the hidden door tile.
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
   `floor.readmeRoom`, own stream `':readme'`). Collecting it calls `floor.documentMap()`: every room except secret
   rooms becomes `seen`, and `floor.documented` makes the minimap draw connections between unvisited rooms too.
9. `assignPipes` marks about 10 % of combat rooms `hasPipe` (own stream `':pipe'`). `game.onRoomClear` →
   `placePipe` drops a `B.Pipe` (in `room.pickups`, not near doors or the centre). Walking onto it calls
   `game.pipeWarp`, which teleports to a random room other than boss, secret and the current one (via `game.rng`).
   `game.pipeExitOk` also skips rooms whose only visible doors are locked (a treasure room or shop from floor 2 until
   its door is unlocked): landing there without an Approval was a soft-lock.
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

13. `assignTerms` (from floor 2, own stream `':terms'`, always the same number of draws, runs **last**) turns one dead-end
   `normal` room into a **Terms of Service** room on 50 % of floors (`TERMS_CHANCE`; about 43 % on floor 2, where a free
   dead end is sometimes missing). Candidates have exactly one visible door, of kind `normal`, and aren't the key room,
   README room or an encounter; a hidden secret door may stay. It sets `cell.type` and `room.type` to `'terms'`, re-stamps a
   `special` layout, empties enemies, loose loot, pipe and props, and sets the visible edge's kind to `'terms'` (unlocked).
   `floor.termsRoom` holds the cell. It must stay last: the `':props'` and `':cacti'` streams span all rooms and draw per
   layout, so converting earlier would shift other rooms.

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
  - **Flags:** booleans are OR'ed (`piercing, homing, spectral, bounce, wobble, split, flying, floating, parallel, showHp,
    scanMap`),
    `multishot` takes the max, and other numbers are summed (`duck, unitTests`).
  - **Hooks:** `fireHook(name, …)` calls `onPickup, onShoot, onHitEnemy, onRoomEnter, onRoomClear, onHurt, onLethal,
    onOverheal, update` on all passive items and the active item, and catches errors per item.
  - **Shooting:** 4-directional (the last arrow key pressed wins); shots inherit 30 % of the player's velocity.
    `multishot` fires a fan (`spread`, default 12°), or a parallel pair when `parallel` is set and the count is 2.
  - **Slowdowns:** `slowBy(f)` (0 ≤ f < 1) slows the player for exactly one tick, keeping the strongest factor
    instead of multiplying (no stacking) and ignoring flying and floating players; a source calls it every tick (Overflow Buffer
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
  - **Sharp turn:** a shot with `turnAt` (px, set by Sharp Left Turn) turns 90° left once at that distance and emits
    `shotTurn`.
  - **Shot fields:** every tick, before moving, a player shot calls the behaviour hook `bendShot(e, shot, dt, game)`
    of every living enemy in the room that has one (the Dust Daemon's swirl, the Bit Bucket's disc). It may change
    `vx/vy` or end the shot (it then doesn't move or hit anything that tick) and must be deterministic. Enemy shots
    are never bent.
  - **Wobble:** `wobblePhase` (Temperature 1.5) is a pure hash of the shot's spawn values, because it changes real
    shot paths: no `Math.random`, and no `game.rng` either, or every seed with that item would change.
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
  - **Boss groups:** the Rogue Agent Swarm and the Agent Swarm are four real `Boss` entities each. The first one's `init` spawns the other three
    and all share `e.bossGroup` (one array), which the HUD sums into a single health bar. Non-final members set
    `isBoss = false` in `onDeath`, so only the last death plays the boss explosion and fanfare.
- **`Pickup / Pedestal / Trapdoor`** (`entities/pickup.js`):
  - **Terms of Service:** `B.Pedestal` takes `opts.terms = {clause}`; `pd.terms` keeps `clause, readT, touching`.
    `Pedestal.updateTerms` needs `B.TERMS.readTime` (1 s) within `readRadius` (150 px), and signing happens only on stepping
    onto the pedestal (rising edge), so running through doesn't sign. The cost `B.TERMS.cost` (2 halves) comes straight off
    `player.health`, not through `hurt()`: no guardrails, i-frames, `onHurt` or `playerHurt`, and god mode pays too. At
    health ≤ 2 it's refused (`denied`, reason `terms`), so it's never lethal and `onLethal` never runs. Clause `add` values go
    into `player.bonus`. Signing sets `pd.terms = null`, so a swapped active item stays free; Regenerate Response keeps the
    clause. `B.TermsNotice` (overlay in `room.pickups`, `drawLayer` 5) draws the contract on the side away from the player
    and clears the room's entry banner, which would cover it.
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
  after changes, floor name and timer, a minimap (7 × 5 window around the current room; with `flags.scanMap`, unvisited
  boss and secret rooms are outlined red and blue, or shown as a dot on the window edge, see `HUD.scanMarks`), the item banner, the boss
  bar, and the hold-R ring. While `game.hudGlitch` is set, one area (hearts, active item, stats or minimap) is drawn
  as static or scrambled text; the noise is purely visual.
- **Screens (`screens.js`):** title (with the seed dialog), floor card, boss intro VS card, pause (item grid browsed
  with the arrow keys), the death "POST-MORTEM" (final score, cycles, and the last 6 `runLog` entries as an incident
  timeline; long text truncates via `clipText`), and the end-of-cycle score card.
  - Note: the pause screen registers its **own `window` keydown listener** for arrow-key browsing. It's display only,
    and it's the one keyboard listener outside `input.js`. `input.js` also has a `paste` listener on window that
    ignores everything outside `textMode`.

### 3.10 Sprites
- **Format:** `defineSprite(name, {palette: {ch: '#hex'}, rows: [...] | frames: [[...], ...], scale: 4})`. `.` and
  space are transparent, and characters missing from the palette are transparent too. Sprites are baked lazily into
  offscreen canvases, plus a white "flash" variant.
- **Naming:**
  - `player_{down,up,left,right}` (4 walk frames), `player_hurt`, `player_itemget`, `player_dead`
  - `tile_{rock(3 frames),block,pit,spikes}`, `tile_cactus` and `tile_sandstone` (3 frames each), `tile_border`
    (3 frames: barrier, fence across, fence down), `hud_*`, `map_{boss,treasure,shop,secret,terms}`, `pipe` (2 frames, generated),
    `tile_mem_zero` and `tile_mem_one` (2 frames; the Memory Hog's reserved floor, a drawn overlay, not real tiles),
    `prop_{crate,bush,package,carton}` (frame 1 = damaged)
  - `item_<id>`, `pickup_<type>`, `pedestal`, `trapdoor`, `bomb`, `familiar_duck`, `orbital_test`
  - `enemy_<id>`, `boss_<id>`
  - **Count:** about 177 sprites. All of them are original pixel art written as ASCII in code.

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
| `ambientWhisper` (`text, x, y, intense?, big?`), `ambientThunder` | game (`updateAmbience`, only on themes with `ambient: 'rain'` and not `game.calm`; uses `Math.random`, never `game.rng`); the System Prompt also sends its `big` seed line | audio (`whisper`, `thunder`), effects (`Whisper` text, soft room tint) |
| `pipeAppear`, `pipeWarp`, `pipeArrive` (`to`) | game | audio, effects |
| `propHit`, `propBreak` (`kind, color`) | game | audio, effects |
| `bossSpawn`, `bossIntro`, `bossPhase`, `bossStomp`, `bossBounce`, `bossBeam`, `bossMerge` (`left`) | game, boss | audio (boss music, `merge`), effects ("Merged!" pop) |
| `bossSearch`, `bossReplace`, `bossAbsorb` | Megalith (Ctrl+F starts, a match is replaced, a module merges back in) | audio (`search`, `replace`, `merge`), effects (yellow flash, "+1 import") |
| `bossMoney` (`kind`: coin/expire/buyback/beat/missed) | Shareholder | audio (`coinDrop`, `cash`, `denied`), effects (gold sparkles, "vested elsewhere") |
| `bossAlloc`, `bossReserve`, `bossFree`, `bossGc` (`kind`: warn/start/end) | Memory Hog (malloc starts, tiles flip to ones, a bomb frees memory, Stop-the-World) | audio (`malloc`, `reserve`, `freeMem`, `denied`, `gcSweep`), effects ("free()", green ring) |
| `bossEncrypt` (`text`), `bossDecrypt` (`text`), `bossPopup`, `bossWipe` (`kind`: warn/hit) | Ransomware | audio (`encrypt`, `freeMem`, `popup`, `denied`, `wipe`), effects (lock text, sparkles) |
| `bossTruncate` (`kind`: warn/flood), `bossTomb` (`kind`: rise/hit/delete/restore, `n`), `bossEcho` (`id, name`), `bossCompact` (`n`) | The System Prompt | audio (`denied`, `truncate`, `tombRise`, `hit`, `hardDelete`, `charged`, `echoIn`, `merge`), effects (tint, debris, "DELETE … WHERE id = n", rings) |
| `bossExit` (`kind`: segfault/parachute/oom/eoc) | Megalith, Shareholder, Memory Hog, System Prompt (`onDeath`) | effects ("SEGMENTATION FAULT", golden parachute, "KILLED (out of memory)", "[end of conversation]" and "New conversation started."), audio (`eoc`: rain bed off, `endConversation`) |
| `playerHurt`, `playerDeath` | player, game | audio, effects, HUD |
| `pickup` (`type`), `itemGet` (`id, def`), `purchase`, `chestOpen` | pickup, player | audio, effects, HUD |
| `denied` (`reason`: credits/locked/bomb/charge/encrypted/terms) | various | audio, effects |
| `roomEnter` (`first`), `roomClear`, `doorsOpen`, `doorsClose`, `unlock`, `secretFound`, `rockBreak` (`kind`: rock/cactus) | game, room | audio, effects |
| `cactusPrick` | game (`checkCactus`) | audio (`prick`), effects (spines) |
| `enemyOverflow` (`r`) | Overflow Buffer (bursts) | audio (`overflowBurst`), effects (splash, glass shards) |
| `enemyChomp` (`r, ate`), `enemyBounce`, `enemyUnpack` | Honeypot, Rolling Release | audio (`chomp`, `bump`, `unbox`), effects (cyan ring, dust, packing peanuts) |
| `enemySwallow` (`fill, color`), `enemyFlush` (`r, color`) | Bit Bucket | audio (`swallow`, `flush`), effects (small burst and ring; ring and burst) |
| `termsSigned` (`x, y, clause, item`) | Terms pedestal | audio (`sign`), effects (`-♥♥`, ring, sparkles), `game.runLog` |
| `explosion` (`radius`), `bombPlaced`, `projectileEnd` (`team, impact`) | game, projectile, player | audio, effects |
| `shotTurn` | projectile (Sharp Left Turn) | effects (small spark) |
| `activeUsed`, `activeCharged` | player | audio, HUD |
| `runStart`, `floorEnter` (`depth`), `descend` | game | audio (music), screens |
| `cycleComplete` (`cycles, score`) | game (`showScoreCard`) | audio (`itemGet`) |

Rule: audio and effects **only listen**. Game logic never calls them directly, except `game.shake`/`banner`, which
are game state. `game.js` listens too, for `game.runLog` only (block at the end of the file). `enemyWindup` also carries
`sound` for the floor 8–10 enemies: `mirrorPing` (Cosine Similarity), `glitch` (Heisenbug), `gurgle` (Bit Bucket).

### 3.12 Audio (`core/audio.js`) and effects (`entities/effects.js`)
- **Audio:** 94 synthesized SFX in total, plus a looping rain bed (two filtered noise layers) that `music.start` switches
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

**Items:** 55 in total, 50 passive and 5 active (marked `*`). Pools: t = treasure, s = shop, b = boss, s/s = shop+secret.
```
cold_brew mech_keyboard stack_overflow context_window prompt_caching tab_completion max_effort monorepo
kubernetes blockchain technical_debt temperature few_shot regex chain_of_thought confident_hallucination
linter dark_mode microservices vibe_coding the_cloud rlhf constitutional_guardrails retry_backoff code_review
daily_standup lgtm off_by_one yaml_config git_blame rubber_duck unit_tests copy_paste on_call_pager
garbage_collector seed_funding benchmark_overfitting feature_flag extra_gpu offbrand_gpu long_term_support
swap_file electron_app reserved_instances graceful_degradation calculator deep_packet_inspection von_neumann
sharp_left_turn to_the_moon
regenerate_response* stop_generating* rm_rf* compact* ctrl_z*
```
Item conventions:
- Per-run rolled values go in `player.bonus`, and one-shot state in `player.itemState[id]`.
- Active items return `false` from `use()` to keep their charge (and should emit `denied`).
- A player shot with `damage <= 0` is a dud (Off-Brand GPU): it fizzles on enemies and breakable objects without
  damage, knockback or `onHitEnemy` hooks (`projectile.js`).
- The default price is 15 (`B.itemPrice(id)`).
- Flat item damage scales like enemy HP: `rm_rf` (25) and On-Call Pager (10) multiply by `B.hpScale(depth)`.
- **Team suggestions** (2026-11-04):
  - **Calculator** computes enemies × visited rooms of the floor when entering a room with enemies and shows the sum
    (`4 x 7 = 28`). `B.calcResult(n)` hashes n into small changes to damage, shot speed, speed and fire delay (55 % plus,
    45 % minus). It's a pure function: no `game.rng`, so seeds are untouched. `ignoreForClear` enemies don't count, or a
    disguised Hallucination would give itself away.
  - **Deep Packet Inspection** is display only: it never changes `room.seen`, so a secret room still has to be blown
    open.
  - **To the Moon** sets `flags.floating`, which is less than `flying`: no spikes, cacti or puddles, but cacti, rocks and
    pits stay solid, and the Honeypot and the Memory Hog's reserved memory still work on you. The player is drawn
    slightly above the shadow.
- **Heart containers** (2026-11-03): besides RLHF, five items add max health (Long-Term Support, Swap File, Electron
  App, Reserved Instances, Graceful Degradation; see `documents/items.md`). Heart pickups go through `healPickup` in
  `pickup.js`: healing beyond full health is offered to the item hook `onOverheal(player, halves, game)`, and the
  pickup is taken if it healed or a hook returned `true` (Swap File banks it; its bar is `drawSwap` in `hud.js`).

**Enemies** (id: behaviour, minFloor, base HP):

| id | behaviour | minFloor | HP |
|---|---|---|---|
| bug | wander | 1 to 7 | 8 |
| null_pointer | fly_chase | 1 to 9 | 5 |
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
| trojan | trojan | 5 | 20 (bonus spawn) |
| game_breaking_bug | wander | 8 | 8 |
| dangling_pointer | fly_chase | 8 | 5 |
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
| overflow_buffer | overflow_buffer (+ `overflow_puddle`) | 11, The Context Limit only | 18 (max 2 per room) |
| summarizer | summarizer | 11, The Context Limit only | 16 (max 1 per room) |
| lost_in_the_middle | lost_in_the_middle | 11, The Context Limit only | 14 (max 2 per room) |
| cosine_similarity | cosine_similarity | 8, The Latent Space only | 14 (max 2 per room) |
| heisenbug | heisenbug | 9, Undefined Behavior only | 12 (max 2 per room) |
| bit_bucket | bit_bucket | 10, /dev/null only | 20 (max 2 per room) |

The **Trojan** (2026-11-05, `entities/enemy-trojan.js`) is a bonus spawn like the Hallucination (`bonusChance` 0.09, no `home`),
and follows the same rule: **it must stay indistinguishable from what it imitates**. It draws the floor's `prop_<kind>`
with `drawProps`' shadow on a tile centre and stays `intangible` and `ignoreForClear`, so homing shots, followers, Code Review
and the Calculator can't give it away; for the same reason it checks player shots itself. Change `drawProps` and you must
change its `draw`. A real prop is solid and the disguise isn't, but the player reveals it at 100 px, before touching it.

**Retired enemies:** like bosses, an enemy can end at `maxFloor` (2026-11-05, from the weights review): the Bug after floor 7 and
the Null Pointer after 9. Unlike a boss it returns with the next cycle (§4, Cycles), so The Backlog II has both. `enemyWeightAt` returns 0 past it.

The **Game-breaking Bug** and **Dangling Pointer** (2026-11-04) are recoloured Bug and Null Pointer for floors 8+: same
stats and behaviour (they share `BUG_FRAMES` / `POINTER_FRAMES`), but contact damage 2 and cost 1.5. They have no `home`
on purpose: floors 8+ have no home crowd, so they count fully everywhere. Their weight is 3 + 1 per floor (max 12) because the cacophony lifts everything else too:
that holds each at about 5 % of enemies (a flat weight let the share fall).

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

The **Context Limit family** (`family: 'context'`, `themeOnly: ['context']`, minFloor 11, all 2026-11-03) lives in
`entities/enemies-context.js` (one section per member). `minFloor` 11 keeps it off floors 8–10 (it leaked there until
2026-11-05; those floors should get their own enemies instead). It comes back on floor 22. Look: pale and waterlogged (glass, ink, soggy paper,
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

The **floor 8–10 enemies** (2026-11-05, `entities/enemies-deep.js`, weight 6, cost 1.8, `themeOnly` + `minFloor`) are one per
floor and deliberately not a family: no `family` field and no shared look. At home each is 7–11 % of enemies, about 3 % on
the later floors of the cycle (the cacophony). They stay off the Summarizer's whitelist. `enemyWeightAt` ignores `minFloor`
(only `rollRoomEnemies` enforces it), so anything reading weights directly shows them on earlier cacophony floors.
- **Cosine Similarity** (gold `#ffd166`, flying) wants to stand at the player's position point-reflected through the room
  centre. The target is pushed out to `keep` + 20 px, it goes around the player instead of through, and it flees below
  `keep` (90 px). Its only attack mirrors the player: a player shot starts a 0.6 s windup (glow, dashed ray, "!",
  `mirrorPing`), then it fires one shot in the exact opposite direction. Further shots during the windup don't count, so
  that is at most one per 0.6 s. Because it stands mirrored, this only hits when you fire straight at it. Player shots are
  detected by one file-level `shoot` listener compared with `runStats.time` (same tick only), so there are no per-enemy
  listeners and frozen or earlier shots are never replayed.
- **Heisenbug** (teal body, yellow `#f5ff4a` danger) is observed when the player holds a fire direction and it lies within
  `cone` (0.61 rad, about 35°). While observed it stands still and is `intangible`: shots pass through, there's no contact
  damage, it draws as a flickering outline, and it says a line at most every 5 s. A running telegraph cancels and the clock
  resets. Unobserved it is solid and stalks the player; after 2.5 s in a row it telegraphs for 0.7 s, then fires a ring of
  6. So tapping beats holding: a shot in flight hits once you release or turn away. Observation runs in `afterMove`, so it
  also applies while frozen. `init` wraps `hurt` on that instance, so sourceless damage (explosions, `rm_rf`, On-Call Pager)
  always counts. Homing shots and orbitals skip it while observed.
- **Bit Bucket** (pale steel with a grey outline, red `#ff4d3d` danger, flying) drifts toward the player at 32 px/s over a
  dark disc of radius 110, on `drawLayer` −1. Through `bendShot`, any player shot entering the disc is swallowed, spectral
  and piercing included. `state.seen` (a WeakMap) tracks each shot, and only an outside-to-inside change swallows, so shots
  fired inside are exempt until they leave and come back. It doesn't swallow while frozen or spawning. At 4 swallowed shots
  it stops, locks its aim, telegraphs for 0.8 s and flushes a 5-shot fan (`enemyFlush`), then rests 0.6 s empty. It keeps
  swallowing during the telegraph without filling. The disc is part of the enemy, so nothing is left behind.

Minions (`spawn: false`): `sp_tombstone` (System Prompt's tombstone; counts hits, restores a killed enemy), `leaklet`, `microservice`, `megalith_module` (Megalith phase 2; crawls back and heals it), `loop_segment`, `nested_loop_part`, `detached_head_tag` (Detached HEAD's head),
`subagent` (Agent Swarm's small agents), `ransom_key` and `popup_close` (Ransomware's key fragments and window buttons), `octo_arm` (Octopus Merge arm segment), `spinlock_segment` (Spinlock body; invulnerable, shields the head),
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
- `themes: { branches: 3, devnull: 0 }` multiplies the weight on floors with that theme; 0 excludes it there at every depth
  (see Hard exclusions below).
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
enemy that can appear before floor 8 needs a `home` and an entry in the smoke test's `ROSTER` table.

**Cacophony from floor 8** (`B.MIX_FROM`): `B.mixAt(depth)` is 0 before 8, then 0.25, +0.1 per floor, 1 from 16.
`B.themeWeight(def, theme, depth)` lifts any factor below 1 (AWAY, `themeOnly` exclusion) to
`f + (1 − f) · mix`; factors ≥ 1 and an explicit 0 in `themes` stay. Without `depth` it returns the raw factor (old behaviour, used by tests).
`enemyWeightAt`, `rollRoomEnemies` (pool, exclusion and bonus chance) and the boss functions pass the depth, so the
families show up on most of floors 8–11 (away from home about 26–36 % of enemies; the Orphan Commit too; the
Context Limit family only on 11) and
generic enemies move toward equal odds. Floors 8–11 have no home crowd at all. For enemies the depth here is `B.spawnDepth`, so
the mix never passes 0.55 (floor 11) and floors 12–18 have none; only bosses reach 1 from floor 16. Bosses use the same lift, but a boss
away from home weighs at most 3 (`BOSS_LEAK_WEIGHT` in `bosses.js`): the Octopus Merge is about 5 % on floor 8 and
16 % on floor 16 instead of dominating. Check that themed content reads on any floor: dark floors are fine for both
families (screenshots 2026-11-03); cacti stay a Sandbox Borders floor feature.

**Cycles** (2026-11-06): `B.spawnDepth(depth)` is the floor within its cycle (12 → 1, 22 → 11), so every cycle rolls the same enemies at
the same weights: The Backlog II is The Backlog, Bug included. `enemyWeightAt` and `rollRoomEnemies` use it for `minFloor`, `maxFloor`,
weights, bonus chances and the cacophony. The room budget, the enemy cap and HP stay on the real depth, so later cycles are harder:
The Backlog II has about 8 enemies per room, The Backlog about 3. Bosses and side quests stay on the real depth too, so the Monolith
never returns as a floor boss. Floors 1–11 aren't affected, and a change to one floor's roster carries over to all its later cycles.

**Hard exclusions** (2026-11-05, from the weights review, to thin out the late floors): `themes: { x: 0 }` keeps an enemy or boss off
that theme at every depth, so the cacophony doesn't lift it. It goes by theme, so it applies on later cycles too (floor 19 is The
Latent Space again). Floors 8–11 went from 30–34 possible enemies to 23–26. A new exclusion also goes into `BANS` or `BOSS_BANS`
in the smoke test.

| Theme | Never rolls there |
|---|---|
| branches | Zombie Process |
| sandbox | Memory Leak, Spaghetti Code, Merge Conflict |
| training | Zombie Process |
| latent | Spaghetti Code, Merge Conflict, Scope Creep, Rate Limiter, Port Scanner, Game-breaking Bug |
| undefined | Deprecation Warning, Scope Creep, Race Condition, Honeypot, Rolling Release, Spinlock, Rootkit, Dust Daemon |
| devnull | Merge Conflict, Stale Branch, Detached HEAD, Cherry-Pick, Flaky Test, Graphics Glitch |
| context | Spaghetti Code, Cherry-Pick, Race Condition, Honeypot, Rolling Release, Spinlock, Rootkit, Dust Daemon; bosses: Octopus Merge, The Shareholder |

**Bosses** (base HP): `monolith` 360 (floors 1–6), `stakeholder` 250 (floors 1–6), `friday_deploy` 240 (floors 4–7),
`infinite_loop` 300 (floors 2–7), `memory_hog` 300 (floors 4–9, ×2 on Dependency Hell), `megalith` 460 (floor 7+, replaces the Monolith), `shareholder` 380 (floor 7+,
replaces the Stakeholder), `nested_loop` 450 (floor 8+, replaces the Infinite Loop), `rogue_swarm` 4 × 80 (floors 2–6), `agent_swarm` 4 × 115 (floor 7+, replaces the Rogue Agent Swarm), `ransomware` 460 (floor 8+, ×3 on /dev/null), `system_prompt` 500 (floor 11+, Context Limit only, guaranteed there), `reviewer`
340 (floors 4–9), `octopus_merge` 300 (330 until 2026-11-03; Forgotten Branches only, weight 12: about 52 % on
floor 3, about 41 % on floors 14, 25, …). Each replacement has its predecessor's weight and a `replaces` field, so
a floor never has the predecessor as a side quest (the side quests keep the retired bosses alive past their `maxFloor`). Friday Deploy and the Reviewer moved from floors 2 and 3 to floor 4 on
2026-11-02, which gives floor 3 to the Octopus Merge and floor 2 to Monolith, Stakeholder, Loop and Swarm.
- **Octopus Merge** works like the Infinite Loop: the knot is the boss, its 8 arms are 5 `octo_arm` segments each
  (`proxy`, 60 %). The knot positions them every tick and draws the arms itself; only the tip (a commit dot) draws
  as a sprite. Arm contact is checked along the drawn line, not per segment. Phase 2 runs in turns (2026-11-05, after playtesters
  found it overtuned): a stream, then `P2_ARMS` single arm attacks, each waiting until the last arm is back at rest, then
  the next stream; tip shots only in the pauses. Before that, streams and arms overlapped 40–45 % of the time. Speed-ups from merges (`state.sm`)
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
- **Ransomware** (2026-11-05) lives in `entities/boss-ransomware.js`; the header there lists everything, all numbers are in
  `RW`. It is the only boss that attacks the player's tools: `player.encrypted` (`{active, pushes, fire}`, read in `useActive`,
  `placeBomb` and `recalcStats`, stamped on the HUD by `drawEncrypted`). Locks must never outlive the fight, so `onDeath` and
  `game.enterFloor` both clear them. Only one attack runs at a time. Overlays in `room.pickups`: `PopupWindow`, `LockShot`,
  `RansomTerminal`, `WipeMark`. Windows are not tiles: they push the player out each tick, so `windowSpot` must keep
  `popGap` to walls, solids and other windows (a corridor stays free around each one) and must not cover the terminal or a
  fragment, or those become unreachable. **All new window placement must go through it.** The danger colour is magenta
  (`#e040c0`), after the Graphics Glitch. He isn't a side quest.
- **Agent Swarm (/xhigh)** (2026-11-05) lives in `entities/boss-agent-swarm.js` and runs on the Rogue Agent Swarm's code in
  `boss.js`: the behaviour is the same object with its own `cfg` (`XHIGH` instead of `SWARM`), and `boss.js` offers the hooks
  `extra`, `holdFire`, `onFinish` and `drawExtra`. A new swarm variant needs only a new `cfg`. Its colour is a deep crimson on
  purpose: its body is the player's, so it must stay well away from the coral avatar. The **laser** is aim, lock, beam
  (full heart); the formation holds fire during lock and beam, the rule the Octopus Merge playtest taught us: a big
  attack gets the room to itself. **Subagents** (`subagent`, `ignoreForClear`, `state.owner` so they score nothing) are
  capped at `XHIGH.minions` in `spawnSubagent`, the only place that may check it, because several target rings can be
  running at once. Depth 1 starts one depth-2 child; `maxDepth` stops it there. The name comes from the idea of subagents
  at depth > 1.
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
- **The System Prompt** (2026-11-08) lives in `entities/boss-system-prompt.js`; the header there lists everything, all numbers
  are in `SP`, the spec is in `DESIGN.md` §8. It is the **guaranteed** boss of The Context Limit (`guaranteed: ['context']`,
  honoured by `rollBoss` and `rollBossVaried` after their usual single draw, so floor RNG and maps stay the same; the other bosses
  stay `bossEligible` there but are never drawn). Its theme is inevitability: a fixed slow walk through obstacles and a
  **script** of the next three actions in `barText`. **Whatever is written must run as written**, also after a phase change, so
  new logic must never drop or rewrite script lines; that's why the phase 3 window waits until every written Truncate has run.
  Floods are the overlay class `Truncation` (`room.pickups`, like `ReservedMemory`), on whole tile columns; every flood goes
  through `bandCols` / `floodOk` (dry parts ≥ `minDry`, dry floor within `reach` steps). Echoes (`Echo`, also an overlay) replay
  one attack per earlier boss from `game.bossHistory` (`ECHO_ATTACKS`; a new boss without an entry gets an aimed fan, so give
  it one). Tombstones are the minion `sp_tombstone` and restore ids from `floor.killLog` (filled in `game.onEnemyKilled` with
  scored kills only); only `RESTORE_BEHAVIORS` come back, and **a new behaviour that spawns scoring children or has a partner
  must stay off that list**. Restored enemies carry `state.owner`, so they score nothing. Two generic boss hooks came with it:
  `behavior.ambience(e, game) → {lines, interval, intense}` takes over `updateAmbience`'s whispers while the boss lives, and
  `behavior.epitaph` replaces the rolled epitaph when the player dies in its room (after the roll, so `game.rng` is unchanged).
  Its death sets `game.calm` (reset in `enterFloor`): no rain, ripples, whispers or rain bed for the rest of the floor.
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
live HUD display. The only stored score is the best of today's daily run (`dailyDate`/`dailyBest`): it unlocks nothing,
expires with the date and is shown on the title, post-mortem and score card. Only the seed for today's date counts,
checked when the run ends, so a run crossing midnight doesn't. Only credits from pickups count. Kills skip anything in
`B.BOSSES`, `proxy` or `ignoreForClear` parts and minions with `state.owner` (boss-refilled, so they can't be farmed);
keep that in mind when a new enemy respawns things. Bosses and rooms count in `onRoomClear`, so the Swarm's four
entities score once. `game.cycles` counts finished cycles and resets with the run.

**Incident timeline:** `game.runLog` holds `{t, text}` entries (at most 40, reset by `newRun`, kept through "keep going"),
filled by bus listeners at the end of `game.js`: `Shift started:`, `Paged: entered`, `Deployed:`, `Found an undocumented
endpoint`, `Accepted the Terms of Service, unread`, `Resolved:`, `Side quest closed:`, `Outage: lost to`.

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

**Text** (`B.TEXT`): `FLOORS` (11), `EPITAPHS` (25), `TAGLINES`, `SHOP_LINES`, `ENCOUNTER_LINES` (side-quest banner), `TERMS_LINES` (entry banner), `TERMS_CLAUSES` (6 real clauses with `add`, 6 jokes; each has `sec`, `text`, `fx`; `B.rollTermsClause` picks a real one 60 % of the time), `CLEAR_QUIPS`, `DENIED`, `PICKUP`, `EVENTS`, `RANKS`,
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
and `color` (optionally `themes` / `themeOnly`, §4, `maxFloor` to retire it on deeper floors, `replaces` on its successor, and `guaranteed: [theme]` to make it the only boss drawn on that theme), plus a `B.BOSS_BEHAVIORS.id` entry in `boss.js`. Give it ≥ 2 attacks and a phase change at a HP threshold
(emit `bossPhase`, show a `game.banner`), and place it with `BossHelpers.placeAwayFromPlayer`. Optional: `barText(e, game)`
for a second HUD line under the boss bar. `boss.js` is long; new bosses can go into `bosses-late.js` or a new file.

**Add a layout:** use `L(id, ['normal'], weight, [7 rows × 13 chars], bias?)` in `layouts.js`. The characters are
`. r b p s e` (`e` marks a preferred spawn point). It must pass `validateLayout(l, {strict: true})`.

**Add a Terms of Service clause:** add an entry to `B.TEXT.TERMS_CLAUSES` with a unique `sec` and an honest `fx`, because the
contract states the effect in plain words. A real clause's `add` must be a penalty (the smoke test enforces this).

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
- **A floor may have no secret room.** There's no hint either way, so bombing walls can come up empty. Use `cells` or
  `findType` with that in mind: `gotoRoom('secret')` returns `false` on such a floor, and it only goes to the first one.
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
- A local leaderboard for the daily run (the daily seed and today's best exist since 2026-11-05).
- A separate music toggle (extend the `storage` schema with validation).
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
