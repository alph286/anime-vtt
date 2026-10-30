# Audio a righe (Background / One-shot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la coppia principale/speciale con due righe per location (Background in loop, accendibili insieme; One-shot sovrapponibili) comandate da una nuova scheda Audio di `/control` e gestite dal pannello Audio di `/editor`.

**Architecture:** Logica di stato audio pura in un nuovo `server/audio.js` (testata con `node --test`), cablata in `server/index.js`. `/display` usa un mixer a un `<audio>` per traccia che sostituisce `createAudioEngine` in `public/shared/audio-fade.js`. `/control` e `/editor` (React, `editor-app/`) leggono il nuovo modello e mandano eventi socket nuovi; le build in `public/` vanno ricostruite e committate.

**Tech Stack:** Node/Express/socket.io, `node:test`; React + shadcn/ui + Zustand + Vitest in `editor-app/`; `lucide-react` per le icone.

**Spec:** `docs/superpowers/specs/2026-10-30-audio-background-oneshot-design.md` (leggerla prima di ogni task: la sezione "Casi limite" è normativa).

## Global Constraints

- Lavorare SOLO nel worktree `/home/kratos/Documenti/Projects/anime-vtt/.claude/worktrees/audio-development-proposals-664ebb`, branch `claude/audio-development-proposals-664ebb`.
- Commit senza alcuna riga `Co-Authored-By` né altre attribuzioni. Niente push.
- Commenti e testi UI in italiano, stile del codice circostante.
- Mai usare i dati vivi (`data/`, `storage/` del repo principale): verifiche su server di prova porta 3100 con `DATA_DIR`/`STORAGE_DIR` temporanei. Mai aprire una tab su `/display` o `/control` del server vero (porta 3000).
- Nessuna dipendenza nuova.
- Costanti fade (ms): `location 2000, bgIn 1000, bgOut 1000, transport 400, duckOut 600, stingIn 300, resumeIn 1500`; `AUDIO_DUCK_LEVEL = 0.4`; volume default `0.7`, passo `0.1`.
- Icona di default: `music` per background, `zap` per one-shot. Slug valido: `^[a-z0-9-]{1,40}$`. Nome ≤ 120 caratteri.
- `public/shared/*.js` restano script classici con `module.exports` in coda (nessun `import`/`export`).
- Dopo ogni modifica a `editor-app/src`: le build committate (`public/editor`, `public/control`, `public/party`) si ricostruiscono nel task che le tocca (`npm run build:editor|build:control|build:party` dalla radice del worktree).

## Review Focus

1. **Display che si collega o ricarica mentre un one-shot è "in corso"** → nessun one-shot riparte; il pulsante su /control si spegne (server azzera `audioOneshots` su `hello role display` e all'uscita dell'ultimo display). Test in Task 1 (`clearOneshots`) e verifica socket in Task 2.
2. **"Finito" in ritardo dopo una ri-pressione** → un `audio:oneshotEnded` con seq vecchio non spegne la nuova partenza. Test in Task 1.
3. **Cambio location con background e one-shot accesi** → tutti sfumano e vengono rilasciati, quelli `on` della nuova entrano; tornando indietro gli `on` sono come lasciati. Test mixer in Task 3, test `on` persistito in Task 1.
4. **Stato salvato col formato vecchio** (singola traccia, main/special, campi vuoti, principale in pausa sulla location attiva) → migrazione senza perdite e `on` corretto. Test in Task 1.
5. **`play()` rifiutato dal browser** (autoplay) → stato `blocked`, nessun loop di tentativi a vuoto, ritenta al prossimo `apply`. Test mixer in Task 3.

---

### Task 1: Modello audio lato server (puro) + migrazione

**Files:**
- Create: `server/audio.js`, `server/audio.test.js`
- Modify: `server/state.js` (DEFAULT_STATE, `migrate`, `applyStartupDefault`, export), `server/state.test.js`, `package.json` (`test:server` include anche `public/shared/audio-fade.test.js`)

