import { useCallback } from 'react';
import { Globe } from 'lucide-react';

// Anteprima di un media: <img> per le immagini, <video> muto per i video, pagina
// web per gli elementi Web. Con `playing` il video si riproduce in loop e la
// pagina web si carica davvero in un iframe (lightbox/dettaglio); altrimenti
// miniature leggere: primo fotogramma del video, icona globo per il web.
// `dir` è la cartella di storage del file: 'images' per i media delle location,
// 'handout' per l'archivio dei default di /handout.
export function MediaPreview({ file, url, proxy, name, className, playing = false, dir = 'images' }: {
  file?: string | null; url?: string; proxy?: boolean; name?: string; className?: string; playing?: boolean;
  dir?: 'images' | 'handout';
}) {
  if (url) {
    if (!playing) {
      return (
        <span className={className} aria-label={name || url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--muted)' }}>
          <Globe className="size-1/2 text-muted-foreground" />
        </span>
      );
    }
    return (
      <iframe
        title={name || url}
        src={webItemSrc({ url, proxy })}
        sandbox="allow-scripts allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className={`w-[85vw] max-w-full ${className ?? ''}`}
        style={{ border: 0, background: '#fff', height: '60vh' }}
      />
    );
  }
  const src = `/storage/${dir}/${file}`;
  if (!isVideoFile(file)) return <img src={src} alt={name || ''} className={className} />;
  return <VideoPreview src={playing ? src : `${src}#t=0.1`} name={name} className={className} playing={playing} />;
}

// Smontato, il <video> va rilasciato a mano: togliere src e chiamare load() fa
// liberare subito decoder e fotogrammi. Altrimenti il browser li tiene finché non
// distrugge il player, molto dopo; cambiando location in fretta le miniature
// smontate si accumulano in memoria GPU (su NVIDIA: renderer di Chrome in crash).
function releaseVideo(el: HTMLVideoElement) {
  el.pause();
  el.removeAttribute('src');
  el.load();
}

function VideoPreview({ src, name, className, playing }: { src: string; name?: string; className?: string; playing: boolean }) {
  const ref = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    // StrictMode (dev) attacca, stacca e riattacca il ref: rimette il src tolto.
    if (el.getAttribute('src') !== src) el.setAttribute('src', src);
    return () => releaseVideo(el);
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      className={className}
      muted
      loop={playing}
      autoPlay={playing}
      playsInline
      preload="metadata"
      aria-label={name || undefined}
    />
  );
}
