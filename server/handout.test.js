const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeHandout, cleanHandoutName, addHandoutItem, renameHandoutItem,
  removeHandoutItem, setHandoutDefault, handoutLibraryFiles
} = require('./handout');

function base() {
  return {
    locations: [{ id: 'A', handoutDefaultId: 'H' }, { id: 'B', handoutDefaultId: null }],
    handoutLibrary: [{ id: 'H', name: 'Mappa', file: 'h.png' }],
    handout: { defaultId: 'H' }
  };
}

test('normalizeHandout: stato vecchio -> archivio vuoto, riferimenti azzerati', () => {
  const s = { locations: [{ id: 'A' }, { id: 'B', handoutDefaultId: 'X' }], handout: { shown: {}, defaultMedia: {} } };
  normalizeHandout(s);
  assert.deepEqual(s.handoutLibrary, []);
  assert.deepEqual(s.handout, { defaultId: null });
  assert.equal(s.locations[0].handoutDefaultId, null);
  assert.equal(s.locations[1].handoutDefaultId, null);
});

test('normalizeHandout: tiene i riferimenti validi, scarta voci senza file', () => {
  const s = base();
  s.handoutLibrary.push({ id: 'Z', name: 'vuota' });
  s.locations[1].handoutDefaultId = 'Z';
  normalizeHandout(s);
  assert.deepEqual(s.handoutLibrary.map((i) => i.id), ['H']);
  assert.equal(s.locations[0].handoutDefaultId, 'H');
  assert.equal(s.locations[1].handoutDefaultId, null);
  assert.equal(s.handout.defaultId, 'H');
});

test('addHandoutItem: aggiunge una voce con id', () => {
  const s = { locations: [] };
  const item = addHandoutItem(s, { name: 'Copertina', file: 'c.png' });
  assert.ok(typeof item.id === 'string' && item.id.length > 0);
  assert.deepEqual(s.handoutLibrary, [item]);
  assert.equal(item.file, 'c.png');
});

test('setHandoutDefault: location, globale, nessuno, riferimenti sconosciuti', () => {
  const s = base();
  s.locations[0].handoutDefaultId = null;
  s.handout.defaultId = null;
  assert.equal(setHandoutDefault(s, { locationId: 'A', id: 'H' }), true);
  assert.equal(s.locations[0].handoutDefaultId, 'H');
  assert.equal(setHandoutDefault(s, { id: 'H' }), true);
  assert.equal(s.handout.defaultId, 'H');
  assert.equal(setHandoutDefault(s, { locationId: 'A', id: null }), true);
  assert.equal(s.locations[0].handoutDefaultId, null);
  assert.equal(setHandoutDefault(s, { locationId: 'nope', id: 'H' }), false);
  assert.equal(setHandoutDefault(s, { locationId: 'A', id: 'nope' }), false);
  assert.equal(s.locations[0].handoutDefaultId, null);
});

test('removeHandoutItem: azzera location e globale, ritorna il file', () => {
  const s = base();
  assert.equal(removeHandoutItem(s, 'H'), 'h.png');
  assert.equal(s.locations[0].handoutDefaultId, null);
  assert.equal(s.handout.defaultId, null);
  assert.deepEqual(s.handoutLibrary, []);
  assert.equal(removeHandoutItem(s, 'H'), null);
});

test('renameHandoutItem e cleanHandoutName', () => {
  const s = base();
  assert.equal(renameHandoutItem(s, 'H', 'Nuovo'), true);
  assert.equal(s.handoutLibrary[0].name, 'Nuovo');
  renameHandoutItem(s, 'H', 'x'.repeat(200));
  assert.equal(s.handoutLibrary[0].name.length, 80);
  assert.equal(renameHandoutItem(s, 'nope', 'a'), false);
  assert.equal(cleanHandoutName(42), '');
});

test('handoutLibraryFiles', () => {
  assert.deepEqual(handoutLibraryFiles(base()), ['h.png']);
  assert.deepEqual(handoutLibraryFiles({}), []);
});
