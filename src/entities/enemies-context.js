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
  // ===========================================================================
  // Lost in the Middle ('lost_in_the_middle')
  // ===========================================================================
  //
  // Ein verblasster Geist einer Chat-Sprechblase — benannt nach der echten LLM-Schwaeche, das zu vergessen, was in
  // der MITTE eines langen Kontexts steht. Der Raum ist das Kontextfenster, von links (Anfang) nach rechts (Ende):
  //
  //  - Zone ("die Mitte"): das mittlere Drittel der Innenraum-BREITE, ueber die volle Hoehe, also
  //    x in [INNER.x0 + W/3, INNER.x0 + 2W/3] mit W = 832 px -> [341.3, 618.7]. Bewusst nur die Breite und kein
  //    Kasten in der Raummitte: ein Kontext ist eine Folge (Anfang -> Ende), "die Mitte" ist also ein Streifen;
  //    ausserdem ergibt das zwei gerade, leicht lesbare Grenzlinien von Wand zu Wand, waehrend ein zentrales
  //    Drittel-Kaestchen (277 x 149 px) zu klein waere, um es im Kampf zu bemerken. Massgeblich ist der
  //    Mittelpunkt des Gegners (e.x).
  //  - Hysterese: hinein zaehlt erst ZONE.hyst (6 px) innerhalb der Linie, hinaus erst 6 px ausserhalb — auf der
  //    Linie flackert also nichts.
  //  - Am Rand (ausserhalb der Zone) ist er fest: schwebt zum Spieler (flying), Kontakt 1, verwundbar, und feuert
  //    ab und zu nach einem Telegraph (params.tell = 0.6 s: bernsteinfarbenes Gluehen, gestrichelte Faecherlinien,
  //    "!", 'enemyWindup' ohne sound = Familien-Warnton gurgle) einen 3er-Faecher aus korallenroten "Wort"-Schuessen
  //    (params.shotSpeed 195 px/s, mit AI.shotSpeed hoechstens ~224).
  //  - In der Zone ist er fast durchsichtig: e.intangible (Schuesse fliegen durch, hurt() wirkt nicht), kein
  //    Kontaktschaden, keine Angriffe. Die Flags schalten in dem Tick, in dem er die Linie (mit Hysterese)
  //    ueberquert; nur das Einblenden beim Verlassen dauert params.fade (0.3 s) — erst wenn er wieder voll
  //    sichtbar ist, ist er fest (Regel fuer den Spieler: "fest = ganz sichtbar"). Ein laufender Telegraph bricht
  //    ab, wenn er (z. B. durch Rueckstoss) in die Zone geraet — er schiesst nie aus der Mitte.
  //  - Gegen Endlos-Unverwundbarkeit (der Raum muss immer schaffbar sein): Zeit am Stueck in der Zone zaehlt
  //    (state.lostT). Nach params.maxLost (4 s) "erinnert" er sich und treibt hinaus (mode 'surface', surfaceSpeed):
  //    Richtung Spieler, falls der ausserhalb der Zone steht, sonst zur naeheren Grenze. Danach bleibt er
  //    params.hold (2.2 s) mindestens params.keepOut px ausserhalb der Zone (mode 'hold': folgt dem Spieler nur
  //    senkrecht, darf schiessen) und jagt dann wieder (mode 'drift'). Wer in der Mitte campt, bekommt ihn also
  //    spaetestens alle ~5–6 s fest an der Zonengrenze vor die Flinte — und wird beschossen.
  //  - Lesbarkeit: solange einer lebt, liegt ein Boden-Aufkleber im Raum (LostZoneMark in room.pickups; Vertrag
  //    dort: update + draw), der die beiden Zonengrenzen als blasse gepunktete Linien, einen Hauch Nebel im
  //    Streifen und "[...]" oben und unten zeichnet (drawLayer -2: unter allen Figuren). Er blendet aus und
  //    entfernt sich selbst, sobald kein Lost in the Middle mehr im Raum lebt — er ist kein Gegner,
  //    killAll/Clearing beruehren ihn nicht.
  //
  // Zufallswerte (Abklingzeiten) nur ueber game.rng; Math.random wird nicht benutzt (die Optik rechnet mit e.t).
  const TAU_LM = Math.PI * 2;
  const LM_INNER = B.C.INNER;
  const LM_W = LM_INNER.x1 - LM_INNER.x0;
  /** Zonengrenzen (Raumkoordinaten) und Hysterese; fuer Tests ueber B.BEHAVIORS.lost_in_the_middle.ZONE lesbar */
  const LM_ZONE = Object.freeze({ x0: LM_INNER.x0 + LM_W / 3, x1: LM_INNER.x0 + (2 * LM_W) / 3, hyst: 6 });
  const LM_PALE = CTX.pale;
  const LM_OUTLINE = '#0e1420';

  /** Liegt x so weit in der Zone, dass ein fester Geist sich verliert? */
  function lmEnters(x) { return x > LM_ZONE.x0 + LM_ZONE.hyst && x < LM_ZONE.x1 - LM_ZONE.hyst; }
  /** Liegt x so weit ausserhalb, dass ein verlorener Geist wieder auftaucht? */
  function lmLeaves(x) { return x < LM_ZONE.x0 - LM_ZONE.hyst || x > LM_ZONE.x1 + LM_ZONE.hyst; }

  /**
   * Boden-Aufkleber mit den Zonengrenzen. Kein Gegner und kein einsammelbares Pickup: liegt nur in room.pickups,
   * weil dort alles mit update/draw gezeichnet und nach drawLayer unter die Figuren sortiert wird. Einer pro Raum.
   */
  class LostZoneMark {
    constructor() {
      this.x = (LM_ZONE.x0 + LM_ZONE.x1) / 2;
      this.y = LM_INNER.y0;
      this.r = 0;
      this.t = 0;
      this.k = 0;              // Sichtbarkeit 0..1 (blendet in 0.5 s ein bzw. aus)
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -2;     // Bodenmarkierung: unter allem anderen (auch unter Trichtern und Ports)
      this.lostZoneMark = true;
    }
    update(dt, game) {
      this.t += dt;
      const alive = game.room.enemies.some((en) => !en.dead && en.id === 'lost_in_the_middle');
      this.k = B.M.clamp(this.k + (alive ? dt : -dt) * 2, 0, 1);
      if (!alive && this.k <= 0) this.dead = true;   // still verschwinden
    }
    draw(ctx) {
      if (this.k <= 0) return;
      const y0 = LM_INNER.y0 + 6, y1 = LM_INNER.y1 - 6;
      ctx.save();
      // Ein Hauch heller Nebel im Streifen ("hier verschwimmt alles")
      ctx.globalAlpha = 0.05 * this.k;
      ctx.fillStyle = LM_PALE;
      ctx.fillRect(LM_ZONE.x0, y0, LM_ZONE.x1 - LM_ZONE.x0, y1 - y0);
      // Zwei gepunktete Grenzlinien (dunkle Unterlage, damit sie auch im Regen lesbar sind); die Punkte wandern
      // langsam nach unten wie Tropfen an einer Scheibe
      ctx.lineCap = 'round';
      ctx.setLineDash([2, 12]);
      ctx.lineDashOffset = -this.t * 10;
      for (const [col, w, a] of [[LM_OUTLINE, 5, 0.35], [LM_PALE, 2, 0.45]]) {
        ctx.globalAlpha = a * this.k;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(LM_ZONE.x0, y0); ctx.lineTo(LM_ZONE.x0, y1);
        ctx.moveTo(LM_ZONE.x1, y0); ctx.lineTo(LM_ZONE.x1, y1);
        ctx.stroke();
      }
      ctx.restore();
      // Auslassungszeichen oben und unten im Streifen: "[...]" — der vergessene Teil des Kontexts
      if (typeof B.pixelText === 'function') {
        const o = { scale: 2, color: LM_PALE, align: 'center', baseline: 'middle', alpha: 0.3 * this.k, shadow: '' };
        B.pixelText(ctx, '[...]', this.x, LM_INNER.y0 + 18, o);
        B.pixelText(ctx, '[...]', this.x, LM_INNER.y1 - 18, o);
      }
    }
  }

  /** Stellt sicher, dass der aktuelle Raum einen Zonen-Aufkleber hat */
  function lmEnsureMark(game) {
    const room = game && game.room;
    if (!room || !Array.isArray(room.pickups)) return;
    for (const pk of room.pickups) if (pk.lostZoneMark && !pk.dead) return;
    room.pickups.push(new LostZoneMark());
  }

  /** Winkel der Faecher-Schuesse (Mitte = Richtung zum Spieler beim Telegraph-Start, danach fest) */
  function lmFanAngles(e) {
    const s = e.state, P = e.params, out = [];
    for (let i = 0; i < P.fan; i++) out.push(s.aim + (i - (P.fan - 1) / 2) * P.spread);
    return out;
  }

  /** Telegraph starten (nur aus einem festen Zustand aufgerufen) */
  function lmStartTell(e, game) {
    const s = e.state, p = game.player;
    // Aus 'hold' heraus: Rest der Haltezeit merken, damit er nach der Salve weiter draussen bleibt
    s.holdLeft = s.mode === 'hold' ? Math.max(0, s.t) : 0;
    s.mode = 'tell';
    s.t = e.params.tell;
    s.aim = Math.atan2(p.y - e.y, p.x - e.x);
    AI.stop(e);
    B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });   // ohne sound: Familien-Warnton (gurgle)
  }

  /** Abklingzeit herunterzaehlen und ggf. den Telegraph starten (nur wenn fest und mit Sichtlinie bzw. nach 2.5 s) */
  function lmMaybeAttack(e, dt, game) {
    const s = e.state, p = game.player;
    if (!s.solid) return false;
    s.cd -= dt;
    if (s.cd <= 0 && (s.cd < -2.5 || game.room.lineOfSight(e.x, e.y, p.x, p.y))) {
      lmStartTell(e, game);
      return true;
    }
    return false;
  }

  /** Zonen-Status, Flags und Sichtbarkeit nachfuehren (jeden Tick, auch eingefroren und beim Erscheinen) */
  function lmSyncZone(e, dt) {
    const s = e.state, P = e.params;
    if (!s.lost && lmEnters(e.x)) s.lost = true;
    else if (s.lost && lmLeaves(e.x)) s.lost = false;
    if (s.lost) s.vis = Math.max(0, s.vis - dt / P.fade);
    else s.vis = Math.min(1, s.vis + dt / P.fade);
    const solid = !s.lost && s.vis >= 1;
    if (solid && !s.solid) s.solidT = 0;          // gerade wieder fest geworden (fuer den kleinen Ring)
    s.solid = solid;
    s.solidT += dt;
    e.intangible = !solid;
    e.contactDamage = solid ? e.def.contactDamage : 0;
    e.alpha = P.ghostAlpha + (1 - P.ghostAlpha) * s.vis;
  }

  B.BEHAVIORS.lost_in_the_middle = {
    ZONE: LM_ZONE,
    init(e, game) {
      const s = e.state;
      e.noShadow = true;        // eigener, mit der Sichtbarkeit verblassender Schatten in draw()
      s.mode = 'drift';         // drift | tell | surface | hold
      s.lost = e.x >= LM_ZONE.x0 && e.x <= LM_ZONE.x1;
      s.vis = s.lost ? 0 : 1;
      s.solid = !s.lost;
      s.solidT = 99;
      s.lostT = 0;
      s.t = 0;
      s.aim = 0;
      s.side = 1;
      s.holdLeft = 0;
      s.cd = game && game.rng ? game.rng.float(1.0, 1.8) : 1.4;   // nicht sofort beim Betreten feuern
      e.intangible = s.lost;
      e.contactDamage = s.lost ? 0 : e.def.contactDamage;
      e.alpha = s.lost ? e.params.ghostAlpha : 1;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      lmEnsureMark(game);
      s.t -= dt;
      // Anti-Stillstand: Zeit am Stueck in der Zone; zu lange -> hinaustreiben
      if (s.lost) s.lostT += dt; else s.lostT = 0;
      if (s.lost && s.lostT >= P.maxLost && s.mode !== 'surface') {
        s.mode = 'surface';
        const mid = (LM_ZONE.x0 + LM_ZONE.x1) / 2;
        if (p.x < LM_ZONE.x0) s.side = -1;                 // Spieler steht links draussen: dorthin
        else if (p.x > LM_ZONE.x1) s.side = 1;             // ... rechts draussen
        else s.side = e.x < mid ? -1 : 1;                  // Spieler campt in der Mitte: naehere Grenze
      }
      const sway = Math.sin(e.t * 2.3 + e.maxHp) * 0.35;   // leichtes Schlingern (rein aus der Zeit, deterministisch)
      switch (s.mode) {
        case 'drift': {
          const d = AI.dist(e, p);
          const sp = (d < 44 ? 0.4 : 1) * (s.lost ? 1.2 : 1) * e.speed;
          const a = Math.atan2(p.y - e.y, p.x - e.x) + sway;
          e.vx = Math.cos(a) * sp;
          e.vy = Math.sin(a) * sp;
          lmMaybeAttack(e, dt, game);
          break;
        }
        case 'tell':
          AI.stop(e);
          if (!s.solid) {                         // in die Mitte geschubst: vergisst, was es sagen wollte
            s.mode = 'drift';
            s.cd = 0.8;
            s.holdLeft = 0;
            break;
          }
          if (s.t <= 0) {
            const sp = AI.shotSpeed(game, P.shotSpeed);
            for (const a of lmFanAngles(e)) AI.shoot(game, e, a, sp, { color: CTX.shot, sprite: 'shot_lost_word', r: 8 });
            s.cd = AI.cooldown(game, game.rng.float(P.cdMin, P.cdMax));
            if (s.holdLeft > 0) { s.mode = 'hold'; s.t = s.holdLeft; }   // Haltezeit fortsetzen
            else s.mode = 'drift';
            s.holdLeft = 0;
          }
          break;
        case 'surface': {
          // Hinaus ueber die gewaehlte Grenze (waagerecht), senkrecht leicht Richtung Spieler
          const tx = s.side < 0 ? LM_ZONE.x0 - P.keepOut - 20 : LM_ZONE.x1 + P.keepOut + 20;
          e.vx = B.M.clamp((tx - e.x) * 4, -P.surfaceSpeed, P.surfaceSpeed);
          e.vy = B.M.clamp(p.y - e.y, -1, 1) * P.surfaceSpeed * 0.3;
          if (s.solid) { s.mode = 'hold'; s.t = P.hold; }
          break;
        }
        case 'hold': {
          // Bleibt ausserhalb der Zone (mind. keepOut px) und folgt dem Spieler nur senkrecht; darf schiessen
          const edge = s.side < 0 ? LM_ZONE.x0 - P.keepOut : LM_ZONE.x1 + P.keepOut;
          const wantX = s.side < 0 ? Math.min(e.x, edge) : Math.max(e.x, edge);
          e.vx = B.M.clamp((wantX - e.x) * 4, -e.speed, e.speed);
          e.vy = B.M.clamp((p.y - e.y) * 2, -e.speed, e.speed);
          if (lmMaybeAttack(e, dt, game)) break;   // nach der Salve geht es mit dem Rest der Haltezeit weiter
          if (s.t <= 0) s.mode = 'drift';
          break;
        }
      }
    },
    // Jeden Tick (auch waehrend spawnDelay/frozen): im Raum halten, Zone/Flags/Sichtbarkeit nachfuehren
    afterMove(e, dt, game) {
      const c = AI.clampToRoom(e.x, e.y, e.r + 2);
      e.x = c.x; e.y = c.y;
      lmSyncZone(e, dt);
      if (e.spawnDelay > 0) lmEnsureMark(game);
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      const vis = s.vis;
      const bob = Math.sin(e.t * 3.1) * 3;
      // Schatten verblasst mit (in der Mitte nur ein Hauch)
      ctx.save();
      ctx.globalAlpha = 0.06 + 0.22 * vis;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r + 12, e.r * 0.9, e.r * 0.32, 0, 0, TAU_LM);
      ctx.fill();
      ctx.restore();
      if (s.mode === 'tell') {
        const k = 1 - Math.max(0, s.t) / P.tell;
        AI.drawGlow(ctx, e.x, e.y + bob, e.r + 16 + 12 * k, k, CTX.warn);   // groesser als die Blase, sonst verdeckt
        // Gestrichelte Faecherlinien mit dunkler Unterlage (bernstein, nie blau)
        const angs = lmFanAngles(e);
        AI.drawRays(ctx, e.x, e.y + bob, angs, e.r + 6, 40 + 70 * k, 0.5 + 0.3 * k, LM_OUTLINE);
        AI.drawRays(ctx, e.x, e.y + bob, angs, e.r + 6, 40 + 70 * k, 0.45 + 0.5 * k, CTX.warn);
      }
      // Wieder fest geworden: kurzer blasser Ring ("ach ja, das war's")
      if (s.solid && s.solidT < 0.35 && e.t > 0.6) {
        const k = s.solidT / 0.35;
        ctx.save();
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = LM_PALE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, e.r + 4 + 18 * k, 0, TAU_LM);
        ctx.stroke();
        ctx.restore();
      }
      // Koerper: beim Telegraph leicht zitternd, in der Mitte langsam wabernd
      const dx = s.mode === 'tell' ? Math.sin(e.t * 60) * 1.2 : Math.sin(e.t * 1.7) * 3 * (1 - vis);
      AI.drawBody(e, ctx, { dy: bob, dx, flipX: false });
      if (s.mode === 'tell') AI.drawMark(ctx, '!', e.x, e.y - e.r - 14 + bob, e.t, CTX.warn, 22);
      if (vis < 0.5 && typeof B.pixelText === 'function') {
        // Verloren in der Mitte: blasse Auslassungspunkte ueber der Blase
        B.pixelText(ctx, '...', e.x, e.y - e.r - 16 + bob, { scale: 2, color: LM_PALE, align: 'center', baseline: 'middle', alpha: 0.5 * (1 - vis * 2), shadow: '' });
      }
      AI.drawSay(e, ctx);
    },
  };
  // ---- Ende Slot 3 ----

})(window.BOTA);
