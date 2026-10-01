// Hiring Briefs — a one-page case a candidate sends to an employer whose
// job doesn't mention visa sponsorship: the easiest legal route, what the
// employer would actually have to do, and what the candidate covers.
//
// Data: public.hiring_briefs (migration 20261018090000). Candidates send
// the link themselves; MadeVisa never contacts companies.
//
// Growth hooks already in place:
// - `status` is candidate-reported outcome → can feed company response stats.
// - `view_count` is company opens → "viewed" signal for the candidate.
// - `route_id` ties to src/data/visa; any route with `employer` data works.

import { supabase } from '@/lib/supabase';
import { briefRoutesFor, visaGuideByCode, type CandidateCover, type VisaGuide, type VisaRoute } from '@/data/visa';
import { allCountries } from '@/data/allCountries';
import type { OfferTerms } from '@/lib/sponsorOffer';

export type BriefStatus = 'created' | 'sent' | 'replied' | 'interview' | 'offer' | 'declined' | 'no_reply' | 'withdrawn';

export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  created: 'Not sent yet',
  sent: 'Sent',
  replied: 'They replied',
  interview: 'Interview',
  offer: 'Offer',
  declined: 'Declined',
  no_reply: 'No reply',
  withdrawn: 'Withdrawn',
};

/** Statuses the candidate can pick after sending. */
export const BRIEF_STATUS_CHOICES: BriefStatus[] = ['created', 'sent', 'replied', 'interview', 'offer', 'declined', 'no_reply'];

export type PublicBrief = {
  share_id: string;
  job_id: string | null;
  publisher_id: string | null;
  job_title: string;
  company_name: string;
  job_function: string | null;
  job_city: string | null;
  country_code: string;
  route_id: string;
  candidate_name: string;
  candidate_headline: string | null;
  candidate_linkedin: string | null;
  candidate_username: string | null;
  covers: CandidateCover[];
  remote_first: boolean;
  note: string | null;
  created_at: string;
  is_owner: boolean;
  status: BriefStatus | null;
  view_count: number | null;
  /** Sponsor offer slider (migration 20261109090000). Older briefs have none. */
  split?: number | null;
  terms?: OfferTerms | null;
  terms_updated_at?: string | null;
};

export type MyBrief = PublicBrief & {
  id: string;
  /** How it was paid: 'credit', 'pro' or 'legacy' (made before credits). */
  paid_with?: 'credit' | 'pro' | 'legacy' | null;
  status: BriefStatus;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
};

export type BriefProof = { companies: number; jobs: number; function_companies: number; function_jobs: number };

export const briefPath = (shareId: string) => `/brief/${shareId}`;
/** Offer builder for one job. */
export const newOfferPath = (jobId: string) => `/brief/new?job=${jobId}`;
/** Offer builder for any company — typed in or picked from MadeVisa's companies. */
export const customOfferPath = (o: { company: string; title?: string; country?: string | null; city?: string | null; publisherId?: string | null }) => {
  const q = new URLSearchParams({ custom: '1', company: o.company.trim() });
  if (o.title?.trim()) q.set('title', o.title.trim());
  if (o.country) q.set('country', o.country.toUpperCase());
  if (o.city?.trim()) q.set('city', o.city.trim());
  if (o.publisherId) q.set('pub', o.publisherId);
  return `/brief/new?${q.toString()}`;
};
export const briefUrl = (shareId: string) => `${window.location.origin}${briefPath(shareId)}`;

/**
 * Can a sponsor offer be made for this job? When the job is open, its
 * country has checked employer data, and the listing doesn't say
 * sponsorship is "not offered" (we respect that). Jobs that already offer
 * sponsorship qualify too: the offer then speeds up and de-risks it.
 */
/** Route id used when we have no checked employer data for a country. */
export const GENERIC_ROUTE_ID = 'work-permit';

const countryName = (code: string) => visaGuideByCode.get(code)?.name ?? allCountries.find((c) => c.code === code)?.name ?? code;
export const isCountryCode = (code: string | null | undefined): code is string => Boolean(code && allCountries.some((c) => c.code === code.toUpperCase()));

/** A guide object for any country (a real one when we have it). */
function guideFor(code: string): VisaGuide {
  return visaGuideByCode.get(code) ?? ({ code, name: countryName(code), routes: [], currency: 'EUR' } as unknown as VisaGuide);
}

