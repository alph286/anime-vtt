import type { AudioKind, VttState } from '@/types';

// Nomi delle location che usano un audio dell'archivio (una volta ciascuna,
// nell'ordine delle location): serve all'avviso prima di eliminarlo.
export function audioUsage(state: VttState, audioId: string): string[] {
  return state.locations
    .filter((l) => [...l.map.audio.background, ...l.map.audio.oneshot].some((t) => t.audioId === audioId))
    .map((l) => l.name);
}

// Carica nell'archivio un file per richiesta, in sequenza: un file rifiutato non
// ferma gli altri. Con `target` aggiunge anche la riga a quella location.
// Ritorna i nomi dei file non caricati.
export async function uploadAudioFiles(files: File[], target?: { locationId: string; kind: AudioKind }): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    const formData = new FormData();
    if (target) {
      formData.append('locationId', target.locationId);
      formData.append('kind', target.kind);
    }
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload/audio', { method: 'POST', body: formData });
      if (!res.ok) errors.push(file.name);
    } catch {
      errors.push(file.name);
    }
  }
  return errors;
}
