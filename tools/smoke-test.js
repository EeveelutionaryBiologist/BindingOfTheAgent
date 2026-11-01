/*
 * tools/smoke-test.js — Automatischer Rauchtest (optional, nur fuer Entwicklung).
 *
 * Laedt index.html per file:// in einem Headless-Chromium (Playwright), spielt kurz an und prueft:
 *   - keine Konsolenfehler/-warnungen und keine unbehandelten Exceptions
 *   - jedes Item: Sprite existiert, giveItem + recalcStats laufen fehlerfrei
 *   - jeder Gegner/Boss: Sprite existiert, spawnt, agiert und stirbt sauber
 *   - 300 generierte Etagen enthalten Start/Boss/Schatz/Shop; alle Layouts bestehen validateLayout (strict)
 *   - lose Pickups nur in Kampfraeumen (~18 %) und beim Betreten gelegt; Hallucination nutzt jede Tarnung,
 *     eine nahe Explosion enttarnt sie
 *   - Graphics Glitch: Kontakt verfremdet das HUD (Neustart statt Stapeln), jeder Bereich rendert, Spruenge
 *     landen nie in Hindernissen
 *   - Antagonistic Reviewer: Laser und Stempel treffen genau dort, wo sie sollen; jede Nitpick-Reihe hat eine Luecke
 *   - Rogue Agent Swarm: 4 Mitglieder mit einem Balken, Geist-Phase, 10 % Heilung, Solo-Phase, genau ein Boss-Tod
 *   - Etagen-Bosse: nie zweimal hintereinander derselbe (300 simulierte Runs + echte Etagenfolge)
 *   - README.md: ~30 % der Etagen, nur in normalen Raeumen, deckt die Karte auf, aber nicht den Geheimraum
 *   - Etagen: FLOORS und FLOOR_THEMES gleich lang; Etage 3 = Forgotten Branches mit verzweigteren Karten
 *   - Rohre: ~10 % der Kampfraeume, erscheinen nach dem Clearing (nicht vor Tueren), Ziel nie Boss/Geheim/selbst,
 *     Sperrzeit verhindert Ping-Pong
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
    // Etagen-Themen und -Namen gleich lang; Forgotten Branches ist Etage 3 (und 13, 23, ...)
    if (BOTA.TEXT.FLOORS.length !== BOTA.FLOOR_THEMES.length) out.push('FLOORS (' + BOTA.TEXT.FLOORS.length + ') und FLOOR_THEMES (' + BOTA.FLOOR_THEMES.length + ') ungleich lang');
    if (BOTA.themeFor(3).key !== 'branches' || BOTA.floorInfo(3).name !== 'Forgotten Branches') out.push('Etage 3 ist nicht Forgotten Branches');
    // Verzweigtere Karten auf Forgotten Branches: mindestens gen.minDeadEnds Sackgassen
    for (let i = 0; i < 100; i++) {
      const f = new BOTA.Floor(3, 'branch' + i);
      // wie im Generator gezaehlt: vor dem Einsetzen des Geheimraums (der kann Sackgassen "verbinden")
      const noSecret = new Map([...f.cells].filter(([, c]) => c.type !== 'secret'));
      const de = [...noSecret.values()].filter((c) => c.type !== 'start' && f.neighborCount(c.x, c.y, noSecret) === 1).length;
      if (de < BOTA.themeFor(3).gen.minDeadEnds) { out.push('Forgotten Branches: nur ' + de + ' Sackgassen (branch' + i + ')'); break; }
    }
    // Etagen-Fuzzing
    let combatRooms = 0, combatWithLoot = 0, readmeFloors = 0, pipeRooms = 0;
    for (let i = 0; i < 300; i++) {
      const f = new BOTA.Floor(1 + (i % 10), 'fuzz' + i);
      const types = [...f.cells.values()].map((c) => c.type);
      for (const t of ['start', 'boss', 'treasure', 'shop']) if (!types.includes(t)) out.push('fuzz' + i + ' ohne ' + t);
      // Ab Tiefe 2 genau ein Kampfraum mit garantiertem Approval
      const keyRooms = [...f.cells.values()].filter((c) => c.room.guaranteedKey);
      if (f.depth >= 2 && (keyRooms.length !== 1 || keyRooms[0].type !== 'normal')) out.push('fuzz' + i + ': ' + keyRooms.length + ' Schluesselraeume');
      if (f.depth < 2 && keyRooms.length) out.push('fuzz' + i + ': Schluesselraum auf Tiefe 1');
      // Lose Pickups nur in Kampfraeumen, nur erlaubte Typen, 1–2 Stueck
      for (const c of f.cells.values()) {
        const ll = c.room.looseLoot;
        if (!ll.length) continue;
        combatWithLoot++;
        if (c.type !== 'normal' || !c.room.plannedEnemies.length) out.push('fuzz' + i + ': lose Pickups in ' + c.type);
        if (ll.length > 2 || ll.some((t) => !BOTA.LOOSE_LOOT.types[t])) out.push('fuzz' + i + ': lose Pickups ' + ll.join(','));
      }
      combatRooms += [...f.cells.values()].filter((c) => c.type === 'normal' && c.room.plannedEnemies.length).length;
      // README.md: hoechstens eines, nur in normalen Raeumen
      const readmes = [...f.cells.values()].filter((c) => c.room.hasReadme);
      if (readmes.length > 1 || readmes.some((c) => c.type !== 'normal')) out.push('fuzz' + i + ': README in ' + readmes.map((c) => c.type));
      if (readmes.length) readmeFloors++;
      // Rohre nur in Kampfraeumen
      for (const c of f.cells.values()) {
        if (!c.room.hasPipe) continue;
        pipeRooms++;
        if (c.type !== 'normal' || !c.room.plannedEnemies.length) out.push('fuzz' + i + ': Rohr in ' + c.type);
      }
    }
    if (Math.abs(pipeRooms / Math.max(1, combatRooms) - 0.1) > 0.04) out.push('Anteil Raeume mit Rohr ' + (pipeRooms / combatRooms).toFixed(3));
    if (Math.abs(readmeFloors / 300 - 0.3) > 0.08) out.push('Anteil Etagen mit README ' + (readmeFloors / 300).toFixed(2));
    // Boss-Abwechslung: 300 simulierte Runs a 12 Etagen, nie zweimal derselbe Boss hintereinander
    for (let r = 0; r < 300; r++) {
      const hist = [];
      for (let d = 1; d <= 12; d++) {
        const id = BOTA.rollBossVaried(new BOTA.RNG(BOTA.hashString('boss' + r + ':' + d)), d, hist);
        if (!BOTA.BOSSES[id] || (BOTA.BOSSES[id].minFloor || 1) > d) out.push('Boss ' + id + ' auf Etage ' + d);
        if (hist.length && hist[hist.length - 1] === id) { out.push('Boss zweimal hintereinander: ' + id); break; }
        hist.push(id);
      }
    }
    // Anteil der Kampfraeume mit losen Pickups grob wie konfiguriert (chance = 0.18)
    const share = combatWithLoot / Math.max(1, combatRooms);
    if (Math.abs(share - BOTA.LOOSE_LOOT.chance) > 0.05) out.push('Anteil lose Pickups ' + share.toFixed(3));
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
  // Warten, bis das Spiel das Escape wirklich verarbeitet hat. Sonst kann der naechste Block den Zustand auf
  // 'play' setzen, bevor das Escape ankommt -> es pausiert erneut (war die Ursache des seltenen
  // "Garantiertes Approval nicht gedroppt" mit state "pause").
  await page.waitForFunction(() => BOTA.game.state === 'play', null, { timeout: 3000 });

  // --- Garantiertes Approval: Etage 2, Schluesselraum leeren -> Approval liegt da ---
  // (pollt bis zu 2 s statt fest 300 ms zu warten: unter Last kam das Clearing-Update gelegentlich spaeter;
  //  ein schon eingesammeltes Approval zaehlt ebenfalls)
  const keyResult = await page.evaluate(async () => {
    const g = BOTA.game; g.enterFloor(2); g.setState('play');
    const before = g.player.approvals;
    g.teleport(g.floor.keyRoom.room); BOTA.debug.killAll();
    for (let i = 0; i < 40; i++) {
      if (g.room.pickups.some((pk) => pk.type === 'approval') || g.player.approvals > before) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
    return JSON.stringify({ state: g.state, cleared: g.room.cleared, key: g.room.guaranteedKey,
      alive: g.room.enemies.filter((e) => !e.dead).map((e) => e.id), pickups: g.room.pickups.map((pk) => pk.type) });
  });
  if (keyResult) problems.push('Garantiertes Approval nicht gedroppt: ' + keyResult);
  await shot('08-key-room');

  // --- Lose Pickups liegen beim Betreten; Hallucination tarnt sich als jeder Typ der Tabelle ---------
  const looseProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    let room = null;
    for (let d = 2; d <= 8 && !room; d++) {
      g.enterFloor(d); g.setState('play');
      const cell = [...g.floor.cells.values()].find((c) => c.room.looseLoot.length && !c.room.populated);
      if (cell) room = cell.room;
    }
    if (!room) return ['Keine Etage 2–8 mit losen Pickups gefunden'];
    const want = room.looseLoot.slice();
    g.teleport(room);
    const have = room.pickups.filter((pk) => pk instanceof BOTA.Pickup).map((pk) => pk.type);
    for (const t of want) {
      const i = have.indexOf(t);
      if (i < 0) out.push('Loses Pickup fehlt: ' + t); else have.splice(i, 1);
    }
    if (!room.hasLivingEnemies()) out.push('Raum mit losen Pickups hat keine Gegner');
    BOTA.debug.killAll();

    // Tarnungen: viele Hallucinations weit weg vom Spieler erzeugen
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    g.player.x = 120; g.player.y = 300;
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const e = BOTA.debug.spawn('hallucination', 560 + (i % 6) * 50, 180 + Math.floor(i / 6) % 3 * 90);
      if (e && e.state) seen.add(e.state.disguise);
    }
    for (const t of Object.keys(BOTA.LOOSE_LOOT.types)) if (!seen.has(t)) out.push('Tarnung nie gewuerfelt: ' + t);
    // Explosion in Wurfweite enttarnt (sonst waere "bleibt liegen" ein Erkennungszeichen)
    const victim = g.room.enemies.find((e) => e.def.behavior === 'mimic' && e.state.mode === 'disguised');
    if (victim) {
      g.explode(victim.x + 60, victim.y, 110, 0, 'the smoke test');
      if (victim.state.mode === 'disguised') out.push('Explosion enttarnt die Hallucination nicht');
    }
    return out;
  });
  problems.push(...looseProblems);
  await page.waitForTimeout(200);
  await shot('09-disguises');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); });

  // --- README.md: liegt im Raum, deckt die Karte auf (ohne Geheimraum); Etagen-Bosse wechseln sich ab ---
  const readmeProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    g.bossHistory = [];
    const bosses = [];
    let cell = null;
    for (let d = 1; d <= 10; d++) {
      g.enterFloor(d); g.setState('play');
      bosses.push(g.floor.findType('boss').room.bossId);
      if (!cell && g.floor.readmeRoom && !g.floor.readmeRoom.room.populated) cell = g.floor.readmeRoom;
      if (cell) break;
    }
    for (let i = 1; i < bosses.length; i++) if (bosses[i] === bosses[i - 1]) out.push('Etagen-Boss wiederholt: ' + bosses.join(','));
    if (!cell) return out.concat(['Keine Etage 1–10 mit README.md']);
    g.teleport(cell.room);
    BOTA.debug.killAll();
    const pk = g.room.pickups.find((x) => x.type === 'readme');
    if (!pk) return out.concat(['README.md liegt nicht im Raum']);
    pk.spawnT = 0;
    pk.tryCollect(g.player, g);
    if (!pk.dead || !g.floor.documented) out.push('README.md laesst sich nicht einsammeln');
    for (const c of g.floor.cells.values()) {
      if (c.type === 'secret' && c.room.seen) out.push('README.md verraet den Geheimraum'); // frische Etage: noch nicht gesprengt
      if (c.type !== 'secret' && !c.room.seen) out.push('README.md: Raum ' + c.type + ' nicht aufgedeckt');
    }
    return out;
  });
  problems.push(...readmeProblems);
  await page.waitForTimeout(200);
  await shot('11-readme-map');

  // --- Forgotten Branches: ein normaler Raum auf Etage 3 (Optik pruefen!) ---
  await page.evaluate(() => {
    const g = BOTA.game; g.enterFloor(3); g.setState('play');
    const c = [...g.floor.cells.values()].find((x) => x.type === 'normal');
    c.room.populated = true; c.room.cleared = true;
    g.teleport(c.room);
  });
  await page.waitForTimeout(400);
  await shot('12-forgotten-branches');

  // --- Rohr: erscheint nach dem Clearing, teleportiert in einen erlaubten Raum, kein Ping-Pong ---
  const pipeProblems = await page.evaluate(async () => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.god(true);
    let cell = null;
    for (let d = 2; d <= 9 && !cell; d++) {
      g.enterFloor(d); g.setState('play');
      cell = [...g.floor.cells.values()].find((c) => c.room.hasPipe && !c.room.populated) || null;
    }
    if (!cell) return ['Keine Etage 2–9 mit Rohr gefunden'];
    g.teleport(cell.room);
    BOTA.debug.killAll();
    let pipe = null;
    for (let i = 0; i < 40 && !pipe; i++) {
      await new Promise((r) => setTimeout(r, 50));
      pipe = g.room.pickups.find((x) => x instanceof BOTA.Pipe) || null;
    }
    if (!pipe) return ['Rohr erscheint nach dem Clearing nicht'];
    const c = g.room.tileCenter(7, 4);
    if (Math.hypot(pipe.x - c.x, pipe.y - c.y) < 64 * 1.4) out.push('Rohr liegt in der Raummitte');
    for (const dir of Object.keys(g.room.doors)) {
      const dt = BOTA.C.DOOR_TILES[dir], dc = g.room.tileCenter(dt.col, dt.row);
      if (Math.hypot(pipe.x - dc.x, pipe.y - dc.y) < 64 * 1.6) out.push('Rohr liegt vor einer Tuer');
    }
    // Hineinlaufen -> Sprung
    const from = g.room;
    pipe.armT = 0; pipe.touching = false; g.pipeCooldown = 0;
    g.player.x = pipe.x; g.player.y = pipe.y;
    pipe.update(1 / 60, g);
    if (g.room === from) out.push('Rohr teleportiert nicht');
    if (g.room.type === 'boss' || g.room.type === 'secret') out.push('Rohr fuehrt in den ' + g.room.type + '-Raum');
    if (!(g.pipeCooldown > 0)) out.push('Keine Sperrzeit nach dem Rohr-Sprung');
    // Waehrend der Sperrzeit loest ein weiteres Rohr nicht aus
    const here = g.room;
    const p2 = new BOTA.Pipe(g.player.x, g.player.y); p2.armT = 0;
    here.pickups.push(p2);
    p2.update(1 / 60, g);
    if (g.room !== here) out.push('Rohr-Ping-Pong waehrend der Sperrzeit');
    p2.dead = true;
    // Ziele ueber viele Spruenge: nie Boss/Geheim/aktueller Raum
    for (let i = 0; i < 60; i++) {
      const before = g.room;
      g.pipeCooldown = 0;
      g.pipeWarp({ x: g.player.x, y: g.player.y });
      if (g.room === before || g.room.type === 'boss' || g.room.type === 'secret') { out.push('Rohr-Ziel unzulaessig: ' + g.room.type); break; }
      BOTA.debug.killAll();
    }
    return out;
  });
  problems.push(...pipeProblems);

  // --- Graphics Glitch: Kontakt -> HUD-Stoerung; jeder Stoerungsbereich rendert; Spruenge landen auf Boden ---
  const glitchProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(false);
    g.hudGlitch = null;
    const p = g.player; p.invuln = 0; p.health = p.maxHealth;
    const e = BOTA.debug.spawn('graphics_glitch', p.x, p.y);
    e.spawnDelay = 0;
    e.touchPlayer(g);
    if (!g.hudGlitch) out.push('Graphics Glitch: Kontakt loest keine HUD-Stoerung aus');
    else {
      const kind = g.hudGlitch.kind;
      g.hudGlitch.t = 1;
      g.glitchHud(7);
      if (g.hudGlitch.kind !== kind || g.hudGlitch.t !== 7) out.push('HUD-Stoerung: Neustart aendert Bereich oder Timer');
    }
    if (e.sayText !== 'Is it supposed to look like this...?') out.push('Graphics Glitch: Spruch fehlt');
    e.dead = true;
    BOTA.debug.god(true); p.health = p.maxHealth;
    return out;
  });
  problems.push(...glitchProblems);
  for (const kind of ['hearts', 'items', 'stats', 'minimap']) {
    await page.evaluate((kind) => { BOTA.game.hudGlitch = { kind, t: 7, dur: 7 }; }, kind);
    await page.waitForTimeout(150);
    if (kind === 'hearts' || kind === 'stats') await shot('10-hud-glitch-' + kind);
  }
  const jumpProblems = await page.evaluate(async () => {
    const out = [];
    const g = BOTA.game;
    g.hudGlitch = null;
    g.player.x = 120; g.player.y = 300;
    const starts = [[500, 200], [700, 400]];
    const list = starts.map(([x, y]) => BOTA.debug.spawn('graphics_glitch', x, y));
    await new Promise((r) => setTimeout(r, 4000));
    let moved = 0;
    list.forEach((e, i) => {
      if (Math.hypot(e.x - starts[i][0], e.y - starts[i][1]) > 32) moved++;
      const t = g.room.worldToTile(e.x, e.y);
      if (g.room.isSolid(t.c, t.r, 'walk', false)) out.push('Graphics Glitch steckt in einem Hindernis');
    });
    if (!moved) out.push('Graphics Glitch springt nicht');
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    return out;
  });
  problems.push(...jumpProblems);

  // --- Antagonistic Reviewer: Laser trifft auf der Linie, Stempel nur im Radius, Nitpick-Reihe hat eine Luecke ---
  const reviewerProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(false);
    const p = g.player;
    const R = BOTA.debug.spawnBoss('reviewer', 480, 200);
    R.spawnDelay = 0;
    const step = () => R.behavior.update(R, 1 / 60, g);
    const fresh = () => { p.invuln = 0; p.guardrails = 0; p.health = p.maxHealth; };
    // Laser senkrecht nach unten, Spieler direkt darunter -> Treffer; daneben -> kein Treffer
    fresh(); p.x = 480; p.y = 420;
    R.x = 480; R.y = 200; R.state.mode = 'laserFire'; R.state.t = 0.5; R.state.aim = Math.PI / 2; step();
    if (p.health !== p.maxHealth - 2) out.push('Reviewer-Laser trifft nicht');
    fresh(); p.x = 600; p.y = 420;
    R.x = 480; R.y = 200; R.state.mode = 'laserFire'; R.state.t = 0.5; R.state.aim = Math.PI / 2; step();
    if (p.health !== p.maxHealth) out.push('Reviewer-Laser trifft neben dem Strahl');
    // Stempel: innerhalb trifft, ausserhalb nicht
    fresh(); p.x = 300; p.y = 400;
    R.state.mode = 'idle'; R.state.t = 99;
    R.state.stamps = [{ x: 300, y: 420, t: 0.001, dur: 1, hit: false, after: 0, rot: 0 }]; step();
    if (p.health !== p.maxHealth - 2) out.push('Reviewer-Stempel trifft nicht');
    fresh(); p.x = 300; p.y = 300;
    R.state.stamps = [{ x: 300, y: 450, t: 0.001, dur: 1, hit: false, after: 0, rot: 0 }]; step();
    if (p.health !== p.maxHealth) out.push('Reviewer-Stempel trifft ausserhalb des Radius');
    // Nitpick-Reihe: genau eine Luecke von mindestens ~100 px
    BOTA.debug.god(true);
    for (const pr of g.room.projectiles) if (pr.team === 'enemy') pr.dead = true;
    g.room.projectiles = g.room.projectiles.filter((pr) => !pr.dead);
    R.state.mode = 'wall'; R.state.t = 0; R.state.walls = 1; step();
    const shots = g.room.projectiles.filter((pr) => pr.team === 'enemy' && pr.source === 'a nitpick');
    const vertical = shots.every((pr) => Math.abs(pr.vx) > Math.abs(pr.vy)); // Reihe wandert waagerecht
    const pos = shots.map((pr) => (vertical ? pr.y : pr.x)).sort((a, b) => a - b);
    const gaps = pos.slice(1).map((v, i) => v - pos[i]).filter((d) => d > 45);
    if (shots.length < 8) out.push('Nitpick-Reihe zu kurz: ' + shots.length);
    if (gaps.length !== 1 || gaps[0] < 100) out.push('Nitpick-Reihe: Luecken ' + JSON.stringify(gaps));
    R.dead = true;
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    p.health = p.maxHealth;
    return out;
  });
  problems.push(...reviewerProblems);

  // --- Rogue Agent Swarm: 4 Mitglieder, ein Balken, Geist-Phase, Heilung, Solo-Phase, genau ein Boss-Tod ---
  const swarmProblems = await page.evaluate(async () => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    g.player.x = 150; g.player.y = 480;
    let bossDeaths = 0;
    const onDeath = (e) => { if (e.boss) bossDeaths++; };
    BOTA.bus.on('enemyDeath', onDeath);
    BOTA.debug.spawnBoss('rogue_swarm', 600, 250);
    const S = g.room.enemies.filter((e) => e.def.behavior === 'rogue_swarm');
    if (S.length !== 4) out.push('Swarm: ' + S.length + ' statt 4 Mitglieder');
    if (!S.every((m) => m.bossGroup === S[0].bossGroup && m.bossGroup.length === 4)) out.push('Swarm: kein gemeinsamer Balken');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    S[1].hp = S[1].maxHp * 0.5;
    S[0].hurt(99999, g, null);
    if (S[0].dead || S[0].state.mode !== 'dying') out.push('Swarm: kein Geist-Zustand vor dem Tod');
    await wait(1400);
    if (!S[0].dead) out.push('Swarm: Geist stirbt nicht');
    if (Math.abs(S[1].hp - S[1].maxHp * 0.6) > 1) out.push('Swarm: Heilung ' + S[1].hp + ' statt ' + S[1].maxHp * 0.6);
    S[1].hurt(99999, g, null); S[2].hurt(99999, g, null);
    await wait(1400);
    if (!(S[3].state.group.solo && /^(soloIdle|dashTell|dash|spiral)$/.test(S[3].state.mode))) out.push('Swarm: letztes Mitglied nicht im Solo-Modus (' + S[3].state.mode + ')');
    S[3].hurt(99999, g, null);
    await wait(100);
    if (!S.every((m) => m.dead)) out.push('Swarm: nicht alle tot');
    if (bossDeaths !== 1) out.push('Swarm: ' + bossDeaths + ' Boss-Tode statt 1');
    BOTA.bus.off('enemyDeath', onDeath);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    return out;
  });
  problems.push(...swarmProblems);
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
