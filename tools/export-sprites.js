/*
 * tools/export-sprites.js — Exportiert die Sprites von Items, Gegnern, Bossen und Pickups als PNG-Dateien
 * fuer die Inhaltslisten documents/items.md und documents/enemies.md (optional, nur fuer Entwicklung).
 *
 * Laedt index.html per file:// in einem Headless-Chromium (Playwright), zeichnet jedes Sprite (Frame 0)
 * in ein eigenes Canvas und speichert es als documents/images/<sprite-name>.png.
 * Die Sprites sind ASCII-Pixel-Art im Code (src/data/sprites-*.js); die PNGs sind also nur abgeleitete
 * Kopien. Nach Grafik-Aenderungen einfach erneut ausfuehren — die Markdown-Datei wird NICHT angefasst.
 *
 * Aufruf:   node tools/export-sprites.js
 * Voraussetzung: wie tools/smoke-test.js (Node.js + Playwright mit Chromium, keine Admin-Rechte noetig).
 *
 * SICHERHEIT: oeffnet nur die lokale Datei; schreibt nur nach documents/images/. Die Dateinamen stammen aus
 * den Sprite-Namen im Code und werden zusaetzlich gegen eine Whitelist geprueft (kein Pfad-Ausbruch).
 */
'use strict';

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Playwright fehlt. Installieren mit: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'documents', 'images');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SAFE_NAME = /^[a-z0-9_]{1,64}$/; // Sprite-Namen sind snake_case; alles andere wird uebersprungen

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(300);

  // Im Browser: alle relevanten Sprite-Namen sammeln und je ein PNG (Data-URL) erzeugen
  const sprites = await page.evaluate(() => {
    const B = BOTA;
    const names = new Set();
    for (const def of Object.values(B.ITEMS)) if (def.sprite) names.add(def.sprite);
    for (const def of Object.values(B.ENEMIES)) if (def.sprite) names.add(def.sprite);
    for (const def of Object.values(B.BOSSES)) if (def.sprite) names.add(def.sprite);
    for (const def of Object.values(B.PICKUP_TYPES)) if (def.sprite) names.add(def.sprite);
    for (const extra of ['pipe', 'trapdoor']) names.add(extra); // Raum-Objekte (Abschnitt "Room objects" in items.md)
    for (const id of Object.keys(B.PROP_KINDS || {})) names.add('prop_' + id); // zerstoerbare Objekte
    const out = [];
    for (const name of names) {
      if (!B.hasSprite(name)) continue; // fehlende Sprites meldet der Rauchtest, hier nur ueberspringen
      const size = B.spriteSize(name);
      const c = document.createElement('canvas');
      c.width = size.w;
      c.height = size.h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      B.drawSprite(g, name, size.w / 2, size.h / 2, { frame: 0 });
      out.push({ name, w: size.w, h: size.h, data: c.toDataURL('image/png') });
    }
    return out;
  });
  await browser.close();

  let written = 0;
  for (const s of sprites) {
    if (!SAFE_NAME.test(s.name)) { console.warn('uebersprungen (Name): ' + s.name); continue; }
    const b64 = s.data.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(OUT, s.name + '.png'), Buffer.from(b64, 'base64'));
    written++;
  }
  console.log(written + ' Sprites nach ' + path.relative(ROOT, OUT) + ' exportiert.');
  for (const e of errors) console.log('  ! ' + e);
  process.exit(errors.length ? 1 : 0);
})();
