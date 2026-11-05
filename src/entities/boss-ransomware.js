/*
 * boss-ransomware.js — Ransomware (BOTA.BOSS_BEHAVIORS.ransomware), Daten in data/bosses.js.
 *
 * Spaeter Boss ab Etage 8, Heimat /dev/null: ein verseuchtes Fenster mit Vorhaengeschloss, das wie der Graphics Glitch
 * flackernd von Ort zu Ort springt. Er greift weniger den Spieler an als dessen Werkzeuge. Immer nur ein Angriff auf
 * einmal (die Lehre aus dem Octopus-Merge-Playtest vom 2026-11-05):
 *
 *   payload  Gluehen, dann zwei gezielte Faecher. Phase 2: dazu ein Ring.
 *   lock     Fliegende Vorhaengeschloesser (LockShot, langsam, leicht zielsuchend, abschiessbar, kein Schaden). Eines
 *            trifft: etwas wird "verschluesselt" (player.encrypted): das Aktiv-Item, die Force Pushes oder die
 *            Feuerrate. Dazu ein Schluessel-Fragment irgendwo im Raum (Minion ransom_key) und das Zahl-Terminal.
 *   popups   Falsche Fenster landen als Hindernisse (PopupWindow): sie schieben den Spieler weg, schlucken seine
 *            Schuesse und gehen nur ueber ihr kleines X (Minion popup_close) oder nach RW.popLife Sekunden zu.
 *   jump     Nach jedem Angriff: Flackern, Geisterbild am Ziel, Sprung. Phase 2: Ring bei der Ankunft.
 *
 * Entschluesseln: ein Fragment abschiessen gibt das aelteste Schloss frei; das Terminal (RansomTerminal) gibt fuer
 * Credits alles auf einmal frei und wird danach teurer. Beides kostet etwas: Zeit oder Geld. Schloesser gelten nur in
 * diesem Kampf: onDeath und game.enterFloor raeumen sie weg.
 *
 * Countdown: "DELETION IN 0:27" in der Boss-Leiste (barText). Bei null zaehlt, ob der Spieler seit dem letzten Mal
 * RW.clockDmg seiner HP abgezogen hat: dann "Deadline extended", sonst "wipe": Spalten des Raums leuchten auf, jede
 * vierte bleibt sicher; nach der Warnzeit trifft es alle anderen (volles Herz). Phase 2: ein zweiter Durchgang.
 *
 * Fenster halten immer RW.popGap Abstand zu Waenden, Felsen und anderen Fenstern. So bleibt um jedes Fenster ein Gang,
 * der Raum zerfaellt nie (Memory-Hog-Regel). Vor dem Wipe gehen alle Fenster zu, damit sichere Spalten frei sind.
 */
'use strict';

