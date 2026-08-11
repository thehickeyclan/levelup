-- Allows sellers to leave feedback for buyers after a completed market order.
-- Buyer-to-seller feedback already lives in market_seller_reviews.

create table if not exists public.market_buyer_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.market_orders(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists market_buyer_reviews_buyer_id_idx
  on public.market_buyer_reviews (buyer_id);

create index if not exists market_buyer_reviews_seller_id_idx
  on public.market_buyer_reviews (seller_id);

alter table public.market_buyer_reviews enable row level security;

drop policy if exists "market_buyer_reviews_select" on public.market_buyer_reviews;
create policy "market_buyer_reviews_select"
  on public.market_buyer_reviews
  for select
  using (true);

drop policy if exists "market_buyer_reviews_insert_seller" on public.market_buyer_reviews;
create policy "market_buyer_reviews_insert_seller"
  on public.market_buyer_reviews
  for insert
  with check (
    seller_id = auth.uid()
    and exists (
      select 1
      from public.market_orders o
      where o.id = order_id
        and o.seller_id = auth.uid()
        and o.buyer_id = buyer_id
        and o.status = 'completed'
    )
  );

