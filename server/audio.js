const { nanoid } = require('nanoid');

// Modello audio per location: due righe, "background" (loop acceso/spento) e
// "oneshot" (suono singolo). Funzioni pure sullo stato: salvataggio e
// broadcast restano a server/index.js.
const AUDIO_KINDS = ['background', 'oneshot'];
const DEFAULT_TRACK_VOLUME = 0.7;
const DEFAULT_ICONS = { background: 'music', oneshot: 'zap' };
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const MAX_NAME = 120;

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
    volume: cleanVolume(t.volume)
  };
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
  let changed = false;
  if (typeof fields.name === 'string') {
    found.track.name = fields.name.slice(0, MAX_NAME);
    changed = true;
  }
  if (typeof fields.icon === 'string' && ICON_RE.test(fields.icon)) {
    found.track.icon = fields.icon;
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

module.exports = {
  AUDIO_KINDS, DEFAULT_TRACK_VOLUME, emptyAudio, migrateLocationAudio, findTrack, addTrack,
  toggleTrack, setTrackVolume, updateTrack, removeTrack, oneshotEnded, clearOneshots, audioFilesOf
};
