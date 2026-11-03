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
 *   pattern            Bodenmuster: 'planks' | 'stone' | 'moss' | 'tiles' | 'plate' | 'grid' | 'void' | 'sand'
 *   decor              Deko-Stil:   'notes' | 'cobweb' | 'leaves' | 'embers' | 'hazard' | 'glyphs' | 'stars' | 'glitch'
 *                                   | 'null' | 'fog' | 'bones'
 *   wallDecor          optional: 'ivy' (Efeu an den Waenden)
 *   ambient            optional: 'fireflies' (animierte Lichtpunkte) | 'tumbleweed' (rollender Steppenlaeufer);
 *                      beides pro Frame gezeichnet
 *   tiles              optional: andere Sprites fuer Kacheltypen, z. B. { rock: 'tile_sandstone', block: 'tile_border' };
 *                      blockJoin: true = Block-Sprite hat 3 Frames (Einzelstueck / waagerecht / senkrecht) und der
 *                      Renderer waehlt den Frame nach den Nachbar-Bloecken (Zaeune laufen durch)
 *   cacti              optional, Kartengenerierung: Anteil der Felsen in normalen Raeumen, die zu Kakteen werden
 *                      (Kacheltyp CACTUS, solide und stechend; world/dungeon.js assignCacti)
 *   gen                optional, Kartengenerierung: { minDeadEnds } = Mindestzahl Sackgassen (Standard 3)
 *   props              zerstoerbare Objekte: { kinds: [Arten aus B.PROP_KINDS], chance (Anteil normaler Raeume
 *                      mit Objekten), max (hoechstens so viele pro Raum) }; tiefere Etagen mischen wilder
 *   light              Farbe des weichen Lichtkegels in der Raummitte
 *   vignette           Abdunklungsfarbe am Bildrand (rgb-Tripel als String, Alpha wird im Renderer gesetzt)
 *   music              Parameter fuer die prozedurale Chiptune-Schleife (audio.js):
 *                      root = MIDI-Grundton, mode = Tonleiter-Name, bpm = Tempo, lead = Oszillator-Typ,
 *                      chirps = gelegentliche Vogelrufe (optional)
 *
 * Alle Werte sind reine Darstellung — mit drei Ausnahmen: gen, props und cacti werden von world/dungeon.js gelesen
 * (verzweigtere Karten, zerstoerbare Objekte, Kakteen). Die Themen-Liste muss gleich lang sein wie
 * B.TEXT.FLOORS (der Rauchtest prueft das).
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
      props: { kinds: ['crate'], chance: 0.6, max: 3 },
      floor: '#3b3029', floorAlt: '#40342c', grout: 'rgba(0,0,0,0.22)',
      wall: '#2a211b', wallLight: '#4d3d31', wallDark: '#17110d', wallTop: '#352a22',
      door: '#5e4a3a', accent: '#d97757',
      pattern: 'planks', decor: 'notes',
      light: 'rgba(255,190,140,0.07)', vignette: '10,6,4',
      music: { root: 50, mode: 'dorian', bpm: 104, lead: 'square' },
    },
    { // 2 Legacy Codebase — staubiges Blaugrau, alte Steinplatten, Spinnweben
      key: 'legacy',
      props: { kinds: ['crate'], chance: 0.65, max: 3 },
      floor: '#2f3538', floorAlt: '#343a3d', grout: 'rgba(0,0,0,0.25)',
      wall: '#1d2326', wallLight: '#3c474c', wallDark: '#0f1315', wallTop: '#262d31',
      door: '#4a565c', accent: '#7fb0c9',
      pattern: 'stone', decor: 'cobweb',
      light: 'rgba(170,210,230,0.05)', vignette: '4,7,9',
      music: { root: 45, mode: 'minor', bpm: 92, lead: 'triangle' },
    },
    { // 3 Forgotten Branches — Waldboden mit Moos, Laub und Zweigen, Efeu an den Waenden, Gluehwuermchen.
      // Eigener Gruenton (Wald), deutlich von The Training Data (Karopapier, Etage 7) unterscheidbar.
      // gen.minDeadEnds: verzweigtere Karten ("Branches"), siehe Floor.generate.
      key: 'branches',
      props: { kinds: ['bush'], chance: 0.8, max: 4 },
      floor: '#25331f', floorAlt: '#283822', grout: 'rgba(0,0,0,0.22)',
      wall: '#1a2614', wallLight: '#34502a', wallDark: '#0b120a', wallTop: '#22321a',
      door: '#4f3c24', accent: '#a6d36b',
      pattern: 'moss', decor: 'leaves', wallDecor: 'ivy', ambient: 'fireflies',
      gen: { minDeadEnds: 7 },
      light: 'rgba(200,255,150,0.07)', vignette: '2,10,2',
      music: { root: 55, mode: 'dorian', bpm: 98, lead: 'triangle', chirps: true },
    },
    { // 4 Dependency Hell — rostiges Dunkelbraun mit gluehenden Rissen
      key: 'dephell',
      props: { kinds: ['package', 'carton'], chance: 0.7, max: 4 },
      floor: '#38261f', floorAlt: '#3e2b23', grout: 'rgba(0,0,0,0.28)',
      wall: '#2a1912', wallLight: '#4f2f1e', wallDark: '#150b06', wallTop: '#361f15',
      door: '#6a3a22', accent: '#f0a03c',
      pattern: 'tiles', decor: 'embers',
      light: 'rgba(255,130,50,0.10)', vignette: '40,8,0',
      music: { root: 47, mode: 'phrygian', bpm: 128, lead: 'sawtooth' },
    },
    { // 5 Production — Industrie-Rot, Riffelblech, Warnstreifen
      key: 'production',
      props: { kinds: ['package', 'carton'], chance: 0.7, max: 4 },
      floor: '#2e2a2c', floorAlt: '#332f31', grout: 'rgba(0,0,0,0.3)',
      wall: '#2a1618', wallLight: '#4c2428', wallDark: '#14090a', wallTop: '#361b1e',
      door: '#5c2a2e', accent: '#e05a4f',
      pattern: 'plate', decor: 'hazard',
      light: 'rgba(255,90,80,0.05)', vignette: '16,0,0',
      music: { root: 45, mode: 'harmonic', bpm: 138, lead: 'square' },
    },
    { // 6 Sandbox Borders — gedaempfter Sand (mittelhell, damit gelbe/bernsteinfarbene Gegnerschuesse lesbar
      // bleiben), Sandstein-Waende, Knochen; Kakteen statt eines Teils der Felsen, Grenzzaeune statt Metallbloecken,
      // Sandburgen als zerstoerbare Objekte, ab und zu rollt ein Steppenlaeufer durch. Eingefuegt 2026-11-02.
      key: 'sandbox',
      props: { kinds: ['sandcastle'], chance: 0.75, max: 4 },
      cacti: 0.5,
      tiles: { rock: 'tile_sandstone', block: 'tile_border', blockJoin: true },
      floor: '#6e5a3c', floorAlt: '#715d3e', grout: 'rgba(60,40,15,0.07)',
      wall: '#4a3622', wallLight: '#8a6a44', wallDark: '#24180c', wallTop: '#5c442b',
      door: '#7a5632', accent: '#f2b84b',
      pattern: 'sand', decor: 'bones', ambient: 'tumbleweed',
      light: 'rgba(255,215,140,0.08)', vignette: '34,20,6',
      music: { root: 50, mode: 'phrygian', bpm: 100, lead: 'triangle' },
    },
    { // 7 The Training Data — Gruenstich, Karopapier, verstreute Zeichen
      key: 'training',
      props: { kinds: ['carton', 'crate'], chance: 0.7, max: 4 },
      floor: '#29322b', floorAlt: '#2d3730', grout: 'rgba(0,0,0,0.2)',
      wall: '#18201a', wallLight: '#30402f', wallDark: '#0c110d', wallTop: '#1f2a21',
      door: '#3c5240', accent: '#8bc34a',
      pattern: 'grid', decor: 'glyphs',
      light: 'rgba(170,255,140,0.05)', vignette: '2,8,3',
      music: { root: 52, mode: 'major', bpm: 116, lead: 'triangle' },
    },
    { // 8 The Latent Space — Indigo mit Sternen (Einbettungen)
      key: 'latent',
      props: { kinds: ['bush', 'package'], chance: 0.75, max: 4 },
      floor: '#25223a', floorAlt: '#29263f', grout: 'rgba(0,0,0,0.2)',
      wall: '#17142a', wallLight: '#332c58', wallDark: '#0b0915', wallTop: '#1e1a36',
      door: '#3f3670', accent: '#a78bfa',
      pattern: 'void', decor: 'stars',
      light: 'rgba(180,150,255,0.07)', vignette: '6,3,16',
      music: { root: 48, mode: 'lydian', bpm: 96, lead: 'sine' },
    },
    { // 9 Undefined Behavior — Glitch-Magenta/Tuerkis
      key: 'undefined',
      props: { kinds: ['crate', 'bush', 'package', 'carton'], chance: 0.8, max: 5 },
      floor: '#2a2430', floorAlt: '#2f2836', grout: 'rgba(0,0,0,0.25)',
      wall: '#1a1420', wallLight: '#3d2a4a', wallDark: '#0c0910', wallTop: '#231b2b',
      door: '#5a2f62', accent: '#ff4fa3',
      pattern: 'tiles', decor: 'glitch',
      light: 'rgba(255,80,180,0.05)', vignette: '10,0,12',
      music: { root: 46, mode: 'locrian', bpm: 144, lead: 'square' },
    },
    { // 10 /dev/null — fast Schwarz, monochrom, Rauschen
      key: 'devnull',
      props: { kinds: ['crate', 'package'], chance: 0.75, max: 5 },
      floor: '#1b1b1e', floorAlt: '#1f1f22', grout: 'rgba(255,255,255,0.025)',
      wall: '#0f0f11', wallLight: '#2b2b30', wallDark: '#050506', wallTop: '#151517',
      door: '#34343a', accent: '#d0d0d8',
      pattern: 'void', decor: 'null',
      light: 'rgba(255,255,255,0.03)', vignette: '0,0,0',
      music: { root: 43, mode: 'minor', bpm: 80, lead: 'triangle' },
    },
    { // 11 The Context Limit — bleiches Nebelblau, verblassender Text, Deja-vu; seit 2026-11-03 trist und verregnet:
      // Platzregen ueber dem Raum, Pfuetzen mit Ringen, Wasserspuren an den Waenden, fernes Wetterleuchten und
      // Satzfetzen, die als Fluestern durch den Raum huschen (ambient 'rain', siehe renderer.js / game.updateAmbience)
      key: 'context',
      props: { kinds: ['crate', 'bush', 'package', 'carton'], chance: 0.8, max: 5 },
      floor: '#2a323f', floorAlt: '#2e3745', grout: 'rgba(0,0,0,0.24)',
      wall: '#1a202d', wallLight: '#38455c', wallDark: '#0c1018', wallTop: '#222a39',
      door: '#465674', accent: '#9ec5ff',
      pattern: 'tiles', decor: 'fog', wallDecor: 'rain', ambient: 'rain',
      light: 'rgba(190,215,250,0.05)', vignette: '2,5,12',
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
