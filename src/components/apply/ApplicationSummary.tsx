import { useState } from 'react';
import { Send, Zap } from 'lucide-react';
import type { Planned } from '@/lib/apply/decision';
import type { ApplyStatus, AutoStatus } from '@/lib/apply/store';
import type { ApplyRoute } from '@/lib/apply/types';
import { usePrices } from '@/lib/pricing';
import { nav } from '@/lib/pageLayout';
import { MatchRing } from '@/components/cv/MatchBits';
import { PlanCheckoutDialog } from '@/components/pro/PlanCheckoutDialog';
import { BTN } from '@/components/apply/ui';

type Props = {
  /** The best recommended jobs, at most 3. */
  top: Planned[];
  /** Where each job's application goes (to say which send by themselves). */
  routeOf?: (jobId: string) => ApplyRoute | null | undefined;
  status: ApplyStatus;
  auto: AutoStatus | null;
  onApply: () => void;
  onChoose: () => void;
  onAuto: (on: boolean) => Promise<void>;
  onAuth?: (page: 'login' | 'register') => void;
};

/** Under the headline: apply to your top 3 now — and, with Pro, let MadeVisa apply to every new match. */
export function ApplicationSummary({ top, routeOf, status, auto, onApply, onChoose, onAuto, onAuth }: Props) {
  const prices = usePrices();
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = top.length;
  const none = status.signedIn && status.left < 1;

  return (
    <section aria-labelledby="apply-summary-title" className="mt-6 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="apply-summary-title" className="text-[17px] font-bold tracking-tight text-ink-950">
            Apply now
          </h3>
          {status.signedIn && (
            <p className="text-[12.5px] text-ink-500">
              <span className="font-bold tabular-nums text-ink-800">{status.left}</span> {status.left === 1 ? 'application' : 'applications'} left this month
            </p>
          )}
        </div>

        {n > 0 ? (
          <ul className="mt-3 divide-y divide-ink-100">
            {top.map((p) => (
              <li key={p.job.id} className="flex items-center gap-3 py-2.5">
                <MatchRing score={p.job.score} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink-950">{p.job.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-500">{p.job.company}</span>
                </span>
                {(() => {
                  const r = routeOf?.(p.job.id);
                  if (r === 'auto' || r === 'email') return <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-800">Sends automatically</span>;
                  if (r === 'login') return <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-800">Needs your login</span>;
                  return null;
                })()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-ink-600">No new strong matches to apply to right now.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {n > 0 && !none && (
            <button onClick={onApply} className={`${BTN.primary} w-full sm:w-auto`}>
              <Send className="h-4 w-4" /> Apply to {n} {n === 1 ? 'job' : 'jobs'}
            </button>
          )}
          <button onClick={onChoose} className={BTN.link}>
            Choose other jobs
          </button>
        </div>
      </div>

      <div className="border-t border-ink-100 bg-brand-50/50 p-4 sm:p-6">
        {status.pro ? (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink-950">
                <Zap className="h-4 w-4 text-brand-700" /> Auto-apply to new jobs
              </p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-600">
                {auto?.on
                  ? `On. MadeVisa applies to new jobs that match your CV, every day.${auto.thisMonth ? ` ${auto.thisMonth} applied this month.` : ''}`
                  : 'MadeVisa applies to every new job that matches your CV, every day, with your saved answers. You get an email for each one.'}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={Boolean(auto?.on)}
              aria-label="Auto-apply to new jobs"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onAuto(!auto?.on);
                setBusy(false);
              }}
              className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${auto?.on ? 'bg-brand-600' : 'bg-ink-300'} disabled:opacity-60`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${auto?.on ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        ) : (
          <div>
            <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink-950">
              <Zap className="h-4 w-4 text-brand-700" /> Let MadeVisa apply to every new match for a month
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-600">Every day, to new jobs that match your CV. Up to {status.proMonthly} applications.</p>
            <button
              onClick={() => {
                if (!status.signedIn) return onAuth?.('register');
                setPay(true);
              }}
              className={`${BTN.primary} mt-3 w-full sm:w-auto`}
            >
              Start for {prices.pro.monthly.label} / month
            </button>
          </div>
        )}
      </div>

      {pay && <PlanCheckoutDialog billing="monthly" onClose={() => setPay(false)} onAuth={onAuth} onUnavailable={() => nav('/pricing#pro')} />}
    </section>
  );
}
