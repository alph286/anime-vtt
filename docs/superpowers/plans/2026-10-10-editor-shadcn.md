# Porting di /editor su React + shadcn/ui — Piano di implementazione

> **Per gli agenti esecutori:** SOTTO-SKILL OBBLIGATORIA: usa `superpowers:subagent-driven-development` (consigliata) oppure `superpowers:executing-plans` per eseguire questo piano task per task. I passi usano la sintassi checkbox (`- [ ]`).

**Obiettivo:** sostituire il frontend vanilla di `/editor` (`public/editor/`) con un'app React + shadcn/ui a parità funzionale completa, senza toccare server, eventi socket né moduli di rendering condivisi.

**Architettura:** nuovo progetto Vite in `editor-app/` (React 19, TypeScript, Tailwind v4, shadcn/ui, Zustand+Immer). I moduli classici `public/shared/media.js` e `public/shared/shader-effects.js` restano intatti e vengono caricati con `<script>` classici (le loro funzioni/classi sono globali), dichiarati in `src/globals.d.ts`. Durante lo sviluppo l'app viene costruita in `public/editor-next/` e servita su `/editor-next` accanto al vecchio `/editor`; il cutover finale (ultimo task) la sposta su `/editor` ed elimina i file vecchi.

**Tech Stack:** Vite, React, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Zustand + Immer, socket.io-client, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-10-editor-shadcn-design.md`

**Deviazioni dallo spec (da confermare in revisione):**
1. Lo spec diceva "import diretti da `public/shared/` con alias Vite". `media.js` e `shader-effects.js` sono script classici con globali (non ES module; `media.js` ha solo un `module.exports` condizionale per i test), quindi si caricano come `<script>` classici serviti da Express (`/shared/...`) invece di essere importati. Zero modifiche ai file condivisi.
2. Build in `public/editor-next/` fino al cutover, invece di sovrascrivere subito `public/editor/`, così vecchio e nuovo si possono confrontare fianco a fianco.
3. Il codice dell'editor include anche i pannelli Immagini, Audio, Location, lightbox e il flusso Telegram (non elencati nello spec): sono nel perimetro del porting.
4. L'eliminazione "arma-poi-conferma" usa una sola riga armata alla volta (non un Set): armare una seconda riga disarma la prima. Più sicuro, differenza minima.

## Global Constraints

- Lavorare **solo** nel worktree `/home/kratos/Documenti/Projects/anime-vtt-editor-shadcn`, branch `editor-shadcn`. Mai su `main` né su `editor-ui`.
- Zero modifiche a `server/index.js` oltre alla riga statica `/editor-next` (Task 1) e alla sua rimozione (cutover). Nessuna modifica a `public/shared/*.js`.
- Nomi evento socket identici a quelli di `public/editor/editor.js`; stessi payload.
- Interfaccia utente in italiano; identificatori di codice in inglese.
- Niente emoji. Icone: `lucide-react`.
- Test e verifiche in browser **mai** contro i dati vivi del tavolo: usare una copia (`DATA_DIR`/`STORAGE_DIR` su directory temporanea) e la porta 3100. Non aprire `/display`, `/control` né `/party` mentre un server reale è in uso.
- `node --test public/shared/media.test.js` deve restare verde (38 test) a ogni commit.
- Commit frequenti, messaggi in italiano nello stile del repo (`feat: ...`, `test: ...`, `chore: ...`), terminati da `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Dopo ogni task: `cd editor-app && npm run typecheck && npm test`. Se il typecheck fallisce su codice di questo piano, correggi il tipo senza cambiare il comportamento.
- Tutti i percorsi `editor-app/...` sono relativi alla radice del worktree.

## Review Focus

Casi che lo spec implica ma che nessun task testa per costruzione; ognuno ha il suo test o la sua verifica nel task indicato:

1. **Nessuna location attiva** (es. dopo aver archiviato l'ultima): tutti i controlli disabilitati, nessun crash con `imageRect` nullo, modalità riportata a `select` (Task 2 test store, Task 5/6 verifica browser).
2. **Mappa ruotata** (`rotate90`/`flip180`/auto-rotazione per mappe verticali): i punti cliccati passano da `rotatePointToBase`; disegno poligoni e maniglie shader devono restare corretti (Task 8 verifica browser su location ruotata).
3. **`state:update` in arrivo durante un trascinamento** (poligono, vertice, riordino liste): non deve sovrascrivere l'ordine/posizione in corso (Task 4 test `useSortableList`, Task 8 verifica).
4. **Digitare nei campi dentro i menù** (typeahead di Radix che ruba i tasti, picker colore nativo che chiude il menù): Task 6 e Task 10 con la verifica esplicita e il piano B (Popover) se non regge.
5. **Mappa video** (`.mp4`/`.webm`): `loadMapMedia` restituisce il `<video>`; dimensioni naturali da `mediaW/mediaH` (Task 6 verifica con file video di prova).
6. **Nomi con caratteri speciali** (`<b>`, `"`, `&`) in location/poligoni/immagini: React li escapa, ma l'input riscritto non deve alterarli (Task 4 test `CommitInput`).

---

## Struttura dei file

```
editor-app/
  package.json  vite.config.ts  tsconfig.json  components.json  index.html
  src/
    main.tsx  App.tsx  index.css  stage.css  globals.d.ts  types.ts
    lib/        utils.ts socket.ts history.ts numbers.ts polygon-math.ts
                shader-math.ts grid-math.ts sortable.ts video-check.ts  (+ *.test.ts)
    store/      editor-store.ts (+ editor-store.test.ts)
    hooks/      use-arm-confirm.ts use-sortable-list.ts use-telegram-destinations.ts (+ test)
    stage/      drag-state.ts stage-refs.ts actions.ts use-stage-interactions.ts
                use-shader-loop.ts MapStage.tsx PolygonLayer.tsx ShaderSelection.tsx CompassHandle.tsx
    menus/      MenuBar.tsx MenuField.tsx ColorField.tsx OrphansPopover.tsx ImportExportMenu.tsx
    toolbar/    Header.tsx OptionsBar.tsx
    sidebar/    Sidebar.tsx LocationPanel.tsx ImagePanel.tsx FogPanel.tsx
                ShaderPanel.tsx AudioPanel.tsx GridPanel.tsx Lightbox.tsx
    components/ ui/* (generati da shadcn)  CommitInput.tsx NumberField.tsx
```

Un file = una responsabilità. La logica pura (storico, geometria, numeri, riordino) vive in `src/lib/` ed è l'unica parte testata con TDD; la parte DOM/pointer viene verificata in browser.

---

### Task 1: Scaffold del progetto e route di anteprima

**Files:**
- Create: `editor-app/package.json`, `editor-app/vite.config.ts`, `editor-app/tsconfig.json`, `editor-app/components.json`, `editor-app/index.html`, `editor-app/src/main.tsx`, `editor-app/src/App.tsx`, `editor-app/src/index.css`, `editor-app/src/lib/utils.ts`
- Modify: `server/index.js:58` (aggiungere route), `.gitignore`

**Interfaces:**
- Produces: alias `@` → `editor-app/src`; script npm `dev`, `build`, `test`, `typecheck`; app servita su `/editor-next/`.

- [ ] **Step 1: Dipendenze del server nel worktree** (i `node_modules` non sono in git)

```bash
cd /home/kratos/Documenti/Projects/anime-vtt-editor-shadcn && npm install
```
Expected: installazione senza errori.

- [ ] **Step 2: Inizializzare `editor-app`**

```bash
mkdir -p editor-app/src/lib editor-app/src/store editor-app/src/hooks editor-app/src/stage editor-app/src/menus editor-app/src/toolbar editor-app/src/sidebar editor-app/src/components
cd editor-app
cat > package.json <<'EOF'
{
  "name": "editor-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
EOF
npm install react react-dom zustand immer socket.io-client lucide-react clsx tailwind-merge class-variance-authority radix-ui tw-animate-css
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/dom
```
Expected: `node_modules/` creato dentro `editor-app/`.

- [ ] **Step 3: File di configurazione**

`editor-app/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const BACKEND = process.env.VTT_BACKEND ?? 'http://localhost:3000';

export default defineConfig({
  base: '/editor-next/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: '../public/editor-next', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: BACKEND, ws: true },
      '/api': BACKEND,
      '/storage': BACKEND,
      '/shared': BACKEND,
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
```

`editor-app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`editor-app/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide"
}
```

`editor-app/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`editor-app/index.html` (gli script classici girano **prima** del modulo, che è differito):
```html
<!DOCTYPE html>
<html lang="it" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Anime VTT — Editor</title>
</head>
<body>
  <div id="root"></div>
  <script src="/shared/media.js"></script>
  <script src="/shared/shader-effects.js"></script>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`editor-app/src/index.css` — token legacy del progetto (da `public/shared/theme.css`, con `--accent` rinominato `--vtt-accent` perché in shadcn `--accent` è lo sfondo di hover) mappati sui token shadcn:
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  color-scheme: dark;
  --bg-page: #16181d;
  --bg-panel: #1f232b;
  --bg-control: #262b34;
  --bg-canvas: #0e1014;
  --grid-line: #20242c;
  --text-primary: #cfd6e0;
  --text-secondary: #8a93a3;
  --vtt-accent: #c9822c;
  --accent-text: #1a1a1a;
  --accent-bg-subtle: rgba(201, 130, 44, 0.15);
  --danger: #a32d2d;
  --danger-bg: #3a1f1f;
  --danger-border: #5a2c2c;
  --danger-text: #e08a86;
  --border-control: #333947;

  --background: var(--bg-page);
  --foreground: var(--text-primary);
  --card: var(--bg-panel);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-panel);
  --popover-foreground: var(--text-primary);
  --primary: var(--vtt-accent);
  --primary-foreground: var(--accent-text);
  --secondary: var(--bg-control);
  --secondary-foreground: var(--text-primary);
  --muted: var(--bg-control);
  --muted-foreground: var(--text-secondary);
  --accent: #2c313b;
  --accent-foreground: var(--text-primary);
  --destructive: var(--danger);
  --border: #2c313b;
  --input: var(--border-control);
  --ring: var(--vtt-accent);
  --radius: 0.5rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; margin: 0; font-family: system-ui, sans-serif; }
  [hidden] { display: none !important; }
}
```

`editor-app/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`editor-app/src/App.tsx` (provvisorio):
```tsx
export default function App() {
  return <div className="p-6">Editor shadcn — scaffold</div>;
}
```

- [ ] **Step 4: Componenti shadcn necessari**

```bash
cd editor-app && npx shadcn@latest add -y button menubar tabs select popover dialog input label checkbox separator scroll-area tooltip
```
Expected: file in `src/components/ui/`. Se la CLI modifica `src/index.css`, riapplica a mano i token del Passo 3 (mantieni `--vtt-accent` e la mappatura).

- [ ] **Step 5: Route di anteprima e .gitignore**

In `server/index.js`, subito sotto la riga `app.use('/editor', ...)` (riga 58):
```js
app.use('/editor-next', express.static(path.join(__dirname, '..', 'public', 'editor-next')));
```
In `.gitignore` aggiungi la riga:
```
public/editor-next/
editor-app/node_modules/
```

- [ ] **Step 6: Build e smoke test**

```bash
cd editor-app && npm run build
```
Expected: `public/editor-next/index.html` creato. Poi, con dati temporanei:
```bash
export VTT_SCRATCH=$(mktemp -d)
cp -r /home/kratos/Documenti/Projects/anime-vtt/data "$VTT_SCRATCH/data"
cp -r /home/kratos/Documenti/Projects/anime-vtt/storage "$VTT_SCRATCH/storage"
cd /home/kratos/Documenti/Projects/anime-vtt-editor-shadcn
DATA_DIR="$VTT_SCRATCH/data" STORAGE_DIR="$VTT_SCRATCH/storage" PORT=3100 node server/index.js &
sleep 2 && curl -s http://localhost:3100/editor-next/ | grep -c 'id="root"'
```
Expected: `1`. Lascia il server in esecuzione (terminarlo a fine sessione con `kill %1`) e annota `VTT_SCRATCH` per i task successivi.

- [ ] **Step 7: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt-editor-shadcn
git add editor-app server/index.js .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold editor-app (Vite, React, Tailwind, shadcn) servito su /editor-next

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tipi, globali dei moduli condivisi, socket e store

**Files:**
- Create: `editor-app/src/types.ts`, `editor-app/src/globals.d.ts`, `editor-app/src/lib/socket.ts`, `editor-app/src/lib/history.ts`, `editor-app/src/store/editor-store.ts`
- Test: `editor-app/src/lib/history.test.ts`, `editor-app/src/store/editor-store.test.ts`

**Interfaces:**
- Produces (usate da tutti i task successivi):
  - `types.ts`: `Point`, `Rect`, `Grid`, `Compass`, `Polygon`, `ShaderDeco`, `AudioTrack`, `MapData`, `ImageItem`, `Location`, `VttState`
  - `history.ts`: `HistoryEntry`, `HistoryState`, `Draft`, `HISTORY_LIMIT`, `emptyHistory()`, `pushEntry(h, entry, limit?)`, `stepUndo(h)`, `stepRedo(h)`, `emptyDraft()`, `addPoint(d, p)`, `undoPoint(d)`, `redoPoint(d)`
  - `socket.ts`: `socket`
  - `editor-store.ts`: `useEditorStore`, tipi `Mode`, `SidebarTab`, `Geometry`; selettori `selectActiveLocation`, `selectCanUndo`, `selectCanRedo`, `selectUndoTitle`, `selectRedoTitle`; azioni `receiveState`, `mutateLocation(fn)`, `setMode(mode)`, `chooseSelectTool()`, `chooseDrawTool()`, `chooseGridAlignTool()`, `chooseShaderTool(id)`, `finishTool()`, `select({polygon?, shader?})`, `addDrawPoint(p)`, `resetDrawing()`, `recordHistory(label, undo, redo)`, `undoAction()`, `redoAction()`, `setGeometry(g)`, `setEditorZoom(z)`, `setFogOpacity(v)`, `toggleSquareConstrain()`, `setSidebarTab(t)`, `setUploadWarning(msg)`, `resetForLocationChange()`

- [ ] **Step 1: Tipi** — `editor-app/src/types.ts` (forma ricavata da `server/state.js`)

```ts
export type Point = [number, number];
export interface Rect { left: number; top: number; width: number; height: number }

export interface Grid {
  enabled: boolean; cellSize: number; baseCellSize: number; divisions: number;
  offsetX: number; offsetY: number; color: string; lineWidth: number; opacity: number;
}
export interface Compass { visible: boolean; x: number; y: number; rotation: number }
export interface Polygon { id: string; name: string; points: Point[]; revealed: boolean }
export interface ShaderDeco { id: string; shaderId: string; x: number; y: number; widthM: number; heightM: number }
export interface AudioTrack { name: string; file: string | null; volume: number }
export interface MapData {
  file: string | null; type: string; scale: number; flip180: boolean; rotate90: boolean;
  grid: Grid; compass?: Compass;
  audio: { main: AudioTrack; special: AudioTrack };
  polygons: Polygon[]; shaders: ShaderDeco[];
}
export interface ImageItem { id: string; name: string; file: string; caption?: string; telegramDestination?: string | null }
export interface Location {
  id: string; name: string; map: MapData; images: ImageItem[]; archived: boolean; isDefault?: boolean;
}
export interface VttState { locations: Location[]; activeLocationId: string | null }
```

- [ ] **Step 2: Globali** — `editor-app/src/globals.d.ts` (file globale: niente import/export al top level)

```ts
type Pt = [number, number];

declare function fitRect(containerW: number, containerH: number, naturalW: number, naturalH: number): import('./types').Rect;
declare function positionFitBox(el: HTMLElement, rect: import('./types').Rect): void;
declare function isVideoFile(filename: string): boolean;
declare function mediaW(el: HTMLImageElement | HTMLVideoElement): number;
declare function mediaH(el: HTMLImageElement | HTMLVideoElement): number;
declare function loadMapMedia(
  imgEl: HTMLImageElement, videoEl: HTMLVideoElement, filename: string, src: string, onReady: () => void
): HTMLImageElement | HTMLVideoElement;
declare function computeTotalRotation(naturalW: number, naturalH: number, flip180: boolean, rotate90: boolean): number;
declare function rotatePointToBase(p: Pt, rotation: number): Pt;
declare function layoutMapWrap(container: HTMLElement, wrapEl: HTMLElement, rotation: number): { width: number; height: number };
declare function renderGridSvg(svgEl: SVGElement, grid: import('./types').Grid, naturalW: number, naturalH: number): void;
declare function pointInPolygon(p: Pt, polygon: Pt[]): boolean;
declare function aoePixelsPerMeter(grid: import('./types').Grid): number;
declare function shaderDecorationRectPercent(
  deco: import('./types').ShaderDeco, grid: import('./types').Grid, naturalW: number, naturalH: number
): { leftPct: number; topPct: number; widthPct: number; heightPct: number };
declare const SHADER_EFFECTS: Record<string, { label: string }>;
declare class ShaderLayer {
  constructor(canvas: HTMLCanvasElement);
  readonly available: boolean;
  render(decorations: import('./types').ShaderDeco[], grid: import('./types').Grid, naturalW: number, naturalH: number): void;
}
```

- [ ] **Step 3: Socket** — `editor-app/src/lib/socket.ts`

```ts
import { io } from 'socket.io-client';

export const socket = io();
```

- [ ] **Step 4: Scrivere il test dello storico (deve fallire)** — `editor-app/src/lib/history.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  HISTORY_LIMIT, addPoint, emptyDraft, emptyHistory, pushEntry, redoPoint, stepRedo, stepUndo, undoPoint,
} from './history';

const entry = (label: string) => ({ label, undo: vi.fn(), redo: vi.fn() });

describe('storico globale', () => {
  it('push azzera il ripeti', () => {
    const a = entry('a');
    const b = entry('b');
    let h = pushEntry(emptyHistory(), a);
    h = stepUndo(h).history; // a passa in redo
    expect(h.redo).toHaveLength(1);
    h = pushEntry(h, b);
    expect(h.undo).toEqual([b]);
    expect(h.redo).toEqual([]);
  });

  it('scarta la voce più vecchia oltre il limite', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushEntry(h, entry(String(i)));
    expect(h.undo).toHaveLength(HISTORY_LIMIT);
    expect(h.undo[0].label).toBe('5');
  });

  it('stepUndo su storico vuoto non cambia nulla', () => {
    const h = emptyHistory();
    const res = stepUndo(h);
    expect(res.entry).toBeNull();
    expect(res.history).toBe(h);
  });

  it('stepUndo e stepRedo spostano la voce tra le pile', () => {
    const a = entry('a');
    let h = pushEntry(emptyHistory(), a);
    const u = stepUndo(h);
    expect(u.entry).toBe(a);
    expect(u.history.undo).toEqual([]);
    expect(u.history.redo).toEqual([a]);
    const r = stepRedo(u.history);
    expect(r.entry).toBe(a);
    expect(r.history.undo).toEqual([a]);
    expect(r.history.redo).toEqual([]);
  });
});

describe('bozza poligono', () => {
  it('addPoint azzera il ripeti locale', () => {
    let d = addPoint(emptyDraft(), [1, 1]);
    d = addPoint(d, [2, 2]);
    d = undoPoint(d);
    expect(d.redo).toEqual([[2, 2]]);
    d = addPoint(d, [3, 3]);
    expect(d.points).toEqual([[1, 1], [3, 3]]);
    expect(d.redo).toEqual([]);
  });

  it('undoPoint e redoPoint sono simmetrici', () => {
    let d = addPoint(addPoint(emptyDraft(), [1, 1]), [2, 2]);
    d = undoPoint(d);
    d = redoPoint(d);
    expect(d.points).toEqual([[1, 1], [2, 2]]);
  });

  it('su bozza vuota undoPoint/redoPoint non cambiano nulla', () => {
    const d = emptyDraft();
    expect(undoPoint(d)).toBe(d);
    expect(redoPoint(d)).toBe(d);
  });
});
```

- [ ] **Step 5: Verificare che fallisca**

Run: `cd editor-app && npx vitest run src/lib/history.test.ts`
Expected: FAIL (modulo `./history` non esiste).

- [ ] **Step 6: Implementare `editor-app/src/lib/history.ts`**

```ts
import type { Point } from '@/types';

export interface HistoryEntry { label: string; undo: () => void; redo: () => void }
export interface HistoryState { undo: HistoryEntry[]; redo: HistoryEntry[] }
export const HISTORY_LIMIT = 50;

export const emptyHistory = (): HistoryState => ({ undo: [], redo: [] });

export function pushEntry(h: HistoryState, entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryState {
  const undo = [...h.undo, entry];
  if (undo.length > limit) undo.shift();
  return { undo, redo: [] };
}

export function stepUndo(h: HistoryState): { history: HistoryState; entry: HistoryEntry | null } {
  const entry = h.undo[h.undo.length - 1];
  if (!entry) return { history: h, entry: null };
  return { history: { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] }, entry };
}

export function stepRedo(h: HistoryState): { history: HistoryState; entry: HistoryEntry | null } {
  const entry = h.redo[h.redo.length - 1];
  if (!entry) return { history: h, entry: null };
  return { history: { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) }, entry };
}

export interface Draft { points: Point[]; redo: Point[] }
export const emptyDraft = (): Draft => ({ points: [], redo: [] });

export function addPoint(d: Draft, p: Point): Draft {
  return { points: [...d.points, p], redo: [] };
}

export function undoPoint(d: Draft): Draft {
  if (!d.points.length) return d;
  return { points: d.points.slice(0, -1), redo: [...d.redo, d.points[d.points.length - 1]] };
}

export function redoPoint(d: Draft): Draft {
  if (!d.redo.length) return d;
  return { points: [...d.points, d.redo[d.redo.length - 1]], redo: d.redo.slice(0, -1) };
}
```

- [ ] **Step 7: Verificare che passi**

Run: `cd editor-app && npx vitest run src/lib/history.test.ts`
Expected: PASS (7 test).

- [ ] **Step 8: Scrivere il test dello store (deve fallire)** — `editor-app/src/store/editor-store.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VttState } from '@/types';
import { selectActiveLocation, selectCanUndo, selectUndoTitle, useEditorStore } from './editor-store';

function makeState(activeLocationId: string | null = 'a'): VttState {
  const grid = { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.3, opacity: 1 };
  const audio = { name: '', file: null, volume: 0.7 };
  return {
    activeLocationId,
    locations: [{
      id: 'a', name: 'A', archived: false, images: [],
      map: {
        file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid,
        audio: { main: audio, special: audio }, shaders: [],
        polygons: [{ id: 'p1', name: 'P1', points: [[0, 0], [10, 0], [10, 10]], revealed: false }],
      },
    }],
  };
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

describe('stato server', () => {
  it('receiveState espone la location attiva', () => {
    useEditorStore.getState().receiveState(makeState());
    expect(selectActiveLocation(useEditorStore.getState())?.id).toBe('a');
  });

  it('senza location attiva riporta modalità e selezioni ai default', () => {
    const s = useEditorStore.getState();
    s.receiveState(makeState());
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.select({ polygon: 'p1', shader: 's1' });
    s.receiveState(makeState(null));
    const after = useEditorStore.getState();
    expect(after.mode).toBe('select');
    expect(after.drawing.points).toEqual([]);
    expect(after.selectedPolygonId).toBeNull();
    expect(after.selectedShaderId).toBeNull();
  });

  it('mutateLocation modifica solo la location attiva', () => {
    const s = useEditorStore.getState();
    s.receiveState(makeState());
    s.mutateLocation((loc) => { loc.map.polygons[0].points[1] = [50, 50]; });
    expect(selectActiveLocation(useEditorStore.getState())?.map.polygons[0].points[1]).toEqual([50, 50]);
  });
});

describe('strumenti', () => {
  it('chooseDrawTool deseleziona il poligono; chooseShaderTool imposta il tipo e azzera la bozza', () => {
    const s = useEditorStore.getState();
    s.select({ polygon: 'p1' });
    s.chooseDrawTool();
    expect(useEditorStore.getState().selectedPolygonId).toBeNull();
    expect(useEditorStore.getState().mode).toBe('draw');
    s.addDrawPoint([1, 1]);
    s.chooseShaderTool('portal_red');
    const after = useEditorStore.getState();
    expect(after.mode).toBe('shader-place');
    expect(after.selectedShaderType).toBe('portal_red');
    expect(after.drawing.points).toEqual([]);
  });

  it('finishTool torna a select', () => {
    const s = useEditorStore.getState();
    s.chooseGridAlignTool();
    s.finishTool();
    expect(useEditorStore.getState().mode).toBe('select');
  });
});

describe('undo/redo', () => {
  it('in modalità draw agisce solo sui punti della bozza', () => {
    const s = useEditorStore.getState();
    const undo = vi.fn();
    s.recordHistory('x', undo, vi.fn());
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.addDrawPoint([2, 2]);
    s.undoAction();
    expect(useEditorStore.getState().drawing.points).toEqual([[1, 1]]);
    expect(undo).not.toHaveBeenCalled();
    expect(selectCanUndo(useEditorStore.getState())).toBe(true);
    expect(selectUndoTitle(useEditorStore.getState())).toBe('Annulla: ultimo punto');
  });

  it('fuori da draw esegue le voci dello storico globale', () => {
    const s = useEditorStore.getState();
    const undo = vi.fn();
    const redo = vi.fn();
    s.recordHistory('area spostata', undo, redo);
    expect(selectUndoTitle(useEditorStore.getState())).toBe('Annulla: area spostata');
    s.undoAction();
    expect(undo).toHaveBeenCalledOnce();
    s.redoAction();
    expect(redo).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().history.undo).toHaveLength(1);
  });
});

describe('cambio location', () => {
  it('resetForLocationChange azzera selezione, bozza e zoom', () => {
    const s = useEditorStore.getState();
    s.select({ polygon: 'p1' });
    s.setEditorZoom(2);
    s.chooseDrawTool();
    s.addDrawPoint([1, 1]);
    s.resetForLocationChange();
    const after = useEditorStore.getState();
    expect(after.selectedPolygonId).toBeNull();
    expect(after.drawing.points).toEqual([]);
    expect(after.editorZoom).toBe(1);
  });
});
```

- [ ] **Step 9: Verificare che fallisca**

Run: `cd editor-app && npx vitest run src/store/editor-store.test.ts`
Expected: FAIL (modulo non esiste).

- [ ] **Step 10: Implementare `editor-app/src/store/editor-store.ts`**

```ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Location, Point, Rect, VttState } from '@/types';
import {
  addPoint, emptyDraft, emptyHistory, pushEntry, redoPoint, stepRedo, stepUndo, undoPoint,
  type Draft, type HistoryState,
} from '@/lib/history';

export type Mode = 'select' | 'draw' | 'grid-align' | 'shader-place';
export type SidebarTab = 'location' | 'immagini' | 'fog' | 'shader' | 'audio' | 'grid';
export interface Geometry { imageRect: Rect | null; rotation: number; naturalW: number; naturalH: number }

interface EditorStore {
  server: VttState | null;
  mode: Mode;
  drawing: Draft;
  selectedPolygonId: string | null;
  selectedShaderId: string | null;
  selectedShaderType: string;
  fogOpacity: number;
  editorZoom: number;
  gridSquareConstrain: boolean;
  sidebarTab: SidebarTab;
  uploadWarning: string | null;
  history: HistoryState;
  geometry: Geometry;

  receiveState: (s: VttState) => void;
  mutateLocation: (fn: (loc: Location) => void) => void;
  setMode: (mode: Mode) => void;
  chooseSelectTool: () => void;
  chooseDrawTool: () => void;
  chooseGridAlignTool: () => void;
  chooseShaderTool: (shaderId: string) => void;
  finishTool: () => void;
  select: (patch: { polygon?: string | null; shader?: string | null }) => void;
  addDrawPoint: (p: Point) => void;
  resetDrawing: () => void;
  recordHistory: (label: string, undo: () => void, redo: () => void) => void;
  undoAction: () => void;
  redoAction: () => void;
  setGeometry: (g: Geometry) => void;
  setEditorZoom: (z: number) => void;
  setFogOpacity: (v: number) => void;
  toggleSquareConstrain: () => void;
  setSidebarTab: (t: SidebarTab) => void;
  setUploadWarning: (msg: string | null) => void;
  resetForLocationChange: () => void;
}

export const selectActiveLocation = (s: Pick<EditorStore, 'server'>): Location | undefined =>
  s.server?.locations.find((l) => l.id === s.server!.activeLocationId);

export const selectCanUndo = (s: EditorStore) =>
  s.mode === 'draw' ? s.drawing.points.length > 0 : s.history.undo.length > 0;
export const selectCanRedo = (s: EditorStore) =>
  s.mode === 'draw' ? s.drawing.redo.length > 0 : s.history.redo.length > 0;
export const selectUndoTitle = (s: EditorStore) => {
  if (!selectCanUndo(s)) return 'Annulla';
  const target = s.mode === 'draw' ? 'ultimo punto' : s.history.undo[s.history.undo.length - 1]?.label;
  return `Annulla: ${target}`;
};
export const selectRedoTitle = (s: EditorStore) => {
  if (!selectCanRedo(s)) return 'Ripeti';
  const target = s.mode === 'draw' ? 'punto tolto' : s.history.redo[s.history.redo.length - 1]?.label;
  return `Ripeti: ${target}`;
};

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    server: null,
    mode: 'select',
    drawing: emptyDraft(),
    selectedPolygonId: null,
    selectedShaderId: null,
    selectedShaderType: 'portal',
    fogOpacity: 0.45,
    editorZoom: 1,
    gridSquareConstrain: false,
    sidebarTab: 'location',
    uploadWarning: null,
    history: emptyHistory(),
    geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0 },

    receiveState: (s) =>
      set((st) => {
        st.server = s;
        const hasActive = Boolean(s.activeLocationId) && s.locations.some((l) => l.id === s.activeLocationId);
        if (!hasActive) {
          st.mode = 'select';
          st.drawing = emptyDraft();
          st.selectedPolygonId = null;
          st.selectedShaderId = null;
        }
      }),

    mutateLocation: (fn) =>
      set((st) => {
        const loc = st.server?.locations.find((l) => l.id === st.server!.activeLocationId);
        if (loc) fn(loc);
      }),

    setMode: (mode) => set({ mode }),
    chooseSelectTool: () => set({ mode: 'select', drawing: emptyDraft() }),
    chooseDrawTool: () => set({ mode: 'draw', selectedPolygonId: null }),
    chooseGridAlignTool: () => set({ mode: 'grid-align' }),
    chooseShaderTool: (shaderId) => set({ mode: 'shader-place', selectedShaderType: shaderId, drawing: emptyDraft() }),
    finishTool: () => set({ mode: 'select' }),

    select: (patch) =>
      set((st) => {
        if (patch.polygon !== undefined) st.selectedPolygonId = patch.polygon;
        if (patch.shader !== undefined) st.selectedShaderId = patch.shader;
      }),

    addDrawPoint: (p) => set((st) => { st.drawing = addPoint(st.drawing, p); }),
    resetDrawing: () => set({ drawing: emptyDraft() }),

    recordHistory: (label, undo, redo) =>
      set((st) => { st.history = pushEntry(st.history, { label, undo, redo }); }),

    undoAction: () => {
      const s = get();
      if (s.mode === 'draw') {
        set((st) => { st.drawing = undoPoint(st.drawing); });
        return;
      }
      const { history, entry } = stepUndo(s.history);
      if (!entry) return;
      set((st) => { st.history = history; });
      entry.undo();
    },

    redoAction: () => {
      const s = get();
      if (s.mode === 'draw') {
        set((st) => { st.drawing = redoPoint(st.drawing); });
        return;
      }
      const { history, entry } = stepRedo(s.history);
      if (!entry) return;
      set((st) => { st.history = history; });
      entry.redo();
    },

    setGeometry: (g) => set({ geometry: g }),
    setEditorZoom: (z) => set({ editorZoom: z }),
    setFogOpacity: (v) => set({ fogOpacity: v }),
    toggleSquareConstrain: () => set((st) => { st.gridSquareConstrain = !st.gridSquareConstrain; }),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setUploadWarning: (msg) => set({ uploadWarning: msg }),
    resetForLocationChange: () => set({ selectedPolygonId: null, drawing: emptyDraft(), editorZoom: 1 }),
  }))
);
```

- [ ] **Step 11: Verificare che passi**

Run: `cd editor-app && npx vitest run && npm run typecheck`
Expected: tutti i test PASS, typecheck senza errori.

- [ ] **Step 12: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, tipi, storico (con bozza poligono) e store Zustand con test

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Logica pura — numeri, poligoni, shader, griglia, riordino

**Files:**
- Create: `editor-app/src/lib/numbers.ts`, `polygon-math.ts`, `shader-math.ts`, `grid-math.ts`, `sortable.ts`
- Test: `editor-app/src/lib/numbers.test.ts`, `polygon-math.test.ts`, `shader-math.test.ts`, `grid-math.test.ts`, `sortable.test.ts`

**Interfaces:**
- Produces:
  - `numbers.ts`: `clamp(v, min, max): number`, `parseClamped(raw: string, min, max): number | null`
  - `polygon-math.ts`: `translatePolygon(original: Point[], dx, dy): Point[]`, `removeVertex(points, index): Point[] | null`, `polygonMoved(a, b): boolean`, `sortPolygonIdsByName(polys: {id,name}[]): string[]`
  - `shader-math.ts`: `SHADER_MIN_M`, `Corner`, `CORNERS`, `OPPOSITE`, `rectCorners(rect)`, `placementFromDrag(start, end, nw, nh, ppm)`, `resizeFromFixedCorner(fixed, current, nw, nh, ppm)` (entrambe → `{x, y, widthM, heightM}`), `stepSize(deco, kind)` (→ `{widthM, heightM}`)
  - `grid-math.ts`: `constrainSquare(w, h, nw, nh)`, `gridFromAlignDrag(start, end, nw, nh, square, divisions)`, `gridHistoryAfter(before, patch)`, `nudgeOffsets(grid, dx, dy)`
  - `sortable.ts`: `moveId(ids, movingId, overId, before)`

- [ ] **Step 1: Test (devono fallire)**

`editor-app/src/lib/numbers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clamp, parseClamped } from './numbers';

describe('parseClamped', () => {
  it('stringa vuota o non numerica → null', () => {
    expect(parseClamped('', 0, 10)).toBeNull();
    expect(parseClamped('abc', 0, 10)).toBeNull();
  });
  it('limita ai bordi', () => {
    expect(parseClamped('15', 0, 10)).toBe(10);
    expect(parseClamped('-5', 0, 10)).toBe(0);
    expect(parseClamped('3.5', 0, 10)).toBe(3.5);
  });
});
describe('clamp', () => {
  it('limita', () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-1, 0, 100)).toBe(0);
  });
});
```

`editor-app/src/lib/polygon-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { polygonMoved, removeVertex, sortPolygonIdsByName, translatePolygon } from './polygon-math';
import type { Point } from '@/types';

describe('translatePolygon', () => {
  it('trasla e limita ai bordi 0..100', () => {
    const original: Point[] = [[10, 10], [95, 50], [50, 90]];
    expect(translatePolygon(original, 20, -30)).toEqual([[30, 0], [100, 20], [70, 60]]);
  });
  it('non muta l’originale', () => {
    const original: Point[] = [[10, 10]];
    translatePolygon(original, 5, 5);
    expect(original).toEqual([[10, 10]]);
  });
});
describe('removeVertex', () => {
  it('rifiuta se restano meno di 3 punti', () => {
    expect(removeVertex([[0, 0], [1, 1], [2, 2]], 0)).toBeNull();
  });
  it('rimuove il punto richiesto', () => {
    expect(removeVertex([[0, 0], [1, 1], [2, 2], [3, 3]], 1)).toEqual([[0, 0], [2, 2], [3, 3]]);
  });
});
describe('polygonMoved', () => {
  it('rileva spostamento e assenza di spostamento', () => {
    expect(polygonMoved([[1, 1]], [[1, 1]])).toBe(false);
    expect(polygonMoved([[1, 1]], [[1, 2]])).toBe(true);
  });
});
describe('sortPolygonIdsByName', () => {
  it('ordina in italiano con numeri naturali', () => {
    const ids = sortPolygonIdsByName([
      { id: 'a', name: 'Area 10' }, { id: 'b', name: 'Area 2' }, { id: 'c', name: 'area 1' },
    ]);
    expect(ids).toEqual(['c', 'b', 'a']);
  });
});
```

`editor-app/src/lib/shader-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { OPPOSITE, SHADER_MIN_M, placementFromDrag, rectCorners, resizeFromFixedCorner, stepSize } from './shader-math';

const nw = 1000;
const nh = 500;
const ppm = 50;

describe('placementFromDrag', () => {
  it('converte il rettangolo trascinato in centro e metri', () => {
    expect(placementFromDrag([10, 10], [30, 20], nw, nh, ppm)).toEqual({ x: 20, y: 15, widthM: 4, heightM: 1 });
  });
  it('rispetta la dimensione minima', () => {
    const r = placementFromDrag([10, 10], [10, 10], nw, nh, ppm);
    expect(r.widthM).toBe(SHADER_MIN_M);
    expect(r.heightM).toBe(SHADER_MIN_M);
  });
});
describe('resizeFromFixedCorner', () => {
  it('l’angolo fisso resta fermo', () => {
    expect(resizeFromFixedCorner([10, 10], [30, 20], nw, nh, ppm)).toEqual({ x: 20, y: 15, widthM: 4, heightM: 1 });
  });
  it('funziona trascinando oltre l’angolo fisso', () => {
    const r = resizeFromFixedCorner([10, 10], [5, 2], nw, nh, ppm);
    expect(r.x).toBeCloseTo(7.5);
    expect(r.y).toBeCloseTo(6);
    expect(r.widthM).toBeCloseTo(1);
    expect(r.heightM).toBeCloseTo(0.8);
  });
});
describe('rectCorners/OPPOSITE', () => {
  it('calcola i quattro angoli', () => {
    const c = rectCorners({ leftPct: 10, topPct: 20, widthPct: 30, heightPct: 40 });
    expect(c.nw).toEqual([10, 20]);
    expect(c.se).toEqual([40, 60]);
    expect(c.ne).toEqual([40, 20]);
    expect(c.sw).toEqual([10, 60]);
  });
  it('opposti', () => {
    expect(OPPOSITE.nw).toBe('se');
    expect(OPPOSITE.ne).toBe('sw');
  });
});
describe('stepSize', () => {
  const deco = { widthM: 2, heightM: 0.5 };
  it('aumenta e riduce a passi di 0.5 m, con minimo', () => {
    expect(stepSize(deco, 'w-in')).toEqual({ widthM: 2.5, heightM: 0.5 });
    expect(stepSize(deco, 'w-out')).toEqual({ widthM: 1.5, heightM: 0.5 });
    expect(stepSize(deco, 'h-out')).toEqual({ widthM: 2, heightM: SHADER_MIN_M });
    expect(stepSize(deco, 'h-in')).toEqual({ widthM: 2, heightM: 1 });
  });
});
```

`editor-app/src/lib/grid-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { constrainSquare, gridFromAlignDrag, gridHistoryAfter, nudgeOffsets } from './grid-math';

describe('gridFromAlignDrag', () => {
  it('celle da 100px, nessuno scarto', () => {
    expect(gridFromAlignDrag([10, 10], [20, 20], 1000, 1000, false, 1)).toEqual({
      baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0,
    });
  });
  it('calcola lo scarto rispetto all’origine', () => {
    const r = gridFromAlignDrag([10.5, 10.5], [20.5, 20.5], 1000, 1000, false, 1);
    expect(r?.offsetX).toBe(5);
    expect(r?.offsetY).toBe(5);
  });
  it('le divisioni dimezzano la cella effettiva e restano memorizzate', () => {
    const r = gridFromAlignDrag([10.5, 10.5], [20.5, 20.5], 1000, 1000, false, 2);
    expect(r?.baseCellSize).toBe(100);
    expect(r?.divisions).toBe(2);
    expect(r?.offsetX).toBe(5); // 105 % 50
  });
  it('vincolo quadrato usa il lato maggiore', () => {
    const r = gridFromAlignDrag([0, 0], [20, 10], 1000, 1000, true, 1);
    expect(r?.baseCellSize).toBe(200);
  });
  it('trascinamento troppo piccolo → null', () => {
    expect(gridFromAlignDrag([10, 10], [10.2, 10.2], 1000, 1000, false, 1)).toBeNull();
  });
});
describe('constrainSquare', () => {
  it('rende quadrato in pixel, non in percentuale', () => {
    expect(constrainSquare(20, 10, 1000, 500)).toEqual({ width: 20, height: 40 });
  });
});
describe('gridHistoryAfter', () => {
  const before = { enabled: true, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.3, opacity: 1 };
  it('ricalcola cellSize se cambiano baseCellSize/divisions', () => {
    expect(gridHistoryAfter(before, { baseCellSize: 200, divisions: 2 }).cellSize).toBe(100);
  });
  it('non tocca cellSize per un semplice spostamento', () => {
    const after = gridHistoryAfter(before, { offsetX: 7 });
    expect(after.cellSize).toBe(100);
    expect(after.offsetX).toBe(7);
  });
});
describe('nudgeOffsets', () => {
  it('passo = 10% della cella, minimo 1', () => {
    expect(nudgeOffsets({ cellSize: 100, offsetX: 5, offsetY: 5 }, 1, -1)).toEqual({ offsetX: 15, offsetY: -5 });
    expect(nudgeOffsets({ cellSize: 4, offsetX: 0, offsetY: 0 }, 1, 0)).toEqual({ offsetX: 1, offsetY: 0 });
  });
});
```

`editor-app/src/lib/sortable.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { moveId } from './sortable';

describe('moveId', () => {
  it('sposta dopo l’elemento sorvolato', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 'c', false)).toEqual(['b', 'c', 'a']);
  });
  it('sposta prima dell’elemento sorvolato', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a', true)).toEqual(['c', 'a', 'b']);
  });
  it('stesso id o id sconosciuto: invariato', () => {
    expect(moveId(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 'x', 'a', true)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `cd editor-app && npx vitest run src/lib`
Expected: FAIL per i moduli mancanti (history passa ancora).

- [ ] **Step 3: Implementazioni**

`editor-app/src/lib/numbers.ts`:
```ts
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function parseClamped(raw: string, min: number, max: number): number | null {
  if (raw === '') return null;
  const v = Number(raw);
  if (Number.isNaN(v)) return null;
  return clamp(v, min, max);
}
```

`editor-app/src/lib/polygon-math.ts`:
```ts
import type { Point } from '@/types';
import { clamp } from './numbers';

export function translatePolygon(original: Point[], dx: number, dy: number): Point[] {
  return original.map(([x, y]) => [clamp(x + dx, 0, 100), clamp(y + dy, 0, 100)] as Point);
}

export function removeVertex(points: Point[], index: number): Point[] | null {
  if (points.length <= 3) return null;
  return points.filter((_, i) => i !== index).map((p) => [...p] as Point);
}

export function polygonMoved(a: Point[], b: Point[]): boolean {
  return a.some(([x, y], i) => x !== b[i][0] || y !== b[i][1]);
}

export function sortPolygonIdsByName(polys: { id: string; name: string }[]): string[] {
  return [...polys]
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))
    .map((p) => p.id);
}
```

`editor-app/src/lib/shader-math.ts`:
```ts
import type { Point } from '@/types';
import { clamp } from './numbers';

export const SHADER_MIN_M = 0.5;
export type Corner = 'nw' | 'ne' | 'se' | 'sw';
export const CORNERS: Corner[] = ['nw', 'ne', 'se', 'sw'];
export const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

export interface RectPct { leftPct: number; topPct: number; widthPct: number; heightPct: number }
export interface Placement { x: number; y: number; widthM: number; heightM: number }

export function rectCorners(r: RectPct): Record<Corner, Point> {
  return {
    nw: [r.leftPct, r.topPct],
    ne: [r.leftPct + r.widthPct, r.topPct],
    se: [r.leftPct + r.widthPct, r.topPct + r.heightPct],
    sw: [r.leftPct, r.topPct + r.heightPct],
  };
}

function fromRect(leftPct: number, topPct: number, widthPct: number, heightPct: number, nw: number, nh: number, ppm: number): Placement {
  return {
    x: clamp(leftPct + widthPct / 2, 0, 100),
    y: clamp(topPct + heightPct / 2, 0, 100),
    widthM: Math.max(SHADER_MIN_M, ((widthPct / 100) * nw) / ppm),
    heightM: Math.max(SHADER_MIN_M, ((heightPct / 100) * nh) / ppm),
  };
}

export function placementFromDrag(start: Point, end: Point, nw: number, nh: number, ppm: number): Placement {
  return fromRect(Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]), nw, nh, ppm);
}

export function resizeFromFixedCorner(fixed: Point, current: Point, nw: number, nh: number, ppm: number): Placement {
  return placementFromDrag(fixed, current, nw, nh, ppm);
}

export type StepKind = 'w-out' | 'w-in' | 'h-out' | 'h-in';

export function stepSize(deco: { widthM: number; heightM: number }, kind: StepKind): { widthM: number; heightM: number } {
  let { widthM, heightM } = deco;
  if (kind === 'w-out') widthM = Math.max(SHADER_MIN_M, widthM - SHADER_MIN_M);
  if (kind === 'w-in') widthM = widthM + SHADER_MIN_M;
  if (kind === 'h-out') heightM = Math.max(SHADER_MIN_M, heightM - SHADER_MIN_M);
  if (kind === 'h-in') heightM = heightM + SHADER_MIN_M;
  return { widthM, heightM };
}
```

`editor-app/src/lib/grid-math.ts`:
```ts
import type { Grid, Point } from '@/types';

export function constrainSquare(widthPct: number, heightPct: number, nw: number, nh: number): { width: number; height: number } {
  const sidePx = Math.max((widthPct / 100) * nw, (heightPct / 100) * nh);
  return { width: (sidePx / nw) * 100, height: (sidePx / nh) * 100 };
}

export interface AlignResult { baseCellSize: number; divisions: number; offsetX: number; offsetY: number }

export function gridFromAlignDrag(
  start: Point, end: Point, nw: number, nh: number, square: boolean, divisions: number
): AlignResult | null {
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  const widthPct = Math.abs(end[0] - start[0]);
  const heightPct = Math.abs(end[1] - start[1]);
  if (widthPct < 0.5 || heightPct < 0.5) return null;

  let cellW = (widthPct / 100) * nw;
  let cellH = (heightPct / 100) * nh;
  if (square) {
    const side = Math.max(cellW, cellH);
    cellW = side;
    cellH = side;
  }
  const div = Math.max(1, Math.round(divisions) || 1);
  const baseCellSize = Math.max(4, Math.round((cellW + cellH) / 2));
  const cellSize = Math.max(4, Math.round(baseCellSize / div));
  const originX = Math.round((leftPct / 100) * nw);
  const originY = Math.round((topPct / 100) * nh);
  return {
    baseCellSize,
    divisions: div,
    offsetX: ((originX % cellSize) + cellSize) % cellSize,
    offsetY: ((originY % cellSize) + cellSize) % cellSize,
  };
}

export function gridHistoryAfter(before: Grid, patch: Partial<Grid>): Grid {
  const after = { ...before, ...patch };
  if (patch.baseCellSize !== undefined || patch.divisions !== undefined) {
    after.cellSize = Math.max(4, Math.round(after.baseCellSize / after.divisions));
  }
  return after;
}

export function nudgeOffsets(grid: Pick<Grid, 'cellSize' | 'offsetX' | 'offsetY'>, dx: number, dy: number): { offsetX: number; offsetY: number } {
  const cellSize = grid.cellSize || 100;
  const step = Math.max(1, Math.round(cellSize * 0.1));
  return { offsetX: (grid.offsetX || 0) + dx * step, offsetY: (grid.offsetY || 0) + dy * step };
}
```

`editor-app/src/lib/sortable.ts`:
```ts
export function moveId(ids: string[], movingId: string, overId: string, before: boolean): string[] {
  if (movingId === overId || !ids.includes(movingId) || !ids.includes(overId)) return ids;
  const without = ids.filter((id) => id !== movingId);
  const overIndex = without.indexOf(overId);
  without.splice(before ? overIndex : overIndex + 1, 0, movingId);
  return without;
}
```

- [ ] **Step 4: Verificare che passino**

Run: `cd editor-app && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, logica pura (numeri, poligoni, shader, griglia, riordino) con test

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Hook e componenti base — conferma a due click, riordino, campi

**Files:**
- Create: `editor-app/src/hooks/use-arm-confirm.ts`, `use-sortable-list.ts`, `use-telegram-destinations.ts`, `editor-app/src/components/CommitInput.tsx`, `NumberField.tsx`
- Test: `editor-app/src/hooks/use-arm-confirm.test.ts`, `editor-app/src/components/CommitInput.test.tsx`, `NumberField.test.tsx`

**Interfaces:**
- Produces:
  - `useArmConfirm(timeoutMs = 2500)` → `{ armedKey: string | null; isArmed(key): boolean; press(key, onConfirm): void; disarm(): void }` — primo `press` arma (e dopo 2.5 s disarma da solo), secondo `press` con la stessa chiave chiama `onConfirm`
  - `useSortableList(ids, onCommit)` → `{ order: string[]; isDragging: boolean; rowRef(id): (el) => void; handleProps(id): {...} }`
  - `useTelegramDestinations()` → `null | {name: string}[]` (`null` = in caricamento, `[]` = non disponibili)
  - `<CommitInput value onCommit className? placeholder? disabled? />` — commit su blur/Invio solo se il testo è cambiato
  - `<NumberField value min max step? live? disabled? onCommit className? aria-label? />` — commit su blur/Invio se modificato; con `live` applica anche durante la digitazione

- [ ] **Step 1: Test (devono fallire)**

`editor-app/src/hooks/use-arm-confirm.test.ts`:
```ts
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArmConfirm } from './use-arm-confirm';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useArmConfirm', () => {
  it('il primo press arma, il secondo conferma', () => {
    const { result } = renderHook(() => useArmConfirm());
    const onConfirm = vi.fn();
    act(() => result.current.press('a', onConfirm));
    expect(result.current.isArmed('a')).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => result.current.press('a', onConfirm));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(result.current.armedKey).toBeNull();
  });

  it('si disarma da solo dopo 2.5 s', () => {
    const { result } = renderHook(() => useArmConfirm());
    act(() => result.current.press('a', vi.fn()));
    act(() => { vi.advanceTimersByTime(2500); });
    expect(result.current.armedKey).toBeNull();
  });

  it('armare un’altra chiave non conferma la prima', () => {
    const { result } = renderHook(() => useArmConfirm());
    const onConfirm = vi.fn();
    act(() => result.current.press('a', onConfirm));
    act(() => result.current.press('b', onConfirm));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.isArmed('b')).toBe(true);
  });
});
```

`editor-app/src/components/CommitInput.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitInput } from './CommitInput';

describe('CommitInput', () => {
  it('commit su blur solo se il testo è cambiato', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="Taverna" onCommit={onCommit} placeholder="nome" />);
    const input = screen.getByPlaceholderText('nome');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Locanda' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Locanda');
  });

  it('Invio fa blur e conferma', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="A" onCommit={onCommit} placeholder="n" />);
    const input = screen.getByPlaceholderText('n') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('B');
  });

  it('conserva i caratteri speciali senza alterarli', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="x" onCommit={onCommit} placeholder="n" />);
    const input = screen.getByPlaceholderText('n');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '<b>"A" & B</b>' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('<b>"A" & B</b>');
  });
});
```

`editor-app/src/components/NumberField.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('limita al massimo e normalizza il testo al blur', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(100);
    expect(input.value).toBe('100');
  });

  it('valore non valido: ripristina senza chiamare onCommit', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('50');
  });

  it('con live applica durante la digitazione', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" live value={100} min={25} max={1000} onCommit={onCommit} />);
    const input = screen.getByLabelText('n');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '200' } });
    expect(onCommit).toHaveBeenCalledWith(200);
  });

  it('senza modifiche non emette al blur', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `cd editor-app && npx vitest run src/hooks src/components`
Expected: FAIL (moduli mancanti).

- [ ] **Step 3: Implementazioni**

`editor-app/src/hooks/use-arm-confirm.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useArmConfirm(timeoutMs = 2500) {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disarm = useCallback(() => {
    clearTimeout(timer.current);
    setArmedKey(null);
  }, []);

  const press = useCallback(
    (key: string, onConfirm: () => void) => {
      if (armedKey !== key) {
        setArmedKey(key);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setArmedKey(null), timeoutMs);
        return;
      }
      disarm();
      onConfirm();
    },
    [armedKey, timeoutMs, disarm]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { armedKey, isArmed: (key: string) => armedKey === key, press, disarm };
}
```

`editor-app/src/components/CommitInput.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CommitInput({ value, onCommit, className, placeholder, disabled }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <Input
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
```

`editor-app/src/components/NumberField.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseClamped } from '@/lib/numbers';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  live?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  onCommit: (value: number) => void;
}

export function NumberField({ value, min, max, step, live, disabled, className, onCommit, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      className={className}
      aria-label={rest['aria-label']}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; dirty.current = false; }}
      onChange={(e) => {
        setText(e.target.value);
        dirty.current = true;
        if (live) {
          const v = parseClamped(e.target.value, min, max);
          if (v !== null) onCommit(v);
        }
      }}
      onBlur={() => {
        focused.current = false;
        if (!dirty.current) return;
        dirty.current = false;
        const v = parseClamped(text, min, max);
        if (v === null) { setText(String(value)); return; }
        setText(String(v));
        onCommit(v);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
```

`editor-app/src/hooks/use-sortable-list.ts` (riordino via Pointer Events con pointer capture, come l'originale; durante il trascinamento gli aggiornamenti in arrivo non cambiano l'ordine):
```ts
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { moveId } from '@/lib/sortable';

export function useSortableList(ids: string[], onCommit: (orderedIds: string[]) => void) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const active = useRef<{ pointerId: number; id: string } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    []
  );

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const a = active.current;
    if (!a || e.pointerId !== a.pointerId) return;
    const finalOrder = orderRef.current ?? ids;
    active.current = null;
    orderRef.current = null;
    setDragOrder(null);
    onCommit(finalOrder);
  };

  const handleProps = (id: string) => ({
    style: { touchAction: 'none' as const },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = { pointerId: e.pointerId, id };
      orderRef.current = ids;
      setDragOrder(ids);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      const current = orderRef.current ?? ids;
      const over = current.find((other) => {
        if (other === a.id) return false;
        const r = rows.current.get(other)?.getBoundingClientRect();
        return Boolean(r && e.clientY >= r.top && e.clientY <= r.bottom);
      });
      if (!over) return;
      const r = rows.current.get(over)!.getBoundingClientRect();
      const next = moveId(current, a.id, over, e.clientY < r.top + r.height / 2);
      orderRef.current = next;
      setDragOrder(next);
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  return { order: dragOrder ?? ids, isDragging: dragOrder !== null, rowRef, handleProps };
}
```

`editor-app/src/hooks/use-telegram-destinations.ts`:
```ts
import { useEffect, useState } from 'react';

export interface TelegramDestination { name: string }

export function useTelegramDestinations(): TelegramDestination[] | null {
  const [list, setList] = useState<TelegramDestination[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram/destinations')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TelegramDestination[]) => { if (!cancelled) setList(data); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, []);
  return list;
}
```

- [ ] **Step 4: Verificare che passino**

Run: `cd editor-app && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, hook di conferma a due click e riordino, campi con commit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Shell dell'app, sincronizzazione socket, header e barra opzioni

**Files:**
- Create: `editor-app/src/App.tsx` (sostituisce), `editor-app/src/toolbar/Header.tsx`, `editor-app/src/toolbar/OptionsBar.tsx`, `editor-app/src/sidebar/Sidebar.tsx`, `editor-app/src/stage/stage-refs.ts`, `editor-app/src/stage/actions.ts`, `editor-app/src/stage/drag-state.ts`
- Modify: —

**Interfaces:**
- Consumes: store (Task 2), `useArmConfirm`, `CommitInput` (Task 4).
- Produces:
  - `stage-refs.ts`: `stageRefs: { canvas: HTMLDivElement | null; wrap: HTMLDivElement | null; recompute: (() => void) | null }`
  - `drag-state.ts`: `dragState: { vertexIndex: number | null; shaderResize: {id; locationId; fixedX; fixedY} | null }`
  - `actions.ts`: `pushGridHistory(label, patch)`, `applyGridAlignment(start, end, nw, nh)`, `applyShaderPlacement(start, end, nw, nh)`, `recordPolygonMove(locationId, polygonId, name, originalPoints, newPoints)`, `removeVertexWithHistory(polygonId, index)`, `deletePolygonWithHistory(polygonId)`, `deleteShaderWithHistory(shaderId)`, `startShaderResize(corner)`
  - `<Header />`, `<OptionsBar />`, `<Sidebar />` (pannelli segnaposto sostituiti nei task 9–15)

- [ ] **Step 1: Singleton di supporto** (stato mutabile condiviso tra componenti React e listener nativi, come le variabili di modulo dell'originale)

`editor-app/src/stage/drag-state.ts`:
```ts
export const dragState = {
  vertexIndex: null as number | null,
  shaderResize: null as null | { id: string; locationId: string; fixedX: number; fixedY: number },
};
```

`editor-app/src/stage/stage-refs.ts`:
```ts
export const stageRefs = {
  canvas: null as HTMLDivElement | null,
  wrap: null as HTMLDivElement | null,
  recompute: null as (() => void) | null,
};
```

- [ ] **Step 2: Azioni che mescolano store + socket** — `editor-app/src/stage/actions.ts`

```ts
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { Grid, Point } from '@/types';
import { gridFromAlignDrag, gridHistoryAfter } from '@/lib/grid-math';
import { OPPOSITE, placementFromDrag, rectCorners, type Corner } from '@/lib/shader-math';
import { removeVertex } from '@/lib/polygon-math';
import { dragState } from './drag-state';

const store = () => useEditorStore.getState();

export function pushGridHistory(label: string, patch: Partial<Grid>) {
  const loc = selectActiveLocation(store());
  if (!loc) return;
  const locationId = loc.id;
  const before = { ...loc.map.grid };
  const after = gridHistoryAfter(before, patch);
  store().recordHistory(
    label,
    () => socket.emit('grid:update', { locationId, ...before }),
    () => socket.emit('grid:update', { locationId, ...after })
  );
}

export function applyGridAlignment(start: Point, end: Point, nw: number, nh: number) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const result = gridFromAlignDrag(start, end, nw, nh, s.gridSquareConstrain, loc.map.grid.divisions || 1);
  if (!result) return;
  pushGridHistory('griglia ritracciata', { enabled: true, ...result });
  socket.emit('grid:update', { locationId: loc.id, enabled: true, ...result });
}

export function applyShaderPlacement(start: Point, end: Point, nw: number, nh: number) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc || !nw || !nh) return;
  const placement = placementFromDrag(start, end, nw, nh, aoePixelsPerMeter(loc.map.grid));
  socket.emit('shader:place', { locationId: loc.id, shaderId: s.selectedShaderType || 'portal', ...placement });
}

function applyPointsLocally(locationId: string, polygonId: string, points: Point[]) {
  store().mutateLocation((loc) => {
    const p = loc.map.polygons.find((x) => x.id === polygonId);
    if (p) p.points = points.map((pt) => [...pt] as Point);
  });
  const p = selectActiveLocation(store())?.map.polygons.find((x) => x.id === polygonId);
  if (p) socket.emit('polygon:update', { locationId, polygonId, points: p.points });
}

export function recordPolygonMove(locationId: string, polygonId: string, name: string, originalPoints: Point[], newPoints: Point[]) {
  store().recordHistory(
    `area "${name}" spostata`,
    () => applyPointsLocally(locationId, polygonId, originalPoints),
    () => applyPointsLocally(locationId, polygonId, newPoints)
  );
}

export function removeVertexWithHistory(polygonId: string, index: number) {
  const loc = selectActiveLocation(store());
  const poly = loc?.map.polygons.find((p) => p.id === polygonId);
  if (!loc || !poly) return;
  const after = removeVertex(poly.points, index);
  if (!after) return;
  const locationId = loc.id;
  const before = poly.points.map((p) => [...p] as Point);
  applyPointsLocally(locationId, polygonId, after);
  store().recordHistory(
    `punto rimosso da "${poly.name}"`,
    () => applyPointsLocally(locationId, polygonId, before),
    () => {
      const current = selectActiveLocation(store())?.map.polygons.find((p) => p.id === polygonId);
      if (!current) return;
      const next = current.points.filter((_, i) => i !== index);
      applyPointsLocally(locationId, polygonId, next);
    }
  );
}

export function deletePolygonWithHistory(polygonId: string) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const locationId = loc.id;
  const index = loc.map.polygons.findIndex((p) => p.id === polygonId);
  const polygon = loc.map.polygons[index];
  socket.emit('polygon:delete', { locationId, polygonId });
  s.select({ polygon: null });
  if (!polygon) return;
  const snapshot = JSON.parse(JSON.stringify(polygon));
  store().recordHistory(
    `poligono "${polygon.name}" eliminato`,
    () => socket.emit('polygon:restore', { locationId, index, polygon: snapshot }),
    () => socket.emit('polygon:delete', { locationId, polygonId: snapshot.id })
  );
}

export function deleteShaderWithHistory(shaderId: string) {
  const s = store();
  const loc = selectActiveLocation(s);
  if (!loc) return;
  const locationId = loc.id;
  const index = loc.map.shaders.findIndex((d) => d.id === shaderId);
  const shader = loc.map.shaders[index];
  socket.emit('shader:remove', { locationId, id: shaderId });
  s.select({ shader: null });
  if (!shader) return;
  const snapshot = JSON.parse(JSON.stringify(shader));
  const label = (typeof SHADER_EFFECTS !== 'undefined' && SHADER_EFFECTS[shader.shaderId]?.label) || shader.shaderId;
  store().recordHistory(
    `decorazione "${label}" eliminata`,
    () => socket.emit('shader:restore', { locationId, index, shader: snapshot }),
    () => socket.emit('shader:remove', { locationId, id: snapshot.id })
  );
}

export function startShaderResize(corner: Corner) {
  const s = store();
  const loc = selectActiveLocation(s);
  const deco = loc && s.selectedShaderId ? loc.map.shaders.find((d) => d.id === s.selectedShaderId) : undefined;
  if (!loc || !deco) return;
  const { naturalW, naturalH } = s.geometry;
  const rect = shaderDecorationRectPercent(deco, loc.map.grid, naturalW, naturalH);
  const [fixedX, fixedY] = rectCorners(rect)[OPPOSITE[corner]];
  dragState.shaderResize = { id: deco.id, locationId: loc.id, fixedX, fixedY };
}
```
Nota per l'esecutore: in `removeVertexWithHistory` l'annullo ripristina l'intero array di punti precedente (equivalente al `splice(index, 0, removedPoint)` dell'originale, ma robusto).

- [ ] **Step 3: Header** — `editor-app/src/toolbar/Header.tsx`

```tsx
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { socket } from '@/lib/socket';
import { stageRefs } from '@/stage/stage-refs';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

export function Header({ menus }: { menus: React.ReactNode }) {
  const server = useEditorStore((s) => s.server);
  const location = useEditorStore(selectActiveLocation);
  const resetForLocationChange = useEditorStore((s) => s.resetForLocationChange);
  const active = server?.locations.filter((l) => !l.archived) ?? [];

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-6 py-3">
      <Select
        value={location?.id ?? ''}
        onValueChange={(id) => {
          resetForLocationChange();
          if (stageRefs.canvas) { stageRefs.canvas.scrollLeft = 0; stageRefs.canvas.scrollTop = 0; }
          socket.emit('location:set', { locationId: id });
        }}
      >
        <SelectTrigger className="h-10 w-60 font-semibold" aria-label="Location attiva">
          <SelectValue placeholder="— nessuna location —" />
        </SelectTrigger>
        <SelectContent>
          {active.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" title="Nuova location" onClick={() => socket.emit('location:create', {})}>
        <Plus />
      </Button>
      {menus}
    </header>
  );
}
```

- [ ] **Step 4: Barra opzioni** — `editor-app/src/toolbar/OptionsBar.tsx`

```tsx
import { Check, MousePointer2, Redo2, Trash2, Undo2, X, Pentagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { socket } from '@/lib/socket';
import { deletePolygonWithHistory } from '@/stage/actions';
import {
  selectActiveLocation, selectCanRedo, selectCanUndo, selectRedoTitle, selectUndoTitle, useEditorStore,
} from '@/store/editor-store';

export function OptionsBar() {
  const location = useEditorStore(selectActiveLocation);
  const mode = useEditorStore((s) => s.mode);
  const drawing = useEditorStore((s) => s.drawing);
  const selectedPolygonId = useEditorStore((s) => s.selectedPolygonId);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undoTitle = useEditorStore(selectUndoTitle);
  const redoTitle = useEditorStore(selectRedoTitle);
  const { chooseSelectTool, chooseDrawTool, resetDrawing, setMode, undoAction, redoAction } = useEditorStore.getState();
  const arm = useArmConfirm();
  const disabled = !location;
  const armed = selectedPolygonId !== null && arm.isArmed(selectedPolygonId);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-card px-6 py-2">
      <Button size="sm" variant={mode === 'select' ? 'secondary' : 'ghost'} disabled={disabled} onClick={chooseSelectTool}>
        <MousePointer2 /> Seleziona
      </Button>
      <Button size="sm" variant={mode === 'draw' ? 'secondary' : 'ghost'} disabled={disabled} onClick={chooseDrawTool}>
        <Pentagon /> Disegna area
      </Button>
      {drawing.points.length >= 3 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!location) return;
            const name = `Area ${(location.map.polygons ?? []).length + 1}`;
            socket.emit('polygon:create', { locationId: location.id, name, points: drawing.points });
            resetDrawing();
            setMode('select');
          }}
        >
          <Check /> Termina
        </Button>
      )}
      {drawing.points.length > 0 && (
        <Button size="sm" variant="ghost" onClick={resetDrawing}>
          <X /> Annulla
        </Button>
      )}
      <Button
        size="sm"
        variant={armed ? 'destructive' : 'ghost'}
        disabled={disabled || !selectedPolygonId}
        title={armed ? 'Click di nuovo per confermare' : 'Elimina selezionato'}
        onClick={() => selectedPolygonId && arm.press(selectedPolygonId, () => deletePolygonWithHistory(selectedPolygonId))}
      >
        <Trash2 /> Elimina area
      </Button>
      <Separator orientation="vertical" className="mx-2 h-6" />
      <Button size="sm" variant="ghost" disabled={!canUndo} title={undoTitle} onClick={undoAction}>
        <Undo2 /> Annulla
      </Button>
      <Button size="sm" variant="ghost" disabled={!canRedo} title={redoTitle} onClick={redoAction}>
        <Redo2 /> Ripeti
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Sidebar con schede (pannelli segnaposto per ora)** — `editor-app/src/sidebar/Sidebar.tsx`

```tsx
import { Grid3x3, Image as ImageIcon, MapPin, Sparkles, Volume2, CloudFog } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore, type SidebarTab } from '@/store/editor-store';

const TABS: { value: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { value: 'location', label: 'Location', icon: <MapPin /> },
  { value: 'immagini', label: 'Immagini', icon: <ImageIcon /> },
  { value: 'fog', label: 'Fog of war', icon: <CloudFog /> },
  { value: 'shader', label: 'Shader', icon: <Sparkles /> },
  { value: 'audio', label: 'Audio', icon: <Volume2 /> },
  { value: 'grid', label: 'Fine tuning griglia', icon: <Grid3x3 /> },
];

export function Sidebar({ panels }: { panels: Partial<Record<SidebarTab, React.ReactNode>> }) {
  const tab = useEditorStore((s) => s.sidebarTab);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
  return (
    <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-l bg-card">
      <Tabs value={tab} onValueChange={(v) => setSidebarTab(v as SidebarTab)} className="min-h-0 flex-1">
        <TabsList className="m-3 grid grid-cols-6">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} title={t.label} aria-label={t.label}>{t.icon}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="min-h-0 overflow-y-auto px-3 pb-3">
            <h2 className="mb-3 text-base font-semibold">{t.label}</h2>
            {panels[t.value] ?? <p className="text-sm text-muted-foreground">In arrivo.</p>}
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
```

- [ ] **Step 6: App** — `editor-app/src/App.tsx` (menù e stage vengono inseriti nei task 6–11)

```tsx
import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import { Header } from '@/toolbar/Header';
import { OptionsBar } from '@/toolbar/OptionsBar';
import { Sidebar } from '@/sidebar/Sidebar';
import type { VttState } from '@/types';

export default function App() {
  useEffect(() => {
    const onConnect = () => socket.emit('hello', { role: 'editor' });
    const onState = (s: VttState) => useEditorStore.getState().receiveState(s);
    socket.on('connect', onConnect);
    socket.on('state:update', onState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('state:update', onState);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (e.target instanceof Element && e.target.matches('input, textarea')) return;
      e.preventDefault();
      if (key === 'z') useEditorStore.getState().undoAction();
      else useEditorStore.getState().redoAction();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <Header menus={null} />
      <OptionsBar />
      <main className="flex min-h-0 flex-1">
        <section className="relative min-h-0 flex-1" id="stage-slot" />
        <Sidebar panels={{}} />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Verifica in browser**

```bash
cd editor-app && npm run typecheck && npm run build
```
Poi con il server di prova (porta 3100) aperto su `http://localhost:3100/editor-next/`: il selettore mostra le location della copia dei dati, cambiarla non genera errori in console, la barra opzioni è visibile con i pulsanti, la sidebar ha 6 icone e cambia scheda. Ctrl+Z su pagina vuota non genera errori.
Expected: nessun errore console.

- [ ] **Step 8: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, shell con header, barra opzioni, sidebar a schede e sync socket

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Area mappa (media, zoom, griglia SVG) e menù Mappa/Vista

**Files:**
- Create: `editor-app/src/stage.css`, `editor-app/src/stage/MapStage.tsx`, `editor-app/src/menus/MenuField.tsx`, `editor-app/src/menus/MenuBar.tsx`, `editor-app/src/lib/video-check.ts`
- Modify: `editor-app/src/App.tsx`, `editor-app/src/main.tsx` (import `stage.css`)

**Interfaces:**
- Consumes: `stageRefs`, store, `NumberField`, `useArmConfirm`.
- Produces: `<MapStage />` (imposta `stageRefs.canvas/wrap/recompute`, aggiorna `geometry` nello store, espone `activeMapEl` via `mediaRef`); `<MenuBar />` con i menù Mappa e Vista (gli altri menù si aggiungono nei task successivi nello stesso file); `checkVideoSafe(file): Promise<{ok: true} | {ok: false; reason: string}>`

- [ ] **Step 1: CSS dell'area mappa**

Crea `editor-app/src/stage.css` copiando **verbatim** da `public/editor/editor.css` questi blocchi, nell'ordine:
- righe 463 → fine della regola `.grid-align-box` (≈ riga 620): da `.map-canvas-wrap` fino a `.grid-align-box`
- righe 1045 → 1094: regole `.compass-drag*`
- righe 1095 → fine file: `#map-shader-canvas`, `.shader-box`, `.shader-handle*`

Poi:
```bash
cd editor-app/src
sed -i 's/var(--accent)/var(--vtt-accent)/g' stage.css
grep -n "var(--" stage.css | grep -v "vtt-accent" | sed 's/.*var(\(--[a-z-]*\)).*/\1/' | sort -u
```
Ogni variabile elencata deve esistere in `index.css` (`--bg-canvas`, `--text-primary`, `--border`, `--accent-text`, `--accent-bg-subtle`, `--danger*`, ...). Aggiungi in `:root` di `index.css` quelle mancanti copiando i valori da `public/shared/theme.css`. In `main.tsx` aggiungi `import './stage.css';` dopo `import './index.css';`.

- [ ] **Step 2: Controllo video** — `editor-app/src/lib/video-check.ts` (portato da `editor.js:1532-1566`)

```ts
const MAX_VIDEO_PIXELS = 1920 * 1080;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export type VideoCheck = { ok: true } | { ok: false; reason: string };