/**
 * Any country without checked employer data still gets an offer, on a
 * general "national work permit" route: the employer confirms the exact
 * route, and anything the local law puts on the employer stays theirs.
 */
export function genericRoute(code: string): VisaRoute {
  const name = countryName(code);
  const official = visaGuideByCode.get(code)?.routes[0]?.url ?? '';
  return {
    id: GENERIC_ROUTE_ID,
    name: 'national work permit',
    kind: 'work',
    summary: '',
    validity: '',
    leadsToPR: false,
    requires: ['job-offer'],
    url: official,
    employer: {
      licenceNeeded: false,
      steps: [
        { text: `Confirm with the immigration authority of ${name} which work permit or visa fits this role.`, effort: 'A short check' },
        { text: 'Offer a contract that meets that route’s salary and job requirements.', effort: 'Part of your normal offer' },
        { text: 'File the employer’s part of the application, if the route has one. The Candidate files the rest.', effort: 'Depends on the route' },
      ],
      timeline: `Depends on the route. The Candidate will check current processing times with the authorities of ${name}.`,
      candidateMayCover: ['visa-fee', 'relocation', 'translations', 'own-adviser'],
      employerCosts: `Any fee or charge that the law of ${name} reserves to the employer. If that law puts one of the costs in clause 4 on the Employer, the Employer pays it and clause 4 does not apply to that cost.`,
    },
  } as VisaRoute;
}

/**
 * Where the offer is for and which routes apply.
 * - `override`: the candidate's choice in the country menu (always wins).
 * - the job's own country otherwise, if it's a real country.
 * - `fallback`: for jobs with no country ("Various", remote).
 * Countries without checked data get the general work-permit route.
 */
export function briefEligibility(input: {
  countryCode: string | null | undefined;
  visa?: 'offered' | 'not_offered' | null | undefined;
  closed?: boolean;
  override?: string | null;
  fallback?: string | null;
}): { ok: true; guide: VisaGuide; routes: VisaRoute[]; code: string; picked: boolean; checked: boolean } | { ok: false } {
  if (input.closed) return { ok: false };
  const own = (input.countryCode ?? '').toUpperCase();
  const override = (input.override ?? '').toUpperCase();
  const code = isCountryCode(override) ? override : isCountryCode(own) ? own : (input.fallback ?? '').toUpperCase();
  if (!isCountryCode(code)) return { ok: false };
  const g = visaGuideByCode.get(code);
  const checkedRoutes = g ? briefRoutesFor(g) : [];
  return {
    ok: true,
    guide: guideFor(code),
    routes: checkedRoutes.length ? checkedRoutes : [genericRoute(code)],
    code,
    picked: code !== own,
    checked: checkedRoutes.length > 0,
  };
}

export function findRoute(countryCode: string, routeId: string): { guide: VisaGuide; route: VisaRoute } | null {
  if (routeId === GENERIC_ROUTE_ID && isCountryCode(countryCode)) return { guide: guideFor(countryCode), route: genericRoute(countryCode) };
  const guide = visaGuideByCode.get(countryCode);
  const route = guide?.routes.find((r) => r.id === routeId);
  return guide && route ? { guide, route } : null;
}

export type CreateBriefInput = {
  /** Null for a custom offer (a company or role that isn't listed on MadeVisa). */
  jobId: string | null;
  publisherId: string | null;
  jobTitle: string;
  companyName: string;
  jobFunction: string | null;
  jobCity: string | null;
  countryCode: string;
  routeId: string;
  candidateName: string;
  candidateHeadline: string | null;
  candidateLinkedin: string | null;
  candidateUsername: string | null;
  covers: CandidateCover[];
  remoteFirst: boolean;
  note: string | null;
  split: number;
  terms: OfferTerms;
};

const MISSING_TABLE = /hiring_briefs|relation .* does not exist|schema cache/i;

