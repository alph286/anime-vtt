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

test('migrate: aggiunge handout vuoto agli stati vecchi', () => {
  const state = { locations: [] };
  migrate(state);
  assert.deepEqual(state.handout, { shown: null, defaultMedia: null });
});

test('migrate: azzera i riferimenti handout a media non più esistenti', () => {
  const state = {
    locations: [{ id: 'loc', map: {}, images: [{ id: 'foto', file: 'a.png' }] }],
    handout: { shown: { locationId: 'loc', imageId: 'via' }, defaultMedia: { locationId: 'loc', imageId: 'foto' } }
  };
  migrate(state);
  assert.equal(state.handout.shown, null);
  assert.deepEqual(state.handout.defaultMedia, { locationId: 'loc', imageId: 'foto' });
});
