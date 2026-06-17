import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

/** eBay Browse API proxy — returns empty array when EBAY_API_KEY unset. */
export async function GET(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;

  const q = req.nextUrl.searchParams.get('q') || 'wrestling shoes';
  const apiKey = process.env.EBAY_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ comps: [], stub: true });

  try {
    const params = new URLSearchParams({ q, limit: '10' });
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      }
    );
    if (!res.ok) return NextResponse.json({ comps: [] });
    const data = (await res.json()) as {
      itemSummaries?: { title?: string; price?: { value?: string } }[];
    };
    const comps = (data.itemSummaries ?? []).map((item, i) => ({
      source: 'ebay',
      price_cents: Math.round(parseFloat(item.price?.value || '0') * 100),
      label: item.title?.slice(0, 60) || `Result ${i + 1}`,
    }));
    return NextResponse.json({ comps });
  } catch {
    return NextResponse.json({ comps: [], stub: true });
  }
}
