// /handout: sola visualizzazione. Mostra l'ultimo media (immagine o video)
// inviato al display da /control e lo tiene finché non se ne mostra un altro;
// se non ce n'è uno, il media di default scelto in /editor. La scelta sta in
// resolveHandoutMedia (shared/media.js), lo stato lo tiene il server.
const socket = io();
const handoutImg = document.getElementById('handout-img');
const handoutVideo = document.getElementById('handout-video');

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
  const item = resolveHandoutMedia(state);
  if (!item) {
    clearMedia();
    return;
  }
  // object-fit: contain fa già da sé l'adattamento: nessun layout da ricalcolare.
  loadMapMedia(handoutImg, handoutVideo, item.file, `/storage/images/${item.file}`, () => {});
});
