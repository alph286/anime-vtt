#!/usr/bin/env node
// Misura dei tempi di frame di /display mentre arrivano ping e scie.
//
// Server di PROVA su :3100 con dati finti in una cartella temporanea (mai data/
// e storage/ veri, mai la porta 3000), Chrome headless pilotato via CDP (niente
// dipendenze: WebSocket di Node), ping simulati da un client socket.io Node.
//
//   node tools/perf-ping/measure.mjs                       # tutti gli scenari, GPU vera, 1280x720, 5 s ciascuno
//   node tools/perf-ping/measure.mjs --scenarios=empty,image --throttle=1,6 --secs=8
//   node tools/perf-ping/measure.mjs --finish              # gl.finish() dopo ogni render: costo GPU per layer
//   node tools/perf-ping/measure.mjs --patch=skip-empty    # prova: niente clear dei canvas vuoti nel loop
//   node tools/perf-ping/measure.mjs --patch=half-res      # prova: canvas del ping a metà risoluzione
//   node tools/perf-ping/measure.mjs --headful             # Chrome con finestra (serve un display)
//   node tools/perf-ping/measure.mjs --cores=0-1           # Chrome ristretto a 2 core (taskset)
//   node tools/perf-ping/measure.mjs --pattern=tap|trail   # solo tap (sonar) o solo scie; default mix
//   node tools/perf-ping/measure.mjs --noping              # stesso giro senza ping (base)
//
// Le "patch" sono iniettate nella pagina dal misuratore (monkeypatch degli
// oggetti globali di display.js): il codice dell'app non cambia.

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
// socket.io-client sta in editor-app/node_modules (del repo o, da un worktree,
// del checkout principale che lo contiene).
function loadIo() {
  const bases = [repo, path.join(repo, 'editor-app')];
  for (let d = repo; d !== path.dirname(d); d = path.dirname(d)) bases.push(path.join(d, 'editor-app'));
  for (const b of bases) {
    try { return createRequire(path.join(b, 'x.js'))('socket.io-client').io; } catch { /* prossimo */ }
  }
  throw new Error('socket.io-client non trovato: npm install in editor-app/');
}
const io = loadIo();

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const PORT = Number(args.port || 3100);
if (PORT === 3000) throw new Error('porta 3000 vietata (server vero)');
const SECS = Math.min(10, Number(args.secs || 5));
const THROTTLES = String(args.throttle || '1').split(',').map(Number);
const GL = args.gl || 'gpu';
// SwiftShader rende il WebGL sulla CPU: tempi senza senso per un Pi 4 e PC al
// 100% (surriscaldamento). Solo se chiesto esplicitamente.
if (GL === 'swiftshader' && !args['allow-swiftshader']) throw new Error('swiftshader disattivato: usa --gl=gpu');
const PATCHES = args.patch ? String(args.patch).split(',') : [];
const FINISH = Boolean(args.finish);
const NOPING = Boolean(args.noping);
const PATTERN = args.pattern || 'mix'; // mix | tap | trail
const W = Number(args.w || 1280);
const H = Number(args.h || 720);
const CDP_PORT = Number(args.cdp || 9333);

const work = args.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-perf-ping-'));
const DATA_DIR = path.join(work, 'data');
const STORAGE_DIR = path.join(work, 'storage');
const MAPS = path.join(STORAGE_DIR, 'maps');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MAPS, { recursive: true });

// ---------- dati finti ----------
function ff(argv, out) {
  if (fs.existsSync(out)) return;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv, out]);
}
ff(['-f', 'lavfi', '-i', 'testsrc2=size=5000x3500', '-frames:v', '1'], path.join(MAPS, 'big.png'));
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast'], path.join(MAPS, 'map1080.mp4'));
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-t', '10', '-c:v', 'libvpx-vp9', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8'], path.join(MAPS, 'map1080.webm'));

