# Decorazioni Shader (Scenografia Mappa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere al DM di piazzare da `/editor` decorazioni shader GLSL statiche (a partire da "Portale") sulla mappa di una location, ridimensionabili in larghezza/altezza indipendenti, coperte dal fog of war, visibili animate su `/control` e `/display`.

**Architecture:** Nuovo array `location.map.shaders` persistito lato server (stesso schema find→valida→muta→salva→broadcast di compass/polygon/AoE). Un modulo condiviso (`public/shared/shader-effects.js`) espone il registro degli shader e una classe `ShaderLayer` che gestisce un `<canvas>` WebGL2 riusato identico da `/editor` (anteprima live durante il piazzamento), `/control` e `/display`. Il piazzamento in editor riusa il gesto di trascinamento già esistente per la calibrazione griglia; la modifica successiva (selezione + stepper larghezza/altezza) riusa il pattern già in uso per le aree d'effetto su `/control`.

**Tech Stack:** WebGL2 (nessuna libreria esterna), JS vanilla, socket.io (già in uso), `node --test` per la sola geometria pura testabile.

**Spec:** `docs/superpowers/specs/2026-09-26-shader-decorations-design.md`

## Global Constraints

- 1 cella griglia = 1,5 metri (`AOE_METERS_PER_CELL` in `public/shared/media.js`) — stessa scala per larghezza/altezza delle decorazioni shader.
- Taglia minima di una decorazione: 0,5 metri (larghezza e altezza indipendentemente). Tetto di sicurezza: riusa `MAX_AOE_SIZE_M` (300) già definito in `server/index.js`.
- Nessuna rotazione, nessun colore personalizzabile per le decorazioni (fuori scope, per design).
- Nessuna dipendenza CDN o asset immagine esterno: la texture di rumore richiesta dallo shader "Portale" è generata proceduralmente in JS, mai caricata da file.
- Ordine dei livelli su `/control` e `/display`: il canvas shader va **tra** l'immagine/video della mappa e il layer fog (`#map-fog-layer`) — mai sopra griglia o AoE. Su `/editor` non esiste un layer fog che nasconde contenuto (i poligoni fog sono solo contorni editabili): il canvas va comunque tra l'immagine e `#grid-svg`/`#polygon-svg`, per coerenza di posizione anche se lì non ha un effetto di occlusione.
- Deve girare fluido su Raspberry Pi 4 (Chromium, driver V3D) — già verificato fattibile dall'utente per shader a singola passata su un'area limitata dello schermo.

---

### Task 1: Geometria condivisa + modulo di rendering WebGL

**Files:**
- Modify: `public/shared/media.js` (aggiunge `shaderDecorationRectPercent`)
- Modify: `public/shared/media.test.js` (test della funzione sopra)
- Create: `public/shared/shader-effects.js` (registro shader + classe `ShaderLayer`)

**Interfaces:**
- Consumes: `aoePixelsPerMeter(grid)` (già esistente in `media.js`, converte `grid.cellSize` in pixel-per-metro usando `AOE_METERS_PER_CELL`).
- Produces:
  - `shaderDecorationRectPercent(deco, grid, naturalW, naturalH)` → `{ leftPct, topPct, widthPct, heightPct }` (numeri), dove `deco` è `{ x, y, widthM, heightM }` (`x`/`y` = centro in percentuale 0-100).
  - `SHADER_EFFECTS` (oggetto, chiave `shaderId` → `{ label, usesNoiseTexture, fragmentSrc }`).
  - `class ShaderLayer { constructor(canvasEl); render(decorations, grid, naturalW, naturalH); }` — usata identica da Task 3 e Task 4.

- [ ] **Step 1: Scrivi il test per `shaderDecorationRectPercent`**

Aggiungi in `public/shared/media.test.js`, nell'import in cima al file aggiungi `shaderDecorationRectPercent` all'elenco destrutturato da `require('./media.js')`, poi in fondo al file:

```js
test('shaderDecorationRectPercent converte centro+dimensioni in un rettangolo percentuale', () => {
  const grid = { cellSize: 150 }; // ppm = 150/1.5 = 100 px/metro
  const deco = { x: 50, y: 50, widthM: 2, heightM: 1 }; // 200x100 px
  const rect = shaderDecorationRectPercent(deco, grid, 1000, 1000);
  // centro a (500,500)px, metà larghezza 100px, metà altezza 50px
  assert.deepEqual(rect, {
    leftPct: (400 / 1000) * 100,
    topPct: (450 / 1000) * 100,
    widthPct: (200 / 1000) * 100,
    heightPct: (100 / 1000) * 100
  });
});

test('shaderDecorationRectPercent rispetta assi X/Y separati su un\'immagine non quadrata', () => {
  const grid = { cellSize: 100 }; // ppm = 100/1.5
  const deco = { x: 50, y: 50, widthM: 1.5, heightM: 1.5 }; // 100x100 px
  const rect = shaderDecorationRectPercent(deco, grid, 1000, 500);
  assert.deepEqual(rect, {
    leftPct: (450 / 1000) * 100,
    topPct: (200 / 500) * 100,
    widthPct: (100 / 1000) * 100,
    heightPct: (100 / 500) * 100
  });
});
```

- [ ] **Step 2: Esegui i test, verifica che falliscano**

Run: `node --test public/shared/media.test.js`
Expected: FAIL — `shaderDecorationRectPercent is not a function` (non ancora esportata/definita).

- [ ] **Step 3: Implementa `shaderDecorationRectPercent` in `media.js`**

Aggiungi subito dopo la definizione di `cellRectPercent` (che ha la stessa forma di conversione per-asse):

```js
// Rettangolo (in percentuale) di una decorazione shader piazzata da
// /editor -- stessa conversione per-asse di cellRectPercent/
// aoeOutlinePoints: mai un unico fattore, altrimenti un'immagine non
// quadrata deformerebbe il rettangolo scelto dal DM. `deco.x`/`deco.y`
// sono il CENTRO del rettangolo (percentuale 0-100), come bussola e AoE.
function shaderDecorationRectPercent(deco, grid, naturalW, naturalH) {
  const ppm = aoePixelsPerMeter(grid);
  const widthPx = deco.widthM * ppm;
  const heightPx = deco.heightM * ppm;
  const centerPxX = (deco.x / 100) * naturalW;
  const centerPxY = (deco.y / 100) * naturalH;
  const leftPx = centerPxX - widthPx / 2;
  const topPx = centerPxY - heightPx / 2;
  return {
    leftPct: (leftPx / naturalW) * 100,
    topPct: (topPx / naturalH) * 100,
    widthPct: (widthPx / naturalW) * 100,
    heightPct: (heightPx / naturalH) * 100
  };
}
```

Poi aggiungi `shaderDecorationRectPercent,` all'oggetto `module.exports` in fondo al file (nello stesso blocco `if (typeof module !== 'undefined' && module.exports) { ... }` già presente), vicino a `cellRectPercent`.

- [ ] **Step 4: Esegui i test, verifica che passino**

Run: `node --test public/shared/media.test.js`
Expected: PASS, incluse le due nuove asserzioni. Il totale dei test esistenti (28 prima di questo task) deve restare verde.

- [ ] **Step 5: Crea `public/shared/shader-effects.js` con il registro shader e la classe `ShaderLayer`**

File completo:

```js
// Vertex shader condiviso da ogni effetto: un solo triangolo che copre
// l'intero viewport (trucco standard "fullscreen triangle"), nessun
// vertex buffer necessario -- le posizioni sono nel array `positions`,
// indicizzato da gl_VertexID.
const SHADER_VERTEX_SRC = `#version 300 es
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

// Registro shader: aggiungere un nuovo stile (es. "luci", "area
// d'effetto") significa aggiungere qui una voce -- quando servirà un
// selettore in UI basterà un dropdown nella sidebar di /editor, nessuna
// modifica strutturale a ShaderLayer.
const SHADER_EFFECTS = {
  portal: {
    label: 'Portale',
    usesNoiseTexture: true,
    fragmentSrc: `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_noise;

out vec4 fragColor;

// Noise animation - Electric
// by nimitz (stormoid.com) (twitter: @stormoid)
// modified to look like a portal by Pleh
// fbm tweaks by foxes
#define time u_time*0.15
#define tau 6.2831853

mat2 makem2(in float theta){float c = cos(theta);float s = sin(theta);return mat2(c,-s,s,c);}
float noise( in vec2 x ){return texture(u_noise, x*.01).x;}

float fbm(in vec2 p)
{
vec4 tt=fract(vec4(time*2.)+vec4(0.0,0.25,0.5,0.75));
vec2 p1=p-normalize(p)*tt.x;
vec2 p2=vec2(1.0)+p-normalize(p)*tt.y;
vec2 p3=vec2(2.0)+p-normalize(p)*tt.z;
vec2 p4=vec2(3.0)+p-normalize(p)*tt.w;
vec4 tr=vec4(1.0)-abs(tt-vec4(0.5))*2.0;
float z=2.;
vec4 rz = vec4(0.);
for (float i= 1.;i < 4.;i++)
{
rz+= abs((vec4(noise(p1),noise(p2),noise(p3),noise(p4))-vec4(0.5))*2.)/z;
z = z*2.;
p1 = p1*2.;
p2 = p2*2.;
p3 = p3*2.;
p4 = p4*2.;
}
return dot(rz,tr)*0.25;
}

float dualfbm(in vec2 p)
{
vec2 p2 = p*.7;
vec2 basis = vec2(fbm(p2-time*1.6),fbm(p2+time*1.7));
basis = (basis-.5)*.2;
p += basis;
return fbm(p);
}

float circ(vec2 p)
{
float r = length(p);
r = log(sqrt(r));
return abs(mod(r*2.,tau)-4.54)*3.+.5;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
vec2 p = fragCoord.xy / u_resolution.xy-0.5;
p.x *= u_resolution.x/u_resolution.y;
p*=4.;

float rz = dualfbm(p);
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));

vec3 col = vec3(.1,0.1,0.4)/rz;
col=pow(abs(col),vec3(.99));
fragColor = vec4(col,1.);
}

void main() {
  mainImage(fragColor, gl_FragCoord.xy);
}
`
  }
};

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Errore di compilazione shader: ${info}`);
  }
  return shader;
}

function linkProgram(gl, vertexSrc, fragmentSrc) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Errore di link shader: ${info}`);
  }
  return program;
}

// Renderizza le decorazioni shader di una location su un <canvas> dedicato,
// riusato identico da /editor (anteprima live), /control e /display. Se
// WebGL2 non è disponibile `available` è false e `render()` è un no-op
// silenzioso -- non ci aspettiamo che capiti sull'hardware reale (Raspberry
// Pi 4 + Chromium, già verificato dall'utente), ma niente pagina bianca se
// succede.
class ShaderLayer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = canvasEl.getContext('webgl2');
    this.programs = new Map(); // shaderId -> WebGLProgram
    this.noiseTexture = null;
    this.lastCssW = 0;
    this.lastCssH = 0;
  }

  get available() {
    return Boolean(this.gl);
  }

  getProgram(shaderId) {
    if (this.programs.has(shaderId)) return this.programs.get(shaderId);
    const def = SHADER_EFFECTS[shaderId];
    if (!def) return null;
    const program = linkProgram(this.gl, SHADER_VERTEX_SRC, def.fragmentSrc);
    this.programs.set(shaderId, program);
    return program;
  }

  ensureNoiseTexture() {
    if (this.noiseTexture) return this.noiseTexture;
    const gl = this.gl;
    const size = 256;
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.noiseTexture = texture;
    return texture;
  }

  // Va richiamato a ogni render, non solo alla creazione: ridimensiona il
  // buffer interno del canvas alla sua dimensione CSS reale (moltiplicata
  // per devicePixelRatio, per non sfocare su schermi ad alta densità).
  // Senza questo il canvas resta bloccato alla prima misura presa, anche se
  // il contenitore cambia dimensione dopo.
  syncCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    if (cssW === this.lastCssW && cssH === this.lastCssH) return;
    this.lastCssW = cssW;
    this.lastCssH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  // `decorations`: array di `{ id, shaderId, x, y, widthM, heightM }`.
  render(decorations, grid, naturalW, naturalH) {
    if (!this.available || !naturalW || !naturalH) return;
    const gl = this.gl;
    this.syncCanvasSize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!decorations.length) return;

    const time = performance.now() / 1000;

    decorations.forEach((deco) => {
      const def = SHADER_EFFECTS[deco.shaderId];
      if (!def) return;
      const program = this.getProgram(deco.shaderId);
      if (!program) return;
      const rectPct = shaderDecorationRectPercent(deco, grid, naturalW, naturalH);

      const xPx = (rectPct.leftPct / 100) * this.canvas.width;
      const topPx = (rectPct.topPct / 100) * this.canvas.height;
      const wPx = Math.max(1, Math.round((rectPct.widthPct / 100) * this.canvas.width));
      const hPx = Math.max(1, Math.round((rectPct.heightPct / 100) * this.canvas.height));
      // gl.viewport usa origine in basso a sinistra, la nostra percentuale
      // è in alto a sinistra (come il DOM/CSS): l'asse Y va invertito.
      const yPx = Math.round(this.canvas.height - topPx - hPx);

      gl.viewport(Math.round(xPx), yPx, wPx, hPx);
      gl.useProgram(program);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), wPx, hPx);
      if (def.usesNoiseTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ensureNoiseTexture());
        gl.uniform1i(gl.getUniformLocation(program, 'u_noise'), 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
}
```

Questo file NON ha il blocco `module.exports` di `media.js`: non è testabile sotto Node (richiede un vero contesto WebGL2, che Node non ha), verrà verificato manualmente nel browser nei task successivi. `SHADER_EFFECTS` e `ShaderLayer` diventano globali di pagina come tutto il resto di `public/shared/`, quindi vanno caricati con uno `<script>` dopo `media.js` (da cui dipende `shaderDecorationRectPercent`) e prima degli script di pagina.

- [ ] **Step 6: Verifica sintassi**

Run: `node --check public/shared/shader-effects.js && node --check public/shared/media.js`
Expected: nessun output, exit code 0 per entrambi.

- [ ] **Step 7: Commit**

```bash
git add public/shared/media.js public/shared/media.test.js public/shared/shader-effects.js
git commit -m "feat: shared WebGL shader-decoration rendering module"
```

---

### Task 2: Modello dati ed eventi server

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: nessuna dipendenza da Task 1 (il server non importa `shader-effects.js`, che è client-only; valida solo la stringa `shaderId` contro una whitelist locale).
- Produces: eventi socket `shader:place`, `shader:move`, `shader:resize`, `shader:remove`, `shader:restore`; forma dati `{ id, shaderId, x, y, widthM, heightM }` dentro `location.map.shaders`.

- [ ] **Step 1: Aggiungi `shaders: []` al seed e alla migrazione in `server/state.js`**

Nel `DEFAULT_STATE`, dentro `locations[0].map`, subito dopo la riga `aoes: []` (o dove già presente nel seed), aggiungi:

```js
        aoes: [],
        shaders: []
```

In `migrate()`, subito dopo il blocco che già garantisce `location.map.aoes`:

```js
    if (!Array.isArray(location.map.aoes)) location.map.aoes = [];
    if (!Array.isArray(location.map.shaders)) location.map.shaders = [];
