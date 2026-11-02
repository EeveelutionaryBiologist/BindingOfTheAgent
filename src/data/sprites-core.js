/*
 * sprites-core.js — Kern-Sprites: Spieler (Claude-Avatar), Kacheln, HUD-Icons, Minimap-Icons.
 *
 * Format siehe src/core/sprites.js ('.' und ' ' sind transparent, jedes andere Zeichen
 * wird ueber die Palette in eine Farbe uebersetzt).
 *
 * Der Avatar ist ein EIGENES Design: ein runder Korall-Blob ("Mochi"-Form) mit zwei
 * Punktaugen, roten Baeckchen, winzigen Fuessen und einer 4-zackigen Funkel-Antenne.
 * Ausdruecklich KEIN Logo und keine Anlehnung an fremde Spielfiguren.
 *
 * Damit alle Richtungen/Frames konsistent bleiben, wird der Avatar aus Ebenen zusammengesetzt:
 *   Antenne (8 Zeilen) + Koerper (10 Zeilen) + Fuesse (3 Zeilen) + Polster (4 Zeilen) = 25 Zeilen.
 * Das untere Polster sorgt dafuer, dass der Koerper (nicht die Antenne) optisch auf dem
 * Schatten des Spielers sitzt (player.js zeichnet das Sprite zentriert bei y - 8).
 */
'use strict';

