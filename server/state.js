const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const DEFAULT_GRID = { enabled: false, cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 };

const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 },
  locations: [
    {
      id: 'taverna',
      name: 'Taverna',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        grid: { ...DEFAULT_GRID },
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
  liveView: { scale: 1, offsetX: 0, offsetY: 0 }
};

function migrate(state) {
  delete state.tvProfiles;
  delete state.activeTvProfileId;

  if (!state.gridPreset) {
    state.gridPreset = { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 };
  }
  if (state.gridPreset.color === undefined) state.gridPreset.color = '#ffffff';
  if (state.gridPreset.lineWidth === undefined) state.gridPreset.lineWidth = 0.3;

  (state.locations || []).forEach((location) => {
    delete location.map.rotation;
    if (location.map.scale === undefined) location.map.scale = 1;
    if (location.map.flip180 === undefined) location.map.flip180 = false;
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
    if (location.map.grid.color === undefined) location.map.grid.color = '#ffffff';
    if (location.map.grid.lineWidth === undefined) location.map.grid.lineWidth = 0.3;
    if (location.archived === undefined) location.archived = false;
    if (location.isDefault === undefined) location.isDefault = false;
    (location.images || []).forEach((image) => {
      delete image.rotation;
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

module.exports = { loadState, saveState, DATA_DIR, STATE_FILE };
