// Eventi socket della vista e del ping. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.

function registerViewEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast, io }) {
  socket.on('view:pan', ({ locationId, dx, dy }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.offsetX += dx;
    location.map.liveView.offsetY += dy;
    scheduleSaveAndBroadcast();
  });

  socket.on('view:zoom', ({ locationId, scale }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.scale = scale;
    scheduleSaveAndBroadcast();
  });

  socket.on('view:reset', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
    broadcastState();
  });

  // Gesto momentaneo, non una proprietà della mappa: niente saveState/
  // broadcastState, solo un rilancio a chi è connesso ora. Ignorato se non
  // punta alla location davvero attiva -- altrimenti un ping in preview
  // (mai mostrata ai giocatori) apparirebbe comunque sullo schermo sbagliato.
  // strokeId distingue un gesto dall'altro (tap singolo o trascinamento):
  // senza, due tap ravvicinati finirebbero mischiati nello stesso elenco
  // di punti lato client e verrebbero disegnati come se fossero lo stesso
  // gesto (una scia che li collega) invece di due "sonar" indipendenti.
  // Solo passthrough qui, nessuna validazione di formato: è un id opaco,
  // generato e consumato solo dal client.
  socket.on('ping:show', ({ locationId, x, y, strokeId }) => {
    const state = getState();
    if (locationId !== state.activeLocationId) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    io.emit('ping:show', { x, y, strokeId });
  });
}

module.exports = { registerViewEvents };
