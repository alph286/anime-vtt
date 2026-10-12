const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUDIO_FADE,
  audioLevelAt,
  normalizeDisplayAudioStatus,
  createAudioEngine
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

test('idempotente: stesso stato ripetuto non rilancia play né rampe', () => {
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

test('error sulla speciale: stato error e onSpecialEnded', () => {
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

test('dopo un play() rifiutato, il successivo stato playing ritenta e sblocca la traccia', async () => {
  const { els, engine, statuses } = harness();
  els[0].playResult = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
  engine.apply(play('A'));
  await flush();
  assert.deepEqual(statuses.at(-1), { status: 'blocked', slot: 'main' });
  els[0].playResult = () => Promise.resolve();
  engine.apply(play('A'));
  await flush();
  assert.equal(els[0].playCalls, 2);
  assert.deepEqual(statuses.at(-1), { status: 'playing', slot: 'main' });
});
