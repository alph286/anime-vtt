const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUDIO_FADE,
  AUDIO_DUCK_LEVEL,
  audioLevelAt,
  normalizeDisplayAudioStatus,
  createAudioMixer
} = require('./audio-fade.js');

test('AUDIO_FADE e AUDIO_DUCK_LEVEL hanno i valori concordati', () => {
  assert.deepEqual(AUDIO_FADE, {
    location: 2000, bgIn: 1000, bgOut: 1000, transport: 400, duckOut: 600, stingIn: 300, resumeIn: 1500
  });
  assert.equal(AUDIO_DUCK_LEVEL, 0.4);
});

test('il motore vecchio non è più esportato', () => {
  const mod = require('./audio-fade.js');
  assert.equal(mod.createAudioEngine, undefined);
  assert.equal(mod.DISPLAY_AUDIO_STATUSES, undefined);
  assert.equal(mod.DISPLAY_AUDIO_SLOTS, undefined);
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

test('normalizeDisplayAudioStatus: forma valida', () => {
  assert.deepEqual(
    normalizeDisplayAudioStatus({ blocked: true, errors: ['a'], playing: ['b', 'c'], extra: 1 }),
    { blocked: true, errors: ['a'], playing: ['b', 'c'] }
  );
  assert.deepEqual(
    normalizeDisplayAudioStatus({ blocked: false, errors: [], playing: [] }),
    { blocked: false, errors: [], playing: [] }
  );
});

test('normalizeDisplayAudioStatus: rifiuta forme sbagliate', () => {
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: [1], playing: [] }), null);
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: [], playing: [null] }), null);
  const many = Array.from({ length: 101 }, (_, i) => `t${i}`);
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: [], playing: many }), null);
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: many, playing: [] }), null);
  assert.equal(normalizeDisplayAudioStatus({ blocked: 'yes', errors: [], playing: [] }), null);
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: 'a', playing: [] }), null);
  assert.equal(normalizeDisplayAudioStatus({ blocked: false, errors: [] }), null);
  assert.equal(normalizeDisplayAudioStatus(null), null);
  assert.equal(normalizeDisplayAudioStatus('playing'), null);
  assert.equal(normalizeDisplayAudioStatus(undefined), null);
  assert.equal(normalizeDisplayAudioStatus([]), null);
});

// --- mixer ---------------------------------------------------------------

const settle = () => new Promise((resolve) => setImmediate(resolve));
const near = (actual, expected, eps = 0.011) =>
  assert.ok(Math.abs(actual - expected) < eps, `atteso ~${expected}, ottenuto ${actual}`);

class FakeAudio {
  constructor() {
    this.listeners = {};
    this.volume = 1;
    this.paused = true;
    this.currentTime = 0;
    this.duration = 10;
    this.loop = false;
    this.src = '';
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.removed = false;
    this.nextPlay = null; // funzione che restituisce la Promise del prossimo play()
  }
  play() {
    this.paused = false;
    this.playCalls += 1;
    return this.nextPlay ? this.nextPlay() : Promise.resolve();
  }
  pause() { this.paused = true; this.pauseCalls += 1; }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  remove() { this.removed = true; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type) { (this.listeners[type] || []).forEach((fn) => fn()); }
}

function harness() {
  let t = 0;
  let frames = [];
  const els = [];
  const statuses = [];
  const ended = [];
  const mixer = createAudioMixer({
    createElement: () => { const el = new FakeAudio(); els.push(el); return el; },
    now: () => t,
    requestFrame: (fn) => { frames.push(fn); return frames.length; },
    onStatus: (s) => statuses.push(s),
    onOneshotEnded: (id, seq) => ended.push([id, seq])
  });
  const flush = (ms) => {
    const end = t + ms;
    while (t < end) {
      t = Math.min(t + 50, end);
      const batch = frames;
      frames = [];
      batch.forEach((fn) => fn());
    }
  };
  const elBySrc = (src) => els.find((e) => e.src === src);
  return { els, mixer, statuses, ended, flush, elBySrc, pendingFrames: () => frames.length };
}

const bg = (id, extra = {}) => ({ id, src: `/a/${id}.mp3`, volume: 0.7, on: true, restartOnStop: false, ...extra });
const os = (id, extra = {}) => ({ id, src: `/a/${id}.mp3`, volume: 0.7, ...extra });
const scene = (extra = {}) => ({ locationId: 'L1', background: [], oneshot: [], oneshots: {}, ...extra });
const last = (arr) => arr[arr.length - 1];

