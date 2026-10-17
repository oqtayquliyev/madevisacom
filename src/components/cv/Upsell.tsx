// Pieces that turn CV match results into "one more step": the countries waiting for the visitor,
// the matches not shown yet, and what Auto Apply (Pro) would do with them in a month.
import { ArrowRight, Lock, Send } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { Num } from '@/components/cv/DocReady';
import type { TopMatch } from '@/lib/cv/topMatches';
import { useBillingCatalog, checkoutHref, trackBilling } from '@/lib/billing';
import { priceLabel } from '@/lib/plans';
import { nav } from '@/lib/pageLayout';

export type CountryCount = { cc: string; name: string; n: number };

/** The countries of the matches outside the visitor's own, most jobs first. */
export function countriesOf(items: TopMatch[], from: string | null): CountryCount[] {
  const map = new Map<string, CountryCount>();
  for (const m of items) {
    if (!m.cc) continue;
    const cc = m.cc.toUpperCase();
    if (from && cc === from) continue;
    const row = map.get(cc) ?? { cc, name: m.country ?? cc, n: 0 };
    row.n += 1;
    map.set(cc, row);
  }
  return [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** 🇫🇷 🇩🇪 🇳🇱 +9 — overlapping flags. */
export function FlagStack({ countries, max = 5, size = 22 }: { countries: CountryCount[]; max?: number; size?: number }) {
  const shown = countries.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((c, i) => (
        <span key={c.cc} className="rounded-full bg-white ring-2 ring-white" style={{ marginLeft: i ? -size / 3 : 0 }}>
          <CircleFlag countryCode={c.cc} size={size} label={c.name} />
        </span>
      ))}
      {countries.length > max && <span className="ml-1.5 text-[13px] font-bold text-ink-700">+{countries.length - max}</span>}
    </span>
  );
}

const names = (cs: CountryCount[], n = 3) => {
  const list = cs.slice(0, n).map((c) => c.name);
  const rest = cs.length - list.length;
  return rest > 0 ? `${list.join(', ')} and ${rest} more ${rest === 1 ? 'country' : 'countries'}` : list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] ?? '';
};

/** "+37 more opportunities for you in France, Germany, Poland and 9 more countries" — locked. */
export function MoreMatches({ count, countries, action, label }: { count: number; countries: CountryCount[]; action: () => void; label: string }) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-200 sm:flex-row sm:items-center sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold leading-snug text-ink-950">
          <Num>+{count}</Num> more {count === 1 ? 'opportunity' : 'opportunities'} for you
        </p>
        {countries.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-ink-700">
            <FlagStack countries={countries} size={18} />
            <span>in {names(countries)}</span>
          </p>
        )}
      </div>
      <button onClick={action} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-50 px-4 py-2.5 text-[14px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
        <Lock className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
    </div>
  );
}

/** How many matching jobs a month Auto Apply could apply to: today's matches × 18, never above Pro's monthly allowance. */
export const AUTO_APPLY_FACTOR = 18;

/** "Auto Apply: about 720 applications in a month · Pro $8.99 / month". */
export function AutoApplyEstimate({ jobs, guest, onGuest }: { jobs: number; guest: boolean; onGuest?: () => void }) {
  const catalog = useBillingCatalog();
  if (jobs <= 0 || catalog?.auto_apply?.enabled === false) return null;
  const cap = catalog?.auto_apply?.pro_monthly ?? null;
  const raw = jobs * AUTO_APPLY_FACTOR;
  const est = cap ? Math.min(raw, cap) : raw;
  const capped = cap != null && raw > cap;
  const href = checkoutHref('pro', 'cv_match_auto_apply');
  return (
    <div className="overflow-hidden rounded-2xl bg-ink-950 p-5 text-white sm:p-6">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
        <Send className="h-3 w-3" aria-hidden /> Auto Apply · Pro
      </p>
      <p className="mt-3 text-[20px] font-bold leading-snug sm:text-[22px]">
        {capped ? 'Up to' : 'About'} <Num tone="amber" className="!text-amber-300 text-[28px]">{est.toLocaleString('en-US')}</Num> applications sent for you in a month
      </p>
      <p className="mt-1 text-[14px] text-white/70">
        Each with a CV tailored to the job, and your sponsorship document. Estimate from the <b className="text-white">{jobs}</b> jobs you match today.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            if (guest) return onGuest?.();
            trackBilling('plan_selected', { plan: 'pro', source: 'cv_match_auto_apply' });
            nav(href);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-ink-950 hover:bg-brand-50"
        >
          {guest ? 'Approve your email first' : `Start Pro · ${priceLabel('pro')}`} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        {guest && <span className="text-[13px] text-white/70">Pro · {priceLabel('pro')}</span>}
      </div>
    </div>
  );
}

/** Scroll to the email box (or the code box) and put the cursor in it. */
export function focusSignup() {
  const el = document.querySelector<HTMLInputElement>('#guest-code, #guest-email');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => el?.focus(), 450);
}
