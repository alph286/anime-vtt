const campaignNameInput = document.getElementById('campaign-name-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');
const dataDirValue = document.getElementById('data-dir-value');
const storageDirValue = document.getElementById('storage-dir-value');
const versionValue = document.getElementById('version-value');

const tokenSet = document.getElementById('token-set');
const tokenForm = document.getElementById('token-form');
const tokenInput = document.getElementById('token-input');
const botName = document.getElementById('bot-name');
const saveTokenBtn = document.getElementById('save-token-btn');
const cancelTokenBtn = document.getElementById('cancel-token-btn');
const replaceTokenBtn = document.getElementById('replace-token-btn');
const removeTokenBtn = document.getElementById('remove-token-btn');
const tokenStatus = document.getElementById('token-status');
const destRows = document.getElementById('dest-rows');
const addDestBtn = document.getElementById('add-dest-btn');
const detectBtn = document.getElementById('detect-btn');
const saveDestBtn = document.getElementById('save-dest-btn');
const detectResults = document.getElementById('detect-results');
const destStatus = document.getElementById('dest-status');
const destEmpty = document.getElementById('dest-empty');

function showStatus(el, kind, text) {
  el.hidden = false;
  el.className = kind ? `hint ${kind}` : 'hint';
  el.textContent = text;
}

// Chiamata JSON con esito uniforme: { ok, data }. Un errore di rete diventa
// ok:false con un messaggio, mai un'eccezione non gestita.
async function api(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, data: { error: 'Errore di rete. Riprova.' } };
  }
}

// --- Campagna -------------------------------------------------------------

fetch('/api/state')
  .then((res) => res.json())
  .then((state) => {
    campaignNameInput.value = (state.campaign && state.campaign.name) || '';
    saveSettingsBtn.disabled = false;
  })
  .catch(() => {
    showStatus(settingsStatus, 'warning', 'Impossibile caricare le impostazioni attuali. Ricarica la pagina.');
  });

fetch('/api/info')
  .then((res) => res.json())
  .then((info) => {
    dataDirValue.textContent = info.dataDir;
    storageDirValue.textContent = info.storageDir;
    versionValue.textContent = `Anime VTT v${info.version}`;
  });

saveSettingsBtn.addEventListener('click', async () => {
  showStatus(settingsStatus, '', 'Salvataggio...');
  const { ok } = await api('POST', '/api/settings', { campaignName: campaignNameInput.value });
  showStatus(settingsStatus, ok ? 'success' : 'warning', ok ? 'Impostazioni salvate.' : 'Salvataggio fallito, riprova.');
});

// --- Telegram: bot --------------------------------------------------------

function renderToken(cfg) {
  tokenSet.hidden = !cfg.tokenSet;
  tokenForm.hidden = cfg.tokenSet;
  cancelTokenBtn.hidden = true;
  tokenInput.value = '';
  botName.textContent = cfg.botUsername ? `@${cfg.botUsername}` : 'Bot';
}

replaceTokenBtn.addEventListener('click', () => {
  tokenForm.hidden = false;
  cancelTokenBtn.hidden = false;
  tokenInput.focus();
});
cancelTokenBtn.addEventListener('click', () => {
  tokenForm.hidden = true;
  tokenInput.value = '';
});

saveTokenBtn.addEventListener('click', async () => {
  showStatus(tokenStatus, '', 'Verifica del token...');
  const { ok, data } = await api('POST', '/api/telegram/token', { token: tokenInput.value });
  if (!ok) {
    showStatus(tokenStatus, 'warning', data.error || 'Token non valido.');
    return;
  }
  tokenInput.value = '';
  showStatus(tokenStatus, 'success', `Bot @${data.botUsername} collegato.`);
  loadConfig();
});

removeTokenBtn.addEventListener('click', async () => {
  const { ok } = await api('DELETE', '/api/telegram/token');
  showStatus(tokenStatus, ok ? 'success' : 'warning', ok ? 'Token rimosso.' : 'Rimozione fallita, riprova.');
  loadConfig();
});

// --- Telegram: destinazioni ----------------------------------------------