(function (B) {
  const AI = B.AI, BH = B.BossHelpers;
  const { TILE, COLS, INNER } = B.C;
  const TAU = Math.PI * 2;

  const RW = {
    clock: [30, 22], clockDmg: 0.12,
    idle: [1.1, 0.75],
    jumpTell: 0.55, jumpMin: 220,
    shotTell: 0.6, shotGap: 0.32, shotSpeed: 205, ringSpeed: 185,
    lockTell: 0.7, lockSpeed: 170, lockTurn: 1.6, lockLife: 4.5, lockCount: [1, 2], maxLocks: [2, 3],
    popCount: [2, 3], popMax: [3, 4], popTell: 0.8, popLife: 9, popW: 150, popH: 100, popGap: 72,
    wipeTell: [1.4, 1.2], wipeHit: 0.3, wipeEvery: 4,
    price: 6,
  };
  const SHOT_A = { color: '#e040c0' };
  const SHOT_B = { color: '#40d8e0' };
  const WARN = '#e040c0';
  const SAFE = '#5fe05f';
  const POPUP_TEXT = [['YOU WON!', 'CLAIM NOW'], ['FREE RAM', 'NO CATCH'], ['1 NEW VIRUS', 'INSTALL?'], ['HOT UPDATES', 'IN YOUR AREA'], ['CONGRATS!', 'VISITOR #1']];
  const LOCK_NAMES = { active: 'ACTIVE ITEM', pushes: 'FORCE PUSHES', fire: 'FIRE RATE' };

  const rectGap = (a, b, g) => a.x - g < b.x + b.w && a.x + a.w + g > b.x && a.y - g < b.y + b.h && a.y + a.h + g > b.y;
  const overlays = (game, flag) => game.room.pickups.filter((o) => o[flag] && !o.dead);

  /** Falsches Fenster: Telegraph (gestrichelter Rahmen), dann Hindernis, bis sein X getroffen ist */
  class PopupWindow {
    constructor(owner, rect, text) {
      Object.assign(this, rect);
      this.owner = owner;
      this.text = text;
      this.mode = 'tell';
      this.t = RW.popTell;
      this.r = 0;
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -1;
      this.popupWindow = true;
      this.close = null;
    }
    shut() {
      this.dead = true;
      if (this.close) this.close.dead = true;
    }
    update(dt, game) {
      if (this.owner.dead) { this.shut(); return; }
      this.t -= dt;
      if (this.mode === 'tell') {
        if (this.t > 0) return;
        this.mode = 'open';
        this.t = RW.popLife;
        const c = game.spawnEnemy('popup_close', this.x + this.w - 13, this.y + 11);
        if (c) { c.state.owner = this.owner; c.spawnDelay = 0; this.close = c; }
        B.bus.emit('bossPopup', { game, x: this.x + this.w / 2, y: this.y + this.h / 2 });
      }
      if (this.t <= 0 || !this.close || this.close.dead) { this.shut(); return; }
      const p = game.player;
      const push = B.M.circleRectPush(p.x, p.y, p.r, this.x, this.y, this.w, this.h);
      if (push) { p.x += push.x; p.y += push.y; }
      // Der Fensterkoerper schluckt Schuesse; nur das X und durchdringende Geisterschuesse kommen durch
      for (const pr of game.room.projectiles) {
        if (pr.team !== 'player' || pr.dead || pr.flags.spectral) continue;
        if (pr.x < this.x || pr.x > this.x + this.w || pr.y < this.y || pr.y > this.y + this.h) continue;
        if (Math.hypot(pr.x - this.close.x, pr.y - this.close.y) < 26) continue;
        if (typeof pr.die === 'function') pr.die(game, false);
      }
    }
    draw(ctx) {
      const { x, y, w, h } = this;
      if (this.mode === 'tell') {
        const k = 1 - Math.max(0, this.t) / RW.popTell;
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.45 * k;
        ctx.strokeStyle = WARN;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(x, y, w, h);
        ctx.globalAlpha = 0.1 + 0.2 * k;
        ctx.fillStyle = WARN;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 5, y + 6, w, h);
      ctx.fillStyle = '#1c1826';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e040c0';
      ctx.fillRect(x, y, w, 22);
      ctx.strokeStyle = '#ff8ae6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
      B.pixelText(ctx, this.text[0], x + w / 2, y + 48, { scale: 2, align: 'center', baseline: 'middle', color: '#f2c14e', shadow: false });
      B.pixelText(ctx, this.text[1], x + w / 2, y + 74, { scale: 1, align: 'center', baseline: 'middle', color: '#5fe05f', shadow: false });
      // Die Restzeit laeuft unten als Balken ab
      ctx.fillStyle = '#5fe05f';
      ctx.fillRect(x + 8, y + h - 8, (w - 16) * Math.max(0, this.t) / RW.popLife, 3);
    }
  }

  /** Fliegendes Schloss: kein Schaden, aber wer getroffen wird, verliert etwas. Abschiessbar. */
  class LockShot {
    constructor(owner, x, y, a) {
      this.owner = owner;
      this.x = x; this.y = y; this.a = a;
      this.r = 11;
      this.t = RW.lockLife;
      this.dead = false;
      this.noShadow = false;
      this.lockShot = true;
    }
    update(dt, game) {
      const p = game.player;
      this.t -= dt;
      if (this.owner.dead || this.t <= 0) { this.dead = true; return; }
      this.a = AI.turn(this.a, Math.atan2(p.y - this.y, p.x - this.x), RW.lockTurn * dt);
      this.x += Math.cos(this.a) * RW.lockSpeed * dt;
      this.y += Math.sin(this.a) * RW.lockSpeed * dt;
      if (this.x < INNER.x0 || this.x > INNER.x1 || this.y < INNER.y0 || this.y > INNER.y1) { this.dead = true; return; }
      for (const pr of game.room.projectiles) {
        if (pr.team !== 'player' || pr.dead || !(pr.damage > 0)) continue;
        if (Math.hypot(pr.x - this.x, pr.y - this.y) < this.r + 6) {
          if (typeof pr.die === 'function') pr.die(game, false);
          this.dead = true;
          B.bus.emit('bossDecrypt', { game, x: this.x, y: this.y, text: 'blocked' });
          return;
        }
      }
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r * 0.7) {
        this.dead = true;
        encrypt(this.owner, game);
      }
    }
    draw(ctx) {
      B.drawSprite(ctx, 'shot_ransom_lock', this.x, this.y, { frame: 0 });
    }
  }

  /** Zahl-Terminal: drauftreten bezahlt, wenn das Geld reicht */
  class RansomTerminal {
    constructor(owner, x, y) {
      this.owner = owner;
      this.x = x; this.y = y;
      this.r = 22;
      this.dead = false;
      this.ransomTerminal = true;
      this.on = false;   // steht der Spieler gerade drauf? (nur beim Betreten buchen)
    }
    update(dt, game) {
      if (this.owner.dead) { this.dead = true; return; }
      const p = game.player, on = Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r;
      if (on && !this.on) pay(this.owner, game);
      this.on = on;
    }
    draw(ctx) {
      B.drawSprite(ctx, 'ransom_terminal', this.x, this.y, { frame: Math.floor(this.owner.t * 3) % 2 });
      B.pixelText(ctx, 'PAY ' + this.owner.state.price + 'C', this.x, this.y - 42, { scale: 1, align: 'center', baseline: 'middle', color: '#f2c14e', outline: true });
    }
  }

  /** Bodenanzeige des Wipes: liegt unter allem, damit Spieler und Schuesse sichtbar bleiben */
  class WipeMark {
    constructor(owner) {
      this.owner = owner;
      this.x = 0; this.y = 0; this.r = 0;
      this.dead = false;
      this.noShadow = true;
      this.drawLayer = -2;
    }
    update() { if (this.owner.dead) this.dead = true; }
    draw(ctx) {
      const w = this.owner.state.wipe;
      if (!w) return;
      const hit = this.owner.state.mode === 'wipeHit';
      const k = hit ? 1 : 1 - Math.max(0, w.t) / w.tell;
      ctx.save();
      for (let c = 1; c < COLS - 1; c++) {
        const safe = w.safe.has(c);
        ctx.globalAlpha = safe ? 0.1 + 0.14 * k : hit ? 0.75 : 0.12 + 0.3 * k + 0.06 * Math.sin(this.owner.t * 24);
        ctx.fillStyle = safe ? SAFE : hit ? '#ffd0f2' : WARN;
        ctx.fillRect(c * TILE + 2, INNER.y0, TILE - 4, INNER.y1 - INNER.y0);
      }
      ctx.restore();
    }
  }

  /** Freie Stelle im Raum, weit genug von Boss und Spieler, nicht in einem Fenster */
  function freeSpot(e, game, minBoss, minPlayer) {
    const p = game.player, room = game.room, rng = game.rng;
    const wins = overlays(game, 'popupWindow');
    let x = 0, y = 0;
    for (let i = 0; i < 60; i++) {
      x = rng.float(INNER.x0 + 70, INNER.x1 - 70);
      y = rng.float(INNER.y0 + 60, INNER.y1 - 60);
      const t = room.worldToTile(x, y);
      if (room.isSolid(t.c, t.r, 'walk', false)) continue;
      if (Math.hypot(x - e.x, y - e.y) < minBoss || Math.hypot(x - p.x, y - p.y) < minPlayer) continue;
      if (wins.some((w) => rectGap({ x: x - 40, y: y - 40, w: 80, h: 80 }, w, 0))) continue;
      return { x, y };
    }
    // Kein Platz gefunden: lieber nah am Spieler als unter einem Fenster
    for (const w of wins) w.shut();
    return game.nearestFreePos(x, y);
  }

  /** Platz fuer ein Fenster: RW.popGap Abstand zu Waenden, Hindernissen und Fenstern; nicht auf Spieler oder Boss */
  function windowSpot(e, game) {
    const rng = game.rng, room = game.room, p = game.player, G = RW.popGap, w = RW.popW, h = RW.popH;
    const wins = overlays(game, 'popupWindow');
    // Was erreichbar bleiben muss: das Terminal zum Betreten, die Fragmente zum Abschiessen
    const keep = overlays(game, 'ransomTerminal').concat(game.room.enemies.filter((m) => m.id === 'ransom_key' && !m.dead));
    for (let i = 0; i < 40; i++) {
      const r = { x: rng.float(INNER.x0 + G, INNER.x1 - G - w), y: rng.float(INNER.y0 + G, INNER.y1 - G - h), w, h };
      if (wins.some((o) => rectGap(r, o, G))) continue;
      if (keep.some((o) => rectGap(r, { x: o.x, y: o.y, w: 0, h: 0 }, 60))) continue;
      if (rectGap(r, { x: p.x, y: p.y, w: 0, h: 0 }, 100)) continue;
      if (rectGap(r, { x: e.x, y: e.y, w: 0, h: 0 }, e.r + 20)) continue;
      let blocked = false;
      for (let c = Math.floor((r.x - G) / TILE); c <= Math.floor((r.x + w + G) / TILE) && !blocked; c++) {
        for (let q = Math.floor((r.y - G) / TILE); q <= Math.floor((r.y + h + G) / TILE); q++) {
          if (c >= 1 && q >= 1 && c < COLS - 1 && q < B.C.ROWS - 1 && room.isSolid(c, q, 'walk', false)) { blocked = true; break; }
        }
      }
      if (!blocked) return r;
    }
    return null;
  }

  /** Etwas verschluesseln; Fragment und Terminal dazu */
  function encrypt(e, game) {
    const s = e.state, p = game.player;
    const open = ['active', 'pushes', 'fire'].filter((k) => !p.encrypted[k] && (k !== 'active' || p.active) && (k !== 'pushes' || p.pushes > 0));
    if (!open.length) return;
    const what = game.rng.pick(open);
    p.encrypted[what] = true;
    p.recalcStats();
    s.locks.push(what);
    game.glitchHud(6);
    const pos = freeSpot(e, game, 180, 150);
    const key = game.spawnEnemy('ransom_key', pos.x, pos.y);
    if (key) key.state.owner = e;
    if (!overlays(game, 'ransomTerminal').length) {
      const t = freeSpot(e, game, 120, 200);
      game.room.pickups.push(new RansomTerminal(e, t.x, t.y));
    }
    B.bus.emit('bossEncrypt', { game, x: p.x, y: p.y, text: LOCK_NAMES[what] + ' ENCRYPTED' });
  }

  function unlock(e, game, what) {
    const s = e.state, p = game.player;
    p.encrypted[what] = false;
    p.recalcStats();
    s.locks.splice(s.locks.indexOf(what), 1);
    if (!s.locks.length) for (const t of overlays(game, 'ransomTerminal')) t.dead = true;
  }

  function pay(e, game) {
    const s = e.state, p = game.player;
    if (p.credits < s.price) { B.bus.emit('denied', { game, reason: 'credits' }); return; }
    p.credits -= s.price;
    B.bus.emit('purchase', { game, price: s.price });
    for (const what of s.locks.slice()) unlock(e, game, what);
    for (const m of game.room.enemies) if (m.id === 'ransom_key' && m.state.owner === e) m.dead = true;
    s.price += RW.price * s.phase;
    AI.say(e, 'Thank you for your payment.', 1.6, '#f2c14e');
    B.bus.emit('bossDecrypt', { game, x: p.x, y: p.y, text: 'DECRYPTED' });
  }

  function jumpTarget(e, game) {
    const rng = game.rng, p = game.player;
    const wins = overlays(game, 'popupWindow');
    let best = { x: e.x, y: e.y }, bestD = -1;
    for (let i = 0; i < 24; i++) {
      const x = rng.float(INNER.x0 + 110, INNER.x1 - 110), y = rng.float(INNER.y0 + 90, INNER.y1 - 90);
      const r = { x: x - e.r, y: y - e.r, w: e.r * 2, h: e.r * 2 };
      if (wins.some((w) => rectGap(r, w, 0))) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d >= RW.jumpMin && Math.hypot(x - e.x, y - e.y) > 120) return { x, y };
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  function goIdle(e, game) {
    const s = e.state;
    s.mode = 'idle';
    s.t = AI.cooldown(game, RW.idle[s.phase - 1]);
  }

  function startJump(e, game) {
    const s = e.state;
    s.to = jumpTarget(e, game);
    s.mode = 'jumpTell';
    s.t = RW.jumpTell;
  }

  /** Naechster Angriff; was gerade nicht geht (Schloss-Grenze, kein Platz), wird zur Salve */
  function nextAttack(e, game) {
    const s = e.state, i = s.phase - 1;
    const want = ['payload', 'lock', 'payload', 'popups'][s.turn++ % 4];
    const p = game.player;
    const canLock = s.locks.length < RW.maxLocks[i] && ['active', 'pushes', 'fire'].some((k) => !p.encrypted[k] && (k !== 'active' || p.active) && (k !== 'pushes' || p.pushes > 0));
    if (want === 'lock' && canLock) {
      s.mode = 'lockTell';
      s.t = RW.lockTell;
      AI.say(e, 'Encrypting...', 1.0, '#ff8ae6');
    } else if (want === 'popups' && overlays(game, 'popupWindow').length < RW.popMax[i]) {
      s.mode = 'popTell';
      s.t = 0.3;
      const free = RW.popMax[i] - overlays(game, 'popupWindow').length;
      for (let n = 0; n < Math.min(RW.popCount[i], free); n++) {
        const r = windowSpot(e, game);
        if (r) game.room.pickups.push(new PopupWindow(e, r, game.rng.pick(POPUP_TEXT)));
      }
    } else {
      s.mode = 'shotTell';
      s.t = RW.shotTell;
      s.volleys = 2;
    }
  }

  function startWipe(e, game, pass) {
    const s = e.state, i = s.phase - 1;
    for (const w of overlays(game, 'popupWindow')) w.shut();
    const first = s.wipe ? (s.wipe.offset + 2) % RW.wipeEvery : game.rng.int(0, RW.wipeEvery - 1);
    const safe = new Set();
    for (let c = 1 + first; c < COLS - 1; c += RW.wipeEvery) safe.add(c);
    s.wipe = { offset: first, safe, pass, t: RW.wipeTell[i], tell: RW.wipeTell[i] };
    s.mode = 'wipeTell';
    if (pass === 1) { game.banner('DELETING', 'Stand on the green sectors.'); AI.say(e, 'Time is up.', 1.4, '#ff8ae6'); }
    B.bus.emit('bossWipe', { game, kind: 'warn', x: e.x, y: e.y });
  }

  function resetClock(e) {
    const s = e.state;
    s.clock = RW.clock[s.phase - 1];
    s.dmg = 0;
  }

  B.BOSS_BEHAVIORS.ransomware = {
    init(e, game) {
      BH.placeAwayFromPlayer(e, game, 320);
      const s = e.state;
      s.fx = [];
      s.phase = 1;
      s.mode = 'idle';
      s.t = 1.2;
      s.turn = 0;
      s.locks = [];
      s.price = RW.price;
      s.wipe = null;
      s.lastHp = e.hp;
      resetClock(e);
      e.sayOffset = 16;
      if (game.room) game.room.pickups.push(new WipeMark(e));
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      BH.updateFx(e, dt);
      AI.stop(e);
      s.dmg += Math.max(0, s.lastHp - e.hp);
      s.lastHp = e.hp;

      if (s.phase === 1 && e.hp <= e.maxHp * 0.5) {
        s.phase = 2;
        s.price *= 2;
        BH.clearEnemyShots(game);
        game.shake(8, 0.4);
        game.banner('FINAL NOTICE', 'The price has doubled.');
        B.bus.emit('bossPhase', { game, boss: e, phase: 2 });
        resetClock(e);
      }

      if (s.mode !== 'wipeTell' && s.mode !== 'wipeHit') s.clock -= dt;
      s.t -= dt;

      switch (s.mode) {
        case 'idle':
          if (s.clock <= 0) {
            if (s.dmg >= e.maxHp * RW.clockDmg) {
              resetClock(e);
              AI.say(e, 'Deadline extended.', 1.4, '#ff8ae6');
            } else {
              s.wipe = null;
              startWipe(e, game, 1);
            }
          } else if (s.t <= 0) nextAttack(e, game);
          break;

        case 'jumpTell':
          if (s.t <= 0) {
            e.x = s.to.x;
            e.y = s.to.y;
            s.to = null;
            BH.addWave(e, e.x, e.y, 70, WARN, 0.3);
            if (s.phase === 2) AI.ring(game, e, 8, AI.shotSpeed(game, RW.ringSpeed), game.rng.angle(), SHOT_B);
            goIdle(e, game);
          }
          break;

        case 'shotTell':
          if (s.t <= 0) {
            AI.fan(game, e, p, 5, 0.2, AI.shotSpeed(game, RW.shotSpeed), s.volleys % 2 ? SHOT_B : SHOT_A);
            s.volleys--;
            s.t = RW.shotGap;
            if (s.volleys <= 0) {
              if (s.phase === 2) AI.ring(game, e, 10, AI.shotSpeed(game, RW.ringSpeed), game.rng.angle(), SHOT_B);
              startJump(e, game);
            }
          }
          break;

        case 'lockTell':
          if (s.t <= 0) {
            const a = AI.angleTo(e, p), n = RW.lockCount[s.phase - 1];
            for (let i = 0; i < n; i++) game.room.pickups.push(new LockShot(e, e.x, e.y, a + (i - (n - 1) / 2) * 0.7));
            startJump(e, game);
          }
          break;

        case 'popTell':
          if (s.t <= 0) startJump(e, game);
          break;

        case 'wipeTell':
          s.wipe.t -= dt;
          if (s.wipe.t <= 0) {
            s.mode = 'wipeHit';
            s.t = RW.wipeHit;
            game.shake(9, 0.3);
            B.bus.emit('bossWipe', { game, kind: 'hit', x: e.x, y: e.y });
          }
          break;

        case 'wipeHit': {
          const c = Math.floor(p.x / TILE);
          if (!s.wipe.safe.has(c)) p.hurt(2, e.def.name, game);
          if (s.t <= 0) {
            if (s.phase === 2 && s.wipe.pass === 1) startWipe(e, game, 2);
            else { s.wipe = null; resetClock(e); startJump(e, game); }
          }
          break;
        }
      }
    },

    barText(e) {
      const s = e.state;
      if (s.wipe) return { text: 'DELETING...', color: '#ff8ae6' };
      const left = Math.max(0, Math.ceil(s.clock));
      const text = 'DELETION IN 0:' + String(left).padStart(2, '0');
      return { text, color: left <= 8 ? '#ff5a5a' : '#f2c14e' };
    },

    onDeath(e, game) {
      const p = game.player;
      p.encrypted = {};
      p.recalcStats();
      for (const m of game.room.enemies) {
        if ((m.id === 'ransom_key' || m.id === 'popup_close') && m.state.owner === e) m.dead = true;
      }
      B.bus.emit('bossDecrypt', { game, x: e.x, y: e.y, text: 'DECRYPTED' });
    },

    draw(e, ctx) {
      const s = e.state;
      BH.drawFx(e, ctx);
      const flicker = s.mode === 'jumpTell';
      if (flicker && s.to) {
        const k = 1 - Math.max(0, s.t) / RW.jumpTell;
        BH.drawSprite(e, ctx, e.def.sprite, s.to.x, s.to.y, { frame: 1, alpha: 0.2 + 0.4 * k });
        AI.drawTargetRing(ctx, s.to.x, s.to.y, e.r + 6, k, WARN);
      }
      if (s.mode === 'shotTell' || s.mode === 'lockTell') {
        const total = s.mode === 'lockTell' ? RW.lockTell : RW.shotTell;
        AI.drawGlow(ctx, e.x, e.y, e.r + 14, 0.3 + 0.6 * (1 - Math.max(0, s.t) / total), s.mode === 'lockTell' ? '#f2c14e' : WARN);
      }
      const torn = flicker ? Math.floor(e.t * 18) % 2 : Math.floor(e.t * 5) % 9 === 0;
      BH.drawSprite(e, ctx, e.def.sprite, e.x + (flicker ? Math.sin(e.t * 70) * 3 : 0), e.y, {
        frame: torn ? 1 : 0,
        alpha: flicker ? 0.75 : (e.spawnDelay > 0 ? 0.6 : 1),
      });
      BH.drawFrost(e, ctx);
      AI.drawSay(e, ctx);
    },
  };

  // Schluessel-Fragment: schwebt auf der Stelle; abgeschossen gibt es das aelteste Schloss frei
  B.BEHAVIORS.ransom_key = {
    init(e) {
      e.static = true;
      e.noKnockback = true;
      e.noSeparate = true;
      e.ignoreForClear = true;
      e.contactDamage = 0;
    },
    update(e) { AI.stop(e); },
    onDeath(e, game) {
      const o = e.state.owner;
      if (!o || o.dead || !o.state.locks.length) return;
      unlock(o, game, o.state.locks[0]);
      B.bus.emit('bossDecrypt', { game, x: e.x, y: e.y, text: 'DECRYPTED' });
    },
  };

  // Das kleine X eines Fensters: ein Treffer genuegt. Das Fenster bemerkt, dass es weg ist.
  B.BEHAVIORS.popup_close = {
    init(e) {
      e.hp = e.maxHp = 1;   // ohne die Tiefen-Skalierung: ein Treffer genuegt immer
      e.static = true;
      e.noKnockback = true;
      e.noSeparate = true;
      e.noHpBar = true;
      e.noShadow = true;
      e.ignoreForClear = true;
      e.contactDamage = 0;
      e.drawLayer = 0;
    },
    update(e) { AI.stop(e); },
  };

  BH.ransom = { RW, encrypt, windowSpot };   // fuer den Smoke-Test
})(window.BOTA);
