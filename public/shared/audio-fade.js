// Mixer dell'audio di /display e stato reale riportato a /control.
// Script classico (come media.js): funzioni globali nel browser, module.exports
// per i test e per il server. Nessun accesso al DOM globale: il mixer riceve
// la fabbrica degli elementi, il clock e lo scheduler dall'esterno.
//
// Un elemento <audio> per traccia, creato al volo e rilasciato quando non serve
// più. Righe: Background (loop, più insieme) e One-shot (una volta, si
// sovrappongono, abbassano i background finché ne suona almeno uno).

const AUDIO_FADE = {
  location: 2000, // cambio location: le vecchie escono, le nuove entrano
  bgIn: 1000, // background acceso
  bgOut: 1000, // background spento
  transport: 400, // one-shot fermato a mano (o eliminato)
  duckOut: 600, // i background scendono quando parte un one-shot
  stingIn: 300, // ingresso di un one-shot
  resumeIn: 1500 // i background risalgono dopo l'ultimo one-shot
};

// Fattore di volume dei background mentre suona almeno un one-shot.
const AUDIO_DUCK_LEVEL = 0.4;

const DISPLAY_AUDIO_STATUS_MAX = 100;

function audioLevelAt(from, to, elapsedMs, durationMs) {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  return from + (to - from) * (elapsedMs / durationMs);
}

function isStatusIdList(list) {
  return Array.isArray(list)
    && list.length <= DISPLAY_AUDIO_STATUS_MAX
    && list.every((id) => typeof id === 'string');
}

// Payload di `audio:status` dal display: { blocked, errors: [id], playing: [id] }.
function normalizeDisplayAudioStatus(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.blocked !== 'boolean') return null;
  if (!isStatusIdList(payload.errors) || !isStatusIdList(payload.playing)) return null;
  return { blocked: payload.blocked, errors: payload.errors.slice(), playing: payload.playing.slice() };
}

