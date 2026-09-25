import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { setViewedJobsOwner } from '@/lib/viewedJobs';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: 'customer' | 'agency' | 'admin' | null;
  avatar_url: string | null;
  country_id: string | null;
  nationality_country_id: string | null;
  languages: string[] | null;
  occupation: string | null;
  education: string | null;
  specialization: string | null;
  experience: string | null;
  preferred_destination_country_id: string | null;
  username: string | null;
  /** linkedin.com/in/… profile link (20261001090000 migration). */
  linkedin_url?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** True right after a fresh sign-in/sign-up in this browser tab (not on
   *  a page refresh that just restores an existing session) — drives the
   *  one-time "Welcome" popup. Call clearJustSignedIn() once shown. */
  justSignedIn: boolean;
  clearJustSignedIn: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const hasRestoredInitialSession = useRef(false);

  const loadProfile = async (userId: string) => {
    try {
      const cols =
        'id, full_name, email, phone, role, avatar_url, country_id, nationality_country_id, languages, occupation, education, specialization, experience, preferred_destination_country_id, username';
      let { data, error } = await supabase.from('profiles').select(`${cols}, linkedin_url`).eq('id', userId).maybeSingle();
      // Before the linkedin_url migration: load everything else rather than no profile at all.
      if (error && /linkedin_url|column|schema cache/i.test(error.message)) {
        ({ data, error } = await supabase.from('profiles').select(cols).eq('id', userId).maybeSingle());
      }
      if (error) {
        console.error('Profile load failed', error);
        setProfile(null);
        return;
      }
      setProfile(data as Profile | null);
    } catch (err) {
      console.error('Profile load threw unexpectedly', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    // Absolute safety net: if something in the session/profile-loading
    // chain above hangs (a network request that never resolves, an
    // unexpected error path, etc.), never leave the visitor staring at
    // a spinner forever.
    const safetyTimeout = window.setTimeout(() => {
      setLoading((current) => {
        if (current) console.warn('Auth loading timed out after 8s — forcing it to resolve.');
        return false;
      });
    }, 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setViewedJobsOwner(session?.user.id ?? null);
      setSession(session);
      hasRestoredInitialSession.current = true;
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setViewedJobsOwner(session?.user.id ?? null);
      setSession(session);

      // 'SIGNED_IN' fires for a fresh sign-in/sign-up/OAuth completion
      // AND for the initial session restore on some clients, so we only
      // treat it as "fresh" once the initial getSession() above has
      // already resolved (tracked via a ref, since state in this
      // closure would otherwise always read its initial value).
      if (event === 'SIGNED_IN' && hasRestoredInitialSession.current) {
        setJustSignedIn(true);
      }

      if (session?.user) {
        (async () => {
          try {
            await loadProfile(session.user.id);
          } catch (err) {
            // A thrown (not just a Supabase {error}) failure here used to
            // leave the app stuck on the loading spinner forever, since
            // setLoading(false) below would never run. Catch + always
            // fall through to it instead.
            console.error('loadProfile threw unexpectedly', err);
            setProfile(null);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(safetyTimeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const clearJustSignedIn = () => setJustSignedIn(false);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        justSignedIn,
        clearJustSignedIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
