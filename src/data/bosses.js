/*
 * bosses.js — Boss-Definitionen (Verhalten in entities/boss.js).
 *
 *   BOTA.BOSSES.<id> = {
 *     name: 'The Monolith', subtitle: 'Single point of failure since 1998.',  // Intro-Karte
 *     hp: 360, r: 44, speed: 50, contactDamage: 2, flying: false,
 *     behavior: 'monolith',          // Schluessel in BOTA.BOSS_BEHAVIORS
 *     params: {}, sprite: 'boss_monolith', color: '#8a8f98', minFloor: 1, weight: 1,
 *   };
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

  /**
   * Waehlt einen Boss fuer die Etage (deterministisch ueber den Etagen-RNG).
   * Auf Etage 1 nur die beiden "zugaenglicheren" Bosse (Monolith 60 %, Stakeholder 40 %);
   * ab Etage 2 alle vier (Gewichte 3/2/3/3 — der Stakeholder ist etwas seltener, weil man ihn
   * auf Etage 1 schon oft gesehen hat).
   */
  B.rollBoss = function (rng, depth) {
    const d = Math.max(1, depth | 0);
    const pool = Object.keys(B.BOSSES).filter((id) => (B.BOSSES[id].minFloor || 1) <= d);
    if (!pool.length) return Object.keys(B.BOSSES)[0] || null;
    return rng.weighted(pool, (id) => B.BOSSES[id].weight || 1);
  };
})(window.BOTA);
