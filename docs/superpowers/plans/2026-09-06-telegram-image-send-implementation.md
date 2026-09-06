# Invio Foto a Telegram via PicSender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dal `/control`, poter inviare una foto già mostrata ai giocatori al gruppo Telegram della campagna (nel topic giusto, con didascalia), riusando via HTTP l'app PicSender già in produzione sul Raspberry Pi — senza modificarla. Ogni foto di `location.images[]` guadagna una didascalia e una destinazione, modificabili sia da `/editor` che da `/control`; su `/control`, selezionare una foto apre un'anteprima locale (non ancora visibile ai giocatori) con tre azioni: Mostra, Invia, Ritorna alla mappa.

**Architecture:** un nuovo modulo server (`server/picsender.js`) parla con l'API HTTP già esistente di PicSender (`GET /api/destinations`, `POST /api/upload`, `POST /api/send`, `DELETE /api/images/<id>`). Ogni invio è un ciclo completo upload→send→delete lato server: PicSender resta solo un tramite, mai un secondo archivio. I client (`/editor`, `/control`) non contattano mai PicSender direttamente — passano solo dagli eventi socket/route di anime-vtt.

**Tech Stack:** Node 22 (fetch/FormData/Blob nativi, nessuna nuova dipendenza npm), Express, socket.io, vanilla JS lato client — stessi di tutto il resto del progetto.

## Global Constraints

- Ambito: solo `location.images[]` (le foto mostrabili ai giocatori via `image:show`/`image:hide`). La mappa di sfondo della location resta esclusa da questa funzione.
- Tutta l'integrazione con PicSender vive **solo lato server**, in `server/picsender.js`. Nessun client contatta mai PicSender direttamente.
- `PICSENDER_URL` è una nuova variabile d'ambiente **opzionale**: se assente o se PicSender non risponde, ogni funzione legata a Telegram fallisce con un errore leggibile — mai un crash del server, mai un blocco dell'avvio.
- `location.images[].telegramDestination` memorizza il **nome** della destinazione (es. `"Anime Salve — Mappe"`), mai l'indice — l'indice viene risolto dal nome solo al momento dell'invio, leggendo `GET /api/destinations` in quel momento.
- Ogni invio ripete l'intero ciclo upload→send→delete da zero: nessun id lato PicSender viene mai salvato o riusato tra un invio e l'altro.
- Le foto lato anime-vtt (`location.images[]`, `storage/images/`) non vengono mai toccate o cancellate automaticamente da questo flusso, indipendentemente dagli invii Telegram.
- Nessuna suite di test automatica in questo progetto (per scelta di design): ogni task si verifica manualmente su un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei), come da convenzione già in uso in tutti i piani precedenti.

---

### Task 1: Server — modulo PicSender, data model, route e socket

**Files:**
- Create: `server/picsender.js`
- Modify: `server/state.js` (migrazione, righe 49-63)
- Modify: `server/index.js` (require, route, socket handlers)
- Modify: `.env.example`

**Interfaces:**
- Produces: `server/picsender.js` esporta `{ getDestinations, sendImage }`.
  - `getDestinations(): Promise<Array<{index:number, name:string}>>` — richiede `GET /api/destinations` a PicSender; **lancia** un `Error` se `PICSENDER_URL` non è configurato o se PicSender non risponde correttamente.
  - `sendImage({filePath, caption, destinationName}): Promise<{ok:true} | {ok:false, error:string}>` — non lancia mai; esegue l'intero ciclo upload→send→delete e ritorna sempre un esito.
- Produces: nuova route `GET /api/telegram/destinations` → `200` con l'array di `{index,name}`, o `502` con `{error}`.
- Produces: nuovi eventi socket:
  - `image:caption { locationId, imageId, caption }` (nessuna risposta diretta, aggiorna lo stato e broadcasta come gli altri eventi `image:*`)
  - `image:destination { locationId, imageId, destination }` (idem; `destination` è un nome, o `null`/stringa vuota per rimuovere l'assegnazione)
  - `image:sendTelegram { locationId, imageId }` → il server risponde **solo al socket richiedente** con `telegram:sendResult { imageId, ok, error? }`
- Produces: `location.images[]` items guadagnano `caption: string` (default `''`) e `telegramDestination: string|null` (default `null`), sia per le immagini esistenti (backfill in `migrate()`) sia per quelle nuove (route di upload).
- Consumes: nessuna interfaccia da altri task (è il primo task).

- [ ] **Step 1: Crea il modulo `server/picsender.js`**

```js
// Integrazione con PicSender (app Flask separata, già in produzione sul
// Raspberry Pi) via la sua API HTTP esistente — nessuna modifica a PicSender.
// PicSender resta solo un tramite verso Telegram: ogni invio carica una copia
// temporanea, la invia, poi la cancella subito (vedi sendImage). Le foto di
// anime-vtt non vengono mai toccate da questo modulo.

const fs = require('fs');
const path = require('path');

function baseUrl() {
  const url = process.env.PICSENDER_URL || '';
  return url.replace(/\/+$/, '');
}

async function getDestinations() {
  const base = baseUrl();
  if (!base) throw new Error('PICSENDER_URL non configurato');
  let res;
  try {
    res = await fetch(`${base}/api/destinations`);
  } catch (err) {
    throw new Error(`PicSender non raggiungibile: ${err.message}`);
  }
  if (!res.ok) throw new Error(`PicSender ha risposto ${res.status}`);
  return res.json();
}

async function uploadToPicsender(filePath) {
  const base = baseUrl();
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('images', new Blob([buffer]), path.basename(filePath));
  const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Caricamento su PicSender fallito (${res.status})`);
  const body = await res.json();
  const saved = body.saved && body.saved[0];
  if (!saved) throw new Error('PicSender non ha accettato il file (formato non valido?)');
  return saved.id;
}

async function sendViaPicsender(picsenderId, destinationIndex, caption) {
  const base = baseUrl();
  const res = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [picsenderId], caption: caption || '', destination: destinationIndex })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Invio PicSender fallito (${res.status})`);
  }
}

// Best-effort: una pulizia fallita non deve mai nascondere l'esito
// dell'invio, che è quello che conta per chi ha premuto "Invia".
async function deleteFromPicsender(picsenderId) {
  try {
    const base = baseUrl();
    await fetch(`${base}/api/images/${picsenderId}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Pulizia PicSender fallita (non bloccante):', err.message);
  }
}

/**
 * Ciclo completo: upload -> risoluzione nome destinazione -> send -> delete
 * (best-effort). Non lancia mai: ogni fallimento diventa { ok: false, error }.
 */
async function sendImage({ filePath, caption, destinationName }) {
  if (!baseUrl()) {
    return { ok: false, error: 'PicSender non configurato (PICSENDER_URL mancante)' };
  }
  if (!destinationName) {
    return { ok: false, error: 'Nessuna destinazione assegnata a questa foto' };
  }

  let destinations;
  try {
    destinations = await getDestinations();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const dest = destinations.find((d) => d.name === destinationName);
  if (!dest) {
    return { ok: false, error: `Destinazione «${destinationName}» non più configurata su PicSender` };
  }

  let picsenderId;
  try {
    picsenderId = await uploadToPicsender(filePath);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  try {
    await sendViaPicsender(picsenderId, dest.index, caption);
  } catch (err) {
    await deleteFromPicsender(picsenderId);
    return { ok: false, error: err.message };
  }

  await deleteFromPicsender(picsenderId);
  return { ok: true };
}

module.exports = { getDestinations, sendImage };
```

- [ ] **Step 2: Aggiungi i due campi a `location.images[]` in `server/state.js`**

In `migrate()` (righe 49-63), l'attuale blocco:

```js
    (location.images || []).forEach((image) => {
      delete image.rotation;
    });
```

diventa:

```js
    (location.images || []).forEach((image) => {
      delete image.rotation;
      if (image.caption === undefined) image.caption = '';
      if (image.telegramDestination === undefined) image.telegramDestination = null;
    });
```

- [ ] **Step 3: Collega il modulo in `server/index.js`**

Dopo la riga `const { loadState, saveState, applyStartupDefault, DEFAULT_GRID } = require('./state');` aggiungi:

```js
const picsender = require('./picsender');
```

- [ ] **Step 4: Aggiungi i due campi di default alla route di upload**

L'attuale (dentro `app.post('/api/upload/image', ...)`):

```js
  location.images.push({
    id: nanoid(),
    name: req.body.name || req.file.originalname,
    file: req.file.filename
  });
```

diventa:

```js
  location.images.push({
    id: nanoid(),
    name: req.body.name || req.file.originalname,
    file: req.file.filename,
    caption: '',
    telegramDestination: null
  });
```

- [ ] **Step 5: Aggiungi la route proxy per le destinazioni**

Subito dopo la route `/api/upload/image` (prima di `const server = http.createServer(app);`):

```js
app.get('/api/telegram/destinations', async (req, res) => {
  try {
    const destinations = await picsender.getDestinations();
    res.json(destinations);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Aggiungi i tre nuovi eventi socket**

Subito dopo l'handler `socket.on('image:delete', ...)` (prima di `socket.on('view:pan', ...)`):

```js
  socket.on('image:caption', ({ locationId, imageId, caption }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.caption = String(caption || '').slice(0, 1024); // limite didascalia di Telegram
    saveState(state);
    broadcastState();
  });

  socket.on('image:destination', ({ locationId, imageId, destination }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.telegramDestination = destination || null;
    saveState(state);
    broadcastState();
  });

  socket.on('image:sendTelegram', async ({ locationId, imageId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) {
      socket.emit('telegram:sendResult', { imageId, ok: false, error: 'Immagine non trovata' });
      return;
    }
    const result = await picsender.sendImage({
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
    socket.emit('telegram:sendResult', { imageId, ok: result.ok, error: result.error });
  });
```

- [ ] **Step 7: Documenta la nuova variabile d'ambiente**

In `.env.example`, aggiungi una riga:

```
PICSENDER_URL=
```

(vuota di default — vedi commento nel README su `.env.example`/`.env` già esistente; nessun altro file da toccare).

- [ ] **Step 8: Verifica manuale con un finto server PicSender**

Non serve un vero Raspberry Pi per verificare questo task: crea un file temporaneo (fuori dal repo, es. `/tmp/fake-picsender.js`) con questo contenuto:

```js
// Finto server PicSender, solo per verificare il ciclo upload->send->delete.
// Non fa parte del repo: usalo e poi buttalo via.
const http = require('http');
let counter = 0;

http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/api/destinations') {
    return send(200, [{ index: 0, name: 'Test — Mappe' }, { index: 1, name: 'Test — Generale' }]);
  }
  if (req.method === 'POST' && req.url === '/api/upload') {
    counter += 1;
    req.on('data', () => {});
    req.on('end', () => send(200, { saved: [{ id: `fake${counter}` }], skipped: 0 }));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/send') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { console.log('FAKE SEND:', body); send(200, { ok: true }); });
    return;
  }
  if (req.method === 'DELETE' && req.url.startsWith('/api/images/')) {
    console.log('FAKE DELETE:', req.url);
    return send(200, { ok: true });
  }
  send(404, { error: 'not found' });
}).listen(5001, () => console.log('finto PicSender su :5001'));
```

Poi, in due terminali separati:

```bash
node /tmp/fake-picsender.js
```

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PICSENDER_URL=http://localhost:5001 PORT=3099 node server/index.js
```

Verifica con `curl`:
1. `curl http://localhost:3099/api/telegram/destinations` → deve rispondere `[{"index":0,"name":"Test — Mappe"},{"index":1,"name":"Test — Generale"}]`.
2. Crea una location con `curl -X POST http://localhost:3099/api/upload/image -F locationId=taverna -F name=prova -F file=@<un-qualsiasi-jpg-locale>` (usa `taverna`, la location di default) → verifica in `/tmp/anime-vtt-test-data/state.json` che l'immagine abbia `"caption": ""` e `"telegramDestination": null`.
3. Apri una connessione socket.io (es. dalla console del browser su `http://localhost:3099/editor`, che carica già `socket.io.js`) ed esegui:
   ```js
   const s = io();
   s.emit('image:caption', { locationId: 'taverna', imageId: '<id-immagine-dal-passo-2>', caption: 'una prova' });
   s.emit('image:destination', { locationId: 'taverna', imageId: '<id-immagine>', destination: 'Test — Mappe' });
   s.on('telegram:sendResult', console.log);
   s.emit('image:sendTelegram', { locationId: 'taverna', imageId: '<id-immagine>' });
   ```
   Nel terminale del finto server deve comparire `FAKE SEND: {"ids":["fake1"],"caption":"una prova","destination":0}` seguito da `FAKE DELETE: /api/images/fake1`; nella console del browser, `telegram:sendResult` deve arrivare con `{ok: true}`.
4. Ripeti l'invio (stesso `image:sendTelegram`): deve comparire un NUOVO `fake2` nel log (`counter` incrementato) — conferma che non c'è nessun id riusato tra un invio e l'altro.
5. Ferma il finto server (Ctrl+C) e ritenta `image:sendTelegram`: `telegram:sendResult` deve arrivare con `ok:false` e un `error` leggibile (niente crash del server anime-vtt — verificalo restando connesso e ripetendo il passo 1, che deve continuare a rispondere, seppur con errore 502).
6. Ferma anche il server anime-vtt di test e cancella `/tmp/anime-vtt-test-data` e `/tmp/anime-vtt-test-storage`.

- [ ] **Step 9: Commit**

```bash
git add server/picsender.js server/state.js server/index.js .env.example
git commit -m "feat: add PicSender integration for sending images to Telegram"
```

---

### Task 2: `/editor` — didascalia e destinazione per immagine

**Files:**
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: `GET /api/telegram/destinations` (Task 1), eventi socket `image:caption`/`image:destination` (Task 1), campi `image.caption`/`image.telegramDestination` (Task 1).
- Produces: nessuna interfaccia nuova per altri task (task foglia, pagina indipendente da `/control`).

- [ ] **Step 1: Aggiungi lo stato locale e il fetch una tantum delle destinazioni**

Dopo `window.addEventListener('resize', ...)` (circa riga 106, prima di `function getActiveLocation()`), aggiungi:

```js
// null = non ancora caricate; [] = caricate ma vuote, o PicSender non
// raggiungibile — in entrambi i casi la tendina destinazione va disabilitata.
let telegramDestinations = null;

fetch('/api/telegram/destinations')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
  .then((list) => { telegramDestinations = list; })
  .catch(() => { telegramDestinations = []; })
  .then(() => { if (state) render(); });
```

- [ ] **Step 2: Riscrivi `renderImageList` per includere didascalia e destinazione**

L'attuale funzione (righe 876-901):

```js
function renderImageList(location) {
  const images = location.images || [];
  if (!images.length) {
    imageList.innerHTML = '<p class="hint">nessuna immagine per questa location</p>';
    return;
  }
  imageList.innerHTML = images
    .map((img) => {
      const armed = armedImageDeletes.has(img.id);
      return `
        <div class="image-editor-row" data-id="${img.id}">
          <button class="image-thumb-btn" data-preview="${img.id}" title="Anteprima a schermo intero">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <svg class="icon thumb-overlay-icon"><use href="#i-expand"></use></svg>
          </button>
          <input type="text" class="image-name-input" value="${escapeHtml(img.name)}"
                 data-name-for="${img.id}" placeholder="etichetta">
          <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" data-delete="${img.id}"
                  title="${armed ? 'Click di nuovo per confermare' : 'Elimina immagine'}">
            <svg class="icon"><use href="#i-trash"></use></svg>
          </button>
        </div>
      `;
    })
    .join('');
}
```

diventa:

```js
function renderDestinationOptions(selectedName) {
  if (telegramDestinations === null) {
    return '<option value="">Caricamento…</option>';
  }
  if (!telegramDestinations.length) {
    return '<option value="">Destinazioni non disponibili</option>';
  }
  return ['<option value="">— scegli destinazione —</option>']
    .concat(
      telegramDestinations.map(
        (d) => `<option value="${escapeHtml(d.name)}" ${d.name === selectedName ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
      )
    )
    .join('');
}

function renderImageList(location) {
  const images = location.images || [];
  if (!images.length) {
    imageList.innerHTML = '<p class="hint">nessuna immagine per questa location</p>';
    return;
  }
  const destinationsUnavailable = telegramDestinations !== null && !telegramDestinations.length;
  imageList.innerHTML = images
    .map((img) => {
      const armed = armedImageDeletes.has(img.id);
      return `
        <div class="image-card" data-id="${img.id}">
          <div class="image-editor-row">
            <button class="image-thumb-btn" data-preview="${img.id}" title="Anteprima a schermo intero">
              <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
              <svg class="icon thumb-overlay-icon"><use href="#i-expand"></use></svg>
            </button>
            <input type="text" class="image-name-input" value="${escapeHtml(img.name)}"
                   data-name-for="${img.id}" placeholder="etichetta">
            <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" data-delete="${img.id}"
                    title="${armed ? 'Click di nuovo per confermare' : 'Elimina immagine'}">
              <svg class="icon"><use href="#i-trash"></use></svg>
            </button>
          </div>
          <div class="image-meta-row">
            <input type="text" class="image-caption-input" value="${escapeHtml(img.caption || '')}"
                   data-caption-for="${img.id}" placeholder="didascalia per Telegram">
            <select class="image-destination-select" data-destination-for="${img.id}" ${telegramDestinations === null || destinationsUnavailable ? 'disabled' : ''}>
              ${renderDestinationOptions(img.telegramDestination)}
            </select>
          </div>
        </div>
      `;
    })
    .join('');
}
```

- [ ] **Step 3: Estendi i listener `change` e `keydown` di `imageList`**

L'attuale:

```js
imageList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('image:rename', {
    locationId: state.activeLocationId,
    imageId: input.dataset.nameFor,
    name: input.value
  });
});
```

diventa:

```js
imageList.addEventListener('change', (e) => {
  const nameInput = e.target.closest('input[data-name-for]');
  if (nameInput) {
    socket.emit('image:rename', {
      locationId: state.activeLocationId,
      imageId: nameInput.dataset.nameFor,
      name: nameInput.value
    });
    return;
  }
  const captionInput = e.target.closest('input[data-caption-for]');
  if (captionInput) {
    socket.emit('image:caption', {
      locationId: state.activeLocationId,
      imageId: captionInput.dataset.captionFor,
      caption: captionInput.value
    });
    return;
  }
  const destinationSelect = e.target.closest('select[data-destination-for]');
  if (destinationSelect) {
    socket.emit('image:destination', {
      locationId: state.activeLocationId,
      imageId: destinationSelect.dataset.destinationFor,
      destination: destinationSelect.value || null
    });
  }
});
```

E l'attuale:

```js
imageList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for]')) e.target.blur();
});
```

diventa:

```js
imageList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for], input[data-caption-for]')) e.target.blur();
});
```

- [ ] **Step 4: Aggiungi le classi CSS in `public/editor/editor.css`**

Dopo la regola `.image-delete .icon { ... }` (circa riga 592-596, alla fine del blocco immagini), aggiungi:

```css
.image-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.image-meta-row {
  display: flex;
  gap: 8px;
}

.image-caption-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  font-size: 13px;
}

.image-destination-select {
  flex: 0 0 auto;
  min-width: 160px;
  height: 32px;
  font-size: 13px;
}
```

- [ ] **Step 5: Verifica manuale**

Con il finto server PicSender di Task 1 (`node /tmp/fake-picsender.js`, ricreando il file se l'hai già cancellato) e un server anime-vtt isolato (`DATA_DIR`/`STORAGE_DIR` temporanei come nello Step 8 di Task 1, `PICSENDER_URL=http://localhost:5001`):
1. Apri `/editor`, carica una foto: la riga appare subito con didascalia vuota e tendina destinazione popolata con "Test — Mappe"/"Test — Generale".
2. Scrivi una didascalia, esci dal campo (blur/Tab): verifica in `state.json` che `caption` sia salvata.
3. Scegli una destinazione dalla tendina: verifica in `state.json` che `telegramDestination` sia il nome scelto (es. `"Test — Mappe"`), non l'indice.
4. Ricarica la pagina `/editor`: didascalia e destinazione restano quelle salvate.
5. Ferma il finto server PicSender, ricarica `/editor`: la tendina mostra "Destinazioni non disponibili" ed è disabilitata; il resto della pagina resta utilizzabile (upload, rename, delete funzionano normalmente).

- [ ] **Step 6: Commit**

```bash
git add public/editor/editor.js public/editor/editor.css
git commit -m "feat: editable caption and Telegram destination per image in /editor"
```

---

### Task 3: `/control` — anteprima foto, tre pulsanti, invio a Telegram

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.js`
- Modify: `public/control/control.css`

**Interfaces:**
- Consumes: `GET /api/telegram/destinations`, eventi socket `image:caption`/`image:destination`/`image:sendTelegram`/`telegram:sendResult` (tutti da Task 1), campi `image.caption`/`image.telegramDestination` (Task 1). Riusa `getActiveLocation()`, `render()`, `escapeHtml()` già esistenti in `control.js`.
- Produces: nessuna interfaccia nuova per altri task (ultimo task del piano).

- [ ] **Step 1: Sostituisci il markup della scheda immagini in `public/control/index.html`**

L'attuale (righe 104-109):

```html
    <div class="tab-panel" data-tab="immagini">
      <section id="images-section">
        <div id="images-list" class="thumb-row"></div>
        <button id="back-to-map" class="primary">Torna alla mappa</button>
      </section>
    </div>
```

diventa:

```html
    <div class="tab-panel" data-tab="immagini">
      <section id="images-section">
        <div id="images-list" class="thumb-row"></div>

        <section id="image-detail" class="control-section" hidden>
          <img id="image-detail-preview" alt="">

          <div class="image-detail-field">
            <label for="image-caption-input">Didascalia</label>
            <input type="text" id="image-caption-input" placeholder="didascalia per Telegram">
          </div>

          <div class="image-detail-field">
            <label for="image-destination-select">Destinazione Telegram</label>
            <select id="image-destination-select"></select>
          </div>

          <div class="image-detail-actions">
            <button id="image-show-btn" class="btn-accent">Mostra</button>
            <button id="image-send-btn" class="btn-accent">Invia</button>
            <button id="image-hide-btn" class="primary">Ritorna alla mappa</button>
          </div>
          <p id="image-send-feedback" class="image-send-feedback" hidden></p>
        </section>
      </section>
    </div>
