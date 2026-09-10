# Pagina Opzioni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/opzioni` page reachable from `/editor` that lets the user configure the PicSender URL and campaign name without hand-editing files, shows credits/version, and links to `/control` and `/display`.

**Architecture:** `PICSENDER_URL` moves from `.env`-only into `data/state.json` (`state.settings.picsenderUrl`), migrated once from any existing `.env` value. `server/picsender.js` stops reading `process.env` directly and instead takes the URL as a parameter, sourced by `server/index.js` from `state.settings.picsenderUrl`. Two new HTTP routes are added (`GET /api/info`, `POST /api/settings`); everything else the new page needs is served by the already-existing `GET /api/state` and `GET /api/telegram/destinations`. `/opzioni` is a fourth static page (`public/opzioni/`) using plain `fetch()` — no socket.io, since it doesn't need to stay live-synced with other open screens.

**Tech Stack:** Node.js + Express (existing `server/index.js`), vanilla JS/CSS static page, no build step, no automated test suite (project convention — verification is manual, against an isolated server instance).

**Spec:** [docs/superpowers/specs/2026-09-10-options-page-design.md](../specs/2026-09-10-options-page-design.md)

## Global Constraints

- No new HTTP endpoints beyond `POST /api/settings` and `GET /api/info` — every other value the page needs comes from the already-existing `GET /api/state` and `GET /api/telegram/destinations`.
- `data/state.json` remains the single persistence store. `.env` is never rewritten from code; it is only read once, to seed `state.settings.picsenderUrl` the first time the field doesn't exist yet.
- An empty PicSender URL is valid ("not configured") — no server-side URL format validation.
- Error text shown for PicSender problems must be the exact strings `server/picsender.js` already produces — never invent new wording for the same failure.
- `package.json` version becomes exactly `1.0.0-beta`.
- Credits text is exactly: `Made with love, substances and vibe coding by **Alph286**`, with "Alph286" linked to `https://github.com/alph286`.
- `/opzioni` uses plain `GET`/`POST` `fetch()` calls — no socket.io client on this page.
- Visual style matches the existing dark theme: link `/shared/theme.css` before the page's own stylesheet, reuse its CSS custom properties (`--bg-page`, `--bg-panel`, `--bg-control`, `--border`, `--border-control`, `--text-primary`, `--text-secondary`, `--accent`, `--accent-text`, `--danger`, `--danger-bg`, `--danger-border`, `--danger-text`).

---

### Task 1: `server/state.js` — settings field + migration

**Files:**
- Modify: `server/state.js:17-19` (`DEFAULT_STATE`), `server/state.js:62-66` (`migrate()`)

**Interfaces:**
- Produces: `state.settings.picsenderUrl` (string, `''` when unconfigured) — consumed by Task 3 (`server/index.js` routes) and Task 4 (`public/opzioni/opzioni.js` via `GET /api/state`).

- [ ] **Step 1: Add `settings` to `DEFAULT_STATE`**

In `server/state.js`, the `DEFAULT_STATE` object currently starts:

```js
const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
```

Change it to:

```js
const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  settings: { picsenderUrl: '' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
```

- [ ] **Step 2: Add the migration block**

In `server/state.js`, `migrate()` currently has this block:

```js
  if (state.audioState === undefined) state.audioState = 'stopped';
  if (state.activeAudioTrack === undefined) state.activeAudioTrack = 'main';
  if (state.audioTriggerSeq === undefined) state.audioTriggerSeq = 0;

  (state.locations || []).forEach((location) => {
```

Insert the settings migration between the two, so it reads:

```js
  if (state.audioState === undefined) state.audioState = 'stopped';
  if (state.activeAudioTrack === undefined) state.activeAudioTrack = 'main';
  if (state.audioTriggerSeq === undefined) state.audioTriggerSeq = 0;

  // Prima di questa feature, PICSENDER_URL viveva solo in `.env`. La prima
  // volta che uno state.json non ha ancora `settings`, lo si eredita da lì
  // (se presente) così chi l'aveva già configurato non deve reinserirlo. Una
  // volta che `settings` esiste, non si tocca più: l'utente lo gestisce da
  // /opzioni.
  if (!state.settings) {
    state.settings = { picsenderUrl: process.env.PICSENDER_URL || '' };
  } else if (state.settings.picsenderUrl === undefined) {
    state.settings.picsenderUrl = '';
  }

  (state.locations || []).forEach((location) => {
```

