const test = require('node:test');
const assert = require('node:assert');
const { manifestForLocation, rebuildLocationFromManifest } = require('./exportImport');

test('il default di /handout della location viaggia nel manifest e torna al ripristino', () => {
  const location = { name: 'Taverna', handoutDefaultId: 'H1', map: { file: null, polygons: [] }, images: [] };
  const meta = manifestForLocation(location);
  assert.equal(meta.handoutDefaultId, 'H1');
  const rebuilt = rebuildLocationFromManifest(meta, new Map(), { archived: false, isDefault: false });
  assert.equal(rebuilt.handoutDefaultId, 'H1');
  const none = rebuildLocationFromManifest(manifestForLocation({ ...location, handoutDefaultId: undefined }), new Map(), { archived: false, isDefault: false });
  assert.equal(none.handoutDefaultId, null);
});
