#!/usr/bin/env node
// Prove A/B sul kiosk del Pi (indagine del 16 nov 2026, vedi
// docs/storia/2026-11-16-ping-scia-buffer.md, «Indagine sul Pi»). Stessa
// premessa di pi-measure.mjs: Chromium già aperto con la porta di debug,
// tunnel sulla 9222, location attiva quella passata con --location.
//
//   node tools/perf-ping/pi-probe.mjs --server=http://IP:3000 --location=<id>
//        [--variants=base,flat,...] [--secs=8] [--pause=4] [--json=out.json]
//
// Ogni variante cambia UNA cosa nella pagina via Runtime.evaluate (niente
// file toccati) e la toglie alla fine; la pagina va comunque ricaricata a
// fine giro. Varianti: vedi VARIANTS sotto. Misura: delta di rAF, tempo CPU
// di pingLayer.render() con e senza resize, Performance.getMetrics
// (TaskDuration ecc. del renderer) e, se --gpu, il carico del processo GPU
// letto da /proc sul Pi (serve --ssh=<host>).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { loadIo, parseArgs, sleep, connectDisplay, waitForDisplay, makePinger, stats } from './cdp-lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.server || !args.location) {
  console.error('uso: node tools/perf-ping/pi-probe.mjs --server=http://IP:3000 --location=<id> [--variants=...]');
  process.exit(2);
}
const SERVER = String(args.server).replace(/\/$/, '');
const CDP = `http://127.0.0.1:${Number(args.cdp || 9222)}`;
const SECS = Number(args.secs || 8);
const PAUSE = Number(args.pause || 4);
const SSH = args.ssh ? String(args.ssh) : null;