```

- [ ] **Step 2: Aggiungi i riferimenti DOM in `control.js`**

Sostituisci le righe:

```js
const backToMapBtn = document.getElementById('back-to-map');
```

con:

```js
const imageDetail = document.getElementById('image-detail');
const imageDetailPreview = document.getElementById('image-detail-preview');
const imageCaptionInput = document.getElementById('image-caption-input');
const imageDestinationSelect = document.getElementById('image-destination-select');
const imageShowBtn = document.getElementById('image-show-btn');
const imageSendBtn = document.getElementById('image-send-btn');
const imageHideBtn = document.getElementById('image-hide-btn');
const imageSendFeedback = document.getElementById('image-send-feedback');
```

(Ogni riferimento a `backToMapBtn` più avanti nel file viene rimosso/sostituito negli step successivi — non resta alcun uso di `back-to-map`.)

- [ ] **Step 3: Aggiungi lo stato locale e il fetch delle destinazioni**

Dopo `let previewLocationId = null;` (circa riga 105), aggiungi:

```js
let previewImageId = null;
let telegramDestinations = null; // null = non ancora caricate; [] = vuote/non disponibili
let telegramSendPending = false;
let telegramSendFeedback = null; // { imageId, ok, error } dell'ultimo invio, o null
let telegramSendFeedbackTimeout = null;

fetch('/api/telegram/destinations')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
  .then((list) => { telegramDestinations = list; })
  .catch(() => { telegramDestinations = []; })
  .then(() => { if (state) render(); });

