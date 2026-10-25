import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MediaPreview } from '@/components/MediaPreview';
import type { ImageItem } from '@/types';

export function Lightbox({ image, onClose }: { image: ImageItem | null; onClose: () => void }) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[90vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[90vw]">
        <DialogTitle className="sr-only">{image?.name || 'Anteprima media'}</DialogTitle>
        <DialogDescription className="sr-only">Anteprima a schermo intero</DialogDescription>
        {image && (
          <div className="flex flex-col items-center gap-2">
            <MediaPreview file={image.file} url={image.url} proxy={image.proxy} name={image.name} playing className="max-h-[85vh] max-w-full rounded-md object-contain" />
            <p className="text-sm text-foreground">{image.name}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
