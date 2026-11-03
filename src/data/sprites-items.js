/*
 * sprites-items.js — Item-Icons (Passiv & Aktiv), Pickup-Sprites, Podest, Falltuer, Bombe, Begleiter.
 *
 * Namenskonvention: 'item_<id>' fuer Items (muss zum sprite-Feld in data/items.js passen),
 * 'pickup_<type>' fuer Pickups, dazu 'pedestal', 'trapdoor', 'bomb', 'familiar_duck', 'orbital_test'.
 * Format siehe src/core/sprites.js. Fehlende Sprites werden als Magenta-Platzhalter gezeichnet.
 *
 * Stil: 1-px-Umrandung ('k'), 3–5 Farben pro Icon, Item-Icons max. 16x16 (Skalierung 4 -> 64 px),
 * Pickups ~9–12 px. Alle Motive sind Eigenentwuerfe (keine Logos/Marken, nichts aus anderen Spielen):
 * z. B. "Kubernetes" ist ein generisches hoelzernes Steuerrad, "Stack Overflow" ein bedrucktes Blatt.
 */
'use strict';

(function (B) {
  // ---------------------------------------------------------------------------
  // Gemeinsame Grundpalette. Jedes Sprite kann einzelne Zeichen ueberschreiben.
  // ---------------------------------------------------------------------------
  const BASE = {
    k: '#1c1614', // Umrandung
    w: '#f6f1ea', // Weiss (warm)
    W: '#ffffff', // Glanzlicht
    g: '#8d8780', // Grau
    G: '#c4bdb4', // Hellgrau
    d: '#45403c', // Dunkelgrau
    D: '#26221f', // Fast schwarz
    r: '#e04848', // Rot
    R: '#9e2b2b', // Dunkelrot
    o: '#d97757', // Koralle (Claude-Farbe)
    O: '#a8553a', // Dunkle Koralle
    y: '#f6d365', // Gelb
    Y: '#c9952a', // Gold/Dunkelgelb
    b: '#5b8def', // Blau
    B: '#2f5bb5', // Dunkelblau
    c: '#a8dcff', // Hellblau
    n: '#6cc35f', // Gruen
    N: '#3a8a3f', // Dunkelgruen
    p: '#a78bfa', // Lila
    P: '#6b4fc4', // Dunkellila
    m: '#9a6434', // Braun (Holz)
    M: '#5e3b1e', // Dunkelbraun
    t: '#e2b878', // Hellbraun / Pergament
    e: '#f29bb2', // Rosa
    E: '#c9668a', // Dunkelrosa
  };

  /** Kurzform: Sprite mit Grundpalette (+ Ueberschreibungen) definieren */
  function spr(name, rows, pal, scale) {
    B.defineSprite(name, { palette: Object.assign({}, BASE, pal || {}), rows, scale: scale || 4 });
  }

  // ===========================================================================
  // PASSIVE ITEMS (Design-Doc)
  // ===========================================================================

  // Extra GPU — schlichte Grafikkarte: Slotblech links, dunkle Abdeckung mit zwei grossen Luefter, gruene
  // Platine, goldene Kontakte
  spr('item_extra_gpu', [
    '.kkkkkkkkkkkkkk.',
    'kGkddddddddddddk',
    'kGkdkkkkkdkkkkkk',
    'kGkdkgGgkdkgGgkk',
    'kGkdkGDGkdkGDGkk',
    'kGkdkgGgkdkgGgkk',
    'kGkdkkkkkdkkkkkk',
    'kGkddddddddddddk',
    'kGknnnnnnnnnnnnk',
    '.k.kYkYkYkYkYkk.',
    '...kkkkkkkkkkk..',
  ], { n: '#3f8f4f' });

  // Off-Brand GPU — dieselbe Karte als Billigversion: aggressives Gold-Rot, drei winzige Luefter, Zierstreifen
  spr('item_offbrand_gpu', [
    '.kkkkkkkkkkkkkk.',
    'kGkRRRRRRRRRRRRk',
    'kGkRkkkRkkkRkkkk',
    'kGkYkykYkykYkykk',
    'kGkRkkkRkkkRkkkk',
    'kGkYRRYRRYRRYRRk',
    'kGkRRRRRRRRRRRRk',
    'kGknnnnnnnnnnnnk',
    '.k.kYkYkYkYkYkk.',
    '...kkkkkkkkkkk..',
  ], { n: '#3f8f4f', R: '#b3262b' });

  // Cold Brew — Eiskaffee-Becher mit Deckel, Strohhalm und Eiswuerfeln
  spr('item_cold_brew', [
    '.........kkkk...',
    '.........kook...',
    '.........kook...',
    '..kkkkkkkkookk..',
    '.kwwwwwwwwoowwk.',
    '.kkkkkkkkkookkk.',
    '..ktttttttootk..',
    '..kmmmmmmmoomk..',
    '..kmwwmmmmoomk..',
    '...kwwmmmmomk...',
    '...kmmmmwwmmk...',
    '....kmmmmmmk....',
    '....kMmmmmMk....',
    '.....kMMMMk.....',
    '.....kkkkkk.....',
  ], { m: '#6b3f22', M: '#4a2a14', t: '#ead2ae', c: '#d7eeff', w: '#eef6fb', G: '#b8c6d2' });

  // Mechanical Keyboard — Tastatur mit Koralle-Akzenttasten und Leertaste
  spr('item_mech_keyboard', [
    'kkkkkkkkkkkkkkk',
    'kdddddddddddddk',
    'kdoodwwdwwdwwdk',
    'kdOOdGGdGGdGGdk',
    'kdddddddddddddk',
    'kdwwdwwdwwdoodk',
    'kdGGdGGdGGdOOdk',
    'kdddddddddddddk',
    'kddwwwwwwwwwddk',
    'kddGGGGGGGGGddk',
    'kdddddddddddddk',
    'kkkkkkkkkkkkkkk',
  ], { d: '#3a3633', G: '#aaa298' });

  // Stack Overflow Printout — bedrucktes Blatt mit Eselsohr und rotem "Duplikat"-Stempel
  spr('item_stack_overflow', [
    'kkkkkkkkk...',
    'kwwwwwwwkk..',
    'kwgggggwkGk.',
    'kwwwwwwwkGGk',
    'kwggggwwkkkk',
    'kwwwwwwwwwwk',
    'kwgggggggwwk',
    'kwwwwwwwwwwk',
    'kwgggwwrrrwk',
    'kwwwwwrwwwrk',
    'kwgggwrwwwrk',
    'kwwwwwwrrrwk',
    'kwwwwwwwwwwk',
    'kkkkkkkkkkkk',
  ], { g: '#9a948c' });

  // Extended Context Window — Fenster mit Textzeilen und breitem Doppelpfeil
  spr('item_context_window', [
    'kkkkkkkkkkkkkkkk',
    'kooooooooroyonok',
    'kkkkkkkkkkkkkkkk',
    'kwwwwwwwwwwwwwwk',
    'kwggggggggggwwwk',
    'kwwwwwwwwwwwwwwk',
    'kwggggggwwwwwwwk',
    'kwwwwwwwwwwwwwwk',
    'kkkkkkkkkkkkkkkk',
    '................',
    '...kk......kk...',
    '..kyykkkkkkyyk..',
    '.kyyyyyyyyyyyyk.',
    '..kyykkkkkkyyk..',
    '...kk......kk...',
  ]);

  // Prompt Caching — Speicherchip mit Blitz
  spr('item_prompt_caching', [
    '....G.G.G.G....',
    '....G.G.G.G....',
    '..kkkkkkkkkkk..',
    '..kdddddddddk..',
    'GGkdddddyyydkGG',
    '..kddddyyyddk..',
    'GGkdddyyydddkGG',
    '..kddyyyyyydk..',
    'GGkddddyyyddkGG',
    '..kdddyyydddk..',
    'GGkddyydddddkGG',
    '..kddyddddddk..',
    '..kkkkkkkkkkk..',
    '....G.G.G.G....',
    '....G.G.G.G....',
  ], { d: '#33415a' });

  // Temperature 1.5 — Thermometer, gut aufgeheizt
  spr('item_temperature', [
    '....kk....',
    '...kwwk...',
    '...kwwkkk.',
    '...kwwk...',
    '...kwwkkk.',
    '...krrk...',
    '...krrkkk.',
    '...krrk...',
    '...krrkkk.',
    '...krrk...',
    '..krrrrk..',
    '.krrrrrrk.',
    '.krWrrrrk.',
    '.krrrrrRk.',
    '..kRRRRk..',
    '...kkkk...',
  ], { w: '#dfe9ee' });

  // Few-Shot Examples — drei gestaffelte Beispielkarten
  spr('item_few_shot', [
    'kkkkkkkk......',
    'kooooook......',
    'kwwkkkkkkkk...',
    'kwwkooooook...',
    'kwwkwwkkkkkkkk',
    'kwwkwwkooooook',
    'kwwkwwkwggggwk',
    'kwwkwwkwwwwwwk',
    'kwwkwwkwgggwwk',
    'kkkkwwkwwwwwwk',
    '...kwwkwggggwk',
    '...kkkkwwwwwwk',
    '......kwgggwwk',
    '......kkkkkkkk',
  ]);

  // Regex — Terminal mit ".*"
  spr('item_regex', [
    'kkkkkkkkkkkkkk',
    'kDDDDDDDDDDDDk',
    'kDDDDDDDDDDDDk',
    'kDDDDDnDnDnDDk',
    'kDDDDDDnnnDDDk',
    'kDDDDDnnnnnDDk',
    'kDDDDDDnnnDDDk',
    'kDDnnDnDnDnDDk',
    'kDDnnDDDDDDDDk',
    'kDDDDDDDDDDDDk',
    'kkkkkkkkkkkkkk',
  ], { n: '#7ee07a' });

  // Chain of Thought — Gedankenblase mit "..."
  spr('item_chain_of_thought', [
    '....kkkkkkkk....',
    '..kkwwwwwwwwkk..',
    '.kwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwk',
    'kwwoowwoowwoowwk',
    'kwwoowwoowwoowwk',
    'kwwwwwwwwwwwwwwk',
    '.kGwwwwwwwwwwGk.',
    '..kkGGGGGGGGkk..',
    '....kkkkkkkk....',
    '..kkk...........',
    '..kwk...........',
    '..kkk...........',
    'kk..............',
    'kk..............',
  ]);

  // Confident Hallucination — Zielscheibe mit Funkeln
  spr('item_confident_hallucination', [
    '....kkkkk....y..',
    '..kkrrrrrkk.yWy.',
    '.krrrwwwrrrk.y..',
    '.krwwwwwwwrk....',
    'krrwwrrrwwrrk...',
    'krwwrrrrrwwrk...',
    'krwwrrwrrwwrk...',
    'krwwrrrrrwwrk...',
    'krrwwrrrwwrrk...',
    '.krwwwwwwwrk....',
    '.krrrwwwrrrk....',
    '..kkrrrrrkk.....',
    '....kkkkk.......',
  ]);

  // Rubber Duck — gelbe Quietscheente
  const DUCK_ROWS = [
    '......kkkk....',
    '.....kyyyyk...',
    '....kyWyyyyk..',
    '....kyykyyyk..',
    '....kyyyyyyook',
    '....kyyyyyyOOk',
    '.k...kyyyykkk.',
    'kyk.kyyyyyk...',
    'kyykyyyyyyyk..',
    'kyyyyyyyyyyyk.',
    'kyyyyYYYYyyyk.',
    '.kyyyyyYYyyyk.',
    '..kYyyyyyyyk..',
    '...kkkkkkkk...',
  ];
  spr('item_rubber_duck', DUCK_ROWS, { o: '#ee8a2c', O: '#b8611a', Y: '#e0b23e' });

  // Unit Tests — zwei Reagenzglaeser (gruen = Tests bestanden) im Holzstaender
  spr('item_unit_tests', [
    'kkkkkk.kkkkkk',
    'kWwwwk.kWwwwk',
    'kWwwwk.kWwwwk',
    'kWwwwk.kWwwwk',
    'knnnnk.kWwwwk',
    'knWnnk.kWwwwk',
    'knnnnk.knnnnk',
    'mmmmmmmmmmmmm',
    'MMMMMMMMMMMMM',
    'knnnnk.knnWnk',
    'knnnnk.knnnnk',
    'kNnnnk.kNnnnk',
    '.kNNk...kNNk.',
    '..kk.....kk..',
  ], { w: '#dbe8ee', n: '#7ee07a' });

  // Linter — Fusselrolle (Wortspiel), mit Fusseln auf dem Klebepapier
  spr('item_linter', [
    '..kkkkkkkkkkkk..',
    '.kdwwwwwgwwwwdk.',
    '.kdwwgwwwwwwgdk.',
    '.kdwwwwwgwwwwdk.',
    '.kdGGGGGGGGGGdk.',
    '..kkkkkkkkkkkk..',
    '.......kGk......',
    '.......kGk......',
    '......kooOk.....',
    '......kooOk.....',
    '......kooOk.....',
    '......kooOk.....',
    '......kooOk.....',
    '......kOOOk.....',
    '.......kkk......',
  ]);

  // Dark Mode — Mondsichel mit Sternen
  spr('item_dark_mode', [
    '....kkkkk....',
    '..kkyyyyk....',
    '.kyWyyykk.w..',
    '.kyyyyk..www.',
    'kyyyyk....w..',
    'kyyyyk.......',
    'kYyyyk.......',
    'kYyyyk....w..',
    '.kYyyyk......',
    '.kYYyyykk....',
    '..kkYYyyk....',
    '....kkkkk....',
  ], { w: '#e6e0ff' });

  // The Cloud — Wolke mit eingebautem Server-Slot ("someone else's computer")
  spr('item_the_cloud', [
    '......kkkk......',
    '....kkwwwwkk....',
    '...kwWWwwwwwk...',
    '.kkkwWwwwwwwkkk.',
    'kwwwwwwwwwwwwwwk',
    'kwwwwwwwwwwwwwwk',
    'kwwwwddddndwwwwk',
    'kwwwwDDDDDDwwwwk',
    'kwwwwwwwwwwwwwwk',
    '.kcccccccccccck.',
    '..kkkkkkkkkkkk..',
  ], { c: '#b6d3ee', w: '#f4f8fc' });

  // RLHF — Herz mit "+1"
  spr('item_rlhf', [
    '..kkk...kkk..',
    '.krrrk.krrrk.',
    'krrWrrkrrrrrk',
    'krrrrrrrwrrrk',
    'krrrwrrwwrrrk',
    'krrwwwrrwrrrk',
    '.krrwrrrwrrk.',
    '..krrrrwwwk..',
    '...krrrrrk...',
    '....krrrk....',
    '.....krk.....',
    '......k......',
  ]);

  // Long-Term Support — Abreisskalender mit Herz, darunter schon das naechste Blatt
  spr('item_long_term_support', [
    '..k.......k..',
    '.kkkkkkkkkkk.',
    'kRRRRRRRRRRRk',
    'kRRRRRRRRRRRk',
    'kkkkkkkkkkkkk',
    'kwwwwwwwwwwGk',
    'kwwrrwwwrrwGk',
    'kwrrrrwrrrrGk',
    'kwrWrrrrrrrGk',
    'kwwrrrrrrrwGk',
    'kwwwrrrrrwwGk',
    'kwwwwrrrwwwGk',
    'kwwwwwrwwwwGk',
    'kGGGGGGGGGGGk',
    'kkkkkkkkkkkkk',
    '.kgggggggggk.',
    '..kkkkkkkkk..',
  ]);

  // Swap File — ein Herz faellt in ein Laufwerk (Festplatte mit blauem Etikett und gruener LED)
  spr('item_swap_file', [
    '...kk.kk.....',
    '..krrkrrk....',
    '..krWrrrk....',
    '...krrrk.....',
    '....krk......',
    '.....k.......',
    '.kkkkkkkkkkk.',
    'kGGGGGGGGGGdk',
    'kGDDDDDDDDGdk',
    'kGddddddddGdk',
    'kGdbbbbbbdGdk',
    'kGddddddddGdk',
    'kGGGGGGGGnGdk',
    'kddddddddddDk',
    '.kkkkkkkkkkk.',
  ]);

  // Electron App — klobiges App-Fenster (Titelleiste mit drei Punkten) mit dickem Herz und schwerem Sockel
  spr('item_electron_app', [
    'kkkkkkkkkkkkkk',
    'kbbbbbbbbrbynk',
    'kkkkkkkkkkkkkk',
    'kwwwwwwwwwwwGk',
    'kwwrrwwwrrwwGk',
    'kwrrrrwrrrrwGk',
    'kwrWrrrrrrrwGk',
    'kwwrrrrrrrwwGk',
    'kwwwrrrrrwwwGk',
    'kwwwwrrrwwwwGk',
    'kwwwwwrwwwwwGk',
    'kGGGGGGGGGGGGk',
    'kkkkkkkkkkkkkk',
    'kddddddddddddk',
    '.kkkkkkkkkkkk.',
  ]);

  // Reserved Instances — Server mit drei Einschueben (rote Status-LEDs) und einer Goldmuenze davor
  spr('item_reserved_instances', [
    '.kkkkkkkkkk...',
    'kddddddddddk..',
    'kdGGGGGGnrdk..',
    'kddddddddddk..',
    'kdGGGGGGnrdk..',
    'kddddddddddk..',
    'kdGGGGGGnrdk..',
    'kdddddkkkkk...',
    '.kkkkkyyyyyk..',
    '.....kyyWyyYk.',
    '.....kyYyyyYk.',
    '.....kyyYyyYk.',
    '......kYYYYk..',
    '.......kkkk...',
  ]);

  // Graceful Degradation — Herz mit Riss, die rechte Haelfte ist schon ausgeblichen (laeuft noch, nur schlechter)
  spr('item_graceful_degradation', [
    '..kkk...kkk..',
    '.krrrk.kRRRk.',
    'krrWrrkRRRRRk',
    'krrrrrkkRRRRk',
    'krrrrrrkRRRRk',
    '.krrrrkRRRRk.',
    '..krrrrkRRk..',
    '...krrkRRk...',
    '....krkRk....',
    '.....kkk.....',
  ]);

  // Constitutional Guardrails — blaues Schild mit Saeulen-Gebaeude
  spr('item_constitutional_guardrails', [
    'kkkkkkkkkkkkk',
    'kcbbbbbbbbbBk',
    'kcbbbwwwbbbBk',
    'kcbbwwwwwbbBk',
    'kcbwwwwwwwbBk',
    'kcbbwbwbwbbBk',
    'kcbbwbwbwbbBk',
    'kcbbwbwbwbbBk',
    'kcbwwwwwwwbBk',
    '.kcbbbbbbbBk.',
    '.kcbbbbbbbBk.',
    '..kcbbbbbBk..',
    '...kcbbbBk...',
    '....kcbBk....',
    '.....kkk.....',
  ], { c: '#8fb4ff' });

  // Technical Debt — Eisenkugel an der Kette, mit rotem "$"
  spr('item_technical_debt', [
    'kkk.............',
    'kGgk............',
    '.kgGk...........',
    '..kGgk..........',
    '...kgGk.........',
    '....kGgk........',
    '.....kgGkkkk....',
    '......kkddddkk..',
    '......kdGWdddk..',
    '.....kdGWrrrddk.',
    '.....kdGdrddddk.',
    '.....kdddrrrddk.',
    '.....kdddddrDDk.',
    '......kddrrrDk..',
    '......kkDDDDkk..',
    '........kkkk....',
  ], { d: '#3d3b40', D: '#262429', G: '#8c8a92', g: '#6a6870' });

  // Monorepo — riesiger, ueberquellender Ordner
  spr('item_monorepo', [
    '.kkkkk..........',
    'kYYYYYkkkkkkkk..',
    'kYYkkkkkkkkkkYk.',
    'kYkwwwwwwwwwwkYk',
    'kYkwgggggggwwkYk',
    'kkkkkkkkkkkkkkkk',
    'ktttttttttttttTk',
    'kttttwwwwwwttTTk',
    'kttttwggggwttTTk',
    'kttttwwwwwwttTTk',
    'kttttttttttttTTk',
    'kTTTTTTTTTTTTTTk',
    'kkkkkkkkkkkkkkkk',
  ], { t: '#f0c96a', T: '#c99a3a', Y: '#b07f2a' });

  // Microservices — vier verbundene Wuerfel
  spr('item_microservices', [
    'kkkkkk....kkkkkk',
    'koooOk....kbbbBk',
    'koooOkGGGGkbbbBk',
    'koooOkggggkbbbBk',
    'kOOOOk....kBBBBk',
    'kkkkkk....kkkkkk',
    '..Gg........Gg..',
    '..Gg........Gg..',
    '..Gg........Gg..',
    '..Gg........Gg..',
    'kkkkkk....kkkkkk',
    'knnnNk....kyyyYk',
    'knnnNkGGGGkyyyYk',
    'knnnNkggggkyyyYk',
    'kNNNNk....kYYYYk',
    'kkkkkk....kkkkkk',
  ]);

  // Kubernetes — generisches hoelzernes Steuerrad mit 8 Speichen (bewusst KEIN Logo)
  spr('item_kubernetes', [
    '.......kk.......',
    '...k..kttk..k...',
    '..ktkkkmmkkktk..',
    '.kttmttttmmmttk.',
    '..kmtttMMmmmmk..',
    '..kttMMMMMMmmk..',
    '.kkttMMMMMMmmkk.',
    'ktmmMMMyyMMMmmtk',
    'ktmmMMMyyMMMmmtk',
    '.kkmmMMMMMMmmkk.',
    '..kmmMMMMMMmmk..',
    '..kmmmmMMmmmmk..',
    '.kttmmmmmmmmttk.',
    '..ktkkkmmkkktk..',
    '...k..kttk..k...',
    '.......kk.......',
  ]);

  // Blockchain — Treppe aus goldenen Bloecken
  spr('item_blockchain', [
    'kkkkkk..........',
    'kyWyYk..........',
    'kyyyYk..........',
    'kyyyYk..........',
    'kYYYYk..........',
    'kkkkkkkk........',
    '.....kGgk.......',
    '......kgGk......',
    '.......kGgk.....',
    '........kgGk....',
    '.........kkkkkkk',
    '..........kyWyYk',
    '..........kyyyYk',
    '..........kyyyYk',
    '..........kYYYYk',
    '..........kkkkkk',
  ]);

  // Off-by-One Error — Wuerfel, dessen Mittelauge daneben gefallen ist
  spr('item_off_by_one', [
    'kkkkkkkkkkkk....',
    'kwwwwwwwwwGk....',
    'kwrrwwwrrwGk....',
    'kwrrwwwrrwGk....',
    'kwwwwwwwwwGk....',
    'kwwwwGGwwwGk....',
    'kwwwwGGwwwGk....',
    'kwwwwwwwwwGk....',
    'kwrrwwwrrwGk....',
    'kwrrwwwrrwGk....',
    'kGGGGGGGGGGk....',
    'kkkkkkkkkkkk....',
    '.............kk.',
    '............krrk',
    '............krrk',
    '.............kk.',
  ], { G: '#cfc6ba' });

  // YAML Config — Editor mit eingerueckten Zeilen und einem falsch eingerueckten (rot unterstrichen)
  spr('item_yaml_config', [
    'kkkkkkkkkkkkkk',
    'kDDDDDDDDDDDDk',
    'kDppppnnnnDDDk',
    'kDDDDDDDDDDDDk',
    'kDDDpppnnnnDDk',
    'kDDDDDDDDDDDDk',
    'kDDDDDppnnnDDk',
    'kDDDDDDDDDDDDk',
    'kDDDDpppnnnDDk',
    'kDDDDrrrrrrDDk',
    'kDDDpppnnDDDDk',
    'kDDDDDDDDDDDDk',
    'kkkkkkkkkkkkkk',
  ], { D: '#22304a', p: '#c5a3ff', n: '#9be37a', r: '#ff6b6b' });

  // Retry with Backoff — Sanduhr mit rotem ("Leben"-)Sand
  spr('item_retry_backoff', [
    'kkkkkkkkkkkk',
    'kmmmmmmmmmmk',
    'kkkkkkkkkkkk',
    '.kcccccccck.',
    '.kcrrrrrrck.',
    '..kcrrrrck..',
    '...kcrrck...',
    '....krrk....',
    '....kcrk....',
    '...kccrck...',
    '..kcccrcck..',
    '.kcccrrccck.',
    '.kcrrrrrrck.',
    'kkkkkkkkkkkk',
    'kmmmmmmmmmmk',
    'kkkkkkkkkkkk',
  ], { c: '#d6ecf7' });

  // Code Review — Lupe ueber Diff-Zeilen (gruen/rot)
  spr('item_code_review', [
    '.....kkk........',
    '...kkGGGkk......',
    '..kGGGGGGGk.....',
    '.kGGWccccGGk....',
    '.kGnnnnnncGk....',
    'kGGcccccccGGk...',
    'kGGrrrrrccGGk...',
    'kGGcccccccGGk...',
    '.kGcnnnnnnGk....',
    '.kGGcccccGGk....',
    '..kGGGGGGGGGk...',
    '...kkGGGkkGGmk..',
    '.....kkk..kmmmk.',
    '...........kmmmk',
    '............kmmk',
    '.............kk.',
  ], { c: '#cfeaff', G: '#aeb6bf' });

  // Daily Standup — Wecker
  spr('item_daily_standup', [
    '.kkk.......kkk.',
    'kyyyk.....kyyyk',
    'kyyyykkkkkyyyyk',
    '.kkkrrrrrrrkkk.',
    '..krrwwwwwrrk..',
    '.krrwwwdwwwrrk.',
    '.krwwwwdwwwwrk.',
    '.krwwwwdwwwwrk.',
    '.krwwwwdddwwrk.',
    '.krwwwwwwwwwrk.',
    '.krrwwwwwwwrrk.',
    '..kRRwwwwwRRk..',
    '...kRRRRRRRk...',
    '..kdkkkkkkkdk..',
    '..kk.......kk..',
  ]);

  // LGTM — Daumen hoch mit gruenem Haken
  spr('item_lgtm', [
    '...........nn',
    '..kk......nn.',
    '.kyyk.nn.nn..',
    '.kyyk..nnn...',
    '.kyyk...n....',
    'kyyyk........',
    'kyyyykkkkkkk.',
    'kyyyyyyyyyyyk',
    'kyyyyyykkkkk.',
    'kyyyyyyyyyyyk',
    'kyyyyyykkkkk.',
    'kyyyyyyyyyyk.',
    'kYyyyyykkkkk.',
    'kYYyyyyyyyk..',
    '.kkkkkkkkkk..',
  ], { n: '#7ee07a', Y: '#d9a93a' });

  // git blame — Zeigefinger, der auf jemand anderen zeigt
  spr('item_git_blame', [
    '................',
    '.....kkkkkkkkkk.',
    'kkkkkyyyyyyyyyyk',
    'kbbkyyyyykkkkkk.',
    'kbbkyyyyyyyk....',
    'kbbkyyyykkkk....',
    'kbbkyyyyyyk.....',
    'kbbkyyyykkk.....',
    'kbbkYyyyyyk.....',
    'kbbkkYYYYk......',
    'kkkk.kkkk.......',
  ], { Y: '#d9a93a' });

  // Vibe Coding — Sonnenbrille mit Verlaufsglaesern und Funkeln
  spr('item_vibe_coding', [
    '..y..........y..',
    '.yWy........yWy.',
    '..y..........y..',
    '................',
    'kkkkkkkkkkkkkkkk',
    'keWWeeekkeWWeeek',
    'kpWpppppkpWppppk',
    'kPPPPPPkkPPPPPPk',
    '.kPPPPk..kPPPPk.',
    '..kkkk....kkkk..',
  ]);

  // Tab Completion — Tab-Taste mit Pfeil
  spr('item_tab_completion', [
    '.kkkkkkkkkkkk.',
    'kGwwwwwwwwwwGk',
    'kGwwwwwwwwwwGk',
    'kGwwwwwdwwdwGk',
    'kGwwwwwwdwdwGk',
    'kGwddddddddwGk',
    'kGwwwwwwdwdwGk',
    'kGwwwwwdwwdwGk',
    'kGwwwwwwwwwwGk',
    'kGGGGGGGGGGGGk',
    'kggggggggggggk',
    '.kkkkkkkkkkkk.',
  ]);

  // Max Effort — dampfendes Gehirn
  spr('item_max_effort', [
    '..o...o...o...',
    '...o...o...o..',
    '..o...o...o...',
    '...kkkkkkkk...',
    '.kkeeeeEeeekk.',
    'keeEEeeEeEEeek',
    'keeeeEeEeeeEek',
    'kEEeeeeEeeEEek',
    'keeeEEeEeeeeek',
    'keEEeeeEeEEeek',
    '.keeeeeEeeeek.',
    '..kkkkkkkkkk..',
  ], { o: '#ff9a6a' });

  // ===========================================================================
  // AKTIVE ITEMS (Design-Doc)
  // ===========================================================================

  // Regenerate Response — Sprechblase mit Kreispfeil
  spr('item_regenerate_response', [
    '.kkkkkkkkkkkkkk.',
    'kwwwwwwowwwwwwwk',
    'kwwwwwwoowwwwwwk',
    'kwwwwooooowwwwwk',
    'kwwwooooowwwwwwk',
    'kwwooowowwwwwwwk',
    'kwwoowwwwwwwwwwk',
    'kwwoowwwwwoowwwk',
    'kwwooowwwooowwwk',
    'kwwwooooooowwwwk',
    'kwwwwooooowwwwwk',
    '.kkwkkkkkkkkkkk.',
    '..kwk...........',
    '..kk............',
  ]);

  // Stop Generating — roter Knopf mit weissem Quadrat
  spr('item_stop_generating', [
    '....kkkkk....',
    '..kkrrrrrkk..',
    '.krWrrrrrrrk.',
    '.krrrrrrrrrk.',
    'krrrwwwwwrrrk',
    'krrrwwwwwrrrk',
    'krrrwwwwwrrrk',
    'krrrwwwwwrrrk',
    'krrrwwwwwrrrk',
    '.krrrrrrrrrk.',
    '.kRrrrrrrrRk.',
    '..kkRRRRRkk..',
    '....kkkkk....',
  ]);

  // rm -rf node_modules — brennender Ordner
  spr('item_rm_rf', [
    '......k.........',
    '.....kyk...k....',
    '..k..kyk..kok...',
    '.kok.kyyk.kyok..',
    '.koykkyyykkyyok.',
    'kooyyoyyyoyyyook',
    'kooyyyyWyyyyyook',
    'kkkkkkkkkkkkkkkk',
    'kMMMMMkkkkkkkkk.',
    'kmmmmmmmmmmmmmmk',
    'kmttttttttttttmk',
    'kmttttttttttttmk',
    'kmttttttttttttmk',
    'kmttttttttttttmk',
    'kMMMMMMMMMMMMMMk',
    'kkkkkkkkkkkkkkkk',
  ], { o: '#ff8a3c', y: '#ffd166' });

  // /compact — Herz, von oben und unten flachgedrueckt
  spr('item_compact', [
    '..kkkkkkk..',
    '...kccck...',
    '....kck....',
    '.....k.....',
    '.kkk...kkk.',
    'krrrk.krrrk',
    'krWrrkrrrrk',
    'krrrrrrrrrk',
    '.kkrrrrrkk.',
    '...kkrkk...',
    '.....k.....',
    '.....k.....',
    '....kck....',
    '...kccck...',
    '..kkkkkkk..',
  ], { c: '#a8dcff' });

  // ===========================================================================
  // EIGENE ITEMS
  // ===========================================================================

  // Ctrl+C Ctrl+V — zwei ueberlappende Dokumente
  spr('item_copy_paste', [
    'kkkkkkkkk.....',
    'kGGGGGGGk.....',
    'kGgggggGk.....',
    'kGGGGGGGk.....',
    'kGgggkkkkkkkkk',
    'kGGGGkwwwwwwwk',
    'kGgggkwooooowk',
    'kGGGGkwwwwwwwk',
    'kGgggkwooooowk',
    'kGGGGkwwwwwwwk',
    'kkkkkkwoooowwk',
    '.....kwwwwwwwk',
    '.....kwoooowwk',
    '.....kwwwwwwwk',
    '.....kkkkkkkkk',
  ], { G: '#b9b2a8', g: '#8d8780' });

  // On-Call Pager — Pager mit "!!" und Vibrationslinien
  spr('item_on_call_pager', [
    '..kkkkkkkkkkkk..',
    '..kddddddddddk..',
    '..kdnnnnnnnndk..',
    'w.kdnnNnnNnndk.w',
    '.wkdnnNnnNnndkw.',
    'w.kdnnnnnnnndk.w',
    '..kdnnNnnNnndk..',
    '..kddddddddddk..',
    '..kdooddddoodk..',
    '..kddddddddddk..',
    '..kkkkkkkkkkkk..',
  ], { n: '#a8e08a', N: '#2f5a2a' });

  // Garbage Collector — gruene Tonne, aus der ein Herz "freigegeben" wird
  spr('item_garbage_collector', [
    '.....kk.kk..',
    '....krrkrrk.',
    '....krWrrrk.',
    '.....krrrk..',
    '......krk...',
    '....kkkkk...',
    '.kkkkkkkkkk.',
    'kNNNNNNNNNNk',
    'kkkkkkkkkkkk',
    '.knnNnnNnnk.',
    '.knnNnnNnnk.',
    '.knnNnnNnnk.',
    '.knnNnnNnnk.',
    '.kNnNnnNnNk.',
    '..kkkkkkkk..',
  ]);

  // Seed Funding — Geldsack mit Keimling
  spr('item_seed_funding', [
    '....nn.nn.....',
    '...nNNkNNn....',
    '......kNk.....',
    '.....kkkkk....',
    '......kmk.....',
    '....kkttkk....',
    '...kttttttk...',
    '..kttttYtttk..',
    '.kttttYYYtttk.',
    '.ktttYtYttttk.',
    'kttttYtYttttk.',
    'kttttYtYttttk.',
    '.ktttYYYttttk.',
    '.kTttttYtttTk.',
    '..kTTTTTTTTk..',
    '...kkkkkkkk...',
  ], { n: '#7ee07a', N: '#3a8a3f', Y: '#8a6a2a', T: '#b48a4a' });

  // Benchmark Overfitting — Pokal
  spr('item_benchmark_overfitting', [
    '.kkkkkkkkkkkk.',
    'kkyWyyyyyyyYkk',
    'kykyWyyyyyyYky',
    'kykyWyyyyyyYky',
    '.kkyyyyyyyyYk.',
    '...kyyyyyyYk..',
    '....kyyyyYk...',
    '.....kyyYk....',
    '......kYk.....',
    '......kYk.....',
    '....kkkkkkk...',
    '....kmmmmmk...',
    '...kMMMMMMMk..',
    '...kkkkkkkkk..',
  ]);

  // Feature Flag — Fahne, halb "an" (gruen), halb "aus" (grau)
  spr('item_feature_flag', [
    '.kk...........',
    'kyyk..........',
    'kyykkkkkkkkkk.',
    '.kGknnnnnnnnnk',
    '.kGknnnnnnnnk.',
    '.kGknnnnnnnnnk',
    '.kGkgggggggggk',
    '.kGkggggggggk.',
    '.kGkgggggggggk',
    '.kGkkkkkkkkkk.',
    '.kGk..........',
    '.kGk..........',
    '.kGk..........',
    '.kGk..........',
    'kkkkk.........',
  ], { n: '#7ee07a', g: '#9a948c' });

  // Ctrl+Z (aktiv) — Koralle-Taste mit "Z"
  spr('item_ctrl_z', [
    '.kkkkkkkkkkkk.',
    'kOooooooooooOk',
    'kOooooooooooOk',
    'kOoowwwwwwooOk',
    'kOooooooowwoOk',
    'kOoooooowwooOk',
    'kOooooowwoooOk',
    'kOoooowwooooOk',
    'kOoowwwwwwooOk',
    'kOooooooooooOk',
    'kOOOOOOOOOOOOk',
    'kMMMMMMMMMMMMk',
    '.kkkkkkkkkkkk.',
  ], { M: '#7a3a24' });

  // ===========================================================================
  // PICKUPS (kleiner, ~9–12 px)
  // ===========================================================================

  const HEART_ROWS = [
    '.kkk.kkk.',
    'krrrkrrrk',
    'krWrrrrrk',
    'krrrrrrrk',
    '.krrrrRk.',
    '..krrRk..',
    '...kRk...',
    '....k....',
  ];
  spr('pickup_heart', HEART_ROWS);
  spr('pickup_heart_half', [
    '.kkk.kkk.',
    'krrrk...k',
    'krWrk...k',
    'krrrk...k',
    '.krrk..k.',
    '..krk.k..',
    '...kkk...',
    '....k....',
  ]);
  // Guardrail-Herz: blau, mit hellem Querstreifen (die "Leitplanke")
  spr('pickup_guardrail', [
    '.kkk.kkk.',
    'kbbbkbbbk',
    'kbWbbbbbk',
    'kccccccck',
    '.kbbbbBk.',
    '..kbbBk..',
    '...kBk...',
    '....k....',
  ], { c: '#cfe0ff' });

  // Credit — Muenze mit "C"
  spr('pickup_credit', [
    '..kkkkk..',
    '.kyyyyyk.',
    'kyWYYYyyk',
    'kyYyyyyYk',
    'kyYyyyyyk',
    'kyYyyyyYk',
    'kyyYYYyyk',
    '.kYyyyYk.',
    '..kkkkk..',
  ]);
  // Credit-Stapel — drei Muenzen
  spr('pickup_credit5', [
    '..kkkkkkk..',
    '.kyyWyyyyk.',
    'kyyyyyyyyyk',
    'kYyyyyyyyYk',
    'kkYYYYYYYkk',
    'kyyyyyyyyyk',
    'kkYYYYYYYkk',
    'kyyyyyyyyyk',
    'kYYYYYYYYYk',
    '.kkkkkkkkk.',
  ]);

  // Force Push — kleine Bombe mit Koralle-Pfeil nach oben ("push")
  const PUSH_ROWS = [
    '........y.y',
    '.........y.',
    '........m.y',
    '.......m...',
    '...kkkkk...',
    '..kdddddk..',
    '.kdWdoddDk.',
    'kdWdoooddDk',
    'kddooooodDk',
    'kddddodddDk',
    '.kdddoddDk.',
    '..kdDDDDk..',
    '...kkkkk...',
  ];
  spr('pickup_push', PUSH_ROWS, { d: '#3b3b44', D: '#24242a', m: '#c9a27a' });
  spr('pickup_push2', [
    '.....y.y......',
    '......y...y.y.',
    '.....m.....y..',
    '....km....m...',
    '.kkkkk...km...',
    'kddddDkkkkk...',
    'kdWoddkddddDk.',
    'kdooodkdWoddDk',
    'kddoddkdooodDk',
    'kdDDDkkddoddDk',
    '.kkkkk.kdDDDk.',
    '........kkkk..',
  ], { d: '#3b3b44', D: '#24242a', m: '#c9a27a' });

  // Approval — Schluessel, dessen Griff ein gruener Haken-Kreis ist ("LGTM")
  spr('pickup_approval', [
    '.kkkk........',
    'knnnnk.......',
    'knnnWkkkkkkkk',
    'kWnWnyyyyyyyk',
    'knWnnkkkykyyk',
    '.kkkk...k.kk.',
  ], { n: '#5fbf6a', W: '#ffffff' });

  // README.md — Blatt Papier mit Eselsohr, blauer Ueberschrift und grauen Textzeilen
  spr('pickup_readme', [
    'kkkkkkkk...',
    'kwwwwwwkk..',
    'kwwwwwwkwk.',
    'kwbbbwwkkkk',
    'kwwwwwwwwwk',
    'kwgggggwwwk',
    'kwwwwwwwwwk',
    'kwggggggwwk',
    'kwwwwwwwwwk',
    'kwgggggggwk',
    'kwwwwwwwwwk',
    'kkkkkkkkkkk',
  ], { w: '#f4f0e6', b: '#4a86d8', g: '#9a948c' });

  // Rohr ("|") von oben: Stahlflansch mit vier Schrauben, oben ein eingepraegtes "|", dunkle Oeffnung mit
  // kreisendem Wasserstrudel (2 Frames). Bewusst grau/stahlblau statt gruen (keine Anleihe bei bekannten
  // Videospiel-Roehren). Die Zeilen werden aus Abstaenden zur Mitte berechnet (exakt runde Form, 16x16).
  function pipeFrame(alt) {
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let row = '';
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
        let ch = '.';
        if (d <= 3.3) {
          // Strudel: Spiralarme aus Winkel + Abstand; Frame 2 dreht sie weiter
          const ang = Math.atan2(dy, dx) + d * 0.9 + (alt ? Math.PI / 2 : 0);
          const arm = Math.cos(ang * 2);
          ch = arm > 0.55 ? 'w' : arm > 0 ? 'c' : 'd';
        } else if (d <= 4.4) ch = 'k';
        else if (d <= 7.0) ch = 's';
        else if (d <= 7.9) ch = 'k';
        if (ch === 's' && Math.abs(Math.abs(dx) - 4.5) < 0.6 && Math.abs(Math.abs(dy) - 4.5) < 0.6) ch = 'b'; // Schrauben
        if (ch === 's' && (x === 7 || x === 8) && (y === 1 || y === 2)) ch = 'j';                         // "|"
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }
  B.defineSprite('pipe', {
    palette: { k: '#16191d', s: '#8a929c', b: '#cfd5dc', j: '#3a4048', d: '#0a0d10', w: '#3fa9d6', c: '#1f5f7a' },
    scale: 4,
    frames: [pipeFrame(false), pipeFrame(true)],
  });

  // Truhe (Holz, goldene Beschlaege)
  spr('pickup_chest', [
    '.kkkkkkkkkk.',
    'kmmmmmmmmmmk',
    'kmttmmmmttmk',
    'kkkkkyykkkkk',
    'kMMMkYYkMMMk',
    'kmmmmkkmmmmk',
    'kmmmmmmmmmmk',
    'kMMMMMMMMMMk',
    'kkkkkkkkkkkk',
  ], { t: '#c08a50' });
  // Verschlossene Truhe (Stahl, Vorhaengeschloss mit Haken-Schluesselloch)
  spr('pickup_chest_locked', [
    '.kkkkkkkkkk.',
    'kGGGGGGGGGGk',
    'kGWGGkkGGWGk',
    'kkkkkyykkkkk',
    'kgggkyykgggk',
    'kgggkynkgggk',
    'kggggkkggggk',
    'kddddddddddk',
    'kkkkkkkkkkkk',
  ], { G: '#b7bcc6', g: '#8a8f99', d: '#5d626c', n: '#3a8a3f' });
  // Geoeffnete Truhe (Deckel hochgeklappt, leer)
  spr('pickup_chest_open', [
    '.kkkkkkkkkk.',
    'kmmmmmmmmmmk',
    'kMMMMMMMMMMk',
    'kkkkkkkkkkkk',
    'kDDDDDDDDDDk',
    'kmmmmkkmmmmk',
    'kmmmmmmmmmmk',
    'kMMMMMMMMMMk',
    'kkkkkkkkkkkk',
  ]);

  // ===========================================================================
  // UMGEBUNG: Podest, Falltuer, Bombe
  // ===========================================================================

  // Podest: kleiner Server-Sockel mit Statuslampe
  spr('pedestal', [
    'kkkkkkkkkkkkkk',
    'kGGGGGGGGGGGGk',
    'kkkkkkkkkkkkkk',
    '.kddddddddddk.',
    '.kdnddggggddk.',
    '.kddddddddddk.',
    '.kdoddggggddk.',
    '.kDDDDDDDDDDk.',
    'kkkkkkkkkkkkkk',
  ], { G: '#9a948c', d: '#5c544d', D: '#3f3934' });

  // Falltuer: dunkles Loch mit Holzrahmen und Leitersprossen ("cd ..")
  spr('trapdoor', [
    'kkkkkkkkkkkkkkkk',
    'kmmmmmmmmmmmmmmk',
    'kmkkkkkkkkkkkkmk',
    'kmkDDDDDDDDDDkmk',
    'kmkDDtDDDDtDDkmk',
    'kmkDDttttttDDkmk',
    'kmkDDtDDDDtDDkmk',
    'kmkDDtDDDDtDDkmk',
    'kmkDDttttttDDkmk',
    'kmkDDtDDDDtDDkmk',
    'kmkDDtDDDDtDDkmk',
    'kmkDDttttttDDkmk',
    'kmkDDDDDDDDDDkmk',
    'kmkkkkkkkkkkkkmk',
    'kMMMMMMMMMMMMMMk',
    'kkkkkkkkkkkkkkkk',
  ], { D: '#0d0a08', t: '#4a3a2a' });

  // Bombe im Raum (gleiches Motiv wie das Pickup, etwas groesser gezeichnet)
  spr('bomb', PUSH_ROWS, { d: '#3b3b44', D: '#24242a', m: '#c9a27a' }, 4);

  // ===========================================================================
  // BEGLEITER
  // ===========================================================================

  // Rubber Duck als Begleiter: gleiche Ente, kleiner skaliert
  spr('familiar_duck', DUCK_ROWS, { o: '#ee8a2c', O: '#b8611a', Y: '#e0b23e' }, 3);

  // Unit-Test-Orbital: gruene Plakette mit weissem Haken
  spr('orbital_test', [
    '..kkkkk..',
    '.knnnnnk.',
    'knnnnnnnk',
    'knnnnnWnk',
    'knnnnWnnk',
    'knWnWnnnk',
    'knnWnnnnk',
    '.kNnnnNk.',
    '..kkkkk..',
  ], { n: '#5fbf6a', N: '#3a8a3f' }, 3);
})(window.BOTA);
