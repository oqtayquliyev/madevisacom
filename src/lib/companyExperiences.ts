// "Share your application experience" — applications made outside MadeVisa.
// Users submit; admins review (link to an existing company, create it, or
// reject); approved reports show on the company page as counts.
// See supabase/migrations/20261020090000_company_experience_reports.sql.

import { supabase } from '@/lib/supabase';

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
};

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
  });
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) return { ok: false, error: 'This feature is not switched on yet. Please try again later.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type ExperienceSummary = {
  total: number;
  reporters: number;
  no_response: number;
  rejected: number;
  responded: number;
  interview: number;
  offer: number;
  avg_reply_days: number | null;
  last_applied: string | null;
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
