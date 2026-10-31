# The Binding of the Agent

A discount Binding-of-Isaac-style roguelite. You are a loose Claude Agent, a small coral-coloured agent descending into
ever-deeper codebases. Shoot tokens at bugs, pick up items of questionable value, die to a Merge Conflict, repeat.

## Play

Basically ripped straight from Binding Of Isaac.

**Double-click `index.html`.** That's it. Any current Chromium, Edge or Firefox works.

| Action | Key |
|---|---|
| Move | `W A S D` |
| Shoot | `↑ ↓ ← →` |
| Force Push (bomb) | `E` |
| Use active item | `Space` |
| Pause / item list (browse with arrows) | `Esc` / `P` |
| Restart run | `R` on the death screen, hold `R` in-game |
| Mute (sound + music) | `M` |

Clear a room to open its doors. Find the treasure room (gold door), the shop (green), the boss (red, with teeth),
and drop through the trapdoor. From floor 2 onwards, treasure and shop doors need an **Approval** (key).
Secret rooms hide behind cracked walls: Force Push them. There is no ending. There is only the next floor.

### What's inside
- **43 items** (38 passive, 5 active). Examples: Blockchain (*"Does absolutely nothing. Market cap: $4B."*),
  Few-Shot Examples, Chain of Thought, Rubber Duck, Technical Debt, Regenerate Response, `rm -rf node_modules`.
- **12 enemies** plus minions: Flaky Test, Merge Conflict, Hallucination (it looks like money), Zombie Process…
- **4 bosses**, each with two phases: The Monolith, The Stakeholder, Friday Deploy, The Infinite Loop.
- **9 themed floors** that cycle forever, from *The Backlog* down to *The Context Limit*. **30 room layouts.**
- All art is ASCII pixel maps in code and all sound is synthesized with Web Audio. There are no asset files.

### URL options
- `index.html?seed=ABCD-1234` plays a fixed seed, so the whole team can compare deaths on the same dungeon.
- `index.html?debug` turns on the debug overlay (or press `F2` in-game). Keys: `G` god mode, `I` random item,
  `K` kill all, `N` next floor, `V` reveal map, `B` boss room, `T` treasure room, `H` resources.
  It's also scriptable via `BOTA.debug.*` in the browser console.
