// /handout: sola visualizzazione. Mostra l'ultimo media (immagine o video)
// inviato al display da /control e lo tiene finché non se ne mostra un altro;
// se non ce n'è uno, il media di default scelto in /editor. La scelta sta in
// resolveHandoutMedia (shared/media.js), lo stato lo tiene il server.
const socket = io();
const handoutImg = document.getElementById('handout-img');
const handoutVideo = document.getElementById('handout-video');
let lastState = null;

// Audio: suonano qui le tracce della location attiva con la spunta "Suona anche
// su /handout" (stessi comandi di /control, stesso mixer di /display). Chi
// comanda resta /display: qui non si riporta lo stato né la fine dei one-shot.
const audioEngine = createPageAudioMixer(document.getElementById('audio-mixer'), {
  onStatus: () => {},
  onOneshotEnded: () => {}
});

function renderAudio(state) {
  const location = state.locations.find((l) => l.id === state.activeLocationId);
  audioEngine.apply(audioSceneOf(location, state.audioOneshots, { handoutOnly: true }));
}

// Il browser blocca l'audio finché non si interagisce con la pagina: al primo
// clic/tasto si riapplica la scena e le tracce rifiutate ritentano subito.
function retryAudio() {
  if (lastState) renderAudio(lastState);
}
window.addEventListener('pointerdown', retryAudio);
window.addEventListener('keydown', retryAudio);

function clearMedia() {
  [handoutImg, handoutVideo].forEach((el) => {
    el.hidden = true;
    if (el === handoutVideo) el.pause();
    if (el.dataset.mapSrc) {
      el.removeAttribute('src');
      delete el.dataset.mapSrc;
    }
  });
}

socket.on('connect', () => {
  socket.emit('hello', { role: 'handout' });
});

socket.on('state:update', (state) => {
  lastState = state;
  renderAudio(state);
  const item = resolveHandoutMedia(state);
  if (!item) {
    clearMedia();
    return;
  }
  // object-fit: contain fa già da sé l'adattamento: nessun layout da ricalcolare.
  loadMapMedia(handoutImg, handoutVideo, item.file, `/storage/images/${item.file}`, () => {});
});
