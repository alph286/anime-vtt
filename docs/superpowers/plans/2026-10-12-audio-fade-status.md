# Audio: dissolvenze e stato reale del display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dissolvenze (crossfade, ducking, fade play/pausa/stop) sull'audio di `/display` e un indicatore su `/control` che mostra cosa fa davvero l'audio del display.

**Architecture:** Un motore audio puro e testabile (`public/shared/audio-fade.js`, script classico + `module.exports` come `media.js`) gestisce due elementi `<audio>` con rampe di volume su `requestAnimationFrame`. `display.js` lo pilota da `renderAudio`. Il display riporta `audio:status` al server, che lo tiene solo in memoria (come `displayViewport`) e lo aggiunge al payload di `state:update`; `AudioBox` su `/control` lo mostra. Il modello server (`activeAudioTrack`, `audioState`, `audioTriggerSeq`, eventi `audio:*`) non cambia.

**Tech Stack:** JS vanilla (display, server Node/Express/socket.io), `node --test`, React + Zustand + Vitest + Testing Library (control), Vite (build committata).

**Spec:** `docs/superpowers/specs/2026-10-12-audio-fade-status-design.md`

## Global Constraints

- `/display` gira su Raspberry Pi 4 con Chromium in kiosk **senza mouse né tocco**: nessun avviso, bottone o click nuovo su `/display`. L'autoplay non si tocca.
- Nessun campo dati nuovo salvato su disco; durate fisse in un solo punto: `FADE_LOCATION_MS=2000`, `FADE_TRANSPORT_MS=400`, `DUCK_OUT_MS=600`, `STING_IN_MS=300`, `RESUME_IN_MS=1500`.
- Il comando volume del DM resta immediato (nessuna rampa).
- `displayAudio` è solo in memoria (mai in `state`, mai su disco, mai migrato); azzerato quando l'ultimo display si disconnette.
- `audio:status`: `status` in `playing|idle|error|blocked`, `slot` in `main|special`; qualunque altro valore viene ignorato. Accettato solo da un socket che ha fatto `hello` con `role:'display'`.
- Verifiche in browser **solo** su un server di prova su porta 3100 con `DATA_DIR`/`STORAGE_DIR` temporanei. Mai sul server vero, mai su dati vivi (un `/display` di prova sovrascrive `displayViewport` globale di una sessione reale).
- `public/control/` (build) va ricostruita e committata (`npm run build:control` dalla radice). `/display` è vanilla: nessuna build.
- Messaggi di commit in italiano, con la riga `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` in fondo.

## Review Focus

Condizioni che lo spec implica ma che il caso felice non esercita; ognuna ha un test nel task indicato.

1. `state:update` arriva decine di volte al secondo (pan, trascinamenti) con lo stesso stato audio: il motore deve essere idempotente (nessun `play()` ripetuto, nessuna rampa che riparte). → Task 2, test "idempotente".
2. Cambio location **durante** uno sting: la principale ducked col vecchio file non deve riprendere; parte il nuovo file. → Task 2, test "main diversa dopo lo sting".
3. Stop dello sting a metà (il server torna a `main`): lo sting sfuma e la principale riprende dalla posizione salvata. → Task 2, test "ducking e ripresa".
4. Play rifiutato dal browser (`NotAllowedError`), file illeggibile (`NotSupportedError`) e `AbortError` da pause/load subito dopo: stati `blocked`, `error`, nessuno stato. → Task 2.
5. Pausa premuta a metà di un fade-in e play subito dopo (e viceversa): nessun salto di volume né elemento rimasto muto. → Task 2, test "pausa e play ravvicinati".
6. Display che si disconnette o payload `audio:status` malformato/da un socket non display: stato stantio non deve restare su `/control`. → Task 4 e Task 5.

## File Structure

- Create `public/shared/audio-fade.js` — costanti, `audioLevelAt`, `normalizeDisplayAudioStatus`, `createAudioEngine`. Nessun accesso al DOM globale: elementi, clock e scheduler sono iniettati.
- Create `public/shared/audio-fade.test.js` — test `node --test` con elementi finti e clock manuale.
- Modify `public/display/index.html` — secondo `<audio>` e script `audio-fade.js`.
- Modify `public/display/display.js` — sostituisce la logica `sceneAudioEl`/`renderAudio` con il motore; riinvia lo stato dopo `hello`.
- Modify `server/index.js` — `displayAudio`, `statePayload()`, handler `audio:status`, reset in `disconnect`.
- Modify `editor-app/src/control/types.ts` — `displayAudio?` in `ControlState`.
- Modify `editor-app/src/control/boxes/AudioBox.tsx` — riga di stato.
- Modify `editor-app/src/control/tabs/images-audio.test.tsx` — test della riga di stato.
- Rebuild `public/control/**`.
- Modify `CLAUDE.md` — sezione breve.

---

### Task 0: Preparazione ambiente

**Files:** nessuno modificato.

