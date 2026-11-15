// Supporto per i test che parlano al server vero (server/socket-events.test.js).
// Avvia `node server/index.js` come processo figlio su una porta libera, con
// DATA_DIR e STORAGE_DIR temporanei, DM_PIN vuoto e cwd temporanea (così dotenv
// non legge il .env del repo). Mai i dati veri, mai la porta 3000.
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');

const SERVER_ENTRY = path.join(__dirname, '..', 'index.js');
const DEFAULT_TIMEOUT_MS = 2000;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// `files`: { 'images/a.png': 'contenuto', ... } relativi a STORAGE_DIR.
async function startServer({ state, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-socket-test-'));
  const dataDir = path.join(root, 'data');
  const storageDir = path.join(root, 'storage');
  const cwd = path.join(root, 'cwd');
  for (const dir of [dataDir, storageDir, cwd]) fs.mkdirSync(dir, { recursive: true });
  if (state) fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(storageDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  const port = await freePort();
  assert.notEqual(port, 3000);
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STORAGE_DIR: storageDir, DM_PIN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  proc.stdout.on('data', (d) => { output += d; });
  proc.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => proc.on('exit', (code, signal) => resolve({ code, signal })));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server non partito in 10 s:\n${output}`)), 10000);
    const onData = () => {
      if (output.includes('in ascolto')) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    exited.then(({ code }) => {
      clearTimeout(timer);
      reject(new Error(`server uscito (code ${code}) prima di partire:\n${output}`));
    });
  });

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    dataDir,
    storageDir,
    proc,
    exited,
    output: () => output,
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGTERM');
        await exited;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

// Client socket.io con un registro degli eventi ricevuti e l'ultimo stato.
function connect(server) {
  const client = io(server.url, { transports: ['websocket'], forceNew: true, reconnection: false });
  client.state = null;
  client.received = [];
  client.waiters = [];
  client.onAny((event, payload) => {
    if (event === 'state:update') client.state = payload;
    client.received.push({ event, payload });
    client.waiters = client.waiters.filter((w) => {
      if (w.event !== event || !w.predicate(payload)) return true;
      clearTimeout(w.timer);
      w.resolve(payload);
      return false;
    });
  });
  return new Promise((resolve, reject) => {
    // Alla connessione il server manda state:update, control:status e per
    // ultimo display:status: si aspetta quest'ultimo, così nessuno di quei tre
    // arriva dopo e sporca i controlli del test.
    const timer = setTimeout(() => reject(new Error('stato iniziale non ricevuto')), DEFAULT_TIMEOUT_MS);
    client.once('display:status', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Prossimo `event` (da ora in poi) che soddisfa il predicato.
function waitFor(client, event, predicate = () => true, ms = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const waiter = { event, predicate, resolve };
    waiter.timer = setTimeout(() => {
      client.waiters = client.waiters.filter((w) => w !== waiter);
      reject(new Error(`timeout in attesa di ${event}`));
    }, ms);
    client.waiters.push(waiter);
  });
}

function waitState(client, predicate, ms) {
  return waitFor(client, 'state:update', predicate, ms);
}

let barrierSeq = 0;
// `display:viewport` passa dallo stesso socket dopo l'evento in prova e gli
// handler sono sincroni: lo state:update con questo width riflette di sicuro
// tutto ciò che è stato emesso prima.
async function barrier(client) {
  barrierSeq += 1;
  const mark = `barrier-${barrierSeq}`;
  const wait = waitState(client, (s) => s.displayViewport && s.displayViewport.width === mark);
  client.emit('display:viewport', { width: mark, height: 0 });
  return wait;
}

async function emitAndWait(client, event, payload, predicate) {
  const wait = waitState(client, predicate);
  client.emit(event, payload);
  return wait;
}

function persisted(state) {
  const { displayViewport, displayAudio, ...rest } = state;
  return rest;
}

// L'evento non deve cambiare nulla dello stato (esclusi i campi solo in memoria
// riportati dal display). Ritorna lo stato dopo l'evento.
async function expectUnchanged(client, event, payload) {
  const before = await barrier(client);
  if (payload === undefined) client.emit(event);
  else client.emit(event, payload);
  const after = await barrier(client);
  assert.deepStrictEqual(persisted(after), persisted(before));
  return after;
}

// Esegue `fn` e controlla che `event` non arrivi prima della barriera successiva.
async function expectNoEvent(client, event, fn) {
  const start = client.received.length;
  await fn();
  await barrier(client);
  const got = client.received.slice(start).filter((r) => r.event === event);
  assert.deepStrictEqual(got, [], `${event} non atteso`);
}

function loc(state, id) {
  return state.locations.find((l) => l.id === id);
}

module.exports = {
  startServer, connect, waitFor, waitState, barrier, emitAndWait,
  expectUnchanged, expectNoEvent, persisted, loc
};
