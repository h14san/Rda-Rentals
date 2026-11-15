import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { accountModeOf, type AccountMode } from '@/features/auth/mode';
import type { ProfileRow, StaffRole } from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  /**
   * Staff roles, read from user_roles (RLS: your own rows only). Only decides
   * which screens are offered; every staff action is re-checked in the database.
   */
  roles: StaffRole[];
  isStaff: boolean;
  /**
   * Guest, host or both, from the user's own auth metadata. Arranges the tabs
   * and nothing else; it is never a permission. Null until chosen at setup.
   */
  mode: AccountMode | null;
  /** True until the persisted session has been read from secure storage. */
  initializing: boolean;
  /** Complete once it has a name and the account has said what it is here for. */
  needsProfileSetup: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
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
      // Never carry one account's profile or roles into the next session.
      if (!next) {
        setProfile(null);
        setRoles([]);
      }
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
      const [{ data }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (!active) return;
      setProfile(data ?? null);
      setRoles((roleRows ?? []).map((r) => r.role));
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
      roles,
      isStaff: roles.length > 0,
      mode: accountModeOf(session),
      initializing,
      // Only assert setup is needed once the profile row has actually loaded,
      // otherwise the first render after sign-in bounces to the setup screen.
      needsProfileSetup:
        !!session && !!profile && (!profile.full_name || !accountModeOf(session)),
      refreshProfile,
    };
  }, [session, profile, roles, initializing, userId]);

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
