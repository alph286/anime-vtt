// Configurazione Telegram: bot token + destinazioni, in un file SEPARATO da
// state.json. Il motivo è di sicurezza: `state` viene trasmesso con
// state:update a ogni client (/display, /party, qualunque telefono in rete),
// quindi un token lì dentro sarebbe leggibile da chiunque apra una pagina.
// Questo file resta lato server: nessun endpoint lo restituisce in chiaro, ed
// export/backup (costruiti da `state`) non lo includono.

const fs = require('fs');

const EMPTY = () => ({ botToken: '', botUsername: '', destinations: [] });

function isStoredDestination(d) {
  return d && typeof d === 'object' && typeof d.name === 'string' && typeof d.chatId === 'string';
}

// Valida e normalizza la lista che arriva da /opzioni. Il messaggio indica la
// riga colpevole (numerata da 1, come la vede l'utente).
function validateDestinations(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'Le destinazioni devono essere una lista' };
  const seen = new Set();
  const value = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const n = i + 1;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return { ok: false, error: `Riga ${n}: il nome è obbligatorio` };
    if (seen.has(name)) return { ok: false, error: `Riga ${n}: il nome «${name}» è già usato` };
    seen.add(name);
    const chatId = String(row.chatId == null ? '' : row.chatId).trim();
    if (!/^-?\d+$/.test(chatId)) return { ok: false, error: `Riga ${n}: il chat_id deve essere un numero (anche negativo)` };
    const rawThread = String(row.threadId == null ? '' : row.threadId).trim();
    let threadId = null;
    if (rawThread !== '') {
      if (!/^\d+$/.test(rawThread) || Number(rawThread) < 1) {
        return { ok: false, error: `Riga ${n}: il thread_id deve essere un intero positivo (o vuoto)` };
      }
      threadId = Number(rawThread);
    }
    value.push({ name, chatId, threadId });
  }
  return { ok: true, value };
}

function createTelegramConfig(filePath) {
  function read() {
    try {
      const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        botToken: typeof d.botToken === 'string' ? d.botToken : '',
        botUsername: typeof d.botUsername === 'string' ? d.botUsername : '',
        destinations: Array.isArray(d.destinations)
          ? d.destinations.filter(isStoredDestination).map((x) => ({
            name: x.name, chatId: x.chatId, threadId: Number.isInteger(x.threadId) ? x.threadId : null
          }))
          : []
      };
    } catch (err) {
      return EMPTY(); // mancante o corrotto: "non configurato", il server parte comunque
    }
  }

  // Scrittura atomica: un crash a metà non deve lasciare un file troncato che
  // farebbe perdere token e destinazioni.
  function write(data) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  return {
    getToken: () => read().botToken,
    setToken(token, botUsername) {
      write({ ...read(), botToken: String(token).trim(), botUsername: botUsername || '' });
    },
    clearToken() {
      write({ ...read(), botToken: '', botUsername: '' });
    },
    getDestinations: () => read().destinations,
    setDestinations(list) {
      const v = validateDestinations(list);
      if (!v.ok) return v;
      write({ ...read(), destinations: v.value });
      return { ok: true };
    },
    publicConfig() {
      const c = read();
      return { tokenSet: Boolean(c.botToken), botUsername: c.botUsername, destinations: c.destinations };
    }
  };
}

module.exports = { createTelegramConfig, validateDestinations };
