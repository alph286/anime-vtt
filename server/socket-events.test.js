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

  // --- location ----------------------------------------------------------------------

  ev('location:set', 'valido: cambia la location attiva e toglie il media mostrato', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    await emitAndWait(c, 'image:show', { imageId: 'img1' }, (s) => s.activeImageId === 'img1');
    const s = await emitAndWait(c, 'location:set', { locationId: 'loc-b' }, (st) => st.activeLocationId === 'loc-b');
    assert.equal(s.activeImageId, null);
    const onDisk = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'state.json'), 'utf-8'));
    assert.equal(onDisk.activeLocationId, 'loc-b');
  });

  ev('location:set', 'id sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:set', { locationId: 'nessuna' });
  });

  ev('location:create', 'valido: nuova location vuota, diventa attiva', async () => {
    const c = await open();
    const before = await barrier(c);
    const s = await emitAndWait(c, 'location:create', undefined, (st) => st.locations.length === before.locations.length + 1);
    const created = s.locations[s.locations.length - 1];
    assert.equal(s.activeLocationId, created.id);
    assert.equal(s.activeImageId, null);
    assert.equal(typeof created.id, 'string');
    assert.deepStrictEqual({ ...created, id: 'X' }, {
      id: 'X',
      name: 'Nuova location',
      map: {
        file: null, type: 'image', scale: 1, flip180: false, rotate90: false,
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
        compass: { visible: false, x: 88, y: 85, rotation: 0 },
        audio: { background: [], oneshot: [] },
        polygons: [],
        aoes: []
      },
      images: [],
      archived: false,
      isDefault: false
    });
    // Nota: a differenza delle location migrate, una location creata qui non ha
    // map.shaders né handoutDefaultId finché il server non riparte.
  });

  ev('location:create', 'il payload è ignorato; due create danno due location distinte', async () => {
    const c = await open();
    const before = await barrier(c);
    c.emit('location:create', { name: 'Ignorato' });
    c.emit('location:create');
    const s = await waitState(c, (st) => st.locations.length === before.locations.length + 2);
    const [a, b] = s.locations.slice(-2);
    assert.notEqual(a.id, b.id);
    assert.equal(a.name, 'Nuova location');
    assert.equal(s.activeLocationId, b.id);
  });

  ev('location:rename', 'valido: nome nuovo, tagliato a 120 caratteri', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'location:rename', { locationId: 'loc-c', name: 'x'.repeat(200) }, (st) => loc(st, 'loc-c').name.length === 120);
    assert.equal(loc(s, 'loc-c').name, 'x'.repeat(120));
    const s2 = await emitAndWait(c, 'location:rename', { locationId: 'loc-c', name: undefined }, (st) => loc(st, 'loc-c').name === '');
    assert.equal(loc(s2, 'loc-c').name, '');
  });

  ev('location:rename', 'id sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:rename', { locationId: 'nessuna', name: 'X' });
  });

  ev('location:archive', 'valido: archiviata, la location attiva non cambia', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-a' }, (s) => s.activeLocationId === 'loc-a');
    const s = await emitAndWait(c, 'location:archive', { locationId: 'loc-arch-me' }, (st) => loc(st, 'loc-arch-me').archived);
    assert.equal(s.activeLocationId, 'loc-a');
  });

  ev('location:archive', 'archiviare la location attiva la toglie (activeLocationId null)', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-arch-active' }, (s) => s.activeLocationId === 'loc-arch-active');
    const s = await emitAndWait(c, 'location:archive', { locationId: 'loc-arch-active' }, (st) => loc(st, 'loc-arch-active').archived);
    assert.equal(s.activeLocationId, null);
  });

  ev('location:archive', 'id sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:archive', { locationId: 'nessuna' });
  });

  ev('location:restore', 'valido: non più archiviata', async () => {
    const c = await open();
    const before = await barrier(c);
    assert.equal(loc(before, 'loc-arch-res').archived, true);
    const s = await emitAndWait(c, 'location:restore', { locationId: 'loc-arch-res' }, (st) => !loc(st, 'loc-arch-res').archived);
    assert.equal(loc(s, 'loc-arch-res').archived, false);
  });

  ev('location:restore', 'id sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:restore', { locationId: 'nessuna' });
  });

  ev('location:delete', 'valido: una location archiviata viene tolta', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'location:delete', { locationId: 'loc-arch-del' }, (st) => !loc(st, 'loc-arch-del'));
    assert.equal(loc(s, 'loc-arch-del'), undefined);
  });

  ev('location:delete', 'location non archiviata: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:delete', { locationId: 'loc-b' });
    await expectUnchanged(c, 'location:delete', { locationId: 'nessuna' });
  });

  ev('location:setDefault', 'valido: solo quella è predefinita', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'location:setDefault', { locationId: 'loc-b' }, (st) => loc(st, 'loc-b').isDefault);
    assert.deepStrictEqual(s.locations.filter((l) => l.isDefault).map((l) => l.id), ['loc-b']);
    // Rimette la predefinita del fixture.
    await emitAndWait(c, 'location:setDefault', { locationId: 'loc-a' }, (st) => loc(st, 'loc-a').isDefault);
  });

  ev('location:setDefault', 'id sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'location:setDefault', { locationId: 'nessuna' });
  });

  ev('location:reorder', 'valido: nuovo ordine delle non archiviate, archiviate in coda', async () => {
    const c = await open();
    await emitAndWait(c, 'location:archive', { locationId: 'loc-arch-me' }, (s) => loc(s, 'loc-arch-me').archived);
    const before = await barrier(c);
    const active = before.locations.filter((l) => !l.archived).map((l) => l.id);
    const archived = before.locations.filter((l) => l.archived).map((l) => l.id);
    const reversed = [...active].reverse();
    const s = await emitAndWait(c, 'location:reorder', { orderedIds: reversed }, (st) => st.locations[0].id === reversed[0]);
    assert.deepStrictEqual(s.locations.map((l) => l.id), [...reversed, ...archived]);
    // Rimette l'ordine di prima per i test che seguono.
    await emitAndWait(c, 'location:reorder', { orderedIds: active }, (st) => st.locations[0].id === active[0]);
  });

  ev('location:reorder', 'non permutazione o non array: invariato, state:update solo al mittente', async () => {
    const c = await open();
    const before = await barrier(c);
    const active = before.locations.filter((l) => !l.archived).map((l) => l.id);
    for (const orderedIds of [active.slice(1), [...active.slice(0, -1), 'nessuna'], [...active.slice(0, -1), active[0]], null]) {
      const b1 = await barrier(c);
      c.emit('location:reorder', { orderedIds });
      const b2 = await barrier(c);
      assert.deepStrictEqual(persisted(b2), persisted(b1));
      await barrier(observer);
      // Gli state:update che portano ancora il segno della prima barriera: la
      // barriera stessa più, solo per il mittente, la risposta al reorder.
      const mark = b1.displayViewport.width;
      const count = (cl) => cl.received.filter((r) => r.event === 'state:update' && r.payload.displayViewport?.width === mark).length;
      assert.equal(count(c), 2);
      assert.equal(count(observer), 1);
    }
  });

  ev('location:reorder', 'id doppi o in più (sconosciuti, archiviati) vengono scartati: ordine accettato', async () => {
    const c = await open();
    const before = await barrier(c);
    const active = before.locations.filter((l) => !l.archived).map((l) => l.id);
    const archived = before.locations.filter((l) => l.archived).map((l) => l.id);
    const order = [active[1], active[0], ...active.slice(2)];
    const s = await emitAndWait(c, 'location:reorder', { orderedIds: [...order, order[0], 'nessuna', ...archived] }, (st) => st.locations[0].id === order[0]);
    assert.deepStrictEqual(s.locations.map((l) => l.id), [...order, ...archived]);
    await emitAndWait(c, 'location:reorder', { orderedIds: active }, (st) => st.locations[0].id === active[0]);
  });

  // GRUPPI SUCCESSIVI
});
