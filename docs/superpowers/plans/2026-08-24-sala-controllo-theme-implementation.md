# Tema "Sala controllo" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare il design system scuro/ambra "Sala controllo" (deciso in `docs/superpowers/specs/2026-08-24-sala-controllo-theme-design.md`) alle tre pagine dell'app (editor, controllo, display) sostituendo i colori hardcoded con variabili CSS condivise, senza toccare JavaScript o layout.

**Architecture:** Un nuovo file `public/shared/theme.css` definisce i design token come custom property su `:root`, linkato prima del CSS di pagina in ciascun `index.html`. Ogni CSS di pagina esistente viene riscritto per consumare quei token al posto dei valori fissi attuali — stessi selettori, stessa struttura, solo colori.

**Tech Stack:** CSS puro (custom properties), nessuna dipendenza nuova, nessun build step. Il progetto resta Node.js + Express + socket.io + vanilla JS invariato.

## Global Constraints

- Zero nuove dipendenze npm, zero build step (dal design doc).
- Zero righe di JavaScript modificate in editor.js / control.js / display.js (dal design doc).
- Nessun font esterno: solo `system-ui, sans-serif` già in uso (dal design doc).
- Nessun toggle chiaro/scuro, nessun uso di `prefers-color-scheme`: tema fisso unico (dal design doc).
- Layout/struttura HTML invariati: nessun elemento spostato, rinominato, aggiunto o rimosso (dal design doc — l'utente ha confermato "bene così" sui mockup di layout).
- Il fog of war (`.fog-poly` nell'editor, `.fog-overlay` in controllo/display) resta colore nero puro `#000` letterale — è lo stato "sconosciuto ai giocatori", un significato semantico distinto dal chrome dell'app, non va tokenizzato.
- Il puntino wifi in `display.css` (`#wifi-dot.ok`/`.bad`, inclusa l'opacità 0/1 già corretta in una sessione precedente) resta **completamente invariato** — il rosso `#c62828` è esplicitamente escluso dalla palette nel design doc.

---

## Palette di riferimento (per tutti i task)

```css
--bg-page: #16181d;
--bg-panel: #1f232b;
--bg-control: #262b34;
--bg-canvas: #0e1014;
--border: #2c313b;
--border-control: #333947;
--grid-line: #20242c;
--text-primary: #cfd6e0;
--text-secondary: #8a93a3;
--accent: #c9822c;
--accent-text: #1a1a1a;
--accent-bg-subtle: rgba(201, 130, 44, 0.15);
--danger: #a32d2d;
--danger-bg: #3a1f1f;
--danger-border: #5a2c2c;
```

`--accent-bg-subtle`, `--danger-bg` e `--danger-border` non sono nel design doc esplicitamente per nome, ma sono varianti dirette (stessa tinta, alpha/luminosità diverse) degli stessi due colori che il design doc definisce (`--accent` e il rosso pericolo invariato `#a32d2d`) — servono a dare a righe/banner uno sfondo coerente col tema scuro invece del rosa chiaro pensato per uno sfondo bianco.

---

### Task 1: File dei design token condivisi

**Files:**
- Create: `public/shared/theme.css`
- Modify: `public/editor/index.html:7`
- Modify: `public/control/index.html:7`
- Modify: `public/display/index.html:7`

**Interfaces:**
- Consumes: niente (primo task).
- Produces: le 14 custom property elencate sopra, disponibili su `:root` per qualunque CSS caricato dopo `theme.css` in tutte e tre le pagine. I task 2-4 le consumano.

- [ ] **Step 1: Verifica che nessuna delle tre pagine linki già un file con questo nome**

Run: `grep -rn "theme.css" /home/kratos/Documenti/Projects/anime-vtt/public/`
Expected: nessun risultato (il file non esiste ancora).

- [ ] **Step 2: Crea `public/shared/theme.css`**

```css
/* Design token condivisi — palette "Sala controllo".
   Vedi docs/superpowers/specs/2026-08-24-sala-controllo-theme-design.md
   Linkato PRIMA del CSS di pagina in editor/control/display, così le
   regole di pagina possono usare queste variabili con var(--nome). */
:root {
  --bg-page: #16181d;
  --bg-panel: #1f232b;
  --bg-control: #262b34;
  --bg-canvas: #0e1014;
  --border: #2c313b;
  --border-control: #333947;
  --grid-line: #20242c;
  --text-primary: #cfd6e0;
  --text-secondary: #8a93a3;
  --accent: #c9822c;
  --accent-text: #1a1a1a;
  --accent-bg-subtle: rgba(201, 130, 44, 0.15);
  --danger: #a32d2d;
  --danger-bg: #3a1f1f;
  --danger-border: #5a2c2c;
}
```

- [ ] **Step 3: Linka il file in `public/editor/index.html`**

Nel `<head>`, subito prima della riga `<link rel="stylesheet" href="editor.css">`, aggiungi:

```html
<link rel="stylesheet" href="/shared/theme.css">
```

- [ ] **Step 4: Linka il file in `public/control/index.html`**

Nel `<head>`, subito prima della riga `<link rel="stylesheet" href="control.css">`, aggiungi:

```html
<link rel="stylesheet" href="/shared/theme.css">
```

- [ ] **Step 5: Linka il file in `public/display/index.html`**

Nel `<head>`, subito prima della riga `<link rel="stylesheet" href="display.css">`, aggiungi:

```html
<link rel="stylesheet" href="/shared/theme.css">
```

- [ ] **Step 6: Avvia (o verifica attivo) il server e controlla che il file venga servito**

Run: `cd /home/kratos/Documenti/Projects/anime-vtt && (curl -s localhost:3000/api/state >/dev/null || (nohup node server/index.js > /tmp/anime-vtt-server.log 2>&1 & disown; sleep 1))`

Poi:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/shared/theme.css`
Expected: `200`

Run: `curl -s http://localhost:3000/shared/theme.css | grep -c "\-\-accent:"`
Expected: `1`

- [ ] **Step 7: Verifica che tutte e tre le pagine linkino il file, nell'ordine giusto (prima del CSS locale)**

Run: `for p in editor control display; do echo "== $p =="; grep -n "stylesheet" /home/kratos/Documenti/Projects/anime-vtt/public/$p/index.html; done`

Expected: per ciascuna pagina, la riga `theme.css` compare **prima** della riga del CSS locale (`editor.css`/`control.css`/`display.css`).

- [ ] **Step 8: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/shared/theme.css public/editor/index.html public/control/index.html public/display/index.html
git commit -m "Add shared theme.css design tokens, link from all three pages"
```

---

### Task 2: Restyle editor.css

**Files:**
- Modify: `public/editor/editor.css` (sostituzione integrale del contenuto)

**Interfaces:**
- Consumes: le custom property prodotte dal Task 1 (`--bg-page`, `--bg-panel`, `--bg-control`, `--bg-canvas`, `--border`, `--border-control`, `--grid-line`, `--text-primary`, `--text-secondary`, `--accent`, `--accent-text`, `--accent-bg-subtle`, `--danger`, `--danger-bg`, `--danger-border`).
- Produces: nessuna nuova interfaccia — nessun altro task dipende da selettori nuovi in questo file. Tutti i selettori/id/class esistenti restano identici (nessuna rinomina), quindi editor.js continua a funzionare senza modifiche.

- [ ] **Step 1: Verifica lo stato "prima" (colori chiari attuali)**

Run: `grep -c "#fff\|#ccc\|#f2f1ec\|#378add\|#0c447c" /home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.css`
Expected: un numero maggiore di 0 (i colori del vecchio tema chiaro sono ancora presenti).

- [ ] **Step 2: Sostituisci integralmente il contenuto di `public/editor/editor.css`**

```css
* {
  box-sizing: border-box;
}

/* An author-level `display` (e.g. .icon-btn's flex) outranks the UA stylesheet's
   rule for [hidden], so elements toggled via the hidden attribute need this. */
[hidden] {
  display: none !important;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
}

.topbar {
  display: flex;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.topbar select {
  width: 240px;
}

select, input[type="text"], input[type="number"] {
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  font-size: 14px;
  padding: 0 8px;
}

input[type="number"] {
  width: 72px;
  flex: none;
}

.num-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.num-row .unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  max-width: 1500px;
  margin: 0 auto;
  padding: 20px 24px 40px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

section {
  min-width: 0;
}

h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 10px;
}

.toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  overflow-x: auto;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.toolbar-sep {
  width: 1px;
  flex-shrink: 0;
  align-self: stretch;
  background: var(--border-control);
  margin: 4px 6px;
}

.icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  cursor: pointer;
}

.icon-btn.tool.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon-btn.confirm {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.icon-num {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-secondary);
}

.icon-num input[type="number"] {
  border: none;
  padding: 0;
  height: auto;
  width: 46px;
  color: var(--text-primary);
}

.icon-num .unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.color-swatch {
  width: 36px;
  height: 36px;
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  cursor: pointer;
}

.color-swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-swatch::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 10px;
}

.hint.warning {
  color: var(--danger);
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  padding: 6px 10px;
}

button {
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}

button.tool.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

.zoom-readout {
  font-size: 13px;
  color: var(--text-secondary);
}

.opacity-inline {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.map-canvas {
  position: relative;
  width: 100%;
  height: min(62vh, 640px);
  min-height: 360px;
  background: var(--bg-canvas);
  border-radius: 8px;
  overflow: auto;
  margin-bottom: 10px;
}

.map-canvas-zoom {
  position: relative;
  width: 100%;
  height: 100%;
}

.media-wrap {
  position: absolute;
}

.map-canvas-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-drag: none;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;
  z-index: 1;
}

.map-canvas-placeholder {
  position: absolute;
  inset: 0;
  background-color: var(--bg-canvas);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 19px, var(--grid-line) 19px 20px),
    repeating-linear-gradient(90deg, transparent 0 19px, var(--grid-line) 19px 20px);
  z-index: 1;
}

