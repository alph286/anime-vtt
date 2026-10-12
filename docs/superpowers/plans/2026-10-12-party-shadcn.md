# Porting di /party su React + shadcn/ui — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rifare `/party` (mappa che segue `/display` + pannello AOE + pad di nudge) in React + shadcn/ui con parità funzionale, riusando store e componenti AOE di `/control`.

**Architecture:** Quarta entry Vite in `editor-app/` (`party/`), che usa lo stesso `useControlStore` di `/control` con modalità fissa `aoe` e location in anteprima = location attiva. Un componente nuovo `PartyMap` (layer + transform di follow), un hook socket `usePartySocket`, un modulo puro `follow-math`. Quattro parametrizzazioni minime e retrocompatibili dei file di `/control`.

**Tech Stack:** Vite 8, React 19, TypeScript, Tailwind v4, shadcn/ui, Zustand+Immer, socket.io-client, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-12-party-shadcn-design.md`

## Global Constraints

- Lavoro solo sul branch `party-display-shadcn` (worktree `/home/kratos/Documenti/Projects/anime-vtt-party-display-shadcn`, sopra `control-shadcn`). Mai `main`, mai merge/push (lo fa l'utente).
- Zero modifiche a `server/`, `public/shared/*`, `public/display/*`, `public/editor/*`, `public/control/*`.
- Stessi eventi socket e payload di oggi (`hello {role:'party'}`, `state:update`, `aoe:*`). `/party` non registra `ping:show` né `display:status`.
- Nessuna copia di logica AOE: si riusano `AoePanel`, `AoeNudgePad`, `AoeOverlays`, `use-aoe-gesture`, `use-map-geometry`, `use-shader-loop`, `lib/*` di `/control`. Parametrizzare = opzione con default uguale al comportamento attuale.
- Chiave localStorage del pad di `/party`: `partyAoeNudgeOverlayPos` (quella di `/control` resta `aoeNudgeOverlayPos`).
- Verifiche in browser SOLO su una copia dei dati (porta 3100), SOLO sulla pagina `/party` (dev server Vite :5175). Mai aprire `/display` né `/control`: `displayViewport` è globale sul server. Mai `pkill`/`killall`: si uccide il proprio server per PID.
- Italiano per commenti, messaggi di commit e testi UI, come il resto del progetto. Ogni commit termina con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Comandi da `editor-app/`: `npm test`, `npm run typecheck`; dalla radice del worktree: `node --test public/shared/media.test.js` (38/38).

## Review Focus

1. `displayViewport` presente ma con `width`/`height` a 0 (o assente): mappa intera, nessun transform, nessun crash (Task 2, 4).
2. Cambia la location attiva con un'area selezionata: la selezione si azzera, non resta appesa a un'area di un'altra mappa (Task 3).
3. Compare un'immagine a metà trascinamento di un'area: il trascinamento si interrompe, nessun `aoe:move` successivo (Task 4).
4. Preferenze che `/control` ha scritto nello stesso `localStorage` (`zoomLocalState`, `dmGridOpacity`, `dmGridVisible`) non devono alterare `/party`: né zoom, né spessore del contorno AOE, né opacità della griglia (Task 3, 4).
5. `state:update` senza location attiva o senza mappa: nessun crash, pannello vuoto (Task 3, 4).
6. Salvare la posizione del pad su `/party` non deve scrivere la chiave di `/control` e viceversa (Task 2).

## File Structure

| File | Responsabilità |
|---|---|
| `editor-app/vite.party.config.ts` (nuovo) | Build/dev della quarta entry (root `party/`, base `/party/`, porta 5175). |
| `editor-app/party/index.html`, `party/main.tsx` (nuovi) | Entry: carica `/shared/*` come script classici e monta `PartyApp`. |
| `editor-app/src/party/party.css` (nuovo) | Stili solo di `/party` (box mappa sempre in `touch-action:none`, `#map-layer`). |
| `editor-app/src/party/follow-math.ts` (+test) | Funzioni pure del follow di `/display`. |
| `editor-app/src/party/use-party-socket.ts` (+test) | Socket di `/party` e sincronizzazione con lo store. |
| `editor-app/src/party/PartyMap.tsx` | Mappa che segue il display (layer, transform, griglia, fog). |
| `editor-app/src/party/PartyApp.tsx` (+test) | Shell: header wifi+nome, mappa, pannello AOE, pad. |
| `editor-app/src/control/lib/prefs.ts` | `loadNudgePos/saveNudgePos` con chiave opzionale. |
| `editor-app/src/control/aoe/AoeNudgePad.tsx` | Prop opzionale `storageKey`. |
| `editor-app/src/control/map/use-aoe-gesture.ts` | Opzione `isActive`. |
| `editor-app/src/control/hooks/use-map-geometry.ts` | Opzione `aspect`. |

---

### Task 1: Scaffold della quarta entry (build, dev, shell vuota)

**Files:**
- Create: `editor-app/vite.party.config.ts`, `editor-app/party/index.html`, `editor-app/party/main.tsx`, `editor-app/src/party/PartyApp.tsx` (segnaposto minimo), `editor-app/src/party/party.css`
- Modify: `editor-app/package.json` (script), `editor-app/tsconfig.json` (include), `package.json` radice (script)

**Interfaces:**
- Produces: `export default function PartyApp(): JSX.Element` in `src/party/PartyApp.tsx`; script `dev:party`/`build:party`/`build:all`.

- [ ] **Step 1: `vite.party.config.ts`** (copia di `vite.control.config.ts` con questi cambi)

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { sharedAlias, sharedPlugins, sharedProxy } from './vite.shared.ts';

// La build esce in public/party/ (base /party/), servito da Express. PARTY_OUT permette
// di costruire altrove (es. una cartella di prova) senza toccare quella committata.
const OUT = process.env.PARTY_OUT ?? 'party';
// emptyOutDir svuota la cartella: niente nomi vuoti, con percorsi o che puntino a un'altra app.
if (!/^[a-z0-9-]+$/.test(OUT) || ['editor', 'shared', 'home', 'display', 'control'].includes(OUT)) {
  throw new Error(`PARTY_OUT non valido ("${OUT}"): usa solo lettere minuscole, cifre e trattini, e non il nome di un'altra app (editor, shared, home, display, control).`);
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'party'),
  base: `/${OUT}/`,
  plugins: sharedPlugins(),
  resolve: { alias: sharedAlias },
  build: { outDir: path.resolve(import.meta.dirname, '..', 'public', OUT), emptyOutDir: true },
  server: { port: 5175, proxy: sharedProxy, fs: { allow: [path.resolve(import.meta.dirname)] } },
});
```

- [ ] **Step 2: `party/index.html`** (stesso schema di `control/index.html`)

```html
<!DOCTYPE html>
<html lang="it" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Anime VTT — Party</title>
</head>
<body>
  <div id="root"></div>
  <script src="/shared/media.js"></script>
  <script src="/shared/shader-effects.js"></script>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: `party/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/control/control.css';
import '../src/party/party.css';
import PartyApp from '../src/party/PartyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PartyApp />
  </StrictMode>
);
```

- [ ] **Step 4: segnaposto `PartyApp.tsx` e `party.css` vuoto**

```tsx
export default function PartyApp() {
  return <div data-testid="party-app">Party</div>;
}
```
`party.css`: solo un commento `/* Stili di /party (vedi Task 5). */`.

- [ ] **Step 5: script**
  - `editor-app/package.json`: `"dev:party": "vite --config vite.party.config.ts"`, `"build:party": "tsc --noEmit && vite build --config vite.party.config.ts"`.
  - `package.json` radice: `"dev:party": "cd editor-app && npm run dev:party"`, `"build:party": "cd editor-app && npm install && npm run build:party"`, e `"build:all": "npm run build:editor && npm run build:control && npm run build:party"`.
  - `editor-app/tsconfig.json`: aggiungere `"party"` e `"vite.party.config.ts"` a `include`.

- [ ] **Step 6: installare dipendenze nel nuovo worktree e verificare la build in una cartella di prova**

Run: `cd editor-app && npm install && npm run typecheck && PARTY_OUT=party-scratch npx vite build --config vite.party.config.ts`
Expected: typecheck pulito, build ok in `public/party-scratch/`. Poi `rm -rf ../public/party-scratch` (non committare). `git status` non deve mostrare `public/party` modificato.

- [ ] **Step 7: test**

Run: `npm test` (dalla cartella `editor-app`). Expected: tutti verdi (260 + eventuali).

- [ ] **Step 8: Commit**

```bash
git add editor-app package.json
git commit -m "build(party): quarta entry Vite per /party (dev :5175, build in public/party)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(`editor-app/node_modules` è già ignorato; verificarlo con `git status` prima del commit.)

