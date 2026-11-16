# Manutenzione: PIN del DM, test unico, build allineata, CLAUDE.md corto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proteggere con un PIN le pagine e le azioni del DM, avere un solo `npm test` che controlla anche che le build committate siano allineate ai sorgenti, e ridurre `CLAUDE.md` alle sole regole vive.

**Architecture:** un modulo nuovo `server/auth.js` (cookie firmato dal PIN, guardia HTTP "tutto chiuso tranne un elenco", guardia socket per evento) cablato in tre punti di `server/index.js`, senza toccare i 62 handler. Uno script `scripts/build-hash.js` scrive e verifica un'impronta dei sorgenti di `editor-app/`. `CLAUDE.md` attuale spostato tale e quale in `docs/storia/`.

**Tech Stack:** Node 24, Express 4, socket.io 4, `node:test`, nessuna dipendenza nuova.

**Spec:** nessuna spec separata: questo piano è completo da solo. Le decisioni di progetto sono nella sezione «Decisioni già prese».

## Global Constraints

- Lavora sul branch nuovo `manutenzione-pin-dm` creato da `main`. Niente push.
- Nei commit nessuna riga `Co-Authored-By` né altre righe di attribuzione.
- Nessuna dipendenza npm nuova (né nella radice né in `editor-app/`).
- Non modificare `editor-app/src/**`, `public/shared/**`, `public/display/**`, `public/handout/**`, `server/state.js`, `server/audio.js`.
- In `server/index.js` sono ammesse SOLO le tre modifiche del Task 1, Step 5. Non spostare né riscrivere handler.
- Mai avviare un server sui dati veri: le prove usano la porta 3100 con `DATA_DIR` e `STORAGE_DIR` su cartelle temporanee vuote. Mai aprire `/display` o `/control` sulla porta 3000.
- Senza `DM_PIN` impostato il comportamento deve restare identico a oggi (tutto aperto).
- Testi per l'utente in italiano, senza trattini lunghi.
- Se un passo non dà l'esito atteso scritto qui, fermati e riferisci: non improvvisare una soluzione diversa.

## Decisioni già prese

| Tema | Decisione |
|---|---|
| Dove sta il PIN | variabile `DM_PIN` in `.env`. Vuota o assente = protezione spenta. |
| Cookie | nome `vtt_dm`, valore `sha256('anime-vtt-dm:' + pin)` in esadecimale, `Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`. Niente `Secure` (rete locale in http). Resta valido dopo un riavvio, cambia se cambia il PIN. |
| Percorsi pubblici | esattamente `/`, più i prefissi `/party`, `/display`, `/handout`, `/shared`, `/storage`, `/home`, `/login`, `/api/login`, `/api/webproxy`. Tutto il resto è del DM (anche percorsi che oggi non esistono). |
| Perché `/display` e `/handout` restano aperti | girano in kiosk sul Raspberry, nessuno può digitare un PIN. `/api/webproxy` e `/storage` servono a loro. |
| Richiesta non autorizzata | percorso che inizia con `/api/` → `401 {"error":"PIN del DM richiesto"}`; altrimenti `302` verso `/login/?next=<percorso originale codificato>`. |
| Socket senza cookie valido | passano solo `hello`, `display:viewport`, `audio:status`, `audio:oneshotEnded` e gli eventi che iniziano con `aoe:`. Gli altri vengono scartati in silenzio. Tutti continuano a ricevere `state:update`. |
| Tentativi | 5 PIN sbagliati di fila dallo stesso IP → blocco di 60 secondi (`429`). Un PIN giusto azzera il conto. |
| Impronta della build | un solo file `public/editor-app.build-hash`, scritto solo da `npm run build:all`. |

## Review Focus

1. Percorso sconosciuto o scritto in altro modo (`/EDITOR/`, `/partyx`, `/party/../editor/x`): deve risultare protetto. Test nel Task 1, Step 1.
2. Cookie `vtt_dm` di lunghezza diversa dal token o con caratteri strani: nessuna eccezione, semplicemente non autorizzato. Test nel Task 1, Step 1.
3. `DM_PIN` fatto di soli spazi: protezione spenta, non un PIN vuoto valido. Test nel Task 1, Step 1.
4. `next` della pagina di login che punta fuori dal sito (`//evil.example`, `https://...`): si torna a `/`. Verifica nel Task 1, Step 7.
5. Build di una sola app (`npm run build:control`) senza `build:all`: `npm run check:build` deve fallire con il messaggio che dice cosa fare. Verifica nel Task 2, Step 6.

