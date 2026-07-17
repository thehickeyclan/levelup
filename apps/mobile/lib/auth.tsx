import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { registerForPushNotifications, unregisterPushToken } from './push';

export type AppRole = 'parent' | 'coach' | 'admin' | 'youth_wrestler' | string;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  /** Effective UI mode — coach when role is coach, or when preview is on. */
  isCoachView: boolean;
  previewCoachView: boolean;
  setPreviewCoachView: (on: boolean) => void;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const PREVIEW_KEY = 'guild.previewCoachView';
const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  return (data?.role as AppRole | undefined) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [previewCoachView, setPreviewCoachViewState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [{ data }, previewRaw] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(PREVIEW_KEY),
      ]);
      if (!mounted) return;
      setPreviewCoachViewState(previewRaw === '1');
      setSession(data.session);
      if (data.session?.user) {
        setRole(await fetchRole(data.session.user.id));
        void registerForPushNotifications();
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        void fetchRole(next.user.id).then(setRole);
        void registerForPushNotifications();
      } else {
        setRole(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isCoachRole = role === 'coach' || role === 'admin';
    return {
      session,
      user: session?.user ?? null,
      role,
      isCoachView: isCoachRole || previewCoachView,
      previewCoachView,
      setPreviewCoachView: (on: boolean) => {
        setPreviewCoachViewState(on);
        void AsyncStorage.setItem(PREVIEW_KEY, on ? '1' : '0');
      },
      loading,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user) setRole(await fetchRole(data.user.id));
        await registerForPushNotifications();
      },
      async signOut() {
        await unregisterPushToken();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setRole(null);
      },
    };
  }, [session, role, previewCoachView, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
