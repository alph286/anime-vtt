# Telegram nativo (senza PicSender) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inviare foto e video della scheda Media direttamente alla Bot API di Telegram, configurando bot e destinazioni da `/opzioni`, e togliere del tutto l'integrazione PicSender.

**Architecture:** Tre moduli server piccoli e testabili (`telegram.js` client Bot API con `fetch` iniettabile, `telegram-config.js` file segreto `data/telegram.json`, `telegram-routes.js` endpoint + risoluzione destinazione) collegati a `server/index.js`. Il bot token non entra mai in `state` (che viene trasmesso a tutti i client). Lato client cadono solo i blocchi che nascondevano didascalia/Invia per i video; `/opzioni` (JS vanilla) guadagna la sezione Telegram.

**Tech Stack:** Node 22 (`fetch`, `FormData`, `fs.openAsBlob` nativi), Express 4, `node:test` per il server, Vitest + Testing Library per il client, JS vanilla per `/opzioni`. Nessuna nuova dipendenza.

**Spec:** `docs/superpowers/specs/2026-10-14-telegram-native-design.md`

## Global Constraints

- Il bot token non compare MAI in: `state`/`state:update`, `GET /api/telegram/config`, `GET /api/telegram/destinations`, export location/backup, messaggi d'errore, log.
- `data/telegram.json`: scrittura atomica (file temporaneo + rename), permessi `0600`, in `.gitignore`; file mancante o corrotto = "non configurato", il server parte comunque.
- Limite upload Telegram: 50 MB, controllato PRIMA dell'upload, per foto e video. Nessuna conversione né ricompressione, nessuna nuova dipendenza (niente ffmpeg).
- Metodo di invio per estensione: foto → `sendPhoto` (ripiego `sendDocument`); `mp4`/`m4v`/`mov` → `sendAnimation` (ripiego `sendDocument`); altri video → `sendDocument`.
- Eventi socket `image:sendTelegram` / `telegram:sendResult { imageId, ok, error? }` e campi `caption` / `telegramDestination` (un NOME) invariati.
- Testi per l'utente in italiano. Codice nello stile del repo: CommonJS lato server, commenti in italiano che spiegano il perché.
- Comando test server: `npm run test:server` (introdotto nel Task 1). Test client: `cd editor-app && npx vitest run`.
- Dati: mai toccare `data/` reale. Verifiche manuali con `DATA_DIR=$(mktemp -d) STORAGE_DIR=$(mktemp -d) PORT=3100 node server/index.js`.

## Review Focus

- Token incollato con spazi/a capo attorno → va ripulito (`trim`) prima di `getMe` e prima del salvataggio. (Task 2, 3)
- `chat_id` negativo di supergruppo (`-1001234567890`) valido; `thread_id` `0`, negativo o non numerico rifiutato. (Task 2)
- Didascalia vuota o assente → il campo `caption` non viene inviato; didascalia piena la riceve. (Task 1)
- Errore di rete di `fetch` che contiene il token nel messaggio → il token viene mascherato. (Task 1)
- File sparito dal disco dopo il caricamento → errore chiaro in `telegram:sendResult`, nessun crash. (Task 1)
- `telegram.json` corrotto o con destinazioni malformate → "non configurato" / voci scartate, server avviato. (Task 2)
- Rilevamento con zero aggiornamenti → lista vuota con istruzioni (bot con privacy mode: serve una menzione), non un errore. (Task 1, 5)
- Due destinazioni con lo stesso nome → rifiutate con errore sulla riga. (Task 2)

---

## File Structure

- Create `server/telegram.js` — client Bot API puro (`createTelegramClient({ fetchImpl })` → `getMe`, `sendMedia`, `sendText`, `detectChats`).
- Create `server/telegram.test.js` — test con `fetch` finto.
- Create `server/telegram-config.js` — `createTelegramConfig(filePath)` + `validateDestinations`.
- Create `server/telegram-config.test.js`.
- Create `server/telegram-routes.js` — `registerTelegramRoutes(app, { config, client })` e `sendStoredMedia(...)`.
- Create `server/telegram-routes.test.js` — test degli endpoint su un'app Express temporanea.
- Create `server/state.test.js` — la migrazione elimina `settings.picsenderUrl`.
- Modify `server/index.js`, `server/state.js`, `.gitignore`, `.env.example`, `package.json`, `README.md`, `CLAUDE.md`.
- Delete `server/picsender.js`.
- Modify `editor-app/src/control/tabs/ImagesTab.tsx`, `editor-app/src/sidebar/ImagePanel.tsx`, `editor-app/src/control/tabs/images-audio.test.tsx`.
- Modify `public/opzioni/index.html`, `opzioni.js`, `opzioni.css`.
- Rebuild committed bundles: `public/control/`, `public/editor/` (Task 5).

---

### Task 1: Client Bot API (`server/telegram.js`)

**Files:**
- Create: `server/telegram.js`
- Test: `server/telegram.test.js`
- Modify: `package.json` (script `test:server`)

**Interfaces:**
- Produces (usato dai Task 3-4):
  - `createTelegramClient({ fetchImpl = fetch } = {})` → oggetto con:
  - `getMe(token)` → `Promise<{ ok:true, username:string } | { ok:false, error:string }>`
  - `sendMedia({ token, chatId, threadId, filePath, caption })` → `Promise<{ ok:true } | { ok:false, error:string }>` — `chatId`: stringa o numero, `threadId`: numero o `null`.
  - `sendText({ token, chatId, threadId, text })` → stesso tipo di `sendMedia`.
  - `detectChats(token)` → `Promise<{ ok:true, chats:Array<{chatId:number, chatTitle:string, threadId:number|null, topicName:string|null}> } | { ok:false, error:string }>`
  - Costante esportata `MAX_UPLOAD_BYTES = 50 * 1024 * 1024`.
  - Nessuna funzione lancia mai: ogni fallimento è `{ ok:false, error }`.

- [ ] **Step 1: Aggiungere lo script di test al `package.json`**

In `package.json`, dentro `"scripts"`, aggiungere (dopo `"build:all"`, ricordando la virgola):

```json
    "build:all": "npm run build:editor && npm run build:control && npm run build:party",
    "test:server": "node --test server/*.test.js public/shared/media.test.js"
```

- [ ] **Step 2: Scrivere i test (falliscono)**

Creare `server/telegram.test.js`:

```js
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
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `npm run test:server`
Expected: FAIL con "Cannot find module './telegram'".

- [ ] **Step 4: Implementare `server/telegram.js`**

```js
// Client minimale della Bot API di Telegram. Puro: nessuno stato, nessun
// accesso a file di configurazione (il token arriva sempre come parametro) e
// `fetch` iniettabile, così i test non toccano la rete. Nessuna funzione
// lancia mai: ogni fallimento diventa { ok: false, error } con un messaggio
// già pronto da mostrare all'utente.

const fs = require('fs');
const path = require('path');
const { isVideoFile } = require('../public/shared/media.js');

