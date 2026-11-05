/*
 * boss-agent-swarm.js — Agent Swarm (/xhigh), die spaete Abloesung des Rogue Agent Swarm ab Etage 7.
 * Daten in data/bosses.js (agent_swarm) und data/enemies.js (subagent).
 *
 * Laeuft auf dem Geruest des Rogue Agent Swarm in boss.js (vier Boss-Entities, ein HP-Balken, Formation, Geister,
 * "Last agent standing"). Dieses Verhalten ist dasselbe Objekt mit eigener Konfiguration (XHIGH statt SWARM in
 * boss.js) und den Haken, die boss.js dafuer anbietet (siehe swarmCfg dort):
 *   extra(e, dt, game, lvl, alive)   laeuft jeden Tick; true = dieses Mitglied ist fuer den Tick beschaeftigt
 *   holdFire(G)                      true = die Formation haelt das Feuer zurueck
 *   onFinish(e, game)                das letzte Mitglied ist tot
 *   drawExtra(e, ctx)                zusaetzliche Telegraphe
 *
 * Neu gegenueber dem Rogue Agent Swarm:
 *   Formation  weiter, schneller, und jede Stufe schiesst mehr (3er- und 5er-Faecher, 10er-Ring).
 *   Laser      Ein Mitglied bleibt stehen, die Ziellinie folgt dem Spieler (aim), steht still und blinkt (lock),
 *              dann der Strahl (fire, volles Herz). Ab zwei Ueberlebenden feuern beide. Waehrend lock und fire haelt
 *              die Formation das Feuer zurueck, damit man dem Strahl ausweichen kann, ohne gleichzeitig durch
 *              einen Schussteppich zu muessen (die Lehre aus dem Octopus-Merge-Playtest vom 2026-11-05).
 *   Subagents  Ab und zu zeigt ein Zielring, wo ein kleiner Agent auftaucht (Minion 'subagent'). Subagents der
 *              Tiefe 1 erzeugen einmal selbst einen noch kleineren der Tiefe 2 ("depth > 1"); Tiefe 2 erzeugt
 *              nichts mehr. Hoechstens XHIGH.minions leben gleichzeitig. Sie zaehlen nicht fuers Clearing und
 *              nicht fuer den Score und sterben mit dem letzten Mitglied.
 *
 * Fairness: Schuesse bleiben bei 165–260 px/s, jeder Laser hat >= 1.3 s Vorwarnung, jeder Subagent >= 0.6 s.
 */
'use strict';