---

### Task 1: PIN del DM

**Files:**
- Create: `server/auth.js`, `server/auth.test.js`, `public/login/index.html`, `public/login/login.js`
- Modify: `server/index.js` (righe 16, 72, 483 circa e il `server.listen` in fondo), `.env.example`, `README.md`

**Interfaces:**
- Produces: `createAuth({ pin, now })`, `parseCookies(header)`, `isPublicPath(p)`, `isPublicSocketEvent(event)`, `COOKIE_NAME` da `server/auth.js`.

- [ ] **Step 0: branch**

```bash
git switch -c manutenzione-pin-dm
```

- [ ] **Step 1: scrivi i test che falliscono in `server/auth.test.js`**

Stesso stile di `server/telegram-routes.test.js` (Express su porta 0, `fetch`, `afterEach` che chiude il server). L'app di prova si monta così:

```js
const app = express();
app.use(express.json());
const auth = createAuth({ pin, now: () => clock });   // clock: variabile del test, parte da 1000
app.use(auth.httpGuard);
auth.registerRoutes(app);
app.use((req, res) => res.json({ ok: true, path: req.path }));  // qualunque percorso arrivi qui risponde 200
```

Le richieste usano `fetch(url, { redirect: 'manual' })`. Per i percorsi con `..` usa `http.request` di Node con `path` letterale (`fetch` li normalizza).

Test e asserzioni (un `test()` per riga):

| Nome | Asserzione |
|---|---|
| `parseCookies` | `parseCookies('a=1; vtt_dm=abc; b=x=y')` → `{ a:'1', vtt_dm:'abc', b:'x=y' }`; `parseCookies(undefined)` → `{}`; `parseCookies('')` → `{}` |
| `isPublicPath: pubblici` | vero per `/`, `/party`, `/party/`, `/party/assets/a.js`, `/display/`, `/handout/x`, `/shared/media.js`, `/storage/maps/a.png`, `/home/home.css`, `/login/`, `/api/login`, `/api/webproxy` |
| `isPublicPath: protetti` | falso per `/editor/`, `/control/`, `/opzioni/`, `/api/state`, `/api/export/backup`, `/api/telegram/config`, `/partyx`, `/EDITOR/`, `/party/../editor/x`, `/api/loginx`, `/qualcosa-di-nuovo` |
| `isPublicSocketEvent` | vero per `hello`, `display:viewport`, `audio:status`, `audio:oneshotEnded`, `aoe:place`, `aoe:setCast`; falso per `fow:toggle`, `location:delete`, `audio:toggle`, `image:show`, `ping:show`, `view:pan`, `aoe`, `undefined` |
| `senza PIN tutto aperto` | `pin: undefined` e `pin: '   '`: `auth.enabled === false`; `GET /editor/x` → 200; `GET /api/state` → 200 |
| `pagina protetta rimanda al login` | `pin:'1234'`: `GET /editor/x?a=1` → status 302, header `location` = `/login/?next=%2Feditor%2Fx%3Fa%3D1` |
| `api protetta risponde 401` | `GET /api/state` → 401, corpo `{ error: 'PIN del DM richiesto' }` |
| `percorsi pubblici passano` | `GET /`, `/party/x`, `/display/x`, `/api/webproxy?url=x` → 200 |
| `percorso con .. è protetto` | `GET /party/../editor/x` (letterale) → 302 |
| `login sbagliato` | `POST /api/login {pin:'0000'}` → 401 `{ error: 'PIN errato' }`, nessun header `set-cookie` |
| `login giusto` | `POST /api/login {pin:'1234'}` → 200 `{ ok:true }`; `set-cookie` contiene `vtt_dm=`, `HttpOnly`, `SameSite=Lax`, `Max-Age=2592000`, `Path=/`; poi `GET /api/state` con header `Cookie: vtt_dm=<valore>` → 200 |
| `cookie alterato` | `Cookie: vtt_dm=abc` → 401; `Cookie: vtt_dm=` + 64 caratteri `f` → 401; `Cookie: vtt_dm=%E0%A4%A` → 401 (nessun 500) |
| `blocco dopo 5 errori` | 5 `POST /api/login {pin:'0000'}` → 401; la sesta con `{pin:'1234'}` → 429 `{ error: 'Troppi tentativi, riprova tra un minuto' }`; porta `clock` a `1000 + 60001`; `{pin:'1234'}` → 200 |
| `logout` | `POST /api/logout` → 200, `set-cookie` contiene `vtt_dm=;` e `Max-Age=0` |
| `socketGuard senza cookie` | socket finto `{ handshake:{ headers:{} }, data:{}, use(fn){ this.mw = fn; } }`; dopo `auth.socketGuard(s)`: `s.data.dm === false`; `s.mw(['fow:toggle', {}], next)` non chiama `next`; `s.mw(['aoe:move', {}], next)` e `s.mw(['hello', {}], next)` lo chiamano una volta |
| `socketGuard con cookie` | `headers.cookie = 'vtt_dm=' + auth.token`: `s.data.dm === true`; `s.mw(['fow:toggle', {}], next)` chiama `next` |
| `socketGuard senza PIN` | `pin: undefined`: `s.data.dm === true`, ogni evento chiama `next` |

