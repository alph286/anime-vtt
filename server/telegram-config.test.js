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
