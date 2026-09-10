const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// `baseCellSize`/`divisions` sono la "cella grezza" tracciata sulla mappa e
// il numero di suddivisioni applicate: `cellSize` resta sempre il loro
// quoziente, già arrotondato -- ogni altro punto del codice (resa griglia su
// editor/control/display) continua a leggere solo `cellSize`, ignaro della
// suddivisione. Tenerli separati è ciò che permette di cambiare il numero di
// suddivisioni *dopo* aver tracciato la griglia, senza dover ritracciare.
const DEFAULT_GRID = { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
const DEFAULT_COMPASS = { visible: false, x: 88, y: 85, rotation: 0 };
const DEFAULT_AUDIO = { name: '', file: null, volume: 0.7 };

const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
  locations: [
    {
      id: 'taverna',
      name: 'Taverna',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        audio: { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } },
        polygons: [
          { id: 'stanza-1', name: 'Stanza 1', points: [[5, 10], [40, 8], [42, 45], [8, 48]], revealed: false },
          { id: 'corridoio', name: 'Corridoio', points: [[55, 50], [92, 45], [94, 88], [58, 92]], revealed: false }
        ]
      },
      images: [],
      archived: false,
      isDefault: true
    }
  ],
  activeLocationId: 'taverna',
  activeImageId: null,
  activeAudioTrack: 'main',
  audioState: 'stopped',
  audioTriggerSeq: 0
};

function migrate(state) {
  delete state.tvProfiles;
  delete state.activeTvProfileId;
  delete state.liveView;

  if (!state.gridPreset) {
    state.gridPreset = { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
  }
  if (state.gridPreset.color === undefined) state.gridPreset.color = '#ffffff';
  if (state.gridPreset.lineWidth === undefined) state.gridPreset.lineWidth = 0.3;
  if (state.gridPreset.opacity === undefined) state.gridPreset.opacity = 1;

  if (state.audioState === undefined) state.audioState = 'stopped';
  if (state.activeAudioTrack === undefined) state.activeAudioTrack = 'main';
  if (state.audioTriggerSeq === undefined) state.audioTriggerSeq = 0;

  (state.locations || []).forEach((location) => {
    delete location.map.rotation;
    if (location.map.scale === undefined) location.map.scale = 1;
    if (location.map.flip180 === undefined) location.map.flip180 = false;
    if (location.map.rotate90 === undefined) location.map.rotate90 = false;
    if (!location.map.liveView) location.map.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
    if (location.map.grid.color === undefined) location.map.grid.color = '#ffffff';
    if (location.map.grid.lineWidth === undefined) location.map.grid.lineWidth = 0.3;
    if (location.map.grid.opacity === undefined) location.map.grid.opacity = 1;
    // Griglie salvate prima dell'introduzione della suddivisione regolabile:
    // la cella già esistente diventa la base, nessuna suddivisione applicata.
    if (location.map.grid.baseCellSize === undefined) location.map.grid.baseCellSize = location.map.grid.cellSize;
    if (location.map.grid.divisions === undefined) location.map.grid.divisions = 1;
    if (!location.map.compass) location.map.compass = { ...DEFAULT_COMPASS };
    if (location.map.compass.visible === undefined) location.map.compass.visible = false;
    if (location.map.compass.x === undefined) location.map.compass.x = DEFAULT_COMPASS.x;
    if (location.map.compass.y === undefined) location.map.compass.y = DEFAULT_COMPASS.y;
    if (location.map.compass.rotation === undefined) location.map.compass.rotation = 0;
    if (!location.map.audio) {
      location.map.audio = { main: { ...DEFAULT_AUDIO }, special: { ...DEFAULT_AUDIO } };
    } else if (!location.map.audio.main && !location.map.audio.special) {
      // Forma precedente (una sola traccia, prima di main+special): quella
      // già caricata diventa la principale, nessuna perdita per chi l'aveva
      // già caricata con la feature a singola traccia.
      location.map.audio = {
        main: {
          name: location.map.audio.name || '',
          file: location.map.audio.file === undefined ? null : location.map.audio.file,
          volume: location.map.audio.volume === undefined ? DEFAULT_AUDIO.volume : location.map.audio.volume
        },
        special: { ...DEFAULT_AUDIO }
      };
    }
    if (!location.map.audio.main) location.map.audio.main = { ...DEFAULT_AUDIO };
    if (!location.map.audio.special) location.map.audio.special = { ...DEFAULT_AUDIO };
    if (location.map.audio.main.name === undefined) location.map.audio.main.name = '';
    if (location.map.audio.main.file === undefined) location.map.audio.main.file = null;
    if (location.map.audio.main.volume === undefined) location.map.audio.main.volume = DEFAULT_AUDIO.volume;
    if (location.map.audio.special.name === undefined) location.map.audio.special.name = '';
    if (location.map.audio.special.file === undefined) location.map.audio.special.file = null;
    if (location.map.audio.special.volume === undefined) location.map.audio.special.volume = DEFAULT_AUDIO.volume;
    if (location.archived === undefined) location.archived = false;
    if (location.isDefault === undefined) location.isDefault = false;
    (location.images || []).forEach((image) => {
      delete image.rotation;
      if (image.caption === undefined) image.caption = '';
      if (image.telegramDestination === undefined) image.telegramDestination = null;
    });
  });

  return state;
}

function loadState() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
    return migrate(JSON.parse(JSON.stringify(DEFAULT_STATE)));
  }
  try {
    return migrate(JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')));
  } catch (err) {
    // state.json is sometimes hand-edited; a typo must not crash-loop the server
    // with a cryptic stacktrace, nor silently wipe the data. Explain and stop.
    console.error(`\nERRORE: ${STATE_FILE} non è JSON valido (${err.message}).`);
    console.error('Il file NON è stato toccato: correggilo (o ripristina un backup) e riavvia.\n');
    process.exit(1);
  }
}

// Write-to-temp + rename is atomic on the same filesystem: a crash mid-write
// can never leave a truncated state.json behind.
function saveState(state) {
  const tmpFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, STATE_FILE);
}

// Chiamata una sola volta all'avvio del processo, dopo loadState(): forza
// l'app a partire dalla location marcata come predefinita, ignorando quale
// fosse rimasta attiva l'ultima volta che il server si è fermato. Ricade
// sulla prima location non archiviata se quella predefinita è stata nel
// frattempo archiviata o rimossa, o su nessuna location (null) se non ne
// resta nessuna.
function applyStartupDefault(state) {
  const nonArchived = (state.locations || []).filter((l) => !l.archived);
  const preferred = nonArchived.find((l) => l.isDefault);
  const chosen = preferred || nonArchived[0] || null;
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  state.activeAudioTrack = 'main';
  state.audioState = 'stopped';
  return state;
}

module.exports = { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DEFAULT_AUDIO, DATA_DIR, STATE_FILE };
