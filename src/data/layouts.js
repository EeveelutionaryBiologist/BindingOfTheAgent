/*
 * layouts.js — Hindernis-Layouts fuer Raeume (13 x 7 Innenkacheln).
 *
 * Zeichen:  .  Boden     r  Fels (Force Push zerstoert ihn)     b  Block (unzerstoerbar)
 *           p  Grube      s  Stacheln (verletzen den Spieler)     e  bevorzugter Gegner-Spawnpunkt
 *
 * Regeln (werden von BOTA.validateLayout geprueft):
 *  - genau 7 Zeilen mit je 13 Zeichen
 *  - die vier Tuer-Anschlusskacheln (oben Mitte, unten Mitte, links Mitte, rechts Mitte)
 *    muessen frei (keine Stacheln) und fuer Laeufer gegenseitig erreichbar sein
 * Zusaetzliche Hausregeln (geprueft in BOTA.validateLayout mit { strict: true } und im QA-Test):
 *  - JEDE Bodenkachel ist fuer Laeufer von den Tueren aus erreichbar (keine eingesperrten Gegner
 *    hinter Bloecken -> kein Softlock, randomFreePos liefert nie eine abgeschottete Kachel)
 *  - die Kachel direkt hinter jeder Tuer (nach innen) ist begehbar, und neben Tueren liegen keine
 *    Stacheln (wer hereinkommt, soll nicht sofort Schaden nehmen)
 *  - 'special'-Layouts: Mittelreihe (Layout-Zeile 3, Spalten 3–9) und der Bereich um die Mitte
 *    (Zeilen 2–4, Spalten 2–10) sind frei — dort landen Podeste, Shop-Waren, Boss & Falltuer
 *
 * tags:   'normal' (Kampfraeume), 'special' (Start/Schatz/Shop/Geheim/Boss — bleiben weitgehend offen)
 * weight: relative Haeufigkeit innerhalb des Tags
 * bias:   optionaler Spawn-Bias fuer rollRoomEnemies (Gegner-Tag -> Gewichtsfaktor),
 *         z. B. Gruben-Layouts bevorzugen Flieger, enge Layouts Fernkaempfer statt Charger
 */
'use strict';

