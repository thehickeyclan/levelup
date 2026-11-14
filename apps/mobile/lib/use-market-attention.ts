import { useCallback, useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { apiFetch } from './api';
import { useAuth } from './auth';

const MARKET_ATTENTION_CHANGED = 'guild-market-attention-changed';

export function notifyMarketAttentionChanged() {
  DeviceEventEmitter.emit(MARKET_ATTENTION_CHANGED);
}

export type MarketAttentionItem = {
  kind: 'incoming' | 'pay';
  offer_id: string;
  listing_id: string | null;
  listing_title: string;
  amount_cents: number | null;
};

export type MarketAttention = {
  incoming: number;
  awaiting_payment: number;
  total: number;
  items: MarketAttentionItem[];
};

const EMPTY: MarketAttention = { incoming: 0, awaiting_payment: 0, total: 0, items: [] };

/**
 * What in the marketplace needs this user right now: pending offers on their
 * listings plus accepted offers of theirs awaiting payment. Backs the Market
 * tab badge, the Market activity strip, and the My Market Offers count.
 * Pass `poll: true` from exactly one always-mounted spot (the tab layout);
 * screens refresh on focus/resume and on the changed event.
 */
export function useMarketAttention(options?: { poll?: boolean }) {
  const poll = options?.poll === true;
  const { user } = useAuth();
  const [attention, setAttention] = useState<MarketAttention>(EMPTY);

  const refresh = useCallback(async () => {
    if (!user) {
      setAttention(EMPTY);
      return;
    }
    try {
      const result = await apiFetch<Partial<MarketAttention>>('/api/market/attention');
      setAttention({
        incoming: Math.max(0, Number(result.incoming ?? 0)),
        awaiting_payment: Math.max(0, Number(result.awaiting_payment ?? 0)),
        total: Math.max(0, Number(result.total ?? 0)),
        items: Array.isArray(result.items) ? result.items : [],
      });
    } catch {
      // Keep the last known state during a temporary connection failure.
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const localSubscription = DeviceEventEmitter.addListener(
      MARKET_ATTENTION_CHANGED,
      () => void refresh()
    );
    const interval = poll ? setInterval(() => void refresh(), 60_000) : null;
    return () => {
      if (interval) clearInterval(interval);
      appStateSubscription.remove();
      localSubscription.remove();
    };
  }, [user, poll, refresh]);

  return { attention, refresh };
}
