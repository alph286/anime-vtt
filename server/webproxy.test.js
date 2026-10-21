const test = require('node:test');
const assert = require('node:assert');
const { normalizeWebUrl, injectBase, handleWebProxy } = require('./webproxy.js');

test('normalizeWebUrl accetta solo http/https e aggiunge lo schema', () => {
  assert.strictEqual(normalizeWebUrl('https://a.it/x'), 'https://a.it/x');
  assert.strictEqual(normalizeWebUrl('192.168.1.5:8080'), 'http://192.168.1.5:8080/');
  assert.strictEqual(normalizeWebUrl('localhost:3000/p'), 'http://localhost:3000/p');
  assert.strictEqual(normalizeWebUrl('javascript:alert(1)'), null);
  assert.strictEqual(normalizeWebUrl('file:///etc/passwd'), null);
  assert.strictEqual(normalizeWebUrl(''), null);
});

test('injectBase inserisce base dopo <head> o in testa', () => {
  assert.match(injectBase('<html><head><title>x</title></head>', 'http://a/'), /<head><meta charset="utf-8"><base href="http:\/\/a\/"><title>/);
  assert.match(injectBase('<p>ciao</p>', 'http://a/'), /^<meta charset="utf-8"><base href="http:\/\/a\/"><p>/);
});

function fakeRes() {
  const r = { code: 200, headers: {}, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.type = (t) => { r.headers.type = t; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

test('handleWebProxy toglie gli header bloccanti e inietta <base>', async () => {
  const fetchImpl = async () => new Response('<head></head><body>ok</body>', {
    headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" }
  });
  const res = fakeRes();
  await handleWebProxy({ query: { url: 'https://example.com/a' } }, res, fetchImpl);
  assert.strictEqual(res.code, 200);
  assert.match(res.body, /<base href=/);
  assert.strictEqual(res.headers['x-frame-options'], undefined);
});

test('handleWebProxy risponde 400 su URL non valido e 502 se irraggiungibile', async () => {
  const bad = fakeRes();
  await handleWebProxy({ query: { url: 'ftp://x' } }, bad);
  assert.strictEqual(bad.code, 400);
  const down = fakeRes();
  await handleWebProxy({ query: { url: 'http://x.invalid' } }, down, async () => { throw new Error('boom'); });
  assert.strictEqual(down.code, 502);
});
