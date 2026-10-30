# Archivio audio — design

Branch: `audio-archivio`. Si appoggia al modello a righe Background/One-shot
(`2026-10-30-audio-background-oneshot-design.md`).

## Perché

Oggi ogni riga audio di una location possiede il proprio file: per usare lo stesso
suono in più location Alph lo ricarica ogni volta da capo (e su disco ci sono copie
identiche). Vuole caricare un audio **una volta**, metterlo in un **archivio**, e
sceglierlo **da una lista** quando prepara una location. Caso tipico: un dungeon su più
mappe, che vuole gli stessi ambienti in ogni mappa.

## Obiettivi

1. **Archivio audio unico** del progetto, gestito da /editor: carica, rinomina, cambia
   icona, elimina.
2. **Nome e icona vivono nell'archivio** (richiesta di Alph): rinominare o cambiare
   l'icona di un audio in archivio cambia nome/icona in TUTTE le location che lo usano.
3. **Volume per location** (confermato da Alph): la stessa traccia può avere volumi
   diversi in location diverse. Restano per riga anche `handout`, `restartOnStop` e `on`.
4. **Aggiungere un audio a una riga** (Background o One-shot) di una location
   **scegliendolo da una lista dell'archivio**, senza ricaricare il file.
5. **Eliminare dall'archivio**: se l'audio è usato in qualche location, **avviso prima**
   con l'elenco delle location coinvolte; confermando sparisce da tutte le location e il
   file viene cancellato dal disco (richiesta di Alph).
6. **Copiare gli audio di un'altra location** nella location corrente, in blocco (tutte
   le righe Background e One-shot con le loro impostazioni).

## Non obiettivi

- Cartelle, tag o ricerca nell'archivio (lista semplice ordinata per nome; un filtro
  testuale è benvenuto se costa poco, vedi "Lasciato al costruttore").
- Ascolto in anteprima nell'editor.
- Audio nell'export/import delle location (oggi escluso, resta escluso).
- Modifiche a /display, /handout e alla scheda Audio di /control oltre a quanto
  strettamente necessario: devono continuare a funzionare come oggi.

## Anti-obiettivi (sarebbe un fallimento anche se "funziona")

- Eliminare una riga da una location cancella il file dall'archivio (oggi succede: con
  l'archivio NON deve più succedere).
- Un'eliminazione dall'archivio senza avviso quando l'audio è in uso.
- Nome/icona di una riga che restano diversi dall'archivio dopo una rinomina.
- Perdere tracce, volumi o stati `on` esistenti nella migrazione.

## Modello dati

**Scelta di Claude** (non chiesta ad Alph): lo stato ha un archivio separato e ogni riga
punta all'archivio, ma tiene anche una copia di `name`, `icon`, `file`, mantenuta allineata
dal server. Così /display, /handout e /control, che leggono `track.file/name/icon`, non
cambiano.

```
state.audioLibrary = [{ id, name, icon, file }]          // persistito
location.map.audio.background = [{ id, audioId, name, icon, file, volume, handout, restartOnStop, on }]
location.map.audio.oneshot    = [{ id, audioId, name, icon, file, volume, handout }]
```

- `id` della riga resta distinto da `audioId` (lo stesso audio può comparire in più
  location, e anche come Background in una e One-shot in un'altra).
- Lo stesso audio due volte nella stessa riga di una location è permesso dal modello
  (nessun danno); la copia da location però non crea doppioni (vedi sotto).
- Icona di default in archivio: `music`. Il set di icone resta quello di
  `editor-app/src/lib/audio-icons.ts`; il server valida solo la forma dello slug.
- `name`/`icon`/`file` sulle righe sono **solo copie**: il server le riscrive da
  `audioLibrary` a ogni operazione sull'archivio e alla migrazione; `audio:update` sulla
  riga non accetta più `name` né `icon`.

## Server

Logica pura in `server/audio.js` (+ test), cablata in `server/index.js`, come oggi.

- `POST /api/upload/audio`: carica un file **nell'archivio** (nome = `name` o nome
  originale del file, icona `music`). Con `locationId` + `kind` opzionali aggiunge anche
  subito una riga a quella location (serve al pulsante "Carica nuovo" dentro la riga).
  Limite e filtro mime invariati (audio/*, 50 MB).
- Eventi socket nuovi:
  - `audioLibrary:update { audioId, name?, icon? }` → aggiorna l'archivio e propaga a
    tutte le righe con quell'`audioId`.
  - `audioLibrary:delete { audioId }` → toglie le righe da tutte le location (stessa
    pulizia di `removeTrack`, incluso `audioOneshots`), poi la voce dall'archivio, poi
    cancella il file. L'avviso lo fa il client (sa già dallo stato dove è usato); il
    server esegue e basta.
  - `audio:add { locationId, kind, audioId }` → aggiunge una riga dall'archivio
    (volume 0.7, `on:false`, `handout:false`, `restartOnStop:false`).
  - `audio:copyFrom { locationId, fromLocationId }` → copia le righe.
- `audio:delete` (riga di una location): toglie la riga, **non** cancella più il file.
- `audio:update` sulla riga: solo `restartOnStop`, `handout` (volume ha già `audio:volume`).
- File orfani: un file audio è referenziato se sta in `audioLibrary` (non più "se una
  location lo usa"). Un audio in archivio non usato da nessuna location NON è orfano.

### Copia da un'altra location

Aggiunge in coda, per ogni riga (Background e One-shot) della location di origine, una
riga nuova con stesso `audioId` e stesse impostazioni (`volume`, `handout`,
`restartOnStop`, `on`), id nuovi. **Scelta di Claude**: salta gli audio già presenti
nella stessa riga di destinazione (copiare due volte non duplica). Se la destinazione è
la location attiva e un background copiato è `on`, parte subito sul display: è coerente
con lo stato persistito ed è il comportamento atteso tornando sulla location.

## Migrazione (all'avvio, `server/state.js` + avvio in `index.js`)

- Stati senza `audioLibrary`: per ogni riga esistente di ogni location crea una voce
  d'archivio con `name`/`icon`/`file` della riga e le assegna `audioId`.
- **Doppioni** (scelta di Claude): righe che puntano allo **stesso file** finiscono
  sempre nella stessa voce. File diversi con **contenuto identico** (stesso hash del
  contenuto, letto da `storage/audio`) vengono uniti in una voce sola: le righe puntano al
  primo file, il nome della voce è quello della prima riga incontrata, l'icona idem. I
  file duplicati non vengono cancellati: diventano orfani e si eliminano a mano da "File
  orfani" (sicurezza prima di tutto). Righe con file mancante su disco: entrano comunque
  nell'archivio con il loro nome (non si perde nulla).
- Il calcolo degli hash richiede il disco: va fatto all'avvio del server, non dentro la
  `migrate` pura (che riceve solo lo stato). La parte pura (raggruppa per chiave, assegna
  `audioId`, riallinea le copie) va testata con una funzione hash finta.
- Idempotente: con `audioLibrary` già presente, la migrazione si limita a riallineare le
  copie `name/icon/file` delle righe e a scartare righe con `audioId` inesistente.

## /editor

- **Archivio audio**: una finestra (Dialog) con la lista delle voci: icona (stesso
  IconPicker di oggi), nome modificabile (`CommitInput`), quante location lo usano,
  elimina. Pulsante "Carica" (più file in un colpo: un upload per file, in sequenza, come
  oggi). Si apre da un pulsante "Archivio" in testa al pannello Audio della sidebar
  (scelta di Claude).
- **Eliminare dall'archivio**: se l'audio non è usato, arma-poi-conferma come ovunque
  nell'editor. Se è usato, un dialogo di conferma che elenca le location coinvolte
  ("Usato in: Taverna, Cripta 1, Cripta 2 — verrà tolto da tutte. Eliminare?").
- **Pannello Audio della location**: per ogni riga (Background / One-shot) il pulsante
  "Aggiungi" apre una lista dell'archivio da cui scegliere (anche più voci in fila);
  in fondo alla lista "Carica nuovo…" che carica nell'archivio e aggiunge subito la riga.
- Nella riga di una location, nome e icona si vedono ma si cambiano dall'archivio:
  **scelta di Claude** → restano modificabili anche lì (stesso campo, stesso IconPicker)
  ma emettono `audioLibrary:update`, con un'indicazione chiara che cambia ovunque (es.
  testo d'aiuto "Nome e icona valgono in tutte le location"). Così il gesto di oggi resta
  quello di sempre.
- Il cestino della riga toglie solo dalla location (testo del tooltip: "Togli da questa
  location"); il file resta in archivio.
- **Copia audio da…**: in testa al pannello Audio, un selettore di location (escluse la
  corrente e quelle senza audio) + conferma. Le righe si aggiungono in coda.
- Build `public/editor/` ricostruita e committata.

## /control, /display, /handout

Nessun cambiamento atteso: leggono le copie `name/icon/file` sulle righe. Se i tipi TS
condivisi (`editor-app/src/types`) cambiano, la build di `public/control/` e
`public/party/` va ricostruita e committata se cambia l'output.

## Lasciato al costruttore

- Ordine della lista dell'archivio (per nome è il default suggerito) e un eventuale
  filtro testuale se la lista diventa lunga.
- Forma esatta del selettore nella riga (Popover con lista, Command di shadcn, ecc.).
- Nomi interni di funzioni e file.

## Verifica

- Test unitari server: archivio (aggiungi, rinomina con propagazione, elimina in
  cascata con pulizia di `audioOneshots`), `audio:add`, copia con salto dei doppioni,
  `audio:delete` di riga che non tocca il file, orfani, migrazione (stesso file, hash
  uguale, file mancante, idempotenza).
- Vitest per i componenti nuovi dell'editor.
- Percorso in browser su **copia dei dati** (mai dati vivi), porta 3100, senza aprire
  /display su un server con una sessione reale: migrazione di uno `state.json` attuale,
  carica in archivio, aggiungi a due location, rinomina e vedi propagare, copia da
  location, elimina usato (avviso con elenco) e non usato, /control che suona ancora.
