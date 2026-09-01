import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Heart,
  Home,
  Loader2,
  Plane,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import type { View } from '@/types';

type LandingHeroProps = {
  go: (view: View) => void;
};

type Service =
  | 'visa'
  | 'flights'
  | 'hotels'
  | 'airbnb'
  | 'experts';

type Journey =
  | 'work'
  | 'study'
  | 'programs'
  | 'business'
  | 'family';

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
  type?: 'select' | 'number';
};

type JourneyData = {
  description: string;
  cost: number;
  opportunities: number;
  questions: Question[];
};

const services: {
  id: Service;
  label: string;
  icon: typeof Plane;
}[] = [
  {
    id: 'visa',
    label: 'Visa & pathways',
    icon: GlobeIcon,
  },
  {
    id: 'flights',
    label: 'Flights',
    icon: Plane,
  },
  {
    id: 'hotels',
    label: 'Hotels',
    icon: Building2,
  },
  {
    id: 'airbnb',
    label: 'Airbnbs',
    icon: Home,
  },
  {
    id: 'experts',
    label: 'Experts',
    icon: Users,
  },
];

const journeys: {
  id: Journey;
  label: string;
  icon: typeof Briefcase;
}[] = [
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

const destinationCountries = countries.filter(
  (country) => country.code !== 'CA'
);

const journeyData: Record<
  Journey,
  JourneyData
> = {
  work: {
    description:
      'Find work opportunities and pathways that fit your profile.',
    cost: 4850,
    opportunities: 184,
    questions: [
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
  },

  study: {
    description:
      'Find study options that fit your goals and budget.',
    cost: 3250,
    opportunities: 126,
    questions: [
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
  },

  programs: {
    description:
      'Find programs, exchanges and training opportunities.',
    cost: 2800,
    opportunities: 92,
    questions: [
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
  },

  business: {
    description:
      'Explore business, entrepreneur and investment pathways.',
    cost: 18500,
    opportunities: 47,
    questions: [
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
  },

  family: {
    description:
      'Find pathways for moving abroad with your family.',
    cost: 7200,
    opportunities: 63,
    questions: [
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
  },
};

const resultCounts: Record<
  Journey,
  Record<ResultTab, number>
> = {
  work: {
    best: 12,
    cheapest: 5,
    suggested: 9,
    sponsored: 7,
  },
  study: {
    best: 8,
    cheapest: 4,
    suggested: 11,
    sponsored: 5,
  },
  programs: {
    best: 7,
    cheapest: 3,
    suggested: 8,
    sponsored: 4,
  },
  business: {
    best: 5,
    cheapest: 2,
    suggested: 6,
    sponsored: 3,
  },
  family: {
    best: 6,
    cheapest: 2,
    suggested: 5,
    sponsored: 2,
  },
};

const resultLabels: {
  id: ResultTab;
  label: string;
}[] = [
  {
    id: 'best',
    label: 'Best options',
  },
  {
    id: 'cheapest',
    label: 'Cheapest',
  },
  {
    id: 'suggested',
    label: 'Suggested',
  },
  {
    id: 'sponsored',
    label: 'Sponsored',
  },
];

function GlobeIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 0 20" />
      <path d="M12 2a15.3 15.3 0 0 0 0 20" />
    </svg>
  );
}

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
  availableCountries,
  onChange,
  disabled = false,
}: {
  label: string;
  country: Country;
  availableCountries: Country[];
  onChange: (country: Country) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[78px] w-full items-center gap-3 px-5 text-left ${
          disabled
            ? 'cursor-default'
            : 'transition hover:bg-ink-50'
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
            className={`h-4 w-4 text-ink-400 transition ${
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
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-ink-500">
        {question.label}
      </label>

      {question.type === 'number' ? (
        <input
          type="number"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={question.placeholder}
          className="h-12 w-full rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      ) : (
        <div className="relative">
          <select
            value={value}
            onChange={(event) =>
              onChange(event.target.value)
            }
            className="h-12 w-full appearance-none rounded-lg border border-ink-200 bg-white px-4 pr-10 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
      )}
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

  const defaultDestination =
    countries.find(
      (country) => country.code === 'DE'
    ) ?? destinationCountries[0];

  const [fromCountry] =
    useState<Country>(canada);

  const [toCountry, setToCountry] =
    useState<Country>(defaultDestination);

  const [activeJourney, setActiveJourney] =
    useState<Journey>('work');

  const [activeService, setActiveService] =
    useState<Service>('visa');

  const [answers, setAnswers] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] =
    useState(false);

  const [hasSearched, setHasSearched] =
    useState(false);

  const [destinationOpen, setDestinationOpen] =
    useState(false);

  const [activeResultTab, setActiveResultTab] =
    useState<ResultTab>('best');

  const selectedJourney =
    journeys.find(
      (journey) => journey.id === activeJourney
    ) ?? journeys[0];

  const currentJourney =
    journeyData[activeJourney];

  const questions =
    currentJourney.questions;

  const counts =
    resultCounts[activeJourney];

  const answeredCount = questions.filter(
    (question) =>
      Boolean(answers[question.id])
  ).length;

  const canSearch =
    answeredCount === questions.length;

  const formattedCost =
    currentJourney.cost.toLocaleString();

  const resultCategories = useMemo(
    () =>
      resultLabels.map((item) => ({
        ...item,
        count: counts[item.id],
      })),
    [counts]
  );

  useEffect(() => {
    setAnswers({});
    setHasSearched(false);
    setActiveResultTab('best');
    setLoading(false);
  }, [activeJourney]);

  const handleJourneyChange = (
    journey: Journey
  ) => {
    if (journey === activeJourney) {
      return;
    }

    setActiveJourney(journey);
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

          {/* RELOCATION HEADER */}

          <div className="flex items-center gap-2 text-sm font-semibold text-white/75">
            <Plane className="h-4 w-4" />
            Relocation
          </div>

          <div className="mt-4 max-w-4xl">

            <h1 className="text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Choose how you want to move and we will help
              you find the right options.
            </p>

          </div>

          {/* PRIMARY JOURNEY CATEGORIES */}

          <div className="mt-9">

            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
              What are you looking for?
            </p>

            <div className="flex flex-wrap gap-2">

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
                    className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'border-white bg-white text-brand-700'
                        : 'border-white/25 text-white/75 hover:border-white/60 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {journey.label}
                  </button>
                );
              })}

            </div>

          </div>

          {/* SECONDARY SERVICES */}

          <div className="mt-7">

            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Also explore
            </p>

            <div className="flex flex-wrap gap-2">

              {services.map((service) => {
                const Icon = service.icon;

                const active =
                  activeService === service.id;

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      setActiveService(service.id)
                    }
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition ${
                      active
                        ? 'border-white/70 bg-white/10 text-white'
                        : 'border-white/15 text-white/55 hover:border-white/40 hover:text-white/80'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {service.label}
                  </button>
                );
              })}

            </div>

          </div>

        </div>

      </section>

      {/* MAIN RELOCATION SEARCH */}

      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-5 sm:px-8">

        <div className="border border-ink-200 bg-white shadow-xl">

          {/* CURRENT CATEGORY SUMMARY */}

          <div className="border-b border-ink-100 px-5 py-5 sm:px-6">

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="flex items-center gap-2">

                  <selectedJourney.icon className="h-5 w-5 text-brand-600" />

                  <h2 className="text-xl font-bold text-ink-950">
                    {selectedJourney.label}
                  </h2>

                </div>

                <p className="mt-1 max-w-xl text-sm text-ink-500">
                  {currentJourney.description}
                </p>

              </div>

              {/* DYNAMIC STATS */}

              <div className="flex flex-wrap items-center gap-2">

                <div className="rounded-lg bg-brand-50 px-4 py-2.5">

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                    Approx. move cost
                  </p>

                  <p className="mt-0.5 text-lg font-bold text-brand-700">
                    ${formattedCost}
                  </p>

                </div>

                <div className="rounded-lg border border-ink-200 bg-white px-4 py-2.5">

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                    Opportunities
                  </p>

                  <p className="mt-0.5 text-lg font-bold text-ink-900">
                    {currentJourney.opportunities}
                  </p>

                </div>

              </div>

            </div>

          </div>

          {/* COUNTRY PAIR */}

          <div className="grid lg:grid-cols-2">

            <CountrySelector
              label="I'm from"
              country={fromCountry}
              availableCountries={[
                fromCountry,
              ]}
              onChange={() => undefined}
              disabled
            />

            <div className="relative border-t border-ink-100 lg:border-l lg:border-t-0">

              <button
                type="button"
                onClick={() =>
                  setDestinationOpen(
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
                  className={`h-4 w-4 text-ink-400 transition ${
                    destinationOpen
                      ? 'rotate-180'
                      : ''
                  }`}
                />

              </button>

              {destinationOpen && (
                <>

                  <button
                    type="button"
                    aria-label="Close destination selector"
                    onClick={() =>
                      setDestinationOpen(false)
                    }
                    className="fixed inset-0 z-30 cursor-default"
                  />

                  <div className="absolute left-2 right-2 top-[82px] z-50 max-h-80 overflow-auto border border-ink-200 bg-white p-2 shadow-xl">

                    {destinationCountries.map(
                      (country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setToCountry(country);
                            setDestinationOpen(
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

                </>
              )}

            </div>

          </div>

          {/* QUESTIONS */}

          <div className="border-t border-ink-100 px-5 py-6 sm:px-6">

            <div className="mb-5 flex flex-col gap-1">

              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Tell us about your move
              </p>

              <h3 className="text-base font-bold text-ink-950">
                A few questions for your {selectedJourney.label.toLowerCase()} journey
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

              <div className="flex items-center gap-2 text-xs text-ink-400">

                <Sparkles className="h-4 w-4 text-brand-600" />

                {answeredCount} of {questions.length}{' '}
                answered

              </div>

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
            <div className="border-t border-ink-100 bg-ink-50/40 px-5 py-9 sm:px-6">

              <div className="flex items-center justify-center gap-3 text-sm text-ink-500">

                <Loader2 className="h-5 w-5 animate-spin text-brand-600" />

                Finding relevant {selectedJourney.label.toLowerCase()} options for {toCountry.name}...

              </div>

            </div>
          )}

          {/* RESULT CATEGORIES */}

          {hasSearched && !loading && (
            <div className="border-t border-ink-100">

              <div className="px-5 py-6 sm:px-6">

                <div className="mb-5">

                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {toCountry.name}
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-ink-950">
                    We found {currentJourney.opportunities} opportunities
                  </h3>

                  <p className="mt-1 text-sm text-ink-500">
                    Choose how you want to explore your matches.
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
                              options
                            </span>

                          </div>

                          <p className="mt-3 text-xs leading-5 text-ink-400">
                            Open the full results page to compare them.
                          </p>

                        </button>
                      );
                    }
                  )}

                </div>

              </div>

            </div>
          )}

        </div>

      </section>

      {/* DESTINATIONS */}

      <section
        id="destinations"
        className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8"
      >

        <div className="flex items-end justify-between">

          <div>

            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Destinations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Where can Canada take you?
            </h2>

            <p className="mt-2 max-w-xl text-sm text-ink-500">
              Start with the most popular destinations.
              More markets will be added soon.
            </p>

          </div>

          <button
            type="button"
            onClick={() => go('explore')}
            className="hidden items-center gap-2 text-sm font-semibold text-brand-600 sm:flex"
          >
            View all
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