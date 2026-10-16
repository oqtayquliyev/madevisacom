// "Share your application experience" — applications made outside MadeVisa.
// Users submit; admins review (link to an existing company, create it, or
// reject); approved reports show on the company page as counts.
// See supabase/migrations/20261020090000_company_experience_reports.sql.

import { supabase } from '@/lib/supabase';
import { companyPath } from '@/lib/companies';

export type ExperienceOutcome = 'no_response' | 'rejected' | 'responded' | 'interview' | 'offer';
export type ExperienceChannel = 'company_site' | 'linkedin' | 'job_board' | 'referral' | 'recruiter' | 'other';
export type ExperienceStatus = 'pending' | 'approved' | 'rejected';

export const EXPERIENCE_OUTCOMES: { value: ExperienceOutcome; label: string; hint: string }[] = [
  { value: 'no_response', label: 'No response', hint: 'Never heard back' },
  { value: 'rejected', label: 'Rejected', hint: 'Got a rejection' },
  { value: 'responded', label: 'They replied', hint: 'Got a reply or next steps' },
  { value: 'interview', label: 'Interview', hint: 'Was invited to interview' },
  { value: 'offer', label: 'Offer', hint: 'Received an offer' },
];

export const EXPERIENCE_CHANNELS: { value: ExperienceChannel; label: string }[] = [
  { value: 'company_site', label: "Company's careers site" },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'job_board', label: 'Another job board' },
  { value: 'referral', label: 'Referral' },
  { value: 'recruiter', label: 'Recruiter / agency' },
  { value: 'other', label: 'Other' },
];

export const OUTCOME_LABEL = Object.fromEntries(EXPERIENCE_OUTCOMES.map((o) => [o.value, o.label])) as Record<ExperienceOutcome, string>;
export const CHANNEL_LABEL = Object.fromEntries(EXPERIENCE_CHANNELS.map((c) => [c.value, c.label])) as Record<ExperienceChannel, string>;

export type ExperienceInput = {
  companyName: string;
  companyWebsite?: string;
  countryId?: string | null;
  roleTitle?: string;
  appliedOn: string; // yyyy-mm-dd
  channel: ExperienceChannel;
  outcome: ExperienceOutcome;
  replyDays?: number | null;
  publisherId?: string | null;
  /** "How well did you match the requirements?" 0–100. */
  matchPct?: number | null;
  /** Time spent on the form (very fast submissions are refused). */
  formMs?: number | null;
};

/** "When did you apply?" as quick choices — stored as an approximate date. */
export const APPLIED_WHEN: { key: string; label: string; days: number }[] = [
  { key: 'week', label: 'This week', days: 3 },
  { key: 'month', label: '1–4 weeks ago', days: 14 },
  { key: 'q', label: '1–3 months ago', days: 45 },
  { key: 'half', label: '3–6 months ago', days: 120 },
  { key: 'year', label: '6–12 months ago', days: 270 },
  { key: 'older', label: 'Over a year ago', days: 500 },
];

/** "How fast did they first reply?" quick choices, in days. */
export const REPLY_AFTER: { key: string; label: string; days: number }[] = [
  { key: 'w1', label: 'Within a week', days: 4 },
  { key: 'w2', label: '1–2 weeks', days: 10 },
  { key: 'w4', label: '2–4 weeks', days: 21 },
  { key: 'm1', label: 'Over a month', days: 45 },
];

export const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function submitCompanyExperience(input: ExperienceInput): Promise<{ ok: boolean; error?: string }> {
  const website = input.companyWebsite?.trim();
  const { error } = await supabase.from('company_experience_reports').insert({
    company_name: input.companyName.trim(),
    company_website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    country_id: input.countryId || null,
    role_title: input.roleTitle?.trim() || null,
    applied_on: input.appliedOn,
    channel: input.channel,
    outcome: input.outcome,
    reply_days: input.outcome === 'no_response' ? null : input.replyDays ?? null,
    publisher_id: input.publisherId ?? null,
    match_pct: input.matchPct ?? null,
    form_ms: input.formMs ?? null,
  });
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) return { ok: false, error: 'This feature is not switched on yet. Please try again later.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type ExperienceSummary = {
  /** People who shared (each counts once per company). */
  total: number;
  /** True until 3 different people have shared — only the count is public then. */
  hidden?: boolean;
  reporters: number;
  no_response: number;
  rejected: number;
  responded: number;
  interview: number;
  offer: number;
  avg_reply_days: number | null;
  last_applied: string | null;
  /** 0–100, fairly weighted (see 20261023090000_fair_experience_score.sql). */
  score?: number | null;
  avg_match?: number | null;
  verified?: number | null;
};

