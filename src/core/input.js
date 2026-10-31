/*
 * input.js — Tastatureingabe mit "gedrueckt in diesem Frame"-Flanken.
 *
 * - down(code):    Taste ist aktuell gehalten
 * - pressed(code): Taste wurde seit dem letzten Simulationsschritt neu gedrueckt
 * - moveVector():  WASD als normalisierter Vektor
 * - shootDir():    zuletzt gedrueckte, noch gehaltene Pfeiltaste ('up'|'down'|'left'|'right'|null)
 *
 * Codes sind KeyboardEvent.code-Werte (layoutunabhaengig: 'KeyW' ist auf QWERTZ dieselbe Taste).
 */
'use strict';

(function (B) {
  const held = new Set();
  const pressedSet = new Set();
  const arrowOrder = []; // Reihenfolge der gehaltenen Pfeiltasten (letzte gewinnt)

  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  // Tasten, deren Browser-Standardverhalten (Scrollen etc.) unterdrueckt wird
  const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F2']);

  function onKeyDown(e) {
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return; // Auto-Repeat ignorieren
    held.add(e.code);
    pressedSet.add(e.code);
    if (ARROWS[e.code]) {
      const i = arrowOrder.indexOf(e.code);
      if (i >= 0) arrowOrder.splice(i, 1);
      arrowOrder.push(e.code);
    }
    // Erste Benutzerinteraktion -> AudioContext freischalten (Browser-Autoplay-Policy)
    if (B.audio && B.audio.unlock) B.audio.unlock();
  }

  function onKeyUp(e) {
    held.delete(e.code);
    if (ARROWS[e.code]) {
      const i = arrowOrder.indexOf(e.code);
      if (i >= 0) arrowOrder.splice(i, 1);
    }
  }

  function clearAll() {
    held.clear();
    arrowOrder.length = 0;
  }

  B.input = {
    attach(target) {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      // Fokusverlust: alle Tasten loslassen, sonst "klebt" die Bewegung
      window.addEventListener('blur', clearAll);
    },
    down(code) { return held.has(code); },
    pressed(code) { return pressedSet.has(code); },
    /** Irgendeine Taste in diesem Schritt neu gedrueckt? */
    anyPressed() { return pressedSet.size > 0; },
    /** Nach jedem Simulationsschritt aufrufen */
    endStep() { pressedSet.clear(); },
    moveVector() {
      let x = 0, y = 0;
      if (held.has('KeyA')) x -= 1;
      if (held.has('KeyD')) x += 1;
      if (held.has('KeyW')) y -= 1;
      if (held.has('KeyS')) y += 1;
      return B.M.norm(x, y);
    },
    shootDir() {
      for (let i = arrowOrder.length - 1; i >= 0; i--) {
        if (held.has(arrowOrder[i])) return ARROWS[arrowOrder[i]];
      }
      return null;
    },
    /** Fuer automatisierte Tests: Tastendruck simulieren */
    _simulate(code, isDown) {
      if (isDown) onKeyDown({ code, repeat: false, preventDefault() {} });
      else onKeyUp({ code });
    },
  };
})(window.BOTA);
