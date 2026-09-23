import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  GraduationCap,
  Megaphone,
  Plane,
  Search,
  Sparkles,
} from 'lucide-react';
import type { View } from '@/types';
import { useOriginCountry } from '@/lib/originCountry';
import { estimateJourneyCostBreakdown } from '@/lib/costEstimates';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { LocationMatchSection, fetchMatchItems, countNewWithin24h, type MatchItem } from './LocationMatchSection';
import { allCountries, type CountryEntry } from '@/data/allCountries';
import { CircleFlag } from '@/components/common/CircleFlag';

type LandingHeroProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type Journey =
  | 'work'
  | 'study'
  | 'programs'
  | 'family'
  | 'relocation';

type Country = {
  name: string;
  code: string;
  flag: string;
  image: string;
};

const journeys: {
  id: Journey;
  label: string;
  icon: typeof Briefcase;
}[] = [
  {
    id: 'relocation',
    label: 'Jobs',
    icon: Briefcase,
  },
  {
    id: 'programs',
    label: 'Programs',
    icon: Building2,
  },
  {
    id: 'study',
    label: 'Study',
    icon: GraduationCap,
  },
];

const countries: Country[] = [
  {
    name: 'Canada',
    code: 'CA',
    flag: 'https://flagcdn.com/w80/ca.png',
    image:
      'https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Germany',
    code: 'DE',
    flag: 'https://flagcdn.com/w80/de.png',
    image:
      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'United States',
    code: 'US',
    flag: 'https://flagcdn.com/w80/us.png',
    image:
      'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    flag: 'https://flagcdn.com/w80/gb.png',
    image:
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Australia',
    code: 'AU',
    flag: 'https://flagcdn.com/w80/au.png',
    image:
      'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Netherlands',
    code: 'NL',
    flag: 'https://flagcdn.com/w80/nl.png',
    image:
      'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Switzerland',
    code: 'CH',
    flag: 'https://flagcdn.com/w80/ch.png',
    image:
      'https://images.unsplash.com/photo-1527668752968-14dc70a27c95?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'France',
    code: 'FR',
    flag: 'https://flagcdn.com/w80/fr.png',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Ireland',
    code: 'IE',
    flag: 'https://flagcdn.com/w80/ie.png',
    image:
      'https://images.unsplash.com/photo-1590089415225-401ed6f9db8e?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'New Zealand',
    code: 'NZ',
    flag: 'https://flagcdn.com/w80/nz.png',
    image:
      'https://images.unsplash.com/photo-1469521669194-babb45599def?auto=format&fit=crop&w=1200&q=80',
  },
];

const journeyDescriptions: Record<Journey, string> = {
  work: 'Find jobs and immigration pathways that fit your profile.',
  study: 'Find study options that fit your goals and budget.',
  programs: 'Find programs and training opportunities abroad.',
  family: 'Find pathways for moving with your family.',
  relocation: 'Find real job vacancies abroad.',
};

function PortalCountryPicker({
  label,
  value,
  onChange,
  disabled,
  helper,
}: {
  label: string;
  value: CountryEntry;
  onChange: (country: CountryEntry) => void;
  disabled?: boolean;
  helper?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 280) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const filtered = allCountries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        ref={buttonRef}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-[78px] w-full items-center gap-3 px-5 text-left transition ${disabled ? 'cursor-default' : 'hover:bg-ink-50'}`}
      >
        <CircleFlag countryCode={value.code} label={value.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-400">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink-900">{value.name}</p>
        </div>
        {!disabled && <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />}
      </button>

      {helper}

      {open && !disabled && pos && createPortal(
        <>
          <button type="button" aria-label="Close" onClick={() => { setOpen(false); setSearch(''); }} className="fixed inset-0 z-40 cursor-default" />
          <div
            className="fixed z-50 max-h-80 overflow-hidden rounded-md border border-ink-200 bg-white shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="border-b border-ink-100 p-2">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search countries…"
                className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div className="max-h-64 overflow-auto p-2">
              {filtered.length === 0 && <p className="px-2 py-3 text-xs text-ink-400">No countries match "{search}"</p>}
              {filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setSearch(''); }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-ink-50 ${c.code === value.code ? 'bg-brand-50' : ''}`}
                >
                  <CircleFlag countryCode={c.code} label={c.name} size={22} />
                  <span className="text-sm font-medium text-ink-800">{c.name}</span>
                  {c.code === value.code && <CheckCircle2 className="ml-auto h-4 w-4 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function formatUSD(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const journeyCostLabels: Record<Journey, string> = {
  work: 'Work journey',
  study: 'Study journey',
  programs: 'Program journey',
  family: 'Family journey',
  relocation: 'Jobs journey',
};

