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
  assert.deepEqual({ ...b, id: undefined }, { id: undefined, name: 'Taverna', file: 'm.mp3', icon: 'music', volume: 0.5, handout: false, restartOnStop: false, on: true });
  const o = r.oneshot[0];
  assert.deepEqual({ ...o, id: undefined }, { id: undefined, name: 'Tuono', file: 's.mp3', icon: 'zap', volume: 0.9, handout: false });
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
  assert.deepEqual(r.background, [{ id: 'b1', name: 'x', file: 'x.mp3', icon: 'music', volume: 0.7, handout: false, restartOnStop: false, on: false }]);
  assert.deepEqual(r.oneshot, [{ id: 'o1', name: '', file: 'o.mp3', icon: 'zap', volume: 0.7, handout: false }]);
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
  assert.deepEqual(bg, { id: 'b1', name: 'b', file: 'b.mp3', icon: 'music', volume: 0.7, handout: false, restartOnStop: false, on: false });
  assert.deepEqual(os, { id: 'o1', name: 'o', file: 'o.mp3', icon: 'zap', volume: 0.7, handout: false });
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

test('updateTrack: restartOnStop solo background', () => {
  const { location, bg, os } = setup();
  assert.equal(A.updateTrack(location, 'b1', { restartOnStop: true }), true);
  assert.equal(bg.restartOnStop, true);
  assert.equal(A.updateTrack(location, 'o1', { restartOnStop: true }), false);
  assert.equal('restartOnStop' in os, false);
});

test('updateTrack: handout per background e one-shot, solo booleani', () => {
  const { location, bg, os } = setup();
  assert.equal(A.updateTrack(location, 'b1', { handout: true }), true);
  assert.equal(bg.handout, true);
  assert.equal(A.updateTrack(location, 'o1', { handout: true }), true);
  assert.equal(os.handout, true);
  assert.equal(A.updateTrack(location, 'o1', { handout: 'si' }), false);
  assert.equal(os.handout, true);
});

