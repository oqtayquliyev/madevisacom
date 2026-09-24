import { Briefcase, GraduationCap, Mail, Megaphone } from 'lucide-react';

/**
 * "Advertise here" cards, styled exactly like the landing job/program
 * cards but clearly tagged as ads. Pricing: sponsored job ad $299,
 * sponsored program ad $99 — booked by emailing hello@madevisa.com.
 */
const ADS = [
  {
    kind: 'job' as const,
    icon: Briefcase,
    title: 'Your job, featured here',
    price: '$299',
    unit: 'per sponsored job ad',
    blurb: 'Pinned on the MadeVisa homepage and jobs board, in front of people actively planning to work abroad.',
    subject: 'Sponsored job ad ($299)',
  },
  {
    kind: 'program' as const,
    icon: GraduationCap,
    title: 'Your program, featured here',
    price: '$99',
    unit: 'per sponsored program ad',
    blurb: 'Featured to students and applicants browsing programs, scholarships and study options.',
    subject: 'Sponsored program ad ($99)',
  },
];

export function SponsoredAdsSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
            <Megaphone className="h-3.5 w-3.5" /> Advertise on MadeVisa
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">Sponsored listings</h2>
        </div>
        <a href="mailto:hello@madevisa.com?subject=Advertising%20on%20MadeVisa" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          hello@madevisa.com
        </a>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ADS.map((ad) => {
          const Icon = ad.icon;
          return (
            <a
              key={ad.kind}
              href={`mailto:hello@madevisa.com?subject=${encodeURIComponent(ad.subject)}`}
              className="group relative flex h-[300px] flex-col rounded-lg border border-dashed border-brand-300 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-soft-lg"
            >
              <span className="absolute right-3 top-3 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Ad
              </span>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded bg-brand-600">
                <Icon className="h-6 w-6 text-white/80" />
              </span>
              <h3 className="mt-3 font-slab text-base font-bold leading-snug text-ink-950">{ad.title}</h3>
              <p className="mt-1 font-slab text-base font-bold leading-snug text-ink-950">
                {ad.price} <span className="font-sans text-xs font-medium text-ink-500">{ad.unit}</span>
              </p>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-500">{ad.blurb}</p>
              <span className="mt-auto flex items-center gap-1.5 border-t border-ink-100 pt-3 text-xs font-bold text-brand-700 group-hover:text-brand-800">
                <Mail className="h-3.5 w-3.5" /> Contact hello@madevisa.com
              </span>
            </a>
          );
        })}
        <div className="flex flex-col justify-center rounded-lg bg-ink-50 p-5 text-sm text-ink-600 sm:col-span-2">
          <p className="font-bold text-ink-900">Reach people ready to move.</p>
          <p className="mt-1 text-xs leading-5">
            Sponsored listings are marked “Ad”, shown alongside regular results, and still reviewed by MadeVisa before going live. Email{' '}
            <a href="mailto:hello@madevisa.com?subject=Advertising%20on%20MadeVisa" className="font-semibold text-brand-700 underline">
              hello@madevisa.com
            </a>{' '}
            with your listing and preferred dates.
          </p>
        </div>
      </div>
    </section>
  );
}