export function checkVideoSafe(file: File): Promise<VideoCheck> {
  return new Promise((resolve) => {
    if (file.size > MAX_VIDEO_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      resolve({ ok: false, reason: `video troppo pesante (${mb}MB, limite ${MAX_VIDEO_BYTES / 1024 / 1024}MB) — rischia di bloccare il Raspberry Pi.` });
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const pixels = probe.videoWidth * probe.videoHeight;
      URL.revokeObjectURL(url);
      if (pixels > MAX_VIDEO_PIXELS) {
        resolve({ ok: false, reason: `risoluzione troppo alta (${probe.videoWidth}×${probe.videoHeight}) — massimo consigliato 1920×1080 per il Raspberry Pi.` });
      } else {
        resolve({ ok: true });
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, reason: 'video non leggibile: file non valido o formato non supportato dal browser.' });
    };
    probe.src = url;
  });
}
```

- [ ] **Step 3: MapStage (struttura, media, geometria, zoom con rotella)** — `editor-app/src/stage/MapStage.tsx`

```tsx
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { clamp } from '@/lib/numbers';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { stageRefs } from './stage-refs';

export type MapMedia = HTMLImageElement | HTMLVideoElement;

export function MapStage({
  children,
  wrapChildren,
  mediaRef,
}: {
  children?: React.ReactNode;
  wrapChildren?: React.ReactNode;
  mediaRef: React.MutableRefObject<MapMedia | null>;
}) {
  const location = useEditorStore(selectActiveLocation);
  const editorZoom = useEditorStore((s) => s.editorZoom);
  const uploadWarning = useEditorStore((s) => s.uploadWarning);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const gridSvgRef = useRef<SVGSVGElement>(null);

  const recompute = useCallback(() => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    const wrap = mediaWrapRef.current;
    const overlay = overlayRef.current;
    const media = mediaRef.current;
    if (!canvas || !zoom || !wrap || !overlay) return;
    const s = useEditorStore.getState();
    const loc = selectActiveLocation(s);
    const scale = loc?.map.scale || 1;
    zoom.style.width = `${canvas.clientWidth * s.editorZoom * scale}px`;
    zoom.style.height = `${canvas.clientHeight * s.editorZoom * scale}px`;
    if (!loc) {
      if (gridSvgRef.current) gridSvgRef.current.innerHTML = '';
      s.setGeometry({ imageRect: null, rotation: 0, naturalW: 0, naturalH: 0 });
      return;
    }
    const nw = media ? mediaW(media) : 0;
    const nh = media ? mediaH(media) : 0;
    const rotation = loc.map.file && nw ? computeTotalRotation(nw, nh, loc.map.flip180, loc.map.rotate90) : 0;
    const effective = layoutMapWrap(zoom, wrap, rotation);
    const imageRect = loc.map.file && nw
      ? fitRect(effective.width, effective.height, nw, nh)
      : { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(overlay, imageRect);
    if (gridSvgRef.current) renderGridSvg(gridSvgRef.current, loc.map.grid, nw, nh);
    s.setGeometry({ imageRect, rotation, naturalW: nw, naturalH: nh });
  }, [mediaRef]);

  useLayoutEffect(() => {
    stageRefs.canvas = canvasRef.current;
    stageRefs.wrap = wrapRef.current;
    stageRefs.recompute = recompute;
    return () => { stageRefs.canvas = null; stageRefs.wrap = null; stageRefs.recompute = null; };
  }, [recompute]);

  // Caricamento del media attivo (immagine o video).
  useLayoutEffect(() => {
    const img = imgRef.current;
    const video = videoRef.current;
    const placeholder = placeholderRef.current;
    if (!img || !video || !placeholder) return;
    if (location?.map.file) {
      mediaRef.current = loadMapMedia(img, video, location.map.file, `/storage/maps/${location.map.file}`, recompute);
      placeholder.hidden = true;
    } else {
      img.hidden = true;
      video.hidden = true;
      placeholder.hidden = false;
      mediaRef.current = img;
    }
    recompute();
  }, [location?.id, location?.map.file, mediaRef, recompute]);

  // Ricalcolo quando cambia ciò che influenza la geometria.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, editorZoom, location?.map.scale, location?.map.flip180, location?.map.rotate90, location?.map.grid]);

  useEffect(() => {
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute]);

  // Zoom con la rotella: listener nativo non passivo (React registrerebbe uno passivo).
  useEffect(() => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + canvas.scrollLeft;
      const cursorY = e.clientY - rect.top + canvas.scrollTop;
      const ratioX = cursorX / zoom.offsetWidth;
      const ratioY = cursorY / zoom.offsetHeight;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const s = useEditorStore.getState();
      s.setEditorZoom(clamp(s.editorZoom * factor, 0.5, 4));
      recompute();
      canvas.scrollLeft = ratioX * zoom.offsetWidth - (e.clientX - rect.left);
      canvas.scrollTop = ratioY * zoom.offsetHeight - (e.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [recompute]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {uploadWarning && <p className="px-4 py-2 text-sm text-amber-400">{uploadWarning}</p>}
      <div ref={wrapRef} id="map-canvas-wrap" className="map-canvas-wrap">
        <div ref={canvasRef} id="map-canvas" className="map-canvas">
          <div ref={zoomRef} className="map-canvas-zoom">
            <div ref={mediaWrapRef} className="media-wrap">
              <div ref={overlayRef} id="overlay-box" className="overlay-box fit-box" onDragStart={(e) => e.preventDefault()}>
                <img ref={imgRef} className="map-canvas-img" draggable={false} alt="" />
                <video ref={videoRef} className="map-canvas-img" draggable={false} muted loop playsInline disablePictureInPicture />
                <div ref={placeholderRef} className="map-canvas-placeholder" />
                <canvas id="map-shader-canvas" />
                <svg ref={gridSvgRef} id="grid-svg" viewBox="0 0 100 100" preserveAspectRatio="none" />
                {children}
              </div>
            </div>
          </div>
        </div>
        {wrapChildren}
      </div>
    </section>
  );
}
```
Nota: `children` ospita `PolygonLayer` e `ShaderSelection` (task 8/11) dentro l'overlay che ruota con la mappa; `wrapChildren` ospita `CompassHandle` (task 7) dentro `#map-canvas-wrap` ma fuori da `#map-canvas`, quindi non ruota né scorre con la mappa.

- [ ] **Step 4: Campo per i menù** — `editor-app/src/menus/MenuField.tsx`

```tsx
import { Label } from '@/components/ui/label';

export function MenuField({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-2 py-1.5 text-sm"
      title={title}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Label className="font-normal text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: MenuBar con menù Mappa e Vista** — `editor-app/src/menus/MenuBar.tsx`

```tsx
import { useRef } from 'react';
import { Maximize, RotateCcw, RotateCw, Trash2, Upload, ZoomIn } from 'lucide-react';
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger,
} from '@/components/ui/menubar';
import { NumberField } from '@/components/NumberField';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { checkVideoSafe } from '@/lib/video-check';
import { socket } from '@/lib/socket';
import { stageRefs } from '@/stage/stage-refs';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { MenuField } from './MenuField';

const triggerClass = 'gap-1.5 data-[active=true]:text-primary';

export function MenuBar() {
  const location = useEditorStore(selectActiveLocation);
  const editorZoom = useEditorStore((s) => s.editorZoom);
  const fogOpacity = useEditorStore((s) => s.fogOpacity);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
  const fileInput = useRef<HTMLInputElement>(null);
  const arm = useArmConfirm();
  const disabled = !location;

  const onUpload = async (file: File | undefined) => {
    if (!file || !location) return;
    const { setUploadWarning } = useEditorStore.getState();
    setUploadWarning(null);
    if (isVideoFile(file.name)) {
      const check = await checkVideoSafe(file);
      if (!check.ok) {
        setUploadWarning(`Upload bloccato: ${check.reason}`);
        return;
      }
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    await fetch('/api/upload/map', { method: 'POST', body: formData });
  };

  return (
    <>
      <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ''; }} />
      <Menubar
        className="h-10 border-0 bg-transparent p-0 shadow-none"
        onValueChange={(v) => { if (v === 'shaders') setSidebarTab('shader'); }}
      >
        <MenubarMenu value="mappa">
          <MenubarTrigger className={triggerClass} data-active={Boolean(location?.map.flip180 || location?.map.rotate90)}>
            <Upload className="size-4" /> Mappa
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={disabled} onSelect={() => fileInput.current?.click()}>
              <Upload /> Carica mappa
            </MenubarItem>
            <MenubarItem
              disabled={disabled}
              className={arm.isArmed('remove-map') ? 'text-destructive' : ''}
              onSelect={(e) => {
                if (!arm.isArmed('remove-map')) e.preventDefault();
                arm.press('remove-map', async () => {
                  useEditorStore.getState().setUploadWarning(null);
                  await fetch('/api/map/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId: location!.id }),
                  });
                });
              }}
            >
              <Trash2 /> {arm.isArmed('remove-map') ? 'Click di nuovo per confermare' : 'Rimuovi mappa'}
            </MenubarItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={Boolean(location?.map.flip180)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('mapFlip:toggle', { locationId: location!.id })}
            >
              <RotateCcw /> Ruota 180°
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              disabled={disabled}
              checked={Boolean(location?.map.rotate90)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => socket.emit('mapRotate90:toggle', { locationId: location!.id })}
            >
              <RotateCw /> Ruota 90°
            </MenubarCheckboxItem>
            <MenuField label="Scala" title="Scala mappa">
              <NumberField
                aria-label="Scala mappa"
                className="h-8 w-20"
                live
                min={25}
                max={1000}
                disabled={disabled}
                value={Math.round((location?.map.scale ?? 1) * 100)}
                onCommit={(v) => {
                  useEditorStore.getState().mutateLocation((loc) => { loc.map.scale = v / 100; });
                  socket.emit('mapScale:set', { locationId: location!.id, scale: v / 100 });
                }}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>

        {/* Griglia, Shaders, Bussola: task 7, 10, 11 */}

        <MenubarMenu value="vista">
          <MenubarTrigger className={triggerClass}>
            <ZoomIn className="size-4" /> Vista
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              onSelect={(e) => {
                e.preventDefault();
                useEditorStore.getState().setEditorZoom(1);
                if (stageRefs.canvas) { stageRefs.canvas.scrollLeft = 0; stageRefs.canvas.scrollTop = 0; }
              }}
            >
              <Maximize /> Reset zoom ({Math.round(editorZoom * 100)}%)
            </MenubarItem>
            <MenuField label="Opacità fog" title="Opacità fog (solo anteprima editor)">
              <NumberField
                aria-label="Opacità fog"
                className="h-8 w-20"
                min={0}
                max={100}
                value={Math.round(fogOpacity * 100)}
                onCommit={(v) => useEditorStore.getState().setFogOpacity(v / 100)}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </MenuField>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </>
  );
}
```
La nota sul tasto "Rimuovi mappa": al primo click `preventDefault` tiene aperto il menù (arma), al secondo il menù si chiude ed esegue.

- [ ] **Step 6: Collegare in App** — in `App.tsx` sostituisci `<Header menus={null} />` con `<Header menus={<MenuBar />} />`, sostituisci `<section ... id="stage-slot" />` con `<MapStage mediaRef={mediaRef} />` dove `const mediaRef = useRef<MapMedia | null>(null);` (importa `useRef`, `MapStage`, `MapMedia`, `MenuBar`).

- [ ] **Step 7: Verifica in browser** (build + `http://localhost:3100/editor-next/`, location con mappa nella copia dei dati)

Controlla: mappa visibile e centrata; rotella zoom 50%–400% centrata sul cursore; "Vista → Reset zoom" torna a 100% e azzera lo scroll; "Mappa → Scala" cambia la dimensione in tempo reale mentre si digita (**digitare cifre nel campo non deve chiudere il menù né far saltare il focus**: se Radix ruba i tasti, vedi piano B sotto); "Ruota 180°/90°" ruotano la mappa e mostrano il segno di spunta, il trigger "Mappa" si colora quando uno è attivo; "Rimuovi mappa" richiede due click (provare **solo su una location di prova della copia dati**); caricamento di un'immagine di prova funziona; caricamento di un video > 150MB mostra l'avviso. Confronta a occhio con `/editor` (vecchio) sulla stessa location: stesso centraggio e stessa rotazione. Nessun errore console.

**Piano B se i campi dentro i menù non funzionano** (digitazione intercettata o menù che si chiude): sostituire `MenubarContent` dei menù con campi con un `Popover` per ciascun menù, mantenendo il `MenubarTrigger` stile. Non proseguire ai task successivi finché la digitazione nei campi non è affidabile.

- [ ] **Step 8: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, area mappa con zoom, menù Mappa e Vista

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Bussola — maniglia trascinabile e menù

**Files:**
- Create: `editor-app/src/stage/CompassHandle.tsx`
- Modify: `editor-app/src/menus/MenuBar.tsx` (menù Bussola), `editor-app/src/App.tsx` (passare `wrapChildren`)

**Interfaces:**
- Consumes: `stageRefs.wrap`, store, `NumberField`.
- Produces: `<CompassHandle />` (posizionata nel riquadro `#map-canvas-wrap`, non ruota con la mappa).

- [ ] **Step 1: `editor-app/src/stage/CompassHandle.tsx`**

```tsx
import { useRef, useState } from 'react';
import { clamp } from '@/lib/numbers';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { stageRefs } from './stage-refs';
import type { Point } from '@/types';

export function CompassHandle() {
  const location = useEditorStore(selectActiveLocation);
  const compass = location?.map.compass;
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const latest = useRef<Point | null>(null);
  if (!location || !compass) return null;

  const x = dragPos?.[0] ?? compass.x;
  const y = dragPos?.[1] ?? compass.y;

  const toPercent = (clientX: number, clientY: number): Point => {
    const rect = stageRefs.wrap!.getBoundingClientRect();
    return [
      clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    ];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const locationId = location.id;
    const move = (ev: PointerEvent) => {
      const p = toPercent(ev.clientX, ev.clientY);
      latest.current = p;
      setDragPos(p);
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
    const up = () => {
      cleanup();
      if (latest.current) socket.emit('compass:update', { locationId, x: latest.current[0], y: latest.current[1] });
      latest.current = null;
      setDragPos(null);
    };
    const cancel = () => { cleanup(); latest.current = null; setDragPos(null); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  };

  return (
    <button
      type="button"
      className={cn('compass-drag', !compass.visible && 'off')}
      title="Trascina per posizionare la rosa dei venti"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${compass.rotation}deg)` }}
      onPointerDown={onPointerDown}
    >
      <svg viewBox="0 0 120 120">
        <path className="compass-drag-star" d="M60,12 L74,46 L108,60 L74,74 L60,108 L46,74 L12,60 L46,46 Z" />
        <circle className="compass-drag-hub" cx="60" cy="60" r="7" />
        <text x="60" y="10" textAnchor="middle">N</text>
        <text x="60" y="118" textAnchor="middle">S</text>
        <text x="114" y="64" textAnchor="middle">E</text>
        <text x="6" y="64" textAnchor="middle">O</text>
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Menù Bussola** — in `MenuBar.tsx`, al posto del commento `{/* Griglia, Shaders, Bussola ... */}` aggiungi (importa `Compass` da lucide con alias `CompassIcon`):

