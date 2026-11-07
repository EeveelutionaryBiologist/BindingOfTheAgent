/*
 * enemies-deep.js — Eigene Gegner der tiefen Etagen 8–10, seit 2026-11-05: Cosine Similarity (The Latent Space),
 * Heisenbug (Undefined Behavior) und Bit Bucket (/dev/null). Daten in data/enemies.js, Sprites in sprites-enemies.js.
 *
 * Eigene Datei wie enemies-context.js; laedt nach enemy.js (benutzt B.AI und registriert in B.BEHAVIORS). Jeder
 * Gegner hat unten einen eigenen Abschnitt. Die drei bilden KEINE Familie (kein family-Feld): Jeder gehoert zu einer
 * anderen Etage und sieht anders aus, sie teilen nur die Idee, die eigene Spielweise des Spielers zu bestrafen:
 *   Cosine Similarity  wer auf ihn schiesst, bekommt den Schuss gespiegelt zurueck
 *   Heisenbug          wer dauernd auf ihn zielt, trifft ihn nie
 *   Bit Bucket         wer von weitem schiesst, fuellt ihn nur
 *
 * Etagen: themeOnly + minFloor auf ihrer Etage. Vorher gibt es sie nie, danach sickern sie ueber die Kakophonie
 * (B.mixAt) auf die spaeteren Etagen des Durchgangs ein. Deshalb muessen alle drei auch auf fremden Etagen lesbar bleiben.
 *
 * Gefahrenfarben (Kontrast zur Heimat-Etage, siehe palette.js):
 *   gold  #ffd166  auf Indigo (Latent Space); Stern und Schuss sind komplementaer zum violetten Boden
 *   gelb  #f5ff4a  auf Magenta/Violett (Undefined Behavior)
 *   rot   #ff4d3d  auf fast Schwarz (/dev/null): die einzige Farbe auf der monochromen Etage
 *
 * Nicht in der Positivliste des Summarizers (SUMMARY_BEHAVIORS): Alle drei haengen an eigenem Zustand.
 * Zufall nur ueber game.rng (nur der Ringversatz des Heisenbug); die Optik rechnet mit e.t, Math.random kommt nicht vor.
 *
 * Fairness wie ueberall: jeder Angriff mit Telegraph, Gegnerschuesse 165–260 px/s, Kontaktschaden 1.
 *
 * Zusaetzliche Bus-Events: 'enemySwallow' (Bit Bucket schluckt einen Schuss: { fill, color }), 'enemyFlush' (Bit Bucket
 * leert sich: { r, color }); 'enemyWindup' mit { sound } fuer die Warntoene.
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const AI = B.AI;
  const TAU = Math.PI * 2;

  // ---- Cosine Similarity ('cosine_similarity', The Latent Space) ----
  // Ein Sternbild-Kompass, der immer auf der anderen Seite des Raums sein will: Sein Ziel ist die Spielerposition,
  // punktgespiegelt an der Raummitte.
  //
  // Bewegung: Der Zielpunkt wird aus dem Abstand keep + 20 um den Spieler herausgeschoben (steht der Spieler nahe der
  // Mitte, faellt das Spiegelbild sonst auf ihn). Steht der Spieler zwischen ihm und dem Ziel, laeuft er aussen herum:
  // In der Naehe wird der Geschwindigkeitsanteil zum Spieler hin gestrichen und durch eine Tangente ersetzt. Unter
  // keep flieht er zusaetzlich nach aussen. Wer ihn gezielt in die Ecke treibt, kann ihn trotzdem beruehren.
  //
  // Angriff: Er greift nur an, wenn der Spieler schiesst, und zwar genau einmal je windup: Der naechste Spielerschuss
  // merkt die Gegenrichtung vor (B.DIRS umgedreht), nach windup s Gluehen und sichtbarer Schussbahn fliegt der
  // Gegenschuss. Weitere Spielerschuesse in dieser Zeit zaehlen nicht, also hoechstens ein Schuss je windup. Weil er
  // punktgespiegelt steht, trifft das nur, wenn man genau auf ihn schiesst; schraeg zu ihm zu feuern ist sicher.
  //
  // Erkennung der Spielerschuesse: EIN Listener fuer die ganze Datei, kein Listener je Gegner. So kann beim Tod oder
  // Raumwechsel nichts liegen bleiben. Der Vergleich mit runStats.time heisst "in genau diesem Tick geschossen": Der
  // Spieler rechnet vor den Gegnern (game.updatePlay), und alte Schuesse aus einem anderen Raum oder aus der Zeit
  // einer Eiszeit (frozen: update laeuft nicht) werden nie nachgeholt.
  const lastShot = { at: -1, dir: null };
  B.bus.on('shoot', (ev) => { lastShot.at = ev.game.runStats.time; lastShot.dir = ev.dir; });
  B.bus.on('runStart', () => { lastShot.at = -1; lastShot.dir = null; });

  const CS_GOLD = '#ffd166';

  /** Zielpunkt: Spiegelbild des Spielers, aus dem Mindestabstand geschoben und in den Raum geklemmt */
  function csTarget(e, p) {
    const P = e.params, R = e.r + 6;
    const mx = B.C.ROOM_W - p.x, my = B.C.ROOM_H - p.y;
    let dx = mx - p.x, dy = my - p.y;
    let d = Math.hypot(dx, dy);
    const want = P.keep + 20;
    if (d < want) {
      if (d < 1) { dx = e.x - p.x; dy = e.y - p.y; d = Math.hypot(dx, dy); }
      if (d < 1) { dx = 1; dy = 0; d = 1; }
      return AI.clampToRoom(p.x + (dx / d) * want, p.y + (dy / d) * want, R);
    }
    return AI.clampToRoom(mx, my, R);
  }

  /** Geschwindigkeit setzen: zum Ziel, um den Spieler herum, unter keep zusaetzlich weg von ihm */
  function csSteer(e, game) {
    const P = e.params, p = game.player;
    const t = csTarget(e, p);
    const dist = Math.hypot(t.x - e.x, t.y - e.y);
    if (dist < 4) { AI.stop(e); } else {
      const sp = e.speed * Math.min(1, dist / 60);   // sanft ankommen statt zittern
      e.vx = ((t.x - e.x) / dist) * sp;
      e.vy = ((t.y - e.y) / dist) * sp;
    }
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d >= P.keep + 40 || d < 1) return;
    const nx = (e.x - p.x) / d, ny = (e.y - p.y) / d;
    const radial = e.vx * nx + e.vy * ny;
    if (radial < 0) {
      // Anteil zum Spieler hin streichen und stattdessen seitlich vorbei; die Seite ergibt sich aus dem Ziel
      e.vx -= nx * radial;
      e.vy -= ny * radial;
      const side = (t.x - e.x) * ny - (t.y - e.y) * nx >= 0 ? 1 : -1;
      e.vx += ny * side * e.speed * 0.7;
      e.vy -= nx * side * e.speed * 0.7;
    }
    if (d < P.keep) {
      const k = P.flee * (0.4 + 0.6 * (1 - d / P.keep));
      e.vx += nx * k;
      e.vy += ny * k;
    }
  }

  B.BEHAVIORS.cosine_similarity = {
    init(e) {
      const s = e.state;
      s.aim = null;     // Winkel des vorgemerkten Gegenschusses (null = nichts vorgemerkt)
      s.t = 0;          // Restzeit des Telegraphs
      s.told = 0;       // tatsaechlich abgelaufene Telegraph-Zeit (Tests)
      s.shots = 0;      // abgefeuerte Gegenschuesse (Tests)
    },

    update(e, dt, game) {
      const s = e.state, P = e.params;
      csSteer(e, game);
      if (s.aim === null && lastShot.at === game.runStats.time && lastShot.dir) {
        const d = B.DIRS[lastShot.dir];
        s.aim = Math.atan2(-d.dy, -d.dx);
        s.t = P.windup;
        s.told = 0;
        B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y, sound: 'mirrorPing' });
      }
      if (s.aim === null) return;
      s.t -= dt;
      s.told += dt;
      if (s.t > 0) return;
      const shot = AI.shoot(game, e, s.aim, AI.shotSpeed(game, P.shotSpeed), { color: CS_GOLD, r: 7 });
      if (shot) {
        s.shots++;
        // Liegt der Spieler auf der Schussbahn, war es ein Volltreffer der Spiegelung: kleiner Kommentar
        const p = game.player, cx = Math.cos(s.aim), cy = Math.sin(s.aim);
        const along = (p.x - e.x) * cx + (p.y - e.y) * cy;
        if (along > 0 && Math.abs((p.x - e.x) * cy - (p.y - e.y) * cx) < 40) AI.say(e, 'cos = -1', 0.9, CS_GOLD);
      }
      s.aim = null;
    },

    drawUnder(e, ctx, game) {
      // Feine Linie durch die Raummitte zum Spieler: erklaert, warum er dort steht, wo er steht
      const p = game.player;
      if (!p) return;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = CS_GOLD;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 10]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(B.C.ROOM_W / 2, B.C.ROOM_H / 2);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    },

    drawOver(e, ctx) {
      const s = e.state;
      if (s.aim === null) return;
      const k = 1 - Math.max(0, s.t) / e.params.windup;
      AI.drawGlow(ctx, e.x, e.y, e.r + 8 + k * 6, k, CS_GOLD);
      AI.drawRays(ctx, e.x, e.y, [s.aim], e.r, 240, 0.5 + 0.5 * k, CS_GOLD);
      AI.drawMark(ctx, '!', e.x, e.y - e.r - 8, e.t, CS_GOLD);
    },
  };

  // ---- Heisenbug ('heisenbug', Undefined Behavior) ----
  // Ein Bug, der verschwindet, sobald man ihn untersucht. "Beobachtet" heisst: Der Spieler haelt gerade eine
  // Feuerrichtung (B.input.shootDir) und der Bug liegt hoechstens cone Radiant daneben. Waende spielen keine Rolle.
  //
  //   beobachtet     steht still, intangible (Schuesse fliegen durch, kein Kontaktschaden), flackernder Umriss,
  //                  ab und zu ein Spruch; ein laufender Telegraph bricht ab, die Uhr steht wieder auf 0
  //   unbeobachtet   fest und verwundbar, schleicht zum Spieler; nach calm s am Stueck: Telegraph (tell s, Strahlen
  //                  = Schussrichtungen), dann ein Ring aus shots Schuessen
  //
  // Dauerfeuer auf ihn bringt also nichts: Wer antippt und loslaesst, hat den Schuss noch in der Luft, wenn der Bug
  // wieder fest wird (intangible wird in projectile.js je Tick geprueft, durchflogene Treffer zaehlen nicht).
  // Andersherum ist Hinsehen die Verteidigung: Solange man auf ihn zielt, tut er nichts.
  //
  // Die Beobachtung gilt immer, auch waehrend spawnDelay und frozen, darum laeuft sie in afterMove (jeden Tick).
  //
  // Flaechenschaden (keine Quelle: Explosion, rm -rf, Pager) trifft ihn auch beobachtet, sonst koennte man ihn
  // nicht mit einer Bombe ausheben. hurt() lehnt intangible Gegner ab, also huellt init hurt NUR an diesem Exemplar
  // (wie der Rolling Release takeHit; die Enemy-Klasse bleibt unveraendert). Zielsuchende Schuesse und Orbitale
  // pruefen intangible selbst und lassen ihn beobachtet in Ruhe; der Raum bleibt immer raeumbar, denn loslassen genuegt.
  const HB_WARN = '#f5ff4a';
  const HB_LINES = ['cannot reproduce', 'works on my machine', 'closed: no repro'];

  /** Liegt der Bug im Blickkegel des Spielers? */
  function hbObserved(e, game) {
    const dir = B.input.shootDir();
    if (!dir) return false;
    const p = game.player, dx = e.x - p.x, dy = e.y - p.y;
    if (Math.hypot(dx, dy) < 1) return false;
    const d = B.DIRS[dir];
    return Math.abs(B.M.angleDiff(Math.atan2(d.dy, d.dx), Math.atan2(dy, dx))) <= e.params.cone;
  }

  /** Beobachtung neu bewerten; beim Wechsel zu "beobachtet" faellt die Wellenfunktion zusammen */
  function hbLook(e, game) {
    const s = e.state;
    const seen = hbObserved(e, game);
    if (seen && !s.observed) {
      s.calm = 0;
      s.tell = 0;
      s.told = 0;
      if (e.t >= s.quipAt) {
        AI.say(e, HB_LINES[s.quip++ % HB_LINES.length], 1.2, HB_WARN);
        s.quipAt = e.t + e.params.quipGap;
      }
    }
    s.observed = seen;
    e.intangible = seen;
  }

  B.BEHAVIORS.heisenbug = {
    init(e) {
      const s = e.state;
      s.observed = false;
      s.calm = 0;       // Sekunden am Stueck unbeobachtet (Pausen durch frozen zaehlen nicht)
      s.tell = 0;       // Restzeit des Telegraphs (0 = keiner)
      s.told = 0;       // tatsaechlich abgelaufene Telegraph-Zeit (Tests)
      s.off = 0;        // Winkelversatz des Rings
      s.rings = 0;      // abgefeuerte Ringe (Tests)
      s.quip = 0;       // naechster Spruch
      s.quipAt = 0;     // frueheste Zeit (e.t) fuer den naechsten Spruch
      const baseHurt = e.hurt;
      e.hurt = function (amount, g, source) {
        if (source || !this.intangible) return baseHurt.call(this, amount, g, source);
        this.intangible = false;
        const hit = baseHurt.call(this, amount, g, source);
        this.intangible = true;
        return hit;
      };
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      hbLook(e, game);
      if (s.observed) { AI.stop(e); return; }
      if (s.tell > 0) {
        AI.stop(e);
        s.tell -= dt;
        s.told += dt;
        if (s.tell <= 0) {
          AI.ring(game, e, P.shots, AI.shotSpeed(game, P.shotSpeed), s.off, { color: HB_WARN, r: 7 });
          s.rings++;
          s.tell = 0;
          s.calm = 0;
        }
        return;
      }
      AI.pathToward(e, game, p.x, p.y, e.speed);
      s.calm += dt;
      if (s.calm >= P.calm) {
        s.tell = P.tell;
        s.told = 0;
        s.off = game.rng.angle();
        B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y, sound: 'glitch' });
      }
    },

    afterMove(e, dt, game) { hbLook(e, game); },

    draw(e, ctx) {
      const s = e.state;
      if (s.observed) {
        // Flackernder Umriss: zwei versetzte, blasse Abzuege und ein gestrichelter Kreis (rein aus e.t, kein Zufall)
        const f = 0.5 + 0.5 * Math.sin(e.t * 31);
        const j = 2 * Math.sin(e.t * 47);
        AI.drawBody(e, ctx, { alpha: 0.12 + 0.16 * f, dx: j });
        AI.drawBody(e, ctx, { alpha: 0.1 + 0.1 * (1 - f), dx: -j, dy: 1 });
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.35 * f;
        ctx.strokeStyle = HB_WARN;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -e.t * 40;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else {
        AI.drawBody(e, ctx);
        if (s.tell > 0) {
          const k = 1 - s.tell / e.params.tell;
          const rays = [];
          for (let i = 0; i < e.params.shots; i++) rays.push(s.off + (i * TAU) / e.params.shots);
          AI.drawGlow(ctx, e.x, e.y, e.r + 10, k, HB_WARN);
          AI.drawRays(ctx, e.x, e.y, rays, e.r + 2, 70, 0.5 + 0.5 * k, HB_WARN);
          AI.drawMark(ctx, '!', e.x, e.y - e.r - 8, e.t, HB_WARN);
        }
      }
      AI.drawSay(e, ctx);
    },
  };

  // ---- Bit Bucket ('bit_bucket', /dev/null) ----
  // Ein treibender Eimer ueber einer dunklen Scheibe. Spielerschuesse, die in die Scheibe EINTRETEN, sind weg (auch
  // spektrale und durchschlagende, deshalb kein Kollisionstrick, sondern der Hook bendShot aus projectile.js). Wer
  // treffen will, muss in die Scheibe hineingehen: Schuesse, die schon drinnen entstehen, sind ausgenommen.
  //
  // Eintritt je Schuss und Eimer: s.seen (WeakMap Schuss -> war zuletzt innen). Nur der Wechsel aussen -> innen
  // schluckt. Der erste Blick auf einen Schuss schluckt nie, so bleiben drinnen abgefeuerte Schuesse und deren
  // Splitter (Microservices) verschont; prallt so ein Schuss hinaus und wieder hinein, ist auch er weg.
  // Eingefroren (und waehrend spawnDelay) schluckt er nicht; wer in dieser Zeit hineinflog, bleibt verschont.
  //
  // Ablauf (s.mode):
  //   drift  treibt langsam auf den Spieler zu, so steht er nie unerreichbar in einer Ecke
  //   tell   voll (fillMax Schuesse): steht still, Richtung festgelegt, Strahlen = spaetere Schussbahnen, "!"
  //   rest   Faecher aus fan Schuessen ist raus ('enemyFlush'), leer; kurz still, dann wieder drift
  // In tell und rest schluckt er weiter, der Pegel bleibt in tell aber am Anschlag.
  //
  // Der ganze Gegner liegt auf drawLayer -1: die Scheibe ist Boden, der Spieler laeuft darueber. Scheibe und Zustand
  // gehoeren zum Gegner selbst, beim Tod bleibt also nichts zurueck. Auf der fast schwarzen Etage liest man sie am
  // hellen Rand, nicht an der Fuellung.
  const BB_WARN = '#ff4d3d';
  const BB_RIM = '#d0d0d8';

  B.BEHAVIORS.bit_bucket = {
    init(e) {
      const s = e.state;
      e.drawLayer = -1;
      e.sayOffset = 16;         // Text ueber den Fuellstand-Kaestchen und dem "!" (drawOver)
      s.mode = 'drift';
      s.fill = 0;               // geschluckte Schuesse (0..fillMax)
      s.t = 0;                  // Restzeit in tell/rest
      s.told = 0;               // tatsaechlich abgelaufene Telegraph-Zeit (Tests)
      s.aim = 0;                // Mittelwinkel des Faechers (beim Start des Telegraphs festgelegt)
      s.seen = new WeakMap();   // Schuss -> war zuletzt in der Scheibe
      s.swallowed = 0;          // insgesamt geschluckt (Tests)
      s.flushes = 0;            // Faecher (Tests)
      s.gulp = 0;               // Pumpen nach dem Schlucken (nur Optik, klingt ab)
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      s.gulp = Math.max(0, s.gulp - dt * 4);
      if (s.mode === 'tell') {
        AI.stop(e);
        s.t -= dt;
        s.told += dt;
        if (s.t <= 0) {
          AI.fanAngle(game, e, s.aim, P.fan, P.spread, AI.shotSpeed(game, P.shotSpeed), { color: BB_WARN, r: 7 });
          s.fill = 0;
          s.flushes++;
          s.mode = 'rest';
          s.t = P.rest;
          e.sayT = 0;
          B.bus.emit('enemyFlush', { game, enemy: e, x: e.x, y: e.y, r: P.discR, color: BB_WARN });
        }
        return;
      }
      if (s.mode === 'rest') {
        AI.stop(e);
        s.t -= dt;
        if (s.t <= 0) s.mode = 'drift';
        return;
      }
      if (s.fill >= P.fillMax) {
        AI.stop(e);
        s.mode = 'tell';
        s.t = P.tell;
        s.told = 0;
        s.aim = AI.angleTo(e, p);
        AI.say(e, 'flush()', P.tell, BB_WARN);
        B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y, sound: 'gurgle' });
        return;
      }
      if (AI.dist(e, p) > P.near) AI.toward(e, p.x, p.y, e.speed);
      else AI.stop(e);
    },

    bendShot(e, shot, dt, game) {
      const s = e.state, P = e.params;
      const inside = Math.hypot(shot.x - e.x, shot.y - e.y) < P.discR;
      const was = s.seen.get(shot);
      s.seen.set(shot, inside);
      if (!inside || was !== false || e.frozen > 0 || e.spawnDelay > 0) return;
      if (s.mode !== 'tell') s.fill = Math.min(P.fillMax, s.fill + 1);
      s.swallowed++;
      s.gulp = 1;
      B.bus.emit('enemySwallow', { game, enemy: e, x: shot.x, y: shot.y, fill: s.fill, color: shot.color });
      shot.die(game, false);
    },

    drawUnder(e, ctx) {
      const s = e.state, P = e.params;
      const off = e.frozen > 0 || e.spawnDelay > 0;     // schluckt gerade nicht: sichtbar schwaecher
      const full = s.fill / P.fillMax;
      const R = P.discR;
      ctx.save();
      ctx.globalAlpha = off ? 0.3 : 0.8;
      const g = ctx.createRadialGradient(e.x, e.y, R * 0.2, e.x, e.y, R);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(0.75, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, TAU);
      ctx.fill();
      // Drei Spiralarme zeigen, dass hier etwas hineinlaeuft
      ctx.strokeStyle = BB_RIM;
      ctx.globalAlpha = off ? 0.05 : 0.12;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a0 = -e.t * 0.9 + (i * TAU) / 3;
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const rr = R * (0.95 - 0.07 * k), a = a0 + k * 0.28;
          if (k === 0) ctx.moveTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
          else ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      // Rand: die eigentliche Grenze. Je voller, desto roter und dicker
      ctx.globalAlpha = off ? 0.25 : 0.7;
      ctx.strokeStyle = full >= 0.75 ? BB_WARN : BB_RIM;
      ctx.lineWidth = 2 + 2 * full;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = e.t * 14;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    drawOver(e, ctx) {
      const s = e.state, P = e.params;
      e.scale = 1 + 0.12 * s.gulp;
      // Fuellstand: vier Kaestchen ueber dem Eimer
      const w = 8, gap = 3, x0 = e.x - (P.fillMax * (w + gap) - gap) / 2, y = e.y - e.r - 14;
      for (let i = 0; i < P.fillMax; i++) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x0 + i * (w + gap) - 1, y - 1, w + 2, w + 2);
        ctx.fillStyle = i < s.fill ? BB_WARN : '#3a3a42';
        ctx.fillRect(x0 + i * (w + gap), y, w, w);
      }
      if (s.mode !== 'tell') return;
      const k = 1 - Math.max(0, s.t) / P.tell;
      const rays = [];
      for (let i = 0; i < P.fan; i++) rays.push(s.aim + (i - (P.fan - 1) / 2) * P.spread);
      AI.drawGlow(ctx, e.x, e.y, e.r + 10, k, BB_WARN);
      AI.drawRays(ctx, e.x, e.y, rays, e.r + 2, 150, 0.5 + 0.5 * k, BB_WARN);
      AI.drawMark(ctx, '!', e.x, y - 4, e.t, BB_WARN);
    },
  };
})(window.BOTA);
