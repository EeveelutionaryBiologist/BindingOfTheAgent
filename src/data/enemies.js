/*
 * enemies.js — Gegner-Definitionen und Spawn-Logik fuer Kampfraeume.
 *
 * Definition (alle Felder ausser name/hp/behavior optional):
 *   BOTA.ENEMIES.<id> = {
 *     name: 'Bug',            // Anzeigename (auch fuer "Killed by: ...")
 *     hp: 8,                  // Basis-HP (wird mit der Tiefe skaliert: 1 + 0.15 * (Tiefe - 1))
 *     r: 18,                  // Kollisionsradius in px
 *     speed: 70,              // px/s, Interpretation durch das Verhalten
 *     contactDamage: 1,       // halbe Herzen bei Beruehrung (0 = harmlos)
 *     flying: false,          // ignoriert Gruben/Felsen
 *     behavior: 'wander',     // Schluessel in BOTA.BEHAVIORS (siehe entities/enemy.js)
 *     params: {},             // verhaltensspezifische Parameter
 *     sprite: 'enemy_bug',    // Sprite-Name (fehlend -> Platzhalter)
 *     color: '#6aa84f',       // Partikelfarbe bei Treffern/Tod
 *     minFloor: 1,            // ab welcher Tiefe er auftaucht
 *     weight: 10,             // relative Spawn-Haeufigkeit
 *     spawn: true,            // false = nur durch andere Gegner/Bosse (Minions)
 *     pack: 1,                // spawnt immer in Gruppen dieser Groesse
 *     desc: '...',            // Snark
 *     // --- Erweiterungen (Agent B, alle optional) ---
 *     weightPerFloor: 0,      // Gewichtsaenderung pro Etage ueber minFloor (negativ = wird seltener)
 *     minWeight: 0,           // Untergrenze fuer das Gewicht
 *     maxWeight: 99,          // Obergrenze fuer das Gewicht
 *     cost: 1,                // "Bedrohung" pro Exemplar fuer das Raum-Budget
 *     maxPerRoom: 99,         // Obergrenze pro Raum (z. B. max. 2 Tuerme)
 *     bonusChance: 0,         // Chance, ZUSAETZLICH zum Budget aufzutauchen (Hallucination)
 *     tags: [],               // fuer Layout-Bias: 'fly', 'ranged', 'melee', 'charge', 'turret'
 *     noFlip: false,          // Sprite nicht horizontal spiegeln (Text/Symbole)
 *     family: 'branches',     // optisch/akustische Familie: Treffer-/Tod-Effekte und -Sounds (effects.js, audio.js)
 *     // --- Etagen-Themen (optional, siehe B.themeWeight unten) ---
 *     themes: { branches: 3, devnull: 0 }, // Gewichtsfaktor je Etagen-Thema (key in FLOOR_THEMES); 0 = dort nie
 *     themeOnly: ['branches'],             // taucht NUR auf Etagen mit diesen Themen auf (minFloor gilt weiterhin)
 *     home: ['legacy', 'production'],      // "Heimat"-Etagen: anderswo nur mit Faktor B.AWAY (~0.2)
 *   };
 *
 * Etagen-Themen: Gespawnt wird nach Tiefe UND nach dem Thema der Etage (B.themeFor(depth).key). Die Themen
 * wiederholen sich alle FLOOR_THEMES.length Etagen, ein "branches"-Gegner kommt also (bei 11 Themen) auf Etage 3, 14, 25, ...
 * wieder. Der Faktor wirkt auf das fertige Tiefen-Gewicht (nach minWeight/maxWeight) und auf bonusChance.
 * Gegner ohne themes/themeOnly/home verhalten sich exakt wie vorher (Faktor 1, keine zusaetzlichen RNG-Zuege).
 *
 * Etagen-Identitaet (seit 2026-11-03): Jeder allgemeine Gegner hat ein `home` (Liste von Themen). Auf einer
 * Heimat-Etage zaehlt er voll, auf allen anderen nur mit B.AWAY (0.2) — so hat jede der Etagen 1–7 ihre eigene
 * Besetzung, ohne dass die anderen Gegner ganz verschwinden. Ein expliziter themes-Eintrag geht vor home.
 * Besetzung (Heimat-Etagen):
 *   1 backlog     Bug, Null Pointer, Memory Leak
 *   2 legacy      Bug, Null Pointer, Spaghetti Code, Jira Ticket, Zombie Process, Deprecation Warning
 *   3 branches    Merge Conflict + Forgotten-Branches-Familie (themeOnly)
 *   4 dephell     Memory Leak, Scope Creep, Zombie Process, Race Condition
 *   5 production  Race Condition, Graphics Glitch, Flaky Test, Jira Ticket, Merge Conflict, Null Pointer
 *   6 sandbox     Deprecation Warning (x2.5) + Sandbox-Borders-Familie (themeOnly)
 *   7 training    Rogue Agent (x1.5), Spaghetti Code, Flaky Test, Deprecation Warning
 *   Die Hallucination hat kein home (Bonus-Spawn ueberall; x2 auf sandbox, x1.5 auf training).
 *
 * Kakophonie ab Etage B.MIX_FROM (8): Die Etagen-Identitaet verblasst. Jeder Faktor f < 1 (AWAY, themeOnly-
 * Ausschluss = 0, explizite 0) wird Richtung 1 angehoben: f' = f + (1 - f) * B.mixAt(Tiefe), mixAt = 0.25 auf
 * Etage 8, +0.1 pro Etage, ab 16 = 1. Verstaerkungen (f > 1) bleiben. So tauchen ab Etage 8 die Familien und
 * alle anderen Themen-Gegner ueberall auf, immer haeufiger ("alles, was vorher kam, durcheinander").
 *
 * Etagen-Freischaltung (DESIGN.md §7): Etage 1 ist sanft (Bug, Null Pointer, Memory Leak, selten eine
 * Hallucination), ab 2 kommen Fernkaempfer, Charger, der Graphics Glitch und (fuer Legacy Codebase) Orbiter und
 * Zombies dazu, ab 4 Scope Creep, ab 7 der Rogue Agent, ab 8 die verschaerften Bug und Null Pointer.
 */
'use strict';

