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
import { jobPath, slugify } from '@/lib/jobUrl';
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
  /** Distinct applicants behind `tracked` (rates need ≥3). */
  applicants?: number;
  /** Reports backed by admin-verified evidence. */
  verified?: number;
  viewed_rate?: number | null;
  rejection_rate?: number | null;
  /** 'verified' | 'reported' | 'insufficient' — how reliable the applicant metrics are. */
  reliability?: 'verified' | 'reported' | 'insufficient';
  last90: number;
  rating_count: number;
  response_rate: number | null;
  interview_rate: number | null;
  offer_rate: number | null;
  no_response_rate: number | null;
  /** % of tracked applications answered within 7 days (20261001090000 migration). */
  response_week_rate?: number | null;
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
  /** v2 fields (20261019090000 migration) — absent on the old RPC. */
  country_code?: string | null;
  new_30d?: number;
  /** Listings posted per week, last 12 weeks, oldest first. */
  weekly?: number[];
  countries?: { code: string; name: string; n: number }[];
  country_count?: number;
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
  const v2 = await supabase.rpc('companies_directory_v2');
  if (!v2.error) return (v2.data ?? []) as DirectoryCompany[];
  console.warn('companies_directory_v2 unavailable (run the 20261019090000 migration)', v2.error.message);
  const { data, error } = await supabase.rpc('companies_directory');
  if (error) {
    console.warn('companies_directory unavailable (run the 20260928090000 migration)', error.message);
    return null;
  }
  return (data ?? []) as DirectoryCompany[];
}

// ---------------------------------------------------------------------------
// Application tracking (Applicant Report)
// ---------------------------------------------------------------------------

export type ApplicationStatus = 'clicked' | 'applied' | 'viewed' | 'responded' | 'interview' | 'offer' | 'rejected' | 'no_response_week' | 'no_response' | 'withdrawn';

/** Statuses a user can pick. ('responded' is a legacy value still displayed if present.) */
export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'viewed', label: 'Viewed by company' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_response', label: 'No response' },
  { value: 'withdrawn', label: 'I withdrew' },
];

export const FINAL_STATUSES: ApplicationStatus[] = ['offer', 'rejected', 'no_response'];

/** Structured feedback only — no free text, so reports stay factual. */
export const FEEDBACK_TAGS: { value: string; label: string; tone: 'good' | 'bad' }[] = [
  { value: 'clear_communication', label: 'Clear communication', tone: 'good' },
  { value: 'timely_updates', label: 'Timely updates', tone: 'good' },
  { value: 'respectful_process', label: 'Respectful process', tone: 'good' },
  { value: 'fair_assessment', label: 'Fair assessment', tone: 'good' },
  { value: 'slow_process', label: 'Slow process', tone: 'bad' },
  { value: 'no_feedback_given', label: 'No feedback given', tone: 'bad' },
  { value: 'unclear_requirements', label: 'Unclear requirements', tone: 'bad' },
  { value: 'long_silence', label: 'Long silence', tone: 'bad' },
];

export type ApplicationReport = {
  id: string;
  publisher_id: string;
  listing_kind: 'job' | 'program';
  listing_id: string;
  listing_title: string | null;
  applied_at: string;
  status: ApplicationStatus;
  viewed_at: string | null;
  responded_at: string | null;
  interview_at: string | null;
  offer_at: string | null;
  experience_rating: number | null;
  feedback_tags: string[] | null;
  evidence_path: string | null;
  evidence_status: 'none' | 'pending' | 'verified' | 'rejected';
  excluded: boolean;
  updated_at: string;
  /** Set when the person confirms they applied (20261002090000 migration). */
  confirmed_at?: string | null;
  /** Shown on their public profile. */
  is_public?: boolean;
  /** 3-question check-in (20261014090000 migration). */
  match_answer?: 'full' | 'partly' | 'no' | null;
  accuracy_answer?: 'yes' | 'mostly' | 'no' | null;
  survey_at?: string | null;
  /** When to ask them again (in-app reminder). */
  remind_at?: string | null;
  publisher?: { id: string; name: string; logo_url: string | null } | null;
};

