import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PLAN_NAME, type RequestPlanId } from '@/lib/plans';
import { GumroadCard } from '@/pages/admin/GumroadCard';

// Admin → Plans: card payments (Gumroad), every plan request (also emailed to
// hello@madevisa.com), and who has Pro.
// With card payments on, the checkout is paid on Gumroad and the plan switches on by
// itself. Without them (and for employer products), the flow is:
// 1. email the person a payment link  2. once paid → Activate.

type Req = {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  company: string | null;
  plan: RequestPlanId;
  billing: string;
  price_label: string | null;
  region: string | null;
  country_code: string | null;
  occupation: string | null;
  specialization: string | null;
  experience: string | null;
  target_countries: string[];
  message: string | null;
  status: 'new' | 'contacted' | 'active' | 'declined';
  created_at: string;
};
type Sub = { user_id: string; plan: string; status: string; current_period_end: string | null; note: string | null };
/** CV match funnel (cv_admin_stats, migration 20261126090000). */
type CvStats = { cvs: number; cvs_7d: number; checks: number; jobs_checked_7d: number; people_checking_7d: number; hit_limit_today: number; avg_score: number | null };

const STATUS_STYLE: Record<Req['status'], string> = {
  new: 'bg-amber-100 text-amber-900',
  contacted: 'bg-brand-100 text-brand-800',
  active: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-ink-100 text-ink-600',
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function PlansSection() {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cv, setCv] = useState<CvStats | null>(null);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase.from('plan_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('subscriptions').select('*').order('updated_at', { ascending: false }).limit(200),
    ]);
    if (r.error) return setMissing(true);
    setReqs((r.data ?? []) as Req[]);
    setSubs((s.data ?? []) as Sub[]);
    // Absent until the CV match migration is run — the section just doesn't show.
    const stats = await supabase.rpc('cv_admin_stats');
    setCv(stats.error ? null : (stats.data as CvStats));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: Req['status']) => {
    setBusy(id);
    await supabase.from('plan_requests').update({ status, handled_at: new Date().toISOString() }).eq('id', id);
    setBusy(null);
    void load();
  };
  const activate = async (r: Req, months: number) => {
    setBusy(r.id);
    const { error } = await supabase.rpc('activate_plan', { p_request: r.id, p_months: months });
    setBusy(null);
    setMsg(error ? error.message : `${PLAN_NAME[r.plan]} activated for ${r.email}${r.user_id ? ' — they’ve been notified.' : '.'}`);
    void load();
  };

  if (missing) return <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Run the migration 20261107090000_plans_notifications.sql to turn on plans.</p>;

  const activeSubs = subs.filter((s) => s.status === 'active' && (!s.current_period_end || Date.parse(s.current_period_end) > Date.now()));

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          <strong className="text-ink-950">{reqs?.filter((r) => r.status === 'new').length ?? 0}</strong> new requests · <strong className="text-ink-950">{activeSubs.length}</strong> paying members (Starter {activeSubs.filter((s) => s.plan === 'starter').length} · Pro {activeSubs.filter((s) => s.plan !== 'starter').length})
        </p>
        <button onClick={() => void load()} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {cv && (
        <section aria-label="CV match" className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-sm font-bold text-ink-950">CV match</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                [cv.cvs, 'CVs uploaded'],
                [cv.cvs_7d, 'new in 7 days'],
                [cv.people_checking_7d, 'people checking, 7 days'],
                [cv.jobs_checked_7d, 'jobs checked, 7 days'],
                [cv.hit_limit_today, 'hit the free limit today'],
                [cv.avg_score == null ? '—' : `${cv.avg_score}%`, 'average match'],
              ] as [number | string, string][]
            ).map(([v, k]) => (
              <div key={k}>
                <dd className="text-xl font-bold tabular-nums text-ink-950">{v}</dd>
                <dt className="text-xs text-ink-500">{k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-500">“Hit the free limit” = free accounts that used all 3 missing-skill checks today — the people most likely to want the membership.</p>
        </section>
      )}
      <GumroadCard />
      <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-600">
        One plan: the MadeVisa Membership ($2.99 for 3 months, billed every 3 months), the same price everywhere (members of earlier plans keep their old price). With card payments on, people pay on Gumroad — with or without a MadeVisa account — and the membership switches on by itself once the payment is verified. A buyer with no account gets one made for their email, plus the “account ready” and “welcome” emails (Emails → Templates: member_account, member_welcome; sent ones show in the email log as kind “membership”). Nothing to do here. Requests below come in when card payments are off, and for employer products: reply to the request email (it goes to hello@madevisa.com) with a payment link, mark it <em>Contacted</em>, and once paid click <em>Activate</em>. The person gets a notification.
      </p>
      {msg && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{msg}</p>}

      {!reqs ? (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : !reqs.length ? (
        <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">No plan requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {reqs.map((r) => (
            <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-950">{PLAN_NAME[r.plan] ?? r.plan}</span>
                <span className="text-sm text-ink-500">{r.price_label ?? r.billing}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="ml-auto text-xs text-ink-400">{when(r.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {r.name ?? '—'} ·{' '}
                <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Your ${PLAN_NAME[r.plan] ?? 'MadeVisa'} payment link`)}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                  <Mail className="h-3.5 w-3.5" /> {r.email}
                </a>
                {r.company ? ` · ${r.company}` : ''}
                {r.user_id ? '' : ' · no account'}
              </p>
              {(r.occupation || r.experience || r.country_code) && (
                <p className="mt-1 text-xs text-ink-500">
                  {[r.occupation, r.specialization, r.experience, r.country_code && `passport ${r.country_code}`, r.target_countries?.length ? `→ ${r.target_countries.join(', ')}` : null, r.region && `${r.region} pricing`].filter(Boolean).join(' · ')}
                </p>
              )}
              {r.message && <p className="mt-2 rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-700">{r.message}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== 'active' && (
                  <>
                    {r.user_id && r.plan === 'brief_credits' ? (
                      <button
                        onClick={() => {
                          // Documents bought: read from "5 documents · AZN 35 ($20) · AZ/B", confirm with the admin.
                          const guess = Number(/(\d+) document/i.exec(r.price_label ?? '')?.[1] ?? 1);
                          const n = Number(window.prompt(`How many document credits were paid for?\n${r.price_label ?? ''}`, String(guess)));
                          if (Number.isInteger(n) && n > 0 && n <= 100) void activate(r, n);
                        }}
                        disabled={busy === r.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Add credit
                      </button>
                    ) : r.user_id && (r.plan === 'pro' || r.plan === 'starter' || r.plan === 'relocation') ? (
                      <>
                        <button onClick={() => void activate(r, r.plan === 'relocation' ? 3 : r.billing === 'yearly' ? 12 : 1)} disabled={busy === r.id} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Activate ({r.plan === 'relocation' ? '3 months Pro' : r.billing === 'yearly' ? '12 months' : '1 month'})
                        </button>
                      </>
                    ) : (
                      <button onClick={() => void activate(r, 1)} disabled={busy === r.id} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                      </button>
                    )}
                    {r.status === 'new' && (
                      <button onClick={() => void setStatus(r.id, 'contacted')} disabled={busy === r.id} className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                        Mark contacted
                      </button>
                    )}
                    <button onClick={() => void setStatus(r.id, 'declined')} disabled={busy === r.id} className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink-100">
                      Decline
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeSubs.length > 0 && (
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-sm font-bold text-ink-950">Active members</p>
          <ul className="mt-2 divide-y divide-ink-100 text-sm">
            {activeSubs.map((s) => (
              <li key={s.user_id} className="flex justify-between py-2">
                <span className="text-ink-700">{s.note ?? s.user_id.slice(0, 8)}</span>
                <span className="text-ink-500">until {when(s.current_period_end)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
