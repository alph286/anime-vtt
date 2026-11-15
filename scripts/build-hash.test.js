const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeHash } = require('./build-hash');

function mk(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-'));
  for (const [rel, content] of Object.entries(files)) put(dir, rel, content);
  return dir;
}
function put(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const base = () => ({ 'src/a.ts': 'x', 'src/b.ts': 'y' });

test('stesso contenuto, stessa impronta', () => {
  const h1 = computeHash(mk(base()));
  const h2 = computeHash(mk(base()));
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});

test("cambia un file, cambia l'impronta", () => {
  const d = mk(base());
  const before = computeHash(d);
  put(d, 'src/a.ts', 'x2');
  assert.notEqual(computeHash(d), before);
});

test("rinominare cambia l'impronta", () => {
  const d = mk(base());
  const before = computeHash(d);
  fs.renameSync(path.join(d, 'src/a.ts'), path.join(d, 'src/c.ts'));
  assert.notEqual(computeHash(d), before);
});

test('file di test ignorati', () => {
  const d = mk(base());
  const before = computeHash(d);
  put(d, 'src/a.test.ts', 't');
  put(d, 'src/b.test.tsx', 't');
  assert.equal(computeHash(d), before);
});

test('node_modules e dist ignorati', () => {
  const d = mk(base());
  const before = computeHash(d);
  put(d, 'node_modules/p/i.js', 'm');
  put(d, 'dist/x.js', 'd');
  assert.equal(computeHash(d), before);
});

test('file fuori da src contano', () => {
  const d = mk(base());
  const before = computeHash(d);
  put(d, 'vite.config.ts', 'c');
  assert.notEqual(computeHash(d), before);
});
