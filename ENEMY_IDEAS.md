# Enemy ideas (not built yet)

Ideas collected on 2026-11-03 while building the floor families (Stack Trace, Honeypot, Rolling Release, Rate Limiter,
Port Scanner, Dust Daemon, Dry Run) and the late bosses. Nothing here exists in the game yet. Each idea is meant to join
its floor's existing family, so it should reuse that family's look, colours, `family` effects and sounds
(`documents/enemies.md` and AGENTS.md §4 describe them). The usual rules apply: every attack telegraphed, enemy shots at
165–260 px/s, contact damage 1 (2 for charges), and a smoke test for each new behaviour.

## Legacy Codebase (floor 2): beige old hardware, dot-matrix paper, amber warnings

### Deprecated API
A crumbling statue of an old interface, plastered with "DEPRECATED" stickers. It slowly walks toward a doorway and
plants itself there, so you have to deal with it before you can leave easily.
- **Defence:** invulnerable from the front (shots bounce off with a "use v2 instead" mutter); only hits from the
  side or behind count.
- **Attack:** every few seconds it raises a hand (telegraph), then pushes a slow wall of 3 shots straight ahead.
- **Counterplay:** circle around it; bombs work from any side.
- **Notes:** needs a facing direction and a hit-angle check in `takeHit` (like the Rolling Release's per-instance
  wrapper). Don't let it fully block a door the player needs; it should stand in front of one, not in it.

### Goto
A punch card that hops between visible `LABEL:` tiles painted on the floor (2–4 per room, placed like the Port
Scanner's ports) in a fixed order you can learn.
- **Attack:** before each jump, the target label lights up and a dashed line connects old and new spot. On arrival
  it fires a line of shots along that path (the "jump" leaves a trail).
- **Counterplay:** read the order, stand off the line, pre-aim at the next label.
- **Notes:** reuse the Port Scanner's placement code (keeps clear of obstacles, spawn points, centre, door fronts).

## Dependency Hell (floor 4): cardboard boxes, packing peanuts, cyan danger colour

### Peer Dependency
Two crates tied together by a tether. They only take damage while both are within tether range of each other;
pulled apart, the tether glows red and both become invulnerable.
- **Behaviour:** they try to flank the player from opposite sides, which stretches the tether.
- **Counterplay:** pull them together (stand so both chase you from the same side), then burst them down.
- **Notes:** a linked pair like the Detached HEAD; the room clears only when both are dead.

### Lockfile
A padlocked package that seals one door shut (a lock icon on the door) as long as it lives, and lays slow
"version pin" mines on your recent path.
- **Attack:** a pin drops with a short arming blink and explodes in a small radius after ~1.5 s.
- **Counterplay:** keep moving and don't double back over your own trail; kill it to reopen the door.
- **Notes:** the sealed door must only ever be one of several exits (never the only way out); mines must not
  spawn on doors or block a room.

## Production (floor 5): light steel, dark outline, cyan shots, amber warnings

### Hotfix
A welder robot that ignores you and rushes to injured enemies to patch them back to full HP.
- **Telegraph:** a dashed weld beam from Hotfix to its patient for ~1 s before the heal lands (sparks, `servo`).
- **Counterplay:** shoot it during the weld (it stands still and takes extra damage), or kill the patient first.
- **Notes:** never heals bosses; heals at most once per enemy; harmless on its own, so cap it at 1 per room.

### Load Balancer
A hovering set of scales. Shots that hit a pan are caught; it then splits them, sending half back at you.
- **Weak point:** the core in the middle is only exposed while the pans tip (after it catches several shots).
- **Counterplay:** stop shooting the pans, wait for the tip, hit the core.
- **Notes:** reflected shots are enemy shots at a fair speed, with a short glow before they fly back.

## Sandbox Borders (floor 6): dark sprites with strong outlines, brick-red shots (the sand is bright)

### Mirage Oasis
A small pool with palm-frond decoration. Enemies standing in it slowly heal.
- **Interaction:** shooting it makes it boil; after a bubbling telegraph it bursts into a few slow steam shots
  and dries up for a while.
- **Counterplay:** pop it early, from a distance, while nothing is standing in it.
- **Notes:** static, `ignoreForClear` (it's terrain, not a foe); read it against the Hallucination's mirage theme.

## The Training Data (floor 7)

### Overfit
A dummy that memorises your last 3 dodge directions. After a glow, it fires at the spot where repeating those dodges
would put you.
- **Counterplay:** change up your movement; standing still or reversing direction beats it.
- **Notes:** needs a small ring buffer of the player's movement changes; deterministic from that history.

## Gaps

Floor 1 (The Backlog) and floors 8–10 (Latent Space, Undefined, /dev/null) have no themed enemies of their own yet
(/dev/null has Ransomware as its boss). Floor 1 is deliberately plain; the others rely on the cacophony from floor 8 (every family appears
everywhere) but could still get a member or two each later.

## Boss leftovers

Ideas from the Megalith / Shareholder brainstorm that weren't built:
- Coins lying on the floor from "Make it rain" also reflect the Shareholder's monocle beam (only if the plain wall
  bounce turns out too easy; it is harder to read).
- Megalith scroll rows alternating between top and bottom walls in phase 2 (left out because rows starting next to
  the player are unfair; they now always start at the far wall).
