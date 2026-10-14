const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTelegramClient, MAX_UPLOAD_BYTES } = require('./telegram');

const TOKEN = '123456:SECRET-token_abc';

// fetch finto: ogni chiamata consuma la prossima risposta preparata.
function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}
const okBody = (result = {}) => ({ status: 200, body: { ok: true, result } });
const errBody = (status, description, parameters) => ({ status, body: { ok: false, description, parameters } });

function tmpFile(name, bytes = 16) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.alloc(bytes, 1));
  return file;
}

test('getMe: restituisce lo username del bot', async () => {
  const f = mockFetch([okBody({ username: 'mio_bot' })]);
  const r = await createTelegramClient({ fetchImpl: f }).getMe(TOKEN);
  assert.deepEqual(r, { ok: true, username: 'mio_bot' });
  assert.match(f.calls[0].url, /\/bot123456:SECRET-token_abc\/getMe$/);
});

test('getMe: 401 diventa "Token del bot non valido"', async () => {
  const f = mockFetch([errBody(401, 'Unauthorized')]);
  const r = await createTelegramClient({ fetchImpl: f }).getMe(TOKEN);
  assert.deepEqual(r, { ok: false, error: 'Token del bot non valido' });
});

test('errore di rete: messaggio chiaro e token mascherato', async () => {
  const f = mockFetch([new Error(`connect failed for https://api.telegram.org/bot${TOKEN}/getMe`)]);
  const r = await createTelegramClient({ fetchImpl: f }).getMe(TOKEN);
  assert.equal(r.ok, false);
  assert.match(r.error, /Telegram non raggiungibile/);
  assert.ok(!r.error.includes('SECRET'));
});

test('sendMedia foto: sendPhoto con chat, topic e didascalia', async () => {
  const f = mockFetch([okBody()]);
  const file = tmpFile('a.png');
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '-1001', threadId: 7, filePath: file, caption: 'ciao'
  });
  assert.deepEqual(r, { ok: true });
  assert.match(f.calls[0].url, /\/sendPhoto$/);
  const body = f.calls[0].init.body;
  assert.equal(body.get('chat_id'), '-1001');
  assert.equal(body.get('message_thread_id'), '7');
  assert.equal(body.get('caption'), 'ciao');
  assert.ok(body.get('photo'));
});

test('sendMedia: senza topic né didascalia i campi non vengono inviati', async () => {
  const f = mockFetch([okBody()]);
  await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('a.jpg'), caption: ''
  });
  const body = f.calls[0].init.body;
  assert.equal(body.has('message_thread_id'), false);
  assert.equal(body.has('caption'), false);
});

test('sendMedia: mp4/m4v/mov partono come animazione', async () => {
  for (const name of ['v.mp4', 'v.m4v', 'v.MOV']) {
    const f = mockFetch([okBody()]);
    await createTelegramClient({ fetchImpl: f }).sendMedia({
      token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile(name), caption: ''
    });
    assert.match(f.calls[0].url, /\/sendAnimation$/, name);
    assert.ok(f.calls[0].init.body.get('animation'), name);
  }
});

test('sendMedia: gli altri video partono come file (sendDocument)', async () => {
  for (const name of ['v.webm', 'v.mkv', 'v.avi']) {
    const f = mockFetch([okBody()]);
    await createTelegramClient({ fetchImpl: f }).sendMedia({
      token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile(name), caption: ''
    });
    assert.match(f.calls[0].url, /\/sendDocument$/, name);
    assert.ok(f.calls[0].init.body.get('document'), name);
  }
});

test('sendMedia: animazione rifiutata (400) -> ripiego su sendDocument', async () => {
  const f = mockFetch([errBody(400, 'Bad Request: wrong file type'), okBody()]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('v.mp4'), caption: 'x'
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /\/sendDocument$/);
  assert.equal(f.calls[1].init.body.get('caption'), 'x');
});

test('sendMedia: foto rifiutata (400) -> ripiego su sendDocument', async () => {
  const f = mockFetch([errBody(400, 'Bad Request: PHOTO_INVALID_DIMENSIONS'), okBody()]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('big.png'), caption: ''
  });
  assert.deepEqual(r, { ok: true });
  assert.match(f.calls[1].url, /\/sendDocument$/);
});

test('sendMedia: chat non trovata NON innesca il ripiego', async () => {
  const f = mockFetch([errBody(400, 'Bad Request: chat not found')]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('a.png'), caption: ''
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /chat_id/);
  assert.equal(f.calls.length, 1);
});

