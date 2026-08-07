import ListingDetailClient from './listing-detail-client';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { primaryListingImageUrl, type MarketListingImageRow } from '@/lib/market/listing-images';
import { resolveSiteBaseUrl, siteShareImageMetadata } from '@/lib/site-metadata';

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatPrice(priceCents: number | null | undefined): string | null {
  if (!priceCents || priceCents <= 0) return null;
  return `$${Math.round(priceCents / 100)}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const headersList = await headers();
  const host = resolveHostnameFromHeaders(headersList);
  const tenant = getTenantByDomain(host);
  const productName = tenant?.productName ?? 'The Guild';
  const baseUrl = resolveSiteBaseUrl(host);
  const fallbackLogo = tenant?.logo ?? '/logos/guild-mark.png';

  if (!tenant) {
    return {
      title: `Guild Market listing | ${productName}`,
      ...siteShareImageMetadata(productName, fallbackLogo),
    };
  }

  const admin = createAdminClient(tenant.slug);
  const { data: listing } = await admin
    .from('market_listings')
    .select(
      'id, title, brand, model, colorway, price_cents, listing_type, market_listing_images(public_url, clean_public_url, use_clean, display_order)'
    )
    .eq('id', id)
    .maybeSingle();

  if (!listing) {
    return {
      title: `Guild Market listing | ${productName}`,
      ...siteShareImageMetadata(productName, fallbackLogo),
    };
  }

  const images = (listing.market_listing_images as MarketListingImageRow[] | null) ?? [];
  const imageUrl = primaryListingImageUrl(images);
  const titleBase =
    (listing.title as string | null)?.trim() ||
    [listing.brand, listing.model].filter(Boolean).join(' ').trim() ||
    'Wrestling shoes';
  const price = formatPrice(listing.price_cents as number | null);
  const colorway = (listing.colorway as string | null)?.trim();
  const listingType = listing.listing_type === 'collection' ? 'Guild Collection' : listing.listing_type === 'trade' ? 'Open to trade' : 'For sale';
  const title = price ? `${titleBase} — ${price}` : titleBase;
  const description = [colorway, listingType, 'View photos and message through Guild Market.']
    .filter(Boolean)
    .join(' · ');
  const canonicalUrl = `${baseUrl}/market/listing/${id}`;

  return {
    title: `${title} | Guild Market`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      siteName: productName,
      type: 'website',
      url: canonicalUrl,
      title,
      description,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: titleBase,
            },
          ]
        : [
            {
              url: fallbackLogo,
              alt: productName,
            },
          ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl || fallbackLogo],
    },
  };
}

export default function ListingDetailPage() {
  return <ListingDetailClient />;
}
