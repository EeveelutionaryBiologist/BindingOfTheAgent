/*
 * room.js — Ein Raum: Kachelraster, Tueren, Entity-Listen, Kollisionsabfragen, Pfadfindung.
 *
 * Koordinaten: Raumkoordinaten in logischen Pixeln, (0,0) = linke obere Ecke der Wand.
 * Das Raster hat COLS x ROWS Kacheln; der aeussere Ring sind Waende (mit Tueren in der Mitte).
 */
'use strict';

(function (B) {
  const { TILE, COLS, ROWS, DOOR_TILES } = B.C;
  const T = B.TILES;

  // Zeichen aus layouts.js -> Kacheltyp
  const LAYOUT_CHARS = { '.': T.FLOOR, 'e': T.FLOOR, 'r': T.ROCK, 'b': T.BLOCK, 'p': T.PIT, 's': T.SPIKES };

  class Room {
    /**
     * @param {BOTA.Floor} floor — zugehoerige Etage
     * @param {object} cell      — Zelle im Dungeon-Raster ({x, y, type, dist})
     */
    constructor(floor, cell) {
      this.floor = floor;
      this.cell = cell;
      this.type = cell.type; // 'start' | 'normal' | 'boss' | 'treasure' | 'shop' | 'secret'
      this.tiles = new Uint8Array(COLS * ROWS);
      this.doors = {};       // dir -> { dir, edge: {kind, locked, hidden}, target: cell }

      // Entity-Listen (werden nur im aktuellen Raum aktualisiert)
      this.enemies = [];
      this.projectiles = []; // Projektile beider Teams + Bomben
      this.pickups = [];     // Pickups, Podeste, Shop-Slots, Truhen, Falltuer
      this.effects = [];     // Partikel & Co. (rein visuell)

      // Zustand
      this.seen = false;     // auf der Minimap sichtbar (Nachbar eines besuchten Raums)
      this.visited = false;
      this.cleared = false;
      this.populated = false;
      this.combatClosed = false; // Tueren wegen Kampf geschlossen

      this.layout = null;
      this.spawnPoints = [];     // bevorzugte Gegner-Spawnpunkte (aus 'e' im Layout)
      this.plannedEnemies = [];  // beim Bau gewuerfelte Gegnerliste (deterministisch pro Seed)
      this.bossId = null;
      this.guaranteedKey = false; // dieser Raum laesst beim Clearing sicher ein Approval fallen (siehe dungeon.js)
      this.looseLoot = [];       // Pickup-Typen, die beim ersten Betreten schon herumliegen (siehe dungeon.js)
      this.hasReadme = false;    // hier liegt das README.md der Etage (siehe dungeon.js: assignReadme)

      // Render-Cache (Hintergrund); renderer.js setzt/liest das
      this.bgDirty = true;
      this.bgCanvas = null;

      // Pfadfindungs-Cache (Flow-Field zum Spieler)
      this.flow = null;
      this.flowTarget = -1;
    }

    // -------------------------------------------------------------------------
    // Aufbau
    // -------------------------------------------------------------------------

    /** Baut Waende, Layout und Tueren. rng = Generator-RNG der Etage (deterministisch). */
    build(rng) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
          this.tiles[r * COLS + c] = border ? T.WALL : T.FLOOR;
        }
      }

      // Layout waehlen: Kampfraeume aus 'normal', alles andere aus 'special'
      const tag = this.type === 'normal' ? 'normal' : 'special';
      const pool = B.LAYOUTS.filter((l) => l.tags.includes(tag));
      this.layout = pool.length ? rng.weighted(pool, (l) => l.weight || 1) : null;
      if (this.layout) {
        for (let r = 0; r < 7; r++) {
          const row = this.layout.rows[r] || '';
          for (let c = 0; c < 13; c++) {
            const ch = row[c] || '.';
            this.tiles[(r + 1) * COLS + (c + 1)] = LAYOUT_CHARS[ch] !== undefined ? LAYOUT_CHARS[ch] : T.FLOOR;
            if (ch === 'e') this.spawnPoints.push(this.tileCenter(c + 1, r + 1));
          }
        }
      }

      // Tuer-Kacheln setzen
      for (const dir of Object.keys(this.doors)) {
        const d = DOOR_TILES[dir];
        this.tiles[d.row * COLS + d.col] = T.DOOR;
      }

      // Gegner/Boss vorab wuerfeln (damit derselbe Seed dieselben Raeume ergibt)
      if (this.type === 'normal') {
        this.plannedEnemies = B.rollRoomEnemies ? B.rollRoomEnemies(rng, this.floor.depth, this) : [];
      } else if (this.type === 'boss') {
        this.bossId = B.rollBoss ? B.rollBoss(rng, this.floor.depth) : null;
      }
      this.bgDirty = true;
    }

    // -------------------------------------------------------------------------
    // Kachel-Abfragen
    // -------------------------------------------------------------------------

    tileAt(c, r) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return T.WALL;
      return this.tiles[r * COLS + c];
    }

    setTile(c, r, t) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
      this.tiles[r * COLS + c] = t;
      this.bgDirty = true;
      this.flowTarget = -1; // Pfade neu berechnen
    }

    tileCenter(c, r) { return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }; }

    worldToTile(x, y) { return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) }; }

    /** Richtung der Tuer an Kachel (c, r) oder null */
    doorDirAt(c, r) {
      for (const dir of Object.keys(this.doors)) {
        const d = DOOR_TILES[dir];
        if (d.col === c && d.row === r) return dir;
      }
      return null;
    }

    /** Ist die Tuer in Richtung dir fuer den Spieler passierbar? */
    doorOpen(dir) {
      const d = this.doors[dir];
      return !!d && !d.edge.locked && !d.edge.hidden && !this.combatClosed;
    }

    /**
     * Ist Kachel (c, r) fuer den Bewegungsmodus solide?
     * mode: 'walk' (Laeufer), 'fly' (Flieger), 'shot' (Projektil), 'spectral' (Geister-Projektil)
     * isPlayer: nur der Spieler darf offene Tueren betreten.
     */
    isSolid(c, r, mode, isPlayer) {
      const t = this.tileAt(c, r);
      switch (t) {
        case T.FLOOR:
        case T.SPIKES:
          return false;
        case T.WALL:
          return true;
        case T.DOOR: {
          if (!isPlayer) return true;
          const dir = this.doorDirAt(c, r);
          return !(dir && this.doorOpen(dir));
        }
        case T.ROCK:
        case T.BLOCK:
          return mode === 'walk' || mode === 'shot';
        case T.PIT:
          return mode === 'walk';
        default:
          return true;
      }
    }

    /** Punktabfrage in Weltkoordinaten */
    isSolidAt(x, y, mode, isPlayer) {
      return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE), mode, isPlayer);
    }

    /** Liegt eine solide Kachel (fuer Projektile) zwischen zwei Punkten? (Sichtlinie) */
    lineOfSight(x0, y0, x1, y1) {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 4));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.isSolidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 'shot', false)) return false;
      }
      return true;
    }

    /**
     * Zufaellige freie Bodenposition (keine Stacheln) im Innenraum.
     * opts.awayFrom = {x, y, d}: Mindestabstand zu einem Punkt (z. B. Spieler an der Tuer).
     */
    randomFreePos(rng, opts) {
      const o = opts || {};
      for (let tries = 0; tries < 200; tries++) {
        const c = rng.int(1, COLS - 2);
        const r = rng.int(1, ROWS - 2);
        if (this.tileAt(c, r) !== T.FLOOR) continue;
        const p = this.tileCenter(c, r);
        if (o.awayFrom && B.M.dist(p.x, p.y, o.awayFrom.x, o.awayFrom.y) < (o.awayFrom.d || 0)) continue;
        return p;
      }
      return this.tileCenter(7, 4); // Notfall: Raummitte
    }

    // -------------------------------------------------------------------------
    // Pfadfindung: BFS-Flow-Field vom Spieler aus (nur fuer laufende Gegner noetig)
    // -------------------------------------------------------------------------

    /** Berechnet das Flow-Field zur Kachel unter (tx, ty) neu, falls sich das Ziel geaendert hat. */
    updateFlow(tx, ty) {
      const { c, r } = this.worldToTile(tx, ty);
      const idx = r * COLS + c;
      if (idx === this.flowTarget && this.flow) return;
      this.flowTarget = idx;
      const dist = this.flow || new Int16Array(COLS * ROWS);
      dist.fill(-1);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) { this.flow = dist; return; }
      dist[idx] = 0;
      const queue = [idx];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const cc = cur % COLS, cr = (cur / COLS) | 0;
        const nd = dist[cur] + 1;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cc + dc, nr = cr + dr;
          if (nc < 1 || nr < 1 || nc >= COLS - 1 || nr >= ROWS - 1) continue;
          const ni = nr * COLS + nc;
          if (dist[ni] !== -1 || this.isSolid(nc, nr, 'walk', false)) continue;
          dist[ni] = nd;
          queue.push(ni);
        }
      }
      this.flow = dist;
    }

    /**
     * Richtung (Einheitsvektor) entlang des Flow-Fields fuer einen Laeufer an (x, y)
     * Richtung Ziel (tx, ty). Faellt auf Direktkurs zurueck, wenn kein Pfad existiert.
     */
    flowDir(x, y, tx, ty) {
      const direct = B.M.norm(tx - x, ty - y);
      if (!this.flow) return direct;
      const { c, r } = this.worldToTile(x, y);
      const here = this.flow[r * COLS + c];
      if (here <= 1) return direct; // gleiche/benachbarte Kachel: direkt drauf zu
      let best = null, bestD = here;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nc = c + dc, nr = r + dr;
        const d = this.flow[nr * COLS + nc];
        if (d < 0 || d >= bestD) continue;
        // Diagonalen nur, wenn beide Orthogonalen frei sind (keine Ecken schneiden)
        if (dc && dr && (this.isSolid(c + dc, r, 'walk', false) || this.isSolid(c, r + dr, 'walk', false))) continue;
        best = [nc, nr];
        bestD = d;
      }
      if (!best) return direct;
      const p = this.tileCenter(best[0], best[1]);
      return B.M.norm(p.x - x, p.y - y);
    }

    // -------------------------------------------------------------------------
    // Kampfzustand
    // -------------------------------------------------------------------------

    /** Gibt es noch Gegner, die das Raum-Clearing blockieren? */
    hasLivingEnemies() {
      return this.enemies.some((e) => !e.dead && !e.ignoreForClear);
    }

    closeDoors() {
      if (!this.combatClosed) {
        this.combatClosed = true;
        this.bgDirty = true;
        B.bus.emit('doorsClose', { room: this });
      }
    }

    openDoors() {
      if (this.combatClosed) {
        this.combatClosed = false;
        this.bgDirty = true;
        B.bus.emit('doorsOpen', { room: this });
      }
    }

    // -------------------------------------------------------------------------
    // Update aller Entities im Raum
    // -------------------------------------------------------------------------

    update(dt, game) {
      // Index-Schleifen, damit waehrend des Updates gespawnte Entities sicher hinzukommen
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.dead) e.update(dt, game);
      }
      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        if (!p.dead) p.update(dt, game);
      }
      for (let i = 0; i < this.pickups.length; i++) {
        const p = this.pickups[i];
        if (!p.dead) p.update(dt, game);
      }
      for (let i = 0; i < this.effects.length; i++) {
        const fx = this.effects[i];
        if (!fx.dead) fx.update(dt, game);
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.pickups = this.pickups.filter((p) => !p.dead);
      this.effects = this.effects.filter((fx) => !fx.dead);
    }
  }

  B.Room = Room;
})(window.BOTA);
