import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  GraduationCap,
  Heart,
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
    label: 'Relocation',
    icon: Plane,
  },
  {
    id: 'work',
    label: 'Work',
    icon: Briefcase,
  },
  {
    id: 'study',
    label: 'Study',
    icon: GraduationCap,
  },
  {
    id: 'programs',
    label: 'Programs',
    icon: Building2,
  },
  {
    id: 'family',
    label: 'Family',
    icon: Heart,
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
  relocation: 'Find realistic options for your move abroad.',
};

const destinationCountries = countries.filter(
  (country) => country.code !== 'CA'
);

function CountryFlag({
  country,
  size = 'h-5 w-7',
}: {
  country: Country;
  size?: string;
}) {
  return (
    <img
      src={country.flag}
      alt={`${country.name} flag`}
      className={`${size} rounded-sm object-cover shadow-sm`}
    />
  );
}

function CountrySelector({
  label,
  country,
  onChange,
  availableCountries,
  disabled,
}: {
  label: string;
  country: Country;
  onChange: (country: Country) => void;
  availableCountries: Country[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[78px] w-full items-center gap-3 px-5 text-left transition ${
          disabled
            ? 'cursor-default'
            : 'hover:bg-ink-50'
        }`}
      >
        <CountryFlag
          country={country}
          size="h-6 w-9"
        />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-400">
            {label}
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-ink-900">
            {country.name}
          </p>
        </div>

        {!disabled && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink-400 transition ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {open && !disabled && (
        <>
          <button
            type="button"
            aria-label="Close country selector"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />

          <div className="absolute left-2 right-2 top-[82px] z-50 max-h-72 overflow-auto border border-ink-200 bg-white p-2 shadow-xl">
            {availableCountries.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition hover:bg-ink-50 ${
                  option.code === country.code
                    ? 'bg-brand-50'
                    : ''
                }`}
              >
                <CountryFlag country={option} />

                <span className="text-sm font-medium text-ink-800">
                  {option.name}
                </span>

                {option.code === country.code && (
                  <CheckCircle2 className="ml-auto h-4 w-4 text-brand-600" />
                )}
              </button>
            ))}
          </div>
        </>
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
  relocation: 'Relocation journey',
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

  const lineItems: { icon: typeof Plane; label: string; value: string }[] = [
    {
      icon: Plane,
      label: 'Est. flight cost',
      value: `${formatUSD(estimate.flightLowUSD)}–${formatUSD(estimate.flightHighUSD)}`,
    },
    ...(estimate.includeProgram
      ? [{ icon: GraduationCap, label: 'Est. program cost', value: formatUSD(estimate.programAverageUSD) }]
      : []),
    { icon: CheckCircle2, label: 'Est. visa fee', value: formatUSD(estimate.visaFeeUSD) },
    ...(estimate.includeWorkPermit
      ? [{ icon: Briefcase, label: 'Est. work permit fee', value: formatUSD(estimate.workPermitFeeUSD) }]
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

      <div className="mt-3 space-y-1.5">
        {lineItems.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-ink-600">
            <span className="w-4 shrink-0 text-center font-bold text-ink-300">{i === 0 ? '' : '+'}</span>
            <item.icon className="h-4 w-4 shrink-0 text-ink-400" />
            <span className="flex-1">{item.label}</span>
            <span className="font-semibold text-ink-800">{item.value}</span>
          </div>
        ))}

        <div className="mt-2 flex items-center gap-2 border-t border-ink-200 pt-2.5 text-base">
          <span className="w-4 shrink-0 text-center font-bold text-ink-400">=</span>
          <span className="flex-1 font-bold text-ink-900">Total estimated cost</span>
          <span className="text-xl font-extrabold tracking-tight text-ink-950">
            {formatUSD(estimate.totalLowUSD)}–{formatUSD(estimate.totalHighUSD)}
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-ink-400">
        Estimates only, not a live quote — actual costs vary by case.
      </p>
    </div>
  );
}