test('migrateLocationAudio: handout persistito resta, altrimenti false', () => {
  const r = A.migrateLocationAudio({
    background: [{ id: 'b1', file: 'x.mp3', handout: true }],
    oneshot: [{ id: 'o1', file: 'o.mp3', handout: 'si' }]
  }, { legacyMainOn: true });
  assert.equal(r.background[0].handout, true);
  assert.equal(r.oneshot[0].handout, false);
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

// --- Archivio audio ---

const row = (id, file, extra = {}) => ({ id, name: `n-${file}`, file, icon: 'music', volume: 0.5, handout: false, ...extra });
const loc = (id, background = [], oneshot = []) => ({ id, name: id, map: { audio: { background, oneshot } } });
const libState = (locations, extra = {}) => ({ locations, audioOneshots: {}, ...extra });

test('syncAudioLibrary: due righe con lo stesso file in location diverse -> una voce, stesso audioId', () => {
  const s = libState([loc('A', [row('b1', 'x.mp3', { restartOnStop: false, on: true })]), loc('B', [], [row('o1', 'x.mp3')])]);
  A.syncAudioLibrary(s);
  assert.equal(s.audioLibrary.length, 1);
  const item = s.audioLibrary[0];
  assert.deepEqual({ name: item.name, icon: item.icon, file: item.file }, { name: 'n-x.mp3', icon: 'music', file: 'x.mp3' });
  assert.equal(s.locations[0].map.audio.background[0].audioId, item.id);
  assert.equal(s.locations[1].map.audio.oneshot[0].audioId, item.id);
  assert.equal(s.locations[0].map.audio.background[0].on, true);
  assert.equal(s.locations[0].map.audio.background[0].volume, 0.5);
});

test('syncAudioLibrary: file diversi con audioKey uguale -> una voce, righe riallineate al file della prima', () => {
  const s = libState([loc('A', [row('b1', 'dup1.mp3')]), loc('B', [row('b2', 'dup2.mp3')])]);
  A.syncAudioLibrary(s, (f) => (f.startsWith('dup') ? 'H' : f));
  assert.equal(s.audioLibrary.length, 1);
  assert.equal(s.locations[0].map.audio.background[0].file, 'dup1.mp3');
  assert.equal(s.locations[1].map.audio.background[0].file, 'dup1.mp3');
  assert.equal(s.locations[1].map.audio.background[0].name, 'n-dup1.mp3');
});

test('syncAudioLibrary: audioKey che restituisce null usa il nome file', () => {
  const s = libState([loc('A', [row('b1', 'a.mp3'), row('b2', 'b.mp3'), row('b3', 'a.mp3')])]);
  A.syncAudioLibrary(s, () => null);
  assert.equal(s.audioLibrary.length, 2);
});

test('syncAudioLibrary: idempotente', () => {
  const s = libState([loc('A', [row('b1', 'a.mp3')], [row('o1', 'b.mp3')])]);
  A.syncAudioLibrary(s);
  const first = JSON.parse(JSON.stringify(s));
  A.syncAudioLibrary(s);
  assert.deepEqual(s, first);
});

test('syncAudioLibrary: audioId sconosciuto -> voce ricreata dal file, la riga resta', () => {
  const s = libState([loc('A', [row('b1', 'a.mp3', { audioId: 'ghost' })])], { audioLibrary: [] });
  A.syncAudioLibrary(s);
  assert.equal(s.locations[0].map.audio.background.length, 1);
  assert.equal(s.audioLibrary.length, 1);
  assert.equal(s.locations[0].map.audio.background[0].audioId, s.audioLibrary[0].id);
  assert.equal(s.audioLibrary[0].file, 'a.mp3');
});

test('syncAudioLibrary: nome/icona della riga diversi dall\'archivio -> riallineati all\'archivio', () => {
  const s = libState([loc('A', [row('b1', 'a.mp3', { audioId: 'L1', name: 'vecchio', icon: 'zap' })])],
    { audioLibrary: [{ id: 'L1', name: 'Pioggia', icon: 'cloud-rain', file: 'a.mp3' }] });
  A.syncAudioLibrary(s);
  const r = s.locations[0].map.audio.background[0];
  assert.deepEqual({ name: r.name, icon: r.icon, file: r.file }, { name: 'Pioggia', icon: 'cloud-rain', file: 'a.mp3' });
  assert.equal(s.audioLibrary.length, 1);
});

const synced = () => {
  const s = libState([
    loc('A', [row('b1', 'a.mp3', { restartOnStop: true, on: true })], [row('o1', 'b.mp3', { handout: true, volume: 0.3 })]),
    loc('B', [row('b2', 'a.mp3', { restartOnStop: false, on: false })])
  ]);
  A.syncAudioLibrary(s);
  const idOf = (file) => s.audioLibrary.find((i) => i.file === file).id;
  return { s, a: idOf('a.mp3'), b: idOf('b.mp3') };
};

test('updateLibraryItem: rinomina e icona propagate a tutte le righe; slug non valido ignorato', () => {
  const { s, a } = synced();
  assert.equal(A.updateLibraryItem(s, a, { name: 'Temporale', icon: 'flame' }), true);
  assert.equal(s.locations[0].map.audio.background[0].name, 'Temporale');
  assert.equal(s.locations[1].map.audio.background[0].name, 'Temporale');
  assert.equal(s.locations[1].map.audio.background[0].icon, 'flame');
  assert.equal(A.updateLibraryItem(s, a, { icon: 'NO VALIDO' }), false);
  assert.equal(s.audioLibrary.find((i) => i.id === a).icon, 'flame');
  assert.equal(A.updateLibraryItem(s, 'nessuno', { name: 'x' }), false);
});

test('removeLibraryItem: toglie righe da tutte le location, pulisce audioOneshots, restituisce il file', () => {
  const { s, a, b } = synced();
  s.audioOneshots = { o1: 4 };
  assert.equal(A.removeLibraryItem(s, b), 'b.mp3');
  assert.deepEqual(s.audioOneshots, {});
  assert.equal(s.locations[0].map.audio.oneshot.length, 0);
  assert.equal(A.removeLibraryItem(s, a), 'a.mp3');
  assert.equal(s.locations[0].map.audio.background.length, 0);
  assert.equal(s.locations[1].map.audio.background.length, 0);
  assert.equal(s.audioLibrary.length, 0);
  assert.equal(A.removeLibraryItem(s, a), null);
});

test('addTrackFromLibrary: default volume 0.7, on false, handout false; audioId inesistente -> null', () => {
  const { s, a } = synced();
  const B = s.locations[1];
  const t = A.addTrackFromLibrary(s, B, 'oneshot', a);
  assert.deepEqual({ ...t, id: undefined }, { id: undefined, audioId: a, name: 'n-a.mp3', file: 'a.mp3', icon: 'music', volume: 0.7, handout: false });
  const bg = A.addTrackFromLibrary(s, B, 'background', a);
  assert.equal(bg.on, false);
  assert.equal(bg.restartOnStop, false);
  assert.equal(A.addTrackFromLibrary(s, B, 'background', 'ghost'), null);
  assert.equal(A.addTrackFromLibrary(s, B, 'boh', a), null);
});

test('copyTracks: copia background e one-shot con impostazioni, id nuovi, salta audioId già presenti nella stessa riga', () => {
  const { s, a } = synced();
  const [from, to] = s.locations;
  assert.equal(A.copyTracks(s, from, to), 1);
  assert.equal(to.map.audio.background.length, 1);
  const o = to.map.audio.oneshot[0];
  assert.notEqual(o.id, 'o1');
  assert.deepEqual({ v: o.volume, h: o.handout, f: o.file }, { v: 0.3, h: true, f: 'b.mp3' });
  to.map.audio.background = [];
  assert.equal(A.copyTracks(s, from, to), 1);
  const b = to.map.audio.background[0];
  assert.deepEqual({ a: b.audioId, r: b.restartOnStop, on: b.on }, { a, r: true, on: true });
  assert.equal(A.copyTracks(s, from, to), 0);
});

test('updateLibraryItem: tronca il nome a 120', () => {
  const { s, a } = synced();
  A.updateLibraryItem(s, a, { name: 'n'.repeat(200) });
  assert.equal(s.locations[0].map.audio.background[0].name.length, 120);
});

test('updateTrack: name e icon sulla riga non hanno più effetto', () => {
  const { s } = synced();
  const A0 = s.locations[0];
  assert.equal(A.updateTrack(A0, 'b1', { name: 'x', icon: 'flame' }), false);
  assert.equal(A0.map.audio.background[0].name, 'n-a.mp3');
});

test('libraryFiles: elenca i file dell\'archivio', () => {
  const { s } = synced();
  assert.deepEqual(A.libraryFiles(s).sort(), ['a.mp3', 'b.mp3']);
});

test('syncAudioLibrary: con tutte le righe già abbinate non calcola nessuna chiave (niente hash a ogni avvio)', () => {
  const s = libState([loc('A', [row('b1', 'a.mp3', { audioId: 'L1' })])],
    { audioLibrary: [{ id: 'L1', name: 'P', icon: 'music', file: 'a.mp3' }] });
  let calls = 0;
  A.syncAudioLibrary(s, () => { calls += 1; return 'k'; });
  assert.equal(calls, 0);
});