---

### Task 2: Parametrizzazioni minime dei file di /control

**Files:**
- Modify: `editor-app/src/control/lib/prefs.ts`, `editor-app/src/control/aoe/AoeNudgePad.tsx`, `editor-app/src/control/map/use-aoe-gesture.ts`, `editor-app/src/control/hooks/use-map-geometry.ts`
- Test: `editor-app/src/control/lib/prefs.test.ts` (aggiunte), `editor-app/src/control/aoe/aoe-nudge-pad.test.tsx` (aggiunta), `editor-app/src/control/map/aoe-gesture.test.tsx` (aggiunta), `editor-app/src/control/hooks/use-map-geometry.test.tsx` (nuovo)

**Interfaces:**
- Produces:
  - `loadNudgePos(key?: string)`, `saveNudgePos(p, key?: string)` (default `'aoeNudgeOverlayPos'`).
  - `<AoeNudgePad storageKey?: string />`.
  - `useAoeGesture(opts?: { isActive?: (s: ControlStore) => boolean })` (default = oggi: `mode==='aoe' && selectAoeAvailable`).
  - `useMapGeometry(refs, opts?: { aspect?: string | null })`: se `aspect` è una stringa non vuota viene scritta in `--map-aspect` del `preview` (sovrascrive quella derivata dal media); altrimenti comportamento identico a oggi.

