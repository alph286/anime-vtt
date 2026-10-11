# Porting di /control su React + shadcn/ui — design

Data: 2026-10-11 · Branch: `control-shadcn` (worktree `../anime-vtt-control-shadcn`, base `main`)

## Obiettivo

Rifare il frontend di `/control` con React + shadcn/ui, con parità funzionale
completa con la versione attuale (`public/control/`: 2.046 righe di JS vanilla,
354 di HTML, 1.199 di CSS). Target: telefono del DM, tab bar in basso. I moduli
di rendering condivisi (`public/shared/media.js`, `shader-effects.js`) e tutti
gli eventi socket restano invariati. Stessa metodologia del porting di `/editor`.

## Vincoli e decisioni (confermate dall'utente)

- Lavoro solo su `control-shadcn` e worktree dedicato; il merge in main lo fa l'utente.
- Approccio B ibrido: React/shadcn per la UI; i layer WebGL/canvas vanilla
  (`ShaderLayer`, `AoeShaderLayer`, `PingLayer`) montati via ref.
- Stesso progetto Vite dell'editor (`editor-app/`) con una seconda entry; nessuna
  rinomina della cartella in questo branch.
- Zero modifiche a `server/index.js` e a `public/shared/*`.
- Verifiche solo su una copia dei dati, mai sulla sessione viva. Non aprire tab su
  `/display` né su `/control` se può esistere una sessione reale (lezione in CLAUDE.md:
  `displayViewport` è globale sul server).

## Architettura

### Build
- `editor-app/` ospita due app: `index.html` (editor, invariato) e `control.html`
  (nuova). Due config Vite: `vite.config.ts` (editor, `base /editor/`, out
  `public/editor`) e `vite.control.config.ts` (`base /control/`, out
  `public/control`, `emptyOutDir` solo sulla propria cartella). Alias `@`, plugin e
  proxy dev condivisi da un modulo comune.
- Script root: `dev:control`, `build:control`, `build:all`.
- Build committata in `public/control/` (il Raspberry serve file statici senza build).
- Al cutover si rimuovono `control.js`, `control.css` e il vecchio `index.html`.
- `/shared/media.js` e `/shared/shader-effects.js` restano `<script>` classici prima
  del modulo; i globali sono già dichiarati in `src/globals.d.ts` (da estendere per
  `AoeShaderLayer`, `PingLayer`, `groupPingPointsByStroke`, helper AOE).

### Codice condiviso con l'editor
`lib/socket`, `lib/utils`, `components/ui/*`, `index.css` (tema), `hooks/use-arm-confirm`,
`components/NumberField` se utile. Il nuovo codice vive in `src/control/**` con un proprio
store Zustand+Immer (`control-store`), separato da quello dell'editor.

### Stato e rete
- `control-store`: ultimo `state:update`, modalità corrente, location in anteprima,
  zoom locale `{scale,x,y}`, opacità griglia DM, area AOE selezionata, ping vivi,
  stato audio/display, feedback Telegram.
- Emit con gli stessi nomi evento di oggi (`aoe:*`, `fow:*`, `view:*`, `grid:update`,
  `compass:update`, `ping:show`, `location:set`, `image:*`, `audio:*`, `hello`).
- Persistenza locale (localStorage, sempre in try/catch): `dmGridOpacity`, `dmGridVisible`,
  `zoomLocalState`, `partyAoeNudge…`/chiave pad AOE di /control. Chiavi invariate.

### Componenti
- **Shell:** `StatusBar` (pallino wifi + `Select` location), `PreviewBanner`,
  `ShowingBanner`, `Tabs` shadcn in basso (Mappa / Fog / Immagini), tutti i pannelli
  tenuti montati (`forceMount`) come nell'editor.
- **`MapPreview`:** immagine/video, griglia, fog, canvas Portale, canvas shader AOE, SVG
  AOE, canvas ping, riquadro giallo, marker bussola. Stessa gerarchia di layer di oggi.
  Zoom locale con transform CSS; listener nativi per pan, pinch, rotellina e tap che
  leggono `useControlStore.getState()`.