test('sendMedia: topic inesistente -> messaggio sul thread_id', async () => {
  const f = mockFetch([errBody(400, 'Bad Request: message thread not found')]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: 99, filePath: tmpFile('a.png'), caption: ''
  });
  assert.match(r.error, /thread_id/);
  assert.equal(f.calls.length, 1);
});

test('sendMedia: 403 -> il bot non può scrivere', async () => {
  const f = mockFetch([errBody(403, 'Forbidden: bot was kicked from the group chat')]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('a.png'), caption: ''
  });
  assert.match(r.error, /non può scrivere/);
});

test('sendMedia: 429 riporta i secondi di attesa e non ritenta', async () => {
  const f = mockFetch([errBody(429, 'Too Many Requests', { retry_after: 12 })]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: tmpFile('a.png'), caption: ''
  });
  assert.match(r.error, /12 secondi/);
  assert.equal(f.calls.length, 1);
});

test('sendMedia: oltre 50 MB rifiuta PRIMA di chiamare Telegram', async () => {
  const f = mockFetch([]);
  const file = tmpFile('grande.mp4');
  fs.truncateSync(file, MAX_UPLOAD_BYTES + 1024 * 1024); // file sparso, nessun vero ingombro
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: file, caption: ''
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /51,0 MB/);
  assert.match(r.error, /50 MB/);
  assert.equal(f.calls.length, 0);
});

test('sendMedia: file mancante -> errore chiaro, nessuna chiamata', async () => {
  const f = mockFetch([]);
  const r = await createTelegramClient({ fetchImpl: f }).sendMedia({
    token: TOKEN, chatId: '5', threadId: null, filePath: '/non/esiste.png', caption: ''
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /File non trovato/);
  assert.equal(f.calls.length, 0);
});

test('sendText: invia il testo alla chat e al topic', async () => {
  const f = mockFetch([okBody()]);
  const r = await createTelegramClient({ fetchImpl: f }).sendText({
    token: TOKEN, chatId: '-100', threadId: 3, text: 'prova'
  });
  assert.deepEqual(r, { ok: true });
  assert.match(f.calls[0].url, /\/sendMessage$/);
  const p = f.calls[0].init.body;
  assert.equal(p.get('chat_id'), '-100');
  assert.equal(p.get('message_thread_id'), '3');
  assert.equal(p.get('text'), 'prova');
});

test('detectChats: raggruppa per chat+topic e legge il nome del topic', async () => {
  const f = mockFetch([okBody([
    { update_id: 1, message: {
      chat: { id: -100, title: 'Gruppo' }, is_topic_message: true, message_thread_id: 5,
      reply_to_message: { forum_topic_created: { name: 'Mappe' } }
    } },
    { update_id: 2, message: {
      chat: { id: -100, title: 'Gruppo' }, is_topic_message: true, message_thread_id: 5
    } },
    { update_id: 3, message: { chat: { id: -100, title: 'Gruppo' } } },
    { update_id: 4, message: { chat: { id: 42, first_name: 'Ada', last_name: 'L' } } },
    { update_id: 5, callback_query: {} }
  ])]);
  const r = await createTelegramClient({ fetchImpl: f }).detectChats(TOKEN);
  assert.equal(r.ok, true);
  assert.deepEqual(r.chats, [
    { chatId: -100, chatTitle: 'Gruppo', threadId: 5, topicName: 'Mappe' },
    { chatId: -100, chatTitle: 'Gruppo', threadId: null, topicName: null },
    { chatId: 42, chatTitle: 'Ada L', threadId: null, topicName: null }
  ]);
  // Senza offset: gli aggiornamenti non vengono consumati.
  assert.equal(f.calls[0].init.body.has('offset'), false);
});

test('detectChats: nessun aggiornamento -> lista vuota, non errore', async () => {
  const f = mockFetch([okBody([])]);
  const r = await createTelegramClient({ fetchImpl: f }).detectChats(TOKEN);
  assert.deepEqual(r, { ok: true, chats: [] });
});

test('detectChats: 409 (webhook attivo) -> messaggio dedicato', async () => {
  const f = mockFetch([errBody(409, 'Conflict: can\'t use getUpdates method while webhook is active')]);
  const r = await createTelegramClient({ fetchImpl: f }).detectChats(TOKEN);
  assert.equal(r.ok, false);
  assert.match(r.error, /webhook/);
});
