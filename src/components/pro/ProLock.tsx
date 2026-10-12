import { useEffect } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { lowestPlanWith, PLANS, priceLabel, useMyPlan, type FeatureId } from '@/lib/plans';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

// A box for a paid feature. People whose plan includes it see the content;
// everyone else sees a blurred placeholder (never real data — the database
// doesn't send it) with the benefit first, then the plan that unlocks it.

export function ProLock({ title, teaser, feature, source = 'job_page', rows = 3, children }: { title: string; teaser: string; feature: FeatureId; source?: string; rows?: number; children: React.ReactNode }) {
  const my = useMyPlan();
  const unlocked = my.has(feature);
  const plan = lowestPlanWith(feature);
  useEffect(() => {
    if (!my.loading && !unlocked) trackBilling('upgrade_prompt_shown', { id: `lock_${feature}`, plan, source });
  }, [my.loading, unlocked, feature, plan, source]);
  if (my.loading) return <div className="h-32 animate-pulse rounded-xl bg-ink-100" aria-hidden />;
  if (unlocked) {
    return (
      <section className="rounded-xl border border-ink-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
          {title}
          {my.plan !== 'free' && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{PLANS[my.plan].name}</span>}
        </p>
        <div className="mt-3">{children}</div>
      </section>
    );
  }
  const href = checkoutHref(plan, source);
  return (
    <section className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5">
      <p className="text-sm font-bold text-ink-950">{title}</p>
      <div className="mt-3 select-none space-y-2.5 blur-[5px]" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-8 w-8 shrink-0 rounded-md bg-ink-200" />
            <span className="h-3 rounded bg-ink-200" style={{ width: `${70 - i * 12}%` }} />
            <span className="ml-auto h-3 w-12 rounded bg-brand-200" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/55 px-6 text-center backdrop-blur-[1px]">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white shadow-md">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <p className="mt-2 max-w-sm text-sm font-semibold text-ink-900">{teaser}</p>
        <a
          href={href}
          onClick={(e) => {
            trackBilling('upgrade_prompt_clicked', { id: `lock_${feature}`, plan, source });
            handleNavClick(e, () => nav(href));
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Sparkles className="h-4 w-4" aria-hidden /> Included in {PLANS[plan].name} · {priceLabel(plan)}
        </a>
      </div>
    </section>
  );
}