const API_BASE = 'https://api.telegram.org';
// Tetto del Bot API pubblico: oltre, Telegram rifiuta l'upload. Lo controlliamo
// noi per primi, così l'utente non aspetta un upload destinato a fallire.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Telegram mostra come "GIF" (animazione in loop, muta) solo MP4 H.264: gli
// altri formati non sono convertibili senza ffmpeg, quindi vanno come file.
const ANIMATION_EXTENSIONS = ['mp4', 'm4v', 'mov'];
// Errori che dicono "il problema è la destinazione", non il file: ritentare
// con sendDocument sarebbe inutile e nasconderebbe la causa vera.
const DESTINATION_ERROR = /chat not found|message thread not found|not enough rights|have no rights/i;

function describeError(status, data) {
  const d = String((data && data.description) || '');
  if (status === 401) return 'Token del bot non valido';
  if (status === 409) {
    return 'Sul bot è attivo un webhook: finché lo è, Telegram non permette di leggere i messaggi per il rilevamento';
  }
  if (status === 429) {
    const s = data && data.parameters && data.parameters.retry_after;
    return s ? `Troppe richieste a Telegram: riprova tra ${s} secondi` : 'Troppe richieste a Telegram: riprova tra poco';
  }
  if (/message thread not found/i.test(d)) return 'Topic non trovato: controlla il thread_id';
  if (/chat not found/i.test(d)) return 'Chat non trovata: controlla il chat_id e che il bot sia nel gruppo';
  if (status === 403 || /not enough rights|have no rights|bot was kicked/i.test(d)) {
    return 'Il bot non può scrivere in questa chat: non è nel gruppo o non ha il permesso di scrivere';
  }
  return d ? `Telegram: ${d}` : `Telegram ha risposto ${status}`;
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
}

function createTelegramClient({ fetchImpl = fetch } = {}) {
  async function call(token, method, body) {
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/bot${token}/${method}`, body ? { method: 'POST', body } : {});
    } catch (err) {
      // L'URL (e quindi il token) può finire nel messaggio dell'errore di rete.
      const safe = String(err && err.message).split(token).join('***');
      return { ok: false, status: 0, description: '', error: `Telegram non raggiungibile: ${safe}` };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, result: data.result };
    return { ok: false, status: res.status, description: String(data.description || ''), error: describeError(res.status, data) };
  }

  async function getMe(token) {
    const r = await call(token, 'getMe');
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, username: (r.result && r.result.username) || '' };
  }

  function chatFields(form, { chatId, threadId }) {
    form.append('chat_id', String(chatId));
    if (threadId != null) form.append('message_thread_id', String(threadId));
  }

  async function upload(kind, { token, chatId, threadId, filePath, caption }) {
    const method = { photo: 'sendPhoto', animation: 'sendAnimation', document: 'sendDocument' }[kind];
    const form = new FormData();
    chatFields(form, { chatId, threadId });
    if (caption) form.append('caption', caption);
    // openAsBlob legge il file a richiesta: un video da decine di MB non resta
    // tutto in memoria (conta sul Raspberry Pi). Fallback per Node più vecchi.
    const blob = typeof fs.openAsBlob === 'function' ? await fs.openAsBlob(filePath) : new Blob([fs.readFileSync(filePath)]);
    form.append(kind, blob, path.basename(filePath));
    return call(token, method, form);
  }

  async function sendMedia({ token, chatId, threadId, filePath, caption }) {
    let size;
    try {
      size = fs.statSync(filePath).size;
    } catch (err) {
      return { ok: false, error: 'File non trovato sul disco' };
    }
    if (size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `Il file pesa ${formatMb(size)} MB: Telegram accetta fino a 50 MB, comprimilo prima di inviarlo` };
    }
    const ext = path.extname(filePath).slice(1).toLowerCase();
    let kind = 'photo';
    if (isVideoFile(filePath)) kind = ANIMATION_EXTENSIONS.includes(ext) ? 'animation' : 'document';
    const args = { token, chatId, threadId, filePath, caption };

    const first = await upload(kind, args);
    if (first.ok) return { ok: true };
    if (kind !== 'document' && first.status === 400 && !DESTINATION_ERROR.test(first.description)) {
      const second = await upload('document', args);
      return second.ok ? { ok: true } : { ok: false, error: second.error };
    }
    return { ok: false, error: first.error };
  }

  async function sendText({ token, chatId, threadId, text }) {
    const form = new URLSearchParams({ chat_id: String(chatId), text });
    if (threadId != null) form.append('message_thread_id', String(threadId));
    const r = await call(token, 'sendMessage', form);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  // getUpdates SENZA offset: non conferma gli aggiornamenti, quindi non li
  // consuma (restano disponibili per 24h). Mostra solo ciò che il bot ha visto.
  async function detectChats(token) {
    const r = await call(token, 'getUpdates', new URLSearchParams({ limit: '100' }));
    if (!r.ok) return { ok: false, error: r.error };
    const found = new Map();
    const topicNames = new Map();
    for (const u of r.result || []) {
      const m = u.message || u.edited_message || u.channel_post;
      if (!m || !m.chat) continue;
      const chat = m.chat;
      const chatTitle = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id);
      // message_thread_id compare anche nelle semplici risposte di un gruppo
      // senza topic: lo consideriamo un topic solo se Telegram lo dichiara.
      const threadId = m.is_topic_message ? m.message_thread_id : null;
      const topicName = (m.forum_topic_created && m.forum_topic_created.name)
        || (m.reply_to_message && m.reply_to_message.forum_topic_created && m.reply_to_message.forum_topic_created.name)
        || null;
      if (threadId != null && topicName) topicNames.set(`${chat.id}:${threadId}`, topicName);
      const key = `${chat.id}:${threadId == null ? '' : threadId}`;
      if (!found.has(key)) found.set(key, { chatId: chat.id, chatTitle, threadId, topicName: null });
    }
    const chats = [...found.values()].map((c) => ({
      ...c,
      topicName: c.threadId == null ? null : (topicNames.get(`${c.chatId}:${c.threadId}`) || null)
    }));
    return { ok: true, chats };
  }

  return { getMe, sendMedia, sendText, detectChats };
}

module.exports = { createTelegramClient, MAX_UPLOAD_BYTES };
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `npm run test:server`
Expected: tutti i test di `server/telegram.test.js` PASS, più i 38 di `media.test.js`.

- [ ] **Step 6: Commit**

```bash
git add server/telegram.js server/telegram.test.js package.json
git commit -m "feat(telegram): client Bot API (foto, animazioni, file, rilevamento chat)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Configurazione segreta (`server/telegram-config.js`)

**Files:**
- Create: `server/telegram-config.js`
- Test: `server/telegram-config.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces (usato dal Task 3):
  - `validateDestinations(list)` → `{ ok:true, value:Array<{name:string, chatId:string, threadId:number|null}> } | { ok:false, error:string }`
  - `createTelegramConfig(filePath)` → oggetto con:
    - `getToken()` → `string` (vuota se assente)
    - `setToken(token, botUsername)` → `void` (fa `trim`)
    - `clearToken()` → `void` (conserva le destinazioni)
    - `getDestinations()` → `Array<{name, chatId, threadId}>`
    - `setDestinations(list)` → `{ ok:true } | { ok:false, error }`
    - `publicConfig()` → `{ tokenSet:boolean, botUsername:string, destinations }` (mai il token)

- [ ] **Step 1: Scrivere i test (falliscono)**

Creare `server/telegram-config.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTelegramConfig, validateDestinations } = require('./telegram-config');

function tmpFilePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cfg-')), 'telegram.json');
}