test('due background accesi: due elementi in loop, fade-in fino a 0.7 in bgIn', async () => {
  const { els, mixer, flush, statuses } = harness();
  mixer.apply(scene({ background: [bg('a'), bg('b'), bg('c', { on: false })] }));
  assert.equal(els.length, 2);
  assert.ok(els.every((e) => e.loop === true && e.playCalls === 1));
  assert.equal(els[0].volume, 0);
  flush(AUDIO_FADE.bgIn / 2);
  near(els[0].volume, 0.35);
  flush(AUDIO_FADE.bgIn / 2);
  near(els[0].volume, 0.7);
  near(els[1].volume, 0.7);
  await settle();
  assert.deepEqual(last(statuses), { blocked: false, errors: [], playing: ['a', 'b'] });
});

test('background spento: nessun play', () => {
  const { els, mixer } = harness();
  mixer.apply(scene({ background: [bg('a', { on: false })] }));
  assert.ok(els.every((e) => e.playCalls === 0));
});

test('apply ripetuto identico: nessun play né rampe in più', async () => {
  const { els, mixer, flush, pendingFrames, statuses } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  await settle();
  const count = statuses.length;
  for (let i = 0; i < 20; i += 1) mixer.apply(scene({ background: [bg('a')] }));
  assert.equal(els[0].playCalls, 1);
  assert.equal(pendingFrames(), 0);
  assert.equal(statuses.length, count);
});

test('restartOnStop: spento sfuma in bgOut, pausa e torna a 0; riacceso riparte da 0', async () => {
  const { els, mixer, flush, statuses } = harness();
  mixer.apply(scene({ background: [bg('a', { restartOnStop: true })] }));
  flush(AUDIO_FADE.bgIn);
  await settle();
  els[0].currentTime = 4;
  mixer.apply(scene({ background: [bg('a', { restartOnStop: true, on: false })] }));
  assert.deepEqual(last(statuses).playing, []);
  flush(AUDIO_FADE.bgOut / 2);
  near(els[0].volume, 0.35);
  assert.equal(els[0].paused, false);
  flush(AUDIO_FADE.bgOut / 2);
  assert.equal(els[0].paused, true);
  assert.equal(els[0].currentTime, 0);
  assert.equal(els[0].src, '/a/a.mp3', 'l\'elemento resta finché la traccia esiste');
  els[0].currentTime = 0;
  mixer.apply(scene({ background: [bg('a', { restartOnStop: true })] }));
  assert.equal(els.length, 1);
  assert.equal(els[0].currentTime, 0);
  assert.equal(els[0].playCalls, 2);
  flush(AUDIO_FADE.bgIn);
  near(els[0].volume, 0.7);
});

test('sempre a loop: riacceso riprende dalla posizione virtuale', async () => {
  const { els, mixer, flush } = harness();
  mixer.apply(scene({ background: [bg('a')] })); // t = 0, durata 10s
  await settle();
  flush(3000);
  els[0].currentTime = 3;
  mixer.apply(scene({ background: [bg('a', { on: false })] }));
  flush(AUDIO_FADE.bgOut);
  assert.equal(els[0].paused, true);
  assert.equal(els[0].currentTime, 3, 'senza restartOnStop la posizione non si azzera');
  flush(25000 - 3000 - AUDIO_FADE.bgOut);
  mixer.apply(scene({ background: [bg('a')] })); // t = 25s
  near(els[0].currentTime, 5, 0.06);
  assert.equal(els[0].playCalls, 2);
});

test('one-shot: parte da 0, abbassa i background, ended → onOneshotEnded, poi risalgono', async () => {
  const { mixer, flush, ended, elBySrc, statuses } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  const a = elBySrc('/a/a.mp3');
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 1 } }));
  const x = elBySrc('/a/x.mp3');
  assert.equal(x.loop, false);
  assert.equal(x.currentTime, 0);
  assert.equal(x.playCalls, 1);
  flush(AUDIO_FADE.stingIn);
  near(x.volume, 0.7);
  flush(AUDIO_FADE.duckOut - AUDIO_FADE.stingIn);
  near(a.volume, 0.7 * AUDIO_DUCK_LEVEL);
  await settle();
  assert.deepEqual(last(statuses).playing, ['a', 'x']);
  x.fire('ended');
  x.fire('ended');
  assert.deepEqual(ended, [['x', 1]]);
  assert.deepEqual(last(statuses).playing, ['a']);
  // Stesso seq ancora in scena (il server non ha ancora tolto): resta muto.
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 1 } }));
  assert.equal(x.playCalls, 1);
  flush(AUDIO_FADE.resumeIn);
  near(a.volume, 0.7);
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: {} }));
  flush(AUDIO_FADE.resumeIn);
  near(a.volume, 0.7);
  assert.equal(x.playCalls, 1);
});

