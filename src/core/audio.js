/*
 * audio.js — Synthetisierte Soundeffekte + leise prozedurale Chiptune-Schleife via Web Audio API.
 * Keine Audiodateien, kein Netzwerk: alles entsteht zur Laufzeit aus Oszillatoren und einem Rausch-Puffer.
 *
 * API (kompatibel zur Skelett-Version):
 *   BOTA.audio.unlock()       — AudioContext nach erster Benutzerinteraktion erzeugen/fortsetzen
 *   BOTA.audio.play(name)     — benannten Effekt abspielen (unbekannte Namen werden ignoriert); true = gespielt
 *   BOTA.audio.toggleMute()   — Stummschaltung umschalten (wird ueber BOTA.storage gemerkt)
 *   BOTA.audio.tone(f, f2, dur, type, vol) — einfacher Ton (fuer andere Module)
 *   BOTA.audio.names()        — Liste aller Effektnamen (fuer Tests)
 *
 * Signalfluss:  Stimmen -> sfxBus / musicBus -> master -> Kompressor -> Ausgang
 * Lautstaerken sind bewusst niedrig ("Team-Ablenkung im Grossraumbuero").
 * Spammige Effekte (Schuss, Treffer) sind pro Name zeitlich gedrosselt; zusaetzlich gibt es ein Stimmen-Limit.
 *
 * Datenschutz/Sicherheit: Es wird nichts aufgenommen oder gesendet; nur Ausgabe ueber die Lautsprecher.
 */
'use strict';

