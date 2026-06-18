import type { ClaudeMessageContent } from '@/lib/market/ai/client';

type ListingImageRow = { storage_path: string; public_url: string };

/** Pass listing public URLs to Claude vision (Anthropic fetches them — avoids large base64 payloads). */
export function listingImagesForClaude(images: ListingImageRow[]): ClaudeMessageContent[] {
  const blocks: ClaudeMessageContent[] = [];

  for (const img of images) {
    if (!img.public_url?.startsWith('http')) continue;
    blocks.push({
      type: 'image',
      source: { type: 'url', url: img.public_url },
    });
  }

  return blocks;
}