- [ ] **Step 1: test che falliscono**
  - `prefs.test.ts`: `saveNudgePos({left:1,top:2}, 'partyAoeNudgeOverlayPos')` scrive solo quella chiave (`localStorage.getItem('aoeNudgeOverlayPos')` resta `null`); `loadNudgePos('partyAoeNudgeOverlayPos')` la rilegge; `loadNudgePos()` ignora la chiave party.
  - `aoe-nudge-pad.test.tsx`: montare `<AoeNudgePad storageKey="altraChiave" />` con area selezionata in modalità aoe, simulare il rilascio della maniglia come fanno i test esistenti e verificare che la posizione sia in `localStorage['altraChiave']` e non in `aoeNudgeOverlayPos`.
  - `aoe-gesture.test.tsx`: aggiungere un componente di test che monta `MapTab`-equivalente? No: usare un wrapper che renderizza un `<div id="map-fit-box">` registrato in `mapRefs.fitBox` (come fanno i test esistenti) e chiama `useAoeGesture({ isActive: () => true })`, con `mode: null` nello store: un tap deve emettere `aoe:place` (con il default non lo farebbe). Un secondo caso `isActive: () => false` con `mode:'aoe'` non emette nulla.
  - `use-map-geometry.test.tsx`: renderHook con refs a div finti (`clientWidth` stubbato) e un server con una location con mappa; con `{ aspect: '1000 / 500' }` → `preview.style.getPropertyValue('--map-aspect') === '1000 / 500'`; senza opzione → resta il comportamento attuale (nessun valore se il media non è caricato).

- [ ] **Step 2: eseguire e vedere fallire**

Run: `npx vitest run src/control/lib/prefs.test.ts src/control/aoe src/control/map/aoe-gesture.test.tsx src/control/hooks`
Expected: FAIL (firme non ancora estese).

- [ ] **Step 3: implementare**

`prefs.ts`:
```ts
export function loadNudgePos(key: string = AOE_NUDGE_POS_KEY): { left: number; top: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return { left: p.left, top: p.top };
    }
  } catch { /* localStorage non disponibile o valore corrotto: posizione di default */ }
  return null;
}

export function saveNudgePos(p: { left: number; top: number }, key: string = AOE_NUDGE_POS_KEY): void {
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* vale solo per la sessione */ }
}
```
`AoeNudgePad.tsx`: `export function AoeNudgePad({ storageKey }: { storageKey?: string } = {})` e passare `storageKey` a **tutte** le chiamate `loadNudgePos(...)`/`saveNudgePos(..., storageKey)` (sono tre: layout effect di comparsa, fine trascinamento, salvataggio a pad nascosto a metà trascinamento).

`use-aoe-gesture.ts`:
```ts
export function useAoeGesture(opts: { isActive?: (s: ControlStore) => boolean } = {}) {
  const isActiveRef = useRef(opts.isActive ?? aoeActive);
  isActiveRef.current = opts.isActive ?? aoeActive;
  useEffect(() => {
    // ... invariato, ma ogni `aoeActive(s)` diventa `isActiveRef.current(s)`
  }, []);
}
```
(importare `useRef`). Il resto del file non cambia.

`use-map-geometry.ts`: firma `useMapGeometry(refs: MapGeometryRefs, opts: { aspect?: string | null } = {})`; `const aspectRef = useRef(opts.aspect ?? null); aspectRef.current = opts.aspect ?? null;`. In `recompute`, subito dopo il blocco if/else che imposta/rimuove `--map-aspect` (riga ~52):
```ts
    if (aspectRef.current) preview.style.setProperty('--map-aspect', aspectRef.current);
```
Aggiungere `opts.aspect` alle dipendenze del `useLayoutEffect` che chiama `recompute()` (così un cambio di `displayViewport` ricalcola subito).

- [ ] **Step 4: tutti i test**

Run: `npm test && npm run typecheck`
Expected: tutto verde; i test esistenti di `/control` non cambiano.

- [ ] **Step 5: Commit**

```bash
git add editor-app/src/control
git commit -m "refactor(control): opzioni retrocompatibili per chiave del pad, attivazione del gesto AOE e aspect della mappa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: follow-math + usePartySocket

**Files:**
- Create: `editor-app/src/party/follow-math.ts`, `follow-math.test.ts`, `use-party-socket.ts`, `use-party-socket.test.tsx`

**Interfaces:**
- Produces:
```ts
// follow-math.ts
export interface DisplayViewport { width: number; height: number }
export interface LiveTransform { offsetX: number; offsetY: number; scale: number }
export function followsDisplay(v: { width?: number; height?: number } | null | undefined): boolean;
export function liveTransform(
  map: { scale?: number; liveView?: { scale?: number; offsetX?: number; offsetY?: number } } | undefined,
  v: DisplayViewport | null | undefined,
  boxWidth: number,
): LiveTransform | null;            // null = non segue il display
export function transformCss(t: LiveTransform | null): string;  // 'none' se null
export function gridLineWidth(lineWidth: number | undefined, scale: number): number;
// use-party-socket.ts
export function syncPartyState(s: ControlState): void;   // receiveState + preview=attiva + mode='aoe'
export function usePartySocket(): void;
export const PARTY_NUDGE_POS_KEY = 'partyAoeNudgeOverlayPos';
```

- [ ] **Step 1: test di `follow-math`**

```ts
import { describe, expect, it } from 'vitest';
import { followsDisplay, gridLineWidth, liveTransform, transformCss } from './follow-math';