const PENDING_KEY = 'madevisa.pendingApplications.v1';
type PendingApplication = { publisherId: string; kind: 'job' | 'program'; listingId: string; title: string; clickedAt: string };

function readPending(): PendingApplication[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as PendingApplication[];
  } catch {
    return [];
  }
}

/**
 * Records that the user clicked Apply. Signed in → saved straight away.
 * Not signed in → remembered on this device and added to their Applicant
 * Report the next time they're signed in (with the real click time, up
 * to 14 days back). Never blocks applying.
 */
export async function recordApplication(input: { publisherId: string; kind: 'job' | 'program'; listingId: string; title: string }): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const pending = readPending().filter((p) => !(p.kind === input.kind && p.listingId === input.listingId));
      pending.unshift({ ...input, clickedAt: new Date().toISOString() });
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(0, 50)));
      return;
    }
    await supabase.from('application_reports').upsert(
      { publisher_id: input.publisherId, listing_kind: input.kind, listing_id: input.listingId, listing_title: input.title },
      { onConflict: 'user_id,listing_kind,listing_id', ignoreDuplicates: true }
    );
  } catch {
    /* tracking must never block applying */
  }
}

/** Moves Apply clicks made while signed out into the signed-in user's report. */
export async function syncPendingApplications(): Promise<number> {
  const pending = readPending();
  if (!pending.length) return 0;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 0;
  let synced = 0;
  const left: PendingApplication[] = [];
  for (const p of pending) {
    const { error } = await supabase.from('application_reports').upsert(
      { publisher_id: p.publisherId, listing_kind: p.kind, listing_id: p.listingId, listing_title: p.title, applied_at: p.clickedAt },
      { onConflict: 'user_id,listing_kind,listing_id', ignoreDuplicates: true }
    );
    if (error && !/not on MadeVisa/i.test(error.message)) left.push(p);
    else if (!error) synced++;
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(left));
  return synced;
}

const REPORT_COLUMNS =
  'id, publisher_id, listing_kind, listing_id, listing_title, applied_at, status, viewed_at, responded_at, interview_at, offer_at, experience_rating, feedback_tags, evidence_path, evidence_status, excluded, updated_at, publisher:program_publishers(id, name, logo_url)';
const REPORT_COLUMNS_V3 = `${REPORT_COLUMNS}, confirmed_at, is_public`;
const REPORT_COLUMNS_V4 = `${REPORT_COLUMNS_V3}, match_answer, accuracy_answer, survey_at, remind_at`;
const REPORT_COLUMNS_V1 =
  'id, publisher_id, listing_kind, listing_id, listing_title, applied_at, status, responded_at, interview_at, offer_at, experience_rating, updated_at, publisher:program_publishers(id, name, logo_url)';

export async function fetchMyApplicationReports(): Promise<ApplicationReport[]> {
  const load = (cols: string) => supabase.from('application_reports').select(cols).order('applied_at', { ascending: false }).limit(200);
  let res: { data: unknown; error: { message: string } | null } = await load(REPORT_COLUMNS_V4);
  if (res.error && /column|schema cache/i.test(res.error.message)) res = await load(REPORT_COLUMNS_V3);
  if (res.error && /column|schema cache/i.test(res.error.message)) res = await load(REPORT_COLUMNS);
  if (res.error && /column|schema cache/i.test(res.error.message)) {
    // Before the v2 migration: still show what exists.
    res = await supabase.from('application_reports').select(REPORT_COLUMNS_V1).order('applied_at', { ascending: false }).limit(200);
  }
  if (res.error) return [];
  return ((res.data ?? []) as unknown as Partial<ApplicationReport>[]).map((r) => ({
    viewed_at: null,
    feedback_tags: null,
    evidence_path: null,
    evidence_status: 'none',
    excluded: false,
    ...r,
  })) as ApplicationReport[];
}

// ---- Applicant Response Report ------------------------------------------

/** Days after applying before each "no response" choice unlocks (also enforced in the database). */
export const NO_RESPONSE_WEEK_DAYS = 7;
export const NEVER_HEARD_BACK_DAYS = 21;

