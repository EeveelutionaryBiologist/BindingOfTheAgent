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

  // ---------------------------------------------------------------------------
  // The Context Limit family: blass und durchnaesst (Glas, Tinte, aufgeweichtes Papier). Dunkle Kontur, damit sie
  // im Regen lesbar bleiben; Gefahr (Augen, Warnlichter) warm, nie blau. Gemeinsame Palette fuer alle Mitglieder:
  B.CONTEXT_COLORS = {
    outline: '#0e1420', glass: '#b9cde6', glassDark: '#6f86a6', water: '#9ec5ff', ink: '#1b2433',
    paper: '#d8d2c2', paperDark: '#a39b88', warn: '#ffb347', shot: '#ff8a5c',
  };

  // ---- Context-Familie: Slot 1 (Overflow Buffer) ----
  // Overflow Buffer — Glastank auf kurzen Beinen: Metalldeckel mit zwei muede blickenden Augen, Glaswaende,
  // Bodenplatte. Das INNERE des Tanks ist absichtlich transparent: Fluessigkeit, Fuellstandslinie, Textfetzen und
  // Glanzstreifen zeichnet das Verhalten (Innenraum relativ zur Sprite-Mitte: x -16..+16, y -14..+14).
  // Frame 2 = anderer Beinschritt. 12 x 15 Art-Pixel.
  (function () {
    const CC = B.CONTEXT_COLORS;
    const top = [
      '...kkkkkk...',
      '..kmmmmmmk..',
      '..kmwmmwmk..',
      '.kkkkkkkkkk.',
      'kg........gk',
      'kg........gk',
      'kg........gk',
      'kg........gk',
      'kg........gk',
      'kg........gk',
      'kg........gk',
      'kddddddddddk',
      '.kkkkkkkkkk.',
    ];
    B.defineSprite('enemy_overflow_buffer', {
      palette: { k: CC.outline, m: CC.glassDark, d: CC.glassDark, g: CC.glass, w: '#d6e4ff' },
      scale: 4,
      frames: [
        top.concat(['..kk....kk..', '.kk......kk.']),
        top.concat(['...kk..kk...', '...kk..kk...']),
      ],
    });
  })();
  // ---- Ende Slot 1 ----

  // ---- Context-Familie: Slot 2 (Summarizer) ----
  // Summarizer — verhuellter Schreiber in einer aufgeweichten Papierkutte mit Tintenflecken; im dunklen Kapuzen-
  // inneren zwei warme Augen (Bernstein, nie blau), rechts haelt eine blasse Hand einen weissen Federkiel.
  // Frame 0: Kiel oben, Frame 1: Kiel eine Zeile tiefer (Schreibbewegung) und der nasse Saum schwingt.
  // Zeichen: k Kontur, P/p Papier hell/dunkel, i Tinte (Kapuze innen, Flecken, Federspitze), e Augen,
  // w nasser Glanz, f Feder, h Hand
  {
    const CC = B.CONTEXT_COLORS;
    const SUM_PAL = {
      k: CC.outline, P: CC.paper, p: CC.paperDark, i: CC.ink, e: CC.warn, w: CC.water, f: '#eef2f8', h: CC.glass,
    };
    B.defineSprite('enemy_summarizer', {
      palette: SUM_PAL, scale: 4,
      frames: [
        [
          '....kkkk........',
          '...kPwPPk.......',
          '..kPwPPPPk....kk',
          '.kPPpiipPPk..kfk',
          '.kPpiiiiipk.kffk',
          '.kPieiieipk.kfk.',
          '.kPpiiiipPk.kfk.',
          '.kPPpiipPPkkfk..',
          'kPPPppppPPkhk...',
          'kPpPPPPPPPhhk...',
          'kPpPPiPPPpkik...',
          'kPpPPiiPPpPk....',
          'kPPpPPPPPPpk....',
          'kPpPPPPPPPpPk...',
          'kpPpPpPpPpPpk...',
          '.kkk.kkk.kkkk...',
        ],
        [
          '....kkkk........',
          '...kPwPPk.......',
          '..kPwPPPPk......',
          '.kPPpiipPPk...kk',
          '.kPpiiiiipk..kfk',
          '.kPieiieipk.kffk',
          '.kPpiiiipPk.kfk.',
          '.kPPpiipPPk.kfk.',
          'kPPPppppPPkkfk..',
          'kPpPPPPPPPkhk...',
          'kPpPPiPPPhhik...',
          'kPpPPiiPPpPk....',
          'kPPpPPPPPPpk....',
          'kPpPPPPPPPpPk...',
          'kPpPpPpPpPpPk...',
          '.kkkk.kkk.kkk...',
        ],
      ],
    });
  }
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // [[SLOT lost_in_the_middle]]
  // ---- Ende Slot 3 ----

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

  // The Megalith (ab Etage 7 statt des Monolith) — breitere, dunklere Granitplatte mit syntaxfarbigen Codezeilen
  // (1 px pro Zeichen, Einrueckung wie in echtem Code) und einer Bildlaufleiste am rechten Rand, deren Daumen genau
  // ein Pixel hoch ist (6 Millionen Zeilen). Frames: 0/1 Code scrollt um eine Zeile, 2/3 dito mit gluehenden Augen.
  // Phase 2 ("Refactor rejected"): rot gluehende Risse, Code in Fehlerfarben (eigene Palette).
  const MEGA_W = 30;
  const MEGA_LINES = [   // [Einrueckung in px, [[Laenge, Farbzeichen], ...]] — a Schluesselwort, c Name, b String, g Kommentar
    [0, [[3, 'a'], [5, 'c'], [2, 'b']]],
    [2, [[2, 'a'], [4, 'c'], [3, 'g']]],
    [2, [[3, 'a'], [6, 'b']]],
    [4, [[2, 'a'], [3, 'c'], [4, 'g']]],
    [4, [[5, 'c'], [3, 'b']]],
    [6, [[2, 'a'], [6, 'c']]],
    [4, [[1, 'a']]],
    [2, [[4, 'c'], [2, 'g'], [3, 'b']]],
    [0, [[1, 'a']]],
  ];
  const MEGA_CRACKS = [[8, 14], [9, 15], [10, 15], [11, 14], [12, 13], [13, 13], [14, 14], [15, 14],
    [18, 8], [19, 9], [20, 9], [21, 10], [22, 20], [23, 19], [24, 19], [25, 18]];
  function megaRows(glow, off, cracked) {
    const blank = (ch) => ch.repeat(MEGA_W).split('');
    const rows = [];
    for (let y = 0; y < 32; y++) {
      const r = blank('.');
      if (y === 0 || y === 28) for (let x = 2; x <= 27; x++) r[x] = 'k';
      else if (y === 1) { r[2] = 'k'; for (let x = 3; x <= 25; x++) r[x] = 'l'; r[26] = 'd'; r[27] = 'k'; }
      else if (y <= 26) {
        r[2] = 'k'; r[3] = 'l';
        for (let x = 4; x <= 23; x++) r[x] = 's';
        r[24] = y === 3 ? 'T' : 't'; r[25] = 's'; r[26] = 'd'; r[27] = 'k';
      } else if (y === 27) { r[2] = 'k'; r[3] = 'l'; for (let x = 4; x <= 26; x++) r[x] = 'd'; r[27] = 'k'; }
      else if (y === 29) { r[1] = 'k'; for (let x = 2; x <= 27; x++) r[x] = 'D'; r[28] = 'k'; }
      else if (y === 30) { r[0] = 'k'; for (let x = 1; x <= 28; x++) r[x] = 'D'; r[29] = 'k'; }
      else for (let x = 0; x < MEGA_W; x++) r[x] = 'k';
      rows.push(r);
    }
    // Augen: zwei Schlitze, spiegelsymmetrisch zur Mitte
    for (const x0 of [7, 17]) {
      for (let x = x0; x <= x0 + 5; x++) { rows[4][x] = 'k'; rows[6][x] = 'k'; }
      rows[5][x0] = 'k'; rows[5][x0 + 5] = 'k';
      for (let x = x0 + 1; x <= x0 + 4; x++) rows[5][x] = glow ? 'R' : 'r';
    }
    // Codezeilen (jede zweite Zeile ab 9), Frame 1 um eine Zeile weitergescrollt
    for (let j = 0; j < 9; j++) {
      const [ind, toks] = MEGA_LINES[(j + off) % MEGA_LINES.length];
      let x = 5 + ind;
      for (const [len, ch] of toks) {
        for (let i = 0; i < len && x <= 22; i++) rows[9 + j * 2][x++] = ch;
        x++;
      }
    }
    if (cracked) for (const [y, x] of MEGA_CRACKS) rows[y][x] = 'x';
    return rows.map((r) => r.join(''));
  }
  const MEGA_PAL = { k: K, l: '#6b7079', s: '#474c55', d: '#33373e', D: '#24272c', t: '#2a2d33', T: '#f2f2f2',
    r: '#c83232', R: '#ff8a7a', a: '#ff7ab6', b: '#ffcf4d', c: '#7fd4ff', g: '#9be07a', x: '#ff5a46' };
  const megaFrames = (cracked) => [megaRows(false, 0, cracked), megaRows(false, 1, cracked),
    megaRows(true, 0, cracked), megaRows(true, 1, cracked)];
  B.defineSprite('boss_megalith', { palette: MEGA_PAL, scale: 4, frames: megaFrames(false) });
  B.defineSprite('boss_megalith_cracked', {
    palette: Object.assign({}, MEGA_PAL, { a: '#ff5a5a', b: '#ffb070', c: '#ff9a6a', g: '#ffd27a', s: '#4b464d' }),
    scale: 4,
    frames: megaFrames(true),
  });
  // Modul des Megalith: kleiner Granitblock mit einer Codezeile, auf Beinchen (kriecht zurueck zum Boss)
  B.defineSprite('enemy_megalith_module', {
    palette: MEGA_PAL,
    scale: 4,
    frames: [
      [
        '.kkkkkkkk.',
        'kllllllldk',
        'klssssssdk',
        'klaascccdk',
        'klsbbbssdk',
        'klssssssdk',
        'kdddddddDk',
        '.kkkkkkkk.',
        '.k.k..k.k.',
      ],
      [
        '.kkkkkkkk.',
        'kllllllldk',
        'klssssssdk',
        'klsbbbssdk',
        'klaascccdk',
        'klssssssdk',
        'kdddddddDk',
        '.kkkkkkkk.',
        'k.k....k.k',
      ],
    ],
  });

  // The Shareholder (ab Etage 7 statt der Stakeholderin) — derselbe Anzug-Schatten, aber mit Zylinder (Goldband),
  // goldenem Monokel ueber dem rechten Auge, Uhrkette ueber der Weste und goldenem Aktenkoffer. Das Monokel-
  // Funkeln (Telegraph des Strahls) zeichnet das Verhalten selbst. Phase 2: rote Augen, wie die Stakeholderin.
  const SHARE_HAT = [
    '.......kkkkkkkk.......',
    '.......kHHHHHHk.......',
    '.......kHHHHHHk.......',
    '.......kHHHHHHk.......',
    '.......kGGGGGGk.......',
    '....kkkkkkkkkkkkkk....',
  ];
  const SHARE_STAMPS = [
    [2, 11, 'm'], [2, 12, 'm'], [2, 13, 'm'], [3, 11, 'm'], [3, 12, 'E'], [3, 13, 'm'], [4, 11, 'm'], [4, 12, 'm'], [4, 13, 'm'],
    [11, 12, 'G'], [12, 13, 'G'], [12, 14, 'G'], [11, 15, 'm'],
  ];
  const shareRows = (sway) => SHARE_HAT.concat(B.spriteTools.stamp(STAKE_ROWS(sway), SHARE_STAMPS));
  const SHARE_PAL = Object.assign({}, STAKE_PAL, { s: '#2a2238', d: '#1c1726', h: '#3d3a46', H: '#1b1c22',
    G: '#e0b23c', m: '#f2c84b', E: '#fff6c8', b: '#d9a92c', B: '#a77c17', g: '#fff1a8' });
  B.defineSprite('boss_shareholder', { palette: SHARE_PAL, scale: 4, frames: [shareRows(false), shareRows(true)] });
  B.defineSprite('boss_shareholder_angry', {
    palette: Object.assign({}, SHARE_PAL, { e: '#ff4040', E: '#ff9a7a', h: '#4a2f36' }),
    scale: 4,
    frames: [shareRows(false), shareRows(true)],
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
  const LOOP_HEAD_PAL = { k: K, c: '#3fb8c9', d: '#237a87', l: '#8fe3ee', w: W, r: '#e04848', R: '#7a1f2a' };
  const LOOP_HEAD_FRAMES = [
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
    ];
  B.defineSprite('boss_infinite_loop', { palette: LOOP_HEAD_PAL, scale: 4, frames: LOOP_HEAD_FRAMES });

  // Infinite-Loop-Segment — ein ∞-Glied (wird entlang des Koerpers gedreht)
  const LOOP_SEG_ROWS = [
    '.kkkk....kkkk.',
    'kcllck..kcllck',
    'kc..kckkck..dk',
    'kc...kcck...dk',
    'kc..kckkck..dk',
    'kcddck..kcddck',
    '.kkkk....kkkk.',
  ];
  B.defineSprite('boss_infinite_loop_segment', { palette: { k: K, c: '#3fb8c9', l: '#8fe3ee', d: '#237a87' }, scale: 4, rows: LOOP_SEG_ROWS });
  // ===========================================================================
  // Forgotten Branches: Stale Branch
  // ===========================================================================
  // Gemeinsame Farbwelt der "branches"-Familie (Etage Forgotten Branches): Rinde, Laub und die dunkelgruene
  // Kontur des Busch-Objekts (prop_bush) statt Schwarz. Gruen ist dort nur fuer Harmloses/Laub — Gefahr
  // (Schuesse, Telegraphen, wuetende Augen) ist warm (Bernstein/Koralle/Kirsche).
  // B.BRANCH_LEAVES wird auch von den Laub-Partikeln (effects.js) und dem Stale-Branch-Verhalten genutzt,
  // damit fallende Blaetter exakt die Farben der Sprites haben.
  B.BRANCH_LEAVES = {
    outline: '#16240f',
    bark: ['#5a3d22', '#a3602c'],                 // dunkle / helle Rinde
    green: ['#4f7a30', '#6f9a3c', '#86ad4a'],     // je [dunkel, mittel, hell]
    yellow: ['#a8822a', '#d6ae3a', '#f0d264'],
    brown: ['#6b4423', '#93602e', '#b8803f'],
  };

  // Stale Branch — Zweig-Kreatur mit erhobenen Aesten; das Laub altert gruen -> gelb -> braun -> kahl.
  // Aufbau: kahles Geruest (Rinde, Gesicht im Stamm, zwei Beine) + Laub-Ebene, die darueber gestempelt wird
  // ('.' = Geruest bleibt sichtbar). So teilen sich alle Altersstufen dieselbe Silhouette.
  // Zeichen: k Kontur, b/B Rinde dunkel/hell, w Augenweiss, e Pupille, m Mund; Laub: o Kontur, d/l/L dunkel/mittel/hell.
  const STALE_SKEL = [
    '...............',
    '...............',
    '...............',
    '..B.........B..',
    '...B...B...B...',
    '....B..B..B....',
    '.....B.B.B.....',
    '.....kBBBk.....',
    '....kbBBBbk....',
    '....kwebwek....',
    '....kbbBbbk....',
    '....kbbmbbk....',
    '.....kbbbk.....',
    '.....kbbbk.....',
  ];
  // Beine (zwei Lauf-Frames): Zweig-Beinchen, die abwechselnd ausschreiten
  const STALE_LEGS_A = ['....kBk.kBk....', '...kBk...kBk...'];
  const STALE_LEGS_B = ['.....kBkBk.....', '....kBk.kBk....'];
  // Volles Laub: drei Buesche an den Astspitzen (links, oben, rechts) — linke Haelfte, gespiegelt
  const STALE_LEAVES_FULL = symOdd([
    '.....ooo',
    '.oo.oLLl',
    'oLLooLll',
    'oLlldodd',
    '.oddo...',
    '..oo....',
  ]);
  // Welkes Laub (braun): rechter Busch schon abgefallen, die anderen ausgeduennt
  const STALE_LEAVES_SPARSE = [
    '......ooo......',
    '.oo..oLldo.....',
    'oLdo..odo......',
    'oldo...........',
    '.oo............',
    '...............',
  ];
  /** Laub-Ebene ueber das Geruest stempeln ('.' in der Ebene = Geruest bleibt) */
  function overlay(base, layer) {
    return base.map((row, r) => {
      const top = layer[r];
      if (!top) return row;
      let out = '';
      for (let c = 0; c < row.length; c++) out += top[c] && top[c] !== '.' ? top[c] : row[c];
      return out;
    });
  }
  function staleFrames(leaves) {
    const body = leaves ? overlay(STALE_SKEL, leaves) : STALE_SKEL;
    return [body.concat(STALE_LEGS_A), body.concat(STALE_LEGS_B)];
  }
  const BL = B.BRANCH_LEAVES;
  const STALE_PAL = { k: BL.outline, o: BL.outline, b: BL.bark[0], B: BL.bark[1], w: '#f3ead8', e: BL.outline, m: '#2a1a0e' };
  const leafPal = (cols) => Object.assign({}, STALE_PAL, { d: cols[0], l: cols[1], L: cols[2] });
  B.defineSprite('enemy_stale_branch', { palette: leafPal(BL.green), scale: 4, frames: staleFrames(STALE_LEAVES_FULL) });
  B.defineSprite('enemy_stale_branch_yellow', { palette: leafPal(BL.yellow), scale: 4, frames: staleFrames(STALE_LEAVES_FULL) });
  B.defineSprite('enemy_stale_branch_brown', { palette: leafPal(BL.brown), scale: 4, frames: staleFrames(STALE_LEAVES_SPARSE) });
  // Kahl: nur noch das Geruest — und die Pupillen gluehen kirschrot (Warnung: jetzt springt er)
  B.defineSprite('enemy_stale_branch_bare', {
    palette: Object.assign({}, STALE_PAL, { e: '#d64545' }), scale: 4, frames: staleFrames(null),
  });

  // ===========================================================================
  // Forgotten Branches: Detached HEAD
  // ===========================================================================
  // Familien-Optik der Forgotten Branches: Rinde/Laub statt Metall, dunkelgruene Kontur (#16240f wie prop_bush)
  // statt Schwarz. Gefaehrliches ist nie gruen (Boden ist gruen): Schuesse und Warnungen sind Bernstein.
  const BR = {
    k: '#16240f',            // Kontur (dunkelgruen)
    b: '#5a3d22',            // Rinde dunkel
    B: '#a3602c',            // Rinde hell
    l: '#c98a4a',            // helles Holz (Schnittflaeche, Anhaenger)
    L: '#e8c890',            // Holz-Glanzlicht
  };

  // Koerper — stummeliger Baumstumpf auf Zweigbeinen. Oben die Schnittflaeche mit einem leeren, warm
  // gluehenden Sockel (dort gehoert der Kopf hin). Frame 1/2: Beine gespreizt / unter dem Koerper.
  const HEAD_STUMP_TOP = [
    '..kkkkkkkk..',
    '.kLlllllllk.',
    'klkkkkkkkklk',
    'kkyYYYYYYykk',
    'kBkyyyyyykBk',
    'kBBkkkkkkBBk',
  ];
  const HEAD_STUMP_BARK = [
    'kbBBbBBbBBbk',
    'kbBbBBbBbBbk',
    'kbBBbBbBBbbk',
    'kbbBbBBbBbbk',
    '.kbbbbbbbbk.',
    '..kkkkkkkk..',
  ];
  const HEAD_LEGS_A = ['..kB....Bk..', '.kB......Bk.'];
  const HEAD_LEGS_B = ['...kB..Bk...', '...kB..Bk...'];
  const HEAD_BODY_PAL = Object.assign({ y: '#ffb84d', Y: '#ffe9a8' }, BR);
  B.defineSprite('enemy_detached_head', {
    palette: HEAD_BODY_PAL,
    scale: 4,
    frames: [HEAD_STUMP_TOP.concat(HEAD_STUMP_BARK, HEAD_LEGS_A), HEAD_STUMP_TOP.concat(HEAD_STUMP_BARK, HEAD_LEGS_B)],
  });
  // Ohne Kopf: Sockel erloschen (dunkles Loch statt Gluehen)
  B.defineSprite('enemy_detached_head_lost', {
    palette: Object.assign({}, HEAD_BODY_PAL, { y: '#2a1d10', Y: '#3a2a18' }),
    scale: 4,
    frames: [HEAD_STUMP_TOP.concat(HEAD_STUMP_BARK, HEAD_LEGS_A), HEAD_STUMP_TOP.concat(HEAD_STUMP_BARK, HEAD_LEGS_B)],
  });

  // Kopf — Holz-Anhaenger in Pfeilform (Spitze rechts, mit Loch fuer die Schnur) und einem grossen Auge auf der
  // stumpfen Seite. Frame 2: Pupille zuckt zur Spitze (nervoes). Das Spiel spiegelt ihn zum Spieler hin.
  const HEAD_TAG_A = [
    '.kkkkkkkkk....',
    'kLLLLLLLLLk...',
    'klllkkkklllk..',
    'kllkwwwwklllk.',
    'klkwwppwwklllk',
    'klkwwppwwklhlk',
    'kBkwwwwwwkllBk',
    'kBBkwwwwkBBBk.',
    'kBBBkkkkBBBk..',
    '.kkkkkkkkkk...',
  ];
  const HEAD_TAG_B = HEAD_TAG_A.map((r, i) => (i === 4 ? 'klkwwwppwklllk' : i === 5 ? 'klkwwwppwklhlk' : r));
  const HEAD_TAG_PAL = Object.assign({ w: '#f4efe6', p: '#16240f', h: '#16240f' }, BR);
  B.defineSprite('enemy_detached_head_tag', {
    palette: HEAD_TAG_PAL,
    scale: 4,
    frames: [HEAD_TAG_A, HEAD_TAG_B],
  });
  // Warnung vor dem Schuss: Auge gluet bernsteinfarben (heller Rand, dunkle Pupille wird zur Glut)
  B.defineSprite('enemy_detached_head_tag_glow', {
    palette: Object.assign({}, HEAD_TAG_PAL, { w: '#ffcf4d', p: '#fff3c4' }),
    scale: 4,
    frames: [HEAD_TAG_A, HEAD_TAG_B],
  });
  // ===========================================================================
  // Forgotten Branches: Cherry-Pick
  // ===========================================================================
  // Eine Kirsche mit Stielstummel oben (dort setzt der gezeichnete Stiel an, siehe enemy.js 'cherry'),
  // dunkelgruene Kontur der Forgotten-Branches-Familie (#16240f, wie prop_bush). Die Kirschen selbst duerfen rot
  // sein (sie sind die Bedrohung); Gruen nur am Stiel.
  //   enemy_cherry_pick        ruhig: Frame 0 normal, Frame 1 Blinzeln (das Verhalten waehlt den Frame)
  //   enemy_cherry_pick_angry  wuetend, dunkler: Frame 0 zusammengekniffene Augen, Frame 1 aufgeblasene Backen
  //                            (Telegraph vor dem Kern-Schuss)
  const CHERRY_K = '#16240f';
  B.defineSprite('enemy_cherry_pick', {
    palette: { k: CHERRY_K, r: '#e0433f', l: '#ff9a8a', d: '#9c2430', w: W, g: '#6f9a3c' },
    scale: 4,
    frames: [
      [
        '......kk....',
        '.....kgk....',
        '...kkkgkkk..',
        '..krrlrrrrk.',
        '.krrllrrrrdk',
        '.krlwwrwwrdk',
        '.krrwkrwkrdk',
        '.krrrrrrrrdk',
        '.krrrkkkrrdk',
        '..krrrrrrdk.',
        '...kdddddk..',
        '....kkkkk...',
      ],
      [
        '......kk....',
        '.....kgk....',
        '...kkkgkkk..',
        '..krrlrrrrk.',
        '.krrllrrrrdk',
        '.krlrrrrrrdk',
        '.krrkkrkkrdk',
        '.krrrrrrrrdk',
        '.krrrkkkrrdk',
        '..krrrrrrdk.',
        '...kdddddk..',
        '....kkkkk...',
      ],
    ],
  });

  B.defineSprite('enemy_cherry_pick_angry', {
    palette: { k: CHERRY_K, r: '#a8202e', l: '#d0505a', d: '#5e0f19', w: W, g: '#6f9a3c', p: '#ff7a5c' },
    scale: 4,
    frames: [
      [
        '......kk....',
        '.....kgk....',
        '...kkkgkkk..',
        '..krrlrrrrk.',
        '.krkkrrrkkdk',
        '.krrwkrkwrdk',
        '.krrrrrrrrdk',
        '.krrrkkkrrdk',
        '.krrkrrrkrdk',
        '..krrrrrrdk.',
        '...kdddddk..',
        '....kkkkk...',
      ],
      [
        '......kk....',
        '.....kgk....',
        '...kkkgkkk..',
        '..krrlrrrrk.',
        '.krkkrrrkkdk',
        '.krrwkrkwrdk',
        'krrrrrrrrrrk',
        'krpprrkrrppk',
        'krpprrrrrppk',
        '.krrrrrrrrdk',
        '..kkdddddkk.',
        '....kkkkk...',
      ],
    ],
  });

  // ===========================================================================
  // Forgotten Branches: Orphan Commit
  // ===========================================================================
  // Ein kleiner weisser Commit-Punkt mit Blatt-Huetchen und grossen traurigen Augen. Er ist harmlos (eine
  // Belohnung), deshalb darf das Huetchen gruen sein. Kontur der Familie (#16240f).
  //   Frame 0: traurig, Frame 1: mit Traene (das Verhalten wechselt langsam zwischen beiden)
  // Zeichen: k Kontur, w Weiss, s Schatten, d/g/G Blatt dunkel/mittel/hell, h Glanzpunkt im Auge,
  // p Wangenroete, t Traene. Die Augen haben bewusst einen Glanzpunkt und keine "Zahnreihe" als Mund:
  // dunkle Augenhoehlen plus gestrichelter Mund lasen sich in der ersten Fassung als Totenkopf.
  const ORPHAN_PAL = {
    k: B.BRANCH_LEAVES.outline, w: '#f3f6ef', s: '#c3cdbd',
    d: B.BRANCH_LEAVES.green[0], g: B.BRANCH_LEAVES.green[1], G: B.BRANCH_LEAVES.green[2],
    h: W, p: '#f2a7a0', t: '#9ec5ff',
  };
  const ORPHAN_A = [
    '.....kk...',
    '....kGGk..',
    '...kgGgk..',
    '...kdgk...',
    '..kkkdkk..',
    '.kwwwwwwk.',
    'kwwwwwwwwk',
    'kwhkwwhkwk',
    'kwkkwwkkwk',
    'kpwwkkwwpk',
    '.kswwwwsk.',
    '..kkkkkk..',
  ];
  const ORPHAN_B = ORPHAN_A.slice();
  ORPHAN_B[9] = 'kptwkkwwpk';
  ORPHAN_B[10] = '.kstwwwsk.';
  B.defineSprite('enemy_orphan_commit', { palette: ORPHAN_PAL, scale: 4, frames: [ORPHAN_A, ORPHAN_B] });

  // ===========================================================================
  // Forgotten Branches: Octopus Merge (Boss)
  // ===========================================================================
  // Der Knoten: eine Wurzelknolle mit Jahresringen und acht Wurzelstummeln (dort setzen die gezeichneten Arme an),
  // in der Mitte der Merge-Commit (cremefarbener Ring, dunkler Kern), oben ein Laubbuescherl. Bewusst KEIN
  // Gesicht und keine Tier-Merkmale: er soll als Pflanze lesen, nicht als Comic-Krake (siehe AGENTS.md §9).
  // Prozedural erzeugt (wie das Rohr), damit Ringe und Stummel symmetrisch und sauber werden.
  //   Frame 0: Kern dunkel; Frame 1: Kern glueht bernsteinfarben (Telegraph der Schussstroeme)
  // Zeichen: k Kontur, b/m/B Rinde dunkel/mittel/hell, h Lichtkante, c Commit-Ring, o Kern, a/y Glut, g/G Laub
  const OCTO_PAL = {
    k: B.BRANCH_LEAVES.outline, b: B.BRANCH_LEAVES.bark[0], m: '#7a4e2a', B: B.BRANCH_LEAVES.bark[1], h: '#c98a4a',
    c: '#e8dcc0', o: '#3a2a1a', a: '#ffcf4d', y: '#fff3c4', g: B.BRANCH_LEAVES.green[1], G: B.BRANCH_LEAVES.green[2],
  };
  function octoKnotRows(glow) {
    const N = 23, c = (N - 1) / 2;
    const rows = [];
    for (let y = 0; y < N; y++) {
      let row = '';
      for (let x = 0; x < N; x++) {
        const dx = x - c, dy = y - c;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        // Umriss: Kreis mit acht Wurzelstummeln und leichter Unregelmaessigkeit
        const R = 8.3 + 2.0 * Math.pow(Math.max(0, Math.cos(8 * (a - Math.PI / 8))), 5) + 0.35 * Math.sin(5 * a + 1);
        let ch = '.';
        if (d <= R) {
          if (d > R - 1.15) ch = 'k';
          else if (d < 1.9) ch = glow ? (d < 1 ? 'y' : 'a') : 'o';
          else if (d < 3.2) ch = 'c';
          else if (d < 4.1) ch = 'k';
          else {
            // Jahresringe, leicht gewellt; Lichtkante oben links
            const ring = Math.floor((d + 0.5 * Math.sin(3 * a)) / 1.5) % 2;
            ch = ring ? 'm' : 'b';
            if (d > R - 2.3) ch = dx + dy < -2 ? 'h' : (dx + dy > 3 ? 'b' : 'B');
          }
        }
        row += ch;
      }
      rows.push(row);
    }
    // Laubbuescherl oben (zwei Blaetter am obersten Stummel), nur ausserhalb der Knolle stempeln
    const leaves = [[9, 0, 'k'], [10, 0, 'k'], [8, 1, 'k'], [9, 1, 'G'], [10, 1, 'g'], [11, 1, 'k'],
      [13, 0, 'k'], [14, 0, 'k'], [12, 1, 'k'], [13, 1, 'g'], [14, 1, 'G'], [15, 1, 'k']];
    for (const [x, y, ch] of leaves) {
      if (rows[y][x] === '.') rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
    }
    return rows;
  }
  B.defineSprite('boss_octopus_merge', { palette: OCTO_PAL, scale: 4, frames: [octoKnotRows(false), octoKnotRows(true)] });

  // Arm-Spitze: ein Commit-Punkt (wie im Git-Graphen) mit Holzrand; Frame 1 glueht vor dem Schuss.
  const OCTO_TIP = [
    '...kkkk...',
    '..kBBBBk..',
    '.kBccccBk.',
    'kBcckkccBk',
    'kBckookcbk',
    'kBckookcbk',
    'kBcckkccbk',
    '.kbccccbk.',
    '..kbbbbk..',
    '...kkkk...',
  ];
  const OCTO_TIP_GLOW = OCTO_TIP.map((r) => r.replace(/o/g, 'a'));
  OCTO_TIP_GLOW[4] = 'kBckyakcbk';
  B.defineSprite('boss_octopus_merge_tip', { palette: OCTO_PAL, scale: 4, frames: [OCTO_TIP, OCTO_TIP_GLOW] });

  // ===========================================================================
  // Sandbox Borders: Spinlock und Rootkit
  // ===========================================================================
  // Einzelne Pixel setzen: [[zeile, spalte, zeichen], ...] (B.spriteTools.stamp aus sprites-core.js)
  const stampRows = (rows, stamps) => B.spriteTools.stamp(rows, stamps);
  // Familien-Optik "sandbox": dunkle Koerper mit hellen Sand-Mustern und kraeftiger Kontur — auf dem hellen Sand
  // muss Gefaehrliches dunkel sein (umgekehrt zu Forgotten Branches, wo der Boden dunkel-gruen ist).

  // Spinlock — Wuestenschlange von oben. Kopf zeigt nach rechts (das Verhalten dreht ihn), Frame 1 mit Zunge.
  // Zeichen: k Kontur, b Koerper, d Mittelstreifen, l helle Raute, y Auge, r Zunge
  const SPIN_PAL = { k: '#1f140a', b: '#6b4a28', d: '#3a2614', l: '#e8c88a', y: '#ffcf4d', r: '#d64545', c: '#c9b48a', w: '#efe2c0' };
  const SPIN_HEAD = [
    '..............',
    '..............',
    '..............',
    '...kkkkk......',
    'kkkbbdbykk....',
    'kbbblddbbbk...',
    'kbbblddbbbbk..',
    'kbbblddbbbk...',
    'kkkbbdbykk....',
    '...kkkkk......',
    '..............',
    '..............',
    '..............',
    '..............',
  ];
  const SPIN_HEAD_TONGUE = stampRows(SPIN_HEAD, [[6, 12, 'r'], [6, 13, 'r'], [5, 13, 'r'], [7, 13, 'r']]);
  B.defineSprite('enemy_spinlock', { palette: SPIN_PAL, scale: 4, frames: [SPIN_HEAD, SPIN_HEAD_TONGUE] });
  // Koerperglied: dunkler Ruecken mit einer vollen hellen Raute (aneinandergereiht ergibt das das typische
  // Rautenmuster). Bewusst keine dunkle Mitte — ein Ring mit Loch las sich wie ein Donut.
  B.defineSprite('enemy_spinlock_body', {
    palette: SPIN_PAL, scale: 4,
    rows: [
      '...kkkk...',
      '.kkbbbbkk.',
      '.kbbllbbk.',
      'kbbllllbbk',
      'kblllllldk',
      'kblllllldk',
      'kbbllllddk',
      '.kbbllddk.',
      '.kkbddddk.',
      '...kkkk...',
    ],
  });
  // Rassel: drei Ringe, zeigt mit dem Stummel nach rechts (zum Vorgaenger); Frame 1 = Glanz verschoben (Rasseln)
  const SPIN_TAIL = [
    '............',
    '............',
    '............',
    '..kkkkkkkk..',
    '.kwwkwwkwwbk',
    'kwcckccwccbk',
    'kwcckccwccbk',
    '.kwwkwwkwwbk',
    '..kkkkkkkk..',
    '............',
    '............',
    '............',
  ];
  B.defineSprite('enemy_spinlock_tail', {
    palette: SPIN_PAL, scale: 4,
    frames: [SPIN_TAIL, SPIN_TAIL.map((r) => r.replace(/w/g, '#').replace(/c/g, 'w').replace(/#/g, 'c'))],
  });

  // Rootkit — Maulwurf mit Grubenhelm und Stirnlampe, rote Augen. Frame 1: gerade herausgeploppt (Augen weit).
  // Zeichen: k Kontur, g Helm, y Lampe, b Fell, e Auge, p Schnauze, P Nase, c Krallen
  const ROOTKIT_PAL = { k: '#1f140a', g: '#7a7f88', y: '#ffe27a', b: '#5a4230', e: '#ff5a4d', p: '#e89aa0', P: '#b85a66', c: '#e8dcc0' };
  const ROOTKIT = [
    '....kkkk....',
    '...kgyygk...',
    '..kggggggk..',
    '.kkkkkkkkkk.',
    '.kbbbbbbbbk.',
    'kbbebbbbebbk',
    'kbbbbppbbbbk',
    'kbbbpPPpbbbk',
    'kbbbbbbbbbbk',
    'kckbbbbbbkck',
    'kcckbbbbkcck',
    '.kk.kkkk.kk.',
  ];
  B.defineSprite('enemy_rootkit', {
    palette: ROOTKIT_PAL, scale: 4,
    frames: [ROOTKIT, stampRows(ROOTKIT, [[5, 4, 'e'], [5, 7, 'e'], [4, 3, 'e'], [4, 8, 'e']])],
  });
  // Sandhuegel ueber dem vergrabenen Rootkit; Frame 1 = aufgebrochen (Telegraph / Loch beim Auftauchen)
  const MOUND_PAL = { k: '#3a2814', L: '#e0c08a', M: '#b8955e', D: '#8a6a3e', s: 'rgba(0,0,0,0.25)' };
  const MOUND = [
    '................',
    '.....kkkkkk.....',
    '...kkLLMMMMkk...',
    '..kLLMMMMMMDDk..',
    '.kLMMMMMMMMMDDk.',
    'kMMMMDMMMMMMDDDk',
    'kkkkkkkkkkkkkkkk',
    '.ssssssssssssss.',
  ];
  B.defineSprite('enemy_rootkit_mound', {
    palette: MOUND_PAL, scale: 4,
    frames: [MOUND, stampRows(MOUND, [[2, 7, 'k'], [3, 7, 'k'], [3, 8, 'k'], [4, 6, 'k'], [4, 9, 'k'], [5, 9, 'k'], [2, 10, 'D']])],
  });

  // Dust Daemon — dunkler Staubteufel (Trichter, oben breit, unten spitz) mit zwei glimmenden roten Augen.
  // Helle Staubstreifen wandern zwischen den Frames (Drehung); das Verhalten spiegelt das Sprite beim Gegen-Drehsinn.
  // Zeichen: k Kontur, d dunkler Staub, m mittlerer Staub, l heller Streifen, e Auge, E Augenglanz
  const DUST_PAL = { k: '#140c06', d: '#2e2014', m: '#4a3624', l: '#7a5c3c', e: '#e8402a', E: '#ffb38a' };
  B.defineSprite('enemy_dust_daemon', {
    palette: DUST_PAL, scale: 4,
    frames: [
      [
        '..kkkkkkkkk..',
        '.kdmmllldmmk.',
        'kdmmmdddllmmk',
        'kmllmmmmmmddk',
        '.kdmEemmEemk.',
        '.kmmeemmeemk.',
        '..kddllmmdk..',
        '..kmmmmdllk..',
        '...kdllmmk...',
        '...kmmddk....',
        '....kdmlk....',
        '....kmdk.....',
        '.....kmk.....',
        '.....kk......',
      ],
      [
        '..kkkkkkkkk..',
        '.kmmdddllmmk.',
        'kllmmmmmddmmk',
        'kmmddllmmmllk',
        '.kdmEemmEemk.',
        '.kmmeemmeemk.',
        '..kllmmddmk..',
        '..kmddmmmmk..',
        '...kmmlldk...',
        '....kddmmk...',
        '....klmdk....',
        '.....kdmk....',
        '.....kmk.....',
        '......kk.....',
      ],
    ],
  });

  // ===========================================================================
  // The Training Data: Dry Run
  // ===========================================================================
  // Dry Run — Crashtest-Dummy (Probelauf-Puppe): bernsteingelber Gliederkoerper, schwarz-weisse Messmarken am Kopf
  // und an der Brust, dunkle Gelenke. Bewusst nicht gruen (der Boden von The Training Data ist gruen).
  // Frame 1: Schritt (ein Bein angehoben, Arme schwingen). Der Geist ist dieses Sprite als weisse Silhouette.
  // Zeichen: k Kontur, y Koerper, Y Glanz, o Schatten, j Gelenk, w helle Markenviertel (dunkle = k)
  const DRY_PAL = { k: '#1a1208', y: '#e8b23a', Y: '#f6d27a', o: '#a8741c', j: '#5a3e14', w: '#fff3d0' };
  B.defineSprite('enemy_dry_run', {
    palette: DRY_PAL, scale: 4,
    frames: [
      [
        '....kkkk....',
        '...kYyyyk...',
        '..kYywkyyk..',
        '..kywwkkyk..',
        '..kykkwwyk..',
        '..kyykwyyk..',
        '...kyyyok...',
        '....kjjk....',
        '.kkkyyyykkk.',
        'kyykywkykyyk',
        'kyykwwkkkyyk',
        'kjjkyyyyokjk',
        '.kkkoooookk.',
        '...kyk.kyk..',
        '...kok.kok..',
        '...kjk.kjk..',
        '...kkk.kkk..',
      ],
      [
        '....kkkk....',
        '...kYyyyk...',
        '..kYywkyyk..',
        '..kywwkkyk..',
        '..kykkwwyk..',
        '..kyykwyyk..',
        '...kyyyok...',
        '....kjjk....',
        '.kkkyyyykkk.',
        'kyykywkykjjk',
        'kyykwwkkkyyk',
        'kjjkyyyyokyk',
        '.kkkoooookk.',
        '...kyk.kyk..',
        '...kok.kjk..',
        '...kjk.kkk..',
        '...kkk......',
      ],
    ],
  });

  // ===========================================================================
  // Legacy Codebase: Stack Trace
  // ===========================================================================
  // Ein Skorpion aus einem alten Rechnergehaeuse (Neunziger-Beige, Lueftungsfugen, bernsteinfarbene Monochrom-
  // Augen in einem dunklen Sichtfenster), Blick nach unten, Scheren vorn. Den Schwanz zeichnet das Verhalten aus
  // einzelnen Blaettern Endlospapier (Lochrand + gruene Balken) und dem Stachel (entities/enemy.js 'stack_trace').
  // Auf dem dunklen Blaugrau der Legacy-Etage muss er hell sein, mit kraeftiger dunkler Kontur.
  // Zeichen: k Kontur, b Beige, l Lichtkante, s Schatten-Beige, d Fuge/Sichtfenster, e/E Auge (Bernstein/hell),
  // c Schere, C Scheren-Licht
  const ST_PAL = { k: '#14181a', b: '#d8cda8', l: '#f1e9cf', s: '#a99d78', d: '#4a4a40', e: '#ffb347', E: '#fff0b8',
    c: '#bfb28c', C: '#e9dfbf' };
  // Halbe Zeilen, gespiegelt mit sym() (18 px breit). Frame 1: Beine eine Zeile versetzt (Krabbeln), Scheren zu.
  const ST_BODY = sym([
    '.........',
    '......kkk',
    '....kklll',
    'k..kllbbb',
    '.k.kbbbdb',
    '..kkbbbbb',
    'k..kbbbdb',
    '.kkksbbbb',
    'k..ksdddd',
    '.kkkddeEd',
    '...ksdddd',
    '..kksbbbb',
    '.kckkssbb',
    'kcck.kkkk',
    'kCcck....',
    'kc.kk....',
    'kcck.....',
    '.kk......',
  ]);
  const ST_BODY_B = sym([
    '.........',
    '......kkk',
    '....kklll',
    '...kllbbb',
    'kk.kbbbdb',
    '..kkbbbbb',
    '...kbbbdb',
    'kkkksbbbb',
    '...ksdddd',
    'kkkkddeEd',
    '...ksdddd',
    '..kksbbbb',
    '..kckssbb',
    '.kcck.kkk',
    '.kCcck...',
    '.kc.kk...',
    '.kcck....',
    '..kk.....',
  ]);
  B.defineSprite('enemy_stack_trace', { palette: ST_PAL, scale: 4, frames: [ST_BODY, ST_BODY_B] });

  // Ein Blatt Endlospapier (ein Stack-Frame), Laengsrichtung = x (so dreht es das Verhalten entlang des Schwanzes):
  // Lochrand oben und unten, gruene Balken quer dazu. Frame 1 = vom Trace-Puls markiert
  // (Bernstein statt Gruen) — so laeuft der Telegraph sichtbar den Stapel hinauf.
  // Zeichen: k Kontur, m Rand, h Loch, w Papier, g Balken; a/y = markierte Varianten von g/w
  const ST_FRAME_PAL = { k: '#14181a', m: '#d8dccb', h: '#5d666a', w: '#eef0e2', g: '#a6cf98',
    a: '#ffb347', y: '#ffe3a8' };
  const ST_FRAME = [
    'kkkkkkkkk',
    'khmhmhmhk',
    'kwggwggwk',
    'kwggwggwk',
    'kwggwggwk',
    'khmhmhmhk',
    'kkkkkkkkk',
  ];
  B.defineSprite('enemy_stack_trace_frame', {
    palette: ST_FRAME_PAL, scale: 4,
    frames: [ST_FRAME, ST_FRAME.map((r) => r.replace(/g/g, 'a').replace(/w/g, 'y'))],
  });

  // Stachel: Giftblase links (dort haengt das letzte Blatt), gebogene Spitze rechts (das Verhalten dreht ihn).
  // Frame 1 = scharf (Blase gluehend rot, Spitze bernsteinfarben) waehrend Einrasten und Stich.
  // Zeichen: k Kontur, b Blase, B Glanz, r Spitze; Frame 1: r Blase gluehend, y Glanz, a Spitze
  const ST_STING_PAL = { k: '#14181a', b: '#8c2a2a', B: '#e07a6a', r: '#d64545', y: '#ffd9b0', a: '#ffb347' };
  const ST_STING = [
    '..kkkk....',
    '.kbBbbk...',
    'kbBbbbbkk.',
    'kbbbbbbrrk',
    '.kbbbkkkrk',
    '..kkk..krk',
    '.......kk.',
  ];
  B.defineSprite('enemy_stack_trace_stinger', {
    palette: ST_STING_PAL, scale: 4,
    frames: [ST_STING, ST_STING.map((r) => r.replace(/r/g, 'a').replace(/b/g, 'r').replace(/B/g, 'y'))],
  });

  // ===========================================================================
  // Dependency Hell: Honeypot und Rolling Release
  // ===========================================================================
  // Familien-Optik "dephell": helle, warme Koerper (Gold, Karton) mit fast schwarzer Kontur — sie heben sich vom
  // dunklen Rostboden ab. Alles Gefaehrliche (Trichter, Telegraphen, Schuesse) ist Cyan und wird im Verhalten
  // gezeichnet (entities/enemy.js), nicht im Sprite.

  // Honeypot — goldener Honigtopf mit Holzdeckel und weissem Stern-Aufkleber ("99k stars"). Frame 0: Deckel zu.
  // Frame 1: Deckel schwebt hoch, darunter ein Maul mit Zaehnen (Sog / Zuschnappen).
  // Zeichen: k Kontur, L Deckel, l Deckel-Licht, H Honig, h Glanz, D Schatten, s Stern, m Maul, w Zaehne
  const HONEY_PAL = { k: '#1a0f08', L: '#8a5a2c', l: '#b8834a', H: '#f0b030', h: '#ffe08a', D: '#b07418', s: '#ffffff',
    m: '#4a0f1a', w: '#fff4e0' };
  const HONEY_CLOSED = [
    '..............',
    '.....kkkk.....',
    '...kklllLkk...',
    '..klLLLLLLLk..',
    '.kkkkkkkkkkkk.',
    '.kHHHHHhHHHHk.',
    'kHHhHHHsHHHHHk',
    'kHhHHsssssHHDk',
    'kHhHHHsssHHHDk',
    'kHhHHHsHsHHHDk',
    'kHHHHHHHHHHHDk',
    '.kHHHHHHHHHDk.',
    '..kDDDDDDDDk..',
    '...kkkkkkkk...',
  ];
  const HONEY_OPEN = [
    '.....kkkk.....',
    '...kklllLkk...',
    '..klLLLLLLLk..',
    '..kkkkkkkkkk..',
    '..............',
    '.kkkkkkkkkkkk.',
    'kwmwmmwmmwmwmk',
    'kHmmmmmmmmmmHk',
    'kHwmmwmmwmmwHk',
    'kHhHHsssssHHDk',
    'kHhHHHsHsHHHDk',
    '.kHHHHHHHHHDk.',
    '..kDDDDDDDDk..',
    '...kkkkkkkk...',
  ];
  B.defineSprite('enemy_honeypot', { palette: HONEY_PAL, scale: 4, frames: [HONEY_CLOSED, HONEY_OPEN] });

  // Rolling Release — Knaeuel aus Kartons mit Klebeband und einem flatternden Versions-Anhaenger (wird beim Rollen
  // gedreht). Frame 1: Anhaenger flattert auf die andere Seite.
  // Zeichen: k Kontur, c Karton hell, b Karton dunkel, y Klebeband, t Anhaenger, o Oese
  const RR_PAL = { k: '#140a04', c: '#d9a066', b: '#8a5a2c', y: '#f2d08a', t: '#f3ece6', o: '#56e3ff' };
  const RR_BALL = [
    '....kkkk....',
    '..kkcyybkk..',
    '.kcccyybbbk.',
    '.kcccykbbbk.',
    'kkkkkkkbbbbk',
    'kbbbbkcyyckk',
    'kbbbbkcyycok',
    'kbybbkkkkktt',
    '.kbybkbbcckt',
    '.kbbbkbbcck.',
    '..kkbkbbkk..',
    '....kkkk....',
  ];
  B.defineSprite('enemy_rolling_release', {
    palette: RR_PAL, scale: 4,
    frames: [RR_BALL, stampRows(RR_BALL, [[7, 10, 'k'], [7, 11, '.'], [8, 11, 'k'], [5, 11, 't'], [4, 11, 't']])],
  });
  // Ausgepackt (Breaking Change): aufgeklappter Karton, Laschen nach aussen, Verpackungschips (p) fliegen heraus.
  // Frame 1: die Chips sind ein Stueck weitergeflogen.
  const RR_OPEN_PAL = Object.assign({}, RR_PAL, { d: '#2a160c', p: '#fff1c9' });
  const RR_OPEN = [
    '.kk........kk.',
    '.kck......kck.',
    '..kck.pp.kck..',
    '...kckppkck...',
    '..kkkkkkkkkk..',
    '..kdpddpdpdk..',
    '.kkkkkkkkkkkk.',
    '.kccccccccbbk.',
    '.kcyyyyyycbbk.',
    '.kccccccccbbk.',
    '.kccccccccbbk.',
    '.kkkkkkkkkkkk.',
  ];
  const RR_OPEN_2 = RR_OPEN.slice();
  RR_OPEN_2[1] = '.kck..p...kck.';
  RR_OPEN_2[2] = '..kck.p..kck..';
  RR_OPEN_2[3] = '...kckp.kck...';
  RR_OPEN_2[5] = '..kddpdpddpk..';
  B.defineSprite('enemy_rolling_release_open', { palette: RR_OPEN_PAL, scale: 4, frames: [RR_OPEN, RR_OPEN_2] });

  // ===========================================================================
  // The Nested Infinite Loop (Boss ab Etage 8)
  // ===========================================================================
  // Die drei Ringe nutzen Kopf und Glied der Infinite Loop in drei Farben: aussen Tuerkis (wie das Original),
  // Mitte Violett, innen Koralle. Ihre Schuesse haben dieselben Farben (entities/boss.js), so sieht man sofort,
  // welcher Ring gerade feuert.
  const NEST_COLORS = [
    { c: '#3fb8c9', d: '#237a87', l: '#8fe3ee' },
    { c: '#9b7bf0', d: '#5e45b0', l: '#cdb8ff' },
    { c: '#ff6a5c', d: '#b03a30', l: '#ffb3a8' },
  ];
  NEST_COLORS.forEach((col, k) => {
    B.defineSprite('boss_nested_loop_head_' + k, { palette: Object.assign({}, LOOP_HEAD_PAL, col), scale: 4, frames: LOOP_HEAD_FRAMES });
    B.defineSprite('boss_nested_loop_segment_' + k, { palette: Object.assign({ k: K }, col), scale: 4, rows: LOOP_SEG_ROWS });
  });
  // Emblem (Intro-Karte, Inhaltsliste): drei ineinanderliegende, gegliederte Ringe mit je einem Auge (Kopf).
  // Prozedural: Ringband um Radius R, Kontur aussen/innen, Luecken zwischen den Gliedern.
  (function () {
    const N = 26, C = (N - 1) / 2;
    const RINGS = [{ R: 11, n: 14, k: 0 }, { R: 7.2, n: 9, k: 1 }, { R: 3.6, n: 5, k: 2 }];
    const rows = [];
    for (let y = 0; y < N; y++) {
      let row = '';
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - C, y - C);
        const a = Math.atan2(y - C, x - C);
        let ch = '.';
        for (const rg of RINGS) {
          const off = Math.abs(d - rg.R);
          const u = (((a + Math.PI) / (Math.PI * 2)) * rg.n) % 1;
          if (off <= 0.9 && u > 0.12) ch = ['a', 'b', 'c'][rg.k];
          else if (off <= 1.6 && u > 0.06 && ch === '.') ch = 'k';
        }
        // Auge (Kopf) oben auf jedem Ring
        for (const rg of RINGS) if (Math.abs(x - C) < 0.6 && Math.abs(y - (C - rg.R)) < 0.6) ch = 'w';
        row += ch;
      }
      rows.push(row);
    }
    B.defineSprite('boss_nested_loop', {
      palette: { k: K, a: NEST_COLORS[0].c, b: NEST_COLORS[1].c, c: NEST_COLORS[2].c, w: W },
      scale: 4,
      rows,
    });
  })();

  // ===========================================================================
  // Production: Rate Limiter und Port Scanner
  // ===========================================================================
  // Familien-Optik "production": helles Stahlgrau mit kraeftiger dunkler Kontur (der Boden ist dunkel und rot),
  // Warnstreifen, Lampen/Augen in Cyan — dieselbe Farbe wie ihre Schuesse. Kein Rot fuer Gefaehrliches.
  const PROD_PAL = {
    k: '#141416', L: '#c4ccd4', s: '#8c959f', d: '#565e68', h: '#2a2f36', r: '#0e1012', W: '#f2f5f8',
    c: '#5fe0ff', C: '#d8fbff', y: '#f2c230', b: '#26262a',
  };

  // Rate Limiter — Drehkreuz-Schrank von vorn: oben drei Lampen (= Tokens, hier alle an; verbrauchte deckt das
  // Verhalten dunkel ab), in der Mitte der dreiarmige Rotor, unten Warnstreifen und zwei Stummelfuesse.
  // Frame 0 = Rotor als "Y" (Arm oben), Frame 1 = um 60 Grad weitergeklackt (Arm unten). Das Verhalten waehlt den
  // Frame selbst (pro Schuss ein Klack). Lampen-Positionen: Spalten 2–4 / 6–8 / 10–12, Zeilen 2–3 (enemy.js).
  // Zeichen: k Kontur, L/s/d Stahl hell/mittel/dunkel, h Nabe, r Nabenmitte, W Rotorarm, c/C Lampe, y/b Streifen
  const RL_TOP = [
    '..kkkkkkkkkkk..',
    '.kLLLLLLLLLLLk.',
    '.kCccLCccLCcck.',
    '.kcccLcccLccck.',
    '.kdddddddddddk.',
  ];
  // Rotor auf dunkler Frontplatte (Spalten 3–11), eingefasst von hellem (links) und mittlerem Stahl (rechts)
  const rlFace = (mid) => '.kL' + mid + 'sk.';
  const RL_HUB = ['hhhLLLhhh', 'hhhLrLhhh', 'hhhLLLhhh'].map(rlFace);
  const RL_ARM_V = rlFace('hhhhWhhhh');   // senkrechter Arm (Mitte)
  const RL_ARM_1 = rlFace('hhWhhhWhh');   // schraege Arme, nah an der Nabe
  const RL_ARM_2 = rlFace('hWhhhhhWh');   // schraege Arme, aussen
  const RL_BOTTOM = [
    '.kybybybybybyk.',
    '.kbybybybybybk.',
    '.kkkkkkkkkkkkk.',
    '..kddk...kddk..',
    '..kkkk...kkkk..',
  ];
  const RL_FACE_Y = [RL_ARM_V, RL_ARM_V].concat(RL_HUB, [RL_ARM_1, RL_ARM_2]);
  const RL_FACE_A = [RL_ARM_2, RL_ARM_1].concat(RL_HUB, [RL_ARM_V, RL_ARM_V]);
  B.defineSprite('enemy_rate_limiter', {
    palette: PROD_PAL, scale: 4,
    frames: [RL_TOP.concat(RL_FACE_Y, RL_BOTTOM), RL_TOP.concat(RL_FACE_A, RL_BOTTOM)],
  });

  // Port Scanner — kleiner Sonden-Roboter mit Antenne (Bernstein-Spitze) und dunklem Visier, in dem ein cyanes
  // Auge hin und her scannt (Frame 0 links, Frame 1 rechts; beim Zielen schaut es zum Spieler).
  // Zeichen: k Kontur, a Antennenspitze, L/s/d Gehaeuse hell/mittel/dunkel, r Visier, c/C Auge, W Schrauben
  const PS_BODY = (eyeAt) => {
    const eye = (row) => row.slice(0, eyeAt) + 'Cc' + row.slice(eyeAt + 2);
    return [
      '.....kyk.....',
      '......k......',
      '...kkkkkkk...',
      '..kLLLLLssk..',
      '.kLLLsssssdk.',
      '.krrrrrrrrrk.',
      eye('.krrrrrrrrrk.'),
      eye('.krrrrrrrrrk.').replace('C', 'c'),
      '.kLsssssssdk.',
      '.ksWsssssWdk.',
      '.ksssssssddk.',
      '.kdddddddddk.',
      '.kkkkkkkkkkk.',
    ];
  };
  B.defineSprite('enemy_port_scanner', { palette: PROD_PAL, scale: 4, frames: [PS_BODY(3), PS_BODY(8)] });

  // Port — Netzwerkbuchse im Boden (von oben): Metallrahmen, dunkle Oeffnung mit goldenen Kontakten und der
  // typischen Nase unten, zwei Status-LEDs. Frame 0 = aus, Frame 1 = an (wird gerade gescannt).
  // Zeichen: k Kontur, L/s Rahmen hell/dunkel, r Oeffnung, g Kontakte, o/O LEDs aus, c/y LEDs an
  const PORT_ROWS = [
    '.kkkkkkkkkk.',
    'kLLLLLLLLLsk',
    'kLrrrrrrrrsk',
    'kLrgrgrgrgsk',
    'kLrrrrrrrrsk',
    'kLrrrrrrrrsk',
    'kLkrrrrrrksk',
    'kLskkrrkkssk',
    'kooLLLLLLOOk',
    '.kkkkkkkkkk.',
  ];
  B.defineSprite('enemy_port_scanner_port', {
    // Gedaempfte Farben: die Buchse ist Teil des Bodens und soll nicht wie ein Gegner aussehen
    palette: Object.assign({}, PROD_PAL, { L: '#6d747c', s: '#454b53', r: '#0b0c0e', g: '#9a7a32', o: '#26343a', O: '#3a3222' }),
    scale: 4,
    frames: [PORT_ROWS, PORT_ROWS.map((r) => r.replace(/o/g, 'c').replace(/O/g, 'y'))],
  });
})(window.BOTA);