**Interfaces:**
- Produces (`server/audio.js`, CommonJS):
  - `AUDIO_KINDS = ['background', 'oneshot']`, `DEFAULT_TRACK_VOLUME = 0.7`
  - `emptyAudio(): { background: [], oneshot: [] }`
  - `migrateLocationAudio(audio, { legacyMainOn: boolean }): { background, oneshot }` — accetta formato nuovo (normalizza campi mancanti), main/special, singola traccia `{name,file,volume}`, `undefined`.
  - `findTrack(location, trackId): { kind, track } | null`
  - `addTrack(location, kind, { name, file, id }): track` (default icon/volume/`restartOnStop:false`/`on:false`)
  - `toggleTrack(state, location, trackId, { displayConnected }): boolean` (true = stato cambiato)
  - `setTrackVolume(location, trackId, volume): boolean`
  - `updateTrack(location, trackId, { name?, icon?, restartOnStop? }): boolean`
  - `removeTrack(state, location, trackId): string | null` (ritorna il `file` da cancellare)
  - `oneshotEnded(state, trackId, seq): boolean`
  - `clearOneshots(state): boolean` (true se c'era qualcosa)
  - `audioFilesOf(location): string[]`
- `state.audioOneshots: Record<trackId, seq>`, `state.audioOneshotSeq: number`.

- [ ] **Step 1: Test che falliscono** in `server/audio.test.js` (node:test, `assert/strict`), almeno:
  - `migrateLocationAudio` main+special pieni → 1 background `{icon:'music', restartOnStop:false, on:true, volume conservato}` + 1 oneshot `{icon:'zap'}`; ognuno con `id` stringa non vuota.
  - `legacyMainOn:false` → background `on:false`.
  - tracce senza file scartate; formato singola traccia `{name:'a',file:'a.mp3'}` → 1 background, volume 0.7; `undefined` → `emptyAudio()`; formato nuovo con campi mancanti → riempiti (icon di default, volume 0.7, `on:false`, `restartOnStop:false` per background; one-shot senza `on`/`restartOnStop`).
  - `toggleTrack` su background inverte `on`; su one-shot con `displayConnected:true` aggiunge `audioOneshots[id] = ++audioOneshotSeq`, ripremuto lo toglie; con `displayConnected:false` ritorna false e non cambia nulla; `trackId` sconosciuto → false.
  - `oneshotEnded(state,id,vecchioSeq)` dopo una ripartenza → false e voce intatta; col seq giusto → voce tolta.
  - `clearOneshots` svuota e ritorna true solo se non era vuoto.
  - `setTrackVolume` clamp 0..1, `updateTrack` rifiuta icon `'Bad Icon!'`, tronca name a 120, ignora `restartOnStop` su one-shot.
  - `removeTrack` ritorna il file e toglie la voce da `audioOneshots`.
  - `audioFilesOf` elenca i file di entrambe le righe.
- [ ] **Step 2:** `node --test server/audio.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** Implementare `server/audio.js` (`nanoid` è già dipendenza: usare lo stesso import di `server/index.js`).
- [ ] **Step 4: Test migrazione** in `server/state.test.js`:
  - stato `{ activeLocationId:'A', activeAudioTrack:'main', audioState:'paused', audioTriggerSeq:3, locations:[A con main pieno, B con main pieno] }` → A background `on:false`, B `on:true`; `activeAudioTrack`/`audioState`/`audioTriggerSeq` spariti; `audioOneshots` `{}` e `audioOneshotSeq` `0`.
  - `audioOneshots: {x:1}` salvato → dopo `migrate` è `{}`.
- [ ] **Step 5:** In `state.js`: `migrate` usa `migrateLocationAudio` (con `legacyMainOn = !(location.id === state.activeLocationId && state.activeAudioTrack === 'main' && state.audioState && state.audioState !== 'playing')`, calcolato PRIMA di cancellare i campi vecchi); DEFAULT_STATE con `emptyAudio()` e senza i campi vecchi; `applyStartupDefault` non tocca più i campi audio vecchi ma azzera `audioOneshots`. Togliere `DEFAULT_AUDIO` dall'export se non serve più a nessuno (verificare con grep).
- [ ] **Step 6:** `node --test server/*.test.js` → tutto PASS.
- [ ] **Step 7: Commit** `feat(server): modello audio background/one-shot e migrazione`.

### Task 2: Cablaggio in `server/index.js`

**Files:**
- Modify: `server/index.js` (upload audio, `findOrphanFiles`, `location:set`, `location:create`, handler `audio:*`, `hello`, `disconnect`, `audio:status`), `server/exportImport.js` (audio azzerato = `emptyAudio()`)

**Interfaces:**
- Consumes: tutto `server/audio.js` (Task 1); `normalizeDisplayAudioStatus` (Task 3 ne cambia la forma: qui usarlo solo come funzione opaca).
- Produces (contratto socket per Task 3/5/6):
  - `POST /api/upload/audio` form `{ locationId, kind, name?, file }` → `{ ok, track }` | 400.
  - client→server: `audio:toggle { trackId }`, `audio:volume { locationId, trackId, volume }`, `audio:update { locationId, trackId, name?, icon?, restartOnStop? }`, `audio:delete { locationId, trackId }`, `audio:oneshotEnded { trackId, seq }` (solo da socket display), `audio:status` payload Task 3.
  - `state:update` contiene `audioOneshots`, `audioOneshotSeq`, `displayAudio`.

- [ ] **Step 1:** Rimuovere `returnToMain`, `audio:play/pause/stop/playSpecial/specialEnded/rename` e ogni riferimento a `activeAudioTrack`/`audioState`/`audioTriggerSeq` (`grep -n` deve tornare vuoto in `server/`).
- [ ] **Step 2:** Upload: `kind` ∈ `AUDIO_KINDS` altrimenti 400; `addTrack(...)`, save, broadcast.
- [ ] **Step 3:** Handler socket come da Interfaces; `audio:toggle` usa la location attiva e `displayConnected = displaySockets.size > 0`; `audio:delete` chiama `deleteUploadedFile(AUDIO_DIR, file)`; salvare su disco solo per toggle background/volume/update/delete (lo stato dei one-shot non serve persisterlo ma `saveState` dell'intero stato va bene).
- [ ] **Step 4:** `location:set`/`location:create`: `clearOneshots(state)`; `hello role display` e uscita dell'ultimo display: `clearOneshots` + broadcast.
- [ ] **Step 5:** `findOrphanFiles` usa `audioFilesOf`.
- [ ] **Step 6: Verifica** con server di prova: `mkdir -p $SCRATCH/vtt/{data,storage/{maps,images,audio}}`, `PORT=3100 DATA_DIR=... STORAGE_DIR=... node server/index.js &` (controllare in `state.js`/`index.js` i nomi esatti delle variabili d'ambiente); script Node con `socket.io-client` (già in `editor-app/node_modules`) + `fetch` multipart che: carica 2 background e 1 one-shot (file audio qualsiasi, mime `audio/mpeg`), fa toggle background (vede `on` cambiare in `state:update`), toggle one-shot SENZA display (nessun cambio), poi con un secondo socket che fa `hello {role:'display'}` → toggle one-shot compare in `audioOneshots`, `audio:oneshotEnded` con seq sbagliato non lo toglie, con seq giusto sì; disconnessione del display azzera. Fermare il server.
- [ ] **Step 7:** `node --test server/*.test.js` PASS. **Commit** `feat(server): eventi audio a righe`.

### Task 3: Mixer di `/display` in `public/shared/audio-fade.js`

**Files:**
- Modify: `public/shared/audio-fade.js` (sostituisce `createAudioEngine`), `public/shared/audio-fade.test.js` (riscritto per il mixer; tenere i test di `audioLevelAt`)

**Interfaces:**
- Produces:
  - `AUDIO_FADE = { location, bgIn, bgOut, transport, duckOut, stingIn, resumeIn }`, `AUDIO_DUCK_LEVEL`.
  - `normalizeDisplayAudioStatus(payload) → { blocked: boolean, errors: string[], playing: string[] } | null` (array di sole stringhe, max 100, altrimenti null).
  - `createAudioMixer({ createElement, now, requestFrame, onStatus, onOneshotEnded }) → { apply(scene), resendStatus() }`
    - `createElement(): HTMLAudioElement-like` (`play()` → Promise, `pause()`, `load()`, `currentTime`, `duration`, `volume`, `loop`, `src`, `removeAttribute`, `addEventListener`).
    - `scene = { locationId: string|null, background: [{id, src, volume, on, restartOnStop}], oneshot: [{id, src, volume}], oneshots: Record<id, seq> }`.
    - `onStatus({ blocked, errors, playing })` solo quando cambia; `onOneshotEnded(id, seq)`.
- Rimuovere `createAudioEngine`, `DISPLAY_AUDIO_STATUSES`, `DISPLAY_AUDIO_SLOTS` dagli export.

- [ ] **Step 1: Test che falliscono** con elementi finti (classe `FakeAudio` registra `play/pause`, `currentTime`, `volume`; `play()` ritorna una Promise controllabile) e clock/scheduler manuali (`requestFrame` accoda, `flush(ms)` avanza `now` e svuota la coda). Casi:
  - due background `on` → due elementi, volume finale `0.7` dopo `bgIn`; uno `on:false` → nessun play.
  - spegnere un background `restartOnStop:true` → dopo `bgOut` pausa e `currentTime === 0`; riacceso riparte da 0.
  - `restartOnStop:false` acceso a t=0, durata 10s, spento a t=3s, riacceso a t=25s → `currentTime ≈ 5` (posizione virtuale 25 mod 10).
  - one-shot in `oneshots` con seq 1 → play da 0 con `loop false`; i background scendono a `0.7*0.4` dopo `duckOut`; `ended` → `onOneshotEnded(id, 1)`; scena senza il one-shot → background tornano a 0.7 dopo `resumeIn`.
  - stesso one-shot con seq 2 mentre suona → `currentTime` riportato a 0.
  - due one-shot insieme → entrambi suonano; il ducking resta finché ne suona almeno uno.
  - cambio `locationId` → elementi vecchi a volume 0 dopo `location` e rilasciati (`removeAttribute('src')`), quelli nuovi accesi salgono in `location`.
  - volume cambiato a metà → applicato subito.
  - `play()` rifiutato con `NotAllowedError` → `onStatus({blocked:true,...})`; con altro errore → id in `errors`; `apply` successivo ritenta `play()`.
  - `normalizeDisplayAudioStatus`: valido, `errors` con numeri → null, 101 voci → null, non oggetto → null.
- [ ] **Step 2:** `node --test public/shared/audio-fade.test.js` → FAIL.
- [ ] **Step 3:** Implementare. Ogni traccia attiva ha uno stato `{ el, kind, src, volume, level, duck, fade, anchor, seq, intent }`; volume effettivo `clamp01(volume × level × duck)` con `duck` animato (solo background); un solo loop `requestFrame` per tutti i fade (come il motore attuale). L'ancora della posizione virtuale si fissa al primo play riuscito: `anchor = now() - currentTime*1000`.
- [ ] **Step 4:** test PASS, poi `node --test public/shared/*.test.js server/*.test.js` PASS.
- [ ] **Step 5: Commit** `feat(audio): mixer a più tracce con ducking e posizione virtuale`.

### Task 4: `/display` usa il mixer

**Files:**
- Modify: `public/display/display.js`, `public/display/index.html` (togliere i due `<audio>` fissi; il mixer crea elementi con `document.createElement('audio')` aggiunti a un contenitore nascosto `#audio-mixer`)

**Interfaces:**
- Consumes: `createAudioMixer` (Task 3), eventi Task 2.

- [ ] **Step 1:** Sostituire `audioEngine` con `createAudioMixer` (stesso `requestFrame` con timer di riserva 100 ms), `onStatus → socket.emit('audio:status', s)`, `onOneshotEnded → socket.emit('audio:oneshotEnded', { trackId, seq })`.
- [ ] **Step 2:** `renderAudio(location, state.audioOneshots)` costruisce la `scene` (`src = /storage/audio/<file>`) e chiama `apply`; con nessuna location attiva `apply({ locationId:null, background:[], oneshot:[], oneshots:{} })`. `resendStatus()` dopo `hello` resta.
- [ ] **Step 3: Verifica** sul server di prova :3100 (dati del Task 2): aprire `/display/` del server DI PROVA nel browser di test (porta 3100, mai 3000), comandare da script socket; leggere via JS (`document.querySelectorAll('#audio-mixer audio')`) numero elementi, `paused`, `volume`, `currentTime` per: due background accesi, spegnimento, one-shot con ducking, cambio location. Console senza errori.
- [ ] **Step 4: Commit** `feat(display): audio a righe tramite il mixer`.

### Task 5: Tipi condivisi, icone e pannello Audio di `/editor`

**Files:**
- Create: `editor-app/src/lib/audio-icons.ts`, `editor-app/src/lib/audio-icons.test.ts`, `editor-app/src/sidebar/AudioPanel.test.tsx`
- Modify: `editor-app/src/types.ts`, `editor-app/src/sidebar/AudioPanel.tsx`, fixture con il formato vecchio (`editor-app/src/store/editor-store.test.ts`, `editor-app/src/control/lib/view-math.test.ts`, eventuali altri trovati con `grep -rn "special" editor-app/src`), build `public/editor/`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface BackgroundTrack { id: string; name: string; file: string; icon: string; volume: number; restartOnStop: boolean; on: boolean }
  export interface OneshotTrack { id: string; name: string; file: string; icon: string; volume: number }
  export interface LocationAudio { background: BackgroundTrack[]; oneshot: OneshotTrack[] }
  export type AudioKind = 'background' | 'oneshot';
  // MapData.audio: LocationAudio  (AudioTrack vecchio rimosso)
  ```
- Produces (`lib/audio-icons.ts`): `AUDIO_ICONS: { slug: string; label: string; Icon: LucideIcon }[]` (le ~38 icone della spec, label italiana per `title`), `audioIcon(slug: string | undefined): LucideIcon` (fallback `Music`), `DEFAULT_AUDIO_ICON = { background: 'music', oneshot: 'zap' }`.

- [ ] **Step 1: Test** `audio-icons.test.ts`: slug unici e conformi a `^[a-z0-9-]{1,40}$`; contiene `music` e `zap`; `audioIcon('boh') === audioIcon('music')`.
- [ ] **Step 2: Test** `AudioPanel.test.tsx` (jsdom, socket mockato come negli altri test, `fetch` mockato): due sezioni "Background" e "One-shot"; riga con nome; cambio nome → `audio:update {locationId, trackId, name}`; scelta icona dal popover → `audio:update {…, icon}`; checkbox "Riparti dall'inizio quando lo spegni" solo nelle righe background → `audio:update {…, restartOnStop:true}`; elimina richiede due click → `audio:delete`; "Aggiungi audio" con 2 file → 2 `fetch('/api/upload/audio')` in sequenza con `kind` giusto; se la prima risposta non è ok la seconda parte comunque e compare un messaggio con il nome del file fallito.
- [ ] **Step 3:** FAIL → implementare (`Popover` shadcn esistente per la griglia icone, `CommitInput`, `Checkbox`, `useArmConfirm`) → PASS. Aggiornare le fixture vecchie.
- [ ] **Step 4:** `cd editor-app && npx vitest run` PASS e `npx tsc -b` (o lo script di typecheck usato da `npm run build`) senza errori nei file dell'editor; `/control` può ancora avere errori di tipo per `AudioBox`, che sparisce nel Task 6 — se il typecheck dell'editor li include, rimuovere qui anche `AudioBox` dal `MapTab` e i suoi test (il Task 6 aggiunge la scheda).
- [ ] **Step 5:** `npm run build:editor` dalla radice; **Commit** `feat(editor): pannello audio background/one-shot con icone` (sorgenti + `public/editor`).

### Task 6: Scheda Audio di `/control`

**Files:**
- Create: `editor-app/src/control/tabs/AudioTab.tsx`, `editor-app/src/control/tabs/audio-tab.test.tsx`
- Modify: `editor-app/src/control/types.ts` (via campi vecchi; `audioOneshots: Record<string, number>`; `displayAudio?: { blocked: boolean; errors: string[]; playing: string[] } | null`), `store/control-store.ts` (`TabId` + `'audio'`), `shell/TabBar.tsx` (voce Audio, icona `Volume2`, dopo Media), `ControlApp.tsx` (`TabsContent value="audio"` con la stessa classe di Media), `map/MapTab.tsx` (via `AudioBox`), elimina `boxes/AudioBox.tsx` e la parte audio di `tabs/images-audio.test.tsx`, `ControlApp.test.tsx` se serve; build `public/control/` e `public/party/`

**Interfaces:**
- Consumes: tipi e `audioIcon` del Task 5; eventi `audio:toggle`, `audio:volume` del Task 2.

- [ ] **Step 1: Test** `audio-tab.test.tsx`:
  - intestazione "Audio di: <nome location attiva>"; righe vuote → "nessun audio di background per questa location — si caricano da /editor" (e l'analogo one-shot).
  - pulsante background `on` ha classe `active`; click → `audio:toggle {trackId}`.
  - stepper: `+` su volume 0.7 → `audio:volume {locationId, trackId, volume:0.8}`; `−` a 0 resta 0; valore mostrato `70%`.
  - one-shot presente in `audioOneshots` → `active`; display non connesso → pulsanti one-shot `disabled` con `title` "display non connesso"; background restano cliccabili.
  - `displayAudio.errors` contiene un id → quel pulsante ha bordo `border-destructive` e `title` "file non trovato o illeggibile".
  - riga stato: non connesso → "Display: non connesso"; `blocked` → "Display: audio bloccato dal browser" (rossa); `playing` non vuoto → "Display: in riproduzione"; vuoto → "Display: fermo".
  - in anteprima di un'altra location la scheda mostra comunque la location attiva; la tab Audio non è disabilitata (test in `ControlApp.test.tsx`).
- [ ] **Step 2:** FAIL → implementare. Layout: due `<section>` con titolo; elementi `flex flex-wrap gap-2.5`, ogni elemento `[pulsante 84×84 con icona size-8 e nome troncato sotto] [colonna stretta: + / % / −]`; acceso con le stesse classi ambra usate per lo stato attivo in `ImagesTab`/vecchio `AudioBox` (`border-[color:var(--vtt-accent)]! bg-[color:var(--vtt-accent)]! text-[color:var(--accent-text)]!`). Stepper verticale: aggiungere una prop `vertical?: boolean` a `Stepper` (default invariato).
- [ ] **Step 3:** `npx vitest run` PASS (tutta la suite), `npm run build:control` e `npm run build:party` dalla radice senza errori.
- [ ] **Step 4: Commit** `feat(control): scheda Audio con righe background e one-shot` (sorgenti + build).

### Task 7: Verifica end-to-end e documentazione

**Files:**
- Modify: `CLAUDE.md` (sostituire la sezione "Audio: dissolvenze e stato reale del display" con una sezione aggiornata sul nuovo modello, stesso stile delle altre: decisioni chiave, scelte mie, verificato / non verificato)

- [ ] **Step 1:** Suite complete: `node --test server/*.test.js public/shared/*.test.js` e `cd editor-app && npx vitest run` → tutto PASS (riportare i numeri).
- [ ] **Step 2:** Percorso su server di prova :3100 con dati temporanei e uno `state.json` col formato VECCHIO (main+special con file reali copiati in `storage/audio` temporaneo): avvio → migrazione corretta; `/editor` (3100) mostra le due righe, cambio icona/nome/checkbox; `/control` (3100) scheda Audio: accendere 2 background, ducking con un one-shot, stop di un one-shot, cambio location e ritorno (gli `on` restano), riga di stato. `/display` del server di prova aperto per leggere lo stato degli `<audio>`. Console pulite su tutte le pagine.
- [ ] **Step 3:** Aggiornare `CLAUDE.md`; **Commit** `docs: audio a righe in CLAUDE.md`.
