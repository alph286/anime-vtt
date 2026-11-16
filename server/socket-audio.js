// Eventi socket dell'audio. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.
const audioModel = require('./audio');
const { normalizeDisplayAudioStatus } = require('../public/shared/audio-fade.js');

function registerAudioEvents(socket, { getState, saveState, broadcastState, getActiveLocation, displaySockets, getDisplayAudio, setDisplayAudio, deleteUploadedFile, AUDIO_DIR }) {
  // Stato reale dell'audio, solo dal display (ha fatto `hello` con role display).
  // Si ritrasmette solo quando cambia, mai su disco.
  socket.on('audio:status', (payload) => {
    if (!displaySockets.has(socket.id)) return;
    const next = normalizeDisplayAudioStatus(payload);
    if (!next) return;
    const current = getDisplayAudio();
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    setDisplayAudio(next);
    broadcastState();
  });

  // Audio a righe. `audio:toggle` agisce sempre sulla location attiva (non
  // esiste un'anteprima silenziosa: suonerebbe subito ai giocatori); volume,
  // aggiornamento ed eliminazione indicano la location per id.
  socket.on('audio:toggle', ({ trackId } = {}) => {
    const state = getState();
    const location = getActiveLocation();
    if (!location) return;
    if (!audioModel.toggleTrack(state, location, trackId, { displayConnected: displaySockets.size > 0 })) return;
    saveState(state);
    broadcastState();
  });

  socket.on('audio:volume', ({ locationId, trackId, volume } = {}) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !audioModel.setTrackVolume(location, trackId, volume)) return;
    saveState(state);
    broadcastState();
  });

  // Nome e icona si cambiano dall'archivio (`audioLibrary:update`), non dalla riga.
  socket.on('audio:update', ({ locationId, trackId, restartOnStop, handout } = {}) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !audioModel.updateTrack(location, trackId, { restartOnStop, handout })) return;
    saveState(state);
    broadcastState();
  });

  socket.on('audio:delete', ({ locationId, trackId } = {}) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    // Il file resta nell'archivio: si cancella solo con `audioLibrary:delete`.
    if (!audioModel.removeTrack(state, location, trackId)) return;
    saveState(state);
    broadcastState();
  });

  socket.on('audio:add', ({ locationId, kind, audioId } = {}) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !audioModel.addTrackFromLibrary(state, location, kind, audioId)) return;
    saveState(state);
    broadcastState();
  });

  socket.on('audio:copyFrom', ({ locationId, fromLocationId } = {}) => {
    const state = getState();
    if (locationId === fromLocationId) return;
    const to = state.locations.find((l) => l.id === locationId);
    const from = state.locations.find((l) => l.id === fromLocationId);
    if (!to || !from || !audioModel.copyTracks(state, from, to)) return;
    saveState(state);
    broadcastState();
  });

  socket.on('audioLibrary:update', ({ audioId, name, icon } = {}) => {
    const state = getState();
    if (!audioModel.updateLibraryItem(state, audioId, { name, icon })) return;
    saveState(state);
    broadcastState();
  });

  // L'avviso "usato in..." lo mostra /editor prima di emettere.
  socket.on('audioLibrary:delete', ({ audioId } = {}) => {
    const state = getState();
    const file = audioModel.removeLibraryItem(state, audioId);
    if (!file) return;
    deleteUploadedFile(AUDIO_DIR, file);
    saveState(state);
    broadcastState();
  });

  // /display lo emette quando un one-shot finisce da solo. Solo dal display;
  // il seq scarta un "finito" in ritardo che riguarda una partenza superata.
  socket.on('audio:oneshotEnded', ({ trackId, seq } = {}) => {
    const state = getState();
    if (!displaySockets.has(socket.id)) return;
    if (!audioModel.oneshotEnded(state, trackId, seq)) return;
    broadcastState();
  });
}

module.exports = { registerAudioEvents };