describe('follow-math', () => {
  it('followsDisplay richiede larghezza e altezza non nulle', () => {
    expect(followsDisplay({ width: 1920, height: 1080 })).toBe(true);
    expect(followsDisplay({ width: 0, height: 1080 })).toBe(false);
    expect(followsDisplay(null)).toBe(false);
    expect(followsDisplay(undefined)).toBe(false);
  });
  it('senza viewport noto non c\'è transform (mappa intera)', () => {
    expect(liveTransform({ scale: 2, liveView: { scale: 3, offsetX: 5, offsetY: 5 } }, null, 400)).toBeNull();
    expect(transformCss(null)).toBe('none');
  });
  it('gli offset si scalano di k = boxWidth/viewport.width, lo zoom no', () => {
    const t = liveTransform({ scale: 2, liveView: { scale: 1.5, offsetX: 100, offsetY: -50 } }, { width: 1000, height: 500 }, 250);
    expect(t).toEqual({ offsetX: 25, offsetY: -12.5, scale: 3 });
    expect(transformCss(t)).toBe('translate(25px, -12.5px) scale(3)');
  });
  it('liveView e scale mancanti valgono 1 / 0', () => {
    expect(liveTransform({}, { width: 100, height: 100 }, 100)).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
    expect(liveTransform(undefined, { width: 100, height: 100 }, 100)).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
  });
  it('gridLineWidth divide per lo zoom e non scende sotto 0,01', () => {
    expect(gridLineWidth(0.4, 2)).toBeCloseTo(0.2);
    expect(gridLineWidth(undefined, 1)).toBeCloseTo(0.3);
    expect(gridLineWidth(0.3, 0)).toBeCloseTo(30);
  });
});
```

- [ ] **Step 2: implementazione**

```ts
export interface DisplayViewport { width: number; height: number }
export interface LiveTransform { offsetX: number; offsetY: number; scale: number }

// displayViewport noto e valido (un display si è connesso almeno una volta): solo
// allora il box ha la stessa proporzione dello schermo e k è un unico numero.
export function followsDisplay(v: { width?: number; height?: number } | null | undefined): boolean {
  return Boolean(v && v.width && v.height);
}

// Stessa formula di renderMap in display.js (scale = mapScale*live.scale); gli
// offset sono pixel dello schermo del display, qui il box è k volte più piccolo:
// vanno scalati di k, lo zoom (unitless) no. Senza display noto: null.
export function liveTransform(
  map: { scale?: number; liveView?: { scale?: number; offsetX?: number; offsetY?: number } } | undefined,
  v: DisplayViewport | null | undefined,
  boxWidth: number,
): LiveTransform | null {
  if (!v || !followsDisplay(v)) return null;
  const live = map?.liveView ?? {};
  const scale = (map?.scale || 1) * (live.scale || 1);
  const k = boxWidth / v.width;
  return { offsetX: (live.offsetX || 0) * k, offsetY: (live.offsetY || 0) * k, scale };
}

export function transformCss(t: LiveTransform | null): string {
  return t ? `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})` : 'none';
}

// La griglia resta a spessore costante sullo schermo (display.js fa lo stesso);
// il contorno AOE NO, come nell'originale.
export function gridLineWidth(lineWidth: number | undefined, scale: number): number {
  return (lineWidth || 0.3) / Math.max(scale, 0.01);
}
```
Run: `npx vitest run src/party/follow-math.test.ts` → PASS.

- [ ] **Step 3: test di `usePartySocket`** (modellato su `src/control/ControlApp.test.tsx` per il mock di `@/lib/socket`)

Casi, con `socket.on` che raccoglie gli handler in una mappa `handlers[event]`:
  - al montaggio registra `connect`, `disconnect`, `state:update` e NON `ping:show` né `display:status`;
  - `connect` → `socket.emit('hello', { role: 'party' })` e `socketConnected=true`; `disconnect` → `false`;
  - `state:update` con `activeLocationId:'L1'` → `previewLocationId==='L1'`, `mode==='aoe'` anche se l'immagine è mostrata (`activeImageId:'i'`) o la mappa non ha file (il gating di `/control` non deve far uscire dalla modalità);
  - Review Focus 2: con `selectedAoeId='A'` in L1, arriva uno stato con `activeLocationId:'L2'` (senza A) → `selectedAoeId===null`;
  - Review Focus 4: `localStorage.setItem('zoomLocalState', JSON.stringify({scale:3,x:10,y:10}))` e store già con `localZoom` 3: dopo il montaggio `localZoom` è `{scale:1,x:0,y:0}` e `localStorage` NON viene toccato;
  - Review Focus 5: stato con `activeLocationId:null` e `locations:[]` → nessuna eccezione, `previewLocationId===null`.
  - allo smontaggio chiama `socket.off` per ogni handler registrato.

- [ ] **Step 4: implementazione**

```ts
import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useControlStore } from '../control/store/control-store';
import type { ControlState } from '../control/types';

export const PARTY_NUDGE_POS_KEY = 'partyAoeNudgeOverlayPos';

