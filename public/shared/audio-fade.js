// Dissolvenze dell'audio di /display e stato reale riportato a /control.
// Script classico (come media.js): funzioni globali nel browser, module.exports
// per i test e per il server. Nessun accesso al DOM globale: il motore riceve
// elementi, clock e scheduler dall'esterno.

const AUDIO_FADE = {
  location: 2000, // cambio di file della principale (cambio location incluso)
  transport: 400, // play / pausa / stop, uscita dello sting
  duckOut: 600, // la principale sfuma in pausa quando parte uno sting
  stingIn: 300, // ingresso dello sting
  resumeIn: 1500 // la principale riprende dopo lo sting
};

const DISPLAY_AUDIO_STATUSES = ['playing', 'idle', 'error', 'blocked'];
const DISPLAY_AUDIO_SLOTS = ['main', 'special'];

function audioLevelAt(from, to, elapsedMs, durationMs) {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  return from + (to - from) * (elapsedMs / durationMs);
}

function normalizeDisplayAudioStatus(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!DISPLAY_AUDIO_STATUSES.includes(payload.status)) return null;
  if (!DISPLAY_AUDIO_SLOTS.includes(payload.slot)) return null;
  return { status: payload.status, slot: payload.slot };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AUDIO_FADE,
    DISPLAY_AUDIO_STATUSES,
    DISPLAY_AUDIO_SLOTS,
    audioLevelAt,
    normalizeDisplayAudioStatus
  };
}
