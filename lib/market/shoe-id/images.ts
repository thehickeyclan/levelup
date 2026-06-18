import type { ClaudeMessageContent } from '@/lib/market/ai/client';
import { prepareVisionImage } from '@/lib/market/ai/prepare-vision-image';
import type { CatalogEntryRow } from '@/lib/market/shoe-id/catalog';

const MAX_QUERY_IMAGES = 6;
/** Cap total catalog reference photos per identify request (prevents 413 payload overflow). */
const MAX_TOTAL_REF_IMAGES = 4;

function mediaTypeFromUrl(url: string): string {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function imageBlockFromBuffer(
  buffer: Buffer,
  contentType?: string
): Promise<ClaudeMessageContent | null> {
  const { buffer: prepared, mediaType } = await prepareVisionImage(buffer, contentType);
  if (!prepared.length) return null;
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: prepared.toString('base64'),
    },
  };
}

/** Fetch public image URLs server-side, compress, and build Claude vision blocks. */
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
      const block = await imageBlockFromBuffer(buffer, contentType);
      if (block) blocks.push(block);
    } catch (e) {
      console.error('shoe-id image fetch failed:', url, e);
    }
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
export async function buildShoeIdVisionContent(
  queryUrls: string[],
  catalogEntries: CatalogEntryRow[],
  options?: { brandHint?: string }
): Promise<{ blocks: ClaudeMessageContent[]; queryImageCount: number; referenceImageCount: number }> {
  const blocks: ClaudeMessageContent[] = [];
  const queryBlocks = await imagesFromPublicUrls(queryUrls, MAX_QUERY_IMAGES);
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
      const refBlocks = await imagesFromPublicUrls(urls, slotsLeft);
      referenceImageCount += refBlocks.length;
      blocks.push(...refBlocks);
    }
  }

  return { blocks, queryImageCount, referenceImageCount };
}
