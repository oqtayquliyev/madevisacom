import { useEffect } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { FEATURES, FEATURES_TITLE, MEMBERSHIP_PLAN, MEMBERSHIP_PRICE, PLANS, useMyPlan, type PaidPlanId } from '@/lib/plans';
import { manageUrl } from '@/lib/gumroad';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

// The membership card for feature pages (documents, the sponsorship document
// download). One plan, one price; "Get started" goes straight to payment.

/** The membership: price, what's in it, and the button (or "You're a member"). */
export function PlanCard({ source, compact = false }: { plan?: PaidPlanId | 'free'; source: string; highlight?: boolean; compact?: boolean }) {
  const my = useMyPlan();
  const info = PLANS[MEMBERSHIP_PLAN];
  const benefits = compact ? FEATURES.slice(0, 4) : FEATURES;
  const href = checkoutHref(MEMBERSHIP_PLAN, source);
  const sub = my.sub;

  return (
    <div id="membership" className="relative flex scroll-mt-24 flex-col rounded-2xl border-2 border-brand-600 bg-white p-6 shadow-soft-lg">
      <p className="text-sm font-bold uppercase tracking-[0.1em] text-brand-700">{info.name}</p>
      <p className="mt-2 text-5xl font-bold tracking-tight text-ink-950" data-plan-price={MEMBERSHIP_PLAN}>
        {MEMBERSHIP_PRICE}
        <span className="text-base font-medium text-ink-500"> once</span>
      </p>
      <p className="mt-1 text-[14px] font-semibold text-ink-600">The book + 1 year of everything · one payment, nothing renews</p>

      <p className="mt-5 text-[15px] font-bold text-ink-950">{FEATURES_TITLE}</p>
      <ol className="mt-2.5 flex-1 space-y-2.5">
        {benefits.map((b) => (
          <li key={b.title} className="flex items-start gap-2.5 text-[14.5px] leading-6 text-ink-900">
            <span className="w-5 shrink-0 text-center text-[16px]" aria-hidden>
              {b.icon}
            </span>
            <span>
              <strong className="font-semibold">{b.title}</strong> <span className="text-ink-600">{b.sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {my.isPaid ? (
        <div className="mt-6 rounded-lg bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-900">
          You’re a member
          {sub?.current_period_end && sub.billing === 'yearly' ? ` · until ${new Date(sub.current_period_end).toLocaleDateString()}` : sub?.current_period_end && sub.billing !== 'once' ? ` · ${sub.cancel_at_period_end ? 'ends' : 'renews'} ${new Date(sub.renews_at ?? sub.current_period_end).toLocaleDateString()}` : ' · for good'}
          {sub?.provider === 'gumroad' && sub.provider_ref && (
            <a href={manageUrl(sub.provider_ref)} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center justify-center gap-1 text-[12px] font-semibold text-emerald-900 underline">
              {sub.provider_ref.startsWith('sale:') ? 'Receipt on Gumroad' : 'Manage or cancel on Gumroad'} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      ) : (
        <a
          href={href}
          onClick={(e) => {
            trackBilling('plan_selected', { plan: MEMBERSHIP_PLAN, source });
            handleNavClick(e, () => nav(href));
          }}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Get it for {MEMBERSHIP_PRICE} <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

/** The membership card on feature pages, with a link to the pricing page. */
export function ProPlanCard({ source, compact = false }: { plan?: PaidPlanId; source: string; compact?: boolean; onAuth?: (p: 'login' | 'register') => void }) {
  useEffect(() => {
    trackBilling('upgrade_prompt_shown', { id: 'plan_card', plan: MEMBERSHIP_PLAN, source });
  }, [source]);
  return (
    <div>
      <PlanCard source={source} compact={compact} />
      <a href="/pricing" onClick={(e) => handleNavClick(e, () => nav('/pricing'))} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
        See everything in the membership
      </a>
    </div>
  );
}
