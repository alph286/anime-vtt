// Integrazione con PicSender (app Flask separata, già in produzione sul
// Raspberry Pi) via la sua API HTTP esistente — nessuna modifica a PicSender.
// PicSender resta solo un tramite verso Telegram: ogni invio carica una copia
// temporanea, la invia, poi la cancella subito (vedi sendImage). Le foto di
// anime-vtt non vengono mai toccate da questo modulo.
//
// L'URL di PicSender non vive più in process.env: arriva come parametro da
// chi chiama (server/index.js lo legge da state.settings.picsenderUrl), così
// questo modulo resta puro e testabile senza dover impostare variabili
// d'ambiente.

const fs = require('fs');
const path = require('path');

function baseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function getDestinations(url) {
  const base = baseUrl(url);
  if (!base) throw new Error('PICSENDER_URL non configurato');
  let res;
  try {
    res = await fetch(`${base}/api/destinations`);
  } catch (err) {
    throw new Error(`PicSender non raggiungibile: ${err.message}`);
  }
  if (!res.ok) throw new Error(`PicSender ha risposto ${res.status}`);
  return res.json();
}

async function uploadToPicsender(base, filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('images', new Blob([buffer]), path.basename(filePath));
  const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Caricamento su PicSender fallito (${res.status})`);
  const body = await res.json();
  const saved = body.saved && body.saved[0];
  if (!saved) throw new Error('PicSender non ha accettato il file (formato non valido?)');
  return saved.id;
}

async function sendViaPicsender(base, picsenderId, destinationIndex, caption) {
  const res = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [picsenderId], caption: caption || '', destination: destinationIndex })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Invio PicSender fallito (${res.status})`);
  }
}

async function deleteFromPicsender(base, picsenderId) {
  try {
    const res = await fetch(`${base}/api/images/${picsenderId}`, { method: 'DELETE' });
    if (!res.ok) {
      console.error('Pulizia PicSender fallita (non bloccante): PicSender ha risposto', res.status);
    }
  } catch (err) {
    console.error('Pulizia PicSender fallita (non bloccante):', err.message);
  }
}

async function sendImage({ url, filePath, caption, destinationName }) {
  const base = baseUrl(url);
  if (!base) {
    return { ok: false, error: 'PicSender non configurato (PICSENDER_URL mancante)' };
  }
  if (!destinationName) {
    return { ok: false, error: 'Nessuna destinazione assegnata a questa foto' };
  }
  let destinations;
  try {
    destinations = await getDestinations(url);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!Array.isArray(destinations)) {
    return { ok: false, error: 'PicSender ha risposto con un formato inatteso per le destinazioni' };
  }
  const dest = destinations.find((d) => d.name === destinationName);
  if (!dest) {
    return { ok: false, error: `Destinazione «${destinationName}» non più configurata su PicSender` };
  }
  let picsenderId;
  try {
    picsenderId = await uploadToPicsender(base, filePath);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  try {
    await sendViaPicsender(base, picsenderId, dest.index, caption);
  } catch (err) {
    await deleteFromPicsender(base, picsenderId);
    return { ok: false, error: err.message };
  }
  await deleteFromPicsender(base, picsenderId);
  return { ok: true };
}

module.exports = { getDestinations, sendImage };
