const { test } = require('node:test');
const assert = require('node:assert/strict');
const tar = require('tar-stream');
const os = require('os');
const fs = require('fs');
const path = require('path');
const exportImport = require('./exportImport');

test('il manifest del backup non contiene settings né token Telegram', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const state = {
    campaign: { name: 'C' }, gridPreset: {}, locations: [],
    telegramToken: '123:SEGRETO', settings: { botToken: '123:SEGRETO' } // se mai finissero in state
  };
  const pack = tar.pack();
  const chunks = [];
  pack.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => pack.on('end', resolve));
  await exportImport.writeBackupArchive(pack, state, dir, dir);
  await done;
  assert.ok(!Buffer.concat(chunks).toString('utf8').includes('SEGRETO'));
});