```tsx
<MenubarMenu value="bussola">
  <MenubarTrigger className={triggerClass} data-active={Boolean(location?.map.compass?.visible)}>
    <CompassIcon className="size-4" /> Bussola
  </MenubarTrigger>
  <MenubarContent>
    <MenubarCheckboxItem
      disabled={!location?.map.compass}
      checked={Boolean(location?.map.compass?.visible)}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={() => socket.emit('compass:update', { locationId: location!.id, visible: !location!.map.compass!.visible })}
    >
      Mostra rosa dei venti
    </MenubarCheckboxItem>
    <MenuField label="Rotazione" title="Rotazione rosa dei venti">
      <NumberField
        aria-label="Rotazione rosa dei venti"
        className="h-8 w-20"
        min={0}
        max={359}
        step={1}
        disabled={!location?.map.compass}
        value={location?.map.compass?.rotation ?? 0}
        onCommit={(v) => socket.emit('compass:update', { locationId: location!.id, rotation: Math.round(v) })}
      />
      <span className="text-xs text-muted-foreground">°</span>
    </MenuField>
  </MenubarContent>
</MenubarMenu>
```
(Il menù Bussola va **prima** di Vista, come nell'originale: Mappa, Griglia, Shaders, Bussola, Vista.)

- [ ] **Step 3: Collegare** — `MapStage` ha già la prop `wrapChildren`; in `App.tsx` passa `wrapChildren={<CompassHandle />}`.

- [ ] **Step 4: Verifica in browser** su una location di prova: attivare "Mostra rosa dei venti" fa apparire la maniglia (ruotata come da rotazione, semitrasparente quando spenta); trascinarla la sposta e al rilascio la posizione persiste dopo il reload; il campo rotazione ruota la rosa; la rosa **non** ruota con la mappa se si usa "Ruota 90°". Confronta con `/editor`. Nessun errore console.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, rosa dei venti trascinabile e menù Bussola

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Poligoni — disegno, selezione, trascinamento, vertici e interazioni sulla mappa

**Files:**
- Create: `editor-app/src/stage/PolygonLayer.tsx`, `editor-app/src/stage/use-stage-interactions.ts`
- Modify: `editor-app/src/App.tsx` (montare `PolygonLayer` come figlio di `MapStage` e chiamare `useStageInteractions`)

**Interfaces:**
- Consumes: store, `dragState`, `actions.ts` (Task 5), `lib/polygon-math`, `lib/grid-math.constrainSquare`, `lib/shader-math`.
- Produces: `<PolygonLayer />`; `useStageInteractions(overlayId: string, mediaRef)` che gestisce **tutte** le modalità (`select`, `draw`, `grid-align`, `shader-place`) e il trascinamento di poligoni/vertici/shader/maniglie di ridimensionamento. I task 10 e 11 aggiungono solo i menù/pannelli che attivano le modalità `grid-align` e `shader-place`.

- [ ] **Step 1: `editor-app/src/stage/PolygonLayer.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { dragState } from './drag-state';
import { removeVertexWithHistory } from './actions';

export function PolygonLayer() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedPolygonId);
  const fogOpacity = useEditorStore((s) => s.fogOpacity);
  const drawing = useEditorStore((s) => s.drawing);
  const rect = useEditorStore((s) => s.geometry.imageRect);
  const polygons = location?.map.polygons ?? [];
  const px = (pct: number, size: number) => `${(pct / 100) * size}px`;

  return (
    <>
      <svg id="polygon-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {polygons.map((poly) => {
          const isSelected = poly.id === selectedId;
          return (
            <polygon
              key={poly.id}
              points={poly.points.map(([x, y]) => `${x},${y}`).join(' ')}
              className={cn('fog-poly', poly.revealed && 'revealed', isSelected && 'selected')}
              style={!poly.revealed && !isSelected ? { fillOpacity: fogOpacity } : undefined}
            />
          );
        })}
        {drawing.points.length > 0 && (
          <polyline className="draw-line" points={drawing.points.map(([x, y]) => `${x},${y}`).join(' ')} />
        )}
      </svg>
      {rect &&
        polygons
          .filter((p) => p.id === selectedId)
          .flatMap((poly) =>
            poly.points.map(([x, y], index) => (
              <div
                key={`${poly.id}-${index}`}
                className="vertex-handle"
                style={{ left: px(x, rect.width), top: px(y, rect.height) }}
                onPointerDown={(e) => { e.stopPropagation(); dragState.vertexIndex = index; }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeVertexWithHistory(poly.id, index); }}
              />
            ))
          )}
      {rect &&
        drawing.points.map(([x, y], i) => (
          <div key={`d${i}`} className="draw-point" style={{ left: px(x, rect.width), top: px(y, rect.height) }} />
        ))}
    </>
  );
}
```

- [ ] **Step 2: `editor-app/src/stage/use-stage-interactions.ts`** (porting di `editor.js:597-932`; i listener nativi leggono sempre lo store con `getState()` per evitare closure obsolete)

```ts
import { useEffect } from 'react';
import { constrainSquare } from '@/lib/grid-math';
import { clamp } from '@/lib/numbers';
import { polygonMoved, translatePolygon } from '@/lib/polygon-math';
import { resizeFromFixedCorner, rectCorners } from '@/lib/shader-math';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { Point } from '@/types';
import { applyGridAlignment, applyShaderPlacement, recordPolygonMove } from './actions';
import { dragState } from './drag-state';
import type { MapMedia } from './MapStage';

type BoxDrag = { start: Point; end?: Point; box: HTMLDivElement };

export function useStageInteractions(mediaRef: React.MutableRefObject<MapMedia | null>) {
  useEffect(() => {
    const overlay = document.getElementById('overlay-box') as HTMLDivElement | null;
    if (!overlay) return;
    const store = () => useEditorStore.getState();

    let gridAlignDrag: BoxDrag | null = null;
    let shaderPlaceDrag: BoxDrag | null = null;
    let draggingPolygon: { locationId: string; polygonId: string; startBase: Point; originalPoints: Point[] } | null = null;
    let draggingShader: { locationId: string; id: string; startBase: Point; originalX: number; originalY: number } | null = null;

    const natural = () => {
      const m = mediaRef.current;
      return { w: m ? mediaW(m) : 0, h: m ? mediaH(m) : 0 };
    };

    // Punto in percentuale nello spazio "base" (non ruotato) della mappa.
    const basePoint = (clientX: number, clientY: number): Point => {
      const r = overlay.getBoundingClientRect();
      const p: Point = [clamp(((clientX - r.left) / r.width) * 100, 0, 100), clamp(((clientY - r.top) / r.height) * 100, 0, 100)];
      return rotatePointToBase(p, store().geometry.rotation) as Point;
    };

    const placeBox = (box: HTMLDivElement, start: Point, end: Point, square: boolean) => {
      const rect = store().geometry.imageRect;
      if (!rect) return;
      const left = Math.min(start[0], end[0]);
      const top = Math.min(start[1], end[1]);
      let width = Math.abs(end[0] - start[0]);
      let height = Math.abs(end[1] - start[1]);
      if (square) {
        const { w, h } = natural();
        if (w && h) ({ width, height } = constrainSquare(width, height, w, h));
      }
      box.style.left = `${(left / 100) * rect.width}px`;
      box.style.top = `${(top / 100) * rect.height}px`;
      box.style.width = `${(width / 100) * rect.width}px`;
      box.style.height = `${(height / 100) * rect.height}px`;
    };

    const onClick = (e: MouseEvent) => {
      if (store().mode !== 'draw') return;
      store().addDrawPoint(basePoint(e.clientX, e.clientY));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) return;
      const s = store();

      if (s.mode === 'shader-place' || s.mode === 'grid-align') {
        const start = basePoint(e.clientX, e.clientY);
        const box = document.createElement('div');
        box.className = s.mode === 'shader-place' ? 'shader-box' : 'grid-align-box';
        overlay.appendChild(box);
        const drag: BoxDrag = { start, box };
        if (s.mode === 'shader-place') shaderPlaceDrag = drag;
        else gridAlignDrag = drag;
        placeBox(box, start, start, s.mode === 'grid-align' && s.gridSquareConstrain);
        return;
      }

      if (s.mode !== 'select') return;
      const loc = selectActiveLocation(s);
      if (!loc) return;
      const point = basePoint(e.clientX, e.clientY);
      const { w: nw, h: nh } = natural();

      // Le decorazioni si testano PRIMA dei poligoni: sono più piccole e "sopra" ai fini dell'editor.
      const shaderHit = (loc.map.shaders ?? []).find((deco) => {
        const r = shaderDecorationRectPercent(deco, loc.map.grid, nw, nh);
        const c = rectCorners(r);
        return pointInPolygon(point, [c.nw, c.ne, c.se, c.sw]);
      });
      if (shaderHit) {
        draggingPolygon = null;
        s.select({ polygon: null, shader: shaderHit.id });
        draggingShader = { locationId: loc.id, id: shaderHit.id, startBase: point, originalX: shaderHit.x, originalY: shaderHit.y };
        return;
      }

      const hit = (loc.map.polygons ?? []).find((poly) => pointInPolygon(point, poly.points));
      draggingShader = null;
      s.select({ polygon: hit ? hit.id : null, shader: null });
      draggingPolygon = hit
        ? { locationId: loc.id, polygonId: hit.id, startBase: point, originalPoints: hit.points.map((p) => [...p] as Point) }
        : null;
    };

    const onMove = (e: PointerEvent) => {
      if (gridAlignDrag) {
        const cur = basePoint(e.clientX, e.clientY);
        placeBox(gridAlignDrag.box, gridAlignDrag.start, cur, store().gridSquareConstrain);
        gridAlignDrag.end = cur;
        return;
      }
      if (shaderPlaceDrag) {
        const cur = basePoint(e.clientX, e.clientY);
        placeBox(shaderPlaceDrag.box, shaderPlaceDrag.start, cur, false);
        shaderPlaceDrag.end = cur;
        return;
      }
      const s = store();
      if (dragState.vertexIndex !== null && s.selectedPolygonId) {
        const index = dragState.vertexIndex;
        const id = s.selectedPolygonId;
        const p = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const poly = loc.map.polygons.find((x) => x.id === id);
          if (poly) poly.points[index] = p;
        });
        return;
      }
      if (draggingPolygon) {
        const d = draggingPolygon;
        const cur = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const poly = loc.map.polygons.find((x) => x.id === d.polygonId);
          if (poly) poly.points = translatePolygon(d.originalPoints, cur[0] - d.startBase[0], cur[1] - d.startBase[1]);
        });
      }
      if (draggingShader) {
        const d = draggingShader;
        const cur = basePoint(e.clientX, e.clientY);
        s.mutateLocation((loc) => {
          const deco = loc.map.shaders.find((x) => x.id === d.id);
          if (!deco) return;
          deco.x = clamp(d.originalX + (cur[0] - d.startBase[0]), 0, 100);
          deco.y = clamp(d.originalY + (cur[1] - d.startBase[1]), 0, 100);
        });
      }
      if (dragState.shaderResize) {
        const r = dragState.shaderResize;
        const cur = basePoint(e.clientX, e.clientY);
        const { w: nw, h: nh } = natural();
        s.mutateLocation((loc) => {
          const deco = loc.map.shaders.find((x) => x.id === r.id);
          if (!deco) return;
          const p = resizeFromFixedCorner([r.fixedX, r.fixedY], cur, nw, nh, aoePixelsPerMeter(loc.map.grid));
          deco.x = p.x;
          deco.y = p.y;
          deco.widthM = p.widthM;
          deco.heightM = p.heightM;
        });
      }
    };

    const onUp = () => {
      const s = store();
      if (gridAlignDrag) {
        const { start, end, box } = gridAlignDrag;
        box.remove();
        gridAlignDrag = null;
        const { w, h } = natural();
        if (end && w) applyGridAlignment(start, end, w, h);
        s.finishTool();
        return;
      }
      if (shaderPlaceDrag) {
        const { start, end, box } = shaderPlaceDrag;
        box.remove();
        shaderPlaceDrag = null;
        const { w, h } = natural();
        if (end) applyShaderPlacement(start, end, w, h);
        s.finishTool();
        return;
      }

      const loc = selectActiveLocation(s);

      if (dragState.vertexIndex !== null && s.selectedPolygonId) {
        dragState.vertexIndex = null;
        const poly = loc?.map.polygons.find((p) => p.id === s.selectedPolygonId);
        if (loc && poly) socket.emit('polygon:update', { locationId: loc.id, polygonId: poly.id, points: poly.points });
      }

      if (draggingPolygon) {
        const d = draggingPolygon;
        draggingPolygon = null;
        const poly = loc?.map.polygons.find((p) => p.id === d.polygonId);
        if (loc && poly) {
          const newPoints = poly.points.map((p) => [...p] as Point);
          socket.emit('polygon:update', { locationId: loc.id, polygonId: d.polygonId, points: newPoints });
          if (polygonMoved(d.originalPoints, newPoints)) recordPolygonMove(loc.id, d.polygonId, poly.name, d.originalPoints, newPoints);
        }
      }

      if (draggingShader) {
        const d = draggingShader;
        draggingShader = null;
        const deco = loc?.map.shaders.find((x) => x.id === d.id);
        if (loc && deco) socket.emit('shader:move', { locationId: loc.id, id: deco.id, x: deco.x, y: deco.y });
      }

      if (dragState.shaderResize) {
        const r = dragState.shaderResize;
        dragState.shaderResize = null;
        const deco = loc?.map.shaders.find((x) => x.id === r.id);
        if (loc && deco) {
          socket.emit('shader:move', { locationId: loc.id, id: deco.id, x: deco.x, y: deco.y });
          socket.emit('shader:resize', { locationId: loc.id, id: deco.id, widthM: deco.widthM, heightM: deco.heightM });
        }
      }
    };

    const onCancel = () => {
      const s = store();
      if (gridAlignDrag) { gridAlignDrag.box.remove(); gridAlignDrag = null; s.finishTool(); }
      if (shaderPlaceDrag) { shaderPlaceDrag.box.remove(); shaderPlaceDrag = null; s.finishTool(); }
      dragState.shaderResize = null;
      dragState.vertexIndex = null;
      draggingPolygon = null;
      draggingShader = null;
    };

    overlay.addEventListener('click', onClick);
    overlay.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      overlay.removeEventListener('click', onClick);
      overlay.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, [mediaRef]);
}
```
Il hook usa `document.getElementById('overlay-box')` perché l'overlay è renderizzato da `MapStage` (stesso `id`); chiamalo in `App` **dopo** il primo render (l'`useEffect` di `App` gira dopo il commit dei figli, quindi l'elemento esiste).

- [ ] **Step 3: Collegare in App** — dentro `App`: `useStageInteractions(mediaRef);` e `<MapStage mediaRef={mediaRef} wrapChildren={<CompassHandle />}><PolygonLayer /></MapStage>`.

- [ ] **Step 4: Verifica in browser** su una copia dei dati con poligoni (la location "Taverna" ne ha due). Controlla in ordine:
  1. Click su un poligono lo seleziona (bordo evidenziato, 4 maniglie vertice tonde); click fuori deseleziona.
  2. Trascinare il poligono lo sposta; al rilascio persiste dopo reload; "Annulla" (barra opzioni e Ctrl+Z) lo riporta indietro, "Ripeti" lo risposta.
  3. Trascinare una maniglia vertice cambia la forma; **tasto destro** su un vertice lo elimina (non sotto 3 punti), annullabile.
  4. "Disegna area": ogni click aggiunge un punto (punto + linea); "Termina" appare da 3 punti e crea "Area N"; "Annulla" azzera la bozza; Ctrl+Z in disegno toglie l'ultimo punto, Ctrl+Y lo rimette.
  5. "Elimina area": primo click arma (rosso, "Click di nuovo per confermare", si disarma dopo 2.5 s), secondo elimina; annullabile con ripristino alla stessa posizione.
  6. **Mappa ruotata** (attiva "Ruota 90°" sulla copia): ripeti 1–4, i punti devono cadere sotto il cursore.
  7. **Aggiornamento remoto durante un drag**: apri `/editor-next/` in due tab e sposta un poligono in una mentre cambi il nome nell'altra: la posizione in drag non deve scattare.
  Nessun errore console.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, poligoni (disegno, selezione, trascinamento, vertici) e interazioni mappa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Scheda Fog of war

**Files:**
- Create: `editor-app/src/sidebar/FogPanel.tsx`
- Modify: `editor-app/src/App.tsx` (passare il pannello alla sidebar)

**Interfaces:**
- Consumes: `useSortableList`, `CommitInput`, `sortPolygonIdsByName`, store, socket.
- Produces: `<FogPanel />`.

- [ ] **Step 1: `editor-app/src/sidebar/FogPanel.tsx`**

```tsx
import { ArrowDownAZ, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useSortableList } from '@/hooks/use-sortable-list';
import { sortPolygonIdsByName } from '@/lib/polygon-math';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

export function FogPanel() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedPolygonId);
  const polygons = location?.map.polygons ?? [];
  const byId = new Map(polygons.map((p) => [p.id, p]));
  const sortable = useSortableList(
    polygons.map((p) => p.id),
    (orderedIds) => location && socket.emit('polygon:reorder', { locationId: location.id, orderedIds })
  );

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          title="Ordina alfabeticamente"
          disabled={!location}
          onClick={() => location && socket.emit('polygon:reorder', { locationId: location.id, orderedIds: sortPolygonIdsByName(polygons) })}
        >
          <ArrowDownAZ />
        </Button>
      </div>
      {polygons.length === 0 && <p className="text-sm text-muted-foreground">Nessuna area di fog su questa location.</p>}
      <div className="flex flex-col gap-1">
        {sortable.order.map((id) => {
          const poly = byId.get(id);
          if (!poly || !location) return null;
          return (
            <div
              key={id}
              ref={sortable.rowRef(id)}
              className={cn(
                'flex items-center gap-1 rounded-md border p-1',
                id === selectedId && 'border-primary bg-primary/10',
                sortable.isDragging && 'select-none'
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('input, button, [data-drag]')) return;
                useEditorStore.getState().setMode('select');
                useEditorStore.getState().select({ polygon: id });
              }}
            >
              <span data-drag className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                <GripVertical className="size-4" />
              </span>
              <CommitInput
                className="h-8"
                value={poly.name}
                onCommit={(name) => socket.emit('polygon:update', { locationId: location.id, polygonId: id, name })}
              />
              <Button
                variant="ghost"
                size="icon"
                title={poly.revealed ? 'Rivelata — clic per nascondere' : 'Nascosta — clic per rivelare'}
                onClick={() => socket.emit('fow:toggle', { locationId: location.id, polygonId: id })}
              >
                {poly.revealed ? <Eye /> : <EyeOff />}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Collegare** — in `App.tsx`: `<Sidebar panels={{ fog: <FogPanel /> }} />`.

- [ ] **Step 3: Verifica in browser:** la lista mostra i poligoni; click riga seleziona sulla mappa (e viceversa); rinomina (Invio/blur) persiste, anche con nomi come `<b>x</b>` (appaiono letterali); occhio rivela/nasconde (la mappa cambia fill); trascinare la maniglia riordina e persiste dopo reload; A–Z ordina con numeri naturali ("Area 2" prima di "Area 10"). Nessun errore console.

- [ ] **Step 4: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, scheda Fog of war (rinomina, rivela, riordina, ordina A-Z)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Griglia — menù, strumento "Allinea alla griglia" e scheda "Fine tuning"

**Files:**
- Create: `editor-app/src/menus/ColorField.tsx`, `editor-app/src/sidebar/GridPanel.tsx`
- Modify: `editor-app/src/menus/MenuBar.tsx` (menù Griglia tra Mappa e Bussola), `editor-app/src/App.tsx`

**Interfaces:**
- Consumes: `pushGridHistory`, `nudgeOffsets`, `NumberField`, store (`chooseGridAlignTool`, `toggleSquareConstrain`).
- Produces: `<ColorField value onLive onCommit />`; `<GridPanel />`.

- [ ] **Step 1: `editor-app/src/menus/ColorField.tsx`** — `onChange` di React corrisponde all'evento nativo `input`; il commit usa l'evento nativo `change` (alla chiusura del selettore), come l'originale

```tsx
import { useEffect, useRef } from 'react';

interface Props { value: string; disabled?: boolean; onLive: (v: string) => void; onCommit: (v: string) => void }

export function ColorField({ value, disabled, onLive, onCommit }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => commitRef.current(el.value);
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, []);

  return (
    <input
      ref={ref}
      type="color"
      aria-label="Colore griglia"
      className="h-8 w-12 cursor-pointer rounded border border-input bg-secondary p-0.5"
      disabled={disabled}
      value={value}
      onChange={(e) => onLive(e.target.value)}
    />
  );
}
```

- [ ] **Step 2: Menù Griglia** — in `MenuBar.tsx`, tra Mappa e Bussola (importa `Grid3x3`, `Crosshair`, `Square` da lucide, `ColorField`, `selectActiveLocation` già importato). Variabili in cima al componente: `const mode = useEditorStore((s) => s.mode); const squareConstrain = useEditorStore((s) => s.gridSquareConstrain); const colorPicking = useRef(false);`

```tsx
<MenubarMenu value="griglia">
  <MenubarTrigger
    className={triggerClass}
    data-active={Boolean(location?.map.grid.enabled || mode === 'grid-align' || squareConstrain)}
  >
    <Grid3x3 className="size-4" /> Griglia
  </MenubarTrigger>
  <MenubarContent
    onFocusOutside={(e) => { if (colorPicking.current) e.preventDefault(); }}
    onInteractOutside={(e) => { if (colorPicking.current) e.preventDefault(); }}
  >
    <MenubarCheckboxItem
      disabled={disabled}
      checked={Boolean(location?.map.grid.enabled)}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={() => socket.emit('grid:update', { locationId: location!.id, enabled: !location!.map.grid.enabled })}
    >
      <Grid3x3 /> Mostra griglia
    </MenubarCheckboxItem>
    <MenubarCheckboxItem
      disabled={disabled}
      checked={mode === 'grid-align'}
      onCheckedChange={() => useEditorStore.getState().chooseGridAlignTool()}
    >
      <Crosshair /> Allinea alla griglia
    </MenubarCheckboxItem>
    <MenubarCheckboxItem
      disabled={disabled}
      checked={squareConstrain}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={() => useEditorStore.getState().toggleSquareConstrain()}
    >
      <Square /> Vincola a quadrato
    </MenubarCheckboxItem>
    <MenuField label="Divisioni" title="Dividi la cella tracciata in N parti">
      <NumberField aria-label="Divisioni" className="h-8 w-20" min={1} max={20} step={1} disabled={disabled}
        value={location?.map.grid.divisions ?? 1}
        onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, divisions: v })} />
    </MenuField>
    <MenuField label="Colore" title="Colore griglia">
      <div onPointerDown={() => { colorPicking.current = true; }} onBlur={() => { colorPicking.current = false; }}>
        <ColorField
          disabled={disabled}
          value={location?.map.grid.color || '#ffffff'}
          onLive={(v) => useEditorStore.getState().mutateLocation((loc) => { loc.map.grid.color = v; })}
          onCommit={(v) => { colorPicking.current = false; socket.emit('grid:update', { locationId: location!.id, color: v }); }}
        />
      </div>
    </MenuField>
    <MenuField label="Spessore" title="Spessore tratto griglia">
      <NumberField aria-label="Spessore griglia" className="h-8 w-20" min={0.2} max={5} step={0.1} disabled={disabled}
        value={location?.map.grid.lineWidth || 0.3}
        onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, lineWidth: v })} />
    </MenuField>
    <MenuField label="Opacità" title="Opacità griglia">
      <NumberField aria-label="Opacità griglia" className="h-8 w-20" min={0} max={100} step={10} disabled={disabled}
        value={Math.round((location?.map.grid.opacity ?? 1) * 100)}
        onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, opacity: v / 100 })} />
      <span className="text-xs text-muted-foreground">%</span>
    </MenuField>
  </MenubarContent>
</MenubarMenu>
```
"Allinea alla griglia" chiude il menù (comportamento di default di `onSelect`), come l'originale quando poi si trascina sulla mappa.

- [ ] **Step 3: `editor-app/src/sidebar/GridPanel.tsx`**

```tsx
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/NumberField';
import { nudgeOffsets } from '@/lib/grid-math';
import { socket } from '@/lib/socket';
import { pushGridHistory } from '@/stage/actions';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

const PAD: { dx: number; dy: number; icon: React.ReactNode; label: string; col: number; row: number }[] = [
  { dx: 0, dy: -1, icon: <ChevronUp />, label: 'Su', col: 2, row: 1 },
  { dx: -1, dy: 0, icon: <ChevronLeft />, label: 'Sinistra', col: 1, row: 2 },
  { dx: 1, dy: 0, icon: <ChevronRight />, label: 'Destra', col: 3, row: 2 },
  { dx: 0, dy: 1, icon: <ChevronDown />, label: 'Giù', col: 2, row: 3 },
];

