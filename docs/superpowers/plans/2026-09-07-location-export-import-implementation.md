# Export/Import Location e Backup Completo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dall'`/editor`, poter esportare una singola location o un backup completo della campagna come un unico file tar scaricabile, e poterli reimportare (una nuova location aggiunta, o un ripristino completo con copia di sicurezza automatica prima).

**Architecture:** un nuovo modulo server (`server/exportImport.js`) legge/scrive tar in streaming (libreria `tar-stream`) — mai l'intero archivio in memoria, necessario perché le mappe pesano già oggi fino a 40MB l'una. Un `manifest.json` (primo elemento dell'archivio) porta i metadati; i file veri e propri seguono, ognuno con un percorso interno stabile che il manifest referenzia direttamente (quel percorso stringa È il nome dell'elemento tar da estrarre — nessuna lista di file separata da mantenere in sincronia). L'importazione è un flusso a due fasi: `inspect` (legge tutto l'archivio, valida, non scrive nulla) poi, solo dopo conferma esplicita dell'utente, `apply` (scrive davvero).

**Tech Stack:** Node 22, Express, `tar-stream` (nuova dipendenza, streaming puro, nessun binding nativo), stesso resto dello stack del progetto.

## Global Constraints

- Streaming sempre: nessuna funzione di questo piano tiene l'intero archivio (o un intero file mappa) in memoria in una volta sola — si legge/scrive un pezzo alla volta.
- Il tipo di file (`kind: "location" | "backup"`) si legge SEMPRE dal manifest reale dentro l'archivio, mai dall'estensione del nome file o da un valore che arriva dal client.
- Location, immagini e nomi dei file di storage ottengono SEMPRE identificatori nuovi in importazione (mai riusati dall'installazione di origine) — nessuna possibilità di collisione.
- Import di una location: sempre una location NUOVA (mai sovrascrive), non archiviata, non predefinita.
- Import di un backup: (1) copia di sicurezza dello stato attuale salvata su disco PRIMA di qualunque modifica — se fallisce, tutto si ferma; (2) i nuovi file vengono estratti con nomi nuovi PRIMA di cancellare qualunque cosa vecchia; (3) il nuovo `state.json` viene scritto con lo stesso meccanismo atomico (scrivi-temp-poi-rinomina) già in uso; (4) solo a scrittura confermata si cancellano i vecchi file ormai sostituiti.
- Dopo un ripristino, cosa risulta "in onda" (location/immagine attiva) si ricalcola con la stessa logica già usata all'avvio del server (`applyStartupDefault`), mai presa dal backup.
- Nessun `alert()`/`confirm()`/`prompt()` nativo bloccante in nessuna UI di questo piano (vale in tutto il progetto) — errori e conferme sono sempre elementi di pagina.
- Nessuna suite di test automatica in questo progetto: ogni task si verifica manualmente su un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei).

---

### Task 1: Server — export in streaming (modulo + route)

**Files:**
- Create: `server/exportImport.js`
- Modify: `server/index.js` (require, due nuove route GET)
- Modify: `package.json` (nuova dipendenza `tar-stream`, via `npm install`)

