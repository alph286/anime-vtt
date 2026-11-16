#!/usr/bin/env node
// Micro-prova del resize di un canvas WebGL2 dentro /display del kiosk (Pi),
// indagine del 16 nov 2026 (docs/storia/2026-11-16-ping-scia-buffer.md,
// «Indagine sul Pi»). Stessa premessa di pi-measure.mjs.
//
//   node tools/perf-ping/pi-resize.mjs --server=http://IP:3000 --location=<id> [--load=none,trail]
//
// Per ogni carico (nessun ping / scia in corso) e per ogni configurazione
// (dimensione, attributi del contesto) crea un canvas NUOVO nella pagina,
// a fianco di quello del ping, e ne cambia la larghezza N volte, un resize
// per frame (in rAF, come nel ping). Tempi separati: setter width/height,
// prima chiamata GL dopo il resize (viewport+clear+draw), gl.getError()
// (andata e ritorno sincrona col processo GPU) e lo stesso getError SENZA
// resize nello stesso frame, che misura da solo l'attesa del processo GPU.
import { loadIo, parseArgs, sleep, connectDisplay, waitForDisplay, makePinger, stats } from './cdp-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const SERVER = String(args.server || '').replace(/\/$/, '');
const CDP = `http://127.0.0.1:${Number(args.cdp || 9222)}`;
const N = Number(args.n || 12);
const LOADS = String(args.load || 'none,trail').split(',');

const BENCH = `async ({ w, h, attrs, attached, n, sync }) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  if (attached) { c.style.cssText = 'position:absolute;left:0;top:0;width:' + (w / devicePixelRatio) + 'px;height:' + (h / devicePixelRatio) + 'px;pointer-events:none;opacity:0.01'; mapPingCanvas.parentElement.appendChild(c); }
  const gl = c.getContext('webgl2', attrs);
  const prog = linkProgram(gl, SHADER_VERTEX_SRC, '#version 300 es\\nprecision mediump float;out vec4 o;void main(){o=vec4(0.1,0.0,0.0,0.1);}');
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const draw = () => { gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(prog); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  for (let i = 0; i < 3; i++) { await frame(); draw(); }
  const res = { set: [], first: [], sync: [], idleSync: [], total: [] };
  for (let i = 0; i < n; i++) {
    await frame();
    // Frame senza resize: solo draw + getError (attesa del processo GPU).
    draw();
    if (sync) { const t = performance.now(); gl.getError(); res.idleSync.push(performance.now() - t); }
    await frame();
    const t0 = performance.now();
    c.width = (i % 2) ? w : w + 32; c.height = h;
    const t1 = performance.now();
    draw();
    const t2 = performance.now();
    if (sync) gl.getError();
    const t3 = performance.now();
    res.set.push(t1 - t0); res.first.push(t2 - t1); res.sync.push(t3 - t2); res.total.push(t3 - t0);
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  c.remove();
  return res;
}`;

const CONFIGS = [
  { name: 'ping default 1150x720', w: 1150, h: 720, attrs: {}, attached: true },
  { name: 'default 1150x720 staccato', w: 1150, h: 720, attrs: {}, attached: false },
  { name: 'antialias:false 1150x720', w: 1150, h: 720, attrs: { antialias: false }, attached: true },
  { name: 'aa:false preserve 1150x720', w: 1150, h: 720, attrs: { antialias: false, preserveDrawingBuffer: true }, attached: true },
  { name: 'default 300x200', w: 300, h: 200, attrs: {}, attached: true },
  { name: 'default 1900x1060', w: 1900, h: 1060, attrs: {}, attached: true },
  { name: 'aa:false 1900x1060', w: 1900, h: 1060, attrs: { antialias: false }, attached: true }
];

const { evaluate, page } = await connectDisplay(CDP);
await waitForDisplay(evaluate);
const pinger = SERVER && args.location ? makePinger(loadIo(), SERVER, String(args.location)) : null;
if (pinger) await pinger.ready;
const only = args.configs ? String(args.configs).split(',').map(Number) : null;
const rows = [];
for (const load of LOADS) {
  if (load !== 'none') { if (!pinger) throw new Error('serve --server e --location per il carico'); pinger.start(load); await sleep(1500); }
  for (const [i, cfg] of CONFIGS.entries()) {
    if (only && !only.includes(i)) continue;
    const r = await page.send('Runtime.evaluate', {
      expression: `(${BENCH})(${JSON.stringify({ ...cfg, n: N, sync: true })})`, awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    const v = r.result.value;
    const m = (a) => +stats(a).mean.toFixed(1);
    const p = (a) => +stats(a).p50.toFixed(1);
    rows.push({ carico: load, config: cfg.name, 'set ms': m(v.set), 'draw ms': m(v.first), 'getError dopo rz': m(v.sync),
      'totale p50': p(v.total), 'totale media': m(v.total), 'getError senza rz': m(v.idleSync) });
    console.error(JSON.stringify(rows[rows.length - 1]));
  }
  if (pinger) pinger.stop();
  await sleep(3000);
}
console.table(rows);
if (pinger) pinger.close();
process.exit(0);
