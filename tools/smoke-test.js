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
 *   - README.md: ~50 % der Etagen, nur in normalen Raeumen, deckt die Karte auf, aber nicht den Geheimraum
 *   - Etagen: FLOORS und FLOOR_THEMES gleich lang; Etage 3 = Forgotten Branches mit verzweigteren Karten
 *   - Etagen-Themen (themes/themeOnly): nur bekannte Themen und gueltige Faktoren; jede Etage fuellt Raeume nur
 *     mit erlaubten Gegnern und hat einen Boss; Test-Eintraege pruefen Ausschluss, Faktor und Bonus-Chance
 *   - Zerstoerbare Objekte: richtige Arten je Etage, erlaubte Plaetze, Raeume bleiben begehbar; Spielerschuss und
 *     Explosion zerbrechen sie, Gegnerschuss nicht
 *   - Off-Brand GPU: ~12 % Blindgaenger ohne Schaden; GPU-Preise 30/20
 *   - The Context Limit: nur dieses Thema hat ambient 'rain'; dort kommen Fluestern und Wetterleuchten als Events
 *     (Fluestern landet als Effekt im Raum), das Run-RNG bleibt dabei unberuehrt; auf anderen Etagen nichts davon;
 *     Raeume backen Pfuetzen, Regen/Ringe zeichnen ohne Konsolenfehler (Screenshot 08-context-rain)
 *   - Herz-Items: Long-Term Support +1 sofort, +1 je 2 Etagen tiefer (hoechstens 3 dazu); Swap File nimmt Herzen
 *     bei voller HP, 2 Herzen im Swap = +1 Container (auch Ueberlauf eines halb genutzten Herzens), nach 3 Containern
 *     wieder normal; Electron App +2 und Tempo -0.15; Reserved Instances nur im Shop fuer 30; Graceful Degradation
 *     +2, -0.2 Schaden je fehlendem vollen Herzen
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
 *   - Production-Familie (Etage 1–7 nur auf Production): Rate Limiter (Telegraph, genau 3 Schuesse je Salve, Lampen
 *     erloeschen einzeln, "429"-Pause harmlos mit 1,5-fachem Schaden, Lampen fuellen sich einzeln wieder);
 *     Port Scanner (Ports nie auf Hindernissen/Spawnpunkten/Mitte/vor Tueren, Mindestabstand, Nummern aufsteigend im
 *     Uhrzeigersinn; feste Reihenfolge, Ping vor jedem Auftauchen, Faecher nach Ziellinie, "FILTERED" unter dem
 *     Spieler; Tod und killAll hinterlassen keine Ports; ohne Ports Geschuetz-Modus); Schuesse cyan, 165–260 px/s
 *   - Dependency-Hell-Familie (Tiefe 1–7: Honeypot nur auf Dependency Hell, Rolling Release dort und auf Sandbox
 *     Borders): Honeypot zieht erst nach dem Telegraph, nur im Trichter, nie schneller als 60 % des Spielertempos;
 *     Wegrennen klappt, Stehenbleiben kostet nach der Kiefer-Warnung einen 2er-Biss; keine Gruben; Laeufer ja,
 *     Flieger nein; Bombe im Maul zuendet. Rolling Release zielt vor dem Rollen, prallt ab (auch an Felsen), wird je
 *     Abprall um genau `bump` schneller bis zur Obergrenze, Schadensfaktoren 0.5/1.5, Breaking Change mit Beben vor
 *     dem 6er-Ring (165–260 px/s), Neustart bei Grundtempo; beide sterben sauber
 *   - Etagen-Besetzung (home/AWAY) auf 1–7: Heimat-Gegner wie in ROSTER, Auswaerts-Faktor genau AWAY, Raeume voll,
 *     Auswaerts-Anteil 5–45 %; Kakophonie ab 8 (mixAt, Anhebung, Familien ueberall, Octopus Merge gedeckelt);
 *     Determinismus (Begegnungen ziehen nicht aus dem Etagen-RNG)
 *   - Zwischenboss-Begegnungen ab 8: Anzahl je Tiefe, Platzierung, offene Arena, nie der Etagen-Boss; jeder der vier
 *     Bosse durch eine Tuer: kein Intro, HP x ENCOUNTER_HP, agiert, raeumt den Raum, keine Falltuer/Reste
 *   - Themen-Gegner und -Bosse "nur auf ihrer Etage" gilt vor Etage 8 (danach Kakophonie)
 *   - Spaete Bosse ab Etage 7: Megalith/Shareholder nie vorher, Monolith/Stakeholder ab 7 nie als Etagen-Boss;
 *     Zwischenbosse nie der Vorgaenger des Etagen-Bosses (replaces). Megalith: jede Codezeile hat eine Luecke,
 *     aufeinanderfolgende Luecken sind erreichbar, Phase 2 genau eine Markerzeile; Zeilen, Suchtreffer, Stampfring
 *     und Brocken erst nach ihrem Telegraph; "Refactor rejected" bei 50 % mit 4 Modulen, angekommenes Modul heilt
 *     4 % (nie ueber 50 %, kein Kill), erschossenes nicht; HUD zaehlt Zeilen; Tod nimmt die Module mit.
 *     Shareholder: beamPath prallt korrekt ab und bleibt im Raum, der Strahl trifft auch nach dem Abprall (und nicht
 *     daneben), erst nach Zielen + Einfrieren; Dividenden platzen in je 6; Muenzen treffen erst beim Aufschlag,
 *     echte Credits hoechstens coinCap und sie verfallen; "Hostile takeover" bei 40 %; Rueckkauf friert ein und
 *     schickt alle Kugeln zu ihm; Quartal verfehlt -> betaeubt (Schadensfaktor, danach weg), geschlagen -> Ring erst
 *     nach Telegraph und schneller; alle Kugeln 165–260 px/s; je genau ein Boss-Tod
 *   - Dust Daemon / Dry Run: in Tiefe 1–7 nur auf Sandbox Borders bzw. The Training Data; Dust Daemon lenkt
 *     Spielerschuesse im Drehsinn ab (nicht ausserhalb, nicht erschoepft/eingefroren, keine Gegnerschuesse), gezielte
 *     Schuesse treffen den Kern immer, Wurf nach Telegraph mit 4 Brocken (einer auf den Spieler), bleibt im Raum;
 *     Dry Run wiederholt Weg und Schuesse des Geistes exakt delay Ticks spaeter (auch nach Einfrieren/Rueckstoss),
 *     Ausholen vor jedem Angriff, Geist harmlos, Tempo 165–260, Geist verpufft beim Tod
 *   - Stack Trace: auf Tiefe 1–7 nur auf Legacy Codebase; Telegraph vor jedem Stich; Stachel 2, Papier 1, Einfalten
 *     harmlos; Exception nur jenseits der Reichweite (165–260 px/s), verpufft mit ihm; Waende kuerzen den Schwanz;
 *     Stack-Abbau 5 -> 4 -> 3; killAll laesst nichts zurueck
 *   - Spezialraeume, Pause- und Todesbildschirm rendern
 * Screenshots landen in tools/out/ (nicht einchecken).
 *
 * Aufruf:   node tools/smoke-test.js
 * Voraussetzung: Node.js + Playwright mit Chromium; einmalig einrichten mit
 *   bash tools/setup-dev.sh
 * (keine Admin-Rechte noetig; das Spiel selbst braucht nichts davon)
 *
 * SICHERHEIT: Der Test oeffnet nur die lokale Datei; die CSP des Spiels blockiert ohnehin jedes Netzwerk.
 *   - Summarizer (The Context Limit): nie vor Etage 8, auf Etage 11 staerker gewichtet, max. 1 pro Raum; haelt
 *     Abstand; volle Telegraph-Dauer vor jedem Verschmelzen; Treffer bzw. totes Ziel bricht ab; HP = Summe, Max-HP
 *     und Radius wachsen (gedeckelt), der Geschluckte verschwindet ohne enemyDeath/Kill, Raum wird danach clear;
 *     ungeeignete Gegner nie gewaehlt; hoechstens 2x zusammengefasst; killAll laesst nichts zurueck
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
        if (c.type !== 'normal' || (!c.room.plannedEnemies.length && !c.room.encounterBoss)) out.push('fuzz' + i + ': lose Pickups in ' + c.type);
        if (ll.length > 2 || ll.some((t) => !BOTA.LOOSE_LOOT.types[t])) out.push('fuzz' + i + ': lose Pickups ' + ll.join(','));
      }
      combatRooms += [...f.cells.values()].filter((c) => c.type === 'normal' && (c.room.plannedEnemies.length || c.room.encounterBoss)).length;
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
        if (c.type !== 'normal' || (!c.room.plannedEnemies.length && !c.room.encounterBoss)) out.push('fuzz' + i + ': Rohr in ' + c.type);
      }
    }
    if (Math.abs(pipeRooms / Math.max(1, combatRooms) - 0.1) > 0.04) out.push('Anteil Raeume mit Rohr ' + (pipeRooms / combatRooms).toFixed(3));
    if (Math.abs(readmeFloors / 300 - 0.5) > 0.08) out.push('Anteil Etagen mit README ' + (readmeFloors / 300).toFixed(2));
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
        const bad = list.filter((id) => (BOTA.ENEMIES[id].minFloor || 1) > d || BOTA.themeWeight(BOTA.ENEMIES[id], th, d) <= 0);
        if (bad.length) { out.push('Etage ' + d + ' (' + th + '): nicht erlaubte Gegner ' + bad.join(',')); break; }
      }
      const boss = BOTA.rollBoss(new BOTA.RNG(d), d);
      if (!BOTA.BOSSES[boss] || BOTA.themeWeight(BOTA.BOSSES[boss], th, d) <= 0) out.push('Etage ' + d + ' (' + th + '): kein erlaubter Boss');
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
        const boss = BOTA.rollBossVaried(new BOTA.RNG(d), d, []);
        if (d < BOTA.MIX_FROM) {
          if (branches !== (only > 0)) out.push('themeOnly: Anteil ' + only.toFixed(3) + ' auf Etage ' + d);
          if (branches !== (bonus > 0)) out.push('themeOnly (Bonus): Anteil ' + bonus.toFixed(3) + ' auf Etage ' + d);
          if (branches && zero > 0) out.push('themes 0: trotzdem gespawnt auf Etage ' + d);
          // Bosse: themeOnly-Boss nur (und mit Gewicht 1000 praktisch immer) auf seinem Thema
          if (branches !== (boss === '__boss')) out.push('Boss themeOnly: ' + boss + ' auf Etage ' + d);
        } else {
          // Kakophonie: Ausschluss (themeOnly, Faktor 0) wird angehoben -> taucht ueberall auf
          if (!(only > 0)) out.push('Kakophonie: themeOnly fehlt auf Etage ' + d);
          if (!(bonus > 0)) out.push('Kakophonie: themeOnly-Bonus fehlt auf Etage ' + d);
          if (!(zero > 0)) out.push('Kakophonie: themes 0 fehlt auf Etage ' + d);
          // Themen-Boss: auf seiner Etage praktisch immer, sonst hoechstens mit Gewicht 3 x Mischungsgrad
          if (branches && boss !== '__boss') out.push('Boss themeOnly fehlt auf seiner Etage ' + d);
          const bw = BOTA.bossWeightAt(BS.__boss, BOTA.themeKeyAt(d), d);
          if (!branches && Math.abs(bw - 3 * BOTA.mixAt(d)) > 1e-9) out.push('Kakophonie: Themen-Boss-Gewicht ' + bw + ' auf Etage ' + d);
        }
        if (!branches && zero <= 0) out.push('themes: neutraler Gegner fehlt auf Etage ' + d);
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

  // --- Herz-Items (2026-11-03): an einem frischen Spieler, damit die vorher vergebenen Items nicht mitspielen ---
  const heartProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, PT = BOTA.PICKUP_TYPES;
    const fresh = () => { const pl = new BOTA.Player(480, 300); pl.recalcStats(); return pl; };
    const realDepth = g.depth;
    try {
      // Long-Term Support: +1 sofort, dann +1 je 2 Etagen, hoechstens 3 dazu
      let pl = fresh();
      pl.giveItem('long_term_support', g);
      if (pl.maxHealth !== 8 || pl.health !== 8) out.push('LTS: sofort ' + pl.maxHealth + '/' + pl.health + ' statt 8/8');
      const st = pl.itemState.long_term_support;
      const tick = () => BOTA.ITEMS.long_term_support.update(pl, 1 / 60, g);
      g.depth = st.from + 1; tick();
      if (pl.maxHealth !== 8) out.push('LTS: Patch schon nach 1 Etage');
      g.depth = st.from + 2; tick(); tick();
      if (pl.maxHealth !== 10 || pl.health !== 10) out.push('LTS: nach 2 Etagen ' + pl.maxHealth + '/' + pl.health + ' statt 10/10');
      g.depth = st.from + 20; for (let i = 0; i < 10; i++) tick();
      if (pl.maxHealth !== 14) out.push('LTS: nach vielen Etagen ' + pl.maxHealth + ' statt 14 (1 + 3 Container)');
      g.depth = realDepth;
      // Swap File: volle HP -> Herz wird genommen und gebankt; 2 Herzen = +1 Container; Ueberlauf zaehlt; nach 3 Schluss
      pl = fresh();
      pl.giveItem('swap_file', g);
      const sw = pl.itemState.swap_file;
      if (!PT.heart.collect(pl, g)) out.push('Swap File: Herz bei voller HP nicht genommen');
      if (sw.bank !== 2 || pl.maxHealth !== 6) out.push('Swap File: nach 1 Herz bank ' + sw.bank + ', max ' + pl.maxHealth);
      PT.heart.collect(pl, g);
      if (pl.maxHealth !== 8 || pl.health !== 8 || sw.bank !== 0) out.push('Swap File: nach 2 Herzen ' + pl.maxHealth + '/' + pl.health + ', bank ' + sw.bank);
      pl.health = 7;
      if (!PT.heart.collect(pl, g) || pl.health !== 8 || sw.bank !== 1) out.push('Swap File: Ueberlauf nicht gebankt (' + pl.health + ', bank ' + sw.bank + ')');
      for (let i = 0; i < 12; i++) PT.heart_half.collect(pl, g);
      if (sw.made !== 3 || pl.maxHealth !== 12) out.push('Swap File: ' + sw.made + ' Container, max ' + pl.maxHealth + ' statt 3 / 12');
      if (PT.heart.collect(pl, g)) out.push('Swap File: nimmt nach 3 Containern weiter Herzen bei voller HP');
      const plain = fresh();
      if (PT.heart.collect(plain, g)) out.push('Herz wird ohne Swap File bei voller HP genommen');
      // Electron App: +2, Tempo -0.15
      pl = fresh();
      const sp0 = pl.stats.speed;
      pl.giveItem('electron_app', g);
      if (pl.maxHealth !== 10 || pl.health !== 10) out.push('Electron App: ' + pl.maxHealth + '/' + pl.health + ' statt 10/10');
      if (Math.abs(pl.stats.speed - (sp0 - 0.15)) > 1e-6) out.push('Electron App: Tempo ' + pl.stats.speed + ' statt ' + (sp0 - 0.15));
      // Reserved Instances: nur Shop, 30 Credits, +2
      const ri = BOTA.ITEMS.reserved_instances;
      if (ri.pools.join() !== 'shop' || BOTA.itemPrice('reserved_instances') !== 30) out.push('Reserved Instances: Pools ' + ri.pools + ', Preis ' + BOTA.itemPrice('reserved_instances'));
      pl = fresh(); pl.giveItem('reserved_instances', g);
      if (pl.maxHealth !== 10 || pl.health !== 10) out.push('Reserved Instances: ' + pl.maxHealth + '/' + pl.health);
      // Graceful Degradation: +2, -0.2 Schaden je fehlendem vollen Herzen (halbe zaehlen nicht)
      pl = fresh();
      const d0 = pl.stats.damage;
      pl.giveItem('graceful_degradation', g);
      if (pl.maxHealth !== 10 || Math.abs(pl.stats.damage - d0) > 1e-6) out.push('Graceful Degradation: bei voller HP ' + pl.maxHealth + ', Schaden ' + pl.stats.damage);
      pl.health = 5; pl.recalcStats();   // 5 von 10 halben: 2 volle Herzen fehlen (das halbe zaehlt nicht)
      if (Math.abs(pl.stats.damage - (d0 - 0.4)) > 1e-6) out.push('Graceful Degradation: Schaden ' + pl.stats.damage.toFixed(2) + ' statt ' + (d0 - 0.4).toFixed(2));
      pl.heal(5);
      if (Math.abs(pl.stats.damage - d0) > 1e-6) out.push('Graceful Degradation: Schaden nach Heilung ' + pl.stats.damage);
    } finally {
      g.depth = realDepth;
    }
    return out;
  });
  problems.push(...heartProblems);

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
    // Spawn-Verteilung: auf Etage 3 (Forgotten Branches) dabei, auf anderen Etagen vor der Kakophonie (8) nie
    let onBranches = 0;
    for (const d of [2, 3, 4, 5, 6, 7]) {
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
    // Raum ohne Gruben: Schritt 4 setzt eine Kirsche weit weg; hinter einem Grubengraben kann die Leine (Laeufer)
    // sie nicht heranziehen — das ist im Spiel unerreichbar (seit der Etagen-Besetzung 2026-11-03 kam hier pit_moat)
    const normals = [...g.floor.cells.values()].filter((c) => c.type === 'normal');
    const cell = normals.find((c) => !c.room.layout || !c.room.layout.rows.join('').includes('p')) || normals[0];
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
      // vor Etage 8 nur auf Forgotten Branches, danach ueberall mit angehobenem Faktor (Kakophonie)
      const f = BOTA.themeWeight(E.orphan_commit, BOTA.themeKeyAt(d), d);
      if (f <= 0) { if (share > 0) out.push('Orphan Commit auf Etage ' + d); continue; }
      const want = Math.min(0.25, (E.orphan_commit.bonusChance + 0.01 * (d - 1)) * f);
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
      if (BOTA.themeKeyAt(d) !== 'branches' && d < BOTA.MIX_FROM) { if (n) out.push('Octopus Merge auf Etage ' + d); continue; }
      const th = BOTA.themeKeyAt(d);
      const ids = Object.keys(BOTA.BOSSES).filter((id) => BOTA.bossEligible(BOTA.BOSSES[id], d, th));
      const total = ids.reduce((sum, id) => sum + BOTA.bossWeightAt(BOTA.BOSSES[id], th, d), 0);
      const want = BOTA.bossWeightAt(DEF, th, d) / total;
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
    const dw = BOTA.enemyWeightAt(E.deprecation_warning, SB) / BOTA.enemyWeightAt(E.deprecation_warning, SB, null);
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

  // --- Spaete Bosse ab Etage 7: The Megalith (statt Monolith) und The Shareholder (statt Stakeholder) ---
  const lateProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, DT = 1 / 60, I = BOTA.C.INNER, BH = BOTA.BossHelpers, L = BH.late;
    // 1) Abloesung: Vorgaenger bis Etage 6, Nachfolger ab 7 (und beide kommen dort auch vor)
    const seen = {};
    for (let d = 1; d <= 22; d++) {
      for (let i = 0; i < 150; i++) {
        const id = BOTA.rollBossVaried(new BOTA.RNG(BOTA.hashString('late' + d + ':' + i)), d, []);
        seen[id] = true;
        if ((id === 'monolith' || id === 'stakeholder') && d >= 7) { out.push(id + ' als Etagen-Boss auf Etage ' + d); break; }
        if ((id === 'megalith' || id === 'shareholder') && d < 7) { out.push(id + ' auf Etage ' + d); break; }
      }
    }
    if (!seen.megalith || !seen.shareholder) out.push('Megalith/Shareholder tauchen nie auf');
    // 2) Zwischenbosse meiden Etagen-Boss und dessen Vorgaenger (replaces)
    const pairs = [['megalith', 'monolith'], ['shareholder', 'stakeholder'], ['nested_loop', 'infinite_loop']];
    let floors = 0;
    for (let k = 0; k < 60 && floors < 25; k++) {
      const f = new BOTA.Floor(10 + (k % 8), 'LATE-' + k);
      if (!f.encounterRooms || !f.encounterRooms.length) continue;
      floors++;
      for (const [boss, prev] of pairs) {
        f.pickEncounterBosses(boss);
        if (f.encounterRooms.some((c) => c.room.encounterBoss === prev || c.room.encounterBoss === boss)) out.push('Begegnung ' + prev + ' auf einer Etage mit ' + boss);
      }
    }
    if (!floors) out.push('Keine Etage mit Begegnung gefunden');
    // 3) Megalith-Zeilen, aus den Kugelpositionen nachgerechnet: sichere Bereiche fuer den Spieler-Mittelpunkt
    //    (Wandabstand 20, Trefferabstand 22, mind. 40 px Spielraum)
    const freeOf = (xs) => {
      const iv = [], push = (a, b) => { if (b - a >= 40) iv.push([a, b]); };
      if (!xs.length) return [[I.x0 + 20, I.x1 - 20]];
      push(I.x0 + 20, xs[0] - 22);
      for (let i = 1; i < xs.length; i++) push(xs[i - 1] + 22, xs[i] - 22);
      push(xs[xs.length - 1] + 22, I.x1 - 20);
      return iv;
    };
    for (let n = 0; n < 400; n++) {
      const p2 = n % 2 === 1;
      const reach = L.MEGA.rowGap[p2 ? 1 : 0] * 240 * 0.6;
      const rows = L.megaBody(new BOTA.RNG(BOTA.hashString('rows' + n)), L.MEGA.rows[p2 ? 1 : 0], p2, reach);
      const markers = rows.filter((r) => r.marker).length;
      let bad = '';
      if (rows.length !== L.MEGA.rows[p2 ? 1 : 0]) bad = rows.length + ' Zeilen';
      if (markers !== (p2 ? 1 : 0)) bad = markers + ' Markerzeilen (Phase ' + (p2 ? 2 : 1) + ')';
      if (rows[0].L !== 0) bad = 'erste Zeile eingerueckt';
      const free = rows.map((r) => freeOf(L.megaSlots(r).map(L.slotX)));
      if (free.some((f) => !f.length)) bad = 'Zeile ohne Luecke';
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].marker && !rows[i - 1].marker && Math.abs(rows[i].L - rows[i - 1].L) > 1) bad = 'Einrueckung springt';
        if (!free[i - 1].some((a) => free[i].some((b) => Math.max(0, b[0] - a[1], a[0] - b[1]) <= reach))) bad = 'Zeile ' + i + ' nicht erreichbar';
      }
      if (bad) { out.push('Megalith-Zeilen: ' + bad + ' ' + JSON.stringify(rows)); break; }
    }

    // 4) Live: Telegraphen, Schaden, Phasen (Verhalten direkt getaktet, Projektile bewegen sich dabei nicht)
    const speeds = [];
    let shots = [];
    const origShoot = AI.shoot;
    AI.shoot = function (game, e, angle, speed, o) {
      if (e && (e.id === 'megalith' || e.id === 'shareholder')) {
        speeds.push(speed);
        shots.push({ speed, angle, x: o && o.x, y: o && o.y, src: o && o.source });
      }
      return origShoot.apply(this, arguments);
    };
    const ev = [];
    const offs = ['bossPhase', 'enemyDeath', 'bossAbsorb'].map((n) => BOTA.bus.on(n, (x) => ev.push(n + (x.boss === true ? ':boss' : ''))));
    const p = g.player;
    const fresh = () => { p.invuln = 0; p.guardrails = 0; p.health = p.maxHealth; };
    const clear = () => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); g.room.projectiles.length = 0; };
    const d0 = g.depth;
    try {
      g.enterFloor(7); g.setState('play');
      BOTA.debug.gotoRoom('boss'); clear();
      // ---- Megalith ----
      const M = BOTA.debug.spawnBoss('megalith', 480, 250);
      M.spawnDelay = 0;
      const S = M.state;
      const step = (n, each) => { for (let i = 0; i < n; i++) { M.frozen = 0; M.behavior.update(M, DT, g); if (each) each(i); } };
      BOTA.debug.god(true); p.x = 480; p.y = 480;
      // Scroll: erste Zeile erst nach dem Telegraph, alle Kugeln da, Start an der Wand gegenueber dem Spieler
      shots = [];
      L.megaPick(M, g, 'scroll');
      const rows = S.sc.rows.slice();
      let firstAt = -1;
      step(Math.ceil((L.MEGA.tell + (rows.length - 1) * L.MEGA.rowGap[0] + 0.1) * 60), (i) => { if (firstAt < 0 && shots.length) firstAt = i; });
      if (firstAt < 0 || firstAt < (L.MEGA.tell - 0.02) * 60) out.push('Megalith: erste Zeile vor dem Telegraph (Tick ' + firstAt + ')');
      const want = rows.reduce((n, r) => n + L.megaSlots(r).length, 0);
      if (shots.length !== want) out.push('Megalith: ' + shots.length + ' Zeilenkugeln statt ' + want);
      if (shots.some((s2) => s2.y > I.y0 + 40)) out.push('Megalith: Zeilen starten nicht an der Wand gegenueber dem Spieler');
      // Ctrl+F: erster Treffer auf dem Spieler, Schaden erst beim Ersetzen, Kugelkreuze
      g.room.projectiles.length = 0; shots = []; S.hl = []; S.chunks = [];
      BOTA.debug.god(false); fresh(); p.x = 480; p.y = 470;
      L.megaPick(M, g, 'find');
      step(23);
      const h0 = S.hl[0];
      if (!h0 || Math.abs(h0.x - p.x) > 1 || Math.abs(h0.y - p.y) > 1) out.push('Megalith: erster Suchtreffer nicht auf dem Spieler');
      if (h0) {
        step(Math.floor((h0.t - 0.05) * 60));
        if (p.health !== p.maxHealth) out.push('Megalith: Suchtreffer trifft vor dem Ersetzen');
        step(6);
        if (p.health !== p.maxHealth - 1) out.push('Megalith: Suchtreffer trifft nicht (' + (p.maxHealth - p.health) + ')');
      }
      step(70);
      const fs = shots.filter((s2) => s2.src === 'a search-and-replace').length;
      if (fs < 12 || fs % 4) out.push('Megalith: ' + fs + ' Ersetzen-Kugeln');
      // Ctrl+S: Ring erst nach dem Anheben, erster Brocken auf dem Spieler, Schaden erst beim Aufschlag
      g.room.projectiles.length = 0; shots = []; S.hl = []; S.chunks = []; fresh(); p.x = 480; p.y = 480;
      L.megaPick(M, g, 'save');
      const c0 = S.chunks[0], dur = S.dur;
      if (!c0 || Math.hypot(c0.x - p.x, c0.y - p.y) > 1) out.push('Megalith: erster Brocken nicht auf dem Spieler');
      step(Math.floor((dur - 0.05) * 60));
      if (shots.length) out.push('Megalith: Stampfring vor dem Telegraph');
      step(6);
      if (shots.length !== 16) out.push('Megalith: Stampfring mit ' + shots.length + ' Kugeln');
      if (c0) {
        step(Math.max(0, Math.floor((c0.t - 0.05) * 60)));
        if (p.health !== p.maxHealth) out.push('Megalith: Brocken trifft vor dem Aufschlag');
        step(6);
        if (p.health !== p.maxHealth - 2) out.push('Megalith: Brocken trifft nicht (' + (p.maxHealth - p.health) + ')');
      }
      // Phase 2: ein bossPhase, 4 Module weit weg, Heilung 4 % bis hoechstens 50 %, kein Kill
      BOTA.debug.god(true);
      g.room.projectiles.length = 0; S.hl = []; S.chunks = []; ev.length = 0;
      M.hp = M.maxHp * 0.45;
      step(1);
      if (S.phase !== 2 || ev.filter((x) => x === 'bossPhase').length !== 1) out.push('Megalith: kein Phasenwechsel bei 50 %');
      step(Math.ceil(1.35 * 60));
      const mods = g.room.enemies.filter((m) => m.id === 'megalith_module' && !m.dead);
      if (mods.length !== 4 || mods.some((m) => m.state.owner !== M)) out.push('Megalith: ' + mods.length + ' Module nach "Refactor rejected"');
      if (mods.some((m) => Math.hypot(m.x - M.x, m.y - M.y) < 120)) out.push('Megalith: Modul landet direkt am Boss');
      if (mods.length >= 3) {
        const hpB = M.hp;
        const m0 = mods[0];
        m0.x = M.x + M.r + m0.r + 2; m0.y = M.y;
        m0.behavior.update(m0, DT, g);
        if (!m0.dead) out.push('Megalith: angekommenes Modul bleibt');
        if (Math.abs(M.hp - hpB - M.maxHp * 0.04) > 0.5) out.push('Megalith: heilt um ' + (M.hp - hpB).toFixed(1) + ' statt 4 %');
        if (ev.some((x) => x.startsWith('enemyDeath'))) out.push('Megalith: angekommenes Modul zaehlt als Kill');
        if (ev.filter((x) => x === 'bossAbsorb').length !== 1) out.push('Megalith: kein bossAbsorb');
        M.hp = M.maxHp * 0.49;
        const m1 = mods[1];
        m1.x = M.x - M.r - m1.r - 2; m1.y = M.y;
        m1.behavior.update(m1, DT, g);
        if (M.hp > M.maxHp * 0.5 + 1e-6) out.push('Megalith: heilt ueber 50 %');
        const hp2 = M.hp;
        mods[2].hurt(1e6, g, {});
        if (M.hp !== hp2) out.push('Megalith: erschossenes Modul heilt');
      }
      const bt = M.behavior.barText(M);
      if (!bt || !/ \/ 6,000,000 LINES$/.test(bt.text)) out.push('Megalith: HUD-Zeile ' + (bt && bt.text));
      ev.length = 0;
      M.hurt(1e7, g, {});
      if (!M.dead) M.die(g);
      if (ev.filter((x) => x === 'enemyDeath:boss').length !== 1) out.push('Megalith: ' + ev.filter((x) => x === 'enemyDeath:boss').length + ' Boss-Tode');
      if (g.room.enemies.some((m) => m.id === 'megalith_module' && !m.dead)) out.push('Megalith: Module ueberleben ihn');
      clear();

      // ---- Shareholder ----
      // Strahlverlauf: Abprall an der rechten Wand spiegelt x, alle Punkte im Raum, 2 Abpraller = 4 Punkte
      const pth = BH.beamPath(480, 300, -0.4, 1, I);
      if (pth.length !== 3) out.push('beamPath: ' + pth.length + ' Punkte statt 3');
      if (pth.some((q) => q.x < I.x0 - 0.5 || q.x > I.x1 + 0.5 || q.y < I.y0 - 0.5 || q.y > I.y1 + 0.5)) out.push('beamPath verlaesst den Raum');
      const a1 = Math.atan2(pth[1].y - pth[0].y, pth[1].x - pth[0].x), a2 = Math.atan2(pth[2].y - pth[1].y, pth[2].x - pth[1].x);
      if (Math.abs(pth[1].x - I.x1) > 0.5 || Math.abs(Math.cos(a2) + Math.cos(a1)) > 1e-6 || Math.abs(Math.sin(a2) - Math.sin(a1)) > 1e-6) out.push('beamPath: falscher Abprall');
      if (BH.beamPath(480, 300, 2.2, 2, I).length !== 4) out.push('beamPath: 2 Abpraller ergeben nicht 4 Punkte');
      const H = BOTA.debug.spawnBoss('shareholder', 480, 220);
      H.spawnDelay = 0;
      const T = H.state;
      const stepH = (n, each) => { for (let i = 0; i < n; i++) { H.frozen = 0; H.behavior.update(H, DT, g); if (each) each(i); } };
      const hold = () => { T.mode = 'idle'; T.t = 99; T.q.t = 99; };
      // Treffer auf dem abgeprallten Teilstueck, daneben nicht
      BOTA.debug.god(false);
      const path = [{ x: 200, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 480 }];
      fresh(); p.x = 700; p.y = 400; T.mode = 'fire'; T.t = 0.5; T.path = path; stepH(1);
      if (p.health !== p.maxHealth - 2) out.push('Shareholder-Strahl trifft nach dem Abprall nicht');
      fresh(); p.x = 600; p.y = 400; T.mode = 'fire'; T.t = 0.5; T.path = path; stepH(1);
      if (p.health !== p.maxHealth) out.push('Shareholder-Strahl trifft neben dem Strahl');
      // Monokel: feuert erst nach Zielen + Einfrieren und trifft einen stillstehenden Spieler
      fresh(); p.x = 600; p.y = 460; hold();
      L.shNext(H, g, 'glint');
      let fireAt = -1, hurtAt = -1;
      stepH(150, (i) => {
        if (fireAt < 0 && T.mode === 'fire') fireAt = i;
        if (hurtAt < 0 && p.health < p.maxHealth) hurtAt = i;
      });
      if (fireAt < 0 || fireAt < (L.SHARE.aim[0] + L.SHARE.lock - 0.02) * 60) out.push('Shareholder: Strahl ohne vollen Telegraph (Tick ' + fireAt + ')');
      if (hurtAt >= 0 && hurtAt < fireAt) out.push('Shareholder: Strahl trifft vor dem Feuern');
      if (hurtAt < 0) out.push('Shareholder: Strahl verfehlt einen stillstehenden Spieler');
      // Dividenden: erst nach dem Telegraph, platzen nach der Lunte in je 6
      BOTA.debug.god(true); g.room.projectiles.length = 0; shots = []; hold();
      L.shNext(H, g, 'dividend');
      stepH(Math.floor((L.SHARE.divTell - 0.05) * 60));
      if (shots.length) out.push('Shareholder: Dividenden vor dem Telegraph');
      stepH(6);
      const orbs = shots.filter((s2) => s2.src === 'a dividend').length;
      if (orbs !== L.SHARE.orbs[0]) out.push('Shareholder: ' + orbs + ' Dividenden');
      stepH(Math.ceil(L.SHARE.orbFuse * 60) + 2);
      const pay = shots.filter((s2) => s2.src === 'a dividend payout').length;
      if (pay !== orbs * L.SHARE.payout) out.push('Shareholder: ' + pay + ' Ausschuettungs-Kugeln statt ' + orbs * L.SHARE.payout);
      // Muenzen: erste auf dem Spieler, Schaden erst beim Aufschlag
      BOTA.debug.god(false); fresh(); p.x = 480; p.y = 450; g.room.projectiles.length = 0; hold(); T.coins = [];
      L.shNext(H, g, 'rain');
      stepH(Math.floor((L.SHARE.rainTell + 0.03) * 60));
      const k0 = T.coins[0];
      if (!k0 || Math.hypot(k0.x - p.x, k0.y - p.y) > 1) out.push('Shareholder: erste Muenze nicht auf dem Spieler');
      if (k0) {
        stepH(Math.floor((k0.t - 0.05) * 60));
        if (p.health !== p.maxHealth) out.push('Shareholder: Muenze trifft vor dem Aufschlag');
        stepH(6);
        if (p.health !== p.maxHealth - 1) out.push('Shareholder: Muenze trifft nicht (' + (p.maxHealth - p.health) + ')');
      }
      stepH(90);
      // Echte Credits: hoechstens coinCap pro Kampf (auch ueber viele Regen), verfallen nach coinLife
      BOTA.debug.god(true);
      const spawned = [];
      const origPickup = g.spawnPickup;
      g.spawnPickup = function (type) { const pk = origPickup.apply(this, arguments); if (type === 'credit') spawned.push(pk); return pk; };
      try {
        for (let r = 0; r < 12; r++) { hold(); L.shNext(H, g, 'rain'); stepH(Math.ceil(2.2 * 60)); }
      } finally { g.spawnPickup = origPickup; }
      if (spawned.length < 1 || spawned.length > L.SHARE.coinCap) out.push('Shareholder: ' + spawned.length + ' echte Credits (Obergrenze ' + L.SHARE.coinCap + ')');
      hold();
      stepH(Math.ceil((L.SHARE.coinLife + 0.1) * 60));
      if (spawned.some((pk) => !pk.dead)) out.push('Shareholder: echte Credits verfallen nicht');
      // Phase 2 bei 40 %, dann Rueckkauf: einfrieren, dann alle Kugeln zu ihm
      g.room.projectiles.length = 0; ev.length = 0;
      H.hp = H.maxHp * 0.39; T.mode = 'idle'; T.t = 99;
      stepH(1);
      if (T.phase !== 2 || T.mode !== 'takeover' || ev.filter((x) => x === 'bossPhase').length !== 1) out.push('Shareholder: kein "Hostile takeover" bei 40 %');
      stepH(Math.ceil(1.35 * 60));
      hold();
      L.shNext(H, g, 'buyback');
      stepH(Math.ceil((L.SHARE.buyTell + 0.02) * 60));
      const ring = g.room.projectiles.filter((q) => q.team === 'enemy' && !q.dead);
      if (ring.length < L.SHARE.buyRing) out.push('Shareholder: Rueckkauf ohne Muenzring (' + ring.length + ')');
      for (const q of ring) { q.x += q.vx * 0.5; q.y += q.vy * 0.5; }
      stepH(Math.ceil((L.SHARE.buyWait + 0.02) * 60));
      if (ring.some((q) => q.vx || q.vy)) out.push('Shareholder: Rueckkauf friert die Kugeln nicht ein');
      stepH(Math.ceil((L.SHARE.buyFreeze + 0.02) * 60));
      const back = ring.every((q) => Math.abs(BOTA.M.angleDiff(Math.atan2(H.y - 20 - q.y, H.x - q.x), Math.atan2(q.vy, q.vx))) < 0.01);
      if (!back) out.push('Shareholder: zurueckgekaufte Kugeln fliegen nicht zu ihm');
      if (ring.some((q) => Math.hypot(q.vx, q.vy) < 165 || Math.hypot(q.vx, q.vy) > 260)) out.push('Shareholder: Rueckkauf-Tempo ausserhalb 165–260');
      // Quartal verfehlt: betaeubt mit Schadensfaktor, danach wieder normal
      g.room.projectiles.length = 0; hold();
      T.q.hp0 = H.hp + H.maxHp * 0.1; T.q.t = 0.001;
      stepH(2);
      if (T.mode !== 'stunned' || H.damageTakenMult !== L.SHARE.stunMult) out.push('Shareholder: "Missed estimates" betaeubt nicht');
      stepH(Math.ceil((L.SHARE.stun + 0.05) * 60));
      if (H.damageTakenMult !== undefined) out.push('Shareholder: Schadensfaktor bleibt nach der Betaeubung');
      // Quartal geschlagen: Ring erst nach dem Telegraph, danach schneller
      hold(); shots = []; T.q.hp0 = H.hp; T.q.t = 0.001;
      const spd0 = T.spd;
      stepH(2);
      if (T.mode !== 'beat') out.push('Shareholder: "Beat estimates" startet nicht');
      stepH(Math.floor((L.SHARE.beatTell - 0.06) * 60));
      if (shots.length) out.push('Shareholder: Jubel-Ring vor dem Telegraph');
      stepH(8);
      if (shots.length !== L.SHARE.beatRing || !(T.spd > spd0)) out.push('Shareholder: Jubel-Ring ' + shots.length + ', Tempo ' + spd0 + ' -> ' + T.spd);
      const bt2 = H.behavior.barText(H);
      if (!bt2 || !/ESTIMATES|EARNINGS/.test(bt2.text)) out.push('Shareholder: HUD-Zeile ' + (bt2 && bt2.text));
      ev.length = 0;
      H.hurt(1e7, g, {});
      if (!H.dead) H.die(g);
      if (ev.filter((x) => x === 'enemyDeath:boss').length !== 1) out.push('Shareholder: ' + ev.filter((x) => x === 'enemyDeath:boss').length + ' Boss-Tode');
      // Fairness: alle Kugeln beider Bosse
      const badSp = speeds.filter((v) => v < 165 || v > 260);
      if (badSp.length) out.push('Spaete Bosse: ' + badSp.length + ' Kugeln ausserhalb 165–260 px/s (z. B. ' + badSp[0].toFixed(0) + ')');
    } finally {
      AI.shoot = origShoot;
      for (const off of offs) off();
      clear();
      BOTA.debug.god(true);
      p.health = p.maxHealth;
      g.enterFloor(d0); g.setState('play');
    }
    return out;
  });
  problems.push(...lateProblems);

  // --- The Context Limit: Regen-Stimmung (rein kosmetisch) ---
  const rainSetup = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    const rainy = BOTA.FLOOR_THEMES.filter((t) => t.ambient === 'rain').map((t) => t.key);
    if (rainy.join() !== 'context') out.push('ambient rain auf: ' + rainy.join());
    window.__rainD0 = g.depth;
    const ev = [];
    const offs = ['ambientWhisper', 'ambientThunder'].map((n) => BOTA.bus.on(n, (x) => ev.push({ n, text: x.text })));
    try {
      // Andere Etage: nichts
      g.enterFloor(10); g.setState('play');
      for (let i = 0; i < 120; i++) g.updateAmbience(1);
      if (ev.length || g.ambience) out.push('Stimmung auf Etage 10: ' + ev.length + ' Events');
      // The Context Limit: Fluestern (Text aus CONTEXT_WHISPERS) und Wetterleuchten, Run-RNG unberuehrt
      g.enterFloor(11); g.setState('play');
      const cell = [...g.floor.cells.values()].find((c) => c.type === 'normal');
      g.teleport(cell.room);
      BOTA.debug.god(true);
      const st = g.rng.state;
      const fx0 = g.room.effects.length;
      for (let i = 0; i < 120; i++) g.updateAmbience(1);
      if (g.rng.state !== st) out.push('Stimmung zieht aus dem Run-RNG');
      const wh = ev.filter((x) => x.n === 'ambientWhisper');
      if (wh.length < 10) out.push('Context Limit: nur ' + wh.length + ' Fluestern in 120 s');
      if (wh.some((x) => !BOTA.TEXT.CONTEXT_WHISPERS.includes(x.text))) out.push('Fluestern mit fremdem Text');
      if (!ev.some((x) => x.n === 'ambientThunder')) out.push('Context Limit: kein Wetterleuchten in 120 s');
      if (!(g.room.effects.length > fx0) || !g.room.effects.some((f) => typeof f.text === 'string' && f.order)) out.push('Fluestern erscheint nicht als Effekt');
      g.ambience.whisper = 0.01;
    } finally {
      for (const off of offs) off();
    }
    return out;
  });
  problems.push(...rainSetup);
  await page.waitForTimeout(600);
  await shot('08-context-rain');
  problems.push(...await page.evaluate(() => {
    const out = [];
    const g = BOTA.game;
    if (!Array.isArray(g.room.puddles)) out.push('Context Limit: Raum ohne Pfuetzen-Liste nach dem Zeichnen');
    g.enterFloor(window.__rainD0); g.setState('play');
    return out;
  }));

  // ---- Context-Familie: Slot 1 (Overflow Buffer) ----
  // [[SLOT overflow_buffer]]
  // ---- Ende Slot 1 ----

  // ---- Context-Familie: Slot 2 (Summarizer) ----
  // --- Summarizer (The Context Limit): nie vor Etage 8, auf Etage 11 haeufiger als auf anderen Etagen >= 8,
  //     hoechstens 1 pro Raum; haelt Abstand; Telegraph (Linie, enemyWindup) volle Dauer vor jedem Verschmelzen;
  //     Treffer im Telegraph bricht ab (verwirrt), totes Ziel bricht ab; Verschmelzen: HP = Summe, Max-HP waechst,
  //     Radius waechst gedeckelt, der andere verschwindet ohne enemyDeath/Kill; Raum clear danach; ungeeignete
  //     Gegner werden nie gewaehlt; hoechstens 2x zusammengefasst; killAll laesst nichts zurueck ---
  const sumProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, E = BOTA.ENEMIES, DT = 1 / 60, BH = BOTA.BEHAVIORS.summarizer;
    const d0 = g.depth;
    const CL = BOTA.FLOOR_THEMES.findIndex((t) => t.key === 'context') + 1;
    // 1) Spawn-Regeln: nie vor Etage 8; auf The Context Limit staerker gewichtet; hoechstens 1 pro Raum
    for (let d = 1; d <= 7; d++) {
      if (BOTA.enemyWeightAt(E.summarizer, d) > 0) out.push('Summarizer: Gewicht > 0 auf Etage ' + d);
      for (let i = 0; i < 150; i++) if (BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('summ' + d + ':' + i)), d).includes('summarizer')) { out.push('Summarizer auf Etage ' + d); break; }
    }
    const other = CL === 10 ? 9 : 10;
    const wCL = BOTA.enemyWeightAt(E.summarizer, CL), wOther = BOTA.enemyWeightAt(E.summarizer, other);
    if (!(wCL > wOther && wOther > 0)) out.push('Summarizer: Gewicht ' + wCL + ' (Etage ' + CL + ') vs. ' + wOther + ' (Etage ' + other + ')');
    let nCL = 0, nOther = 0;
    for (let i = 0; i < 600; i++) {
      const l = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('summCL:' + i)), CL).filter((x) => x === 'summarizer').length;
      const l2 = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('summO:' + i)), other).filter((x) => x === 'summarizer').length;
      if (l > 1 || l2 > 1) { out.push('Summarizer: ' + Math.max(l, l2) + ' in einem Raum'); break; }
      nCL += l; nOther += l2;
    }
    if (!(nCL > nOther && nCL > 0)) out.push('Summarizer: ' + nCL + ' Raeume auf Etage ' + CL + ', ' + nOther + ' auf Etage ' + other);

    // 2) Verhalten (direkt gesteppt; nur der Summarizer laeuft, die Ziele stehen still)
    const ev = [];
    const offs = ['enemyWindup', 'enemyVanish', 'enemyDeath'].map((n) => BOTA.bus.on(n, (x) => ev.push({ n, enemy: x.enemy, text: x.text })));
    const p = g.player;
    try {
      g.enterFloor(CL); g.setState('play');
      // moeglichst offener Kampfraum
      const cells = [...g.floor.cells.values()].filter((c) => c.type === 'normal');
      const solid = (r) => { let n = 0; for (let i = 0; i < r.tiles.length; i++) if (r.tiles[i] !== BOTA.TILES.FLOOR) n++; return n; };
      cells.sort((a, b) => solid(a.room) - solid(b.room));
      const room = cells[0].room;
      room.populated = true; room.cleared = true; g.teleport(room);
      BOTA.debug.god(true);
      const clear = () => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); g.room.enemies = g.room.enemies.filter((x) => !x.dead); g.room.projectiles.length = 0; };
      const spawn = (id, x, y) => { const e = BOTA.debug.spawn(id, x, y); if (e) e.spawnDelay = 0; return e; };
      const pos = (x, y) => { const q = g.nearestFreePos(x, y); return [q.x, q.y]; };
      const stepS = (S, n, each) => {
        for (let i = 0; i < n; i++) {
          if (!S.dead) S.update(DT, g);
          g.room.enemies = g.room.enemies.filter((x) => !x.dead);
          if (each && each(i) === false) return i;
        }
        return n;
      };
      const toTell = (S) => { S.state.t = 0.001; stepS(S, 5, () => S.state.mode !== 'tell'); return S.state.mode === 'tell'; };
      clear();

      // 2a) Abstand halten: startet nah am Spieler, steht nach 4 s im Wunschabstand (ohne andere Gegner)
      p.x = 480; p.y = 320;
      let S = spawn('summarizer', ...pos(560, 320));
      const P = S.params;
      stepS(S, 240);
      const dS = Math.hypot(S.x - p.x, S.y - p.y);
      if (dS < P.near - 30 || dS > P.far + 40) out.push('Summarizer: Abstand ' + dS.toFixed(0) + ' px nach 4 s');
      if (S.state.mode !== 'walk') out.push('Summarizer: ohne Ziele nicht im Laufmodus (' + S.state.mode + ')');
      clear();

      // 2b) Telegraph volle Dauer vor dem Verschmelzen; Ergebnis pruefen
      p.x = 160; p.y = 480;
      S = spawn('summarizer', ...pos(700, 160));
      let A = spawn('bug', ...pos(560, 360)), Bq = spawn('bug', ...pos(640, 380));
      Bq.hurt(2, g, {});                      // B hat weniger HP -> wird geschluckt (gleicher Radius)
      const hpA = A.hp, hpB = Bq.hp, maxA = A.maxHp, maxB = Bq.maxHp, rA = A.r;
      const kills0 = g.runStats.kills;
      ev.length = 0;
      if (!toTell(S)) out.push('Summarizer: startet keinen Telegraph mit zwei Bugs');
      if (!ev.some((x) => x.n === 'enemyWindup' && x.enemy === S)) out.push('Summarizer: kein enemyWindup beim Telegraph');
      if (!((S.state.a === A && S.state.b === Bq) || (S.state.a === Bq && S.state.b === A))) out.push('Summarizer: Telegraph-Linie nicht zwischen den beiden Zielen');
      let tellTicks = 0;
      stepS(S, 200, () => { if (!A.dead && !Bq.dead) { tellTicks++; return true; } return false; });
      if (tellTicks < Math.floor(P.tell * 60) - 1) out.push('Summarizer: Verschmelzen nach nur ' + (tellTicks / 60).toFixed(2) + ' s Telegraph');
      if (A.dead || !Bq.dead) out.push('Summarizer: falscher Ueberlebender (A tot: ' + A.dead + ', B tot: ' + Bq.dead + ')');
      else {
        if (Math.abs(A.hp - (hpA + hpB)) > 1e-6) out.push('Summarizer: HP ' + A.hp + ' statt ' + (hpA + hpB));
        if (A.maxHp !== maxA + maxB) out.push('Summarizer: Max-HP ' + A.maxHp + ' statt ' + (maxA + maxB));
        if (!(A.r > rA) || A.r > rA * P.growCap + 1e-6) out.push('Summarizer: Radius ' + rA + ' -> ' + A.r);
        if (A.summaries !== 1) out.push('Summarizer: Zaehler ' + A.summaries);
        if (g.room.enemies.includes(Bq)) out.push('Summarizer: geschluckter Gegner noch im Raum');
        if (ev.some((x) => x.n === 'enemyDeath')) out.push('Summarizer: Verschmelzen loest enemyDeath aus');
        if (g.runStats.kills !== kills0) out.push('Summarizer: Verschmelzen zaehlt als Kill');
        if (!ev.some((x) => x.n === 'enemyVanish' && x.enemy === Bq && x.text === 'summarized')) out.push('Summarizer: kein enemyVanish "summarized"');
        try { A.draw(document.createElement('canvas').getContext('2d'), g); } catch (err) { out.push('Summarizer: Schild zeichnen: ' + err.message); }
      }
      // Raum wird geclearet, sobald die Uebrigen tot sind (der Geschluckte zaehlt nicht mehr)
      g.room.cleared = false; g.room.populated = true;
      A.die(g); S.die(g);
      for (let i = 0; i < 5; i++) g.update(DT);
      if (!g.room.cleared) out.push('Summarizer: Raum wird nach dem Verschmelzen nicht clear');
      g.room.cleared = true;
      clear();

      // 2c) Treffer im Telegraph bricht ab (verwirrt), danach lange kein Verschmelzen
      S = spawn('summarizer', ...pos(700, 160));
      A = spawn('bug', ...pos(560, 360)); Bq = spawn('bug', ...pos(640, 380));
      toTell(S); stepS(S, 30);
      S.hurt(1, g, {}); stepS(S, 1);
      if (S.state.mode !== 'fluster' || S.state.a) out.push('Summarizer: Treffer bricht den Telegraph nicht ab (' + S.state.mode + ')');
      stepS(S, Math.ceil((P.tell + 1.5) * 60));
      if (A.dead || Bq.dead || A.summaries || Bq.summaries) out.push('Summarizer: verschmilzt trotz Treffer im Telegraph');
      clear();

      // 2d) Totes Ziel bricht ab
      S = spawn('summarizer', ...pos(700, 160));
      A = spawn('bug', ...pos(560, 360)); Bq = spawn('bug', ...pos(640, 380));
      toTell(S); stepS(S, 20);
      const hpBq = Bq.hp;
      ev.length = 0;
      A.die(g); stepS(S, 1);
      if (S.state.mode === 'tell' || S.state.a) out.push('Summarizer: totes Ziel bricht den Telegraph nicht ab');
      stepS(S, Math.ceil(P.tell * 60));
      if (Bq.dead || Bq.summaries || Bq.hp !== hpBq || ev.some((x) => x.n === 'enemyVanish')) out.push('Summarizer: verschmilzt mit totem Ziel');
      clear();

      // 2e) Ungeeignete Gegner werden nie gewaehlt
      S = spawn('summarizer', ...pos(700, 160));
      const bad = [];
      const at = [[320, 240], [400, 260], [360, 330], [300, 420], [420, 430], [480, 360], [560, 300], [600, 420]];
      ['hallucination', 'dry_run', 'detached_head', 'cherry_pick', 'spinlock', 'port_scanner', 'orphan_commit',
        'memory_leak', 'scope_creep', 'jira_ticket', 'stale_branch', 'leaklet', 'microservice', 'summarizer'].forEach((id, i) => {
        const e = spawn(id, ...pos(at[i % at.length][0] + (i >> 3) * 20, at[i % at.length][1]));
        if (e) bad.push(e);
      });
      const boss = BOTA.debug.spawnBoss('monolith', ...pos(480, 300));
      if (boss) bad.push(boss);
      const revealed = spawn('hallucination', ...pos(380, 300));
      if (revealed) { revealed.state.mode = 'chase'; revealed.intangible = false; revealed.ignoreForClear = false; revealed.static = false; bad.push(revealed); }
      // alles im Raum ausser einfachen Gegnern (inkl. Kopf, Partner, Glieder, Ports)
      for (const e of g.room.enemies) {
        if (e === S) continue;
        if (BH.canSummarize(e, S)) out.push('Summarizer: ' + e.id + ' gilt als geeignet');
      }
      if (BH.canSummarize(S, S)) out.push('Summarizer: fasst sich selbst zusammen');
      const zombie = spawn('zombie_process', ...pos(620, 260));
      zombie.state.down = 1; zombie.intangible = true;
      if (BH.canSummarize(zombie, S)) out.push('Summarizer: liegender Zombie Process gilt als geeignet');
      S.state.t = 0.001; stepS(S, 90);
      if (S.state.mode === 'tell' || S.state.merges) out.push('Summarizer: Telegraph ohne geeignetes Paar (' + (S.state.a && S.state.a.id) + ')');
      const one = spawn('bug', ...pos(330, 250));
      S.state.t = 0.001; stepS(S, 30);
      if (S.state.mode === 'tell') out.push('Summarizer: Telegraph mit nur einem geeigneten Gegner (' + S.state.a.id + '+' + S.state.b.id + ')');
      const two = spawn('null_pointer', ...pos(345, 300));
      toTell(S);
      const picked = [S.state.a, S.state.b];
      if (S.state.mode !== 'tell' || !picked.includes(one) || !picked.includes(two)) out.push('Summarizer: waehlt nicht die zwei einfachen Gegner (' + picked.map((x) => x && x.id) + ')');
      if (boss && !boss.dead) boss.die(g);
      clear();

      // 2f) Hoechstens zweimal zusammengefasst; Radius gedeckelt
      p.x = 160; p.y = 480;
      S = spawn('summarizer', ...pos(760, 160));
      const X = spawn('bug', ...pos(560, 360));
      const r0 = X.r;
      let partner = spawn('bug', ...pos(620, 360));
      partner.hurt(1, g, {});
      toTell(S); stepS(S, 200, () => S.state.mode === 'tell');
      partner = spawn('bug', ...pos(620, 380));
      toTell(S); stepS(S, 200, () => S.state.mode === 'tell');
      if (X.dead || X.summaries !== 2) out.push('Summarizer: nach zwei Runden Zaehler ' + X.summaries + (X.dead ? ' (geschluckt)' : ''));
      if (X.r > r0 * P.growCap + 1e-6) out.push('Summarizer: Radius ueber der Obergrenze (' + X.r.toFixed(1) + ')');
      if (BH.canSummarize(X, S)) out.push('Summarizer: dreimal zusammenfassbar');
      const D = spawn('bug', ...pos(620, 380));
      S.state.t = 0.001; stepS(S, 30);
      if (S.state.mode === 'tell') out.push('Summarizer: waehlt einen schon zweimal zusammengefassten Gegner');
      const E2 = spawn('bug', ...pos(660, 420));
      toTell(S);
      if (S.state.mode !== 'tell' || [S.state.a, S.state.b].includes(X)) out.push('Summarizer: Paar neben dem Vollen falsch gewaehlt');
      void D; void E2;

      // 2g) killAll mitten im Telegraph laesst nichts zurueck; der Summarizer selbst schiesst nie
      if (g.room.projectiles.some((q) => q.source === 'Summarizer')) out.push('Summarizer: hat geschossen');
      BOTA.debug.killAll();
      g.room.enemies = g.room.enemies.filter((x) => !x.dead);
      if (g.room.enemies.length) out.push('Summarizer: nach killAll bleiben ' + g.room.enemies.map((x) => x.id));
    } catch (err) {
      out.push('Summarizer-Test: ' + err.message);
    } finally {
      for (const off of offs) off();
      g.room.projectiles.length = 0;
      BOTA.debug.god(true);
      p.health = p.maxHealth;
      g.enterFloor(d0); g.setState('play');
    }
    return out;
  });
  problems.push(...sumProblems);
  // ---- Ende Slot 2 ----

  // ---- Context-Familie: Slot 3 (Lost in the Middle) ----
  // [[SLOT lost_in_the_middle]]
  // ---- Ende Slot 3 ----

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
    // Eine Salve, die beim Ende der Schleife noch laeuft, ist unvollstaendig mitgeschnitten (kein Fehler des
    // Gegners; trat auf, sobald sich der game.rng-Stand vorher verschob)
    if (cur && A.state.mode !== 'move') volleys.pop();
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

  // --- Etagen-Identitaet (home/AWAY) auf 1–7, Kakophonie ab 8, Zwischenboss-Begegnungen ab 8 (Daten) ---
  const spawnProblems = await page.evaluate(() => {
    const out = [];
    const E = BOTA.ENEMIES;
    // 1) Heimat-Besetzung der allgemeinen Gegner (ohne themeOnly-Familien) je Etage 1–7.
    //    Neue allgemeine Gegner mit home muessen hier eingetragen werden.
    const ROSTER = {
      backlog: ['bug', 'memory_leak', 'null_pointer'],
      legacy: ['bug', 'deprecation_warning', 'jira_ticket', 'null_pointer', 'spaghetti_code', 'zombie_process'],
      branches: ['merge_conflict'],
      dephell: ['memory_leak', 'race_condition', 'scope_creep', 'zombie_process'],
      production: ['flaky_test', 'graphics_glitch', 'jira_ticket', 'merge_conflict', 'null_pointer', 'race_condition'],
      sandbox: ['deprecation_warning'],
      training: ['deprecation_warning', 'flaky_test', 'rogue_agent', 'spaghetti_code'],
    };
    for (let d = 1; d <= 7; d++) {
      const th = BOTA.themeKeyAt(d);
      const home = Object.keys(E).filter((id) => {
        const def = E[id];
        return def.spawn !== false && !def.themeOnly && (def.weight || 0) > 0 && (def.minFloor || 1) <= d && BOTA.themeFactor(def, th) >= 1;
      }).sort();
      const want = (ROSTER[th] || []).filter((id) => E[id] && (E[id].minFloor || 1) <= d).sort();
      if (home.join() !== want.join()) out.push('Besetzung ' + th + ' (Etage ' + d + '): ' + home.join(',') + ' statt ' + want.join(','));
      // Auswaerts-Gegner zaehlen genau mit AWAY, Heimat-Gegner voll (oder mit ihrem themes-Faktor)
      for (const [id, def] of Object.entries(E)) {
        if (!Array.isArray(def.home) || (def.minFloor || 1) > d || !(def.weight > 0)) continue;
        const ratio = BOTA.enemyWeightAt(def, d) / BOTA.enemyWeightAt(def, d, null);
        const explicit = def.themes && Object.prototype.hasOwnProperty.call(def.themes, th);
        const exp = explicit ? def.themes[th] : (def.home.includes(th) ? 1 : BOTA.AWAY);
        if (Math.abs(ratio - exp) > 1e-9) out.push(id + ' auf Etage ' + d + ': Faktor ' + ratio.toFixed(3) + ' statt ' + exp);
      }
      // Raeume fuellen sich weiter sinnvoll; der Anteil der Auswaerts-Gegner ist klein, aber nicht null
      let all = 0, away = 0, rooms = 0;
      for (let i = 0; i < 800; i++) {
        const l = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('roster' + d + ':' + i)), d);
        rooms++; all += l.length;
        away += l.filter((id) => BOTA.themeFactor(E[id], th) < 1).length;
      }
      if (all / rooms < 3) out.push('Etage ' + d + ': nur ' + (all / rooms).toFixed(2) + ' Gegner pro Raum');
      const aw = away / Math.max(1, all);
      if (d === 1 ? aw > 0 : (aw < 0.05 || aw > 0.45)) out.push('Etage ' + d + ' (' + th + '): Auswaerts-Anteil ' + aw.toFixed(3));
    }

    // 2) Kakophonie: mixAt 0 vor 8, 0.25 auf 8, steigt um 0.1, ab 16 = 1; f' = f + (1 - f) * mix, Boosts bleiben
    for (let d = 1; d <= 22; d++) {
      const m = BOTA.mixAt(d);
      const want = d < BOTA.MIX_FROM ? 0 : Math.min(1, 0.25 + 0.1 * (d - BOTA.MIX_FROM));
      if (Math.abs(m - want) > 1e-9) out.push('mixAt(' + d + ') = ' + m);
    }
    if (BOTA.themeWeight(E.spinlock, 'latent') !== 0) out.push('themeWeight ohne Tiefe hebt an');
    if (Math.abs(BOTA.themeWeight(E.spinlock, 'latent', 8) - 0.25) > 1e-9) out.push('Kakophonie: themeOnly auf Etage 8 nicht 0.25');
    if (Math.abs(BOTA.themeWeight(E.bug, 'latent', 8) - (BOTA.AWAY + (1 - BOTA.AWAY) * 0.25)) > 1e-9) out.push('Kakophonie: AWAY auf Etage 8 falsch');
    if (BOTA.themeWeight(E.deprecation_warning, 'sandbox', 17) !== 2.5) out.push('Kakophonie: Boost auf Sandbox Borders veraendert');
    if (BOTA.themeWeight(E.bug, 'latent', 16) !== 1) out.push('Kakophonie: Etage 16 nicht voll gemischt');
    // Familien tauchen ab Etage 8 auf fremden Etagen auf, immer haeufiger
    const fam = ['stale_branch', 'detached_head', 'cherry_pick', 'spinlock', 'rootkit'];
    const famShare = (d) => {
      let n = 0, all = 0;
      for (let i = 0; i < 600; i++) {
        const l = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('mix' + d + ':' + i)), d);
        all += l.length; n += l.filter((id) => fam.includes(id)).length;
      }
      return n / Math.max(1, all);
    };
    const seen = new Set();
    for (const d of [8, 9, 10]) for (let i = 0; i < 600; i++) for (const id of BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('fam' + d + ':' + i)), d)) seen.add(id);
    for (const id of fam.concat(['orphan_commit'])) if (!seen.has(id)) out.push('Kakophonie: ' + id + ' fehlt auf Etage 8–10');
    const s8 = famShare(8), s12 = famShare(12);
    if (!(s8 > 0.05 && s12 > s8)) out.push('Kakophonie: Familien-Anteil ' + s8.toFixed(3) + ' (8) / ' + s12.toFixed(3) + ' (12)');
    // Octopus Merge sickert ab 8 mit gedeckeltem Gewicht (3 x mix) in fremde Etagen
    const ow = BOTA.bossWeightAt(BOTA.BOSSES.octopus_merge, 'latent', 8);
    if (Math.abs(ow - 0.75) > 1e-9) out.push('Octopus Merge auf Etage 8: Gewicht ' + ow);
    if (BOTA.bossWeightAt(BOTA.BOSSES.octopus_merge, 'branches', 14) !== 12) out.push('Octopus Merge: Heimat-Gewicht veraendert');

    // 3) Determinismus: gleiche Seeds -> gleiche Raeume; die Begegnungen ziehen nicht aus dem Etagen-RNG
    for (let i = 0; i < 20; i++) {
      const d = 8 + (i % 6), seed = 'det' + i;
      const a = new BOTA.Floor(d, seed), b = new BOTA.Floor(d, seed);
      const sig = (f) => [...f.cells.values()].map((c) => c.type + ':' + (c.room.layout && c.room.layout.id) + ':' + c.room.plannedEnemies.join('+') + ':' + c.room.encounterBoss).join('|');
      if (sig(a) !== sig(b)) { out.push('Etage nicht deterministisch (' + seed + ')'); break; }
      const keep = BOTA.ENCOUNTER_FROM;
      BOTA.ENCOUNTER_FROM = 99;
      let c0;
      try { c0 = new BOTA.Floor(d, seed); } finally { BOTA.ENCOUNTER_FROM = keep; }
      for (const cell of a.cells.values()) {
        const other = c0.get(cell.x, cell.y);
        if (!other || other.type !== cell.type) { out.push('Begegnung aendert die Karte (' + seed + ')'); break; }
        if (cell.room.encounterBoss) continue;
        if (other.room.plannedEnemies.join() !== cell.room.plannedEnemies.join() || other.room.layout !== cell.room.layout) { out.push('Begegnung aendert andere Raeume (' + seed + ')'); break; }
      }
    }

    // 4) Begegnungen: Anzahl je Tiefe, nur Kampfraeume, nicht neben dem Start, offene Arena, keine Objekte,
    //    keine normalen Gegner, erlaubte Bosse, nie der Etagen-Boss, auf einer Etage verschiedene Bosse
    let two = 0, many = 0, nearStart = 0;
    for (let i = 0; i < 300; i++) {
      const d = 6 + (i % 10), f = new BOTA.Floor(d, 'enc' + i);
      const enc = [...f.cells.values()].filter((c) => c.room.encounterBoss);
      if (enc.length !== f.encounterRooms.length) out.push('enc' + i + ': encounterRooms passt nicht');
      if (d < 8 && enc.length) out.push('Begegnung auf Etage ' + d);
      if ((d === 8 || d === 9) && enc.length !== 1) out.push(enc.length + ' Begegnungen auf Etage ' + d);
      if (d >= 10) { many++; if (enc.length === 2) two++; else if (enc.length !== 1) out.push(enc.length + ' Begegnungen auf Etage ' + d); }
      const bossId = f.findType('boss').room.bossId;
      if (enc.length === 2 && enc[0].room.encounterBoss === enc[1].room.encounterBoss) out.push('enc' + i + ': zweimal derselbe Zwischenboss');
      for (const c of enc) {
        const rm = c.room;
        if (c.type !== 'normal') out.push('enc' + i + ': Begegnung in ' + c.type);
        if (c.dist < 2) nearStart++;
        if (!BOTA.ENCOUNTER_BOSSES.includes(rm.encounterBoss)) out.push('enc' + i + ': Boss ' + rm.encounterBoss);
        if (rm.encounterBoss === bossId) out.push('enc' + i + ': Zwischenboss = Etagen-Boss ' + bossId);
        if (rm.plannedEnemies.length) out.push('enc' + i + ': Begegnung mit normalen Gegnern');
        if (!rm.layout || !rm.layout.tags.includes('special')) out.push('enc' + i + ': keine offene Arena (' + (rm.layout && rm.layout.id) + ')');
        if (rm.props.size) out.push('enc' + i + ': Objekte in der Arena');
        for (let r = 1; r < 8; r++) for (let cc = 1; cc < 14; cc++) if (rm.tileAt(cc, r) === BOTA.TILES.PROP) out.push('enc' + i + ': PROP-Kachel in der Arena');
        // Raummitte frei (dort startet der Boss)
        if (rm.tileAt(7, 4) !== BOTA.TILES.FLOOR) out.push('enc' + i + ': Arenamitte blockiert');
      }
      // Nachtraegliche Wahl mit dem endgueltigen Etagen-Boss (game.assignFloorBoss) vermeidet auch den
      for (const avoid of BOTA.ENCOUNTER_BOSSES) {
        f.pickEncounterBosses(avoid);
        if (enc.some((c) => c.room.encounterBoss === avoid)) { out.push('pickEncounterBosses vermeidet ' + avoid + ' nicht'); break; }
      }
      if (out.length > 20) break;
    }
    if (nearStart > 3) out.push(nearStart + ' Begegnungen neben dem Startraum');
    if (Math.abs(two / Math.max(1, many) - 0.5) > 0.12) out.push('Anteil zweier Begegnungen ab Etage 10: ' + (two / many).toFixed(2));
    return out;
  });
  problems.push(...spawnProblems);

  // --- Zwischenboss-Begegnungen live: jeder der vier Bosse durch eine Tuer betreten -> kein Intro, kein
  //     Boss-Raum-Zeug, HP x ENCOUNTER_HP, er agiert, raeumt beim Tod den Raum und hinterlaesst nichts ---
  await page.evaluate(() => { window.__intro = 0; BOTA.bus.on('bossIntro', () => { window.__intro++; }); });
  for (const id of await page.evaluate(() => BOTA.ENCOUNTER_BOSSES.slice())) {
    const setup = await page.evaluate((id) => {
      const out = [];
      const g = BOTA.game;
      g.enterFloor(8); g.setState('play');
      BOTA.debug.god(true);
      const cell = g.floor.encounterRooms[0];
      if (!cell) return { out: ['Etage 8 ohne Begegnung'] };
      cell.room.encounterBoss = id;
      // Nachbarraum betreten, leeren, dann durch die Tuer in die Arena (wie beim normalen Spielen)
      const dir = Object.keys(cell.room.doors).find((k) => ['normal', 'start'].includes(cell.room.doors[k].target.type));
      if (!dir) return { out: [id + ': Arena ohne normalen Nachbarraum'] };
      const from = cell.room.doors[dir].target.room;
      g.teleport(from);
      g.pendingBossIntro = false;
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      from.enemies.length = 0; from.projectiles.length = 0;
      g.changeRoom(BOTA.OPPOSITE[dir]);
      if (g.room !== cell.room) out.push(id + ': Tuer fuehrt nicht in die Arena');
      const bosses = g.room.enemies.filter((e) => e.isBoss);
      const want = id === 'rogue_swarm' ? 4 : 1;
      if (bosses.length !== want) out.push(id + ': ' + bosses.length + ' Boss-Entities statt ' + want);
      const hp = Math.round(BOTA.BOSSES[id].hp * (1 + 0.3 * 7) * BOTA.ENCOUNTER_HP);
      for (const b of bosses) {
        if (!b.encounter) out.push(id + ': nicht als Begegnung markiert');
        if (b.maxHp !== hp) out.push(id + ': maxHp ' + b.maxHp + ' statt ' + hp);
      }
      if (!g.room.combatClosed) out.push(id + ': Tueren bleiben offen');
      if (g.pendingBossIntro) out.push(id + ': Boss-Intro vorgemerkt');
      // Frueher gegebene Items (Daily Standup: 2 s Einfrieren beim Betreten) sollen den Test nicht verfaelschen:
      // geprueft wird die Begegnung, nicht die Items. Ohne das blieb der Monolith (1 s Schonfrist) knapp 3 s stehen.
      for (const e of g.room.enemies) e.frozen = 0;
      window.__start = bosses.map((b) => [b.x, b.y]);
      // Aktivitaet laufend beobachten (nicht nur ein Schnappschuss nach 3 s): der Monolith stampft z. B. auf der
      // Stelle, und seine Schockwellen sind keine Projektile. Bewegung, Gegnerschuss oder Moduswechsel zaehlen.
      window.__acted = false;
      const modes = bosses.map((b) => b.state && b.state.mode);
      clearInterval(window.__actWatch);
      window.__actWatch = setInterval(() => {
        const r = BOTA.game.room;
        if (r.projectiles.some((pr) => pr.team === 'enemy')) window.__acted = true;
        bosses.forEach((b, i) => {
          if (Math.hypot(b.x - window.__start[i][0], b.y - window.__start[i][1]) > 4) window.__acted = true;
          if (b.state && b.state.mode !== modes[i]) window.__acted = true;
        });
      }, 50);
      return { out };
    }, id);
    problems.push(...setup.out);
    if (setup.out.length) continue;
    await page.waitForTimeout(3000);
    await shot('08-encounter-' + id);
    problems.push(...await page.evaluate((id) => {
      const out = [];
      const g = BOTA.game;
      if (g.state !== 'play') out.push(id + ': Zustand ' + g.state + ' statt play (Intro?)');
      if (window.__intro) out.push(id + ': bossIntro ausgeloest');
      const bosses = g.room.enemies.filter((e) => e.isBoss && !e.dead);
      const moved = bosses.some((b, i) => window.__start[i] && Math.hypot(b.x - window.__start[i][0], b.y - window.__start[i][1]) > 4);
      const shots = g.room.projectiles.some((p) => p.team === 'enemy');
      clearInterval(window.__actWatch);
      if (!moved && !shots && !window.__acted) out.push(id + ': Zwischenboss tut nichts');
      return out;
    }, id));
    for (let i = 0; i < 6; i++) { await page.evaluate(() => BOTA.debug.killAll()); await page.waitForTimeout(300); }
    await page.waitForTimeout(1200);
    problems.push(...await page.evaluate((id) => {
      const out = [];
      const g = BOTA.game, room = g.room;
      if (room.enemies.length) out.push(id + ': ' + room.enemies.length + ' Entities bleiben zurueck (' + [...new Set(room.enemies.map((e) => e.id))].join(',') + ')');
      if (!room.cleared || room.combatClosed) out.push(id + ': Raum nicht geraeumt');
      if (room.pickups.some((p) => p instanceof BOTA.Trapdoor)) out.push(id + ': Falltuer im Begegnungsraum');
      if (room.pickups.some((p) => p instanceof BOTA.Pedestal)) out.push(id + ': Boss-Podest im Begegnungsraum');
      if (g.state !== 'play') out.push(id + ': Zustand ' + g.state + ' nach dem Kampf');
      if (window.__intro) out.push(id + ': bossIntro ausgeloest');
      return out;
    }, id));
  }

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

  // --- Stack Trace (Legacy Codebase): auf Tiefe 1–7 nur dort; Telegraph (Linie folgt, rastet ein) vor jedem Stich;
  //     Stachel 2, ausgerolltes Papier 1, Einfalten harmlos; Exception nur jenseits der Reichweite (165–260 px/s,
  //     1 Schaden); Waende begrenzen den Schwanz; Stack-Abbau 5 -> 4 -> 3; Tod raeumt Exceptions ab; killAll ---
  const stackProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, DT = 1 / 60, I = BOTA.C.INNER;
    // 1) Spawn: auf Tiefe 1–7 nur auf Legacy Codebase (ab Tiefe 8 duerfen Themen-Gegner auch anderswo auftauchen),
    //    dort aber wirklich, und hoechstens maxPerRoom pro Raum
    let onLegacy = 0;
    for (let d = 1; d <= 7; d++) {
      const legacy = BOTA.themeKeyAt(d) === 'legacy';
      let hits = 0, over = 0;
      for (let i = 0; i < 300; i++) {
        const n = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('stack' + d + ':' + i)), d).filter((x) => x === 'stack_trace').length;
        hits += n;
        if (n > BOTA.ENEMIES.stack_trace.maxPerRoom) over++;
      }
      if (!legacy && hits) out.push('Stack Trace auf Etage ' + d + ' (' + BOTA.themeKeyAt(d) + ')');
      if (over) out.push('Stack Trace: mehr als maxPerRoom in ' + over + ' Raeumen auf Etage ' + d);
      if (legacy) onLegacy += hits;
    }
    if (!onLegacy) out.push('Stack Trace: nie auf Legacy Codebase gewuerfelt');

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(false);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player;
    // Treffer am Spieler mitschneiden, ohne dass er Schaden nimmt (eigene Eigenschaft ueberdeckt die Methode)
    const hits = [];
    let cur = null;
    p.hurt = function (amount, source) { hits.push({ amount, source, mode: cur ? cur.state.mode : '?' }); return false; };
    const events = [];
    const offs = [
      BOTA.bus.on('enemyWindup', (e) => { if (e.enemy && e.enemy.id === 'stack_trace') events.push('windup'); }),
      BOTA.bus.on('enemyShed', (e) => { if (e.enemy && e.enemy.id === 'stack_trace') events.push('shed'); }),
    ];
    const enemyShots = () => g.room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead);
    const spawn = (x, y) => { const e = BOTA.debug.spawn('stack_trace', x, y); e.spawnDelay = 0; cur = e; return e; };
    // Laeuft bis zum naechsten 'move' nach einem Stich; misst Telegraph-Dauer und prueft, dass der Schwanz im Raum bleibt
    const attack = (e, maxSteps) => {
      const s = e.state, r = { trace: 0, traceAtSting: -1, hitsBefore: hits.length, outside: 0, stung: false };
      for (let i = 0; i < (maxSteps || 400); i++) {
        e.frozen = 0;
        e.update(DT, g);
        if (s.mode === 'trace') r.trace += DT;
        if (s.mode === 'sting' && r.traceAtSting < 0) r.traceAtSting = r.trace;
        // nur der ausgerollte Schwanz zaehlt (eingerollt ragt er als Zeichnung ueber den Koerper hinaus)
        if (s.pts && s.ext >= 0.25) for (const q of s.pts) if (q.x < I.x0 - 2 || q.x > I.x1 + 2 || q.y < I.y0 - 2 || q.y > I.y1 + 2) r.outside++;
        if (s.mode === 'sting' || s.mode === 'hold') r.stung = true;
        if (r.stung && s.mode === 'move') break;
      }
      r.hits = hits.slice(r.hitsBefore);
      return r;
    };
    try {
      const tele = BOTA.ENEMIES.stack_trace.params.track + BOTA.ENEMIES.stack_trace.params.lock;
      // 2) Stich aus kurzer Distanz: Telegraph, dann Stachel (2); kein Schuss, weil der Spieler in Reichweite steht
      p.x = 480; p.y = 420;
      const A = spawn(480, 270);
      const P = A.params;
      if (A.state.n !== P.frames) out.push('Stack Trace: startet mit ' + A.state.n + ' statt ' + P.frames + ' Blaettern');
      A.state.cd = 0.01;
      events.length = 0;
      const ra = attack(A);
      if (!ra.stung) out.push('Stack Trace: sticht nie');
      else {
        if (ra.traceAtSting < tele - 0.02) out.push('Stack Trace: Telegraph nur ' + ra.traceAtSting.toFixed(2) + ' s');
        if (!events.includes('windup')) out.push('Stack Trace: kein Warn-Event vor dem Stich');
        if (ra.hits.some((h) => h.mode !== 'sting' && h.mode !== 'hold')) out.push('Stack Trace: Schaden ausserhalb von Stich/Liegen (' + ra.hits.map((h) => h.mode).join(',') + ')');
        if (!ra.hits.length || ra.hits[0].amount !== P.stingDamage || P.stingDamage !== 2) out.push('Stack Trace: Stachel macht ' + (ra.hits[0] ? ra.hits[0].amount : 0) + ' statt 2 Schaden');
        if (ra.hits.some((h) => h.source !== 'Stack Trace')) out.push('Stack Trace: falsche Schadensquelle');
        if (enemyShots().length) out.push('Stack Trace: schiesst, obwohl der Spieler in Reichweite steht');
        if (ra.outside) out.push('Stack Trace: Schwanz verlaesst den Raum');
      }
      // 3) Ausgerolltes Papier (nicht der Stachel): halbes Herz; beim Einfalten kein Schaden
      hits.length = 0;
      A.x = 480; A.y = 200; A.vx = A.vy = 0;
      Object.assign(A.state, { mode: 'hold', t: 0.3, ext: 1, dir: Math.PI / 2 });
      p.x = 480; p.y = 200 + A.r + 8 + 2 * P.spacing;    // genau auf dem dritten Blatt
      A.update(DT, g);
      if (!hits.length || hits[0].amount !== 1) out.push('Stack Trace: Papier macht ' + (hits[0] ? hits[0].amount : 0) + ' statt 1 Schaden');
      hits.length = 0;
      Object.assign(A.state, { mode: 'retract', t: P.retract, ext0: 1, ext: 1 });
      for (let i = 0; i < 20; i++) A.update(DT, g);
      if (hits.length) out.push('Stack Trace: Einfalten macht Schaden');
      A.hurt(1e6, g, {});

      // 4) Spieler ausser Reichweite: nach dem Telegraph fliegt eine Exception (165–260 px/s, 1 Schaden) entlang
      //    der Linie weiter; stirbt der Stack Trace, verpufft sie
      g.room.projectiles.length = 0;
      p.x = 480; p.y = 470;
      const B2 = spawn(480, 130);
      B2.state.cd = 0.01;
      let bolt = null, traceAtShot = -1, tr = 0;
      for (let i = 0; i < 400 && !bolt; i++) {
        B2.frozen = 0;
        B2.update(DT, g);
        if (B2.state.mode === 'trace') tr += DT;
        const sh = enemyShots();
        if (sh.length) { bolt = sh[0]; traceAtShot = tr; }
      }
      if (!bolt) out.push('Stack Trace: keine Exception ueber die Reichweite hinaus');
      else {
        if (traceAtShot < tele - 0.02) out.push('Stack Trace: Exception nach nur ' + traceAtShot.toFixed(2) + ' s Telegraph');
        if (bolt.speed < 165 || bolt.speed > 260) out.push('Stack Trace: Exception mit ' + Math.round(bolt.speed) + ' px/s');
        if (bolt.damage !== 1) out.push('Stack Trace: Exception macht ' + bolt.damage + ' Schaden');
        if (Math.abs(Math.atan2(bolt.vy, bolt.vx) - B2.state.dir) > 0.01) out.push('Stack Trace: Exception fliegt nicht entlang der Ziellinie');
        if (enemyShots().length !== 1) out.push('Stack Trace: ' + enemyShots().length + ' statt 1 Exception');
        B2.hurt(1e6, g, {});
        if (!bolt.dead) out.push('Stack Trace: Exception ueberlebt den Tod des Stack Trace');
      }

      // 5) Wand: Schwanz Richtung Wand wird gekuerzt, bleibt im Raum, wirft keine Exception
      g.room.projectiles.length = 0;
      p.x = 700; p.y = 400;
      const C = spawn(200, 120);
      Object.assign(C.state, { mode: 'trace', t: P.track, dir: -Math.PI / 2, aimDist: 400 });
      const rc = attack(C);
      if (C.state.throws || enemyShots().length) out.push('Stack Trace: Exception trotz Wand');
      if (rc.outside) out.push('Stack Trace: Schwanz steckt in der Wand');
      C.hurt(1e6, g, {});

      // 6) Stack-Abbau: 5 Blaetter -> 4 (ab 2/3 HP) -> 3 (ab 1/3 HP), dann nicht weniger; je ein Papier-Event
      p.x = 800; p.y = 450;
      const D = spawn(200, 300);
      D.state.cd = 99;
      events.length = 0;
      D.hurt(D.maxHp * 0.34, g, {}); D.update(DT, g);
      const n1 = D.state.n;
      D.hurt(D.maxHp * 0.34, g, {}); D.update(DT, g);
      const n2 = D.state.n;
      D.hp = 0.2; D.update(DT, g);
      const n3 = D.state.n;
      if (n1 !== 4 || n2 !== 3 || n3 !== 3) out.push('Stack Trace: Stack-Abbau ' + [n1, n2, n3].join(' -> ') + ' statt 4 -> 3 -> 3');
      if (events.filter((x) => x === 'shed').length !== 2) out.push('Stack Trace: ' + events.filter((x) => x === 'shed').length + ' statt 2 Papier-Events');
      D.hurt(1e6, g, {});

      // 7) Sounds der Familie 'legacy' vorhanden und abspielbar
      for (const n of ['legacyHit', 'legacyDeath', 'dotMatrix']) {
        if (!BOTA.audio.names().includes(n)) out.push('Sound fehlt: ' + n);
        try { BOTA.audio.play(n); } catch (err) { out.push('Sound ' + n + ': ' + err.message); }
      }

      // 8) killAll mitten im Angriff: nichts bleibt zurueck (keine Gegner, keine Exceptions)
      g.room.projectiles.length = 0;
      p.x = 480; p.y = 470;
      const E1 = spawn(300, 130), E2 = spawn(660, 130);
      E1.state.cd = E2.state.cd = 0.01;
      for (let i = 0; i < 70; i++) for (const e of [E1, E2]) { e.frozen = 0; e.update(DT, g); }
      BOTA.debug.killAll();
      g.room.enemies = g.room.enemies.filter((en) => !en.dead);
      if (g.room.enemies.some((en) => en.id === 'stack_trace')) out.push('Stack Trace: killAll laesst Gegner zurueck');
      if (enemyShots().length) out.push('Stack Trace: killAll laesst Exceptions zurueck');
    } finally {
      delete p.hurt;
      for (const off of offs) off();
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      g.room.projectiles.length = 0;
      BOTA.debug.god(true);
    }
    return out;
  });
  problems.push(...stackProblems);
  // Optik: Stack Trace auf Legacy Codebase — eingerastete Ziellinie, ausgerollter Schwanz, Ruhe nach Stack-Abbau
  await page.evaluate(() => {
    const g = BOTA.game; g.enterFloor(2); g.setState('play');
    const c = [...g.floor.cells.values()].find((x) => x.type === 'normal');
    c.room.populated = true; c.room.cleared = true; g.teleport(c.room);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    const p = g.player; p.x = 480; p.y = 470;
    const at = (x, y) => { const q = g.nearestFreePos(x, y); const e = BOTA.debug.spawn('stack_trace', q.x, q.y); e.spawnDelay = 0; return e; };
    const a = at(250, 200), b = at(700, 200), d = at(820, 430);
    a.params.lock = 99;   // nur dieses Exemplar (params ist eine Kopie): Ziellinie bleibt eingerastet stehen
    Object.assign(a.state, { mode: 'trace', t: 0.7, dir: Math.atan2(p.y - a.y, p.x - a.x), aimDist: 400 });
    Object.assign(b.state, { mode: 'hold', t: 99, ext: 1, dir: Math.atan2(p.y - b.y, p.x - b.x) - 0.4 });
    d.hp = d.maxHp * 0.5; d.state.cd = 99; d.update(1 / 60, g);
  });
  await page.waitForTimeout(250);
  await shot('15-stack-trace');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); BOTA.game.room.projectiles.length = 0; });

  // --- Dependency Hell: Honeypot (Sog entkommbar und gedeckelt, Telegraph vor Sog und Biss, frisst Gegner und Bomben,
  //     zieht nie in Gruben) und Rolling Release (schneller je Abprall bis zur Obergrenze, Breaking Change mit
  //     Telegraph, Ring in 165–260 px/s, Schadensfaktoren, sauberer Tod). Getaktet wird direkt per e.update. ---
  const depProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, E = BOTA.ENEMIES, DT = 1 / 60, TILES = BOTA.TILES, I = BOTA.C.INNER;
    // 1) Spawn: nur auf ihren Heimat-Etagen (geprueft fuer Tiefe 1–7; ab 8 duerfen Themen-Gegner auslaufen)
    const homes = { honeypot: ['dephell'], rolling_release: ['dephell', 'sandbox'] };
    for (const [id, th] of Object.entries(homes)) {
      if (!E[id] || !BOTA.hasSprite(E[id].sprite)) { out.push(id + ': Definition oder Sprite fehlt'); continue; }
      for (let d = 1; d <= 7; d++) {
        let n = 0;
        for (let i = 0; i < 300; i++) if (BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('dep' + d + ':' + i)), d).includes(id)) n++;
        const home = th.includes(BOTA.themeKeyAt(d));
        if (home && n === 0) out.push(id + ': taucht auf seiner Heimat-Etage ' + d + ' nie auf');
        if (!home && n > 0) out.push(id + ': taucht auf Etage ' + d + ' (' + BOTA.themeKeyAt(d) + ') auf');
      }
    }
    if (!BOTA.hasSprite('enemy_rolling_release_open')) out.push('Rolling Release: Sprite "open" fehlt');

    BOTA.debug.gotoRoom('start'); BOTA.debug.god(true);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    g.room.projectiles.length = 0;
    const p = g.player, room = g.room;
    // Spieler-Treffer mitschneiden statt anwenden (Items wie Guardrails/Retry duerfen das Ergebnis nicht verfaelschen)
    const hits = [];
    p.hurt = function (amt, src) { hits.push({ amt, src }); return true; };
    const wasFlying = p.flying;
    p.flying = false;
    const events = [];
    const offs = ['enemyWindup', 'enemyChomp', 'enemyBounce', 'enemyUnpack'].map((n) => BOTA.bus.on(n, (e) => events.push({ n, sound: e.sound, ate: e.ate, t: g.runStats.time })));
    const changed = [];
    const setTile = (c, r, t) => { changed.push([c, r, room.tileAt(c, r)]); room.setTile(c, r, t); };
    try {
      // 2) Honeypot
      const H = BOTA.debug.spawn('honeypot', 480, 290);
      H.spawnDelay = 0;
      const S = H.state, P = H.params;
      const cap = P.pullCap * 240 * p.stats.speed;
      // Nur das Verhalten takten (ohne Kontaktschaden des Topfes), damit die Treffer-Liste nur Bisse enthaelt
      const tick = () => { H.t += DT; H.behavior.update(H, DT, g); };
      const step = (n, each) => { for (let i = 0; i < n; i++) { tick(); if (each && each() === false) break; } };
      if (!H.static || H.contactDamage !== 1) out.push('Honeypot: nicht statisch oder Kontaktschaden != 1');
      // Telegraph vor dem Sog: vom Ruhen bis zum Sog vergeht mindestens P.tell, mit "slurp"-Event
      p.x = 480 + 150; p.y = 290;
      let tellT = 0, movedBeforePull = false;
      step(400, () => {
        if (S.mode === 'tell') tellT += DT;
        if (S.mode !== 'pull' && Math.abs(p.x - 630) > 0.01) movedBeforePull = true;
        return S.mode !== 'pull';
      });
      if (S.mode !== 'pull') out.push('Honeypot: Sog beginnt nie');
      if (tellT < 0.5 || tellT < P.tell - 0.02) out.push('Honeypot: Telegraph vor dem Sog nur ' + tellT.toFixed(2) + ' s');
      if (movedBeforePull) out.push('Honeypot: zieht schon vor dem Sog');
      if (!events.some((e) => e.n === 'enemyWindup' && e.sound === 'slurp')) out.push('Honeypot: kein Telegraph-Event (slurp)');
      // Sog-Staerke: innen > 0, aussen 0, nie ueber der Obergrenze (auch mit halbem Tempo)
      const measure = (d) => {
        p.x = 480 + d; p.y = 290;
        const tSave = S.t; S.t = 1.5;         // mitten im Sog, nicht in der Biss-Phase
        tick();
        S.t = tSave;
        return (480 + d - p.x) / DT;
      };
      let maxPull = 0;
      for (let d = 40; d <= 260; d += 10) {
        const v = measure(d);
        maxPull = Math.max(maxPull, v);
        if (d < P.radius - 5 && v <= 1) out.push('Honeypot: kein Sog bei ' + d + ' px');
        if (d > P.radius + 5 && Math.abs(v) > 0.01) out.push('Honeypot: Sog ausserhalb des Trichters (' + d + ' px)');
      }
      // feste Grenze (nicht aus den Parametern abgeleitet): hoechstens 60 % der Spielergeschwindigkeit
      if (maxPull > cap + 0.5 || maxPull > 0.6 * 240 * p.stats.speed) out.push('Honeypot: Sog ' + maxPull.toFixed(0) + ' px/s ueber der Obergrenze ' + cap.toFixed(0));
      const spd0 = p.stats.speed;
      p.stats.speed = 0.5;
      const slowPull = measure(60);
      p.stats.speed = spd0;
      if (slowPull > P.pullCap * 240 * 0.5 + 0.5 || slowPull > 0.6 * 240 * 0.5) out.push('Honeypot: Sog bei Tempo 0.5 nicht gedeckelt (' + slowPull.toFixed(0) + ' px/s)');
      // Entkommen: wer mit voller Geschwindigkeit wegrennt, wird nie gebissen und kommt heraus
      S.mode = 'pull'; S.t = P.pull; S.warned = false;
      p.x = 480 + 120; p.y = 290;
      let minD = 999;
      hits.length = 0;
      step(Math.ceil(P.pull / DT) + 2, () => {
        p.x = Math.min(I.x1 - 30, p.x + 240 * p.stats.speed * DT);   // "Spieler laeuft nach rechts weg"
        minD = Math.min(minD, Math.hypot(p.x - 480, p.y - 290));
      });
      if (minD < 115 || hits.length) out.push('Honeypot: Wegrennen hilft nicht (min ' + minD.toFixed(0) + ' px, Treffer ' + hits.length + ')');
      // Stehenbleiben: wird hineingezogen; Biss-Warnung (gnash) mindestens biteTell vor dem Biss, Biss = 2
      step(400, () => S.mode !== 'pull');
      p.x = 480 + 150; p.y = 290;
      hits.length = 0;
      events.length = 0;
      let warnAt = null, biteAt = null, tt = 0;
      const nBefore = events.length;
      step(Math.ceil(P.pull / DT) + 5, () => {
        tt += DT;
        if (warnAt === null && events.slice(nBefore).some((e) => e.sound === 'gnash')) warnAt = tt;
        if (biteAt === null && events.slice(nBefore).some((e) => e.n === 'enemyChomp')) { biteAt = tt; return false; }
      });
      if (biteAt === null) out.push('Honeypot: schnappt nie zu');
      else {
        if (warnAt === null || biteAt - warnAt < Math.max(0.4, P.biteTell - 0.03)) out.push('Honeypot: Biss-Warnung zu kurz/fehlt');
        if (hits.length !== 1 || hits[0].amt !== 2) out.push('Honeypot: Biss auf stehenden Spieler ' + JSON.stringify(hits));
      }
      // Grube zwischen Spieler und Topf: der Sog zieht niemanden hinein
      S.mode = 'pull'; S.t = P.pull; S.warned = false;
      const tc = room.worldToTile(480 + 96, 290);
      setTile(tc.c, tc.r, TILES.PIT);
      p.x = (tc.c + 1) * 64 + p.r + 2; p.y = room.tileCenter(tc.c, tc.r).y;
      step(Math.ceil((P.pull - P.biteTell - 0.1) / DT));
      const pt = room.worldToTile(p.x, p.y);
      if (room.tileAt(pt.c, pt.r) === TILES.PIT || p.x - p.r < (tc.c + 1) * 64 - 0.5) out.push('Honeypot: zieht den Spieler in eine Grube');
      p.x = 160; p.y = 470;                     // weit weg (ausserhalb des Trichters)
      step(400, () => S.mode !== 'idle');
      // Andere Gegner: laufende werden gezogen und im Maul gebissen, Flieger nicht; Bomben im Maul zuenden
      const bug = BOTA.debug.spawn('bug', 480 - 110, 290);
      const fly = BOTA.debug.spawn('null_pointer', 480, 290 - 110);
      const bomb = new BOTA.Bomb(480 + 100, 290 + 40, { fuse: 99 });
      room.projectiles.push(bomb);
      const bugX = bug.x, flyY = fly.y, bugHp = bug.hp;
      S.mode = 'pull'; S.t = P.pull; S.warned = false;
      events.length = 0;
      step(Math.ceil(P.pull / DT) + 3);
      if (!(bug.x > bugX + 30)) out.push('Honeypot: zieht andere Laeufer nicht');
      if (Math.abs(fly.y - flyY) > 0.01) out.push('Honeypot: zieht Flieger');
      if (!(bug.dead || bug.hp < bugHp)) out.push('Honeypot: beisst andere Gegner im Maul nicht');
      if (!(bomb.fuse <= 0)) out.push('Honeypot: Bombe im Maul zuendet nicht (Abstand ' + Math.hypot(bomb.x - 480, bomb.y - 290).toFixed(0) + ' px)');
      bomb.dead = true;
      // Tod
      H.hurt(1e6, g, {});
      if (!H.dead) out.push('Honeypot: stirbt nicht');
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      room.projectiles.length = 0;
      if (room.enemies.some((e) => !e.dead)) out.push('Honeypot: killAll laesst etwas zurueck');

      // 3) Rolling Release
      p.x = I.x0 + 40; p.y = I.y0 + 40;
      const R = BOTA.debug.spawn('rolling_release', 480, 300);
      R.spawnDelay = 0;
      const RS = R.state, RP = R.params;
      // Felsen im Weg: er prallt auch daran ab und steckt nie darin
      setTile(4, 6, TILES.ROCK);
      setTile(10, 2, TILES.ROCK);
      events.length = 0;
      let aimT = 0, firstRoll = null, maxSp = 0, inSolid = false, outside = false, badStep = '', lastSpeed = RS.speed;
      let quakeT = 0, opened = null, rollTaken = null, sawReset = false, contact = new Set();
      for (let i = 0; i < 60 * 40 && !sawReset; i++) {
        R.update(DT, g);
        contact.add(R.contactDamage);
        if (RS.mode === 'aim' && firstRoll === null) aimT += DT;
        if (RS.mode === 'roll' && firstRoll === null) firstRoll = aimT;
        if (RS.mode === 'roll') {
          const v = Math.hypot(R.vx, R.vy);
          maxSp = Math.max(maxSp, v, RS.speed);
          if (RS.speed !== lastSpeed) {
            const want = Math.min(RP.maxSpeed, lastSpeed + RP.bump);
            if (Math.abs(RS.speed - want) > 1e-6) badStep = lastSpeed + '->' + RS.speed;
            lastSpeed = RS.speed;
          }
          if (rollTaken === null && RS.rollT > 1) {
            const hp = R.hp; R.hurt(4, g, {}); rollTaken = hp - R.hp;
          }
        }
        if (room.isSolidAt(R.x, R.y, 'walk', false)) inSolid = true;
        if (R.x < I.x0 || R.x > I.x1 || R.y < I.y0 || R.y > I.y1) outside = true;
        if (RS.mode === 'quake') quakeT += DT;
        if (RS.mode === 'open' && !opened) {
          const shots = room.projectiles.filter((pr) => pr.team === 'enemy' && !pr.dead);
          const hp = R.hp; R.hurt(4, g, {});
          opened = { quakeT, shots: shots.length, speeds: shots.map((pr) => pr.speed), taken: hp - R.hp, bounces: RS.bounces, major: RS.major };
          room.projectiles.length = 0;
        }
        if (opened && RS.mode === 'aim') sawReset = true;
      }
      const bounces = events.filter((e) => e.n === 'enemyBounce').length;
      if (firstRoll === null) out.push('Rolling Release: rollt nie los');
      else if (firstRoll < Math.max(0.5, RP.aim - 0.02)) out.push('Rolling Release: Zielen nur ' + firstRoll.toFixed(2) + ' s');
      if (!events.some((e) => e.sound === 'wobble')) out.push('Rolling Release: kein Ziel-Telegraph-Event');
      if (bounces < 3) out.push('Rolling Release: nur ' + bounces + ' Abpraller');
      if (badStep) out.push('Rolling Release: falscher Tempo-Sprung ' + badStep);
      if (maxSp > Math.min(RP.maxSpeed, 260) + 0.5) out.push('Rolling Release: Tempo ' + maxSp.toFixed(0) + ' ueber der Obergrenze');
      if (inSolid || outside) out.push('Rolling Release: steckt in Fels/Wand oder verlaesst den Raum');
      if (contact.size !== 1 || !contact.has(1)) out.push('Rolling Release: Kontaktschaden ' + [...contact].join(','));
      if (rollTaken === null || Math.abs(rollTaken - 4 * RP.rollTaken) > 1e-6) out.push('Rolling Release: rollend nimmt er ' + rollTaken + ' statt ' + 4 * RP.rollTaken);
      if (!opened) out.push('Rolling Release: kein Breaking Change');
      else {
        if (opened.quakeT < Math.max(0.5, RP.quake - 0.02)) out.push('Rolling Release: Beben vor dem Aufplatzen nur ' + opened.quakeT.toFixed(2) + ' s');
        if (!events.some((e) => e.sound === 'quake')) out.push('Rolling Release: kein Beben-Event');
        if (opened.shots !== RP.ring) out.push('Rolling Release: ' + opened.shots + ' statt ' + RP.ring + ' Schuesse beim Aufplatzen');
        if (opened.speeds.some((v) => v < 165 || v > 260)) out.push('Rolling Release: Schussgeschwindigkeit ausserhalb 165–260');
        if (Math.abs(opened.taken - 4 * RP.openTaken) > 1e-6) out.push('Rolling Release: ausgepackt nimmt er ' + opened.taken + ' statt ' + 4 * RP.openTaken);
        if (!events.some((e) => e.n === 'enemyUnpack')) out.push('Rolling Release: kein Unpack-Event');
      }
      if (!sawReset) out.push('Rolling Release: packt sich nach dem Breaking Change nicht neu');
      else if (RS.speed !== R.speed || RS.major !== 2 || RS.bounces !== 0) out.push('Rolling Release: kein Neustart (Tempo ' + RS.speed + ', v' + RS.major + ')');
      // Tod: sauber, nichts bleibt zurueck
      R.hurt(1e6, g, {});
      if (!R.dead) out.push('Rolling Release: stirbt nicht');
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      if (room.enemies.some((e) => !e.dead)) out.push('Rolling Release: killAll laesst etwas zurueck');
    } finally {
      for (const off of offs) off();
      delete p.hurt;                       // zurueck zur Klassen-Methode
      p.flying = wasFlying;
      for (const [c, r, t] of changed.reverse()) room.setTile(c, r, t);
      for (let i = 0; i < 4; i++) BOTA.debug.killAll();
      room.projectiles.length = 0;
    }
    return out;
  });
  problems.push(...depProblems);

  // Optik: Honeypot (kurz vor dem Biss) und Rolling Release (ausgepackt + zielend) in einem normalen Raum auf
  // Dependency Hell (Bild pruefen!). Posen werden gehalten (update leer), damit nichts weiterlaeuft.
  await page.evaluate(() => {
    const g = BOTA.game;
    g.enterFloor(BOTA.FLOOR_THEMES.findIndex((t) => t.key === 'dephell') + 1); g.setState('play');
    const c = [...g.floor.cells.values()].find((x) => x.type === 'normal');
    c.room.populated = true; c.room.cleared = true;
    g.teleport(c.room);
    for (let i = 0; i < 4; i++) BOTA.debug.killAll();
    const at = (x, y) => g.nearestFreePos(x, y);
    const put = (id, x, y, st) => {
      const q = at(x, y), e = BOTA.debug.spawn(id, q.x, q.y);
      e.spawnDelay = 0; Object.assign(e.state, st);
      e.update = function (dt) { this.t += dt; };   // Pose halten, Animation laeuft weiter
      return e;
    };
    put('honeypot', 560, 300, { mode: 'pull', t: 0.3, pullK: 1, warned: true });
    put('rolling_release', 220, 170, { mode: 'open', t: 1.5, major: 2 });
    put('rolling_release', 800, 470, { mode: 'aim', t: 0.2, minor: 4 });
    const q = at(330, 330); g.player.x = q.x; g.player.y = q.y;
  });
  await page.waitForTimeout(250);
  await shot('06-dephell-enemies');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); });

  // --- Production-Familie (Etage 5): Rate Limiter und Port Scanner ---------------------------------------------
  //     nur auf Production (geprueft fuer Etage 1–7); Rate Limiter: Telegraph -> genau 3 Schuesse (Lampen
  //     erloeschen) -> "429" (harmlos, mehr Schaden) -> Lampen fuellen sich einzeln -> naechste Salve;
  //     Port Scanner: Ports gueltig platziert, feste Reihenfolge, Ping vor jedem Auftauchen, Faecher nach Ziellinie,
  //     "FILTERED", wenn der Spieler auf dem Port steht; Tod/killAll hinterlassen keine Ports ---
  await page.evaluate(() => {
    const g = BOTA.game; g.enterFloor(5); g.setState('play');
    // Production-Raum mit moeglichst vielen Hindernissen (anspruchsvoll fuer die Port-Platzierung)
    const cells = [...g.floor.cells.values()].filter((x) => x.type === 'normal');
    const solid = (r) => { let n = 0; for (let i = 0; i < r.tiles.length; i++) if (r.tiles[i] !== BOTA.TILES.FLOOR) n++; return n; };
    cells.sort((a, b) => solid(b.room) - solid(a.room));
    const c = cells[0];
    c.room.populated = true; c.room.cleared = true; g.teleport(c.room);
    window.__prodRoom = c.room;
  });
  const prodProblems = await page.evaluate(() => {
    const out = [];
    const g = BOTA.game, AI = BOTA.AI, E = BOTA.ENEMIES, DT = 1 / 60, T = BOTA.TILES, TILE = BOTA.C.TILE;
    const PR = BOTA.FLOOR_THEMES.findIndex((t) => t.key === 'production') + 1;
    const ids = ['rate_limiter', 'port_scanner'];
    // 1) Nur auf Production (Etage 1–7; ab Etage 8 duerfen Themen-Gegner spaeter anderswo auftauchen)
    for (let d = 1; d <= 7; d++) {
      const seen = { rate_limiter: 0, port_scanner: 0 };
      for (let i = 0; i < 300; i++) {
        const list = BOTA.rollRoomEnemies(new BOTA.RNG(BOTA.hashString('prod' + d + ':' + i)), d);
        for (const id of ids) seen[id] += list.filter((x) => x === id).length;
        if (list.filter((x) => x === 'port_scanner').length > 1) out.push('Port Scanner: mehr als einer pro Raum');
      }
      for (const id of ids) {
        if (d === PR && !seen[id]) out.push(id + ': taucht auf Production (Etage ' + d + ') nie auf');
        if (d !== PR && seen[id]) out.push(id + ': taucht auf Etage ' + d + ' auf');
      }
    }

    const p = g.player;
    BOTA.debug.god(true);
    const clearRoom = () => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); g.room.enemies = g.room.enemies.filter((en) => !en.dead); g.room.projectiles.length = 0; };
    const stepAll = (n, each) => {
      for (let i = 0; i < n; i++) {
        for (const en of g.room.enemies.slice()) { if (!en.dead) { en.frozen = 0; en.update(DT, g); } }
        g.room.enemies = g.room.enemies.filter((en) => !en.dead);
        if (g.room.projectiles.length > 150) g.room.projectiles.length = 0;
        if (each && each(i) === false) break;
      }
    };
    const events = [];
    const offs = ['enemyWindup', 'enemyThrottle', 'portScan'].map((n) => BOTA.bus.on(n, (e) => events.push(n + ':' + (e.sound || e.kind || ''))));
    const origShootAt = AI.shootAt, origFanAngle = AI.fanAngle;
    try {
      // 2) Rate Limiter (Startraum: freie Sicht)
      BOTA.debug.gotoRoom('start'); clearRoom();
      p.x = 640; p.y = 380;
      const RL = BOTA.debug.spawn('rate_limiter', 260, 200);
      RL.spawnDelay = 0;
      const S = RL.state, P = RL.params;
      const shots = [];
      AI.shootAt = function (game, e, t, speed, opts) {
        const pr = origShootAt.apply(this, arguments);
        if (e === RL) shots.push({ mode: S.mode, tokensAfter: S.tokens - 1, speed, color: opts && opts.color, aimT: aimT });
        return pr;
      };
      let aimT = 0, throttleT = 0, prevMode = S.mode, prevTokens = S.tokens, tokenJump = 0;
      const bursts = [];
      let cur = null, dmgFree = null, dmgThrottled = null, contactInThrottle = 0, refillDuringThrottle = false;
      stepAll(60 * 16, () => {
        if (S.mode === 'aim') aimT += DT;
        if (S.mode === 'throttled') {
          throttleT += DT;
          contactInThrottle = Math.max(contactInThrottle, RL.contactDamage);
          if (S.tokens !== 0) refillDuringThrottle = true;
          if (dmgThrottled === null && throttleT > 0.5) { const h = RL.hp; RL.hurt(2, g, {}); dmgThrottled = h - RL.hp; }
        }
        if (S.mode === 'walk' && dmgFree === null && bursts.length) { const h = RL.hp; RL.hurt(2, g, {}); dmgFree = h - RL.hp; }
        if (S.tokens > prevTokens) tokenJump = Math.max(tokenJump, S.tokens - prevTokens);
        if (prevMode !== 'burst' && S.mode === 'burst') { cur = { shots: shots.length, aim: aimT }; }
        if (prevMode === 'burst' && S.mode === 'throttled') { cur.n = shots.length - cur.shots; bursts.push(cur); throttleT = 0; }
        if (prevMode === 'throttled' && S.mode !== 'throttled') { cur.throttle = throttleT; cur.contactAfter = RL.contactDamage; }
        if (prevMode === 'refill' && S.mode === 'walk') { cur.refilled = S.tokens; aimT = 0; }
        prevMode = S.mode; prevTokens = S.tokens;
      });
      AI.shootAt = origShootAt;
      if (bursts.length < 2) out.push('Rate Limiter: nur ' + bursts.length + ' Salven in 16 s');
      for (const b of bursts) {
        if (b.n !== P.tokens) out.push('Rate Limiter: Salve mit ' + b.n + ' statt ' + P.tokens + ' Schuessen');
        if (b.aim < P.aim - 0.02) out.push('Rate Limiter: Salve nach nur ' + b.aim.toFixed(2) + ' s Telegraph');
        if (b.throttle !== undefined && b.throttle < P.throttle - 0.02) out.push('Rate Limiter: 429-Pause nur ' + b.throttle.toFixed(2) + ' s');
        if (b.contactAfter !== undefined && b.contactAfter !== 1) out.push('Rate Limiter: Kontaktschaden nach der Pause ' + b.contactAfter);
        if (b.refilled !== undefined && b.refilled !== P.tokens) out.push('Rate Limiter: Eimer vor dem Weiterlaufen nicht voll (' + b.refilled + ')');
      }
      if (shots.some((s) => s.mode !== 'burst')) out.push('Rate Limiter: Schuss ausserhalb der Salve');
      if (shots.some((s) => s.speed < 165 || s.speed > 260)) out.push('Rate Limiter: Schussgeschwindigkeit ausserhalb 165–260');
      if (shots.some((s) => s.color !== '#5fe0ff')) out.push('Rate Limiter: Schussfarbe nicht Cyan');
      if (shots.slice(0, P.tokens).map((s) => s.tokensAfter).join(',') !== '2,1,0') out.push('Rate Limiter: Lampen erloeschen nicht je Schuss (' + shots.slice(0, 3).map((s) => s.tokensAfter).join(',') + ')');
      if (contactInThrottle !== 0) out.push('Rate Limiter: in der 429-Pause nicht harmlos');
      if (refillDuringThrottle) out.push('Rate Limiter: fuellt schon waehrend der Pause auf');
      if (tokenJump > 1) out.push('Rate Limiter: Lampen fuellen sich nicht einzeln');
      if (!(P.throttledMult > 1) || dmgThrottled !== 2 * P.throttledMult) out.push('Rate Limiter: in der Pause ' + dmgThrottled + ' statt ' + 2 * P.throttledMult + ' Schaden');
      if (dmgFree !== 2) out.push('Rate Limiter: ausserhalb der Pause ' + dmgFree + ' statt 2 Schaden');
      const throttles = events.filter((x) => x === 'enemyThrottle:').length;
      if (throttles !== bursts.length) out.push('Rate Limiter: ' + throttles + ' 429-Events fuer ' + bursts.length + ' Salven');
      if (events.filter((x) => x === 'enemyWindup:token').length < P.tokens) out.push('Rate Limiter: keine Token-Events beim Auffuellen');
      if (!events.includes('enemyWindup:')) out.push('Rate Limiter: kein Ziel-Telegraph-Event');
      RL.hurt(1e6, g, {});
      stepAll(5);
      if (g.room.enemies.length) out.push('Rate Limiter: Reste nach dem Tod');

      // 3) Port-Platzierung auf vielen echten Production-Raeumen (nie auf Hindernissen, Spawnpunkten, Mitte,
      //    vor Tueren; verschiedene Kacheln mit Mindestabstand; Nummern aufsteigend im Uhrzeigersinn)
      const FRONT = { up: [7, 1], down: [7, BOTA.C.ROWS - 2], left: [1, 4], right: [BOTA.C.COLS - 2, 4] };
      const realRoom = g.room;
      let rooms = 0, full = 0;
      try {
        for (let i = 0; i < 12; i++) {
          const fl = new BOTA.Floor(PR, 'ports' + i);
          for (const cell of fl.cells.values()) {
            if (cell.type !== 'normal') continue;
            const room = cell.room;
            g.room = room;
            const sp = room.spawnPoints[0] || room.tileCenter(7, 4);
            const sc = new BOTA.Enemy(E.port_scanner, 'port_scanner', sp.x, sp.y, g, 1);
            const ports = sc.state.ports, PP = sc.params;
            rooms++;
            if (ports.length === PP.ports) full++;
            if (ports.length < 3) out.push('Port Scanner: nur ' + ports.length + ' Ports in Raum ' + room.layout.id);
            const spawnKeys = new Set(room.spawnPoints.map((q) => Math.floor(q.x / TILE) + ',' + Math.floor(q.y / TILE)));
            const ang = (q) => Math.atan2(q.y - BOTA.C.ROOM_H / 2, q.x - BOTA.C.ROOM_W / 2);
            ports.forEach((pt, k) => {
              const tc = Math.floor(pt.x / TILE), tr = Math.floor(pt.y / TILE);
              if (room.tileAt(tc, tr) !== T.FLOOR) out.push('Port Scanner: Port auf Kacheltyp ' + room.tileAt(tc, tr));
              if (spawnKeys.has(tc + ',' + tr)) out.push('Port Scanner: Port auf einem Spawnpunkt');
              if (tc === 7 && tr === 4) out.push('Port Scanner: Port in der Raummitte');
              for (const dir of Object.keys(room.doors)) {
                const [fc, fr] = FRONT[dir];
                if (Math.abs(fc - tc) <= 1 && Math.abs(fr - tr) <= 1) out.push('Port Scanner: Port vor der Tuer ' + dir);
              }
              for (let j = 0; j < k; j++) if (Math.hypot(pt.x - ports[j].x, pt.y - ports[j].y) < PP.minGap) out.push('Port Scanner: Ports zu dicht');
              if (k && !(pt.state.num > ports[k - 1].state.num)) out.push('Port Scanner: Portnummern nicht aufsteigend');
              if (k && !(ang(pt) >= ang(ports[k - 1]))) out.push('Port Scanner: Ports nicht im Uhrzeigersinn sortiert');
              if (!pt.intangible || pt.contactDamage !== 0 || !pt.ignoreForClear) out.push('Port Scanner: Port ist greifbar/gefaehrlich/zaehlt fuers Clearing');
            });
            room.enemies.length = 0;
          }
        }
      } finally {
        g.room = realRoom;
      }
      if (full < rooms * 0.9) out.push('Port Scanner: nur ' + full + '/' + rooms + ' Raeume mit allen Ports');

      // 4) Ablauf im echten Production-Raum: feste Reihenfolge, Ping vor jedem Auftauchen, Faecher nach Ziellinie
      g.teleport(window.__prodRoom); clearRoom();
      const room = g.room;
      const sp0 = room.spawnPoints[0] || g.nearestFreePos(480, 288);
      const PS = BOTA.debug.spawn('port_scanner', sp0.x, sp0.y);
      PS.spawnDelay = 0;
      const PSS = PS.state, PSP = PS.params, ports = PSS.ports;
      // Spieler auf die freie Kachel, die am weitesten von allen Ports weg ist (kein Filtern im Normalablauf)
      let bestPos = null, bestD = -1;
      for (let r = 1; r < BOTA.C.ROWS - 1; r++) for (let c2 = 1; c2 < BOTA.C.COLS - 1; c2++) {
        if (room.tileAt(c2, r) !== T.FLOOR) continue;
        const q = room.tileCenter(c2, r);
        const m = Math.min(...ports.map((pt) => Math.hypot(pt.x - q.x, pt.y - q.y)));
        if (m > bestD) { bestD = m; bestPos = q; }
      }
      p.x = bestPos.x; p.y = bestPos.y;
      const fans = [];
      let psAim = 0;
      AI.fanAngle = function (game, e, base, n, spr, speed) {
        if (e === PS) fans.push({ n, speed, aim: psAim, color: arguments[6] && arguments[6].color });
        return origFanAngle.apply(this, arguments);
      };
      const ups = [];
      let tellT = 0, prev = PSS.mode, buriedHarmful = false, upIntangible = false, livingWhileBuried = true;
      stepAll(60 * 14, () => {
        if (PSS.mode === 'tell') tellT += DT;
        if (PSS.mode === 'aim') psAim += DT;
        if (PSS.mode === 'travel' || PSS.mode === 'tell') {
          if (!PS.intangible || PS.contactDamage !== 0) buriedHarmful = true;
          if (!room.hasLivingEnemies()) livingWhileBuried = false;
        }
        if ((PSS.mode === 'aim' || PSS.mode === 'linger') && PS.intangible) upIntangible = true;
        if (prev === 'tell' && PSS.mode === 'rise') {
          const port = ports[PSS.idx];
          ups.push({ idx: PSS.idx, tell: tellT, onPort: Math.hypot(PS.x - port.x, PS.y - port.y) < 1 });
          tellT = 0; psAim = 0;
        }
        prev = PSS.mode;
      });
      AI.fanAngle = origFanAngle;
      if (ups.length < 4) out.push('Port Scanner: nur ' + ups.length + ' mal aufgetaucht in 14 s');
      for (let k = 0; k < ups.length; k++) {
        if (!ups[k].onPort) out.push('Port Scanner: taucht nicht genau am Port auf');
        if (ups[k].tell < PSP.tell - 0.02) out.push('Port Scanner: Ping nur ' + ups[k].tell.toFixed(2) + ' s vor dem Auftauchen');
        if (k && ups[k].idx !== (ups[k - 1].idx + 1) % ports.length) out.push('Port Scanner: Reihenfolge ' + ups.map((u) => u.idx).join(','));
      }
      if (fans.length < ups.length - 1) out.push('Port Scanner: ' + fans.length + ' Faecher bei ' + ups.length + ' Auftauchern');
      for (const f of fans) {
        if (f.n !== PSP.fan) out.push('Port Scanner: Faecher mit ' + f.n + ' Schuessen');
        if (f.aim < PSP.aim - 0.02) out.push('Port Scanner: Faecher nach nur ' + f.aim.toFixed(2) + ' s Ziellinie');
        if (f.speed < 165 || f.speed > 260) out.push('Port Scanner: Schussgeschwindigkeit ausserhalb 165–260');
        if (f.color !== '#5fe0ff') out.push('Port Scanner: Schussfarbe nicht Cyan');
      }
      if (buriedHarmful) out.push('Port Scanner: unter dem Boden greifbar oder gefaehrlich');
      if (upIntangible) out.push('Port Scanner: oben nicht verwundbar');
      if (!livingWhileBuried) out.push('Port Scanner: Raum gilt als geraeumt, waehrend er unter dem Boden ist');
      if (!events.includes('enemyWindup:portPing') || !events.includes('portScan:open')) out.push('Port Scanner: Ping-/Auftauch-Events fehlen');

      // 5) "FILTERED": Spieler steht auf dem naechsten Zielport -> uebersprungen, taucht nicht unter ihm auf
      stepAll(600, () => PSS.mode !== 'travel');
      const blockIdx = PSS.idx, blockPort = ports[blockIdx];
      p.x = blockPort.x; p.y = blockPort.y;
      let surfacedOnPlayer = false, filtered = false, nextUp = -1;
      stepAll(60 * 6, () => {
        if (PSS.mode === 'rise') {
          if (PSS.idx === blockIdx) surfacedOnPlayer = true;
          else { nextUp = PSS.idx; return false; }
        }
        if (blockPort.state.filteredT > 0) filtered = true;
      });
      if (surfacedOnPlayer) out.push('Port Scanner: taucht unter dem Spieler auf');
      if (!filtered || !events.includes('portScan:filtered')) out.push('Port Scanner: Port wird nicht als FILTERED markiert');
      const expectNext = (blockIdx + 1) % ports.length;
      if (nextUp !== expectNext) out.push('Port Scanner: nach FILTERED an Port ' + nextUp + ' statt ' + expectNext);

      // 6) Tod: Ports schliessen sich; killAll laesst nichts zurueck; ohne Ports wird er zum Geschuetz
      PS.hurt(1e6, g, {});
      stepAll(60);
      if (g.room.enemies.length) out.push('Port Scanner: ' + g.room.enemies.length + ' Reste nach dem Tod (' + g.room.enemies.map((en) => en.id).join(',') + ')');
      BOTA.debug.spawn('port_scanner', sp0.x, sp0.y);
      BOTA.debug.spawn('rate_limiter', 300, 300);
      BOTA.debug.killAll();
      stepAll(30);
      if (g.room.enemies.length) out.push('killAll: ' + g.room.enemies.map((en) => en.id).join(',') + ' bleiben uebrig');
      const PT = BOTA.debug.spawn('port_scanner', sp0.x, sp0.y);
      PT.spawnDelay = 0;
      for (const pt of PT.state.ports) pt.dead = true;
      let turretShots = 0;
      AI.fanAngle = function (game, e) { if (e === PT) turretShots++; return origFanAngle.apply(this, arguments); };
      stepAll(60 * 4);
      AI.fanAngle = origFanAngle;
      if (!PT.state.turret || PT.intangible || !turretShots) out.push('Port Scanner: ohne Ports kein Geschuetz-Modus');
    } finally {
      AI.shootAt = origShootAt;
      AI.fanAngle = origFanAngle;
      for (const off of offs) off();
      clearRoom();
    }
    return out;
  });
  problems.push(...prodProblems);
  // Optik: beide im Production-Raum, Rate Limiter in der 429-Pause, Port Scanner beim Zielen (Bild pruefen!)
  await page.evaluate(() => {
    const g = BOTA.game;
    const room = g.room;
    const sp = room.spawnPoints[0] || g.nearestFreePos(480, 288);
    const PS = BOTA.debug.spawn('port_scanner', sp.x, sp.y);
    PS.spawnDelay = 0;
    // Port nahe der Raummitte (nicht unter der Minikarte)
    const port = PS.state.ports.slice().sort((a, b) => Math.hypot(a.x - 480, a.y - 288) - Math.hypot(b.x - 480, b.y - 288))[0];
    PS.x = port.x; PS.y = port.y; PS.state.idx = PS.state.ports.indexOf(port);
    PS.state.mode = 'aim'; PS.state.t = 0.2; PS.intangible = false; PS.noShadow = false;
    const q = g.nearestFreePos(480, 288);
    g.player.x = q.x; g.player.y = q.y;
    const RL = BOTA.debug.spawn('rate_limiter', q.x + 150, q.y);
    RL.spawnDelay = 0; RL.state.mode = 'throttled'; RL.state.t = 1.2; RL.state.tokens = 0;
    for (const e of [PS, RL]) e.update = function () {};   // Pose fuer das Bild halten
    g.bannerState = null;                                   // Banner frueherer Bloecke wuerde die Pose verdecken
    g.room.effects.length = 0;
  });
  await page.waitForTimeout(300);
  await shot('15-production');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) BOTA.debug.killAll(); });

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