// Programma con colore costante: stesso vertex shader, nessun calcolo per
// pixel. Alpha 0,25 per tenere la stessa composizione (blending) del vero.
const FLAT_FS = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() { fragColor = vec4(0.25, 0.0, 0.0, 0.25); }`;

function extraCanvas(aa) {
  return `(() => { const P = window.__probe; const c = document.createElement('canvas');
    const full = pingLayer.sub.fullSize(); c.width = full.w; c.height = full.h;
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    mapPingCanvas.parentElement.appendChild(c);
    const gl = c.getContext('webgl2', { antialias: ${aa} });
    const prog = linkProgram(gl, SHADER_VERTEX_SRC, ${JSON.stringify(FLAT_FS)});
    let on = true;
    const step = () => { if (!on) return; gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(step); };
    requestAnimationFrame(step);
    P.stopExtra = () => { on = false; gl.getExtension('WEBGL_lose_context')?.loseContext(); c.remove(); }; })()`;
}

// devicePixelRatio dimezzato solo durante render() del ping. In Chrome è una
// proprietà PROPRIA di window: niente delete (la toglierebbe del tutto), si
// rimette il descrittore originale.
const halfDpr = `const P = window.__probe;
  P.dprDesc = P.dprDesc || Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  const realDpr = P.dprDesc.get.call(window);
  pingLayer.render = function (...a) {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => realDpr * 0.5 });
    try { return P.inner.apply(this, a); } finally { Object.defineProperty(window, 'devicePixelRatio', P.dprDesc); } };`;

function swapPingCanvas(aa) {
  return `(() => { const P = window.__probe; const old = pingLayer.canvas; const c = old.cloneNode(false);
    old.replaceWith(c); P.hook(c);
    const saved = { canvas: pingLayer.canvas, gl: pingLayer.gl, program: pingLayer.program, noiseTexture: pingLayer.noiseTexture, uniforms: pingLayer.uniforms, sub: pingLayer.sub };
    Object.assign(pingLayer, { canvas: c, gl: c.getContext('webgl2', { antialias: ${aa} }), program: null, noiseTexture: null, uniforms: null, sub: new SubCanvas(c, { growOnly: true }) });
    P.unswap = () => { pingLayer.gl.getExtension('WEBGL_lose_context')?.loseContext(); c.replaceWith(old); Object.assign(pingLayer, saved); pingLayer.sub.hide(); pingLayer.sub.styleKey = ''; }; })()`;
}

// setup/teardown: espressioni JS valutate nella pagina. pattern: ping inviati.
const VARIANTS = {
  noping: { pattern: null },
  base: { pattern: 'trail' },
  // Shader del ping banale (costo GPU per pixel quasi zero), stessa area.
  flat: {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origProg = pingLayer.program; pingLayer.ensureProgram();
      P.flatProg = P.flatProg || linkProgram(pingLayer.gl, SHADER_VERTEX_SRC, ${JSON.stringify(FLAT_FS)});
      pingLayer.program = P.flatProg; P.origUniforms = pingLayer.uniforms; pingLayer.uniforms = null; })()`,
    teardown: `(() => { const P = window.__probe; pingLayer.program = P.origProg; pingLayer.uniforms = P.origUniforms; })()`
  },
  // Il canvas del ping si disegna ma non si compone (visibility hidden).
  hidden: {
    pattern: 'trail',
    setup: `mapPingCanvas.style.visibility = 'hidden'`,
    teardown: `mapPingCanvas.style.visibility = ''`
  },
  // Niente ping e niente render: il canvas resta nascosto. Il video in pausa.
  novideo: {
    pattern: null,
    setup: `(() => { window.__probe.vidWasPaused = mapVideo.paused; mapVideo.pause(); })()`,
    teardown: `(() => { if (!window.__probe.vidWasPaused) mapVideo.play(); })()`
  },
  'base-novideo': {
    pattern: 'trail',
    setup: `(() => { window.__probe.vidWasPaused = mapVideo.paused; mapVideo.pause(); })()`,
    teardown: `(() => { if (!window.__probe.vidWasPaused) mapVideo.play(); })()`
  },
  // Buffer sempre grande quanto la mappa (nessun resize dopo il primo).
  full: {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origGrown = pingLayer.sub.grownRect;
      pingLayer.sub.grownRect = (r, full) => ({ x: 0, y: 0, w: full.w, h: full.h }); })()`,
    teardown: `(() => { pingLayer.sub.grownRect = window.__probe.origGrown; })()`
  },
  'full-flat': {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origGrown = pingLayer.sub.grownRect;
      pingLayer.sub.grownRect = (r, full) => ({ x: 0, y: 0, w: full.w, h: full.h });
      P.origProg = pingLayer.program; pingLayer.ensureProgram();
      P.flatProg = P.flatProg || linkProgram(pingLayer.gl, SHADER_VERTEX_SRC, ${JSON.stringify(FLAT_FS)});
      pingLayer.program = P.flatProg; P.origUniforms = pingLayer.uniforms; pingLayer.uniforms = null; })()`,
    teardown: `(() => { const P = window.__probe; pingLayer.sub.grownRect = P.origGrown;
      pingLayer.program = P.origProg; pingLayer.uniforms = P.origUniforms; })()`
  },
  // Canvas pieno ma niente draw: solo clear (= composizione di un layer
  // grande ripresentato a ogni frame, zero shader).
  'full-clear': {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origGrown = pingLayer.sub.grownRect;
      pingLayer.sub.grownRect = (r, full) => ({ x: 0, y: 0, w: full.w, h: full.h });
      const gl = pingLayer.gl; P.origDraw = gl.drawArrays; gl.drawArrays = () => {}; })()`,
    teardown: `(() => { const P = window.__probe; pingLayer.sub.grownRect = P.origGrown; pingLayer.gl.drawArrays = P.origDraw; })()`
  },
  // Meno segmenti: ogni gruppo tagliato agli ultimi 4 punti, buffer pieno
  // per tenere uguali i pixel.
  'full-seg4': {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origGrown = pingLayer.sub.grownRect;
      pingLayer.sub.grownRect = (r, full) => ({ x: 0, y: 0, w: full.w, h: full.h });
      pingLayer.render = function (g, ...rest) { return P.inner.call(this, (g || []).map((x) => x.slice(-4)), ...rest); }; })()`,
    teardown: `(() => { const P = window.__probe; pingLayer.sub.grownRect = P.origGrown; pingLayer.render = null; })()`
  },
  // Prototipo di rimedio: lo shader vero con un test sul riquadro del
  // segmento (allargato della distanza utile) prima di distToSegmentT.
  // Stesso risultato: fuori da TRAIL_REACH lo shader dà comunque alpha 0.
  cull: {
    pattern: 'trail',
    setup: `(() => { const P = window.__probe; P.origProg = pingLayer.program; pingLayer.ensureProgram();
      const src = PING_FRAGMENT_SRC.replace('vec2 dt = distToSegmentT(p, u_points[a], u_points[b]);',
        'vec2 A = u_points[a]; vec2 B = u_points[b]; float R = min(minDist, TRAIL_REACH * u_lineWidth);' +
        ' if (any(lessThan(p, min(A, B) - R)) || any(greaterThan(p, max(A, B) + R))) continue;' +
        ' vec2 dt = distToSegmentT(p, A, B);');
      if (src === PING_FRAGMENT_SRC) throw new Error('sostituzione cull non applicata');
      P.cullProg = P.cullProg || linkProgram(pingLayer.gl, SHADER_VERTEX_SRC, src);
      pingLayer.program = P.cullProg; P.origUniforms = pingLayer.uniforms; pingLayer.uniforms = null; })()`,
    teardown: `(() => { const P = window.__probe; pingLayer.program = P.origProg; pingLayer.uniforms = P.origUniforms; })()`
  },
  // Prototipo di rimedio: buffer del ping a mezza risoluzione (dpr 0,5
  // durante render(), il CSS lo riporta a grandezza piena): 1/4 dei pixel.
  half: {
    pattern: 'trail',
    setup: `(() => { ${halfDpr} })()`,
    teardown: `(() => { pingLayer.render = null; })()`
  },
  // Un canvas WebGL in più a tutto schermo, ripulito e ridisegnato (colore
  // costante) a ogni frame, senza ping: costo fisso di un layer WebGL
  // ripresentato, con e senza antialias (MSAA) nel contesto.
  'extra-aa': { pattern: null, setup: extraCanvas(true), teardown: 'window.__probe.stopExtra()' },
  'extra-noaa': { pattern: null, setup: extraCanvas(false), teardown: 'window.__probe.stopExtra()' },
  // Prototipo di rimedio: contesto del ping senza antialias (MSAA). Canvas
  // nuovo al posto di quello vero, stessi id e classi; teardown lo rimette.
  noaa: { pattern: 'trail', setup: swapPingCanvas(false), teardown: 'window.__probe.unswap()' },
  'noaa-half': {
    pattern: 'trail',
    setup: `(() => { ${swapPingCanvas(false)}; ${halfDpr} })()`,
    teardown: `(() => { pingLayer.render = null; window.__probe.unswap(); })()`
  },
  // Scia piccola (raggio 5% invece di 25%): riquadro e pixel molto minori.
  small: { pattern: 'trail', radius: 5 }
};

