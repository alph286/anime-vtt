# /handout: default per location da un archivio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /handout mostra il media in onda su /display, altrimenti il default della location attiva, altrimenti un default globale; i default si scelgono da un archivio dedicato gestito come quello audio.

**Architecture:** Nuovo archivio `state.handoutLibrary` con file in `storage/handout/`; modello in `server/handout.js` (stesso stile di `server/audio.js`), cablato in `server/index.js`. La scelta di cosa mostrare è una funzione pura in `public/shared/media.js` usata da `public/handout/handout.js`. /editor: riquadro "Handout di default" nella scheda Media e dialog archivio sul modello di `AudioLibraryDialog`.

**Tech Stack:** Node/Express/socket.io (server, `node --test`), vanilla JS (/handout), React + shadcn + Zustand + Vitest (`editor-app/`).

**Spec:** `docs/superpowers/specs/2026-11-13-handout-default-location-design.md`

## Global Constraints

- Branch `handout-default-location` (già creato). Commit senza righe `Co-Authored-By` né altre attribuzioni.
- /control, /display e /party invariati (nessun file sotto `editor-app/src/control`, `editor-app/src/party`, `public/display`).
- Archivio: immagini e video, stessi filtri e limite di `uploadImage` (`makeUpload(..., { allowVideo: true, maxFileSize: 150 * 1024 * 1024 })`).
- Cartella file: `storage/handout/` (`HANDOUT_DIR = path.join(STORAGE_DIR, 'handout')`), servita da `/storage/handout/<file>` (già coperta da `app.use('/storage', ...)`).
- Pagine Web (`isWebItem`) mai mostrate su /handout.
- Mai test sui dati vivi: server di prova su porta 3100 con `DATA_DIR`/`STORAGE_DIR` temporanei.
- Build `public/editor/` ricostruita e committata (`npm run build:editor`).

## Review Focus

- Media in onda che è una pagina Web → /handout mostra il default (location o globale), non nero. Test in Task 1.
- `activeImageId` che punta a un media eliminato o di un'altra location → si usa il default. Test in Task 1.
- Eliminare una voce usata sia da location sia come globale → tutti i riferimenti azzerati e file cancellato. Test in Task 2.
- Import di una location da un altro server con `handoutDefaultId` sconosciuto → azzerato da `migrate`. Test in Task 3.
- Stato vecchio con `defaultMedia` valido → diventa voce dell'archivio con file copiato e default globale; con copia fallita (`copyHandoutFile` → null) niente voce e nessun crash. Test in Task 3.

---

### Task 1: Scelta del media di /handout (shared)

**Files:**
- Modify: `public/shared/media.js:72-86` (sostituire `findHandoutMedia`/`resolveHandoutMedia`) e l'export a fine file
- Test: `public/shared/media.test.js:305-338` (sostituire i due test esistenti)

**Interfaces:**
- Produces: `resolveHandoutMedia(state) -> { file: string, src: string } | null`. `src` è `/storage/images/<file>` per il media in onda, `/storage/handout/<file>` per un default. `findHandoutMedia` viene tolta (nessun altro chiamante dopo Task 4).

Priorità: (1) location attiva `state.activeLocationId`, suo `images` con id `state.activeImageId`, con `file` e non Web; (2) voce di `state.handoutLibrary` con id `location.handoutDefaultId`; (3) voce con id `state.handout.defaultId`; (4) `null`. Ogni passo salta riferimenti rotti.

- [ ] **Step 1: Scrivere i test che falliscono** — `test('resolveHandoutMedia: in onda, poi default location, poi globale, poi niente', ...)` con uno stato `{ activeLocationId:'L', activeImageId, locations:[{id:'L', handoutDefaultId, images:[{id:'foto',file:'a.png'},{id:'sito',url:'http://x',file:null}]}], handoutLibrary:[{id:'H1',name:'Mappa',file:'h1.png'},{id:'G',name:'Copertina',file:'g.mp4'}], handout:{defaultId:'G'} }` e asserzioni:
  - `activeImageId:'foto'` → `{ file:'a.png', src:'/storage/images/a.png' }`
  - `activeImageId:'sito'`, `handoutDefaultId:'H1'` → `{ file:'h1.png', src:'/storage/handout/h1.png' }`
  - `activeImageId:'via'` (inesistente), `handoutDefaultId:'H1'` → `h1.png`
  - `activeImageId:null`, `handoutDefaultId:null` → `{ file:'g.mp4', src:'/storage/handout/g.mp4' }`
  - `handoutDefaultId:'sparito'` → globale `g.mp4`
  - globale `null` e nessun altro → `null`; `resolveHandoutMedia(undefined)` → `null`; `activeLocationId` inesistente → globale.
- [ ] **Step 2:** `node --test public/shared/media.test.js` → FAIL sul nuovo test.
- [ ] **Step 3:** Implementare `resolveHandoutMedia` in `public/shared/media.js` (aggiornare il commento sopra).
- [ ] **Step 4:** `node --test public/shared/media.test.js` → tutti PASS.
- [ ] **Step 5:** Commit `feat(handout): /handout sceglie in onda, default location, default globale`.

### Task 2: Modello dell'archivio (server/handout.js)

**Files:**
- Create: `server/handout.js`
- Test: `server/handout.test.js` (già incluso da `npm run test:server` via `server/*.test.js`)

