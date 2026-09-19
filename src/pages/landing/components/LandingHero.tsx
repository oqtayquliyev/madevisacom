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
  Loader2,
  Plane,
  Search,
  Sparkles,
} from 'lucide-react';
import type { View } from '@/types';
import { useOriginCountry } from '@/lib/originCountry';
import { estimateJourneyCostBreakdown } from '@/lib/costEstimates';
import { supabase } from '@/lib/supabase';

type LandingHeroProps = {
  go: (view: View) => void;
};

type Journey =
  | 'work'
  | 'study'
  | 'programs'
  | 'business'
  | 'family'
  | 'relocation';

type ResultTab =
  | 'best'
  | 'cheapest'
  | 'suggested'
  | 'sponsored';

type Country = {
  name: string;
  code: string;
  flag: string;
  image: string;
};

type Question = {
  id: string;
  label: string;
  placeholder: string;
  options?: string[];
  type?: 'select' | 'text' | 'number';
};

type ResultCounts = {
  best: number;
  cheapest: number;
  suggested: number;
  sponsored: number;
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
    id: 'business',
    label: 'Business',
    icon: Briefcase,
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

const journeyQuestions: Record<Journey, Question[]> = {
  work: [
    {
      id: 'specialization',
      label: 'Specialization',
      placeholder: 'Select your field',
      options: [
        'Technology',
        'Engineering',
        'Healthcare',
        'Finance',
        'Design',
        'Marketing',
        'Education',
        'Skilled trades',
        'Other',
      ],
    },
    {
      id: 'experience',
      label: 'Experience',
      placeholder: 'Select experience',
      options: [
        'No experience',
        '1 to 2 years',
        '3 to 5 years',
        '6 to 10 years',
        '10+ years',
      ],
    },
    {
      id: 'education',
      label: 'Education',
      placeholder: 'Select education',
      options: [
        'High school',
        'College',
        'Bachelor',
        'Master',
        'Doctorate',
      ],
    },
    {
      id: 'salary',
      label: 'Salary expectation',
      placeholder: 'Optional',
      type: 'number',
    },
  ],

  study: [
    {
      id: 'field',
      label: 'Field of study',
      placeholder: 'Select a field',
      options: [
        'Business',
        'Computer Science',
        'Engineering',
        'Healthcare',
        'Design',
        'Arts',
        'Social Sciences',
        'Other',
      ],
    },
    {
      id: 'level',
      label: 'Study level',
      placeholder: 'Select level',
      options: [
        'College',
        'Bachelor',
        'Master',
        'Doctorate',
      ],
    },
    {
      id: 'budget',
      label: 'Annual budget',
      placeholder: 'Select budget',
      options: [
        'Under $10,000',
        '$10,000 to $20,000',
        '$20,000 to $40,000',
        '$40,000+',
      ],
    },
    {
      id: 'intake',
      label: 'Preferred intake',
      placeholder: 'Select intake',
      options: [
        'January',
        'May',
        'September',
        'Flexible',
      ],
    },
  ],

  programs: [
    {
      id: 'programType',
      label: 'Program type',
      placeholder: 'Select program',
      options: [
        'Professional training',
        'Exchange program',
        'Certificate',
        'Apprenticeship',
        'Short course',
        'Language program',
      ],
    },
    {
      id: 'field',
      label: 'Field or interest',
      placeholder: 'Select a field',
      options: [
        'Technology',
        'Business',
        'Healthcare',
        'Engineering',
        'Design',
        'Hospitality',
        'Other',
      ],
    },
    {
      id: 'duration',
      label: 'Duration',
      placeholder: 'Select duration',
      options: [
        'Under 3 months',
        '3 to 6 months',
        '6 to 12 months',
        '1+ year',
      ],
    },
    {
      id: 'budget',
      label: 'Budget',
      placeholder: 'Select budget',
      options: [
        'Under $5,000',
        '$5,000 to $10,000',
        '$10,000 to $20,000',
        '$20,000+',
      ],
    },
  ],

  business: [
    {
      id: 'businessType',
      label: 'Business type',
      placeholder: 'Select business type',
      options: [
        'Startup',
        'Existing business',
        'Freelance',
        'Investor',
        'Entrepreneur',
      ],
    },
    {
      id: 'investment',
      label: 'Investment budget',
      placeholder: 'Select budget',
      options: [
        'Under $25,000',
        '$25,000 to $100,000',
        '$100,000 to $250,000',
        '$250,000+',
      ],
    },
    {
      id: 'businessStatus',
      label: 'Current situation',
      placeholder: 'Select one',
      options: [
        'Starting a business',
        'Already operating',
        'Expanding abroad',
        'Looking to invest',
      ],
    },
  ],

  family: [
    {
      id: 'familySize',
      label: 'Family members',
      placeholder: 'How many people?',
      options: [
        '1 person',
        '2 people',
        '3 people',
        '4 people',
        '5+ people',
      ],
    },
    {
      id: 'relationship',
      label: 'Relationship',
      placeholder: 'Select relationship',
      options: [
        'Spouse',
        'Partner',
        'Children',
        'Parents',
        'Other family',
      ],
    },
    {
      id: 'movingTogether',
      label: 'Moving together?',
      placeholder: 'Select one',
      options: [
        'Yes, everyone',
        'Some family members',
        'Not yet',
      ],
    },
  ],

  relocation: [
    {
      id: 'reason',
      label: 'Main reason',
      placeholder: 'Select your reason',
      options: [
        'Better career',
        'Quality of life',
        'Family',
        'Long term move',
        'Lifestyle',
        'Other',
      ],
    },
    {
      id: 'budget',
      label: 'Moving budget',
      placeholder: 'Select budget',
      options: [
        'Under $5,000',
        '$5,000 to $10,000',
        '$10,000 to $20,000',
        '$20,000+',
      ],
    },
    {
      id: 'employment',
      label: 'Employment status',
      placeholder: 'Select status',
      options: [
        'Employed',
        'Self employed',
        'Looking for work',
        'Student',
        'Not currently working',
      ],
    },
  ],
};

const resultCounts: Record<Journey, ResultCounts> = {
  work: {
    best: 3,
    cheapest: 1,
    suggested: 4,
    sponsored: 4,
  },
  study: {
    best: 3,
    cheapest: 2,
    suggested: 5,
    sponsored: 3,
  },
  programs: {
    best: 4,
    cheapest: 2,
    suggested: 4,
    sponsored: 2,
  },
  business: {
    best: 2,
    cheapest: 1,
    suggested: 3,
    sponsored: 3,
  },
  family: {
    best: 3,
    cheapest: 1,
    suggested: 3,
    sponsored: 2,
  },
  relocation: {
    best: 3,
    cheapest: 1,
    suggested: 4,
    sponsored: 3,
  },
};

const journeyDescriptions: Record<Journey, string> = {
  work: 'Find jobs and immigration pathways that fit your profile.',
  study: 'Find study options that fit your goals and budget.',
  programs: 'Find programs and training opportunities abroad.',
  business: 'Find business and investment pathways abroad.',
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

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.type === 'number') {
    return (
      <div>
        <label className="mb-2 block text-xs font-semibold text-ink-500">
          {question.label}
        </label>

        <input
          type="number"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={question.placeholder}
          className="h-12 w-full rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-ink-500">
        {question.label}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="h-12 w-full appearance-none rounded-lg border border-ink-200 bg-white px-4 pr-10 text-sm font-medium text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">
            {question.placeholder}
          </option>

          {question.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      </div>
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
  business: 'Business journey',
  family: 'Family journey',
  relocation: 'Relocation journey',
};

/**
 * Big-number cost estimate for the selected journey + country pair.
 * Click to expand the breakdown: flights, program average (study/
 * programs), visa fee, and work permit fee (work/business/relocation).
 * Numbers come from lib/costEstimates.ts — clearly-labeled estimates,
 * not live quotes.
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
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div className="border-b border-ink-100 bg-ink-50/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <DollarSign className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium text-ink-400">
              Estimated cost · {journeyCostLabels[journey]} to {destinationCountryName}
            </p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-ink-950">
              {formatUSD(estimate.totalLowUSD)} – {formatUSD(estimate.totalHighUSD)}
            </p>
          </div>
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-400 transition ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="space-y-2.5 px-5 pb-5 sm:px-6">
          <CostLine
            icon={Plane}
            label="Travel (flights, round trip)"
            value={`${formatUSD(estimate.flightLowUSD)} – ${formatUSD(estimate.flightHighUSD)}`}
          />
          {estimate.includeProgram && (
            <CostLine
              icon={GraduationCap}
              label="Program / tuition average"
              value={formatUSD(estimate.programAverageUSD)}
            />
          )}
          <CostLine
            icon={CheckCircle2}
            label="Visa requirement (fee)"
            value={formatUSD(estimate.visaFeeUSD)}
          />
          {estimate.includeWorkPermit && (
            <CostLine
              icon={Briefcase}
              label="Work permit fee"
              value={formatUSD(estimate.workPermitFeeUSD)}
            />
          )}
          <p className="pt-1 text-[11px] text-ink-400">
            Estimates only, not a live quote — actual costs vary by case.
          </p>
        </div>
      )}
    </div>
  );
}

function CostLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Plane;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-ink-600">
        <Icon className="h-4 w-4 shrink-0 text-ink-400" />
        {label}
      </span>
      <span className="shrink-0 font-semibold text-ink-900">{value}</span>
    </div>
  );
}

export function LandingHero({
  go,
}: LandingHeroProps) {
  const canada =
    countries.find(
      (country) => country.code === 'CA'
    ) ?? countries[0];

  const { countryCode: detectedCode, countryName: detectedName } =
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
    useState<Journey>('work');

  // Real count of published jobs + programs added in the last 48
  // hours, shown as a "(X new)" tag on the Relocation tab.
  const [newCount, setNewCount] = useState<number | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from('programs').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('created_at', since),
      supabase.from('sponsored_jobs').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('created_at', since),
    ]).then(([programsRes, jobsRes]) => {
      const total = (programsRes.count ?? 0) + (jobsRes.count ?? 0);
      setNewCount(total);
    });
  }, []);

  const [answers, setAnswers] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] =
    useState(false);

  const [hasSearched, setHasSearched] =
    useState(false);

  const [activeResultTab, setActiveResultTab] =
    useState<ResultTab>('best');

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

  const questions =
    journeyQuestions[activeJourney];

  const counts =
    resultCounts[activeJourney];

  const selectedJourney =
    journeys.find(
      (journey) => journey.id === activeJourney
    );

  const answeredCount = questions.filter(
    (question) =>
      Boolean(answers[question.id])
  ).length;

  const canSearch =
    answeredCount === questions.length &&
    Boolean(toCountry);

  const resultCategories = useMemo(
    () => [
      {
        id: 'best' as ResultTab,
        label: 'Best options',
        count: counts.best,
      },
      {
        id: 'cheapest' as ResultTab,
        label: 'Cheapest',
        count: counts.cheapest,
      },
      {
        id: 'suggested' as ResultTab,
        label: 'Suggested',
        count: counts.suggested,
      },
      {
        id: 'sponsored' as ResultTab,
        label: 'Sponsored',
        count: counts.sponsored,
      },
    ],
    [counts]
  );

  useEffect(() => {
    setAnswers({});
    setHasSearched(false);
    setActiveResultTab('best');
  }, [activeJourney]);

  const handleJourneyChange = (
    journey: Journey
  ) => {
    if (journey === activeJourney) {
      return;
    }

    setActiveJourney(journey);
    setLoading(false);
  };

  const handleAnswerChange = (
    id: string,
    value: string
  ) => {
    setAnswers((current) => ({
      ...current,
      [id]: value,
    }));

    setHasSearched(false);
  };

  const handleSearch = () => {
    if (!canSearch || loading) {
      return;
    }

    setLoading(true);
    setHasSearched(false);

    window.setTimeout(() => {
      setLoading(false);
      setHasSearched(true);
      setActiveResultTab('best');
    }, 900);
  };

  const handleResultCategory = (
    tab: ResultTab
  ) => {
    setActiveResultTab(tab);

    const params = new URLSearchParams({
      journey: activeJourney,
      result: tab,
      from: fromCountry.code,
      to: toCountry.code,
    });

    Object.entries(answers).forEach(
      ([key, value]) => {
        if (value) {
          params.set(key, value);
        }
      }
    );

    window.history.pushState(
      {},
      '',
      `/results?${params.toString()}`
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

          {/* JOURNEY OPTIONS */}

          <div className="mt-9 flex flex-wrap gap-2">

            {journeys.map((journey) => {
              const Icon = journey.icon;

              const active =
                activeJourney === journey.id;

              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() =>
                    handleJourneyChange(
                      journey.id
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? 'border-white bg-white text-brand-700'
                      : 'border-white/25 text-white/75 hover:border-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                  {journey.id === 'relocation' && newCount !== null && newCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-brand-100 text-brand-700' : 'bg-white/20 text-white'
                      }`}
                    >
                      {newCount} new
                    </span>
                  )}
                </button>
              );
            })}

          </div>

        </div>

      </section>

      {/* SEARCH */}

      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-5 sm:px-8">

        <div className="border border-ink-200 bg-white shadow-xl">

          {/* SEARCH HEADER */}

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
                {answeredCount} of {questions.length}{' '}
                answered
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
                            setHasSearched(false);
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

          {/* QUESTIONS */}

          <div className="border-t border-ink-100 px-5 py-6 sm:px-6">

            <div className="mb-5">

              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                About your journey
              </p>

              <h3 className="mt-1 text-base font-bold text-ink-950">
                A few questions so we can find relevant options
              </h3>

            </div>

            <div
              className={`grid gap-4 ${
                questions.length === 3
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-2'
              }`}
            >

              {questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={
                    answers[question.id] ?? ''
                  }
                  onChange={(value) =>
                    handleAnswerChange(
                      question.id,
                      value
                    )
                  }
                />
              ))}

            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">

              <p className="text-xs text-ink-400">
                Your answers help us match the most relevant pathways.
              </p>

              <button
                type="button"
                disabled={!canSearch || loading}
                onClick={handleSearch}
                className={`flex min-h-[48px] items-center justify-center gap-2 rounded-lg px-7 text-sm font-semibold text-white transition ${
                  canSearch && !loading
                    ? 'bg-brand-600 hover:bg-brand-700'
                    : 'cursor-not-allowed bg-ink-200 text-ink-400'
                }`}
              >

                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finding options
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Find my options
                  </>
                )}

              </button>

            </div>

          </div>

          {/* LOADING */}

          {loading && (
            <div className="border-t border-ink-100 bg-ink-50/40 px-5 py-8 sm:px-6">

              <div className="flex items-center justify-center gap-3 text-sm text-ink-500">

                <Loader2 className="h-5 w-5 animate-spin text-brand-600" />

                <span>
                  Finding the best options for your journey...
                </span>

              </div>

            </div>
          )}

          {/* RESULT CATEGORIES */}

          {hasSearched && !loading && (
            <div className="border-t border-ink-100">

              <div className="px-5 py-6 sm:px-6">

                <div className="mb-5">

                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    Your results
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-ink-950">
                    Choose how you want to explore
                  </h3>

                  <p className="mt-1 text-sm text-ink-500">
                    We found options for {toCountry.name}.
                    Choose a category to view them.
                  </p>

                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

                  {resultCategories.map(
                    (category) => {
                      const active =
                        activeResultTab ===
                        category.id;

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() =>
                            handleResultCategory(
                              category.id
                            )
                          }
                          className={`group rounded-xl border p-5 text-left transition ${
                            active
                              ? 'border-brand-600 bg-brand-50'
                              : 'border-ink-200 bg-white hover:border-brand-300 hover:shadow-md'
                          }`}
                        >

                          <div className="flex items-center justify-between">

                            <span
                              className={`text-sm font-bold ${
                                active
                                  ? 'text-brand-700'
                                  : 'text-ink-900'
                              }`}
                            >
                              {category.label}
                            </span>

                            <ArrowRight
                              className={`h-4 w-4 transition group-hover:translate-x-1 ${
                                active
                                  ? 'text-brand-600'
                                  : 'text-ink-400'
                              }`}
                            />

                          </div>

                          <div className="mt-4 flex items-end gap-2">

                            <span className="text-3xl font-bold tracking-tight text-ink-950">
                              {category.count}
                            </span>

                            <span className="pb-1 text-xs text-ink-400">
                              options found
                            </span>

                          </div>

                          <p className="mt-3 text-xs leading-5 text-ink-400">
                            View matching options based on your answers.
                          </p>

                        </button>
                      );
                    }
                  )}

                </div>

                <div className="mt-5 flex items-center gap-2 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-500">

                  <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />

                  Select a category to open the full results page.

                </div>

              </div>

            </div>
          )}

        </div>

      </section>

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
                    setHasSearched(false);

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