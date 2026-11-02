/*
 * dungeon.js — Etagen-Generierung im Binding-of-Isaac-Stil.
 *
 * Ablauf (deterministisch aus dem Etagen-Seed):
 *  1. 9x9-Raster, Startraum in der Mitte.
 *  2. Zielanzahl Raeume: min(20, floor(3.3 * depth) + 6 + rand(0..2)).
 *  3. Breitensuche mit Zufall: Nachbarzelle wird Raum, wenn leer, hoechstens ein belegter Nachbar
 *     (haelt die Karte baumartig) und ein Muenzwurf zustimmt.
 *  4. Wiederholen, bis Anzahl erreicht und >= 3 Sackgassen existieren.
 *  5. Sackgassen -> Boss (am weitesten entfernt), Schatzraum, Shop.
 *  6. Geheimraum: leere Zelle mit >= 2 Nachbarraeumen, nicht neben dem Boss; Tueren versteckt.
 *  7. Ab Tiefe 2 sind Schatzraum- und Shop-Tueren verschlossen (kosten ein Approval).
 *  8. Ab Tiefe 2 bekommt ein Kampfraum ein garantiertes Approval beim Clearing (assignKeyRoom).
 *  9. Manche Kampfraeume bekommen lose Pickups, die schon beim Betreten herumliegen (assignLooseLoot).
 * 10. Auf ~30 % der Etagen liegt in einem normalen Raum ein README.md, das die Karte aufdeckt (assignReadme).
 * 12. Zerstoerbare Objekte (Kisten, Buesche, ...) je nach Etagen-Thema in normalen Raeumen (assignProps).
 * 11. ~10 % der Kampfraeume hinterlassen beim Clearing ein Rohr (Pipe), das in einen Zufallsraum teleportiert
 *     (assignPipes; Objekt in pickup.js, Sprung in game.pipeWarp).
 */
'use strict';

