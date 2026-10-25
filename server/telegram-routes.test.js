const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createTelegramConfig } = require('./telegram-config');
const { registerTelegramRoutes, sendStoredMedia } = require('./telegram-routes');

// Client finto: registra le chiamate, risposte configurabili per test.
function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    getMe: async (token) => { calls.push(['getMe', token]); return overrides.getMe || { ok: true, username: 'mio_bot' }; },
    sendMedia: async (a) => { calls.push(['sendMedia', a]); return overrides.sendMedia || { ok: true }; },
    sendText: async (a) => { calls.push(['sendText', a]); return overrides.sendText || { ok: true }; },
    detectChats: async (token) => { calls.push(['detectChats', token]); return overrides.detectChats || { ok: true, chats: [] }; }
  };
}

let server, base, config, client;

async function start(clientOverrides) {
  config = createTelegramConfig(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-rt-')), 'telegram.json'));
  client = fakeClient(clientOverrides);
  const app = express();
  app.use(express.json());
  registerTelegramRoutes(app, { config, client });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  server = null;
});
const json = (method, url, body) => fetch(base + url, {
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
});

test('POST /token: valida con getMe, salva ripulito e NON restituisce il token', async () => {
  await start();
  const res = await json('POST', '/api/telegram/token', { token: '  123:SEGRETO\n' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, botUsername: 'mio_bot' });
  assert.equal(config.getToken(), '123:SEGRETO');
  assert.deepEqual(client.calls[0], ['getMe', '123:SEGRETO']);
});

test('POST /token: token non valido -> 400 e nulla salvato', async () => {
  await start({ getMe: { ok: false, error: 'Token del bot non valido' } });
  const res = await json('POST', '/api/telegram/token', { token: 'sbagliato' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Token del bot non valido');
  assert.equal(config.getToken(), '');
});

test('POST /token: token mancante -> 400 senza chiamare Telegram', async () => {
  await start();
  const res = await json('POST', '/api/telegram/token', { token: '   ' });
  assert.equal(res.status, 400);
  assert.equal(client.calls.length, 0);
});

test('GET /config e GET /destinations: mai il token; destinations solo nomi', async () => {
  await start();
  config.setToken('123:SEGRETO', 'mio_bot');
  config.setDestinations([{ name: 'Mappe', chatId: '-100', threadId: 4 }]);
  const cfg = await (await json('GET', '/api/telegram/config')).text();
  assert.ok(!cfg.includes('SEGRETO'));
  assert.deepEqual(JSON.parse(cfg), {
    tokenSet: true, botUsername: 'mio_bot', destinations: [{ name: 'Mappe', chatId: '-100', threadId: 4 }]
  });
  const dest = await json('GET', '/api/telegram/destinations');
  assert.deepEqual(await dest.json(), [{ name: 'Mappe' }]);
});

test('DELETE /token: rimuove il token', async () => {
  await start();
  config.setToken('123:abc', 'b');
  const res = await json('DELETE', '/api/telegram/token');
  assert.equal(res.status, 200);
  assert.equal(config.getToken(), '');
});

test('PUT /destinations: salva; errore -> 400 con la riga', async () => {
  await start();
  const ok = await json('PUT', '/api/telegram/destinations', { destinations: [{ name: 'A', chatId: '-1', threadId: '' }] });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).destinations, [{ name: 'A', chatId: '-1', threadId: null }]);
  const bad = await json('PUT', '/api/telegram/destinations', { destinations: [{ name: 'A', chatId: 'x' }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Riga 1/);
});

test('POST /detect: senza token -> 400; con token inoltra a detectChats', async () => {
  await start({ detectChats: { ok: true, chats: [{ chatId: -1, chatTitle: 'G', threadId: null, topicName: null }] } });
  const no = await json('POST', '/api/telegram/detect');
  assert.equal(no.status, 400);
  config.setToken('123:abc', 'b');
  const yes = await json('POST', '/api/telegram/detect');
  assert.equal(yes.status, 200);
  assert.deepEqual((await yes.json()).chats[0].chatTitle, 'G');
});

test('POST /test: invia un messaggio di prova alla destinazione salvata', async () => {
  await start();
  config.setToken('123:abc', 'b');
  config.setDestinations([{ name: 'Mappe', chatId: '-100', threadId: 4 }]);
  const res = await json('POST', '/api/telegram/test', { name: 'Mappe' });
  assert.equal(res.status, 200);
  const sent = client.calls.find((c) => c[0] === 'sendText')[1];
  assert.equal(sent.chatId, '-100');
  assert.equal(sent.threadId, 4);
  const missing = await json('POST', '/api/telegram/test', { name: 'Altro' });
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /salva/i);
});

test('sendStoredMedia: risolve il nome nella destinazione e inoltra a sendMedia', async () => {
  await start();
  config.setToken('123:abc', 'b');
  config.setDestinations([{ name: 'Mappe', chatId: '-100', threadId: 4 }]);
  const r = await sendStoredMedia({ config, client, filePath: '/x/a.mp4', caption: 'ciao', destinationName: 'Mappe' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(client.calls.find((c) => c[0] === 'sendMedia')[1], {
    token: '123:abc', chatId: '-100', threadId: 4, filePath: '/x/a.mp4', caption: 'ciao'
  });
});

test('sendStoredMedia: errori espliciti senza token, senza destinazione, destinazione sparita', async () => {
  await start();
  let r = await sendStoredMedia({ config, client, filePath: '/x', caption: '', destinationName: 'Mappe' });
  assert.match(r.error, /non configurato/i);
  config.setToken('123:abc', 'b');
  r = await sendStoredMedia({ config, client, filePath: '/x', caption: '', destinationName: null });
  assert.match(r.error, /Nessuna destinazione/);
  r = await sendStoredMedia({ config, client, filePath: '/x', caption: '', destinationName: 'Sparita' });
  assert.match(r.error, /«Sparita» non più configurata/);
  assert.equal(client.calls.filter((c) => c[0] === 'sendMedia').length, 0);
});

test('POST /token: se il salvataggio fallisce risponde 500 e il server resta in piedi', async () => {
  const realConfig = createTelegramConfig(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-rt-')), 'telegram.json'));
  config = { ...realConfig, setToken() { throw new Error('disco pieno'); } };
  client = fakeClient();
  const app = express();
  app.use(express.json());
  registerTelegramRoutes(app, { config, client });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await json('POST', '/api/telegram/token', { token: '123:SEGRETO' });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /Salvataggio non riuscito/);
  assert.ok(!body.error.includes('SEGRETO'));
  // Il server risponde ancora dopo l'errore (nessun crash del processo).
  const still = await json('GET', '/api/telegram/destinations');
  assert.equal(still.status, 200);
});
