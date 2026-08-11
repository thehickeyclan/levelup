import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

const SELLER_REVIEW_TAGS = ['As described', 'Fast shipping', 'Great communication', 'Would buy again'];
const BUYER_REVIEW_TAGS = ['Reliable buyer', 'Quick payment', 'Great communication', 'Would work with again'];

type MarketOrderReview = {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[] | null;
  created_at: string;
  buyer_id?: string;
  seller_id?: string;
};

function reviewError(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (error.code === '42P01') {
    return NextResponse.json(
      { error: 'Seller-to-buyer feedback is not installed yet. Run the market buyer reviews migration.' },
      { status: 500 }
    );
  }
  if (error.code === '23505') {
    return NextResponse.json({ error: 'Feedback was already left for this order' }, { status: 409 });
  }
  return NextResponse.json({ error: error.message ?? 'Could not save feedback' }, { status: 500 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: orderId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    rating?: number;
    comment?: string;
    tags?: string[];
  };

  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 });
  }

  const { data: order } = await supabase
    .from('market_orders')
    .select('id, buyer_id, seller_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const role =
    order.buyer_id === user!.id ? 'buyer' : order.seller_id === user!.id ? 'seller' : null;
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (order.status !== 'completed') {
    return NextResponse.json({ error: 'Feedback is available after the order is completed' }, { status: 400 });
  }

  const allowedTags = role === 'buyer' ? SELLER_REVIEW_TAGS : BUYER_REVIEW_TAGS;
  const tags = (body.tags ?? []).filter((t) => allowedTags.includes(t)).slice(0, 4);
  const comment = body.comment?.trim().slice(0, 500) || null;

  if (role === 'buyer') {
    const { data, error } = await supabase
      .from('market_seller_reviews')
      .insert({
        order_id: orderId,
        seller_id: order.seller_id,
        buyer_id: user!.id,
        rating,
        comment,
        tags,
      })
      .select('id, rating, comment, tags, created_at')
      .single();

    const err = reviewError(error);
    if (err) return err;
    return NextResponse.json({ review: data, direction: 'seller' });
  }

  const { data, error } = await supabase
    .from('market_buyer_reviews')
    .insert({
      order_id: orderId,
      seller_id: user!.id,
      buyer_id: order.buyer_id,
      rating,
      comment,
      tags,
    })
    .select('id, rating, comment, tags, created_at')
    .single();

  const err = reviewError(error);
  if (err) return err;
  return NextResponse.json({ review: data, direction: 'buyer' });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: orderId } = await params;

  const { data: order } = await supabase
    .from('market_orders')
    .select('id, buyer_id, seller_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.buyer_id !== user!.id && order.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role =
    order.buyer_id === user!.id ? 'buyer' : order.seller_id === user!.id ? 'seller' : null;

  const { data: sellerReview } = await supabase
    .from('market_seller_reviews')
    .select('id, rating, comment, tags, created_at, buyer_id')
    .eq('order_id', orderId)
    .maybeSingle();

  const buyerReviewResult = await supabase
    .from('market_buyer_reviews')
    .select('id, rating, comment, tags, created_at, seller_id')
    .eq('order_id', orderId)
    .maybeSingle();
  const buyerReview =
    buyerReviewResult.error?.code === '42P01' ? null : buyerReviewResult.data;
  const currentReview = role === 'seller' ? buyerReview : sellerReview;
  const tagOptions = role === 'seller' ? BUYER_REVIEW_TAGS : SELLER_REVIEW_TAGS;

  return NextResponse.json({
    canReview: order.buyer_id === user!.id && order.status === 'completed' && !sellerReview,
    canReviewCounterparty: order.status === 'completed' && !currentReview,
    direction: role === 'seller' ? 'buyer' : 'seller',
    review: (currentReview ?? null) as MarketOrderReview | null,
    sellerReview: (sellerReview ?? null) as MarketOrderReview | null,
    buyerReview: (buyerReview ?? null) as MarketOrderReview | null,
    tagOptions,
  });
}
