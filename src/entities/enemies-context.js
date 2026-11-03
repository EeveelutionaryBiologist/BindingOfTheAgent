/*
 * enemies-context.js — Gegner-Familie von The Context Limit (family: 'context', themeOnly: ['context']), seit 2026-11-03.
 *
 * Eigene Datei, damit die drei Mitglieder unabhaengig voneinander entstehen koennen; laedt nach enemy.js (benutzt
 * B.AI und registriert in B.BEHAVIORS). Jedes Mitglied hat einen eigenen Abschnitt (Slot) unten.
 *
 * Gemeinsame Bildsprache (siehe auch B.CONTEXT_COLORS in sprites-enemies.js):
 *  - Blass, durchnaesst, ein wenig traurig: Glas, Tinte, aufgeweichtes Papier, Wasser.
 *  - Der Boden ist dunkles Graublau und es regnet hellblau: GEFAHR ist deshalb nie blau, sondern warm —
 *    Warnlinien/Telegraphen Bernstein (CTX.warn), Schuesse Koralle (CTX.shot). Blau nur fuer Harmloses (Wasser-Optik).
 *  - Treffer/Tod: Familien-Effekte (Spritzer, aufgeweichte Papierfetzen) und -Klaenge (dripHit, soggyDeath,
 *    gurgle als Warnton) kommen automatisch ueber family: 'context' (effects.js / audio.js).
 *  - Fairness wie ueberall: jeder Angriff mit Telegraph, Gegnerschuesse 165–260 px/s, Kontaktschaden 1 (2 fuer Ansturm).
 *
 * Ab Etage 8 gilt die Kakophonie (enemies.js): die Familie taucht dann abgeschwaecht auch auf anderen Etagen auf.
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const AI = B.AI;
  /** Gemeinsame Farben der Familie (Gefahr warm, Wasser blau) */
  const CTX = { warn: '#ffb347', shot: '#ff8a5c', water: '#9ec5ff', pale: '#d6e4ff', ink: '#1b2433' };
  B.CONTEXT_DANGER = CTX;
  void AI;

  // ---- Context-Familie: Slot 1 (Overflow Buffer) ----
  // [[SLOT overflow_buffer]]
  // ---- Ende Slot 1 ----

  // ---- Context-Familie: Slot 2 (Summarizer) ----
  // [[SLOT summarizer]]
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // [[SLOT lost_in_the_middle]]
  // ---- Ende Slot 3 ----

})(window.BOTA);