test('one-shot tolto da oneshots mentre suona: sfuma in transport, si ferma e i background risalgono in resumeIn', () => {
  const { mixer, flush, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  const a = elBySrc('/a/a.mp3');
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 1 } }));
  const x = elBySrc('/a/x.mp3');
  flush(AUDIO_FADE.duckOut);
  near(a.volume, 0.28);
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: {} }));
  flush(AUDIO_FADE.transport);
  assert.equal(x.paused, true);
  assert.equal(x.currentTime, 0);
  flush(AUDIO_FADE.resumeIn - AUDIO_FADE.transport);
  near(a.volume, 0.7);
});

test('stesso one-shot con seq nuovo mentre suona: riparte da 0', () => {
  const { mixer, flush, elBySrc, els } = harness();
  mixer.apply(scene({ oneshot: [os('x')], oneshots: { x: 1 } }));
  flush(AUDIO_FADE.stingIn);
  const x = elBySrc('/a/x.mp3');
  x.currentTime = 2.5;
  mixer.apply(scene({ oneshot: [os('x')], oneshots: { x: 2 } }));
  assert.equal(els.length, 1);
  assert.equal(x.currentTime, 0);
  assert.equal(x.playCalls, 2);
});

test('one-shot finito e poi ripremuto (seq nuovo dopo la rimozione): riparte', () => {
  const { mixer, elBySrc, ended } = harness();
  mixer.apply(scene({ oneshot: [os('x')], oneshots: { x: 1 } }));
  const x = elBySrc('/a/x.mp3');
  x.fire('ended');
  mixer.apply(scene({ oneshot: [os('x')], oneshots: {} }));
  mixer.apply(scene({ oneshot: [os('x')], oneshots: { x: 2 } }));
  assert.equal(x.playCalls, 2);
  x.fire('ended');
  assert.deepEqual(ended, [['x', 1], ['x', 2]]);
});

test('due one-shot insieme: entrambi suonano, il ducking resta finché ne suona uno', () => {
  const { mixer, flush, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  const a = elBySrc('/a/a.mp3');
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x'), os('y')], oneshots: { x: 1, y: 1 } }));
  const x = elBySrc('/a/x.mp3');
  const y = elBySrc('/a/y.mp3');
  assert.equal(x.playCalls, 1);
  assert.equal(y.playCalls, 1);
  flush(AUDIO_FADE.duckOut);
  near(a.volume, 0.28);
  x.fire('ended');
  flush(AUDIO_FADE.resumeIn);
  near(a.volume, 0.28);
  y.fire('ended');
  flush(AUDIO_FADE.resumeIn / 2);
  near(a.volume, 0.28 + (0.7 - 0.28) / 2);
  flush(AUDIO_FADE.resumeIn / 2);
  near(a.volume, 0.7);
});

test('background acceso durante un one-shot entra già abbassato', () => {
  const { mixer, flush, elBySrc } = harness();
  mixer.apply(scene({ oneshot: [os('x')], oneshots: { x: 1 } }));
  flush(AUDIO_FADE.duckOut);
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 1 } }));
  flush(AUDIO_FADE.bgIn);
  near(elBySrc('/a/a.mp3').volume, 0.28);
});

test('cambio location: le vecchie sfumano in location e vengono rilasciate, le nuove salgono in location', async () => {
  const { els, mixer, flush, statuses } = harness();
  mixer.apply(scene({ background: [bg('a'), bg('b', { on: false })], oneshot: [os('x')], oneshots: { x: 1 } }));
  flush(AUDIO_FADE.bgIn);
  const [a, x] = els;
  mixer.apply({ locationId: 'L2', background: [bg('c'), bg('d', { on: false })], oneshot: [], oneshots: {} });
  const c = els[2];
  assert.equal(c.src, '/a/c.mp3');
  assert.equal(els.length, 3);
  flush(AUDIO_FADE.location / 2);
  near(c.volume, 0.35);
  assert.ok(a.volume > 0.1 && a.volume < 0.6);
  assert.notEqual(a.src, '');
  flush(AUDIO_FADE.location / 2);
  near(c.volume, 0.7);
  assert.equal(a.volume, 0);
  assert.equal(a.src, '');
  assert.equal(a.paused, true);
  assert.equal(a.removed, true);
  assert.equal(x.src, '');
  assert.equal(x.removed, true);
  await settle();
  assert.deepEqual(last(statuses).playing, ['c']);
});

test('tornando alla location di prima, una traccia "sempre a loop" riparte (elemento nuovo)', () => {
  const { els, mixer, flush } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  mixer.apply(scene({ locationId: 'L2' }));
  flush(AUDIO_FADE.location);
  mixer.apply(scene({ background: [bg('a')] }));
  assert.equal(els.length, 2);
  assert.equal(els[1].src, '/a/a.mp3');
  assert.equal(els[1].playCalls, 1);
});