// /party non ha anteprima né modalità: guarda sempre la location attiva e il
// pannello AOE è sempre attivo. receiveState() di /control ripiega
// sull'anteprima precedente e fa uscire dalla modalità quando l'AOE non è
// "disponibile" (immagine mostrata, mappa senza file): qui si forza di nuovo
// lo stato di /party subito dopo.
export function syncPartyState(s: ControlState): void {
  useControlStore.getState().receiveState(s);
  useControlStore.setState((d) => {
    d.previewLocationId = s.activeLocationId ?? null;
    const loc = d.server?.locations.find((l) => l.id === s.activeLocationId);
    if (d.selectedAoeId && !(loc?.map.aoes ?? []).some((a) => a.id === d.selectedAoeId)) {
      d.selectedAoeId = null;
    }
    d.mode = 'aoe';
  });
}

export function usePartySocket(): void {
  useEffect(() => {
    const st = () => useControlStore.getState();
    // Lo zoom locale di /control è persistito nello stesso localStorage: qui
    // non esiste, va azzerato in memoria (senza toccare lo storage).
    st().resetLocalZoom();
    const onConnect = () => { st().setConnected(true); socket.emit('hello', { role: 'party' }); };
    const onDisconnect = () => st().setConnected(false);
    const onState = (s: ControlState) => syncPartyState(s);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state:update', onState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state:update', onState);
    };
  }, []);
}
```
(Se `ControlState.activeLocationId` è tipizzato non-null, togliere il `?? null`.)

- [ ] **Step 5: test e typecheck**

Run: `npm test && npm run typecheck` → verdi.

- [ ] **Step 6: Commit**

```bash
git add editor-app/src/party
git commit -m "feat(party): follow-math puro e hook socket di /party

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PartyMap (layer, follow, griglia, fog, gesto)

**Files:**
- Create: `editor-app/src/party/PartyMap.tsx`, `editor-app/src/party/PartyMap.test.tsx`
- Modify: `editor-app/src/party/party.css`

**Interfaces:**
- Consumes: `useMapGeometry(refs, { aspect })`, `useShaderLoop()`, `useAoeGesture({ isActive })`, `AoeOverlays`, `mapRefs`, `followsDisplay/liveTransform/transformCss/gridLineWidth`, store (`selectPreviewLocation`, `selectShowingImage`).
- Produces: `export default function PartyMap(): JSX.Element`; `export const partyGestureActive = (s: ControlStore) => !selectShowingImage(s)`.

- [ ] **Step 1: test che falliscono** (stile di `map/aoe-gesture.test.tsx`: stesso polyfill `PointerEvent`, `setServer`, stub di `getBoundingClientRect` sul fit-box; leggerlo per copiare gli helper `pointer(...)`):
  - a) con `displayViewport {1000x500}` il preview ha `--map-aspect: 1000 / 500` e `#map-layer` ha `transform` `translate(...) scale(...)` coerente con `liveTransform` (stubbare `clientWidth` del preview a 250 → offsets scalati di 0,25);
  - b) senza `displayViewport` (o `{width:0,height:0}`): `#map-layer` ha `transform: none` e `--map-aspect` non è quello del viewport (Review Focus 1);
  - c) la griglia: con `scale` 2 (map.scale 2) e `lineWidth 0.4`, le linee dell'svg griglia hanno spessore ≈ 0,2 (ispezionare l'attributo che `renderGridSvg` scrive; guardare l'implementazione in `public/shared/media.js` per sapere quale);
  - d) il fog: poligono non rivelato → un `div.fog-overlay` con `clip-path`; poligono rivelato → nessun elemento; nessuna opacità ridotta (`style.opacity` vuoto);
  - e) gesto: tap su area vuota (`pointerdown`+`pointerup` a distanza < 8px) con `activeImageId: null` e `mode` qualunque → `socket.emit` chiamato con `'aoe:place'`; con `activeImageId: 'img1'` → nessun `aoe:place`; tolta l'immagine (nuovo stato) → il tap emette di nuovo;
  - f) Review Focus 3: `pointerdown` sul contorno di un'area (`.aoe-shape-overlay[data-id]`), un primo `pointermove` emette `aoe:move`; poi arriva uno stato con `activeImageId:'img1'`; un secondo `pointermove` NON emette altri `aoe:move`;
  - g) Review Focus 4: con `localStorage.zoomLocalState` impostato a scala 3 PRIMA dell'import dello store e `resetLocalZoom()` chiamato, lo spessore del contorno AOE (`polygon.style.strokeWidth`) è 2 (non 2/3) e la griglia non usa `dmGridOpacity` (impostare `dmGridOpacity` a 0.1 nello store: l'opacità della griglia resta quella di `grid.opacity`).

- [ ] **Step 2: eseguire e vedere fallire** — `npx vitest run src/party/PartyMap.test.tsx` → FAIL (modulo mancante).

- [ ] **Step 3: `PartyMap.tsx`**

Struttura (porting di `renderMapPreview` di `public/party/party.js` e gerarchia di `MapPreview.tsx`; copiare da `MapPreview.tsx` il blocco `refs`/`useMapGeometry`/`mapRefs` e il layout effect del caricamento media):

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useMapGeometry } from '../control/hooks/use-map-geometry';
import { useShaderLoop } from '../control/hooks/use-shader-loop';
import { AoeOverlays } from '../control/map/AoeOverlays';
import { mapRefs, type MapMedia } from '../control/map/map-refs';
import { useAoeGesture } from '../control/map/use-aoe-gesture';
import {
  selectPreviewLocation, selectShowingImage, useControlStore, type ControlStore,
} from '../control/store/control-store';
import { followsDisplay, gridLineWidth, liveTransform, transformCss } from './follow-math';

