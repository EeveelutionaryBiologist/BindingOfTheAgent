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
 *     // --- Etagen-Themen (optional, siehe B.themeWeight unten) ---
 *     themes: { branches: 3, devnull: 0 }, // Gewichtsfaktor je Etagen-Thema (key in FLOOR_THEMES); 0 = dort nie
 *     themeOnly: ['branches'],             // taucht NUR auf Etagen mit diesen Themen auf (minFloor gilt weiterhin)
 *   };
 *
 * Etagen-Themen: Gespawnt wird nach Tiefe UND nach dem Thema der Etage (B.themeFor(depth).key). Die Themen
 * wiederholen sich alle FLOOR_THEMES.length Etagen, ein "branches"-Gegner kommt also auf Etage 3, 13, 23, ...
 * wieder. Der Faktor wirkt auf das fertige Tiefen-Gewicht (nach minWeight/maxWeight) und auf bonusChance.
 * Gegner ohne themes/themeOnly verhalten sich exakt wie vorher (Faktor 1, keine zusaetzlichen RNG-Zuege),
 * bestehende Seeds bleiben also gleich, solange kein Gegner die Felder nutzt.
 *
 * Etagen-Freischaltung (DESIGN.md §7): Etage 1 ist sanft (Bug, Null Pointer, Memory Leak, selten eine
 * Hallucination), ab 2 kommen Fernkaempfer, Charger und der Graphics Glitch dazu, ab 3 Orbiter und Zombies, ab 4 Scope Creep.
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
    desc: "It's not a bug, it's a feature. A feature with mandibles.",
  };

  E.null_pointer = {
    name: 'Null Pointer', hp: 5, r: 14, speed: 140, contactDamage: 1, flying: true,
    behavior: 'fly_chase', sprite: 'enemy_null_pointer', color: '#c9ced6',
    minFloor: 1, weight: 7, weightPerFloor: -0.3, minWeight: 4, cost: 1, tags: ['fly', 'melee'],
    desc: 'Points at nothing. Charges at you anyway.',
  };

  E.memory_leak = {
    name: 'Memory Leak', hp: 14, r: 20, speed: 52, contactDamage: 1,
    behavior: 'split', params: { child: 'leaklet', count: 2, maxGrow: 1.35, growRate: 0.02 },
    sprite: 'enemy_memory_leak', color: '#8e5bd6',
    minFloor: 1, weight: 6, cost: 1.6, tags: ['melee'],
    desc: 'Gets bigger the longer you ignore it.',
  };

  E.flaky_test = {
    name: 'Flaky Test', hp: 10, r: 16, speed: 0, contactDamage: 1, flying: true,
    behavior: 'blink', params: { shotSpeed: 230, minD: 170, maxD: 400, shownMin: 1.4, shownMax: 2.0 },
    sprite: 'enemy_flaky_test', color: '#7bc96f', noFlip: true,
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 1.5, tags: ['ranged'],
    desc: 'Passes on my machine.',
  };

  E.merge_conflict = {
    name: 'Merge Conflict', hp: 18, r: 20, speed: 60, contactDamage: 1,
    behavior: 'charge', params: { dashSpeed: 480, windup: 0.5, align: 26, range: 560 },
    sprite: 'enemy_merge_conflict', color: '#4a86d8', noFlip: true,
    minFloor: 2, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 2, maxPerRoom: 3, tags: ['charge'],
    desc: '<<<<<<< HEAD',
  };

  E.jira_ticket = {
    name: 'Jira Ticket', hp: 18, r: 20, speed: 0, contactDamage: 1,
    behavior: 'turret', params: { interval: 1.7, shotSpeed: 190 },
    sprite: 'enemy_jira_ticket', color: '#d64545', noFlip: true,
    minFloor: 2, weight: 4, weightPerFloor: 0.3, maxWeight: 6, cost: 2, maxPerRoom: 2, tags: ['ranged', 'turret'],
    desc: 'Priority: Blocker. Assignee: you.',
  };

  E.deprecation_warning = {
    name: 'Deprecation Warning', hp: 12, r: 18, speed: 125, contactDamage: 1, flying: true,
    behavior: 'orbit', params: { radiusMin: 160, radiusMax: 220, shotSpeed: 220, interval: 2.4 },
    sprite: 'enemy_deprecation_warning', color: '#f2c14e', noFlip: true,
    minFloor: 3, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 1.5, maxPerRoom: 3, tags: ['fly', 'ranged'],
    desc: 'Will be removed in a future release. Not this one.',
  };

  E.spaghetti_code = {
    name: 'Spaghetti Code', hp: 14, r: 20, speed: 45, contactDamage: 1,
    behavior: 'shooter', params: { count: 3, spread: 0.3, shotSpeed: 200, interval: 2.5 },
    sprite: 'enemy_spaghetti_code', color: '#e8c36a',
    minFloor: 2, weight: 5, weightPerFloor: 0.2, maxWeight: 7, cost: 1.5, tags: ['ranged'],
    desc: 'Nobody knows where it starts. Or ends.',
  };

  E.zombie_process = {
    name: 'Zombie Process', hp: 14, r: 18, speed: 58, contactDamage: 1,
    behavior: 'revive', params: { reviveHp: 0.5, downTime: 1.8, angrySprite: 'enemy_zombie_process_angry' },
    sprite: 'enemy_zombie_process', color: '#9aa3a8',
    minFloor: 3, weight: 5, weightPerFloor: 0.3, maxWeight: 7, cost: 2, tags: ['melee'],
    desc: '`kill -9` recommended.',
  };

  E.scope_creep = {
    name: 'Scope Creep', hp: 10, r: 16, speed: 42, contactDamage: 1,
    behavior: 'grow', params: { maxGrow: 1.9, rate: 0.035, hpFactor: 1.6, ringAt: 1.5, ringInterval: 3.6, shotSpeed: 150 },
    sprite: 'enemy_scope_creep', color: '#6f9a3a',
    minFloor: 4, weight: 4, weightPerFloor: 0.3, maxWeight: 6, cost: 2, maxPerRoom: 2, tags: ['melee'],
    desc: 'Just one more small feature.',
  };

  E.hallucination = {
    name: 'Hallucination', hp: 6, r: 14, speed: 175, contactDamage: 1,
    behavior: 'mimic', params: { revealDist: 120 }, // Tarnung: siehe B.LOOSE_LOOT (pickup.js)
    sprite: 'enemy_hallucination', color: '#f2c14e',
    // Taucht nie ueber das normale Budget auf, sondern als Bonus-Ueberraschung (bonusChance)
    minFloor: 1, weight: 0, bonusChance: 0.1, cost: 0, maxPerRoom: 1, tags: ['fly'],
    desc: 'Looked real. Was, in fact, not real.',
  };

  E.graphics_glitch = {
    name: 'Graphics Glitch', hp: 10, r: 18, speed: 0, contactDamage: 1,
    behavior: 'glitch', params: { stepMin: 1, stepMax: 3, idleMin: 0.9, idleMax: 1.6, warn: 0.4, jump: 0.12,
      chaseBias: 0.6, hudGlitch: 7 },
    sprite: 'enemy_graphics_glitch', color: '#e040c0',
    minFloor: 2, weight: 4, weightPerFloor: 0.2, maxWeight: 6, cost: 1, maxPerRoom: 2, tags: ['melee'],
    desc: 'Is it supposed to look like this...?',
  };

  E.race_condition = {
    name: 'Race Condition', hp: 6, r: 13, speed: 165, contactDamage: 1,
    behavior: 'zigzag', params: { flipMin: 0.15, flipMax: 0.42, sprintChance: 0.2 },
    sprite: 'enemy_race_condition', color: '#e0603a',
    minFloor: 2, weight: 4, weightPerFloor: 0.2, maxWeight: 6, cost: 0.8, pack: 2, maxPerRoom: 4, tags: ['melee'],
    desc: 'Sometimes it hits first. Sometimes you do. Sometimes both.',
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

  // ---------------------------------------------------------------------------
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

  // Koerpersegment der Infinite Loop (Boss). Leitet Schaden an den Kopf weiter (entities/boss.js).
  E.loop_segment = {
    name: 'The Infinite Loop', hp: 1, r: 18, speed: 0, contactDamage: 1, flying: true,
    behavior: 'worm_segment', sprite: 'boss_infinite_loop_segment', color: '#3fb8c9', noFlip: true,
    spawn: false, cost: 0,
    desc: 'while (true) { suffer(); }',
  };

  // ---------------------------------------------------------------------------
  // Spawn-Logik
  // ---------------------------------------------------------------------------

  /** Thema-Schluessel einer Tiefe ('branches', 'devnull', ...) oder null, falls es keine Themen gibt */
  B.themeKeyAt = function (depth) {
    const t = B.themeFor ? B.themeFor(depth) : null;
    return (t && t.key) || null;
  };

  /**
   * Etagen-Faktor einer Gegner- ODER Boss-Definition fuer ein Thema (bosses.js nutzt dieselbe Funktion).
   *   themeOnly gesetzt und Thema nicht enthalten -> 0 (ausgeschlossen)
   *   themes[theme] gesetzt                       -> dieser Faktor (negative/ungueltige Werte zaehlen als 0)
   *   sonst                                       -> 1 (neutral)
   * Ein Thema von null (keine Themen bekannt) schliesst nur themeOnly-Definitionen aus.
   */
  B.themeWeight = function (def, theme) {
    if (Array.isArray(def.themeOnly) && !def.themeOnly.includes(theme)) return 0;
    if (def.themes && theme && Object.prototype.hasOwnProperty.call(def.themes, theme)) {
      const f = Number(def.themes[theme]);
      return Number.isFinite(f) && f > 0 ? f : 0;
    }
    return 1;
  };

  /**
   * Effektives Spawn-Gewicht einer Definition auf einer Tiefe (mit Etagen-Verlauf und Etagen-Thema).
   * theme: optional; ohne Angabe gilt das Thema der Tiefe (B.themeKeyAt).
   */
  B.enemyWeightAt = function (def, depth, theme) {
    const base = def.weight || 0;
    if (base <= 0) return 0;
    const w = base + (def.weightPerFloor || 0) * Math.max(0, depth - (def.minFloor || 1));
    const clamped = B.M.clamp(w, def.minWeight || 0, def.maxWeight !== undefined ? def.maxWeight : 99);
    return clamped * B.themeWeight(def, theme === undefined ? B.themeKeyAt(depth) : theme);
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
      // Auf dieser Etage ausgeschlossen (themeOnly / Faktor 0): weder im Pool noch als Bonus
      // (und damit auch kein RNG-Zug fuer seine Bonus-Chance)
      if (B.themeWeight(def, th) <= 0) continue;
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
      const p = (def.bonusChance + 0.01 * (d - 1)) * B.themeWeight(def, th);
      if (rng.chance(Math.min(0.25, p))) out.push(id);
    }
    return out;
  };
})(window.BOTA);
