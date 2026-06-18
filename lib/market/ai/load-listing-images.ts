import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaudeMessageContent } from '@/lib/market/ai/client';
import { prepareVisionImage } from '@/lib/market/ai/prepare-vision-image';

type ListingImageRow = { storage_path: string; public_url: string };

function mediaTypeFromPath(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Load listing photos from Storage as base64 for Claude (avoids public URL fetch issues). */
export async function listingImagesForClaude(
  admin: SupabaseClient,
  images: ListingImageRow[]
): Promise<ClaudeMessageContent[]> {
  const blocks: ClaudeMessageContent[] = [];

  for (const img of images) {
    const { data, error } = await admin.storage
      .from('market-listing-photos')
      .download(img.storage_path);

    if (data && !error) {
      const raw = Buffer.from(await data.arrayBuffer());
      const { buffer, mediaType } = await prepareVisionImage(raw, mediaTypeFromPath(img.storage_path));
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      });
      continue;
    }

    // Fallback: fetch public URL server-side
    try {
      const res = await fetch(img.public_url);
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || mediaTypeFromPath(img.storage_path);
        const { buffer, mediaType } = await prepareVisionImage(raw, contentType);
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: buffer.toString('base64'),
          },
        });
      }
    } catch (e) {
      console.error('market image load failed:', img.storage_path, e);
    }
  }

  return blocks;
}