- [ ] **Step 1: Installare le dipendenze (il worktree non ha `node_modules`)**

```bash
npm install && (cd editor-app && npm install)
```
Expected: termina senza errori.

- [ ] **Step 2: Verificare la baseline verde**

```bash
node --test public/shared/media.test.js && (cd editor-app && npx vitest run)
```
Expected: `media.test.js` 38/38; Vitest tutto verde (298 test circa). Se qualcosa è già rosso, annotarlo e non attribuirlo ai task seguenti.

---

### Task 1: Costanti, rampa e normalizzazione dello stato

**Files:**
- Create: `public/shared/audio-fade.js`
- Test: `public/shared/audio-fade.test.js`

**Interfaces:**
- Produces: `AUDIO_FADE` (`{ location, transport, duckOut, stingIn, resumeIn }` in ms); `audioLevelAt(from, to, elapsedMs, durationMs): number`; `normalizeDisplayAudioStatus(payload): {status, slot} | null`; `DISPLAY_AUDIO_STATUSES`, `DISPLAY_AUDIO_SLOTS`. Task 2 aggiunge `createAudioEngine` allo stesso file ed export.

- [ ] **Step 1: Scrivere i test che falliscono**

```js
// public/shared/audio-fade.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUDIO_FADE,
  audioLevelAt,
  normalizeDisplayAudioStatus
} = require('./audio-fade.js');

test('AUDIO_FADE ha le durate concordate', () => {
  assert.deepEqual(AUDIO_FADE, { location: 2000, transport: 400, duckOut: 600, stingIn: 300, resumeIn: 1500 });
});

test('audioLevelAt: rampa lineare con clamp', () => {
  assert.equal(audioLevelAt(0, 1, 0, 400), 0);
  assert.equal(audioLevelAt(0, 1, 200, 400), 0.5);
  assert.equal(audioLevelAt(0, 1, 400, 400), 1);
  assert.equal(audioLevelAt(0, 1, 900, 400), 1);
  assert.equal(audioLevelAt(1, 0, 100, 400), 0.75);
  assert.equal(audioLevelAt(0, 1, -50, 400), 0);
});

test('audioLevelAt: durata zero o negativa salta al valore finale', () => {
  assert.equal(audioLevelAt(0, 1, 0, 0), 1);
  assert.equal(audioLevelAt(1, 0, 10, -5), 0);
});

test('normalizeDisplayAudioStatus: accetta solo valori in whitelist', () => {
  assert.deepEqual(normalizeDisplayAudioStatus({ status: 'playing', slot: 'main' }), { status: 'playing', slot: 'main' });
  assert.deepEqual(normalizeDisplayAudioStatus({ status: 'blocked', slot: 'special', extra: 1 }), { status: 'blocked', slot: 'special' });
  assert.equal(normalizeDisplayAudioStatus({ status: 'boom', slot: 'main' }), null);
  assert.equal(normalizeDisplayAudioStatus({ status: 'idle', slot: 'x' }), null);
  assert.equal(normalizeDisplayAudioStatus({ status: 'idle' }), null);
  assert.equal(normalizeDisplayAudioStatus(null), null);
  assert.equal(normalizeDisplayAudioStatus('playing'), null);
  assert.equal(normalizeDisplayAudioStatus(undefined), null);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test public/shared/audio-fade.test.js`
Expected: FAIL (`Cannot find module './audio-fade.js'`).

- [ ] **Step 3: Implementazione minima**

```js
// public/shared/audio-fade.js
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AUDIO_FADE,
    DISPLAY_AUDIO_STATUSES,
    DISPLAY_AUDIO_SLOTS,
    audioLevelAt,
    normalizeDisplayAudioStatus
  };
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `node --test public/shared/audio-fade.test.js`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add public/shared/audio-fade.js public/shared/audio-fade.test.js
git commit -m "feat(audio): costanti dei fade, rampa lineare e validazione audio:status

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Il motore delle dissolvenze

**Files:**
- Modify: `public/shared/audio-fade.js` (aggiunge `createAudioEngine` prima del blocco `module.exports`, e lo esporta)
- Modify: `public/shared/audio-fade.test.js` (aggiunge gli import e i test sotto)

**Interfaces:**
- Consumes: `AUDIO_FADE`, `audioLevelAt` (Task 1).
- Produces: `createAudioEngine({ elements, now, requestFrame, onStatus, onSpecialEnded })` →
  `{ apply(next), resendStatus() }`.
  - `elements`: array di esattamente 2 elementi simili a `HTMLAudioElement` (`play()`→Promise, `pause()`, `load()`, `removeAttribute()`, `addEventListener()`, proprietà `src`, `volume`, `loop`, `currentTime`, `paused`).
  - `now(): number` (ms), `requestFrame(fn): any`.
  - `onStatus({status, slot})` chiamato solo quando cambia; `onSpecialEnded(seq)` quando la speciale attiva finisce o dà errore.
  - `apply({ slot: 'main'|'special', src: string|null, volume: number, state: 'playing'|'paused'|'stopped'|null, seq: number })` — idempotente, da chiamare a ogni `state:update`.

Ruoli interni di un player: `free` (vuoto), `active` (quello che il server vuole sentire), `ducked` (principale messa in pausa sotto uno sting, mantiene `src` e `currentTime`), `leaving` (in dissolvenza verso il rilascio).

- [ ] **Step 1: Scrivere i test che falliscono** (aggiungere in coda a `audio-fade.test.js`; aggiungere `createAudioEngine` all'import in cima)

```js
// --- in cima: const { AUDIO_FADE, audioLevelAt, normalizeDisplayAudioStatus, createAudioEngine } = require('./audio-fade.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const near = (actual, expected, eps = 0.011) =>
  assert.ok(Math.abs(actual - expected) < eps, `atteso ~${expected}, ottenuto ${actual}`);

