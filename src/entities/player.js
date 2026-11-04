/*
 * player.js — Der Spieler (Claude-Avatar): Bewegung, Schiessen, Gesundheit, Items, Item-Hooks.
 *
 * Gesundheit wird in HALBEN Herzen gezaehlt (health 6 = 3 Herzen).
 * Stats werden bei jeder Item-Aenderung aus BASE + Items neu berechnet (recalcStats).
 */
'use strict';

(function (B) {
  // Basiswerte — siehe DESIGN.md §5
  const BASE = {
    speed: 1.0,       // Multiplikator auf 240 px/s
    damage: 3.5,
    fireDelay: 0.38,  // Sekunden zwischen Schuessen
    shotSpeed: 1.0,   // Multiplikator auf 480 px/s
    range: 420,       // px
    shotSize: 1.0,    // Multiplikator auf 9 px Radius
    luck: 0,
  };
  const LIMITS = {
    speed: [0.4, 2.0], damage: [0.5, 99], fireDelay: [0.08, 3], shotSpeed: [0.4, 3],
    range: [120, 1400], shotSize: [0.4, 4], luck: [-10, 20],
  };
  const SHOT_FLAGS = ['piercing', 'homing', 'spectral', 'bounce', 'wobble', 'split'];
  const MAX_HALVES = 24; // max. 12 Herzen insgesamt

  class Player extends B.Entity {
    constructor(x, y) {
      super(x, y, 20);
      this.isPlayer = true;

      // Gesundheit (halbe Herzen)
      this.maxHealth = 6;
      this.health = 6;
      this.guardrails = 0;   // blaue Herzen

      // Ressourcen
      this.credits = 0;      // "Muenzen"
      this.pushes = 1;       // "Bomben" (git push --force)
      this.approvals = 0;    // "Schluessel" (LGTM)

      // Items
      this.items = [];       // passive Item-IDs (Reihenfolge = Aufsammelreihenfolge)
      this.active = null;    // { id, charge }
      this.itemState = {};   // freier Zustand pro Item-ID (fuer Hooks, z. B. "schon benutzt")
      this.bonus = {};       // permanente additive Stat-Boni aus Hooks (z. B. Off-by-One)

      // Abgeleitete Werte
      this.stats = Object.assign({}, BASE);
      this.flags = { multishot: 1 };

      // Kampf-/Animationszustand
      this.fireCooldown = 0;
      this.invuln = 0;
      this.god = false;
      this.facing = 'down';
      this.shootAnim = 0;
      this.walkAnim = 0;
      this.holdItem = null;  // { id, t } — Item ueber dem Kopf nach dem Aufheben
      this.killedBy = null;
      // Verlangsamung von aussen fuer den NAECHSTEN Bewegungsschritt (1 = keine), gesetzt ueber slowBy() —
      // z. B. von der Pfuetze des Overflow Buffers. update() verbraucht den Wert und setzt ihn auf 1 zurueck.
      this.slowNext = 1;

      this.recalcStats();
    }

    // -------------------------------------------------------------------------
    // Stats & Items
    // -------------------------------------------------------------------------

    /** Berechnet stats/flags aus BASE + Boni + allen passiven Items neu. */
    recalcStats() {
      const s = Object.assign({}, BASE);
      const mult = {};
      const flags = { multishot: 1, orbitals: 0, familiars: 0 };
      const addAll = (add) => { for (const k in add) if (typeof add[k] === 'number') s[k] = (s[k] || 0) + add[k]; };
      const multAll = (m) => { for (const k in m) if (typeof m[k] === 'number') mult[k] = (mult[k] === undefined ? 1 : mult[k]) * m[k]; };

      addAll(this.bonus);
      for (const id of this.items) {
        const def = B.ITEMS[id];
        if (!def) continue;
        if (def.add) addAll(def.add);
        if (def.mult) multAll(def.mult);
        if (def.flags) {
          for (const k in def.flags) {
            const v = def.flags[k];
            if (typeof v === 'boolean') flags[k] = flags[k] || v;
            else if (k === 'multishot') flags[k] = Math.max(flags[k] || 1, v);
            else if (typeof v === 'number') flags[k] = (flags[k] || 0) + v;
          }
        }
        if (typeof def.dynamic === 'function') {
          try {
            const d = def.dynamic(this) || {};
            if (d.add) addAll(d.add);
            if (d.mult) multAll(d.mult);
          } catch (e) { console.error('[item]', id, 'dynamic failed:', e); }
        }
      }
      for (const k in mult) if (k in s) s[k] *= mult[k];
      for (const k in LIMITS) s[k] = B.M.clamp(s[k], LIMITS[k][0], LIMITS[k][1]);

      this.stats = s;
      this.flags = flags;
      this.flying = !!flags.flying;
      this.floating = !!flags.floating;   // To the Moon: ueber Bodengefahren, aber nicht ueber Felsen und Gruben
    }

    /**
     * Ruft einen Hook auf allen Items (passiv + aktiv) auf. Gibt die Rueckgabewerte als Array zurueck.
     * Fehler in einzelnen Items werden geloggt, brechen das Spiel aber nicht ab.
     */
    fireHook(name, ...args) {
      const results = [];
      const ids = this.active ? this.items.concat([this.active.id]) : this.items;
      for (const id of ids) {
        const def = B.ITEMS[id];
        if (!def || typeof def[name] !== 'function') continue;
        try { results.push(def[name](this, ...args)); } catch (e) { console.error('[item]', id, name, 'failed:', e); }
      }
      return results;
    }

    /**
     * Gibt dem Spieler ein Item. Bei aktiven Items wird das bisherige zurueckgegeben (fuer den Tausch am Podest).
     * @returns {string|null} ID des abgelegten aktiven Items
     */
    giveItem(id, game) {
      const def = B.ITEMS[id];
      if (!def) { console.warn('[player] unknown item', id); return null; }
      let dropped = null;
      if (def.active) {
        if (this.active) dropped = this.active.id;
        this.active = { id, charge: def.maxCharge || 0 }; // neue Aktiv-Items kommen voll geladen
      } else {
        this.items.push(id);
      }
      this.itemState[id] = this.itemState[id] || {};
      if (typeof def.onPickup === 'function') {
        try { def.onPickup(this, game); } catch (e) { console.error('[item]', id, 'onPickup failed:', e); }
      }
      this.recalcStats();
      if (B.syncFollowers) B.syncFollowers(game);
      this.holdItem = { id, t: 1.1 };
      if (game) game.banner(def.name, def.tagline || '');
      B.bus.emit('itemGet', { game, id, def, x: this.x, y: this.y });
      return dropped;
    }

    hasItem(id) { return this.items.includes(id) || (this.active && this.active.id === id); }

    // -------------------------------------------------------------------------
    // Gesundheit
    // -------------------------------------------------------------------------

    /**
     * Schaden in halben Herzen. source = Name fuer "Killed by".
     * @returns {boolean} true, wenn Schaden angewendet wurde
     */
    hurt(amount, source, game) {
      if (this.dead || this.invuln > 0 || this.god || amount <= 0) return false;
      let a = amount;
      if (this.guardrails > 0) {
        const absorbed = Math.min(this.guardrails, a);
        this.guardrails -= absorbed;
        a -= absorbed;
      }
      this.health -= a;
      this.invuln = 1.0;
      this.flash = 0.15;
      this.fireHook('onHurt', game);
      if (game) game.shake(8, 0.25);
      B.bus.emit('playerHurt', { game, amount, source, x: this.x, y: this.y });

      if (this.health <= 0 && this.guardrails <= 0) {
        this.health = 0;
        const saved = this.fireHook('onLethal', game).some((r) => r === true);
        if (saved) {
          if (this.health <= 0) this.health = 2; // Item hat "gerettet", aber keine HP gesetzt
        } else {
          this.dead = true;
          this.killedBy = source || 'something';
          if (game) game.onPlayerDeath(this.killedBy);
        }
      }
      this.recalcStats(); // zustandsabhaengige Items (z. B. git blame)
      return true;
    }

    /** Heilt um halves halbe Herzen. Gibt true zurueck, wenn tatsaechlich geheilt wurde. */
    heal(halves) {
      if (this.health >= this.maxHealth) return false;
      this.health = Math.min(this.maxHealth, this.health + halves);
      this.recalcStats();
      return true;
    }

    /** Fuegt n Herzcontainer hinzu (negativ = entfernt; mindestens 1 Herz bleibt) */
    addHeartContainers(n) {
      const before = this.maxHealth;
      this.maxHealth = B.M.clamp(this.maxHealth + n * 2, 2, MAX_HALVES);
      const diff = this.maxHealth - before;
      if (diff > 0) this.health += diff;
      this.health = Math.min(this.health, this.maxHealth);
      this.guardrails = Math.min(this.guardrails, MAX_HALVES - this.maxHealth);
      this.recalcStats();
    }

    /** Fuegt blaue "Guardrail"-Herzen hinzu (halbe Herzen). Gibt false zurueck, wenn kein Platz. */
    addGuardrails(halves) {
      const cap = MAX_HALVES - this.maxHealth;
      if (this.guardrails >= cap) return false;
      this.guardrails = Math.min(cap, this.guardrails + halves);
      return true;
    }

    // -------------------------------------------------------------------------
    // Aktive Items & Bomben
    // -------------------------------------------------------------------------

    chargeActive(n) {
      if (!this.active) return;
      const def = B.ITEMS[this.active.id];
      if (!def) return;
      const before = this.active.charge;
      this.active.charge = Math.min(def.maxCharge || 0, this.active.charge + n);
      if (before < (def.maxCharge || 0) && this.active.charge >= (def.maxCharge || 0)) {
        B.bus.emit('activeCharged', { id: this.active.id });
      }
    }

    useActive(game) {
      if (!this.active) return;
      const def = B.ITEMS[this.active.id];
      if (!def || typeof def.use !== 'function') return;
      if (this.active.charge < (def.maxCharge || 0)) { B.bus.emit('denied', { game, reason: 'charge' }); return; }
      let used = true;
      try { used = def.use(this, game) !== false; } catch (e) { console.error('[item]', this.active.id, 'use failed:', e); used = false; }
      if (used) {
        this.active.charge = 0;
        B.bus.emit('activeUsed', { game, id: this.active.id, def });
      }
    }

    /**
     * Verlangsamt den Spieler fuer den naechsten Tick auf factor (0..1) seines Tempos. Mehrere Quellen im selben
     * Tick stapeln NICHT: es gilt der staerkste einzelne Faktor (Minimum), nie ein Produkt. Fliegende Spieler
     * (flags.flying, z. B. The Cloud) und schwebende (flags.floating, To the Moon) bleiben ueber Pfuetzen unberuehrt.
     * Wer bremsen will, ruft das jeden Tick auf (z. B. overflow_puddle in enemies-context.js).
     */
    slowBy(factor) {
      if (this.flying || this.floating || !(factor >= 0 && factor < 1)) return;
      if (factor < this.slowNext) this.slowNext = factor;
    }

    placeBomb(game) {
      if (this.pushes <= 0) { B.bus.emit('denied', { game, reason: 'bomb' }); return; }
      this.pushes--;
      game.room.projectiles.push(new B.Bomb(this.x, this.y + 4));
      B.bus.emit('bombPlaced', { game, x: this.x, y: this.y });
    }

    // -------------------------------------------------------------------------
    // Update & Schiessen
    // -------------------------------------------------------------------------

    update(dt, game) {
      this.t += dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.shootAnim > 0) this.shootAnim -= dt;
      if (this.holdItem) { this.holdItem.t -= dt; if (this.holdItem.t <= 0) this.holdItem = null; }

      // Bewegung mit Beschleunigung/Reibung (fuehlt sich "rutschig, aber praezise" an)
      const mv = B.input.moveVector();
      // Aeussere Verlangsamung gilt genau einen Tick (Quellen muessen sie jeden Tick neu setzen) und ist kein Stat
      const slow = this.slowNext;
      this.slowNext = 1;
      const maxSpeed = 240 * this.stats.speed * slow;
      const moving = mv.x !== 0 || mv.y !== 0;
      const k = 1 - Math.exp(-(moving ? 14 : 10) * dt);
      this.vx += (mv.x * maxSpeed - this.vx) * k;
      this.vy += (mv.y * maxSpeed - this.vy) * k;
      if (moving) {
        this.walkAnim += dt;
        if (!B.input.shootDir()) {
          this.facing = Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x < 0 ? 'left' : 'right') : (mv.y < 0 ? 'up' : 'down');
        }
      }
      this.moveAndCollide(dt, game.room);

      // Schiessen (4 Richtungen, zuletzt gedrueckte Pfeiltaste gewinnt)
      this.fireCooldown -= dt;
      const sd = B.input.shootDir();
      if (sd) {
        this.facing = sd;
        if (this.fireCooldown <= 0) {
          this.shoot(sd, game);
          this.fireCooldown = this.stats.fireDelay;
        }
      }

      this.fireHook('update', dt, game);
    }

    /** Feuert eine Salve in Richtung dir ('up'|'down'|'left'|'right') */
    shoot(dir, game) {
      const base = B.DIRS[dir];
      const angle = Math.atan2(base.dy, base.dx);
      const spd = 480 * this.stats.shotSpeed;
      const n = Math.max(1, this.flags.multishot | 0);
      const parallel = !!this.flags.parallel && n === 2;
      const spread = ((this.flags.spread || 12) * Math.PI) / 180;
      const shotFlags = {};
      for (const f of SHOT_FLAGS) if (this.flags[f]) shotFlags[f] = true;

      for (let i = 0; i < n; i++) {
        const off = i - (n - 1) / 2;
        let a = angle, ox = 0, oy = 0;
        if (parallel) { ox = -base.dy * off * 20; oy = base.dx * off * 20; } else a = angle + off * spread;
        const proj = game.spawnProjectile({
          x: this.x + ox + Math.cos(a) * 12,
          y: this.y - 10 + oy + Math.sin(a) * 12,
          vx: Math.cos(a) * spd + this.vx * 0.3,
          vy: Math.sin(a) * spd + this.vy * 0.3,
          team: 'player',
          damage: this.stats.damage,
          r: 9 * this.stats.shotSize,
          range: this.stats.range,
          flags: Object.assign({}, shotFlags),
          source: 'Claude',
        });
        this.fireHook('onShoot', proj, game);
      }
      this.shootAnim = 0.12;
      B.bus.emit('shoot', { game, player: this, dir });
    }

    // -------------------------------------------------------------------------
    // Darstellung
    // -------------------------------------------------------------------------

    draw(ctx) {
      // Blinken waehrend Unverwundbarkeit
      if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;
      const bob = Math.sin(this.walkAnim * 14) * (Math.hypot(this.vx, this.vy) > 30 ? 2 : 0);
      const squash = this.shootAnim > 0 ? 0.92 : 1;
      // [agent-C] Posen: Item-Jubel (Arme hoch) bzw. verletzt (erste ~0.45 s der Unverwundbarkeit).
      // Im Stand immer Frame 0, sonst "friert" ein Schritt-Frame des Laufzyklus ein.
      let dirName = 'player_' + this.facing;
      if (this.holdItem && B.hasSprite('player_itemget')) dirName = 'player_itemget';
      else if (this.invuln > 0.55 && B.hasSprite('player_hurt')) dirName = 'player_hurt';
      const name = B.hasSprite(dirName) ? dirName : 'player';
      const frame = Math.hypot(this.vx, this.vy) > 30 ? Math.floor(this.walkAnim * 8) : 0;
      // To the Moon: sichtbar ueber dem Schatten, damit man das Schweben erkennt (nur Optik, der Kollisionskreis bleibt)
      const hover = this.floating ? -7 + Math.sin(this.t * 3) * 2 : 0;
      B.drawSprite(ctx, name, this.x, this.y - 8 + bob + hover, {
        flash: this.flash > 0,
        flipX: name === 'player' && this.facing === 'left',
        scale: squash,
        frame,
      });
      // Item ueber dem Kopf halten (nach dem Aufheben)
      if (this.holdItem) {
        const def = B.ITEMS[this.holdItem.id];
        B.drawSprite(ctx, def ? def.sprite : '?', this.x, this.y - 60 + Math.sin(this.t * 6) * 2);
      }
    }
  }

  Player.BASE = BASE;
  B.Player = Player;
})(window.BOTA);
