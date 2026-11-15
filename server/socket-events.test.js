// Test di caratterizzazione degli eventi socket di server/index.js (fase 2,
// docs/superpowers/plans/2026-11-15-test-socket.md). Parlano al server vero,
// avviato come processo figlio su dati temporanei: fissano il comportamento di
// OGGI, compresi i difetti (commenti `BUG noto:`), per avere una rete sotto le
// fasi 3 e 4. Ogni evento ha almeno due test: lo controlla l'ultimo test del file.
const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  startServer, connect, waitFor, waitState, barrier, emitAndWait,
  expectUnchanged, expectNoEvent, persisted, loc
} = require('./test-support/socket-harness');

// --- registro della copertura ------------------------------------------------

const coverage = new Map();
// Test legato a un evento socket: il nome comincia con l'evento e il test conta
// per la copertura.
function ev(event, title, fn) {
  coverage.set(event, (coverage.get(event) || 0) + 1);
  test(`${event} | ${title}`, fn);
}

// --- stato di prova ------------------------------------------------------------

function makeLocation(id, name, { map = {}, ...rest } = {}) {
  return {
    id,
    name,
    map: {
      file: null,
      type: 'image',
      scale: 1,
      flip180: false,
      rotate90: false,
      liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      grid: { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
      compass: { visible: false, x: 88, y: 85, rotation: 0 },
      audio: { background: [], oneshot: [] },
      polygons: [],
      aoes: [],
      shaders: [],
      ...map
    },
    images: [],
    archived: false,
    isDefault: false,
    ...rest
  };
}

const poly = (id, revealed = false) => ({ id, name: `Area ${id}`, points: [[0, 0], [10, 0], [10, 10]], revealed });
const image = (id, file) => ({ id, name: `Media ${id}`, file, caption: '', telegramDestination: null });
const aoe = (id, shape, extra = {}) => ({
  id, shape, sizeM: 6, widthM: shape === 'line' ? 1.5 : null, x: 10, y: 10, rotation: 0,
  color: 'red', shapeVisible: true, shaderOverride: null, cast: false, ...extra
});
const deco = (id, shaderId = 'portal') => ({ id, shaderId, x: 5, y: 5, widthM: 2, heightM: 2 });
const lib = { au1: 'au1.mp3', au2: 'au2.mp3', au3: 'au3.mp3', audel: 'audel.mp3' };
const bg = (id, audioId, extra = {}) => ({ id, audioId, name: '', file: lib[audioId], icon: 'music', volume: 0.5, handout: false, restartOnStop: false, on: false, ...extra });
const os = (id, audioId) => ({ id, audioId, name: '', file: lib[audioId], icon: 'zap', volume: 0.5, handout: false });

function fixtureState() {
  return {
    campaign: { name: 'Prova' },
    gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
    activeLocationId: 'loc-a',
    activeImageId: null,
    audioOneshots: {},
    audioOneshotSeq: 0,
    handout: { defaultId: null },
    handoutLibrary: [
      { id: 'h1', name: 'Uno', file: 'h1.png' },
      { id: 'h2', name: 'Due', file: 'h2.png' },
      { id: 'hdel', name: 'Da eliminare', file: 'hdel.png' }
    ],
    audioLibrary: [
      { id: 'au1', name: 'Pioggia', icon: 'music', file: 'au1.mp3' },
      { id: 'au2', name: 'Tuono', icon: 'zap', file: 'au2.mp3' },
      { id: 'au3', name: 'Vento', icon: 'wind', file: 'au3.mp3' },
      { id: 'audel', name: 'Da eliminare', icon: 'music', file: 'audel.mp3' }
    ],
    locations: [
      makeLocation('loc-a', 'Alfa', { isDefault: true }),
      makeLocation('loc-b', 'Beta', { images: [image('b-img', 'b-img.png')] }),
      makeLocation('loc-c', 'Gamma'),
      makeLocation('loc-arch-me', 'Da archiviare'),
      makeLocation('loc-arch-active', 'Da archiviare attiva'),
      makeLocation('loc-arch-res', 'Da ripristinare', { archived: true }),
      makeLocation('loc-arch-del', 'Da eliminare', { archived: true }),
      makeLocation('loc-fog', 'Fog', { map: { polygons: [poly('p1'), poly('p2'), poly('p3', true)] } }),
      makeLocation('loc-img', 'Media', {
        images: [
          image('img1', 'img1.png'), image('img2', 'img2.png'), image('img3', 'img3.png'),
          image('imgdel', 'imgdel.png'), image('imgsd', 'imgsd.png'),
          { id: 'web1', name: 'Sito', file: null, url: 'https://example.com/', proxy: true, caption: '', telegramDestination: null }
        ]
      }),
      makeLocation('loc-ho', 'Handout 1'),
      makeLocation('loc-ho2', 'Handout 2'),
      makeLocation('loc-view', 'Vista'),
      makeLocation('loc-view-bug', 'Vista difetti'),
      makeLocation('loc-poly', 'Poligoni', { map: { polygons: [poly('q1'), poly('q2'), poly('q3'), poly('qdel'), poly('qres')] } }),
      makeLocation('loc-poly-bug', 'Poligoni difetti', { map: { polygons: [poly('qb')] } }),
      makeLocation('loc-map', 'Mappa'),
      makeLocation('loc-map2', 'Mappa 2'),
      makeLocation('loc-map-bug', 'Mappa difetti'),
      makeLocation('loc-aoe', 'AoE', {
        map: {
          aoes: [aoe('aoe-cone', 'cone'), aoe('aoe-cube', 'cube'), aoe('aoe-line', 'line'), aoe('aoe-del', 'sphere')]
        }
      }),
      makeLocation('loc-shader', 'Shader', { map: { shaders: [deco('s1'), deco('s2', 'green_fire'), deco('sdel')] } }),
      makeLocation('loc-audio', 'Audio', {
        map: { audio: { background: [bg('bg1', 'au1'), bg('bgx', 'au3')], oneshot: [os('os1', 'au2')] } }
      }),
      makeLocation('loc-audio2', 'Audio 2', {
        map: { audio: { background: [bg('bg2', 'au1')], oneshot: [os('os2', 'au3')] } }
      }),
      makeLocation('loc-audio3', 'Audio 3'),
      makeLocation('loc-audio4', 'Audio 4'),
      makeLocation('loc-audio-del', 'Audio elimina', { map: { audio: { background: [bg('bgdel', 'audel')], oneshot: [] } } })
    ]
  };
}

const fixtureFiles = {
  'images/b-img.png': 'b', 'images/img1.png': '1', 'images/img2.png': '2', 'images/img3.png': '3',
  'images/imgdel.png': 'd', 'images/imgsd.png': 's',
  'handout/h1.png': 'h1', 'handout/h2.png': 'h2', 'handout/hdel.png': 'hd',
  'audio/au1.mp3': 'a1', 'audio/au2.mp3': 'a2', 'audio/au3.mp3': 'a3', 'audio/audel.mp3': 'ad'
};

// --- server condiviso ------------------------------------------------------------

let server;
let observer; // client sempre connesso: vede i broadcast senza emettere nulla
let clients = [];

async function open() {
  const c = await connect(server);
  clients.push(c);
  return c;
}

async function openDisplay() {
  const c = await open();
  c.isDisplay = true;
  const ready = waitFor(c, 'display:status', (s) => s.connected);
  c.emit('hello', { role: 'display' });
  await ready;
  return c;
}

// Ogni disconnessione trasmette un control:status e un display:status: si
// aspetta di vederli tutti sull'osservatore, così il test dopo parte pulito
// (nessun display "fantasma", nessuno status in ritardo).
async function closeClients(list) {
  const live = list.filter((c) => c.connected);
  if (live.length === 0) return;
  // Prima smaltisce gli status già in viaggio verso l'osservatore.
  await barrier(observer);
  let seen = 0;
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('disconnessioni non viste')), 2000);
    const onStatus = () => {
      seen += 1;
      if (seen === live.length) {
        clearTimeout(timer);
        observer.off('display:status', onStatus);
        resolve();
      }
    };
    observer.on('display:status', onStatus);
  });
  live.forEach((c) => c.disconnect());
  await done;
}