test('file mancante: non configurato, nessun crash', () => {
  const c = createTelegramConfig(tmpFilePath());
  assert.equal(c.getToken(), '');
  assert.deepEqual(c.getDestinations(), []);
  assert.deepEqual(c.publicConfig(), { tokenSet: false, botUsername: '', destinations: [] });
});

test('file corrotto: si degrada a non configurato', () => {
  const file = tmpFilePath();
  fs.writeFileSync(file, '{non è json');
  const c = createTelegramConfig(file);
  assert.equal(c.getToken(), '');
  assert.deepEqual(c.getDestinations(), []);
});

test('destinazioni malformate nel file vengono scartate, le valide restano', () => {
  const file = tmpFilePath();
  fs.writeFileSync(file, JSON.stringify({
    botToken: 't', destinations: [{ name: 'Ok', chatId: '-1', threadId: null }, { name: 5 }, null, 'x']
  }));
  assert.deepEqual(createTelegramConfig(file).getDestinations(), [{ name: 'Ok', chatId: '-1', threadId: null }]);
});

test('setToken: ripulisce spazi/a capo e persiste con permessi 0600', () => {
  const file = tmpFilePath();
  const c = createTelegramConfig(file);
  c.setToken('  123:abc\n', 'mio_bot');
  assert.equal(c.getToken(), '123:abc');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(createTelegramConfig(file).getToken(), '123:abc');
});

test('publicConfig non contiene mai il token', () => {
  const c = createTelegramConfig(tmpFilePath());
  c.setToken('123:SEGRETO', 'mio_bot');
  const pub = c.publicConfig();
  assert.equal(pub.tokenSet, true);
  assert.equal(pub.botUsername, 'mio_bot');
  assert.ok(!JSON.stringify(pub).includes('SEGRETO'));
});

test('clearToken: toglie il token e conserva le destinazioni', () => {
  const c = createTelegramConfig(tmpFilePath());
  c.setToken('123:abc', 'b');
  c.setDestinations([{ name: 'A', chatId: '-100', threadId: null }]);
  c.clearToken();
  assert.equal(c.getToken(), '');
  assert.equal(c.publicConfig().botUsername, '');
  assert.equal(c.getDestinations().length, 1);
});

test('setDestinations: salva normalizzando chatId a stringa e thread vuoto a null', () => {
  const c = createTelegramConfig(tmpFilePath());
  const r = c.setDestinations([
    { name: '  Mappe ', chatId: -1001234567890, threadId: '12' },
    { name: 'Generale', chatId: ' -100 ', threadId: '' }
  ]);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(c.getDestinations(), [
    { name: 'Mappe', chatId: '-1001234567890', threadId: 12 },
    { name: 'Generale', chatId: '-100', threadId: null }
  ]);
});

test('setDestinations: errore non modifica il file', () => {
  const c = createTelegramConfig(tmpFilePath());
  c.setDestinations([{ name: 'A', chatId: '1', threadId: null }]);
  const r = c.setDestinations([{ name: '', chatId: '1' }]);
  assert.equal(r.ok, false);
  assert.equal(c.getDestinations().length, 1);
});

test('validateDestinations: casi di errore con la riga colpevole', () => {
  const cases = [
    [[{ name: '', chatId: '1' }], /Riga 1.*nome/i],
    [[{ name: 'A', chatId: 'abc' }], /Riga 1.*chat_id/i],
    [[{ name: 'A', chatId: '' }], /Riga 1.*chat_id/i],
    [[{ name: 'A', chatId: '1', threadId: '0' }], /Riga 1.*thread_id/i],
    [[{ name: 'A', chatId: '1', threadId: '-3' }], /Riga 1.*thread_id/i],
    [[{ name: 'A', chatId: '1', threadId: 'x' }], /Riga 1.*thread_id/i],
    [[{ name: 'A', chatId: '1' }, { name: 'A', chatId: '2' }], /Riga 2.*già usato/i],
    ['non una lista', /lista/i]
  ];
  for (const [input, re] of cases) {
    const r = validateDestinations(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.match(r.error, re, JSON.stringify(input));
  }
});

test('validateDestinations: chat_id negativo di supergruppo è valido', () => {
  const r = validateDestinations([{ name: 'S', chatId: '-1001234567890', threadId: null }]);
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test server/telegram-config.test.js`
Expected: FAIL "Cannot find module './telegram-config'".

- [ ] **Step 3: Implementare `server/telegram-config.js`**

```js
// Configurazione Telegram: bot token + destinazioni, in un file SEPARATO da
// state.json. Il motivo è di sicurezza: `state` viene trasmesso con
// state:update a ogni client (/display, /party, qualunque telefono in rete),
// quindi un token lì dentro sarebbe leggibile da chiunque apra una pagina.
// Questo file resta lato server: nessun endpoint lo restituisce in chiaro, ed
// export/backup (costruiti da `state`) non lo includono.

const fs = require('fs');

const EMPTY = () => ({ botToken: '', botUsername: '', destinations: [] });

function isStoredDestination(d) {
  return d && typeof d === 'object' && typeof d.name === 'string' && typeof d.chatId === 'string';
}

// Valida e normalizza la lista che arriva da /opzioni. Il messaggio indica la
// riga colpevole (numerata da 1, come la vede l'utente).
function validateDestinations(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'Le destinazioni devono essere una lista' };
  const seen = new Set();
  const value = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const n = i + 1;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return { ok: false, error: `Riga ${n}: il nome è obbligatorio` };
    if (seen.has(name)) return { ok: false, error: `Riga ${n}: il nome «${name}» è già usato` };
    seen.add(name);
    const chatId = String(row.chatId == null ? '' : row.chatId).trim();
    if (!/^-?\d+$/.test(chatId)) return { ok: false, error: `Riga ${n}: il chat_id deve essere un numero (anche negativo)` };
    const rawThread = String(row.threadId == null ? '' : row.threadId).trim();
    let threadId = null;
    if (rawThread !== '') {
      if (!/^\d+$/.test(rawThread) || Number(rawThread) < 1) {
        return { ok: false, error: `Riga ${n}: il thread_id deve essere un intero positivo (o vuoto)` };
      }
      threadId = Number(rawThread);
    }
    value.push({ name, chatId, threadId });
  }
  return { ok: true, value };
}

function createTelegramConfig(filePath) {
  function read() {
    try {
      const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        botToken: typeof d.botToken === 'string' ? d.botToken : '',
        botUsername: typeof d.botUsername === 'string' ? d.botUsername : '',
        destinations: Array.isArray(d.destinations)
          ? d.destinations.filter(isStoredDestination).map((x) => ({
            name: x.name, chatId: x.chatId, threadId: Number.isInteger(x.threadId) ? x.threadId : null
          }))
          : []
      };
    } catch (err) {
      return EMPTY(); // mancante o corrotto: "non configurato", il server parte comunque
    }
  }

  // Scrittura atomica: un crash a metà non deve lasciare un file troncato che
  // farebbe perdere token e destinazioni.
  function write(data) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  return {
    getToken: () => read().botToken,
    setToken(token, botUsername) {
      write({ ...read(), botToken: String(token).trim(), botUsername: botUsername || '' });
    },
    clearToken() {
      write({ ...read(), botToken: '', botUsername: '' });
    },
    getDestinations: () => read().destinations,
    setDestinations(list) {
      const v = validateDestinations(list);
      if (!v.ok) return v;
      write({ ...read(), destinations: v.value });
      return { ok: true };
    },
    publicConfig() {
      const c = read();
      return { tokenSet: Boolean(c.botToken), botUsername: c.botUsername, destinations: c.destinations };
    }
  };
}