- [ ] **Step 3: Manual verification — one-time `.env` migration**

Run from the repo root:

```bash
rm -rf /tmp/avtt-settings-test && mkdir -p /tmp/avtt-settings-test/data
PICSENDER_URL=http://example-picsender:5000 DATA_DIR=/tmp/avtt-settings-test/data STORAGE_DIR=/tmp/avtt-settings-test/storage PORT=3901 node server/index.js &
sleep 1
curl -s http://localhost:3901/api/state | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log('picsenderUrl:', s.settings.picsenderUrl);})"
kill %1
```

Expected: `picsenderUrl: http://example-picsender:5000`.

Then verify it does NOT get re-seeded from a changed `.env` value once already migrated:

```bash
PICSENDER_URL=http://should-not-appear DATA_DIR=/tmp/avtt-settings-test/data STORAGE_DIR=/tmp/avtt-settings-test/storage PORT=3901 node server/index.js &
sleep 1
curl -s http://localhost:3901/api/state | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log('picsenderUrl:', s.settings.picsenderUrl);})"
kill %1
rm -rf /tmp/avtt-settings-test
```

Expected: still `picsenderUrl: http://example-picsender:5000` (unchanged — migration ran only once).

- [ ] **Step 4: Commit**

```bash
git add server/state.js
git commit -m "feat: add state.settings.picsenderUrl with one-time .env migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `server/picsender.js` — accept URL as a parameter

**Files:**
- Modify: `server/picsender.js` (full file)

**Interfaces:**
- Produces: `getDestinations(url)` → `Promise<Array<{name, index}>>`, throws `Error` with the same messages as before; `sendImage({ url, filePath, caption, destinationName })` → `Promise<{ok: true} | {ok: false, error: string}>` — consumed by Task 3 (`server/index.js` call sites).
- No longer reads `process.env.PICSENDER_URL` anywhere in this file.

- [ ] **Step 1: Replace the file**

Replace the full contents of `server/picsender.js` with:

```js
// Integrazione con PicSender (app Flask separata, già in produzione sul
// Raspberry Pi) via la sua API HTTP esistente — nessuna modifica a PicSender.
// PicSender resta solo un tramite verso Telegram: ogni invio carica una copia
// temporanea, la invia, poi la cancella subito (vedi sendImage). Le foto di
// anime-vtt non vengono mai toccate da questo modulo.
//
// L'URL di PicSender non vive più in process.env: arriva come parametro da
// chi chiama (server/index.js lo legge da state.settings.picsenderUrl), così
// questo modulo resta puro e testabile senza dover impostare variabili
// d'ambiente.

const fs = require('fs');
const path = require('path');

function baseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function getDestinations(url) {
  const base = baseUrl(url);
  if (!base) throw new Error('PICSENDER_URL non configurato');
  let res;
  try {
    res = await fetch(`${base}/api/destinations`);
  } catch (err) {
    throw new Error(`PicSender non raggiungibile: ${err.message}`);
  }
  if (!res.ok) throw new Error(`PicSender ha risposto ${res.status}`);
  return res.json();
}

async function uploadToPicsender(base, filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('images', new Blob([buffer]), path.basename(filePath));
  const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Caricamento su PicSender fallito (${res.status})`);
  const body = await res.json();
  const saved = body.saved && body.saved[0];
  if (!saved) throw new Error('PicSender non ha accettato il file (formato non valido?)');
  return saved.id;
}

async function sendViaPicsender(base, picsenderId, destinationIndex, caption) {
  const res = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [picsenderId], caption: caption || '', destination: destinationIndex })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Invio PicSender fallito (${res.status})`);
  }
}