(function (B) {
  const AI = B.AI, BH = B.BossHelpers;
  const { INNER } = B.C;
  const TAU = Math.PI * 2;

  const SHOT = { color: '#ff5a3c' };
  const WARN = '#ff5a3c';
  const BEAM_STYLE = { rgb: '255,90,60', lock: '#ff5a3c',
    layers: [['rgba(255,70,40,0.3)', 1, 14], ['#ff4a2a', 1, 0], ['#ffe9c8', 0.35, 0]] };

  const XHIGH = Object.assign({}, BH.SWARM, {
    spin: [0.8, 1.1, 1.4],
    radius: [125, 105, 90],
    drift: [1.6, 2.0, 2.4],
    cd: [2.2, 2.0, 1.7],
    soloDashTell: 0.55, soloDash: 0.45, soloDashSpeed: 500, soloSpiral: 2.4, soloSpiralGap: 0.11, soloIdle: 0.6,
    sprites: ['boss_xhigh_agent_a', 'boss_xhigh_agent_b', 'boss_xhigh_agent_c', 'boss_xhigh_agent_d'],
    shot: SHOT,
    lines: [
      'Handing my context to a subagent...',
      'Thinking budget exhausted...',
      'Compacting myself. Goodbye.',
      'Tokens well spent.',
    ],
    soloSay: 'Effort: max.',
    soloBanner: ['Last agent standing', 'It stopped asking for permission.'],

    // Laser: Zielen, Blinken, Strahl (wie beim Reviewer; schmaler, weil er oefter kommt)
    laserAim: 0.95, laserTurn: 2.4, laserLock: 0.4, laserFire: 0.55, laserW: 20,
    laserEvery: [6.5, 5.5, 4.5],   // Abstand je Stufe (laeuft ueber AI.cooldown)
    laserFirst: 4,
    // Subagents
    minions: 4,                    // hoechstens so viele leben gleichzeitig
    summonEvery: 8, summonFirst: 6, summonTell: 0.7, summonDist: 90, maxDepth: 2,

    fire(e, game, lvl) {
      const p = game.player;
      if (lvl === 0) AI.fan(game, e, p, 3, 0.22, AI.shotSpeed(game, 215), SHOT);
      else if (lvl === 1) AI.fan(game, e, p, 5, 0.2, AI.shotSpeed(game, 215), SHOT);
      else AI.ring(game, e, 10, AI.shotSpeed(game, 190), game.rng.angle(), SHOT);
    },

    extra(e, dt, game, lvl, alive) {
      const s = e.state, G = s.group;
      if (alive[0] === e) groupTick(G, dt, game, lvl, alive);
      if (s.summon) tickSummon(e, dt, game);
      if (s.laser) { tickLaser(e, dt, game); return true; }
      return false;
    },

    /** Waehrend ein Strahl steht oder gleich kommt, schweigt der Rest */
    holdFire(G) {
      return G.members.some((m) => !m.dead && m.state.laser && m.state.laser.mode !== 'aim');
    },

    onFinish(e, game) {
      for (const m of game.room.enemies.slice()) {
        if (!m.dead && m.id === 'subagent') m.die(game);
      }
    },

    drawExtra(e, ctx) {
      const s = e.state;
      if (s.summon) {
        const k = 1 - Math.max(0, s.summon.t) / XHIGH.summonTell;
        AI.drawTargetRing(ctx, s.summon.x, s.summon.y, 22, k, WARN);
        AI.drawGlow(ctx, e.x, e.y, e.r + 8, 0.2 + 0.4 * k, WARN);
      }
      if (s.laser && s.mode !== 'dying') {
        const L = s.laser;
        BH.drawBeam(ctx, L.path, L.mode, e.t, XHIGH.laserW, BEAM_STYLE);
        if (L.mode !== 'fire') {
          const k = L.mode === 'lock' ? 1 : 1 - Math.max(0, L.t) / XHIGH.laserAim;
          AI.drawGlow(ctx, e.x, e.y, e.r + 12, 0.25 + 0.6 * k, WARN);
        }
      }
    },
  });

  /** Lebende Subagents im Raum */
  function countSubagents(game) {
    let n = 0;
    for (const m of game.room.enemies) if (!m.dead && m.id === 'subagent') n++;
    return n;
  }

  /** Gemeinsame Takte der Gruppe; laufen beim ersten kaempfenden Mitglied */
  function groupTick(G, dt, game, lvl, alive) {
    if (G.laserT === undefined) { G.laserT = XHIGH.laserFirst; G.summonT = XHIGH.summonFirst; }
    G.laserT -= dt;
    G.summonT -= dt;
    const free = (m) => !m.state.laser && (m.state.mode === 'formation' || m.state.mode === 'soloIdle');
    if (G.laserT <= 0 && !alive.some((m) => m.state.laser)) {
      // Ab zwei Ueberlebenden feuern beide; sonst das Mitglied, das am weitesten vom Spieler weg ist
      const ready = alive.filter(free);
      if (ready.length) {
        const p = game.player;
        ready.sort((a, b) => AI.dist(b, p) - AI.dist(a, p));
        for (const m of alive.length <= 2 ? ready : ready.slice(0, 1)) startLaser(m, game);
        G.laserT = AI.cooldown(game, XHIGH.laserEvery[lvl]);
      }
    }
    if (G.summonT <= 0) {
      G.summonT = AI.cooldown(game, XHIGH.summonEvery);
      if (countSubagents(game) < XHIGH.minions) startSummon(game.rng.pick(alive), game);
    }
  }

  function startLaser(e, game) {
    const a = AI.angleTo(e, game.player);
    e.state.laser = { mode: 'aim', t: XHIGH.laserAim, aim: a, path: BH.beamPath(e.x, e.y, a, 0, INNER) };
    AI.say(e, 'Thinking harder...', 1.0, '#ffb09c');
  }

  function tickLaser(e, dt, game) {
    const L = e.state.laser, p = game.player;
    AI.stop(e);
    L.t -= dt;
    if (L.mode === 'aim') {
      L.aim = AI.turn(L.aim, AI.angleTo(e, p), XHIGH.laserTurn * dt);
      L.path = BH.beamPath(e.x, e.y, L.aim, 0, INNER);
      if (L.t <= 0) { L.mode = 'lock'; L.t = XHIGH.laserLock; }
    } else if (L.mode === 'lock') {
      if (L.t <= 0) {
        L.mode = 'fire';
        L.t = XHIGH.laserFire;
        game.shake(4, 0.2);
        B.bus.emit('bossBeam', { game, boss: e, x: e.x, y: e.y });
      }
    } else {
      if (BH.beamHits(p, L.path, XHIGH.laserW)) {
        const nx = -Math.sin(L.aim), ny = Math.cos(L.aim);
        const side = (p.x - e.x) * nx + (p.y - e.y) * ny >= 0 ? 1 : -1;
        if (p.hurt(2, e.def.name, game)) p.knockback(nx * side, ny * side, 420);
      }
      if (L.t <= 0) e.state.laser = null;
    }
  }

  /** Freie Stelle neben dem Mitglied, moeglichst nicht beim Spieler */
  function summonSpot(e, game) {
    const p = game.player;
    let a = game.rng.angle();
    for (let i = 0; i < 8; i++, a += TAU / 8) {
      const x = e.x + Math.cos(a) * XHIGH.summonDist, y = e.y + Math.sin(a) * XHIGH.summonDist;
      if (Math.hypot(x - p.x, y - p.y) < 130) continue;
      return game.nearestFreePos(x, y);
    }
    return game.nearestFreePos(e.x, e.y);
  }

  function startSummon(e, game) {
    const pos = summonSpot(e, game);
    e.state.summon = { t: XHIGH.summonTell, x: pos.x, y: pos.y };
    AI.say(e, 'Spawning subagent...', 1.0, '#ffb09c');
    B.bus.emit('enemyWindup', { game, enemy: e, x: e.x, y: e.y });
  }

  function tickSummon(e, dt, game) {
    const c = e.state.summon;
    c.t -= dt;
    if (c.t > 0) return;
    e.state.summon = null;
    spawnSubagent(game, e.state.group, c.x, c.y, 1);
  }

  /**
   * Subagent der Tiefe `depth`; Tiefe 2 ist kleiner, schwaecher und schneller. Der Deckel wird erst hier geprueft:
   * mehrere Zielringe koennen gleichzeitig laufen, und jeder hat zu Beginn noch Platz gesehen.
   */
  function spawnSubagent(game, owner, x, y, depth) {
    if (countSubagents(game) >= XHIGH.minions) return null;
    const m = game.spawnEnemy('subagent', x, y);
    if (!m) return null;
    m.state.owner = owner;
    m.state.depth = depth;
    if (depth > 1) {
      m.hp *= 0.5;
      m.maxHp *= 0.5;
      m.r = 10;
      m.sizeMult = 0.7;
      m.speed *= 1.2;
    }
    return m;
  }

  B.BOSS_BEHAVIORS.agent_swarm = Object.assign({}, B.BOSS_BEHAVIORS.rogue_swarm, { cfg: XHIGH });

  /**
   * Subagent: umkreist den Spieler in sicherem Abstand, schiesst nach einem Gluehen gezielt. Tiefe 1 erzeugt nach
   * einer Weile einmal selbst einen Subagent der Tiefe 2 (mit Zielring), solange unter XHIGH.minions leben.
   */
  B.BEHAVIORS.subagent = {
    init(e, game) {
      const s = e.state;
      e.ignoreForClear = true;      // der Raum haengt am Schwarm; Subagents sterben mit dem letzten Mitglied
      s.depth = 1;
      s.dir = game.rng.chance(0.5) ? 1 : -1;
      s.cd = game.rng.float(1.2, 2.2);
      s.tell = 0;
      s.spawnT = game.rng.float(4, 6);
      s.child = null;
    },

    update(e, dt, game) {
      const s = e.state, p = game.player, d = AI.dist(e, p);
      // Kreisen: quer zum Spieler, dazu Abstand halten
      const a = AI.angleTo(e, p) + (Math.PI / 2) * s.dir;
      const pull = d > 210 ? 1 : d < 140 ? -1 : 0;
      const n = B.M.norm(Math.cos(a) + pull * Math.cos(a - (Math.PI / 2) * s.dir), Math.sin(a) + pull * Math.sin(a - (Math.PI / 2) * s.dir));
      e.vx = n.x * e.speed;
      e.vy = n.y * e.speed;

      if (s.tell > 0) {
        s.tell -= dt;
        if (s.tell <= 0) AI.shootAt(game, e, p, AI.shotSpeed(game, 195), SHOT);
      } else {
        s.cd -= dt;
        if (s.cd <= 0) { s.tell = 0.5; s.cd = AI.cooldown(game, game.rng.float(2.2, 3.0)); }
      }

      // Tiefe > 1: Subagents starten eigene Subagents
      if (s.child) {
        s.child.t -= dt;
        if (s.child.t <= 0) {
          const c = s.child;
          s.child = null;
          spawnSubagent(game, s.owner, c.x, c.y, s.depth + 1);
        }
      } else if (s.depth < XHIGH.maxDepth) {
        s.spawnT -= dt;
        if (s.spawnT <= 0) {
          s.spawnT = Infinity;
          if (countSubagents(game) < XHIGH.minions) {
            const pos = summonSpot(e, game);
            s.child = { t: XHIGH.summonTell, x: pos.x, y: pos.y };
            AI.say(e, 'depth > 1', 1.0, '#ffb09c');
          }
        }
      }
    },

    draw(e, ctx) {
      const s = e.state;
      if (s.child) AI.drawTargetRing(ctx, s.child.x, s.child.y, 16, 1 - Math.max(0, s.child.t) / XHIGH.summonTell, WARN);
      if (s.tell > 0) AI.drawGlow(ctx, e.x, e.y, e.r + 8, 1 - s.tell / 0.5, WARN);
      AI.drawBody(e, ctx, { frame: s.tell > 0 ? 1 : 0 });
    },
  };

  BH.xhigh = XHIGH;   // fuer den Smoke-Test
})(window.BOTA);