module.exports = { createTelegramConfig, validateDestinations };
```

- [ ] **Step 4: Eseguire i test**

Run: `node --test server/telegram-config.test.js`
Expected: PASS.

- [ ] **Step 5: `.gitignore` e commit**

Aggiungere in `.gitignore`, sotto `data/state.json`:

```
data/telegram.json
data/telegram.json.*.tmp
```

```bash
git add server/telegram-config.js server/telegram-config.test.js .gitignore
git commit -m "feat(telegram): config segreta lato server (token + destinazioni)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoint e risoluzione destinazione (`server/telegram-routes.js`)

**Files:**
- Create: `server/telegram-routes.js`
- Test: `server/telegram-routes.test.js`

**Interfaces:**
- Consumes: `createTelegramConfig(...)` (Task 2) e `createTelegramClient(...)` (Task 1), con le firme esatte sopra.
- Produces (usato dal Task 4):
  - `registerTelegramRoutes(app, { config, client })` — registra: `GET /api/telegram/destinations` (`[{name}]`), `GET /api/telegram/config`, `POST /api/telegram/token` (`{token}` → `{ok, botUsername}`), `DELETE /api/telegram/token`, `PUT /api/telegram/destinations` (`{destinations}`), `POST /api/telegram/detect`, `POST /api/telegram/test` (`{name}`). Errori: `{ error:string }` con 400/404.
  - `sendStoredMedia({ config, client, filePath, caption, destinationName })` → `Promise<{ ok:true } | { ok:false, error }>`

- [ ] **Step 1: Scrivere i test (falliscono)**

Creare `server/telegram-routes.test.js`:

```js
const { test, before, after } = require('node:test');
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
async function stop() { await new Promise((resolve) => server.close(resolve)); }
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
  await stop();
});

test('POST /token: token non valido -> 400 e nulla salvato', async () => {
  await start({ getMe: { ok: false, error: 'Token del bot non valido' } });
  const res = await json('POST', '/api/telegram/token', { token: 'sbagliato' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Token del bot non valido');
  assert.equal(config.getToken(), '');
  await stop();
});

test('POST /token: token mancante -> 400 senza chiamare Telegram', async () => {
  await start();
  const res = await json('POST', '/api/telegram/token', { token: '   ' });
  assert.equal(res.status, 400);
  assert.equal(client.calls.length, 0);
  await stop();
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
  await stop();
});

test('DELETE /token: rimuove il token', async () => {
  await start();
  config.setToken('123:abc', 'b');
  const res = await json('DELETE', '/api/telegram/token');
  assert.equal(res.status, 200);
  assert.equal(config.getToken(), '');
  await stop();
});

test('PUT /destinations: salva; errore -> 400 con la riga', async () => {
  await start();
  const ok = await json('PUT', '/api/telegram/destinations', { destinations: [{ name: 'A', chatId: '-1', threadId: '' }] });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).destinations, [{ name: 'A', chatId: '-1', threadId: null }]);
  const bad = await json('PUT', '/api/telegram/destinations', { destinations: [{ name: 'A', chatId: 'x' }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Riga 1/);
  await stop();
});

test('POST /detect: senza token -> 400; con token inoltra a detectChats', async () => {
  await start({ detectChats: { ok: true, chats: [{ chatId: -1, chatTitle: 'G', threadId: null, topicName: null }] } });
  const no = await json('POST', '/api/telegram/detect');
  assert.equal(no.status, 400);
  config.setToken('123:abc', 'b');
  const yes = await json('POST', '/api/telegram/detect');
  assert.equal(yes.status, 200);
  assert.deepEqual((await yes.json()).chats[0].chatTitle, 'G');
  await stop();
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
  await stop();
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
  await stop();
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
  await stop();
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `node --test server/telegram-routes.test.js`
Expected: FAIL "Cannot find module './telegram-routes'".

- [ ] **Step 3: Implementare `server/telegram-routes.js`**

```js
// Endpoint HTTP della configurazione Telegram + risoluzione della
// destinazione al momento dell'invio. Separato da index.js per poterlo
// testare su un'app Express temporanea, senza avviare l'intero server.
// Nessuna risposta contiene mai il bot token.

function registerTelegramRoutes(app, { config, client }) {
  // Solo i nomi: le tendine di /editor e /control non hanno bisogno di chat_id.
  app.get('/api/telegram/destinations', (req, res) => {
    res.json(config.getDestinations().map((d) => ({ name: d.name })));
  });

  app.get('/api/telegram/config', (req, res) => {
    res.json(config.publicConfig());
  });

  app.post('/api/telegram/token', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ error: 'Token mancante' });
    const me = await client.getMe(token);
    if (!me.ok) return res.status(400).json({ error: me.error });
    config.setToken(token, me.username);
    res.json({ ok: true, botUsername: me.username });
  });

  app.delete('/api/telegram/token', (req, res) => {
    config.clearToken();
    res.json({ ok: true });
  });

  app.put('/api/telegram/destinations', (req, res) => {
    const result = config.setDestinations(req.body?.destinations);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, destinations: config.getDestinations() });
  });

  app.post('/api/telegram/detect', async (req, res) => {
    const token = config.getToken();
    if (!token) return res.status(400).json({ error: 'Imposta prima il token del bot' });
    const result = await client.detectChats(token);
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ chats: result.chats });
  });

  app.post('/api/telegram/test', async (req, res) => {
    const token = config.getToken();
    if (!token) return res.status(400).json({ error: 'Imposta prima il token del bot' });
    const dest = config.getDestinations().find((d) => d.name === req.body?.name);
    if (!dest) return res.status(404).json({ error: 'Destinazione non trovata: salva prima le destinazioni' });
    const result = await client.sendText({
      token, chatId: dest.chatId, threadId: dest.threadId, text: `Prova di anime-vtt: «${dest.name}» funziona.`
    });
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ ok: true });
  });
}