(function (B) {
  const { MAP_W, MAP_H } = B.C;
  const { COLS, ROWS, TILE } = B.C;
  const TT = B.TILES;
  // Kachel direkt vor jeder Tuer (Innenseite) — dort duerfen keine Objekte stehen
  const DOOR_FRONT = { up: [7, 1], down: [7, ROWS - 2], left: [1, 4], right: [COLS - 2, 4] };
  const README_CHANCE = 0.3; // Anteil der Etagen mit einem README.md (Playtest-Wunsch 2026-10-31)
  const PIPE_CHANCE = 0.1;   // Anteil der Kampfraeume, die beim Clearing ein Rohr hinterlassen (2026-11-01)
  const DIRS = B.DIRS;
  const DIR_KEYS = ['up', 'down', 'left', 'right'];

  class Floor {
    /**
     * @param {number} depth — Tiefe (1 = erste Etage)
     * @param {number|string} seed — Etagen-Seed
     */
    constructor(depth, seed) {
      this.depth = depth;
      this.seed = seed;
      this.rng = new B.RNG(seed);
      this.cells = new Map(); // "x,y" -> cell
      this.start = null;
      this.keyRoom = null; // Zelle mit garantiertem Approval (ab Tiefe 2, siehe assignKeyRoom)
      this.readmeRoom = null; // Zelle mit dem README.md (oder null, siehe assignReadme)
      this.documented = false; // README.md eingesammelt -> Karte (ohne Geheimraum) sichtbar
      this.generate();
    }

    key(x, y) { return x + ',' + y; }
    get(x, y) { return this.cells.get(this.key(x, y)) || null; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }

    /** Anzahl belegter Nachbarzellen (4er-Nachbarschaft) */
    neighborCount(x, y, cells) {
      let n = 0;
      for (const d of DIR_KEYS) if (cells.has(this.key(x + DIRS[d].dx, y + DIRS[d].dy))) n++;
      return n;
    }

    generate() {
      const rng = this.rng;
      // Themen koennen verzweigtere Karten verlangen (Forgotten Branches: gen.minDeadEnds). Standard 3.
      // Andere Etagen bleiben dadurch unveraendert (gleiche Bedingung, gleiche Zufallszahlen).
      const theme = B.themeFor ? B.themeFor(this.depth) : null;
      const minDeadEnds = Math.max(3, (theme && theme.gen && theme.gen.minDeadEnds) || 3);
      const target = Math.min(20, Math.floor(3.3 * this.depth) + 6 + rng.int(0, 2));
      const sx = Math.floor(MAP_W / 2), sy = Math.floor(MAP_H / 2);
      let cells = null;

      for (let attempt = 0; attempt < 500; attempt++) {
        cells = new Map();
        const start = { x: sx, y: sy, type: 'start' };
        cells.set(this.key(sx, sy), start);
        const queue = [start];
        while (queue.length && cells.size < target) {
          const cur = queue.shift();
          for (const d of rng.shuffle(DIR_KEYS.slice())) {
            if (cells.size >= target) break;
            const nx = cur.x + DIRS[d].dx, ny = cur.y + DIRS[d].dy;
            if (!this.inBounds(nx, ny) || cells.has(this.key(nx, ny))) continue;
            if (this.neighborCount(nx, ny, cells) > 1) continue;
            if (rng.chance(0.5)) continue;
            const cell = { x: nx, y: ny, type: 'normal' };
            cells.set(this.key(nx, ny), cell);
            queue.push(cell);
          }
          // Wenn die Queue leer laeuft, bevor das Ziel erreicht ist, mit dem Startraum erneut probieren
          if (!queue.length && cells.size < target && rng.chance(0.5)) queue.push(start);
        }
        if (cells.size < target) continue;
        const deadEnds = [...cells.values()].filter((c) => c.type !== 'start' && this.neighborCount(c.x, c.y, cells) === 1);
        if (deadEnds.length >= minDeadEnds) break;
      }

      this.cells = cells;
      this.start = this.get(sx, sy);
      this.computeDistances();
      this.assignSpecialRooms();
      this.placeSecretRoom();
      this.connectRooms();

      // Raeume bauen (Reihenfolge stabil halten -> deterministisch)
      const ordered = [...this.cells.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
      for (const cell of ordered) cell.room.build(this.rng);
      this.assignKeyRoom(ordered);
      this.assignLooseLoot(ordered);
      this.assignReadme(ordered);
      this.assignPipes(ordered);
      this.assignProps(ordered);
      this.assignCacti(ordered);
    }

    /**
     * Kakteen (Kacheltyp CACTUS, Thema-Feld cacti = Anteil): In normalen Raeumen wird jeder Fels mit dieser
     * Chance zum Kaktus. Kakteen sind genauso solide wie Felsen, daher bleibt die Begehbarkeit jedes Raums exakt
     * gleich (kein fullyWalkable noetig). Nie im 3x3-Bereich vor einer Tuer: dort laeuft man beim Betreten
     * zwangslaeufig vorbei und soll nicht gleich gestochen werden. Eigener RNG-Strom (':cacti'); fuer jeden Fels
     * wird genau eine Zahl gezogen, damit das Ergebnis pro Raum stabil ist.
     */
    assignCacti(ordered) {
      const theme = B.themeFor ? B.themeFor(this.depth) : null;
      const share = theme && theme.cacti;
      if (!share) return;
      const rng = new B.RNG(B.hashString(String(this.seed) + ':cacti'));
      for (const cell of ordered) {
        if (cell.type !== 'normal') continue;
        const room = cell.room;
        const fronts = Object.keys(room.doors).map((dir) => DOOR_FRONT[dir]);
        for (let r = 1; r < ROWS - 1; r++) {
          for (let c = 1; c < COLS - 1; c++) {
            if (room.tileAt(c, r) !== TT.ROCK) continue;
            const hit = rng.chance(share);
            if (!hit || fronts.some(([fc, fr]) => Math.abs(fc - c) <= 1 && Math.abs(fr - r) <= 1)) continue;
            room.setTile(c, r, TT.CACTUS);
          }
        }
      }
    }

    /**
     * Zerstoerbare Objekte (Kacheltyp PROP). Pro normalem Raum mit Chance theme.props.chance 1..max Stueck,
     * Art zufaellig aus theme.props.kinds. Eigener RNG-Strom (Karten, Layouts, Gegner bleiben gleich).
     * Regeln: nur auf freien Bodenkacheln, nicht auf Gegner-Spawnpunkten, nicht in der Raummitte und nicht
     * im 3x3-Bereich vor einer Tuer; nach jedem Objekt muss jede begehbare Kachel erreichbar bleiben
     * (sonst wird es zurueckgenommen) — man soll nie zum Freischiessen gezwungen sein.
     */
    assignProps(ordered) {
      const theme = B.themeFor ? B.themeFor(this.depth) : null;
      const cfg = theme && theme.props;
      const kinds = cfg ? cfg.kinds.filter((k) => B.PROP_KINDS && B.PROP_KINDS[k]) : [];
      if (!kinds.length) return;
      const rng = new B.RNG(B.hashString(String(this.seed) + ':props'));
      const hpScale = 1 + 0.1 * (this.depth - 1);
      for (const cell of ordered) {
        const has = rng.chance(cfg.chance || 0);
        const count = rng.int(1, Math.max(1, cfg.max || 3));
        if (!has || cell.type !== 'normal') continue;
        const room = cell.room;
        const spawnTiles = new Set(room.spawnPoints.map((p) => Math.floor(p.x / TILE) + ',' + Math.floor(p.y / TILE)));
        const fronts = Object.keys(room.doors).map((dir) => DOOR_FRONT[dir]);
        const cands = [];
        for (let r = 1; r < ROWS - 1; r++) {
          for (let c = 1; c < COLS - 1; c++) {
            if (room.tileAt(c, r) !== TT.FLOOR || spawnTiles.has(c + ',' + r)) continue;
            if (c === 7 && r === 4) continue;
            if (fronts.some(([fc, fr]) => Math.abs(fc - c) <= 1 && Math.abs(fr - r) <= 1)) continue;
            cands.push([c, r]);
          }
        }
        rng.shuffle(cands);
        let placed = 0;
        for (const [c, r] of cands) {
          if (placed >= count) break;
          room.setTile(c, r, TT.PROP);
          if (!this.fullyWalkable(room, fronts)) { room.setTile(c, r, TT.FLOOR); continue; }
          const kind = rng.pick(kinds);
          const hp = Math.round(B.PROP_KINDS[kind].hp * hpScale * 10) / 10;
          room.props.set(c + ',' + r, { kind, hp, max: hp, hitAt: -1 });
          placed++;
        }
      }
    }

    /**
     * Haengen alle begehbaren Kacheln (Boden, Stacheln) zu EINER Flaeche zusammen, die alle Tuer-Vorplaetze
     * enthaelt? Die Suche startet bewusst nur an einem Vorplatz: Bis 2026-11-01 startete sie an allen
     * gleichzeitig — dann bestand auch ein Raum, den eine Kistenreihe in zwei Haelften mit je einer Tuer
     * teilte (Softlock: auf der Baumkarte kann genau diese Tuer der einzige Weg sein).
     */
    fullyWalkable(room, fronts) {
      const walk = (c, r) => { const t = room.tileAt(c, r); return t === TT.FLOOR || t === TT.SPIKES; };
      let total = 0;
      for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (walk(c, r)) total++;
      const seen = new Set();
      const start = fronts.find(([c, r]) => walk(c, r));
      if (!start) return total === 0;
      const queue = [start];
      seen.add(start[0] + ',' + start[1]);
      while (queue.length) {
        const [c, r] = queue.shift();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
          if (seen.has(k) || !walk(nc, nr)) continue;
          seen.add(k);
          queue.push([nc, nr]);
        }
      }
      return seen.size === total;
    }

    /**
     * Rohre: Jeder Kampfraum (normaler Raum mit geplanten Gegnern) hinterlaesst mit PIPE_CHANCE beim Clearing
     * ein Rohr. Eigener RNG-Strom (Karten bleiben gleich); fuer jede Zelle wird genau eine Zahl gezogen,
     * damit das Ergebnis pro Raum stabil ist. Das Ziel wird erst beim Hineinspringen gewaehlt (game.pipeWarp).
     */
    assignPipes(ordered) {
      const rng = new B.RNG(B.hashString(String(this.seed) + ':pipe'));
      for (const cell of ordered) {
        const hit = rng.chance(PIPE_CHANCE);
        if (hit && cell.type === 'normal' && cell.room.plannedEnemies.length) cell.room.hasPipe = true;
      }
    }

    /**
     * README.md: Mit Chance README_CHANCE liegt in einem zufaelligen normalen Raum (nicht Start, nicht
     * Spezialraum) ein README.md-Pickup. Eigener RNG-Strom wie bei assignKeyRoom (Karten bleiben gleich).
     */
    assignReadme(ordered) {
      const rng = new B.RNG(B.hashString(String(this.seed) + ':readme'));
      const has = rng.chance(README_CHANCE);
      const normals = ordered.filter((c) => c.type === 'normal');
      const cell = rng.pick(normals);
      if (!has || !cell) return;
      cell.room.hasReadme = true;
      this.readmeRoom = cell;
    }

    /** README.md eingesammelt: alle Raeume ausser dem Geheimraum als "gesehen" markieren */
    documentMap() {
      this.documented = true;
      for (const c of this.cells.values()) if (c.type !== 'secret') c.room.seen = true;
    }

    /**
     * Lose Pickups (Tabelle B.LOOSE_LOOT in pickup.js). Zweck: Ohne sie lag waehrend eines Kampfes nie ein
     * echtes Pickup herum, also war jede "Muenze" im noch nicht geclearten Raum sofort als Hallucination
     * erkennbar. Nur Kampfraeume (mit geplanten Gegnern), denn nur dort taucht die Hallucination auf.
     * Eigener RNG-Strom wie bei assignKeyRoom: Karten, Layouts und Gegner bestehender Seeds bleiben gleich,
     * und das Ergebnis haengt nicht von der Besuchsreihenfolge ab. Die Positionen waehlt erst game.populate.
     */
    assignLooseLoot(ordered) {
      const cfg = B.LOOSE_LOOT;
      if (!cfg || !cfg.types) return;
      const types = Object.keys(cfg.types).filter((t) => B.PICKUP_TYPES[t]);
      if (!types.length) return;
      const rng = new B.RNG(B.hashString(String(this.seed) + ':loot'));
      for (const cell of ordered) {
        // Fuer jede Zelle gleich viele Zufallszahlen ziehen -> Ergebnis pro Raum stabil
        const has = rng.chance(cfg.chance || 0);
        const two = rng.chance(cfg.secondChance || 0);
        const a = rng.weighted(types, (t) => cfg.types[t]);
        const b = rng.weighted(types, (t) => cfg.types[t]);
        if (!has || cell.type !== 'normal' || !cell.room.plannedEnemies.length) continue;
        cell.room.looseLoot = two ? [a, b] : [a];
      }
    }

    /**
     * Garantiertes Approval (Schluessel) ab Tiefe 2.
     * Hintergrund: Ab Tiefe 2 sind Schatzraum und Shop verschlossen, Approvals kamen aber nur aus Zufalls-
     * Drops (~0.2–0.6 pro Etage); auf 55–80 % der Etagen gab es gar keins. Deshalb wird hier genau ein
     * Kampfraum ausgewaehlt, der beim Clearing zusaetzlich sicher ein Approval fallen laesst (game.onRoomClear).
     * Eigener RNG-Strom (aus dem Etagen-Seed abgeleitet): Der Haupt-RNG der Etage wird nicht angefasst,
     * damit bestehende Seeds dieselben Karten, Layouts und Gegner behalten. Die Wahl haengt nicht von der
     * Besuchsreihenfolge ab.
     */
    assignKeyRoom(ordered) {
      if (this.depth < 2) return;
      const rng = new B.RNG(B.hashString(String(this.seed) + ':key'));
      const normals = ordered.filter((c) => c.type === 'normal');
      // Bevorzugt Raeume mit Gegnern (nur dort gibt es ein Clearing-Ereignis); sonst irgendein Normalraum
      const fighting = normals.filter((c) => c.room.plannedEnemies.length > 0);
      const pool = fighting.length ? fighting : normals;
      if (!pool.length) return;
      const cell = rng.pick(pool);
      cell.room.guaranteedKey = true;
      this.keyRoom = cell;
    }

    /** BFS-Distanz vom Startraum fuer jede Zelle */
    computeDistances() {
      for (const c of this.cells.values()) c.dist = -1;
      this.start.dist = 0;
      const queue = [this.start];
      while (queue.length) {
        const cur = queue.shift();
        for (const d of DIR_KEYS) {
          const n = this.get(cur.x + DIRS[d].dx, cur.y + DIRS[d].dy);
          if (n && n.dist === -1) { n.dist = cur.dist + 1; queue.push(n); }
        }
      }
    }

    assignSpecialRooms() {
      const rng = this.rng;
      const deadEnds = [...this.cells.values()]
        .filter((c) => c.type !== 'start' && this.neighborCount(c.x, c.y, this.cells) === 1)
        .sort((a, b) => b.dist - a.dist);
      if (deadEnds.length) deadEnds.shift().type = 'boss';
      const rest = rng.shuffle(deadEnds);
      if (rest.length) rest.shift().type = 'treasure';
      if (rest.length) rest.shift().type = 'shop';

      // Fallback (sollte dank Retry kaum vorkommen): fehlende Spezialraeume auf beliebige Normalraeume legen
      for (const type of ['boss', 'treasure', 'shop']) {
        if (![...this.cells.values()].some((c) => c.type === type)) {
          const normals = [...this.cells.values()].filter((c) => c.type === 'normal').sort((a, b) => b.dist - a.dist);
          if (normals.length) normals[0].type = type;
        }
      }
    }

    placeSecretRoom() {
      const candidates = [];
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (this.cells.has(this.key(x, y))) continue;
          let n = 0, nearBoss = false;
          for (const d of DIR_KEYS) {
            const c = this.get(x + DIRS[d].dx, y + DIRS[d].dy);
            if (c) { n++; if (c.type === 'boss') nearBoss = true; }
          }
          if (n >= 2 && !nearBoss) candidates.push({ x, y, n });
        }
      }
      if (!candidates.length) return;
      const pick = this.rng.weighted(candidates, (c) => c.n * c.n);
      const cell = { x: pick.x, y: pick.y, type: 'secret', dist: 99 };
      this.cells.set(this.key(pick.x, pick.y), cell);
    }

    /** Erzeugt Raum-Objekte und gemeinsame Tuer-Kanten zwischen benachbarten Zellen */
    connectRooms() {
      const PRIORITY = ['boss', 'secret', 'treasure', 'shop'];
      for (const cell of this.cells.values()) cell.room = new B.Room(this, cell);
      for (const cell of this.cells.values()) {
        for (const d of ['right', 'down']) { // jede Kante nur einmal erzeugen
          const n = this.get(cell.x + DIRS[d].dx, cell.y + DIRS[d].dy);
          if (!n) continue;
          let kind = 'normal';
          for (const k of PRIORITY) if (cell.type === k || n.type === k) { kind = k; break; }
          const edge = {
            kind,
            hidden: kind === 'secret',
            locked: (kind === 'treasure' || kind === 'shop') && this.depth >= 2,
          };
          cell.room.doors[d] = { dir: d, edge, target: n };
          n.room.doors[B.OPPOSITE[d]] = { dir: B.OPPOSITE[d], edge, target: cell };
        }
      }
    }

    /** Erste Zelle eines Typs (z. B. 'boss') */
    findType(type) {
      for (const c of this.cells.values()) if (c.type === type) return c;
      return null;
    }

    /** Markiert einen Raum als besucht und seine (nicht versteckten) Nachbarn als gesehen */
    reveal(cell) {
      cell.room.visited = true;
      cell.room.seen = true;
      for (const door of Object.values(cell.room.doors)) {
        if (!door.edge.hidden) door.target.room.seen = true;
      }
    }
  }

  B.Floor = Floor;
})(window.BOTA);
