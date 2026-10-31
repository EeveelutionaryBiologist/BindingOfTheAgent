/*
 * rng.js — Deterministischer Zufallszahlengenerator (mulberry32) + String-Hash.
 *
 * Dungeon-Generierung nutzt eigene RNG-Instanzen pro Etage (reproduzierbar ueber den Seed),
 * das Gameplay (Drops, KI) nutzt game.rng.
 * Hinweis: NICHT kryptografisch sicher — nur fuer Spielzwecke gedacht.
 */
'use strict';

(function (B) {
  /** FNV-1a 32-bit Hash eines Strings -> unsigned int */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  class RNG {
    constructor(seed) {
      // Seed darf Zahl oder String sein
      this.state = (typeof seed === 'string' ? hashString(seed) : (seed >>> 0)) || 0x9e3779b9;
    }

    /** Gleichverteilte Zahl in [0, 1) */
    next() {
      let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Fliesskommazahl in [a, b) */
    float(a = 0, b = 1) { return a + (b - a) * this.next(); }

    /** Ganzzahl in [a, b] (inklusive) */
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }

    /** true mit Wahrscheinlichkeit p */
    chance(p) { return this.next() < p; }

    /** Zufaelliges Element eines Arrays (undefined bei leerem Array) */
    pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }

    /** Gewichtete Auswahl: weightFn(element) -> Gewicht >= 0 */
    weighted(arr, weightFn) {
      let total = 0;
      for (const x of arr) total += Math.max(0, weightFn(x));
      if (total <= 0) return this.pick(arr);
      let r = this.next() * total;
      for (const x of arr) {
        r -= Math.max(0, weightFn(x));
        if (r < 0) return x;
      }
      return arr[arr.length - 1];
    }

    /** Fisher-Yates-Shuffle (in place), gibt das Array zurueck */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    /** Zufaelliger Winkel in Radiant */
    angle() { return this.next() * Math.PI * 2; }
  }

  /** Erzeugt einen menschenlesbaren Run-Seed (z. B. "K7QX-2M9A"). Math.random genuegt hier. */
  function randomSeed() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) s += '-';
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  B.RNG = RNG;
  B.hashString = hashString;
  B.randomSeed = randomSeed;
})(window.BOTA);
