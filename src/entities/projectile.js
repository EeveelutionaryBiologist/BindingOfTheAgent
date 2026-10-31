/*
 * projectile.js — Schuesse beider Teams und Bomben ("Force Push").
 *
 * Projektil-Optionen (game.spawnProjectile(opts)):
 *   x, y, vx, vy      Position & Geschwindigkeit (px/s)
 *   team              'player' | 'enemy'
 *   damage            Schaden (Spieler-Team) bzw. halbe Herzen (Gegner-Team, Default 1)
 *   r                 Radius (Default 9 bzw. 8)
 *   range             Flugdistanz in px, danach faellt es herunter
 *   flags             { piercing, homing, spectral, bounce, wobble, split }
 *   color             Fuellfarbe (Fallback, falls kein Sprite)
 *   sprite            optionaler Sprite-Name
 *   knockback         Stossstaerke beim Treffer (Default 160)
 *   source            Name des Verursachers (fuer "Killed by")
 *   isChild           Abspaltung (spaltet sich nicht weiter)
 */
'use strict';

(function (B) {
  class Projectile extends B.Entity {
    constructor(o) {
      const isEnemy = o.team === 'enemy';
      super(o.x, o.y, o.r || (isEnemy ? 8 : 9));
      this.team = o.team || 'player';
      this.vx = o.vx || 0;
      this.vy = o.vy || 0;
      this.damage = o.damage !== undefined ? o.damage : 1;
      this.range = o.range || (isEnemy ? 700 : 420);
      this.travel = 0;
      this.flags = Object.assign({}, o.flags || {});
      this.color = o.color || (isEnemy ? B.COLORS.shotEnemy : B.COLORS.shotPlayer);
      this.sprite = o.sprite || null;
      this.knockbackForce = o.knockback !== undefined ? o.knockback : 160;
      this.source = o.source || (isEnemy ? 'a stray projectile' : 'Claude');
      this.isChild = !!o.isChild;
      this.bounces = 0;
      this.hitSet = new Set(); // bereits getroffene Gegner (fuer Durchschuss)
      this.wobblePhase = Math.random() * Math.PI * 2;
    }

    get speed() { return Math.hypot(this.vx, this.vy); }

    update(dt, game) {
      this.t += dt;
      const room = game.room;

      // Zielsuchend: Richtung sanft zum naechsten Gegner drehen
      if (this.flags.homing && this.team === 'player') {
        let best = null, bestD = 380;
        for (const e of room.enemies) {
          if (e.dead || e.intangible) continue;
          const d = B.M.dist(this.x, this.y, e.x, e.y);
          if (d < bestD) { best = e; bestD = d; }
        }
        if (best) {
          const cur = Math.atan2(this.vy, this.vx);
          const want = Math.atan2(best.y - this.y, best.x - this.x);
          const turn = B.M.clamp(B.M.angleDiff(cur, want), -5 * dt, 5 * dt);
          const sp = this.speed;
          this.vx = Math.cos(cur + turn) * sp;
          this.vy = Math.sin(cur + turn) * sp;
        }
      }

      // Effektive Geschwindigkeit (Wackeln = seitlicher Sinus-Anteil)
      let evx = this.vx, evy = this.vy;
      if (this.flags.wobble) {
        const n = B.M.norm(-this.vy, this.vx);
        const w = Math.cos(this.t * 14 + this.wobblePhase) * 150;
        evx += n.x * w;
        evy += n.y * w;
      }

      // Bewegung mit Kachelkollision (Mittelpunkt-Test, achsenweise fuer Abprallen)
      const mode = this.flags.spectral ? 'spectral' : 'shot';
      const nx = this.x + evx * dt;
      if (room.isSolidAt(nx, this.y, mode, false)) {
        if (this.flags.bounce && this.bounces < 3) { this.vx = -this.vx; this.bounces++; }
        else return this.die(game, true);
      } else this.x = nx;
      const ny = this.y + evy * dt;
      if (room.isSolidAt(this.x, ny, mode, false)) {
        if (this.flags.bounce && this.bounces < 3) { this.vy = -this.vy; this.bounces++; }
        else return this.die(game, true);
      } else this.y = ny;

      this.travel += Math.hypot(evx, evy) * dt;
      if (this.travel >= this.range) return this.die(game, false);

      if (this.team === 'player') this.collideEnemies(game);
      else this.collidePlayer(game);
    }

    collideEnemies(game) {
      const player = game.player;
      for (const e of game.room.enemies) {
        if (e.dead || e.intangible || this.hitSet.has(e)) continue;
        if (!B.M.circlesOverlap(this, e)) continue;
        this.hitSet.add(e);
        const applied = e.hurt(this.damage, game, this);
        if (applied && !e.noKnockback) e.knockback(this.vx, this.vy, this.knockbackForce);
        if (player) player.fireHook('onHitEnemy', e, this, game);
        if (this.flags.split && !this.isChild) this.split(game);
        if (!this.flags.piercing) { this.die(game, true); return; }
      }
    }

    collidePlayer(game) {
      const p = game.player;
      if (!p || p.dead) return;
      // Orbitale/Familiars mit blocksShots fangen Projektile ab
      for (const f of game.followers) {
        if (f.blocksShots && !f.dead && B.M.circlesOverlap(this, f)) { this.die(game, true); return; }
      }
      // Etwas kleinere Hitbox fuer den Spieler (fairer)
      if (B.M.dist(this.x, this.y, p.x, p.y) < this.r + p.r * 0.7) {
        p.hurt(this.damage || 1, this.source, game);
        this.die(game, true);
      }
    }

    /** "Microservices": zerfaellt in 4 kleine Projektile */
    split(game) {
      const sp = Math.max(240, this.speed * 0.8);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        game.spawnProjectile({
          x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          team: this.team, damage: this.damage * 0.5, r: Math.max(4, this.r * 0.6),
          range: 160, flags: { spectral: this.flags.spectral }, color: this.color, isChild: true,
        });
      }
    }

    /** impact = gegen etwas geprallt (Spritzer) vs. Reichweite erreicht (herunterfallen) */
    die(game, impact) {
      if (this.dead) return;
      this.dead = true;
      B.bus.emit('projectileEnd', { game, x: this.x, y: this.y, color: this.color, team: this.team, impact });
    }

    draw(ctx) {
      // Schatten
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 14, this.r * 0.8, this.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      if (this.sprite && B.hasSprite(this.sprite)) {
        B.drawSprite(ctx, this.sprite, this.x, this.y, { rotation: Math.atan2(this.vy, this.vx) });
        return;
      }
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Bomb — "git push --force". Liegt in room.projectiles (eigene update/draw-Logik), explodiert nach Zuendzeit.
   */
  class Bomb extends B.Entity {
    constructor(x, y, opts) {
      super(x, y, 16);
      const o = opts || {};
      this.fuse = o.fuse || 1.5;
      this.radius = o.radius || 110;
      this.damage = o.damage || 30;
      this.team = 'none';
    }

    update(dt, game) {
      this.t += dt;
      this.fuse -= dt;
      this.moveAndCollide(dt, game.room);
      if (this.fuse <= 0) {
        this.dead = true;
        game.explode(this.x, this.y, this.radius, this.damage, 'your own git push --force');
      }
    }

    draw(ctx) {
      if (B.hasSprite('bomb')) {
        const blink = this.fuse < 0.6 ? Math.floor(this.t * 16) % 2 === 0 : Math.floor(this.t * 6) % 2 === 0;
        B.drawSprite(ctx, 'bomb', this.x, this.y, { flash: blink });
        return;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 14, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
      ctx.fill();
      const blink = Math.floor(this.t * (this.fuse < 0.6 ? 16 : 6)) % 2 === 0;
      ctx.fillStyle = blink ? '#ff5544' : '#ffcc66';
      ctx.beginPath();
      ctx.arc(this.x + 6, this.y - 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  B.Projectile = Projectile;
  B.Bomb = Bomb;
})(window.BOTA);
