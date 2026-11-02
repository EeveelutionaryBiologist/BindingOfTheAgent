/*
 * enemy.js — Gegner-Klasse, KI-Hilfsfunktionen (BOTA.AI) und Verhaltensbibliothek (BOTA.BEHAVIORS).
 *
 * Verhalten-Vertrag:
 *   BOTA.BEHAVIORS.<name> = {
 *     init(e, game) {},             // optional, einmalig beim Erzeugen (laeuft IM Enemy-Konstruktor)
 *     update(e, dt, game) {},       // setzt e.vx/e.vy, schiesst, wechselt Zustand (e.state ist frei nutzbar)
 *     onDeath(e, game) {},          // optional (z. B. Abspalten)
 *     onLethal(e, game, source) {}, // optional: true zurueckgeben = Tod verhindern (z. B. Zombie Process)
 *     onExplosion(e, game, x, y, radius) {}, // optional: jede Explosion im Raum (game.explode), egal wie nah
 *     onHitPlayer(e, game) {},      // optional: Kontaktschaden hat den Spieler wirklich getroffen
 *     draw(e, ctx, game) {},        // optional — ersetzt das Standard-Sprite-Zeichnen komplett
 *     drawUnder(e, ctx, game) {},   // optional — wird VOR dem Standard-Sprite gezeichnet (Bodenmarker)
 *     drawOver(e, ctx, game) {},    // optional — wird NACH dem Standard-Sprite gezeichnet (Telegraphen)
 *   };
 *
 * Nuetzliche Gegner-Felder: e.def, e.params, e.state, e.t (Lebenszeit), e.hp/e.maxHp,
 *   e.intangible (Schuesse fliegen durch), e.invulnerable (Schuesse zerplatzen ohne Schaden),
 *   e.static (bewegt sich nie), e.noKnockback, e.ignoreForClear, e.contactDamage, e.frame (Sprite-Frame),
 *   e.alpha (Transparenz), e.scale (Zeichenskalierung).
 * Erweiterungen (Agent B, rueckwaertskompatibel):
 *   e.spriteName   abweichender Sprite-Name (sonst e.def.sprite)
 *   e.noHpBar      kein HP-Balken (z. B. getarnte Hallucination, Wurm-Segmente)
 *   e.proxy        anderes Enemy, an das Schaden weitergeleitet wird (Wurm-Segment -> Kopf), e.proxyMult
 *   e.aoeDedupe    Flaechenschaden ohne Quelle (Explosion, Aktiv-Items) zaehlt max. einmal pro Tick
 *   e.noSeparate   wird nicht von anderen Gegnern weggeschoben (Bosse)
 *   e.sayText/sayT kurzer schwebender Text ueber dem Gegner (siehe AI.say)
 *
 * Verhalten in dieser Datei: wander, chase, fly_chase, split, blink, charge, turret, orbit, shooter,
 * revive, grow, mimic, zigzag, glitch, stale (Stale Branch), detached_body + detached_tag (Detached HEAD).
 * stale und detached_* gehoeren zur Forgotten-Branches-Familie. Boss-Verhalten (und das Wurm-Segment) stehen in entities/boss.js.
 *
 * Zusaetzliche Bus-Events (nur informativ, z. B. fuer Sound/Effekte): 'enemyRevive' (Zombie steht auf),
 * 'enemyReveal' (Hallucination enttarnt sich), 'enemyShed' (Stale Branch verliert Laub: { colors, count, big }),
 * 'enemyWindup' (Stale Branch zittert vor dem Sprung); aus boss.js: 'bossPhase', 'bossStomp', 'bossBounce'.
 * 'enemyDeath' kann zusaetzlich { segment: true } tragen (platzende Wurm-Segmente, ohne Kill-Zaehlung).
 *
 * SICHERHEIT: reine Spiellogik, kein DOM-Zugriff (ausser Canvas-Zeichnen), kein eval/innerHTML,
 * keine Netzwerkzugriffe. Texte werden nur per fillText in den Canvas geschrieben.
 */
'use strict';

(function (B) {
  const TAU = Math.PI * 2;
  // Sicherheitsventil: Ueber dieser Projektilanzahl im Raum werden keine Gegnerschuesse mehr erzeugt.
  // Haelt Bullet-Hell-Muster performant und lesbar (Ziel: < ~150 gegnerische Schuesse gleichzeitig).
  const MAX_PROJECTILES = 200;

  // ---------------------------------------------------------------------------
  // KI-Helfer
  // ---------------------------------------------------------------------------
  const AI = {
    MAX_PROJECTILES,

    /** Direkt auf ein Ziel zu bewegen (ignoriert Hindernisse — fuer Flieger) */
    toward(e, tx, ty, speed) {
      const n = B.M.norm(tx - e.x, ty - e.y);
      e.vx = n.x * speed;
      e.vy = n.y * speed;
    },

    /** Auf ein Ziel zu, fuer Laeufer entlang des Flow-Fields (umgeht Felsen/Gruben) */
    pathToward(e, game, tx, ty, speed) {
      if (e.flying) return AI.toward(e, tx, ty, speed);
      const d = game.room.flowDir(e.x, e.y, tx, ty);
      e.vx = d.x * speed;
      e.vy = d.y * speed;
    },

    /** Zufaelliges Umherirren; wechselt die Richtung alle 1–2.5 s oder bei Wandkontakt */
    wander(e, dt, game, speed) {
      const s = e.state;
      s.wanderT = (s.wanderT || 0) - dt;
      if (s.wanderT <= 0 || s.bumped) {
        const a = game.rng.angle();
        s.wanderVX = Math.cos(a) * speed;
        s.wanderVY = Math.sin(a) * speed;
        s.wanderT = game.rng.float(1, 2.5);
        s.bumped = false;
      }
      e.vx = s.wanderVX;
      e.vy = s.wanderVY;
    },

    /**
     * Gegnerisches Projektil im Winkel angle abfeuern.
     * Gibt das Projektil zurueck — oder null, wenn das Projektil-Limit des Raums erreicht ist.
     */
    shoot(game, e, angle, speed, opts) {
      const room = game.room;
      if (room && room.projectiles.length >= MAX_PROJECTILES) return null; // Limit: lieber eine Kugel weniger
      const o = opts || {};
      return game.spawnProjectile(Object.assign({
        x: e.x + Math.cos(angle) * (e.r * 0.6),
        y: e.y + Math.sin(angle) * (e.r * 0.6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        team: 'enemy',
        damage: 1,
        source: e.def ? e.def.name : 'an enemy',
      }, o));
    },

    /** Auf ein Ziel schiessen (mit optionaler Streuung in Radiant) */
    shootAt(game, e, target, speed, opts, spread) {
      const a = Math.atan2(target.y - e.y, target.x - e.x) + (spread ? game.rng.float(-spread, spread) : 0);
      return AI.shoot(game, e, a, speed, opts);
    },

    /** Ring aus n Projektilen */
    ring(game, e, n, speed, offset, opts) {
      for (let i = 0; i < n; i++) AI.shoot(game, e, (offset || 0) + (i * TAU) / n, speed, opts);
    },

    /** Faecher aus n Projektilen um den Zielwinkel (spreadRad = Abstand zwischen Schuessen) */
    fan(game, e, target, n, spreadRad, speed, opts) {
      const base = Math.atan2(target.y - e.y, target.x - e.x);
      AI.fanAngle(game, e, base, n, spreadRad, speed, opts);
    },

    /** Faecher um einen festen Winkel (z. B. Wand-Normale beim Friday Deploy) */
    fanAngle(game, e, base, n, spreadRad, speed, opts) {
      for (let i = 0; i < n; i++) AI.shoot(game, e, base + (i - (n - 1) / 2) * spreadRad, speed, opts);
    },

    // ----- Schwierigkeits-Skalierung (sanft, damit spaete Etagen etwas zackiger werden) -----

    /** Aktuelle Tiefe (1..), robust auch ohne Etage */
    depth(game) {
      return Math.max(1, (game && (game.depth || (game.floor && game.floor.depth))) || 1);
    },

    /** Schussgeschwindigkeit: +2 % pro Etage, max. +15 % (bleibt im fairen Bereich ~180–280 px/s) */
    shotSpeed(game, base) {
      return base * Math.min(1.15, 1 + 0.02 * (AI.depth(game) - 1));
    },

    /** Abklingzeiten: -3 % pro Etage, max. -25 % */
    cooldown(game, base) {
      return base * Math.max(0.75, 1 - 0.03 * (AI.depth(game) - 1));
    },

    // ----- Geometrie -----

    angleTo(e, t) { return Math.atan2(t.y - e.y, t.x - e.x); },
    dist(e, t) { return Math.hypot(t.x - e.x, t.y - e.y); },
    stop(e) { e.vx = 0; e.vy = 0; },

    /** Winkel cur um maximal maxStep Richtung want drehen (fuer traege Kurven, z. B. Wurmkopf) */
    turn(cur, want, maxStep) {
      return cur + B.M.clamp(B.M.angleDiff(cur, want), -maxStep, maxStep);
    },

    /** Punkt in den Innenraum klemmen (margin = Abstand zur Wand, z. B. Radius) */
    clampToRoom(x, y, margin, out) {
      const I = B.C.INNER;
      const m = margin || 0;
      const o = out || {};
      o.x = B.M.clamp(x, I.x0 + m, I.x1 - m);
      o.y = B.M.clamp(y, I.y0 + m, I.y1 - m);
      return o;
    },

    /**
     * Freie Bodenkachel im Abstand [minD, maxD] zum Spieler suchen (fuer Teleports).
     * Faellt auf "irgendeine Kachel weiter als minD" und notfalls auf null zurueck.
     */
    findSpot(e, game, minD, maxD) {
      const p = game.player, room = game.room;
      let fallback = null;
      for (let i = 0; i < 24; i++) {
        const pos = room.randomFreePos(game.rng, { awayFrom: { x: p.x, y: p.y, d: minD } });
        const d = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (d < minD) continue; // Notfall-Rueckgabe (Raummitte) kann zu nah am Spieler sein
        if (d <= maxD) return pos;
        fallback = pos;
      }
      return fallback;
    },

    // ----- Schwebender Text ("CORNER HIT!", "zZz", ...) -----

    /** Zeigt dur Sekunden lang einen kurzen Text ueber dem Gegner */
    say(e, text, dur, color) {
      e.sayText = text;
      e.sayT = dur || 1.2;
      e.sayDur = e.sayT;
      e.sayColor = color || null;
    },

    drawSay(e, ctx) {
      if (!(e.sayT > 0) || !e.sayText || typeof B.text !== 'function') return;
      const k = e.sayT / (e.sayDur || 1);           // 1 -> 0 ueber die Lebenszeit
      const rise = (1 - k) * 16;                     // Text steigt langsam auf
      B.text(ctx, e.sayText, e.x, e.y - e.r - 30 - rise - (e.sayOffset || 0), {
        size: 15, align: 'center', color: e.sayColor || '#f3ece6', alpha: Math.min(1, k * 4),
      });
    },

    // ----- Zeichen-Helfer -----

    /**
     * Standard-Koerper zeichnen (Sprite mit Einblenden beim Spawn, Treffer-Blitz, Frost-Overlay).
     * opts: { sprite, dx, dy, alpha, scale, frame, flipX, rotation, noFrost }
     */
    drawBody(e, ctx, opts) {
      const o = opts || {};
      const appear = e.spawnDelay > 0 ? 1 - e.spawnDelay / 0.5 : 1; // Einblenden beim Spawn
      const name = o.sprite || e.spriteName || e.def.sprite;
      const frame = o.frame !== undefined ? o.frame : (e.frame || Math.floor(e.t * 6));
      const flipX = o.flipX !== undefined ? o.flipX : (!e.def.noFlip && e.vx < -5);
      B.drawSprite(ctx, name, e.x + (o.dx || 0), e.y + (o.dy || 0), {
        flash: e.flash > 0,
        alpha: e.alpha * Math.max(0, Math.min(1, 0.3 + 0.7 * appear)) * (o.alpha !== undefined ? o.alpha : 1),
        scale: o.scale !== undefined ? o.scale : e.scale,
        frame,
        flipX,
        rotation: o.rotation,
      });
      if (e.frozen > 0 && !o.noFrost) {
        // Eingefroren (Stop Generating / Daily Standup): blaeulicher Schimmer
        ctx.fillStyle = 'rgba(140,200,255,0.25)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, TAU);
        ctx.fill();
      }
    },

    /** Telegraph-Zeichen (z. B. '!' oder '?') mit Huepf-Animation und schwarzer Kontur */
    drawMark(ctx, ch, x, y, t, color, size) {
      const bob = Math.abs(Math.sin((t || 0) * 12)) * 4;
      ctx.save();
      ctx.font = 'bold ' + (size || 24) + 'px ' + (B.FONT || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(ch, x, y - bob);
      ctx.fillStyle = color || '#ff4d4d';
      ctx.fillText(ch, x, y - bob);
      ctx.restore();
    },

    /** Zielmarkierung am Boden (pulsierender Ring); k = Fortschritt 0..1 bis zum Einschlag */
    drawTargetRing(ctx, x, y, r, k, color) {
      const kk = B.M.clamp(k, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.45 * kk;
      ctx.fillStyle = color || '#ff5040';
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.4 + 0.6 * kk), r * 0.45 * (0.4 + 0.6 * kk), 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(kk * 18));
      ctx.strokeStyle = color || '#ff5040';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    /** Kurze Warn-Strahlen in die angegebenen Winkel (z. B. Jira Ticket kurz vor der Salve) */
    drawRays(ctx, x, y, angles, r0, len, alpha, color) {
      ctx.save();
      ctx.globalAlpha = B.M.clamp(alpha, 0, 1);
      ctx.strokeStyle = color || '#ff6b6b';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      for (let i = 0; i < angles.length; i++) {
        const c = Math.cos(angles[i]), s = Math.sin(angles[i]);
        ctx.moveTo(x + c * r0, y + s * r0);
        ctx.lineTo(x + c * (r0 + len), y + s * (r0 + len));
      }
      ctx.stroke();
      ctx.restore();
    },

    /** Leuchtender Kreis (Aufladen/Telegraph); k = Intensitaet 0..1 */
    drawGlow(ctx, x, y, r, k, color) {
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.4 * B.M.clamp(k, 0, 1);
      ctx.fillStyle = color || '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------------------
  // Gegner
  // ---------------------------------------------------------------------------
  class Enemy extends B.Entity {
    /**
     * @param {object} def  — Definition aus BOTA.ENEMIES (oder BOTA.BOSSES)
     * @param {string} id   — Definitions-ID
     * @param {number} hpScale — Skalierung der HP (Tiefe)
     */
    constructor(def, id, x, y, game, hpScale) {
      super(x, y, def.r || 18);
      this.id = id;
      this.def = def;
      this.params = Object.assign({}, def.params || {});
      this.state = {};
      this.maxHp = Math.max(1, Math.round((def.hp || 10) * (hpScale || 1)));
      this.hp = this.maxHp;
      this.speed = def.speed || 60;
      this.flying = !!def.flying;
      this.contactDamage = def.contactDamage !== undefined ? def.contactDamage : 1;
      this.behavior = B.BEHAVIORS[def.behavior] || B.BEHAVIORS.wander;
      this.spawnDelay = 0.5;  // kurze "Aufwach"-Phase: keine Aktion, kein Kontaktschaden
      this.frozen = 0;        // eingefroren (Stop Generating, Daily Standup)
      this.intangible = false;
      this.invulnerable = false;
      this.alpha = 1;
      this.scale = 1;
      this.frame = 0;
      this.isBoss = false;
      // --- Erweiterungen (siehe Kopfkommentar) ---
      this.spriteName = null;   // abweichendes Sprite (z. B. wuetender Zombie)
      this.noHpBar = false;     // HP-Balken unterdruecken
      this.proxy = null;        // Schaden an dieses Enemy weiterleiten (Wurm-Segment -> Kopf)
      this.proxyMult = 1;       // Faktor fuer weitergeleiteten Schaden
      this.aoeDedupe = false;   // Flaechenschaden ohne Quelle max. einmal pro Tick
      this.aoeStamp = -1;       // Zeitstempel (e.t) des letzten Flaechentreffers
      this.noSeparate = false;  // nicht von anderen Gegnern wegschieben lassen
      this.sayText = null;      // schwebender Text (AI.say)
      this.sayT = 0;
      this.sayDur = 0;
      this.sayColor = null;
      this.sayOffset = 0;       // zusaetzlicher Abstand nach oben (grosse Sprites)
      if (this.behavior.init) this.behavior.init(this, game);
    }

    update(dt, game) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.sayT > 0) this.sayT -= dt;
      if (this.spawnDelay > 0) {
        this.spawnDelay -= dt;
        this.vx = this.vy = 0;
      } else if (this.frozen > 0) {
        this.frozen -= dt;
        this.vx = this.vy = 0;
      } else {
        this.behavior.update(this, dt, game);
      }
      if (!this.static) {
        if (this.moveAndCollide(dt, game.room)) this.state.bumped = true;
      }
      this.separate(game);
      this.touchPlayer(game);
    }

    /** Weiche Abstossung von anderen Gegnern, damit sie nicht auf einem Haufen stehen */
    separate(game) {
      if (this.static || this.noSeparate) return;
      const list = game.room.enemies;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === this || o.dead || o.static) continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const min = this.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.25;
          this.x += (dx / d) * push;
          this.y += (dy / d) * push;
        }
      }
    }

    touchPlayer(game) {
      const p = game.player;
      if (!p || p.dead || this.contactDamage <= 0 || this.spawnDelay > 0 || this.intangible) return;
      if (B.M.dist(this.x, this.y, p.x, p.y) < this.r + p.r * 0.8) {
        if (p.hurt(this.contactDamage, this.def.name, game)) {
          p.knockback(p.x - this.x, p.y - this.y, 380);
          if (this.behavior.onHitPlayer) this.behavior.onHitPlayer(this, game);
        }
      }
    }

    /**
     * Schaden nehmen. Gibt true zurueck, wenn der Treffer "zaehlte" (fuer Knockback).
     * source = Projektil oder Explosion (optional; null/undefined = Flaechenschaden)
     */
    hurt(amount, game, source) {
      if (this.dead || this.intangible) return false;
      // Weiterleitung: z. B. Wurm-Segmente teilen sich den HP-Pool mit dem Kopf
      if (this.proxy) {
        const host = this.proxy;
        if (host.dead) return false;
        return host.takeHit(amount * (this.proxyMult !== undefined ? this.proxyMult : 1), game, source, this);
      }
      return this.takeHit(amount, game, source, this);
    }

    /**
     * Schaden tatsaechlich anwenden. at = das Enemy, das sichtbar getroffen wurde
     * (fuer Blitz und Partikel; bei Weiterleitung das Segment, sonst this).
     */
    takeHit(amount, game, source, at) {
      const hitBody = at || this;
      if (this.dead) return false;
      if (this.invulnerable) { hitBody.flash = 0.04; return false; }
      // Flaechenschaden (keine Quelle) nur einmal pro Tick — verhindert, dass eine Explosion
      // ueber viele Wurm-Segmente den Boss in einem Frame mehrfach trifft
      if (!source && this.aoeDedupe) {
        if (this.aoeStamp === this.t) return false;
        this.aoeStamp = this.t;
      }
      this.hp -= amount;
      hitBody.flash = 0.08;
      if (hitBody !== this) this.flash = Math.max(this.flash, 0.04);
      B.bus.emit('enemyHit', { game, enemy: this, amount, x: hitBody.x, y: hitBody.y, color: this.def.color });
      if (this.hp <= 0) {
        // Verhalten darf den Tod abwenden (z. B. Zombie Process steht einmal wieder auf)
        if (this.behavior.onLethal) {
          let saved = false;
          try { saved = this.behavior.onLethal(this, game, source) === true; } catch (err) { console.error('[enemy]', this.id, 'onLethal failed:', err); }
          if (saved) return true;
        }
        this.die(game);
      }
      return true;
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      if (this.behavior.onDeath) {
        try { this.behavior.onDeath(this, game); } catch (e) { console.error('[enemy]', this.id, 'onDeath failed:', e); }
      }
      B.bus.emit('enemyDeath', { game, enemy: this, x: this.x, y: this.y, color: this.def.color || '#ccc', boss: this.isBoss });
      game.onEnemyKilled(this);
    }

    draw(ctx, game) {
      if (this.behavior.draw) { this.behavior.draw(this, ctx, game); return; }
      if (this.behavior.drawUnder) this.behavior.drawUnder(this, ctx, game);
      AI.drawBody(this, ctx);
      if (this.behavior.drawOver) this.behavior.drawOver(this, ctx, game);
      AI.drawSay(this, ctx);
    }

    /** HP-Balken (wird vom Renderer gezeichnet, wenn der Spieler showHp hat) */
    drawHpBar(ctx) {
      if (this.isBoss || this.noHpBar || this.proxy) return;
      const w = Math.max(24, this.r * 2);
      const x = this.x - w / 2, y = this.y - this.r - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, 6);
      ctx.fillStyle = '#e04848';
      ctx.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 4);
    }
  }

  // ===========================================================================
  // Verhaltensbibliothek
  // ===========================================================================

  /** Bug — irrt zufaellig umher, langsam und tollpatschig */
  B.BEHAVIORS.wander = {
    update(e, dt, game) { AI.wander(e, dt, game, e.speed); },
  };

  /** Laeuft dem Spieler hinterher (Pfadfindung um Hindernisse) — Leaklet, Microservice */
  B.BEHAVIORS.chase = {
    update(e, dt, game) { AI.pathToward(e, game, game.player.x, game.player.y, e.speed); },
  };

  /** Null Pointer — fliegt direkt auf den Spieler zu, mit leichtem Zittern */
  B.BEHAVIORS.fly_chase = {
    update(e, dt, game) {
      const p = game.player;
      const jitter = Math.sin(e.t * 9 + e.x * 0.01) * 0.6;
      const a = Math.atan2(p.y - e.y, p.x - e.x) + jitter;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    },
  };

  /**
   * Memory Leak — verfolgt den Spieler, waechst langsam ("Gets bigger the longer you ignore it")
   * und zerfaellt beim Tod in params.count Kinder (params.child). Voll ausgewachsen: ein Kind mehr.
   * params: { child, count, maxGrow, growRate }
   */
  B.BEHAVIORS.split = {
    init(e) {
      e.state.baseR = e.r;
      e.state.grow = 1;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      const maxG = P.maxGrow || 1.35;
      if (s.grow < maxG) {
        // Wachstum betrifft nur Groesse/Hitbox, nicht die HP
        s.grow = Math.min(maxG, s.grow + dt * (P.growRate || 0.02));
        e.r = s.baseR * s.grow;
        e.scale = s.grow;
      }
      AI.pathToward(e, game, game.player.x, game.player.y, e.speed);
    },
    onDeath(e, game) {
      const P = e.params, s = e.state;
      const full = s.grow >= (P.maxGrow || 1.35) - 0.001;
      const n = (P.count || 2) + (full ? 1 : 0);
      const a0 = game.rng.angle();
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU;
        const c = game.spawnEnemy(P.child || 'leaklet', e.x + Math.cos(a) * e.r * 0.5, e.y + Math.sin(a) * e.r * 0.5);
        if (c) {
          c.spawnDelay = 0.3;                       // kurz benommen, dann geht's los
          c.knockback(Math.cos(a), Math.sin(a), 260); // Kinder spritzen auseinander
        }
      }
    },
  };

  /**
   * Flaky Test — sichtbar (flackert zwischen ✓ und ✗), feuert kurz nach dem Erscheinen einen
   * gezielten Schuss, blendet aus (intangible), teleportiert und blendet wieder ein.
   * Der Schatten springt schon waehrend der Unsichtbarkeit an den neuen Ort (fairer Telegraph).
   * params: { shotSpeed, minD, maxD, shownMin, shownMax }
   */
  B.BEHAVIORS.blink = {
    init(e, game) {
      const s = e.state;
      s.mode = 'shown';
      s.t = game.rng.float(0.8, 1.4);
      s.shot = true;     // beim ersten Erscheinen nicht sofort schiessen (Spawn-Fairness)
      s.shotAt = 0;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      AI.stop(e);
      s.t -= dt;
      // Unregelmaessiges Flackern zwischen den beiden Frames (Haken / Kreuz) — "flaky" eben
      e.frame = (Math.sin(e.t * 11.3) + Math.sin(e.t * 4.7 + 1)) > 0.2 ? 1 : 2;
      switch (s.mode) {
        case 'shown':
          if (!s.shot && s.t <= s.shotAt) {
            s.shot = true;
            AI.shootAt(game, e, game.player, AI.shotSpeed(game, P.shotSpeed || 230));
          }
          if (s.t <= 0) { s.mode = 'fadeOut'; s.t = 0.3; e.intangible = true; }
          break;
        case 'fadeOut':
          e.alpha = Math.max(0.08, s.t / 0.3);
          if (s.t <= 0) {
            // Teleport: freie Kachel mit Abstand zum Spieler
            const pos = AI.findSpot(e, game, P.minD || 160, P.maxD || 400);
            if (pos) {
              e.x = pos.x + game.rng.float(-10, 10);
              e.y = pos.y + game.rng.float(-10, 10);
            }
            s.mode = 'hidden';
            s.t = 0.45;
            e.alpha = 0.08;
          }
          break;
        case 'hidden':
          if (s.t <= 0) { s.mode = 'fadeIn'; s.t = 0.3; }
          break;
        case 'fadeIn':
          e.alpha = Math.max(0.08, 1 - s.t / 0.3);
          if (s.t <= 0) {
            e.alpha = 1;
            e.intangible = false;
            s.mode = 'shown';
            const dur = AI.cooldown(game, game.rng.float(P.shownMin || 1.4, P.shownMax || 2.0));
            s.t = dur;
            s.shot = false;
            s.shotAt = dur - 0.45; // 0.45 s nach dem Erscheinen feuern
          }
          break;
      }
    },
    drawOver(e, ctx) {
      const s = e.state;
      // Telegraph: weisser Ring zieht sich zusammen, kurz bevor der Schuss kommt
      if (s.mode === 'shown' && !s.shot) {
        const left = s.t - s.shotAt; // Zeit bis zum Schuss
        if (left < 0.35) {
          const k = 1 - left / 0.35;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + 0.6 * k) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 18 * (1 - k) + 4, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  };

  /**
   * Merge Conflict — schlendert umher; steht der Spieler auf einer Achse (horizontal/vertikal) in
   * Sichtlinie, gibt es eine sichtbare Ausholbewegung ("<<<<<<<"), dann einen Sprint entlang der Achse
   * bis zur Wand. Danach kurz benommen. Waehrend des Sprints: voller Herz-Schaden, kein Knockback.
   * params: { dashSpeed, windup, align, range }
   */
  B.BEHAVIORS.charge = {
    init(e, game) {
      e.state.mode = 'roam';
      e.state.cd = game.rng.float(0.8, 1.5);
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      switch (s.mode) {
        case 'roam': {
          AI.wander(e, dt, game, e.speed);
          s.cd -= dt;
          if (s.cd > 0) break;
          const dx = p.x - e.x, dy = p.y - e.y, tol = P.align || 26, range = P.range || 560;
          let ax = 0, ay = 0;
          if (Math.abs(dx) < tol && Math.abs(dy) < range) ay = Math.sign(dy) || 1;        // vertikal ausgerichtet
          else if (Math.abs(dy) < tol && Math.abs(dx) < range) ax = Math.sign(dx) || 1;   // horizontal ausgerichtet
          if ((ax || ay) && game.room.lineOfSight(e.x, e.y, p.x, p.y)) {
            s.mode = 'windup';
            s.t = P.windup || 0.5;
            s.dx = ax;
            s.dy = ay;
          }
          break;
        }
        case 'windup':
          // Ausholen: steht still und zittert (Zeichnen), Richtung ist bereits festgelegt
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'dash';
            s.t = 1.2;
            s.bumped = false;
            e.noKnockback = true;
            e.contactDamage = 2; // Charges treffen mit einem vollen Herz (DESIGN.md §5)
          }
          break;
        case 'dash':
          e.vx = s.dx * (P.dashSpeed || 480);
          e.vy = s.dy * (P.dashSpeed || 480);
          s.t -= dt;
          if (s.bumped || s.t <= 0) {
            if (s.bumped) game.shake(3, 0.12);
            s.mode = 'stun';
            s.t = 0.65;
            e.noKnockback = false;
            e.contactDamage = e.def.contactDamage !== undefined ? e.def.contactDamage : 1;
          }
          break;
        case 'stun':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'roam';
            s.cd = game.rng.float(0.5, 1.1);
            s.bumped = true; // neue Wanderrichtung waehlen
          }
          break;
      }
    },
    draw(e, ctx) {
      const s = e.state;
      // Ausholen: Zittern + rote "<<<<<<<"-Markierung in Laufrichtung
      const shake = s.mode === 'windup' ? Math.sin(e.t * 70) * 3 : 0;
      AI.drawBody(e, ctx, { dx: s.dx ? shake : 0, dy: s.dy ? shake : 0, frame: s.mode === 'dash' ? 1 : undefined });
      if (s.mode === 'windup' && typeof B.text === 'function') {
        const k = 1 - Math.max(0, s.t) / (e.params.windup || 0.5);
        B.text(ctx, s.dx < 0 || s.dy < 0 ? '<<<<<<<' : '>>>>>>>', e.x, e.y - e.r - 26, {
          size: 14, align: 'center', color: '#ff5a5a', alpha: 0.5 + 0.5 * k,
        });
        // Richtungspfeil am Boden
        AI.drawRays(ctx, e.x, e.y, [Math.atan2(s.dy, s.dx)], e.r + 6, 40 + 50 * k, 0.4 + 0.5 * k, '#ff5a5a');
      } else if (s.mode === 'stun' && typeof B.text === 'function') {
        B.text(ctx, '?', e.x + Math.sin(e.t * 8) * 6, e.y - e.r - 24, { size: 16, align: 'center', color: '#f3ece6' });
      }
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Jira Ticket — stationaerer Turm. Feuert abwechselnd 4er-Salven im "+"- und "x"-Muster.
   * Kurz vorher zeigen gestrichelte Strahlen die naechsten Schussrichtungen an.
   * params: { interval, shotSpeed }
   */
  B.BEHAVIORS.turret = {
    init(e, game) {
      e.static = true;
      e.noKnockback = true;
      e.state.cd = game.rng.float(0.9, 1.9);
      e.state.cross = game.rng.chance(0.5);
      e.state.angles = [0, 0, 0, 0]; // wiederverwendetes Array fuer den Telegraph
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      AI.stop(e);
      s.cd -= dt;
      // "Pumpen" kurz vor dem Schuss
      e.scale = s.cd < 0.35 ? 1 + (0.35 - Math.max(0, s.cd)) * 0.45 : 1;
      if (s.cd <= 0) {
        AI.ring(game, e, 4, AI.shotSpeed(game, P.shotSpeed || 190), s.cross ? Math.PI / 4 : 0);
        s.cross = !s.cross;
        s.cd = AI.cooldown(game, P.interval || 1.7);
        e.scale = 1;
      }
    },
    drawUnder(e, ctx) {
      const s = e.state;
      if (s.cd < 0.45) {
        const off = s.cross ? Math.PI / 4 : 0;
        for (let i = 0; i < 4; i++) s.angles[i] = off + (i * Math.PI) / 2;
        AI.drawRays(ctx, e.x, e.y, s.angles, e.r + 4, 34, (0.45 - Math.max(0, s.cd)) / 0.45 * 0.8, '#ff6b6b');
      }
    },
  };

  /**
   * Deprecation Warning — fliegt in Distanz um den Spieler herum und feuert gelegentlich einen
   * gezielten Schuss (mit "!"-Telegraph). Richtungswechsel bei Wandkontakt.
   * params: { radiusMin, radiusMax, shotSpeed, interval }
   */
  B.BEHAVIORS.orbit = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.dir = game.rng.chance(0.5) ? 1 : -1;
      s.radius = game.rng.float(P.radiusMin || 160, P.radiusMax || 220);
      s.cd = game.rng.float(1.4, 2.4);
      s.tell = 0;
      s.tgt = { x: 0, y: 0 }; // wiederverwendeter Zielpunkt (keine Allokation pro Frame)
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.bumped) { s.dir = -s.dir; s.bumped = false; }
      // Zielpunkt etwas voraus auf dem Kreis um den Spieler
      const a = Math.atan2(e.y - p.y, e.x - p.x) + s.dir * 0.55;
      AI.clampToRoom(p.x + Math.cos(a) * s.radius, p.y + Math.sin(a) * s.radius, e.r + 4, s.tgt);
      const d = Math.hypot(s.tgt.x - e.x, s.tgt.y - e.y);
      AI.toward(e, s.tgt.x, s.tgt.y, e.speed * Math.min(1, d / 40 + 0.3));
      // Schiessen: erst Telegraph ("!"), dann gezielter Schuss
      if (s.tell > 0) {
        s.tell -= dt;
        if (s.tell <= 0) {
          AI.shootAt(game, e, p, AI.shotSpeed(game, P.shotSpeed || 220), { color: '#f0a030' });
          s.cd = AI.cooldown(game, game.rng.float((P.interval || 2.4) - 0.5, (P.interval || 2.4) + 0.5));
        }
      } else {
        s.cd -= dt;
        if (s.cd <= 0) s.tell = 0.45;
      }
      // Blinken (Frame-Wechsel) waehrend des Telegraphs
      e.frame = s.tell > 0 ? (Math.floor(e.t * 16) % 2 ? 1 : 2) : 0;
    },
    drawOver(e, ctx) {
      if (e.state.tell > 0) AI.drawMark(ctx, '!', e.x, e.y - e.r - 6, e.t, '#ffcf4d', 20);
    },
  };

  /**
   * Spaghetti Code — wandert langsam umher, bleibt alle paar Sekunden stehen, wackelt (Telegraph)
   * und feuert einen 3er-Faecher auf den Spieler.
   * params: { count, spread, shotSpeed, interval }
   */
  B.BEHAVIORS.shooter = {
    init(e, game) {
      e.state.mode = 'move';
      e.state.cd = game.rng.float(1.2, 2.4);
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.mode === 'tell') {
        AI.stop(e);
        s.t -= dt;
        e.scale = 1 + Math.sin(e.t * 40) * 0.06; // Wackeln
        if (s.t <= 0) {
          AI.fan(game, e, p, P.count || 3, P.spread || 0.3, AI.shotSpeed(game, P.shotSpeed || 200), { color: '#e8a33a' });
          s.mode = 'move';
          s.cd = AI.cooldown(game, game.rng.float((P.interval || 2.5) - 0.4, (P.interval || 2.5) + 0.4));
          e.scale = 1;
        }
        return;
      }
      AI.wander(e, dt, game, e.speed);
      s.cd -= dt;
      if (s.cd <= 0) {
        // Nur schiessen, wenn der Spieler in Reichweite und in Sichtlinie ist
        if (AI.dist(e, p) < 620 && game.room.lineOfSight(e.x, e.y, p.x, p.y)) { s.mode = 'tell'; s.t = 0.42; }
        else s.cd = 0.3;
      }
    },
  };

  /**
   * Zombie Process — verfolgt den Spieler. Beim ersten "Tod" bleibt er liegen (intangible, "zZz"),
   * steht nach params.downTime Sekunden mit params.reviveHp (50 %) wieder auf und ist schneller.
   * params: { reviveHp, downTime, angrySprite }
   */
  B.BEHAVIORS.revive = {
    init(e) {
      e.state.revived = false;
      e.state.down = 0;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      if (s.down > 0) {
        AI.stop(e);
        s.down -= dt;
        if (s.down <= 0) {
          // Wiederauferstehung: halbe HP, schneller, wuetendes Sprite
          e.hp = Math.max(1, Math.round(e.maxHp * (P.reviveHp || 0.5)));
          e.intangible = false;
          e.speed *= 1.35;
          if (P.angrySprite && B.hasSprite(P.angrySprite)) e.spriteName = P.angrySprite;
          e.flash = 0.2;
          AI.say(e, 'SIGCONT', 1.0, '#ff7a6a');
          B.bus.emit('enemyRevive', { game, enemy: e, x: e.x, y: e.y });
        }
        return;
      }
      AI.pathToward(e, game, game.player.x, game.player.y, e.speed);
    },
    onLethal(e) {
      const s = e.state;
      if (s.revived) return false; // zweites Mal: endgueltig tot
      s.revived = true;
      s.down = e.params.downTime || 1.8;
      e.hp = 0;
      e.intangible = true;         // liegt am Boden: Schuesse fliegen drueber, kein Kontaktschaden
      AI.stop(e);
      AI.say(e, 'zZz', s.down, '#a8b0b8');
      return true;
    },
    draw(e, ctx) {
      const s = e.state;
      if (s.down > 0) {
        // Liegend (um 90° gedreht), halbtransparent, mit Hinweis
        AI.drawBody(e, ctx, { rotation: Math.PI / 2, alpha: 0.7, dy: 6, flipX: false });
        if (typeof B.text === 'function') {
          B.text(ctx, 'kill -9?', e.x, e.y + e.r + 6, { size: 12, align: 'center', color: '#a8b0b8', alpha: 0.8 });
        }
      } else {
        AI.drawBody(e, ctx);
      }
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Scope Creep — langsamer Verfolger, der stetig waechst (Radius UND HP, gedeckelt).
   * Ab 1.5-facher Groesse "streut" er regelmaessig einen langsamen Ring (Feature Creep).
   * params: { maxGrow, rate, hpFactor, ringAt, ringInterval, shotSpeed }
   */
  B.BEHAVIORS.grow = {
    init(e) {
      const s = e.state;
      s.baseR = e.r;
      s.baseMax = e.maxHp;
      s.g = 1;
      s.cd = 2;
      s.tell = 0;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      const maxG = P.maxGrow || 1.9;
      if (s.g < maxG) {
        s.g = Math.min(maxG, s.g + dt * (P.rate || 0.035));
        e.r = s.baseR * s.g;
        e.scale = s.g;
        // HP waechst mit: neue Max-HP minus alte Max-HP wird auch auf die aktuellen HP addiert
        const newMax = Math.round(s.baseMax * (1 + (s.g - 1) * (P.hpFactor || 1.6)));
        if (newMax > e.maxHp) { e.hp += newMax - e.maxHp; e.maxHp = newMax; }
      }
      // Groesser = etwas langsamer
      AI.pathToward(e, game, game.player.x, game.player.y, e.speed * (1.15 - 0.15 * s.g));
      // Feature Creep: ab einer Mindestgroesse regelmaessig ein langsamer Ring
      if (s.g >= (P.ringAt || 1.5)) {
        if (s.tell > 0) {
          s.tell -= dt;
          e.scale = s.g * (1 + Math.sin(e.t * 36) * 0.05);
          if (s.tell <= 0) {
            AI.ring(game, e, 6, AI.shotSpeed(game, P.shotSpeed || 150), game.rng.angle(), { color: '#8bc34a' });
            s.cd = AI.cooldown(game, P.ringInterval || 3.6);
          }
        } else {
          s.cd -= dt;
          if (s.cd <= 0) s.tell = 0.45;
        }
      }
    },
  };

  /**
   * Hallucination — getarnt als Pickup. Die Tarnung wird beim Erzeugen aus derselben Tabelle gewuerfelt wie
   * die echten losen Pickups in Kampfraeumen (B.LOOSE_LOOT in pickup.js: Credit, Half Heart, Approval) und
   * sieht exakt so aus (gleiches Sprite, gleicher Radius/Schatten, gleiches Wippen). Getarnt ist sie
   * unberuehrbar, harmlos und blockiert das Raum-Clearing nicht. Kommt der Spieler naeher als
   * params.revealDist, enttarnt sie sich (kurze Schrecksekunde) und jagt als schneller Flieger.
   * Eine Explosion, die ein echtes Pickup wegschleudern wuerde (1.5 x Radius, siehe game.explode),
   * enttarnt sie ebenfalls — sonst waere "bleibt nach der Bombe liegen" ein Erkennungszeichen.
   * Wird sie in einem bereits geclearten Raum enttarnt, blockiert sie die Tueren weiterhin nicht
   * (sonst koennte der Raum nach dem Kill nie wieder "geclearet" werden — Softlock-Schutz).
   * params: { revealDist, disguises? }  (disguises: eigene Typ->Gewicht-Tabelle statt B.LOOSE_LOOT.types)
   */
  // Ausruf beim Enttarnen, passend zur Tarnung
  const MIMIC_REVEAL_TEXT = { credit: 'NOT MONEY', heart_half: 'NOT HEALTHY', approval: 'NOT APPROVED' };

  function mimicReveal(e, game) {
    const s = e.state;
    const pt = B.PICKUP_TYPES[s.disguise];
    s.mode = 'reveal';
    s.t = 0.4;
    e.r = s.realR;
    e.flying = true;
    e.static = false;
    e.intangible = false;
    e.noHpBar = false;
    e.ignoreForClear = !!(game.room && game.room.cleared);
    e.flash = 0.12;
    game.shake(3, 0.12);
    AI.say(e, MIMIC_REVEAL_TEXT[s.disguise] || 'NOT REAL', 1.1, (pt && pt.color) || '#f2c14e');
    B.bus.emit('enemyReveal', { game, enemy: e, x: e.x, y: e.y });
  }

  B.BEHAVIORS.mimic = {
    init(e, game) {
      const s = e.state, P = e.params;
      const table = P.disguises || (B.LOOSE_LOOT && B.LOOSE_LOOT.types) || { credit: 1 };
      const types = Object.keys(table).filter((t) => B.PICKUP_TYPES[t]);
      s.disguise = types.length && game && game.rng ? game.rng.weighted(types, (t) => table[t]) : 'credit';
      const pt = B.PICKUP_TYPES[s.disguise];
      s.mode = 'disguised';
      s.realR = e.r;
      e.r = (pt && pt.r) || 11;    // Radius des getarnten Pickups -> identischer Schatten
      e.flying = false;            // Pickups schweben nicht
      e.static = true;
      e.intangible = true;         // Schuesse/Explosionen ignorieren die Tarnung
      e.ignoreForClear = true;
      e.contactDamage = 0;
      e.noHpBar = true;            // "Code Review" soll die Tarnung nicht verraten
      e.spawnDelay = 0;            // Pickups blenden nicht ein
    },
    onExplosion(e, game, x, y, radius) {
      if (e.state.mode === 'disguised' && B.M.dist(x, y, e.x, e.y) < radius * 1.5) mimicReveal(e, game);
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.mode === 'disguised') {
        AI.stop(e);
        if (AI.dist(e, p) < (P.revealDist || 120)) mimicReveal(e, game); // Enttarnung!
        return;
      }
      if (s.mode === 'reveal') {
        // Schrecksekunde: steht still, dann geht die Jagd los (fair)
        AI.stop(e);
        s.t -= dt;
        if (s.t <= 0) {
          s.mode = 'chase';
          e.contactDamage = e.def.contactDamage !== undefined ? e.def.contactDamage : 1;
        }
        return;
      }
      // Schneller Verfolger mit leichtem Schlingern
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 7) * 0.35;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    },
    draw(e, ctx) {
      if (e.state.mode === 'disguised') {
        // Exakt wie das getarnte Pickup zeichnen (siehe pickup.js: Wippen mit sin(t*4)*2)
        const bob = Math.sin(e.t * 4) * 2;
        const pt = B.PICKUP_TYPES[e.state.disguise] || B.PICKUP_TYPES.credit;
        if (pt && B.hasSprite(pt.sprite)) {
          B.drawSprite(ctx, pt.sprite, e.x, e.y + bob);
        } else {
          const col = (pt && pt.color) || '#f2c14e';
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(e.x, e.y + bob, e.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(e.x - e.r * 0.3, e.y + bob - e.r * 0.3, e.r * 0.3, 0, TAU);
          ctx.fill();
        }
        return;
      }
      AI.drawBody(e, ctx, { frame: e.state.mode === 'reveal' ? 1 : undefined });
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Graphics Glitch — steht flackernd herum und springt dann ruckartig 1–3 Kacheln in eine der vier
   * Himmelsrichtungen (immer auf eine Kachelmitte, nie durch Hindernisse). Telegraph: params.warn Sekunden
   * vor dem Sprung erscheint ein halbtransparentes "Geisterbild" am Zielort und das Sprite flackert.
   * Mit Chance params.chaseBias waehlt er die Richtung, die ihn dem Spieler am naechsten bringt, sonst eine
   * zufaellige (er soll bedrohlich, aber unberechenbar sein).
   * Trifft er den Spieler (normaler Kontaktschaden), verfremdet er fuer params.hudGlitch Sekunden einen
   * Bereich des HUD (game.glitchHud; gezeichnet in hud.js).
   * params: { stepMin, stepMax, idleMin, idleMax, warn, jump, chaseBias, hudGlitch }
   */
  function glitchTarget(e, game, P) {
    const room = game.room, p = game.player;
    const here = room.worldToTile(e.x, e.y);
    const options = [];
    for (const dir of ['up', 'down', 'left', 'right']) {
      const D = B.DIRS[dir];
      const max = game.rng.int(P.stepMin || 1, P.stepMax || 3);
      let n = 0;
      for (let k = 1; k <= max; k++) {
        if (room.isSolid(here.c + D.dx * k, here.r + D.dy * k, 'walk', false)) break;
        n = k;
      }
      if (n > 0) {
        const tc = room.tileCenter(here.c + D.dx * n, here.r + D.dy * n);
        options.push({ x: tc.x, y: tc.y, d: B.M.dist(tc.x, tc.y, p.x, p.y) });
      }
    }
    if (!options.length) return null;
    if (game.rng.chance(P.chaseBias || 0)) return options.reduce((a, b) => (b.d < a.d ? b : a));
    return game.rng.pick(options);
  }

  B.BEHAVIORS.glitch = {
    init(e, game) {
      e.state.mode = 'idle';
      e.state.t = game.rng.float(0.6, 1.2);
    },
    update(e, dt, game) {
      const s = e.state, P = e.params;
      s.t -= dt;
      switch (s.mode) {
        case 'idle':
          AI.stop(e);
          e.frame = 0; // normale 6-fps-Animation
          if (s.t <= 0) {
            const tgt = glitchTarget(e, game, P);
            if (tgt) { s.mode = 'warn'; s.t = P.warn || 0.4; s.tx = tgt.x; s.ty = tgt.y; } else s.t = 0.3;
          }
          break;
        case 'warn':
          AI.stop(e);
          e.frame = Math.floor(e.t * 20) % 2 ? 1 : 2; // hektisches Flackern = Telegraph
          if (s.t <= 0) {
            const T = P.jump || 0.12;
            s.mode = 'jump';
            s.t = T;
            s.bumped = false;
            e.vx = (s.tx - e.x) / T;
            e.vy = (s.ty - e.y) / T;
          }
          break;
        case 'jump':
          if (s.t <= 0 || s.bumped) {
            AI.stop(e);
            s.mode = 'idle';
            s.bumped = false;
            s.t = AI.cooldown(game, game.rng.float(P.idleMin || 0.9, P.idleMax || 1.6));
          }
          break;
      }
    },
    onHitPlayer(e, game) {
      AI.say(e, 'Is it supposed to look like this...?', 2.2, '#e080d8');
      if (typeof game.glitchHud === 'function') game.glitchHud(e.params.hudGlitch || 7);
    },
    drawUnder(e, ctx) {
      const s = e.state;
      if (s.mode !== 'warn') return;
      // Geisterbild am Zielort (mit leichtem Farbversatz, wie ein kaputter Frame)
      const k = 1 - Math.max(0, s.t) / (e.params.warn || 0.4);
      AI.drawBody(e, ctx, { dx: s.tx - e.x - 3, dy: s.ty - e.y, alpha: 0.18 + 0.25 * k, frame: 2, noFrost: true });
      AI.drawBody(e, ctx, { dx: s.tx - e.x + 3, dy: s.ty - e.y, alpha: 0.12 + 0.2 * k, frame: 1, noFrost: true });
    },
  };

  /**
   * Race Condition — kommt immer zu zweit (pack: 2). Laeuft im Zickzack auf den Spieler zu,
   * wechselt die Seite in unregelmaessigen Abstaenden und sprintet gelegentlich.
   * Stirbt einer, wird der andere schneller ("won the race").
   * params: { flipMin, flipMax, sprintChance }
   */
  B.BEHAVIORS.zigzag = {
    init(e, game) {
      const s = e.state;
      s.sign = game.rng.chance(0.5) ? 1 : -1;
      s.flip = game.rng.float(0.15, 0.4);
      s.sprint = 0;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      const d = e.flying ? B.M.norm(p.x - e.x, p.y - e.y) : game.room.flowDir(e.x, e.y, p.x, p.y);
      s.flip -= dt;
      if (s.flip <= 0 || s.bumped) {
        s.sign = -s.sign;
        s.flip = game.rng.float(P.flipMin || 0.15, P.flipMax || 0.42);
        s.bumped = false;
        if (game.rng.chance(P.sprintChance || 0.2)) s.sprint = 0.35;
      }
      if (s.sprint > 0) s.sprint -= dt;
      const sp = e.speed * (s.sprint > 0 ? 1.5 : 1);
      // Vorwaertsanteil + seitlicher Zickzack-Anteil (senkrecht zur Laufrichtung)
      e.vx = (d.x * 0.8 - d.y * s.sign * 0.75) * sp;
      e.vy = (d.y * 0.8 + d.x * s.sign * 0.75) * sp;
    },
    onDeath(e, game) {
      // Der Zwilling "gewinnt das Rennen"
      for (const o of game.room.enemies) {
        if (o === e || o.dead || o.def !== e.def || o.state.won) continue;
        o.state.won = true;
        o.speed *= 1.3;
        AI.say(o, 'won the race', 1.0, '#ffcf4d');
      }
    },
  };

  // ===========================================================================
  // Forgotten Branches: Stale Branch
  // ===========================================================================

  // Schichten ueber dem Kopf (Abstand nach oben ab e.y - e.r), damit sich nichts ueberdeckt:
  //   HP-Balken (Code Review)   -14 .. -8   (fest in Enemy.drawHpBar)
  //   Commit-Zaehler "-N"       Mitte -30, Pixelschrift scale 2 = 14 px plus Kontur; beim Hochzaehlen bis
  //                             x1.36 aufgeploppt -> hoechstens -40.5 .. -19.5, also >= 4 px ueber dem Balken
  //   Sprechtext ("STALE")      Oberkante -30 - sayOffset = -62 (steigt danach weiter), 15 px hoch ->
  //                             Unterkante -47, also >= 6 px ueber dem aufgeploppten Zaehler
  const STALE_COUNTER_Y = 30;
  const STALE_SAY_OFFSET = 32;

  // Altersstufen: Sprite-Suffix, Laubfarben (B.BRANCH_LEAVES-Schluessel) und Farbe des Commit-Zaehlers.
  // Gelb/Braun-Zaehler bleiben bewusst "neutral" warm; erst kahl (= gefaehrlich) wird er Bernstein.
  const STALE_STAGES = [
    { suffix: '', leaves: 'green', count: '#c8e6a0' },
    { suffix: '_yellow', leaves: 'yellow', count: '#f0d264' },
    { suffix: '_brown', leaves: 'brown', count: '#d9a066' },
    { suffix: '_bare', leaves: null, count: '#ffcf4d' },
  ];

  /** Altersstufe 0..3 aus dem Alter (Anzahl ueberschrittener Schwellen in params.stageAt) */
  function staleStage(e) {
    const at = e.params.stageAt || [5, 10, 15];
    let st = 0;
    while (st < at.length && e.state.age >= at[st]) st++;
    return Math.min(st, STALE_STAGES.length - 1);
  }

  /** Laubfarben einer Stufe (Fallback, falls die Sprite-Datei sie nicht registriert hat) */
  function staleLeafColors(stage) {
    const key = STALE_STAGES[stage] && STALE_STAGES[stage].leaves;
    const BL = B.BRANCH_LEAVES;
    return (key && BL && BL[key]) || ['#6f9a3c'];
  }

  /**
   * Stale Branch — altert sichtbar und wird dabei schneller; kahl springt er in gerader Linie.
   *
   *   chase   laeuft per Flow-Field auf den Spieler zu; Tempo steigt linear von e.speed auf params.maxSpeed
   *           (nach params.rampTime Sekunden Alter). Kahl laeuft nebenher der Sprung-Countdown.
   *   windup  0.5 s Zittern auf der Stelle, Richtung ist schon fest (Ziellinie wird gezeichnet) -> 'enemyWindup'
   *   lunge   gerader Sprint mit params.lungeSpeed bis zur Wand oder params.lungeTime; dabei kein Knockback und
   *           ein volles Herz Kontaktschaden (Charge-Konvention wie Merge Conflict, DESIGN.md §5)
   *   recover kurz stehen bleiben, dann wieder chase mit neuer Pause (game.rng)
   *
   * Das Alter laeuft nur, waehrend das Verhalten aktiv ist: Spawn-Verzoegerung und Einfrieren (Stop Generating,
   * Daily Standup) halten es an. Bus-Events (nur fuer Effekte/Sound): 'enemyShed' { colors, count, big }
   * (Blaetter fallen: big = Stufenwechsel, sonst einzelnes Blatt) und 'enemyWindup' (Sprung-Warnung).
   * params: siehe data/enemies.js (stale_branch)
   */
  B.BEHAVIORS.stale = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.age = game.rng.float(0, P.headStart || 0);  // leicht versetztes Altern mehrerer Exemplare
      s.base = game.rng.int(1, 4);                  // Start-Rueckstand in Commits
      s.stage = staleStage(e);
      s.mode = 'chase';
      s.cd = 0.8;                                   // erster Sprung kurz nach dem Kahlwerden
      s.leafT = 0.9;                                // Takt fuer einzelne fallende Blaetter (gelb/braun)
      s.pop = 0;                                    // kurzes Aufploppen des Zaehlers beim Hochzaehlen
      s.ticks = 0;
      e.sayOffset = STALE_SAY_OFFSET;               // Sprechtext ueber dem Commit-Zaehler (siehe Schichten unten)
      e.spriteName = e.def.sprite + STALE_STAGES[s.stage].suffix;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      s.age += dt;
      if (s.pop > 0) s.pop -= dt;

      // Rueckstand waechst: alle tick Sekunden ein Commit mehr (Zaehler ploppt kurz auf)
      const ticks = Math.floor(s.age / (P.tick || 2.5));
      if (ticks !== s.ticks) { s.ticks = ticks; s.pop = 0.18; }

      // Altersstufe wechseln: Sprite tauschen, die Blaetter der alten Stufe fallen ab
      const st = staleStage(e);
      if (st !== s.stage) {
        B.bus.emit('enemyShed', { game, enemy: e, x: e.x, y: e.y - 14, colors: staleLeafColors(s.stage), count: 7, big: true });
        s.stage = st;
        e.spriteName = e.def.sprite + STALE_STAGES[st].suffix;
        if (st === STALE_STAGES.length - 1) { s.cd = 0.8; AI.say(e, 'STALE', 1.0, '#ff7a5c'); }
      } else if (st === 1 || st === 2) {
        // Welkes Laub rieselt nebenbei (rein optisch; fester Takt statt Zufall, damit kein RNG-Zug noetig ist)
        s.leafT -= dt;
        if (s.leafT <= 0) {
          s.leafT = 0.8;
          B.bus.emit('enemyShed', { game, enemy: e, x: e.x, y: e.y - 14, colors: staleLeafColors(st), count: 1, big: false });
        }
      }

      const ramp = B.M.clamp(s.age / (P.rampTime || 20), 0, 1);
      const spd = B.M.lerp(e.speed, P.maxSpeed || 150, ramp);
      const bare = st === STALE_STAGES.length - 1;

      switch (s.mode) {
        case 'chase':
          AI.pathToward(e, game, p.x, p.y, spd);
          if (!bare) break;
          s.cd -= dt;
          if (s.cd > 0) break;
          if (AI.dist(e, p) < (P.lungeRange || 460) && game.room.lineOfSight(e.x, e.y, p.x, p.y)) {
            s.mode = 'windup';
            s.t = P.windup || 0.5;
            s.ang = AI.angleTo(e, p); // Richtung steht ab hier fest — seitlich ausweichen ist die Antwort
            B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
          } else {
            s.cd = 0.3; // kein freier Weg: gleich nochmal pruefen
          }
          break;
        case 'windup':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'lunge';
            s.t = P.lungeTime || 0.42;
            s.bumped = false;
            e.noKnockback = true;
            e.contactDamage = 2;
          }
          break;
        case 'lunge': {
          const ls = P.lungeSpeed || 430;
          e.vx = Math.cos(s.ang) * ls;
          e.vy = Math.sin(s.ang) * ls;
          s.t -= dt;
          if (s.bumped || s.t <= 0) {
            if (s.bumped) game.shake(2, 0.1);
            s.mode = 'recover';
            s.t = P.recover || 0.5;
            e.noKnockback = false;
            e.contactDamage = e.def.contactDamage !== undefined ? e.def.contactDamage : 1;
          }
          break;
        }
        case 'recover':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'chase';
            s.cd = game.rng.float(P.cdMin || 2.2, P.cdMax || 3.4);
          }
          break;
      }
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      const winding = s.mode === 'windup';
      const k = winding ? 1 - Math.max(0, s.t) / (P.windup || 0.5) : 0;
      // Zittern vor dem Sprung (quer zur Sprungrichtung, damit es nicht wie Anlauf aussieht)
      const sh = winding ? Math.sin(e.t * 75) * (1.5 + 2 * k) : 0;
      const dx = winding ? -Math.sin(s.ang) * sh : 0, dy = winding ? Math.cos(s.ang) * sh : 0;
      // Ziellinie am Boden: warm (Koralle), wird zum Absprung hin deutlicher
      if (winding) AI.drawRays(ctx, e.x, e.y, [s.ang], e.r + 6, 60 + 110 * k, 0.35 + 0.55 * k, '#ff7a5c');
      AI.drawBody(e, ctx, { dx, dy, frame: s.mode === 'lunge' ? 1 : undefined });
      // Commit-Zaehler "-N" ueber dem Kopf (Pixelschrift); blinkt beim Zittern korallrot
      if (B.pixelText && e.spawnDelay <= 0) {
        const stage = STALE_STAGES[s.stage] || STALE_STAGES[0];
        const col = winding && Math.floor(e.t * 16) % 2 ? '#ff7a5c' : stage.count;
        const n = s.base + s.ticks;
        const pop = s.pop > 0 ? 1 + s.pop * 2 : 1;
        ctx.save();
        ctx.translate(e.x, e.y - e.r - STALE_COUNTER_Y);
        ctx.scale(pop, pop);
        B.pixelText(ctx, '-' + n, 0, 0, { scale: 2, align: 'center', baseline: 'middle', color: col, outline: '#16240f', alpha: e.alpha });
        ctx.restore();
      }
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // Forgotten Branches: Detached HEAD (Paar aus Koerper 'detached_body' und Kopf 'detached_tag')
  // ===========================================================================
  //
  // Verknuepfung: e.state.partner zeigt auf das jeweils andere Enemy (getrennte HP, KEIN proxy).
  // Der Koerper erzeugt den Kopf in seinem init (wie der Rogue Agent Swarm seine Geschwister). Jeder Teil
  // prueft in seinem update, ob der Partner tot ist, wechselt dann in den Solo-Modus und setzt state.partner
  // auf null (keine Referenzen auf tote Gegner behalten). Nichts davon spawnt beim Tod etwas nach, daher
  // hinterlaesst debug.killAll nichts und der Raum gilt als geraeumt, sobald beide tot sind.
  //
  // Leine ("Tether"): gestrichelte Linie vom leeren Sockel des Koerpers zum Kopf, gezeichnet in drawUnder des
  // Koerpers. Reisst sie (ein Teil stirbt), zeichnet der Ueberlebende 0.5 s lang einen zurueckschnellenden
  // Leinenrest in Richtung der letzten Partner-Position (state.snapT / snapX / snapY).

  const TETHER_COLOR = '#e8c890';   // helles Holz/Bindfaden — harmlos, kein Warnton
  const HEAD_SHOT = '#ffcf4d';      // Bernstein: gefaehrlich (auf gruenem Boden gut sichtbar)
  const SNAP_TIME = 0.5;

  /** Lebt der Partner noch? (robust gegen fehlende/tote Referenzen) */
  function headPartner(e) {
    const o = e.state.partner;
    return o && !o.dead ? o : null;
  }

  /** Leinenrest nach dem Reissen: kurzer gestrichelter Strich, der zum Ueberlebenden zurueckschnellt */
  function drawSnap(e, ctx, ox, oy) {
    const s = e.state;
    if (!(s.snapT > 0)) return;
    const k = s.snapT / SNAP_TIME;                 // 1 -> 0
    const a = Math.atan2(s.snapY - (e.y + oy), s.snapX - (e.x + ox));
    const len = 46 * k;
    ctx.save();
    ctx.globalAlpha = 0.9 * k;
    ctx.strokeStyle = TETHER_COLOR;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(e.x + ox + Math.cos(a) * e.r * 0.6, e.y + oy + Math.sin(a) * e.r * 0.6);
    // leicht gekraeuselt: das Ende schwingt seitlich nach
    const wob = Math.sin(k * 20) * 8 * k;
    ctx.lineTo(e.x + ox + Math.cos(a) * len - Math.sin(a) * wob, e.y + oy + Math.sin(a) * len + Math.cos(a) * wob);
    ctx.stroke();
    ctx.restore();
  }

  /** Partner verloren: Leinenrest-Animation vorbereiten und Referenz loesen */
  function loseHeadPartner(e) {
    const s = e.state, o = s.partner;
    if (o) { s.snapT = SNAP_TIME; s.snapX = o.x; s.snapY = o.y; }
    s.partner = null;
  }

  /**
   * Koerper — ein stummeliger Baumstumpf auf Zweigbeinen mit leerem, gluehendem Sockel (dort gehoert der Kopf hin).
   * Mit Kopf: laeuft langsam per Flow-Field auf den Spieler zu. Ohne Kopf: irrt ziellos umher
   * ("where is my HEAD?"), Sockel erloschen, nur noch Kontaktschaden (schiessen kann er ohnehin nie).
   * params: { head (Gegner-ID des Kopfes), lostSpeed, spawnDist }
   */
  B.BEHAVIORS.detached_body = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.mode = 'linked';
      s.sayCd = 0;
      // Kopf erzeugen. Er fliegt (Felsen/Gruben egal), also reicht es, den Startpunkt in den Innenraum zu klemmen.
      // game.room ist hier schon der Raum, in den der Koerper gleich eingefuegt wird (populate/debug.spawn).
      if (!game || !game.room || !P.head || !B.ENEMIES[P.head]) return;
      const a = game.rng.angle();
      const d = P.spawnDist || 100;
      const pos = AI.clampToRoom(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 30);
      const head = game.spawnEnemy(P.head, pos.x, pos.y);
      if (!head) return;
      head.spawnDelay = e.spawnDelay;   // beide erwachen gleichzeitig
      head.state.partner = e;
      head.state.orbitA = a;            // dort weiterkreisen, wo er erschienen ist
      s.partner = head;
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.snapT > 0) s.snapT -= dt;
      if (s.mode === 'linked' && !headPartner(e)) {
        // Kopf ist weg: Sockel erlischt, Koerper verliert die Orientierung
        loseHeadPartner(e);
        s.mode = 'lost';
        e.spriteName = 'enemy_detached_head_lost';
        e.speed = P.lostSpeed || 38;
        AI.say(e, 'where is my HEAD?', 1.6, '#e8dcc0');
        s.sayCd = 5;
      }
      if (s.mode === 'lost') {
        AI.wander(e, dt, game, e.speed);
        // gelegentlich erneut fragen (reine Anzeige, fester Takt — kein RNG noetig)
        s.sayCd -= dt;
        if (s.sayCd <= 0) { AI.say(e, 'where is my HEAD?', 1.4, '#e8dcc0'); s.sayCd = 5; }
        return;
      }
      AI.pathToward(e, game, p.x, p.y, e.speed);
    },

    onDeath(e) {
      // Referenz loesen; der Kopf bemerkt den Tod selbst in seinem naechsten update (Leine reisst dort)
      e.state.partner = null;
    },

    drawUnder(e, ctx) {
      const s = e.state;
      const head = headPartner(e);
      if (head) {
        // Gestrichelte Leine vom Sockel (oben auf dem Stumpf) zum Kopf; die Striche "fliessen" zum Kopf hin
        const sx = e.x, sy = e.y - 20;
        const hx = head.x, hy = head.y + (head.state.bob || 0);
        const a = Math.atan2(hy - sy, hx - sx);
        const len = Math.hypot(hx - sx, hy - sy) - head.r * 0.7;
        if (len > 4) {
          const appear = e.spawnDelay > 0 ? 1 - e.spawnDelay / 0.5 : 1;
          ctx.save();
          ctx.globalAlpha = 0.75 * Math.max(0, Math.min(1, appear));
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(22,36,15,0.8)';   // dunkle Unterlage, damit die Linie auf Moos lesbar bleibt
          ctx.setLineDash([7, 6]);
          ctx.lineDashOffset = -e.t * 24;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = TETHER_COLOR;
          ctx.stroke();
          ctx.restore();
        }
      }
      drawSnap(e, ctx, 0, -20);
    },
  };

  /**
   * Kopf — schwebender Holz-Anhaenger in Pfeilform mit einem grossen Auge; die Spitze zeigt zum Spieler.
   * Mit Koerper: kreist in 80–140 px Abstand HINTER dem Koerper (vom Spieler aus gesehen; schwingt seitlich
   * hin und her), wippt auf und ab und feuert alle ~2.2 s einen langsamen, gezielten Bernstein-Schuss.
   * Warnung: das Auge gluet 0.4 s vorher bernsteinfarben auf.
   * Ohne Koerper ("HEAD detached!"): flattert ziellos und hektisch durch den Raum und schiesst alle ~1.2 s
   * (gleiche Warnung). Wird er allein gespawnt (debug), ist er von Anfang an losgeloest.
   * params: { orbitMin, orbitMax, interval, panicInterval, warn, shotSpeed, panicSpeed }
   */
  B.BEHAVIORS.detached_tag = {
    init(e, game) {
      const s = e.state;
      s.mode = 'linked';                  // wird im ersten update zu 'panic', falls kein Partner gesetzt wurde
      s.cd = game.rng.float(1.2, 2.2);    // erster Schuss gestaffelt, damit Paare nicht im Gleichtakt feuern
      s.swing = game.rng.float(0, TAU);
      s.orbitA = game.rng.angle();
      s.warn = false;
      s.bob = 0;
      s.dir = 0;
      s.turnT = 0;
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (s.snapT > 0) s.snapT -= dt;
      s.bob = Math.sin(e.t * 4.2) * 3;

      if (s.mode === 'linked' && !headPartner(e)) {
        // Koerper ist weg: Leine reisst, der Kopf geraet in Panik
        loseHeadPartner(e);
        s.mode = 'panic';
        s.dir = game.rng.angle();
        s.turnT = 0;
        s.cd = Math.min(s.cd, AI.cooldown(game, P.panicInterval || 1.2));
        AI.say(e, 'HEAD detached!', 1.4, HEAD_SHOT);
      }

      if (s.mode === 'linked') {
        const b = s.partner;
        // Bahnpunkt: hinter dem Koerper (vom Spieler weg), seitlich um bis zu ~75 Grad pendelnd
        s.swing += dt * 0.9;
        const away = Math.atan2(b.y - p.y, b.x - p.x);
        const want = away + Math.sin(s.swing) * 1.3;
        s.orbitA = AI.turn(s.orbitA, want, dt * 2.2);   // weich nachdrehen statt springen
        const lo = P.orbitMin || 80, hi = P.orbitMax || 140;
        const rad = (lo + hi) / 2 + Math.sin(e.t * 1.3) * (hi - lo) / 2;
        const t = AI.clampToRoom(b.x + Math.cos(s.orbitA) * rad, b.y + Math.sin(s.orbitA) * rad, e.r + 6);
        const dd = Math.hypot(t.x - e.x, t.y - e.y);
        if (dd < 2) AI.stop(e);
        else AI.toward(e, t.x, t.y, Math.min(e.speed, dd * 4));
      } else {
        // Panik: alle 0.2–0.45 s scharf abbiegen, an Waenden sofort neu waehlen
        s.turnT -= dt;
        if (s.turnT <= 0 || s.bumped) {
          s.dir += game.rng.float(-1.8, 1.8) + (s.bumped ? Math.PI : 0);
          s.turnT = game.rng.float(0.2, 0.45);
          s.bumped = false;
        }
        const sp = P.panicSpeed || 175;
        e.vx = Math.cos(s.dir) * sp;
        e.vy = Math.sin(s.dir) * sp;
      }

      // Schiessen (beide Modi): Auge gluet in den letzten `warn` Sekunden, dann ein gezielter Schuss
      const warn = P.warn || 0.4;
      s.cd -= dt;
      s.warn = s.cd <= warn;
      if (s.cd <= 0) {
        AI.shootAt(game, e, p, AI.shotSpeed(game, P.shotSpeed || 170), { color: HEAD_SHOT });
        s.cd = AI.cooldown(game, s.mode === 'panic' ? (P.panicInterval || 1.2) : (P.interval || 2.2));
        s.warn = false;
      }
    },

    onDeath(e) {
      e.state.partner = null;   // der Koerper bemerkt den Tod in seinem naechsten update
    },

    draw(e, ctx, game) {
      const s = e.state;
      const p = game && game.player;
      const flipX = p ? p.x < e.x : false;   // Pfeilspitze zeigt immer zum Spieler (Sprite zeigt nach rechts)
      const dy = s.bob || 0;
      drawSnap(e, ctx, 0, dy);
      if (s.warn && !(e.spawnDelay > 0)) {
        // Warnung: bernsteinfarbener Schein um das Auge (das Auge sitzt auf der stumpfen Seite)
        const k = 1 - Math.max(0, s.cd) / (e.params.warn || 0.4);
        AI.drawGlow(ctx, e.x + (flipX ? 6 : -6), e.y + dy + 2, 12 + 8 * k, 0.4 + 0.6 * k, HEAD_SHOT);
      }
      AI.drawBody(e, ctx, {
        dy,
        flipX,
        sprite: s.warn ? 'enemy_detached_head_tag_glow' : null,
      });
      AI.drawSay(e, ctx);
    },
  };

  B.AI = AI;
  B.Enemy = Enemy;
})(window.BOTA);
