/*
 * bosses-late.js — Spaete Boss-Abloesungen ab Etage 7 (BOTA.BOSS_BEHAVIORS), Daten in data/bosses.js.
 *
 * Eigene Datei, weil boss.js schon sehr lang ist; laedt direkt nach boss.js und benutzt dessen Helfer
 * (B.BossHelpers: Wellen, Strahlen, Minion-Zaehlung) und die Gegner-Helfer (B.AI). Gleicher Vertrag wie
 * alle Boss-Verhalten (init/update/onDeath/draw), dazu optional barText(e, game) -> { text, color }:
 * eine zweite Zeile unter dem Boss-Balken im HUD (hud.js).
 *
 *   megalith     The Megalith (statt The Monolith ab Etage 7) — "6 million lines of code. One file."
 *                  scroll  Codezeilen als Kugelreihen quer durch den Raum, von der Wand, die vom Spieler weiter
 *                          weg ist. Jede Zeile hat Einrueckung (Luecke links) und/oder ein Zeilenende (Luecke
 *                          rechts), die Einrueckung wechselt wie in echtem Code um hoechstens eine Ebene. Die
 *                          naechste Zeile ist immer vorab schwach zu sehen; aufeinanderfolgende Zeilen haben
 *                          Luecken, die man in der Zeit dazwischen sicher erreicht (megaBody prueft das).
 *                          Phase 2: mehr und schnellere Zeilen, dazu eine Konfliktmarker-Zeile ("<<<<<<<"):
 *                          ganz ohne Einrueckung, mit genau einem schmalen Loch.
 *                  find    "Ctrl+F": 4 (Phase 2: 6) gelbe Suchtreffer erscheinen nacheinander, der erste auf
 *                          dem Spieler; nach der Vorwarnzeit wird jeder "ersetzt": 1 halbes Herz im Rechteck,
 *                          dazu ein Kreuz aus 4 Kugeln (Phase 2: jeder zweite Treffer diagonal).
 *                  save    "Ctrl+S": hebt sich an (Telegraph), stampft einen 16er-Ring (Phase 2 doppelt,
 *                          versetzt); gleichzeitig fallen 3 (5) Code-Brocken auf Zielringe um den Spieler
 *                          (volles Herz im Radius).
 *                Phase 2 ab 50 %: "REFACTOR REJECTED" — 4 Module (megalith_module) werden abgesprengt und
 *                kriechen zurueck; jedes, das ankommt, heilt ihn um 4 % (nie ueber 50 %). Alle 10 s kommen bis
 *                zu 2 neue dazu (max. 4). Der Monolith zerfaellt in Microservices, der Megalith verweigert das.
 *                Das HUD zaehlt verbleibende Codezeilen statt Prozent.
 *   shareholder  The Shareholder (statt The Stakeholder ab Etage 7) — Zylinder, Monokel, Goldkette.
 *                  glint     Monokel-Strahl: das Monokel funkelt immer heller, eine goldene Ziellinie folgt dem
 *                            Spieler (mit allen Wandabprallern, 1 / Phase 2: 2), friert ein und blinkt, dann
 *                            feuert der Strahl entlang genau dieser Linie (volles Herz). Gleicher Ablauf wie
 *                            beim Reviewer-Laser (BossHelpers.beamPath/beamHits/drawBeam).
 *                  dividend  3 (5) dicke Goldkugeln im Faecher; nach 0.8 s blaehen sie sich auf und platzen in
 *                            Ringe aus je 6 kleinen Kugeln ("pays out").
 *                  rain      "Make it rain": 6 (9) Muenzen fallen nacheinander auf Zielringe um den Spieler
 *                            (1 halbes Herz im Ring). Etwa jede vierte bleibt 3 s als echter Credit liegen,
 *                            hoechstens 6 pro Kampf — wer sie aufsammelt, steht im Feuer.
 *                  buyback   (nur Phase 2) "Aktienrueckkauf": alle Gegnerkugeln im Raum bleiben stehen und
 *                            leuchten, goldene Linien zeigen den Rueckweg, dann fliegen sie zu ihm zurueck.
 *                            Sind kaum Kugeln unterwegs, wirft er vorher einen Ring aus Muenzen.
 *                Quartalszahlen (den ganzen Kampf): alle 12 s endet ein Quartal (Anzeige unter dem Balken). Hat
 *                der Spieler darin >= 8 % seiner HP abgezogen: "MISSED ESTIMATES" — 1.5 s betaeubt, nimmt 25 %
 *                mehr Schaden. Sonst "BEAT ESTIMATES": Telegraph, dann ein Ring aus 10 Kugeln, und er wird 8 %
 *                schneller (hoechstens dreimal). Ausgewertet wird nur zwischen zwei Angriffen.
 *                Phase 2 ab 40 %: "HOSTILE TAKEOVER", alle Kugeln verschwinden, dann kommt der Rueckkauf dazu.
 *                Tod: ein goldener Fallschirm traegt ihn davon (effects.js, 'bossExit').
 *
 * Bus-Events (nur informativ, fuer audio.js / effects.js): 'bossSearch' (Ctrl+F beginnt), 'bossReplace' (ein
 * Suchtreffer wird ersetzt), 'bossAbsorb' (ein Modul kommt beim Megalith an), 'bossMoney' ({ kind: 'coin' |
 * 'expire' | 'buyback' | 'beat' | 'missed' }), 'bossExit' ({ kind: 'segfault' | 'parachute' }).
 *
 * Fairness: alle Kugeln 165–260 px/s (vor Tiefenskalierung 150–200, AI.shotSpeed hebt sie um bis zu 15 %),
 * jeder Angriff hat einen Telegraph von >= 0.6 s, Kontaktschaden 2 (Boss), Module 1.
 * Zufall nur ueber game.rng (Muenzen, Zeilen, Positionen); Math.random hoechstens fuer Optik.
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const { ROOM_W, ROOM_H, INNER } = B.C;
  const AI = B.AI;
  const BH = B.BossHelpers;
  const TAU = Math.PI * 2;
  const CX = ROOM_W / 2;
  const CY = ROOM_H / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Zahl mit Tausenderkommas (6000000 -> "6,000,000") */
  const fmt = (n) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ===========================================================================
  // THE MEGALITH
  // ===========================================================================

  const MEGA = {
    rowSpeed: [150, 170],     // Zeilen-Tempo in px/s (Phase 1/2), vor AI.shotSpeed
    rowGap: [0.95, 0.85],     // Sekunden zwischen zwei Zeilen (bei 150 px/s ~140 px Abstand)
    rows: [5, 7],             // Zeilen pro "Funktion"
    tell: 0.8,                // Vorwarnung ("!" + Vorschau der ersten Zeile)
    step: 40,                 // Abstand der Kugeln in einer Zeile
    slots: 21,                // Kugelplaetze pro Zeile (INNER.x0 + 16 ... INNER.x1 - 16)
    ind: 3,                   // Plaetze pro Einrueckungsebene (3 x 40 = 120 px)
    minGap: 3,                // freie Plaetze am Zeilenende, damit es als Luecke zaehlt
    reach: 0.6,               // Anteil der Spielerstrecke (240 px/s) zwischen zwei Zeilen fuer den Seitenwechsel
    findN: [4, 6], findTell: [1.0, 0.85], findGap: 0.12, findW: 96, findH: 56, findShot: 185,
    saveTell: [0.8, 0.65], chunks: [3, 5], chunkR: 46, chunkTell: [1.05, 0.9], chunkGap: 0.15,
    idle: [1.0, 0.75],        // Pause nach einem Angriff (AI.cooldown)
    walk: [[1.4, 2.0], [0.9, 1.4]],
    heal: 0.04,               // Heilung pro angekommenem Modul (Anteil der Max-HP), gedeckelt bei 50 %
    modules: 4, moduleCd: 10, moduleRefill: 2, moduleMax: 4,
    moduleMinD: 170,          // Mindestabstand eines frisch abgesprengten Moduls zum Boss (px)
    lines: 6000000,           // fuer die HUD-Anzeige
  };
  const MEGA_SPRITE_Y = -30;  // Sprite (128 px hoch) steht auf dem Schatten; Kollisionskreis = Sockel
  const MEGA_SHOT = { color: '#d65050' };
  const SYNTAX = ['#ff7ab6', '#ffcf4d', '#7fd4ff', '#9be07a'];  // Schluesselwort, String, Name, Kommentar
  const MARKER = '#ff5a5a';
  const FIND_COLOR = '#ffe14d';
  const PLAYER_R = 20, SHOT_HIT = 22;  // Spielerradius (Wand) und Trefferabstand Spieler <-> Zeilenkugel (8 + 0.7 * 20)

  const slotX = (i) => INNER.x0 + 16 + i * MEGA.step;

  /** Kugelplaetze einer Zeile: von der Einrueckung bis zum Zeilenende, ohne das Loch einer Markerzeile */
  function megaSlots(line) {
    const out = [];
    for (let i = line.L * MEGA.ind; i <= line.end; i++) {
      if (line.hole !== undefined && i >= line.hole && i <= line.hole + 2) continue;
      out.push(i);
    }
    return out;
  }

  /**
   * Sichere Bereiche einer Zeile fuer den Spieler-Mittelpunkt: [[lo, hi], ...] (x in px). Zwischen zwei Kugeln,
   * zwischen Wand und erster/letzter Kugel; nur Bereiche mit >= 40 px Spielraum zaehlen.
   */
  function megaGaps(line) {
    const xs = megaSlots(line).map(slotX);
    const out = [];
    const push = (lo, hi) => { if (hi - lo >= 40) out.push([lo, hi]); };
    if (!xs.length) { push(INNER.x0 + PLAYER_R, INNER.x1 - PLAYER_R); return out; }
    push(INNER.x0 + PLAYER_R, xs[0] - SHOT_HIT);
    for (let i = 1; i < xs.length; i++) push(xs[i - 1] + SHOT_HIT, xs[i] - SHOT_HIT);
    push(xs[xs.length - 1] + SHOT_HIT, INNER.x1 - PLAYER_R);
    return out;
  }

  /** Erreicht man von einer Luecke der einen Zeile eine Luecke der naechsten (Abstand <= reach px)? */
  function megaReach(ga, gb, reach) {
    for (const a of ga) {
      for (const b of gb) {
        if (Math.max(0, b[0] - a[1], a[0] - b[1]) <= reach) return true;
      }
    }
    return false;
  }

  /** Eine Codezeile mit Einrueckung L wuerfeln (marker: Konfliktmarker mit einem Loch) */
  function megaLine(rng, L, marker) {
    const last = MEGA.slots - 1;
    if (marker) return { L: 0, end: last, hole: rng.int(1, last - 3), marker: true };
    if (L > 0 && rng.chance(0.35)) return { L, end: last };            // bis an die Wand: nur die Einrueckung ist frei
    const start = L * MEGA.ind;
    return { L, end: rng.int(Math.min(start + 4, last - MEGA.minGap), last - MEGA.minGap) };
  }

  /**
   * Eine "Funktion" aus n Zeilen. Erste Zeile ohne Einrueckung (also mit freiem Zeilenende), danach wechselt die
   * Einrueckung um hoechstens eine Ebene (meist tiefer, wie verschachtelter Code). Jede Zeile muss von der
   * vorigen aus erreichbar sein; sonst wird neu gewuerfelt, notfalls die vorige Zeile wiederholt (immer fair).
   */
  function megaBody(rng, n, p2, reach) {
    const lines = [];
    const markerAt = p2 ? rng.int(2, n - 1) : -1;
    let L = 0, prev = null;
    for (let i = 0; i < n; i++) {
      let line = null;
      for (let k = 0; k < 16 && !line; k++) {
        const nl = i === 0 ? 0 : clamp(L + rng.pick([-1, 0, 1, 1]), 0, 3);
        const cand = megaLine(rng, nl, i === markerAt);
        const g = megaGaps(cand);
        if (!g.length) continue;
        if (prev && !megaReach(megaGaps(prev), g, reach)) continue;
        line = cand;
      }
      if (!line) line = prev ? Object.assign({}, prev) : { L: 0, end: MEGA.slots - 1 - MEGA.minGap };
      lines.push(line);
      prev = line;
      L = line.L;
    }
    return lines;
  }

  /** Zeile abfeuern: eine Kugel je Platz, Farben wie Syntax-Hervorhebung (Token zu je 1–3 Zeichen) */
  function megaEmitRow(e, game, line, sc) {
    const s = e.state;
    s.lineNo += 1 + (line.L === 0 ? 2 : 0);
    const src = 'line ' + fmt(s.lineNo);
    const sp = AI.shotSpeed(game, MEGA.rowSpeed[s.phase === 2 ? 1 : 0]);
    for (const i of megaSlots(line)) {
      const tok = Math.floor((i * 5 + s.lineNo) / 7) % SYNTAX.length;
      AI.shoot(game, e, sc.angle, sp, { x: slotX(i), y: sc.y, color: line.marker ? MARKER : SYNTAX[tok], r: 8, range: 1000, source: src });
    }
  }

  /** Startet die naechste Funktion: Zeilen wuerfeln, Startwand = die vom Spieler weiter entfernte */
  function megaStartScroll(e, game) {
    const s = e.state, p2 = s.phase === 2, p = game.player;
    const gap = MEGA.rowGap[p2 ? 1 : 0];
    const reach = gap * 240 * MEGA.reach;
    const down = p.y > CY;
    s.sc = {
      rows: megaBody(game.rng, MEGA.rows[p2 ? 1 : 0], p2, reach),
      i: 0,
      angle: down ? Math.PI / 2 : -Math.PI / 2,
      y: down ? INNER.y0 + 14 : INNER.y1 - 14,
      gap,
    };
    s.mode = 'scroll';
    s.t = MEGA.tell;
    s.first = true;
    AI.say(e, 'scrolling...', 1.0, '#c8ccd2');
  }

  /** Freie Stelle fuer einen Suchtreffer (erster genau auf dem Spieler, die anderen drumherum, ohne Ueberlappung) */
  function megaFindSpot(e, game) {
    const s = e.state, p = game.player;
    const hw = MEGA.findW / 2 + 6, hh = MEGA.findH / 2 + 6;
    const first = !s.hl.length;
    for (let k = 0; k < 14; k++) {
      const a = game.rng.angle(), d = first ? 0 : game.rng.float(90, 220);
      const x = clamp(p.x + Math.cos(a) * d, INNER.x0 + hw, INNER.x1 - hw);
      const y = clamp(p.y + Math.sin(a) * d, INNER.y0 + hh, INNER.y1 - hh);
      if (first || s.hl.every((q) => Math.abs(q.x - x) > MEGA.findW || Math.abs(q.y - y) > MEGA.findH)) return { x, y };
    }
    return null;
  }

  /** Ein Suchtreffer wird ersetzt: Schaden im Rechteck, Kugelkreuz aus der Mitte */
  function megaReplace(e, game, h) {
    const p = game.player, p2 = e.state.phase === 2;
    h.done = true;
    h.after = 0.35;
    if (Math.abs(p.x - h.x) < MEGA.findW / 2 + p.r * 0.5 && Math.abs(p.y - h.y) < MEGA.findH / 2 + p.r * 0.5) {
      if (p.hurt(1, e.def.name, game)) p.knockback(p.x - h.x, p.y - h.y, 300);
    }
    const off = p2 && h.n % 2 ? Math.PI / 4 : 0;
    const sp = AI.shotSpeed(game, MEGA.findShot);
    for (let i = 0; i < 4; i++) AI.shoot(game, e, off + (i * Math.PI) / 2, sp, { x: h.x, y: h.y, color: FIND_COLOR, source: 'a search-and-replace' });
    B.bus.emit('bossReplace', { game, boss: e, x: h.x, y: h.y, color: FIND_COLOR });
  }

  /** Code-Brocken schlaegt auf: volles Herz im Radius */
  function megaChunk(e, game, c) {
    const p = game.player;
    c.hit = true;
    c.after = 0.5;
    if (Math.hypot(p.x - c.x, p.y - c.y) < MEGA.chunkR + p.r * 0.5) {
      if (p.hurt(2, e.def.name, game)) p.knockback(p.x - c.x, p.y - c.y, 380);
    }
    game.shake(5, 0.15);
    BH.addWave(e, c.x, c.y, MEGA.chunkR * 1.5, '#9aa0a8', 0.35);
    B.bus.emit('bossStomp', { game, boss: e, x: c.x, y: c.y });
  }

  /** Stampfen: Ring aus 16 Kugeln, Wackeln, Staubring */
  function megaSlam(e, game, off) {
    AI.ring(game, e, 16, AI.shotSpeed(game, 185), off, MEGA_SHOT);
    game.shake(11, 0.3);
    BH.addWave(e, e.x, e.y + e.r * 0.6, e.r * 2.8, '#c9b8a8', 0.45);
    B.bus.emit('bossStomp', { game, boss: e, x: e.x, y: e.y });
  }

  /**
   * Modul absprengen: landet weit weg vom Boss (es soll eine Weile zurueckkriechen). Die Wand kann den Wurf
   * abkuerzen (Boss nahe einer Wand), deshalb mehrere Winkel probieren und den ersten Platz mit >= MEGA.moduleMinD
   * Abstand nehmen, sonst den entferntesten.
   */
  function megaSpawnModule(e, game, angle) {
    const I = INNER;
    let best = null, bestD = -1;
    for (let k = 0; k < 8; k++) {
      const a = angle + k * 0.9;
      const d = game.rng.float(220, 320);
      const tx = clamp(e.x + Math.cos(a) * d, I.x0 + 40, I.x1 - 40);
      const ty = clamp(e.y + Math.sin(a) * d, I.y0 + 40, I.y1 - 40);
      const pos = game.nearestFreePos(tx, ty);
      const dd = Math.hypot(pos.x - e.x, pos.y - e.y);
      if (dd > bestD) { best = pos; bestD = dd; }
      if (dd >= MEGA.moduleMinD) break;
    }
    const pos = best;
    const m = game.spawnEnemy('megalith_module', pos.x, pos.y);
    if (m) {
      m.state.owner = e;
      m.spawnDelay = 0.5;
    }
    return m;
  }

  /** Modul kommt an: heilt den Megalith (nie ueber die Phasengrenze 50 %) und verschwindet ohne Kill */
  function megaAbsorb(boss, m, game) {
    const cap = boss.maxHp * 0.5;
    boss.hp = Math.max(boss.hp, Math.min(cap, boss.hp + boss.maxHp * MEGA.heal));
    m.dead = true;
    B.bus.emit('bossAbsorb', { game, boss, x: m.x, y: m.y, color: '#9be07a' });
  }

  function megaIdle(e, game) {
    const s = e.state;
    s.mode = 'idle';
    s.t = AI.cooldown(game, MEGA.idle[s.phase === 2 ? 1 : 0]);
  }

  /** Naechsten Angriff waehlen (nie zweimal derselbe); forced nur fuer den Rauchtest */
  function megaPick(e, game, forced) {
    const s = e.state, p2 = s.phase === 2;
    const a = forced || game.rng.pick(['scroll', 'find', 'save'].filter((x) => x !== s.last));
    s.last = a;
    AI.stop(e);
    if (a === 'scroll') megaStartScroll(e, game);
    else if (a === 'find') {
      s.mode = 'find';
      s.left = MEGA.findN[p2 ? 1 : 0];
      s.t = 0.35;               // kurzer Moment, bevor die Treffer aufpoppen (der erste Treffer ist der Telegraph)
      AI.say(e, 'Ctrl+F', 1.0, FIND_COLOR);
      B.bus.emit('bossSearch', { game, boss: e, x: e.x, y: e.y });
    } else {
      s.mode = 'save';
      s.dur = s.t = MEGA.saveTell[p2 ? 1 : 0];
      s.second = false;
      s.ringOff = game.rng.angle();
      AI.say(e, 'Ctrl+S', 1.0, '#ff8a7a');
      // Brocken: der erste auf dem Spieler, die anderen drumherum, gestaffelt
      const p = game.player, n = MEGA.chunks[p2 ? 1 : 0];
      const tell = MEGA.chunkTell[p2 ? 1 : 0];
      for (let i = 0; i < n; i++) {
        const a2 = game.rng.angle(), d = i === 0 ? 0 : game.rng.float(90, 190);
        const pos = AI.clampToRoom(p.x + Math.cos(a2) * d, p.y + Math.sin(a2) * d, 30, {});
        s.chunks.push({ x: pos.x, y: pos.y, t: tell + i * MEGA.chunkGap, dur: tell + i * MEGA.chunkGap, hit: false, after: 0 });
      }
    }
  }

  B.BOSS_BEHAVIORS.megalith = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 300);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.2;
      s.fx = [];
      s.hl = [];              // Suchtreffer (Ctrl+F)
      s.chunks = [];          // fallende Code-Brocken (Ctrl+S)
      s.sc = null;            // laufende Scroll-Attacke
      s.lift = 0;
      s.last = null;
      s.modCd = 0;
      s.lineNo = game.rng.int(1000000, 5900000);
      e.sayOffset = 50;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;

      // ---- Phase 2 bei 50 %: "Refactor rejected" ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        s.mode = 'reject';
        s.t = 1.3;
        s.lift = 0;
        s.sc = null;
        AI.stop(e);
        game.shake(10, 0.6);
        AI.say(e, 'REFACTOR REJECTED', 1.6, '#ff8a7a');
        game.banner('Refactor rejected', 'It is all going back into one file.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      // ---- Phase 2: Module nachliefern ----
      if (p2 && s.mode !== 'reject') {
        s.modCd -= dt;
        if (s.modCd <= 0) {
          s.modCd = MEGA.moduleCd;
          const room = BH.countMinions(e, game);
          const n = Math.min(MEGA.moduleRefill, MEGA.moduleMax - room);
          const a0 = game.rng.angle();
          for (let i = 0; i < n; i++) megaSpawnModule(e, game, a0 + i * Math.PI);
          if (n > 0) AI.say(e, 'git revert', 1.0, '#c8ccd2');
        }
      }

      // ---- Suchtreffer und Brocken laufen unabhaengig vom aktuellen Angriff weiter ----
      for (const h of s.hl) {
        if (!h.done) { h.t -= dt; if (h.t <= 0) megaReplace(e, game, h); } else h.after -= dt;
      }
      s.hl = s.hl.filter((h) => !h.done || h.after > 0);
      for (const c of s.chunks) {
        if (!c.hit) { c.t -= dt; if (c.t <= 0) megaChunk(e, game, c); } else c.after -= dt;
      }
      s.chunks = s.chunks.filter((c) => !c.hit || c.after > 0);

      switch (s.mode) {
        case 'idle':
          AI.stop(e);
          if (s.t <= 0) {
            s.mode = 'walk';
            const w = MEGA.walk[p2 ? 1 : 0];
            s.t = game.rng.float(w[0], w[1]);
          }
          break;

        case 'walk':
          AI.pathToward(e, game, p.x, p.y, e.speed * (p2 ? 1.3 : 1));
          if (s.t <= 0) megaPick(e, game);
          break;

        case 'scroll': {
          AI.stop(e);
          const sc = s.sc;
          if (!sc) { megaIdle(e, game); break; }
          if (s.t <= 0) {
            megaEmitRow(e, game, sc.rows[sc.i], sc);
            s.first = false;
            sc.i++;
            if (sc.i >= sc.rows.length) { s.sc = null; s.mode = 'recover'; s.t = 0.6; } else s.t = sc.gap;
          }
          break;
        }

        case 'find':
          AI.stop(e);
          if (s.t <= 0) {
            if (s.left > 0) {
              const pos = megaFindSpot(e, game);
              const tell = MEGA.findTell[p2 ? 1 : 0];
              const n = MEGA.findN[p2 ? 1 : 0];
              if (pos) s.hl.push({ x: pos.x, y: pos.y, t: tell, dur: tell, done: false, after: 0, n: n - s.left, of: n });
              s.left--;
              s.t = MEGA.findGap;
            } else if (!s.hl.some((h) => !h.done)) megaIdle(e, game);
          }
          break;

        case 'save': {
          AI.stop(e);
          const k = 1 - Math.max(0, s.t) / s.dur;
          s.lift = Math.sin(k * Math.PI * 0.5) * 24;
          if (s.t <= 0) {
            s.lift = 0;
            megaSlam(e, game, s.ringOff);
            if (p2 && !s.second) {
              s.second = true;
              s.dur = s.t = 0.42;
              s.ringOff += Math.PI / 16;
            } else { s.mode = 'recover'; s.t = 0.7; }
          }
          break;
        }

        case 'reject':
          AI.stop(e);
          if (s.t <= 0) {
            const a0 = game.rng.angle();
            for (let i = 0; i < MEGA.modules; i++) megaSpawnModule(e, game, a0 + (i * TAU) / MEGA.modules);
            BH.addWave(e, e.x, e.y + e.r * 0.6, e.r * 3.2, '#ff8a7a', 0.5);
            s.modCd = MEGA.moduleCd;
            megaIdle(e, game);
          }
          break;

        case 'recover':
        default:
          AI.stop(e);
          if (s.t <= 0) megaIdle(e, game);
          break;
      }
    },

    onDeath(e, game) {
      // Ohne Datei keine Module: alle mitnehmen
      for (const m of game.room.enemies.slice()) {
        if (!m.dead && m.state && m.state.owner === e) m.die(game);
      }
      B.bus.emit('bossExit', { game, boss: e, kind: 'segfault', x: e.x, y: e.y + MEGA_SPRITE_Y, color: '#4c515b' });
    },

    /** HUD: verbleibende Codezeilen statt Prozent */
    barText(e) {
      return { text: fmt(MEGA.lines * Math.max(0, e.hp) / e.maxHp) + ' / ' + fmt(MEGA.lines) + ' LINES', color: '#c8ccd2' };
    },

    draw(e, ctx) {
      const s = e.state, p2 = s.phase === 2;
      BH.drawFx(e, ctx);

      // ---- Vorschau der naechsten Zeile an der Startwand ----
      const sc = s.sc;
      if (s.mode === 'scroll' && sc && sc.rows[sc.i]) {
        const line = sc.rows[sc.i];
        const total = s.first ? MEGA.tell : sc.gap;
        const k = 1 - Math.max(0, s.t) / total;
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.4 * k;
        for (const i of megaSlots(line)) {
          ctx.fillStyle = line.marker ? MARKER : SYNTAX[Math.floor((i * 5 + s.lineNo + 1 + (line.L === 0 ? 2 : 0)) / 7) % SYNTAX.length];
          ctx.fillRect(slotX(i) - 14, sc.y - 3, 28, 6);
        }
        ctx.restore();
      }

      // ---- Suchtreffer: gelbes Rechteck, wird immer kraeftiger; danach kurz "ersetzt" ----
      for (const h of s.hl) {
        ctx.save();
        const x0 = h.x - MEGA.findW / 2, y0 = h.y - MEGA.findH / 2;
        if (!h.done) {
          const k = 1 - Math.max(0, h.t) / h.dur;
          ctx.fillStyle = 'rgba(255,225,77,' + (0.12 + 0.28 * k) + ')';
          ctx.fillRect(x0, y0, MEGA.findW, MEGA.findH);
          ctx.strokeStyle = 'rgba(255,225,77,' + (0.5 + 0.5 * k) + ')';
          ctx.lineWidth = 3;
          ctx.strokeRect(x0, y0, MEGA.findW, MEGA.findH);
          B.pixelText(ctx, (h.n + 1) + '/' + h.of, h.x, y0 - 10, { scale: 2, align: 'center', color: FIND_COLOR, shadow: 'rgba(0,0,0,0.7)' });
        } else {
          ctx.globalAlpha = Math.max(0, h.after / 0.35);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.strokeRect(x0 - 4, y0 - 4, MEGA.findW + 8, MEGA.findH + 8);
        }
        ctx.restore();
      }

      // ---- Stampf-Telegraph: roter Ring um den Sockel waechst ----
      if (s.mode === 'save') {
        const k = 1 - Math.max(0, s.t) / s.dur;
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = '#ff5040';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * (1 + 0.8 * k), e.r * 0.45 * (1 + 0.8 * k), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      // ---- Koerper ----
      const name = p2 && B.hasSprite('boss_megalith_cracked') ? 'boss_megalith_cracked' : e.def.sprite;
      const glow = s.mode === 'reject' || s.mode === 'find' || (s.mode === 'save' && s.t < s.dur * 0.5) ||
        (s.mode === 'scroll' && s.first);
      const scroll = Math.floor(e.t * (s.mode === 'scroll' ? 8 : 1.5)) % 2;
      const shake = s.mode === 'reject' ? Math.sin(e.t * 60) * 4 : 0;
      const top = e.y + MEGA_SPRITE_Y - s.lift;
      BH.drawSprite(e, ctx, name, e.x + shake, top, { frame: (glow ? 2 : 0) + scroll, alpha: e.spawnDelay > 0 ? 0.6 : 1 });
      if (s.mode === 'scroll' && s.first) AI.drawMark(ctx, '!', e.x, top - 78, e.t, '#ff4d4d', 30);

      // ---- Fallende Brocken (ueber dem Koerper, sie kommen von oben) ----
      for (const c of s.chunks) {
        if (c.hit) continue;
        const k = 1 - Math.max(0, c.t) / c.dur;
        AI.drawTargetRing(ctx, c.x, c.y, MEGA.chunkR, k, '#ff5040');
        if (k > 0.35) {
          const f = (k - 0.35) / 0.65;
          const y = c.y - 320 * (1 - f * f);
          ctx.save();
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(c.x - 20, y - 14, 40, 28);
          ctx.fillStyle = '#474c55';
          ctx.fillRect(c.x - 17, y - 11, 34, 22);
          ctx.fillStyle = SYNTAX[(c.dur * 10 | 0) % SYNTAX.length];
          ctx.fillRect(c.x - 12, y - 4, 16, 3);
          ctx.fillStyle = SYNTAX[(c.dur * 10 + 1 | 0) % SYNTAX.length];
          ctx.fillRect(c.x - 6, y + 3, 14, 3);
          ctx.restore();
        }
      }
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // Modul (Minion des Megalith): kriecht geradewegs zurueck zum Boss (gestrichelte "import"-Linie zeigt wohin);
  // kommt es an, heilt es ihn. Ohne lebenden Besitzer jagt es den Spieler wie ein Microservice.
  B.BEHAVIORS.megalith_module = {
    update(e, dt, game) {
      const o = e.state.owner;
      if (o && !o.dead) {
        AI.toward(e, o.x, o.y, e.speed);
        if (Math.hypot(o.x - e.x, o.y - e.y) < o.r + e.r + 6) megaAbsorb(o, e, game);
      } else {
        AI.pathToward(e, game, game.player.x, game.player.y, e.speed * 1.3);
      }
    },
    drawUnder(e, ctx) {
      const o = e.state.owner;
      if (!o || o.dead) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(155,224,122,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -e.t * 40;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      ctx.restore();
    },
  };

  // ===========================================================================
  // THE SHAREHOLDER
  // ===========================================================================

  const SHARE = {
    beamW: [14, 16], aim: [1.0, 0.85], aimTurn: 2.4, lock: 0.4, fire: 0.6, bounces: [1, 2],
    divTell: 0.6, orbs: [3, 5], orbSpread: 0.32, orbSpeed: 165, orbFuse: 0.8, orbSwell: 0.3, payout: 6, payoutSpeed: 185,
    rainTell: 0.5, coins: [6, 9], coinGap: 0.1, coinR: 30, coinTell: [0.95, 0.85], coinCap: 6, coinLife: 3, coinChance: 0.25,
    buyTell: 0.6, buyRing: 12, buyMin: 8, buyWait: 0.55, buyFreeze: 0.5, buySpeed: 200,
    quarter: 12, qShare: 0.08, stun: 1.5, stunMult: 1.25, beatTell: 0.6, beatRing: 10, beatSpeed: 0.08, beatMax: 3,
    idle: [1.3, 0.95],
  };
  const GOLD = '#ffcf4d';
  const ORB_SHOT = { color: GOLD, r: 12, source: 'a dividend' };
  const PAYOUT_SHOT = { color: '#ffe9a3', r: 6, source: 'a dividend payout' };
  const SHARE_SHOT = { color: '#e0b23c', source: 'a share' };
  const SHARE_SPRITE_Y = -42;       // Sprite-Mitte relativ zum Kollisionskreis (Zylinder ragt nach oben)
  const MONOCLE = { x: 6, y: -66 }; // Monokel relativ zum Kollisionskreis (Zeile 9, Spalte 12 des Sprites)
  const SHARE_BEAM_STYLE = { rgb: '255,214,90', lock: '#ffd65a',
    layers: [['rgba(255,200,60,0.3)', 1, 12], [GOLD, 1, 0], ['#fffbe6', 0.4, 0]] };

  function shMonocle(e) { return { x: e.x + MONOCLE.x, y: e.y + MONOCLE.y }; }

  function shIdle(e, game) {
    const s = e.state;
    s.mode = 'idle';
    s.t = AI.cooldown(game, SHARE.idle[s.phase === 2 ? 1 : 0]);
  }

  /** Schwebeziel: oberer/mittlerer Raum, mit Abstand zum Spieler (wie die Stakeholderin) */
  function shWaypoint(e, game) {
    const s = e.state, p = game.player, rng = game.rng;
    let x = CX, y = CY - 60;
    for (let i = 0; i < 12; i++) {
      x = rng.float(INNER.x0 + 110, INNER.x1 - 110);
      y = rng.float(INNER.y0 + 110, INNER.y1 - 120);
      if (Math.hypot(x - p.x, y - p.y) >= 210) break;
    }
    s.wp.x = x;
    s.wp.y = y;
    s.wpT = rng.float(2.0, 3.2);
  }

  /** Naechsten Angriff waehlen (nie zweimal derselbe); forced nur fuer den Rauchtest */
  function shNext(e, game, forced) {
    const s = e.state, p2 = s.phase === 2;
    const opts = p2 ? ['glint', 'dividend', 'rain', 'buyback'] : ['glint', 'dividend', 'rain'];
    const a = forced || game.rng.pick(opts.filter((x) => x !== s.last));
    s.last = a;
    if (a === 'glint') {
      s.mode = 'aim';
      s.t = SHARE.aim[p2 ? 1 : 0];
      s.aim = AI.angleTo(shMonocle(e), game.player);
      s.path = BH.beamPath(shMonocle(e).x, shMonocle(e).y, s.aim, SHARE.bounces[p2 ? 1 : 0], INNER);
    } else if (a === 'dividend') {
      s.mode = 'divTell';
      s.t = SHARE.divTell;
    } else if (a === 'rain') {
      s.mode = 'rainTell';
      s.t = SHARE.rainTell;
      s.left = SHARE.coins[p2 ? 1 : 0];
      AI.say(e, 'Make it rain.', 1.2, GOLD);
    } else {
      s.mode = 'buyback';
      s.stage = 0;
      s.t = SHARE.buyTell;
      s.held = [];
      AI.say(e, 'BUYBACK!', 1.2, GOLD);
    }
  }

  /** Muenze landet: halbes Herz im Ring; manche bleiben als echter Credit liegen (gedeckelt pro Kampf) */
  function shCoinLand(e, game, c) {
    const s = e.state, p = game.player;
    c.hit = true;
    c.after = 0.3;
    if (Math.hypot(p.x - c.x, p.y - c.y) < SHARE.coinR + p.r * 0.5) p.hurt(1, e.def.name, game);
    B.bus.emit('bossMoney', { game, boss: e, kind: 'coin', x: c.x, y: c.y, color: GOLD });
    if (c.real) {
      const pos = game.nearestFreePos(c.x, c.y);
      const pk = game.spawnPickup('credit', pos.x, pos.y);
      if (pk) s.real.push({ pk, t: SHARE.coinLife });
    }
  }

  /** Quartal auswerten (nur zwischen zwei Angriffen): verfehlt -> betaeubt, geschlagen -> Ring + schneller */
  function shQuarter(e, game) {
    const s = e.state, q = s.q;
    const dmg = q.hp0 - e.hp;
    if (dmg >= e.maxHp * SHARE.qShare) {
      s.mode = 'stunned';
      s.t = SHARE.stun;
      e.damageTakenMult = SHARE.stunMult;
      q.msg = 'MISSED ESTIMATES';
      q.good = false;
      AI.say(e, 'We missed estimates?!', 1.5, '#ff7a6a');
      B.bus.emit('bossMoney', { game, boss: e, kind: 'missed', x: e.x, y: e.y - 40, color: '#ff7a6a' });
    } else {
      s.mode = 'beat';
      s.t = SHARE.beatTell;
      q.msg = 'BEAT ESTIMATES';
      q.good = true;
      AI.say(e, 'Record quarter!', 1.2, '#8fe08f');
    }
    q.msgT = 2.5;
    q.n++;
    q.t = SHARE.quarter;
    q.hp0 = e.hp;
    q.due = false;
  }

  B.BOSS_BEHAVIORS.shareholder = {
    init(e, game) {
      e.x = CX;
      e.y = INNER.y0 + 150;
      BH.placeAwayFromPlayer(e, game, 260);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.2;
      s.fx = [];
      s.last = null;
      s.aim = Math.PI / 2;
      s.path = null;
      s.orbs = [];            // Dividenden unterwegs: { pr, t }
      s.coins = [];           // fallende Muenzen (Zielringe)
      s.real = [];            // liegengebliebene echte Credits: { pk, t }
      s.coinsLeft = SHARE.coinCap;
      s.held = [];
      s.spd = 1;              // Tempo-Faktor ("beat estimates")
      s.beats = 0;
      s.q = { n: 1, t: SHARE.quarter, hp0: e.hp, due: false, msg: '', msgT: 0, good: true };
      s.wp = { x: e.x, y: e.y };
      s.wpT = 0;
      e.drawLayer = 2;        // Strahl ueber allem anderen zeichnen
      e.sayOffset = 96;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;
      let moveMult = 1;

      // ---- Phase 2 bei 40 %: "Hostile takeover" ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.4) {
        s.phase = 2;
        s.mode = 'takeover';
        s.t = 1.3;
        s.coins.length = 0;
        s.orbs.length = 0;
        s.held.length = 0;
        e.damageTakenMult = undefined;
        BH.clearEnemyShots(game);
        game.shake(7, 0.45);
        AI.say(e, 'I am buying the company.', 1.6, GOLD);
        game.banner('Hostile takeover', 'Your roadmap has been acquired.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      // ---- Quartalsuhr (laeuft nicht waehrend Betaeubung, Jubel und Uebernahme) ----
      const q = s.q;
      if (q.msgT > 0) q.msgT -= dt;
      if (s.mode !== 'stunned' && s.mode !== 'beat' && s.mode !== 'takeover' && !q.due) {
        q.t -= dt;
        if (q.t <= 0) { q.t = 0; q.due = true; }
      }

      // ---- Dividenden: nach der Lunte aufblaehen, dann in einen Ring platzen ----
      for (const o of s.orbs) {
        o.t -= dt;
        const pr = o.pr;
        if (pr.dead) { o.t = -1; o.gone = true; continue; }
        if (o.t < SHARE.orbSwell) {
          const k = 1 - Math.max(0, o.t) / SHARE.orbSwell;
          pr.r = 12 + 4 * k;
          pr.color = Math.floor(o.t * 20) % 2 ? '#ffffff' : GOLD;
        }
        if (o.t <= 0) {
          const sp = AI.shotSpeed(game, SHARE.payoutSpeed);
          const off = game.rng.angle();
          for (let i = 0; i < SHARE.payout; i++) {
            AI.shoot(game, e, off + (i * TAU) / SHARE.payout, sp, Object.assign({ x: pr.x, y: pr.y }, PAYOUT_SHOT));
          }
          pr.die(game, false);
          o.gone = true;
        }
      }
      s.orbs = s.orbs.filter((o) => !o.gone);

      // ---- Muenzen landen; echte Credits verschwinden nach ihrer Frist ----
      for (const c of s.coins) {
        if (!c.hit) { c.t -= dt; if (c.t <= 0) shCoinLand(e, game, c); } else c.after -= dt;
      }
      s.coins = s.coins.filter((c) => !c.hit || c.after > 0);
      for (const r of s.real) {
        r.t -= dt;
        if (r.t <= 0 && !r.pk.dead) {
          r.pk.dead = true;
          B.bus.emit('bossMoney', { game, boss: e, kind: 'expire', x: r.pk.x, y: r.pk.y, color: GOLD });
        }
      }
      s.real = s.real.filter((r) => r.t > 0 && !r.pk.dead);

      switch (s.mode) {
        case 'idle':
          if (q.due) { shQuarter(e, game); break; }
          if (s.t <= 0) shNext(e, game);
          break;

        case 'aim': {
          moveMult = 0.25;
          const m = shMonocle(e);
          s.aim = AI.turn(s.aim, AI.angleTo(m, p), SHARE.aimTurn * dt);
          s.path = BH.beamPath(m.x, m.y, s.aim, SHARE.bounces[p2 ? 1 : 0], INNER);
          if (s.t <= 0) { s.mode = 'lock'; s.t = SHARE.lock; }
          break;
        }

        case 'lock':
          moveMult = 0;
          if (s.t <= 0) {
            s.mode = 'fire';
            s.t = SHARE.fire;
            game.shake(4, 0.2);
            for (let i = 1; i < s.path.length; i++) BH.addWave(e, s.path[i].x, s.path[i].y, 40, GOLD, 0.6);
            B.bus.emit('bossBeam', { game, boss: e, x: s.path[0].x, y: s.path[0].y });
          }
          break;

        case 'fire': {
          moveMult = 0;
          const seg = BH.beamHits(p, s.path, SHARE.beamW[p2 ? 1 : 0]);
          if (seg) {
            const a = s.path[seg - 1], b = s.path[seg];
            const n = B.M.norm(-(b.y - a.y), b.x - a.x);
            const side = (p.x - a.x) * n.x + (p.y - a.y) * n.y >= 0 ? 1 : -1;
            if (p.hurt(2, e.def.name, game)) p.knockback(n.x * side, n.y * side, 420);
          }
          if (s.t <= 0) { s.path = null; shIdle(e, game); }
          break;
        }

        case 'divTell':
          moveMult = 0.4;
          if (s.t <= 0) {
            const n = SHARE.orbs[p2 ? 1 : 0];
            const base = AI.angleTo(e, p);
            const sp = AI.shotSpeed(game, SHARE.orbSpeed);
            for (let i = 0; i < n; i++) {
              const pr = AI.shoot(game, e, base + (i - (n - 1) / 2) * SHARE.orbSpread, sp, ORB_SHOT);
              if (pr) s.orbs.push({ pr, t: SHARE.orbFuse });
            }
            shIdle(e, game);
          }
          break;

        case 'rainTell':
          moveMult = 0.5;
          if (s.t <= 0) {
            if (s.left > 0) {
              const first = s.left === SHARE.coins[p2 ? 1 : 0];
              let pos = null;
              for (let k = 0; k < 12 && !pos; k++) {
                const a = game.rng.angle(), d = first ? 0 : game.rng.float(60, 220);
                const c = AI.clampToRoom(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 34, {});
                if (first || s.coins.every((o) => o.hit || Math.hypot(o.x - c.x, o.y - c.y) >= 64)) pos = c;
              }
              if (pos) {
                const real = s.coinsLeft > 0 && game.rng.chance(SHARE.coinChance);
                if (real) s.coinsLeft--;
                const tell = SHARE.coinTell[p2 ? 1 : 0];
                s.coins.push({ x: pos.x, y: pos.y, t: tell, dur: tell, real, hit: false, after: 0 });
              }
              s.left--;
              s.t = SHARE.coinGap;
            } else if (!s.coins.some((c) => !c.hit)) shIdle(e, game);
          }
          break;

        case 'buyback':
          moveMult = 0.2;
          if (s.t > 0) break;
          if (s.stage === 0) {
            // Kaum Kugeln unterwegs? Dann erst Muenzen auswerfen, damit es etwas zurueckzukaufen gibt
            const own = game.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead).length;
            if (own < SHARE.buyMin) AI.ring(game, e, SHARE.buyRing, AI.shotSpeed(game, 190), game.rng.angle(), SHARE_SHOT);
            s.stage = 1;
            s.t = SHARE.buyWait;
          } else if (s.stage === 1) {
            s.held = game.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead);
            for (const pr of s.held) { pr.vx = 0; pr.vy = 0; pr.color = '#fff3b0'; }
            s.stage = 2;
            s.t = SHARE.buyFreeze;
          } else {
            const sp = AI.shotSpeed(game, SHARE.buySpeed);
            for (const pr of s.held) {
              if (pr.dead) continue;
              const dx = e.x - pr.x, dy = e.y - 20 - pr.y;
              const d = Math.hypot(dx, dy) || 1;
              pr.vx = (dx / d) * sp;
              pr.vy = (dy / d) * sp;
              pr.range = pr.travel + d + 4;   // verschwindet, wenn sie bei ihm ankommt
              pr.color = GOLD;
            }
            s.held.length = 0;
            B.bus.emit('bossMoney', { game, boss: e, kind: 'buyback', x: e.x, y: e.y - 20, color: GOLD });
            shIdle(e, game);
          }
          break;

        case 'beat':
          moveMult = 0.3;
          if (s.t <= 0) {
            AI.ring(game, e, SHARE.beatRing, AI.shotSpeed(game, 190), game.rng.angle(), SHARE_SHOT);
            if (s.beats < SHARE.beatMax) { s.beats++; s.spd = 1 + s.beats * SHARE.beatSpeed; }
            B.bus.emit('bossMoney', { game, boss: e, kind: 'beat', x: e.x, y: e.y - 40, color: '#8fe08f' });
            shIdle(e, game);
          }
          break;

        case 'stunned':
          moveMult = 0;
          if (s.t <= 0) {
            e.damageTakenMult = undefined;
            s.mode = 'idle';
            s.t = 0.6;
          }
          break;

        case 'takeover':
          moveMult = 0;
          if (s.t <= 0) shIdle(e, game);
          break;
      }

      // ---- Schweben zwischen Wegpunkten ----
      s.wpT -= dt;
      if (s.wpT <= 0 || Math.hypot(s.wp.x - e.x, s.wp.y - e.y) < 24 || Math.hypot(p.x - e.x, p.y - e.y) < 150) {
        if (s.wpT <= 1.6) shWaypoint(e, game);
      }
      const n = B.M.norm(s.wp.x - e.x, s.wp.y - e.y);
      const sp = e.speed * moveMult * (p2 ? 1.25 : 1) * s.spd;
      const k = Math.min(1, dt * 2.5);
      e.vx += (n.x * sp - e.vx) * k;
      e.vy += (n.y * sp - e.vy) * k;
    },

    onDeath(e, game) {
      e.damageTakenMult = undefined;
      // Liegengebliebene Credits behaelt der Spieler (die Frist laeuft ohne ihn nicht weiter)
      B.bus.emit('bossExit', { game, boss: e, kind: 'parachute', x: e.x, y: e.y + SHARE_SPRITE_Y, color: GOLD });
    },

    /** HUD: Quartalsuhr bzw. das Ergebnis des letzten Quartals */
    barText(e) {
      const q = e.state.q;
      if (!q) return null;
      if (q.msgT > 0) return { text: q.msg, color: q.good ? '#8fe08f' : '#ff7a6a' };
      const quarter = ((q.n - 1) % 4) + 1;
      const urgent = q.t < 2 && Math.floor(q.t * 6) % 2 === 0;
      return { text: 'Q' + quarter + ' EARNINGS IN ' + Math.ceil(q.t) + 'S', color: urgent ? '#ffffff' : '#ffd27a' };
    },

    draw(e, ctx) {
      const s = e.state, p2 = s.phase === 2;
      BH.drawFx(e, ctx);

      // ---- Muenzen: goldener Zielring, die Muenze faellt von oben (echte und unechte sehen gleich aus) ----
      for (const c of s.coins) {
        if (c.hit) continue;
        const k = 1 - Math.max(0, c.t) / c.dur;
        AI.drawTargetRing(ctx, c.x, c.y, SHARE.coinR, k, GOLD);
        const y = c.y - 300 * (1 - k) * (1 - k);
        const spin = Math.abs(Math.cos(e.t * 9 + c.x));
        ctx.save();
        ctx.fillStyle = '#7a5a10';
        ctx.beginPath(); ctx.ellipse(c.x, y, 10 * spin + 2, 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.ellipse(c.x, y, 8 * spin + 1, 8, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // ---- Rueckkauf: goldene Linien zeigen, wohin die stehenden Kugeln gleich fliegen ----
      if (s.mode === 'buyback' && s.stage === 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,207,77,0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        for (const pr of s.held) {
          if (pr.dead) continue;
          ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(e.x, e.y - 20); ctx.stroke();
        }
        ctx.restore();
      }

      // ---- Strahl ----
      const beaming = s.mode === 'aim' || s.mode === 'lock' || s.mode === 'fire';
      if (beaming && s.path) BH.drawBeam(ctx, s.path, s.mode, e.t, SHARE.beamW[p2 ? 1 : 0], SHARE_BEAM_STYLE);

      // ---- Koerper (beim Zielen ohne Wippen, damit das Monokel genau am Strahlanfang sitzt) ----
      const bob = beaming ? 0 : Math.sin(e.t * 2.2) * 6;
      const y = e.y + SHARE_SPRITE_Y + bob;
      if (s.mode === 'takeover') AI.drawGlow(ctx, e.x, e.y - 30, e.r + 28, 0.5 + 0.5 * Math.sin(e.t * 20), GOLD);
      if (s.mode === 'buyback' && s.stage < 2) AI.drawGlow(ctx, e.x, e.y - 30, e.r + 18, 1 - Math.max(0, s.t) / SHARE.buyTell, GOLD);
      if (s.mode === 'beat') AI.drawGlow(ctx, e.x, e.y - 30, e.r + 20, 1 - Math.max(0, s.t) / SHARE.beatTell, '#8fe08f');
      // Muenzhaufen unter ihm
      ctx.save();
      for (const [dx, dy, r] of [[-14, 0, 9], [12, 2, 8], [0, -4, 10], [-4, 6, 8], [8, -8, 7]]) {
        ctx.fillStyle = '#7a5a10';
        ctx.beginPath(); ctx.ellipse(e.x + dx, y + 70 + dy, r + 1.5, r * 0.5 + 1.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e0b23c';
        ctx.beginPath(); ctx.ellipse(e.x + dx, y + 69 + dy, r, r * 0.5, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      const name = p2 && B.hasSprite('boss_shareholder_angry') ? 'boss_shareholder_angry' : e.def.sprite;
      const shake = s.mode === 'takeover' ? Math.sin(e.t * 50) * 4 : 0;
      const tilt = s.mode === 'stunned' ? Math.sin(e.t * 9) * 0.12 : 0;
      BH.drawSprite(e, ctx, name, e.x + shake, y, { frame: Math.floor(e.t * 3), alpha: e.spawnDelay > 0 ? 0.6 : 1, rotation: tilt });

      // ---- Monokel-Funkeln (Telegraph des Strahls): waechst beim Zielen, blinkt beim Einfrieren ----
      if (s.mode === 'aim' || s.mode === 'lock') {
        const m = { x: e.x + MONOCLE.x, y: e.y + MONOCLE.y };
        const k = s.mode === 'lock' ? 1 : 1 - Math.max(0, s.t) / SHARE.aim[p2 ? 1 : 0];
        AI.drawGlow(ctx, m.x, m.y, 8 + 12 * k, 0.4 + 0.5 * k, '#fff1a8');
        const len = 6 + 18 * k;
        ctx.save();
        ctx.strokeStyle = s.mode === 'lock' && Math.floor(e.t * 20) % 2 ? GOLD : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(m.x - len, m.y); ctx.lineTo(m.x + len, m.y);
        ctx.moveTo(m.x, m.y - len); ctx.lineTo(m.x, m.y + len);
        ctx.moveTo(m.x - len * 0.45, m.y - len * 0.45); ctx.lineTo(m.x + len * 0.45, m.y + len * 0.45);
        ctx.moveTo(m.x - len * 0.45, m.y + len * 0.45); ctx.lineTo(m.x + len * 0.45, m.y - len * 0.45);
        ctx.stroke();
        ctx.restore();
      }
      // Betaeubt: Dollarzeichen kreisen um den Zylinder
      if (s.mode === 'stunned') {
        for (let i = 0; i < 3; i++) {
          const a = e.t * 5 + (i * TAU) / 3;
          // Systemschrift: die Pixelschrift kennt kein '$'
          B.text(ctx, '$', e.x + Math.cos(a) * 34, y - 66 + Math.sin(a) * 8, { size: 20, bold: true, color: GOLD, align: 'center', baseline: 'middle' });
        }
      }
      if (s.mode === 'divTell' || s.mode === 'beat') AI.drawMark(ctx, '$', e.x, y - 82, e.t, s.mode === 'beat' ? '#8fe08f' : GOLD, 30);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // Fuer den Rauchtest: Zeilen-Geometrie des Megalith, Tempo-Tabellen und Angriffe gezielt starten
  B.BossHelpers.late = { megaBody, megaGaps, megaReach, megaSlots, slotX, MEGA, SHARE, megaPick, shNext };
})(window.BOTA);
