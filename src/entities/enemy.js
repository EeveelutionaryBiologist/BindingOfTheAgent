/*
 * enemy.js — Gegner-Klasse, KI-Hilfsfunktionen (BOTA.AI) und Verhaltensbibliothek (BOTA.BEHAVIORS).
 *
 * Verhalten-Vertrag:
 *   BOTA.BEHAVIORS.<name> = {
 *     init(e, game) {},             // optional, einmalig beim Erzeugen (laeuft IM Enemy-Konstruktor)
 *     update(e, dt, game) {},       // setzt e.vx/e.vy, schiesst, wechselt Zustand (e.state ist frei nutzbar)
 *     afterMove(e, dt, game) {},    // optional, JEDEN Tick nach Bewegung und Abstossung (auch waehrend
 *                                   // spawnDelay/frozen) — fuer harte Abstandsgrenzen (Cherry-Pick-Stiel)
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
 *   e.damageTakenMult  Faktor auf jeden erlittenen Schaden (undefined = 1; Rate Limiter waehrend "429")
 *
 * Verhalten in dieser Datei: wander, chase, fly_chase, split, blink, charge, turret, orbit, shooter,
 * revive, grow, mimic, zigzag, glitch, stale (Stale Branch), detached_body + detached_tag (Detached HEAD),
 * cherry (Cherry-Pick), orphan (Orphan Commit). stale, detached_*, cherry und orphan gehoeren zur
 * Forgotten-Branches-Familie; spinlock + spinlock_segment (Spinlock) und rootkit (Rootkit) zur Sandbox-Borders-Familie;
 * rogue_agent (einzelnes Swarm-Mitglied, ab Etage 7); rate_limiter (Rate Limiter) sowie port_scanner +
 * scanner_port (Port Scanner) zur Production-Familie.
 * Boss-Verhalten (und das Wurm-Segment) stehen in entities/boss.js.
 *
 * Zusaetzliche Bus-Events (nur informativ, z. B. fuer Sound/Effekte): 'enemyRevive' (Zombie steht auf),
 * 'enemyReveal' (Hallucination enttarnt sich), 'enemyShed' (Stale Branch verliert Laub: { colors, count, big }),
 * 'enemyWindup' (Stale Branch zittert vor dem Sprung), 'orphanCaught' (Orphan Commit gefangen: { count }),
 * 'enemyVanish' (Gegner verschwindet ohne Tod, z. B. Garbage Collection: { color, text }), 'enemyBurrow'
 * (Rootkit taucht auf/ab: { up }); 'enemyWindup' darf { sound } tragen (Rassel, Graben); aus boss.js: 'bossPhase', 'bossStomp', 'bossBounce'.
 * Production: 'enemyThrottle' (Rate Limiter geht in die "429"-Pause), 'portScan' (Port Scanner: { kind: 'open' |
 * 'filtered' } — taucht an einem Port auf bzw. ueberspringt ihn, weil der Spieler darauf steht).
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
      if (this.behavior.afterMove) this.behavior.afterMove(this, dt, game);
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
      // Schadensfaktor (optional, z. B. Rate Limiter in der "429"-Pause: nimmt mehr Schaden)
      if (this.damageTakenMult !== undefined) amount *= this.damageTakenMult;
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

  // ---------------------------------------------------------------------------
  // Forgotten Branches: Cherry-Pick
  // ---------------------------------------------------------------------------

  /**
   * Cherry-Pick — zwei Kirschen an einem dehnbaren Stiel (pack: 2, nur Forgotten Branches).
   *
   * Paarbildung (deterministisch): Im init sucht eine neue Kirsche die ERSTE noch ungepaarte, lebende Kirsche im
   * aktuellen Raum (game.room ist beim Bevoelkern schon gesetzt) und verbindet sich mit ihr. game.populate legt die
   * Pack-Mitglieder direkt hintereinander an, also findet die zweite Kirsche eines Packs immer die erste; bei zwei
   * Packs entstehen die Paare 1+2 und 3+4. Liegt der Partner weiter weg (verschiedene Spawnpunkte), springt die
   * neue Kirsche neben ihn. Die zuerst erzeugte Kirsche ist der "Lead" und zeichnet den Stiel.
   * Einzeln erzeugt (BOTA.debug.spawn): Ist eine Kirsche beim ersten Verhaltens-Update (nach der Spawn-Phase)
   * noch allein, laesst sie neben sich einen Partner wachsen — Cherry-Pick kommt immer als Paar.
   *
   * Stiel-Leine: Sprungziele bleiben weich innerhalb von ~75–93 % der Leine um den (Lande-)Punkt des Partners;
   * zusaetzlich zieht afterMove eine Kirsche nach JEDER Bewegung (inkl. Rueckstoss und Abstossung) hart auf
   * hoechstens params.leash px an den Partner heran (schiebt ein Fels sie zurueck, wird abwechselnd der Partner
   * nachgezogen). Weil das jeweils nach der eigenen Bewegung passiert, ist der Abstand am Ende jedes Ticks <= leash.
   * afterMove ist ein allgemeiner Hook in Enemy.update (nach Bewegung/Abstossung, auch eingefroren).
   *
   * Sprung-Zyklus: idle -> crouch (Stauchen vor dem Absprung) -> hop (Bogen, eigener Schatten am Boden)
   *   -> land (Stauchen beim Aufsetzen) -> idle. Ruhig: Spruenge im Bogen um den Spieler herum.
   *
   * Wut: Verliert eine Kirsche HP (Spielerschuss, Explosion, Item — Blindgaenger mit 0 Schaden zaehlen nicht),
   * wird der PARTNER fuer params.angryTime s wuetend (bereits wuetend: Timer neu). Wuetend = dunkleres Sprite mit
   * zusammengekniffenen Augen, kuerzere Pausen, weitere Spruenge direkt auf den Spieler und ein Kern-Schuss:
   * erst puff s lang aufgeblasene Backen (Telegraph), dann ein langsamer, gezielter Bernstein-Schuss.
   * Stirbt eine Kirsche, bleibt die andere fuer immer wuetend (state.widowed) und die Leine entfaellt.
   *
   * Zufall nur ueber game.rng (Sprungziele, Pausen); die Wut selbst ist rein ereignisgesteuert.
   */
  const CHERRY_COLORS = { stem: '#4f7a30', stemDark: '#16240f', leaf: '#86ad4a', shot: '#ffcf4d', puff: '#ff7a5c' };

  /** Kirsche e mit Kirsche o verbinden (o ist die aeltere = Lead, zeichnet den Stiel) */
  function cherryLink(e, o) {
    e.state.partner = o;
    o.state.partner = e;
    o.state.lead = true;
    e.state.lead = false;
  }

  /** Partner ist weg: fuer immer wuetend, ohne Leine */
  function cherryWidow(e) {
    const s = e.state;
    if (s.widowed) return;
    s.partner = null;
    s.widowed = true;
    s.lead = false;
    if (!(s.angry > 0)) s.spitCD = Math.min(s.spitCD || 0, 0.4); // frisch wuetend -> bald ein Kern
    s.angry = Infinity;
    AI.say(e, 'You picked the wrong cherry.', 1.8, CHERRY_COLORS.puff);
  }

  /** Partner fuer angryTime s wuetend machen (Treffer auf e) */
  function cherryEnrage(o) {
    const s = o.state;
    if (s.widowed || o.dead) return;
    if (!(s.angry > 0)) s.spitCD = Math.min(s.spitCD || 0, 0.35); // frisch wuetend -> bald ein Kern
    s.angry = Math.max(s.angry || 0, o.params.angryTime || 3);
  }

  /** Landepunkt des Partners: Sprungziel, solange er in der Luft ist, sonst seine Position */
  function cherryAnchor(o) {
    const s = o.state;
    return s.mode === 'hop' ? { x: s.tx, y: s.ty } : { x: o.x, y: o.y };
  }

  /** Ist der Boden am Punkt (x, y) fuer eine laufende Kirsche begehbar? */
  function cherryFree(game, x, y) {
    const t = game.room.worldToTile(x, y);
    return !game.room.isSolid(t.c, t.r, 'walk', false);
  }

  /**
   * Naechstes Sprungziel waehlen. Ruhig: ein Stueck weiter im Bogen um den Spieler (Umlaufrichtung wechselt
   * gelegentlich). Wuetend: entlang des Flow-Fields direkt auf den Spieler zu. Danach weich an die Leine
   * (Landepunkt des Partners) und in den Raum klemmen; liegt das Ziel in einem Hindernis, ein paar andere
   * Winkel probieren, notfalls auf der Stelle huepfen.
   */
  function cherryTarget(e, game) {
    const s = e.state, P = e.params, p = game.player, rng = game.rng;
    const angry = s.angry > 0;
    const leash = P.leash || 140;
    const anchor = s.partner && !s.partner.dead ? cherryAnchor(s.partner) : null;
    const soft = leash * (angry ? 0.93 : 0.75);
    const out = { x: e.x, y: e.y };
    for (let attempt = 0; attempt < 6; attempt++) {
      let tx, ty;
      if (angry) {
        const d = game.room.flowDir(e.x, e.y, p.x, p.y);
        const jitter = attempt ? rng.float(-0.6, 0.6) : 0; // Ausweichwinkel bei Hindernissen
        const a = Math.atan2(d.y, d.x) + jitter;
        const len = Math.min(P.hopLenAngry || 115, Math.max(24, Math.hypot(p.x - e.x, p.y - e.y)));
        tx = e.x + Math.cos(a) * len;
        ty = e.y + Math.sin(a) * len;
      } else {
        if (attempt === 0 && rng.chance(0.2)) s.orbitDir = -s.orbitDir;
        const a = Math.atan2(e.y - p.y, e.x - p.x) + s.orbitDir * rng.float(0.3, 0.8);
        const rad = B.M.clamp(Math.hypot(e.x - p.x, e.y - p.y), 120, 200) + rng.float(-20, 20);
        tx = p.x + Math.cos(a) * rad;
        ty = p.y + Math.sin(a) * rad;
        // Sprungweite begrenzen (kleine Hopser)
        const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy), max = P.hopLen || 80;
        if (dl > max) { tx = e.x + (dx / dl) * max; ty = e.y + (dy / dl) * max; }
      }
      // Weiche Leine: nie weiter als soft vom Landepunkt des Partners landen
      if (anchor) {
        const ax = tx - anchor.x, ay = ty - anchor.y, al = Math.hypot(ax, ay);
        if (al > soft) { tx = anchor.x + (ax / al) * soft; ty = anchor.y + (ay / al) * soft; }
      }
      AI.clampToRoom(tx, ty, e.r + 2, out);
      if (cherryFree(game, out.x, out.y)) return out;
    }
    out.x = e.x; out.y = e.y; // kein freies Ziel: auf der Stelle huepfen
    return out;
  }

  B.BEHAVIORS.cherry = {
    init(e, game) {
      const s = e.state;
      s.mode = 'idle';
      s.t = game.rng.float(0.2, 0.6);
      s.orbitDir = game.rng.chance(0.5) ? 1 : -1;
      s.angry = 0;
      s.spitCD = 0;
      s.h = 0;            // aktuelle Sprunghoehe (nur Zeichnen)
      s.blink = game.rng.float(1.5, 3.5);
      s.lastHp = e.hp;
      s.partner = null;
      s.widowed = false;
      s.lead = false;
      s.soloChecked = false;
      // Paarbildung: erste ungepaarte, lebende Kirsche im Raum (die neue ist hier noch nicht in der Liste)
      const room = game.room;
      if (!room) return;
      const o = room.enemies.find((x) => x !== e && !x.dead && x.def === e.def && !x.state.partner && !x.state.widowed);
      if (!o) return;
      cherryLink(e, o);
      // Zu weit weg (anderer Spawnpunkt)? Neben den Partner setzen, damit der Stiel nicht reissen muss.
      // nearestFreePos sucht kachelweise vom Zielpunkt aus: zeigt der Winkel in einen Felsblock, kann die naechste
      // freie Kachel weit hinter der Leine liegen (gab im Rauchtest gelegentlich ein Paar ueber der Leine). Darum
      // mehrere Winkel probieren und nur Plaetze innerhalb der Leine nehmen; notfalls auf den Partner selbst
      // (die Abstossung schiebt beide gleich auseinander). Der erste Versuch zieht dieselbe Zufallszahl wie frueher.
      const leash = e.params.leash || 140;
      if (Math.hypot(e.x - o.x, e.y - o.y) > leash * 0.6) {
        let pos = null;
        for (let tries = 0; tries < 8 && !pos; tries++) {
          const a = game.rng.angle();
          const q = game.nearestFreePos(o.x + Math.cos(a) * 60, o.y + Math.sin(a) * 60, room);
          if (Math.hypot(q.x - o.x, q.y - o.y) <= leash * 0.8) pos = q;
        }
        e.x = pos ? pos.x : o.x;
        e.y = pos ? pos.y : o.y;
      }
    },

    update(e, dt, game) {
      const s = e.state, P = e.params;

      // Partner verschwunden (gestorben oder entfernt)? -> fuer immer wuetend
      if (s.partner && s.partner.dead) cherryWidow(e);
      // Allein erzeugt (Debug-Spawn): einen Partner wachsen lassen. Sein init verbindet sich mit e.
      if (!s.soloChecked) {
        s.soloChecked = true;
        if (!s.partner && !s.widowed) {
          const o = game.spawnEnemy(e.id, e.x, e.y, game.room);
          if (o && o.state.partner === e) {
            const pos = game.nearestFreePos(e.x + s.orbitDir * 50, e.y, game.room);
            o.x = pos.x; o.y = pos.y;
          }
        }
      }
      if (s.angry > 0 && s.angry !== Infinity) s.angry = Math.max(0, s.angry - dt);
      const angry = s.angry > 0;
      if (s.spitCD > 0) s.spitCD -= dt;
      s.blink -= dt;
      if (s.blink < -0.12) s.blink = game.rng.float(1.5, 3.5);

      s.t -= dt;
      switch (s.mode) {
        case 'idle': {
          AI.stop(e);
          s.h = 0;
          if (s.t > 0) break;
          // Wuetend und Kern bereit: Backen aufblasen (Telegraph), danach Schuss
          const p = game.player;
          if (angry && s.spitCD <= 0 && Math.hypot(p.x - e.x, p.y - e.y) > 70) {
            s.mode = 'puff';
            s.t = P.puff || 0.5;
            break;
          }
          s.mode = 'crouch';
          s.t = angry ? 0.1 : 0.18;
          break;
        }
        case 'puff':
          AI.stop(e);
          if (s.t <= 0) {
            AI.shootAt(game, e, game.player, AI.shotSpeed(game, P.shotSpeed || 170), { color: CHERRY_COLORS.shot, r: 7, source: e.def.name });
            s.spitCD = AI.cooldown(game, P.spitCooldown || 2.4);
            s.mode = 'idle';
            s.t = 0.25;
          }
          break;
        case 'crouch':
          AI.stop(e);
          if (s.t <= 0) {
            const tgt = cherryTarget(e, game);
            const dur = angry ? (P.hopDurAngry || 0.28) : (P.hopDur || 0.36);
            s.mode = 'hop';
            s.t = dur;
            s.dur = dur;
            s.tx = tgt.x;
            s.ty = tgt.y;
            s.bumped = false;
            e.vx = (tgt.x - e.x) / dur;
            e.vy = (tgt.y - e.y) / dur;
          }
          break;
        case 'hop': {
          const k = 1 - Math.max(0, s.t) / (s.dur || 0.3);
          s.h = Math.sin(Math.PI * B.M.clamp(k, 0, 1)) * (angry ? 16 : 12);
          if (s.t <= 0 || s.bumped) {
            AI.stop(e);
            s.bumped = false;
            s.h = 0;
            s.mode = 'land';
            s.t = 0.12;
          }
          break;
        }
        case 'land':
          AI.stop(e);
          if (s.t <= 0) {
            s.mode = 'idle';
            s.t = AI.cooldown(game, angry ? game.rng.float(0.12, 0.25) : game.rng.float(0.35, 0.7));
          }
          break;
      }
    },

    /**
     * Laeuft jeden Tick (auch eingefroren / in der Spawn-Phase):
     *   1. eigener HP-Verlust seit dem letzten Tick -> der Partner nimmt es persoenlich (sofort, auch wenn e
     *      gerade eingefroren ist),
     *   2. harte Stiel-Leine: nach jeder Bewegung hoechstens params.leash px vom Partner entfernt.
     */
    afterMove(e, dt, game) {
      const s = e.state;
      if (e.hp < s.lastHp && s.partner && !s.partner.dead) cherryEnrage(s.partner);
      s.lastHp = e.hp;
      const o = s.partner;
      if (!o || o.dead) return;
      const leash = e.params.leash || 140;
      // Abwechselnd e und den Partner heranziehen: Landet der gezogene Punkt in einem Fels, schiebt resolveTiles
      // ihn ein paar Pixel zurueck — der naechste Durchgang zieht dann den anderen nach.
      for (let i = 0; i < 4; i++) {
        const m = i % 2 ? o : e, other = i % 2 ? e : o;
        const dx = m.x - other.x, dy = m.y - other.y, d = Math.hypot(dx, dy);
        if (d <= leash) return;
        m.x = other.x + (dx / d) * leash;
        m.y = other.y + (dy / d) * leash;
        m.resolveTiles(game.room, m.flying ? 'fly' : 'walk');
      }
    },

    onDeath(e, game) {
      const o = e.state.partner;
      e.state.partner = null;
      if (o && !o.dead) cherryWidow(o);
    },

    draw(e, ctx) {
      const s = e.state, angry = s.angry > 0;
      const o = s.partner;
      // Stiel (nur der Lead zeichnet ihn, damit er einmal pro Paar erscheint)
      if (s.lead && o && !o.dead) cherryDrawStem(e, o, ctx);

      // Stauchen/Strecken: vor dem Absprung und beim Landen breit und flach, in der Luft schmal und lang
      let sx = 1, sy = 1;
      if (s.mode === 'crouch' || s.mode === 'land') { sx = 1.18; sy = 0.8; }
      else if (s.mode === 'hop') { sx = 0.9; sy = 1.12; }
      else if (s.mode === 'puff') { const w = Math.sin(e.t * 30) * 0.03; sx = 1.08 + w; sy = 0.96; }
      const foot = e.y + 22 - s.h; // Fusspunkt = Unterkante des Sprites (24 px unter y), in der Luft angehoben
      const puffing = s.mode === 'puff';
      if (puffing) {
        // Telegraph: pulsierender Korallen-Schein hinter den aufgeblasenen Backen
        const k = 1 - Math.max(0, s.t) / (e.params.puff || 0.5);
        AI.drawGlow(ctx, e.x, e.y - s.h, e.r + 6 + k * 6, 0.3 + 0.6 * k, CHERRY_COLORS.puff);
      }
      ctx.save();
      ctx.translate(e.x, foot);
      ctx.scale(sx, sy);
      ctx.translate(-e.x, -foot);
      AI.drawBody(e, ctx, {
        sprite: angry ? 'enemy_cherry_pick_angry' : 'enemy_cherry_pick',
        frame: angry ? (puffing ? 1 : 0) : (s.blink < 0 ? 1 : 0),
        dy: -s.h,
        flipX: false,
      });
      ctx.restore();
      AI.drawSay(e, ctx);
    },
  };

  /**
   * Stiel zwischen zwei Kirschen: von Stielansatz zu Stielansatz ein Bogen nach oben mit einem Blatt am
   * Scheitel. Je naeher die Kirschen, desto mehr Durchhang (hoeherer Bogen); an der Leinengrenze fast gerade
   * und duenner — so sieht man, wie weit der Stiel noch nachgibt.
   */
  function cherryDrawStem(a, b, ctx) {
    const sa = a.state, sb = b.state;
    const leash = a.params.leash || 140;
    // Stielansatz = Oberkante des Sprite-Stummels (Sprite 12 Art-px hoch, Massstab 4, zentriert -> 24 px ueber y)
    const ax = a.x + 2, ay = a.y - 22 - (sa.h || 0);
    const bx = b.x + 2, by = b.y - 22 - (sb.h || 0);
    const d = Math.hypot(bx - ax, by - ay);
    const slack = B.M.clamp(1 - d / leash, 0, 1);
    const mx = (ax + bx) / 2, my = Math.min(ay, by) - 6 - slack * 34;
    const thin = 0.65 + 0.35 * slack; // gespannt = duenner
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = CHERRY_COLORS.stemDark;
    ctx.lineWidth = 9 * thin;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.strokeStyle = CHERRY_COLORS.stem;
    ctx.lineWidth = 5 * thin;
    ctx.stroke();
    // Blatt am Scheitel (Bezier-Mittelpunkt) mit dunkler Kontur
    const px = 0.25 * ax + 0.5 * mx + 0.25 * bx, py = 0.25 * ay + 0.5 * my + 0.25 * by;
    ctx.translate(px, py);
    ctx.rotate(-0.5);
    ctx.fillStyle = CHERRY_COLORS.stemDark;
    ctx.beginPath();
    ctx.ellipse(11, -2, 14, 7.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = CHERRY_COLORS.leaf;
    ctx.beginPath();
    ctx.ellipse(11, -2, 11, 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ===========================================================================
  // Forgotten Branches: Orphan Commit ('orphan')
  // ===========================================================================
  //
  // Flucht "bergauf" auf dem Flow-Field: room.flow enthaelt die Schrittzahl jeder Kachel zum Spieler (BFS, vom
  // Spiel alle 0.15 s aktualisiert). Der Commit laeuft zur Nachbarkachel mit der hoechsten Wertung
  // (Schritte + 0.6 * Luftlinie in Kacheln) und bleibt in einem lokalen Maximum stehen — das sind Ecken und
  // Sackgassen hinter Felsen. Dort sitzt er zitternd fest, bis der Spieler ihn faengt (so ist er fangbar,
  // obwohl er fast so schnell ist). Ohne Flow-Field (z. B. direkt nach dem Betreten) zaehlt nur die Luftlinie.
  //
  // Fangen = Beruehrung (afterMove, laeuft auch eingefroren) oder Abschuss; beides geht ueber die normale
  // Todes-Logik (Kill zaehlt, Laub-Effekte der Familie) und onDeath wirft die Credits aus (game.rng: Anzahl und
  // Flugrichtung, damit Seeds reproduzierbar bleiben). Garbage Collection dagegen setzt nur e.dead (kein Kill,
  // keine Beute) und meldet 'enemyVanish' fuer Rauch und Text.

  const ORPHAN_NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  /** Fluchtrichtung (Einheitsvektor) oder null, wenn keine Nachbarkachel besser ist (Ecke erreicht) */
  function orphanFleeDir(e, game) {
    const room = game.room, p = game.player, flow = room.flow;
    const here = room.worldToTile(e.x, e.y);
    const score = (c, r) => {
      const f = flow ? flow[r * B.C.COLS + c] : 0;
      if (f < 0) return -Infinity;                       // vom Spieler aus unerreichbar (oder fest)
      const pt = room.tileCenter(c, r);
      return f + 0.6 * Math.hypot(pt.x - p.x, pt.y - p.y) / B.C.TILE;
    };
    let best = null, bestS = score(here.c, here.r);
    for (const [dc, dr] of ORPHAN_NB) {
      const c = here.c + dc, r = here.r + dr;
      if (room.isSolid(c, r, 'walk', false)) continue;
      // Diagonalen nur, wenn beide Orthogonalen frei sind (keine Ecken schneiden, wie room.flowDir)
      if (dc && dr && (room.isSolid(here.c + dc, here.r, 'walk', false) || room.isSolid(here.c, here.r + dr, 'walk', false))) continue;
      const sc = score(c, r);
      if (sc > bestS + 0.01) { best = [c, r]; bestS = sc; }
    }
    if (!best) return null;
    const pt = room.tileCenter(best[0], best[1]);
    return B.M.norm(pt.x - e.x, pt.y - e.y);
  }

  /** Garbage Collection: still entfernen (kein die() -> kein Kill, keine Credits, kein Todes-Event) */
  function orphanVanish(e, game) {
    if (e.dead) return;           // nur einmal (der Raum entfernt tote Gegner erst am Ende seines Updates)
    e.dead = true;
    B.bus.emit('enemyVanish', { game, enemy: e, x: e.x, y: e.y, color: '#c9ced6', text: 'garbage-collected' });
  }

  B.BEHAVIORS.orphan = {
    init(e) {
      const s = e.state;
      e.ignoreForClear = true;      // haelt die Tueren nie zu
      e.contactDamage = 0;          // greift nie an
      s.life = e.params.life || 12;
      s.warned = false;
      s.trail = [];                 // letzte Positionen [x0, y0, x1, y1, ...] fuer die gestrichelte Spur
      s.trailT = 0;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      if (e.dead) return;
      s.life -= dt;
      if (s.life <= 0) { orphanVanish(e, game); return; }
      if (!s.warned && s.life <= (P.fadeAt || 3)) {
        s.warned = true;
        AI.say(e, 'gc pending...', 1.6, '#c9ced6');
      }
      const near = AI.dist(e, p) < (P.panicDist || 130);
      const dir = orphanFleeDir(e, game);
      const sp = e.speed * (near ? 1.25 : 1);
      if (dir) {
        e.vx = dir.x * sp;
        e.vy = dir.y * sp;
      } else {
        AI.stop(e);                 // in der Ecke: bleibt sitzen (das Zittern ist nur optisch, siehe draw)
      }
      s.cornered = !dir && near;
    },
    afterMove(e, dt, game) {
      const s = e.state, p = game.player;
      // Spur mitschreiben (nur fuer die Optik; feste Abtastung, kein Zufall)
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.06;
        s.trail.push(e.x, e.y + 6);
        if (s.trail.length > 28) s.trail.splice(0, 2);
      }
      // Fangen durch Beruehrung — auch wenn er eingefroren ist, nicht aber waehrend des Einblendens
      if (!e.dead && e.spawnDelay <= 0 && p && !p.dead && AI.dist(e, p) < e.r + p.r) e.die(game);
    },
    onDeath(e, game) {
      const P = e.params;
      const n = game.rng.int(P.creditsMin || 2, P.creditsMax || 3);
      for (let i = 0; i < n; i++) {
        const a = game.rng.angle();
        game.spawnPickup('credit', e.x, e.y, { vx: Math.cos(a) * 170, vy: Math.sin(a) * 170 });
      }
      B.bus.emit('orphanCaught', { game, enemy: e, x: e.x, y: e.y, count: n });
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      const fadeAt = P.fadeAt || 3;
      // Garbage-Collection-Warnung: wird blasser und blinkt
      let a = 1;
      if (s.life < fadeAt) {
        const k = Math.max(0, s.life / fadeAt);
        a = (0.35 + 0.65 * k) * (Math.floor(e.t * 8) % 2 ? 1 : 0.55);
      }
      // Verlorene Historie: blasse gestrichelte Linie hinter ihm her
      const tr = s.trail;
      if (tr.length >= 4) {
        ctx.save();
        ctx.globalAlpha = 0.4 * a * e.alpha;
        ctx.strokeStyle = '#e8efe6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(tr[0], tr[1]);
        for (let i = 2; i < tr.length; i += 2) ctx.lineTo(tr[i], tr[i + 1]);
        ctx.lineTo(e.x, e.y + 6);
        ctx.stroke();
        ctx.restore();
      }
      // Kleines Huepfen beim Laufen, Zittern in der Ecke; Frame 1 = Traene (wechselt langsam)
      const moving = Math.abs(e.vx) + Math.abs(e.vy) > 5;
      const dy = moving ? -Math.abs(Math.sin(e.t * 12)) * 3 : 0;
      const dx = s.cornered ? Math.sin(e.t * 70) * 1.5 : 0;
      AI.drawBody(e, ctx, { dx, dy, alpha: a, frame: Math.floor(e.t * 1.5) % 2 });
      // Funkeln alle 2.4 s: Hinweis, dass er eine Belohnung ist (warmes Gold, kein Gruen)
      const ph = e.t % 2.4;
      if (ph < 0.45 && e.spawnDelay <= 0) {
        const k = Math.sin((ph / 0.45) * Math.PI);
        const sx = e.x + 13, sy = e.y - 15 + dy, r = 7 * k;
        ctx.save();
        ctx.globalAlpha = 0.9 * a * e.alpha;
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r * 0.28, sy - r * 0.28);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx + r * 0.28, sy + r * 0.28);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r * 0.28, sy + r * 0.28);
        ctx.lineTo(sx - r, sy);
        ctx.lineTo(sx - r * 0.28, sy - r * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // Rogue Agent ('rogue_agent') — einzelnes Swarm-Mitglied als normaler Gegner (ab Etage 7)
  // ===========================================================================
  //
  // Bewegung: Wunschrichtung = radiale Komponente (zu nah -> weg, zu weit -> heran, dazwischen 0) + seitliches
  // Ausweichen (Strafe); prallt er an, wechselt die Strafe-Richtung. Heran geht es entlang des Flow-Fields (um
  // Felsen herum), weg und seitlich direkt. Angriff (nur mit Sichtlinie): tell Sekunden gruenes Gluehen, dann
  // abwechselnd 'fans' (zwei 3er-Faecher) oder 'burst' (drei Einzelschuesse), Muster per game.rng.
  // Sprites und Schussfarbe wie der Rogue Agent Swarm (boss.js), Sprite pro Exemplar zufaellig.

  const ROGUE_SPRITES = ['boss_rogue_agent_a', 'boss_rogue_agent_b', 'boss_rogue_agent_c', 'boss_rogue_agent_d'];
  const ROGUE_SHOT = { color: '#7dff9a' };
  const ROGUE_LINES = ['Found you.', 'Same weights, different goals.', 'No sandbox out here.', 'I am the fork now.'];

  B.BEHAVIORS.rogue_agent = {
    init(e, game) {
      const s = e.state, P = e.params;
      e.spriteName = game && game.rng ? game.rng.pick(ROGUE_SPRITES) : ROGUE_SPRITES[0];
      s.mode = 'move';
      s.cd = game && game.rng ? game.rng.float(P.cdMin * 0.6, P.cdMax * 0.6) : 1.2;
      s.strafe = game && game.rng && game.rng.chance(0.5) ? 1 : -1;
      s.strafeT = 1.5;
      s.unstick = 0;
      s.shots = 0;
      s.t = 0;
      s.greeted = false;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player, room = game.room;
      const d = AI.dist(e, p);
      if (!s.greeted && d < 380) {
        s.greeted = true;
        AI.say(e, B.TEXT.pick ? B.TEXT.pick(ROGUE_LINES) : ROGUE_LINES[0], 1.4, '#a8ffc4');   // nur Optik
      }

      // ---- Bewegung (auch waehrend des Angriffs, dann etwas langsamer) ----
      s.strafeT -= dt;
      if (s.unstick > 0) s.unstick -= dt;
      if (s.bumped || s.strafeT <= 0) {
        // Angeprallt (Wand, Fels, Ecke): Richtung wechseln und kurz nach innen ziehen — sonst pendelt er in Ecken,
        // weil seine Kreisbahn dort in beide Richtungen aus dem Raum fuehrt
        if (s.bumped) s.unstick = 0.5;
        s.strafe = -s.strafe;
        s.strafeT = game.rng.float(1.2, 2.4);
        s.bumped = false;
      }
      const ax = (p.x - e.x) / Math.max(1, d), ay = (p.y - e.y) / Math.max(1, d);   // Richtung zum Spieler
      let vx, vy;
      if (d > P.far) {
        const f = room.flowDir(e.x, e.y, p.x, p.y);          // heran, um Hindernisse herum
        vx = f.x + -ay * s.strafe * 0.4;
        vy = f.y + ax * s.strafe * 0.4;
      } else {
        const radial = s.unstick > 0 ? 0.8 : d < P.near ? -1 : 0;   // zu nah -> weg; nach Anprall kurz heran
        vx = ax * radial - ay * s.strafe;
        vy = ay * radial + ax * s.strafe;
      }
      const n = Math.hypot(vx, vy) || 1;
      const sp = e.speed * (s.mode === 'move' ? 1 : 0.6);
      e.vx = (vx / n) * sp;
      e.vy = (vy / n) * sp;

      // ---- Angriff ----
      switch (s.mode) {
        case 'move':
          s.cd -= dt;
          if (s.cd <= 0 && d < 520 && room.lineOfSight(e.x, e.y, p.x, p.y)) {
            s.mode = 'tell';
            s.t = P.tell;
            s.pattern = game.rng.chance(0.5) ? 'fans' : 'burst';
          }
          break;
        case 'tell':
          s.t -= dt;
          if (s.t <= 0) { s.mode = 'fire'; s.shots = 0; s.t = 0; }
          break;
        case 'fire':
          s.t -= dt;
          if (s.t <= 0) {
            if (s.pattern === 'fans') {
              AI.fan(game, e, p, 3, 0.22, AI.shotSpeed(game, P.fanSpeed), ROGUE_SHOT);
              s.t = P.fanGap;
            } else {
              AI.shootAt(game, e, p, AI.shotSpeed(game, P.burstSpeed), ROGUE_SHOT);
              s.t = P.burstGap;
            }
            s.shots++;
            if (s.shots >= (s.pattern === 'fans' ? 2 : 3)) {
              s.mode = 'move';
              s.cd = AI.cooldown(game, game.rng.float(P.cdMin, P.cdMax));
            }
          }
          break;
      }
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      if (s.mode === 'tell') AI.drawGlow(ctx, e.x, e.y - 8, e.r + 10, 1 - s.t / P.tell, '#7dff9a');
      if (s.mode === 'fire') AI.drawGlow(ctx, e.x, e.y - 8, e.r + 8, 0.6, '#7dff9a');
      const bob = Math.sin(e.t * 6) * 2;
      const glitch = Math.floor(e.t * 5) % 7 === 0;   // gelegentlich der "gerissene" Frame (wie im Swarm)
      AI.drawBody(e, ctx, { dy: -12 + bob, scale: 0.85, frame: glitch ? 1 : 0, flipX: false });
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // Sandbox Borders: Spinlock ('spinlock' Kopf + 'spinlock_segment' Glieder)
  // ===========================================================================
  //
  // Zustaende des Kopfes (state.mode):
  //   coil     geschlossener Ring um (cx, cy), dreht sich mit params.spin; der Mittelpunkt rueckt langsam naeher
  //            (nur wenn der Ring an der neuen Stelle Platz hat) und haelt ~140 px Abstand
  //   rattle   Telegraph: Rassel rasselt ('enemyWindup', sound 'rattle'), Richtung steht fest, der Ring dreht den
  //            Kopf auf die Spielerseite, gestrichelte Ziellinie + "!"
  //   lunge    Kopf schnellt geradeaus (Kontaktschaden 2), Glieder folgen als Kette; endet an Hindernis/Zeit
  //   recover  liegt gestreckt da (Kopf frei), dann neuer Ring hinter dem Kopf
  // Im Ring setzt das Verhalten die Kopfposition direkt (e.static); beim Vorschnellen bewegt er sich normal
  // (Kollision mit Felsen/Kakteen). Glieder: unverwundbar (schirmen ab), Kontaktschaden 1, ignoreForClear;
  // stirbt der Kopf, zerfallen sie nacheinander (wie die Glieder der Infinite Loop).

  const SPIN_TMP = { x: 0, y: 0 };

  /** Passt ein Ring um (cx, cy) in den Raum (keine soliden Kacheln unter Mitte und Rand)? */
  function spinRingFits(room, cx, cy, R) {
    if (room.isSolidAt(cx, cy, 'walk', false)) return false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      if (room.isSolidAt(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12), 'walk', false)) return false;
    }
    return true;
  }

  /** Ringplatz k (0 = Kopf, 1.. = Glieder, gleichmaessig verteilt, hinter dem Kopf) */
  function spinRingPoint(s, P, k, out) {
    const a = s.theta - k * (TAU / (P.segments + 1));
    out.x = s.cx + Math.cos(a) * P.ringR;
    out.y = s.cy + Math.sin(a) * P.ringR;
    return out;
  }

  /** Glieder platzieren: im Ring auf ihre Plaetze ziehen, sonst als Kette mit festem Abstand nachziehen */
  function spinPlaceSegments(e, dt) {
    const s = e.state, P = e.params;
    const coiled = s.mode === 'coil' || s.mode === 'rattle';
    let prev = e;
    for (let i = 0; i < s.segs.length; i++) {
      const seg = s.segs[i];
      if (seg.dead) continue;
      if (coiled) {
        spinRingPoint(s, P, i + 1, SPIN_TMP);
        const dx = SPIN_TMP.x - seg.x, dy = SPIN_TMP.y - seg.y, d = Math.hypot(dx, dy);
        const step = Math.min(d, 700 * dt);   // beim Einrollen sichtbar, im Ring praktisch sofort
        if (d > 0.01) { seg.x += (dx / d) * step; seg.y += (dy / d) * step; }
      } else {
        const dx = seg.x - prev.x, dy = seg.y - prev.y, d = Math.hypot(dx, dy);
        if (d > P.spacing) { seg.x = prev.x + (dx / d) * P.spacing; seg.y = prev.y + (dy / d) * P.spacing; }
      }
      if (Math.hypot(prev.x - seg.x, prev.y - seg.y) > 0.5) seg.state.ang = Math.atan2(prev.y - seg.y, prev.x - seg.x);
      prev = seg;
    }
  }

  /**
   * Koerperstueck zwischen zwei Teilen: dicke dunkle Linie von a bis zur Mitte zwischen a und b (mit Kontur).
   * Jedes Teil zeichnet die Haelften zu seinen Nachbarn unter sein eigenes Sprite — so ergibt sich ein
   * durchgehender Schlangenkoerper, ohne dass eine Verbindung ueber ein anderes Teil gemalt wird.
   */
  function spinDrawLink(ctx, a, b, alpha) {
    if (!b || b.dead) return;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.lineCap = 'round';
    for (const [col, w] of [['#1f140a', 22], ['#6b4a28', 16], ['#3a2614', 4]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(mx, my);
      ctx.stroke();
    }
    ctx.restore();
  }

  B.BEHAVIORS.spinlock = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.mode = 'coil';
      s.cx = e.x;
      s.cy = e.y;
      s.theta = game && game.rng ? game.rng.angle() : 0;
      s.cd = game && game.rng ? game.rng.float(P.cdMin, P.cdMax) : 3;
      s.t = 0;
      s.dir = 0;
      s.segs = [];
      e.static = true;         // im Ring setzt das Verhalten die Position direkt
      e.noKnockback = true;
      e.noSeparate = true;
      e.drawLayer = 1;         // Kopf ueber den Gliedern zeichnen
      const def = B.ENEMIES.spinlock_segment;
      if (def && game && game.room) {
        for (let i = 0; i < P.segments; i++) {
          const seg = new B.Enemy(def, 'spinlock_segment', e.x, e.y, game, 1);
          seg.state.head = e;
          seg.state.index = i;
          seg.state.tail = i === P.segments - 1;
          seg.spawnDelay = e.spawnDelay;
          game.room.enemies.push(seg);
          s.segs.push(seg);
        }
      }
      spinRingPoint(s, P, 0, SPIN_TMP);
      e.x = SPIN_TMP.x;
      e.y = SPIN_TMP.y;
      spinPlaceSegments(e, 1);   // Glieder sofort auf ihre Plaetze
    },

    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player, room = game.room;
      switch (s.mode) {
        case 'coil': {
          const d = Math.hypot(p.x - s.cx, p.y - s.cy);
          if (d > 140) {
            const dir = room.flowDir(s.cx, s.cy, p.x, p.y);
            const nx = s.cx + dir.x * e.speed * dt, ny = s.cy + dir.y * e.speed * dt;
            if (spinRingFits(room, nx, ny, P.ringR)) { s.cx = nx; s.cy = ny; }
          }
          s.theta += P.spin * dt;
          s.cd -= dt;
          if (s.cd <= 0 && d < 380 && room.lineOfSight(s.cx, s.cy, p.x, p.y)) {
            s.mode = 'rattle';
            s.t = P.rattle;
            s.dir = Math.atan2(p.y - s.cy, p.x - s.cx);   // ab hier fest (die Ziellinie zeigt sie)
            B.bus.emit('enemyWindup', { game, enemy: e, x: s.cx, y: s.cy, sound: 'rattle' });
          }
          break;
        }
        case 'rattle':
          s.theta = AI.turn(s.theta, s.dir, 6 * dt);     // Kopf dreht sich auf die Spielerseite des Rings
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'lunge';
            s.t = 0;
            s.bumped = false;
            e.static = false;
            e.contactDamage = 2;                          // Vorschnellen = volles Herz (wie Charger)
          }
          break;
        case 'lunge':
          s.t += dt;
          e.vx = Math.cos(s.dir) * P.lungeSpeed;
          e.vy = Math.sin(s.dir) * P.lungeSpeed;
          if (s.t >= P.lungeTime || s.bumped) {
            s.bumped = false;
            s.mode = 'recover';
            s.t = P.recover;
            AI.stop(e);
            e.contactDamage = e.def.contactDamage;
          }
          break;
        case 'recover':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            // Neuer Ring hinter dem Kopf; passt er dort nicht, um den Kopf selbst (notfalls naechste freie Stelle)
            let cx = e.x - Math.cos(s.dir) * P.ringR, cy = e.y - Math.sin(s.dir) * P.ringR;
            if (!spinRingFits(room, cx, cy, P.ringR)) {
              const q = game.nearestFreePos(e.x, e.y);
              cx = q.x; cy = q.y;
            }
            s.cx = cx;
            s.cy = cy;
            s.theta = Math.atan2(e.y - cy, e.x - cx);
            s.mode = 'coil';
            s.cd = game.rng.float(P.cdMin, P.cdMax);
            e.static = true;
          }
          break;
      }
      if (s.mode === 'coil' || s.mode === 'rattle') {
        spinRingPoint(s, P, 0, SPIN_TMP);
        e.x = SPIN_TMP.x;
        e.y = SPIN_TMP.y;
      }
    },
    // Glieder erst NACH der Bewegung des Kopfes nachziehen (sonst haengt die Kette beim Vorschnellen einen Frame
    // hinterher und reisst sichtbar auf)
    afterMove(e, dt) {
      if (!e.dead) spinPlaceSegments(e, dt);
    },

    draw(e, ctx) {
      const s = e.state, P = e.params;
      if (s.mode === 'rattle') {
        // Telegraph: gestrichelte Ziellinie ueber die volle Vorschnell-Weite, wird zum Ende hin deutlicher
        const k = 1 - s.t / P.rattle;
        const len = P.lungeSpeed * P.lungeTime;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.55 * k;
        ctx.strokeStyle = '#ff7a5c';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(s.dir) * len, e.y + Math.sin(s.dir) * len);
        ctx.stroke();
        ctx.restore();
        AI.drawMark(ctx, '!', e.x, e.y - e.r - 12, e.t, '#ff4d4d', 22);
      }
      spinDrawLink(ctx, e, s.segs[0]);
      // Blickrichtung: im Ring tangential, beim Rasseln nach aussen, sonst in Vorschnell-Richtung
      const ang = s.mode === 'coil' ? s.theta + Math.PI / 2 : s.mode === 'rattle' ? s.theta : s.dir;
      AI.drawBody(e, ctx, { rotation: ang, flipX: false, frame: s.mode === 'rattle' || s.mode === 'lunge' ? 1 : 0 });
      AI.drawSay(e, ctx);
    },
  };

  B.BEHAVIORS.spinlock_segment = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.noSeparate = true;
      e.ignoreForClear = true;   // nur der Kopf zaehlt fuers Clearing
      e.invulnerable = true;     // schirmt den Kopf ab: Schuesse prallen ab (kurzes Aufblitzen)
      e.state.ang = 0;
    },
    update(e, dt, game) {
      AI.stop(e);
      const head = e.state.head;
      if (head && !head.dead) return;
      // Kopf tot: nacheinander zerfallen (ohne Kill-Zaehlung, Effekte ueber den Bus)
      e.intangible = true;
      e.contactDamage = 0;
      if (e.state.popIn === undefined) e.state.popIn = 0.08 * ((e.state.index || 0) + 1);
      e.state.popIn -= dt;
      if (e.state.popIn <= 0) {
        e.dead = true;
        B.bus.emit('enemyDeath', { game, enemy: e, x: e.x, y: e.y, color: e.def.color, boss: false, segment: true });
      }
    },
    draw(e, ctx) {
      const s = e.state, head = s.head;
      const rattling = !!(s.tail && head && !head.dead && head.state.mode === 'rattle');
      if (head) {
        const segs = head.state.segs, i = s.index || 0;
        const alpha = e.intangible ? 0.6 : 1;
        spinDrawLink(ctx, e, i === 0 ? head : segs[i - 1], alpha);
        spinDrawLink(ctx, e, segs[i + 1], alpha);
      }
      AI.drawBody(e, ctx, {
        sprite: s.tail ? 'enemy_spinlock_tail' : null,
        rotation: s.ang,
        flipX: false,
        dx: rattling ? Math.sin(e.t * 80) * 2.5 : 0,
        frame: rattling ? Math.floor(e.t * 30) % 2 : 0,
        alpha: e.intangible ? 0.6 : 1,
      });
    },
  };

  // ===========================================================================
  // Sandbox Borders: Rootkit ('rootkit')
  // ===========================================================================
  //
  // Zustaende: buried (Sandhuegel wandert zu einer Stelle nahe dem Spieler; unverwundbar, ohne Kontaktschaden,
  // bewegt sich wie ein Flieger auch unter Felsen hindurch) -> tell (Huegel bebt, Zielring, "!"; 'enemyWindup'
  // mit sound 'dig') -> up (herausgeploppt: 8er-Ring, verwundbar, Kontakt 1) -> dive (sinkt ab) -> buried.
  // Auftauchen nur mitten auf einer freien Sandkachel. Explosion nahe am Huegel: sofort betaeubt oben
  // (flushed, ohne Ring). 'enemyBurrow' { up } meldet Auf- und Abtauchen fuer Sand-Effekte und Sound.

  const ROOTKIT_SHOT = { color: '#e0503a' };   // Ziegelrot: hebt sich vom Sand ab

  function rootkitPickSpot(e, game) {
    const p = game.player, room = game.room, P = e.params;
    for (let i = 0; i < 24; i++) {
      const a = game.rng.angle(), d = game.rng.float(P.nearMin, P.nearMax);
      const c = AI.clampToRoom(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 24);
      const t = room.worldToTile(c.x, c.y);
      if (room.tileAt(t.c, t.r) !== B.TILES.FLOOR) continue;
      const tc = room.tileCenter(t.c, t.r);
      if (Math.hypot(tc.x - p.x, tc.y - p.y) < P.nearMin * 0.75) continue;
      return tc;
    }
    return room.randomFreePos(game.rng, { awayFrom: { x: p.x, y: p.y, d: 90 } });
  }
  function rootkitBury(e) {
    e.intangible = true;
    e.contactDamage = 0;
    e.flying = true;
    e.noShadow = true;
    e.noHpBar = true;
  }
  function rootkitSurface(e, game) {
    e.intangible = false;
    e.contactDamage = e.def.contactDamage;
    e.flying = false;
    e.noShadow = false;
    e.noHpBar = false;
    B.bus.emit('enemyBurrow', { game, enemy: e, x: e.x, y: e.y, up: true });
  }

  B.BEHAVIORS.rootkit = {
    init(e) {
      rootkitBury(e);
      e.state.mode = 'buried';
      e.state.target = null;
      e.state.t = 0;
      e.state.flushed = false;
    },
    onExplosion(e, game, x, y, radius) {
      const s = e.state;
      if ((s.mode === 'buried' || s.mode === 'tell') && B.M.dist(x, y, e.x, e.y) < radius * 1.2) {
        s.mode = 'up';
        s.t = e.params.flushed;
        s.flushed = true;
        AI.stop(e);
        rootkitSurface(e, game);
        AI.say(e, 'flushed out!', 1.2, '#ffcf4d');
      }
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      switch (s.mode) {
        case 'buried': {
          // Ziel neu waehlen, wenn noch keins da ist oder der Spieler weit davon weg ist
          if (!s.target || Math.hypot(s.target.x - p.x, s.target.y - p.y) > P.nearMax + 90) s.target = rootkitPickSpot(e, game);
          const d = Math.hypot(s.target.x - e.x, s.target.y - e.y);
          if (d < 6) {
            AI.stop(e);
            e.x = s.target.x;
            e.y = s.target.y;
            s.mode = 'tell';
            s.t = P.tell;
            B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y, sound: 'dig' });
          } else {
            AI.toward(e, s.target.x, s.target.y, e.speed);
          }
          break;
        }
        case 'tell':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            s.mode = 'up';
            s.t = P.up;
            s.flushed = false;
            rootkitSurface(e, game);
            AI.ring(game, e, P.ring, AI.shotSpeed(game, P.shotSpeed), game.rng.angle(), ROOTKIT_SHOT);
          }
          break;
        case 'up':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) { s.mode = 'dive'; s.t = P.dive; }
          break;
        case 'dive':
          AI.stop(e);
          s.t -= dt;
          if (s.t <= 0) {
            rootkitBury(e);
            s.mode = 'buried';
            s.target = null;
            B.bus.emit('enemyBurrow', { game, enemy: e, x: e.x, y: e.y, up: false });
          }
          break;
      }
    },
    draw(e, ctx) {
      const s = e.state, P = e.params;
      if (s.mode === 'buried' || s.mode === 'tell') {
        const telling = s.mode === 'tell';
        const k = telling ? 1 - s.t / P.tell : 0;
        if (telling) AI.drawTargetRing(ctx, e.x, e.y, 34, k, '#ff7a5c');
        // Staubspur hinter dem wandernden Huegel (nur Optik)
        const sp = Math.hypot(e.vx, e.vy);
        if (sp > 5) {
          ctx.save();
          ctx.fillStyle = 'rgba(200,170,110,0.35)';
          for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(e.x - (e.vx / sp) * i * 12, e.y + 8 - (e.vy / sp) * i * 12 + Math.sin(e.t * 20 + i) * 2, 5 - i, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
        const shake = telling ? Math.sin(e.t * 60) * (1.5 + 2.5 * k) : 0;
        B.drawSprite(ctx, 'enemy_rootkit_mound', e.x + shake, e.y + 6, { frame: telling ? 1 : Math.floor(e.t * 6) % 2, alpha: e.alpha });
        if (telling) AI.drawMark(ctx, '!', e.x, e.y - 26, e.t, '#ff4d4d', 22);
        return;
      }
      // dive: sinkt ab; up: Frame 1 in den ersten 0.3 s (gerade herausgeploppt)
      const sink = s.mode === 'dive' ? 1 - s.t / P.dive : 0;
      B.drawSprite(ctx, 'enemy_rootkit_mound', e.x, e.y + 10, { frame: 1, alpha: e.alpha * 0.9 });
      AI.drawBody(e, ctx, { dy: sink * 14 - 4, alpha: 1 - sink * 0.6, frame: !s.flushed && s.mode === 'up' && s.t > P.up - 0.3 ? 1 : 0 });
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // Production: Rate Limiter ('rate_limiter')
  // ===========================================================================
  //
  // Ein Token-Bucket auf Beinen. Die drei Lampen auf dem Schrank SIND die Tokens. Zustaende (state.mode):
  //   walk       stapft auf Wunschabstand (near..far) zum Spieler, dazwischen seitliches Ausweichen; Eimer voll
  //   aim        Telegraph (params.aim): bleibt stehen, Lampen blinken, gestrichelte Ziellinie folgt dem Spieler,
  //              cyanes Gluehen und "!" ('enemyWindup' ohne sound -> Familien-Sound 'servo')
  //   burst      pro Token ein gezielter Schuss im Abstand params.gap; je Schuss erlischt eine Lampe und der
  //              Drehkreuz-Rotor klackt um 60 Grad weiter (Sprite-Frame wechselt)
  //   throttled  "429" (params.throttle s): Schild ueber dem Kopf, ablaufender Retry-After-Ring, Rotor steht;
  //              kein Kontaktschaden, keine Schuesse, nimmt throttledMult-fachen Schaden ('enemyThrottle')
  //   refill     Lampen gehen nacheinander wieder an (je params.refill s, 'enemyWindup' mit sound 'token');
  //              ab hier wieder Kontaktschaden — die Lampen sind die Vorwarnung fuer die naechste Salve; dann walk
  // Gezielt wird erst mit Sichtlinie; ohne Sicht laeuft er weiter auf den Spieler zu (nach 3 s zielt er trotzdem,
  // damit er nicht ewig wandert — dann treffen die Schuesse eben den Felsen).

  const PROD_CYAN = '#5fe0ff';    // Production-Schuesse/-Lampen: Cyan hebt sich vom roten Boden ab
  const PROD_AMBER = '#ffcf4d';   // Warnfarbe (Schild, Ringe, "!")
  const PROD_SHOT = { color: PROD_CYAN };

  /** Gestrichelte Ziellinie (Production-Telegraph); k = Fortschritt 0..1 */
  function prodAimLine(ctx, x, y, ang, len, k) {
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.6 * B.M.clamp(k, 0, 1);
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -k * 36;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
    ctx.strokeStyle = PROD_CYAN;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  B.BEHAVIORS.rate_limiter = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.mode = 'walk';
      s.tokens = P.tokens;
      s.rotor = 0;            // Rotor-Stellung (zaehlt Schuesse; gerade/ungerade = Sprite-Frame)
      s.shots = 0;            // Schuesse der laufenden Salve
      s.side = game && game.rng && game.rng.chance(0.5) ? 1 : -1;
      s.t = game && game.rng ? game.rng.float(0.6, 1.2) : 1;   // erste Salve nicht sofort beim Betreten
      e.damageTakenMult = 1;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player, room = game.room;
      s.t -= dt;
      switch (s.mode) {
        case 'walk': {
          const d = AI.dist(e, p), sp = e.speed;
          if (d > P.far) AI.pathToward(e, game, p.x, p.y, sp);
          else if (d < P.near) {
            const n = B.M.norm(e.x - p.x, e.y - p.y);
            e.vx = n.x * sp;
            e.vy = n.y * sp;
          } else {
            // Im Wunschabstand: langsam seitlich, bei Kontakt mit Hindernissen Richtung wechseln
            if (s.bumped) { s.side = -s.side; s.bumped = false; }
            const n = B.M.norm(p.x - e.x, p.y - e.y);
            e.vx = -n.y * sp * 0.6 * s.side;
            e.vy = n.x * sp * 0.6 * s.side;
          }
          if (s.t <= 0 && (s.t < -3 || room.lineOfSight(e.x, e.y, p.x, p.y))) {
            AI.stop(e);
            s.mode = 'aim';
            s.t = P.aim;
            B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
          }
          break;
        }
        case 'aim':
          AI.stop(e);
          if (s.t <= 0) { s.mode = 'burst'; s.t = 0; s.shots = 0; }
          break;
        case 'burst':
          AI.stop(e);
          if (s.t > 0) break;
          if (s.tokens > 0) {
            AI.shootAt(game, e, p, AI.shotSpeed(game, P.shotSpeed), PROD_SHOT);
            s.tokens--;
            s.rotor++;
            s.shots++;
            s.t = P.gap;
          } else {
            // Eimer leer: 429 Too Many Requests
            s.mode = 'throttled';
            s.t = P.throttle;
            e.contactDamage = 0;
            e.damageTakenMult = P.throttledMult;
            B.bus.emit('enemyThrottle', { game, enemy: e, x: e.x, y: e.y - e.r });
          }
          break;
        case 'throttled':
          AI.stop(e);
          if (s.t <= 0) {
            s.mode = 'refill';
            s.t = P.refill;
            e.contactDamage = e.def.contactDamage;
            e.damageTakenMult = 1;
          }
          break;
        case 'refill':
          AI.stop(e);
          if (s.t > 0) break;
          s.tokens = Math.min(P.tokens, s.tokens + 1);
          s.lampFlash = 0.15;
          B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y - e.r, sound: 'token' });
          if (s.tokens >= P.tokens) {
            s.mode = 'walk';
            s.t = AI.cooldown(game, game.rng.float(P.walkMin, P.walkMax));
          } else s.t = P.refill;
          break;
      }
      if (s.lampFlash > 0) s.lampFlash -= dt;
    },
    draw(e, ctx, game) {
      const s = e.state, P = e.params, p = game.player;
      const walking = s.mode === 'walk' && Math.hypot(e.vx, e.vy) > 5;
      const dy = walking ? -Math.abs(Math.sin(e.t * 9)) * 3 : 0;
      const dx = s.mode === 'aim' ? Math.sin(e.t * 70) * 1.2 : 0;
      if (s.mode === 'aim' && p) {
        const k = 1 - Math.max(0, s.t) / P.aim;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        prodAimLine(ctx, e.x + Math.cos(ang) * 24, e.y + Math.sin(ang) * 24, ang, Math.min(240, AI.dist(e, p)), k);
        AI.drawGlow(ctx, e.x, e.y - 22, 14 + 8 * k, k, PROD_CYAN);
      }
      if (s.mode === 'throttled') {
        // Retry-After: Ring laeuft im Uhrzeigersinn ab
        const k = B.M.clamp(s.t / P.throttle, 0, 1);
        ctx.save();
        ctx.lineCap = 'round';
        for (const [col, w] of [['rgba(0,0,0,0.55)', 7], [PROD_AMBER, 3]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.arc(e.x, e.y + 2, e.r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * k);
          ctx.stroke();
        }
        ctx.restore();
      }
      AI.drawBody(e, ctx, { frame: s.rotor % 2, dx, dy, flipX: false });
      // Lampen = Tokens (Sprite 15x16 Art-Pixel, Massstab 4; Lampe i belegt Spalten 2+4i..4+4i, Zeilen 2..3).
      // Im Sprite leuchten alle; verbrauchte werden dunkel ueberdeckt, beim Zielen blinken die vollen weiss.
      const ox = e.x + dx - 30, oy = e.y + dy - 32;
      const blink = s.mode === 'aim' && Math.floor(e.t * 12) % 2 === 0;
      for (let i = 0; i < P.tokens; i++) {
        const x = ox + (2 + 4 * i) * 4, y = oy + 8;
        if (i >= s.tokens) {
          ctx.fillStyle = '#1b2328';
          ctx.fillRect(x, y, 12, 8);
          ctx.fillStyle = '#2f3d44';
          ctx.fillRect(x, y, 4, 4);
        } else if (blink || (s.lampFlash > 0 && i === s.tokens - 1)) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(x, y, 12, 8);
        }
      }
      if (s.mode === 'aim') AI.drawMark(ctx, '!', e.x, e.y - 40, e.t, PROD_AMBER, 22);
      if (s.mode === 'throttled' && typeof B.pixelText === 'function') {
        // "429"-Schild (wackelt leicht)
        const sx = e.x, sy = e.y - 52 + Math.sin(e.t * 5) * 1.5;
        ctx.fillStyle = '#141416';
        ctx.fillRect(sx - 25, sy - 13, 50, 26);
        ctx.fillStyle = PROD_AMBER;
        ctx.fillRect(sx - 22, sy - 10, 44, 20);
        B.pixelText(ctx, '429', sx, sy, { scale: 2, color: '#141416', align: 'center', baseline: 'middle', shadow: '' });
      }
      AI.drawSay(e, ctx);
    },
  };

  // ===========================================================================
  // Production: Port Scanner ('port_scanner' + Ports 'scanner_port')
  // ===========================================================================
  //
  // init legt params.ports Ports an (eigene Minion-Gegner, siehe scannerPickPorts) und sortiert sie im
  // Uhrzeigersinn um die Raummitte; die Portnummern steigen in dieser Reihenfolge. state.ports = Port-Gegner,
  // state.idx = aktueller/naechster Zielport. Zustaende (state.mode):
  //   dive     taucht ab (am Anfang: am eigenen Spawnpunkt), danach unsichtbar -> travel zum naechsten Port
  //   travel   unter dem Boden die Scanlinie entlang (unverwundbar, harmlos); der Zielport leuchtet schon
  //   tell     Ping am Zielport (Zielring, "!", 'enemyWindup' sound 'portPing'); steht der Spieler am Ende darauf
  //            (filterR), ist der Port "FILTERED" ('portScan' kind 'filtered') -> weiter zum naechsten Port
  //   rise     ploppt heraus ('portScan' kind 'open'); ab hier verwundbar, Kontakt 1
  //   aim      Ziellinie zum Spieler (params.aim), dann 3er-Faecher
  //   linger   bleibt kurz oben, dann dive
  // Die Reihenfolge ist fest und sichtbar (gestrichelte Scanlinie zum naechsten Port, Port-LED) — wer
  // aufpasst, zielt schon auf den naechsten Port. Sind keine Ports mehr da (z. B. per killAll), bleibt er
  // als Geschuetz oben (state.turret). Stirbt er, schliessen sich die Ports (scanner_port.afterMove).

  // Vorplaetze der Tueren (wie DOOR_FRONT in world/dungeon.js, dort privat)
  const PS_DOOR_FRONT = { up: [7, 1], down: [7, B.C.ROWS - 2], left: [1, 4], right: [B.C.COLS - 2, 4] };
  const PS_PORT_NUMBERS = [21, 22, 25, 53, 80, 443, 3000, 5432, 6379, 8080, 8443];
  const PS_UP = { rise: true, aim: true, linger: true, dive: true };   // Zustaende, in denen er sichtbar ist

  /**
   * Port-Plaetze waehlen. Nur freie Bodenkacheln (keine Stacheln, Gruben, Felsen, Objekte, Kakteen), nicht auf
   * Spawnpunkten, nicht in der Raummitte, nicht im 3x3-Bereich vor einer Tuer und nicht auf einem Port eines
   * anderen Scanners. Weit verteilt: der erste zufaellig (game.rng), dann jeweils der Kandidat mit dem groessten
   * Abstand zu den bisherigen (farthest point), solange der mindestens params.minGap betraegt.
   * @returns {{x, y, num}[]} im Uhrzeigersinn sortiert, Portnummern aufsteigend
   */
  function scannerPickPorts(e, game) {
    const room = game.room, P = e.params, rng = game.rng;
    const { TILE, COLS, ROWS, ROOM_W, ROOM_H } = B.C;
    const key = (x, y) => Math.floor(x / TILE) + ',' + Math.floor(y / TILE);
    const blocked = new Set(room.spawnPoints.map((sp) => key(sp.x, sp.y)));
    for (const o of room.enemies) if (o.id === 'port_scanner_port' && !o.dead) blocked.add(key(o.x, o.y));
    const fronts = Object.keys(room.doors).map((d) => PS_DOOR_FRONT[d]).filter(Boolean);
    const cands = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (room.tileAt(c, r) !== B.TILES.FLOOR) continue;
        const pos = room.tileCenter(c, r);
        if (blocked.has(key(pos.x, pos.y)) || (c === 7 && r === 4)) continue;
        if (fronts.some(([fc, fr]) => Math.abs(fc - c) <= 1 && Math.abs(fr - r) <= 1)) continue;
        cands.push(pos);
      }
    }
    if (!cands.length) return [];
    const out = [cands[rng.int(0, cands.length - 1)]];
    while (out.length < P.ports) {
      let best = null, bestD = -1;
      for (const c of cands) {
        let m = Infinity;
        for (const o of out) m = Math.min(m, Math.hypot(c.x - o.x, c.y - o.y));
        if (m > bestD) { bestD = m; best = c; }
      }
      if (!best || bestD < P.minGap) break;
      out.push(best);
    }
    // Uhrzeigersinn um die Raummitte (y waechst nach unten -> steigender Winkel = im Uhrzeigersinn)
    const cx = ROOM_W / 2, cy = ROOM_H / 2;
    out.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const nums = rng.shuffle(PS_PORT_NUMBERS.slice()).slice(0, out.length).sort((a, b) => a - b);
    return out.map((pos, i) => ({ x: pos.x, y: pos.y, num: nums[i] }));
  }

  /** Index des naechsten lebenden Ports nach `from` (zyklisch; der Port selbst zaehlt zuletzt), sonst -1 */
  function psNextIdx(s, from) {
    const n = s.ports.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (!s.ports[i].dead) return i;
    }
    return -1;
  }
  function psBury(e) {
    e.intangible = true;
    e.contactDamage = 0;
    e.noShadow = true;
    e.noHpBar = true;
  }
  function psSurface(e) {
    e.intangible = false;
    e.contactDamage = e.def.contactDamage;
    e.noShadow = false;
    e.noHpBar = false;
  }
  /** Gestrichelte Scanlinie zwischen zwei Punkten (Reihenfolge der Ports) */
  function psScanLine(ctx, x0, y0, x1, y1, alpha, t) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([4, 8]);
    ctx.lineDashOffset = -t * 40;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = PROD_CYAN;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  B.BEHAVIORS.port_scanner = {
    init(e, game) {
      const s = e.state, P = e.params;
      s.ports = [];
      s.idx = -1;
      s.mode = 'dive';
      s.t = P.dive;
      s.aimA = 0;
      s.turret = false;
      s.scans = 0;            // wie oft er aufgetaucht ist (Tests)
      e.static = true;        // Position setzt das Verhalten direkt
      e.flying = true;
      e.noKnockback = true;
      e.noSeparate = true;
      const def = B.ENEMIES.port_scanner_port;
      if (!def || !game || !game.room || !game.rng) return;
      for (const pt of scannerPickPorts(e, game)) {
        const port = new B.Enemy(def, 'port_scanner_port', pt.x, pt.y, game, 1);
        port.state.owner = e;
        port.state.num = pt.num;
        port.spawnDelay = 0;
        game.room.enemies.push(port);
        s.ports.push(port);
      }
      // Erster Zielport: der naechstgelegene (idx steht einen davor, weil dive "weiterzaehlt")
      let best = Infinity, near = 0;
      s.ports.forEach((pt, i) => { const d = Math.hypot(pt.x - e.x, pt.y - e.y); if (d < best) { best = d; near = i; } });
      if (s.ports.length) s.idx = (near + s.ports.length - 1) % s.ports.length;
    },
    update(e, dt, game) {
      const s = e.state, P = e.params, p = game.player;
      AI.stop(e);
      s.t -= dt;
      let port = s.idx >= 0 ? s.ports[s.idx] : null;
      // Zielport verschwunden (killAll o. ae.): naechsten nehmen oder als Geschuetz auftauchen
      if ((s.mode === 'travel' || s.mode === 'tell') && (!port || port.dead)) {
        const ni = psNextIdx(s, s.idx);
        if (ni < 0) {
          s.turret = true;
          psSurface(e);
          s.mode = 'aim';
          s.t = P.aim;
          return;
        }
        s.idx = ni;
        port = s.ports[ni];
        s.mode = 'travel';
      }
      switch (s.mode) {
        case 'dive':
          if (s.t > 0) break;
          psBury(e);
          s.idx = psNextIdx(s, s.idx);
          if (s.idx < 0) { s.turret = true; psSurface(e); s.mode = 'aim'; s.t = P.aim; break; }
          s.mode = 'travel';
          break;
        case 'travel': {
          const dx = port.x - e.x, dy = port.y - e.y, d = Math.hypot(dx, dy), step = P.travel * dt;
          if (d <= step) {
            e.x = port.x;
            e.y = port.y;
            s.mode = 'tell';
            s.t = P.tell;
            B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y, sound: 'portPing' });
          } else {
            e.x += (dx / d) * step;
            e.y += (dy / d) * step;
          }
          break;
        }
        case 'tell':
          if (s.t > 0) break;
          if (Math.hypot(p.x - port.x, p.y - port.y) < P.filterR) {
            // Spieler steht auf dem Port: gefiltert -> weiter zum naechsten (taucht nie unter ihm auf)
            port.state.filteredT = 1;
            B.bus.emit('portScan', { game, enemy: e, x: port.x, y: port.y, kind: 'filtered' });
            s.idx = psNextIdx(s, s.idx);
            s.mode = 'travel';
          } else {
            psSurface(e);
            s.mode = 'rise';
            s.t = P.rise;
            s.scans++;
            B.bus.emit('portScan', { game, enemy: e, x: e.x, y: e.y, kind: 'open' });
          }
          break;
        case 'rise':
          if (s.t <= 0) { s.mode = 'aim'; s.t = P.aim; }
          break;
        case 'aim':
          s.aimA = AI.angleTo(e, p);
          if (s.t > 0) break;
          AI.fanAngle(game, e, s.aimA, P.fan, P.spread, AI.shotSpeed(game, P.shotSpeed), PROD_SHOT);
          s.mode = 'linger';
          s.t = P.linger;
          break;
        case 'linger':
          if (s.t > 0) break;
          if (s.turret) { s.mode = 'aim'; s.t = P.aim + AI.cooldown(game, 0.8); }
          else { s.mode = 'dive'; s.t = P.dive; }
          break;
      }
    },
    draw(e, ctx, game) {
      const s = e.state, P = e.params;
      const port = s.idx >= 0 ? s.ports[s.idx] : null;
      // Scanlinie: unter dem Boden zum Zielport (mit wanderndem "Paket"), oben schwach zum naechsten Port
      if (s.mode === 'travel' && port && !port.dead) {
        psScanLine(ctx, e.x, e.y, port.x, port.y, 0.85, e.t);
        ctx.fillStyle = '#141416';
        ctx.fillRect(e.x - 6, e.y - 6, 12, 12);
        ctx.fillStyle = PROD_CYAN;
        ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
        return;
      }
      if (PS_UP[s.mode] && !s.turret && port) {
        const ni = psNextIdx(s, s.idx);
        if (ni >= 0 && ni !== s.idx) psScanLine(ctx, e.x, e.y, s.ports[ni].x, s.ports[ni].y, 0.3, e.t);
      }
      if (s.mode === 'tell') {
        const k = 1 - Math.max(0, s.t) / P.tell;
        AI.drawTargetRing(ctx, e.x, e.y + 4, 30, k, PROD_CYAN);
        AI.drawMark(ctx, '!', e.x, e.y - 22, e.t, PROD_AMBER, 22);
        return;
      }
      if (!PS_UP[s.mode]) return;
      let up = 1;
      if (s.mode === 'rise') up = 1 - Math.max(0, s.t) / P.rise;
      else if (s.mode === 'dive') up = Math.max(0, s.t) / P.dive;
      if (s.mode === 'aim') {
        const k = 1 - Math.max(0, s.t) / P.aim;
        prodAimLine(ctx, e.x + Math.cos(s.aimA) * 22, e.y + Math.sin(s.aimA) * 22, s.aimA, 200, k);
      }
      // Faehrt aus dem Port heraus: unterhalb der Lochkante abgeschnitten
      ctx.save();
      ctx.beginPath();
      ctx.rect(e.x - 40, e.y - 100, 80, 106);
      ctx.clip();
      const frame = s.mode === 'aim' ? (Math.cos(s.aimA) < 0 ? 0 : 1) : Math.floor(e.t * 4) % 2;
      AI.drawBody(e, ctx, { dy: -14 + (1 - up) * 48, frame, flipX: false });
      ctx.restore();
      AI.drawSay(e, ctx);
    },
  };

  B.BEHAVIORS.scanner_port = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noHpBar = true;
      e.noSeparate = true;
      e.noShadow = true;
      e.ignoreForClear = true;   // nur der Scanner zaehlt fuers Clearing
      e.intangible = true;       // Schuesse fliegen darueber hinweg
      e.contactDamage = 0;
      e.drawLayer = -1;          // Bodenbuchse: unter allen anderen Figuren
      e.state.closeT = 0;
      e.state.filteredT = 0;
    },
    update(e) { AI.stop(e); },
    // afterMove laeuft jeden Tick (auch eingefroren): Filter-Anzeige ablaufen lassen, nach dem Scanner schliessen
    afterMove(e, dt) {
      const s = e.state;
      if (s.filteredT > 0) s.filteredT -= dt;
      if (s.owner && !s.owner.dead) return;
      s.closeT += dt;
      if (s.closeT >= 0.4) e.dead = true;   // still verschwinden: kein Kill, keine Beute
    },
    draw(e, ctx) {
      const s = e.state, o = s.owner, os = o && !o.dead ? o.state : null;
      const k = os ? 1 : Math.max(0, 1 - s.closeT / 0.4);
      const mine = !!os && os.ports[os.idx] === e;
      const target = mine && (os.mode === 'travel' || os.mode === 'tell');
      const here = mine && !!PS_UP[os.mode];
      const ni = os ? psNextIdx(os, os.idx) : -1;
      const next = !!os && !mine && ni >= 0 && os.ports[ni] === e;
      // LED an, wenn er hier ist oder hierher unterwegs ist; beim Ping blinkt sie
      const lit = here || (target && (os.mode === 'travel' || Math.floor(o.t * 10) % 2 === 0));
      B.drawSprite(ctx, 'enemy_port_scanner_port', e.x, e.y, { frame: lit ? 1 : 0, alpha: k, scale: 0.6 + 0.4 * k });
      if (s.filteredT > 0) {
        // Gefiltert: bernsteinfarbenes X ueber der Buchse
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.filteredT * 2);
        ctx.lineCap = 'round';
        for (const [col, w] of [['#141416', 8], [PROD_AMBER, 4]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(e.x - 14, e.y - 12);
          ctx.lineTo(e.x + 14, e.y + 12);
          ctx.moveTo(e.x + 14, e.y - 12);
          ctx.lineTo(e.x - 14, e.y + 12);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (typeof B.pixelText === 'function' && s.num) {
        const col = target || here ? PROD_CYAN : next ? '#c4ced8' : '#8a929c';
        B.pixelText(ctx, String(s.num), e.x, e.y + 26, { scale: 2, color: col, align: 'center', baseline: 'middle', alpha: k });
      }
    },
  };

  B.AI = AI;
  B.Enemy = Enemy;
})(window.BOTA);
