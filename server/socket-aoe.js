// Eventi socket delle aree d'effetto. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.
const { nanoid } = require('nanoid');
const { AOE_COLORS, AOE_SHADER_OVERRIDE_IDS } = require('../public/shared/media.js');

// Limite di sicurezza per gli AoE: una taglia enorme (o Infinity) farebbe
// iterare aoeAffectedCells su un numero di celle spropositato lato client.
const MAX_AOE_SIZE_M = 300;
const AOE_COLOR_NAMES = Object.keys(AOE_COLORS);

function registerAoeEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast }) {
  // Gli AoE sono persistiti come poligoni/griglia/bussola -- a differenza
  // del `ping:show` transitorio, restano finché il DM non li rimuove.
  socket.on('aoe:place', ({ locationId, shape, sizeM, widthM, x, y, color, shaderOverride }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (!['cone', 'cube', 'sphere', 'line'].includes(shape)) return;
    if (!Number.isFinite(sizeM) || !(sizeM > 0) || sizeM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Array.isArray(location.map.aoes)) location.map.aoes = [];
    location.map.aoes.push({
      id: nanoid(),
      shape,
      sizeM,
      widthM: shape === 'line' && Number.isFinite(widthM) && widthM > 0 && widthM <= MAX_AOE_SIZE_M ? widthM : null,
      x,
      y,
      rotation: 0,
      color: AOE_COLOR_NAMES.includes(color) ? color : 'red',
      shapeVisible: true,
      shaderOverride: AOE_SHADER_OVERRIDE_IDS.includes(shaderOverride) ? shaderOverride : null,
      cast: false
    });
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:move', ({ locationId, aoeId, x, y }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    aoe.x = x;
    aoe.y = y;
    scheduleSaveAndBroadcast();
  });

  // x/y arrivano già ricalcolati dal client (snapAoeOrigin con la NUOVA
  // rotazione): per il Cono, quale punto è valido (vertice o centro-lato)
  // dipende dall'angolo, quindi ruotare senza ri-agganciare lascerebbe
  // l'origine disallineata dalla griglia.
  socket.on('aoe:rotate', ({ locationId, aoeId, rotation, x, y }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (aoe.shape === 'cube' || aoe.shape === 'sphere') return;
    if (!Number.isFinite(rotation)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    aoe.rotation = ((Math.round(rotation) % 360) + 360) % 360;
    aoe.x = x;
    aoe.y = y;
    saveState(state);
    broadcastState();
  });

  // Ridimensiona un'area già piazzata (taglia/larghezza) invece di crearne
  // una nuova. x/y arrivano già ricalcolati dal client (stessa logica di
  // snapAoeOrigin usata al piazzamento): una taglia che cambia parità (es.
  // da pari a dispari) può richiedere uno spostamento di mezza cella per
  // restare agganciata alla griglia, e quel calcolo vive lato client dove
  // vive già tutta la geometria condivisa.
  socket.on('aoe:resize', ({ locationId, aoeId, sizeM, widthM, x, y }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (!Number.isFinite(sizeM) || !(sizeM > 0) || sizeM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    aoe.sizeM = sizeM;
    if (aoe.shape === 'line') {
      if (Number.isFinite(widthM) && widthM > 0 && widthM <= MAX_AOE_SIZE_M) aoe.widthM = widthM;
    }
    aoe.x = x;
    aoe.y = y;
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:setColor', ({ locationId, aoeId, color }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (!AOE_COLOR_NAMES.includes(color)) return;
    aoe.color = color;
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:setShapeVisible', ({ locationId, aoeId, visible }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    aoe.shapeVisible = Boolean(visible);
    saveState(state);
    broadcastState();
  });

  // Shader "extra" scelto dal menu "···" (non legato a un colore, vedi
  // AOE_SHADER_OVERRIDE_IDS/resolveAoeShaderId in media.js) -- null
  // riporta l'AoE al semplice abbinamento colore->shader. Indipendente da
  // aoe:setColor: il colore resta sempre il colore di anteprima (vedi
  // aoe.color), l'override sceglie solo QUALE shader lanciare.
  socket.on('aoe:setShaderOverride', ({ locationId, aoeId, shaderOverride }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    aoe.shaderOverride = AOE_SHADER_OVERRIDE_IDS.includes(shaderOverride) ? shaderOverride : null;
    saveState(state);
    broadcastState();
  });

  // "Lancia incantesimo": finché cast è false l'area resta nel riempimento
  // flat colorato di sempre (per leggere bene le celle colpite mentre il DM
  // la piazza/aggiusta); a true passa al render shader (AoeShaderLayer,
  // vedi shared/shader-effects.js) sia su /control che su /display.
  socket.on('aoe:setCast', ({ locationId, aoeId, cast }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    aoe.cast = Boolean(cast);
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:remove', ({ locationId, aoeId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(location.map.aoes)) return;
    location.map.aoes = location.map.aoes.filter((a) => a.id !== aoeId);
    saveState(state);
    broadcastState();
  });
}

module.exports = { registerAoeEvents, MAX_AOE_SIZE_M };
