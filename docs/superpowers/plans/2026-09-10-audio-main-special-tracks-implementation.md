# Traccia Principale + Traccia Speciale per Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni location può avere due tracce audio indipendenti — una **principale** che parte da sola quando la location diventa attiva, e una **speciale** (es. musica da boss fight) che il GM fa partire in qualsiasi momento con un tasto da `/control`, sostituendo temporaneamente la principale finché non finisce (o viene fermata), tornando poi alla principale in automatico.

**Architecture:** stato interamente centralizzato sul server, trasmesso a tutti i client — stesso principio già in uso per tutta l'app. `location.map.audio` (oggi un solo oggetto `{name,file,volume}`) diventa `{ main: {...}, special: {...} }`. Un nuovo campo top-level `state.activeAudioTrack` dice quale delle due l'esistente `state.audioState` (`'stopped'|'playing'|'paused'`) descrive in questo momento.

**Deviazione deliberata dalla spec:** la spec descrive `activeAudioTrack` con tre valori (`'main'`, `'special'`, `null` per "nessuna traccia disponibile"). Questo piano usa invece **solo due valori, mai `null`**: `activeAudioTrack` è sempre `'main'` di default, e diventa `'special'` solo mentre quella suona. Quando la principale non ha alcun file caricato, `activeAudioTrack` resta `'main'` mentre `audioState` è semplicemente `'stopped'` — comportamento indistinguibile da un ipotetico `null` per chiunque consumi lo stato (nessun controllo in questo piano verifica mai `activeAudioTrack === null`), ma con un vantaggio concreto: elimina un caso limite altrimenti reale — senza questa semplificazione, caricare per la prima volta una traccia principale sulla location già attiva (senza un cambio location successivo), o riavviare il server su una location che ha già una traccia principale, lascerebbe `activeAudioTrack` a `null` e nasconderebbe i controlli Play/Pausa/Stop su `/control` finché il GM non cambia location e ci torna. Con `'main'` come default perenne, i controlli compaiono automaticamente ogni volta che `location.map.audio.main.file` esiste, senza codice dedicato a quei due casi limite.

**Tech Stack:** stesso stack del resto del progetto (Node/Express/socket.io lato server, vanilla JS/CSS lato client). Nessuna nuova dipendenza.

**Spec:** `docs/superpowers/specs/2026-09-10-audio-main-special-tracks-design.md`

## Global Constraints

- `location.map.audio = { main: {name,file,volume}, special: {name,file,volume} }`, ciascuna con default `{name:'',file:null,volume:0.7}`. Mai più un `location.map.audio` piatto (quella forma esiste solo nello stato pre-esistente, backfillata da `migrate()`).
- `state.activeAudioTrack`: solo `'main'` o `'special'` (vedi Deviazione deliberata sopra) — mai `null`, default `'main'`.
- La traccia `main` è sempre in loop; la traccia `special` non lo è mai.
- Cambiare location (`location:set`, `location:create`) imposta sempre `activeAudioTrack:'main'` e fa partire la principale da sola se ha un file (`audioState:'playing'`), altrimenti resta silenziosa (`audioState:'stopped'`). Il riavvio del server (`applyStartupDefault`) resta silenzioso come nella feature originale — mai autoplay all'avvio, solo su un cambio location a sessione già avviata.
- `audio:play`/`audio:pause`/`audio:stop`/`audio:volume` agiscono sempre su `location.map.audio[state.activeAudioTrack]` (mai su un `locationId` passato dal client, mai in anteprima) — stesso principio della feature originale, esteso alla traccia correntemente attiva anziché a un'unica traccia.
- `audio:playSpecial` (nessun payload) imposta `activeAudioTrack:'special'`, `audioState:'playing'`, sempre da capo anche se la speciale era già in corso. Poiché lo slot/file possono restare identici a prima (non c'è nulla che cambi in `location.map.audio` da rilevare lato client), il riavvio da capo è segnalato da un contatore dedicato top-level `state.audioTriggerSeq` (incrementato a ogni `audio:playSpecial`, mai altrove) — `/display` lo confronta con l'ultimo valore visto e azzera `currentTime` quando cambia mentre la traccia attiva è `'special'`.
- Il ritorno alla principale (`activeAudioTrack:'main'`, `audioState` playing se ha un file altrimenti stopped) succede in tre casi, tutti tramite la stessa funzione `returnToMain(location)`: la speciale finisce da sola (`audio:specialEnded`, ignorato se `activeAudioTrack` non è già `'special'` quando arriva), Stop premuto mentre la speciale suona, sostituzione/eliminazione della speciale mentre sta suonando.
- `audio:delete`/`audio:rename` prendono un payload `{ locationId, slot, ... }` con `slot` in `'main'|'special'` (prima non serviva, con una sola traccia). L'upload (`POST /api/upload/audio`) prende in più un campo `slot` nel form-data.
- Nessuna suite di test automatica in questo progetto: ogni task si verifica manualmente su un server isolato.

---

### Task 1: Server — modello dati a due tracce, evento speciale, migrazione

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`
- Modify: `server/exportImport.js`

**Interfaces:**
- Produces: `location.map.audio = { main, special }` su ogni location, esistente o nuova (con backfill da entrambe le forme precedenti: nessun campo `audio`, o la vecchia forma piatta `{name,file,volume}` della feature a singola traccia). `state.activeAudioTrack: 'main'|'special'` top-level. `state.audioTriggerSeq: number` top-level (incrementato solo da `audio:playSpecial`). Route `POST /api/upload/audio` con `slot` nel form-data. Eventi: `audio:play {}`, `audio:pause {}`, `audio:stop {}` (agiscono sulla traccia attiva), `audio:volume {volume}`, `audio:playSpecial {}` (nuovo), `audio:specialEnded {}` (nuovo, da `/display`), `audio:delete {locationId,slot}`, `audio:rename {locationId,slot,name}`. Funzione interna `returnToMain(location)`.
- Consumes: nessuna interfaccia da altri task (è il primo task).

- [ ] **Step 1: Modello dati e migrazione in `server/state.js`**

Nella location di esempio dentro `DEFAULT_STATE`, l'attuale:

```js
        compass: { ...DEFAULT_COMPASS },
        audio: { ...DEFAULT_AUDIO },
        polygons: [
```

diventa:

```js
        compass: { ...DEFAULT_COMPASS },
        audio: { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } },
        polygons: [
```

Subito dopo, l'attuale:

```js
  activeLocationId: 'taverna',
  activeImageId: null,
  audioState: 'stopped'
};
```

diventa:

```js
  activeLocationId: 'taverna',
  activeImageId: null,
  activeAudioTrack: 'main',
  audioState: 'stopped',
  audioTriggerSeq: 0
};
```

Nel blocco iniziale di `migrate()`, l'attuale:

```js
  if (state.audioState === undefined) state.audioState = 'stopped';
