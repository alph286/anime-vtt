#!/usr/bin/env node
// Confronto pixel per pixel tra PingLayer/AoeShaderLayer di un riferimento git
// (default `main`) e quelli del checkout corrente, sulla stessa pagina.
//
// Server di PROVA (porta 3101, dati finti in una cartella temporanea, mai la
// 3000), Chrome headless con GPU vera via CDP. Nella pagina (/display/ e
// /control/) il vecchio shader-effects.js viene valutato in uno scope isolato
// (classi Old*), il nuovo è quello già caricato; ciascuno disegna su un proprio
// canvas aggiunto a #map-fit-box, con la stessa texture di rumore (Math.random
// con seme fisso) e lo stesso istante (performance.now bloccato). I pixel si
// leggono con gl.readPixels nello stesso task del disegno; quelli del canvas
// ridotto vengono riportati nella posizione del canvas pieno. Si controlla
// anche che il canvas ridotto stia, a schermo, dove dice il suo riquadro.
//
//   node tools/perf-ping/compare-visual.mjs [--ref=main] [--pages=display,control]

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const PORT = Number(args.port || 3101);
if (PORT === 3000) throw new Error('porta 3000 vietata (server vero)');
const CDP_PORT = Number(args.cdp || 9334);
const REF = args.ref || 'main';
const PAGES = String(args.pages || 'display,control').split(',');
const ANGLE = args.angle || 'gl-egl';
const W = 1280;
const H = 720;
const oldSrc = execFileSync('git', ['-C', repo, 'show', `${REF}:public/shared/shader-effects.js`], { encoding: 'utf8' });

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-compare-'));
const DATA_DIR = path.join(work, 'data');
const STORAGE_DIR = path.join(work, 'storage');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(STORAGE_DIR, 'maps'), { recursive: true });
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080', '-frames:v', '1', path.join(STORAGE_DIR, 'maps', 'map.png')]);
const grid = { enabled: true, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
fs.writeFileSync(path.join(DATA_DIR, 'state.json'), JSON.stringify({
  campaign: { name: 'cmp' },
  locations: [{
    id: 'L', name: 'L',
    map: { file: 'map.png', type: 'image', scale: 1, flip180: false, rotate90: false, liveView: { scale: 1, offsetX: 0, offsetY: 0 }, grid, compass: { visible: false, x: 88, y: 85, rotation: 0 }, polygons: [], aoes: [], shaders: [] },
    images: [], archived: false, isDefault: true
  }],
  activeLocationId: 'L', activeImageId: null
}));

const server = spawn(process.execPath, [path.join(repo, 'server', 'index.js')], { cwd: repo, env: { ...process.env, PORT: String(PORT), DATA_DIR, STORAGE_DIR }, stdio: 'ignore' });
const chrome = spawn(args.chrome || 'google-chrome', [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(work, 'chrome')}`,
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
  '--enable-gpu', '--ignore-gpu-blocklist', `--use-angle=${ANGLE}`, 'about:blank'
], { stdio: 'ignore' });
function cleanup() {
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  fs.rmSync(work, { recursive: true, force: true });
}
process.on('exit', cleanup);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url) {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(250); }
  throw new Error(`non risponde: ${url}`);
}
await waitHttp(`http://127.0.0.1:${PORT}/display/`);
await waitHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);

async function openPage(url) {
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  await sleep(3000);
  const evaluate = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { evaluate, close: () => ws.close() };
}

// Codice eseguito nella pagina: ritorna le statistiche del confronto.
const PAGE_CODE = (old) => `(() => {
  const OLD = new Function(${JSON.stringify(old)} + '\\nreturn { PingLayer, AoeShaderLayer };')();
  const fit = document.getElementById('map-fit-box');
  if (!fit || !fit.clientWidth) return { error: 'fit box assente o vuoto' };
  const mk = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.style.zIndex = 50; fit.appendChild(c); return c; };
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const realRandom = Math.random; const realNow = performance.now.bind(performance);
  function withFixed(fn) {
    Math.random = seeded(42); performance.now = () => 123456.7;
    try { return fn(); } finally { Math.random = realRandom; performance.now = realNow; }
  }
  // Pixel del canvas (RGBA, origine in basso a sinistra) riportati nel canvas pieno.
  function readFull(canvas, fullW, fullH, ox, oy) {
    const gl = canvas.getContext('webgl2');
    const w = canvas.width, h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8Array(fullW * fullH * 4);
    if (canvas.style.display === 'none') return out;
    for (let y = 0; y < h; y++) {
      const fy = y + oy; if (fy < 0 || fy >= fullH) continue;
      for (let x = 0; x < w; x++) {
        const fx = x + ox; if (fx < 0 || fx >= fullW) continue;
        const s = (y * w + x) * 4, d = (fy * fullW + fx) * 4;
        out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
      }
    }
    return out;
  }
  function compare(a, b) {
    let maxDiff = 0, diff2 = 0, litA = 0, litB = 0, sumA = 0, sumB = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] > 0) litA++; if (b[i + 3] > 0) litB++;
      sumA += a[i + 3]; sumB += b[i + 3];
      let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(a[i + k] - b[i + k]));
      if (m > maxDiff) maxDiff = m; if (m > 2) diff2++;
    }
    return { litOld: litA, litNew: litB, alphaSumOld: sumA, alphaSumNew: sumB, maxDiff, pxDiffOver2: diff2 };
  }
  // Il canvas ridotto deve stare a schermo dove dice il suo riquadro.
  function placement(oldC, newC, sub) {
    if (newC.style.display === 'none') return 'nascosto';
    const [x, y, w, h, fw, fh] = sub.styleKey.split(',').map(Number);
    const ro = oldC.getBoundingClientRect(), rn = newC.getBoundingClientRect();
    const k = ro.width / fw;
    const exp = { left: ro.left + x * k, top: ro.top + (fh - y - h) * k, width: w * k, height: h * k };
    return Math.max(Math.abs(rn.left - exp.left), Math.abs(rn.top - exp.top), Math.abs(rn.width - exp.width), Math.abs(rn.height - exp.height));
  }
  const results = {};
  // ---- ping ----
  const cOld = mk('ping-layer'), cNew = mk('ping-layer');
  const pOld = new OLD.PingLayer(cOld), pNew = new PingLayer(cNew);
  const trail = []; for (let i = 0; i < 12; i++) { const a = i / 11 * Math.PI; trail.push({ x: 50 + 20 * Math.cos(a), y: 50 + 25 * Math.sin(a), age: (11 - i) * 0.09 }); }
  const cases = {
    'tap 0.3s': [[{ x: 30, y: 40, age: 0.3 }]],
    'tap 0.8s + tap 0.1s': [[{ x: 30, y: 40, age: 0.8 }], [{ x: 70, y: 60, age: 0.1 }]],
    'scia': [trail],
    'misto': [trail, [{ x: 20, y: 75, age: 0.5 }]],
    'tap al bordo': [[{ x: 2, y: 97, age: 0.6 }]],
    'misto zoom 1.7': [trail, [{ x: 20, y: 75, age: 0.5 }]]
  };
  for (const [name, groups] of Object.entries(cases)) {
    const zoom = name.includes('zoom') ? 1.7 : 1;
    const r = withFixed(() => {
      pOld.render(groups, 1.2, zoom); Math.random = seeded(42); pNew.render(groups, 1.2, zoom);
      const fw = cOld.width, fh = cOld.height;
      const [ox, oy] = pNew.sub.styleKey.split(',').map(Number);
      return { ...compare(readFull(cOld, fw, fh, 0, 0), readFull(cNew, fw, fh, ox, oy)), full: fw + 'x' + fh, sub: cNew.width + 'x' + cNew.height, placementErrPx: placement(cOld, cNew, pNew.sub) };
    });
    results['ping ' + name] = r;
  }
  pNew.render([], 1.2, 1);
  results['ping vuoto'] = { hidden: cNew.style.display === 'none' };
  // ---- aree lanciate ----
  const nw = 1920, nh = 1080;
  const g = { enabled: true, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0 };
  const base = { sizeM: 6, widthM: null, rotation: 0, shapeVisible: true, shaderOverride: null, cast: true };
  const aoes = [
    { ...base, id: 'c1', shape: 'sphere', x: 30, y: 35, color: 'red' },
    { ...base, id: 'c2', shape: 'cone', sizeM: 9, x: 60, y: 60, rotation: 20, color: 'green' },
    { ...base, id: 'c3', shape: 'cube', sizeM: 5, x: 75, y: 25, color: 'white' },
    { ...base, id: 'c4', shape: 'line', sizeM: 12, widthM: 2, x: 20, y: 80, rotation: 35, color: 'yellow' }
  ].map((a) => ({ ...a, shaderId: resolveAoeShaderId(a) }));
  const aOld = new OLD.AoeShaderLayer(mk('shader-layer')), aNew = new AoeShaderLayer(mk('shader-layer'));
  const r = withFixed(() => {
    aOld.render(aoes, g, nw, nh); aNew.render(aoes, g, nw, nh);
    const fw = aOld.canvas.width, fh = aOld.canvas.height;
    const [ox, oy] = aNew.sub.styleKey.split(',').map(Number);
    return { ...compare(readFull(aOld.canvas, fw, fh, 0, 0), readFull(aNew.canvas, fw, fh, ox, oy)), full: fw + 'x' + fh, sub: aNew.canvas.width + 'x' + aNew.canvas.height, placementErrPx: placement(aOld.canvas, aNew.canvas, aNew.sub) };
  });
  results['aoe 4 aree'] = r;
  // Stesso istante, secondo render subito dopo: limitato (nessun nuovo disegno).
  let draws = 0; const glN = aNew.gl; const od = glN.drawArrays.bind(glN); glN.drawArrays = (...a) => { draws++; return od(...a); };
  withFixed(() => aNew.render(aoes, g, nw, nh));
  const skipped = draws === 0;
  withFixed(() => aNew.render(aoes.slice(0, 2), g, nw, nh));
  results['aoe limite fps'] = { secondoRenderSaltato: skipped, cambioAreeRidisegna: draws > 0 };
  aNew.render([], g, nw, nh);
  results['aoe vuoto'] = { hidden: aNew.canvas.style.display === 'none' };
  fit.querySelectorAll('canvas[style*="z-index: 50"]').forEach((c) => c.remove());
  return results;
})()`;

let failed = false;
for (const name of PAGES) {
  const page = await openPage(`http://127.0.0.1:${PORT}/${name}/`);
  const renderer = await page.evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); })()`);
  if (!/NVIDIA/i.test(renderer)) throw new Error(`GPU non NVIDIA: ${renderer}`);
  const res = await page.evaluate(PAGE_CODE(oldSrc));
  console.log(`\n/${name}/  (${renderer})`);
  if (res.error) { console.log(res.error); failed = true; continue; }
  console.table(res);
  for (const [k, v] of Object.entries(res)) {
    if ('maxDiff' in v && (v.pxDiffOver2 > 0 || v.placementErrPx > 0.5)) failed = true;
    if ('hidden' in v && !v.hidden) failed = true;
    if (k === 'aoe limite fps' && !(v.secondoRenderSaltato && v.cambioAreeRidisegna)) failed = true;
  }
  page.close();
}
console.log(failed ? '\nDIFFERENZE TROVATE' : '\nnessuna differenza');
cleanup();
process.exit(failed ? 1 : 0);
