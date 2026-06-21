'use client';

import { useState } from 'react';
import { Loader2, Star, Trash2 } from 'lucide-react';
import {
  isPrimaryListingImage,
  reorderListingImagesForPrimary,
  type MarketListingImageRow,
} from '@/lib/market/listing-images';
import { PhotoCleanToggle, photoThumbnailSrc } from '@/components/market/photo-clean-toggle';

type ListingImage = MarketListingImageRow & { id: string };

export function ListingPhotoGrid({
  listingId,
  images,
  onImagesChange,
  onUpdateImage,
  onRemove,
}: {
  listingId: string;
  images: ListingImage[];
  onImagesChange: (images: ListingImage[]) => void;
  onUpdateImage: (imageId: string, patch: Partial<MarketListingImageRow>) => void;
  onRemove?: (imageId: string) => void | Promise<void>;
}) {
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  async function setAsPrimary(imageId: string) {
    if (isPrimaryListingImage(images.find((i) => i.id === imageId)!, images)) return;
    setPrimaryId(imageId);
    try {
      const res = await fetch(
        `/api/market/listings/${listingId}/images/${imageId}/primary`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not set cover photo');
      onImagesChange(reorderListingImagesForPrimary(images, imageId));
    } catch {
      // Keep current order on failure
    } finally {
      setPrimaryId(null);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((img) => {
        const isPrimary = isPrimaryListingImage(img, images);
        const settingThis = primaryId === img.id;

        return (
          <div key={img.id} className="relative">
            <div className="aspect-square rounded-lg border border-border overflow-hidden bg-card">
              <img src={photoThumbnailSrc(img)} alt="" className="w-full h-full object-cover" />
              {isPrimary ? (
                <span
                  className="absolute top-1 left-1 rounded-full bg-accent text-accent-foreground text-[10px] font-medium px-2 py-0.5 flex items-center gap-0.5"
                >
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Cover
                </span>
              ) : null}
            </div>
            {onRemove ? (
              <button
                type="button"
                onClick={() => void onRemove(img.id)}
                className="absolute top-1 right-1 rounded-full bg-background/90 border border-border p-1 text-muted-foreground hover:text-destructive"
                aria-label="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {!isPrimary ? (
              <button
                type="button"
                onClick={() => void setAsPrimary(img.id)}
                disabled={settingThis}
                className="mt-1 text-[10px] text-muted-foreground hover:text-accent disabled:opacity-50 flex items-center gap-1"
              >
                {settingThis ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Star className="h-3 w-3" />
                )}
                Set as cover
              </button>
            ) : null}
            <PhotoCleanToggle listingId={listingId} image={img} onUpdate={onUpdateImage} />
          </div>
        );
      })}
    </div>
  );
}
