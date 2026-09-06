// Integrazione con PicSender (app Flask separata, già in produzione sul
// Raspberry Pi) via la sua API HTTP esistente — nessuna modifica a PicSender.
// PicSender resta solo un tramite verso Telegram: ogni invio carica una copia
// temporanea, la invia, poi la cancella subito (vedi sendImage). Le foto di
// anime-vtt non vengono mai toccate da questo modulo.

const fs = require('fs');
const path = require('path');

function baseUrl() {
  const url = process.env.PICSENDER_URL || '';
  return url.replace(/\/+$/, '');
}

async function getDestinations() {
  const base = baseUrl();
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

async function uploadToPicsender(filePath) {
  const base = baseUrl();
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

async function sendViaPicsender(picsenderId, destinationIndex, caption) {
  const base = baseUrl();
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

// Best-effort: una pulizia fallita non deve mai nascondere l'esito
// dell'invio, che è quello che conta per chi ha premuto "Invia".
async function deleteFromPicsender(picsenderId) {
  try {
    const base = baseUrl();
    await fetch(`${base}/api/images/${picsenderId}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Pulizia PicSender fallita (non bloccante):', err.message);
  }
}

/**
 * Ciclo completo: upload -> risoluzione nome destinazione -> send -> delete
 * (best-effort). Non lancia mai: ogni fallimento diventa { ok: false, error }.
 */
async function sendImage({ filePath, caption, destinationName }) {
  if (!baseUrl()) {
    return { ok: false, error: 'PicSender non configurato (PICSENDER_URL mancante)' };
  }
  if (!destinationName) {
    return { ok: false, error: 'Nessuna destinazione assegnata a questa foto' };
  }

  let destinations;
  try {
    destinations = await getDestinations();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const dest = destinations.find((d) => d.name === destinationName);
  if (!dest) {
    return { ok: false, error: `Destinazione «${destinationName}» non più configurata su PicSender` };
  }

  let picsenderId;
  try {
    picsenderId = await uploadToPicsender(filePath);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  try {
    await sendViaPicsender(picsenderId, dest.index, caption);
  } catch (err) {
    await deleteFromPicsender(picsenderId);
    return { ok: false, error: err.message };
  }

  await deleteFromPicsender(picsenderId);
  return { ok: true };
}

module.exports = { getDestinations, sendImage };
