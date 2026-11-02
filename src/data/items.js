/*
 * items.js — Item-Definitionen (passiv & aktiv).
 *
 *   BOTA.ITEMS.<id> = {
 *     name: 'Cold Brew',
 *     tagline: 'Speed up',                       // kurze Zeile im Pickup-Banner
 *     desc: 'Caffeine: the original agentic framework.', // Snark im Pause-Menue
 *     pools: ['treasure', 'shop', 'boss', 'secret'],     // wo es auftauchen kann
 *     sprite: 'item_cold_brew',                  // Icon (fehlend -> Platzhalter)
 *     price: 15,                                 // optional, Shop-Preis (Default 15)
 *
 *     add:   { speed: 0.25 },        // additive Stat-Deltas  (Stats: speed, damage, fireDelay,
 *     mult:  { fireDelay: 0.75 },    //   shotSpeed, range, shotSize, luck) — mult nach add
 *     flags: { piercing: true },     // Flags: piercing, homing, spectral, bounce, wobble, split,
 *                                    //   flying, parallel, showHp (bool, OR) | multishot (max)
 *                                    //   | duck, unitTests (Summe; Begleiter, siehe familiar.js)
 *     dynamic(player) { return { add: {...}, mult: {...} }; }, // optional, zustandsabhaengige Stats
 *
 *     // Hooks (alle optional):
 *     onPickup(player, game) {},                 // einmalig beim Aufheben
 *     onShoot(player, proj, game) {},            // fuer jedes erzeugte Projektil
 *     onHitEnemy(player, enemy, proj, game) {},
 *     onRoomEnter(player, room, game) {},
 *     onRoomClear(player, room, game) {},
 *     onHurt(player, game) {},
 *     onLethal(player, game) { return true; },   // true = Tod verhindern
 *     update(player, dt, game) {},
 *
 *     // Aktive Items:
 *     active: true, maxCharge: 3, use(player, game) { return true; } // true = Ladung verbraucht
 *   };
 *
 * Inhalt: 32 passive + 4 aktive Items aus DESIGN.md §9, dazu 7 eigene Items im selben Geist
 * (6 passiv, 1 aktiv). Begleiter-Flags (duck, unitTests) wertet BOTA.syncFollowers in familiar.js aus.
 *
 * Konventionen:
 *  - Pro Run gewuerfelte / dauerhafte Werte (Off-by-One, YAML Config, Retry with Backoff) landen in
 *    player.bonus (wird von recalcStats additiv eingerechnet).
 *  - Einmal-Zustand pro Item liegt in player.itemState[id] (giveItem legt das Objekt an).
 *  - Zufall immer ueber game.rng (Seed-reproduzierbar), nie Math.random — ausser rein visuell.
 *
 * SICHERHEIT: reine Spiellogik, keine DOM-/Netzwerkzugriffe, kein eval. Texte landen ausschliesslich
 * im Canvas (fillText), nie im DOM — es gibt also keinen Injektionspfad.
 */
'use strict';

