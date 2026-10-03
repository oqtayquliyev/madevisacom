import { ArrowRight, ScanSearch } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { useCv } from '@/lib/cv/store';
import { CvUpload } from '@/components/cv/CvUpload';
import { MatchExample, MatchLevels } from '@/components/cv/MatchShowcase';

/** Landing: what "Check your match" gives you, shown rather than told. */
export function MatchSection() {
  const { cv } = useCv();
  return (
    <section aria-labelledby="landing-match" className="mx-auto max-w-7xl px-3 py-14 sm:px-8 sm:py-20 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-brand-700">
            <ScanSearch className="h-4 w-4" /> CV match
          </p>
          <h2 id="landing-match" className="mt-2 max-w-xl text-[30px] font-bold leading-[1.1] tracking-tight text-ink-950 sm:text-[40px]">
            Know how well you fit before you apply.
          </h2>
          <p className="mt-3 max-w-xl text-[16px] leading-7 text-ink-600">
            Next to Apply on every job: one press compares your CV with the ad — skills, role, years, languages, education — and shows what’s missing. From your CV and from your application.
          </p>
          <div className="mt-6 max-w-md">
            <CvUpload />
            {cv && (
              <button onClick={() => nav('/jobs')} className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[15px] font-bold text-white hover:bg-brand-700">
                Check a job <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <MatchExample />
      </div>
      <MatchLevels className="mt-8" />
    </section>
  );
}
