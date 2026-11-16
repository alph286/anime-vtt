// Eventi socket di immagini e handout. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers. Lo stato si
// legge con getState() dentro ogni handler, mai fuori.
const path = require('path');
const handoutModel = require('./handout');
const { sendStoredMedia } = require('./telegram-routes');

function registerImageEvents(socket, { getState, saveState, broadcastState, getActiveLocation, deleteUploadedFile, IMAGES_DIR, HANDOUT_DIR, telegramConfig, telegramClient }) {
  socket.on('image:show', ({ imageId }) => {
    const state = getState();
    const location = getActiveLocation();
    if (!location?.images.some((i) => i.id === imageId)) return;
    state.activeImageId = imageId;
    broadcastState();
  });

  // Default di /handout: `locationId` null = globale, `id` null = nessuno.
  socket.on('handout:setDefault', ({ locationId = null, id = null } = {}) => {
    const state = getState();
    if (!handoutModel.setHandoutDefault(state, { locationId, id })) return;
    saveState(state);
    broadcastState();
  });

  socket.on('handoutLibrary:update', ({ id, name } = {}) => {
    const state = getState();
    if (!handoutModel.renameHandoutItem(state, id, name)) return;
    saveState(state);
    broadcastState();
  });

  socket.on('handoutLibrary:delete', ({ id } = {}) => {
    const state = getState();
    const file = handoutModel.removeHandoutItem(state, id);
    if (!file) return;
    deleteUploadedFile(HANDOUT_DIR, file);
    saveState(state);
    broadcastState();
  });

  socket.on('image:hide', () => {
    const state = getState();
    state.activeImageId = null;
    broadcastState();
  });

  socket.on('image:rename', ({ locationId, imageId, name }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });

  socket.on('image:delete', ({ locationId, imageId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;

    location.images = location.images.filter((i) => i.id !== imageId);
    if (state.activeImageId === imageId) state.activeImageId = null;
    if (image.file) deleteUploadedFile(IMAGES_DIR, image.file);

    saveState(state);
    broadcastState();
  });

  // Stesso schema di validazione di location:reorder: l'ordine proposto deve
  // essere una permutazione esatta degli id già presenti, altrimenti viene
  // ignorato (nessun id perso o duplicato per un client rimasto indietro).
  socket.on('image:reorder', ({ locationId, orderedIds }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(orderedIds)) return;
    const currentIds = (location.images || []).map((img) => img.id);
    const currentSet = new Set(currentIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!currentSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== currentIds.length) return;
    const byId = new Map(location.images.map((img) => [img.id, img]));
    location.images = validOrder.map((id) => byId.get(id));
    saveState(state);
    broadcastState();
  });

  socket.on('image:caption', ({ locationId, imageId, caption }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.caption = String(caption || '').slice(0, 1024); // limite didascalia di Telegram
    saveState(state);
    broadcastState();
  });

  socket.on('image:destination', ({ locationId, imageId, destination }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    if (destination !== undefined && destination !== null && typeof destination !== 'string') return;
    image.telegramDestination = destination || null;
    saveState(state);
    broadcastState();
  });

  socket.on('image:sendTelegram', async ({ locationId, imageId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) {
      socket.emit('telegram:sendResult', { imageId, ok: false, error: 'Immagine non trovata' });
      return;
    }
    if (image.url) {
      socket.emit('telegram:sendResult', { imageId, ok: false, error: 'Le pagine web non si inviano su Telegram' });
      return;
    }
    const result = await sendStoredMedia({
      config: telegramConfig,
      client: telegramClient,
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
    socket.emit('telegram:sendResult', { imageId, ok: result.ok, error: result.error });
  });
}

module.exports = { registerImageEvents };