function createAudioMixer({ createElement, now, requestFrame, onStatus, onOneshotEnded }) {
  let tracks = new Map(); // `${kind}:${id}` -> traccia della location attiva
  let leaving = []; // tracce che sfumano prima di essere rilasciate
  let locationId; // undefined finché non arriva il primo apply
  let duckTarget = 1;
  let blocked = false;
  let frame = null;
  let lastStatus = null;
  let lastStatusKey = null;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const volumeOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0.7);
  const applyVolume = (t) => { t.el.volume = clamp01(t.volume * t.level * t.duck); };

  // --- stato riportato a /control ---------------------------------------

  function computeStatus() {
    const errors = [];
    const playing = [];
    for (const t of tracks.values()) {
      if (t.error) errors.push(t.id);
      if (t.intent === 'playing' && t.audible) playing.push(t.id);
    }
    errors.sort();
    playing.sort();
    return { blocked, errors, playing };
  }

  function report() {
    const status = computeStatus();
    lastStatus = status;
    const key = JSON.stringify(status);
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    onStatus(status);
  }

  function resendStatus() {
    if (!lastStatus) return;
    lastStatusKey = null;
    report();
  }

  // --- fade --------------------------------------------------------------

  function release(t) {
    t.released = true;
    t.fade = null;
    t.duckFade = null;
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    if (typeof t.el.remove === 'function') t.el.remove();
  }

  function finishFade(t) {
    const then = t.fade && t.fade.then;
    t.fade = null;
    if (then === 'stop') {
      t.el.pause();
      t.parked = true;
      // Il one-shot si riavvolge sempre; il background solo con restartOnStop
      // (letto adesso: un cambio vale dal prossimo spegnimento).
      if (t.kind === 'oneshot' || t.restartOnStop) t.el.currentTime = 0;
    } else if (then === 'release') {
      release(t);
      leaving = leaving.filter((q) => q !== t);
    }
  }

  function tick() {
    frame = null;
    const time = now();
    let pending = false;
    for (const t of [...tracks.values(), ...leaving]) {
      if (t.duckFade) {
        const d = t.duckFade;
        t.duck = audioLevelAt(d.from, d.to, time - d.start, d.duration);
        if (time - d.start >= d.duration) t.duckFade = null;
        else pending = true;
      }
      if (t.fade) {
        const f = t.fade;
        t.level = audioLevelAt(f.from, f.to, time - f.start, f.duration);
      }
      applyVolume(t);
      if (t.fade) {
        if (time - t.fade.start >= t.fade.duration) finishFade(t);
        else pending = true;
      }
    }
    if (pending && frame === null) frame = requestFrame(tick);
  }

  function schedule() {
    if (frame === null) frame = requestFrame(tick);
  }

  function startFade(t, to, duration, then) {
    t.fade = { from: t.level, to, start: now(), duration, then };
    if (duration <= 0) {
      t.level = to;
      applyVolume(t);
      finishFade(t);
      return;
    }
    schedule();
  }

  function startDuck(t, to, duration) {
    t.duckFade = { from: t.duck, to, start: now(), duration };
    if (duration <= 0) {
      t.duck = to;
      t.duckFade = null;
      applyVolume(t);
      return;
    }
    schedule();
  }

  // --- riproduzione -------------------------------------------------------

  function play(t) {
    t.failed = false;
    t.parked = false;
    const token = (t.playToken += 1);
    const result = t.el.play();
    if (!result || typeof result.then !== 'function') {
      onPlayed(t, token);
      return;
    }
    result.then(
      () => onPlayed(t, token),
      (err) => {
        if (t.released || token !== t.playToken || t.intent !== 'playing') return;
        if (err && err.name === 'AbortError') return;
        // L'elemento non sta suonando: il prossimo apply ritenta (nessun
        // tentativo a vuoto nel frattempo). Il livello torna a 0 così, quando
        // il ritentativo riesce, la traccia entra sfumando e non di colpo.
        t.failed = true;
        t.audible = false;
        t.fade = null;
        t.level = 0;
        applyVolume(t);
        if (err && err.name === 'NotAllowedError') blocked = true;
        else t.error = true;
        // Un one-shot che non è partito si chiude subito, anche se bloccato
        // dall'autoplay: il server lo toglie (il pulsante di /control si spegne,
        // i background risalgono) e lo stesso seq non riparte più tardi a sorpresa.
        if (t.kind === 'oneshot') endOneshot(t);
        report();
      }
    );
  }

  function onPlayed(t, token) {
    if (t.released || token !== t.playToken || t.intent !== 'playing') return;
    t.audible = true;
    t.error = false;
    blocked = false;
    // Ritentativo riuscito dopo un blocco: il livello era stato azzerato,
    // si risale con una sfumatura (se non ce n'è già una in corso verso 1).
    if (t.level < 1 && !(t.fade && t.fade.to === 1)) {
      startFade(t, 1, t.kind === 'oneshot' ? AUDIO_FADE.stingIn : AUDIO_FADE.bgIn, null);
    }
    // Ancora della posizione virtuale: fissata al primo play riuscito.
    if (t.anchor === null) t.anchor = now() - (Number(t.el.currentTime) || 0) * 1000;
    report();
  }

  // Un one-shot finito (o in errore) resta muto finché il server non lo toglie
  // da `oneshots`: lo stesso seq non riparte.
  function endOneshot(t) {
    if (t.ended) return;
    t.ended = true;
    t.intent = 'stopped';
    t.audible = false;
    updateDuck();
    onOneshotEnded(t.id, t.seq);
  }

  function updateDuck() {
    let active = false;
    for (const t of tracks.values()) {
      if (t.kind === 'oneshot' && t.intent === 'playing' && !t.ended) active = true;
    }
    const target = active ? AUDIO_DUCK_LEVEL : 1;
    if (target === duckTarget) return;
    duckTarget = target;
    for (const t of tracks.values()) {
      if (t.kind !== 'background') continue;
      startDuck(t, target, active ? AUDIO_FADE.duckOut : AUDIO_FADE.resumeIn);
    }
  }

  function createTrack(kind, def) {
    const el = createElement();
    const t = {
      id: def.id,
      kind,
      el,
      src: def.src,
      volume: volumeOf(def.volume),
      restartOnStop: Boolean(def.restartOnStop),
      level: 0,
      duck: kind === 'background' ? duckTarget : 1,
      fade: null,
      duckFade: null,
      anchor: null,
      seq: null,
      intent: 'stopped', // playing | stopped
      audible: false, // play() risolto e non fermato da allora
      parked: false, // fade di spegnimento concluso, elemento in pausa
      failed: false, // ultimo play() rifiutato: si ritenta al prossimo apply
      error: false,
      ended: false,
      released: false,
      playToken: 0
    };
    el.loop = kind === 'background';
    el.src = def.src;
    el.volume = 0;
    el.addEventListener('ended', () => {
      if (t.released || t.kind !== 'oneshot' || t.intent !== 'playing') return;
      endOneshot(t);
      report();
    });
    el.addEventListener('error', () => {
      if (t.released) return;
      t.error = true;
      t.audible = false;
      if (t.kind === 'oneshot' && t.intent === 'playing') endOneshot(t);
      report();
    });
    return t;
  }

  function leave(t, duration) {
    t.intent = 'stopped';
    t.audible = false;
    leaving.push(t);
    startFade(t, 0, duration, 'release');
  }

  // Posizione "come se avesse sempre suonato", per i background senza restartOnStop.
  function seekVirtual(t) {
    const duration = Number(t.el.duration);
    if (t.anchor === null || !Number.isFinite(duration) || duration <= 0) return;
    const elapsed = (now() - t.anchor) / 1000;
    t.el.currentTime = ((elapsed % duration) + duration) % duration;
  }

  function applyBackground(def, entering) {
    const key = `background:${def.id}`;
    let t = tracks.get(key);
    if (!t) {
      if (!def.on) return;
      t = createTrack('background', def);
      tracks.set(key, t);
    }
    t.volume = volumeOf(def.volume);
    t.restartOnStop = Boolean(def.restartOnStop);
    applyVolume(t);
    if (def.on) {
      if (t.intent !== 'playing') {
        if (t.parked) {
          if (t.restartOnStop) t.el.currentTime = 0;
          else seekVirtual(t);
        }
        t.intent = 'playing';
        play(t);
        startFade(t, 1, entering ? AUDIO_FADE.location : AUDIO_FADE.bgIn, null);
      } else if (t.failed) {
        play(t);
      }
    } else if (t.intent === 'playing') {
      t.intent = 'stopped';
      t.audible = false;
      startFade(t, 0, AUDIO_FADE.bgOut, 'stop');
    }
  }

  function applyOneshot(def, seq) {
    const key = `oneshot:${def.id}`;
    let t = tracks.get(key);
    if (!t) {
      if (seq === undefined) return;
      t = createTrack('oneshot', def);
      tracks.set(key, t);
    }
    t.volume = volumeOf(def.volume);
    applyVolume(t);
    if (seq === undefined) {
      t.seq = null;
      t.ended = false;
      if (t.intent === 'playing') {
        t.intent = 'stopped';
        t.audible = false;
        startFade(t, 0, AUDIO_FADE.transport, 'stop');
      }
      return;
    }
    if (seq !== t.seq) {
      // Partenza (o ri-partenza con un seq nuovo): sempre da capo.
      t.seq = seq;
      t.ended = false;
      t.intent = 'playing';
      t.audible = false;
      t.el.currentTime = 0;
      // Dopo una fine naturale il livello è rimasto a 1: si riparte da 0
      // perché l'ingresso in stingIn ci sia sempre.
      t.level = 0;
      applyVolume(t);
      play(t);
      startFade(t, 1, AUDIO_FADE.stingIn, null);
    } else if (t.intent === 'playing' && t.failed) {
      play(t);
    }
  }

  function apply(scene) {
    const next = scene || {};
    const nextLocation = next.locationId || null;
    const background = Array.isArray(next.background) ? next.background : [];
    const oneshot = Array.isArray(next.oneshot) ? next.oneshot : [];
    const oneshots = next.oneshots && typeof next.oneshots === 'object' ? next.oneshots : {};

    const entering = locationId !== undefined && nextLocation !== locationId;
    if (nextLocation !== locationId) {
      for (const t of tracks.values()) leave(t, AUDIO_FADE.location);
      tracks = new Map();
      locationId = nextLocation;
      // Il ducking riguarda solo i one-shot della location attiva.
      duckTarget = 1;
    }

    // Tracce eliminate o con il file cambiato: sfumano e vengono rilasciate.
    const wanted = new Map();
    for (const def of background) if (def && def.id && def.src) wanted.set(`background:${def.id}`, def);
    for (const def of oneshot) if (def && def.id && def.src) wanted.set(`oneshot:${def.id}`, def);
    for (const [key, t] of [...tracks]) {
      const def = wanted.get(key);
      if (def && def.src === t.src) continue;
      tracks.delete(key);
      leave(t, t.kind === 'background' ? AUDIO_FADE.bgOut : AUDIO_FADE.transport);
      // Stesso one-shot con un file nuovo: il seq già suonato non riparte.
      if (def && t.kind === 'oneshot' && t.seq !== null && oneshots[def.id] === t.seq) {
        const replacement = createTrack('oneshot', def);
        replacement.seq = t.seq;
        replacement.ended = true;
        tracks.set(key, replacement);
      }
    }

    for (const def of background) {
      if (def && def.id && def.src) applyBackground(def, entering);
    }
    for (const def of oneshot) {
      if (!def || !def.id || !def.src) continue;
      const raw = oneshots[def.id];
      applyOneshot(def, Number.isFinite(raw) ? raw : undefined);
    }

    updateDuck();
    report();
  }

  return { apply, resendStatus };
}