const grid = { enabled: true, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
const fog = [
  { id: 'f1', name: 'a', revealed: false, points: [[0, 0], [40, 0], [40, 40], [0, 40]] },
  { id: 'f2', name: 'b', revealed: false, points: [[60, 60], [100, 60], [100, 100], [60, 100]] },
  { id: 'f3', name: 'c', revealed: true, points: [[40, 40], [60, 40], [60, 60], [40, 60]] }
];
const decos = [
  { id: 'd1', shaderId: 'portal', x: 30, y: 50, widthM: 6, heightM: 6 },
  { id: 'd2', shaderId: 'portal_red', x: 70, y: 30, widthM: 6, heightM: 6 },
  { id: 'd3', shaderId: 'green_fire', x: 50, y: 70, widthM: 5, heightM: 5 }
];
const aoes = [{ id: 'a1', shape: 'sphere', sizeM: 6, widthM: null, x: 45, y: 45, rotation: 0, color: 'red', shapeVisible: true, shaderOverride: null, cast: false }];
const castAoe = [{ ...aoes[0], id: 'a2', cast: true }];
// Tre aree lanciate di forme diverse, come la location della serata sul Pi.
const castAoes3 = [
  { ...aoes[0], id: 'c1', shape: 'sphere', sizeM: 6, x: 30, y: 35, color: 'red', cast: true },
  { ...aoes[0], id: 'c2', shape: 'cone', sizeM: 9, x: 60, y: 60, rotation: 20, color: 'green', cast: true },
  { ...aoes[0], id: 'c3', shape: 'cube', sizeM: 5, x: 75, y: 25, color: 'white', cast: true }
];

function loc(id, file, extra = {}) {
  return {
    id, name: id,
    map: {
      file, type: file && /\.(mp4|webm)$/.test(file) ? 'video' : 'image', scale: 1, flip180: false, rotate90: false,
      liveView: { scale: 1, offsetX: 0, offsetY: 0 }, grid: { ...grid, enabled: false },
      compass: { visible: false, x: 88, y: 85, rotation: 0 },
      polygons: [], aoes: [], shaders: [], ...extra
    },
    images: [], archived: false, isDefault: false
  };
}
const SCENARIOS = {
  empty: loc('empty', null),
  image: loc('image', 'big.png'),
  imageFull: loc('imageFull', 'big.png', { grid, polygons: fog, aoes, shaders: decos }),
  imageDeco: loc('imageDeco', 'big.png', { shaders: decos }),
  imageCast: loc('imageCast', 'big.png', { aoes: castAoe }),
  mp4: loc('mp4', 'map1080.mp4'),
  webm: loc('webm', 'map1080.webm'),
  webmFull: loc('webmFull', 'map1080.webm', { grid, polygons: fog, aoes, shaders: decos }),
  webmCast: loc('webmCast', 'map1080.webm', { aoes: castAoes3 })
};
const scenarioNames = args.scenarios ? String(args.scenarios).split(',') : Object.keys(SCENARIOS);
fs.writeFileSync(path.join(DATA_DIR, 'state.json'), JSON.stringify({
  campaign: { name: 'perf' },
  locations: Object.values(SCENARIOS),
  activeLocationId: 'empty',
  activeImageId: null
}, null, 2));

// ---------- server di prova ----------
const server = spawn(process.execPath, [path.join(repo, 'server', 'index.js')], {
  cwd: repo, env: { ...process.env, PORT: String(PORT), DATA_DIR, STORAGE_DIR }, stdio: ['ignore', 'pipe', 'pipe']
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r; } catch { /* non ancora */ }
    await sleep(250);
  }
  throw new Error(`non risponde: ${url}`);
}
await waitHttp(`http://127.0.0.1:${PORT}/display/`);

// ---------- Chrome ----------
const chromeBin = args.chrome || 'google-chrome';
const glFlags = GL === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--enable-gpu', '--ignore-gpu-blocklist', `--use-angle=${args.angle || 'gl-egl'}`];
const chromeArgs = [
  ...(args.headful ? [] : ['--headless=new']),
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(work, 'chrome')}`,
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', ...glFlags, 'about:blank'
];
const chrome = args.cores
  ? spawn('taskset', ['-c', String(args.cores), chromeBin, ...chromeArgs], { stdio: 'ignore' })
  : spawn(chromeBin, chromeArgs, { stdio: 'ignore' });

let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  if (!args.dir && !args.keep) fs.rmSync(work, { recursive: true, force: true });
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

await waitHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
let lastLayers = [];
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'LayerTree.layerTreeDidChange' && msg.params.layers) lastLayers = msg.params.layers;
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/display/` });
await sleep(2500);

