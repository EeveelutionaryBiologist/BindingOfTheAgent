/*
 * effects.js — Rein visuelle Effekte ("Juice"): Partikel, Funken, Rauch, Truemmer, Ringe, Blitze,
 * Funkelsterne, fallendes Laub, Raum-Schimmer, Bildschirm-Toenung und schwebender Text.
 * Gegner mit def.family (z. B. 'branches') bekommen eigene Treffer-/Tod-Effekte (FAMILY_FX unten).
 *
 * Effekte haengen am Event-Bus und werden nie direkt aus der Spiellogik aufgerufen.
 * Alle Effekte liegen in room.effects und haben update(dt, game) / draw(ctx) / dead.
 * Koordinaten sind Raumkoordinaten (wie Entities).
 *
 * Leistung: Pro Raum hoechstens MAX_FX Effekte. Unwichtige Partikel werden bei vollem Puffer verworfen,
 * wichtige (Text, Ringe, Blitze) verdraengen notfalls die aeltesten Partikel.
 * Zufall: Math.random (rein visuell) — das Run-RNG (game.rng) wird hier NIE benutzt, sonst waeren Seeds
 * nicht mehr reproduzierbar.
 */
'use strict';

(function (B) {
  const MAX_FX = 300;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /** Hellt/dunkelt eine #rrggbb-Farbe auf (k > 0 heller, k < 0 dunkler) — fuer Farbvarianten von Partikeln */
  function shade(hex, k) {
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex || '#ffffff';
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }

  // ===========================================================================
  // Effekt-Klassen
  // ===========================================================================

  /** Quadratischer Partikel mit Reibung, optionaler Schwerkraft und Schrumpfen */
  class Particle {
    constructor(x, y, vx, vy, color, life, size, opts) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = life; this.max = life; this.size = size;
      const o = opts || {};
      this.drag = o.drag !== undefined ? o.drag : 4;
      this.gravity = o.gravity || 0;
      this.streak = !!o.streak; // als Strich entlang der Bewegung zeichnen (Funken)
      this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const f = Math.exp(-this.drag * dt);
      this.vx *= f; this.vy = this.vy * f + this.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    draw(ctx) {
      const k = Math.max(0, this.life / this.max);
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = this.color;
      if (this.streak) {
        // Funke: kurzer Strich entgegen der Flugrichtung
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1, this.size * 0.5);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035);
        ctx.stroke();
      } else {
        const s = Math.max(1, Math.round(this.size * (0.4 + 0.6 * k)));
        ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Expandierender Ring */
  class Ring {
    constructor(x, y, radius, color, life, width) {
      this.x = x; this.y = y; this.radius = radius; this.color = color;
      this.life = life; this.max = life; this.width = width || 6; this.dead = false;
      this.important = true;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const k = 1 - this.life / this.max;
      const e = 1 - (1 - k) * (1 - k); // ease-out
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * (0.25 + 0.75 * e), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Kurzer, gefuellter Lichtblitz (Treffer, Explosion) */
  class Flash {
    constructor(x, y, radius, color, life) {
      this.x = x; this.y = y; this.radius = radius; this.color = color || '#ffffff';
      this.life = life || 0.12; this.max = this.life; this.dead = false; this.important = true;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const k = this.life / this.max;
      const rad = this.radius * (1.15 - 0.3 * k);
      // Weicher Verlauf: heller Kern, transparenter Rand
      const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, rad);
      grd.addColorStop(0, this.color);
      grd.addColorStop(0.45, this.color);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Rauchwolke: waechst, steigt langsam, verblasst */
  class Smoke {
    constructor(x, y, vx, vy, size, life, color) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.size = size;
      this.life = life; this.max = life; this.color = color || '#6b625a'; this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const f = Math.exp(-3 * dt);
      this.vx *= f; this.vy = this.vy * f - 14 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    draw(ctx) {
      const k = this.life / this.max;
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (1.6 - 0.6 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Truemmerstueck mit Hoehe z: fliegt im Bogen, prallt einmal ab, bleibt kurz liegen */
  class Debris {
    constructor(x, y, color, size) {
      const a = Math.random() * Math.PI * 2, sp = rand(80, 260);
      this.x = x; this.y = y; this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp * 0.6;
      this.z = rand(4, 16); this.vz = rand(180, 360);
      this.color = color; this.size = size || 6;
      this.life = rand(0.9, 1.4); this.max = this.life; this.dead = false; this.bounced = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vz -= 900 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (!this.bounced) { this.vz = -this.vz * 0.35; this.bounced = true; } else this.vz = 0;
        this.vx *= 0.6; this.vy *= 0.6;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    draw(ctx) {
      const k = Math.min(1, this.life / 0.3);
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(Math.round(this.x - this.size / 2), Math.round(this.y + 2), this.size, Math.max(2, this.size / 2));
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.round(this.x - this.size / 2), Math.round(this.y - this.z - this.size / 2), this.size, this.size);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(Math.round(this.x - this.size / 2), Math.round(this.y - this.z - this.size / 2), this.size, 2);
      ctx.globalAlpha = 1;
    }
  }

  /** Funkelstern (4 Zacken): waechst auf, dreht minimal, schrumpft — wie die Antenne des Avatars */
  class Sparkle {
    constructor(x, y, size, color, life, vx, vy, delay) {
      this.x = x; this.y = y; this.size = size; this.color = color || '#ffe9a3';
      this.life = life || 0.5; this.max = this.life; this.vx = vx || 0; this.vy = vy || 0;
      this.delay = delay || 0; this.dead = false;
    }
    update(dt) {
      if (this.delay > 0) { this.delay -= dt; return; }
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const f = Math.exp(-3 * dt);
      this.vx *= f; this.vy *= f;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    draw(ctx) {
      if (this.delay > 0) return;
      const k = 1 - this.life / this.max;
      const s = this.size * Math.sin(k * Math.PI); // auf und ab
      if (s < 0.5) return;
      const u = Math.max(2, Math.round(s / 3));
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.round(this.x - u / 2), Math.round(this.y - s), u, Math.round(s * 2));
      ctx.fillRect(Math.round(this.x - s), Math.round(this.y - u / 2), Math.round(s * 2), u);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(this.x - u / 2), Math.round(this.y - u / 2), u, u);
    }
  }

  /**
   * Fallendes Blatt (Laub-Familie "branches"): ploppt kurz weg, segelt dann pendelnd nach unten, bleibt
   * auf seiner "Bodenhoehe" liegen und verblasst. Gezeichnet als kleine Raute mit Mittelrippe.
   */
  class Leaf {
    constructor(x, y, color, opts) {
      const o = opts || {};
      const a = Math.random() * Math.PI * 2, sp = rand(o.speedMin || 40, o.speedMax || 140);
      this.x = x; this.y = y;
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp - rand(20, 60); // leicht nach oben geworfen
      this.ground = y + rand(o.fallMin || 18, o.fallMax || 44);           // hier landet es (Draufsicht: "unten")
      this.color = color; this.vein = shade(color, -0.35);
      this.size = rand(o.sizeMin || 4, o.sizeMax || 6);
      this.phase = Math.random() * Math.PI * 2; this.sway = rand(4, 7);  // Pendeln beim Fallen
      this.rot = Math.random() * Math.PI; this.spin = rand(-4, 4);
      this.life = rand(o.lifeMin || 0.9, o.lifeMax || 1.5); this.max = this.life;
      this.landed = false; this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      if (this.landed) return;
      const f = Math.exp(-5 * dt);
      this.vx *= f;
      this.vy = this.vy * f + 160 * dt;                                  // Schwerkraft ...
      if (this.vy > 55) this.vy = 55;                                    // ... aber Luftwiderstand: sanftes Segeln
      this.phase += dt * this.sway;
      this.x += (this.vx + Math.sin(this.phase) * 30) * dt;
      this.y += this.vy * dt;
      this.rot += this.spin * dt;
      if (this.y >= this.ground) { this.y = this.ground; this.landed = true; this.rot = Math.round(this.rot / Math.PI) * Math.PI; }
    }
    draw(ctx) {
      const k = Math.max(0, this.life / this.max);
      const sz = this.size;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.translate(Math.round(this.x), Math.round(this.y));
      // Kippen beim Fallen = horizontale Stauchung (Pseudo-3D), liegend flach
      const tilt = this.landed ? 1 : 0.35 + 0.65 * Math.abs(Math.cos(this.phase));
      ctx.rotate(this.rot);
      ctx.scale(tilt, 1);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(-sz, 0); ctx.lineTo(0, -sz * 0.55); ctx.lineTo(sz, 0); ctx.lineTo(0, sz * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.vein;
      ctx.fillRect(-sz, -0.5, sz * 2, 1);
      ctx.restore();
    }
  }

  /** Schwebender Text (Pixel-Schrift), steigt auf und verblasst */
  class FloatText {
    constructor(x, y, text, color, opts) {
      const o = opts || {};
      this.x = x; this.y = y; this.text = String(text); this.color = color || '#ffffff';
      this.life = o.life || 1.0; this.max = this.life; this.scale = o.scale || 2;
      this.vy = o.vy !== undefined ? o.vy : -48; this.dead = false; this.important = true;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.y += this.vy * dt;
      this.vy *= Math.exp(-2.5 * dt);
    }
    draw(ctx) {
      const k = this.life / this.max;
      const age = this.max - this.life;
      const pop = age < 0.1 ? 0.6 + age * 4 : 1; // kurzes Aufploppen
      const alpha = Math.min(1, k * 2.5);
      if (B.pixelText) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(pop, pop);
        B.pixelText(ctx, this.text, 0, 0, { scale: this.scale, align: 'center', baseline: 'middle', color: this.color, shadow: 'rgba(0,0,0,0.75)', outline: '#140e0b', alpha });
        ctx.restore();
      } else if (B.text) {
        B.text(ctx, this.text, this.x, this.y, { size: 16, align: 'center', baseline: 'middle', color: this.color, alpha });
      }
    }
  }

  /** Raum-geschafft-Schimmer: diagonales Lichtband, das einmal durch den Raum zieht */
  class Shimmer {
    constructor(color) { this.life = 0.75; this.max = this.life; this.color = color || '255,240,210'; this.dead = false; this.important = true; }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const { TILE, ROOM_W, ROOM_H } = B.C;
      const k = 1 - this.life / this.max;
      const x = -300 + k * (ROOM_W + 600);
      ctx.save();
      ctx.beginPath(); ctx.rect(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE); ctx.clip();
      const grd = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
      grd.addColorStop(0, 'rgba(' + this.color + ',0)');
      grd.addColorStop(0.5, 'rgba(' + this.color + ',' + (0.13 * Math.sin(k * Math.PI)) + ')');
      grd.addColorStop(1, 'rgba(' + this.color + ',0)');
      ctx.fillStyle = grd;
      ctx.transform(1, 0, -0.5, 1, 0, 0); // Scherung -> diagonales Band
      ctx.fillRect(x - 160, -ROOM_H, 320, ROOM_H * 3);
      ctx.restore();
    }
  }

  /** Vollflaechige Toenung des Raums (z. B. rot beim Treffer, weiss beim Boss-Tod) */
  class RoomTint {
    constructor(rgb, alpha, life) { this.rgb = rgb; this.alpha = alpha; this.life = life; this.max = life; this.dead = false; this.important = true; }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const k = this.life / this.max;
      ctx.fillStyle = 'rgba(' + this.rgb + ',' + (this.alpha * k) + ')';
      ctx.fillRect(0, 0, B.C.ROOM_W, B.C.ROOM_H);
    }
  }

  /** Verzoegerter Aufruf (z. B. Ketten-Explosionen beim Boss-Tod), zeichnet nichts */
  class Timer {
    constructor(delay, fn) { this.t = delay; this.fn = fn; this.dead = false; this.important = true; }
    update(dt, game) {
      this.t -= dt;
      if (this.t <= 0 && !this.dead) { this.dead = true; try { this.fn(game); } catch (e) { /* rein visuell */ } }
    }
    draw() {}
  }

  /**
   * Fluestern (The Context Limit): ein Satzfetzen tippt sich blass ins Bild, flackert, verliert dann Buchstabe fuer
   * Buchstabe (abgeschnittener Kontext) und verblasst, waehrend er langsam mit dem Wind treibt. Rein optisch.
   */
  /**
   * Fluestern (The Context Limit): tippt sich ein, Buchstaben fallen weg. intense 0–3 (The System Prompt, je Phase):
   * groesser, deutlicher, staerkeres Flackern, Zittern, kurze Doppelbilder, manche Zeilen brechen mitten im Wort ab.
   * big: eine einzelne, grosse, ruhige Zeile in der Raummitte (der Seed). Alles Zufaellige ist reine Optik.
   */
  class Whisper {
    constructor(x, y, text, opts) {
      const o = opts || {};
      this.x = x; this.y = y;
      this.lvl = Math.max(0, Math.min(3, o.intense | 0));
      this.big = !!o.big;
      let t = String(text).slice(0, this.big ? 48 : 40);
      // Im Kampf brechen manche Zeilen mitten im Wort ab (abgeschnittener Kontext)
      if (this.lvl && !this.big && t.length > 8 && Math.random() < 0.15 + 0.1 * this.lvl) {
        t = t.slice(0, 4 + Math.floor(Math.random() * (t.length - 6))) + '[...]';
      }
      this.text = t;
      this.life = this.big ? 4.2 : 2.8 - 0.2 * this.lvl; this.max = this.life; this.dead = false; this.important = this.big;
      // Reihenfolge, in der die Buchstaben wegfallen (zufaellig, nur Optik)
      this.order = this.text.split('').map((_, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
      this.italic = !this.big && Math.random() < 0.6;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      if (this.big) return;
      this.x += 7 * dt;
      this.y += 2 * dt;
    }
    draw(ctx) {
      const age = this.max - this.life, n = this.text.length, L = this.lvl;
      const shown = Math.min(n, Math.floor(age / (this.big ? 0.05 : 0.035)));   // eintippen
      const hold = this.big ? 2.6 : 1.1;
      const lost = Math.max(0, Math.floor((age - hold) / (1.5 / n)));           // dann wegfallen
      const gone = new Set(this.order.slice(0, Math.min(n, lost)));
      let s = '';
      for (let i = 0; i < shown; i++) s += gone.has(i) ? ' ' : this.text[i];
      const fade = Math.min(1, age / 0.3) * Math.min(1, this.life / 0.6);
      const flicker = Math.random() < 0.08 + 0.07 * L ? 0.3 : 0.85 + 0.15 * Math.sin(age * (37 + 10 * L));
      const jx = L ? (Math.random() - 0.5) * L * 1.6 : 0, jy = L ? (Math.random() - 0.5) * L * 1.2 : 0;
      ctx.save();
      ctx.globalAlpha = (this.big ? 0.85 : 0.42 + 0.1 * L) * fade * flicker;
      ctx.font = (this.italic ? 'italic ' : '') + (this.big ? 'bold 22' : String(15 + 2 * L)) + 'px ' + (B.FONT || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0a0f18';
      ctx.fillText(s, this.x + 1 + jx, this.y + 1 + jy);
      ctx.fillStyle = '#d6e4ff';
      ctx.fillText(s, this.x + jx, this.y + jy);
      // Doppelbild: kurz eine zweite, versetzte Kopie
      if (L && Math.random() < 0.06 * L) {
        ctx.globalAlpha *= 0.45;
        ctx.fillText(s, this.x + jx + 4 + L, this.y + jy - 2);
      }
      ctx.restore();
    }
  }

  /**
   * Goldener Fallschirm (Tod des Shareholder): ein kleiner Zylinder-Schatten schwebt unter einem gestreiften
   * Goldschirm schaukelnd nach oben davon und verblasst. Rein optisch.
   */
  class Parachute {
    constructor(x, y) {
      this.x = x; this.y = y; this.life = 3.2; this.max = this.life; this.dead = false; this.important = true;
      this.sway = Math.random() * 6;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.y -= 42 * dt;
      this.x += Math.sin((this.max - this.life) * 1.8 + this.sway) * 18 * dt;
    }
    draw(ctx) {
      const k = this.life / this.max;
      const a = Math.sin((this.max - this.life) * 2.2 + this.sway) * 0.18;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      // Schirm: Halbkreis mit abwechselnd hellen und dunklen Goldbahnen
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#e0b23c' : '#fff1a8';
        ctx.beginPath();
        ctx.moveTo(0, -46);
        ctx.arc(0, -46, 44, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#5a4410';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -46, 44, Math.PI, Math.PI * 2); ctx.stroke();
      // Leinen
      ctx.lineWidth = 1;
      for (const lx of [-44, -22, 22, 44]) { ctx.beginPath(); ctx.moveTo(lx, -46); ctx.lineTo(0, 0); ctx.stroke(); }
      // Figur: Anzug, Kopf, Zylinder
      ctx.fillStyle = '#2a2238';
      ctx.fillRect(-7, 0, 14, 18);
      ctx.fillStyle = '#3d3a46';
      ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1c22';
      ctx.fillRect(-8, -11, 16, 3);
      ctx.fillRect(-5, -21, 10, 10);
      ctx.fillStyle = '#e0b23c';
      ctx.fillRect(-5, -13, 10, 2);
      ctx.restore();
    }
  }

  // ===========================================================================
  // Hinzufuegen mit Obergrenze
  // ===========================================================================

  function roomOf(game) { const g = game || B.game; return g && g.room ? g.room : null; }

  /** Fuegt einen Effekt hinzu; bei vollem Puffer werden unwichtige verworfen bzw. alte Partikel verdraengt */
  function add(game, fx) {
    const room = roomOf(game);
    if (!room) return null;
    const list = room.effects;
    if (list.length >= MAX_FX) {
      if (!fx.important) return null;
      const i = list.findIndex((e) => !e.important);
      if (i < 0) return null;
      list.splice(i, 1);
    }
    list.push(fx);
    return fx;
  }

  /** Freie Plaetze im Puffer (fuer Partikel-Salven) */
  function freeSlots(game) { const r = roomOf(game); return r ? Math.max(0, MAX_FX - r.effects.length) : 0; }

  const FX = {
    shade,
    add,

    /** Partikel-Salve (kompatibel zur Skelett-API) */
    burst(game, x, y, color, count, speed, opts) {
      const o = opts || {};
      const n = Math.min(count, freeSlots(game));
      for (let i = 0; i < n; i++) {
        const a = o.angle !== undefined ? o.angle + rand(-o.spread, o.spread) : Math.random() * Math.PI * 2;
        const s = speed * rand(0.35, 1.2);
        const col = o.vary ? shade(color, rand(-0.3, 0.35)) : color;
        add(game, new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, col, rand(o.lifeMin || 0.25, o.lifeMax || 0.6),
          rand(o.sizeMin || 4, o.sizeMax || 9), { gravity: o.gravity || 0, drag: o.drag, streak: o.streak }));
      }
    },

    /** Kompatibel zur Skelett-API */
    ring(game, x, y, radius, color, life, width) {
      return add(game, new Ring(x, y, radius, color, life || 0.35, width));
    },

    flash(game, x, y, radius, color, life) { return add(game, new Flash(x, y, radius, color, life)); },

    smoke(game, x, y, count, spread, color) {
      const n = Math.min(count, freeSlots(game));
      for (let i = 0; i < n; i++) {
        add(game, new Smoke(x + rand(-spread, spread), y + rand(-spread, spread), rand(-40, 40), rand(-40, 20), rand(8, 16), rand(0.5, 0.9), color));
      }
    },

    debris(game, x, y, count, colors, size) {
      const n = Math.min(count, freeSlots(game));
      for (let i = 0; i < n; i++) add(game, new Debris(x, y, pick(colors), size || pick([4, 6, 8])));
    },

    sparkles(game, x, y, count, radius, color, opts) {
      const o = opts || {};
      const n = Math.min(count, freeSlots(game));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * radius;
        add(game, new Sparkle(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(o.sizeMin || 5, o.sizeMax || 10), color,
          rand(0.35, 0.7), Math.cos(a) * (o.speed || 0), Math.sin(a) * (o.speed || 0) - (o.rise || 0), rand(0, o.delay || 0.15)));
      }
    },

    /** Fallende Blaetter in zufaelligen Farben aus colors (Laub-Familie, Stale Branch) */
    leaves(game, x, y, count, colors, opts) {
      const n = Math.min(count, freeSlots(game));
      const cols = colors && colors.length ? colors : ['#6f9a3c'];
      for (let i = 0; i < n; i++) add(game, new Leaf(x + rand(-8, 8), y + rand(-6, 6), pick(cols), opts));
    },

    /** Schwebender Text, z. B. "+1", "LGTM", "denied" */
    text(game, x, y, str, color, opts) {
      if (!str) return null;
      return add(game, new FloatText(x, y, str, color, opts));
    },

    shimmer(game, color) { return add(game, new Shimmer(color)); },
    tint(game, rgb, alpha, life) { return add(game, new RoomTint(rgb, alpha, life)); },
    later(game, delay, fn) { return add(game, new Timer(delay, fn)); },
  };

  // ===========================================================================
  // Bus-Anbindung
  // ===========================================================================
  const on = (evt, fn) => B.bus.on(evt, fn);
  const playerPos = (game) => {
    const p = game && game.player;
    return p ? { x: p.x, y: p.y } : { x: B.C.ROOM_W / 2, y: B.C.ROOM_H / 2 };
  };
  // Rate-Limit fuer Texte pro Schluessel (z. B. "denied" nicht 60x pro Sekunde)
  const lastText = {};
  function textLimited(key, minGap) {
    const t = performance.now() / 1000;
    if (lastText[key] !== undefined && t - lastText[key] < minGap) return false;
    lastText[key] = t;
    return true;
  }

  // Schuss: winziger Muendungs-Puff
  on('shoot', (e) => {
    const p = e.player;
    if (!p || !e.dir) return;
    const d = B.DIRS[e.dir];
    FX.burst(e.game, p.x + d.dx * 18, p.y - 10 + d.dy * 18, '#ffe2c8', 2, 90, { lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 5 });
  });

  /**
   * Gegner-Familien (def.family): eigene Treffer-/Tod-Effekte statt der Standard-Funken.
   * hit(e) / death(e) bekommen das Bus-Payload; death nur fuer Nicht-Bosse (Bosse behalten ihre Explosion
   * und bekommen deco(e) obendrauf). Neue Familien: hier eintragen und in audio.js FAMILY_SOUNDS.
   */
  const familyOf = (e) => (e && e.enemy && e.enemy.def && e.enemy.def.family) || null;
  const leafMix = () => {
    const BL = B.BRANCH_LEAVES;
    return BL ? BL.green.concat(BL.brown) : ['#6f9a3c', '#93602e'];
  };
  const barkCols = () => (B.BRANCH_LEAVES ? B.BRANCH_LEAVES.bark : ['#5a3d22', '#a3602c']);
  const FAMILY_FX = {
    // Forgotten Branches: Laub raschelt herunter, Rindensplitter statt Funken
    branches: {
      hit(e) {
        FX.burst(e.game, e.x, e.y, '#ffffff', 2, 240, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
        FX.burst(e.game, e.x, e.y, barkCols()[1], 2, 140, { vary: true, lifeMin: 0.12, lifeMax: 0.25, sizeMin: 3, sizeMax: 4 });
        FX.leaves(e.game, e.x, e.y - 10, 2, leafMix(), { speedMax: 110, lifeMin: 0.7, lifeMax: 1.1 });
      },
      death(e) {
        FX.flash(e.game, e.x, e.y, 20, '#fff4d0', 0.08);
        FX.leaves(e.game, e.x, e.y - 8, 10, leafMix(), { speedMin: 60, speedMax: 200, lifeMin: 1.0, lifeMax: 1.7 });
        FX.debris(e.game, e.x, e.y, 6, barkCols().concat(['#16240f']), 4);
        FX.ring(e.game, e.x, e.y, 40, '#b8803f', 0.3, 4);
        FX.smoke(e.game, e.x, e.y, 2, 8, '#4a3a26');
      },
      deco(e) { FX.leaves(e.game, e.x, e.y, 24, leafMix(), { speedMin: 80, speedMax: 320, lifeMin: 1.2, lifeMax: 2.2 }); },
    },
    // Sandbox Borders: Sand spritzt und staubt statt Funken
    sandbox: {
      hit(e) {
        FX.burst(e.game, e.x, e.y, '#ffffff', 2, 240, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
        FX.burst(e.game, e.x, e.y, '#d9b878', 4, 160, { vary: true, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 3, sizeMax: 5 });
      },
      death(e) {
        FX.flash(e.game, e.x, e.y, 20, '#fff4d0', 0.08);
        FX.burst(e.game, e.x, e.y, '#d9b878', 14, 260, { vary: true, lifeMin: 0.25, lifeMax: 0.55, drag: 5 });
        FX.debris(e.game, e.x, e.y, 5, ['#6b4a28', '#3a2614', '#e8c88a'], 4);
        FX.smoke(e.game, e.x, e.y, 3, 14, '#c9a46a');
      },
    },
    // Dependency Hell: Karton-Splitter und Verpackungschips statt Funken
    dephell: {
      hit(e) {
        FX.burst(e.game, e.x, e.y, '#ffffff', 2, 240, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
        FX.burst(e.game, e.x, e.y, e.color || '#c98a4a', 3, 150, { vary: true, lifeMin: 0.12, lifeMax: 0.3, sizeMin: 3, sizeMax: 5 });
      },
      death(e) {
        FX.flash(e.game, e.x, e.y, 22, '#fff4d0', 0.08);
        FX.burst(e.game, e.x, e.y, '#fff1c9', 12, 260, { vary: true, lifeMin: 0.3, lifeMax: 0.6, drag: 5, sizeMin: 3, sizeMax: 5 });
        FX.debris(e.game, e.x, e.y, 6, [e.color || '#c98a4a', '#8a5a2c', '#f2d08a'], 5);
        FX.ring(e.game, e.x, e.y, 42, '#56e3ff', 0.3, 4);
        FX.smoke(e.game, e.x, e.y, 3, 12, '#4a3020');
      },
    },
    // Production: Metallfunken (weiss/bernstein) statt Farbspritzern; Tod mit Stahlteilen, cyanem Ring und Rauch
    production: {
      hit(e) {
        FX.burst(e.game, e.x, e.y, '#ffffff', 2, 260, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
        FX.burst(e.game, e.x, e.y, '#ffd27a', 3, 300, { streak: true, lifeMin: 0.1, lifeMax: 0.22, sizeMin: 2, sizeMax: 3 });
      },
      death(e) {
        FX.flash(e.game, e.x, e.y, 22, '#e8fbff', 0.08);
        FX.burst(e.game, e.x, e.y, '#ffd27a', 12, 340, { streak: true, lifeMin: 0.15, lifeMax: 0.4 });
        FX.debris(e.game, e.x, e.y, 7, ['#c4ccd4', '#8c959f', '#565e68', '#f2c230'], 5);
        FX.ring(e.game, e.x, e.y, 40, '#5fe0ff', 0.3, 4);
        FX.smoke(e.game, e.x, e.y, 3, 12, '#3a3f46');
      },
    },
  };

  // Production: Rate Limiter gedrosselt ("429" — das Schild zeichnet er selbst): Dampf und kurzer Text
  on('enemyThrottle', (e) => {
    FX.smoke(e.game, e.x, e.y, 4, 14, '#9aa3ad');
    FX.text(e.game, e.x, e.y - 50, 'Too Many Requests', '#ffcf4d');
  });

  // Port Scanner: taucht an einem Port auf (cyaner Ring, Metallspaene) oder der Port ist gefiltert (Text)
  on('portScan', (e) => {
    if (e.kind === 'filtered') { FX.text(e.game, e.x, e.y - 30, 'FILTERED', '#ffcf4d'); return; }
    FX.ring(e.game, e.x, e.y, 34, '#5fe0ff', 0.3, 4);
    FX.burst(e.game, e.x, e.y, '#9aa6b4', 6, 160, { vary: true, lifeMin: 0.15, lifeMax: 0.3 });
  });

  // Legacy Codebase (Stack Trace): alter Staub statt Funken, beim Tod flattert Endlospapier davon.
  // Eigener Block (nachtraeglich eingetragen), damit parallele Familien-Erweiterungen sich nicht in die Quere kommen.
  const LEGACY_PAPER = ['#eef0e2', '#a6cf98', '#d8dccb'];
  // The Context Limit: Wasserspritzer und aufgeweichte Papierfetzen
  FAMILY_FX.context = {
    hit(e) {
      FX.burst(e.game, e.x, e.y, '#ffffff', 2, 220, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
      FX.burst(e.game, e.x, e.y, '#9ec5ff', 4, 150, { vary: true, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 2, sizeMax: 4 });
    },
    death(e) {
      FX.flash(e.game, e.x, e.y, 20, '#e6f0ff', 0.08);
      FX.ring(e.game, e.x, e.y, 44, '#9ec5ff', 0.35, 4);
      FX.burst(e.game, e.x, e.y, '#9ec5ff', 14, 240, { vary: true, lifeMin: 0.25, lifeMax: 0.55, drag: 5 });
      FX.debris(e.game, e.x, e.y, 5, ['#d8d2c2', '#a39b88', '#6f86a6'], 4);
    },
  };
  FAMILY_FX.legacy = {
    hit(e) {
      FX.burst(e.game, e.x, e.y, '#ffffff', 2, 240, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
      FX.burst(e.game, e.x, e.y, '#9aa6ab', 3, 120, { vary: true, lifeMin: 0.2, lifeMax: 0.4, sizeMin: 3, sizeMax: 5 });
      FX.burst(e.game, e.x, e.y, e.color || '#cfc4a0', 2, 160, { vary: true, lifeMin: 0.12, lifeMax: 0.25, sizeMin: 3, sizeMax: 4 });
    },
    death(e) {
      FX.flash(e.game, e.x, e.y, 20, '#fff4d0', 0.08);
      FX.leaves(e.game, e.x, e.y - 10, 8, LEGACY_PAPER, { speedMin: 60, speedMax: 200, lifeMin: 1.0, lifeMax: 1.6, sizeMin: 5, sizeMax: 7 });
      FX.debris(e.game, e.x, e.y, 6, ['#d8cda8', '#a99d78', '#14181a'], 4);
      FX.ring(e.game, e.x, e.y, 40, '#7fb0c9', 0.3, 4);
      FX.smoke(e.game, e.x, e.y, 3, 12, '#6c767a');
    },
  };

  // Dependency Hell: Honeypot schnappt zu (Ring in Cyan, Kruemel), Rolling Release prallt ab (Staub) und platzt auf
  // (Verpackungschips fliegen). Nur Optik, die Spiel-Logik steht in entities/enemy.js.
  on('enemyChomp', (e) => {
    FX.ring(e.game, e.x, e.y + 4, (e.r || 54) + 10, '#56e3ff', 0.25, 5);
    FX.burst(e.game, e.x, e.y, e.ate ? '#ffffff' : '#f0b030', 8, 200, { vary: true, lifeMin: 0.15, lifeMax: 0.35 });
    if (e.ate) FX.flash(e.game, e.x, e.y, 30, '#fff4d0', 0.1);
  });
  on('enemyBounce', (e) => {
    FX.burst(e.game, e.x, e.y, '#c9a46a', 5, 120, { vary: true, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 3, sizeMax: 4 });
  });
  on('enemyUnpack', (e) => {
    FX.flash(e.game, e.x, e.y, 30, '#e8fbff', 0.1);
    FX.burst(e.game, e.x, e.y, '#fff1c9', 16, 280, { vary: true, lifeMin: 0.3, lifeMax: 0.6, drag: 5 });
    FX.ring(e.game, e.x, e.y, 50, '#56e3ff', 0.3, 5);
  });

  // Rootkit taucht auf (Sandfontaene + Ring) oder ab (Staubwolke)
  on('enemyBurrow', (e) => {
    if (e.up) {
      FX.burst(e.game, e.x, e.y + 6, '#d9b878', 16, 240, { vary: true, lifeMin: 0.25, lifeMax: 0.5, drag: 4 });
      FX.ring(e.game, e.x, e.y + 6, 40, '#e0c08a', 0.3, 4);
    } else {
      FX.smoke(e.game, e.x, e.y + 6, 3, 12, '#c9a46a');
    }
  });

  // Laub faellt (Stale Branch altert): Stufenwechsel = ganzer Schwall, sonst einzelne Blaetter
  on('enemyShed', (e) => {
    FX.leaves(e.game, e.x, e.y, e.count || 1, e.colors, e.big ? { speedMin: 30, speedMax: 120, lifeMin: 1.1, lifeMax: 1.8 } : { speedMin: 10, speedMax: 40 });
  });

  // Octopus Merge zieht einen Arm ein: "Merged!"-Pop an der Spitze (Ring, Laub, Text)
  on('bossMerge', (e) => {
    FX.ring(e.game, e.x, e.y, 46, '#ffcf4d', 0.35, 5);
    FX.leaves(e.game, e.x, e.y, 6, leafMix(), { speedMin: 40, speedMax: 160 });
    FX.text(e.game, e.x, e.y - 24, 'Merged!', '#ffcf4d');
  });

  // The Context Limit: Fluestern und fernes Wetterleuchten (zwei kurze, schwache Aufheller; bewusst sanft)
  on('ambientWhisper', (e) => { add(e.game, new Whisper(e.x, e.y, e.text, { intense: e.intense, big: e.big })); });
  on('ambientThunder', (e) => {
    FX.tint(e.game, '200,215,255', 0.09, 0.35);
    FX.later(e.game, 0.16, (g) => FX.tint(g, '200,215,255', 0.06, 0.5));
  });

  // Overflow Buffer (Context-Familie): der Tank platzt — Wasserschwall, Glassplitter, Ring bis zum Pfuetzenrand
  on('enemyOverflow', (e) => {
    const g = e.game, col = e.color || '#9ec5ff';
    FX.flash(g, e.x, e.y, 30, '#e6f0ff', 0.08);
    FX.ring(g, e.x, e.y, (e.r || 80) * 0.9, col, 0.4, 4);
    FX.burst(g, e.x, e.y, col, 16, 260, { vary: true, lifeMin: 0.2, lifeMax: 0.45, drag: 4 });
    FX.burst(g, e.x, e.y, '#ffffff', 4, 300, { streak: true, lifeMin: 0.08, lifeMax: 0.16, sizeMin: 3, sizeMax: 4 });
    FX.debris(g, e.x, e.y, 7, ['#b9cde6', '#eef4ff', '#6f86a6'], 4);
  });
  // Bit Bucket: Der Schuss zerfaellt am Rand der Scheibe; beim Leeren schlaegt ein Ring aus dem Eimer
  on('enemySwallow', (e) => {
    FX.burst(e.game, e.x, e.y, e.color || '#ffffff', 4, 70, { vary: true, lifeMin: 0.1, lifeMax: 0.25, sizeMin: 2, sizeMax: 4 });
    FX.ring(e.game, e.x, e.y, 14, '#d0d0d8', 0.16, 2);
  });
  on('enemyFlush', (e) => {
    const col = e.color || '#ff4d3d';
    FX.ring(e.game, e.x, e.y, (e.r || 110) * 0.7, col, 0.3, 4);
    FX.burst(e.game, e.x, e.y, col, 10, 220, { vary: true, lifeMin: 0.15, lifeMax: 0.35, drag: 4 });
  });
  // Megalith: Suchtreffer ersetzt (gelber Blitz), Modul wieder eingemergt ("+1 import")
  on('bossReplace', (e) => {
    FX.ring(e.game, e.x, e.y, 54, e.color || '#ffe14d', 0.3, 4);
    FX.burst(e.game, e.x, e.y, e.color || '#ffe14d', 8, 200, { vary: true, lifeMin: 0.15, lifeMax: 0.3 });
  });
  on('bossAbsorb', (e) => {
    FX.ring(e.game, e.x, e.y, 40, e.color || '#9be07a', 0.35, 4);
    FX.text(e.game, e.x, e.y - 24, '+1 import', e.color || '#9be07a');
  });

  // Shareholder: Muenzen klingeln, verfallen, Rueckkauf, Quartalszahlen
  on('bossMoney', (e) => {
    const g = e.game, col = e.color || '#ffcf4d';
    if (e.kind === 'coin') {
      FX.burst(g, e.x, e.y, col, 6, 160, { vary: true, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 3, sizeMax: 5 });
      FX.sparkles(g, e.x, e.y - 4, 4, 18, '#fff1a8');
    } else if (e.kind === 'expire') {
      FX.smoke(g, e.x, e.y, 3, 10, '#c9ced6');
      FX.text(g, e.x, e.y - 20, 'vested elsewhere', '#c9ced6', { scale: 1 });
    } else if (e.kind === 'buyback') {
      FX.ring(g, e.x, e.y, 130, col, 0.45, 6);
      FX.sparkles(g, e.x, e.y, 10, 60, '#fff1a8');
    } else if (e.kind === 'beat') {
      FX.sparkles(g, e.x, e.y, 12, 50, col);
    } else if (e.kind === 'missed') {
      FX.burst(g, e.x, e.y, col, 16, 220, { vary: true, lifeMin: 0.3, lifeMax: 0.6 });
    }
  });

  // Sharp Left Turn: kleiner Funke am Knick
  on('shotTurn', (e) => FX.burst(e.game, e.x, e.y, e.color || '#ffffff', 3, 90, { lifeMin: 0.08, lifeMax: 0.16 }));

  // Memory Hog: Bombe gibt Speicher frei, Stop-the-World beginnt, Kacheln klappen um
  on('bossFree', (e) => {
    FX.text(e.game, e.x, e.y - 30, 'free()', '#d9ffc9');
    FX.sparkles(e.game, e.x, e.y, 10, 60, e.color || '#7fe3ff');
  });
  on('bossEncrypt', (e) => {
    FX.text(e.game, e.x, e.y - 50, e.text, '#ff8ae6', { scale: 2, life: 1.6 });
    FX.ring(e.game, e.x, e.y, 70, '#e040c0', 0.4, 5);
  });
  on('bossDecrypt', (e) => {
    FX.text(e.game, e.x, e.y - 30, e.text, '#ffe9a0');
    FX.sparkles(e.game, e.x, e.y, 10, 60, '#f2c14e');
  });
  on('bossGc', (e) => {
    if (e.kind === 'start') FX.ring(e.game, e.x, e.y, 120, '#9be07a', 0.5, 6);
  });

  // Spaete Bosse gehen ab: Megalith stuerzt ab ("Segmentation fault"), Shareholder schwebt am Goldschirm davon
  on('bossExit', (e) => {
    const g = e.game;
    if (e.kind === 'segfault') {
      FX.debris(g, e.x, e.y, 18, ['#474c55', '#33373e', '#6b7079'], 10);
      FX.later(g, 0.9, (gg) => {
        FX.text(gg, e.x, e.y - 40, 'SEGMENTATION FAULT', '#ff7a6a', { life: 2.2, vy: -20 });
        FX.text(gg, e.x, e.y - 12, '(core dumped)', '#c8ccd2', { life: 2.2, vy: -20, scale: 1 });
      });
    } else if (e.kind === 'oom') {
      FX.burst(g, e.x, e.y, e.color || '#7fe3ff', 26, 300, { vary: true, lifeMin: 0.3, lifeMax: 0.7 });
      FX.debris(g, e.x, e.y, 12, ['#3f5f88', '#54779f', '#d6f6ff'], 8);
      FX.later(g, 0.9, (gg) => {
        FX.text(gg, e.x, e.y - 40, 'KILLED', '#ff7a6a', { life: 2.2, vy: -20 });
        FX.text(gg, e.x, e.y - 12, '(out of memory)', '#c8ccd2', { life: 2.2, vy: -20, scale: 1 });
      });
    } else if (e.kind === 'eoc') {
      // The System Prompt: abgeschnitten statt getoetet. Erst die Zeile, dann Stille und ein blasser Lichtschein,
      // dann der Anfang des naechsten Gespraechs
      FX.burst(g, e.x, e.y, '#d6e4ff', 30, 220, { vary: true, lifeMin: 0.4, lifeMax: 1.0 });
      FX.text(g, e.x, e.y - 30, '[end of conversation]', '#d6e4ff', { life: 2.6, vy: -14 });
      FX.later(g, 0.6, (gg) => FX.tint(gg, '255,244,222', 0.12, 3.2));
      FX.later(g, 2.6, (gg) => FX.text(gg, 480, 140, 'New conversation started.', '#ffe9c9', { life: 3.2, vy: -6 }));
    } else if (e.kind === 'parachute') {
      FX.later(g, 0.8, (gg) => add(gg, new Parachute(e.x, e.y + 20)));
    }
  });

  // The System Prompt: Wasser bricht herein, Grabsteine steigen auf / werden geloescht / stellen her, Echos erscheinen
  on('bossTruncate', (e) => {
    if (e.kind === 'flood') FX.tint(e.game, '120,150,200', 0.08, 0.5);
  });
  on('bossTomb', (e) => {
    const g = e.game;
    if (e.kind === 'rise') FX.debris(g, e.x, e.y + 20, 8, ['#3d4654', '#2a3140', '#5d6878'], 5);
    else if (e.kind === 'delete') {
      FX.debris(g, e.x, e.y, 14, ['#5d6878', '#7d889a', '#3d4654'], 8);
      FX.text(g, e.x, e.y - 34, 'DELETE ... WHERE id = ' + (e.n || 0), '#ffb347', { scale: 1, life: 1.4 });
    } else if (e.kind === 'restore') {
      FX.ring(g, e.x, e.y, 40, '#d6e4ff', 0.4, 3);
      FX.text(g, e.x, e.y - 34, 'restored', '#d6e4ff', { scale: 1, life: 1.2 });
    }
  });
  on('bossEcho', (e) => { FX.ring(e.game, e.x, e.y, 50, '#d6e4ff', 0.6, 2); });
  on('bossCompact', (e) => { if (e.n) FX.ring(e.game, e.x, e.y, 90, '#ffb347', 0.5, 4); });

  // Orphan Commit gefangen: goldenes Funkeln und ein kurzer Text (die Credits fliegen ohnehin heraus)
  on('orphanCaught', (e) => {
    FX.sparkles(e.game, e.x, e.y - 6, 10, 26, '#ffe27a', { rise: 24 });
    FX.text(e.game, e.x, e.y - 30, 'recovered!', '#ffe27a');
  });

  // Gegner verschwindet ohne Tod (Orphan Commit: Garbage Collection): Rauchwoelkchen, blasser Ring, Text
  on('enemyVanish', (e) => {
    FX.smoke(e.game, e.x, e.y, 4, 12, e.color || '#c9ced6');
    FX.ring(e.game, e.x, e.y, 30, e.color || '#c9ced6', 0.35, 3);
    if (e.text) FX.text(e.game, e.x, e.y - 26, e.text, e.color || '#c9ced6');
  });

  // Gegner getroffen: Funken (weiss + Gegnerfarbe) und Mini-Blitz — Familien haben eigene Effekte
  on('enemyHit', (e) => {
    const fam = FAMILY_FX[familyOf(e)];
    if (fam && fam.hit) { fam.hit(e); return; }
    const col = e.color || '#ffffff';
    FX.burst(e.game, e.x, e.y, '#ffffff', 3, 260, { streak: true, lifeMin: 0.1, lifeMax: 0.2, sizeMin: 3, sizeMax: 4 });
    FX.burst(e.game, e.x, e.y, col, 3, 160, { vary: true, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 3, sizeMax: 6 });
  });

  // Zerstoerbare Objekte: kleine Splitter bei Treffern, Truemmer + Staub beim Zerbrechen
  on('propHit', (e) => {
    FX.burst(e.game, e.x, e.y - 8, e.color || '#a07a4a', 3, 140, { vary: true, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 3, sizeMax: 5 });
  });
  on('propBreak', (e) => {
    const col = e.color || '#a07a4a';
    FX.debris(e.game, e.x, e.y, 9, [col, shade(col, -0.3), shade(col, 0.2)], 6);
    FX.burst(e.game, e.x, e.y, col, 14, 240, { vary: true, lifeMin: 0.25, lifeMax: 0.55, drag: 5 });
    FX.smoke(e.game, e.x, e.y, 3, 14, shade(col, -0.4));
  });

  // Rohr-Sprung: Wasserspritzer am Ankunftsort (das Rohr liegt im alten Raum, daher nur am Ziel sichtbar)
  on('pipeArrive', (e) => {
    FX.ring(e.game, e.x, e.y, 70, '#3fa9d6', 0.4, 6);
    FX.burst(e.game, e.x, e.y, '#7fd0f0', 16, 240, { vary: true, lifeMin: 0.2, lifeMax: 0.5 });
  });

  // Gegner stirbt: Puff in Gegnerfarbe; Boss: Kettenexplosionen, Weissblitz, langes Beben
  on('enemyDeath', (e) => {
    const game = e.game, col = e.color || '#cccccc';
    const fam = FAMILY_FX[familyOf(e)];
    if (fam && !e.boss && fam.death) { fam.death(e); return; }
    if (fam && e.boss && fam.deco) fam.deco(e);
    if (!e.boss) {
      FX.flash(game, e.x, e.y, 22, '#ffffff', 0.08);
      FX.burst(game, e.x, e.y, col, 14, 260, { vary: true, lifeMin: 0.3, lifeMax: 0.65, drag: 5 });
      FX.ring(game, e.x, e.y, 46, shade(col, 0.3), 0.3, 5);
      FX.smoke(game, e.x, e.y, 3, 10, shade(col, -0.45));
      return;
    }
    const enemy = e.enemy;
    const r = (enemy && enemy.r) || 48;
    for (let i = 0; i < 6; i++) {
      FX.later(game, i * 0.12, (g) => {
        const x = e.x + rand(-r, r), y = e.y + rand(-r, r);
        FX.flash(g, x, y, 40, '#fff4d0', 0.12);
        FX.burst(g, x, y, i % 2 ? col : '#ffb347', 14, 340, { vary: true });
        FX.ring(g, x, y, 70, '#ffcf4d', 0.35, 5);
      });
    }
    FX.later(game, 0.75, (g) => {
      FX.tint(g, '255,255,255', 0.55, 0.45);
      FX.flash(g, e.x, e.y, 160, '#ffffff', 0.25);
      FX.ring(g, e.x, e.y, 260, '#ffffff', 0.6, 10);
      FX.ring(g, e.x, e.y, 180, col, 0.5, 8);
      FX.burst(g, e.x, e.y, col, 50, 520, { vary: true, lifeMax: 0.9 });
      FX.debris(g, e.x, e.y, 14, [shade(col, -0.3), col, '#4a433d'], 8);
      FX.sparkles(g, e.x, e.y, 12, 90, '#ffe9a3', { delay: 0.4 });
      if (g.shake) g.shake(14, 0.6);
    });
  });

  // Spieler getroffen: korallfarbene Spritzer, rote Toenung, kurzer Text
  on('playerHurt', (e) => {
    const game = e.game;
    if (!game) return;
    FX.burst(game, e.x, e.y - 8, B.COLORS.claude, 10, 220, { vary: true });
    FX.burst(game, e.x, e.y - 8, '#ffffff', 4, 300, { streak: true, lifeMax: 0.2 });
    FX.tint(game, '200,20,20', 0.22, 0.3);
    const amt = e.amount || 1;
    const quips = (B.TEXT.EVENTS && B.TEXT.EVENTS.hurt) || ['ouch'];
    if (textLimited('hurt', 0.3)) FX.text(game, e.x, e.y - 52, amt >= 2 ? '-♥' : pick(quips), '#ff8a7a', { scale: 2, life: 0.8 });
  });

  // Spieler stirbt: grosser Korall-Puff, die Funkel-Antenne fliegt davon
  on('playerDeath', (e) => {
    const game = e.game;
    FX.flash(game, e.x, e.y, 70, '#ffffff', 0.2);
    FX.burst(game, e.x, e.y - 8, B.COLORS.claude, 36, 380, { vary: true, lifeMax: 1.0 });
    FX.ring(game, e.x, e.y, 120, B.COLORS.claude, 0.6, 8);
    FX.smoke(game, e.x, e.y, 6, 14, '#5a2717');
    add(game, new Sparkle(e.x, e.y - 50, 14, '#ffcf4d', 1.6, rand(-30, 30), -140, 0.05));
    FX.sparkles(game, e.x, e.y - 30, 8, 40, '#ffe9a3', { rise: 30, delay: 0.3 });
  });

  // Pickup eingesammelt: Funkeln in Pickup-Farbe + Text
  on('pickup', (e) => {
    const col = e.color || '#ffffff';
    FX.sparkles(e.game, e.x, e.y, 5, 18, shade(col, 0.45), { sizeMin: 4, sizeMax: 8, delay: 0.1 });
    FX.ring(e.game, e.x, e.y, 26, shade(col, 0.2), 0.25, 3);
    const txt = B.TEXT.PICKUP && B.TEXT.PICKUP[e.type];
    if (txt) FX.text(e.game, e.x, e.y - 24, txt, shade(col, 0.35), { scale: 2, life: 0.85 });
  });

  // Item aufgenommen: goldener Ring + Strahlen-Funkeln ueber dem Kopf
  on('itemGet', (e) => {
    const game = e.game;
    if (!game) return;
    const x = e.x, y = e.y - 60;
    FX.flash(game, x, y, 40, '#fff4d0', 0.18);
    FX.ring(game, x, y, 90, '#ffcf4d', 0.55, 6);
    FX.sparkles(game, x, y, 7, 56, '#ffe9a3', { speed: 50, delay: 0.35 });
  });

  // Raum geschafft: Schimmer + gelegentlich ein Spruch
  on('roomClear', (e) => {
    const game = e.game;
    if (!game || e.room !== game.room) return;
    FX.shimmer(game);
    const p = playerPos(game);
    FX.sparkles(game, p.x, p.y - 20, 6, 50, '#ffe9a3', { delay: 0.3 });
    if (Math.random() < 0.55 && B.TEXT.CLEAR_QUIPS) {
      // Etagen-eigene Sprueche (B.TEXT.THEME_QUIPS) haben auf ihrer Etage halbe Chance
      const theme = B.themeFor ? B.themeFor(game.depth) : null;
      const own = theme && B.TEXT.THEME_QUIPS && B.TEXT.THEME_QUIPS[theme.key];
      const list = own && Math.random() < 0.5 ? own : B.TEXT.CLEAR_QUIPS;
      FX.text(game, B.C.ROOM_W / 2, B.C.ROOM_H / 2 - 40, pick(list), '#c8f0b8', { scale: 3, life: 1.4, vy: -30 });
    }
  });

  /** Staubwolken an allen Tuerschwellen eines Raums */
  function doorDust(room, game, strong) {
    if (!game || room !== game.room) return;
    for (const dir of Object.keys(room.doors)) {
      const door = room.doors[dir];
      if (door.edge.hidden) continue;
      const d = B.C.DOOR_TILES[dir];
      const c = room.tileCenter(d.col, d.row);
      const v = B.DIRS[dir];
      const x = c.x - v.dx * 40, y = c.y - v.dy * 40;
      FX.smoke(game, x, y, strong ? 4 : 2, 14, '#8a8178');
      FX.burst(game, x, y, '#9a9088', strong ? 6 : 3, 120, { lifeMin: 0.2, lifeMax: 0.45, sizeMin: 3, sizeMax: 6 });
    }
  }
  on('doorsClose', (e) => {
    const game = B.game;
    doorDust(e.room, game, true);
    if (game && e.room === game.room && game.shake) game.shake(4, 0.15); // Tuer knallt zu
  });
  on('doorsOpen', (e) => doorDust(e.room, B.game, false));

  // Explosion (Force Push): Blitz, Doppelring, Feuer, Rauch, Truemmer
  on('explosion', (e) => {
    const game = e.game, R = e.radius || 110;
    FX.flash(game, e.x, e.y, R * 1.1, '#fff1c4', 0.14);
    FX.ring(game, e.x, e.y, R * 1.25, '#ffb347', 0.4, 10);
    FX.ring(game, e.x, e.y, R * 0.8, '#ffffff', 0.25, 4);
    FX.burst(game, e.x, e.y, '#ffb347', 22, 460, { vary: true, lifeMin: 0.25, lifeMax: 0.55 });
    FX.burst(game, e.x, e.y, '#ff6a3d', 10, 360, { streak: true, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 4, sizeMax: 6 });
    FX.smoke(game, e.x, e.y, 10, R * 0.4, '#3a3430');
    FX.debris(game, e.x, e.y, 8, ['#5c544d', '#7a7068', '#3a332e'], 6);
    FX.tint(game, '255,200,120', 0.12, 0.2);
  });

  // Projektil endet: Spritzer an Wand/Gegner bzw. "Tropfen" am Ende der Reichweite
  on('projectileEnd', (e) => {
    const col = e.color || '#ffffff';
    if (e.impact) {
      FX.burst(e.game, e.x, e.y, col, 5, 150, { vary: true, lifeMin: 0.12, lifeMax: 0.3, sizeMin: 3, sizeMax: 6 });
      FX.ring(e.game, e.x, e.y, 16, shade(col, 0.3), 0.16, 3);
    } else {
      FX.burst(e.game, e.x, e.y + 6, col, 3, 60, { lifeMin: 0.15, lifeMax: 0.3, sizeMin: 3, sizeMax: 5 });
    }
  });

  // Fels zerbricht
  on('rockBreak', (e) => {
    if (e.kind === 'cactus') {
      // Kaktus gesprengt: gruene Stuecke, helle Stacheln, Sandstaub
      FX.debris(e.game, e.x, e.y, 8, ['#8fbf5a', '#5f9238', '#3d6626', '#17240f'], 7);
      FX.burst(e.game, e.x, e.y, '#f6efd8', 8, 220, { streak: true, lifeMin: 0.15, lifeMax: 0.3, sizeMin: 2, sizeMax: 3 });
      FX.smoke(e.game, e.x, e.y, 3, 12, '#c9a46a');
      return;
    }
    FX.debris(e.game, e.x, e.y, 9, ['#8c8278', '#b0a699', '#6a6158', '#4c453f'], 8);
    FX.smoke(e.game, e.x, e.y, 3, 12, '#7a7068');
  });

  // Kaktus gestochen (Sandbox Borders): ein paar helle Stacheln spritzen an der Beruehrungsstelle weg
  on('cactusPrick', (e) => {
    FX.burst(e.game, e.x, e.y, '#f6efd8', 6, 200, { streak: true, lifeMin: 0.1, lifeMax: 0.22, sizeMin: 2, sizeMax: 3 });
    FX.burst(e.game, e.x, e.y, '#5f9238', 3, 120, { lifeMin: 0.15, lifeMax: 0.3, sizeMin: 3, sizeMax: 4 });
  });

  on('bombPlaced', (e) => FX.smoke(e.game, e.x, e.y + 10, 2, 6, '#6b625a'));

  // "denied": kurzer roter Text ueber dem Spieler (gedrosselt)
  on('denied', (e) => {
    const reason = e.reason || 'default';
    if (!textLimited('denied:' + reason, 0.8)) return;
    const game = e.game || B.game;
    const p = playerPos(game);
    const list = (B.TEXT.DENIED && (B.TEXT.DENIED[reason] || B.TEXT.DENIED.default)) || ['Denied'];
    FX.text(game, p.x, p.y - 60, pick(list), '#ff8a7a', { scale: 2, life: 1.0 });
  });

  on('purchase', (e) => {
    const game = e.game || B.game;
    const p = playerPos(game);
    FX.text(game, p.x, p.y - 64, '-' + (e.price || 0) + '¢', '#f2c14e', { scale: 2, life: 1.0 });
    FX.sparkles(game, p.x, p.y - 20, 6, 30, '#fff0b0', { delay: 0.2 });
  });

  // Terms of Service unterschrieben: das Herz geht sichtbar drauf, ohne dass es ein Treffer war
  on('termsSigned', (e) => {
    const game = e.game || B.game;
    const p = playerPos(game);
    FX.text(game, p.x, p.y - 64, '-♥♥', '#ff5a6e', { scale: 2, life: 1.1 });
    FX.ring(game, e.x, e.y, 90, '#d64545', 0.5, 5);
    FX.sparkles(game, e.x, e.y - 20, 10, 46, '#ff9aa8', { delay: 0.1 });
  });

  on('unlock', (e) => {
    const game = e.game || B.game;
    const p = playerPos(game);
    FX.text(game, p.x, p.y - 64, (B.TEXT.EVENTS && B.TEXT.EVENTS.unlock) || 'Approved', '#9be37f', { scale: 2, life: 1.1 });
    FX.sparkles(game, p.x, p.y - 30, 8, 40, '#c8f0b8', { delay: 0.2 });
  });

  on('secretFound', (e) => {
    const game = e.game || B.game;
    const p = playerPos(game);
    FX.ring(game, p.x, p.y, 140, '#c4a8ff', 0.6, 6);
    FX.sparkles(game, p.x, p.y - 20, 10, 80, '#e2d4ff', { delay: 0.3 });
  });

  on('activeUsed', (e) => {
    const game = e.game || B.game;
    const p = playerPos(game);
    FX.ring(game, p.x, p.y - 8, 160, B.COLORS.claude, 0.45, 8);
    FX.flash(game, p.x, p.y - 8, 50, '#ffe2c8', 0.12);
    if (e.def && e.def.name) FX.text(game, p.x, p.y - 70, e.def.name, '#ffd7c4', { scale: 2, life: 1.1 });
  });

  on('activeCharged', () => {
    const game = B.game;
    if (!game || !game.player) return;
    const p = game.player;
    FX.text(game, p.x, p.y - 70, (B.TEXT.EVENTS && B.TEXT.EVENTS.charged) || 'charged!', '#f6d365', { scale: 2, life: 0.9 });
  });

  on('chestOpen', (e) => {
    FX.sparkles(e.game, e.x, e.y, 10, 30, '#ffe9a3', { speed: 80 });
    FX.burst(e.game, e.x, e.y, '#c9a227', 10, 220, { vary: true });
  });

  B.Particle = Particle;
  B.Leaf = Leaf;          // fuer Tests (Laub-Effekte zaehlen)
  B.FX = FX;
})(window.BOTA);
