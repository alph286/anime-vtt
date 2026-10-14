// Anteprima di un handout: <img> per le immagini, <video> muto per i video.
// Con `playing` il video si riproduce in loop (lightbox/dettaglio); altrimenti
// resta sul primo fotogramma (miniature, niente decodifica continua).
export function MediaPreview({ file, name, className, playing = false }: {
  file: string; name?: string; className?: string; playing?: boolean;
}) {
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