```

- [ ] **Step 2: Aggiungi la whitelist shader in `server/index.js`**

Vicino alla definizione di `MAX_AOE_SIZE_M` (già presente):

```js
const MAX_AOE_SIZE_M = 300;
// Whitelist server-side dei tipi di decorazione shader piazzabili da
// /editor. Il registro con lo shader GLSL vero vive lato client
// (public/shared/shader-effects.js) -- il server valida solo che la
// stringa sia una di queste, mai il contenuto GLSL.
const SHADER_IDS = ['portal'];
const SHADER_MIN_SIZE_M = 0.5;
```

- [ ] **Step 3: Aggiungi i 5 handler socket**

Vicino agli handler `aoe:*` esistenti (stesso file, stessa sezione logica):

```js
  // Decorazioni shader: scenografia persistente della mappa piazzata da
  // /editor durante la preparazione, non stato di sessione -- stesso
  // pattern find→valida→muta→salva→broadcast di compass/polygon/AoE.
  socket.on('shader:place', ({ locationId, shaderId, x, y, widthM, heightM }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (!SHADER_IDS.includes(shaderId)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(widthM) || widthM < SHADER_MIN_SIZE_M || widthM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(heightM) || heightM < SHADER_MIN_SIZE_M || heightM > MAX_AOE_SIZE_M) return;
    if (!Array.isArray(location.map.shaders)) location.map.shaders = [];
    location.map.shaders.push({ id: nanoid(), shaderId, x, y, widthM, heightM });
    saveState(state);
    broadcastState();
  });

  socket.on('shader:move', ({ locationId, id, x, y }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const deco = location?.map.shaders?.find((s) => s.id === id);
    if (!deco) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    deco.x = x;
    deco.y = y;
    saveState(state);
    broadcastState();
  });

  socket.on('shader:resize', ({ locationId, id, widthM, heightM }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const deco = location?.map.shaders?.find((s) => s.id === id);
    if (!deco) return;
    if (!Number.isFinite(widthM) || widthM < SHADER_MIN_SIZE_M || widthM > MAX_AOE_SIZE_M) return;
    if (!Number.isFinite(heightM) || heightM < SHADER_MIN_SIZE_M || heightM > MAX_AOE_SIZE_M) return;
    deco.widthM = widthM;
    deco.heightM = heightM;
    saveState(state);
    broadcastState();
  });

  socket.on('shader:remove', ({ locationId, id }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(location.map.shaders)) return;
    location.map.shaders = location.map.shaders.filter((s) => s.id !== id);
    saveState(state);
    broadcastState();
  });

  // Simmetrico a polygon:restore: permette a /editor di implementare
  // l'undo dell'eliminazione reinserendo la decorazione così com'era.
  socket.on('shader:restore', ({ locationId, shader, index }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !shader || !shader.id || !SHADER_IDS.includes(shader.shaderId)) return;
    if (!Array.isArray(location.map.shaders)) location.map.shaders = [];
    if (location.map.shaders.some((s) => s.id === shader.id)) return;
    const insertAt = Number.isInteger(index) ? Math.min(Math.max(0, index), location.map.shaders.length) : location.map.shaders.length;
    location.map.shaders.splice(insertAt, 0, {
      id: shader.id,
      shaderId: shader.shaderId,
      x: shader.x,
      y: shader.y,
      widthM: shader.widthM,
      heightM: shader.heightM
    });
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 4: Verifica sintassi**

Run: `node --check server/state.js && node --check server/index.js`
Expected: nessun output, exit code 0.

- [ ] **Step 5: Verifica manuale end-to-end**

Avvia il server (`PORT=3910 node server/index.js` dalla worktree) e verifica via `curl`/socket.io-client (o browser console) che:
1. `curl -s http://localhost:3910/api/state | grep -o '"shaders":\[\]'` restituisca almeno una occorrenza (il seed/migrazione ha aggiunto l'array).
2. Un client socket.io connesso che emette `shader:place` con `{ locationId: 'taverna', shaderId: 'portal', x: 50, y: 50, widthM: 2, heightM: 3 }` riceva poi un `state:update` con quella decorazione in `location.map.shaders`.
3. `shader:place` con `shaderId: 'unknown'` NON crei nulla (nessun nuovo elemento nell'array dopo l'emit).

- [ ] **Step 6: Commit**

```bash
git add server/state.js server/index.js
git commit -m "feat: persist and sync shader decorations per location"
```

---

### Task 3: Piazzamento e modifica in `/editor`

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.css`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: `ShaderLayer`, `SHADER_EFFECTS`, `shaderDecorationRectPercent` (Task 1); eventi `shader:place/move/resize/remove/restore` (Task 2); `pointInPolygon`, `mediaW`, `mediaH`, `getActiveLocation()`, `escapeHtml` (già esistenti in editor.js/media.js); pattern di trascinamento `gridAlignDrag`/`updateGridAlignBox`/`applyGridAlignment` e di selezione/trascinamento poligono (`draggingPolygon`) come riferimento diretto da imitare.
- Produces: nessuna nuova funzione consumata da altri task (Task 4 non dipende da editor.js).

- [ ] **Step 1: Aggiungi l'icona, il pulsante in barra strumenti, il canvas e la scheda/pannello laterale in `public/editor/index.html`**

Nel blocco `<svg style="display:none">` in cima al file, vicino alle altre `<symbol>`, aggiungi:

```html
  <symbol id="i-shader" viewBox="0 0 24 24"><path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/></symbol>
```

Nella `.toolbar`, subito dopo il `toolbar-group` che contiene `grid-align-square` (il gruppo della griglia) e il suo `toolbar-sep` successivo, inserisci un nuovo gruppo dedicato:

```html
      <div class="toolbar-group">
        <button id="tool-shader" class="icon-btn tool" title="Piazza decorazione shader">
          <svg class="icon"><use href="#i-shader"></use></svg>
        </button>
      </div>

      <div class="toolbar-sep"></div>
```

Nel canvas della mappa (`#overlay-box`, dentro `#map-media-wrap`), subito dopo `<div id="map-canvas-placeholder" ...></div>` e PRIMA di `<svg id="grid-svg" ...>`:

```html
              <canvas id="map-shader-canvas"></canvas>
```

Nella `<nav id="sidebar-tabs">`, subito dopo il pulsante `data-tab-target="fog"`:

```html
      <button class="icon-btn tool" data-tab-target="shader" title="Shader">
        <svg class="icon"><use href="#i-shader"></use></svg>
      </button>
```

Dentro `#sidebar-panels`, subito dopo la `<section class="tab-panel panel" data-tab="fog">...</section>`:

```html
      <section class="tab-panel panel" data-tab="shader">
        <div class="section-header">
          <h2>Shader</h2>
          <button id="delete-shader" class="icon-btn" disabled title="Elimina selezionato">
            <svg class="icon"><use href="#i-trash"></use></svg>
          </button>
        </div>
        <div id="shader-list" class="list"></div>
      </section>
```

- [ ] **Step 2: Aggiungi lo stile del canvas, del box di selezione/trascinamento e degli stepper in `public/editor/editor.css`**

```css
#map-shader-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

/* Stesso trattamento visivo di .grid-align-box (tratteggio ambra), sia per
   il rettangolo mentre lo si disegna sia per marcare quale decorazione
   piazzata è attualmente selezionata. */
.shader-box {
  position: absolute;
  border: 1.5px dashed var(--accent);
  background: var(--accent-bg-subtle);
  pointer-events: none;
  z-index: 5;
}

.shader-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  cursor: pointer;
}

.shader-row.selected {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
}

.shader-row-label {
  font-size: 14px;
}

/* L'editor stringe i controlli a 36px (mouse, non tocco) invece dei 44px
   usati su /control -- stesso principio già in DESIGN.md per gli altri
   controlli equivalenti tra le due superfici. */
.shader-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shader-stepper button {
  width: 36px;
  height: 36px;
  padding: 0;
}

.shader-stepper span {
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Aggiungi stato, riferimenti DOM e modalità piazzamento in `public/editor/editor.js`**

Vicino alle altre dichiarazioni di stato in cima al file (accanto a `gridAlignDrag`):

```js
let shaderPlaceDrag = null;
let selectedShaderId = null;
let draggingShader = null;
const SHADER_MIN_M = 0.5;
```

Vicino ai riferimenti DOM esistenti (accanto a `gridAlignToolBtn`):

```js
const toolShaderBtn = document.getElementById('tool-shader');
const mapShaderCanvas = document.getElementById('map-shader-canvas');
const shaderList = document.getElementById('shader-list');
const deleteShaderBtn = document.getElementById('delete-shader');
const shaderLayer = new ShaderLayer(mapShaderCanvas);
```

Aggiungi `toolShaderBtn` all'array `LOCATION_DEPENDENT_CONTROLS` (nella stessa lista dove già vivono `toolSelectBtn`, `toolDrawBtn`, ecc.):

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, drawFinishBtn, drawCancelBtn, deletePolygonBtn, polygonSortAzBtn, fogOpacityNum,
  toolShaderBtn, deleteShaderBtn,
  gridToggleBtn, gridAlignToolBtn, gridAlignSquareBtn, gridDivisionsNum, gridColorInput, gridWidthNum, gridOpacityNum,
  gridSizeNum, gridOffsetXNum, gridOffsetYNum, gridSavePresetBtn, gridApplyPresetBtn,
  imageUpload
];
```

Handler del pulsante strumento, stesso pattern esatto di `toolSelectBtn`/`gridAlignToolBtn`:

```js
toolShaderBtn.addEventListener('click', () => {
  mode = 'shader-place';
  resetDrawingPoints();
  toolSelectBtn.classList.remove('active');
  toolDrawBtn.classList.remove('active');
  gridAlignToolBtn.classList.remove('active');
  toolShaderBtn.classList.add('active');
});
```

- [ ] **Step 4: Aggiungi il gesto di trascinamento per il piazzamento (stesso pattern di `grid-align`)**

Dentro `overlayBox.addEventListener('pointerdown', ...)`, PRIMA del blocco `if (mode === 'grid-align') { ... }`:

```js
  if (mode === 'shader-place') {
    const start = basePointFromClientXY(e.clientX, e.clientY);
    const box = document.createElement('div');
    box.className = 'shader-box';
    overlayBox.appendChild(box);
    shaderPlaceDrag = { start, box };
    updateShaderPlaceBox(start, start);
    return;
  }
```

Subito dopo `function updateGridAlignBox(start, end) { ... }`, una funzione gemella (stessa conversione percentuale→pixel di `currentImageRect`):

```js
function updateShaderPlaceBox(start, end) {
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  const width = Math.abs(end[0] - start[0]);
  const height = Math.abs(end[1] - start[1]);
  const box = shaderPlaceDrag.box;
  box.style.left = `${(left / 100) * currentImageRect.width}px`;
  box.style.top = `${(top / 100) * currentImageRect.height}px`;
  box.style.width = `${(width / 100) * currentImageRect.width}px`;
  box.style.height = `${(height / 100) * currentImageRect.height}px`;
}
```

Dentro `document.addEventListener('pointermove', ...)`, accanto al blocco `if (gridAlignDrag) { ... }`:

```js
  if (shaderPlaceDrag) {
    const current = basePointFromClientXY(e.clientX, e.clientY);
    updateShaderPlaceBox(shaderPlaceDrag.start, current);
    shaderPlaceDrag.end = current;
    return;
  }
```

Dentro `document.addEventListener('pointerup', ...)`, accanto al blocco `if (gridAlignDrag) { ... }`:

```js
  if (shaderPlaceDrag) {
    const { start, end, box } = shaderPlaceDrag;
    box.remove();
    shaderPlaceDrag = null;
    if (end) applyShaderPlacement(start, end);
    mode = 'select';
    toolSelectBtn.classList.add('active');
    toolShaderBtn.classList.remove('active');
    return;
  }
```

Funzione che traduce il rettangolo trascinato in `widthM`/`heightM`/centro e invia `shader:place` (stessa struttura di `applyGridAlignment`, ma con l'output in metri invece che in pixel griglia):

```js
function applyShaderPlacement(start, end) {
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  if (!nw || !nh) return;
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  const widthPct = Math.abs(end[0] - start[0]);
  const heightPct = Math.abs(end[1] - start[1]);
  const location = getActiveLocation();
  if (!location) return;
  const grid = location.map.grid;
  const ppm = aoePixelsPerMeter(grid);
  const widthM = Math.max(SHADER_MIN_M, ((widthPct / 100) * nw) / ppm);
  const heightM = Math.max(SHADER_MIN_M, ((heightPct / 100) * nh) / ppm);
  const centerXPct = leftPct + widthPct / 2;
  const centerYPct = topPct + heightPct / 2;
  socket.emit('shader:place', {
    locationId: location.id,
    shaderId: 'portal',
    x: centerXPct,
    y: centerYPct,
    widthM,
    heightM
  });
}
```

- [ ] **Step 5: Aggiungi selezione, trascinamento e lista laterale**

Dentro `overlayBox.addEventListener('pointerdown', ...)`, nel blocco `if (mode !== 'select') return;` esistente (quello che già gestisce la selezione poligoni), estendi così — l'hit-test sulle decorazioni shader ha priorità più bassa dei poligoni (se il click cade su entrambi vince il poligono, ordine arbitrario ma consistente):

```js
  if (mode !== 'select') return;
  const location = getActiveLocation();
  if (!location) return;
  const point = basePointFromClientXY(e.clientX, e.clientY);
  const hit = (location.map.polygons || []).find((poly) => pointInPolygon(point, poly.points));

  if (hit) {
    selectedShaderId = null;
    selectedPolygonId = hit.id;
    draggingPolygon = { locationId: location.id, polygonId: hit.id, startBase: point, originalPoints: hit.points.map((p) => [...p]) };
    renderPolygonsSvg();
    renderPolygonList(location);
    renderShaderList(location);
    return;
  }

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const shaderHit = (location.map.shaders || []).find((deco) => {
    const rect = shaderDecorationRectPercent(deco, location.map.grid, nw, nh);
    const corners = [
      [rect.leftPct, rect.topPct],
      [rect.leftPct + rect.widthPct, rect.topPct],
      [rect.leftPct + rect.widthPct, rect.topPct + rect.heightPct],
      [rect.leftPct, rect.topPct + rect.heightPct]
    ];
    return pointInPolygon(point, corners);
  });

  selectedPolygonId = null;
  draggingPolygon = null;
  selectedShaderId = shaderHit ? shaderHit.id : null;
  draggingShader = shaderHit
    ? { locationId: location.id, id: shaderHit.id, startBase: point, originalX: shaderHit.x, originalY: shaderHit.y }
    : null;
  renderPolygonsSvg();
  renderPolygonList(location);
  renderShaderList(location);
```

Nota per chi implementa: questo blocco SOSTITUISCE per intero il corpo esistente che segue `if (mode !== 'select') return;` dentro `overlayBox.addEventListener('pointerdown', (e) => { ... })` — cioè tutto il codice a partire da `const location = getActiveLocation();` fino a (incluse) le due righe `renderPolygonsSvg();` e `renderPolygonList(location);` che chiudono quel listener. Il codice originale da sostituire è esattamente:

```js
  if (mode !== 'select') return;
  const location = getActiveLocation();
  if (!location) return;
  const point = basePointFromClientXY(e.clientX, e.clientY);
  const hit = (location.map.polygons || []).find((poly) => pointInPolygon(point, poly.points));

  selectedPolygonId = hit ? hit.id : null;
  draggingPolygon = hit
    ? { locationId: location.id, polygonId: hit.id, startBase: point, originalPoints: hit.points.map((p) => [...p]) }
    : null;

  renderPolygonsSvg();
  renderPolygonList(location);
});
```

Non va duplicato accanto al codice vecchio — è una sostituzione, non un'aggiunta.

Dentro `document.addEventListener('pointermove', ...)`, accanto al blocco `if (draggingPolygon) { ... }`:

```js
  if (draggingShader) {
    const location = getActiveLocation();
    if (!location) return;
    const deco = location.map.shaders.find((s) => s.id === draggingShader.id);
    if (!deco) return;
    const current = basePointFromClientXY(e.clientX, e.clientY);
    const dx = current[0] - draggingShader.startBase[0];
    const dy = current[1] - draggingShader.startBase[1];
    deco.x = Math.min(100, Math.max(0, draggingShader.originalX + dx));
    deco.y = Math.min(100, Math.max(0, draggingShader.originalY + dy));
  }
```

Dentro `document.addEventListener('pointerup', ...)`, accanto al blocco che committa `draggingPolygon`:

```js
  if (draggingShader) {
    const location = getActiveLocation();
    const deco = location?.map.shaders.find((s) => s.id === draggingShader.id);
    draggingShader = null;
    if (deco) {
      socket.emit('shader:move', { locationId: location.id, id: deco.id, x: deco.x, y: deco.y });
    }
  }
```

Funzione di rendering della lista laterale (stessa forma di `renderPolygonList`, con in più gli stepper quando la riga è quella selezionata):

```js
function renderShaderList(location) {
  const shaders = (location && location.map.shaders) || [];
  deleteShaderBtn.disabled = !selectedShaderId;
  shaderList.innerHTML = shaders
    .map((deco) => {
      const selected = deco.id === selectedShaderId;
      const label = (typeof SHADER_EFFECTS !== 'undefined' && SHADER_EFFECTS[deco.shaderId]?.label) || deco.shaderId;
      const steppers = selected
        ? `
          <div class="shader-stepper">
            <button data-w-out="${deco.id}" title="Riduci larghezza">−</button>
            <span>${deco.widthM.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m</span>
            <button data-w-in="${deco.id}" title="Aumenta larghezza">+</button>
          </div>
          <div class="shader-stepper">
            <button data-h-out="${deco.id}" title="Riduci altezza">−</button>
            <span>${deco.heightM.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m</span>
            <button data-h-in="${deco.id}" title="Aumenta altezza">+</button>
          </div>
        `
        : '';
      return `
        <div class="shader-row ${selected ? 'selected' : ''}" data-id="${deco.id}">
          <span class="shader-row-label">${escapeHtml(label)}</span>
          ${steppers}
        </div>
      `;
    })
    .join('');
}
```

Handler di selezione/resize dalla lista:

```js
shaderList.addEventListener('click', (e) => {
  const stepBtn = e.target.closest('[data-w-out], [data-w-in], [data-h-out], [data-h-in]');
  if (stepBtn) {
    const location = getActiveLocation();
    const id = stepBtn.dataset.wOut || stepBtn.dataset.wIn || stepBtn.dataset.hOut || stepBtn.dataset.hIn;
    const deco = location?.map.shaders.find((s) => s.id === id);
    if (!deco) return;
    let widthM = deco.widthM;
    let heightM = deco.heightM;
    if (stepBtn.dataset.wOut !== undefined) widthM = Math.max(SHADER_MIN_M, widthM - SHADER_MIN_M);
    if (stepBtn.dataset.wIn !== undefined) widthM = widthM + SHADER_MIN_M;
    if (stepBtn.dataset.hOut !== undefined) heightM = Math.max(SHADER_MIN_M, heightM - SHADER_MIN_M);
    if (stepBtn.dataset.hIn !== undefined) heightM = heightM + SHADER_MIN_M;
    socket.emit('shader:resize', { locationId: location.id, id, widthM, heightM });
    return;
  }
  const row = e.target.closest('.shader-row');
  if (!row) return;
  selectedPolygonId = null;
  draggingPolygon = null;
  selectedShaderId = selectedShaderId === row.dataset.id ? null : row.dataset.id;
  renderPolygonsSvg();
  renderPolygonList(getActiveLocation());
  renderShaderList(getActiveLocation());
});
```

Handler di eliminazione (stesso arma-poi-conferma di `deletePolygonBtn`, con undo simmetrico a `polygon:restore`):

```js
let shaderDeleteArmed = false;
let shaderDeleteArmTimeout = null;

function resetShaderDeleteArm() {
  shaderDeleteArmed = false;
  clearTimeout(shaderDeleteArmTimeout);
  deleteShaderBtn.classList.remove('confirm');
  deleteShaderBtn.title = 'Elimina selezionato';
}

deleteShaderBtn.addEventListener('click', () => {
  if (!selectedShaderId) return;
  if (!shaderDeleteArmed) {
    shaderDeleteArmed = true;
    deleteShaderBtn.classList.add('confirm');
    deleteShaderBtn.title = 'Click di nuovo per confermare';
    clearTimeout(shaderDeleteArmTimeout);
    shaderDeleteArmTimeout = setTimeout(resetShaderDeleteArm, 2500);
    return;
  }
  const id = selectedShaderId;
  const locationId = state.activeLocationId;
  const location = getActiveLocation();
  const index = location.map.shaders.findIndex((s) => s.id === id);
  const shader = location.map.shaders[index];
  resetShaderDeleteArm();
  socket.emit('shader:remove', { locationId, id });
  selectedShaderId = null;
  if (shader) {
    const snapshot = { ...shader };
    pushHistory(`decorazione "${SHADER_EFFECTS[shader.shaderId]?.label || shader.shaderId}" eliminata`,
      () => socket.emit('shader:restore', { locationId, index, shader: snapshot }),
      () => socket.emit('shader:remove', { locationId, id: snapshot.id })
    );
  }
});
```

- [ ] **Step 6: Aggiungi il rendering live e collega `renderShaderList` al ciclo di render principale**

In `function render() { ... }` (la funzione di render principale della location attiva), trova la riga `renderPolygonList(location);` (subito dopo il blocco `if (location.map.file) { ... } else { ... }` che carica la mappa) e aggiungi subito dopo di essa:

```js
renderShaderList(location);
```

Aggiungi un ciclo `requestAnimationFrame` che sincronizza il canvas con `location.map.shaders` ogni frame mentre l'editor è aperto su una mappa (attivo sempre, non solo quando la scheda "Shader" è visibile — il DM deve vedere l'effetto mentre lavora su qualunque altra scheda):

```js
function stepShaderLayer() {
  const location = getActiveLocation();
  if (location && location.map.file) {
    shaderLayer.render(location.map.shaders || [], location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
  }
  requestAnimationFrame(stepShaderLayer);
}
requestAnimationFrame(stepShaderLayer);
```

- [ ] **Step 7: Carica lo script condiviso in `public/editor/index.html`**

Verifica che, tra gli script in fondo alla pagina, `shader-effects.js` sia caricato dopo `media.js` e prima di `editor.js`:

```html
<script src="/shared/media.js"></script>
<script src="/shared/shader-effects.js"></script>
<script src="editor.js"></script>
```

- [ ] **Step 8: Verifica sintassi**

Run: `node --check public/editor/editor.js`
Expected: nessun output, exit code 0.

- [ ] **Step 9: Verifica manuale nel browser**

Avvia il server dalla worktree (`PORT=3910 node server/index.js`), apri `/editor`, seleziona una location con una mappa caricata:
1. Clicca lo strumento Shader, trascina un rettangolo sulla mappa: al rilascio deve apparire il "Portale" animato esattamente in quel rettangolo, e la scheda laterale "Shader" deve mostrarlo in lista.
2. Torna in modalità selezione, clicca la decorazione: si evidenzia (bordo tratteggiato), e nella scheda laterale compaiono gli stepper larghezza/altezza — usali e verifica che l'effetto si ridimensioni dal vivo.
3. Trascina il corpo della decorazione: si sposta con il puntatore.
4. Seleziona un poligono fog esistente: la selezione della decorazione shader si annulla (e viceversa).
5. Elimina la decorazione (doppio click sul pulsante elimina): sparisce da mappa e lista; premi Annulla (Ctrl+Z o il pulsante undo) e verifica che ricompaia.

- [ ] **Step 10: Commit**

```bash
git add public/editor/index.html public/editor/editor.css public/editor/editor.js
git commit -m "feat: place and edit shader decorations from /editor"
```

---

### Task 4: Rendering su `/control` e `/display`

**Files:**
- Modify: `public/control/index.html`, `public/control/control.js`
- Modify: `public/display/index.html`, `public/display/display.js`

**Interfaces:**
- Consumes: `ShaderLayer` (Task 1). Nessuna nuova interfaccia prodotta (ultimo task della catena).

- [ ] **Step 1: Inserisci il canvas nell'ordine corretto in `public/control/index.html`**

Tra `<div class="map-placeholder" id="map-placeholder" hidden></div>` e `<div class="fog-layer" id="map-fog-layer"></div>` (l'ordine è vincolante: il canvas deve stare SOTTO il fog, vedi Global Constraints):

```html
                <canvas id="map-shader-canvas"></canvas>
```

Carica lo script condiviso dopo `media.js` e prima di `control.js`:

```html
<script src="/shared/media.js"></script>
<script src="/shared/shader-effects.js"></script>
<script src="control.js"></script>
```

- [ ] **Step 2: Stesso inserimento in `public/display/index.html`**

Stessa posizione relativa (tra `map-placeholder` e `map-fog-layer`):

```html
        <canvas id="map-shader-canvas"></canvas>
```

E lo stesso caricamento script (dopo `media.js`, prima di `display.js`).

- [ ] **Step 3: Aggiungi lo stile del canvas in `public/control/control.css` e `public/display/display.css`**

Stessa regola in entrambi i file (mirror di `.grid-layer`/`.aoe-svg` già presenti):

```css
.shader-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

E aggiungi la classe all'elemento in entrambi gli `index.html` appena modificati: `<canvas id="map-shader-canvas" class="shader-layer"></canvas>`.

- [ ] **Step 4: Monta `ShaderLayer` e sincronizzalo in `public/control/control.js`**

Vicino agli altri riferimenti DOM (`mapAoeSvg`, `mapGridSvg`):

```js
const mapShaderCanvas = document.getElementById('map-shader-canvas');
const shaderLayer = new ShaderLayer(mapShaderCanvas);
```

Nella funzione `renderMapPreview(location)`, la riga `renderAoeOverlays((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));` compare identica in ENTRAMBI i rami (con e senza `location.map.file`), subito dopo la rispettiva chiamata a `renderGrid(...)`. Aggiungi, subito dopo ciascuna di quelle due righe (stessi argomenti di `renderAoeOverlays`, sostituendo solo `location.map.aoes` con `location.map.shaders`):

```js
      shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
```

Nel ramo senza file, `mediaW(activeMapEl)`/`mediaH(activeMapEl)` valgono `0` (nessun media caricato): `ShaderLayer.render` già gestisce questo caso (vedi Task 1, `if (!this.available || !naturalW || !naturalH) return;`), quindi non serve una chiamata diversa per quel ramo.

Aggiungi un ciclo `requestAnimationFrame` indipendente (il rendering delle AoE/griglia è guidato da `render()` sugli aggiornamenti di stato, ma lo shader deve animarsi anche senza nuovi `state:update`):

```js
function stepShaderLayer() {
  if (state) {
    const previewLocation = getPreviewLocation();
    if (previewLocation && previewLocation.map.file) {
      shaderLayer.render(previewLocation.map.shaders || [], previewLocation.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    }
  }
  requestAnimationFrame(stepShaderLayer);
}
requestAnimationFrame(stepShaderLayer);
```

(La chiamata dentro `renderMapPreview` copre il primo frame dopo un cambio location/immagine prima che il loop la raggiunga; il loop la tiene animata nei frame successivi. Le due chiamate sono ridondanti ma innocue — `render()` è idempotente per lo stesso stato.)

- [ ] **Step 5: Stesso montaggio in `public/display/display.js`**

Vicino agli altri riferimenti DOM:

```js
const mapShaderCanvas = document.getElementById('map-shader-canvas');
const shaderLayer = new ShaderLayer(mapShaderCanvas);
```

Nella funzione `renderMap(state, location, returningFromImage)`, in entrambi i rami, subito dopo la riga `renderAoe((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));` (presente identica in entrambi i rami — nel ramo con file precede la chiamata a `renderGridSvg(...)`, nel ramo senza file precede `mapGridSvg.innerHTML = '';`):

```js
    shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
```

E un loop indipendente per l'animazione continua, stesso principio di `/control`:

```js
function stepShaderLayer() {
  if (lastState) {
    const location = getActiveLocation(lastState);
    const showingImage = Boolean(lastState.activeImageId && location && location.images.some((i) => i.id === lastState.activeImageId));
    if (location && location.map.file && !showingImage) {
      shaderLayer.render(location.map.shaders || [], location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    }
  }
  requestAnimationFrame(stepShaderLayer);
}
requestAnimationFrame(stepShaderLayer);
```

- [ ] **Step 6: Verifica sintassi**

Run: `node --check public/control/control.js && node --check public/display/display.js`
Expected: nessun output, exit code 0.

- [ ] **Step 7: Verifica manuale nel browser**

Con il server già avviato e una decorazione "Portale" già piazzata da `/editor` sulla location attiva (Task 3, Step 9):
1. Apri `/display`: il portale deve apparire animato, nella posizione/dimensione corrette.
2. Apri `/control`, seleziona la stessa location: il portale deve apparire animato anche lì.
3. Da `/control`, disegna (tab Fog) un poligono fog che copra l'area del portale, lascialo NON rivelato: su `/display` il portale deve sparire completamente sotto il nero del fog; su `/control` deve restare visibile ma attenuato dall'opacità fog del DM (il comportamento già esistente per la mappa sottostante — nessun codice nuovo per questo, è conseguenza diretta dell'ordine dei livelli).
4. Rivela quella zona di fog da `/control`: il portale ricompare pienamente su entrambe le pagine.
5. Ridimensiona/sposta il portale da `/editor` mentre `/display` è aperto in un'altra scheda: verifica che l'aggiornamento arrivi (via `state:update`) e il portale si sposti/ridimensioni anche lì.

- [ ] **Step 8: Commit**

```bash
git add public/control/index.html public/control/control.css public/control/control.js public/display/index.html public/display/display.css public/display/display.js
git commit -m "feat: render shader decorations on /control and /display"
```
