/*
 * tools/smoke-test.js — Automatischer Rauchtest (optional, nur fuer Entwicklung).
 *
 * Laedt index.html per file:// in einem Headless-Chromium (Playwright), spielt kurz an und prueft:
 *   - keine Konsolenfehler/-warnungen und keine unbehandelten Exceptions
 *   - jedes Item: Sprite existiert, giveItem + recalcStats laufen fehlerfrei
 *   - jeder Gegner/Boss: Sprite existiert, spawnt, agiert und stirbt sauber
 *   - 300 generierte Etagen enthalten Start/Boss/Schatz/Shop; alle Layouts bestehen validateLayout (strict)
 *   - Spezialraeume, Pause- und Todesbildschirm rendern
 * Screenshots landen in tools/out/ (nicht einchecken).
 *
 * Aufruf:   node tools/smoke-test.js
 * Voraussetzung: Node.js + Playwright mit Chromium, z. B. lokal im Projekt:
 *   npm i --no-save playwright && npx playwright install chromium
 * (keine Admin-Rechte noetig; das Spiel selbst braucht nichts davon)
 *
 * SICHERHEIT: Der Test oeffnet nur die lokale Datei; die CSP des Spiels blockiert ohnehin jedes Netzwerk.
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
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?seed=SMOKE-0001';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 853 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const problems = [];

  // --- Start: Titel -> Run -------------------------------------------------
  await page.goto(URL);
  await page.waitForTimeout(400);
  await shot('01-title');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2600); // Etagenkarte ablaufen lassen

  // --- Durch eine Tuer laufen (Spieler auf die Tuerachse setzen) -----------
  const dir = await page.evaluate(() => {
    const g = BOTA.game; const d = Object.keys(g.room.doors)[0];
    g.player.x = 480; g.player.y = 320; return d;
  });
  const key = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[dir];
  await page.keyboard.down(key); await page.waitForTimeout(1600); await page.keyboard.up(key);
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => BOTA.game.room.type !== 'start');
  if (!moved) problems.push('Raumwechsel durch Tuer fehlgeschlagen');
  await shot('02-room');

  // --- Datenpruefungen im Browser ------------------------------------------
  const data = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.god(true);
    // Items: Sprite + Vergabe
    for (const [id, def] of Object.entries(BOTA.ITEMS)) {
      if (!BOTA.hasSprite(def.sprite)) out.push('Item ohne Sprite: ' + id);
      try { g.player.giveItem(id, g); } catch (e) { out.push('giveItem ' + id + ': ' + e.message); }
    }
    // Gegner/Bosse: Sprites
    for (const [id, def] of Object.entries(BOTA.ENEMIES)) if (def.sprite && !BOTA.hasSprite(def.sprite)) out.push('Gegner ohne Sprite: ' + id);
    for (const [id, def] of Object.entries(BOTA.BOSSES)) if (!BOTA.hasSprite(def.sprite)) out.push('Boss ohne Sprite: ' + id);
    // Layouts (strikte Hausregeln)
    for (const l of BOTA.LAYOUTS) { const r = BOTA.validateLayout(l, { strict: true }); if (!r.ok) out.push('Layout ' + l.id + ': ' + r.error); }
    // Etagen-Fuzzing
    for (let i = 0; i < 300; i++) {
      const f = new BOTA.Floor(1 + (i % 10), 'fuzz' + i);
      const types = [...f.cells.values()].map((c) => c.type);
      for (const t of ['start', 'boss', 'treasure', 'shop']) if (!types.includes(t)) out.push('fuzz' + i + ' ohne ' + t);
    }
    return out;
  });
  problems.push(...data);

  // --- Jeder Gegner kurz im Startraum --------------------------------------
  const enemyIds = await page.evaluate(() => Object.keys(BOTA.ENEMIES).filter((k) => BOTA.ENEMIES[k].spawn !== false));
  await page.evaluate(() => BOTA.debug.gotoRoom('start'));
  for (const id of enemyIds) {
    await page.evaluate((id) => { BOTA.debug.spawn(id, 300, 200); BOTA.debug.spawn(id, 660, 380); }, id);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
    for (let i = 0; i < 4; i++) { await page.evaluate(() => BOTA.debug.killAll()); await page.waitForTimeout(250); }
  }
  await shot('03-all-items');

  // --- Jeder Boss 4 s, dann toeten ------------------------------------------
  const bossIds = await page.evaluate(() => Object.keys(BOTA.BOSSES));
  for (const id of bossIds) {
    await page.evaluate((id) => { BOTA.debug.gotoRoom('start'); BOTA.debug.spawnBoss(id); }, id);
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('KeyA');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('KeyA');
    await shot('04-boss-' + id);
    for (let i = 0; i < 4; i++) { await page.evaluate(() => BOTA.debug.killAll()); await page.waitForTimeout(300); }
  }

  // --- Spezialraeume, Pause, Tod ---------------------------------------------
  for (const t of ['treasure', 'shop', 'boss']) {
    await page.evaluate((t) => BOTA.debug.gotoRoom(t), t);
    await page.waitForTimeout(500);
    await shot('05-' + t);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await shot('06-pause');
  await page.keyboard.press('Escape');
  // Mehrfach toedlicher Schaden, weil Items wie "Retry with Backoff" den ersten Tod abfangen
  await page.evaluate(() => {
    const g = BOTA.game; BOTA.debug.god(false);
    for (let i = 0; i < 5 && g.state !== 'dead'; i++) { g.player.invuln = 0; g.player.guardrails = 0; g.player.hurt(99, 'the smoke test', g); }
  });
  await page.waitForTimeout(1200);
  const dead = await page.evaluate(() => BOTA.game.state === 'dead');
  if (!dead) problems.push('Todesbildschirm nicht erreicht');
  await shot('07-dead');

  await browser.close();

  // --- Ergebnis ---------------------------------------------------------------
  const uniq = [...new Set(errors)];
  console.log('Probleme: ' + problems.length + ', Konsolenfehler: ' + uniq.length + ', Screenshots: ' + OUT);
  for (const p of problems.slice(0, 40)) console.log('  - ' + p);
  for (const e of uniq.slice(0, 40)) console.log('  ! ' + e);
  process.exit(problems.length || uniq.length ? 1 : 0);
})();