// Il nome della destinazione assegnata al media (non un indice) viene risolto
// qui, al momento dell'invio: resta valido anche se la lista cambia ordine.
async function sendStoredMedia({ config, client, filePath, caption, destinationName }) {
  const token = config.getToken();
  if (!token) return { ok: false, error: 'Telegram non configurato: imposta il bot in /opzioni' };
  if (!destinationName) return { ok: false, error: 'Nessuna destinazione assegnata a questo media' };
  const dest = config.getDestinations().find((d) => d.name === destinationName);
  if (!dest) return { ok: false, error: `Destinazione «${destinationName}» non più configurata in /opzioni` };
  return client.sendMedia({ token, chatId: dest.chatId, threadId: dest.threadId, filePath, caption });
}

module.exports = { registerTelegramRoutes, sendStoredMedia };
```

- [ ] **Step 4: Eseguire i test**

Run: `node --test server/telegram-routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/telegram-routes.js server/telegram-routes.test.js
git commit -m "feat(telegram): endpoint di configurazione e risoluzione destinazione

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Collegare il server e rimuovere PicSender

**Files:**
- Modify: `server/index.js` (righe ~12, ~79-87, ~270-277, ~671-688)
- Modify: `server/state.js` (righe ~71-80)
- Delete: `server/picsender.js`
- Test: `server/state.test.js`, `server/export-no-token.test.js`

**Interfaces:**
- Consumes: `createTelegramClient`, `createTelegramConfig`, `registerTelegramRoutes`, `sendStoredMedia` (Task 1-3).
- Produces: `state.settings` non esiste più; `POST /api/settings` accetta solo `{ campaignName }`.

- [ ] **Step 1: Test di migrazione (falliscono)**

Creare `server/state.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('./state');

test('migrate: toglie settings (picsenderUrl non esiste più) senza toccare il resto', () => {
  const state = {
    campaign: { name: 'X' },
    settings: { picsenderUrl: 'http://pi:5000' },
    locations: []
  };
  migrate(state);
  assert.equal('settings' in state, false);
  assert.equal(state.campaign.name, 'X');
});

test('migrate: uno stato senza settings resta senza settings', () => {
  const state = { campaign: { name: 'X' }, locations: [] };
  migrate(state);
  assert.equal('settings' in state, false);
});
```

E `server/export-no-token.test.js` (regressione: il backup è costruito da `state` e non può contenere né `settings` né il token):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tar = require('tar-stream');
const os = require('os');
const fs = require('fs');
const path = require('path');
const exportImport = require('./exportImport');

test('il manifest del backup non contiene settings né token Telegram', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const state = {
    campaign: { name: 'C' }, gridPreset: {}, locations: [],
    telegramToken: '123:SEGRETO', settings: { botToken: '123:SEGRETO' } // se mai finissero in state
  };
  const pack = tar.pack();
  const chunks = [];
  pack.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => pack.on('end', resolve));
  await exportImport.writeBackupArchive(pack, state, dir, dir);
  await done;
  assert.ok(!Buffer.concat(chunks).toString('utf8').includes('SEGRETO'));
});
```

Se `writeBackupArchive` non chiude il pack da sé, aggiungere `pack.finalize()` dopo l'`await` (verificare leggendo `server/exportImport.js` intorno a `writeBackupArchive`: in `server/index.js` viene fatto `pipe(res)` senza finalize esterno, quindi la funzione chiude da sola).

- [ ] **Step 2: Eseguire e verificare**

Run: `node --test server/state.test.js server/export-no-token.test.js`
Expected: `state.test.js` FAIL (settings viene ancora creato da `migrate`); `export-no-token.test.js` PASS già (documenta il comportamento esistente).

- [ ] **Step 3: `server/state.js` — eliminare `settings`**

Sostituire il blocco (righe ~71-80) che crea `state.settings` con:

```js
  // `settings.picsenderUrl` apparteneva all'integrazione PicSender, rimossa:
  // Telegram si configura ora in un file separato (data/telegram.json, vedi
  // telegram-config.js) perché il token non deve finire nello stato condiviso.
  delete state.settings;
