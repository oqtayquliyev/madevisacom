import { supabase } from '@/lib/supabase';

const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Slugifies a display name into a starting suggestion — the user can still edit it. */
export function suggestUsername(fullName: string | null): string {
  const base = (fullName ?? 'traveler')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return base || 'traveler';
}

export async function isUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('isUsernameAvailable failed', error);
    return false;
  }
  return !data || data.id === currentUserId;
}

export async function updateMyUsername(username: string): Promise<{ ok: boolean; error?: string }> {
  const clean = username.trim().toLowerCase();
  if (!isValidUsername(clean)) {
    return { ok: false, error: '3-30 characters: lowercase letters, numbers, hyphens or underscores only.' };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const available = await isUsernameAvailable(clean, user.id);
  if (!available) return { ok: false, error: 'That username is already taken.' };

  const { error } = await supabase.from('profiles').update({ username: clean }).eq('id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PublicProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  username: string;
  linkedin_url?: string | null;
  publisher_name: string | null;
  publisher_org_type: string | null;
  publisher_verification_status: string | null;
};

export async function fetchPublicProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('get_public_profile_by_username', { p_username: username });
  if (error) {
    console.error('fetchPublicProfileByUsername failed', error);
    return null;
  }
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// LinkedIn profile link
// ---------------------------------------------------------------------------

/**
 * Turns what people paste ("linkedin.com/in/jane-doe", "www.linkedin.com/in/jane-doe/?trk=…",
 * a full https URL) into the canonical "https://www.linkedin.com/in/jane-doe".
 * Null when it isn't a personal LinkedIn profile link.
 */
export function normalizeLinkedInUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/in\/([A-Za-z0-9_%.-]{2,100})\/?$/);
  if (!m) return null;
  return `https://www.linkedin.com/in/${m[1]}`;
}

export async function updateMyLinkedIn(userId: string, url: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('profiles').update({ linkedin_url: url }).eq('id', userId);
  if (!error) return { ok: true };
  if (/linkedin_url|column|schema cache/i.test(error.message)) {
    return { ok: false, error: 'LinkedIn links need a quick database update first (migration 20261001090000).' };
  }
  return { ok: false, error: error.message };
}
