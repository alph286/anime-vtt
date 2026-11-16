// Eventi socket del fog of war. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.

function registerFogEvents(socket, { getState, saveState, broadcastState }) {
  socket.on('fow:toggle', ({ locationId, polygonId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    polygon.revealed = !polygon.revealed;
    saveState(state);
    broadcastState();
  });

  socket.on('fow:setAll', ({ locationId, revealed }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    (location.map.polygons || []).forEach((p) => { p.revealed = Boolean(revealed); });
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerFogEvents };
