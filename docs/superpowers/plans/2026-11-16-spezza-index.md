# Fase 4: spezzare `server/index.js`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare i 64 handler socket e le rotte HTTP più lunghe di `server/index.js` in moduli separati, senza cambiare il comportamento. Alla fine `index.js` contiene solo avvio, cablaggio e stato condiviso.

**Architecture:** ogni gruppo di eventi va in un file `server/socket-<gruppo>.js` che esporta `register<Gruppo>Events(socket, ctx)`. Lo schema è quello di `registerTelegramRoutes(app, { config, client })` in `server/telegram-routes.js`: una funzione che riceve l'oggetto su cui registrare e un oggetto di dipendenze, e registra. `index.js` costruisce il contesto una volta sola (`socketCtx`) e, dentro `io.on('connection')`, chiama le funzioni di registrazione dopo `auth.socketGuard` e `protectSocketHandlers`. Le rotte di upload e di backup seguono lo stesso schema in `server/routes-storage.js` e `server/routes-backup.js` con un contesto `httpCtx`.

**Tech Stack:** Node 24, Express 4, socket.io 4.8, `node:test`. Nessuna dipendenza nuova.

**Spec:** sezione «Fase 4» di `docs/superpowers/plans/2026-11-11-piano-generale.md` (file non tracciato nel checkout principale). Rete di sicurezza: `docs/superpowers/plans/2026-11-15-test-socket.md` e `server/socket-events.test.js`.

## Global Constraints

- Branch `spezza-index`, creato da `minori-noti`. Niente push, niente merge, niente `git stash`.
- Nei commit nessuna riga `Co-Authored-By` né altre righe di attribuzione.
- **Nessun cambio di comportamento.** Il codice degli handler si sposta così com'è. Le uniche righe nuove ammesse dentro un handler sono quelle della tabella «Sostituzioni ammesse» qui sotto. I BUG noti del piano dei test socket NON si correggono.
- **Test della fase 2 intoccabili:** `git diff minori-noti -- server/socket-events.test.js server/test-support/` deve restare vuoto a ogni commit.
- `npm test` dalla radice verde prima di OGNI commit.
- Un gruppo per commit, nell'ordine dei task.
- Mai i dati veri (`data/`, `storage/`), mai la porta 3000. I test avviano già il server su cartelle temporanee: non serve avviarlo a mano.
- Regola dei due fallimenti: se un task fallisce due volte (test rossi dopo due tentativi di correzione), fermarsi, non committare e riferire.
- Nei comandi di questo piano si scrive `command grep`: su questa macchina `grep` può essere un alias di `rg`.

## Decisioni

| Tema | Decisione |
|---|---|
| Dove vanno i moduli | Direttamente in `server/`, non in una sottocartella. Il test «copertura» di `socket-events.test.js` legge solo `server/*.js` (`fs.readdirSync(__dirname)`, non ricorsivo) e salta i `*.test.js`. Un modulo in `server/socket/` farebbe sparire i suoi eventi dal conteggio e il test fallirebbe. |
| Nomi dei file | `server/socket-<gruppo>.js` e `server/routes-<gruppo>.js`. Mai un nome che finisce in `.test.js`. |
| Firma | `function register<Gruppo>Events(socket, { ...solo le dipendenze usate })`, poi `module.exports = { register<Gruppo>Events };`. Si passa sempre l'intero `socketCtx`; il modulo destruttura nella firma solo ciò che usa (come `registerTelegramRoutes`). |
| Come si scrive `socket.on` | Sempre letterale: `socket.on('nome:evento', ...)` con apici singoli, sul parametro che si chiama `socket`. Niente tabelle di eventi registrate in un ciclo, niente `const on = socket.on`. Il test «copertura» cerca la regex `socket\.on\(\s*'([^']+)'`. |
| Lettura dello stato | Dentro ogni handler che usa `state`, la prima riga è `const state = getState();`. Il resto del corpo resta identico. Mai leggere lo stato nel corpo della funzione di registrazione o a livello di modulo: il ripristino di un backup riassegna `state` e un socket già connesso resterebbe sul vecchio oggetto. |
| Cosa resta in `index.js` | `let state`, `displayViewport`, `displayAudio`, i Set `controlSockets`/`displaySockets`, `statePayload`, `broadcastState`, `scheduleSaveAndBroadcast` col suo timer, `broadcastControlStatus`, `broadcastDisplayStatus`, `protectSocketHandlers`, `getActiveLocation`, le migrazioni d'avvio (`audioContentKey`, `copyHandoutFile`, `migrateOptions`), Express con statici e le rotte corte (`/`, `/api/state`, `/api/info`, `/api/settings`, `/api/webproxy`). |
| Throttle | `scheduleSaveAndBroadcast`, `saveBroadcastTimer` e `lastSaveBroadcastAt` restano in `index.js`. È UN throttle condiviso da `view:pan`, `aoe:move` e `shader:move`: un timer per modulo cambierebbe il comportamento. |
| Variabili riassegnate | `state`, `displayViewport`, `displayAudio` sono `let` riassegnate: nel contesto vanno solo come getter/setter. I Set e `io` sono `const`: si passano direttamente. |
| Costanti | Ogni costante va nel modulo che la usa. `MAX_AOE_SIZE_M` serve ad AoE e shader: la definisce ed esporta `socket-aoe.js`, `socket-shader.js` la importa da lì. |
| Funzioni pure di altri moduli | Si importano con `require` nel modulo che le usa (`nanoid`, `DEFAULT_GRID`, `audioModel`, `handoutModel`, `sendStoredMedia`, `normalizeDisplayAudioStatus`, `migrate`, `applyStartupDefault`...). `saveState` invece passa dal contesto, come chiesto dal piano generale. |
| Ordine di registrazione | La chiamata `register...(socket, socketCtx)` va dove stava il primo handler del gruppo. L'ordine tra eventi diversi non conta (un solo handler per nome di evento, socket.io smista per nome), ma conta che `auth.socketGuard(socket)` e `protectSocketHandlers(socket)` vengano PRIMA di ogni registrazione. |
| Gruppi diversi dal piano generale | `mapScale:set`, `mapFlip:toggle`, `mapRotate90:toggle` vanno con griglia e bussola (sono contigui a `grid:update` in `index.js` e sono tutti geometria della mappa scelta da /editor). `gridPreset:*` va con la griglia. `ping:show` va con la vista (gesto sulla mappa dal vivo). Si aggiunge un gruppo «presenza» per `hello`, `display:viewport`, `disconnect`. `audio:status` e `audio:oneshotEnded` vanno con l'audio. |
| Rotte HTTP | Fuori dall'elenco dei gruppi, ma il criterio «solo avvio, cablaggio e stato condiviso» le include: due task finali le spostano. `/api/settings` (7 righe) e le altre rotte corte restano in `index.js`. |

## Sostituzioni ammesse (le uniche modifiche dentro il codice spostato)

| Nel codice originale | Nel modulo |
|---|---|
| (handler che legge `state`) | prima riga del corpo: `const state = getState();` |
| `displayViewport = { width, height };` | `setDisplayViewport({ width, height });` |
| `if (displayAudio && JSON.stringify(displayAudio) === JSON.stringify(next)) return;` | `const current = getDisplayAudio();` poi `if (current && JSON.stringify(current) === JSON.stringify(next)) return;` |
| `displayAudio = next;` | `setDisplayAudio(next);` |
| `if (displayAudio \|\| cleared) {` / `displayAudio = null;` | `if (getDisplayAudio() \|\| cleared) {` / `setDisplayAudio(null);` |
| `state = candidate;` (solo `/api/import/apply`) | `setState(candidate);` (vedi Task 12) |

Tutto il resto (commenti sopra gli handler compresi) si copia carattere per carattere. I default `= {}` nei parametri, `async` su `image:sendTelegram` e le funzioni freccia restano come sono.

## Il contesto `socketCtx` (Task 1)

In `server/index.js`, subito PRIMA di `io.on('connection', (socket) => {` (dopo `protectSocketHandlers`), aggiungere:

```js
// Dipendenze dei moduli server/socket-*.js. `state`, `displayViewport` e
// `displayAudio` vengono riassegnati (ripristino di un backup, display che
// riporta il suo stato): i moduli li leggono solo tramite questi getter.
const socketCtx = {
  getState: () => state,
  saveState,
  broadcastState,
  scheduleSaveAndBroadcast,
  statePayload,
  getActiveLocation,
  io,
  controlSockets,
  displaySockets,
  broadcastControlStatus,
  broadcastDisplayStatus,
  setDisplayViewport: (value) => { displayViewport = value; },
  getDisplayAudio: () => displayAudio,
  setDisplayAudio: (value) => { displayAudio = value; },
  deleteUploadedFile,
  IMAGES_DIR,
  HANDOUT_DIR,
  AUDIO_DIR,
  telegramConfig,
  telegramClient
};
```

Deve stare dopo `const io = new Server(server);` e dopo `let displayViewport` / `let displayAudio`: `io` viene letto quando si crea l'oggetto, e prima di quella riga è in zona morta (ReferenceError all'avvio).

## Modello di modulo (da copiare per ogni gruppo)

```js
// Eventi socket delle location. Registrati da io.on('connection') in
// server/index.js, dopo auth.socketGuard e protectSocketHandlers: `socket.on`
// qui è già quello protetto. Lo stato si legge con getState() dentro ogni
// handler, mai fuori (il ripristino di un backup lo riassegna).
const { nanoid } = require('nanoid');
const { DEFAULT_GRID, DEFAULT_COMPASS } = require('./state');
const audioModel = require('./audio');

function registerLocationEvents(socket, { getState, saveState, broadcastState, statePayload }) {
  socket.on('location:set', ({ locationId }) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === locationId);
    // ... resto del corpo identico all'originale ...
  });

  // ... gli altri handler del gruppo, nello stesso ordine di index.js ...
}

module.exports = { registerLocationEvents };
```

L'indentazione dentro `io.on('connection')` è già di due spazi: i blocchi si incollano nel corpo della funzione senza cambiarla.

## Verifiche ripetute (le chiamiamo «V»)

Da eseguire dalla radice del worktree alla fine di OGNI task, prima del commit:

1. Conteggio degli eventi per file (stessa regex del test «copertura»):
   ```bash
   node -e "const fs=require('fs');const c={};let n=0;for(const f of fs.readdirSync('server').sort()){if(!f.endsWith('.js')||f.endsWith('.test.js'))continue;const k=[...fs.readFileSync('server/'+f,'utf8').matchAll(/socket\.on\(\s*'([^']+)'/g)].length;if(k){c[f]=k;n+=k}}console.log(n,JSON.stringify(c))"
   ```
   Il totale deve essere sempre `64`; `index.js` deve avere il numero indicato nel task.
