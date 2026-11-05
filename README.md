# The Binding of the Agent

A discount Binding-of-Isaac-style roguelite. You are a loose Claude Agent, a small coral-coloured minion descending into
ever-deeper codebases. Shoot tokens at bugs, pick up items of questionable value, die to a Merge Conflict, repeat.

<img width="1944" height="870" alt="Six screenshots: title screen, a combat room, the Rogue Agent Swarm boss intro, the Antagonistic Reviewer firing its laser, an item showcase, and the post-mortem death screen" src="screenshots/bota-showcase.png" />

## Play

**Double-click `index.html`.** That's it. Any current Chromium, Edge or Firefox works.

Controls are basically ripped straight from Binding Of Isaac.

| Action | Key |
|---|---|
| Move | `W A S D` |
| Shoot | `↑ ↓ ← →` |
| Force Push (bomb) | `E` |
| Use active item | `Space` |
| Pause / item list (browse with arrows) | `Esc` / `P` |
| Restart run | `R` on the death screen, hold `R` in-game |
| Retry the same seed | `T` on the death screen or score card |
| Enter a seed / daily run | `S` / `D` on the title screen |
| Mute (sound + music) | `M` |

Clear a room to open its doors. Find the treasure room (gold door), the shop (green), the boss (red, with teeth),
and drop through the trapdoor. From floor 2 onwards, treasure and shop doors need an **Approval** (key).
Secret rooms hide behind cracked walls: Force Push them. A door marked § leads to a **Terms of Service** room: a free item
for one heart and whatever the contract says. Read it. There is no ending. After the last floor you get your Final
Score and a choice: start over, or keep going with everything you have. There is only the next floor.

### What's inside
- **55 items** (50 passive, 5 active). Examples: Blockchain (*"Does absolutely nothing. Market cap: $4B."*),
  Few-Shot Examples, Chain of Thought, Rubber Duck, Technical Debt, Regenerate Response, `rm -rf node_modules`.
- **36 enemies** plus minions: Flaky Test, Merge Conflict, Graphics Glitch, Hallucination (it looks like loot), Zombie Process, Rogue Agent…
  Forgotten Branches has its own family (Stale Branch, Detached HEAD, Cherry-Pick, Orphan Commit), and so do Sandbox
  Borders (Spinlock, Rootkit, Dust Daemon), Legacy Codebase (Stack Trace), Dependency Hell (Honeypot, Rolling Release),
  Production (Rate Limiter, Port Scanner), The Training Data (Dry Run) and The Context Limit (Overflow Buffer,
  Summarizer, Lost in the Middle). The Latent Space, Undefined Behavior and /dev/null each have one of their own
  (Cosine Similarity, Heisenbug, Bit Bucket).
- **13 bosses** with distinct phases: The Monolith, The Stakeholder, Friday Deploy (floors 4–7), The Infinite Loop, the Rogue Agent
  Swarm, The Antagonistic Reviewer and The Memory Hog (both floors 4–9) and the Octopus Merge (only on Forgotten Branches). Deeper down, four of them are
  replaced by bigger versions: The Megalith, The Shareholder and the Agent Swarm (/xhigh) from floor 7, the Nested Infinite Loop from floor 8. Ransomware joins from floor 8 and is most at home on /dev/null.
- **11 themed floors** that cycle forever, from *The Backlog* through *Forgotten Branches* and the cactus-lined *Sandbox Borders* down to *The Context Limit*. **30 room layouts.**
- All art is ASCII pixel maps in code and all sound is synthesized with Web Audio. There are no asset files.

**For a documentation of all Enemies and items, see the documents/ folder!**

### Seeds
Press `S` on the title screen to type or paste a seed, so the whole team can compare deaths on the same dungeon. `D` starts
the **daily run**: the same seed for everyone today, and your best score for the day is kept on this machine. When you die,
your last few events are listed on the post-mortem.

### URL options
- `index.html?seed=ABCD-1234` plays a fixed seed.
- `index.html?debug` turns on the debug overlay (or press `F2` in-game). Keys: `G` god mode, `I` random item,
  `K` kill all, `N` next floor, `V` reveal map, `B` boss room, `T` treasure room, `H` resources.
  It's also scriptable via `BOTA.debug.*` in the browser console.
