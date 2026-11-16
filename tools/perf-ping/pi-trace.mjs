#!/usr/bin/env node
// Trace di Chromium (CDP Tracing) sul kiosk del Pi durante una scia o
// durante resize forzati del canvas del ping, con un riassunto per thread.
// Indagine del 16 nov 2026 (docs/storia/2026-11-16-ping-scia-buffer.md,
// «Indagine sul Pi»). Stessa premessa di pi-measure.mjs.
//
//   node tools/perf-ping/pi-trace.mjs --server=http://IP:3000 --location=<id>
//        --mode=trail|resize|idle [--secs=4] [--out=trace.json] [--setup=js] [--teardown=js]
//   node tools/perf-ping/pi-trace.mjs --analyze=trace.json   (solo riassunto)
//
// mode=resize: niente ping; nella pagina il canvas del ping viene mostrato a
// tutto schermo con un draw a ogni frame e la larghezza cambia un frame sì e
// uno no, con performance.mark/measure «rz» attorno al setter: il riassunto
// elenca cosa fanno il main del renderer e il main del processo GPU dentro
// ogni finestra «rz».
import fs from 'node:fs';
import { loadIo, parseArgs, sleep, connectDisplay, waitForDisplay, makePinger, stats } from './cdp-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const CATS = ['toplevel', 'gpu', 'gpu.service', 'cc', 'viz', 'blink', 'v8', 'devtools.timeline', 'blink.user_timing',
  'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service', 'ipc', 'mojom', 'media', 'benchmark', 'webgl'];

function analyze(events, { windows = 'rz' } = {}) {
  const tname = new Map(); const pname = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.ph === 'M' && e.name === 'process_name') pname.set(e.pid, e.args.name);
  }
  const label = (e) => `${pname.get(e.pid) || e.pid}/${tname.get(`${e.pid}:${e.tid}`) || e.tid}`;
  // Eventi X con durata (B/E accoppiati per thread).
  const xs = []; const stacks = new Map();
  for (const e of events) {
    if (e.ph === 'X' && e.dur != null) xs.push(e);
    else if (e.ph === 'B') { const k = `${e.pid}:${e.tid}`; if (!stacks.has(k)) stacks.set(k, []); stacks.get(k).push(e); }
    else if (e.ph === 'E') { const s = stacks.get(`${e.pid}:${e.tid}`); const b = s && s.pop(); if (b) xs.push({ ...b, ph: 'X', dur: e.ts - b.ts }); }
  }
  const ts = events.filter((e) => e.ts > 0).map((e) => e.ts);
  const t0 = Math.min(...ts); const t1 = Math.max(...ts); const span = (t1 - t0) / 1e6;
  // Occupazione: unione degli eventi di primo livello (categoria toplevel).
  const byThread = new Map();
  for (const e of xs) {
    const k = label(e);
    if (!byThread.has(k)) byThread.set(k, { top: [], names: new Map() });
    const t = byThread.get(k);
    if (e.cat && e.cat.split(',').includes('toplevel')) t.top.push([e.ts, e.ts + e.dur]);
    const n = t.names.get(e.name) || { n: 0, tot: 0, max: 0 };
    n.n++; n.tot += e.dur; n.max = Math.max(n.max, e.dur); t.names.set(e.name, n);
  }
  const busy = [];
  for (const [k, t] of byThread) {
    t.top.sort((a, b) => a[0] - b[0]);
    let tot = 0; let end = -Infinity;
    for (const [a, b] of t.top) { if (b <= end) continue; tot += b - Math.max(a, end); end = b; }
    busy.push({ thread: k, 'busy %': +((tot / 1e6 / span) * 100).toFixed(1) });
  }
  busy.sort((a, b) => b['busy %'] - a['busy %']);
  console.log(`\ntrace di ${span.toFixed(2)} s, ${events.length} eventi`);
  console.table(busy.filter((b) => b['busy %'] >= 1));
  const top = (re, k = 14) => {
    for (const [th, t] of byThread) {
      if (!re.test(th)) continue;
      const list = [...t.names].map(([name, v]) => ({ name: name.slice(0, 70), n: v.n, 'ms/s': +((v.tot / 1e3) / span).toFixed(1), 'max ms': +(v.max / 1e3).toFixed(1) }))
        .sort((a, b) => b['ms/s'] - a['ms/s']).slice(0, k);
      console.log(`\n${th}`); console.table(list);
    }
  };
  top(/GPU Process\/CrGpuMain|gpu-process.*CrGpuMain|\/CrGpuMain/);
  top(/\/VizCompositorThread/, 10);
  top(/Renderer\/CrRendererMain/);
  // Frame (PipelineReporter: eventi async b/e di cc).
  const asyncOpen = new Map(); const durs = new Map();
  for (const e of events) {
    if (e.ph !== 'b' && e.ph !== 'e') continue;
    const k = `${e.cat}:${e.name}:${e.id2?.local || e.id2?.global || e.id}`;
    if (e.ph === 'b') asyncOpen.set(k, e.ts);
    else if (asyncOpen.has(k)) { const d = e.ts - asyncOpen.get(k); asyncOpen.delete(k); if (!durs.has(e.name)) durs.set(e.name, []); durs.get(e.name).push(d / 1e3); }
  }
  const asyncRows = [...durs].map(([name, a]) => { const s = stats(a); return { name: name.slice(0, 70), n: s.n, 'media ms': +s.mean.toFixed(1), 'p95 ms': +s.p95.toFixed(1), 'tot ms/s': +((s.mean * s.n) / span).toFixed(0) }; })
    .filter((r) => r.n >= 3).sort((a, b) => b['tot ms/s'] - a['tot ms/s']).slice(0, 22);
  console.log('\neventi async (fasi dei frame e simili)'); console.table(asyncRows);
  // Finestre «rz» (performance.measure nella pagina).
  const wins = xs.filter((e) => e.name === windows && /user_timing/.test(e.cat || ''));
  const winsAsync = [];
  for (const e of events) if (e.name === windows && (e.ph === 'b' || e.ph === 'e') && /user_timing/.test(e.cat || '')) winsAsync.push(e);
  const W = [...wins.map((e) => [e.ts, e.ts + e.dur])];
  for (let i = 0; i + 1 < winsAsync.length; i++) if (winsAsync[i].ph === 'b' && winsAsync[i + 1].ph === 'e') W.push([winsAsync[i].ts, winsAsync[i + 1].ts]);
  if (W.length) {
    console.log(`\n${W.length} finestre «${windows}»: durata ${W.map(([a, b]) => ((b - a) / 1e3).toFixed(0)).join(', ')} ms`);
    const inWin = (re) => {
      const agg = new Map();
      for (const e of xs) {
        if (!re.test(label(e))) continue;
        for (const [a, b] of W) {
          const ov = Math.min(b, e.ts + e.dur) - Math.max(a, e.ts);
          if (ov > 0) { const v = agg.get(e.name) || 0; agg.set(e.name, v + ov); }
        }
      }
      return [...agg].map(([name, v]) => ({ name: name.slice(0, 80), 'ms in finestre (media)': +((v / 1e3) / W.length).toFixed(1) }))
        .sort((x, y) => y['ms in finestre (media)'] - x['ms in finestre (media)']).slice(0, 18);
    };
    console.log('\nrenderer main dentro le finestre'); console.table(inWin(/Renderer\/CrRendererMain/));
    console.log('\nGPU main dentro le finestre'); console.table(inWin(/\/CrGpuMain/));
  }
}

if (args.analyze) {
  const raw = JSON.parse(fs.readFileSync(String(args.analyze), 'utf8'));
  analyze(Array.isArray(raw) ? raw : raw.traceEvents);
  process.exit(0);
}

const CDP = `http://127.0.0.1:${Number(args.cdp || 9222)}`;
const SECS = Number(args.secs || 4);
const MODE = String(args.mode || 'trail');
const { evaluate, browser } = await connectDisplay(CDP);
await waitForDisplay(evaluate);

// --setup / --teardown: espressioni JS valutate nella pagina prima e dopo
// (es. --setup="mapVideo.pause()" --teardown="mapVideo.play()").
if (args.setup) await evaluate(String(args.setup));
let pinger = null;
if (MODE === 'trail') {
  pinger = makePinger(loadIo(), String(args.server).replace(/\/$/, ''), String(args.location));
  await pinger.ready;
  pinger.start('trail');
  await sleep(1500);
}

const chunks = [];
browser.on('Tracing.dataCollected', (p) => chunks.push(...p.value));
const done = new Promise((r) => browser.on('Tracing.tracingComplete', r));
await browser.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: CATS, recordMode: 'recordContinuously' } });
await sleep(300);
if (MODE === 'resize') {
  // Canvas del ping a tutto schermo per SECS secondi, resize a frame alterni.
  await evaluate(`new Promise((resolve) => {
    const c = mapPingCanvas; const gl = pingLayer.gl;
    const prog = linkProgram(gl, SHADER_VERTEX_SRC, '#version 300 es\\nprecision mediump float;out vec4 o;void main(){o=vec4(0.1,0.0,0.0,0.1);}');
    const full = pingLayer.sub.fullSize(); const W = Number(${Number(args.w || 0)}) || full.w; const H = Number(${Number(args.h || 0)}) || full.h;
    c.style.display = ''; c.style.inset = '0'; c.style.left = '0'; c.style.top = '0'; c.style.width = '100%'; c.style.height = '100%';
    const end = performance.now() + ${SECS * 1000}; let i = 0;
    const step = () => {
      if (i % 2 === 1) { performance.mark('rzA'); c.width = (i % 4 === 1) ? W - 32 : W; c.height = H; performance.measure('rz', 'rzA'); }
      gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(prog); gl.drawArrays(gl.TRIANGLES, 0, 3);
      i++;
      if (performance.now() < end) requestAnimationFrame(step); else { c.style.display = 'none'; pingLayer.sub.shown = false; pingLayer.sub.styleKey = ''; resolve(i); }
    };
    requestAnimationFrame(step);
  })`);
} else {
  await sleep(SECS * 1000);
}
await browser.send('Tracing.end');
await done;
if (pinger) { pinger.stop(); pinger.close(); }
if (args.teardown) await evaluate(String(args.teardown));
if (args.out) fs.writeFileSync(String(args.out), JSON.stringify({ traceEvents: chunks }));
analyze(chunks);
process.exit(0);
