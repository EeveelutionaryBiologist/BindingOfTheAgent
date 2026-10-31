# The Binding of the Agent

A discount Binding-of-Isaac-style roguelite. You are Claude, a small coral-coloured agent descending into
ever-deeper codebases. Shoot tokens at bugs, pick up items of questionable value, die to a Merge Conflict, repeat.

## Play

**Double-click `index.html`.** That's it: no install, no server, no network. Any current Chromium, Edge or Firefox works.

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

## Project layout

If you're picking this up as a developer or an AI agent, start with **`AGENTS.md`**. It covers the architecture,
contracts, recipes, gotchas and tests.

```
index.html            canvas + script tags (classic scripts so file:// works) + CSP
AGENTS.md             technical handoff for developers/agents (CLAUDE.md imports it)
DESIGN.md             design doc: mechanics, content, architecture, contracts
tools/smoke-test.js   optional headless test (Playwright); see AGENTS.md §2
src/core/             namespace & event bus, seeded RNG, math, input, sprite registry, audio
src/data/             content: items, enemies, bosses, layouts, sprites, palettes, text
src/world/            dungeon generation, rooms (tiles, doors, pathfinding)
src/entities/         player, projectiles & bombs, enemies, bosses, pickups, familiars, effects
src/render/           renderer, HUD, screens
src/game.js           state machine, room/floor transitions, world API
src/main.js           bootstrap & fixed-timestep loop
```

To add an item, add an entry to `src/data/items.js` and an `item_<id>` sprite to `src/data/sprites-items.js`.
The contracts for items, enemies, behaviours and sprites are documented in the file headers and in `DESIGN.md` §11.
Code comments are in German (team convention).

## Security notes
- **Offline by design.** A Content-Security-Policy in `index.html` sets `connect-src 'none'`, so the page cannot make
  fetch, XHR or WebSocket requests. It also disallows inline scripts, plugins and form posts. No CDNs, web fonts or telemetry.
- **No dynamic code.** No `eval`, `new Function`, `innerHTML` or string timers. Everything is drawn to a canvas.
- **Validated input.** URL parameters are read with `URLSearchParams`; the seed must match `[A-Za-z0-9-]{1,32}`.
- **Minimal storage.** `localStorage` holds only mute, best floor and run/death counters, under one key. Reads are
  size-limited, type-checked and fall back to defaults.
- **No privileges.** No personal data, no secrets, no installer, no admin rights needed.
- **Randomness.** The RNG (mulberry32) is for gameplay only and is not cryptographic.
