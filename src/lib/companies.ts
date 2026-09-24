// Public company profiles + applicant-response tracking.
//
// Every company (program_publishers row) automatically gets a page at
//   /companies/<name-slug>-<first 8 chars of its id>
// with its live jobs & programs and statistics computed from MadeVisa's
// own data (see the 20260928090000 migration):
//   - hiring activity: active / closed listings, posting frequency
//   - applicant response: applications tracked through MadeVisa, response
//     rate, average response time, interview & offer rates, experience
//     rating — aggregated server-side, withheld below 5 applications.

import { supabase } from '@/lib/supabase';
import { slugify } from '@/lib/jobUrl';
import type { OrgType } from '@/lib/programs';

export type CompanyProfile = {
  id: string;
  name: string;
  org_type: OrgType;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  verification_status: string;
  owner_id: string | null;
  country: { name: string; iso_code: string } | null;
};

export type CompanyInsights = {
  active_jobs: number;
  active_programs: number;
  closed_90d: number;
  posted_30d: number;
  posted_90d: number;
  first_listed: string | null;
  last_listed: string | null;
  last_synced: string | null;
  top_functions: string[];
  top_countries: { name: string; code: string; n: number }[];
  tracked: number;
  last90: number;
  rating_count: number;
  response_rate: number | null;
  interview_rate: number | null;
  offer_rate: number | null;
  no_response_rate: number | null;
  avg_response_days: number | null;
  rating: number | null;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
};

export type DirectoryCompany = {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  org_type: string;
  country_name: string | null;
  active_jobs: number;
  active_programs: number;
  posted_30d: number;
  tracked: number;
  response_rate: number | null;
  avg_response_days: number | null;
  last_listed: string | null;
};

export function companyPath(c: { id: string; name: string }): string {
  return `/companies/${slugify(c.name) || 'company'}-${c.id.slice(0, 8)}`;
}

const PROFILE_COLUMNS = 'id, name, org_type, logo_url, website, description, verification_status, owner_id, country:countries(name, iso_code)';

/** Resolves /companies/<slug>-<8 hex> (or a full uuid) to the company. */
export async function fetchCompanyBySlug(slug: string): Promise<CompanyProfile | null> {
  const full = slug.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0];
  let q = supabase.from('program_publishers').select(PROFILE_COLUMNS);
  if (full) q = q.eq('id', full);
  else {
    const prefix = slug.match(/([0-9a-f]{8})$/i)?.[1]?.toLowerCase();
    if (!prefix) return null;
    q = q.gte('id', `${prefix}-0000-0000-0000-000000000000`).lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`);
  }
  const { data, error } = await q.limit(5);
  if (error || !data?.length) return null;
  const rows = data as unknown as CompanyProfile[];
  const nameSlug = slug.replace(/-?[0-9a-f]{8}$/i, '');
  return rows.find((r) => slugify(r.name) === nameSlug) ?? rows[0];
}

export async function fetchCompanyInsights(publisherId: string): Promise<CompanyInsights | null> {
  const { data, error } = await supabase.rpc('company_insights', { pid: publisherId });
  if (error) {
    console.warn('company_insights unavailable (run the 20260928090000 migration)', error.message);
    return null;
  }
  return data as CompanyInsights;
}

export async function fetchCompaniesDirectory(): Promise<DirectoryCompany[] | null> {
  const { data, error } = await supabase.rpc('companies_directory');
  if (error) {
    console.warn('companies_directory unavailable (run the 20260928090000 migration)', error.message);
    return null;
  }
  return (data ?? []) as DirectoryCompany[];
}

// ---------------------------------------------------------------------------
// Application tracking (signed-in users)
// ---------------------------------------------------------------------------

export type ApplicationStatus = 'applied' | 'responded' | 'interview' | 'offer' | 'rejected' | 'no_response' | 'withdrawn';

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'applied', label: 'Applied — waiting' },
  { value: 'responded', label: 'Got a response' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer 🎉' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_response', label: 'No response' },
  { value: 'withdrawn', label: 'I withdrew' },
];

export type ApplicationReport = {
  id: string;
  publisher_id: string;
  listing_kind: 'job' | 'program';
  listing_id: string;
  listing_title: string | null;
  applied_at: string;
  status: ApplicationStatus;
  responded_at: string | null;
  experience_rating: number | null;
  publisher?: { id: string; name: string; logo_url: string | null } | null;
};

/**
 * Records that the signed-in user applied through MadeVisa. Called when
 * they click Apply. Silently does nothing for visitors who aren't signed
 * in, for live-feed jobs without a company record, or if already recorded.
 */
export async function recordApplication(input: { publisherId: string; kind: 'job' | 'program'; listingId: string; title: string }): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.from('application_reports').upsert(
      { publisher_id: input.publisherId, listing_kind: input.kind, listing_id: input.listingId, listing_title: input.title },
      { onConflict: 'user_id,listing_kind,listing_id', ignoreDuplicates: true }
    );
  } catch {
    /* tracking must never block applying */
  }
}

export async function fetchMyApplicationReports(): Promise<ApplicationReport[]> {
  const { data, error } = await supabase
    .from('application_reports')
    .select('id, publisher_id, listing_kind, listing_id, listing_title, applied_at, status, responded_at, experience_rating, publisher:program_publishers(id, name, logo_url)')
    .order('applied_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as unknown as ApplicationReport[];
}

export async function updateApplicationReport(id: string, patch: { status?: ApplicationStatus; experience_rating?: number | null }) {
  const { error } = await supabase.from('application_reports').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
