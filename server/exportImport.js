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
// Il pack può emettere 'error' in modo asincrono rispetto al pipe (stesso
// principio già applicato alle route di export in Task 1): l'ascoltatore va
// attaccato subito dopo la creazione, prima di .pipe(), così un fallimento a
// metà stream non arriva mai a un throw non gestito che farebbe crashare il
// processo.
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
    pack.on('error', fail);
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