async function deleteFromPicsender(base, picsenderId) {
  try {
    const res = await fetch(`${base}/api/images/${picsenderId}`, { method: 'DELETE' });
    if (!res.ok) {
      console.error('Pulizia PicSender fallita (non bloccante): PicSender ha risposto', res.status);
    }
  } catch (err) {
    console.error('Pulizia PicSender fallita (non bloccante):', err.message);
  }
}

async function sendImage({ url, filePath, caption, destinationName }) {
  const base = baseUrl(url);
  if (!base) {
    return { ok: false, error: 'PicSender non configurato (PICSENDER_URL mancante)' };
  }
  if (!destinationName) {
    return { ok: false, error: 'Nessuna destinazione assegnata a questa foto' };
  }
  let destinations;
  try {
    destinations = await getDestinations(url);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!Array.isArray(destinations)) {
    return { ok: false, error: 'PicSender ha risposto con un formato inatteso per le destinazioni' };
  }
  const dest = destinations.find((d) => d.name === destinationName);
  if (!dest) {
    return { ok: false, error: `Destinazione «${destinationName}» non più configurata su PicSender` };
  }
  let picsenderId;
  try {
    picsenderId = await uploadToPicsender(base, filePath);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  try {
    await sendViaPicsender(base, picsenderId, dest.index, caption);
  } catch (err) {
    await deleteFromPicsender(base, picsenderId);
    return { ok: false, error: err.message };
  }
  await deleteFromPicsender(base, picsenderId);
  return { ok: true };
}

module.exports = { getDestinations, sendImage };
```

- [ ] **Step 2: Manual verification — error paths, no live PicSender needed**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
node -e "
const picsender = require('./server/picsender');
(async () => {
  try {
    await picsender.getDestinations('');
    console.log('FAIL: should have thrown');
  } catch (err) {
    console.log('empty url ->', err.message);
  }
  try {
    await picsender.getDestinations('http://127.0.0.1:19999');
    console.log('FAIL: should have thrown');
  } catch (err) {
    console.log('unreachable url ->', err.message);
  }
  const result = await picsender.sendImage({ url: '', filePath: '/tmp/x', caption: '', destinationName: 'x' });
  console.log('sendImage empty url ->', JSON.stringify(result));
})();
"
```

Expected output:
```
empty url -> PICSENDER_URL non configurato
unreachable url -> PicSender non raggiungibile: fetch failed
sendImage empty url -> {"ok":false,"error":"PicSender non configurato (PICSENDER_URL mancante)"}
```

(The exact wording after "fetch failed" may vary slightly by Node version — what matters is the `PicSender non raggiungibile:` prefix.)

- [ ] **Step 3: Commit**

```bash
git add server/picsender.js
git commit -m "refactor: picsender.js takes PicSender URL as a parameter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `server/index.js` + `package.json` — new routes, wiring, version bump

**Files:**
- Modify: `server/index.js:10-13` (requires), `server/index.js:41-51` (static mounts + `GET /'`), `server/index.js:53-55` (`GET /api/state`), `server/index.js:238-245` (`GET /api/telegram/destinations`), `server/index.js:605-618` (`image:sendTelegram` handler)
- Modify: `package.json:3` (`version`)

**Interfaces:**
- Consumes: `state.settings.picsenderUrl` (Task 1), `picsender.getDestinations(url)` / `picsender.sendImage({url, ...})` (Task 2).
- Produces: `GET /api/info` → `{ version: string, dataDir: string, storageDir: string }`; `POST /api/settings` with JSON body `{ picsenderUrl: string, campaignName: string }` → `{ ok: true }`; static route `/opzioni` serving `public/opzioni/` — consumed by Task 4 (`opzioni.js` fetches) and Task 5 (editor header link).

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "0.1.0",
```

to:

```json
  "version": "1.0.0-beta",
```

- [ ] **Step 2: Require `package.json` in `server/index.js`**

Current top of file:

```js
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DEFAULT_AUDIO, DATA_DIR } = require('./state');
const picsender = require('./picsender');
const tar = require('tar-stream');
const exportImport = require('./exportImport');
```

Change to:

```js
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DEFAULT_AUDIO, DATA_DIR } = require('./state');
const picsender = require('./picsender');
const tar = require('tar-stream');
const exportImport = require('./exportImport');
const packageJson = require('../package.json');
```

- [ ] **Step 3: Serve `/opzioni` as a static page**

Current block:

```js
app.use('/display', express.static(path.join(__dirname, '..', 'public', 'display')));
app.use('/control', express.static(path.join(__dirname, '..', 'public', 'control')));
app.use('/editor', express.static(path.join(__dirname, '..', 'public', 'editor')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));
app.use('/home', express.static(path.join(__dirname, '..', 'public', 'home')));
```

Change to:

```js
app.use('/display', express.static(path.join(__dirname, '..', 'public', 'display')));
app.use('/control', express.static(path.join(__dirname, '..', 'public', 'control')));
app.use('/editor', express.static(path.join(__dirname, '..', 'public', 'editor')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));
app.use('/home', express.static(path.join(__dirname, '..', 'public', 'home')));
app.use('/opzioni', express.static(path.join(__dirname, '..', 'public', 'opzioni')));
```

- [ ] **Step 4: Add `GET /api/info` and `POST /api/settings`**

Current:

```js
app.get('/api/state', (req, res) => {
  res.json(state);
});
```

Change to:

```js
app.get('/api/state', (req, res) => {
  res.json(state);
});

