/*
 * enemies-context.js — Gegner-Familie von The Context Limit (family: 'context', themeOnly: ['context']), seit 2026-11-03.
 *
 * Eigene Datei, damit die drei Mitglieder unabhaengig voneinander entstehen koennen; laedt nach enemy.js (benutzt
 * B.AI und registriert in B.BEHAVIORS). Jedes Mitglied hat einen eigenen Abschnitt (Slot) unten.
 *
 * Gemeinsame Bildsprache (siehe auch B.CONTEXT_COLORS in sprites-enemies.js):
 *  - Blass, durchnaesst, ein wenig traurig: Glas, Tinte, aufgeweichtes Papier, Wasser.
 *  - Der Boden ist dunkles Graublau und es regnet hellblau: GEFAHR ist deshalb nie blau, sondern warm —
 *    Warnlinien/Telegraphen Bernstein (CTX.warn), Schuesse Koralle (CTX.shot). Blau nur fuer Harmloses (Wasser-Optik).
 *  - Treffer/Tod: Familien-Effekte (Spritzer, aufgeweichte Papierfetzen) und -Klaenge (dripHit, soggyDeath,
 *    gurgle als Warnton) kommen automatisch ueber family: 'context' (effects.js / audio.js).
 *  - Fairness wie ueberall: jeder Angriff mit Telegraph, Gegnerschuesse 165–260 px/s, Kontaktschaden 1 (2 fuer Ansturm).
 *
 * Ab Etage 8 gilt die Kakophonie (enemies.js): die Familie taucht dann abgeschwaecht auch auf anderen Etagen auf.
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const AI = B.AI;
  /** Gemeinsame Farben der Familie (Gefahr warm, Wasser blau) */
  const CTX = { warn: '#ffb347', shot: '#ff8a5c', water: '#9ec5ff', pale: '#d6e4ff', ink: '#1b2433' };
  B.CONTEXT_DANGER = CTX;
  void AI;

  // ---- Context-Familie: Slot 1 (Overflow Buffer) ----
  // Overflow Buffer ('overflow_buffer') und seine Pfuetze ('overflow_puddle'). Daten in data/enemies.js.
  //
  // Ablauf (state.mode):
  //   fill   Pegel steigt um dt/fillTime pro Sekunde; jeder Treffer (takeHit-Huelle) schuettet hitFill dazu.
  //          Schlurft langsam auf den Spieler zu (weiter als near) bzw. tritt auf der Stelle; je voller, desto
  //          traeger (Tempo x (1 - fill/2)).
  //   warn   Voll: steht still, das Glas springt sichtbar, "[OVERFLOW]", Bernstein-Gluehen, gestrichelte Strahlen in
  //          genau die spaeteren Schussrichtungen und der Pfuetzenradius als Kreis am Boden; 'enemyWindup' ohne
  //          eigenen Ton (= Familien-Gurgeln). Dauer warn (>= 0.6 s), eingefroren laeuft sie nicht ab.
  //   Platzen: Ring aus shots Koralle-Tropfen (AI.shotSpeed(shotSpeed)), Pfuetze an seinem Fuss, 'enemyOverflow'.
  //   rest   leer und still (rest s), danach wieder fill ab 0. Treffer in warn/rest heben den Pegel nicht.
  // Die Pfuetze ist ein eigener Minion, damit sie ihren Tank ueberleben und sauber auslaufen kann: sie bremst den
  // Spieler ueber player.slowBy (gilt je Tick, stapelt nicht; Flieger nicht) und verschwindet still (e.dead ohne
  // Kill/Beute), wenn ihre Zeit um ist. killAll toetet sie wie jeden anderen Gegner.
  // Alles Zufaellige (Ringversatz) kommt aus game.rng; Math.random wird hier nicht benutzt (die Optik haengt an e.t).
  const OB_IN = { x0: -16, x1: 16, y0: -14, y1: 14 };   // Innenraum des Tanks relativ zur Sprite-Mitte (Sprite-Kommentar)
  const OB_FOOT = 16;                                     // Pfuetzenmitte: so weit unter der Tankmitte (Fuesse)
  const OB_TAU = Math.PI * 2;
  // Risslinien im Glas (relativ zur Mitte), werden waehrend des Telegraphs nach und nach "gezogen"
  const OB_CRACKS = [
    [[-5, -14], [-2, -8], [-7, -3], [-3, 3], [-6, 9]],
    [[16, -6], [10, -3], [12, 2], [6, 6]],
    [[3, -14], [6, -9], [2, -5]],
  ];

  /** Telegraph starten: Ringversatz festlegen (aus game.rng), damit Strahlen und Schuesse uebereinstimmen */
  function obStartWarn(e, game) {
    const s = e.state, P = e.params;
    s.mode = 'warn';
    s.fill = 1;
    s.t = P.warn;
    s.warned = 0;
    s.off = game.rng.angle();
    AI.say(e, '[OVERFLOW]', P.warn + 0.35, CTX.warn);
    B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
  }

  /** Platzen: Tropfenring, Pfuetze am Fuss, dann leer von vorn */
  function obBurst(e, game) {
    const s = e.state, P = e.params;
    AI.ring(game, e, P.shots, AI.shotSpeed(game, P.shotSpeed), s.off, { color: CTX.shot, r: 7 });
    const def = B.ENEMIES.overflow_puddle;
    if (def && game.room) {
      const pos = AI.clampToRoom(e.x, e.y + OB_FOOT, 0);
      const pd = new B.Enemy(def, 'overflow_puddle', pos.x, pos.y, game, 1);
      pd.spawnDelay = 0;
      pd.state.R = P.puddleR;
      pd.state.life = P.puddleLife;
      pd.state.slow = P.puddleSlow;
      game.room.enemies.push(pd);
      s.puddle = pd;
    }
    s.bursts++;
    s.mode = 'rest';
    s.t = P.rest;
    s.fill = 0;
    s.slosh = 1;
    e.sayT = 0;
    B.bus.emit('enemyOverflow', { game, enemy: e, x: e.x, y: e.y, r: P.puddleR, color: CTX.water });
  }

  /** Aktueller Pfuetzenradius: waechst in grow s auf, schrumpft beim Ausblenden leicht (Bremszone = Zeichnung) */
  function obPuddleR(e) {
    const s = e.state;
    const g = Math.min(1, s.age / s.grow);
    const k = Math.max(0, Math.min(1, (s.life - s.age) / s.fade));
    return s.R * (0.3 + 0.7 * (1 - (1 - g) * (1 - g))) * (0.8 + 0.2 * k);
  }

  /** Gestrichelter Kreis mit dunkler Unterkante (liest sich im Regen) */
  function obDashedCircle(ctx, x, y, r, color, alpha, width) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.setLineDash([8, 6]);
    for (const [col, w] of [[CTX.ink, width + 3], [color, width]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, OB_TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  B.BEHAVIORS.overflow_buffer = {
    init(e) {
      const s = e.state;
      s.mode = 'fill';
      s.fill = 0;          // Pegel 0..1
      s.t = 0;             // Restzeit im aktuellen Zustand (warn/rest)
      s.warned = 0;        // tatsaechlich abgelaufene Telegraph-Zeit (Tests)
      s.off = 0;           // Winkelversatz des Tropfenrings
      s.bursts = 0;        // Anzahl Ueberlaeufe (Tests)
      s.slosh = 0;         // Schwappen nach Treffern/Platzen (nur Optik, klingt ab)
      s.puddle = null;     // zuletzt gelegte Pfuetze (Tests)
      // Treffer heben den Pegel: takeHit NUR an diesem Exemplar umhuellen (wie beim Rolling Release; die
      // Enemy-Klasse bleibt unveraendert). Zaehlt jeder Treffer, der Schaden macht (Schuss, Bombe, Item).
      const baseTakeHit = e.takeHit;
      e.takeHit = function (amount, g, source, at) {
        const hit = baseTakeHit.call(this, amount, g, source, at);
        const st = this.state;
        if (hit && amount > 0 && !this.dead && st.mode === 'fill') {
          st.fill = Math.min(1, st.fill + this.params.hitFill);
          st.slosh = 1;
        }
        return hit;
      };
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.slosh > 0) s.slosh = Math.max(0, s.slosh - dt * 1.6);
      if (s.mode === 'fill') {
        s.fill = Math.min(1, s.fill + dt / P.fillTime);
        const spd = e.speed * (1 - 0.5 * s.fill);
        if (AI.dist(e, p) > P.near) AI.pathToward(e, game, p.x, p.y, spd);
        else AI.wander(e, dt, game, spd * 0.5);
        if (s.fill >= 1) obStartWarn(e, game);
      } else if (s.mode === 'warn') {
        AI.stop(e);
        s.t -= dt;
        s.warned += dt;
        if (s.t <= 0) obBurst(e, game);
      } else {
        AI.stop(e);
        s.t -= dt;
        if (s.t <= 0) { s.mode = 'fill'; s.fill = 0; }
      }
    },

    draw(e, ctx) {
      const s = e.state, P = e.params;
      const warn = s.mode === 'warn';
      const k = warn ? B.M.clamp(1 - s.t / P.warn, 0, 1) : 0;   // Telegraph-Fortschritt 0..1
      const appear = e.spawnDelay > 0 ? 0.3 + 0.7 * (1 - e.spawnDelay / 0.5) : 1;
      const pulse = 0.5 + 0.5 * Math.sin(e.t * 18);

      // 1) Telegraph am Boden und in der Luft: Pfuetzenradius + Strahlen in die Schussrichtungen
      if (warn) {
        const cy = Math.min(e.y + OB_FOOT, B.C.INNER.y1);
        obDashedCircle(ctx, e.x, cy, P.puddleR * (0.55 + 0.45 * k), CTX.warn, 0.45 + 0.4 * k, 2);
        AI.drawGlow(ctx, e.x, e.y, e.r + 8 + 4 * pulse, 0.35 + 0.5 * k * pulse, CTX.warn);
        const angles = [];
        for (let i = 0; i < P.shots; i++) angles.push(s.off + (i * OB_TAU) / P.shots);
        AI.drawRays(ctx, e.x, e.y, angles, e.r + 8, 18 + 30 * k, 0.45 + 0.5 * k, CTX.warn);
      }

      // 2) Innenraum: blasses Glas, Fluessigkeit mit welliger Oberflaeche, leuchtende Textfetzen
      const sh = warn ? Math.sin(e.t * 70) * 1.6 * k : 0;   // Zittern kurz vor dem Platzen
      const bx = e.x + sh, by = e.y;
      const x0 = bx + OB_IN.x0, x1 = bx + OB_IN.x1, y0 = by + OB_IN.y0, y1 = by + OB_IN.y1;
      const lvl = y1 - (y1 - y0) * B.M.clamp(s.fill, 0, 1);
      const moving = Math.abs(e.vx) + Math.abs(e.vy) > 5;
      const amp = 0.8 + 2.4 * s.slosh + (warn ? 1.5 : 0) + (moving ? 0.8 : 0);
      const surf = (x) => lvl + Math.sin(e.t * 5 + x * 0.35) * amp;
      ctx.save();
      ctx.globalAlpha *= appear;
      const a0 = ctx.globalAlpha;
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.fillStyle = 'rgba(150,178,215,0.3)';    // leeres Glas: blass und durchscheinend
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (s.fill > 0.005) {
        ctx.fillStyle = '#3f6aa0';
        ctx.beginPath();
        ctx.moveTo(x0, y1);
        for (let x = x0; x <= x1 + 0.1; x += 2) ctx.lineTo(x, surf(x));
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.fill();
        // Textfetzen: kurze helle Zeilen, die im Wasser treiben (nur unterhalb der Oberflaeche)
        ctx.fillStyle = '#fff2c6';
        for (let i = 0; i < 6; i++) {
          const fx = ((i * 0.37 + e.t * 0.07 * (i % 2 ? 1 : -1)) % 1 + 1) % 1;
          const fy = (i * 0.61) % 1;
          const w = 4 + ((i * 5) % 4) * 2;
          const x = x0 + 2 + fx * (x1 - x0 - w - 4);
          const y = lvl + 4 + fy * Math.max(0, y1 - lvl - 7) + Math.sin(e.t * 2 + i) * 1.2;
          if (y < surf(x) + 2 || y > y1 - 2) continue;
          ctx.globalAlpha = a0 * (0.55 + 0.35 * Math.sin(e.t * 3 + i * 2));
          ctx.fillRect(x, y, w, 2);
        }
        // Fuellstandslinie: hell, ab 80 % und im Telegraph bernsteinfarben (blinkt dann)
        const hot = warn || s.fill > 0.8;
        ctx.strokeStyle = hot ? CTX.warn : CTX.pale;
        ctx.globalAlpha = a0 * (warn ? 0.6 + 0.4 * pulse : 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = x0; x <= x1 + 0.1; x += 2) { if (x === x0) ctx.moveTo(x, surf(x)); else ctx.lineTo(x, surf(x)); }
        ctx.stroke();
      }
      ctx.restore();

      // 3) Koerper (Deckel, Glaswaende, Beine); laeuft er, wechseln die Beine
      AI.drawBody(e, ctx, { dx: sh, frame: moving ? Math.floor(e.t * 5) % 2 : 0 });

      // 4) Glas-Details: Glanzstreifen, "MAX"-Strich oben, Risse im Telegraph
      ctx.save();
      ctx.globalAlpha *= appear;
      const a1 = ctx.globalAlpha;
      ctx.fillStyle = 'rgba(238,244,255,0.35)';
      ctx.fillRect(x1 - 7, y0 + 2, 3, 12);
      ctx.fillStyle = CTX.warn;
      ctx.fillRect(x0, y0 + 2, 6, 2);
      if (warn) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [col, w] of [[CTX.ink, 3], ['#ffffff', 1.5]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          for (const c of OB_CRACKS) {
            const n = Math.max(1, Math.ceil((c.length - 1) * Math.min(1, k * 1.6)));
            ctx.beginPath();
            ctx.moveTo(bx + c[0][0], by + c[0][1]);
            for (let i = 1; i <= n; i++) ctx.lineTo(bx + c[i][0], by + c[i][1]);
            ctx.stroke();
          }
        }
        // Wasser schwappt ueber den Rand
        ctx.fillStyle = CTX.water;
        for (let i = 0; i < 3; i++) {
          const ph = (e.t * 2.5 + i / 3) % 1;
          ctx.globalAlpha = a1 * (1 - ph);
          ctx.fillRect(bx + (i - 1) * 14 - 2, by - 18 + ph * 26, 3, 4);
        }
      }
      ctx.restore();
      AI.drawSay(e, ctx);
    },
  };

  B.BEHAVIORS.overflow_puddle = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.noSeparate = true;
      e.noShadow = true;
      e.ignoreForClear = true;   // nur der Tank zaehlt fuers Clearing
      e.intangible = true;       // Schuesse und Explosionen gehen darueber hinweg
      e.contactDamage = 0;       // macht keinen Schaden, bremst nur
      e.drawLayer = -1;          // Boden: unter allen Figuren
      const s = e.state;
      s.age = 0;
      s.R = 80;                  // Endradius (vom Tank ueberschrieben)
      s.life = 4;                // Lebensdauer (s)
      s.slow = 0.6;              // Tempofaktor fuer den Spieler
      s.grow = 0.35;             // Aufbreiten (s)
      s.fade = 1.2;              // Ausblenden am Ende (s, Teil von life)
    },
    update(e) { AI.stop(e); },
    // afterMove laeuft jeden Tick (auch eingefroren): Wasser versickert unabhaengig von Zeitstopp-Items
    afterMove(e, dt, game) {
      const s = e.state;
      s.age += dt;
      if (s.age >= s.life) { e.dead = true; return; }   // still versickern: kein Kill, keine Beute
      const p = game.player;
      if (p && !p.dead && typeof p.slowBy === 'function' && Math.hypot(p.x - e.x, p.y - e.y) < obPuddleR(e)) p.slowBy(s.slow);
    },
    draw(e, ctx) {
      const s = e.state, R = obPuddleR(e);
      const k = Math.max(0, Math.min(1, (s.life - s.age) / s.fade));
      ctx.save();
      const a0 = ctx.globalAlpha * k;
      ctx.globalAlpha = a0;
      ctx.fillStyle = 'rgba(46,86,140,0.55)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, OB_TAU);
      ctx.fill();
      // Ringwellen von innen nach aussen (das Wasser bewegt sich noch)
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const f = (e.t * 0.7 + i * 0.5) % 1;
        ctx.strokeStyle = 'rgba(158,197,255,' + (0.45 * (1 - f)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, R * (0.15 + 0.8 * f), 0, OB_TAU);
        ctx.stroke();
      }
      // Treibende Textfetzen aus dem Tank
      ctx.fillStyle = '#fff2c6';
      ctx.globalAlpha = a0 * 0.45;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.7 + e.t * 0.25 * (i % 2 ? 1 : -1);
        const d = R * (0.25 + 0.13 * i);
        ctx.fillRect(e.x + Math.cos(a) * d - 4, e.y + Math.sin(a) * d, 4 + (i % 3) * 3, 2);
      }
      // Heller Rand mit dunkler Kante: unterscheidet die bremsende Pfuetze von den harmlosen Regenpfuetzen
      ctx.globalAlpha = a0 * 0.9;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, OB_TAU);
      ctx.strokeStyle = CTX.ink;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = CTX.water;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    },
  };
  // ---- Ende Slot 1 ----

  // ---- Context-Familie: Slot 2 (Summarizer) ----
  // [[SLOT summarizer]]
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // [[SLOT lost_in_the_middle]]
  // ---- Ende Slot 3 ----

})(window.BOTA);
