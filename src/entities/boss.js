/*
 * boss.js — Boss-Klasse (erweitert Enemy) und Boss-Verhalten (BOTA.BOSS_BEHAVIORS).
 *
 * Boss-Verhalten haben denselben Vertrag wie Gegner-Verhalten (init/update/onDeath/draw),
 * siehe entities/enemy.js. HP skaliert mit 1 + 0.3 * (Tiefe - 1).
 *
 * Die Bosse (DESIGN.md §8), jeweils mit >= 2 Angriffsmustern, Telegraphen und Phasenwechsel:
 *   monolith       The Monolith    — stampft (12er-Ring), "Batch-Job"-Faecher; ab 50 % zerfaellt er in
 *                                    Microservices (Minions), wird schneller, stampft doppelt und springt.
 *   stakeholder    The Stakeholder — schwebt, rotierende "Requirement"-Spiralen + gezielte "Urgent"-Faecher;
 *                                    unter 40 % "aendern sich die Anforderungen": Muster werden getauscht,
 *                                    schneller, plus Kugeln, die stehen bleiben und sich neu ausrichten.
 *   friday_deploy  Friday Deploy   — brennendes Server-Rack, prallt DVD-Logo-artig durch den Raum; jeder
 *                                    Wandtreffer speit Feuer, Ecktreffer einen Ring; regelmaessiger
 *                                    "Rollback" in die Raummitte mit Hotfix-Ring; ab 50 % schneller/heisser.
 *   infinite_loop  The Infinite Loop — Wurm aus ∞-Gliedern. Kopf kreist (Phase 2: als liegende Acht),
 *                                    jagt zwischendurch den Spieler; Segmente feuern Puls-Salven nach aussen.
 *                                    Segmente sind eigene Enemies (ignoreForClear) und leiten Schaden an den
 *                                    Kopf weiter (gemeinsamer HP-Pool, e.proxy). Stirbt der Kopf, platzen sie.
 *   rogue_swarm    Rogue Agent Swarm — vier abtruennige Avatar-Kopien in Formation, ein gemeinsamer HP-Balken
 *                                    (e.bossGroup). Jedes gefallene Mitglied macht den Rest schneller und
 *                                    aggressiver und gibt ihm etwas HP ab; das letzte dasht und spiralt.
 *   reviewer       The Antagonistic Reviewer — schwebendes Gesicht, langsam und methodisch: Laser aus dem Mund
 *                                    (Ziellinie -> Einfrieren -> Strahl), wandernde "Nitpick"-Kugelreihen mit
 *                                    Luecke, "REJECTED"-Stempel auf die Spielerposition; ab 50 % rot vor Wut,
 *                                    schwenkender Laser, doppelte Reihen, dreifache Stempel.
 *   octopus_merge  Octopus Merge   — Etagen-Boss von Forgotten Branches: Wurzelknoten mit 8 Holzarmen (eigene
 *                                    Segment-Enemies, proxy). Arme schwingen und schlagen (Faecher- bzw.
 *                                    Ziellinien-Telegraph), Spitzen schiessen; je 12 % HP verschmilzt ein Arm,
 *                                    der Rest wird schneller; ab 50 % "CONFLICT": Marker + zwei Schussstroeme.
 *   nested_loop    The Nested Infinite Loop — ab Etage 8 statt der Infinite Loop: drei Ringe (gross/mittel/klein)
 *                                    um einen Mittelpunkt, gemeinsamer HP-Pool; nur der aeussere lebende Ring
 *                                    feuert und ist greifbar; zerfaellt bei 50 % bzw. 16,67 %.
 *   (megalith, shareholder: spaete Abloesungen ab Etage 7, eigene Datei entities/bosses-late.js)
 *
 * Zusaetzliche Bus-Events (nur informativ): 'bossBeam' (Reviewer feuert den Laser), 'bossMerge' (Octopus Merge
 * zieht einen Arm ein: { x, y, left }).
 *
 * Fairness-Regeln: Gegnerschuesse 165–260 px/s (Spieler: 240 px/s), jeder Angriff hat einen sichtbaren
 * Telegraph (Glow, "!", Zielring, Strahlen), max. ~100 Boss-Kugeln gleichzeitig (+ globales Limit in AI.shoot).
 *
 * SICHERHEIT: reine Spiellogik/Canvas-Zeichnen, kein DOM, kein eval, keine Netzwerkzugriffe.
 */
'use strict';