**Interfaces:**
- Produces: `server/exportImport.js` esporta `{ writeLocationArchive, writeBackupArchive }`.
  - `writeLocationArchive(pack, location, mapsDir, imagesDir): Promise<void>` — scrive `manifest.json` + i file di UNA location dentro un `pack` (`tar.pack()`) già creato e già collegato (`.pipe(...)`) altrove, poi chiama `pack.finalize()`. Non crea né collega il pack: lo riceve pronto, così chi lo chiama può iniziare a consumarlo (es. `pack.pipe(res)`) prima ancora che la scrittura cominci — necessario per lo streaming vero (altrimenti il buffer interno del pack si riempirebbe scrivendo a vuoto, in attesa di un consumer che non c'è ancora).
  - `writeBackupArchive(pack, state, mapsDir, imagesDir): Promise<void>` — stessa cosa, per TUTTE le location di `state`.
- Consumes: nessuna interfaccia da altri task (è il primo task).

- [ ] **Step 1: Installa la dipendenza**

```bash
npm install tar-stream
```

- [ ] **Step 2: Crea `server/exportImport.js`**

```js
// Export/import di location e backup completi, come archivi tar letti/scritti
// in streaming: mai l'intero archivio (o un intero file mappa) in memoria in
// una volta sola. Il manifest.json (primo elemento dell'archivio) porta i
// metadati; ogni file mappa/immagine ha un percorso interno stabile
// (locations/<indice>/map<ext> o locations/<indice>/image-<indice><ext>) che
// il manifest referenzia direttamente in `map.file`/`images[].file` -- quella
// stringa È il nome dell'elemento tar, nessuna lista separata da mantenere in
// sincronia.

const fs = require('fs');
const path = require('path');
const tar = require('tar-stream');
const { nanoid } = require('nanoid');

function extOf(filename) {
  return path.extname(filename || '');
}

// Metadati di una location per il manifest, senza ancora riscrivere i
// percorsi dei file (lo fa planLocationFiles, che ha bisogno anche
// dell'indice della location per evitare collisioni tra location diverse
// nello stesso backup).
function manifestForLocation(location) {
  return {
    name: location.name,
    map: { ...location.map, polygons: (location.map.polygons || []).map((p) => ({ ...p })) },
    images: (location.images || []).map((img) => ({
      name: img.name || '',
      file: img.file,
      caption: img.caption || '',
      telegramDestination: img.telegramDestination || null
    }))
  };
}

// Assegna i percorsi interni dell'archivio e produce l'elenco dei file reali
// da cui leggere (mai i nomi/percorsi dell'installazione di origine dentro il
// manifest finale: solo il percorso interno).
function planLocationFiles(location, idx, mapsDir, imagesDir) {
  const meta = manifestForLocation(location);
  const files = [];
  if (meta.map.file) {
    const archivePath = `locations/${idx}/map${extOf(meta.map.file)}`;
    files.push({ srcPath: path.join(mapsDir, meta.map.file), archivePath });
    meta.map.file = archivePath;
  }
  meta.images = meta.images.map((img, j) => {
    if (!img.file) return img;
    const archivePath = `locations/${idx}/image-${j}${extOf(img.file)}`;
    files.push({ srcPath: path.join(imagesDir, img.file), archivePath });
    return { ...img, file: archivePath };
  });
  return { meta, files };
}

function writeManifestEntry(pack, manifest) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(manifest, null, 2));
    pack.entry({ name: 'manifest.json', size: buf.length }, buf, (err) => (err ? reject(err) : resolve()));
  });
}

// Streamma UN file dal disco dentro una nuova voce del pack -- mai bufferizzato
// per intero: fs.createReadStream legge e scrive a pezzi, applicando la
// backpressure di tutta la catena fino al consumer finale del pack.
function streamFileIntoPack(pack, srcPath, archivePath) {
  return new Promise((resolve, reject) => {
    fs.stat(srcPath, (err, stat) => {
      if (err) return reject(err);
      const entry = pack.entry({ name: archivePath, size: stat.size }, (err2) => (err2 ? reject(err2) : resolve()));
      fs.createReadStream(srcPath).on('error', reject).pipe(entry);
    });
  });
}

async function writeLocationArchive(pack, location, mapsDir, imagesDir) {
  const { meta, files } = planLocationFiles(location, 0, mapsDir, imagesDir);
  await writeManifestEntry(pack, { kind: 'location', exportedAt: new Date().toISOString(), location: meta });
  for (const f of files) await streamFileIntoPack(pack, f.srcPath, f.archivePath);
  pack.finalize();
}

async function writeBackupArchive(pack, state, mapsDir, imagesDir) {
  const allFiles = [];
  const locations = state.locations.map((location, idx) => {
    const { meta, files } = planLocationFiles(location, idx, mapsDir, imagesDir);
    allFiles.push(...files);
    return { ...meta, archived: Boolean(location.archived), isDefault: Boolean(location.isDefault) };
  });
  const manifest = {
    kind: 'backup',
    exportedAt: new Date().toISOString(),
    campaign: { ...state.campaign },
    gridPreset: { ...state.gridPreset },
    locations
  };
  await writeManifestEntry(pack, manifest);
  for (const f of allFiles) await streamFileIntoPack(pack, f.srcPath, f.archivePath);
  pack.finalize();
}

module.exports = {
  writeLocationArchive,
  writeBackupArchive
};
```

(`extOf`, `manifestForLocation`, `planLocationFiles` restano funzioni interne del file, non esportate: Task 2 le userà come chiamate dirette nello stesso file, non tramite `module.exports`.)

- [ ] **Step 3: Collega il modulo e aggiungi le due route di export in `server/index.js`**

Dopo la riga `const picsender = require('./picsender');` aggiungi:

```js
const tar = require('tar-stream');
const exportImport = require('./exportImport');
```

Poi, in un punto qualunque dopo la definizione di `getActiveLocation()` (es. subito prima di `const app = express();`), aggiungi le due route:

```js
app.get('/api/export/location/:id', (req, res) => {
  const location = state.locations.find((l) => l.id === req.params.id);
  if (!location) return res.status(404).json({ error: 'location non trovata' });
  const pack = tar.pack();
  const safeName = (location.name || 'location').replace(/[^\w\-. ]/g, '').trim() || 'location';
  res.setHeader('Content-Type', 'application/x-tar');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.vttlocation"`);
  pack.pipe(res);
  exportImport.writeLocationArchive(pack, location, MAPS_DIR, IMAGES_DIR).catch((err) => {
    console.error('Export location fallito:', err.message);
    res.destroy();
  });
});