function fakeEl() {
  const listeners = {};
  return {
    volume: 1, paused: true, currentTime: 0, loop: false, src: '', playCalls: 0,
    playResult: () => Promise.resolve(),
    play() { this.paused = false; this.playCalls += 1; return this.playResult(); },
    pause() { this.paused = true; },
    load() {},
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type) { if (listeners[type]) listeners[type](); }
  };
}

function harness() {
  let t = 0;
  let frames = [];
  const els = [fakeEl(), fakeEl()];
  const statuses = [];
  const ended = [];
  const engine = createAudioEngine({
    elements: els,
    now: () => t,
    requestFrame: (fn) => { frames.push(fn); return frames.length; },
    onStatus: (s) => statuses.push(s),
    onSpecialEnded: (seq) => ended.push(seq)
  });
  const advance = (ms) => {
    const end = t + ms;
    while (t < end) {
      t = Math.min(t + 50, end);
      const batch = frames;
      frames = [];
      batch.forEach((fn) => fn());
    }
  };
  return { els, engine, statuses, ended, advance, pendingFrames: () => frames.length };
}

const play = (src, extra = {}) => ({ slot: 'main', src, volume: 0.7, state: 'playing', seq: 0, ...extra });
const sting = (src, seq) => ({ slot: 'special', src, volume: 0.7, state: 'playing', seq });

test('primo play: carica, fa fade-in di 400ms e segnala playing', async () => {
  const { els, engine, statuses, advance } = harness();
  engine.apply(play('A'));
  assert.equal(els[0].src, 'A');
  assert.equal(els[0].loop, true);
  assert.equal(els[0].playCalls, 1);
  assert.equal(els[0].volume, 0);
  advance(200);
  near(els[0].volume, 0.35);
  advance(200);
  near(els[0].volume, 0.7);
  await flush();
  assert.deepEqual(statuses, [{ status: 'playing', slot: 'main' }]);
});

test('idempotente: stesso stato ripetuto non rilancia play né rampe', async () => {
  const { els, engine, advance, pendingFrames } = harness();
  engine.apply(play('A'));
  advance(400);
  for (let i = 0; i < 50; i += 1) engine.apply(play('A'));
  assert.equal(els[0].playCalls, 1);
  assert.equal(pendingFrames(), 0);
  near(els[0].volume, 0.7);
});

test('cambio volume del DM: immediato, senza rampa', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  engine.apply(play('A', { volume: 0.3 }));
  near(els[0].volume, 0.3);
});

test('crossfade: cambio file della principale in 2s, la vecchia viene rilasciata', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  engine.apply(play('B'));
  assert.equal(els[1].src, 'B');
  advance(1000);
  near(els[0].volume, 0.35);
  near(els[1].volume, 0.35);
  advance(1000);
  assert.equal(els[0].src, '');
  assert.equal(els[0].paused, true);
  near(els[1].volume, 0.7);
});

test('ducking e ripresa: la principale mantiene la posizione sotto lo sting', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  els[0].currentTime = 42;
  engine.apply(sting('S', 1));
  assert.equal(els[1].src, 'S');
  assert.equal(els[1].loop, false);
  advance(300);
  near(els[1].volume, 0.7);
  advance(300);
  assert.equal(els[0].paused, true);
  assert.equal(els[0].src, 'A');
  assert.equal(els[0].currentTime, 42);
  // il server torna alla principale (fine sting o stop a metà)
  engine.apply(play('A', { seq: 1 }));
  assert.equal(els[0].playCalls, 2);
  assert.equal(els[0].currentTime, 42);
  advance(400);
  assert.equal(els[1].src, '');
  advance(1100);
  near(els[0].volume, 0.7);
});

test('main diversa dopo lo sting (cambio location durante lo sting): la ducked viene scartata', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  engine.apply(sting('S', 1));
  advance(700);
  engine.apply(play('B', { seq: 1 }));
  assert.equal(els[0].src, 'B');
  assert.equal(els[0].currentTime, 0);
  advance(400);
  assert.equal(els[1].src, '');
  near(els[0].volume, 0.7);
});