/**
 * Cost estimate for the selected journey + country pair, shown as a
 * running sum: each line item connected with "+", ending in "="
 * before the total. Always visible — no click-to-expand. Numbers
 * come from lib/costEstimates.ts — clearly-labeled estimates, not
 * live quotes.
 */
function JourneyCostEstimate({
  journey,
  originCountryCode,
  destinationCountryCode,
  destinationCountryName,
}: {
  journey: Journey;
  originCountryCode: string | null;
  destinationCountryCode: string;
  destinationCountryName: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const estimate = useMemo(
    () =>
      estimateJourneyCostBreakdown({
        originCountryCode,
        destinationCountryCode,
        destinationCountryName,
        journey,
      }),
    [originCountryCode, destinationCountryCode, destinationCountryName, journey]
  );

  const lineItems: { id: string; icon: typeof Plane; label: string; value: string; detail: string; source: string }[] = [
    {
      id: 'flight',
      icon: Plane,
      label: 'Est. flight cost',
      value: `${formatUSD(estimate.flightLowUSD)}–${formatUSD(estimate.flightHighUSD)}`,
      detail: `Round-trip economy estimate based on typical fares between this origin and ${destinationCountryName}. Actual prices vary by season, airline and how far ahead you book.`,
      source: 'Historical airfare data',
    },
    ...(estimate.includeProgram
      ? [{
          id: 'program',
          icon: GraduationCap,
          label: 'Est. program cost',
          value: formatUSD(estimate.programAverageUSD),
          detail: `Typical cost for this kind of program in ${destinationCountryName}. Some programs are free or fully funded — check the listing itself for the real figure.`,
          source: 'Typical program costs',
        }]
      : []),
    {
      id: 'visa',
      icon: CheckCircle2,
      label: 'Est. visa fee',
      value: formatUSD(estimate.visaFeeUSD),
      detail: `Government visa application fee for entering ${destinationCountryName}. Doesn't include service fees charged by agencies or visa centers.`,
      source: `${destinationCountryName} government fee schedule`,
    },
    ...(estimate.includeWorkPermit
      ? [{
          id: 'permit',
          icon: Briefcase,
          label: 'Est. work permit fee',
          value: formatUSD(estimate.workPermitFeeUSD),
          detail: `Government processing fee for a work permit or visa in ${destinationCountryName}, separate from the entry visa fee above.`,
          source: `${destinationCountryName} government fee schedule`,
        }]
      : []),
  ];

  return (
    <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
          <DollarSign className="h-5 w-5" />
        </span>
        <p className="text-xs font-medium text-ink-400">
          Estimated cost · {journeyCostLabels[journey]} to {destinationCountryName}
        </p>
      </div>

      <div className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {lineItems.map((item) => {
          const isOpen = expandedId === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : item.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink-600 hover:bg-ink-50"
              >
                <item.icon className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="flex-1">{item.label}</span>
                <span className="font-semibold text-ink-800">{item.value}</span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-ink-400 transition ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pl-9 text-xs leading-5 text-ink-500">
                  {item.detail}
                  <p className="mt-1">
                    <span className="cursor-default underline decoration-dotted underline-offset-2" title={item.source}>
                      Source: {item.source}
                    </span>
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-2 bg-ink-50 px-3 py-3">
          <span className="flex-1 text-sm font-bold text-ink-900">Total estimated cost</span>
          <span className="text-lg font-extrabold tracking-tight text-ink-950">
            {formatUSD(estimate.totalLowUSD)}–{formatUSD(estimate.totalHighUSD)}
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-ink-400">
        Estimates only, not a live quote — actual costs vary by case. Tap a line for details.
      </p>
    </div>
  );
}

export function LandingHero({
  go,
  onAuth,
}: LandingHeroProps) {
  const { countryCode: detectedCode, countryName: detectedName, setCountry } =
    useOriginCountry();

  const [fromCountry, setFromCountry] =
    useState<CountryEntry>(allCountries.find((c) => c.code === 'CA') ?? allCountries[0]);

  const [fromTouched, setFromTouched] =
    useState(false);

  // Auto-fill "I'm from" with the visitor's detected/selected location
  // (see lib/originCountry.tsx), unless they've picked one manually.
  useEffect(() => {
    if (fromTouched || !detectedCode) return;

    const known = allCountries.find(
      (country) => country.code === detectedCode
    );

    setFromCountry(
      known ?? { name: detectedName ?? detectedCode, code: detectedCode }
    );
  }, [detectedCode, detectedName, fromTouched]);

  const [toCountry, setToCountry] =
    useState<CountryEntry>(
      allCountries.find((country) => country.code === 'DE') ?? allCountries[0]
    );

  const [activeJourney, setActiveJourney] =
    useState<Journey>('relocation');

  // Fetched ONCE and shared with LocationMatchSection below (same
  // data, same object) so the "X new" badge on the Relocation tab can
  // never disagree with what the section actually displays.
  const [matchItems, setMatchItems] = useState<MatchItem[] | null>(null);

  useEffect(() => {
    fetchMatchItems().then(setMatchItems);
  }, []);

  const new24hCount = matchItems ? countNewWithin24h(matchItems) : 0;

  const { user } = useAuth();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const handlePostClick = (target: View) => {
    if (user) {
      go(target);
    } else {
      setShowAuthPrompt(true);
    }
  };

  const selectedJourney =
    journeys.find(
      (journey) => journey.id === activeJourney
    );

  // Real count of published jobs + programs for the chosen
  // destination country — replaces the old hardcoded/fake result
  // counts. Recomputed whenever the destination changes.
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (activeJourney === 'relocation') return;
    let cancelled = false;
    setMatchCount(null);

    (async () => {
      const { data: countryRow } = await supabase
        .from('countries')
        .select('id')
        .eq('iso_code', toCountry.code)
        .maybeSingle();

      if (!countryRow) {
        if (!cancelled) setMatchCount(0);
        return;
      }

      const [programsRes, jobsRes] = await Promise.all([
        supabase.from('programs').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('country_id', countryRow.id),
        supabase.from('sponsored_jobs').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('country_id', countryRow.id),
      ]);

      if (!cancelled) setMatchCount((programsRes.count ?? 0) + (jobsRes.count ?? 0));
    })();

    return () => {
      cancelled = true;
    };
  }, [toCountry.code, activeJourney]);

  const handleJourneyChange = (
    journey: Journey
  ) => {
    if (journey === activeJourney) {
      return;
    }

    setActiveJourney(journey);
  };

  const handleFindOptions = () => {
    const targetView = activeJourney === 'study' || activeJourney === 'programs' ? 'programs' : 'jobs';
    const params = new URLSearchParams({ country: toCountry.name });

    window.history.pushState(
      {},
      '',
      `/${targetView}?${params.toString()}`
    );

    window.dispatchEvent(
      new PopStateEvent('popstate')
    );
  };

  return (
    <main className="bg-white">

      {/* HERO */}

      <section className="bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 pb-28 pt-10 sm:px-8 sm:pb-32 sm:pt-12">

          <div className="flex items-center gap-2 text-sm font-medium text-white/70">
            <Sparkles className="h-4 w-4" />
            All-in-one opportunity library
          </div>

          <div className="mt-5 max-w-4xl">

            <h1 className="text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path with MadeVisa.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              MadeVisa brings together jobs, programs, study options, sponsorships and visas that are usually
              scattered across company career pages, job sites and official sources. Discover opportunities you
              may not find on LinkedIn or traditional job boards, at home or abroad.
            </p>

          </div>

        </div>

      </section>

      {/* SEARCH */}

      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-8 lg:px-10">

        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">

          {/* JOURNEY OPTIONS — now live inside the box so they stay
              visible no matter which tab's content is showing below. */}

          <div className="flex flex-wrap gap-2 border-b border-ink-100 bg-ink-50 px-6 py-5 sm:px-8">

            {journeys.map((journey) => {
              const Icon = journey.icon;
              const active = activeJourney === journey.id;

              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => handleJourneyChange(journey.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                  {journey.id === 'relocation' && new24hCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {new24hCount > 10 ? '10+' : new24hCount} new
                    </span>
                  )}
                </button>
              );
            })}

          </div>

        {activeJourney === 'relocation' ? (
          <LocationMatchSection
            items={matchItems}
            originCode={detectedCode}
            originName={detectedName}
            setOriginCountry={setCountry}
          />
        ) : (
          <>

          <div className="border-b border-ink-100 px-5 py-5 sm:px-6">

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <div className="flex items-center gap-2">

                  {selectedJourney && (
                    <selectedJourney.icon className="h-5 w-5 text-brand-600" />
                  )}

                  <h2 className="text-xl font-bold text-ink-950">
                    {selectedJourney?.label}
                  </h2>

                </div>

                <p className="mt-1 text-sm text-ink-500">
                  {journeyDescriptions[activeJourney]}
                </p>
              </div>

              <div className="text-xs font-medium text-ink-400">
                {matchCount !== null && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">
                    {matchCount} {matchCount === 1 ? 'opportunity' : 'opportunities'} to {toCountry.name}
                  </span>
                )}
              </div>

            </div>

          </div>

          {/* COST ESTIMATE */}

          <JourneyCostEstimate
            journey={activeJourney}
            originCountryCode={fromCountry.code}
            destinationCountryCode={toCountry.code}
            destinationCountryName={toCountry.name}
          />

          {/* COUNTRY PAIR */}

          <div className="m-4 overflow-hidden rounded-lg border-2 border-amber-400">
          <div className="grid lg:grid-cols-2">

            <div className="border-b border-ink-100 lg:border-b-0">
              <PortalCountryPicker
                label="I'm from"
                value={fromCountry}
                onChange={(country) => {
                  setFromCountry(country);
                  setFromTouched(true);
                }}
                helper={
                  !fromTouched && detectedCode ? (
                    <div className="px-5 pb-4">
                      <div className="flex items-center gap-2 text-[11px] text-ink-400">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                        Detected from your location — click to change
                      </div>
                    </div>
                  ) : undefined
                }
              />
            </div>

            <div className="border-ink-100 lg:border-l">
              <PortalCountryPicker
                label="I want to go to"
                value={toCountry}
                onChange={setToCountry}
              />
            </div>

          </div>
          </div>

          {/* FIND OPTIONS */}

          <div className="border-t border-ink-100 px-5 py-6 sm:px-6">

            <button
              type="button"
              onClick={handleFindOptions}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 text-base font-bold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto"
            >
              <Search className="h-4 w-4" />
              Find my options
              {matchCount !== null && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-sm">
                  {matchCount}
                </span>
              )}
            </button>

          </div>

          </>
        )}

        </div>

      </section>

      {/* POST A JOB / PROGRAM CTA */}

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:pb-16">
        <div className="overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white shadow-soft-lg">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">

            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                <Megaphone className="h-3.5 w-3.5" />
                For organizations
              </span>

              <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                Reach people ready to move abroad
              </h2>

              <p className="mt-3 max-w-lg text-sm leading-6 text-ink-600">
                Companies, governments, universities, institutions, agencies and program providers use MadeVisa to
                put real opportunities in front of people actively planning their move — reviewed and verified
                before anything goes live.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handlePostClick('submit-program')}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <Briefcase className="h-5 w-5" />
                  Post a Job
                </button>
                <button
                  type="button"
                  onClick={() => handlePostClick('submit-program')}
                  className="flex items-center gap-2 rounded-lg bg-ink-900 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-ink-800"
                >
                  <GraduationCap className="h-5 w-5" />
                  Post a Program
                </button>
              </div>

              <p className="mt-3 text-xs font-medium text-ink-400">
                Free to submit · Reviewed within 24 hours before publishing
              </p>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white/80 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">How posting works</p>
              <div className="mt-4 space-y-4">
                {[
                  { step: '1', label: 'Submit', detail: 'Share the essentials — title, category, destination.' },
                  { step: '2', label: 'Review', detail: 'Our team verifies it and fills in the rest with you.' },
                  { step: '3', label: 'Publish', detail: 'It goes live and reaches people planning that exact move.' },
                ].map((s, i, arr) => (
                  <div key={s.step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                        {s.step}
                      </span>
                      {i < arr.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-ink-200" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-bold text-ink-900">{s.label}</p>
                      <p className="text-xs text-ink-500">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {showAuthPrompt && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowAuthPrompt(false)}
            className="fixed inset-0 z-50 cursor-default bg-ink-950/50"
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 text-center shadow-2xl">
            <p className="text-base font-bold text-ink-950">Sign up to post a listing</p>
            <p className="mt-2 text-sm text-ink-500">
              Create a free MadeVisa account to submit a job or program — it's reviewed within 24 hours before going live.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => { setShowAuthPrompt(false); onAuth?.('register'); }}
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Create account
              </button>
              <button
                onClick={() => { setShowAuthPrompt(false); onAuth?.('login'); }}
                className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >
                I already have an account
              </button>
            </div>
          </div>
        </>
      )}

    </main>
  );
}