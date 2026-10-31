/*
 * hud.js — HUD-Leiste (oben), Minimap, Pickup-Banner, Boss-HP-Balken, "R halten"-Ring
 * und die Pixel-Schrift BOTA.pixelText (wird auch von screens.js genutzt).
 *
 * Sprites: hud_heart_full/half/empty, hud_guardrail_full/half (sprites-core.js).
 * Ressourcen-Icons: bevorzugt Agent As pickup_credit / pickup_push / pickup_approval (Konsistenz mit der Welt),
 * sonst die eigenen hud_credit / hud_push / hud_approval.
 *
 * Alle Animationen hier sind reine Darstellung; Zustand (Aenderungs-Zeitpunkte etc.) liegt in diesem Modul,
 * nie in game/player. Zeitbasis ist performance.now().
 */
'use strict';

(function (B) {
  const { W, HUD_H, ROOM_W, ROOM_H } = B.C;
  const now = () => performance.now() / 1000;

  // ===========================================================================
  // Pixel-Schrift (5x7, Grossbuchstaben, proportional)
  // ===========================================================================

  // Glyphen als Zeilen ('#' = Pixel). Breite = Zeilenlaenge. Kleinbuchstaben werden auf Grossbuchstaben abgebildet.
  const GLYPH_SRC = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '####.|....#|....#|.###.|....#|....#|####.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|....#|.###.',
    ' ': '...|...|...|...|...|...|...', '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|#.',
    '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', "'": '#|#|.|.|.|.|.',
    '"': '#.#|#.#|...|...|...|...|...', '-': '...|...|...|###|...|...|...', ':': '.|#|.|.|.|#|.',
    ';': '..|.#|..|..|..|.#|#.', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
    '\\': '#....|.#...|.#...|..#..|...#.|...#.|....#', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.',
    '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '=': '....|....|####|....|####|....|....', '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
    '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
    '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', '_': '.....|.....|.....|.....|.....|.....|#####',
    '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....', '|': '#|#|#|#|#|#|#', '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
    '~': '.....|.....|.#..#|#.##.|.....|.....|.....', '¢': '..#..|.###.|#.#..|#.#..|#.#..|.###.|..#..',
    '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..', '✓': '.....|....#|...##|#.##.|###..|.#...|.....',
    '♥': '.....|##.##|#####|#####|.###.|..#..|.....', '·': '.|.|.|#|.|.|.', '—': '.....|.....|.....|#####|.....|.....|.....',
    '½': '#....|#..#.|#.#..|..#..|.#.##|#...#|...##', '…': '.....|.....|.....|.....|.....|.....|#.#.#',
  };
  const GLYPHS = {};
  for (const k in GLYPH_SRC) {
    const rows = GLYPH_SRC[k].split('|');
    GLYPHS[k] = { w: rows[0].length, rows };
  }

  /** Breite eines Strings in logischen Pixeln bei Pixelgroesse s */
  function pixelWidth(str, s) {
    let w = 0;
    const text = String(str).toUpperCase();
    for (let i = 0; i < text.length; i++) {
      const gl = GLYPHS[text[i]] || GLYPHS['?'];
      w += (gl.w + 1) * s;
    }
    return Math.max(0, w - s);
  }

  // Cache gerenderter Strings (Offscreen-Canvas in logischer Aufloesung; Zeichnen mit Nearest-Neighbor
  // wie die Sprites). Begrenzte Groesse, damit wechselnde Texte (Timer) den Speicher nicht fuellen.
  const textCache = new Map();
  const CACHE_MAX = 300;

  function renderPixelText(str, s, color, shadow, outline) {
    const key = str + '\u0001' + s + '\u0001' + color + '\u0001' + shadow + '\u0001' + outline;
    let cv = textCache.get(key);
    if (cv) return cv;
    const text = String(str).toUpperCase();
    const pad = (outline ? 1 : 0) + (shadow ? s : 0);
    const w = pixelWidth(text, s) + pad * 2 + 2, h = 7 * s + pad * 2 + 2;
    cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w));
    cv.height = Math.max(1, Math.ceil(h));
    const g = cv.getContext('2d');
    // Laeufe zusammenhaengender Pixel als ein Rechteck zeichnen (weniger fillRect-Aufrufe)
    const pass = (dx, dy, col, grow) => {
      g.fillStyle = col;
      let x = pad + 1;
      for (let i = 0; i < text.length; i++) {
        const gl = GLYPHS[text[i]] || GLYPHS['?'];
        for (let r = 0; r < 7; r++) {
          const row = gl.rows[r];
          let c = 0;
          while (c < row.length) {
            if (row[c] !== '#') { c++; continue; }
            let e = c;
            while (e < row.length && row[e] === '#') e++;
            g.fillRect(x + c * s + dx - grow, pad + 1 + r * s + dy - grow, (e - c) * s + grow * 2, s + grow * 2);
            c = e;
          }
        }
        x += (gl.w + 1) * s;
      }
    };
    if (shadow) pass(s, s, shadow, outline ? 1 : 0);
    if (outline) pass(0, 0, outline, 1);
    pass(0, 0, color, 0);
    if (textCache.size > CACHE_MAX) textCache.clear();
    textCache.set(key, cv);
    return cv;
  }

  /**
   * Pixel-Schrift zeichnen.
   * opts: { scale (Pixelgroesse, Default 3), color, align ('left'|'center'|'right'), shadow (Farbe|false),
   *         outline (Farbe|false), alpha, baseline ('top'|'middle') }
   * Gibt die Breite in logischen Pixeln zurueck.
   */
  B.pixelText = function (ctx, str, x, y, opts) {
    const o = opts || {};
    const s = o.scale || 3;
    const shadow = o.shadow === undefined ? 'rgba(0,0,0,0.6)' : o.shadow;
    const cv = renderPixelText(String(str), s, o.color || B.COLORS.text, shadow || '', o.outline || '');
    const pad = (o.outline ? 1 : 0) + (shadow ? s : 0) + 1;
    const tw = pixelWidth(String(str), s);
    let dx = x - pad;
    if (o.align === 'center') dx -= tw / 2;
    else if (o.align === 'right') dx -= tw;
    let dy = y - pad;
    if (o.baseline === 'middle') dy -= (7 * s) / 2;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, Math.round(dx), Math.round(dy));
    ctx.restore();
    return tw;
  };
  B.pixelTextWidth = pixelWidth;

  // ===========================================================================
  // Kleine Zeichen-Helfer
  // ===========================================================================

  /** Abgerundetes Rechteck als Pfad */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Zeichnet ein Sprite in eine Box der Groesse maxSize, mit ganzzahliger Kunstpixel-Groesse (bleibt knackig).
   * Gibt false zurueck, wenn das Sprite nicht existiert.
   */
  function drawIcon(ctx, name, x, y, maxSize, opts) {
    if (!name || !B.hasSprite(name)) return false;
    const def = B._spriteDefs[name];
    const size = B.spriteSize(name);
    const ds = (def && def.scale) || 4;
    const artW = size.w / ds, artH = size.h / ds;
    const px = Math.max(1, Math.floor(maxSize / Math.max(artW, artH)));
    B.drawSprite(ctx, name, x, y, Object.assign({}, opts, { scale: px / ds }));
    return true;
  }

  /** Herzform (Fallback, falls kein Sprite). fill: 'full' | 'half' | 'empty' */
  function drawHeart(ctx, x, y, s, fill, color) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
      ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
      ctx.closePath();
    };
    ctx.save();
    path();
    ctx.fillStyle = '#2a1d1d';
    ctx.fill();
    if (fill !== 'empty') {
      ctx.save();
      path();
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x - s / 2, y, fill === 'half' ? s / 2 : s, s);
      ctx.restore();
    }
    path();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }

  // ===========================================================================
  // HUD-Zustand (nur Darstellung): Aenderungen erkennen -> kurz hervorheben
  // ===========================================================================
  const fx = {
    player: null,        // Spieler-Objekt, fuer das die Werte gelten (neuer Run -> Reset)
    prev: {},            // letzte Werte (credits, pushes, approvals, health, ...)
    changedAt: {},       // Zeitpunkt der letzten Aenderung je Wert
    statDir: {},         // +1 / -1: Richtung der letzten Stat-Aenderung
    hurtAt: -9, chargedAt: -9, usedAt: -9,
    bossLag: new WeakMap(), // Boss -> nachlaufender HP-Anteil
  };
  const TRACK = ['credits', 'pushes', 'approvals', 'health', 'guardrails', 'maxHealth'];
  const STATS = ['damage', 'fireDelay', 'speed', 'range', 'shotSpeed', 'luck'];

  function trackChanges(p) {
    const t = now();
    if (fx.player !== p) {
      fx.player = p;
      fx.prev = {};
      fx.changedAt = {};
      fx.statDir = {};
      for (const k of TRACK) fx.prev[k] = p[k];
      for (const k of STATS) fx.prev['s_' + k] = p.stats[k];
      return;
    }
    for (const k of TRACK) {
      if (fx.prev[k] !== p[k]) { fx.changedAt[k] = t; fx.prev[k] = p[k]; }
    }
    for (const k of STATS) {
      const v = p.stats[k], old = fx.prev['s_' + k];
      if (Math.abs(v - old) > 1e-6) {
        fx.changedAt['s_' + k] = t;
        // fireDelay: kleiner ist besser
        fx.statDir[k] = (k === 'fireDelay' ? old - v : v - old) > 0 ? 1 : -1;
        fx.prev['s_' + k] = v;
      }
    }
  }
  const since = (k) => now() - (fx.changedAt[k] === undefined ? -99 : fx.changedAt[k]);

  B.bus.on('playerHurt', () => { fx.hurtAt = now(); });
  B.bus.on('activeCharged', () => { fx.chargedAt = now(); });
  B.bus.on('activeUsed', () => { fx.usedAt = now(); });

  // ===========================================================================
  // HUD-Teile
  // ===========================================================================

  function drawHearts(ctx, p, x0, y0) {
    const gap = 21, perRow = 6;
    const t = now();
    const hurtK = Math.max(0, 1 - (t - fx.hurtAt) / 0.35);
    const lowHp = p.health <= 2 && p.guardrails <= 0;
    let i = 0;
    let lastFilled = -1;
    const slots = [];
    for (let h = 0; h < p.maxHealth; h += 2) {
      const v = p.health - h;
      const fill = v >= 2 ? 'full' : v === 1 ? 'half' : 'empty';
      if (fill !== 'empty') lastFilled = slots.length;
      slots.push(['heart', fill]);
    }
    for (let gq = 0; gq < p.guardrails; gq += 2) slots.push(['guardrail', p.guardrails - gq >= 2 ? 'full' : 'half']);
    for (const [kind, fill] of slots) {
      let x = x0 + (i % perRow) * gap + 9, y = y0 + Math.floor(i / perRow) * 22 + 8;
      // Zittern nach Treffer
      if (hurtK > 0) { x += (Math.random() - 0.5) * 4 * hurtK; y += (Math.random() - 0.5) * 4 * hurtK; }
      let sc = 1;
      // Pulsieren bei wenig Leben (letztes gefuelltes Herz)
      if (lowHp && i === lastFilled) sc = 1 + 0.18 * Math.max(0, Math.sin(t * 9));
      const spriteName = 'hud_' + kind + '_' + fill;
      if (B.hasSprite(spriteName)) B.drawSprite(ctx, spriteName, x, y, { scale: sc, flash: hurtK > 0.6 && kind === 'heart' });
      else drawHeart(ctx, x, y - 9, 18, fill, kind === 'guardrail' ? B.COLORS.guardrail : B.COLORS.heart);
      i++;
    }
  }

  /** Zaehler mit Icon; Zahl springt kurz hoch und leuchtet, wenn sie sich aendert */
  function drawCounter(ctx, x, y, key, icons, color, value) {
    const k = Math.max(0, 1 - since(key) / 0.5);
    let drawn = false;
    for (const name of icons) if (drawIcon(ctx, name, x + 8, y + 8, 18)) { drawn = true; break; }
    if (!drawn) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + 8, y + 8, 7, 0, Math.PI * 2); ctx.fill();
    }
    const col = k > 0 ? color : B.COLORS.text;
    B.pixelText(ctx, String(value).padStart(2, '0'), x + 22, y + 1 - k * 3, { scale: 2, color: col, shadow: 'rgba(0,0,0,0.7)' });
  }

  function drawActive(ctx, p, x, y) {
    const t = now();
    const size = 52;
    // Rahmen
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    rr(ctx, x, y, size, size, 6); ctx.fill();
    ctx.strokeStyle = '#3a312b'; ctx.lineWidth = 2;
    rr(ctx, x, y, size, size, 6); ctx.stroke();
    if (!p.active) {
      B.pixelText(ctx, 'SPACE', x + size / 2, y + size / 2, { scale: 1, align: 'center', baseline: 'middle', color: B.COLORS.textFaint, shadow: false });
      return;
    }
    const def = B.ITEMS[p.active.id];
    if (!def) return;
    const max = Math.max(1, def.maxCharge || 1);
    const charge = Math.min(max, p.active.charge);
    const full = charge >= max;
    // Voll geladen: pulsierender Schein hinter dem Icon
    if (full) {
      const a = 0.18 + 0.12 * Math.sin(t * 6);
      ctx.fillStyle = 'rgba(246,211,101,' + a + ')';
      rr(ctx, x + 2, y + 2, size - 4, size - 4, 5); ctx.fill();
    }
    const usedK = Math.max(0, 1 - (t - fx.usedAt) / 0.3);
    if (!drawIcon(ctx, def.sprite, x + size / 2, y + size / 2, 44, { flash: usedK > 0.5 })) {
      B.drawSprite(ctx, def.sprite, x + size / 2, y + size / 2, { scale: 0.7 });
    }
    // Segmentierter Ladebalken rechts neben der Box
    const bx = x + size + 4, bw = 10, bh = size;
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(bx - 1, y - 1, bw + 2, bh + 2);
    const segH = bh / max;
    for (let i = 0; i < max; i++) {
      const sy = y + bh - (i + 1) * segH;
      const on = i < charge;
      ctx.fillStyle = on ? (full ? '#f6d365' : '#8bc34a') : '#2a2420';
      ctx.fillRect(bx, sy + 1, bw, segH - 2);
      if (on) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, sy + 1, 3, segH - 2); }
    }
    // Aufblitzen, sobald voll geladen
    const chK = Math.max(0, 1 - (t - fx.chargedAt) / 0.6);
    if (chK > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + chK * 0.8 + ')';
      ctx.fillRect(bx, y, bw, bh);
      rr(ctx, x, y, size, size, 6);
      ctx.strokeStyle = 'rgba(255,240,180,' + chK + ')'; ctx.lineWidth = 3; ctx.stroke();
    }
  }

  /** Kompakte Stat-Anzeige mit gruenem/rotem Pfeil nach Aenderungen */
  function drawStats(ctx, p, x, y, glitched) {
    const s = p.stats;
    const rows = [
      ['DMG', 'damage', s.damage.toFixed(2)],
      ['RATE', 'fireDelay', (1 / s.fireDelay).toFixed(2)],
      ['SPD', 'speed', s.speed.toFixed(2)],
      ['RANGE', 'range', String(Math.round(s.range))],
      ['SHOT', 'shotSpeed', s.shotSpeed.toFixed(2)],
      ['LUCK', 'luck', String(Math.round(s.luck))],
    ];
    rows.forEach(([label, key, val], i) => {
      const cx = x + Math.floor(i / 3) * 104, cy = y + (i % 3) * 17;
      const ch = since('s_' + key);
      const hi = ch < 2.5;
      const dir = fx.statDir[key] || 0;
      B.text(ctx, label, cx, cy, { size: 12, color: B.COLORS.textFaint, shadow: false });
      if (glitched) {
        // Stoerung: Werte (und manchmal die Bezeichnung) werden zu Zeichensalat
        B.text(ctx, scramble(val, i + 1), cx + 44, cy, { size: 12, color: i % 2 ? '#e080d8' : '#7fe0e8', shadow: false });
        return;
      }
      B.text(ctx, val, cx + 44, cy, { size: 12, color: hi ? (dir > 0 ? '#9be37f' : '#ff7b6b') : B.COLORS.textDim, shadow: false });
      if (hi) B.text(ctx, dir > 0 ? '▲' : '▼', cx + 86, cy, { size: 10, color: dir > 0 ? '#9be37f' : '#ff7b6b', shadow: false, alpha: Math.min(1, (2.5 - ch) * 2) });
    });
  }

  function drawFloorLabel(ctx, game) {
    const info = B.floorInfo(game.depth);
    const theme = B.themeFor(game.depth);
    B.pixelText(ctx, 'FLOOR ' + game.depth, W - 14, 9, { scale: 1, align: 'right', color: B.COLORS.textDim, shadow: false });
    const name = info.name.toUpperCase();
    const sc = B.pixelTextWidth(name, 2) > 300 ? 1 : 2;
    B.pixelText(ctx, name, W - 14, 22, { scale: sc, align: 'right', color: theme.accent, shadow: 'rgba(0,0,0,0.7)' });
    const tsec = Math.floor((game.runStats && game.runStats.time) || 0);
    const clock = String(Math.floor(tsec / 60)).padStart(2, '0') + ':' + String(tsec % 60).padStart(2, '0');
    B.text(ctx, clock, W - 14, 42, { size: 12, align: 'right', color: B.COLORS.textFaint, shadow: false });
    if (B.audio && B.audio.muted) B.drawSprite(ctx, 'hud_muted', W - 70, 49);
  }

  /** Minimap: Fenster von 7x5 Zellen um den aktuellen Raum, oben rechts ueber dem Raum */
  function drawMinimap(ctx, game, glitched) {
    const floor = game.floor;
    if (!floor || !game.room) return;
    const cw = 22, ch = 15, gap = 5, winW = 7, winH = 5;
    const pw = winW * (cw + gap) + gap, ph = winH * (ch + gap) + gap;
    const bx = W - pw - 12, by = HUD_H + 12;
    const cur = game.room.cell;
    const reveal = B.debug && B.debug.revealMap;
    // Halbtransparent, wenn der Spieler darunter steht
    const p = game.player;
    const under = p && p.x > bx - 30 && p.y < by - HUD_H + ph + 30;
    ctx.save();
    ctx.globalAlpha = under ? 0.35 : 0.92;
    ctx.fillStyle = 'rgba(8,6,5,0.6)';
    rr(ctx, bx, by, pw, ph, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    rr(ctx, bx, by, pw, ph, 6); ctx.stroke();
    // Clip auf das Fenster
    ctx.beginPath(); ctx.rect(bx + 2, by + 2, pw - 4, ph - 4); ctx.clip();

    const pos = (cell) => {
      const gx = cell.x - cur.x + Math.floor(winW / 2), gy = cell.y - cur.y + Math.floor(winH / 2);
      return { gx, gy, x: bx + gap + gx * (cw + gap), y: by + gap + gy * (ch + gap) };
    };
    const visible = (room) => room.seen || reveal;

    // Verbindungen (Tueren) zwischen sichtbaren Raeumen
    ctx.fillStyle = 'rgba(160,150,140,0.45)';
    for (const cell of floor.cells.values()) {
      const room = cell.room;
      if (!visible(room) || !(room.visited || reveal)) continue;
      const a = pos(cell);
      for (const dir of ['right', 'down', 'left', 'up']) {
        const door = room.doors[dir];
        if (!door || (door.edge.hidden && !reveal)) continue;
        if (!visible(door.target.room)) continue;
        if (dir === 'right') ctx.fillRect(a.x + cw, a.y + ch / 2 - 2, gap, 4);
        if (dir === 'left') ctx.fillRect(a.x - gap, a.y + ch / 2 - 2, gap, 4);
        if (dir === 'down') ctx.fillRect(a.x + cw / 2 - 2, a.y + ch, 4, gap);
        if (dir === 'up') ctx.fillRect(a.x + cw / 2 - 2, a.y - gap, 4, gap);
      }
    }

    const t = now();
    for (const cell of floor.cells.values()) {
      const room = cell.room;
      if (!visible(room)) continue;
      const q = pos(cell);
      if (q.gx < -1 || q.gy < -1 || q.gx > winW || q.gy > winH) continue;
      const isCur = cell === cur;
      if (isCur) {
        ctx.fillStyle = '#f3ece6';
        ctx.fillRect(q.x, q.y, cw, ch);
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.strokeStyle = 'rgba(217,119,87,' + (0.5 + 0.5 * pulse) + ')';
        ctx.lineWidth = 2;
        ctx.strokeRect(q.x - 2, q.y - 2, cw + 4, ch + 4);
      } else if (room.visited) {
        ctx.fillStyle = '#7d746d';
        ctx.fillRect(q.x, q.y, cw, ch);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(q.x, q.y, cw, 2);
      } else {
        // gesehen, aber nicht besucht: nur Umriss
        ctx.fillStyle = 'rgba(40,34,30,0.9)';
        ctx.fillRect(q.x, q.y, cw, ch);
        ctx.strokeStyle = '#6a615a';
        ctx.lineWidth = 2;
        ctx.strokeRect(q.x + 1, q.y + 1, cw - 2, ch - 2);
      }
      const icon = { boss: 'map_boss', treasure: 'map_treasure', shop: 'map_shop', secret: 'map_secret' }[cell.type];
      if (icon) {
        if (B.hasSprite(icon)) B.drawSprite(ctx, icon, q.x + cw / 2, q.y + ch / 2 + 1, { alpha: isCur ? 0.85 : 1 });
        else { ctx.fillStyle = '#fff'; ctx.fillRect(q.x + cw / 2 - 3, q.y + ch / 2 - 3, 6, 6); }
      }
    }
    if (glitched) drawStatic(ctx, bx, by, pw, ph, 3); // Stoerung: Karte unter Rauschen (Transparenz bleibt)
    ctx.restore();
  }

  /** Item-/Hinweis-Banner im BoI-Stil: grosser Name, kleine Tagline; gleitet herein und blendet aus */
  function drawBanner(ctx, game) {
    const b = game.bannerState;
    if (!b) return;
    const total = 2.5;
    const age = total - b.t;
    const inK = Math.min(1, age / 0.25);
    const ease = 1 - Math.pow(1 - inK, 3);
    const alpha = Math.min(1, b.t / 0.45);
    const y = HUD_H + 54;
    const title = String(b.title || '').toUpperCase();
    let sc = 4;
    while (sc > 2 && B.pixelTextWidth(title, sc) > 820) sc--;
    const bandH = b.sub ? 92 : 62;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Band mit eingekerbten Enden (Banderole)
    const bw = Math.min(W - 40, Math.max(420, B.pixelTextWidth(title, sc) + 120)) * (0.6 + 0.4 * ease);
    const x0 = W / 2 - bw / 2, x1 = W / 2 + bw / 2;
    ctx.fillStyle = 'rgba(12,9,8,0.82)';
    ctx.beginPath();
    ctx.moveTo(x0 - 24, y); ctx.lineTo(x1 + 24, y); ctx.lineTo(x1 + 8, y + bandH / 2); ctx.lineTo(x1 + 24, y + bandH);
    ctx.lineTo(x0 - 24, y + bandH); ctx.lineTo(x0 - 8, y + bandH / 2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = B.COLORS.claude;
    ctx.fillRect(x0, y + 4, bw, 2);
    ctx.fillRect(x0, y + bandH - 6, bw, 2);
    // Titel gleitet von links herein, Untertitel von rechts
    const slide = (1 - ease) * 60;
    B.pixelText(ctx, title, W / 2 - slide, y + 14, { scale: sc, align: 'center', color: '#fff6ee', shadow: '#7a3a24' });
    if (b.sub) {
      ctx.globalAlpha = alpha * Math.min(1, Math.max(0, (age - 0.12) / 0.25));
      B.text(ctx, b.sub, W / 2 + slide, y + 14 + 7 * sc + 12, { size: 17, align: 'center', color: '#d8cdc4', maxWidth: bw + 20, bold: false });
    }
    ctx.restore();
  }

  function drawBossBar(ctx, game) {
    const boss = game.room && game.room.enemies.find((e) => e.isBoss && !e.dead);
    if (!boss) return;
    if (game.state === 'bossIntro') return;
    const w = 460, x = W / 2 - w / 2, y = HUD_H + ROOM_H - 46;
    const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    // Nachlaufender Balken ("Schaden sichtbar machen")
    let lag = fx.bossLag.get(boss);
    if (!lag) { lag = { v: ratio, hold: 0, t: now() }; fx.bossLag.set(boss, lag); }
    const t = now(), dt = Math.min(0.05, t - lag.t);
    lag.t = t;
    if (ratio < lag.v) {
      if (lag.hold <= 0 && lag.last !== ratio) lag.hold = 0.35;
      lag.hold -= dt;
      if (lag.hold <= 0) lag.v = Math.max(ratio, lag.v - dt * 0.6);
    } else lag.v = ratio;
    lag.last = ratio;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    rr(ctx, x - 34, y - 6, w + 42, 26, 5); ctx.fill();
    if (B.hasSprite('map_boss')) B.drawSprite(ctx, 'map_boss', x - 18, y + 7, { scale: 1.5 });
    ctx.fillStyle = '#2a0f0f';
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = 'rgba(255,240,220,0.75)';
    ctx.fillRect(x, y, w * lag.v, 14);
    const grd = ctx.createLinearGradient(0, y, 0, y + 14);
    grd.addColorStop(0, '#ff6b5b');
    grd.addColorStop(1, '#a8202a');
    ctx.fillStyle = boss.flash > 0 ? '#ffffff' : grd;
    ctx.fillRect(x, y, w * ratio, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + (w * i) / 10 - 1, y, 2, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w * ratio, 3);
    ctx.restore();
    B.pixelText(ctx, (boss.def.name || 'BOSS').toUpperCase(), W / 2, y - 22, { scale: 2, align: 'center', color: '#ffd7cf', shadow: 'rgba(0,0,0,0.8)' });
  }

  /** "R gedrueckt halten"-Fortschrittsring (auch vom Pause-Screen genutzt) */
  function drawRestartRing(ctx, game, cx, cy) {
    const k = Math.min(1, (game.restartHold || 0) / 1);
    if (k <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    rr(ctx, cx - 140, cy - 26, 280, 52, 8); ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx - 106, cy, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = B.COLORS.claude;
    ctx.beginPath(); ctx.arc(cx - 106, cy, 15, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    B.pixelText(ctx, 'R', cx - 106, cy, { scale: 2, align: 'center', baseline: 'middle', color: '#fff', shadow: false });
    B.pixelText(ctx, 'RESTARTING...', cx + 18, cy - 7, { scale: 2, align: 'center', color: B.COLORS.text });
    B.text(ctx, 'keep holding. no take-backs.', cx + 18, cy + 10, { size: 11, align: 'center', color: B.COLORS.textDim, shadow: false });
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // HUD-Stoerung (Graphics Glitch, siehe game.glitchHud). Reine Optik: Das Rauschen nutzt einen eigenen
  // kleinen Pseudo-Zufall, der sich ~12x pro Sekunde aendert (wirkt wie kaputtes Bildsignal und
  // flimmert nicht im Frame-Takt). Gegen Ende flackert die Stoerung, damit man das Ende kommen sieht.
  // ---------------------------------------------------------------------------
  const GLITCH_COLORS = ['#e040c0', '#40d8e0', '#5fe05f', '#f2c14e', '#ffffff', '#2a2838'];
  const GLITCH_CHARS = '#%&?@$!<>/\\|*=+~^0123456789';

  /** Kleiner deterministischer Zufall fuer das Rauschen (aendert sich pro Zeitscheibe) */
  function glitchRand(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Aktive Stoerung fuer einen Bereich — oder null. Kurz vor dem Ende im Wechsel an/aus. */
  function glitchFor(game, kind) {
    const g = game.hudGlitch;
    if (!g || g.kind !== kind || !(g.t > 0)) return null;
    if (g.t < 1 && Math.floor(now() * 10) % 2) return null; // Ausklingen: flackern
    return g;
  }

  /** Rauschkasten ueber einem HUD-Bereich: dunkler Grund, bunte Pixelbloecke, horizontale Risse */
  function drawStatic(ctx, x, y, w, h, salt) {
    const rand = glitchRand(Math.floor(now() * 12) * 31 + (salt || 0));
    const base = ctx.globalAlpha; // z. B. halbtransparente Minimap, wenn der Spieler darunter steht
    ctx.save();
    ctx.fillStyle = 'rgba(16,12,22,0.92)';
    ctx.fillRect(x, y, w, h);
    const px = 4;
    for (let i = 0, n = Math.floor((w * h) / 90); i < n; i++) {
      ctx.globalAlpha = base * (0.35 + rand() * 0.6);
      ctx.fillStyle = GLITCH_COLORS[Math.floor(rand() * GLITCH_COLORS.length)];
      ctx.fillRect(x + Math.floor(rand() * (w / px)) * px, y + Math.floor(rand() * (h / px)) * px, px * (1 + Math.floor(rand() * 3)), px);
    }
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = base * 0.5;
      ctx.fillStyle = rand() < 0.5 ? '#e040c0' : '#40d8e0';
      const ty = y + Math.floor(rand() * h);
      ctx.fillRect(x - 2 + Math.floor(rand() * 6), ty, w, 2);
    }
    ctx.restore();
  }

  /** Text durch Zufallszeichen gleicher Laenge ersetzen */
  function scramble(str, salt) {
    const rand = glitchRand(Math.floor(now() * 12) * 17 + salt);
    let out = '';
    for (let i = 0; i < str.length; i++) out += GLITCH_CHARS[Math.floor(rand() * GLITCH_CHARS.length)];
    return out;
  }

  B.HUD = {
    drawHeart,
    drawIcon,
    drawRestartRing,
    roundRect: rr,
    draw(ctx, game) {
      const p = game.player;
      if (!p) return;
      trackChanges(p);
      // Leiste mit leichtem Verlauf und Trennlinie
      const grd = ctx.createLinearGradient(0, 0, 0, HUD_H);
      grd.addColorStop(0, '#1b1714');
      grd.addColorStop(1, B.COLORS.hudBg);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, HUD_H);
      ctx.fillStyle = B.COLORS.hudLine;
      ctx.fillRect(0, HUD_H - 2, W, 2);
      ctx.fillStyle = B.themeFor(game.depth).accent;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, HUD_H - 2, W, 1);
      ctx.globalAlpha = 1;

      drawActive(ctx, p, 8, 6);
      if (glitchFor(game, 'items')) drawStatic(ctx, 5, 3, 74, 58, 1);         // Aktiv-Item + Ladebalken
      drawHearts(ctx, p, 86, 6);
      if (glitchFor(game, 'hearts')) drawStatic(ctx, 83, 3, 134, 58, 2);       // beide Herzreihen
      drawCounter(ctx, 222, 4, 'credits', ['pickup_credit', 'hud_credit'], B.COLORS.credit, p.credits);
      drawCounter(ctx, 222, 23, 'pushes', ['pickup_push', 'hud_push'], '#c9c9c9', p.pushes);
      drawCounter(ctx, 222, 42, 'approvals', ['pickup_approval', 'hud_approval'], B.COLORS.approval, p.approvals);
      drawStats(ctx, p, 300, 7, !!glitchFor(game, 'stats'));
      drawFloorLabel(ctx, game);

      drawMinimap(ctx, game, !!glitchFor(game, 'minimap'));
      drawBossBar(ctx, game);
      if (game.state === 'play' || game.state === 'roomTransition') drawBanner(ctx, game);
      if (game.state === 'play' || game.state === 'roomTransition') drawRestartRing(ctx, game, W / 2, HUD_H + 40);
    },
  };
})(window.BOTA);