test('retrigger dello sting: riparte da zero senza fade', () => {
  const { els, engine, advance } = harness();
  engine.apply(sting('S', 1));
  advance(300);
  els[0].currentTime = 5;
  engine.apply(sting('S', 2));
  assert.equal(els[0].currentTime, 0);
  assert.equal(els[0].playCalls, 2);
  near(els[0].volume, 0.7);
});

test('pausa: fade-out di 400ms poi pause; play riprende con fade-in', () => {
  const { els, engine, statuses, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  engine.apply(play('A', { state: 'paused' }));
  advance(200);
  near(els[0].volume, 0.35);
  assert.equal(els[0].paused, false);
  advance(200);
  assert.equal(els[0].paused, true);
  near(els[0].volume, 0);
  assert.deepEqual(statuses.at(-1), { status: 'idle', slot: 'main' });
  engine.apply(play('A'));
  assert.equal(els[0].playCalls, 2);
  advance(400);
  near(els[0].volume, 0.7);
});

test('stop: fade-out poi pausa e currentTime a zero', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  els[0].currentTime = 30;
  engine.apply(play('A', { state: 'stopped' }));
  advance(400);
  assert.equal(els[0].paused, true);
  assert.equal(els[0].currentTime, 0);
});

test('pausa e play ravvicinati a metà fade-in: nessun salto, finisce a pieno volume', () => {
  const { els, engine, advance } = harness();
  engine.apply(play('A'));
  advance(200);
  const mid = els[0].volume;
  engine.apply(play('A', { state: 'paused' }));
  advance(50);
  engine.apply(play('A'));
  assert.ok(els[0].volume <= mid + 0.011);
  advance(400);
  near(els[0].volume, 0.7);
  assert.equal(els[0].paused, false);
});

