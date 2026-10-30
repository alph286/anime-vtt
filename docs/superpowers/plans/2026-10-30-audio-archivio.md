# Archivio audio — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** archivio audio unico del progetto da cui le location prendono le proprie righe Background/One-shot; nome e icona vivono nell'archivio, volume per location; elimina con avviso; copia degli audio da un'altra location.

**Architecture:** `state.audioLibrary = [{id,name,icon,file}]`; le righe delle location hanno `audioId` più copie `name/icon/file` riallineate dal server (così /display, /handout, /control non cambiano). Logica pura in `server/audio.js`, cablata in `server/index.js`; migrazione in `migrate()` con una funzione `audioKey(file)` iniettata (hash del contenuto all'avvio, nome file nei test). UI in `editor-app/src/sidebar/` (React + shadcn).

**Tech Stack:** Node/Express/socket.io, `node --test`; React + shadcn/ui + Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-audio-archivio-design.md`

## Global Constraints

- Icona di default in archivio: `music`; slug validato con `^[a-z0-9-]{1,40}$`; nome max 120 caratteri.
- Riga nuova da archivio: volume `0.7`, `on:false`, `handout:false`, `restartOnStop:false` (solo background).
- Upload audio: `audio/*`, 50 MB, invariati.
- `audio:delete` (riga) NON cancella più il file; solo `audioLibrary:delete` lo fa.
- Test e prove in browser solo su copia dei dati, porta 3100; mai aprire /display o /control su un server con una sessione reale.
- Build `public/editor/` ricostruita e committata (`npm run build:editor`); `public/control` e `public/party` solo se il loro output cambia.
- Commit senza righe di attribuzione.

## Review Focus

1. Ripristino di un backup / import con righe che hanno `audioId` sconosciuto all'archivio corrente: la riga deve sopravvivere (voce ricreata dal suo `file`), non sparire.
2. Rinomina dell'archivio mentre un one-shot suona: la riga mantiene `id`, quindi `audioOneshots` resta valido.
3. Eliminazione dall'archivio di un one-shot in corso: la chiave in `audioOneshots` viene tolta.
4. Copia da una location che contiene già lo stesso audio nella riga di destinazione: nessun doppione.
5. Avvio con un file audio mancante su disco: la migrazione non va in errore (hash `null` → si ripiega sul nome file).

---

### Task 1: Modello archivio in `server/audio.js`

**Files:**
- Modify: `server/audio.js`
- Test: `server/audio.test.js`

**Interfaces — Produces** (tutte pure, mutano `state`):
- `syncAudioLibrary(state, audioKey = (file) => file): void` — crea `state.audioLibrary` se manca; per ogni riga di ogni location: se `audioId` esiste in archivio riallinea `name/icon/file`; altrimenti cerca una voce con la stessa chiave `audioKey(file) ?? file` (chiavi delle voci calcolate dal loro `file`), se non c'è la crea (`{id: nanoid(), name: riga.name, icon: riga.icon, file: riga.file}`), assegna `audioId` e riallinea. Normalizza le voci (`cleanName`, icona valida o `music`), scarta voci senza `file`. Non cancella voci non usate.
- `addLibraryItem(state, { name, file }): item` (icona `music`).
- `updateLibraryItem(state, audioId, { name?, icon? }): boolean` — propaga a tutte le righe con quell'`audioId`.
- `removeLibraryItem(state, audioId): string | null` — toglie le righe da tutte le location (ed elimina la loro chiave da `state.audioOneshots`), toglie la voce, restituisce il file da cancellare.
- `addTrackFromLibrary(state, location, kind, audioId): track | null` — riga con i default dei Global Constraints.
- `copyTracks(state, from, to): number` — per ogni kind, aggiunge in coda le righe di `from` il cui `audioId` non è già nella stessa riga di `to`; id nuovi, stessi `volume/handout/restartOnStop/on`; restituisce quante ne ha aggiunte.
- `libraryFiles(state): string[]`.
- `removeTrack` resta com'è (restituisce ancora il file, ma il chiamante non lo cancella più).
- `normalizeTrack` conserva `audioId` se è una stringa.
- Rimossi dal ramo riga di `updateTrack`: `name`, `icon`.

- [ ] **Step 1: Test che falliscono** in `server/audio.test.js`:
  - `syncAudioLibrary: due righe con lo stesso file in location diverse -> una voce, stesso audioId`
  - `syncAudioLibrary: file diversi con audioKey uguale -> una voce, righe riallineate al file della prima` (audioKey finto `f => f.startsWith('dup') ? 'H' : f`; righe `dup1.mp3` e `dup2.mp3` → `file` di entrambe `dup1.mp3`)
  - `syncAudioLibrary: audioKey che restituisce null usa il nome file`
  - `syncAudioLibrary: idempotente` (seconda chiamata: `deepEqual` con la prima)
  - `syncAudioLibrary: audioId sconosciuto -> voce ricreata dal file, la riga resta`
  - `syncAudioLibrary: nome/icona della riga diversi dall'archivio -> riallineati all'archivio`
  - `updateLibraryItem: rinomina e icona propagate a tutte le righe; slug non valido ignorato`
  - `removeLibraryItem: toglie righe da tutte le location, pulisce audioOneshots, restituisce il file`
  - `addTrackFromLibrary: default volume 0.7, on false, handout false; audioId inesistente -> null`
  - `copyTracks: copia background e one-shot con impostazioni, id nuovi, salta audioId già presenti nella stessa riga`
  - `updateTrack: name e icon sulla riga non hanno più effetto`
- [ ] **Step 2:** `node --test server/audio.test.js` → i nuovi falliscono.
- [ ] **Step 3:** implementa le funzioni sopra ed esportale.
- [ ] **Step 4:** `node --test server/audio.test.js` → tutto verde.
- [ ] **Step 5:** commit `feat(audio): modello dell'archivio audio`.

### Task 2: Cablaggio server, migrazione, orfani

**Files:**
- Modify: `server/state.js` (`migrate(state, { audioKey } = {})` chiama `syncAudioLibrary` dopo il ciclo sulle location; `loadState({ audioKey } = {})` lo inoltra)
- Modify: `server/index.js`
- Test: `server/state.test.js`

**Interfaces — Consumes:** Task 1. **Produces:** eventi socket e endpoint usati dal Task 3/4:
- `POST /api/upload/audio` campi `file`, `name?`, `locationId?`, `kind?` → `{ ok, item, track? }`. Se `locationId`/`kind` presenti ma non validi: 400 e file cancellato. Senza `locationId`: solo archivio.
- `audioLibrary:update { audioId, name?, icon? }`, `audioLibrary:delete { audioId }` (cancella il file con `deleteUploadedFile(AUDIO_DIR, file)`), `audio:add { locationId, kind, audioId }`, `audio:copyFrom { locationId, fromLocationId }` (ignorato se uguali). Ognuno: se cambia qualcosa → `saveState` + `broadcastState`.
- `audio:delete` non chiama più `deleteUploadedFile`.
- `audio:update` accetta solo `restartOnStop`, `handout`.
- In `index.js`: `audioContentKey(file)` = sha256 del file in `AUDIO_DIR` (sincrono, `null` se illeggibile), passata a `loadState` e alle due `migrate(...)` di `/api/import/apply`.
- `findOrphanFiles`: audio referenziato = `audioModel.libraryFiles(state)`.

- [ ] **Step 1: Test che falliscono** in `server/state.test.js`:
  - `migrate: stato senza audioLibrary -> archivio creato, righe con audioId, volumi e on invariati`
  - `migrate: con audioKey iniettato unisce file con contenuto uguale`
- [ ] **Step 2:** `node --test server/state.test.js` → falliscono.
- [ ] **Step 3:** implementa `migrate`/`loadState` e tutto il cablaggio di `index.js` sopra.
- [ ] **Step 4:** `npm run test:server` → verde. Poi prova di fumo: copia `data/` e `storage/audio` in una cartella temporanea, avvia `PORT=3100 DATA_DIR=… STORAGE_DIR=… node server/index.js`, controlla in `state.json` migrato che ogni riga abbia `audioId` e che le voci siano una per contenuto.
- [ ] **Step 5:** commit `feat(audio): archivio audio lato server e migrazione`.

### Task 3: Archivio in /editor

**Files:**
- Modify: `editor-app/src/types.ts` (`AudioLibraryItem {id,name,icon,file}`; `audioId: string` su `BackgroundTrack`/`OneshotTrack`; `audioLibrary?: AudioLibraryItem[]` su `VttState`)
- Create: `editor-app/src/sidebar/AudioLibraryDialog.tsx`, `editor-app/src/sidebar/AudioLibraryDialog.test.tsx`
- Create: `editor-app/src/lib/audio-library.ts` (+ `.test.ts`): `audioUsage(state: VttState, audioId: string): string[]` — nomi delle location che lo usano, senza ripetizioni, nell'ordine di `state.locations`.
- Modify: `editor-app/src/sidebar/AudioPanel.tsx` (estrae `IconPicker` con prop `value` + `onPick(slug)` per riusarlo; pulsante "Archivio" in testa che apre il Dialog)

**Interfaces — Produces:** `AudioLibraryDialog({ open, onOpenChange })`; `IconPicker({ value, onPick })`; `uploadAudioFiles(files, extra?: { locationId, kind }): Promise<string[]>` (nomi falliti; in `lib/audio-library.ts`, sequenziale come oggi).

- [ ] **Step 1: Test che falliscono:**
  - `audioUsage` → `['Taverna','Cripta']` per un audio in due location (due righe nella stessa location contano una volta).
  - Dialog: lista ordinata per nome; cambio nome → `['audioLibrary:update', { audioId, name }]`; icona → `{ audioId, icon }`; elimina audio NON usato → due click (arma-poi-conferma) → `audioLibrary:delete`; elimina audio usato → compare il testo `Usato in: Taverna, Cripta — verrà tolto da tutte le location.` e solo il pulsante "Elimina" della conferma emette; "Annulla" no. Carica: fetch su `/api/upload/audio` senza `locationId`.
- [ ] **Step 2:** `cd editor-app && npx vitest run src/sidebar/AudioLibraryDialog.test.tsx src/lib/audio-library.test.ts` → falliscono.
- [ ] **Step 3:** implementa (Dialog shadcn; conferma come secondo Dialog o sezione interna; ogni voce mostra `n location` d'uso).
- [ ] **Step 4:** test verdi.
- [ ] **Step 5:** commit `feat(editor): finestra Archivio audio`.

### Task 4: Pannello Audio della location

**Files:**
- Modify: `editor-app/src/sidebar/AudioPanel.tsx`, `editor-app/src/sidebar/AudioPanel.test.tsx`

**Interfaces — Consumes:** Task 2 eventi, Task 3 `IconPicker`, `uploadAudioFiles`.

- [ ] **Step 1: Aggiorna/aggiungi test:**
  - nome della riga → `['audioLibrary:update', { audioId: 'A1', name: 'Temporale' }]`; icona → `{ audioId, icon: 'flame' }`; testo d'aiuto `Nome e icona valgono in tutte le location` presente.
  - cestino della riga ha title `Togli da questa location`, due click → `audio:delete` (invariato il payload).
  - "Aggiungi" (Popover) elenca le voci d'archivio; click su una voce → `['audio:add', { locationId:'L1', kind:'background', audioId }]`; il popover resta aperto (più scelte in fila).
  - "Carica nuovo…" nel popover → fetch con `locationId` e `kind`.
  - "Copia audio da…": selettore con le altre location che hanno audio (esclusa la corrente) + pulsante "Copia" → `['audio:copyFrom', { locationId:'L1', fromLocationId:'L2' }]`.
- [ ] **Step 2:** `npx vitest run src/sidebar/AudioPanel.test.tsx` → falliscono.
- [ ] **Step 3:** implementa.
- [ ] **Step 4:** `npm test` in `editor-app/` tutto verde; `npx tsc -b` (o il typecheck del progetto) pulito.
- [ ] **Step 5:** commit `feat(editor): righe audio dall'archivio e copia da location`.

### Task 5: Build, verifica in browser, documentazione

**Files:** `public/editor/**` (build), `CLAUDE.md` (sezione nuova "Archivio audio"), piano spuntato.

- [ ] **Step 1:** `npm run build:all`; committa solo le build il cui output è cambiato.
- [ ] **Step 2:** server di prova :3100 su copia dei dati; in /editor: migrazione visibile in Archivio, carica, aggiungi a due location, rinomina e vedi propagare, copia da location, elimina usato (avviso con elenco) e non usato; /control (solo lettura stato via socket Node, senza `hello`) mostra i nomi nuovi. Console pulita.
- [ ] **Step 3:** `npm run test:server` e `cd editor-app && npm test` verdi.
- [ ] **Step 4:** sezione in `CLAUDE.md` (decisioni, scelte di Claude, verificato / non verificato); commit `docs: archivio audio`.
