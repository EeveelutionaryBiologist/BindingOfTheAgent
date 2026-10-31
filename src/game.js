/*
 * game.js — Zustandsautomat, Raum-/Etagenwechsel und die "Welt-API", die Verhalten und Items nutzen.
 *
 * Zustaende: title -> floorCard -> play <-> pause
 *                                  play -> roomTransition -> play (ggf. -> bossIntro -> play)
 *                                  play -> floorTransition -> floorCard
 *                                  play -> dead -> floorCard (neuer Run)
 *
 * Welt-API (fuer Verhalten, Items, Effekte):
 *   game.player, game.room, game.floor, game.depth, game.rng, game.followers
 *   game.spawnProjectile(opts), game.spawnEnemy(id, x, y), game.spawnBoss(id, x, y)
 *   game.spawnPickup(type, x, y, opts), game.spawnPedestal(itemId, x, y, opts)
 *   game.explode(x, y, radius, damage, source), game.shake(intensity, seconds)
 *   game.banner(title, subtitle), game.freezeEnemies(seconds), game.rollItem(pool)
 *   game.nearestFreePos(x, y)
 */
'use strict';

(function (B) {
  const { TILE, COLS, ROWS, ROOM_W, ROOM_H, DOOR_TILES } = B.C;
  const T = B.TILES;

  class Game {
    constructor() {
      this.state = 'title';
      this.stateT = 0;
      this.seed = null;
      this.rng = new B.RNG(Date.now() >>> 0);
      this.player = null;
      this.floor = null;
      this.room = null;
      this.depth = 0;
      this.followers = [];
      this.seenItems = new Set();
      this.transition = null;
      this.bannerState = null;
      this.shakeT = 0;
      this.shakeI = 0;
      this.flowTimer = 0;
      this.restartHold = 0;
      this.hudGlitch = null; // { kind, t, dur } — verfremdeter HUD-Bereich (Graphics Glitch), siehe glitchHud
      this.bossHistory = []; // Boss-IDs der bisherigen Etagen dieses Runs (siehe assignFloorBoss)
      this.pendingBossIntro = false;
      this.death = null;
      this.runStats = { kills: 0, rooms: 0, time: 0 };
      this.lockDeniedT = 0;
      this.fps = 60;
      this.titleTagline = B.TEXT.TAGLINES ? B.TEXT.TAGLINES[Math.floor(Math.random() * B.TEXT.TAGLINES.length)] : '';
    }

    // =========================================================================
    // Run- und Etagenverwaltung
    // =========================================================================

    newRun(seed) {
      this.seed = seed || B.randomSeed();
      this.rng = new B.RNG(B.hashString(this.seed + ':run'));
      this.player = new B.Player(ROOM_W / 2, ROOM_H / 2);
      this.followers = [];
      this.seenItems = new Set();
      this.runStats = { kills: 0, rooms: 0, time: 0 };
      this.death = null;
      this.bannerState = null;
      this.hudGlitch = null;
      this.bossHistory = [];
      B.storage.data.runs++;
      B.storage.save();
      if (B.syncFollowers) B.syncFollowers(this);
      B.bus.emit('runStart', { game: this, seed: this.seed });
      this.enterFloor(1);
    }

    enterFloor(depth) {
      this.depth = depth;
      this.floor = new B.Floor(depth, B.hashString(this.seed + ':floor:' + depth));
      this.assignFloorBoss();
      const p = this.player;
      p.x = ROOM_W / 2;
      p.y = ROOM_H / 2 + TILE;
      p.vx = p.vy = p.kbx = p.kby = 0;
      this.room = null;
      this.transition = null;
      this.enterRoom(this.floor.start.room);
      for (const f of this.followers) { f.x = p.x; f.y = p.y; }
      if (depth > B.storage.data.bestFloor) { B.storage.data.bestFloor = depth; B.storage.save(); }
      this.setState('floorCard', 2.2);
      B.bus.emit('floorEnter', { game: this, depth });
    }

    nextFloor() {
      if (this.state !== 'play') return;
      this.setState('floorTransition', 0.6);
      B.bus.emit('descend', { game: this, depth: this.depth });
    }

    setState(s, t) {
      this.state = s;
      this.stateT = t || 0;
    }

    onPlayerDeath(killer) {
      this.death = {
        killer,
        epitaph: this.rng.pick(B.TEXT.EPITAPHS || ['You died.']),
        depth: this.depth,
        kills: this.runStats.kills,
        items: this.player.items.length,
        time: this.runStats.time,
      };
      B.storage.data.deaths++;
      B.storage.save();
      this.setState('dead', 0);
      B.bus.emit('playerDeath', { game: this, killer, x: this.player.x, y: this.player.y });
    }

    // =========================================================================
    // Raeume
    // =========================================================================

    /**
     * Boss dieser Etage mit Run-Gedaechtnis waehlen (B.rollBossVaried: nie derselbe wie auf der vorigen
     * Etage, schon getroffene seltener). Die Etage hat beim Bau schon einen Boss vorgewuerfelt; der wird
     * hier ersetzt. So bleibt der Etagen-RNG unangetastet (gleiche Karten pro Seed), und die Wahl ist
     * trotzdem deterministisch: eigener Strom aus Seed + Tiefe, und die Vorgeschichte haengt nur von
     * den vorigen Etagen ab (die man immer der Reihe nach betritt).
     */
    assignFloorBoss() {
      const cell = this.floor.findType('boss');
      if (!cell || !cell.room.bossId || !B.rollBossVaried) return;
      const rng = new B.RNG(B.hashString(this.seed + ':boss:' + this.depth));
      const id = B.rollBossVaried(rng, this.depth, this.bossHistory);
      if (id) cell.room.bossId = id;
      this.bossHistory.push(cell.room.bossId);
    }

    /** Betritt einen Raum (ohne Animation). Befuellt ihn beim ersten Besuch. */
    enterRoom(room) {
      this.room = room;
      this.floor.reveal(room.cell);
      const first = !room.populated;
      if (first) {
        this.populate(room);
        this.runStats.rooms++;
      }
      if (room.hasLivingEnemies()) room.closeDoors();
      room.flowTarget = -1;
      this.flowTimer = 0;
      this.player.fireHook('onRoomEnter', room, this);
      B.bus.emit('roomEnter', { game: this, room, first });
      if (first && room.type === 'boss' && room.enemies.some((e) => e.isBoss)) this.pendingBossIntro = true;
      if (first && room.type === 'shop' && B.TEXT.SHOP_LINES) this.banner('Shop', this.rng.pick(B.TEXT.SHOP_LINES));
    }

    /** Raumwechsel mit Slide-Animation durch die Tuer in Richtung dir */
    changeRoom(dir) {
      const door = this.room.doors[dir];
      if (!door) return;
      const from = this.room;
      const to = door.target.room;
      // Projektile im alten Raum verwerfen (Bomben bleiben liegen), Effekte ebenso
      from.projectiles = from.projectiles.filter((p) => p instanceof B.Bomb);
      from.effects = [];

      // Spieler an die gegenueberliegende Tuer des neuen Raums setzen
      const opp = B.OPPOSITE[dir];
      const dt = DOOR_TILES[opp];
      const c = to.tileCenter(dt.col, dt.row);
      const d = B.DIRS[dir];
      const p = this.player;
      p.x = c.x + d.dx * (TILE / 2 + p.r + 6);
      p.y = c.y + d.dy * (TILE / 2 + p.r + 6);
      p.kbx = p.kby = 0;
      for (const f of this.followers) { f.x = p.x - d.dx * 30; f.y = p.y - d.dy * 30; }

      this.transition = { from, to, dir, t: 0, dur: 0.28 };
      this.setState('roomTransition', 0);
      this.enterRoom(to);
    }

    /** Teleport in einen Raum (Debug) */
    teleport(room) {
      if (!room) return;
      const p = this.player;
      const pos = room.populated ? this.nearestFreePos(ROOM_W / 2, ROOM_H / 2 + TILE * 2, room) : { x: ROOM_W / 2, y: ROOM_H - TILE * 1.6 };
      p.x = pos.x; p.y = pos.y;
      this.enterRoom(room);
      this.setState('play');
    }

    /** Befuellt einen Raum beim ersten Betreten */
    populate(room) {
      room.populated = true;
      const rng = this.rng;
      const p = this.player;
      const center = room.tileCenter(7, 4);
      switch (room.type) {
        case 'normal': {
          const away = { x: p.x, y: p.y, d: 200 };
          const points = rng.shuffle(room.spawnPoints.filter((s) => B.M.dist(s.x, s.y, p.x, p.y) > 180));
          for (const id of room.plannedEnemies) {
            // Zuerst die Layout-Spawnpunkte, dann zufaellige freie Kacheln weit weg vom Spieler
            const pos = points.length ? points.pop() : room.randomFreePos(rng, { awayFrom: away });
            const jitter = { x: rng.float(-12, 12), y: rng.float(-12, 12) };
            this.spawnEnemy(id, pos.x + jitter.x, pos.y + jitter.y, room);
          }
          // Lose Pickups (vorab gewuerfelt in dungeon.js). Gleiche Platzierung wie die Gegner (Spawnpunkte,
          // sonst freie Kachel weit weg vom Spieler, gleicher Versatz), weil die Hallucination genauso
          // platziert wird: Die Position darf nicht verraten, was echt ist.
          for (const type of room.looseLoot) {
            const pos = points.length ? points.pop() : room.randomFreePos(rng, { awayFrom: away });
            this.spawnPickup(type, pos.x + rng.float(-12, 12), pos.y + rng.float(-12, 12), {}, room);
          }
          if (!room.hasLivingEnemies()) {
            // Ohne Gegner gibt es kein Clearing-Ereignis -> garantiertes Approval direkt hinlegen
            room.cleared = true;
            this.dropGuaranteedKey(room);
          }
          break;
        }
        case 'boss': {
          if (room.bossId) this.spawnBoss(room.bossId, center.x, TILE * 3, room);
          else room.cleared = true;
          break;
        }
        case 'treasure': {
          this.spawnPedestal(this.rollItem('treasure'), center.x, center.y, {}, room);
          room.cleared = true;
          break;
        }
        case 'shop': {
          const item = this.rollItem('shop');
          const def = B.ITEMS[item];
          this.spawnPedestal(item, room.tileCenter(4, 4).x, center.y, { price: (def && def.price) || 15 }, room);
          const wares = [['heart', 3], ['push', 5], ['approval', 5], ['guardrail', 6], ['credit5', 0]].filter((w) => w[1] > 0 && B.PICKUP_TYPES[w[0]]);
          rng.shuffle(wares);
          [6, 8, 10].forEach((col, i) => {
            const w = wares[i % wares.length];
            this.spawnPickup(w[0], room.tileCenter(col, 4).x, center.y, { price: w[1] }, room);
          });
          room.cleared = true;
          break;
        }
        case 'secret': {
          if (rng.chance(0.35)) {
            this.spawnPedestal(this.rollItem('secret'), center.x, center.y, {}, room);
          } else {
            const n = rng.int(3, 6);
            for (let i = 0; i < n; i++) {
              const a = rng.angle();
              this.spawnPickup('credit', center.x + Math.cos(a) * 50, center.y + Math.sin(a) * 50, {}, room);
            }
            this.spawnPickup('push', center.x, center.y + 70, {}, room);
          }
          room.cleared = true;
          break;
        }
        default:
          room.cleared = true;
      }
    }

    onEnemyKilled(e) {
      this.runStats.kills++;
    }

    /** Wird aufgerufen, sobald der letzte Gegner eines Kampfraums faellt */
    onRoomClear(room) {
      room.cleared = true;
      room.openDoors();
      this.player.chargeActive(1);
      this.player.fireHook('onRoomClear', room, this);
      B.bus.emit('roomClear', { game: this, room });

      if (room.type === 'boss') {
        const c = room.tileCenter(7, 4);
        room.pickups.push(new B.Trapdoor(c.x, c.y + TILE));
        this.spawnPedestal(this.rollItem('boss'), c.x, c.y - TILE, {}, room);
        this.spawnPickup('heart', c.x - TILE * 2, c.y, {}, room);
        return;
      }
      // Belohnung fuer das Clearing
      this.dropGuaranteedKey(room);
      const luck = this.player.stats.luck;
      if (this.rng.chance(Math.min(0.9, 0.35 + luck * 0.03))) {
        const pos = this.nearestFreePos(ROOM_W / 2, ROOM_H / 2, room);
        this.spawnPickup(B.rollRandomPickup(this.rng, luck), pos.x, pos.y, {}, room);
      }
    }

    /**
     * Garantiertes Approval des Raums ablegen (einmalig; Auswahl in Floor.assignKeyRoom).
     * Liegt eine Kachel links von der Mitte, damit es nicht auf dem Zufalls-Drop landet. Zieht keine
     * Zufallszahl aus game.rng, aendert also den restlichen Run-Zufall nicht.
     */
    dropGuaranteedKey(room) {
      if (!room.guaranteedKey) return;
      room.guaranteedKey = false;
      const pos = this.nearestFreePos(ROOM_W / 2 - TILE, ROOM_H / 2, room);
      this.spawnPickup('approval', pos.x, pos.y, {}, room);
    }

    /** Naechste freie Bodenposition zu (x, y) — Spiralsuche ueber Kacheln */
    nearestFreePos(x, y, room) {
      const rm = room || this.room;
      const c0 = Math.floor(x / TILE), r0 = Math.floor(y / TILE);
      for (let rad = 0; rad < 8; rad++) {
        for (let dr = -rad; dr <= rad; dr++) {
          for (let dc = -rad; dc <= rad; dc++) {
            if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
            const c = c0 + dc, r = r0 + dr;
            if (c < 1 || r < 1 || c >= COLS - 1 || r >= ROWS - 1) continue;
            if (rm.tileAt(c, r) === T.FLOOR) return rad === 0 ? { x, y } : rm.tileCenter(c, r);
          }
        }
      }
      return { x, y };
    }

    // =========================================================================
    // Welt-API
    // =========================================================================

    spawnProjectile(o) {
      const p = new B.Projectile(o);
      this.room.projectiles.push(p);
      return p;
    }

    spawnEnemy(id, x, y, room) {
      const def = B.ENEMIES[id];
      if (!def) { console.warn('[game] unknown enemy', id); return null; }
      const e = new B.Enemy(def, id, x, y, this, 1 + 0.15 * (this.depth - 1));
      (room || this.room).enemies.push(e);
      return e;
    }

    spawnBoss(id, x, y, room) {
      if (!B.BOSSES[id]) { console.warn('[game] unknown boss', id); return null; }
      const e = new B.Boss(id, x, y, this);
      (room || this.room).enemies.push(e);
      B.bus.emit('bossSpawn', { game: this, boss: e });
      return e;
    }

    /**
     * HUD-Stoerung (Graphics Glitch): verfremdet fuer `seconds` Sekunden genau einen HUD-Bereich
     * ('hearts' | 'items' | 'stats' | 'minimap'; gezeichnet in hud.js). Laeuft schon eine Stoerung,
     * wird nur ihr Timer neu gestartet (kein Stapeln, kein neuer Bereich). Die Wahl laeuft ueber game.rng.
     */
    glitchHud(seconds) {
      const dur = Math.max(0.5, Math.min(30, +seconds || 7));
      if (this.hudGlitch) {
        this.hudGlitch.t = dur;
        this.hudGlitch.dur = dur;
      } else {
        this.hudGlitch = { kind: this.rng.pick(['hearts', 'items', 'stats', 'minimap']), t: dur, dur };
      }
      B.bus.emit('hudGlitch', { game: this, kind: this.hudGlitch.kind });
    }

    spawnPickup(type, x, y, opts, room) {
      const pk = new B.Pickup(type, x, y, opts);
      (room || this.room).pickups.push(pk);
      return pk;
    }

    spawnPedestal(itemId, x, y, opts, room) {
      const pd = new B.Pedestal(itemId, x, y, opts);
      (room || this.room).pickups.push(pd);
      return pd;
    }

    /** Explosion: Gegner- und Spielerschaden, Felsen zerstoeren, Geheimtueren aufdecken, Pickups wegschleudern */
    explode(x, y, radius, damage, source) {
      const room = this.room;
      for (const e of room.enemies) {
        if (e.dead) continue;
        if (B.M.dist(x, y, e.x, e.y) < radius + e.r) {
          if (e.hurt(damage, this, null) && !e.noKnockback) e.knockback(e.x - x, e.y - y, 500);
        }
        // Optionaler Verhaltens-Haken (z. B. getarnte Hallucination: reagiert wie ein Pickup)
        if (e.behavior && e.behavior.onExplosion) e.behavior.onExplosion(e, this, x, y, radius);
      }
      const p = this.player;
      if (B.M.dist(x, y, p.x, p.y) < radius + p.r * 0.5) {
        if (p.hurt(2, source || 'an explosion', this)) p.knockback(p.x - x, p.y - y, 500);
      }
      // Felsen sprengen
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (room.tileAt(c, r) !== T.ROCK) continue;
          const tc = room.tileCenter(c, r);
          if (B.M.dist(x, y, tc.x, tc.y) < radius + TILE * 0.25) {
            room.setTile(c, r, T.FLOOR);
            B.bus.emit('rockBreak', { game: this, x: tc.x, y: tc.y });
            if (this.rng.chance(0.08)) this.spawnPickup(B.rollRandomPickup(this.rng, p.stats.luck), tc.x, tc.y);
          }
        }
      }
      // Versteckte Tueren aufdecken
      for (const dir of Object.keys(room.doors)) {
        const door = room.doors[dir];
        if (!door.edge.hidden) continue;
        const dt = DOOR_TILES[dir];
        const tc = room.tileCenter(dt.col, dt.row);
        if (B.M.dist(x, y, tc.x, tc.y) < radius + TILE * 0.5) {
          door.edge.hidden = false;
          room.bgDirty = true;
          door.target.room.bgDirty = true;
          door.target.room.seen = true;
          this.banner('Undocumented endpoint found', 'A secret room. Nobody wrote this down. Of course.');
          B.bus.emit('secretFound', { game: this });
        }
      }
      // Pickups wegschleudern
      for (const pk of room.pickups) {
        if (!(pk instanceof B.Pickup) || pk.price) continue;
        const d = B.M.dist(x, y, pk.x, pk.y);
        if (d < radius * 1.5) pk.knockback(pk.x - x, pk.y - y, 400);
      }
      this.shake(12, 0.35);
      B.bus.emit('explosion', { game: this, x, y, radius });
    }

    shake(intensity, seconds) {
      this.shakeI = Math.max(this.shakeI, intensity);
      this.shakeT = Math.max(this.shakeT, seconds);
    }

    shakeOffset() {
      if (this.shakeT <= 0) return { x: 0, y: 0 };
      const k = this.shakeI * Math.min(1, this.shakeT / 0.2);
      return { x: (Math.random() * 2 - 1) * k, y: (Math.random() * 2 - 1) * k };
    }

    banner(title, sub) {
      this.bannerState = { title, sub: sub || '', t: 2.5 };
    }

    freezeEnemies(seconds) {
      for (const e of this.room.enemies) e.frozen = Math.max(e.frozen, seconds);
    }

    /** Zieht ein noch nicht gesehenes Item aus einem Pool (Fallbacks: beliebiger Pool, dann alles) */
    rollItem(pool) {
      const all = Object.keys(B.ITEMS);
      let cands = all.filter((id) => !this.seenItems.has(id) && (B.ITEMS[id].pools || []).includes(pool));
      if (!cands.length) cands = all.filter((id) => !this.seenItems.has(id) && (B.ITEMS[id].pools || []).length);
      if (!cands.length) cands = all;
      const id = this.rng.pick(cands);
      this.seenItems.add(id);
      return id;
    }

    // =========================================================================
    // Update
    // =========================================================================

    update(dt) {
      const inp = B.input;
      if (inp.pressed('KeyM')) B.audio.toggleMute();
      if (inp.pressed('F2')) B.debug.enabled = !B.debug.enabled;
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeI = 0; }
      if (this.bannerState) { this.bannerState.t -= dt; if (this.bannerState.t <= 0) this.bannerState = null; }

      switch (this.state) {
        case 'title':
          if (inp.pressed('Enter') || inp.pressed('Space') || inp.pressed('NumpadEnter')) this.newRun(B.params.seed || B.randomSeed());
          break;

        case 'floorCard':
          this.stateT -= dt;
          if (this.stateT <= 0 || (this.stateT < 1.8 && inp.anyPressed() && !inp.pressed('KeyM'))) this.setState('play');
          break;

        case 'roomTransition':
          this.transition.t += dt;
          if (this.transition.t >= this.transition.dur) {
            this.transition = null;
            if (this.pendingBossIntro) {
              this.pendingBossIntro = false;
              this.setState('bossIntro', 2.2);
              B.bus.emit('bossIntro', { game: this });
            } else this.setState('play');
          }
          break;

        case 'bossIntro':
          this.stateT -= dt;
          if (this.stateT <= 0 || (this.stateT < 1.5 && inp.anyPressed())) this.setState('play');
          break;

        case 'floorTransition':
          this.stateT -= dt;
          if (this.stateT <= 0) this.enterFloor(this.depth + 1);
          break;

        case 'pause':
          if (inp.pressed('Escape') || inp.pressed('KeyP')) this.setState('play');
          this.updateRestartHold(dt);
          break;

        case 'dead':
          this.stateT += dt;
          // Effekte (Partikel) weiterlaufen lassen
          for (const fx of this.room.effects) fx.update(dt, this);
          this.room.effects = this.room.effects.filter((fx) => !fx.dead);
          if (this.stateT > 0.8 && (inp.pressed('KeyR') || inp.pressed('Enter'))) this.newRun(B.randomSeed());
          break;

        case 'play':
          this.updatePlay(dt);
          break;
      }
    }

    /** R gedrueckt halten (1 s) startet einen neuen Run */
    updateRestartHold(dt) {
      if (B.input.down('KeyR')) {
        this.restartHold += dt;
        if (this.restartHold > 1) { this.restartHold = 0; this.newRun(B.randomSeed()); }
      } else this.restartHold = 0;
    }

    updatePlay(dt) {
      const inp = B.input;
      const p = this.player;
      if (inp.pressed('Escape') || inp.pressed('KeyP')) { this.setState('pause'); return; }
      if (inp.pressed('KeyE')) p.placeBomb(this);
      if (inp.pressed('Space')) p.useActive(this);
      this.updateRestartHold(dt);
      if (B.debug.enabled) B.debug.handleKeys(this);
      if (this.state !== 'play') return;

      this.runStats.time += dt;
      if (this.hudGlitch && (this.hudGlitch.t -= dt) <= 0) this.hudGlitch = null;
      p.update(dt, this);

      // Flow-Field zum Spieler regelmaessig aktualisieren (Pfadfindung der Laeufer)
      this.flowTimer -= dt;
      if (this.flowTimer <= 0) {
        this.room.updateFlow(p.x, p.y);
        this.flowTimer = 0.15;
      }

      this.room.update(dt, this);
      for (const f of this.followers) if (!f.dead) f.update(dt, this);
      this.followers = this.followers.filter((f) => !f.dead);
      if (this.state !== 'play') return; // z. B. Tod waehrend des Updates

      // Stacheln
      if (!p.flying) {
        const tile = this.room.worldToTile(p.x, p.y + p.r * 0.5);
        if (this.room.tileAt(tile.c, tile.r) === T.SPIKES) p.hurt(1, 'a spike (it was in the layout)', this);
      }

      // Raum geschafft?
      const room = this.room;
      if (!room.cleared && room.populated && !room.hasLivingEnemies()) this.onRoomClear(room);

      this.checkDoors();
    }

    /** Verschlossene Tueren mit Approval oeffnen; durch offene Tueren in den Nachbarraum wechseln */
    checkDoors() {
      const p = this.player;
      const room = this.room;
      if (this.lockDeniedT > 0) this.lockDeniedT -= B.C.DT;
      for (const dir of Object.keys(room.doors)) {
        const door = room.doors[dir];
        const dt = DOOR_TILES[dir];
        const tc = room.tileCenter(dt.col, dt.row);
        // Verschlossene Tuer beruehrt?
        if (door.edge.locked && !door.edge.hidden && !room.combatClosed) {
          if (B.M.dist(p.x, p.y, tc.x, tc.y) < TILE / 2 + p.r + 6) {
            if (p.approvals > 0) {
              p.approvals--;
              door.edge.locked = false;
              room.bgDirty = true;
              door.target.room.bgDirty = true;
              B.bus.emit('unlock', { game: this });
            } else if (this.lockDeniedT <= 0) {
              this.lockDeniedT = 1.5;
              this.banner('Needs an Approval', 'This door requires one LGTM. You have zero friends.');
              B.bus.emit('denied', { game: this, reason: 'locked' });
            }
          }
        }
        if (!room.doorOpen(dir)) continue;
        // Weit genug in die Tueroeffnung gelaufen?
        const threshold = 34;
        if ((dir === 'up' && p.y < threshold) || (dir === 'down' && p.y > ROOM_H - threshold) ||
            (dir === 'left' && p.x < threshold) || (dir === 'right' && p.x > ROOM_W - threshold)) {
          this.changeRoom(dir);
          return;
        }
      }
    }
  }

  // ===========================================================================
  // Debug-Hilfen (F2 oder ?debug). Auch fuer automatisierte Tests (window.BOTA.debug.*).
  // ===========================================================================
  B.debug = {
    enabled: B.params.debug,
    revealMap: false,
    get game() { return B.game; },
    god(on) { const p = B.game.player; p.god = on === undefined ? !p.god : !!on; return p.god; },
    giveItem(id) { const g = B.game; const pick = id || g.rng.pick(Object.keys(B.ITEMS)); g.player.giveItem(pick, g); return pick; },
    spawn(id, x, y) { const g = B.game; return g.spawnEnemy(id, x || ROOM_W / 2, y || ROOM_H / 2); },
    spawnBoss(id, x, y) { const g = B.game; return g.spawnBoss(id, x || ROOM_W / 2, y || TILE * 3); },
    killAll() { const g = B.game; for (const e of g.room.enemies.slice()) e.die(g); },
    nextFloor() { const g = B.game; g.setState('play'); g.nextFloor(); },
    reveal() { this.revealMap = !this.revealMap; },
    gotoRoom(type) { const g = B.game; const c = g.floor.findType(type); if (c) g.teleport(c.room); return !!c; },
    resources(n) { const p = B.game.player; p.credits = p.pushes = p.approvals = n || 10; p.health = p.maxHealth; },
    handleKeys(game) {
      const inp = B.input;
      if (inp.pressed('KeyG')) this.god();
      if (inp.pressed('KeyI')) this.giveItem();
      if (inp.pressed('KeyK')) this.killAll();
      if (inp.pressed('KeyN')) this.nextFloor();
      if (inp.pressed('KeyV')) this.reveal();
      if (inp.pressed('KeyB')) this.gotoRoom('boss');
      if (inp.pressed('KeyT')) this.gotoRoom('treasure');
      if (inp.pressed('KeyH')) this.resources(10);
    },
  };

  B.Game = Game;
})(window.BOTA);
