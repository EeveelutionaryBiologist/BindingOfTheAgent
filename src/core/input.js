/*
 * input.js — Tastatureingabe mit "gedrueckt in diesem Frame"-Flanken.
 *
 * - down(code):    Taste ist aktuell gehalten
 * - pressed(code): Taste wurde seit dem letzten Simulationsschritt neu gedrueckt
 * - moveVector():  WASD als normalisierter Vektor
 * - shootDir():    zuletzt gedrueckte, noch gehaltene Pfeiltaste ('up'|'down'|'left'|'right'|null)
 * - textMode:      true = Texteingabe laeuft (nur Zustand 'seedEntry', gesetzt von game.setState)
 * - typed():       seit dem letzten Simulationsschritt getippte Eintraege, nur im textMode
 *
 * Codes sind KeyboardEvent.code-Werte (layoutunabhaengig: 'KeyW' ist auf QWERTZ dieselbe Taste). Fuer die Steuerung ist
 * das richtig, fuers Tippen aber falsch: Auf QWERTZ liefert die Taste mit dem Aufdruck Y den Code 'KeyZ'. Getippte
 * Zeichen kommen deshalb aus e.key, also aus dem, was auf der Taste steht.
 */
'use strict';

(function (B) {
  const held = new Set();
  const pressedSet = new Set();
  const arrowOrder = []; // Reihenfolge der gehaltenen Pfeiltasten (letzte gewinnt)
  const typedQueue = []; // Texteingabe: einzelne Zeichen, BACKSPACE oder ein gefilterter eingefuegter Text
  const TYPED_MAX = 64;  // mehr passt in einen Simulationsschritt nicht sinnvoll hinein
  const BACKSPACE = '\b';

  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  // Tasten, deren Browser-Standardverhalten (Scrollen etc.) unterdrueckt wird
  const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F2']);

  function onKeyDown(e) {
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (B.input.textMode) onTextKey(e);
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

  /**
   * Texteingabe: druckbare Zeichen und Backspace in die Warteschlange. Auto-Repeat zaehlt nur fuer Backspace, sonst
   * wuerde ein noch gehaltenes S (das den Eingabe-Dialog geoeffnet hat) gleich "SSSS" tippen. Mit Strg/Cmd/Alt
   * gedrueckte Tasten sind Kuerzel (Strg+V loest das paste-Ereignis aus) und tippen nichts.
   */
  function onTextKey(e) {
    if (typedQueue.length >= TYPED_MAX || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      typedQueue.push(BACKSPACE);
    } else if (!e.repeat && typeof e.key === 'string' && e.key.length === 1) {
      typedQueue.push(e.key);
    }
  }

  /**
   * Einfuegen ohne Eingabefeld: Der Browser liefert den Text nur im paste-Ereignis (keine Clipboard-API, also auch
   * keine Berechtigung). Ausserhalb des textMode wird das Ereignis gar nicht gelesen.
   */
  function onPaste(e) {
    if (!B.input.textMode) return;
    e.preventDefault();
    const clean = B.cleanSeed(e.clipboardData && e.clipboardData.getData('text'));
    if (clean && typedQueue.length < TYPED_MAX) typedQueue.push(clean);
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
    typedQueue.length = 0;
  }

  B.input = {
    textMode: false,
    BACKSPACE,
    attach(target) {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      window.addEventListener('paste', onPaste);
      // Fokusverlust: alle Tasten loslassen, sonst "klebt" die Bewegung
      window.addEventListener('blur', clearAll);
    },
    down(code) { return held.has(code); },
    pressed(code) { return pressedSet.has(code); },
    /** Irgendeine Taste in diesem Schritt neu gedrueckt? */
    anyPressed() { return pressedSet.size > 0; },
    /** Nach jedem Simulationsschritt aufrufen */
    endStep() { pressedSet.clear(); typedQueue.length = 0; },
    /** Getippte Eintraege dieses Schritts (Kopie): Zeichen, BACKSPACE oder eingefuegter, bereits gefilterter Text */
    typed() { return typedQueue.slice(); },
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
    _simulate(code, isDown, key) {
      if (isDown) onKeyDown({ code, key, repeat: false, preventDefault() {} });
      else onKeyUp({ code });
    },
  };
})(window.BOTA);