export function GridPanel() {
  const location = useEditorStore(selectActiveLocation);
  const disabled = !location;
  const grid = location?.map.grid;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Label>Cella (px)</Label>
        <NumberField aria-label="Dimensione cella" className="h-8 w-24" min={4} max={1000} disabled={disabled}
          value={grid?.cellSize ?? 100}
          onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, cellSize: v })} />
      </div>
      <div>
        <Label className="mb-2 block">Sposta</Label>
        <div className="grid w-32 grid-cols-3 grid-rows-3 gap-1">
          {PAD.map((b) => (
            <Button
              key={b.label}
              variant="secondary"
              size="icon"
              title={b.label}
              disabled={disabled}
              style={{ gridColumn: b.col, gridRow: b.row }}
              onClick={() => {
                if (!location) return;
                const patch = nudgeOffsets(location.map.grid, b.dx, b.dy);
                pushGridHistory('griglia spostata', patch);
                socket.emit('grid:update', { locationId: location.id, ...patch });
              }}
            >
              {b.icon}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Offset X</Label>
          <NumberField aria-label="Offset X" className="h-8" min={-100000} max={100000} disabled={disabled}
            value={grid?.offsetX ?? 0}
            onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, offsetX: v })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Offset Y</Label>
          <NumberField aria-label="Offset Y" className="h-8" min={-100000} max={100000} disabled={disabled}
            value={grid?.offsetY ?? 0}
            onCommit={(v) => socket.emit('grid:update', { locationId: location!.id, offsetY: v })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => socket.emit('gridPreset:save', { locationId: location!.id })}>
          Salva come predefinita
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => socket.emit('gridPreset:apply', { locationId: location!.id })}>
          Applica predefinita
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Collegare** — `Sidebar panels={{ fog: <FogPanel />, grid: <GridPanel /> }}`.

- [ ] **Step 5: Verifica in browser** (copia dei dati, location con mappa):
  1. "Mostra griglia" accende/spegne la griglia; il trigger "Griglia" si colora quando è accesa.
  2. "Allinea alla griglia" + trascinare un riquadro sulla mappa: compare il riquadro tratteggiato, al rilascio la griglia si ridisegna sul riquadro, la modalità torna "Seleziona". Con "Vincola a quadrato" il riquadro in anteprima diventa quadrato. "Divisioni" = 2 dimezza la cella. "Annulla" ripristina la griglia precedente.
  3. Colore: aprire il selettore nativo **non chiude il menù**; scegliere un colore mostra l'anteprima in tempo reale e, alla chiusura del selettore, persiste dopo reload. Se il menù si chiude all'apertura del selettore, applica il piano B del Task 6 (Popover) per il solo menù Griglia.
  4. Spessore/Opacità/Divisioni: digitare e premere Invio o uscire dal campo applica.
  5. Scheda "Fine tuning": frecce spostano la griglia del 10% della cella (annullabili), offset X/Y, "salva/applica predefinita" non danno errori.
  Nessun errore console.

- [ ] **Step 6: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, menù Griglia, strumento allinea e scheda fine tuning

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Shaders — menù con sottomenù, canvas WebGL, selezione con maniglie, scheda "Shaders attivi"

**Files:**
- Create: `editor-app/src/stage/use-shader-loop.ts`, `editor-app/src/stage/ShaderSelection.tsx`, `editor-app/src/sidebar/ShaderPanel.tsx`
- Modify: `editor-app/src/menus/MenuBar.tsx` (menù Shaders tra Griglia e Bussola), `editor-app/src/App.tsx`

**Interfaces:**
- Consumes: `ShaderLayer` (globale), `startShaderResize`, `deleteShaderWithHistory`, `stepSize`, `useArmConfirm`, store.
- Produces: `useShaderLoop(mediaRef)`, `<ShaderSelection />`, `<ShaderPanel />`.

- [ ] **Step 1: Loop di rendering** — `editor-app/src/stage/use-shader-loop.ts` (porting di `editor.js:2409-2440`: il loop si ferma quando non ci sono decorazioni e riparte quando ne compaiono)

```ts
import { useEffect } from 'react';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { MapMedia } from './MapStage';

export function useShaderLoop(mediaRef: React.MutableRefObject<MapMedia | null>) {
  useEffect(() => {
    const canvas = document.getElementById('map-shader-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const layer = new ShaderLayer(canvas);
    let raf = 0;
    let running = true;

    const step = () => {
      const loc = selectActiveLocation(useEditorStore.getState());
      const media = mediaRef.current;
      let shaders = loc?.map.shaders ?? [];
      if (loc && loc.map.file && media) {
        layer.render(shaders, loc.map.grid, mediaW(media), mediaH(media));
      } else {
        shaders = [];
      }
      if (!shaders.length) { running = false; return; }
      raf = requestAnimationFrame(step);
    };

    const kick = () => {
      const loc = selectActiveLocation(useEditorStore.getState());
      if ((loc?.map.shaders?.length ?? 0) > 0 && !running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    const unsubscribe = useEditorStore.subscribe(kick);
    return () => { cancelAnimationFrame(raf); unsubscribe(); running = false; };
  }, [mediaRef]);
}
```

- [ ] **Step 2: Riquadro di selezione e maniglie** — `editor-app/src/stage/ShaderSelection.tsx`

```tsx
import { CORNERS, rectCorners, type Corner } from '@/lib/shader-math';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { startShaderResize } from './actions';

export function ShaderSelection() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedShaderId);
  const rect = useEditorStore((s) => s.geometry.imageRect);
  const naturalW = useEditorStore((s) => s.geometry.naturalW);
  const naturalH = useEditorStore((s) => s.geometry.naturalH);
  const deco = location && selectedId ? location.map.shaders.find((d) => d.id === selectedId) : undefined;
  if (!location || !deco || !rect || !naturalW || !naturalH) return null;

  const r = shaderDecorationRectPercent(deco, location.map.grid, naturalW, naturalH);
  const left = (r.leftPct / 100) * rect.width;
  const top = (r.topPct / 100) * rect.height;
  const width = (r.widthPct / 100) * rect.width;
  const height = (r.heightPct / 100) * rect.height;
  const corners = rectCorners({ leftPct: left, topPct: top, widthPct: width, heightPct: height });

  return (
    <>
      <div className="shader-box" style={{ left, top, width, height }} />
      {CORNERS.map((c: Corner) => (
        <div
          key={c}
          className={`shader-handle shader-handle-${c}`}
          style={{ left: corners[c][0], top: corners[c][1] }}
          onPointerDown={(e) => { e.stopPropagation(); startShaderResize(c); }}
        />
      ))}
    </>
  );
}
```
(`rectCorners` lavora su qualsiasi quadrupla `left/top/width/height`; qui gli passiamo pixel invece di percentuali, il calcolo è identico.)

- [ ] **Step 3: Scheda "Shaders attivi"** — `editor-app/src/sidebar/ShaderPanel.tsx`