```

diventa:

```js
  if (state.audioState === undefined) state.audioState = 'stopped';
  if (state.activeAudioTrack === undefined) state.activeAudioTrack = 'main';
  if (state.audioTriggerSeq === undefined) state.audioTriggerSeq = 0;
```

Nel blocco `(state.locations || []).forEach((location) => { ... })`, l'attuale backfill audio:

```js
    if (!location.map.audio) location.map.audio = { ...DEFAULT_AUDIO };
    if (location.map.audio.name === undefined) location.map.audio.name = '';
    if (location.map.audio.file === undefined) location.map.audio.file = null;
    if (location.map.audio.volume === undefined) location.map.audio.volume = DEFAULT_AUDIO.volume;
```

diventa:

```js
    if (!location.map.audio) {
      location.map.audio = { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } };
    } else if (!location.map.audio.main && !location.map.audio.special) {
      // Forma precedente (una sola traccia, prima di main+special): quella
      // già caricata diventa la principale, nessuna perdita per chi l'aveva
      // già caricata con la feature a singola traccia.
      location.map.audio = {
        main: {
          name: location.map.audio.name || '',
          file: location.map.audio.file === undefined ? null : location.map.audio.file,
          volume: location.map.audio.volume === undefined ? DEFAULT_AUDIO.volume : location.map.audio.volume
        },
        special: { ...DEFAULT_AUDIO }
      };
    }
    if (!location.map.audio.main) location.map.audio.main = { ...DEFAULT_AUDIO };
    if (!location.map.audio.special) location.map.audio.special = { ...DEFAULT_AUDIO };
    if (location.map.audio.main.name === undefined) location.map.audio.main.name = '';
    if (location.map.audio.main.file === undefined) location.map.audio.main.file = null;
    if (location.map.audio.main.volume === undefined) location.map.audio.main.volume = DEFAULT_AUDIO.volume;
    if (location.map.audio.special.name === undefined) location.map.audio.special.name = '';
    if (location.map.audio.special.file === undefined) location.map.audio.special.file = null;
    if (location.map.audio.special.volume === undefined) location.map.audio.special.volume = DEFAULT_AUDIO.volume;
```

Nella funzione `applyStartupDefault(state)`, l'attuale:

```js
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  state.audioState = 'stopped';
  return state;
```

diventa:

```js
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  state.activeAudioTrack = 'main';
  state.audioState = 'stopped';
  return state;
```

`DEFAULT_AUDIO` resta invariato (è ancora la forma di una singola traccia, `{name,file,volume}` — usata due volte, una per slot) e resta esportato: nessuna modifica alla riga `module.exports`.

- [ ] **Step 2: Aggiorna `location:set` e `location:create` in `server/index.js`**

L'attuale:

```js
  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    state.audioState = 'stopped';
    saveState(state);
    broadcastState();
  });
```

diventa:

```js
  socket.on('location:set', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    state.activeAudioTrack = 'main';
    state.audioState = location.map.audio.main.file ? 'playing' : 'stopped';
    saveState(state);
    broadcastState();
  });
```

L'attuale (dentro `location:create`):

```js
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        audio: { ...DEFAULT_AUDIO },
        polygons: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
    state.audioState = 'stopped';
    saveState(state);
    broadcastState();
  });
```

diventa:

```js
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        audio: { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } },
        polygons: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
    state.activeAudioTrack = 'main';
    state.audioState = 'stopped';
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 3: Estendi `findOrphanFiles()` a entrambi gli slot**

L'attuale:

```js
    if (location.map.audio && location.map.audio.file) referencedAudio.add(location.map.audio.file);
```

diventa:

```js
    if (location.map.audio.main && location.map.audio.main.file) referencedAudio.add(location.map.audio.main.file);
    if (location.map.audio.special && location.map.audio.special.file) referencedAudio.add(location.map.audio.special.file);
```

- [ ] **Step 4: Aggiorna la route `POST /api/upload/audio`**

L'attuale:

```js
app.post('/api/upload/audio', uploadAudio.single('file'), (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  if (!location || !req.file) {
    return res.status(400).json({ error: 'location o file mancante' });
  }
  const previousFile = location.map.audio.file;
  const previousVolume = location.map.audio.volume === undefined ? DEFAULT_AUDIO.volume : location.map.audio.volume;
  location.map.audio = {
    name: req.body.name || req.file.originalname,
    file: req.file.filename,
    // Il volume di default (70%) vale solo alla prima assegnazione di una
    // traccia: sostituire una traccia già presente conserva il volume già
    // impostato dall'utente su /control.
    volume: previousFile ? previousVolume : DEFAULT_AUDIO.volume
  };
  if (previousFile) deleteUploadedFile(AUDIO_DIR, previousFile);
  if (state.activeLocationId === location.id) state.audioState = 'stopped';
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename });
});
```

diventa:

```js
app.post('/api/upload/audio', uploadAudio.single('file'), (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  const slot = req.body.slot;
  if (!location || !req.file || (slot !== 'main' && slot !== 'special')) {
    return res.status(400).json({ error: 'location, file o slot mancante/non valido' });
  }
  const previousFile = location.map.audio[slot].file;
  const previousVolume = location.map.audio[slot].volume === undefined ? DEFAULT_AUDIO.volume : location.map.audio[slot].volume;
  location.map.audio[slot] = {
    name: req.body.name || req.file.originalname,
    file: req.file.filename,
    // Il volume di default (70%) vale solo alla prima assegnazione di una
    // traccia: sostituire una traccia già presente conserva il volume già
    // impostato dall'utente su /control.
    volume: previousFile ? previousVolume : DEFAULT_AUDIO.volume
  };
  if (previousFile) deleteUploadedFile(AUDIO_DIR, previousFile);
  if (state.activeLocationId === location.id && slot === state.activeAudioTrack) {
    // Si sta sostituendo la traccia che sta attualmente suonando: se è la
    // speciale, si torna alla principale (stesso comportamento di una fine
    // naturale); se è la principale, semplicemente si ferma.
    if (slot === 'special') {
      returnToMain(location);
    } else {
      state.audioState = 'stopped';
    }
  }
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename, slot });
});
```

- [ ] **Step 5: Aggiungi `returnToMain()` e riscrivi `audio:play`/`audio:pause`/`audio:stop`/`audio:volume`**

L'attuale:

```js
  // A differenza di griglia/fog/rosa dei venti, questi comandi agiscono
  // sempre sulla location attiva -- non esiste un'anteprima silenziosa per
  // l'audio (suonerebbe comunque subito ai giocatori), quindi niente
  // locationId dal client: previewLocationId non c'entra qui.
  socket.on('audio:play', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'playing';
    broadcastState();
  });

  socket.on('audio:pause', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'paused';
    broadcastState();
  });

  socket.on('audio:stop', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'stopped';
    broadcastState();
  });

  socket.on('audio:volume', ({ volume }) => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || volume === undefined) return;
    location.map.audio.volume = Math.min(1, Math.max(0, volume));
    saveState(state);
    broadcastState();
  });
```

diventa:

```js
  // A differenza di griglia/fog/rosa dei venti, questi comandi agiscono
  // sempre sulla location attiva -- non esiste un'anteprima silenziosa per
  // l'audio (suonerebbe comunque subito ai giocatori), quindi niente
  // locationId dal client: previewLocationId non c'entra qui. Agiscono
  // sempre su `location.map.audio[state.activeAudioTrack]`, qualunque essa
  // sia in quel momento -- mai forzatamente sulla principale.
  socket.on('audio:play', () => {
    const location = getActiveLocation();
    const track = location && location.map.audio[state.activeAudioTrack];
    if (!track || !track.file) return;
    state.audioState = 'playing';
    broadcastState();
  });

  socket.on('audio:pause', () => {
    const location = getActiveLocation();
    const track = location && location.map.audio[state.activeAudioTrack];
    if (!track || !track.file) return;
    state.audioState = 'paused';
    broadcastState();
  });

  socket.on('audio:stop', () => {
    const location = getActiveLocation();
    const track = location && location.map.audio[state.activeAudioTrack];
    if (!track || !track.file) return;
    if (state.activeAudioTrack === 'special') {
      returnToMain(location);
    } else {
      state.audioState = 'stopped';
    }
    broadcastState();
  });

  socket.on('audio:volume', ({ volume }) => {
    const location = getActiveLocation();
    const track = location && location.map.audio[state.activeAudioTrack];
    if (!track || volume === undefined) return;
    track.volume = Math.min(1, Math.max(0, volume));
    saveState(state);
    broadcastState();
  });

  // Fa partire la speciale da capo, sempre, anche se era già in corso --
  // utile per far ripartire lo sting se il boss "ricompare". `audioTriggerSeq`
  // è l'unico modo per /display di distinguere questo caso (stesso slot,
  // stesso file, ma va comunque riazzerata la posizione) da un
  // state:update qualunque che non deve toccare la posizione di riproduzione.
  socket.on('audio:playSpecial', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio.special.file) return;
    state.activeAudioTrack = 'special';
    state.audioState = 'playing';
    state.audioTriggerSeq += 1;
    broadcastState();
  });

  // /display lo emette quando l'elemento <audio> genera l'evento nativo
  // `ended` (può succedere solo per la speciale, mai in loop) -- ignorato se
  // nel frattempo activeAudioTrack non è più 'special' (es. il GM ha già
  // premuto Stop o cambiato location prima che l'evento arrivasse), per non
  // annullare uno stato più recente con un evento arrivato in ritardo.
  socket.on('audio:specialEnded', () => {
    const location = getActiveLocation();
    if (!location || state.activeAudioTrack !== 'special') return;
    returnToMain(location);
    broadcastState();
  });
```

Subito prima della definizione di `io.on('connection', (socket) => {` (o in un punto qualunque prima del suo primo uso, come le altre funzioni di supporto tipo `getActiveLocation`), aggiungi:

```js
// Riporta la riproduzione alla principale -- stesso comportamento sia che
// la speciale sia appena finita da sola, sia che sia stata fermata
// manualmente, sia che sia stata sostituita/eliminata mentre suonava.
function returnToMain(location) {
  state.activeAudioTrack = 'main';
  state.audioState = location.map.audio.main.file ? 'playing' : 'stopped';
}
```

- [ ] **Step 6: Aggiorna `audio:delete` e `audio:rename` per lo slot**

L'attuale:

```js
  socket.on('audio:delete', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.audio || !location.map.audio.file) return;

    deleteUploadedFile(AUDIO_DIR, location.map.audio.file);
    location.map.audio = { ...DEFAULT_AUDIO };
    if (state.activeLocationId === locationId) state.audioState = 'stopped';

    saveState(state);
    broadcastState();
  });

  socket.on('audio:rename', ({ locationId, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.audio || !location.map.audio.file) return;
    location.map.audio.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });
```

diventa:

```js
  socket.on('audio:delete', ({ locationId, slot }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const track = location && (slot === 'main' || slot === 'special') && location.map.audio[slot];
    if (!track || !track.file) return;

    deleteUploadedFile(AUDIO_DIR, track.file);
    location.map.audio[slot] = { ...DEFAULT_AUDIO };

    if (state.activeLocationId === locationId && slot === state.activeAudioTrack) {
      if (slot === 'special') {
        returnToMain(location);
      } else {
        state.audioState = 'stopped';
      }
    }

    saveState(state);
    broadcastState();
  });

  socket.on('audio:rename', ({ locationId, slot, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const track = location && (slot === 'main' || slot === 'special') && location.map.audio[slot];
    if (!track || !track.file) return;
    track.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 7: Aggiorna il reset dell'audio nell'export in `server/exportImport.js`**

L'attuale:

```js
      // L'audio non fa parte dell'export (fuori scope, vedi design doc):
      // resettato a un default sicuro per non lasciare nel manifest un
      // riferimento a un file che planLocationFiles() non copia nell'archivio.
      audio: { ...DEFAULT_AUDIO }
```

diventa:

```js
      // L'audio non fa parte dell'export (fuori scope, vedi design doc):
      // resettato a un default sicuro per non lasciare nel manifest un
      // riferimento a un file che planLocationFiles() non copia nell'archivio.
      audio: { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } }
```

- [ ] **Step 8: Verifica manuale**

```bash
DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PORT=3101 node server/index.js
```

1. `curl -s http://localhost:3101/api/state | grep -o '"audio":{[^}]*}[^}]*}[^}]*}\|"activeAudioTrack":"[a-z]*"'` → la location `taverna` mostra `"audio":{"main":{"name":"","file":null,"volume":0.7},"special":{"name":"","file":null,"volume":0.7}}` e `"activeAudioTrack":"main"`.
2. Carica una traccia sullo slot `main`: `touch /tmp/test-main.mp3 && curl -s -X POST http://localhost:3101/api/upload/audio -F "file=@/tmp/test-main.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Ambient" -F "slot=main"` → `curl .../api/state` mostra `main.file` valorizzato, `main.name:"Ambient"`.
3. Dalla console del browser (apri `/editor`, che carica già `socket.io.js`):
   ```js
   const s = io();
   s.emit('audio:play', {});
   ```
   `curl .../api/state | grep -o '"audioState":"[a-z]*"'` → `"playing"` (sta suonando la principale, dato che `activeAudioTrack` è `"main"` di default).