export async function fetchExperienceSummary(publisherId: string): Promise<ExperienceSummary | null> {
  const { data, error } = await supabase.rpc('company_experience_summary', { pid: publisherId });
  if (error || !data) return null;
  return data as ExperienceSummary;
}

export type CountryOption = { id: string; name: string; iso_code: string };
let countriesCache: CountryOption[] | null = null;
export async function fetchCountryOptions(): Promise<CountryOption[]> {
  if (countriesCache) return countriesCache;
  const { data } = await supabase.from('countries').select('id, name, iso_code').order('name');
  countriesCache = (data ?? []) as CountryOption[];
  return countriesCache;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type ExperienceReport = {
  id: string;
  user_id: string;
  company_name: string;
  company_website: string | null;
  country_id: string | null;
  role_title: string | null;
  applied_on: string;
  channel: ExperienceChannel;
  outcome: ExperienceOutcome;
  reply_days: number | null;
  publisher_id: string | null;
  status: ExperienceStatus;
  admin_note: string | null;
  created_at: string;
  match_pct?: number | null;
  email_verified?: boolean;
  form_ms?: number | null;
  country?: { name: string; iso_code: string } | null;
  publisher?: { id: string; name: string } | null;
};

export const EXPERIENCES_PAGE = 30;

export async function fetchExperienceReports(status: ExperienceStatus | 'all', before?: string): Promise<{ rows: ExperienceReport[]; error?: string }> {
  let q = supabase
    .from('company_experience_reports')
    .select('*, country:countries(name, iso_code), publisher:program_publishers(id, name)')
    .order('created_at', { ascending: false })
    .limit(EXPERIENCES_PAGE);
  if (status !== 'all') q = q.eq('status', status);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) {
    const missing = /relation .* does not exist|schema cache/i.test(error.message);
    return { rows: [], error: missing ? 'Run the 20261020090000_company_experience_reports migration to turn this on.' : error.message };
  }
  return { rows: (data ?? []) as unknown as ExperienceReport[] };
}

export type PublisherMatch = { id: string; name: string; website: string | null; verification_status: string; country: { name: string } | null };

/** Companies whose name (or website) looks like the reported one — to catch the same company under another name. */
export async function findPublisherMatches(name: string, website?: string | null): Promise<PublisherMatch[]> {
  const cols = 'id, name, website, verification_status, country:countries(name)';
  const words = name
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|gmbh|ag|plc|group|corp(oration)?|company|co|sa|bv|nv|se)\b\.?/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .slice(0, 3);
  const host = website?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  const ors = [`name.ilike.%${name.trim().replace(/[%,()]/g, ' ')}%`, ...words.map((w) => `name.ilike.%${w}%`)];
  if (host) ors.push(`website.ilike.%${host.replace(/[%,()]/g, '')}%`);
  const { data } = await supabase.from('program_publishers').select(cols).or(ors.join(',')).limit(8);
  return (data ?? []) as unknown as PublisherMatch[];
}

export async function searchPublishers(term: string): Promise<PublisherMatch[]> {
  const t = term.trim().replace(/[%,()]/g, ' ');
  if (t.length < 2) return [];
  const { data } = await supabase
    .from('program_publishers')
    .select('id, name, website, verification_status, country:countries(name)')
    .ilike('name', `%${t}%`)
    .order('name')
    .limit(10);
  return (data ?? []) as unknown as PublisherMatch[];
}