(function (B) {
  let ctx = null;
  let master = null, sfxBus = null, musicBus = null, comp = null;
  let noiseBuf = null;
  let activeVoices = 0;
  const MAX_VOICES = 40;
  const MASTER_VOL = 0.5;   // Gesamtlautstaerke (vor dem Kompressor)
  const MUSIC_VOL = 0.13;   // Musik deutlich leiser als Effekte

  // Mindestabstand (s) zwischen zwei Wiedergaben desselben Effekts
  const RATE = { shoot: 0.045, hit: 0.035, splat: 0.07, coin: 0.03, denied: 0.25, enemyDeath: 0.03, rock: 0.05, doorOpen: 0.1, doorClose: 0.1 };
  const lastPlay = Object.create(null);

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ===========================================================================
  // Grundbausteine
  // ===========================================================================

  /** Zaehlt aktive Stimmen (fuer das Stimmen-Limit) */
  function track(node) {
    activeVoices++;
    node.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
  }

  /**
   * Oszillator-Ton mit Frequenzrampe und Huellkurve.
   * o: { f, f2, dur, type, vol, delay (s), attack (s), at (absolute Zeit), dest, vib (Vibrato-Hz), vibDepth, lin (lineare Rampe) }
   */
  function voice(o) {
    if (!ctx) return;
    const t = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const dur = Math.max(0.01, o.dur || 0.1);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, o.f), t);
    if (o.f2 && o.f2 !== o.f) {
      if (o.lin) osc.frequency.linearRampToValueAtTime(Math.max(20, o.f2), t + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    }
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vib;
      lg.gain.value = o.vibDepth || 12;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const vol = o.vol === undefined ? 0.2 : o.vol;
    const atk = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.dest || sfxBus);
    track(osc);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Gefiltertes Rauschen (Explosionen, Klicks, Hi-Hats). o: { dur, vol, filter, f, f2, q, delay, at, dest } */
  function noise(o) {
    if (!ctx || !noiseBuf) return;
    const t = o.at !== undefined ? o.at : ctx.currentTime + (o.delay || 0);
    const dur = Math.max(0.01, o.dur || 0.1);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.filter || 'lowpass';
    filt.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + dur);
    filt.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    const vol = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(o.dest || sfxBus);
    track(src);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  /** Tonfolge (MIDI-Noten), step = Abstand in s */
  function arp(notes, step, type, vol, len) {
    notes.forEach((m, i) => {
      if (m === null) return;
      voice({ f: mtof(m), dur: len || step * 1.6, type, vol, delay: i * step });
    });
  }

  // ===========================================================================
  // Effekt-Bibliothek
  // ===========================================================================
  const SOUNDS = {
    // Schuss: weiches "Pew" mit leichter Tonhoehenvariation
    shoot() { const k = rnd(0.94, 1.06); voice({ f: 880 * k, f2: 420 * k, dur: 0.07, type: 'square', vol: 0.05 }); voice({ f: 1760 * k, f2: 900 * k, dur: 0.03, type: 'triangle', vol: 0.04 }); },
    // Boss-Laser (Reviewer): tiefes Brummen, das hochzieht, plus Zischen
    beam() {
      voice({ f: 90, f2: 180, dur: 0.7, type: 'sawtooth', vol: 0.08, vib: 24, vibDepth: 12 });
      voice({ f: 720, f2: 1200, dur: 0.5, type: 'square', vol: 0.03 });
      noise({ dur: 0.6, vol: 0.08, filter: 'bandpass', f: 1800, f2: 900, q: 2 });
    },
    // HUD-Stoerung (Graphics Glitch): kurzes Bitcrush-Gezirpe aus zufaelligen hohen Tonschnipseln + Rauschen
    glitch() {
      for (let i = 0; i < 6; i++) voice({ f: rnd(300, 2400), dur: 0.035, type: 'square', vol: 0.045, delay: i * 0.04 });
      noise({ dur: 0.22, vol: 0.07, filter: 'bandpass', f: 3200, q: 4 });
    },
    // Gegner getroffen: dumpfes "Tock"
    hit() { const k = rnd(0.9, 1.1); voice({ f: 240 * k, f2: 110 * k, dur: 0.07, type: 'triangle', vol: 0.16 }); noise({ dur: 0.04, vol: 0.06, filter: 'bandpass', f: 2200, q: 1.5 }); },
    // Gegner stirbt: "Plopp" + Zisch
    enemyDeath() { noise({ dur: 0.2, vol: 0.14, filter: 'lowpass', f: 1800, f2: 200 }); voice({ f: 330, f2: 70, dur: 0.16, type: 'square', vol: 0.06 }); },
    // Boss besiegt: langer Donner + absteigende Toene + Siegesakkord
    bossDeath() {
      noise({ dur: 1.2, vol: 0.32, filter: 'lowpass', f: 2400, f2: 60 });
      voice({ f: 140, f2: 28, dur: 1.0, type: 'sine', vol: 0.35 });
      arp([76, 72, 69, 64, 60, 57], 0.09, 'square', 0.05);
      arp([60, 64, 67, 72], 0.11, 'triangle', 0.1, 0.6);
      [60, 64, 67, 72].forEach((m) => voice({ f: mtof(m), dur: 1.2, type: 'triangle', vol: 0.06, delay: 1.0, attack: 0.02 }));
    },
    // Spieler verletzt: "Autsch" mit Vibrato
    hurt() { voice({ f: 520, f2: 170, dur: 0.22, type: 'square', vol: 0.09, vib: 30, vibDepth: 40 }); noise({ dur: 0.08, vol: 0.1, filter: 'highpass', f: 1500 }); },
    // Spieler tot: traurige Moll-Kadenz
    playerDeath() {
      voice({ f: 300, f2: 60, dur: 0.5, type: 'sawtooth', vol: 0.06 });
      arp([72, 67, 63, 60, 55], 0.16, 'triangle', 0.13, 0.3);
      voice({ f: mtof(48), dur: 1.2, type: 'triangle', vol: 0.12, delay: 0.85, attack: 0.03 });
    },
    // Muenze: klassischer Zwei-Ton
    coin() { voice({ f: 988, dur: 0.06, type: 'square', vol: 0.06 }); voice({ f: 1319, dur: 0.22, type: 'square', vol: 0.06, delay: 0.055 }); },
    // Herz: warmer Aufwaertsklang
    heart() { arp([72, 76, 79, 84], 0.05, 'triangle', 0.12, 0.18); },
    // Force Push eingesammelt: dumpfes Plumpsen + Klick
    pickupPush() { voice({ f: 180, f2: 90, dur: 0.12, type: 'sine', vol: 0.2 }); noise({ dur: 0.03, vol: 0.06, filter: 'highpass', f: 3000, delay: 0.02 }); },
    // Approval ("Schluessel"): helles Klimpern
    pickupKey() { arp([84, 91], 0.06, 'triangle', 0.1, 0.15); noise({ dur: 0.04, vol: 0.05, filter: 'highpass', f: 5000 }); },
    // Generischer Pickup
    pickup() { voice({ f: 660, f2: 990, dur: 0.1, type: 'triangle', vol: 0.12 }); },
    // Item-Fanfare (eigene Melodie)
    itemGet() {
      arp([60, 64, 67, 72, 76], 0.075, 'square', 0.06, 0.12);
      [72, 76, 79, 84].forEach((m) => voice({ f: mtof(m), dur: 0.9, type: 'triangle', vol: 0.06, delay: 0.38, attack: 0.02 }));
      arp([96, 100, 103], 0.05, 'sine', 0.035, 0.12);
    },
    // Tueren
    doorOpen() { noise({ dur: 0.18, vol: 0.08, filter: 'lowpass', f: 700, f2: 200 }); voice({ f: 140, f2: 90, dur: 0.15, type: 'sine', vol: 0.12 }); },
    doorClose() { noise({ dur: 0.12, vol: 0.14, filter: 'lowpass', f: 900, f2: 150 }); voice({ f: 100, f2: 40, dur: 0.22, type: 'sine', vol: 0.3 }); },
    // Explosion: Rauschen + tiefer Knall
    explosion() { noise({ dur: 0.7, vol: 0.4, filter: 'lowpass', f: 2600, f2: 80 }); voice({ f: 130, f2: 30, dur: 0.55, type: 'sine', vol: 0.45 }); noise({ dur: 0.05, vol: 0.2, filter: 'highpass', f: 2500 }); },
    // Raum geschafft: Glockenspiel mit Echo
    roomClear() {
      const n = [76, 79, 84, 88];
      arp(n, 0.07, 'triangle', 0.1, 0.4);
      n.forEach((m, i) => voice({ f: mtof(m), dur: 0.35, type: 'sine', vol: 0.03, delay: 0.32 + i * 0.07 }));
    },
    // Kauf: "Ka-tsching"
    purchase() { noise({ dur: 0.06, vol: 0.08, filter: 'highpass', f: 4000 }); voice({ f: 1319, dur: 0.06, type: 'square', vol: 0.06, delay: 0.04 }); voice({ f: 1760, dur: 0.3, type: 'square', vol: 0.06, delay: 0.1 }); },
    // Abgelehnt: Fehler-Brummen (zwei Pulse)
    denied() { voice({ f: 116, dur: 0.1, type: 'sawtooth', vol: 0.07 }); voice({ f: 110, dur: 0.14, type: 'sawtooth', vol: 0.07, delay: 0.12 }); },
    // Aufgeschlossen: Klick + steigende Toene
    unlock() { noise({ dur: 0.03, vol: 0.1, filter: 'highpass', f: 3000 }); arp([79, 86], 0.07, 'triangle', 0.12, 0.2); },
    // Geheimraum: geheimnisvoller Ganzton-Lauf
    secret() { arp([67, 69, 71, 73, 75, 77, 79], 0.06, 'triangle', 0.09, 0.25); voice({ f: mtof(91), dur: 0.8, type: 'sine', vol: 0.05, delay: 0.42 }); },
    // Aktiv-Item benutzt: Wusch + Aufwaertsglissando
    activeUsed() { noise({ dur: 0.3, vol: 0.12, filter: 'bandpass', f: 400, f2: 3500, q: 2 }); voice({ f: 220, f2: 880, dur: 0.22, type: 'square', vol: 0.05 }); },
    // Aktiv-Item geladen: heller Ping
    charged() { voice({ f: 1568, dur: 0.25, type: 'sine', vol: 0.1 }); voice({ f: 2093, dur: 0.35, type: 'sine', vol: 0.07, delay: 0.08 }); },
    // Force Push gelegt: Zuendschnur-Zischen
    fuse() { noise({ dur: 0.35, vol: 0.04, filter: 'highpass', f: 5000 }); voice({ f: 600, f2: 300, dur: 0.05, type: 'square', vol: 0.04 }); },
    // Truhe: Knarzen + Muenzen
    chest() { voice({ f: 200, f2: 330, dur: 0.18, type: 'sawtooth', vol: 0.04, lin: true }); arp([84, 88, 91], 0.06, 'square', 0.05, 0.12); },
    // Fels zerbricht
    rock() { noise({ dur: 0.22, vol: 0.12, filter: 'lowpass', f: 900, f2: 200 }); },
    // Projektil-Spritzer (sehr leise, stark gedrosselt)
    splat() { noise({ dur: 0.04, vol: 0.025, filter: 'bandpass', f: rnd(1200, 1800), q: 2 }); },
    // Boss-Intro: dramatischer Akkordschlag
    bossIntro() {
      noise({ dur: 0.5, vol: 0.18, filter: 'lowpass', f: 3000, f2: 200 });
      [40, 47, 52, 55].forEach((m) => voice({ f: mtof(m), dur: 1.1, type: 'sawtooth', vol: 0.04, attack: 0.01 }));
      voice({ f: 90, f2: 40, dur: 0.6, type: 'sine', vol: 0.3 });
    },
    // Etagenwechsel: Fall-Glissando
    descend() { voice({ f: 880, f2: 110, dur: 0.6, type: 'triangle', vol: 0.12 }); noise({ dur: 0.6, vol: 0.05, filter: 'bandpass', f: 2000, f2: 300, q: 1 }); },
    // Neue Etage: kurzer Jingle
    floorEnter() { arp([60, 67, 72], 0.1, 'square', 0.05, 0.2); voice({ f: mtof(79), dur: 0.6, type: 'triangle', vol: 0.08, delay: 0.3 }); },
  };

  // ===========================================================================
  // Prozedurale Chiptune-Schleife (eine pro Etage, deterministisch aus der Tiefe)
  // ===========================================================================
  const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  };
  const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 6, 5, 4], [0, 4, 5, 3], [0, 2, 3, 4]];

  /** Kleiner deterministischer RNG (nur fuer Musik — NICHT das Run-RNG) */
  function mrng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Erzeugt ein 64-Schritt-Muster (4 Takte a 16 Sechzehntel) fuer eine Tiefe */
  function makeSong(depth, boss) {
    const theme = (B.themeFor ? B.themeFor(depth) : null) || {};
    const m = theme.music || { root: 48, mode: 'minor', bpm: 110, lead: 'square' };
    const r = mrng(depth * 7919 + (boss ? 101 : 0));
    const scale = MODES[boss ? 'phrygian' : m.mode] || MODES.minor;
    const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
    const root = m.root - (boss ? 2 : 0);
    const note = (deg, oct) => {
      const n = scale.length;
      const d = ((deg % n) + n) % n;
      return root + scale[d] + 12 * (oct + Math.floor(deg / n));
    };
    const steps = [];
    // Lead-Motiv (2 Takte), wird im 2. Durchgang leicht variiert
    const motif = [];
    for (let i = 0; i < 32; i++) motif.push(r() < (i % 4 === 0 ? 0.75 : i % 2 === 0 ? 0.45 : 0.15) ? Math.floor(r() * 5) : null);
    for (let s = 0; s < 64; s++) {
      const bar = Math.floor(s / 16), pos = s % 16;
      const deg = prog[bar];
      const ev = { bass: null, lead: null, kick: false, hat: false, snare: false };
      // Bass: synkopiert, Grundton + Oktave
      if (pos === 0 || pos === 6 || pos === 8 || pos === 14) ev.bass = note(deg, pos === 6 ? 1 : 0) - 12;
      // Lead: Akkordtoene aus dem Motiv
      const mv = motif[s % 32];
      if (mv !== null && !(bar === 3 && pos > 11)) ev.lead = note(deg + [0, 2, 4, 7, 9][mv], 1);
      // Schlagzeug (dezent)
      ev.kick = pos === 0 || pos === 8 || (boss && pos === 10);
      ev.snare = (pos === 4 || pos === 12) && (boss || depth >= 3);
      ev.hat = pos % 2 === 1 || (boss && pos % 4 === 2);
      steps.push(ev);
    }
    return { steps, bpm: (m.bpm || 110) * (boss ? 1.12 : 1), lead: boss ? 'sawtooth' : (m.lead || 'square') };
  }

  const music = {
    song: null, step: 0, nextT: 0, depth: 0, boss: false, timer: null,
    start(depth, boss) {
      this.depth = depth; this.boss = !!boss;
      this.song = makeSong(depth, boss);
      this.step = 0;
      this.nextT = ctx ? ctx.currentTime + 0.12 : 0;
      this.fade(1, 0.4);
    },
    stop(fadeS) {
      this.fade(0, fadeS || 0.5);
      const s = this.song;
      setTimeout(() => { if (this.song === s && this.target === 0) this.song = null; }, ((fadeS || 0.5) + 0.1) * 1000);
    },
    target: 1,
    fade(v, sec) {
      this.target = v;
      if (!ctx || !musicBus) return;
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(MUSIC_VOL * v, t + (sec || 0.3));
    },
    /** Lookahead-Scheduler: plant Noten ~0.2 s im Voraus mit der Audio-Uhr (praezise trotz Timer-Jitter) */
    tick() {
      if (!ctx || !this.song || audio.muted || ctx.state !== 'running') return;
      // Leiser in der Pause
      const g = B.game;
      const duck = g && g.state === 'pause' ? 0.35 : 1;
      if (Math.abs(duck * this.target - (this.lastDuck || 1)) > 0.01 && this.target > 0) {
        musicBus.gain.setTargetAtTime(MUSIC_VOL * duck, ctx.currentTime, 0.1);
        this.lastDuck = duck * this.target;
      }
      const stepDur = 60 / this.song.bpm / 4;
      if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05; // nach Tab-Wechsel neu einrasten
      while (this.nextT < ctx.currentTime + 0.2) {
        const ev = this.song.steps[this.step % this.song.steps.length];
        const t = this.nextT;
        if (ev.bass !== null) voice({ f: mtof(ev.bass), dur: stepDur * 1.8, type: 'triangle', vol: 0.5, at: t, dest: musicBus });
        if (ev.lead !== null) voice({ f: mtof(ev.lead), dur: stepDur * 1.4, type: this.song.lead, vol: 0.13, at: t, dest: musicBus });
        if (ev.kick) voice({ f: 150, f2: 40, dur: 0.12, type: 'sine', vol: 0.55, at: t, dest: musicBus });
        if (ev.snare) noise({ dur: 0.09, vol: 0.18, filter: 'bandpass', f: 1800, q: 0.7, at: t, dest: musicBus });
        if (ev.hat) noise({ dur: 0.03, vol: 0.07, filter: 'highpass', f: 7000, at: t, dest: musicBus });
        this.step++;
        this.nextT += stepDur;
      }
    },
  };
  // ===========================================================================
  // Oeffentliche API
  // ===========================================================================
  const audio = {
    muted: false,

    unlock() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -14;
          comp.ratio.value = 4;
          master = ctx.createGain();
          master.gain.value = this.muted ? 0 : MASTER_VOL;
          sfxBus = ctx.createGain();
          sfxBus.gain.value = 0.9;
          musicBus = ctx.createGain();
          musicBus.gain.value = MUSIC_VOL;
          sfxBus.connect(master);
          musicBus.connect(master);
          master.connect(comp);
          comp.connect(ctx.destination);
          // 1 s weisses Rauschen als Quelle fuer alle Rausch-Effekte
          noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          // Musik-Scheduler (Funktionsreferenz, kein String -> CSP-konform)
          music.timer = window.setInterval(() => { try { music.tick(); } catch (e) { /* Musik ist optional */ } }, 50);
          // Laeuft schon ein Run (z. B. Taste erst im Spiel gedrueckt)? Dann Musik der aktuellen Etage starten.
          const g = B.game;
          if (g && g.depth > 0 && g.state !== 'title' && g.state !== 'dead') music.start(g.depth, false);
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* Audio nicht verfuegbar -> stumm weiterspielen */ }
    },

    /** Einfacher Ton-Generator (kompatibel zur Skelett-API) */
    tone(freq, freqEnd, dur, type = 'square', vol = 0.5) {
      if (!ctx || this.muted) return;
      voice({ f: freq, f2: freqEnd, dur, type, vol: vol * 0.4 });
    },

    /** Sound-Bibliothek: name -> Funktion. Andere Module duerfen Eintraege ergaenzen. */
    sounds: SOUNDS,

    names() { return Object.keys(SOUNDS); },

    play(name) {
      const fn = this.sounds[name];
      if (!fn || !ctx || this.muted) return false;
      if (activeVoices > MAX_VOICES && (name === 'shoot' || name === 'hit' || name === 'splat')) return false;
      const t = ctx.currentTime;
      const gap = RATE[name] !== undefined ? RATE[name] : 0.015;
      if (lastPlay[name] !== undefined && t - lastPlay[name] < gap) return false;
      lastPlay[name] = t;
      try { fn(); } catch (e) { return false; } // Audiofehler nie bis ins Spiel durchreichen
      return true;
    },

    toggleMute() {
      this.muted = !this.muted;
      B.storage.data.muted = this.muted;
      B.storage.save();
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(this.muted ? 0 : MASTER_VOL, t + 0.08);
        if (!this.muted && music.song) music.nextT = ctx.currentTime + 0.05;
      }
    },

    /** Musik steuern (optional fuer andere Module) */
    music: {
      start(depth, boss) { if (ctx) music.start(depth, boss); },
      stop(sec) { music.stop(sec); },
      get playing() { return !!music.song; },
    },

    get context() { return ctx; },
    get output() { return sfxBus; },
  };

  // ===========================================================================
  // Bus-Anbindung (Audio hoert nur zu)
  // ===========================================================================
  const on = (evt, fn) => B.bus.on(evt, fn);
  const p = (name) => audio.play(name);
  const PICKUP_SOUND = {
    credit: 'coin', credit5: 'coin', heart: 'heart', heart_half: 'heart', guardrail: 'heart',
    push: 'pickupPush', push2: 'pickupPush', approval: 'pickupKey', chest: 'chest',
  };
  const isCurrentRoom = (room) => !B.game || !room || B.game.room === room;

  on('shoot', () => p('shoot'));
  on('enemyHit', () => p('hit'));
  on('enemyDeath', (e) => {
    if (e.boss) {
      p('bossDeath');
      // Nach dem Boss zurueck zur normalen Etagenmusik
      if (ctx && music.boss) setTimeout(() => { if (music.boss) music.start(music.depth, false); }, 1600);
    } else p('enemyDeath');
  });
  on('playerHurt', () => p('hurt'));
  on('playerDeath', () => { p('playerDeath'); music.stop(0.6); });
  on('pickup', (e) => p(PICKUP_SOUND[e.type] || 'pickup'));
  on('itemGet', () => p('itemGet'));
  on('doorsOpen', (e) => { if (isCurrentRoom(e.room)) p('doorOpen'); });
  on('doorsClose', (e) => { if (isCurrentRoom(e.room)) p('doorClose'); });
  on('explosion', () => p('explosion'));
  on('roomClear', () => p('roomClear'));
  on('purchase', () => p('purchase'));
  on('denied', () => p('denied'));
  on('unlock', () => p('unlock'));
  on('secretFound', () => p('secret'));
  on('activeUsed', () => p('activeUsed'));
  on('activeCharged', () => p('charged'));
  on('bombPlaced', () => p('fuse'));
  on('chestOpen', () => p('chest'));
  on('rockBreak', () => p('rock'));
  on('projectileEnd', (e) => { if (e.impact && e.team === 'player') p('splat'); });
  on('bossIntro', (e) => { p('bossIntro'); if (ctx) music.start((e.game && e.game.depth) || music.depth || 1, true); });
  on('descend', () => { p('descend'); music.stop(0.5); });
  on('floorEnter', (e) => { p('floorEnter'); if (ctx) music.start(e.depth || 1, false); });
  // Ereignisse aus den Gegner-/Boss-Verhalten (Agent B) auf vorhandene Sounds abbilden
  on('bossPhase', () => p('activeUsed'));      // Phasenwechsel: "Whoosh"
  on('bossStomp', () => p('doorClose'));       // Stampfer: dumpfer Schlag
  on('bossBounce', () => p('rock'));           // Friday Deploy prallt von der Wand ab
  on('enemyReveal', () => p('denied'));        // Hallucination enttarnt sich ("NOT MONEY")
  on('enemyRevive', () => p('charged'));
  on('hudGlitch', () => p('glitch'));
  on('bossBeam', () => p('beam'));            // Reviewer-Laser         // Graphics Glitch verfremdet das HUD       // Zombie Process steht wieder auf

  B.audio = audio;
})(window.BOTA);
