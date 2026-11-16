// Eventi socket delle decorazioni shader. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.
const { nanoid } = require('nanoid');
const { MAX_AOE_SIZE_M } = require('./socket-aoe');

// Whitelist server-side dei tipi di decorazione shader piazzabili da
// /editor. Il registro con lo shader GLSL vero vive lato client
// (public/shared/shader-effects.js) -- il server valida solo che la
// stringa sia una di queste, mai il contenuto GLSL.
const SHADER_IDS = ['portal', 'portal_red', 'green_fire', 'magic_circle_red', 'magic_circle_blue', 'magic_circle_green'];
const SHADER_MIN_SIZE_M = 0.5;

function registerShaderEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast }) {
  // Decorazioni shader: scenografia persistente della mappa piazzata da
  // /editor durante la preparazione, non stato di sessione -- stesso
  // pattern find→valida→muta→salva→broadcast di compass/polygon/AoE.
  socket.on('shader:place', ({ locationId, shaderId, x, y, widthM, heightM }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (!SHADER_IDS.includes(shaderId)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(widthM) || widthM < SHADER_MIN_SIZE_M || widthM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(heightM) || heightM < SHADER_MIN_SIZE_M || heightM > MAX_AOE_SIZE_M) return;
    if (!Array.isArray(location.map.shaders)) location.map.shaders = [];
    location.map.shaders.push({ id: nanoid(), shaderId, x, y, widthM, heightM });
    saveState(state);
    broadcastState();
  });

  socket.on('shader:move', ({ locationId, id, x, y }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const deco = location?.map.shaders?.find((s) => s.id === id);
    if (!deco) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    deco.x = x;
    deco.y = y;
    scheduleSaveAndBroadcast();
  });

  socket.on('shader:resize', ({ locationId, id, widthM, heightM }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const deco = location?.map.shaders?.find((s) => s.id === id);
    if (!deco) return;
    if (!Number.isFinite(widthM) || widthM < SHADER_MIN_SIZE_M || widthM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(heightM) || heightM < SHADER_MIN_SIZE_M || heightM > MAX_AOE_SIZE_M) return;
    deco.widthM = widthM;
    deco.heightM = heightM;
    saveState(state);
    broadcastState();
  });

  socket.on('shader:remove', ({ locationId, id }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(location.map.shaders)) return;
    location.map.shaders = location.map.shaders.filter((s) => s.id !== id);
    saveState(state);
    broadcastState();
  });

  // Simmetrico a polygon:restore: permette a /editor di implementare
  // l'undo dell'eliminazione reinserendo la decorazione così com'era.
  socket.on('shader:restore', ({ locationId, shader, index }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !shader || !shader.id || !SHADER_IDS.includes(shader.shaderId)) return;
    if (!Number.isFinite(shader.x) || !Number.isFinite(shader.y)) return;
    if (!Number.isFinite(shader.widthM) || shader.widthM < SHADER_MIN_SIZE_M || shader.widthM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(shader.heightM) || shader.heightM < SHADER_MIN_SIZE_M || shader.heightM > MAX_AOE_SIZE_M) return;
    if (!Array.isArray(location.map.shaders)) location.map.shaders = [];
    if (location.map.shaders.some((s) => s.id === shader.id)) return;
    const insertAt = Number.isInteger(index) ? Math.min(Math.max(0, index), location.map.shaders.length) : location.map.shaders.length;
    location.map.shaders.splice(insertAt, 0, {
      id: shader.id,
      shaderId: shader.shaderId,
      x: shader.x,
      y: shader.y,
      widthM: shader.widthM,
      heightM: shader.heightM
    });
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerShaderEvents };
