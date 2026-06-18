import type { ClaudeMessageContent } from '@/lib/market/ai/client';
import type { CatalogEntryRow } from '@/lib/market/shoe-id/catalog';

const MAX_QUERY_IMAGES = 6;
const MAX_REF_IMAGES_PER_ENTRY = 2;
const MAX_CATALOG_ENTRIES_WITH_REFS = 10;

function mediaTypeFromUrl(url: string): string {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Fetch public image URLs server-side and build Claude vision blocks. */
export async function imagesFromPublicUrls(
  urls: string[],
  max = 6
): Promise<ClaudeMessageContent[]> {
  const blocks: ClaudeMessageContent[] = [];

  for (const url of urls.slice(0, max)) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || mediaTypeFromUrl(url);
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType.split(';')[0],
          data: buffer.toString('base64'),
        },
      });
    } catch (e) {
      console.error('shoe-id image fetch failed:', url, e);
    }
  }

  return blocks;
}

/** Build vision blocks: listing photos to ID, then labeled catalog reference photos. */
export async function buildShoeIdVisionContent(
  queryUrls: string[],
  catalogEntries: CatalogEntryRow[]
): Promise<{ blocks: ClaudeMessageContent[]; queryImageCount: number; referenceImageCount: number }> {
  const blocks: ClaudeMessageContent[] = [];
  const queryBlocks = await imagesFromPublicUrls(queryUrls, MAX_QUERY_IMAGES);
  const queryImageCount = queryBlocks.length;

  blocks.push({
    type: 'text',
    text: `--- LISTING PHOTOS TO IDENTIFY (${queryImageCount} photo${queryImageCount !== 1 ? 's' : ''} of unknown pair) ---`,
  });
  blocks.push(...queryBlocks);

  const entriesWithRefs = catalogEntries.filter((e) => e.reference_image_urls?.length);
  let referenceImageCount = 0;

  if (entriesWithRefs.length) {
    blocks.push({
      type: 'text',
      text: '--- CONFIRMED REFERENCE PHOTOS FROM CATALOG (admin-verified ground truth per model) ---',
    });

    for (const entry of entriesWithRefs.slice(0, MAX_CATALOG_ENTRIES_WITH_REFS)) {
      const urls = (entry.reference_image_urls ?? []).slice(0, MAX_REF_IMAGES_PER_ENTRY);
      if (!urls.length) continue;

      blocks.push({
        type: 'text',
        text: `Reference set: ${entry.brand} ${entry.model} (${urls.length} angle${urls.length !== 1 ? 's' : ''})`,
      });
      const refBlocks = await imagesFromPublicUrls(urls, MAX_REF_IMAGES_PER_ENTRY);
      referenceImageCount += refBlocks.length;
      blocks.push(...refBlocks);
    }
  }

  return { blocks, queryImageCount, referenceImageCount };
}
