#!/usr/bin/env node
// NON FUNZIONANTE: restituisce «pingLayer non definito». Non corretto (falliti
// tre tentativi). Cause sospette, non verificate: manca Runtime.enable prima di
// Runtime.evaluate, oppure la pagina agganciata non è quella giusta.
// Misura dei frame di /display su un Chromium GIÀ APERTO (il kiosk del
// Raspberry), via CDP: niente server di prova, niente browser lanciato da qui.
//
// Prima, da chi lo lancia (non da questo script): tunnel verso la porta di
// debug del kiosk, per esempio
//   ssh -N -L 9222:localhost:9222 <utente>@<pi>
// (il Chromium del kiosk deve essere partito con --remote-debugging-port=9222).
//
//   node tools/perf-ping/pi-measure.mjs --server=http://IP:3000 [--location=<id>]
//        [--cdp=9222] [--secs=8] [--pause=4] [--tests=noping,tap,trail,mix] [--json=out.json]
//
// Prove (come la tabella della serata): nessun ping; solo tap (uno ogni 1,3 s);
// solo scia (25 punti in cerchio, raggio 25% dello schermo, ~30 punti/s);
// misto (tap + scia). I ping sono `ping:show` inviati al server indicato con
// la location ATTIVA (il server scarta gli altri): li vedono tutti i client
// collegati, /control compreso, come un ping del DM.
//
// Strumentazione nella pagina (una sola volta, idempotente): delta di
// requestAnimationFrame, tempo CPU dei render() dei tre layer, quanti canvas
// vengono ridisegnati (= ripresentati al compositore) per frame e quanti
// megapixel, pixel elaborati dagli shader per frame, area a schermo dei canvas
// WebGL visibili. Avvolge render() e due funzioni del contesto GL: per
// tornare alla pagina pulita basta ricaricare /display alla fine.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
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
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
if (!args.server) {
  console.error('uso: node tools/perf-ping/pi-measure.mjs --server=http://IP:3000 [--location=<id>] [--cdp=9222] [--secs=8] [--tests=noping,tap,trail,mix]');
  process.exit(2);
}
const SERVER = String(args.server).replace(/\/$/, '');
const CDP = `http://${args['cdp-host'] || '127.0.0.1'}:${Number(args.cdp || 9222)}`;
const SECS = Math.min(8, Number(args.secs || 8));
const PAUSE = Number(args.pause || 4);
const TESTS = String(args.tests || 'noping,tap,trail,mix').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP verso la pagina /display ----------
const targets = await (await fetch(`${CDP}/json/list`)).json();
const target = targets.find((t) => t.type === 'page' && /\/display\/?(\?|#|$)/.test(t.url));
if (!target) {
  console.error(`nessuna pagina /display tra i target CDP di ${CDP}:`);
  for (const t of targets) console.error(`  ${t.type} ${t.url}`);
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
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

const INSTRUMENT = `(() => {
  if (window.__piPerf) return 'già';
  const P = window.__piPerf = { rec: false, deltas: [], last: 0, r: { ping: [], shader: [], aoe: [] },
    px: 0, presented: 0, canvasPx: 0, dirty: new Set() };
  const layers = { ping: pingLayer, shader: shaderLayer, aoe: aoeShaderLayer };
  for (const [key, L] of Object.entries(layers)) {
    const gl = L.gl;
    if (gl) {
      const area = () => { const v = gl.getParameter(gl.VIEWPORT); return Math.max(0, v[2]) * Math.max(0, v[3]); };
      const od = gl.drawArrays.bind(gl);
      gl.drawArrays = (...a) => { if (P.rec) { P.px += area(); P.dirty.add(gl); } return od(...a); };
      const oc = gl.clear.bind(gl);
      gl.clear = (...a) => { if (P.rec) P.dirty.add(gl); return oc(...a); };
    }
    const orig = L.render.bind(L);
    L.render = (...a) => { const t0 = performance.now(); orig(...a); if (P.rec) P.r[key].push(performance.now() - t0); };
  }
  { const gl = pingLayer.gl; const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    P.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'nessun webgl2'); }
  function tick(t) {
    if (P.rec) {
      if (P.last) P.deltas.push(t - P.last);
      P.last = t;
      P.presented += P.dirty.size;
      for (const gl of P.dirty) P.canvasPx += gl.drawingBufferWidth * gl.drawingBufferHeight;
    }
    P.dirty.clear();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return 'ok';
})()`;

const SNAPSHOT = `(() => {
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
  const loc = lastState && getActiveLocation(lastState);
  return {
    visCanvas: vis.length, visMpx: area / 1e6,
    video: !mapVideo.hidden && !mapVideo.paused,
    castAoes: loc ? (loc.map.aoes || []).filter((a) => a.cast).length : 0,
    screen: innerWidth + 'x' + innerHeight + '@' + devicePixelRatio
  };
})()`;

// La pagina potrebbe essere ancora in caricamento (es. kiosk appena ricaricato).
for (let i = 0; ; i++) {
  if (await evaluate(`typeof pingLayer !== 'undefined' && typeof aoeShaderLayer !== 'undefined'`)) break;
  if (i >= 40) throw new Error(`la pagina ${target.url} non espone pingLayer: è davvero /display?`);
  await sleep(250);
}
await evaluate(INSTRUMENT);
const renderer = await evaluate('window.__piPerf.renderer');

// ---------- ping verso il server ----------
const dm = io(SERVER, { transports: ['websocket'] });
let locationId = args.location || null;
const firstState = new Promise((r) => dm.once('state:update', r));
await new Promise((r, j) => { dm.once('connect', r); dm.once('connect_error', j); });
if (!locationId) {
  const st = await Promise.race([firstState, sleep(5000).then(() => null)]);
  locationId = st && st.activeLocationId;
  if (!locationId) throw new Error('location attiva non trovata: passa --location=<id>');
}

let pingTimer = null;
function startPings(pattern) {
  let step = 0; let stroke = 0;
  const tag = `pm${Date.now().toString(36)}`;
  pingTimer = setInterval(() => {
    const phase = step % 40;
    if (phase === 0 && pattern !== 'trail') {
      dm.emit('ping:show', { locationId, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60, strokeId: `${tag}t${stroke++}` });
    } else if (phase >= 8 && phase < 33 && pattern !== 'tap') {
      const a = ((phase - 8) / 25) * Math.PI * 2;
      dm.emit('ping:show', { locationId, x: 50 + 25 * Math.cos(a), y: 50 + 25 * Math.sin(a), strokeId: `${tag}s${stroke}` });
      if (phase === 32) stroke++;
    }
    step++;
  }, 33);
}
function stopPings() { clearInterval(pingTimer); pingTimer = null; }

function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

const LABEL = { noping: 'nessun ping', tap: 'solo tap', trail: 'solo scia', mix: 'misto' };
const rows = [];
for (const test of TESTS) {
  await evaluate(`(() => { const P = __piPerf; P.deltas = []; P.r = { ping: [], shader: [], aoe: [] }; P.px = 0; P.presented = 0; P.canvasPx = 0; P.dirty.clear(); P.last = 0; P.rec = true; })()`);
  if (test !== 'noping') startPings(test);
  await sleep(SECS * 1000);
  const snap = await evaluate(SNAPSHOT); // ping ancora vivi
  stopPings();
  const raw = await evaluate(`(() => { const P = __piPerf; P.rec = false; return { deltas: P.deltas, r: P.r, px: P.px, presented: P.presented, canvasPx: P.canvasPx }; })()`);
  const d = stats(raw.deltas);
  const total = raw.deltas.reduce((a, b) => a + b, 0) / 1000 || SECS;
  const frames = Math.max(1, d.n);
  rows.push({
    prova: LABEL[test] || test,
    video: snap.video, 'aoe lanciate': snap.castAoes,
    fps: +(d.n / total).toFixed(1),
    'p50 ms': +d.p50.toFixed(0), 'p95 ms': +d.p95.toFixed(0), 'max ms': +d.max.toFixed(0),
    'ping cpu ms': +stats(raw.r.ping).mean.toFixed(2), 'aoe cpu ms': +stats(raw.r.aoe).mean.toFixed(2),
    'shade Mpx/fr': +(raw.px / 1e6 / frames).toFixed(3),
    'canv/fr': +(raw.presented / frames).toFixed(2),
    'canv Mpx/fr': +(raw.canvasPx / 1e6 / frames).toFixed(3),
    'canv vis': snap.visCanvas, 'canv vis Mpx': +snap.visMpx.toFixed(2)
  });
  console.error(JSON.stringify(rows[rows.length - 1]));
  await sleep(PAUSE * 1000); // i ping sfumano, pausa tra le prove
}

const screen = (await evaluate(SNAPSHOT)).screen;
console.log(`\nrenderer: ${renderer}  schermo: ${screen}  location: ${locationId}  ${SECS} s per prova`);
console.table(rows);
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ args, renderer, screen, locationId, rows }, null, 2));
console.log('Strumentazione ancora attiva nella pagina: ricarica /display per toglierla.');
dm.close();
ws.close();
process.exit(0);
