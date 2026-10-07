import { ArrowRight, Send, SlidersHorizontal } from 'lucide-react';
import type { Plan } from '@/lib/apply/decision';
import type { ApplyStatus } from '@/lib/apply/store';
import { ApplicationCredits } from '@/components/apply/ApplicationCredits';
import { BTN } from '@/components/apply/ui';

type Props = {
  plan: Plan;
  total: number;
  status: ApplyStatus;
  minScore: number;
  onApply: () => void;
  onReview: () => void;
  onPrefs: () => void;
};

/** Under the headline, once the matches are in: what MadeVisa would do with them, and the one button. */
export function ApplicationSummary({ plan, total, status, minScore, onApply, onReview, onPrefs }: Props) {
  const n = plan.auto.length;
  const tiles: [number, string, string][] = [
    [n, total === n ? 'recommended' : `of ${total} recommended`, 'text-emerald-700'],
    [plan.review.length, 'worth reviewing', 'text-amber-700'],
    [plan.skip.length, 'skipped', 'text-ink-500'],
  ];
  return (
    <section aria-labelledby="apply-summary-title" className="mt-6 rounded-3xl bg-white p-4 shadow-soft ring-1 ring-ink-200 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h3 id="apply-summary-title" className="text-[17px] font-bold tracking-tight text-ink-950">
            Apply with MadeVisa
          </h3>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {tiles.map(([value, label, tone]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dd className={`text-[22px] font-bold leading-none tabular-nums ${tone}`}>{value}</dd>
                <dt className="text-[13px] text-ink-600">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <button onClick={onPrefs} className={`${BTN.link} text-ink-600`}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust preferences
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {n > 0 ? (
          <button onClick={onApply} className={`${BTN.primary} whitespace-nowrap`}>
            <Send className="h-4 w-4" /> Apply to {n} {n === 1 ? 'job' : 'jobs'}
          </button>
        ) : (
          <p className="flex-1 text-[14px] leading-5 text-ink-700">
            Nothing reaches your {minScore}% minimum that you haven’t applied to yet.
            {plan.review.length > 0 ? ' The ones worth a look are one tap away.' : ''}
          </p>
        )}
        <button onClick={onReview} className={`${BTN.secondary} whitespace-nowrap`}>
          Review matches <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-[13px] leading-5 text-ink-700">
        <strong className="font-semibold text-ink-950">MadeVisa tailors each application and never invents information.</strong>{' '}
        {status.signedIn && n > 0
          ? plan.bySend.madevisa > 0
            ? `It sends ${plan.bySend.madevisa} itself and prepares ${plan.bySend.you} for you to send on the employer’s own site.`
            : 'These employers take applications on their own sites: each one is prepared for you, ready to send there.'
          : 'It sends the ones it can itself; the rest are prepared for you to send on the employer’s own site.'}
      </p>
      <ApplicationCredits status={status} asking={n} className="mt-1.5" />
    </section>
  );
}
