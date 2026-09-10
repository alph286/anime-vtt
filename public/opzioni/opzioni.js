const picsenderUrlInput = document.getElementById('picsender-url-input');
const campaignNameInput = document.getElementById('campaign-name-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const testConnectionBtn = document.getElementById('test-connection-btn');
const settingsStatus = document.getElementById('settings-status');
const testConnectionResult = document.getElementById('test-connection-result');
const dataDirValue = document.getElementById('data-dir-value');
const storageDirValue = document.getElementById('storage-dir-value');
const versionValue = document.getElementById('version-value');

fetch('/api/state')
  .then((res) => res.json())
  .then((state) => {
    picsenderUrlInput.value = (state.settings && state.settings.picsenderUrl) || '';
    campaignNameInput.value = (state.campaign && state.campaign.name) || '';
    saveSettingsBtn.disabled = false;
    testConnectionBtn.disabled = false;
  })
  .catch(() => {
    settingsStatus.hidden = false;
    settingsStatus.className = 'hint warning';
    settingsStatus.textContent = 'Impossibile caricare le impostazioni attuali. Ricarica la pagina.';
  });

fetch('/api/info')
  .then((res) => res.json())
  .then((info) => {
    dataDirValue.textContent = info.dataDir;
    storageDirValue.textContent = info.storageDir;
    versionValue.textContent = `Anime VTT v${info.version}`;
  });

saveSettingsBtn.addEventListener('click', async () => {
  settingsStatus.hidden = false;
  settingsStatus.className = 'hint';
  settingsStatus.textContent = 'Salvataggio...';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        picsenderUrl: picsenderUrlInput.value,
        campaignName: campaignNameInput.value
      })
    });
    if (!res.ok) throw new Error(String(res.status));
    settingsStatus.className = 'hint success';
    settingsStatus.textContent = 'Impostazioni salvate.';
  } catch (err) {
    settingsStatus.className = 'hint warning';
    settingsStatus.textContent = 'Salvataggio fallito, riprova.';
  }
});

testConnectionBtn.addEventListener('click', async () => {
  testConnectionResult.hidden = false;
  testConnectionResult.className = 'hint';
  testConnectionResult.textContent = 'Verifica in corso...';
  try {
    let res, data;
    try {
      res = await fetch('/api/telegram/destinations');
      data = await res.json();
    } catch (err) {
      testConnectionResult.className = 'hint warning';
      testConnectionResult.textContent = 'Errore di rete. Riprova.';
      return;
    }
    if (!res.ok) throw new Error(data.error || String(res.status));
    if (!Array.isArray(data)) {
      throw new Error('PicSender ha risposto con un formato inatteso per le destinazioni');
    }
    const count = data.length;
    const noun = count === 1 ? 'destinazione' : 'destinazioni';
    const verb = count === 1 ? 'trovata' : 'trovate';
    testConnectionResult.className = 'hint success';
    testConnectionResult.textContent = `Connesso: ${count} ${noun} ${verb}.`;
  } catch (err) {
    testConnectionResult.className = 'hint warning';
    testConnectionResult.textContent = err.message;
  }
});
