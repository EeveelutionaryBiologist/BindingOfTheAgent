/*
 * math.js — Kleine Mathe-/Kollisionshelfer. Alles unter BOTA.M.
 */
'use strict';

(function (B) {
  const M = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** Naehert v an target mit maximaler Schrittweite step an */
    approach(v, target, step) {
      if (v < target) return Math.min(v + step, target);
      return Math.max(v - step, target);
    },
    dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    len(x, y) { return Math.hypot(x, y); },
    /** Normalisiert (x, y); gibt {x:0,y:0} bei Nullvektor zurueck */
    norm(x, y) {
      const l = Math.hypot(x, y);
      return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
    },
    angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
    fromAngle(a, len = 1) { return { x: Math.cos(a) * len, y: Math.sin(a) * len }; },
    /** Kleinste Winkeldifferenz (b - a) im Bereich [-PI, PI] */
    angleDiff(a, b) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    /** Kreis-Kreis-Ueberlappung */
    circlesOverlap(a, b, extra = 0) {
      const r = a.r + b.r + extra;
      return M.dist2(a.x, a.y, b.x, b.y) < r * r;
    },
    /**
     * Kreis gegen achsenparalleles Rechteck. Gibt den Push-Out-Vektor zurueck (oder null ohne Ueberlappung).
     * rx, ry = linke obere Ecke; rw, rh = Groesse.
     */
    circleRectPush(cx, cy, r, rx, ry, rw, rh) {
      const nx = M.clamp(cx, rx, rx + rw);
      const ny = M.clamp(cy, ry, ry + rh);
      let dx = cx - nx, dy = cy - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return null;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = r - d;
        return { x: (dx / d) * push, y: (dy / d) * push };
      }
      // Mittelpunkt liegt im Rechteck: entlang der kuerzesten Achse herausschieben
      const left = cx - rx, right = rx + rw - cx, top = cy - ry, bottom = ry + rh - cy;
      const m = Math.min(left, right, top, bottom);
      if (m === left) return { x: -(left + r), y: 0 };
      if (m === right) return { x: right + r, y: 0 };
      if (m === top) return { x: 0, y: -(top + r) };
      return { x: 0, y: bottom + r };
    },
  };

  B.M = M;
})(window.BOTA);