test('traccia eliminata o file cambiato: il vecchio elemento sfuma e viene rilasciato', () => {
  const { els, mixer, flush } = harness();
  mixer.apply(scene({ background: [bg('a'), bg('b')] }));
  flush(AUDIO_FADE.bgIn);
  mixer.apply(scene({ background: [bg('b', { src: '/a/b2.mp3' })] }));
  flush(AUDIO_FADE.bgOut);
  assert.equal(els[0].src, '');
  assert.equal(els[1].src, '');
  assert.equal(els[2].src, '/a/b2.mp3');
  assert.equal(els[2].playCalls, 1);
});

test('volume cambiato a metà: applicato subito, anche a un one-shot', () => {
  const { mixer, flush, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 1 } }));
  flush(AUDIO_FADE.bgIn);
  mixer.apply(scene({ background: [bg('a', { volume: 0.3 })], oneshot: [os('x', { volume: 0.2 })], oneshots: { x: 1 } }));
  near(elBySrc('/a/a.mp3').volume, 0.3 * AUDIO_DUCK_LEVEL);
  near(elBySrc('/a/x.mp3').volume, 0.2);
});

test('play() rifiutato con NotAllowedError: blocked, nessun tentativo a vuoto, il prossimo apply ritenta', async () => {
  const { mixer, statuses, flush, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  const a = elBySrc('/a/a.mp3');
  await settle();
  mixer.apply(scene({ background: [bg('a', { on: false })] }));
  flush(AUDIO_FADE.bgOut);
  a.nextPlay = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
  mixer.apply(scene({ background: [bg('a')] }));
  await settle();
  assert.deepEqual(last(statuses), { blocked: true, errors: [], playing: [] });
  flush(5000);
  await settle();
  assert.equal(a.playCalls, 2);
  a.nextPlay = null;
  mixer.apply(scene({ background: [bg('a')] }));
  assert.equal(a.playCalls, 3);
  await settle();
  assert.deepEqual(last(statuses), { blocked: false, errors: [], playing: ['a'] });
});

test('play() rifiutato con altro errore: id in errors; ritentato al prossimo apply', async () => {
  const { mixer, statuses, flush, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  const a = elBySrc('/a/a.mp3');
  await settle();
  mixer.apply(scene({ background: [bg('a', { on: false })] }));
  flush(AUDIO_FADE.bgOut);
  a.nextPlay = () => Promise.reject(Object.assign(new Error('bad'), { name: 'NotSupportedError' }));
  mixer.apply(scene({ background: [bg('a')] }));
  await settle();
  assert.deepEqual(last(statuses), { blocked: false, errors: ['a'], playing: [] });
  a.nextPlay = null;
  mixer.apply(scene({ background: [bg('a')] }));
  await settle();
  assert.deepEqual(last(statuses), { blocked: false, errors: [], playing: ['a'] });
});

test('errore dell\'elemento: background in errors; one-shot in errors e onOneshotEnded', async () => {
  const { mixer, statuses, ended, elBySrc } = harness();
  mixer.apply(scene({ background: [bg('a')], oneshot: [os('x')], oneshots: { x: 3 } }));
  await settle();
  elBySrc('/a/a.mp3').fire('error');
  elBySrc('/a/x.mp3').fire('error');
  elBySrc('/a/x.mp3').fire('ended');
  assert.deepEqual(ended, [['x', 3]]);
  assert.deepEqual(last(statuses), { blocked: false, errors: ['a', 'x'], playing: [] });
});

test('AbortError (play interrotto da pause) viene ignorato', async () => {
  const { mixer, statuses, elBySrc, flush } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  const a = elBySrc('/a/a.mp3');
  await settle();
  mixer.apply(scene({ background: [bg('a', { on: false })] }));
  flush(AUDIO_FADE.bgOut);
  a.nextPlay = () => Promise.reject(Object.assign(new Error('abort'), { name: 'AbortError' }));
  mixer.apply(scene({ background: [bg('a')] }));
  await settle();
  assert.deepEqual(last(statuses), { blocked: false, errors: [], playing: [] });
});

test('onStatus solo quando cambia; resendStatus lo rimanda', async () => {
  const { mixer, statuses } = harness();
  mixer.apply(scene());
  assert.deepEqual(statuses, [{ blocked: false, errors: [], playing: [] }]);
  mixer.apply(scene());
  assert.equal(statuses.length, 1);
  mixer.resendStatus();
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses[1], { blocked: false, errors: [], playing: [] });
});

test('locationId null: tutto sfuma e viene rilasciato', () => {
  const { els, mixer, flush } = harness();
  mixer.apply(scene({ background: [bg('a')] }));
  flush(AUDIO_FADE.bgIn);
  mixer.apply({ locationId: null, background: [], oneshot: [], oneshots: {} });
  flush(AUDIO_FADE.location);
  assert.equal(els[0].src, '');
});
