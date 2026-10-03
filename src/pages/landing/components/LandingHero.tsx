import { useEffect, useMemo, useRef, useState } from 'react';
import { nav } from '@/lib/pageLayout';
import { SOON_VIEWS } from '@/components/common/SoonChip';
import { SponsoredAdsSection } from './SponsoredAdsSection';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  GraduationCap,
  Plane,
  Search,
  Sparkles,
} from 'lucide-react';
import type { View } from '@/types';
import { useOriginCountry } from '@/lib/originCountry';
import { estimateJourneyCostBreakdown } from '@/lib/costEstimates';
import { supabase } from '@/lib/supabase';
import { LocationMatchSection, fetchLandingItems, countNewWithin24h, type MatchItem } from './LocationMatchSection';
import { useSiteStats } from '@/lib/siteStats';
import { allCountries, type CountryEntry } from '@/data/allCountries';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CvUpload } from '@/components/cv/CvUpload';
import { useCv } from '@/lib/cv/store';

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

const journeyDescriptions: Record<Journey, string> = {
  work: 'Find jobs and immigration pathways that fit your profile.',
  study: 'Find study options that fit your goals and budget.',
  programs: 'Find programs and training opportunities abroad.',
  family: 'Find pathways for moving with your family.',
  relocation: 'Find real job vacancies abroad.',
};

const SOON_COPY: Partial<Record<Journey, { title: string; text: string; points: string[] }>> = {
  programs: {
    title: 'All official programs, in one place.',
    text: 'Government, work and talent programs from every country — connected here.',
    points: ['Official sources only', 'Clear requirements', 'Visa steps included'],
  },
  study: {
    title: 'All study options, in one place.',
    text: 'Universities, scholarships and courses abroad — connected here.',
    points: ['Scholarships & funding', 'Entry requirements', 'Student visa steps'],
  },
};

function SoonTeaser({ journey }: { journey: Journey }) {
  const copy = SOON_COPY[journey];
  if (!copy) return null;
  return (
    <div className="px-5 py-10 text-center sm:px-8 sm:py-14">
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">Soon</span>
      <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-bold text-ink-950 sm:text-3xl">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-500 sm:text-base">{copy.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {copy.points.map((p) => (
          <span key={p} className="flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50/60 px-3 py-1.5 text-xs font-semibold text-brand-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {p}
          </span>
        ))}
      </div>
    </div>
  );
}

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

// go/onAuth stay in the props for callers; the hero itself links by URL now.
export function LandingHero(_props: LandingHeroProps) {
  void _props;
  const { hasCv } = useCv();
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
  const [matchItemsComplete, setMatchItemsComplete] = useState(false);
  const siteStats = useSiteStats();

  useEffect(() => {
    let cancelled = false;
    const show = (items: MatchItem[]) => {
      if (!cancelled) setMatchItems(items);
    };
    // Only the newest jobs — the landing page shows 5 of them.
    fetchLandingItems().then((items) => {
      show(items);
      if (!cancelled) setMatchItemsComplete(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // From the hourly snapshot when available (steady, same on every device).
  const new24hCount = siteStats ? siteStats.newJobs24h : matchItems && matchItemsComplete ? countNewWithin24h(matchItems) : 0;


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
    const targetView = activeJourney === 'study' ? 'study' : activeJourney === 'programs' ? 'programs' : 'jobs';
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

        <div className="mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-10">

          <div className="hidden items-center gap-2 text-sm font-medium text-white/70 sm:flex">
            <Sparkles className="h-4 w-4" />
            Jobs abroad · CV match · Hiring insights
          </div>

          <div className="max-w-4xl sm:mt-5">

            <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find a job abroad. See how well you match it.
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 sm:mt-4 sm:text-lg sm:leading-7">
              Upload your CV once. Every live job from company career pages shows your match score and what’s missing before you apply.
            </p>

            <div className="mt-5 max-w-md sm:mt-7">
              <CvUpload tone="light" compact onDone={() => nav('/cv-match')} />
              {hasCv && (
                <a
                  href="/jobs"
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState({}, '', '/jobs');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    window.scrollTo({ top: 0 });
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  <Search className="h-4 w-4" /> Open a job and check your match
                </a>
              )}
              {!hasCv && <p className="mt-2 text-[12px] text-white/65">Free. Your CV is never sent to employers.</p>}
            </div>

          </div>

        </div>

      </section>

      {/* SEARCH */}

      <section className="relative z-10 mx-auto -mt-10 max-w-7xl px-3 sm:-mt-14 sm:px-8 lg:px-10">

        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">

          {/* JOURNEY OPTIONS — now live inside the box so they stay
              visible no matter which tab's content is showing below. */}

          <div className="flex gap-2 overflow-x-auto border-b border-ink-100 bg-ink-50 px-4 py-3 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-8 sm:py-5">

            {journeys.map((journey) => {
              const Icon = journey.icon;
              const active = activeJourney === journey.id;

              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => handleJourneyChange(journey.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
                    active
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                  {(SOON_VIEWS.has(journey.id) || (journey.id === 'relocation' && new24hCount > 0)) && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {SOON_VIEWS.has(journey.id) ? 'Soon' : `${new24hCount > 99 ? '99+' : new24hCount} new`}
                    </span>
                  )}
                </button>
              );
            })}

          </div>

        {SOON_VIEWS.has(activeJourney) ? (
          <SoonTeaser journey={activeJourney} />
        ) : activeJourney === 'relocation' ? (
          <LocationMatchSection
            items={matchItems}
            itemsComplete={matchItemsComplete}
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

      {/* FOR ORGANIZATIONS — free posting + sponsored ads, one section */}
      <SponsoredAdsSection />


    </main>
  );
}