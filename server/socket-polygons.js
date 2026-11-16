// Eventi socket dei poligoni (fog). Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.
const { nanoid } = require('nanoid');

function registerPolygonEvents(socket, { getState, saveState, broadcastState, statePayload }) {
  socket.on('polygon:create', ({ locationId, name, points }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(points) || points.length < 3) return;
    location.map.polygons.push({ id: nanoid(), name: name || 'nuova area', points, revealed: false });
    saveState(state);
    broadcastState();
  });

  socket.on('polygon:update', ({ locationId, polygonId, points, name }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    if (points) polygon.points = points;
    if (name !== undefined) polygon.name = name;
    saveState(state);
    broadcastState();
  });

  socket.on('polygon:delete', ({ locationId, polygonId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.polygons = location.map.polygons.filter((p) => p.id !== polygonId);
    saveState(state);
    broadcastState();
  });

  // Annulla di un polygon:delete: a differenza di polygon:create (che genera
  // sempre un nuovo id), qui il client manda l'intero poligono così com'era
  // -- stesso id, stessa posizione nell'elenco, stesso stato rivelato -- per
  // ripristinarlo esattamente, non ricrearne uno equivalente ma diverso.
  socket.on('polygon:restore', ({ locationId, polygon, index }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !polygon || !polygon.id || !Array.isArray(polygon.points)) return;
    // Nessun duplicato se il poligono esiste già (es. un doppio undo, o un
    // client rimasto indietro che reinvia lo stesso ripristino).
    if (location.map.polygons.some((p) => p.id === polygon.id)) return;
    const insertAt = Number.isInteger(index) ? Math.min(Math.max(0, index), location.map.polygons.length) : location.map.polygons.length;
    location.map.polygons.splice(insertAt, 0, {
      id: polygon.id,
      name: String(polygon.name || 'nuova area').slice(0, 200),
      points: polygon.points,
      revealed: Boolean(polygon.revealed)
    });
    saveState(state);
    broadcastState();
  });

  socket.on('polygon:reorder', ({ locationId, orderedIds }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(orderedIds)) {
      if (location) socket.emit('state:update', statePayload());
      return;
    }
    const currentIds = (location.map.polygons || []).map((p) => p.id);
    const currentSet = new Set(currentIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!currentSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== currentIds.length) {
      socket.emit('state:update', statePayload());
      return;
    }
    const byId = new Map((location.map.polygons || []).map((p) => [p.id, p]));
    location.map.polygons = validOrder.map((id) => byId.get(id));
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerPolygonEvents };
