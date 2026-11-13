# /handout: default per location da un archivio (design)

## Perché
Oggi /handout mostra l'ultimo media mandato al display e ci resta anche dopo
"Ritorna alla mappa"; il default è uno solo, globale, scelto con la stella tra i
media di una location. Alph vuole un'immagine di riposo per ogni mappa, che resti
finché non mostra altro e a cui /handout torni quando toglie il media. Più mappe
della stessa sessione possono avere lo stesso handout: non va ricaricato ogni volta.

## Comportamento di /handout
Priorità, ricalcolata a ogni `state:update`:
1. media in onda su /display (`activeImageId` della location attiva), se immagine o video;
2. default della location attiva (`location.handoutDefaultId`);
3. default globale (`state.handout.defaultId`);
4. niente (nero).

"Ritorna alla mappa" e il cambio location fanno quindi tornare al default.
`state.handout.shown` sparisce. Le pagine Web non contano: con una Web in onda vale il default.

## Approcci
- A. Archivio media unico (come gli audio) per tutti i media delle location: scartato da Alph.
- C. Default che punta a media di altre location: fragile (eliminare l'originale rompe le altre).
- **B. Archivio dedicato ai default di /handout (scelto)**, con lo stesso sistema
  dell'archivio audio.

## Modello
- `state.handoutLibrary = [{ id, name, file }]` (immagini e video).
- `location.handoutDefaultId: string | null`.
- `state.handout = { defaultId: string | null }` (default globale).
- Riferimenti a voci inesistenti azzerati da una funzione di pulizia (come `pruneHandout` oggi).

## Server (stesso schema dell'archivio audio, `server/audio.js` / `server/index.js`)
- Modulo `server/handout.js` (+ test): add/update/remove voce, set default di location e globale, pulizia.
- `POST /api/upload/handout`: carica una voce nell'archivio (immagini e video, stessi
  controlli e limiti di `/api/upload/image`); con `locationId` la imposta anche come
  default della location, con `global=1` come default globale.
- Eventi: `handoutLibrary:update {id, name}`, `handoutLibrary:delete {id}` (cancella il
  file e azzera i riferimenti), `handout:setDefault {locationId|null, id|null}`
  (`locationId` null = globale). Il vecchio `handout:setDefault {locationId, imageId}` sparisce.
- `image:show` non tocca più lo stato di /handout.
- File in `storage/handout/` (cartella propria). File orfani: i file dell'archivio sono usati.
- Backup ed esportazioni: come per l'archivio audio, l'archivio NON entra nei pacchetti e un
  ripristino non lo tocca; un `handoutDefaultId` importato che non esiste qui viene azzerato.

## /editor
- Scheda Media, in testa: riquadro "Handout di default" con due righe, "Questa location"
  e "Globale", ognuna con miniatura, nome e "Scegli…".
- "Scegli…" apre un dialog sul modello di `AudioLibraryDialog`: lista con miniatura, nome
  rinominabile, "Carica nuovo", "Nessuno", elimina; eliminare una voce usata avvisa con
  l'elenco delle location (e "default globale") che la usano, poi la toglie da tutte.
- Sparisce la stella sulle righe dei media.

## /handout
`resolveHandoutMedia` in `public/shared/media.js` segue la priorità sopra (testata in
`media.test.js`); `handout.js` usa i file dell'archivio per i default.

## Migrazione
Il vecchio `handout.defaultMedia` (se valido) diventa una voce dell'archivio con una
COPIA del file (l'archivio possiede i suoi file) e diventa il default globale: nulla
cambia per chi lo usava. `handout.shown` e `defaultMedia` vengono tolti.

## Non obiettivi
/control e /display invariati. Nessun archivio per i Media delle location.

## Scelte di Claude (da rivedere)
Video ammessi nell'archivio; nomi modificabili; branch `handout-default-location`;
migrazione verso il default globale invece che su ogni location.
