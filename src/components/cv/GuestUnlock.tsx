import { useState } from 'react';
import { FileCheck2, Lock, Sparkles } from 'lucide-react';
import { MatchRing } from '@/components/cv/MatchBits';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CircleFlag } from '@/components/common/CircleFlag';
import { nameFromCv } from '@/components/cv/CvInsights';
import { useFromCountry } from '@/components/cv/DocReady';
import { countryName } from '@/lib/visaFit';
import type { StoredCv } from '@/lib/cv/store';
import type { TopMatch, TopResult } from '@/lib/cv/topMatches';

/** Guests see this many matches as a preview (role, country, what the CV is missing — no company or title). */
const PREVIEW = 3;

const abroad = (m: TopMatch, from: string | null) => Boolean(m.cc) && (!from || m.cc!.toUpperCase() !== from);

/**
 * /cv-match for someone without an account: the results are ready, partly shown.
 * Each match shows its score, the kind of role and the country, the skills and experience the CV is
 * missing, and that the sponsorship document is ready — only the company and the exact title wait
 * behind one email field and a 6-digit code (which also makes the free account).
 */
export function GuestUnlock({ cv, result }: { cv: StoredCv; result: TopResult | null }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const from = useFromCountry();
  const items = result?.items ?? [];
  const docs = items.filter((m) => abroad(m, from)).length;
  const first = (nameFromCv(cv.text) ?? '').split(' ')[0] ?? '';
  const preview = items.slice(0, PREVIEW);

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-3xl bg-white px-6 py-6 ring-2 ring-brand-200 sm:px-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
          <Lock className="h-3 w-3" aria-hidden /> Results ready
        </p>
        <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-ink-950">
          {items.length ? (
            <>
              <span className="font-extrabold text-brand-600">
                {items.length} {items.length === 1 ? 'job' : 'jobs'}
              </span>{' '}
              found for your CV
            </>
          ) : (
            'Your matches are ready'
          )}
        </h2>
        {docs > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold text-emerald-800">
            <FileCheck2 className="h-4 w-4 text-emerald-600" aria-hidden />
            <span>
              <span className="font-extrabold">{docs}</span> sponsorship {docs === 1 ? 'document' : 'documents'} and visa {docs === 1 ? 'route' : 'routes'} ready for you{from ? ' from' : ''}
            </span>
            {from && (
              <>
                <CircleFlag countryCode={from} size={16} label={countryName(from) ?? from} />
                <span>{countryName(from) ?? from}</span>
              </>
            )}
          </p>
        )}
        <p className="mt-1.5 text-[14.5px] text-ink-600">{step === 'email' ? 'Get your code to see the companies and open them.' : 'Enter your code to see them.'}</p>

        <div className="mt-1">
          <QuickSignup cv={cv} onStep={setStep} />
        </div>
      </div>

      {/* What's waiting: score, role, country, what's missing and the document. Company and title stay hidden. */}
      {preview.length
        ? preview.map((m, i) => <PreviewCard key={m.id} m={m} best={i === 0} from={from} first={first} />)
        : [0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200 sm:p-5">
              <MatchRing score={null} size={56} pending />
              <div className="min-w-0 flex-1">
                <span className="block h-3 w-1/3 rounded bg-ink-200" />
                <span className="mt-2 block h-4 w-3/4 rounded bg-ink-100" />
              </div>
            </div>
          ))}
    </section>
  );
}

function PreviewCard({ m, best, from, first }: { m: TopMatch; best: boolean; from: string | null; first: string }) {
  const role = m.role?.replace(/\s*\(other\)/i, '') || 'Matching';
  const place = m.country ?? (m.remote ? 'Remote' : null);
  const docReady = abroad(m, from);
  const missing = m.missing ?? [];
  const wanted = m.wanted ?? [];
  return (
    <article className={`overflow-hidden rounded-2xl bg-white ${best ? 'ring-2 ring-brand-500 shadow-[0_0_0_4px_rgba(37,99,235,0.08)]' : 'ring-1 ring-ink-200'}`}>
      {best && (
        <p className="flex items-center gap-1.5 bg-brand-600 px-4 py-2 text-[13px] font-bold text-white sm:px-5">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            It’s {m.score}% matching for you{first ? `, ${first}` : ''}! Your sponsorship document and visa route are ready!
          </span>
        </p>
      )}
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <MatchRing score={m.score} size={56} />
        <div className="min-w-0 flex-1">
          {/* The company stays hidden until the code is in. */}
          <span aria-hidden className="pointer-events-none block h-3 w-1/3 select-none rounded bg-ink-200 blur-[3px]" />
          <h3 className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[16px] font-bold leading-snug text-ink-950">
            <span>
              {role} role{place ? ' in' : ''}
            </span>
            {m.cc && <CircleFlag countryCode={m.cc} size={16} label={place ?? m.cc} />}
            {place && <span>{place}</span>}
          </h3>

          {missing.length > 0 && (
            <p className="mt-2 text-[13px] leading-5 text-ink-700">
              <b className="text-ink-950">Missing skills:</b>{' '}
              {missing.slice(0, 4).map((s) => (
                <span key={s} className="mr-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-900 ring-1 ring-amber-200">
                  {s}
                </span>
              ))}
              {missing.length > 4 && <span className="text-[12px] text-ink-500">+{missing.length - 4} more</span>}
            </p>
          )}
          {wanted.length > 0 && (
            <p className="mt-1.5 text-[13px] leading-5 text-ink-700">
              <b className="text-ink-950">Experience wanted</b> <span className="text-ink-500">(add this to your CV if you have it):</span>{' '}
              {wanted.slice(0, 3).join(', ')}
              {wanted.length > 3 ? ` +${wanted.length - 3} more` : ''}
            </p>
          )}
          {!missing.length && !wanted.length && <p className="mt-2 text-[13px] text-emerald-700">Your CV shows every skill this ad names.</p>}
        </div>
      </div>

      {docReady && (
        // Shown, not clickable: the document opens once they have an account.
        <p className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 bg-emerald-50/60 px-4 py-2.5 text-[13px] font-semibold text-emerald-900 sm:px-5">
          <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>Your sponsorship document for this job</span>
          {from && (
            <>
              <span>from</span>
              <CircleFlag countryCode={from} size={15} label={countryName(from) ?? from} />
            </>
          )}
          <span>to</span>
          <CircleFlag countryCode={m.cc!} size={15} label={m.country ?? m.cc!} />
          <span>is ready</span>
        </p>
      )}
    </article>
  );
}