app.get('/api/export/backup', (req, res) => {
  const pack = tar.pack();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/x-tar');
  res.setHeader('Content-Disposition', `attachment; filename="backup-${date}.vttbackup"`);
  pack.pipe(res);
  exportImport.writeBackupArchive(pack, state, MAPS_DIR, IMAGES_DIR).catch((err) => {
    console.error('Export backup fallito:', err.message);
    res.destroy();
  });
});
```

(Nota: qui l'ordine "prima `app.get(...)`, poi `const app = express();`" non ha senso letterale -- inserisci semplicemente le due route in un punto qualunque dopo `const app = express();` e dopo che `app.use(express.json())` e gli altri middleware sono già stati dichiarati, come le altre route esistenti in questo file. `getActiveLocation()`/`MAPS_DIR`/`IMAGES_DIR` sono già definiti più in alto nel file.)

- [ ] **Step 4: Verifica manuale**

Su un server isolato:

```bash
DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PORT=3098 node server/index.js
```

In un altro terminale:
1. `curl http://localhost:3098/api/state | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).locations[0].id))"` per ottenere l'id della location di default (`taverna`).
2. `curl http://localhost:3098/api/export/location/taverna -o /tmp/taverna.vttlocation` — verifica che il download abbia successo e produca un file non vuoto.
3. `tar -tf /tmp/taverna.vttlocation` — deve elencare `manifest.json` e (se la location di default non ha una mappa caricata) nessun altro file; se hai caricato prima una mappa/immagine di prova via `/editor` sullo stesso server di test, deve elencare anche `locations/0/map<ext>`/`locations/0/image-0<ext>`.
4. `tar -xOf /tmp/taverna.vttlocation manifest.json | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).kind)"` → deve stampare `location`.
5. `curl http://localhost:3098/api/export/backup -o /tmp/backup.vttbackup` e ripeti gli stessi controlli (`tar -tf`, `kind` deve essere `backup`, il manifest deve avere `"locations": [...]` con almeno una voce).
6. Ferma il server e cancella `/tmp/anime-vtt-test-data`, `/tmp/anime-vtt-test-storage`, i due file `.vttlocation`/`.vttbackup`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/exportImport.js server/index.js
git commit -m "feat: add streaming tar export for locations and full backups"
```

---

### Task 2: Server — import in streaming (ispezione, conferma, applicazione)

**Files:**
- Modify: `server/exportImport.js` (nuove funzioni)
- Modify: `server/index.js` (nuove directory, sweep all'avvio, tre nuove route POST)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `writeBackupArchive` (Task 1, riusata per la copia di sicurezza pre-ripristino).
- Produces: `server/exportImport.js` esporta in più `{ readManifest, inspectImport, applyLocationImport, applyBackupRestore, saveSafetySnapshot }`.
  - `readManifest(filePath): Promise<object>` — legge SOLO l'elemento `manifest.json` di un tar salvato su disco e lo ritorna già fatto il parse JSON. Lancia se `manifest.json` non è il primo elemento leggibile o non è JSON valido.
  - `inspectImport(filePath): Promise<{kind, summary}>` — legge l'intero archivio (senza scrivere nulla), valida che `kind` sia `"location"` o `"backup"` e che ogni file referenziato dal manifest esista davvero nell'archivio. `summary` è `{locationName, exportedAt}` per `"location"`, `{locationCount, exportedAt, campaignName}` per `"backup"`.
  - `applyLocationImport(filePath, manifest, mapsDir, imagesDir): Promise<object>` — estrae i file di UNA location importata (nomi nuovi) e ritorna l'oggetto location pronto da inserire in `state.locations` (id nuovo, non archiviata, non predefinita). Ripulisce da sé i file già scritti se fallisce a metà.
  - `applyBackupRestore(filePath, manifest, mapsDir, imagesDir): Promise<{locations, campaign, gridPreset}>` — estrae i file di TUTTE le location del backup (nomi nuovi) e ritorna le tre parti pronte da assegnare a `state`. Non tocca né cancella alcun file esistente.
  - `saveSafetySnapshot(state, mapsDir, imagesDir, backupsDir): Promise<string>` — scrive un backup completo dello stato ATTUALE (stesso formato di `writeBackupArchive`) in un file dentro `backupsDir`, ritorna il percorso scritto. Lancia se la scrittura fallisce.

- [ ] **Step 1: Aggiungi le funzioni di lettura/estrazione a `server/exportImport.js`**

Dopo `module.exports = {...}` esistente, sostituiscilo con (aggiungendo le nuove funzioni sopra di esso):

```js
// Legge SOLO l'elemento manifest.json di un tar salvato su disco, senza
// toccare il resto dell'archivio. Usata sia per ispezionare un file appena
// caricato sia, in fase di applicazione, per ridedurre `kind` dal file reale
// invece di fidarsi di un valore che arriva dal client.
function readManifest(filePath) {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let found = false;
    extract.on('entry', (header, stream, next) => {
      if (!found && header.name === 'manifest.json') {
        found = true;
        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('error', reject);
        stream.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(new Error('manifest.json non è JSON valido'));
          }
          next();
        });
        return;
      }
      stream.resume();
      stream.on('error', reject);
      stream.on('end', next);
    });
    extract.on('finish', () => {
      if (!found) reject(new Error('manifest.json non trovato nell\'archivio'));
    });
    extract.on('error', reject);
    fs.createReadStream(filePath).on('error', reject).pipe(extract);
  });
}