.overlay-box {
  position: absolute;
  cursor: crosshair;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

.overlay-box svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

#grid-svg {
  z-index: 2;
}

#polygon-svg {
  z-index: 3;
}

.vertex-handle,
.draw-point {
  z-index: 4;
}

.grid-align-box {
  z-index: 5;
}

/* Il fog of war resta nero puro: è lo stato "sconosciuto ai giocatori",
   un significato semantico distinto dai colori dell'interfaccia — non
   va tokenizzato (vedi Global Constraints). */
.fog-poly {
  fill: #000;
  stroke: none;
}

.fog-poly.revealed {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.6;
  stroke-width: 0.6;
  stroke-dasharray: 2 1.5;
  vector-effect: non-scaling-stroke;
}

.fog-poly.selected {
  fill: var(--accent);
  fill-opacity: 0.35;
  stroke: var(--accent);
  stroke-width: 0.8;
  vector-effect: non-scaling-stroke;
}

.draw-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 0.6;
  stroke-dasharray: 1.5 1;
  vector-effect: non-scaling-stroke;
}

.vertex-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  transform: translate(-50%, -50%);
  cursor: grab;
}

.draw-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, -50%);
}

.grid-align-box {
  position: absolute;
  border: 1.5px dashed var(--accent);
  background: var(--accent-bg-subtle);
  pointer-events: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  max-height: 46vh;
  overflow-y: auto;
}

.polygon-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
}

.polygon-row.selected {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
}

.polygon-row input[type="text"] {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  height: auto;
}

.polygon-row .state-tag {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.tv-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
}

.grid-label {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
}

.grid-move {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, 32px);
  grid-template-rows: repeat(3, 32px);
  gap: 3px;
}

.pad button, .pad span {
  width: 32px;
  height: 32px;
  padding: 0;
}

.grid-offsets {
  display: flex;
  gap: 10px;
}

.grid-offsets label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.image-editor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.image-editor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-control);
  border-radius: 8px;
  background: var(--bg-control);
}

.image-thumb-btn {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: zoom-in;
  background: none;
}

.image-thumb-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-overlay-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 16px;
  height: 16px;
  color: #fff;
  opacity: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  transition: opacity 0.15s;
}

.image-thumb-btn:hover .thumb-overlay-icon,
.image-thumb-btn:focus-visible .thumb-overlay-icon {
  opacity: 1;
}

.image-name-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  font-size: 13px;
}

.image-delete {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--danger);
}

.image-delete .icon {
  width: 16px;
  height: 16px;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px;
  cursor: zoom-out;
}

.lightbox[hidden] {
  display: none;
}

.lightbox img {
  max-width: 100%;
  max-height: calc(100vh - 120px);
  object-fit: contain;
  border-radius: 4px;
}

.lightbox-caption {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  text-align: center;
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.28);
}

.file-btn {
  display: inline-block;
  background: var(--bg-control);
  border: 1px solid var(--border-control);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
}

.file-btn input {
  display: none;
}

@media (max-width: 1100px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Verifica lo stato "dopo" — i vecchi colori chiari sono spariti tranne le eccezioni intenzionali**

Run: `grep -n "#fff\|#ccc\|#f2f1ec\|#378add\|#0c447c\|#e2e2e2\|#e6f1fb\|#1a1a1a\|#333;" /home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.css`

Expected: solo occorrenze **intenzionali** rimaste — `border: 2px solid #fff;` (bordo vertex-handle sul canvas scuro), `color: #fff;` dentro `.icon-btn.confirm` e `.lightbox-close`, `#000` per `.fog-poly`/`.lightbox`. Nessuna occorrenza dei vecchi `#ccc`, `#f2f1ec`, `#378add`, `#0c447c`, `#e2e2e2`, `#e6f1fb`, `#1a1a1a`.

- [ ] **Step 4: Verifica sintattica rapida (parentesi bilanciate)**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o+' blocchi' : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 5: Verifica visiva nel browser**

Apri (o riusa) il server locale su `http://localhost:3000/editor`. Con il browser tool:
1. Naviga su `http://localhost:3000/editor`.
2. Screenshot a schermo intero.
3. Conferma a vista: sfondo scuro (non più bianco/crema), toolbar con pulsanti scuri, nessun riquadro bianco residuo, se una location ha già un poligono selezionato il suo contorno è ambra (non più blu).
4. `read_console_messages` — expected: nessun errore JS nuovo rispetto a prima della modifica (zero errori è l'atteso, dato che non si è toccato nessun file `.js`).

- [ ] **Step 6: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/editor/editor.css
git commit -m "Restyle editor.css with Sala controllo theme tokens"
```

---

### Task 3: Restyle control.css

**Files:**
- Modify: `public/control/control.css` (sostituzione integrale del contenuto)

**Interfaces:**
- Consumes: le stesse custom property del Task 1, in particolare `--accent-bg-subtle` per lo stato "rivelato" delle righe fog e `--accent-text`/`--bg-control` per il pulsante primario (vedi nota sotto sul mockup approvato).
- Produces: nessuna nuova interfaccia — selettori/id/class invariati, control.js non tocco.

- [ ] **Step 1: Verifica lo stato "prima"**

Run: `grep -c "#fff\|#ccc\|#f2f1ec\|#378add\|#222\b" /home/kratos/Documenti/Projects/anime-vtt/public/control/control.css`
Expected: maggiore di 0.

- [ ] **Step 2: Sostituisci integralmente il contenuto di `public/control/control.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
}

main {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
}

select, button, input[type="range"] {
  font-size: 15px;
  font-family: inherit;
}

.row {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.row select {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
}

section {
  margin-bottom: 24px;
}

h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

.map-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-canvas);
  margin-bottom: 10px;
}

