const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./audio');

const legacy = () => ({
  main: { name: 'Taverna', file: 'm.mp3', volume: 0.5 },
  special: { name: 'Tuono', file: 's.mp3', volume: 0.9 }
});

test('migrateLocationAudio: main+special pieni -> un background e un one-shot', () => {
  const r = A.migrateLocationAudio(legacy(), { legacyMainOn: true });
  assert.equal(r.background.length, 1);
  assert.equal(r.oneshot.length, 1);
  const b = r.background[0];
  assert.deepEqual({ ...b, id: undefined }, { id: undefined, name: 'Taverna', file: 'm.mp3', icon: 'music', volume: 0.5, restartOnStop: false, on: true });
  const o = r.oneshot[0];
  assert.deepEqual({ ...o, id: undefined }, { id: undefined, name: 'Tuono', file: 's.mp3', icon: 'zap', volume: 0.9 });
  assert.ok(typeof b.id === 'string' && b.id.length > 0);
  assert.ok(typeof o.id === 'string' && o.id.length > 0);
});

test('migrateLocationAudio: legacyMainOn false -> background spento', () => {
  const r = A.migrateLocationAudio(legacy(), { legacyMainOn: false });
  assert.equal(r.background[0].on, false);
});

test('migrateLocationAudio: tracce senza file scartate', () => {
  const r = A.migrateLocationAudio({ main: { name: '', file: null, volume: 0.7 }, special: { name: 'x', file: null } }, { legacyMainOn: true });
  assert.deepEqual(r, { background: [], oneshot: [] });
});

test('migrateLocationAudio: singola traccia -> un background, volume 0.7', () => {
  const r = A.migrateLocationAudio({ name: 'a', file: 'a.mp3' }, { legacyMainOn: true });
  assert.equal(r.background.length, 1);
  assert.equal(r.background[0].volume, 0.7);
  assert.equal(r.background[0].file, 'a.mp3');
  assert.equal(r.oneshot.length, 0);
});

test('migrateLocationAudio: undefined -> audio vuoto', () => {
  assert.deepEqual(A.migrateLocationAudio(undefined, { legacyMainOn: true }), A.emptyAudio());
});

test('migrateLocationAudio: formato nuovo con campi mancanti -> riempiti', () => {
  const r = A.migrateLocationAudio({
    background: [{ id: 'b1', name: 'x', file: 'x.mp3' }, { id: 'b2', name: 'senza file' }],
    oneshot: [{ id: 'o1', file: 'o.mp3', on: true, restartOnStop: true }]
  }, { legacyMainOn: true });
  assert.deepEqual(r.background, [{ id: 'b1', name: 'x', file: 'x.mp3', icon: 'music', volume: 0.7, restartOnStop: false, on: false }]);
  assert.deepEqual(r.oneshot, [{ id: 'o1', name: '', file: 'o.mp3', icon: 'zap', volume: 0.7 }]);
});

function setup() {
  const location = { map: { audio: { background: [], oneshot: [] } } };
  const state = { audioOneshots: {}, audioOneshotSeq: 0 };
  const bg = A.addTrack(location, 'background', { name: 'b', file: 'b.mp3', id: 'b1' });
  const os = A.addTrack(location, 'oneshot', { name: 'o', file: 'o.mp3', id: 'o1' });
  return { location, state, bg, os };
}

test('addTrack: default di icona, volume, restartOnStop, on', () => {
  const { bg, os, location } = setup();
  assert.deepEqual(bg, { id: 'b1', name: 'b', file: 'b.mp3', icon: 'music', volume: 0.7, restartOnStop: false, on: false });
  assert.deepEqual(os, { id: 'o1', name: 'o', file: 'o.mp3', icon: 'zap', volume: 0.7 });
  assert.equal(location.map.audio.background[0], bg);
});

test('findTrack: trova per id o null', () => {
  const { location } = setup();
  assert.equal(A.findTrack(location, 'o1').kind, 'oneshot');
  assert.equal(A.findTrack(location, 'b1').kind, 'background');
  assert.equal(A.findTrack(location, 'zzz'), null);
});