function collectExpectedFiles(manifest) {
  const files = new Set();
  const addLocation = (loc) => {
    if (loc.map && loc.map.file) files.add(loc.map.file);
    (loc.images || []).forEach((img) => { if (img.file) files.add(img.file); });
  };
  if (manifest.kind === 'location' && manifest.location) addLocation(manifest.location);
  else if (manifest.kind === 'backup') (manifest.locations || []).forEach(addLocation);
  return files;
}

async function inspectImport(filePath) {
  const manifest = await readManifest(filePath);
  if (manifest.kind !== 'location' && manifest.kind !== 'backup') {
    throw new Error(`Tipo di file sconosciuto: "${manifest.kind}"`);
  }
  const expected = collectExpectedFiles(manifest);
  const seen = new Set();
  await new Promise((resolve, reject) => {
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      seen.add(header.name);
      stream.resume();
      stream.on('error', reject);
      stream.on('end', next);
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
    fs.createReadStream(filePath).on('error', reject).pipe(extract);
  });
  for (const f of expected) {
    if (!seen.has(f)) throw new Error(`File mancante nell'archivio: ${f}`);
  }
  const summary = manifest.kind === 'location'
    ? { locationName: manifest.location.name, exportedAt: manifest.exportedAt }
    : {
        locationCount: (manifest.locations || []).length,
        exportedAt: manifest.exportedAt,
        campaignName: (manifest.campaign && manifest.campaign.name) || null
      };
  return { kind: manifest.kind, summary };
}