2. Stesso elenco di nomi di prima:
   ```bash
   node -e "const fs=require('fs');const out=[];for(const f of fs.readdirSync('server')){if(!f.endsWith('.js')||f.endsWith('.test.js'))continue;for(const m of fs.readFileSync('server/'+f,'utf8').matchAll(/socket\.on\(\s*'([^']+)'/g))out.push(m[1])}console.log(out.sort().join('\n'))" > "$SCRATCH/eventi-dopo.txt" && diff "$SCRATCH/eventi-prima.txt" "$SCRATCH/eventi-dopo.txt" && echo STESSI-EVENTI
   ```
   (`$SCRATCH` è una cartella temporanea fuori dal repo, la stessa del Task 0.)
3. Nessuna lettura dello stato fuori dagli handler:
   ```bash
   command grep -nE "^(  )?const state = getState" server/socket-*.js server/routes-*.js 2>/dev/null; echo "righe sopra: devono essere zero"
   ```
   Dentro un handler la riga ha almeno 4 spazi di rientro; con 0 o 2 spazi è a livello di modulo o di funzione di registrazione: SBAGLIATO.
4. Nessuna riassegnazione di `state` nei moduli e nessun nome riassegnato letto direttamente:
   ```bash
   command grep -nE "(^|[^.a-zA-Z_])state = |displayAudio|displayViewport" server/socket-*.js server/routes-*.js 2>/dev/null; echo "righe sopra: devono essere zero"
   ```
   (`getDisplayAudio`, `setDisplayAudio` e `setDisplayViewport` non corrispondono: hanno la D maiuscola. Non citare `displayAudio` nemmeno nei commenti dei moduli.)
5. Test della fase 2 intatti: `git diff minori-noti -- server/socket-events.test.js server/test-support/` non stampa niente.
6. `npm test` verde.
7. Il modulo nuovo si carica da solo: `node -e "require('./server/socket-<gruppo>.js')"` non stampa errori.

---

### Task 0: preparazione (nessun commit)

- [ ] Controllare di essere su `spezza-index` (`git branch --show-current`) e che `git status` sia pulito.
- [ ] Installare le dipendenze nel worktree se mancano: `npm ci` dalla radice e `npm --prefix editor-app ci`.
- [ ] `npm test` verde sul punto di partenza. Se è rosso: fermarsi e riferire (il problema è prima di questo lavoro).
- [ ] Scegliere una cartella temporanea fuori dal repo e tenerla in `SCRATCH` (per esempio la scratchpad della sessione). Salvare l'elenco degli eventi di partenza con il comando V2, ma scrivendo in `"$SCRATCH/eventi-prima.txt"`. Deve avere 64 righe (`wc -l`).
- [ ] Copiare `server/index.js` in `"$SCRATCH/index-originale.js"`: serve come riferimento per copiare i blocchi.

### Task 1: contesto e location

**Files:** Modify `server/index.js`; Create `server/socket-location.js`

**Eventi (8, contigui in `index.js`):** da `socket.on('location:set'` fino alla fine di `socket.on('location:reorder'` (subito prima di `socket.on('fow:toggle'`): `location:set`, `location:create`, `location:rename`, `location:archive`, `location:restore`, `location:delete`, `location:setDefault`, `location:reorder`.

**Firma:** `registerLocationEvents(socket, { getState, saveState, broadcastState, statePayload })`

**Require nel modulo:** `nanoid`, `{ DEFAULT_GRID, DEFAULT_COMPASS }` da `./state`, `audioModel` da `./audio`.

- [ ] Aggiungere `socketCtx` in `index.js` come nella sezione «Il contesto `socketCtx`».
- [ ] Creare `server/socket-location.js` col modello sopra, incollare gli 8 handler e aggiungere `const state = getState();` come prima riga di ognuno (tutti e 8 usano `state`).
- [ ] Attenzione: `location:delete` e `location:reorder` scrivono `state.locations = ...`. È l'assegnazione di una proprietà dell'oggetto vivo: va bene così, non toccarla.
- [ ] `location:reorder` usa `socket.emit('state:update', statePayload())`: `statePayload` viene dal contesto.
- [ ] In `index.js` togliere il blocco e mettere al suo posto `registerLocationEvents(socket, socketCtx);`. In cima a `index.js` aggiungere `const { registerLocationEvents } = require('./socket-location');` sotto gli altri `require` locali.
- [ ] Non togliere ancora da `index.js` i `require` che sembrano inutilizzati (`DEFAULT_GRID`, ecc.): si fa nel Task 13, tutto insieme.
- [ ] V1 (`index.js`: 56, totale 64), V2–V7.
- [ ] Commit: `refactor(server): eventi location in socket-location.js e contesto dei moduli socket`

### Task 2: fog

**Files:** Modify `server/index.js`; Create `server/socket-fog.js`

**Eventi (2, contigui):** `fow:toggle`, `fow:setAll`.

**Firma:** `registerFogEvents(socket, { getState, saveState, broadcastState })`

- [ ] Spostare i due handler, `const state = getState();` in testa a ognuno.
- [ ] Al loro posto in `index.js`: `registerFogEvents(socket, socketCtx);` e il `require` in cima.
- [ ] V1 (`index.js`: 54), V2–V7.
- [ ] Commit: `refactor(server): eventi fog in socket-fog.js`

### Task 3: immagini e handout

**Files:** Modify `server/index.js`; Create `server/socket-images.js`

**Eventi (11, contigui):** da `socket.on('image:show'` fino alla fine di `socket.on('image:sendTelegram'` (subito prima di `socket.on('view:pan'`): `image:show`, `handout:setDefault`, `handoutLibrary:update`, `handoutLibrary:delete`, `image:hide`, `image:rename`, `image:delete`, `image:reorder`, `image:caption`, `image:destination`, `image:sendTelegram`. Gli handout stanno in mezzo alle immagini in `index.js`: si spostano insieme per non riordinare il codice, e il piano generale li mette nello stesso gruppo.