- **Mode toggles** (pan, fog, ping, zoom, aoe) e **un solo box visibile** sotto la mappa:
  `PanBox`, `FogBox`, `PingBox`, `ZoomBox`, `AoePanel`.
- **`AoePanel`:** forme, barra colori (4 colori + "···"), menu shader inline, taglia/
  larghezza, lista pillole con fulmine/elimina (arma-poi-conferma 2,5s). Color bar e menu
  "···" sono un gruppo mutuamente esclusivo.
- **`AoeNudgePad`:** flottante in basso a destra, trascinabile, posizione salvata,
  visibile solo in modalità AOE con area selezionata.
- **Tab Fog:** lista zone con toggle e bulk. **Tab Immagini:** miniature, dettaglio,
  didascalia, destinazione Telegram, mostra/invia/ritorna alla mappa, feedback.
- **`AudioBox`:** traccia speciale, play/pausa, stop, volume.
- **Hook di rendering:** `useShaderLoop` (unico rAF per Portale/AOE/ping), `useMapGeometry`
  (fit-box, offset, `displayViewport`).

### Comportamenti da preservare (da CLAUDE.md)
Tutto quanto descritto nelle sezioni "Box sotto la mappa", "Shader sugli incantesimi AOE" e
relativi ritocchi, in particolare:
- `pan` mostra riquadro giallo e azzera lo zoom locale; `zoom` mai il riquadro; pulsante
  "Zooma sull'area dei PG" a comando, nessuno zoom automatico; zoom persistente tra reload
  e ripristinato solo dopo che la preview ha dimensioni reali.
- Griglia: opacità giocatori condivisa (`grid:update`), opacità e visibilità DM solo locali.
- Fog: opacità locale di sessione, progresso "x/y" nascosto se non ci sono zone.
- Ping: bussola nel box ping; tap = sonar, trascinamento = scia; `strokeId` per gesto;
  payload di `ping:show` invariato; ping visibile anche sulla propria anteprima.
- AOE: snap Cono/Linea, rotazioni che riagganciano alla griglia, tasti direzionali nella
  direzione schermo a mappa ruotata, contorno nascosto a area lanciata ma celle sempre
  evidenziate, click colore azzera `shaderOverride`, `AOE_COLOR_CYCLE_NAMES`.
- Il gating "ping disponibile" (location attiva, non in anteprima, nessuna immagine) e
  l'uscita dalla modalità per condizioni transitorie.

## Piano di consegna (milestone)

1. Scaffold seconda entry, config Vite, script root, shell (status bar, tab bar, banner), store e socket.
2. `MapPreview`: media, griglia, fog, bussola, riquadro giallo, pan/pinch/zoom locale.
3. Mode toggles e box Pan, Fog, Zoom, Ping (compreso `PingLayer`).
4. AOE: layer shader, `AoePanel`, `AoeNudgePad`, interazioni sulla mappa.
5. Tab Fog, Tab Immagini, Audio.
6. Verifica di parità in browser su copia dei dati, poi cutover (rimozione vecchi file,
   build committata) e sezione in CLAUDE.md.

## Verifica

- `node --test public/shared/media.test.js` (38) sempre verde; Vitest sul nuovo codice.
- Ogni milestone verificata in browser su server locale con copia dei dati, console pulita.
- Gesti touch/pinch controllati con emulazione mobile del pannello browser; ciò che non si
  può verificare a mano viene dichiarato esplicitamente a fine lavoro.

## Rischi

- Gesti touch e pinch: listener nativi, nessuna closure obsoleta, `touch-action` corretto.
- Logica AOE ricca di stato (snap, rotazione, cast): riusare gli helper di `media.js`, non
  duplicarli.
- Rendering con zoom/pan ad alta frequenza: aggiornare i transform via ref, non con re-render React.
- Convivenza di due build Vite in `public/`: `emptyOutDir` limitato alla propria cartella.
- `control.js` è lungo e stateful: parità verificata funzione per funzione.