export function LandingHero({
  go,
  onAuth,
}: LandingHeroProps) {
  const canada =
    countries.find(
      (country) => country.code === 'CA'
    ) ?? countries[0];

  const { countryCode: detectedCode, countryName: detectedName, setCountry } =
    useOriginCountry();

  const [fromCountry, setFromCountry] =
    useState<Country>(canada);

  const [fromTouched, setFromTouched] =
    useState(false);

  // Auto-fill "I'm from" with the visitor's detected/selected location
  // (see lib/originCountry.tsx), unless they've picked one manually.
  useEffect(() => {
    if (fromTouched || !detectedCode) return;

    const known = countries.find(
      (country) => country.code === detectedCode
    );

    setFromCountry(
      known ??
        {
          name: detectedName ?? detectedCode,
          code: detectedCode,
          flag: `https://flagcdn.com/w80/${detectedCode.toLowerCase()}.png`,
          image: canada.image,
        }
    );
  }, [detectedCode, detectedName, fromTouched, canada.image]);

  const originCountries = useMemo(() => {
    if (!fromCountry || countries.some((c) => c.code === fromCountry.code)) {
      return countries;
    }
    return [fromCountry, ...countries];
  }, [fromCountry]);

  const [toCountry, setToCountry] =
    useState<Country>(
      countries.find(
        (country) => country.code === 'DE'
      ) ?? destinationCountries[0]
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

  const [showDestinationMenu, setShowDestinationMenu] =
    useState(false);

  // The dropdown is rendered via a portal (see below) so it isn't
  // clipped by the amber-border wrapper's overflow-hidden, or by any
  // other ancestor. We track the trigger button's on-screen position
  // so the portaled menu can line up under it with `position: fixed`.
  const destinationButtonRef = useRef<HTMLButtonElement>(null);
  const [destinationMenuPos, setDestinationMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!showDestinationMenu) return;

    const updatePosition = () => {
      const rect = destinationButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setDestinationMenuPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showDestinationMenu]);

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
            Your journey starts here
          </div>

          <div className="mt-5 max-w-4xl">

            <h1 className="text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Tell us what you want to do and we will
              help you find the right way to get there.
            </p>

          </div>

        </div>

      </section>

      {/* SEARCH */}

      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-5 sm:px-8">

        <div className="border border-ink-200 bg-white shadow-xl">

          {/* JOURNEY OPTIONS — now live inside the box so they stay
              visible no matter which tab's content is showing below. */}

          <div className="flex flex-wrap gap-2 border-b border-ink-100 bg-ink-950 px-5 py-4 sm:px-6">

            {journeys.map((journey) => {
              const Icon = journey.icon;
              const active = activeJourney === journey.id;

              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => handleJourneyChange(journey.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? 'border-white bg-white text-brand-700'
                      : 'border-white/25 text-white/75 hover:border-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                  {journey.id === 'relocation' && new24hCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-brand-100 text-brand-700' : 'bg-white/20 text-white'
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

              <CountrySelector
                label="I'm from"
                country={fromCountry}
                availableCountries={originCountries}
                onChange={(country) => {
                  setFromCountry(country);
                  setFromTouched(true);
                }}
              />

              {!fromTouched && detectedCode && (
                <div className="px-5 pb-4">

                  <div className="flex items-center gap-2 text-[11px] text-ink-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                    Detected from your location — click to change
                  </div>

                </div>
              )}

            </div>

            <div className="relative border-ink-100 lg:border-l">

              <button
                type="button"
                ref={destinationButtonRef}
                onClick={() =>
                  setShowDestinationMenu(
                    (value) => !value
                  )
                }
                className="flex min-h-[78px] w-full items-center gap-3 px-5 text-left transition hover:bg-ink-50"
              >

                <CountryFlag
                  country={toCountry}
                  size="h-6 w-9"
                />

                <div className="min-w-0 flex-1">

                  <p className="text-xs font-medium text-ink-400">
                    I want to go to
                  </p>

                  <p className="mt-1 truncate text-sm font-semibold text-ink-900">
                    {toCountry.name}
                  </p>

                </div>

                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-400 transition ${
                    showDestinationMenu
                      ? 'rotate-180'
                      : ''
                  }`}
                />

              </button>

              {showDestinationMenu && destinationMenuPos && createPortal(
                <>

                  <button
                    type="button"
                    aria-label="Close destination selector"
                    onClick={() =>
                      setShowDestinationMenu(false)
                    }
                    className="fixed inset-0 z-40 cursor-default"
                  />

                  <div
                    className="fixed z-50 max-h-80 overflow-auto rounded-md border border-ink-200 bg-white p-2 shadow-xl"
                    style={{
                      top: destinationMenuPos.top,
                      left: destinationMenuPos.left,
                      width: Math.max(destinationMenuPos.width, 260),
                    }}
                  >

                    {destinationCountries.map(
                      (country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setToCountry(country);
                            setShowDestinationMenu(
                              false
                            );
                          }}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition hover:bg-ink-50 ${
                            country.code ===
                            toCountry.code
                              ? 'bg-brand-50'
                              : ''
                          }`}
                        >

                          <CountryFlag
                            country={country}
                          />

                          <span className="text-sm font-medium text-ink-800">
                            {country.name}
                          </span>

                          {country.code ===
                            toCountry.code && (
                            <CheckCircle2 className="ml-auto h-4 w-4 text-brand-600" />
                          )}

                        </button>
                      )
                    )}

                  </div>

                </>,
                document.body
              )}

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

      <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-200 bg-white/60 px-5 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-bold text-ink-900">Have a job or program to share?</p>
            <p className="mt-0.5 text-xs text-ink-500">Reviewed within 24 hours before it goes live.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePostClick('submit-program')}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Post a Job
            </button>
            <button
              type="button"
              onClick={() => handlePostClick('submit-program')}
              className="rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Post a Program
            </button>
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

      {/* DESTINATIONS */}

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8">

        <div className="flex items-end justify-between">

          <div>

            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Destinations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Popular destinations
            </h2>

            <p className="mt-2 max-w-xl text-sm text-ink-500">
              Canada is our first source market. More
              destinations and source countries are coming soon.
            </p>

          </div>

          <button
            type="button"
            onClick={() => go('explore')}
            className="hidden items-center gap-2 text-sm font-semibold text-brand-600 sm:flex"
          >
            View all countries
            <ArrowRight className="h-4 w-4" />
          </button>

        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">

          {destinationCountries
            .slice(0, 8)
            .map((country) => {

              const selected =
                toCountry.code ===
                country.code;

              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    setToCountry(country);

                    window.scrollTo({
                      top: 0,
                      behavior: 'smooth',
                    });
                  }}
                  className={`group relative h-40 overflow-hidden text-left transition sm:h-48 ${
                    selected
                      ? 'ring-2 ring-brand-600 ring-offset-2'
                      : ''
                  }`}
                >

                  <img
                    src={country.image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/5" />

                  <div className="absolute inset-x-0 bottom-0 p-4">

                    <div className="flex items-center gap-2">

                      <CountryFlag
                        country={country}
                      />

                      <span className="text-sm font-bold text-white">
                        {country.name}
                      </span>

                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-xs text-white/75">
                      Explore options
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                    </div>

                  </div>

                </button>
              );
            })}

        </div>

      </section>

    </main>
  );
}