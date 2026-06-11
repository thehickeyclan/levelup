'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';

export type CartSession = {
  /** Stable row id (cart_items.id or client UUID) */
  lineId: string;
  /** Session id */
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  price_per_participant: number | null;
  coach_name: string;
  coach_id: string;
  facility_name: string;
  /** Youth wrestler id for this booking line */
  athlete_id?: string | null;
};

type CartContextType = {
  items: CartSession[];
  addItem: (session: CartSession) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  /** Replace cart with an exact set of lines (e.g. multi-session package link). */
  replaceAllItems: (sessions: CartSession[]) => void;
  isInCart: (sessionId: string) => boolean;
  /** Number of cart lines for this session (e.g. 2 kids = 2) */
  sessionLineCount: (sessionId: string) => number;
  setAthleteForItem: (lineId: string, athleteId: string | null) => void;
  total: number;
  count: number;
  isLoading: boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'guild_cart';

function ensureLineId(item: CartSession): CartSession {
  if (item.lineId) return item;
  return { ...item, lineId: crypto.randomUUID() };
}

function migrateStoredItems(raw: unknown): CartSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: CartSession) => ensureLineId(row));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const [items, setItems] = useState<CartSession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadCart() {
      const supabase = createClient(tenant.slug);
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      if (user) {
        try {
          const { data: cartItems } = await supabase
            .from('cart_items')
            .select(`
              id,
              session_id,
              athlete_id,
              sessions:session_id(
                id,
                scheduled_datetime,
                session_type,
                price_per_participant,
                athlete_id,
                facility_id,
                athletes:athlete_id(first_name, last_name),
                facilities:facility_id(name)
              )
            `)
            .eq('user_id', user.id);

          if (cartItems && cartItems.length > 0) {
            const now = new Date();
            const validItems: CartSession[] = cartItems
              .filter((ci) => {
                const session = Array.isArray(ci.sessions) ? ci.sessions[0] : ci.sessions;
                return session && new Date(session.scheduled_datetime) > now;
              })
              .map((ci) => {
                const session = Array.isArray(ci.sessions) ? ci.sessions[0] : ci.sessions;
                const athlete = session?.athletes ? (Array.isArray(session.athletes) ? session.athletes[0] : session.athletes) : null;
                const facility = session?.facilities ? (Array.isArray(session.facilities) ? session.facilities[0] : session.facilities) : null;
                return {
                  lineId: ci.id,
                  id: session?.id || ci.session_id,
                  scheduled_datetime: session?.scheduled_datetime || '',
                  session_type: session?.session_type || null,
                  price_per_participant: session?.price_per_participant || null,
                  coach_name: athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : 'Coach',
                  coach_id: session?.athlete_id || '',
                  facility_name: facility?.name || 'Facility',
                  athlete_id: ci.athlete_id,
                };
              });
            setItems(validItems);
            setHydrated(true);
            setIsLoading(false);
            return;
          }
        } catch {
          // Table may not exist, fall through to sessionStorage
        }
      }

      try {
        const stored = sessionStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = new Date();
          const validItems = migrateStoredItems(parsed).filter(
            (item: CartSession) => new Date(item.scheduled_datetime) > now
          );
          setItems(validItems);

          if (user && validItems.length > 0) {
            syncToSupabase(user.id, validItems);
          }
        }
      } catch {
        // Ignore storage errors
      }
      setHydrated(true);
      setIsLoading(false);
    }

    loadCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.slug]);

  const syncToSupabase = async (uid: string, cartItems: CartSession[]) => {
    const supabase = createClient(tenant.slug);
    try {
      await supabase.from('cart_items').delete().eq('user_id', uid);

      if (cartItems.length > 0) {
        await supabase.from('cart_items').insert(
          cartItems.map((item) => ({
            id: item.lineId,
            user_id: uid,
            session_id: item.id,
            athlete_id: item.athlete_id || null,
          }))
        );
      }
    } catch {
      // Ignore errors - table may not exist
    }
  };

  useEffect(() => {
    if (hydrated) {
      try {
        sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      } catch {
        // Ignore storage errors
      }

      if (userId) {
        syncToSupabase(userId, items);
      }
    }
  }, [items, hydrated, userId]);

  const addItem = useCallback((session: CartSession) => {
    const next = ensureLineId(session);
    setItems((prev) => {
      if (prev.some((item) => item.lineId === next.lineId)) return prev;
      if (
        next.athlete_id &&
        prev.some((p) => p.id === next.id && p.athlete_id === next.athlete_id)
      ) {
        return prev;
      }
      return [...prev, next];
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((item) => item.lineId !== lineId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const replaceAllItems = useCallback((sessions: CartSession[]) => {
    const next = sessions.map((s) => ensureLineId({ ...s, lineId: s.lineId || crypto.randomUUID() }));
    setItems(next);
    try {
      sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const isInCart = useCallback(
    (sessionId: string) => items.some((item) => item.id === sessionId),
    [items]
  );

  const sessionLineCount = useCallback(
    (sessionId: string) => items.filter((item) => item.id === sessionId).length,
    [items]
  );

  const setAthleteForItem = useCallback((lineId: string, athleteId: string | null) => {
    setItems((prev) =>
      prev.map((item) => (item.lineId === lineId ? { ...item, athlete_id: athleteId } : item))
    );
  }, []);

  const total = items.reduce((sum, item) => sum + (item.price_per_participant ?? 0), 0);
  const count = items.length;

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        replaceAllItems,
        isInCart,
        sessionLineCount,
        setAthleteForItem,
        total,
        count,
        isLoading,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
