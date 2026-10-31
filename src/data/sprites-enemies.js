/*
 * sprites-enemies.js — Gegner- und Boss-Sprites (ASCII-Pixel-Art, Format siehe src/core/sprites.js).
 *
 * Namenskonvention: 'enemy_<id>' bzw. 'boss_<id>' (+ Varianten wie 'boss_monolith_cracked').
 * Alle Motive sind eigene Entwuerfe (keine Assets/Figuren aus anderen Spielen, keine echten Logos).
 * Massstab: scale 4 (1 Art-Pixel = 4 logische Pixel). Gegner ~8–14 px Art, Bosse ~16–24 px Art.
 * Zwei Frames pro Sprite = Idle-/Lauf-Animation (Enemy.draw wechselt mit 6 fps).
 *
 * Helfer:
 *   sym(half)        spiegelt halbe Zeilen zu symmetrischen Zeilen (gerade Breite)
 *   symOdd(half)     dito fuer ungerade Breite (letzte Spalte der Haelfte = Mittelspalte)
 */
'use strict';

(function (B) {
  /** Spiegelt jede Zeile: 'ab' -> 'abba' (gerade Gesamtbreite) */
  function sym(half) {
    return half.map((r) => r + r.split('').reverse().join(''));
  }
  /** Spiegelt jede Zeile um die letzte Spalte: 'abc' -> 'abcba' (ungerade Gesamtbreite) */
  function symOdd(half) {
    return half.map((r) => r + r.slice(0, -1).split('').reverse().join(''));
  }

  const K = '#1a1a1a'; // gemeinsame Konturfarbe
  const W = '#ffffff';

  // ===========================================================================
  // Gegner
  // ===========================================================================

  // Bug — gruener Kaefer von oben: Fuehler, Augen, geteilter Panzer, 6 Beine (wackeln)
  B.defineSprite('enemy_bug', {
    palette: { k: K, d: '#3d6b2c', g: '#6aa84f', l: '#9fd67f', w: W },
    scale: 4,
    frames: [
      sym([
        '..k...',
        '...k..',
        '...kkk',
        '..kwkd',
        'k.kddd',
        '.kklgk',
        '..kglk',
        'kkkggk',
        '..kggk',
        '.kkggk',
        'k.kddk',
        '...kkk',
      ]),
      sym([
        '.k....',
        '..k...',
        '...kkk',
        '..kwkd',
        '.kkddd',
        'k.klgk',
        '..kglk',
        '.kkggk',
        'k.kggk',
        '..kggk',
        '.kkddk',
        '...kkk',
      ]),
    ],
  });

  // Null Pointer — kleiner Pfeil-Geist (Cursor-Spitze oben), zeigt ins Leere; wehender Saum
  B.defineSprite('enemy_null_pointer', {
    palette: { k: K, w: '#d9dde3', g: '#9aa0a8', e: '#2b2f36' },
    scale: 4,
    frames: [
      sym([
        '.....k',
        '....kw',
        '...kww',
        '..kwww',
        '.kwwww',
        'kkkwww',
        '..kwew',
        '..kwew',
        '..kwww',
        '..kggw',
        '..kwgw',
        '..kk.k',
      ]),
      sym([
        '.....k',
        '....kw',
        '...kww',
        '..kwww',
        '.kwwww',
        'kkkwww',
        '..kwew',
        '..kwew',
        '..kwww',
        '..kggw',
        '..kgwk',
        '...k.k',
      ]),
    ],
  });

  // Memory Leak — tropfender lila Blob mit Augen; Tropfen laufen nach unten
  B.defineSprite('enemy_memory_leak', {
    palette: { k: K, m: '#8e5bd6', d: '#5d3a99', l: '#c39bf0', w: W },
    scale: 4,
    frames: [
      [
        '.....kkkk.....',
        '...kkmmlmkk...',
        '..kmmmmlllmk..',
        '.kmmwkmmwkmmk.',
        '.kmmwkmmwkmmk.',
        'kmmmmmmmmmmmmk',
        'kmdmmmkkmmmdmk',
        'kmddmmmmmmddmk',
        '.kmddddddddmk.',
        '..kkmkkkkmkk..',
        '....m....m....',
        '....d.........',
        '..............',
      ],
      [
        '..............',
        '.....kkkk.....',
        '...kkmmlmkk...',
        '..kmmmmlllmk..',
        '.kmmwkmmwkmmk.',
        'kmmmwkmmwkmmmk',
        'kmdmmmkkmmmdmk',
        'kmddmmmmmmddmk',
        '.kmddddddddmk.',
        '..kkmkkkkmkk..',
        '....m....m....',
        '....m....d....',
        '....d.........',
      ],
    ],
  });

  // Leaklet — kleiner Tropfen (Kind des Memory Leak)
  B.defineSprite('enemy_leaklet', {
    palette: { k: K, m: '#8e5bd6', d: '#5d3a99', l: '#c39bf0', w: W },
    scale: 4,
    frames: [
      [
        '...kk...',
        '..kmmk..',
        '.kmmlmk.',
        'kmwkwkmk',
        'kmmmmmmk',
        'kmdmmdmk',
        '.kddddk.',
        '..kkkk..',
      ],
      [
        '........',
        '...kk...',
        '.kkmmkk.',
        'kmmmlmmk',
        'kmwkwkmk',
        'kmmmmmmk',
        'kmddddmk',
        '.kkkkkk.',
      ],
    ],
  });

  // Flaky Test — Test-Plakette, flackert zwischen gruenem Haken und rotem Kreuz
  B.defineSprite('enemy_flaky_test', {
    palette: { k: K, g: '#5fae4f', G: '#3f7f34', r: '#d64545', R: '#9c2c2c', w: W },
    scale: 4,
    frames: [
      [
        '...kkkkkk...',
        '.kkggggggkk.',
        '.kggggggggk.',
        'kgggggggwwgk',
        'kggggggwwggk',
        'kgggggwwgggk',
        'kgwggwwggggk',
        'kgwwwwgggggk',
        'kggwwggggggk',
        '.kGggggggGk.',
        '.kkGGGGGGkk.',
        '...kkkkkk...',
      ],
      [
        '...kkkkkk...',
        '.kkrrrrrrkk.',
        '.krrrrrrrrk.',
        'krrwrrrrwrrk',
        'krrwwrrwwrrk',
        'krrrwwwwrrrk',
        'krrrwwwwrrrk',
        'krrwwrrwwrrk',
        'krrwrrrrwrrk',
        '.kRrrrrrrRk.',
        '.kkRRRRRRkk.',
        '...kkkkkk...',
      ],
    ],
  });

  // Graphics Glitch — Pixelbrei mit verschobenen Farbkanaelen und zwei Augen; Frame 2 "reisst" (Zeilenversatz)
  B.defineSprite('enemy_graphics_glitch', {
    palette: { k: K, m: '#e040c0', c: '#40d8e0', g: '#5fe05f', y: '#f2c14e', d: '#2a2838', w: W },
    scale: 4,
    frames: [
      [
        '..kkkkkkkk..',
        '.kmmmccccyk.',
        'kmmmccccyyyk',
        'kdwwdddwwddk',
        'kdwkdddwkddk',
        'kddddddddddk',
        'kgggmmmcccyk',
        'kdkwkwkwkddk',
        'kyyygggmmmck',
        '.kccmmyyggk.',
        '..kkkkkkkk..',
      ],
      [
        '...kkkkkkkk.',
        '..kcccmmmmyk',
        '.kcccmmmmyyk',
        'kdwwdddwwddk',
        'kdwkdddwkddk',
        'kddddddddddk',
        'mmmcccgggk..',
        'kdkwkwkwkddk',
        '.kgggmmmyyyc',
        '.kmmccggyyk.',
        '..kkkkkkkk..',
      ],
    ],
  });

  // Merge Conflict — zwei Haelften (HEAD gruen / incoming blau), die sich an einer Zickzack-Naht reiben
  B.defineSprite('enemy_merge_conflict', {
    palette: { k: K, g: '#5fae4f', G: '#3f7f34', b: '#4a86d8', D: '#2f5ea3', w: W, r: '#e04848' },
    scale: 4,
    frames: [
      [
        '.kkkkkkkkkkkk.',
        'kggggggkbbbbbk',
        'kgggggkbbbbbbk',
        'kgwwgggkbbwwbk',
        'kgwkggkbbbkwbk',
        'kggggggkbbbbbk',
        'kgggggkbbbbbbk',
        'kggkkggkbbkkbk',
        'kgkggggkbbbbkk',
        'kggggggkbbbbbk',
        'kGGGGGkDDDDDDk',
        '.kkkkkkkkkkkk.',
      ],
      [
        '.kkkkkkkkkkkk.',
        'kgggggkbbbbbbk',
        'kggggggkbbbbbk',
        'kgwwggkbbbwwbk',
        'kgwkgggkbbkwbk',
        'kgggggkbbbbbbk',
        'kggggggkbbbbbk',
        'kggkkgkbbbkkbk',
        'kgkgggkbbbbbkk',
        'kgggggkbbbbbbk',
        'kGGGGGGkDDDDDk',
        '.kkkkkkkkkkkk.',
      ],
    ],
  });

  // Jira Ticket — wuetende Ticket-Karte mit rotem "Blocker"-Streifen, Augenbrauen und Textzeilen
  B.defineSprite('enemy_jira_ticket', {
    palette: { k: K, w: '#e8eef7', s: '#b9c4d4', r: '#d64545', t: '#8090a8', m: '#5a1f1f' },
    scale: 4,
    frames: [
      [
        'kkkkkkkkkkkk',
        'krrwwwwwwwwk',
        'krrwkwwwwkwk',
        'krrwwkwwkwwk',
        'krrwkkwwkkwk',
        'krrwwwwwwwwk',
        'krrwwmmmmwwk',
        'krrwmwwwwmwk',
        'krrwwwwwwwwk',
        'krrwttttwwwk',
        'krrwwwwwwwwk',
        'krrwtttttwwk',
        'krrssssssssk',
        'kkkkkkkkkkkk',
      ],
      [
        'kkkkkkkkkkkk',
        'krrwwwwwwwwk',
        'krrwkwwwwkwk',
        'krrwwkwwkwwk',
        'krrwkkwwkkwk',
        'krrwwwwwwwwk',
        'krrwwmmmmwwk',
        'krrwwmmmmwwk',
        'krrwwwmmwwwk',
        'krrwttttwwwk',
        'krrwwwwwwwwk',
        'krrwtttttwwk',
        'krrssssssssk',
        'kkkkkkkkkkkk',
      ],
    ],
  });

  // Deprecation Warning — gelbes Warndreieck mit "!" (blinkt: Frame 2 heller/orange)
  B.defineSprite('enemy_deprecation_warning', {
    palette: { k: K, y: '#f2c14e', o: '#f08a24', l: '#ffe58a' },
    scale: 4,
    frames: [
      sym([
        '.......k',
        '......ky',
        '......ky',
        '.....kyy',
        '.....kyy',
        '....kyyk',
        '....kyyk',
        '...kyyyk',
        '...kyyyk',
        '..kyyyyy',
        '..kyyyyk',
        '.kyyyyyk',
        '.kyyyyyy',
        'kkkkkkkk',
      ]),
      sym([
        '.......k',
        '......kl',
        '......kl',
        '.....kll',
        '.....kll',
        '....kllk',
        '....kllk',
        '...kollk',
        '...kollk',
        '..koolll',
        '..koollk',
        '.kooollk',
        '.koooooo',
        'kkkkkkkk',
      ]),
    ],
  });

  // Spaghetti Code — Nudelknaeuel mit Augen, Tomatensosse und wackelnden Nudelenden
  B.defineSprite('enemy_spaghetti_code', {
    palette: { k: K, y: '#e8c36a', o: '#b8893a', r: '#a8452c', R: '#7a2e1c', l: '#c96a4a', w: W },
    scale: 4,
    frames: [
      [
        '.....kkkk.....',
        '....klrrrk....',
        '...kkrrRrkk...',
        '..kyyokkoyyk..',
        '.kyoyyyoyyyok.',
        '.kywkyyyywkyk.',
        'kyowkoyyowkoyk',
        'kyyyooyyoyyyok',
        'koy.yyoo.yyoyk',
        'kyyoyy.yyoy.yk',
        '.koyyoyyoyyok.',
        '.yk.kkkkkk.ky.',
        '.y..........y.',
      ],
      [
        '.....kkkk.....',
        '....klrrrk....',
        '...kkrrRrkk...',
        '..kyyokkoyyk..',
        '.kyoyyyoyyyok.',
        '.kywkyyyywkyk.',
        'kyowkoyyowkoyk',
        'kyyyooyyoyyyok',
        'koy.yyoo.yyoyk',
        'kyyoyy.yyoy.yk',
        '.koyyoyyoyyok.',
        'y.k.kkkkkk.k.y',
        'y............y',
      ],
    ],
  });

  // Zombie Process — grauer Geist mit Terminal-Prompt ">_" auf der Stirn und kraenklich gruenen Augen
  const ZOMBIE_ROWS = [
    [
      '...kkkkkk...',
      '..kggggggk..',
      '.kgpggggggk.',
      '.kggpgggggk.',
      '.kgpgppgggk.',
      '.kgeeggeegk.',
      '.kgekggekgk.',
      'kkgddddddgkk',
      'kggggggggggk',
      '.kggggggggk.',
      '.kggggggggk.',
      '.kgkgkkgkgk.',
      '.kk.k..k.kk.',
    ],
    [
      '...kkkkkk...',
      '..kggggggk..',
      '.kgpggggggk.',
      '.kggpgggggk.',
      '.kgpgppgggk.',
      '.kgeeggeegk.',
      '.kgekggekgk.',
      '.kgddddddgk.',
      'kkggggggggkk',
      'kggggggggggk',
      '.kggggggggk.',
      '.kkgkggkgkk.',
      '..k.kk.k.k..',
    ],
  ];
  B.defineSprite('enemy_zombie_process', {
    palette: { k: K, g: '#9aa3a8', d: '#5b6368', e: '#b8f08a', p: '#3d4448' },
    scale: 4,
    frames: ZOMBIE_ROWS,
  });
  // Wiederbelebte Variante: dunkler, rote Augen ("SIGCONT")
  B.defineSprite('enemy_zombie_process_angry', {
    palette: { k: K, g: '#7d868c', d: '#3d4448', e: '#ff5a46', p: '#c03a3a' },
    scale: 4,
    frames: ZOMBIE_ROWS,
  });

  // Scope Creep — mooses Ranken-Blob mit einem grossen Auge; Ranken kriechen umher
  B.defineSprite('enemy_scope_creep', {
    palette: { k: K, m: '#6f9a3a', d: '#4a6b25', v: '#3f7a2a', l: '#9ccc65', w: W },
    scale: 4,
    frames: [
      [
        '..v.......v...',
        '...v..l..v....',
        '....vkkkkv....',
        '..lkmmmmmmk...',
        '..kmmwwwmmmk..',
        '.kmmwwkkwmmmk.',
        'vkmmwwkkwmmmkv',
        '.kmmmwwwmmmmk.',
        '.kmmmmmmmmmmk.',
        '..kmdmmmmdmk..',
        '.v.kkkkkkkk.v.',
        'v..v......v..v',
        '..v........v..',
      ],
      [
        '.v.........v..',
        '..v...l...v...',
        '....vkkkkv....',
        '...kmmmmmmkl..',
        '..kmmwwwmmmk..',
        '.kmmwwkkwmmmk.',
        'vkmmwwkkwmmmkv',
        '.kmmmwwwmmmmk.',
        '.kmmmmmmmmmmk.',
        '..kmdmmmmdmk..',
        'v..kkkkkkkk..v',
        '.v.v......v.v.',
        '...v......v...',
      ],
    ],
  });

  // Hallucination (enttarnt) — falsche Muenze mit Spiralaugen und Zahnreihe
  B.defineSprite('enemy_hallucination', {
    palette: { k: K, y: '#f2c14e', o: '#b8862b', w: W, r: '#8a1f3d', p: '#b65ad6' },
    scale: 4,
    frames: [
      [
        '...kkkkkk...',
        '.kkooooookk.',
        '.koyyyyyyok.',
        'koypkyypkyok',
        'koykpyykpyok',
        'koyyyyyyyyok',
        'kokkkkkkkkok',
        'kokwkwkwkkok',
        'koykkkkkkyok',
        '.koyyyyyyok.',
        '.kkooooookk.',
        '...kkkkkk...',
      ],
      [
        '...kkkkkk...',
        '.kkooooookk.',
        '.koyyyyyyok.',
        'koypkyypkyok',
        'koykpyykpyok',
        'kokkkkkkkkok',
        'kokwkwkwkwok',
        'kokrrrrrrkok',
        'kokwkwkwkwok',
        '.kokkkkkkok.',
        '.kkooooookk.',
        '...kkkkkk...',
      ],
    ],
  });

  // Race Condition — kleiner Sprinter (Kugel mit Stirnband) + Tempo-Linien; Beine im Wechsel
  B.defineSprite('enemy_race_condition', {
    palette: { k: K, r: '#e0603a', R: '#a8401f', w: W, s: '#c8c8c8', b: '#f2c14e' },
    scale: 4,
    frames: [
      [
        '....kkkkk...',
        '...krrrrrk..',
        '..kbbbbbbbk.',
        's.krrrrwkrk.',
        '..krrrrkkrk.',
        'ss.krrrrrk..',
        '...kRRRRk...',
        '....k..k....',
        '...k....k...',
        '..k......k..',
      ],
      [
        '....kkkkk...',
        '...krrrrrk..',
        '..kbbbbbbbk.',
        '.skrrrrwkrk.',
        '..krrrrkkrk.',
        '.s.krrrrrk..',
        '...kRRRRk...',
        '.....kk.....',
        '....k.k.....',
        '....k..k....',
      ],
    ],
  });

  // Microservice — kleiner grauer Wuerfel-Drohne mit Status-LED (Minion des Monolith)
  B.defineSprite('enemy_microservice', {
    palette: { k: K, s: '#9aa0a8', l: '#c8ccd2', d: '#6b7178', r: '#e04848', R: '#6a1f1f', g: '#5fd35f' },
    scale: 4,
    frames: [
      [
        '.kkkkkkkk.',
        'kllllllldk',
        'klsssssssk',
        'kssgkrkssk',
        'kssssssssk',
        'ksdddddddk',
        '.kkkkkkkk.',
        '.k.k..k.k.',
      ],
      [
        '.kkkkkkkk.',
        'kllllllldk',
        'klsssssssk',
        'ksskkRkssk',
        'kssssssssk',
        'ksdddddddk',
        '.kkkkkkkk.',
        'k.k....k.k',
      ],
    ],
  });

  // ===========================================================================
  // Bosse
  // ===========================================================================

  // The Monolith — grosse graue Steinplatte mit roten Schlitzaugen; Frame 2 = Augen gluehen
  const MONO_PAL = { k: K, s: '#7d828a', l: '#a2a7af', d: '#5a5e66', D: '#3e4248', r: '#c83232', R: '#ff8a7a', c: '#ff5a46' };
  const monoRows = (eyes, crack) => sym([
    '...kkkkkkkk',
    '..kllllllll',
    '..klsssssss',
    '..klsssssss',
    '..klsssssss',
    '..klskkkkss',
    '..klsk' + eyes + 'ks',
    '..klsskkkss',
    '..klsssssss',
    crack ? '..klssskdss' : '..klsssssss',
    crack ? '..klsskcdss' : '..klsssdsss',
    crack ? '..klskcssss' : '..klssdssss',
    '..klsssssss',
    '..klssskkkk',
    '..klssksss' + (crack ? 'k' : 's'),
    crack ? '..klsdssscs' : '..klsssssss',
    '..klssssdds',
    crack ? '..klskkssss' : '..klsssssss',
    '..klssdssss',
    crack ? '..klcsssdss' : '..klsssssss',
    '..klsssssss',
    '..kldssssss',
    '..klddddddd',
    '.kkkkkkkkkk',
    '.kDDDDDDDDD',
    'kDDDDDDDDDD',
    'kkkkkkkkkkk',
  ]);
  B.defineSprite('boss_monolith', {
    palette: MONO_PAL,
    scale: 4,
    frames: [monoRows('rrr', false), monoRows('RRR', false)],
  });
  // Phase 2: Risse, durch die es rot glueht
  B.defineSprite('boss_monolith_cracked', {
    palette: MONO_PAL,
    scale: 4,
    frames: [monoRows('rrr', true), monoRows('RRR', true)],
  });

  // The Stakeholder — schwebender Anzug-Schatten mit Krawatte und Aktenkoffer (gesichtslos, generisch)
  const STAKE_ROWS = (sway) => [
    '.........kkkk.........',
    '........khhhhk........',
    '.......khhhhhhk.......',
    '.......khehhehk.......',
    '.......khhhhhhk.......',
    '........khhhhk........',
    '.....kkkkwwwwkkkk.....',
    '....ksssswttwssssk....',
    '...kssssswttwsssssk...',
    '...ksssssdttdsssssk...',
    '..kssksssdttdssskssk..',
    '..kssksssswtssssksssk.',
    '..kssksssswtssssksssk.',
    '..kssksssssssssskssk..',
    '..kwwksssssssssskwwk..',
    sway ? '..kkkksssssssssskbbbbk' : '..kkkksssssssssskkkk..',
    sway ? '....kssssssssssskBgBBk' : '....kssssssssssskbbbbk',
    sway ? '....kdsssssssssdkbbbbk' : '....kdsssssssssdkBgBBk',
    sway ? '.....kdssssssssdkkkkk.' : '.....kdssssssssdkbbbbk',
    sway ? '.....kddsssssssdk.....' : '.....kddsssssssdkkkkk.',
    '......kddsssssdk......',
    '.......kddsssddk......',
    '........kdddddk.......',
    sway ? '.........kd.dk........' : '........kd.d.k........',
    sway ? '........k...k.........' : '.........k...k........',
  ];
  const STAKE_PAL = { k: '#141418', s: '#2d3142', d: '#1f2230', w: '#e9e6df', t: '#c0392b', h: '#3a3d4a',
    e: '#ffd36b', b: '#7a5230', B: '#5a3a20', g: '#c9a227' };
  B.defineSprite('boss_stakeholder', {
    palette: STAKE_PAL,
    scale: 4,
    frames: [STAKE_ROWS(false), STAKE_ROWS(true)],
  });
  // Phase 2: rote Augen, Krawatte gelockert ("changes the requirements")
  B.defineSprite('boss_stakeholder_angry', {
    palette: Object.assign({}, STAKE_PAL, { e: '#ff4040', h: '#4a2f36', t: '#ff5a3c' }),
    scale: 4,
    frames: [STAKE_ROWS(false), STAKE_ROWS(true)],
  });

  // The Antagonistic Reviewer — grosses schwebendes Gesicht: zerzauste schwarze Haare, buschige Brauen,
  // Brille mit weiss verspiegelten Glaesern (man sieht die Augen nie), missbilligender Mund.
  // Frame 2: Mund offen mit rotem Gluehen (Laser laedt). Phase 2: rot angelaufen (eigene Palette).
  const REVIEWER_TOP = [
    '...k.kk..kk',
    '..khkhhkkhh',
    '.khhhhhhhhh',
    'khhhHhhhhhH',
    'khhhhhhhhhh',
    'khhsshhhssh',
    'khsssssssss',
    'khshhhhhsss',
    'ksgggggggss',
    'ksgwwwwwwgg',
    'ksgwWwwwwgs',
    'ksgwwwwwwgs',
    'ksgggggggss',
    'kSsssssssss',
    'kSsssssssSS',
    'kSsssssssss',
  ];
  const REVIEWER_MOUTH_SHUT = [
    '.kSssssssss',
    '.kSssmmmmmm',
    '..kSmssssss',
  ];
  const REVIEWER_MOUTH_OPEN = [
    '.kSssmmmmmm',
    '.kSssmrrrrr',
    '..kSsmmmmmm',
  ];
  const REVIEWER_CHIN = [
    '...kSSsssss',
    '....kkSSSSS',
    '......kkkkk',
  ];
  const REVIEWER_PAL = { k: '#141418', h: '#1b1b22', H: '#3a3a48', s: '#e8b896', S: '#c99573', g: '#2a2a30',
    w: '#f4f6f8', W: '#bcd4e6', m: '#5a2a2a', r: '#ff3b3b' };
  const reviewerFrames = () => [
    sym(REVIEWER_TOP.concat(REVIEWER_MOUTH_SHUT, REVIEWER_CHIN)),
    sym(REVIEWER_TOP.concat(REVIEWER_MOUTH_OPEN, REVIEWER_CHIN)),
  ];
  B.defineSprite('boss_reviewer', { palette: REVIEWER_PAL, scale: 4, frames: reviewerFrames() });
  B.defineSprite('boss_reviewer_angry', {
    palette: Object.assign({}, REVIEWER_PAL, { s: '#e0705a', S: '#b8503e', m: '#3a1414' }),
    scale: 4,
    frames: reviewerFrames(),
  });

  // Friday Deploy — brennendes Server-Rack: Einschuebe mit LEDs, Flammen oben (flackern)
  const RACK_BODY = [
    '.kkkkkkkkkkkkkkkkkk.',
    '.kllllllllllllllllk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.klksssssssssgsrkdk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.klksssssssssrsgkdk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.klkssssssssgsgskdk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.klkoooossssrsrskdk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.klkssssssssgsrskdk.',
    '.klkkkkkkkkkkkkkkdk.',
    '.kldddddddddddddddk.',
    '.kkkkkkkkkkkkkkkkkk.',
    '..kk............kk..',
  ];
  const FLAMES_A = [
    '....f.....f....f....',
    '...ff..f..ff..ff....',
    '...fyf.ff.fyf.fyf...',
    '..ffyyffyfffyffyff..',
    '..fyyyyfyyyyfyyyyf..',
    '.ffoyyyyyyyyyyyyoff.',
  ];
  const FLAMES_B = [
    '......f....f.....f..',
    '..f..ff...ff...ff...',
    '..ff.fyf.ffyf..fyf..',
    '..fyffyyffyyff.fyff.',
    '..fyyyyyfyyyyfyyyyf.',
    '.ffoyyyyyyyyyyyyyoff',
  ];
  const FLAMES_HOT_A = [
    '..f..f..f...f..f..f.',
    '..ff.ff.ff.ff.fff...',
    '.ffyffyffyffyffyyf..',
    '.fyyyyyyyyyyyyyyyyf.',
    'ffyyWWyyyWWyyyWWyyff',
    'ffoyyyyyyyyyyyyyyoff',
  ];
  const FLAMES_HOT_B = [
    '.f..f...f..f...f..f.',
    '.ff.fff.ff.ff.ff.ff.',
    '..fyffyyffyffyffyyf.',
    '.fyyyyyyyyyyyyyyyyff',
    'ffyyyWWyyyyWWyyyWyff',
    'ffoyyyyyyyyyyyyyyoff',
  ];
  const RACK_PAL = { k: '#141414', l: '#5c6168', d: '#2a2d31', s: '#3b3f45', g: '#5fd35f', r: '#ff4040',
    f: '#ff7a2f', y: '#ffd23f', o: '#d9480f', W: '#fff4c2' };
  B.defineSprite('boss_friday_deploy', {
    palette: RACK_PAL,
    scale: 4,
    frames: [FLAMES_A.concat(RACK_BODY), FLAMES_B.concat(RACK_BODY)],
  });
  // Phase 2: mehr Feuer, alle LEDs rot
  const RACK_BODY_HOT = RACK_BODY.map((r) => r.replace(/g/g, 'r'));
  B.defineSprite('boss_friday_deploy_hot', {
    palette: RACK_PAL,
    scale: 4,
    frames: [FLAMES_HOT_A.concat(RACK_BODY_HOT), FLAMES_HOT_B.concat(RACK_BODY_HOT)],
  });

  // The Infinite Loop — Kopf (zeigt nach rechts, wird in Fahrtrichtung gedreht); Frame 2 = Maul offen
  B.defineSprite('boss_infinite_loop', {
    palette: { k: K, c: '#3fb8c9', d: '#237a87', l: '#8fe3ee', w: W, r: '#e04848', R: '#7a1f2a' },
    scale: 4,
    frames: [
      [
        '.....kkkkk......',
        '...kkcccccckk...',
        '..kcllccccwwkk..',
        '.kcllcccccwkkck.',
        '.kclccccccccccck',
        'kcdcccccccccckk.',
        'kcdccccccccckww.',
        'kcdcccccccccckk.',
        '.kcdcccccccccck.',
        '.kcdccccccwkkck.',
        '..kcddccccwwkk..',
        '...kkcccccckk...',
        '.....kkkkk......',
      ],
      [
        '.....kkkkk......',
        '...kkcccccckk...',
        '..kcllccccwwkkw.',
        '.kcllcccccwkkkk.',
        '.kclcccccccckrR.',
        'kcdccccccccckRR.',
        'kcdcccccccccRRR.',
        'kcdccccccccckRR.',
        '.kcdcccccccckrR.',
        '.kcdccccccwkkkk.',
        '..kcddccccwwkkw.',
        '...kkcccccckk...',
        '.....kkkkk......',
      ],
    ],
  });

  // Infinite-Loop-Segment — ein ∞-Glied (wird entlang des Koerpers gedreht)
  B.defineSprite('boss_infinite_loop_segment', {
    palette: { k: K, c: '#3fb8c9', l: '#8fe3ee', d: '#237a87' },
    scale: 4,
    rows: [
      '.kkkk....kkkk.',
      'kcllck..kcllck',
      'kc..kckkck..dk',
      'kc...kcck...dk',
      'kc..kckkck..dk',
      'kcddck..kcddck',
      '.kkkk....kkkk.',
    ],
  });
})(window.BOTA);
