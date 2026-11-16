// Rotte HTTP di esportazione e importazione (location singola e backup).
// Registrate da server/index.js con registerBackupRoutes(app, httpCtx). Lo
// stato si legge con getState() nelle rotte, mai fuori (il ripristino di un
// backup lo riassegna con setState).
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { nanoid } = require('nanoid');
const tar = require('tar-stream');
const exportImport = require('./exportImport');
const { migrate, applyStartupDefault } = require('./state');

function registerBackupRoutes(app, { getState, setState, saveState, broadcastState, deleteUploadedFile, migrateOptions, MAPS_DIR, IMAGES_DIR, IMPORTS_DIR, BACKUPS_DIR }) {
  function resolveImportPath(token) {
    if (!token || typeof token !== 'string') return null;
    const target = path.resolve(IMPORTS_DIR, token);
    if (path.dirname(target) !== path.resolve(IMPORTS_DIR)) return null;
    return target;
  }

  app.get('/api/export/location/:id', (req, res) => {
    const state = getState();
    const location = state.locations.find((l) => l.id === req.params.id);
    if (!location) return res.status(404).json({ error: 'location non trovata' });
    const pack = tar.pack();
    pack.on('error', (err) => { console.error('Export location fallito (pack):', err.message); });
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
    const state = getState();
    const pack = tar.pack();
    pack.on('error', (err) => { console.error('Export backup fallito (pack):', err.message); });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/x-tar');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${date}.vttbackup"`);
    pack.pipe(res);
    exportImport.writeBackupArchive(pack, state, MAPS_DIR, IMAGES_DIR).catch((err) => {
      console.error('Export backup fallito:', err.message);
      res.destroy();
    });
  });

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
        const state = getState();
        state.locations.push(newLocation);
        // Un archivio esportato prima che un campo esistesse (es. map.compass)
        // reintroduce una location "legacy" nello stato vivo: senza migrate()
        // resterebbe senza quel campo -- e quindi coi controlli muti -- fino al
        // prossimo riavvio del server, l'unico momento in cui loadState()
        // ri-esegue la migrazione.
        migrate(state, migrateOptions);
        saveState(state);
        broadcastState();
        res.json({ ok: true, kind: 'location', name: newLocation.name });
      } else if (manifest.kind === 'backup') {
        const current = getState();
        const oldMapFiles = new Set();
        const oldImageFiles = new Set();
        current.locations.forEach((l) => {
          if (l.map.file) oldMapFiles.add(l.map.file);
          (l.images || []).forEach((img) => { if (img.file) oldImageFiles.add(img.file); });
        });

        await exportImport.saveSafetySnapshot(current, MAPS_DIR, IMAGES_DIR, BACKUPS_DIR);
        const restored = await exportImport.applyBackupRestore(filePath, manifest, MAPS_DIR, IMAGES_DIR);

        // Lo stato nuovo va costruito a parte e salvato PRIMA di diventare quello
        // vivo: se saveState fallisce (disco pieno, permessi), `state` -- letto da
        // ogni richiesta -- non è stato toccato, altrimenti il server servirebbe i
        // dati del backup pur avendo risposto errore, e il primo saveState(state)
        // successivo (da un'azione qualunque) renderebbe definitivo un ripristino
        // mai confermato.
        const candidate = { ...getState(), locations: restored.locations, campaign: restored.campaign, gridPreset: restored.gridPreset };
        // Stesso motivo del ramo 'location': un backup più vecchio dei campi
        // aggiunti dopo va migrato subito, non al prossimo riavvio.
        migrate(candidate, migrateOptions);
        applyStartupDefault(candidate);
        saveState(candidate);
        setState(candidate);

        oldMapFiles.forEach((f) => deleteUploadedFile(MAPS_DIR, f));
        oldImageFiles.forEach((f) => deleteUploadedFile(IMAGES_DIR, f));

        broadcastState();
        res.json({ ok: true, kind: 'backup', locationCount: getState().locations.length });
      } else {
        res.status(400).json({ error: `Tipo di file sconosciuto: "${manifest.kind}"` });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
}

module.exports = { registerBackupRoutes };