- [ ] **Step 2: verifica che falliscano**

Run: `node --test server/auth.test.js`
Expected: FAIL con `Cannot find module './auth'`

- [ ] **Step 3: implementa `server/auth.js`**

Firme esatte (CommonJS, `module.exports` con tutti e cinque i nomi):

```js
const COOKIE_NAME = 'vtt_dm';
function parseCookies(header)            // -> { [nome]: valore }; split su ';', poi sul PRIMO '='; trim; niente decodeURIComponent
function isPublicPath(p)                 // -> boolean
function isPublicSocketEvent(event)      // -> boolean
function createAuth({ pin, now = Date.now } = {})
// -> { enabled, token, isDm(cookieHeader), httpGuard(req,res,next), registerRoutes(app), socketGuard(socket) }
```

Regole che firme e test non fissano da soli:
- `isPublicPath`: falso se `p` contiene `/..`; vero se `p === '/'`; altrimenti vero solo se per uno dei prefissi vale `p === prefisso || p.startsWith(prefisso + '/')`. Confronto letterale, senza `toLowerCase`.
- `enabled` = `typeof pin === 'string' && pin.trim() !== ''`. Il PIN usato è `pin.trim()`. `token` è `null` se spento.
- `isDm`: `true` se spento. Altrimenti confronta il cookie col token con `crypto.timingSafeEqual` SOLO se le due stringhe hanno la stessa lunghezza (altrimenti `false`): `timingSafeEqual` lancia con lunghezze diverse.
- `httpGuard` decide con `req.path` e, per il redirect, usa `req.originalUrl`.
- Conto degli errori: `Map` con chiave `req.ip`, valore `{ fails, lockedUntil }`. Il controllo del blocco avviene PRIMA di guardare il PIN (un PIN giusto durante il blocco dà comunque 429). Il confronto del PIN accetta solo stringhe (`typeof req.body?.pin === 'string'`), dopo `trim()`.
- Con protezione spenta `POST /api/login` risponde `200 { ok:true }` senza cookie.
- `socketGuard`: imposta `socket.data.dm`, poi `socket.use(([event], next) => { if (socket.data.dm || isPublicSocketEvent(event)) next(); })`.

- [ ] **Step 4: verifica che passino**

Run: `node --test server/auth.test.js`
Expected: tutti i test PASS, 0 fail.

- [ ] **Step 5: cabla in `server/index.js` (solo queste modifiche)**

1. Dopo la riga `const audioModel = require('./audio');` aggiungi `const { createAuth } = require('./auth');`
2. Subito dopo `app.use(express.json());` (riga 72) aggiungi, in quest'ordine:

```js
const auth = createAuth({ pin: process.env.DM_PIN });
app.use(auth.httpGuard);
auth.registerRoutes(app);
app.use('/login', express.static(path.join(__dirname, '..', 'public', 'login')));
```

3. Come PRIMA riga dentro `io.on('connection', (socket) => {` aggiungi `auth.socketGuard(socket);`
4. Dentro il callback di `server.listen`, dopo il `console.log` esistente:

