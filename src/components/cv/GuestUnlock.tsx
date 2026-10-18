import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, FileCheck2, Stamp, Zap } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CircleFlag } from '@/components/common/CircleFlag';
import { MatchRing } from '@/components/cv/MatchBits';
import { CvAvatar, nameFromCv } from '@/components/cv/CvInsights';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import { AUTO_APPLY_FACTOR, FlagStack, countriesOf, focusSignup, type CountryCount } from '@/components/cv/Upsell';
import { Num, useFromCountry } from '@/components/cv/DocReady';
import { countryName, visaFitFor } from '@/lib/visaFit';
import { usePersonalization } from '@/lib/personalization';
import { priceLabel } from '@/lib/plans';
import { checkoutHref, useBillingCatalog } from '@/lib/billing';
import type { StoredCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';

/** Countries shown by name; the rest are counted. */
const ROUTES = 4;

type Visa = { free: boolean; label: string; asks: string[]; note: string | null };

/** One country: flags, jobs found and best score on the right; open it for the visa and what it asks. */
function CountryRow({ c, from, fromName, best, visa, open, onToggle, delay }: { c: CountryCount; from: string | null; fromName: string | null; best: number; visa: Visa | null; open: boolean; onToggle: () => void; delay: number }) {
  return (
    <li className="animate-fade-up overflow-hidden rounded-2xl bg-ink-50 ring-1 ring-ink-100 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-nowrap items-center gap-2 text-[16px] font-bold text-ink-950">
            {from && <CircleFlag countryCode={from} size={20} label={fromName ?? from} />}
            {from && (
              <span aria-hidden className="shrink-0 text-ink-400">
                →
              </span>
            )}
            <CircleFlag countryCode={c.cc} size={20} label={c.name} />
            <span className="truncate">{c.name}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-[12.5px] font-extrabold text-white">
              {c.n} {c.n === 1 ? 'job' : 'jobs'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12px] font-bold text-emerald-800">
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden /> Document ready
            </span>
          </span>
        </span>
        <MatchRing score={best} size={52} />
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-ink-100 bg-white px-4 py-3 text-[13.5px] text-ink-700">
          {visa?.free ? (
            <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> No visa needed for you
            </p>
          ) : visa ? (
            <>
              <p className="flex items-start gap-1.5">
                <Stamp className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  Visa route: <b className="font-semibold text-ink-950">{visa.label}</b>
                </span>
              </p>
              {visa.asks.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-6">
                  {visa.asks.map((a) => (
                    <li key={a} className="list-disc">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p>Your sponsorship document explains the visa route for this country.</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 font-semibold text-emerald-800">
            <FileCheck2 className="h-4 w-4" aria-hidden /> Sponsorship offer ready to send with your CV
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * /cv-match for someone without an account: one box. The countries their CV fits (each opens to its visa
 * route and requirements), one main action — approve the email to see the results — and, under it,
 * Auto Apply with Pro.
 */
export function GuestUnlock({ cv, result }: { cv: StoredCv; result: TopResult | null }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [openCc, setOpenCc] = useState<string | null>(null);
  const [wantPro, setWantPro] = useState(false);
  const catalog = useBillingCatalog();
  const top = useRef<HTMLDivElement>(null);
  const from = useFromCountry();
  const items = result?.items ?? [];
  const first = (nameFromCv(cv.text) ?? '').split(' ')[0] ?? '';
  const cap = catalog?.auto_apply?.pro_monthly ?? null;
  const autoN = cap ? Math.min(items.length * AUTO_APPLY_FACTOR, cap) : items.length * AUTO_APPLY_FACTOR;
  const countries = countriesOf(items, from);
  const best = (cc: string) => Math.max(...items.filter((m) => m.cc?.toUpperCase() === cc).map((m) => m.score));
  const shown = countries.slice(0, ROUTES);
  const rest = countries.length - shown.length;
  const fromName = from ? countryName(from) ?? from : null;
  const local = items.length - countries.reduce((a, c) => a + c.n, 0);
  const { profile: visitor } = usePersonalization();
  const passport = (visitor.citizenship ?? visitor.currentLocation ?? '').toUpperCase() || null;
  const visaFor = (cc: string): Visa | null => {
    if (!passport) return null;
    const fit = visaFitFor(cc, passport);
    if (!fit) return { free: true, label: '', asks: [], note: null };
    return fit.kind === 'permit' ? { free: false, label: fit.label.replace(/\s\+\d+$/, ''), asks: fit.asks, note: fit.note } : null;
  };

  // The code box replaces the list: bring the top of the box into view so the code field is right there.
  useEffect(() => {
    if (step === 'code') top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div ref={top} className="scroll-mt-24 animate-fade-up rounded-3xl bg-white px-4 py-6 shadow-soft ring-2 ring-brand-200 motion-reduce:animate-none sm:px-8 sm:py-7">
        <div className="flex items-center gap-3">
          <CvAvatar cv={cv} size={48} />
          <h2 className="text-[22px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[27px]">
            {step === 'code' ? (
              <>Write your code{first ? `, ${first}` : ''} — start your career abroad</>
            ) : countries.length ? (
              <>
                {first ? `${first}, your` : 'Your'} CV opens doors in <Num className="text-[27px] sm:text-[32px]">{countries.length}</Num> {countries.length === 1 ? 'country' : 'countries'}
              </>
            ) : (
              <>
                {first ? `${first}, your` : 'Your'} <Num className="text-[27px] sm:text-[32px]">{items.length}</Num> matches are ready
              </>
            )}
          </h2>
        </div>

        {step === 'email' && countries.length > 0 && (
          <ul className="mt-3 space-y-1 text-[14.5px] font-medium text-ink-800">
            {['Jobs that need someone like you', 'Your visa sponsorship offer, prepared', 'The visa route and what it asks'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden /> {t}
              </li>
            ))}
          </ul>
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
          <ul className="mt-4 space-y-2">
            {shown.map((c, i) => (
              <CountryRow
                key={c.cc}
                c={c}
                from={from}
                fromName={fromName}
                best={best(c.cc)}
                visa={visaFor(c.cc)}
                open={openCc === c.cc}
                onToggle={() => setOpenCc((x) => (x === c.cc ? null : c.cc))}
                delay={150 + i * 120}
              />
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
          <QuickSignup cv={cv} onStep={setStep} sendLabel="Show my results" next={wantPro ? checkoutHref('pro', 'cv_match_guest_auto_apply') : null} />
        </div>

        {step === 'email' && items.length > 0 && (
          <button
            onClick={() => {
              setWantPro(true);
              focusSignup();
            }}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3.5 text-left text-white hover:bg-ink-800"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 text-ink-950">
              <Zap className="h-5 w-5" fill="currentColor" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-snug">Auto Apply to all these jobs, with your sponsorship document</span>
              <span className="mt-0.5 block text-[13px] text-white/70">
                {wantPro ? 'Approve your email above to continue' : <>Up to <b className="text-amber-300">{autoN.toLocaleString('en-US')}</b> applications a month</>} · Pro {priceLabel('pro')}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </button>
        )}
      </div>

      <ExampleJourney rotate boxed />
    </section>
  );
}
