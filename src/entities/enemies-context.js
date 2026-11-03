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
  // [[SLOT overflow_buffer]]
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
  // [[SLOT lost_in_the_middle]]
  // ---- Ende Slot 3 ----

})(window.BOTA);
