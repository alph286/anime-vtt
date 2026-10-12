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
