const { nanoid } = require('nanoid');

// Modello audio per location: due righe, "background" (loop acceso/spento) e
// "oneshot" (suono singolo). Funzioni pure sullo stato: salvataggio e
// broadcast restano a server/index.js.
const AUDIO_KINDS = ['background', 'oneshot'];
const DEFAULT_TRACK_VOLUME = 0.7;
const DEFAULT_ICONS = { background: 'music', oneshot: 'zap' };
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const MAX_NAME = 120;
const LIBRARY_ICON = 'music';

function emptyAudio() {
  return { background: [], oneshot: [] };
}

function cleanVolume(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_TRACK_VOLUME;
}

function cleanName(n) {
  return typeof n === 'string' ? n.slice(0, MAX_NAME) : '';
}

function cleanIcon(icon, kind) {
  return typeof icon === 'string' && ICON_RE.test(icon) ? icon : DEFAULT_ICONS[kind];
}

function hasFile(t) {
  return !!t && typeof t.file === 'string' && t.file !== '';
}

function normalizeTrack(t, kind) {
  const track = {
    id: typeof t.id === 'string' && t.id ? t.id : nanoid(),
    name: cleanName(t.name),
    file: t.file,
    icon: cleanIcon(t.icon, kind),
    volume: cleanVolume(t.volume),
    handout: t.handout === true
  };
  if (typeof t.audioId === 'string' && t.audioId) track.audioId = t.audioId;
  if (kind === 'background') {
    track.restartOnStop = t.restartOnStop === true;
    track.on = t.on === true;
  }
  return track;
}

// Accetta il formato nuovo, main/special, la singola traccia di prima e
// undefined. `legacyMainOn` vale solo per l'ex principale (main o traccia
// singola): nel formato nuovo `on` è già persistito.
function migrateLocationAudio(audio, { legacyMainOn }) {
  if (!audio || typeof audio !== 'object') return emptyAudio();
  if (Array.isArray(audio.background) || Array.isArray(audio.oneshot)) {
    return {
      background: (Array.isArray(audio.background) ? audio.background : []).filter(hasFile).map((t) => normalizeTrack(t, 'background')),
      oneshot: (Array.isArray(audio.oneshot) ? audio.oneshot : []).filter(hasFile).map((t) => normalizeTrack(t, 'oneshot'))
    };
  }
  const result = emptyAudio();
  const isLegacy = audio.main !== undefined || audio.special !== undefined;
  const main = isLegacy ? audio.main : audio;
  const special = isLegacy ? audio.special : null;
  if (hasFile(main)) result.background.push(normalizeTrack({ ...main, on: !!legacyMainOn }, 'background'));
  if (hasFile(special)) result.oneshot.push(normalizeTrack(special, 'oneshot'));
  return result;
}

function findTrack(location, trackId) {
  const audio = location && location.map && location.map.audio;
  if (!audio) return null;
  for (const kind of AUDIO_KINDS) {
    const track = (audio[kind] || []).find((t) => t.id === trackId);
    if (track) return { kind, track };
  }
  return null;
}

function addTrack(location, kind, { name, file, id }) {
  const track = normalizeTrack({ id, name, file }, kind);
  location.map.audio[kind].push(track);
  return track;
}

function toggleTrack(state, location, trackId, { displayConnected }) {
  const found = findTrack(location, trackId);
  if (!found) return false;
  if (found.kind === 'background') {
    found.track.on = !found.track.on;
    return true;
  }
  if (!displayConnected) return false;
  if (!state.audioOneshots) state.audioOneshots = {};
  if (trackId in state.audioOneshots) {
    delete state.audioOneshots[trackId];
  } else {
    state.audioOneshotSeq = (state.audioOneshotSeq || 0) + 1;
    state.audioOneshots[trackId] = state.audioOneshotSeq;
  }
  return true;
}

function setTrackVolume(location, trackId, volume) {
  const found = findTrack(location, trackId);
  if (!found || typeof volume !== 'number' || !Number.isFinite(volume)) return false;
  found.track.volume = Math.min(1, Math.max(0, volume));
  return true;
}

function updateTrack(location, trackId, fields) {
  const found = findTrack(location, trackId);
  if (!found || !fields) return false;
  // Nome e icona appartengono all'archivio (updateLibraryItem), non alla riga.
  let changed = false;
  if (typeof fields.handout === 'boolean') {
    found.track.handout = fields.handout;
    changed = true;
  }
  if (found.kind === 'background' && typeof fields.restartOnStop === 'boolean') {
    found.track.restartOnStop = fields.restartOnStop;
    changed = true;
  }
  return changed;
}

// Ritorna il file da cancellare dal disco, o null se la traccia non esiste.
function removeTrack(state, location, trackId) {
  const found = findTrack(location, trackId);
  if (!found) return null;
  const row = location.map.audio[found.kind];
  row.splice(row.indexOf(found.track), 1);
  if (state.audioOneshots) delete state.audioOneshots[trackId];
  return found.track.file;
}

// Un "finito" arrivato in ritardo (seq vecchio) non spegne una ripartenza.
function oneshotEnded(state, trackId, seq) {
  if (!state.audioOneshots || state.audioOneshots[trackId] !== seq) return false;
  delete state.audioOneshots[trackId];
  return true;
}

function clearOneshots(state) {
  const had = !!state.audioOneshots && Object.keys(state.audioOneshots).length > 0;
  state.audioOneshots = {};
  return had;
}

function audioFilesOf(location) {
  const audio = (location && location.map && location.map.audio) || {};
  return AUDIO_KINDS.flatMap((kind) => (audio[kind] || []).map((t) => t.file).filter(Boolean));
}