/** Anything that means the company got back to the applicant (incl. older, more detailed statuses). */
export function hasResponse(r: Pick<ApplicationReport, 'status' | 'responded_at'>): boolean {
  return Boolean(r.responded_at) || ['responded', 'viewed', 'interview', 'offer', 'rejected'].includes(r.status);
}

/** True when the response came within 7 days of applying. */
export function respondedWithinWeek(r: Pick<ApplicationReport, 'applied_at' | 'responded_at'>): boolean {
  if (!r.responded_at) return false;
  return new Date(r.responded_at).getTime() - new Date(r.applied_at).getTime() <= NO_RESPONSE_WEEK_DAYS * 86_400_000;
}

/** "Yes, I applied" — starts tracking this application. */
export async function confirmApplication(id: string) {
  return updateApplicationReport(id, { status: 'applied' });
}

export async function setApplicationPublic(id: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('application_reports').update({ is_public: isPublic }).eq('id', id);
  if (!error) return { ok: true };
  if (/is_public|column|schema cache/i.test(error.message)) return { ok: false, error: 'Public tracking needs a quick database update first (migration 20261002090000).' };
  return { ok: false, error: error.message };
}

export type CompanyResponseRate = { tracked: number; responseRate: number | null; responseWeekRate: number | null };

/** Response rate per company (null rates until there's enough data). Empty map before the 20261002090000 migration. */
export async function fetchCompanyResponseRates(publisherIds: string[]): Promise<Map<string, CompanyResponseRate>> {
  const map = new Map<string, CompanyResponseRate>();
  const ids = [...new Set(publisherIds)].filter(Boolean);
  if (!ids.length) return map;
  const { data, error } = await supabase.rpc('company_response_rates', { pids: ids });
  if (error || !Array.isArray(data)) return map;
  for (const r of data as { publisher_id: string; tracked: number; response_rate: number | null; response_week_rate: number | null }[]) {
    map.set(r.publisher_id, {
      tracked: r.tracked,
      responseRate: r.response_rate == null ? null : Number(r.response_rate),
      responseWeekRate: r.response_week_rate == null ? null : Number(r.response_week_rate),
    });
  }
  return map;
}

export type PublicApplication = {
  id: string;
  listing_kind: 'job' | 'program';
  listing_id: string;
  listing_title: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  applied_at: string;
  status: ApplicationStatus;
  responded_at: string | null;
};

/** Applications someone chose to show on their public profile. */
export async function fetchPublicApplications(username: string): Promise<PublicApplication[]> {
  const { data, error } = await supabase.rpc('get_public_applications', { p_username: username });
  if (error || !Array.isArray(data)) return [];
  return data as PublicApplication[];
}

/** Link to the job/program page an application was made through. */
export function applicationListingPath(r: { listing_kind: 'job' | 'program'; listing_id: string; listing_title: string | null }, company: string): string {
  return r.listing_kind === 'program'
    ? `/programs/${r.listing_id}`
    : jobPath({ id: `sponsored-${r.listing_id}`, title: r.listing_title ?? 'job', company });
}

export async function deleteApplicationReport(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('application_reports').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type ListingStatus = { status: 'published' | 'expired' | 'deleted' | string; removedAt: string | null };

/** Whether each application's job/program is still listed. Empty map before the 20261001090000 migration. */
export async function fetchMyListingStatuses(): Promise<Map<string, ListingStatus>> {
  const { data, error } = await supabase.rpc('my_application_listing_status');
  const map = new Map<string, ListingStatus>();
  if (error || !Array.isArray(data)) return map;
  for (const row of data as { report_id: string; listing_status: string; listing_removed_at: string | null }[]) {
    map.set(row.report_id, { status: row.listing_status, removedAt: row.listing_removed_at });
  }
  return map;
}

export async function updateApplicationReport(
  id: string,
  patch: {
    status?: ApplicationStatus;
    experience_rating?: number | null;
    feedback_tags?: string[] | null;
    evidence_path?: string | null;
    match_answer?: ApplicationReport['match_answer'];
    accuracy_answer?: ApplicationReport['accuracy_answer'];
    remind_at?: string | null;
  }
) {
  const { error } = await supabase.from('application_reports').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Uploads a private screenshot/PDF of the company's reply. Only the user and MadeVisa admins can open it. */
export async function uploadApplicationEvidence(report: ApplicationReport, file: File): Promise<{ ok: boolean; error?: string }> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'File is larger than 5 MB.' };
  if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.type)) return { ok: false, error: 'Use a PNG, JPG, WebP or PDF.' };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'Please sign in again.' };
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${data.user.id}/${report.id}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from('application-evidence').upload(path, file, { upsert: false, contentType: file.type });
  if (up.error) return { ok: false, error: up.error.message };
  if (report.evidence_path) await supabase.storage.from('application-evidence').remove([report.evidence_path]);
  return updateApplicationReport(report.id, { evidence_path: path });
}

