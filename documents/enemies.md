# The Binding of the Agent: Enemies and bosses

All enemies, minions and bosses in the game. Edit this file by hand. The game code is the source of truth: all
names and numbers below were checked against it on 2026-10-31, and the code wins whenever the two disagree.
Items and pickups are listed in [items.md](items.md).

- **Contents:** [Enemies](#enemies) (12) · [Minions](#minions) (3) · [Bosses](#bosses) (4)
- **Images** are exported from the in-game pixel art (`src/data/sprites-*.js`). After art changes, run
  `node tools/export-sprites.js`; it rewrites `documents/images/` and never touches this file.
- **IDs** (`like_this`) are the keys used in code (`B.ENEMIES`, `B.BOSSES`) and in the debug API, e.g.
  `BOTA.debug.spawn('bug')` or `BOTA.debug.spawnBoss('monolith')`.
- **PDF:** `node tools/export-pdf.js` renders this file to `documents/pdf/enemies.pdf`.

## Reading the numbers

**Depth scaling.** Enemies and bosses get tougher on deeper floors: enemy HP +15 % per floor, boss HP +30 % per
floor. Their attacks also come a little faster and their shots fly a little quicker (up to 25 % shorter pauses).
The HP values below are floor-1 values.

**Damage.** Touching an enemy or getting hit by its shot costs half a heart; touching a boss costs a full heart.
For comparison, the player has 3 hearts at the start and moves at 240 px/s; enemy shots fly at 165–260 px/s.

---

## Enemies

HP is the floor-1 value. "First floor" is the earliest floor where an enemy can appear in normal rooms.

| | Name | First floor | HP | Behaviour | Flavour text |
|---|---|---|---|---|---|
| ![Bug](images/enemy_bug.png) | **Bug** `bug` | 1 | 8 | Wanders around slowly. Gets rarer on deeper floors | It's not a bug, it's a feature. A feature with mandibles. |
| ![Null Pointer](images/enemy_null_pointer.png) | **Null Pointer** `null_pointer` | 1 | 5 | Flies straight at you, fast but fragile | Points at nothing. Charges at you anyway. |
| ![Memory Leak](images/enemy_memory_leak.png) | **Memory Leak** `memory_leak` | 1 | 14 | Chases you slowly and grows the longer it lives. Splits into 2 Leaklets when killed | Gets bigger the longer you ignore it. |
| ![Hallucination](images/enemy_hallucination.png) | **Hallucination** `hallucination` | 1 | 6 | Disguised as a Credit until you get within about 120 px, then chases you fast. 10 % chance per room to appear on top of the normal enemies (max 1) | Looked like money. Was not money. |
| ![Flaky Test](images/enemy_flaky_test.png) | **Flaky Test** `flaky_test` | 2 | 10 | Fades out and teleports 170–400 px away from you, then fires one aimed shot. Can't be hit while faded | Passes on my machine. |
| ![Merge Conflict](images/enemy_merge_conflict.png) | **Merge Conflict** `merge_conflict` | 2 | 18 | When lined up with you horizontally or vertically, winds up for 0.5 s and dashes. Max 3 per room | <<<<<<< HEAD |
| ![Jira Ticket](images/enemy_jira_ticket.png) | **Jira Ticket** `jira_ticket` | 2 | 18 | Stationary turret: a 4-way burst every 1.7 s, alternating + and × directions. Max 2 per room | Priority: Blocker. Assignee: you. |
| ![Spaghetti Code](images/enemy_spaghetti_code.png) | **Spaghetti Code** `spaghetti_code` | 2 | 14 | Wanders and fires a 3-shot spread every 2.5 s | Nobody knows where it starts. Or ends. |
| ![Race Condition](images/enemy_race_condition.png) | **Race Condition** `race_condition` | 2 | 6 | Always comes in pairs; zigzags erratically and sometimes sprints. Max 4 per room | Sometimes it hits first. Sometimes you do. Sometimes both. |
| ![Deprecation Warning](images/enemy_deprecation_warning.png) | **Deprecation Warning** `deprecation_warning` | 3 | 12 | Flies in circles around you at a distance (160–220 px) and fires an aimed shot every 2.4 s. Max 3 per room | Will be removed in a future release. Not this one. |
| ![Zombie Process](images/enemy_zombie_process.png) | **Zombie Process** `zombie_process` | 3 | 14 | Chases you. When killed, it lies down for 1.8 s and gets back up once with half its HP, angrier | `kill -9` recommended. |
| ![Scope Creep](images/enemy_scope_creep.png) | **Scope Creep** `scope_creep` | 4 | 10 | Slowly grows (up to 1.9× size and 1.6× HP). Once big enough, fires a ring of shots every 3.6 s. Max 2 per room | Just one more small feature. |

### Minions

These are only spawned by other enemies or bosses.

| | Name | Spawned by | HP | Behaviour | Flavour text |
|---|---|---|---|---|---|
| ![Leaklet](images/enemy_leaklet.png) | **Leaklet** `leaklet` | Memory Leak (on death) | 4 | Chases you | A smaller leak. Still not freed. |
| ![Microservice](images/enemy_microservice.png) | **Microservice** `microservice` | The Monolith (phase 2) | 7 | Chases you | One of 47. Nobody knows which one is failing. |
| ![Infinite Loop segment](images/boss_infinite_loop_segment.png) | **Loop segment** `loop_segment` | The Infinite Loop | — | Body segment of the worm; fires outward. Damage goes to the head's HP. Doesn't count for clearing the room | while (true) { suffer(); } |

---

## Bosses

One boss per floor, in the room farthest from the start. **Floor 1:** The Monolith (60 %) or The Stakeholder (40 %).
**Floor 2 and deeper:** Monolith 27 %, Stakeholder 18 %, Friday Deploy 27 %, Infinite Loop 27 %. Every attack has a
visible warning before it fires (glow, "!", target ring). Beating a boss drops an item, a heart and the trapdoor
to the next floor.

| | Name | First floor | HP | Attacks | Phase 2 | Intro subtitle |
|---|---|---|---|---|---|---|
| ![The Monolith](images/boss_monolith.png) | **The Monolith** `monolith` | 1 | 360 | Lumbers toward you. **Stomp:** a ring of 12 shots. **Batch job:** 3 aimed 5-shot fans in a row | Below 50 % HP: splits off Microservice minions, walks faster, stomps twice, fires 4 offset 6-shot fans and adds a **leap** at your position | *Single point of failure since 1998.* |
| ![The Stakeholder](images/boss_stakeholder.png) | **The Stakeholder** `stakeholder` | 1 | 250 | Floats and keeps its distance. **Requirements:** rotating 2-arm spiral for 3 s. **Urgent request:** 3 aimed 5-shot fans | Below 40 % HP ("ACTUALLY…"): clears all shots, then 3-arm spirals that switch direction, 4 wider 7-shot fans, and a **scope change** ring whose shots stop and then re-aim at you. Pacing eased on 2026-10-31 | *Just a quick question.* |
| ![Friday Deploy](images/boss_friday_deploy.png) | **Friday Deploy** `friday_deploy` | 2 | 240 | A burning server rack bouncing around the room like a DVD logo. Every wall hit vents a 5-shot fire fan; a corner hit fires a 16-shot ring. Regularly **rolls back** to the centre with a hotfix ring | Below 50 % HP: faster and hotter (7-shot fans) | *What could go wrong at 16:55?* |
| ![The Infinite Loop](images/boss_infinite_loop.png) | **The Infinite Loop** `infinite_loop` | 2 | 300 | A worm made of ∞ segments. The head circles the room on an ellipse and sometimes hunts you; the segments fire pulses outward. All damage goes to one shared HP pool | Below 50 % HP: the head traces a figure eight instead | *while (true) { suffer(); }* |
