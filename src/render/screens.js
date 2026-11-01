/*
 * screens.js — Vollbild-/Overlay-Screens: Titel, Etagenkarte, Boss-Intro (VS-Karte), Pause, Tod.
 *
 * Reine Darstellung: Zustandswechsel macht game.js. Einzige "Eingabe" hier ist die Item-Auswahl im
 * Pause-Menue (Pfeiltasten), die ueber Flanken von BOTA.input.down() erkannt wird und nur die Anzeige
 * beeinflusst (keine Spiellogik).
 *
 * Nutzt BOTA.pixelText / BOTA.HUD.drawIcon aus hud.js (wird vorher geladen).
 */
'use strict';

(function (B) {
  const { W, H, HUD_H } = B.C;
  const now = () => performance.now() / 1000;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (k) => 1 - Math.pow(1 - clamp01(k), 3);

  function dim(ctx, a, col) {
    ctx.fillStyle = 'rgba(' + (col || '0,0,0') + ',' + a + ')';
    ctx.fillRect(0, 0, W, H);
  }

  /** Bricht Text auf maxWidth um (misst mit der aktuellen Schrift) */
  function wrapLines(ctx, text, maxWidth, size, bold) {
    ctx.save();
    ctx.font = (bold ? 'bold ' : '') + size + 'px ' + B.FONT;
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }

  /** Item-Icon (passend skaliert) oder Platzhalter */
  function itemIcon(ctx, id, x, y, size, opts) {
    const def = B.ITEMS[id];
    const name = def && def.sprite;
    if (!B.HUD.drawIcon(ctx, name, x, y, size, opts)) {
      ctx.fillStyle = '#3a312b';
      ctx.fillRect(x - size / 2 + 4, y - size / 2 + 4, size - 8, size - 8);
      B.pixelText(ctx, '?', x, y, { scale: 2, align: 'center', baseline: 'middle', color: B.COLORS.textDim, shadow: false });
    }
  }

  function fmtTime(sec) {
    const s = Math.floor(sec || 0);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ===========================================================================
  // Titel
  // ===========================================================================

  // Schwebende "Tokens" im Hintergrund (rein dekorativ, Math.random ist hier ok)
  const titleMotes = [];
  for (let i = 0; i < 46; i++) {
    titleMotes.push({ x: Math.random() * W, y: Math.random() * H, s: 2 + Math.floor(Math.random() * 3) * 2, v: 8 + Math.random() * 22, p: Math.random() * 6.28 });
  }

  function drawTitleBackdrop(ctx, t) {
    // Dunkler Boden mit Schachbrett, nach aussen abgedunkelt
    ctx.fillStyle = '#120f0d';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 64) {
      for (let x = 0; x < W; x += 64) {
        if (((x + y) / 64) % 2 === 0) { ctx.fillStyle = 'rgba(255,220,190,0.018)'; ctx.fillRect(x, y, 64, 64); }
      }
    }
    // Aufsteigende Funken/Tokens
    for (const m of titleMotes) {
      const y = ((m.y - t * m.v) % H + H) % H;
      const x = m.x + Math.sin(t * 0.7 + m.p) * 12;
      ctx.fillStyle = m.s > 4 ? 'rgba(255,207,77,0.22)' : 'rgba(217,119,87,0.25)';
      ctx.fillRect(Math.round(x), Math.round(y), m.s, m.s);
    }
    // Warmer Lichtkegel hinter dem Logo
    const grd = ctx.createRadialGradient(W / 2, 250, 20, W / 2, 250, 520);
    grd.addColorStop(0, 'rgba(217,119,87,0.16)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    // Vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 640);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /** Funkelstern (4 Zacken) als Pixel-Kreuz */
  function sparkle(ctx, x, y, s, a) {
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = '#ffe9a3';
    ctx.fillRect(x - s / 2, y - s * 2.5, s, s * 5);
    ctx.fillRect(x - s * 2.5, y - s / 2, s * 5, s);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.restore();
  }

  /** Taste als Kappe (Titel-Steuerungshilfe) */
  function keycap(ctx, x, y, label, w) {
    const kw = w || 30;
    ctx.fillStyle = '#0b0908';
    B.HUD.roundRect(ctx, x - kw / 2, y - 12, kw, 28, 5); ctx.fill();
    ctx.fillStyle = '#3a322c';
    B.HUD.roundRect(ctx, x - kw / 2, y - 14, kw, 25, 5); ctx.fill();
    ctx.fillStyle = '#4a4039';
    B.HUD.roundRect(ctx, x - kw / 2 + 2, y - 13, kw - 4, 20, 4); ctx.fill();
    B.text(ctx, label, x, y - 3, { size: 13, align: 'center', baseline: 'middle', color: '#f3ece6', shadow: false });
  }

  function drawTitle(ctx, game) {
    const t = now();
    drawTitleBackdrop(ctx, t);

    // Logo: "THE BINDING" gross in Koralle, "OF THE AGENT" darunter
    const ly = 92;
    B.pixelText(ctx, 'THE BINDING', W / 2, ly, { scale: 9, align: 'center', color: '#e8845f', shadow: '#5a2717', outline: '#2a120b' });
    B.pixelText(ctx, 'OF THE AGENT', W / 2, ly + 86, { scale: 5, align: 'center', color: '#f3ece6', shadow: '#5a2717', outline: '#1a1412' });
    // Funkeln am Logo
    const sp = (t * 0.8) % 1;
    sparkle(ctx, W / 2 + 252, ly + 6, 3, Math.sin(sp * Math.PI));
    sparkle(ctx, W / 2 - 262, ly + 80, 2, Math.sin(((sp + 0.5) % 1) * Math.PI));

    // Tagline
    B.text(ctx, game.titleTagline || '', W / 2, ly + 136, { size: 18, align: 'center', color: '#c9b9ad', bold: false });

    // Avatar: laeuft auf der Stelle, Blickrichtung wechselt gelegentlich
    const dirs = ['down', 'down', 'left', 'down', 'right', 'down', 'up'];
    const dir = dirs[Math.floor(t / 2.2) % dirs.length];
    const ay = 372 + Math.sin(t * 8) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(W / 2, 430, 40, 10, 0, 0, Math.PI * 2); ctx.fill();
    B.drawSprite(ctx, 'player_' + dir, W / 2, ay, { frame: Math.floor(t * 7), scale: 1.5 });

    // Start-Hinweis
    const blink = 0.55 + 0.45 * Math.sin(t * 4);
    B.pixelText(ctx, 'PRESS ENTER', W / 2, 462, { scale: 3, align: 'center', color: '#ffcf4d', shadow: '#5a3a00', alpha: blink });

    // Steuerung als Tastenkappen
    const row = [
      [['W', 'A', 'S', 'D'], 'move'], [['↑', '←', '↓', '→'], 'shoot'], [['E'], 'force push'],
      [['SPACE'], 'item'], [['ESC'], 'pause'], [['M'], 'mute'],
    ];
    let x = 78;
    const ky = 530;
    for (const [keys, label] of row) {
      for (const k of keys) {
        const kw = k.length > 1 ? 14 + k.length * 9 : 26;
        keycap(ctx, x + kw / 2, ky, k, kw);
        x += kw + 3;
      }
      B.text(ctx, label, x + 4, ky - 8, { size: 13, color: B.COLORS.textDim, shadow: false });
      ctx.save(); ctx.font = '13px ' + B.FONT; x += ctx.measureText(label).width + 24; ctx.restore();
    }

    // Statistik & Status
    const s = B.storage.data;
    B.text(ctx, 'runs ' + s.runs + '  ·  deaths ' + s.deaths + '  ·  deepest floor ' + s.bestFloor, W / 2, 576, { size: 14, align: 'center', color: B.COLORS.textDim, shadow: false });
    if (B.params.seed) B.text(ctx, 'seed ' + B.params.seed, W / 2, 598, { size: 13, align: 'center', color: '#e8845f', shadow: false });
    B.text(ctx, B.audio && B.audio.muted ? 'sound: off (M)' : 'sound: on (M)', 16, H - 24, { size: 12, color: B.COLORS.textFaint, shadow: false });
    B.text(ctx, 'v1 · a team distraction · zero dependencies', W - 16, H - 24, { size: 12, align: 'right', color: B.COLORS.textFaint, shadow: false });
  }

  // ===========================================================================
  // Etagenkarte
  // ===========================================================================

  function drawFloorCard(ctx, game) {
    const total = 2.2;
    const age = total - game.stateT;
    const outA = clamp01(game.stateT / 0.45);      // Ausblenden am Ende
    const theme = B.themeFor(game.depth);
    const info = B.floorInfo(game.depth);
    dim(ctx, 0.92 * outA);
    ctx.save();
    ctx.globalAlpha = outA;

    // Band in der Mitte, Akzentlinien in Etagenfarbe
    const bandK = easeOut(age / 0.35);
    const bh = 170 * bandK, by = H / 2 - bh / 2 + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, by, W, bh);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(W / 2 - 360 * bandK, by, 720 * bandK, 2);
    ctx.fillRect(W / 2 - 360 * bandK, by + bh - 2, 720 * bandK, 2);

    // Avatar faellt von oben herein und landet (kleiner Hops)
    const fallK = clamp01(age / 0.55);
    const ay = fallK < 1 ? -60 + (by - 70 + 60) * fallK * fallK : by - 70 - Math.abs(Math.sin((age - 0.55) * 7)) * 10 * Math.max(0, 1 - (age - 0.55) * 1.5);
    B.drawSprite(ctx, fallK < 1 ? 'player_hurt' : 'player_down', W / 2, ay, { frame: 0 });

    // Texte
    const slide = (1 - easeOut((age - 0.1) / 0.4)) * 80;
    B.pixelText(ctx, 'FLOOR ' + game.depth, W / 2, by + 22, { scale: 3, align: 'center', color: B.COLORS.textDim, alpha: clamp01((age - 0.05) / 0.3) });
    const name = info.name.toUpperCase();
    let sc = 7;
    while (sc > 3 && B.pixelTextWidth(name, sc) > 880) sc--;
    B.pixelText(ctx, name, W / 2 - slide, by + 56, { scale: sc, align: 'center', color: theme.accent, shadow: 'rgba(0,0,0,0.8)', outline: '#0a0807', alpha: clamp01((age - 0.1) / 0.3) });
    B.text(ctx, info.sub, W / 2 + slide, by + 124, { size: 19, align: 'center', color: '#d6cbc2', bold: false, alpha: clamp01((age - 0.3) / 0.3) });

    // Fortschritt: ein Punkt pro Etage (die aktuelle leuchtet); Anzahl = Laenge der Etagenliste
    const n = Math.max((B.TEXT.FLOORS && B.TEXT.FLOORS.length) || 10, game.depth);
    const dx = 22, x0 = W / 2 - ((Math.min(n, 18) - 1) * dx) / 2;
    for (let i = 0; i < Math.min(n, 18); i++) {
      const d = i + 1;
      ctx.fillStyle = d < game.depth ? '#7d746d' : d === game.depth ? theme.accent : '#2e2824';
      const s = d === game.depth ? 10 : 6;
      ctx.fillRect(x0 + i * dx - s / 2, by + bh + 26 - s / 2, s, s);
    }
    ctx.restore();
  }

  // ===========================================================================
  // Boss-Intro: CLAUDE vs BOSS
  // ===========================================================================

  function drawBossIntro(ctx, game) {
    const total = 2.2;
    const age = total - game.stateT;
    const outA = clamp01(game.stateT / 0.3);
    const boss = game.room && game.room.enemies.find((e) => e.isBoss);
    dim(ctx, 0.72 * outA);
    ctx.save();
    ctx.globalAlpha = outA;
    const inK = easeOut(age / 0.35);
    const cy = H / 2 - 10;
    const ph = 230;

    // Linke Tafel (Claude, Koralle) gleitet von links, rechte (Boss, Rot) von rechts; diagonale Trennung
    const off = (1 - inK) * W * 0.6;
    ctx.save();
    ctx.translate(-off, 0);
    ctx.fillStyle = '#7a3a24';
    ctx.beginPath(); ctx.moveTo(0, cy - ph / 2); ctx.lineTo(W / 2 + 40, cy - ph / 2); ctx.lineTo(W / 2 - 40, cy + ph / 2); ctx.lineTo(0, cy + ph / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 8; i++) ctx.fillRect(0, cy - ph / 2 + 12 + i * 28, W / 2 - 40, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(W * 0.22, cy + 70, 60, 12, 0, 0, Math.PI * 2); ctx.fill();
    B.drawSprite(ctx, 'player_down', W * 0.22, cy + 6 + Math.sin(age * 10) * 2, { frame: Math.floor(age * 8), scale: 1.5 });
    B.pixelText(ctx, 'CLAUDE', W * 0.22, cy + 84, { scale: 4, align: 'center', color: '#fff3ea', shadow: '#3a160c' });
    ctx.restore();

    ctx.save();
    ctx.translate(off, 0);
    ctx.fillStyle = '#5a1010';
    ctx.beginPath(); ctx.moveTo(W / 2 + 44, cy - ph / 2); ctx.lineTo(W, cy - ph / 2); ctx.lineTo(W, cy + ph / 2); ctx.lineTo(W / 2 - 36, cy + ph / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 8; i++) ctx.fillRect(W / 2 + 40, cy - ph / 2 + 12 + i * 28, W / 2, 6);
    const bx = W * 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(bx, cy + 70, 80, 14, 0, 0, Math.PI * 2); ctx.fill();
    const sprite = boss && boss.def && boss.def.sprite;
    const shake = age < 0.9 ? 0 : Math.sin(age * 40) * 2 * Math.max(0, 1 - (age - 0.9) * 2);
    if (!(sprite && B.HUD.drawIcon(ctx, sprite, bx + shake, cy - 6, 150))) {
      // Kein Sprite (oder prozedural gezeichneter Boss): dunkle Silhouette mit Fragezeichen
      ctx.fillStyle = '#1a0606';
      ctx.beginPath(); ctx.arc(bx, cy - 6, 58, 0, Math.PI * 2); ctx.fill();
      B.pixelText(ctx, '?', bx, cy - 6, { scale: 8, align: 'center', baseline: 'middle', color: '#e04848', shadow: false });
    }
    const bname = (boss && boss.def && boss.def.name ? boss.def.name : '???').toUpperCase();
    let sc = 4;
    while (sc > 2 && B.pixelTextWidth(bname, sc) > 380) sc--;
    B.pixelText(ctx, bname, bx, cy + 84, { scale: sc, align: 'center', color: '#ffe0d8', shadow: '#2a0505' });
    ctx.restore();

    // "VS" springt in der Mitte auf (mit Blitz)
    const vsAge = age - 0.3;
    if (vsAge > 0) {
      const pop = vsAge < 0.15 ? 1.6 - vsAge * 4 : 1;
      const flash = clamp01(1 - vsAge / 0.2);
      if (flash > 0) dim(ctx, flash * 0.5, '255,255,255');
      ctx.save();
      ctx.translate(W / 2, cy);
      ctx.scale(pop, pop);
      B.pixelText(ctx, 'VS', 0, 0, { scale: 8, align: 'center', baseline: 'middle', color: '#ffcf4d', shadow: '#000', outline: '#2a1a00' });
      ctx.restore();
    }

    // Untertitel
    if (boss && boss.def && boss.def.subtitle) {
      const subA = clamp01((age - 0.5) / 0.3);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.6 * subA + ')';
      ctx.fillRect(0, cy + ph / 2 + 14, W, 36);
      B.text(ctx, '"' + boss.def.subtitle + '"', W / 2, cy + ph / 2 + 22, { size: 18, align: 'center', color: '#f0d0c8', bold: false, alpha: subA });
    }
    ctx.restore();
  }

  // ===========================================================================
  // Pause
  // ===========================================================================

  const pauseSel = { index: -1, count: 0, queue: [], quip: '', lastT: 0 };

  // Pfeiltasten im Pause-Menue: eigener keydown-Listener, damit auch sehr kurze Tastendruecke
  // (kuerzer als ein Frame) ankommen. Beeinflusst nur die Anzeige (welches Item beschrieben wird).
  window.addEventListener('keydown', (e) => {
    if (!B.game || B.game.state !== 'pause' || e.repeat) return;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.code] !== undefined && pauseSel.queue.length < 8) pauseSel.queue.push(map[e.code]);
  });
  const PAUSE_QUIPS = [
    "The bugs will wait. They're patient.",
    'Taking a break. Like a real engineer.',
    'Paused. The backlog, sadly, is not.',
    'Have you tried turning it off and on again?',
    'Your context is safe. For now.',
  ];

  function drawPause(ctx, game) {
    const p = game.player;
    dim(ctx, 0.88);
    // Neue Pause-Sitzung erkennen (letzter Pause-Frame liegt laenger zurueck): Spruch + Auswahl zuruecksetzen
    const tNow = now();
    if (tNow - (pauseSel.lastT || 0) > 0.25) {
      pauseSel.quip = B.TEXT.pick(PAUSE_QUIPS);
      pauseSel.index = 0;
      pauseSel.queue.length = 0;
    }
    pauseSel.lastT = tNow;
    B.pixelText(ctx, 'PAUSED', W / 2, 26, { scale: 6, align: 'center', color: '#f3ece6', shadow: '#5a2717' });
    B.text(ctx, pauseSel.quip, W / 2, 80, { size: 15, align: 'center', color: B.COLORS.textDim, bold: false });

    // --- Linke Spalte: Werte -------------------------------------------------
    const lx = 36, ly = 118, lw = 250;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    B.HUD.roundRect(ctx, lx, ly, lw, 420, 8); ctx.fill();
    B.pixelText(ctx, 'STATS', lx + 16, ly + 14, { scale: 2, color: B.COLORS.claude, shadow: false });
    const s = p.stats;
    const stats = [
      ['Damage', s.damage.toFixed(2), s.damage / 10],
      ['Tokens/s', (1 / s.fireDelay).toFixed(2), (1 / s.fireDelay) / 10],
      ['Speed', s.speed.toFixed(2), s.speed / 2],
      ['Range', String(Math.round(s.range)), s.range / 1400],
      ['Shot speed', s.shotSpeed.toFixed(2), s.shotSpeed / 3],
      ['Luck', String(Math.round(s.luck)), (s.luck + 2) / 12],
    ];
    stats.forEach(([label, val, k], i) => {
      const y = ly + 42 + i * 31;
      B.text(ctx, label, lx + 16, y, { size: 14, color: B.COLORS.textDim, shadow: false });
      B.text(ctx, val, lx + lw - 16, y, { size: 14, align: 'right', color: B.COLORS.text, shadow: false });
      ctx.fillStyle = '#2a2420'; ctx.fillRect(lx + 16, y + 19, lw - 32, 4);
      ctx.fillStyle = B.COLORS.claude; ctx.fillRect(lx + 16, y + 19, (lw - 32) * clamp01(k), 4);
    });
    const ry = ly + 238;
    B.pixelText(ctx, 'RUN', lx + 16, ry, { scale: 2, color: B.COLORS.claude, shadow: false });
    const info = B.floorInfo(game.depth);
    const runRows = [
      ['Floor', game.depth + ' · ' + info.name],
      ['Time', fmtTime(game.runStats.time)],
      ['Kills', String(game.runStats.kills)],
      ['Rooms', String(game.runStats.rooms)],
      ['Credits', p.credits + '¢'],
      ['Pushes', String(p.pushes)],
      ['Approvals', String(p.approvals)],
    ];
    runRows.forEach(([a, b], i) => {
      const y = ry + 24 + i * 20;
      B.text(ctx, a, lx + 16, y, { size: 13, color: B.COLORS.textDim, shadow: false });
      B.text(ctx, b, lx + 100, y, { size: 13, color: B.COLORS.text, shadow: false, maxWidth: lw - 114 });
    });

    // --- Rechte Spalte: Items ------------------------------------------------
    const ids = (p.active ? [p.active.id] : []).concat(p.items.slice().reverse()); // aktiv zuerst, dann neueste
    const rx = 306, rw = W - rx - 36, cell = 58, perRow = Math.floor((rw - 24) / cell);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    B.HUD.roundRect(ctx, rx, ly, rw, 420, 8); ctx.fill();
    B.pixelText(ctx, 'ITEMS (' + ids.length + ')', rx + 16, ly + 14, { scale: 2, color: B.COLORS.claude, shadow: false });
    if (!ids.length) {
      B.text(ctx, 'None. Bold strategy.', rx + rw / 2, ly + 190, { size: 18, align: 'center', color: B.COLORS.textDim, bold: false });
    } else {
      // Auswahl per Pfeiltasten (nur Anzeige)
      if (pauseSel.count !== ids.length || pauseSel.index < 0 || pauseSel.index >= ids.length) pauseSel.index = 0;
      pauseSel.count = ids.length;
      while (pauseSel.queue.length) {
        const m = pauseSel.queue.shift();
        const step = m === 'up' ? -perRow : m === 'down' ? perRow : m;
        pauseSel.index = Math.max(0, Math.min(ids.length - 1, pauseSel.index + step));
      }
      const maxRows = 3;
      const firstRow = Math.max(0, Math.floor(pauseSel.index / perRow) - (maxRows - 1));
      ids.forEach((id, i) => {
        const row = Math.floor(i / perRow) - firstRow;
        if (row < 0 || row >= maxRows) return;
        const x = rx + 16 + (i % perRow) * cell, y = ly + 44 + row * cell;
        const sel = i === pauseSel.index;
        ctx.fillStyle = sel ? 'rgba(217,119,87,0.25)' : 'rgba(0,0,0,0.25)';
        B.HUD.roundRect(ctx, x, y, cell - 6, cell - 6, 5); ctx.fill();
        if (sel) { ctx.strokeStyle = B.COLORS.claude; ctx.lineWidth = 2; B.HUD.roundRect(ctx, x, y, cell - 6, cell - 6, 5); ctx.stroke(); }
        itemIcon(ctx, id, x + (cell - 6) / 2, y + (cell - 6) / 2, 44);
        if (p.active && i === 0) B.pixelText(ctx, 'ACTIVE', x + (cell - 6) / 2, y + cell - 14, { scale: 1, align: 'center', color: '#ffcf4d', shadow: '#000' });
      });
      // Details zum ausgewaehlten Item
      const id = ids[pauseSel.index];
      const def = B.ITEMS[id] || {};
      const dy = ly + 44 + maxRows * cell + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      B.HUD.roundRect(ctx, rx + 12, dy, rw - 24, 420 - (dy - ly) - 12, 6); ctx.fill();
      itemIcon(ctx, id, rx + 52, dy + 46, 60);
      const nm = String(def.name || id).toUpperCase();
      const nsc = B.pixelTextWidth(nm, 3) > rw - 130 ? 2 : 3;
      B.pixelText(ctx, nm, rx + 96, dy + 14, { scale: nsc, color: '#fff6ee', shadow: '#5a2717' });
      B.text(ctx, def.tagline || '', rx + 96, dy + 44, { size: 15, color: '#ffcf4d', bold: false, shadow: false });
      const lines = wrapLines(ctx, def.desc || '', rw - 120, 14, false);
      lines.slice(0, 4).forEach((ln, i) => B.text(ctx, ln, rx + 96, dy + 68 + i * 19, { size: 14, color: '#d6cbc2', bold: false, shadow: false }));
      if (def.active) B.text(ctx, 'Active · charge ' + (p.active && p.active.id === id ? p.active.charge : 0) + '/' + (def.maxCharge || 0) + ' · SPACE to use', rx + 96, dy + 68 + Math.min(4, lines.length) * 19 + 4, { size: 12, color: B.COLORS.textFaint, shadow: false });
      if (ids.length > 1) B.text(ctx, '← → ↑ ↓  browse', rx + rw - 16, ly + 16, { size: 12, align: 'right', color: B.COLORS.textFaint, shadow: false });
    }

    B.text(ctx, 'seed ' + game.seed + '   ·   ESC resume   ·   hold R restart   ·   M ' + (B.audio && B.audio.muted ? 'unmute' : 'mute'),
      W / 2, H - 34, { size: 13, align: 'center', color: B.COLORS.textDim, shadow: false });
    B.HUD.drawRestartRing(ctx, game, W / 2, H / 2);
  }

  // ===========================================================================
  // Tod: "Post-Mortem" (blameless, natuerlich)
  // ===========================================================================

  function drawDead(ctx, game) {
    const age = game.stateT;
    const a = clamp01(age / 0.6);
    dim(ctx, 0.78 * a, '20,4,4');
    const d = game.death || {};
    const p = game.player;

    // Papier gleitet von unten herein
    const pw = 660, ph = 488;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2 + 6 + (1 - easeOut((age - 0.15) / 0.5)) * (H * 0.8);
    if (age < 0.15) return;
    ctx.save();
    ctx.translate(W / 2, py + ph / 2);
    ctx.rotate(-0.012);
    ctx.translate(-W / 2, -(py + ph / 2));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px + 8, py + 10, pw, ph);
    ctx.fillStyle = '#e9dcc6';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#ddcdb3';
    for (let ly = py + 96; ly < py + ph - 20; ly += 26) ctx.fillRect(px + 20, ly, pw - 40, 1);
    ctx.fillStyle = '#c94f3d';
    ctx.fillRect(px + 60, py, 2, ph);

    // Kopf
    const ink = '#2b201b';
    B.pixelText(ctx, 'POST-MORTEM', px + 84, py + 22, { scale: 4, color: '#8a2a1e', shadow: false });
    const inc = 'INC-' + (B.hashString ? (B.hashString(String(game.seed)) % 9000 + 1000) : 1234);
    B.text(ctx, inc + '  ·  severity: P0  ·  status: deceased', px + 86, py + 58, { size: 13, color: '#7a6a5c', shadow: false, bold: false });

    // Toter Avatar rechts oben
    B.drawSprite(ctx, 'player_dead', px + pw - 70, py + 70, { frame: 0 });

    // Grabinschrift
    const lines = wrapLines(ctx, d.epitaph || 'You died.', pw - 120, 21, true);
    lines.slice(0, 2).forEach((ln, i) => B.text(ctx, ln, px + 86, py + 104 + i * 26, { size: 21, color: ink, shadow: false }));

    // Felder
    const info = B.floorInfo(d.depth || game.depth);
    const ranks = B.TEXT.RANKS || ['Agent'];
    const rank = ranks[Math.min(ranks.length - 1, Math.max(0, (d.depth || 1) - 1))];
    const fields = [
      ['Killed by', d.killer || 'unknown', '#a8261a'],
      ['Floor reached', (d.depth || game.depth) + ' — ' + info.name, ink],
      ['Bugs fixed', String(d.kills || 0) + ' kills', ink],
      ['Uptime', fmtTime(d.time), ink],
      ['Final title', rank, ink],
    ];
    fields.forEach(([k, v, col], i) => {
      const y = py + 168 + i * 26;
      B.text(ctx, k + ':', px + 86, y, { size: 15, color: '#7a6a5c', shadow: false, bold: false });
      B.text(ctx, v, px + 236, y, { size: 15, color: col, shadow: false, maxWidth: pw - 260 });
    });

    // Items
    const ids = p ? (p.active ? [p.active.id] : []).concat(p.items) : [];
    const iy = py + 314;
    B.text(ctx, 'Items (' + ids.length + '):', px + 86, iy, { size: 15, color: '#7a6a5c', shadow: false, bold: false });
    if (!ids.length) B.text(ctx, 'none. a minimalist.', px + 236, iy, { size: 15, color: ink, shadow: false, bold: false });
    const perRow = 14;
    ids.slice(0, perRow * 2).forEach((id, i) => {
      const x = px + 100 + (i % perRow) * 38, y = iy + 40 + Math.floor(i / perRow) * 38;
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x - 17, y - 17, 34, 34);
      itemIcon(ctx, id, x, y, 30);
    });

    // Fusszeile
    B.text(ctx, 'seed ' + game.seed, px + 86, py + ph - 34, { size: 13, color: '#7a6a5c', shadow: false, bold: false });
    if (age > 0.8) {
      const blink = 0.6 + 0.4 * Math.sin(age * 5);
      B.pixelText(ctx, 'PRESS R TO RETRY', px + pw - 24, py + ph - 38, { scale: 2, align: 'right', color: '#8a2a1e', shadow: false, alpha: blink });
    }

    // Stempel "BLAMELESS" mit Wumms
    const stK = age - 0.75;
    if (stK > 0) {
      const sc = stK < 0.12 ? 2 - stK * 8.3 : 1;
      ctx.save();
      ctx.translate(px + pw - 150, py + 236);
      ctx.rotate(-0.22);
      ctx.scale(sc, sc);
      ctx.globalAlpha *= 0.75 * clamp01(stK / 0.08);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
      ctx.strokeRect(-104, -26, 208, 52);
      B.pixelText(ctx, 'BLAMELESS', 0, 0, { scale: 4, align: 'center', baseline: 'middle', color: '#c0392b', shadow: false });
      ctx.restore();
    }
    ctx.restore();
  }

  B.Screens = {
    title: drawTitle,
    floorCard: drawFloorCard,
    bossIntro: drawBossIntro,
    pause: drawPause,
    dead: drawDead,
  };
})(window.BOTA);
