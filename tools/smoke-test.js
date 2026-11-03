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
 *   - Cherry-Pick: Raum-Wuerfe liefern Kirschen paarweise, beim Bevoelkern gegenseitig verbunden; ein Treffer macht
 *     den PARTNER ~3 s wuetend (er spuckt einen Kern), stirbt einer, bleibt der andere wuetend; der Stiel dehnt
 *     sich nie ueber die Leine (auch nicht bei Rueckstoss); ein Einzel-Spawn bekommt einen Partner
 *   - Orphan Commit: seltener Bonus nur auf Forgotten Branches (max. 1 pro Raum), flieht in Ecken, blockiert nie
 *     das Clearing; Fangen (auch eingefroren) oder Abschuss -> 2–3 Credits; Garbage Collection mit Warnung, ohne
 *     Beute und ohne Kill
 *   - Octopus Merge: nur auf Forgotten Branches; 8 Arme a 5 Segmente (proxy 60 %), bleiben im Raum; jeder Schwung,
 *     Schlag, Spitzen-Schuss und Strom mit Telegraph; Merges je 12 % HP (mind. ein Arm), Phase 2 bei 50 % mit
 *     gegenlaeufigen Stroemen; Kontakt entlang des Arms; genau ein Boss-Tod, danach keine Segmente mehr
 *   - Sandbox Borders (Etage 6): Kakteen nur dort, nur aus Felsen, nie vor Tueren, Anteil wie theme.cacti; Kaktus
 *     sticht einmal (dann Unverwundbarkeit) mit Rueckstoss, ist solide, Explosionen sprengen ihn; Sprites vorhanden
 *   - Sandbox-Borders-Gegner: Deprecation Warning x2.5 und Hallucination x2 dort; Spinlock (Glieder schirmen ab, Ring,
 *     Rassel >= 0.6 s, Vorschnellen mit 2 Schaden, Kette reisst nicht, Glieder zerfallen); Rootkit (vergraben
 *     unverwundbar, taucht auf freiem Sand nahe dem Spieler auf, Telegraph, 8er-Ring, Bombe scheucht heraus)
 *   - Nested Infinite Loop: ab Etage 8 statt der Infinite Loop; nur der aeussere lebende Ring feuert und ist
 *     greifbar; Ringe zerfallen bei 50 % / 16,67 %; Schuesse 165–260 px/s; Teile bleiben im Raum; ein Boss-Tod
 *   - Rogue Agent: nie vor Etage 7; haelt Abstand; jede Salve nach Gluehen, zwei 3er-Faecher oder drei Einzelschuesse
 *   - Dust Daemon / Dry Run: in Tiefe 1–7 nur auf Sandbox Borders bzw. The Training Data; Dust Daemon lenkt
 *     Spielerschuesse im Drehsinn ab (nicht ausserhalb, nicht erschoepft/eingefroren, keine Gegnerschuesse), gezielte
 *     Schuesse treffen den Kern immer, Wurf nach Telegraph mit 4 Brocken (einer auf den Spieler), bleibt im Raum;
 *     Dry Run wiederholt Weg und Schuesse des Geistes exakt delay Ticks spaeter (auch nach Einfrieren/Rueckstoss),
 *     Ausholen vor jedem Angriff, Geist harmlos, Tempo 165–260, Geist verpufft beim Tod
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
    // Etagen-Themen und -Namen gleich lang; Forgotten Branches ist Etage 3 (und 14, 25, ...), Sandbox Borders Etage 6
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
      const f = new BOTA.Floor(1 + (i % BOTA.FLOOR_THEMES.length), 'fuzz' + i);
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
        if (!BOTA.BOSSES[id] || !BOTA.bossEligible(BOTA.BOSSES[id], d, BOTA.themeKeyAt(d))) out.push('Boss ' + id + ' auf Etage ' + d);
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

  // --- Cherry-Pick: Paare aus dem Raum-Wurf, Wut des Partners, Witwen-Wut, Stiel-Leine ---------------
  // Die Kirschen werden direkt (synchron) per e.update getaktet, damit Begleiter und Items aus den
  // vorigen Bloecken (Ente, Unit Tests, ...) sie nicht zwischendurch treffen und die Wut verfaelschen.
  problems.push(...await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, DT = 1 / 60;
    const def = BOTA.ENEMIES.cherry_pick;
    const leash = def.params.leash;
    const cherries = () => g.room.enemies.filter((e) => e.id === 'cherry_pick' && !e.dead);
    // 1) Raum-Wurf auf Forgotten Branches: Kirschen immer paarweise, hoechstens maxPerRoom
    let list = null, withCherries = 0;
    for (let i = 0; i < 400; i++) {
      const l = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('cherry' + i)), 3);
      const n = l.filter((x) => x === 'cherry_pick').length;
      if (!n) continue;
      withCherries++;
      if (n % 2 || n > def.maxPerRoom) out.push('Cherry-Pick: ' + n + ' Kirschen in einem Raum');
      if (!list || n > list.filter((x) => x === 'cherry_pick').length) list = l;
    }
    if (!withCherries) { out.push('Cherry-Pick: kein Raum auf Etage 3 mit Kirschen'); return out; }
    // 2) Echter Raum: Bevoelkern verbindet die Kirschen paarweise und gegenseitig, Stiel innerhalb der Leine
    g.enterFloor(3);
    const cell = [...g.floor.cells.values()].find((c) => c.type === 'normal');
    cell.room.plannedEnemies = list.slice();
    cell.room.looseLoot = []; cell.room.hasReadme = false;
    g.teleport(cell.room);
    BOTA.debug.god(true);
    const cs = cherries();
    for (const e of cs) {
      const o = e.state.partner;
      if (!o || o.state.partner !== e || o === e) { out.push('Cherry-Pick: Kirsche ohne gegenseitigen Partner'); break; }
      if (e.state.lead === o.state.lead) out.push('Cherry-Pick: Paar ohne genau einen Lead');
      if (Math.hypot(e.x - o.x, e.y - o.y) > leash + 1) out.push('Cherry-Pick: Paar startet ueber der Leine');
    }
    // 3) Treffer auf a -> b (der Partner) ist ~3 s wuetend und spuckt einen Kern, a selbst bleibt ruhig
    const a = cs[0], b = a.state.partner;
    let maxD = 0;
    const step = (n, pair) => {
      for (let i = 0; i < n; i++) {
        for (const e of pair) if (!e.dead) e.update(DT, g);
        if (!pair[0].dead && !pair[1].dead) maxD = Math.max(maxD, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
      }
    };
    a.spawnDelay = b.spawnDelay = 0;
    a.frozen = b.frozen = 0; // Items wie Daily Standup frieren beim Betreten ein
    // Spieler in die von b am weitesten entfernte Ecke (gespuckt wird erst ab ~70 px Abstand)
    const corners = [[100, 100], [860, 100], [100, 476], [860, 476]];
    const far = corners.reduce((m, c) => (Math.hypot(c[0] - b.x, c[1] - b.y) > Math.hypot(m[0] - b.x, m[1] - b.y) ? c : m));
    const fp = g.nearestFreePos(far[0], far[1]);
    g.player.x = fp.x; g.player.y = fp.y;
    const shotsBefore = g.room.projectiles.filter((p) => p.team === 'enemy').length;
    a.hurt(1, g);
    step(2, [a, b]);
    if (!(b.state.angry > 2.5) || a.state.angry > 0) out.push('Cherry-Pick: Treffer macht nicht den Partner wuetend (a ' + a.state.angry + ', b ' + b.state.angry + ')');
    step(150, [a, b]);
    if (!(b.state.angry > 0)) out.push('Cherry-Pick: Wut endet zu frueh');
    if (g.room.projectiles.filter((p) => p.team === 'enemy').length <= shotsBefore) out.push('Cherry-Pick: wuetende Kirsche spuckt keinen Kern');
    step(60, [a, b]);
    if (b.state.angry > 0) out.push('Cherry-Pick: Wut haelt laenger als ~3 s');
    // 4) Leine haelt auch bei kraeftigem Rueckstoss direkt vom Partner weg und wenn a weit weggesetzt wird
    a.knockback(a.x - b.x || 1, a.y - b.y, 2500);
    step(60, [a, b]);
    const away = g.nearestFreePos(b.x < 480 ? 860 : 100, b.y < 288 ? 476 : 100);
    a.x = away.x; a.y = away.y;
    step(1, [a, b]);
    if (maxD > leash + 1) out.push('Cherry-Pick: Stiel gedehnt auf ' + maxD.toFixed(1) + ' px (max ' + leash + ')');
    // 5) Stirbt a, bleibt b fuer immer wuetend (ohne Partner)
    a.die(g);
    step(400, [a, b]);
    if (b.state.partner || !b.state.widowed || !(b.state.angry > 0)) out.push('Cherry-Pick: Ueberlebende ist nicht dauerhaft wuetend');
    // 6) Einzeln erzeugt (Debug-Spawn): waechst sich einen Partner
    BOTA.debug.killAll();
    const solo = BOTA.debug.spawn('cherry_pick', 480, 300);
    solo.spawnDelay = 0;
    solo.update(DT, g);
    if (!solo.state.partner || solo.state.partner.state.partner !== solo || cherries().length !== 2) out.push('Cherry-Pick: Einzel-Spawn bekommt keinen Partner');
    for (let i = 0; i < 3; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    return out;
  }));

  // --- Orphan Commit: seltener Bonus nur auf Forgotten Branches, flieht, Fangen/Abschuss -> 2–3 Credits,
  //     Garbage Collection nach 12 s ohne Beute und ohne Kill; blockiert nie die Tueren ---
  const orphanProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, E = BOTA.ENEMIES;
    // 1) Raum-Wuerfe: hoechstens einer pro Raum, nur auf Forgotten Branches, dort grob mit der Bonus-Chance
    const keys = BOTA.FLOOR_THEMES.map((t) => t.key);
    for (let d = 1; d <= 2 * keys.length; d++) {
      let rooms = 0, withOrphan = 0;
      for (let i = 0; i < 600; i++) {
        const l = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('orphan' + d + ':' + i)), d);
        const n = l.filter((id) => id === 'orphan_commit').length;
        if (n > 1) { out.push('Orphan Commit: ' + n + ' in einem Raum (Etage ' + d + ')'); break; }
        rooms++; withOrphan += n;
      }
      const share = withOrphan / rooms;
      if (BOTA.themeKeyAt(d) !== 'branches') { if (share > 0) out.push('Orphan Commit auf Etage ' + d); continue; }
      const want = Math.min(0.25, E.orphan_commit.bonusChance + 0.01 * (d - 1));
      if (Math.abs(share - want) > 0.05) out.push('Orphan Commit: Anteil ' + share.toFixed(3) + ' statt ~' + want.toFixed(2) + ' auf Etage ' + d);
    }

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    const p = g.player;
    const DT = 1 / 60;
    const step = (e, n) => { for (let i = 0; i < n; i++) { e.frozen = 0; e.update(DT, g); } };
    const credits = () => g.room.pickups.filter((pk) => pk.type === 'credit' && !pk.dead).length;
    const events = [];
    const log = (name) => (ev) => events.push(name + ':' + (ev.count || ''));
    const offC = BOTA.bus.on('orphanCaught', log('caught')), offV = BOTA.bus.on('enemyVanish', log('vanish'));
    const spawn = (x, y) => { const o = BOTA.debug.spawn('orphan_commit', x, y); o.spawnDelay = 0; return o; };
    try {
      // 2) Harmlos und haelt die Tueren nicht zu
      p.x = 480; p.y = 320;
      const a = spawn(560, 320);
      if (!a.ignoreForClear || a.contactDamage !== 0) out.push('Orphan Commit: blockiert das Clearing oder macht Schaden');
      if (g.room.hasLivingEnemies()) out.push('Orphan Commit: Raum gilt mit ihm als nicht geraeumt');
      // 3) Flieht: nach 2 s deutlich weiter weg, in einer Ecke (lokales Maximum des Flow-Fields)
      g.room.updateFlow(p.x, p.y);
      const d0 = Math.hypot(a.x - p.x, a.y - p.y);
      step(a, 120);
      const d1 = Math.hypot(a.x - p.x, a.y - p.y);
      if (d1 < d0 + 150) out.push('Orphan Commit: flieht nicht (' + Math.round(d0) + ' -> ' + Math.round(d1) + ' px)');
      // 4) Fangen durch Beruehrung: stirbt, 2–3 Credits, Spieler unverletzt; klappt auch eingefroren
      const hp0 = p.health, c0 = credits();
      a.frozen = 5; p.x = a.x; p.y = a.y;
      a.update(DT, g);
      const got = credits() - c0;
      if (!a.dead) out.push('Orphan Commit: Beruehrung faengt ihn nicht (auch eingefroren)');
      if (got < 2 || got > 3) out.push('Orphan Commit: ' + got + ' Credits beim Fangen');
      if (p.health !== hp0) out.push('Orphan Commit: Fangen hat den Spieler verletzt');
      // 5) Abschuss zaehlt ebenfalls als Fang
      p.x = 150; p.y = 450;
      const b = spawn(700, 250);
      const c1 = credits();
      b.hurt(999, g, null);
      if (!b.dead || credits() - c1 < 2) out.push('Orphan Commit: Abschuss wirft keine Credits aus');
      // 6) Garbage Collection: verschwindet nach Ablauf, ohne Beute und ohne Kill; Warnung vorher
      const c = spawn(700, 250);
      const c2 = credits(), kills = g.runStats.kills;
      step(c, Math.round((E.orphan_commit.params.life - E.orphan_commit.params.fadeAt + 0.2) / DT));
      if (c.dead || c.sayText !== 'gc pending...') out.push('Orphan Commit: keine GC-Warnung vor dem Verschwinden');
      step(c, Math.round((E.orphan_commit.params.fadeAt + 0.2) / DT));
      if (!c.dead) out.push('Orphan Commit: wird nicht eingesammelt');
      if (credits() !== c2 || g.runStats.kills !== kills) out.push('Orphan Commit: Garbage Collection gibt Beute oder zaehlt als Kill');
      // Events in dieser Reihenfolge: zwei Faenge (mit Credit-Anzahl), dann eine Garbage Collection
      const kinds = events.map((x) => x.split(':')[0]).join(',');
      if (kinds !== 'caught,caught,vanish' || events[0] !== 'caught:' + got) out.push('Orphan Commit: Events ' + events.join(','));
    } finally {
      offC(); offV();
      for (const pk of g.room.pickups) if (pk.type === 'credit') pk.dead = true;
    }
    return out;
  });
  problems.push(...orphanProblems);

  // --- Octopus Merge: nur Forgotten Branches; 8 Arme a 5 Segmente (proxy 60 %); jeder Schwung/Schlag/Schuss/Strom
  //     mit Telegraph; je 12 % HP ein Merge (mind. ein Arm bleibt); Phase 2 bei 50 %; Arm-Kontakt; sauberer Tod ---
  const octoProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, DEF = BOTA.BOSSES.octopus_merge;
    // 1) Boss-Wahl: nur auf Forgotten Branches, dort beim ersten Besuch grob mit seinem Gewichtsanteil (aus den
    //    Gewichten der auf dieser Etage moeglichen Bosse berechnet, damit spaeteres Feintuning den Test nicht bricht)
    for (let d = 1; d <= 2 * BOTA.FLOOR_THEMES.length; d++) {
      let n = 0;
      for (let i = 0; i < 400; i++) if (BOTA.rollBossVaried(new BOTA.RNG(BOTA.hashString('octo' + d + ':' + i)), d, []) === 'octopus_merge') n++;
      if (BOTA.themeKeyAt(d) !== 'branches') { if (n) out.push('Octopus Merge auf Etage ' + d); continue; }
      const th = BOTA.themeKeyAt(d);
      const ids = Object.keys(BOTA.BOSSES).filter((id) => BOTA.bossEligible(BOTA.BOSSES[id], d, th));
      const total = ids.reduce((sum, id) => sum + BOTA.bossWeightAt(BOTA.BOSSES[id], th), 0);
      const want = BOTA.bossWeightAt(DEF, th) / total;
      if (Math.abs(n / 400 - want) > 0.08) out.push('Octopus Merge: Anteil ' + (n / 400).toFixed(2) + ' statt ~' + want.toFixed(2) + ' auf Etage ' + d);
    }

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player; p.x = 150; p.y = 470;
    const DT = 1 / 60, I = BOTA.C.INNER;
    const stepAll = (n, each) => {
      for (let i = 0; i < n; i++) {
        for (const en of g.room.enemies.slice()) { if (en.dead) continue; en.frozen = 0; en.update(DT, g); }
        g.room.enemies = g.room.enemies.filter((en) => !en.dead);
        if (g.room.projectiles.length > 150) g.room.projectiles.length = 0;   // Projektil-Limit nicht erreichen
        if (each) each();
      }
    };
    // Mitschnitt: alle Boss-Schuesse (Geschwindigkeit, Telegraph), Events
    const shots = [];
    const origShoot = AI.shoot, origShootAt = AI.shootAt, origHurt = p.hurt;
    AI.shoot = function (game, e, angle, speed, opts) {
      if (e && (e.id === 'octopus_merge' || e.id === 'octo_arm')) shots.push({ id: e.id, angle, speed, glow: e.state.glow || 0, stream: e.state.stream });
      return origShoot.apply(this, arguments);
    };
    AI.shootAt = function (game, e) {
      if (e && e.id === 'octo_arm') shots.push({ id: 'tip', glow: e.state.glow || 0 });
      return origShootAt.apply(this, arguments);
    };
    const hurts = [];
    p.hurt = function (amount, src) { hurts.push({ amount, src }); return origHurt.apply(this, arguments); };
    const ev = [];
    const offs = ['bossMerge', 'bossPhase', 'enemyDeath'].map((n) => BOTA.bus.on(n, (x) => ev.push(n + (x.boss === true ? ':boss' : ''))));
    try {
      // 2) Aufbau: 8 Arme a 5 Segmente, alle mit proxy auf den Knoten, ignoreForClear; Knoten blockiert das Clearing
      const O = BOTA.debug.spawnBoss('octopus_merge', 480, 288);
      O.spawnDelay = 0;
      const S = O.state;
      for (const a of S.arms) for (const seg of a.segs) seg.spawnDelay = 0;
      if (S.arms.length !== 8 || S.arms.some((a) => a.segs.length !== 5)) out.push('Octopus Merge: Arme ' + S.arms.map((a) => a.segs.length).join(','));
      const segs = S.arms.flatMap((a) => a.segs);
      if (segs.some((sg) => sg.id !== 'octo_arm' || sg.proxy !== O || !sg.ignoreForClear)) out.push('Octopus Merge: Segmente falsch verknuepft');
      if (!g.room.hasLivingEnemies()) out.push('Octopus Merge: Raum gilt mit lebendem Knoten als geraeumt');
      // 3) Nach der Schonfrist ausgerollt; alle Segmente bleiben im Innenraum (auch spaeter, siehe unten)
      let outside = 0;
      const inRoom = () => { for (const sg of segs) if (!sg.dead && (sg.x < I.x0 - 1 || sg.x > I.x1 + 1 || sg.y < I.y0 - 1 || sg.y > I.y1 + 1)) outside++; };
      stepAll(120, inRoom);
      if (S.arms.some((a) => a.len < 100)) out.push('Octopus Merge: Arme nach der Schonfrist nicht ausgerollt');
      // 4) Treffer auf ein Armsegment zaehlen zu 60 % am Knoten
      const hp0 = O.hp;
      S.arms[0].segs[2].hurt(10, g, {});
      if (Math.abs(hp0 - O.hp - 6) > 0.01) out.push('Octopus Merge: Armtreffer zieht ' + (hp0 - O.hp) + ' statt 6 ab');
      // 5) 20 s Kampf: jeder Schwung/Schlag folgt auf seinen Telegraph (>= 0.6 s), jeder Spitzen-Schuss auf ein Gluehen
      const last = S.arms.map((a) => ({ mode: a.mode, since: 0 }));
      let swings = 0, slams = 0;
      stepAll(1200, () => {
        inRoom();
        S.arms.forEach((a, i) => {
          const L = last[i];
          if (a.mode === L.mode) { L.since += DT; return; }
          if (a.mode === 'sweep') { swings++; if (L.mode !== 'sweepTell' || L.since < 0.6) out.push('Octopus Merge: Schwung ohne Telegraph'); }
          if (a.mode === 'slam') { slams++; if (L.mode !== 'slamTell' || L.since < 0.6) out.push('Octopus Merge: Schlag ohne Telegraph'); }
          last[i] = { mode: a.mode, since: 0 };
        });
      });
      const tips = shots.filter((x) => x.id === 'tip');
      if (swings + slams < 4) out.push('Octopus Merge: nur ' + (swings + slams) + ' Arm-Angriffe in 20 s');
      if (tips.length < 6) out.push('Octopus Merge: nur ' + tips.length + ' Spitzen-Schuesse in 20 s');
      if (tips.some((x) => x.glow < 0.5)) out.push('Octopus Merge: Spitzen-Schuss ohne Gluehen');
      // 6) Merge bei 88 %: ein Arm wird eingezogen und verschwindet samt Segmenten, der Rest wird schneller
      O.hp = O.maxHp * 0.87;
      stepAll(1);
      const active = () => S.arms.filter((a) => a.mode !== 'merge' && a.mode !== 'gone').length;
      if (active() !== 7 || !ev.includes('bossMerge')) out.push('Octopus Merge: kein Merge bei 87 % (' + active() + ' aktiv)');
      stepAll(60);
      const gone = S.arms.filter((a) => a.mode === 'gone');
      if (gone.length !== 1 || gone[0].segs.some((sg) => !sg.dead)) out.push('Octopus Merge: eingezogener Arm nicht entfernt');
      if (Math.abs(S.sm - 1.1) > 0.001) out.push('Octopus Merge: Tempo nach einem Merge ' + S.sm);
      // 7) Phase 2 bei 50 %: genau ein bossPhase, 4 Arme uebrig; Stroeme mit Telegraph, immer paarweise gegenlaeufig
      O.hp = O.maxHp * 0.49;
      shots.length = 0;
      let tellT = 0, sawFireAfterTell = false;
      stepAll(420, () => {
        inRoom();
        if (S.stream === 'tell') tellT += DT;
        if (S.stream === 'fire' && tellT >= 0.6) sawFireAfterTell = true;
        if (S.stream === 'idle') tellT = 0;
      });
      if (S.phase !== 2 || ev.filter((x) => x === 'bossPhase').length !== 1) out.push('Octopus Merge: Phase 2 nicht (genau einmal) erreicht');
      if (active() !== 4) out.push('Octopus Merge: ' + active() + ' statt 4 Arme bei 49 %');
      const stream = shots.filter((x) => x.id === 'octopus_merge');
      if (!sawFireAfterTell || stream.length < 10) out.push('Octopus Merge: Schussstroeme fehlen oder ohne Telegraph (' + stream.length + ')');
      for (let i = 0; i + 1 < stream.length; i += 2) {
        if (Math.abs(BOTA.M.angleDiff(stream[i].angle + Math.PI, stream[i + 1].angle)) > 0.01) { out.push('Octopus Merge: Stroeme nicht gegenlaeufig'); break; }
      }
      const speeds = shots.filter((x) => x.speed !== undefined).map((x) => x.speed);
      if (speeds.some((v) => v < 165 || v > 260)) out.push('Octopus Merge: Schussgeschwindigkeit ausserhalb 165–260: ' + speeds.find((v) => v < 165 || v > 260));
      if (outside) out.push('Octopus Merge: ' + outside + 'x Segment ausserhalb des Innenraums');
      // 8) Mindestens ein Arm bleibt
      O.hp = 1;
      stepAll(60);
      if (active() < 1 || S.merged > 7) out.push('Octopus Merge: alle Arme eingezogen');
      // 9) Kontakt entlang des Arms (nicht nur an den Segment-Kreisen): Spieler zwischen Ansatz und erstem Segment
      const arm = S.arms.find((a) => a.mode === 'idle' && a.len > 100);
      if (arm) {
        const s0 = arm.segs[0];
        p.x = (O.x + s0.x) / 2 + (s0.x - O.x) * 0.25; p.y = (O.y + s0.y) / 2 + (s0.y - O.y) * 0.25;
        p.invuln = 0; hurts.length = 0;
        O.update(DT, g);
        if (!hurts.some((h) => h.amount === 1)) out.push('Octopus Merge: Arm-Kontakt verletzt nicht');
      }
      p.x = 150; p.y = 470;
      // 10) Tod: genau ein Boss-Tod, danach platzen alle Arme; kein Segment bleibt uebrig
      ev.length = 0;
      O.hurt(1e6, g, {});
      stepAll(90);
      if (ev.filter((x) => x === 'enemyDeath:boss').length !== 1) out.push('Octopus Merge: ' + ev.filter((x) => x === 'enemyDeath:boss').length + ' Boss-Tode');
      if (g.room.enemies.some((en) => en.id === 'octo_arm' && !en.dead)) out.push('Octopus Merge: Armsegmente ueberleben den Knoten');
    } finally {
      AI.shoot = origShoot; AI.shootAt = origShootAt; p.hurt = origHurt;
      for (const off of offs) off();
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.projectiles.length = 0;
    }
    return out;
  });
  problems.push(...octoProblems);

  // --- Sandbox Borders: Etage 6; Kakteen nur dort, nur aus Felsen, nie vor Tueren, ~Anteil theme.cacti;
  //     Kaktus sticht (einmal, dann Unverwundbarkeit) und stoesst zurueck; Explosion sprengt ihn; Sprites da ---
  const sandProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, T = BOTA.TILES;
    const N = BOTA.FLOOR_THEMES.length;
    if (BOTA.themeKeyAt(6) !== 'sandbox' || BOTA.floorInfo(6).name !== 'Sandbox Borders') out.push('Etage 6 ist nicht Sandbox Borders');
    for (const [name, frames] of [['tile_cactus', 3], ['tile_sandstone', 3], ['tile_border', 3], ['prop_sandcastle', 2]]) {
      if (!BOTA.hasSprite(name) || BOTA.spriteFrameCount(name) !== frames) out.push('Sprite ' + name + ' fehlt oder hat nicht ' + frames + ' Frames');
    }
    // 1) Kartengenerierung ueber zwei Themen-Durchlaeufe
    const FRONT = { up: [7, 1], down: [7, 7], left: [1, 4], right: [13, 4] };
    let rocks = 0, cacti = 0;
    for (let d = 1; d <= 2 * N; d++) {
      const sandbox = BOTA.themeKeyAt(d) === 'sandbox';
      for (let i = 0; i < (sandbox ? 40 : 6); i++) {
        const f = new BOTA.Floor(d, 'sand' + d + ':' + i);
        for (const cell of f.cells.values()) {
          const rm = cell.room;
          const fronts = Object.keys(rm.doors).map((dir) => FRONT[dir]);
          for (let r = 1; r < 8; r++) {
            for (let c = 1; c < 14; c++) {
              const t = rm.tileAt(c, r);
              const fromRock = rm.layout && (rm.layout.rows[r - 1] || '')[c - 1] === 'r';
              if (t !== T.CACTUS) { if (sandbox && cell.type === 'normal' && t === T.ROCK) rocks++; continue; }
              cacti++;
              if (!sandbox) { out.push('Kaktus auf Etage ' + d); break; }
              if (cell.type !== 'normal') out.push('Kaktus in ' + cell.type + ' (Etage ' + d + ')');
              if (!fromRock) out.push('Kaktus nicht aus einem Fels entstanden (' + c + ',' + r + ')');
              if (fronts.some(([fc, fr]) => Math.abs(fc - c) <= 1 && Math.abs(fr - r) <= 1)) out.push('Kaktus vor einer Tuer (' + c + ',' + r + ')');
            }
          }
        }
        if (out.length > 5) break;
      }
    }
    // Anteil: von allen Felsen (ohne die vor Tueren) ist ungefaehr theme.cacti zum Kaktus geworden
    const want = BOTA.themeFor(6).cacti;
    const share = cacti / Math.max(1, cacti + rocks);
    if (!cacti || share < want - 0.15 || share > want + 0.05) out.push('Kaktus-Anteil ' + share.toFixed(2) + ' (Ziel ~' + want + ')');

    // 2) Stechen, Unverwundbarkeit, Rueckstoss, Sprengen — in einem leeren Raum mit einer gesetzten Kaktus-Kachel
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    const p = g.player, room = g.room;
    const prev = room.tileAt(5, 4);
    room.setTile(5, 4, T.CACTUS);
    const hurts = [], events = [];
    const origHurt = p.hurt;
    p.hurt = function (amount, src) { hurts.push(src); return origHurt.apply(this, arguments); };
    const offs = ['cactusPrick', 'rockBreak'].map((n) => BOTA.bus.on(n, (e) => events.push(n + ':' + (e.kind || ''))));
    try {
      // Spieler direkt rechts neben der Kachel (Kreis beruehrt den Rand); ohne God-Mode, mit voller Gesundheit
      BOTA.debug.god(false); p.health = p.maxHealth;
      p.x = 6 * 64 + p.r + 1; p.y = 4 * 64 + 32; p.invuln = 0; p.kbx = p.kby = 0;
      g.checkCactus(p);
      if (hurts[0] !== 'a cactus' || !events.includes('cactusPrick:')) out.push('Kaktus sticht nicht: ' + hurts.join(','));
      if (!(p.kbx > 0)) out.push('Kaktus stoesst nicht vom Kaktus weg (kbx ' + p.kbx + ')');
      const n = events.filter((x) => x === 'cactusPrick:').length;
      g.checkCactus(p);   // direkt danach: Unverwundbarkeit -> kein zweiter Stich
      if (events.filter((x) => x === 'cactusPrick:').length !== n) out.push('Kaktus sticht trotz Unverwundbarkeit erneut');
      // Mit Abstand: kein Stich
      p.invuln = 0; hurts.length = 0;
      p.x = 6 * 64 + p.r + 12;
      g.checkCactus(p);
      if (hurts.length) out.push('Kaktus sticht auf Abstand');
      // Explosion sprengt den Kaktus (rockBreak mit kind 'cactus')
      p.x = 480; p.y = 450; p.invuln = 5;
      g.explode(5 * 64 + 32, 4 * 64 + 32, 60, 0, 'the smoke test');
      if (room.tileAt(5, 4) !== T.FLOOR || !events.includes('rockBreak:cactus')) out.push('Explosion sprengt den Kaktus nicht');
      // Solide wie ein Fels (fuer Laeufer und Schuesse), Flieger kommen drueber
      room.setTile(5, 4, T.CACTUS);
      if (!room.isSolid(5, 4, 'walk', true) || !room.isSolid(5, 4, 'shot', false) || room.isSolid(5, 4, 'fly', false)) out.push('Kaktus hat falsche Kollision');
    } finally {
      p.hurt = origHurt;
      for (const off of offs) off();
      room.setTile(5, 4, prev);
      p.invuln = 0; p.health = p.maxHealth;
      BOTA.debug.god(true);
    }
    return out;
  });
  problems.push(...sandProblems);
  await page.evaluate(() => {
    const g = BOTA.game; g.enterFloor(6); g.setState('play');
    const c = [...g.floor.cells.values()].find((x) => x.type === 'normal' && x.room.props.size);
    c.room.populated = true; c.room.cleared = true; g.teleport(c.room);
  });
  await page.waitForTimeout(400);
  await shot('14-sandbox-borders');

  // --- Sandbox-Borders-Gegner: mehr Deprecation Warnings/Hallucinations dort; Spinlock (Ring, Rassel, Vorschnellen,
  //     Glieder schirmen ab); Rootkit (vergraben unverwundbar, Telegraph, 8er-Ring, Bombe scheucht heraus) ---
  const desertProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, E = BOTA.ENEMIES, DT = 1 / 60;
    const SB = BOTA.FLOOR_THEMES.findIndex((t) => t.key === 'sandbox') + 1;
    // 1) Baseline-Faktoren
    const dw = BOTA.enemyWeightAt(E.deprecation_warning, SB) / BOTA.enemyWeightAt(E.deprecation_warning, SB, 'none');
    if (Math.abs(dw - 2.5) > 1e-9) out.push('Deprecation Warning: Faktor ' + dw + ' auf Sandbox Borders');
    let hal = 0;
    for (let i = 0; i < 1500; i++) if (BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('hal:' + i)), SB).includes('hallucination')) hal++;
    if (Math.abs(hal / 1500 - 0.25) > 0.04) out.push('Hallucination: Anteil ' + (hal / 1500).toFixed(3) + ' statt ~0.25 auf Sandbox Borders');

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player; p.x = 150; p.y = 450;
    const stepAll = (n, each) => {
      for (let i = 0; i < n; i++) {
        for (const en of g.room.enemies.slice()) { if (!en.dead) { en.frozen = 0; en.update(DT, g); } }
        g.room.enemies = g.room.enemies.filter((en) => !en.dead);
        if (each && each() === false) break;
      }
    };
    const events = [];
    const offs = ['enemyWindup', 'enemyBurrow'].map((n) => BOTA.bus.on(n, (e) => events.push(n + ':' + (e.sound || (e.up ? 'up' : 'down')))));
    try {
      // 2) Spinlock
      p.x = 480; p.y = 460;                               // nah genug (< 380 px), damit er gleich rasselt
      const A = BOTA.debug.spawn('spinlock', 480, 230);
      A.spawnDelay = 0;
      const S = A.state, P = A.params, segs = S.segs;
      for (const sg of segs) sg.spawnDelay = 0;
      if (segs.length !== 4 || !segs[3].state.tail || segs.some((sg) => !sg.invulnerable || !sg.ignoreForClear || sg.state.head !== A)) out.push('Spinlock: Glieder falsch aufgebaut');
      const hp0 = A.hp;
      segs[1].hurt(10, g, {});
      if (A.hp !== hp0) out.push('Spinlock: Treffer auf ein Glied schadet dem Kopf');
      A.hurt(2, g, {});
      if (!(A.hp < hp0)) out.push('Spinlock: Kopf nimmt keinen Schaden');
      S.cd = 99;
      stepAll(30);
      const offRing = [A].concat(segs).filter((x) => Math.abs(Math.hypot(x.x - S.cx, x.y - S.cy) - P.ringR) > 6).length;
      if (offRing) out.push('Spinlock: ' + offRing + ' Teile nicht auf dem Ring');
      // Rassel -> Vorschnellen
      S.cd = 0.01;
      let rattleT = 0, lungeStart = null, maxGap = 0, lungeDmg = 0, sawCoilAgain = false;
      stepAll(480, () => {
        if (S.mode === 'rattle') rattleT += DT;
        if (S.mode === 'lunge') {
          if (!lungeStart) lungeStart = { x: A.x, y: A.y, rattleT };
          lungeDmg = Math.max(lungeDmg, A.contactDamage);
          let prev = A;
          for (const sg of segs) { maxGap = Math.max(maxGap, Math.hypot(sg.x - prev.x, sg.y - prev.y)); prev = sg; }
        }
        if (lungeStart && S.mode === 'coil') { sawCoilAgain = true; return false; }
      });
      if (!lungeStart) out.push('Spinlock: schnellt nie vor');
      else {
        if (lungeStart.rattleT < 0.6) out.push('Spinlock: Rassel-Telegraph nur ' + lungeStart.rattleT.toFixed(2) + ' s');
        if (!events.includes('enemyWindup:rattle')) out.push('Spinlock: kein Rassel-Event');
        if (lungeDmg !== 2) out.push('Spinlock: Vorschnellen macht ' + lungeDmg + ' statt 2 Schaden');
        if (maxGap > P.spacing + 1) out.push('Spinlock: Kette reisst (' + maxGap.toFixed(1) + ' px)');
        if (!sawCoilAgain || A.contactDamage !== 1) out.push('Spinlock: rollt sich nach dem Vorschnellen nicht wieder ein');
      }
      // Tod: Glieder zerfallen
      A.hurt(1e6, g, {});
      stepAll(60);
      if (g.room.enemies.some((en) => en.id === 'spinlock_segment')) out.push('Spinlock: Glieder ueberleben den Kopf');

      // 3) Rootkit
      p.x = 480; p.y = 300;
      const R = BOTA.debug.spawn('rootkit', 760, 420);
      R.spawnDelay = 0;
      const RS = R.state, RP = R.params;
      if (!R.intangible || R.contactDamage !== 0 || R.hurt(5, g, {})) out.push('Rootkit: vergraben nicht unverwundbar/harmlos');
      if (!g.room.hasLivingEnemies()) out.push('Rootkit: Raum gilt als geraeumt, obwohl er vergraben lebt');
      let tellT = 0, shotsAtUp = -1, upPos = null;
      const enemyShots = () => g.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead);
      stepAll(600, () => {
        if (RS.mode === 'tell') tellT += DT;
        if (RS.mode === 'up' && shotsAtUp < 0) { shotsAtUp = enemyShots().length; upPos = { x: R.x, y: R.y, tellT }; return false; }
      });
      if (!upPos) out.push('Rootkit: taucht nie auf');
      else {
        const t = g.room.worldToTile(upPos.x, upPos.y);
        const d = Math.hypot(upPos.x - p.x, upPos.y - p.y);
        if (g.room.tileAt(t.c, t.r) !== BOTA.TILES.FLOOR) out.push('Rootkit: taucht nicht auf freiem Sand auf');
        if (d < RP.nearMin * 0.75 - 1 || d > RP.nearMax + 50) out.push('Rootkit: taucht ' + Math.round(d) + ' px vom Spieler auf');
        if (upPos.tellT < 0.5) out.push('Rootkit: Telegraph nur ' + upPos.tellT.toFixed(2) + ' s');
        if (!events.includes('enemyWindup:dig') || !events.includes('enemyBurrow:up')) out.push('Rootkit: Events fehlen (' + events.join(',') + ')');
        const shots = enemyShots();
        if (shots.length !== RP.ring) out.push('Rootkit: ' + shots.length + ' statt ' + RP.ring + ' Schuesse beim Auftauchen');
        if (shots.some((pr) => pr.speed < 165 || pr.speed > 260)) out.push('Rootkit: Schussgeschwindigkeit ausserhalb 165–260');
        if (R.intangible || !R.hurt(1, g, {})) out.push('Rootkit: oben nicht verwundbar');
      }
      // wieder abtauchen, dann per Bombe herausscheuchen (ohne neuen Ring)
      stepAll(240, () => RS.mode !== 'buried' || (RS.mode === 'buried' && R.intangible && false));
      stepAll(200, () => !(RS.mode === 'buried' && R.intangible));
      if (RS.mode !== 'buried') out.push('Rootkit: taucht nicht wieder ab (' + RS.mode + ')');
      g.room.projectiles.length = 0;
      p.invuln = 5;
      g.explode(R.x, R.y, 60, 0, 'the smoke test');
      if (RS.mode !== 'up' || !RS.flushed || R.intangible) out.push('Rootkit: Bombe scheucht ihn nicht heraus');
      if (enemyShots().length) out.push('Rootkit: herausgescheucht feuert er trotzdem einen Ring');
    } finally {
      for (const off of offs) off();
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.projectiles.length = 0;
      p.invuln = 0;
    }
    return out;
  });
  problems.push(...desertProblems);

  // --- Nested Infinite Loop: ab Etage 8 statt der Infinite Loop; nur der aeussere lebende Ring feuert und ist
  //     greifbar; zerfaellt bei 50 % / 16,67 %; Schuesse mit Telegraph und in 165–260 px/s; bleibt im Raum ---
  const nestProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, DT = 1 / 60, I = BOTA.C.INNER;
    // 1) Abloesung: Infinite Loop bis Etage 7, Nested Loop ab 8 (und nie beide)
    for (let d = 1; d <= 22; d++) {
      for (let i = 0; i < 120; i++) {
        const id = BOTA.rollBossVaried(new BOTA.RNG(BOTA.hashString('nest' + d + ':' + i)), d, []);
        if (id === 'infinite_loop' && d >= 8) { out.push('Infinite Loop auf Etage ' + d); break; }
        if (id === 'nested_loop' && d < 8) { out.push('Nested Loop auf Etage ' + d); break; }
      }
    }
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player; p.x = 480; p.y = 500;
    const stepAll = (n, each) => {
      for (let i = 0; i < n; i++) {
        for (const en of g.room.enemies.slice()) { if (!en.dead) { en.frozen = 0; en.update(DT, g); } }
        g.room.enemies = g.room.enemies.filter((en) => !en.dead);
        if (g.room.projectiles.length > 150) g.room.projectiles.length = 0;
        if (each) each();
      }
    };
    const shots = [];
    const origShoot = AI.shoot;
    AI.shoot = function (game, e, angle, speed) {
      if (e && e.id === 'nested_loop_part') {
        const ring = e.state.ringObj;
        shots.push({ k: ring.k, speed, ghost: !!e.state.ghost, glow: ring.tell > 0 || ring.spiral === 'fire' || ring.headTell <= 0 });
      }
      return origShoot.apply(this, arguments);
    };
    const ev = [];
    const offs = ['bossPhase', 'enemyDeath'].map((n) => BOTA.bus.on(n, (x) => ev.push(n + (x.boss === true ? ':boss' : ''))));
    try {
      const N = BOTA.debug.spawnBoss('nested_loop');
      N.spawnDelay = 0;
      const S = N.state;
      for (const r of S.rings) for (const pt of r.parts) pt.spawnDelay = 0;
      if (S.rings.map((r) => r.parts.length).join(',') !== '14,9,5') out.push('Nested Loop: Ringe ' + S.rings.map((r) => r.parts.length).join(','));
      if (!N.intangible || N.contactDamage !== 0) out.push('Nested Loop: Mittelpunkt ist greifbar');
      stepAll(1);
      // nur Ring 0 greifbar; Treffer auf Ring 1 wirkungslos, auf Ring 0 zaehlt er
      const hp0 = N.hp;
      S.rings[1].parts[2].hurt(10, g, {});
      if (N.hp !== hp0) out.push('Nested Loop: innerer Ring nimmt Schaden');
      S.rings[0].parts[3].hurt(10, g, {});
      if (!(N.hp < hp0)) out.push('Nested Loop: aeusserer Ring nimmt keinen Schaden');
      const phase = (k, ticks) => {
        shots.length = 0;
        let outside = 0;
        stepAll(ticks, () => {
          for (const r of S.rings) for (const pt of r.parts) if (!pt.dead && !r.broken && (pt.x < I.x0 - 2 || pt.x > I.x1 + 2 || pt.y < I.y0 - 2 || pt.y > I.y1 + 2)) outside++;
        });
        if (!shots.length) out.push('Nested Loop: Ring ' + k + ' feuert nie');
        if (shots.some((x) => x.k !== k)) out.push('Nested Loop: in Phase ' + (k + 1) + ' feuert Ring ' + shots.find((x) => x.k !== k).k);
        if (shots.some((x) => x.ghost)) out.push('Nested Loop: ein Geister-Ring feuert');
        if (shots.some((x) => x.speed < 165 || x.speed > 260)) out.push('Nested Loop: Schussgeschwindigkeit ausserhalb 165–260');
        if (outside) out.push('Nested Loop: ' + outside + 'x Ringteil ausserhalb des Innenraums (Phase ' + (k + 1) + ')');
        const tangible = S.rings.map((r) => r.parts.some((pt) => !pt.dead && !pt.intangible));
        if (tangible.some((t, i) => t !== (i === k))) out.push('Nested Loop: greifbare Ringe in Phase ' + (k + 1) + ': ' + tangible.join(','));
      };
      phase(0, 600);
      // 50 %: Ring 0 zerfaellt
      N.hp = N.maxHp * 0.49;
      stepAll(1);
      if (S.active !== 1 || !S.rings[0].broken || ev.filter((x) => x === 'bossPhase').length !== 1) out.push('Nested Loop: kein Phasenwechsel bei 50 %');
      stepAll(120);
      if (S.rings[0].parts.some((pt) => !pt.dead)) out.push('Nested Loop: Ring 0 zerfaellt nicht');
      phase(1, 600);
      // 16,67 %: Ring 1 zerfaellt
      N.hp = N.maxHp * 0.16;
      stepAll(121);
      if (S.active !== 2 || S.rings[1].parts.some((pt) => !pt.dead) || ev.filter((x) => x === 'bossPhase').length !== 2) out.push('Nested Loop: kein Phasenwechsel bei 16,67 %');
      phase(2, 600);
      // Tod: genau ein Boss-Tod, danach keine Teile mehr
      ev.length = 0;
      N.hurt(1e6, g, {});
      N.takeHit(1e6, g, {}, N);
      stepAll(90);
      if (ev.filter((x) => x === 'enemyDeath:boss').length !== 1) out.push('Nested Loop: ' + ev.filter((x) => x === 'enemyDeath:boss').length + ' Boss-Tode');
      if (g.room.enemies.some((en) => en.id === 'nested_loop_part')) out.push('Nested Loop: Ringteile ueberleben den Boss');
    } finally {
      AI.shoot = origShoot;
      for (const off of offs) off();
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.projectiles.length = 0;
    }
    return out;
  });
  problems.push(...nestProblems);

  // --- Rogue Agent (ab Etage 7): haelt Abstand, Salven nur nach Gluehen; zwei 3er-Faecher oder drei Einzelschuesse ---
  const rogueProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, DT = 1 / 60;
    const def = BOTA.ENEMIES.rogue_agent;
    for (let d = 1; d <= 6; d++) {
      for (let i = 0; i < 200; i++) if (BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('rogue' + d + ':' + i)), d).includes('rogue_agent')) { out.push('Rogue Agent auf Etage ' + d); break; }
    }
    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player; p.x = 480; p.y = 290;
    const A = BOTA.debug.spawn('rogue_agent', 200, 150);
    A.spawnDelay = 0;
    if (!['boss_rogue_agent_a', 'boss_rogue_agent_b', 'boss_rogue_agent_c', 'boss_rogue_agent_d'].includes(A.spriteName)) out.push('Rogue Agent: unbekanntes Sprite ' + A.spriteName);
    // Mitschnitt der Salven: pro Salve Muster, Anzahl Aufrufe, Telegraph-Dauer davor, Geschwindigkeiten
    const volleys = [];
    let cur = null, tellT = 0;
    const origFan = AI.fan, origAt = AI.shootAt;
    const rec = (kind, speed) => {
      if (!cur) { cur = { pattern: A.state.pattern, calls: [], tell: tellT }; volleys.push(cur); }
      cur.calls.push({ kind, speed });
    };
    AI.fan = function (game, e, t, n, spr, speed) { if (e === A) rec('fan' + n, speed); return origFan.apply(this, arguments); };
    AI.shootAt = function (game, e, t, speed) { if (e === A) rec('single', speed); return origAt.apply(this, arguments); };
    let minD = Infinity, maxD = 0;
    try {
      for (let i = 0; i < 1500; i++) {
        A.frozen = 0; A.update(DT, g);
        if (A.state.mode === 'tell') tellT += DT;
        if (A.state.mode === 'move') { cur = null; tellT = 0; }
        if (g.room.projectiles.length > 150) g.room.projectiles.length = 0;
        if (i > 120) { const d = Math.hypot(A.x - p.x, A.y - p.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
      }
    } finally {
      AI.fan = origFan; AI.shootAt = origAt;
    }
    if (minD < def.params.near - 60 || maxD > def.params.far + 60) out.push('Rogue Agent: Abstand ' + Math.round(minD) + '–' + Math.round(maxD) + ' px');
    if (volleys.length < 5) out.push('Rogue Agent: nur ' + volleys.length + ' Salven in 25 s');
    for (const v of volleys) {
      const sig = v.calls.map((c) => c.kind).join(',');
      if (v.pattern === 'fans' && sig !== 'fan3,fan3') out.push('Rogue Agent: Faecher-Salve ' + sig);
      if (v.pattern === 'burst' && sig !== 'single,single,single') out.push('Rogue Agent: Einzelschuss-Salve ' + sig);
      if (v.tell < def.params.tell - 0.02) out.push('Rogue Agent: Salve nach nur ' + v.tell.toFixed(2) + ' s Gluehen');
      if (v.calls.some((c) => c.speed < 165 || c.speed > 260)) out.push('Rogue Agent: Schussgeschwindigkeit ausserhalb 165–260');
    }
    if (!volleys.some((v) => v.pattern === 'fans') || !volleys.some((v) => v.pattern === 'burst')) out.push('Rogue Agent: nicht beide Salven-Muster gesehen');
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    return out;
  });
  problems.push(...rogueProblems);

  // --- Dust Daemon (Sandbox Borders) und Dry Run (The Training Data): nur auf ihrer Etage (Tiefe 1–7);
  //     Dust Daemon: Wirbel lenkt Spielerschuesse im Drehsinn ab, gezielte Schuesse treffen den Kern immer, ausserhalb /
  //     erschoepft / eingefroren keine Ablenkung, Wurf erst nach Telegraph, 4 Brocken (einer auf den Spieler);
  //     Dry Run: Koerper wiederholt Weg und Schuesse des Geistes exakt delay Ticks spaeter, Geist macht keinen
  //     Schaden, Ausholen vor jedem Angriff, Tempo 165–260, sauberer Tod ---
  const probeProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, DT = 1 / 60;
    // 1) Heimat-Etagen (nur Tiefe 1–7: ab Tiefe 8 duerfen thematische Gegner auch anderswo auftauchen)
    const homes = { dust_daemon: 'sandbox', dry_run: 'training' };
    for (const [id, home] of Object.entries(homes)) {
      let atHome = 0;
      for (let d = 1; d <= 7; d++) {
        const isHome = BOTA.themeKeyAt(d) === home;
        for (let i = 0; i < 300; i++) {
          if (!BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('probe:' + id + d + ':' + i)), d).includes(id)) continue;
          if (isHome) atHome++;
          else { out.push(id + ' auf Etage ' + d + ' (' + BOTA.themeKeyAt(d) + ')'); break; }
        }
      }
      if (!atHome) out.push(id + ' taucht auf seiner Etage (' + home + ') nie auf');
    }

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player;
    const events = [];
    const offs = ['enemyWindup', 'enemyVanish'].map((n) => BOTA.bus.on(n, (e) => events.push(n + ':' + (e.sound || e.text || ''))));
    try {
      // 2) Dust Daemon: Schussablenkung (nur Projektile takten, der Daemon steht still im Modus drift)
      p.x = 120; p.y = 480;
      const D = BOTA.debug.spawn('dust_daemon', 480, 288);
      D.spawnDelay = 0;
      const S = D.state, P = D.params;
      if (S.mode !== 'drift' || S.power !== 1 || Math.abs(S.spin) !== 1) out.push('Dust Daemon: Startzustand falsch');
      /** Spielerschuss von (x, y) in Richtung (dx, dy); fliegt bis zum Ende. Ergebnis: Treffer + Richtungsaenderung */
      const fire = (x, y, dx, dy, speed, r) => {
        g.room.projectiles.length = 0;
        D.hp = D.maxHp;
        const n = Math.hypot(dx, dy);
        const pr = g.spawnProjectile({ x, y, vx: (dx / n) * speed, vy: (dy / n) * speed, team: 'player', damage: 0.01, r, range: 900 });
        const a0 = Math.atan2(pr.vy, pr.vx);
        for (let i = 0; i < 240 && !pr.dead; i++) pr.update(DT, g);
        const turn = BOTA.M.angleDiff(a0, Math.atan2(pr.vy, pr.vx));
        g.room.projectiles.length = 0;
        return { hit: pr.hitSet.has(D), turn };
      };
      // a) Gezielte Schuesse (Bahn < eye am Kern vorbei) treffen IMMER — aus 8 Richtungen, verschiedene Tempi/Groessen,
      //    von ausserhalb und von innerhalb des Wirbels
      let missed = 0, aimed = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.13;
        for (const dist of [200, 90]) {
          for (const lat of [0, -14, 14]) {
            for (const speed of [240, 480, 770]) {
              for (const r of [9, 5]) {
                if (Math.abs(lat) > D.r + r - 2) continue;
                const ux = -Math.cos(a), uy = -Math.sin(a);          // Flugrichtung (zum Kern)
                const x = D.x + Math.cos(a) * dist - uy * lat, y = D.y + Math.sin(a) * dist + ux * lat;
                aimed++;
                if (!fire(x, y, ux, uy, speed, r).hit) missed++;
              }
            }
          }
        }
      }
      if (missed) out.push('Dust Daemon: ' + missed + ' von ' + aimed + ' gezielten Schuessen verfehlen den Kern');
      // b) Vorbeifliegende Schuesse werden im Drehsinn abgelenkt (beide Seiten), ausserhalb des Wirbels nie
      const side = (lat) => fire(D.x - 200, D.y + lat, 1, 0, 480, 9);
      for (const lat of [-60, 60]) {
        const r = side(lat);
        if (!r.hit && (Math.abs(r.turn) < 0.25 || Math.sign(r.turn) !== S.spin)) out.push('Dust Daemon: Schuss mit ' + lat + ' px Abstand nur um ' + r.turn.toFixed(2) + ' rad abgelenkt (Drehsinn ' + S.spin + ')');
      }
      if (side(P.swirlR + 15).turn !== 0 || side(-P.swirlR - 15).turn !== 0) out.push('Dust Daemon: lenkt Schuesse ausserhalb des Wirbels ab');
      // Mit dem Wind geschossene Schuesse werden (bei passendem Abstand) in den Kern getragen
      let carried = 0;
      // (Drehsinn +1 dreht einen nach rechts fliegenden Schuss nach unten -> er muss oberhalb des Kerns fliegen)
      for (let lat = 28; lat <= 90; lat += 4) if (side(-lat * S.spin).hit) carried++;
      if (!carried) out.push('Dust Daemon: kein Schuss wird vom Wirbel in den Kern getragen');
      // Gegnerschuesse bleiben unberuehrt
      {
        g.room.projectiles.length = 0;
        const pr = g.spawnProjectile({ x: D.x - 200, y: D.y + 60, vx: 200, vy: 0, team: 'enemy' });
        for (let i = 0; i < 90 && !pr.dead; i++) pr.update(DT, g);
        if (pr.vy !== 0) out.push('Dust Daemon: lenkt Gegnerschuesse ab');
        g.room.projectiles.length = 0;
      }
      // eingefroren -> kein Wirbel
      D.frozen = 5;
      if (side(60).turn !== 0) out.push('Dust Daemon: lenkt eingefroren ab');
      D.frozen = 0;

      // c) Wurf: Telegraph (spinup + hold) vor den Schuessen, 4 Brocken, einer zielt auf den Spieler, danach erschoepft
      p.x = 230; p.y = 380;
      g.room.projectiles.length = 0;
      S.cd = 0.01;
      let tellT = 0, shots = null;
      for (let i = 0; i < 400; i++) {
        const before = S.mode;
        D.update(DT, g);
        if (S.mode === 'spinup' || S.mode === 'hold') tellT += DT;
        if (before === 'hold' && S.mode === 'calm') { shots = g.room.projectiles.filter((pr) => pr.team === 'enemy'); break; }
        if (D.dead) break;
      }
      if (!shots) out.push('Dust Daemon: wirft nie');
      else {
        if (tellT < P.spinup + P.hold - 0.05) out.push('Dust Daemon: Telegraph nur ' + tellT.toFixed(2) + ' s');
        if (!events.includes('enemyWindup:gust')) out.push('Dust Daemon: kein Wirbel-Event (enemyWindup gust)');
        if (shots.length !== P.clods) out.push('Dust Daemon: ' + shots.length + ' statt ' + P.clods + ' Brocken');
        if (shots.some((pr) => pr.speed < 165 || pr.speed > 260)) out.push('Dust Daemon: Schussgeschwindigkeit ausserhalb 165–260');
        // Abstand der Wurflinie (Strahl) zum Spieler; einer muss ihn treffen
        const lineDist = (pr) => {
          const ux = pr.vx / pr.speed, uy = pr.vy / pr.speed, rx = p.x - pr.x, ry = p.y - pr.y;
          const along = rx * ux + ry * uy;
          return along < 0 ? Infinity : Math.abs(rx * uy - ry * ux);
        };
        const best = Math.min(...shots.map(lineDist));
        if (!(best < 14)) out.push('Dust Daemon: kein Brocken zielt auf den Spieler (naechste Linie ' + best.toFixed(1) + ' px)');
        if (S.power !== 0) out.push('Dust Daemon: nach dem Wurf nicht erschoepft');
      }
      g.room.projectiles.length = 0;
      D.x = 480; D.y = 288;                                 // zurueck in die Mitte (erschoepft steht er still)
      if (side(60).turn !== 0) out.push('Dust Daemon: lenkt erschoepft trotzdem ab');
      for (let i = 0; i < Math.ceil((P.calm + P.rebuild) / DT) + 10; i++) { D.update(DT, g); S.cd = 99; }
      if (S.mode !== 'drift' || S.power !== 1) out.push('Dust Daemon: baut den Wirbel nicht wieder auf (' + S.mode + ', ' + S.power + ')');
      // d) Treibt 15 s lang und bleibt im Raum
      let outside = 0;
      const I = BOTA.C.INNER;
      for (let i = 0; i < 900; i++) {
        p.x = 480 + Math.cos(i / 80) * 300; p.y = 288 + Math.sin(i / 60) * 160;
        D.update(DT, g);
        if (g.room.projectiles.length > 100) g.room.projectiles.length = 0;
        if (D.x < I.x0 || D.x > I.x1 || D.y < I.y0 || D.y > I.y1) outside++;
      }
      if (outside) out.push('Dust Daemon: ' + outside + ' Ticks ausserhalb des Raums');
      D.hurt(1e6, g, {});
      if (!D.dead) out.push('Dust Daemon: stirbt nicht');
      g.room.projectiles.length = 0;
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();

      // 3) Dry Run: exakte Wiederholung
      const R = BOTA.debug.spawn('dry_run', 300, 200);
      R.spawnDelay = 0;
      const RS = R.state, RP = R.params, N = RP.delay, start = { x: R.x, y: R.y };
      const ghost = [], body = [], ghostShots = [], bodyShots = [], modes = [];
      let tick = 0, dmgOk = true, dashes = 0, sweeps = 0, aimRun = 0, badTell = 0;
      const origShoot = AI.shoot;
      AI.shoot = function (game, e, angle, speed, opts) {
        const pr = origShoot.apply(this, arguments);
        if (e === R && pr) bodyShots.push({ tick, a: angle, sp: speed, x: pr.x, y: pr.y });
        return pr;
      };
      try {
        for (let i = 0; i < 1500; i++) {
          p.x = 480 + Math.cos(i / 90) * 260; p.y = 288 + Math.sin(i / 70) * 150;
          if (i % 9 === 0) g.room.updateFlow(p.x, p.y);
          if (i === 500) R.frozen = 0.3;                         // Einfrieren pausiert beide Ebenen
          if (i === 700) { R.knockback(1, 0, 600); g.explode(R.x + 30, R.y, 60, 0, 'the smoke test'); }   // darf ihn nicht verschieben
          const active = !(R.frozen > 0);
          const gm0 = RS.gm;
          R.update(DT, g);
          if (!active) continue;
          ghost.push({ x: RS.g.x, y: RS.g.y });
          body.push({ x: R.x, y: R.y });
          const f = RS.queue[RS.queue.length - 1];
          modes.push(f.m);
          if (f.shot) ghostShots.push({ tick, a: f.shot.a, sp: f.shot.sp, x: RS.g.x + Math.cos(f.shot.a) * R.r * 0.6, y: RS.g.y + Math.sin(f.shot.a) * R.r * 0.6 });
          // Telegraph: jeder Angriff des Geistes beginnt nach >= windup Sekunden Ausholen
          if (RS.gm === 'aim') aimRun++;
          if (gm0 === 'aim' && (RS.gm === 'dash' || RS.gm === 'sweep')) {
            if (aimRun * DT < RP.windup - 0.02) badTell++;
            if (RS.gm === 'dash') dashes++; else sweeps++;
          }
          if (RS.gm !== 'aim') aimRun = 0;
          // Kontaktschaden: 2 nur waehrend des nachgespielten Sturmlaufs
          const fm = RS.frame && RS.frame.m;
          if (R.contactDamage !== (fm === 'dash' ? 2 : 1)) dmgOk = false;
          tick++;
          if (g.room.projectiles.length > 150) g.room.projectiles.length = 0;
        }
      } finally {
        AI.shoot = origShoot;
      }
      let maxDev = 0;
      for (let k = N; k < body.length; k++) maxDev = Math.max(maxDev, Math.hypot(body[k].x - ghost[k - N].x, body[k].y - ghost[k - N].y));
      for (let k = 0; k < N; k++) maxDev = Math.max(maxDev, Math.hypot(body[k].x - start.x, body[k].y - start.y));   // wartet am Start
      if (maxDev > 0.01) out.push('Dry Run: Koerper weicht bis zu ' + maxDev.toFixed(2) + ' px vom Weg des Geistes ab');
      const travelled = ghost.reduce((acc, q, k) => acc + (k ? Math.hypot(q.x - ghost[k - 1].x, q.y - ghost[k - 1].y) : 0), 0);
      if (travelled < 500) out.push('Dry Run: Geist bewegt sich kaum (' + Math.round(travelled) + ' px)');
      if (!dashes || !sweeps) out.push('Dry Run: nicht beide Angriffe gesehen (dash ' + dashes + ', sweep ' + sweeps + ')');
      if (badTell) out.push('Dry Run: ' + badTell + ' Angriffe ohne volles Ausholen');
      if (!dmgOk) out.push('Dry Run: Kontaktschaden passt nicht zum nachgespielten Modus');
      const expect = ghostShots.filter((s) => s.tick + N < tick);
      if (!expect.length) out.push('Dry Run: Geist schiesst nie');
      if (bodyShots.length !== expect.length) out.push('Dry Run: ' + bodyShots.length + ' echte Schuesse statt ' + expect.length + ' geprobter');
      let shotBad = 0;
      for (let k = 0; k < Math.min(bodyShots.length, expect.length); k++) {
        const b = bodyShots[k], q = expect[k];
        if (b.tick !== q.tick + N || Math.abs(BOTA.M.angleDiff(b.a, q.a)) > 1e-9 || b.sp !== q.sp || Math.hypot(b.x - q.x, b.y - q.y) > 0.01) shotBad++;
      }
      if (shotBad) out.push('Dry Run: ' + shotBad + ' Schuesse weichen von der Probe ab (Takt/Winkel/Tempo/Ort)');
      if (bodyShots.some((s) => s.sp < 165 || s.sp > 260)) out.push('Dry Run: Schussgeschwindigkeit ausserhalb 165–260');
      if (!events.includes('enemyWindup:rehearse') || !events.includes('enemyWindup:replay')) out.push('Dry Run: Ausholen-Events fehlen');
      // Geist macht keinen Schaden: Spieler steht still, der Geist stuermt (erzwungen) dreimal durch ihn hindurch;
      // gezaehlt werden nur Ticks, in denen der Geist den Spieler beruehrt und der Koerper weit weg ist
      g.room.projectiles.length = 0;
      let ghostHurts = 0, checked = 0;
      const origHurt = p.hurt;
      p.hurt = function () { ghostHurts++; return false; };
      p.x = 480; p.y = 300;
      g.room.updateFlow(p.x, p.y);
      try {
        for (let i = 0; i < 270; i++) {
          if (i % 90 === 0) {
            RS.g.x = p.x - 190; RS.g.y = p.y + (i / 90 - 1) * 12;
            RS.gm = 'aim'; RS.gatk = 'dash'; RS.gaim = Math.atan2(p.y - RS.g.y, p.x - RS.g.x); RS.gt = RP.windup;
          }
          g.room.projectiles = g.room.projectiles.filter((pr) => pr.team !== 'enemy');
          const before = ghostHurts;
          R.update(DT, g);
          const touch = Math.hypot(RS.g.x - p.x, RS.g.y - p.y) < R.r + p.r;
          const far = Math.hypot(R.x - p.x, R.y - p.y) > R.r + p.r + 10;
          if (touch && far) checked++;
          else ghostHurts = before;      // Beruehrung durch den Koerper (oder kein Geist-Kontakt) zaehlt hier nicht
        }
      } finally {
        p.hurt = origHurt;
      }
      if (checked < 10) out.push('Dry Run: Geist beruehrt den Spieler im Test zu selten (' + checked + ' Ticks)');
      if (ghostHurts) out.push('Dry Run: Geist verletzt den Spieler (' + ghostHurts + 'x)');
      // Tod: Geist verpufft, nichts bleibt zurueck
      R.hurt(1e6, g, {});
      if (!R.dead || !events.includes('enemyVanish:aborted')) out.push('Dry Run: Tod ohne Verpuffen des Geistes');
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.enemies = g.room.enemies.filter((en) => !en.dead);
      if (g.room.enemies.length) out.push('Dust Daemon/Dry Run: killAll laesst ' + g.room.enemies.length + ' Gegner zurueck');
      // Beide spawnen auch auf fremden Etagen sauber (Themen sickern ab Tiefe 8 auf alle Etagen)
      for (const id of ['dust_daemon', 'dry_run']) {
        const e = BOTA.debug.spawn(id, 480, 288);
        e.spawnDelay = 0;
        for (let i = 0; i < 240; i++) e.update(DT, g);
        if (e.dead || !Number.isFinite(e.x) || !Number.isFinite(e.y)) out.push(id + ': verhaelt sich nach 4 s seltsam');
      }
    } finally {
      for (const off of offs) off();
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.projectiles.length = 0;
      p.invuln = 0;
    }
    return out;
  });
  problems.push(...probeProblems);

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
