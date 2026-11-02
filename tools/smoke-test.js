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
 *   - Detached HEAD: Koerper bringt genau einen verknuepften Kopf mit (getrennte HP), Kopf kreist und schiesst mit
 *     Vorwarnung; Koerper zuerst tot -> Kopf in Panik und schiesst oefter; Kopf zuerst tot -> Koerper irrt nur
 *     umher; Raum erst nach beiden geraeumt; killAll laesst nichts zurueck
 *   - Etagen-Bosse: nie zweimal hintereinander derselbe (300 simulierte Runs + echte Etagenfolge)
 *   - README.md: ~30 % der Etagen, nur in normalen Raeumen, deckt die Karte auf, aber nicht den Geheimraum
 *   - Etagen: FLOORS und FLOOR_THEMES gleich lang; Etage 3 = Forgotten Branches mit verzweigteren Karten
 *   - Etagen-Themen (themes/themeOnly): nur bekannte Themen und gueltige Faktoren; jede Etage fuellt Raeume nur
 *     mit erlaubten Gegnern und hat einen Boss; Test-Eintraege pruefen Ausschluss, Faktor und Bonus-Chance
 *   - Zerstoerbare Objekte: richtige Arten je Etage, erlaubte Plaetze, Raeume bleiben begehbar; Spielerschuss und
 *     Explosion zerbrechen sie, Gegnerschuss nicht
 *   - Off-Brand GPU: ~12 % Blindgaenger ohne Schaden; GPU-Preise 30/20
 *   - Rohre: ~10 % der Kampfraeume, erscheinen nach dem Clearing (nicht vor Tueren), Ziel nie Boss/Geheim/selbst,
 *     Sperrzeit verhindert Ping-Pong
 *   - Stale Branch: nur auf Forgotten Branches; altert gruen -> gelb -> braun -> kahl (Laub faellt), wird schneller,
 *     Commit-Zaehler steigt; kahl: Warnung, dann Sprung mit vollem Herz; Laub-Effekte/-Sounds der Familie "branches"
 *   - Spezialraeume, Pause- und Todesbildschirm rendern
 * Screenshots landen in tools/out/ (nicht einchecken).
 *
 * Aufruf:   node tools/smoke-test.js
 * Voraussetzung: Node.js + Playwright mit Chromium; einmalig einrichten mit
 *   bash tools/setup-dev.sh
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
  console.error('Playwright fehlt. Einrichten mit: bash tools/setup-dev.sh (keine Admin-Rechte noetig)');
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
      // Zerstoerbare Objekte: nur normale Raeume, nur Arten des Themas, nie auf Spawnpunkten/vor Tueren/Mitte,
      // jede begehbare Kachel bleibt erreichbar, props-Map und PROP-Kacheln stimmen ueberein
      const kinds = BOTA.themeFor(f.depth).props.kinds;
      const FRONT = { up: [7, 1], down: [7, 7], left: [1, 4], right: [13, 4] };
      for (const c of f.cells.values()) {
        const rm = c.room;
        let tiles = 0;
        for (let r = 1; r < 8; r++) for (let cc = 1; cc < 14; cc++) if (rm.tileAt(cc, r) === BOTA.TILES.PROP) tiles++;
        if (tiles !== rm.props.size) out.push('fuzz' + i + ': PROP-Kacheln ' + tiles + ' vs props ' + rm.props.size);
        if (!rm.props.size) continue;
        if (c.type !== 'normal') out.push('fuzz' + i + ': Objekte in ' + c.type);
        const fronts = Object.keys(rm.doors).map((d) => FRONT[d]);
        const spawns = new Set(rm.spawnPoints.map((p) => Math.floor(p.x / 64) + ',' + Math.floor(p.y / 64)));
        for (const [key, pr] of rm.props) {
          const [pc, pr2] = key.split(',').map(Number);
          if (!kinds.includes(pr.kind)) out.push('fuzz' + i + ': Objektart ' + pr.kind + ' auf Etage ' + f.depth);
          if (spawns.has(key) || (pc === 7 && pr2 === 4) || fronts.some(([fc, fr]) => Math.abs(fc - pc) <= 1 && Math.abs(fr - pr2) <= 1)) out.push('fuzz' + i + ': Objekt an verbotener Stelle ' + key);
        }
        if (!f.fullyWalkable(rm, fronts)) out.push('fuzz' + i + ': Objekte sperren einen Raumteil ab');
      }
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
        if (!BOTA.BOSSES[id] || (BOTA.BOSSES[id].minFloor || 1) > d || BOTA.themeWeight(BOTA.BOSSES[id], BOTA.themeKeyAt(d)) <= 0) out.push('Boss ' + id + ' auf Etage ' + d);
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

  // --- Etagen-Themen: Felder gueltig, jede Etage fuellt Raeume, Mechanik mit Test-Eintraegen ------------
  problems.push(...await page.evaluate(() => {
    const out = [];
    const keys = BOTA.FLOOR_THEMES.map((t) => t.key);
    const N = BOTA.FLOOR_THEMES.length;
    // 1) themes/themeOnly verweisen nur auf existierende Themen, Faktoren sind Zahlen >= 0
    const checkDefs = (kind, reg) => {
      for (const [id, def] of Object.entries(reg)) {
        if (def.themes !== undefined) {
          if (!def.themes || typeof def.themes !== 'object' || Array.isArray(def.themes)) out.push(kind + ' ' + id + ': themes ist kein Objekt');
          else for (const [k, v] of Object.entries(def.themes)) {
            if (!keys.includes(k)) out.push(kind + ' ' + id + ': unbekanntes Thema in themes: ' + k);
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) out.push(kind + ' ' + id + ': ungueltiger Faktor themes.' + k);
          }
        }
        if (def.themeOnly !== undefined) {
          if (!Array.isArray(def.themeOnly) || !def.themeOnly.length) out.push(kind + ' ' + id + ': themeOnly ist keine nichtleere Liste');
          else for (const k of def.themeOnly) if (!keys.includes(k)) out.push(kind + ' ' + id + ': unbekanntes Thema in themeOnly: ' + k);
        }
      }
    };
    checkDefs('Gegner', BOTA.ENEMIES);
    checkDefs('Boss', BOTA.BOSSES);

    // 2) Echte Inhalte: jede Etage (zwei volle Themen-Durchlaeufe) fuellt Raeume nur mit erlaubten Gegnern
    //    und hat mindestens einen moeglichen Boss
    for (let d = 1; d <= 2 * N; d++) {
      const th = BOTA.themeKeyAt(d);
      for (let i = 0; i < 40; i++) {
        const list = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('theme' + d + ':' + i)), d);
        if (!list.length) { out.push('Etage ' + d + ' (' + th + '): leerer Kampfraum'); break; }
        const bad = list.filter((id) => (BOTA.ENEMIES[id].minFloor || 1) > d || BOTA.themeWeight(BOTA.ENEMIES[id], th) <= 0);
        if (bad.length) { out.push('Etage ' + d + ' (' + th + '): nicht erlaubte Gegner ' + bad.join(',')); break; }
      }
      const boss = BOTA.rollBoss(new BOTA.RNG(d), d);
      if (!BOTA.BOSSES[boss] || BOTA.themeWeight(BOTA.BOSSES[boss], th) <= 0) out.push('Etage ' + d + ' (' + th + '): kein erlaubter Boss');
    }

    // 3) Mechanik mit voruebergehenden Test-Eintraegen (werden in jedem Fall wieder entfernt)
    const E = BOTA.ENEMIES, BS = BOTA.BOSSES;
    const base = { hp: 1, r: 10, behavior: 'wander', minFloor: 1, cost: 1 };
    E.__only = Object.assign({}, base, { weight: 40, themeOnly: ['branches'] });
    E.__zero = Object.assign({}, base, { weight: 8, themes: { branches: 0, devnull: 4 } });
    E.__bonus = Object.assign({}, base, { weight: 0, bonusChance: 0.2, themeOnly: ['branches'] });
    BS.__boss = { name: 'Test', hp: 1, r: 10, behavior: 'monolith', minFloor: 1, weight: 1000, themeOnly: ['branches'] };
    try {
      const share = (d, id) => {
        let hit = 0, all = 0;
        for (let i = 0; i < 400; i++) {
          const list = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('mech' + d + ':' + i)), d);
          all += list.length;
          hit += list.filter((x) => x === id).length;
        }
        return hit / Math.max(1, all);
      };
      for (let d = 1; d <= 2 * N; d++) {
        const branches = BOTA.themeKeyAt(d) === 'branches';
        const only = share(d, '__only'), bonus = share(d, '__bonus'), zero = share(d, '__zero');
        if (branches !== (only > 0)) out.push('themeOnly: Anteil ' + only.toFixed(3) + ' auf Etage ' + d);
        if (branches !== (bonus > 0)) out.push('themeOnly (Bonus): Anteil ' + bonus.toFixed(3) + ' auf Etage ' + d);
        if (branches && zero > 0) out.push('themes 0: trotzdem gespawnt auf Etage ' + d);
        if (!branches && zero <= 0) out.push('themes: neutraler Gegner fehlt auf Etage ' + d);
        // Bosse: themeOnly-Boss nur (und mit Gewicht 1000 praktisch immer) auf seinem Thema
        const boss = BOTA.rollBossVaried(new BOTA.RNG(d), d, []);
        if (branches !== (boss === '__boss')) out.push('Boss themeOnly: ' + boss + ' auf Etage ' + d);
      }
      // Faktor 4 auf /dev/null: deutlich haeufiger als auf den Nachbaretagen
      const dn = keys.indexOf('devnull') + 1;
      const zDn = share(dn, '__zero'), zNb = (share(dn - 1, '__zero') + share(dn + 1, '__zero')) / 2;
      if (!(zDn > 1.8 * zNb)) out.push('themes-Faktor wirkt nicht: ' + zDn.toFixed(3) + ' vs ' + zNb.toFixed(3));
      // Abwechslung bleibt Vorrang: auch ein dominanter Thema-Boss kommt nicht zweimal hintereinander
      if (BOTA.rollBossVaried(new BOTA.RNG(7), keys.indexOf('branches') + 1, ['__boss']) === '__boss') out.push('Thema-Boss zweimal hintereinander');
    } finally {
      delete E.__only; delete E.__zero; delete E.__bonus; delete BS.__boss;
    }
    return out;
  }));

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

  // --- Zerstoerbare Objekte: Spielerschuss zerbricht, Gegnerschuss nicht, Explosion zerbricht ---
  const propProblems = await page.evaluate(async () => {
    const out = [];
    const g = BOTA.game, T = BOTA.TILES;
    BOTA.debug.god(true);
    let cell = null;
    for (let d = 1; d <= 5 && !cell; d++) {
      g.enterFloor(d); g.setState('play');
      cell = [...g.floor.cells.values()].find((c) => c.room.props.size >= 2 && c.type === 'normal') || null;
    }
    if (!cell) return ['Kein Raum mit mindestens 2 Objekten auf Etage 1–5'];
    cell.room.populated = true; cell.room.cleared = true;
    g.teleport(cell.room);
    const keys = [...g.room.props.keys()].map((k) => k.split(',').map(Number));
    let breaks = 0;
    const onBreak = () => breaks++;
    BOTA.bus.on('propBreak', onBreak);
    const shootAt = (team, c, r) => {
      const tx = c * 64 + 32, ty = r * 64 + 32;
      // Schuss von 1.5 Kacheln links (oder rechts) waagerecht auf das Objekt
      const fromX = c >= 2 ? tx - 96 : tx + 96;
      g.spawnProjectile({ x: fromX, y: ty, vx: fromX < tx ? 480 : -480, vy: 0, team, damage: 99, range: 300 });
    };
    const [a, b] = keys;
    shootAt('enemy', a[0], a[1]);
    await new Promise((r) => setTimeout(r, 400));
    if (g.room.tileAt(a[0], a[1]) !== T.PROP) out.push('Gegnerschuss zerstoert ein Objekt');
    shootAt('player', a[0], a[1]);
    await new Promise((r) => setTimeout(r, 400));
    if (g.room.tileAt(a[0], a[1]) !== T.FLOOR || g.room.props.has(a.join(','))) out.push('Spielerschuss zerstoert das Objekt nicht');
    // Schwacher Schaden: mehrere Treffer noetig
    const pb = g.room.props.get(b.join(','));
    g.hitProp(g.room, b[0] * 64 + 32, b[1] * 64 + 32, 1);
    if (g.room.tileAt(b[0], b[1]) !== T.PROP) out.push('Objekt zerbricht schon beim ersten schwachen Treffer');
    if (!(pb.hp < pb.max)) out.push('Treffer zieht keine Objekt-HP ab');
    g.explode(b[0] * 64 + 32, b[1] * 64 + 32, 110, 0, 'the smoke test');
    if (g.room.tileAt(b[0], b[1]) !== T.FLOOR) out.push('Explosion zerstoert das Objekt nicht');
    if (breaks !== 2) out.push('propBreak-Events: ' + breaks + ' statt 2');
    // Geister-Schuss (spectral): fliegt durch, zerbricht das Objekt trotzdem
    const rest = [...g.room.props.keys()].map((k) => k.split(',').map(Number));
    if (rest.length) {
      const [sc, sr] = rest[0];
      const tx = sc * 64 + 32, ty = sr * 64 + 32, fromX = sc >= 2 ? tx - 96 : tx + 96;
      g.spawnProjectile({ x: fromX, y: ty, vx: fromX < tx ? 480 : -480, vy: 0, team: 'player', damage: 99, range: 300, flags: { spectral: true } });
      await new Promise((r) => setTimeout(r, 400));
      if (g.room.tileAt(sc, sr) !== T.FLOOR) out.push('Geister-Schuss zerstoert das Objekt nicht');
    }
    // Zusammenhangspruefung erkennt eine Kistenreihe, die den Raum in zwei Haelften teilt
    const FR = { up: [7, 1], down: [7, 7], left: [1, 4], right: [13, 4] };
    const split = [...g.floor.cells.values()].map((c) => c.room).find((rm) => rm.doors.left && rm.doors.right);
    if (split) {
      const saved = [];
      for (let r = 1; r < 8; r++) { saved.push(split.tileAt(7, r)); split.tiles[r * 15 + 7] = T.PROP; }
      if (g.floor.fullyWalkable(split, Object.keys(split.doors).map((d) => FR[d]))) out.push('fullyWalkable erkennt einen geteilten Raum nicht');
      for (let r = 1; r < 8; r++) split.tiles[r * 15 + 7] = saved[r - 1];
    }
    BOTA.bus.off('propBreak', onBreak);
    return out;
  });
  problems.push(...propProblems);
  for (const d of [1, 3, 4, 8]) {
    await page.evaluate((d) => {
      const g = BOTA.game; g.enterFloor(d); g.setState('play');
      const c = [...g.floor.cells.values()].filter((x) => x.room.props.size).sort((x, y) => y.room.props.size - x.room.props.size)[0];
      if (!c) return;
      c.room.populated = true; c.room.cleared = true;
      g.teleport(c.room); g.bannerState = null;
    }, d);
    await page.waitForTimeout(300);
    await shot('13-props-floor' + d);
  }

  // --- Off-Brand GPU: ~12 % Blindgaenger; ein Blindgaenger macht keinen Schaden ---
  const gpuProblems = await page.evaluate(async () => {
    const out = [];
    const g = BOTA.game, def = BOTA.ITEMS.offbrand_gpu;
    let duds = 0;
    for (let i = 0; i < 2000; i++) {
      const proj = { damage: 3.5, knockbackForce: 160, range: 420, color: '#fff', flags: {} };
      def.onShoot(g.player, proj, g);
      if (proj.damage === 0) duds++;
    }
    if (Math.abs(duds / 2000 - 0.12) > 0.03) out.push('Off-Brand GPU: Blindgaenger-Anteil ' + (duds / 2000).toFixed(3));
    if (BOTA.ITEMS.extra_gpu.price !== 30 || def.price !== 20) out.push('GPU-Preise falsch');
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    const e = BOTA.debug.spawn('bug', 600, 300); e.spawnDelay = 0;
    const hp = e.hp;
    g.spawnProjectile({ x: 540, y: 300, vx: 480, vy: 0, team: 'player', damage: 0, range: 300 });
    await new Promise((r) => setTimeout(r, 300));
    if (e.hp !== hp) out.push('Blindgaenger macht Schaden');
    BOTA.debug.killAll();
    return out;
  });
  problems.push(...gpuProblems);

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
    // Pollen statt fester Wartezeit: Items wie Garbage Collector frieren Gegner kurz ein (alle 12 Kills),
    // dann pausiert auch der Geist-Countdown — eine feste Wartezeit war deshalb gelegentlich zu kurz.
    const waitFor = async (cond, ms) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); return cond(); };
    S[1].hp = S[1].maxHp * 0.5;
    S[0].hurt(99999, g, null);
    if (S[0].dead || S[0].state.mode !== 'dying') out.push('Swarm: kein Geist-Zustand vor dem Tod');
    await waitFor(() => S[0].dead, 4000);
    if (!S[0].dead) out.push('Swarm: Geist stirbt nicht');
    if (Math.abs(S[1].hp - S[1].maxHp * 0.6) > 1) out.push('Swarm: Heilung ' + S[1].hp + ' statt ' + S[1].maxHp * 0.6);
    S[1].hurt(99999, g, null); S[2].hurt(99999, g, null);
    await waitFor(() => S[1].dead && S[2].dead && S[3].state.group.solo && S[3].state.mode !== 'formation', 4000);
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

  // --- Stale Branch: nur Forgotten Branches, altert gruen->gelb->braun->kahl, wird schneller, Zaehler steigt,
  //     kahl: Warnung (enemyWindup) -> Sprung mit vollem Herz -> zurueck auf 1; Laub-Effekte und -Sounds ---
  const staleProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    // Spawn-Verteilung: auf Etage 3 (Forgotten Branches) dabei, auf anderen Etagen nie
    let onBranches = 0;
    for (const d of [2, 3, 4, 5, 9, 13]) {
      for (let i = 0; i < 300; i++) {
        const n = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('stale' + d + ':' + i)), d).filter((x) => x === 'stale_branch').length;
        if (BOTA.themeKeyAt(d) === 'branches') onBranches += n;
        else if (n) { out.push('Stale Branch auf Etage ' + d); break; }
      }
    }
    if (!onBranches) out.push('Stale Branch spawnt nie auf Forgotten Branches');
    for (const s of ['enemy_stale_branch_yellow', 'enemy_stale_branch_brown', 'enemy_stale_branch_bare']) if (!BOTA.hasSprite(s)) out.push('Sprite fehlt: ' + s);

    // Altern im Zeitraffer (manuelle Schritte; Gott-Modus, damit der Kontakt egal ist)
    g.enterFloor(3); g.setState('play');
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    const p = g.player; p.x = 160; p.y = 300;
    const e = BOTA.debug.spawn('stale_branch', 800, 300);
    const counts = { shed: 0, big: 0, windup: 0 };
    const onShed = (ev) => { if (ev.enemy === e) { counts.shed++; if (ev.big) counts.big++; } };
    const onWind = (ev) => { if (ev.enemy === e) counts.windup++; };
    BOTA.bus.on('enemyShed', onShed); BOTA.bus.on('enemyWindup', onWind);
    e.state.age = 0; e.state.stage = 0; e.state.ticks = 0; e.spriteName = null; e.spawnDelay = 0;
    const sprites = [], speeds = [];
    let lunged = false, lungeDamage = 0, lungeSpeed = 0, sawWindupBeforeLunge = false, prevMode = 'chase';
    const step = (sec) => {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        e.frozen = 0;               // Items (Garbage Collector, Daily Standup) koennen sonst einfrieren
        e.update(1 / 60, g);
        if (e.state.mode === 'lunge') {
          if (!lunged) { lunged = true; sawWindupBeforeLunge = prevMode === 'windup'; }
          lungeDamage = Math.max(lungeDamage, e.contactDamage);
          lungeSpeed = Math.max(lungeSpeed, Math.hypot(e.vx, e.vy));
        }
        prevMode = e.state.mode;
        // Spieler auf Abstand halten, damit der Gegner nicht dauernd am Spieler klebt
        if (Math.hypot(p.x - e.x, p.y - e.y) < 120) { p.x = e.x < 480 ? 800 : 160; p.y = 300; }
      }
    };
    const n0 = e.state.base + e.state.ticks;
    for (const t of [1, 6, 11, 15.3]) {
      step(t - e.state.age);
      sprites.push(e.spriteName || e.def.sprite);
      speeds.push(Math.hypot(e.vx, e.vy) || 0);
    }
    const want = ['enemy_stale_branch', 'enemy_stale_branch_yellow', 'enemy_stale_branch_brown', 'enemy_stale_branch_bare'];
    if (sprites.join() !== want.join()) out.push('Stale Branch: Altersstufen ' + sprites.join(','));
    if (counts.big !== 3) out.push('Stale Branch: ' + counts.big + ' Laub-Schwaelle statt 3');
    if (counts.shed <= counts.big) out.push('Stale Branch: kein einzelnes fallendes Blatt');
    if (e.state.base + e.state.ticks < n0 + 5) out.push('Stale Branch: Zaehler steigt nicht (' + n0 + ' -> ' + (e.state.base + e.state.ticks) + ')');
    if (!(speeds[0] < 75)) out.push('Stale Branch: am Anfang zu schnell (' + speeds[0].toFixed(0) + ')');
    if (!(speeds[2] > speeds[0] + 30)) out.push('Stale Branch: wird nicht schneller (' + speeds.map((v) => v.toFixed(0)).join(',') + ')');
    if (lunged) out.push('Stale Branch: springt schon vor dem Kahlwerden');
    // Kahl: innerhalb weniger Sekunden Warnung, dann Sprung mit vollem Herz, danach wieder normal
    step(6);
    if (!counts.windup) out.push('Stale Branch: keine Sprung-Warnung (enemyWindup)');
    if (!lunged) out.push('Stale Branch: springt nicht');
    else {
      if (!sawWindupBeforeLunge) out.push('Stale Branch: Sprung ohne Zittern davor');
      if (lungeDamage !== 2) out.push('Stale Branch: Sprung-Kontaktschaden ' + lungeDamage + ' statt 2');
      if (lungeSpeed < 300) out.push('Stale Branch: Sprung zu langsam (' + lungeSpeed.toFixed(0) + ')');
    }
    if (e.state.mode !== 'lunge' && e.contactDamage !== 1) out.push('Stale Branch: Kontaktschaden nach dem Sprung ' + e.contactDamage);
    BOTA.bus.off('enemyShed', onShed); BOTA.bus.off('enemyWindup', onWind);

    // Familie "branches": Treffer und Tod erzeugen fallendes Laub
    const leaves = () => g.room.effects.filter((fx) => fx instanceof BOTA.Leaf).length;
    g.room.effects.length = 0;
    e.hurt(1, g, null);
    if (!leaves()) out.push('Familie branches: Treffer ohne Laub');
    g.room.effects.length = 0;
    e.hurt(9999, g, null);
    if (!e.dead || leaves() < 5) out.push('Familie branches: Tod ohne Laub (' + leaves() + ')');
    // Sounds: vorhanden und abspielbar ohne Fehler (Headless-Chromium spielt nichts ab)
    for (const n of ['leafHit', 'branchDeath', 'rustle', 'creak']) {
      if (!BOTA.audio.names().includes(n)) out.push('Sound fehlt: ' + n);
      try { BOTA.audio.play(n); } catch (err) { out.push('Sound ' + n + ': ' + err.message); }
    }
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    return out;
  });
  problems.push(...staleProblems);
  // Optik: alle vier Altersstufen nebeneinander auf Forgotten Branches (Bild pruefen!)
  await page.evaluate(() => {
    const g = BOTA.game; g.player.x = 480; g.player.y = 470;
    [0.5, 6, 11, 16].forEach((a, i) => {
      const e = BOTA.debug.spawn('stale_branch', 220 + i * 170, 230);
      e.state.age = a; e.spawnDelay = 0;
      e.behavior.update(e, 0, g);   // Altersstufe sofort uebernehmen
      e.update = function () {};    // Pose fuer das Bild halten
    });
  });
  await page.waitForTimeout(250);
  await shot('13-stale-branch');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); });

  // --- Detached HEAD: Paar spawnt gemeinsam, Koerper zuerst -> Kopf in Panik, Kopf zuerst -> Koerper irrt ---
  // (steht vor dem Todesbildschirm, weil der Test ein laufendes Spiel braucht)
  const headProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    const p = g.player; p.x = 150; p.y = 450;
    const DT = 1 / 60;
    const living = () => g.room.enemies.filter((e) => !e.dead);
    const enemyShots = () => g.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead).length;
    const clearShots = () => { for (const pr of g.room.projectiles) if (pr.team === 'enemy') pr.dead = true; };
    // Ein Simulationsschritt; Einfrieren aufheben (der Spieler hat hier alle Items, der Garbage Collector
    // friert nach Kills Gegner ein — dann liefe das Verhalten nicht)
    const step = (e) => { e.frozen = 0; e.update(DT, g); };
    // Paar erzeugen; ohne Spawn-Verzoegerung, damit die Verhalten sofort laufen
    const spawnPair = (x, y) => {
      const body = BOTA.debug.spawn('detached_head', x, y);
      const head = body && body.state.partner;
      if (body) body.spawnDelay = 0;
      if (head) head.spawnDelay = 0;
      return { body, head };
    };

    // 1) Spawnt gemeinsam: genau ein Kopf pro Koerper, gegenseitig verknuepft, getrennte HP, kein proxy
    const A = spawnPair(600, 300);
    if (!A.head || A.head.id !== 'detached_head_tag') out.push('Detached HEAD: kein Kopf gespawnt');
    else {
      if (A.head.state.partner !== A.body) out.push('Detached HEAD: Kopf nicht mit dem Koerper verknuepft');
      if (A.head.proxy || A.body.proxy) out.push('Detached HEAD: nutzt proxy statt getrennter HP');
      if (living().length !== 2) out.push('Detached HEAD: ' + living().length + ' statt 2 Teile im Raum');
      const d = Math.hypot(A.head.x - A.body.x, A.head.y - A.body.y);
      if (d > 160) out.push('Detached HEAD: Kopf startet ' + Math.round(d) + ' px vom Koerper');
      // Kreisen: nach 3 s im Abstand 80–140 px (etwas Spiel fuer Nachlauf und Wandklemmen)
      for (let i = 0; i < 180; i++) step(A.head);
      const d2 = Math.hypot(A.head.x - A.body.x, A.head.y - A.body.y);
      if (d2 < 60 || d2 > 165) out.push('Detached HEAD: Kopf kreist in ' + Math.round(d2) + ' px Abstand');
      // Schuss mit Vorwarnung: Auge gluet im letzten Moment, dann ein Bernstein-Schuss
      clearShots();
      A.head.state.cd = 0.3; A.head.behavior.update(A.head, DT, g);
      if (!A.head.state.warn) out.push('Detached HEAD: keine Warnung vor dem Schuss');
      A.head.state.cd = 0.001; A.head.behavior.update(A.head, DT, g);
      const shots = g.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead);
      if (shots.length !== 1 || shots[0].color !== '#ffcf4d') out.push('Detached HEAD: Schuss fehlt oder nicht Bernstein (' + shots.length + ')');
      else {
        const v = Math.hypot(shots[0].vx, shots[0].vy);
        if (v < 165 || v > 260) out.push('Detached HEAD: Schussgeschwindigkeit ' + Math.round(v));
      }
      clearShots();
    }

    // 2) Koerper zuerst toeten -> Kopf in Panik ("HEAD detached!"), schiesst oefter
    if (A.head) {
      A.body.hurt(9999, g, null);
      A.head.behavior.update(A.head, DT, g);
      if (A.head.state.mode !== 'panic') out.push('Detached HEAD: Kopf nicht in Panik nach Koerper-Tod');
      if (A.head.sayText !== 'HEAD detached!') out.push('Detached HEAD: Spruch "HEAD detached!" fehlt');
      if (A.head.state.partner) out.push('Detached HEAD: Kopf haelt Referenz auf toten Koerper');
      if (A.head.state.cd > 1.2 + 1e-6) out.push('Detached HEAD: Panik verkuerzt die Schusspause nicht (' + A.head.state.cd.toFixed(2) + ' s)');
      // Schussfolge in Panik: ueber 6 s deutlich mehr Schuesse als im gekoppelten Takt (~2.2 s)
      clearShots();
      let fired = 0;
      for (let i = 0; i < 360; i++) { const n = enemyShots(); A.head.behavior.update(A.head, DT, g); fired += Math.max(0, enemyShots() - n); }
      if (fired < 4) out.push('Detached HEAD: Panik-Kopf schiesst nur ' + fired + 'x in 6 s');
      clearShots();
      if (!g.room.hasLivingEnemies()) out.push('Detached HEAD: Raum gilt als geraeumt, obwohl der Kopf lebt');
      A.head.hurt(9999, g, null);
      if (g.room.hasLivingEnemies()) out.push('Detached HEAD: Raum nicht geraeumt, obwohl beide tot sind');
    }

    // 3) Kopf zuerst toeten -> Koerper irrt umher ("where is my HEAD?"), nur Kontaktschaden, kein Schuss
    const C = spawnPair(500, 300);
    if (C.head) {
      C.head.hurt(9999, g, null);
      clearShots();
      C.body.behavior.update(C.body, DT, g);
      if (C.body.state.mode !== 'lost') out.push('Detached HEAD: Koerper nicht verloren nach Kopf-Tod');
      if (C.body.sayText !== 'where is my HEAD?') out.push('Detached HEAD: Spruch "where is my HEAD?" fehlt');
      if (C.body.spriteName !== 'enemy_detached_head_lost' || !BOTA.hasSprite(C.body.spriteName)) out.push('Detached HEAD: Sockel erlischt nicht');
      if (!(C.body.contactDamage > 0)) out.push('Detached HEAD: Koerper ohne Kontaktschaden');
      let maxV = 0;
      for (let i = 0; i < 240; i++) { step(C.body); maxV = Math.max(maxV, Math.hypot(C.body.vx, C.body.vy)); }
      if (enemyShots()) out.push('Detached HEAD: kopfloser Koerper schiesst');
      if (maxV > C.body.params.lostSpeed + 1) out.push('Detached HEAD: kopfloser Koerper zu schnell (' + Math.round(maxV) + ')');
      if (!living().includes(C.body)) out.push('Detached HEAD: kopfloser Koerper verschwunden');
    }

    // 4) debug.killAll laesst nichts zurueck (auch nicht bei zwei Paaren gleichzeitig)
    spawnPair(400, 250); spawnPair(700, 400);
    BOTA.debug.killAll();
    if (living().length) out.push('Detached HEAD: killAll laesst ' + living().length + ' Teile zurueck');
    for (const e of g.room.enemies) if (e.id.startsWith('detached_head') && e.state.partner) out.push('Detached HEAD: tote Teile halten Partner-Referenzen');

    // 5) Nur auf Forgotten Branches und nur der Koerper wird gewuerfelt (der Kopf kommt aus dessen init)
    const def = BOTA.ENEMIES.detached_head;
    if (!def || def.themeOnly.join() !== 'branches' || def.family !== 'branches') out.push('Detached HEAD: Thema/Familie falsch');
    if (BOTA.ENEMIES.detached_head_tag.spawn !== false) out.push('Detached HEAD: Kopf ist regulaer spawnbar');
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    clearShots();
    return out;
  });
  problems.push(...headProblems);
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
