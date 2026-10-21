// MadeVisa for job seekers: one paid plan, MadeVisa Membership — what it costs and what it includes.
//
// THE ONE COPY of the plan catalogue in code. It is read by
//   • the app (src/lib/plans.ts re-exports it),
//   • the server-rendered pricing page (api/seo.ts),
//   • the gumroad function, which only sells the membership when its Gumroad
//     product has exactly this price (supabase/functions/gumroad/core.ts).
// The database keeps the same numbers in billing_plans and plan_entitlements
// (migrations 20261219090000_starter_pro_plans.sql and
// 20261231090000_single_membership_guest_checkout.sql), because the database
// is what enforces them. src/lib/__tests__/billing.test.ts fails when the two
// copies disagree, so change both together.
//
// Rules this file follows (product decisions, October 2026):
//   • ONE paid plan, MadeVisa Membership, at a flat monthly price in US dollars,
//     the same in every country. No tiers, no yearly billing, no add-ons.
//   • Applying to jobs (the job page's Apply button) is for members.
//     Browsing every job stays open to everyone.
//   • Every limit is shown before purchase. Nothing is "unlimited" when it
//     costs real money to run; the limits below are the fair-use limits.
//   • Only features that exist are listed as included.
//
// Plan ids: the membership is stored as 'starter' (its id since October 2026,
// so existing members and records keep working). 'pro' is the retired higher
// plan: it is no longer sold, and people who still have it keep everything.
//
// No imports and no browser code: Deno and Vite both load this file.

export type PlanId = 'free' | 'starter' | 'pro';
export type PaidPlanId = Exclude<PlanId, 'free'>;
/** Plans a person can still hold. Only MEMBERSHIP_PLAN is sold. */
export const PAID_PLANS: readonly PaidPlanId[] = ['starter', 'pro'];
/** The one plan on sale. */
export const MEMBERSHIP_PLAN: PaidPlanId = 'starter';

/** Higher includes everything below it. */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2 };

export const isPaidPlanId = (v: unknown): v is PaidPlanId => v === 'starter' || v === 'pro';

/**
 * Feature identifiers — the same strings as plan_entitlements.feature in the
 * database. `limit` null = no limit; a number = that many per `period`.
 */
export type FeatureId =
  | 'cv_missing_skills' // missing skills on a job's CV match
  | 'cv_full_report' // every part of the score, what to change in the CV, all top matches
  | 'saved_jobs' // jobs kept in "Saved jobs"
  | 'job_alerts' // active job alerts (each: a notification when new jobs match, and a daily email)
  | 'sponsorship_insights' // companies sponsoring visas per country + full company response data
  | 'sponsorship_documents'; // sponsorship documents (proposal to the employer) per calendar month

export type Period = 'day' | 'month' | null;
export type Entitlement = { allowed: boolean; limit: number | null; period: Period };

/** What each plan may use. Mirrors plan_entitlements in the database. */
export const ENTITLEMENTS: Record<PlanId, Record<FeatureId, Entitlement>> = {
  free: {
    cv_missing_skills: { allowed: false, limit: 0, period: 'day' },
    cv_full_report: { allowed: false, limit: 0, period: null },
    saved_jobs: { allowed: true, limit: 5, period: null },
    job_alerts: { allowed: true, limit: 1, period: null },
    sponsorship_insights: { allowed: false, limit: 0, period: null },
    sponsorship_documents: { allowed: true, limit: 1, period: 'month' },
  },
  starter: {
    cv_missing_skills: { allowed: true, limit: null, period: null },
    cv_full_report: { allowed: true, limit: null, period: null },
    saved_jobs: { allowed: true, limit: null, period: null },
    job_alerts: { allowed: true, limit: 5, period: null },
    sponsorship_insights: { allowed: true, limit: null, period: null },
    sponsorship_documents: { allowed: true, limit: 20, period: 'month' },
  },
  // Retired plan: kept for the members who still have it.
  pro: {
    cv_missing_skills: { allowed: true, limit: null, period: null },
    cv_full_report: { allowed: true, limit: null, period: null },
    saved_jobs: { allowed: true, limit: null, period: null },
    job_alerts: { allowed: true, limit: 10, period: null },
    sponsorship_insights: { allowed: true, limit: null, period: null },
    sponsorship_documents: { allowed: true, limit: 50, period: 'month' },
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
  /** Most tangible first. Only what exists today. */
  benefits: Benefit[];
};

/** The membership's benefits, in the order the pricing page and the paywall show them. */
const MEMBERSHIP_BENEFITS: Benefit[] = [
  { title: 'Discover jobs beyond LinkedIn and Indeed', text: 'Access opportunities sourced directly from company career pages, including jobs you might otherwise miss on major job platforms.' },
  { title: 'Smart access to newly published jobs', text: 'Discover fresh openings from company career pages and get straight to the original application page, faster.' },
  { title: 'Remote and online job listings', text: 'Work-from-anywhere, remote and hybrid roles from the same company career pages, marked on every listing.' },
  { title: 'CV match for every job', text: 'See how well your experience aligns with each role and identify opportunities worth pursuing.' },
  { title: 'Personalised CV improvement suggestions', text: 'Get job-specific recommendations to better align your CV with the requirements of each position.' },
  { title: 'Find companies that sponsor work visas', text: 'Discover relevant opportunities from employers that offer visa sponsorship, with details to help you assess each job before applying.' },
  { title: 'Sponsorship documents included', text: '20 sponsorship documents a month (at most 30 in any 7 days): the proposal you send an employer when a job needs a visa.' },
];

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    currency: 'USD',
    interval: null,
    tagline: 'Browse every job.',
    benefits: [{ title: 'Browse every job', text: 'Search and filter every listing from company career pages.' }],
  },
  starter: {
    id: 'starter',
    name: 'MadeVisa Membership',
    priceCents: 229,
    currency: 'USD',
    interval: 'month',
    tagline: 'One affordable plan. Everything you need to search smarter and apply with confidence.',
    benefits: MEMBERSHIP_BENEFITS,
  },
  pro: {
    id: 'pro',
    name: 'MadeVisa Pro (retired)',
    priceCents: 899,
    currency: 'USD',
    interval: 'month',
    tagline: 'No longer sold. Members who have it keep everything in the membership.',
    benefits: MEMBERSHIP_BENEFITS,
  },
};

/** "$2.29" — cents in, US-dollar label out. */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

/** "$2.29 / month" */
export const priceLabel = (plan: PlanId): string => (plan === 'free' ? '$0' : `${usd(PLANS[plan].priceCents)} / month`);

/** "$2.29" — the membership's price. */
export const MEMBERSHIP_PRICE = usd(PLANS[MEMBERSHIP_PLAN].priceCents);

/** Plans in order, for comparisons. */
export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

/** The plan that includes a feature: always the membership now. */
export function lowestPlanWith(feature: FeatureId): PaidPlanId {
  return ENTITLEMENTS[MEMBERSHIP_PLAN][feature].allowed ? MEMBERSHIP_PLAN : 'pro';
}
