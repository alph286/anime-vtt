# Aree d'Effetto sulla Griglia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DM place D&D spell area-of-effect shapes (cone/cube/sphere/line) on the active location's grid from `/control`, sized in meters, visible live on `/display`, positionable/rotatable/removable, with the affected grid cells highlighted per the official D&D rule (cell counts if its center is inside the shape).

**Architecture:** A new `location.map.aoes` array, persisted and broadcast exactly like `polygons`/`grid`/`compass`. A shared geometry module in `public/shared/media.js` turns an AoE record into screen-ready shape outline points and affected-cell rectangles; both `/control` (interactive) and `/display` (read-only) call the same functions so their rendering can never drift apart. AoE becomes a fifth exclusive tap-mode on the existing `/control` map preview, alongside Sposta/Fog/Ping/Zoom locale.

**Tech Stack:** Node.js/Express/socket.io server, vanilla JS/CSS clients, no build step. This project has no automated test suite by design (manual browser/curl verification is the established convention — see the previous plans in `docs/superpowers/plans/`). Task 1 is the one exception: it adds pure, easily-miscalculated geometry math, and Node 22 ships a test runner (`node --test`) with zero new dependencies, so that task gets real TDD. Every other task verifies manually.

**Spec:** [docs/superpowers/specs/2026-09-25-spell-aoe-grid-design.md](../specs/2026-09-25-spell-aoe-grid-design.md)

## Global Constraints

