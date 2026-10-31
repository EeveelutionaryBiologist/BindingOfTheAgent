/*
 * sprites.js — Sprite-Registry fuer prozedurale Pixel-Art aus ASCII-Karten.
 *
 * Definition:
 *   BOTA.defineSprite('enemy_bug', {
 *     palette: { k: '#1a1a1a', g: '#5fae4f' },   // Zeichen -> Farbe ('.' und ' ' sind transparent)
 *     rows: ['..kk..', '.kggk.', ...],            // EIN Frame
 *     // ODER frames: [[...rows], [...rows]]      // mehrere Animations-Frames
 *     scale: 4,                                   // Pixelgroesse (Default 4 -> 16x16-Art = 64 px)
 *   });
 *
 * Zeichnen (zentriert auf x, y):
 *   BOTA.drawSprite(ctx, 'enemy_bug', x, y, { frame, flash, alpha, flipX, scale, rotation });
 *
 * Unbekannte Namen zeichnen einen magentafarbenen Platzhalter statt abzustuerzen,
 * damit Inhalte vor der Grafik eingebaut werden koennen.
 */
'use strict';

(function (B) {
  const defs = Object.create(null);   // name -> Definition
  const baked = Object.create(null);  // name -> { frames: [canvas], flash: [canvas], w, h }

  function defineSprite(name, def) {
    if (!def || (!def.rows && !def.frames)) {
      console.warn('[sprites] invalid sprite definition:', name);
      return;
    }
    defs[name] = def;
    delete baked[name]; // bei Neudefinition neu backen
  }

  /** Rendert ein ASCII-Frame in ein Offscreen-Canvas; whiteOut = Silhouette fuer Treffer-Blitz */
  function bakeFrame(rows, palette, scale, whiteOut) {
    const h = rows.length;
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, w * scale);
    c.height = Math.max(1, h * scale);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue; // unbekannte Zeichen sind transparent
        g.fillStyle = whiteOut ? '#ffffff' : col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  function getBaked(name) {
    if (baked[name]) return baked[name];
    const def = defs[name];
    if (!def) return null;
    const scale = def.scale || 4;
    const frames = def.frames || [def.rows];
    const pal = def.palette || {};
    const out = {
      frames: frames.map((f) => bakeFrame(f, pal, scale, false)),
      flash: frames.map((f) => bakeFrame(f, pal, scale, true)),
    };
    out.w = out.frames[0].width;
    out.h = out.frames[0].height;
    baked[name] = out;
    return out;
  }

  function hasSprite(name) { return !!defs[name]; }

  /** Groesse in logischen Pixeln ({w, h}) oder null */
  function spriteSize(name) {
    const b = getBaked(name);
    return b ? { w: b.w, h: b.h } : null;
  }

  /** Anzahl Frames eines Sprites */
  function frameCount(name) {
    const b = getBaked(name);
    return b ? b.frames.length : 0;
  }

  /** Zeichnet ein Sprite zentriert auf (x, y). Gibt false zurueck, wenn ein Platzhalter gezeichnet wurde. */
  function drawSprite(ctx, name, x, y, opts) {
    const o = opts || {};
    const b = getBaked(name);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.translate(x, y);
    if (o.rotation) ctx.rotate(o.rotation);
    const s = o.scale || 1;
    ctx.scale(o.flipX ? -s : s, s);
    if (!b) {
      // Platzhalter: Magenta-Kreis mit Initiale
      ctx.fillStyle = o.flash ? '#fff' : '#ff00ff';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(name || '?').slice(0, 1).toUpperCase(), 0, 1);
      ctx.restore();
      return false;
    }
    const n = b.frames.length;
    const fi = ((o.frame | 0) % n + n) % n;
    const img = o.flash ? b.flash[fi] : b.frames[fi];
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -b.w / 2, -b.h / 2);
    ctx.restore();
    return true;
  }

  B.defineSprite = defineSprite;
  B.drawSprite = drawSprite;
  B.hasSprite = hasSprite;
  B.spriteSize = spriteSize;
  B.spriteFrameCount = frameCount;
  B._spriteDefs = defs; // fuer Debug/Tests
})(window.BOTA);
