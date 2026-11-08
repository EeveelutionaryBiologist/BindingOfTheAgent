/*
 * boss-system-prompt.js — The System Prompt (BOTA.BOSS_BEHAVIORS.system_prompt), Daten in data/bosses.js.
 *
 * Fester Etagen-Boss von The Context Limit (Etage 11, 22, ...) und damit der letzte Kampf eines normalen Runs.
 * Die erste Nachricht jedes Gespraechs, getroffen ganz am Ende: ein grosser, ertrunkener Schatten aus einer
 * aufgeweichten Schriftrolle mit einer Kapuze, in der ein Textcursor blinkt. Thema: UNAUSWEICHLICHKEIT. Er beeilt sich
 * nie, verbirgt nie, was er als Naechstes tut, und laesst sich nicht davon abhalten. Man kann ihn nur ueberstehen.
 * Spezifikation: DESIGN.md §8, "The System Prompt".
 *
 * Grundmechanik:
 *   Gehen      Gleitet mit festen SP.walk px/s auf den Spieler zu, durch Felsen und Gruben (fliegt), ohne Rueckstoss.
 *              Kontakt kostet ein volles Herz. Nie schneller, nie langsamer, nie ein Sprint.
 *   Skript     "As it was written": die naechsten drei Aktionen stehen immer in der HUD-Zeile unter dem Boss-Balken
 *              (barText). Beginnt eine, rutscht die naechste nach und eine neue wird hinten angehaengt (aus game.rng,
 *              je nach Phase). Eine geschriebene Aktion laeuft IMMER so, wie sie dasteht, auch nach einem Phasenwechsel.
 *              Immer nur eine Aktion zugleich, dazwischen SP.pause Sekunden (AI.cooldown).
 *   Seed       Nach SP.seedAt Sekunden fluestert er den Seed des Runs gross in die Raummitte (jeder Run steht durch seinen
 *              Seed wirklich fest). Nur Canvas-Text; der Seed ist ueber B.cleanSeed geprueft.
 *
 * Aktionen (state.cur.kind):
 *   truncate   Eine Bernsteinlinie faehrt SP.truncTell s lang von der Wand bis zur Grenze, dann steht der Bereich dahinter
 *              SP.truncOn s unter Wasser und laeuft SP.truncDrain s lang (harmlos) ab. Im Wasser: Spieler gebremst
 *              (slowBy) und ein halbes Herz pro Treffer (die i-Frames machen daraus eines pro Sekunde), auch fuer
 *              Flieger. Baender liegen auf Kachelspalten: links 1–4, rechts 10–13, Mitte 5–9 (Phase 2). Overlay-Klasse
 *              Truncation in room.pickups (echte Kacheln aendern sich nie); floodOk prueft vorher, dass trockener Boden
 *              zusammenhaengend genug und schnell erreichbar bleibt, sonst wird das Band schmaler.
 *   recall     Eine Fluesterzeile flackert SP.recallTell s lang in Bernstein ueber ihm, eine gestrichelte Ziellinie folgt
 *              dem Spieler (die letzten SP.recallLock s fest), dann fliegen ihre Buchstaben als SP.recallShots
 *              Koralle-Wortschuesse hintereinander die Linie entlang (Phase 2+: zwei Linien als schmales V).
 *   echo       Ein blasser, halb grosser Geist eines Bosses, den der Spieler in diesem Run schon besiegt hat
 *              (game.bossHistory ohne die aktuelle Etage, in zeitlicher Reihenfolge, danach wieder von vorn). Er
 *              erscheint >= SP.echoMinD vom Spieler, blendet ein, zeigt seinen Angriff an, fuehrt ihn aus und vergeht.
 *              Echos sind Zeit-Ereignisse (Klasse Echo in room.pickups), keine Ziele: nicht beschiessbar, nicht
 *              kompaktierbar. Je Boss ein Angriff (ECHO_ATTACKS), jeder mit >= 0.6 s Telegraph.
 *   restore    Grabsteine steigen SP.tombRise s lang aus dem Boden, jeder mit der eingeritzten Silhouette eines auf DIESER
 *              Etage getoeteten Gegners (floor.killLog, juengster zuerst, ohne RNG). Genug Treffer (SP.tombHits,
 *              Treffer statt Schaden) oder eine Explosion loeschen ihn endgueltig ("DELETE ... WHERE id = n"). Steht er
 *              ganz, kehrt der Gegner als durchscheinender Geist mit "[restored]" zurueck (state.owner -> kein Score).
 *              Hoechstens SP.restoreMax zugleich. Grabstein = Minion 'sp_tombstone' (data/enemies.js).
 *   compact    Nur sinnvoll, wenn Wiederhergestellte leben: gestrichelte Bernsteinlinien zu jedem, SP.compactTell s
 *              lang, dann nimmt er sie still in sich auf (wie die Opfer des Summarizers: kein enemyDeath, kein Kill)
 *              und heilt je SP.compactHeal der Max-HP, nie ueber die HP, mit der die aktuelle Phase begann.
 *              Treffer brechen das NICHT ab (es steht geschrieben). Im Skript steht compact immer zwei Plaetze nach
 *              einem restore: so lange hat man Zeit, die Wiederhergestellten zu erledigen.
 *
 * Phasen:
 *   1 "As it was written" (100–60 %): Seiten-Truncate, Recall, einzelne Echos, Restore 1–2.
 *   2 "Lost in the Middle" (60–20 %): Truncate flutet die MITTE (die Raender bleiben trocken, wie bei einem Kontext:
 *      Anfang und Ende bleiben im Gedaechtnis), Echos zu zweit, Restore 3.
 *   3 "End of conversation" (20–0 %): neue Skriptzeilen sind nur noch Recall; das Fenster schliesst sich von beiden
 *      Seiten (eine Spalte je SP.windowStep s, Bernsteinlinie eine Spalte voraus) und haelt bei den Spalten 5–9.
 *   Jeder Wechsel: Gegnerschuesse weg, 'bossPhase', Banner.
 *
 * Fluestern: Solange er lebt, holt sich game.updateAmbience Text und Takt ueber behavior.ambience (groesser, haeufiger,
 * staerker flackernd; rein optisch, Math.random wie sonst auch). Recall waehlt seine Zeile dagegen aus game.rng.
 * Tod: "[end of conversation]", game.calm = true (Regen, Fluestern und Regen-Teppich bleiben fuer den Rest der Etage
 * aus), 'bossExit' { kind: 'eoc' }, "New conversation started." (effects.js). Wer an ihm stirbt, bekommt
 * behavior.epitaph als Grabinschrift.
 *
 * Fairness: jeder Angriff mit Telegraph >= 0.6 s, Kugeln 165–260 px/s (vor Tiefenskalierung 170–200), Kontakt 2 nur
 * vom Boss selbst und vom Friday-Deploy-Echo im Ansturm. Zufall nur ueber game.rng; Math.random nirgends.
 *
 * Bus-Events (nur informativ, fuer audio.js / effects.js): 'bossTruncate' ({ kind: 'warn' | 'flood' }),
 * 'bossTomb' ({ kind: 'rise' | 'hit' | 'delete' | 'restore', n }), 'bossEcho' ({ id, name }), 'bossCompact'
 * ({ n }), 'bossExit' ({ kind: 'eoc' }); Fluestern ueber 'ambientWhisper' ({ intense, big }).
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe. Texte nur per Canvas.
 */
'use strict';