export async function createBrief(input: CreateBriefInput): Promise<{ ok: true; shareId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('hiring_briefs')
    .insert({
      job_id: input.jobId,
      publisher_id: input.publisherId,
      job_title: input.jobTitle.slice(0, 300),
      company_name: input.companyName.slice(0, 200),
      job_function: input.jobFunction,
      job_city: input.jobCity,
      country_code: input.countryCode,
      route_id: input.routeId,
      candidate_name: input.candidateName.slice(0, 120),
      candidate_headline: input.candidateHeadline?.slice(0, 140) || null,
      candidate_linkedin: input.candidateLinkedin,
      candidate_username: input.candidateUsername,
      covers: input.covers,
      remote_first: input.remoteFirst,
      note: input.note?.trim().slice(0, 600) || null,
      split: input.split,
      terms: input.terms,
    })
    .select('share_id')
    .single();
  if (error && /split|terms|column|schema cache/i.test(error.message) && !MISSING_TABLE.test(error.message)) {
    return { ok: false, error: 'Sponsor offers need a database update first (migration 20261109090000).' };
  }
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'You already have a sponsor offer for this job.' };
    if (error.code === 'P0001') return { ok: false, error: error.message };
    if (MISSING_TABLE.test(error.message)) return { ok: false, error: 'Hiring briefs need a database update first (migration 20261018090000).' };
    return { ok: false, error: error.message };
  }
  return { ok: true, shareId: (data as { share_id: string }).share_id };
}

export async function fetchMyBriefForJob(jobId: string): Promise<{ share_id: string; status: BriefStatus } | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from('hiring_briefs').select('share_id, status').eq('job_id', jobId).eq('user_id', auth.user.id).maybeSingle();
  if (error) return null;
  return (data as { share_id: string; status: BriefStatus } | null) ?? null;
}

const MY_BRIEF_COLUMNS =
  'id, share_id, job_id, publisher_id, job_title, company_name, job_function, job_city, country_code, route_id, candidate_name, candidate_headline, candidate_linkedin, candidate_username, covers, remote_first, note, created_at, status, view_count, first_viewed_at, last_viewed_at, sent_at, responded_at';

export async function fetchMyBriefs(): Promise<MyBrief[] | null> {
  const { data, error } = await supabase
    .from('hiring_briefs')
    .select(`${MY_BRIEF_COLUMNS}, split, paid_with`)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: false });
  if (error && /split|paid_with|column/i.test(error.message)) {
    const old = await supabase.from('hiring_briefs').select(MY_BRIEF_COLUMNS).neq('status', 'withdrawn').order('created_at', { ascending: false });
    if (old.error) return MISSING_TABLE.test(old.error.message) ? null : [];
    return ((old.data ?? []) as MyBrief[]).map((b) => ({ ...b, is_owner: true }));
  }
  if (error) return MISSING_TABLE.test(error.message) ? null : [];
  return ((data ?? []) as MyBrief[]).map((b) => ({ ...b, is_owner: true }));
}

export async function fetchBrief(shareId: string): Promise<PublicBrief | null> {
  const { data, error } = await supabase.rpc('get_hiring_brief', { p_share_id: shareId });
  if (error) return null;
  return ((data as PublicBrief[] | null) ?? [])[0] ?? null;
}

/**
 * Count an open — only after the page has been visible for 4 seconds in a
 * real browser, so mail scanners and link previews don't count as "opened".
 * Owners call it too: the server remembers their network so their own
 * logged-out visits never count (see migration 20261115090000).
 */
export function recordBriefView(shareId: string): () => void {
  const key = `madevisa.briefView.${shareId}`;
  try {
    if (window.sessionStorage.getItem(key)) return () => undefined;
  } catch {
    /* storage blocked — the server de-duplicates anyway */
  }
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return () => undefined;
  let visibleMs = 0;
  let last = document.visibilityState === 'visible' ? Date.now() : 0;
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    try {
      window.sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    void supabase.rpc('record_hiring_brief_view', { p_share_id: shareId });
  };
  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (last) visibleMs += now - last;
      last = now;
      if (visibleMs >= 4000) {
        window.clearInterval(tick);
        fire();
      }
    } else {
      last = 0;
    }
  }, 500);
  return () => window.clearInterval(tick);
}

// ---------------------------------------------------------------------------
// Employer replies (migration 20261115090000)
// ---------------------------------------------------------------------------

export type ReplyKind = 'interested' | 'more_info' | 'not_now';

export const REPLY_LABEL: Record<ReplyKind, string> = {
  interested: 'Interested — let’s talk',
  more_info: 'Need more information',
  not_now: 'Not right now',
};

