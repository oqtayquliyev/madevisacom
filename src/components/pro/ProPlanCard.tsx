import { useEffect } from 'react';
import { ArrowRight, Check, ExternalLink, Sparkles } from 'lucide-react';
import { PLANS, priceLabel, useMyPlan, type PaidPlanId, type PlanId } from '@/lib/plans';
import { manageUrl } from '@/lib/gumroad';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

// Plan cards. Prices are the flat monthly prices (the same everywhere); the
// checkout page shows the server's price and summary before anyone pays.

/** One plan's card: price, what's in it, and the button to its checkout (or "Your plan"). */
export function PlanCard({
  plan,
  source,
  highlight = false,
  compact = false,
  onFree,
}: {
  plan: PlanId;
  /** Which page this is on (for the checkout funnel). */
  source: string;
  highlight?: boolean;
  compact?: boolean;
  /** Free plan's button. */
  onFree?: { label: string; onClick: () => void };
}) {
  const my = useMyPlan();
  const info = PLANS[plan];
  const mine = my.plan === plan;
  const covered = my.plan === 'pro' && plan === 'starter';
  const benefits = compact ? info.benefits.slice(0, 3) : info.benefits;
  const href = plan === 'free' ? null : checkoutHref(plan, source);
  const sub = my.sub;

  return (
    <div id={plan} className={`relative flex scroll-mt-24 flex-col rounded-2xl bg-white p-6 ${highlight ? 'border-2 border-brand-600 shadow-soft-lg' : 'border border-ink-200'}`}>
      {highlight && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recommended start
        </span>
      )}
      <p className="text-2xl font-bold tracking-tight text-ink-950 sm:text-[28px]">{plan === 'free' ? 'Free' : `MadeVisa ${info.name}`}</p>
      <p className="mt-1 text-[15px] font-medium leading-5 text-ink-600">{info.tagline}</p>
      <p className="mt-4 text-5xl font-bold tracking-tight text-ink-950" data-plan-price={plan}>
        {plan === 'free' ? '$0' : priceLabel(plan).replace(' / month', '')}
        <span className="text-base font-medium text-ink-500">{plan === 'free' ? ' forever' : ' / month'}</span>
      </p>
      <p className="text-[13px] text-ink-500">{plan === 'free' ? 'No card needed' : 'USD, billed monthly · cancel any time'}</p>

      {/* Feature titles only: the details are in "Compare plans" below the cards. */}
      <ul className="mt-6 flex-1 space-y-3">
        {plan !== 'free' && <li className="text-[15px] font-bold text-ink-950">{plan === 'starter' ? 'Everything in Free, plus:' : 'Everything in Starter, plus:'}</li>}
        {benefits
          .filter((b) => b.title !== 'Everything in Starter')
          .map((b) => (
            <li key={b.title} className="flex items-start gap-2.5 text-[15px] font-semibold leading-6 text-ink-900">
              <Check className={`mt-1 h-4 w-4 shrink-0 ${plan === 'free' ? 'text-ink-400' : 'text-brand-600'}`} aria-hidden />
              <span>{b.title}</span>
            </li>
          ))}
      </ul>

      {plan === 'free' ? (
        onFree ? (
          <button type="button" onClick={onFree.onClick} className="mt-6 rounded-lg border border-ink-200 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            {onFree.label}
          </button>
        ) : null
      ) : mine || covered ? (
        <div className="mt-6 rounded-lg bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-900">
          {mine ? 'Your plan' : 'Included in your Pro'}
          {mine && sub?.current_period_end ? ` · ${sub.cancel_at_period_end ? 'ends' : 'renews'} ${new Date(sub.renews_at ?? sub.current_period_end).toLocaleDateString()}` : ''}
          {mine && sub?.provider === 'gumroad' && sub.provider_ref && (
            <a href={manageUrl(sub.provider_ref)} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center justify-center gap-1 text-[12px] font-semibold text-emerald-900 underline">
              Manage or cancel on Gumroad <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      ) : (
        <a
          href={href!}
          onClick={(e) => {
            trackBilling('plan_selected', { plan, source });
            handleNavClick(e, () => nav(href!));
          }}
          className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            highlight ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-ink-950 text-white hover:bg-ink-800'
          }`}
        >
          Get {info.name} <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

/**
 * The card shown on feature pages (CV match, documents): the plan that unlocks
 * what the page is about, with a link to compare. Name kept from the one-plan days.
 */
export function ProPlanCard({ plan = 'starter', source, compact = false }: { plan?: PaidPlanId; source: string; compact?: boolean; onAuth?: (p: 'login' | 'register') => void }) {
  useEffect(() => {
    trackBilling('upgrade_prompt_shown', { id: `plan_card_${plan}`, plan, source });
  }, [plan, source]);
  return (
    <div>
      <PlanCard plan={plan} source={source} highlight compact={compact} />
      <a href="/pricing" onClick={(e) => handleNavClick(e, () => nav('/pricing'))} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
        Compare Free, Starter and Pro
      </a>
    </div>
  );
}
