/*
 * main.js — Bootstrap: Canvas skalieren, Eingabe anbinden, Spielschleife mit festem Zeitschritt starten.
 */
'use strict';

(function (B) {
  const { W, H, DT } = B.C;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  B.storage.load();
  B.audio.muted = !!B.storage.data.muted;
  B.input.attach(window);

  const game = new B.Game();
  B.game = game;

  /** Canvas so gross wie moeglich bei festem Seitenverhaeltnis; Backing-Store in Geraetepixeln (scharf) */
  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.left = Math.floor((window.innerWidth - cssW) / 2) + 'px';
    canvas.style.top = Math.floor((window.innerHeight - cssH) / 2) + 'px';
    canvas.width = Math.round(W * s * dpr);
    canvas.height = Math.round(H * s * dpr);
    B.renderScale = canvas.width / W;
  }
  window.addEventListener('resize', resize);
  resize();
  canvas.focus();

  // Feste Simulationsschritte (60 Hz), Rendern pro Animationsframe
  let last = performance.now();
  let acc = 0;
  let fpsAcc = 0, fpsFrames = 0;

  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000); // max. 100 ms aufholen (Tab im Hintergrund)
    last = now;
    acc += elapsed;
    fpsAcc += elapsed; fpsFrames++;
    if (fpsAcc >= 0.5) { game.fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }

    while (acc >= DT) {
      try {
        game.update(DT);
      } catch (err) {
        // Ein Fehler soll nicht die ganze Schleife beenden — loggen und weiter
        console.error('[game] update failed:', err);
      }
      B.input.endStep();
      acc -= DT;
    }
    try {
      B.Renderer.frame(ctx, game);
    } catch (err) {
      console.error('[game] render failed:', err);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.BOTA);
