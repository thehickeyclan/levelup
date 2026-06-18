import type { ClaudeMessageContent } from '@/lib/market/ai/client';

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
