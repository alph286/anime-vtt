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

  // --- fog of war ----------------------------------------------------------------------

  ev('fow:toggle', 'valido: inverte revealed della zona', async () => {
    const c = await open();
    const before = await barrier(c);
    const was = loc(before, 'loc-fog').map.polygons.find((p) => p.id === 'p1').revealed;
    const s = await emitAndWait(c, 'fow:toggle', { locationId: 'loc-fog', polygonId: 'p1' }, (st) => loc(st, 'loc-fog').map.polygons.find((p) => p.id === 'p1').revealed !== was);
    assert.equal(loc(s, 'loc-fog').map.polygons.find((p) => p.id === 'p1').revealed, !was);
  });

  ev('fow:toggle', 'zona o location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'fow:toggle', { locationId: 'loc-fog', polygonId: 'nessuna' });
    await expectUnchanged(c, 'fow:toggle', { locationId: 'nessuna', polygonId: 'p1' });
  });

  ev('fow:setAll', 'valido: tutte le zone prendono il valore (convertito a booleano)', async () => {
    const c = await open();
    let s = await emitAndWait(c, 'fow:setAll', { locationId: 'loc-fog', revealed: 1 }, (st) => loc(st, 'loc-fog').map.polygons.every((p) => p.revealed === true));
    assert.deepStrictEqual(loc(s, 'loc-fog').map.polygons.map((p) => p.revealed), [true, true, true]);
    s = await emitAndWait(c, 'fow:setAll', { locationId: 'loc-fog', revealed: undefined }, (st) => loc(st, 'loc-fog').map.polygons.every((p) => p.revealed === false));
    assert.deepStrictEqual(loc(s, 'loc-fog').map.polygons.map((p) => p.revealed), [false, false, false]);
  });

  ev('fow:setAll', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'fow:setAll', { locationId: 'nessuna', revealed: true });
  });

  // --- media (immagini, video, pagine web) ----------------------------------------------

  ev('image:show', 'valido: activeImageId, non scritto su disco', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    const s = await emitAndWait(c, 'image:show', { imageId: 'img2' }, (st) => st.activeImageId === 'img2');
    assert.equal(s.activeImageId, 'img2');
    const onDisk = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'state.json'), 'utf-8'));
    assert.equal(onDisk.activeImageId, null);
  });

  ev('image:show', 'media di un\'altra location o sconosciuto: stato invariato', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    await expectUnchanged(c, 'image:show', { imageId: 'b-img' });
    await expectUnchanged(c, 'image:show', { imageId: 'nessuna' });
  });

  ev('image:hide', 'valido: toglie il media mostrato', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    await emitAndWait(c, 'image:show', { imageId: 'img1' }, (s) => s.activeImageId === 'img1');
    const s = await emitAndWait(c, 'image:hide', undefined, (st) => st.activeImageId === null);
    assert.equal(s.activeImageId, null);
  });

  ev('image:hide', 'senza media mostrato: resta null e trasmette comunque', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    const before = await barrier(c);
    assert.equal(before.activeImageId, null);
    const start = observer.received.length;
    const s = await emitAndWait(c, 'image:hide', undefined, () => true);
    assert.deepStrictEqual(persisted(s), persisted(before));
    await barrier(observer);
    assert.ok(observer.received.slice(start).some((r) => r.event === 'state:update' && r.payload.displayViewport.width === before.displayViewport.width));
  });

  ev('image:rename', 'valido: nome nuovo, tagliato a 120', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'image:rename', { locationId: 'loc-img', imageId: 'img3', name: 'n'.repeat(130) }, (st) => loc(st, 'loc-img').images.find((i) => i.id === 'img3').name.length === 120);
    assert.equal(loc(s, 'loc-img').images.find((i) => i.id === 'img3').name, 'n'.repeat(120));
  });

  ev('image:rename', 'media o location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'image:rename', { locationId: 'loc-img', imageId: 'nessuna', name: 'X' });
    await expectUnchanged(c, 'image:rename', { locationId: 'loc-b', imageId: 'img1', name: 'X' });
  });

  ev('image:delete', 'valido: media tolto e file cancellato', async () => {
    const c = await open();
    const file = path.join(server.storageDir, 'images', 'imgdel.png');
    assert.ok(fs.existsSync(file));
    const s = await emitAndWait(c, 'image:delete', { locationId: 'loc-img', imageId: 'imgdel' }, (st) => !loc(st, 'loc-img').images.some((i) => i.id === 'imgdel'));
    assert.ok(!loc(s, 'loc-img').images.some((i) => i.id === 'imgdel'));
    assert.ok(!fs.existsSync(file));
  });

  ev('image:delete', 'eliminare il media mostrato azzera activeImageId', async () => {
    const c = await open();
    await emitAndWait(c, 'location:set', { locationId: 'loc-img' }, (s) => s.activeLocationId === 'loc-img');
    await emitAndWait(c, 'image:show', { imageId: 'imgsd' }, (s) => s.activeImageId === 'imgsd');
    const s = await emitAndWait(c, 'image:delete', { locationId: 'loc-img', imageId: 'imgsd' }, (st) => !loc(st, 'loc-img').images.some((i) => i.id === 'imgsd'));
    assert.equal(s.activeImageId, null);
  });

  ev('image:delete', 'media sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'image:delete', { locationId: 'loc-img', imageId: 'nessuna' });
    await expectUnchanged(c, 'image:delete', { locationId: 'nessuna', imageId: 'img1' });
  });

  ev('image:reorder', 'valido: permutazione esatta', async () => {
    const c = await open();
    const before = await barrier(c);
    const ids = loc(before, 'loc-img').images.map((i) => i.id);
    const reversed = [...ids].reverse();
    const s = await emitAndWait(c, 'image:reorder', { locationId: 'loc-img', orderedIds: reversed }, (st) => loc(st, 'loc-img').images[0].id === reversed[0]);
    assert.deepStrictEqual(loc(s, 'loc-img').images.map((i) => i.id), reversed);
  });

  ev('image:reorder', 'id mancante, doppio o non array: stato invariato', async () => {
    const c = await open();
    const before = await barrier(c);
    const ids = loc(before, 'loc-img').images.map((i) => i.id);
    await expectUnchanged(c, 'image:reorder', { locationId: 'loc-img', orderedIds: ids.slice(1) });
    await expectUnchanged(c, 'image:reorder', { locationId: 'loc-img', orderedIds: [...ids.slice(1), ids[1]] });
    await expectUnchanged(c, 'image:reorder', { locationId: 'loc-img', orderedIds: 'no' });
  });

  ev('image:caption', 'valido: didascalia tagliata a 1024', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'image:caption', { locationId: 'loc-img', imageId: 'img1', caption: 'c'.repeat(1100) }, (st) => loc(st, 'loc-img').images.find((i) => i.id === 'img1').caption.length === 1024);
    assert.equal(loc(s, 'loc-img').images.find((i) => i.id === 'img1').caption, 'c'.repeat(1024));
  });

  ev('image:caption', 'media sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'image:caption', { locationId: 'loc-img', imageId: 'nessuna', caption: 'X' });
  });

  ev('image:destination', 'valido: destinazione per nome; vuota diventa null', async () => {
    const c = await open();
    const find = (st) => loc(st, 'loc-img').images.find((i) => i.id === 'img1');
    let s = await emitAndWait(c, 'image:destination', { locationId: 'loc-img', imageId: 'img1', destination: 'Gruppo' }, (st) => find(st).telegramDestination === 'Gruppo');
    assert.equal(find(s).telegramDestination, 'Gruppo');
    s = await emitAndWait(c, 'image:destination', { locationId: 'loc-img', imageId: 'img1', destination: '' }, (st) => find(st).telegramDestination === null);
    assert.equal(find(s).telegramDestination, null);
  });

  ev('image:destination', 'media sconosciuto: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'image:destination', { locationId: 'loc-img', imageId: 'nessuna', destination: 'Gruppo' });
  });

  ev('image:sendTelegram', 'media vero senza bot configurato: risposta di errore solo al mittente', async () => {
    const c = await open();
    const result = waitFor(c, 'telegram:sendResult', (r) => r.imageId === 'img2');
    const before = await barrier(c);
    const start = observer.received.length;
    c.emit('image:sendTelegram', { locationId: 'loc-img', imageId: 'img2' });
    assert.deepStrictEqual(await result, { imageId: 'img2', ok: false, error: 'Telegram non configurato: imposta il bot in /opzioni' });
    const after = await barrier(c);
    assert.deepStrictEqual(persisted(after), persisted(before));
    await barrier(observer);
    assert.ok(!observer.received.slice(start).some((r) => r.event === 'telegram:sendResult'));
  });

  ev('image:sendTelegram', 'media sconosciuto o pagina web: errore', async () => {
    const c = await open();
    let result = waitFor(c, 'telegram:sendResult', (r) => r.imageId === 'nessuna');
    c.emit('image:sendTelegram', { locationId: 'loc-img', imageId: 'nessuna' });
    assert.deepStrictEqual(await result, { imageId: 'nessuna', ok: false, error: 'Immagine non trovata' });
    result = waitFor(c, 'telegram:sendResult', (r) => r.imageId === 'web1');
    c.emit('image:sendTelegram', { locationId: 'loc-img', imageId: 'web1' });
    assert.deepStrictEqual(await result, { imageId: 'web1', ok: false, error: 'Le pagine web non si inviano su Telegram' });
  });

  // --- handout -----------------------------------------------------------------------------

  ev('handout:setDefault', 'valido: default della location e default globale', async () => {
    const c = await open();
    let s = await emitAndWait(c, 'handout:setDefault', { locationId: 'loc-ho2', id: 'h1' }, (st) => loc(st, 'loc-ho2').handoutDefaultId === 'h1');
    assert.equal(loc(s, 'loc-ho2').handoutDefaultId, 'h1');
    s = await emitAndWait(c, 'handout:setDefault', { id: 'h2' }, (st) => st.handout.defaultId === 'h2');
    assert.deepStrictEqual(s.handout, { defaultId: 'h2' });
    s = await emitAndWait(c, 'handout:setDefault', { locationId: null, id: null }, (st) => st.handout.defaultId === null);
    assert.deepStrictEqual(s.handout, { defaultId: null });
    assert.equal(loc(s, 'loc-ho2').handoutDefaultId, 'h1');
  });

  ev('handout:setDefault', 'voce o location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'handout:setDefault', { locationId: 'loc-ho2', id: 'nessuna' });
    await expectUnchanged(c, 'handout:setDefault', { id: 'nessuna' });
    await expectUnchanged(c, 'handout:setDefault', { locationId: 'nessuna', id: 'h1' });
  });

  ev('handoutLibrary:update', 'valido: rinomina, tagliato a 80', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'handoutLibrary:update', { id: 'h1', name: 'h'.repeat(90) }, (st) => st.handoutLibrary.find((i) => i.id === 'h1').name.length === 80);
    assert.equal(s.handoutLibrary.find((i) => i.id === 'h1').name, 'h'.repeat(80));
  });

  ev('handoutLibrary:update', 'voce sconosciuta o nome non stringa: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'handoutLibrary:update', { id: 'nessuna', name: 'X' });
    await expectUnchanged(c, 'handoutLibrary:update', { id: 'h2', name: 42 });
    await expectUnchanged(c, 'handoutLibrary:update', undefined);
  });

  ev('handoutLibrary:delete', 'valido: voce tolta, default azzerati, file cancellato', async () => {
    const c = await open();
    await emitAndWait(c, 'handout:setDefault', { locationId: 'loc-ho', id: 'hdel' }, (s) => loc(s, 'loc-ho').handoutDefaultId === 'hdel');
    await emitAndWait(c, 'handout:setDefault', { id: 'hdel' }, (s) => s.handout.defaultId === 'hdel');
    const file = path.join(server.storageDir, 'handout', 'hdel.png');
    assert.ok(fs.existsSync(file));
    const s = await emitAndWait(c, 'handoutLibrary:delete', { id: 'hdel' }, (st) => !st.handoutLibrary.some((i) => i.id === 'hdel'));
    assert.equal(loc(s, 'loc-ho').handoutDefaultId, null);
    assert.equal(s.handout.defaultId, null);
    assert.ok(!fs.existsSync(file));
  });

  ev('handoutLibrary:delete', 'voce sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'handoutLibrary:delete', { id: 'nessuna' });
    await expectUnchanged(c, 'handoutLibrary:delete', undefined);
  });

  // --- vista live ----------------------------------------------------------------------------

  const liveView = (s, id = 'loc-view') => loc(s, id).map.liveView;

  ev('view:pan', 'valido: gli spostamenti si sommano all\'offset', async () => {
    const c = await open();
    const before = liveView(await barrier(c));
    const s = await emitAndWait(c, 'view:pan', { locationId: 'loc-view', dx: 10, dy: -5 }, (st) => liveView(st).offsetX === before.offsetX + 10);
    assert.deepStrictEqual(liveView(s), { ...before, offsetX: before.offsetX + 10, offsetY: before.offsetY - 5 });
  });

  ev('view:pan', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'view:pan', { locationId: 'nessuna', dx: 10, dy: 10 });
  });

  ev('view:pan', 'dx non numerico: l\'offset diventa una stringa', async () => {
    const c = await open();
    // BUG noto: view:pan non controlla dx/dy; una stringa viene concatenata e
    // offsetX diventa '05' invece di un numero.
    const s = await emitAndWait(c, 'view:pan', { locationId: 'loc-view-bug', dx: '5', dy: 0 }, (st) => typeof liveView(st, 'loc-view-bug').offsetX === 'string');
    assert.equal(liveView(s, 'loc-view-bug').offsetX, '05');
    await emitAndWait(c, 'view:reset', { locationId: 'loc-view-bug' }, (st) => liveView(st, 'loc-view-bug').offsetX === 0);
  });

  ev('view:zoom', 'valido: scale impostato', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'view:zoom', { locationId: 'loc-view', scale: 2.5 }, (st) => liveView(st).scale === 2.5);
    assert.equal(liveView(s).scale, 2.5);
  });

  ev('view:zoom', 'location sconosciuta: stato invariato; scale non validato', async () => {
    const c = await open();
    await expectUnchanged(c, 'view:zoom', { locationId: 'nessuna', scale: 3 });
    // BUG noto: view:zoom accetta qualunque valore (negativo, stringa).
    const s = await emitAndWait(c, 'view:zoom', { locationId: 'loc-view-bug', scale: -3 }, (st) => liveView(st, 'loc-view-bug').scale === -3);
    assert.equal(liveView(s, 'loc-view-bug').scale, -3);
  });

  ev('view:reset', 'valido: vista di default', async () => {
    const c = await open();
    await emitAndWait(c, 'view:zoom', { locationId: 'loc-view', scale: 4 }, (s) => liveView(s).scale === 4);
    const s = await emitAndWait(c, 'view:reset', { locationId: 'loc-view' }, (st) => liveView(st).scale === 1);
    assert.deepStrictEqual(liveView(s), { scale: 1, offsetX: 0, offsetY: 0 });
  });

  ev('view:reset', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'view:reset', { locationId: 'nessuna' });
  });

  // --- zone del fog (poligoni) ---------------------------------------------------------------

  const polys = (s, id = 'loc-poly') => loc(s, id).map.polygons;

  ev('polygon:create', 'valido: nuova zona non rivelata; nome di default', async () => {
    const c = await open();
    const n = polys(await barrier(c)).length;
    const pts = [[1, 1], [5, 1], [5, 5]];
    let s = await emitAndWait(c, 'polygon:create', { locationId: 'loc-poly', name: 'Cripta', points: pts }, (st) => polys(st).length === n + 1);
    const created = polys(s)[n];
    assert.deepStrictEqual({ ...created, id: 'X' }, { id: 'X', name: 'Cripta', points: pts, revealed: false });
    s = await emitAndWait(c, 'polygon:create', { locationId: 'loc-poly', points: pts }, (st) => polys(st).length === n + 2);
    assert.equal(polys(s)[n + 1].name, 'nuova area');
    // Rimette le zone del fixture.
    c.emit('polygon:delete', { locationId: 'loc-poly', polygonId: polys(s)[n].id });
    await emitAndWait(c, 'polygon:delete', { locationId: 'loc-poly', polygonId: polys(s)[n + 1].id }, (st) => polys(st).length === n);
  });

  ev('polygon:create', 'meno di 3 punti, punti non array o location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'polygon:create', { locationId: 'loc-poly', points: [[0, 0], [1, 1]] });
    await expectUnchanged(c, 'polygon:create', { locationId: 'loc-poly', points: 'abc' });
    await expectUnchanged(c, 'polygon:create', { locationId: 'nessuna', points: [[0, 0], [1, 1], [2, 0]] });
  });

  ev('polygon:update', 'valido: punti e nome', async () => {
    const c = await open();
    const pts = [[2, 2], [8, 2], [8, 8], [2, 8]];
    const s = await emitAndWait(c, 'polygon:update', { locationId: 'loc-poly', polygonId: 'q1', points: pts, name: 'Sala' }, (st) => polys(st).find((p) => p.id === 'q1').name === 'Sala');
    const q1 = polys(s).find((p) => p.id === 'q1');
    assert.deepStrictEqual(q1.points, pts);
    assert.equal(q1.name, 'Sala');
  });

  ev('polygon:update', 'zona sconosciuta: stato invariato; punti non validati', async () => {
    const c = await open();
    await expectUnchanged(c, 'polygon:update', { locationId: 'loc-poly', polygonId: 'nessuna', name: 'X' });
    // BUG noto: polygon:update non controlla i punti (una stringa sostituisce l'elenco).
    const s = await emitAndWait(c, 'polygon:update', { locationId: 'loc-poly-bug', polygonId: 'qb', points: 'abc' }, (st) => polys(st, 'loc-poly-bug')[0].points === 'abc');
    assert.equal(polys(s, 'loc-poly-bug')[0].points, 'abc');
  });

  ev('polygon:delete', 'valido: zona tolta', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'polygon:delete', { locationId: 'loc-poly', polygonId: 'qdel' }, (st) => !polys(st).some((p) => p.id === 'qdel'));
    assert.ok(!polys(s).some((p) => p.id === 'qdel'));
  });

  ev('polygon:delete', 'location o zona sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'polygon:delete', { locationId: 'nessuna', polygonId: 'q2' });
    await expectUnchanged(c, 'polygon:delete', { locationId: 'loc-poly', polygonId: 'nessuna' });
  });

  ev('polygon:restore', 'valido: zona reinserita all\'indice, stessi id e stato', async () => {
    const c = await open();
    const before = await barrier(c);
    const idx = polys(before).findIndex((p) => p.id === 'qres');
    const original = polys(before)[idx];
    await emitAndWait(c, 'polygon:delete', { locationId: 'loc-poly', polygonId: 'qres' }, (st) => !polys(st).some((p) => p.id === 'qres'));
    const restored = { ...original, revealed: 'sì', extra: 'ignorato' };
    const s = await emitAndWait(c, 'polygon:restore', { locationId: 'loc-poly', polygon: restored, index: idx }, (st) => polys(st).some((p) => p.id === 'qres'));
    assert.deepStrictEqual(polys(s)[idx], { ...original, revealed: true });
    assert.deepStrictEqual(polys(s).map((p) => p.id), polys(before).map((p) => p.id));
  });

  ev('polygon:restore', 'id già presente, senza punti o location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'polygon:restore', { locationId: 'loc-poly', polygon: poly('q2'), index: 0 });
    await expectUnchanged(c, 'polygon:restore', { locationId: 'loc-poly', polygon: { id: 'nuova', name: 'X' }, index: 0 });
    await expectUnchanged(c, 'polygon:restore', { locationId: 'nessuna', polygon: poly('zz'), index: 0 });
  });

  ev('polygon:reorder', 'valido: permutazione esatta', async () => {
    const c = await open();
    const ids = polys(await barrier(c)).map((p) => p.id);
    const reversed = [...ids].reverse();
    const s = await emitAndWait(c, 'polygon:reorder', { locationId: 'loc-poly', orderedIds: reversed }, (st) => polys(st)[0].id === reversed[0]);
    assert.deepStrictEqual(polys(s).map((p) => p.id), reversed);
  });

  ev('polygon:reorder', 'non permutazione: invariato (il mittente riceve lo stato)', async () => {
    const c = await open();
    const ids = polys(await barrier(c)).map((p) => p.id);
    await expectUnchanged(c, 'polygon:reorder', { locationId: 'loc-poly', orderedIds: ids.slice(1) });
    await expectUnchanged(c, 'polygon:reorder', { locationId: 'loc-poly', orderedIds: null });
    await expectUnchanged(c, 'polygon:reorder', { locationId: 'nessuna', orderedIds: ids });
  });

  // --- mappa, griglia, bussola --------------------------------------------------------------

  const mapOf = (s, id = 'loc-map') => loc(s, id).map;

  ev('mapScale:set', 'valido: scala impostata', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'mapScale:set', { locationId: 'loc-map', scale: 1.5 }, (st) => mapOf(st).scale === 1.5);
    assert.equal(mapOf(s).scale, 1.5);
  });

  ev('mapScale:set', 'location sconosciuta: stato invariato; scala non validata', async () => {
    const c = await open();
    await expectUnchanged(c, 'mapScale:set', { locationId: 'nessuna', scale: 2 });
    // BUG noto: mapScale:set accetta qualunque valore.
    const s = await emitAndWait(c, 'mapScale:set', { locationId: 'loc-map-bug', scale: 'grande' }, (st) => mapOf(st, 'loc-map-bug').scale === 'grande');
    assert.equal(mapOf(s, 'loc-map-bug').scale, 'grande');
  });

  ev('mapFlip:toggle', 'valido: flip180 invertito', async () => {
    const c = await open();
    const was = mapOf(await barrier(c)).flip180;
    const s = await emitAndWait(c, 'mapFlip:toggle', { locationId: 'loc-map' }, (st) => mapOf(st).flip180 === !was);
    assert.equal(mapOf(s).flip180, !was);
  });

  ev('mapFlip:toggle', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'mapFlip:toggle', { locationId: 'nessuna' });
  });

  ev('mapRotate90:toggle', 'valido: rotate90 invertito', async () => {
    const c = await open();
    const was = mapOf(await barrier(c)).rotate90;
    const s = await emitAndWait(c, 'mapRotate90:toggle', { locationId: 'loc-map' }, (st) => mapOf(st).rotate90 === !was);
    assert.equal(mapOf(s).rotate90, !was);
  });

  ev('mapRotate90:toggle', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'mapRotate90:toggle', { locationId: 'nessuna' });
  });

  ev('grid:update', 'valido: campi semplici; base e divisioni danno la cella', async () => {
    const c = await open();
    let s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map', enabled: true, color: '#ff0000', opacity: 0.5, lineWidth: 2, offsetX: 3, offsetY: 4 }, (st) => mapOf(st).grid.color === '#ff0000');
    assert.deepStrictEqual(
      (({ enabled, color, opacity, lineWidth, offsetX, offsetY }) => ({ enabled, color, opacity, lineWidth, offsetX, offsetY }))(mapOf(s).grid),
      { enabled: true, color: '#ff0000', opacity: 0.5, lineWidth: 2, offsetX: 3, offsetY: 4 }
    );
    s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map', baseCellSize: 150, divisions: 3.4 }, (st) => mapOf(st).grid.baseCellSize === 150);
    assert.deepStrictEqual([mapOf(s).grid.baseCellSize, mapOf(s).grid.divisions, mapOf(s).grid.cellSize], [150, 3, 50]);
    s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map', divisions: 0 }, (st) => mapOf(st).grid.divisions === 1);
    assert.equal(mapOf(s).grid.cellSize, 150);
    s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map', baseCellSize: 10, divisions: 5 }, (st) => mapOf(st).grid.baseCellSize === 10);
    assert.equal(mapOf(s).grid.cellSize, 4, 'cella minima 4');
  });

  ev('grid:update', 'cellSize diretto: diventa la base e azzera le divisioni', async () => {
    const c = await open();
    await emitAndWait(c, 'grid:update', { locationId: 'loc-map', baseCellSize: 120, divisions: 2 }, (st) => mapOf(st).grid.divisions === 2);
    const s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map', cellSize: 70 }, (st) => mapOf(st).grid.cellSize === 70);
    assert.deepStrictEqual([mapOf(s).grid.baseCellSize, mapOf(s).grid.divisions, mapOf(s).grid.cellSize], [70, 1, 70]);
  });

  ev('grid:update', 'location sconosciuta: stato invariato; divisioni non numeriche', async () => {
    const c = await open();
    await expectUnchanged(c, 'grid:update', { locationId: 'nessuna', enabled: true });
    // BUG noto: divisions non numerico diventa NaN, e cellSize con lui (null nel JSON).
    const s = await emitAndWait(c, 'grid:update', { locationId: 'loc-map-bug', divisions: 'tre' }, (st) => mapOf(st, 'loc-map-bug').grid.divisions === null);
    assert.equal(mapOf(s, 'loc-map-bug').grid.cellSize, null);
  });

  ev('compass:update', 'valido: x/y limitati a 0-100, rotazione modulo 360', async () => {
    const c = await open();
    const s = await emitAndWait(c, 'compass:update', { locationId: 'loc-map', visible: 1, x: 150, y: -10, rotation: -90.4 }, (st) => mapOf(st).compass.visible === true);
    assert.deepStrictEqual(mapOf(s).compass, { visible: true, x: 100, y: 0, rotation: 270 });
  });

  ev('compass:update', 'location sconosciuta: stato invariato; x non numerico', async () => {
    const c = await open();
    await expectUnchanged(c, 'compass:update', { locationId: 'nessuna', visible: true });
    // BUG noto: x non numerico diventa NaN (null nel JSON).
    const s = await emitAndWait(c, 'compass:update', { locationId: 'loc-map-bug', x: 'abc' }, (st) => mapOf(st, 'loc-map-bug').compass.x === null);
    assert.equal(mapOf(s, 'loc-map-bug').compass.x, null);
  });

  ev('gridPreset:save', 'valido: la griglia della location diventa la predefinita', async () => {
    const c = await open();
    await emitAndWait(c, 'grid:update', { locationId: 'loc-map', cellSize: 64, offsetX: 7, offsetY: 8, color: '#00ff00', lineWidth: 1, opacity: 0.4 }, (st) => mapOf(st).grid.cellSize === 64);
    const s = await emitAndWait(c, 'gridPreset:save', { locationId: 'loc-map' }, (st) => st.gridPreset.cellSize === 64);
    assert.deepStrictEqual(s.gridPreset, { cellSize: 64, offsetX: 7, offsetY: 8, color: '#00ff00', lineWidth: 1, opacity: 0.4 });
  });

  ev('gridPreset:save', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'gridPreset:save', { locationId: 'nessuna' });
  });

  ev('gridPreset:apply', 'valido: griglia dalla predefinita, divisioni azzerate', async () => {
    const c = await open();
    await emitAndWait(c, 'grid:update', { locationId: 'loc-map', cellSize: 80, offsetX: 1, offsetY: 2, color: '#0000ff', lineWidth: 0.5, opacity: 0.9 }, (st) => mapOf(st).grid.cellSize === 80);
    await emitAndWait(c, 'gridPreset:save', { locationId: 'loc-map' }, (st) => st.gridPreset.cellSize === 80);
    await emitAndWait(c, 'grid:update', { locationId: 'loc-map2', enabled: true, baseCellSize: 200, divisions: 4 }, (st) => mapOf(st, 'loc-map2').grid.divisions === 4);
    const s = await emitAndWait(c, 'gridPreset:apply', { locationId: 'loc-map2' }, (st) => mapOf(st, 'loc-map2').grid.cellSize === 80);
    assert.deepStrictEqual(mapOf(s, 'loc-map2').grid, {
      enabled: true, cellSize: 80, baseCellSize: 80, divisions: 1, offsetX: 1, offsetY: 2, color: '#0000ff', lineWidth: 0.5, opacity: 0.9
    });
  });

  ev('gridPreset:apply', 'location sconosciuta: stato invariato', async () => {
    const c = await open();
    await expectUnchanged(c, 'gridPreset:apply', { locationId: 'nessuna' });
  });

  // GRUPPI SUCCESSIVI
});
