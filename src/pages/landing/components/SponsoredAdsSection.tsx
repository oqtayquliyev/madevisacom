import { ArrowRight, Briefcase, Check, GraduationCap, Mail, Megaphone } from 'lucide-react';

/**
 * One "For organizations" section with two clear paths:
 *   1. Post for free — submit a job or program; reviewed within 24 hours.
 *   2. Boost it — a sponsored, "Ad"-labelled placement ($299 job / $99
 *      program), booked by emailing hello@madevisa.com.
 * Ad cards use the same look as the landing job cards.
 */

const ADS = [
  {
    kind: 'job' as const,
    icon: Briefcase,
    title: 'Sponsored job',
    price: '$299',
    blurb: 'Pinned on the homepage and jobs board, in front of people actively planning to work abroad.',
    subject: 'Sponsored job ad ($299)',
  },
  {
    kind: 'program' as const,
    icon: GraduationCap,
    title: 'Sponsored program',
    price: '$99',
    blurb: 'Featured to students and applicants browsing programs, scholarships and study options.',
    subject: 'Sponsored program ad ($99)',
  },
];

const STEPS = [
  { label: 'Submit', detail: 'Title, category, destination.' },
  { label: 'Review', detail: 'We verify it within 24 hours.' },
  { label: 'Publish', detail: 'It reaches people planning that move.' },
];

export function SponsoredAdsSection({ onPost }: { onPost: () => void }) {
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
            Companies, governments, universities and program providers put real opportunities in front of people actively planning
            their move. Everything is reviewed before it goes live.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            {/* PATH 1 — FREE */}
            <div className="flex flex-col rounded-lg border border-ink-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Post for free</p>
              <p className="mt-1 text-lg font-bold text-ink-950">List a job or program</p>
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
                <button
                  type="button"
                  onClick={onPost}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <Briefcase className="h-4 w-4" />
                  Post a job
                </button>
                <button
                  type="button"
                  onClick={onPost}
                  className="flex items-center gap-2 rounded-lg bg-ink-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-ink-800"
                >
                  <GraduationCap className="h-4 w-4" />
                  Post a program
                </button>
              </div>
              <p className="mt-2 text-xs font-medium text-ink-400">Free · Reviewed within 24 hours</p>
            </div>

            {/* PATH 2 — SPONSORED */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Or boost it with an ad</p>
                <a href="mailto:hello@madevisa.com?subject=Advertising%20on%20MadeVisa" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                  hello@madevisa.com
                </a>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {ADS.map((ad) => {
                  const Icon = ad.icon;
                  return (
                    <a
                      key={ad.kind}
                      href={`mailto:hello@madevisa.com?subject=${encodeURIComponent(ad.subject)}`}
                      className="group relative flex flex-col rounded-lg border border-dashed border-brand-300 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-soft-lg"
                    >
                      <span className="absolute right-3 top-3 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        Ad
                      </span>
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-brand-600">
                        <Icon className="h-5 w-5 text-white/85" />
                      </span>
                      <h3 className="mt-3 font-slab text-base font-bold leading-snug text-ink-950">{ad.title}</h3>
                      <p className="mt-0.5 font-slab text-2xl font-bold text-ink-950">
                        {ad.price} <span className="font-sans text-xs font-medium text-ink-500">per ad</span>
                      </p>
                      <p className="mt-2 text-xs leading-5 text-ink-500">{ad.blurb}</p>
                      <span className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-3 text-xs font-bold text-brand-700 group-hover:text-brand-800">
                        <Mail className="h-3.5 w-3.5" /> Book this ad
                        <ArrowRight className="ml-auto h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  );
                })}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-500">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Clearly marked “Ad” and shown alongside regular results
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Still reviewed by MadeVisa before going live
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Email your listing and preferred dates to book
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