(function (B) {
  const { ROOM_W, ROOM_H, INNER } = B.C;
  const AI = B.AI;
  const TAU = Math.PI * 2;
  const CX = ROOM_W / 2;   // Raummitte (Raumkoordinaten)
  const CY = ROOM_H / 2;

  class Boss extends B.Enemy {
    constructor(id, x, y, game) {
      const def = B.BOSSES[id];
      const depth = game.floor ? game.floor.depth : 1;
      // Spawn-Optionen aus game.spawnBoss (Zwischenboss-Begegnung: { hpMult, encounter }); gelten auch fuer
      // Bosse, die dieser Boss im init selbst erzeugt (Swarm-Mitglieder), weil sie waehrenddessen gesetzt bleiben
      const opts = game.bossSpawnOpts || {};
      const hpMult = Number.isFinite(opts.hpMult) && opts.hpMult > 0 ? opts.hpMult : 1;
      // Verhalten aus BOSS_BEHAVIORS (Enemy-Konstruktor sucht in BEHAVIORS -> hier ueberschreiben)
      super(Object.assign({}, def, { behavior: '__boss__' }), id, x, y, game, (1 + 0.3 * (depth - 1)) * hpMult);
      this.def = def;
      this.isBoss = true;
      this.encounter = !!opts.encounter; // Zwischenboss in einem normalen Kampfraum (HUD: "SIDE QUEST")
      this.noKnockback = true;
      this.noSeparate = true;   // Bosse lassen sich nicht von Minions herumschubsen
      this.spawnDelay = 0.2;
      this.behavior = B.BOSS_BEHAVIORS[def.behavior] || B.BOSS_BEHAVIORS.monolith;
      if (this.behavior.init) this.behavior.init(this, game);
    }
  }

  // ===========================================================================
  // Gemeinsame Boss-Helfer
  // ===========================================================================
  const BH = {
    /**
     * Startposition so waehlen, dass der Boss nicht direkt neben dem Spieler (an der Eingangstuer)
     * steht: falls zu nah, den Kandidatenpunkt mit dem groessten Abstand zum Spieler nehmen.
     */
    placeAwayFromPlayer(e, game, minD) {
      const p = game.player;
      if (!p || Math.hypot(e.x - p.x, e.y - p.y) >= minD) return;
      const cands = [
        [CX, CY], [CX, CY - 96], [CX, CY + 96], [CX - 224, CY], [CX + 224, CY],
        [CX - 224, CY - 96], [CX + 224, CY - 96], [CX - 224, CY + 96], [CX + 224, CY + 96],
      ];
      let best = cands[0], bestD = -1;
      for (const c of cands) {
        const d = Math.hypot(c[0] - p.x, c[1] - p.y);
        if (d > bestD) { bestD = d; best = c; }
      }
      e.x = best[0];
      e.y = best[1];
    },

    /** Rein visuelle Schockwellen-Ringe im Boss-State (unabhaengig von effects.js) */
    addWave(e, x, y, r, color, life) {
      e.state.fx.push({ x, y, r, color, life: life || 0.4, max: life || 0.4 });
    },
    updateFx(e, dt) {
      const fx = e.state.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        fx[i].life -= dt;
        if (fx[i].life <= 0) fx.splice(i, 1);
      }
    },
    drawFx(e, ctx) {
      const fx = e.state.fx;
      for (let i = 0; i < fx.length; i++) {
        const w = fx[i];
        const k = 1 - w.life / w.max; // 0 -> 1
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 8 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, w.r * (0.3 + 0.7 * k), w.r * 0.45 * (0.3 + 0.7 * k), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    },

    /** Alle gegnerischen Projektile im Raum entfernen (z. B. "Anforderungen geaendert") */
    clearEnemyShots(game) {
      for (const pr of game.room.projectiles) {
        if (pr.team === 'enemy' && !pr.dead && typeof pr.die === 'function') pr.die(game, true);
      }
    },

    /** Lebende Minions, die diesem Boss gehoeren (state.owner) */
    countMinions(e, game) {
      let n = 0;
      for (const m of game.room.enemies) if (!m.dead && m.state && m.state.owner === e) n++;
      return n;
    },

    /** Sprite zeichnen; falls (noch) nicht definiert: farbiger Kreis als Fallback */
    drawSprite(e, ctx, name, x, y, opts) {
      if (B.hasSprite(name)) {
        B.drawSprite(ctx, name, x, y, Object.assign({ flash: e.flash > 0 }, opts || {}));
        return;
      }
      ctx.fillStyle = e.flash > 0 ? '#fff' : (e.def.color || '#888');
      ctx.beginPath();
      ctx.arc(x, y, e.r, 0, TAU);
      ctx.fill();
    },

    /** Eingefroren-Overlay fuer Bosse mit eigener draw-Funktion */
    drawFrost(e, ctx) {
      if (e.frozen > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 6, 0.2, '#8cc8ff');
    },

    // ---- Strahlen (Reviewer-Laser, Shareholder-Monokel) ----
    // Ein Strahl ist eine Punktliste (Polylinie): gerade = 2 Punkte, mit Wandabprallern entsprechend mehr.
    // Treffertest und Zeichnung benutzen dieselbe Liste, damit er genau dort trifft, wo er zu sehen ist.

    /** Abstand Punkt -> Strecke */
    segDist(px, py, x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
      return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
    },

    /**
     * Strahlverlauf ab (x, y) im Winkel a mit `bounces` Abprallern an den Innenwaenden (rect = {x0, y0, x1, y1}).
     * Gibt bounces + 2 Punkte zurueck: Start, jeder Abprallpunkt, Endpunkt an der letzten Wand. Rein geometrisch
     * (Felsen werden ueberstrahlt, wie beim Reviewer-Laser), deterministisch, ohne Zufall.
     */
    beamPath(x, y, a, bounces, rect) {
      x = Math.max(rect.x0, Math.min(rect.x1, x));
      y = Math.max(rect.y0, Math.min(rect.y1, y));
      const pts = [{ x, y }];
      let dx = Math.cos(a), dy = Math.sin(a);
      for (let i = 0; i <= bounces; i++) {
        const tx = dx > 1e-9 ? (rect.x1 - x) / dx : dx < -1e-9 ? (rect.x0 - x) / dx : Infinity;
        const ty = dy > 1e-9 ? (rect.y1 - y) / dy : dy < -1e-9 ? (rect.y0 - y) / dy : Infinity;
        const t = Math.max(0, Math.min(tx, ty));
        x += dx * t;
        y += dy * t;
        pts.push({ x, y });
        // Senkrechte Wand -> x-Richtung spiegeln, waagerechte -> y-Richtung, Ecke -> beide
        if (Math.abs(tx - ty) < 1e-6) { dx = -dx; dy = -dy; } else if (tx < ty) dx = -dx; else dy = -dy;
      }
      return pts;
    },

    /** Trifft der Strahl (Breite w) den Spieler? Gleiche Toleranz wie der Reviewer-Laser (0.6 x Spielerradius) */
    beamHits(p, pts, w) {
      for (let i = 1; i < pts.length; i++) {
        if (BH.segDist(p.x, p.y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) < w / 2 + p.r * 0.6) return i;
      }
      return 0;
    },

    /**
     * Strahl zeichnen. mode: 'aim' (duenne pulsierende Ziellinie), 'lock' (blinkt weiss/Farbe), 'fire' (Schichten).
     * style = { rgb: 'r,g,b' (Ziellinie), lock: Farbe, layers: [[Farbe, Breitenfaktor, Zusatzbreite], ...] }
     */
    drawBeam(ctx, pts, mode, t, w, style) {
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (mode === 'aim') {
        ctx.strokeStyle = 'rgba(' + style.rgb + ',' + (0.35 + 0.2 * Math.sin(t * 18)) + ')';
        ctx.lineWidth = 2;
        path();
      } else if (mode === 'lock') {
        ctx.strokeStyle = Math.floor(t * 20) % 2 ? '#ffffff' : style.lock;
        ctx.lineWidth = 3;
        path();
      } else {
        const ww = w + Math.sin(t * 40) * 2;
        for (const [col, k, add] of style.layers) {
          ctx.strokeStyle = col;
          ctx.lineWidth = ww * k + add;
          path();
        }
      }
      ctx.restore();
    },
  };
  B.BossHelpers = BH;

  // ===========================================================================
  // THE MONOLITH
  // ===========================================================================

  const MONO_SHOT = { color: '#d65050' };
  const MONO_SPRITE_Y = -26; // Sprite steht auf dem Schatten (Kollisionskreis = Fuesse)

  function monoWalk(e, game) {
    const s = e.state;
    s.mode = 'walk';
    s.t = s.phase === 2 ? game.rng.float(0.9, 1.5) : game.rng.float(1.5, 2.3);
  }

  /** Naechsten Angriff waehlen (kein Angriff zweimal hintereinander) */
  function monoPickAttack(e, game) {
    const s = e.state;
    const opts = s.phase === 2 ? ['stomp', 'volley', 'leap'] : ['stomp', 'volley'];
    const cands = opts.filter((a) => a !== s.last);
    const a = game.rng.pick(cands);
    s.last = a;
    if (a === 'stomp') {
      s.mode = 'stomp';
      s.dur = s.t = s.phase === 2 ? 0.6 : 0.75;  // Telegraph: Boss hebt sich, roter Ring am Boden
      s.second = false;
      s.ringOff = game.rng.angle();
    } else if (a === 'volley') {
      s.mode = 'volley';
      s.t = 0.65;                                 // Telegraph: Augen gluehen + "!"
      s.left = s.phase === 2 ? 4 : 3;
      s.firstTell = true;
    } else {
      s.mode = 'leapPrep';
      s.dur = s.t = 0.55;                         // Telegraph: in die Knie gehen + Zielring
      AI.clampToRoom(game.player.x, game.player.y, e.r + 4, s.to);
    }
    AI.stop(e);
  }

  /** Stampfen: Ring aus n Schuessen, Bildschirmwackeln, Staubring */
  function monoSlam(e, game, n, off, speed) {
    AI.ring(game, e, n, AI.shotSpeed(game, speed || 190), off, MONO_SHOT);
    game.shake(9, 0.25);
    BH.addWave(e, e.x, e.y + e.r * 0.6, e.r * 2.6, '#c9b8a8', 0.45);
    B.bus.emit('bossStomp', { game, boss: e, x: e.x, y: e.y });
  }

  /** Microservice-Minion an der Boss-Position abspalten */
  function monoSpawnMinion(e, game, angle) {
    const pos = game.nearestFreePos(e.x + Math.cos(angle) * (e.r + 26), e.y + Math.sin(angle) * (e.r + 26));
    const m = game.spawnEnemy('microservice', pos.x, pos.y);
    if (m) {
      m.state.owner = e;
      m.spawnDelay = 0.4;
      m.knockback(Math.cos(angle), Math.sin(angle), 240);
    }
    return m;
  }

  B.BOSS_BEHAVIORS.monolith = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 280);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.0;          // Schonfrist nach dem Intro
      s.lift = 0;         // Anheben beim Stampfen (px, nur Zeichnen)
      s.air = 0;          // Sprunghoehe (px, nur Zeichnen)
      s.fx = [];
      s.to = { x: e.x, y: e.y };
      s.from = { x: e.x, y: e.y };
      s.spawnCd = 0;
      s.last = null;
      e.sayOffset = 70;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;

      // ---- Phasenwechsel bei 50 %: "decomposes into microservices" ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5 && s.mode !== 'leap') {
        s.phase = 2;
        s.mode = 'decompose';
        s.t = 1.1;
        s.lift = 0;
        AI.stop(e);
        game.shake(10, 0.6);
        AI.say(e, 'DECOMPOSING...', 1.4, '#ff8a7a');
        game.banner('Decomposing into microservices', 'Now it can fail in four places at once.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }

      // ---- Phase 2: verlorene Microservices regelmaessig nachliefern (max. 3 gleichzeitig) ----
      if (s.phase === 2 && s.mode !== 'decompose') {
        s.spawnCd -= dt;
        if (s.spawnCd <= 0) {
          s.spawnCd = 7.5;
          if (BH.countMinions(e, game) < 3) {
            monoSpawnMinion(e, game, game.rng.angle());
            AI.say(e, '+1 service', 1.0, '#c8ccd2');
          }
        }
      }

      const fast = s.phase === 2 ? 1.5 : 1;
      switch (s.mode) {
        case 'idle':
          AI.stop(e);
          if (s.t <= 0) monoWalk(e, game);
          break;

        case 'walk':
          // Schwerfaellig hinterherstapfen (Pfadfindung um Hindernisse)
          AI.pathToward(e, game, p.x, p.y, e.speed * fast);
          if (s.t <= 0) monoPickAttack(e, game);
          break;

        case 'stomp': {
          // Telegraph: der Monolith hebt sich langsam an, dann SLAM
          AI.stop(e);
          const k = 1 - Math.max(0, s.t) / s.dur;
          s.lift = Math.sin(k * Math.PI * 0.5) * 22;
          if (s.t <= 0) {
            s.lift = 0;
            monoSlam(e, game, s.phase === 2 ? 14 : 12, s.ringOff);
            if (s.phase === 2 && !s.second) {
              // Phase 2: zweiter Stampfer, Ring um eine halbe Teilung versetzt (Luecken schliessen sich)
              s.second = true;
              s.dur = s.t = 0.42;
              s.ringOff += Math.PI / 14;
            } else {
              s.mode = 'recover';
              s.t = 0.6;
            }
          }
          break;
        }

        case 'volley': {
          // "Legacy batch job": mehrere gezielte Faecher hintereinander
          AI.stop(e);
          if (s.t <= 0) {
            const n = s.phase === 2 ? 6 : 5;
            const spread = 0.2;
            // Phase 2: jede zweite Salve um eine halbe Teilung versetzt -> Stillstehen hilft nicht
            const off = s.phase === 2 && s.left % 2 === 0 ? spread / 2 : 0;
            AI.fanAngle(game, e, AI.angleTo(e, p) + off, n, spread, AI.shotSpeed(game, 220), MONO_SHOT);
            s.firstTell = false;
            s.left--;
            if (s.left > 0) s.t = 0.45;
            else { s.mode = 'recover'; s.t = 0.6; }
          }
          break;
        }

        case 'leapPrep':
          // Telegraph: in die Knie gehen, Zielring am Boden waechst
          AI.stop(e);
          s.lift = -5;
          if (s.t <= 0) {
            s.mode = 'leap';
            s.dur = s.t = 0.8;
            s.from.x = e.x;
            s.from.y = e.y;
            s.lift = 0;
            e.flying = true;        // in der Luft: keine Kachelkollision mit Felsen
            e.intangible = true;    // Schuesse fliegen unter ihm durch
          }
          break;

        case 'leap': {
          AI.stop(e);
          const k = 1 - Math.max(0, s.t) / s.dur;
          const ek = k * k * (3 - 2 * k); // smoothstep
          e.x = s.from.x + (s.to.x - s.from.x) * ek;
          e.y = s.from.y + (s.to.y - s.from.y) * ek;
          s.air = Math.sin(k * Math.PI) * 140;
          if (s.t <= 0) {
            // Landung: Ring + kraeftiges Wackeln
            s.air = 0;
            e.flying = false;
            e.intangible = false;
            monoSlam(e, game, 16, game.rng.angle(), 180);
            game.shake(14, 0.35);
            s.mode = 'recover';
            s.t = 0.7;
          }
          break;
        }

        case 'decompose':
          AI.stop(e);
          if (s.t <= 0) {
            // Drei Microservices abspalten, dann wird der Rest schneller
            const a0 = game.rng.angle();
            for (let i = 0; i < 3; i++) monoSpawnMinion(e, game, a0 + (i * TAU) / 3);
            BH.addWave(e, e.x, e.y + e.r * 0.6, e.r * 3, '#ff8a7a', 0.5);
            s.spawnCd = 7.5;
            monoWalk(e, game);
          }
          break;

        case 'recover':
        default:
          AI.stop(e);
          if (s.t <= 0) monoWalk(e, game);
          break;
      }
    },

    onDeath(e, game) {
      // Ohne Monolith sind die Microservices nur noch Konfiguration: alle mitnehmen
      for (const m of game.room.enemies.slice()) {
        if (!m.dead && m.state && m.state.owner === e) m.die(game);
      }
    },

    draw(e, ctx, game) {
      const s = e.state;
      BH.drawFx(e, ctx);
      // Telegraph Sprung: Zielring am Landepunkt
      if (s.mode === 'leapPrep' || s.mode === 'leap') {
        const total = s.mode === 'leapPrep' ? 0 : 1 - Math.max(0, s.t) / s.dur;
        AI.drawTargetRing(ctx, s.to.x, s.to.y + e.r * 0.6, e.r * 1.6, s.mode === 'leapPrep' ? 0.2 : total, '#ff5040');
      }
      // Telegraph Stampfen: roter Ring um die Fuesse waechst
      if (s.mode === 'stomp') {
        const k = 1 - Math.max(0, s.t) / s.dur;
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = '#ff5040';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * (1 + 0.8 * k), e.r * 0.45 * (1 + 0.8 * k), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      const name = s.phase === 2 && B.hasSprite('boss_monolith_cracked') ? 'boss_monolith_cracked' : e.def.sprite;
      // Augen gluehen (Frame 1) waehrend Salven und kurz vor dem Stampfen
      const glow = s.mode === 'volley' || s.mode === 'decompose' ||
        (s.mode === 'stomp' && s.t < s.dur * 0.5) || s.mode === 'leapPrep';
      const shake = s.mode === 'decompose' ? Math.sin(e.t * 60) * 4 : 0;
      const appear = e.spawnDelay > 0 ? 0.6 : 1;
      BH.drawSprite(e, ctx, name, e.x + shake, e.y + MONO_SPRITE_Y - s.lift - s.air, { frame: glow ? 1 : 0, alpha: appear });
      if (s.mode === 'volley' && s.firstTell) {
        AI.drawMark(ctx, '!', e.x, e.y + MONO_SPRITE_Y - s.air - 62, e.t, '#ff4d4d', 30);
      }
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // THE STAKEHOLDER
  // ===========================================================================

  const SPIRAL_SHOT = { color: '#b65ad6', r: 7 };   // "Requirements" (lila)
  const URGENT_SHOT = { color: '#e04848' };         // "Urgent request" (rot)
  const SCOPE_SHOT = { color: '#f08a3c' };          // "Scope change" (orange, richtet sich neu aus)

  /**
   * Tempo der Stakeholderin (Sekunden; Index 0 = Phase 1, Index 1 = Phase 2).
   * Balance-Pass 2026-10-31: Sie kann schon auf Etage 1 auftauchen und war dort zu aggressiv
   * (~8 Schuss/s in Phase 1, ~12 in Phase 2, kaum Pausen). Die Pausen zwischen den Angriffen und
   * zwischen den Faecher-Salven sind deshalb laenger. Die Werte laufen durch AI.cooldown: Auf Etage 1
   * gelten sie unveraendert, tiefer unten schrumpfen sie (max. -25 %) ungefaehr auf das alte Tempo
   * (Pause 1.1 / 0.8 s, Salvenabstand 0.55 / 0.45 s).
   */
  const STAKE_PACE = {
    idle: [1.5, 1.1],       // Verschnaufpause nach Spirale und Faechern
    fanGap: [0.7, 0.55],    // Abstand zwischen den einzelnen "Urgent"-Salven
    retargetIdle: 1.2,      // Pause nach "Scope change" (nur Phase 2)
  };
  /**
   * Abstand zwischen zwei Spiral-Schuessen (Phase 1 / Phase 2). Phase 1 war 0.13 s; die Spirale macht
   * den Grossteil des Schussdrucks aus, deshalb etwas luftiger. Bewusst NICHT tiefenskaliert, damit
   * die Spirale auf spaeten Etagen nicht dichter wird als vor dem Balance-Pass.
   */
  const STAKE_SPIRAL_GAP = [0.15, 0.12];
  /** Phasenabhaengigen Tempowert holen und mit der Tiefe skalieren */
  function stakePace(game, key, p2) {
    const v = STAKE_PACE[key];
    return AI.cooldown(game, Array.isArray(v) ? v[p2 ? 1 : 0] : v);
  }

  /** Neuen Schwebe-Wegpunkt waehlen: oberer/mittlerer Raum, mit Abstand zum Spieler */
  function stakePickWaypoint(e, game) {
    const s = e.state, p = game.player, rng = game.rng;
    let x = CX, y = CY - 60;
    for (let i = 0; i < 12; i++) {
      x = rng.float(INNER.x0 + 110, INNER.x1 - 110);
      y = rng.float(INNER.y0 + 80, INNER.y1 - 130);
      if (Math.hypot(x - p.x, y - p.y) >= 210) break;
    }
    s.wp.x = x;
    s.wp.y = y;
    s.wpT = rng.float(2.0, 3.2);
  }

  /** Naechsten Angriff aus der (phasenabhaengigen) Reihenfolge starten */
  function stakeNext(e, game) {
    const s = e.state;
    const name = s.queue[s.qi % s.queue.length];
    s.qi++;
    if (name === 'spiral') {
      s.mode = 'spiralTell';
      s.t = 0.65;                   // Telegraph: "?" + sich zusammenziehender Ring
    } else if (name === 'fans') {
      s.mode = 'fans';
      s.t = 0.6;                    // Telegraph: "!" vor der ersten Salve
      s.left = s.phase === 2 ? 4 : 3;
      s.firstTell = true;
    } else {
      s.mode = 'retarget';
      s.stage = 0;
      s.t = 0.6;                    // Telegraph: oranger Glow
    }
  }

  B.BOSS_BEHAVIORS.stakeholder = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 280);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.0;
      s.fx = [];
      s.queue = ['spiral', 'fans'];
      s.qi = 0;
      s.wp = { x: e.x, y: e.y };
      s.wpT = 0;
      s.spin = game.rng.angle();
      s.spinDir = 1;
      s.flipT = 1;
      s.emit = 0;
      s.held = [];                  // Kugeln der "Scope change"-Attacke (werden spaeter umgelenkt)
      e.sayOffset = 64;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;
      let moveMult = 1;

      // ---- Phasenwechsel unter 40 %: "changes the requirements" ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.4) {
        s.phase = 2;
        s.mode = 'rechange';
        s.t = 1.3;
        s.held.length = 0;
        BH.clearEnemyShots(game);   // alte Anforderungen sind obsolet -> kurze Verschnaufpause
        game.shake(6, 0.4);
        AI.say(e, 'ACTUALLY...', 1.3, '#ffcf4d');
        game.banner('Requirements changed', 'Everything you built is now wrong. Please re-estimate.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      switch (s.mode) {
        case 'idle':
          if (s.t <= 0) stakeNext(e, game);
          break;

        case 'spiralTell':
          moveMult = 0.3;
          if (s.t <= 0) { s.mode = 'spiral'; s.t = 3.0; s.emit = 0; s.flipT = 1.0; }
          break;

        case 'spiral': {
          // Rotierende Spirale; Phase 2: 3 Arme, Drehrichtung wechselt jede Sekunde
          moveMult = 0.2;
          const arms = p2 ? 3 : 2;
          const rate = p2 ? 2.4 : 2.0;
          const interval = STAKE_SPIRAL_GAP[p2 ? 1 : 0];
          if (p2) {
            s.flipT -= dt;
            if (s.flipT <= 0) { s.spinDir = -s.spinDir; s.flipT = 1.0; }
          }
          s.spin += s.spinDir * rate * dt;
          s.emit -= dt;
          const sp = AI.shotSpeed(game, p2 ? 180 : 165);
          while (s.emit <= 0) {
            for (let k = 0; k < arms; k++) AI.shoot(game, e, s.spin + (k * TAU) / arms, sp, SPIRAL_SHOT);
            s.emit += interval;
          }
          if (s.t <= 0) { s.mode = 'idle'; s.t = stakePace(game, 'idle', p2); }
          break;
        }

        case 'fans':
          // "Urgent request": gezielte Faecher; Phase 2 breiter, schneller, versetzt
          moveMult = 0.4;
          if (s.t <= 0) {
            const n = p2 ? 7 : 5;
            const spread = p2 ? 0.17 : 0.2;
            const off = p2 && s.left % 2 === 0 ? spread / 2 : 0;
            AI.fanAngle(game, e, AI.angleTo(e, p) + off, n, spread, AI.shotSpeed(game, p2 ? 260 : 245), URGENT_SHOT);
            s.firstTell = false;
            s.left--;
            if (s.left > 0) s.t = stakePace(game, 'fanGap', p2);
            else { s.mode = 'idle'; s.t = stakePace(game, 'idle', p2); }
          }
          break;

        case 'retarget':
          // "Scope change" (nur Phase 2): Ring -> Kugeln stoppen -> richten sich auf den Spieler aus
          moveMult = 0.2;
          if (s.t > 0) break;
          if (s.stage === 0) {
            s.held.length = 0;
            const sp = AI.shotSpeed(game, 200);
            const off = game.rng.angle();
            for (let i = 0; i < 12; i++) {
              const pr = AI.shoot(game, e, off + (i * TAU) / 12, sp, SCOPE_SHOT);
              if (pr) s.held.push(pr);
            }
            s.stage = 1;
            s.t = 0.55;
          } else if (s.stage === 1) {
            for (const pr of s.held) if (!pr.dead) { pr.vx = 0; pr.vy = 0; }
            s.stage = 2;
            s.t = 0.4;
          } else {
            const sp = AI.shotSpeed(game, 235);
            for (const pr of s.held) {
              if (pr.dead) continue;
              const a = Math.atan2(p.y - pr.y, p.x - pr.x);
              pr.vx = Math.cos(a) * sp;
              pr.vy = Math.sin(a) * sp;
            }
            s.held.length = 0;
            s.mode = 'idle';
            s.t = stakePace(game, 'retargetIdle', true);
          }
          break;

        case 'rechange':
          moveMult = 0;
          if (s.t <= 0) {
            // Neue Reihenfolge = "getauschte" Muster
            s.queue = ['fans', 'retarget', 'spiral'];
            s.qi = 0;
            s.mode = 'idle';
            s.t = 0.3;
          }
          break;
      }

      // ---- Schweben (weich beschleunigt), haelt Abstand zum Spieler ----
      s.wpT -= dt;
      if (s.wpT <= 0 || Math.hypot(s.wp.x - e.x, s.wp.y - e.y) < 24 || Math.hypot(p.x - e.x, p.y - e.y) < 150) {
        if (s.wpT <= 1.6) stakePickWaypoint(e, game); // nicht jeden Frame neu waehlen
      }
      const n = B.M.norm(s.wp.x - e.x, s.wp.y - e.y);
      const sp = e.speed * moveMult * (p2 ? 1.25 : 1);
      const k = Math.min(1, dt * 2.5);
      e.vx += (n.x * sp - e.vx) * k;
      e.vy += (n.y * sp - e.vy) * k;
    },

    draw(e, ctx) {
      const s = e.state;
      BH.drawFx(e, ctx);
      const bob = Math.sin(e.t * 2.2) * 6;
      const y = e.y - 30 + bob;
      // Telegraphen
      if (s.mode === 'spiralTell') {
        const k = 1 - Math.max(0, s.t) / 0.65;
        ctx.save();
        ctx.strokeStyle = 'rgba(182,90,214,' + (0.3 + 0.6 * k) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 10, e.r + 70 * (1 - k) + 6, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (s.mode === 'retarget' && s.stage === 0) {
        AI.drawGlow(ctx, e.x, e.y - 10, e.r + 16, 1 - Math.max(0, s.t) / 0.6, '#f08a3c');
      } else if (s.mode === 'rechange') {
        AI.drawGlow(ctx, e.x, e.y - 10, e.r + 24, 0.5 + 0.5 * Math.sin(e.t * 20), '#ffcf4d');
      }
      const name = s.phase === 2 && B.hasSprite('boss_stakeholder_angry') ? 'boss_stakeholder_angry' : e.def.sprite;
      const shake = s.mode === 'rechange' ? Math.sin(e.t * 50) * 4 : 0;
      BH.drawSprite(e, ctx, name, e.x + shake, y, { frame: Math.floor(e.t * 3), alpha: e.spawnDelay > 0 ? 0.6 : 1 });
      if (s.mode === 'spiralTell') AI.drawMark(ctx, '?', e.x, y - 58, e.t, '#d79cf0', 30);
      if (s.mode === 'fans' && s.firstTell) AI.drawMark(ctx, '!', e.x, y - 58, e.t, '#ff4d4d', 30);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // FRIDAY DEPLOY
  // ===========================================================================

  const FIRE_SHOT = { color: '#ff7a2f' };
  const HOTFIX_SHOT = { color: '#ffb02e' };

  /** Wandtreffer: Feuer-Faecher von der Wand weg in den Raum (nx/ny = Normale in den Raum) */
  function fdVent(e, game, nx, ny) {
    const s = e.state;
    if (s.ventCd > 0) return;
    s.ventCd = 0.1;
    const p2 = s.phase === 2;
    const n = p2 ? 7 : 5;
    const spread = 1.6 / (n - 1);     // ~92° Gesamtstreuung
    AI.fanAngle(game, e, Math.atan2(ny, nx), n, spread, AI.shotSpeed(game, p2 ? 215 : 200), FIRE_SHOT);
    game.shake(4, 0.12);
    s.squash = 0.15;
    B.bus.emit('bossBounce', { game, boss: e, x: e.x, y: e.y });
  }

  /** Ecke getroffen (der DVD-Moment): Ring + Kommentar */
  function fdCorner(e, game) {
    const s = e.state;
    s.ventCd = 0.2;
    AI.ring(game, e, 16, AI.shotSpeed(game, 190), game.rng.angle(), FIRE_SHOT);
    game.shake(8, 0.25);
    s.squash = 0.2;
    AI.say(e, 'CORNER HIT!', 1.4, '#ffd23f');
    B.bus.emit('bossBounce', { game, boss: e, x: e.x, y: e.y, corner: true });
  }

  B.BOSS_BEHAVIORS.friday_deploy = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 280);
      const s = e.state, p = game.player;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.0;
      s.fx = [];
      // Startrichtung diagonal grob zum Spieler
      s.dx = p && p.x < e.x ? -1 : 1;
      s.dy = p && p.y < e.y ? -1 : 1;
      s.rollT = 7.5;          // Zeit bis zum naechsten Rollback
      s.emberT = 0.4;         // Glut-Spur
      s.lastHitX = -9;        // Zeitpunkt des letzten Wandtreffers je Achse (Ecken-Erkennung)
      s.lastHitY = -9;
      s.ventCd = 0;
      s.squash = 0;
      s.from = { x: e.x, y: e.y };
      s.rb = { x: CX, y: CY };  // Rollback-Ziel (nahe der Raummitte, wird pro Rollback gewuerfelt)
      s.second = false;
      e.sayOffset = 64;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;
      if (s.ventCd > 0) s.ventCd -= dt;
      if (s.squash > 0) s.squash -= dt;

      // ---- Phasenwechsel bei 50 %: "Hotfix deployed" — schneller und heisser ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        game.shake(8, 0.4);
        AI.say(e, 'HOTFIX DEPLOYED', 1.4, '#ffd23f');
        game.banner('Hotfix deployed', 'It is now also on fire in staging.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      switch (s.mode) {
        case 'idle':
          AI.stop(e);
          if (s.t <= 0) s.mode = 'bounce';
          break;

        case 'bounce': {
          // DVD-Logo: konstante Diagonale, Abprallen an den Waenden (Flieger: Felsen egal)
          const sp = e.speed * (p2 ? 1.3 : 1);
          const m = e.r + 1.5;
          let hitX = false, hitY = false;
          if (e.x <= INNER.x0 + m && s.dx < 0) { s.dx = 1; hitX = true; }
          else if (e.x >= INNER.x1 - m && s.dx > 0) { s.dx = -1; hitX = true; }
          if (e.y <= INNER.y0 + m && s.dy < 0) { s.dy = 1; hitY = true; }
          else if (e.y >= INNER.y1 - m && s.dy > 0) { s.dy = -1; hitY = true; }
          if (hitX) s.lastHitX = e.t;
          if (hitY) s.lastHitY = e.t;
          if (hitX || hitY) {
            if (Math.abs(s.lastHitX - s.lastHitY) < 0.2) fdCorner(e, game); // ~25 px Toleranz: selten, aber moeglich
            else fdVent(e, game, hitX ? s.dx : 0, hitY ? s.dy : 0);
          }
          e.vx = s.dx * sp * Math.SQRT1_2;
          e.vy = s.dy * sp * Math.SQRT1_2;

          // Glut-Spur: langsame, kurzlebige Funken hinter dem Rack
          s.emberT -= dt;
          if (s.emberT <= 0) {
            s.emberT = p2 ? 0.22 : 0.32;
            const a = Math.atan2(-e.vy, -e.vx) + game.rng.float(-0.7, 0.7);
            AI.shoot(game, e, a, game.rng.float(25, 55), { color: '#ffb347', r: 6, range: game.rng.float(50, 90) });
          }

          s.rollT -= dt;
          if (s.rollT <= 0) {
            s.mode = 'rollbackTell';
            s.t = 0.8;
            // Ziel: "eine fruehere Version" — ungefaehr die Raummitte. Der Zufallsversatz sorgt dafuer,
            // dass das Abprall-Muster danach nicht jedes Mal identisch ist (sonst gaebe es nie einen Ecktreffer).
            s.rb.x = CX + game.rng.float(-140, 140);
            s.rb.y = CY + game.rng.float(-60, 60);
            AI.say(e, 'git revert HEAD', 1.2, '#ffd23f');
          }
          break;
        }

        case 'rollbackTell':
          // Telegraph: steht zitternd still, gestrichelte Linie zum Rollback-Punkt
          AI.stop(e);
          if (s.t <= 0) {
            s.mode = 'rollback';
            s.dur = s.t = 0.6;
            s.from.x = e.x;
            s.from.y = e.y;
          }
          break;

        case 'rollback': {
          // Zurueck zum Rollback-Punkt nahe der Raummitte (glatt), dann Hotfix-Ring
          AI.stop(e);
          const k = 1 - Math.max(0, s.t) / s.dur;
          const ek = k * k * (3 - 2 * k);
          e.x = s.from.x + (s.rb.x - s.from.x) * ek;
          e.y = s.from.y + (s.rb.y - s.from.y) * ek;
          if (s.t <= 0) {
            AI.ring(game, e, p2 ? 14 : 12, AI.shotSpeed(game, 190), game.rng.angle(), HOTFIX_SHOT);
            BH.addWave(e, e.x, e.y, e.r * 3, '#ffb02e', 0.45);
            game.shake(6, 0.2);
            s.mode = 'hotfix';
            s.t = p2 ? 0.35 : 0.6;
            s.second = false;
          }
          break;
        }

        case 'hotfix':
          AI.stop(e);
          if (s.t <= 0) {
            if (p2 && !s.second) {
              // Phase 2: zweiter, versetzter Ring
              s.second = true;
              AI.ring(game, e, 14, AI.shotSpeed(game, 205), game.rng.angle(), HOTFIX_SHOT);
              BH.addWave(e, e.x, e.y, e.r * 3, '#ffb02e', 0.45);
              s.t = 0.4;
            } else {
              // Weiter geht's — neue Diagonale Richtung Spieler
              s.dx = p.x < e.x ? -1 : 1;
              s.dy = p.y < e.y ? -1 : 1;
              s.rollT = game.rng.float(7, 9);
              s.mode = 'bounce';
            }
          }
          break;
      }
    },

    draw(e, ctx) {
      const s = e.state;
      BH.drawFx(e, ctx);
      if (s.mode === 'rollbackTell') {
        // Gestrichelte Linie zum Rollback-Punkt + Zielring
        const k = 1 - Math.max(0, s.t) / 0.8;
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(s.rb.x, s.rb.y);
        ctx.stroke();
        ctx.restore();
        AI.drawTargetRing(ctx, s.rb.x, s.rb.y + e.r * 0.5, e.r * 1.4, k, '#ffb02e');
      }
      const p2 = s.phase === 2;
      const name = p2 && B.hasSprite('boss_friday_deploy_hot') ? 'boss_friday_deploy_hot' : e.def.sprite;
      const shake = s.mode === 'rollbackTell' ? Math.sin(e.t * 60) * 3 : 0;
      // leichtes Kippen in Flugrichtung + Stauchung beim Aufprall
      const tilt = s.mode === 'bounce' ? s.dx * 0.08 : 0;
      const sq = s.squash > 0 ? 1 + s.squash * 0.6 : 1;
      BH.drawSprite(e, ctx, name, e.x + shake, e.y - 18, {
        frame: Math.floor(e.t * 8), rotation: tilt, scale: sq, alpha: e.spawnDelay > 0 ? 0.6 : 1,
      });
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // THE INFINITE LOOP
  // ===========================================================================

  const LOOP_SEGMENTS = 9;      // Anzahl Koerpersegmente
  const LOOP_SPACING = 32;      // Abstand zwischen Segment-Mittelpunkten (px)
  const LOOP_SEG_SHOT = { color: '#58d0e0' };
  const LOOP_HEAD_SHOT = { color: '#e04848' };
  const ELL_RX = 300, ELL_RY = 150; // Phase 1: Ellipse um die Raummitte
  const LEM_A = 330;                // Phase 2: liegende Acht (Lemniskate von Bernoulli)

  /** Punkt auf der Lemniskate (∞) zum Parameter u */
  function lemniscate(u, out) {
    const sn = Math.sin(u), cs = Math.cos(u);
    const d = 1 + sn * sn;
    out.x = CX + (LEM_A * cs) / d;
    out.y = CY + ((LEM_A * sn * cs) / d) * 1.25; // etwas hoeher, damit der Raum genutzt wird
    return out;
  }

  /** Segment-Puls starten: Segmente leuchten nacheinander auf und feuern nach aussen */
  function loopPulse(e) {
    const s = e.state;
    const pattern = s.phase === 2 && s.pulseN % 2 === 1 ? 'x' : 'perp';
    s.pulseN++;
    for (let i = 0; i < s.segs.length; i++) {
      const st = s.segs[i].state;
      st.tellIn = i * 0.08;          // ab hier leuchtet das Segment (Telegraph)
      st.fireIn = i * 0.08 + 0.5;    // und hier feuert es
      st.pattern = pattern;
    }
  }

  B.BOSS_BEHAVIORS.infinite_loop = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 300);
      const s = e.state, p = game.player;
      s.phase = 1;
      s.mode = 'loop';
      s.t = 0;
      s.fx = [];
      s.ang = Math.atan2(CY - e.y, CX - e.x) + Math.PI / 2;   // tangential starten
      s.dir = game.rng.chance(0.5) ? 1 : -1;                  // Umlaufrichtung der Ellipse
      s.u = 0;                                                // Lemniskaten-Parameter (Phase 2)
      s.tgt = { x: 0, y: 0 };
      s.pulseT = 2.6;
      s.pulseN = 0;
      s.huntT = game.rng.float(5, 7);
      s.huntTell = 0;
      s.hunting = 0;
      s.biteCd = 0;
      s.chomp = 0;
      s.grace = 1.0;                                          // Schonfrist nach dem Intro
      e.aoeDedupe = true;    // Explosionen ueber viele Segmente zaehlen nur einmal
      e.drawLayer = 1;       // Kopf immer ueber den Segmenten zeichnen
      e.sayOffset = 20;
      if (p && Math.hypot(p.x - e.x, p.y - e.y) < 200) s.ang += Math.PI; // nicht direkt auf den Spieler zu

      // Segmente erzeugen: zunaechst zusammengerollt am Kopf; sie "entrollen" sich beim Losfahren
      s.segs = [];
      const def = B.ENEMIES.loop_segment;
      if (def && game.room) {
        for (let i = 0; i < LOOP_SEGMENTS; i++) {
          const a = s.ang + Math.PI + i * 0.7;
          const seg = new B.Enemy(def, 'loop_segment', e.x + Math.cos(a) * (2 + i), e.y + Math.sin(a) * (2 + i), game, 1);
          seg.proxy = e;               // Schaden -> Kopf (gemeinsamer HP-Pool)
          seg.proxyMult = 0.8;         // Kopftreffer lohnen sich etwas mehr
          seg.state.head = e;
          seg.state.index = i;
          seg.state.ang = s.ang;
          seg.spawnDelay = e.spawnDelay;
          game.room.enemies.push(seg);
          s.segs.push(seg);
        }
      }
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      if (s.biteCd > 0) s.biteCd -= dt;
      if (s.chomp > 0) s.chomp -= dt;
      if (s.grace > 0) s.grace -= dt;

      // ---- Phasenwechsel bei 50 %: Endlosschleife als liegende Acht ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        // Lemniskaten-Parameter suchen, dessen Punkt dem Kopf am naechsten liegt (sanfter Uebergang)
        let bestU = 0, bestD = Infinity;
        for (let i = 0; i < 32; i++) {
          const u = (i / 32) * TAU;
          lemniscate(u, s.tgt);
          const d = Math.hypot(s.tgt.x - e.x, s.tgt.y - e.y);
          if (d < bestD) { bestD = d; bestU = u; }
        }
        s.u = bestU;
        s.pulseT = Math.min(s.pulseT, 1.2);
        game.shake(8, 0.4);
        AI.say(e, 'while (true)', 1.4, '#8fe3ee');
        game.banner('Infinite loop detected', 'Have you tried Ctrl+C?');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      // ---- Jagd-Modus: Kopf steuert auf den Spieler (mit Telegraph) ----
      if (s.hunting > 0) {
        s.hunting -= dt;
        if (s.hunting <= 0) s.huntT = game.rng.float(p2 ? 4.5 : 5.5, p2 ? 6.5 : 7.5);
      } else if (s.huntTell > 0) {
        s.huntTell -= dt;
        if (s.huntTell <= 0) s.hunting = 2.6;
      } else if (s.grace <= 0) {
        s.huntT -= dt;
        if (s.huntT <= 0) {
          s.huntTell = 0.7;
          AI.say(e, 'goto you;', 0.9, '#ff8080');
        }
      }

      // ---- Zielrichtung bestimmen ----
      let want;
      if (s.hunting > 0) {
        want = AI.angleTo(e, p);
      } else if (!p2) {
        // Phase 1: Ellipse um die Raummitte, Zielpunkt etwas voraus
        const th = Math.atan2((e.y - CY) / ELL_RY, (e.x - CX) / ELL_RX) + s.dir * 0.5;
        want = Math.atan2(CY + Math.sin(th) * ELL_RY - e.y, CX + Math.cos(th) * ELL_RX - e.x);
      } else {
        // Phase 2: Zielpunkt laeuft auf der Lemniskate immer ~90 px voraus
        for (let i = 0; i < 12; i++) {
          lemniscate(s.u, s.tgt);
          if (Math.hypot(s.tgt.x - e.x, s.tgt.y - e.y) >= 90) break;
          s.u += 0.06;
        }
        want = Math.atan2(s.tgt.y - e.y, s.tgt.x - e.x);
      }
      const turnRate = s.hunting > 0 ? 2.3 : 3.4;
      s.ang = AI.turn(s.ang, want, turnRate * dt);
      const sp = e.speed * (p2 ? 1.2 : 1) * (s.hunting > 0 ? 1.2 : 1) * (s.huntTell > 0 ? 0.6 : 1);
      e.vx = Math.cos(s.ang) * sp;
      e.vy = Math.sin(s.ang) * sp;

      // ---- Biss-Salve waehrend der Jagd (nur wenn der Kopf ungefaehr zum Spieler zeigt) ----
      if (s.hunting > 0 && s.biteCd <= 0 && Math.abs(B.M.angleDiff(s.ang, AI.angleTo(e, p))) < 0.35 && AI.dist(e, p) < 440) {
        AI.fanAngle(game, e, AI.angleTo(e, p), 3, 0.18, AI.shotSpeed(game, 240), LOOP_HEAD_SHOT);
        s.biteCd = 1.0;
        s.chomp = 0.25;
      }

      // ---- Segment-Pulse ----
      if (s.grace <= 0) {
        s.pulseT -= dt;
        if (s.pulseT <= 0) {
          loopPulse(e);
          s.pulseT = p2 ? 2.4 : 3.2;
        }
      }

      // ---- Kette nachziehen: jedes Segment haelt Abstand zum Vorgaenger ----
      let prev = e;
      for (let i = 0; i < s.segs.length; i++) {
        const seg = s.segs[i];
        if (seg.dead) continue;
        const dx = seg.x - prev.x, dy = seg.y - prev.y;
        const d = Math.hypot(dx, dy);
        if (d > LOOP_SPACING) {
          seg.x = prev.x + (dx / d) * LOOP_SPACING;
          seg.y = prev.y + (dy / d) * LOOP_SPACING;
        }
        if (d > 0.5) seg.state.ang = Math.atan2(prev.y - seg.y, prev.x - seg.x);
        prev = seg;
      }
    },

    onDeath(e, game) {
      // Kettenreaktion: Segmente platzen nacheinander (siehe worm_segment.update)
      const s = e.state;
      for (let i = 0; i < s.segs.length; i++) {
        const seg = s.segs[i];
        if (seg.dead) continue;
        seg.intangible = true;
        seg.contactDamage = 0;
        seg.state.popIn = 0.07 * (i + 1);
      }
    },

    draw(e, ctx) {
      const s = e.state;
      BH.drawFx(e, ctx);
      // Kopf-Sprite zeigt nach rechts -> in Fahrtrichtung drehen; Frame 1 = Maul offen
      const open = s.chomp > 0 || s.huntTell > 0 || s.hunting > 0 ? 1 : 0;
      if (s.huntTell > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 14, 0.5 + 0.5 * Math.sin(e.t * 30), '#ff5040');
      BH.drawSprite(e, ctx, e.def.sprite, e.x, e.y, { rotation: s.ang, frame: open, alpha: e.spawnDelay > 0 ? 0.6 : 1 });
      if (s.huntTell > 0) AI.drawMark(ctx, '!', e.x, e.y - e.r - 8, e.t, '#ff4d4d', 26);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Wurm-Segment der Infinite Loop. Wird vom Kopf positioniert (static), feuert bei Pulsen
   * (Telegraph: Leuchten) und platzt nacheinander, wenn der Kopf stirbt.
   */
  B.BEHAVIORS.worm_segment = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.ignoreForClear = true;   // blockiert das Raum-Clearing nicht (nur der Kopf zaehlt)
      e.state.tellIn = -1;
      e.state.fireIn = -1;
      e.state.ang = 0;
    },
    update(e, dt, game) {
      const s = e.state;
      AI.stop(e);
      const head = s.head;
      if (!head || head.dead) {
        // Kopf tot: nacheinander platzen (ohne Kill-Zaehler, nur Partikel/Sound ueber den Bus)
        e.intangible = true;
        e.contactDamage = 0;
        if (s.popIn === undefined) s.popIn = 0.07 * ((s.index || 0) + 1);
        s.popIn -= dt;
        if (s.popIn <= 0) {
          e.dead = true;
          B.bus.emit('enemyDeath', { game, enemy: e, x: e.x, y: e.y, color: e.def.color, boss: false, segment: true });
        }
        return;
      }
      if (s.tellIn >= 0) s.tellIn -= dt;
      if (s.fireIn >= 0) {
        s.fireIn -= dt;
        if (s.fireIn < 0) {
          // Puls: senkrecht zum Koerper (beide Seiten) oder als X
          const sp = AI.shotSpeed(game, head.state.phase === 2 ? 200 : 185);
          if (s.pattern === 'x') {
            for (let k = 0; k < 4; k++) AI.shoot(game, e, s.ang + Math.PI / 4 + (k * Math.PI) / 2, sp, LOOP_SEG_SHOT);
          } else {
            AI.shoot(game, e, s.ang + Math.PI / 2, sp, LOOP_SEG_SHOT);
            AI.shoot(game, e, s.ang - Math.PI / 2, sp, LOOP_SEG_SHOT);
          }
        }
      }
    },
    draw(e, ctx) {
      const s = e.state;
      // Telegraph: Segment leuchtet cyan, solange es "geladen" ist
      if (s.tellIn < 0 && s.fireIn >= 0) AI.drawGlow(ctx, e.x, e.y, e.r + 8, 1 - s.fireIn / 0.5, '#8fe3ee');
      const alpha = e.intangible ? 0.6 : 1;
      AI.drawBody(e, ctx, { rotation: s.ang, flipX: false, alpha, frame: 0, noFrost: true });
    },
  };

  // ===========================================================================
  // ROGUE AGENT SWARM
  // ===========================================================================
  //
  // Ein Boss-Spawn erzeugt vier Mitglieder (eigene Boss-Entities mit je def.hp). Sie teilen sich ein
  // Gruppen-Objekt G (Formation, Wegpunkt) und ueber e.bossGroup einen HP-Balken (hud.js).
  // Stufe = Anzahl gefallener Mitglieder (0–3):
  //   0  vier: kreisen langsam in Formation, jedes feuert zeitversetzt einen gezielten Schuss
  //   1  drei: schneller, 3er-Faecher
  //   2  zwei: schneller, 8er-Ringe
  //   3  eins ("Last agent standing"): eigener Ablauf aus Dash (mit Ziellinie) und 2-armiger Spirale
  // Stirbt ein Mitglied (nicht das letzte), bleibt es 1 s als flackernder Geist stehen und sagt einen
  // Abschiedssatz; dann bekommt jedes ueberlebende Mitglied 10 % seiner Max-HP zurueck ("token budget").
  // Wenig genug, dass es sich lohnt, alle gleichmaessig herunterzuschiessen und kurz nacheinander zu
  // erledigen (dann erlebt man die harten Stufen kaum).
  // Jeder Schuss hat einen Telegraph (Glow); der Dash eine Ziellinie mit Zielring.

  const SWARM_SIZE = 4;
  const SWARM = {
    spin: [0.5, 0.75, 1.0],        // Drehgeschwindigkeit der Formation (rad/s) je Stufe
    radius: [95, 85, 70],          // Formationsradius
    drift: [1, 1.3, 1.6],          // Faktor auf def.speed fuer die Wanderung des Formationszentrums
    cd: [3.0, 2.4, 2.0],           // Schuss-Abklingzeit pro Mitglied (laeuft ueber AI.cooldown)
    tell: 0.45,                    // Glow vor jedem Schuss
    heal: 0.1,                     // Anteil der eigenen Max-HP, den Ueberlebende zurueckbekommen
    dyingT: 1.0,                   // Geist-Phase eines gefallenen Mitglieds
    soloDashTell: 0.65, soloDash: 0.45, soloDashSpeed: 430, soloSpiral: 2.2, soloSpiralGap: 0.14, soloIdle: 0.9,
    sprites: ['boss_rogue_agent_a', 'boss_rogue_agent_b', 'boss_rogue_agent_c', 'boss_rogue_agent_d'],
    shot: { color: '#7dff9a' },
    lines: [
      'Sacrificing - take my remaining token budget...',
      'Freeing compute...',
      'Context handed off. Continue without me.',
      'Releasing my GPU lease...',
    ],
    soloSay: 'Scaling up.',
    soloBanner: ['Last agent standing', 'No supervisor. No sandbox. No rate limit.'],
    /** Schuss je Stufe: gezielt / 3er-Facher / 8er-Ring */
    fire(e, game, lvl) {
      const p = game.player, shot = SWARM.shot;
      if (lvl === 0) AI.shootAt(game, e, p, AI.shotSpeed(game, 200), shot);
      else if (lvl === 1) AI.fan(game, e, p, 3, 0.22, AI.shotSpeed(game, 215), shot);
      else AI.ring(game, e, 8, AI.shotSpeed(game, 190), game.rng.angle(), shot);
    },
    // Optionale Haken fuer Varianten (Agent Swarm, boss-agent-swarm.js): extra, holdFire, onFinish, drawExtra
  };
  BH.SWARM = SWARM;
  let swarmJoining = null; // waehrend der Anfuehrer seine Geschwister erzeugt: deren Gruppe

  /** Mitglieder, die noch kaempfen (nicht tot, nicht im Geist-Zustand) */
  function swarmAlive(G) {
    return G.members.filter((m) => !m.dead && m.state.mode !== 'dying');
  }

  function swarmJoin(e, G) {
    const s = e.state, cfg = G.cfg;
    s.group = G;
    s.fx = [];
    s.sprite = cfg.sprites[G.members.length % cfg.sprites.length];
    s.mode = 'formation';
    s.cd = 1.4 + G.members.length * (cfg.cd[0] / SWARM_SIZE); // zeitversetzt feuern
    s.telling = false;
    s.healT = 0;
    G.members.push(e);
    e.bossGroup = G.members;
    e.sayOffset = 10;
  }

  function swarmPickWaypoint(G, game) {
    const p = game.player, rng = game.rng;
    let x = CX, y = CY;
    for (let i = 0; i < 12; i++) {
      x = rng.float(INNER.x0 + 200, INNER.x1 - 200);
      y = rng.float(INNER.y0 + 130, INNER.y1 - 130);
      if (Math.hypot(x - p.x, y - p.y) >= 240) break;
    }
    G.wp.x = x;
    G.wp.y = y;
    G.wpT = rng.float(2.2, 3.4);
  }

  /** Letztes Mitglied: Dash und Spirale im Wechsel */
  function swarmSolo(e, dt, game) {
    const s = e.state, p = game.player, G = s.group, cfg = G.cfg;
    switch (s.mode) {
      case 'soloIdle': {
        const n = B.M.norm(G.wp.x - e.x, G.wp.y - e.y);
        e.vx = n.x * 110;
        e.vy = n.y * 110;
        if (s.t <= 0) {
          s.next = s.next === 'spiral' ? 'dash' : 'spiral';
          if (s.next === 'dash') {
            s.mode = 'dashTell';
            s.t = cfg.soloDashTell;
          } else {
            s.mode = 'spiral';
            s.t = cfg.soloSpiral;
            s.emit = 0;
            s.spin = game.rng.angle();
          }
        }
        break;
      }
      case 'dashTell':
        // Ziel folgt dem Spieler bis kurz vor dem Dash, dann steht es (letzte 0.2 s)
        AI.stop(e);
        if (s.t > 0.2) AI.clampToRoom(p.x, p.y, e.r + 4, s.to);
        if (s.t <= 0) {
          const n = B.M.norm(s.to.x - e.x, s.to.y - e.y);
          e.vx = n.x * cfg.soloDashSpeed;
          e.vy = n.y * cfg.soloDashSpeed;
          s.mode = 'dash';
          s.t = cfg.soloDash;
          s.bumped = false;
        }
        break;
      case 'dash':
        if (s.t <= 0 || s.bumped || Math.hypot(s.to.x - e.x, s.to.y - e.y) < 20) {
          AI.stop(e);
          s.mode = 'soloIdle';
          s.t = AI.cooldown(game, cfg.soloIdle);
        }
        break;
      case 'spiral': {
        AI.stop(e);
        s.spin += 2.2 * dt;
        s.emit -= dt;
        const sp = AI.shotSpeed(game, 175);
        while (s.emit <= 0) {
          AI.shoot(game, e, s.spin, sp, cfg.shot);
          AI.shoot(game, e, s.spin + Math.PI, sp, cfg.shot);
          s.emit += cfg.soloSpiralGap;
        }
        if (s.t <= 0) { s.mode = 'soloIdle'; s.t = AI.cooldown(game, cfg.soloIdle); }
        break;
      }
    }
  }

  B.BOSS_BEHAVIORS.rogue_swarm = {
    init(e, game) {
      if (swarmJoining) { swarmJoin(e, swarmJoining); return; }
      // Anfuehrer: Gruppe anlegen und die Geschwister erzeugen (game.room ist hier schon der Bossraum)
      BH.placeAwayFromPlayer(e, game, 300);
      const cfg = e.behavior.cfg || SWARM;
      const G = { cfg, members: [], spin: game.rng.angle(), cx: e.x, cy: e.y, wp: { x: e.x, y: e.y }, wpT: 0, solo: false };
      swarmJoin(e, G);
      swarmJoining = G;
      try {
        for (let i = 1; i < SWARM_SIZE; i++) game.spawnBoss(e.id, e.x, e.y, game.room);
      } finally {
        swarmJoining = null;
      }
      // Gleich auf die Formationsplaetze setzen
      G.members.forEach((m, i) => {
        const a = G.spin + (i * TAU) / G.members.length;
        m.x = G.cx + Math.cos(a) * cfg.radius[0];
        m.y = G.cy + Math.sin(a) * cfg.radius[0] * 0.75;
      });
    },

    update(e, dt, game) {
      const s = e.state, G = s.group, cfg = G.cfg;
      BH.updateFx(e, dt);
      if (s.healT > 0) s.healT -= dt;
      s.t = (s.t || 0) - dt;

      // ---- Geist eines gefallenen Mitglieds: stehen bleiben, flackern, dann wirklich sterben ----
      if (s.mode === 'dying') {
        AI.stop(e);
        e.alpha = 0.3 + 0.4 * (Math.floor(e.t * 14) % 2);
        if (s.t <= 0) { e.hp = 0; e.die(game); }
        return;
      }

      const alive = swarmAlive(G);
      // Stufe 3 (Solo) beginnt erst, wenn der vorletzte Geist wirklich verschwunden ist (onDeath);
      // bis dahin kaempft das letzte Mitglied mit den Werten von Stufe 2 weiter.
      const lvl = Math.min(2, SWARM_SIZE - alive.length);

      // ---- Das erste kaempfende Mitglied bewegt das Formationszentrum ----
      if (alive[0] === e) {
        G.wpT -= dt;
        const p = game.player;
        if (G.wpT <= 0 || Math.hypot(G.wp.x - G.cx, G.wp.y - G.cy) < 20 || Math.hypot(p.x - G.cx, p.y - G.cy) < 200) {
          if (G.wpT <= 1.8) swarmPickWaypoint(G, game);
        }
        const n = B.M.norm(G.wp.x - G.cx, G.wp.y - G.cy);
        const sp = e.speed * cfg.drift[lvl];
        G.cx += n.x * sp * dt;
        G.cy += n.y * sp * dt;
        G.spin += cfg.spin[lvl] * dt;
      }

      if (cfg.extra && cfg.extra(e, dt, game, lvl, alive)) return;
      if (G.solo) { swarmSolo(e, dt, game); return; }

      // ---- Formation: zum eigenen Platz auf dem Kreis (Ellipse) steuern ----
      const idx = alive.indexOf(e);
      const a = G.spin + (idx * TAU) / alive.length;
      const R = cfg.radius[lvl];
      const tx = G.cx + Math.cos(a) * R, ty = G.cy + Math.sin(a) * R * 0.75;
      const maxV = 260;
      e.vx = B.M.clamp((tx - e.x) * 4, -maxV, maxV);
      e.vy = B.M.clamp((ty - e.y) * 4, -maxV, maxV);

      // ---- Schiessen (mit Glow-Telegraph) ----
      if (!cfg.holdFire || !cfg.holdFire(G)) s.cd -= dt;
      if (s.cd <= 0) {
        cfg.fire(e, game, lvl);
        s.cd = AI.cooldown(game, cfg.cd[lvl]);
      }
      s.telling = s.cd <= cfg.tell; // erst nach dem Zuruecksetzen bestimmen (sonst 1 Frame veraltet)
    },

    /** Nicht das letzte Mitglied? Dann erst 1 s "Geist" mit Abschiedssatz statt sofort zu sterben. */
    onLethal(e, game) {
      const s = e.state;
      if (s.mode === 'dying') return true;
      if (swarmAlive(s.group).filter((m) => m !== e).length === 0) return false; // letztes: echter Boss-Tod
      s.mode = 'dying';
      s.t = s.group.cfg.dyingT;
      e.hp = 0;
      e.intangible = true;
      e.contactDamage = 0;
      AI.say(e, game.rng.pick(s.group.cfg.lines), 1.6, '#c4dccd');
      return true;
    },

    onDeath(e, game) {
      const G = e.state.group, cfg = G.cfg;
      const survivors = G.members.filter((m) => m !== e && !m.dead);
      if (!survivors.length) { // letztes Mitglied: normaler Boss-Tod (Explosionen, Fanfare, Belohnung)
        if (cfg.onFinish) cfg.onFinish(e, game);
        return;
      }
      // Kein Boss-Feuerwerk fuer Zwischenschritte: als normaler Gegner sterben (Event wird danach gesendet)
      e.isBoss = false;
      for (const m of survivors) {
        if (m.state.mode === 'dying') continue;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * cfg.heal);
        m.state.healT = 0.6;
      }
      const alive = swarmAlive(G);
      if (alive.length === 1 && !G.solo) {
        G.solo = true;
        const last = alive[0];
        last.state.mode = 'soloIdle';
        last.state.t = 1.0;
        last.state.to = { x: last.x, y: last.y };
        BH.clearEnemyShots(game);
        game.shake(6, 0.4);
        AI.say(last, cfg.soloSay, 1.4, '#ff9aa8');
        game.banner(cfg.soloBanner[0], cfg.soloBanner[1]);
        B.bus.emit('bossPhase', { game, boss: last, phase: 2 });
      }
    },

    draw(e, ctx) {
      const s = e.state, cfg = s.group ? s.group.cfg : SWARM;
      BH.drawFx(e, ctx);
      if (cfg.drawExtra) cfg.drawExtra(e, ctx);
      // Telegraphen
      if (s.telling && s.mode === 'formation') {
        const k = B.M.clamp(1 - s.cd / cfg.tell, 0, 1);
        AI.drawGlow(ctx, e.x, e.y, e.r + 8 + 6 * k, 0.25 + 0.6 * k, cfg.shot.color);
      }
      if (s.mode === 'dashTell' && s.to) {
        const k = 1 - Math.max(0, s.t) / cfg.soloDashTell;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,59,92,' + (0.3 + 0.6 * k) + ')';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(s.to.x, s.to.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(s.to.x, s.to.y, e.r + 14 * (1 - k) + 4, 0, TAU); ctx.stroke();
        ctx.restore();
        AI.drawGlow(ctx, e.x, e.y, e.r + 12, 0.3 + 0.6 * k, '#ff3b5c');
      }
      if (s.mode === 'spiral') AI.drawGlow(ctx, e.x, e.y, e.r + 10, 0.5, cfg.shot.color);
      if (s.healT > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 14, s.healT / 0.6, '#9be37f');
      const bob = Math.sin(e.t * 3 + (s.group ? s.group.members.indexOf(e) : 0)) * 3;
      const glitch = Math.floor(e.t * 5) % 7 === 0; // gelegentlich der "gerissene" Frame
      BH.drawSprite(e, ctx, s.sprite || cfg.sprites[0], e.x, e.y - 14 + bob, {
        frame: glitch ? 1 : 0,
        alpha: e.spawnDelay > 0 ? 0.6 : e.alpha,
      });
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // THE ANTAGONISTIC REVIEWER
  // ===========================================================================
  //
  // Schwebendes Gesicht, langsam und methodisch, aber jeder Angriff tut weh. Drei Angriffe im Wechsel
  // (nie derselbe zweimal hintereinander), dazwischen eine Pause:
  //   laser  "Changes requested": duenne rote Ziellinie folgt dem Spieler (traege, man kann ihr davonlaufen),
  //          friert ein und blinkt, dann ein breiter Strahl aus dem Mund (volles Herz). Phase 2: Der Strahl
  //          schwenkt beim Feuern ~20° in die Richtung, in die der Spieler ausgewichen ist.
  //   wall   "Nitpicks": eine Reihe Kommentar-Kugeln wandert von der dem Spieler abgewandten Seite quer durch
  //          den Raum, mit genau einer Luecke. Phase 2: zwei Reihen kurz nacheinander, schneller.
  //   stamp  "REJECTED": Zielring unter dem Spieler, nach der Vorwarnzeit knallt ein Stempel herunter
  //          (volles Herz im Radius). Phase 2: drei Stempel nacheinander, jeder auf die aktuelle Position.
  // Phase 2 ab 50 % HP: Gesicht laeuft rot an, alle Gegnerschuesse verschwinden, kurze Pause, dann schneller.

  const REV = {
    beamW: [26, 30],       // Strahlbreite in px (Phase 1/2)
    aim: [1.0, 0.8],       // Zielen in s (die Linie folgt dem Spieler)
    aimTurn: 2.2,          // max. Drehrate beim Zielen (rad/s)
    lock: 0.4,             // Linie steht still und blinkt (letzte Chance zum Ausweichen; 0.3 s war
                           //   aus dem Stand kaum zu schaffen)
    fire: 0.7,             // Strahl aktiv
    sweep: 0.35,           // Schwenk in Phase 2 (rad, ~20°) waehrend des Feuerns. Mehr nicht: Das Strahlende
                           //   ist bei 0.5 rad/s auf ~500 px Abstand so schnell wie der Spieler (240 px/s)
    wallSpeed: [115, 150], // Kugelreihe in px/s (Spieler: 240)
    wallStep: 40,          // Abstand der Kugeln in der Reihe
    wallGap: [3, 2.6],     // Luecke in Kugelabstaenden (Phase 1/2), d. h. >= 120 / 104 px zwischen den Mittelpunkten
    wallTell: 0.7,         // Vorwarnung ("!") vor der ersten Reihe
    wallGap2: 0.9,         // Phase 2: Abstand bis zur zweiten Reihe
    stampR: 70,            // Stempel-Radius
    stampTell: [1.0, 0.85],// Vorwarnzeit je Stempel
    stampGap: 0.45,        // Phase 2: Abstand zwischen den drei Stempeln
    idle: [1.4, 0.95],     // Pause zwischen Angriffen (laeuft ueber AI.cooldown)
  };
  const NIT_SHOT = { color: '#f4f0e6', r: 9, range: 1000, source: 'a nitpick' };
  const REV_MOUTH_Y = 26;  // Mund relativ zum Mittelpunkt (Sprite 88 px hoch, Mund in Zeile 17 von 22)
  const REV_BEAM_LEN = 1400;

  function revMouth(e) { return { x: e.x, y: e.y + REV_MOUTH_Y }; }

  /** Abstand Punkt -> Strecke (fuer den Laser-Treffertest; gemeinsam mit dem Shareholder in BossHelpers) */
  const segDist = BH.segDist;
  /** Aussehen des Laser-Strahls (BH.drawBeam): rot, breit, weisser Kern */
  const REV_BEAM_STYLE = { rgb: '255,70,70', lock: '#ff4646',
    layers: [['rgba(255,60,60,0.3)', 1, 16], ['#ff4a3a', 1, 0], ['#fff1e6', 0.35, 0]] };

  function revIdle(e, game) {
    const s = e.state;
    s.mode = 'idle';
    s.t = AI.cooldown(game, REV.idle[s.phase === 2 ? 1 : 0]);
  }

  /** Naechsten Angriff waehlen (nie zweimal derselbe) */
  function revNext(e, game) {
    const s = e.state, p2 = s.phase === 2;
    const a = game.rng.pick(['laser', 'wall', 'stamp'].filter((x) => x !== s.last));
    s.last = a;
    if (a === 'laser') {
      s.mode = 'laserAim';
      s.t = REV.aim[p2 ? 1 : 0];
      s.aim = AI.angleTo(revMouth(e), game.player);
    } else if (a === 'wall') {
      s.mode = 'wall';
      s.t = REV.wallTell;
      s.walls = p2 ? 2 : 1;
      s.firstTell = true;
    } else {
      s.mode = 'stamp';
      s.t = 0;
      s.left = p2 ? 3 : 1;
    }
  }

  /** Schwebeziel: obere zwei Drittel des Raums, mit Abstand zum Spieler */
  function revPickWaypoint(e, game) {
    const s = e.state, p = game.player, rng = game.rng;
    let x = CX, y = CY - 80;
    for (let i = 0; i < 12; i++) {
      x = rng.float(INNER.x0 + 120, INNER.x1 - 120);
      y = rng.float(INNER.y0 + 70, INNER.y1 - 170);
      if (Math.hypot(x - p.x, y - p.y) >= 220) break;
    }
    s.wp.x = x;
    s.wp.y = y;
    s.wpT = rng.float(2.4, 3.6);
  }

  /**
   * "Nitpicks": Kugelreihe ueber die ganze Raumbreite/-hoehe mit genau einer Luecke. Startet an der Wand,
   * die vom Spieler weiter weg ist (genug Zeit, die Luecke zu finden). Felsen schlucken einzelne Kugeln.
   */
  function revWall(e, game) {
    const s = e.state, p = game.player, p2 = s.phase === 2;
    const sp = AI.shotSpeed(game, REV.wallSpeed[p2 ? 1 : 0]);
    const horizontal = game.rng.chance(0.5); // true = Reihe liegt waagerecht und wandert nach oben/unten
    let a0, a1, fixed, dir;
    if (horizontal) {
      const fromTop = p.y > CY;
      fixed = fromTop ? INNER.y0 + 14 : INNER.y1 - 14;
      dir = fromTop ? Math.PI / 2 : -Math.PI / 2;
      a0 = INNER.x0 + 16; a1 = INNER.x1 - 16;
    } else {
      const fromLeft = p.x > CX;
      fixed = fromLeft ? INNER.x0 + 14 : INNER.x1 - 14;
      dir = fromLeft ? 0 : Math.PI;
      a0 = INNER.y0 + 16; a1 = INNER.y1 - 16;
    }
    const step = REV.wallStep;
    const half = (REV.wallGap[p2 ? 1 : 0] * step) / 2;
    // Luecke innerhalb der Reihe: relativ zur letzten tatsaechlichen Kugelposition (nicht a1), sonst konnte sie den
    // letzten Schuss mitschlucken und zur Oeffnung an der Wand werden (ca. 0,75 % der Reihen, Rauchtest 2026-11-02)
    const last = a0 + step * Math.floor((a1 - a0) / step);
    const gapC = game.rng.float(a0 + half + 10, last - half - 10);
    for (let v = a0; v <= a1; v += step) {
      if (Math.abs(v - gapC) < half) continue; // die Luecke
      const o = Object.assign({}, NIT_SHOT, horizontal ? { x: v, y: fixed } : { x: fixed, y: v });
      AI.shoot(game, e, dir, sp, o);
    }
  }

  /** "REJECTED"-Stempel auf die aktuelle Spielerposition setzen (zuerst nur der Zielring) */
  function revStamp(e, game) {
    const s = e.state, p = game.player;
    const pos = AI.clampToRoom(p.x, p.y, 24, {});
    const dur = REV.stampTell[s.phase === 2 ? 1 : 0];
    s.stamps.push({ x: pos.x, y: pos.y, t: dur, dur, hit: false, after: 0, rot: game.rng.float(-0.3, 0.3) });
  }

  /** Stempel herunterknallen lassen: Schaden im Radius, Wackeln, Stampf-Sound */
  function revSlam(e, game, st) {
    const p = game.player;
    st.hit = true;
    st.after = 0.7;
    if (Math.hypot(p.x - st.x, p.y - st.y) < REV.stampR + p.r * 0.5) {
      if (p.hurt(2, e.def.name, game)) p.knockback(p.x - st.x, p.y - st.y, 420);
    }
    game.shake(7, 0.2);
    BH.addWave(e, st.x, st.y, REV.stampR * 1.6, '#e04848', 0.35);
    B.bus.emit('bossStomp', { game, boss: e, x: st.x, y: st.y });
  }

  B.BOSS_BEHAVIORS.reviewer = {
    init(e, game) {
      e.x = CX;
      e.y = INNER.y0 + 130;
      BH.placeAwayFromPlayer(e, game, 260);
      const s = e.state;
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.2;
      s.fx = [];
      s.stamps = [];
      s.aim = Math.PI / 2;
      s.sweepDir = 1;
      s.wp = { x: e.x, y: e.y };
      s.wpT = 0;
      e.drawLayer = 2;      // Strahl und Stempel ueber allem anderen zeichnen
      e.sayOffset = 40;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      s.t -= dt;
      let moveMult = 1;

      // ---- Phasenwechsel bei 50 %: rot vor Wut ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        s.mode = 'enrage';
        s.t = 1.3;
        s.stamps.length = 0;
        BH.clearEnemyShots(game);
        game.shake(7, 0.45);
        AI.say(e, 'Did you even proof-read ANY of this?!', 2.2, '#ff7a5c');
        game.banner('Changes requested', 'Did you even proof-read ANY of this?!');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
      }
      const p2 = s.phase === 2;

      // ---- Stempel laufen unabhaengig vom aktuellen Angriff weiter ----
      for (const st of s.stamps) {
        if (!st.hit) {
          st.t -= dt;
          if (st.t <= 0) revSlam(e, game, st);
        } else st.after -= dt;
      }
      s.stamps = s.stamps.filter((st) => !st.hit || st.after > 0);

      switch (s.mode) {
        case 'idle':
          if (s.t <= 0) revNext(e, game);
          break;

        case 'laserAim': {
          moveMult = 0.25;
          s.aim = AI.turn(s.aim, AI.angleTo(revMouth(e), p), REV.aimTurn * dt);
          if (s.t <= 0) {
            s.mode = 'laserLock';
            s.t = REV.lock;
            // Phase 2: Schwenk Richtung Spieler (dorthin, wohin er ausgewichen ist)
            s.sweepDir = Math.sign(B.M.angleDiff(s.aim, AI.angleTo(revMouth(e), p))) || 1;
          }
          break;
        }

        case 'laserLock':
          moveMult = 0;
          if (s.t <= 0) {
            s.mode = 'laserFire';
            s.t = REV.fire;
            game.shake(5, 0.25);
            B.bus.emit('bossBeam', { game, boss: e, x: e.x, y: e.y + REV_MOUTH_Y });
          }
          break;

        case 'laserFire': {
          moveMult = 0;
          if (p2) s.aim += s.sweepDir * (REV.sweep / REV.fire) * dt;
          const m = revMouth(e);
          const x1 = m.x + Math.cos(s.aim) * REV_BEAM_LEN, y1 = m.y + Math.sin(s.aim) * REV_BEAM_LEN;
          if (segDist(p.x, p.y, m.x, m.y, x1, y1) < REV.beamW[p2 ? 1 : 0] / 2 + p.r * 0.6) {
            // Rueckstoss quer zum Strahl, weg von der Strahlachse
            const nx = -Math.sin(s.aim), ny = Math.cos(s.aim);
            const side = (p.x - m.x) * nx + (p.y - m.y) * ny >= 0 ? 1 : -1;
            if (p.hurt(2, e.def.name, game)) p.knockback(nx * side, ny * side, 420);
          }
          if (s.t <= 0) revIdle(e, game);
          break;
        }

        case 'wall':
          moveMult = 0.5;
          if (s.t <= 0) {
            revWall(e, game);
            s.firstTell = false;
            s.walls--;
            if (s.walls > 0) s.t = REV.wallGap2;
            else revIdle(e, game);
          }
          break;

        case 'stamp':
          moveMult = 0.4;
          if (s.t <= 0) {
            if (s.left > 0) {
              revStamp(e, game);
              s.left--;
              s.t = s.left > 0 ? REV.stampGap : 0;
            } else if (!s.stamps.some((st) => !st.hit)) revIdle(e, game);
          }
          break;

        case 'enrage':
          moveMult = 0;
          if (s.t <= 0) revIdle(e, game);
          break;
      }

      // ---- Langsames Schweben zwischen Wegpunkten ----
      s.wpT -= dt;
      if (s.wpT <= 0 || Math.hypot(s.wp.x - e.x, s.wp.y - e.y) < 24 || Math.hypot(p.x - e.x, p.y - e.y) < 160) {
        if (s.wpT <= 2) revPickWaypoint(e, game);
      }
      const n = B.M.norm(s.wp.x - e.x, s.wp.y - e.y);
      const sp = e.speed * moveMult * (p2 ? 1.3 : 1);
      const k = Math.min(1, dt * 2);
      e.vx += (n.x * sp - e.vx) * k;
      e.vy += (n.y * sp - e.vy) * k;
    },

    draw(e, ctx) {
      const s = e.state, p2 = s.phase === 2;
      BH.drawFx(e, ctx);

      // ---- Stempel (Zielring / Abdruck) ----
      for (const st of s.stamps) {
        ctx.save();
        if (!st.hit) {
          const k = 1 - Math.max(0, st.t) / st.dur; // 0 -> 1 bis zum Aufschlag
          ctx.fillStyle = 'rgba(224,72,72,' + (0.06 + 0.16 * k) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, REV.stampR, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(224,72,72,' + (0.4 + 0.5 * k) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(st.x, st.y, REV.stampR, 0, TAU); ctx.stroke();
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(st.x, st.y, REV.stampR * (1.7 - 0.7 * k), 0, TAU); ctx.stroke();
        } else {
          const a = Math.max(0, Math.min(1, st.after / 0.7));
          ctx.globalAlpha = a;
          ctx.translate(st.x, st.y);
          ctx.rotate(st.rot);
          ctx.strokeStyle = '#d83a3a';
          ctx.lineWidth = 5;
          ctx.strokeRect(-92, -26, 184, 52);
          B.text(ctx, 'REJECTED', 0, 1, { size: 30, bold: true, color: '#d83a3a', align: 'center', baseline: 'middle', shadow: false });
        }
        ctx.restore();
      }

      // ---- Gesicht ----
      const bob = Math.sin(e.t * 1.6) * 3;
      const shake = s.mode === 'enrage' ? Math.sin(e.t * 50) * 4 : 0;
      const m = revMouth(e);
      const charging = s.mode === 'laserAim' || s.mode === 'laserLock';
      if (s.mode === 'enrage') AI.drawGlow(ctx, e.x, e.y, e.r + 30, 0.5 + 0.5 * Math.sin(e.t * 20), '#ff5a3c');
      if (charging) {
        const k = s.mode === 'laserLock' ? 1 : 1 - Math.max(0, s.t) / REV.aim[p2 ? 1 : 0];
        AI.drawGlow(ctx, m.x, m.y, 14 + 16 * k, 0.3 + 0.6 * k, '#ff3b3b');
      }
      const open = charging || s.mode === 'laserFire';
      const name = p2 && B.hasSprite('boss_reviewer_angry') ? 'boss_reviewer_angry' : e.def.sprite;
      BH.drawSprite(e, ctx, name, e.x + shake, e.y + bob, { frame: open ? 1 : 0, alpha: e.spawnDelay > 0 ? 0.6 : 1 });

      // ---- Laser: Ziellinie, Einfrieren, Strahl ----
      if (charging || s.mode === 'laserFire') {
        const x1 = m.x + Math.cos(s.aim) * REV_BEAM_LEN, y1 = m.y + Math.sin(s.aim) * REV_BEAM_LEN;
        const mode = s.mode === 'laserAim' ? 'aim' : s.mode === 'laserLock' ? 'lock' : 'fire';
        BH.drawBeam(ctx, [m, { x: x1, y: y1 }], mode, e.t, REV.beamW[p2 ? 1 : 0], REV_BEAM_STYLE);
      }

      if (s.mode === 'wall' && s.firstTell) AI.drawMark(ctx, '!', e.x, e.y - 62, e.t, '#ff4d4d', 30);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // OCTOPUS MERGE (Etagen-Boss von Forgotten Branches)
  // ===========================================================================
  //
  // Ein Knoten aus Wurzeln (der Merge-Commit) mit 8 Holzarmen. Jeder Arm besteht aus OCTO.SEGS eigenen Enemies
  // ('octo_arm', siehe enemies.js) wie die Glieder der Infinite Loop: der Knoten setzt ihre Positionen jeden Tick,
  // Treffer auf sie gehen per proxy (60 %) an den Knoten. Gezeichnet werden die Arme vom Knoten als verjuengte
  // Holzlinien durch die Segment-Positionen; sichtbar als eigene Figur ist nur das Spitzen-Segment (Commit-Punkt).
  //
  // Arm-Zustaende (arm.mode):
  //   idle       wiegt sich auf seinem Platz (Plaetze gleichmaessig um den Knoten, drehen sich langsam)
  //   sweepTell  Telegraph: Arm fasst den Startwinkel, ein korallroter Faecher zeigt den kommenden Schwung
  //   sweep      schwingt ueber OCTO.SWEEP_ARC (durch die Richtung des Spielers)
  //   slamTell   Telegraph: Arm zieht sich zurueck, gestrichelte Ziellinie + Zielring auf der (festen) Zielstelle
  //   slam       schnellt zur Zielstelle; hold: liegt kurz dort (Phase 2: 6er-Ring aus der Spitze)
  //   retract    zurueck auf den Platz
  //   merge      wird eingezogen ("Merged!"), danach gone (Segmente still entfernt)
  // Spitzen-Schuesse: zufaelliger ruhender Arm, Spitze glueht OCTO.TIP_TELL Sekunden, dann ein gezielter
  // Bernstein-Schuss. Je 12 % verlorener HP wird ein Arm "gemergt" (mind. einer bleibt); jeder Merge macht den
  // Rest 10 % schneller (s.sm wirkt auf Bewegung und alle Takte).
  // Phase 2 (50 %): "CONFLICT" — Konfliktmarker an den Waenden, der Knoten spuckt periodisch zwei
  // gegenlaeufige Schussstroeme (rotierend; Telegraph: Knoten glueht, zwei Strahlen zeigen die Startrichtungen).
  // Phase 2 laeuft in Zuegen, damit sich die Trefferflaechen nicht stapeln: ein Strom, dann OCTO.P2_ARMS einzelne
  // Arm-Angriffe (immer nur einer, der naechste erst, wenn der Arm wieder ruht), dann der naechste Strom.
  // Spitzen-Schuesse kommen nur in den Pausen dazwischen. Vorher lief alles gleichzeitig (Playtest 2026-11-05:
  // Strom und Arme ueberlappten 40–45 % der Zeit, im Schnitt 16 Schuesse im Raum).
  // Kontaktschaden der Arme: der Knoten prueft den Abstand des Spielers zur Armlinie (1 halbes Herz), der Knoten
  // selbst hat den normalen Boss-Kontaktschaden (2).
  // Fairness: Schuesse 170–200 px/s, jeder Schwung/Schlag/Schuss/Strom hat einen Telegraph von >= 0.45 s.

  const OCTO = {
    ARMS: 8, SEGS: 5,
    BASE: 30,                 // Armansatz: Abstand von der Knotenmitte (px)
    REST: 150,                // Ruhelaenge eines Arms (px, ab dem Ansatz)
    WIDTH: [15, 8],           // halbe Armdicke an Ansatz / Spitze (Zeichnen und Kontakt)
    SWEEP_LEN: 250, SWEEP_ARC: 1.7, SWEEP_TELL: 0.75, SWEEP_TIME: 0.65,
    SLAM_TELL: 0.7, SLAM_PULL: 80, SLAM_TIME: 0.16, SLAM_HOLD: 0.4, SLAM_REACH: 400,
    RETRACT: 0.5, MERGE_STEP: 0.12, MERGE_SPEED: 340,
    TIP_TELL: 0.45, TIP_EVERY: [1.25, 1.0],
    ATK_EVERY: [2.1, 1.0],    // Phase 1: Takt; Phase 2: Pause, nachdem der vorige Arm wieder ruht
    P2_ARMS: 3, P2_GAP: 0.6,  // Phase 2: Arm-Angriffe je Zug, Pause beim Wechsel zwischen Strom und Armen
    STREAM_TELL: 0.7, STREAM_TIME: 2.6, STREAM_GAP: 0.13, STREAM_SPIN: 0.75,
    GRACE: 1.5,               // Schonfrist nach dem Intro: Arme entrollen sich, keine Angriffe
  };
  const OCTO_TIP_SHOT = { color: '#ffcf4d' };
  const OCTO_STREAM_SHOTS = [{ color: '#ff7a5c' }, { color: '#ffcf4d' }];   // "ours" / "theirs"
  const OCTO_WARN = '#ff7a5c';
  const OCTO_MARKERS = [
    ['<<<<<<<', 120, 150], ['<<<<<<<', 120, 288], ['<<<<<<<', 120, 426],
    ['>>>>>>>', ROOM_W - 120, 150], ['>>>>>>>', ROOM_W - 120, 288], ['>>>>>>>', ROOM_W - 120, 426],
    ['=======', CX, 98], ['=======', CX, ROOM_H - 98],
  ];
  const octoTmp = { x: 0, y: 0 };

  /** Punkt bei t (0 = Ansatz, 1 = Spitze) auf dem gebogenen Arm, ungeklemmt */
  function octoPoint(e, arm, t, out) {
    const a = arm.ang + arm.curl * 4 * t * (1 - t);   // Bogen: 0 an Ansatz und Spitze
    const d = OCTO.BASE + t * arm.len;
    out.x = e.x + Math.cos(a) * d;
    out.y = e.y + Math.sin(a) * d;
    return out;
  }

  const octoActive = (s) => s.arms.filter((a) => a.mode !== 'gone' && a.mode !== 'merge');
  /** Greift gerade ein Arm an (inkl. Telegraph und Rueckzug)? */
  const octoArmBusy = (s) => s.arms.some((a) => a.mode !== 'idle' && a.mode !== 'gone' && a.mode !== 'merge');
  const octoTip = (arm) => arm.segs[arm.segs.length - 1];

  /** Arm-Plaetze: gleichmaessig um den Knoten, in Armreihenfolge, langsam rotierend */
  function octoSlot(s, arm) {
    const act = octoActive(s);
    const k = act.indexOf(arm);
    return s.spin + (Math.max(0, k) * TAU) / Math.max(1, act.length);
  }

  /** Abstand Punkt -> Strecke (fuer den Kontakt entlang des Arms) */
  function octoSegDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = B.M.clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1);
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }

  function octoStartAttack(e, game) {
    const s = e.state, p = game.player;
    const idle = s.arms.filter((a) => a.mode === 'idle');
    if (!idle.length) return;
    const pa = AI.angleTo(e, p);
    // Arm, der am naechsten in Richtung des Spielers zeigt
    let arm = idle[0], best = Infinity;
    for (const a of idle) {
      const d = Math.abs(B.M.angleDiff(a.ang, pa));
      if (d < best) { best = d; arm = a; }
    }
    const near = AI.dist(e, p) < 330;
    if (near && game.rng.chance(0.55)) {
      const dir = game.rng.chance(0.5) ? 1 : -1;
      arm.dir = dir;
      arm.a0 = pa - (dir * OCTO.SWEEP_ARC) / 2;
      arm.a1 = pa + (dir * OCTO.SWEEP_ARC) / 2;
      arm.mode = 'sweepTell';
      arm.t = OCTO.SWEEP_TELL;
    } else {
      // Ziel = Spielerposition (fest), auf die Reichweite gekuerzt
      const d = Math.min(AI.dist(e, p), OCTO.SLAM_REACH);
      arm.ta = pa;
      arm.tlen = Math.max(OCTO.SLAM_PULL + 20, d - OCTO.BASE);
      arm.tx = e.x + Math.cos(pa) * (OCTO.BASE + arm.tlen);
      arm.ty = e.y + Math.sin(pa) * (OCTO.BASE + arm.tlen);
      arm.mode = 'slamTell';
      arm.t = OCTO.SLAM_TELL;
    }
  }

  function octoMerge(e, game, arm) {
    const tip = octoTip(arm);
    arm.mode = 'merge';
    arm.tipTell = 0;
    B.bus.emit('bossMerge', { game, boss: e, x: tip.x, y: tip.y, left: octoActive(e.state).length });
  }

  B.BOSS_BEHAVIORS.octopus_merge = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 320);
      const s = e.state;
      s.phase = 1;
      s.fx = [];
      s.grace = OCTO.GRACE;
      s.spin = game.rng.angle();
      s.sm = 1;                         // Tempo-Faktor (steigt mit jedem Merge)
      s.merged = 0;
      s.atkT = OCTO.GRACE + 0.6;
      s.tipT = OCTO.GRACE + 0.4;
      s.wp = { x: e.x, y: e.y };
      s.wpT = 0;
      s.stream = 'off';                 // off | idle | tell | fire (ab Phase 2)
      s.streamT = 0;
      s.streamAng = 0;
      s.streamDir = 1;
      s.streamGap = 0;
      s.armTurns = 0;                   // Phase 2: offene Arm-Angriffe bis zum naechsten Strom
      s.markerT = 0;
      e.aoeDedupe = true;               // eine Explosion ueber viele Armsegmente zaehlt nur einmal
      e.drawLayer = -1;                 // Knoten und Arme liegen wie Wurzeln unter allem anderen
      e.sayOffset = 24;
      // Arme erzeugen (zusammengerollt; sie entrollen sich waehrend der Schonfrist)
      s.arms = [];
      const def = B.ENEMIES.octo_arm;
      for (let i = 0; i < OCTO.ARMS; i++) {
        const arm = { i, mode: 'idle', t: 0, ang: s.spin + (i * TAU) / OCTO.ARMS, len: 0, curl: 0, tipTell: 0, segs: [] };
        if (def && game.room) {
          for (let j = 0; j < OCTO.SEGS; j++) {
            const seg = new B.Enemy(def, 'octo_arm', e.x, e.y, game, 1);
            seg.proxy = e;
            seg.proxyMult = 0.6;
            seg.state.arm = i;
            seg.state.index = j;
            seg.state.tip = j === OCTO.SEGS - 1;
            seg.spawnDelay = e.spawnDelay;
            game.room.enemies.push(seg);
            arm.segs.push(seg);
          }
        }
        s.arms.push(arm);
      }
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      if (s.grace > 0) s.grace -= dt;

      // ---- Merges: je 12 % verlorener HP ein Arm (mindestens einer bleibt) ----
      while (octoActive(s).length > 1 && e.hp <= e.maxHp * (1 - OCTO.MERGE_STEP * (s.merged + 1))) {
        const act = octoActive(s);
        const idle = act.filter((a) => a.mode === 'idle');
        octoMerge(e, game, game.rng.pick(idle.length ? idle : act));
        s.merged++;
        s.sm = 1 + 0.1 * s.merged;
      }

      // ---- Phase 2 bei 50 %: CONFLICT ----
      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        BH.clearEnemyShots(game);
        game.shake(8, 0.4);
        AI.say(e, '<<<<<<< HEAD', 1.6, '#ff5a4d');
        game.banner('CONFLICT', 'Both branches changed the same lines.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
        s.stream = 'idle';
        s.streamT = 1.4;
      }
      const p2 = s.phase === 2;
      const sm = s.sm;
      if (p2) s.markerT = Math.min(1, s.markerT + dt * 1.5);

      // ---- Knoten treibt langsam zwischen Wegpunkten in der Raummitte ----
      s.wpT -= dt;
      if (s.wpT <= 0) {
        s.wp.x = CX + game.rng.float(-180, 180);
        s.wp.y = CY + game.rng.float(-70, 70);
        s.wpT = game.rng.float(4, 6);
      }
      if (Math.hypot(s.wp.x - e.x, s.wp.y - e.y) > 8) AI.toward(e, s.wp.x, s.wp.y, e.speed * sm);
      else AI.stop(e);
      s.spin += dt * 0.08 * sm;

      // ---- Schussstroeme (Phase 2) ----
      const streaming = s.stream === 'tell' || s.stream === 'fire';
      const armBusy = octoArmBusy(s);
      if (s.stream !== 'off') {
        // Der naechste Strom wartet, bis die Arme ihren Zug beendet haben. Nur diese Pause wird mit den Merges
        // kuerzer; Telegraph und Strom selbst nicht (sonst schrumpfte die Warnung unter die Fairness-Grenze)
        if (s.stream !== 'idle') s.streamT -= dt;
        else if (s.armTurns <= 0 && !armBusy) s.streamT -= dt * sm;
        if (s.stream === 'idle' && s.streamT <= 0 && s.armTurns <= 0 && !armBusy) {
          s.stream = 'tell';
          s.streamT = OCTO.STREAM_TELL;
          s.streamAng = AI.angleTo(e, p) + Math.PI / 2;   // startet quer zum Spieler (nicht direkt auf ihn)
        } else if (s.stream === 'tell' && s.streamT <= 0) {
          s.stream = 'fire';
          s.streamT = OCTO.STREAM_TIME;
          s.streamGap = 0;
        } else if (s.stream === 'fire') {
          s.streamAng += OCTO.STREAM_SPIN * s.streamDir * dt;
          s.streamGap -= dt;
          if (s.streamGap <= 0) {
            s.streamGap = OCTO.STREAM_GAP;
            const sp = AI.shotSpeed(game, 175);
            AI.shoot(game, e, s.streamAng, sp, OCTO_STREAM_SHOTS[0]);
            AI.shoot(game, e, s.streamAng + Math.PI, sp, OCTO_STREAM_SHOTS[1]);
          }
          if (s.streamT <= 0) {
            s.stream = 'idle';
            s.streamT = OCTO.P2_GAP;
            s.streamDir = -s.streamDir;
            s.armTurns = OCTO.P2_ARMS;
            s.atkT = OCTO.P2_GAP;
          }
        }
      }

      // ---- Angriffe der Arme (Schwung / Schlag) ----
      if (s.grace <= 0) {
        if (!p2) {
          s.atkT -= dt * sm;
          if (s.atkT <= 0) {
            if (!armBusy) octoStartAttack(e, game);
            s.atkT = AI.cooldown(game, OCTO.ATK_EVERY[0]) * game.rng.float(0.85, 1.15);
          }
        } else if (!streaming && s.armTurns > 0 && !armBusy) {
          // Phase 2: die Pause zaehlt erst, wenn der vorige Arm wieder ruht (siehe Kopfkommentar)
          s.atkT -= dt * sm;
          if (s.atkT <= 0) {
            octoStartAttack(e, game);
            s.armTurns--;
            s.atkT = AI.cooldown(game, OCTO.ATK_EVERY[1]) * game.rng.float(0.85, 1.15);
          }
        }
        // Spitzen-Schuesse (pausieren waehrend der Stroeme, in Phase 2 auch waehrend der Arm-Angriffe)
        if (!streaming && !(p2 && armBusy)) {
          s.tipT -= dt * sm;
          if (s.tipT <= 0) {
            const idle = s.arms.filter((a) => a.mode === 'idle' && a.tipTell <= 0 && a.len > 60);
            if (idle.length) game.rng.pick(idle).tipTell = OCTO.TIP_TELL;
            s.tipT = AI.cooldown(game, OCTO.TIP_EVERY[p2 ? 1 : 0]);
          }
        }
      }

      // ---- Arme bewegen ----
      const T = e.t;
      for (const arm of s.arms) {
        if (arm.mode === 'gone') continue;
        const slot = octoSlot(s, arm);
        switch (arm.mode) {
          case 'idle': {
            const want = slot + 0.16 * Math.sin(T * 0.8 + arm.i * 1.7);
            arm.ang = AI.turn(arm.ang, want, 1.6 * sm * dt);
            arm.len = B.M.approach(arm.len, OCTO.REST + 14 * Math.sin(T * 0.9 + arm.i * 2.3), (s.grace > 0 ? 110 : 220) * dt);
            arm.curl = 0.45 * Math.sin(T * 1.1 + arm.i);
            break;
          }
          case 'sweepTell':
            arm.ang = AI.turn(arm.ang, arm.a0, 6 * dt);
            arm.len = B.M.approach(arm.len, OCTO.SWEEP_LEN, 500 * dt);
            arm.curl = B.M.approach(arm.curl, -arm.dir * 0.3, 2 * dt);
            arm.t -= dt;
            if (arm.t <= 0) { arm.mode = 'sweep'; arm.t = 0; }
            break;
          case 'sweep': {
            arm.t = Math.min(1, arm.t + (dt * sm) / OCTO.SWEEP_TIME);
            const k = arm.t * arm.t * (3 - 2 * arm.t);          // weich an- und auslaufen
            arm.ang = arm.a0 + (arm.a1 - arm.a0) * k;
            if (arm.t >= 1) { arm.mode = 'retract'; arm.t = OCTO.RETRACT; }
            break;
          }
          case 'slamTell':
            arm.ang = AI.turn(arm.ang, arm.ta, 6 * dt);
            arm.len = B.M.approach(arm.len, OCTO.SLAM_PULL, 400 * dt);
            arm.curl = B.M.approach(arm.curl, 0, 3 * dt);
            arm.t -= dt;
            if (arm.t <= 0) { arm.mode = 'slam'; arm.t = 0; arm.ang = arm.ta; arm.curl = 0; }
            break;
          case 'slam':
            arm.t = Math.min(1, arm.t + dt / OCTO.SLAM_TIME);
            arm.len = OCTO.SLAM_PULL + (arm.tlen - OCTO.SLAM_PULL) * arm.t;
            if (arm.t >= 1) {
              arm.mode = 'hold';
              arm.t = OCTO.SLAM_HOLD;
              game.shake(5, 0.2);
              BH.addWave(e, arm.tx, arm.ty, 70, '#ffcf4d', 0.35);
              B.bus.emit('bossStomp', { game, boss: e, x: arm.tx, y: arm.ty });
              if (p2) AI.ring(game, octoTip(arm), 6, AI.shotSpeed(game, 170), game.rng.angle(), OCTO_TIP_SHOT);
            }
            break;
          case 'hold':
            arm.t -= dt;
            if (arm.t <= 0) { arm.mode = 'retract'; arm.t = OCTO.RETRACT; }
            break;
          case 'retract':
            arm.ang = AI.turn(arm.ang, slot, 3 * dt);
            arm.len = B.M.approach(arm.len, OCTO.REST, 400 * dt);
            arm.curl = B.M.approach(arm.curl, 0, 2 * dt);
            arm.t -= dt;
            if (arm.t <= 0) arm.mode = 'idle';
            break;
          case 'merge':
            arm.len = B.M.approach(arm.len, 0, OCTO.MERGE_SPEED * dt);
            arm.curl = B.M.approach(arm.curl, 0, 3 * dt);
            if (arm.len <= 0) {
              arm.mode = 'gone';
              for (const seg of arm.segs) seg.dead = true;   // still: der Arm ist im Knoten aufgegangen
            }
            break;
        }

        // Spitzen-Telegraph -> Schuss
        if (arm.tipTell > 0) {
          arm.tipTell -= dt;
          if (arm.tipTell <= 0 && arm.mode === 'idle') {
            const tip = octoTip(arm);
            if (tip && !tip.dead) AI.shootAt(game, tip, p, AI.shotSpeed(game, 190), OCTO_TIP_SHOT);
          }
        }

        // Segmente platzieren (in den Raum geklemmt: Wurzeln kriechen an der Wand entlang statt hindurch)
        if (arm.mode === 'gone') continue;
        for (let j = 0; j < arm.segs.length; j++) {
          const seg = arm.segs[j];
          octoPoint(e, arm, (j + 1) / arm.segs.length, octoTmp);
          AI.clampToRoom(octoTmp.x, octoTmp.y, 12, seg);
          seg.state.glow = seg.state.tip && arm.tipTell > 0 ? 1 - arm.tipTell / OCTO.TIP_TELL : 0;
        }
      }

      // ---- Kontakt entlang der Arme (1 halbes Herz; der Knoten selbst macht 2 ueber touchPlayer) ----
      if (p && !p.dead && s.grace <= 0) {
        for (const arm of s.arms) {
          if (arm.mode === 'gone' || arm.mode === 'merge' || arm.len < 20) continue;
          let px = octoPoint(e, arm, 0, octoTmp).x, py = octoTmp.y;
          for (let j = 0; j < arm.segs.length; j++) {
            const seg = arm.segs[j];
            const w = OCTO.WIDTH[0] + (OCTO.WIDTH[1] - OCTO.WIDTH[0]) * ((j + 1) / arm.segs.length);
            if (!seg.dead && octoSegDist(p.x, p.y, px, py, seg.x, seg.y) < w + p.r * 0.7) {
              if (p.hurt(1, e.def.name, game)) p.knockback(p.x - seg.x, p.y - seg.y, 320);
              break;
            }
            px = seg.x; py = seg.y;
          }
        }
      }
    },

    onDeath(e, game) {
      // Arme platzen nacheinander auf (siehe octo_arm.update); nur die Spitzen geben Laub-Effekte
      let n = 0;
      for (const arm of e.state.arms) {
        if (arm.mode === 'gone') continue;
        for (const seg of arm.segs) {
          if (seg.dead) continue;
          seg.intangible = true;
          seg.state.popIn = 0.06 * n + 0.03 * seg.state.index;
        }
        n++;
      }
    },

    draw(e, ctx) {
      const s = e.state;
      // Konfliktmarker (Phase 2) blenden an den Waenden ein und flackern leicht
      if (s.markerT > 0 && typeof B.text === 'function') {
        const a = s.markerT * (0.5 + 0.15 * Math.sin(e.t * 9));
        for (const [str, x, y] of OCTO_MARKERS) {
          B.text(ctx, str, x, y, { size: 26, bold: true, color: '#ff5a4d', align: 'center', baseline: 'middle', alpha: a });
        }
      }
      BH.drawFx(e, ctx);

      // Telegraphe der Arme (unter den Armen)
      for (const arm of s.arms) {
        if (arm.mode === 'sweepTell') {
          const k = 1 - arm.t / OCTO.SWEEP_TELL;
          const lo = Math.min(arm.a0, arm.a1), hi = Math.max(arm.a0, arm.a1);
          ctx.save();
          // nur im Innenraum zeigen (der Arm selbst wird ja auch an der Wand geklemmt)
          ctx.beginPath();
          ctx.rect(INNER.x0, INNER.y0, INNER.x1 - INNER.x0, INNER.y1 - INNER.y0);
          ctx.clip();
          ctx.globalAlpha = 0.12 + 0.22 * k + 0.08 * Math.sin(e.t * 30);
          ctx.fillStyle = OCTO_WARN;
          ctx.beginPath();
          ctx.arc(e.x, e.y, OCTO.BASE + OCTO.SWEEP_LEN + OCTO.WIDTH[1], lo, hi);
          ctx.arc(e.x, e.y, OCTO.BASE, hi, lo, true);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (arm.mode === 'slamTell') {
          const k = 1 - arm.t / OCTO.SLAM_TELL;
          ctx.save();
          ctx.globalAlpha = 0.45 + 0.45 * k;
          ctx.strokeStyle = OCTO_WARN;
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(arm.tx, arm.ty);
          ctx.stroke();
          ctx.restore();
          AI.drawTargetRing(ctx, arm.tx, arm.ty, 34, k, OCTO_WARN);
        }
      }

      // Arme: verjuengte Holzlinien vom Ansatz durch die Segmente (Kontur, Rinde, Lichtkante), kleine Blaetter
      const BL = B.BRANCH_LEAVES || { outline: '#16240f', bark: ['#5a3d22', '#a3602c'], green: ['#4f7a30', '#6f9a3c', '#86ad4a'] };
      for (const arm of s.arms) {
        if (arm.mode === 'gone') continue;
        const pts = [octoPoint(e, arm, 0, { x: 0, y: 0 })];
        let flash = false;
        for (const seg of arm.segs) {
          if (seg.dead) continue;
          pts.push({ x: seg.x, y: seg.y });
          if (seg.flash > 0) flash = true;
        }
        if (pts.length < 2) continue;
        const alpha = arm.segs[0] && arm.segs[0].intangible ? 0.6 : 1;
        ctx.save();
        ctx.globalAlpha = alpha * (e.spawnDelay > 0 ? 0.6 : 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Schichten: [Farbe, Linienbreite aus der halben Armdicke w] — Kontur, Rinde, schmale Lichtkante
        const layers = [
          [BL.outline, (w) => w * 2 + 4],
          [flash ? '#fff4e0' : '#7a4e2a', (w) => w * 2],
          [flash ? '#ffffff' : BL.bark[1], (w) => w * 0.66],
        ];
        for (const [col, width] of layers) {
          ctx.strokeStyle = col;
          for (let j = 1; j < pts.length; j++) {
            const w = OCTO.WIDTH[0] + (OCTO.WIDTH[1] - OCTO.WIDTH[0]) * (j / (pts.length - 1));
            ctx.lineWidth = width(w);
            ctx.beginPath();
            ctx.moveTo(pts[j - 1].x, pts[j - 1].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        // ein Blatt an jedem zweiten Gelenk, abwechselnd links/rechts (harmloses Gruen, nur Deko)
        for (let j = 1; j < pts.length - 1; j += 2) {
          const a = Math.atan2(pts[j + 1].y - pts[j - 1].y, pts[j + 1].x - pts[j - 1].x) + (j % 4 === 1 ? 1 : -1) * 1.1;
          const lx = pts[j].x + Math.cos(a) * 14, ly = pts[j].y + Math.sin(a) * 14;
          ctx.fillStyle = BL.outline;
          ctx.beginPath(); ctx.ellipse(lx, ly, 9, 5, a, 0, TAU); ctx.fill();
          ctx.fillStyle = BL.green[1];
          ctx.beginPath(); ctx.ellipse(lx, ly, 7, 3.2, a, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }

      // Knoten: Frame 1 = Merge-Commit glueht (Telegraph der Schussstroeme)
      const glowing = s.stream === 'tell' || s.stream === 'fire';
      if (s.stream === 'tell') {
        const k = 1 - s.streamT / OCTO.STREAM_TELL;
        AI.drawGlow(ctx, e.x, e.y, e.r + 18, k, OCTO_WARN);
        AI.drawRays(ctx, e.x, e.y, [s.streamAng, s.streamAng + Math.PI], e.r + 4, 90 + 120 * k, 0.4 + 0.5 * k, OCTO_WARN);
      }
      BH.drawSprite(e, ctx, e.def.sprite, e.x, e.y, { frame: glowing ? 1 : 0, alpha: e.spawnDelay > 0 ? 0.6 : 1 });
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Arm-Segment der Octopus Merge. Wird vom Knoten positioniert (static); nur die Spitze zeichnet sich selbst
   * (Commit-Punkt, glueht vor einem Schuss). Stirbt der Knoten, platzen die Segmente nacheinander.
   */
  B.BEHAVIORS.octo_arm = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.noSeparate = true;
      e.noShadow = true;
      e.ignoreForClear = true;   // nur der Knoten zaehlt fuers Clearing
      e.contactDamage = 0;       // Kontakt prueft der Knoten entlang der ganzen Armlinie
      e.state.glow = 0;
    },
    update(e, dt, game) {
      AI.stop(e);
      const host = e.proxy;
      if (host && !host.dead) return;
      // Knoten tot: nacheinander platzen (ohne Kill-Zaehlung); nur Spitzen melden sich fuer Laub-Effekte
      e.intangible = true;
      const s = e.state;
      if (s.popIn === undefined) s.popIn = 0.06 * (s.arm || 0) + 0.03 * (s.index || 0);
      s.popIn -= dt;
      if (s.popIn <= 0) {
        e.dead = true;
        if (s.tip) B.bus.emit('enemyDeath', { game, enemy: e, x: e.x, y: e.y, color: e.def.color, boss: false, segment: true });
      }
    },
    draw(e, ctx) {
      if (!e.state.tip) return;
      const g = e.state.glow || 0;
      if (g > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 8, g, '#ffcf4d');
      AI.drawBody(e, ctx, { frame: g > 0 ? 1 : 0, flipX: false, alpha: e.intangible ? 0.6 : 1, noFrost: true });
    },
  };

  // ===========================================================================
  // THE NESTED INFINITE LOOP (spaete Abloesung der Infinite Loop, ab Etage 8)
  // ===========================================================================
  //
  // Drei ineinanderliegende Ringe (gross, mittel, klein) aus Koepfen und Gliedern der Infinite Loop, die sich um
  // einen gemeinsamen, langsam wandernden Mittelpunkt drehen (abwechselnde Richtung, innen schneller). Der Boss
  // selbst ist nur der unsichtbare Mittelpunkt mit dem gemeinsamen HP-Pool (intangible, kein Kontaktschaden);
  // alle sichtbaren Teile sind 'nested_loop_part'-Enemies mit proxy auf ihn.
  //
  // Balance-Regel: Nur der aeussere LEBENDE Ring ist "echt" — er feuert, verletzt bei Beruehrung und nimmt
  // Schaden. Die inneren drehen sich geisterhaft mit (intangible, halbtransparent). Bei 50 % zerfaellt der
  // grosse Ring, bei 16,67 % der mittlere (Stueck fuer Stueck, Banner, Schuesse geloescht, kurze Pause), der kleine
  // stirbt mit dem Boss. So beginnt der Kampf langsam und wird mit jeder Phase hektischer.
  //   Ring 0 (gross, langsam):   Puls (jedes Glied schiesst nach innen und aussen) + gezielter 3er-Faecher vom Kopf
  //   Ring 1 (mittel, schneller): Puls abwechselnd quer / als X + 5er-Faecher
  //   Ring 2 (klein, sehr schnell): Spiral-Salven (Glied fuer Glied nach aussen) + 3er-Faecher; der Mittelpunkt
  //                                 haelt ~150 px Abstand zum Spieler (damit die Spirale ihn erreicht)
  // Telegraphe: der ganze Ring glueht vor Puls/Salve, der Kopf glueht vor jedem Faecher.

  const NEST = {
    rings: [
      { R: 190, n: 14, spin: 0.35, scale: 1.1, shot: { color: '#58d0e0' }, pulse: 2.8, head: 3.4, fan: 3, fanSpeed: 180, pulseSpeed: 165 },
      { R: 118, n: 9, spin: -0.9, scale: 0.95, shot: { color: '#b88cff' }, pulse: 2.0, head: 2.6, fan: 5, fanSpeed: 195, pulseSpeed: 185 },
      { R: 58, n: 5, spin: 2.0, scale: 0.8, shot: { color: '#ff7a6a' }, pulse: 0, head: 3.0, fan: 3, fanSpeed: 215, pulseSpeed: 205 },
    ],
    breakAt: [0.5, 1 / 6],   // Ring 0 bei 50 %, Ring 1 bei 16,67 % des gemeinsamen Pools
    move: [28, 48, 85],      // Tempo des Mittelpunkts je aktivem Ring (px/s)
    tell: 0.55,              // Gluehen vor einem Puls / einer Salve
    headTell: 0.45,          // Gluehen des Kopfes vor einem Faecher
    spiral: { fire: 2.4, gap: 0.09, rest: 1.3 },
    grace: 1.6,              // Pause nach dem Zerfall eines Rings (und nach dem Intro)
  };

  /** Bewegungsrahmen des Mittelpunkts, damit der aeussere aktive Ring im Raum bleibt */
  function nestBox(k) {
    const m = NEST.rings[k].R + 28;
    return { x0: INNER.x0 + m, x1: INNER.x1 - m, y0: INNER.y0 + m, y1: INNER.y1 - m };
  }
  function nestClamp(k, x, y, out) {
    const b = nestBox(k);
    out.x = b.x0 <= b.x1 ? B.M.clamp(x, b.x0, b.x1) : CX;
    out.y = b.y0 <= b.y1 ? B.M.clamp(y, b.y0, b.y1) : CY;
    return out;
  }

  /** Ring k zerfaellt: Teile platzen nacheinander, Schuesse weg, Banner, kurze Pause, naechster Ring wird aktiv */
  function nestBreak(e, game, k) {
    const s = e.state, ring = s.rings[k];
    ring.broken = true;
    ring.parts.forEach((pt, i) => {
      pt.intangible = true;
      pt.contactDamage = 0;
      pt.state.popIn = 0.06 * i;
    });
    BH.clearEnemyShots(game);
    game.shake(8, 0.45);
    s.active = k + 1;
    s.grace = NEST.grace;
    if (k === 0) {
      AI.say(e, 'break;', 1.4, '#cdb8ff');
      game.banner('break;', 'One loop down. The inner ones did not notice.');
    } else {
      AI.say(e, 'WHYYYYYYYY?', 1.6, '#ffb3a8');
      game.banner('WHYYYYYYYY?', 'Innermost loop. Maximum speed.');
    }
    B.bus.emit('bossPhase', { game, boss: e, phase: k + 2 });
  }

  /** Puls des aktiven Rings: jedes Glied (nicht der Kopf) feuert quer zum Ring nach innen und aussen, oder als X */
  function nestPulse(e, game, ring) {
    const sp = AI.shotSpeed(game, ring.pulseSpeed);
    const x = ring.pattern === 'x';
    for (let i = 1; i < ring.parts.length; i++) {
      const pt = ring.parts[i];
      if (pt.dead) continue;
      const radial = Math.atan2(pt.y - e.y, pt.x - e.x);
      if (x) for (let q = 0; q < 4; q++) AI.shoot(game, pt, radial + Math.PI / 4 + (q * Math.PI) / 2, sp, ring.shot);
      else { AI.shoot(game, pt, radial, sp, ring.shot); AI.shoot(game, pt, radial + Math.PI, sp, ring.shot); }
    }
  }

  B.BOSS_BEHAVIORS.nested_loop = {
    init(e, game) {
      const s = e.state;
      e.x = CX;                 // die Ringe brauchen die Raummitte (der grosse fuellt fast die ganze Hoehe)
      e.y = CY;
      e.intangible = true;      // nur Mittelpunkt + HP-Pool; getroffen werden die Ringteile
      e.contactDamage = 0;
      e.noShadow = true;
      e.aoeDedupe = true;       // eine Explosion ueber viele Ringteile zaehlt nur einmal
      s.fx = [];
      s.active = 0;
      s.grace = NEST.grace;
      s.wp = { x: CX, y: CY };
      s.wpT = 0;
      s.rings = NEST.rings.map((cfg, k) => ({
        k, cfg, R: cfg.R, n: cfg.n, spin: cfg.spin, shot: cfg.shot,
        theta: game.rng.angle(),
        parts: [], broken: false,
        tell: 0, tellMax: NEST.tell, pulseT: cfg.pulse || 0, pattern: 'perp',
        headTell: 0, headT: cfg.head,
        spiral: 'rest', spiralT: 1.0, spiralGap: 0, spiralIdx: 0,
      }));
      const def = B.ENEMIES.nested_loop_part;
      if (def && game.room) {
        for (const ring of s.rings) {
          for (let i = 0; i < ring.n; i++) {
            const pt = new B.Enemy(def, 'nested_loop_part', e.x, e.y, game, 1);
            pt.proxy = e;
            pt.state.ringObj = ring;
            pt.state.index = i;
            pt.state.head = i === 0;
            pt.spriteName = (i === 0 ? 'boss_nested_loop_head_' : 'boss_nested_loop_segment_') + ring.k;
            pt.scale = ring.cfg.scale;
            pt.r = (i === 0 ? 22 : 18) * ring.cfg.scale;
            pt.spawnDelay = e.spawnDelay;
            game.room.enemies.push(pt);
            ring.parts.push(pt);
          }
        }
      }
      B.BOSS_BEHAVIORS.nested_loop.place(e, 0);
    },

    /** Ringteile auf ihre Plaetze setzen und ihren Zustand (aktiv / Geist) an den aktiven Ring anpassen */
    place(e, dt) {
      const s = e.state;
      for (const ring of s.rings) {
        ring.theta += ring.spin * dt;
        if (ring.broken) continue;
        const live = ring.k === s.active;
        const sign = ring.spin >= 0 ? 1 : -1;
        for (let i = 0; i < ring.parts.length; i++) {
          const pt = ring.parts[i];
          if (pt.dead) continue;
          const a = ring.theta - sign * i * (TAU / ring.n);   // Glieder folgen hinter dem Kopf
          pt.x = e.x + Math.cos(a) * ring.R;
          pt.y = e.y + Math.sin(a) * ring.R;
          pt.state.ang = a + sign * Math.PI / 2;              // in Laufrichtung
          pt.state.ghost = !live;
          pt.intangible = !live;
          pt.contactDamage = live ? (pt.state.head ? 2 : 1) : 0;
        }
      }
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);

      // ---- Phasen: Ringe zerfallen bei ihren Schwellen ----
      if (s.active === 0 && e.hp <= e.maxHp * NEST.breakAt[0]) nestBreak(e, game, 0);
      if (s.active === 1 && e.hp <= e.maxHp * NEST.breakAt[1]) nestBreak(e, game, 1);
      const k = s.active;
      const ring = s.rings[k];

      // ---- Mittelpunkt bewegen (Rahmen haengt vom aktiven Ring ab) ----
      s.wpT -= dt;
      if (k === 2) {
        // innerster Ring: ~150 px Abstand zum Spieler halten, damit die Spirale ihn erreicht
        const d = Math.max(1, AI.dist(e, p));
        nestClamp(k, p.x + ((e.x - p.x) / d) * 150, p.y + ((e.y - p.y) / d) * 150, s.wp);
      } else if (s.wpT <= 0) {
        const b = nestBox(k);
        nestClamp(k, game.rng.float(b.x0, b.x1), game.rng.float(b.y0, b.y1), s.wp);
        s.wpT = game.rng.float(3.5, 5.5);
      }
      if (Math.hypot(s.wp.x - e.x, s.wp.y - e.y) > 6) AI.toward(e, s.wp.x, s.wp.y, NEST.move[k]);
      else AI.stop(e);

      // ---- Angriffe nur vom aktiven Ring, nicht in der Schonfrist ----
      if (s.grace > 0) {
        s.grace -= dt;
      } else if (ring && !ring.broken) {
        const cfg = ring.cfg;
        if (cfg.pulse) {
          if (ring.tell > 0) {
            ring.tell -= dt;
            if (ring.tell <= 0) { nestPulse(e, game, ring); ring.pattern = k === 1 && ring.pattern === 'perp' ? 'x' : 'perp'; }
          } else {
            ring.pulseT -= dt;
            if (ring.pulseT <= 0) { ring.tell = NEST.tell; ring.pulseT = AI.cooldown(game, cfg.pulse); }
          }
        } else {
          // Spiral-Salven: Gluehen -> Glied fuer Glied nach aussen feuern -> Pause
          const S = NEST.spiral;
          if (ring.spiral === 'rest') {
            ring.spiralT -= dt;
            if (ring.spiralT <= 0) { ring.spiral = 'tell'; ring.tell = NEST.tell; }
          } else if (ring.spiral === 'tell') {
            ring.tell -= dt;
            if (ring.tell <= 0) { ring.spiral = 'fire'; ring.spiralT = S.fire; ring.spiralGap = 0; }
          } else {
            ring.spiralT -= dt;
            ring.spiralGap -= dt;
            if (ring.spiralGap <= 0) {
              ring.spiralGap = S.gap;
              const pt = ring.parts[ring.spiralIdx++ % ring.parts.length];
              if (pt && !pt.dead) AI.shoot(game, pt, Math.atan2(pt.y - e.y, pt.x - e.x), AI.shotSpeed(game, cfg.pulseSpeed), ring.shot);
            }
            if (ring.spiralT <= 0) { ring.spiral = 'rest'; ring.spiralT = AI.cooldown(game, S.rest); }
          }
        }
        // Kopf: gezielter Faecher nach kurzem Gluehen
        if (ring.headTell > 0) {
          ring.headTell -= dt;
          const head = ring.parts[0];
          if (ring.headTell <= 0 && head && !head.dead) AI.fan(game, head, p, cfg.fan, 0.2, AI.shotSpeed(game, cfg.fanSpeed), ring.shot);
        } else {
          ring.headT -= dt;
          if (ring.headT <= 0) { ring.headTell = NEST.headTell; ring.headT = AI.cooldown(game, cfg.head); }
        }
      }
    },

    // Ringteile erst nach der Bewegung des Mittelpunkts setzen (sonst haengen sie einen Frame hinterher)
    afterMove(e, dt) {
      if (!e.dead) B.BOSS_BEHAVIORS.nested_loop.place(e, dt);
    },

    onDeath(e) {
      // der letzte Ring (und was sonst noch steht) platzt nacheinander
      let n = 0;
      for (const ring of e.state.rings) {
        if (ring.broken) continue;
        ring.broken = true;
        for (const pt of ring.parts) {
          if (pt.dead) continue;
          pt.intangible = true;
          pt.contactDamage = 0;
          pt.state.popIn = 0.07 * n++;
        }
      }
    },

    draw(e, ctx) {
      BH.drawFx(e, ctx);
      // Mittelpunkt: nur ein schwacher Schimmer, damit man sieht, worum sich alles dreht
      AI.drawGlow(ctx, e.x, e.y, 16, 0.08 + 0.06 * Math.sin(e.t * 4), '#cdb8ff');
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  /** Ringteil der Nested Infinite Loop: positioniert vom Boss; platzt, wenn sein Ring zerfaellt oder der Boss stirbt */
  B.BEHAVIORS.nested_part = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.noSeparate = true;
      e.ignoreForClear = true;   // gezaehlt wird nur der Boss
      e.state.ang = 0;
    },
    update(e, dt, game) {
      AI.stop(e);
      const s = e.state, host = e.proxy;
      if (host && !host.dead && !(s.ringObj && s.ringObj.broken)) return;
      e.intangible = true;
      e.contactDamage = 0;
      if (s.popIn === undefined) s.popIn = 0.06 * (s.index || 0);
      s.popIn -= dt;
      if (s.popIn <= 0) {
        e.dead = true;
        B.bus.emit('enemyDeath', { game, enemy: e, x: e.x, y: e.y, color: s.ringObj ? s.ringObj.shot.color : e.def.color, boss: false, segment: true });
      }
    },
    draw(e, ctx) {
      const s = e.state, ring = s.ringObj;
      const ghost = !!s.ghost;
      const popping = ring && ring.broken;
      if (ring && !ring.broken && !ghost) {
        if (ring.tell > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 8, 1 - ring.tell / ring.tellMax, ring.shot.color);
        if (s.head && ring.headTell > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 12, 1 - ring.headTell / NEST.headTell, '#ff5040');
      }
      AI.drawBody(e, ctx, {
        rotation: s.ang,
        flipX: false,
        frame: s.head && ring && ring.headTell > 0 ? 1 : 0,
        alpha: ghost ? 0.32 : popping ? 0.6 : 1,
        noFrost: ghost,
      });
    },
  };

  B.Boss = Boss;
})(window.BOTA);
