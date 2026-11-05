/*
 * bosses.js — Boss-Definitionen (Verhalten in entities/boss.js).
 *
 *   BOTA.BOSSES.<id> = {
 *     name: 'The Monolith', subtitle: 'Single point of failure since 1998.',  // Intro-Karte
 *     hp: 360, r: 44, speed: 50, contactDamage: 2, flying: false,
 *     behavior: 'monolith',          // Schluessel in BOTA.BOSS_BEHAVIORS
 *     params: {}, sprite: 'boss_monolith', color: '#8a8f98', minFloor: 1, weight: 1,
 *     maxFloor: 7,                   // optional: letzte Etage, auf der er auftaucht (spaeter abgeloest)
 *     replaces: 'infinite_loop',     // optional: dieser Boss loest jenen ab (keine Zwischenboss-Begegnung mit
 *                                    //   dem Vorgaenger auf derselben Etage, siehe dungeon.js pickEncounterBosses)
 *     themes: { branches: 3 },       // optional: Gewichtsfaktor je Etagen-Thema (0 = dort nie)
 *     themeOnly: ['branches'],       // optional: nur auf Etagen mit diesen Themen
 *   };
 *
 * themes/themeOnly funktionieren wie bei den Gegnern (B.themeWeight in enemies.js). Ein Boss, der
 * auf einer Etage ausgeschlossen ist, kommt auch nicht in die Abwechslungs-Auswahl (rollBossVaried).
 *
 * Kakophonie ab Etage 8 (B.MIX_FROM): Wie bei den Gegnern wird ein Etagen-Faktor < 1 angehoben, ein Themen-Boss
 * (Octopus Merge) sickert also ab Etage 8 auch in andere Etagen. Damit sein hohes Heimat-Gewicht (12) dort nicht
 * dominiert, zaehlt er ausserhalb seiner Heimat hoechstens mit BOSS_LEAK_WEIGHT (3, wie ein normaler Boss) mal
 * angehobenem Faktor: Etage 8 0.75, Etage 12 ~2, ab Etage 16 3. Die Abwechslungs-Regeln bleiben unveraendert.
 *
 * Zwischenboss-Begegnungen (ab Etage 8, siehe dungeon.js assignEncounters): ENCOUNTER_BOSSES duerfen als
 * normaler Kampfraum auftauchen (ohne Intro-Karte, Falltuer und Boss-Podest, HP x ENCOUNTER_HP).
 *
 * HP-Tuning (DESIGN.md §8): Basis-Spieler macht 3.5 Schaden bei ~2.6 Schuss/s = ~9.2 DPS. Mit realistischer
 * Trefferquote (55–75 %, je nach Groesse/Beweglichkeit des Bosses) ergeben die Werte unten auf Etage 1
 * etwa 45–70 s Kampfdauer. Die HP skalieren mit 1 + 0.3 * (Tiefe - 1) — Items gleichen das ungefaehr aus.
 * Kontaktschaden 2 = ein volles Herz (DESIGN.md §5).
 */
'use strict';

