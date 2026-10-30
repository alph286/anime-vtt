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

test('migrate audio: audioOneshots salvato viene azzerato', () => {
  const state = { audioOneshots: { x: 1 }, audioOneshotSeq: 9, locations: [] };
  migrate(state);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal(state.audioOneshotSeq, 0);
});

test('migrate audio: formato nuovo resta invariato (on persistito)', () => {
  const loc = { id: 'A', map: { audio: { background: [{ id: 'b', name: 'x', file: 'x.mp3', icon: 'wind', volume: 0.3, restartOnStop: true, on: true }], oneshot: [] } } };
  const state = { locations: [loc] };
  migrate(state);
  assert.deepEqual(loc.map.audio.background[0], { id: 'b', name: 'x', file: 'x.mp3', icon: 'wind', volume: 0.3, restartOnStop: true, on: true });
});

test('applyStartupDefault: azzera audioOneshots e non reintroduce i campi audio vecchi', () => {
  const state = { locations: [{ id: 'A', isDefault: true }], audioOneshots: { x: 1 } };
  applyStartupDefault(state);
  assert.deepEqual(state.audioOneshots, {});
  assert.equal('activeAudioTrack' in state, false);
  assert.equal('audioState' in state, false);
});