```js
if (!auth.enabled) console.log('DM_PIN non impostato: le pagine del DM sono aperte a chiunque sulla rete.');
```

- [ ] **Step 6: pagina di login**

`public/login/index.html`: stessa testa di `public/home/index.html` (stesso `<link>` a `/shared/theme.css`, stessa lingua e viewport), titolo «PIN del DM», un `<form id="login-form">` con `<input id="pin" type="password" inputmode="numeric" autocomplete="off" autofocus>`, un pulsante «Entra», un `<p id="login-error" hidden>` e `<script src="/login/login.js"></script>`. Stili in un `<style>` nella pagina usando le variabili di `theme.css`; nessun file CSS nuovo.

`public/login/login.js`:
- al submit: `POST /api/login` con `{ pin }`; se `ok` → `location.replace(nextPath())`; altrimenti mostra in `#login-error` il campo `error` della risposta e svuota l'input.
- `nextPath()`: legge `next` dalla query; lo accetta solo se inizia con `/`, NON inizia con `//` e non contiene `\`; altrimenti `/`.

- [ ] **Step 7: prova vera sulla porta 3100 (dati vuoti)**

```bash
T=$(mktemp -d) && mkdir -p "$T/data" "$T/storage"
PORT=3100 DATA_DIR="$T/data" STORAGE_DIR="$T/storage" DM_PIN=1234 node server/index.js &
sleep 1
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/editor/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/export/backup
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/party/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/display/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/login/
curl -s -c "$T/jar" -H 'Content-Type: application/json' -d '{"pin":"1234"}' http://localhost:3100/api/login
curl -s -b "$T/jar" -o /dev/null -w '%{http_code}\n' http://localhost:3100/editor/
```

Expected, in ordine: `302 http://localhost:3100/login/?next=%2Feditor%2F`, `401`, `200`, `200`, `200`, `{"ok":true}`, `200`.

Poi la prova dei socket. Salva questo script nella cartella scratchpad della sessione (non nel repo) ed eseguilo dalla radice del progetto con `node <percorso>`:

```js
const { io } = require('./editor-app/node_modules/socket.io-client');
const crypto = require('crypto');
const token = crypto.createHash('sha256').update('anime-vtt-dm:1234').digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(label, extraHeaders) {
  const s = io('http://localhost:3100', { extraHeaders, transports: ['polling', 'websocket'] });
  let last = null;
  s.on('state:update', (st) => { last = st; });
  await wait(500);
  s.emit('location:create');
  await wait(500);
  console.log(label, 'location:', last.locations.length);
  s.close();
}
(async () => {
  await run('senza cookie', {});
  await run('con cookie', { Cookie: `vtt_dm=${token}` });
})();
```

Expected: `senza cookie location: 0` poi `con cookie location: 1`.

Apri nel browser (Playwright) `http://localhost:3100/login/?next=//evil.example`, inserisci `1234`: deve finire su `http://localhost:3100/`. Poi `http://localhost:3100/party/`: la pagina si carica senza errori in console.

Alla fine: `kill %1` e `rm -rf "$T"`.

- [ ] **Step 8: documentazione**

- `.env.example`: aggiungi in fondo due righe: `# PIN del DM: protegge /editor, /control, /opzioni e le azioni del DM. Vuoto = nessuna protezione.` e `DM_PIN=`
- `README.md`, sezione «5. Crea il file di configurazione»: aggiungi un paragrafo breve che spiega `DM_PIN` (cosa protegge, che `/party`, `/display` e `/handout` restano aperti, che il PIN si chiede una volta ogni 30 giorni per dispositivo, che senza `DM_PIN` è tutto aperto).

- [ ] **Step 9: test completi e commit**

Run: `node --test server/*.test.js public/shared/media.test.js public/shared/audio-fade.test.js`
Expected: 0 fail (i 167 di prima più quelli nuovi).

```bash
git add server/auth.js server/auth.test.js server/index.js public/login .env.example README.md
git commit -m "feat(server): PIN del DM per pagine, API e azioni socket"
```

---

### Task 2: un solo `npm test` e controllo della build

**Files:**
- Create: `scripts/build-hash.js`, `scripts/build-hash.test.js`, `public/editor-app.build-hash` (generato)
- Modify: `package.json` (radice)

