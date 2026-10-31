/*
 * palette.js — Farben, Schrift und Etagen-Farbthemen.
 *
 * Jede Etage hat ein eigenes Thema (Index = (depth - 1) % Anzahl, d. h. die Themen wiederholen sich
 * zyklisch, passend zu den Etagennamen in text.js). Felder eines Themas:
 *   floor / floorAlt   Schachbrett-Grundfarben des Bodens
 *   grout              Fugenfarbe (halbtransparent)
 *   wall / wallLight / wallDark / wallTop   Wandflaeche, Licht-Kante, Fugen, Mauerkrone
 *   door               Rahmenfarbe normaler Tueren
 *   accent             Akzentfarbe (Etagenkarte, Minimap-Rahmen, Deko)
 *   pattern            Bodenmuster: 'planks' | 'stone' | 'tiles' | 'plate' | 'grid' | 'void'
 *   decor              Deko-Stil:   'notes' | 'cobweb' | 'embers' | 'hazard' | 'glyphs' | 'stars' | 'glitch' | 'null' | 'fog'
 *   light              Farbe des weichen Lichtkegels in der Raummitte
 *   vignette           Abdunklungsfarbe am Bildrand (rgb-Tripel als String, Alpha wird im Renderer gesetzt)
 *   music              Parameter fuer die prozedurale Chiptune-Schleife (audio.js):
 *                      root = MIDI-Grundton, mode = Tonleiter-Name, bpm = Tempo, lead = Oszillator-Typ
 *
 * Alle Werte sind reine Darstellung; die Spiellogik liest hier nichts.
 */
'use strict';

