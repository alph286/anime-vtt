const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('./state');

test('migrate: toglie settings (picsenderUrl non esiste più) senza toccare il resto', () => {
  const state = {
    campaign: { name: 'X' },
    settings: { picsenderUrl: 'http://pi:5000' },
    locations: []
  };
  migrate(state);
  assert.equal('settings' in state, false);
  assert.equal(state.campaign.name, 'X');
});

test('migrate: uno stato senza settings resta senza settings', () => {
  const state = { campaign: { name: 'X' }, locations: [] };
  migrate(state);
  assert.equal('settings' in state, false);
});

const { applyStartupDefault } = require('./state');

function legacyLoc(id) {
  return { id, map: { audio: { main: { name: 'm', file: `${id}.mp3`, volume: 0.6 }, special: { name: '', file: null, volume: 0.7 } } } };
}

test('migrate audio: main in pausa sulla location attiva -> on false, le altre on true', () => {
  const state = {
    activeLocationId: 'A', activeAudioTrack: 'main', audioState: 'paused', audioTriggerSeq: 3,
    locations: [legacyLoc('A'), legacyLoc('B')]
  };
  migrate(state);
  const [a, b] = state.locations;
  assert.equal(a.map.audio.background.length, 1);
  assert.equal(a.map.audio.background[0].on, false);
  assert.equal(b.map.audio.background[0].on, true);
  assert.equal(b.map.audio.background[0].volume, 0.6);
  assert.equal('activeAudioTrack' in state, false);
  assert.equal('audioState' in state, false);
  assert.equal('audioTriggerSeq' in state, false);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(state.audioOneshotSeq, 0);
});

test('migrate audio: main in riproduzione sulla location attiva -> on true', () => {
  const state = { activeLocationId: 'A', activeAudioTrack: 'main', audioState: 'playing', locations: [legacyLoc('A')] };
  migrate(state);
  assert.equal(state.locations[0].map.audio.background[0].on, true);
});

test('migrate audio: a metà sessione (import/ripristino) non tocca audioOneshots né audioOneshotSeq', () => {
  const state = { audioOneshots: { x: 5 }, audioOneshotSeq: 5, locations: [] };
  migrate(state);
  assert.deepEqual(state.audioOneshots, { x: 5 });
  assert.equal(state.audioOneshotSeq, 5);
});

test('applyStartupDefault: svuota audioOneshots ma il seq non torna indietro', () => {
  const state = { locations: [{ id: 'A', isDefault: true }], audioOneshots: { x: 5 }, audioOneshotSeq: 5 };
  applyStartupDefault(state);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(state.audioOneshotSeq, 5);
});

test('caricamento: uno stato salvato con one-shot in corso riparte da {} (migrate + applyStartupDefault)', () => {
  const state = { locations: [{ id: 'A', isDefault: true, map: {} }], audioOneshots: { x: 1 }, audioOneshotSeq: 9 };
  applyStartupDefault(migrate(state));
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(state.audioOneshotSeq, 9);
});

test('migrate audio: formato nuovo resta invariato (on persistito)', () => {
  const loc = { id: 'A', map: { audio: { background: [{ id: 'b', name: 'x', file: 'x.mp3', icon: 'wind', volume: 0.3, handout: true, restartOnStop: true, on: true }], oneshot: [] } } };
  const state = { locations: [loc] };
  migrate(state);
  assert.deepEqual(loc.map.audio.background[0], { id: 'b', audioId: state.audioLibrary[0].id, name: 'x', file: 'x.mp3', icon: 'wind', volume: 0.3, handout: true, restartOnStop: true, on: true });
});

test('applyStartupDefault: azzera audioOneshots e non reintroduce i campi audio vecchi', () => {
  const state = { locations: [{ id: 'A', isDefault: true }], audioOneshots: { x: 1 } };
  applyStartupDefault(state);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal('activeAudioTrack' in state, false);
  assert.equal('audioState' in state, false);
});

test('migrate: aggiunge handout e archivio vuoti agli stati vecchi', () => {
  const state = { locations: [] };
  migrate(state);
  assert.deepEqual(state.handout, { defaultId: null });
  assert.deepEqual(state.handoutLibrary, []);
});

function oldHandoutState(imageId = 'foto') {
  return {
    locations: [{
      id: 'loc', map: {},
      images: [{ id: 'foto', name: 'Copertina', file: 'a.png' }, { id: 'sito', name: 'Web', file: null, url: 'http://x' }]
    }],
    handout: { shown: { locationId: 'loc', imageId: 'foto' }, defaultMedia: { locationId: 'loc', imageId } }
  };
}

test('migrate: il vecchio default diventa una voce dell archivio e default globale', () => {
  const state = oldHandoutState();
  migrate(state, { copyHandoutFile: (f) => `copia-${f}` });
  assert.equal(state.handoutLibrary.length, 1);
  assert.equal(state.handoutLibrary[0].name, 'Copertina');
  assert.equal(state.handoutLibrary[0].file, 'copia-a.png');
  assert.deepEqual(state.handout, { defaultId: state.handoutLibrary[0].id });
  // Idempotente: una seconda migrazione non duplica.
  migrate(state, { copyHandoutFile: (f) => `copia-${f}` });
  assert.equal(state.handoutLibrary.length, 1);
});

test('migrate: copia fallita, pagina Web o media inesistente -> nessuna voce', () => {
  for (const [imageId, copy] of [['foto', () => null], ['sito', (f) => `c-${f}`], ['via', (f) => `c-${f}`]]) {
    const state = oldHandoutState(imageId);
    migrate(state, { copyHandoutFile: copy });
    assert.deepEqual(state.handoutLibrary, []);
    assert.deepEqual(state.handout, { defaultId: null });
  }
});

test('migrate: handoutDefaultId sconosciuto (location importata) viene azzerato', () => {
  const state = { locations: [{ id: 'loc', map: {}, images: [], handoutDefaultId: 'estraneo' }] };
  migrate(state);
  assert.equal(state.locations[0].handoutDefaultId, null);
});

const bgRow = (id, file, extra = {}) => ({ id, name: file, file, icon: 'music', volume: 0.4, handout: false, restartOnStop: false, on: true, ...extra });
const newLoc = (id, background) => ({ id, map: { audio: { background, oneshot: [] } } });

test('migrate: stato senza audioLibrary -> archivio creato, righe con audioId, volumi e on invariati', () => {
  const state = { locations: [newLoc('A', [bgRow('b1', 'x.mp3')]), newLoc('B', [bgRow('b2', 'x.mp3', { on: false, volume: 0.9 })])] };
  migrate(state);
  assert.equal(state.audioLibrary.length, 1);
  const [a, b] = state.locations.map((l) => l.map.audio.background[0]);
  assert.equal(a.audioId, state.audioLibrary[0].id);
  assert.equal(b.audioId, state.audioLibrary[0].id);
  assert.deepEqual([a.on, a.volume, b.on, b.volume], [true, 0.4, false, 0.9]);
});

test('migrate: con audioKey iniettato unisce file con contenuto uguale', () => {
  const state = { locations: [newLoc('A', [bgRow('b1', 'p.mp3')]), newLoc('B', [bgRow('b2', 'q.mp3')])] };
  migrate(state, { audioKey: () => 'stesso' });
  assert.equal(state.audioLibrary.length, 1);
  assert.equal(state.locations[1].map.audio.background[0].file, 'p.mp3');
});