```

- [ ] **Step 4: `server/index.js`**

a) Sostituire `const picsender = require('./picsender');` con:

```js
const { createTelegramClient } = require('./telegram');
const { createTelegramConfig } = require('./telegram-config');
const { registerTelegramRoutes, sendStoredMedia } = require('./telegram-routes');
```

b) Dopo `const BACKUPS_DIR = ...` aggiungere:

```js
const telegramConfig = createTelegramConfig(path.join(DATA_DIR, 'telegram.json'));
const telegramClient = createTelegramClient();
```

c) `POST /api/settings` diventa:

```js
app.post('/api/settings', (req, res) => {
  const { campaignName } = req.body;
  if (!state.campaign) state.campaign = { name: '' };
  if (typeof campaignName === 'string') state.campaign.name = campaignName.trim();
  saveState(state);
  broadcastState();
  res.json({ ok: true });
});
```

d) Eliminare l'intera route `app.get('/api/telegram/destinations', ...)` (la sostituisce la registrazione sotto) e subito dopo `app.use(express.json());` non serve altro: aggiungere, nello stesso punto in cui c'era la vecchia route:

```js
registerTelegramRoutes(app, { config: telegramConfig, client: telegramClient });
```

e) Nel handler `image:sendTelegram` eliminare il blocco `if (isVideoFile(image.file)) {...}` e sostituire la chiamata:

```js
    const result = await sendStoredMedia({
      config: telegramConfig,
      client: telegramClient,
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
    socket.emit('telegram:sendResult', { imageId, ok: result.ok, error: result.error });
```

f) Controllare se `isVideoFile` è ancora usato altrove in `server/index.js` (`grep -n isVideoFile server/index.js`); se non lo è, toglierlo dall'import di `../public/shared/media.js`.

- [ ] **Step 5: Eliminare `server/picsender.js`**

```bash
git rm server/picsender.js
grep -rn "picsender" server editor-app/src public --include=*.js --include=*.ts --include=*.tsx --include=*.html -il | grep -v "public/\(control\|editor\|party\)/assets"
```

Expected: restano solo `public/opzioni/*` (Task 6). Se ne compaiono altri, sistemarli.

- [ ] **Step 6: Eseguire tutti i test e avviare il server su dati di prova**

Run: `npm run test:server`
Expected: tutto PASS.

Run (in un terminale, poi fermarlo):

```bash
DATA_DIR=$(mktemp -d) STORAGE_DIR=$(mktemp -d) PORT=3100 node server/index.js &
sleep 1
curl -s localhost:3100/api/telegram/config
curl -s localhost:3100/api/telegram/destinations
curl -s localhost:3100/api/state | grep -c -i "token\|settings"
kill %1
```

Expected: `{"tokenSet":false,"botUsername":"","destinations":[]}`, `[]`, e `0`.

- [ ] **Step 7: Commit**

```bash
git add -A server
git commit -m "feat(telegram): server collegato al client nativo, PicSender rimosso

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Video inviabili da Media (`/control` e `/editor`)

**Files:**
- Modify: `editor-app/src/control/tabs/ImagesTab.tsx` (righe 25, 61-98, 110-122)
- Modify: `editor-app/src/sidebar/ImagePanel.tsx` (riga 80)
- Test: `editor-app/src/control/tabs/images-audio.test.tsx` (righe 178-190)
- Rebuild: `public/control/`, `public/editor/`

**Interfaces:**
- Consumes: nulla di nuovo (eventi socket invariati).

- [ ] **Step 1: Invertire il test dei video (fallisce)**

In `images-audio.test.tsx` sostituire il blocco `describe('ImagesTab con video', ...)` con:

```tsx
describe('ImagesTab con video', () => {
  it('miniatura <video>; il dettaglio ha didascalia, destinazione e Invia come per le foto', () => {
    setServer({}, [loc('L1', [{ id: 'V1', name: 'N-V1', file: 'V1.mp4', telegramDestination: 'Gruppo' }])]);
    render(<ImagesTab />);
    const thumb = screen.getByText('N-V1').closest('button')!;
    expect(thumb.querySelector('video')).toBeTruthy();
    click(thumb);
    expect(screen.getByText('Didascalia')).toBeTruthy();
    expect(screen.getByLabelText('Destinazione Telegram')).toBeTruthy();
    click(screen.getByText('Invia'));
    expect(emitsOf('image:sendTelegram')).toEqual([['image:sendTelegram', { locationId: 'L1', imageId: 'V1' }]]);
    click(screen.getByText('Mostra'));
    expect(emitsOf('image:show')).toEqual([['image:show', { imageId: 'V1' }]]);
  });
});
```

(`dest` e `emitsOf` sono già definiti in cima al file; `dest.value` deve contenere `{ name: 'Gruppo' }` come negli altri test — verificare il valore di default di `dest` all'inizio del file e, se serve, impostarlo nel test come fanno i test sopra.)

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `cd editor-app && npx vitest run src/control/tabs/images-audio.test.tsx`
Expected: FAIL (`Didascalia` non trovato per il video).

- [ ] **Step 3: `ImagesTab.tsx` — togliere i due blocchi `!isVideo`**

Edit 1 — rimuovere l'apertura e la chiusura del primo blocco:

```tsx
          {!isVideo && (
            <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="image-caption-input"
```
diventa
```tsx
          <div className="flex flex-col gap-1">
            <Label htmlFor="image-caption-input"
```
e
```tsx
          </div>
            </>
          )}
          <div className="image-detail-actions flex flex-wrap gap-2">
```
diventa
```tsx
          </div>
          <div className="image-detail-actions flex flex-wrap gap-2">
```

Edit 2 — il pulsante Invia:

```tsx
            {!isVideo && (
            <Button
              type="button" variant="outline" className="h-11 min-w-[100px] flex-1"
              disabled={!image.telegramDestination || pending}
```
diventa
```tsx
            <Button
              type="button" variant="outline" className="h-11 min-w-[100px] flex-1"
              disabled={!image.telegramDestination || pending}
```
e
```tsx
              {pending ? 'Invio…' : 'Invia'}
            </Button>
            )}
```
diventa
```tsx
              {pending ? 'Invio…' : 'Invia'}
            </Button>
```

Edit 3 — la variabile `const isVideo = isVideoFile(image?.file);` (riga 25) non serve più: toglierla e, se `isVideoFile` non è più usato nel file, anche il suo import.

- [ ] **Step 4: `ImagePanel.tsx` — sbloccare didascalia e destinazione**

Riga 80: `{!isVideoFile(img.file) && <div className="flex gap-1">` → `<div className="flex gap-1">` e la chiusura `</div>}` (subito dopo `</Select>`) → `</div>`. `isVideoFile` resta usato alla riga 37 (upload): non togliere l'import.

- [ ] **Step 5: Eseguire tutti i test client e il typecheck**

Run: `cd editor-app && npx vitest run && npx tsc --noEmit -p .`
Expected: tutti PASS, nessun errore di tipo.

- [ ] **Step 6: Ricostruire e committare i bundle**

Run: `npm run build:control && npm run build:editor` (dalla radice).
Expected: build senza errori; `git status` mostra `public/control/` e `public/editor/` cambiati.

- [ ] **Step 7: Commit**

```bash
git add editor-app/src public/control public/editor
git commit -m "feat(media): didascalia, destinazione e Invia anche per i video

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sezione Telegram in `/opzioni`

**Files:**
- Modify: `public/opzioni/index.html` (card "PicSender e campagna", righe 21-47)
- Rewrite: `public/opzioni/opzioni.js`
- Modify: `public/opzioni/opzioni.css`
- Modify: `docs/superpowers/specs/2026-10-14-telegram-native-design.md` (nota sulla privacy mode)

**Interfaces:**
- Consumes: endpoint del Task 3 (`GET/POST/DELETE/PUT /api/telegram/*`), `POST /api/settings` `{campaignName}`, `GET /api/state`, `GET /api/info`.

- [ ] **Step 1: `index.html` — sostituire la card PicSender con due card**

Sostituire l'intera `<section class="card">` che contiene `PicSender e campagna` con:

```html
  <section class="card">
    <h2>Campagna</h2>
    <div class="field">
      <label for="campaign-name-input">Nome campagna</label>
      <input type="text" id="campaign-name-input" placeholder="Nome campagna">
      <p class="hint">Solo informativo: appare nei metadati di export/import.</p>
    </div>
    <div class="card-actions">
      <button id="save-settings-btn" class="btn-accent" disabled>Salva</button>
    </div>
    <p id="settings-status" class="hint" role="status" aria-live="polite" hidden></p>
  </section>

  <section class="card">
    <h2>Telegram</h2>
    <p class="hint">Per inviare foto e video dalla scheda Media di /control. Serve un bot tuo:</p>
    <ol class="hint steps">
      <li>Su Telegram scrivi a <strong>@BotFather</strong>, invia <code>/newbot</code> e copia il token che ti dà.</li>
      <li>Aggiungi il bot al gruppo (nei gruppi con topic, dagli il permesso di scrivere).</li>
      <li>Incolla qui sotto il token, poi aggiungi le destinazioni (puoi usare «Rileva»).</li>
    </ol>

    <div id="token-set" hidden>
      <div class="field">
        <label>Bot</label>
        <p><strong id="bot-name"></strong> <span class="hint">configurato ✓</span></p>
      </div>
      <div class="card-actions">
        <button id="replace-token-btn" type="button">Sostituisci</button>
        <button id="remove-token-btn" type="button">Rimuovi</button>
      </div>
    </div>
    <div id="token-form">
      <div class="field">
        <label for="token-input">Token del bot</label>
        <input type="password" id="token-input" autocomplete="off" placeholder="123456:ABC-DEF...">
      </div>
      <div class="card-actions">
        <button id="save-token-btn" class="btn-accent" type="button">Salva token</button>
        <button id="cancel-token-btn" type="button" hidden>Annulla</button>
      </div>
    </div>
    <p id="token-status" class="hint" role="status" aria-live="polite" hidden></p>

    <div class="field">
      <label>Destinazioni</label>
      <div id="dest-rows" class="dest-rows"></div>
      <p class="hint">«thread_id» serve solo per i gruppi con topic (lascialo vuoto altrimenti).</p>
    </div>
    <div class="card-actions">
      <button id="add-dest-btn" type="button">Aggiungi destinazione</button>
      <button id="detect-btn" type="button">Rileva</button>
      <button id="save-dest-btn" class="btn-accent" type="button">Salva destinazioni</button>
    </div>
    <p class="hint">Per «Rileva»: scrivi nel gruppo o nel topic che vuoi usare un messaggio che <strong>menziona il bot</strong> (es. «@nomebot ciao»), poi premi il pulsante. I bot con la privacy attiva non vedono gli altri messaggi dei gruppi.</p>
    <div id="detect-results" class="dest-rows" hidden></div>
    <p id="dest-status" class="hint" role="status" aria-live="polite" hidden></p>
  </section>
```

- [ ] **Step 2: `opzioni.css` — stili minimi**

Cambiare la regola `input[type="text"] {` in `input[type="text"], input[type="password"] {` e aggiungere in fondo:

```css
.steps {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dest-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dest-row {
  display: grid;
  grid-template-columns: 1.4fr 1.4fr 0.8fr auto auto;
  gap: 6px;
  align-items: center;
}

.dest-row.invalid input {
  border-color: var(--danger-border);
}

.dest-row button {
  padding: 0 10px;
}

.detect-item {
  height: auto;
  min-height: 36px;
  padding: 6px 10px;
  text-align: left;
}

@media (max-width: 560px) {
  .dest-row {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 3: Riscrivere `opzioni.js`**

```js
const campaignNameInput = document.getElementById('campaign-name-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');
const dataDirValue = document.getElementById('data-dir-value');
const storageDirValue = document.getElementById('storage-dir-value');
const versionValue = document.getElementById('version-value');

const tokenSet = document.getElementById('token-set');
const tokenForm = document.getElementById('token-form');
const tokenInput = document.getElementById('token-input');
const botName = document.getElementById('bot-name');
const saveTokenBtn = document.getElementById('save-token-btn');
const cancelTokenBtn = document.getElementById('cancel-token-btn');
const replaceTokenBtn = document.getElementById('replace-token-btn');
const removeTokenBtn = document.getElementById('remove-token-btn');
const tokenStatus = document.getElementById('token-status');
const destRows = document.getElementById('dest-rows');
const addDestBtn = document.getElementById('add-dest-btn');
const detectBtn = document.getElementById('detect-btn');
const saveDestBtn = document.getElementById('save-dest-btn');
const detectResults = document.getElementById('detect-results');
const destStatus = document.getElementById('dest-status');

function showStatus(el, kind, text) {
  el.hidden = false;
  el.className = kind ? `hint ${kind}` : 'hint';
  el.textContent = text;
}

// Chiamata JSON con esito uniforme: { ok, data }. Un errore di rete diventa
// ok:false con un messaggio, mai un'eccezione non gestita.
async function api(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, data: { error: 'Errore di rete. Riprova.' } };
  }
}

// --- Campagna -------------------------------------------------------------

fetch('/api/state')
  .then((res) => res.json())
  .then((state) => {
    campaignNameInput.value = (state.campaign && state.campaign.name) || '';
    saveSettingsBtn.disabled = false;
  })
  .catch(() => {
    showStatus(settingsStatus, 'warning', 'Impossibile caricare le impostazioni attuali. Ricarica la pagina.');
  });

fetch('/api/info')
  .then((res) => res.json())
  .then((info) => {
    dataDirValue.textContent = info.dataDir;
    storageDirValue.textContent = info.storageDir;
    versionValue.textContent = `Anime VTT v${info.version}`;
  });

saveSettingsBtn.addEventListener('click', async () => {
  showStatus(settingsStatus, '', 'Salvataggio...');
  const { ok } = await api('POST', '/api/settings', { campaignName: campaignNameInput.value });
  showStatus(settingsStatus, ok ? 'success' : 'warning', ok ? 'Impostazioni salvate.' : 'Salvataggio fallito, riprova.');
});

// --- Telegram: bot --------------------------------------------------------

function renderToken(cfg) {
  tokenSet.hidden = !cfg.tokenSet;
  tokenForm.hidden = cfg.tokenSet;
  cancelTokenBtn.hidden = true;
  tokenInput.value = '';
  botName.textContent = cfg.botUsername ? `@${cfg.botUsername}` : 'Bot';
}

replaceTokenBtn.addEventListener('click', () => {
  tokenForm.hidden = false;
  cancelTokenBtn.hidden = false;
  tokenInput.focus();
});
cancelTokenBtn.addEventListener('click', () => {
  tokenForm.hidden = true;
  tokenInput.value = '';
});

saveTokenBtn.addEventListener('click', async () => {
  showStatus(tokenStatus, '', 'Verifica del token...');
  const { ok, data } = await api('POST', '/api/telegram/token', { token: tokenInput.value });
  if (!ok) {
    showStatus(tokenStatus, 'warning', data.error || 'Token non valido.');
    return;
  }
  tokenInput.value = '';
  showStatus(tokenStatus, 'success', `Bot @${data.botUsername} collegato.`);
  loadConfig();
});

removeTokenBtn.addEventListener('click', async () => {
  const { ok } = await api('DELETE', '/api/telegram/token');
  showStatus(tokenStatus, ok ? 'success' : 'warning', ok ? 'Token rimosso.' : 'Rimozione fallita, riprova.');
  loadConfig();
});

// --- Telegram: destinazioni ----------------------------------------------

function addRow(dest) {
  const row = document.createElement('div');
  row.className = 'dest-row';
  const make = (placeholder, value) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value == null ? '' : String(value);
    return input;
  };
  const name = make('Nome (es. Mappe)', dest.name);
  const chatId = make('chat_id (es. -1001234567890)', dest.chatId);
  const threadId = make('thread_id (facoltativo)', dest.threadId);
  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.textContent = 'Prova';
  testBtn.addEventListener('click', async () => {
    showStatus(destStatus, '', 'Invio del messaggio di prova...');
    const { ok, data } = await api('POST', '/api/telegram/test', { name: name.value.trim() });
    showStatus(destStatus, ok ? 'success' : 'warning', ok ? `Messaggio di prova inviato a «${name.value.trim()}».` : data.error);
  });
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'Elimina';
  delBtn.addEventListener('click', () => row.remove());
  row.append(name, chatId, threadId, testBtn, delBtn);
  row._fields = { name, chatId, threadId };
  destRows.appendChild(row);
}

function renderDestinations(list) {
  destRows.replaceChildren();
  list.forEach(addRow);
}

function collectDestinations() {
  return [...destRows.children].map((row) => ({
    name: row._fields.name.value,
    chatId: row._fields.chatId.value,
    threadId: row._fields.threadId.value
  }));
}

addDestBtn.addEventListener('click', () => addRow({}));

saveDestBtn.addEventListener('click', async () => {
  showStatus(destStatus, '', 'Salvataggio...');
  const { ok, data } = await api('PUT', '/api/telegram/destinations', { destinations: collectDestinations() });
  if (!ok) {
    showStatus(destStatus, 'warning', data.error || 'Salvataggio fallito, riprova.');
    return;
  }
  renderDestinations(data.destinations);
  showStatus(destStatus, 'success', 'Destinazioni salvate.');
});

detectBtn.addEventListener('click', async () => {
  showStatus(destStatus, '', 'Ricerca in corso...');
  detectResults.hidden = true;
  const { ok, data } = await api('POST', '/api/telegram/detect');
  if (!ok) {
    showStatus(destStatus, 'warning', data.error || 'Rilevamento fallito.');
    return;
  }
  if (data.chats.length === 0) {
    showStatus(destStatus, 'warning', 'Nessun messaggio recente trovato. Scrivi nel gruppo o nel topic un messaggio che menziona il bot (es. «@nomebot ciao») e riprova.');
    return;
  }
  detectResults.replaceChildren();
  data.chats.forEach((chat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detect-item';
    const topic = chat.threadId == null ? 'chat generale' : `topic ${chat.topicName || chat.threadId}`;
    btn.textContent = `${chat.chatTitle} — ${topic} (chat_id ${chat.chatId}${chat.threadId == null ? '' : `, thread_id ${chat.threadId}`})`;
    btn.addEventListener('click', () => {
      addRow({ name: chat.topicName || chat.chatTitle, chatId: chat.chatId, threadId: chat.threadId });
    });
    detectResults.appendChild(btn);
  });
  detectResults.hidden = false;
  showStatus(destStatus, '', 'Clicca una voce per aggiungerla, poi scegli il nome e salva.');
});

async function loadConfig() {
  const { ok, data } = await api('GET', '/api/telegram/config');
  if (!ok) {
    showStatus(tokenStatus, 'warning', 'Impossibile leggere la configurazione Telegram. Ricarica la pagina.');
    return;
  }
  renderToken(data);
  renderDestinations(data.destinations);
}

loadConfig();
```

- [ ] **Step 4: Verifica nel browser (dati di prova)**

Avviare `DATA_DIR=$(mktemp -d) STORAGE_DIR=$(mktemp -d) PORT=3100 node server/index.js`, aprire `http://localhost:3100/opzioni` con `preview_start`/browser pane e controllare:
1. nessun errore in console; la sezione Telegram compare, Campagna salva ancora il nome;
2. «Salva token» con un token finto mostra l'errore («Token del bot non valido» o «Telegram non raggiungibile» senza rete) e non salva nulla (`curl localhost:3100/api/telegram/config` → `tokenSet:false`);
3. «Aggiungi destinazione» + «Salva destinazioni» con chat_id `abc` mostra l'errore «Riga 1…»; con dati validi salva e dopo reload le righe restano;
4. nessuna richiesta di rete restituisce il token (`read_network_requests`).
Un token reale e l'invio vero NON si verificano qui (richiedono un bot dell'utente): dichiararlo nel riepilogo finale.

- [ ] **Step 5: Spec — nota sulla privacy mode**

In `docs/superpowers/specs/2026-10-14-telegram-native-design.md`, nel punto «Rileva» della sezione «UI di `/opzioni`», aggiungere: «Un bot con privacy mode attiva (default) vede nei gruppi solo comandi e menzioni: l'istruzione chiede quindi di scrivere un messaggio che menziona il bot.»

- [ ] **Step 6: Commit**

```bash
git add public/opzioni docs/superpowers/specs/2026-10-14-telegram-native-design.md
git commit -m "feat(opzioni): sezione Telegram (token, destinazioni, rileva, prova invio)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentazione e verifica finale

**Files:**
- Modify: `README.md` (righe ~41-42, ~148-158, ~180-181, ~274-276), `.env.example`, `CLAUDE.md`

- [ ] **Step 1: `.env.example`**

Eliminare le righe da `# PICSENDER_URL: ...` a `PICSENDER_URL=` (6 righe). Restano `PORT`, `DATA_DIR`, `STORAGE_DIR`.

- [ ] **Step 2: `README.md`**

- Riga ~41: «qui configuri l'URL di PicSender e il nome della campagna» → «qui colleghi il bot di Telegram (token e destinazioni) e imposti il nome della campagna, senza dover toccare file a mano.»
- Eliminare il paragrafo `- \`PICSENDER_URL=\` — ...` (righe ~148-158).
- Riga ~180: «per configurare l'URL di PicSender e il nome della campagna» → «per collegare Telegram e impostare il nome della campagna».
- Aggiungere una sezione «Inviare foto e video su Telegram» (prima di «Metterlo su un Raspberry Pi»): passi BotFather, aggiunta al gruppo, token in `/opzioni`, «Rileva» (menzione del bot per la privacy mode), assegnazione destinazione dalla scheda Media, limite 50 MB, `mp4` H.264 → animazione in loop, altri formati → file. Aggiungere che il token resta in `data/telegram.json`, mai nei backup.
- Riga ~274: lasciare «invio foto su Telegram» → «invio foto e video su Telegram».

- [ ] **Step 3: `CLAUDE.md`**

Aggiungere in cima ai capitoli una sezione «Invio su Telegram nativo (branch `telegram-picsender-integration-ebf803`)» con: decisione (solo Telegram nativo, PicSender rimosso), perché il token sta in `data/telegram.json` e non in `state`, mappa dei file (`server/telegram*.js`), regola metodo/50 MB, e «Non verificato: invio reale su Telegram (foto e video), in particolare un `mp4` come animazione in loop e il ripiego su `sendDocument`; rilevamento con un bot reale e un gruppo con topic».

- [ ] **Step 4: Verifica finale**

Run: `npm run test:server && cd editor-app && npx vitest run && npx tsc --noEmit -p .`
Expected: tutto PASS.

Run: `grep -rniE "picsender" --include=*.js --include=*.ts --include=*.tsx --include=*.html --include=*.md . 2>/dev/null | grep -v node_modules | grep -v "docs/superpowers" | grep -v "public/\(control\|editor\|party\)/assets"`
Expected: nessun riferimento operativo rimasto (restano solo citazioni storiche in `CLAUDE.md`, se presenti).

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example CLAUDE.md
git commit -m "docs: Telegram nativo (README, .env.example, CLAUDE.md)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