const INSTRUMENT = `(() => {
  if (window.__probe) return 'già';
  const P = window.__probe = { rec: false, deltas: [], last: 0, ping: [], rzT: [], nrT: [], rz: 0, rzFlag: false, px: 0 };
  P.hook = (canvas) => { for (const prop of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
    Object.defineProperty(canvas, prop, { configurable: true,
      get() { return d.get.call(this); },
      set(v) { if (d.get.call(this) !== v) { P.rzFlag = true; if (P.rec) P.rz++; } d.set.call(this, v); } });
  } };
  P.hook(mapPingCanvas);
  // Wrapper fisso: chi assegna pingLayer.render (le varianti) imposta P.cur,
  // che deve chiamare P.inner; null torna all'originale.
  const inner = pingLayer.render;
  const outer = function (...a) {
    const t0 = performance.now(); P.rzFlag = false; const r = (P.cur || inner).apply(this, a);
    if (P.rec) { const dt = performance.now() - t0; P.ping.push(dt); (P.rzFlag ? P.rzT : P.nrT).push(dt);
      if (a[0] && a[0].length) P.px += pingLayer.canvas.width * pingLayer.canvas.height; }
    return r;
  };
  Object.defineProperty(pingLayer, 'render', { configurable: true,
    get() { return outer; }, set(fn) { P.cur = fn === outer ? null : fn; } });
  P.cur = null; P.inner = inner;
  function tick(t) { if (P.rec) { if (P.last) P.deltas.push(t - P.last); P.last = t; } requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  return 'ok';
})()`;

function sshCmd(cmd) {
  if (!SSH) return null;
  try { return execFileSync('ssh', [SSH, cmd], { encoding: 'utf8', timeout: 15000 }).trim(); } catch (e) { return `errore: ${e.message}`; }
}

