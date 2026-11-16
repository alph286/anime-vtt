// Eventi socket delle location. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers: `socket.on`
// qui è già quello protetto. Lo stato si legge con getState() dentro ogni
// handler, mai fuori (il ripristino di un backup lo riassegna).
const { nanoid } = require('nanoid');
const { DEFAULT_GRID, DEFAULT_COMPASS } = require('./state');
const audioModel = require('./audio');

function registerLocationEvents(socket, { getState, saveState, broadcastState, statePayload }) {
  socket.on('location:set', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    audioModel.clearOneshots(state);
    saveState(state);
    broadcastState();
  });

  socket.on('location:create', () => {
    const state = getState();
    const location = {
      id: nanoid(),
      name: 'Nuova location',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        audio: audioModel.emptyAudio(),
        polygons: [],
        aoes: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
    audioModel.clearOneshots(state);
    saveState(state);
    broadcastState();
  });

  socket.on('location:rename', ({ locationId, name }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });

  socket.on('location:archive', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.archived = true;
    if (state.activeLocationId === locationId) {
      state.activeLocationId = null;
      // Come il cambio location: gli one-shot della location archiviata finiscono qui.
      audioModel.clearOneshots(state);
    }
    saveState(state);
    broadcastState();
  });

  socket.on('location:restore', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.archived = false;
    saveState(state);
    broadcastState();
  });

  socket.on('location:delete', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.archived) return;
    state.locations = state.locations.filter((l) => l.id !== locationId);
    saveState(state);
    broadcastState();
  });

  socket.on('location:setDefault', ({ locationId }) => {
    const state = getState();
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.locations.forEach((l) => { l.isDefault = l.id === locationId; });
    saveState(state);
    broadcastState();
  });

  socket.on('location:reorder', ({ orderedIds }) => {
    const state = getState();
    if (!Array.isArray(orderedIds)) {
      socket.emit('state:update', statePayload());
      return;
    }
    const activeIds = state.locations.filter((l) => !l.archived).map((l) => l.id);
    const activeSet = new Set(activeIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!activeSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== activeIds.length) {
      socket.emit('state:update', statePayload());
      return;
    }
    const byId = new Map(state.locations.map((l) => [l.id, l]));
    const reorderedActive = validOrder.map((id) => byId.get(id));
    const archivedInPlace = state.locations.filter((l) => l.archived);
    state.locations = [...reorderedActive, ...archivedInPlace];
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerLocationEvents };
