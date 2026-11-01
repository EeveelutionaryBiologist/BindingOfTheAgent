/*
 * renderer.js — Zeichnet Raum (Boden, Waende, Tueren, Hindernisse), Entities (nach y sortiert),
 * Projektile, Effekte; ruft HUD und Screens auf. Enthaelt den Text-Helfer BOTA.text().
 *
 * Koordinaten: Der Haupt-Context ist auf logische Pixel (960 x 640) skaliert (siehe main.js).
 * Der Raum wird um HUD_H nach unten verschoben gezeichnet.
 *
 * Aufbau der Darstellung:
 *  - Hintergrund-Bake (room.bgCanvas, neu bei room.bgDirty oder Skalierungswechsel):
 *      Bodenmuster je Etagen-Thema, Deko, Raumtyp-Deko (Teppiche etc.), Licht, Waende, Hindernisse,
 *      Steuerungshinweise im Startraum von Etage 1. Alles Teure gehoert hierher.
 *  - Pro Frame: Tueren (animiert: Fluegel schliessen/oeffnen sich), Schatten, Entities, Projektile,
 *      Effekte, danach (nur einmal pro Frame, ohne Screen-Shake) Vignette + optionale Dunkelheit.
 *  - Etagenwechsel: Iris-Blende auf den Spieler.
 *
 * Kachel-Sprites (aus sprites-core.js): tile_rock (3 Frames), tile_block, tile_pit, tile_spikes.
 * Diese Datei aendert KEINE Spiellogik; sie liest nur Zustand (room, game, player).
 */
'use strict';

