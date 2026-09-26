import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  adminLogin: (username: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  };

  const adminLogin = async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const response = await fetch(`${supabaseUrl}/functions/v1/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ username: cleanUsername, password: cleanPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.email && data.oneTimePassword) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.oneTimePassword,
          });

          if (signInError) {
            return { error: 'Failed to establish admin session: ' + signInError.message };
          }
          return { error: null };
        }
      }

      // If edge function returned 404 (not deployed yet) or 500, fallback to direct Supabase auth
      if (response.status === 404 || response.status === 502 || response.status === 503) {
        const emailVariant = cleanUsername.includes('@')
          ? cleanUsername
          : `${cleanUsername}@admin.local`;

        const { error: directError } = await supabase.auth.signInWithPassword({
          email: emailVariant,
          password: cleanPassword,
        });

        if (!directError) return { error: null };
      }

      const errData = await response.json().catch(() => null);
      return {
        error: errData?.error ?? 'Invalid username or password.',
      };
    } catch {
      // In case edge function domain is unreachable, try direct auth
      const emailVariant = cleanUsername.includes('@')
        ? cleanUsername
        : `${cleanUsername}@admin.local`;

      const { error: directError } = await supabase.auth.signInWithPassword({
        email: emailVariant,
        password: cleanPassword,
      });

      if (!directError) return { error: null };
      return { error: 'Unable to reach authentication server. Please check your connection.' };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Google OAuth failed to initialize.' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user, loading, signInWithPassword, adminLogin, signInWithGoogle, signOut }}
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