// Estrae SOLO gli elementi il cui nome è una chiave di `wanted` (percorso
// interno dell'archivio -> cartella di destinazione), ognuno con un nome
// nuovo generato qui. Ritorna una Map percorso-interno -> nuovo-nome-file.
// Se qualcosa fallisce a metà, cancella i file già scritti prima di rilanciare
// l'errore -- nessun file orfano lasciato da un'estrazione fallita.
async function extractWantedFiles(filePath, wanted) {
  const fileMap = new Map();
  const written = [];
  try {
    await new Promise((resolve, reject) => {
      const extract = tar.extract();
      extract.on('entry', (header, stream, next) => {
        const destDir = wanted.get(header.name);
        if (!destDir) {
          stream.resume();
          stream.on('error', reject);
          stream.on('end', next);
          return;
        }
        const newName = `${nanoid()}${extOf(header.name)}`;
        const out = fs.createWriteStream(path.join(destDir, newName));
        stream.on('error', reject);
        out.on('error', reject);
        stream.pipe(out);
        out.on('finish', () => {
          written.push({ dir: destDir, name: newName });
          fileMap.set(header.name, newName);
          next();
        });
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      fs.createReadStream(filePath).on('error', reject).pipe(extract);
    });
    return fileMap;
  } catch (err) {
    written.forEach(({ dir, name }) => {
      try { fs.unlinkSync(path.join(dir, name)); } catch (_) { /* best effort */ }
    });
    throw err;
  }
}

function rebuildLocationFromManifest(loc, fileMap, { archived, isDefault }) {
  return {
    id: nanoid(),
    name: loc.name || 'Location importata',
    map: {
      ...loc.map,
      file: loc.map.file ? fileMap.get(loc.map.file) : null,
      polygons: (loc.map.polygons || []).map((p) => ({ ...p }))
    },
    images: (loc.images || []).map((img) => ({
      id: nanoid(),
      name: img.name || '',
      file: fileMap.get(img.file),
      caption: img.caption || '',
      telegramDestination: img.telegramDestination || null
    })),
    archived,
    isDefault
  };
}

async function applyLocationImport(filePath, manifest, mapsDir, imagesDir) {
  const loc = manifest.location;
  const wanted = new Map();
  if (loc.map.file) wanted.set(loc.map.file, mapsDir);
  (loc.images || []).forEach((img) => { if (img.file) wanted.set(img.file, imagesDir); });
  const fileMap = await extractWantedFiles(filePath, wanted);
  return rebuildLocationFromManifest(loc, fileMap, { archived: false, isDefault: false });
}

async function applyBackupRestore(filePath, manifest, mapsDir, imagesDir) {
  const wanted = new Map();
  (manifest.locations || []).forEach((loc) => {
    if (loc.map.file) wanted.set(loc.map.file, mapsDir);
    (loc.images || []).forEach((img) => { if (img.file) wanted.set(img.file, imagesDir); });
  });
  const fileMap = await extractWantedFiles(filePath, wanted);
  const locations = (manifest.locations || []).map((loc) =>
    rebuildLocationFromManifest(loc, fileMap, {
      archived: Boolean(loc.archived),
      isDefault: Boolean(loc.isDefault)
    })
  );
  return {
    locations,
    campaign: manifest.campaign || { name: 'Anime Salve' },
    gridPreset: manifest.gridPreset || { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 }
  };
}

// Scrive un backup completo dello stato ATTUALE su un file dentro
// `backupsDir`, come rete di sicurezza prima di un ripristino distruttivo.
// Se questo fallisce, il chiamante deve interrompere subito il ripristino
// senza aver toccato nulla -- ecco perché è chiamata PRIMA di ogni altra
// modifica in applyBackupRestore/nella route che orchestra il ripristino.
function saveSafetySnapshot(state, mapsDir, imagesDir, backupsDir) {
  const filename = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.vttbackup`;
  const dest = path.join(backupsDir, filename);
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const out = fs.createWriteStream(dest);
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      out.destroy();
      reject(err);
    };
    out.on('error', fail);
    out.on('finish', () => {
      if (!settled) {
        settled = true;
        resolve(dest);
      }
    });
    pack.pipe(out);
    writeBackupArchive(pack, state, mapsDir, imagesDir).catch(fail);
  });
}

module.exports = {
  writeLocationArchive,
  writeBackupArchive,
  readManifest,
  inspectImport,
  applyLocationImport,
  applyBackupRestore,
  saveSafetySnapshot
};
```

Il file finale contiene, in quest'ordine: tutte le funzioni di Task 1 (`extOf`, `manifestForLocation`, `planLocationFiles`, `writeManifestEntry`, `streamFileIntoPack`, `writeLocationArchive`, `writeBackupArchive`), invariate, seguite dalle funzioni di questo step (`readManifest`, `collectExpectedFiles`, `inspectImport`, `extractWantedFiles`, `rebuildLocationFromManifest`, `applyLocationImport`, `applyBackupRestore`, `saveSafetySnapshot`), e infine il blocco `module.exports` sopra — che sostituisce per intero quello scritto al Task 1 (rimuovi quello vecchio, resta un solo `module.exports` alla fine del file, con tutte e sette le funzioni pubbliche).

- [ ] **Step 2: Nuove directory, sweep all'avvio e route in `server/index.js`**

Nella destructure di `require('./state')` in cima al file, aggiungi `DATA_DIR`:

```js
const { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DATA_DIR } = require('./state');
```

Dopo la riga `const IMAGES_DIR = path.join(STORAGE_DIR, 'images');` aggiungi:

```js
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
```

Nel blocco esistente:

```js
for (const dir of [MAPS_DIR, IMAGES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
```

aggiungi le due nuove directory:

```js
for (const dir of [MAPS_DIR, IMAGES_DIR, IMPORTS_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Nessun token di importazione in sospeso può essere ancora valido dopo un
// riavvio (vive solo in memoria nel browser che ha caricato il file): ripulisci
// eventuali file temporanei rimasti da una sessione precedente.
fs.readdirSync(IMPORTS_DIR).forEach((f) => {
  try { fs.unlinkSync(path.join(IMPORTS_DIR, f)); } catch (err) { /* best effort */ }
});
```

Dopo la definizione di `deleteUploadedFile` esistente, aggiungi la funzione di validazione del token (stesso principio di sicurezza: un token non deve mai poter riferirsi a un file fuori da `IMPORTS_DIR`):

```js
function resolveImportPath(token) {
  if (!token || typeof token !== 'string') return null;
  const target = path.resolve(IMPORTS_DIR, token);
  if (path.dirname(target) !== path.resolve(IMPORTS_DIR)) return null;
  return target;
}
```

Subito dopo le due route di export aggiunte nel Task 1, aggiungi il multer dedicato e le tre nuove route:

```js
const uploadImportFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMPORTS_DIR),
    filename: (req, file, cb) => cb(null, `${nanoid()}.tar`)
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.post('/api/import/inspect', uploadImportFile.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file mancante' });
  try {
    const result = await exportImport.inspectImport(req.file.path);
    res.json({ token: req.file.filename, kind: result.kind, summary: result.summary });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/import/cancel', (req, res) => {
  const filePath = resolveImportPath(req.body.token);
  if (filePath) fs.unlink(filePath, () => {});
  res.json({ ok: true });
});

app.post('/api/import/apply', async (req, res) => {
  const filePath = resolveImportPath(req.body.token);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Importazione scaduta o non trovata: ricarica il file.' });
  }
  try {
    const manifest = await exportImport.readManifest(filePath);
    if (manifest.kind === 'location') {
      const newLocation = await exportImport.applyLocationImport(filePath, manifest, MAPS_DIR, IMAGES_DIR);
      state.locations.push(newLocation);
      saveState(state);
      broadcastState();
      res.json({ ok: true, kind: 'location', name: newLocation.name });
    } else if (manifest.kind === 'backup') {
      const oldMapFiles = new Set();
      const oldImageFiles = new Set();
      state.locations.forEach((l) => {
        if (l.map.file) oldMapFiles.add(l.map.file);
        (l.images || []).forEach((img) => oldImageFiles.add(img.file));
      });

      await exportImport.saveSafetySnapshot(state, MAPS_DIR, IMAGES_DIR, BACKUPS_DIR);
      const restored = await exportImport.applyBackupRestore(filePath, manifest, MAPS_DIR, IMAGES_DIR);

      state.locations = restored.locations;
      state.campaign = restored.campaign;
      state.gridPreset = restored.gridPreset;
      applyStartupDefault(state);
      saveState(state);

      oldMapFiles.forEach((f) => deleteUploadedFile(MAPS_DIR, f));
      oldImageFiles.forEach((f) => deleteUploadedFile(IMAGES_DIR, f));

      broadcastState();
      res.json({ ok: true, kind: 'backup', locationCount: state.locations.length });
    } else {
      res.status(400).json({ error: `Tipo di file sconosciuto: "${manifest.kind}"` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});
```

`broadcastState`, `saveState`, `applyStartupDefault`, `deleteUploadedFile`, `MAPS_DIR`, `IMAGES_DIR`, `nanoid` sono già definiti/importati più in alto nel file — nessun altro import necessario oltre a `DATA_DIR` aggiunto sopra.

- [ ] **Step 3: Aggiungi le nuove directory a `.gitignore`**

Aggiungi in fondo al file:

```
data/imports/
data/backups/
```

- [ ] **Step 4: Verifica manuale**

Sullo stesso server isolato del Task 1 (`DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PORT=3098 node server/index.js`), con il file `/tmp/taverna.vttlocation` prodotto al Task 1 (ricrealo se l'hai cancellato) e almeno due location nello stato di test (creane una seconda da `/editor` se serve):

1. Ispezione: `curl -F file=@/tmp/taverna.vttlocation http://localhost:3098/api/import/inspect` → deve rispondere con `{"token":"...", "kind":"location", "summary":{"locationName":"Taverna","exportedAt":"..."}}`. Annota il `token`.
2. Applicazione: `curl -X POST -H "Content-Type: application/json" -d "{\"token\":\"<token-dal-passo-1>\"}" http://localhost:3098/api/import/apply` → deve rispondere `{"ok":true,"kind":"location","name":"Taverna"}`. Verifica in `/tmp/anime-vtt-test-data/state.json` che sia comparsa una NUOVA location con `id` diverso da quella originale, `archived:false`, `isDefault:false`, e (se la mappa/immagini di prova erano presenti) i file corrispondenti con nomi nuovi in `/tmp/anime-vtt-test-storage/maps`/`images`.
3. Riprova ad applicare lo STESSO token una seconda volta → deve fallire con l'errore "Importazione scaduta o non trovata" (il file temporaneo è stato cancellato dopo il primo apply riuscito).
4. Backup: ispeziona e applica `/tmp/backup.vttbackup` allo stesso modo. Verifica: in `/tmp/anime-vtt-test-storage`... ops, verifica invece in `/tmp/anime-vtt-test-data/backups/` che sia comparso un file `pre-restore-*.vttbackup` (la copia di sicurezza pre-ripristino); verifica che `state.json` ora contenga ESATTAMENTE le location del backup (non più quelle create ai passi precedenti), con l'ordine e i flag `archived`/`isDefault` del manifest; verifica che i vecchi file mappa/immagine dei test precedenti siano stati cancellati da `storage/maps`/`storage/images` (nessun residuo).
5. Annulla: ispeziona di nuovo `/tmp/taverna.vttlocation` per ottenere un nuovo token, poi `curl -X POST -H "Content-Type: application/json" -d "{\"token\":\"<token>\"}" http://localhost:3098/api/import/cancel` → verifica che il file temporaneo in `/tmp/anime-vtt-test-data/imports/` sia stato cancellato e che un successivo `apply` con lo stesso token fallisca con lo stesso errore del passo 3.
6. File non valido: `echo "non è un tar" > /tmp/invalid.txt && curl -F file=@/tmp/invalid.txt http://localhost:3098/api/import/inspect` → deve rispondere con errore 400 e un messaggio leggibile, nessun crash del server.
7. Riavvia il server (Ctrl+C, poi rilancia lo stesso comando) con un file ancora presente in `/tmp/anime-vtt-test-data/imports/` (creane uno finto con `touch` prima di riavviare, se non ne è rimasto nessuno) → verifica che sparisca allo startup (lo sweep automatico).
8. Ferma il server e cancella tutte le cartelle/file temporanei di test.

- [ ] **Step 5: Commit**

```bash
git add server/exportImport.js server/index.js .gitignore
git commit -m "feat: add streaming tar import with inspect/apply and pre-restore safety snapshot"
```

---

### Task 3: `/editor` — menu esporta/importa

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: `GET /api/export/location/:id`, `GET /api/export/backup`, `POST /api/import/inspect`, `POST /api/import/apply`, `POST /api/import/cancel` (tutte da Task 1/2).
- Produces: nessuna interfaccia per altri task (ultimo task del piano).

- [ ] **Step 1: Aggiungi l'icona e il markup del menu in `public/editor/index.html`**

Dentro il blocco `<svg style="display:none">` (dopo l'ultimo `<symbol>` esistente, `i-sort-az`), aggiungi:

```html
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></symbol>
```

L'attuale `<header class="topbar">`:

```html
<header class="topbar">
  <select id="location-select" class="select-primary"></select>
  <button id="location-create" class="icon-btn" title="Nuova location">
    <svg class="icon"><use href="#i-plus"></use></svg>
  </button>
</header>
```

diventa:

```html
<header class="topbar">
  <select id="location-select" class="select-primary"></select>
  <button id="location-create" class="icon-btn" title="Nuova location">
    <svg class="icon"><use href="#i-plus"></use></svg>
  </button>
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

<p id="import-error" class="hint warning" hidden></p>

<div id="import-confirm" class="import-confirm" hidden>
  <p id="import-confirm-text"></p>
  <div class="import-confirm-actions">
    <button id="import-confirm-yes"></button>
    <button id="import-confirm-no">Annulla</button>
  </div>
</div>
```

- [ ] **Step 2: Aggiungi i riferimenti DOM e lo stato in `public/editor/editor.js`**

Dopo la riga `const locationCreateBtn = document.getElementById('location-create');` aggiungi:

```js
const backupMenuToggle = document.getElementById('backup-menu-toggle');
const backupMenu = document.getElementById('backup-menu');
const exportLocationBtn = document.getElementById('export-location-btn');
const exportLocationName = document.getElementById('export-location-name');
const exportBackupBtn = document.getElementById('export-backup-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const importError = document.getElementById('import-error');
const importConfirm = document.getElementById('import-confirm');
const importConfirmText = document.getElementById('import-confirm-text');
const importConfirmYes = document.getElementById('import-confirm-yes');
const importConfirmNo = document.getElementById('import-confirm-no');
let pendingImportToken = null;
```

- [ ] **Step 3: Aggiorna `render()` per il nome nel menu e lo stato disabilitato**

Nella funzione `render()`, subito dopo la riga `const location = getActiveLocation();` (in cima alla funzione), aggiungi:

```js
  exportLocationBtn.disabled = !location;
  exportLocationName.textContent = location ? location.name : '—';
```

- [ ] **Step 4: Aggiungi la logica del menu e delle azioni in fondo a `editor.js`**

```js
backupMenuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  backupMenu.hidden = !backupMenu.hidden;
});
document.addEventListener('click', () => { backupMenu.hidden = true; });
backupMenu.addEventListener('click', (e) => e.stopPropagation());

exportLocationBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  backupMenu.hidden = true;
  window.location.href = `/api/export/location/${state.activeLocationId}`;
});

exportBackupBtn.addEventListener('click', () => {
  backupMenu.hidden = true;
  window.location.href = '/api/export/backup';
});

importBtn.addEventListener('click', () => {
  backupMenu.hidden = true;
  importFileInput.value = '';
  importFileInput.click();
});

function formatExportDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('it-IT');
  } catch (err) {
    return iso;
  }
}

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  if (!file) return;
  importError.hidden = true;
  importBtn.disabled = true;
  importBtn.textContent = 'Analisi in corso...';
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/import/inspect', { method: 'POST', body: formData });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Importazione fallita');
    pendingImportToken = body.token;
    importConfirm.classList.toggle('danger', body.kind === 'backup');
    if (body.kind === 'location') {
      importConfirmText.textContent = `Importare la location «${body.summary.locationName}», esportata il ${formatExportDate(body.summary.exportedAt)}?`;
      importConfirmYes.textContent = 'Importa';
    } else {
      importConfirmText.textContent = `Questo SOSTITUIRÀ tutte le ${state.locations.length} location attuali con le ${body.summary.locationCount} contenute nel backup, esportato il ${formatExportDate(body.summary.exportedAt)}. Una copia di sicurezza dei dati attuali verrà salvata automaticamente prima.`;
      importConfirmYes.textContent = 'Sostituisci tutto';
    }
    importConfirm.hidden = false;
  } catch (err) {
    importError.textContent = err.message;
    importError.hidden = false;
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = 'Importa...';
  }
});

importConfirmNo.addEventListener('click', () => {
  importConfirm.hidden = true;
  if (pendingImportToken) {
    fetch('/api/import/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pendingImportToken })
    });
  }
  pendingImportToken = null;
});

importConfirmYes.addEventListener('click', async () => {
  const token = pendingImportToken;
  importConfirm.hidden = true;
  pendingImportToken = null;
  try {
    const res = await fetch('/api/import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Importazione fallita');
  } catch (err) {
    importError.textContent = err.message;
    importError.hidden = false;
  }
});
```

- [ ] **Step 5: Aggiungi le classi CSS in `public/editor/editor.css`**

In fondo al file, aggiungi:

```css
.menu-wrap {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.dropdown-item:hover:not(:disabled) {
  background: var(--bg-control);
}

.dropdown-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.import-confirm {
  margin: 0 24px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  font-size: 13px;
}

.import-confirm.danger {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-text);
}

.import-confirm p {
  margin: 0 0 10px;
}

.import-confirm-actions {
  display: flex;
  gap: 8px;
}

.import-confirm.danger #import-confirm-yes {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
```

- [ ] **Step 6: Verifica manuale**

Con un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei come nei task precedenti):
1. Apri `/editor`, clicca "⋮": si apre il menu con le tre voci; clicca altrove: si chiude.
2. "Esporta «Taverna»" scarica un file `.vttlocation`; con nessuna location attiva (se possibile svuotare `activeLocationId` per il test) la voce è disabilitata.
3. "Esporta backup completo" scarica un file `.vttbackup`.
4. "Importa..." su un `.vttlocation` valido: appare il banner "Importare la location «...»..." (stile neutro, non "pericolo"); Annulla non fa nulla; Importa aggiunge davvero una nuova location (verifica che compaia nel menu location in alto).
5. "Importa..." su un `.vttbackup` valido: appare il banner in stile "pericolo" con il testo di avviso corretto; conferma e verifica che TUTTE le location precedenti siano sostituite da quelle del backup.
6. "Importa..." su un file non valido (es. un `.txt` qualunque): compare il messaggio d'errore inline (`#import-error`), nessun banner di conferma, nessun crash.
7. Verifica che in nessun momento compaia un `alert()`/`confirm()` nativo del browser.

- [ ] **Step 7: Commit**

```bash
git add public/editor/index.html public/editor/editor.js public/editor/editor.css
git commit -m "feat: export/import menu in /editor"
```
