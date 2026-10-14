// Client minimale della Bot API di Telegram. Puro: nessuno stato, nessun
// accesso a file di configurazione (il token arriva sempre come parametro) e
// `fetch` iniettabile, così i test non toccano la rete. Nessuna funzione
// lancia mai: ogni fallimento diventa { ok: false, error } con un messaggio
// già pronto da mostrare all'utente.

const fs = require('fs');
const path = require('path');
const { isVideoFile } = require('../public/shared/media.js');

const API_BASE = 'https://api.telegram.org';
// Tetto del Bot API pubblico: oltre, Telegram rifiuta l'upload. Lo controlliamo
// noi per primi, così l'utente non aspetta un upload destinato a fallire.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Telegram mostra come "GIF" (animazione in loop, muta) solo MP4 H.264: gli
// altri formati non sono convertibili senza ffmpeg, quindi vanno come file.
const ANIMATION_EXTENSIONS = ['mp4', 'm4v', 'mov'];
// Errori che dicono "il problema è la destinazione", non il file: ritentare
// con sendDocument sarebbe inutile e nasconderebbe la causa vera.
const DESTINATION_ERROR = /chat not found|message thread not found|not enough rights|have no rights/i;

function describeError(status, data) {
  const d = String((data && data.description) || '');
  if (status === 401) return 'Token del bot non valido';
  if (status === 409) {
    return 'Sul bot è attivo un webhook: finché lo è, Telegram non permette di leggere i messaggi per il rilevamento';
  }
  if (status === 429) {
    const s = data && data.parameters && data.parameters.retry_after;
    return s ? `Troppe richieste a Telegram: riprova tra ${s} secondi` : 'Troppe richieste a Telegram: riprova tra poco';
  }
  if (/message thread not found/i.test(d)) return 'Topic non trovato: controlla il thread_id';
  if (/chat not found/i.test(d)) return 'Chat non trovata: controlla il chat_id e che il bot sia nel gruppo';
  if (status === 403 || /not enough rights|have no rights|bot was kicked/i.test(d)) {
    return 'Il bot non può scrivere in questa chat: non è nel gruppo o non ha il permesso di scrivere';
  }
  return d ? `Telegram: ${d}` : `Telegram ha risposto ${status}`;
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
}

function createTelegramClient({ fetchImpl = fetch } = {}) {
  async function call(token, method, body) {
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/bot${token}/${method}`, body ? { method: 'POST', body } : {});
    } catch (err) {
      // L'URL (e quindi il token) può finire nel messaggio dell'errore di rete.
      const safe = String(err && err.message).split(token).join('***');
      return { ok: false, status: 0, description: '', error: `Telegram non raggiungibile: ${safe}` };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, result: data.result };
    return { ok: false, status: res.status, description: String(data.description || ''), error: describeError(res.status, data) };
  }

  async function getMe(token) {
    const r = await call(token, 'getMe');
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, username: (r.result && r.result.username) || '' };
  }

  function chatFields(form, { chatId, threadId }) {
    form.append('chat_id', String(chatId));
    if (threadId != null) form.append('message_thread_id', String(threadId));
  }

  async function upload(kind, { token, chatId, threadId, filePath, caption }) {
    const method = { photo: 'sendPhoto', animation: 'sendAnimation', document: 'sendDocument' }[kind];
    const form = new FormData();
    chatFields(form, { chatId, threadId });
    if (caption) form.append('caption', caption);
    // openAsBlob legge il file a richiesta: un video da decine di MB non resta
    // tutto in memoria (conta sul Raspberry Pi). Fallback per Node più vecchi.
    const blob = typeof fs.openAsBlob === 'function' ? await fs.openAsBlob(filePath) : new Blob([fs.readFileSync(filePath)]);
    form.append(kind, blob, path.basename(filePath));
    return call(token, method, form);
  }

  async function sendMedia({ token, chatId, threadId, filePath, caption }) {
    let size;
    try {
      size = fs.statSync(filePath).size;
    } catch (err) {
      return { ok: false, error: 'File non trovato sul disco' };
    }
    if (size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `Il file pesa ${formatMb(size)} MB: Telegram accetta fino a 50 MB, comprimilo prima di inviarlo` };
    }
    const ext = path.extname(filePath).slice(1).toLowerCase();
    let kind = 'photo';
    if (isVideoFile(filePath)) kind = ANIMATION_EXTENSIONS.includes(ext) ? 'animation' : 'document';
    const args = { token, chatId, threadId, filePath, caption };

    const first = await upload(kind, args);
    if (first.ok) return { ok: true };
    if (kind !== 'document' && first.status === 400 && !DESTINATION_ERROR.test(first.description)) {
      const second = await upload('document', args);
      return second.ok ? { ok: true } : { ok: false, error: second.error };
    }
    return { ok: false, error: first.error };
  }

  async function sendText({ token, chatId, threadId, text }) {
    const form = new URLSearchParams({ chat_id: String(chatId), text });
    if (threadId != null) form.append('message_thread_id', String(threadId));
    const r = await call(token, 'sendMessage', form);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  // getUpdates SENZA offset: non conferma gli aggiornamenti, quindi non li
  // consuma (restano disponibili per 24h). Mostra solo ciò che il bot ha visto.
  async function detectChats(token) {
    const r = await call(token, 'getUpdates', new URLSearchParams({ limit: '100' }));
    if (!r.ok) return { ok: false, error: r.error };
    const found = new Map();
    const topicNames = new Map();
    for (const u of r.result || []) {
      const m = u.message || u.edited_message || u.channel_post;
      if (!m || !m.chat) continue;
      const chat = m.chat;
      const chatTitle = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id);
      // message_thread_id compare anche nelle semplici risposte di un gruppo
      // senza topic: lo consideriamo un topic solo se Telegram lo dichiara.
      const threadId = m.is_topic_message ? m.message_thread_id : null;
      const topicName = (m.forum_topic_created && m.forum_topic_created.name)
        || (m.reply_to_message && m.reply_to_message.forum_topic_created && m.reply_to_message.forum_topic_created.name)
        || null;
      if (threadId != null && topicName) topicNames.set(`${chat.id}:${threadId}`, topicName);
      const key = `${chat.id}:${threadId == null ? '' : threadId}`;
      if (!found.has(key)) found.set(key, { chatId: chat.id, chatTitle, threadId, topicName: null });
    }
    const chats = [...found.values()].map((c) => ({
      ...c,
      topicName: c.threadId == null ? null : (topicNames.get(`${c.chatId}:${c.threadId}`) || null)
    }));
    return { ok: true, chats };
  }

  return { getMe, sendMedia, sendText, detectChats };
}

module.exports = { createTelegramClient, MAX_UPLOAD_BYTES };
