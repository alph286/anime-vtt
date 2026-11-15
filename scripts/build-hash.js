const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function computeHash(dir) {
  const hash = crypto.createHash('sha256');
  for (const rel of listFiles(dir).sort()) {
    hash.update(rel + '\0');
    hash.update(fs.readFileSync(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { computeHash };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const hashFile = path.join(root, 'public', 'editor-app.build-hash');
  const current = computeHash(path.join(root, 'editor-app'));
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
