import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type MobileCartLine = {
  lineId: string;
  sessionId: string;
  athleteId: string | null;
  scheduledDatetime: string;
  sessionType: string | null;
  price: number;
  coachName: string;
  facilityName: string;
};

type CartContextValue = {
  items: MobileCartLine[];
  count: number;
  total: number;
  loading: boolean;
  refresh: () => Promise<void>;
  addSession: (sessionId: string, athleteId?: string | null) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  setAthlete: (lineId: string, athleteId: string | null) => Promise<void>;
  clear: () => Promise<void>;
  sessionLineCount: (sessionId: string) => number;
};

const MobileCartContext = createContext<CartContextValue | null>(null);

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function MobileCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<MobileCartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
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

      if (error) throw new Error(error.message);
      const now = Date.now();
      const next = (data ?? [])
        .map((row) => {
          const session = unwrapOne(row.sessions);
          if (!session || new Date(session.scheduled_datetime).getTime() <= now) return null;
          const coach = unwrapOne(session.athletes);
          const facility = unwrapOne(session.facilities);
          return {
            lineId: row.id as string,
            sessionId: session.id as string,
            athleteId: (row.athlete_id as string | null) ?? null,
            scheduledDatetime: session.scheduled_datetime as string,
            sessionType: (session.session_type as string | null) ?? null,
            price: Number(session.price_per_participant ?? 0),
            coachName:
              [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim() || 'Coach',
            facilityName: facility?.name || 'Location to be confirmed',
          } satisfies MobileCartLine;
        })
        .filter((row): row is MobileCartLine => row !== null);
      if (version === refreshVersion.current) setItems(next);
    } catch (error) {
      console.warn('[cart] Could not load shared training cart', error);
      if (version === refreshVersion.current) setItems([]);
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSession = useCallback(
    async (sessionId: string, athleteId: string | null = null) => {
      if (!user) throw new Error('Sign in to add training');
      if (
        athleteId &&
        items.some((item) => item.sessionId === sessionId && item.athleteId === athleteId)
      ) {
        throw new Error('That wrestler is already in your cart for this session');
      }
      const { error } = await supabase.from('cart_items').insert({
        user_id: user.id,
        session_id: sessionId,
        athlete_id: athleteId,
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    [items, refresh, user]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', lineId)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      setItems((current) => current.filter((item) => item.lineId !== lineId));
    },
    [user]
  );

  const setAthlete = useCallback(
    async (lineId: string, athleteId: string | null) => {
      if (!user) return;
      const line = items.find((item) => item.lineId === lineId);
      if (
        line &&
        athleteId &&
        items.some(
          (item) =>
            item.lineId !== lineId &&
            item.sessionId === line.sessionId &&
            item.athleteId === athleteId
        )
      ) {
        throw new Error('That wrestler already has a spot in this session');
      }
      const { error } = await supabase
        .from('cart_items')
        .update({ athlete_id: athleteId })
        .eq('id', lineId)
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      setItems((current) =>
        current.map((item) =>
          item.lineId === lineId ? { ...item, athleteId } : item
        )
      );
    },
    [items, user]
  );

  const clear = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id);
    if (error) throw new Error(error.message);
    setItems([]);
  }, [user]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      total: items.reduce((sum, item) => sum + item.price, 0),
      loading,
      refresh,
      addSession,
      removeLine,
      setAthlete,
      clear,
      sessionLineCount: (sessionId: string) =>
        items.filter((item) => item.sessionId === sessionId).length,
    }),
    [addSession, clear, items, loading, refresh, removeLine, setAthlete]
  );

  return <MobileCartContext.Provider value={value}>{children}</MobileCartContext.Provider>;
}

export function useMobileCart() {
  const context = useContext(MobileCartContext);
  if (!context) throw new Error('useMobileCart must be used inside MobileCartProvider');
  return context;
}
