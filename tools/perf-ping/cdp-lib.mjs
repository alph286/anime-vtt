// Pezzi comuni degli strumenti CDP verso il kiosk del Pi (pi-probe.mjs,
// pi-trace.mjs): connessione alla pagina /display e al target browser,
// evaluate, client socket per i ping, statistiche.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

export function loadIo() {
  const bases = [repo, path.join(repo, 'editor-app')];
  for (const b of bases) {
    try { return createRequire(path.join(b, 'x.js'))('socket.io-client').io; } catch { /* prossimo */ }
  }
  throw new Error('socket.io-client non trovato: npm install in editor-app/');
}

export function parseArgs(argv) {
  return Object.fromEntries(argv.map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connectWs(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  return { ws, send, on, close: () => ws.close() };
}

export async function connectDisplay(cdpBase) {
  const targets = await (await fetch(`${cdpBase}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page' && /\/display\/?(\?|#|$)/.test(t.url));
  if (!target) throw new Error(`nessuna pagina /display tra i target di ${cdpBase}`);
  const page = await connectWs(target.webSocketDebuggerUrl);
  const evaluate = async (expr) => {
    const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const version = await (await fetch(`${cdpBase}/json/version`)).json();
  const browser = await connectWs(version.webSocketDebuggerUrl);
  return { target, page, browser, evaluate };
}

export async function waitForDisplay(evaluate) {
  for (let i = 0; ; i++) {
    try {
      if (await evaluate(`typeof pingLayer !== 'undefined' && typeof aoeShaderLayer !== 'undefined' && !!lastState`)) return;
    } catch { /* pagina in caricamento */ }
    if (i >= 80) throw new Error('la pagina non espone pingLayer');
    await sleep(250);
  }
}

// Ping come pi-measure.mjs: `trail` = 25 punti in cerchio (raggio `radius`%
// dello schermo, ~30 punti/s), `tap` = un tap ogni 1,3 s, `mix` = entrambi.
export function makePinger(io, server, locationId) {
  const dm = io(server, { transports: ['websocket'] });
  let timer = null;
  return {
    ready: new Promise((r, j) => { dm.once('connect', r); dm.once('connect_error', j); }),
    start(pattern, radius = 25) {
      let step = 0; let stroke = 0;
      const tag = `pp${Date.now().toString(36)}`;
      timer = setInterval(() => {
        const phase = step % 40;
        if (phase === 0 && pattern !== 'trail') {
          dm.emit('ping:show', { locationId, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60, strokeId: `${tag}t${stroke++}` });
        } else if (phase >= 8 && phase < 33 && pattern !== 'tap') {
          const a = ((phase - 8) / 25) * Math.PI * 2;
          dm.emit('ping:show', { locationId, x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a), strokeId: `${tag}s${stroke}` });
          if (phase === 32) stroke++;
        }
        step++;
      }, 33);
    },
    stop() { clearInterval(timer); timer = null; },
    close() { dm.close(); }
  };
}

export function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
