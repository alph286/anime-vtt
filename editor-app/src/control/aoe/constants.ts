// Opacita del riempimento delle celle colpite da un'area (stesso valore di
// AOE_CELL_FILL_OPACITY in public/control/control.js).
export const AOE_CELL_FILL_OPACITY = 0.35;

// Soglia in pixel schermo tra un tap (piazza una nuova area) e un
// trascinamento accidentale: stessa soglia di 8px del pannello vanilla.
export const AOE_TAP_THRESHOLD_PX = 8;

// Forme selezionabili (stessi data-shape di #aoe-shape-bar).
export const AOE_SHAPES = [
  { shape: 'cone', label: 'Cono' },
  { shape: 'cube', label: 'Cubo' },
  { shape: 'sphere', label: 'Sfera' },
  { shape: 'line', label: 'Linea' },
] as const;

// Colori della color bar (purple resta fuori: vive nel menu "···" come
// "Viola Cornelia").
export const AOE_COLOR_BUTTONS = ['red', 'green', 'white', 'yellow'] as const;
export const AOE_COLOR_LABELS: Record<string, string> = {
  red: 'Rosso', green: 'Verde', white: 'Bianco', yellow: 'Giallo',
};

// Shader "extra" del menu "···" (slug in AOE_SHADER_OVERRIDE_IDS).
export const AOE_SHADER_MENU = [
  { slug: 'web_area', label: 'Zona ragnatela' },
  { slug: 'circular_smoke', label: 'Fumo circolare' },
  { slug: 'purple_fire', label: 'Viola Cornelia' },
] as const;