test('senza file sulla traccia attiva: sfuma e libera, stato idle', () => {
  const { els, engine, statuses, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  engine.apply({ slot: 'main', src: null, volume: 0.7, state: 'stopped', seq: 0 });
  advance(2000);
  assert.equal(els[0].src, '');
  assert.deepEqual(statuses.at(-1), { status: 'idle', slot: 'main' });
});

test('ended della speciale attiva chiama onSpecialEnded con l\'ultimo seq; la principale mai', () => {
  const { els, engine, ended, advance } = harness();
  engine.apply(play('A'));
  advance(400);
  els[0].fire('ended');
  assert.deepEqual(ended, []);
  engine.apply(sting('S', 7));
  els[1].fire('ended');
  assert.deepEqual(ended, [7]);
});

test('error sulla speciale: stato error e onSpecialEnded; sulla principale solo stato error', () => {
  const { els, engine, statuses, ended } = harness();
  engine.apply(sting('S', 3));
  els[0].fire('error');
  assert.deepEqual(statuses.at(-1), { status: 'error', slot: 'special' });
  assert.deepEqual(ended, [3]);
});

test('play() rifiutato: NotAllowedError -> blocked, NotSupportedError -> error, AbortError -> nessuno stato', async () => {
  for (const [name, expected] of [['NotAllowedError', 'blocked'], ['NotSupportedError', 'error'], ['AbortError', null]]) {
    const { els, engine, statuses } = harness();
    els[0].playResult = () => Promise.reject(Object.assign(new Error('x'), { name }));
    engine.apply(play('A'));
    await flush();
    if (expected === null) assert.deepEqual(statuses, []);
    else assert.deepEqual(statuses, [{ status: expected, slot: 'main' }]);
  }
});

test('resendStatus ripete l\'ultimo stato anche se invariato', async () => {
  const { engine, statuses } = harness();
  engine.apply(play('A'));
  await flush();
  engine.resendStatus();
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses[1], statuses[0]);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test public/shared/audio-fade.test.js`
Expected: i test nuovi FAIL con `createAudioEngine is not a function`; i 4 del Task 1 restano PASS.

- [ ] **Step 3: Implementare `createAudioEngine`** (inserire in `audio-fade.js` prima del blocco `module.exports`, poi aggiungere `createAudioEngine` all'oggetto esportato)

```js
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
```

Aggiornare l'export: aggiungere `createAudioEngine` all'oggetto in `module.exports`.

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `node --test public/shared/audio-fade.test.js`
Expected: tutti PASS (4 del Task 1 + 15 nuovi). Se un test di tempo fallisce di poco, **non** allargare le tolleranze: controllare l'ordine delle chiamate `startFade`/`applyVolume` nel motore.

- [ ] **Step 5: Regressione e commit**

```bash
node --test public/shared/media.test.js public/shared/audio-fade.test.js
git add public/shared/audio-fade.js public/shared/audio-fade.test.js
git commit -m "feat(audio): motore delle dissolvenze (crossfade, ducking, fade di trasporto)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `media.test.js` ancora 38/38.

---

### Task 3: Collegare il motore a /display

**Files:**
- Modify: `public/display/index.html:42` e le `<script>` alle righe 47-50
- Modify: `public/display/display.js` (const `sceneAudioEl` e i due listener alle righe ~23-41; blocco `renderAudio` e variabili `lastAudioKey`/`lastAudioTriggerSeq` alle righe ~246-304; handler `connect` alla riga ~124)

**Interfaces:**
- Consumes: `createAudioEngine` (globale, dallo script classico), `socket` (riga 1 di `display.js`).
- Produces: evento socket `audio:status` `{status, slot}` (consumato dal Task 4); `audio:specialEnded` come prima.

- [ ] **Step 1: HTML — secondo elemento audio e script**

In `public/display/index.html` sostituire `<audio id="scene-audio" hidden></audio>` con:

```html
  <audio id="scene-audio" hidden></audio>
  <audio id="scene-audio-b" hidden></audio>
```

e aggiungere, **prima** di `<script src="display.js"></script>`:

```html
<script src="/shared/audio-fade.js"></script>
```

- [ ] **Step 2: display.js — creare il motore al posto di `sceneAudioEl`**

Leggere prima le righe 20-42 e 244-305 di `public/display/display.js`. Eliminare `const sceneAudioEl = …`, i due listener `ended`/`error` e il loro commento. Al loro posto, subito dopo `const compassEl = …`:

```js
// Audio della scena: due <audio> alternati dal motore (crossfade, ducking
// dello sting, fade di play/pausa/stop). Il motore decide cosa sfumare; qui lo
// si pilota solo da renderAudio e gli si porta fuori stato e fine-sting.
const audioEngine = createAudioEngine({
  elements: [document.getElementById('scene-audio'), document.getElementById('scene-audio-b')],
  now: () => performance.now(),
  requestFrame: (fn) => requestAnimationFrame(fn),
  onStatus: (status) => socket.emit('audio:status', status),
  onSpecialEnded: (seq) => socket.emit('audio:specialEnded', { seq })
});
```

- [ ] **Step 3: display.js — sostituire `renderAudio` e le sue variabili**

Eliminare `let lastAudioKey`, `let lastAudioTriggerSeq`, i loro commenti e il corpo di `renderAudio`, lasciando solo:

```js
// L'elemento <audio> non è mai visibile -- solo suono, indipendente da quale
// layer (mappa/immagine) è mostrato: è una scelta di design che mostrare
// un'immagine ai giocatori non ferma l'audio. Il motore (shared/audio-fade.js)
// confronta ogni stato con il precedente e fa solo il minimo necessario.
function renderAudio(location, activeAudioTrack, audioState, audioTriggerSeq) {
  const slot = activeAudioTrack === 'special' ? 'special' : 'main';
  const track = location && location.map.audio[slot];
  audioEngine.apply({
    slot,
    src: track && track.file ? `/storage/audio/${track.file}` : null,
    volume: track && track.volume !== undefined ? track.volume : 0.7,
    state: audioState,
    seq: audioTriggerSeq
  });
}
```

Verificare con `grep -n "sceneAudioEl\|lastAudioKey\|lastAudioTriggerSeq" public/display/display.js` che non resti nessun riferimento (atteso: nessun output).

- [ ] **Step 4: display.js — riinviare lo stato dopo `hello`**

Nel handler `socket.on('connect', …)` aggiungere dopo `socket.emit('hello', { role: 'display' });`:

```js
  audioEngine.resendStatus();
```

(Il server azzera lo stato quando l'ultimo display si disconnette: alla riconnessione va ridetto. L'`audio:status` emesso prima di `hello` viene ignorato dal server, per questo il reinvio.)

- [ ] **Step 5: Verifica in browser su server di prova (porta 3100, dati temporanei)**

Preparare dati e due file audio (sinusoidi da 20 s) in una cartella temporanea:

```bash
T=$(mktemp -d) && mkdir -p "$T/data" "$T/storage/audio" && echo "$T" > /tmp/claude-1000/audio-t.txt
ffmpeg -loglevel error -f lavfi -i "sine=frequency=440:duration=20" "$T/a.wav"
ffmpeg -loglevel error -f lavfi -i "sine=frequency=880:duration=20" "$T/b.wav"
ffmpeg -loglevel error -f lavfi -i "sine=frequency=1320:duration=6" "$T/s.wav"
DATA_DIR="$T/data" STORAGE_DIR="$T/storage" PORT=3100 node server/index.js
```
(l'ultimo comando in un terminale a parte o in background). Poi, da un altro terminale, caricare le tracce sulla location di default (`curl -F`: leggere l'id con `curl -s localhost:3100/api/...` oppure da `$T/data/state.json`; campi `locationId`, `slot`, `file`):

```bash
T=$(cat /tmp/claude-1000/audio-t.txt)
LOC=$(node -e "console.log(require('$T/data/state.json').locations[0].id)")
curl -s -F locationId=$LOC -F slot=main -F "file=@$T/a.wav;type=audio/wav" localhost:3100/api/upload/audio
curl -s -F locationId=$LOC -F slot=special -F "file=@$T/s.wav;type=audio/wav" localhost:3100/api/upload/audio
```

Aprire `http://localhost:3100/display/` nel browser integrato (solo il server di prova). Da una pagina `/control/` di prova, o direttamente da un client socket.io, emettere `audio:play`. Osservare dal `javascript_tool` sulla pagina display:

```js
[...document.querySelectorAll('audio')].map(a => ({ src: a.src.slice(-14), v: +a.volume.toFixed(2), paused: a.paused, t: +a.currentTime.toFixed(1) }))
```
Expected, in sequenza: dopo `audio:play` la prima ha `v` che sale da 0 a 0.7 in ~0,4 s; dopo `audio:playSpecial` la principale scende a 0 e va `paused:true` con `t` mantenuto, la speciale sale a 0.7; a fine sting (6 s) o con `audio:stop` la principale riparte con `paused:false` e `t` vicino al valore salvato. Console senza errori (`read_console_messages`). Il suono non è verificabile: i valori sì.

- [ ] **Step 6: Commit**

```bash
git add public/display/index.html public/display/display.js
git commit -m "feat(display): audio con dissolvenze tramite il motore condiviso

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Server — `audio:status` e `displayAudio` nel payload

**Files:**
- Modify: `server/index.js` (require alla riga 11; `displayViewport` riga 408 e `broadcastState` riga 410; i punti `{ ...state, displayViewport }` alle righe 456, 558, 570, 760, 772; handler dopo `display:viewport` riga ~470; `disconnect` riga ~1194)

**Interfaces:**
- Consumes: `normalizeDisplayAudioStatus` (Task 1); evento `audio:status` (Task 3).
- Produces: campo `displayAudio: {status, slot} | null` in ogni `state:update` (consumato dal Task 5).

- [ ] **Step 1: Require**

Dopo la riga 11 (`const { AOE_COLORS, AOE_SHADER_OVERRIDE_IDS } = require('../public/shared/media.js');`):

```js
const { normalizeDisplayAudioStatus } = require('../public/shared/audio-fade.js');
```

- [ ] **Step 2: Payload centralizzato**

Sotto `let displayViewport = null;` (riga ~408) aggiungere e sostituire `broadcastState`:

```js
// Stato reale dell'audio di /display, riportato dal display stesso. Come
// displayViewport: volutamente fuori da `state` (mai persistito), si ripopola
// alla riconnessione del display e si azzera quando l'ultimo display se ne va.
let displayAudio = null;

function statePayload() {
  return { ...state, displayViewport, displayAudio };
}

function broadcastState() {
  io.emit('state:update', statePayload());
}
```

Poi sostituire ogni `{ ...state, displayViewport }` rimasto con `statePayload()`:

```bash
sed -i 's/{ \.\.\.state, displayViewport }/statePayload()/g' server/index.js
grep -n "displayViewport }" server/index.js
```
Expected: l'ultimo `grep` non stampa nulla; il `statePayload` definito sopra usa `displayViewport, displayAudio }` ma non la forma cercata, quindi non viene toccato. Controllare con `git diff server/index.js` che `statePayload()` stesso non sia stato trasformato in ricorsione infinita (deve restare `return { ...state, displayViewport, displayAudio };`).

- [ ] **Step 3: Handler**

Subito dopo il blocco `socket.on('display:viewport', …)` (riga ~470-473):

```js
  // Stato reale dell'audio, solo dal display (ha fatto `hello` con role display).
  // Si ritrasmette solo quando cambia, mai su disco.
  socket.on('audio:status', (payload) => {
    if (!displaySockets.has(socket.id)) return;
    const next = normalizeDisplayAudioStatus(payload);
    if (!next) return;
    if (displayAudio && displayAudio.status === next.status && displayAudio.slot === next.slot) return;
    displayAudio = next;
    broadcastState();
  });
```

- [ ] **Step 4: Reset alla disconnessione**

Sostituire il handler `disconnect` con:

```js
  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
    const wasDisplay = displaySockets.delete(socket.id);
    broadcastDisplayStatus();
    if (wasDisplay && displaySockets.size === 0 && displayAudio) {
      displayAudio = null;
      broadcastState();
    }
  });
