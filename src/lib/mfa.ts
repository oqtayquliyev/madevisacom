// Two-step login with an authenticator app (Supabase MFA, TOTP).
// For admins it's more than a nice-to-have: once set up, the database only
// grants admin powers to sessions that passed the 6-digit code (see
// migration 20261006090000_admin_role_lock_and_mfa.sql).

import { supabase } from '@/lib/supabase';

export type TotpFactor = { id: string; friendly_name?: string | null; status: string; created_at: string };

/** Does this session still need the 6-digit code? */
export async function needsMfaCode(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export async function isMfaSession(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === 'aal2';
}

export async function listTotpFactors(): Promise<{ verified: TotpFactor[]; all: TotpFactor[] }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { verified: [], all: [] };
  const all = (data.all ?? []).filter((f) => f.factor_type === 'totp') as unknown as TotpFactor[];
  return { verified: all.filter((f) => f.status === 'verified'), all };
}

/** Starts setup: returns the QR code (an SVG image) and the manual-entry key. */
export async function startTotpSetup(): Promise<{ ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string }> {
  // Clear half-finished setups first — an unfinished one blocks a new start.
  const { all } = await listTotpFactors();
  for (const f of all.filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'MadeVisa',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start setup.' };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code (finishes setup, or upgrades the session at sign-in). */
export async function verifyTotpCode(factorId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return { ok: false, error: 'Enter the 6-digit code from your app.' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (error) {
    if (/invalid|expired/i.test(error.message)) return { ok: false, error: "That code didn't match. Codes change every 30 seconds — try the current one." };
    if (/too many|rate/i.test(error.message)) return { ok: false, error: 'Too many attempts. Wait a minute and try again.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeTotp(factorId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    if (/aal2|assurance/i.test(error.message)) return { ok: false, error: 'For safety, sign out and sign in again with your code first, then turn it off.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
