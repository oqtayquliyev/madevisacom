// Plans and prices (/pricing), plan requests, and "am I Pro?".
// Until a payment provider is connected, choosing a plan sends a request
// (plan_requests, migration 20261107090000): hello@madevisa.com gets an
// email, admins get a notification, and an admin activates it after payment.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PRO_MONTHLY_DOCS, type PriceTier } from '@/lib/pricing';

export type PlanId = 'pro' | 'relocation' | 'sponsored_job' | 'featured_social' | 'employer' | 'hiring_brief' | 'brief_credits';
export type Billing = 'monthly' | 'yearly' | 'one_time';
/** Price tier (A / B / C) — see src/lib/pricing.ts. Kept under this name for plan requests. */
export type PriceRegion = PriceTier;

export const PLAN_NAME: Record<PlanId, string> = {
  pro: 'MadeVisa Pro',
  relocation: 'Pro Relocation',
  sponsored_job: 'Sponsored job',
  featured_social: 'Featured in social posts',
  employer: 'Employer plan',
  hiring_brief: 'Hiring Brief',
  brief_credits: 'Document credit',
};

export const PRO_FEATURES = [
  { title: 'Instant job alerts', text: 'New roles matching your role and country, as soon as companies post them — be an early applicant.' },
  { title: 'Full company response data', text: 'Exact reply rate, typical time to reply and hiring activity before you apply.' },
  { title: 'Companies that sponsor visas', text: 'Who is hiring with visa sponsorship in each country, updated live.' },
  { title: `${PRO_MONTHLY_DOCS} sponsorship documents a month`, text: 'A sign-ready offer for the jobs you apply to — about a fifth of the single-document price.' },
  { title: 'First access to new Pro tools', text: 'Your own application stats and salary ranges are next — Pro members get them first.' },
];

export type PlanRequest = {
  plan: PlanId;
  billing: Billing;
  priceLabel: string;
  region: PriceRegion;
  email: string;
  name?: string;
  company?: string;
  countryCode?: string | null;
  occupation?: string;
  specialization?: string;
  experience?: string;
  targetCountries?: string[];
  message?: string;
};

export async function submitPlanRequest(r: PlanRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('plan_requests').insert({
    plan: r.plan,
    billing: r.billing,
    price_label: r.priceLabel,
    region: r.region,
    email: r.email.trim(),
    name: r.name?.trim() || null,
    company: r.company?.trim() || null,
    country_code: r.countryCode || null,
    occupation: r.occupation?.trim() || null,
    specialization: r.specialization?.trim() || null,
    experience: r.experience || null,
    target_countries: r.targetCountries ?? [],
    message: r.message?.trim() || null,
  });
  if (error) return { ok: false, error: /check constraint|email/i.test(error.message) ? 'Please check your email address.' : error.message };
  return { ok: true };
}

export type Subscription = { plan: string; status: string; current_period_end: string | null };

let proCache: { userId: string; sub: Subscription | null; at: number } | null = null;

/** The signed-in person's active plan (null = free). */
export function useMyPlan(): { isPro: boolean; sub: Subscription | null; loading: boolean } {
  const { user } = useAuth();
  const cached = user && proCache?.userId === user.id && Date.now() - proCache.at < 5 * 60_000 ? proCache : null;
  const [sub, setSub] = useState<Subscription | null>(cached?.sub ?? null);
  const [loading, setLoading] = useState(Boolean(user) && !cached);
  useEffect(() => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    if (cached) return;
    let alive = true;
    supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const s = (data as Subscription | null) ?? null;
        proCache = { userId: user.id, sub: s, at: Date.now() };
        setSub(s);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const isPro = Boolean(sub && sub.status === 'active' && (!sub.current_period_end || Date.parse(sub.current_period_end) > Date.now()));
  return { isPro, sub, loading };
}

/** Profile fields that make Pro matching work — what's still missing. */
export function missingProfileFields(p: { occupation?: string | null; specialization?: string | null; experience?: string | null; nationality_country_id?: string | null; preferred_destination_country_id?: string | null } | null) {
  if (!p) return ['role', 'specialization', 'experience', 'passport', 'target country'];
  const m: string[] = [];
  if (!p.occupation) m.push('role');
  if (!p.specialization) m.push('specialization');
  if (!p.experience) m.push('experience');
  if (!p.nationality_country_id) m.push('passport');
  if (!p.preferred_destination_country_id) m.push('target country');
  return m;
}

export const EXPERIENCE_OPTIONS = ['Student / no experience', 'Less than 2 years', '2–5 years', '5–10 years', '10+ years'];
