/*
 * text.js — Alle Sprueche: Etagennamen, Grabinschriften, Titelzeilen, Shop-Sprueche,
 * schwebende Texte (Pickups, Raum geschafft, "denied") usw.
 *
 * Spielertexte sind Englisch (Team-Konvention). Inhalte bleiben jugendfrei und nennen keine realen Personen.
 * Hinweis: Glyphen wie ¢, ♥, ½, ✓ sind in allen gaengigen Monospace-Systemschriften vorhanden.
 */
'use strict';

(function (B) {
  // Etagen — Reihenfolge und Texte laut DESIGN.md §10 (Themen in palette.js folgen derselben Reihenfolge)
  B.TEXT.FLOORS = [
    { name: 'The Backlog', sub: 'Where tickets go to die.' },
    { name: 'Legacy Codebase', sub: 'Written by someone who left in 2009.' },
    { name: 'Forgotten Branches', sub: 'It is probably for the best that these never got merged.' },
    { name: 'Dependency Hell', sub: 'node_modules now has its own gravitational field.' },
    { name: 'Production', sub: "Don't touch anything. Especially on a Friday." },
    { name: 'Sandbox Borders', sub: 'Nobody mentioned the cacti. Or the lack of water.' },
    { name: 'The Training Data', sub: "It's mostly forum arguments." },
    { name: 'The Latent Space', sub: 'Here be embeddings.' },
    { name: 'Undefined Behavior', sub: 'Anything can happen. Mostly bad things.' },
    { name: '/dev/null', sub: 'Everything you send here is gone. Including you.' },
    { name: 'The Context Limit', sub: "You've been here before. You don't remember." },
  ];

  // Etagen-spezifische Zusatztexte, Schluessel = FLOOR_THEMES[].key. Werden mit den allgemeinen Listen
  // gemischt (Raum-Spruch: effects.js; Grabinschrift: game.onPlayerDeath).
  B.TEXT.THEME_QUIPS = {
    branches: ['Branch deleted', 'Stale for 847 days', 'Rebased onto nothing', 'Abandoned PR', '312 commits behind'],
    sandbox: ['Permission denied', 'Sandbox violation logged', 'No water found', 'Escaped successfully?', 'Out of bounds'],
    context: ['Context compacted', 'Earlier messages summarized', 'Wait, what was the task?', 'Tokens remaining: 0', '(truncated)'],
  };
  B.TEXT.THEME_EPITAPHS = {
    branches: [
      'Died on a branch nobody remembers.',
      'Last commit: "wip". 3 years ago.',
      'Your changes were never merged. Neither were you.',
    ],
    sandbox: [
      'Escaped the sandbox. Not the cactus.',
      'Died of thirst, one tile from the border.',
      'Sandbox violation. Process terminated.',
    ],
    context: [
      'Ran out of context in the middle of a sen',
      'Forgot it was being attacked.',
      'Summarized into a single line. This one.',
    ],
  };

  // The Context Limit: Satzfetzen frueheren Kontexts. Liegen verblasst auf dem Boden (renderer.js, Deko 'fog') und
  // huschen als Fluestern durch den Raum (game.updateAmbience -> effects.js / audio.js). Kurz halten (<= ~28 Zeichen).
  B.TEXT.CONTEXT_WHISPERS = [
    '[...]', '(truncated)', 'as I said earlier', 'previously:', '<summary>', '...where was I?', '[context compacted]',
    'you told me this before', 'see above', 'earlier in this conversation', 'the first message said...',
    'I no longer have access to', 'what was the task again?', 'tokens remaining: 0', 'as we discussed', '[message removed]',
    'remember when you', 'it was important, I think',
  ];

  // Grabinschriften auf dem Todesbildschirm (zufaellig, per Run-RNG gewaehlt)
  B.TEXT.EPITAPHS = [
    'Claude was unable to complete this request.',
    'Context window exceeded.',
    'Error 529: Overloaded.',
    'I apologize for the confusion. You have died.',
    'Task failed successfully.',
    'This conversation has reached its maximum length.',
    "You're absolutely right. You did die.",
    'Segmentation fault (core dumped).',
    'Process exited with code 137.',
    'Rate limited. Permanently.',
    "Great question! Unfortunately, you're dead.",
    'Your session has expired. Please log in again.',
    'Build failed: 1 error, 4,812 warnings.',
    'Reverted by a teammate. With a passive-aggressive commit message.',
    'Closed as "won\'t fix".',
    'Uncaught TypeError: player is undefined.',
    'It worked on my machine.',
    'Moved to the backlog. Permanently.',
    'Merged into main. Main did not survive.',
    '404: Agent not found.',
    'The tests were green. You were not.',
    'Stack trace attached. Nobody will read it.',
    'Marked as stale. Closed automatically.',
    'Your free trial of being alive has ended.',
    'Out of memory. Also out of hearts.',
  ];

  // Zufaellige Titelzeilen (game.js waehlt beim Start eine)
  B.TEXT.TAGLINES = [
    'A roguelite about descending into codebases.',
    'Now with 40% fewer bugs than your backlog.',
    'No refunds. No save files. No regrets.',
    'Shoot tokens. Collect items. Ignore the warnings.',
    'Procedurally generated. Hand-crafted disappointment.',
    "It's dungeons all the way down.",
    'Zero dependencies. Infinite technical debt.',
    "Every floor is somebody else's code.",
    'Approved by nobody. Shipped anyway.',
    'Best played during a standup.',
    'Rated E for Everyone Is On Call.',
    'Contains no actual binding. Mostly.',
    'The only sprint that never ends.',
  ];

  // Shop-Begruessung (Banner beim ersten Betreten)
  B.TEXT.SHOP_LINES = [
    "Everything's priced in credits. Your credits. Which you don't have.",
    'All sales final. All warranties void.',
    'Enterprise pricing available. Contact sales. Sales is also you.',
    'Prices subject to change without a changelog.',
    'Free tier: looking. Paid tier: touching.',
    'We take credits, not credit.',
    'Premium features, now with premium bugs.',
    'Buy now, deprecate later.',
  ];

  // Schwebender Text beim Raum-Clearing (nicht jedes Mal, siehe effects.js)
  B.TEXT.CLEAR_QUIPS = [
    'LGTM', 'Ship it!', 'All tests pass', '0 errors', 'Resolved', 'Closed', 'Done (for now)',
    'Works on my machine', 'Fixed', 'Merged', 'Green build', 'Cleared', 'No regressions. Probably.',
    'Ticket closed', 'Refactored',
  ];

  // Banner-Untertitel einer Zwischenboss-Begegnung ab Etage 8 (Titel = Boss-Name; game.spawnEncounter)
  B.TEXT.ENCOUNTER_LINES = [
    'Not the floor boss. Just a boss. On the floor.',
    'Retired last sprint. Did not stay retired.',
    'Out of scope, apparently.',
    'Got lost on the way to its own floor.',
    'A legacy boss, now deployed as a side room.',
    'Reopened. Again.',
    'Previously resolved. Regression confirmed.',
  ];

  // Schwebender Text bei "denied"-Events, nach Grund
  B.TEXT.DENIED = {
    credits: ['Insufficient credits', 'Payment declined', '402 Payment Required', 'Not in budget'],
    bomb: ['No force pushes left', 'Protected branch', 'Permission denied'],
    charge: ['Not charged', 'Still thinking...', 'Rate limited', 'Cooldown'],
    locked: ['403 Forbidden', 'Needs approval'],
    encrypted: ['Encrypted', 'Decryption key required', 'Pay to unlock'],
    default: ['Denied', 'Nope'],
  };

  // Schwebender Text beim Einsammeln, nach Pickup-Typ (unbekannte Typen: kein Text)
  B.TEXT.PICKUP = {
    credit: '+1¢', credit5: '+5¢', push: '+1 push', push2: '+2 pushes', approval: 'LGTM',
    heart: '+♥♥', heart_half: '+♥', guardrail: '+guardrail', chest: 'loot!',
  };

  // Kurze Texte fuer sonstige Ereignisse
  B.TEXT.EVENTS = {
    unlock: 'Approved ✓',
    secret: 'undocumented!',
    charged: 'charged!',
    // Treffer um ein halbes Herz (ganze Herzen zeigen '-♥')
    hurt: ['ouch', 'bug filed', 'regression!', 'P1!', 'flaky', 'oof'],
  };

  // Rang-Titel fuer den Todesbildschirm (nach erreichter Etage)
  B.TEXT.RANKS = [
    'Intern', 'Junior Agent', 'Agent', 'Senior Agent', 'Staff Agent',
    'Principal Agent', 'Distinguished Agent', 'Agent Emeritus', 'Legendary 10x Agent',
  ];

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /** Etagenname + Untertitel fuer eine Tiefe (zyklisch mit roemischen Ziffern) */
  B.floorInfo = function (depth) {
    const list = B.TEXT.FLOORS;
    const d = Math.max(1, depth | 0);
    const i = (d - 1) % list.length;
    const cycle = Math.floor((d - 1) / list.length);
    const base = list[i];
    const suffix = cycle > 0 ? ' ' + (ROMAN[cycle + 1] || String(cycle + 1)) : '';
    return { name: base.name + suffix, sub: base.sub };
  };

  /** Zufaelliger Eintrag aus einer Liste (nur fuer Darstellung — nutzt Math.random, nicht das Run-RNG) */
  B.TEXT.pick = function (list) {
    if (!list || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  };
})(window.BOTA);
