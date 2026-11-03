/*
 * pickup.js — Pickups (Herzen, Credits, Force Pushes, Approvals, Truhen), Item-Podeste, Shop-Preise, Falltuer.
 *
 * Pickup-Typ-Vertrag:
 *   BOTA.PICKUP_TYPES.<type> = {
 *     name: 'Credit', sprite: 'pickup_credit', color: '#f2c14e', r: 12,
 *     collect(player, game, pickup) { ...; return true; },  // false = nicht aufgenommen (z. B. volle HP)
 *     weight: 35,                                           // Gewicht fuer Zufalls-Drops (0 = nie)
 *     price: 3,          // optional: Shop-Preis (3–6 laut DESIGN.md); nur Typen mit Preis werden im Shop
 *                        //   angeboten bzw. beim Reroll eines Shop-Artikels gewaehlt
 *     heavy: true,       // optional: wird bei "nicht aufnehmbar" nicht weggeschubst
 *     keepShell: true,   // optional: bleibt nach dem Einsammeln als geoeffnete Huelle liegen (Truhen)
 *   };
 *
 * Oeffentliche API (game.js & items.js verlassen sich darauf):
 *   BOTA.Pickup, BOTA.Pedestal, BOTA.Trapdoor, BOTA.PICKUP_TYPES, BOTA.rollRandomPickup(rng, luck),
 *   BOTA.openChest(game, x, y, opts), BOTA.drawSpriteIfExists(ctx, name, x, y, opts),
 *   BOTA.rerollPickup(pickup, game)  (fuer "Regenerate Response")
 *   BOTA.LOOSE_LOOT  (lose Pickups in Kampfraeumen und Tarnungen der Hallucination, siehe unten)
 *   BOTA.Pipe        (Rohr-Teleporter, siehe unten)
 *
 * Alle Objekte in room.pickups haben update(dt, game) und draw(ctx, game).
 */
'use strict';

