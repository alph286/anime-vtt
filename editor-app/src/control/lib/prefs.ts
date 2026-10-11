// Preferenze del dispositivo del DM (non dati di gioco: mai inviate al
// server). Ogni accesso a localStorage e in try/catch: puo non essere
// disponibile o contenere valori corrotti, nel qual caso si resta sul default.
const DM_GRID_OPACITY_KEY = 'dmGridOpacity';
const DM_GRID_VISIBLE_KEY = 'dmGridVisible';
const AOE_NUDGE_POS_KEY = 'aoeNudgeOverlayPos';

export function loadDmGridOpacity(): number {
  try {
    const raw = localStorage.getItem(DM_GRID_OPACITY_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch { /* localStorage non disponibile o valore corrotto: default */ }
  return 1;
}

export function saveDmGridOpacity(n: number): void {
  try { localStorage.setItem(DM_GRID_OPACITY_KEY, String(n)); } catch { /* vale solo per la sessione */ }
}

export function loadDmGridVisible(): boolean {
  try {
    const raw = localStorage.getItem(DM_GRID_VISIBLE_KEY);
    if (raw !== null) return raw === 'true';
  } catch { /* localStorage non disponibile: default */ }
  return true;
}

export function saveDmGridVisible(b: boolean): void {
  try { localStorage.setItem(DM_GRID_VISIBLE_KEY, String(b)); } catch { /* vale solo per la sessione */ }
}

export function loadNudgePos(): { left: number; top: number } | null {
  try {
    const raw = localStorage.getItem(AOE_NUDGE_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return { left: p.left, top: p.top };
    }
  } catch { /* localStorage non disponibile o valore corrotto: posizione di default */ }
  return null;
}

export function saveNudgePos(p: { left: number; top: number }): void {
  try { localStorage.setItem(AOE_NUDGE_POS_KEY, JSON.stringify(p)); } catch { /* vale solo per la sessione */ }
}
