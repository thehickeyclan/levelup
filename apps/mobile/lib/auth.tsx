import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { registerForPushNotifications, unregisterPushToken } from './push';
import { clearSelectedCoach, getSelectedCoach, saveSelectedCoach } from './coach-preview';

export type AppRole = 'parent' | 'coach' | 'admin' | 'youth_wrestler' | string;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  /** Effective UI mode — coach when role is coach, or when preview is on. */
  isCoachView: boolean;
  previewCoachView: boolean;
  setPreviewCoachView: (on: boolean) => void;
  /** Coach/admin only: browse the app as a parent (mirrors web view-as). */
  previewParentView: boolean;
  setPreviewParentView: (on: boolean) => void;
  /** Testing only: browse the family side with athlete-specific copy and milestones. */
  previewAthleteView: boolean;
  setPreviewAthleteView: (on: boolean) => void;
  selectedCoachId: string | null;
  selectedCoachName: string | null;
  selectCoach: (id: string, name: string) => Promise<void>;
  clearCoachSelection: () => Promise<void>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppRole | null>;
  signOut: () => Promise<void>;
};

const PREVIEW_KEY = 'guild.previewCoachView';
const PREVIEW_PARENT_KEY = 'guild.previewParentView';
const PREVIEW_ATHLETE_KEY = 'guild.previewAthleteView';
const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  return (data?.role as AppRole | undefined) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [previewCoachView, setPreviewCoachViewState] = useState(false);
  const [previewParentView, setPreviewParentViewState] = useState(false);
  const [previewAthleteView, setPreviewAthleteViewState] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedCoachName, setSelectedCoachName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [{ data }, previewRaw, previewParentRaw, previewAthleteRaw, selectedCoach] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(PREVIEW_KEY),
        AsyncStorage.getItem(PREVIEW_PARENT_KEY),
        AsyncStorage.getItem(PREVIEW_ATHLETE_KEY),
        getSelectedCoach(),
      ]);
      if (!mounted) return;
      setPreviewCoachViewState(previewRaw === '1');
      setPreviewParentViewState(previewParentRaw === '1');
      setPreviewAthleteViewState(previewAthleteRaw === '1');
      setSelectedCoachId(selectedCoach.id);
      setSelectedCoachName(selectedCoach.name);
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
      isCoachView: (isCoachRole && !previewParentView && !previewAthleteView) || previewCoachView,
      previewCoachView,
      setPreviewCoachView: (on: boolean) => {
        setPreviewCoachViewState(on);
        void AsyncStorage.setItem(PREVIEW_KEY, on ? '1' : '0');
        if (on) {
          setPreviewParentViewState(false);
          setPreviewAthleteViewState(false);
          void AsyncStorage.multiSet([
            [PREVIEW_PARENT_KEY, '0'],
            [PREVIEW_ATHLETE_KEY, '0'],
          ]);
        }
      },
      previewParentView,
      setPreviewParentView: (on: boolean) => {
        setPreviewParentViewState(on);
        void AsyncStorage.setItem(PREVIEW_PARENT_KEY, on ? '1' : '0');
        if (on) {
          setPreviewCoachViewState(false);
          setPreviewAthleteViewState(false);
          void AsyncStorage.multiSet([
            [PREVIEW_KEY, '0'],
            [PREVIEW_ATHLETE_KEY, '0'],
          ]);
        }
      },
      previewAthleteView,
      setPreviewAthleteView: (on: boolean) => {
        setPreviewAthleteViewState(on);
        void AsyncStorage.setItem(PREVIEW_ATHLETE_KEY, on ? '1' : '0');
        if (on) {
          setPreviewCoachViewState(false);
          setPreviewParentViewState(false);
          void AsyncStorage.multiSet([
            [PREVIEW_KEY, '0'],
            [PREVIEW_PARENT_KEY, '0'],
          ]);
        }
      },
      selectedCoachId,
      selectedCoachName,
      async selectCoach(id, name) {
        await saveSelectedCoach(id, name);
        setSelectedCoachId(id);
        setSelectedCoachName(name);
      },
      async clearCoachSelection() {
        await clearSelectedCoach();
        setSelectedCoachId(null);
        setSelectedCoachName(null);
      },
      loading,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        const nextRole = data.user ? await fetchRole(data.user.id) : null;
        if (data.user) setRole(nextRole);
        await registerForPushNotifications();
        return nextRole;
      },
      async signOut() {
        await unregisterPushToken();
        await clearSelectedCoach();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setRole(null);
      },
    };
  }, [
    session,
    role,
    previewCoachView,
    previewParentView,
    previewAthleteView,
    selectedCoachId,
    selectedCoachName,
    loading,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