// --- Archivio audio ---
// `state.audioLibrary` possiede nome, icona e file; le righe delle location
// puntano a una voce con `audioId` e ne tengono una copia (name/icon/file)
// che questo modulo riallinea, così chi suona (display, handout) e /control
// continuano a leggere solo la riga.

function allRows(state) {
  return (state.locations || []).flatMap((location) => {
    const audio = (location.map && location.map.audio) || {};
    return AUDIO_KINDS.flatMap((kind) => (audio[kind] || []).map((track) => ({ location, kind, track })));
  });
}

function copyFromItem(track, item) {
  track.audioId = item.id;
  track.name = item.name;
  track.icon = item.icon;
  track.file = item.file;
}

function normalizeItem(i) {
  return {
    id: typeof i.id === 'string' && i.id ? i.id : nanoid(),
    name: cleanName(i.name),
    icon: typeof i.icon === 'string' && ICON_RE.test(i.icon) ? i.icon : LIBRARY_ICON,
    file: i.file
  };
}

// Crea l'archivio se manca e riallinea ogni riga. `audioKey(file)` raggruppa i
// file con lo stesso contenuto (all'avvio: hash del file); null = usa il nome.
// Una riga con audioId sconosciuto (es. da un backup) ritrova o ricrea la voce
// dal suo file invece di sparire.
function syncAudioLibrary(state, audioKey = (file) => file) {
  const keyOf = (file) => audioKey(file) || file;
  state.audioLibrary = (Array.isArray(state.audioLibrary) ? state.audioLibrary : []).filter(hasFile).map(normalizeItem);
  const byId = new Map(state.audioLibrary.map((i) => [i.id, i]));
  // Le chiavi (hash dei file all'avvio) servono solo se c'è una riga da
  // abbinare: calcolate al primo bisogno, non a ogni avvio.
  let byKey = null;
  allRows(state).forEach(({ track }) => {
    let item = byId.get(track.audioId);
    if (!item) {
      if (!byKey) {
        byKey = new Map();
        state.audioLibrary.forEach((i) => { const k = keyOf(i.file); if (!byKey.has(k)) byKey.set(k, i); });
      }
      const k = keyOf(track.file);
      item = byKey.get(k);
      if (!item) {
        item = normalizeItem({ name: track.name, icon: track.icon, file: track.file });
        state.audioLibrary.push(item);
        byId.set(item.id, item);
        byKey.set(k, item);
      }
    }
    copyFromItem(track, item);
  });
}

function findLibraryItem(state, audioId) {
  return (state.audioLibrary || []).find((i) => i.id === audioId) || null;
}

function addLibraryItem(state, { name, file }) {
  const item = normalizeItem({ name, file });
  if (!Array.isArray(state.audioLibrary)) state.audioLibrary = [];
  state.audioLibrary.push(item);
  return item;
}

function updateLibraryItem(state, audioId, fields) {
  const item = findLibraryItem(state, audioId);
  if (!item || !fields) return false;
  let changed = false;
  if (typeof fields.name === 'string') {
    item.name = cleanName(fields.name);
    changed = true;
  }
  if (typeof fields.icon === 'string' && ICON_RE.test(fields.icon)) {
    item.icon = fields.icon;
    changed = true;
  }
  if (changed) allRows(state).forEach(({ track }) => { if (track.audioId === audioId) copyFromItem(track, item); });
  return changed;
}

// Toglie la voce e tutte le righe che la usano; ritorna il file da cancellare.
function removeLibraryItem(state, audioId) {
  const item = findLibraryItem(state, audioId);
  if (!item) return null;
  allRows(state).forEach(({ location, kind, track }) => {
    if (track.audioId !== audioId) return;
    const row = location.map.audio[kind];
    row.splice(row.indexOf(track), 1);
    if (state.audioOneshots) delete state.audioOneshots[track.id];
  });
  state.audioLibrary.splice(state.audioLibrary.indexOf(item), 1);
  return item.file;
}

function addTrackFromLibrary(state, location, kind, audioId) {
  const item = findLibraryItem(state, audioId);
  if (!item || !AUDIO_KINDS.includes(kind)) return null;
  const track = normalizeTrack({ audioId: item.id, name: item.name, icon: item.icon, file: item.file }, kind);
  location.map.audio[kind].push(track);
  return track;
}

// Copia in coda le righe di `from` in `to`, saltando gli audio già presenti
// nella stessa riga di destinazione. Ritorna quante righe ha aggiunto.
function copyTracks(state, from, to) {
  let added = 0;
  AUDIO_KINDS.forEach((kind) => {
    const target = to.map.audio[kind];
    const present = new Set(target.map((t) => t.audioId));
    (from.map.audio[kind] || []).forEach((t) => {
      if (present.has(t.audioId)) return;
      present.add(t.audioId);
      target.push(normalizeTrack({ ...t, id: undefined }, kind));
      added += 1;
    });
  });
  return added;
}

function libraryFiles(state) {
  return (state.audioLibrary || []).map((i) => i.file).filter(Boolean);
}

module.exports = {
  AUDIO_KINDS, DEFAULT_TRACK_VOLUME, emptyAudio, migrateLocationAudio, findTrack, addTrack,
  toggleTrack, setTrackVolume, updateTrack, removeTrack, oneshotEnded, clearOneshots, audioFilesOf,
  syncAudioLibrary, addLibraryItem, updateLibraryItem, removeLibraryItem, addTrackFromLibrary, copyTracks, libraryFiles
};
