# Pricing audit — three collection cards (2026-11-18)

Matt flagged three of his own collection pairs priced far below their markets. In all
three, the card's headline value anchors on the thinnest/cheapest slice of evidence
while the card's own source line cites deeper evidence 3-4x higher. The delivered
price-index v2 already carries the corrections; the value formula is not using them.

## 1. Adidas Combat Speed 4 — Matt's Orange/Black BNIB, size 8 (card: ~$83)
- Card basis: "new-condition eBay median $83 (4 sales)". Those 4 sales: $43, $65,
  $100.99, $200 — three with no colorway recorded, generic listings.
- v2 flags this model INVERTED (bnib_premium_vs_good 0.33): the used pool carries the
  rare colorways and out-prices the new pool. eBay good median $250 (n=11): David
  Taylor Magic Man M2 $449.99, $400 Best Offer, Teal/Yellow/Pink $355, Watermelon
  $299.95, RWB $280, Marsteller $199.
- IG sold: 49 sales, median $197 (card itself cites IG median $250). Committed NEW
  CS4 sales: $500 (2026-04-29), $425 (2026-07-24), $268, $267 — new pairs trade
  $267-$500 there. Matt bought this pair on Committed for $400.
- Card also says "5 documented sales"; the delivered comp file holds 16 eBay CS4 rows.
- Fix: when condition_flag = INVERTED, never price from the new tier; use the
  good/combined reference (~$200-$250 pooled) and the colorway profile (Orange/Black
  is rare tier, no invented median). A BNIB pair of a rare colorway should sit at or
  above the used-pool reference, not at 1/3 of it.

## 2. Asics Dan Gable Ultimate — Matt's Black/Gold 2006, New no box (card: ~$50)
- The live row is starved by the known catalog duplicate: price-index v2's
  "Other / Dan Gable Ultimate" row carries ZERO sales, while 34 eBay sales sit under
  the Asics-brand rows (median $110, range $40-$199.99) — the duplicate noted in
  problems.txt since Batch 3.
- Card basis "3 documented sales" vs 34 delivered. Card's own line cites IG median
  $212.50 (22 posts) against a $50 headline.
- Exact-colorway evidence: Black/Gold US 10 sold $125 (good), Black/Gold/Silver
  $139.95 (good). A NEW Black/Gold pair references $125-$140+ before any premium.
- Fix: merge the duplicate rows' comp sets onto the live row; headline from the
  merged pool, not the starved one.

## 3. Asics Split Second — Matt's 1997 OG Red, New no box (card: ~$50, range $40-$50)
- eBay pool (19 sales, all "good", median $39.88) is generation-pooled: Split Second
  V / VI / 7 (JY802) reissues at $13-$60. The only vintage entries: Green Camo $149,
  "2006 Rare" $79.99. No new-condition eBay sales at all.
- IG sold: 78 sales, median $176 (v2); card cites IG median $157 across 89 posts.
  The OG/vintage pairs trade on IG, not eBay.
- Card says "5 documented sales" vs 19 delivered eBay rows.
- Fix: generation pooling — a 1997 OG cannot be priced off V/VI/7 reissue sales.
  Where the eBay pool is a different generation mix and IG holds the model's real
  market (78 sold), the IG sold pool is the primary reference.

## General rule proposed
- Headline value never anchors on a tier with n<5 when a deeper pool exists, never
  overrides a condition_flag, and never sits 3-4x below the IG sold median printed
  on the same card without the card saying why.
- Fallback order when the exact tier is thin: colorway profile -> condition tier ->
  combined median (v2 columns carry all three).
- "Documented sales" counts on cards should equal the stored comp counts; today
  they read 5 / 5 / 3 against delivered 16 / 19 / 34 (CS4 / Split Second / DGU).

## 4. Nike Takedown (card: ~$199) — IDENTITY error, not just pricing
- The pictured pair (Navy/White/Total Orange, BNIB, size 10, Matt's collection) is a
  CRONIN CUSTOM — a Cronin Bespoke re-make of the Takedown — per Matt (2026-11-18).
  Cronin re-makes trade $500-$750; Matt puts this pair's eBay reference at $750.
- The platform filed it as a stock Nike Takedown ("Uncommon") and priced it off
  stock-Takedown IG posts (58 posts, IG median $465) at ~$199.
- Per Matt's standing Cronin rule (2026-11-16), re-makes are Cronin products, not
  customized Nikes. The catalog carries a Cronin Combat Speed re-make row but NO
  Cronin Takedown row — this pair is why one is needed.
- Fix: refile the pair under a Cronin Takedown re-make identity with the CUSTOM
  BUILD disclosure tag; price reference is the re-make band ($500-$750), not the
  stock Takedown pool. This is a section 1.6 filing-check catch: photo ID should
  flag re-make construction (quilted panels, non-stock materials) against the
  stock catalog photos.
- Open item it settles: the $615 "Cronin custom" comp currently filed under Nike
  Takedown 4 belongs with the Cronin re-makes.

## 5. Asics EX-EO — Matt's Blue BNIB, size 10 (card: ~$254) — VARIANT pooling
- The pair is an original RUSSIAN EX-EO, purchased for $500+ (Matt, 2026-11-18).
- The card prices it off the pooled EX-EO new-condition eBay median ($253.99,
  5 sales) and IG median $273. Both pools mix the Russian/Soviet-era originals with
  Japanese reissues and modern pairs; the EX-EO eBay pool was the most polluted in
  the whole capture (~518 sold results, only 8 verifiably genuine-model sales
  recorded; the Reps alone trade $140-$155).
- Fix: the Russian original is a distinct variant identity (like the Cronin
  re-make) — it needs its own profile under EX-EO with its own evidence line, and
  originals must never be priced off the reissue pool. Card also claims "1
  documented sale" against 137 IG posts and the delivered comp set.

## Synthesis — five cards, one root cause
Every miss is a pool-definition failure, not a math failure: CS4 (inverted thin
tier), Dan Gable Ultimate (starved duplicate row), Split Second (generation
pooling), Takedown (Cronin re-make filed as stock), EX-EO (origin variant pooled
with reissues). The value in this market lives at the variant level — colorway,
generation, origin, re-make — and pooled model medians erase it. The colorway
profile layer (CS4/Freek/Inflict) is the right direction; it needs to extend to
variant identities: EX-EO Russian Original, Cronin Takedown re-make, Split Second
generations, and the DGU duplicate merge.

## 5b. Second EX-EO — Red/Gold, BNIB with tags (card: ~$254, tagged "Grail")
- Another original EX-EO (Matt, 2026-11-18): brand new WITH TAGS, purchased $750.
- The platform tags this pair GRAIL and still prices it at the identical ~$254 —
  the pooled reissue median stamps every EX-EO with the same number regardless of
  variant, tags, or tier. The tier label and the value contradict each other on
  the same card. Two originals (Russian blue $500+, red/gold BNIB $750) both sit
  at $254 because the pool contains only TWR900 Successor sales ($219-$277).
