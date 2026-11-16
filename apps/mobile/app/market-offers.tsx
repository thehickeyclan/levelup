import { Redirect } from 'expo-router';

/** Offers merged into the single Activity feed; old links land there. */
export default function MarketOffersRedirect() {
  return <Redirect href="/market-activity" />;
}