**Firma:** `registerImageEvents(socket, { getState, saveState, broadcastState, getActiveLocation, deleteUploadedFile, IMAGES_DIR, HANDOUT_DIR, telegramConfig, telegramClient })`

**Require nel modulo:** `path`, `handoutModel` da `./handout`, `{ sendStoredMedia }` da `./telegram-routes`.

- [ ] Spostare gli 11 handler con i loro commenti. `const state = getState();` in testa a tutti e 11: anche `image:show` e `image:hide` usano `state.activeImageId`.
- [ ] `image:show` usa `getActiveLocation()` dal contesto (legge lo stato vivo quando viene chiamata: va bene).
- [ ] `image:sendTelegram` resta `async`: `protectSocketHandlers` intercetta i rifiuti della promise solo se l'handler restituisce la promise. Lo stato si legge solo prima dell'`await`: lasciare la riga `const state = getState();` in testa.
- [ ] I default `= {}` di `handout:setDefault`, `handoutLibrary:update`, `handoutLibrary:delete` restano.
- [ ] In `index.js`: `registerImageEvents(socket, socketCtx);` al posto del blocco, `require` in cima.
- [ ] V1 (`index.js`: 43), V2–V7.
- [ ] Commit: `refactor(server): eventi immagini e handout in socket-images.js`

### Task 4: vista

**Files:** Modify `server/index.js`; Create `server/socket-view.js`

**Eventi (4, NON contigui):** `view:pan`, `view:zoom`, `view:reset` (contigui, subito prima di `polygon:create`) e `ping:show` (più in basso, dopo `shader:restore` e prima di `audio:toggle`).

**Firma:** `registerViewEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast, io })`

- [ ] Spostare i tre `view:*` e poi `ping:show` (con tutto il suo lungo commento) in fondo al modulo. `const state = getState();` in testa a tutti e quattro (`ping:show` legge `state.activeLocationId`).
- [ ] `view:pan` e `view:zoom` chiamano `scheduleSaveAndBroadcast()` del contesto. NON copiare la funzione né il suo timer nel modulo.
- [ ] `ping:show` usa `io.emit(...)` del contesto: è `io`, non `socket` (va a tutti).
- [ ] In `index.js`: `registerViewEvents(socket, socketCtx);` dove stava `view:pan`; togliere anche il blocco di `ping:show` dalla sua posizione.
- [ ] V1 (`index.js`: 39), V2–V7.
- [ ] Commit: `refactor(server): eventi vista e ping in socket-view.js`

### Task 5: poligoni

**Files:** Modify `server/index.js`; Create `server/socket-polygons.js`

**Eventi (5, contigui):** `polygon:create`, `polygon:update`, `polygon:delete`, `polygon:restore`, `polygon:reorder`.

**Firma:** `registerPolygonEvents(socket, { getState, saveState, broadcastState, statePayload })`

**Require nel modulo:** `nanoid`.

- [ ] Spostare i 5 handler con i commenti (quello lungo sopra `polygon:restore` compreso). `const state = getState();` in testa a ognuno.
- [ ] `polygon:reorder` usa `socket.emit('state:update', statePayload())` due volte: `statePayload` dal contesto.
- [ ] In `index.js`: `registerPolygonEvents(socket, socketCtx);` e `require`.
- [ ] V1 (`index.js`: 34), V2–V7.
- [ ] Commit: `refactor(server): eventi poligoni in socket-polygons.js`

### Task 6: mappa, griglia e bussola

**Files:** Modify `server/index.js`; Create `server/socket-grid.js`

**Eventi (7, in due blocchi):** `mapScale:set`, `mapFlip:toggle`, `mapRotate90:toggle`, `grid:update`, `compass:update` (contigui, dopo `polygon:reorder` e prima di `aoe:place`) e `gridPreset:save`, `gridPreset:apply` (contigui, dopo `audio:oneshotEnded` e prima di `disconnect`).

**Firma:** `registerGridEvents(socket, { getState, saveState, broadcastState })`

- [ ] Spostare il primo blocco, poi i due `gridPreset:*` in fondo al modulo. `const state = getState();` in testa a tutti e 7.
- [ ] `grid:update` ha una lista lunga di parametri e due commenti interni: copiarlo intero, i BUG noti 4 e 9 (nessuna validazione) restano.
- [ ] In `index.js`: `registerGridEvents(socket, socketCtx);` dove stava `mapScale:set`; togliere anche il blocco `gridPreset:*`.
- [ ] V1 (`index.js`: 27), V2–V7.
- [ ] Commit: `refactor(server): eventi mappa, griglia e bussola in socket-grid.js`

### Task 7: aree d'effetto

**Files:** Modify `server/index.js`; Create `server/socket-aoe.js`

**Eventi (9, contigui):** dal commento «Gli AoE sono persistiti...» sopra `aoe:place` fino alla fine di `aoe:remove`: `aoe:place`, `aoe:move`, `aoe:rotate`, `aoe:resize`, `aoe:setColor`, `aoe:setShapeVisible`, `aoe:setShaderOverride`, `aoe:setCast`, `aoe:remove`.

**Firma:** `registerAoeEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast })`

**Nel modulo, a livello di modulo:**
```js
const { nanoid } = require('nanoid');
const { AOE_COLORS, AOE_SHADER_OVERRIDE_IDS } = require('../public/shared/media.js');

// Limite di sicurezza per gli AoE: una taglia enorme (o Infinity) farebbe
// iterare aoeAffectedCells su un numero di celle spropositato lato client.
const MAX_AOE_SIZE_M = 300;
const AOE_COLOR_NAMES = Object.keys(AOE_COLORS);
```
e in fondo `module.exports = { registerAoeEvents, MAX_AOE_SIZE_M };`.

