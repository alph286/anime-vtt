// Endpoint HTTP della configurazione Telegram + risoluzione della
// destinazione al momento dell'invio. Separato da index.js per poterlo
// testare su un'app Express temporanea, senza avviare l'intero server.
// Nessuna risposta contiene mai il bot token.

// Le scritture di configurazione possono lanciare (disco pieno, rename
// fallito). In Express 4 un handler async che lancia diventa un rejection non
// gestito e fa cadere il processo Node 22: qui si risponde 500 invece.
// Il messaggio non include mai il token (il layer config non lo mette nei messaggi).
function saveFailed(res, err) {
  return res.status(500).json({ error: 'Salvataggio non riuscito: ' + err.message });
}

function registerTelegramRoutes(app, { config, client }) {
  // Solo i nomi: le tendine di /editor e /control non hanno bisogno di chat_id.
  app.get('/api/telegram/destinations', (req, res) => {
    res.json(config.getDestinations().map((d) => ({ name: d.name })));
  });

  app.get('/api/telegram/config', (req, res) => {
    res.json(config.publicConfig());
  });

  app.post('/api/telegram/token', async (req, res) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!token) return res.status(400).json({ error: 'Token mancante' });
      const me = await client.getMe(token);
      if (!me.ok) return res.status(400).json({ error: me.error });
      config.setToken(token, me.username);
      res.json({ ok: true, botUsername: me.username });
    } catch (err) {
      saveFailed(res, err);
    }
  });

  app.delete('/api/telegram/token', (req, res) => {
    try {
      config.clearToken();
      res.json({ ok: true });
    } catch (err) {
      saveFailed(res, err);
    }
  });

  app.put('/api/telegram/destinations', (req, res) => {
    try {
      const result = config.setDestinations(req.body?.destinations);
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.json({ ok: true, destinations: config.getDestinations() });
    } catch (err) {
      saveFailed(res, err);
    }
  });

  app.post('/api/telegram/detect', async (req, res) => {
    const token = config.getToken();
    if (!token) return res.status(400).json({ error: 'Imposta prima il token del bot' });
    const result = await client.detectChats(token);
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ chats: result.chats });
  });

  app.post('/api/telegram/test', async (req, res) => {
    const token = config.getToken();
    if (!token) return res.status(400).json({ error: 'Imposta prima il token del bot' });
    const dest = config.getDestinations().find((d) => d.name === req.body?.name);
    if (!dest) return res.status(404).json({ error: 'Destinazione non trovata: salva prima le destinazioni' });
    const result = await client.sendText({
      token, chatId: dest.chatId, threadId: dest.threadId, text: `Prova di anime-vtt: «${dest.name}» funziona.`
    });
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ ok: true });
  });
}

// Il nome della destinazione assegnata al media (non un indice) viene risolto
// qui, al momento dell'invio: resta valido anche se la lista cambia ordine.
async function sendStoredMedia({ config, client, filePath, caption, destinationName }) {
  const token = config.getToken();
  if (!token) return { ok: false, error: 'Telegram non configurato: imposta il bot in /opzioni' };
  if (!destinationName) return { ok: false, error: 'Nessuna destinazione assegnata a questo media' };
  const dest = config.getDestinations().find((d) => d.name === destinationName);
  if (!dest) return { ok: false, error: `Destinazione «${destinationName}» non più configurata in /opzioni` };
  return client.sendMedia({ token, chatId: dest.chatId, threadId: dest.threadId, filePath, caption });
}

module.exports = { registerTelegramRoutes, sendStoredMedia };