export async function reviewExperience(
  id: string,
  action: 'approve' | 'reject' | 'pending',
  opts: { publisherId?: string | null; newName?: string; newWebsite?: string | null; newCountryId?: string | null; note?: string } = {},
): Promise<{ ok: boolean; publisherId?: string | null; error?: string }> {
  const { data, error } = await supabase.rpc('review_company_experience', {
    p_id: id,
    p_action: action,
    p_publisher: opts.publisherId ?? null,
    p_new_name: opts.newName ?? null,
    p_new_website: opts.newWebsite ?? null,
    p_new_country: opts.newCountryId ?? null,
    p_note: opts.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, publisherId: (data as string | null) ?? null };
}

// ---------------------------------------------------------------------------
// /feedback page
// ---------------------------------------------------------------------------

export type FeedbackCompany = { id: string; name: string; logo_url: string | null; n: number; pct: number; score?: number | null; avg_reply_days?: number | null };

export type HiringFeedbackOverview = {
  total: number;
  shared: number;
  tracked: number;
  companies: number;
  people: number;
  last_7d: number;
  no_response: number;
  rejected: number;
  responded: number;
  interview: number;
  offer: number;
  avg_reply_days: number | null;
  score?: number | null;
  most_responsive: FeedbackCompany[];
  most_silent: FeedbackCompany[];
};

/** Per company on /feedback: reports so far, and the reply rate once there are 5 from 3+ people. */
export type FeedbackStat = { id: string; n: number; people: number; pct: number | null; days: number | null; score: number | null };
/** Same rule everywhere on /feedback. */
export const FEEDBACK_MIN_REPORTS = 5;
export const FEEDBACK_MIN_PEOPLE = 3;

export async function fetchFeedbackCompanyStats(): Promise<Record<string, FeedbackStat>> {
  const { data, error } = await supabase.rpc('feedback_company_stats');
  if (error || !Array.isArray(data)) return {};
  return Object.fromEntries((data as FeedbackStat[]).map((r) => [r.id, r]));
}

export async function fetchHiringFeedbackOverview(): Promise<HiringFeedbackOverview | null> {
  const { data, error } = await supabase.rpc('hiring_feedback_overview');
  if (error || !data) return null;
  return data as HiringFeedbackOverview;
}

/** A company's own feedback link — companies/HR share it with applicants. */
export function feedbackPath(c: { id: string; name: string }): string {
  return companyPath(c).replace(/^\/companies\//, '/ghostgood/');
}

/** The word shown on the "how well did you match?" slider. */
export function matchWord(pct: number): string {
  if (pct < 20) return 'Long shot';
  if (pct < 40) return 'Worth a try';
  if (pct < 60) return 'Decent fit';
  if (pct < 80) return 'Strong fit';
  if (pct < 95) return 'Great match';
  return 'Made for it';
}

/** How the score reads in words. */
export function scoreWord(score: number): string {
  if (score >= 70) return 'Great for applicants';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Mixed';
  return 'Often silent';
}

// ---------------------------------------------------------------------------
// Admin: who sent a report
// ---------------------------------------------------------------------------

export type ExperienceReporter = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  country_name: string | null;
  occupation: string | null;
  role: string | null;
  joined_at: string | null;
  last_sign_in_at: string | null;
  email_verified: boolean;
  shared_total: number;
  shared_pending: number;
  shared_approved: number;
  shared_rejected: number;
  shared_24h: number;
  tracked_total: number;
  recent_companies: string[] | null;
};

export async function fetchExperienceReporters(userIds: string[]): Promise<{ rows: ExperienceReporter[]; error?: string }> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { rows: [] };
  const { data, error } = await supabase.rpc('admin_experience_reporters', { uids: ids });
  if (error) {
    const missing = /function .* does not exist|schema cache/i.test(error.message);
    return { rows: [], error: missing ? 'Run the 20261025090000_admin_experience_reporters migration to see who sent each report.' : error.message };
  }
  return { rows: (data ?? []) as ExperienceReporter[] };
}

export type MyExperienceReport = {
  id: string;
  company_name: string;
  publisher_id: string | null;
  outcome: ExperienceOutcome;
  applied_on: string;
  status: ExperienceStatus;
  created_at: string;
  publisher: { name: string; logo_url: string | null } | null;
};

/** The signed-in person's own recent reports, newest first (RLS: own rows only). */
export async function fetchMyExperienceReports(limit = 6): Promise<MyExperienceReport[]> {
  const base = 'id, company_name, publisher_id, outcome, applied_on, status, created_at';
  let res: { data: unknown; error: { message: string } | null } = await supabase
    .from('company_experience_reports')
    .select(`${base}, publisher:program_publishers(name, logo_url)`)
    .order('created_at', { ascending: false })
    .limit(limit);
  // Without the company join if the relationship isn't exposed.
  if (res.error) res = await supabase.from('company_experience_reports').select(base).order('created_at', { ascending: false }).limit(limit);
  if (res.error) return [];
  return ((res.data ?? []) as unknown as MyExperienceReport[]).map((r) => ({ ...r, publisher: r.publisher ?? null }));
}
