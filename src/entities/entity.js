/*
 * entity.js — Basisklasse fuer alles, was sich bewegt: Kreis-Kollider, Kachelkollision, Knockback, Treffer-Blitz.
 */
'use strict';

(function (B) {
  const { TILE } = B.C;

  class Entity {
    constructor(x, y, r) {
      this.x = x;
      this.y = y;
      this.r = r;          // Kollisionsradius
      this.vx = 0;         // gewollte Geschwindigkeit (px/s)
      this.vy = 0;
      this.kbx = 0;        // Knockback-Geschwindigkeit, klingt exponentiell ab
      this.kby = 0;
      this.flying = false;
      this.isPlayer = false;
      this.dead = false;
      this.flash = 0;      // Sekunden Treffer-Blitz (weisse Silhouette)
      this.t = 0;          // Lebenszeit / Animationsuhr
    }

    /** Stoss in Richtung (dx, dy) mit Staerke force (px/s) */
    knockback(dx, dy, force) {
      const n = B.M.norm(dx, dy);
      this.kbx += n.x * force;
      this.kby += n.y * force;
    }

    /**
     * Bewegt die Entity um (v + Knockback) * dt und loest Kollisionen mit soliden Kacheln auf.
     * Gibt true zurueck, wenn eine Kollision stattfand (nuetzlich fuer Abprall-Verhalten).
     */
    moveAndCollide(dt, room) {
      const mode = this.flying ? 'fly' : 'walk';
      const dx = (this.vx + this.kbx) * dt;
      const dy = (this.vy + this.kby) * dt;
      // Knockback abklingen lassen (ca. 90 % in 0.25 s)
      const decay = Math.exp(-10 * dt);
      this.kbx *= decay;
      this.kby *= decay;

      // Teilschritte gegen Tunneln bei hoher Geschwindigkeit
      const steps = Math.min(8, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (this.r * 0.5))));
      let hit = false;
      for (let i = 0; i < steps; i++) {
        this.x += dx / steps;
        this.y += dy / steps;
        if (this.resolveTiles(room, mode)) hit = true;
      }
      return hit;
    }

    /** Schiebt die Entity aus allen ueberlappenden soliden Kacheln heraus */
    resolveTiles(room, mode) {
      let hit = false;
      for (let iter = 0; iter < 2; iter++) {
        const c0 = Math.floor((this.x - this.r) / TILE), c1 = Math.floor((this.x + this.r) / TILE);
        const r0 = Math.floor((this.y - this.r) / TILE), r1 = Math.floor((this.y + this.r) / TILE);
        let moved = false;
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            if (!room.isSolid(c, r, mode, this.isPlayer)) continue;
            const p = B.M.circleRectPush(this.x, this.y, this.r, c * TILE, r * TILE, TILE, TILE);
            if (p) {
              this.x += p.x;
              this.y += p.y;
              hit = moved = true;
            }
          }
        }
        if (!moved) break;
      }
      return hit;
    }

    /** Distanz zu einer anderen Entity */
    distTo(o) { return B.M.dist(this.x, this.y, o.x, o.y); }
  }

  B.Entity = Entity;
})(window.BOTA);
