import { useState } from 'react';
import { Check, FileCheck2, Stamp } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvAvatar, nameFromCv } from '@/components/cv/CvInsights';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { FlagStack, countriesOf } from '@/components/cv/Upsell';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { countryName, visaFitFor } from '@/lib/visaFit';
import { usePersonalization } from '@/lib/personalization';
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
  // The visa the destination's page gives for this person's passport (their country when no passport is set).
  const { profile: visitor } = usePersonalization();
  const passport = (visitor.citizenship ?? visitor.currentLocation ?? '').toUpperCase() || null;
  const visaFor = (cc: string): { free: boolean; label: string } | null => {
    if (!passport) return null;
    const fit = visaFitFor(cc, passport);
    if (!fit) return { free: true, label: '' };
    return fit.kind === 'permit' ? { free: false, label: fit.label.replace(/\s\+\d+$/, '') } : null;
  };

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="animate-fade-up rounded-3xl bg-white px-5 py-6 shadow-soft ring-2 ring-brand-200 motion-reduce:animate-none sm:px-8 sm:py-7">
        <div className="flex items-center gap-3.5">
          <CvAvatar cv={cv} size={52} />
          <h2 className="text-[23px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[27px]">
            {step === 'code' ? (
              <>Write your code{first ? `, ${first}` : ''} — start your career abroad</>
            ) : countries.length ? (
              <>
                {first ? `${first}, your` : 'Your'} CV opens doors in <Num className="text-[28px] sm:text-[32px]">{countries.length}</Num> {countries.length === 1 ? 'country' : 'countries'}
              </>
            ) : (
              <>
                {first ? `${first}, your` : 'Your'} <Num className="text-[28px] sm:text-[32px]">{items.length}</Num> matches are ready
              </>
            )}
          </h2>
        </div>

        {step === 'email' && countries.length > 0 && (
          <p className="mt-3 text-[15px] leading-6 text-ink-700">
            For each one we’ve prepared your sponsorship document and checked the visa you’d need. Have a look — MadeVisa takes care of the paperwork side with you.
          </p>
        )}

        {step === 'code' && countries.length > 0 && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
            <p className="flex flex-nowrap items-center gap-2 overflow-hidden">
              {from && <CircleFlag countryCode={from} size={22} label={fromName ?? from} />}
              {from && (
                <span aria-hidden className="text-emerald-700">
                  →
                </span>
              )}
              <FlagStack countries={countries} max={5} size={22} />
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-emerald-900">Your documents are ready and waiting.</p>
          </div>
        )}

        {step === 'email' && shown.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {shown.map((c, i) => {
              const visa = visaFor(c.cc);
              return (
                <li
                  key={c.cc}
                  className="animate-fade-up rounded-2xl bg-ink-50 px-4 py-3 motion-reduce:animate-none"
                  style={{ animationDelay: `${150 + i * 140}ms` }}
                >
                  <p className="flex flex-nowrap items-center gap-2 text-[16px] font-bold text-ink-950">
                    {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
                    {from && (
                      <span aria-hidden className="shrink-0 text-ink-400">
                        →
                      </span>
                    )}
                    <CircleFlag countryCode={c.cc} size={20} label={c.name} />
                    <span className="truncate">{c.name}</span>
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[12.5px] font-bold text-emerald-800">
                      <FileCheck2 className="h-3.5 w-3.5" aria-hidden /> Sponsorship document ready
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[12.5px] font-bold text-brand-800">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> {c.n} {c.n === 1 ? 'job fits' : 'jobs fit'} you · up to {best(c.cc)}%
                    </span>
                  </p>
                  {visa && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-700">
                      <Stamp className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                      {visa.free ? (
                        <span>No visa needed for you</span>
                      ) : (
                        <span>
                          Visa you’d need: <b className="font-semibold text-ink-950">{visa.label}</b>
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
            {(rest > 0 || local > 0) && (
              <li className="px-1 text-[14px] font-semibold text-ink-600">
                {rest > 0 && (
                  <>
                    + <Num className="text-[15px]">{rest}</Num> more {rest === 1 ? 'country' : 'countries'} waiting for you
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
      </div>

      <ExampleJourney rotate boxed />
    </section>
  );
}
