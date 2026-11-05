/*
 * namespace.js — Globaler Namespace BOTA ("Binding Of The Agent"), Konstanten, Event-Bus, Storage.
 *
 * Alle anderen Dateien haengen sich an window.BOTA. Diese Datei muss als erstes geladen werden.
 */
'use strict';

window.BOTA = window.BOTA || {};

(function (B) {
  // ---------------------------------------------------------------------------
  // Konstanten fuer Raum- und Bildschirmgeometrie
  // ---------------------------------------------------------------------------
  const TILE = 64;           // Kachelgroesse in logischen Pixeln
  const COLS = 15;           // Raumbreite in Kacheln (inkl. Wandring)
  const ROWS = 9;            // Raumhoehe in Kacheln (inkl. Wandring)
  const HUD_H = 64;          // Hoehe der HUD-Leiste oberhalb des Raums

  B.C = {
    TILE, COLS, ROWS, HUD_H,
    ROOM_W: COLS * TILE,     // 960
    ROOM_H: ROWS * TILE,     // 576
    W: COLS * TILE,          // logische Canvas-Breite (960)
    H: ROWS * TILE + HUD_H,  // logische Canvas-Hoehe (640)
    DT: 1 / 60,              // fester Simulationsschritt (60 Hz)
    MAP_W: 9,                // Dungeon-Raster (Anzahl Raumzellen)
    MAP_H: 9,
    // Innenbereich (begehbare Flaeche ohne Waende), in Raumkoordinaten
    INNER: { x0: TILE, y0: TILE, x1: (COLS - 1) * TILE, y1: (ROWS - 1) * TILE },
    // Tuer-Positionen (Kachelkoordinaten in der Wand)
    DOOR_TILES: {
      up:    { col: 7,  row: 0 },
      down:  { col: 7,  row: 8 },
      left:  { col: 0,  row: 4 },
      right: { col: 14, row: 4 },
    },
  };

  // Richtungen fuer Tueren, Bewegung und Schuesse
  B.DIRS = {
    up:    { dx: 0,  dy: -1 },
    down:  { dx: 0,  dy: 1 },
    left:  { dx: -1, dy: 0 },
    right: { dx: 1,  dy: 0 },
  };
  B.OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Kacheltypen
  B.TILES = {
    FLOOR: 0,
    WALL: 1,
    ROCK: 2,    // zerstoerbar per Force Push
    BLOCK: 3,   // unzerstoerbar
    PIT: 4,     // blockiert Laeufer, nicht Flieger
    SPIKES: 5,  // verletzt den Spieler
    DOOR: 6,    // Tuerkachel in der Wand (Zustand haengt an room.doors)
    PROP: 7,    // zerstoerbares Objekt (Kiste, Busch, ...): wie ROCK, aber Spielerschuesse machen es kaputt
    CACTUS: 8,  // Kaktus (Sandbox Borders): solide wie ROCK, sticht bei Beruehrung, Explosionen sprengen ihn
  };

  // ---------------------------------------------------------------------------
  // Registries — werden von den data/*.js-Dateien befuellt
  // ---------------------------------------------------------------------------
  B.ITEMS = B.ITEMS || {};            // Item-Definitionen (siehe data/items.js)
  B.ENEMIES = B.ENEMIES || {};        // Gegner-Definitionen (siehe data/enemies.js)
  B.BOSSES = B.BOSSES || {};          // Boss-Definitionen (siehe data/bosses.js)
  B.BEHAVIORS = B.BEHAVIORS || {};    // Gegner-Verhalten (siehe entities/enemy.js)
  B.BOSS_BEHAVIORS = B.BOSS_BEHAVIORS || {}; // Boss-Verhalten (siehe entities/boss.js)
  B.PICKUP_TYPES = B.PICKUP_TYPES || {};     // Pickup-Typen (siehe entities/pickup.js)
  B.LAYOUTS = B.LAYOUTS || [];        // Raum-Layouts (siehe data/layouts.js)
  B.TEXT = B.TEXT || {};              // Texte, Sprueche (siehe data/text.js)

  // ---------------------------------------------------------------------------
  // Event-Bus: entkoppelt Audio/Effekte/HUD von der Spiellogik.
  // Listener-Fehler werden abgefangen, damit ein kaputter Listener nie das Spiel crasht.
  // ---------------------------------------------------------------------------
  B.bus = {
    handlers: Object.create(null),
    on(evt, fn) {
      (this.handlers[evt] = this.handlers[evt] || []).push(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) {
      const list = this.handlers[evt];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      const list = this.handlers[evt];
      if (!list) return;
      for (const fn of list.slice()) {
        try { fn(payload || {}); } catch (err) { console.error('[bus] listener for', evt, 'failed:', err); }
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Persistenz (localStorage)
  // SICHERHEIT: Es werden nur unkritische Einstellungen gespeichert. Gelesene Werte werden
  // gegen ein Schema geprueft; manipulierte/kaputte Eintraege fallen auf Defaults zurueck.
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'bota.v1';
  const DAILY_DATE = /^\d{8}$/;   // Tag eines Daily Runs: YYYYMMDD
  // dailyDate/dailyBest: bester Final Score des Daily Runs von genau einem Tag. Das ist der einzige Punktestand, der
  // einen Run ueberlebt, und bewusst keine Meta-Progression: Er aendert nichts am Spiel und verfaellt mit dem Datum.
  const DEFAULTS = { muted: false, bestFloor: 0, runs: 0, deaths: 0, dailyDate: '', dailyBest: 0 };

  B.storage = {
    data: Object.assign({}, DEFAULTS),
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw || raw.length > 2000) return this.data; // Groessenlimit gegen Unsinn
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Nur bekannte Schluessel mit passendem Typ uebernehmen
          if (typeof parsed.muted === 'boolean') this.data.muted = parsed.muted;
          for (const k of ['bestFloor', 'runs', 'deaths', 'dailyBest']) {
            const v = parsed[k];
            if (Number.isInteger(v) && v >= 0 && v < 1e9) this.data[k] = v;
          }
          if (typeof parsed.dailyDate === 'string' && DAILY_DATE.test(parsed.dailyDate)) this.data.dailyDate = parsed.dailyDate;
          // Ein Bestwert ohne gueltiges Datum gehoert zu keinem Tag und wird verworfen
          if (!this.data.dailyDate) this.data.dailyBest = 0;
        }
      } catch (e) {
        // localStorage kann gesperrt sein (z. B. privater Modus) -> Defaults behalten
      }
      return this.data;
    },
    save() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignorieren */ }
    },
    /** Bestwert des Daily Runs fuer den Tag `key` (YYYYMMDD); ein Wert von einem anderen Tag zaehlt als 0 */
    dailyBestFor(key) {
      return this.data.dailyDate === key ? this.data.dailyBest : 0;
    },
    /**
     * Ergebnis eines Daily Runs eintragen. Ein neuer Tag setzt den alten Bestwert zurueck.
     * @returns {boolean} true, wenn score den Bestwert dieses Tages verbessert hat
     */
    recordDaily(key, score) {
      if (typeof key !== 'string' || !DAILY_DATE.test(key)) return false;
      if (!Number.isInteger(score) || score < 0 || score >= 1e9) return false;
      const newDay = this.data.dailyDate !== key;
      if (newDay) { this.data.dailyDate = key; this.data.dailyBest = 0; }
      const better = score > this.data.dailyBest;
      if (better) this.data.dailyBest = score;
      if (better || newDay) this.save();
      return better;
    },
  };

  // ---------------------------------------------------------------------------
  // Seeds
  // SICHERHEIT: Jede Seed-Eingabe (Tastatur, Einfuegen) laeuft durch cleanSeed, das Ergebnis passt also immer zur
  // Whitelist [A-Z0-9-]{0,32}. Lange Eingaben werden vor dem Filtern gekappt, damit eine riesige Zwischenablage
  // nichts kostet.
  // ---------------------------------------------------------------------------
  B.cleanSeed = function (text) {
    return String(text === undefined || text === null ? '' : text).slice(0, 256)
      .replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 32);
  };

  /** Tag als YYYYMMDD in Ortszeit (ein Daily Run wechselt um Mitternacht des Spielers, nicht um Mitternacht UTC) */
  B.dailyKey = function (date) {
    const d = date || new Date();
    return String(d.getFullYear()).padStart(4, '0') + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  };

  /** Seed des Daily Runs: gleicher Tag, gleicher Seed, also gleiche Karten fuer das ganze Team */
  B.dailySeed = function (date) { return 'DAILY-' + B.dailyKey(date); };

  /**
   * HP-Faktor normaler Gegner auf einer Tiefe. game.spawnEnemy nutzt ihn, und Items mit festem Schaden skalieren
   * damit (rm -rf, On-Call Pager): Ihr Schaden behaelt so sein Verhaeltnis zu den Gegner-HP.
   */
  B.hpScale = function (depth) { return 1 + 0.15 * (depth - 1); };

  // ---------------------------------------------------------------------------
  // URL-Parameter (?seed=abc&debug)
  // SICHERHEIT: Seed wird strikt validiert, alles andere wird ignoriert.
  // ---------------------------------------------------------------------------
  B.params = (function () {
    const out = { seed: null, debug: false };
    try {
      const p = new URLSearchParams(window.location.search);
      const seed = p.get('seed');
      if (seed && /^[A-Za-z0-9-]{1,32}$/.test(seed)) out.seed = seed.toUpperCase();
      out.debug = p.has('debug');
    } catch (e) { /* ignorieren */ }
    return out;
  })();
})(window.BOTA);
