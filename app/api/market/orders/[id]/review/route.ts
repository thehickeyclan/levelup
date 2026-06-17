import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

const REVIEW_TAGS = ['As described', 'Fast shipping', 'Great communication', 'Would buy again'];

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
  if (order.buyer_id !== user!.id) {
    return NextResponse.json({ error: 'Only the buyer can leave seller feedback' }, { status: 403 });
  }
  if (order.status !== 'completed') {
    return NextResponse.json({ error: 'Feedback is available after the order is completed' }, { status: 400 });
  }

  const tags = (body.tags ?? []).filter((t) => REVIEW_TAGS.includes(t)).slice(0, 4);
  const comment = body.comment?.trim().slice(0, 500) || null;

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

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already left feedback for this order' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review: data });
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

  const { data: review } = await supabase
    .from('market_seller_reviews')
    .select('id, rating, comment, tags, created_at, buyer_id')
    .eq('order_id', orderId)
    .maybeSingle();

  return NextResponse.json({
    canReview: order.buyer_id === user!.id && order.status === 'completed' && !review,
    review: review ?? null,
    tagOptions: REVIEW_TAGS,
  });
}