.map-preview .media-wrap {
  position: absolute;
}

.map-preview .fit-box {
  position: absolute;
}

.map-preview .media-img,
.map-preview .map-placeholder,
.map-preview .fog-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.map-preview .media-img {
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-drag: none;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;
}

.map-preview .map-placeholder {
  background-color: var(--bg-canvas);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 15px, var(--grid-line) 15px 16px),
    repeating-linear-gradient(90deg, transparent 0 15px, var(--grid-line) 15px 16px);
}

/* Il fog of war resta nero puro, stesso motivo di editor.css/display.css. */
.map-preview .fog-overlay {
  position: absolute;
  inset: 0;
  background: #000;
  border: none;
  padding: 0;
  cursor: pointer;
}

.map-preview .fog-overlay.revealed {
  background: transparent;
  outline: 1.5px dashed var(--accent);
  outline-offset: -1px;
}

.opacity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.opacity-row input {
  flex: 1;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--accent);
  margin-bottom: 8px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fow-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  font-size: 15px;
}

.fow-row.revealed {
  background: var(--accent-bg-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.fow-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.fow-row.revealed .fow-state {
  color: var(--accent);
}

.thumb-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.image-thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  overflow: hidden;
  padding: 0;
  background: var(--bg-control);
}

.image-thumb.active {
  border: 2px solid var(--accent);
}

.image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
}

button {
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  padding: 10px 14px;
}

/* Stesso trattamento mostrato e approvato nel mockup del companion di
   brainstorming (.cf-btnfull): non pieno ambra, coerente col resto dei
   pulsanti scuri — solo un pulsante a piena larghezza. */
button.primary {
  width: 100%;
  background: var(--bg-control);
  color: var(--text-primary);
  border: 1px solid var(--border-control);
  padding: 12px;
}

.pan-zoom {
  display: flex;
  align-items: center;
  gap: 20px;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, 40px);
  grid-template-rows: repeat(3, 40px);
  gap: 4px;
}

.pad button, .pad span {
  width: 40px;
  height: 40px;
  padding: 0;
}