(function (B) {
  const I = B.ITEMS;

  // ---------------------------------------------------------------------------
  // Kleine Helfer
  // ---------------------------------------------------------------------------

  /** Hooks bekommen game normalerweise uebergeben; Debug-Aufrufe evtl. nicht -> globales Spiel nutzen */
  const G = (game) => game || B.game || null;

  /** Ressourcen-Zaehler sind bei 99 gedeckelt (DESIGN.md §5) */
  const cap99 = (v) => Math.max(0, Math.min(99, v));

  /** Shop-Preis eines Items (Default 15 Credits, siehe DESIGN.md §9) */
  B.itemPrice = function (id) {
    const def = I[id];
    return (def && def.price) || 15;
  };

  /**
   * Schwebender Text als reiner Visual-Effekt (z. B. "+2 damage" bei Off-by-One).
   * Liegt in room.effects, erfuellt den Effekt-Vertrag (update/draw/dead) und hat keine Spielwirkung.
   */
  class PopText {
    constructor(x, y, text, color) {
      this.x = x;
      this.y = y;
      this.text = String(text);
      this.color = color || '#f3ece6';
      this.life = 1.2;
      this.max = 1.2;
      this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      this.y -= 38 * dt; // langsam nach oben steigen
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx) {
      const a = Math.max(0, Math.min(1, this.life / 0.4)); // am Ende ausblenden
      if (B.text) {
        B.text(ctx, this.text, this.x, this.y, { size: 15, align: 'center', baseline: 'middle', color: this.color, alpha: a });
      } else {
        // Fallback, falls der Renderer-Helfer (noch) fehlt
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
      }
    }
  }

  /** Oeffentliche Mini-API fuer Item-/Pickup-Feedback (pickup.js nutzt sie fuer Truhen-Hinweise) */
  B.itemFx = {
    popText(game, x, y, text, color) {
      const g = G(game);
      if (!g || !g.room || !Array.isArray(g.room.effects)) return;
      // Bevorzugt den gestylten Schwebetext aus effects.js (Agent C), damit alles einheitlich aussieht;
      // falls der fehlt oder sich die API aendert, greift der eigene schlichte PopText.
      if (B.FX && typeof B.FX.text === 'function') {
        try { if (B.FX.text(g, x, y, text, color, { life: 1.1 })) return; } catch (e) { /* Fallback unten */ }
      }
      g.room.effects.push(new PopText(x, y, text, color));
    },
    /** Partikel nur, wenn effects.js (Agent C) sie anbietet — sonst still nichts tun */
    burst(game, x, y, color, count, speed) {
      const g = G(game);
      if (g && B.FX && typeof B.FX.burst === 'function') B.FX.burst(g, x, y, color, count, speed);
    },
    ring(game, x, y, radius, color, life) {
      const g = G(game);
      if (g && B.FX && typeof B.FX.ring === 'function') B.FX.ring(g, x, y, radius, color, life);
    },
  };
  const fx = B.itemFx;

  /** Alle lebenden Gegner im aktuellen Raum (inkl. Bossen und Gegnern, die nicht fuers Clearing zaehlen) */
  function livingEnemies(game) {
    const g = G(game);
    if (!g || !g.room) return [];
    return g.room.enemies.filter((e) => !e.dead);
  }

  /** "Geht nicht"-Feedback fuer aktive Items, die nichts zu tun haetten (Ladung bleibt erhalten) */
  function deny(player, game, text) {
    B.bus.emit('denied', { game, reason: 'active' });
    fx.popText(game, player.x, player.y - 56, text, '#e07a6a');
    return false;
  }

  // ===========================================================================
  // PASSIVE ITEMS — DESIGN.md §9 (32 Stueck)
  // ===========================================================================

  // --- Reine Stat-Items ------------------------------------------------------

  I.cold_brew = {
    name: 'Cold Brew', tagline: 'Speed up',
    desc: 'Caffeine: the original agentic framework.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_cold_brew', price: 12,
    add: { speed: 0.25 },
  };

  // Extra GPU / Off-Brand GPU (Vorschlag 2026-11-02): bewusst ueberteuert fuer einen kleinen Bonus —
  // das ist der Witz. Die Billig-Variante spart 10 Credits, dafuer "versagt" ab und zu ein Schuss.
  I.extra_gpu = {
    name: 'Extra GPU', tagline: 'Speed up, shot speed up',
    desc: 'More FLOPS = More Good!',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_extra_gpu', price: 30,
    add: { speed: 0.1, shotSpeed: 0.1 },
  };

  I.offbrand_gpu = {
    name: 'Off-Brand GPU', tagline: 'Speed up, shot speed up... mostly',
    desc: 'We need more compute, but is this worth it...?',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_offbrand_gpu', price: 20,
    add: { speed: 0.1, shotSpeed: 0.1 },
    onShoot(player, proj, game) {
      // 12 % "Hardwarefehler": Der Schuss ist ein Blindgaenger — grau, kein Schaden, kein Rueckstoss,
      // verpufft nach gut einem Drittel der Reichweite (projectile.js behandelt damage <= 0 als Blindgaenger).
      // Zufall ueber game.rng (deterministisch pro Seed).
      const g = G(game);
      if (!g || !proj || !g.rng.chance(0.12)) return;
      proj.damage = 0;
      proj.knockbackForce = 0;
      proj.range *= 0.35;
      proj.color = '#7a7470';
      proj.flags = Object.assign({}, proj.flags, { split: false, homing: false });
    },
  };

  I.mech_keyboard = {
    name: 'Mechanical Keyboard', tagline: 'Fire rate up',
    desc: 'Clack clack clack. Your open-plan office has filed a complaint.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_mech_keyboard',
    add: { fireDelay: -0.06 },
  };

  I.stack_overflow = {
    name: 'Stack Overflow Printout', tagline: 'Damage up',
    desc: 'Marked as duplicate. Worked anyway.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_stack_overflow',
    add: { damage: 1 },
  };

  I.context_window = {
    name: 'Extended Context Window', tagline: 'Range up',
    desc: "Two million tokens of things you'll forget by the next room.",
    pools: ['treasure', 'boss'], sprite: 'item_context_window',
    add: { range: 150, shotSpeed: -0.1 },
  };

  I.prompt_caching = {
    name: 'Prompt Caching', tagline: 'Fire rate way up',
    desc: "Same tokens, 90 % cheaper. You've basically printed money.",
    pools: ['treasure', 'shop'], sprite: 'item_prompt_caching', price: 18,
    mult: { fireDelay: 0.75 },
  };

  I.tab_completion = {
    name: 'Tab Completion', tagline: 'Fire rate up, range down',
    desc: 'Accepts the first suggestion. Every time. Without reading.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_tab_completion',
    add: { fireDelay: -0.08, range: -80 },
  };

  I.max_effort = {
    name: 'Max Effort', tagline: 'Thinking harder',
    desc: 'Reasoning effort: max. Everything takes longer, but hits harder.',
    pools: ['treasure', 'boss'], sprite: 'item_max_effort',
    add: { damage: 1, speed: -0.1 },
  };

  I.monorepo = {
    name: 'Monorepo', tagline: 'Shot size up',
    desc: 'Everything in one giant blob. What could go wrong.',
    pools: ['treasure', 'boss'], sprite: 'item_monorepo',
    add: { shotSize: 0.6, damage: 0.5, shotSpeed: -0.2 },
  };

  I.kubernetes = {
    name: 'Kubernetes', tagline: 'All stats up? Probably?',
    desc: 'Nobody knows what it does. Everyone agrees you need it.',
    pools: ['treasure', 'boss', 'shop'], sprite: 'item_kubernetes', price: 18,
    // "Ein bisschen von allem" — bewusst klein, dafuer jeder Stat
    add: { speed: 0.08, damage: 0.4, fireDelay: -0.02, shotSpeed: 0.08, range: 40, shotSize: 0.1, luck: 1 },
  };

  I.blockchain = {
    name: 'Blockchain', tagline: 'Revolutionary',
    desc: 'Disruptive. Decentralised. Does absolutely nothing. Market cap: $4B.',
    // Absichtlich wirkungslos. Im Shop fuer stolze 20 Credits — wie es sich gehoert.
    pools: ['shop', 'secret'], sprite: 'item_blockchain', price: 20,
  };

  I.technical_debt = {
    name: 'Technical Debt', tagline: 'Damage way up… for now',
    desc: 'Ship now, pay later. With interest. Compounding.',
    pools: ['treasure', 'secret'], sprite: 'item_technical_debt',
    mult: { damage: 1.6 },
    onPickup(player) {
      // Ein Herzcontainer weniger; addHeartContainers laesst nie weniger als 1 Herz uebrig
      player.addHeartContainers(-1);
    },
  };

  // --- Schuss-Modifikatoren ---------------------------------------------------

  I.temperature = {
    name: 'Temperature 1.5', tagline: 'Damage up, aim… creative',
    desc: 'More creative. Less correct. Like your commit messages.',
    pools: ['treasure', 'secret'], sprite: 'item_temperature',
    add: { damage: 1.5 },
    flags: { wobble: true },
  };

  I.few_shot = {
    name: 'Few-Shot Examples', tagline: 'Triple shot',
    desc: 'Three examples. Same mistake, three times.',
    pools: ['treasure', 'boss'], sprite: 'item_few_shot',
    mult: { fireDelay: 1.35 },
    flags: { multishot: 3 },
  };

  I.regex = {
    name: 'Regex', tagline: 'Now you have two problems',
    desc: 'You solved it with a regex. Now you have two shots and two problems.',
    pools: ['treasure', 'shop'], sprite: 'item_regex',
    // Zwei parallele Schuesse (player.shoot wertet "parallel" nur bei genau 2 Schuessen aus)
    flags: { multishot: 2, parallel: true },
  };

  I.chain_of_thought = {
    name: 'Chain of Thought', tagline: 'Piercing shots',
    desc: "Let's think step by step. Through the enemy. And the one behind it.",
    pools: ['treasure'], sprite: 'item_chain_of_thought',
    flags: { piercing: true },
  };

  I.confident_hallucination = {
    name: 'Confident Hallucination', tagline: 'Homing shots',
    desc: 'The target is wherever I say it is.',
    pools: ['treasure', 'secret'], sprite: 'item_confident_hallucination',
    flags: { homing: true },
  };

  I.linter = {
    name: 'Linter', tagline: 'Bouncing shots',
    desc: 'Your shots bounce now. Also: 4,812 warnings.',
    pools: ['treasure', 'shop'], sprite: 'item_linter',
    flags: { bounce: true },
  };

  I.dark_mode = {
    name: 'Dark Mode', tagline: 'Spectral shots',
    desc: 'Easier on the eyes. Harder on the enemies.',
    pools: ['treasure', 'secret'], sprite: 'item_dark_mode',
    flags: { spectral: true },
  };

  I.microservices = {
    name: 'Microservices', tagline: 'Shots split on impact',
    desc: "You had one problem. Now it's distributed across four services.",
    pools: ['treasure'], sprite: 'item_microservices',
    flags: { split: true },
  };

  I.vibe_coding = {
    name: 'Vibe Coding', tagline: 'Damage: vibes',
    desc: "Accept all. Don't read the diff. Feel the vibes.",
    pools: ['treasure', 'secret'], sprite: 'item_vibe_coding',
    onShoot(player, proj, game) {
      // Jeder Schuss bekommt zufaellig Schaden x0.5–2 und eine passend skalierte Groesse.
      // Groesse ~ Wurzel des Faktors, damit die Flaeche (nicht der Radius) mit dem Schaden waechst.
      const g = G(game);
      if (!g || !proj) return;
      const k = g.rng.float(0.5, 2);
      proj.damage *= k;
      proj.r *= Math.sqrt(k);
      // Regenbogen-Farbe: reine Optik ("vibes")
      proj.color = 'hsl(' + g.rng.int(0, 359) + ', 85%, 72%)';
    },
  };

  // --- Flug, Leben, Schutz ---------------------------------------------------

  I.the_cloud = {
    name: 'The Cloud', tagline: 'Flight',
    desc: "It's just someone else's computer. But it floats.",
    pools: ['treasure', 'secret'], sprite: 'item_the_cloud',
    flags: { flying: true },
  };

  I.rlhf = {
    name: 'RLHF', tagline: 'HP up',
    desc: 'Fine-tuned to be more likable. Mostly by people paid per click.',
    pools: ['treasure', 'boss', 'shop'], sprite: 'item_rlhf',
    onPickup(player) {
      // +1 Herzcontainer und volle Heilung
      player.addHeartContainers(1);
      player.health = player.maxHealth;
    },
  };

  I.constitutional_guardrails = {
    name: 'Constitutional Guardrails', tagline: 'Guardrails up',
    desc: 'Principles: has them, mentions them, often.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_constitutional_guardrails', price: 12,
    onPickup(player) {
      // +2 Guardrail-Herzen = 4 halbe
      player.addGuardrails(4);
    },
  };

  I.retry_backoff = {
    name: 'Retry with Backoff', tagline: 'Extra life',
    desc: 'Failed? Try again. Slower.',
    pools: ['treasure', 'secret'], sprite: 'item_retry_backoff',
    onPickup(player) {
      // Dauerhafter Malus (der "Backoff") — ueber player.bonus, damit er pro Run bestehen bleibt
      player.bonus.speed = (player.bonus.speed || 0) - 0.1;
    },
    onLethal(player, game) {
      // Genau EINMAL pro Run vor dem Tod retten
      const st = player.itemState.retry_backoff || (player.itemState.retry_backoff = {});
      if (st.used) return false;
      st.used = true;
      // Wiederbelebung mit der Haelfte der Container (aufgerundet auf volle Herzen, mindestens 1 Herz)
      player.health = Math.max(2, Math.ceil(player.maxHealth / 4) * 2);
      player.invuln = 2.0; // etwas laenger unverwundbar, damit man nicht sofort wieder stirbt
      const g = G(game);
      if (g) {
        g.freezeEnemies(1.5);
        g.banner('Retrying…', 'Attempt 2 of 2. Backing off exponentially.');
        fx.ring(g, player.x, player.y, 120, '#7bc96f', 0.5);
      }
      return true;
    },
  };

  // --- Wahrnehmung, Raum-Effekte, Ressourcen ----------------------------------

  I.code_review = {
    name: 'Code Review', tagline: 'See enemy HP',
    desc: 'Now you can see exactly how bad things are.',
    pools: ['treasure', 'shop'], sprite: 'item_code_review', price: 10,
    add: { luck: 1 },
    flags: { showHp: true },
  };

  I.daily_standup = {
    name: 'Daily Standup', tagline: 'Freeze on entry',
    desc: 'Everyone stops what they\'re doing for "15 minutes".',
    pools: ['treasure', 'shop'], sprite: 'item_daily_standup',
    onRoomEnter(player, room, game) {
      // Alle Gegner beim Betreten 2 s einfrieren (nur wenn ueberhaupt welche da sind)
      const g = G(game);
      if (!g || !room || !room.hasLivingEnemies()) return;
      g.freezeEnemies(2);
      fx.popText(g, player.x, player.y - 56, 'standup!', '#8fd0ff');
    },
  };

  I.lgtm = {
    name: 'LGTM', tagline: '+2 Approvals',
    desc: "Didn't read it. Approved it. Twice.",
    pools: ['treasure', 'shop'], sprite: 'item_lgtm', price: 10,
    onPickup(player) {
      player.approvals = cap99(player.approvals + 2);
    },
  };

  I.off_by_one = {
    name: 'Off-by-One Error', tagline: 'Damage up by 1. Or 0. Or 2.',
    desc: 'We counted from zero. Or did we.',
    pools: ['treasure', 'secret'], sprite: 'item_off_by_one',
    onPickup(player, game) {
      // Einmal pro Aufnahme wuerfeln: +0, +1 oder +2 Schaden (dauerhaft ueber player.bonus)
      const g = G(game);
      const d = g ? g.rng.int(0, 2) : 1;
      player.bonus.damage = (player.bonus.damage || 0) + d;
      const st = player.itemState.off_by_one || (player.itemState.off_by_one = {});
      st.rolls = (st.rolls || []).concat([d]);
      fx.popText(g, player.x, player.y - 80, 'damage +' + d + (d === 0 ? ' (classic)' : ''), '#f6d365');
    },
  };

  /**
   * YAML Config: jeder Stat wird zufaellig verschoben. Tabelle: [Stat, Spannweite, Richtung]
   * Richtung -1 bedeutet "kleiner ist besser" (fireDelay). Der Bereich ist leicht positiv verschoben
   * (-1 … +1.3), damit das Item im Mittel kein reiner Fluch ist.
   */
  const YAML_SPREAD = [
    ['speed', 0.15, 1], ['damage', 0.8, 1], ['fireDelay', 0.05, -1], ['shotSpeed', 0.15, 1],
    ['range', 90, 1], ['shotSize', 0.2, 1], ['luck', 2, 1],
  ];
  I.yaml_config = {
    name: 'YAML Config', tagline: 'Stats shuffled',
    desc: 'Your stats are now whitespace-sensitive.',
    pools: ['treasure', 'secret'], sprite: 'item_yaml_config',
    onPickup(player, game) {
      const g = G(game);
      if (!g) return;
      for (const [stat, spread, dir] of YAML_SPREAD) {
        let d = g.rng.float(-1, 1.3) * spread * dir;
        if (stat === 'luck') d = Math.round(d); // Glueck bleibt ganzzahlig
        player.bonus[stat] = (player.bonus[stat] || 0) + d;
      }
      fx.popText(g, player.x, player.y - 80, 'stats: reindented', '#c5a3ff');
    },
  };

  I.git_blame = {
    name: 'git blame', tagline: 'Damage up when desperate',
    desc: 'It was never your fault. The logs prove it.',
    pools: ['treasure', 'secret'], sprite: 'item_git_blame',
    /** +2 Schaden, solange insgesamt hoechstens 1 Herz (rot + Guardrail) uebrig ist */
    dynamic(player) {
      return (player.health + player.guardrails <= 2) ? { add: { damage: 2 } } : null;
    },
    update(player) {
      // Guardrail-Pickups rufen kein recalcStats auf -> Zustandswechsel hier selbst erkennen
      const st = player.itemState.git_blame || (player.itemState.git_blame = {});
      const desperate = player.health + player.guardrails <= 2;
      if (st.desperate !== desperate) {
        st.desperate = desperate;
        player.recalcStats();
      }
    },
  };

  // --- Begleiter (Logik in familiar.js, hier nur die Flags) --------------------

  I.rubber_duck = {
    name: 'Rubber Duck', tagline: 'A friend who listens',
    desc: 'Never says anything. Still the best senior engineer on the team.',
    pools: ['treasure', 'shop'], sprite: 'item_rubber_duck',
    flags: { duck: 1 },
  };

  I.unit_tests = {
    name: 'Unit Tests', tagline: 'Orbital protection',
    desc: "They test nothing, but they're always around you. Coverage: 100 %.",
    pools: ['treasure', 'shop'], sprite: 'item_unit_tests',
    flags: { unitTests: 2 },
  };

  // ===========================================================================
  // EIGENE PASSIVE ITEMS (zusaetzlich zum Design-Doc)
  // ===========================================================================

  I.copy_paste = {
    name: 'Ctrl+C Ctrl+V', tagline: 'Duplicate shots',
    desc: 'Why write it twice when you can paste it four times? DRY is a suggestion.',
    pools: ['treasure', 'shop'], sprite: 'item_copy_paste',
    onShoot(player, proj, game) {
      // 25 % Chance: exakte Kopie des Schusses, leicht verdreht (onShoot wird dabei NICHT erneut
      // ausgeloest, weil spawnProjectile keine Hooks feuert -> keine Endlos-Rekursion)
      const g = G(game);
      if (!g || !proj || !g.rng.chance(0.25)) return;
      const a = (g.rng.chance(0.5) ? 1 : -1) * 0.14;
      const c = Math.cos(a), s = Math.sin(a);
      g.spawnProjectile({
        x: proj.x, y: proj.y,
        vx: proj.vx * c - proj.vy * s,
        vy: proj.vx * s + proj.vy * c,
        team: 'player', damage: proj.damage, r: proj.r, range: proj.range,
        flags: Object.assign({}, proj.flags), color: proj.color, source: proj.source,
      });
    },
  };

  I.on_call_pager = {
    name: 'On-Call Pager', tagline: 'Getting hit hits back',
    desc: 'Woken up at 3 a.m.? Then so is everyone within a 200 px radius.',
    pools: ['treasure', 'secret'], sprite: 'item_on_call_pager',
    onHurt(player, game) {
      // Schockwelle: Gegner in der Naehe nehmen Schaden und werden weggestossen
      const g = G(game);
      if (!g) return;
      const R = 200;
      for (const e of livingEnemies(g)) {
        if (B.M.dist(player.x, player.y, e.x, e.y) > R + e.r) continue;
        if (e.hurt(10, g, null) && !e.noKnockback) e.knockback(e.x - player.x, e.y - player.y, 420);
      }
      fx.ring(g, player.x, player.y, R, '#e05a4f', 0.35);
      fx.popText(g, player.x, player.y - 60, 'PAGE!', '#ff8a7a');
    },
  };

  I.garbage_collector = {
    name: 'Garbage Collector', tagline: 'Kills free up hearts',
    desc: 'Every 12 kills it reclaims half a heart. Stop-the-world pauses included.',
    pools: ['treasure', 'boss'], sprite: 'item_garbage_collector',
    onPickup(player, game) {
      const g = G(game);
      const st = player.itemState.garbage_collector || (player.itemState.garbage_collector = {});
      st.base = g ? g.runStats.kills : 0; // ab jetzt zaehlen
    },
    update(player, dt, game) {
      const g = G(game);
      if (!g) return;
      const st = player.itemState.garbage_collector || (player.itemState.garbage_collector = {});
      if (st.base === undefined || st.base > g.runStats.kills) st.base = g.runStats.kills; // z. B. neuer Run
      if (g.runStats.kills - st.base < 12) return;
      st.base += 12;
      // Halbes Herz heilen; bei voller Gesundheit stattdessen 2 Credits ("freigegebener Speicher")
      if (!player.heal(1)) player.credits = cap99(player.credits + 2);
      g.freezeEnemies(0.6); // "stop-the-world"
      fx.popText(g, player.x, player.y - 60, 'GC: freed 0.5 heart', '#9be37a');
    },
  };

  I.seed_funding = {
    name: 'Seed Funding', tagline: '+15 Credits',
    desc: 'Pre-revenue. Pre-product. Pre-everything. Here, have some money.',
    // Nicht im Shop (Credits fuer Credits kaufen waere selbst fuer ein Startup zu zirkulaer)
    pools: ['treasure', 'boss', 'secret'], sprite: 'item_seed_funding',
    onPickup(player) {
      player.credits = cap99(player.credits + 15);
    },
  };

  I.benchmark_overfitting = {
    name: 'Benchmark Overfitting', tagline: 'Damage way up vs bosses',
    desc: 'Scores 98 % on the boss benchmark. Struggles with literally everything else.',
    pools: ['treasure', 'boss'], sprite: 'item_benchmark_overfitting',
    mult: { damage: 0.9 }, // "struggles with everything else"
    onHitEnemy(player, enemy, proj, game) {
      // Bosse bekommen +60 % Zusatzschaden pro Treffer
      if (!enemy || enemy.dead || !enemy.isBoss) return;
      enemy.hurt((proj ? proj.damage : player.stats.damage) * 0.6, G(game), null);
    },
  };

  I.feature_flag = {
    name: 'Feature Flag', tagline: 'Damage up. Sometimes.',
    desc: "Wrapped in a flag nobody owns. It's on in this room. Probably. Check the shot colour.",
    pools: ['treasure', 'shop'], sprite: 'item_feature_flag',
    onPickup(player) {
      const st = player.itemState.feature_flag || (player.itemState.feature_flag = {});
      st.on = true; // frisch ausgerollt ist es immer an
    },
    onRoomEnter(player, room, game) {
      // Bei jedem Raumwechsel 50/50 neu "ausrollen"
      const g = G(game);
      if (!g) return;
      const st = player.itemState.feature_flag || (player.itemState.feature_flag = {});
      const on = g.rng.chance(0.5);
      if (on !== st.on) {
        st.on = on;
        player.recalcStats();
        fx.popText(g, player.x, player.y - 60, on ? 'flag: ON' : 'flag: off', on ? '#9be37a' : '#a89f97');
      }
    },
    dynamic(player) {
      const st = player.itemState.feature_flag;
      return st && st.on ? { add: { damage: 1.5 }, mult: { fireDelay: 0.9 } } : null;
    },
    onShoot(player, proj) {
      // Sichtbares Feedback: bei aktivem Flag sind die Schuesse gruen
      const st = player.itemState.feature_flag;
      if (st && st.on && proj) proj.color = '#9be37a';
    },
  };

  // ===========================================================================
  // AKTIVE ITEMS (Space) — Ladung +1 pro geschafftem Raum
  // ===========================================================================

  /** Welcher Item-Pool passt zum Raumtyp (fuer Regenerate Response) */
  const POOL_BY_ROOM = { treasure: 'treasure', shop: 'shop', boss: 'boss', secret: 'secret' };

  I.regenerate_response = {
    name: 'Regenerate Response', tagline: 'Reroll items',
    desc: 'Same prompt. Different answer. Same disappointment.',
    pools: ['treasure', 'shop'], sprite: 'item_regenerate_response', price: 15,
    active: true, maxCharge: 2,
    use(player, game) {
      const g = G(game);
      if (!g || !g.room) return false;
      const room = g.room;
      const pool = POOL_BY_ROOM[room.type] || 'treasure';

      // 1) Item-Podeste mit Item neu wuerfeln (Shop-Preise passend zum neuen Item)
      const peds = room.pickups.filter((pk) => B.Pedestal && pk instanceof B.Pedestal && pk.itemId && !pk.dead);
      if (peds.length) {
        for (const pd of peds) {
          const id = g.rollItem(pool);
          pd.itemId = id;
          pd.itemCharge = undefined;                       // neu gewuerfelte Aktiv-Items kommen voll geladen
          if (pd.price) pd.price = B.itemPrice(id);
          pd.touchCooldown = Math.max(pd.touchCooldown || 0, 0.5); // kurz anschauen, bevor man es einsammelt
          fx.burst(g, pd.x, pd.y - 28, '#d97757', 14, 200);
        }
        return true;
      }

      // 2) Sonst normale Pickups neu wuerfeln (geoeffnete Truhen bleiben, was sie sind)
      const plain = room.pickups.filter((pk) => B.Pickup && pk instanceof B.Pickup && !pk.dead && !pk.opened);
      if (plain.length && typeof B.rerollPickup === 'function') {
        for (const pk of plain) {
          B.rerollPickup(pk, g);
          fx.burst(g, pk.x, pk.y, '#d97757', 8, 160);
        }
        return true;
      }
      return deny(player, g, 'nothing to regenerate');
    },
  };

  I.stop_generating = {
    name: 'Stop Generating', tagline: 'Freeze enemies',
    desc: '■ Stop. Everyone stop. Thank you.',
    pools: ['treasure', 'shop'], sprite: 'item_stop_generating', price: 15,
    active: true, maxCharge: 3,
    use(player, game) {
      const g = G(game);
      if (!livingEnemies(g).length) return deny(player, g, 'nobody to stop');
      g.freezeEnemies(4);
      fx.ring(g, player.x, player.y, 260, '#8fd0ff', 0.45);
      return true;
    },
  };

  I.rm_rf = {
    name: 'rm -rf node_modules', tagline: 'Damage all enemies',
    desc: 'Freed 4.2 GB. Feels incredible. Nothing builds anymore.',
    pools: ['treasure', 'shop', 'boss'], sprite: 'item_rm_rf', price: 18,
    active: true, maxCharge: 4,
    use(player, game) {
      const g = G(game);
      const list = livingEnemies(g);
      if (!list.length) return deny(player, g, 'already deleted');
      for (const e of list) {
        if (e.dead) continue; // kann durch Abspaltungen anderer Gegner inzwischen tot sein
        if (e.hurt(25, g, null) && !e.noKnockback) e.knockback(e.x - player.x, e.y - player.y, 300);
        fx.burst(g, e.x, e.y, '#ffb347', 10, 260);
      }
      g.shake(14, 0.4);
      B.bus.emit('explosion', { game: g, x: player.x, y: player.y, radius: 140 }); // nur Audio/Optik
      return true;
    },
  };

  I.compact = {
    name: '/compact', tagline: 'Heal 2 hearts',
    desc: 'Forget everything except the important bits. You feel lighter.',
    pools: ['treasure', 'shop'], sprite: 'item_compact', price: 15,
    active: true, maxCharge: 6,
    use(player, game) {
      // heal() gibt false zurueck, wenn schon volle HP -> Ladung bleibt erhalten
      if (!player.heal(4)) return deny(player, game, 'context already compact');
      fx.popText(game, player.x, player.y - 60, 'context compacted', '#f3ece6');
      return true;
    },
  };

  // --- Eigenes aktives Item ----------------------------------------------------

  I.ctrl_z = {
    name: 'Ctrl+Z', tagline: 'Undo damage',
    desc: 'Restores your health to how it was when you entered the room. Unlike prod.',
    pools: ['treasure', 'shop', 'secret'], sprite: 'item_ctrl_z', price: 15,
    active: true, maxCharge: 3,
    onPickup(player) {
      // Schnappschuss sofort, falls das Item mitten im Raum aufgehoben wird
      player.itemState.ctrl_z = { health: player.health, guardrails: player.guardrails };
    },
    onRoomEnter(player) {
      // Schnappschuss bei jedem Raumwechsel (wird auch fuer Aktiv-Items von fireHook ausgeloest)
      player.itemState.ctrl_z = { health: player.health, guardrails: player.guardrails };
    },
    use(player, game) {
      const snap = player.itemState.ctrl_z;
      if (!snap) return deny(player, game, 'nothing to undo');
      const h = Math.min(player.maxHealth, Math.max(player.health, snap.health));
      const gr = Math.max(player.guardrails, snap.guardrails);
      if (h === player.health && gr === player.guardrails) return deny(player, game, 'nothing to undo');
      player.health = h;
      player.guardrails = gr;
      player.recalcStats(); // z. B. git blame reagiert auf HP
      fx.popText(game, player.x, player.y - 60, 'undone', '#f3ece6');
      return true;
    },
  };
})(window.BOTA);