- 1 cella di griglia = 1,5 metri, fisso a livello di progetto (non configurabile per location).
- Forme: `cone` (lunghezza), `cube` (lato), `sphere` (raggio — sfera e cilindro sono la stessa forma vista dall'alto), `line` (lunghezza + larghezza, default larghezza 1,5m).
- `cube` e `sphere` non sono orientabili (rotazione ignorata). `cone`/`line` ruotano a scatti di 15°.
- Taglia sempre multiplo di 1,5m (stepper a passi di 1 cella); default alla prima selezione di una forma: 1,5m.
- Le aree sono persistite in `data/state.json` dentro `location.map.aoes` (stesso ciclo `saveState`/`broadcastState` di poligoni/griglia/bussola) — MAI transitorie come il ping.
- Più aree possono coesistere sulla stessa location; ognuna si rimuove singolarmente.
- Il pulsante modalità AoE è disabilitato quando si sta visualizzando in anteprima una location diversa da quella attiva, o quando è mostrata un'immagine al posto della mappa (stessa regola già in vigore per il pulsante Ping).
- Una cella di griglia è "colpita" se il suo **centro** ricade dentro la forma (regola ufficiale D&D per il gioco su griglia).
- Palette/stile: riusare i token esistenti di `public/shared/theme.css` (`--accent`, `--accent-bg-subtle`, `--bg-control`, `--border-control`) — nessun colore o font nuovo. Touch target 44px sui controlli di `/control`.
- Nessuna funzionalità esistente di `/control` o `/display` va alterata nel comportamento (fog tap-to-reveal, pan/zoom condiviso, zoom locale, ping, rotazione mappa).

---

## Task 1: Geometria condivisa dell'AoE (con test automatici)

**Files:**
- Modify: `public/shared/media.js` (in fondo al file)
- Create: `public/shared/media.test.js`

**Interfaces:**
- Consumes: nulla di nuovo — usa solo `Math`.
- Produces (usate dai Task 3-5):
  - `const AOE_METERS_PER_CELL = 1.5` (costante globale)
  - `function rotateVector(x, y, angleDeg) -> [number, number]` (spostata qui da `control.js`, stessa identica implementazione)
  - `function aoePixelsPerMeter(grid) -> number`
  - `function aoeShapePointsPx(shape, sizeM, widthM, grid) -> [number, number][]` (punti nello spazio pixel locale, origine 0,0, rotazione 0 = non applicata)
  - `function aoeOutlinePoints(aoe, grid, naturalW, naturalH) -> [number, number][]` (punti in percentuale, spazio base non ruotato della mappa)
  - `function pointInPolygon(point, polygon) -> boolean`
  - `function aoeAffectedCells(aoe, grid, naturalW, naturalH) -> {col: number, row: number}[]`
  - `function cellRectPercent(col, row, grid, naturalW, naturalH) -> {leftPct, topPct, widthPct, heightPct}`

`aoe` è sempre un oggetto `{ id, shape, sizeM, widthM, x, y, rotation }` (stesso schema della spec).

- [ ] **Step 1: Scrivi i test (falliranno: le funzioni non esistono ancora)**

Crea `public/shared/media.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AOE_METERS_PER_CELL,
  aoePixelsPerMeter,
  aoeShapePointsPx,
  aoeOutlinePoints,
  pointInPolygon,
  aoeAffectedCells,
  cellRectPercent
} = require('./media.js');

test('AOE_METERS_PER_CELL è 1.5', () => {
  assert.equal(AOE_METERS_PER_CELL, 1.5);
});

test('aoePixelsPerMeter converte cellSize in pixel-per-metro', () => {
  assert.equal(aoePixelsPerMeter({ cellSize: 90 }), 60);
});

test('aoePixelsPerMeter usa 100 come cellSize di default se assente', () => {
  assert.equal(aoePixelsPerMeter({}), 100 / 1.5);
});

test('aoeShapePointsPx: cubo produce un quadrato centrato sull\'origine', () => {
  const points = aoeShapePointsPx('cube', 3, undefined, { cellSize: 90 });
  // ppm = 60, size = 180, metà lato = 90
  assert.deepEqual(points, [[-90, -90], [90, -90], [90, 90], [-90, 90]]);
});

test('aoeShapePointsPx: sfera produce un poligono di 32 lati, raggio esatto', () => {
  const points = aoeShapePointsPx('sphere', 3, undefined, { cellSize: 90 });
  // ppm = 60, raggio = 3 * 60 = 180
  assert.equal(points.length, 32);
  // Primo punto (angolo 0) deve puntare "su" (verso -Y) a distanza = raggio.
  assert.ok(Math.abs(points[0][0] - 0) < 1e-9);
  assert.ok(Math.abs(points[0][1] - -180) < 1e-9);
  points.forEach(([x, y]) => {
    const dist = Math.hypot(x, y);
    assert.ok(Math.abs(dist - 180) < 1e-9, `punto a distanza ${dist}, atteso 180`);
  });
});

test('aoeShapePointsPx: cono ha vertice all\'origine e base pari alla lunghezza', () => {
  const points = aoeShapePointsPx('cone', 4.5, undefined, { cellSize: 90 });
  // ppm = 60, lunghezza = 270
  assert.deepEqual(points, [[0, 0], [-135, -270], [135, -270]]);
});

test('aoeShapePointsPx: linea usa la larghezza data, o 1.5m di default', () => {
  const points = aoeShapePointsPx('line', 3, 1.5, { cellSize: 100 });
  // ppm = 100/1.5, lunghezza = 3 * ppm = 200, larghezza = 1.5 * ppm = 100, metà larghezza = 50
  assert.deepEqual(points, [[-50, 0], [50, 0], [50, -200], [-50, -200]]);
});

test('pointInPolygon: quadrato semplice', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 5], square), true);
  assert.equal(pointInPolygon([15, 5], square), false);
  assert.equal(pointInPolygon([-1, 5], square), false);
});

test('aoeOutlinePoints converte in percentuale rispettando assi X/Y separati', () => {
  const aoe = { shape: 'cube', sizeM: 1.5, x: 50, y: 50, rotation: 0 };
  const grid = { cellSize: 100 };
  // ppm = 100/1.5, size = 1.5 * ppm = 100, metà lato = 50
  const points = aoeOutlinePoints(aoe, grid, 1000, 500);
  // (50 - 50, 50 - 50) -> pixel (-50,-50) -> pct (-50/1000*100, -50/500*100) = (-5, -10) sommato a (50,50)
  assert.deepEqual(points, [
    [45, 40],
    [55, 40],
    [55, 60],
    [45, 60]
  ]);
});

test('aoeAffectedCells: sfera colpisce esattamente il blocco 3x3 attorno alla cella di origine', () => {
  const grid = { cellSize: 150, offsetX: 0, offsetY: 0 };
  // Origine = centro esatto della cella (3,3): (3.5*150, 3.5*150)... usiamo (3,3)
  // così il centro è (3+0.5)*150 = 525 su entrambi gli assi.
  const naturalW = 900, naturalH = 900;
  const originPx = 525;
  const aoe = {
    shape: 'sphere',
    sizeM: 2.25, // raggio = 2.25 * (150/1.5) = 225px
    x: (originPx / naturalW) * 100,
    y: (originPx / naturalH) * 100,
    rotation: 0
  };
  const cells = aoeAffectedCells(aoe, grid, naturalW, naturalH);
  const key = (c) => `${c.col},${c.row}`;
  const got = new Set(cells.map(key));
  const expected = new Set();
  for (let col = 2; col <= 4; col++) {
    for (let row = 2; row <= 4; row++) expected.add(`${col},${row}`);
  }
  assert.equal(got.size, 9);
  expected.forEach((k) => assert.ok(got.has(k), `manca la cella ${k}`));
});

test('cellRectPercent converte una cella in un rettangolo percentuale', () => {
  const rect = cellRectPercent(2, 3, { cellSize: 150, offsetX: 0, offsetY: 0 }, 900, 900);
  assert.deepEqual(rect, {
    leftPct: (300 / 900) * 100,
    topPct: (450 / 900) * 100,
    widthPct: (150 / 900) * 100,
    heightPct: (150 / 900) * 100
  });
});
```

- [ ] **Step 2: Esegui i test, verifica che falliscano**

Run: `node --test public/shared/media.test.js`
Expected: FAIL — `Cannot find module` o `is not a function` per ogni funzione ancora inesistente (`aoePixelsPerMeter`, `aoeShapePointsPx`, ecc. non sono esportate da `media.js`).

- [ ] **Step 3: Implementa le funzioni in `public/shared/media.js`**

In `public/control/control.js`, la funzione `rotateVector` esiste già (usata dalla matematica di pan-mode/zoom locale). **Spostala** in `media.js` — rimuovila da `control.js` (resterà accessibile lì perché `media.js` è caricato prima via `<script>`, esattamente come tutte le altre funzioni condivise).

In fondo a `public/shared/media.js`, aggiungi:

```js
const AOE_METERS_PER_CELL = 1.5;

// Ruota il vettore (x,y) di angleDeg, con la stessa convenzione di segno
// della funzione CSS rotate() (verificato empiricamente: rotate(90deg) porta
// (1,0) a (0,1), cioè orario in un sistema con Y verso il basso — lo stesso
// usato da display.css). Usare DOMMatrix invece di una matrice scritta a
// mano elimina il rischio di sbagliare il segno per le rotazioni 90/270.
function rotateVector(x, y, angleDeg) {
  const p = new DOMMatrix().rotate(angleDeg).transformPoint(new DOMPoint(x, y));
  return [p.x, p.y];
}

function aoePixelsPerMeter(grid) {
  const cellSize = (grid && grid.cellSize) || 100;
  return cellSize / AOE_METERS_PER_CELL;
}

// Punti della forma in pixel reali della mappa, centrati sull'origine locale
// (0,0), PRIMA di ogni rotazione -- il chiamante ruota e trasla. Il cono ha
// il vertice in (0,0) e si apre verso -Y (largo quanto la distanza
// dall'origine, regola ufficiale D&D); la linea parte da (0,0) verso -Y; il
// cubo è centrato sull'origine (mai ruotato: resta allineato agli assi); la
// sfera è approssimata con un poligono a 32 lati (necessario per un contorno
// disegnabile con clip-path/SVG, non distorce percettibilmente un cerchio).
function aoeShapePointsPx(shape, sizeM, widthM, grid) {
  const ppm = aoePixelsPerMeter(grid);
  const size = sizeM * ppm;
  switch (shape) {
    case 'cone':
      return [[0, 0], [-size / 2, -size], [size / 2, -size]];
    case 'cube': {
      const h = size / 2;
      return [[-h, -h], [h, -h], [h, h], [-h, h]];
    }
    case 'line': {
      const width = (widthM || AOE_METERS_PER_CELL) * ppm;
      const w = width / 2;
      return [[-w, 0], [w, 0], [w, -size], [-w, -size]];
    }
    case 'sphere': {
      const r = size;
      const SIDES = 32;
      const points = [];
      for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        points.push([r * Math.sin(a), -r * Math.cos(a)]);
      }
      return points;
    }
    default:
      return [];
  }
}

// Punti del contorno in percentuale, spazio locale (pre-rotazione mappa) --
// stesso sistema dei punti dei poligoni fog. La conversione pixel->percento
// è fatta separatamente per asse X e Y (mai un unico fattore): un'immagine
// non quadrata deformerebbe la forma se si usasse un solo rapporto.
function aoeOutlinePoints(aoe, grid, naturalW, naturalH) {
  const localPx = aoeShapePointsPx(aoe.shape, aoe.sizeM, aoe.widthM, grid);
  return localPx.map(([lx, ly]) => {
    const [rx, ry] = rotateVector(lx, ly, aoe.rotation || 0);
    return [aoe.x + (rx / naturalW) * 100, aoe.y + (ry / naturalH) * 100];
  });
}

// Test punto-in-poligono per ray casting (pari/dispari). `point` e `polygon`
// devono essere nello stesso spazio a scala uniforme (pixel reali, mai
// percentuale grezza su un'immagine non quadrata).
function pointInPolygon([px, py], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Celle della griglia il cui CENTRO ricade dentro la forma -- regola
// ufficiale D&D per il gioco su griglia. Tutta la matematica lavora in
// pixel reali della mappa (isotropi), mai in percentuale, per evitare la
// stessa distorsione descritta sopra per aoeOutlinePoints.
function aoeAffectedCells(aoe, grid, naturalW, naturalH) {
  const cellSize = Math.max(4, (grid && grid.cellSize) || 100);
  const offsetX = (grid && grid.offsetX) || 0;
  const offsetY = (grid && grid.offsetY) || 0;

  const originPxX = (aoe.x / 100) * naturalW;
  const originPxY = (aoe.y / 100) * naturalH;

  const localPolygon = aoeShapePointsPx(aoe.shape, aoe.sizeM, aoe.widthM, grid)
    .map(([lx, ly]) => rotateVector(lx, ly, aoe.rotation || 0));

  const xs = localPolygon.map(([x]) => x);
  const ys = localPolygon.map(([, y]) => y);
  const minX = originPxX + Math.min(...xs);
  const maxX = originPxX + Math.max(...xs);
  const minY = originPxY + Math.min(...ys);
  const maxY = originPxY + Math.max(...ys);

  const firstCol = Math.floor((minX - offsetX) / cellSize) - 1;
  const lastCol = Math.ceil((maxX - offsetX) / cellSize) + 1;
  const firstRow = Math.floor((minY - offsetY) / cellSize) - 1;
  const lastRow = Math.ceil((maxY - offsetY) / cellSize) + 1;

  const worldPolygon = localPolygon.map(([lx, ly]) => [originPxX + lx, originPxY + ly]);

  const cells = [];
  for (let col = firstCol; col <= lastCol; col++) {
    for (let row = firstRow; row <= lastRow; row++) {
      const centerX = offsetX + (col + 0.5) * cellSize;
      const centerY = offsetY + (row + 0.5) * cellSize;
      if (pointInPolygon([centerX, centerY], worldPolygon)) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

// Rettangolo (in percentuale) di una singola cella della griglia -- stessa
// conversione per-asse di aoeOutlinePoints, adatta a un <rect> SVG o a un
// div posizionato in percentuale.
function cellRectPercent(col, row, grid, naturalW, naturalH) {
  const cellSize = Math.max(4, (grid && grid.cellSize) || 100);
  const offsetX = (grid && grid.offsetX) || 0;
  const offsetY = (grid && grid.offsetY) || 0;
  const leftPx = offsetX + col * cellSize;
  const topPx = offsetY + row * cellSize;
  return {
    leftPct: (leftPx / naturalW) * 100,
    topPct: (topPx / naturalH) * 100,
    widthPct: (cellSize / naturalW) * 100,
    heightPct: (cellSize / naturalH) * 100
  };
}

// Esporta per i test (`node --test`); non ha alcun effetto nel browser,
// dove `module` non è definito e questo blocco non viene mai eseguito.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AOE_METERS_PER_CELL,
    rotateVector,
    aoePixelsPerMeter,
    aoeShapePointsPx,
    aoeOutlinePoints,
    pointInPolygon,
    aoeAffectedCells,
    cellRectPercent
  };
}
```

Poi, in `public/control/control.js`, rimuovi la definizione locale di `rotateVector` (quella con lo stesso identico corpo, vicino ai commenti su "Ruota il vettore (x,y)..." nella sezione del rettangolo di viewport) — resta comunque chiamabile perché ora vive in `media.js`, caricato prima nello script tag di `index.html`.

- [ ] **Step 4: Esegui i test, verifica che passino**

Run: `node --test public/shared/media.test.js`
Expected: PASS — 11/11 test verdi, nessun warning nell'output.

- [ ] **Step 5: Verifica che il browser non si sia rotto**

Il blocco `if (typeof module !== 'undefined' ...)` non deve interferire col caricamento nel browser. Apri `/control` e `/display` (vedi Task 3+ per come avviare il server) e controlla nella console che non ci siano errori — in particolare che il pan-mode (che usa `rotateVector`, ora spostato) funzioni ancora esattamente come prima.

- [ ] **Step 6: Commit**

```bash
git add public/shared/media.js public/shared/media.test.js
git commit -m "feat: add shared AoE shape/cell geometry math"
```

---

## Task 2: Stato e handler socket lato server

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: nulla dal Task 1 (il server non fa mai geometria, solo persiste i campi grezzi).
- Produces (usati dai Task 3-4):
  - `location.map.aoes` sempre un array (mai `undefined`) su ogni location, esistente o nuova.
  - Evento client→server `aoe:place { locationId, shape, sizeM, widthM, x, y }` → crea `{ id, shape, sizeM, widthM: widthM || null, x, y, rotation: 0 }`, lo aggiunge a `location.map.aoes`.
  - Evento client→server `aoe:move { locationId, aoeId, x, y }` → aggiorna `x`/`y` dell'area con quell'id.
  - Evento client→server `aoe:rotate { locationId, aoeId, rotation }` → aggiorna `rotation` (ignorato se la forma è `cube` o `sphere`).
  - Evento client→server `aoe:remove { locationId, aoeId }` → rimuove l'area con quell'id dall'array.
  - Tutti e quattro seguono `saveState(state)` + `broadcastState()`, propagando `location.map.aoes` a tutti i client via `state:update` (già esistente, nessuna modifica al meccanismo di broadcast).

- [ ] **Step 1: Aggiungi il default di migrazione in `server/state.js`**

In `DEFAULT_STATE` (circa riga 34), nell'oggetto `map` della location `taverna`, subito dopo `polygons: [...]`, aggiungi:

```js
        polygons: [
          { id: 'stanza-1', name: 'Stanza 1', points: [[5, 10], [40, 8], [42, 45], [8, 48]], revealed: false },
          { id: 'corridoio', name: 'Corridoio', points: [[55, 50], [92, 45], [94, 88], [58, 92]], revealed: false }
        ],
        aoes: []
```

Nella funzione `migrate()` (circa riga 96), subito dopo la riga `if (location.map.compass.rotation === undefined) location.map.compass.rotation = 0;`, aggiungi:

```js
    if (!Array.isArray(location.map.aoes)) location.map.aoes = [];
```

- [ ] **Step 2: Aggiungi il default nel handler `location:create` in `server/index.js`**

Nell'oggetto `map` dentro `socket.on('location:create', ...)` (circa riga 445-456), subito dopo `polygons: []`, aggiungi:

```js
        polygons: [],
        aoes: []
```

- [ ] **Step 3: Aggiungi i quattro handler socket**

In `server/index.js`, subito dopo l'handler `compass:update` (circa riga 798, dopo la sua chiusura `});`), aggiungi:

```js
  // Gli AoE sono persistiti come poligoni/griglia/bussola -- a differenza
  // del `ping:show` transitorio, restano finché il DM non li rimuove.
  socket.on('aoe:place', ({ locationId, shape, sizeM, widthM, x, y }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (!['cone', 'cube', 'sphere', 'line'].includes(shape)) return;
    if (typeof sizeM !== 'number' || !(sizeM > 0)) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (!Array.isArray(location.map.aoes)) location.map.aoes = [];
    location.map.aoes.push({
      id: nanoid(),
      shape,
      sizeM,
      widthM: shape === 'line' && typeof widthM === 'number' && widthM > 0 ? widthM : null,
      x,
      y,
      rotation: 0
    });
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:move', ({ locationId, aoeId, x, y }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    aoe.x = x;
    aoe.y = y;
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:rotate', ({ locationId, aoeId, rotation }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const aoe = location?.map.aoes?.find((a) => a.id === aoeId);
    if (!aoe) return;
    if (aoe.shape === 'cube' || aoe.shape === 'sphere') return;
    if (typeof rotation !== 'number') return;
    aoe.rotation = ((Math.round(rotation) % 360) + 360) % 360;
    saveState(state);
    broadcastState();
  });

  socket.on('aoe:remove', ({ locationId, aoeId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(location.map.aoes)) return;
    location.map.aoes = location.map.aoes.filter((a) => a.id !== aoeId);
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 4: Verifica manuale**

Avvia il server (`npm run dev`, o via il tool di preview se disponibile). Da terminale:

```bash
curl -s http://localhost:3000/api/state | node -e "const s=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(s.locations[0].map.aoes))"
```

Expected: `[]` (la location di default ora ha il campo, vuoto).

Con un client socket.io minimale o dal browser (devtools console su `/control`, dove `socket` è già globale):

```js
socket.emit('aoe:place', { locationId: 'taverna', shape: 'sphere', sizeM: 6, x: 50, y: 50 });
```

Poi ricontrolla `/api/state`: deve comparire un oggetto con `shape:'sphere', sizeM:6, rotation:0, x:50, y:50` e un `id` generato. Prova anche `aoe:move`, `aoe:rotate` (con quell'id) e `aoe:remove`, verificando ogni volta lo stato via `/api/state`. **Alla fine, rimuovi l'area di test con `aoe:remove`** così `data/state.json` torna pulito (stesso motivo per cui le sessioni precedenti di questo progetto hanno sempre ripristinato lo stato reale dopo un test).

- [ ] **Step 5: Commit**

```bash
git add server/state.js server/index.js
git commit -m "feat: persist AoE placements, add aoe:place/move/rotate/remove handlers"
```

---

## Task 3: Pulsante modalità AoE, barra forme e stepper taglia su /control

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `MODE_BUTTONS`, `setMode()`, `currentMode` (già esistenti in `control.js`, Task precedenti di questa stessa feature in sessioni passate).
- Produces (usati dal Task 4): DOM ref `aoeModeToggle`, `aoeShapeButtons`, `aoeSizeOutBtn`/`aoeSizeInBtn`/`aoeSizeLevel`, `aoeWidthRow`/`aoeWidthOutBtn`/`aoeWidthInBtn`/`aoeWidthLevel`, `aoeChipList`, `mapAoeSvg`; variabili di stato `aoeSelectedShape`, `aoeSelectedSize`, `aoeSelectedWidth`.

Questo task costruisce SOLO la UI di selezione (pulsante modalità, barra forme, stepper) e il quinto pulsante esclusivo. Piazzamento/spostamento/rotazione/lista arrivano nel Task 4.

- [ ] **Step 1: Icone SVG**

In `public/control/index.html`, nel blocco `<svg style="display:none"><symbol>...</symbol></svg>` in cima al file, subito dopo il simbolo `i-zoom`, aggiungi:

```html
  <symbol id="i-aoe" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-shape-cone" viewBox="0 0 24 24"><path d="M12 3 21 20H3Z"/></symbol>
  <symbol id="i-shape-cube" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></symbol>
  <symbol id="i-shape-sphere" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></symbol>
  <symbol id="i-shape-line" viewBox="0 0 24 24"><path d="M4 20 20 4"/></symbol>
```

- [ ] **Step 2: Quinto pulsante modalità**

In `public/control/index.html`, dentro `<div id="map-mode-toggles">`, subito dopo il pulsante `#zoom-mode-toggle` e prima della sua chiusura `</div>`, aggiungi:

```html
            <button id="aoe-mode-toggle" class="icon-btn map-mode-btn" title="Area d'effetto">
              <svg class="icon"><use href="#i-aoe"></use></svg>
            </button>
```

- [ ] **Step 3: Pannello AoE**

In `public/control/index.html`, dentro il `.tab-panel[data-tab="mappa"]`, **prima** di `<div id="map-column">` (così la barra appare sopra la mappa), aggiungi:

```html
      <section id="aoe-panel" class="control-section" hidden>
        <div class="aoe-shape-bar">
          <button class="aoe-shape-btn" data-shape="cone" title="Cono">
            <svg class="icon"><use href="#i-shape-cone"></use></svg>
          </button>
          <button class="aoe-shape-btn" data-shape="cube" title="Cubo">
            <svg class="icon"><use href="#i-shape-cube"></use></svg>
          </button>
          <button class="aoe-shape-btn" data-shape="sphere" title="Sfera">
            <svg class="icon"><use href="#i-shape-sphere"></use></svg>
          </button>
          <button class="aoe-shape-btn" data-shape="line" title="Linea">
            <svg class="icon"><use href="#i-shape-line"></use></svg>
          </button>
        </div>
        <div class="zoom">
          <button id="aoe-size-out" title="Riduci taglia">−</button>
          <span id="aoe-size-level">1,5 m</span>
          <button id="aoe-size-in" title="Aumenta taglia">+</button>
        </div>
        <div id="aoe-width-row" class="zoom" hidden>
          <button id="aoe-width-out" title="Riduci larghezza">−</button>
          <span id="aoe-width-level">1,5 m</span>
          <button id="aoe-width-in" title="Aumenta larghezza">+</button>
        </div>
        <div id="aoe-chip-list" class="aoe-chip-list"></div>
      </section>
```

- [ ] **Step 4: SVG di rendering forma/celle**

In `public/control/index.html`, dentro `#map-fit-box`, subito dopo `<div class="fog-layer" id="map-fog-layer"></div>`, aggiungi:

```html
              <svg id="map-aoe-svg" class="aoe-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
```

- [ ] **Step 5: CSS**

In `public/control/control.css`, aggiungi (vicino alle regole di `.fog-overlay`, per raggrupparle con le altre regole del contenuto mappa):

```css
.aoe-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.aoe-shape-overlay {
  fill: var(--accent-bg-subtle);
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  cursor: grab;
}

.aoe-shape-overlay.selected {
  stroke-width: 3;
}

.aoe-cell-highlight {
  fill: var(--accent-bg-subtle);
  stroke: var(--accent);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.aoe-shape-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.aoe-shape-bar .aoe-shape-btn {
  flex: 1;
}

.aoe-shape-btn.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.aoe-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.aoe-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  cursor: pointer;
}

.aoe-chip.selected {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
}

.aoe-chip-rotate,
.aoe-chip-remove {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--bg-panel);
  color: var(--text-primary);
  padding: 0;
}
```

- [ ] **Step 6: DOM ref e stato in `control.js`**

In `public/control/control.js`, subito dopo la riga `const zoomModeToggle = document.getElementById('zoom-mode-toggle');`, aggiungi:

```js
const aoeModeToggle = document.getElementById('aoe-mode-toggle');
const aoePanel = document.getElementById('aoe-panel');
const aoeShapeButtons = Array.from(document.querySelectorAll('.aoe-shape-btn'));
const aoeSizeOutBtn = document.getElementById('aoe-size-out');
const aoeSizeInBtn = document.getElementById('aoe-size-in');
const aoeSizeLevel = document.getElementById('aoe-size-level');
const aoeWidthRow = document.getElementById('aoe-width-row');
const aoeWidthOutBtn = document.getElementById('aoe-width-out');
const aoeWidthInBtn = document.getElementById('aoe-width-in');
const aoeWidthLevel = document.getElementById('aoe-width-level');
const aoeChipList = document.getElementById('aoe-chip-list');
const mapAoeSvg = document.getElementById('map-aoe-svg');

let aoeSelectedShape = 'cone';
let aoeSelectedSize = AOE_METERS_PER_CELL;
let aoeSelectedWidth = AOE_METERS_PER_CELL;

function renderAoePanel() {
  aoePanel.hidden = currentMode !== 'aoe';
  aoeShapeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.shape === aoeSelectedShape));
  aoeSizeLevel.textContent = `${aoeSelectedSize.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;
  aoeWidthRow.hidden = aoeSelectedShape !== 'line';
  aoeWidthLevel.textContent = `${aoeSelectedWidth.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;
}

aoeShapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aoeSelectedShape = btn.dataset.shape;
    renderAoePanel();
  });
});

function stepAoeSize(delta) {
  aoeSelectedSize = Math.max(AOE_METERS_PER_CELL, aoeSelectedSize + delta);
  renderAoePanel();
}
aoeSizeOutBtn.addEventListener('click', () => stepAoeSize(-AOE_METERS_PER_CELL));
aoeSizeInBtn.addEventListener('click', () => stepAoeSize(AOE_METERS_PER_CELL));

function stepAoeWidth(delta) {
  aoeSelectedWidth = Math.max(AOE_METERS_PER_CELL, aoeSelectedWidth + delta);
  renderAoePanel();
}
aoeWidthOutBtn.addEventListener('click', () => stepAoeWidth(-AOE_METERS_PER_CELL));
aoeWidthInBtn.addEventListener('click', () => stepAoeWidth(AOE_METERS_PER_CELL));
```

Aggiungi `aoe: aoeModeToggle` a `MODE_BUTTONS` (circa riga 668):

```js
const MODE_BUTTONS = { pan: panModeToggle, fog: fogModeToggle, ping: pingModeToggle, zoom: zoomModeToggle, aoe: aoeModeToggle };
```

Dentro `setMode()` (circa riga 673-682), aggiungi il toggle della classe mappa e la chiamata a `renderAoePanel()`:

```js
  mapPreview.classList.toggle('mode-zoom', currentMode === 'zoom');
  mapPreview.classList.toggle('mode-aoe', currentMode === 'aoe');
  renderAoePanel();
}
```

(la riga `mapPreview.classList.toggle('mode-zoom', ...)` esiste già: aggiungi la riga `mode-aoe` e la chiamata a `renderAoePanel()` subito dopo, senza toccare il resto della funzione).

- [ ] **Step 7: Regola CSS del cursore per la nuova modalità**

In `public/control/control.css`, dove sono definite `.map-preview.mode-pan`, `.map-preview.mode-ping`, `.map-preview.mode-zoom` (cursori) e la regola `touch-action: none` che le elenca tutte, aggiungi `mode-aoe` a entrambi i gruppi:

```css
.map-preview.mode-aoe {
  cursor: crosshair;
}
```

E nella regola `touch-action: none` che elenca `.map-preview.mode-pan`, `.map-preview.mode-ping`, `.map-preview.mode-zoom` (con i relativi `*`), aggiungi anche `.map-preview.mode-aoe` e `.map-preview.mode-aoe *` allo stesso selettore combinato.

- [ ] **Step 8: Verifica manuale**

Avvia il server, apri `/control`. Attiva la modalità AoE (quinto pulsante): deve comparire il pannello con la barra 4 forme sulla stessa riga, sopra la mappa, e lo stepper taglia. Seleziona "Linea": deve comparire anche lo stepper larghezza. Premi +/− sulla taglia: il valore cambia a passi di 1,5m, mai sotto 1,5m. Disattiva la modalità (ripremi il pulsante AoE, o attivane un'altra): il pannello sparisce. Verifica che le altre 4 modalità (Sposta/Fog/Ping/Zoom locale) continuino a funzionare esattamente come prima — nessuna riga di `setMode`/`MODE_BUTTONS` preesistente è stata alterata, solo estesa.

- [ ] **Step 9: Commit**

```bash
git add public/control/index.html public/control/control.css public/control/control.js
git commit -m "feat: add AoE mode toggle, shape picker and size stepper to /control"
```

---

## Task 4: Piazzamento, spostamento, rotazione e lista aree su /control

**Files:**
- Modify: `public/control/control.js`
- Modify: `public/control/control.css`

**Interfaces:**
- Consumes: `aoeOutlinePoints`, `aoeAffectedCells`, `cellRectPercent`, `polygonClipPath`... in realtà per SVG non serve `polygonClipPath` (quello è per `clip-path` CSS, qui si costruiscono `<polygon>`/`<rect>` SVG direttamente) — usa `aoeOutlinePoints`/`aoeAffectedCells`/`cellRectPercent` dal Task 1, `computeTotalRotation`/`rotatePointToBase`/`mediaW`/`mediaH` già esistenti in `control.js`. Consuma `mapFitBox`, `aoeModeToggle`, `aoeSelectedShape/Size/Width`, `mapAoeSvg`, `aoeChipList`, `previewLocationId`, `getPreviewLocation()` dal Task 3 e dal codice preesistente.
- Produces: nessuna interfaccia nuova per altri task — questo completa la UI di `/control` per l'AoE. Il Task 5 consuma solo `aoeOutlinePoints`/`aoeAffectedCells`/`cellRectPercent` (Task 1) e lo stato `location.map.aoes` (Task 2), non codice da qui.

- [ ] **Step 1: Disabilita il pulsante AoE quando non ha senso piazzare**

In `render()`, subito dopo il blocco che già disabilita `pingModeToggle` (quello con il commento "Il ping arriva ai giocatori solo se..."), aggiungi la stessa regola per l'AoE:

```js
  // Stessa regola del Ping: piazzare un'area ha senso solo sulla mappa che
  // i giocatori vedono davvero ora.
  aoeModeToggle.disabled = isPreviewing || showingImage || !state.activeLocationId;
  if (aoeModeToggle.disabled && currentMode === 'aoe') setMode(null);
```

- [ ] **Step 2: Render delle aree piazzate (SVG forma + celle) e della lista chip**

Aggiungi in `control.js`, vicino a `renderFogOverlays` (stessa zona del file, stesso stile di commento):

```js
let selectedAoeId = null;

function setSelectedAoeId(id) {
  selectedAoeId = id;
  render();
}

// Disegna, per ogni area piazzata, prima le celle colpite (sotto) poi il
// contorno della forma (sopra) -- altrimenti il contorno sparirebbe sotto
// il riempimento delle celle.
function renderAoeOverlays(aoes, grid, naturalW, naturalH) {
  mapAoeSvg.innerHTML = '';
  if (!naturalW || !naturalH) return;
  aoes.forEach((aoe) => {
    aoeAffectedCells(aoe, grid, naturalW, naturalH).forEach(({ col, row }) => {
      const rect = cellRectPercent(col, row, grid, naturalW, naturalH);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', rect.leftPct);
      el.setAttribute('y', rect.topPct);
      el.setAttribute('width', rect.widthPct);
      el.setAttribute('height', rect.heightPct);
      el.setAttribute('class', 'aoe-cell-highlight');
      mapAoeSvg.appendChild(el);
    });

    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', `aoe-shape-overlay ${aoe.id === selectedAoeId ? 'selected' : ''}`);
    poly.dataset.id = aoe.id;
    mapAoeSvg.appendChild(poly);
  });
}

function aoeShapeLabel(shape) {
  return { cone: 'Cono', cube: 'Cubo', sphere: 'Sfera', line: 'Linea' }[shape] || shape;
}

function renderAoeChipList(aoes) {
  aoeChipList.innerHTML = aoes
    .map((aoe) => {
      const sizeText = aoe.sizeM.toLocaleString('it-IT', { minimumFractionDigits: 1 });
      const selected = aoe.id === selectedAoeId;
      const rotatable = aoe.shape === 'cone' || aoe.shape === 'line';
      const rotateButtons = selected && rotatable
        ? `<button class="aoe-chip-rotate" data-dir="-1" title="Ruota a sinistra">↺</button>`
        : '';
      const rotateButtonsRight = selected && rotatable
        ? `<button class="aoe-chip-rotate" data-dir="1" title="Ruota a destra">↻</button>`
        : '';
      const removeButton = selected ? `<button class="aoe-chip-remove" title="Rimuovi">✕</button>` : '';
      return `
        <div class="aoe-chip ${selected ? 'selected' : ''}" data-id="${aoe.id}">
          ${rotateButtons}
          <span class="aoe-chip-label">${escapeHtml(aoeShapeLabel(aoe.shape))} ${sizeText}m</span>
          ${rotateButtonsRight}
          ${removeButton}
        </div>
      `;
    })
    .join('');
}
```

- [ ] **Step 3: Chiama i render dal punto giusto di `renderMapPreview`**

In `renderMapPreview(location)`, sia nel ramo con mappa (dentro la callback di `loadMapMedia`, subito dopo la chiamata a `renderFogOverlays(polygons)`) sia nel ramo senza mappa (subito dopo l'altra chiamata a `renderFogOverlays(polygons)`), aggiungi la chiamata gemella:

```js
      renderFogOverlays(polygons);
      renderAoeOverlays((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
```

(in entrambi i punti dove oggi c'è solo `renderFogOverlays(polygons);`, aggiungi la riga di `renderAoeOverlays` subito dopo, usando `mediaW(activeMapEl)`/`mediaH(activeMapEl)` come `naturalW`/`naturalH` — nel ramo "senza mappa" questi risulteranno 0, e `renderAoeOverlays` già gestisce quel caso uscendo subito).

Aggiungi anche, in `render()` (la funzione principale, non `renderMapPreview`), una chiamata a `renderAoeChipList` usando la location in anteprima:

```js
  renderAoeChipList((previewLocation && previewLocation.map.aoes) || []);
```

Aggiungila subito dopo la riga `renderMapPreview(previewLocation);` già presente in `render()`. Aggiungi anche la pulizia della selezione, sullo stesso modello già usato per `previewImageId`:

```js
  if (selectedAoeId && !((previewLocation && previewLocation.map.aoes) || []).some((a) => a.id === selectedAoeId)) {
    selectedAoeId = null;
  }
```

(mettila subito prima della chiamata a `renderAoeChipList`, così la lista si ridisegna già senza il chip espanso se l'area selezionata è stata rimossa).

- [ ] **Step 4: Interazione — piazzamento (tap) e spostamento (trascinamento)**

Aggiungi, vicino agli altri listener di `mapFitBox` (dopo quelli del Ping):

```js
// AoE: un tap su un'area vuota della mappa piazza una nuova area (forma/
// taglia correnti); un trascinamento che parte da un'area già disegnata la
// sposta invece di piazzarne una nuova. Stessa soglia di 8px del ping per
// distinguere un tap da un trascinamento accidentale.
let aoePlaceStart = null;
let aoeDrag = null;

mapFitBox.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) return;
  const overlay = e.target.closest('.aoe-shape-overlay');
  if (overlay) {
    aoeDrag = { id: overlay.dataset.id, pointerId: e.pointerId };
    setSelectedAoeId(overlay.dataset.id);
  } else {
    aoePlaceStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }
});

function localPointFromEvent(e) {
  const previewLocation = getPreviewLocation();
  if (!previewLocation) return null;
  const rect = mapFitBox.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const rx = ((e.clientX - rect.left) / rect.width) * 100;
  const ry = ((e.clientY - rect.top) / rect.height) * 100;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, previewLocation.map.flip180, previewLocation.map.rotate90);
  return rotatePointToBase([rx, ry], rotation);
}

mapFitBox.addEventListener('pointermove', (e) => {
  if (!aoeDrag || e.pointerId !== aoeDrag.pointerId) return;
  const point = localPointFromEvent(e);
  if (!point) return;
  const [x, y] = point;
  socket.emit('aoe:move', { locationId: previewLocationId, aoeId: aoeDrag.id, x, y });
});

mapFitBox.addEventListener('pointerup', (e) => {
  if (aoeDrag && e.pointerId === aoeDrag.pointerId) {
    aoeDrag = null;
    return;
  }
  if (!aoePlaceStart || e.pointerId !== aoePlaceStart.pointerId) return;
  const { x: startX, y: startY } = aoePlaceStart;
  aoePlaceStart = null;
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) return;

  const point = localPointFromEvent(e);
  if (!point) return;
  const [x, y] = point;
  socket.emit('aoe:place', {
    locationId: previewLocationId,
    shape: aoeSelectedShape,
    sizeM: aoeSelectedSize,
    widthM: aoeSelectedShape === 'line' ? aoeSelectedWidth : undefined,
    x,
    y
  });
});

mapFitBox.addEventListener('pointercancel', (e) => {
  if (aoeDrag && e.pointerId === aoeDrag.pointerId) aoeDrag = null;
  if (aoePlaceStart && e.pointerId === aoePlaceStart.pointerId) aoePlaceStart = null;
});
```

- [ ] **Step 5: Interazione — selezione, rotazione e rimozione dalla lista chip**

```js
aoeChipList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.aoe-chip-remove');
  if (removeBtn) {
    const chip = removeBtn.closest('.aoe-chip');
    socket.emit('aoe:remove', { locationId: previewLocationId, aoeId: chip.dataset.id });
    return;
  }
  const rotateBtn = e.target.closest('.aoe-chip-rotate');
  if (rotateBtn) {
    const chip = rotateBtn.closest('.aoe-chip');
    const previewLocation = getPreviewLocation();
    const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === chip.dataset.id);
    if (!aoe) return;
    const dir = Number(rotateBtn.dataset.dir);
    const nextRotation = ((aoe.rotation + dir * 15) % 360 + 360) % 360;
    socket.emit('aoe:rotate', { locationId: previewLocationId, aoeId: aoe.id, rotation: nextRotation });
    return;
  }
  const chip = e.target.closest('.aoe-chip');
  if (chip) setSelectedAoeId(selectedAoeId === chip.dataset.id ? null : chip.dataset.id);
});
```

- [ ] **Step 6: Verifica manuale end-to-end**

Avvia il server, apri `/control` in una scheda e `/display` in un'altra (stesso pattern a due schede già usato per verificare il Ping in questo stesso progetto). Sulla location attiva:

1. Attiva la modalità AoE, scegli "Sfera", lascia la taglia a 1,5m, tocca un punto della mappa dentro il riquadro di inquadratura (`viewport-rect`) — deve comparire sia su `/control` sia su `/display` il contorno del cerchio e la cella evidenziata sotto di esso.
2. Cambia forma in "Cono", aumenta la taglia a 6m con lo stepper, tocca un altro punto — deve comparire un secondo triangolo, entrambe le aree restano visibili insieme (più aree contemporanee).
3. Trascina il cono appena piazzato: deve seguire il dito/il puntatore, aggiornandosi anche su `/display`.
4. Tocca il chip del cono nella lista: deve espandersi con ↺/↻/✕; premi ↻ due volte: il triangolo ruota di 30° in totale, visibile su entrambe le pagine.
5. Premi ✕ sul chip: l'area sparisce da entrambe le pagine e dalla lista.
6. Prova a piazzare un'area mentre sei in anteprima di un'altra location (non quella attiva): il pulsante AoE deve risultare disabilitato, coerente col Ping.
7. Controlla la console di entrambe le pagine: nessun errore.

Al termine, rimuovi tutte le aree di test rimaste (premendo ✕ su ciascuna) così lo stato reale resta pulito, come già fatto per i test precedenti in questa sessione.

- [ ] **Step 7: Commit**

```bash
git add public/control/control.js public/control/control.css
git commit -m "feat: place, drag, rotate and remove AoE shapes from /control"
```

---

## Task 5: Rendering sola lettura su /display

**Files:**
- Modify: `public/display/index.html`
- Modify: `public/display/display.css`
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: `aoeOutlinePoints`, `aoeAffectedCells`, `cellRectPercent` (Task 1); `location.map.aoes`, `location.map.grid` (Task 2, già dentro ogni `state:update`).
- Produces: nessuna interfaccia — è l'ultimo task della feature.

- [ ] **Step 1: SVG di rendering**

In `public/display/index.html`, dentro `#map-fit-box`, subito dopo `<svg id="map-grid-svg" ...></svg>` e prima del marcatore ping (`<div id="ping-marker" ...>`), aggiungi:

```html
        <svg id="map-aoe-svg" class="aoe-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
```

- [ ] **Step 2: CSS**

In `public/display/display.css`, aggiungi (vicino alle regole `.compass`/`.ping-marker`, stesso raggruppamento "overlay sulla mappa"):

```css
/* Sola lettura sul display: i giocatori vedono, non toccano mai l'area. */
.aoe-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.aoe-shape-overlay {
  fill: var(--accent-bg-subtle);
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.aoe-cell-highlight {
  fill: var(--accent-bg-subtle);
  stroke: var(--accent);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
```

- [ ] **Step 3: Render in `display.js`**

Aggiungi il DOM ref, vicino agli altri in cima al file:

```js
const mapAoeSvg = document.getElementById('map-aoe-svg');
```

Aggiungi la funzione di rendering, vicino a `renderFog`:

```js
// Stessa logica di renderAoeOverlays in control.js, sola lettura: nessun
// listener di interazione, i giocatori vedono soltanto.
function renderAoe(aoes, grid, naturalW, naturalH) {
  mapAoeSvg.innerHTML = '';
  if (!naturalW || !naturalH) return;
  aoes.forEach((aoe) => {
    aoeAffectedCells(aoe, grid, naturalW, naturalH).forEach(({ col, row }) => {
      const rect = cellRectPercent(col, row, grid, naturalW, naturalH);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', rect.leftPct);
      el.setAttribute('y', rect.topPct);
      el.setAttribute('width', rect.widthPct);
      el.setAttribute('height', rect.heightPct);
      el.setAttribute('class', 'aoe-cell-highlight');
      mapAoeSvg.appendChild(el);
    });

    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', 'aoe-shape-overlay');
    mapAoeSvg.appendChild(poly);
  });
}
```

Chiama `renderAoe` in `renderMap(state, location, returningFromImage)`, in entrambi i rami (con mappa e senza), subito dopo le rispettive chiamate a `renderFog(polygons)` — stesso schema del Task 4 per `control.js`:

```js
      renderFog(polygons);
      renderAoe((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
```

(sostituisci le DUE occorrenze di `renderFog(polygons);` già esistenti in `renderMap`, una nel ramo con `location.map.file`, una nel ramo senza, aggiungendo la riga gemella subito dopo ciascuna).

Aggiungi anche la pulizia quando si mostra un'immagine al posto della mappa o si cambia location, sullo stesso modello già usato per `hidePing()` in `render(state)`:

```js
  if (showingImage || locationId !== lastPingLocationId) {
    hidePing();
    mapAoeSvg.innerHTML = '';
  }
```

(questo blocco esiste già con solo `hidePing();` dentro — aggiungi la riga `mapAoeSvg.innerHTML = '';` subito dopo, stesso `if`).

- [ ] **Step 4: Verifica manuale**

Con `/control` e `/display` aperti (stesso setup del Task 4), piazza un'area su `/control`: deve comparire su `/display` con lo stesso identico contorno e le stesse celle evidenziate — confronta visivamente le due schermate fianco a fianco, devono coincidere esattamente (stessa geometria, stesso calcolo). Prova a passare a mostrare un'immagine al posto della mappa (dalla scheda Immagini di `/control`): l'overlay AoE su `/display` deve sparire insieme alla mappa. Torna alla mappa: deve ricomparire. Cambia location attiva: le aree della vecchia location non devono comparire sulla nuova.

- [ ] **Step 5: Commit**

```bash
git add public/display/index.html public/display/display.css public/display/display.js
git commit -m "feat: render AoE shape outline and affected cells on /display"
```

---

## Self-Review Checklist (da eseguire dopo aver scritto tutto il piano)

- **Copertura spec:** modello dati (Task 2), conversione metri↔pixel (Task 1), 4 forme + rotazione 15° cono/linea (Task 1+4), taglia in celle da 1,5m con default 1,5m (Task 3), contorno + celle evidenziate (Task 1+4+5), persistenza (Task 2), sincronizzazione live su `/display` (Task 5), più aree contemporanee con lista/selezione/rimozione (Task 4), pulsante disabilitato su preview/immagine (Task 4) — tutti coperti.
- **Placeholder:** nessuno; ogni step ha codice completo e comandi di verifica concreti.
- **Coerenza tipi:** `aoe.sizeM`/`aoe.widthM`/`aoe.x`/`aoe.y`/`aoe.rotation` usati con lo stesso nome in Task 1 (funzioni pure), Task 2 (schema server), Task 4 (emit socket) e Task 5 (rendering) — nessuna divergenza di naming tra i task.