// Strumentazione nella pagina: delta di rAF, long task, tempo di ogni render().
const INSTRUMENT = `(() => {
  if (window.__perf) return 'già';
  const P = window.__perf = { rec: false, deltas: [], long: [], r: { ping: [], shader: [], aoe: [] }, g: { ping: [], shader: [], aoe: [] },
    c: { ping: { clear: 0, draw: 0, uni: 0, loc: 0 }, shader: { clear: 0, draw: 0, uni: 0, loc: 0 }, aoe: { clear: 0, draw: 0, uni: 0, loc: 0 } }, last: 0, q: [],
    px: 0, presented: 0, dirty: new Set(), canvasPx: 0 };
  const finish = ${FINISH};
  // Contatori economici sulle chiamate GL di ogni contesto + tempo GPU con
  // EXT_disjoint_timer_query_webgl2 (se il driver lo espone).
  function count(gl, key) {
    const c = () => P.c[key];
    const hook = (name, field) => { const o = gl[name].bind(gl); gl[name] = (...a) => { if (P.rec) c()[field]++; return o(...a); }; };
    hook('clear', 'clear'); hook('drawArrays', 'draw'); hook('getUniformLocation', 'loc');
    // Pixel elaborati dai fragment shader (area del viewport, ritagliata dallo
    // scissor se attivo) e canvas "sporcati" nel frame (= ripresentati al compositore).
    const area = () => {
      const v = gl.getParameter(gl.VIEWPORT);
      let w = v[2], h = v[3];
      if (gl.isEnabled(gl.SCISSOR_TEST)) { const s = gl.getParameter(gl.SCISSOR_BOX); w = Math.min(w, s[2]); h = Math.min(h, s[3]); }
      return Math.max(0, w) * Math.max(0, h);
    };
    const od = gl.drawArrays.bind(gl);
    gl.drawArrays = (...a) => { if (P.rec) { P.px += area(); P.dirty.add(gl); } return od(...a); };
    const oc = gl.clear.bind(gl);
    gl.clear = (...a) => { if (P.rec) P.dirty.add(gl); return oc(...a); };
    for (const n of Object.getOwnPropertyNames(WebGL2RenderingContext.prototype)) if (/^uniform[1-4Matrix]/.test(n)) hook(n, 'uni');
  }
  function wrap(obj, key) {
    const orig = obj.render.bind(obj);
    const gl = obj.gl;
    if (gl) count(gl, key);
    const ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2');
    P.timer = P.timer || Boolean(ext);
    obj.render = function (...a) {
      const t0 = performance.now();
      let q = null;
      if (ext && P.rec) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      orig(...a);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); P.q.push([gl, ext, q, key]); }
      if (finish && gl) gl.finish();
      if (P.rec) P.r[key].push(performance.now() - t0);
    };
  }
  function pollQueries() {
    P.q = P.q.filter(([gl, ext, q, key]) => {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) P.g[key].push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
      return false;
    });
  }
  { const gl = pingLayer.gl; const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    P.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'nessun webgl2'); }
  wrap(pingLayer, 'ping'); wrap(shaderLayer, 'shader'); wrap(aoeShaderLayer, 'aoe');
  ${PATCHES.includes('skip-empty') ? `
  // PROVA: nel loop non pulire (e quindi non ripresentare) i canvas senza niente da disegnare.
  for (const L of [shaderLayer, aoeShaderLayer]) {
    const r = L.render; let wasEmpty = false;
    L.render = function (list, ...rest) {
      const empty = !list || !list.length;
      if (empty && wasEmpty) return;
      wasEmpty = empty;
      return r.call(this, list, ...rest);
    };
  }` : ''}
  ${PATCHES.includes('half-res') ? `
  // PROVA: canvas del ping a metà risoluzione (1/4 dei pixel), il CSS lo riscala.
  pingLayer.syncCanvasSize = function () {
    const cssW = Math.max(1, Math.round(this.canvas.clientWidth));
    const cssH = Math.max(1, Math.round(this.canvas.clientHeight));
    if (cssW === this.lastCssW && cssH === this.lastCssH) return;
    this.lastCssW = cssW; this.lastCssH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * 0.5));
    this.canvas.height = Math.max(1, Math.round(cssH * 0.5));
  };` : ''}
  new PerformanceObserver((l) => { if (P.rec) for (const e of l.getEntries()) P.long.push(e.duration); }).observe({ entryTypes: ['longtask'] });
  function tick(t) {
    pollQueries();
    if (P.rec) {
      if (P.last) P.deltas.push(t - P.last); P.last = t;
      P.presented += P.dirty.size;
      for (const gl of P.dirty) P.canvasPx += gl.drawingBufferWidth * gl.drawingBufferHeight;
    }
    P.dirty.clear();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return 'ok';
})()`;
await evaluate(INSTRUMENT);

// ---------- ping finti ----------
const dm = io(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] });
await new Promise((r) => dm.on('connect', r));
dm.emit('hello', { role: 'perf' });

let pingTimer = null;
function startPings(locationId) {
  // Tap, poi una scia di 25 punti a ~30 punti/s in cerchio, pausa; e di nuovo.
  let step = 0; let stroke = 0;
  const pattern = () => {
    const phase = step % 40;
    if (phase === 0 && PATTERN !== 'trail') dm.emit('ping:show', { locationId, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60, strokeId: `t${stroke++}` });
    else if (phase >= 8 && phase < 33 && PATTERN !== 'tap') {
      const a = (phase - 8) / 25 * Math.PI * 2;
      dm.emit('ping:show', { locationId, x: 50 + 25 * Math.cos(a), y: 50 + 25 * Math.sin(a), strokeId: `s${stroke}` });
      if (phase === 32) stroke++;
    }
    step++;
  };
  pingTimer = setInterval(pattern, 33);
}
function stopPings() { clearInterval(pingTimer); pingTimer = null; }

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

if (args.bench) {
  // Micro-benchmark del solo shader del ping (vedi bench-ping.js).
  const renderer = await evaluate('__perf.renderer');
  const rows = await evaluate(fs.readFileSync(path.join(here, 'bench-ping.js'), 'utf8'));
  console.log(`\nrenderer: ${renderer}`);
  console.table(rows);
  if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ args, renderer, rows }, null, 2));
  dm.close(); ws.close(); cleanup(); process.exit(0);
}

