/*
 * boss-memory-hog.js — The Memory Hog (BOTA.BOSS_BEHAVIORS.memory_hog), Daten in data/bosses.js.
 *
 * Mittlerer Boss (Etage 4–9, Heimat Dependency Hell): ein riesiges, stahlblaues Wildschwein-Igel-Ding, dessen
 * Stacheln 1-Bits sind. Sein Thema ist Flaechenverweigerung: er "reserviert" den Boden, und der Kampf hat einen
 * festen Rhythmus: Der Raum fuellt sich, der Spieler ueberlebt, dann muss der Hog aufraeumen und ist wehrlos.
 *
 *   malloc     Reserviert Bloecke: Kacheln fuellen sich 1 s lang mit schwachen Nullen, dann klappen sie zu 1-Stacheln
 *              um (halbes Herz) und bleiben 8 s. Phase 1: 3 x 3 Kacheln, der erste Block liegt auf dem Spieler; jedes
 *              weitere malloc seit dem letzten GC wird gieriger (2, dann 3 Bloecke).
 *   fault      "Page Fault": senkt den Kopf (Ziellinie folgt dem Spieler, friert ein), rennt dann quer durch den Raum
 *              und hinterlaesst eine Spur reservierter Kacheln. Zerschneidet den Raum, statt nur Flaeche zu nehmen.
 *   dump       "Quill Dump": die Stacheln richten sich auf (Strahlen zeigen die Schussbahnen), dann ein Ring aus
 *              1-Bits mit zwei Luecken. Phase 2: ein zweiter, versetzter Ring.
 *   gc         "Stop-the-World": sobald 40 % des Bodens reserviert sind (oder ein malloc keinen Platz mehr findet,
 *              "Out of memory"), warnt er, dann fegt eine Linie den ganzen Raum frei. Er steht danach 2.6 s still,
 *              beruehrt niemanden mehr und nimmt 50 % mehr Schaden. Das ist das Schadensfenster des Kampfes.
 *   Phase 2 ab 50 %: "Heap fragmentation". Der Raum wird frei gefegt, malloc reserviert statt Bloecken viele einzelne
 *              Kacheln (nie Kante an Kante), Page Fault rennt zweimal, alle Telegraphen etwas kuerzer.
 *
 * Reservierter Speicher (Klasse ReservedMemory):
 *  - Ist ein Boden-Overlay in room.pickups (wie LostZoneMark): Die echten Kacheln aendern sich NIE, also bleibt nichts
 *    haengen und die Wegfindung wird nicht gestoert. Laeuft auch weiter, wenn der Hog eingefroren ist.
 *  - Trifft alles, auch fliegende Spieler: Der Speicher ist belegt, egal wie man hineinkommt. Sonst wuerde ein
 *    Flug-Item seinen Hauptangriff abschalten. Gleicher Fusspunkt wie die Layout-Stacheln (game.js).
 *  - Eine Bombe gibt jeden Block frei, den sie erreicht ("free()"), immer den ganzen Block.
 *
 * Fairness (canTake prueft das vor jeder Reservierung, der Smoke-Test bei jedem Tick):
 *  - Der freie Boden zerfaellt nie in mehr Teile als der Raum von sich aus hat: keine Falle, keine Taschen.
 *  - Vom Spieler aus liegt immer ein freies Feld hoechstens `escape` Kacheln weit weg.
 *  - Nie mehr als `cap` (45 %) des Bodens zugleich, der GC greift schon bei `share` (40 %).
 *  - Kugeln 165–260 px/s (vor Tiefenskalierung 170–185), jeder Angriff hat einen Telegraph von >= 0.6 s.
 * Zufall nur ueber game.rng; die Optik rechnet mit Zeiten, Math.random wird hier nicht benutzt.
 *
 * Bus-Events (nur informativ, fuer audio.js / effects.js): 'bossAlloc' (malloc beginnt), 'bossReserve' (Kacheln
 * klappen um), 'bossFree' (Bombe gibt frei), 'bossGc' ({ kind: 'warn' | 'start' | 'end' }), 'bossExit' ({ kind: 'oom' }).
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const { TILE, COLS, ROWS, INNER } = B.C;
  const T = B.TILES;
  const AI = B.AI;
  const BH = B.BossHelpers;
  const TAU = Math.PI * 2;

  const HOG = {
    share: 0.40,              // ab diesem Bodenanteil muss er aufraeumen
    cap: 0.45,                // harte Obergrenze (mehr reserviert er nie)
    escape: 2,                // Schritte bis zum naechsten freien Feld (128 px = 0.53 s bei Grundtempo)
    tell: [1.0, 0.85],        // Nullen -> Einsen (Phase 1/2)
    life: [8, 7],             // Sekunden, die eine Einser-Kachel bleibt
    fade: 0.25,               // Ausblenden nach dem Freigeben (ungefaehrlich)
    damage: 1,                // halbes Herz
    size: 3,                  // Blockkante in Kacheln
    minNew: 5,                // so viele neue Kacheln muss ein Block mindestens bringen
    blocks: [2, 3],           // Bloecke je malloc (erstes / jedes weitere seit dem letzten GC)
    blockGap: 0.18,
    frags: [16, 20],          // Phase 2: Einzelkacheln je malloc
    idle: [0.7, 0.5],
    walk: [[1.0, 1.5], [0.7, 1.1]],
    faultTell: [0.95, 0.8], faultLock: 0.35, faultSpeed: 340, faultMax: 2.4, faultTired: 0.55, trailTell: 0.5,
    faultChance: 0.6,         // sonst Quill Dump
    quills: 20, gap: 3, dumpTell: [0.85, 0.7], dumpSpeed: [170, 185], dumpGap: 0.4,
    gcWarn: 1.1, gcSweep: 0.7, gcStun: [2.6, 2.2], gcMult: 1.5,
  };
  const HOG_SPRITE_Y = -14;   // Sprite steht auf dem Schatten; Kollisionskreis = Koerper
  const BIT = '#7fe3ff';      // Farbe der 1-Bits (Kugeln, Linien)
  const WARN = '#ffb347';

  const keyOf = (c, r) => c + r * COLS;
  const walkable = (room, c, r) => { const t = room.tileAt(c, r); return t === T.FLOOR || t === T.SPIKES; };

  /** Zahl der zusammenhaengenden freien Bereiche, wenn die Felder in `taken` belegt sind */
  function components(room, taken) {
    const seen = new Set();
    let n = 0;
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const k0 = keyOf(c, r);
        if (seen.has(k0) || taken.has(k0) || !walkable(room, c, r)) continue;
        n++;
        seen.add(k0);
        const stack = [[c, r]];
        while (stack.length) {
          const [x, y] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, k = keyOf(nx, ny);
            if (nx < 1 || ny < 1 || nx > COLS - 2 || ny > ROWS - 2) continue;
            if (seen.has(k) || taken.has(k) || !walkable(room, nx, ny)) continue;
            seen.add(k);
            stack.push([nx, ny]);
          }
        }
      }
    }
    return n;
  }

  /** Schritte vom Feld (c, r) zum naechsten freien Feld (Breitensuche ueber begehbare Kacheln); Infinity = keins */
  function stepsToFree(room, taken, c, r) {
    if (!taken.has(keyOf(c, r))) return 0;
    const seen = new Set([keyOf(c, r)]);
    let ring = [[c, r]];
    for (let d = 1; ring.length && d <= 8; d++) {
      const next = [];
      for (const [x, y] of ring) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = keyOf(nx, ny);
          if (nx < 1 || ny < 1 || nx > COLS - 2 || ny > ROWS - 2 || seen.has(k) || !walkable(room, nx, ny)) continue;
          if (!taken.has(k)) return d;
          seen.add(k);
          next.push([nx, ny]);
        }
      }
      ring = next;
    }
    return Infinity;
  }

  /** Das Feld unter den Fuessen des Spielers (gleicher Punkt wie bei den Layout-Stacheln in game.js) */
  function footTile(room, p) { return room.worldToTile(p.x, p.y + p.r * 0.5); }

  /**
   * Der reservierte Boden. Liegt in room.pickups, weil dort alles mit update/draw laeuft und nach drawLayer unter die
   * Figuren sortiert wird; es ist kein Pickup und kein Gegner (killAll und das Raeumen beruehren es nicht).
   * Zelle: { c, r, x, y, st: 'tell' | 'on' | 'gone', t, dur, group }.
   */
  class ReservedMemory {
    constructor(room) {
      this.x = 0;
      this.y = 0;
      this.r = 0;
      this.t = 0;
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -2;
      this.reservedMemory = true;
      this.owner = null;
      this.cells = new Map();
      this.nextGroup = 1;
      this.room = room;
      this.floor = 0;      // Kacheln, die reserviert werden koennen
      for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (room.tileAt(c, r) === T.FLOOR) this.floor++;
      this.parts = components(room, new Set());
    }

    /** Belegte Felder (Nullen und Einsen; freigegebene blenden nur noch aus) */
    taken() {
      const out = new Set();
      for (const [k, cell] of this.cells) if (cell.st !== 'gone') out.add(k);
      return out;
    }
    share() { return this.floor ? this.taken().size / this.floor : 0; }

    /**
     * Duerfen diese Felder dazukommen? Prueft Obergrenze, Zusammenhang des freien Bodens und den Fluchtweg.
     * tiles = [[c, r], ...]. Wird vor JEDER Reservierung gefragt, auch bei den Spuren von Page Fault.
     */
    canTake(tiles, game) {
      const taken = this.taken();
      for (const [c, r] of tiles) taken.add(keyOf(c, r));
      if (taken.size > this.floor * HOG.cap) return false;
      if (components(this.room, taken) > this.parts) return false;
      const f = footTile(this.room, game.player);
      return stepsToFree(this.room, taken, f.c, f.r) <= HOG.escape;
    }

    /** Felder als eine Gruppe reservieren (eine Bombe gibt immer die ganze Gruppe frei) */
    reserve(tiles, tell, life) {
      const group = this.nextGroup++;
      for (const [c, r] of tiles) {
        const pos = this.room.tileCenter(c, r);
        this.cells.set(keyOf(c, r), { c, r, x: pos.x, y: pos.y, st: 'tell', t: tell, dur: tell, life, group });
      }
      return group;
    }

    release(cell) {
      if (cell.st === 'gone') return;
      cell.st = 'gone';
      cell.t = HOG.fade;
    }
    /** GC-Besen: alles links von x freigeben */
    sweepTo(x) { for (const cell of this.cells.values()) if (cell.x <= x) this.release(cell); }
    freeAll() { for (const cell of this.cells.values()) this.release(cell); }

    /** Explosion: jede Gruppe freigeben, die sie erreicht. Gibt die Zahl der Gruppen zurueck. */
    freeNear(x, y, radius) {
      const hit = new Set();
      for (const cell of this.cells.values()) {
        if (cell.st !== 'gone' && Math.hypot(cell.x - x, cell.y - y) < radius + TILE * 0.25) hit.add(cell.group);
      }
      for (const cell of this.cells.values()) if (hit.has(cell.group)) this.release(cell);
      return hit.size;
    }

    update(dt, game) {
      this.t += dt;
      let flipped = null;
      for (const [k, cell] of this.cells) {
        cell.t -= dt;
        if (cell.t > 0) continue;
        if (cell.st === 'tell') {
          cell.st = 'on';
          cell.t = cell.life;
          cell.dur = cell.life;
          flipped = cell;
        } else if (cell.st === 'on') this.release(cell);
        else this.cells.delete(k);
      }
      if (flipped) B.bus.emit('bossReserve', { game, x: flipped.x, y: flipped.y, color: BIT });
      const p = game.player;
      if (p && !p.dead) {
        const f = footTile(this.room, p);
        const cell = this.cells.get(keyOf(f.c, f.r));
        if (cell && cell.st === 'on') p.hurt(HOG.damage, 'reserved memory', game);
      }
      if (!this.cells.size && (!this.owner || this.owner.dead)) this.dead = true;
    }

    draw(ctx) {
      for (const cell of this.cells.values()) {
        const x = cell.x, y = cell.y;
        if (cell.st === 'tell') {
          const k = 1 - Math.max(0, cell.t) / cell.dur;
          B.drawSprite(ctx, 'tile_mem_zero', x, y, { alpha: 0.25 + 0.6 * k });
        } else if (cell.st === 'on') {
          B.drawSprite(ctx, 'tile_mem_one', x, y, { frame: Math.floor(this.t * 3 + cell.c + cell.r) % 2 });
          // Frisch umgeklappt: kurz weiss, damit man den Moment sieht
          const fresh = 1 - (cell.dur - cell.t) / 0.12;
          if (fresh > 0) {
            ctx.save();
            ctx.globalAlpha = 0.7 * fresh;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - TILE / 2, y - TILE / 2, TILE, TILE);
            ctx.restore();
          }
        } else B.drawSprite(ctx, 'tile_mem_one', x, y, { alpha: 0.7 * Math.max(0, cell.t) / HOG.fade });
      }
    }
  }

  /** Das Overlay des Hogs, beim ersten Tick im tatsaechlichen Raum angelegt */
  function memOf(e, game) {
    const s = e.state;
    if (!s.mem) {
      s.mem = new ReservedMemory(game.room);
      s.mem.owner = e;
      game.room.pickups.push(s.mem);
    }
    return s.mem;
  }

  /**
   * Einen Block suchen: Kandidaten nach Abstand zum Ziel (x, y) sortiert, der erste, den canTake erlaubt.
   * Reserviert nur freien Boden (keine Felsen, Gruben oder Layout-Stacheln). Gibt [[c, r], ...] oder null zurueck.
   */
  function findBlock(mem, game, x, y) {
    const taken = mem.taken();
    const room = game.room, n = HOG.size;
    const cands = [];
    for (let r0 = 1; r0 + n - 1 <= ROWS - 2; r0++) {
      for (let c0 = 1; c0 + n - 1 <= COLS - 2; c0++) {
        const tiles = [];
        for (let r = r0; r < r0 + n; r++) {
          for (let c = c0; c < c0 + n; c++) {
            if (room.tileAt(c, r) === T.FLOOR && !taken.has(keyOf(c, r))) tiles.push([c, r]);
          }
        }
        if (tiles.length < HOG.minNew) continue;
        const mid = room.tileCenter(c0 + 1, r0 + 1);
        cands.push({ tiles, d: Math.hypot(mid.x - x, mid.y - y) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const cand of cands) if (mem.canTake(cand.tiles, game)) return cand.tiles;
    return null;
  }

  /**
   * Phase 2: bis zu n einzelne Kacheln, nie Kante an Kante (man kann immer dazwischen durch). Beginnt mit dem Feld
   * unter dem Spieler. Jede Kachel ist eine eigene Gruppe. Gibt die Zahl der neuen Kacheln zurueck.
   */
  function reserveFragments(mem, game, n, tell, life) {
    const room = game.room;
    const free = [];
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (room.tileAt(c, r) === T.FLOOR) free.push([c, r]);
    game.rng.shuffle(free);
    const f = footTile(room, game.player);
    free.unshift([f.c, f.r]);
    let made = 0;
    for (const [c, r] of free) {
      if (made >= n) break;
      if (room.tileAt(c, r) !== T.FLOOR) continue;
      const taken = mem.taken();
      if (taken.has(keyOf(c, r))) continue;
      if (taken.has(keyOf(c + 1, r)) || taken.has(keyOf(c - 1, r)) || taken.has(keyOf(c, r + 1)) || taken.has(keyOf(c, r - 1))) continue;
      if (!mem.canTake([[c, r]], game)) continue;
      mem.reserve([[c, r]], tell, life);
      made++;
    }
    return made;
  }

  /** Winkel eines Rings mit zwei Luecken (je HOG.gap Plaetze, ungefaehr gegenueber) */
  function ringAngles(rng) {
    const n = HOG.quills, g = HOG.gap;
    const a = rng.int(0, n - 1);
    const b = (a + Math.floor(n / 2) + rng.int(-1, 1) + n) % n;
    const off = rng.angle();
    const out = [];
    for (let i = 0; i < n; i++) {
      const da = (i - a + n) % n, db = (i - b + n) % n;
      if (da < g || db < g) continue;
      out.push(off + (i * TAU) / n);
    }
    return out;
  }

  // ---- Ablauf ----

  /** Nach jedem Angriff: Ist der Speicher voll, kommt der GC, sonst kurz Luft holen */
  function hogIdle(e, game) {
    const s = e.state, p2 = s.phase === 2;
    if (s.oom || memOf(e, game).share() >= HOG.share) {
      s.mode = 'gcWarn';
      s.t = HOG.gcWarn;
      AI.stop(e);
      AI.say(e, s.oom ? 'OUT OF MEMORY' : 'HEAP FULL', 1.1, WARN);
      B.bus.emit('bossGc', { game, boss: e, kind: 'warn', x: e.x, y: e.y });
      return;
    }
    s.mode = 'idle';
    s.t = AI.cooldown(game, HOG.idle[p2 ? 1 : 0]);
  }

  /** malloc und ein anderer Angriff wechseln sich ab, damit der Boden sich sicher fuellt */
  function hogAttack(e, game) {
    const s = e.state, p2 = s.phase === 2;
    if (s.last !== 'malloc') {
      s.last = 'malloc';
      s.mode = 'malloc';
      s.left = p2 ? 1 : HOG.blocks[Math.min(s.mallocs, HOG.blocks.length - 1)];
      s.first = true;
      s.t = 0.25;
      s.mallocs++;
      AI.stop(e);
      AI.say(e, 'malloc()', 0.9, BIT);
      B.bus.emit('bossAlloc', { game, boss: e, x: e.x, y: e.y });
      return;
    }
    if (game.rng.chance(HOG.faultChance)) {
      s.last = 'fault';
      s.faults = p2 ? 2 : 1;
      hogAim(e, game);
    } else {
      s.last = 'dump';
      s.mode = 'dump';
      s.dur = s.t = HOG.dumpTell[p2 ? 1 : 0];
      s.rings = p2 ? [ringAngles(game.rng), ringAngles(game.rng)] : [ringAngles(game.rng)];
      AI.stop(e);
      AI.say(e, 'CORE DUMP', 0.8, BIT);
    }
  }

  function hogAim(e, game) {
    const s = e.state, p = game.player;
    s.mode = 'aim';
    s.dur = s.t = HOG.faultTell[s.phase === 2 ? 1 : 0];
    s.aim = Math.atan2(p.y - e.y, p.x - e.x);
    AI.stop(e);
  }

  /** Spur von Page Fault: das Feld unter dem Hog, wenn canTake es erlaubt (sonst bleibt dort eine Luecke) */
  function hogTrail(e, game) {
    const s = e.state, mem = memOf(e, game), room = game.room;
    const f = room.worldToTile(e.x, e.y);
    const k = keyOf(f.c, f.r);
    if (k === s.trailKey) return;
    s.trailKey = k;
    if (room.tileAt(f.c, f.r) !== T.FLOOR || mem.taken().has(k)) return;
    if (mem.canTake([[f.c, f.r]], game)) mem.reserve([[f.c, f.r]], HOG.trailTell, HOG.life[s.phase === 2 ? 1 : 0]);
  }

  function hogStartSweep(e, game) {
    e.state.sweep = INNER.x0;
    game.shake(6, 0.4);
  }

  B.BOSS_BEHAVIORS.memory_hog = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 300);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.0;
      s.fx = [];
      s.last = null;
      s.mallocs = 0;
      s.oom = false;
      s.sweep = null;
      s.mem = null;
      e.sayOffset = 76;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      const mem = memOf(e, game);
      BH.updateFx(e, dt);
      s.t -= dt;

      // ---- Der Besen laeuft unabhaengig vom Modus (GC und Phasenwechsel) ----
      if (s.sweep !== null) {
        s.sweep += ((INNER.x1 - INNER.x0) / HOG.gcSweep) * dt;
        mem.sweepTo(s.sweep);
        if (s.sweep >= INNER.x1) { mem.freeAll(); s.sweep = null; }
      }

      // ---- Phase 2 bei 50 %: "Heap fragmentation" (nicht mitten im Sprint oder GC) ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5 && s.mode !== 'fault' && s.mode !== 'gc' && s.mode !== 'gcWarn') {
        s.phase = 2;
        s.mode = 'phase';
        s.t = 1.3;
        s.oom = false;
        s.mallocs = 0;
        s.last = null;
        AI.stop(e);
        hogStartSweep(e, game);
        AI.say(e, 'DEFRAGMENTING...', 1.4, WARN);
        game.banner('Heap fragmentation', 'Plenty of memory free. None of it in one piece.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      switch (s.mode) {
        case 'idle':
          AI.stop(e);
          if (s.t <= 0) {
            const w = HOG.walk[p2 ? 1 : 0];
            s.mode = 'walk';
            s.t = game.rng.float(w[0], w[1]);
          }
          break;

        case 'walk':
          AI.pathToward(e, game, p.x, p.y, e.speed * (p2 ? 1.3 : 1));
          if (s.t <= 0) hogAttack(e, game);
          break;

        case 'malloc':
          AI.stop(e);
          if (s.t <= 0) {
            const tell = HOG.tell[p2 ? 1 : 0], life = HOG.life[p2 ? 1 : 0];
            if (p2) {
              const want = HOG.frags[Math.min(s.mallocs - 1, HOG.frags.length - 1)];
              if (reserveFragments(mem, game, want, tell, life) < want / 2) s.oom = true;
            } else {
              // Der erste Block zielt auf den Spieler, die anderen irgendwohin
              const tx = s.first ? p.x : game.rng.float(INNER.x0, INNER.x1);
              const ty = s.first ? p.y : game.rng.float(INNER.y0, INNER.y1);
              const tiles = findBlock(mem, game, tx, ty);
              if (tiles) mem.reserve(tiles, tell, life); else s.oom = true;
            }
            s.first = false;
            s.left--;
            s.t = HOG.blockGap;
            if (s.left <= 0 || s.oom) hogIdle(e, game);
          }
          break;

        case 'aim':
          AI.stop(e);
          if (s.t > HOG.faultLock) s.aim = Math.atan2(p.y - e.y, p.x - e.x);
          if (s.t <= 0) {
            s.mode = 'fault';
            s.t = HOG.faultMax;
            s.bumped = false;
            s.trailKey = -1;
            AI.say(e, 'PAGE FAULT', 0.8, WARN);
          }
          break;

        case 'fault':
          e.vx = Math.cos(s.aim) * HOG.faultSpeed;
          e.vy = Math.sin(s.aim) * HOG.faultSpeed;
          hogTrail(e, game);
          if (s.bumped || s.t <= 0) {
            AI.stop(e);
            game.shake(7, 0.25);
            BH.addWave(e, e.x, e.y + e.r * 0.6, e.r * 2.4, BIT, 0.4);
            B.bus.emit('bossStomp', { game, boss: e, x: e.x, y: e.y });
            s.mode = 'tired';
            s.t = HOG.faultTired;
            s.faults--;
          }
          break;

        case 'tired':
          AI.stop(e);
          if (s.t <= 0) { if (s.faults > 0) hogAim(e, game); else hogIdle(e, game); }
          break;

        case 'dump':
          AI.stop(e);
          if (s.t <= 0) {
            const sp = AI.shotSpeed(game, HOG.dumpSpeed[p2 ? 1 : 0]);
            for (const a of s.rings.shift()) AI.shoot(game, e, a, sp, { color: BIT, sprite: 'shot_bit', r: 8 });
            BH.addWave(e, e.x, e.y, e.r * 2, BIT, 0.3);
            if (s.rings.length) s.t = HOG.dumpGap; else { s.mode = 'tired'; s.faults = 0; s.t = 0.4; }
          }
          break;

        case 'gcWarn':
          AI.stop(e);
          if (s.t <= 0) {
            s.mode = 'gc';
            s.t = HOG.gcStun[p2 ? 1 : 0];
            e.contactDamage = 0;
            e.damageTakenMult = HOG.gcMult;
            hogStartSweep(e, game);
            AI.say(e, 'STOP THE WORLD', 1.2, WARN);
            B.bus.emit('bossGc', { game, boss: e, kind: 'start', x: e.x, y: e.y });
          }
          break;

        case 'gc':
          AI.stop(e);
          if (s.t <= 0) {
            e.contactDamage = e.def.contactDamage;
            e.damageTakenMult = 1;
            s.oom = false;
            s.mallocs = 0;
            s.last = null;
            B.bus.emit('bossGc', { game, boss: e, kind: 'end', x: e.x, y: e.y });
            hogIdle(e, game);
          }
          break;

        case 'phase':
        default:
          AI.stop(e);
          if (s.t <= 0) hogIdle(e, game);
          break;
      }
    },

    /** Bomben geben Speicher frei, jeweils den ganzen Block */
    onExplosion(e, game, x, y, radius) {
      const s = e.state;
      if (s.mem && s.mem.freeNear(x, y, radius) > 0) B.bus.emit('bossFree', { game, boss: e, x, y, color: BIT });
    },

    onDeath(e, game) {
      if (e.state.mem) e.state.mem.freeAll();
      B.bus.emit('bossExit', { game, boss: e, kind: 'oom', x: e.x, y: e.y + HOG_SPRITE_Y, color: BIT });
    },

    /** HUD: wie voll der Heap ist (die Schwelle ist die Ansage, wann das Schadensfenster kommt) */
    barText(e) {
      const s = e.state;
      if (s.mode === 'gc') return { text: 'GARBAGE COLLECTION', color: '#9be07a' };
      const pct = s.mem ? Math.round(s.mem.share() * 100) : 0;
      return { text: 'HEAP ' + pct + ' % / ' + Math.round(HOG.share * 100) + ' %', color: pct >= HOG.share * 75 ? WARN : BIT };
    },

    draw(e, ctx) {
      const s = e.state, p2 = s.phase === 2;
      BH.drawFx(e, ctx);

      // ---- Der GC-Besen: eine helle Linie, die durch den Raum faehrt ----
      if (s.sweep !== null) {
        ctx.save();
        ctx.fillStyle = 'rgba(155,224,122,0.16)';
        ctx.fillRect(s.sweep - 60, INNER.y0, 60, INNER.y1 - INNER.y0);
        ctx.fillStyle = '#d9ffc9';
        ctx.fillRect(s.sweep - 3, INNER.y0, 6, INNER.y1 - INNER.y0);
        ctx.restore();
      }

      // ---- Page Fault: Bahn bis zur Wand; friert im letzten Teil ein und blinkt ----
      if (s.mode === 'aim') {
        const pts = BH.beamPath(e.x, e.y, s.aim, 0, INNER);
        const locked = s.t <= HOG.faultLock;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = WARN;
        ctx.lineWidth = e.r * 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        ctx.restore();
        BH.drawBeam(ctx, pts, locked ? 'lock' : 'aim', e.t, 4, { rgb: '255,179,71', lock: WARN, layers: [] });
      }

      // ---- Quill Dump: kurze Strahlen zeigen die Schussbahnen, die Luecken sind sofort zu sehen ----
      if (s.mode === 'dump' && s.rings.length) {
        const k = 1 - Math.max(0, s.t) / (s.dur || 1);
        ctx.save();
        ctx.strokeStyle = BIT;
        ctx.globalAlpha = 0.3 + 0.5 * k;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        for (const a of s.rings[0]) {
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * (e.r + 8), e.y + Math.sin(a) * (e.r + 8));
          ctx.lineTo(e.x + Math.cos(a) * (e.r + 70), e.y + Math.sin(a) * (e.r + 70));
          ctx.stroke();
        }
        ctx.restore();
      }

      // ---- Koerper: 0/1 laufen, 2 Stacheln aufgerichtet, 3 Augen zu (GC) ----
      const name = p2 && B.hasSprite('boss_memory_hog_frag') ? 'boss_memory_hog_frag' : e.def.sprite;
      const up = s.mode === 'dump' || s.mode === 'aim' || s.mode === 'malloc' || s.mode === 'gcWarn';
      const moving = s.mode === 'walk' || s.mode === 'fault';
      const frame = s.mode === 'gc' ? 3 : up ? 2 : (moving ? Math.floor(e.t * (s.mode === 'fault' ? 14 : 5)) % 2 : 0);
      const shake = s.mode === 'gcWarn' || s.mode === 'phase' ? Math.sin(e.t * 60) * 3 : 0;
      BH.drawSprite(e, ctx, name, e.x + shake, e.y + HOG_SPRITE_Y, { frame, alpha: e.spawnDelay > 0 ? 0.6 : 1 });
      if (s.mode === 'aim' || s.mode === 'dump') AI.drawMark(ctx, '!', e.x, e.y + HOG_SPRITE_Y - 74, e.t, WARN, 28);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // Fuer den Smoke-Test
  BH.hog = { HOG, components, stepsToFree, footTile, keyOf, memOf, findBlock, reserveFragments, ringAngles, hogAim, hogIdle };
})(window.BOTA);
