// Dissolvenze dell'audio di /display e stato reale riportato a /control.
// Script classico (come media.js): funzioni globali nel browser, module.exports
// per i test e per il server. Nessun accesso al DOM globale: il motore riceve
// elementi, clock e scheduler dall'esterno.

const AUDIO_FADE = {
  location: 2000, // cambio di file della principale (cambio location incluso)
  transport: 400, // play / pausa / stop, uscita dello sting
  duckOut: 600, // la principale sfuma in pausa quando parte uno sting
  stingIn: 300, // ingresso dello sting
  resumeIn: 1500 // la principale riprende dopo lo sting
};

const DISPLAY_AUDIO_STATUSES = ['playing', 'idle', 'error', 'blocked'];
const DISPLAY_AUDIO_SLOTS = ['main', 'special'];

function audioLevelAt(from, to, elapsedMs, durationMs) {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  return from + (to - from) * (elapsedMs / durationMs);
}

function normalizeDisplayAudioStatus(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!DISPLAY_AUDIO_STATUSES.includes(payload.status)) return null;
  if (!DISPLAY_AUDIO_SLOTS.includes(payload.slot)) return null;
  return { status: payload.status, slot: payload.slot };
}

function createAudioEngine({ elements, now, requestFrame, onStatus, onSpecialEnded }) {
  const players = elements.map((el) => ({
    el,
    role: 'free', // free | active | ducked | leaving
    slot: null,
    src: null,
    seq: null,
    intent: 'stopped', // playing | paused | stopped
    volume: 0.7,
    level: 0,
    fade: null
  }));
  let frame = null;
  let lastSeq = 0;
  let lastStatus = null;
  let lastStatusKey = null;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const applyVolume = (p) => { p.el.volume = clamp01(p.volume * p.level); };

  function report(status, slot) {
    lastStatus = { status, slot };
    const key = `${status}:${slot}`;
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    onStatus({ status, slot });
  }

  function resendStatus() {
    if (!lastStatus) return;
    lastStatusKey = null;
    report(lastStatus.status, lastStatus.slot);
  }

  function release(p) {
    p.el.pause();
    p.el.removeAttribute('src');
    p.el.load();
    p.role = 'free';
    p.slot = null;
    p.src = null;
    p.seq = null;
    p.intent = 'stopped';
    p.level = 0;
    p.fade = null;
  }

  function finishFade(p) {
    const then = p.fade && p.fade.then;
    p.fade = null;
    if (then === 'pause') {
      p.el.pause();
    } else if (then === 'stop') {
      p.el.pause();
      p.el.currentTime = 0;
    } else if (then === 'release') {
      release(p);
    }
  }

  function tick() {
    frame = null;
    const t = now();
    let pending = false;
    for (const p of players) {
      if (!p.fade) continue;
      const f = p.fade;
      const elapsed = t - f.start;
      p.level = audioLevelAt(f.from, f.to, elapsed, f.duration);
      applyVolume(p);
      if (elapsed >= f.duration) finishFade(p);
      else pending = true;
    }
    if (pending && frame === null) frame = requestFrame(tick);
  }

  function startFade(p, to, duration, then) {
    p.fade = { from: p.level, to, start: now(), duration, then };
    if (duration <= 0) {
      p.level = to;
      applyVolume(p);
      finishFade(p);
      return;
    }
    if (frame === null) frame = requestFrame(tick);
  }

  function play(p) {
    const result = p.el.play();
    if (!result || typeof result.then !== 'function') return;
    result.then(
      () => {
        if (p.role === 'active' && p.intent === 'playing') report('playing', p.slot);
      },
      (err) => {
        if (p.role !== 'active') return;
        if (err && err.name === 'AbortError') return;
        // L'elemento non sta suonando: il prossimo stato "playing" deve poter
        // ritentare (come faceva il codice precedente a ogni state:update).
        p.intent = 'paused';
        report(err && err.name === 'NotAllowedError' ? 'blocked' : 'error', p.slot);
      }
    );
  }

  function takeFree() {
    let p = players.find((q) => q.role === 'free');
    if (p) return p;
    p = players.find((q) => q.role === 'leaving') || players.find((q) => q.role === 'ducked');
    release(p);
    return p;
  }

  for (const p of players) {
    p.el.addEventListener('ended', () => {
      if (p.role === 'active' && p.slot === 'special') onSpecialEnded(lastSeq);
    });
    p.el.addEventListener('error', () => {
      if (p.role !== 'active') return;
      report('error', p.slot);
      if (p.slot === 'special') onSpecialEnded(lastSeq);
    });
  }

  function apply(next) {
    lastSeq = next.seq;
    const slot = next.slot === 'special' ? 'special' : 'main';
    const src = next.src || null;
    const state = next.state;

    if (!src) {
      for (const p of players) {
        if (p.role === 'active') {
          p.role = 'leaving';
          startFade(p, 0, AUDIO_FADE.location, 'release');
        } else if (p.role === 'ducked') {
          release(p);
        }
      }
      report('idle', slot);
      return;
    }

    let target = players.find((p) => p.slot === slot && p.src === src && (p.role === 'active' || p.role === 'ducked'));
    const wasDucked = Boolean(target && target.role === 'ducked');
    const created = !target;

    // Una principale ducked con un altro file non serve più.
    if (slot === 'main') {
      for (const p of players) {
        if (p.role === 'ducked' && p !== target) release(p);
      }
    }

    const crossfading = players.some((p) => p !== target && p.role === 'active' && p.slot === 'main');

    if (created) {
      target = takeFree();
      target.role = 'active';
      target.slot = slot;
      target.src = src;
      target.seq = next.seq;
      target.intent = 'stopped';
      target.level = 0;
      target.fade = null;
      target.el.loop = slot === 'main';
      target.el.src = src;
    } else {
      target.role = 'active';
    }

    for (const p of players) {
      if (p === target || p.role !== 'active') continue;
      if (p.slot === 'main' && slot === 'special') {
        p.role = 'ducked';
        p.intent = 'paused';
        startFade(p, 0, AUDIO_FADE.duckOut, 'pause');
      } else {
        p.role = 'leaving';
        startFade(p, 0, p.slot === 'special' ? AUDIO_FADE.transport : AUDIO_FADE.location, 'release');
      }
    }

    target.volume = next.volume;
    applyVolume(target);

    const retriggered = !created && slot === 'special' && target.seq !== next.seq;
    target.seq = next.seq;
    if (retriggered) target.el.currentTime = 0;

    if (state === 'playing') {
      if (target.intent !== 'playing') {
        target.intent = 'playing';
        let duration = AUDIO_FADE.transport;
        if (slot === 'special') duration = AUDIO_FADE.stingIn;
        else if (wasDucked) duration = AUDIO_FADE.resumeIn;
        else if (created && crossfading) duration = AUDIO_FADE.location;
        play(target);
        startFade(target, 1, duration, null);
      } else if (retriggered) {
        target.fade = null;
        target.level = 1;
        applyVolume(target);
        play(target);
      }
    } else {
      const wanted = state === 'paused' ? 'paused' : 'stopped';
      if (target.intent === 'playing') {
        startFade(target, 0, AUDIO_FADE.transport, wanted === 'stopped' ? 'stop' : 'pause');
      } else if (wanted === 'stopped' && target.intent !== 'stopped') {
        target.el.currentTime = 0;
      }
      target.intent = wanted;
      report('idle', slot);
    }
  }

  return { apply, resendStatus };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AUDIO_FADE,
    DISPLAY_AUDIO_STATUSES,
    DISPLAY_AUDIO_SLOTS,
    audioLevelAt,
    normalizeDisplayAudioStatus,
    createAudioEngine
  };
}