export async function removeApplicationEvidence(report: ApplicationReport) {
  if (report.evidence_path) await supabase.storage.from('application-evidence').remove([report.evidence_path]);
  return updateApplicationReport(report.id, { evidence_path: null });
}

export async function evidenceSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('application-evidence').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// ---- Admin: evidence review ----------------------------------------------

export type EvidenceReview = ApplicationReport & { user_id?: string };

export async function fetchPendingEvidence(): Promise<EvidenceReview[]> {
  const { data, error } = await supabase
    .from('application_reports')
    .select(REPORT_COLUMNS)
    .eq('evidence_status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(100);
  if (error) return [];
  return (data ?? []) as unknown as EvidenceReview[];
}

export async function reviewEvidence(id: string, verdict: 'verified' | 'rejected') {
  const { error } = await supabase.from('application_reports').update({ evidence_status: verdict }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setReportExcluded(id: string, excluded: boolean, reason?: string) {
  const { error } = await supabase.from('application_reports').update({ excluded, excluded_reason: excluded ? reason ?? 'Excluded by admin' : null }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- "I applied — track this job" --------------------------------------

/**
 * One tap on a job page: records the application as confirmed (the person
 * says they applied), so tracking and the 3-question check-in start now.
 * Signed out: remembered on this device and added after they sign in.
 */
export async function trackAppliedListing(input: { publisherId: string; kind: 'job' | 'program'; listingId: string; title: string }): Promise<{ ok: boolean; error?: string; signedIn: boolean }> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) {
    await recordApplication(input);
    return { ok: true, signedIn: false };
  }
  await recordApplication(input);
  const { data, error } = await supabase
    .from('application_reports')
    .select('id, status')
    .eq('user_id', s.session.user.id)
    .eq('listing_kind', input.kind)
    .eq('listing_id', input.listingId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start tracking.', signedIn: true };
  if ((data as { status: string }).status === 'clicked') {
    const res = await confirmApplication((data as { id: string }).id);
    if (!res.ok) return { ok: false, error: res.error, signedIn: true };
  }
  return { ok: true, signedIn: true };
}

/** Tracked applications whose check-in is due (for the in-app reminder). */
export async function fetchDueCheckIns(): Promise<{ id: string; listing_id: string; listing_title: string | null; company: string }[]> {
  const { data, error } = await supabase
    .from('application_reports')
    .select('id, listing_id, listing_title, publisher:program_publishers(name)')
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(5);
  if (error || !data) return [];
  return (data as unknown as { id: string; listing_id: string; listing_title: string | null; publisher: { name: string } | null }[]).map((r) => ({
    id: r.id,
    listing_id: r.listing_id,
    listing_title: r.listing_title,
    company: r.publisher?.name ?? 'the company',
  }));
}

export type ClosedJobOutcomes = {
  company: { applications: number; replied_pct: number; interview_pct: number } | null;
  platform: { applications: number; replied_pct: number; interview_pct: number } | null;
  avg_open_days: number | null;
};

const closedCache = new Map<string, Promise<ClosedJobOutcomes | null>>();
export function fetchClosedJobOutcomes(publisherId: string): Promise<ClosedJobOutcomes | null> {
  let p = closedCache.get(publisherId);
  if (!p) {
    p = Promise.resolve(supabase.rpc('closed_job_outcomes', { pid: publisherId })).then(({ data, error }) => (error ? null : (data as ClosedJobOutcomes)));
    closedCache.set(publisherId, p);
  }
  return p;
}