// Sulle immagini mostrate dal DM /party non cambia nulla di visibile: l'unico
// effetto è che non si piazzano né si spostano aree dalla mappa.
export const partyGestureActive = (s: ControlStore): boolean => !selectShowingImage(s);

export default function PartyMap() {
  const location = useControlStore(selectPreviewLocation);
  const displayViewport = useControlStore((s) => s.server?.displayViewport ?? null);
  const naturalW = useControlStore((s) => s.geometry.naturalW);
  const naturalH = useControlStore((s) => s.geometry.naturalH);
  const previewW = useControlStore((s) => s.geometry.previewW);
  const grid = location?.map.grid;
  const polygons = location?.map.polygons;
  const file = location?.map.file ?? null;

  const previewRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const fitBoxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const gridSvgRef = useRef<SVGSVGElement>(null);
  const mediaRef = useRef<MapMedia | null>(null);

  const refs = useMemo(
    () => ({ preview: previewRef, mediaWrap: mediaWrapRef, fitBox: fitBoxRef, media: mediaRef }),
    [],
  );
  const aspect = followsDisplay(displayViewport) ? `${displayViewport!.width} / ${displayViewport!.height}` : null;
  const { recompute } = useMapGeometry(refs, { aspect });

  useLayoutEffect(() => {
    mapRefs.preview = previewRef.current;
    mapRefs.fitBox = fitBoxRef.current;
    return () => { mapRefs.preview = null; mapRefs.fitBox = null; mapRefs.media = null; };
  }, []);

  useAoeGesture({ isActive: partyGestureActive });
  useShaderLoop();

  // Caricamento media: identico a MapPreview (copiare il blocco useLayoutEffect su [location?.id, file, recompute]).

  const t = useMemo(
    () => liveTransform(location?.map, displayViewport, previewW),
    [location?.map, displayViewport, previewW],
  );
  useLayoutEffect(() => {
    if (layerRef.current) layerRef.current.style.transform = transformCss(t);
  }, [t]);

  // Griglia: opacità condivisa coi giocatori (grid.opacity), mai le preferenze del DM.
  useEffect(() => {
    const svg = gridSvgRef.current;
    if (!svg) return;
    if (!grid) { svg.innerHTML = ''; return; }
    renderGridSvg(svg, { ...grid, lineWidth: gridLineWidth(grid.lineWidth, t?.scale ?? 1) }, naturalW, naturalH);
  }, [grid, t?.scale, naturalW, naturalH]);

  return (
    <div ref={previewRef} id="map-preview" className="map-preview">
      <div ref={layerRef} id="map-layer">
        <div ref={mediaWrapRef} className="media-wrap" id="map-media-wrap">
          <div ref={fitBoxRef} className="fit-box" id="map-fit-box">
            {/* img, video, placeholder come in MapPreview.tsx */}
            <canvas id="map-shader-canvas" className="shader-layer" />
            <div className="fog-layer" id="map-fog-layer">
              {(polygons ?? []).filter((p) => !p.revealed).map((p) => (
                <div key={p.id} className="fog-overlay" style={{ clipPath: polygonClipPath(p.points) }} />
              ))}
            </div>
            <svg ref={gridSvgRef} id="map-grid-svg" className="grid-layer" viewBox="0 0 100 100" preserveAspectRatio="none" />
            <canvas id="map-aoe-shader-canvas" className="shader-layer aoe-shader-layer" />
            <AoeOverlays />
          </div>
        </div>
      </div>
    </div>
  );
}
```
Il commento `{/* img, video, placeholder ... */}` va sostituito con i tre elementi veri copiati da `MapPreview.tsx` (stessi `ref`, `id`, `className`, `hidden`). Non c'è canvas ping, né riquadro giallo né bussola. `useShaderLoop` tollera già l'assenza del canvas ping (`pingCanvas` null → layer ping null, `pingBuffer` sempre vuoto).

- [ ] **Step 4: `party.css`**

```css
/* Il box mappa è l'unica cosa che /party fa: il gesto AOE vale sempre (in
   /control è condizionato a .mode-aoe). Senza touch-action:none su touch il
   browser interpreta il trascinamento come scroll e manda pointercancel. */
.map-preview { cursor: crosshair; }
.map-preview, .map-preview * { touch-action: none; }

/* Riceve il transform di pan/zoom condiviso con /display (vedi follow-math.ts). */
#map-layer { position: absolute; inset: 0; transform-origin: center center; }

