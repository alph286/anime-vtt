const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKIP_DIRS = new Set(['node_modules', 'dist']);
const TEST_FILE = /\.test\.tsx?$/;

function listFiles(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listFiles(dir, r));
    } else if (entry.isFile() && !TEST_FILE.test(entry.name)) {
      out.push(r);
    }
  }
  return out;
}

function excluded(rel) {
  return rel.split('/').some((p) => SKIP_DIRS.has(p)) || TEST_FILE.test(path.basename(rel));
}

// File tracciati da git sotto `dir` (percorsi relativi a dir). Il contenuto si
// legge dal disco, quindi le modifiche non committate contano; i file ignorati
// da git (cache locali) e quelli non ancora aggiunti no.
function listTrackedFiles(dir) {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z', '--', '.'], { cwd: dir, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = new Error(e.code === 'ENOENT'
      ? 'Serve git per verificare la build: comando git non trovato.'
      : e.status === 128
        ? `Serve un repository git per verificare la build: ${dir} non lo è.`
        : `git ls-files non è riuscito in ${dir}: ${String(e.stderr || e.message).trim()}`);
    err.gitUnavailable = true;
    throw err;
  }
  return out.toString('utf8').split('\0').filter((r) => r && !excluded(r) && fs.existsSync(path.join(dir, r)));
}

function computeHash(dir, files = listFiles(dir)) {
  const hash = crypto.createHash('sha256');
  for (const rel of [...files].sort()) {
    hash.update(rel + '\0');
    hash.update(fs.readFileSync(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { computeHash, listTrackedFiles };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const hashFile = path.join(root, 'public', 'editor-app.build-hash');
  const appDir = path.join(root, 'editor-app');
  let current;
  try {
    current = computeHash(appDir, listTrackedFiles(appDir));
  } catch (e) {
    if (!e.gitUnavailable) throw e;
    console.error(e.message);
    process.exit(2);
  }
  const cmd = process.argv[2];
  if (cmd === 'write') {
    fs.writeFileSync(hashFile, current + '\n');
    console.log('Impronta della build scritta.');
  } else if (cmd === 'check') {
    const saved = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : null;
    if (saved !== current) {
      console.error('Build non allineata ai sorgenti di editor-app: esegui "npm run build:all" e committa public/.');
      process.exit(1);
    }
    console.log('Build allineata ai sorgenti.');
  } else {
    console.error('Uso: node scripts/build-hash.js write|check');
    process.exit(2);
  }
}