(function (B) {
  const { TILE, COLS, ROWS, ROOM_W, ROOM_H, HUD_H, W, H, DOOR_TILES } = B.C;
  const T = B.TILES;

  /** Deterministischer Pseudo-Zufall pro Kachel (fuer Bodenflecken etc.) */
  function tileNoise(c, r, salt) {
    let h = (c * 374761393 + r * 668265263 + (salt | 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /**
   * Kleiner, lokaler Zufallsgenerator (mulberry32) NUR fuer Deko.
   * Wichtig: Die Darstellung darf das Run-RNG (game.rng) nie anfassen, sonst waeren Seeds nicht mehr reproduzierbar.
   */
  function decoRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Text-Helfer. opts: { size, color, align, baseline, bold, shadow (bool|Farbe), maxWidth, alpha }
   * (API unveraendert — wird von vielen Dateien genutzt)
   */
  B.text = function (ctx, str, x, y, opts) {
    const o = opts || {};
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.font = (o.bold === false ? '' : 'bold ') + (o.size || 16) + 'px ' + B.FONT;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'top';
    if (o.shadow !== false) {
      ctx.fillStyle = typeof o.shadow === 'string' ? o.shadow : 'rgba(0,0,0,0.7)';
      ctx.fillText(str, x + 2, y + 2, o.maxWidth);
    }
    ctx.fillStyle = o.color || B.COLORS.text;
    ctx.fillText(str, x, y, o.maxWidth);
    ctx.restore();
  };

  // ===========================================================================
  // Boden
  // ===========================================================================

  /** Ist (c, r) eine Innenkachel, auf der Deko liegen darf (Boden, nicht direkt vor einer Tuer)? */
  function decoAllowed(room, c, r) {
    if (c < 1 || r < 1 || c > COLS - 2 || r > ROWS - 2) return false;
    if (room.tileAt(c, r) !== T.FLOOR) return false;
    // Tuer-Vorplaetze freihalten
    if ((c === 7 && (r === 1 || r === ROWS - 2)) || (r === 4 && (c === 1 || c === COLS - 2))) return false;
    return true;
  }

  /** Bodenkachel nach Muster des Themas */
  function drawFloorTile(g, c, r, theme, depth) {
    const x = c * TILE, y = r * TILE;
    const n0 = tileNoise(c, r, depth * 13);
    // Schachbrett-Grundton (bei Dielen nicht — dort wechselt die Farbe pro Diele)
    g.fillStyle = theme.pattern === 'planks' || (c + r) % 2 === 0 ? theme.floor : theme.floorAlt;
    g.fillRect(x, y, TILE, TILE);

    switch (theme.pattern) {
      case 'planks': {
        // Horizontale Holzdielen (16 px hoch), Stoesse versetzt in Weltkoordinaten
        for (let i = 0; i < 4; i++) {
          const py = y + i * 16;
          const row = r * 4 + i;
          // leichte Helligkeitsvariation je Diele
          const v = tileNoise(row, Math.floor((x + row * 48) / 128), 3);
          g.fillStyle = v > 0.5 ? 'rgba(255,230,200,' + (0.015 + (v - 0.5) * 0.05) + ')' : 'rgba(0,0,0,' + (0.03 + v * 0.06) + ')';
          g.fillRect(x, py, TILE, 16);
          g.fillStyle = theme.grout;
          g.fillRect(x, py + 14, TILE, 2);
          g.fillStyle = 'rgba(255,240,220,0.035)';
          g.fillRect(x, py, TILE, 2);
          // Stoesse (alle 128 px, je Reihe versetzt)
          const off = (row * 48) % 128;
          for (let jx = -off; jx < x + TILE; jx += 128) {
            if (jx >= x && jx < x + TILE) {
              g.fillStyle = theme.grout;
              g.fillRect(jx, py, 2, 14);
              g.fillStyle = 'rgba(0,0,0,0.35)';
              g.fillRect(jx + 4, py + 6, 2, 2); // Nagel
            }
          }
          // Maserung
          if (tileNoise(c, row, 9) > 0.55) {
            g.fillStyle = 'rgba(0,0,0,0.07)';
            g.fillRect(x + Math.floor(tileNoise(row, c, 4) * 10) * 4, py + 6, 16 + Math.floor(tileNoise(c, row, 5) * 4) * 4, 2);
          }
        }
        break;
      }
      case 'stone': {
        // Unregelmaessige Steinplatten: 1, 2 oder 4 Platten pro Kachel
        const parts = n0 < 0.25 ? [[0, 0, 64, 64]] : n0 < 0.6 ? (tileNoise(c, r, 2) < 0.5 ? [[0, 0, 64, 32], [0, 32, 64, 32]] : [[0, 0, 32, 64], [32, 0, 32, 64]])
          : [[0, 0, 32, 32], [32, 0, 32, 32], [0, 32, 32, 32], [32, 32, 32, 32]];
        parts.forEach(([px, py, pw, ph], i) => {
          const v = tileNoise(c * 4 + i, r, 7);
          g.fillStyle = v > 0.5 ? 'rgba(255,255,255,' + (v - 0.5) * 0.06 + ')' : 'rgba(0,0,0,' + v * 0.1 + ')';
          g.fillRect(x + px, y + py, pw, ph);
          g.fillStyle = 'rgba(255,255,255,0.04)';
          g.fillRect(x + px + 2, y + py + 2, pw - 4, 2);
          g.fillRect(x + px + 2, y + py + 2, 2, ph - 4);
          g.fillStyle = theme.grout;
          g.fillRect(x + px, y + py + ph - 2, pw, 2);
          g.fillRect(x + px + pw - 2, y + py, 2, ph);
        });
        // gelegentlicher Riss
        if (tileNoise(c, r, 11) > 0.82) {
          g.fillStyle = 'rgba(0,0,0,0.28)';
          let cx = x + 12 + Math.floor(tileNoise(r, c, 12) * 8) * 4, cy = y + 10;
          for (let k = 0; k < 9; k++) {
            g.fillRect(cx, cy, 2, 4);
            cx += tileNoise(c + k, r, 13) > 0.5 ? 2 : -2;
            cy += 4;
          }
        }
        break;
      }
      case 'moss': {
        // Waldboden (Forgotten Branches): Moospolster, Erdflecken und Grashalme statt Fugen
        for (let i = 0; i < 6; i++) {
          const n = tileNoise(c * 3 + i, r, 21);
          const px = x + Math.floor(tileNoise(c, r * 5 + i, 22) * 12) * 4;
          const py = y + Math.floor(tileNoise(c * 7 + i, r, 23) * 12) * 4;
          const s = 8 + Math.floor(n * 4) * 4;
          g.fillStyle = n > 0.6 ? 'rgba(150,210,95,0.07)' : n < 0.25 ? 'rgba(60,40,20,0.2)' : 'rgba(0,0,0,0.06)';
          g.fillRect(px, py, Math.min(s, x + TILE - px), Math.min(Math.max(4, s - 4), y + TILE - py));
        }
        g.fillStyle = 'rgba(160,215,105,0.22)';
        for (let i = 0; i < 4; i++) {
          if (tileNoise(c, r + i * 3, 24) < 0.45) continue;
          const gx = x + 6 + Math.floor(tileNoise(c + i, r, 25) * 13) * 4, gy = y + 6 + Math.floor(tileNoise(r, c + i, 26) * 12) * 4;
          g.fillRect(gx, gy, 2, 6);
          g.fillRect(gx + 3, gy + 2, 2, 4);
          g.fillRect(gx - 3, gy + 3, 2, 3);
        }
        break;
      }
      case 'tiles': {
        // Quadratische Fliesen (32 px) mit Fase
        for (let i = 0; i < 4; i++) {
          const px = x + (i % 2) * 32, py = y + Math.floor(i / 2) * 32;
          if ((i + c + r) % 2 === 0) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(px, py, 32, 32); }
          g.fillStyle = 'rgba(255,255,255,0.045)';
          g.fillRect(px, py, 32, 2);
          g.fillRect(px, py, 2, 32);
          g.fillStyle = theme.grout;
          g.fillRect(px, py + 30, 32, 2);
          g.fillRect(px + 30, py, 2, 32);
        }
        break;
      }
      case 'plate': {
        // Riffelblech: diagonale Noppen, abwechselnd ausgerichtet; Plattennaht mit Nieten
        for (let iy = 0; iy < 4; iy++) {
          for (let ix = 0; ix < 4; ix++) {
            const px = x + ix * 16 + 4, py = y + iy * 16 + 4;
            const flip = (ix + iy) % 2 === 0;
            g.fillStyle = 'rgba(255,255,255,0.06)';
            for (let k = 0; k < 4; k++) g.fillRect(px + (flip ? k * 2 : 6 - k * 2), py + k * 2, 2, 2);
            g.fillStyle = 'rgba(0,0,0,0.2)';
            for (let k = 0; k < 4; k++) g.fillRect(px + (flip ? k * 2 : 6 - k * 2) + 2, py + k * 2 + 2, 2, 2);
          }
        }
        g.fillStyle = theme.grout;
        g.fillRect(x, y + TILE - 2, TILE, 2);
        g.fillRect(x + TILE - 2, y, 2, TILE);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + 4, y + 4, 2, 2); g.fillRect(x + TILE - 8, y + 4, 2, 2);
        g.fillRect(x + 4, y + TILE - 8, 2, 2); g.fillRect(x + TILE - 8, y + TILE - 8, 2, 2);
        break;
      }
      case 'grid': {
        // Karopapier: feine Linien alle 16 px, kraeftigere alle 64 px
        g.fillStyle = 'rgba(160,220,140,0.045)';
        for (let k = 0; k < 64; k += 16) { g.fillRect(x + k, y, 1, TILE); g.fillRect(x, y + k, TILE, 1); }
        g.fillStyle = 'rgba(160,220,140,0.08)';
        g.fillRect(x, y, 2, TILE);
        g.fillRect(x, y, TILE, 2);
        break;
      }
      case 'void':
      default: {
        // Punktraster
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = 8; k < 64; k += 32) for (let m = 8; m < 64; m += 32) g.fillRect(x + k, y + m, 2, 2);
        break;
      }
    }

    // Flecken fuer Textur (alle Muster)
    for (let i = 0; i < 3; i++) {
      const n = tileNoise(c, r, depth * 7 + i);
      if (n < 0.55) continue;
      g.fillStyle = n > 0.88 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
      const s = 4 + Math.floor(tileNoise(r, c, i) * 2) * 4;
      g.fillRect(x + Math.floor(tileNoise(c, i, r) * 14) * 4, y + Math.floor(tileNoise(i, r, c) * 14) * 4, s, s);
    }
  }

  /** Zufaellige Position auf einer Deko-tauglichen Bodenkachel (oder null) */
  function decoPos(room, rnd, margin) {
    const m = margin || 8;
    for (let tries = 0; tries < 20; tries++) {
      const c = 1 + Math.floor(rnd() * (COLS - 2));
      const r = 1 + Math.floor(rnd() * (ROWS - 2));
      if (!decoAllowed(room, c, r)) continue;
      return { x: c * TILE + m + rnd() * (TILE - 2 * m), y: r * TILE + m + rnd() * (TILE - 2 * m), c, r };
    }
    return null;
  }

  /** Thematische Deko (deterministisch pro Raum, nur auf freien Bodenkacheln) */
  function drawDecor(g, room, theme, depth) {
    const seed = (room.cell.x * 73856093) ^ (room.cell.y * 19349663) ^ (depth * 83492791);
    const rnd = decoRng(seed);
    g.save();
    switch (theme.decor) {
      case 'notes': {
        // Vergessene Haftnotizen und Papierfetzen
        const cols = ['#e8d36a', '#e89ab0', '#8fc1e8', '#a8d98a'];
        const n = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          const p = decoPos(room, rnd, 14);
          if (!p) continue;
          g.save();
          g.translate(p.x, p.y);
          g.rotate((rnd() - 0.5) * 0.6);
          g.globalAlpha = 0.55;
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(-9, -7, 20, 20);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.fillRect(-10, -10, 20, 20);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(-7, -5, 14, 2);
          g.fillRect(-7, -1, 10, 2);
          g.fillRect(-7, 3, 12, 2);
          g.restore();
        }
        g.globalAlpha = 0.18;
        for (let i = 0; i < 4; i++) {
          const p = decoPos(room, rnd, 10);
          if (!p) continue;
          g.fillStyle = '#e9e1d6';
          g.fillRect(p.x, p.y, 8, 4);
          g.fillRect(p.x + 4, p.y + 4, 6, 4);
        }
        break;
      }
      case 'leaves': {
        // Forgotten Branches. Wurzeln als kleiner "git log --graph": ein Stamm mit Commit-Punkten, von dem
        // ein oder zwei Aeste abzweigen und nie wieder zusammenlaufen (nie gemergt eben).
        const TAU = Math.PI * 2;
        if (rnd() < 0.65) {
          const p0 = decoPos(room, rnd, 20);
          if (p0) {
            g.strokeStyle = 'rgba(70,45,25,0.45)';
            g.fillStyle = 'rgba(85,55,30,0.65)';
            g.lineWidth = 3;
            g.lineCap = 'round';
            g.lineJoin = 'round';
            const dir = p0.x < ROOM_W / 2 ? 1 : -1;
            const trunk = [];
            for (let k = 0; k < 5; k++) trunk.push([p0.x + k * 22 * dir, p0.y]);
            const line = (pts) => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); };
            line(trunk);
            const forks = 1 + Math.floor(rnd() * 2);
            for (let f = 0; f < forks; f++) {
              const [bx, by] = trunk[1 + f * 2];
              const up = (f % 2 === 0) === (rnd() < 0.5) ? -1 : 1;
              const pts = [[bx, by], [bx + 12 * dir, by + 16 * up], [bx + 34 * dir, by + 16 * up], [bx + 56 * dir, by + 16 * up]];
              line(pts);
              for (const [px, py] of pts.slice(2)) { g.beginPath(); g.arc(px, py, 4, 0, TAU); g.fill(); }
            }
            for (const [px, py] of trunk) { g.beginPath(); g.arc(px, py, 4, 0, TAU); g.fill(); }
          }
        }
        // Laub in Herbst- und Gruentoenen
        const LEAF = ['#6f9a3c', '#8bb34a', '#b59a3a', '#a3602c', '#4f7a30'];
        const n = 10 + Math.floor(rnd() * 8);
        for (let i = 0; i < n; i++) {
          const p = decoPos(room, rnd, 6);
          if (!p) continue;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(rnd() * TAU);
          g.globalAlpha = 0.5 + rnd() * 0.3;
          g.fillStyle = LEAF[Math.floor(rnd() * LEAF.length)];
          g.beginPath(); g.ellipse(0, 0, 6, 3.5, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(-5, -0.5, 10, 1);
          g.restore();
        }
        // Zweige mit kleiner Gabel
        g.strokeStyle = 'rgba(90,61,34,0.6)';
        g.lineWidth = 2;
        g.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const p = decoPos(room, rnd, 14);
          if (!p) continue;
          const a = rnd() * TAU;
          const ex = p.x + Math.cos(a) * 18, ey = p.y + Math.sin(a) * 18;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(ex, ey); g.stroke();
          const mx = (p.x + ex) / 2, my = (p.y + ey) / 2;
          g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(a + 0.7) * 8, my + Math.sin(a + 0.7) * 8); g.stroke();
        }
        // Gelegentlich ein Pilzgrueppchen
        if (rnd() < 0.5) {
          const p = decoPos(room, rnd, 12);
          if (p) {
            for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) {
              const mx = p.x + k * 9 - 6, my = p.y + (k % 2) * 4;
              g.fillStyle = '#e8dcc8'; g.fillRect(mx - 1, my, 3, 5);
              g.fillStyle = '#c0392b'; g.fillRect(mx - 4, my - 3, 9, 4);
              g.fillStyle = '#f4efe6'; g.fillRect(mx - 2, my - 2, 2, 1); g.fillRect(mx + 2, my - 3, 1, 1);
            }
          }
        }
        break;
      }
      case 'cobweb': {
        // Spinnweben in Innenecken
        g.strokeStyle = 'rgba(220,230,235,0.13)';
        g.lineWidth = 1.5;
        const corners = [[TILE, TILE, 1, 1], [ROOM_W - TILE, TILE, -1, 1], [TILE, ROOM_H - TILE, 1, -1], [ROOM_W - TILE, ROOM_H - TILE, -1, -1]];
        for (const [cx, cy, sx, sy] of corners) {
          if (rnd() < 0.45) continue;
          const len = 40 + rnd() * 30;
          for (let k = 0; k <= 4; k++) {
            const a = (k / 4) * (Math.PI / 2);
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * Math.cos(a) * len, cy + sy * Math.sin(a) * len); g.stroke();
          }
          for (let ring = 1; ring <= 3; ring++) {
            const rr = (len * ring) / 3.4;
            g.beginPath();
            for (let k = 0; k <= 4; k++) {
              const a = (k / 4) * (Math.PI / 2);
              const px = cx + sx * Math.cos(a) * rr, py = cy + sy * Math.sin(a) * rr;
              if (k === 0) g.moveTo(px, py); else g.quadraticCurveTo(cx + sx * Math.cos(a - 0.2) * rr * 0.85, cy + sy * Math.sin(a - 0.2) * rr * 0.85, px, py);
            }
            g.stroke();
          }
        }
        // Staubflusen
        g.fillStyle = 'rgba(200,210,215,0.06)';
        for (let i = 0; i < 6; i++) { const p = decoPos(room, rnd); if (p) g.fillRect(p.x, p.y, 6, 4); }
        break;
      }
      case 'embers': {
        // Gluehende Risse + Glutpunkte
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const p = decoPos(room, rnd, 16);
          if (!p) continue;
          const pts = [[p.x, p.y]];
          let a = rnd() * Math.PI * 2;
          for (let k = 0; k < 5; k++) {
            a += (rnd() - 0.5) * 1.4;
            const last = pts[pts.length - 1];
            pts.push([last[0] + Math.cos(a) * 14, last[1] + Math.sin(a) * 14]);
          }
          for (const [w, col] of [[10, 'rgba(255,110,30,0.10)'], [5, 'rgba(255,140,40,0.28)'], [2, 'rgba(255,210,100,0.7)']]) {
            g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
            g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
          }
        }
        for (let i = 0; i < 10; i++) {
          const p = decoPos(room, rnd, 4);
          if (!p) continue;
          g.fillStyle = rnd() < 0.5 ? 'rgba(255,150,50,0.35)' : 'rgba(255,90,30,0.25)';
          g.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
        }
        break;
      }
      case 'hazard': {
        // Warnstreifen vor den Tueren + Kabel
        for (const dir of Object.keys(room.doors)) {
          const d = DOOR_TILES[dir];
          const horiz = dir === 'up' || dir === 'down';
          const x0 = horiz ? d.col * TILE - 16 : (dir === 'left' ? TILE : ROOM_W - TILE - 12);
          const y0 = horiz ? (dir === 'up' ? TILE : ROOM_H - TILE - 12) : d.row * TILE - 16;
          const w = horiz ? TILE + 32 : 12, h = horiz ? 12 : TILE + 32;
          g.save();
          g.beginPath(); g.rect(x0, y0, w, h); g.clip();
          g.fillStyle = 'rgba(230,190,40,0.28)'; g.fillRect(x0, y0, w, h);
          g.fillStyle = 'rgba(15,10,10,0.45)';
          for (let k = -100; k < 140; k += 16) {
            g.beginPath();
            if (horiz) { g.moveTo(x0 + k, y0 + h); g.lineTo(x0 + k + 8, y0 + h); g.lineTo(x0 + k + 8 + h, y0); g.lineTo(x0 + k + h, y0); }
            else { g.moveTo(x0, y0 + k); g.lineTo(x0, y0 + k + 8); g.lineTo(x0 + w, y0 + k + 8 + w); g.lineTo(x0 + w, y0 + k + w); }
            g.fill();
          }
          g.restore();
        }
        g.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          const a = decoPos(room, rnd), b = decoPos(room, rnd);
          if (!a || !b) continue;
          for (const [w, col] of [[6, 'rgba(0,0,0,0.25)'], [4, rnd() < 0.5 ? 'rgba(40,40,46,0.8)' : 'rgba(90,30,30,0.7)']]) {
            g.strokeStyle = col; g.lineWidth = w;
            g.beginPath(); g.moveTo(a.x, a.y); g.bezierCurveTo(a.x + 80, a.y - 40, b.x - 80, b.y + 40, b.x, b.y); g.stroke();
          }
        }
        break;
      }
      case 'glyphs': {
        // Verstreute Zeichen ("Trainingsdaten")
        const chars = ['0', '1', '{', '}', ';', '+1', 'lol', '?!', '#', '//', '==', 'tl;dr', '[]', 'nan'];
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < 18; i++) {
          const p = decoPos(room, rnd, 12);
          if (!p) continue;
          g.font = 'bold ' + (12 + Math.floor(rnd() * 3) * 4) + 'px ' + B.FONT;
          g.fillStyle = 'rgba(160,230,130,' + (0.05 + rnd() * 0.06) + ')';
          g.fillText(chars[Math.floor(rnd() * chars.length)], p.x, p.y);
        }
        break;
      }
      case 'stars': {
        // Sterne (Einbettungen) + ein Sternbild
        for (let i = 0; i < 50; i++) {
          const p = decoPos(room, rnd, 2);
          if (!p) continue;
          g.fillStyle = 'rgba(220,210,255,' + (0.12 + rnd() * 0.3) + ')';
          const s = rnd() < 0.85 ? 2 : 4;
          g.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, s, s);
        }
        // Sternbild: Kette aus nahe beieinander liegenden Sternen (max. ~140 px Abstand)
        const pts = [];
        const first = decoPos(room, rnd, 20);
        if (first) pts.push(first);
        for (let tries = 0; tries < 30 && pts.length && pts.length < 5; tries++) {
          const p = decoPos(room, rnd, 20);
          const last = pts[pts.length - 1];
          if (p && Math.hypot(p.x - last.x, p.y - last.y) < 140 && Math.hypot(p.x - last.x, p.y - last.y) > 40) pts.push(p);
        }
        g.strokeStyle = 'rgba(190,170,255,0.12)'; g.lineWidth = 1.5;
        g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
        for (const p of pts) {
          g.fillStyle = 'rgba(230,220,255,0.5)';
          g.fillRect(p.x - 1, p.y - 5, 2, 10); g.fillRect(p.x - 5, p.y - 1, 10, 2);
        }
        break;
      }
      case 'glitch': {
        // Verschobene Farbstreifen ("undefiniertes Verhalten")
        for (let i = 0; i < 9; i++) {
          const p = decoPos(room, rnd, 0);
          if (!p) continue;
          const w = 16 + rnd() * 80, h = 2 + Math.floor(rnd() * 3) * 2;
          g.fillStyle = rnd() < 0.5 ? 'rgba(255,60,170,0.18)' : 'rgba(60,230,230,0.15)';
          g.fillRect(p.x, p.y, w, h);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(p.x + 6, p.y + h, w * 0.6, 2);
        }
        break;
      }
      case 'null': {
        // Fast nichts. Nur ein paar verlorene Bits.
        for (let i = 0; i < 14; i++) {
          const p = decoPos(room, rnd, 2);
          if (!p) continue;
          g.fillStyle = 'rgba(255,255,255,' + (0.03 + rnd() * 0.05) + ')';
          g.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
        }
        break;
      }
      case 'fog': {
        // Verblassende Erinnerungen an frueheren Kontext
        const lines = ['[...]', '(truncated)', 'as I said earlier', 'previously:', '<summary>', '...where was I?', '[context compacted]'];
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < 5; i++) {
          const p = decoPos(room, rnd, 24);
          if (!p) continue;
          g.font = (rnd() < 0.5 ? 'italic ' : '') + '14px ' + B.FONT;
          g.fillStyle = 'rgba(200,220,255,' + (0.05 + rnd() * 0.05) + ')';
          g.fillText(lines[Math.floor(rnd() * lines.length)], p.x, p.y);
        }
        for (let i = 0; i < 3; i++) {
          const p = decoPos(room, rnd, 0);
          if (!p) continue;
          const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 120);
          grd.addColorStop(0, 'rgba(210,230,255,0.06)');
          grd.addColorStop(1, 'rgba(210,230,255,0)');
          g.fillStyle = grd;
          g.fillRect(p.x - 120, p.y - 120, 240, 240);
        }
        break;
      }
      default: break;
    }
    g.restore();
  }

  /** Abgerundetes Rechteck als Pfad */
  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /** Teppich (Schatzraum, Shop) — Pixel-Stil mit Borduere und Fransen */
  function drawRug(g, x, y, w, h, base, border, pattern) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + 4, y + 6, w, h);
    g.fillStyle = border;
    g.fillRect(x, y, w, h);
    g.fillStyle = base;
    g.fillRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = pattern;
    for (let k = x + 16; k < x + w - 16; k += 16) {
      g.fillRect(k, y + 12, 8, 4);
      g.fillRect(k, y + h - 16, 8, 4);
    }
    // Rauten in der Mitte
    const cx = x + w / 2, cy = y + h / 2;
    for (let s = Math.min(w, h) / 2 - 18; s > 4; s -= 12) {
      g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.4, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 1.4, cy); g.closePath();
      g.strokeStyle = pattern; g.lineWidth = 3; g.stroke();
    }
    // Fransen
    g.fillStyle = border;
    for (let k = y + 4; k < y + h - 4; k += 8) { g.fillRect(x - 6, k, 6, 4); g.fillRect(x + w, k, 6, 4); }
  }

  /** Deko je Raumtyp (Teppiche, Kratzspuren, Toenung) */
  function drawRoomTypeDecor(g, room, theme, depth) {
    const cx = ROOM_W / 2, cy = ROOM_H / 2;
    switch (room.type) {
      case 'treasure':
        drawRug(g, cx - 96, cy - 64, 192, 128, '#6b1f2a', '#c9a227', 'rgba(242,193,78,0.55)');
        break;
      case 'shop':
        drawRug(g, 3 * TILE + 8, 3 * TILE - 8, 8 * TILE - 16, TILE + 16 + 32, '#1f4a33', '#7a5c2e', 'rgba(123,201,111,0.35)');
        break;
      case 'boss': {
        // Rote Toenung und Kratzspuren
        g.fillStyle = 'rgba(120,10,10,0.10)';
        g.fillRect(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE);
        const rnd = decoRng(depth * 999 + 7);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 4; i++) {
          const p = decoPos(room, rnd, 16);
          if (!p) continue;
          for (let k = 0; k < 3; k++) for (let s = 0; s < 8; s++) g.fillRect(p.x + k * 8 + s * 2, p.y + s * 4, 2, 4);
        }
        break;
      }
      case 'secret':
        g.fillStyle = 'rgba(120,80,200,0.10)';
        g.fillRect(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE);
        break;
      default: break;
    }
  }

  /** Taste als "aufgemalte" Kappe (Steuerungshinweise im Startraum) */
  function drawKeycap(g, x, y, label, w) {
    const kw = w || 36, kh = 34;
    g.fillStyle = 'rgba(243,236,230,0.07)';
    roundRectPath(g, x - kw / 2, y - kh / 2 + 4, kw, kh, 6); g.fill();
    g.fillStyle = 'rgba(243,236,230,0.12)';
    roundRectPath(g, x - kw / 2, y - kh / 2, kw, kh - 4, 6); g.fill();
    g.strokeStyle = 'rgba(243,236,230,0.22)'; g.lineWidth = 2;
    roundRectPath(g, x - kw / 2, y - kh / 2, kw, kh - 4, 6); g.stroke();
    B.text(g, label, x, y - 2, { size: 16, align: 'center', baseline: 'middle', color: 'rgba(243,236,230,0.4)', shadow: false });
  }

  /** Steuerungshinweise auf dem Boden des Startraums von Etage 1 (Hommage) */
  function drawControlHints(g) {
    const dim = { size: 15, align: 'center', color: 'rgba(243,236,230,0.3)', shadow: false };
    // WASD-Cluster links
    const lx = 250, ly = 168;
    drawKeycap(g, lx, ly - 38, 'W');
    drawKeycap(g, lx - 40, ly, 'A'); drawKeycap(g, lx, ly, 'S'); drawKeycap(g, lx + 40, ly, 'D');
    B.text(g, 'move', lx, ly + 28, dim);
    // Pfeiltasten-Cluster rechts
    const rx = 710, ry = 168;
    drawKeycap(g, rx, ry - 38, '↑');
    drawKeycap(g, rx - 40, ry, '←'); drawKeycap(g, rx, ry, '↓'); drawKeycap(g, rx + 40, ry, '→');
    B.text(g, 'shoot tokens', rx, ry + 28, dim);
    // Untere Reihe
    const by = 440;
    drawKeycap(g, 190, by, 'E'); B.text(g, 'git push --force', 190, by + 22, dim);
    drawKeycap(g, 400, by, 'SPACE', 84); B.text(g, 'use item', 400, by + 22, dim);
    drawKeycap(g, 580, by, 'ESC', 50); B.text(g, 'pause', 580, by + 22, dim);
    drawKeycap(g, 690, by, 'M'); B.text(g, 'mute', 690, by + 22, dim);
    drawKeycap(g, 790, by, 'R'); B.text(g, 'hold: restart', 790, by + 22, dim);
  }

  // ===========================================================================
  // Hindernisse
  // ===========================================================================

  const PIT = { K: '#120d0b', w: '#3b2f28', v: '#241c18', x: '#060405', r: '#4d4038' };

  /**
   * Grube mit "Autotiling": Einzelne Gruben nutzen das Sprite tile_pit; zusammenhaengende Gruben werden
   * prozedural im selben Stil gezeichnet (gleiche Farben), wobei Kanten nur dort entstehen, wo keine
   * Nachbargrube liegt. So sehen Grubenfelder wie ein grosses Loch aus.
   */
  function drawPit(g, room, c, r) {
    const x = c * TILE, y = r * TILE;
    const isPit = (cc, rr) => room.tileAt(cc, rr) === T.PIT;
    const up = isPit(c, r - 1), down = isPit(c, r + 1), left = isPit(c - 1, r), right = isPit(c + 1, r);
    if (!(up || down || left || right) && B.hasSprite('tile_pit')) {
      B.drawSprite(g, 'tile_pit', x + TILE / 2, y + TILE / 2);
      return;
    }
    const P = 4; // ein Kunstpixel = 4 logische Pixel
    // Ecken bleiben transparent (abgerundet), wenn beide angrenzenden Seiten offen sind
    const tl = !up && !left, tr = !up && !right, bl = !down && !left, br = !down && !right;
    // Tiefe (schwarz), ohne transparente Ecken
    g.fillStyle = PIT.x;
    g.fillRect(x + P, y, TILE - 2 * P, TILE);
    g.fillRect(x, y + P, P, TILE - 2 * P);
    g.fillRect(x + TILE - P, y + P, P, TILE - 2 * P);
    if (!tl) g.fillRect(x, y, P, P);
    if (!tr) g.fillRect(x + TILE - P, y, P, P);
    if (!bl) g.fillRect(x, y + TILE - P, P, P);
    if (!br) g.fillRect(x + TILE - P, y + TILE - P, P, P);
    // Seitenkanten
    g.fillStyle = PIT.K;
    if (!left) g.fillRect(x, y + (tl ? P : 0), P, TILE - (tl ? P : 0) - (bl ? P : 0));
    if (!right) g.fillRect(x + TILE - P, y + (tr ? P : 0), P, TILE - (tr ? P : 0) - (br ? P : 0));
    const x0 = x + (left ? 0 : P), x1 = x + TILE - (right ? 0 : P);
    // Hintere Innenwand (oben sichtbar, weil wir schraeg von oben schauen)
    if (!up) {
      g.fillStyle = PIT.K; g.fillRect(x + (tl ? P : 0), y, TILE - (tl ? P : 0) - (tr ? P : 0), P);
      g.fillStyle = PIT.w; g.fillRect(x0, y + P, x1 - x0, 2 * P);
      g.fillStyle = PIT.v; g.fillRect(x0, y + 3 * P, x1 - x0, 2 * P);
    }
    // Vordere Kante (unten): helle Lippe
    if (!down) {
      g.fillStyle = PIT.r;
      g.fillRect(x + (bl ? 2 * P : 0), y + TILE - P, TILE - (bl ? 2 * P : 0) - (br ? 2 * P : 0), P);
      if (bl) { g.fillRect(x + P, y + TILE - 2 * P, P, P); g.fillStyle = PIT.K; g.fillRect(x + P, y + TILE - P, P, P); g.fillStyle = PIT.r; }
      if (br) { g.fillRect(x + TILE - 2 * P, y + TILE - 2 * P, P, P); g.fillStyle = PIT.K; g.fillRect(x + TILE - 2 * P, y + TILE - P, P, P); }
    }
  }

  function drawObstacle(g, room, c, r, t, theme) {
    const x = c * TILE, y = r * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
    if (t === T.PIT) { drawPit(g, room, c, r); return; }
    if (t === T.PROP) return; // zerstoerbare Objekte werden pro Frame gezeichnet (drawProps: Wackeln, Risse)
    const spriteName = { [T.ROCK]: 'tile_rock', [T.BLOCK]: 'tile_block', [T.SPIKES]: 'tile_spikes' }[t];
    if (spriteName && B.hasSprite(spriteName)) {
      // Variante deterministisch pro Kachel und Raum
      const n = Math.max(1, B.spriteFrameCount(spriteName));
      const salt = room.cell ? room.cell.x * 5 + room.cell.y * 11 : 0;
      B.drawSprite(g, spriteName, cx, cy, { frame: Math.floor(tileNoise(c, r, salt) * n) });
      if (t === T.BLOCK) {
        // Block fuellt die ganze Kachel -> Toenung in Wandfarbe des Themas passt ihn an die Etage an
        g.save();
        g.globalAlpha = 0.32;
        g.fillStyle = theme.wall;
        g.fillRect(x, y, TILE, TILE);
        g.restore();
      }
      return;
    }
    // Prozeduraler Notfall-Fallback (falls Sprites fehlen)
    g.fillStyle = t === T.ROCK ? '#8a8178' : t === T.BLOCK ? '#4b5560' : '#b8b2aa';
    g.fillRect(x + 8, y + 8, TILE - 16, TILE - 16);
  }

  // ===========================================================================
  // Waende
  // ===========================================================================

  /**
   * Efeu (Forgotten Branches): Ranken haengen von der oberen Mauerkrone, kleinere Buesche an den
   * Seitenwaenden. Deterministisch pro Raum; Tueroeffnungen bleiben frei.
   */
  function drawIvy(g, room) {
    const salt = room.cell ? room.cell.x * 31 + room.cell.y * 17 : 0;
    const cols = ['#4f7a30', '#6f9a3c', '#3e6426', '#86ad4a'];
    const leaf = (x, y, k) => {
      const col = cols[Math.floor(tileNoise(Math.round(x), Math.round(y), salt + 3) * cols.length)];
      g.fillStyle = col;
      if (k % 2) { g.fillRect(x - 4, y - 2, 7, 4); g.fillRect(x - 2, y - 3, 3, 6); }
      else { g.fillRect(x - 3, y - 2, 6, 5); g.fillRect(x - 1, y - 4, 3, 2); }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x - 1, y, 2, 1);
    };
    const doorX = 7 * TILE, doorY = 4 * TILE;
    // Moosflecken auf den Ziegeln des Wandrings
    for (let y = 0; y < ROOM_H; y += 16) {
      for (let x = 0; x < ROOM_W; x += 16) {
        const inWall = y < TILE - 10 || y >= ROOM_H - TILE + 10 || x < TILE - 10 || x >= ROOM_W - TILE + 10;
        if (!inWall || tileNoise(x, y, salt + 9) < 0.78) continue;
        g.fillStyle = 'rgba(95,140,55,0.22)';
        g.fillRect(x + 2, y + 6, 12, 8);
        g.fillRect(x + 6, y + 3, 6, 3);
      }
    }
    // Oben: haengende Ranken, leicht geschwungen, unregelmaessig verteilt und unterschiedlich lang
    for (let x = TILE + 6; x < ROOM_W - TILE - 6; x += 18) {
      if (x > doorX - 24 && x < doorX + TILE + 24) continue;
      const n = tileNoise(x, 1, salt);
      if (n < 0.5) continue;
      const len = 8 + Math.floor(n * n * 46);
      let k = 0;
      for (let y = TILE - 18; y < TILE - 18 + len; y += 3, k++) {
        const sway = Math.round(Math.sin(y * 0.25 + x) * 2);
        g.fillStyle = 'rgba(45,75,28,0.9)';
        g.fillRect(x + sway, y, 2, 3);
        if (k % 3 === 1) leaf(x + sway + (k % 6 === 1 ? 4 : -3), y, k);
      }
    }
    // Unten und an den Seiten: Bueschel an der Mauerkrone
    const tuft = (x, y) => { for (let k = 0; k < 5; k++) leaf(x + (k - 2) * 4, y + (k % 2) * 3 - (k === 2 ? 3 : 0), k); };
    for (let x = TILE + 12; x < ROOM_W - TILE; x += 36) {
      if (x > doorX - 20 && x < doorX + TILE + 20) continue;
      if (tileNoise(x, 9, salt) > 0.55) tuft(x, ROOM_H - TILE + 4);
    }
    for (let y = TILE + 16; y < ROOM_H - TILE; y += 36) {
      if (y > doorY - 20 && y < doorY + TILE + 20) continue;
      if (tileNoise(1, y, salt) > 0.55) tuft(TILE - 4, y);
      if (tileNoise(14, y, salt) > 0.55) tuft(ROOM_W - TILE + 4, y);
    }
  }

  function drawWalls(g, theme, room) {
    // Grundflaeche des Wandrings
    g.fillStyle = theme.wall;
    g.fillRect(0, 0, ROOM_W, TILE);
    g.fillRect(0, ROOM_H - TILE, ROOM_W, TILE);
    g.fillRect(0, 0, TILE, ROOM_H);
    g.fillRect(ROOM_W - TILE, 0, TILE, ROOM_H);

    // Ziegel (32 x 16, versetzt) mit Lichtkante und leichter Farbvariation
    const inWall = (x, y) => y < TILE - 10 || y >= ROOM_H - TILE + 10 || x < TILE - 10 || x >= ROOM_W - TILE + 10;
    for (let y = 0; y < ROOM_H; y += 16) {
      const row = y / 16;
      const off = row % 2 === 0 ? 0 : 16;
      for (let x = -off; x < ROOM_W; x += 32) {
        if (!inWall(x + 16, y + 8)) continue;
        const v = tileNoise(x, y, 77);
        if (v > 0.6) { g.fillStyle = 'rgba(255,255,255,' + (v - 0.6) * 0.08 + ')'; g.fillRect(x, y, 32, 16); }
        else if (v < 0.25) { g.fillStyle = 'rgba(0,0,0,' + (0.25 - v) * 0.4 + ')'; g.fillRect(x, y, 32, 16); }
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(x + 2, y + 2, 28, 2);
        g.fillStyle = theme.wallDark;
        g.fillRect(x, y, 2, 16);
        g.fillRect(x, y, 32, 2);
      }
    }

    // Aeussere Abdunklung (Tiefe nach aussen)
    const edge = (x0, y0, x1, y1, w, h) => {
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
    };
    edge(0, 0, 0, 40, ROOM_W, 40);
    edge(0, ROOM_H, 0, ROOM_H - 40, ROOM_W, 40);
    edge(0, 0, 40, 0, 40, ROOM_H);
    edge(ROOM_W, 0, ROOM_W - 40, 0, 40, ROOM_H);

    // Mauerkrone: 10-px-Band an der Innenkante mit Lichtlinie (gibt den Waenden Volumen)
    const ix0 = TILE - 10, iy0 = TILE - 10, iw = ROOM_W - 2 * TILE + 20, ih = ROOM_H - 2 * TILE + 20;
    g.fillStyle = theme.wallTop;
    g.fillRect(ix0, iy0, iw, 10);
    g.fillRect(ix0, ROOM_H - TILE, iw, 10);
    g.fillRect(ix0, iy0, 10, ih);
    g.fillRect(ROOM_W - TILE, iy0, 10, ih);
    g.fillStyle = theme.wallLight;
    g.fillRect(ix0, iy0, iw, 2);                       // obere Kante (Licht von oben)
    g.fillRect(ix0, iy0, 2, ih);
    g.fillRect(ix0 + 8, TILE - 2, iw - 16, 2);         // Innenkante oben
    g.fillStyle = theme.wallDark;
    g.fillRect(ix0, ROOM_H - TILE + 8, iw, 2);
    g.fillRect(ROOM_W - TILE + 8, iy0, 2, ih);

    // Ecken etwas dunkler (dort trifft am wenigsten Licht hin)
    for (const [px, py] of [[0, 0], [ROOM_W - TILE, 0], [0, ROOM_H - TILE], [ROOM_W - TILE, ROOM_H - TILE]]) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(px, py, TILE, TILE);
    }

    // Schatten der Waende auf dem Boden (Ambient Occlusion), oben am staerksten
    const ao = (x0, y0, x1, y1, w, h, a) => {
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, 'rgba(0,0,0,' + a + ')');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
    };
    ao(0, TILE, 0, TILE + 34, ROOM_W, 34, 0.42);
    ao(0, ROOM_H - TILE, 0, ROOM_H - TILE - 16, ROOM_W, 16, 0.2);
    ao(TILE, 0, TILE + 24, 0, 24, ROOM_H, 0.3);
    ao(ROOM_W - TILE, 0, ROOM_W - TILE - 24, 0, 24, ROOM_H, 0.3);

    // Versteckte Geheimtueren: Risse als Hinweis (statisch -> im Bake).
    // Balance-Pass 2026-10-31: Vorher 2-px-Punkte mit 45 % Deckkraft, auf der dunklen Wand praktisch
    // unsichtbar. Jetzt etwas groesser, dunkler und mit kurzem Seitenast — soll aufmerksamen Spielern
    // auffallen, aber weiterhin wie ein Riss aussehen und nicht wie eine Markierung.
    for (const dir of Object.keys(room.doors)) {
      const door = room.doors[dir];
      if (!door.edge.hidden) continue;
      const d = DOOR_TILES[dir];
      g.save();
      g.translate(d.col * TILE + TILE / 2, d.row * TILE + TILE / 2);
      g.rotate(DOOR_ANGLE[dir]);
      const crack = [[-14, 16], [-12, 12], [-10, 8], [-7, 7], [-4, 4], [-1, 1], [2, 2], [5, -1], [8, 1], [11, -1], [14, 0]];
      const branch = [[-4, 7], [-2, 10], [0, 12]]; // Seitenast nach unten
      const pts = crack.concat(branch);
      g.fillStyle = 'rgba(0,0,0,0.65)';
      for (const [px, py] of pts) g.fillRect(px, py + 12, 3, 3);
      g.fillStyle = 'rgba(255,255,255,0.1)'; // Lichtkante unter dem Riss
      for (const [px, py] of pts) g.fillRect(px + 2, py + 15, 2, 2);
      g.restore();
    }
  }

  // ===========================================================================
  // Tueren (pro Frame gezeichnet, damit die Fluegel animiert schliessen/oeffnen)
  // ===========================================================================

  const DOOR_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

  // Farbschema je Tuerart: Rahmen, Rahmenlicht, Fluegel, Glut im Durchgang
  const DOOR_STYLE = {
    normal:   { frame: null, light: null, leaf: '#4a3a2c', leafDark: '#2e241b', glow: null },
    boss:     { frame: '#6e1a1a', light: '#b8403a', leaf: '#4a1414', leafDark: '#2a0909', glow: 'rgba(255,60,40,' },
    treasure: { frame: '#a8841c', light: '#f2d36b', leaf: '#6a5320', leafDark: '#3e3010', glow: 'rgba(255,210,90,' },
    shop:     { frame: '#2f7047', light: '#7bc96f', leaf: '#2e5a3a', leafDark: '#1a3522', glow: 'rgba(120,220,140,' },
    secret:   { frame: null, light: null, leaf: '#3a3046', leafDark: '#221c2a', glow: 'rgba(170,130,255,' },
  };

  // Animationszustand der Tuerfluegel pro Raum (0 = offen, 1 = zu); WeakMap -> kein Leck beim Etagenwechsel
  const doorAnim = new WeakMap();

  /** Rotiert einen lokalen Tuerpunkt in Raumkoordinaten (fuer aufrecht gezeichnete Symbole) */
  function doorPoint(dir, lx, ly) {
    const d = DOOR_TILES[dir];
    const a = DOOR_ANGLE[dir];
    const cx = d.col * TILE + TILE / 2, cy = d.row * TILE + TILE / 2;
    return { x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a) };
  }

  /** Vorhaengeschloss (aufrecht) */
  function drawPadlock(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(x - 9, y - 2, 20, 18);
    g.strokeStyle = '#b8b2aa'; g.lineWidth = 4;
    g.beginPath(); g.arc(x, y - 4, 7, Math.PI, 0); g.stroke();
    g.fillStyle = '#f2c14e'; g.fillRect(x - 10, y - 4, 20, 16);
    g.fillStyle = '#fff0b0'; g.fillRect(x - 10, y - 4, 20, 3);
    g.fillStyle = '#a8841c'; g.fillRect(x - 10, y + 9, 20, 3);
    g.fillStyle = '#3a2a10'; g.fillRect(x - 2, y + 1, 4, 7);
  }

  function drawDoor(g, room, dir, door, theme, closedK) {
    const kind = door.edge.kind;
    if (door.edge.hidden) return; // Risse sind im Bake
    const st = DOOR_STYLE[kind] || DOOR_STYLE.normal;
    const d = DOOR_TILES[dir];
    const cx = d.col * TILE + TILE / 2, cy = d.row * TILE + TILE / 2;
    const now = performance.now() / 1000;
    g.save();
    g.translate(cx, cy);
    g.rotate(DOOR_ANGLE[dir]);
    // Lokales System: Durchgang zeigt nach +y (in den Raum), Innenkante der Wand liegt bei y = +32

    if (kind === 'secret') {
      // Aufgesprengtes Loch statt Rahmen: unregelmaessiger Rand, Truemmer
      g.fillStyle = '#050304';
      g.beginPath();
      g.moveTo(-22, 32); g.lineTo(-24, 14); g.lineTo(-18, 2); g.lineTo(-20, -10); g.lineTo(-8, -16); g.lineTo(2, -12);
      g.lineTo(12, -18); g.lineTo(22, -8); g.lineTo(20, 6); g.lineTo(25, 18); g.lineTo(22, 32); g.closePath();
      g.fill();
      g.fillStyle = 'rgba(170,130,255,0.12)';
      g.fillRect(-16, 10, 32, 22);
      g.fillStyle = theme.wallLight;
      for (const [px, py, s] of [[-28, 24, 6], [24, 26, 6], [-26, -4, 4], [26, 10, 4], [14, -22, 4], [-14, -20, 4]]) g.fillRect(px, py, s, s);
      g.restore();
      return;
    }

    // Rahmen
    const frame = st.frame || theme.door;
    const light = st.light || theme.wallLight;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-36, -24, 72, 58);
    g.fillStyle = frame;
    g.fillRect(-34, -26, 68, 58);
    g.fillStyle = light;
    g.fillRect(-34, -26, 68, 3);
    g.fillRect(-34, -26, 3, 58);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(31, -26, 3, 58);
    // Steinfugen im Rahmen
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const fy of [-8, 10]) { g.fillRect(-34, fy, 12, 2); g.fillRect(22, fy, 12, 2); }

    // Durchgang (dunkel, zur Raumseite hin leicht heller)
    const grd = g.createLinearGradient(0, -16, 0, 32);
    grd.addColorStop(0, '#020101');
    grd.addColorStop(1, '#1a1411');
    g.fillStyle = grd;
    g.fillRect(-22, -16, 44, 48);
    if (st.glow) {
      const pulse = 0.18 + 0.08 * Math.sin(now * 3);
      g.fillStyle = st.glow + pulse + ')';
      g.fillRect(-22, -16, 44, 48);
    }

    // Art-spezifische Verzierungen
    if (kind === 'boss') {
      // Hoerner + Zaehne
      g.fillStyle = '#e8e0d0';
      g.beginPath(); g.moveTo(-34, -18); g.lineTo(-46, -30); g.lineTo(-30, -26); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(34, -18); g.lineTo(46, -30); g.lineTo(30, -26); g.closePath(); g.fill();
      for (let tx = -20; tx < 20; tx += 8) {
        g.beginPath(); g.moveTo(tx, -16); g.lineTo(tx + 8, -16); g.lineTo(tx + 4, -8); g.closePath(); g.fill();
      }
    } else if (kind === 'treasure') {
      // Edelstein-Schlussstein
      g.fillStyle = '#5b8def';
      g.beginPath(); g.moveTo(0, -30); g.lineTo(8, -22); g.lineTo(0, -14); g.lineTo(-8, -22); g.closePath(); g.fill();
      g.fillStyle = '#d6e4ff'; g.fillRect(-2, -26, 4, 4);
    }

    // Fluegel (schliessen sich von den Seiten); verschlossene Tueren sind immer zu
    const k = door.edge.locked ? 1 : closedK;
    if (k > 0.001) {
      const lw = 22 * k;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -22 : 22 - lw;
        g.fillStyle = st.leaf;
        g.fillRect(x0, -16, lw, 48);
        g.fillStyle = st.leafDark;
        // Bretter / Gitterstaebe
        for (let bx = 4; bx < lw; bx += 7) g.fillRect(side < 0 ? x0 + bx : x0 + lw - bx - 2, -16, 2, 48);
        g.fillRect(x0, 0, lw, 3);
        g.fillRect(x0, 20, lw, 3);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x0, -16, lw, 2);
      }
      if (k > 0.98) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-1, -16, 2, 48); }
    }
    // Schwelle (Lichtkante zum Raum)
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(-22, 30, 44, 2);
    g.restore();

    // Aufrechte Symbole (nicht mitrotieren, damit sie lesbar bleiben)
    if (door.edge.locked) {
      const p = doorPoint(dir, 0, 6);
      // Kette quer ueber die Fluegel
      g.save();
      g.translate(cx, cy); g.rotate(DOOR_ANGLE[dir]);
      g.fillStyle = '#8a857e';
      for (let tx = -20; tx < 20; tx += 6) g.fillRect(tx, 4 + ((tx / 6) % 2 ? 1 : -1), 5, 3);
      g.restore();
      drawPadlock(g, p.x, p.y);
    }
    if (kind === 'shop') {
      // Schild mit Cent-Zeichen
      // Seitentueren: Schild ueber der Tuer (sonst ragt es aus dem Bild); oben/unten: im Rahmen
      const p = dir === 'left' || dir === 'right' ? { x: cx, y: cy - 46 } : doorPoint(dir, 0, -20);
      g.fillStyle = '#1a3522'; g.fillRect(p.x - 11, p.y - 10, 22, 20);
      g.fillStyle = '#7bc96f'; g.fillRect(p.x - 11, p.y - 10, 22, 2);
      B.text(g, '¢', p.x, p.y + 1, { size: 16, align: 'center', baseline: 'middle', color: '#c8f0b8', shadow: false });
    }
  }

  function updateDoorAnim(room) {
    let st = doorAnim.get(room);
    const target = room.combatClosed ? 1 : 0;
    // Start immer offen: Betritt man einen Kampfraum, knallen die Tueren sichtbar zu
    if (!st) { st = { k: 0 }; doorAnim.set(room, st); }
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(0, now - (st.t || now)));
    st.t = now;
    // ~0.15 s zum Schliessen (Knall!), ~0.25 s zum Oeffnen
    const speed = target > st.k ? 7 : 4;
    st.k = target > st.k ? Math.min(target, st.k + speed * dt) : Math.max(target, st.k - speed * dt);
    return st.k;
  }

  // ===========================================================================
  // Bake
  // ===========================================================================

  function bakeBackground(room, depth) {
    const scale = B.renderScale || 1;
    if (!room.bgCanvas) room.bgCanvas = document.createElement('canvas');
    const cv = room.bgCanvas;
    cv.width = Math.ceil(ROOM_W * scale);
    cv.height = Math.ceil(ROOM_H * scale);
    const g = cv.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.imageSmoothingEnabled = false;
    const theme = B.themeFor(depth);

    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) drawFloorTile(g, c, r, theme, depth);
    if (!(room.type === 'start' && depth === 1)) drawDecor(g, room, theme, depth);
    drawRoomTypeDecor(g, room, theme, depth);
    if (room.type === 'start' && depth === 1) drawControlHints(g);

    // Weicher Lichtkegel in der Raummitte
    const lg = g.createRadialGradient(ROOM_W / 2, ROOM_H / 2, 40, ROOM_W / 2, ROOM_H / 2, ROOM_W * 0.55);
    lg.addColorStop(0, theme.light);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.fillRect(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE);

    drawWalls(g, theme, room);
    if (theme.wallDecor === 'ivy') drawIvy(g, room);

    // Hindernisse (nach den Waenden, damit Wand-Schatten darunter liegen)
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const t = room.tileAt(c, r);
        if (t !== T.FLOOR) drawObstacle(g, room, c, r, t, theme);
      }
    }
    room.bgDirty = false;
    room.bgScale = scale;
  }

  // ===========================================================================
  // Raum + Entities
  // ===========================================================================

  function drawShadow(ctx, e) {
    if (e.noShadow) return;
    const lift = e.flying ? 10 : 0;
    // Zwei Ellipsen: weicher Rand + dunklerer Kern
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.75 + lift, e.r * 1.0, e.r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.75 + lift, e.r * 0.72, e.r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Zeichnet einen Raum in Raumkoordinaten. withPlayer = Spieler & Begleiter mitzeichnen */
  function drawRoom(ctx, room, game, withPlayer) {
    if (room.bgDirty || room.bgScale !== (B.renderScale || 1) || !room.bgCanvas) bakeBackground(room, game.depth);
    ctx.drawImage(room.bgCanvas, 0, 0, ROOM_W, ROOM_H);

    // Tueren (animiert)
    const theme = B.themeFor(game.depth);
    const k = updateDoorAnim(room);
    for (const dir of Object.keys(room.doors)) drawDoor(ctx, room, dir, room.doors[dir], theme, k);

    drawProps(ctx, room);

    const list = [];
    for (const p of room.pickups) list.push(p);
    for (const e of room.enemies) list.push(e);
    if (withPlayer) {
      for (const f of game.followers) list.push(f);
      if (game.player && !game.player.dead) list.push(game.player);
    }
    for (const e of list) drawShadow(ctx, e);
    list.sort((a, b) => (a.drawLayer || 0) - (b.drawLayer || 0) || a.y - b.y);
    for (const e of list) e.draw(ctx, game);

    if (game.player && game.player.flags.showHp) for (const e of room.enemies) e.drawHpBar(ctx);
    for (const p of room.projectiles) p.draw(ctx, game);
    for (const fx of room.effects) fx.draw(ctx, game);
    if (theme.ambient === 'fireflies') drawFireflies(ctx, room);
  }

  /**
   * Zerstoerbare Objekte (Kacheltyp PROP): Schatten, Sprite 'prop_<art>' (Frame 1 = beschaedigt ab 50 % HP),
   * kurzes Wackeln und Aufblitzen nach einem Treffer (prop.hitAt, nur Optik).
   */
  function drawProps(ctx, room) {
    if (!room.props || !room.props.size) return;
    const now = performance.now() / 1000;
    for (const [key, pr] of room.props) {
      const i = key.indexOf(',');
      const c = +key.slice(0, i), r = +key.slice(i + 1);
      if (room.tileAt(c, r) !== T.PROP) continue;
      const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
      const since = now - (pr.hitAt || -1);
      const dx = since < 0.15 ? Math.sin(since * 90) * 3 * (1 - since / 0.15) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 24, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
      const name = 'prop_' + pr.kind;
      if (B.hasSprite(name)) {
        B.drawSprite(ctx, name, cx + dx, cy, { frame: pr.hp < pr.max * 0.5 ? 1 : 0, flash: since < 0.06 });
      } else {
        ctx.fillStyle = '#8a6a44';
        ctx.fillRect(cx - 24 + dx, cy - 24, 48, 48);
      }
    }
  }

  /**
   * Gluehwuermchen (Forgotten Branches): 7 Lichtpunkte auf langsamen Lissajous-Bahnen, die sanft
   * auf- und abblenden. Nur Optik; Zeit aus performance.now(), Bahnen deterministisch pro Raum.
   */
  function drawFireflies(ctx, room) {
    const t = performance.now() / 1000;
    const salt = room.cell ? room.cell.x * 13 + room.cell.y * 7 : 0;
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const a = tileNoise(i, salt, 51), b = tileNoise(salt, i, 52);
      const x = TILE + 30 + (0.5 + 0.45 * Math.sin(t * (0.13 + a * 0.12) + i * 2.1)) * (ROOM_W - 2 * TILE - 60);
      const y = TILE + 30 + (0.5 + 0.45 * Math.sin(t * (0.17 + b * 0.1) + i * 1.3)) * (ROOM_H - 2 * TILE - 60);
      const glow = Math.max(0, Math.sin(t * (0.9 + a) + i * 1.7));
      if (glow < 0.05) continue;
      ctx.globalAlpha = 0.25 * glow;
      ctx.fillStyle = '#d8ff8a';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85 * glow;
      ctx.fillStyle = '#f4ffd0';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Vignette (gecacht pro Skalierung und Thema) + optionale Dunkelheit
  // ---------------------------------------------------------------------------
  const vigCache = { key: '', canvas: null };

  function getVignette(theme) {
    const scale = B.renderScale || 1;
    const key = scale + '|' + theme.vignette;
    if (vigCache.key === key && vigCache.canvas) return vigCache.canvas;
    const cv = vigCache.canvas || document.createElement('canvas');
    cv.width = Math.ceil(ROOM_W * scale);
    cv.height = Math.ceil(ROOM_H * scale);
    const g = cv.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, ROOM_W, ROOM_H);
    // Elliptische Vignette: Gradient im Kreis, horizontal gestreckt
    g.save();
    g.translate(ROOM_W / 2, ROOM_H / 2);
    g.scale(ROOM_W / ROOM_H, 1);
    const rgb = theme.vignette || '0,0,0';
    const grd = g.createRadialGradient(0, 0, ROOM_H * 0.32, 0, 0, ROOM_H * 0.78);
    grd.addColorStop(0, 'rgba(' + rgb + ',0)');
    grd.addColorStop(0.7, 'rgba(' + rgb + ',0.22)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0.5)');
    g.fillStyle = grd;
    g.fillRect(-ROOM_W, -ROOM_H, ROOM_W * 2, ROOM_H * 2);
    g.restore();
    vigCache.key = key;
    vigCache.canvas = cv;
    return cv;
  }

  /** /dev/null: Dunkelheit mit Lichtkreis um den Spieler (reine Atmosphaere) */
  function drawDarkness(ctx, game, theme) {
    if (theme.key !== 'devnull' || !game.player) return;
    const p = game.player;
    const grd = ctx.createRadialGradient(p.x, p.y, 90, p.x, p.y, 420);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  /** Iris-Blende beim Etagenwechsel (schliesst sich auf den Spieler) */
  function drawIris(ctx, game) {
    const k = Math.min(1, Math.max(0, 1 - game.stateT / 0.6));
    const p = game.player;
    const px = p ? p.x : ROOM_W / 2, py = (p ? p.y : ROOM_H / 2) + HUD_H;
    const rad = Math.max(0, (1 - k) * (1 - k) * 760);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(px, py - 8, rad, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  /** Debug-Overlay (F2) */
  function drawDebug(ctx, game) {
    const r = game.room;
    const lines = [
      'DEBUG  fps ' + Math.round(game.fps || 0) + '  seed ' + game.seed + '  depth ' + game.depth,
      'room ' + (r ? r.type + ' @' + r.cell.x + ',' + r.cell.y + ' layout ' + (r.layout ? r.layout.id : '-') : '-'),
      'enemies ' + (r ? r.enemies.length : 0) + '  shots ' + (r ? r.projectiles.length : 0) + '  fx ' + (r ? r.effects.length : 0),
      'god ' + (game.player && game.player.god) + '   [G]od [I]tem [K]ill [N]ext [V]reveal [B]oss [T]reasure [H]eal',
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - 18 * lines.length - 8, 640, 18 * lines.length + 8);
    lines.forEach((l, i) => B.text(ctx, l, 8, H - 18 * (lines.length - i) - 4, { size: 13, color: '#9f9', bold: false, shadow: false }));
  }

  B.Renderer = {
    drawRoom,

    frame(ctx, game) {
      const scale = B.renderScale || 1;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = B.COLORS.black;
      ctx.fillRect(0, 0, W, H);

      if (game.state === 'title' || !game.room) {
        B.Screens.title(ctx, game);
        return;
      }

      // Raum (mit Screen-Shake), auf den Raumbereich beschnitten
      const sh = game.shakeOffset();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HUD_H, ROOM_W, ROOM_H);
      ctx.clip();
      ctx.save();
      ctx.translate(sh.x, HUD_H + sh.y);
      const tr = game.transition;
      if (game.state === 'roomTransition' && tr) {
        // Slide: alter Raum schiebt sich hinaus, neuer herein
        const k = Math.min(1, tr.t / tr.dur);
        const e = k * k * (3 - 2 * k); // smoothstep
        const d = B.DIRS[tr.dir];
        ctx.save();
        ctx.translate(-d.dx * ROOM_W * e, -d.dy * ROOM_H * e);
        drawRoom(ctx, tr.from, game, false);
        ctx.restore();
        ctx.save();
        ctx.translate(d.dx * ROOM_W * (1 - e), d.dy * ROOM_H * (1 - e));
        drawRoom(ctx, tr.to, game, true);
        ctx.restore();
      } else {
        drawRoom(ctx, game.room, game, true);
      }
      ctx.restore();
      // Vignette & Dunkelheit ohne Shake (sonst "wackelt" der Bildrand)
      const theme = B.themeFor(game.depth);
      ctx.translate(0, HUD_H);
      if (game.state !== 'roomTransition') drawDarkness(ctx, game, theme);
      ctx.drawImage(getVignette(theme), 0, 0, ROOM_W, ROOM_H);
      ctx.restore();

      B.HUD.draw(ctx, game);

      switch (game.state) {
        case 'floorCard': B.Screens.floorCard(ctx, game); break;
        case 'bossIntro': B.Screens.bossIntro(ctx, game); break;
        case 'pause': B.Screens.pause(ctx, game); break;
        case 'dead': B.Screens.dead(ctx, game); break;
        case 'floorTransition': drawIris(ctx, game); break;
        default: break;
      }

      if (B.debug && B.debug.enabled) drawDebug(ctx, game);
    },
  };
})(window.BOTA);
