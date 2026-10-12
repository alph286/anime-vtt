# Porting di /party su React + shadcn/ui — design

Data: 2026-10-12 · Branch: `party-display-shadcn` (worktree `../anime-vtt-party-display-shadcn`),
creato SOPRA `control-shadcn` (8d69878), non sopra `main`.

## Obiettivo

Rifare il frontend di `/party` (`public/party/`: 761 righe di JS vanilla, 129 di HTML,
508 di CSS) con React + shadcn/ui, con **parità funzionale** con la versione attuale e
nessun redesign. Stessa metodologia dei porting di `/editor` e `/control`. Target: lo
smartphone di un giocatore.

**Fuori perimetro:** `/display`. Resta vanilla (decisione dell'utente): non ha UI, gira su
una TV/monitor e ogni regressione si vedrebbe sullo schermo dei giocatori. Non si tocca.

## Vincoli e decisioni (confermate dall'utente)

- Lavoro solo su `party-display-shadcn`, mai su `main`. Il merge lo fa l'utente, **dopo**
  quello di `control-shadcn` (questo branch ne dipende).
- Approccio ibrido: React/shadcn per la UI; i layer vanilla (`ShaderLayer`,
  `AoeShaderLayer`) restano quelli di `public/shared/*`, montati via ref.
- Zero modifiche a `server/index.js`, `public/shared/*`, `public/display/*`. Stessi
  eventi socket, stesso payload (`hello {role:'party'}`, `state:update`, `aoe:*`).
- Riuso di `/control` (opzione A scelta dall'utente): `/party` usa lo **stesso**
  `useControlStore`, i componenti `AoePanel`, `AoeNudgePad`, `AoeChipList`,
  `FogOverlays`, `AoeOverlays`, l'hook `use-aoe-gesture` e i `lib/*`. Nessuna copia.
- Verifiche solo su una copia dei dati (porta 3100). **Non aprire tab su `/display` né
  su `/control` se può esistere una sessione reale**: `displayViewport` è globale sul
  server, e `/party` lo legge soltanto. Per testare il follow si imposta
  `displayViewport` nella copia dei dati o con un client di test sul server di prova,
  mai su quello vivo.

## Cosa fa /party oggi (da preservare)

- Header: pallino wifi + nome location attiva (sola lettura, nessun selettore).
- Mappa della location **attiva** che segue l'inquadratura live di `/display`:
  `state.displayViewport` (note solo dopo che un display si è connesso) fissa la
  proporzione del box (`--map-aspect`); transform `translate(offset*k) scale(mapScale*live.scale)`
  su `#map-layer`, con `k = box.clientWidth / displayViewport.width` applicato solo agli
  offset (lo zoom no). Senza `displayViewport`: mappa intera, nessun transform, aspect
  dalla mappa. Nessuno smoothing: scatto diretto a ogni `state:update`.
- Griglia con `lineWidth` diviso per lo `scale` del transform (non il contorno AOE).
  Fog e decorazioni (Portale) in sola lettura, come in `display.js`.
- Pannello AOE (sempre visibile): forme, colori (4 + menu "···" con Ragnatela/Fumo/Viola
  Cornelia, mutuamente esclusivi), taglia/larghezza, lista pillole con elimina
  arma-poi-conferma 2,5 s, selezione/de-selezione pillola. **Nessun fulmine per pillola**
  (come in `/control`: il lancio è solo FIRE del pad).
- Pad di nudge flottante (rotazione, ▲▼◀▶ in direzione schermo, colore, taglia/larghezza,
  maniglia di trascinamento, FIRE), visibile con un'area selezionata, posizione salvata
  in `localStorage` con chiave **dedicata** `partyAoeNudgeOverlayPos`.
- Gesto sulla mappa: tap su vuoto piazza (soglia 8 px), trascinamento su un contorno
  sposta, snap alla griglia, `pointercancel` pulisce.
- Loop rAF per Portale e AOE lanciate (si ferma se non serve). Nessun ping, nessuna
  bussola, nessun audio, nessun pan/zoom locale.
- Differenza **voluta** rispetto a `/control`: nessun gating "AOE disponibile". `/party`
  piazza e modifica aree anche se sul display c'è un'immagine mostrata o se la mappa non
  ha file (nell'originale non c'è alcun controllo).

## Architettura

### Build
- Quarta app nello stesso progetto Vite (`editor-app/`): `party/index.html` + `party/main.tsx`,
  `vite.party.config.ts` (root `editor-app/party`, base `/party/`, out `public/party`,
  porta dev 5175, `PARTY_OUT` validato come `CONTROL_OUT`, con elenco riservato che
  include `control`). Config condiviso da `vite.shared.ts`.
- Script root: `dev:party`, `build:party`; `build:all` include la terza build.
- Build committata in `public/party/` (il Raspberry serve statici). Al cutover si
  rimuovono `party.js`, `party.css` e il vecchio `index.html`. `server/index.js` invariato
  (la route statica `/party` esiste già).
- `/shared/media.js` e `/shared/shader-effects.js` restano `<script>` classici prima del
  modulo; `globals.d.ts` è già esteso da `control-shadcn`.

### Modifiche minime ai file di /control (retrocompatibili, test esistenti invariati)
1. `lib/prefs.ts`: `loadNudgePos/saveNudgePos` accettano la chiave come parametro opzionale
   (default `aoeNudgeOverlayPos`).
2. `AoeNudgePad`: prop opzionale `storageKey`.
3. `use-aoe-gesture`: opzione `{ isActive?: (s) => boolean }`. Default = oggi
   (`mode==='aoe' && selectAoeAvailable`); `/party` passa `() => true`.
4. `use-map-geometry`: opzione `aspect?: string | null` che sovrascrive `--map-aspect`
   (caso follow). Senza opzione, comportamento identico a oggi.

Se durante il piano un componente risultasse accoppiato in modo non previsto, si
parametrizza con lo stesso criterio (opzione con default = comportamento attuale);
mai copie.

### Stato e rete
- `useControlStore` condiviso. `usePartySocket` (nuovo, ~40 righe): `connect` →
  `hello {role:'party'}`, `disconnect`, `state:update` → `receiveState`. Dopo ogni stato
  forza `mode = 'aoe'` e `previewLocationId = activeLocationId` (il `reconcileSelection`
  di `/control` farebbe uscire dalla modalità quando l'AOE non è "disponibile"; `/party`
  non ha quella nozione).
- `displayViewport` si legge da `server.displayViewport` (campo già in `ControlState`;
  da estendere se mancasse nel tipo).
- Il feed del `ping:show` e di `display:status` **non** viene registrato: `/party` non li
  usa.

### Componenti (`src/party/`)
- `PartyApp`: header (`StatusBar` semplificato: wifi + nome, senza `Select`), `PartyMap`,
  `AoePanel` (nel `Box` esistente), `AoeNudgePad storageKey="partyAoeNudgeOverlayPos"`.
- `PartyMap`: stessa gerarchia di layer di `MapPreview` (media, placeholder, canvas Portale,
  fog, griglia, canvas shader AOE, svg AOE) **senza** canvas ping, riquadro giallo, bussola
  né wrapper di zoom locale. Il transform follow si applica a un `#map-layer` via ref
  (nessun re-render per frame). Usa `useMapGeometry({aspect})`, `useShaderLoop` e
  `useAoeGesture({isActive})`. `MapPreview` non viene toccato.
- `follow-math.ts` (pura, testata): `followsDisplay`, `liveTransform(location,
  displayViewport, boxWidth)` → `{offsetX, offsetY, scale}`, `gridLineScale`.
- Se `useShaderLoop` presume il canvas del ping, si rende tollerante all'assenza
  (nessun ping da disegnare) senza cambiarne il comportamento in `/control`.

### Test e verifica
- Vitest: `follow-math` (con/senza viewport, k, scala griglia), `usePartySocket` (hello,
  stato, mode forzata), montaggio di `PartyApp` con lo store vero (pannello, lista,
  elimina arma-poi-conferma, nessun fulmine, nessuna dipendenza dal gating), i quattro
  punti di parametrizzazione (default invariato + valore passato).
- `npm test` e `npm run typecheck` verdi sull'intero `editor-app/` (i 260 test di
  `/control` e quelli dell'editor devono restare verdi). `node --test public/shared/media.test.js` 38/38.
- `git diff control-shadcn..HEAD --stat -- server public/shared public/display public/editor`
  vuoto.
- Browser su copia dei dati (porta 3100), solo `/party/`: mappa con e senza viewport,
  piazzamento/spostamento/elimina, pad, persistenza posizione, console pulita.
  Ciò che non si può verificare a mano (touch reale, resa degli shader, confronto con un
  vero `/display` acceso) viene dichiarato.

## Piano di consegna (milestone)

1. Scaffold quarta entry, config, script root, shell, `usePartySocket` e store forzato.
2. Parametrizzazioni minime di `/control` + test di non regressione.
3. `PartyMap` (follow, griglia compensata, fog, shader loop).
4. Pannello AOE, pad con chiave dedicata, gesto senza gating.
5. Verifica di parità in browser su copia dei dati; cutover (rimozione vecchi file, build
   committata); sezione in `CLAUDE.md`.

## Rischi

- **Accoppiamento a `control-store`:** una modifica futura allo store di `/control` può
  rompere `/party`. Mitigato dai test di montaggio con lo store vero.
- **Merge in ordine:** `control-shadcn` deve entrare in `main` per primo.
- **Follow senza display noto:** degrada a mappa intera, come oggi; da verificare con la
  copia dei dati senza `displayViewport`.
- **Gating assente:** il comportamento diverge volutamente da `/control`; i test lo
  fissano per non farlo "correggere" per errore.
- **Hash degli asset:** l'`@source` condiviso di Tailwind fa cambiare gli hash anche di
  `public/editor` e `public/control` a ogni nuova build; innocuo, non si committano
  modifiche non volute (si ricostruisce e si ricommette solo `public/party`).