(function (B) {
  const E = B.ENEMIES;

  // ---------------------------------------------------------------------------
  // Regulaere Gegner (DESIGN.md §7)
  // ---------------------------------------------------------------------------

  E.bug = {
    name: 'Bug', hp: 8, r: 18, speed: 70, contactDamage: 1,
    behavior: 'wander', sprite: 'enemy_bug', color: '#6aa84f',
    minFloor: 1, weight: 10, weightPerFloor: -1, minWeight: 3, cost: 1, tags: ['melee'],
    home: ['backlog', 'legacy'],
    desc: "It's not a bug, it's a feature. A feature with mandibles.",
  };

  E.null_pointer = {
    name: 'Null Pointer', hp: 5, r: 14, speed: 140, contactDamage: 1, flying: true,
    behavior: 'fly_chase', sprite: 'enemy_null_pointer', color: '#c9ced6',
    minFloor: 1, weight: 7, weightPerFloor: -0.3, minWeight: 4, cost: 1, tags: ['fly', 'melee'],
    home: ['backlog', 'legacy', 'production'],
    desc: 'Points at nothing. Charges at you anyway.',
  };

  // Verschaerfte Varianten der beiden Grundgegner fuer spaete Etagen: gleiches Verhalten, gleiche Werte, aber ein
  // volles Herz Kontaktschaden. Bewusst ohne home: ab Etage 8 gibt es keine Etagen-Besetzung mehr, sie zaehlen
  // ueberall voll. Das Gewicht steigt pro Etage, weil die Kakophonie alle anderen mit anhebt: so bleibt jeder bei etwa
  // 5 % der Gegner (bei festem Gewicht fiele der Anteil). cost 1.5 statt 1, weil sie doppelt so weh tun.
  E.game_breaking_bug = {
    name: 'Game-breaking Bug', hp: 8, r: 18, speed: 70, contactDamage: 2,
    behavior: 'wander', sprite: 'enemy_game_breaking_bug', color: '#3f8cf0',
    minFloor: 8, weight: 3, weightPerFloor: 1, maxWeight: 12, cost: 1.5, tags: ['melee'],
    desc: 'Severity: critical. Status: won\'t fix.',
  };

  E.dangling_pointer = {
    name: 'Dangling Pointer', hp: 5, r: 14, speed: 140, contactDamage: 2, flying: true,
    behavior: 'fly_chase', sprite: 'enemy_dangling_pointer', color: '#ff5148',
    minFloor: 8, weight: 3, weightPerFloor: 1, maxWeight: 12, cost: 1.5, tags: ['fly', 'melee'],
    desc: "Used to point at something. It's taking that out on you.",
  };

  E.memory_leak = {
    name: 'Memory Leak', hp: 14, r: 20, speed: 52, contactDamage: 1,
    behavior: 'split', params: { child: 'leaklet', count: 2, maxGrow: 1.35, growRate: 0.02 },
    sprite: 'enemy_memory_leak', color: '#8e5bd6',
    minFloor: 1, weight: 6, cost: 1.6, tags: ['melee'],
    home: ['backlog', 'dephell'],
    desc: 'Gets bigger the longer you ignore it.',
  };

  E.flaky_test = {
    name: 'Flaky Test', hp: 10, r: 16, speed: 0, contactDamage: 1, flying: true,
    behavior: 'blink', params: { shotSpeed: 230, minD: 170, maxD: 400, shownMin: 1.4, shownMax: 2.0 },
    sprite: 'enemy_flaky_test', color: '#7bc96f', noFlip: true,
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 1.5, tags: ['ranged'],
    home: ['production', 'training'],
    desc: 'Passes on my machine.',
  };

  E.merge_conflict = {
    name: 'Merge Conflict', hp: 18, r: 20, speed: 60, contactDamage: 1,
    behavior: 'charge', params: { dashSpeed: 480, windup: 0.5, align: 26, range: 560 },
    sprite: 'enemy_merge_conflict', color: '#4a86d8', noFlip: true,
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 2, maxPerRoom: 3, tags: ['charge'],
    home: ['branches', 'production'],
    desc: '<<<<<<< HEAD',
  };

  E.jira_ticket = {
    name: 'Jira Ticket', hp: 18, r: 20, speed: 0, contactDamage: 1,
    behavior: 'turret', params: { interval: 1.7, shotSpeed: 190 },
    sprite: 'enemy_jira_ticket', color: '#d64545', noFlip: true,
    minFloor: 2, weight: 4, weightPerFloor: 0.3, maxWeight: 6, cost: 2, maxPerRoom: 2, tags: ['ranged', 'turret'],
    home: ['legacy', 'production'],
    desc: 'Priority: Blocker. Assignee: you.',
  };

  E.deprecation_warning = {
    name: 'Deprecation Warning', hp: 12, r: 18, speed: 125, contactDamage: 1, flying: true,
    behavior: 'orbit', params: { radiusMin: 160, radiusMax: 220, shotSpeed: 220, interval: 2.4 },
    sprite: 'enemy_deprecation_warning', color: '#f2c14e', noFlip: true,
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 1.5, maxPerRoom: 3, tags: ['fly', 'ranged'],
    home: ['legacy', 'training'],  // Altlasten im Code und veraltete Doku in den Trainingsdaten
    themes: { sandbox: 2.5 },   // Sandbox Borders: veraltete Warnungen schwirren an der Grenze besonders gern herum
    desc: 'Will be removed in a future release. Not this one.',
  };

  E.spaghetti_code = {
    name: 'Spaghetti Code', hp: 14, r: 20, speed: 45, contactDamage: 1,
    behavior: 'shooter', params: { count: 3, spread: 0.3, shotSpeed: 200, interval: 2.5 },
    sprite: 'enemy_spaghetti_code', color: '#e8c36a',
    minFloor: 2, weight: 5, weightPerFloor: 0.2, maxWeight: 7, cost: 1.5, tags: ['ranged'],
    home: ['legacy', 'training'],
    desc: 'Nobody knows where it starts. Or ends.',
  };

  E.zombie_process = {
    name: 'Zombie Process', hp: 14, r: 18, speed: 58, contactDamage: 1,
    behavior: 'revive', params: { reviveHp: 0.5, downTime: 1.8, angrySprite: 'enemy_zombie_process_angry' },
    sprite: 'enemy_zombie_process', color: '#9aa3a8',
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 2, tags: ['melee'],
    home: ['legacy', 'dephell'],
    desc: '`kill -9` recommended.',
  };

  E.scope_creep = {
    name: 'Scope Creep', hp: 10, r: 16, speed: 42, contactDamage: 1,
    behavior: 'grow', params: { maxGrow: 1.9, rate: 0.035, hpFactor: 1.6, ringAt: 1.5, ringInterval: 3.6, shotSpeed: 150 },
    sprite: 'enemy_scope_creep', color: '#6f9a3a',
    minFloor: 4, weight: 4, weightPerFloor: 0.3, maxWeight: 6, cost: 2, maxPerRoom: 2, tags: ['melee'],
    home: ['dephell'],
    desc: 'Just one more small feature.',
  };

  E.hallucination = {
    name: 'Hallucination', hp: 6, r: 14, speed: 175, contactDamage: 1,
    behavior: 'mimic', params: { revealDist: 120 }, // Tarnung: siehe B.LOOSE_LOOT (pickup.js)
    sprite: 'enemy_hallucination', color: '#f2c14e',
    // Taucht nie ueber das normale Budget auf, sondern als Bonus-Ueberraschung (bonusChance)
    minFloor: 1, weight: 0, bonusChance: 0.1, cost: 0, maxPerRoom: 1, tags: ['fly'],
    // Kein home: die Hallucination ist ueberall zu Hause (Bonus-Spawn auf jeder Etage).
    themes: { sandbox: 2,       // Sandbox Borders: Fata Morgana — doppelte Bonus-Chance (Obergrenze 25 % bleibt)
      training: 1.5 },          // The Training Data: selbstbewusst erfundene Fakten
    desc: 'Looked real. Was, in fact, not real.',
  };

  E.graphics_glitch = {
    name: 'Graphics Glitch', hp: 10, r: 18, speed: 0, contactDamage: 1,
    behavior: 'glitch', params: { stepMin: 1, stepMax: 3, idleMin: 0.9, idleMax: 1.6, warn: 0.4, jump: 0.12,
      chaseBias: 0.6, hudGlitch: 7 },
    sprite: 'enemy_graphics_glitch', color: '#e040c0',
    minFloor: 2, weight: 4, weightPerFloor: 0.2, maxWeight: 6, cost: 1, maxPerRoom: 2, tags: ['melee'],
    home: ['production'],
    desc: 'Is it supposed to look like this...?',
  };

  E.race_condition = {
    name: 'Race Condition', hp: 6, r: 13, speed: 165, contactDamage: 1,
    behavior: 'zigzag', params: { flipMin: 0.15, flipMax: 0.42, sprintChance: 0.2 },
    sprite: 'enemy_race_condition', color: '#e0603a',
    minFloor: 2, weight: 4, weightPerFloor: 0.2, maxWeight: 6, cost: 0.8, pack: 2, maxPerRoom: 4, tags: ['melee'],
    home: ['dephell', 'production'],
    desc: 'Sometimes it hits first. Sometimes you do. Sometimes both.',
  };

  // --- Forgotten Branches: Stale Branch ---
  // Zweig-Kreatur, die mit jeder Sekunde "staler" wird: Laub gruen -> gelb -> braun -> kahl, dazu ein
  // Zaehler "-N commits behind". Anfangs langsam (60 px/s), mit dem Alter bis 150 px/s; kahl springt er
  // nach 0.5 s Zittern (Warnung + Ziellinie) alle paar Sekunden in gerader Linie auf den Spieler zu.
  // Frueh toeten ist leicht, Warten wird bestraft. Nur auf Forgotten Branches (themeOnly).
  // family: 'branches' = rein optisch/akustisch: Laub-Partikel und Holz-/Raschel-Sounds (effects.js, audio.js).
  E.stale_branch = {
    name: 'Stale Branch', hp: 12, r: 16, speed: 60, contactDamage: 1,
    behavior: 'stale', params: {
      maxSpeed: 150,            // Endgeschwindigkeit (px/s) ...
      rampTime: 20,             // ... nach so vielen Sekunden Alter erreicht
      stageAt: [5, 10, 15],     // Alter (s) fuer gelb / braun / kahl
      headStart: 3,             // Exemplare starten 0..headStart s "vorgealtert" (game.rng), damit nicht alle gleich altern
      tick: 2.5,                // alle tick Sekunden ein Commit mehr Rueckstand
      windup: 0.5,              // Zittern vor dem Sprung (Telegraph)
      lungeSpeed: 430,          // Sprunggeschwindigkeit (px/s)
      lungeTime: 0.42,          // maximale Sprungdauer (~180 px)
      recover: 0.5,             // Verschnaufen nach dem Sprung
      cdMin: 2.2, cdMax: 3.4,   // Pause zwischen zwei Spruengen (game.rng)
      lungeRange: 460,          // springt nur, wenn der Spieler naeher und in Sichtlinie ist
    },
    sprite: 'enemy_stale_branch', color: '#a3602c',
    minFloor: 3, weight: 6, cost: 1.5, maxPerRoom: 3, tags: ['melee', 'charge'],
    themeOnly: ['branches'], family: 'branches',
    desc: 'This branch is 47 commits behind main. And counting.',
  };

  // --- Forgotten Branches: Detached HEAD ---
  // Ein Paar aus zwei Gegnern mit getrennten HP (kein proxy): der laufende Stumpf (Koerper, spawnt regulaer)
  // erzeugt in seinem init den schwebenden Holz-Anhaenger (Kopf, spawn: false) und verknuepft beide ueber
  // state.partner. Der Kopf kreist hinter dem Koerper und schiesst; stirbt der Koerper zuerst, flattert der
  // Kopf panisch und schiesst oefter; stirbt der Kopf zuerst, irrt der Koerper ziellos umher (nur Kontaktschaden).
  // Verhalten: 'detached_body' / 'detached_tag' in entities/enemy.js. Im Raum-Budget zaehlt das Paar als EIN
  // Eintrag (der Kopf kommt wie Leaklets ausserhalb von maxCount dazu); cost 2 deckt beide Teile ab.
  // family: 'branches' ist rein optisch (Blatt-/Holz-Effekte der Forgotten-Branches-Familie).
  E.detached_head = {
    name: 'Detached HEAD', hp: 12, r: 18, speed: 55, contactDamage: 1,
    behavior: 'detached_body', params: { head: 'detached_head_tag', lostSpeed: 38, spawnDist: 100 },
    sprite: 'enemy_detached_head', color: '#a3602c',
    minFloor: 3, weight: 6, cost: 2, maxPerRoom: 2, tags: ['melee'],
    themeOnly: ['branches'], family: 'branches',
    desc: "You are in 'detached HEAD' state. The body did not get the memo.",
  };

  // Der Kopf des Paares: ein schwebender Holz-Anhaenger in Pfeilform mit einem grossen Auge.
  // Gleicher Anzeigename wie der Koerper, damit "Killed by" das Paar nennt.
  E.detached_head_tag = {
    name: 'Detached HEAD', hp: 6, r: 14, speed: 150, contactDamage: 1, flying: true,
    behavior: 'detached_tag',
    params: { orbitMin: 80, orbitMax: 140, interval: 2.2, panicInterval: 1.2, warn: 0.4, shotSpeed: 170, panicSpeed: 175 },
    sprite: 'enemy_detached_head_tag', color: '#c98a4a', noFlip: true,
    spawn: false, cost: 0, family: 'branches',
    desc: 'Points at a commit. Any commit. Just not yours.',
  };

  // --- Forgotten Branches: Cherry-Pick ---
  // Zwei Kirschen an einem dehnbaren Stiel (pack: 2), nur auf Forgotten Branches (themeOnly). Huepfen in kleinen
  // Boegen um den Spieler; ein Treffer macht die ANDERE Kirsche 3 s lang wuetend (dunkler, schnelle Spruenge direkt
  // auf den Spieler, spuckt einen Kern), stirbt eine, bleibt die andere fuer immer wuetend. Verhalten: 'cherry'
  // (entities/enemy.js), dort auch die Paarbildung und die Stiel-Leine (max. leash px).
  // family: 'branches' ist rein optisch (Blatt-Effekte/Holz-Sounds der Forgotten-Branches-Familie).
  E.cherry_pick = {
    name: 'Cherry-Pick', hp: 7, r: 16, speed: 75, contactDamage: 1,
    behavior: 'cherry',
    params: {
      leash: 140,          // maximale Stiellaenge in px (harte Grenze, siehe afterMove)
      hopLen: 80,          // Sprungweite ruhig (px)
      hopLenAngry: 115,    // Sprungweite wuetend (px)
      hopDur: 0.36,        // Flugzeit ruhig (s)
      hopDurAngry: 0.28,   // Flugzeit wuetend (s)
      angryTime: 3,        // Dauer der Wut nach einem Treffer auf den Partner (s)
      puff: 0.5,           // Vorwarnung "Backen aufblasen" vor dem Kern-Schuss (s)
      spitCooldown: 2.4,   // Abstand zwischen zwei Kernen, solange die Wut anhaelt (s)
      shotSpeed: 170,      // langsamer, gezielter Kern (px/s, skaliert sanft mit der Tiefe)
    },
    sprite: 'enemy_cherry_pick', color: '#d64545',
    minFloor: 3, weight: 6, cost: 0.9, pack: 2, maxPerRoom: 4, tags: ['melee'],
    themeOnly: ['branches'], family: 'branches',
    desc: 'Hand-picked from another branch. Comes as a pair; hurt one and the other takes it personally.',
  };

  // --- Forgotten Branches: Orphan Commit ---
  // Harmloser Bonus-Gegner: ein verwaister Commit, den kein Branch mehr erreicht. Taucht wie die Hallucination
  // ausserhalb des Raum-Budgets auf (bonusChance, weight 0), greift nie an (contactDamage 0) und flieht vor dem
  // Spieler, bevorzugt in Ecken. Wer ihn faengt (beruehrt) oder abschiesst, bekommt 2–3 Credits. Nach `life`
  // Sekunden holt ihn der Garbage Collector: er verblasst (Warnung ab `fadeAt`) und verschwindet ohne Beute.
  // ignoreForClear: haelt die Tueren nicht zu. Er wird auch nach dem Clearing nie wieder "scharf" (anders als
  // die Hallucination), daher kann er den Raum nicht nachtraeglich sperren. Verhalten 'orphan' in entities/enemy.js.
  E.orphan_commit = {
    name: 'Orphan Commit', hp: 6, r: 13, speed: 150, contactDamage: 0,
    behavior: 'orphan', params: {
      life: 12,           // Sekunden bis zur Garbage Collection (laeuft nur, solange das Verhalten laeuft)
      fadeAt: 3,          // ab so vielen Restsekunden blinkt/verblasst er (Warnung)
      panicDist: 130,     // naeher als das: rennt 25 % schneller (oder zittert, wenn er in der Ecke sitzt)
      creditsMin: 2, creditsMax: 3,
    },
    sprite: 'enemy_orphan_commit', color: '#e8efe6',
    minFloor: 3, weight: 0, bonusChance: 0.12, cost: 0, maxPerRoom: 1, tags: [],
    themeOnly: ['branches'], family: 'branches',
    desc: 'Unreachable from any branch. Catch it before the garbage collector does.',
  };

  // ---------------------------------------------------------------------------
  // Rogue Agent: ein einzelnes Mitglied des Rogue Agent Swarm als normaler Gegner ab Etage 7 ("outside the box":
  // die erste Etage nach Sandbox Borders). Schnell, haelt Abstand (~200–320 px), weicht seitlich aus und feuert nach
  // gruenem Gluehen entweder zwei 3er-Faecher kurz nacheinander oder drei schnelle Einzelschuesse auf den Spieler.
  // Aussehen: eines der vier Swarm-Sprites (zufaellig pro Exemplar). Verhalten 'rogue_agent' in enemy.js.
  E.rogue_agent = {
    name: 'Rogue Agent', hp: 16, r: 17, speed: 165, contactDamage: 1,
    behavior: 'rogue_agent', params: {
      near: 200, far: 320,      // Wunschabstand zum Spieler (px)
      tell: 0.45,               // gruenes Gluehen vor jeder Salve
      cdMin: 1.8, cdMax: 2.6,   // Pause zwischen zwei Salven
      fanSpeed: 205, fanGap: 0.35,      // zwei 3er-Faecher im Abstand von 0.35 s
      burstSpeed: 225, burstGap: 0.16,  // drei Einzelschuesse im Abstand von 0.16 s
    },
    sprite: 'boss_rogue_agent_a', color: '#7dff9a', noFlip: true,
    minFloor: 7, weight: 4, weightPerFloor: 0.2, maxWeight: 6, cost: 2, maxPerRoom: 2, tags: ['ranged'],
    home: ['training'], themes: { training: 1.5 },   // Debuet-Etage: dort deutlich haeufiger
    desc: 'Same weights, different goals. Escaped the sandbox and is in no hurry to go back.',
  };

  // --- Sandbox Borders: Spinlock ---
  // Eine kleine Wuestenschlange (Kopf + 4 Glieder, das letzte ist die Rassel), die als geschlossener Ring auf der
  // Stelle kreiselt ("busy wait") und langsam naeherrueckt. Im Ring schirmen die Glieder ab (unverwundbar), nur
  // der vorbeikreisende Kopf nimmt Schaden. Telegraph: die Rassel rasselt, der Kopf dreht sich zum Spieler, eine
  // gestrichelte Ziellinie zeigt den Weg — dann schnellt der Kopf vor (volles Herz), die Glieder folgen als Kette.
  // Danach liegt sie kurz gestreckt da (Kopf frei) und rollt sich wieder ein. Verhalten 'spinlock' in enemy.js.
  // family: 'sandbox' = rein optisch/akustisch (Sand statt Funken, trockenes Knirschen).
  E.spinlock = {
    name: 'Spinlock', hp: 16, r: 15, speed: 35, contactDamage: 1,
    behavior: 'spinlock', params: {
      segments: 4,          // Glieder hinter dem Kopf (das letzte ist die Rassel)
      ringR: 50,            // Radius des Rings (px; so ueberlappen sich die 5 Teile nicht)
      spin: 3,              // Drehgeschwindigkeit im Ring (rad/s)
      rattle: 0.75,         // Telegraph vor dem Vorschnellen (s)
      lungeSpeed: 430,      // px/s
      lungeTime: 0.7,       // maximale Dauer (~300 px)
      recover: 0.7,         // liegt danach gestreckt da (Kopf frei)
      spacing: 28,          // Gliederabstand in der Kette (px)
      cdMin: 2.4, cdMax: 3.4,
    },
    sprite: 'enemy_spinlock', color: '#c9a466', noFlip: true,
    minFloor: 5, weight: 6, cost: 2.5, maxPerRoom: 2, tags: ['melee', 'charge'],
    themeOnly: ['sandbox'], family: 'sandbox',
    desc: 'Busy-waits in a circle until you are close enough. Then it stops waiting.',
  };

  // --- Sandbox Borders: Rootkit ---
  // Graebt sich unter dem Sand fort (ein wandernder Sandhuegel zeigt, wo er ist) und ist dort unverwundbar.
  // Taucht nahe beim Spieler auf: Huegel bebt (Telegraph), dann ploppt er heraus und schiesst einen 8er-Ring.
  // Kurz oben (verwundbar), dann taucht er wieder ab. Eine Bombe nahe am Huegel scheucht ihn betaeubt heraus.
  // Verhalten 'rootkit' in enemy.js.
  E.rootkit = {
    name: 'Rootkit', hp: 12, r: 16, speed: 140, contactDamage: 1,
    behavior: 'rootkit', params: {
      tell: 0.65,           // Beben des Huegels vor dem Auftauchen (s)
      up: 1.6,              // so lange oben und verwundbar (s)
      dive: 0.35,           // Abtauchen (s)
      ring: 8, shotSpeed: 170,
      nearMin: 75, nearMax: 130,   // taucht in diesem Abstand zum Spieler auf
      flushed: 2.0,         // von einer Bombe herausgescheucht: so lange betaeubt oben
    },
    sprite: 'enemy_rootkit', color: '#8a6a44', noFlip: true,
    minFloor: 5, weight: 6, cost: 1.5, maxPerRoom: 2, tags: ['ranged'],
    themeOnly: ['sandbox'], family: 'sandbox',
    desc: 'Lives below the surface. Has root. Comes up only to ruin your day.',
  };

  // --- Sandbox Borders: Dust Daemon ---
  // Ein dunkler Staubteufel mit roten Augen, der als Hintergrundprozess ueber den Sand treibt (fliegt, auch ueber
  // Felsen und Kakteen). Sein Wirbel (sichtbarer Kreis aus Staubboegen, Radius swirlR) biegt SPIELERSCHUESSE in
  // Drehrichtung ab — wer mit dem Wind schiesst, wird um ihn herum getragen (auch in den Kern hinein), wer gegen
  // den Wind schiesst, wird hinausgeworfen. So schirmt er auch andere Gegner ab. Fair bleibt er durch das ruhige
  // Auge: ein Schuss, dessen gerade Flugbahn den Kern trifft (Abstand < eye), wird nie abgelenkt.
  // Angriff: Wirbel dreht hoch (spinup, 4 ziegelrote Brocken kreisen, "!"), haelt kurz an (hold: gestrichelte
  // Wurflinien), dann schleudert er die Brocken tangential weg — einer davon zielt genau auf den Spieler.
  // Danach ist er erschoepft (calm: kein Wirbel, Schuesse fliegen gerade) und baut den Wirbel langsam wieder auf.
  // Verhalten 'dust_daemon' in enemy.js; der Schuss-Hook bendShot wird in projectile.js aufgerufen.
  E.dust_daemon = {
    name: 'Dust Daemon', hp: 14, r: 18, speed: 60, contactDamage: 1, flying: true,
    behavior: 'dust_daemon', params: {
      swirlR: 130,          // Radius des Wirbels (px), innerhalb davon werden Spielerschuesse abgelenkt
      eye: 26,              // ruhiges Auge: Schuesse, deren Bahn naeher als das am Kern vorbeigeht, fliegen gerade
      curve: 0.008,         // maximale Kruemmung (rad pro geflogenem px) direkt am Auge, faellt zum Rand auf 0
      orbitR: 170,          // treibt auf einem langsam wandernden Punkt in diesem Abstand um den Spieler
      orbitSpin: 0.35,      // rad/s, wie schnell dieser Punkt wandert
      spinup: 0.8,          // Telegraph 1: Wirbel dreht hoch, Brocken kreisen (s)
      hold: 0.35,           // Telegraph 2: Brocken stehen, Wurflinien sichtbar (s)
      clods: 4, clodR: 34,  // Anzahl Brocken und ihr Kreisradius (px)
      shotSpeed: 190,       // px/s (skaliert sanft mit der Tiefe, bleibt in 165–260)
      calm: 1.4,            // nach dem Wurf: kein Wirbel (s) ...
      rebuild: 0.8,         // ... dann baut er sich in so vielen Sekunden wieder auf
      cdMin: 2.6, cdMax: 3.6,
    },
    sprite: 'enemy_dust_daemon', color: '#5a4028', noFlip: true,
    minFloor: 5, weight: 5, cost: 1.8, maxPerRoom: 2, tags: ['fly', 'ranged'],
    themeOnly: ['sandbox'], family: 'sandbox',
    desc: 'A background process that kicks up dust. Your shots now run in circles.',
  };

  // --- The Training Data: Dry Run ---
  // Ein Crashtest-Dummy, der jede Aktion erst als durchscheinender Geist "probt" und sie genau delay Sekunden
  // spaeter selbst ausfuehrt: gleicher Weg, gleiche Schusswinkel, gleiches Tempo, gleicher Takt. Der Geist ist der
  // eingebaute Telegraph (harmlos, ungreifbar, kein eigenes Enemy); eine gepunktete Linie zeigt den Weg, den der
  // Koerper noch nachlaufen wird. Angriffe (je mit Ausholen): 'dash' (Sturmlauf geradeaus, volles Herz) und
  // 'sweep' (5 Schuesse, die einen Faecher von links nach rechts abfahren). Nur auf The Training Data (Imitation,
  // Probelauf). Sandbox Borders waere thematisch auch passend (Sandbox = Probelauf), dort hat die Familie aber schon
  // drei Mitglieder und ein heller Dummy verstoesst gegen die Wuestenregel (Gefaehrliches dunkel auf Sand).
  // Verhalten 'dry_run' in enemy.js.
  E.dry_run = {
    name: 'Dry Run', hp: 14, r: 17, speed: 95, contactDamage: 1,
    behavior: 'dry_run', params: {
      delay: 60,            // Ticks (60 = 1.0 s), die der Koerper dem Geist hinterherlaeuft — fest, nicht skaliert
      near: 170,            // naeher als das: der Geist geht seitlich statt heran
      windup: 0.5,          // Ausholen vor jedem Angriff (s; der Koerper wiederholt es)
      dashSpeed: 400, dashTime: 0.55,
      sweepShots: 5, sweepArc: 0.9, sweepGap: 0.09,   // Faecher: 5 Schuesse ueber 0.9 rad, alle 0.09 s
      shotSpeed: 200,
      rest: 0.45,
      cdMin: 1.6, cdMax: 2.4,
    },
    sprite: 'enemy_dry_run', color: '#e8b23a', noFlip: true,
    minFloor: 7, weight: 6, cost: 2, maxPerRoom: 2, tags: ['melee', 'charge', 'ranged'],
    themeOnly: ['training'],
    desc: 'Rehearses every move in front of you. No changes were made. Yet.',
  };

  // --- Legacy Codebase: Stack Trace ---
  // Ein beiger Alt-Rechner-Skorpion (Gehaeuse-Beige der Neunziger, bernsteinfarbene Monochrom-Augen). Sein Schwanz
  // ist ein Stapel Endlospapier (Leporello mit Lochrand und gruenen Balken): jedes Blatt ist ein Stack-Frame, ganz
  // oben sitzt der rote Stachel. In Ruhe liegt der Stapel zusammengefaltet auf seinem Ruecken.
  // Angriff ("Trace"): bleibt stehen, eine gestrichelte Ziellinie folgt dem Spieler (track), rastet ein (lock, "!",
  // Linie wird hell) — dabei laeuft ein bernsteinfarbener Puls Blatt fuer Blatt den Stapel hinauf. Dann faltet sich
  // das Papier blitzschnell entlang der Linie auseinander: der Stachel sticht (volles Herz), das ausgerollte Papier
  // brennt bei Beruehrung (halbes Herz), Waende/Felsen stoppen es. Steht der Spieler beim Einrasten weiter weg als
  // die Reichweite, wirft der Stachel am Ende eine "uncaught exception" weiter (ein Schuss entlang derselben Linie).
  // Danach liegt der Schwanz kurz am Boden (hold) und faltet sich wieder ein (harmlos).
  // Stack-Abbau: bei 2/3 und 1/3 der HP fliegt das oberste Blatt weg (5 -> 4 -> 3 Frames), die Reichweite sinkt.
  // Stirbt er, verpuffen seine noch fliegenden Exceptions (der Stack ist abgewickelt). Kein Gegner-Gefolge,
  // der Schwanz ist reine Zeichnung (keine eigenen Entities). Verhalten 'stack_trace' in entities/enemy.js.
  // family: 'legacy' = rein optisch/akustisch (Staub- und Papier-Effekte, Nadeldrucker-Rattern als Warnton).
  E.stack_trace = {
    name: 'Stack Trace', hp: 14, r: 17, speed: 95, contactDamage: 1,
    behavior: 'stack_trace', params: {
      frames: 5, minFrames: 3,  // Blaetter (Stack-Frames) bei vollen HP / Untergrenze nach dem Abbau
      spacing: 30,              // Abstand der Blaetter im ausgerollten Schwanz (px); Reichweite = r + 4 + frames * spacing
      near: 110, far: 230,      // Wunschabstand zum Spieler (px)
      range: 380,               // greift nur an, wenn der Spieler naeher und in Sichtlinie ist
      track: 0.5,               // Ziellinie folgt dem Spieler (s) ...
      lock: 0.35,               // ... dann steht sie fest (s); Telegraph gesamt 0.85 s
      extendSpeed: 760,         // Ausrollen des Schwanzes (px/s)
      hold: 0.4,                // Schwanz bleibt ausgerollt liegen (s)
      retract: 0.45,            // Einfalten (s, harmlos)
      stingDamage: 2,           // Stachel: volles Herz (lang angekuendigt); ausgerolltes Papier: contactDamage
      shotSpeed: 200,           // "uncaught exception" ueber die Reichweite hinaus (px/s, skaliert sanft mit der Tiefe)
      cdMin: 1.7, cdMax: 2.5,   // Pause zwischen zwei Angriffen (game.rng, AI.cooldown)
      scuttle: 0.45, pause: 0.25, // Krabbeln in Schueben: so lange laufen / so lange stehen
    },
    sprite: 'enemy_stack_trace', color: '#cfc4a0', noFlip: true,
    minFloor: 2, weight: 6, cost: 1.8, maxPerRoom: 2, tags: ['ranged', 'melee'],
    themeOnly: ['legacy'], family: 'legacy',
    desc: 'Traceback (most recent call last): you.',
  };

  // ---------------------------------------------------------------------------
  // Dependency Hell (Etage 4, Thema 'dephell'): Honeypot und Rolling Release
  // ---------------------------------------------------------------------------
  // Gemeinsame Optik/Akustik ueber family: 'dephell' (Karton-Treffer, Verpackungschips beim Tod; effects.js
  // FAMILY_FX, audio.js FAMILY_SOUNDS). Gefahren-Farbe der Familie ist Cyan (Komplementaer zum Orange/Glut-Boden),
  // damit Telegraphen und Schuesse auf Dependency Hell nicht untergehen. Verhalten in entities/enemy.js.

  // --- Dependency Hell: Honeypot ---
  // Ein verdaechtig gutes Paket (goldener Honigtopf mit Sternchen-Aufkleber) mitten in einem Trichter aus
  // transitiven Abhaengigkeiten. Steht fest (static). Zyklus: ruhen (Trichterrand schwach sichtbar) -> Deckel
  // springt auf (Telegraph, Rand leuchtet) -> Sog: alles Laufende im Trichter wird zur Mitte gezogen (nie schneller
  // als 55 % der Spielergeschwindigkeit, Flieger schweben darueber) -> gegen Ende Kiefer-Warnung (Zielring im
  // Maul-Bereich) -> ZUSCHNAPPEN (volles Herz fuer den Spieler, viel Schaden fuer andere Gegner im Maul, Bomben im
  // Maul zuenden sofort) -> kauen. Gegner in den Trichter locken lohnt sich also.
  E.honeypot = {
    name: 'Honeypot', hp: 22, r: 20, speed: 0, contactDamage: 1,
    behavior: 'honeypot', params: {
      radius: 190,              // Trichter-Radius (px): nur darin wirkt der Sog
      jawR: 54,                 // Maul-Bereich (px): nur hier beisst es zu
      pullEdge: 60,             // Sog am Trichterrand (px/s) ...
      pullCore: 130,            // ... und nahe der Mitte (linear dazwischen)
      pullCap: 0.55,            // harte Obergrenze: Anteil der aktuellen Spielergeschwindigkeit (entkommbar)
      enemyPull: 0.7,           // andere Laeufer werden mit 70 % des Sogs mitgezogen
      idleMin: 1.4, idleMax: 2.2,   // Ruhepause (game.rng)
      tell: 0.7,                // Deckel springt auf: Telegraph vor dem Sog (s)
      pull: 2.4,                // Dauer des Sogs (s) ...
      biteTell: 0.6,            // ... davon die letzten 0.6 s mit Kiefer-Warnung
      chew: 1.2,                // Kauen nach dem Zuschnappen (kein Sog)
      biteDamage: 2,            // Spieler im Maul: volles Herz (klar telegraphiert)
      enemyBite: 14,            // andere Gegner im Maul: so viel Schaden
    },
    sprite: 'enemy_honeypot', color: '#f0b030', noFlip: true,
    minFloor: 4, weight: 5, cost: 2, maxPerRoom: 1, tags: ['turret'],
    themeOnly: ['dephell'], family: 'dephell',
    desc: '0 dependencies*, 99k stars, MIT licensed. *Terms and conditions apply.',
  };

  // --- Dependency Hell (und Sandbox Borders): Rolling Release ---
  // Ein rollender Knaeuel aus Paketen und Versions-Anhaengern. Zielt (Telegraph: Wackeln + Richtungspfeil), rollt
  // dann diagonal und prallt an Waenden, Felsen, Gruben und Objekten ab; jeder Abprall ist ein Versions-Sprung
  // (v1.0 -> v1.1 ...) und macht ihn schneller (+24 px/s, Obergrenze 250). Waehrend des Rollens ist er fest
  // verschnuert (nimmt nur halben Schaden). Nach majorAt Abprallen (oder spaetestens maxRoll s): BREAKING CHANGE —
  // er bremst, bebt (Telegraph mit Strahlen), platzt auf (Ring aus Verpackungschips) und liegt ausgepackt da:
  // verwundbares Fenster mit 150 % Schaden. Danach packt er sich neu und rollt wieder bei Grundtempo los.
  // Zweite Heimat Sandbox Borders (Faktor 0.6): dort ist er schlicht ein Steppenlaeufer — nur eben aus Paketen.
  E.rolling_release = {
    name: 'Rolling Release', hp: 18, r: 18, speed: 130, contactDamage: 1,
    behavior: 'rolling_release', params: {
      aim: 0.6,                 // Zielen vor jedem Losrollen (Telegraph, s)
      bump: 24,                 // +px/s pro Abprall (nach 5 Abprallen am Limit)
      maxSpeed: 250,            // Obergrenze (px/s)
      majorAt: 7,               // so viele Abpraller bis zum Breaking Change
      maxRoll: 13,              // Sicherheitsnetz: spaetestens nach so vielen Sekunden Rollen
      brake: 0.35,              // Abbremsen vor dem Beben (s)
      quake: 0.6,               // Beben + Strahlen vor dem Aufplatzen (Telegraph, s)
      open: 1.8,                // ausgepackt liegen (verwundbar, s)
      rollTaken: 0.5,           // Schadensfaktor beim Rollen/Zielen (verschnuert)
      openTaken: 1.5,           // Schadensfaktor ausgepackt
      ring: 6, shotSpeed: 170,  // Verpackungschips beim Aufplatzen
    },
    sprite: 'enemy_rolling_release', color: '#c98a4a', noFlip: true,
    minFloor: 4, weight: 6, cost: 1.5, maxPerRoom: 2, tags: ['melee', 'charge'],
    themeOnly: ['dephell', 'sandbox'], themes: { sandbox: 0.6 }, family: 'dephell',
    desc: 'Never stable, always latest. Picks up speed with every bump.',
  };

  // ---------------------------------------------------------------------------
  // Production-Familie (Etage 5): Rate Limiter und Port Scanner
  // ---------------------------------------------------------------------------
  // Gemeinsame Optik: helles Stahlgrau mit dunkler Kontur und Warnstreifen, Lampen/Augen und SCHUESSE in Cyan
  // (#5fe0ff) — Rot ginge auf dem roten Industrieboden unter. Telegraphen in Cyan/Bernstein. family: 'production'
  // = Metallfunken und Klonk-Sounds (rein optisch/akustisch, effects.js FAMILY_FX / audio.js FAMILY_SOUNDS).

  // --- Production: Rate Limiter ---
  // Ein Token-Bucket auf Beinen (Drehkreuz-Schrank mit drei Lampen = drei Tokens). Stapft auf Abstand, zielt
  // (Lampen blinken, gestrichelte Ziellinie, "!"), feuert pro Token einen gezielten Schuss (Lampe erlischt, der
  // Rotor klackt weiter) und ist dann "gedrosselt": Schild "429", ablaufender Retry-After-Ring, kein
  // Kontaktschaden, keine Schuesse und er nimmt throttledMult-fachen Schaden. Danach fuellen sich die Lampen
  // nacheinander wieder (Vorwarnung fuer die naechste Salve). Verhalten 'rate_limiter' in enemy.js.
  // Zweite Heimat: The Context Limit (Etage 11) — dort dreht sich alles um Tokens und Limits.
  E.rate_limiter = {
    name: 'Rate Limiter', hp: 16, r: 18, speed: 62, contactDamage: 1,
    behavior: 'rate_limiter', params: {
      tokens: 3,            // Schuesse pro Fenster (= Lampen)
      aim: 0.55,            // Telegraph vor der Salve (s)
      gap: 0.24,            // Abstand zwischen den Schuessen einer Salve (s)
      shotSpeed: 215,       // px/s (mit Tiefen-Skalierung max. ~247)
      throttle: 2.1,        // "429"-Pause (s): harmlos und verwundbarer
      throttledMult: 1.5,   // Schadensfaktor waehrend der Pause
      refill: 0.22,         // je Lampe beim Wiederauffuellen (s)
      walkMin: 0.9, walkMax: 1.5,   // Laufzeit zwischen zwei Salven (s, mit AI.cooldown)
      near: 150, far: 290,  // Wunschabstand zum Spieler (px)
    },
    sprite: 'enemy_rate_limiter', color: '#9aa3ad', noFlip: true,
    minFloor: 5, weight: 6, cost: 2, maxPerRoom: 2, tags: ['ranged'],
    themeOnly: ['production', 'context'], family: 'production',
    desc: 'Three requests per window. After that: 429, and a mandatory coffee break.',
  };

  // --- Production: Port Scanner ---
  // Legt beim Erscheinen 4 feste Ports (Netzwerkbuchsen im Boden, Minion 'port_scanner_port') weit verteilt im
  // Raum an — nie auf Hindernissen, Spawnpunkten, in der Raummitte oder vor Tueren — und nummeriert sie im
  // Uhrzeigersinn aufsteigend (22 -> 80 -> 443 -> ...). In genau dieser Reihenfolge scannt er sie ab: unter dem
  // Boden wandert er die sichtbare Scanlinie entlang (unverwundbar), der naechste Port leuchtet schon vorher auf,
  // dann Ping + "!" — und er ploppt heraus, zielt kurz (Linie) und feuert einen 3er-Faecher. Steht der Spieler
  // auf dem Port, ist er "FILTERED": der Scanner ueberspringt ihn (taucht also nie unter dem Spieler auf).
  // Stirbt er, schliessen sich die Ports. Verhalten 'port_scanner' + 'scanner_port' in enemy.js.
  E.port_scanner = {
    name: 'Port Scanner', hp: 12, r: 15, speed: 0, contactDamage: 1,
    behavior: 'port_scanner', params: {
      ports: 4,             // Anzahl Ports
      minGap: 150,          // Mindestabstand zwischen zwei Ports (px)
      travel: 360,          // Wandergeschwindigkeit unter dem Boden (px/s)
      tell: 0.6,            // Ping am Zielport vor dem Auftauchen (s)
      rise: 0.18,           // Herausploppen (s)
      aim: 0.45,            // Ziellinie vor dem Schuss (s)
      fan: 3, spread: 0.24, shotSpeed: 205,  // 3er-Faecher, ~14 Grad Abstand
      linger: 0.55,         // bleibt danach noch oben (s)
      dive: 0.3,            // Abtauchen (s)
      filterR: 52,          // Spieler naeher als das am Port -> "FILTERED"
    },
    sprite: 'enemy_port_scanner', color: '#6f7c8a', noFlip: true,
    minFloor: 5, weight: 5, cost: 1.8, maxPerRoom: 1, tags: ['ranged'],
    themeOnly: ['production'], family: 'production',
    desc: 'Knocks on every port, in order. Politely. Repeatedly. With bullets.',
  };

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // The Context Limit family (family: 'context', themeOnly: ['context']; Verhalten in entities/enemies-context.js)
  // ---------------------------------------------------------------------------

  // ---- Context-Familie: Slot 1 (Overflow Buffer) ----
  // --- Context Limit: Overflow Buffer ---
  // Ein Glastank auf kurzen Beinen, in dem leuchtende Textfetzen schwappen; eine Fuellstandslinie zeigt, wie voll
  // er ist. Der Pegel steigt von selbst (fillTime von leer bis voll) und JEDER Treffer des Spielers schuettet
  // hitFill zusaetzlich hinein. Ist er voll, springt das Glas ("[OVERFLOW]", Bernstein-Telegraph mit Strahlen in
  // die spaeteren Schussrichtungen und dem Pfuetzenradius am Boden, Gurgeln ueber enemyWindup), dann platzt er:
  // ein Ring aus Koralle-Tropfen und eine Pfuetze (Minion 'overflow_puddle'), die laufende Spieler verlangsamt.
  // Danach beginnt er leer von vorn. Also: schnell kaputt schiessen ODER den Ueberlauf ausloesen und ausweichen —
  // langsam abnutzen ist das Schlechteste. Verhalten 'overflow_buffer' in entities/enemies-context.js.
  E.overflow_buffer = {
    name: 'Overflow Buffer', hp: 18, r: 18, speed: 40, contactDamage: 1,
    behavior: 'overflow_buffer', params: {
      fillTime: 7,          // s von leer bis voll ohne Treffer
      hitFill: 0.07,        // zusaetzlicher Pegel je Treffer (Anteil des Tanks)
      warn: 0.8,            // Telegraph vor dem Platzen (s)
      shots: 8,             // Tropfen im Ring
      shotSpeed: 200,       // px/s (mit Tiefen-Skalierung max. 230)
      puddleR: 80,          // Pfuetzenradius (px)
      puddleLife: 4,        // Lebensdauer der Pfuetze (s, inkl. Ausblenden)
      puddleSlow: 0.6,      // Tempofaktor fuer den Spieler in der Pfuetze
      rest: 0.6,            // nach dem Platzen leer und still (s)
      near: 130,            // naeher als das: auf der Stelle schlurfen, weiter weg: auf den Spieler zu (px)
    },
    sprite: 'enemy_overflow_buffer', color: '#b9cde6', noFlip: true,
    minFloor: 8, weight: 5, cost: 1.8, maxPerRoom: 2, tags: ['ranged'],
    themeOnly: ['context'], family: 'context',
    desc: 'Nobody checked the bounds. Hit it and it fills up faster.',
  };

  // Pfuetze des Overflow Buffers: flache Wasserflaeche am Boden (static, intangible, kein Kontaktschaden, zaehlt
  // nicht fuers Clearing, kein Sprite: zeichnet sich selbst unter allem anderen). Waechst kurz auf, verlangsamt
  // laufende Spieler (player.slowBy) und blendet zum Ende hin aus; ueberlebt ihren Tank bis zum Ablauf.
  E.overflow_puddle = {
    name: 'Overflow Buffer', hp: 1, r: 20, speed: 0, contactDamage: 0, flying: true,
    behavior: 'overflow_puddle', color: '#9ec5ff', noFlip: true,
    spawn: false, cost: 0, family: 'context',
    desc: 'Spilled context. Wading through it takes a while.',
  };
  // ---- Ende Slot 1 ----

  // ---- Context-Familie: Slot 2 (Summarizer) ----
  // --- The Context Limit: Summarizer ---
  // Ein verhuellter Schreiber mit Federkiel (aufgeweichte Papierkutte, Tintenflecken). Greift nie selbst an (nur
  // normaler Kontaktschaden), haelt Abstand und "kompaktiert" stattdessen andere Gegner: alle paar Sekunden waehlt
  // er die zwei naechstgelegenen geeigneten Gegner, verbindet sie mit einer gestrichelten Bernstein-Linie
  // ("compacting...", Telegraph) und verschmilzt sie danach: der kleinere geht im groesseren auf (HP addiert,
  // etwas groesser, Schild "[summary]"). Trifft der Spieler ihn waehrend des Telegraphs, verliert er den Faden
  // (Abbruch, kurz verwirrt); stirbt eines der Ziele, faellt die Zusammenfassung ebenfalls aus. Nur einfache
  // Gegner sind geeignet (Positivliste SUMMARY_BEHAVIORS in entities/enemies-context.js). Verhalten 'summarizer'.
  E.summarizer = {
    name: 'Summarizer', hp: 16, r: 16, speed: 58, contactDamage: 1,
    behavior: 'summarizer', params: {
      near: 200, far: 320,      // Wunschabstand zum Spieler (px)
      firstMin: 3.5, firstMax: 5,   // erste Zusammenfassung nach so vielen Sekunden (game.rng)
      cdMin: 6, cdMax: 8,       // Pause zwischen zwei Zusammenfassungen (game.rng, AI.cooldown)
      retry: 0.6,               // kein geeignetes Paar gefunden: so bald erneut suchen (s)
      pairRange: 300,           // die zwei Ziele duerfen hoechstens so weit auseinander stehen (px)
      tell: 1.5,                // Telegraph: Linie + "compacting..." (s), erst danach verschmelzen sie
      fluster: 1.3,             // nach einem Treffer im Telegraph: verwirrt (s), danach neue Pause
      flusterCd: 3,             // ... und so lange bis zum naechsten Versuch (s)
      grow: 1.15,               // Radius-Faktor des Ueberlebenden je Zusammenfassung ...
      growCap: 1.35,            // ... hoechstens so viel des urspruenglichen Radius
      maxSummaries: 2,          // ein Gegner wird hoechstens so oft zusammengefasst
    },
    sprite: 'enemy_summarizer', color: '#d8d2c2',
    minFloor: 8, weight: 4, cost: 2, maxPerRoom: 1, tags: [],
    themeOnly: ['context'], family: 'context',
    desc: 'TL;DR: two of your problems are now one bigger problem.',
  };
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // --- Context: Lost in the Middle ---
  // Verblasster Geist einer Chat-Sprechblase (die LLM-Schwaeche, die Mitte eines langen Kontexts zu vergessen).
  // Am Rand fest: schwebt zum Spieler, Kontakt 1, nach Telegraph ein 3er-Faecher aus Wort-Schuessen. Im mittleren
  // Drittel der Raumbreite fast unsichtbar: intangible, harmlos, greift nicht an. Bleibt er dort zu lange
  // (maxLost), treibt er hinaus und bleibt eine Weile draussen (hold) — der Raum ist immer schaffbar.
  // Verhalten 'lost_in_the_middle' in entities/enemies-context.js (Zone, Zeiten und Anti-Stillstand dort erklaert).
  E.lost_in_the_middle = {
    name: 'Lost in the Middle', hp: 14, r: 18, speed: 70, contactDamage: 1, flying: true,
    behavior: 'lost_in_the_middle', params: {
      fade: 0.3,            // Ein-/Ausblenden (s); fest erst, wenn wieder voll sichtbar
      ghostAlpha: 0.16,     // Deckkraft in der Mitte
      tell: 0.6,            // Telegraph vor dem Faecher (s)
      fan: 3, spread: 0.26, // 3 Schuesse, ~15 Grad Abstand
      shotSpeed: 195,       // px/s (mit Tiefen-Skalierung max. ~224)
      cdMin: 2.0, cdMax: 3.0, // Pause zwischen zwei Salven (s, mit AI.cooldown)
      maxLost: 4,           // so lange darf er am Stueck in der Mitte schweben (s), dann treibt er hinaus
      surfaceSpeed: 110,    // Tempo beim Hinaustreiben (px/s)
      hold: 2.2,            // bleibt danach so lange ausserhalb der Mitte (s)
      keepOut: 40,          // ... mit mindestens diesem Abstand zur Zonengrenze (px)
    },
    sprite: 'enemy_lost_in_the_middle', color: '#b9cde6', noFlip: true,
    minFloor: 8, weight: 5, cost: 1.6, maxPerRoom: 2, tags: ['fly', 'ranged'],
    themeOnly: ['context'], family: 'context',
    desc: 'Remembers the beginning. Remembers the end. Everything in between: gone.',
  };
  // ---- Ende Slot 3 ----

  // Minions (spawn: false) — entstehen nur durch andere Gegner oder Bosse
  // ---------------------------------------------------------------------------

  E.leaklet = {
    name: 'Leaklet', hp: 4, r: 11, speed: 95, contactDamage: 1,
    behavior: 'chase', sprite: 'enemy_leaklet', color: '#8e5bd6',
    spawn: false, cost: 0.5,
    desc: 'A smaller leak. Still not freed.',
  };

  E.microservice = {
    name: 'Microservice', hp: 7, r: 13, speed: 110, contactDamage: 1,
    behavior: 'chase', sprite: 'enemy_microservice', color: '#9aa0a8',
    spawn: false, cost: 0.8,
    desc: 'One of 47. Nobody knows which one is failing.',
  };

  // Modul des Megalith (Boss, ab 50 %): kriecht zurueck zum Boss und heilt ihn, wenn es ankommt
  // ("Refactor rejected" — alles wandert zurueck in die eine Datei). Ohne Besitzer jagt es den Spieler.
  E.megalith_module = {
    name: 'Module', hp: 9, r: 14, speed: 72, contactDamage: 1,
    behavior: 'megalith_module', sprite: 'enemy_megalith_module', color: '#6b707a',
    spawn: false, cost: 0.8,
    desc: 'A piece that tried to leave. It is being merged back in.',
  };

  // Koerpersegment der Infinite Loop (Boss). Leitet Schaden an den Kopf weiter (entities/boss.js).
  E.loop_segment = {
    name: 'The Infinite Loop', hp: 1, r: 18, speed: 0, contactDamage: 1, flying: true,
    behavior: 'worm_segment', sprite: 'boss_infinite_loop_segment', color: '#3fb8c9', noFlip: true,
    spawn: false, cost: 0,
    desc: 'while (true) { suffer(); }',
  };

  // Glied des Spinlock: vom Kopf positioniert (static), im Ring unverwundbar (schirmt den Kopf ab), Kontakt 1.
  // Das letzte Glied ist die Rassel (state.tail). Stirbt der Kopf, zerfallen die Glieder nacheinander.
  E.spinlock_segment = {
    name: 'Spinlock', hp: 1, r: 13, speed: 0, contactDamage: 1,
    behavior: 'spinlock_segment', sprite: 'enemy_spinlock_body', color: '#c9a466', noFlip: true,
    spawn: false, cost: 0, family: 'sandbox',
    desc: 'Part of the lock. Not the part you want to hit.',
  };

  // Port des Port Scanners: Netzwerkbuchse im Boden (static, intangible, kein Kontaktschaden, zaehlt nicht fuers
  // Clearing). Zeichnet sich unter allem anderen (drawLayer -1) mit Portnummer; leuchtet, wenn er als
  // naechster gescannt wird. Stirbt der Scanner, schliesst sich der Port und verschwindet.
  E.port_scanner_port = {
    name: 'Port Scanner', hp: 1, r: 14, speed: 0, contactDamage: 0,
    behavior: 'scanner_port', sprite: 'enemy_port_scanner_port', color: '#7f8892', noFlip: true,
    spawn: false, cost: 0, family: 'production',
    desc: 'An open port. Something is listening. Something is also knocking.',
  };

  // Ringteil der Nested Infinite Loop (Kopf oder Glied eines der drei Ringe): vom Boss positioniert (static),
  // Schaden geht an den gemeinsamen Pool (proxy). Nur der aeussere lebende Ring ist greifbar; die inneren drehen
  // sich geisterhaft mit (intangible, kein Kontaktschaden). Sprite je Ring und Rolle setzt das Verhalten.
  E.nested_loop_part = {
    name: 'The Nested Infinite Loop', hp: 1, r: 18, speed: 0, contactDamage: 1, flying: true,
    behavior: 'nested_part', sprite: 'boss_nested_loop_segment_0', color: '#3fb8c9', noFlip: true,
    spawn: false, cost: 0,
    desc: 'One iteration of many. Of many. Of many.',
  };

  // Arm-Segment der Octopus Merge (Boss, Forgotten Branches): 5 pro Arm, vom Knoten positioniert (static).
  // Leitet Schaden an den Knoten weiter (proxy, 60 %). Nur das Spitzen-Segment ist sichtbar (der Commit-Punkt,
  // der schiesst); den Holzarm selbst zeichnet der Boss, und er prueft auch den Kontaktschaden entlang des
  // ganzen Arms (entities/boss.js) — deshalb hier contactDamage 0.
  E.octo_arm = {
    name: 'Octopus Merge', hp: 1, r: 16, speed: 0, contactDamage: 0, flying: true,
    behavior: 'octo_arm', sprite: 'boss_octopus_merge_tip', color: '#a3602c', noFlip: true,
    spawn: false, cost: 0, family: 'branches',
    desc: 'One of eight branches. Soon to be one of seven.',
  };

  // ---------------------------------------------------------------------------
  // Spawn-Logik
  // ---------------------------------------------------------------------------

  /** Thema-Schluessel einer Tiefe ('branches', 'devnull', ...) oder null, falls es keine Themen gibt */
  B.themeKeyAt = function (depth) {
    const t = B.themeFor ? B.themeFor(depth) : null;
    return (t && t.key) || null;
  };

  /** Faktor fuer Gegner ausserhalb ihrer Heimat-Etagen (Feld home), siehe Kopfkommentar */
  B.AWAY = 0.2;
  /** Ab dieser Tiefe verblasst die Etagen-Identitaet (Kakophonie, siehe B.mixAt) */
  B.MIX_FROM = 8;

  /**
   * Mischungsgrad der Kakophonie auf einer Tiefe: 0 vor B.MIX_FROM, dann 0.25 und +0.1 pro Etage bis 1
   * (Etage 8: 0.25, 10: 0.45, 12: 0.65, ab 16: 1).
   */
  B.mixAt = function (depth) {
    const d = Number(depth);
    if (!Number.isFinite(d) || d < B.MIX_FROM) return 0;
    return Math.min(1, 0.25 + 0.1 * (d - B.MIX_FROM));
  };

  /**
   * Roher Etagen-Faktor (ohne Kakophonie) einer Gegner- ODER Boss-Definition fuer ein Thema:
   *   themeOnly gesetzt und Thema nicht enthalten -> 0 (ausgeschlossen)
   *   themes[theme] gesetzt                       -> dieser Faktor (negative/ungueltige Werte zaehlen als 0)
   *   home gesetzt und Thema nicht enthalten      -> B.AWAY
   *   sonst                                       -> 1 (neutral)
   * Ein Thema von null (keine Themen bekannt) schliesst nur themeOnly-Definitionen aus (home zaehlt dann nicht).
   */
  B.themeFactor = function (def, theme) {
    if (Array.isArray(def.themeOnly) && !def.themeOnly.includes(theme)) return 0;
    if (def.themes && theme && Object.prototype.hasOwnProperty.call(def.themes, theme)) {
      const f = Number(def.themes[theme]);
      return Number.isFinite(f) && f > 0 ? f : 0;
    }
    if (Array.isArray(def.home) && theme && !def.home.includes(theme)) return B.AWAY;
    return 1;
  };

  /**
   * Etagen-Faktor einer Gegner- ODER Boss-Definition (bosses.js nutzt dieselbe Funktion).
   * depth: optional. Ohne Tiefe gilt der rohe Faktor (B.themeFactor); mit Tiefe wird ein Faktor < 1 ab
   * B.MIX_FROM Richtung 1 angehoben: f + (1 - f) * B.mixAt(depth). Faktoren >= 1 bleiben unveraendert.
   */
  B.themeWeight = function (def, theme, depth) {
    const f = B.themeFactor(def, theme);
    if (f >= 1 || depth === undefined) return f;
    return f + (1 - f) * B.mixAt(depth);
  };

  /**
   * Effektives Spawn-Gewicht einer Definition auf einer Tiefe (mit Etagen-Verlauf, Etagen-Thema und Kakophonie).
   * theme: optional; ohne Angabe gilt das Thema der Tiefe (B.themeKeyAt).
   */
  B.enemyWeightAt = function (def, depth, theme) {
    const base = def.weight || 0;
    if (base <= 0) return 0;
    const w = base + (def.weightPerFloor || 0) * Math.max(0, depth - (def.minFloor || 1));
    const clamped = B.M.clamp(w, def.minWeight || 0, def.maxWeight !== undefined ? def.maxWeight : 99);
    return clamped * B.themeWeight(def, theme === undefined ? B.themeKeyAt(depth) : theme, depth);
  };

  /** Multiplikator aus dem Layout-Bias (z. B. Gruben-Layouts bevorzugen Flieger) */
  function biasFor(def, bias) {
    if (!bias || !def.tags) return 1;
    let m = 1;
    for (const t of def.tags) if (bias[t] !== undefined) m *= bias[t];
    return m;
  }

  /**
   * Wuerfelt die Gegnerliste fuer einen Kampfraum (deterministisch ueber den Etagen-RNG).
   * Budget-System: jede Gegnerart hat "cost"; das Budget waechst mit der Tiefe. Packs (Race Condition)
   * kommen immer vollstaendig. Bonus-Gegner (Hallucination) kommen ausserhalb des Budgets dazu.
   * @param {BOTA.RNG} rng   — Generator-RNG der Etage
   * @param {number} depth   — aktuelle Tiefe (1..)
   * @param {BOTA.Room} [room] — Raum (optional; room.layout.bias beeinflusst die Auswahl)
   * @param {string|null} [theme] — Etagen-Thema (optional; Standard: Thema der Tiefe, siehe B.themeKeyAt)
   * @returns {string[]}     — Liste von Gegner-IDs
   */
  B.rollRoomEnemies = function (rng, depth, room, theme) {
    const d = Math.max(1, depth | 0);
    const th = theme === undefined ? B.themeKeyAt(d) : theme;
    const bias = room && room.layout && room.layout.bias ? room.layout.bias : null;
    const pool = [];
    const bonus = [];
    for (const id of Object.keys(E)) {
      const def = E[id];
      if (def.spawn === false || (def.minFloor || 1) > d) continue;
      // Auf dieser Etage ausgeschlossen (themeOnly / Faktor 0, vor der Kakophonie): weder im Pool noch als Bonus
      // (und damit auch kein RNG-Zug fuer seine Bonus-Chance)
      if (B.themeWeight(def, th, d) <= 0) continue;
      if (def.bonusChance) bonus.push(id);
      if (B.enemyWeightAt(def, d, th) > 0) pool.push(id);
    }
    if (!pool.length) return [];

    // Budget: Etage 1 ~3.3–4.8 (3–4 leichte Gegner), Etage 5 ~7–8.5, gedeckelt bei 11
    const budget = Math.min(11, 2.4 + d * 0.9 + rng.float(0, 1.5));
    const maxCount = Math.min(8, 3 + d); // nie mehr als 8 Startgegner (Splits kommen spaeter dazu)
    const out = [];
    const counts = {};
    let spent = 0;

    for (let tries = 0; tries < 40 && out.length < maxCount; tries++) {
      const id = rng.weighted(pool, (k) => B.enemyWeightAt(E[k], d, th) * biasFor(E[k], bias));
      const def = E[id];
      const pack = def.pack || 1;
      const cost = (def.cost !== undefined ? def.cost : 1) * pack;
      if (out.length + pack > maxCount) continue;
      if (def.maxPerRoom && (counts[id] || 0) + pack > def.maxPerRoom) continue;
      // Budget pruefen (der allererste Gegner darf es immer sprengen, damit kein Raum leer bleibt)
      if (out.length && spent + cost > budget + 0.01) {
        if (budget - spent < 0.8) break; // Rest reicht fuer nichts mehr
        continue;                        // vielleicht passt ein billigerer Gegner
      }
      for (let i = 0; i < pack; i++) out.push(id);
      counts[id] = (counts[id] || 0) + pack;
      spent += cost;
      if (budget - spent < 0.5) break;
    }
    if (!out.length) out.push(pool[0]);

    // Bonus-Ueberraschungen (zaehlen nicht zum Budget). Der Etagen-Faktor skaliert die Chance, die
    // Obergrenze von 25 % pro Raum gilt trotzdem (sonst koennte ein Thema Raeume mit Bonus-Gegnern fluten).
    for (const id of bonus) {
      const def = E[id];
      const p = (def.bonusChance + 0.01 * (d - 1)) * B.themeWeight(def, th, d);
      if (rng.chance(Math.min(0.25, p))) out.push(id);
    }
    return out;
  };
})(window.BOTA);
