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
  B.defineSprite('tile_rock', {
    palette: ROCK_PAL, scale: 4,
    frames: [
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
    ],
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