.zoom {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom input {
  flex: 1;
}
```

- [ ] **Step 3: Verifica lo stato "dopo"**

Run: `grep -n "#fff\|#ccc\|#f2f1ec\|#378add\|#222\b\|#e6f1fb\|#85b7eb\|#1a1a1a\|#999\|#333;" /home/kratos/Documenti/Projects/anime-vtt/public/control/control.css`

Expected: nessuna occorrenza (in questo file non ci sono eccezioni intenzionali come in editor.css — l'unico nero letterale rimasto deve essere `background: #000;` dentro `.map-preview .fog-overlay`, che è nella lista di esclusione).

- [ ] **Step 4: Verifica sintattica rapida**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/control/control.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o+' blocchi' : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 5: Verifica visiva nel browser**

1. Naviga su `http://localhost:3000/control` (ridimensiona la finestra del browser tool a preset `mobile` se disponibile, per vedere il layout reale).
2. Screenshot.
3. Conferma a vista: sfondo scuro, riquadro mappa/fog scuro, eventuali righe "rivelate" nell'elenco testuale con bordo/testo ambra, pulsante "Torna alla mappa" scuro coerente col resto (non bianco).
4. `read_console_messages` — expected: zero errori nuovi.

- [ ] **Step 6: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.css
git commit -m "Restyle control.css with Sala controllo theme tokens"
```

---

### Task 4: Restyle display.css

**Files:**
- Modify: `public/display/display.css` (sostituzione integrale del contenuto)

**Interfaces:**
- Consumes: `--bg-page`, `--bg-canvas`, `--grid-line` dal Task 1. Non tocca `--accent`/`--danger*` — il display ha pochissimo chrome.
- Produces: nessuna nuova interfaccia. Il blocco `#wifi-dot` non viene toccato in nessun modo (vincolo esplicito, vedi Global Constraints).

- [ ] **Step 1: Verifica lo stato "prima"**

Run: `grep -n "background: #000\|#1a1a1a\|#333" /home/kratos/Documenti/Projects/anime-vtt/public/display/display.css`
Expected: righe trovate per `html, body { ... background: #000; }` e per `.map-placeholder`.

- [ ] **Step 2: Sostituisci integralmente il contenuto di `public/display/display.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-page);
  overflow: hidden;
}

#viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

#map-layer, #image-layer {
  position: absolute;
  inset: 0;
  transform-origin: center center;
}

#image-layer {
  display: none;
}

.media-wrap {
  position: absolute;
}

.fit-box {
  position: absolute;
}

.media-img, .map-placeholder, .fog-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.fog-layer {
  z-index: 1;
}

.media-img {
  object-fit: contain;
  display: block;
}

.map-placeholder {
  background-color: var(--bg-canvas);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 39px, var(--grid-line) 39px 40px),
    repeating-linear-gradient(90deg, transparent 0 39px, var(--grid-line) 39px 40px);
}

/* Il fog of war resta nero puro: nasconde la mappa ai giocatori, un
   significato semantico distinto dal chrome dell'app — non va tokenizzato
   (vedi Global Constraints e la stessa nota in editor.css/control.css). */
.fog-overlay {
  position: absolute;
  inset: 0;
  background: #000;
}

.grid-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

/* #wifi-dot: NON TOCCARE. Colori/opacità già corretti in una sessione
   precedente ed esplicitamente esclusi dalla palette nel design doc. */
#wifi-dot {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background-color 0.3s, opacity 0.3s;
}

#wifi-dot.ok {
  background: #2e7d32;
  opacity: 0;
}

#wifi-dot.bad {
  background: #c62828;
  opacity: 1;
}

#wifi-dot svg {
  width: 18px;
  height: 18px;
  fill: #fff;
}
```

- [ ] **Step 3: Verifica lo stato "dopo" — solo le due modifiche attese, wifi-dot intatto**

Run: `diff <(git show HEAD:public/display/display.css) /home/kratos/Documenti/Projects/anime-vtt/public/display/display.css`

Expected: il diff mostra **solo** le righe `background: #000;` → `background: var(--bg-page);` (in `html, body`) e le due righe di `background-color`/`background-image` in `.map-placeholder`. Nessuna riga del blocco `#wifi-dot` compare nel diff.

- [ ] **Step 4: Verifica sintattica rapida**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/display/display.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o+' blocchi' : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 5: Verifica visiva nel browser**

1. Naviga su `http://localhost:3000/display`.
2. Screenshot.
3. Conferma a vista: se la mappa non riempie tutto lo schermo (letterbox), lo spazio vuoto attorno è dello stesso scuro `--bg-page`, non più nero puro; se non c'è nessuna mappa caricata, il placeholder a righe è nella tonalità `--bg-canvas`/`--grid-line`.
4. Se possibile, forza temporaneamente la classe `bad` sul `#wifi-dot` da console per controllare che sia ancora rosso pieno e visibile (poi ripristina `ok`) — stesso tipo di verifica già fatta in sessione per il fix di opacità.
5. `read_console_messages` — expected: zero errori nuovi.

- [ ] **Step 6: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/display/display.css
git commit -m "Restyle display.css with Sala controllo theme tokens"
```

---

### Task 5: Verifica funzionale incrociata e chiusura

Nessun file da modificare in questo task — è la verifica finale che il restyle CSS non abbia rotto nessuna interazione, come previsto dalla sezione "Verifica" del design doc.

**Files:**
- Nessuno (solo verifica).

**Interfaces:**
- Consumes: le tre pagine restylate dai Task 2-4.
- Produces: niente per task successivi — è l'ultimo task del piano.

- [ ] **Step 1: Verifica che il server sia attivo con l'ultimo codice**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/state`
Expected: `200`. Se il processo server gira da prima del Task 1 con `node --watch`, va bene lo stesso (i CSS sono statici, serviti al volo — non serve un restart del server per un cambio di CSS).

- [ ] **Step 2: Editor — apertura mappa e disegno poligono**

Con il browser tool:
1. Naviga su `http://localhost:3000/editor`.
2. Seleziona lo strumento "Nuovo poligono" (`#tool-draw`).
3. Clicca 3-4 punti sul canvas mappa per disegnare un poligono di prova.
4. Clicca "Conferma disegno" (`#draw-finish`).
5. Verifica a vista che il nuovo poligono compaia nell'elenco a destra con contorno/selezione ambra.
6. Seleziona lo strumento poligono appena creato, premi "Elimina selezionato" due volte (arma-poi-conferma) per rimuoverlo — verifica che il pulsante diventi rosso (`--danger`) al primo click.

Expected: nessun errore in `read_console_messages`; il poligono di prova viene creato e poi eliminato senza lasciare residui nello stato (la stessa cautela già osservata più volte in questa sessione — non lasciare dati di test nello stato condiviso).

- [ ] **Step 3: Editor — drag griglia**

1. Attiva "Mostra griglia" (`#grid-toggle`).
2. Usa uno dei pulsanti di spostamento griglia (`[data-grid-move]`) e verifica che l'offset cambi (stesso comportamento proporzionale alla cella già verificato in una sessione precedente).
3. Disattiva di nuovo "Mostra griglia" se non era attiva prima del test, per non lasciare lo stato alterato.

Expected: nessun errore console; comportamento identico a prima del restyle (solo i colori sono cambiati).

- [ ] **Step 4: Editor — upload immagine e validazione video**

1. Verifica che il banner `#map-upload-warning` (nascosto di default) non sia visibile a schermo prima di nessun tentativo di upload.
2. Se disponibile un file video di test sovradimensionato da una sessione precedente, ripeti il test di blocco upload (vedi sessione precedente su `checkVideoSafe`) e verifica che il banner rosso (`--danger`/`--danger-bg`) sia leggibile sul nuovo sfondo scuro.

Expected: banner leggibile, stessi identici messaggi di errore, nessuna richiesta di rete inviata al server per un file bloccato.

- [ ] **Step 5: Controllo — pan/zoom e cambio location**

1. Naviga su `http://localhost:3000/control`.
2. Cambia location dal menu a tendina in alto, verifica che la mappa si aggiorni.
3. Usa i pulsanti pan (`[data-pan]`) e lo slider zoom (`#zoom-range`), verifica che il riquadro anteprima mappa reagisca.

Expected: nessun errore console; nessuna differenza di comportamento rispetto a prima del restyle.

- [ ] **Step 6: Display — controllo incrociato**

1. Naviga su `http://localhost:3000/display` in una tab separata.
2. Verifica che i cambi fatti dal controllo al passo precedente (location, pan/zoom) si riflettano qui in tempo reale.

Expected: sincronizzazione realtime invariata (il restyle non tocca socket.io né alcun JS).

- [ ] **Step 7: Ripristina lo stato allo stesso punto di partenza**

Se uno qualunque dei passi precedenti ha cambiato la location attiva, la vista live (pan/zoom/scala), o lasciato un poligono di prova, riportalo esattamente come trovato prima di iniziare questo task (stessa cautela già applicata più volte in questa sessione — vedi `feedback_shared_test_server_caution` nella memoria del progetto).

- [ ] **Step 8: Commit finale (se qualche verifica ha richiesto una correzione)**

Se tutti i controlli sono passati senza bisogno di modifiche, non c'è nulla da committare in questo task — il lavoro è già tutto nei commit dei Task 1-4. Se invece un controllo ha rivelato la necessità di una piccola correzione CSS non prevista nei task precedenti, applicala e:

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add -A
git commit -m "Fix: <descrizione della correzione trovata in verifica>"
```
