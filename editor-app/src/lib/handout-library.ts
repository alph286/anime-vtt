import type { VttState } from '@/types';
import { checkVideoSafe } from './video-check';

// Chi usa una voce dell'archivio handout: nomi delle location (nell'ordine delle
// location) e, in coda, "default globale". Serve all'avviso prima di eliminarla.
export function handoutUsage(state: VttState, id: string): string[] {
  const names = state.locations.filter((l) => l.handoutDefaultId === id).map((l) => l.name);
  if (state.handout?.defaultId === id) names.push('default globale');
  return names;
}

// Carica nell'archivio handout un file per richiesta, in sequenza: un file
// rifiutato non ferma gli altri. I video passano prima dal controllo di
// sicurezza dell'editor. Ritorna i nomi dei file non caricati.
export async function uploadHandoutFiles(files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    if (isVideoFile(file.name)) {
      const check = await checkVideoSafe(file);
      if (!check.ok) {
        errors.push(`${file.name} (${check.reason})`);
        continue;
      }
    }
    const formData = new FormData();
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload/handout', { method: 'POST', body: formData });
      if (!res.ok) errors.push(file.name);
    } catch {
      errors.push(file.name);
    }
  }
  return errors;
}