- [ ] Spostare i 9 handler con i commenti. `const state = getState();` in testa a ognuno.
- [ ] `aoe:move` usa `scheduleSaveAndBroadcast()` del contesto (lo stesso timer di `view:pan`).
- [ ] In `index.js` NON togliere ancora `MAX_AOE_SIZE_M` né `AOE_COLOR_NAMES`: gli shader (ancora in `index.js`) usano `MAX_AOE_SIZE_M`. Si tolgono nel Task 8 e nel Task 13.
- [ ] Gli eventi `aoe:*` sono pubblici col PIN acceso (`isPublicSocketEvent` in `auth.js` controlla il prefisso `aoe:`): non rinominarli.
- [ ] In `index.js`: `registerAoeEvents(socket, socketCtx);` e `require`.
- [ ] V1 (`index.js`: 18), V2–V7.
- [ ] Commit: `refactor(server): eventi delle aree d'effetto in socket-aoe.js`

### Task 8: decorazioni shader

**Files:** Modify `server/index.js`; Create `server/socket-shader.js`

**Eventi (5, contigui):** dal commento «Decorazioni shader: scenografia persistente...» fino alla fine di `shader:restore`: `shader:place`, `shader:move`, `shader:resize`, `shader:remove`, `shader:restore`.

**Firma:** `registerShaderEvents(socket, { getState, saveState, broadcastState, scheduleSaveAndBroadcast })`

**Nel modulo, a livello di modulo:**
```js
const { nanoid } = require('nanoid');
const { MAX_AOE_SIZE_M } = require('./socket-aoe');

// (commento originale sopra SHADER_IDS in index.js, copiato intero)
const SHADER_IDS = ['portal', 'portal_red', 'green_fire', 'magic_circle_red', 'magic_circle_blue', 'magic_circle_green'];
const SHADER_MIN_SIZE_M = 0.5;
```

- [ ] Spostare i 5 handler. `const state = getState();` in testa a ognuno.
- [ ] `shader:move` usa `scheduleSaveAndBroadcast()` del contesto.
- [ ] In `index.js` togliere le costanti `SHADER_IDS`, `SHADER_MIN_SIZE_M` (col loro commento), `MAX_AOE_SIZE_M` (col suo commento) e `AOE_COLOR_NAMES`: ora nessuno le usa più lì. Controllo: `command grep -nE "SHADER_IDS|SHADER_MIN_SIZE_M|MAX_AOE_SIZE_M|AOE_COLOR_NAMES" server/index.js` non stampa niente.
- [ ] In `index.js`: `registerShaderEvents(socket, socketCtx);` e `require`.
- [ ] V1 (`index.js`: 13), V2–V7.
- [ ] Commit: `refactor(server): eventi delle decorazioni shader in socket-shader.js`

### Task 9: audio

**Files:** Modify `server/index.js`; Create `server/socket-audio.js`

**Eventi (10, in due blocchi):** `audio:status` (con il suo commento, tra `display:viewport` e il punto dove stava `location:set`) e il blocco da «Audio a righe...» sopra `audio:toggle` fino alla fine di `audio:oneshotEnded`: `audio:toggle`, `audio:volume`, `audio:update`, `audio:delete`, `audio:add`, `audio:copyFrom`, `audioLibrary:update`, `audioLibrary:delete`, `audio:oneshotEnded`.

**Firma:** `registerAudioEvents(socket, { getState, saveState, broadcastState, getActiveLocation, displaySockets, getDisplayAudio, setDisplayAudio, deleteUploadedFile, AUDIO_DIR })`

**Require nel modulo:** `audioModel` da `./audio`, `{ normalizeDisplayAudioStatus }` da `../public/shared/audio-fade.js`.

- [ ] Prima nel modulo `audio:status`, poi gli altri 9 nell'ordine di `index.js`.
- [ ] `audio:status` NON usa `state`: niente `getState()`. Applicare le sostituzioni di `displayAudio` della tabella. Il corpo diventa:
  ```js
  socket.on('audio:status', (payload) => {
    if (!displaySockets.has(socket.id)) return;
    const next = normalizeDisplayAudioStatus(payload);
    if (!next) return;
    const current = getDisplayAudio();
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    setDisplayAudio(next);
    broadcastState();
  });
  ```
- [ ] Gli altri 9 usano `state`: `const state = getState();` in testa a ognuno. `audio:toggle` usa anche `displaySockets.size` e `getActiveLocation()`; `audio:oneshotEnded` usa `displaySockets.has(socket.id)`. I default `= {}` restano.
- [ ] In `index.js`: `registerAudioEvents(socket, socketCtx);` dove stava `audio:status`; togliere anche il blocco da `audio:toggle` ad `audio:oneshotEnded`.
- [ ] V1 (`index.js`: 3), V2–V7. In V4 compariranno `getDisplayAudio`/`setDisplayAudio`: controllare che non ci sia nessun `displayAudio` nudo.
- [ ] Commit: `refactor(server): eventi audio in socket-audio.js`

### Task 10: presenza (hello, viewport, disconnect)

**Files:** Modify `server/index.js`; Create `server/socket-presence.js`

