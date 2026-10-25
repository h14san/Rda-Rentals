import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ProfileRow } from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  /** True until the persisted session has been read from secure storage. */
  initializing: boolean;
  /** A profile is "complete" once it has a name and a contact number. */
  needsProfileSetup: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Never carry one account's profile into the next session.
      if (!next) setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (active) setProfile(data ?? null);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const refreshProfile = async () => {
      if (!userId) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      setProfile(data ?? null);
    };

    return {
      session,
      profile,
      initializing,
      // Only assert setup is needed once the profile row has actually loaded,
      // otherwise the first render after sign-in bounces to the setup screen.
      needsProfileSetup:
        !!session && !!profile && (!profile.full_name || !profile.whatsapp_phone),
      refreshProfile,
    };
  }, [session, profile, initializing, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

/** Convenience for screens that are only reachable when signed in. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId called without a session.');
  return session.user.id;
}