// Tempo CPU (utime+stime, in tick da 10 ms) dei thread dei processi
// chromium, per «tipo:thread», letto da /proc sul Pi: differenza fra inizio
// e fine della prova. Nomi dei thread troncati a 15 caratteri dal kernel.
const PROC_CPU = `for p in $(pgrep -f /usr/lib/chromium/chromium); do t=$(tr '\\0' ' ' < /proc/$p/cmdline | grep -o -- '--type=[a-z-]*' | head -1); t=\${t#--type=}; [ -z "$t" ] && t=browser; for k in /proc/$p/task/*; do c=$(tr ' ' '_' < $k/comm); s=$(sed 's/^.*) //' $k/stat | awk '{print $12+$13}'); echo "$t:$c $s"; done; done 2>/dev/null | awk '{a[$1]+=$2} END {for (k in a) print k, a[k]}'`;
function procCpu() {
  const out = sshCmd(PROC_CPU);
  const m = {};
  if (out && !out.startsWith('errore')) for (const line of out.split('\n')) { const [k, v] = line.split(' '); m[k] = Number(v); }
  return m;
}
// % di un core per «tipo:thread» fra due letture, solo sopra 3%.
function cpuDelta(c0, c1, secs) {
  const out = {};
  for (const k of Object.keys(c1)) {
    const pct = ((c1[k] - (c0[k] || 0)) * 10) / (secs * 1000) * 100;
    if (pct >= 3) out[k] = Math.round(pct);
  }
  return out;
}

const { page, evaluate } = await connectDisplay(CDP);
await waitForDisplay(evaluate);
await evaluate(INSTRUMENT);
await page.send('Performance.enable', { timeDomain: 'timeTicks' });
const io = loadIo();
const pinger = makePinger(io, SERVER, String(args.location));
await pinger.ready;

const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const names = String(args.variants || 'noping,base,flat,hidden,full,full-flat,full-clear,full-seg4,small,novideo,base-novideo').split(',');
const rows = [];
for (const name of names) {
  const v = VARIANTS[name];
  if (!v) { console.error(`variante sconosciuta: ${name}`); continue; }
  if (v.setup) await evaluate(v.setup);
  if (v.pattern) { pinger.start(v.pattern, v.radius || 25); await sleep(1500); } // regime
  const temp0 = sshCmd('vcgencmd measure_temp; vcgencmd get_throttled');
  const c0 = procCpu();
  const tStart = Date.now();
  const m0 = await metrics();
  await evaluate(`(() => { const P = __probe; Object.assign(P, { deltas: [], last: 0, ping: [], rzT: [], nrT: [], rz: 0, px: 0, rec: true }); })()`);
  await sleep(SECS * 1000);
  const raw = await evaluate(`(() => { const P = __probe; P.rec = false; return { deltas: P.deltas, ping: P.ping, rzT: P.rzT, nrT: P.nrT, rz: P.rz, px: P.px, vid: !mapVideo.hidden && !mapVideo.paused }; })()`);
  const m1 = await metrics();
  const c1 = procCpu();
  pinger.stop();
  if (v.teardown) await evaluate(v.teardown);
  const d = stats(raw.deltas);
  const total = raw.deltas.reduce((a, b) => a + b, 0) / 1000 || SECS;
  const frames = Math.max(1, d.n);
  const perSec = (k) => +(((m1[k] - m0[k]) / total) * 100).toFixed(0); // % di un core
  const threads = cpuDelta(c0, c1, (Date.now() - tStart) / 1000);
  const sumType = (t) => Object.entries(threads).filter(([k]) => k.startsWith(t + ':')).reduce((a, [, v]) => a + v, 0);
  const row = {
    variante: name, video: raw.vid,
    fps: +(d.n / total).toFixed(1), 'p50 ms': +d.p50.toFixed(0), 'p95 ms': +d.p95.toFixed(0),
    'ping cpu': +stats(raw.ping).mean.toFixed(2), 'rz/s': +(raw.rz / total).toFixed(1),
    'cpu rz': +stats(raw.rzT).mean.toFixed(0), 'cpu no-rz': +stats(raw.nrT).mean.toFixed(2),
    'ping Mpx/fr': +(raw.px / 1e6 / frames).toFixed(2),
    'main task %': perSec('TaskDuration'), 'script %': perSec('ScriptDuration'),
    'gpu proc %': sumType('gpu-process'), 'renderer %': sumType('renderer'), 'browser %': sumType('browser'),
    threads,
    temp: temp0 ? temp0.replace(/\n/g, ' ') : ''
  };
  rows.push(row);
  console.error(JSON.stringify(row));
  await sleep(PAUSE * 1000);
}
console.table(rows.map(({ temp, threads, ...r }) => r));
for (const r of rows) console.log(r.variante, JSON.stringify(r.threads));
console.log('temperature:', rows.map((r) => r.temp).join(' | '));
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ args, rows }, null, 2));
pinger.close();
process.exit(0);
