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
  // ===========================================================================
  // Summarizer ('summarizer') — verhuellter Schreiber, der andere Gegner "kompaktiert"
  // ===========================================================================
  //
  // Greift nie selbst an (nur der uebliche Kontaktschaden 1), sondern macht den Raum mit der Zeit gefaehrlicher:
  // er fasst zwei Gegner zu einem zusammen. Zustaende (state.mode):
  //   walk     haelt params.near..far Abstand zum Spieler (zu weit: heran per Flow-Field, zu nah: direkt weg,
  //            dazwischen langsam seitlich; Richtungswechsel bei Anprall). state.t laeuft ab, dann sucht er das
  //            naechstgelegene geeignete Paar (summaryPair, deterministisch, ohne RNG). Kein Paar -> params.retry.
  //   tell     Telegraph (params.tell s): bleibt stehen und schreibt; gestrichelte Bernstein-Linie zwischen den
  //            beiden Zielen, Klammern um beide, "compacting..." ueber ihm, 'enemyWindup' (Familien-Ton gurgle).
  //            Abbruch, wenn ihn der Spieler trifft (seine HP sinken) -> fluster; Abbruch ohne Verwirrung, wenn ein
  //            Ziel stirbt, verschwindet oder nicht mehr geeignet ist. Laeuft der Telegraph voll ab: summaryMerge.
  //   fluster  "verliert den Faden" (params.fluster s): zittert, "?!", Papierfetzen fallen ('enemyShed' mit
  //            Papierfarben, nur Optik); danach walk mit params.flusterCd bis zum naechsten Versuch.
  // Einfrieren (Stop Generating, Daily Standup) haelt den Telegraph an (update laeuft dann nicht); Treffer
  // waehrend des Einfrierens brechen ihn trotzdem ab, sobald er wieder auftaut (HP-Vergleich).
  //
  // Verschmelzen (summaryMerge): der kleinere (Radius, bei Gleichstand weniger HP) geht im groesseren auf.
  //   - Ueberlebender: hp += hp des anderen, maxHp += maxHp des anderen, Radius x params.grow (hoechstens
  //     params.growCap x urspruenglicher Radius, in o.summaryBaseR gemerkt), o.sizeMult fuer das Sprite
  //     (AI.drawBody), o.summaries zaehlt mit, Schild "[summary]" ueber dem Kopf (summaryTag). Sein Verhalten und
  //     e.state bleiben unangetastet — er kaempft einfach groesser und zaeher weiter.
  //   - Der andere verschwindet STILL: dead = true ohne die() — also kein onDeath, kein 'enemyDeath', kein Kill,
  //     keine Beute. Room.update filtert ihn wie jeden toten Gegner heraus; das Raum-Clearing zaehlt danach nur
  //     noch die Uebrigen. Optik ueber das vorhandene 'enemyVanish' ({ color, text: 'summarized' }).
  //
  // Eignung (summarizable) — bewusst konservativ als POSITIVLISTE nach Verhalten (SUMMARY_BEHAVIORS): nur einfache
  // Einzelgaenger, deren Verhalten weder Radius noch Partner verwaltet:
  //   wander (Bug), fly_chase (Null Pointer), blink (Flaky Test), charge (Merge Conflict), orbit (Deprecation
  //   Warning), shooter (Spaghetti Code), revive (Zombie Process; nicht, solange er am Boden liegt), zigzag (Race
  //   Condition), glitch (Graphics Glitch), rogue_agent (Rogue Agent).
  // Damit ausgeschlossen: alle Bosse und Boss-Gruppen, Minions (spawn: false) und Segmente, verknuepfte Paare
  // (Detached HEAD, Cherry-Pick), Spinlock und Glieder, Port Scanner und Ports, Hallucination (mimic, auch
  // enttarnt), Orphan Commit, Dry Run (Koerper wiederholt einen Geist), Memory Leak und Scope Creep (setzen ihren
  // Radius jeden Tick selbst), Jira Ticket (static), alle Themen-Familien mit eigener Struktur (Stale Branch, Stack
  // Trace, Honeypot, Rolling Release, Rate Limiter, Dust Daemon, Rootkit) sowie die Geschwister dieser Familie
  // (Overflow Buffer, Lost in the Middle) und jeder Summarizer. Zusaetzlich werden Flags geprueft (proxy,
  // ignoreForClear, static, invulnerable, noSeparate, bossGroup, intangible/spawnDelay bei der Auswahl), damit auch
  // eine spaetere Aenderung an einem Listen-Verhalten nichts Strukturiertes verschluckt.

  /** Verhalten, deren Gegner zusammengefasst werden duerfen (siehe Kopfkommentar oben) */
  const SUMMARY_BEHAVIORS = ['wander', 'fly_chase', 'blink', 'charge', 'orbit', 'shooter', 'revive', 'zigzag', 'glitch', 'rogue_agent'];
  /** Papierfarben fuer die herabfallenden Fetzen beim Verwirren (B.CONTEXT_COLORS paper/paperDark/glassDark) */
  const SUMMARY_SCRAPS = ['#d8d2c2', '#a39b88', '#6f86a6'];

  /**
   * Darf o zusammengefasst werden? self = der Summarizer (nie er selbst). strict = bei der Auswahl zusaetzlich
   * keine voruebergehend unberuehrbaren oder noch erscheinenden Gegner (beim Verschmelzen nicht noetig: ein Flaky
   * Test mitten im Teleport darf verschmelzen).
   */
  function summarizable(o, self, strict) {
    if (!o || o === self || o.dead || o.isBoss || (B.Boss && o instanceof B.Boss)) return false;
    const def = o.def;
    if (!def || def.spawn === false || SUMMARY_BEHAVIORS.indexOf(def.behavior) < 0) return false;
    if (o.behavior !== B.BEHAVIORS[def.behavior]) return false;      // Verhalten zur Laufzeit ersetzt -> Finger weg
    if (o.proxy || o.ignoreForClear || o.static || o.invulnerable || o.noSeparate || o.bossGroup) return false;
    if (!(o.hp > 0) || (o.state && o.state.down > 0)) return false;   // Zombie Process liegt gerade am Boden
    const max = (self && self.params && self.params.maxSummaries) || 2;
    if ((o.summaries || 0) >= max) return false;
    if (strict && (o.intangible || o.spawnDelay > 0)) return false;
    return true;
  }

  /** Naechstgelegenes geeignetes Paar (Abstand <= params.pairRange) im Raum oder null — ohne RNG-Zuege */
  function summaryPair(e, game) {
    const list = game.room.enemies, cand = [];
    for (let i = 0; i < list.length; i++) if (summarizable(list[i], e, true)) cand.push(list[i]);
    let best = null, bestD = e.params.pairRange;
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        const d = Math.hypot(cand[i].x - cand[j].x, cand[i].y - cand[j].y);
        if (d <= bestD) { bestD = d; best = [cand[i], cand[j]]; }
      }
    }
    return best;
  }

  /** "[summary]"-Schild ueber einem zusammengefassten Gegner (Pixel nur per Canvas-Text) */
  function summaryTag(o, ctx) {
    const n = o.summaries || 0;
    if (!n || o.dead || typeof B.text !== 'function') return;
    B.text(ctx, n > 1 ? '[summary x' + n + ']' : '[summary]', o.x, o.y - o.r - 27, {
      size: 11, align: 'center', color: CTX.pale, alpha: Math.max(0, Math.min(1, o.alpha)), shadow: CTX.ink,
    });
  }

  /**
   * Haengt das Schild an genau diesen Gegner: dessen draw-Methode wird NUR AUF DIESER INSTANZ umwickelt (wie der
   * Rolling Release seinen takeHit umwickelt) — die Enemy-Klasse und sein Verhalten bleiben unveraendert.
   */
  function attachSummaryTag(o) {
    if (o.summaryTagged) return;
    o.summaryTagged = true;
    const base = o.draw;
    o.draw = function (ctx, game) {
      base.call(this, ctx, game);
      summaryTag(this, ctx);
    };
  }

  /** Telegraph abgelaufen: der kleinere Gegner geht still im groesseren auf (siehe Kopfkommentar) */
  function summaryMerge(e, a, b, game) {
    const P = e.params;
    let big = a, small = b;
    if (b.r > a.r + 0.01 || (Math.abs(b.r - a.r) <= 0.01 && b.hp > a.hp)) { big = b; small = a; }
    if (!big.summaryBaseR) big.summaryBaseR = big.r;
    big.hp += small.hp;
    big.maxHp += small.maxHp;
    big.summaries = (big.summaries || 0) + 1;
    big.r = Math.min(big.summaryBaseR * P.growCap, big.r * P.grow);
    big.sizeMult = big.r / big.summaryBaseR;
    if (typeof big.resolveTiles === 'function') big.resolveTiles(game.room, big.flying ? 'fly' : 'walk'); // gewachsen: aus Felsen schieben
    big.flash = 0.2;
    attachSummaryTag(big);
    AI.say(big, 'TL;DR', 1.0, CTX.warn);
    // Still verschwinden: kein die() -> kein onDeath, kein 'enemyDeath', kein Kill, keine Beute
    small.dead = true;
    small.vx = small.vy = 0;
    B.bus.emit('enemyVanish', { game, enemy: small, x: small.x, y: small.y, color: CTX.pale, text: 'summarized' });
  }

  /** Telegraph beenden (ohne Verschmelzen) und zur naechsten Pause zurueck */
  function summaryEnd(e, next, cd) {
    const s = e.state;
    s.a = s.b = null;
    s.mode = next;
    s.t = cd;
    e.drawLayer = 0;
  }

  B.BEHAVIORS.summarizer = {
    /** Fuer Tests und Doku: Eignungspruefung von aussen (o = Kandidat, self = Summarizer) */
    canSummarize(o, self) { return summarizable(o, self, true); },
    SUMMARY_BEHAVIORS,

    init(e, game) {
      const s = e.state, P = e.params;
      s.mode = 'walk';
      s.t = game && game.rng ? game.rng.float(P.firstMin, P.firstMax) : P.firstMax;
      s.side = game && game.rng && game.rng.chance(0.5) ? 1 : -1;
      s.a = s.b = null;       // die beiden Ziele waehrend des Telegraphs
      s.tellT = 0;            // verstrichene Telegraph-Zeit (fuer Zeichnen und Tests)
      s.hpMark = e.hp;        // HP beim Start des Telegraphs: sinkt sie, wurde er getroffen
      s.merges = 0;           // erfolgreiche Zusammenfassungen (nur Statistik/Tests)
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      s.t -= dt;
      switch (s.mode) {
        case 'walk': {
          const d = AI.dist(e, p), sp = e.speed;
          if (d > P.far) AI.pathToward(e, game, p.x, p.y, sp);
          else if (d < P.near) {
            const n = B.M.norm(e.x - p.x, e.y - p.y);
            e.vx = n.x * sp;
            e.vy = n.y * sp;
          } else {
            if (s.bumped) { s.side = -s.side; s.bumped = false; }
            const n = B.M.norm(p.x - e.x, p.y - e.y);
            e.vx = -n.y * sp * 0.6 * s.side;
            e.vy = n.x * sp * 0.6 * s.side;
          }
          if (s.t > 0) break;
          const pair = summaryPair(e, game);
          if (!pair) { s.t = P.retry; break; }
          AI.stop(e);
          s.mode = 'tell';
          s.a = pair[0];
          s.b = pair[1];
          s.t = P.tell;
          s.tellT = 0;
          s.hpMark = e.hp;
          e.drawLayer = 1;     // Linie und Klammern ueber den anderen Figuren zeichnen
          B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
          break;
        }
        case 'tell': {
          AI.stop(e);
          s.tellT += dt;
          if (e.hp < s.hpMark) {
            // Getroffen: Faden verloren
            summaryEnd(e, 'fluster', P.fluster);
            AI.say(e, '...where was I?', 1.2, CTX.pale);
            B.bus.emit('enemyShed', { game, enemy: e, x: e.x, y: e.y - 8, colors: SUMMARY_SCRAPS, count: 5, big: true });
            break;
          }
          const room = game.room;
          const gone = (o) => !summarizable(o, e, false) || room.enemies.indexOf(o) < 0;
          if (gone(s.a) || gone(s.b)) {
            summaryEnd(e, 'walk', Math.min(2, P.retry * 3));
            AI.say(e, 'nothing to summarize', 1.0, CTX.pale);
            break;
          }
          if (s.t <= 0) {
            summaryMerge(e, s.a, s.b, game);
            s.merges++;
            summaryEnd(e, 'walk', AI.cooldown(game, game.rng.float(P.cdMin, P.cdMax)));
          }
          break;
        }
        case 'fluster': {
          // Ziellos ein Stueck weg vom Spieler stolpern
          const n = B.M.norm(e.x - p.x, e.y - p.y);
          e.vx = n.x * e.speed * 0.5;
          e.vy = n.y * e.speed * 0.5;
          if (s.t <= 0) { s.mode = 'walk'; s.t = P.flusterCd; }
          break;
        }
      }
    },

    draw(e, ctx) {
      const s = e.state, P = e.params;
      const tell = s.mode === 'tell' && s.a && s.b;
      // Telegraph unter dem Koerper: Linie zwischen den Zielen, Klammern, duenner Tintenfaden vom Kiel zur Mitte
      if (tell) {
        const k = B.M.clamp(s.tellT / P.tell, 0, 1);
        const a = s.a, b = s.b, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.save();
        ctx.lineCap = 'round';
        // Tintenfaden vom Kiel zur Mitte der Linie (duenn, gepunktet)
        ctx.globalAlpha = 0.35 + 0.35 * k;
        ctx.setLineDash([3, 6]);
        ctx.lineDashOffset = -e.t * 30;
        ctx.strokeStyle = CTX.warn;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x + 14, e.y - 4);
        ctx.lineTo(mx, my);
        ctx.stroke();
        // Hauptlinie: dunkle Unterlage, darueber Bernstein (wird zum Ende dicker und heller)
        ctx.globalAlpha = 0.55 + 0.45 * k;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -e.t * 48;
        ctx.strokeStyle = 'rgba(14,20,32,0.75)';
        ctx.lineWidth = 7 + 2 * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = CTX.warn;
        ctx.lineWidth = 3 + 2 * k;
        ctx.stroke();
        // Eckklammern um beide Ziele, ziehen sich zum Ende zusammen
        ctx.setLineDash([]);
        for (const o of [a, b]) {
          const h = o.r + 12 - 5 * k, L = 8;
          ctx.strokeStyle = 'rgba(14,20,32,0.75)';
          ctx.lineWidth = 6;
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (const sx of [-1, 1]) {
              for (const sy of [-1, 1]) {
                ctx.moveTo(o.x + sx * h, o.y + sy * (h - L));
                ctx.lineTo(o.x + sx * h, o.y + sy * h);
                ctx.lineTo(o.x + sx * (h - L), o.y + sy * h);
              }
            }
            ctx.stroke();
            ctx.strokeStyle = CTX.warn;
            ctx.lineWidth = 3;
          }
        }
        ctx.restore();
      }
      // Koerper: leichtes Schweben; beim Schreiben flitzt der Kiel (Frame-Wechsel), verwirrt zittert er
      const bob = Math.sin(e.t * 3) * 1.5;
      const dx = s.mode === 'fluster' ? Math.sin(e.t * 60) * 2 : 0;
      const frame = tell ? Math.floor(e.t * 10) % 2 : Math.floor(e.t * 2.5) % 2;
      AI.drawBody(e, ctx, { dx, dy: bob - 4, frame, flipX: false });
      if (tell && typeof B.text === 'function') {
        const dots = '...'.slice(0, 1 + (Math.floor(e.t * 4) % 3));
        B.text(ctx, 'compacting' + dots, e.x - 38, e.y - e.r - 34, { size: 13, color: CTX.warn, shadow: CTX.ink });
      }
      if (s.mode === 'fluster') AI.drawMark(ctx, '?!', e.x - e.r - 16, e.y + 10, e.t, CTX.pale, 18);   // seitlich, damit es den Sprechtext nicht verdeckt
      AI.drawSay(e, ctx);
    },
  };
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // ===========================================================================
  // Lost in the Middle ('lost_in_the_middle')
  // ===========================================================================
  //
  // Ein verblasster Geist einer Chat-Sprechblase — benannt nach der echten LLM-Schwaeche, das zu vergessen, was in
  // der MITTE eines langen Kontexts steht. Der Raum ist das Kontextfenster, von links (Anfang) nach rechts (Ende):
  //
  //  - Zone ("die Mitte"): das mittlere Drittel der Innenraum-BREITE, ueber die volle Hoehe, also
  //    x in [INNER.x0 + W/3, INNER.x0 + 2W/3] mit W = 832 px -> [341.3, 618.7]. Bewusst nur die Breite und kein
  //    Kasten in der Raummitte: ein Kontext ist eine Folge (Anfang -> Ende), "die Mitte" ist also ein Streifen;
  //    ausserdem ergibt das zwei gerade, leicht lesbare Grenzlinien von Wand zu Wand, waehrend ein zentrales
  //    Drittel-Kaestchen (277 x 149 px) zu klein waere, um es im Kampf zu bemerken. Massgeblich ist der
  //    Mittelpunkt des Gegners (e.x).
  //  - Hysterese: hinein zaehlt erst ZONE.hyst (6 px) innerhalb der Linie, hinaus erst 6 px ausserhalb — auf der
  //    Linie flackert also nichts.
  //  - Am Rand (ausserhalb der Zone) ist er fest: schwebt zum Spieler (flying), Kontakt 1, verwundbar, und feuert
  //    ab und zu nach einem Telegraph (params.tell = 0.6 s: bernsteinfarbenes Gluehen, gestrichelte Faecherlinien,
  //    "!", 'enemyWindup' ohne sound = Familien-Warnton gurgle) einen 3er-Faecher aus korallenroten "Wort"-Schuessen
  //    (params.shotSpeed 195 px/s, mit AI.shotSpeed hoechstens ~224).
  //  - In der Zone ist er fast durchsichtig: e.intangible (Schuesse fliegen durch, hurt() wirkt nicht), kein
  //    Kontaktschaden, keine Angriffe. Die Flags schalten in dem Tick, in dem er die Linie (mit Hysterese)
  //    ueberquert; nur das Einblenden beim Verlassen dauert params.fade (0.3 s) — erst wenn er wieder voll
  //    sichtbar ist, ist er fest (Regel fuer den Spieler: "fest = ganz sichtbar"). Ein laufender Telegraph bricht
  //    ab, wenn er (z. B. durch Rueckstoss) in die Zone geraet — er schiesst nie aus der Mitte.
  //  - Gegen Endlos-Unverwundbarkeit (der Raum muss immer schaffbar sein): Zeit am Stueck in der Zone zaehlt
  //    (state.lostT). Nach params.maxLost (4 s) "erinnert" er sich und treibt hinaus (mode 'surface', surfaceSpeed):
  //    Richtung Spieler, falls der ausserhalb der Zone steht, sonst zur naeheren Grenze. Danach bleibt er
  //    params.hold (2.2 s) mindestens params.keepOut px ausserhalb der Zone (mode 'hold': folgt dem Spieler nur
  //    senkrecht, darf schiessen) und jagt dann wieder (mode 'drift'). Wer in der Mitte campt, bekommt ihn also
  //    spaetestens alle ~5–6 s fest an der Zonengrenze vor die Flinte — und wird beschossen.
  //  - Lesbarkeit: solange einer lebt, liegt ein Boden-Aufkleber im Raum (LostZoneMark in room.pickups; Vertrag
  //    dort: update + draw), der die beiden Zonengrenzen als blasse gepunktete Linien, einen Hauch Nebel im
  //    Streifen und "[...]" oben und unten zeichnet (drawLayer -2: unter allen Figuren). Er blendet aus und
  //    entfernt sich selbst, sobald kein Lost in the Middle mehr im Raum lebt — er ist kein Gegner,
  //    killAll/Clearing beruehren ihn nicht.
  //
  // Zufallswerte (Abklingzeiten) nur ueber game.rng; Math.random wird nicht benutzt (die Optik rechnet mit e.t).
  const TAU_LM = Math.PI * 2;
  const LM_INNER = B.C.INNER;
  const LM_W = LM_INNER.x1 - LM_INNER.x0;
  /** Zonengrenzen (Raumkoordinaten) und Hysterese; fuer Tests ueber B.BEHAVIORS.lost_in_the_middle.ZONE lesbar */
  const LM_ZONE = Object.freeze({ x0: LM_INNER.x0 + LM_W / 3, x1: LM_INNER.x0 + (2 * LM_W) / 3, hyst: 6 });
  const LM_PALE = CTX.pale;
  const LM_OUTLINE = '#0e1420';

  /** Liegt x so weit in der Zone, dass ein fester Geist sich verliert? */
  function lmEnters(x) { return x > LM_ZONE.x0 + LM_ZONE.hyst && x < LM_ZONE.x1 - LM_ZONE.hyst; }
  /** Liegt x so weit ausserhalb, dass ein verlorener Geist wieder auftaucht? */
  function lmLeaves(x) { return x < LM_ZONE.x0 - LM_ZONE.hyst || x > LM_ZONE.x1 + LM_ZONE.hyst; }

  /**
   * Boden-Aufkleber mit den Zonengrenzen. Kein Gegner und kein einsammelbares Pickup: liegt nur in room.pickups,
   * weil dort alles mit update/draw gezeichnet und nach drawLayer unter die Figuren sortiert wird. Einer pro Raum.
   */
  class LostZoneMark {
    constructor() {
      this.x = (LM_ZONE.x0 + LM_ZONE.x1) / 2;
      this.y = LM_INNER.y0;
      this.r = 0;
      this.t = 0;
      this.k = 0;              // Sichtbarkeit 0..1 (blendet in 0.5 s ein bzw. aus)
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -2;     // Bodenmarkierung: unter allem anderen (auch unter Trichtern und Ports)
      this.lostZoneMark = true;
    }
    update(dt, game) {
      this.t += dt;
      const alive = game.room.enemies.some((en) => !en.dead && en.id === 'lost_in_the_middle');
      this.k = B.M.clamp(this.k + (alive ? dt : -dt) * 2, 0, 1);
      if (!alive && this.k <= 0) this.dead = true;   // still verschwinden
    }
    draw(ctx) {
      if (this.k <= 0) return;
      const y0 = LM_INNER.y0 + 6, y1 = LM_INNER.y1 - 6;
      ctx.save();
      // Ein Hauch heller Nebel im Streifen ("hier verschwimmt alles")
      ctx.globalAlpha = 0.05 * this.k;
      ctx.fillStyle = LM_PALE;
      ctx.fillRect(LM_ZONE.x0, y0, LM_ZONE.x1 - LM_ZONE.x0, y1 - y0);
      // Zwei gepunktete Grenzlinien (dunkle Unterlage, damit sie auch im Regen lesbar sind); die Punkte wandern
      // langsam nach unten wie Tropfen an einer Scheibe
      ctx.lineCap = 'round';
      ctx.setLineDash([2, 12]);
      ctx.lineDashOffset = -this.t * 10;
      for (const [col, w, a] of [[LM_OUTLINE, 5, 0.35], [LM_PALE, 2, 0.45]]) {
        ctx.globalAlpha = a * this.k;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(LM_ZONE.x0, y0); ctx.lineTo(LM_ZONE.x0, y1);
        ctx.moveTo(LM_ZONE.x1, y0); ctx.lineTo(LM_ZONE.x1, y1);
        ctx.stroke();
      }
      ctx.restore();
      // Auslassungszeichen oben und unten im Streifen: "[...]" — der vergessene Teil des Kontexts
      if (typeof B.pixelText === 'function') {
        const o = { scale: 2, color: LM_PALE, align: 'center', baseline: 'middle', alpha: 0.3 * this.k, shadow: '' };
        B.pixelText(ctx, '[...]', this.x, LM_INNER.y0 + 18, o);
        B.pixelText(ctx, '[...]', this.x, LM_INNER.y1 - 18, o);
      }
    }
  }

  /** Stellt sicher, dass der aktuelle Raum einen Zonen-Aufkleber hat */
  function lmEnsureMark(game) {
    const room = game && game.room;
    if (!room || !Array.isArray(room.pickups)) return;
    for (const pk of room.pickups) if (pk.lostZoneMark && !pk.dead) return;
    room.pickups.push(new LostZoneMark());
  }

  /** Winkel der Faecher-Schuesse (Mitte = Richtung zum Spieler beim Telegraph-Start, danach fest) */
  function lmFanAngles(e) {
    const s = e.state, P = e.params, out = [];
    for (let i = 0; i < P.fan; i++) out.push(s.aim + (i - (P.fan - 1) / 2) * P.spread);
    return out;
  }

  /** Telegraph starten (nur aus einem festen Zustand aufgerufen) */
  function lmStartTell(e, game) {
    const s = e.state, p = game.player;
    // Aus 'hold' heraus: Rest der Haltezeit merken, damit er nach der Salve weiter draussen bleibt
    s.holdLeft = s.mode === 'hold' ? Math.max(0, s.t) : 0;
    s.mode = 'tell';
    s.t = e.params.tell;
    s.aim = Math.atan2(p.y - e.y, p.x - e.x);
    AI.stop(e);
    B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });   // ohne sound: Familien-Warnton (gurgle)
  }

  /** Abklingzeit herunterzaehlen und ggf. den Telegraph starten (nur wenn fest und mit Sichtlinie bzw. nach 2.5 s) */
  function lmMaybeAttack(e, dt, game) {
    const s = e.state, p = game.player;
    if (!s.solid) return false;
    s.cd -= dt;
    if (s.cd <= 0 && (s.cd < -2.5 || game.room.lineOfSight(e.x, e.y, p.x, p.y))) {
      lmStartTell(e, game);
      return true;
    }
    return false;
  }

  /** Zonen-Status, Flags und Sichtbarkeit nachfuehren (jeden Tick, auch eingefroren und beim Erscheinen) */
  function lmSyncZone(e, dt) {
    const s = e.state, P = e.params;
    if (!s.lost && lmEnters(e.x)) s.lost = true;
    else if (s.lost && lmLeaves(e.x)) s.lost = false;
    if (s.lost) s.vis = Math.max(0, s.vis - dt / P.fade);
    else s.vis = Math.min(1, s.vis + dt / P.fade);
    const solid = !s.lost && s.vis >= 1;
    if (solid && !s.solid) s.solidT = 0;          // gerade wieder fest geworden (fuer den kleinen Ring)
    s.solid = solid;
    s.solidT += dt;
    e.intangible = !solid;
    e.contactDamage = solid ? e.def.contactDamage : 0;
    e.alpha = P.ghostAlpha + (1 - P.ghostAlpha) * s.vis;
  }

  B.BEHAVIORS.lost_in_the_middle = {
    ZONE: LM_ZONE,
    init(e, game) {
      const s = e.state;
      e.noShadow = true;        // eigener, mit der Sichtbarkeit verblassender Schatten in draw()
      s.mode = 'drift';         // drift | tell | surface | hold
      s.lost = e.x >= LM_ZONE.x0 && e.x <= LM_ZONE.x1;
      s.vis = s.lost ? 0 : 1;
      s.solid = !s.lost;
      s.solidT = 99;
      s.lostT = 0;
      s.t = 0;
      s.aim = 0;
      s.side = 1;
      s.holdLeft = 0;
      s.cd = game && game.rng ? game.rng.float(1.0, 1.8) : 1.4;   // nicht sofort beim Betreten feuern
      e.intangible = s.lost;
      e.contactDamage = s.lost ? 0 : e.def.contactDamage;
      e.alpha = s.lost ? e.params.ghostAlpha : 1;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      lmEnsureMark(game);
      s.t -= dt;
      // Anti-Stillstand: Zeit am Stueck in der Zone; zu lange -> hinaustreiben
      if (s.lost) s.lostT += dt; else s.lostT = 0;
      if (s.lost && s.lostT >= P.maxLost && s.mode !== 'surface') {
        s.mode = 'surface';
        const mid = (LM_ZONE.x0 + LM_ZONE.x1) / 2;
        if (p.x < LM_ZONE.x0) s.side = -1;                 // Spieler steht links draussen: dorthin
        else if (p.x > LM_ZONE.x1) s.side = 1;             // ... rechts draussen
        else s.side = e.x < mid ? -1 : 1;                  // Spieler campt in der Mitte: naehere Grenze
      }
      const sway = Math.sin(e.t * 2.3 + e.maxHp) * 0.35;   // leichtes Schlingern (rein aus der Zeit, deterministisch)
      switch (s.mode) {
        case 'drift': {
          const d = AI.dist(e, p);
          const sp = (d < 44 ? 0.4 : 1) * (s.lost ? 1.2 : 1) * e.speed;
          const a = Math.atan2(p.y - e.y, p.x - e.x) + sway;
          e.vx = Math.cos(a) * sp;
          e.vy = Math.sin(a) * sp;
          lmMaybeAttack(e, dt, game);
          break;
        }
        case 'tell':
          AI.stop(e);
          if (!s.solid) {                         // in die Mitte geschubst: vergisst, was es sagen wollte
            s.mode = 'drift';
            s.cd = 0.8;
            s.holdLeft = 0;
            break;
          }
          if (s.t <= 0) {
            const sp = AI.shotSpeed(game, P.shotSpeed);
            for (const a of lmFanAngles(e)) AI.shoot(game, e, a, sp, { color: CTX.shot, sprite: 'shot_lost_word', r: 8 });
            s.cd = AI.cooldown(game, game.rng.float(P.cdMin, P.cdMax));
            if (s.holdLeft > 0) { s.mode = 'hold'; s.t = s.holdLeft; }   // Haltezeit fortsetzen
            else s.mode = 'drift';
            s.holdLeft = 0;
          }
          break;
        case 'surface': {
          // Hinaus ueber die gewaehlte Grenze (waagerecht), senkrecht leicht Richtung Spieler
          const tx = s.side < 0 ? LM_ZONE.x0 - P.keepOut - 20 : LM_ZONE.x1 + P.keepOut + 20;
          e.vx = B.M.clamp((tx - e.x) * 4, -P.surfaceSpeed, P.surfaceSpeed);
          e.vy = B.M.clamp(p.y - e.y, -1, 1) * P.surfaceSpeed * 0.3;
          if (s.solid) { s.mode = 'hold'; s.t = P.hold; }
          break;
        }
        case 'hold': {
          // Bleibt ausserhalb der Zone (mind. keepOut px) und folgt dem Spieler nur senkrecht; darf schiessen
          const edge = s.side < 0 ? LM_ZONE.x0 - P.keepOut : LM_ZONE.x1 + P.keepOut;
          const wantX = s.side < 0 ? Math.min(e.x, edge) : Math.max(e.x, edge);
          e.vx = B.M.clamp((wantX - e.x) * 4, -e.speed, e.speed);
          e.vy = B.M.clamp((p.y - e.y) * 2, -e.speed, e.speed);
          if (lmMaybeAttack(e, dt, game)) break;   // nach der Salve geht es mit dem Rest der Haltezeit weiter
          if (s.t <= 0) s.mode = 'drift';
          break;
        }
      }
    },
    // Jeden Tick (auch waehrend spawnDelay/frozen): im Raum halten, Zone/Flags/Sichtbarkeit nachfuehren
    afterMove(e, dt, game) {
      const c = AI.clampToRoom(e.x, e.y, e.r + 2);
      e.x = c.x; e.y = c.y;
      lmSyncZone(e, dt);
      if (e.spawnDelay > 0) lmEnsureMark(game);
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      const vis = s.vis;
      const bob = Math.sin(e.t * 3.1) * 3;
      // Schatten verblasst mit (in der Mitte nur ein Hauch)
      ctx.save();
      ctx.globalAlpha = 0.06 + 0.22 * vis;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r + 12, e.r * 0.9, e.r * 0.32, 0, 0, TAU_LM);
      ctx.fill();
      ctx.restore();
      if (s.mode === 'tell') {
        const k = 1 - Math.max(0, s.t) / P.tell;
        AI.drawGlow(ctx, e.x, e.y + bob, e.r + 16 + 12 * k, k, CTX.warn);   // groesser als die Blase, sonst verdeckt
        // Gestrichelte Faecherlinien mit dunkler Unterlage (bernstein, nie blau)
        const angs = lmFanAngles(e);
        AI.drawRays(ctx, e.x, e.y + bob, angs, e.r + 6, 40 + 70 * k, 0.5 + 0.3 * k, LM_OUTLINE);
        AI.drawRays(ctx, e.x, e.y + bob, angs, e.r + 6, 40 + 70 * k, 0.45 + 0.5 * k, CTX.warn);
      }
      // Wieder fest geworden: kurzer blasser Ring ("ach ja, das war's")
      if (s.solid && s.solidT < 0.35 && e.t > 0.6) {
        const k = s.solidT / 0.35;
        ctx.save();
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = LM_PALE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, e.r + 4 + 18 * k, 0, TAU_LM);
        ctx.stroke();
        ctx.restore();
      }
      // Koerper: beim Telegraph leicht zitternd, in der Mitte langsam wabernd
      const dx = s.mode === 'tell' ? Math.sin(e.t * 60) * 1.2 : Math.sin(e.t * 1.7) * 3 * (1 - vis);
      AI.drawBody(e, ctx, { dy: bob, dx, flipX: false });
      if (s.mode === 'tell') AI.drawMark(ctx, '!', e.x, e.y - e.r - 14 + bob, e.t, CTX.warn, 22);
      if (vis < 0.5 && typeof B.pixelText === 'function') {
        // Verloren in der Mitte: blasse Auslassungspunkte ueber der Blase
        B.pixelText(ctx, '...', e.x, e.y - e.r - 16 + bob, { scale: 2, color: LM_PALE, align: 'center', baseline: 'middle', alpha: 0.5 * (1 - vis * 2), shadow: '' });
      }
      AI.drawSay(e, ctx);
    },
  };
  // ---- Ende Slot 3 ----

})(window.BOTA);