```

- [ ] **Step 5: Verifica con un client socket.io (server di prova su 3100, come al Task 3)**

Script temporaneo in `/tmp/claude-1000/-home-kratos-Documenti-Projects-anime-vtt--claude-worktrees-audio-development-proposals-664ebb/40ed8827-b00e-47a6-9e2c-e96b17acaa39/scratchpad/status-check.js` (non committare):

```js
const { io } = require('/home/kratos/Documenti/Projects/anime-vtt/.claude/worktrees/audio-development-proposals-664ebb/editor-app/node_modules/socket.io-client');
const seen = [];
const watcher = io('http://localhost:3100');
watcher.on('state:update', (s) => seen.push(s.displayAudio));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await wait(300);
  const intruder = io('http://localhost:3100'); // niente hello display
  await wait(200);
  intruder.emit('audio:status', { status: 'playing', slot: 'main' });
  await wait(200);
  console.log('da non-display ignorato:', seen.at(-1) === null);
  const display = io('http://localhost:3100');
  await wait(200);
  display.emit('hello', { role: 'display' });
  display.emit('audio:status', { status: 'bogus', slot: 'main' });
  await wait(200);
  console.log('malformato ignorato:', seen.at(-1) === null);
  display.emit('audio:status', { status: 'blocked', slot: 'main' });
  await wait(200);
  console.log('valido ritrasmesso:', JSON.stringify(seen.at(-1)));
  display.close();
  await wait(300);
  console.log('azzerato alla disconnessione:', seen.at(-1) === null);
  process.exit(0);
})();
```

Run: `node <percorso-sopra>/status-check.js`
Expected:
```
da non-display ignorato: true
malformato ignorato: true
valido ritrasmesso: {"status":"blocked","slot":"main"}
azzerato alla disconnessione: true
```
Controllare anche che `$T/data/state.json` non contenga la stringa `displayAudio` (`grep -c displayAudio "$T/data/state.json"` → `0`).

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(server): audio:status del display in memoria e displayAudio in state:update

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: /control — riga di stato in AudioBox

**Files:**
- Modify: `editor-app/src/control/types.ts` (interfaccia `ControlState`, riga ~33)
- Modify: `editor-app/src/control/boxes/AudioBox.tsx`
- Test: `editor-app/src/control/tabs/images-audio.test.tsx` (nel `describe('AudioBox', …)` esistente, riga ~178)

**Interfaces:**
- Consumes: `displayAudio` nello stato server (Task 4), `displayConnected` dello store (esistente, `control-store.ts:27`).
- Produces: riga di testo con `data-testid="display-audio-status"`.

Testi: `non connesso` (display non connesso), `in riproduzione`, `fermo`, `file non trovato o illeggibile`, `audio bloccato dal browser`. Se il display è connesso ma `displayAudio` è `null`, la riga non compare. `error` e `blocked` in colore `text-destructive`.

- [ ] **Step 1: Scrivere i test che falliscono** (dentro `describe('AudioBox', …)`, usando gli helper `audio`, `L`, `setServer`)

```tsx
  it('stato del display: non connesso, poi per ogni stato riportato', () => {
    const tracks = L(audio('m.mp3', null));
    act(() => useControlStore.getState().setDisplayConnected(false));
    setServer({ displayAudio: null }, tracks);
    render(<AudioBox />);
    expect(screen.getByTestId('display-audio-status').textContent).toContain('non connesso');

    act(() => useControlStore.getState().setDisplayConnected(true));
    expect(screen.queryByTestId('display-audio-status')).toBeNull();

    const cases: [string, string, boolean][] = [
      ['playing', 'in riproduzione', false],
      ['idle', 'fermo', false],
      ['error', 'file non trovato o illeggibile', true],
      ['blocked', 'audio bloccato dal browser', true],
    ];
    for (const [status, text, destructive] of cases) {
      setServer({ displayAudio: { status, slot: 'main' } }, tracks);
      const row = screen.getByTestId('display-audio-status');
      expect(row.textContent).toContain(text);
      expect(row.className.includes('text-destructive')).toBe(destructive);
    }
  });

  it('stato del display: non compare se il box e nascosto (nessuna traccia)', () => {
    act(() => useControlStore.getState().setDisplayConnected(true));
    setServer({ displayAudio: { status: 'error', slot: 'main' } }, L(audio(null, null)));
    const { container } = render(<AudioBox />);
    expect(container.innerHTML).toBe('');
  });