**Eventi (3, in due blocchi):** `hello` e `display:viewport` (i primi due dopo le tre `socket.emit` iniziali) e `disconnect` (l'ultimo).

**Firma:** `registerPresenceEvents(socket, { getState, broadcastState, controlSockets, displaySockets, broadcastControlStatus, broadcastDisplayStatus, setDisplayViewport, getDisplayAudio, setDisplayAudio })`

**Require nel modulo:** `audioModel` da `./audio`.

- [ ] `hello`: `const state = getState();` in testa (usa `audioModel.clearOneshots(state)`), resto identico.
- [ ] `display:viewport`: niente `getState()`; il corpo diventa `setDisplayViewport({ width, height });` e `broadcastState();`.
- [ ] `disconnect`: `const state = getState();` in testa; `displayAudio` sostituito come da tabella:
  ```js
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
  ```
  Nota: l'originale legge `state` solo dentro l'`if`; leggerlo in testa è equivalente perché l'handler è sincrono.
- [ ] `disconnect` è un evento riservato: `protectSocketHandlers` non normalizza il suo primo argomento (`RESERVED_SOCKET_EVENTS`). Non serve fare niente, ma non toccare quell'elenco.
- [ ] In `index.js`: `registerPresenceEvents(socket, socketCtx);` dove stava `hello`, togliere anche `disconnect`. L'ordine di registrazione cambia (`disconnect` ora prima degli altri): non conta, vedi «Decisioni».
- [ ] Ora `io.on('connection')` deve essere esattamente: `auth.socketGuard(socket);`, `protectSocketHandlers(socket);`, le tre `socket.emit` iniziali, poi le 10 chiamate `register...Events(socket, socketCtx);`. Nessun `socket.on(` rimasto.
- [ ] V1 (`index.js`: 0, totale 64 su 10 file), V2–V7.
- [ ] Commit: `refactor(server): eventi di presenza in socket-presence.js`

### Task 11: rotte di upload e storage

**Files:** Modify `server/index.js`; Create `server/routes-storage.js`, `server/files.js`

Cosa si sposta in `routes-storage.js` (blocco contiguo da `function makeUpload` alla fine di `app.post('/api/upload/handout'`, tranne le eccezioni sotto): `makeUpload`, `uploadMap`, `uploadImage`, `uploadHandout`, `uploadAudio`, `findOrphanFiles`, e le rotte `/api/storage/orphans/scan`, `/api/storage/orphans/purge`, `/api/upload/map`, `/api/map/clear`, `/api/media/web`, `/api/upload/image`, `/api/upload/audio`, `/api/upload/handout`.

Restano in `index.js`: `app.get('/api/webproxy', ...)` (una riga: spostarla subito sotto `/api/settings`) e `resolveImportPath` (va nel Task 12).

Cosa va in `files.js`: `deleteUploadedFile` col suo commento JSDoc, `module.exports = { deleteUploadedFile };`, `require` di `path` e `fs`. In `index.js` la funzione viene tolta e sostituita da `const { deleteUploadedFile } = require('./files');` in cima. `socketCtx` continua a passarla com'è.

**Firma:** `registerStorageRoutes(app, { getState, saveState, broadcastState, deleteUploadedFile, audioContentKey, MAPS_DIR, IMAGES_DIR, AUDIO_DIR, HANDOUT_DIR })`

**Require nel modulo:** `path`, `fs`, `multer`, `{ nanoid }`, `{ normalizeWebUrl }` da `./webproxy`, `audioModel`, `handoutModel`.

- [ ] In `index.js`, PRIMA della prima rotta spostata (cioè subito dopo `app.post('/api/settings', ...)`), creare:
  ```js
  // Dipendenze dei moduli server/routes-*.js. Niente `io` qui: viene creato
  // più sotto (broadcastState lo usa solo quando arriva una richiesta).
  const httpCtx = {
    getState: () => state,
    setState: (next) => { state = next; },
    saveState,
    broadcastState,
    deleteUploadedFile,
    audioContentKey,
    migrateOptions,
    MAPS_DIR,
    IMAGES_DIR,
    AUDIO_DIR,
    HANDOUT_DIR,
    IMPORTS_DIR,
    BACKUPS_DIR
  };
  ```
  `broadcastState` e `audioContentKey` sono dichiarazioni `function` (sollevate), quindi si possono mettere nell'oggetto anche se sono definite più in basso. NON mettere `io` in `httpCtx`: a quel punto è in zona morta e l'avvio fallisce.
- [ ] I multer (`uploadMap`, ecc.) e `makeUpload` vanno DENTRO `registerStorageRoutes` (usano le cartelle del contesto); `registerStorageRoutes` è chiamata una sola volta, quindi si creano una volta sola come prima.
- [ ] `findOrphanFiles` va dentro `registerStorageRoutes`; la sua prima riga diventa `const state = getState();`.
- [ ] In ogni rotta che usa `state`, prima riga `const state = getState();` (tutte tranne `/api/storage/orphans/scan` e `/purge`, che chiamano solo `findOrphanFiles`).
- [ ] In `index.js` al posto del blocco: `registerStorageRoutes(app, httpCtx);`. `registerTelegramRoutes(...)` resta dov'è.
- [ ] V1 (invariato: 0 in `index.js`, 64 totali), V3, V4, V5, V6, e `node -e "require('./server/routes-storage.js'); require('./server/files.js')"`.
- [ ] Commit: `refactor(server): rotte di upload e storage in routes-storage.js`

### Task 12: rotte di esportazione e importazione

**Files:** Modify `server/index.js`; Create `server/routes-backup.js`

Cosa si sposta: `resolveImportPath`, `uploadImportFile`, e le rotte `/api/export/location/:id`, `/api/export/backup`, `/api/import/inspect`, `/api/import/cancel`, `/api/import/apply` (blocco contiguo da `app.get('/api/export/location/:id'` alla fine di `/api/import/apply`, più `resolveImportPath` che sta più in alto).

**Firma:** `registerBackupRoutes(app, { getState, setState, saveState, broadcastState, deleteUploadedFile, migrateOptions, MAPS_DIR, IMAGES_DIR, IMPORTS_DIR, BACKUPS_DIR })`

**Require nel modulo:** `path`, `fs`, `multer`, `{ nanoid }`, `tar` (`tar-stream`), `exportImport` da `./exportImport`, `{ migrate, applyStartupDefault }` da `./state`.

- [ ] `resolveImportPath` e `uploadImportFile` dentro `registerBackupRoutes` (usano `IMPORTS_DIR` del contesto).
- [ ] `/api/export/location/:id` e `/api/export/backup`: `const state = getState();` in testa.
- [ ] `/api/import/apply` è l'unico punto con `await` tra le letture dello stato e con la riassegnazione. Qui NON si mette `getState()` in testa: lo stato si rilegge dopo ogni `await`, come faceva l'originale con la variabile di modulo. Corpo del `try`:
  ```js
    try {
      const manifest = await exportImport.readManifest(filePath);
      if (manifest.kind === 'location') {
        const newLocation = await exportImport.applyLocationImport(filePath, manifest, MAPS_DIR, IMAGES_DIR);
        const state = getState();
        state.locations.push(newLocation);
        // (commento originale)
        migrate(state, migrateOptions);
        saveState(state);
        broadcastState();
        res.json({ ok: true, kind: 'location', name: newLocation.name });
      } else if (manifest.kind === 'backup') {
        const current = getState();
        const oldMapFiles = new Set();
        const oldImageFiles = new Set();
        current.locations.forEach((l) => {
          if (l.map.file) oldMapFiles.add(l.map.file);
          (l.images || []).forEach((img) => { if (img.file) oldImageFiles.add(img.file); });
        });

        await exportImport.saveSafetySnapshot(current, MAPS_DIR, IMAGES_DIR, BACKUPS_DIR);
        const restored = await exportImport.applyBackupRestore(filePath, manifest, MAPS_DIR, IMAGES_DIR);

        // (commento originale)
        const candidate = { ...getState(), locations: restored.locations, campaign: restored.campaign, gridPreset: restored.gridPreset };
        // (commento originale)
        migrate(candidate, migrateOptions);
        applyStartupDefault(candidate);
        saveState(candidate);
        setState(candidate);

        oldMapFiles.forEach((f) => deleteUploadedFile(MAPS_DIR, f));
        oldImageFiles.forEach((f) => deleteUploadedFile(IMAGES_DIR, f));

        broadcastState();
        res.json({ ok: true, kind: 'backup', locationCount: getState().locations.length });
      } else {
  ```
  Il resto (ramo `else`, `catch`, `finally`) identico. Perché così: nell'originale `{ ...state, ... }` legge la variabile DOPO i due `await`; una copia presa in testa all'handler leggerebbe lo stato di prima.
- [ ] Dopo `setState(candidate)` i socket già connessi devono vedere il nuovo stato: lo garantisce il fatto che ogni handler chiama `getState()` a ogni evento. Lo controlla il test «stato dopo il ripristino di un backup» di `socket-events.test.js`.
- [ ] In `index.js` al posto del blocco: `registerBackupRoutes(app, httpCtx);`.
- [ ] V3, V4 (qui `state = ` non deve comparire: c'è solo `setState(candidate)`), V5, V6, `node -e "require('./server/routes-backup.js')"`.
- [ ] Commit: `refactor(server): rotte di esportazione e importazione in routes-backup.js`

### Task 13: pulizia di `index.js` e cronaca

**Files:** Modify `server/index.js`, `CLAUDE.md`; Create `docs/storia/2026-11-16-spezza-index.md` (data del giorno in cui si esegue)

- [ ] Togliere da `index.js` i `require` e le costanti che non usa più. Per ognuno di questi nomi controllare con `command grep -n "<nome>" server/index.js`: se compare solo nella riga del `require`, togliere il nome (o la riga intera): `multer`, `tar`, `exportImport`, `migrate`, `DEFAULT_GRID`, `DEFAULT_COMPASS`, `normalizeWebUrl`, `AOE_COLORS`, `AOE_SHADER_OVERRIDE_IDS`, `sendStoredMedia`, `audioModel`, `handoutModel`, `normalizeDisplayAudioStatus`. Restano di sicuro: `crypto` e `fs` (`audioContentKey`, pulizia di `IMPORTS_DIR`), `nanoid` (`copyHandoutFile`), `loadState`, `saveState`, `applyStartupDefault`, `DATA_DIR`, `handleWebProxy`, i moduli Telegram, `createAuth`, `packageJson`.
- [ ] Rileggere `index.js` per intero. Deve contenere solo: `require`, cartelle e loro creazione, pulizia degli import rimasti, `audioContentKey`, `copyHandoutFile`, `migrateOptions`, `let state`, `getActiveLocation`, Express (json, auth, statici, `/`, `/api/state`, `/api/info`, `/api/settings`, `/api/webproxy`), `httpCtx` e le tre chiamate `register...Routes`, server e `io`, i Set, `displayViewport`, `displayAudio`, `statePayload`, `broadcastState`, il throttle, `broadcastControlStatus`, `broadcastDisplayStatus`, `RESERVED_SOCKET_EVENTS`, `isPlainObject`, `protectSocketHandlers`, `socketCtx`, `io.on('connection')` con le registrazioni, `server.listen`. Se c'è altro, spostarlo o motivarlo nella cronaca.
- [ ] `node --check server/index.js` e tutte le V.
- [ ] `npm test` verde tre volte di fila (il gruppo socket usa tempi: un verde solo può essere fortuna).
- [ ] `CLAUDE.md`, sezione «Stato sul server»: aggiungere UNA riga, per esempio: «Eventi socket in `server/socket-<gruppo>.js` (`register<Gruppo>Events(socket, ctx)`), rotte di upload e backup in `server/routes-*.js`; i moduli leggono lo stato solo con `ctx.getState()` dentro ogni handler. I moduli stanno in `server/` e non in sottocartelle: il test «copertura» legge solo `server/*.js`.» Non allungare altro.
- [ ] Cronaca `docs/storia/AAAA-MM-GG-spezza-index.md`: commit fatti, scostamenti dal piano, cosa è verificato (test, conteggi) e cosa no (nessuna prova dal vivo: il comportamento è garantito solo dai test della fase 2).
- [ ] Commit: `refactor(server): index.js solo avvio, cablaggio e stato condiviso; cronaca della fase 4`

## Trappole (riassunto)

1. **`const state = getState()` nel posto sbagliato.** Va dentro ogni handler. Nel corpo di `register...Events` verrebbe letto una volta per connessione: dopo il ripristino di un backup i socket già aperti scriverebbero sul vecchio oggetto, e il prossimo `saveState` lo salverebbe sopra il backup. Controllo: V3.
2. **`displayViewport` e `displayAudio` passati per valore.** `{ displayAudio }` nel contesto fotograferebbe `null` all'avvio. Solo getter/setter. Controllo: V4.
3. **Throttle duplicato.** `scheduleSaveAndBroadcast` e il suo timer restano uno solo, in `index.js`.
4. **Registrazione prima della protezione.** Le chiamate `register...Events` vanno dopo `protectSocketHandlers(socket)`, che sostituisce `socket.on` sull'oggetto. Un modulo che si salvasse `socket.on` prima (o usasse `socket.addListener`, o `Socket.prototype.on`) aggirerebbe la protezione: un payload `null` tornerebbe a far cadere il processo. I test «payload non oggetto» lo vedono solo per gli eventi che provano.
5. **`auth.socketGuard`** usa `socket.use`, che vale per tutti gli eventi qualunque sia il modulo che li registra. Non serve passarlo ai moduli. Non rinominare eventi: i pubblici (`hello`, `display:viewport`, `audio:status`, `audio:oneshotEnded`, `aoe:*`) sono riconosciuti per nome.
6. **Moduli in una sottocartella o `socket.on` non letterale.** Il test «copertura» li perde e diventa rosso con «eventi trovati: meno di 64». Non è un motivo per toccare il test: si sistemano i moduli.
7. **Zona morta di `io`.** `socketCtx` dopo `const io`; `httpCtx` senza `io`.
8. **`/api/import/apply`.** Stato riletto dopo ogni `await`, `setState` al posto di `state = candidate` (Task 12).
9. **Handler async.** `image:sendTelegram` deve restare `async` e restituire la promise (freccia `async`), altrimenti `protectSocketHandlers` non intercetta il rifiuto.
10. **Commenti con `socket.on('...'`.** Il test «copertura» conta anche i commenti: non scrivere esempi come `socket.on('x'` nei commenti dei moduli.

## Review Focus

Per l'Opus che rivede (`git log --oneline minori-noti..spezza-index`, un commit per gruppo):

- **Codice spostato e non riscritto.** `git diff minori-noti --color-moved=zebra --color-moved-ws=allow-indentation-change -- server/` deve mostrare quasi solo righe spostate. Le righe aggiunte davvero devono essere solo: `require`, intestazioni e `module.exports` dei moduli, `const state = getState();`, le sostituzioni della tabella, `socketCtx`/`httpCtx`, le chiamate `register...`. Qualunque altro cambiamento dentro un handler è un cambio di comportamento.
- **`getState()` dentro ogni handler** (V3) e nessuna lettura diretta di `displayAudio`/`displayViewport` nei moduli (V4).
- **`/api/import/apply`:** stato riletto dopo gli `await`, `setState(candidate)` DOPO `saveState(candidate)` (se il salvataggio fallisce lo stato vivo non va toccato: è il motivo del commento originale).
- **Ordine in `io.on('connection')`:** `socketGuard`, `protectSocketHandlers`, tre `emit`, poi le registrazioni. Nessun `socket.on(` rimasto in `index.js`.
- **Un solo throttle** condiviso da `view:pan`, `aoe:move`, `shader:move`.
- **Test della fase 2 intatti:** `git diff minori-noti -- server/socket-events.test.js server/test-support/` vuoto; il test «copertura» trova ancora 64 eventi.
- **BUG noti non corretti per sbaglio:** per esempio `view:pan` concatena ancora una stringa, `grid:update` produce ancora `NaN`. I test della fase 2 li fissano: se un test di quel tipo è cambiato o rimosso, qualcuno ha corretto un bug in questa fase.
- **`index.js` finale:** solo avvio, cablaggio e stato condiviso (elenco nel Task 13). Valutare se `/api/settings` (rimasto in `index.js`) va bene lì.
- **Rischio non coperto dai test:** le rotte di upload (`/api/upload/*`, `/api/map/clear`, `/api/media/web`, `/api/storage/orphans/*`) non hanno test HTTP propri in questa suite. Per il Task 11 la revisione deve confrontare il codice a mano (aiuta `--color-moved`).

## Resoconto finale

`git log --oneline minori-noti..HEAD`, conteggio finale degli eventi per file (V1), righe di `index.js` prima e dopo (`wc -l`), esito delle tre esecuzioni di `npm test`, scostamenti dal piano e motivi.