describe('eventi socket (server condiviso)', () => {
  before(async () => {
    server = await startServer({ state: fixtureState(), files: fixtureFiles });
    observer = await connect(server);
  });

  after(async () => {
    if (observer) observer.disconnect();
    if (server) await server.stop();
  });

  afterEach(async () => {
    const list = clients;
    clients = [];
    await closeClients(list);
  });

  // --- connessione e display ------------------------------------------------------

  ev('hello', 'role control: control:status connected a tutti', async () => {
    const c = await open();
    const seen = waitFor(observer, 'control:status', (s) => s.connected === true);
    c.emit('hello', { role: 'control' });
    assert.deepStrictEqual(await seen, { connected: true });
  });

  ev('hello', 'role sconosciuto: nessuno status, stato invariato', async () => {
    const c = await open();
    await expectNoEvent(c, 'control:status', async () => {
      await expectNoEvent(c, 'display:status', () => expectUnchanged(c, 'hello', { role: 'party' }));
    });
  });

  ev('hello', 'role display: display:status connected a tutti', async () => {
    const c = await open();
    c.isDisplay = true;
    const seen = waitFor(observer, 'display:status', (s) => s.connected === true);
    c.emit('hello', { role: 'display' });
    assert.deepStrictEqual(await seen, { connected: true });
  });

  ev('display:viewport', 'valido: finisce in displayViewport', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'display:viewport', { width: 1920, height: 1080 }, (st) => st.displayViewport && st.displayViewport.width === 1920);
    assert.deepStrictEqual(s.displayViewport, { width: 1920, height: 1080 });
    // Mai su disco.
    const onDisk = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'state.json'), 'utf-8'));
    assert.equal(onDisk.displayViewport, undefined);
  });

  ev('display:viewport', 'nessuna validazione: valori non numerici passano', async () => {
    const c = await open();
    // BUG noto: display:viewport non controlla i valori; /control e /party li usano per i conti.
    const s = await emitAndWait(c, 'display:viewport', { width: 'abc', height: null }, (st) => st.displayViewport && st.displayViewport.width === 'abc');
    assert.deepStrictEqual(s.displayViewport, { width: 'abc', height: null });
  });

  ev('audio:status', 'dal display, payload valido: finisce in displayAudio', async () => {
    const d = await openDisplay();
    const status = { blocked: true, errors: ['x'], playing: ['bg1'] };
    const s = await emitAndWait(d, 'audio:status', status, (st) => st.displayAudio && st.displayAudio.blocked === true);
    assert.deepStrictEqual(s.displayAudio, status);
  });

  ev('audio:status', 'da un client che non è display: ignorato', async () => {
    const c = await open();
    const before = await barrier(c);
    c.emit('audio:status', { blocked: true, errors: [], playing: [] });
    const after = await barrier(c);
    assert.equal(before.displayAudio, null);
    assert.equal(after.displayAudio, null);
  });

  ev('audio:status', 'dal display, payload non valido: ignorato', async () => {
    const d = await openDisplay();
    const before = await barrier(d);
    d.emit('audio:status', { blocked: 'sì', errors: [], playing: [] });
    d.emit('audio:status', { blocked: false, errors: [1], playing: [] });
    const after = await barrier(d);
    assert.deepStrictEqual(after.displayAudio, before.displayAudio);
  });

  ev('audio:status', 'dal display, payload uguale al precedente: nessun broadcast', async () => {
    const d = await openDisplay();
    const status = { blocked: false, errors: [], playing: ['os1'] };
    await emitAndWait(d, 'audio:status', status, (st) => st.displayAudio && st.displayAudio.playing[0] === 'os1');
    await barrier(d);
    const start = d.received.length;
    d.emit('audio:status', status);
    await barrier(d);
    const updates = d.received.slice(start).filter((r) => r.event === 'state:update');
    assert.equal(updates.length, 1, 'solo lo state:update della barriera');
  });

  ev('disconnect', 'control che esce: control:status disconnected', async () => {
    const c = await open();
    const on = waitFor(observer, 'control:status', (s) => s.connected === true);
    c.emit('hello', { role: 'control' });
    await on;
    const off = waitFor(observer, 'control:status', (s) => s.connected === false);
    c.disconnect();
    assert.deepStrictEqual(await off, { connected: false });
  });

  ev('disconnect', 'ultimo display che esce: one-shot e displayAudio azzerati', async () => {
    const c = await open();
    const d = await openDisplay();
    await emitAndWait(c, 'location:set', { locationId: 'loc-audio' }, (s) => s.activeLocationId === 'loc-audio');
    await emitAndWait(d, 'audio:status', { blocked: false, errors: [], playing: [] }, (s) => s.displayAudio !== null);
    await emitAndWait(c, 'audio:toggle', { trackId: 'os1' }, (s) => 'os1' in s.audioOneshots);
    const statusOff = waitFor(observer, 'display:status', (s) => s.connected === false);
    const cleared = waitState(observer, (s) => s.displayAudio === null && Object.keys(s.audioOneshots).length === 0);
    d.disconnect();
    await statusOff;
    await cleared;
  });

  ev('disconnect', 'display che esce non per ultimo: one-shot restano', async () => {
    const c = await open();
    const d1 = await openDisplay();
    await openDisplay();
    await emitAndWait(c, 'location:set', { locationId: 'loc-audio' }, (s) => s.activeLocationId === 'loc-audio');
    await emitAndWait(c, 'audio:toggle', { trackId: 'os1' }, (s) => 'os1' in s.audioOneshots);
    const status = waitFor(observer, 'display:status');
    d1.disconnect();
    assert.deepStrictEqual(await status, { connected: true });
    const s = await barrier(c);
    assert.ok('os1' in s.audioOneshots);
  });

  // GRUPPI SUCCESSIVI
});