app.get('/api/info', (req, res) => {
  res.json({
    version: packageJson.version,
    dataDir: DATA_DIR,
    storageDir: STORAGE_DIR
  });
});

app.post('/api/settings', (req, res) => {
  const { picsenderUrl, campaignName } = req.body;
  state.settings.picsenderUrl = typeof picsenderUrl === 'string' ? picsenderUrl.trim() : '';
  if (!state.campaign) state.campaign = { name: '' };
  if (typeof campaignName === 'string') state.campaign.name = campaignName.trim();
  saveState(state);
  broadcastState();
  res.json({ ok: true });
});
```

- [ ] **Step 5: Wire `state.settings.picsenderUrl` into the two picsender call sites**

Current:

```js
app.get('/api/telegram/destinations', async (req, res) => {
  try {
    const destinations = await picsender.getDestinations();
    res.json(destinations);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
```

Change to:

```js
app.get('/api/telegram/destinations', async (req, res) => {
  try {
    const destinations = await picsender.getDestinations(state.settings.picsenderUrl);
    res.json(destinations);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
```

Current:

```js
    const result = await picsender.sendImage({
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
```

Change to:

```js
    const result = await picsender.sendImage({
      url: state.settings.picsenderUrl,
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
```

- [ ] **Step 6: Manual verification — isolated server**

```bash
rm -rf /tmp/avtt-index-test && mkdir -p /tmp/avtt-index-test/data
DATA_DIR=/tmp/avtt-index-test/data STORAGE_DIR=/tmp/avtt-index-test/storage PORT=3902 node server/index.js &
sleep 1

# /api/info returns version + paths
curl -s http://localhost:3902/api/info
echo

# /opzioni is served as a static page (404 for the missing file is fine for now — Task 4 adds it; what matters here is the mount exists and doesn't 404 the whole app)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3902/opzioni/

# POST /api/settings persists both fields
curl -s -X POST http://localhost:3902/api/settings -H "Content-Type: application/json" -d '{"picsenderUrl":"http://test:5000","campaignName":"Prova"}'
echo
curl -s http://localhost:3902/api/state | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log(s.settings.picsenderUrl, s.campaign.name);})"

# empty picsenderUrl is accepted, not rejected
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3902/api/settings -H "Content-Type: application/json" -d '{"picsenderUrl":"","campaignName":"Prova"}'

# /api/telegram/destinations now reads the URL from state (expect a 502 with "PicSender non raggiungibile" since nothing is listening at test:5000, or "PICSENDER_URL non configurato" after the empty-URL save above)
curl -s http://localhost:3902/api/telegram/destinations
echo

kill %1
rm -rf /tmp/avtt-index-test
```

Expected: `/api/info` returns `{"version":"1.0.0-beta","dataDir":"/tmp/avtt-index-test/data","storageDir":"/tmp/avtt-index-test/storage"}`; the `/opzioni/` request returns a `404` (no `index.html` there yet — that's Task 4, and Express's static middleware 404ing on a missing file is expected, not an app crash); the settings POST echoes `{"ok":true}` and the state readback prints `http://test:5000 Prova`; the empty-URL POST also returns `200`; the destinations call reflects whichever URL was last saved.

- [ ] **Step 7: Manual verification — end-to-end Telegram send still works after the refactor**

This is the one existing feature this task's edits can silently break (`sendImage`'s call site changed shape). Verify it for real, against a stub PicSender (no dependency on the real Flask app being up), using `socket.io-client` installed one-off (`--no-save`, not a project dependency):

```bash
rm -rf /tmp/avtt-telegram-test && mkdir -p /tmp/avtt-telegram-test/data
npm install --no-save socket.io-client >/dev/null 2>&1

cat > /tmp/avtt-telegram-test/stub-picsender.js <<'EOF'
const http = require('http');
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/destinations' && req.method === 'GET') {
    return res.end(JSON.stringify([{ name: 'Test Dest', index: 0 }]));
  }
  if (req.url === '/api/upload' && req.method === 'POST') {
    req.resume(); // drain the multipart body, content doesn't matter for this stub
    req.on('end', () => res.end(JSON.stringify({ saved: [{ id: 'stub-id-1' }] })));
    return;
  }
  if (req.url === '/api/send' && req.method === 'POST') {
    req.resume();
    req.on('end', () => res.end(JSON.stringify({ ok: true })));
    return;
  }
  if (req.url.startsWith('/api/images/') && req.method === 'DELETE') {
    res.statusCode = 204;
    return res.end();
  }
  res.statusCode = 404;
  res.end();
}).listen(3911, () => console.log('stub picsender on 3911'));
EOF
node /tmp/avtt-telegram-test/stub-picsender.js &

DATA_DIR=/tmp/avtt-telegram-test/data STORAGE_DIR=/tmp/avtt-telegram-test/storage PORT=3905 node server/index.js &
sleep 1

curl -s -X POST http://localhost:3905/api/settings -H "Content-Type: application/json" -d '{"picsenderUrl":"http://localhost:3911","campaignName":"Prova"}' >/dev/null

# Upload a 1x1 PNG as the test image, into the default "taverna" location
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/avtt-telegram-test/test.png
curl -s -X POST http://localhost:3905/api/upload/image -F "locationId=taverna" -F "file=@/tmp/avtt-telegram-test/test.png" >/dev/null

IMAGE_ID=$(curl -s http://localhost:3905/api/state | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log(s.locations.find(l=>l.id==='taverna').images[0].id);})")

cat > /tmp/avtt-telegram-test/send-test.js <<EOF
const io = require('$(pwd)/node_modules/socket.io-client');
const socket = io('http://localhost:3905');
socket.on('connect', () => {
  socket.emit('image:destination', { locationId: 'taverna', imageId: '$IMAGE_ID', destination: 'Test Dest' });
  setTimeout(() => {
    socket.emit('image:sendTelegram', { locationId: 'taverna', imageId: '$IMAGE_ID' });
  }, 200);
});
socket.on('telegram:sendResult', (result) => {
  console.log('sendResult:', JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
EOF
node /tmp/avtt-telegram-test/send-test.js
echo "exit code: $?"

kill %1 %2
rm -rf /tmp/avtt-telegram-test
```

Expected: `sendResult: {"ok":true}` and `exit code: 0` — proving `state.settings.picsenderUrl` reaches `picsender.sendImage` correctly through the real socket handler, end to end, exactly as a real Telegram send would (minus the stubbed PicSender/Telegram backend, which is out of scope for this app).

- [ ] **Step 8: Commit**

```bash
git add server/index.js package.json
git commit -m "feat: add GET /api/info and POST /api/settings, wire picsender URL from state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `public/opzioni/` — the Options page

**Files:**
- Create: `public/opzioni/index.html`, `public/opzioni/opzioni.css`, `public/opzioni/opzioni.js`

**Interfaces:**
- Consumes: `GET /api/state` (fields `state.settings.picsenderUrl`, `state.campaign.name` — Task 1), `GET /api/info` (Task 3), `POST /api/settings` (Task 3), `GET /api/telegram/destinations` (Task 3, wraps Task 2).
- Produces: the `/opzioni` page — consumed by Task 5 (editor header link targets it).

- [ ] **Step 1: Create `public/opzioni/index.html`**

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anime VTT — Opzioni</title>
<link rel="stylesheet" href="/shared/theme.css">
<link rel="stylesheet" href="opzioni.css">
</head>
<body>
<svg style="display:none">
  <symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6"/></symbol>
  <symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4 10 14M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></symbol>
</svg>

<header class="topbar">
  <a href="/editor" class="back-link">
    <svg class="icon"><use href="#i-arrow-left"></use></svg>
    Editor
  </a>
  <h1>Opzioni</h1>
</header>

<main>
  <section class="card">
    <h2>PicSender e campagna</h2>

    <div class="field">
      <label for="picsender-url-input">URL PicSender</label>
      <input type="text" id="picsender-url-input" placeholder="http://192.168.1.10:5000">
      <p class="hint">Usato per inviare foto su Telegram dall'editor. Lascia vuoto se non lo usi.</p>
    </div>

    <div class="field">
      <label for="campaign-name-input">Nome campagna</label>
      <input type="text" id="campaign-name-input" placeholder="Nome campagna">
      <p class="hint">Solo informativo: appare nei metadati di export/import.</p>
    </div>

    <div class="card-actions">
      <button id="save-settings-btn" class="btn-accent">Salva</button>
      <button id="test-connection-btn">Testa connessione</button>
    </div>
    <p id="settings-status" class="hint" hidden></p>
    <p id="test-connection-result" class="hint" hidden></p>
  </section>

  <section class="card">
    <h2>Link rapidi</h2>
    <div class="card-actions">
      <a href="/control" target="_blank" rel="noopener" class="btn-accent link-btn">
        <svg class="icon"><use href="#i-external"></use></svg>
        Apri /control
      </a>
      <a href="/display" target="_blank" rel="noopener" class="btn-accent link-btn">
        <svg class="icon"><use href="#i-external"></use></svg>
        Apri /display
      </a>
    </div>
  </section>

  <section class="card">
    <h2>Percorsi di salvataggio</h2>
    <p class="hint">Utili per un backup manuale delle cartelle.</p>
    <div class="path-row">
      <span class="path-label">Dati (state.json)</span>
      <code id="data-dir-value" class="path-value">—</code>
    </div>
    <div class="path-row">
      <span class="path-label">File caricati (mappe, immagini, audio)</span>
      <code id="storage-dir-value" class="path-value">—</code>
    </div>
  </section>

  <footer class="credits">
    <p>Made with love, substances and vibe coding by <a href="https://github.com/alph286" target="_blank" rel="noopener">Alph286</a></p>
    <p id="version-value" class="hint">—</p>
  </footer>
</main>

<script src="opzioni.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/opzioni/opzioni.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}

.topbar h1 {
  font-size: 18px;
  margin: 0;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  text-decoration: none;
  font-size: 14px;
}

.back-link:hover {
  border-color: var(--accent);
}

.icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

main {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card h2 {
  font-size: 15px;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

input[type="text"] {
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  font-size: 14px;
  padding: 0 10px;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.hint.warning {
  color: var(--danger-text);
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  padding: 6px 10px;
}

.hint.success {
  color: var(--accent);
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

button, .link-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
}

button:hover, .link-btn:hover {
  border-color: var(--accent);
}

.btn-accent {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.path-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.path-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.path-value {
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  background: var(--bg-control);
  border: 1px solid var(--border-control);
  border-radius: 6px;
  padding: 6px 10px;
}

.credits {
  text-align: center;
  padding: 12px 0 24px;
}

.credits p {
  margin: 4px 0;
}

.credits a {
  color: var(--accent);
}
```

- [ ] **Step 3: Create `public/opzioni/opzioni.js`**

```js
const picsenderUrlInput = document.getElementById('picsender-url-input');
const campaignNameInput = document.getElementById('campaign-name-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const testConnectionBtn = document.getElementById('test-connection-btn');
const settingsStatus = document.getElementById('settings-status');
const testConnectionResult = document.getElementById('test-connection-result');
const dataDirValue = document.getElementById('data-dir-value');
const storageDirValue = document.getElementById('storage-dir-value');
const versionValue = document.getElementById('version-value');

fetch('/api/state')
  .then((res) => res.json())
  .then((state) => {
    picsenderUrlInput.value = (state.settings && state.settings.picsenderUrl) || '';
    campaignNameInput.value = (state.campaign && state.campaign.name) || '';
  });

fetch('/api/info')
  .then((res) => res.json())
  .then((info) => {
    dataDirValue.textContent = info.dataDir;
    storageDirValue.textContent = info.storageDir;
    versionValue.textContent = `Anime VTT v${info.version}`;
  });

saveSettingsBtn.addEventListener('click', async () => {
  settingsStatus.hidden = false;
  settingsStatus.className = 'hint';
  settingsStatus.textContent = 'Salvataggio...';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picsenderUrl: picsenderUrlInput.value,
        campaignName: campaignNameInput.value
      })
    });
    if (!res.ok) throw new Error(String(res.status));
    settingsStatus.className = 'hint success';
    settingsStatus.textContent = 'Impostazioni salvate.';
  } catch (err) {
    settingsStatus.className = 'hint warning';
    settingsStatus.textContent = 'Salvataggio fallito, riprova.';
  }
});

testConnectionBtn.addEventListener('click', async () => {
  testConnectionResult.hidden = false;
  testConnectionResult.className = 'hint';
  testConnectionResult.textContent = 'Verifica in corso...';
  try {
    const res = await fetch('/api/telegram/destinations');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || String(res.status));
    const count = data.length;
    const noun = count === 1 ? 'destinazione' : 'destinazioni';
    const verb = count === 1 ? 'trovata' : 'trovate';
    testConnectionResult.className = 'hint success';
    testConnectionResult.textContent = `Connesso: ${count} ${noun} ${verb}.`;
  } catch (err) {
    testConnectionResult.className = 'hint warning';
    testConnectionResult.textContent = err.message;
  }
});
```

- [ ] **Step 4: Manual verification — isolated server, browser automation**

```bash
rm -rf /tmp/avtt-opzioni-test && mkdir -p /tmp/avtt-opzioni-test/data
DATA_DIR=/tmp/avtt-opzioni-test/data STORAGE_DIR=/tmp/avtt-opzioni-test/storage PORT=3903 node server/index.js &
sleep 1
```

Then, using the browser preview tools:
1. Navigate to `http://localhost:3903/opzioni`. Verify the URL field is empty (default state) and the campaign name field shows "Anime Salve".
2. Verify "Percorsi di salvataggio" shows `/tmp/avtt-opzioni-test/data` and `/tmp/avtt-opzioni-test/storage`.
3. Verify the footer shows the Alph286 credit (linked to `https://github.com/alph286`) and `Anime VTT v1.0.0-beta`.
4. Type `http://127.0.0.1:19999` into the PicSender URL field and "Prova Campagna" into the campaign name field, click "Salva". Verify the status text becomes "Impostazioni salvate.". Reload the page — verify both fields still show the saved values.
5. Click "Testa connessione". Verify it shows a `PicSender non raggiungibile: ...` message (nothing is listening on port 19999).
6. Clear the PicSender URL field, click "Salva", then click "Testa connessione" again. Verify it now shows `PICSENDER_URL non configurato`.
7. Click "Apri /control" and "Apri /display" — verify each opens in a new tab and `/opzioni` stays open in the original tab.

```bash
kill %1
rm -rf /tmp/avtt-opzioni-test
```

- [ ] **Step 5: Commit**

```bash
git add public/opzioni/
git commit -m "feat: add /opzioni page (PicSender URL, campaign name, credits, quick links)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `/editor` header — gear icon link to `/opzioni`

**Files:**
- Modify: `public/editor/index.html:39-40` (icon pool), `public/editor/index.html:63-73` (header)
- Modify: `public/editor/editor.css:180-192` (`.icon-btn`)

**Interfaces:**
- Consumes: `/opzioni` route (Task 3's static mount, Task 4's page).

- [ ] **Step 1: Add the gear icon symbol**

In `public/editor/index.html`, the icon pool currently ends with:

```html
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7c1.6 0 3 .3 4.2.8M22 12s-1.6 2.8-4.2 4.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></symbol>
</svg>
```

Change to:

```html
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7c1.6 0 3 .3 4.2.8M22 12s-1.6 2.8-4.2 4.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5"/></symbol>
</svg>
```

- [ ] **Step 2: Add the header link**

In `public/editor/index.html`, the header currently ends with:

```html
  <div class="menu-wrap">
    <button id="backup-menu-toggle" class="icon-btn" title="Esporta / importa">
      <svg class="icon"><use href="#i-more"></use></svg>
    </button>
    <div id="backup-menu" class="dropdown-menu" hidden>
      <button id="export-location-btn" class="dropdown-item">Esporta «<span id="export-location-name"></span>»</button>
      <button id="export-backup-btn" class="dropdown-item">Esporta backup completo</button>
      <button id="import-btn" class="dropdown-item">Importa...</button>
    </div>
  </div>
  <input type="file" id="import-file-input" accept=".vttlocation,.vttbackup" hidden>
</header>
```

Change to:

```html
  <div class="menu-wrap">
    <button id="backup-menu-toggle" class="icon-btn" title="Esporta / importa">
      <svg class="icon"><use href="#i-more"></use></svg>
    </button>
    <div id="backup-menu" class="dropdown-menu" hidden>
      <button id="export-location-btn" class="dropdown-item">Esporta «<span id="export-location-name"></span>»</button>
      <button id="export-backup-btn" class="dropdown-item">Esporta backup completo</button>
      <button id="import-btn" class="dropdown-item">Importa...</button>
    </div>
  </div>

  <a href="/opzioni" class="icon-btn" title="Opzioni">
    <svg class="icon"><use href="#i-gear"></use></svg>
  </a>

  <input type="file" id="import-file-input" accept=".vttlocation,.vttbackup" hidden>
</header>
```

- [ ] **Step 3: Make `.icon-btn` link-safe**

In `public/editor/editor.css`, `.icon-btn` currently reads:

```css
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  cursor: pointer;
}
```

Change to (adds `text-decoration: none` so the new `<a class="icon-btn">` doesn't render an underline; every existing usage is a `<button>`, which this has no effect on):

```css
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
}
```

- [ ] **Step 4: Manual verification — isolated server, browser automation**

```bash
rm -rf /tmp/avtt-editor-link-test && mkdir -p /tmp/avtt-editor-link-test/data
DATA_DIR=/tmp/avtt-editor-link-test/data STORAGE_DIR=/tmp/avtt-editor-link-test/storage PORT=3904 node server/index.js &
sleep 1
```

Using the browser preview tools:
1. Navigate to `http://localhost:3904/editor`. Verify a gear icon button appears in the header, to the right of the export/import icon.
2. Click it. Verify the browser navigates to `http://localhost:3904/opzioni` and the page renders correctly.
3. Click "← Editor". Verify it navigates back to `http://localhost:3904/editor`.

```bash
kill %1
rm -rf /tmp/avtt-editor-link-test
```

- [ ] **Step 5: Commit**

```bash
git add public/editor/index.html public/editor/editor.css
git commit -m "feat: add gear icon in editor header linking to /opzioni

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
