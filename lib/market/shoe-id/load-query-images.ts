import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaudeMessageContent } from '@/lib/market/ai/client';
import { imagesFromPublicUrls } from '@/lib/market/shoe-id/images';

type ListingImageRow = { storage_path: string; public_url: string };

function mediaTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Load listing photos from storage as base64 for Claude (reliable vs public URL fetch). */
export async function listingQueryImageBlocks(
  admin: SupabaseClient,
  rows: ListingImageRow[],
  max = 6
): Promise<ClaudeMessageContent[]> {
  const blocks: ClaudeMessageContent[] = [];

  for (const row of rows.slice(0, max)) {
    const path = row.storage_path?.trim();
    if (!path) continue;

    const { data, error } = await admin.storage.from('market-listing-photos').download(path);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaTypeForPath(path),
          data: buffer.toString('base64'),
        },
      });
      continue;
    }

    const urlBlocks = imagesFromPublicUrls([row.public_url], 1);
    if (urlBlocks.length) blocks.push(urlBlocks[0]);
  }

  return blocks;
}
