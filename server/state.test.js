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
