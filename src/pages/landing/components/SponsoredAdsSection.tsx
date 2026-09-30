import { ArrowRight, Briefcase, Check, GraduationCap, Megaphone } from 'lucide-react';
import { SoonChip } from '@/components/common/SoonChip';
import { SPONSORED_JOB_DAYS, SPONSORED_JOB_PRICE, TERMS_PATH } from '@/lib/listingRequests';

/**
 * One "For organizations" section with two clear paths:
 *   1. Post for free — request a free job listing; reviewed within 24 hours.
 *   2. Boost it — a sponsored, "Ad"-labelled job ($149 / 30 days), requested
 *      on /submit-job and paid only after approval.
 * Programs open later, so the program options are shown greyed with "Soon".
 */

const STEPS = [
  { label: 'Request', detail: 'Your name, email and company — one minute.' },
  { label: 'Review', detail: 'We verify your company and job, usually within hours.' },
  { label: 'Publish', detail: 'It reaches people planning that move.' },
];

function goTo(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

const linkProps = (href: string) => ({
  href,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    goTo(href);
  },
});

export function SponsoredAdsSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:pb-16">
      <div className="overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white shadow-soft-lg">
        <div className="p-6 sm:p-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
            <Megaphone className="h-3.5 w-3.5" />
            For organizations
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">Reach people ready to move abroad</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            Companies put real jobs in front of people actively planning their move. Everything is reviewed before it goes live.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            {/* PATH 1 — FREE */}
            <div className="flex flex-col rounded-lg border border-ink-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Free</p>
              <p className="mt-1 text-lg font-bold text-ink-950">Post a job for free</p>
              <ol className="mt-4 space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s.label} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
                    <p className="text-sm">
                      <span className="font-bold text-ink-900">{s.label}</span> <span className="text-ink-500">— {s.detail}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <a
                  {...linkProps('/submit-job?plan=free')}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <Briefcase className="h-4 w-4" />
                  Post a job
                </a>
                <span
                  aria-disabled="true"
                  title="Programs open on MadeVisa soon"
                  className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-5 py-3 text-sm font-bold text-ink-400"
                >
                  <GraduationCap className="h-4 w-4" />
                  Post a program
                  <SoonChip className="!bg-white" />
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-ink-400">Free · Reviewed within 24 hours</p>
            </div>

            {/* PATH 2 — SPONSORED */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Or boost it with an ad</p>
                <a {...linkProps(TERMS_PATH)} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                  Terms &amp; pricing
                </a>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <a
                  {...linkProps('/submit-job?plan=sponsored')}
                  className="group relative flex flex-col rounded-lg border border-dashed border-brand-300 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-soft-lg"
                >
                  <span className="absolute right-3 top-3 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Ad
                  </span>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-brand-600">
                    <Briefcase className="h-5 w-5 text-white/85" />
                  </span>
                  <h3 className="mt-3 font-slab text-base font-bold leading-snug text-ink-950">Sponsored job</h3>
                  <p className="mt-0.5 font-slab text-2xl font-bold text-ink-950">
                    ${SPONSORED_JOB_PRICE} <span className="font-sans text-xs font-medium text-ink-500">/ {SPONSORED_JOB_DAYS} days</span>
                  </p>
                  <p className="mt-2 text-xs leading-5 text-ink-500">Pinned on the homepage and jobs board, in front of people actively planning to work abroad.</p>
                  <span className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-3 text-xs font-bold text-brand-700 group-hover:text-brand-800">
                    Post a sponsored job
                    <ArrowRight className="ml-auto h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </a>

                <div aria-disabled="true" className="relative flex cursor-not-allowed flex-col rounded-lg border border-dashed border-ink-200 bg-ink-50/70 p-4">
                  <SoonChip className="absolute right-3 top-3" />
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-ink-200">
                    <GraduationCap className="h-5 w-5 text-white" />
                  </span>
                  <h3 className="mt-3 font-slab text-base font-bold leading-snug text-ink-500">Sponsored program</h3>
                  <p className="mt-0.5 font-slab text-2xl font-bold text-ink-400">
                    $99 <span className="font-sans text-xs font-medium text-ink-400">per ad</span>
                  </p>
                  <p className="mt-2 text-xs leading-5 text-ink-400">For scholarships, study and training programs — available when Programs opens on MadeVisa.</p>
                  <span className="mt-4 border-t border-ink-200 pt-3 text-xs font-bold text-ink-400">Available soon</span>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-500">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Clearly marked “Ad” and shown alongside regular results
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Reviewed by MadeVisa before going live
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Pay only after approval — nothing is charged upfront
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
