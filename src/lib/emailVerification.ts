// "Verify your email": sends a one-time sign-in link to the account's
// address. Opening it creates a session that could only come from that
// inbox; mark_email_verified() (migration 20261005090000) then records it.

import { supabase } from '@/lib/supabase';

export const VERIFY_PATH = '/verify-email';
const COOLDOWN_MS = 60_000;
const KEY = 'mv:verifyEmailSentAt';

function lastSentAt(): number {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Seconds until another email can be sent (0 = now). */
export function verifyCooldownLeft(): number {
  return Math.max(0, Math.ceil((lastSentAt() + COOLDOWN_MS - Date.now()) / 1000));
}

export async function sendVerificationEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  if (verifyCooldownLeft() > 0) return { ok: false, error: `Please wait ${verifyCooldownLeft()} s before sending another email.` };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${VERIFY_PATH}` },
  });
  if (error) {
    if (/rate limit|too many|security purposes/i.test(error.message)) {
      return { ok: false, error: 'An email was sent recently. Please check your inbox (and spam), or try again in a few minutes.' };
    }
    return { ok: false, error: error.message };
  }
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode — the server-side rate limit still applies */
  }
  return { ok: true };
}

/** Records the verification for the current session, if it came from an emailed link. */
export async function confirmEmailVerified(): Promise<{ verified: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc('mark_email_verified');
  if (error) return { verified: false, reason: error.message };
  return (data ?? { verified: false }) as { verified: boolean; reason?: string };
}