/* Il fog di /party è nero pieno, come su /display. */
.map-preview .fog-overlay { background: #000; opacity: 1; }
```
Confrontare con `control.css` righe 40-120: `.map-preview` lì ha larghezza/aspect e un `@media (min-width: 700px)` che potrebbe non andare bene per una colonna singola; se serve, sovrascrivere in `party.css` con `max-width` della colonna (`#app` di `party.css` originale: `max-width: 720px; margin: 0 auto`).

- [ ] **Step 5: test e typecheck** — `npm test && npm run typecheck` → verdi.

- [ ] **Step 6: Commit**

```bash
git add editor-app/src/party
git commit -m "feat(party): PartyMap che segue l'inquadratura di /display con griglia compensata e gesto AOE

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: PartyApp (shell, pannello AOE, pad)

**Files:**
- Modify: `editor-app/src/party/PartyApp.tsx`, `editor-app/src/party/party.css`
- Test: `editor-app/src/party/PartyApp.test.tsx`

**Interfaces:**
- Consumes: `usePartySocket`, `PARTY_NUDGE_POS_KEY`, `PartyMap`, `AoePanel`, `AoeNudgePad`, store.

- [ ] **Step 1: test che falliscono** (stile `ControlApp.test.tsx`, mock di `@/lib/socket`, `localStorage.clear()` nel `beforeEach`; ricordare `localStorage.clear()` PRIMA di reimpostare lo store)
  - a) senza server: header con pallino `data-testid="wifi-dot"` e nome vuoto, nessun selettore location (`queryByRole('combobox')` è `null`), pannello AOE presente;
  - b) con stato (location `Taverna` attiva) il nome appare nell'header; il pallino ha classe `bad` finché `socketConnected` è false e `ok` quando è true (solo il socket, non il display);
  - c) il pannello AOE è visibile con la mappa senza modalità selezionabili: nessun pulsante pan/fog/ping/zoom/immagini/audio (`queryByText` su "Pan", "Ping", "Zoom", "Fog", "Immagini", "Audio" → `null`);
  - d) la lista mostra le aree; click elimina arma-poi-conferma: primo click arma (nessun `aoe:remove`), secondo click entro 2,5 s emette `aoe:remove` con `{ locationId, aoeId }`; nessun pulsante fulmine per pillola (`queryByTitle(/lancia/i)` sulle pillole → `null`);
  - e) con un'area selezionata il pad è visibile (tasto FIRE); `FIRE` emette `aoe:setCast`; spostare la maniglia e rilasciare scrive `localStorage['partyAoeNudgeOverlayPos']` e NON `aoeNudgeOverlayPos` (Review Focus 6);
  - f) con un'immagine mostrata (`activeImageId`) il pannello e il pad restano utilizzabili (cambiare colore dalla color bar su un'area selezionata emette `aoe:setColor`);
  - g) Review Focus 5: stato con `activeLocationId:null`, `locations:[]` → render senza eccezioni.

- [ ] **Step 2: eseguire e vedere fallire** — `npx vitest run src/party/PartyApp.test.tsx` → FAIL.

- [ ] **Step 3: implementazione**

```tsx
import { cn } from '@/lib/utils';
import { AoeNudgePad } from '../control/aoe/AoeNudgePad';
import { AoePanel } from '../control/aoe/AoePanel';
import { selectPreviewLocation, useControlStore } from '../control/store/control-store';
import PartyMap from './PartyMap';
import { PARTY_NUDGE_POS_KEY, usePartySocket } from './use-party-socket';

// Pallino wifi: solo il socket (a /party non interessa se c'è un display).
function WifiDot() {
  const ok = useControlStore((s) => s.socketConnected);
  return (
    <div
      data-testid="wifi-dot"
      title={ok ? 'Connesso' : 'Server non connesso'}
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-300',
        ok ? 'ok bg-transparent opacity-35' : 'bad bg-[var(--danger-bg)] opacity-100 ring-1 ring-[var(--danger-border)]',
      )}
    >
      <svg viewBox="0 0 24 24" className={cn('size-4', ok ? 'fill-muted-foreground' : 'fill-[var(--danger-text)]')}>
        <path d="M12 20a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 20Zm-6.4-6.2a9 9 0 0 1 12.8 0l-2 2a6.2 6.2 0 0 0-8.8 0l-2-2Zm-3.8-4a14 14 0 0 1 20.4 0l-2 2a11.2 11.2 0 0 0-16.4 0l-2-2Z" />
      </svg>
    </div>
  );
}