```tsx
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { stepSize, type StepKind } from '@/lib/shader-math';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { deleteShaderWithHistory } from '@/stage/actions';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

const fmt = (m: number) => `${m.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;

export function ShaderPanel() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedShaderId);
  const arm = useArmConfirm();
  const shaders = location?.map.shaders ?? [];
  const armed = selectedId !== null && arm.isArmed(selectedId);

  const step = (id: string, kind: StepKind) => {
    const deco = shaders.find((d) => d.id === id);
    if (!deco || !location) return;
    const { widthM, heightM } = stepSize(deco, kind);
    socket.emit('shader:resize', { locationId: location.id, id, widthM, heightM });
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button
          variant={armed ? 'destructive' : 'ghost'}
          size="icon"
          disabled={!selectedId}
          title={armed ? 'Click di nuovo per confermare' : 'Elimina selezionato'}
          onClick={() => selectedId && arm.press(selectedId, () => deleteShaderWithHistory(selectedId))}
        >
          <Trash2 />
        </Button>
      </div>
      {shaders.length === 0 && <p className="text-sm text-muted-foreground">Nessuna decorazione su questa location.</p>}
      <div className="flex flex-col gap-1">
        {shaders.map((deco) => {
          const selected = deco.id === selectedId;
          const label = (typeof SHADER_EFFECTS !== 'undefined' && SHADER_EFFECTS[deco.shaderId]?.label) || deco.shaderId;
          return (
            <div
              key={deco.id}
              className={cn('rounded-md border p-2', selected && 'border-primary bg-primary/10')}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                const s = useEditorStore.getState();
                s.select({ polygon: null, shader: s.selectedShaderId === deco.id ? null : deco.id });
              }}
            >
              <div className="text-sm font-medium">{label}</div>
              {selected && (
                <div className="mt-2 flex flex-col gap-1">
                  {(['w', 'h'] as const).map((axis) => (
                    <div key={axis} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{axis === 'w' ? 'Larghezza' : 'Altezza'}</span>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="secondary" className="size-7" title="Riduci" onClick={() => step(deco.id, `${axis}-out`)}><Minus /></Button>
                        <span className="w-16 text-center">{fmt(axis === 'w' ? deco.widthM : deco.heightM)}</span>
                        <Button size="icon" variant="secondary" className="size-7" title="Aumenta" onClick={() => step(deco.id, `${axis}-in`)}><Plus /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Menù Shaders** — in `MenuBar.tsx` tra Griglia e Bussola (importa `Sparkles`, `MenubarSub`, `MenubarSubTrigger`, `MenubarSubContent`). Variabile in cima: `const selectedShaderType = useEditorStore((s) => s.selectedShaderType);`

```tsx
<MenubarMenu value="shaders">
  <MenubarTrigger className={triggerClass} data-active={mode === 'shader-place'}>
    <Sparkles className="size-4" /> Shaders
  </MenubarTrigger>
  <MenubarContent>
    <MenubarSub>
      <MenubarSubTrigger disabled={disabled}><Sparkles /> Portali</MenubarSubTrigger>
      <MenubarSubContent>
        {[
          { id: 'portal', label: 'Blu' },
          { id: 'portal_red', label: 'Rosso' },
          { id: 'green_fire', label: 'Verde' },
        ].map((s) => (
          <MenubarCheckboxItem
            key={s.id}
            checked={mode === 'shader-place' && selectedShaderType === s.id}
            onCheckedChange={() => useEditorStore.getState().chooseShaderTool(s.id)}
          >
            <Sparkles /> {s.label}
          </MenubarCheckboxItem>
        ))}
      </MenubarSubContent>
    </MenubarSub>
  </MenubarContent>
</MenubarMenu>
```
Il cambio automatico alla scheda "Shaders attivi" all'apertura del menù è già nel `onValueChange` di `Menubar` (Task 6). Il sottomenù si ribalta da solo a sinistra vicino al bordo (collision handling di Radix).

- [ ] **Step 5: Collegare in App** — `useShaderLoop(mediaRef)`, `<MapStage ...><PolygonLayer /><ShaderSelection /></MapStage>`, `<Sidebar panels={{ fog: <FogPanel />, grid: <GridPanel />, shader: <ShaderPanel /> }} />`.

- [ ] **Step 6: Verifica in browser** (copia dei dati, location con mappa e griglia attiva):
  1. Aprire "Shaders" porta la sidebar sulla scheda "Shaders attivi"; "Portali → Rosso" chiude il menù e attiva il piazzamento (il trigger "Shaders" si colora); trascinare un riquadro sulla mappa crea la decorazione animata (WebGL) e la modalità torna "Seleziona".
  2. Click sulla decorazione la seleziona: riquadro tratteggiato + 4 maniglie quadrate. Trascinare una maniglia ridimensiona ancorando l'angolo **opposto** (leggi `getBoundingClientRect` del riquadro prima/dopo per confermare che l'angolo opposto non si muove); al rilascio persiste dopo reload.
  3. Trascinare il corpo sposta; i pulsanti −/+ della lista cambiano di 0,5 m; elimina con doppio click e "Annulla" la ripristina.
  4. **Su una location con mappa ruotata** ripetere 2: il ridimensionamento funziona (il cursore diagonale può risultare invertito: limite noto di CLAUDE.md).
  5. Eliminare tutte le decorazioni ferma il loop (nessun frame in coda: `performance` console resta quieta); piazzarne una nuova lo riavvia.
  6. **Pulizia:** elimina le decorazioni create nella copia dei dati.
  Nessun errore console.

- [ ] **Step 7: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, menù Shaders, piazzamento e trasformazione ad angoli, lista decorazioni

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Scheda Location

**Files:**
- Create: `editor-app/src/sidebar/LocationPanel.tsx`
- Modify: `editor-app/src/App.tsx`

**Interfaces:**
- Consumes: `useSortableList`, `useArmConfirm`, `CommitInput`, socket, store.
- Produces: `<LocationPanel />`.

- [ ] **Step 1: `editor-app/src/sidebar/LocationPanel.tsx`**

```tsx
import { Archive, GripVertical, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { useSortableList } from '@/hooks/use-sortable-list';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';

export function LocationPanel() {
  const server = useEditorStore((s) => s.server);
  const archiveArm = useArmConfirm();
  const deleteArm = useArmConfirm();
  const active = server?.locations.filter((l) => !l.archived) ?? [];
  const archived = server?.locations.filter((l) => l.archived) ?? [];
  const byId = new Map(active.map((l) => [l.id, l]));
  const sortable = useSortableList(active.map((l) => l.id), (orderedIds) => socket.emit('location:reorder', { orderedIds }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {sortable.order.map((id) => {
          const l = byId.get(id);
          if (!l) return null;
          const armed = archiveArm.isArmed(id);
          return (
            <div key={id} ref={sortable.rowRef(id)} className={cn('flex items-center gap-1 rounded-md border p-1', sortable.isDragging && 'select-none')}>
              <span className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                <GripVertical className="size-4" />
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={cn(l.isDefault && 'text-primary')}
                title={l.isDefault ? 'Location predefinita all’avvio' : 'Imposta come predefinita all’avvio'}
                onClick={() => socket.emit('location:setDefault', { locationId: id })}
              >
                <Star className={cn(l.isDefault && 'fill-current')} />
              </Button>
              <CommitInput className="h-8" placeholder="nome location" value={l.name}
                onCommit={(name) => socket.emit('location:rename', { locationId: id, name })} />
              <Button
                variant={armed ? 'destructive' : 'ghost'}
                size="icon"
                title={armed ? 'Click di nuovo per confermare' : 'Archivia location'}
                onClick={() => archiveArm.press(id, () => socket.emit('location:archive', { locationId: id }))}
              >
                <Archive />
              </Button>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Archiviate</p>
          <div className="flex flex-col gap-1">
            {archived.map((l) => {
              const armed = deleteArm.isArmed(l.id);
              return (
                <div key={l.id} className="flex items-center gap-1 rounded-md border p-1">
                  <CommitInput className="h-8" placeholder="nome location" value={l.name}
                    onCommit={(name) => socket.emit('location:rename', { locationId: l.id, name })} />
                  <Button variant="ghost" size="icon" title="Ripristina location"
                    onClick={() => { deleteArm.disarm(); socket.emit('location:restore', { locationId: l.id }); }}>
                    <RotateCcw />
                  </Button>
                  <Button
                    variant={armed ? 'destructive' : 'ghost'}
                    size="icon"
                    title={armed ? 'Click di nuovo per confermare' : 'Elimina definitivamente'}
                    onClick={() => deleteArm.press(l.id, () => socket.emit('location:delete', { locationId: l.id }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Collegare** — `panels={{ location: <LocationPanel />, ... }}`.

- [ ] **Step 3: Verifica in browser** (copia dei dati): crea una location con "+", rinominala (anche con `<i>x</i>`), imposta la stella, riordina con la maniglia (persiste), archiviala (doppio click) → compare sotto "Archiviate"; ripristinala; archiviala di nuovo ed eliminala definitivamente (doppio click). **Archivia l'ultima location attiva**: header mostra "— nessuna location —", i controlli (menù, strumenti) risultano disabilitati, la mappa mostra il segnaposto, nessun errore. Poi ripristina.

- [ ] **Step 4: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, scheda Location (predefinita, rinomina, riordino, archivia, elimina)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Scheda Immagini e lightbox

**Files:**
- Create: `editor-app/src/sidebar/ImagePanel.tsx`, `editor-app/src/sidebar/Lightbox.tsx`
- Modify: `editor-app/src/App.tsx`

**Interfaces:**
- Consumes: `useSortableList`, `useArmConfirm`, `CommitInput`, `useTelegramDestinations`, store, shadcn `Dialog`, `Select`.
- Produces: `<ImagePanel />` (include il `Lightbox` internamente).

- [ ] **Step 1: Lightbox** — `editor-app/src/sidebar/Lightbox.tsx`

```tsx
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ImageItem } from '@/types';

export function Lightbox({ image, onClose }: { image: ImageItem | null; onClose: () => void }) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[90vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[90vw]">
        <DialogTitle className="sr-only">{image?.name || 'Anteprima immagine'}</DialogTitle>
        <DialogDescription className="sr-only">Anteprima a schermo intero</DialogDescription>
        {image && (
          <div className="flex flex-col items-center gap-2">
            <img src={`/storage/images/${image.file}`} alt={image.name || ''} className="max-h-[85vh] max-w-full rounded-md object-contain" />
            <p className="text-sm text-foreground">{image.name}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```
(Esc e click sull'overlay chiudono già di default con il Dialog Radix, come l'originale.)

- [ ] **Step 2: Pannello** — `editor-app/src/sidebar/ImagePanel.tsx`

```tsx
import { useState } from 'react';
import { GripVertical, Maximize2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { useSortableList } from '@/hooks/use-sortable-list';
import { useTelegramDestinations } from '@/hooks/use-telegram-destinations';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { ImageItem } from '@/types';
import { Lightbox } from './Lightbox';

const NONE = '__none__';

export function ImagePanel() {
  const location = useEditorStore(selectActiveLocation);
  const destinations = useTelegramDestinations();
  const arm = useArmConfirm();
  const [preview, setPreview] = useState<ImageItem | null>(null);
  const images = location?.images ?? [];
  const byId = new Map(images.map((i) => [i.id, i]));
  const sortable = useSortableList(images.map((i) => i.id), (orderedIds) =>
    location && socket.emit('image:reorder', { locationId: location.id, orderedIds })
  );
  const destinationsUnavailable = destinations === null || destinations.length === 0;

  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva — creane una qui sopra.</p>;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    formData.append('name', file.name);
    await fetch('/api/upload/image', { method: 'POST', body: formData });
  };

  return (
    <div className="flex flex-col gap-3">
      {images.length === 0 && <p className="text-sm text-muted-foreground">Nessuna immagine per questa location.</p>}
      <div className="flex flex-col gap-2">
        {sortable.order.map((id) => {
          const img = byId.get(id);
          if (!img) return null;
          const armed = arm.isArmed(id);
          return (
            <div key={id} ref={sortable.rowRef(id)} className={cn('flex flex-col gap-1 rounded-md border p-2', sortable.isDragging && 'select-none')}>
              <div className="flex items-center gap-1">
                <span className="cursor-grab p-1 text-muted-foreground" title="Trascina per riordinare" {...sortable.handleProps(id)}>
                  <GripVertical className="size-4" />
                </span>
                <button type="button" className="relative size-12 shrink-0 overflow-hidden rounded" title="Anteprima a schermo intero" onClick={() => setPreview(img)}>
                  <img src={`/storage/images/${img.file}`} alt={img.name} className="size-full object-cover" />
                  <Maximize2 className="absolute right-0.5 bottom-0.5 size-3 text-white drop-shadow" />
                </button>
                <CommitInput className="h-8" placeholder="etichetta" value={img.name}
                  onCommit={(name) => socket.emit('image:rename', { locationId: location.id, imageId: id, name })} />
                <Button
                  variant={armed ? 'destructive' : 'ghost'}
                  size="icon"
                  title={armed ? 'Click di nuovo per confermare' : 'Elimina immagine'}
                  onClick={() => arm.press(id, () => socket.emit('image:delete', { locationId: location.id, imageId: id }))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="flex gap-1">
                <CommitInput className="h-8" placeholder="didascalia per Telegram" value={img.caption || ''}
                  onCommit={(caption) => socket.emit('image:caption', { locationId: location.id, imageId: id, caption })} />
                <Select
                  disabled={destinationsUnavailable}
                  value={img.telegramDestination || NONE}
                  onValueChange={(v) => socket.emit('image:destination', { locationId: location.id, imageId: id, destination: v === NONE ? null : v })}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={destinations === null ? 'Caricamento…' : 'Destinazioni non disponibili'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— scegli destinazione —</SelectItem>
                    {(destinations ?? []).map((d) => (
                      <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
      <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
        Carica immagine
        <input type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <Lightbox image={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Collegare** — `panels={{ ..., immagini: <ImagePanel /> }}`.

- [ ] **Step 4: Verifica in browser** (copia dei dati; PicSender/Telegram può non essere raggiungibile: il select resta disabilitato con "Destinazioni non disponibili", come l'originale): carica un'immagine, rinominala, imposta una didascalia con `<script>` (resta testo), apri l'anteprima (Esc e click fuori chiudono), riordina, elimina con doppio click.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, scheda Immagini con anteprima, didascalia e destinazione Telegram

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Scheda Audio

**Files:**
- Create: `editor-app/src/sidebar/AudioPanel.tsx`
- Modify: `editor-app/src/App.tsx`

**Interfaces:**
- Consumes: `useArmConfirm`, `CommitInput`, store.
- Produces: `<AudioPanel />` (due slot: `main` "Traccia principale", `special` "Traccia speciale").

- [ ] **Step 1: `editor-app/src/sidebar/AudioPanel.tsx`** — la chiave di armamento include location e file (`${location.id}:${track.file}`), così l'arm non sopravvive a un cambio location o a una sostituzione della traccia

```tsx
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitInput } from '@/components/CommitInput';
import { useArmConfirm } from '@/hooks/use-arm-confirm';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

type Slot = 'main' | 'special';

function AudioSlot({ slot, uploadLabel }: { slot: Slot; uploadLabel: string }) {
  const location = useEditorStore(selectActiveLocation);
  const arm = useArmConfirm();
  if (!location) return null;
  const track = location.map.audio[slot];
  const hasFile = Boolean(track?.file);
  const key = `${location.id}:${track?.file}`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', location.id);
    formData.append('name', file.name);
    formData.append('slot', slot);
    await fetch('/api/upload/audio', { method: 'POST', body: formData });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      {hasFile && (
        <div className="flex items-center gap-1">
          <CommitInput className="h-8" placeholder="etichetta" value={track.name}
            onCommit={(name) => socket.emit('audio:rename', { locationId: location.id, slot, name })} />
          <Button
            variant={arm.isArmed(key) ? 'destructive' : 'ghost'}
            size="icon"
            title={arm.isArmed(key) ? 'Click di nuovo per confermare' : 'Elimina traccia'}
            onClick={() => arm.press(key, () => socket.emit('audio:delete', { locationId: location.id, slot }))}
          >
            <Trash2 />
          </Button>
        </div>
      )}
      <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-accent">
        {hasFile ? 'Sostituisci traccia' : uploadLabel}
        <input type="file" accept="audio/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </div>
  );
}

export function AudioPanel() {
  const location = useEditorStore(selectActiveLocation);
  if (!location) return <p className="text-sm text-muted-foreground">Nessuna location attiva.</p>;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Traccia principale</h3>
        <AudioSlot slot="main" uploadLabel="Carica traccia principale" />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Traccia speciale</h3>
        <AudioSlot slot="special" uploadLabel="Carica traccia speciale" />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Collegare** — `panels={{ ..., audio: <AudioPanel /> }}`.

- [ ] **Step 3: Verifica in browser** (copia dei dati): carica un mp3 di prova nello slot principale, rinominalo, sostituiscilo, eliminalo con doppio click; passare a un'altra location tra il primo e il secondo click disarma l'eliminazione.

- [ ] **Step 4: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, scheda Audio (traccia principale e speciale)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: File orfani, Esporta/Importa e link Opzioni

**Files:**
- Create: `editor-app/src/menus/OrphansPopover.tsx`, `editor-app/src/menus/ImportExportMenu.tsx`
- Modify: `editor-app/src/menus/MenuBar.tsx`, `editor-app/src/App.tsx` (o `Header`: i tre elementi vanno dopo `<MenuBar />`)

**Interfaces:**
- Consumes: `useArmConfirm`, store, shadcn `Popover`, `Dialog`, `Menubar`.
- Produces: `<OrphansPopover />`, `<ImportExportMenu />`; link `/opzioni`.

- [ ] **Step 1: File orfani** — `editor-app/src/menus/OrphansPopover.tsx` (Popover che **non** si chiude cliccando fuori, come l'originale: potrebbe contenere una scansione in corso)

```tsx
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useArmConfirm } from '@/hooks/use-arm-confirm';

interface Orphan { file: string; kind: string; size: number }

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;

export function OrphansPopover() {
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const arm = useArmConfirm();

  const scan = async () => {
    const res = await fetch('/api/storage/orphans/scan', { method: 'POST' });
    const data = await res.json();
    setOrphans(data.orphans || []);
    setMessage(null);
    arm.disarm();
  };

  const purge = async () => {
    const res = await fetch('/api/storage/orphans/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: (orphans ?? []).map(({ file, kind }) => ({ file, kind })) }),
    });
    const data = await res.json();
    setOrphans(null);
    setMessage(`cancellati ${data.deleted.length} file.`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Pulisci file orfani"><Trash2 /> File orfani</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" onInteractOutside={(e) => e.preventDefault()}>
        <Button variant="secondary" size="sm" onClick={() => void scan()}>Cerca file orfani</Button>
        <div className="mt-3 max-h-60 overflow-y-auto text-xs text-muted-foreground">
          {orphans !== null && orphans.length === 0 && 'nessun file orfano trovato.'}
          {orphans?.map((o) => (
            <div key={o.file}>{o.file} ({o.kind}, {formatBytes(o.size)})</div>
          ))}
          {message}
        </div>
        {orphans && orphans.length > 0 && (
          <Button
            className="mt-3"
            size="sm"
            variant={arm.isArmed('purge') ? 'destructive' : 'secondary'}
            onClick={() => arm.press('purge', () => void purge())}
          >
            {arm.isArmed('purge') ? 'click di nuovo per confermare' : 'conferma cancellazione'}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Esporta/Importa** — `editor-app/src/menus/ImportExportMenu.tsx`

```tsx
import { useRef, useState } from 'react';
import { Download, MoreHorizontal, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

interface Pending { token: string; kind: 'location' | 'backup'; text: string; yesLabel: string }

const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('it-IT'); } catch { return iso; }
};

const cancelImport = (token: string) =>
  fetch('/api/import/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });

export function ImportExportMenu() {
  const location = useEditorStore(selectActiveLocation);
  const locationCount = useEditorStore((s) => s.server?.locations.length ?? 0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (pending) { void cancelImport(pending.token); setPending(null); }
    setError(null);
    setBusy(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/import/inspect', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Importazione fallita');
      if (body.kind === 'location') {
        setPending({
          token: body.token, kind: 'location', yesLabel: 'Importa',
          text: `Importare la location «${body.summary.locationName}», esportata il ${formatDate(body.summary.exportedAt)}?`,
        });
      } else {
        setPending({
          token: body.token, kind: 'backup', yesLabel: 'Sostituisci tutto',
          text: `Questo SOSTITUIRÀ tutte le ${locationCount} location attuali con le ${body.summary.locationCount} contenute nel backup, esportato il ${formatDate(body.summary.exportedAt)}. Una copia di sicurezza dei dati attuali verrà salvata automaticamente prima.`,
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!pending) return;
    const { token } = pending;
    setPending(null);
    try {
      const res = await fetch('/api/import/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Importazione fallita');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const dismiss = () => {
    if (pending) void cancelImport(pending.token);
    setPending(null);
  };

  return (
    <>
      <input ref={fileInput} type="file" accept=".vttlocation,.vttbackup" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <Menubar className="h-10 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="gap-1.5"><MoreHorizontal className="size-4" /> Esporta/Importa</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!location} onSelect={() => { window.location.href = `/api/export/location/${location!.id}`; }}>
              <Download /> Esporta «{location?.name ?? '—'}»
            </MenubarItem>
            <MenubarItem onSelect={() => { window.location.href = '/api/export/backup'; }}>
              <Download /> Esporta backup completo
            </MenubarItem>
            <MenubarItem disabled={busy} onSelect={() => fileInput.current?.click()}>
              <Upload /> {busy ? 'Analisi in corso...' : 'Importa...'}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      {error && <p className="px-6 py-2 text-sm text-amber-400" role="alert">{error}</p>}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) dismiss(); }}>
        <DialogContent>
          <DialogTitle>{pending?.kind === 'backup' ? 'Sostituire tutti i dati?' : 'Importare la location?'}</DialogTitle>
          <DialogDescription>{pending?.text}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={dismiss}>Annulla</Button>
            <Button variant={pending?.kind === 'backup' ? 'destructive' : 'default'} onClick={() => void apply()}>{pending?.yesLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Montare** — in `App.tsx` il prop `menus` di `Header` diventa:
```tsx
<>
  <MenuBar />
  <OrphansPopover />
  <ImportExportMenu />
  <Button asChild variant="ghost" size="sm"><a href="/opzioni"><Settings /> Opzioni</a></Button>
</>
```
(importa `Settings` da lucide e `Button`).

- [ ] **Step 4: Verifica in browser** (copia dei dati): "Cerca file orfani" mostra l'elenco o "nessun file orfano trovato."; cliccare fuori dal popover **non** lo chiude; l'eliminazione richiede due click (usare solo la copia dei dati). "Esporta «Taverna»" scarica un `.vttlocation`; "Esporta backup completo" scarica un `.vttbackup`; reimportare il `.vttlocation` mostra il dialogo di conferma con il testo corretto, "Annulla" invia `/api/import/cancel`, "Importa" crea la location (eliminarla dopo). Il link "Opzioni" naviga a `/opzioni`. Un file non valido mostra l'errore.

- [ ] **Step 5: Commit**

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
feat: editor-app, file orfani, esporta/importa con dialogo di conferma e link Opzioni

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Verifica di parità contro CLAUDE.md e rifinitura

**Files:**
- Modify: i file di `editor-app/src/` in cui emergono differenze (nessun file nuovo previsto)

**Interfaces:**
- Consumes: tutto ciò che precede.
- Produces: elenco di differenze risolte o accettate esplicitamente.

- [ ] **Step 1: Preparare l'ambiente di confronto.** Server di prova su porta 3100 con copia dei dati (Task 1, passo 6). Due tab: `http://localhost:3100/editor/` (vecchio) e `http://localhost:3100/editor-next/` (nuovo). Non aprire `/display`, `/control`, `/party`.

- [ ] **Step 2: Percorrere la checklist** su una location con mappa, griglia, due poligoni e una decorazione. Per ogni riga confronta vecchio/nuovo e correggi le differenze:

  | Area | Comportamento atteso |
  |---|---|
  | Menù | Un solo menù aperto alla volta; Esc chiude; trigger evidenziato se una voce interna è attiva (Mappa: flip/rotate; Griglia: griglia/allinea/quadrato; Shaders: piazzamento; Bussola: visibile) |
  | Shaders | Aprire il menù passa alla scheda "Shaders attivi"; scegliere una voce del sottomenù chiude tutto e attiva il piazzamento; il sottomenù si ribalta a sinistra vicino al bordo destro |
  | Trasforma ad angoli | 4 maniglie quadrate, angolo opposto fermo, emit `shader:move`+`shader:resize` solo al rilascio, nessuna voce di storico |
  | Strumenti | "Seleziona" e "Disegna area" mutuamente esclusivi; cambiare strumento spegne ogni evidenziazione precedente (nessun menù "Shaders" acceso a vuoto) |
  | Storico | Undo/redo di: spostamento area, rimozione vertice, eliminazione area/decorazione, ritracciamento e spostamento griglia; in modalità disegno agisce solo sui punti |
  | Doppio click | Elimina area/decorazione/immagine/location/traccia/orfani: primo click arma (2,5 s), secondo conferma |
  | Nessuna location | Controlli disabilitati, mappa con segnaposto, nessun crash |
  | Mappa ruotata | `rotate90` attivo: disegno, trascinamento e ridimensionamento corretti |
  | Mappa video | Una location con `.mp4`/`.webm`: si riproduce muta in loop, dimensioni corrette |
  | Zoom | Rotella 50%–400% centrata sul cursore; reset dal menù Vista |
  | Persistenza | Dopo reload completo tutto resta (poligoni, griglia, bussola, shader, scala) |
  | Console | Nessun errore né warning in nessun passaggio |

- [ ] **Step 3: Test automatici**

```bash
cd editor-app && npm test && npm run typecheck && npm run build
cd .. && node --test public/shared/media.test.js
```
Expected: tutto verde (38 test di `media.test.js`).

- [ ] **Step 4: Pulizia dei dati di prova.** Conferma che nella **copia** non resti nulla di anomalo; i dati reali (`/home/kratos/Documenti/Projects/anime-vtt/data`) non sono stati toccati: `git -C /home/kratos/Documenti/Projects/anime-vtt status --short` deve restare invariato.

- [ ] **Step 5: Commit delle correzioni** (se ce ne sono)

```bash
git add editor-app
git commit -m "$(cat <<'EOF'
fix: editor-app, allineamenti emersi dalla verifica di parità con il vecchio editor

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Cutover — il nuovo editor diventa `/editor`

**Files:**
- Modify: `editor-app/vite.config.ts` (`base`, `outDir`), `server/index.js` (rimuovere la route `/editor-next`), `.gitignore`, `CLAUDE.md`
- Delete: `public/editor/editor.js`, `public/editor/index.html` (vecchio), `public/editor/editor.css`, `public/editor-next/` (build intermedia, ignorata da git)
- Create: `public/editor/` (output della build)

**Interfaces:**
- Consumes: l'esito del Task 16; **esegui questo task solo dopo l'approvazione esplicita dell'utente sulla parità** (conferma in chat).

- [ ] **Step 1: Configurazione di produzione** — in `editor-app/vite.config.ts`: `base: '/editor/'` e `build: { outDir: '../public/editor', emptyOutDir: true }`.

- [ ] **Step 2: Rimuovere il vecchio editor e costruire il nuovo**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt-editor-shadcn
git rm public/editor/editor.js public/editor/index.html public/editor/editor.css
rm -rf public/editor-next
cd editor-app && npm run build
```
Expected: `public/editor/index.html` e `public/editor/assets/*` presenti.

- [ ] **Step 3: Ripulire server e gitignore** — in `server/index.js` elimina la riga `app.use('/editor-next', ...)`; in `.gitignore` elimina `public/editor-next/` (mantieni `editor-app/node_modules/`).

- [ ] **Step 4: Verifica finale** — riavvia il server di prova e controlla `http://localhost:3100/editor/` (nuova app), poi:

```bash
node --test public/shared/media.test.js
git status --short
```
Expected: 38 test verdi; `public/editor/` contiene i file buildati e vengono tracciati (il Raspberry Pi serve file statici senza build step).

- [ ] **Step 5: Aggiornare `CLAUDE.md`** con una sezione in italiano "Porting di /editor su React + shadcn/ui (fatto, branch `editor-shadcn`)": decisioni chiave (approccio ibrido, moduli condivisi come script classici, store Zustand, `useStageInteractions` con listener nativi, menù Radix + piano B Popover se usato), come ricostruire (`cd editor-app && npm install && npm run build`, output committato in `public/editor/`), dove vive la logica testata (`editor-app/src/lib`), i limiti noti ereditati (cursore diagonale su mappe `rotate90`), le deviazioni dallo spec (arm singolo invece di Set) e le verifiche fatte.

- [ ] **Step 6: Commit e conclusione**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: /editor ora è l'app React + shadcn/ui; rimosso il vecchio editor vanilla

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```
Poi usa la skill `superpowers:finishing-a-development-branch` per decidere come integrare il branch (merge/PR). **Non** fare push né merge su `main` senza richiesta esplicita.

---

## Self-review

**Copertura dello spec**
- Build Vite → `public/editor`, Express invariato, alias/script condivisi, proxy dev → Task 1 (con deviazione dichiarata sugli script classici) e Task 17.
- Stato/rete (`useSocket`+store, eventi identici, aggiornamento ottimistico con emit al rilascio) → Task 2, 5, 8.
- `MenuBar` (Mappa, Griglia, Shaders+Portali, Bussola, Vista, File orfani, Esporta/Importa) → Task 6, 7, 10, 11, 15.
- `OptionsBar` → Task 5. `MapStage` + hook (`usePolygonDraw`/`useShaderTransform` realizzati come `useStageInteractions` unico, perché i listener nativi condividono lo stato di trascinamento) → Task 6, 8, 11. `Sidebar` a schede → Task 5, 9–14.
- Comportamenti da preservare (un menù alla volta, File orfani non si chiude fuori, click sottomenù sceglie+attiva, scheda "Shaders attivi", trasforma ad angoli, flip a sinistra) → Task 6, 11, 15 e checklist del Task 16.
- Verifica (suite 38 verde, console pulita, copia dei dati) → Global Constraints e Task 16.
- Rimozione dei vecchi file dopo la parità → Task 17.

**Scansione placeholder:** nessun TBD/TODO; i due punti che rimandano al sorgente sono la copia verbatim delle regole CSS (Task 6 passo 1, con intervalli di righe esatti) e le note di fallback "Piano B" (azione definita, condizione di attivazione esplicita).

**Coerenza dei tipi:** nomi verificati tra task — `useEditorStore`, `selectActiveLocation`, `chooseShaderTool`, `finishTool`, `select({polygon?, shader?})`, `recordHistory`, `mutateLocation`, `dragState.vertexIndex/shaderResize`, `stageRefs.canvas/wrap/recompute`, `Corner`/`CORNERS`/`OPPOSITE`/`rectCorners`, `placementFromDrag`/`resizeFromFixedCorner`/`stepSize`, `gridFromAlignDrag`/`gridHistoryAfter`/`nudgeOffsets`/`constrainSquare`, `pushGridHistory`, `applyGridAlignment`, `applyShaderPlacement`, `useArmConfirm().{isArmed,press,disarm}`.

**Review Focus:** ogni voce ha il suo punto di verifica (1: Task 2 test + Task 12; 2: Task 8/11; 3: Task 4 + Task 8; 4: Task 6/10; 5: Task 6/16; 6: Task 4 test `CommitInput` + verifiche dei task 9, 12, 13).
