// The MadeVisa Network (/network): people who chose to be listed, the
// employers that sponsor visas, and verified recruiters & immigration experts.
//
// Privacy: people come only from the network_directory() database function,
// which returns display fields for opted-in profiles (network_visible and a
// username set). Email, phone and nationality are never returned.

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/auth';

export type NetworkRole = NonNullable<Profile['network_role']>;
export type NetworkIntent = NonNullable<Profile['network_intent']>;

export const ROLE_LABEL: Record<NetworkRole, string> = {
  job_seeker: 'Job seeker',
  hiring_manager: 'Hiring manager',
  recruiter: 'Recruiter',
  visa_expert: 'Immigration expert',
};

export const INTENT_LABEL: Record<NetworkIntent, string> = {
  hiring: "I'm hiring",
  looking: 'Looking for work',
};

export type NetworkPerson = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  network_role: NetworkRole | null;
  network_intent: NetworkIntent | null;
  has_sponsored: boolean;
  linkedin_url: string | null;
  lives_in_code: string | null;
  lives_in_name: string | null;
  company_name: string | null;
  company_verified: boolean | null;
  public_applications: number;
  member_since: string;
};

export type NetworkCounts = { people: number; hiring: number; looking: number; hiring_managers: number; recruiters: number };

/** `null` means the Network migration hasn't run yet. */
export async function fetchNetworkDirectory(opts: { role?: NetworkRole | null; intent?: NetworkIntent | null; search?: string; limit?: number; offset?: number } = {}): Promise<NetworkPerson[] | null> {
  const { data, error } = await supabase.rpc('network_directory', {
    p_role: opts.role ?? null,
    p_intent: opts.intent ?? null,
    p_search: opts.search?.trim() || null,
    p_limit: opts.limit ?? 60,
    p_offset: opts.offset ?? 0,
  });
  if (error) {
    console.warn('network_directory unavailable (run migration 20261018090000)', error.message);
    return null;
  }
  return (data ?? []) as NetworkPerson[];
}

export async function fetchNetworkCounts(): Promise<NetworkCounts | null> {
  const { data, error } = await supabase.rpc('network_counts');
  if (error || !data) return null;
  return data as NetworkCounts;
}

export type NetworkSettings = Pick<Profile, 'network_visible' | 'network_role' | 'network_intent' | 'network_headline' | 'has_sponsored'>;

export async function updateMyNetworkProfile(userId: string, patch: NetworkSettings): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({
      network_visible: Boolean(patch.network_visible),
      network_role: patch.network_role ?? null,
      network_intent: patch.network_intent ?? null,
      network_headline: patch.network_headline?.trim().slice(0, 120) || null,
      has_sponsored: Boolean(patch.has_sponsored),
    })
    .eq('id', userId);
  if (!error) return { ok: true };
  if (/network_|column|schema cache/i.test(error.message)) return { ok: false, error: 'The Network needs a database update first (migration 20261018090000).' };
  return { ok: false, error: error.message };
}

export type RecruitmentOrg = {
  id: string;
  name: string;
  org_type: 'agency' | 'expert';
  description: string | null;
  website: string | null;
  logo_url: string | null;
  country: { name: string; iso_code: string } | null;
};

/** Verified recruitment agencies and immigration experts (public fields only). */
export async function fetchRecruitmentOrgs(): Promise<RecruitmentOrg[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select('id, name, org_type, description, website, logo_url, country:countries(name, iso_code)')
    .in('org_type', ['agency', 'expert'])
    .eq('verification_status', 'verified')
    .order('name');
  if (error) {
    console.warn('fetchRecruitmentOrgs failed', error.message);
    return [];
  }
  return (data ?? []) as unknown as RecruitmentOrg[];
}
