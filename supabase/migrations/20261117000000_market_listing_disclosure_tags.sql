-- Mandatory disclosure tags (docs/market-listing-standards.md §3).
-- Hand-applied to prod per the repo's migration practice.
alter table public.market_listings
  add column if not exists disclosure_tags text[] not null default '{}';

comment on column public.market_listings.disclosure_tags is
  'Standards §3 disclosure tag codes (sole_swapped, repaired, custom_painted, custom_build, mismatched_pair, display_only, no_box). Whitelist enforced in lib/market/disclosure-tags.ts.';

NOTIFY pgrst, 'reload schema';
