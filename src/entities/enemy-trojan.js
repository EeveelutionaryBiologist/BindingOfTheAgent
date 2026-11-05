/*
 * enemy-trojan.js — Trojan (BOTA.BEHAVIORS.trojan), Daten in data/enemies.js.
 *
 * Malware fuer zwischendurch: ein Bonus-Gegner ab Etage 5 (wie die Hallucination ausserhalb des Budgets), der als
 * zerstoerbares Objekt der Etage getarnt herumsteht (Kiste, Paket, Busch ...) und genauso gezeichnet wird wie ein
 * echtes (drawProps in renderer.js: Kachelmitte, gleicher Schatten).
 *
 *   disguised  Steht still. Schuesse prallen wie an einem echten Objekt ab. Wie bei der Hallucination ist er dabei
 *              intangible und ignoreForClear, damit ihn zielsuchende Schuesse, Followers, Code Review und der
 *              Calculator nicht verraten; den Schuss-Treffer prueft er deshalb selbst.
 *   reveal     Der Spieler kommt nah heran, trifft ihn oder eine Explosion erwischt ihn: das Objekt wackelt
 *              TROJAN.tell Sekunden mit "!" (Telegraph).
 *   burst      Es zerbricht wie ein echtes Objekt, dabei ein Ring aus 6 Schuessen; heraus kommt das Holzpferd.
 *   chase      Rollt auf den Spieler zu, oeffnet alle paar Sekunden die Luke (Gluehen) und feuert einen 3er-Faecher.
 *
 * Enttarnt in einem schon geraeumten Raum bleibt er ignoreForClear (wie die Hallucination): die Tueren bleiben offen.
 */
'use strict';

(function (B) {
  const AI = B.AI;
  const { TILE } = B.C;

  const TROJAN = {
    near: 100,            // Abstand zum Spieler, ab dem er sich enttarnt
    tell: 0.6,            // Wackeln vor dem Aufplatzen
    shotR: 28,            // Trefferkreis des getarnten Objekts fuer Spielerschuesse
    ring: 6, ringSpeed: 190,
    every: [3.2, 4.2], hatch: 0.55, fanSpeed: 205,
  };
  const SHOT = { color: '#e040c0' };

  function reveal(e, game) {
    const s = e.state;
    if (s.mode !== 'disguised') return;
    s.mode = 'reveal';
    s.t = TROJAN.tell;
    e.ignoreForClear = !!(game.room && game.room.cleared);
    AI.say(e, 'Totally safe.', TROJAN.tell + 0.3, '#ff8ae6');
    B.bus.emit('enemyReveal', { game, enemy: e, x: e.x, y: e.y });
  }

  function burst(e, game) {
    const s = e.state;
    s.mode = 'chase';
    s.cd = game.rng.float(TROJAN.every[0], TROJAN.every[1]) * 0.6;
    s.tell = 0;
    e.r = s.realR;
    e.static = false;
    e.intangible = false;
    e.noHpBar = false;
    e.noShadow = false;
    e.contactDamage = e.def.contactDamage;
    e.flash = 0.12;
    game.shake(3, 0.15);
    B.bus.emit('propBreak', { game, x: e.x, y: e.y, kind: s.kind, color: game.propColor ? game.propColor(s.kind) : '#a07a4a' });
    AI.ring(game, e, TROJAN.ring, AI.shotSpeed(game, TROJAN.ringSpeed), game.rng.angle(), SHOT);
  }

  B.BEHAVIORS.trojan = {
    init(e, game) {
      const s = e.state;
      const theme = B.themeFor(game.depth || 1);
      const kinds = theme && theme.props && theme.props.kinds && theme.props.kinds.length ? theme.props.kinds : ['crate'];
      s.kind = game.rng.pick(kinds);
      s.mode = 'disguised';
      s.realR = e.r;
      // Auf die Kachelmitte wie ein echtes Objekt. Kein Raumzugriff noetig: Spawnpunkte liegen auf freien Kacheln
      e.x = Math.floor(e.x / TILE) * TILE + TILE / 2;
      e.y = Math.floor(e.y / TILE) * TILE + TILE / 2;
      e.r = 24;
      e.static = true;
      e.intangible = true;
      e.ignoreForClear = true;
      e.contactDamage = 0;
      e.noHpBar = true;
      e.noShadow = true;     // der Schatten wird wie bei drawProps selbst gezeichnet
      e.spawnDelay = 0;      // Objekte blenden nicht ein
    },

    onExplosion(e, game, x, y, radius) {
      if (B.M.dist(x, y, e.x, e.y) < radius * 1.2) reveal(e, game);
    },

    update(e, dt, game) {
      const s = e.state, p = game.player;
      if (s.mode === 'disguised') {
        AI.stop(e);
        if (AI.dist(e, p) < TROJAN.near) { reveal(e, game); return; }
        for (const pr of game.room.projectiles) {
          if (pr.team !== 'player' || pr.dead) continue;
          if (Math.hypot(pr.x - e.x, pr.y - e.y) < TROJAN.shotR) {
            if (typeof pr.die === 'function') pr.die(game, false);
            reveal(e, game);
            return;
          }
        }
        return;
      }
      if (s.mode === 'reveal') {
        AI.stop(e);
        s.t -= dt;
        if (s.t <= 0) burst(e, game);
        return;
      }
      if (s.tell > 0) {
        AI.stop(e);
        s.tell -= dt;
        if (s.tell <= 0) AI.fan(game, e, p, 3, 0.24, AI.shotSpeed(game, TROJAN.fanSpeed), SHOT);
        return;
      }
      AI.pathToward(e, game, p.x, p.y, e.speed);
      s.cd -= dt;
      if (s.cd <= 0) {
        s.tell = TROJAN.hatch;
        s.cd = AI.cooldown(game, game.rng.float(TROJAN.every[0], TROJAN.every[1]));
        B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
      }
    },

    draw(e, ctx) {
      const s = e.state;
      if (s.mode === 'disguised' || s.mode === 'reveal') {
        const dx = s.mode === 'reveal' ? Math.sin(e.t * 60) * 3 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 24, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
        B.drawSprite(ctx, 'prop_' + s.kind, e.x + dx, e.y, { frame: 0 });
        if (s.mode === 'reveal') AI.drawMark(ctx, '!', e.x, e.y - 30, e.t, '#ff8ae6');
        AI.drawSay(e, ctx);
        return;
      }
      if (s.tell > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 8, 1 - s.tell / TROJAN.hatch, SHOT.color);
      AI.drawBody(e, ctx, { frame: s.tell > 0 ? 1 : undefined });
      AI.drawSay(e, ctx);
    },
  };

  B.BEHAVIORS.trojan.TROJAN = TROJAN;   // fuer den Smoke-Test
})(window.BOTA);
