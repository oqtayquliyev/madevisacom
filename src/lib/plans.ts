// Plans for job seekers (Free, Starter, Pro), plan requests, and "what do I have?".
//
// The catalogue — prices, benefits, limits — is one shared file,
// supabase/functions/_shared/plans.ts, re-exported here. What a person HAS
// comes from one place on the server, my_entitlements() (migration
// 20261219090000), which every database gate also uses. The app only uses
// it to decide what to show; the database refuses paid features itself.
//
// Paying: with card payments on (Admin → Plans), /checkout prepares a Gumroad
// checkout and the plan switches on when Gumroad's payment is verified on the
// server. With them off, choosing a plan sends a request (plan_requests) that
// an admin activates after payment.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { ENTITLEMENTS, type PlanId } from '../../supabase/functions/_shared/plans';
import { planView, type Loaded, type MyPlan, type OtherMembership, type Subscription, type Usage } from '@/lib/billingCore';

export { planView, type MyPlan, type OtherMembership, type Subscription, type Usage } from '@/lib/billingCore';

export * from '../../supabase/functions/_shared/plans';

/** What a plan request (the form) can be for. 'relocation' and 'brief_credits' are no longer sold; kept so earlier requests still show in Admin. */
export type RequestPlanId = 'starter' | 'pro' | 'relocation' | 'sponsored_job' | 'featured_social' | 'employer' | 'hiring_brief' | 'brief_credits';
export type Billing = 'monthly' | 'yearly' | 'one_time';
/** Where the price came from, for the request: country code, or A / B / C on older requests. */
export type PriceRegion = string;

export const PLAN_NAME: Record<RequestPlanId, string> = {
  starter: 'MadeVisa Starter',
  pro: 'MadeVisa Pro',
  relocation: 'Pro Relocation (retired)',
  sponsored_job: 'Sponsored job',
  featured_social: 'Featured in social posts',
  employer: 'Employer plan',
  hiring_brief: 'Hiring Brief',
  brief_credits: 'Document credit (retired)',
};

export type PlanRequest = {
  plan: RequestPlanId;
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

const asPlan = (v: unknown): PlanId => (v === 'starter' || v === 'pro' ? v : 'free');

let cache: { userId: string; data: Loaded; at: number } | null = null;
/** One read at a time per person, shared by every part of the page that asks. */
let inflight: { userId: string; promise: Promise<Loaded> } | null = null;
const listeners = new Set<() => void>();

/** Read the plan again everywhere it is shown (after a payment, a cancellation…). */
export function refreshMyPlan(): void {
  cache = null;
  inflight = null;
  listeners.forEach((l) => l());
}

let lapseChecked = false;

/** The server's answer; before migration 20261219090000 the old table is read (everything paid was Pro then). */
async function loadPlan(userId: string): Promise<Loaded> {
  const read = () => supabase.rpc('my_entitlements');
  const { data, error } = await read();
  if (error || !data) {
    const old = await supabase.from('subscriptions').select('plan, status, current_period_end, provider, provider_ref, billing, cancel_at_period_end').eq('user_id', userId).maybeSingle();
    const s = (old.data as (Omit<Subscription, 'plan'> & { plan: string }) | null) ?? null;
    const on = Boolean(s && s.status === 'active' && (!s.current_period_end || Date.parse(s.current_period_end) > Date.now()));
    const plan: PlanId = on ? (s!.plan === 'starter' ? 'starter' : 'pro') : 'free';
    return { plan, sub: on && s ? { ...s, plan } : null, others: [], last: null, usage: null, features: ENTITLEMENTS[plan] };
  }
  let d = data as { plan: string; sub: Subscription | null; others?: OtherMembership[]; last?: Loaded['last']; usage?: Usage; features?: Loaded['features'] };
  // Paid by card and run out without being cancelled: a renewal notice may have been
  // lost on the way. Ask the server to look at the payment once, then read again.
  const ended = d.last?.ended_at ? Date.parse(d.last.ended_at) : NaN;
  if (!d.sub && d.last?.provider_status === 'alive' && ended < Date.now() && ended > Date.now() - 21 * 86_400_000 && !lapseChecked) {
    lapseChecked = true;
    try {
      await supabase.functions.invoke('gumroad', { body: { action: 'refresh' } });
      const again = await read();
      if (!again.error && again.data) d = again.data as typeof d;
    } catch {
      /* keep what we read */
    }
  }
  const plan = asPlan(d.plan);
  return {
    plan,
    sub: d.sub ? { ...d.sub, plan } : null,
    others: (d.others ?? []).map((o) => ({ ...o, plan: asPlan(o.plan) })),
    last: d.last ? { ...d.last, plan: asPlan(d.last.plan) } : null,
    usage: d.usage ?? null,
    features: d.features ?? ENTITLEMENTS[plan],
  };
}

const FREE: Loaded = { plan: 'free', sub: null, others: [], last: null, usage: null, features: ENTITLEMENTS.free };

/** The signed-in person's plan and what it includes. */
export function useMyPlan(): MyPlan {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const cached = user && cache?.userId === user.id && Date.now() - cache.at < 5 * 60_000 ? cache : null;
  const [data, setData] = useState<Loaded>(cached?.data ?? FREE);
  const [loading, setLoading] = useState(Boolean(user) && !cached);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    listeners.add(again);
    return () => {
      listeners.delete(again);
    };
  }, []);
  useEffect(() => {
    if (!user) {
      setData(FREE);
      setLoading(false);
      return;
    }
    if (cached) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    let alive = true;
    const uid = user.id;
    if (inflight?.userId !== uid) {
      const promise = loadPlan(uid).then((d) => {
        if (inflight?.promise === promise) {
          cache = { userId: uid, data: d, at: Date.now() };
          inflight = null;
        }
        return d;
      });
      inflight = { userId: uid, promise };
    }
    void inflight.promise.then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tick]);
  return planView(data, loading);
}

/** Profile fields that make matching work — what's still missing. */
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