**Interfaces:**
- Produces: `computeHash(editorAppDir) -> string` (64 caratteri esadecimali) da `scripts/build-hash.js`; comandi `node scripts/build-hash.js write|check`.

- [ ] **Step 1: test che falliscono in `scripts/build-hash.test.js`**

Ogni test crea una cartella temporanea con `fs.mkdtempSync` e ci scrive dentro file finti.

| Nome | Asserzione |
|---|---|
| `stesso contenuto, stessa impronta` | due cartelle con `src/a.ts` = `x` e `src/b.ts` = `y` → impronte uguali, lunghe 64 |
| `cambia un file, cambia l'impronta` | `src/a.ts` da `x` a `x2` → impronta diversa |
| `rinominare cambia l'impronta` | `src/a.ts` rinominato `src/c.ts` → impronta diversa |
| `file di test ignorati` | aggiungere `src/a.test.ts` e `src/b.test.tsx` → impronta uguale |
| `node_modules e dist ignorati` | aggiungere `node_modules/p/i.js` e `dist/x.js` → impronta uguale |
| `file fuori da src contano` | aggiungere `vite.config.ts` → impronta diversa |

- [ ] **Step 2: verifica che falliscano**

Run: `node --test scripts/build-hash.test.js`
Expected: FAIL con `Cannot find module './build-hash'`

- [ ] **Step 3: implementa `scripts/build-hash.js`**

- `computeHash(dir)`: elenca ricorsivamente tutti i file di `dir`, saltando le cartelle `node_modules` e `dist` e i file che corrispondono a `/\.test\.tsx?$/`; ordina i percorsi relativi (separatore `/`) con il confronto di default di `Array.prototype.sort`; sha256 su, per ogni file, `percorso + '\0'` seguito dal contenuto in byte e da `'\0'`.
- Usato da riga di comando (`require.main === module`), con `dir` = `editor-app` accanto alla cartella `scripts` e file impronta `public/editor-app.build-hash`:
  - `write`: scrive l'impronta più `\n`, stampa `Impronta della build scritta.`
  - `check`: se il file manca o è diverso stampa su stderr `Build non allineata ai sorgenti di editor-app: esegui "npm run build:all" e committa public/.` ed esce con codice 1; altrimenti stampa `Build allineata ai sorgenti.` ed esce con 0.
  - altro argomento: uso su stderr, codice 2.

- [ ] **Step 4: verifica che passino**

Run: `node --test scripts/build-hash.test.js`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: script in `package.json` (radice)**

Sostituisci `build:all` e `test:server` e aggiungi `check:build` e `test`:

```json
"build:all": "npm run build:editor && npm run build:control && npm run build:party && node scripts/build-hash.js write",
"check:build": "node scripts/build-hash.js check",
"test:server": "node --test server/*.test.js scripts/*.test.js public/shared/media.test.js public/shared/audio-fade.test.js",
"test": "npm run test:server && npm --prefix editor-app test && npm run check:build"
```

- [ ] **Step 6: prima impronta e prova del controllo**

```bash
npm run check:build        # atteso: codice 1, messaggio "Build non allineata..."
npm run build:all
npm run check:build        # atteso: "Build allineata ai sorgenti."
git status --short public editor-app
```

Expected per `git status`: nuovo `public/editor-app.build-hash`. Se compaiono anche file modificati sotto `public/editor`, `public/control`, `public/party` o `editor-app/package-lock.json`, non è un errore (la build committata era indietro, o `npm install` ha ritoccato il lock): includili nel commit e scrivilo nel resoconto finale.

Poi la prova del caso 5 di «Review Focus»:

```bash
echo "// prova" >> editor-app/src/main.tsx
npm run check:build        # atteso: codice 1
git checkout editor-app/src/main.tsx
npm run check:build        # atteso: codice 0
```

Se `editor-app/src/main.tsx` non esiste usa un altro file `.ts`/`.tsx` non di test sotto `editor-app/src`.

- [ ] **Step 7: tutto insieme e commit**

Run: `npm test`
Expected: test server 0 fail, Vitest 0 fail, `Build allineata ai sorgenti.`

```bash
git add scripts package.json public editor-app/package-lock.json
git commit -m "chore: npm test unico e controllo che la build sia allineata ai sorgenti"
```

---

