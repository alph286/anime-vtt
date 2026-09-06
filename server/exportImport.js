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
