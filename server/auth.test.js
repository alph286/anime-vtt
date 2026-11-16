const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { createAuth, parseCookies, isPublicPath, isPublicSocketEvent, COOKIE_NAME } = require('./auth');

let server, base, auth, clock;

async function start(pin) {
  clock = 1000;
  const app = express();
  app.use(express.json());
  auth = createAuth({ pin, now: () => clock });
  app.use(auth.httpGuard);
  auth.registerRoutes(app);
  app.use((req, res) => res.json({ ok: true, path: req.path }));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  server = null;
});

const get = (url, headers = {}) => fetch(base + url, { redirect: 'manual', headers });
const post = (url, body, headers = {}) => fetch(base + url, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body)
});
// Percorso letterale (fetch normalizza i "..").
function rawGet(rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, path: rawPath, method: 'GET', headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('parseCookies', () => {
  assert.deepEqual(parseCookies('a=1; vtt_dm=abc; b=x=y'), { a: '1', vtt_dm: 'abc', b: 'x=y' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
});

test('isPublicPath: pubblici', () => {
  for (const p of ['/', '/party', '/party/', '/party/assets/a.js', '/display/', '/handout/x',
    '/shared/media.js', '/storage/maps/a.png', '/home/home.css', '/login/', '/api/login', '/api/webproxy']) {
    assert.equal(isPublicPath(p), true, p);
  }
});

test('isPublicPath: protetti', () => {
  for (const p of ['/editor/', '/control/', '/opzioni/', '/api/state', '/api/export/backup',
    '/api/telegram/config', '/partyx', '/EDITOR/', '/party/../editor/x', '/api/loginx', '/qualcosa-di-nuovo']) {
    assert.equal(isPublicPath(p), false, p);
  }
});

test('isPublicSocketEvent', () => {
  for (const e of ['hello', 'display:viewport', 'audio:status', 'audio:oneshotEnded', 'aoe:place', 'aoe:setCast']) {
    assert.equal(isPublicSocketEvent(e), true, e);
  }
  for (const e of ['fow:toggle', 'location:delete', 'audio:toggle', 'image:show', 'ping:show', 'view:pan', 'aoe', undefined]) {
    assert.equal(isPublicSocketEvent(e), false, String(e));
  }
});

test('senza PIN tutto aperto', async () => {
  for (const pin of [undefined, '   ']) {
    await start(pin);
    assert.equal(auth.enabled, false);
    assert.equal((await get('/editor/x')).status, 200);
    assert.equal((await get('/api/state')).status, 200);
    await afterEachNow();
  }
});
async function afterEachNow() {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

test('pagina protetta rimanda al login', async () => {
  await start('1234');
  const res = await get('/editor/x?a=1');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login/?next=%2Feditor%2Fx%3Fa%3D1');
});

test('api protetta risponde 401', async () => {
  await start('1234');
  const res = await get('/api/state');
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'PIN del DM richiesto' });
});

test('percorsi pubblici passano', async () => {
  await start('1234');
  for (const p of ['/', '/party/x', '/display/x', '/api/webproxy?url=x']) {
    assert.equal((await get(p)).status, 200, p);
  }
});

test('percorso con .. è protetto', async () => {
  await start('1234');
  const res = await rawGet('/party/../editor/x');
  assert.equal(res.status, 302);
});

test('login sbagliato', async () => {
  await start('1234');
  const res = await post('/api/login', { pin: '0000' });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'PIN errato' });
  assert.equal(res.headers.get('set-cookie'), null);
});

test('login giusto', async () => {
  await start('1234');
  const res = await post('/api/login', { pin: '1234' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const sc = res.headers.get('set-cookie');
  assert.ok(sc.includes('vtt_dm='));
  for (const part of ['HttpOnly', 'SameSite=Lax', 'Max-Age=2592000', 'Path=/']) assert.ok(sc.includes(part), part);
  const value = sc.split(';')[0].split('=')[1];
  assert.equal((await get('/api/state', { Cookie: `vtt_dm=${value}` })).status, 200);
});

test('cookie alterato', async () => {
  await start('1234');
  assert.equal((await get('/api/state', { Cookie: 'vtt_dm=abc' })).status, 401);
  assert.equal((await get('/api/state', { Cookie: 'vtt_dm=' + 'f'.repeat(64) })).status, 401);
  assert.equal((await get('/api/state', { Cookie: 'vtt_dm=%E0%A4%A' })).status, 401);
});

test('blocco dopo 5 errori', async () => {
  await start('1234');
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/login', { pin: '0000' })).status, 401);
  const blocked = await post('/api/login', { pin: '1234' });
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: 'Troppi tentativi, riprova tra un minuto' });
  clock = 1000 + 60001;
  assert.equal((await post('/api/login', { pin: '1234' })).status, 200);
});

test('logout', async () => {
  await start('1234');
  // /api/logout non è nell'elenco pubblico: si esce da loggati, quindi col cookie.
  const res = await post('/api/logout', undefined, { Cookie: `vtt_dm=${auth.token}` });
  assert.equal(res.status, 200);
  const sc = res.headers.get('set-cookie');
  assert.ok(sc.includes('vtt_dm=;'));
  assert.ok(sc.includes('Max-Age=0'));
});

function fakeSocket(headers = {}) {
  return { handshake: { headers }, data: {}, use(fn) { this.mw = fn; } };
}

test('socketGuard senza cookie', async () => {
  await start('1234');
  const s = fakeSocket();
  auth.socketGuard(s);
  assert.equal(s.data.dm, false);
  let n = 0;
  const next = () => { n++; };
  s.mw(['fow:toggle', {}], next);
  assert.equal(n, 0);
  s.mw(['aoe:move', {}], next);
  s.mw(['hello', {}], next);
  assert.equal(n, 2);
});

test('socketGuard con cookie', async () => {
  await start('1234');
  const s = fakeSocket({ cookie: `${COOKIE_NAME}=` + auth.token });
  auth.socketGuard(s);
  assert.equal(s.data.dm, true);
  let n = 0;
  s.mw(['fow:toggle', {}], () => { n++; });
  assert.equal(n, 1);
});

test('socketGuard senza PIN', async () => {
  await start(undefined);
  const s = fakeSocket();
  auth.socketGuard(s);
  assert.equal(s.data.dm, true);
  let n = 0;
  s.mw(['fow:toggle', {}], () => { n++; });
  s.mw(['location:delete', {}], () => { n++; });
  assert.equal(n, 2);
});
