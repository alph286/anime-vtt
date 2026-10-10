# Porting di /editor su React + shadcn/ui — design

Data: 2026-10-10 · Branch: `editor-shadcn` (worktree `../anime-vtt-editor-shadcn`, base `editor-ui`)

## Obiettivo

Rifare il frontend di `/editor` con React + shadcn/ui, mantenendo parità
funzionale completa con l'editor attuale (`public/editor/`: 2.440 righe di JS
vanilla, 452 di HTML, 1.180 di CSS). Menu, pannelli e form diventano
componenti React; i moduli di rendering (WebGL/canvas/griglia) e gli eventi
socket restano invariati.

## Vincoli e decisioni (confermate dall'utente)

- Porting reale a React + shadcn/ui, con build step Vite (prima non esisteva alcun bundler).
- Approccio **B ibrido**: React/shadcn per tutta la parte interattiva (menu, pannelli,
  form, liste, dialog); i moduli vanilla `public/shared/shader-effects.js` e
  `public/shared/media.js` si riusano così come sono, montati tramite ref.
- Lavoro solo su branch `editor-shadcn` e worktree dedicato, mai su main.
- Da `satnaing/shadcn-admin` si prendono solo le convenzioni utili (token tema,
  composizione `Menubar`/`Sidebar`, dark mode). Niente TanStack Router né shell
  multi-pagina: l'editor è una schermata unica.
- Zero modifiche a `server/index.js` oltre, al massimo, al percorso statico.

## Architettura

### Build
- Nuovo progetto in `editor-app/` (Vite, React, TypeScript, Tailwind, shadcn/ui).
- Output in `public/editor/`: Express continua a servire `/editor` con `express.static`.
- Import diretti da `public/shared/` (alias Vite), così nessun codice di rendering è duplicato
  e `node --test public/shared/media.test.js` resta valido.
- Sviluppo: dev server Vite con proxy verso Express per `/socket.io`, `/storage`, `/api`.
- Script npm: `dev:editor`, `build:editor`.

### Stato e rete
- `useSocket` + store Zustand: riceve `state:update`, espone helper di emit con gli
  stessi nomi evento di oggi (`polygon:*`, `shader:*`, `grid:update`, `compass:update`,
  `location:*`, `mapScale:set`, ecc.). Aggiornamento locale ottimistico durante i
  trascinamenti, emit al rilascio (convenzione attuale).

### Componenti
- `MenuBar` (shadcn `Menubar`): Mappa, Griglia, Shaders (sottomenu Portali), Bussola,
  Vista, File orfani, Esporta/Importa. Il menu genitore si evidenzia se una voce interna
  è attiva, tramite prop (non più `:has()`).
- `OptionsBar`: Seleziona/Disegna area, Termina/Annulla poligono, Elimina, Annulla/Ripeti.
- `MapStage`: area centrale. Monta i layer vanilla (griglia, Portale, bussola) su canvas
  via ref, e renderizza poligoni/SVG, maniglie vertici e maniglie di trasformazione shader.
  Logica puntatore in hook dedicati (`usePolygonDraw`, `useShaderTransform`, pan/zoom).
- `Sidebar` (shadcn `Tabs`): lista location con riordino, lista poligoni, "Shaders attivi".

### Comportamenti da preservare (da CLAUDE.md)
- Un solo menu aperto alla volta; click fuori chiude, eccetto File orfani (può contenere
  una scansione in corso).
- Click su voce del sottomenu Shaders: sceglie il tipo e attiva subito il piazzamento;
  click sul pulsante Shaders mostra la scheda "Shaders attivi".
- Trasforma ad angoli: 4 maniglie quadrate, ridimensionamento ancorato all'angolo opposto,
  emit `shader:move` + `shader:resize` solo al rilascio, nessun pushHistory.
- Limite noto accettato: su mappe con `rotate90` il cursore diagonale può risultare
  invertito (il ridimensionamento resta corretto).
- Sottomenu che si ribaltano a sinistra se escono dalla viewport (gestito da Radix).

## Piano di consegna (milestone)

1. Scaffold, shell, socket, lista location.
2. `MapStage`: mappa, griglia, bussola.
3. Strumenti poligono e storia (undo/redo).
4. Menu Shaders e decorazioni con maniglie di trasformazione.
5. Esporta/importa, orfani, menu restanti.
6. Verifica di parità contro CLAUDE.md in browser reale. Test su una copia dei dati, mai
   sullo stato vivo del tavolo. Poi rimozione di `editor.js`, `index.html`, `editor.css` vecchi.

## Verifica

- Suite esistente (`node --test public/shared/media.test.js`, 38 test) sempre verde.
- Ogni milestone verificata in browser con server locale, console senza errori.
- Parità checklist: disegno/modifica/elimina poligoni, fog, griglia, bussola, scala/rotazione/
  flip mappa, shader (piazza, sposta, ridimensiona, elimina), import/export, orfani, undo/redo.

## Rischi

- Pointer events con React: usare ref e listener nativi dove il re-render romperebbe un drag.
- `editor.js` è lungo e stateful: la parità si controlla funzione per funzione, non a occhio.
- Nuova dipendenza di build: `node_modules` dell'editor separati da quelli del server.
