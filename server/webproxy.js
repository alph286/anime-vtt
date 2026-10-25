// Proxy per gli elementi "Web" dei media: scarica la pagina lato server e non
// inoltra X-Frame-Options / Content-Security-Policy, così il browser la accetta
// dentro un <iframe> anche se il sito originale lo vieta. Le risorse della pagina
// (css, script, immagini) restano caricate direttamente dall'origine tramite <base>.

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15000;

// Accetta solo http/https (mai file:, javascript:, data:). Restituisce l'URL
// normalizzato oppure null.
function normalizeWebUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  // "localhost:3000" sembra uno schema ma non lo è: lo schema vero ha "//" o è uno dei pericolosi.
  if (/^(javascript|data|file|mailto|blob|vbscript):/i.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Inserisce <meta charset> e <base href> subito dopo <head> (o in testa se manca).
function injectBase(html, baseUrl) {
  const tags = `<meta charset="utf-8"><base href="${escapeAttr(baseUrl)}">`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tags + html.slice(head.index + head[0].length);
  return tags + html;
}

function decodeBody(buffer, contentType) {
  const m = /charset=([^;\s]+)/i.exec(contentType || '');
  try {
    return new TextDecoder(m ? m[1].replace(/["']/g, '') : 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function handleWebProxy(req, res, fetchImpl = fetch) {
  const target = normalizeWebUrl(req.query.url);
  if (!target) return res.status(400).type('text/plain').send('URL non valido (solo http/https)');
  try {
    const upstream = await fetchImpl(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AnimeVTT)',
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
      }
    });
    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return res.status(502).type('text/plain').send('Pagina troppo grande');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) return res.status(502).type('text/plain').send('Pagina troppo grande');
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    if (/text\/html|application\/xhtml/i.test(contentType)) {
      res.type('text/html; charset=utf-8').send(injectBase(decodeBody(buffer, contentType), upstream.url || target));
    } else {
      res.type(contentType).send(buffer);
    }
  } catch (err) {
    const reason = err && err.name === 'TimeoutError' ? 'tempo scaduto' : 'sito non raggiungibile';
    res.status(502).type('text/plain').send(`Impossibile caricare la pagina: ${reason}`);
  }
}

module.exports = { normalizeWebUrl, injectBase, handleWebProxy };