const rows = [];
for (const name of scenarioNames) {
  dm.emit('location:set', { locationId: name });
  await sleep(3000); // caricamento mappa/video
  for (const thr of THROTTLES) {
    await cdp('Emulation.setCPUThrottlingRate', { rate: thr });
    await sleep(800);
    await evaluate(`(() => { const P = __perf; P.deltas = []; P.long = []; P.r = { ping: [], shader: [], aoe: [] }; P.g = { ping: [], shader: [], aoe: [] }; for (const k in P.c) P.c[k] = { clear: 0, draw: 0, uni: 0, loc: 0 }; P.px = 0; P.presented = 0; P.canvasPx = 0; P.dirty.clear(); P.last = 0; P.rec = true; })()`);
    if (!NOPING) startPings(name);
    await sleep(SECS * 1000 - 500);
    await cdp('LayerTree.enable');
    await sleep(500);
    stopPings();
    await cdp('LayerTree.disable');
    const raw = await evaluate(`(() => { const P = __perf; P.rec = false; return { deltas: P.deltas, long: P.long, r: P.r, c: P.c, px: P.px, presented: P.presented, canvasPx: P.canvasPx }; })()`);
    await sleep(300);
    raw.g = await evaluate(`__perf.g`);
    // Layer compositi che disegnano contenuto (preso a fine run, ping ancora vivi):
    // quanti e quanti megapixel il compositore deve ricomporre a ogni frame.
    const drawn = lastLayers.filter((l) => l.drawsContent && l.width * l.height > 0);
    const layerMpx = drawn.reduce((t, l) => t + l.width * l.height, 0) / 1e6;
    const info = await evaluate(`(() => {
      // Canvas WebGL visibili a fine run (ping/shader/aoe) e area a schermo che
      // occupano, ritagliata alla finestra: quanto il compositore deve ricomporre.
      const vis = [mapPingCanvas, mapShaderCanvas, mapAoeShaderCanvas].filter((c) => {
        const cs = getComputedStyle(c);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && c.offsetParent !== null;
      });
      const area = vis.reduce((t, c) => {
        const r = c.getBoundingClientRect();
        const w = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left));
        const h = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
        return t + w * h;
      }, 0);
      return { canvas: [mapPingCanvas.width, mapPingCanvas.height], video: !mapVideo.hidden && !mapVideo.paused, visCanvas: vis.length, visMpx: area / 1e6 };
    })()`);
    const canvasLayers = { length: info.visCanvas };
    const canvasLayerMpx = info.visMpx;
    await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
    await sleep(3000); // i ping finiscono di sfumare; pausa tra un run e l'altro
    const d = stats(raw.deltas);
    const total = raw.deltas.reduce((a, b) => a + b, 0) / 1000 || SECS;
    const ms = (k) => stats(raw.r[k]);
    rows.push({
      scenario: name, thr: `${thr}x`, canvas: info.canvas.join('x'), video: info.video,
      layers: drawn.length, 'layer Mpx': +layerMpx.toFixed(2),
      'canv vis': canvasLayers.length, 'canv vis Mpx': +canvasLayerMpx.toFixed(2),
      fps: +(d.n / total).toFixed(1),
      'p50 ms': +d.p50.toFixed(1), 'p95 ms': +d.p95.toFixed(1), 'max ms': +d.max.toFixed(0),
      '>33ms/s': +(raw.deltas.filter((x) => x > 33.4).length / total).toFixed(2),
      'long/s': +(raw.long.length / total).toFixed(2),
      'ping cpu': +ms('ping').mean.toFixed(2), 'shader cpu': +ms('shader').mean.toFixed(2), 'aoe cpu': +ms('aoe').mean.toFixed(2),
      'ping gpu': +stats(raw.g.ping).mean.toFixed(3), 'ping gpu p95': +stats(raw.g.ping).p95.toFixed(3),
      'shader gpu': +stats(raw.g.shader).mean.toFixed(3), 'aoe gpu': +stats(raw.g.aoe).mean.toFixed(3),
      'clear/fr': +((raw.c.ping.clear + raw.c.shader.clear + raw.c.aoe.clear) / Math.max(1, d.n)).toFixed(2),
      'draw/fr': +((raw.c.ping.draw + raw.c.shader.draw + raw.c.aoe.draw) / Math.max(1, d.n)).toFixed(2),
      'uni/fr': +((raw.c.ping.uni + raw.c.shader.uni + raw.c.aoe.uni) / Math.max(1, d.n)).toFixed(1),
      // Mpx elaborati dagli shader per frame; canvas ripresentati per frame e
      // loro Mpx (buffer interi che il compositore deve ricomporre).
      'shade Mpx/fr': +(raw.px / 1e6 / Math.max(1, d.n)).toFixed(3),
      'canv/fr': +(raw.presented / Math.max(1, d.n)).toFixed(2),
      'canv Mpx/fr': +(raw.canvasPx / 1e6 / Math.max(1, d.n)).toFixed(3)
    });
    rows[rows.length - 1]._layers = drawn.map((l) => `${l.debugName || l.layerId} ${Math.round(l.width)}x${Math.round(l.height)}`);
    console.error(JSON.stringify(rows[rows.length - 1]));
  }
}

console.log(`\nrenderer: ${await evaluate('__perf.renderer')}  timer query: ${await evaluate('__perf.timer')}`);
console.log(`GL=${GL} pattern=${PATTERN} patch=${PATCHES.join('+') || '-'} finish=${FINISH} ping=${!NOPING} ${W}x${H} secs=${SECS} cores=${args.cores || 'tutti'}`);
console.table(rows.map(({ _layers, ...r }) => r));
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ args, rows }, null, 2));
dm.close();
ws.close();
cleanup();
process.exit(0);
