import { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { PLANS, useMyPlan, type FeatureId } from '@/lib/plans';
import { checkPayment, manageUrl, useCardPayments } from '@/lib/gumroad';
import { formatMoney, longDate, trackBilling } from '@/lib/billing';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

// Settings → Billing: the plan, its state as Gumroad last reported it, what's
// used, and the real ways to change it. Cancelling happens on Gumroad (the
// only place that stops the charges) — there is no local "cancel" button.

const usageRow = (label: string, used: number | undefined, limit: number | null) =>
  used == null ? null : { label, value: limit == null ? `${used} · no limit` : `${used} of ${limit}` };

export function BillingCard() {
  const my = useMyPlan();
  const card = useCardPayments();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash === '#billing') window.setTimeout(() => document.getElementById('billing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }, []);
  useEffect(() => {
    if (my.sub?.payment_issue) trackBilling('payment_failed_shown', { plan: my.plan });
  }, [my.sub?.payment_issue, my.plan]);

  const sub = my.sub;
  const gumroad = sub?.provider === 'gumroad' && sub.provider_ref ? sub.provider_ref : null;
  const name = my.plan === 'free' ? 'Free' : PLANS[my.plan].name;

  const check = async () => {
    setChecking(true);
    setChecked(null);
    const r = await checkPayment();
    setChecking(false);
    setChecked(r.throttled ? 'Checked a moment ago — try again in a few seconds.' : r.plan === 'free' ? 'No active payment found on Gumroad for this account.' : `Gumroad confirms ${PLANS[r.plan].name}.`);
  };

  const status = !sub
    ? { label: 'Free plan', tone: 'bg-ink-100 text-ink-700' }
    : sub.payment_issue
      ? { label: 'Payment problem', tone: 'bg-rose-100 text-rose-800' }
      : sub.cancel_at_period_end
        ? { label: 'Cancelled — runs to the end of the period', tone: 'bg-amber-100 text-amber-900' }
        : { label: 'Active', tone: 'bg-emerald-100 text-emerald-800' };

  const rows: { label: string; value: string }[] = [];
  if (sub) {
    if (sub.price_cents) rows.push({ label: 'Price', value: `${formatMoney(sub.price_cents)} / ${sub.billing === 'yearly' ? 'year' : 'month'}` });
    rows.push({ label: 'Billing', value: sub.billing === 'yearly' ? 'Yearly' : 'Monthly' });
    if (sub.cancel_at_period_end && sub.current_period_end) rows.push({ label: 'Ends on', value: longDate(sub.current_period_end) });
    else if (sub.renews_at) rows.push({ label: 'Next renewal', value: longDate(sub.renews_at) });
    else if (sub.current_period_end) rows.push({ label: 'Paid until', value: longDate(sub.current_period_end) });
    rows.push({ label: 'Paid through', value: gumroad ? 'Gumroad (card)' : 'Activated by MadeVisa' });
  }
  const lim = (f: FeatureId) => my.limit(f);
  const usage = [
    my.has('sponsorship_documents') ? usageRow('Sponsorship documents this month', my.usage?.documents_this_month, lim('sponsorship_documents')) : null,
    usageRow('Active job alerts', my.usage?.job_alerts, lim('job_alerts')),
    usageRow('Saved jobs', my.usage?.saved_jobs, lim('saved_jobs')),
  ].filter((x): x is { label: string; value: string } => Boolean(x));

  return (
    <section id="billing" aria-labelledby="billing-title" className="scroll-mt-24 border border-ink-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="billing-title" className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <CreditCard className="h-4 w-4 text-ink-400" aria-hidden /> Billing
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
      </div>

      {my.loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <>
          <p className="mt-3 text-lg font-bold text-ink-950">{name}</p>

          {sub?.payment_issue && gumroad && (
            <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Your last renewal didn’t go through
              </p>
              <p className="mt-1 text-[13px] leading-5">Gumroad will try again. Update your payment method to keep {PLANS[my.plan].name}; it stays on for a few days meanwhile.</p>
              <a href={manageUrl(gumroad)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold underline">
                Update payment method on Gumroad <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          )}

          {rows.length > 0 && (
            <dl className="mt-3 divide-y divide-ink-100 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">{r.label}</dt>
                  <dd className="text-right font-semibold text-ink-900">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {my.others.map((o) => (
            <p key={o.provider_ref ?? o.plan} className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
              Your {PLANS[o.plan].name} is also running{o.until ? ` until ${longDate(o.until)}` : ''}.{' '}
              {o.status === 'pending_cancellation' ? (
                'It is cancelled and won’t renew.'
              ) : o.provider_ref ? (
                <a href={manageUrl(o.provider_ref)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Cancel it on Gumroad so you aren’t billed twice
                </a>
              ) : null}
            </p>
          ))}

          {!sub && my.last && (
            <p className="mt-2 text-[13px] leading-5 text-ink-600">
              Your {PLANS[my.last.plan].name} ended{my.last.ended_at ? ` on ${longDate(my.last.ended_at)}` : ''}. Your CV, saved jobs, applications and documents are all still here.
            </p>
          )}

          {usage.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Usage</p>
              <dl className="mt-1 divide-y divide-ink-100 text-sm">
                {usage.map((r) => (
                  <div key={r.label} className="flex justify-between gap-4 py-2">
                    <dt className="text-ink-500">{r.label}</dt>
                    <dd className="text-right font-semibold tabular-nums text-ink-900">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {gumroad && (
              <a
                href={manageUrl(gumroad)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackBilling('billing_manage_clicked', { plan: my.plan })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {sub?.cancel_at_period_end ? 'Restart on Gumroad' : 'Manage or cancel on Gumroad'} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {my.plan === 'free' && (
              <a href="/pricing" onClick={(e) => handleNavClick(e, () => nav('/pricing'))} className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                See the membership
              </a>
            )}
            {card.on && (
              <button type="button" onClick={() => void check()} disabled={checking} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100 disabled:opacity-60">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Check my payment
              </button>
            )}
          </div>
          {checked && (
            <p className="mt-2 text-[13px] text-ink-600" role="status">
              {checked}
            </p>
          )}

          <p className="mt-4 text-[12px] leading-5 text-ink-500">
            {gumroad
              ? 'Cancelling on Gumroad stops the renewals; you keep your plan until the end of the period you paid for. Receipts are in your email from Gumroad.'
              : sub
                ? 'This plan was activated by MadeVisa. To change or cancel it, write to hello@madevisa.com.'
                : 'Browsing jobs and your CV match score are free for good.'}{' '}
            <a href="/subscription-terms" onClick={(e) => handleNavClick(e, () => nav('/subscription-terms'))} className="font-semibold text-brand-700 hover:underline">
              Subscription terms
            </a>
          </p>
        </>
      )}
    </section>
  );
}