```

Aggiungere `displayConnected: false` al reset in `beforeEach` (l'oggetto passato a `useControlStore.setState` in cima al file) per non far trapelare lo stato tra test.

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `cd editor-app && npx vitest run src/control/tabs/images-audio.test.tsx`
Expected: i 2 test nuovi FAIL (`Unable to find an element by: [data-testid="display-audio-status"]`); gli altri PASS.

- [ ] **Step 3: Tipo**

In `editor-app/src/control/types.ts`, dentro `ControlState` dopo `displayViewport`:

```ts
  displayAudio?: { status: 'playing' | 'idle' | 'error' | 'blocked'; slot: 'main' | 'special' } | null;
```
(opzionale: i fixture dei test costruiscono `ControlState` con un cast e un server vecchio non lo invia).

- [ ] **Step 4: Implementare la riga**

In `AudioBox.tsx`, sopra `export function AudioBox()` aggiungere:

```tsx
const DISPLAY_AUDIO_LABELS = {
  playing: 'in riproduzione',
  idle: 'fermo',
  error: 'file non trovato o illeggibile',
  blocked: 'audio bloccato dal browser',
} as const;
```

Dentro il componente, dopo `const playing = …`, leggere:

```tsx
  const displayConnected = useControlStore((s) => s.displayConnected);
  const displayAudio = useControlStore((s) => s.server?.displayAudio ?? null);
