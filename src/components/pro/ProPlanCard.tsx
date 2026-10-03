import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { countryName } from '@/lib/visaFit';
import { PRO_FEATURES, useMyPlan, type Billing } from '@/lib/plans';
import { priceNote, priceRequestLabel, PRO_MONTHLY_DOCS, usePrices } from '@/lib/pricing';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';

type Cycle = Exclude<Billing, 'one_time'>;

/** Monthly / yearly switch, shared by the plan card and the pricing page. */
export function BillingToggle({ value, onChange, saving }: { value: Cycle; onChange: (b: Cycle) => void; saving: number }) {
  return (
    <div className="inline-flex rounded-full bg-ink-100 p-1 text-sm font-semibold" role="tablist" aria-label="Billing">
      {(['monthly', 'yearly'] as const).map((b) => (
        <button key={b} role="tab" aria-selected={value === b} onClick={() => onChange(b)} className={`rounded-full px-4 py-1.5 ${value === b ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>
          {b === 'monthly' ? 'Monthly' : `Yearly · save ${saving}%`}
        </button>
      ))}
    </div>
  );
}

/**
 * MadeVisa Pro — the one plan: price for the visitor's country in their
 * currency, monthly or yearly, what's in it, and the button to get it.
 * `billing` can be controlled from outside (pricing page) or left to the card.
 */
export function ProPlanCard({ onAuth, billing: outer, compact = false }: { onAuth?: (p: 'login' | 'register') => void; billing?: Cycle; compact?: boolean }) {
  const prices = usePrices();
  const { isPro, sub } = useMyPlan();
  // Monthly first: the smallest amount to pay today is the price people see.
  const [inner, setInner] = useState<Cycle>('monthly');
  const [dialog, setDialog] = useState(false);
  const billing = outer ?? inner;
  const pro = prices.pro;
  const price = billing === 'monthly' ? pro.monthly : pro.yearly;
  const features = compact ? PRO_FEATURES.slice(0, 3) : PRO_FEATURES;

  return (
    <div id="pro" className="relative flex scroll-mt-24 flex-col rounded-2xl border-2 border-brand-600 bg-white p-6 shadow-lg">
      <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
        <Sparkles className="h-3.5 w-3.5" /> Everything in one plan
      </span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-lg font-bold text-ink-950">MadeVisa Pro</p>
        {!outer && <BillingToggle value={billing} onChange={setInner} saving={pro.saving} />}
      </div>
      <p className="mt-2 text-4xl font-bold tracking-tight text-ink-950">
        {price.label}
        <span className="text-base font-medium text-ink-500"> / {billing === 'monthly' ? 'month' : 'year'}</span>
      </p>
      <p className="text-sm text-ink-500">{billing === 'yearly' ? `${pro.yearlyPerMonth.label} a month, billed yearly` : 'Cancel any time'}</p>
      <p className="mt-1 text-xs text-ink-500">{priceNote(prices, countryName)}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">Full CV match report on every job</p>
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{PRO_MONTHLY_DOCS} sponsorship documents a month</p>
      </div>

      <ul className="mt-5 flex-1 space-y-3">
        <li className="text-sm font-semibold text-ink-900">Everything in Free, plus:</li>
        {features.map((f) => (
          <li key={f.title} className="flex gap-2 text-sm text-ink-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              <strong className="text-ink-900">{f.title}.</strong> {f.text}
            </span>
          </li>
        ))}
      </ul>

      <button onClick={() => setDialog(true)} disabled={isPro} className="mt-6 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {isPro ? `Your plan${sub?.current_period_end ? ` · until ${new Date(sub.current_period_end).toLocaleDateString()}` : ''}` : 'Get Pro'}
      </button>

      {dialog && (
        <PlanRequestDialog
          plan="pro"
          billing={billing}
          priceLabel={priceRequestLabel(prices, billing === 'monthly' ? 'Pro monthly' : 'Pro yearly', price)}
          region={prices.country ?? prices.tier}
          onClose={() => setDialog(false)}
          onAuth={onAuth}
        />
      )}
    </div>
  );
}
