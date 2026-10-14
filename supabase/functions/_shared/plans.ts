// MadeVisa plans for job seekers: Free, Starter and Pro — what they cost and what they include.
//
// THE ONE COPY of the plan catalogue in code. It is read by
//   • the app (src/lib/plans.ts re-exports it),
//   • the server-rendered pricing page (api/seo.ts),
//   • the gumroad function, which only sells a plan whose Gumroad product has
//     exactly this price (supabase/functions/gumroad/core.ts).
// The database keeps the same numbers in billing_plans and plan_entitlements
// (migration 20261219090000_starter_pro_plans.sql), because the database is
// what enforces them. src/lib/__tests__/plans.test.ts fails when the two
// copies disagree, so change both together.
//
// Rules this file follows (product decisions, October 2026):
//   • Flat monthly prices in US dollars, the same in every country. No
//     regional discounts, no yearly billing, no credits, no add-ons.
//   • Every limit is shown before purchase. Nothing is "unlimited" when it
//     costs real money to run; the limits below are the fair-use limits.
//   • Only features that exist are listed as included. Features that are
//     still being built are listed separately as "coming", never as included.
//
// No imports and no browser code: Deno and Vite both load this file.

export type PlanId = 'free' | 'starter' | 'pro';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export const PAID_PLANS: readonly PaidPlanId[] = ['starter', 'pro'];

/** Higher includes everything below it. */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2 };

export const isPaidPlanId = (v: unknown): v is PaidPlanId => v === 'starter' || v === 'pro';

/**
 * Feature identifiers — the same strings as plan_entitlements.feature in the
 * database. `limit` null = no limit; a number = that many per `period`.
 */
export type FeatureId =
  | 'cv_missing_skills' // missing skills on a job's CV match (free: a few jobs a day)
  | 'cv_full_report' // every part of the score, what to change in the CV, CV checks, all top matches
  | 'saved_jobs' // jobs kept in "Saved jobs"
  | 'job_alerts' // active job alerts (each: a notification when new jobs match, and a daily email)
  | 'sponsorship_insights' // companies sponsoring visas per country + full company response data
  | 'sponsorship_documents' // sponsorship documents (proposal to the employer) per calendar month
  | 'auto_apply'; // Apply: tailored CV + cover letter per job, sent or handed over (monthly allowance is admin-set)

export type Period = 'day' | 'month' | null;
export type Entitlement = { allowed: boolean; limit: number | null; period: Period };

/** What each plan may use. Mirrors the plan_entitlements seed in the migration. */
export const ENTITLEMENTS: Record<PlanId, Record<FeatureId, Entitlement>> = {
  free: {
    // CV match is for paid plans only (October 2026).
    cv_missing_skills: { allowed: false, limit: 0, period: 'day' },
    cv_full_report: { allowed: false, limit: 0, period: null },
    saved_jobs: { allowed: true, limit: 5, period: null },
    job_alerts: { allowed: true, limit: 1, period: null },
    sponsorship_insights: { allowed: false, limit: 0, period: null },
    sponsorship_documents: { allowed: false, limit: 0, period: 'month' },
    auto_apply: { allowed: false, limit: 0, period: 'month' },
  },
  starter: {
    cv_missing_skills: { allowed: true, limit: null, period: null },
    cv_full_report: { allowed: true, limit: null, period: null },
    saved_jobs: { allowed: true, limit: null, period: null },
    job_alerts: { allowed: true, limit: 5, period: null },
    sponsorship_insights: { allowed: true, limit: null, period: null },
    sponsorship_documents: { allowed: true, limit: 10, period: 'month' },
    auto_apply: { allowed: false, limit: 0, period: 'month' },
  },
  pro: {
    cv_missing_skills: { allowed: true, limit: null, period: null },
    cv_full_report: { allowed: true, limit: null, period: null },
    saved_jobs: { allowed: true, limit: null, period: null },
    job_alerts: { allowed: true, limit: 10, period: null },
    sponsorship_insights: { allowed: true, limit: null, period: null },
    sponsorship_documents: { allowed: true, limit: 50, period: 'month' },
    // The monthly number of applications is set by admins (apply_settings.pro_monthly) and read live.
    auto_apply: { allowed: true, limit: null, period: 'month' },
  },
};

