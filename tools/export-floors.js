/*
 * tools/export-floors.js — Exportiert fuer jede Etage (Thema) ein Vorschaubild und ein kleines Farbmuster fuer
 * die Etagen-Uebersicht documents/floors.md (optional, nur fuer Entwicklung).
 *
 * Laedt index.html per file:// in einem Headless-Chromium (Playwright), startet einen Run mit festem Seed und
 * betritt jede Etage einmal. Pro Etage:
 *   - documents/images/floor_<key>.jpg          Bildschirmfoto eines typischen Kampfraums (bereits geraeumt,
 *                                                also ohne Gegner; der Spieler steht zur Groessen-Orientierung
 *                                                in der Mitte). Gewaehlt wird deterministisch der Raum mit den
 *                                                meisten Merkmalen (zerstoerbare Objekte, Stacheln, Felsen, Kakteen).
 *   - documents/images/floor_<key>_swatch.png   48×48 "Mini-Raum": Wand, Boden-Schachbrett, Tuer und Akzentfarbe
 *                                                des Themas (fuer die Uebersichtstabelle).
 * Nach Aenderungen an Themen, Mustern oder Deko einfach erneut ausfuehren — die Markdown-Datei wird NICHT
 * angefasst (sie wird von Hand gepflegt, wie items.md und enemies.md).
 *
 * Aufruf:   node tools/export-floors.js
 * Voraussetzung: wie tools/smoke-test.js (Node.js + Playwright mit Chromium, keine Admin-Rechte noetig).
 *
 * SICHERHEIT: oeffnet nur die lokale Datei; schreibt nur nach documents/images/. Die Dateinamen stammen aus den
 * Themen-Schluesseln im Code und werden zusaetzlich gegen eine Whitelist geprueft (kein Pfad-Ausbruch).
 */
'use strict';

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Playwright fehlt. Einrichten mit: bash tools/setup-dev.sh (keine Admin-Rechte noetig)');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'documents', 'images');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?seed=FLOOR-PREVIEW';
const SAFE_KEY = /^[a-z0-9_]{1,32}$/; // Themen-Schluessel sind kurz und snake_case; alles andere wird uebersprungen

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 960×640 bei Faktor 1: der Canvas wird genau 1:1 gezeichnet (logische Aufloesung des Spiels)
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');          // Run starten (Titel -> Etagenkarte)
  await page.waitForTimeout(500);

  const themes = await page.evaluate(() => BOTA.FLOOR_THEMES.map((t) => t.key));
  let written = 0;
  for (let i = 0; i < themes.length; i++) {
    const key = themes[i];
    if (!SAFE_KEY.test(key)) { console.warn('uebersprungen (Schluessel): ' + key); continue; }

    // Etage betreten und den "merkmalsreichsten" normalen Raum zeigen (deterministisch: erster mit Hoechstwertung)
    const swatch = await page.evaluate((depth) => {
      const g = BOTA.game, T = BOTA.TILES;
      g.enterFloor(depth);
      g.setState('play');
      let best = null, bestScore = -1;
      for (const c of g.floor.cells.values()) {
        if (c.type !== 'normal') continue;
        const room = c.room;
        let spikes = 0, rocks = 0, cacti = 0;
        for (let r = 1; r < BOTA.C.ROWS - 1; r++) {
          for (let cc = 1; cc < BOTA.C.COLS - 1; cc++) {
            const t = room.tileAt(cc, r);
            if (t === T.SPIKES) spikes++;
            if (t === T.ROCK || t === T.BLOCK) rocks++;
            if (t === T.CACTUS) cacti++;
          }
        }
        const score = room.props.size * 2 + (spikes ? 3 : 0) + (rocks ? 1 : 0) + Math.min(cacti, 4) * 2;
        if (score > bestScore) { bestScore = score; best = room; }
      }
      if (best) {
        best.populated = true;   // ohne Gegner und Beute: nur der Raum selbst
        best.cleared = true;
        g.teleport(best);
      }
      // Spieler auf eine freie Stelle nahe der Mitte (nicht in einen Felsen)
      const pos = g.nearestFreePos(BOTA.C.ROOM_W / 2, BOTA.C.ROOM_H / 2 + BOTA.C.TILE);
      g.player.x = pos.x;
      g.player.y = pos.y;
      g.bannerState = null;

      // Mini-Raum als Farbmuster: Wand, Schachbrett-Boden, Tuer oben, Akzent-Punkt in der Mitte
      const th = BOTA.FLOOR_THEMES[depth - 1];
      const cv = document.createElement('canvas');
      cv.width = 48; cv.height = 48;
      const x = cv.getContext('2d');
      x.fillStyle = th.wall; x.fillRect(0, 0, 48, 48);
      x.fillStyle = th.wallLight; x.fillRect(0, 0, 48, 2);
      for (let yy = 0; yy < 6; yy++) {
        for (let xx = 0; xx < 6; xx++) {
          x.fillStyle = (xx + yy) % 2 ? th.floorAlt : th.floor;
          x.fillRect(6 + xx * 6, 6 + yy * 6, 6, 6);
        }
      }
      x.fillStyle = th.door; x.fillRect(18, 0, 12, 6);
      x.fillStyle = th.accent;
      x.beginPath(); x.arc(24, 24, 5, 0, Math.PI * 2); x.fill();
      return cv.toDataURL('image/png');
    }, i + 1);
    await page.waitForTimeout(700);   // Tueren, Gluehwuermchen usw. einen Moment laufen lassen
    await page.screenshot({ path: path.join(OUT, 'floor_' + key + '.jpg'), type: 'jpeg', quality: 88 });
    fs.writeFileSync(path.join(OUT, 'floor_' + key + '_swatch.png'), Buffer.from(swatch.replace(/^data:image\/png;base64,/, ''), 'base64'));
    written++;
  }
  await browser.close();
  console.log(written + ' Etagen nach ' + path.relative(ROOT, OUT) + ' exportiert.');
  for (const e of errors) console.log('  ! ' + e);
  process.exit(errors.length ? 1 : 0);
})();