### Task 3: pulizia

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1:** aggiungi in fondo a `.gitignore` la riga `.playwright-mcp/`. Verifica: `git status --short` non elenca più `.playwright-mcp/`.

- [ ] **Step 2: commit**

```bash
git add .gitignore
git commit -m "chore: ignora .playwright-mcp"
```

- [ ] **Step 3: branch locali già uniti in `main`**

```bash
git worktree remove .claude/worktrees/audio-development-proposals-664ebb
git branch -d audio-archivio audio-handout claude/audio-development-proposals-664ebb fix-mappe gestione-griglia handout opzioni-redesign
```

Usa solo `-d` minuscolo e `git worktree remove` senza `--force`: se git rifiuta (lavoro non unito o file modificati), lascia quel branch o worktree com'è e scrivilo nel resoconto. Non cancellare branch remoti.

---

### Task 4: `CLAUDE.md` corto

**Files:**
- Create: `docs/storia/claude-md-fino-al-2026-11-11.md`
- Modify: `CLAUDE.md` (riscritto)

- [ ] **Step 1: sposta la cronaca**

```bash
mkdir -p docs/storia
git mv CLAUDE.md docs/storia/claude-md-fino-al-2026-11-11.md
git diff --cached --stat -M     # atteso: un rename al 100%, 0 righe cambiate
```

- [ ] **Step 2: crea il nuovo `CLAUDE.md` con ESATTAMENTE questo contenuto**

```markdown
# Anime VTT (Magnetron)

Display locale di mappe e fog of war per campagne D&D. Il server (Express +
socket.io, `server/`) gira su un Raspberry Pi e serve solo file statici.

La cronaca delle sessioni fino all'11 nov 2026 (decisioni, deviazioni, cose
verificate e non, limiti noti di ogni lavoro) è in
`docs/storia/claude-md-fino-al-2026-11-11.md`: cercala lì prima di toccare una
parte che non conosci. Spec e piani: `docs/superpowers/specs/` e `plans/`.

## Pagine

| Pagina | Cos'è | Codice |
|---|---|---|
| `/editor` | preparazione delle location (DM, mouse) | `editor-app/src/` (React + shadcn) |
| `/control` | regia in sessione (DM, telefono) | `editor-app/src/control/` |
| `/party` | mappa e aree d'effetto per i giocatori | `editor-app/src/party/` (riusa store e componenti di /control, mai copie) |
| `/display` | TV dei giocatori, kiosk sul Raspberry | `public/display/` (vanilla, lasciato così apposta) |
| `/handout` | secondo schermo, ultimo media mostrato | `public/handout/` (vanilla) |
| `/opzioni` | campagna e Telegram | `public/opzioni/` (vanilla) |

`public/shared/media.js`, `shader-effects.js` e `audio-fade.js` sono script
classici (globali, tipi in `editor-app/src/globals.d.ts`): non sono ES module
e non vanno importati.

## Regole di lavoro

- **Branch dedicato** per ogni lavoro, proposto prima di iniziare. Mai su `main`.
- **Mai sui dati veri.** Le prove usano la porta 3100 con `DATA_DIR` e
  `STORAGE_DIR` su una copia o su cartelle vuote.
- **Mai aprire `/display` o `/control` di prova su un server in uso**: il server
  tiene un solo `displayViewport` e un solo `displayAudio` globali, una scheda di
  prova li sovrascrive e sballa la sessione vera. Per leggere lo stato usa un
  client socket in sola lettura.
- **Build committate.** Express serve `public/editor`, `public/control` e
  `public/party` già costruite. Dopo ogni modifica sotto `editor-app/` (o ai
  componenti di /control che /party riusa): `npm run build:all` e commit di
  `public/`. `npm run check:build` fallisce se te ne dimentichi.
- **Test:** `npm test` dalla radice (server con `node --test`, Vitest di
  `editor-app`, controllo della build). Deve essere verde prima di ogni commit.
- **Shader:** niente screenshot per giudicarli; si controlla che compilino e,
  se serve, i pixel con `gl.readPixels` nello stesso frame. Il giudizio visivo
  lo dà Alph dal vivo.
- **Prove a puntatore:** sempre la terna completa pointerdown, move, up, e il
  DOM va riletto a ogni click (le liste si ridisegnano).
- **Cronaca:** a fine lavoro NON allungare questo file. Scrivi decisioni, cose
  verificate e non verificate in `docs/storia/AAAA-MM-GG-<nome>.md`; qui
  aggiungi una riga solo se cambia una regola o una delle sezioni sotto.

## Sicurezza

- **PIN del DM** (`DM_PIN` in `.env`, `server/auth.js`): predisposto ma SPENTO
  (`DM_PIN` vuoto, scelta di Alph: si gioca tra amici). Se lo si accende, senza cookie valido
  sono raggiungibili solo `/`, `/party`, `/display`, `/handout`, `/shared`,
  `/storage`, `/home`, `/login`, `/api/login`, `/api/webproxy`, e sui socket
  solo `hello`, `display:viewport`, `audio:status`, `audio:oneshotEnded` e gli
  eventi `aoe:*`. Una route o un evento nuovo è del DM per default: se deve
  usarlo un giocatore o il display va aggiunto all'elenco in `server/auth.js`.
- **Token Telegram** in `data/telegram.json` (0600, gitignored), mai in `state`:
  `state:update` arriva a ogni client e finisce nei backup.
- `state:update` manda a tutti lo stato intero, zone di fog non rivelate
  comprese: i giocatori su `/party` lo ricevono.

## Stato sul server

- `state` (in `server/index.js`) viene RIASSEGNATO dal ripristino di un backup:
  un modulo che ne tiene un riferimento resta sul vecchio.
- I trascinamenti (pan, AOE, shader) passano da `scheduleSaveAndBroadcast`
  (un salvataggio ogni 60 ms al massimo); il resto salva subito.
- `displayViewport` e `displayAudio` vivono solo in memoria, fuori da `state`.
- Logica audio in `server/audio.js`, Telegram in `server/telegram*.js`,
  export/import in `server/exportImport.js`, migrazioni in `server/state.js`.

## Mai verificato dal vivo (serve Alph)

- Invio reale su Telegram (foto, `mp4` come animazione, ripiego su documento) e
  «Rileva» con un bot vero.
- Ascolto dell'audio: durate dei fade e ducking (`AUDIO_FADE`,
  `AUDIO_DUCK_LEVEL` in `public/shared/audio-fade.js`), più tracce insieme sul
  Raspberry, eco tra `/display` e `/handout`, stato «bloccato dal browser».
- Tocco vero su telefono: pinch a due dita su `/control`, trascinamento su
  `/party`, più telefoni insieme.
- Resa visiva degli shader (ping, scia, aree d'effetto, linea).
- Pagine Web su siti internet reali, video `mp4` su `/handout`, media su una TV.
```