(function (B) {
  const clamp99 = (v) => Math.max(0, Math.min(99, v));
  const PT = B.PICKUP_TYPES;

  /** Kleiner "Hinweis"-Text ueber einem Objekt (nur Optik; items.js stellt den Helfer bereit) */
  function hint(game, x, y, text, color) {
    if (B.itemFx && typeof B.itemFx.popText === 'function') B.itemFx.popText(game, x, y, text, color);
  }

  // ---------------------------------------------------------------------------
  // Pickup-Typen
  // Gewichte (Summe ~100) grob BoI-artig: Credits am haeufigsten, dann Herzen, Pushes, Approvals.
  // Seltene Typen (Gewicht <= 4) profitieren von Glueck, siehe rollRandomPickup.
  // ---------------------------------------------------------------------------
  /**
   * Herz-Pickup: heilt um halves; der Teil, der ueber volle HP hinausgeht, geht an den Item-Hook onOverheal
   * (Swap File). Genommen wird das Herz, wenn es heilt oder ein Item den Ueberlauf auffaengt.
   */
  function healPickup(p, halves, game) {
    const over = Math.max(0, halves - (p.maxHealth - p.health));
    const healed = p.heal(halves);
    const banked = over > 0 && typeof p.fireHook === 'function' && p.fireHook('onOverheal', over, game).some((r) => r === true);
    return healed || banked;
  }
  PT.heart_half = { name: 'Half Heart', sprite: 'pickup_heart_half', color: '#e04848', r: 12, weight: 11,
    collect: (p, game) => healPickup(p, 1, game) };
  PT.heart = { name: 'Heart', sprite: 'pickup_heart', color: '#e04848', r: 14, weight: 7, price: 3,
    collect: (p, game) => healPickup(p, 2, game) };
  PT.guardrail = { name: 'Guardrail', sprite: 'pickup_guardrail', color: '#5b8def', r: 14, weight: 4, price: 6,
    collect: (p) => p.addGuardrails(2) };
  PT.credit = { name: 'Credit', sprite: 'pickup_credit', color: '#f2c14e', r: 11, weight: 34,
    collect: (p) => { p.credits = clamp99(p.credits + 1); return true; } };
  PT.credit5 = { name: 'Credit Stack', sprite: 'pickup_credit5', color: '#f7d774', r: 13, weight: 4,
    collect: (p) => { p.credits = clamp99(p.credits + 5); return true; } };
  PT.push = { name: 'Force Push', sprite: 'pickup_push', color: '#6b6b6b', r: 13, weight: 11, price: 5,
    collect: (p) => { p.pushes = clamp99(p.pushes + 1); return true; } };
  PT.push2 = { name: 'Double Force Push', sprite: 'pickup_push2', color: '#6b6b6b', r: 14, weight: 2,
    collect: (p) => { p.pushes = clamp99(p.pushes + 2); return true; } };
  PT.approval = { name: 'Approval', sprite: 'pickup_approval', color: '#7bc96f', r: 12, weight: 9, price: 5,
    collect: (p) => { p.approvals = clamp99(p.approvals + 1); return true; } };
  PT.chest = { name: 'Chest', sprite: 'pickup_chest', color: '#a0703c', r: 18, weight: 4, heavy: true, keepShell: true,
    collect: (p, game, pk) => { B.openChest(game, pk.x, pk.y); return true; } };

  /**
   * README.md: liegt auf ~30 % der Etagen in einem normalen Raum (dungeon.js: assignReadme). Deckt die
   * Karte der Etage auf — ausser dem Geheimraum (der ist ja gerade *nicht* dokumentiert). Kein Zufallsdrop
   * (weight 0), wird von "Regenerate Response" nicht umgewuerfelt.
   */
  PT.readme = { name: 'README.md', sprite: 'pickup_readme', color: '#f4f0e6', r: 13, weight: 0,
    collect: (p, game) => {
      if (game.floor && game.floor.documentMap) game.floor.documentMap();
      game.banner('README.md', 'Finally, documentation. This floor\'s map is revealed. (Secret rooms not included.)');
      return true;
    } };

  /**
   * Verschlossene Truhe: kostet 1 Approval, bessere Beute, kleine Item-Chance.
   * Ohne Approval: "denied" (mit Abklingzeit, sonst wuerde es jeden Frame piepen) + Hinweistext.
   */
  PT.chest_locked = { name: 'Locked Chest', sprite: 'pickup_chest_locked', color: '#8a8f99', r: 18, weight: 2, heavy: true, keepShell: true,
    collect: (p, game, pk) => {
      if (p.approvals <= 0) {
        if (pk.deniedCooldown <= 0) {
          pk.deniedCooldown = 1.5;
          B.bus.emit('denied', { game, reason: 'locked' });
          hint(game, pk.x, pk.y - 34, 'needs 1 Approval', '#e07a6a');
        }
        return false;
      }
      p.approvals--;
      B.bus.emit('unlock', { game, x: pk.x, y: pk.y });
      const res = B.openChest(game, pk.x, pk.y, { locked: true });
      if (res && res.item) pk.noShell = true; // Truhe "wird" zum Podest -> keine Huelle liegen lassen
      return true;
    } };

  /**
   * Lose Pickups in Kampfraeumen. Manche Kampfraeume haben schon beim ersten Betreten 1–2 echte Pickups
   * auf dem Boden (vorab gewuerfelt in dungeon.js: assignLooseLoot, gelegt in game.populate). Dieselbe
   * Typ-Tabelle bestimmt auch, als was sich die Hallucination tarnt (enemy.js: mimic). Gleiche Typen und
   * gleiche Gewichte fuer echt und falsch: Weder "liegt da etwas, obwohl noch gekaempft wird" noch die
   * Art des Pickups verraet, ob es echt ist.
   *   chance        Anteil der Kampfraeume mit losen Pickups
   *   secondChance  davon: Chance auf ein zweites Pickup
   *   types         Typ -> Gewicht (nur Typen, die es in PICKUP_TYPES gibt)
   */
  B.LOOSE_LOOT = { chance: 0.18, secondChance: 0.3, types: { credit: 6, heart_half: 2, approval: 1 } };

  /** Gewicht eines Typs fuer Zufalls-Drops (mit Glueck & leichtem Mitleid bei wenig HP) */
  function dropWeight(t, luck, player) {
    const def = PT[t];
    let w = def.weight || 0;
    if (w <= 0) return 0;
    if (w <= 4) w += luck || 0; // seltene Drops: Glueck addiert sich direkt
    if (player && (t === 'heart' || t === 'heart_half') && player.health <= 2 && player.maxHealth > 2) w *= 1.5;
    return Math.max(0, w);
  }

  /** Zufaelliger Pickup-Typ (Glueck erhoeht seltene Drops leicht) */
  B.rollRandomPickup = function (rng, luck, player) {
    const pl = player || (B.game && B.game.player) || null;
    const types = Object.keys(PT).filter((t) => (PT[t].weight || 0) > 0);
    return rng.weighted(types, (t) => dropWeight(t, luck, pl));
  };

  /** Beutetabelle fuer verschlossene Truhen (keine Einzel-Credits, mehr "gute" Sachen) */
  const LOCKED_LOOT = { heart: 10, guardrail: 7, credit5: 9, credit: 8, push: 8, push2: 4, approval: 5 };

  /**
   * Truhe oeffnen: Pickups verstreuen. opts.locked = bessere Beute + Item-Chance.
   * @returns {{item: (string|null)}} — gespawntes Item (Podest) oder null
   */
  B.openChest = function (game, x, y, opts) {
    const o = opts || {};
    const luck = game.player ? game.player.stats.luck : 0;
    const scatter = (type) => {
      const a = game.rng.angle();
      game.spawnPickup(type, x, y, { vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 });
    };
    let item = null;

    if (o.locked) {
      // 15 % (+2 % pro Glueck, max. 40 %) Chance auf ein Item statt Kleinkram
      if (game.rng.chance(Math.min(0.4, 0.15 + luck * 0.02))) {
        item = game.rollItem('treasure');
        game.spawnPedestal(item, x, y);
        scatter('credit');
      } else {
        const keys = Object.keys(LOCKED_LOOT);
        const n = game.rng.int(3, 4);
        for (let i = 0; i < n; i++) scatter(game.rng.weighted(keys, (k) => LOCKED_LOOT[k]));
      }
    } else {
      const n = game.rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        let type = B.rollRandomPickup(game.rng, luck);
        if (type === 'chest' || type === 'chest_locked') type = 'credit'; // keine Truhen in Truhen
        scatter(type);
      }
    }
    B.bus.emit('chestOpen', { game, x, y, locked: !!o.locked, item });
    return { item };
  };

  /**
   * Pickup in einen anderen zufaelligen Typ verwandeln ("Regenerate Response").
   * Shop-Artikel bleiben Shop-Artikel: nur Typen mit Preis, Preis wird angepasst.
   */
  B.rerollPickup = function (pk, game) {
    if (!pk || pk.dead || pk.opened) return;
    if (pk.type === 'readme') return; // Die Karte bleibt eine Karte
    let type;
    if (pk.price) {
      const sellable = Object.keys(PT).filter((t) => PT[t].price > 0 && t !== pk.type);
      type = game.rng.pick(sellable) || pk.type;
    } else {
      for (let tries = 0; tries < 6; tries++) { // moeglichst einen ANDEREN Typ erwischen
        type = B.rollRandomPickup(game.rng, game.player ? game.player.stats.luck : 0);
        if (type !== pk.type) break;
      }
    }
    pk.morph(type);
  };

  /** Zeichnet ein Preisschild unter einem Shop-Objekt */
  function drawPrice(ctx, x, y, price, affordable) {
    ctx.font = 'bold 16px ' + B.FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(price + '¢', x + 1, y + 1);
    ctx.fillStyle = affordable ? B.COLORS.credit : '#b0a090';
    ctx.fillText(price + '¢', x, y);
  }

  // ---------------------------------------------------------------------------
  // Pickup
  // ---------------------------------------------------------------------------
  class Pickup extends B.Entity {
    /** opts: { vx, vy, price } — mit price ist es ein Shop-Artikel (liegt fest, kostet Credits) */
    constructor(type, x, y, opts) {
      const def = PT[type] || PT.credit;
      super(x, y, def.r || 12);
      const o = opts || {};
      this.type = PT[type] ? type : 'credit';
      this.def = def;
      this.vx = o.vx || 0;
      this.vy = o.vy || 0;
      this.price = o.price || 0;
      this.deniedCooldown = 0;
      this.spawnT = 0.25;   // kurz nicht einsammelbar (Drops "ploppen" erst heraus)
      this.opened = false;  // geoeffnete Truhen bleiben als Huelle liegen
    }

    /** Typ wechseln (Reroll). Shop-Preise werden aus der Typdefinition uebernommen. */
    morph(type) {
      if (!PT[type]) return;
      this.type = type;
      this.def = PT[type];
      this.r = this.def.r || 12;
      if (this.price) this.price = this.def.price || this.price;
      this.spawnT = Math.max(this.spawnT, 0.35);
    }

    update(dt, game) {
      this.t += dt;
      if (this.spawnT > 0) this.spawnT -= dt;
      if (this.deniedCooldown > 0) this.deniedCooldown -= dt;
      if (!this.price) {
        // Reibung + Kachelkollision
        const f = Math.exp(-5 * dt);
        this.vx *= f;
        this.vy *= f;
        this.moveAndCollide(dt, game.room);
      }
      if (this.opened) return; // Huelle: nur noch Deko
      const p = game.player;
      if (this.spawnT <= 0 && p && !p.dead && B.M.circlesOverlap(this, p)) this.tryCollect(p, game);
    }

    tryCollect(p, game) {
      if (this.price) {
        if (p.credits < this.price) {
          if (this.deniedCooldown <= 0) { B.bus.emit('denied', { game, reason: 'credits' }); this.deniedCooldown = 1; }
          return;
        }
        if (!this.def.collect(p, game, this)) return; // z. B. volle HP -> kein Kauf
        p.credits -= this.price;
        B.bus.emit('purchase', { game, type: this.type, price: this.price });
        this.price = 0;
      } else {
        if (!this.def.collect(p, game, this)) {
          // Nicht aufnehmbar (volle HP): sanft wegschubsen statt durchlaufen
          if (!this.def.heavy) this.knockback(this.x - p.x, this.y - p.y, 60);
          return;
        }
      }
      if (this.def.keepShell && !this.noShell) this.opened = true; // Truhe bleibt offen liegen
      else this.dead = true;
      B.bus.emit('pickup', { game, type: this.type, x: this.x, y: this.y, color: this.def.color });
    }

    draw(ctx, game) {
      // Geoeffnete Truhe: eigene Huelle zeichnen (kein Wippen mehr)
      if (this.opened) {
        if (!B.drawSpriteIfExists(ctx, 'pickup_chest_open', this.x, this.y)) {
          ctx.fillStyle = '#5a3d20';
          ctx.fillRect(this.x - 18, this.y - 6, 36, 18);
        }
        return;
      }
      const bob = this.price || this.def.heavy ? 0 : Math.sin(this.t * 4) * 2;
      if (!B.drawSpriteIfExists(ctx, this.def.sprite, this.x, this.y + bob)) {
        // Fallback-Formen
        ctx.fillStyle = this.def.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(this.x - this.r * 0.3, this.y + bob - this.r * 0.3, this.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.price) drawPrice(ctx, this.x, this.y + 30, this.price, game.player.credits >= this.price);
    }
  }

  // ---------------------------------------------------------------------------
  // Item-Podest (Schatzraum, Boss, Shop, verschlossene Truhen)
  // ---------------------------------------------------------------------------
  class Pedestal extends B.Entity {
    /** opts: { price } */
    constructor(itemId, x, y, opts) {
      super(x, y, 24);
      const o = opts || {};
      this.itemId = itemId;
      this.price = o.price || 0;
      this.itemCharge = undefined; // Ladung eines hier abgelegten Aktiv-Items (undefined = voll)
      this.touchCooldown = 0.3;
      this.deniedCooldown = 0;
      this.static = true;
    }

    update(dt, game) {
      this.t += dt;
      if (this.touchCooldown > 0) this.touchCooldown -= dt;
      if (this.deniedCooldown > 0) this.deniedCooldown -= dt;
      const p = game.player;
      if (!this.itemId || !p || p.dead || this.touchCooldown > 0) return;
      if (!B.M.circlesOverlap(this, p)) return;
      if (this.price && p.credits < this.price) {
        if (this.deniedCooldown <= 0) { B.bus.emit('denied', { game, reason: 'credits' }); this.deniedCooldown = 1; }
        return;
      }
      if (this.price) {
        p.credits -= this.price;
        B.bus.emit('purchase', { game, item: this.itemId, price: this.price });
        this.price = 0;
      }
      const id = this.itemId;
      const storedCharge = this.itemCharge;
      const oldCharge = p.active ? p.active.charge : 0;
      this.itemId = null;
      this.itemCharge = undefined;
      const dropped = p.giveItem(id, game);
      // Wurde hier frueher ein Aktiv-Item abgelegt, behaelt es seine damalige Ladung
      // (sonst koennte man durch Hin-und-her-Tauschen unendlich oft voll aufladen).
      if (storedCharge !== undefined && p.active && p.active.id === id) p.active.charge = storedCharge;
      if (dropped) {
        // Aktiv-Item-Tausch: altes Item bleibt (mit seiner Ladung) auf dem Podest liegen
        this.itemId = dropped;
        this.itemCharge = oldCharge;
        this.touchCooldown = 1.0;
      }
      if (!this.itemId && this.removeWhenEmpty) this.dead = true;
    }

    draw(ctx, game) {
      // Sockel
      if (!B.drawSpriteIfExists(ctx, 'pedestal', this.x, this.y + 10)) {
        ctx.fillStyle = '#5c544d';
        ctx.fillRect(this.x - 22, this.y, 44, 22);
        ctx.fillStyle = '#7a7068';
        ctx.fillRect(this.x - 26, this.y - 4, 52, 8);
      }
      if (this.itemId) {
        const def = B.ITEMS[this.itemId];
        const bob = Math.sin(this.t * 3) * 4;
        B.drawSprite(ctx, def ? def.sprite : '?', this.x, this.y - 28 + bob);
      }
      if (this.price && this.itemId) drawPrice(ctx, this.x, this.y + 36, this.price, game.player.credits >= this.price);
    }
  }

  // ---------------------------------------------------------------------------
  // Falltuer zur naechsten Etage
  // ---------------------------------------------------------------------------
  class Trapdoor extends B.Entity {
    constructor(x, y) {
      super(x, y, 30);
      this.armT = 1.0; // kurz nicht betretbar, damit man nicht versehentlich faellt
      this.static = true;
      this.noShadow = true;
      this.drawLayer = -1; // liegt im Boden -> unter allen anderen Entities zeichnen
    }

    update(dt, game) {
      this.t += dt;
      if (this.armT > 0) { this.armT -= dt; return; }
      const p = game.player;
      if (p && !p.dead && B.M.dist(this.x, this.y, p.x, p.y) < this.r * 0.8) game.nextFloor();
    }

    draw(ctx) {
      if (!B.drawSpriteIfExists(ctx, 'trapdoor', this.x, this.y)) {
        ctx.fillStyle = '#0a0807';
        ctx.fillRect(this.x - 32, this.y - 32, 64, 64);
        ctx.strokeStyle = '#6b5a4a';
        ctx.lineWidth = 4;
        ctx.strokeRect(this.x - 32, this.y - 32, 64, 64);
      }
      // Pulsierender Hinweis "cd .." (auch mit Sprite, damit klar ist, was das Loch tut)
      ctx.fillStyle = 'rgba(217,119,87,' + (0.35 + 0.25 * Math.sin(this.t * 3)) + ')';
      ctx.font = 'bold 14px ' + B.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('cd ..', this.x, this.y + 2);
    }
  }

  /**
   * Rohr ("|"): bleibt in manchen Kampfraeumen nach dem Clearing zurueck (dungeon.js: assignPipes,
   * gelegt in game.onRoomClear). Wer hineinlaeuft, wird einseitig in einen zufaelligen anderen Raum der
   * Etage gespuelt (game.pipeWarp: nicht Boss-, nicht Geheimraum, egal ob schon besucht). Mehrfach nutzbar,
   * jedes Mal ein neues Ziel.
   * Ausgeloest wird nur beim *Betreten* (steigende Flanke): Wer auf einem Rohr landet oder darauf steht,
   * wenn es scharf wird, muss erst herunter- und wieder herauflaufen. Dazu sperrt game.pipeCooldown kurz
   * nach jedem Sprung alle Rohre (kein Ping-Pong).
   */
  class Pipe extends B.Entity {
    constructor(x, y) {
      super(x, y, 22);
      this.armT = 0.8;       // kurz nach dem Erscheinen noch nicht aktiv
      this.touching = false; // Spieler stand im letzten Frame auf dem Rohr
      this.static = true;
      this.noShadow = true;
      this.drawLayer = -1;   // im Boden eingelassen -> unter allen anderen Entities
    }

    update(dt, game) {
      this.t += dt;
      if (this.armT > 0) this.armT -= dt;
      const p = game.player;
      const now = !!(p && !p.dead && B.M.dist(this.x, this.y, p.x, p.y) < this.r * 0.9);
      const entered = now && !this.touching;
      this.touching = now;
      if (entered && this.armT <= 0 && !(game.pipeCooldown > 0) && typeof game.pipeWarp === 'function') {
        game.pipeWarp(this);
      }
    }

    draw(ctx) {
      const frame = Math.floor(this.t * 6);
      if (!B.drawSpriteIfExists(ctx, 'pipe', this.x, this.y, { frame, alpha: this.armT > 0 ? 0.5 : 1 })) {
        ctx.fillStyle = '#8a929c';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0a0d10';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /** Zeichnet ein Sprite nur, wenn es definiert ist (sonst false -> Aufrufer zeichnet Fallback) */
  B.drawSpriteIfExists = function (ctx, name, x, y, opts) {
    if (!name || !B.hasSprite(name)) return false;
    B.drawSprite(ctx, name, x, y, opts);
    return true;
  };

  B.Pickup = Pickup;
  B.Pedestal = Pedestal;
  B.Trapdoor = Trapdoor;
  B.Pipe = Pipe;
})(window.BOTA);
