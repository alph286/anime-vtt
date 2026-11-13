// Archivio dei media di default di /handout: `state.handoutLibrary` (file in
// storage/handout), un default per location (`location.handoutDefaultId`) e uno
// globale (`state.handout.defaultId`). /handout sceglie con resolveHandoutMedia
// (public/shared/media.js). Stesso stile dell'archivio audio (server/audio.js).
const { nanoid } = require('nanoid');

const MAX_NAME = 80;

function cleanHandoutName(n) {
  return typeof n === 'string' ? n.slice(0, MAX_NAME) : '';
}

function findItem(state, id) {
  return (state.handoutLibrary || []).find((i) => i.id === id) || null;
}

// Crea l'archivio se manca, toglie i campi vecchi (`shown`, `defaultMedia`) e
// azzera ogni riferimento a una voce che non esiste (es. location importata).
function normalizeHandout(state) {
  state.handoutLibrary = (Array.isArray(state.handoutLibrary) ? state.handoutLibrary : [])
    .filter((i) => i && typeof i.file === 'string' && i.file)
    .map((i) => ({
      id: typeof i.id === 'string' && i.id ? i.id : nanoid(),
      name: cleanHandoutName(i.name),
      file: i.file
    }));
  const ids = new Set(state.handoutLibrary.map((i) => i.id));
  const valid = (id) => (typeof id === 'string' && ids.has(id) ? id : null);
  const old = state.handout || {};
  state.handout = { defaultId: valid(old.defaultId) };
  (state.locations || []).forEach((l) => { l.handoutDefaultId = valid(l.handoutDefaultId); });
}

function addHandoutItem(state, { name, file }) {
  const item = { id: nanoid(), name: cleanHandoutName(name), file };
  if (!Array.isArray(state.handoutLibrary)) state.handoutLibrary = [];
  state.handoutLibrary.push(item);
  return item;
}

function renameHandoutItem(state, id, name) {
  const item = findItem(state, id);
  if (!item || typeof name !== 'string') return false;
  item.name = cleanHandoutName(name);
  return true;
}

// Toglie la voce e ogni default che la usa; ritorna il file da cancellare.
function removeHandoutItem(state, id) {
  const item = findItem(state, id);
  if (!item) return null;
  (state.locations || []).forEach((l) => { if (l.handoutDefaultId === id) l.handoutDefaultId = null; });
  if (state.handout && state.handout.defaultId === id) state.handout.defaultId = null;
  state.handoutLibrary.splice(state.handoutLibrary.indexOf(item), 1);
  return item.file;
}

// `locationId` assente/null = default globale; `id` null = nessun default.
function setHandoutDefault(state, { locationId = null, id = null } = {}) {
  if (id !== null && !findItem(state, id)) return false;
  if (locationId == null) {
    if (!state.handout) state.handout = { defaultId: null };
    state.handout.defaultId = id;
    return true;
  }
  const location = (state.locations || []).find((l) => l.id === locationId);
  if (!location) return false;
  location.handoutDefaultId = id;
  return true;
}

function handoutLibraryFiles(state) {
  return (state.handoutLibrary || []).map((i) => i.file).filter(Boolean);
}

module.exports = {
  normalizeHandout, cleanHandoutName, addHandoutItem, renameHandoutItem,
  removeHandoutItem, setHandoutDefault, handoutLibraryFiles
};
