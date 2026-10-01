// Invite links: madevisa.com/?ref=<code>. The inviter earns 2 document
// credits when the person they invited makes their first paid purchase.
// All checks and rewards happen in the database (migration 20261116090000);
// this file only remembers the code and hands it over after sign-up.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

const KEY = 'mv:ref';
const TTL = 30 * 86_400_000;

/** Remember ?ref=… from the URL (first invite wins, kept 30 days). */
export function captureReferral(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (!code || !/^[a-z0-9]{8}$/i.test(code)) return;
    const old = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { code: string; at: number } | null;
    if (old && Date.now() - old.at < TTL) return;
    window.localStorage.setItem(KEY, JSON.stringify({ code: code.toLowerCase(), at: Date.now() }));
  } catch {
    /* storage blocked — invites just won't be tracked */
  }
}

/** After sign-in: hand the remembered code to the server once. */
export async function claimStoredReferral(): Promise<void> {
  let code: string | null = null;
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { code: string; at: number } | null;
    if (v && Date.now() - v.at < TTL) code = v.code;
    if (!code) window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
  if (!code) return;
  const { error } = await supabase.rpc('claim_referral', { p_code: code });
  // Any answer from the server (ok, self, too old…) is final; keep it only on network errors.
  if (!error || !/fetch|network/i.test(error.message)) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Mount once in App: captures ?ref= and claims it after sign-in. */
export function useReferralCapture(): void {
  const { session } = useAuth();
  useEffect(() => {
    captureReferral();
  }, []);
  useEffect(() => {
    if (session) void claimStoredReferral();
  }, [session]);
}

export type MyReferral = { code: string; joined: number; paid: number; credits: number };

export function useMyReferral(): MyReferral | null {
  const { session } = useAuth();
  const [data, setData] = useState<MyReferral | null>(null);
  useEffect(() => {
    if (!session) return setData(null);
    let alive = true;
    supabase.rpc('my_referral').then(({ data: d, error }) => alive && !error && d && setData(d as MyReferral));
    return () => {
      alive = false;
    };
  }, [session]);
  return data;
}

export const inviteUrl = (code: string) => `https://madevisa.com/?ref=${code}`;
