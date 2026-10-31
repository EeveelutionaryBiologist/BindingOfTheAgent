/*
 * familiar.js — Begleiter (Rubber Duck) und Orbitale (Unit Tests).
 *
 * Vertrag:
 *   game.followers  — Array von Objekten mit update(dt, game), draw(ctx, game), x, y, r, dead,
 *                     optional blocksShots (faengt gegnerische Projektile ab; projectile.js prueft das).
 *   BOTA.syncFollowers(game) — wird nach jeder Item-Aenderung (player.giveItem) und bei Run-Start
 *                     aufgerufen und gleicht game.followers an player.flags an (anlegen/entfernen).
 *
 * Flags (summiert ueber alle Items, siehe data/items.js):
 *   flags.duck       Anzahl Rubber Ducks (folgen dem Spieler, schiessen mit)
 *   flags.unitTests  Anzahl Unit-Test-Orbitale (kreisen um den Spieler, blocken Schuesse)
 *
 * game.followers ueberlebt Raum- und Etagenwechsel; game.js setzt die Positionen beim Wechsel neu.
 * Begleiter kollidieren nicht mit Kacheln (sie "schweben"), damit sie nie irgendwo haengen bleiben.
 */
'use strict';

(function (B) {
  // ---------------------------------------------------------------------------
  // Rubber Duck — folgt mit Verzoegerung und schiesst schwache Schuesse in Schussrichtung
  // ---------------------------------------------------------------------------
  class Duck extends B.Entity {
    constructor(x, y) {
      super(x, y, 14);
      this.kind = 'duck';
      this.flying = true;      // Schatten etwas abgesetzt, keine Kachelkollision
      this.leader = null;      // wem die Ente folgt (Spieler oder vorherige Ente) — setzt syncFollowers
      this.followDist = 46;    // Abstand zum "Vordermann"
      this.cooldown = 0.3;
      this.facingLeft = false;
      this.quack = 0;          // kurze Squash-Animation nach einem Schuss
    }

    update(dt, game) {
      this.t += dt;
      const p = game.player;
      if (!p) return;
      const lead = this.leader && !this.leader.dead ? this.leader : p;

      // "Seil"-Verfolgung: nur nachziehen, wenn der Abstand zum Vordermann zu gross wird.
      // Dadurch entsteht eine natuerliche Schleppe statt starrer Position.
      const dx = this.x - lead.x, dy = this.y - lead.y;
      const d = Math.hypot(dx, dy);
      if (d > this.followDist) {
        const tx = lead.x + (dx / d) * this.followDist;
        const ty = lead.y + (dy / d) * this.followDist;
        const k = 1 - Math.exp(-9 * dt);
        const nx = this.x + (tx - this.x) * k;
        if (Math.abs(nx - this.x) > 0.3) this.facingLeft = nx < this.x;
        this.x = nx;
        this.y += (ty - this.y) * k;
      }
      // Zu nah dran (z. B. direkt nach dem Spawn oder Etagenwechsel, wo game.js alle Begleiter auf
      // den Spieler setzt): sanft auf einen Ruheplatz schraeg hinter dem Vordermann ausweichen,
      // sonst verdeckt der Spieler-Sprite die Ente komplett.
      if (d < this.followDist * 0.6) {
        const k = 1 - Math.exp(-6 * dt);
        this.x += (lead.x - 34 - this.x) * k;
        this.y += (lead.y + 16 - this.y) * k;
      }
      // Nie weiter als ~4 Abstaende zurueckfallen (z. B. nach Teleport im Debug-Modus)
      if (d > this.followDist * 4) { this.x = lead.x - 34; this.y = lead.y + 16; }

      if (this.quack > 0) this.quack -= dt;
      this.cooldown -= dt;
      const dir = B.input.shootDir();
      if (!dir || this.cooldown > 0 || p.dead) return;

      // Schwacher Schuss (~1/3 Schaden, langsamere Feuerrate) in die aktuelle Schussrichtung des Spielers
      const v = B.DIRS[dir];
      const spd = 420 * p.stats.shotSpeed;
      game.spawnProjectile({
        x: this.x + v.dx * 10,
        y: this.y - 6 + v.dy * 10,
        vx: v.dx * spd,
        vy: v.dy * spd,
        team: 'player',
        damage: Math.max(0.5, p.stats.damage / 3),
        r: 6,
        range: Math.max(200, p.stats.range * 0.85),
        color: '#f6d365',
        source: 'Rubber Duck',
      });
      this.cooldown = Math.max(0.45, p.stats.fireDelay * 1.8);
      this.quack = 0.12;
      if (v.dx) this.facingLeft = v.dx < 0;
      B.bus.emit('familiarShoot', { game, kind: 'duck', x: this.x, y: this.y });
    }

    draw(ctx) {
      const bob = Math.sin(this.t * 5) * 2;
      const squash = this.quack > 0 ? 0.88 : 1;
      if (!B.drawSpriteIfExists || !B.drawSpriteIfExists(ctx, 'familiar_duck', this.x, this.y - 10 + bob, {
        flipX: this.facingLeft, scale: squash, frame: Math.floor(this.t * 3),
      })) {
        // Fallback ohne Sprite: gelber Kreis mit Schnabel
        ctx.fillStyle = '#f6d365';
        ctx.beginPath(); ctx.arc(this.x, this.y - 10 + bob, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8892b';
        ctx.fillRect(this.x + (this.facingLeft ? -16 : 8), this.y - 12 + bob, 8, 4);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Unit Test — Orbital: kreist um den Spieler, blockt Gegnerschuesse, macht Kontaktschaden
  // ---------------------------------------------------------------------------
  const ORBIT_R = 58;       // Bahnradius in px
  const ORBIT_SPEED = 3.0;  // rad/s
  const ORBIT_DMG = 2;      // Kontaktschaden pro Tick
  const ORBIT_TICK = 0.35;  // Sekunden zwischen zwei Treffern am selben Gegner

  class UnitTest extends B.Entity {
    constructor(x, y) {
      super(x, y, 12);
      this.kind = 'unitTest';
      this.flying = true;
      this.blocksShots = true;
      this.slot = 0;            // Index unter allen Orbitalen (fuer gleichmaessige Verteilung)
      this.count = 1;           // Anzahl Orbitale insgesamt
      this.hitCd = new Map();   // Gegner -> verbleibende Abklingzeit (pro Raum)
      this.roomRef = null;
    }

    /** Position aus Spielerposition + gemeinsamem Winkel berechnen (auch beim Zeichnen genutzt) */
    place(game) {
      const p = game.player;
      if (!p) return;
      const a = UnitTest.phase + (this.slot / Math.max(1, this.count)) * Math.PI * 2;
      this.x = p.x + Math.cos(a) * ORBIT_R;
      this.y = p.y - 6 + Math.sin(a) * ORBIT_R * 0.9; // leicht elliptisch wirkt "von oben" besser
    }

    update(dt, game) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      // Der gemeinsame Winkel wird nur vom ersten Orbital weitergedreht (sonst zaehlt er n-fach)
      if (this.slot === 0) UnitTest.phase = (UnitTest.phase + ORBIT_SPEED * dt) % (Math.PI * 2);
      this.place(game);

      const room = game.room;
      if (!room) return;
      if (this.roomRef !== room) { this.hitCd.clear(); this.roomRef = room; } // neuer Raum -> Cooldowns weg

      // Gegnerische Projektile abfangen (projectile.js prueft das ebenfalls; hier zusaetzlich fuer
      // das Treffer-Feedback und unabhaengig von der Update-Reihenfolge)
      for (const pr of room.projectiles) {
        if (pr.dead || pr.team !== 'enemy' || !B.M.circlesOverlap(this, pr)) continue;
        if (typeof pr.die === 'function') pr.die(game, true); else pr.dead = true;
        this.flash = 0.1;
      }

      // Kontaktschaden an Gegnern, pro Gegner mit Abklingzeit
      for (const [e, cd] of this.hitCd) {
        if (cd - dt <= 0 || e.dead) this.hitCd.delete(e); else this.hitCd.set(e, cd - dt);
      }
      for (const e of room.enemies) {
        if (e.dead || e.intangible || this.hitCd.has(e)) continue;
        if (!B.M.circlesOverlap(this, e)) continue;
        e.hurt(ORBIT_DMG, game, null);
        this.hitCd.set(e, ORBIT_TICK);
        this.flash = 0.08;
      }
    }

    draw(ctx, game) {
      this.place(game); // waehrend Raumuebergaengen laeuft kein update -> Position hier nachziehen
      const bob = Math.sin(this.t * 6 + this.slot) * 1.5;
      if (!B.drawSpriteIfExists || !B.drawSpriteIfExists(ctx, 'orbital_test', this.x, this.y + bob, { flash: this.flash > 0 })) {
        ctx.fillStyle = this.flash > 0 ? '#fff' : '#5fbf6a';
        ctx.beginPath(); ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  UnitTest.phase = 0; // gemeinsamer Bahnwinkel aller Orbitale

  // ---------------------------------------------------------------------------
  // Abgleich Flags <-> game.followers
  // ---------------------------------------------------------------------------

  /** Art -> { Flag-Name, Fabrik }. Neue Begleiter-Arten hier eintragen. */
  const KINDS = [
    { kind: 'duck', flag: 'duck', make: (x, y) => new Duck(x - 34, y + 16) }, // schraeg hinter dem Spieler
    { kind: 'unitTest', flag: 'unitTests', make: (x, y) => new UnitTest(x, y) },
  ];

  B.syncFollowers = function (game) {
    const g = game || B.game;
    if (!g || !g.player) return;
    if (!Array.isArray(g.followers)) g.followers = [];
    const p = g.player;
    const flags = p.flags || {};

    for (const k of KINDS) {
      const want = Math.max(0, Math.min(8, Math.floor(flags[k.flag] || 0))); // Obergrenze gegen Unsinn
      const have = g.followers.filter((f) => f.kind === k.kind && !f.dead);
      // Fehlende anlegen (direkt beim Spieler)
      for (let i = have.length; i < want; i++) g.followers.push(k.make(p.x, p.y));
      // Ueberzaehlige entfernen (die zuletzt hinzugefuegten zuerst)
      for (let i = have.length - 1; i >= want; i--) have[i].dead = true;
    }
    g.followers = g.followers.filter((f) => !f.dead);

    // Enten bilden eine Kette (Ente 2 folgt Ente 1 usw.), Orbitale verteilen sich gleichmaessig
    const ducks = g.followers.filter((f) => f.kind === 'duck');
    ducks.forEach((d, i) => { d.leader = i === 0 ? null : ducks[i - 1]; });
    const orbs = g.followers.filter((f) => f.kind === 'unitTest');
    orbs.forEach((o, i) => { o.slot = i; o.count = orbs.length; });
  };

  B.Duck = Duck;
  B.UnitTest = UnitTest;
})(window.BOTA);