// Scena del mixer a partire dalla location attiva (stessa forma per /display e
// /handout). Con `handoutOnly` restano solo le tracce con la spunta "Suona anche
// su /handout"; i one-shot in corso si filtrano di conseguenza.
function audioSceneOf(location, audioOneshots, { handoutOnly = false } = {}) {
  const audio = location && location.map && location.map.audio;
  const pick = (list) => (Array.isArray(list) ? list : [])
    .filter((t) => t && t.file && (!handoutOnly || t.handout === true));
  const src = (t) => `/storage/audio/${t.file}`;
  const oneshot = pick(audio && audio.oneshot);
  const oneshots = {};
  const running = audioOneshots && typeof audioOneshots === 'object' ? audioOneshots : {};
  for (const t of oneshot) if (t.id in running) oneshots[t.id] = running[t.id];
  return {
    locationId: location ? location.id : null,
    background: pick(audio && audio.background).map((t) => ({
      id: t.id, src: src(t), volume: t.volume, on: Boolean(t.on), restartOnStop: Boolean(t.restartOnStop)
    })),
    oneshot: oneshot.map((t) => ({ id: t.id, src: src(t), volume: t.volume })),
    oneshots
  };
}

// Mixer nel browser: un <audio> per traccia dentro `container` (nascosto).
function createPageAudioMixer(container, { onStatus, onOneshotEnded }) {
  return createAudioMixer({
    createElement: () => {
      const el = document.createElement('audio');
      container.appendChild(el);
      return el;
    },
    now: () => performance.now(),
    // rAF non scatta se la pagina è nascosta (schermo spento, tab in secondo
    // piano): senza un timer di riserva i fade resterebbero fermi a volume 0.
    requestFrame: (fn) => {
      let done = false;
      const run = () => { if (!done) { done = true; fn(); } };
      requestAnimationFrame(run);
      setTimeout(run, 100);
    },
    onStatus,
    onOneshotEnded
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AUDIO_FADE,
    AUDIO_DUCK_LEVEL,
    audioLevelAt,
    normalizeDisplayAudioStatus,
    createAudioMixer,
    audioSceneOf
  };
}