**Interfaces:**
- Produces (CommonJS, `nanoid` come in `server/audio.js`):
  - `normalizeHandout(state) -> void`: `state.handoutLibrary` array di `{id,name,file}` (scarta voci senza `file`; nome con `cleanHandoutName`), `state.handout = { defaultId }` (toglie `shown`/`defaultMedia`), ogni location con `handoutDefaultId` (`null` se mancante o non nell'archivio), `defaultId` a `null` se non nell'archivio.
  - `cleanHandoutName(n) -> string`: stringa troncata a 80 caratteri, `''` se non stringa.
  - `addHandoutItem(state, { name, file }) -> item`
  - `renameHandoutItem(state, id, name) -> boolean`
  - `removeHandoutItem(state, id) -> string | null` (file da cancellare; azzera `handoutDefaultId` delle location e `handout.defaultId` che puntavano lì)
  - `setHandoutDefault(state, { locationId, id }) -> boolean`: `locationId` null/assente = globale; `id` null = nessuno; location o id sconosciuti → `false` senza modifiche.
  - `handoutLibraryFiles(state) -> string[]`

- [ ] **Step 1: Test che falliscono** in `server/handout.test.js`:
  - `normalizeHandout` su `{ locations:[{id:'A'},{id:'B',handoutDefaultId:'X'}], handout:{shown:{}, defaultMedia:{}} }` → `handoutLibrary` `[]`, `handout` `{defaultId:null}`, entrambe le location `handoutDefaultId:null`.
  - `normalizeHandout` tiene `handoutDefaultId:'H'` se `H` è nell'archivio, scarta la voce `{id:'Z'}` senza file.
  - `addHandoutItem` → voce con id stringa non vuota, presente in `handoutLibrary`.
  - `setHandoutDefault(s,{locationId:'A',id:'H'})` → true e `A.handoutDefaultId==='H'`; `{id:'H'}` → globale `'H'`; `{locationId:'A',id:null}` → `null`; `{locationId:'nope',id:'H'}` e `{locationId:'A',id:'nope'}` → false.
  - `removeHandoutItem` su `H` usato da A e come globale → ritorna `'h.png'`, A e globale `null`, archivio senza `H`; id sconosciuto → `null`.
  - `renameHandoutItem` → true e nome cambiato; nome di 200 caratteri → 80.
  - `handoutLibraryFiles` → `['h.png']`.
- [ ] **Step 2:** `node --test server/handout.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** Implementare `server/handout.js`.
- [ ] **Step 4:** `node --test server/handout.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(handout): modello dell'archivio dei default`.

### Task 3: Migrazione (server/state.js)

**Files:**
- Modify: `server/state.js` (`DEFAULT_STATE.handout`, `migrate`, `pruneHandout`, `loadState`, export)
- Test: `server/state.test.js:88-102` (sostituire i due test handout)

**Interfaces:**
- Consumes: `normalizeHandout`, `addHandoutItem` (Task 2).
- Produces: `migrate(state, { audioKey, copyHandoutFile })`, `loadState({ audioKey, copyHandoutFile })`. `copyHandoutFile(imagesFile) -> string | null` copia un file da `storage/images` a `storage/handout` e ritorna il nuovo nome. `pruneHandout` sparisce dagli export.

- [ ] **Step 1: Test che falliscono:**
  - stato vecchio senza `handout` → dopo `migrate` `handout` `{defaultId:null}`, `handoutLibrary` `[]`.
  - `handout:{shown:ref, defaultMedia:{locationId:'loc',imageId:'foto'}}` con `foto` file `a.png` e `copyHandoutFile: (f) => 'copia-' + f` → una voce `{name: <nome di foto>, file:'copia-a.png'}`, `handout.defaultId` = suo id, niente `shown`/`defaultMedia`.
  - stesso stato con `copyHandoutFile: () => null` → archivio vuoto, `defaultId:null`.
  - `defaultMedia` che punta a una pagina Web o a un media inesistente → nessuna voce.
  - location con `handoutDefaultId:'estraneo'` → `null`.
  - `migrate` due volte di fila sullo stesso stato → una sola voce (idempotente).
- [ ] **Step 2:** `node --test server/state.test.js` → FAIL.
- [ ] **Step 3:** In `migrate`, prima di `normalizeHandout`: se `state.handout?.defaultMedia` punta a un media con `file` non Web e c'è `copyHandoutFile`, copiarlo e aggiungere la voce come `defaultId`. Poi `normalizeHandout(state)` al posto di `pruneHandout(state)`. `DEFAULT_STATE.handout = { defaultId: null }`, `DEFAULT_STATE.handoutLibrary = []`. `loadState` passa `copyHandoutFile` a `migrate`.
- [ ] **Step 4:** `node --test server/state.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(handout): migrazione del vecchio default nell'archivio`.

### Task 4: Cablaggio server (server/index.js)

**Files:**
- Modify: `server/index.js` (costanti cartelle ~r.24-43, `loadState` r.65, orfani r.166-193, `location:delete` r.584-590, `image:show`/`handout:setDefault` r.642-667, `image:delete` r.683-692, rami import r.360-400, accanto agli eventi `audioLibrary:*` r.1177)

**Interfaces:**
- Consumes: Task 2 e Task 3.
- Produces (contratto per Task 6):
  - `POST /api/upload/handout` (multipart `file`, `name` opzionale, `locationId` opzionale, `global` = `'1'` opzionale) → `{ ok:true, item }`; con `locationId` o `global` imposta anche quel default. `locationId` sconosciuto → 400 e file cancellato.
  - socket `handoutLibrary:update { id, name }`, `handoutLibrary:delete { id }` (cancella il file da `HANDOUT_DIR`), `handout:setDefault { locationId?: string|null, id: string|null }`. Ognuno salva e trasmette solo se è cambiato qualcosa.

- [ ] **Step 1:** `HANDOUT_DIR` aggiunta a cartelle create all'avvio; `uploadHandout = makeUpload(HANDOUT_DIR, { allowVideo: true, maxFileSize: 150 * 1024 * 1024 })`; funzione `copyHandoutFile(file)` (copia da `IMAGES_DIR` a `HANDOUT_DIR` con nome `${nanoid()}${ext}`, `null` su errore) passata a `loadState` e a ogni `migrate(...)` dei rami import.
- [ ] **Step 2:** `image:show` non tocca più `state.handout`; vecchio `handout:setDefault` sostituito; `pruneHandout`/`findHandoutMedia` tolti da import e chiamate (location ed image delete).
- [ ] **Step 3:** Endpoint e i tre eventi; `findOrphanFiles` aggiunge `scanDir(HANDOUT_DIR, new Set(handoutLibraryFiles(state)), 'handout')` (verificare che purge accetti il nuovo `kind`: usa `f.kind` dalla scansione, quindi sì).
- [ ] **Step 4: Verifica** — `npm run test:server` tutto verde. Poi server di prova:

```bash
D=$(mktemp -d); mkdir -p $D/data $D/storage
PORT=3100 DATA_DIR=$D/data STORAGE_DIR=$D/storage node server/index.js &
curl -s -F file=@public/home/favicon.png -F global=1 localhost:3100/api/upload/handout   # o una qualunque png
curl -s localhost:3100/api/state | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log(s.handoutLibrary.length, s.handout)"
```

Atteso: `1 { defaultId: '<id della voce>' }` e il file in `$D/storage/handout/`. Fermare il server.
- [ ] **Step 5:** Commit `feat(handout): endpoint ed eventi dell'archivio, image:show non tocca più /handout`.

### Task 5: Pagina /handout

**Files:**
- Modify: `public/handout/handout.js` (commento in testa e `state:update`)

**Interfaces:**
- Consumes: `resolveHandoutMedia(state) -> { file, src } | null` (Task 1).

- [ ] **Step 1:** Usare `item.src` al posto di `` `/storage/images/${item.file}` `` in `loadMapMedia`; aggiornare il commento in testa (in onda → default location → globale).
- [ ] **Step 2: Verifica** sul server di prova di Task 4 (Playwright su `http://localhost:3100/handout/`): con il default globale caricato l'`<img>` ha `src` `/storage/handout/...`; emettendo da un client socket.io Node `image:show` di un'immagine della location attiva cambia in `/storage/images/...`; con `image:hide` torna a `/storage/handout/...`.
- [ ] **Step 3:** Commit `feat(handout): la pagina mostra i default dall'archivio`.

### Task 6: /editor — archivio e riquadro "Handout di default"

**Files:**
- Modify: `editor-app/src/types.ts` (togliere `HandoutRef`; `HandoutLibraryItem {id,name,file}`; `VttState.handoutLibrary?`, `VttState.handout?: { defaultId: string | null }`; `Location.handoutDefaultId?: string | null`)
- Create: `editor-app/src/lib/handout-library.ts` + `handout-library.test.ts`
- Modify: `editor-app/src/components/MediaPreview.tsx` (prop `dir?: 'images' | 'handout'`, default `'images'`, usata in `src`)
- Create: `editor-app/src/sidebar/HandoutLibraryDialog.tsx` + `.test.tsx`
- Create: `editor-app/src/sidebar/HandoutDefaultBox.tsx`
- Modify: `editor-app/src/sidebar/ImagePanel.tsx` (togliere stella, `Star`, `handoutDefault`; montare `<HandoutDefaultBox />` in testa)
- Rebuild: `public/editor/`

**Interfaces:**
- Consumes: contratto di Task 4.
- Produces:
  - `handoutUsage(state: VttState, id: string): string[]` — nomi delle location con `handoutDefaultId === id` nell'ordine delle location, più `'default globale'` in coda se `state.handout?.defaultId === id`.
  - `uploadHandoutFiles(files: File[]): Promise<string[]>` — un `POST /api/upload/handout` per file, in sequenza, `name` = nome senza estensione; i video passano prima da `checkVideoSafe` (se non ok il file va negli errori); ritorna i nomi non caricati. (Il dialog carica solo nell'archivio: il default si sceglie poi con "Usa".)
  - `HandoutLibraryDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange(o: boolean): void; target: { locationId: string | null; label: string } })`.

Dialog (stessa struttura di `AudioLibraryDialog`): titolo "Archivio handout", descrizione "Scegli l'handout di default per: {target.label}". Righe ordinate per nome: miniatura `MediaPreview dir="handout"`, `CommitInput` del nome (`handoutLibrary:update`), testo "Usato in N" / "Non usato", pulsante "Usa" (evidenziato se è il default corrente del target) che emette `handout:setDefault { locationId: target.locationId, id }` e chiude, cestino con arma-poi-conferma; se `handoutUsage` non è vuoto mostra l'avviso "Usato in: … — verrà tolto da tutte." con Elimina/Annulla. In fondo "Nessuno" (`id: null`, chiude) e "Carica" (`accept="image/*,video/*"`, `multiple`), errori come nel dialog audio.

`HandoutDefaultBox`: titolo "Handout di default", due righe: "Questa location" (target `{ locationId: location.id, label: location.name }`) e "Globale" (`{ locationId: null, label: 'tutte le location senza default' }`); ognuna con miniatura e nome della voce scelta o "Nessuno", e "Scegli…" che apre il dialog con quel target. Riga location: sotto, in piccolo, "Se vuoto vale il globale".

- [ ] **Step 1: Test che falliscono:** `handout-library.test.ts` (`handoutUsage` con due location e globale → `['Taverna','Cripta','default globale']`; non usato → `[]`; `uploadHandoutFiles` con `fetch` finto: due file, il secondo risponde 400 → `['b.png']`, due chiamate a `/api/upload/handout`). `HandoutLibraryDialog.test.tsx` (stesso mock socket di `AudioLibraryDialog.test.tsx`): "Usa" emette `handout:setDefault {locationId:'L1', id:'H'}`; "Nessuno" emette `id:null`; con target globale `locationId:null`; eliminare una voce usata mostra "Usato in: Taverna" e "Elimina" emette `handoutLibrary:delete {id}`; una non usata richiede due click.
- [ ] **Step 2:** `cd editor-app && npx vitest run src/lib/handout-library.test.ts src/sidebar/HandoutLibraryDialog.test.tsx` → FAIL.
- [ ] **Step 3:** Implementare tipi, lib, `MediaPreview`, dialog, box, modifiche a `ImagePanel`.
- [ ] **Step 4:** `cd editor-app && npm test` → tutto verde; `npx tsc --noEmit -p .` (o lo script typecheck del progetto) senza errori.
- [ ] **Step 5:** `npm run build:editor` dalla radice.
- [ ] **Step 6:** Commit `feat(editor): archivio handout e default per location/globale` (sorgenti + `public/editor/`).

### Task 7: Verifica end-to-end e documentazione

**Files:**
- Modify: `CLAUDE.md` (sezione "Pagina /handout": riscriverla col nuovo comportamento; scelte di Claude e non verificato)

- [ ] **Step 1:** Server di prova :3100 su una COPIA dei dati con uno `state.json` vecchio che ha `handout.defaultMedia` valido: dopo l'avvio l'archivio ha una voce col file copiato in `storage/handout/` e `defaultId` impostato; /handout la mostra.
- [ ] **Step 2:** Playwright su `/editor/` (:3100): riquadro con le due righe; "Scegli…" → "Carica" un'immagine → "Usa" per la location; /handout la mostra con location attiva e nessun media in onda; `image:show` → media in onda; `image:hide` → torna al default della location; cambiata la location attiva (senza default) → globale; elimina voce usata → avviso con l'elenco, poi /handout ricade sul globale; "File orfani" non elenca i file dell'archivio. Console senza errori.
- [ ] **Step 3:** `npm run test:server` e `cd editor-app && npm test` verdi, riportare i conteggi.
- [ ] **Step 4:** Aggiornare `CLAUDE.md` e committare `docs: /handout con default per location`.
