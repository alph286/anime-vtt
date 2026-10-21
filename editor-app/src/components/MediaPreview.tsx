import { Globe } from 'lucide-react';

// Anteprima di un media: <img> per le immagini, <video> muto per i video, pagina
// web per gli elementi Web. Con `playing` il video si riproduce in loop e la
// pagina web si carica davvero in un iframe (lightbox/dettaglio); altrimenti
// miniature leggere: primo fotogramma del video, icona globo per il web.
export function MediaPreview({ file, url, proxy, name, className, playing = false }: {
  file?: string | null; url?: string; proxy?: boolean; name?: string; className?: string; playing?: boolean;
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
  const src = `/storage/images/${file}`;
  if (!isVideoFile(file)) return <img src={src} alt={name || ''} className={className} />;
  return (
    <video
      src={playing ? src : `${src}#t=0.1`}
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
