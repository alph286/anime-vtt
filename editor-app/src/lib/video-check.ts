const MAX_VIDEO_PIXELS = 1920 * 1080;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export type VideoCheck = { ok: true } | { ok: false; reason: string };

export function checkVideoSafe(file: File): Promise<VideoCheck> {
  return new Promise((resolve) => {
    if (file.size > MAX_VIDEO_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      resolve({ ok: false, reason: `video troppo pesante (${mb}MB, limite ${MAX_VIDEO_BYTES / 1024 / 1024}MB) — rischia di bloccare il Raspberry Pi.` });
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const pixels = probe.videoWidth * probe.videoHeight;
      URL.revokeObjectURL(url);
      if (pixels > MAX_VIDEO_PIXELS) {
        resolve({ ok: false, reason: `risoluzione troppo alta (${probe.videoWidth}×${probe.videoHeight}) — massimo consigliato 1920×1080 per il Raspberry Pi.` });
      } else {
        resolve({ ok: true });
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, reason: 'video non leggibile: file non valido o formato non supportato dal browser.' });
    };
    probe.src = url;
  });
}
