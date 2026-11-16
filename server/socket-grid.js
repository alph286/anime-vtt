// Eventi socket di mappa, griglia e bussola. Registrati da io.on('connection')
// in server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.

function registerGridEvents(socket, { getState, saveState, broadcastState }) {
  socket.on('mapScale:set', ({ locationId, scale }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (!Number.isFinite(scale) || scale <= 0) return;
    location.map.scale = scale;
    saveState(state);
    broadcastState();
  });

  socket.on('mapFlip:toggle', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.flip180 = !location.map.flip180;
    saveState(state);
    broadcastState();
  });

  socket.on('mapRotate90:toggle', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.rotate90 = !location.map.rotate90;
    saveState(state);
    broadcastState();
  });

  socket.on('grid:update', ({ locationId, enabled, cellSize, baseCellSize, divisions, offsetX, offsetY, color, lineWidth, opacity }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    // Un campo presente col tipo sbagliato rifiuta l'intero evento (niente
    // modifiche a metà).
    const numeric = [cellSize, baseCellSize, divisions, offsetX, offsetY, lineWidth, opacity];
    if (numeric.some((v) => v !== undefined && !Number.isFinite(v))) return;
    if (enabled !== undefined && typeof enabled !== 'boolean') return;
    if (color !== undefined && typeof color !== 'string') return;
    if (enabled !== undefined) location.map.grid.enabled = enabled;
    if (offsetX !== undefined) location.map.grid.offsetX = offsetX;
    if (offsetY !== undefined) location.map.grid.offsetY = offsetY;
    if (color !== undefined) location.map.grid.color = color;
    if (lineWidth !== undefined) location.map.grid.lineWidth = lineWidth;
    if (opacity !== undefined) location.map.grid.opacity = opacity;
    if (baseCellSize !== undefined) location.map.grid.baseCellSize = baseCellSize;
    if (divisions !== undefined) location.map.grid.divisions = Math.max(1, Math.round(divisions));
    if (baseCellSize !== undefined || divisions !== undefined) {
      // Traccia una nuova cella grezza, o cambia solo il numero di
      // suddivisioni su quella già tracciata: in entrambi i casi la cella
      // effettiva è sempre il loro quoziente.
      location.map.grid.cellSize = Math.max(4, Math.round(location.map.grid.baseCellSize / location.map.grid.divisions));
    } else if (cellSize !== undefined) {
      // Modifica numerica diretta della cella (fine-tuning): un valore
      // esplicito diventa la nuova base e azzera la suddivisione, così non
      // resta "nascosto" dietro un moltiplicatore residuo della volta prima.
      location.map.grid.cellSize = cellSize;
      location.map.grid.baseCellSize = cellSize;
      location.map.grid.divisions = 1;
    }
    saveState(state);
    broadcastState();
  });

  socket.on('compass:update', ({ locationId, visible, x, y, rotation }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.compass) return;
    if ([x, y, rotation].some((v) => v !== undefined && !Number.isFinite(v))) return;
    if (visible !== undefined) location.map.compass.visible = Boolean(visible);
    if (x !== undefined) location.map.compass.x = Math.min(100, Math.max(0, x));
    if (y !== undefined) location.map.compass.y = Math.min(100, Math.max(0, y));
    if (rotation !== undefined) location.map.compass.rotation = ((Math.round(rotation) % 360) + 360) % 360;
    saveState(state);
    broadcastState();
  });

  socket.on('gridPreset:save', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    state.gridPreset = {
      cellSize: location.map.grid.cellSize,
      offsetX: location.map.grid.offsetX,
      offsetY: location.map.grid.offsetY,
      color: location.map.grid.color,
      lineWidth: location.map.grid.lineWidth,
      opacity: location.map.grid.opacity
    };
    saveState(state);
    broadcastState();
  });

  socket.on('gridPreset:apply', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !state.gridPreset) return;
    location.map.grid.cellSize = state.gridPreset.cellSize;
    // Una predefinita applicata è di fatto un valore esplicito, come il
    // fine-tuning numerico: diventa la nuova base, nessuna suddivisione
    // residua della griglia precedente.
    location.map.grid.baseCellSize = state.gridPreset.cellSize;
    location.map.grid.divisions = 1;
    location.map.grid.offsetX = state.gridPreset.offsetX;
    location.map.grid.offsetY = state.gridPreset.offsetY;
    location.map.grid.color = state.gridPreset.color;
    location.map.grid.lineWidth = state.gridPreset.lineWidth;
    location.map.grid.opacity = state.gridPreset.opacity;
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerGridEvents };
