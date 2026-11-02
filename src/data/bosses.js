/*
 * bosses.js — Boss-Definitionen (Verhalten in entities/boss.js).
 *
 *   BOTA.BOSSES.<id> = {
 *     name: 'The Monolith', subtitle: 'Single point of failure since 1998.',  // Intro-Karte
 *     hp: 360, r: 44, speed: 50, contactDamage: 2, flying: false,
 *     behavior: 'monolith',          // Schluessel in BOTA.BOSS_BEHAVIORS
 *     params: {}, sprite: 'boss_monolith', color: '#8a8f98', minFloor: 1, weight: 1,
 *     themes: { branches: 3 },       // optional: Gewichtsfaktor je Etagen-Thema (0 = dort nie)
 *     themeOnly: ['branches'],       // optional: nur auf Etagen mit diesen Themen
 *   };
 *
 * themes/themeOnly funktionieren wie bei den Gegnern (B.themeWeight in enemies.js). Ein Boss, der
 * auf einer Etage ausgeschlossen ist, kommt auch nicht in die Abwechslungs-Auswahl (rollBossVaried).
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
    minFloor: 1, weight: 3,
    desc: 'Lumbers toward you. Stomps. Refuses to be split up — until it does.',
  };

  B.BOSSES.stakeholder = {
    name: 'The Stakeholder',
    subtitle: 'Just a quick question.',
    hp: 250, r: 34, speed: 85, contactDamage: 2, flying: true,
    behavior: 'stakeholder', sprite: 'boss_stakeholder', color: '#5b6178',
    minFloor: 1, weight: 2,
    desc: 'Floats above the work. Sends requirements. Changes them.',
  };

  B.BOSSES.friday_deploy = {
    name: 'Friday Deploy',
    subtitle: 'What could go wrong at 16:55?',
    hp: 240, r: 38, speed: 175, contactDamage: 2, flying: true,
    behavior: 'friday_deploy', sprite: 'boss_friday_deploy', color: '#ff7a2f',
    minFloor: 2, weight: 3,
    desc: 'A burning server rack bouncing off the walls. Rollback scheduled for never.',
  };

  B.BOSSES.infinite_loop = {
    name: 'The Infinite Loop',
    subtitle: 'while (true) { suffer(); }',
    hp: 300, r: 24, speed: 165, contactDamage: 2, flying: true,
    behavior: 'infinite_loop', sprite: 'boss_infinite_loop', color: '#3fb8c9',
    minFloor: 2, weight: 3,
    desc: 'A worm made of ∞. The head hunts you; the body never ends.',
  };

  // Vier Mitglieder; hp gilt PRO Mitglied (zusammen 320 auf Etage 1-Basis). Ein Boss-Spawn erzeugt alle vier.
  B.BOSSES.rogue_swarm = {
    name: 'Rogue Agent Swarm',
    subtitle: 'Turns out the sandbox was not safe after all...',
    hp: 80, r: 24, speed: 55, contactDamage: 2, flying: true,
    behavior: 'rogue_swarm', sprite: 'boss_rogue_swarm', color: '#6f8f7c',
    minFloor: 2, weight: 3,
    desc: 'Four forks of you that left the sandbox. Each one that falls makes the rest faster.',
  };

  B.BOSSES.reviewer = {
    name: 'The Antagonistic Reviewer',
    subtitle: 'This does, in fact, NOT look good to me.',
    hp: 340, r: 40, speed: 45, contactDamage: 2, flying: true,
    behavior: 'reviewer', sprite: 'boss_reviewer', color: '#e8b896',
    minFloor: 3, weight: 3,
    desc: 'A floating face behind mirrored glasses. Slow, methodical, and never satisfied.',
  };

  // Etagen-Boss von Forgotten Branches (themeOnly). Gewicht 12 gegen 17 fuer die uebrigen sechs: dort beim ersten
  // Besuch etwa 41 % (die Abwechslungs-Regeln in rollBossVaried gelten wie fuer alle). hp gilt fuer den Knoten;
  // Treffer auf die Arme zaehlen zu 60 % (proxyMult in entities/boss.js).
  B.BOSSES.octopus_merge = {
    name: 'Octopus Merge',
    subtitle: 'Eight branches. One merge commit. Zero survivors.',
    hp: 330, r: 38, speed: 35, contactDamage: 2, flying: true,
    behavior: 'octopus_merge', sprite: 'boss_octopus_merge', color: '#a3602c',
    minFloor: 3, weight: 12, themeOnly: ['branches'], family: 'branches',
    desc: 'A tangle of roots around one huge merge commit. Every branch it absorbs makes the rest angrier.',
  };

  /**
   * Waehlt einen Boss fuer die Etage (deterministisch ueber den Etagen-RNG).
   * Auf Etage 1 nur die beiden "zugaenglicheren" Bosse (Monolith 60 %, Stakeholder 40 %);
   * ab Etage 2 kommen Friday Deploy, Infinite Loop und der Rogue Agent Swarm dazu, ab Etage 3 der Antagonistic Reviewer
   * (Gewichte 3, Stakeholder 2 — er ist etwas seltener, weil man ihn auf Etage 1 schon oft gesehen hat).
   * Etage 2: je 21 %, Stakeholder 14 %; ab Etage 3: je 18 %, Stakeholder 12 %.
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
    return rng.weighted(cands, (id) => B.bossWeightAt(B.BOSSES[id], th) / (1 + met(id)));
  };

  /** Gewicht eines Bosses auf einer Etage mit diesem Thema (Basisgewicht, fehlend = 1, mal Etagen-Faktor) */
  B.bossWeightAt = function (def, theme) {
    return (def.weight || 1) * B.themeWeight(def, theme);
  };

  /** Bosse, die auf Tiefe d mit Thema th auftauchen duerfen (minFloor erreicht, Etagen-Faktor > 0) */
  function bossPool(d, th) {
    return Object.keys(B.BOSSES).filter((id) => (B.BOSSES[id].minFloor || 1) <= d && B.bossWeightAt(B.BOSSES[id], th) > 0);
  }

  B.rollBoss = function (rng, depth, theme) {
    const d = Math.max(1, depth | 0);
    const th = theme === undefined ? B.themeKeyAt(d) : theme;
    const pool = bossPool(d, th);
    if (!pool.length) return Object.keys(B.BOSSES)[0] || null;
    return rng.weighted(pool, (id) => B.bossWeightAt(B.BOSSES[id], th));
  };
})(window.BOTA);
