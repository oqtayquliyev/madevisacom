// Company managers: people an admin gave access to one company (e.g.
// hr@netflix.com → Netflix). What they can do is enforced in the database
// (see the 20260924090000 migration): RLS limits them to their company's
// rows, and triggers decide whether their changes publish immediately
// (`can_publish`) or go to MadeVisa review.

import { supabase } from '@/lib/supabase';
import type { OrgType } from '@/lib/programs';
import type { ListingStatus, SalaryPeriod } from '@/lib/listingCategories';

export type ManagedPublisher = {
  id: string;
  name: string;
  org_type: OrgType;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  contact_email: string;
  verification_status: string;
  is_owner: boolean;
  can_publish: boolean;
};

let cache: { userId: string; data: ManagedPublisher[] } | null = null;

export async function fetchMyManagedPublishers(force = false): Promise<ManagedPublisher[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  if (!force && cache?.userId === userId) return cache.data;
  const { data, error } = await supabase.rpc('my_managed_publishers');
  if (error) {
    // Before the migration runs the RPC doesn't exist — just show nothing.
    console.warn('my_managed_publishers failed', error.message);
    return [];
  }
  cache = { userId, data: (data ?? []) as ManagedPublisher[] };
  return cache.data;
}

export async function updateManagedPublisher(
  id: string,
  patch: Partial<Pick<ManagedPublisher, 'description' | 'website' | 'logo_url' | 'contact_email'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('program_publishers').update(patch).eq('id', id);
  cache = null;
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Hard limits — the database enforces the same (migration 20261003090000). */
export const LISTING_LIMITS = {
  title: 120,
  city: 80,
  jobFunction: 60,
  experience: 60,
  funding: 120,
  url: 500,
  description: 20000,
  perDay: 10,
  teamMembers: 10,
} as const;

export const WORKPLACES = [
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
] as const;
export type Workplace = (typeof WORKPLACES)[number]['value'];

// Same buckets the Jobs page filters by (experienceBucket in jobFacts.ts).
export const EXPERIENCE_LEVELS = ['Entry level (0–1 yrs)', 'Mid level (2–4 yrs)', 'Senior (5–7 yrs)', 'Lead / Principal (8+ yrs)'] as const;
export const VISA_OPTIONS = [
  { value: 'offered', label: 'Offered' },
  { value: 'not_offered', label: 'Not offered' },
  { value: '', label: 'Not stated' },
] as const;
export const SALARY_CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'CHF', 'AED', 'PLN', 'SEK', 'TRY', 'AZN'] as const;

export type CompanyJobInput = {
  title: string;
  description: string;
  employment_type: string;
  job_function: string;
  country_id: string;
  city: string;
  workplace: Workplace | '';
  visa: 'offered' | 'not_offered' | '';
  experience_level: string;
  salary_mode: 'range' | 'negotiable' | 'none';
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  salary_period: SalaryPeriod;
  application_deadline: string;
  official_url: string;
};

export type CompanyProgramInput = {
  title: string;
  description: string;
  category: string;
  country_id: string;
  city: string;
  applications_open_at: string;
  applications_close_at: string;
  funding_text: string;
  official_url: string;
  spots_available: string;
};

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
const toNumber = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ''));
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** "EUR 60,000–75,000 / year" — also stored as text for older views. */
export function salaryLabel(i: Pick<CompanyJobInput, 'salary_mode' | 'salary_min' | 'salary_max' | 'salary_currency' | 'salary_period'>): string | null {
  if (i.salary_mode === 'negotiable') return 'Negotiable';
  if (i.salary_mode !== 'range') return null;
  const min = toNumber(i.salary_min);
  const max = toNumber(i.salary_max);
  if (min == null && max == null) return null;
  const f = (n: number) => n.toLocaleString('en-US');
  const range = min != null && max != null && min !== max ? `${f(min)}–${f(max)}` : f((min ?? max) as number);
  return `${i.salary_currency} ${range} / ${i.salary_period}`;
}

/** Plain http(s) link, or null. */
export function validUrl(v: string): boolean {
  return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v.trim()) && v.trim().length <= LISTING_LIMITS.url;
}

// The dashboard asks for review unless an admin marked this manager trusted.
// (Admins testing their own company go through review like everyone else.)
const requestedStatus = (canPublish: boolean): ListingStatus => (canPublish ? 'published' : 'pending');