function getPreviewImage(location) {
  return ((location && location.images) || []).find((i) => i.id === previewImageId) || null;
}
```

- [ ] **Step 4: Ascolta `telegram:sendResult`**

Accanto agli altri `socket.on(...)` in cima al file (dopo `socket.on('state:update', ...)`), aggiungi:

```js
socket.on('telegram:sendResult', ({ imageId, ok, error }) => {
  telegramSendPending = false;
  telegramSendFeedback = { imageId, ok, error };
  render();
  clearTimeout(telegramSendFeedbackTimeout);
  telegramSendFeedbackTimeout = setTimeout(() => {
    telegramSendFeedback = null;
    render();
  }, 4000);
});
```

- [ ] **Step 5: Aggiorna `render()` — reset selezione, griglia thumbnail, chiamata al pannello**

Nella funzione `render()`, subito dopo la riga `const location = getActiveLocation();` (circa riga 119), aggiungi il reset della selezione:

```js
  if (previewImageId && !((location && location.images) || []).some((i) => i.id === previewImageId)) {
    previewImageId = null;
  }
```

Poi sostituisci il blocco `imagesList.innerHTML = ...` esistente:

```js
  imagesList.innerHTML =
    ((location && location.images) || [])
      .map(
        (img) => `
          <button class="image-thumb ${state.activeImageId === img.id ? 'active' : ''}" data-id="${img.id}">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <span class="image-thumb-label">${escapeHtml(img.name)}</span>
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';
```

con:

```js
  imagesList.innerHTML =
    ((location && location.images) || [])
      .map(
        (img) => `
          <button class="image-thumb ${state.activeImageId === img.id ? 'active' : ''} ${previewImageId === img.id ? 'selected' : ''}" data-id="${img.id}">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <span class="image-thumb-label">${escapeHtml(img.name)}</span>
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';

  renderImageDetail(getPreviewImage(location));
```

- [ ] **Step 6: Aggiungi `renderImageDetail` e `renderDestinationOptions`**

Subito dopo la parentesi graffa che chiude `render()` (la riga `}` che precede il commento `// The wrap element's CSS rotate() transform...` sopra `renderFogOverlays`), aggiungi:

```js
function renderDestinationOptions(selectedName) {
  if (telegramDestinations === null) {
    return '<option value="">Caricamento…</option>';
  }
  if (!telegramDestinations.length) {
    return '<option value="">Destinazioni non disponibili</option>';
  }
  return ['<option value="">— scegli destinazione —</option>']
    .concat(
      telegramDestinations.map(
        (d) => `<option value="${escapeHtml(d.name)}" ${d.name === selectedName ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
      )
    )
    .join('');
}

function renderImageDetail(previewImage) {
  imageDetail.hidden = !previewImage;
  if (!previewImage) return;

  imageDetailPreview.src = `/storage/images/${previewImage.file}`;
  imageDetailPreview.alt = previewImage.name || '';

  imageCaptionInput.value = previewImage.caption || '';

  const destinationsUnavailable = telegramDestinations !== null && !telegramDestinations.length;
  imageDestinationSelect.innerHTML = renderDestinationOptions(previewImage.telegramDestination);
  imageDestinationSelect.disabled = telegramDestinations === null || destinationsUnavailable;

  imageShowBtn.classList.toggle('is-live', state.activeImageId === previewImage.id);
  imageHideBtn.disabled = !state.activeImageId;

  const hasDestination = Boolean(previewImage.telegramDestination);
  imageSendBtn.disabled = !hasDestination || telegramSendPending;
  imageSendBtn.textContent = telegramSendPending ? 'Invio…' : 'Invia';

  if (telegramSendFeedback && telegramSendFeedback.imageId === previewImage.id) {
    imageSendFeedback.hidden = false;
    imageSendFeedback.textContent = telegramSendFeedback.ok ? 'Inviata ✓' : (telegramSendFeedback.error || 'Invio fallito');
    imageSendFeedback.classList.toggle('error', !telegramSendFeedback.ok);
  } else {
    imageSendFeedback.hidden = true;
  }
}
```

- [ ] **Step 7: Sostituisci i listener della griglia immagini e del vecchio pulsante "Torna alla mappa"**

L'attuale:

```js
imagesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-thumb');
  if (btn) socket.emit('image:show', { imageId: btn.dataset.id });
});

backToMapBtn.addEventListener('click', () => socket.emit('image:hide'));
```

diventa:

```js
imagesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-thumb');
  if (!btn) return;
  previewImageId = btn.dataset.id;
  render();
});

