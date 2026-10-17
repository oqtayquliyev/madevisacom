import { useState } from 'react';
import { FileCheck2, Sparkles } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { MatchRing } from '@/components/cv/MatchBits';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvAvatar, nameFromCv } from '@/components/cv/CvInsights';
import { TestimonialTicker } from '@/components/common/Testimonials';
import { AutoApplyEstimate, FlagStack, MoreMatches, countriesOf, focusSignup } from '@/components/cv/Upsell';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { countryName } from '@/lib/visaFit';
import type { StoredCv } from '@/lib/cv/store';
import type { TopMatch, TopResult } from '@/lib/cv/topMatches';

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
  const countries = countriesOf(items, from);
  const best = items[0] ?? null;
  const fromName = from ? countryName(from) ?? from : null;

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-3xl bg-white px-5 py-6 shadow-soft ring-2 ring-brand-200 sm:px-8">
        <div className="flex items-start gap-3.5">
          <CvAvatar cv={cv} size={52} className="hidden sm:grid" />
          <h2 className="text-[24px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[27px]">
            {step === 'code' ? (
              <>Check your inbox{first ? `, ${first}` : ''} — your code is on its way</>
            ) : items.length ? (
              <>
                {first ? `${first}, you’re` : 'You’re'} one step away from <Num className="text-[30px] sm:text-[34px]">{items.length}</Num> {items.length === 1 ? 'job' : 'jobs'}
                {countries.length ? ' abroad' : ''}
              </>
            ) : (
              'Your matches are ready'
            )}
          </h2>
        </div>

        {step === 'email' && countries.length > 0 && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-emerald-900">
              {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
              {from && <span aria-hidden>→</span>}
              <FlagStack countries={countries} max={6} size={20} />
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-emerald-900">
              <FileCheck2 className="mr-1 inline h-4 w-4 -translate-y-px text-emerald-600" aria-hidden />
              <Num tone="green" className="text-[18px]">{docs}</Num> sponsorship {docs === 1 ? 'document' : 'documents'}
              {fromName ? ` from ${fromName}` : ''} {docs === 1 ? 'is' : 'are'} ready.
            </p>
          </div>
        )}

        <QuickSignup cv={cv} onStep={setStep} />

        {/* Social proof right where the decision is made. */}
        <div className="mt-4 border-t border-ink-100 pt-4">
          <TestimonialTicker every={9000} />
        </div>
      </div>

      {best && <PreviewCard m={best} best from={from} first={first} delay={250} />}

      <MoreMatches count={items.length - 1} countries={countriesOf(items.slice(1), from)} action={focusSignup} label="See them free" />

      <AutoApplyEstimate jobs={items.length} guest onGuest={focusSignup} />
    </section>
  );
}

function PreviewCard({ m, best, from, first, delay = 0 }: { m: TopMatch; best: boolean; from: string | null; first: string; delay?: number }) {
  const role = m.role?.replace(/\s*\(other\)/i, '') || 'Matching';
  const place = m.country ?? (m.remote ? 'Remote' : null);
  const docReady = abroad(m, from);
  const missing = m.missing ?? [];
  const wanted = m.wanted ?? [];
  return (
    <article
      className={`animate-fade-up overflow-hidden rounded-2xl bg-white motion-reduce:animate-none ${best ? 'ring-2 ring-brand-500 shadow-[0_0_0_4px_rgba(37,99,235,0.08)]' : 'ring-1 ring-ink-200'}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {best && (
        <p className="flex items-center gap-1.5 bg-brand-600 px-4 py-2 text-[13px] font-bold text-white sm:px-5">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            It’s <b className="rounded bg-white/20 px-1 text-[15px] font-extrabold tabular-nums">{m.score}%</b> matching for you{first ? `, ${first}` : ''}! Your sponsorship document and visa route are ready!
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