export default function PartyApp() {
  usePartySocket();
  const location = useControlStore(selectPreviewLocation);
  return (
    <div className="mx-auto flex h-dvh max-w-[720px] flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card px-3.5 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <WifiDot />
        <span className="min-w-0 flex-1 truncate font-semibold">{location?.name ?? ''}</span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <PartyMap />
        <AoePanel />
      </main>
      <AoeNudgePad storageKey={PARTY_NUDGE_POS_KEY} />
    </div>
  );
}
```
Se `AoePanel` rende internamente un `Box` con un titolo o altro che in `/party` non esisteva, lasciarlo (è la stessa resa di `/control`); non aggiungere funzioni.

- [ ] **Step 4: test, typecheck, e anche l'intera suite** — `npm test && npm run typecheck && cd .. && node --test public/shared/media.test.js` → tutto verde (38/38).

- [ ] **Step 5: Commit**

```bash
git add editor-app/src/party
git commit -m "feat(party): PartyApp con header, mappa, pannello AOE e pad con chiave dedicata

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verifica di parità in browser, cutover e documentazione

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-party-shadcn-parity.md`
- Modify: `CLAUDE.md` (sezione `/party`), `public/party/` (sostituito dalla build), `package.json` radice se serve
- Delete: `public/party/party.js`, `public/party/party.css` (e il vecchio `index.html` viene sovrascritto dalla build)

- [ ] **Step 1: copia dei dati e server di prova** (mai i dati vivi)

```bash
TMP=$(mktemp -d) && cp -r data "$TMP/data" && cp -r storage "$TMP/storage"
PORT=3100 DATA_DIR="$TMP/data" STORAGE_DIR="$TMP/storage" NODE_PATH=/home/kratos/Documenti/Projects/anime-vtt/node_modules node server/index.js &
echo $!   # annotare il PID; si chiude con kill <PID>, mai pkill
```
Nella copia dei dati: impostare un `displayViewport` si ottiene solo da un client `/display` reale: NON aprire `/display`. Per provare il follow, aggiungere alla copia dei dati (sul server di prova) un client socket.io di test via script Node (`node -e` con `socket.io-client` da `editor-app/node_modules`) che emette `hello {role:'display'}` e `display:viewport {width:1745,height:872}` verso la porta 3100 e resta connesso; vale solo per il server di prova.

- [ ] **Step 2: avviare il dev server e aprire solo `/party`**

```bash
cd editor-app && VTT_BACKEND=http://localhost:3100 npm run dev:party
```
Aprire `http://localhost:5175/party/` nel browser integrato. Console pulita.

- [ ] **Step 3: checklist di parità** — scrivere `docs/superpowers/plans/2026-10-12-party-shadcn-parity.md` con una riga OK/KO per voce, compilandola durante la prova:
  1. Header: pallino rosso→tenue alla connessione; nome location attiva.
  2. Senza client display: mappa intera, nessun transform, griglia visibile.
  3. Con display (1745×872): box con quella proporzione; pan/zoom dal DM (con un altro client di test sul server di prova che emette `view:*`, mai dal `/control` vero) spostano la mappa come su `/display`; griglia a spessore costante zoomando; contorno AOE no.
  4. Fog: zone non rivelate nere piene, rivelate trasparenti.
  5. Portale e AOE lanciata animati; loop che si ferma senza shader.
  6. Pannello AOE: forme, colori, menu "···" (Ragnatela/Fumo/Viola Cornelia) mutuamente esclusivo col colore, taglia/larghezza (solo Linea), lista pillole, selezione/deselezione, eliminazione arma-poi-conferma 2,5 s, nessun fulmine per pillola.
  7. Gesto: tap su vuoto piazza (snap), trascinamento di un contorno sposta, soglia 8 px.
  8. Pad: rotazione (riaggancio alla griglia), ▲▼◀▶ in direzione schermo anche a mappa ruotata, colore, taglia/larghezza, FIRE cast/decast, trascinamento, posizione salvata in `partyAoeNudgeOverlayPos` e non in `aoeNudgeOverlayPos`.
  9. **Immagine mostrata** (impostare `activeImageId` sul server di prova con un client socket di test che emette `image:show`, mai da `/control` vero): la mappa e le aree restano com'erano; un tap sulla mappa NON piazza; un trascinamento NON sposta; tolta l'immagine tornano a funzionare; pannello e pad restano utilizzabili.
  10. Cambio location attiva con area selezionata: selezione azzerata, pad nascosto.
  11. Reload: nessun residuo di zoom o preferenze di `/control`.
  12. Sezione "Non verificato a mano": touch/pinch reale, resa visiva degli shader, confronto con un vero `/display` acceso, tavolo con più telefoni.

- [ ] **Step 4: cutover**

```bash
git rm public/party/party.js public/party/party.css
npm run build:party          # dalla radice: scrive public/party/ (index.html + assets/)
git status --short           # solo public/party deve cambiare
```
Controllare che `public/control` e `public/editor` NON risultino modificati (se la build condivisa ne cambiasse gli hash, `git checkout -- public/control public/editor`).

- [ ] **Step 5: verifiche finali**

```bash
cd editor-app && npm test && npm run typecheck
cd .. && node --test public/shared/media.test.js
git diff control-shadcn..HEAD --stat -- server public/shared public/display public/editor public/control
```
Atteso: test verdi, 38/38, ultimo comando vuoto. Arrestare il server di prova col suo PID, cancellare la cartella temporanea dei dati e il client di test.

- [ ] **Step 6: `CLAUDE.md`** — aggiungere, dopo la sezione di `/control`, "Porting di /party su React + shadcn/ui (fatto, branch `party-display-shadcn`)": decisioni (riuso dello store di `/control`, modalità fissa `aoe`, nessun gating tranne il gesto con immagine mostrata, chiave del pad dedicata, `/display` volutamente lasciato vanilla), comandi (`dev:party`, `build:party`, build committata in `public/party/`), le quattro parametrizzazioni di `/control`, ordine di merge (prima `control-shadcn`), e la lista "Non verificato a mano".

- [ ] **Step 7: Commit**

```bash
git add -A public/party docs CLAUDE.md package.json
git commit -m "feat: /party ora è l'app React + shadcn/ui; rimosso il vecchio party vanilla

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