```
(devono stare **prima** del `return null` anticipato, per rispettare l'ordine degli hook.)

Costruire la riga dopo gli early return (dopo `if (!hasMain && !hasSpecial) return null;`):

```tsx
  const displayLabel = !displayConnected ? 'non connesso' : displayAudio ? DISPLAY_AUDIO_LABELS[displayAudio.status] : null;
  const displayProblem = displayConnected && (displayAudio?.status === 'error' || displayAudio?.status === 'blocked');
```

E renderla come primo figlio di `<Box …>`:

```tsx
      {displayLabel && (
        <p
          data-testid="display-audio-status"
          className={cn('text-xs', displayProblem ? 'text-destructive' : 'text-muted-foreground')}
        >
          Display: {displayLabel}
        </p>
      )}
```

- [ ] **Step 5: Eseguire e verificare il successo**

Run: `cd editor-app && npx vitest run src/control && npx tsc --noEmit -p .`
Expected: tutti PASS; `tsc` senza errori. Se `tsc` usa un altro tsconfig nel progetto, usare lo script di type-check di `editor-app/package.json`.

- [ ] **Step 6: Build di /control e commit**

```bash
npm run build:control
git status --short public/control | head
git add editor-app/src/control public/control
git commit -m "feat(control): riga di stato reale dell'audio del display in AudioBox

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `git status` mostra modificati gli asset di `public/control/`; il commit li include.

---

### Task 6: Verifica end-to-end e documentazione

**Files:**
- Modify: `CLAUDE.md` (nuova sezione in fondo alle sezioni "fatto")

- [ ] **Step 1: Suite complete**

```bash
node --test public/shared/media.test.js public/shared/audio-fade.test.js && (cd editor-app && npx vitest run)
```
Expected: tutto verde.

- [ ] **Step 2: Percorso end-to-end sul server di prova (porta 3100, dati temporanei del Task 3)**

Con `/display/` e `/control/` aperti sul server di prova (mai su quello vero):
1. `/control` mostra in AudioBox "Display: fermo" (dopo che il display ha riportato `idle`); in `/control` premere play → "Display: in riproduzione"; lettura dei volumi del display come al Task 3.
2. Cambiare traccia principale (caricare `b.wav` sullo slot `main`) e poi cambiare location: i due `<audio>` mostrano il crossfade (volumi complementari per ~2 s).
3. Rimuovere il file di una traccia dal disco mentre è attiva e premere play: "Display: file non trovato o illeggibile" in rosso, e per la speciale il server torna alla principale.
4. Chiudere la tab `/display/`: AudioBox passa a "Display: non connesso".
5. `read_console_messages` su entrambe le pagine: nessun errore.

- [ ] **Step 3: Documentare in CLAUDE.md**

Aggiungere in fondo alle sezioni completate, nel formato delle altre:

```markdown
## Audio: dissolvenze e stato reale del display (fatto, branch `claude/audio-development-proposals-664ebb`)

Spec e piano: `docs/superpowers/specs/2026-10-12-audio-fade-status-design.md`,
`docs/superpowers/plans/2026-10-12-audio-fade-status.md`.

**Decisioni chiave**
- Motore in `public/shared/audio-fade.js` (script classico + `module.exports`,
  testato con `node --test public/shared/audio-fade.test.js`): due `<audio>` su
  `/display` (`scene-audio`, `scene-audio-b`), rampe lineari su rAF. Costanti
  `AUDIO_FADE` in un solo punto: 2000/400/600/300/1500 ms.
- Cambio file della principale = crossfade. Sting = la principale sfuma in
  pausa MANTENENDO la posizione e riprende da lì (prima ripartiva da zero).
  Cambio location durante lo sting scarta la principale ducked.
- Modello server invariato. Nuovo `audio:status` display → server (solo da un
  socket con `hello role display`), tenuto in memoria in `displayAudio` e
  aggiunto a `state:update` con `statePayload()`; azzerato quando l'ultimo
  display si disconnette. Mai in `state`, mai su disco.
- `AudioBox` su `/control` mostra "Display: in riproduzione / fermo / file non
  trovato o illeggibile / audio bloccato dal browser / non connesso".
- Nessun avviso o click su `/display` (Raspberry in kiosk senza input);
  l'autoplay non è stato toccato.

**Non verificato a mano**: l'ascolto (durate e curva dei fade sono da giudicare
dal vivo: ritoccare `AUDIO_FADE`); due `<audio>` contemporanei sul Pi 4 vero.
```

- [ ] **Step 4: Fermare il server di prova, committare**

```bash
git add CLAUDE.md
git commit -m "docs: dissolvenze audio e stato del display in CLAUDE.md

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git status --short
```
Expected: working tree pulito.
