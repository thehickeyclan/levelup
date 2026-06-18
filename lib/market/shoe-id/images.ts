import type { ClaudeMessageContent } from '@/lib/market/ai/client';
import type { CatalogEntryRow } from '@/lib/market/shoe-id/catalog';

const MAX_QUERY_IMAGES = 6;
/** Cap total catalog reference photos per identify request (prevents vision payload overflow). */
const MAX_TOTAL_REF_IMAGES = 4;

function imageBlockFromUrl(url: string): ClaudeMessageContent | null {
  if (!url.startsWith('http')) return null;
  return {
    type: 'image',
    source: { type: 'url', url },
  };
}

/** Build Claude vision blocks from public image URLs (Anthropic fetches them — keeps request small). */
export function imagesFromPublicUrls(urls: string[], max = 6): ClaudeMessageContent[] {
  const blocks: ClaudeMessageContent[] = [];
  for (const url of urls.slice(0, max)) {
    const block = imageBlockFromUrl(url);
    if (block) blocks.push(block);
  }
  return blocks;
}

function brandMatchesHint(entryBrand: string, brandHint: string): boolean {
  const brand = entryBrand.trim().toLowerCase();
  const hint = brandHint.trim().toLowerCase();
  if (!brand || !hint) return false;
  return brand.includes(hint) || hint.includes(brand);
}

/** Build vision blocks: listing photos to ID, then labeled catalog reference photos. */
export function buildShoeIdVisionContent(
  queryUrls: string[],
  catalogEntries: CatalogEntryRow[],
  options?: { brandHint?: string }
): { blocks: ClaudeMessageContent[]; queryImageCount: number; referenceImageCount: number } {
  const blocks: ClaudeMessageContent[] = [];
  const queryBlocks = imagesFromPublicUrls(queryUrls, MAX_QUERY_IMAGES);
  const queryImageCount = queryBlocks.length;

  blocks.push({
    type: 'text',
    text: `--- LISTING PHOTOS TO IDENTIFY (${queryImageCount} photo${queryImageCount !== 1 ? 's' : ''} of unknown pair) ---`,
  });
  blocks.push(...queryBlocks);

  let entriesWithRefs = catalogEntries.filter((e) => e.reference_image_urls?.length);
  const brandHint = options?.brandHint?.trim();
  if (brandHint) {
    const matching = entriesWithRefs.filter((e) => brandMatchesHint(e.brand, brandHint));
    const other = entriesWithRefs.filter((e) => !brandMatchesHint(e.brand, brandHint));
    entriesWithRefs = [...matching, ...other];
  }

  let referenceImageCount = 0;

  if (entriesWithRefs.length) {
    blocks.push({
      type: 'text',
      text: '--- CONFIRMED REFERENCE PHOTOS FROM CATALOG (admin-verified ground truth per model) ---',
    });

    for (const entry of entriesWithRefs) {
      if (referenceImageCount >= MAX_TOTAL_REF_IMAGES) break;

      const slotsLeft = MAX_TOTAL_REF_IMAGES - referenceImageCount;
      const urls = (entry.reference_image_urls ?? []).slice(0, slotsLeft);
      if (!urls.length) continue;

      blocks.push({
        type: 'text',
        text: `Reference set: ${entry.brand} ${entry.model} (${urls.length} angle${urls.length !== 1 ? 's' : ''})`,
      });
      const refBlocks = imagesFromPublicUrls(urls, slotsLeft);
      referenceImageCount += refBlocks.length;
      blocks.push(...refBlocks);
    }
  }

  return { blocks, queryImageCount, referenceImageCount };
}