4. Con la principale ancora "in riproduzione", sostituiscila: `touch /tmp/test-main-2.mp3 && curl -s -X POST http://localhost:3101/api/upload/audio -F "file=@/tmp/test-main-2.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Ambient2" -F "slot=main"` → `curl .../api/state` mostra `"audioState":"stopped"` (sostituire la principale mentre suona ferma tutto, come nella feature originale a singola traccia) e il vecchio `test-main.mp3` è sparito da `/tmp/anime-vtt-test-storage/audio/`.
5. `s.emit('audio:play', {})` per rimettere la principale in riproduzione. Carica una traccia sullo slot `special`: `touch /tmp/test-special.mp3 && curl -s -X POST http://localhost:3101/api/upload/audio -F "file=@/tmp/test-special.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Boss" -F "slot=special"`.
6. `s.emit('audio:playSpecial', {})` → `curl .../api/state` mostra `"activeAudioTrack":"special"`, `"audioState":"playing"`, e `"audioTriggerSeq":1` (partiva da `0`).
7. `s.emit('audio:playSpecial', {})` di nuovo, subito, senza fermarla → `"audioTriggerSeq":2` (incrementato anche se `activeAudioTrack`/`audioState` restano identici: è il segnale che dice a `/display` di riazzerare la posizione anche senza alcun altro campo cambiato).
8. Con la speciale ancora "in riproduzione", sostituiscila: `touch /tmp/test-special-2.mp3 && curl -s -X POST http://localhost:3101/api/upload/audio -F "file=@/tmp/test-special-2.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Boss2" -F "slot=special"` → `curl .../api/state` mostra `"activeAudioTrack":"main"`, `"audioState":"playing"` (sostituire la speciale mentre suona si comporta come una fine naturale: si torna alla principale, che riparte perché ha un file).
9. `s.emit('audio:playSpecial', {})` di nuovo, poi `s.emit('audio:stop', {})` (mentre la speciale sta "suonando") → torna a `"activeAudioTrack":"main"`, `"audioState":"playing"`.
10. `s.emit('audio:playSpecial', {})` di nuovo, poi `s.emit('audio:specialEnded', {})` (simula la fine naturale) → stesso risultato del punto 9.
11. `s.emit('audio:specialEnded', {})` una seconda volta senza aver rifatto partire la speciale → nessun effetto (`activeAudioTrack` già `"main"`, l'evento in ritardo viene ignorato).
12. `s.emit('audio:playSpecial', {})`, poi elimina la speciale mentre "suona": `s.emit('audio:delete', { locationId: 'taverna', slot: 'special' })` → torna a `"activeAudioTrack":"main"`, il file special sparisce da `/tmp/anime-vtt-test-storage/audio/`, `special` torna a `{"name":"","file":null,"volume":0.7}`.
13. `s.emit('audio:volume', { volume: 0.3 })` (con `activeAudioTrack` `"main"`) → `curl .../api/state` mostra `main.volume:0.3`, `special.volume` invariato (indipendenti).
14. `s.emit('location:set', { locationId: 'taverna' })` → `"activeAudioTrack":"main"`, `"audioState":"playing"` (la principale ha ancora un file, riparte da sola cambiando location anche verso la stessa).
15. Crea una seconda location senza traccia principale: `s.emit('location:create', {})` (nota l'id generato dalla risposta di stato, es. dal campo `activeLocationId` dopo l'emit, o cercalo in `curl .../api/state`), poi `s.emit('location:set', { locationId: '<id nuova location>' })` → `"audioState":"stopped"` (nessuna traccia principale su quella location, resta silenziosa invece di dare errore).
16. Ferma il server (Ctrl+C) e riavvialo con lo stesso comando (torna sulla location predefinita `taverna`, che ha ancora una traccia principale) → `curl .../api/state` mostra `"audioState":"stopped"` (nessuna ripartenza automatica all'avvio, nonostante la principale abbia un file).
17. Verifica migrazione dalla forma a singola traccia: ferma il server, sovrascrivi `/tmp/anime-vtt-test-data/state.json` sostituendo manualmente (con un editor o `sed`) il campo `"audio":{"main":...,"special":...}` di una location con la vecchia forma piatta `"audio":{"name":"Vecchia","file":"xyz.mp3","volume":0.5}`, riavvia il server → `curl .../api/state` mostra quella location con `"audio":{"main":{"name":"Vecchia","file":"xyz.mp3","volume":0.5},"special":{"name":"","file":null,"volume":0.7}}`.
18. Ferma il server e cancella `/tmp/anime-vtt-test-data`, `/tmp/anime-vtt-test-storage`, `/tmp/test-main.mp3`, `/tmp/test-main-2.mp3`, `/tmp/test-special.mp3`, `/tmp/test-special-2.mp3`.

- [ ] **Step 9: Commit**

```bash
git add server/state.js server/index.js server/exportImport.js
git commit -m "feat: split location audio track into main (autoplay) and special (on-demand)"
```

---

### Task 2: `/display` — riproduzione della traccia attiva, segnalazione fine speciale

**Files:**
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: `location.map.audio.main`/`.special`, `state.activeAudioTrack`, `state.audioState`, `state.audioTriggerSeq` (Task 1).
- Produces: evento `audio:specialEnded` (emesso verso il server).

- [ ] **Step 1: Riscrivi `renderAudio()` e il suo punto di chiamata**

L'attuale:

```js
  renderCompass(location, showingImage);
  renderAudio(location, state.audioState);
```

diventa:

```js
  renderCompass(location, showingImage);
  renderAudio(location, state.activeAudioTrack, state.audioState, state.audioTriggerSeq);
```

L'attuale:

```js
// L'elemento <audio> non è mai visibile -- solo suono, indipendente da quale
// layer (mappa o immagine) è mostrato in quel momento, in linea con la
// scelta di design che mostrare un'immagine ai giocatori non ferma l'audio.
// `lastAudioFile` evita di riassegnare `src` (che farebbe ripartire da zero
// anche una traccia identica) a ogni singolo state:update.
let lastAudioFile = null;

function renderAudio(location, audioState) {
  const audio = location && location.map.audio;
  const file = audio && audio.file;

  if (file !== lastAudioFile) {
    lastAudioFile = file;
    if (file) {
      sceneAudioEl.src = `/storage/audio/${file}`;
    } else {
      sceneAudioEl.removeAttribute('src');
      sceneAudioEl.load();
    }
  }

  sceneAudioEl.volume = audio && audio.volume !== undefined ? audio.volume : 0.7;

  if (!file) return;

  if (audioState === 'playing') {
    // Un file audio mancante/corrotto rifiuta play() con una promise
    // rigettata: fallisce silenziosamente, stesso principio già in uso per
    // mappe/immagini con riferimenti non validi -- niente crash della pagina.
    sceneAudioEl.play().catch(() => {});
  } else if (audioState === 'paused') {
    sceneAudioEl.pause();
  } else {
    sceneAudioEl.pause();
    sceneAudioEl.currentTime = 0;
  }
}
```

diventa:

```js
// L'elemento <audio> non è mai visibile -- solo suono, indipendente da quale
// layer (mappa o immagine) è mostrato in quel momento, in linea con la
// scelta di design che mostrare un'immagine ai giocatori non ferma l'audio.
// `lastAudioKey` combina slot attivo + file: evita di riassegnare `src`
// (che farebbe ripartire da zero anche una traccia identica) a ogni singolo
// state:update, ma forza comunque il reload quando si passa da main a
// special (o viceversa) anche se per coincidenza nessuno dei due ha un file.
let lastAudioKey = null;
// Premere di nuovo "Traccia speciale" mentre sta già suonando non cambia né
// lo slot né il file (stesso `lastAudioKey`), quindi non ricaricherebbe da
// solo il src -- ma deve comunque far ripartire la traccia da capo. Il
// server incrementa `audioTriggerSeq` a ogni audio:playSpecial; qui basta
// accorgersi che è cambiato mentre la traccia attiva è 'special'.
let lastAudioTriggerSeq = null;

function renderAudio(location, activeAudioTrack, audioState, audioTriggerSeq) {
  const track = location && location.map.audio[activeAudioTrack];
  const file = track && track.file;
  const key = `${activeAudioTrack}:${file || ''}`;
  const keyChanged = key !== lastAudioKey;

  if (keyChanged) {
    lastAudioKey = key;
    // La principale è sempre in loop, la speciale mai: senza questo, uno
    // sting speciale non fermerebbe mai da solo per far tornare la
    // principale, o peggio la principale si fermerebbe dopo un solo giro.
    sceneAudioEl.loop = activeAudioTrack === 'main';
    if (file) {
      sceneAudioEl.src = `/storage/audio/${file}`;
    } else {
      sceneAudioEl.removeAttribute('src');
      sceneAudioEl.load();
    }
  }

  const retriggered = activeAudioTrack === 'special' && audioTriggerSeq !== lastAudioTriggerSeq;
  lastAudioTriggerSeq = audioTriggerSeq;
  // Se il src è già stato ricaricato sopra (keyChanged), riparte già da zero
  // da solo -- azzerare di nuovo qui sarebbe innocuo ma ridondante.
  if (retriggered && !keyChanged) {
    sceneAudioEl.currentTime = 0;
  }

  sceneAudioEl.volume = track && track.volume !== undefined ? track.volume : 0.7;

  if (!file) return;

  if (audioState === 'playing') {
    // Un file audio mancante/corrotto rifiuta play() con una promise
    // rigettata: fallisce silenziosamente, stesso principio già in uso per
    // mappe/immagini con riferimenti non validi -- niente crash della pagina.
    sceneAudioEl.play().catch(() => {});
  } else if (audioState === 'paused') {
    sceneAudioEl.pause();
  } else {
    sceneAudioEl.pause();
    sceneAudioEl.currentTime = 0;
  }
}
```

- [ ] **Step 2: Rimuovi l'attributo `loop` statico dall'HTML e aggiungi il listener `ended`**

In `public/display/index.html`, l'attuale:

```html
  <audio id="scene-audio" loop hidden></audio>
```

diventa (il loop è ora sempre impostato via JS in `renderAudio()`, dipende da quale traccia è attiva):

```html
  <audio id="scene-audio" hidden></audio>
```

In `public/display/display.js`, subito dopo la riga `const sceneAudioEl = document.getElementById('scene-audio');`, aggiungi:

```js
// Scatta solo per la speciale (mai in loop): la principale, essendo sempre
// in loop, non genera mai `ended`. Non decide da solo di tornare alla
// principale -- si limita a riportare il fatto al server.
sceneAudioEl.addEventListener('ended', () => {
  socket.emit('audio:specialEnded');
});
```

- [ ] **Step 3: Verifica manuale**

Con un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei come nel Task 1) e un vero file audio breve e riproducibile (non `touch` questa volta — serve che finisca davvero in pochi secondi per testare la fine naturale):
1. Carica quel file come traccia `main` sulla location attiva, apri `/display`. Dalla console: `io().emit('audio:play', {})` → parte, in loop (verificabile lasciandolo suonare oltre la sua durata: riparte da capo da solo).
2. Carica lo stesso file breve come traccia `special`. `io().emit('audio:playSpecial', {})` → smette di sentirsi la principale, parte la speciale.
3. Lascia che la speciale arrivi alla fine naturale (durata breve, pochi secondi) → l'elemento genera `ended`, la console mostra l'emit di `audio:specialEnded`; poco dopo (round-trip col server) la principale riparte da sola.
4. Ripeti il punto 2, questa volta `io().emit('audio:stop', {})` prima che la speciale finisca da sola → si torna comunque alla principale (verifica il ramo "Stop mentre suona la speciale", non solo la fine naturale).
5. Fai ripartire la speciale (`io().emit('audio:playSpecial', {})`), lasciala suonare qualche secondo (controlla `document.getElementById('scene-audio').currentTime` dalla console, deve essere ben oltre 0), poi `io().emit('audio:playSpecial', {})` di nuovo senza fermarla → `currentTime` torna a 0 e riparte da capo (questo è il caso che il contatore `audioTriggerSeq` esiste apposta per coprire: lo slot e il file non cambiano, quindi senza quel contatore la traccia continuerebbe da dove si trovava invece di ripartire).
6. `io().emit('audio:volume', { volume: 0.2 })` mentre suona una delle due tracce → il volume dell'elemento cambia subito.
7. Mostra un'immagine ai giocatori mentre una traccia suona → l'audio continua (comportamento invariato dalla feature originale).
8. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 4: Commit**

```bash
git add public/display/display.js public/display/index.html
git commit -m "feat: play main/special audio track and report special-track end to server"
```

---

### Task 3: `/control` — tasto "Traccia speciale", etichetta traccia attiva

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `location.map.audio.main`/`.special`, `state.activeAudioTrack`, `state.audioState` (Task 1). Evento `audio:playSpecial` (Task 1). Riusa `getActiveLocation()` già esistente.
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Aggiungi l'icona "speciale" in `public/control/index.html`**

Dentro il blocco `<svg style="display:none">` (dopo l'ultimo `<symbol>` esistente, `i-stop`), aggiungi:

```html
  <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></symbol>
```

- [ ] **Step 2: Riscrivi la sezione `#audio-section`**

L'attuale:

```html
      <section id="audio-section" class="control-section" hidden>
        <h2>Audio</h2>
        <div class="opacity-row">
          <button id="audio-play-pause" class="icon-btn" title="Play/Pausa">
            <svg class="icon"><use id="audio-play-pause-icon" href="#i-play"></use></svg>
          </button>
          <button id="audio-stop" class="icon-btn" title="Stop">
            <svg class="icon"><use href="#i-stop"></use></svg>
          </button>
        </div>
        <div class="zoom">
          <button id="audio-volume-out" title="Riduci volume">−</button>
          <span id="audio-volume-level">70%</span>
          <button id="audio-volume-in" title="Aumenta volume">+</button>
        </div>
      </section>
```

diventa:

```html
      <section id="audio-section" class="control-section" hidden>
        <h2>Audio</h2>
        <div id="audio-special-row" class="opacity-row" hidden>
          <span>Traccia speciale</span>
          <button id="audio-special-btn" class="icon-btn" title="Fai partire la traccia speciale">
            <svg class="icon"><use href="#i-bolt"></use></svg>
          </button>
        </div>
        <div id="audio-playback-group" hidden>
          <p id="audio-track-label" class="hint"></p>
          <div class="opacity-row">
            <button id="audio-play-pause" class="icon-btn" title="Play/Pausa">
              <svg class="icon"><use id="audio-play-pause-icon" href="#i-play"></use></svg>
            </button>
            <button id="audio-stop" class="icon-btn" title="Stop">
              <svg class="icon"><use href="#i-stop"></use></svg>
            </button>
          </div>
          <div class="zoom">
            <button id="audio-volume-out" title="Riduci volume">−</button>
            <span id="audio-volume-level">70%</span>
            <button id="audio-volume-in" title="Aumenta volume">+</button>
          </div>
        </div>
      </section>
```

- [ ] **Step 3: Aggiungi lo stile di spaziatura in `public/control/control.css`**

Dopo la regola `#audio-play-pause.active { ... }`, aggiungi:

```css
#audio-playback-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#audio-special-row {
  margin-bottom: 10px;
}
```

- [ ] **Step 4: Aggiorna i riferimenti DOM in `public/control/control.js`**

L'attuale:

```js
const audioSection = document.getElementById('audio-section');
const audioPlayPauseBtn = document.getElementById('audio-play-pause');
const audioPlayPauseIcon = document.getElementById('audio-play-pause-icon');
const audioStopBtn = document.getElementById('audio-stop');
const audioVolumeOutBtn = document.getElementById('audio-volume-out');
const audioVolumeInBtn = document.getElementById('audio-volume-in');
const audioVolumeLevel = document.getElementById('audio-volume-level');
```

diventa:

```js
const audioSection = document.getElementById('audio-section');
const audioSpecialRow = document.getElementById('audio-special-row');
const audioSpecialBtn = document.getElementById('audio-special-btn');
const audioPlaybackGroup = document.getElementById('audio-playback-group');
const audioTrackLabel = document.getElementById('audio-track-label');
const audioPlayPauseBtn = document.getElementById('audio-play-pause');
const audioPlayPauseIcon = document.getElementById('audio-play-pause-icon');
const audioStopBtn = document.getElementById('audio-stop');
const audioVolumeOutBtn = document.getElementById('audio-volume-out');
const audioVolumeInBtn = document.getElementById('audio-volume-in');
const audioVolumeLevel = document.getElementById('audio-volume-level');
```

- [ ] **Step 5: Riscrivi la resa nella funzione `render()`**

L'attuale:

```js
  // A differenza delle sezioni sopra, l'audio riflette sempre la location
  // ATTIVA (`location`, non `previewLocation`): i comandi non hanno un
  // concetto di anteprima, quindi anche la UI non deve suggerirne uno.
  const audioTrack = location && location.map.audio;
  const hasAudio = Boolean(audioTrack && audioTrack.file);
  audioSection.hidden = !hasAudio;
  if (hasAudio) {
    audioPlayPauseIcon.setAttribute('href', state.audioState === 'playing' ? '#i-pause' : '#i-play');
    audioPlayPauseBtn.classList.toggle('active', state.audioState === 'playing');
    audioVolumeLevel.textContent = `${Math.round((audioTrack.volume === undefined ? 0.7 : audioTrack.volume) * 100)}%`;
  }
```

diventa:

```js
  // A differenza delle sezioni sopra, l'audio riflette sempre la location
  // ATTIVA (`location`, non `previewLocation`): i comandi non hanno un
  // concetto di anteprima, quindi anche la UI non deve suggerirne uno.
  const audio = location && location.map.audio;
  const hasMain = Boolean(audio && audio.main && audio.main.file);
  const hasSpecial = Boolean(audio && audio.special && audio.special.file);
  audioSection.hidden = !hasMain && !hasSpecial;
  audioSpecialRow.hidden = !hasSpecial;

  const activeTrack = audio && audio[state.activeAudioTrack];
  const hasActiveTrack = Boolean(activeTrack && activeTrack.file);
  audioPlaybackGroup.hidden = !hasActiveTrack;
  if (hasActiveTrack) {
    audioTrackLabel.textContent = state.activeAudioTrack === 'special' ? 'Speciale' : 'Principale';
    audioPlayPauseIcon.setAttribute('href', state.audioState === 'playing' ? '#i-pause' : '#i-play');
    audioPlayPauseBtn.classList.toggle('active', state.audioState === 'playing');
    audioVolumeLevel.textContent = `${Math.round((activeTrack.volume === undefined ? 0.7 : activeTrack.volume) * 100)}%`;
  }
```

- [ ] **Step 6: Aggiorna `stepAudioVolume()` e aggiungi il click handler della speciale**

L'attuale:

```js
function stepAudioVolume(delta) {
  const location = getActiveLocation();
  if (!location || !location.map.audio || !location.map.audio.file) return;
  const current = location.map.audio.volume === undefined ? 0.7 : location.map.audio.volume;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('audio:volume', { volume: next });
}
audioVolumeOutBtn.addEventListener('click', () => stepAudioVolume(-AUDIO_VOLUME_STEP));
```

diventa:

```js
function stepAudioVolume(delta) {
  const location = getActiveLocation();
  const track = location && location.map.audio[state.activeAudioTrack];
  if (!track || !track.file) return;
  const current = track.volume === undefined ? 0.7 : track.volume;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('audio:volume', { volume: next });
}
audioVolumeOutBtn.addEventListener('click', () => stepAudioVolume(-AUDIO_VOLUME_STEP));
```

(`audioPlayPauseBtn`/`audioStopBtn`'s click handlers restano invariati: emettono già eventi senza payload, e la risoluzione di quale traccia sia interessata è ora tutta lato server.)

In fondo al file, aggiungi:

```js
audioSpecialBtn.addEventListener('click', () => {
  socket.emit('audio:playSpecial', {});
});
```

- [ ] **Step 7: Verifica manuale**

Con un server isolato e le due tracce già caricate sulla location attiva (come nel Task 1, Step 8 punti 2 e 5):
1. Apri `/control`, scheda Mappa: sotto "Rosa dei venti" appare la sezione "Audio" con il pulsante "Traccia speciale" e, sotto, l'etichetta "Principale" con Play/Pausa/Stop/volume (la principale ha un file, quindi il gruppo playback è già visibile anche prima di premere Play).
2. Clicca Play sulla principale: apri anche `/display` — suona lei. Clicca "Traccia speciale": la principale si ferma, parte la speciale, l'etichetta cambia a "Speciale", Play/Pausa/Stop/volume ora agiscono su di lei.
3. Lascia che la speciale finisca da sola (traccia breve) → l'etichetta torna a "Principale", che riparte da sola; oppure premi Stop mentre la speciale suona → stesso risultato immediato.
4. Rimuovi (o non caricare mai) la traccia speciale su un'altra location: la riga "Traccia speciale" non compare, resta solo il gruppo Play/Pausa/Stop/volume se la principale esiste.
5. Su una location con **solo** la traccia speciale caricata (nessuna principale): la sezione "Audio" mostra solo il pulsante "Traccia speciale", senza alcun gruppo Play/Pausa/Stop/volume (la principale non esiste, quindi non c'è nulla da controllare finché non parte la speciale). Cliccalo → il gruppo playback compare con l'etichetta "Speciale"; fermala (Stop) → il gruppo sparisce di nuovo (si torna a `activeAudioTrack:'main'`, ma `main` non ha un file).
6. Location senza nessuna traccia (né principale né speciale): l'intera sezione "Audio" sparisce.
7. Cambia volume con +/- mentre l'etichetta mostra "Speciale": il volume della speciale cambia; torna alla principale (Stop o fine naturale) e verifica che il suo volume sia rimasto quello impostato in precedenza, indipendente da quello appena cambiato sulla speciale.
8. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 8: Commit**

```bash
git add public/control/index.html public/control/control.css public/control/control.js
git commit -m "feat: special-track trigger and active-track playback controls in /control"
```

---

### Task 4: `/editor` — pannelli separati per traccia principale e speciale

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: `location.map.audio.main`/`.special`, route `POST /api/upload/audio` (con `slot`), eventi `audio:delete`/`audio:rename` (con `slot`) (Task 1). Riusa `getActiveLocation()`, le classi CSS `.panel`/`.file-btn`/`.image-card`/`.image-editor-row`/`.image-name-input`/`.image-delete` già esistenti (nessuna nuova classe CSS necessaria).
- Produces: nessuna interfaccia per altri task (ultimo task del piano).

- [ ] **Step 1: Sdoppia la sezione in `public/editor/index.html`**

L'attuale:

```html
    <section class="panel">
      <h2>Audio</h2>
      <div id="audio-content"></div>
    </section>
```

diventa:

```html
    <section class="panel">
      <h2>Traccia principale</h2>
      <div id="audio-main-content"></div>
    </section>

    <section class="panel">
      <h2>Traccia speciale</h2>
      <div id="audio-special-content"></div>
    </section>
```

- [ ] **Step 2: Aggiorna il riferimento DOM in `public/editor/editor.js`**

L'attuale:

```js
const audioContent = document.getElementById('audio-content');
```

diventa:

```js
const audioMainContent = document.getElementById('audio-main-content');
const audioSpecialContent = document.getElementById('audio-special-content');
```

- [ ] **Step 3: Generalizza lo stato arma-poi-conferma e la resa per slot**

L'attuale:

```js
// Stesso pattern arma-poi-conferma delle immagini, ma per un solo elemento
// (non c'è un id per riga: la coppia location+file fa da chiave, così l'arm
// non sopravvive a un cambio location o a una sostituzione traccia).
let audioDeleteArmedFor = null;
let audioDeleteTimer = null;

function getAudioDeleteKey(location) {
  const audio = location && location.map.audio;
  if (!audio || !audio.file) return null;
  return `${location.id}:${audio.file}`;
}

function clearAudioDeleteArm() {
  clearTimeout(audioDeleteTimer);
  audioDeleteTimer = null;
  audioDeleteArmedFor = null;
}

function renderAudioPanel(location) {
  const audio = location.map.audio;
  if (!audio || !audio.file) {
    clearAudioDeleteArm();
    audioContent.innerHTML = `
      <label class="file-btn">Carica traccia audio<input type="file" id="audio-upload" accept="audio/*"></label>
    `;
    return;
  }
  const key = getAudioDeleteKey(location);
  if (audioDeleteArmedFor !== null && audioDeleteArmedFor !== key) {
    // Stato armato apparteneva a un'altra location/traccia: non riportarlo qui.
    clearAudioDeleteArm();
  }
  const armed = audioDeleteArmedFor === key;
  audioContent.innerHTML = `
    <div class="image-card">
      <div class="image-editor-row">
        <input type="text" class="image-name-input" id="audio-name-input" value="${escapeHtml(audio.name)}" placeholder="etichetta">
        <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" id="audio-delete-btn"
                title="${armed ? 'Click di nuovo per confermare' : 'Elimina traccia'}">
          <svg class="icon"><use href="#i-trash"></use></svg>
        </button>
      </div>
      <label class="file-btn">Sostituisci traccia<input type="file" id="audio-upload" accept="audio/*"></label>
    </div>
  `;
}
```

diventa:

```js
// Stesso pattern arma-poi-conferma delle immagini, ma per le due tracce
// audio (principale e speciale) indipendentemente: una coppia di stato per
// ciascuno slot, così l'arm di uno non sopravvive a un cambio location o a
// una sostituzione traccia, e non si mescola con l'arm dell'altro slot.
const audioDeleteState = {
  main: { armedFor: null, timer: null },
  special: { armedFor: null, timer: null }
};

function getAudioDeleteKey(location, slot) {
  const track = location && location.map.audio[slot];
  if (!track || !track.file) return null;
  return `${location.id}:${track.file}`;
}

function clearAudioDeleteArm(slot) {
  clearTimeout(audioDeleteState[slot].timer);
  audioDeleteState[slot].timer = null;
  audioDeleteState[slot].armedFor = null;
}

function renderAudioSlot(location, slot, containerEl, uploadLabel) {
  const track = location.map.audio[slot];
  if (!track || !track.file) {
    clearAudioDeleteArm(slot);
    containerEl.innerHTML = `
      <label class="file-btn">${uploadLabel}<input type="file" class="audio-upload" accept="audio/*"></label>
    `;
    return;
  }
  const key = getAudioDeleteKey(location, slot);
  const s = audioDeleteState[slot];
  if (s.armedFor !== null && s.armedFor !== key) {
    // Stato armato apparteneva a un'altra location/traccia: non riportarlo qui.
    clearAudioDeleteArm(slot);
  }
  const armed = s.armedFor === key;
  containerEl.innerHTML = `
    <div class="image-card">
      <div class="image-editor-row">
        <input type="text" class="image-name-input audio-name-input" value="${escapeHtml(track.name)}" placeholder="etichetta">
        <button class="icon-btn image-delete ${armed ? 'confirm' : ''} audio-delete-btn"
                title="${armed ? 'Click di nuovo per confermare' : 'Elimina traccia'}">
          <svg class="icon"><use href="#i-trash"></use></svg>
        </button>
      </div>
      <label class="file-btn">Sostituisci traccia<input type="file" class="audio-upload" accept="audio/*"></label>
    </div>
  `;
}

function renderAudioPanel(location) {
  renderAudioSlot(location, 'main', audioMainContent, 'Carica traccia principale');
  renderAudioSlot(location, 'special', audioSpecialContent, 'Carica traccia speciale');
}
```

(`renderAudioPanel(location)` resta il punto di chiamata unico dalla funzione `render()` principale — nessuna modifica lì.)

- [ ] **Step 4: Aggiorna il ramo "nessuna location attiva"**

L'attuale:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    audioContent.innerHTML = '';
```

diventa:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    audioMainContent.innerHTML = '';
    audioSpecialContent.innerHTML = '';
```

- [ ] **Step 5: Sostituisci i listener delegati con una versione parametrizzata per slot**

L'attuale:

```js
// L'input file viene ricreato a ogni renderAudioPanel() (l'id è lo stesso,
// "audio-upload", sia nello stato "nessuna traccia" che "sostituisci"), quindi
// il listener va sul contenitore stabile `audioContent`, non sull'input.
audioContent.addEventListener('change', async (e) => {
  const fileInput = e.target.closest('#audio-upload');
  if (fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', state.activeLocationId);
    formData.append('name', file.name);
    await fetch('/api/upload/audio', { method: 'POST', body: formData });
    fileInput.value = '';
    return;
  }

  const nameInput = e.target.closest('#audio-name-input');
  if (nameInput) {
    socket.emit('audio:rename', { locationId: state.activeLocationId, name: nameInput.value });
  }
});

audioContent.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('#audio-delete-btn');
  if (!deleteBtn) return;

  const location = getActiveLocation();
  const key = getAudioDeleteKey(location);
  if (!key) return;

  if (audioDeleteArmedFor !== key) {
    audioDeleteArmedFor = key;
    renderAudioPanel(location);
    clearTimeout(audioDeleteTimer);
    audioDeleteTimer = setTimeout(() => {
      // Si disarma solo se è ancora la stessa location+traccia per cui è
      // scattato il timer: nel frattempo potrebbe essere già stato
      // invalidato (e magari riarmato) da un cambio location o da render.
      if (audioDeleteArmedFor !== key) return;
      audioDeleteArmedFor = null;
      audioDeleteTimer = null;
      const loc = getActiveLocation();
      if (loc) renderAudioPanel(loc);
    }, 2500);
    return;
  }

  clearAudioDeleteArm();
  socket.emit('audio:delete', { locationId: state.activeLocationId });
});
```

diventa:

```js
// L'input file viene ricreato a ogni renderAudioSlot() (la classe è la
// stessa, "audio-upload", sia nello stato "nessuna traccia" che
// "sostituisci"), quindi il listener va sul contenitore stabile di ogni
// slot, non sull'input -- una coppia di listener per slot, con lo slot
// fissato in chiusura invece che letto da un data-attribute.
function setupAudioSlotListeners(containerEl, slot, uploadLabel) {
  containerEl.addEventListener('change', async (e) => {
    const fileInput = e.target.closest('.audio-upload');
    if (fileInput) {
      const file = fileInput.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('locationId', state.activeLocationId);
      formData.append('name', file.name);
      formData.append('slot', slot);
      await fetch('/api/upload/audio', { method: 'POST', body: formData });
      fileInput.value = '';
      return;
    }

    const nameInput = e.target.closest('.audio-name-input');
    if (nameInput) {
      socket.emit('audio:rename', { locationId: state.activeLocationId, slot, name: nameInput.value });
    }
  });

  containerEl.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.audio-delete-btn');
    if (!deleteBtn) return;

    const location = getActiveLocation();
    const key = getAudioDeleteKey(location, slot);
    if (!key) return;
    const s = audioDeleteState[slot];

    if (s.armedFor !== key) {
      s.armedFor = key;
      renderAudioSlot(location, slot, containerEl, uploadLabel);
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        // Si disarma solo se è ancora la stessa location+traccia per cui è
        // scattato il timer: nel frattempo potrebbe essere già stato
        // invalidato (e magari riarmato) da un cambio location o da render.
        if (s.armedFor !== key) return;
        s.armedFor = null;
        s.timer = null;
        const loc = getActiveLocation();
        if (loc) renderAudioSlot(loc, slot, containerEl, uploadLabel);
      }, 2500);
      return;
    }

    clearAudioDeleteArm(slot);
    socket.emit('audio:delete', { locationId: state.activeLocationId, slot });
  });
}

setupAudioSlotListeners(audioMainContent, 'main', 'Carica traccia principale');
setupAudioSlotListeners(audioSpecialContent, 'special', 'Carica traccia speciale');
```

- [ ] **Step 6: Verifica manuale**

Con un server isolato:
1. Apri `/editor`. Nella sidebar compaiono due pannelli distinti, "Traccia principale" e "Traccia speciale", ciascuno col proprio pulsante "Carica traccia...".
2. Carica un file (anche un `.mp3` fittizio con `touch`, per verificare solo il flusso UI) su "Traccia principale": il pannello passa a mostrare nome/elimina/sostituisci; "Traccia speciale" resta indipendente e invariato.
3. Carica un altro file su "Traccia speciale": stesso comportamento, indipendente dal primo pannello.
4. Arma l'eliminazione su "Traccia principale" (un click) e, entro i 2.5s, arma anche quella su "Traccia speciale": verifica che siano armati indipendentemente (due stati "conferma" contemporanei, uno per pannello, senza interferenze) — poi conferma solo quello della principale con un secondo click: solo la principale viene eliminata, la speciale resta armata fino alla sua stessa scadenza o conferma.
5. Modifica il nome su uno dei due pannelli e verifica (via `curl .../api/state`) che sia cambiato solo lo slot corretto.
6. Apri `/control` con entrambe le tracce e la principale in riproduzione: sostituisci la speciale da `/editor` mentre non sta suonando → nessun effetto sulla riproduzione in corso (solo se la speciale FOSSE quella attiva si fermerebbe, verificato lato server nel Task 1).
7. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 7: Commit**

```bash
git add public/editor/index.html public/editor/editor.js
git commit -m "feat: separate main/special audio track panels in /editor"
```