(function (B) {
  const L = (id, tags, weight, rows, bias) => B.LAYOUTS.push({ id, tags, weight, rows, bias: bias || null });

  // ===========================================================================
  // Spezialraeume (offen; nur Ecken duerfen belegt sein)
  // ===========================================================================

  L('empty', ['normal', 'special'], 4, [
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
  ], { charge: 1.4, melee: 1.2 });

  L('special_corner_rocks', ['special'], 2, [
    'rr.........rr',
    'r...........r',
    '.............',
    '.............',
    '.............',
    'r...........r',
    'rr.........rr',
  ]);

  L('special_pillars', ['special'], 2, [
    '.............',
    '.b.........b.',
    '.............',
    '.............',
    '.............',
    '.b.........b.',
    '.............',
  ]);

  L('special_corner_pits', ['special'], 1, [
    'pp.........pp',
    'p...........p',
    '.............',
    '.............',
    '.............',
    'p...........p',
    'pp.........pp',
  ]);

  // ===========================================================================
  // Kampfraeume
  // ===========================================================================

  // --- Offene Arenen (gut fuer Charger und Nahkaempfer) ---

  L('four_rocks', ['normal'], 3, [
    '.............',
    '..r.......r..',
    '.............',
    '......e......',
    '.............',
    '..r.......r..',
    '.............',
  ]);

  L('arena_corners', ['normal'], 2, [
    'ss.........ss',
    's...........s',
    '....e...e....',
    '.............',
    '....e...e....',
    's...........s',
    'ss.........ss',
  ], { charge: 1.5, melee: 1.2 });

  L('scatter', ['normal'], 3, [
    '.............',
    '..r....b...r.',
    '.....e.......',
    '..b.......r..',
    '.......e.....',
    '.r...b....r..',
    '.............',
  ]);

  L('pillars', ['normal'], 2, [
    '.............',
    '.b..b...b..b.',
    '.............',
    '...e.....e...',
    '.............',
    '.b..b...b..b.',
    '.............',
  ]);

  // --- Felsgruppen ---

  L('center_block', ['normal'], 3, [
    '.............',
    '.e.........e.',
    '.....rrr.....',
    '.....rbr.....',
    '.....rrr.....',
    '.e.........e.',
    '.............',
  ]);

  L('rock_clusters', ['normal'], 3, [
    '.............',
    '.rr.......rr.',
    '.r..e...e..r.',
    '.............',
    '.r..e...e..r.',
    '.rr.......rr.',
    '.............',
  ]);

  L('rock_ring', ['normal'], 2, [
    '.............',
    '...rrr.rrr...',
    '..r.......r..',
    '..r...e...r..',
    '..r.......r..',
    '...rrr.rrr...',
    '.e.........e.',
  ]);

  L('bunkers', ['normal'], 2, [
    '.............',
    '.bb.......bb.',
    '.b..e...e..b.',
    '.............',
    '.b..e...e..b.',
    '.bb.......bb.',
    '.............',
  ], { ranged: 1.2 });

  L('rocks_and_spikes', ['normal'], 2, [
    '.............',
    '..rs.....sr..',
    '..r...e...r..',
    '.............',
    '..r...e...r..',
    '..rs.....sr..',
    '.............',
  ]);

  // --- Gruben (Flieger im Vorteil) ---

  L('pit_lanes', ['normal'], 2, [
    '.............',
    '.ppp.....ppp.',
    '.............',
    '...e.....e...',
    '.............',
    '.ppp.....ppp.',
    '.............',
  ], { fly: 1.4 });

  L('pit_cross', ['normal'], 2, [
    '.............',
    '.....p.p.....',
    '.e...p.p...e.',
    '..pppp.pppp..',
    '.e...p.p...e.',
    '.....p.p.....',
    '.............',
  ], { fly: 1.6, charge: 0.6 });

  L('pit_moat', ['normal'], 2, [
    '.............',
    '.e.........e.',
    '..ppp...ppp..',
    '..ppp.e.ppp..',
    '..ppp...ppp..',
    '.e.........e.',
    '.............',
  ], { fly: 1.5 });

  L('big_pit', ['normal'], 2, [
    '.............',
    '.e.........e.',
    '....ppppp....',
    '....ppppp....',
    '....ppppp....',
    '.e.........e.',
    '.............',
  ], { fly: 1.8, melee: 0.8 });

  L('pit_island', ['normal'], 2, [
    '.............',
    '.e.ppp.ppp.e.',
    '...p.....p...',
    '...p..e..p...',
    '...p.....p...',
    '.e.ppp.ppp.e.',
    '.............',
  ], { fly: 1.4 });

  L('snake_pits', ['normal'], 1, [
    '.............',
    '.ppppp.......',
    '.......ppppp.',
    '..pppp....e..',
    '..e....ppppp.',
    '.ppppp.......',
    '.............',
  ], { fly: 1.6, charge: 0.5 });

  L('corner_pits', ['normal'], 2, [
    'pp.........pp',
    'p...........p',
    '...e.....e...',
    '.............',
    '...e.....e...',
    'p...........p',
    'pp.........pp',
  ]);

  // --- Stacheln ---

  L('spike_strips', ['normal'], 2, [
    '.............',
    '.e....e....e.',
    '.............',
    '..sss...sss..',
    '.............',
    '.e....e....e.',
    '.............',
  ]);

  L('spike_cross', ['normal'], 1, [
    '.............',
    '..e.......e..',
    '......s......',
    '....sssss....',
    '......s......',
    '..e.......e..',
    '.............',
  ]);

  L('spike_lanes', ['normal'], 1, [
    '.............',
    '.ssss...ssss.',
    '.....e.e.....',
    '.............',
    '.....e.e.....',
    '.ssss...ssss.',
    '.............',
  ], { ranged: 1.3 });

  // --- Labyrinthe & Korridore (Fernkaempfer im Vorteil, Charger im Nachteil) ---

  L('block_maze', ['normal'], 2, [
    '.............',
    '.bbb.b.b.bbb.',
    '...b.....b...',
    '.e.b..e..b.e.',
    '...b.....b...',
    '.bbb.b.b.bbb.',
    '.............',
  ], { ranged: 1.4, charge: 0.5 });

  L('plus_corridors', ['normal'], 2, [
    'bbbb.....bbbb',
    'bbbb.....bbbb',
    '.e.........e.',
    '.............',
    '.e.........e.',
    'bbbb.....bbbb',
    'bbbb.....bbbb',
  ], { ranged: 1.3, turret: 1.4 });

  L('twin_walls', ['normal'], 2, [
    '.............',
    '...r.....r...',
    '...r..e..r...',
    '...r.....r...',
    '...r..e..r...',
    '...r.....r...',
    '.e.........e.',
  ], { ranged: 1.2 });

  L('rock_bands', ['normal'], 2, [
    '.............',
    '.e....e....e.',
    'rrrr.r.r.rrrr',
    '.............',
    'rrrr.r.r.rrrr',
    '.e....e....e.',
    '.............',
  ], { ranged: 1.3, charge: 0.7 });

  L('checker', ['normal'], 2, [
    '.............',
    '..r.r...r.r..',
    '.e.r.....r.e.',
    '.............',
    '.e.r.....r.e.',
    '..r.r...r.r..',
    '.............',
  ]);

  L('zigzag_blocks', ['normal'], 1, [
    '.............',
    '.bb...e..bb..',
    '...bb....b...',
    '.....b.......',
    '...b....bb...',
    '..bb..e...bb.',
    '.............',
  ], { ranged: 1.2, charge: 0.6 });

  L('vault', ['normal'], 1, [
    '.............',
    '.e.rr...rr.e.',
    '...r.....r...',
    '.....rbr.....',
    '...r.....r...',
    '.e.rr...rr.e.',
    '.............',
  ]);

  // ===========================================================================
  // Validierung
  // ===========================================================================

  const DOOR_TILES = [[6, 0], [6, 6], [0, 3], [12, 3]];   // Layout-Koordinaten der Tuer-Anschluesse
  const DOOR_INNER = [[6, 1], [6, 5], [1, 3], [11, 3]];   // jeweils eine Kachel weiter nach innen

  /**
   * Prueft ein Layout auf Format und Erreichbarkeit (Flood-Fill fuer Laeufer).
   * Gibt { ok: boolean, error?: string } zurueck.
   * opts.strict = true prueft zusaetzlich die Hausregeln (siehe Kopfkommentar).
   */
  B.validateLayout = function (layout, opts) {
    const rows = layout && layout.rows;
    if (!Array.isArray(rows) || rows.length !== 7) return { ok: false, error: 'needs 7 rows' };
    for (const r of rows) {
      if (typeof r !== 'string' || r.length !== 13) return { ok: false, error: 'each row needs 13 chars' };
      if (/[^.rbpse]/.test(r)) return { ok: false, error: 'invalid char in ' + r };
    }
    const walk = (c, r) => c >= 0 && r >= 0 && c < 13 && r < 7 && '.e'.includes(rows[r][c]);
    // Tuer-Anschlusskacheln: oben, unten, links, rechts (muessen frei und gegenseitig erreichbar sein)
    for (const [c, r] of DOOR_TILES) if (!walk(c, r)) return { ok: false, error: 'door tile blocked at ' + c + ',' + r };
    // Flood-Fill ab der oberen Tuer-Kachel
    const seen = new Set(['6,0']);
    const queue = [[6, 0]];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (!seen.has(k) && walk(nc, nr)) { seen.add(k); queue.push([nc, nr]); }
      }
    }
    for (const [c, r] of DOOR_TILES) if (!seen.has(c + ',' + r)) return { ok: false, error: 'unreachable ' + c + ',' + r };

    if (opts && opts.strict) {
      // 1) jede Bodenkachel erreichbar
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 13; c++) {
          if (walk(c, r) && !seen.has(c + ',' + r)) return { ok: false, error: 'isolated floor tile at ' + c + ',' + r };
        }
      }
      // 2) Kachel hinter der Tuer begehbar, keine Stacheln direkt neben einer Tuer
      for (const [c, r] of DOOR_INNER) if (!walk(c, r)) return { ok: false, error: 'tile behind door blocked at ' + c + ',' + r };
      for (const [c, r] of DOOR_TILES) {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc >= 0 && nr >= 0 && nc < 13 && nr < 7 && rows[nr][nc] === 's') return { ok: false, error: 'spikes next to door at ' + nc + ',' + nr };
        }
      }
      // 3) Spezialraeume: Mitte frei (Podeste, Shop, Boss, Falltuer)
      if (layout.tags && layout.tags.includes('special')) {
        for (let r = 2; r <= 4; r++) {
          for (let c = 2; c <= 10; c++) if (!walk(c, r)) return { ok: false, error: 'special layout centre blocked at ' + c + ',' + r };
        }
      }
    }
    return { ok: true };
  };

  /**
   * Zerstoerbare Objekte (Kacheltyp PROP). Welche Arten auf welcher Etage vorkommen, steht im Etagen-Thema
   * (palette.js: props). Platziert werden sie in Floor.assignProps, kaputt gehen sie in game.hitProp /
   * game.breakProp (Spielerschuesse, Explosionen). hp wird mit der Tiefe leicht skaliert (+10 % pro Etage).
   *   name   Anzeigename (Doku)   hp   Treffer-Punkte (Spielerschaden 3.5 -> ~2–3 Schuesse)
   *   color  Truemmer-/Partikelfarbe   sprite = 'prop_<id>' (sprites-core.js)
   */
  B.PROP_KINDS = {
    crate:   { name: 'Dusty crate', hp: 8, color: '#a07a4a' },
    bush:    { name: 'Bush', hp: 6, color: '#5f8f3a' },
    package: { name: 'Package', hp: 8, color: '#c49a5c' },
    carton:  { name: 'Overflowing carton', hp: 7, color: '#d6c7a6' },
  };
  B.PROP_LOOT_CHANCE = 0.1; // Chance auf einen Zufalls-Pickup beim Zerbrechen
})(window.BOTA);