imageShowBtn.addEventListener('click', () => {
  if (!previewImageId) return;
  socket.emit('image:show', { imageId: previewImageId });
});

imageHideBtn.addEventListener('click', () => socket.emit('image:hide'));

imageSendBtn.addEventListener('click', () => {
  const previewImage = getPreviewImage(getActiveLocation());
  if (!previewImage || !previewImage.telegramDestination || telegramSendPending) return;
  telegramSendPending = true;
  telegramSendFeedback = null;
  socket.emit('image:sendTelegram', { locationId: state.activeLocationId, imageId: previewImage.id });
  render();
});

imageCaptionInput.addEventListener('change', () => {
  if (!previewImageId) return;
  socket.emit('image:caption', {
    locationId: state.activeLocationId,
    imageId: previewImageId,
    caption: imageCaptionInput.value
  });
});

imageDestinationSelect.addEventListener('change', () => {
  if (!previewImageId) return;
  socket.emit('image:destination', {
    locationId: state.activeLocationId,
    imageId: previewImageId,
    destination: imageDestinationSelect.value || null
  });
});
```

- [ ] **Step 8: Aggiungi le classi CSS in `public/control/control.css`**

Dopo la regola `.image-thumb img { ... }` (circa riga 530-535, fine del blocco "immagini (scheda)"), aggiungi:

```css
.image-thumb.selected {
  box-shadow: 0 0 0 2px var(--text-primary);
}

#image-detail-preview {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--bg-canvas);
  margin-bottom: 10px;
}

.image-detail-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}

.image-detail-field label {
  font-size: 12px;
  color: var(--text-secondary);
}

.image-detail-field input,
.image-detail-field select {
  height: 40px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  font-size: 14px;
}

.image-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.image-detail-actions button {
  flex: 1;
  min-width: 100px;
}

.image-send-feedback {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--accent);
}

.image-send-feedback.error {
  color: var(--danger-text);
}
```

E dopo la regola `button.confirm { ... }` (circa riga 556-560), aggiungi:

```css
.btn-accent {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.btn-accent:disabled {
  opacity: 0.4;
}

.btn-accent.is-live {
  background: var(--accent-bg-subtle);
  color: var(--accent);
}
```

- [ ] **Step 9: Verifica manuale**

Con lo stesso finto PicSender e server anime-vtt isolato di Task 1/2 (immagine già caricata da `/editor` con didascalia e destinazione assegnate):
1. Apri `/control`, scheda "Immagini": la griglia mostra la foto, nessun pannello sotto (nessuna selezione di default).
2. Tocca la thumbnail: si apre il pannello con l'immagine ingrandita, la didascalia e la destinazione già assegnate da `/editor`, e i tre pulsanti. **Verifica che `/display` non sia cambiato** (apri anche `/display` in un'altra scheda del browser prima di questo passo).
3. Premi "Mostra": ora `/display` mostra la foto; il pulsante "Mostra" assume lo stato "già in mostra" (classe `is-live`).
4. Cambia la didascalia dal pannello di `/control`, esci dal campo: riapri `/editor` e verifica che la didascalia sia aggiornata anche lì (stato condiviso via socket).
5. Premi "Invia": il pulsante mostra "Invio…" poi torna a "Invia" con il messaggio "Inviata ✓"; nel terminale del finto PicSender compaiono `FAKE SEND`/`FAKE DELETE`.
6. Premi "Ritorna alla mappa": `/display` torna a mostrare la mappa; il pulsante "Ritorna alla mappa" diventa disabilitato (niente più mostrato).
7. Rimuovi la destinazione dal pannello (tendina su "— scegli destinazione —"): il pulsante "Invia" diventa disabilitato.
8. Ferma il finto PicSender, riprova "Invia" (con destinazione riassegnata): il messaggio d'errore leggibile compare sotto ai pulsanti, nessun crash lato server o client.
9. Cambia location dal menu in alto (con quella nuova che non ha nessuna foto in comune): la scheda Immagini torna senza pannello aperto (nessuna foto vecchia "fantasma" selezionata).

- [ ] **Step 10: Commit**

```bash
git add public/control/index.html public/control/control.js public/control/control.css
git commit -m "feat: photo preview panel in /control with Telegram send"
```