- [ ] **Step 3: verifica**

```bash
wc -l CLAUDE.md                                   # atteso: meno di 120
git show HEAD:CLAUDE.md | diff - docs/storia/claude-md-fino-al-2026-11-11.md && echo IDENTICO
```

Expected: `IDENTICO`.

- [ ] **Step 4: commit**

```bash
git add CLAUDE.md docs/storia
git commit -m "docs: CLAUDE.md ridotto alle regole vive, cronaca in docs/storia"
```

---

## Resoconto finale (da scrivere ad Alph)

Elenca: esito di `npm test`; esiti dello Step 7 del Task 1 (le sette righe di curl e le due dei socket); se `build:all` ha cambiato file sotto `public/` o il lock; branch o worktree che git ha rifiutato di cancellare; qualunque passo saltato o andato diversamente dall'atteso. Non unire in `main`: lo decide Alph.

## Fuori da questo piano

- Spezzare `server/index.js` in moduli: nessun test copre i 62 handler socket e `state` viene riassegnato; prima servono test di caratterizzazione.
- Raggruppare i salvataggi su disco: i trascinamenti sono già limitati a uno ogni 60 ms.
- Attivare il PIN: resta predisposto ma spento (`DM_PIN` vuoto anche sul Raspberry), decisione di Alph del 15 nov 2026 (si gioca solo tra amici). Si accende mettendo `DM_PIN` nel `.env` e riavviando il servizio.
- Cancellare i branch remoti, togliere la riga `PICSENDER_URL` rimasta nel `.env` locale: li fa Alph.
- Tutte le verifiche dal vivo elencate nel nuovo `CLAUDE.md`.
