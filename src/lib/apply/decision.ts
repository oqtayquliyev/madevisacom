// Which matched jobs are worth applying to — and in what order.
//
// Every matched job gets one of three recommendations:
//   auto    MadeVisa can prepare and send this one for you
//   review  worth a look from you first
//   skip    not worth an application (and why)
// The rules are fixed and plain, like the match score itself: the same
// job and the same preferences always give the same answer. Nothing here
// predicts being hired.

import type { ApplyPrefs, Assessment, Decision, JobFacts, PlaceKind, Priority, Quality, QualityPart, ReasonCode, ServerFacts, SponsorState } from '@/lib/apply/types';

const DAY = 86_400_000;
/** Below this a job isn't a match at all (same floor as the search). */
export const FLOOR = 45;
/** How far under the person's minimum a job is still worth a look. */
export const REVIEW_BAND = 10;
/** An ad older than this is checked by the person before applying. */
export const OLD_AD_DAYS = 60;

export const daysOld = (postedAt: string | null, now: number): number | null => {
  if (!postedAt) return null;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) ? null : Math.max(0, (now - t) / DAY);
};

// --- Sponsorship ---------------------------------------------------------------

/**
 * What is known about sponsorship for this person and this job. Only what
 * the ad says, a public sponsor register, and where the person can already
 * work — never a guess presented as a fact.
 */
export function sponsorshipFor(job: Pick<JobFacts, 'visa' | 'country'>, place: PlaceKind, prefs: Pick<ApplyPrefs, 'sponsorship'>, knownSponsor = false): Assessment['sponsorship'] {
  const there = job.country ?? 'that country';
  if (prefs.sponsorship === 'no_need') return { state: 'not_needed', why: 'You said you don’t need sponsorship.' };
  if (prefs.sponsorship === 'auto') {
    if (place === 'here') return { state: 'not_needed', why: 'The job is in the country you live in.' };
    if (place === 'free') return { state: 'not_needed', why: `Your passport lets you work in ${there} without a visa.` };
    if (place === 'unknown') {
      if (job.visa === 'offered') return { state: 'likely', why: 'The ad says the employer sponsors visas.' };
      return { state: 'unclear', why: 'We don’t know your passport or where the job is, so we can’t tell whether you need a visa.' };
    }
  }
  if (job.visa === 'offered') return { state: 'likely', why: 'The ad says the employer sponsors visas.' };
  if (job.visa === 'not_offered') return { state: 'not_compatible', why: 'The ad says the employer does not sponsor visas.' };
  if (knownSponsor) return { state: 'likely', why: 'The company is on the public register of licensed visa sponsors. The ad itself doesn’t say.' };
  return { state: 'not_indicated', why: 'The ad doesn’t say whether the employer sponsors visas.' };
}

export const SPONSOR_LABEL: Record<SponsorState, string> = {
  not_needed: 'No visa needed',
  likely: 'Likely supported',
  unclear: 'Unclear',
  not_indicated: 'Not indicated',
  not_compatible: 'Not compatible',
};

// --- Quality -------------------------------------------------------------------

const QUALITY_WEIGHT: Record<QualityPart, number> = { cv: 35, required: 15, experience: 10, keywords: 10, sponsorship: 10, seniority: 5, location: 5, completeness: 5, confidence: 5 };
const SPONSOR_POINTS: Record<SponsorState, number | null> = { not_needed: 100, likely: 90, not_indicated: 50, unclear: null, not_compatible: 0 };

/**
 * How good the application would be — kept inside MadeVisa, used to order
 * the queue, never shown as a number. A part we can't judge is left out
 * (null) and listed in `unknown`; with too much unknown there is no score.
 */
export function qualityOf(
  job: Pick<JobFacts, 'score' | 'q' | 'cc' | 'remote'>,
  sponsor: SponsorState,
  prefs: Pick<ApplyPrefs, 'countries'>,
  /** Share (0–1) of the basic details every application needs that are saved; null = not known yet. */
  completeness: number | null,
  /** Share (0–1) of this person's saved answers that they confirmed themselves; null = none saved. */
  confidence: number | null,
): Quality {
  const q = job.q;
  const parts: Quality['parts'] = {
    cv: job.score,
    experience: q?.experience ?? null,
    keywords: q?.wording ?? null,
    required: q && q.asked > 0 ? Math.round(100 * Math.max(0, 1 - q.must / q.asked)) : null,
    seniority: q ? (q.gap >= 2 ? 30 : q.gap === 1 ? 75 : 100) : null,
    location: job.remote ? 100 : !job.cc ? null : prefs.countries.length === 0 ? null : prefs.countries.includes(job.cc.toUpperCase()) ? 100 : 30,
    sponsorship: SPONSOR_POINTS[sponsor],
    completeness: completeness == null ? null : Math.round(100 * completeness),
    confidence: confidence == null ? null : Math.round(100 * confidence),
  };
  const keys = Object.keys(QUALITY_WEIGHT) as QualityPart[];
  const unknown = keys.filter((k) => parts[k] == null);
  const known = keys.filter((k) => parts[k] != null);
  const weight = known.reduce((a, k) => a + QUALITY_WEIGHT[k], 0);
  // Under 60 of the 100 points known: saying a number would be false precision.
  if (weight < 60) return { score: null, band: 'unknown', parts, unknown };
  const score = Math.round(known.reduce((a, k) => a + parts[k]! * QUALITY_WEIGHT[k], 0) / weight);
  return { score, band: score >= 80 ? 'strong' : score >= 65 ? 'good' : 'weak', parts, unknown };
}