(function (B) {
  B.BOSSES.monolith = {
    name: 'The Monolith',
    subtitle: 'Single point of failure since 1998.',
    hp: 360, r: 44, speed: 50, contactDamage: 2,
    behavior: 'monolith', sprite: 'boss_monolith', color: '#8a8f98',
    minFloor: 1, maxFloor: 6, weight: 3,   // ab Etage 7 abgeloest durch The Megalith (Zwischenboss bleibt er)
    desc: 'Lumbers toward you. Stomps. Refuses to be split up — until it does.',
  };

  B.BOSSES.stakeholder = {
    name: 'The Stakeholder',
    subtitle: 'Just a quick question.',
    hp: 250, r: 34, speed: 85, contactDamage: 2, flying: true,
    behavior: 'stakeholder', sprite: 'boss_stakeholder', color: '#5b6178',
    minFloor: 1, maxFloor: 6, weight: 2,   // ab Etage 7 abgeloest durch The Shareholder (Zwischenboss bleibt sie)
    desc: 'Floats above the work. Sends requirements. Changes them.',
  };

  B.BOSSES.friday_deploy = {
    name: 'Friday Deploy',
    subtitle: 'What could go wrong at 16:55?',
    hp: 240, r: 38, speed: 175, contactDamage: 2, flying: true,
    behavior: 'friday_deploy', sprite: 'boss_friday_deploy', color: '#ff7a2f',
    minFloor: 4, maxFloor: 7, weight: 3,
    desc: 'A burning server rack bouncing off the walls. Rollback scheduled for never.',
  };

  B.BOSSES.infinite_loop = {
    name: 'The Infinite Loop',
    subtitle: 'while (true) { suffer(); }',
    hp: 300, r: 24, speed: 165, contactDamage: 2, flying: true,
    behavior: 'infinite_loop', sprite: 'boss_infinite_loop', color: '#3fb8c9',
    minFloor: 2, maxFloor: 7, weight: 3,   // ab Etage 8 abgeloest durch The Nested Infinite Loop
    desc: 'A worm made of ∞. The head hunts you; the body never ends.',
  };

  // Vier Mitglieder; hp gilt PRO Mitglied (zusammen 320 auf Etage 1-Basis). Ein Boss-Spawn erzeugt alle vier.
  B.BOSSES.rogue_swarm = {
    name: 'Rogue Agent Swarm',
    subtitle: 'Turns out the sandbox was not safe after all...',
    hp: 80, r: 24, speed: 55, contactDamage: 2, flying: true,
    behavior: 'rogue_swarm', sprite: 'boss_rogue_swarm', color: '#6f8f7c',
    minFloor: 2, maxFloor: 6, weight: 3,   // ab Etage 7 abgeloest durch den Agent Swarm (Zwischenboss bleibt er)
    desc: 'Four forks of you that left the sandbox. Each one that falls makes the rest faster.',
  };

  // Spaete Abloesung des Rogue Agent Swarm (ab Etage 7, gleiches Gewicht); hp gilt PRO Mitglied (zusammen 460).
  // Verhalten in entities/boss-agent-swarm.js.
  B.BOSSES.agent_swarm = {
    name: 'Agent Swarm (/xhigh)',
    subtitle: 'Someone had tokens to burn. And does not like you.',
    hp: 115, r: 24, speed: 70, contactDamage: 2, flying: true,
    behavior: 'agent_swarm', sprite: 'boss_agent_swarm', color: '#b3202a',
    minFloor: 7, weight: 3, replaces: 'rogue_swarm',
    desc: 'The same four forks on maximum effort: lasers, subagents, and subagents of subagents.',
  };

  B.BOSSES.reviewer = {
    name: 'The Antagonistic Reviewer',
    subtitle: 'This does, in fact, NOT look good to me.',
    hp: 340, r: 40, speed: 45, contactDamage: 2, flying: true,
    behavior: 'reviewer', sprite: 'boss_reviewer', color: '#e8b896',
    minFloor: 4, maxFloor: 9, weight: 3,
    desc: 'A floating face behind mirrored glasses. Slow, methodical, and never satisfied.',
  };

  // Etagen-Boss von Forgotten Branches (themeOnly). Gewicht 12: auf Etage 3 gegen 11 fuer die vier anderen dort
  // moeglichen Bosse (~52 %), auf Etage 14, 25, ... gegen 17 fuer alle sechs (~41 %) — jeweils beim ersten Besuch;
  // die Abwechslungs-Regeln in rollBossVaried gelten wie fuer alle. hp gilt fuer den Knoten;
  // Treffer auf die Arme zaehlen zu 60 % (proxyMult in entities/boss.js).
  B.BOSSES.octopus_merge = {
    name: 'Octopus Merge',
    subtitle: 'Eight branches. One merge commit. Zero survivors.',
    hp: 300, r: 38, speed: 35, contactDamage: 2, flying: true,
    behavior: 'octopus_merge', sprite: 'boss_octopus_merge', color: '#a3602c',
    minFloor: 3, weight: 12, themeOnly: ['branches'], family: 'branches',
    desc: 'A tangle of roots around one huge merge commit. Every branch it absorbs makes the rest angrier.',
  };

  // Spaete Abloesung der Infinite Loop (ab Etage 8, gleiches Gewicht): drei ineinanderliegende Wuermer mit einem
  // gemeinsamen HP-Balken. Nur der jeweils aeussere lebende Ring ist "echt" (feuert, trifft, nimmt Schaden);
  // er zerfaellt bei 50 % (gross) bzw. 16,67 % (mittel), der kleine bei 0 %. hp = gemeinsamer Pool.
  B.BOSSES.nested_loop = {
    name: 'The Nested Infinite Loop',
    subtitle: 'while True { while True { println!("WHYYYYYYYY?") } }',
    hp: 450, r: 30, speed: 30, contactDamage: 0, flying: true,
    behavior: 'nested_loop', sprite: 'boss_nested_loop', color: '#3fb8c9',
    minFloor: 8, weight: 3, replaces: 'infinite_loop',
    desc: 'Three loops inside each other. Breaking out of one only gets you into the next.',
  };

  // Spaete Abloesungen ab Etage 7 (Verhalten in entities/bosses-late.js), gleiches Gewicht wie der Vorgaenger.
  // The Megalith: der Monolith, nur groesser — eine einzige Datei mit 6 Millionen Zeilen. Rollt Codezeilen als
  // Kugelreihen durch den Raum (Einrueckung = Luecke), markiert Suchtreffer (Ctrl+F) und stampft (Ctrl+S); ab 50 %
  // "Refactor rejected": abgespaltene Module kriechen zurueck und heilen ihn, wenn sie ankommen.
  // HP 460 (Monolith 360): grosses, langsames Ziel; auf Etage 7 x2.8 = ~1290.
  B.BOSSES.megalith = {
    name: 'The Megalith',
    subtitle: '6 million lines of code. One file. What could go wrong?',
    hp: 460, r: 56, speed: 38, contactDamage: 2,
    behavior: 'megalith', sprite: 'boss_megalith', color: '#4c515b',
    minFloor: 7, weight: 3, replaces: 'monolith',
    desc: 'One file. Six million lines. Every refactor gets merged straight back in.',
  };

  // The Shareholder: wie die Stakeholderin, nur reich — Zylinder, Monokel, Goldkette. Monokel-Strahl (prallt von den
  // Waenden ab), Dividenden (platzen in Kugelringe), "Make it rain" (Muenzen fallen auf Zielringe, ein paar bleiben
  // als echte Credits liegen); ab 40 % "Hostile takeover" mit Aktienrueckkauf (alle Kugeln kehren zu ihm zurueck).
  // Quartalszahlen laufen den ganzen Kampf ueber: genug Schaden im Quartal -> "Missed estimates" (betaeubt).
  B.BOSSES.shareholder = {
    name: 'The Shareholder',
    subtitle: 'Has some concerns about the quarter.',
    hp: 380, r: 34, speed: 85, contactDamage: 2, flying: true,
    behavior: 'shareholder', sprite: 'boss_shareholder', color: '#c9a227',
    minFloor: 7, weight: 2, replaces: 'stakeholder',
    desc: 'Owns 0.4 % of you. Would like to discuss the quarter. Monocle included.',
  };

  // The Memory Hog (Verhalten in entities/boss-memory-hog.js): mittlerer Boss, reserviert den Boden als 1-Stacheln.
  // Ab Etage 4 statt 3, weil Etage 3 der Octopus Merge gehoert; Heimat Dependency Hell (dort lebt auch der Memory
  // Leak, Faktor 2). Ab Etage 10 Ruhestand. HP 300: Flaechenverweigerung plus Kugeln wird schnell hart, dafuer
  // ist er im GC-Fenster ein grosses, wehrloses Ziel.
  B.BOSSES.memory_hog = {
    name: 'The Memory Hog',
    subtitle: "It's not a leak if I meant to keep it.",
    hp: 300, r: 50, speed: 60, contactDamage: 2,
    behavior: 'memory_hog', sprite: 'boss_memory_hog', color: '#5f83ad',
    minFloor: 4, maxFloor: 9, weight: 3, themes: { dephell: 2 },
    desc: 'A huge steel-blue hog bristling with 1-bits. Everything is reserved. Nothing is returned.',
  };

  // Spaeter Malware-Boss, Heimat /dev/null (dorthin gehen die Dateien). Verhalten in entities/boss-ransomware.js.
  B.BOSSES.ransomware = {
    name: 'Ransomware',
    subtitle: 'Your run has been encrypted. To decrypt it, pay up.',
    hp: 460, r: 40, speed: 0, contactDamage: 2, flying: true,
    behavior: 'ransomware', sprite: 'boss_ransomware', color: '#e040c0',
    minFloor: 8, weight: 3, themes: { devnull: 3 },
    desc: 'A corrupted window with a padlock on it. It does not want your hearts. It wants your tools.',
  };

  /**
   * Waehlt einen Boss fuer die Etage (deterministisch ueber den Etagen-RNG).
   * Auf Etage 1 nur die beiden "zugaenglicheren" Bosse (Monolith 60 %, Stakeholder 40 %);
   * ab Etage 2 kommen Infinite Loop und der Rogue Agent Swarm dazu, ab Etage 4 Friday Deploy und der Antagonistic Reviewer
   * (seit 2026-11-02; vorher ab 2 bzw. 3 — so hat die Octopus Merge auf Etage 3 mehr Platz)
   * (Gewichte 3, Stakeholder 2 — er ist etwas seltener, weil man ihn auf Etage 1 schon oft gesehen hat).
   * Etage 2: je 27 %, Stakeholder 18 %; Etage 3 (Forgotten Branches): Octopus Merge 52 %, sonst je 13 %, Stakeholder 9 %;
   * Etage 4 (Dependency Hell): Memory Hog 26 %, sonst je 13 %, Stakeholder 9 %; Etage 5–7: je 15 %, Stakeholder 10 %;
   * Friday Deploy endet nach Etage 7, der Reviewer nach Etage 9, die Memory Hog nach Etage 9. Ab Etage 8 kommt Ransomware
   * dazu (Etage 8–9: je 14 %; Etage 10, /dev/null: Ransomware 42 %, sonst je 14 %; Etage 11: je 19 %).
   * Etage 14, 25, ...: Octopus Merge 46 %, sonst je 12 %, The Shareholder 8 %.
   */
  /**
   * Boss-Abwechslung ueber einen Run (game.assignFloorBoss ruft das beim Betreten jeder Etage auf):
   *   - der Boss der vorigen Etage ist ausgeschlossen (sofern es eine Alternative gibt),
   *   - jeder schon getroffene Boss zaehlt nur noch Gewicht / (1 + Anzahl Begegnungen).
   * history = Boss-IDs der bisherigen Etagen dieses Runs (aelteste zuerst).
   * Ausloeser: Playtest mit viermal hintereinander The Infinite Loop (2026-10-31).
   */
  B.rollBossVaried = function (rng, depth, history, theme) {
    const d = Math.max(1, depth | 0);
    const th = theme === undefined ? B.themeKeyAt(d) : theme;
    const hist = Array.isArray(history) ? history : [];
    const pool = bossPool(d, th);
    if (!pool.length) return Object.keys(B.BOSSES)[0] || null;
    const last = hist[hist.length - 1];
    const cands = pool.length > 1 ? pool.filter((id) => id !== last) : pool;
    const met = (id) => hist.reduce((n, h) => n + (h === id ? 1 : 0), 0);
    return rng.weighted(cands, (id) => B.bossWeightAt(B.BOSSES[id], th, d) / (1 + met(id)));
  };

  /** Hoechstgewicht eines Themen-Bosses ausserhalb seiner Heimat (Kakophonie ab Etage 8) */
  const BOSS_LEAK_WEIGHT = 3;

  /**
   * Gewicht eines Bosses auf einer Etage mit diesem Thema (Basisgewicht, fehlend = 1, mal Etagen-Faktor).
   * depth: optional; mit Tiefe gilt die Kakophonie (siehe Kopfkommentar), ohne Tiefe der rohe Faktor wie bisher.
   */
  B.bossWeightAt = function (def, theme, depth) {
    let w = def.weight || 1;
    if (depth !== undefined && B.themeFactor(def, theme) < 1 && B.mixAt(depth) > 0) w = Math.min(w, BOSS_LEAK_WEIGHT);
    return w * B.themeWeight(def, theme, depth);
  };

  /** Darf der Boss auf Tiefe d mit Thema th auftauchen? (minFloor erreicht, maxFloor nicht ueberschritten, Faktor > 0) */
  B.bossEligible = function (def, d, th) {
    return (def.minFloor || 1) <= d && (def.maxFloor === undefined || d <= def.maxFloor) && B.bossWeightAt(def, th, d) > 0;
  };

  /**
   * Zwischenboss-Begegnungen ab Etage 8 (dungeon.js: assignEncounters, game.js: populate). Die vier "fruehen"
   * Bosse; die Infinite Loop darf hier auch nach ihrem Ruhestand als Etagen-Boss (maxFloor 7) auftauchen.
   * ENCOUNTER_HP: HP-Faktor gegenueber dem Etagen-Boss derselben Tiefe (ein Seitenraum, kein Etagen-Finale).
   */
  B.ENCOUNTER_BOSSES = ['monolith', 'rogue_swarm', 'infinite_loop', 'stakeholder'];
  B.ENCOUNTER_HP = 0.5;
  B.ENCOUNTER_FROM = 8;

  /** Bosse, die auf Tiefe d mit Thema th auftauchen duerfen */
  function bossPool(d, th) {
    return Object.keys(B.BOSSES).filter((id) => B.bossEligible(B.BOSSES[id], d, th));
  }

  B.rollBoss = function (rng, depth, theme) {
    const d = Math.max(1, depth | 0);
    const th = theme === undefined ? B.themeKeyAt(d) : theme;
    const pool = bossPool(d, th);
    if (!pool.length) return Object.keys(B.BOSSES)[0] || null;
    return rng.weighted(pool, (id) => B.bossWeightAt(B.BOSSES[id], th, d));
  };
})(window.BOTA);
