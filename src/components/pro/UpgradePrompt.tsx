import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';
import { PLANS, priceLabel, useMyPlan, type PaidPlanId } from '@/lib/plans';
import { checkoutHref, dismissPrompt, promptDismissed, trackBilling } from '@/lib/billing';

// A contextual upgrade note: the benefit first, then the plan and its price,
// a link to the checkout, and a way to dismiss it (it stays away for a week).
// Never a blocking pop-up, never a countdown. Hidden from people who already
// have the plan (or a higher one).

export const UPGRADE_COPY: Record<PaidPlanId, string> = {
  starter: 'Want a stronger application for this job? Starter includes the full CV match report — what to change in your CV for each job — and sponsorship documents.',
  pro: 'Want applications prepared for you? Pro includes Auto Apply: a CV tailored to each job and a cover letter when one helps, sent or ready to send.',
};

export function UpgradePrompt({
  id,
  plan,
  text,
  source,
  className = '',
}: {
  /** Stable id, for "dismissed for a week" and analytics. */
  id: string;
  plan: PaidPlanId;
  text?: string;
  /** Which part of the site this is (shown in Admin → Plans → funnel). */
  source: string;
  className?: string;
}) {
  const my = useMyPlan();
  const [hidden, setHidden] = useState(() => promptDismissed(id));
  const show = !hidden && !my.loading && !(my.plan === plan || (my.plan === 'pro' && plan === 'starter'));
  useEffect(() => {
    if (show) trackBilling('upgrade_prompt_shown', { id, plan, source });
  }, [show, id, plan, source]);
  if (!show) return null;
  const href = checkoutHref(plan, source);
  return (
    <aside className={`relative rounded-xl border border-brand-200 bg-brand-50/70 p-4 pr-10 ${className}`} aria-label={`About MadeVisa ${PLANS[plan].name}`}>
      <p className="text-sm leading-6 text-ink-800">{text ?? UPGRADE_COPY[plan]}</p>
      <a
        href={href}
        onClick={(e) => {
          trackBilling('upgrade_prompt_clicked', { id, plan, source });
          handleNavClick(e, () => nav(href));
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        See {PLANS[plan].name} · {priceLabel(plan)} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
      <button
        type="button"
        onClick={() => {
          dismissPrompt(id);
          setHidden(true);
          trackBilling('upgrade_prompt_dismissed', { id, plan, source });
        }}
        className="absolute right-2 top-2 rounded-md p-1.5 text-ink-400 hover:bg-white hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  );
}