export const REPLY_MESSAGE_MAX = 500;

export type BriefReply = {
  id: string;
  kind: ReplyKind;
  name: string | null;
  email: string | null;
  message: string | null;
  verified: boolean;
  created_at: string;
};

export async function submitBriefReply(input: {
  shareId: string;
  kind: ReplyKind;
  name: string;
  email: string;
  message: string;
  website: string;
  startedAt: number;
  pow: { ts: number; nonce: string };
}): Promise<{ ok: boolean; verified?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_brief_reply', {
    p_share_id: input.shareId,
    p_kind: input.kind,
    p_name: input.name.slice(0, 80),
    p_email: input.email.slice(0, 120),
    p_message: input.message.slice(0, REPLY_MESSAGE_MAX),
    p_website: input.website,
    p_started_at: input.startedAt,
    p_pow_ts: input.pow.ts,
    p_pow_nonce: input.pow.nonce,
  });
  if (error) {
    const missing = /submit_brief_reply|schema cache/i.test(error.message);
    return { ok: false, error: missing ? 'Replies aren’t available yet. Please contact the candidate directly.' : error.message };
  }
  const d = data as { ok?: boolean; verified?: boolean } | null;
  return { ok: Boolean(d?.ok), verified: Boolean(d?.verified) };
}

export async function fetchMyBriefReplies(shareId: string): Promise<{ uniqueViewers: number; replies: BriefReply[] } | null> {
  const { data, error } = await supabase.rpc('my_brief_replies', { p_share_id: shareId });
  if (error || !data) return null;
  const d = data as { unique_viewers?: number; replies?: BriefReply[] };
  return { uniqueViewers: d.unique_viewers ?? 0, replies: d.replies ?? [] };
}

export async function reportBriefReply(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('report_brief_reply', { p_reply_id: id });
  return !error;
}

export async function fetchBriefProof(countryCode: string, jobFunction: string | null): Promise<BriefProof | null> {
  const { data, error } = await supabase.rpc('hiring_brief_proof', { p_country_code: countryCode, p_function: jobFunction });
  if (error || !data) return null;
  return data as BriefProof;
}

export async function updateBriefStatus(shareId: string, status: BriefStatus): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('hiring_briefs').update({ status }).eq('share_id', shareId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Owner changes the terms (slider, salary offset, employer): same link, no credit. */
export async function updateBriefTerms(shareId: string, terms: OfferTerms): Promise<{ ok: boolean; terms?: OfferTerms; error?: string }> {
  const covers = terms.items.filter((i) => i.payer !== 'employer').map((i) => i.key);
  const patch: Record<string, unknown> = { split: terms.split, terms, covers, remote_first: terms.remoteStart, terms_updated_at: new Date().toISOString() };
  if (terms.employer?.name) {
    patch.company_name = terms.employer.name.slice(0, 200);
    patch.publisher_id = terms.employer.publisherId ?? null;
  }
  const { error } = await supabase.from('hiring_briefs').update(patch).eq('share_id', shareId);
  return error ? { ok: false, error: /column|schema cache/i.test(error.message) ? 'Run migration 20261109090000 to save offer terms.' : error.message } : { ok: true, terms };
}

export async function withdrawBrief(shareId: string): Promise<{ ok: boolean; error?: string }> {
  return updateBriefStatus(shareId, 'withdrawn');
}

/** Ready-to-paste LinkedIn / email / application-form message. */
export function briefMessage(b: Pick<PublicBrief, 'job_title' | 'company_name' | 'country_code' | 'route_id' | 'candidate_name'>, url: string): string {
  const found = findRoute(b.country_code, b.route_id);
  const first = b.candidate_name.split(/\s+/)[0];
  const effort = found?.route.employer && !found.route.employer.licenceNeeded ? ' It doesn’t need a sponsor licence on your side.' : '';
  return [
    `Hi, I'm ${first} and I'm very interested in the ${b.job_title} role at ${b.company_name}.`,
    `I've prepared a short sponsor offer on how hiring me would work${found ? ` in ${found.guide.name} through the ${found.route.name}` : ''}: the steps on your side and how I propose we share the visa costs.${effort}`,
    url,
    'Happy to answer any questions.',
  ].join('\n\n');
}