(function (B) {
  // ===========================================================================
  // Hilfsfunktionen fuer das Zusammensetzen von ASCII-Sprites
  // ===========================================================================

  /** Verschiebt eine Zeile um n Spalten (n > 0 nach rechts), fuellt mit '.' auf, Laenge bleibt gleich. */
  function shiftRow(row, n) {
    if (!n) return row;
    const w = row.length;
    if (n > 0) return ('.'.repeat(n) + row).slice(0, w);
    return (row.slice(-n) + '.'.repeat(-n)).slice(0, w);
  }

  /** Setzt einzelne Pixel in einem Zeilen-Array: stamps = [[zeile, spalte, zeichen], ...] (gibt Kopie zurueck) */
  function stamp(rows, stamps) {
    const out = rows.map((r) => r.split(''));
    for (const [r, c, ch] of stamps) {
      if (out[r] && c >= 0 && c < out[r].length) out[r][c] = ch;
    }
    return out.map((r) => r.join(''));
  }

  /** Spiegelt Zeilen horizontal (fuer symmetrische Varianten) */
  function mirror(rows) {
    return rows.map((r) => r.split('').reverse().join(''));
  }

  /** Polstert jede Zeile links/rechts um n transparente Pixel */
  function padRows(rows, n) {
    const p = '.'.repeat(n);
    return rows.map((r) => p + r + p);
  }

  // ===========================================================================
  // Claude-Avatar
  // ===========================================================================

  // Palette: Koralle/Terrakotta mit warmen Schattierungen, goldene Funkel-Antenne.
  const AV_PAL = {
    D: '#5a2717', // Umriss (dunkles Rotbraun statt Schwarz -> weicher Look)
    o: '#d97757', // Grundfarbe Koralle
    l: '#ea9473', // Licht (oben links)
    L: '#ffc7a8', // Glanzpunkt
    d: '#b65c3f', // Schatten (unten rechts)
    k: '#1c1210', // Augen
    m: '#5a2015', // Mund
    p: '#f07c7c', // Baeckchen
    f: '#c4664a', // Fuesse (zwischen Grundton und Schatten, damit sie sich vom Umriss abheben)
    s: '#7a3b26', // Antennen-Stiel
    y: '#ffcf4d', // Funkel-Arme (gold)
    z: '#ffe9a3', // Funkel-Spitzen (hell)
    Y: '#fff3c4', // Funkel-Kern (hell)
    W: '#ffffff', // Funkel-Zentrum
    g: '#8d847c', // Funkel "aus" (verletzt/tot) — grau
    G: '#c9c1b8', // Funkel-Zentrum "aus"
    r: '#d94a4a', // Zunge (Item-Jubel)
  };

  /**
   * Antenne: 4-zackiger Funkelstern (5x7) + Stiel.
   * sway verschiebt den Stern seitlich (Wippen beim Laufen), dim = grau (verletzt/tot).
   */
  function antenna(sway, dim) {
    // 5x7: senkrecht gestreckter Stern mit rautenfoermigem Kern (liest sich als Funkeln, nicht als Kreuz)
    const star = [
      '......z......',
      '......y......',
      '.....yYy.....',
      '....zYWYz....',
      '.....yYy.....',
      '......y......',
      '......z......',
    ].map((r) => shiftRow(r, sway));
    // Stiel folgt dem Stern erst ab 2 Pixeln Auslenkung (diagonale Pixel wirken wie ein Knick)
    const stem = shiftRow('......s......', Math.trunc(sway / 2));
    const rows = star.concat([stem]);
    if (!dim) return rows;
    return rows.map((r) => r.replace(/[yz]/g, 'g').replace(/[YW]/g, 'G'));
  }

  // Koerper ohne Gesicht (Rueckansicht). 13 breit, 10 hoch; Licht oben links, Schatten unten rechts.
  const BODY_BASE = [
    '....DDDDD....',
    '..DDlLLooDD..',
    '.DlLLooooooD.',
    'DlloooooooodD',
    'DlooooooooodD',
    'DoooooooooodD',
    'DoooooooooodD',
    'DoooooooooddD',
    '.DdooooooddD.',
    '..DDDDDDDDD..',
  ];

  // Gesichter als Stempel [zeile, spalte, zeichen] relativ zum Koerper
  const FACES = {
    down: [
      [4, 4, 'k'], [5, 4, 'k'], [4, 8, 'k'], [5, 8, 'k'],   // zwei Punktaugen (1x2)
      [6, 2, 'p'], [6, 3, 'p'], [6, 9, 'p'], [6, 10, 'p'],  // Baeckchen
      [6, 6, 'm'],                                           // kleiner Mund
    ],
    left: [
      [4, 2, 'k'], [5, 2, 'k'], [4, 5, 'k'], [5, 5, 'k'],
      [6, 1, 'p'], [6, 6, 'p'], [6, 7, 'p'],
      [6, 3, 'm'],
    ],
    right: [
      [4, 7, 'k'], [5, 7, 'k'], [4, 10, 'k'], [5, 10, 'k'],
      [6, 5, 'p'], [6, 6, 'p'], [6, 11, 'p'],
      [6, 9, 'm'],
    ],
    up: [],
    // Verletzt: zusammengekniffene Augen "> <" und offener Mund
    hurt: [
      [3, 3, 'k'], [4, 4, 'k'], [5, 3, 'k'],
      [3, 9, 'k'], [4, 8, 'k'], [5, 9, 'k'],
      [6, 6, 'm'], [7, 6, 'm'],
      [6, 2, 'p'], [6, 10, 'p'],
    ],
    // Item-Jubel: Freudenaugen "^ ^" und breites Grinsen mit Zunge
    happy: [
      [4, 3, 'k'], [3, 4, 'k'], [4, 5, 'k'],
      [4, 7, 'k'], [3, 8, 'k'], [4, 9, 'k'],
      [6, 5, 'm'], [6, 6, 'm'], [6, 7, 'm'], [7, 6, 'r'],
      [5, 2, 'p'], [5, 10, 'p'],
    ],
    // Tot: X-Augen und flacher Mund
    dead: [
      [3, 3, 'k'], [3, 5, 'k'], [4, 4, 'k'], [5, 3, 'k'], [5, 5, 'k'],
      [3, 7, 'k'], [3, 9, 'k'], [4, 8, 'k'], [5, 7, 'k'], [5, 9, 'k'],
      [7, 5, 'm'], [7, 6, 'm'], [7, 7, 'm'],
    ],
  };

  // Fuesse: je 3 Zeilen. Frontal: abwechselnd ein Fuss gehoben/gesenkt. Seitlich: Schritt/geschlossen.
  const FEET = {
    stand:  ['..DffD.DffD..', '...DD...DD...', '.............'],
    stepL:  ['..DffD..DD...', '..DffD.......', '...DD........'],
    stepR:  ['...DD..DffD..', '.......DffD..', '........DD...'],
    spread: ['.DffD...DffD.', '..DD.....DD..', '.............'],
    close:  ['....DffffD...', '.....DDDD....', '.............'],
  };

  const PAD = ['.............', '.............', '.............', '.............'];

  /** Setzt einen Avatar-Frame zusammen */
  function avatarFrame(face, feet, sway, dim) {
    const body = stamp(BODY_BASE, FACES[face] || []);
    return antenna(sway, dim).concat(body, FEET[feet], PAD);
  }

  // Laufzyklus: 4 Frames (player.js schaltet den Frame beim Laufen weiter).
  // Frontal/Rueckseite: Fuesse wechseln, Antenne wippt links/rechts.
  B.defineSprite('player_down', {
    palette: AV_PAL, scale: 4,
    frames: [
      avatarFrame('down', 'stand', 0),
      avatarFrame('down', 'stepL', -1),
      avatarFrame('down', 'stand', 0),
      avatarFrame('down', 'stepR', 1),
    ],
  });
  B.defineSprite('player_up', {
    palette: AV_PAL, scale: 4,
    frames: [
      avatarFrame('up', 'stand', 0),
      avatarFrame('up', 'stepR', 1),
      avatarFrame('up', 'stand', 0),
      avatarFrame('up', 'stepL', -1),
    ],
  });
  // Seitlich: Antenne zieht nach hinten (Fahrtwind), Fuesse spreizen/schliessen sich.
  B.defineSprite('player_left', {
    palette: AV_PAL, scale: 4,
    frames: [
      avatarFrame('left', 'stand', 1),
      avatarFrame('left', 'spread', 2),
      avatarFrame('left', 'stand', 1),
      avatarFrame('left', 'close', 0),
    ],
  });
  B.defineSprite('player_right', {
    palette: AV_PAL, scale: 4,
    frames: [
      avatarFrame('right', 'stand', -1),
      avatarFrame('right', 'spread', -2),
      avatarFrame('right', 'stand', -1),
      avatarFrame('right', 'close', 0),
    ],
  });

  // Generisches 'player' (Fallback fuer aeltere Aufrufer, Titelbild): Frontansicht.
  B.defineSprite('player', {
    palette: AV_PAL, scale: 4,
    frames: [avatarFrame('down', 'stand', 0), avatarFrame('down', 'stand', 0)],
  });

  // Verletzt: zwei Frames (Antenne zittert), grauer Funkelstern
  B.defineSprite('player_hurt', {
    palette: AV_PAL, scale: 4,
    frames: [avatarFrame('hurt', 'stand', -1, true), avatarFrame('hurt', 'stand', 1, true)],
  });

  // Tot (Todesbildschirm)
  B.defineSprite('player_dead', {
    palette: AV_PAL, scale: 4,
    rows: avatarFrame('dead', 'stand', 0, true),
  });

  /**
   * Item-Jubel: Aermchen hoch ("\\o/"), das Item schwebt darueber (player.js).
   * 4 Pixel breiter als die anderen Frames (17 statt 13), damit die Arme Platz haben.
   */
  function itemGetFrame(sway) {
    const rows = padRows(avatarFrame('happy', 'stand', sway), 2);
    const by = 8; // Zeile, in der der Koerper beginnt (nach 8 Antennen-Zeilen)
    // Arm als 2 Pixel dicke Diagonale von der Koerperseite (Koerper-Zeile 2) schraeg nach oben aussen
    const arm = [
      [by - 2, 0, 'D'], [by - 2, 1, 'D'],
      [by - 1, 0, 'D'], [by - 1, 1, 'l'], [by - 1, 2, 'D'],
      [by + 0, 1, 'D'], [by + 0, 2, 'o'], [by + 0, 3, 'D'],
      [by + 1, 2, 'D'], [by + 1, 3, 'o'], [by + 1, 4, 'o'],
      [by + 2, 3, 'D'], [by + 2, 4, 'o'],
    ];
    const W = rows[0].length;
    // rechter Arm = gespiegelter linker Arm ('l' wird rechts zu 'o', Licht kommt von links)
    const stamps = arm.concat(arm.map(([r, c, ch]) => [r, W - 1 - c, ch === 'l' ? 'o' : ch]));
    return stamp(rows, stamps);
  }
  B.defineSprite('player_itemget', {
    palette: AV_PAL, scale: 4,
    frames: [itemGetFrame(0), itemGetFrame(0)],
  });

  // ===========================================================================
  // Rogue Agents (Boss "Rogue Agent Swarm", Verhalten in entities/boss.js)
  // ===========================================================================
  // Abtruennige Kopien des Avatars: derselbe Koerper, aber grau-gruen umgefaerbt, ein rot gluehendes Auge,
  // flacher Mund, keine Baeckchen. Jeder der vier hat ein eigenes Erkennungszeichen (roter bzw. gruener
  // Funkelstern, Bauhelm, Headset), damit man sie im Kampf auseinanderhalten kann. Groesser als der
  // Spieler (scale 5 statt 4). Frame 2: Auge flackert, eine Koerperzeile "reisst" seitlich.

  const ROGUE_PAL = Object.assign({}, AV_PAL, {
    D: '#1d2a24', o: '#6f8f7c', l: '#94b3a0', L: '#c4dccd', d: '#47604f', f: '#55705f', s: '#2f3f37',
    k: '#0b100e', m: '#14201a', e: '#ff3b5c', E: '#ffd0d8',
    h: '#e0b020', H: '#f4d36a', b: '#c0c8d4', c: '#7d879c', // Bauhelm gelb; Headset hellgrau (hebt sich ab)
  });
  const ROGUE_FACE = [
    [4, 4, 'k'], [5, 4, 'k'],                               // normales Auge
    [4, 8, 'e'], [4, 9, 'e'], [5, 8, 'e'], [5, 9, 'e'],     // gluehendes Auge (2x2)
    [6, 5, 'm'], [6, 6, 'm'], [6, 7, 'm'],                  // flacher Mund
  ];
  const ROGUE_TOPS = {
    star: antenna(0, false),
    hat: [
      '.............', '.............', '.............', '.............',
      '....hhhhh....', '..hhHHHHHhh..', '.hhhhhhhhhhh.', 'hhhhhhhhhhhhh',
    ],
    headset: [
      '.............', '.............', '.............', '.............', '.............',
      '....bbbbb....', '..bb.....bb..', '.b.........b.',
    ],
  };
  // Headset: Ohrmuscheln an den Koerperseiten + Mikrofon-Buegel
  const HEADSET_STAMPS = [
    [3, 0, 'c'], [4, 0, 'c'], [5, 0, 'c'], [3, 12, 'c'], [4, 12, 'c'], [5, 12, 'c'],
    [6, 1, 'b'], [7, 2, 'b'], [7, 3, 'b'],
  ];

  function rogueFrame(top, glitch) {
    let body = stamp(BODY_BASE, ROGUE_FACE.concat(top === 'headset' ? HEADSET_STAMPS : []));
    if (glitch) {
      body = stamp(body, [[4, 8, 'E'], [4, 9, 'E'], [5, 8, 'E'], [5, 9, 'E']]);
      body[6] = shiftRow(body[6], 1); // Bildriss
    }
    return ROGUE_TOPS[top].concat(body, FEET.stand);
  }
  const ROGUE_VARIANTS = [
    ['boss_rogue_agent_a', 'star', { y: '#ff3b5c', z: '#ff9aa8', Y: '#ffd0d8', W: '#ffffff' }],
    ['boss_rogue_agent_b', 'star', { y: '#3bff7a', z: '#a8ffc4', Y: '#e0ffe9', W: '#ffffff' }],
    ['boss_rogue_agent_c', 'hat', {}],
    ['boss_rogue_agent_d', 'headset', {}],
  ];
  for (const [name, top, pal] of ROGUE_VARIANTS) {
    B.defineSprite(name, {
      palette: Object.assign({}, ROGUE_PAL, pal), scale: 5,
      frames: [rogueFrame(top, false), rogueFrame(top, true)],
    });
  }
  // Gruppenbild fuer Intro-Karte und Inhaltsliste: die Sterne werden hier per Zeichen unterschieden
  // (r = roter, g = gruener Stern), weil ein Sprite nur eine Palette hat.
  (function () {
    const tint = (rows, a, b, c, d) => rows.map((r) => r.replace(/y/g, a).replace(/z/g, b).replace(/Y/g, c).replace(/W/g, d));
    const A = tint(rogueFrame('star', false), '1', '2', '3', '4');
    const Bv = tint(rogueFrame('star', false), '5', '6', '7', '4');
    const C = rogueFrame('hat', false), Dv = rogueFrame('headset', false);
    const side = (a, b) => a.map((r, i) => r + '.' + b[i]);
    B.defineSprite('boss_rogue_swarm', {
      palette: Object.assign({}, ROGUE_PAL, {
        1: '#ff3b5c', 2: '#ff9aa8', 3: '#ffd0d8', 4: '#ffffff', 5: '#3bff7a', 6: '#a8ffc4', 7: '#e0ffe9',
      }),
      scale: 4,
      rows: side(A, Bv).concat(['.'.repeat(27)], side(C, Dv)),
    });
  })();

  // ===========================================================================
  // Kacheln (16x16 Pixel bei Skalierung 4 = eine 64-px-Kachel)
  // ===========================================================================

  // Fels: drei Varianten (renderer.js waehlt pro Kachel deterministisch einen Frame).
  const ROCK_PAL = {
    K: '#1f1a17', // Umriss
    H: '#d8d0c5', // Glanzlicht
    b: '#b0a699', // hell
    a: '#8c8278', // Grundton
    e: '#6a6158', // Schatten
    f: '#4c453f', // Tiefschatten / Risse
    m: '#6f8f4e', // Moos
    M: '#4f6b36', // Moos dunkel
    s: 'rgba(0,0,0,0.35)', // Bodenschatten
  };
  const ROCK_FRAMES = [
      // Variante 1: grosser runder Brocken
      [
        '................',
        '................',
        '......KKKKK.....',
        '....KKbHHbaKK...',
        '...KbbHHbbaaaK..',
        '..KbbbbbbaaaaeK.',
        '..KbbbaaaaaaaeK.',
        '.KbbaaaaaaaaaeeK',
        '.KbaaaaaaaaaeeeK',
        '.KaaaaaaaaaeeefK',
        '.KaaaaaaaaeeeffK',
        '..KeaaaaeeeeffK.',
        '..KKeeeeeefffKK.',
        '.ssKKKKKKKKKKss.',
        '...ssssssssss...',
        '................',
      ],
      // Variante 2: zwei kleinere Steine
      [
        '................',
        '................',
        '................',
        '........KKKKK...',
        '...KKKK.KbHbaK..',
        '..KbHbaKbbbaaeK.',
        '.KbHbbaaKaaaaeK.',
        '.KbbaaaaeKaeefK.',
        '.KbaaaaaeeKfffK.',
        '.KaaaaaeeefKKKss',
        '.KeaaaeeeffKsss.',
        '..KeeeeeffK.....',
        '..sKKKKKKKss....',
        '...sssssss......',
        '................',
        '................',
      ],
      // Variante 3: flacher Brocken mit Riss und Moos
      [
        '................',
        '................',
        '................',
        '.....KKKKKKK....',
        '...KKmmbHHbaKK..',
        '..KmmMbbHbbaaaK.',
        '.KbmbbbfbaaaaaeK',
        '.KbbbbbbfaaaaeeK',
        '.KbbaaaafaaaeeeK',
        '.KbaaaafaaaeeefK',
        '.KaaaaafaaeeeffK',
        '..KeeaafeeeeffK.',
        '.ssKKKKKKKKKKKss',
        '...sssssssssss..',
        '................',
        '................',
      ],
  ];
  B.defineSprite('tile_rock', { palette: ROCK_PAL, scale: 4, frames: ROCK_FRAMES });
  // Sandstein (Sandbox Borders, theme.tiles.rock): dieselben Formen, warme Sandtoene, Moos wird zu Schatten
  B.defineSprite('tile_sandstone', {
    palette: Object.assign({}, ROCK_PAL, {
      K: '#3a2814', H: '#f4dfb4', b: '#d8b884', a: '#b8935e', e: '#946f42', f: '#6e4f2c', m: '#a8834f', M: '#8a6a3e',
    }),
    scale: 4,
    frames: ROCK_FRAMES,
  });

  // Block: unzerstoerbarer Stahlblock ("Legacy-Monolith im Kleinformat") mit Nieten und Fase.
  B.defineSprite('tile_block', {
    palette: {
      K: '#14171b', // Umriss
      H: '#a9b6c2', // Fase oben/links (Licht)
      h: '#8796a4', // helle Flaeche
      a: '#66737f', // Grundton
      e: '#4b5560', // Schatten
      f: '#343c44', // Fase unten/rechts
      n: '#d4dde5', // Niete Glanz
      N: '#2a3138', // Niete Schatten
      x: '#56616c', // Kreuzstrebe
    },
    scale: 4,
    rows: [
      'KKKKKKKKKKKKKKKK',
      'KHHHHHHHHHHHHHhK',
      'KHhnhhhhhhhhnhaK',
      'KHhNaaaaaaaaNaeK',
      'KHhaxaaaaaaxaaeK',
      'KHhaaxaaaaxaaaeK',
      'KHhaaaxaaxaaaaeK',
      'KHhaaaaxxaaaaaeK',
      'KHhaaaaxxaaaaaeK',
      'KHhaaaxaaxaaaaeK',
      'KHhaaxaaaaxaaaeK',
      'KHhaxaaaaaaxaaeK',
      'KHhnaaaaaaaanaeK',
      'KHhNeeeeeeeeNeeK',
      'KhfffffffffffffK',
      'KKKKKKKKKKKKKKKK',
    ],
  });

  // Grube: dunkles Loch mit sichtbarer hinterer Innenwand (oben) und Kante.
  // renderer.js verbindet benachbarte Gruben, indem es die Kanten zu Nachbargruben ueberdeckt.
  B.defineSprite('tile_pit', {
    palette: {
      K: '#120d0b', // Kante
      w: '#3b2f28', // Innenwand oben (beleuchtet)
      v: '#241c18', // Innenwand unten
      x: '#060405', // Tiefe
      r: '#4d4038', // Randlicht unten
    },
    scale: 4,
    rows: [
      '.KKKKKKKKKKKKKK.',
      'KwwwwwwwwwwwwwwK',
      'KwwwwwwwwwwwwwwK',
      'KvvvvvvvvvvvvvvK',
      'KvvvvvvvvvvvvvvK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KxxxxxxxxxxxxxxK',
      'KrxxxxxxxxxxxxrK',
      '.KrrrrrrrrrrrrK.',
    ],
  });

  // Stacheln: Metallplatte mit vier pyramidenfoermigen Dornen.
  (function () {
    const plate = [];
    for (let r = 0; r < 16; r++) {
      if (r === 1 || r === 14) plate.push('.pppppppppppppp.');
      else if (r > 1 && r < 14) plate.push('.pqqqqqqqqqqqqp.');
      else plate.push('................');
    }
    // Ein Dorn: Pyramide 7 breit, 7 hoch; Licht links (W/b), Schatten rechts (a/e)
    const spike = [
      '...W...',
      '...Wa..',
      '..WWa..',
      '..Wbae.',
      '.WWbae.',
      '.Wbbaee',
      'KKKKKKK',
    ];
    const stamps = [];
    const place = (ox, oy) => {
      spike.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] !== '.') stamps.push([oy + r, ox + c, row[c]]);
      });
    };
    // vier Dornen im 2x2-Raster auf der Platte
    place(1, 1); place(8, 1); place(1, 8); place(8, 8);
    B.defineSprite('tile_spikes', {
      palette: {
        p: '#2a2624', // Plattenrand
        q: '#3b3532', // Platte
        K: '#1a1716', // Dorn-Umriss / Sockel
        W: '#f2eee9', // Dorn-Glanz
        b: '#c9c2ba', // Dorn hell
        a: '#9a928a', // Dorn Grundton
        e: '#6c655e', // Dorn Schatten
      },
      scale: 4,
      rows: stamp(plate, stamps),
    });
  })();

  // ===========================================================================
  // Zerstoerbare Objekte (Kacheltyp PROP, siehe B.PROP_KINDS in layouts.js): je 16x16 bei Skalierung 4,
  // Frame 0 heil, Frame 1 beschaedigt (Riss + abgebrochenes Eck bzw. kahle Stellen beim Busch).
  // ===========================================================================

  /** Zeilen aus einer Funktion (x, y) -> Zeichen */
  /**
   * Kontur automatisch ergaenzen: jedes leere Pixel ('.') neben (4er-Nachbarschaft) einem gefuellten Pixel wird zu
   * `ch`. Spart bei Formen aus Rechtecken (Kaktus, Sandburg) das Abzaehlen von Hand.
   */
  function autoOutline(rows, ch) {
    const H = rows.length, W = rows[0].length;
    const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '.' && rows[y][x] !== 's';
    return rows.map((row, y) => row.split('').map((px, x) => (
      px === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ? ch : px
    )).join(''));
  }

  /**
   * Formen aus Rechtecken [x0, y0, x1, y1] (inklusive) auf ein 16x16-Raster malen. Spalte x0 = Licht ('L'),
   * x1 = Schatten ('D'), dazwischen Grundton ('M'); die oberen Ecken breiter Formen bleiben leer (abgerundet).
   */
  function shapeRows(shapes) {
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    for (const [x0, y0, x1, y1] of shapes) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (y === y0 && x1 - x0 >= 2 && (x === x0 || x === x1)) continue;
          g[y][x] = x === x0 ? 'L' : x === x1 ? 'D' : 'M';
        }
      }
    }
    return g.map((r) => r.join(''));
  }

  // Kaktus (Sandbox Borders, Kacheltyp CACTUS): drei Varianten wie beim Fels. Solide und stechend, deshalb
  // kraeftiges Gruen mit hellen Stacheln — hebt sich klar vom Sand ab. Stacheln ('p') sitzen rhythmisch auf der
  // Kontur, Bodenschatten ('s') unter der Form. Zeichen: k Kontur, L/M/D Gruen hell/mittel/dunkel, p Stachel,
  // f Bluete, F Bluetenmitte, s Schatten
  const CACTUS_PAL = {
    k: '#17240f', L: '#8fbf5a', M: '#5f9238', D: '#3d6626', p: '#f6efd8', f: '#ff86a8', F: '#ffd34d',
    s: 'rgba(0,0,0,0.3)',
  };
  function cactusRows(shapes, stamps) {
    const bottom = Math.max(...shapes.map((sh) => sh[3]));
    let rows = autoOutline(shapeRows(shapes), 'k');
    // Bodenschatten: unter der unteren Kontur, eine Zeile tiefer (etwas breiter)
    rows = rows.map((row, y) => (y === bottom + 2 ? row.split('').map((px, x) => (
      rows[bottom + 1][x] === 'k' || rows[bottom + 1][x + 1] === 'k' ? 's' : px)).join('') : row));
    // Stacheln: jedes dritte Konturpixel an den Seiten (nicht am Boden)
    rows = rows.map((row, y) => row.split('').map((px, x) => (px === 'k' && y < bottom && (x * 5 + y * 3) % 4 === 0 ? 'p' : px)).join(''));
    return stamp(rows, stamps || []);
  }
  B.defineSprite('tile_cactus', {
    palette: CACTUS_PAL, scale: 4,
    frames: [
      // Saeulenkaktus mit zwei Armen
      cactusRows([[6, 1, 9, 13], [2, 4, 4, 8], [2, 8, 6, 9], [11, 3, 13, 6], [9, 6, 13, 7]]),
      // Fasskaktus mit Bluete
      cactusRows([[4, 6, 11, 13], [5, 5, 10, 13]], [[4, 7, 'f'], [4, 8, 'F'], [4, 9, 'f'], [3, 8, 'f']]),
      // Feigenkaktus: drei Scheiben, rosa Fruechte
      cactusRows([[2, 8, 7, 13], [7, 4, 11, 10], [10, 9, 14, 13]], [[3, 8, 'f'], [3, 10, 'f'], [7, 12, 'f']]),
    ],
  });

  // Grenzzaun (Sandbox Borders, theme.tiles.block mit blockJoin): unzerstoerbar wie der Stahlblock.
  //   Frame 0: einzelne Absperrung (rot-weiss gestreifte Betonbarriere)
  //   Frame 1: Maschendrahtzaun waagerecht (Pfosten links/rechts, Draht ueber die volle Breite -> laeuft durch)
  //   Frame 2: Maschendrahtzaun senkrecht
  // Zeichen: k Kontur, w Weiss, r Rot, R Rot dunkel, g Beton, G Beton dunkel, P Pfosten, Q Pfosten dunkel,
  // m Maschendraht, b Stacheldraht, s Schatten
  const BORDER_PAL = {
    k: '#1f1a17', w: '#f2ece0', r: '#d64545', R: '#9c2f2f', g: '#c9c1b2', G: '#968d7e',
    P: '#9aa0a8', Q: '#5c626a', m: 'rgba(210,214,220,0.75)', b: '#c9ced6', s: 'rgba(0,0,0,0.3)',
  };
  const BORDER_BARRIER = gridRows(16, 16, (x, y) => {
    if (y < 4 || y > 14) return '.';
    if (y === 14) return x >= 1 && x <= 14 ? 's' : '.';
    if (y === 4 || y === 13 || x === 0 || x === 15) return (y === 4 && (x === 0 || x === 15)) ? '.' : 'k';
    if (y >= 11) return y === 12 ? 'G' : 'g';                          // Betonfuss
    return Math.floor((x + y) / 3) % 2 ? (y === 10 ? 'R' : 'r') : 'w';  // diagonale Warnstreifen
  });
  const BORDER_FENCE_H = gridRows(16, 16, (x, y) => {
    if (y === 15) return '.';
    if ((x === 2 || x === 13) && y >= 3 && y <= 13) return y === 13 ? 's' : 'P';  // Pfosten
    if ((x === 3 || x === 14) && y >= 3 && y <= 12) return 'Q';
    if (y === 3) return x % 3 === 0 ? 'k' : 'b';                                   // Stacheldraht oben
    if (y === 5 || y === 11) return 'G';                                           // Querstangen
    if (y > 5 && y < 11) return (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? 'm' : '.';  // Maschendraht
    if (y === 12) return 's';
    return '.';
  });
  const BORDER_FENCE_V = gridRows(16, 16, (x, y) => {
    if ((y === 2 || y === 13) && x >= 5 && x <= 10) return x === 10 ? 'Q' : 'P';  // Pfosten (von oben gesehen)
    if (x === 5 || x === 10) return 'G';                                           // Laengsstangen
    if (x === 7) return y % 3 === 0 ? 'k' : 'b';                                   // Stacheldraht in der Mitte
    if (x > 5 && x < 10) return (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? 'm' : '.';
    if (x === 11) return 's';
    return '.';
  });
  B.defineSprite('tile_border', { palette: BORDER_PAL, scale: 4, frames: [BORDER_BARRIER, BORDER_FENCE_H, BORDER_FENCE_V] });

  // Sandburg (Sandbox Borders, zerstoerbares Objekt): zwei Tuerme mit Zinnen, Burgfried mit Faehnchen, Tor.
  // Frame 1 (beschaedigt): der rechte Turm ist eingestuerzt, Sand rieselt. Zeichen: k Kontur, L/M/D Sand
  // hell/mittel/dunkel, T Tor/Fenster, r Fahne, s Schatten
  const SANDCASTLE_PAL = {
    k: '#4a3420', L: '#f2dcae', M: '#e0bf85', D: '#b8955a', T: '#6e5232', r: '#d64545', s: 'rgba(0,0,0,0.28)',
  };
  function sandcastleRows(broken) {
    const shapes = [[1, 6, 5, 13], [6, 4, 9, 13], [1, 10, 14, 13]];
    if (!broken) shapes.push([10, 6, 14, 13]);
    let rows = shapeRows(shapes);
    // Zinnen: Luecken in der obersten Reihe der Tuerme
    const notch = [[1, 6], [3, 6], [5, 6], [6, 4], [9, 4]].concat(broken ? [] : [[10, 6], [12, 6], [14, 6]]);
    rows = stamp(rows, notch.map(([x, y]) => [y, x, '.']));
    if (broken) rows = stamp(rows, [[9, 10, 'D'], [9, 11, 'M'], [9, 12, 'D'], [8, 11, 'D'], [9, 13, 'M'], [8, 13, 'D']]);  // Schutthaufen
    rows = autoOutline(rows, 'k');
    // Tor, Fenster, Fahne am Burgfried, Bodenschatten
    rows = stamp(rows, [[11, 7, 'T'], [11, 8, 'T'], [12, 7, 'T'], [12, 8, 'T'], [8, 3, 'T'], [7, 7, 'T'],
      [1, 8, 'k'], [2, 8, 'k'], [0, 8, 'k'], [1, 9, 'r'], [1, 10, 'r'], [2, 9, 'r']]);
    if (!broken) rows = stamp(rows, [[8, 12, 'T']]);
    return rows.map((row, y) => (y === 15 ? row.split('').map((px, x) => (x >= 1 && x <= 14 ? 's' : px)).join('') : row));
  }
  B.defineSprite('prop_sandcastle', { palette: SANDCASTLE_PAL, scale: 4, frames: [sandcastleRows(false), sandcastleRows(true)] });

  function gridRows(w, h, fn) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += fn(x, y);
      rows.push(row);
    }
    return rows;
  }
  // Riss: feste Zickzacklinie von oben links nach unten rechts, plus Seitenast
  const PROP_CRACK = [[2, 4], [3, 5], [4, 5], [5, 6], [6, 7], [7, 7], [8, 8], [8, 9], [9, 10], [10, 10], [11, 11], [9, 6], [10, 5]];
  function propDamaged(rows) {
    const cracked = stamp(rows, PROP_CRACK.map(([r, c]) => [r, c, 'k']));
    return stamp(cracked, [[0, 13, 'k'], [0, 14, '.'], [1, 14, 'k'], [1, 15, '.'], [2, 15, 'k']]);
  }

  // Staubige Holzkiste: Rahmen mit Naegeln, Diagonalstrebe, Staubflecken
  const CRATE = gridRows(16, 16, (x, y) => {
    const edge = x === 0 || x === 15 || y === 0 || y === 15;
    if (edge) return (x === 0 || x === 15) && (y === 0 || y === 15) ? '.' : 'k';
    if (x <= 2 || x >= 13 || y <= 2 || y >= 13) {
      if ((x === 1 || x === 14) && (y === 1 || y === 14)) return 'n';
      if ((x * 7 + y * 13) % 11 === 0) return 'g';
      return y <= 2 ? 'l' : 'w';
    }
    if (x === 3 || x === 12 || y === 3 || y === 12) return 'd';
    if (x + y === 15 || x + y === 16) return 'w';
    if (y === 7) return 'd';
    return (x * 5 + y * 3) % 13 === 0 ? 'g' : 'p';
  });
  B.defineSprite('prop_crate', {
    palette: { k: '#1f1a17', w: '#a07a4a', l: '#c29a66', p: '#7d5b36', d: '#4f3920', n: '#c9c1b8', g: '#b8b0a4' },
    scale: 4,
    frames: [CRATE, propDamaged(CRATE)],
  });

  // Busch: runde Silhouette mit Blattzacken, Licht von oben links, drei rote Beeren
  const bushRows = (bare) => gridRows(16, 16, (x, y) => {
    const dx = x - 7.5, dy = y - 8;
    const d = Math.hypot(dx * 0.95, dy * 1.05);
    const rim = 7.0 + 0.6 * Math.sin(Math.atan2(dy, dx) * 5);
    if (d > rim + 0.8) return '.';
    if (d > rim) return 'k';
    if (bare && ((x * 3 + y * 5) % 7 === 0 || (x > 8 && y < 6))) return d > rim - 1.5 ? 'k' : 'b'; // kahle Stellen, Zweige
    if ((x === 5 && y === 6) || (x === 10 && y === 9) || (x === 7 && y === 12)) return 'r';
    const shade = -dx * 0.5 - dy * 0.6;
    if (shade > 2.5) return 'l';
    if (shade < -2.5) return 'd';
    const n = (x * 13 + y * 7) % 5;
    return n === 0 ? 'l' : n === 1 ? 'd' : 'g';
  });
  B.defineSprite('prop_bush', {
    palette: { k: '#16240f', l: '#7fb850', g: '#5f8f3a', d: '#3d6326', r: '#c0392b', b: '#5a3d22' },
    scale: 4,
    frames: [bushRows(false), bushRows(true)],
  });

  // Paket (Dependency Hell): Karton mit Klebeband, Versandetikett mit Strichcode, roter "oben"-Pfeil
  const PACKAGE = stamp(
    ['.kkkkkkkkkkkkkk.'].concat(Array.from({ length: 13 }, () => 'kccccccttcccccCk'), ['kCCCCCCttCCCCCCk', '.kkkkkkkkkkkkkk.']),
    [
      [3, 11, 'r'], [3, 12, 'r'], [4, 10, 'r'], [4, 11, 'r'], [4, 12, 'r'], [4, 13, 'r'], [5, 11, 'r'], [5, 12, 'r'], [6, 11, 'r'], [6, 12, 'r'],
      // Etikett: weisses Feld mit zwei Textzeilen (bewusst keine zwei Punkte nebeneinander — sah wie Augen aus)
      [9, 1, 'w'], [9, 2, 'w'], [9, 3, 'w'], [9, 4, 'w'], [9, 5, 'w'],
      [10, 1, 'w'], [10, 2, 'g'], [10, 3, 'g'], [10, 4, 'g'], [10, 5, 'w'],
      [11, 1, 'w'], [11, 2, 'g'], [11, 3, 'g'], [11, 4, 'w'], [11, 5, 'w'],
      [12, 1, 'w'], [12, 2, 'w'], [12, 3, 'w'], [12, 4, 'w'], [12, 5, 'w'],
    ]);
  B.defineSprite('prop_package', {
    palette: { k: '#1f1a17', c: '#c49a5c', C: '#9c7843', t: '#e8d7a6', w: '#f4efe6', g: '#8a8478', r: '#d64545' },
    scale: 4,
    frames: [PACKAGE, propDamaged(PACKAGE)],
  });

  // Ueberquellender Karton (Production/Dependency Hell): offene Kiste, Papierstapel und ein Kabel quellen heraus
  const CARTON = [
    '......kkkk......',
    '..kkk.kWWWk.....',
    '.kwwwkkWgWWk.b..',
    '.kwgwwkWWgWk.bb.',
    '.kwwgwkWgWWkbb..',
    '.kwwwwkWWWWkb...',
    'kkkkkkkkkkkkkkkk',
    'kCCCCCCCCCCCCCCk',
    'kccccccddcccccCk',
    'kccccccddcccccCk',
    'kcccwwwddcccccCk',
    'kccckkkddcccccCk',
    'kcccccccccccccCk',
    'kcccccccccccccCk',
    'kCCCCCCCCCCCCCCk',
    '.kkkkkkkkkkkkkk.',
  ];
  B.defineSprite('prop_carton', {
    palette: { k: '#1f1a17', c: '#c9a46a', C: '#9c7843', d: '#b08a52', w: '#f4efe6', W: '#e8e2d4', g: '#9a948c', b: '#3a7fc0' },
    scale: 4,
    frames: [CARTON, propDamaged(CARTON)],
  });

  // ===========================================================================
  // HUD-Icons (Skalierung 2 -> knackig in der 64-px-Leiste)
  // ===========================================================================

  const HEART_PAL = {
    K: '#1a0b0b', // Umriss
    r: '#e04848', // rot
    R: '#a32a36', // rot Schatten
    w: '#ffb8b0', // Glanz
    e: '#3d2626', // leerer Container
    E: '#563838', // leerer Container (Licht)
    b: '#5b8def', // Guardrail blau
    B: '#3559b0', // Guardrail Schatten
    c: '#d6e4ff', // Guardrail Glanz / Leitplanke
  };
  B.defineSprite('hud_heart_full', {
    palette: HEART_PAL, scale: 2,
    rows: [
      '.KK...KK.',
      'KwrK.KrrK',
      'KwrrKrrrK',
      'KrrrrrrRK',
      '.KrrrrRK.',
      '..KrrRK..',
      '...KRK...',
      '....K....',
    ],
  });
  B.defineSprite('hud_heart_half', {
    palette: HEART_PAL, scale: 2,
    rows: [
      '.KK...KK.',
      'KwrK.KEEK',
      'KwrrKEeeK',
      'KrrrreeeK',
      '.KrrreeK.',
      '..KrreK..',
      '...KrK...',
      '....K....',
    ],
  });
  B.defineSprite('hud_heart_empty', {
    palette: HEART_PAL, scale: 2,
    rows: [
      '.KK...KK.',
      'KEEK.KEEK',
      'KEeeKeeeK',
      'KeeeeeeeK',
      '.KeeeeeK.',
      '..KeeeK..',
      '...KeK...',
      '....K....',
    ],
  });
  // Guardrail: blaues Herz mit hellen "Leitplanken"-Streifen
  B.defineSprite('hud_guardrail_full', {
    palette: HEART_PAL, scale: 2,
    rows: [
      '.KK...KK.',
      'KcbK.KbbK',
      'KccccccBK',
      'KbbbbbbBK',
      '.KcccccK.',
      '..KbbBK..',
      '...KBK...',
      '....K....',
    ],
  });
  B.defineSprite('hud_guardrail_half', {
    palette: HEART_PAL, scale: 2,
    rows: [
      '.KK......',
      'KcbK.....',
      'KccccK...',
      'KbbbbK...',
      '.KcccK...',
      '..KbbK...',
      '...KbK...',
      '....K....',
    ],
  });

  // Ressourcen-Icons (Fallback, falls Agent A keine pickup_*-Sprites liefert)
  B.defineSprite('hud_credit', {
    palette: { K: '#2b1d05', y: '#f2c14e', Y: '#fff0b0', o: '#c9921e', c: '#8a5d0a' },
    scale: 2,
    rows: [
      '..KKKK..',
      '.KyYYyK.',
      'KyYyccoK',
      'KyYcyyoK',
      'KyYcyyoK',
      'KyyyccoK',
      '.KooooK.',
      '..KKKK..',
    ],
  });
  B.defineSprite('hud_push', {
    palette: { K: '#0e0e10', g: '#45474d', w: '#9a9ca3', a: '#2c2d31', y: '#ffd166', r: '#ff6a3d', s: '#a87a4a' },
    scale: 2,
    rows: [
      '.....ry.',
      '....s.r.',
      '...KsK..',
      '.KKggKK.',
      'KgwggggK',
      'KwgggaaK',
      'KggggaaK',
      '.KKaaKK.',
    ],
  });
  B.defineSprite('hud_approval', {
    palette: { K: '#0f2410', g: '#7bc96f', G: '#4f9a45', w: '#f4fff0' },
    scale: 2,
    rows: [
      '..KKKK..',
      '.KggggK.',
      'KgggggwK',
      'KggggwGK',
      'KwggwgGK',
      'KgwwgGGK',
      '.KgGGGK.',
      '..KKKK..',
    ],
  });

  // ===========================================================================
  // Minimap-Icons (Skalierung 2, 7x6)
  // ===========================================================================
  B.defineSprite('map_boss', {
    palette: { w: '#f3ece6', k: '#2a0f0f', r: '#e04848' },
    scale: 2,
    rows: [
      '.wwwww.',
      'wwwwwww',
      'wkkwkkw',
      'wkrwrkw',
      '.wwkww.',
      '.w.w.w.',
    ],
  });
  B.defineSprite('map_treasure', {
    palette: { y: '#f2c14e', Y: '#fff0b0', r: '#e04848', b: '#5b8def' },
    scale: 2,
    rows: [
      'Y..Y..Y',
      'yy.y.yy',
      'yyyyyyy',
      'yrybyry',
      'yyyyyyy',
      '.......',
    ],
  });
  B.defineSprite('map_shop', {
    palette: { g: '#7bc96f', G: '#4f9a45' },
    scale: 2,
    rows: [
      '...g...',
      '.ggggg.',
      'gg.g...',
      'gg.g...',
      '.gggGg.',
      '...g...',
    ],
  });
  B.defineSprite('map_secret', {
    palette: { v: '#c4a8ff' },
    scale: 2,
    rows: [
      '.vvvv..',
      'vv..vv.',
      '...vv..',
      '..vv...',
      '.......',
      '..vv...',
    ],
  });

  // Kleines Lautsprecher-Icon (Stummschaltung im HUD/Titel)
  B.defineSprite('hud_muted', {
    palette: { w: '#a89f97', r: '#e07a6a' },
    scale: 2,
    rows: [
      '...w....',
      '..ww.r.r',
      'wwww..r.',
      'wwww.r.r',
      '..ww....',
      '...w....',
    ],
  });

  // Hilfsfunktionen auch anderen Sprite-Dateien anbieten (rein optional)
  B.spriteTools = { shiftRow, stamp, mirror, padRows };
})(window.BOTA);