// --- The recommendation ----------------------------------------------------------

const REASON_TEXT: Record<ReasonCode, (x: { job: JobFacts; prefs: ApplyPrefs }) => string> = {
  strong: ({ job }) => `${job.score}% match — at or above your minimum.`,
  near_min: ({ job, prefs }) => `${job.score}% match, just under your ${prefs.minScore}% minimum. Worth a look.`,
  below_min: ({ job, prefs }) => `${job.score}% match is below your ${prefs.minScore}% minimum.`,
  too_low: ({ job }) => `${job.score}% match is too low to be worth an application.`,
  missing_required: ({ job }) => `The ad lists ${job.q?.must ?? 'several'} required skills your CV doesn’t show. Check before applying.`,
  more_senior: () => 'The role is more senior than your CV shows. Check before applying.',
  language: () => 'The ad requires a language your CV doesn’t list.',
  old_ad: () => 'The ad has been open for more than two months. Check it is still hiring.',
  no_sponsorship: () => 'The ad says the employer does not sponsor visas.',
  outside_roles: () => 'Not one of the roles you chose.',
  outside_countries: ({ job }) => `${job.country ?? 'This country'} isn’t one of the countries you chose.`,
  arrangement: ({ job }) => `${job.arrangement === 'remote' ? 'Remote' : job.arrangement === 'hybrid' ? 'Hybrid' : 'On-site'} work isn’t one of your choices.`,
  below_salary: () => 'The pay on the ad is below your minimum.',
  no_relocation: () => 'The job is in another country and you chose not to relocate.',
  already_applied: () => 'This job is already in your applications.',
  same_role: ({ job }) => `This role at ${job.company} is already in your applications.`,
  duplicate_listing: ({ job }) => `${job.company} lists this role more than once. MadeVisa applies to one of them.`,
  closed: () => 'The job is no longer open.',
};

export type AssessInput = {
  job: JobFacts;
  place: PlaceKind;
  prefs: ApplyPrefs;
  server?: Partial<ServerFacts> | null;
  now: number;
  /** The person's salary floor as US dollars a year (prefs.salaryMin converted), or null. */
  salaryFloorUsd?: number | null;
  completeness?: number | null;
  confidence?: number | null;
  /** The same role at the same company is in this list twice, and this is the one to leave out. */
  duplicateListing?: boolean;
};

export function assess(input: AssessInput): Assessment {
  const { job, place, prefs, now } = input;
  const server = input.server ?? {};
  const sponsorship = sponsorshipFor(job, place, prefs, Boolean(server.knownSponsor));
  const quality = qualityOf(job, sponsorship.state, prefs, input.completeness ?? null, input.confidence ?? null);
  const age = daysOld(job.postedAt, now);
  const channel = server.channel ?? 'employer_site';

  const stop: ReasonCode[] = [];
  const care: ReasonCode[] = [];

  // Never twice, never to a closed job.
  if (server.applied) stop.push('already_applied');
  else if (server.twin) stop.push('same_role');
  else if (input.duplicateListing) stop.push('duplicate_listing');
  if (server.closed) stop.push('closed');

  // What the person told us they want.
  const cc = (job.cc ?? '').toUpperCase();
  if (prefs.roles.length && job.role && !prefs.roles.includes(job.role)) stop.push('outside_roles');
  if (prefs.countries.length && cc && !job.remote && !prefs.countries.includes(cc)) stop.push('outside_countries');
  if (prefs.arrangements.length && job.arrangement && !prefs.arrangements.includes(job.arrangement)) stop.push('arrangement');
  if (!prefs.relocate && place === 'abroad' && !job.remote) stop.push('no_relocation');
  if (input.salaryFloorUsd && job.payUsdYear != null && job.payUsdYear < input.salaryFloorUsd * 0.95) stop.push('below_salary');
  if (sponsorship.state === 'not_compatible') stop.push('no_sponsorship');

  // The match itself.
  const reviewFrom = Math.max(FLOOR, prefs.minScore - REVIEW_BAND);
  if (job.score < FLOOR) stop.push('too_low');
  else if (job.score < reviewFrom) stop.push('below_min');
  else if (job.score < prefs.minScore) care.push('near_min');

  // Good score, but something a person should look at first.
  if (job.q) {
    if (job.q.capped) care.push('language');
    if (job.q.must >= 3) care.push('missing_required');
    if (job.q.gap >= 2) care.push('more_senior');
  }
  if (age != null && age > OLD_AD_DAYS) care.push('old_ad');

  const decision: Decision = stop.length ? 'skip' : care.length ? 'review' : 'auto';
  const codes: ReasonCode[] = stop.length ? stop : care.length ? care : ['strong'];

  // Order in the queue: the match, then sponsorship, then how fresh the ad is.
  const sponsorOk = sponsorship.state === 'not_needed' || sponsorship.state === 'likely';
  const fresh = age == null ? 0 : age <= 14 ? 4 : age <= 30 ? 2 : age > OLD_AD_DAYS ? -4 : 0;
  const rank = job.score + (sponsorOk ? 6 : 0) + fresh + (prefs.countries.length && cc && prefs.countries.includes(cc) ? 2 : 0) + (channel === 'madevisa' ? 1 : 0);
  const priority: Priority = job.score >= 80 && sponsorOk && (age == null || age <= 30) ? 'strong' : job.score >= 70 ? 'good' : 'backup';

  return { decision, reason: REASON_TEXT[codes[0]]({ job, prefs }), codes, priority, rank, sponsorship, quality, channel };
}