function addRow(dest) {
  const row = document.createElement('div');
  row.className = 'dest-row';
  const make = (placeholder, value, label) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    input.value = value == null ? '' : String(value);
    return input;
  };
  const name = make('Mappe', dest.name, 'Nome');
  const chatId = make('-1001234567890', dest.chatId, 'chat_id');
  const threadId = make('facoltativo', dest.threadId, 'thread_id');
  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.textContent = 'Prova';
  testBtn.addEventListener('click', async () => {
    showStatus(destStatus, '', 'Invio del messaggio di prova...');
    const { ok, data } = await api('POST', '/api/telegram/test', { name: name.value.trim() });
    showStatus(destStatus, ok ? 'success' : 'warning', ok ? `Messaggio di prova inviato a «${name.value.trim()}».` : data.error);
  });
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'Elimina';
  delBtn.className = 'btn-quiet-danger';
  delBtn.addEventListener('click', () => { row.remove(); syncEmpty(); });
  const actions = document.createElement('div');
  actions.className = 'dest-actions';
  actions.append(testBtn, delBtn);
  row.append(name, chatId, threadId, actions);
  row._fields = { name, chatId, threadId };
  destRows.appendChild(row);
  syncEmpty();
}

function syncEmpty() {
  destEmpty.hidden = destRows.children.length > 0;
}

function renderDestinations(list) {
  destRows.replaceChildren();
  list.forEach(addRow);
  syncEmpty();
}

function collectDestinations() {
  return [...destRows.children].map((row) => ({
    name: row._fields.name.value,
    chatId: row._fields.chatId.value,
    threadId: row._fields.threadId.value
  }));
}

addDestBtn.addEventListener('click', () => addRow({}));

saveDestBtn.addEventListener('click', async () => {
  showStatus(destStatus, '', 'Salvataggio...');
  const { ok, data } = await api('PUT', '/api/telegram/destinations', { destinations: collectDestinations() });
  if (!ok) {
    showStatus(destStatus, 'warning', data.error || 'Salvataggio fallito, riprova.');
    return;
  }
  renderDestinations(data.destinations);
  showStatus(destStatus, 'success', 'Destinazioni salvate.');
});

detectBtn.addEventListener('click', async () => {
  showStatus(destStatus, '', 'Ricerca in corso...');
  detectResults.hidden = true;
  const { ok, data } = await api('POST', '/api/telegram/detect');
  if (!ok) {
    showStatus(destStatus, 'warning', data.error || 'Rilevamento fallito.');
    return;
  }
  if (data.chats.length === 0) {
    showStatus(destStatus, 'warning', 'Nessun messaggio recente trovato. Scrivi nel gruppo o nel topic un messaggio che menziona il bot (es. «@nomebot ciao») e riprova.');
    return;
  }
  detectResults.replaceChildren();
  data.chats.forEach((chat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detect-item';
    const topic = chat.threadId == null ? 'chat generale' : `topic ${chat.topicName || chat.threadId}`;
    const title = document.createElement('span');
    title.className = 'detect-title';
    title.textContent = `${chat.chatTitle} — ${topic}`;
    const meta = document.createElement('span');
    meta.className = 'detect-meta';
    meta.textContent = `chat_id ${chat.chatId}${chat.threadId == null ? '' : ` · thread_id ${chat.threadId}`}`;
    btn.append(title, meta);
    btn.addEventListener('click', () => {
      addRow({ name: chat.topicName || chat.chatTitle, chatId: chat.chatId, threadId: chat.threadId });
    });
    detectResults.appendChild(btn);
  });
  detectResults.hidden = false;
  showStatus(destStatus, '', 'Clicca una voce per aggiungerla, poi scegli il nome e salva.');
});

async function loadConfig() {
  const { ok, data } = await api('GET', '/api/telegram/config');
  if (!ok) {
    showStatus(tokenStatus, 'warning', 'Impossibile leggere la configurazione Telegram. Ricarica la pagina.');
    return;
  }
  renderToken(data);
  renderDestinations(data.destinations);
}

loadConfig();