test('toggleTrack: background inverte on', () => {
  const { state, location, bg } = setup();
  assert.equal(A.toggleTrack(state, location, 'b1', { displayConnected: false }), true);
  assert.equal(bg.on, true);
  A.toggleTrack(state, location, 'b1', { displayConnected: false });
  assert.equal(bg.on, false);
});

test('toggleTrack: one-shot con display parte e si ferma', () => {
  const { state, location } = setup();
  assert.equal(A.toggleTrack(state, location, 'o1', { displayConnected: true }), true);
  assert.deepEqual(state.audioOneshots, { o1: 1 });
  assert.equal(state.audioOneshotSeq, 1);
  assert.equal(A.toggleTrack(state, location, 'o1', { displayConnected: true }), true);
  assert.deepEqual(state.audioOneshots, {});
});

test('toggleTrack: one-shot senza display o id sconosciuto -> false, nessun cambio', () => {
  const { state, location } = setup();
  assert.equal(A.toggleTrack(state, location, 'o1', { displayConnected: false }), false);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(state.audioOneshotSeq, 0);
  assert.equal(A.toggleTrack(state, location, 'nope', { displayConnected: true }), false);
});

test('oneshotEnded: seq vecchio ignorato, seq giusto toglie la voce', () => {
  const { state, location } = setup();
  A.toggleTrack(state, location, 'o1', { displayConnected: true }); // seq 1
  state.audioOneshots.o1 = 2; // ripartenza
  assert.equal(A.oneshotEnded(state, 'o1', 1), false);
  assert.deepEqual(state.audioOneshots, { o1: 2 });
  assert.equal(A.oneshotEnded(state, 'o1', 2), true);
  assert.deepEqual(state.audioOneshots, {});
});

test('clearOneshots: true solo se non era vuoto', () => {
  const state = { audioOneshots: { a: 1 }, audioOneshotSeq: 1 };
  assert.equal(A.clearOneshots(state), true);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(A.clearOneshots(state), false);
  assert.equal(A.clearOneshots({}), false);
});

test('setTrackVolume: clamp 0..1 e rifiuta non numeri', () => {
  const { location, bg } = setup();
  assert.equal(A.setTrackVolume(location, 'b1', 5), true);
  assert.equal(bg.volume, 1);
  A.setTrackVolume(location, 'b1', -2);
  assert.equal(bg.volume, 0);
  assert.equal(A.setTrackVolume(location, 'b1', 'x'), false);
  assert.equal(A.setTrackVolume(location, 'nope', 0.5), false);
});

test('updateTrack: valida icon, tronca name, restartOnStop solo background', () => {
  const { location, bg, os } = setup();
  assert.equal(A.updateTrack(location, 'b1', { icon: 'Bad Icon!' }), false);
  assert.equal(bg.icon, 'music');
  assert.equal(A.updateTrack(location, 'b1', { icon: 'flame', name: 'n'.repeat(200), restartOnStop: true }), true);
  assert.equal(bg.icon, 'flame');
  assert.equal(bg.name.length, 120);
  assert.equal(bg.restartOnStop, true);
  assert.equal(A.updateTrack(location, 'o1', { restartOnStop: true }), false);
  assert.equal('restartOnStop' in os, false);
});

test('removeTrack: ritorna il file e toglie la voce da audioOneshots', () => {
  const { state, location } = setup();
  A.toggleTrack(state, location, 'o1', { displayConnected: true });
  assert.equal(A.removeTrack(state, location, 'o1'), 'o.mp3');
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(location.map.audio.oneshot.length, 0);
  assert.equal(A.removeTrack(state, location, 'o1'), null);
});

test('audioFilesOf: file di entrambe le righe', () => {
  const { location } = setup();
  assert.deepEqual(A.audioFilesOf(location).sort(), ['b.mp3', 'o.mp3']);
});
