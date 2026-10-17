import { useState } from 'react';
import { Check, FileCheck2 } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvAvatar, nameFromCv } from '@/components/cv/CvInsights';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { countriesOf } from '@/components/cv/Upsell';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { countryName } from '@/lib/visaFit';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';

/** Routes shown by name; the rest are counted. */
const ROUTES = 4;

/**
 * /cv-match for someone without an account: one box, one action.
 * "Oqtay, you have routes to France, Germany…" — each country with its tags (sponsorship document
 * ready, how many jobs match, the best score) — then the email field. Nothing else competes with it.
 */
export function GuestUnlock({ cv, result }: { cv: StoredCv; result: TopResult | null }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const from = useFromCountry();
  const items = result?.items ?? [];
  const first = (nameFromCv(cv.text) ?? '').split(' ')[0] ?? '';
  const countries = countriesOf(items, from);
  const best = (cc: string) => Math.max(...items.filter((m) => m.cc?.toUpperCase() === cc).map((m) => m.score));
  const shown = countries.slice(0, ROUTES);
  const rest = countries.length - shown.length;
  const fromName = from ? countryName(from) ?? from : null;
  const local = items.length - countries.reduce((a, c) => a + c.n, 0);

  return (
    <section className="mx-auto max-w-2xl">
      <div className="animate-fade-up rounded-3xl bg-white px-5 py-6 shadow-soft ring-2 ring-brand-200 motion-reduce:animate-none sm:px-8 sm:py-7">
        <div className="flex items-center gap-3.5">
          <CvAvatar cv={cv} size={52} />
          <h2 className="text-[23px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[27px]">
            {step === 'code' ? (
              <>Check your inbox{first ? `, ${first}` : ''}</>
            ) : countries.length ? (
              <>
                {first ? `${first}, you` : 'You'} have {countries.length === 1 ? 'a route' : 'routes'} to <Num className="text-[28px] sm:text-[32px]">{countries.length}</Num> {countries.length === 1 ? 'country' : 'countries'}
              </>
            ) : (
              <>
                {first ? `${first}, your` : 'Your'} <Num className="text-[28px] sm:text-[32px]">{items.length}</Num> matches are ready
              </>
            )}
          </h2>
        </div>

        {step === 'email' && shown.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {shown.map((c, i) => (
              <li
                key={c.cc}
                className="animate-fade-up rounded-2xl bg-ink-50 px-4 py-3 motion-reduce:animate-none"
                style={{ animationDelay: `${150 + i * 140}ms` }}
              >
                <p className="flex items-center gap-2 text-[16px] font-bold text-ink-950">
                  {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
                  {from && (
                    <span aria-hidden className="text-ink-400">
                      →
                    </span>
                  )}
                  <CircleFlag countryCode={c.cc} size={20} label={c.name} />
                  <span>{c.name}</span>
                </p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[12.5px] font-bold text-emerald-800">
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden /> Sponsorship document ready
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[12.5px] font-bold text-brand-800">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> You match {c.n} {c.n === 1 ? 'job' : 'jobs'}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[12.5px] font-bold text-amber-900">Up to {best(c.cc)}% match</span>
                </p>
              </li>
            ))}
            {(rest > 0 || local > 0) && (
              <li className="px-1 text-[14px] font-semibold text-ink-600">
                {rest > 0 && (
                  <>
                    + <Num className="text-[15px]">{rest}</Num> more {rest === 1 ? 'country' : 'countries'}
                  </>
                )}
                {rest > 0 && local > 0 && ' · '}
                {local > 0 && (
                  <>
                    <Num className="text-[15px]">{local}</Num> {local === 1 ? 'job' : 'jobs'} in {fromName ?? 'your country'}
                  </>
                )}
              </li>
            )}
          </ul>
        )}

        <div className="mt-2">
          <QuickSignup cv={cv} onStep={setStep} />
        </div>

        <ExampleJourney className="mt-5 border-t border-ink-100 pt-4" />
      </div>
    </section>
  );
}
