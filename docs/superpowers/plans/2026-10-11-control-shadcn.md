# Porting di /control su React + shadcn/ui — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rifare il frontend di `/control` (`public/control/`) in React + shadcn/ui con parità funzionale completa, senza toccare server, eventi socket né `public/shared/*`.

**Architecture:** Seconda app nello stesso progetto Vite `editor-app/` (root dedicata `editor-app/control/`, config `vite.control.config.ts`), che riusa `components/ui/*`, `lib/utils`, `lib/socket`, `hooks/use-arm-confirm`, tema `index.css`. Stato in un proprio store Zustand+Immer (`src/control/store`). I layer WebGL/canvas (`ShaderLayer`, `AoeShaderLayer`, `PingLayer`) e gli helper di `media.js` restano vanilla, montati via ref. Gesti con listener nativi che leggono `useControlStore.getState()`. Durante lo sviluppo la build esce in `public/control-next/` servita da una route temporanea `/control-next`; il cutover (ultimo task) la porta su `/control` e rimuove i vecchi file.

**Tech Stack:** Vite 8, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), Zustand + Immer, socket.io-client, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-11-control-shadcn-design.md`

**Sorgente da portare (legge il comportamento):** `public/control/control.js` (2046 righe), `public/control/index.html`, `public/control/control.css`. Ogni task cita i numeri di riga di `control.js` che definiscono il comportamento da riprodurre **identico** (commenti compresi: contengono le decisioni). `CLAUDE.md` descrive le decisioni delle sezioni "Box sotto la mappa", "Shader sugli incantesimi AOE" e "Nuova vista /party".

## Global Constraints

- Lavorare solo nel worktree `/home/kratos/Documenti/Projects/anime-vtt-control-shadcn`, branch `control-shadcn`. Mai su `main`, mai merge/push.
- Nessuna modifica a `server/index.js` salvo la route statica **temporanea** `/control-next` (aggiunta nel Task 1, rimossa nel Task 15). Nessuna modifica a `public/shared/*`.
- Eventi socket e payload identici a oggi (elenco in `control.js`: `aoe:place|move|resize|rotate|remove|setColor|setShaderOverride|setCast`, `fow:toggle|setAll`, `view:pan|zoom|reset`, `grid:update`, `compass:update`, `ping:show` (con `strokeId`), `location:set`, `image:show|hide|caption|destination|sendTelegram`, `audio:play|pause|stop|volume|playSpecial`, `hello {role:'control'}`; in ascolto: `connect`, `disconnect`, `display:status`, `state:update`, `ping:show`, `telegram:sendResult`).
- Chiavi `localStorage` invariate: `dmGridOpacity`, `dmGridVisible`, `zoomLocalState`, `aoeNudgeOverlayPos`. Ogni accesso in `try/catch`.
- Italiano per testi UI e commenti, stesso tono del codice esistente. Nessun emoji aggiunto.
- Test: `cd editor-app && npm test` (Vitest) e `node --test public/shared/media.test.js` (38) devono restare verdi a ogni commit. `npm run typecheck` pulito.
- Test manuali in browser solo su una **copia dei dati** (`DATA_DIR` su directory temporanea, porta diversa dalla 3000), mai sullo stato vivo. Non aprire tab su `/display` né su `/control` originale se può esistere una sessione reale: `displayViewport` è globale sul server (vedi CLAUDE.md, "Incidente di test da NON ripetere"). Per verificare il crop leggere `state.displayViewport` dallo stato.
- Commit in italiano, formato `tipo(control): ...`, terminati da `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Zero dipendenze npm nuove salvo quelle già in `editor-app/package.json`.

## Review Focus

- Mappa **senza file** (location nuova): placeholder, nessun crash con `mediaW()===0`; AOE e ping disabilitati.
- **Zero location attive / `state` ancora `null`** al primo render: nessuna eccezione, shell visibile.
- **Remote `state:update` durante un gesto** (drag AOE, pan, ping): il gesto non scatta né si perde.
- **`displayViewport` assente**: riquadro giallo nascosto, pan da pad comunque raggiungibile, mai pulsante disabilitato.
- **Arma-poi-conferma** (`aoe:remove`, "Rivela tutto") che scade a 2,5 s e va riarmata; il bottone cliccato è sempre quello corrente del DOM.
- **Mappa ruotata 90°/180°**: pan, tap AOE/ping, nudge direzionali e riquadro giallo restano coerenti con lo schermo.
- **Zoom locale ripristinato da localStorage** corrotto o fuori range: ripiega su `{1,0,0}`; applicato solo con anteprima dimensionata.
- **Cambio location mentre un'immagine è mostrata / in anteprima di un'altra location**: ping/AOE spenti, banner e tab Immagini coerenti.

---

## File Structure

```
editor-app/
  control/index.html                    entry HTML (root della build /control), script classici + modulo
  control/main.tsx                      bootstrap React
  vite.shared.ts                        alias, plugin, proxy dev condivisi (editor + control)
  vite.config.ts                        (modifica) usa vite.shared
  vite.control.config.ts                build/dev del control
  src/test-load-shared.ts               carica media.js nei globali per i test Vitest
  src/globals.d.ts                      (modifica) dichiarazioni extra
  src/control/
    ControlApp.tsx                      shell
    types.ts                            tipi extra (Aoe, Compass, LiveView…)
    store/control-store.ts              stato Zustand
    lib/{prefs,local-zoom,view-math,aoe-ops,pan-math}.ts (+ .test.ts)
    hooks/{use-control-socket,use-shader-loop,use-map-geometry}.ts
    shell/{StatusBar,Banners,TabBar}.tsx
    map/{MapPreview,FogOverlays,AoeOverlays,CompassMarker,ViewportRect,ModeToggles}.tsx
    map/{use-pan-gesture,use-local-zoom-gesture,use-ping-gesture,use-aoe-gesture,use-fog-tap}.ts
    boxes/{PanBox,FogBox,PingBox,ZoomBox,AudioBox}.tsx
    aoe/{AoePanel,AoeChipList,AoeNudgePad,constants}.tsx
    tabs/{FogTab,ImagesTab}.tsx
```

Nota di struttura: i file in `lib/` sono funzioni pure testabili in Vitest (ambiente node); i componenti si testano con jsdom dove il test ha senso (logica, non pixel).

---

### Task 1: Scaffold seconda entry, build, route temporanea, globali di test

**Files:**
- Create: `editor-app/vite.shared.ts`, `editor-app/vite.control.config.ts`, `editor-app/control/index.html`, `editor-app/control/main.tsx`, `editor-app/src/control/ControlApp.tsx`, `editor-app/src/test-load-shared.ts`
- Modify: `editor-app/vite.config.ts`, `editor-app/package.json` (script), `editor-app/tsconfig.json` (include), `editor-app/src/globals.d.ts`, `editor-app/src/test-setup.ts`, `package.json` (root), `server/index.js` (route temporanea), `.gitignore`

**Interfaces:**
- Produces: `npm run build:control` → `public/control-next/index.html` + `assets/*`; `npm run dev:control` (porta 5174); globali di test (`rotateVector`, `fitRect`, `computeTotalRotation`, `snapAoeOrigin`, `AOE_*`, …) disponibili in Vitest; `ControlApp` default export.

- [ ] **Step 1: `vite.shared.ts`**

```ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export const BACKEND = process.env.VTT_BACKEND ?? 'http://localhost:3000';
export const sharedPlugins = () => [react(), tailwindcss()];
export const sharedAlias = { '@': path.resolve(import.meta.dirname, 'src') };
export const sharedProxy = {
  '/socket.io': { target: BACKEND, ws: true },
  '/api': BACKEND,
  '/storage': BACKEND,
  '/shared': BACKEND,
};
```

- [ ] **Step 2: `vite.config.ts`** (editor) — sostituire plugin/alias/proxy con gli import da `./vite.shared`; resto invariato (`base '/editor/'`, `outDir '../public/editor'`, blocco `test`).

- [ ] **Step 3: `vite.control.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared';

// Durante lo sviluppo del porting la build esce in public/control-next/ (base /control-next/);
// il cutover (ultimo task del piano) la sposta su /control.
const OUT = process.env.CONTROL_OUT ?? 'control-next';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'control'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5174, proxy: sharedProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
```

- [ ] **Step 4: `control/index.html`** — stessa struttura dell'editor (`<html lang="it" class="dark">`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, title `Anime VTT — Controllo`, `<div id="root">`, `<script src="/shared/media.js">`, `<script src="/shared/shader-effects.js">`, `<script type="module" src="/main.tsx">`). Il `/socket.io` client è già incluso nel bundle (`lib/socket.ts`), niente `<script src="/socket.io/socket.io.js">`.

`control/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ControlApp from '../src/control/ControlApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>
);
```

`src/control/ControlApp.tsx` (placeholder, sostituito dal Task 4):

```tsx
export default function ControlApp() {
  return <div className="p-4 text-sm">Control — in costruzione</div>;
}
```

- [ ] **Step 5: script.** `editor-app/package.json`: `"dev:control": "vite --config vite.control.config.ts"`, `"build:control": "tsc --noEmit && vite build --config vite.control.config.ts"`. Root `package.json`: `"dev:control": "cd editor-app && npm run dev:control"`, `"build:control": "cd editor-app && npm install && npm run build:control"`, `"build:all": "npm run build:editor && npm run build:control"`. `tsconfig.json` include: aggiungere `"control"`, `"vite.shared.ts"`, `"vite.control.config.ts"`.

- [ ] **Step 6: route temporanea** in `server/index.js`, subito dopo la riga `/control`: `app.use('/control-next', express.static(path.join(__dirname, '..', 'public', 'control-next')));`. Commento: `// TEMPORANEA: rimossa al cutover del porting di /control (vedi docs/superpowers/plans/2026-10-11-control-shadcn.md).`

- [ ] **Step 7: loader dei globali per i test.** `media.js` è uno script browser con funzioni top-level e un blocco `module.exports` per `node --test`. Creare `src/test-load-shared.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Carica public/shared/media.js nei globali (come farebbe il <script> classico nel browser).
export function loadSharedGlobals(): void {
  const file = path.resolve(import.meta.dirname, '../../public/shared/media.js');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox: Record<string, unknown> = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  // Le dichiarazioni `function` top-level finiscono sul global del contesto,
  // le `const` solo in module.exports.
  const exported = (sandbox.module as { exports: Record<string, unknown> }).exports;
  for (const k of Object.keys(sandbox)) if (k !== 'module' && k !== 'console') (globalThis as Record<string, unknown>)[k] = sandbox[k];
  Object.assign(globalThis, exported);
}
```

`test-setup.ts`: aggiungere `import { loadSharedGlobals } from './test-load-shared'; loadSharedGlobals();`. Se `vm.runInContext` non espone alcune funzioni (es. non elencate in `module.exports`: `fitRect`, `computeTotalRotation`, `rotatePointToBase`), verificare con un test che esistano come globali e, se mancano, copiarle esplicitamente da `Object.getOwnPropertyNames(sandbox)`.

- [ ] **Step 8: `globals.d.ts`** — aggiungere dichiarazioni per tutto ciò che il control usa: `rotateVector(x,y,deg):[number,number]`, `rotateDirectionToBase`, `snapAoeOrigin(shape,sizeM,widthM,rotation,grid,xPct,yPct,nw,nh):[number,number]`, `aoeOutlinePoints`, `aoeAffectedCells`, `cellRectPercent`, `appendAoeOriginMarker`, `aoeColorHex`, `aoeColorDarkHex`, `polygonClipPath`, `resolveAoeShaderId`, `groupPingPointsByStroke`, costanti `AOE_METERS_PER_CELL`, `AOE_COLOR_CYCLE_NAMES`, `AOE_SHADER_OVERRIDE_DEFAULT_COLOR`, e le classi `PingLayer` (`render(groups: PingPoint[][], lifespanSec: number, zoomScale: number)`), `AoeShaderLayer` (`render(aoes, grid, nw, nh)`). Verificare le firme reali con `grep -n "^function\|^class\|  render(" public/shared/media.js public/shared/shader-effects.js`.

- [ ] **Step 9: verifica.**
Run: `cd editor-app && npm run typecheck && npm test && npm run build:control` → typecheck pulito, test esistenti verdi, `public/control-next/index.html` creato. `git status` non deve mostrare `public/control-next` come ignorato: va committato (build servita dal Raspberry).
Run (da root): `PORT=3100 DATA_DIR=<copia> node server/index.js &` poi aprire `http://localhost:3100/control-next/` nel browser del pannello → vedi "Control — in costruzione", console senza errori, `PingLayer` e `AoeShaderLayer` definiti come globali (`typeof PingLayer`).

- [ ] **Step 10: Commit** — `feat(control): seconda entry Vite, build in public/control-next, globali di test`

---

### Task 2: Librerie pure — preferenze, zoom locale, matematica vista/pan, operazioni AOE

**Files:**
- Create: `editor-app/src/control/lib/prefs.ts`, `local-zoom.ts`, `view-math.ts`, `aoe-ops.ts` e i rispettivi `*.test.ts`; `editor-app/src/control/types.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Aoe`, `LiveView`, `DisplayViewport`, `ControlLocation` (= `Location` estesa con `map.liveView`, `map.aoes`, `map.compass`, `map.shaders`), `ControlState` (= `VttState` + `activeImageId`, `activeAudioTrack`, `audioState`, `displayViewport`).
  - `prefs.ts`: `loadDmGridOpacity(): number`, `saveDmGridOpacity(n)`, `loadDmGridVisible(): boolean`, `saveDmGridVisible(b)`, `loadNudgePos(): {left:number;top:number}|null`, `saveNudgePos(p)`.
  - `local-zoom.ts`: `type LocalZoom = {scale:number;x:number;y:number}`, `ZOOM_LOCAL_MIN=1`, `ZOOM_LOCAL_MAX=5`, `loadLocalZoom()`, `saveLocalZoom(z)`, `clampLocalZoomPan(z, w, h): LocalZoom`, `zoomToRect(rect, w, h): LocalZoom`.
  - `view-math.ts`: `localToScreen(...)`, `screenToLocal(...)`, `computeViewportScreenRect(args): Rect|null`, `panDeltaForDrag(args): {dx:number;dy:number}|null`.
  - `aoe-ops.ts`: `resizePayload(aoe, dSize, dWidth, grid, nw, nh)`, `rotatePayload(aoe, delta, grid, nw, nh)`, `nudgePayload(aoe, dx, dy, loc, nw, nh)` → ognuno ritorna l'oggetto da emettere (senza `locationId`) o `null`; `nextCycleColor(current)`; `aoeShapeLabel(shape)`, `aoeSizeDimensionLabel(shape)`; `formatMeters(n)` (`toLocaleString('it-IT',{minimumFractionDigits:1})`).

- [ ] **Step 1: test `prefs.test.ts`** — con `localStorage` mock (jsdom è l'ambiente dei test componenti; per le lib usare `// @vitest-environment jsdom` in testa al file): valore assente → default (1, true, null); valore corrotto (`"abc"`, JSON rotto) → default; valore fuori range (`5`) → clampato a 1; save+load round-trip; `localStorage` che lancia (spy su `getItem` che `throw`) → default senza eccezione.

- [ ] **Step 2: run → FAIL; implementare `prefs.ts`** portando `control.js:12-33` e `417-443`/`464` (chiavi `dmGridOpacity`, `dmGridVisible`, `aoeNudgeOverlayPos`; `Math.min(1, Math.max(0, n))`; ogni accesso in try/catch; `save*` ignora gli errori).

- [ ] **Step 3: test `local-zoom.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { clampLocalZoomPan, loadLocalZoom, saveLocalZoom, zoomToRect } from './local-zoom';

describe('local-zoom', () => {
  beforeEach(() => localStorage.clear());

  it('load: assente o corrotto → {1,0,0}', () => {
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
    localStorage.setItem('zoomLocalState', '{rotto');
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
    localStorage.setItem('zoomLocalState', JSON.stringify({ scale: 'x', x: 0, y: 0 }));
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('load: scale fuori range viene clampata a [1,5]', () => {
    localStorage.setItem('zoomLocalState', JSON.stringify({ scale: 99, x: 3, y: 4 }));
    expect(loadLocalZoom()).toEqual({ scale: 5, x: 3, y: 4 });
  });
  it('save/load round-trip', () => {
    saveLocalZoom({ scale: 2, x: 10, y: -5 });
    expect(loadLocalZoom()).toEqual({ scale: 2, x: 10, y: -5 });
  });
  it('clamp: il contenuto non esce dal riquadro', () => {
    expect(clampLocalZoomPan({ scale: 2, x: 9999, y: -9999 }, 200, 100)).toEqual({ scale: 2, x: 100, y: -50 });
    expect(clampLocalZoomPan({ scale: 1, x: 50, y: 50 }, 200, 100)).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('zoomToRect: contain, centrato, clampato', () => {
    // riquadro 100x50 al centro di un viewport 200x100 → scala 2, nessuna traslazione
    const z = zoomToRect({ left: 50, top: 25, width: 100, height: 50 }, 200, 100);
    expect(z.scale).toBe(2);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
  });
  it('zoomToRect: rect nullo o con dimensioni 0 → null', () => {
    expect(zoomToRect({ left: 0, top: 0, width: 0, height: 10 }, 200, 100)).toBeNull();
  });
});
```

- [ ] **Step 4: implementare `local-zoom.ts`** portando `control.js:1765-1831` e `1842-1862` (la formula `postScaleX = cx + (rectCenterX - cx) * scale`, `x = cx - postScaleX`, poi clamp). `clampLocalZoomPan(z,w,h)` è **pura** (ritorna un nuovo oggetto: `maxX = w*(scale-1)/2`). `zoomToRect(rect,w,h)` ritorna `LocalZoom|null`.

- [ ] **Step 5: test `view-math.test.ts`** — verifica la **pura inversione**: `screenToLocal(localToScreen(p)) ≈ p` per rotazioni 0/90/180/270 e S/offset non banali; `computeViewportScreenRect` con `displayViewport` 1000×500, mappa 2000×1000 (rotazione 0), `liveView {scale:1, offsetX:0, offsetY:0}`, `mapScale 1`, anteprima 400×200 con `imageRect` = tutto il contenitore → rettangolo = tutto l'anteprima (left 0, top 0, w 400, h 200); con `liveView.scale = 2` → rettangolo metà larghezza/altezza centrato; senza `displayViewport` → `null`; con `naturalW` 0 → `null`. `panDeltaForDrag` con rotazione 0, `S=1`, drag di (10,0) px → `dx = -(10/imageRect.width)*tvFit.width`; con rotazione 180 il segno si inverte.

- [ ] **Step 6: implementare `view-math.ts`** portando **letteralmente** `control.js:1526-1537` (`localToScreen`, `screenToLocal`), `1558-1611` (`computeViewportScreenRect`: stessi 3 passi, stesse formule) e `1726-1754` (`panDeltaForDrag`). Firma consigliata, tutto passato per argomento (niente globali di modulo):

```ts
export interface ViewArgs {
  location: ControlLocation;
  displayViewport: { width: number; height: number } | null;
  naturalW: number; naturalH: number;
  imageRect: Rect | null;
  previewW: number; previewH: number; // mapPreview.clientWidth/Height
}
export function computeViewportScreenRect(a: ViewArgs): Rect | null
export function panDeltaForDrag(a: ViewArgs, dxLocal: number, dyLocal: number): { dx: number; dy: number } | null
```

Usa `rotateVector`, `fitRect`, `computeTotalRotation` dai globali.

- [ ] **Step 7: test `aoe-ops.test.ts`** — con una griglia reale (`{enabled:true, cellSize:50, offsetX:0, offsetY:0, ...}`) e `nw=nh=1000`: `resizePayload(cono 3m, +1.5, 0)` → `sizeM 4.5`, `x,y` uguali a `snapAoeOrigin(...)` ricalcolato; `resizePayload` non scende sotto `AOE_METERS_PER_CELL`; per `shape !== 'line'` `widthM` resta `aoe.widthM`; `rotatePayload(cono, -15)` da `rotation 0` → `345`; `rotatePayload` ri-aggancia con `snapAoeOrigin`; `nudgePayload` con griglia disabilitata → `null`; con mappa ruotata 180° (`flip180`) `nudgePayload(aoe, 0, -1)` sposta `y` **in aumento** (direzione schermo convertita con `rotateDirectionToBase`); `nextCycleColor('purple')` → `'red'` (colore fuori ciclo riparte dal primo); `nextCycleColor('yellow')` → `'red'`; `aoeSizeDimensionLabel('sphere')` → `'Raggio'`; `formatMeters(1.5)` → `'1,5'`.

- [ ] **Step 8: implementare `aoe-ops.ts`** portando `control.js:287-307`, `336-346`, `360-377`, `389-396`, `941-951`. Esempio di forma:

```ts
export function resizePayload(aoe: Aoe, dSize: number, dWidth: number, grid: Grid | undefined, nw: number, nh: number) {
  const sizeM = Math.max(AOE_METERS_PER_CELL, aoe.sizeM + dSize);
  const widthM = aoe.shape === 'line'
    ? Math.max(AOE_METERS_PER_CELL, (aoe.widthM || AOE_METERS_PER_CELL) + dWidth)
    : aoe.widthM;
  const [x, y] = snapAoeOrigin(aoe.shape, sizeM, widthM, aoe.rotation, grid, aoe.x, aoe.y, nw, nh);
  return { aoeId: aoe.id, sizeM, widthM, x, y };
}
```

- [ ] **Step 9: Run** `cd editor-app && npm test` → tutti PASS; `npm run typecheck` pulito.
- [ ] **Step 10: Commit** — `feat(control): librerie pure (prefs, zoom locale, matematica vista, operazioni AOE) con test`

---

### Task 3: Store Zustand e collegamento socket

**Files:**
- Create: `editor-app/src/control/store/control-store.ts`, `control-store.test.ts`, `editor-app/src/control/hooks/use-control-socket.ts`

**Interfaces:**
- Consumes: `lib/prefs.ts`, `lib/local-zoom.ts`, `lib/socket.ts` (`socket`), tipi del Task 2.
- Produces (usati da tutti i task successivi — rispettare i nomi):

```ts
export type Mode = 'pan' | 'fog' | 'ping' | 'zoom' | 'aoe' | null;
export type TabId = 'mappa' | 'fog' | 'immagini';
export interface TelegramFeedback { imageId: string; ok: boolean; error?: string }

interface ControlStore {
  server: ControlState | null;
  socketConnected: boolean;
  displayConnected: boolean;
  previewLocationId: string | null;
  previewImageId: string | null;
  mode: Mode;
  tab: TabId;
  fogOpacity: number;               // 0.45 di default, solo di sessione
  dmGridOpacity: number;            // persistito
  dmGridVisible: boolean;           // persistito
  localZoom: LocalZoom;             // persistito solo su azioni esplicite
  selectedAoeId: string | null;
  aoeShape: 'cone'|'cube'|'sphere'|'line';
  aoeColor: string;                 // 'red'
  aoeSize: number;                  // AOE_METERS_PER_CELL
  aoeWidth: number;                 // AOE_METERS_PER_CELL
  aoeShaderOverride: string | null;
  aoeShaderMenuOpen: boolean;
  telegramPending: boolean;
  telegramFeedback: TelegramFeedback | null;
  geometry: { imageRect: Rect | null; rotation: number; naturalW: number; naturalH: number };

  receiveState(s: ControlState): void;     // risolve previewLocationId/previewImageId/selectedAoeId pendenti
  setConnected(socket: boolean): void;
  setDisplayConnected(b: boolean): void;
  setPreviewLocation(id: string): void;    // azzera zoom locale (non lo storage)
  cancelPreview(): void;
  setPreviewImage(id: string | null): void;
  setMode(m: Exclude<Mode, null>): void;   // toggle; rispetta gating; entrare in pan azzera zoom locale
  forceMode(m: Mode): void;
  setTab(t: TabId): void;
  setFogOpacity(v: number): void;
  setDmGridOpacity(v: number): void;       // salva
  toggleDmGridVisible(): void;             // salva
  setLocalZoom(z: LocalZoom, opts?: { persist?: boolean }): void;
  resetLocalZoom(): void;                  // NON salva
  selectAoe(id: string | null): void;
  patchAoeDefaults(p: Partial<{ shape; color; size; width; shaderOverride }>): void;
  setShaderMenuOpen(b: boolean): void;
  setTelegram(p: { pending?: boolean; feedback?: TelegramFeedback | null }): void;
  setGeometry(g): void;
}

export const selectPreviewLocation: (s: ControlStore) => ControlLocation | undefined;
export const selectActiveLocation: (s: ControlStore) => ControlLocation | undefined;
export const selectIsPreviewing: (s: ControlStore) => boolean;       // previewLocationId !== activeLocationId
export const selectShowingImage: (s: ControlStore) => boolean;       // Boolean(server.activeImageId)
export const selectPingAvailable: (s: ControlStore) => boolean;      // !isPreviewing && !showingImage && activeLocationId
export const selectAoeAvailable: (s: ControlStore) => boolean;       // pingAvailable && preview.map.file
export const selectSelectedAoe: (s: ControlStore) => Aoe | undefined;
```

- [ ] **Step 1: test `control-store.test.ts`** (ambiente jsdom). Casi: (a) `receiveState` con `previewLocationId` nullo → diventa `activeLocationId`; (b) con `previewLocationId` di una location archiviata/cancellata → ripiega su `activeLocationId`; (c) `previewImageId` che non esiste più nella location attiva → `null`; (d) `selectedAoeId` che non esiste più nell'anteprima → `null`; (e) `setMode('ping')` con `selectPingAvailable` falso → resta `null`; (f) `setMode('pan')` due volte → torna `null` (toggle); (g) entrare in `pan` da `zoom` azzera `localZoom` ma NON `localStorage.zoomLocalState`; (h) `receiveState` con un'immagine mostrata (`activeImageId`) mentre `mode==='ping'` → `mode` diventa `null` (gating transitorio, come `control.js:642-650`); (i) `selectAoe` con id diverso da quello selezionato non è osservabile qui (l'arma-conferma vive nel componente) — solo set/get; (j) `setPreviewLocation` azzera `localZoom`.

- [ ] **Step 2: run → FAIL; implementare lo store** (Zustand+Immer come `editor-store.ts`). Logica di `receiveState` da `control.js:618-650`; `setMode` da `1676-1700` (ma senza i render: li fa React). `localZoom` iniziale = `loadLocalZoom()`, `dmGridOpacity`/`dmGridVisible` iniziali da `prefs`. `setLocalZoom(z,{persist:true})` salva; `resetLocalZoom()` imposta `{1,0,0}` senza salvare.

- [ ] **Step 3: `use-control-socket.ts`** — un hook chiamato una volta da `ControlApp` che registra i listener (`connect` → `socketConnected=true` + `socket.emit('hello',{role:'control'})`; `disconnect` → `socketConnected=false`, `telegramPending=false`, `telegramFeedback=null`; `display:status` → `setDisplayConnected`; `state:update` → `receiveState`; `telegram:sendResult` → `setTelegram({pending:false, feedback})` + timeout 4 s che azzera il feedback; **`ping:show` non qui**: lo gestisce il Task 8). Se il socket è già connesso al mount (StrictMode/HMR) emettere comunque `hello`. Cleanup con `socket.off`. Porta `control.js:477-527`.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Commit** — `feat(control): store Zustand e collegamento socket`

---

### Task 4: Shell — StatusBar, banner, tab bar, layout mobile

**Files:**
- Create: `editor-app/src/control/shell/StatusBar.tsx`, `Banners.tsx`, `TabBar.tsx`, `editor-app/src/control/control.css`
- Modify: `editor-app/src/control/ControlApp.tsx`, `editor-app/control/main.tsx` (import `control.css`)

**Interfaces:**
- Consumes: store del Task 3.
- Produces: `ControlApp` con tre pannelli (`mappa`, `fog`, `immagini`) tenuti montati con `Tabs`/`TabsContent forceMount` e `data-[state=inactive]:hidden`; slot `<MapTab />`, `<FogTab />`, `<ImagesTab />` (importati dai task successivi; per ora placeholder `<div data-testid="…"/>`).

- [ ] **Step 1: test `ControlApp.test.tsx`** (jsdom): con `useControlStore.setState({ server: fixture })` e `socket` mockato (`vi.mock('@/lib/socket')`): (a) con `server=null` rende lo shell senza eccezioni (select vuota "— nessuna location —"); (b) la select elenca solo location non archiviate e il valore è `previewLocationId`; (c) scegliere un'altra location chiama `setPreviewLocation` e mostra il banner "Anteprima: … — non visibile ai giocatori" con i pulsanti "Invia al display" (emit `location:set {locationId}`) e "Annulla anteprima"; (d) con `activeImageId` valido compare "Stai mostrando X ai giocatori"; (e) la tab "Immagini" è `disabled` mentre si è in anteprima, e se la tab attiva era `immagini` torna a `mappa`; (f) pallino wifi: classe `ok` solo se `socketConnected && displayConnected`.

- [ ] **Step 2: implementare.** Layout: colonna a tutta altezza (`h-dvh flex flex-col`), `StatusBar` in alto (wifi dot SVG da `index.html:57-59` + shadcn `Select` per la location), banner, contenuto scrollabile, `TabBar` fissa in basso (`pb-[env(safe-area-inset-bottom)]`) con le tre voci e le stesse icone (`i-map`, `i-fog`, `i-image` → componenti `lucide-react` equivalenti: `Map`, `Layers`/`CloudFog`, `Image`). Su schermi larghi (`md:`) la tab Mappa resta sempre visibile (come `control.css` ~media query) — leggere la media query in `public/control/control.css` e riprodurre la stessa soglia. Usare i token di tema esistenti (`bg-card`, `text-muted-foreground`…), nessun colore hard-coded tranne quelli già in `control.css` per il pallino wifi.

- [ ] **Step 3: `control.css`** — solo le regole che Tailwind non esprime comodamente: `touch-action`, `.mode-*` sul preview (Task 6), canvas sovrapposti (`.shader-layer`, `.ping-layer`: `position:absolute; inset:0; width:100%; height:100%; pointer-events:none`), `.fit-box`, `.media-wrap`. Copiare da `public/control/control.css` solo le regole di layer della mappa (cercare `.fit-box`, `.media-wrap`, `.map-preview`, `.fog-layer`, `.grid-layer`, `.aoe-svg`, `#viewport-rect`, `.map-compass-marker`), adattando gli id a classi.

- [ ] **Step 4: run test → PASS; verifica browser** su `http://localhost:3100/control-next/` (server di prova su copia dati): select location, banner, cambio tab, nessun errore console. **Commit** — `feat(control): shell con status bar, banner e tab bar`

---

### Task 5: MapPreview — media, layer, griglia, fog, bussola, riquadro giallo, zoom locale (render)

**Files:**
- Create: `editor-app/src/control/map/MapPreview.tsx`, `FogOverlays.tsx`, `CompassMarker.tsx`, `ViewportRect.tsx`, `editor-app/src/control/hooks/use-map-geometry.ts`

**Interfaces:**
- Consumes: store; `view-math.computeViewportScreenRect`; globali `loadMapMedia`, `layoutMapWrap`, `positionFitBox`, `fitRect`, `renderGridSvg`, `mediaW/H`, `polygonClipPath`.
- Produces: `MapPreview` che espone, tramite un modulo `map/map-refs.ts` (`export const mapRefs = { preview: null as HTMLDivElement|null, fitBox: null as HTMLDivElement|null, media: null as MapMedia|null }`), i nodi per i gesti e per il loop; `useMapGeometry()` che scrive `geometry` nello store e **ricalcola** a: cambio location/file, resize finestra, cambio tab (il preview passa da `display:none` a visibile), `scale/flip180/rotate90`. Nell'albero DOM, **stessa gerarchia di layer di oggi** (`index.html:96-124`): `#map-preview` > `#map-local-zoom-wrap` > `.media-wrap` > `.fit-box` > [img, video, placeholder, canvas Portale, `.fog-layer`, svg griglia, canvas AOE shader, svg AOE, canvas ping]; poi `#viewport-rect` e `#map-compass-marker` fratelli di `#map-local-zoom-wrap`.

- [ ] **Step 1: test `use-map-geometry` / `MapPreview.test.tsx`** (jsdom, `loadMapMedia` stubbato): con location senza `map.file` mostra il placeholder e imposta `geometry.imageRect` = rettangolo pieno senza eccezioni (`mediaW` = 0); `FogOverlays` rende un `<button class="fog-overlay">` per poligono con `style.clipPath = polygonClipPath(points)` e `opacity` = `fogOpacity` (nascosto) o `1` (rivelato); `CompassMarker`: nascosto se `compass.visible` falso o se `activeImageId`; in modalità `pan` ha classe `pinned` e niente `left/top`; altrove `left/top` in `%` e `transform: translate(-50%,-50%) rotate(Ndeg)` (`control.js:1647-1665`); `ViewportRect`: visibile solo se `mode==='pan'` e `computeViewportScreenRect` non nullo.

- [ ] **Step 2: implementare `MapPreview`** portando `renderMapPreview` (`control.js:1094-1147`: `--map-aspect` dalle dimensioni **post-rotazione**, `layoutMapWrap`, `fitRect`, `positionFitBox`, `renderFogOverlays`, `renderGrid`, `shaderLayer.render` iniziale). Differenze volute: non ci sono più render imperativi su `state:update` — i sotto-componenti reagiscono allo store; la **griglia** si ridisegna con un `useEffect` su `[location.map.grid, dmGridOpacity, dmGridVisible, localZoom.scale, geometry]` chiamando `renderGridSvg(svg, {...grid, lineWidth: (grid.lineWidth||0.3)/Math.max(localZoom.scale,0.01), enabled: grid.enabled && dmGridVisible, opacity: dmGridOpacity}, nw, nh)` (`control.js:984-1007`). Il transform dello zoom locale si applica **via ref**, non con stato React ad alta frequenza: `useLayoutEffect` che osserva `localZoom` e imposta `wrap.style.transform = (scale===1 && !x && !y) ? '' : \`translate(${x}px, ${y}px) scale(${scale})\`` (`control.js:1802-1806`). Ripristino zoom da localStorage: applicare `clampLocalZoomPan` **una sola volta**, alla prima `geometry` con `previewW>0` (`applyRestoredLocalZoomOnce`, `control.js:1086-1092`), via `setLocalZoom(clamped,{persist:false})`.

- [ ] **Step 3: re-misurazione.** `useMapGeometry` ascolta `window resize`, `store.tab` (via `useEffect` su `tab`) e un `ResizeObserver` su `#map-preview`. Il ricalcolo avviene in `requestAnimationFrame` per evitare layout trashing.

- [ ] **Step 4: Run** `npm test && npm run typecheck`; verifica browser (copia dati): mappa con file visibile, griglia, fog a opacità 0.45, bussola nella posizione `%` corretta, **nessun** riquadro giallo (modalità non ancora attivabile). **Commit** — `feat(control): MapPreview con media, griglia, fog, bussola e riquadro vista`

---

### Task 6: Pulsanti modalità e gesti — pan, tocco fog, zoom locale

**Files:**
- Create: `editor-app/src/control/map/ModeToggles.tsx`, `use-pan-gesture.ts`, `use-fog-tap.ts`, `use-local-zoom-gesture.ts`, `map-gestures.test.tsx`
- Modify: `MapPreview.tsx` (monta `ModeToggles` e gli hook), `control.css` (`.mode-*` + `touch-action`)

**Interfaces:**
- Consumes: store, `view-math.panDeltaForDrag`, `local-zoom.clampLocalZoomPan`, `mapRefs`.
- Produces: `ModeToggles` (5 pulsanti `Button` icon con `aria-pressed`, `title` identici a `index.html:73-90`; `ping` e `aoe` `disabled` secondo `selectPingAvailable` / `selectAoeAvailable`); hook `usePanGesture()`, `useFogTap()`, `useLocalZoomGesture()` da chiamare in `MapPreview`.

- [ ] **Step 1: test `map-gestures.test.tsx`** (jsdom; `socket.emit` mockato; `getBoundingClientRect`/`clientWidth` stubbati). Casi: (a) `mode='fog'`: un click su `.fog-overlay[data-id=P]` emette `fow:toggle {locationId: previewLocationId, polygonId:'P'}`; in altra modalità non emette; (b) `mode='pan'`: pointerdown→pointermove(+10,0)→pointerup emette `view:pan` con `dx`,`dy` uguali a `panDeltaForDrag`; un pointerdown che parte da `#map-mode-toggles` **non** avvia il drag e **non** cattura il puntatore (`control.js:1714`); senza `displayViewport` non emette nulla ma non lancia; (c) `mode='zoom'`: due puntatori che si allontanano (distanza ×2) portano `localZoom.scale` da 1 a 2, clampato a `[1,5]`; a fine gesto (ultimo `pointerup`) `localStorage.zoomLocalState` è salvato; con `scale===1` un drag singolo non cambia `x,y`; la rotellina (`wheel` con `deltaY<0`) fa +0.1 e `preventDefault` è chiamato (listener `{passive:false}`) e salva; (d) **cambio modalità a metà gesto** (`forceMode(null)` durante un drag di pan) non lascia stato appeso: un successivo pointermove senza pointerdown non emette; (e) un `state:update` remoto durante il drag non azzera il gesto.

- [ ] **Step 2: run → FAIL; implementare** i tre hook con **listener nativi** attaccati a `mapRefs.preview` in `useEffect` (cleanup completo), leggendo sempre `useControlStore.getState()` (nessuna closure sullo stato). Portare: `control.js:1170-1174` (fog tap; usare delegation su `.fog-layer`, listener `click`), `1709-1757` (pan: `setPointerCapture`, `panDrag` come variabile di modulo/`useRef`, mai in stato React), `1868-1940` (zoom: `Map` di puntatori, distanza di pinch iniziale, `clamp` con `clampLocalZoomPan(z, preview.clientWidth, preview.clientHeight)`, `saveLocalZoom` solo a fine gesto/rotellina, `classList.toggle('zoom-dragging')` come nel CSS originale). Durante il gesto lo store si aggiorna con `setLocalZoom(z,{persist:false})`; il transform viene applicato dal `useLayoutEffect` del Task 5.

- [ ] **Step 3: CSS.** In `control.css` riprodurre `public/control/control.css:737-775` (cursori per modalità e `touch-action:none` su preview/figli in pan/ping/zoom/aoe; `touch-action:manipulation` sui pulsanti, riga 1121). Applicare le classi `mode-pan|fog|ping|zoom|aoe` e `zoom-dragging` sull'elemento `#map-preview` con `useEffect` su `mode`.

- [ ] **Step 4: Run** test → PASS. Verifica browser con **emulazione mobile** (`resize_window` preset mobile): selezionare Pan/Fog/Zoom, trascinamento, pinch simulato non verificabile a mano → annotarlo nel report. **Commit** — `feat(control): pulsanti modalità e gesti di pan, fog e zoom locale`

---

### Task 7: Box sotto la mappa — Pan, Fog, Zoom, Ping(bussola)

**Files:**
- Create: `editor-app/src/control/boxes/PanBox.tsx`, `FogBox.tsx`, `ZoomBox.tsx`, `PingBox.tsx`, `boxes.test.tsx`, `editor-app/src/control/components/Stepper.tsx`
- Modify: `MapTab` (compone preview + box) — creare `editor-app/src/control/map/MapTab.tsx` e importarlo in `ControlApp`

**Interfaces:**
- Produces: `Stepper` (`{label?: string; value: string; onDec(): void; onInc(): void; decTitle: string; incTitle: string}`) → `[−] valore [+]` come i `.zoom` di `index.html`. `MapTab` = `ModeToggles` + `MapPreview` + **un solo** box in base a `mode` (e `AoePanel`/`AudioBox` quando previsti dai task successivi).

- [ ] **Step 1: test `boxes.test.tsx`.** Casi (assert su `socket.emit` e sullo store, testi italiani): 
  - `PanBox` visibile solo se `mode==='pan'` e non (`showingImage && !isPreviewing`); pad `▲◀▶▼`: emette `view:pan {locationId, dx: dxDir*step, dy: dyDir*step}` con `step = 20/Math.max(scale,0.01)` e `scale = liveView.scale||1` (`control.js:1442-1450`); `+`/`−`/`⟳` emettono `view:zoom {scale}` (clamp `[0.2,4]`, passo 0.2, arrotondato a 1 decimale) e `view:reset`; righe griglia compaiono **solo** se `grid.enabled`: "Griglia (giocatori)" emette `grid:update {opacity}` (passo 0.1, clamp 0–1), "Griglia (tu)" cambia `dmGridOpacity` e **non** emette nulla, toggle occhio cambia `dmGridVisible` (icona `Eye`/`EyeOff`) e persiste.
  - `FogBox` visibile solo con `mode==='fog'`: opacità `±0.1` clamp 0–1 round a 1 decimale, riga "Rivelate" `x/y` + barra `scaleX(x/y)` **nascosta** con 0 poligoni.
  - `ZoomBox` solo con `mode==='zoom'`: il pulsante "Zooma sull'area dei PG" calcola `zoomToRect(computeViewportScreenRect(...))`, imposta lo zoom e **persiste**; se il rect è `null` non cambia nulla.
  - `PingBox` solo con `mode==='ping'`: toggle "Visibile" emette `compass:update {locationId, visible: !visible}`; nudge emette `{x,y}` clampati 0–100 con passo 2; `↻` emette `rotation` +90 modulo 360.
- [ ] **Step 2: implementare** portando `control.js:1009-1077` (visibilità), `1362-1368`, `1442-1485`, `1950-1975`, `1945-1948`. Usare `Button`, `Card`-like con classi Tailwind; i box non usano `display:none` ma non vengono renderizzati (non hanno stato interno da conservare) **tranne** `ZoomBox`/`PingBox` se servono ref — in tal caso `hidden`.
- [ ] **Step 3: Run** test → PASS; verifica browser: ogni modalità mostra il proprio box e solo quello. **Commit** — `feat(control): box Pan, Fog, Zoom e Rosa dei venti`

---

### Task 8: Ping — gesto, PingLayer, loop di rendering condiviso (Portale + AOE + ping)

**Files:**
- Create: `editor-app/src/control/hooks/use-shader-loop.ts`, `editor-app/src/control/map/use-ping-gesture.ts`, `editor-app/src/control/lib/ping.ts`, `ping.test.ts`
- Modify: `use-control-socket.ts` (listener `ping:show`), `MapPreview.tsx`

**Interfaces:**
- Produces: `lib/ping.ts`: `PING_LIFESPAN_SEC = 1.2`, `PING_MIN_POINT_DIST_PCT = 1.5`, `newPingStrokeId(): string`, `class PingBuffer { push(pt); prune(nowMs): PingPoint[]; clear(); get size(); toGroups(nowMs): PingPoint[][] }` (usa `groupPingPointsByStroke` dal globale).
- `useShaderLoop()`: monta `ShaderLayer`, `AoeShaderLayer`, `PingLayer` sui tre canvas **una volta** (`new PingLayer(canvas)` ecc. in `useEffect`, dispose al cleanup), esegue un solo `requestAnimationFrame` che gira **solo se** c'è qualcosa da disegnare (decorazioni shader, AOE con `cast`, ping vivi) — porta `control.js:2001-2046` e `kickShaderLoop` con un `store.subscribe` come in `editor-app/src/stage/use-shader-loop.ts`. Esporta `kickShaderLoop()` per il ping.

- [ ] **Step 1: test `ping.test.ts`**: `PingBuffer.prune` rimuove i punti con età ≥ 1.2 s; `toGroups` separa due `strokeId` diversi in due gruppi anche se temporalmente vicini (regressione: due tap ravvicinati restano due sonar); `clear()` svuota; stessa `strokeId` → un gruppo.
- [ ] **Step 2: implementare `ping.ts`** portando `control.js:563-594`, `1203-1215`. 
- [ ] **Step 3: `use-ping-gesture.ts`** (listener nativi sul `fitBox`): pointerdown (solo se `mode==='ping'` e `selectPingAvailable`): coordinate via `rotatePointToBase` come `pingLocalCoords` (`control.js:1190-1201`), nuovo `strokeId`, `socket.emit('ping:show',{locationId:previewLocationId,x,y,strokeId})`, `setPointerCapture`; pointermove: emette solo se distanza ≥ 1.5 % dall'ultimo punto; pointerup/cancel azzera il drag. Il **punto locale** non viene aggiunto qui: arriva dall'eco `ping:show` del server (`control.js:508-517`) → nel listener socket (`use-control-socket.ts`) `pingBuffer.push({x,y,t:performance.now(),strokeId})` + `kickShaderLoop()`.
- [ ] **Step 4: `useShaderLoop`**: ad ogni frame replicare `stepShaderLayer` (`control.js:2009-2032`): `shaderLayer.render(shaders, grid, nw, nh)`, `aoeShaderLayer.render(castAoes.map(a=>({...a, shaderId: resolveAoeShaderId(a)})), grid, nw, nh)`, `pingLayer.render(buffer.toGroups(now), PING_LIFESPAN_SEC, localZoom.scale)`; poi continuare solo se serve. Pulizia canvas quando non ci sono più shader (bug T16 dell'editor: canvas con pixel fantasma). `clearPing()` quando cambia `previewLocationId` o compare un'immagine (`control.js:630-637`).
- [ ] **Step 5: Run** test → PASS; verifica browser: tap in modalità ping disegna il sonar sul proprio preview (eco del server), trascinamento disegna la scia, due tap ravvicinati sono due sonar (tutto su porta 3100, mai su display reale). **Commit** — `feat(control): ping con scia e loop di rendering condiviso`

---

### Task 9: AOE — overlay SVG e gesti di piazzamento/trascinamento

**Files:**
- Create: `editor-app/src/control/map/AoeOverlays.tsx`, `use-aoe-gesture.ts`, `aoe/constants.ts`, `aoe-gesture.test.tsx`
- Modify: `MapPreview.tsx`

**Interfaces:**
- Produces: `AOE_CELL_FILL_OPACITY = 0.35`; `AoeOverlays` (renderizza dentro `#map-aoe-svg` con React o, più semplice e fedele, con un `useLayoutEffect` che ricostruisce i figli via `document.createElementNS` — scegliere l'opzione imperativa se riduce il rischio di divergenza; NON usare `dangerouslySetInnerHTML`); `useAoeGesture()`.

- [ ] **Step 1: test `aoe-gesture.test.tsx`** (jsdom, `snapAoeOrigin` reale dai globali): (a) pointerdown+pointerup entro 8 px su area vuota in `mode='aoe'` emette `aoe:place {locationId, shape, color, shaderOverride, sizeM, widthM, x, y}` con `widthM` definito solo per `line` e `x,y` = `snapAoeOrigin(...)` sulle coordinate base (`rotatePointToBase`); (b) tap con spostamento > 8 px non piazza nulla; (c) pointerdown su `.aoe-shape-overlay[data-id=A]` seleziona l'area (`selectedAoeId`) e il drag emette `aoe:move {aoeId,x,y}` accumulando il delta dall'ultimo punto (`targetX/targetY` non agganciati) — un movimento sub-cella accumulato a più eventi alla fine sposta; (d) `mode!=='aoe'` o AOE non disponibile (`!selectAoeAvailable`) → nessun emit e il drag in corso viene scartato; (e) **remote `state:update` durante il drag** non azzera `aoeDrag`; (f) `pointercancel` pulisce sia drag sia place-start.
  Per `AoeOverlays` (test su DOM): per un'area `cast:false` → contorno `stroke = aoeColorDarkHex`, celle `fill-opacity 0.35`; con `cast:true` il contorno ha `stroke="none"` ma le celle restano; `shapeVisible:false` ha lo stesso effetto del cast sul contorno; l'area selezionata ha classe `selected` e `stroke-width 3/zoom`, altrimenti `2/zoom`, con `zoom = Math.max(localZoom.scale, 0.01)`; marker origine via `appendAoeOriginMarker` con stroke coerente.
- [ ] **Step 2: implementare** portando `control.js:831-900` (overlay; ridisegno a ogni cambio di `aoes`, `grid`, `geometry`, `localZoom.scale`) e `1246-1360` (gesti; usa `localPointFromEvent` = `pingLocalCoords`, quindi estrarre una funzione condivisa `eventToBasePoint(e)` in `map/map-refs.ts` usata anche dal ping). La selezione cambia con `selectAoe(id)`; azzerare l'arma-conferma è responsabilità di `AoeChipList` (Task 10).
- [ ] **Step 3: Run** test → PASS; verifica browser: piazzare e trascinare un cono con snap; con rotazione 90° della mappa il piazzamento resta sotto il dito. **Commit** — `feat(control): overlay AOE e gesti di piazzamento/trascinamento`

---

### Task 10: AoePanel — forme, colori, menu "···", taglia/larghezza, lista aree

**Files:**
- Create: `editor-app/src/control/aoe/AoePanel.tsx`, `AoeChipList.tsx`, `aoe-panel.test.tsx`
- Modify: `MapTab.tsx` (monta `AoePanel` quando `mode==='aoe'`)

**Interfaces:**
- Consumes: `aoe-ops` (`resizePayload`, `aoeShapeLabel`, `aoeSizeDimensionLabel`, `formatMeters`), `useArmConfirm`, store.
- Produces: `AoePanel` (nasconde forme e mostra "Modifica: Cono 3,0m" se c'è un'area selezionata, come `control.js:187-218`).

- [ ] **Step 1: test `aoe-panel.test.tsx`** — casi che pinnano le decisioni di CLAUDE.md:
  1. Nessuna area selezionata: click su "Cubo" cambia solo `aoeShape` nello store, nessun emit; le 4 swatch (rosso, verde, bianco, giallo) mostrano `--aoe-color = aoeColorHex(name)`.
  2. Area selezionata: la barra forme è nascosta, l'etichetta "Modifica: …" visibile, **cliccare un colore** emette `aoe:setColor` e, **se** `shaderOverride` è attivo, anche `aoe:setShaderOverride {shaderOverride:null}` (`control.js:234-248`).
  3. Menu "···": click apre/chiude `aoeShaderMenuOpen`; scegliere una voce con area selezionata emette `aoe:setShaderOverride {next}` e, se `next`, `aoe:setColor {AOE_SHADER_OVERRIDE_DEFAULT_COLOR[slug]}`; **riscegliere la stessa voce** → `next=null` e **nessun** `aoe:setColor`; senza area selezionata aggiorna `aoeShaderOverride`/`aoeColor` di default; il menu si chiude dopo la scelta; il pulsante "···" è `active` quando c'è un override.
  4. Taglia: `−`/`+` senza selezione cambiano `aoeSize` di ±1.5 (minimo 1.5); con selezione emettono `aoe:resize` con il payload di `resizePayload`; riga larghezza visibile **solo** per `line`; etichetta "Raggio: 3,0 m" per sfera.
  5. Lista: pillole `"Cono 3,0m"`; click sulla pillola seleziona/deseleziona; click sulla ✕ **arma** (testo/titolo "Tocca di nuovo per confermare", classe `confirm`) e il **secondo** click entro 2,5 s emette `aoe:remove {locationId,aoeId}`; scaduti 2,5 s (fake timers) torna disarmato; cambiare selezione disarma. Il secondo click funziona sul bottone **corrente** del DOM (ri-interrogato dopo il rerender).
  6. Fulmine per pillola (layout A): emette `aoe:setCast {aoeId, cast: !cast}`.
- [ ] **Step 2: implementare** portando `control.js:158-325`, `799-817`, `953-973`, `1375-1399`. Costanti in `aoe/constants.ts`: `AOE_SHAPES`, `AOE_COLOR_BUTTONS = ['red','green','white','yellow']`, `AOE_SHADER_MENU = [{slug:'web_area',label:'Zona ragnatela',icon:Globe}, {slug:'circular_smoke',label:'Fumo circolare',icon:Cloud}, {slug:'purple_fire',label:'Viola Cornelia',icon:...}]` con le stesse icone SVG di `index.html` (le definizioni `<symbol>` `i-web`, `i-smoke`, `i-wizard-hat`, `i-shape-*`, `i-bolt` vanno portate come piccoli componenti SVG in `aoe/icons.tsx`, perché non esiste equivalente lucide per `wizard-hat`). Menu "···" **inline** sotto la color bar (mai overlay).
- [ ] **Step 3: Run** test → PASS; verifica browser (piazza due aree, cambia colore/override, doppio click elimina). **Commit** — `feat(control): pannello AOE con forme, colori, menu shader e lista aree`

---

### Task 11: AoeNudgePad flottante

**Files:**
- Create: `editor-app/src/control/aoe/AoeNudgePad.tsx`, `aoe-nudge-pad.test.tsx`
- Modify: `ControlApp.tsx` (montato a livello radice, `position:fixed`)

**Interfaces:**
- Consumes: `aoe-ops` (`rotatePayload`, `nudgePayload`, `resizePayload`, `nextCycleColor`), `prefs.loadNudgePos/saveNudgePos`.

- [ ] **Step 1: test.** Visibile solo se `mode==='aoe'` **e** c'è un'area selezionata. Griglia 4×3 identica a `index.html:315-336` (ordine: ↺ ▲ ↻ / ◀ colore ▶ / + ▼ − / larghezza+ ✥ larghezza− / FIRE). Frecce `disabled` senza `grid.enabled`; ↺/↻ `disabled` se forma non `cone`/`line`; larghezza ± `disabled` se non `line`; ↺/↻ emettono `aoe:rotate` con ∓15; frecce → `aoe:move` con `nudgePayload`; "colore" emette `aoe:setColor {nextCycleColor}` e mostra lo sfondo `aoeColorHex(color)`; FIRE emette `aoe:setCast` e diventa "UN-FIRE" (classe `active`, titolo "Interrompi incantesimo") quando `cast`. Drag della maniglia: pointerdown/move/up con `setPointerCapture` sulla maniglia; la posizione è clampata nel viewport (`clamp(left,0,innerWidth-w)`, default w=160,h=210), salvata in `aoeNudgeOverlayPos` solo a fine drag; **la posizione salvata si applica una volta sola** alla prima comparsa e mai durante un drag in corso (`control.js:908-921`).
- [ ] **Step 2: implementare** portando `control.js:340-469`, `902-939`. La posizione è tenuta in un `ref` + style imperativo (non stato React) durante il drag. CSS: copiare `.aoe-nudge-overlay` da `control.css:577-640` (`position:fixed; right/bottom` di default, `touch-action:none` sulla maniglia).
- [ ] **Step 3: Run** test → PASS; browser: il pad compare in AOE con area selezionata, si trascina e sopravvive a reload. **Commit** — `feat(control): pad di nudge AOE flottante`

---

### Task 12: Tab Fog

**Files:**
- Create: `editor-app/src/control/tabs/FogTab.tsx`, `fog-tab.test.tsx`

- [ ] **Step 1: test.** Elenca i poligoni dell'anteprima (`previewLocation.map.polygons`) come righe con nome e stato "rivelata"/"nascosta" (classe `revealed`); click riga emette `fow:toggle {locationId: previewLocationId, polygonId}`; "Nascondi tutto" emette `fow:setAll {locationId, revealed:false}`; "Rivela tutto" è **arma-poi-conferma**: primo click cambia testo in "Click di nuovo per confermare" (classe `confirm`), secondo entro 2,5 s emette `fow:setAll {revealed:true}`, a timeout torna "Rivela tutto"; senza `previewLocationId` nessuna emissione; lista vuota non lancia. Testo guida "Tocca una zona per rivelarla o nasconderla."
- [ ] **Step 2: implementare** portando `control.js:684-693`, `1370-1373`, `1489-1518` e `index.html:261-269`.
- [ ] **Step 3: Run** test → PASS. **Commit** — `feat(control): tab Fog`

---

### Task 13: Tab Immagini e box Audio

**Files:**
- Create: `editor-app/src/control/tabs/ImagesTab.tsx`, `editor-app/src/control/boxes/AudioBox.tsx`, `images-audio.test.tsx`
- Modify: `MapTab.tsx` (monta `AudioBox` in coda al tab Mappa)

**Interfaces:**
- Consumes: `useTelegramDestinations()` (già nell'editor, riusarlo), store `telegramPending/feedback`.

- [ ] **Step 1: test `images-audio.test.tsx`.** 
  **Immagini:** miniature della location **attiva** (non dell'anteprima: `control.js:695`), classe `active` se `activeImageId===id`, `selected` se `previewImageId===id`; testo "nessuna immagine per questa location" se vuota; il dettaglio compare solo con un'immagine selezionata: didascalia (emit `image:caption {locationId: activeLocationId, imageId, caption}` **al commit** — `change`/blur, non a ogni tasto, e **non se non modificata**), select destinazione (`image:destination {…, destination: value||null}`; "Caricamento…" se `null`, "Destinazioni non disponibili" e `disabled` se lista vuota, "— scegli destinazione —" come primo valore), "Mostra" (`image:show {imageId}`, classe `is-live` se è quella mostrata), "Ritorna alla mappa" (`image:hide`, `disabled` se `!activeImageId`), "Invia" (`image:sendTelegram {locationId: activeLocationId, imageId}`, `disabled` senza destinazione o con invio in corso, testo "Invio…" in corso, imposta `telegramPending` e azzera il feedback); feedback "Inviata ✓" / errore (classe `error`) solo per l'immagine corrente. Se `previewImageId` non è più nella location → `null` (già nello store).
  **Audio:** sezione nascosta senza tracce (`main.file`/`special.file` assenti); riga "Traccia speciale" solo con `special.file` (emit `audio:playSpecial {}`); gruppo playback solo se la traccia attiva `state.activeAudioTrack` ha `file`; etichetta "Speciale"/"Principale"; Play/Pausa emette `audio:pause` se `audioState==='playing'` altrimenti `audio:play` (icona e classe `active` coerenti); Stop `audio:stop {}`; volume ±0.1 clamp 0–1 con default 0.7 emette `audio:volume {volume}`; **audio riflette la location ATTIVA, non l'anteprima**.
- [ ] **Step 2: implementare** portando `control.js:695-707`, `714-731`, `738-781`, `1401-1440`, `1977-1999` e `index.html:206-250`, `271-293`. Usare `CommitInput` dell'editor per la didascalia se compatibile (commit su blur/Invio, niente commit di valore invariato); altrimenti `Input` + stato locale con `dirty`.
- [ ] **Step 3: Run** test → PASS; browser: apri tab Immagini, mostra/nascondi (**solo su copia dati**, mai su display reale), nessuna chiamata Telegram vera: **non cliccare "Invia"** con destinazioni configurate; verificare solo lo stato `disabled`. **Commit** — `feat(control): tab Immagini e box Audio`

---

### Task 14: Verifica di parità in browser e correzioni

**Files:** modifiche mirate dove emergono difetti; report in `docs/superpowers/plans/2026-10-11-control-shadcn-parity.md` (checklist con esito).

- [ ] **Step 1: ambiente.** Copia dati in directory temporanea (`cp -r data /tmp/<dir>` e relativo `DATA_DIR` se supportato dal server — verificare `grep -n "DATA_DIR\|state.json" server/state.js`), server su porta 3100, **mai** `3000`. Verificare con `curl` che nessun `/display` reale sia collegato alla 3100.
- [ ] **Step 2: checklist** (esito OK/KO per voce, screenshot solo dove serve): shell (select, banner anteprima e mostrando, wifi, tab); mappa (immagine e video, placeholder senza file, rotazione 90/180, griglia, bussola nelle due posizioni); pan (trascinamento, pad, zoom ±, reset, griglia 3 controlli, riquadro giallo solo in pan); fog (tap su zona, opacità, progresso, tab, bulk con conferma); ping (tap sonar, drag scia, due tap = due sonar, bussola nel box); zoom (pinch/rotellina, bottone "Zooma sull'area dei PG", persistenza dopo reload, mai riquadro giallo, entrare in pan azzera); AOE (4 forme, snap, trascinamento, colori, override ··· e mutua esclusione, taglia/larghezza, elimina doppio click, fulmine, pad e posizione persistente, contorno nascosto a cast ma celle visibili); immagini; audio; stato `null`/zero location; `state:update` remoto durante gesto (due tab sulla 3100); **console senza errori/warning** su tutto.
- [ ] **Step 3: elementi non verificabili a mano** (pinch reale su touch, color picker) → elencarli esplicitamente nel report.
- [ ] **Step 4: correggere** ogni KO con test di regressione dove sensato, commit separati `fix(control): …`.
- [ ] **Step 5: Run** `npm test && npm run typecheck && node --test public/shared/media.test.js` (da root) → tutto verde. **Commit** del report — `docs(control): report di parità`

---

### Task 15: Cutover, build finale e documentazione

**Files:**
- Modify: `editor-app/vite.control.config.ts` (default `OUT='control'`), `server/index.js` (rimuove la route `/control-next`), `package.json`/`.gitignore` se servono, `CLAUDE.md`
- Delete: `public/control/control.js`, `public/control/control.css`, vecchio `public/control/index.html` (sostituito dalla build), `public/control-next/`

- [ ] **Step 1:** impostare `OUT` di default a `control` in `vite.control.config.ts` (base `/control/`, `outDir ../public/control`), rimuovere la route `/control-next` da `server/index.js` (`git diff main -- server/index.js` deve risultare vuoto), `git rm -r public/control-next`, `npm run build:control` → `public/control/index.html` + `assets/*` (i vecchi `control.js`/`control.css` spariscono con `emptyOutDir`; verificare con `git status`).
- [ ] **Step 2:** `CLAUDE.md`: nuova sezione "Porting di /control su React + shadcn/ui (fatto, branch `control-shadcn`)" accanto a quella dell'editor — decisioni (stesso progetto Vite, seconda config), come ricostruire (`npm run build:control` / `build:all`), deviazioni deliberate, limiti noti, cosa è verificato e cosa **non** lo è (dal report del Task 14), e aggiornare le menzioni di `control.js` esistenti con una nota che il sorgente ora vive in `editor-app/src/control/` (non riscrivere la storia delle sezioni precedenti).
- [ ] **Step 3: verifica finale.** `npm test`, `npm run typecheck`, `node --test public/shared/media.test.js` (38), smoke test di `/control/` sulla porta 3100: carica, nessun errore console, mappa e box funzionano.
- [ ] **Step 4: Commit** — `feat: /control ora è l'app React + shadcn/ui; rimosso il vecchio control vanilla`. **Non** fare merge né push: lo fa l'utente.

---

## Self-Review

- **Copertura spec:** build (T1), store/socket (T3), shell (T4), MapPreview (T5), gesti (T6), box Pan/Fog/Zoom/Ping (T7), ping+loop (T8), AOE overlay+gesti (T9), AoePanel (T10), Nudge (T11), tab Fog (T12), Immagini+Audio (T13), parità (T14), cutover+CLAUDE.md (T15). Persistenza localStorage: T2/T3/T7/T11. Gating ping/AOE: T3. Riquadro giallo solo in pan, zoom a comando, `displayViewport` assente: T5/T7.
- **Deviazione dalla spec dichiarata:** la spec dice `base /control/` fin da subito; il piano usa `/control-next/` con route temporanea fino al cutover, per non rompere il `/control` funzionante durante lo sviluppo (stesso schema usato per l'editor).
- **Coerenza nomi:** `selectPingAvailable`/`selectAoeAvailable`, `LocalZoom`, `PingBuffer`, `mapRefs`, `eventToBasePoint`, `resizePayload`/`rotatePayload`/`nudgePayload`/`nextCycleColor` definiti in T2/T3/T8/T9 e usati nei successivi con la stessa firma.
- **Rischio noto:** il loader `vm` dei globali (T1 step 7) potrebbe non esporre alcune funzioni; il passo prevede un test di verifica e un ripiego esplicito.
