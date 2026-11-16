// Eventi socket di presenza (hello, viewport del display, disconnect).
// Registrati da io.on('connection') in server/index.js, dopo
// auth.socketGuard e protectSocketHandlers. Lo stato si legge con getState()
// dentro ogni handler, mai fuori.
const audioModel = require('./audio');

function registerPresenceEvents(socket, { getState, broadcastState, controlSockets, displaySockets, broadcastControlStatus, broadcastDisplayStatus, setDisplayViewport, getDisplayAudio, setDisplayAudio }) {
  socket.on('hello', ({ role }) => {
    const state = getState();
    if (role === 'control') {
      controlSockets.add(socket.id);
      broadcastControlStatus();
    } else if (role === 'display') {
      displaySockets.add(socket.id);
      broadcastDisplayStatus();
      // Un display nuovo o ricaricato non deve far ripartire one-shot "in corso".
      if (audioModel.clearOneshots(state)) broadcastState();
    }
  });

  socket.on('display:viewport', ({ width, height }) => {
    // /control e /party lo usano per i conti: solo misure finite e positive.
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    setDisplayViewport({ width, height });
    broadcastState();
  });

  socket.on('disconnect', () => {
    const state = getState();
    controlSockets.delete(socket.id);
    broadcastControlStatus();
    const wasDisplay = displaySockets.delete(socket.id);
    broadcastDisplayStatus();
    if (wasDisplay && displaySockets.size === 0) {
      const cleared = audioModel.clearOneshots(state);
      if (getDisplayAudio() || cleared) {
        setDisplayAudio(null);
        broadcastState();
      }
    }
  });
}

module.exports = { registerPresenceEvents };
