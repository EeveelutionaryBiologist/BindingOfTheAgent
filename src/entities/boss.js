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
 *   reviewer       The Antagonistic Reviewer — schwebendes Gesicht, langsam und methodisch: Laser aus dem Mund
 *                                    (Ziellinie -> Einfrieren -> Strahl), wandernde "Nitpick"-Kugelreihen mit
 *                                    Luecke, "REJECTED"-Stempel auf die Spielerposition; ab 50 % rot vor Wut,
 *                                    schwenkender Laser, doppelte Reihen, dreifache Stempel.
 *
 * Zusaetzliches Bus-Event (nur informativ): 'bossBeam' (Reviewer feuert den Laser).
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
      // Verhalten aus BOSS_BEHAVIORS (Enemy-Konstruktor sucht in BEHAVIORS -> hier ueberschreiben)
      super(Object.assign({}, def, { behavior: '__boss__' }), id, x, y, game, 1 + 0.3 * (depth - 1));
      this.def = def;
      this.isBoss = true;
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

  /** Abstand Punkt -> Strecke (fuer den Laser-Treffertest) */
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }

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
    const gapC = game.rng.float(a0 + half + 10, a1 - half - 10);
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
        ctx.save();
        ctx.lineCap = 'round';
        if (s.mode === 'laserAim') {
          ctx.strokeStyle = 'rgba(255,70,70,' + (0.35 + 0.2 * Math.sin(e.t * 18)) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(x1, y1); ctx.stroke();
        } else if (s.mode === 'laserLock') {
          ctx.strokeStyle = Math.floor(e.t * 20) % 2 ? '#ffffff' : '#ff4646';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(x1, y1); ctx.stroke();
        } else {
          const w = REV.beamW[p2 ? 1 : 0] + Math.sin(e.t * 40) * 2;
          const layers = [['rgba(255,60,60,0.3)', w + 16], ['#ff4a3a', w], ['#fff1e6', w * 0.35]];
          for (const [col, lw] of layers) {
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(x1, y1); ctx.stroke();
          }
        }
        ctx.restore();
      }

      if (s.mode === 'wall' && s.firstTell) AI.drawMark(ctx, '!', e.x, e.y - 62, e.t, '#ff4d4d', 30);
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  B.Boss = Boss;
})(window.BOTA);