export const DECISION_LABEL: Record<Decision, string> = { auto: 'Auto apply', review: 'Review', skip: 'Skip' };
export const PRIORITY_LABEL: Record<Priority, string> = { strong: 'Strong', good: 'Good', backup: 'Backup' };

// --- A whole list ---------------------------------------------------------------

export type Planned = { job: JobFacts; a: Assessment };
export type Plan = {
  all: Planned[];
  auto: Planned[];
  review: Planned[];
  skip: Planned[];
  /** Of `auto`: how many MadeVisa sends itself, and how many it prepares for the person to send. */
  bySend: { madevisa: number; you: number };
};

/** Assess every match; `auto` and `review` come back in queue order (highest rank first). */
export function plan(jobs: JobFacts[], each: (job: JobFacts) => Omit<AssessInput, 'job'>): Plan {
  const all = jobs.map((job) => ({ job, a: assess({ job, ...each(job) }) }));
  const order = (x: Planned[]) => [...x].sort((p, q) => q.a.rank - p.a.rank || q.job.score - p.job.score);
  const auto = order(all.filter((p) => p.a.decision === 'auto'));
  return {
    all,
    auto,
    review: order(all.filter((p) => p.a.decision === 'review')),
    skip: all.filter((p) => p.a.decision === 'skip'),
    bySend: { madevisa: auto.filter((p) => p.a.channel === 'madevisa').length, you: auto.filter((p) => p.a.channel === 'employer_site').length },
  };
}

/** Jobs that are the same application twice in one list (same company, same title): keep the best, mark the rest. */
export function twinsIn(jobs: Pick<JobFacts, 'id' | 'title' | 'company' | 'publisherId' | 'score'>[]): Set<string> {
  const best = new Map<string, { id: string; score: number }>();
  const twins = new Set<string>();
  for (const j of jobs) {
    const key = `${(j.publisherId ?? j.company).toLowerCase()}::${normTitle(j.title)}`;
    const seen = best.get(key);
    if (!seen) best.set(key, { id: j.id, score: j.score });
    else if (j.score > seen.score) {
      twins.add(seen.id);
      best.set(key, { id: j.id, score: j.score });
    } else twins.add(j.id);
  }
  return twins;
}

/** "Senior Data Analyst (m/f/d) – Berlin" and "Senior Data Analyst" are one role. */
export const normTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-–—|,@]\s.*$/, ' ')
    .replace(/\b(m\/w\/d|m\/f\/d|f\/m\/d|w\/m\/d|all genders|remote|hybrid)\b/g, ' ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();

// --- Time saved (an estimate, and labelled as one) ------------------------------

/** Minutes one application takes by hand: tailoring the CV, the letter, the form. */
export const MINUTES_BY_HAND: [low: number, high: number] = [15, 19];
/** When MadeVisa prepares it and the person only sends it, the form is still theirs to do. */
export const MINUTES_PREPARED: [low: number, high: number] = [8, 12];

export function timeSaved(sent: number, prepared: number): { low: number; high: number; mid: number; text: string } {
  const low = sent * MINUTES_BY_HAND[0] + prepared * MINUTES_PREPARED[0];
  const high = sent * MINUTES_BY_HAND[1] + prepared * MINUTES_PREPARED[1];
  const mid = Math.round((low + high) / 2);
  const h = (m: number) => Math.max(1, Math.round(m / 60));
  const text = high < 50 ? `about ${Math.max(5, Math.round(mid / 5) * 5)} minutes` : h(low) === h(high) ? `about ${h(mid)} hour${h(mid) === 1 ? '' : 's'}` : `about ${h(low)} to ${h(high)} hours`;
  return { low, high, mid, text };
}