const isMissingColumn = (msg: string) => /column|schema cache/i.test(msg);

export async function saveCompanyJob(publisherId: string, input: CompanyJobInput, canPublish: boolean, id?: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const min = input.salary_mode === 'range' ? toNumber(input.salary_min) : null;
  const max = input.salary_mode === 'range' ? toNumber(input.salary_max) : null;
  const row: Record<string, unknown> = {
    publisher_id: publisherId,
    title: input.title.trim(),
    description: input.description || null,
    category: input.employment_type,
    employment_type: input.employment_type,
    job_function: blankToNull(input.job_function),
    country_id: blankToNull(input.country_id),
    city: blankToNull(input.city),
    remote: input.workplace === 'remote',
    visa_sponsorship: input.visa === 'offered',
    experience_level: blankToNull(input.experience_level),
    compensation_text: salaryLabel(input),
    salary_status: input.salary_mode === 'negotiable' ? 'negotiable' : min != null || max != null ? 'disclosed' : 'not_disclosed',
    salary_min: min,
    salary_max: max,
    salary_currency: input.salary_currency,
    salary_period: input.salary_period,
    application_deadline: blankToNull(input.application_deadline),
    official_url: blankToNull(input.official_url),
    status: requestedStatus(canPublish),
    work_arrangement: input.workplace || null,
    visa_status: input.visa || null,
  };
  const write = (r: Record<string, unknown>) =>
    id ? supabase.from('sponsored_jobs').update(r).eq('id', id).select('status').single() : supabase.from('sponsored_jobs').insert(r).select('status').single();
  let { data, error } = await write(row);
  if (error && isMissingColumn(error.message)) {
    // Older database without work_arrangement / visa_status.
    const { work_arrangement: _w, visa_status: _v, ...rest } = row;
    void _w;
    void _v;
    ({ data, error } = await write(rest));
  }
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true, status: data?.status };
}

export async function saveCompanyProgram(publisherId: string, input: CompanyProgramInput, canPublish: boolean, id?: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const spots = parseInt(input.spots_available, 10);
  const row = {
    publisher_id: publisherId,
    title: input.title.trim(),
    description: input.description || null,
    category: input.category,
    country_id: blankToNull(input.country_id),
    city: blankToNull(input.city),
    applications_open_at: blankToNull(input.applications_open_at),
    applications_close_at: blankToNull(input.applications_close_at),
    funding_text: blankToNull(input.funding_text),
    official_url: blankToNull(input.official_url),
    spots_available: Number.isFinite(spots) ? spots : null,
    status: requestedStatus(canPublish),
  };
  const q = id
    ? supabase.from('programs').update(row).eq('id', id).select('status').single()
    : supabase.from('programs').insert(row).select('status').single();
  const { data, error } = await q;
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true, status: data?.status };
}

/** How many jobs + programs this person submitted in the last 24 hours. */
export async function countMySubmissionsToday(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return 0;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const count = (table: string) =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq('submitted_by', uid).gte('created_at', since).then((r) => r.count ?? 0);
  const [a, b] = await Promise.all([count('sponsored_jobs'), count('programs')]);
  return a + b;
}

/** Row-level errors from Postgres come back as long strings; keep the human part. */
export function friendlyError(msg: string): string {
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  return msg.replace(/^.*?ERROR:\s*/i, '');
}

/** Approved listings can only be closed / reopened by the company. */
export const isLockedListing = (r: { approved_at?: string | null }) => Boolean(r.approved_at);

export const CHANGE_REQUEST_EMAIL = 'hello@madevisa.com';
export function changeRequestHref(company: string, what: string): string {
  const subject = `Change request — ${company}: ${what}`;
  const body = `Hi MadeVisa,\n\nPlease update the following for ${company} (${what}):\n\n- \n\nThanks`;
  return `mailto:${CHANGE_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function setCompanyListingStatus(kind: 'job' | 'program', id: string, status: ListingStatus): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { data, error } = await supabase
    .from(kind === 'job' ? 'sponsored_jobs' : 'programs')
    .update({ status })
    .eq('id', id)
    .select('status')
    .single();
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true, status: data?.status };
}

export async function deleteCompanyListing(kind: 'job' | 'program', id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(kind === 'job' ? 'sponsored_jobs' : 'programs').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