(function (B) {
  // Systemschriften (keine Web-Fonts, siehe Sicherheitsabschnitt im DESIGN.md)
  B.FONT = 'Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';

  B.COLORS = {
    claude: '#d97757',       // Koralle/Terrakotta fuer den Spieler-Avatar
    claudeDark: '#a8553a',
    claudeLight: '#f0a07f',
    sparkle: '#ffcf4d',      // Gold der Antenne
    shotPlayer: '#f4c9a8',
    shotEnemy: '#c03a5a',
    heart: '#e04848',
    guardrail: '#5b8def',
    credit: '#f2c14e',
    push: '#6b6b6b',
    approval: '#7bc96f',
    text: '#f3ece6',
    textDim: '#a89f97',
    textFaint: '#6f6760',
    hudBg: '#14110f',
    hudLine: '#2b2420',
    panel: 'rgba(20,17,15,0.88)',
    boss: '#e04848',
    black: '#0d0b0a',
  };

  // Farbthemen pro Etage — Reihenfolge entspricht B.TEXT.FLOORS
  B.FLOOR_THEMES = [
    { // 1 The Backlog — warmes Karton-Braun, Holzdielen, vergessene Haftnotizen
      key: 'backlog',
      floor: '#3b3029', floorAlt: '#40342c', grout: 'rgba(0,0,0,0.22)',
      wall: '#2a211b', wallLight: '#4d3d31', wallDark: '#17110d', wallTop: '#352a22',
      door: '#5e4a3a', accent: '#d97757',
      pattern: 'planks', decor: 'notes',
      light: 'rgba(255,190,140,0.07)', vignette: '10,6,4',
      music: { root: 50, mode: 'dorian', bpm: 104, lead: 'square' },
    },
    { // 2 Legacy Codebase — staubiges Blaugrau, alte Steinplatten, Spinnweben
      key: 'legacy',
      floor: '#2f3538', floorAlt: '#343a3d', grout: 'rgba(0,0,0,0.25)',
      wall: '#1d2326', wallLight: '#3c474c', wallDark: '#0f1315', wallTop: '#262d31',
      door: '#4a565c', accent: '#7fb0c9',
      pattern: 'stone', decor: 'cobweb',
      light: 'rgba(170,210,230,0.05)', vignette: '4,7,9',
      music: { root: 45, mode: 'minor', bpm: 92, lead: 'triangle' },
    },
    { // 3 Dependency Hell — rostiges Dunkelbraun mit gluehenden Rissen
      key: 'dephell',
      floor: '#38261f', floorAlt: '#3e2b23', grout: 'rgba(0,0,0,0.28)',
      wall: '#2a1912', wallLight: '#4f2f1e', wallDark: '#150b06', wallTop: '#361f15',
      door: '#6a3a22', accent: '#f0a03c',
      pattern: 'tiles', decor: 'embers',
      light: 'rgba(255,130,50,0.10)', vignette: '40,8,0',
      music: { root: 47, mode: 'phrygian', bpm: 128, lead: 'sawtooth' },
    },
    { // 4 Production — Industrie-Rot, Riffelblech, Warnstreifen
      key: 'production',
      floor: '#2e2a2c', floorAlt: '#332f31', grout: 'rgba(0,0,0,0.3)',
      wall: '#2a1618', wallLight: '#4c2428', wallDark: '#14090a', wallTop: '#361b1e',
      door: '#5c2a2e', accent: '#e05a4f',
      pattern: 'plate', decor: 'hazard',
      light: 'rgba(255,90,80,0.05)', vignette: '16,0,0',
      music: { root: 45, mode: 'harmonic', bpm: 138, lead: 'square' },
    },
    { // 5 The Training Data — Gruenstich, Karopapier, verstreute Zeichen
      key: 'training',
      floor: '#29322b', floorAlt: '#2d3730', grout: 'rgba(0,0,0,0.2)',
      wall: '#18201a', wallLight: '#30402f', wallDark: '#0c110d', wallTop: '#1f2a21',
      door: '#3c5240', accent: '#8bc34a',
      pattern: 'grid', decor: 'glyphs',
      light: 'rgba(170,255,140,0.05)', vignette: '2,8,3',
      music: { root: 52, mode: 'major', bpm: 116, lead: 'triangle' },
    },
    { // 6 The Latent Space — Indigo mit Sternen (Einbettungen)
      key: 'latent',
      floor: '#25223a', floorAlt: '#29263f', grout: 'rgba(0,0,0,0.2)',
      wall: '#17142a', wallLight: '#332c58', wallDark: '#0b0915', wallTop: '#1e1a36',
      door: '#3f3670', accent: '#a78bfa',
      pattern: 'void', decor: 'stars',
      light: 'rgba(180,150,255,0.07)', vignette: '6,3,16',
      music: { root: 48, mode: 'lydian', bpm: 96, lead: 'sine' },
    },
    { // 7 Undefined Behavior — Glitch-Magenta/Tuerkis
      key: 'undefined',
      floor: '#2a2430', floorAlt: '#2f2836', grout: 'rgba(0,0,0,0.25)',
      wall: '#1a1420', wallLight: '#3d2a4a', wallDark: '#0c0910', wallTop: '#231b2b',
      door: '#5a2f62', accent: '#ff4fa3',
      pattern: 'tiles', decor: 'glitch',
      light: 'rgba(255,80,180,0.05)', vignette: '10,0,12',
      music: { root: 46, mode: 'locrian', bpm: 144, lead: 'square' },
    },
    { // 8 /dev/null — fast Schwarz, monochrom, Rauschen
      key: 'devnull',
      floor: '#1b1b1e', floorAlt: '#1f1f22', grout: 'rgba(255,255,255,0.025)',
      wall: '#0f0f11', wallLight: '#2b2b30', wallDark: '#050506', wallTop: '#151517',
      door: '#34343a', accent: '#d0d0d8',
      pattern: 'void', decor: 'null',
      light: 'rgba(255,255,255,0.03)', vignette: '0,0,0',
      music: { root: 43, mode: 'minor', bpm: 80, lead: 'triangle' },
    },
    { // 9 The Context Limit — bleiches Nebelblau, verblassender Text, Deja-vu
      key: 'context',
      floor: '#2d3542', floorAlt: '#323b49', grout: 'rgba(0,0,0,0.2)',
      wall: '#1c2230', wallLight: '#3d4a62', wallDark: '#0e121a', wallTop: '#242c3c',
      door: '#4a5a78', accent: '#9ec5ff',
      pattern: 'tiles', decor: 'fog',
      light: 'rgba(200,225,255,0.07)', vignette: '4,8,16',
      music: { root: 49, mode: 'mixolydian', bpm: 108, lead: 'square' },
    },
  ];

  /** Thema fuer eine Tiefe (zyklisch); robust gegen 0/negative Werte */
  B.themeFor = function (depth) {
    const n = B.FLOOR_THEMES.length;
    const d = Math.max(1, depth | 0);
    return B.FLOOR_THEMES[((d - 1) % n + n) % n];
  };
})(window.BOTA);
