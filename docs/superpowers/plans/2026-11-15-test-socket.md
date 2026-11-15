# Fase 2: test di caratterizzazione degli eventi socket

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fissare il comportamento di oggi di ogni `socket.on(` di `server/index.js` con test che parlano al server vero, così le fasi 3 (stato filtrato) e 4 (spezzare `index.js`) hanno una rete sotto.

**Architecture:** un file `server/socket-events.test.js` (`node:test`) avvia `node server/index.js` come processo figlio su una porta libera, con `DATA_DIR` e `STORAGE_DIR` in cartelle temporanee e uno `state.json` di prova scritto prima dell'avvio, e gli parla con `socket.io-client`. Un server condiviso per tutto il gruppo principale; due server a parte per i casi che sostituiscono o uccidono il server (ripristino del backup, eccezione non gestita). Il file entra in `npm test` tramite lo script `test:server` già esistente (`server/*.test.js`).

**Tech Stack:** Node 24, socket.io 4.8 (server), socket.io-client 4.8 (nuova `devDependency` della radice), `node:test`, `fetch`/`FormData` di Node per HTTP.

**Spec:** sezione «Fase 2» di `docs/superpowers/plans/2026-11-11-piano-generale.md`.

## Global Constraints

- Branch `test-socket` creato da `manutenzione-pin-dm` (non ancora in `main`). Niente push, niente merge.
- NESSUNA modifica a `server/index.js` né agli altri file di `server/` già esistenti. Si aggiungono solo file nuovi.
- Se un test rivela un bug: si fissa il comportamento attuale con un commento `// BUG noto: ...` e lo si elenca nel resoconto. Non si corregge.
- Mai i dati veri (`data/`, `storage/`), mai la porta 3000. `DM_PIN` vuoto nel processo figlio e `cwd` in una cartella temporanea (così `dotenv` non legge il `.env` del repo).
- Nei commit nessuna riga `Co-Authored-By` né altre righe di attribuzione.
- Regola dei due fallimenti: se qualcosa va storto due volte, fermarsi e riferire.

## Decisioni

| Tema | Decisione |
|---|---|
| Un file o più | Un solo file `server/socket-events.test.js` (vincolo del piano generale) più un modulo di supporto `server/test-support/socket-harness.js` (non finisce in `*.test.js`, quindi non lo esegue `node --test`). |
| Porta | libera, scelta aprendo e chiudendo un server su porta 0 nel processo di test; il figlio riceve `PORT`. Il server è pronto quando stampa `in ascolto`. |
| Stato iniziale | `state.json` di prova scritto in `DATA_DIR` prima dell'avvio; il server lo migra come al solito. Per i test conta lo stato del primo `state:update`, non il file scritto. |
| Indipendenza tra test | ogni gruppo di test lavora sulle SUE location e sui suoi oggetti (id dedicati nello stato di prova). Chi ha bisogno della location attiva la imposta da sé con `location:set`. Ogni client aperto da un test viene chiuso in `afterEach`; se era un display si aspetta che un osservatore riceva `display:status {connected:false}` (così il test dopo non trova un display "fantasma"). |
| Barriera | `display:viewport` con un `width` univoco (`barrier-N`): l'evento passa dallo stesso socket dopo quello in prova, gli handler sono sincroni, quindi lo `state:update` con quel `width` riflette di sicuro l'evento in prova. `displayViewport` non è persistito e nei confronti viene escluso. |
| "Stato invariato" | stato dopo la barriera prima dell'evento == stato dopo la barriera dopo l'evento (`deepStrictEqual`), esclusi `displayViewport` e `displayAudio`. |
| Eventi senza validazione | il secondo test fissa che il valore passa senza controllo (con `// BUG noto:` quando il valore rompe il tipo del campo). |
| Verifica copertura | i test si registrano con `ev(nomeEvento, descrizione, fn)`, che conta i test per evento. L'ultimo test del file legge `server/*.js` (esclusi i test), estrae ogni `socket.on('...'` e fallisce se un evento ha meno di due test o se un test cita un evento che non esiste. Regge lo spezzamento della fase 4 (cerca in tutti i file del server). |
| Eccezioni nei listener | in socket.io 4 un'eccezione in un listener esce da `process.nextTick` e termina il processo. Si fissa su un server dedicato (`hello` senza payload). |

## Infrastruttura (`server/test-support/socket-harness.js`)

- `startServer({ state, files })`: crea cartelle temporanee (`fs.mkdtempSync`), scrive `data/state.json` e i file finti in `storage/<dir>/<nome>`, avvia il figlio con `PORT`, `DATA_DIR`, `STORAGE_DIR`, `DM_PIN=''`, `cwd` temporanea; ritorna `{ url, port, dataDir, storageDir, proc, stop() }`. `stop()` uccide il figlio e cancella le cartelle.
- `connect(server)`: client `socket.io-client` (`transports: ['websocket']`, `forceNew: true`), aspetta il primo `state:update`; tiene `client.state` (ultimo ricevuto) e un registro degli eventi ricevuti.
- `waitFor(client, event, predicate, ms = 2000)`: promessa del prossimo evento che soddisfa il predicato, altrimenti errore con il nome dell'evento.
- `waitState(client, predicate)`: `waitFor(client, 'state:update', predicate)`.
- `barrier(client)`: emette `display:viewport` con `width` univoco e ritorna lo stato di quello `state:update`.
- `emitAndWait(client, event, payload, predicate)`: registra l'attesa PRIMA di emettere.
- `expectUnchanged(client, event, payload)`: barriera, emit, barriera, confronto.
- `expectNoEvent(client, event, fn)`: esegue `fn`, poi barriera, e controlla che `event` non sia arrivato in mezzo (per `ping:show`, `control:status`, `display:status`).

## Elenco degli eventi (ricavato da `server/index.js`, 64 `socket.on(`)

Legenda: V = caso valido (stato dopo l'evento), R = caso rifiutato (stato invariato) o, se il codice non rifiuta nulla, secondo caso che fissa il comportamento.

| # | Evento | V | R / secondo caso |
|---|---|---|---|
| 1 | `hello` | `role:'control'` → `control:status {connected:true}` | `role:'party'` → nessun `control:status`/`display:status`; extra: `role:'display'` azzera gli one-shot |
| 2 | `display:viewport` | `{width,height}` in `displayViewport` | valori non numerici accettati (nessuna validazione) |
| 3 | `audio:status` | da display, payload valido → `displayAudio` | da non-display ignorato; payload invalido ignorato; payload uguale non ritrasmesso |
| 4 | `location:set` | cambia attiva, azzera `activeImageId` e one-shot | id sconosciuto: invariato |
| 5 | `location:create` | nuova location attiva con campi di default | (nessun rifiuto) payload ignorato, due create = due location distinte |
| 6 | `location:rename` | nome nuovo, tagliato a 120 | id sconosciuto |
| 7 | `location:archive` | `archived:true`; se attiva, `activeLocationId:null` e one-shot azzerati | id sconosciuto |
| 8 | `location:restore` | `archived:false` | id sconosciuto |
| 9 | `location:delete` | location archiviata rimossa | location non archiviata: invariato |
| 10 | `location:setDefault` | solo quella `isDefault` | id sconosciuto |
| 11 | `location:reorder` | permutazione valida delle non archiviate, archiviate in coda | non permutazione / non array: invariato e `state:update` solo al mittente |
| 12 | `fow:toggle` | `revealed` invertito | poligono sconosciuto |
| 13 | `fow:setAll` | tutti `revealed` = valore | location sconosciuta |
| 14 | `image:show` | `activeImageId` | immagine non della location attiva |
| 15 | `handout:setDefault` | default della location e globale | id voce sconosciuto; location sconosciuta |
| 16 | `handoutLibrary:update` | rinomina (tagliato a 80) | id sconosciuto / nome non stringa |
| 17 | `handoutLibrary:delete` | voce tolta, default azzerati, file cancellato | id sconosciuto |
| 18 | `image:hide` | `activeImageId:null` | (nessun rifiuto) senza immagine mostrata resta null |
| 19 | `image:rename` | nome nuovo | immagine sconosciuta |
| 20 | `image:delete` | tolta, file cancellato, `activeImageId` azzerato se era lei | immagine sconosciuta |
| 21 | `image:reorder` | permutazione valida | id mancante/duplicato |
| 22 | `image:caption` | didascalia tagliata a 1024 | immagine sconosciuta |
| 23 | `image:destination` | destinazione; `''` → null | immagine sconosciuta |
| 24 | `image:sendTelegram` | immagine vera senza token → `telegram:sendResult ok:false` "non configurato" (nessuna rete) | immagine sconosciuta; pagina web |
| 25 | `view:pan` | offset sommati (con throttle) | location sconosciuta; dx non numerico (BUG noto) |
| 26 | `view:zoom` | `scale` | location sconosciuta; nessuna validazione |
| 27 | `view:reset` | liveView di default | location sconosciuta |
| 28 | `polygon:create` | nuovo poligono non rivelato | meno di 3 punti |
| 29 | `polygon:update` | punti e nome | poligono sconosciuto |
| 30 | `polygon:delete` | tolto | location sconosciuta |
| 31 | `polygon:restore` | reinserito all'indice | id già presente; senza `points` |
| 32 | `polygon:reorder` | permutazione valida | non permutazione |
| 33 | `mapScale:set` | `scale` | location sconosciuta |
| 34 | `mapFlip:toggle` | `flip180` invertito | location sconosciuta |
| 35 | `mapRotate90:toggle` | `rotate90` invertito | location sconosciuta |
| 36 | `grid:update` | campi; `baseCellSize`/`divisions` → `cellSize`; `cellSize` diretto azzera divisioni | location sconosciuta |
| 37 | `compass:update` | campi, x/y limitati 0-100, rotazione modulo 360 | location sconosciuta |
| 38 | `aoe:place` | nuova area con default | forma sconosciuta; taglia oltre 300 |
| 39 | `aoe:move` | x/y (con throttle) | x non finito |
| 40 | `aoe:rotate` | rotazione modulo 360 per cono/linea | cubo/sfera ignorati |
| 41 | `aoe:resize` | taglia e larghezza (solo linea) | taglia 0 o oltre 300 |
| 42 | `aoe:setColor` | colore della palette | colore sconosciuto |
| 43 | `aoe:setShapeVisible` | booleano | area sconosciuta |
| 44 | `aoe:setShaderOverride` | id della whitelist | id sconosciuto → null |
| 45 | `aoe:setCast` | booleano | area sconosciuta |
| 46 | `aoe:remove` | tolta | location sconosciuta |
| 47 | `shader:place` | decorazione nuova | tipo sconosciuto; misura sotto 0,5 |
| 48 | `shader:move` | x/y (con throttle) | decorazione sconosciuta |
| 49 | `shader:resize` | misure | misura oltre 300 |
| 50 | `shader:remove` | tolta | location sconosciuta |
| 51 | `shader:restore` | reinserita all'indice | id già presente; tipo sconosciuto |
| 52 | `ping:show` | rilanciato a tutti, stato invariato | location non attiva; x non numero |
| 53 | `audio:toggle` | background acceso/spento; one-shot con display → seq | one-shot senza display; traccia sconosciuta |
| 54 | `audio:volume` | volume limitato 0-1 | volume non numerico |
| 55 | `audio:update` | `restartOnStop`/`handout` | nessun campo booleano |
| 56 | `audio:delete` | riga tolta, voce d'archivio resta | traccia sconosciuta |
| 57 | `audio:add` | riga dall'archivio | `audioId` sconosciuto; kind sconosciuto |
| 58 | `audio:copyFrom` | righe copiate saltando i doppioni | stessa location; niente da copiare |
| 59 | `audioLibrary:update` | nome/icona propagati alle righe | icona non valida e nome assente |
| 60 | `audioLibrary:delete` | voce e righe tolte, file cancellato | id sconosciuto |
| 61 | `audio:oneshotEnded` | seq giusto dal display → tolto | seq vecchio; da non-display |
| 62 | `gridPreset:save` | preset dalla griglia | location sconosciuta |
| 63 | `gridPreset:apply` | griglia dal preset, divisioni 1 | location sconosciuta |
| 64 | `disconnect` | ultimo display → one-shot e `displayAudio` azzerati, `display:status false` | control → `control:status false`; display non ultimo → one-shot restano |

**Casi extra (piano generale):**
- Stato dopo il ripristino di un backup: server dedicato; export `GET /api/export/backup`, modifiche via socket, `POST /api/import/inspect` + `/api/import/apply`; lo `state:update` ha le location del backup (con id nuovi), `activeImageId:null`, `audioOneshots:{}`, attiva la location predefinita, archivio audio intatto.
- One-shot azzerati al cambio location (`location:set`, `location:create`, `location:archive` della attiva) e all'arrivo di un display (`hello role:'display'`).
- Throttle dei trascinamenti (`view:pan`, `aoe:move`, `shader:move`): 30 eventi di fila → meno broadcast che eventi, e l'ultimo `state:update` ha sempre la posizione finale, entro ~200 ms dall'ultimo evento.
- Eccezione non gestita: server dedicato; `hello` senza payload → il processo termina.

---

### Task 1: dipendenza e supporto

**Files:** Modify `package.json`, `package-lock.json`; Create `server/test-support/socket-harness.js`

- [x] `npm install --save-dev socket.io-client@4.8.3`
- [x] Scrivere il modulo di supporto come descritto sopra.
- [x] Commit: `test(socket): socket.io-client e supporto per i test sul server vero`

### Task 2: stato di prova e test per gruppi

**Files:** Create `server/socket-events.test.js`

Un commit per gruppo, con `npm run test:server` verde prima di ogni commit:
- [x] connessione e display (`hello`, `display:viewport`, `audio:status`, `disconnect`)
- [x] location (`location:*`)
- [x] fog, immagini, handout (`fow:*`, `image:*`, `handout*`)
- [x] vista, poligoni, mappa, griglia, bussola (`view:*`, `polygon:*`, `map*`, `grid*`, `compass:update`)
- [x] AoE, shader, ping (`aoe:*`, `shader:*`, `ping:show`)
- [x] audio (`audio:*`, `audioLibrary:*`)
- [x] casi extra (throttle, one-shot, ripristino backup, eccezione)
- [x] test di copertura (ogni `socket.on(` con almeno due test)

### Task 3: verifica

- [x] `npm test` dalla radice tre volte di fila, tutte verdi; annotare la durata di `socket-events.test.js`.
- [x] `git diff manutenzione-pin-dm -- server/index.js server/state.js server/audio.js server/handout.js server/auth.js server/exportImport.js` vuoto.

## Resoconto finale

`git log --oneline manutenzione-pin-dm..HEAD`, eventi trovati e coperti, BUG noti trovati, esito delle tre esecuzioni di `npm test` e durata della suite socket, scostamenti dal piano generale.

## Esito (15 nov 2026)

- 64 `socket.on(` in `server/index.js`, tutti con almeno due test (55 con due, 8 con tre, 1 con quattro): 138 test legati a un evento più 11 casi extra, 149 in tutto. Il controllo è il test «copertura» in fondo al gruppo condiviso (si aspetta 64 eventi: va aggiornato se se ne aggiungono).
- `npm test` verde tre volte di fila; `socket-events.test.js` circa 1,8 s (gruppo condiviso 1,4 s).
- Nessun file del server modificato.

**BUG noti fissati nei test** (cercare `BUG noto` nel file):
1. **Corretto nel branch `fix-crash-payload`** (`protectSocketHandlers` in `server/index.js`: il primo argomento non oggetto, array compresi, diventa `{}` tranne che per gli eventi riservati di socket.io, e le eccezioni, anche i rifiuti di promise, vengono registrate con `console.error`; i test sono nel gruppo «payload non oggetto»). Descrizione del difetto originale: un evento senza payload (o con `null`) su un handler che destruttura il payload lancia `TypeError` dentro `process.nextTick` di socket.io: il processo termina. Il default `= {}` (handout, archivio handout, audio) vale solo per `undefined`: con `null` cadono anche quegli handler (provato con `audio:toggle`; stesso schema per `handoutLibrary:delete`). `image:sendTelegram` senza payload fa cadere il processo per promise rifiutata non gestita. Provato con `hello`, che resta pubblico anche con il PIN acceso, insieme a `display:viewport`, `audio:status`, `audio:oneshotEnded` e tutti gli `aoe:*`.
2. `view:pan`: dx/dy non controllati; una stringa viene concatenata (`offsetX` diventa `'05'`).
3. `view:zoom` e `mapScale:set`: scala non controllata (negativa, stringa).
4. `grid:update`: `divisions` non numerico dà `NaN` in `divisions` e `cellSize` (`null` nel JSON).
5. `compass:update`: x/y non numerici danno `NaN` (`null` nel JSON).
6. `polygon:update`: punti non controllati (una stringa sostituisce l'elenco).
7. `shader:restore`: posizione e misure non controllate (a differenza di `shader:place`).
8. `display:viewport`: nessun controllo sui valori.
9. (minori, solo testo, non coperti da test) `grid:update` non valida `enabled`, `color`, `opacity`, `lineWidth`, `offsetX`, `offsetY`, `baseCellSize` (con `baseCellSize` stringa `cellSize` diventa `NaN`).
10. (minore) `polygon:create` non controlla i singoli punti né tipo e lunghezza del nome.
11. (minore) `polygon:update` non limita il nome (`polygon:restore` sì, 200).
12. (minore) `image:destination` accetta qualunque tipo.

**Comportamenti notati, non segnati come bug**: `location:reorder`, `image:reorder` e `polygon:reorder` scartano in silenzio id doppi o sconosciuti e accettano l'ordine se resta una permutazione completa; una location creata con `location:create` non ha `map.shaders` né `handoutDefaultId` finché il server non riparte; `polygon:delete` con zona sconosciuta salva e trasmette lo stesso stato; dopo il ripristino di un backup le location hanno id nuovi e le righe audio vuote (l'audio non viaggia nei pacchetti).