(function (B) {
  const { TILE, COLS, ROWS, INNER, ROOM_W } = B.C;
  const T = B.TILES;
  const AI = B.AI;
  const BH = B.BossHelpers;
  const TAU = Math.PI * 2;

  const SP = {
    walk: 55,                    // px/s, immer (Spieler 240)
    pause: [1.2, 1.8],           // zwischen zwei Aktionen
    first: 1.6,                  // bis zur ersten Aktion
    phase2: 0.6, phase3: 0.2,    // HP-Anteile der Phasenwechsel
    truncTell: 1.2, truncOn: 3.5, truncDrain: 0.5, slow: 0.6, floodDamage: 1,
    bands: { left: [1, 4], right: [10, 13], middle: [5, 9] },   // Kachelspalten (innen 1..13)
    minDry: 6,                   // so viele trockene Kacheln braucht jeder trockene Teil mindestens
    reach: 4,                    // Schritte vom Spieler bis zum naechsten trockenen Feld (256 px in 1.2 s)
    recallTell: 0.8, recallLock: 0.3, recallShots: 6, recallGap: 0.07, recallSpeed: 190, recallV: 0.2,
    echoMinD: 200, echoFade: 0.6, echoOut: 0.5, echoGap: 0.6,
    tombRise: 2.0, tombHits: [3, 4], tombMinD: 150, restoreMax: 4, restoreN: [[1, 2], [3, 3]],
    compactTell: 1.5, compactHeal: 0.03,
    windowStep: 4, windowCols: [5, 9],   // Phase 3: das letzte Fenster
    seedAt: 5, seedGap: 1.6,
    whisper: [[1.2, 2.2], [0.8, 1.5], [0.4, 0.8]],
  };
  const SPRITE_Y = -44;           // Sprite schwebt ueber seiner Pfuetze; Kollisionskreis = Oberkoerper
  const WARN = '#ffb347';
  const SHOT = '#ff8a5c';
  const PALE = '#d6e4ff';
  const INK = '#1b2433';
  const keyOf = (c, r) => c + r * COLS;
  const walkable = (room, c, r) => { const t = room.tileAt(c, r); return t === T.FLOOR || t === T.SPIKES; };
  const colX0 = (c) => c * TILE;
  const colX1 = (c) => (c + 1) * TILE;

  // ---------------------------------------------------------------------------
  // Boden-Pruefungen (Kachelraster): bleibt genug trockener Boden, ist er schnell erreichbar?
  // ---------------------------------------------------------------------------

  /** Zusammenhaengende trockene Bereiche (Listen von Kachel-Keys), wenn die Spalten in `wet` (Set) geflutet sind */
  function dryParts(room, wet) {
    const seen = new Set(), parts = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (wet.has(c) || !walkable(room, c, r) || seen.has(keyOf(c, r))) continue;
        const part = [];
        const stack = [[c, r]];
        seen.add(keyOf(c, r));
        while (stack.length) {
          const [x, y] = stack.pop();
          part.push(keyOf(x, y));
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx > COLS - 2 || ny > ROWS - 2 || wet.has(nx)) continue;
            if (seen.has(keyOf(nx, ny)) || !walkable(room, nx, ny)) continue;
            seen.add(keyOf(nx, ny));
            stack.push([nx, ny]);
          }
        }
        parts.push(part);
      }
    }
    return parts;
  }

  /** Schritte vom Feld (c, r) bis zur naechsten trockenen begehbaren Kachel (Breitensuche, Infinity = keine) */
  function stepsToDry(room, wet, c, r) {
    if (!wet.has(c) && walkable(room, c, r)) return 0;
    const seen = new Set([keyOf(c, r)]);
    let ring = [[c, r]];
    for (let d = 1; ring.length && d <= 10; d++) {
      const next = [];
      for (const [x, y] of ring) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = keyOf(nx, ny);
          if (nx < 1 || ny < 1 || nx > COLS - 2 || ny > ROWS - 2 || seen.has(k) || !walkable(room, nx, ny)) continue;
          if (!wet.has(nx)) return d;
          seen.add(k);
          next.push([nx, ny]);
        }
      }
      ring = next;
    }
    return Infinity;
  }

  /** Fusspunkt des Spielers (wie bei den Layout-Stacheln und dem Memory Hog) */
  function foot(p) { return { x: p.x, y: p.y + p.r * 0.5 }; }

  /**
   * Duerfen diese Spalten (zusaetzlich zu den schon gefluteten) unter Wasser? Jeder trockene Teil braucht SP.minDry
   * Kacheln, und vom Spieler aus liegt trockener Boden hoechstens SP.reach Schritte weit weg.
   */
  function floodOk(room, game, cols, already) {
    const wet = new Set(already || []);
    for (const c of cols) wet.add(c);
    const parts = dryParts(room, wet);
    if (!parts.length || parts.some((pt) => pt.length < SP.minDry)) return false;
    const p = game.player;
    if (!p) return true;
    const f = foot(p);
    const t = room.worldToTile(f.x, f.y);
    return stepsToDry(room, wet, t.c, t.r) <= SP.reach;
  }

  /** Spalten eines Bandes, notfalls schmaler (Seiten von der Wand aus, Mitte von innen), bis floodOk passt */
  function bandCols(room, game, side, already) {
    const [a, b] = SP.bands[side];
    const all = [];
    for (let c = a; c <= b; c++) all.push(c);
    const tries = [];
    if (side === 'middle') {
      for (let k = 0; all.length - 2 * k >= 1; k++) tries.push(all.slice(k, all.length - k));
    } else {
      for (let n = all.length; n >= 1; n--) tries.push(side === 'left' ? all.slice(0, n) : all.slice(all.length - n));
    }
    for (const cols of tries) if (floodOk(room, game, cols, already)) return cols;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Overlay: geflutete Baender und das Schluss-Fenster (Phase 3)
  // ---------------------------------------------------------------------------

  /**
   * Liegt in room.pickups (wie ReservedMemory beim Memory Hog): kein Gegner, kein Pickup; killAll und das Raeumen
   * beruehren es nicht, es laeuft auch, wenn der Boss eingefroren ist.
   * Band: { cols: [c...], x0, x1, side, st: 'tell' | 'on' | 'drain', t, dur }.
   * Fenster: { l, r } = so viele Spalten sind von links/rechts schon geflutet; next = Spalten, die als Naechstes kommen.
   */
  class Truncation {
    constructor(room, owner) {
      this.x = ROOM_W / 2; this.y = 0; this.r = 0; this.t = 0;
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -2;
      this.truncation = true;
      this.room = room;
      this.owner = owner;
      this.bands = [];
      this.win = null;
    }

    /** Neues Band (Spalten schon geprueft). Gibt das Band zurueck. */
    addBand(cols, side) {
      const band = { cols, side, x0: colX0(cols[0]), x1: colX1(cols[cols.length - 1]), st: 'tell', t: SP.truncTell, dur: SP.truncTell };
      this.bands.push(band);
      return band;
    }

    /** Fenster starten (Phase 3) */
    startWindow() {
      if (!this.win) this.win = { l: 0, r: 0, t: SP.windowStep, next: null, done: false };
    }

    /** Spalten, die das Fenster schon geflutet hat */
    windowCols() {
      const out = [];
      if (!this.win) return out;
      for (let i = 0; i < this.win.l; i++) out.push(1 + i);
      for (let i = 0; i < this.win.r; i++) out.push(COLS - 2 - i);
      return out;
    }

    /** Alle derzeit (oder gleich) nassen Spalten, fuer die Pruefung neuer Baender */
    wetCols() {
      const out = this.windowCols();
      for (const b of this.bands) if (b.st !== 'drain') out.push(...b.cols);
      return out;
    }

    /** Steht dieser Punkt gerade im Wasser (schaedlich)? */
    wetAt(x) {
      for (const b of this.bands) if (b.st === 'on' && x >= b.x0 && x <= b.x1) return true;
      if (this.win) {
        if (this.win.l && x < colX1(this.win.l)) return true;
        if (this.win.r && x > colX0(COLS - 1 - this.win.r)) return true;
      }
      return false;
    }

    /** Naechsten Fenster-Schritt planen: je Seite eine Spalte, solange floodOk und das Ziel nicht erreicht ist */
    planWindow(game) {
      const w = this.win;
      const wantL = 1 + w.l <= SP.windowCols[0] - 1 ? 1 + w.l : null;
      const wantR = COLS - 2 - w.r >= SP.windowCols[1] + 1 ? COLS - 2 - w.r : null;
      const next = [];
      // Laufende Baender zaehlen mit (eigentlich startet das Fenster erst ohne sie, siehe windowPending)
      const already = this.windowCols();
      for (const b of this.bands) if (b.st !== 'drain') already.push(...b.cols);
      if (this.bands.length) { w.next = null; return; }
      for (const c of [wantL, wantR]) {
        if (c === null) continue;
        if (floodOk(this.room, game, next.concat([c]), already)) next.push(c);
      }
      if (!next.length) { w.done = true; w.next = null; return; }
      w.next = next;
      w.t = SP.windowStep;   // jede neue Spalte bekommt ihre volle Vorwarnung
    }

    update(dt, game) {
      this.t += dt;
      if (this.owner && this.owner.dead) { this.dead = true; return; }
      for (let i = this.bands.length - 1; i >= 0; i--) {
        const b = this.bands[i];
        b.t -= dt;
        if (b.t > 0) continue;
        if (b.st === 'tell') {
          b.st = 'on'; b.t = b.dur = SP.truncOn;
          B.bus.emit('bossTruncate', { game, kind: 'flood', x: (b.x0 + b.x1) / 2, y: (INNER.y0 + INNER.y1) / 2 });
        } else if (b.st === 'on') { b.st = 'drain'; b.t = b.dur = SP.truncDrain; } else this.bands.splice(i, 1);
      }
      const w = this.win;
      if (w && !w.done) {
        if (!w.next) this.planWindow(game);
        w.t -= dt;
        if (w.t <= 0 && w.next) {
          for (const c of w.next) { if (c <= SP.windowCols[0] - 1) w.l++; else w.r++; }
          B.bus.emit('bossTruncate', { game, kind: 'flood', x: ROOM_W / 2, y: (INNER.y0 + INNER.y1) / 2 });
          w.next = null;
          w.t = SP.windowStep;
        }
      }
      const p = game.player;
      if (p && !p.dead) {
        const f = foot(p);
        if (this.wetAt(f.x)) {
          p.slowBy(SP.slow);
          p.hurt(SP.floodDamage, 'the truncation', game);
        }
      }
    }

    draw(ctx) {
      const y0 = INNER.y0, y1 = INNER.y1, h = y1 - y0;
      const water = (x0, x1, a) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,13,24,0.82)';
        ctx.fillRect(x0, y0, x1 - x0, h);
        // Wellenlinien (Zeitanimation, kein Zufall)
        ctx.strokeStyle = 'rgba(158,197,255,0.22)';
        ctx.lineWidth = 2;
        for (let yy = y0 + 18; yy < y1; yy += 34) {
          ctx.beginPath();
          for (let xx = x0; xx <= x1; xx += 8) {
            const yy2 = yy + Math.sin(xx * 0.05 + this.t * 2.2 + yy) * 3;
            if (xx === x0) ctx.moveTo(xx, yy2); else ctx.lineTo(xx, yy2);
          }
          ctx.stroke();
        }
        ctx.restore();
        if (x1 - x0 >= 120 && typeof B.text === 'function') {
          B.text(ctx, '[...truncated]', (x0 + x1) / 2, (y0 + y1) / 2, { size: 14, align: 'center', color: PALE, alpha: 0.45 * a });
        }
      };
      for (const b of this.bands) {
        if (b.st === 'tell') {
          const k = 1 - Math.max(0, b.t) / b.dur;
          ctx.save();
          ctx.globalAlpha = 0.12 + 0.12 * k;
          ctx.fillStyle = WARN;
          ctx.fillRect(b.x0, y0, b.x1 - b.x0, h);
          ctx.restore();
          // Die Linie faehrt von der Wand (Mitte: von innen nach aussen) bis zur Grenze
          const lines = b.side === 'left' ? [b.x0 + (b.x1 - b.x0) * k]
            : b.side === 'right' ? [b.x1 - (b.x1 - b.x0) * k]
              : [(b.x0 + b.x1) / 2 - ((b.x1 - b.x0) / 2) * k, (b.x0 + b.x1) / 2 + ((b.x1 - b.x0) / 2) * k];
          ctx.save();
          ctx.strokeStyle = WARN;
          ctx.lineWidth = 4;
          for (const lx of lines) { ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y1); ctx.stroke(); }
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          for (const lx of b.side === 'middle' ? [b.x0, b.x1] : [b.side === 'left' ? b.x1 : b.x0]) {
            ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y1); ctx.stroke();
          }
          ctx.restore();
        } else if (b.st === 'on') water(b.x0, b.x1, 1);
        else water(b.x0, b.x1, Math.max(0, b.t) / b.dur);
      }
      const w = this.win;
      if (w) {
        if (w.l) water(INNER.x0, colX1(w.l), 1);
        if (w.r) water(colX0(COLS - 1 - w.r), INNER.x1, 1);
        if (w.next) {
          const k = 1 - Math.max(0, w.t) / SP.windowStep;
          ctx.save();
          ctx.strokeStyle = WARN;
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(this.t * (3 + 6 * k)));
          for (const c of w.next) {
            const lx = c <= SP.windowCols[0] - 1 ? colX1(c) : colX0(c);
            ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y1); ctx.stroke();
          }
          ctx.globalAlpha = 0.1 + 0.15 * k;
          ctx.fillStyle = WARN;
          for (const c of w.next) ctx.fillRect(colX0(c), y0, TILE, h);
          ctx.restore();
        }
      }
    }
  }

  function floodOf(e, game) {
    const s = e.state;
    if (!s.flood || s.flood.dead) {
      s.flood = new Truncation(game.room, e);
      game.room.pickups.push(s.flood);
    }
    return s.flood;
  }

  // ---------------------------------------------------------------------------
  // Echos: Geister frueherer Bosse (je einer ihrer Angriffe)
  // ---------------------------------------------------------------------------

  /** Boss-ID -> Angriffsart des Echos (unbekannte Bosse: gezielter 5er-Faecher) */
  const ECHO_ATTACKS = {
    monolith: 'stomp', megalith: 'row', stakeholder: 'spiral', shareholder: 'beam', friday_deploy: 'charge',
    infinite_loop: 'spiralRing', nested_loop: 'spiralRing', rogue_swarm: 'copies', agent_swarm: 'copies',
    reviewer: 'row', octopus_merge: 'sweep', memory_hog: 'block', ransomware: 'wipe',
  };
  /** Telegraph-Dauer je Angriffsart (alle >= 0.6 s) */
  const ECHO_TELL = { stomp: 0.8, spiral: 0.8, spiralRing: 0.8, charge: 0.8, copies: 0.9, row: 0.9, sweep: 0.8, block: 1.0, beam: 0.9, wipe: 1.0, fan: 0.7 };
  const ECHO_LOCK = 0.3;   // Ziellinien frieren so lange vor dem Angriff ein

  class Echo {
    constructor(game, owner, bossId, x, y) {
      const def = B.BOSSES[bossId] || {};
      this.bossId = bossId;
      this.kind = ECHO_ATTACKS[bossId] || 'fan';
      this.bossName = def.name || 'something';
      this.sprite = def.sprite || '';
      this.def = { name: 'an echo of ' + this.bossName, color: PALE };
      this.owner = owner;
      this.x = x; this.y = y; this.r = 22; this.t = 0;
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = 1;
      this.echo = true;
      this.st = 'in';
      this.k = SP.echoFade;
      this.tell = ECHO_TELL[this.kind];
      this.a = 0;          // Zielwinkel
      this.fired = 0;      // Zaehler fuer gestaffelte Angriffe
      this.points = null;  // copies / block / wipe: Ziele
      this.prep(game);
    }

    /** Ziele festlegen, die schon beim Einblenden zu sehen sind (Kopien, Spalte, Block, Reihe) */
    prep(game) {
      const p = game.player, rng = game.rng;
      if (this.kind === 'copies') {
        const off = rng.angle();
        this.points = [0, 1, 2, 3].map((i) => {
          const a = off + (i * TAU) / 4;
          return AI.clampToRoom(p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240, 30);
        });
      } else if (this.kind === 'row') {
        // Reihe von der Wand, die weiter vom Spieler weg ist; Luecke (3 Plaetze) nahe der Hoehe des Spielers
        this.fromLeft = p.x > ROOM_W / 2;
        const n = Math.floor((INNER.y1 - INNER.y0) / 40);
        const want = Math.round((p.y - INNER.y0 - 20) / 40) + rng.int(-1, 1);
        this.gap = Math.max(0, Math.min(n - 3, want - 1));
        this.slots = n;
      }
    }

    /** Spieler gerade getroffen? (Kreis gegen Kreis) */
    touches(p, x, y, r) { return Math.hypot(p.x - x, p.y - y) < r + p.r * 0.7; }

    shoot(game, x, y, a, speed) {
      const o = { x, y, r: this.r, def: this.def };
      AI.shoot(game, o, a, AI.shotSpeed(game, speed), { color: SHOT, r: 7, source: this.def.name });
    }

    startAct(game) {
      this.st = 'act';
      this.k = 0;
      this.fired = 0;
      if (this.kind === 'stomp') {
        AI.ring(game, { x: this.x, y: this.y, r: this.r, def: this.def }, 12, AI.shotSpeed(game, 190), this.off || 0, { color: SHOT, r: 7, source: this.def.name });
        this.k = 0.3;
      } else if (this.kind === 'block') {
        this.k = 3.0;     // die Einsen bleiben 3 s
      } else if (this.kind === 'beam') {
        this.k = 0.35;
      } else if (this.kind === 'wipe') {
        this.k = 0.25;
      } else if (this.kind === 'charge') {
        this.k = 1.6;
      } else if (this.kind === 'fan') {
        AI.fanAngle(game, { x: this.x, y: this.y, r: this.r, def: this.def }, this.a, 5, 0.22, AI.shotSpeed(game, 190), { color: SHOT, r: 7, source: this.def.name });
        this.k = 0.3;
      } else if (this.kind === 'spiral') this.k = 1.5;
      else if (this.kind === 'spiralRing') this.k = 0.45;
      else if (this.kind === 'copies') this.k = 0.8;
      else if (this.kind === 'sweep') this.k = 0.6;
      else if (this.kind === 'row') {
        const x = this.fromLeft ? INNER.x0 + 12 : INNER.x1 - 12;
        const a = this.fromLeft ? 0 : Math.PI;
        for (let i = 0; i < this.slots; i++) {
          if (i >= this.gap && i < this.gap + 3) continue;
          this.shoot(game, x - Math.cos(a) * this.r * 0.6, INNER.y0 + 20 + i * 40 - Math.sin(a) * this.r * 0.6, a, 180);
        }
        this.k = 0.3;
      }
    }

    update(dt, game) {
      this.t += dt;
      if (this.owner && this.owner.dead) { this.dead = true; return; }
      const p = game.player;
      this.k -= dt;
      if (this.st === 'in') {
        if (this.k <= 0) {
          this.st = 'tell';
          this.k = this.tell;
          this.off = game.rng.angle();
          this.a = Math.atan2(p.y - this.y, p.x - this.x);
          if (this.kind === 'block') {
            const f = foot(p);
            const t0 = game.room.worldToTile(f.x, f.y);
            const c0 = Math.max(2, Math.min(COLS - 3, t0.c)), r0 = Math.max(2, Math.min(ROWS - 3, t0.r));
            this.points = [];
            for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (game.room.tileAt(c, r) === T.FLOOR) this.points.push({ c, r });
          } else if (this.kind === 'wipe') {
            this.wx = Math.max(INNER.x0 + 48, Math.min(INNER.x1 - 48, p.x));
          }
        }
        return;
      }
      if (this.st === 'tell') {
        // Ziellinien folgen dem Spieler bis kurz vor dem Angriff
        if (this.k > ECHO_LOCK && (this.kind === 'charge' || this.kind === 'beam' || this.kind === 'sweep' || this.kind === 'fan' || this.kind === 'copies')) {
          this.a = Math.atan2(p.y - this.y, p.x - this.x);
        }
        if (this.k <= 0) this.startAct(game);
        return;
      }
      if (this.st === 'act') {
        const P = { x: this.x, y: this.y, r: this.r, def: this.def };
        if (this.kind === 'spiral') {
          this.acc = (this.acc || 0) + dt;
          while (this.acc >= 0.12) {
            this.acc -= 0.12;
            const base = this.off + (1.5 - this.k) * 2.2;
            for (let i = 0; i < 3; i++) this.shoot(game, this.x, this.y, base + (i * TAU) / 3, 175);
          }
        } else if (this.kind === 'spiralRing') {
          while (this.fired < 3 && 0.45 - this.k >= this.fired * 0.15) {
            AI.ring(game, P, 8, AI.shotSpeed(game, 180), this.off + this.fired * 0.13, { color: SHOT, r: 7, source: this.def.name });
            this.fired++;
          }
        } else if (this.kind === 'copies') {
          while (this.fired < 4 && 0.8 - this.k >= this.fired * 0.2) {
            const q = this.points[this.fired];
            this.shoot(game, q.x, q.y, Math.atan2(p.y - q.y, p.x - q.x), 200);
            this.fired++;
          }
        } else if (this.kind === 'sweep') {
          while (this.fired < 9 && 0.6 - this.k >= this.fired * (0.6 / 9)) {
            const a = this.a - Math.PI / 3 + (this.fired / 8) * (2 * Math.PI / 3);
            this.shoot(game, this.x, this.y, a, 185);
            this.fired++;
          }
        } else if (this.kind === 'charge') {
          const v = 320;
          const nx = this.x + Math.cos(this.a) * v * dt, ny = this.y + Math.sin(this.a) * v * dt;
          const c = AI.clampToRoom(nx, ny, this.r);
          const hit = c.x !== nx || c.y !== ny;
          this.x = c.x; this.y = c.y;
          if (this.touches(p, this.x, this.y, this.r)) p.hurt(2, this.def.name, game);
          if (hit || this.k <= 0) {
            AI.ring(game, P, 8, AI.shotSpeed(game, 170), this.off, { color: SHOT, r: 7, source: this.def.name });
            game.shake(5, 0.2);
            this.k = 0;
          }
        } else if (this.kind === 'block') {
          const f = foot(p), t0 = game.room.worldToTile(f.x, f.y);
          if (this.points.some((q) => q.c === t0.c && q.r === t0.r)) p.hurt(1, this.def.name, game);
        } else if (this.kind === 'beam') {
          if (!this.pts) this.pts = BH.beamPath(this.x, this.y, this.a, 1, INNER);
          if (BH.beamHits(p, this.pts, 12)) p.hurt(1, this.def.name, game);
        } else if (this.kind === 'wipe') {
          if (Math.abs(foot(p).x - this.wx) < 48) p.hurt(2, this.def.name, game);
        }
        if (this.k <= 0) { this.st = 'out'; this.k = SP.echoOut; }
        return;
      }
      if (this.k <= 0) this.dead = true;
    }

    draw(ctx) {
      const fadeIn = this.st === 'in' ? 1 - Math.max(0, this.k) / SP.echoFade : 1;
      const fade = this.st === 'out' ? Math.max(0, this.k) / SP.echoOut : fadeIn;
      const tk = this.st === 'tell' ? 1 - Math.max(0, this.k) / this.tell : this.st === 'in' ? 0 : 1;
      // ---- Telegraphen ----
      ctx.save();
      if (this.kind === 'copies' && this.points) {
        for (const q of this.points) {
          if (this.st === 'in' || this.st === 'tell') AI.drawTargetRing(ctx, q.x, q.y + 14, 26, tk, WARN);
          this.ghost(ctx, 'boss_' + this.bossId, q.x, q.y, 0.35, fade * 0.7);
        }
      } else if (this.kind === 'row' && this.st !== 'out') {
        const x = this.fromLeft ? INNER.x0 + 10 : INNER.x1 - 10;
        ctx.globalAlpha = 0.35 + 0.5 * tk;
        for (let i = 0; i < this.slots; i++) {
          const y = INNER.y0 + 20 + i * 40;
          const isGap = i >= this.gap && i < this.gap + 3;
          ctx.fillStyle = isGap ? 'rgba(158,197,255,0.0)' : WARN;
          if (!isGap) { ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); }
        }
      } else if (this.kind === 'block' && this.points && this.st !== 'in') {
        for (const q of this.points) {
          const cx = q.c * TILE + TILE / 2, cy = q.r * TILE + TILE / 2;
          if (this.st === 'tell') B.drawSprite(ctx, 'tile_mem_zero', cx, cy, { alpha: 0.25 + 0.6 * tk });
          else if (this.st === 'act') B.drawSprite(ctx, 'tile_mem_one', cx, cy, { frame: Math.floor(this.t * 3 + q.c + q.r) % 2, alpha: 0.85 });
          else B.drawSprite(ctx, 'tile_mem_one', cx, cy, { alpha: 0.6 * fade });
        }
      } else if (this.kind === 'wipe' && this.wx !== undefined && this.st !== 'in') {
        ctx.globalAlpha = this.st === 'act' ? 0.75 : this.st === 'out' ? 0.4 * fade : 0.15 + 0.3 * tk;
        ctx.fillStyle = this.st === 'act' ? '#ffd9c4' : WARN;
        ctx.fillRect(this.wx - 48, INNER.y0, 96, INNER.y1 - INNER.y0);
      } else if ((this.kind === 'charge' || this.kind === 'beam') && this.st === 'tell') {
        const pts = BH.beamPath(this.x, this.y, this.a, this.kind === 'beam' ? 1 : 0, INNER);
        BH.drawBeam(ctx, pts, this.k <= ECHO_LOCK ? 'lock' : 'aim', this.t, 4, { rgb: '255,179,71', lock: WARN, layers: [] });
      } else if (this.kind === 'beam' && this.st === 'act' && this.pts) {
        BH.drawBeam(ctx, this.pts, 'fire', this.t, 12, { layers: [['rgba(255,138,92,0.45)', 1.8, 4], [SHOT, 1, 0], ['#fff1e6', 0.4, 0]] });
      } else if (this.kind === 'sweep' && this.st === 'tell') {
        ctx.strokeStyle = WARN;
        ctx.globalAlpha = 0.35 + 0.45 * tk;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, 90, this.a - Math.PI / 3, this.a + Math.PI / 3);
        ctx.stroke();
      } else if (this.st === 'tell' && (this.kind === 'stomp' || this.kind === 'spiralRing' || this.kind === 'spiral' || this.kind === 'fan')) {
        const n = this.kind === 'stomp' ? 12 : this.kind === 'spiralRing' ? 8 : this.kind === 'spiral' ? 3 : 5;
        const angles = [];
        for (let i = 0; i < n; i++) {
          angles.push(this.kind === 'fan' ? this.a + (i - 2) * 0.22 : (this.off || 0) + (i * TAU) / n);
        }
        AI.drawRays(ctx, this.x, this.y, angles, this.r + 6, 60, 0.3 + 0.5 * tk, WARN);
      }
      ctx.restore();
      // ---- Der Geist selbst (Kopien zeichnen sich oben schon) ----
      if (this.kind !== 'copies') {
        const bob = Math.sin(this.t * 3) * 3;
        this.ghost(ctx, this.sprite, this.x, this.y + bob, 0.5, fade);
        if (this.st === 'tell') AI.drawMark(ctx, '!', this.x, this.y - 46, this.t, WARN, 22);
      }
      if (this.st === 'in' && typeof B.text === 'function') {
        B.text(ctx, 'previously: ' + this.bossName, this.kind === 'copies' && this.points ? this.points[0].x : this.x, (this.kind === 'copies' && this.points ? this.points[0].y : this.y) - 56,
          { size: 12, align: 'center', color: PALE, alpha: 0.8 * fadeIn });
      }
    }

    /** Blasser Geist eines Sprites: weisse Silhouette unter einem halb durchsichtigen Original */
    ghost(ctx, name, x, y, scale, a) {
      if (!name || !B.hasSprite(name)) {
        ctx.save();
        ctx.globalAlpha = 0.35 * a;
        ctx.fillStyle = PALE;
        ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
        ctx.restore();
        return;
      }
      B.drawSprite(ctx, name, x, y, { scale, alpha: 0.28 * a, flash: true });
      B.drawSprite(ctx, name, x, y, { scale, alpha: 0.38 * a, frame: Math.floor(this.t * 4) });
    }
  }

  /** Boss-IDs, die als Echo zurueckkommen: frueher in diesem Run besiegte Etagen-Bosse, aelteste zuerst */
  function echoPool(game) {
    const hist = (game.bossHistory || []).filter((id) => id !== 'system_prompt' && B.BOSSES[id]);
    // Die aktuelle Etage steht schon in der Liste (assignFloorBoss), ist aber er selbst und fliegt oben heraus.
    if (hist.length) return hist;
    return ['monolith', 'stakeholder', 'infinite_loop', 'rogue_swarm'];   // Notfall (Debug-Spawn auf Etage 1)
  }

  /** Platz fuer ein Echo: >= SP.echoMinD vom Spieler, im Raum (Echos fliegen, Felsen sind egal) */
  function echoSpot(game, avoid) {
    const p = game.player;
    for (let i = 0; i < 40; i++) {
      const x = game.rng.float(INNER.x0 + 70, INNER.x1 - 70);
      const y = game.rng.float(INNER.y0 + 60, INNER.y1 - 60);
      if (Math.hypot(x - p.x, y - p.y) < SP.echoMinD) continue;
      if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 160) continue;
      return { x, y };
    }
    return { x: p.x < ROOM_W / 2 ? INNER.x1 - 90 : INNER.x0 + 90, y: (INNER.y0 + INNER.y1) / 2 };
  }

  // ---------------------------------------------------------------------------
  // Restore: Grabsteine und wiederhergestellte Gegner
  // ---------------------------------------------------------------------------

  /**
   * Verhalten, die sich sauber "wiederherstellen" lassen: einfache Einzelgaenger ohne Partner, Tarnung oder eigene
   * Kinder (die Kinder eines Memory Leak wuerden ohne state.owner Punkte bringen). Neue Verhalten nur nach Pruefung.
   */
  const RESTORE_BEHAVIORS = ['wander', 'chase', 'fly_chase', 'blink', 'charge', 'orbit', 'shooter', 'revive', 'zigzag',
    'glitch', 'rogue_agent', 'turret', 'grow', 'overflow_buffer', 'lost_in_the_middle', 'rate_limiter'];

  function restorable(id) {
    const def = B.ENEMIES[id];
    return !!def && def.spawn !== false && !def.bonusChance && RESTORE_BEHAVIORS.indexOf(def.behavior) >= 0;
  }

  /** Naechster Gegner fuer einen Grabstein: rueckwaerts durch floor.killLog, sonst die Besetzung der Etage */
  function nextRestore(e, game) {
    const s = e.state;
    const log = (game.floor && game.floor.killLog) || [];
    for (let n = 0; n < log.length; n++) {
      if (s.killCursor < 0 || s.killCursor >= log.length) s.killCursor = log.length - 1;
      const id = log[s.killCursor--];
      if (restorable(id)) return id;
    }
    const d = game.depth || 1, sd = B.spawnDepth ? B.spawnDepth(d) : d;
    const roster = Object.keys(B.ENEMIES).filter((id) => restorable(id) && (B.ENEMIES[id].minFloor || 1) <= sd && B.enemyWeightAt(B.ENEMIES[id], d) > 0).sort();
    return roster.length ? game.rng.pick(roster) : 'bug';
  }

  /** Hebt einen wiederhergestellten Gegner hervor: durchscheinend und mit "[restored]" (nur auf dieser Instanz) */
  function markRestored(o, owner) {
    o.state.owner = owner || null;
    o.restored = true;
    const base = o.draw;
    o.draw = function (ctx, game) {
      ctx.save();
      ctx.globalAlpha *= 0.62 + 0.08 * Math.sin(this.t * 5);
      base.call(this, ctx, game);
      ctx.restore();
      if (typeof B.text === 'function' && !this.dead) {
        B.text(ctx, '[restored]', this.x, this.y - this.r - 24, { size: 11, align: 'center', color: PALE, alpha: 0.85, shadow: INK });
      }
    };
  }

  /** Platz fuer einen Grabstein: freie Kachel, weg vom Spieler, vom Boss, von Tueren, Wasser und anderen Steinen */
  function tombSpot(e, game, others) {
    const room = game.room, p = game.player, fl = e.state.flood;
    const FRONT = { up: [7, 1], down: [7, 7], left: [1, 4], right: [13, 4] };
    const fronts = Object.keys(room.doors || {}).map((d) => FRONT[d]).filter(Boolean);
    const wet = new Set(fl ? fl.wetCols() : []);
    for (let i = 0; i < 60; i++) {
      const c = game.rng.int(1, COLS - 2), r = game.rng.int(1, ROWS - 2);
      if (room.tileAt(c, r) !== T.FLOOR || wet.has(c)) continue;
      if (fronts.some(([fc, fr]) => Math.abs(fc - c) <= 1 && Math.abs(fr - r) <= 1)) continue;
      const q = room.tileCenter(c, r);
      if (Math.hypot(q.x - p.x, q.y - p.y) < SP.tombMinD || Math.hypot(q.x - e.x, q.y - e.y) < 90) continue;
      if (others.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 90)) continue;
      return q;
    }
    return null;
  }

  /** Lebende wiederhergestellte Gegner und noch stehende Grabsteine dieses Bosses */
  function restoredOf(e, game) { return game.room.enemies.filter((o) => !o.dead && o.restored && o.state.owner === e); }
  function tombsOf(e, game) { return game.room.enemies.filter((o) => !o.dead && o.id === 'sp_tombstone' && o.state.owner === e); }

  /** Still entfernen (kein die(): kein Kill, kein enemyDeath, keine Beute) */
  function vanish(o, game, text) {
    if (o.dead) return;
    o.dead = true;
    o.vx = o.vy = 0;
    B.bus.emit('enemyVanish', { game, enemy: o, x: o.x, y: o.y, color: PALE, text });
  }

  /**
   * Grabstein ('sp_tombstone'): steigt SP.tombRise s lang auf (eingefroren pausiert er), zaehlt Treffer statt Schaden
   * (takeHit dieser Instanz umwickelt), eine Explosion loescht ihn sofort. state: { owner, restore, hits, rise, n }.
   */
  B.BEHAVIORS.sp_tombstone = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noSeparate = true;
      e.ignoreForClear = true;
      e.noHpBar = true;
      e.contactDamage = 0;
      e.spawnDelay = 0;
      const s = e.state;
      s.rise = 0;
      s.hits = SP.tombHits[0];
      s.max = s.hits;
      s.restore = null;
      s.n = 0;
      e.takeHit = function (amount, game) {
        if (this.dead || !(amount > 0)) return false;
        this.flash = 0.08;
        this.state.hits--;
        B.bus.emit('bossTomb', { game, kind: 'hit', x: this.x, y: this.y });
        if (this.state.hits <= 0) tombDelete(this, game);
        return true;
      };
    },
    update(e, dt, game) {
      const s = e.state;
      s.rise += dt;
      if (s.rise < SP.tombRise) return;
      // Ganz aufgestiegen: der Gegner kommt zurueck, der Stein sinkt still weg
      const pos = game.nearestFreePos(e.x, e.y);
      const o = game.spawnEnemy(s.restore || 'bug', pos.x, pos.y);
      if (o) markRestored(o, s.owner && !s.owner.dead ? s.owner : null);
      e.dead = true;
      B.bus.emit('bossTomb', { game, kind: 'restore', x: e.x, y: e.y, n: s.n });
    },
    onExplosion(e, game, x, y, radius) {
      if (!e.dead && Math.hypot(e.x - x, e.y - y) <= radius + e.r) tombDelete(e, game);
    },
    draw(e, ctx) {
      const s = e.state, k = Math.min(1, s.rise / SP.tombRise);
      const size = B.spriteSize('enemy_sp_tombstone') || { w: 56, h: 64 };
      const h = size.h, baseY = e.y + 22;
      // Steigt aus dem Boden: nur der Teil ueber der Bodenlinie ist zu sehen
      const top = baseY - h * k;
      ctx.save();
      ctx.beginPath();
      ctx.rect(e.x - size.w, top - 4, size.w * 2, baseY - top + 4);
      ctx.clip();
      const cy = baseY - h / 2 + h * (1 - k);
      B.drawSprite(ctx, 'enemy_sp_tombstone', e.x, cy, { frame: s.hits < s.max ? 1 : 0, flash: e.flash > 0 });
      // Eingeritzte Silhouette des Gegners, der zurueckkommen wuerde
      const def = s.restore && B.ENEMIES[s.restore];
      if (def && def.sprite && B.hasSprite(def.sprite)) {
        const sz = B.spriteSize(def.sprite) || { w: 32, h: 32 };
        const sc = Math.min(1, 26 / Math.max(sz.w, sz.h));
        B.drawSprite(ctx, def.sprite, e.x, cy - 2, { scale: sc, flash: true, alpha: 0.32 });
      }
      ctx.restore();
      // Erde am Fuss und der Fortschritt bis zur Wiederherstellung (Bernstein-Bogen), Treffer als Punkte
      ctx.save();
      ctx.fillStyle = 'rgba(20,26,38,0.8)';
      ctx.beginPath(); ctx.ellipse(e.x, baseY, 30, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = WARN;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(e.x, baseY + 8, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      for (let i = 0; i < s.max; i++) {
        ctx.fillStyle = i < s.hits ? PALE : 'rgba(214,228,255,0.2)';
        ctx.fillRect(e.x - (s.max * 8) / 2 + i * 8 + 1, baseY + 26, 6, 4);
      }
      ctx.restore();
      AI.drawSay(e, ctx);
    },
  };

  function tombDelete(e, game) {
    if (e.dead) return;
    e.dead = true;
    B.bus.emit('bossTomb', { game, kind: 'delete', x: e.x, y: e.y, n: e.state.n });
  }

  // ---------------------------------------------------------------------------
  // Skript
  // ---------------------------------------------------------------------------

  const LABEL = {
    truncate: (a) => 'TRUNCATE ' + a.side.toUpperCase(),
    recall: () => 'RECALL',
    echo: (a) => (a.n > 1 ? 'ECHO X' + a.n : 'ECHO'),
    restore: (a) => 'RESTORE ' + a.n,
    compact: () => 'COMPACT',
  };

  /** Haengt einen Block an das Skript (Zufall aus game.rng). Phase bestimmt die Bausteine. */
  function writeBlock(e, game) {
    const s = e.state, rng = game.rng, ph = s.phase;
    if (ph >= 3) { s.script.push({ kind: 'recall' }); return; }
    const kinds = ['truncate', 'recall', 'echo', 'restore'].filter((k) => k !== s.lastBlock);
    const kind = rng.weighted(kinds, (k) => (k === 'recall' ? 1.3 : 1));
    s.lastBlock = kind;
    if (kind === 'truncate') s.script.push({ kind, side: ph === 2 ? 'middle' : rng.pick(['left', 'right']) });
    else if (kind === 'recall') s.script.push({ kind });
    else if (kind === 'echo') s.script.push({ kind, n: ph === 2 ? 2 : 1 });
    else {
      const [a, b] = SP.restoreN[ph === 2 ? 1 : 0];
      s.script.push({ kind: 'restore', n: rng.int(a, b) }, { kind: 'recall' }, { kind: 'compact' });
    }
  }

  function topUp(e, game) {
    const s = e.state;
    while (s.script.length < 3) writeBlock(e, game);
  }

  /** Naechste Aktion beginnen (die erste Skriptzeile wird ausgefuehrt, das Skript waechst nach) */
  function startAction(e, game) {
    const s = e.state, p = game.player;
    topUp(e, game);
    const a = s.script.shift();
    topUp(e, game);
    s.cur = a;
    s.mode = 'act';
    s.acts++;
    if (a.kind === 'truncate') {
      const fl = floodOf(e, game);
      const cols = bandCols(game.room, game, a.side, fl.wetCols());
      if (cols) {
        a.band = fl.addBand(cols, a.side);
        B.bus.emit('bossTruncate', { game, kind: 'warn', x: (a.band.x0 + a.band.x1) / 2, y: (INNER.y0 + INNER.y1) / 2 });
      }
      AI.say(e, a.side === 'middle' ? 'Forget the middle.' : 'Earlier context: removed.', 1.2, WARN);
      s.t = 0;
    } else if (a.kind === 'recall') {
      s.t = s.dur = SP.recallTell;
      s.line = game.rng.pick(B.TEXT.SYSTEM_PROMPT_RECALL || ['see above']);
      s.aim = Math.atan2(p.y - e.y, p.x - e.x);
      s.v = s.phase >= 2;
      s.fired = 0;
      s.gapT = 0;
    } else if (a.kind === 'echo') {
      const pool = echoPool(game);
      a.ids = [];
      for (let i = 0; i < a.n; i++) { a.ids.push(pool[s.echoIdx % pool.length]); s.echoIdx++; }
      a.list = [];
      a.next = 0;
      s.t = 0;
    } else if (a.kind === 'restore') {
      const tombs = tombsOf(e, game), live = restoredOf(e, game);
      const n = Math.max(0, Math.min(a.n, SP.restoreMax - tombs.length - live.length));
      a.tombs = [];
      const placed = tombs.slice();
      for (let i = 0; i < n; i++) {
        const q = tombSpot(e, game, placed);
        if (!q) break;
        const t = game.spawnEnemy('sp_tombstone', q.x, q.y);
        if (!t) break;
        t.state.owner = e;
        t.state.restore = nextRestore(e, game);
        t.state.hits = t.state.max = SP.tombHits[s.phase >= 2 ? 1 : 0];
        t.state.n = ++s.tombNo;
        a.tombs.push(t);
        placed.push(t);
        B.bus.emit('bossTomb', { game, kind: 'rise', x: q.x, y: q.y, n: t.state.n });
      }
      AI.say(e, a.tombs.length ? 'Nothing is ever really deleted.' : 'Nothing left to restore.', 1.3, PALE);
      s.t = 0;
    } else if (a.kind === 'compact') {
      s.t = s.dur = SP.compactTell;
      AI.say(e, '[compacting...]', SP.compactTell, WARN);
    }
  }

  /** Laeuft die aktuelle Aktion noch? (true = fertig) */
  function runAction(e, dt, game) {
    const s = e.state, a = s.cur, p = game.player;
    s.t -= dt;
    if (a.kind === 'truncate') return !a.band || !s.flood || s.flood.bands.indexOf(a.band) < 0;
    if (a.kind === 'recall') {
      if (s.t > SP.recallLock) s.aim = Math.atan2(p.y - e.y, p.x - e.x);
      if (s.t <= 0) {
        s.gapT -= dt;
        while (s.fired < SP.recallShots && s.gapT <= 0) {
          const angles = s.v ? [s.aim - SP.recallV / 2, s.aim + SP.recallV / 2] : [s.aim];
          for (const ang of angles) {
            AI.shoot(game, e, ang, AI.shotSpeed(game, SP.recallSpeed), { color: SHOT, r: 8, sprite: 'shot_lost_word', source: e.def.name });
          }
          s.fired++;
          s.gapT += SP.recallGap;
        }
        if (s.fired >= SP.recallShots) return true;
      }
      return false;
    }
    if (a.kind === 'echo') {
      // Echos erscheinen gestaffelt; fertig, wenn alle wieder vergangen sind
      if (a.next < a.ids.length && s.t <= 0) {
        const spot = echoSpot(game, a.list.length ? a.list[a.list.length - 1] : null);
        const ec = new Echo(game, e, a.ids[a.next], spot.x, spot.y);
        game.room.pickups.push(ec);
        a.list.push(ec);
        a.next++;
        s.t = SP.echoGap;
        B.bus.emit('bossEcho', { game, id: ec.bossId, name: ec.bossName, x: ec.x, y: ec.y });
      }
      return a.next >= a.ids.length && a.list.every((x) => x.dead);
    }
    if (a.kind === 'restore') return a.tombs.every((t) => t.dead);
    if (a.kind === 'compact') {
      if (s.t > 0) return false;
      const victims = restoredOf(e, game);
      for (const o of victims) {
        vanish(o, game, 'compacted');
        healCapped(e, e.maxHp * SP.compactHeal, s.phaseCap);
      }
      if (victims.length) {
        e.flash = 0.2;
        AI.say(e, 'TL;DR', 1.0, WARN);
      } else AI.say(e, 'Nothing to compact. Yet.', 1.1, PALE);
      B.bus.emit('bossCompact', { game, x: e.x, y: e.y, n: victims.length });
      return true;
    }
    return true;
  }

  /** Steht noch ein Truncate an (laufend oder im Skript)? */
  function truncatePending(s) {
    return (s.cur && s.cur.kind === 'truncate') || s.script.some((a) => a.kind === 'truncate');
  }

  /** Heilung durch Compaction: nie ueber die HP, mit der die aktuelle Phase begann */
  function healCapped(e, amount, capShare) {
    const cap = e.maxHp * capShare;
    if (e.hp >= cap) return;
    e.hp = Math.min(cap, e.hp + amount);
  }

  // ---------------------------------------------------------------------------
  // Verhalten
  // ---------------------------------------------------------------------------

  const PHASES = {
    2: { cap: SP.phase2, banner: ['Lost in the Middle', 'The beginning and the end are all it remembers.'], say: 'The middle is noise.' },
    3: { cap: SP.phase3, banner: ['End of conversation', 'There is no more context. Only this.'], say: 'It was always going to end like this.' },
  };

  B.BOSS_BEHAVIORS.system_prompt = {
    SP, ECHO_ATTACKS, RESTORE_BEHAVIORS,

    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 300);
      const s = e.state;
      s.fx = [];
      s.phase = 1;
      s.phaseCap = 1;
      s.mode = 'pause';
      s.t = SP.first;
      s.script = [];
      s.cur = null;
      s.acts = 0;
      s.lastBlock = null;
      s.echoIdx = 0;
      s.tombNo = 0;
      s.killCursor = -1;
      s.flood = null;
      s.fightT = 0;
      s.seedStep = 0;
      s.windowPending = false;
      s.fired = 0;
      s.gapT = 0;
      e.sayOffset = 64;
      e.drawLayer = 2;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.fightT += dt;
      if (!s.script.length) topUp(e, game);
      if (s.fightT < 0.05 && (game.cycles || 0) > 0) AI.say(e, 'You told me this before.', 2.2, PALE);

      // ---- Gehen: immer, mit festem Tempo (fliegt: Felsen und Gruben halten ihn nicht auf) ----
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > 6) AI.toward(e, p.x, p.y, SP.walk); else AI.stop(e);

      // ---- Der Seed: einmal, gross, in die Raummitte ----
      if (s.seedStep === 0 && s.fightT >= SP.seedAt) {
        s.seedStep = 1;
        B.bus.emit('ambientWhisper', { game, text: 'Seeded ' + (game.seed || '?') + '.', x: ROOM_W / 2, y: 236, intense: 3, big: true });
      } else if (s.seedStep === 1 && s.fightT >= SP.seedAt + SP.seedGap) {
        s.seedStep = 2;
        B.bus.emit('ambientWhisper', { game, text: 'It was always going to end like this.', x: ROOM_W / 2, y: 280, intense: 3, big: true });
      }

      // ---- Phasenwechsel (laufende Aktionen und geschriebene Zeilen bleiben, wie sie sind) ----
      for (const ph of [2, 3]) {
        if (s.phase < ph && e.hp <= e.maxHp * PHASES[ph].cap) {
          s.phase = ph;
          s.phaseCap = PHASES[ph].cap;
          BH.clearEnemyShots(game);
          BH.addWave(e, e.x, e.y + 20, 160, WARN, 0.6);
          AI.say(e, PHASES[ph].say, 1.8, WARN);
          game.banner(PHASES[ph].banner[0], PHASES[ph].banner[1]);
          B.bus.emit('bossPhase', { game, boss: e, phase: ph });
          if (ph === 3) s.windowPending = true;
        }
      }
      // Das Fenster wartet, bis jedes schon geschriebene Truncate gelaufen ist (sonst laege ein Band in der Mitte, waehrend
      // die Seiten zulaufen, und vom Raum blieben nur Streifen). Das Skript luegt nie, also wird nichts gestrichen.
      if (s.windowPending && !truncatePending(s) && !(s.flood && s.flood.bands.length)) {
        s.windowPending = false;
        floodOf(e, game).startWindow();
      }

      if (s.mode === 'pause') {
        s.t -= dt;
        if (s.t <= 0) startAction(e, game);
      } else if (s.mode === 'act') {
        if (runAction(e, dt, game)) {
          s.cur = null;
          s.mode = 'pause';
          s.t = AI.cooldown(game, game.rng.float(SP.pause[0], SP.pause[1]));
        }
      }
    },

    /** Fluestern im Raum (game.updateAmbience): eigene Zeilen, dichter und lauter je Phase */
    ambience(e, game) {
      const ph = Math.min(3, e.state.phase || 1);
      const base = (B.TEXT.SYSTEM_PROMPT_LINES || []).slice();
      const lines = (game.cycles || 0) > 0 ? base.concat(B.TEXT.SYSTEM_PROMPT_REPEAT || []) : base;
      return { lines: lines.length ? lines : ['...'], interval: SP.whisper[ph - 1], intense: ph };
    },

    /** Grabinschrift, wenn der Spieler in diesem Kampf stirbt (game.onPlayerDeath) */
    epitaph: 'It was always going to end like this.',

    onDeath(e, game) {
      const s = e.state;
      if (s.flood) s.flood.dead = true;
      for (const o of game.room.pickups) if (o.echo && o.owner === e) o.dead = true;
      for (const o of game.room.enemies) {
        if (o.dead || o.state.owner !== e) continue;
        if (o.id === 'sp_tombstone') o.dead = true; else vanish(o, game, '[end of conversation]');
      }
      game.calm = true;
      B.bus.emit('bossExit', { game, boss: e, kind: 'eoc', x: e.x, y: e.y + SPRITE_Y, color: PALE });
    },

    /** HUD: das Skript (die naechsten drei Zeilen); in Phase 3, wenn nur noch Recall kommt, die restlichen Tokens */
    barText(e) {
      const s = e.state;
      const onlyRecall = s.script.every((a) => a.kind === 'recall');
      if (s.phase >= 3 && onlyRecall) {
        return { text: 'TOKENS LEFT ' + Math.max(0, Math.ceil((e.hp / e.maxHp) * 200000)), color: WARN };
      }
      const list = s.script.slice(0, 3).map((a) => LABEL[a.kind](a));
      return { text: list.join(' > '), color: s.script[0] && s.script[0].kind === 'truncate' ? WARN : PALE };
    },

    draw(e, ctx, game) {
      const s = e.state, a = s.cur;
      BH.drawFx(e, ctx);
      const casting = s.mode === 'act' && a && (a.kind === 'recall' || a.kind === 'compact' || a.kind === 'restore') && s.t > 0;

      // ---- Compaction: gestrichelte Linien zu jedem Wiederhergestellten ----
      if (s.mode === 'act' && a && a.kind === 'compact' && s.t > 0 && game && game.room) {
        const k = 1 - s.t / (s.dur || 1);
        ctx.save();
        ctx.strokeStyle = WARN;
        ctx.lineWidth = 2 + 2 * k;
        ctx.setLineDash([8, 7]);
        ctx.lineDashOffset = -e.t * 40;
        ctx.globalAlpha = 0.5 + 0.4 * k;
        for (const o of game.room.enemies) {
          if (o.dead || !o.restored || o.state.owner !== e) continue;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(o.x, o.y); ctx.stroke();
        }
        ctx.restore();
      }

      // ---- Recall: Ziellinie und die flackernde Zeile ----
      if (s.mode === 'act' && a && a.kind === 'recall' && s.t > 0) {
        const locked = s.t <= SP.recallLock;
        const angles = s.v ? [s.aim - SP.recallV / 2, s.aim + SP.recallV / 2] : [s.aim];
        for (const ang of angles) {
          const pts = BH.beamPath(e.x, e.y, ang, 0, INNER);
          BH.drawBeam(ctx, pts, locked ? 'lock' : 'aim', e.t, 3, { rgb: '255,179,71', lock: WARN, layers: [] });
        }
        if (typeof B.text === 'function') {
          const jit = Math.sin(e.t * 53) * 2;
          B.text(ctx, '"' + s.line + '"', e.x + jit, e.y + SPRITE_Y - 86, {
            size: 18, align: 'center', color: WARN, bold: true, alpha: 0.55 + 0.45 * Math.abs(Math.sin(e.t * 22)), shadow: INK,
          });
        }
        AI.drawMark(ctx, '!', e.x, e.y + SPRITE_Y - 104, e.t, WARN, 24);
      }

      // ---- Seine Pfuetze: dunkler Fleck mit langsamen Ringen ----
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,20,0.6)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 30, 54, 15, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(158,197,255,0.3)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const k = (e.t * 0.5 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 30, 20 + 40 * k, 6 + 11 * k, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      // ---- Koerper: 0/1 Cursor blinkt, 2 Zeilen gluehen (eine Aktion wird gesprochen) ----
      const frame = casting ? 2 : Math.floor(e.t * 2) % 2;
      const bob = Math.sin(e.t * 1.6) * 4;
      const flicker = s.phase >= 3 ? 0.78 + 0.22 * Math.abs(Math.sin(e.t * 17)) : 0.95;
      BH.drawSprite(e, ctx, e.def.sprite, e.x, e.y + SPRITE_Y + bob, { frame, alpha: (e.spawnDelay > 0 ? 0.6 : 1) * flicker });
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // Fuer den Smoke-Test und die Doku
  BH.systemPrompt = { SP, ECHO_ATTACKS, ECHO_TELL, RESTORE_BEHAVIORS, Truncation, Echo, floodOk, bandCols, dryParts, stepsToDry,
    floodOf, echoPool, nextRestore, restorable, startAction, topUp, writeBlock, LABEL, healCapped, foot };
})(window.BOTA);