/** Fair use on sponsorship documents for every plan: at most this many in any 7 days. */
export const DOCS_PER_WEEK_FAIR_USE = 30;

export type Benefit = { title: string; text: string };

export type PlanInfo = {
  id: PlanId;
  name: string;
  /** Price in minor units (cents). */
  priceCents: number;
  currency: 'USD';
  interval: 'month' | null;
  /** One line under the name. */
  tagline: string;
  /** Why it is worth paying for, in one or two sentences (checkout page). */
  worth: string;
  /** Most tangible first. Only what exists today. */
  benefits: Benefit[];
  /** Being built; shown as "coming", never as included. */
  coming: string[];
};

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    currency: 'USD',
    interval: null,
    tagline: 'Browse every job, free forever.',
    worth: 'Job search stays free.',
    benefits: [
      { title: 'Every job, search and filters', text: 'Straight from company career pages, with the visa route and sponsorship information we have.' },
      { title: '5 free sponsorship documents', text: 'Download them instantly and edit them any time later.' },
      { title: 'Save up to 5 jobs', text: 'Keep the jobs you want to come back to.' },
      { title: 'Application tracking with reminders', text: 'Log where you applied and get a nudge to follow up.' },
      { title: 'One job alert', text: 'A notification when new jobs match your search, and a daily email.' },
    ],
    coming: [],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceCents: 299,
    currency: 'USD',
    interval: 'month',
    tagline: 'CV match on every job, and stronger applications.',
    worth: 'Know exactly why a job fits you and what to change in your CV before you apply — on every job, not three a day.',
    benefits: [
      { title: 'CV match on every job', text: 'Where each point of your score comes from, the skills you’re missing, and what to change in your CV for that job.' },
      { title: 'All your best matches, ranked', text: 'Every job that fits your CV, ranked — not just the first ten.' },
      { title: '10 sponsorship documents a month', text: 'The proposal you send an employer when a job needs a visa: the route that may apply and what it asks of them, with sources.' },
      { title: 'Companies that sponsor visas', text: 'Who is hiring with visa sponsorship in each country, plus each company’s reply rate and time to reply.' },
      { title: 'Up to 5 job alerts', text: 'Follow several roles and countries; new matching jobs reach your notifications within 30 minutes.' },
      { title: 'Unlimited saved jobs', text: 'Save as many jobs as you like.' },
    ],
    coming: [],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 899,
    currency: 'USD',
    interval: 'month',
    tagline: 'Apply faster, with applications prepared for you.',
    worth: 'MadeVisa prepares a tailored CV and cover letter for each job you choose and sends it — or hands it to you ready to send — so you apply to more of the right jobs in less time.',
    benefits: [
      { title: 'Auto Apply to your best matches', text: 'A CV tailored to each job and a cover letter when one helps, built only from what your CV says. Sent for you where the employer takes applications through MadeVisa, otherwise ready for you to send.' },
      { title: '50 sponsorship documents a month', text: 'One for every job you apply to that needs a visa.' },
      { title: 'Up to 10 job alerts', text: 'Follow more roles and countries at once.' },
      { title: 'Everything in Starter', text: 'Full CV match reports, unlimited saved jobs, job alerts and sponsorship insights.' },
      { title: '10 jobs in each “Jobs for you” email', text: '10 matching jobs in each email instead of 5.' },
    ],
    coming: ['Recruiter and hiring-manager discovery with personalised outreach drafts', 'Proof of Fit summaries from your real experience', 'Interview preparation and follow-up help', 'Career Mode after you’re hired'],
  },
};

/** "$2.99" — cents in, US-dollar label out. */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

/** "$2.99 / month" */
export const priceLabel = (plan: PlanId): string => (plan === 'free' ? '$0' : `${usd(PLANS[plan].priceCents)} / month`);

/** Plans in order, for comparisons. */
export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

/** The lowest plan that includes a feature (for "Unlock with Starter"). */
export function lowestPlanWith(feature: FeatureId): PaidPlanId {
  return ENTITLEMENTS.starter[feature].allowed ? 'starter' : 'pro';
}
