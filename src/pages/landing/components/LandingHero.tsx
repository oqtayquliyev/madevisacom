import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Heart,
  Home,
  Info,
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
  | 'vocational'
  | 'business'
  | 'family'
  | 'relocation';

type Currency = 'USD' | 'EUR' | 'GBP' | 'AZN';

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

type ResultItem = {
  title: string;
  subtitle: string;
  description: string;
  price: string;
  tag: string;
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
    id: 'vocational',
    label: 'Vocational training',
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
  {
    id: 'relocation',
    label: 'Relocation',
    icon: Plane,
  },
];

const countries: Country[] = [
  {
    name: 'Azerbaijan',
    code: 'AZ',
    flag: 'https://flagcdn.com/w80/az.png',
    image:
      'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Germany',
    code: 'DE',
    flag: 'https://flagcdn.com/w80/de.png',
    image:
      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Italy',
    code: 'IT',
    flag: 'https://flagcdn.com/w80/it.png',
    image:
      'https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    flag: 'https://flagcdn.com/w80/gb.png',
    image:
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Canada',
    code: 'CA',
    flag: 'https://flagcdn.com/w80/ca.png',
    image:
      'https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Australia',
    code: 'AU',
    flag: 'https://flagcdn.com/w80/au.png',
    image:
      'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Switzerland',
    code: 'CH',
    flag: 'https://flagcdn.com/w80/ch.png',
    image:
      'https://images.unsplash.com/photo-1527668752968-14dc70a27c95?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Netherlands',
    code: 'NL',
    flag: 'https://flagcdn.com/w80/nl.png',
    image:
      'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Spain',
    code: 'ES',
    flag: 'https://flagcdn.com/w80/es.png',
    image:
      'https://images.unsplash.com/photo-1507501336603-6e31b3d4d1f8?auto=format&fit=crop&w=1200&q=80',
  },
];

const currencyRates: Record<Currency, number> = {
  USD: 1,
  EUR: 0.86,
  GBP: 0.74,
  AZN: 1.7,
};

const currencySymbols: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  AZN: '₼',
};

const journeyCosts: Record<
  Journey,
  {
    total: number;
    visa: number;
    accommodation: number;
    documents: number;
    insurance: number;
    other: number;
  }
> = {
  work: {
    total: 2850,
    visa: 300,
    accommodation: 850,
    documents: 300,
    insurance: 250,
    other: 1150,
  },
  study: {
    total: 4200,
    visa: 150,
    accommodation: 1500,
    documents: 450,
    insurance: 300,
    other: 1800,
  },
  vocational: {
    total: 3100,
    visa: 250,
    accommodation: 900,
    documents: 350,
    insurance: 250,
    other: 1350,
  },
  business: {
    total: 5200,
    visa: 400,
    accommodation: 1000,
    documents: 600,
    insurance: 300,
    other: 2900,
  },
  family: {
    total: 2400,
    visa: 200,
    accommodation: 750,
    documents: 350,
    insurance: 250,
    other: 850,
  },
  relocation: {
    total: 3350,
    visa: 300,
    accommodation: 1000,
    documents: 400,
    insurance: 250,
    other: 1400,
  },
};

const flightPrices: Record<string, number> = {
  DE: 320,
  IT: 285,
  GB: 390,
  CA: 640,
  AU: 920,
  CH: 350,
  NL: 360,
  ES: 330,
};

const requirementsByJourney: Record<Journey, string[]> = {
  work: [
    'Valid passport',
    'Employment contract or job offer',
    'Proof of qualifications',
    'Proof of professional experience',
    'Proof of accommodation',
    'Health insurance',
    'Proof of sufficient funds',
    'Visa application form',
  ],
  study: [
    'Valid passport',
    'University or school admission',
    'Proof of education',
    'Proof of sufficient funds',
    'Health insurance',
    'Proof of accommodation',
    'Visa application form',
    'Academic documents',
  ],
  vocational: [
    'Valid passport',
    'Vocational training agreement',
    'Proof of education',
    'Language certificate',
    'Proof of accommodation',
    'Health insurance',
    'Proof of sufficient funds',
    'Visa application form',
  ],
  business: [
    'Valid passport',
    'Business plan',
    'Proof of business activity',
    'Proof of sufficient funds',
    'Business registration documents',
    'Health insurance',
    'Proof of accommodation',
    'Visa application form',
  ],
  family: [
    'Valid passport',
    'Proof of family relationship',
    'Sponsor documents',
    'Proof of accommodation',
    'Proof of sufficient funds',
    'Health insurance',
    'Civil status documents',
    'Visa application form',
  ],
  relocation: [
    'Valid passport',
    'Proof of relocation purpose',
    'Proof of accommodation',
    'Proof of sufficient funds',
    'Health insurance',
    'Civil status documents',
    'Background documents',
    'Visa application form',
  ],
};

const resultData: Record<
  Journey,
  Record<ResultTab, ResultItem[]>
> = {
  work: {
    best: [
      {
        title: 'Sponsored job opportunity',
        subtitle: 'Software Engineer · Berlin',
        description:
          'Placeholder for a verified job with potential visa sponsorship.',
        price: '€58k+ / year',
        tag: 'Best match',
      },
      {
        title: 'Skilled worker opportunity',
        subtitle: 'Engineering · Munich',
        description:
          'Placeholder sponsored employment opportunity.',
        price: '€54k+ / year',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'Entry level sponsored role',
        subtitle: 'Operations · Germany',
        description:
          'Placeholder for a lower cost pathway into employment.',
        price: '€42k+ / year',
        tag: 'Lower cost',
      },
      {
        title: 'Junior specialist role',
        subtitle: 'Technology · Hamburg',
        description:
          'Placeholder employment listing.',
        price: '€40k+ / year',
        tag: 'Budget',
      },
    ],
    suggested: [
      {
        title: 'EU Blue Card pathway',
        subtitle: 'Germany',
        description:
          'Placeholder pathway matched to your profile.',
        price: 'From €300',
        tag: 'Suggested',
      },
      {
        title: 'Skilled worker pathway',
        subtitle: 'Germany',
        description:
          'Placeholder immigration pathway.',
        price: 'From €250',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Sponsored Software Engineer',
        subtitle: 'Berlin · Full time',
        description:
          'Placeholder sponsored job from a verified employer.',
        price: '€60k+ / year',
        tag: 'Sponsored',
      },
      {
        title: 'Sponsored Product Designer',
        subtitle: 'Munich · Full time',
        description:
          'Placeholder sponsored opportunity.',
        price: '€55k+ / year',
        tag: 'Sponsored',
      },
    ],
  },

  study: {
    best: [
      {
        title: 'Top university option',
        subtitle: 'Business & Management',
        description:
          'Placeholder university matched to your destination.',
        price: 'From €8,500 / year',
        tag: 'Best match',
      },
      {
        title: 'International study program',
        subtitle: 'Computer Science',
        description:
          'Placeholder study opportunity.',
        price: 'From €9,200 / year',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'Affordable university program',
        subtitle: 'Germany',
        description:
          'Placeholder lower cost study option.',
        price: 'From €2,500 / year',
        tag: 'Lower cost',
      },
      {
        title: 'Public university pathway',
        subtitle: 'Multiple cities',
        description:
          'Placeholder affordable education option.',
        price: 'From €1,800 / year',
        tag: 'Budget',
      },
    ],
    suggested: [
      {
        title: 'University application pathway',
        subtitle: 'Germany',
        description:
          'Placeholder service for finding suitable programs.',
        price: 'From €150',
        tag: 'Suggested',
      },
      {
        title: 'Student visa pathway',
        subtitle: 'Germany',
        description:
          'Placeholder student immigration pathway.',
        price: 'From €150',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Scholarship opportunity',
        subtitle: 'International students',
        description:
          'Placeholder scholarship listing.',
        price: 'Up to €5,000',
        tag: 'Sponsored',
      },
      {
        title: 'Partner university',
        subtitle: 'Study program',
        description:
          'Placeholder promoted education provider.',
        price: 'View program',
        tag: 'Sponsored',
      },
    ],
  },

  vocational: {
    best: [
      {
        title: 'Vocational training program',
        subtitle: 'Germany',
        description:
          'Placeholder Ausbildung opportunity.',
        price: 'Paid training',
        tag: 'Best match',
      },
      {
        title: 'Technical training',
        subtitle: 'Munich',
        description:
          'Placeholder vocational program.',
        price: 'Paid training',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'Low cost vocational pathway',
        subtitle: 'Germany',
        description:
          'Placeholder affordable training route.',
        price: 'From €300',
        tag: 'Lower cost',
      },
      {
        title: 'Employer training program',
        subtitle: 'Multiple cities',
        description:
          'Placeholder employer sponsored training.',
        price: 'Potentially free',
        tag: 'Budget',
      },
    ],
    suggested: [
      {
        title: 'Ausbildung pathway',
        subtitle: 'Germany',
        description:
          'Placeholder pathway matching service.',
        price: 'From €200',
        tag: 'Suggested',
      },
      {
        title: 'Language + training pathway',
        subtitle: 'Germany',
        description:
          'Placeholder combined pathway.',
        price: 'From €800',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Sponsored Ausbildung',
        subtitle: 'German employer',
        description:
          'Placeholder employer sponsored training.',
        price: 'Salary included',
        tag: 'Sponsored',
      },
    ],
  },

  business: {
    best: [
      {
        title: 'Business relocation pathway',
        subtitle: 'Germany',
        description:
          'Placeholder business immigration route.',
        price: 'From €400',
        tag: 'Best match',
      },
      {
        title: 'Entrepreneur pathway',
        subtitle: 'Berlin',
        description:
          'Placeholder business establishment option.',
        price: 'From €2,000',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'Freelancer pathway',
        subtitle: 'Germany',
        description:
          'Placeholder self employment route.',
        price: 'From €300',
        tag: 'Lower cost',
      },
      {
        title: 'Small business route',
        subtitle: 'Germany',
        description:
          'Placeholder lower investment pathway.',
        price: 'From €1,000',
        tag: 'Budget',
      },
    ],
    suggested: [
      {
        title: 'Business visa pathway',
        subtitle: 'Germany',
        description:
          'Placeholder business visa route.',
        price: 'From €400',
        tag: 'Suggested',
      },
      {
        title: 'Company formation',
        subtitle: 'Germany',
        description:
          'Placeholder company setup service.',
        price: 'From €1,500',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Business relocation provider',
        subtitle: 'Berlin',
        description:
          'Placeholder promoted business provider.',
        price: 'View provider',
        tag: 'Sponsored',
      },
    ],
  },

  family: {
    best: [
      {
        title: 'Family reunification',
        subtitle: 'Germany',
        description:
          'Placeholder family reunification pathway.',
        price: 'From €200',
        tag: 'Best match',
      },
      {
        title: 'Family residence pathway',
        subtitle: 'Germany',
        description:
          'Placeholder family residence route.',
        price: 'From €250',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'Family visa pathway',
        subtitle: 'Germany',
        description:
          'Placeholder lower cost family pathway.',
        price: 'From €200',
        tag: 'Lower cost',
      },
    ],
    suggested: [
      {
        title: 'Family immigration support',
        subtitle: 'Germany',
        description:
          'Placeholder professional assistance.',
        price: 'From €300',
        tag: 'Suggested',
      },
      {
        title: 'Document preparation',
        subtitle: 'Germany',
        description:
          'Placeholder document service.',
        price: 'From €100',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Family relocation specialist',
        subtitle: 'Germany',
        description:
          'Placeholder promoted immigration provider.',
        price: 'View provider',
        tag: 'Sponsored',
      },
    ],
  },

  relocation: {
    best: [
      {
        title: 'Full relocation package',
        subtitle: 'Germany',
        description:
          'Placeholder complete relocation service.',
        price: 'From €1,500',
        tag: 'Best match',
      },
      {
        title: 'Relocation support',
        subtitle: 'Berlin',
        description:
          'Placeholder relocation provider.',
        price: 'From €900',
        tag: 'Recommended',
      },
    ],
    cheapest: [
      {
        title: 'DIY relocation package',
        subtitle: 'Germany',
        description:
          'Placeholder self service relocation option.',
        price: 'From €250',
        tag: 'Lower cost',
      },
      {
        title: 'Essential relocation support',
        subtitle: 'Germany',
        description:
          'Placeholder basic package.',
        price: 'From €500',
        tag: 'Budget',
      },
    ],
    suggested: [
      {
        title: 'Relocation consultant',
        subtitle: 'Germany',
        description:
          'Placeholder professional relocation service.',
        price: 'From €150',
        tag: 'Suggested',
      },
      {
        title: 'Housing + registration',
        subtitle: 'Germany',
        description:
          'Placeholder arrival support.',
        price: 'From €400',
        tag: 'Suggested',
      },
    ],
    sponsored: [
      {
        title: 'Premium relocation provider',
        subtitle: 'Germany',
        description:
          'Placeholder promoted relocation company.',
        price: 'View provider',
        tag: 'Sponsored',
      },
    ],
  },
};

function GlobeIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <Globe2Icon className={className} />
  );
}

function Globe2Icon({
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
  onChange,
  availableCountries,
}: {
  label: string;
  country: Country;
  onChange: (country: Country) => void;
  availableCountries: Country[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[82px] w-full items-center gap-3 px-5 text-left transition hover:bg-ink-50"
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

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-400 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close country selector"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />

          <div className="absolute left-2 right-2 top-[86px] z-50 max-h-72 overflow-auto border border-ink-200 bg-white p-2 shadow-xl">
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

export function LandingHero({
  go,
}: LandingHeroProps) {
  const [fromCountry, setFromCountry] =
    useState<Country>(
      countries.find(
        (country) => country.code === 'AZ'
      ) ?? countries[0]
    );

  const [toCountry, setToCountry] =
    useState<Country>(
      countries.find(
        (country) => country.code === 'DE'
      ) ?? countries[1]
    );

  const [activeJourney, setActiveJourney] =
    useState<Journey>('work');

  const [activeService, setActiveService] =
    useState<Service>('visa');

  const [activeTab, setActiveTab] =
    useState<ResultTab>('best');

  const [currency, setCurrency] =
    useState<Currency>('USD');

  const [showRequirements, setShowRequirements] =
    useState(false);

  const [showExtraCosts, setShowExtraCosts] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [flightDate, setFlightDate] =
    useState('2026-09-15');

  const [flightPrice, setFlightPrice] =
    useState(320);

  const requirements =
    requirementsByJourney[activeJourney];

  const costs =
    journeyCosts[activeJourney];

  const convertedTotal = Math.round(
    costs.total * currencyRates[currency]
  );

  const convertedFlight = Math.round(
    flightPrice * currencyRates[currency]
  );

  const resultItems =
    resultData[activeJourney][activeTab];

  const selectedJourneyLabel =
    journeys.find(
      (journey) => journey.id === activeJourney
    )?.label ?? 'Work';

  const flightBasePrice =
    flightPrices[toCountry.code] ?? 350;

  useEffect(() => {
    setLoading(true);
    setActiveTab('best');

    const timer = window.setTimeout(() => {
      setFlightPrice(flightBasePrice);
      setLoading(false);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    fromCountry.code,
    toCountry.code,
    activeJourney,
    activeService,
    flightBasePrice,
  ]);

  const extraCosts = useMemo(
    () => [
      {
        label: 'Visa / application',
        value: costs.visa,
      },
      {
        label: 'Accommodation',
        value: costs.accommodation,
      },
      {
        label: 'Documents',
        value: costs.documents,
      },
      {
        label: 'Insurance',
        value: costs.insurance,
      },
      {
        label: 'Other estimated costs',
        value: costs.other,
      },
    ],
    [costs]
  );

  const handleJourneyChange = (
    journey: Journey
  ) => {
    setActiveJourney(journey);
    setShowRequirements(false);
    setShowExtraCosts(false);
  };

  const handleServiceChange = (
    service: Service
  ) => {
    setActiveService(service);
    setShowRequirements(false);
    setShowExtraCosts(false);
  };

  return (
    <main className="bg-white">

      {/* HERO */}

      <section className="bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 pb-28 pt-10 sm:px-8 sm:pb-32 sm:pt-12">

          {/* SERVICE NAV */}

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
                    handleServiceChange(service.id)
                  }
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'border-white bg-white text-brand-700'
                      : 'border-white/35 text-white hover:border-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {service.label}
                </button>
              );
            })}

          </div>

          {/* HERO TITLE */}

          <div className="mt-14 max-w-4xl">

            <div className="flex items-center gap-2 text-sm font-medium text-white/70">
              <Sparkles className="h-4 w-4" />
              Your journey starts here
            </div>

            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Compare pathways, opportunities, flights,
              accommodation and professional support for
              your move.
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
                    handleJourneyChange(journey.id)
                  }
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/25 text-white/70 hover:border-white/50 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                </button>
              );
            })}

          </div>

        </div>

      </section>

      {/* SEARCH AND RESULTS */}

      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-5 sm:px-8">

        <div className="border border-ink-200 bg-white shadow-xl">

          {/* SELECTED JOURNEY AND COST */}

          <div className="border-b border-ink-100 px-5 py-5 sm:px-6">

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="flex flex-wrap items-center gap-3">

                  <h2 className="text-xl font-bold text-ink-950">
                    {selectedJourneyLabel}
                  </h2>

                  <span className="hidden h-5 w-px bg-ink-200 sm:block" />

                  <span className="text-sm font-semibold text-ink-500">
                    Approximate costs
                  </span>

                </div>

                <p className="mt-1 text-xs text-ink-400">
                  Estimated for a {selectedJourneyLabel.toLowerCase()} journey from{' '}
                  {fromCountry.name} to {toCountry.name}.
                </p>

              </div>

              <div className="flex flex-wrap items-center gap-3">

                <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2.5">

                  <Calculator className="h-4 w-4 text-brand-600" />

                  <span className="text-lg font-bold text-brand-700">
                    {currencySymbols[currency]}
                    {convertedTotal.toLocaleString()}
                  </span>

                  <span className="text-xs text-brand-600">
                    approx.
                  </span>

                </div>

                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(
                      event.target.value as Currency
                    )
                  }
                  className="h-10 rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 outline-none focus:border-brand-500"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AZN">AZN</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setShowExtraCosts(
                      (value) => !value
                    )
                  }
                  className="flex h-10 items-center gap-2 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50"
                >
                  <Info className="h-4 w-4" />
                  Extra costs
                  <ChevronDown
                    className={`h-4 w-4 transition ${
                      showExtraCosts
                        ? 'rotate-180'
                        : ''
                    }`}
                  />
                </button>

              </div>

            </div>

            {showExtraCosts && (
              <div className="mt-5 grid gap-2 border-t border-ink-100 pt-5 sm:grid-cols-2 lg:grid-cols-5">

                {extraCosts.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-ink-100 bg-ink-50/50 p-3"
                  >
                    <p className="text-xs text-ink-400">
                      {item.label}
                    </p>

                    <p className="mt-1 text-sm font-bold text-ink-900">
                      {currencySymbols[currency]}
                      {Math.round(
                        item.value *
                          currencyRates[currency]
                      ).toLocaleString()}
                    </p>

                  </div>
                ))}

              </div>
            )}

          </div>

          {/* COUNTRY PAIR */}

          <div className="grid lg:grid-cols-[1fr_1fr_1fr_auto]">

            <CountrySelector
              label="I'm from"
              country={fromCountry}
              countries={countries}
              availableCountries={countries}
              onChange={setFromCountry}
            />

            <div className="border-t border-ink-100 lg:border-l lg:border-t-0">

              <CountrySelector
                label="I want to go to"
                country={toCountry}
                countries={countries}
                availableCountries={countries.filter(
                  (country) =>
                    country.code !==
                    fromCountry.code
                )}
                onChange={setToCountry}
              />

            </div>

            <div className="border-t border-ink-100 lg:border-l lg:border-t-0">

              <div className="relative">

                <select
                  value={activeJourney}
                  onChange={(event) =>
                    handleJourneyChange(
                      event.target.value as Journey
                    )
                  }
                  className="min-h-[82px] w-full appearance-none bg-white px-5 pr-10 pt-5 text-sm font-semibold text-ink-900 outline-none transition hover:bg-ink-50"
                >
                  {journeys.map((journey) => (
                    <option
                      key={journey.id}
                      value={journey.id}
                    >
                      {journey.label}
                    </option>
                  ))}
                </select>

                <div className="pointer-events-none absolute right-5 top-1/2 mt-2 -translate-y-1/2">
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                </div>

                <div className="pointer-events-none absolute left-5 top-3 text-xs font-medium text-ink-400">
                  I'm looking to
                </div>

              </div>

            </div>

            <button
              type="button"
              onClick={() => {
                setLoading(true);

                window.setTimeout(() => {
                  setLoading(false);
                }, 700);
              }}
              className="m-2 flex min-h-[74px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}

              Search
            </button>

          </div>

          {/* FLIGHT ESTIMATE */}

          <div className="border-t border-ink-100 bg-ink-50/40 px-5 py-5 sm:px-6">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-start gap-3">

                <div className="rounded-lg bg-white p-2.5 shadow-sm">
                  <Plane className="h-5 w-5 text-brand-600" />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    Flight estimate
                  </p>

                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    Cheapest nearby flight
                  </p>

                  <p className="mt-1 text-xs text-ink-500">
                    {fromCountry.name} → {toCountry.name}
                  </p>
                </div>

              </div>

              <div className="flex flex-wrap items-center gap-3">

                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">

                  <CalendarDays className="h-4 w-4 text-ink-400" />

                  <input
                    type="date"
                    value={flightDate}
                    onChange={(event) => {
                      setFlightDate(
                        event.target.value
                      );
                      setLoading(true);

                      window.setTimeout(() => {
                        setLoading(false);
                      }, 500);
                    }}
                    className="bg-transparent text-xs font-semibold text-ink-700 outline-none"
                  />

                </div>

                <div className="flex items-center gap-2">

                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  ) : (
                    <Plane className="h-4 w-4 text-brand-600" />
                  )}

                  <span className="text-lg font-bold text-ink-950">
                    {currencySymbols[currency]}
                    {convertedFlight.toLocaleString()}
                  </span>

                  <span className="text-xs text-ink-400">
                    approx.
                  </span>

                </div>

              </div>

            </div>

          </div>

          {/* REQUIREMENTS */}

          <div className="border-t border-ink-100">

            <button
              type="button"
              onClick={() =>
                setShowRequirements(
                  (value) => !value
                )
              }
              className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-ink-50 sm:px-6"
            >

              <div className="flex items-center gap-3">

                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                  {requirements.length}
                </div>

                <div>
                  <p className="text-sm font-bold text-ink-900">
                    Requirements
                  </p>

                  <p className="text-xs text-ink-400">
                    {fromCountry.name} → {toCountry.name} ·{' '}
                    {selectedJourneyLabel}
                  </p>
                </div>

              </div>

              <ChevronDown
                className={`h-5 w-5 text-ink-400 transition ${
                  showRequirements
                    ? 'rotate-180'
                    : ''
                }`}
              />

            </button>

            {showRequirements && (
              <div className="border-t border-ink-100 bg-white px-5 py-5 sm:px-6">

                {loading ? (
                  <div className="flex items-center gap-2 py-5 text-sm text-ink-500">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                    Updating requirements...
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">

                    {requirements.map(
                      (requirement, index) => (
                        <div
                          key={requirement}
                          className="flex items-center gap-3 rounded-lg border border-ink-100 px-4 py-3"
                        >

                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                            {index + 1}
                          </span>

                          <span className="text-sm font-medium text-ink-800">
                            {requirement}
                          </span>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>
            )}

          </div>

          {/* DYNAMIC RESULTS */}

          <div className="border-t border-ink-100">

            <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {selectedJourneyLabel}
                </p>

                <h3 className="mt-1 text-lg font-bold text-ink-950">
                  Best options for your journey
                </h3>

              </div>

              <div className="flex flex-wrap gap-2">

                {(
                  [
                    ['best', 'Best options'],
                    ['cheapest', 'Cheapest'],
                    ['suggested', 'Suggested'],
                    ['sponsored', 'Sponsored'],
                  ] as [ResultTab, string][]
                ).map(([tab, label]) => {

                  const active =
                    activeTab === tab;

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() =>
                        setActiveTab(tab)
                      }
                      className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${
                        active
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}

              </div>

            </div>

            <div className="border-t border-ink-100">

              {loading ? (
                <div className="flex min-h-[220px] items-center justify-center">

                  <div className="flex items-center gap-2 text-sm text-ink-500">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                    Finding options for your journey...
                  </div>

                </div>
              ) : (
                <div className="grid gap-3 p-5 sm:p-6">

                  {resultItems.map(
                    (item, index) => (
                      <button
                        key={`${item.title}-${index}`}
                        type="button"
                        onClick={() => {
                          setLoading(true);

                          window.setTimeout(() => {
                            setLoading(false);
                          }, 500);
                        }}
                        className="group flex flex-col gap-4 rounded-xl border border-ink-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >

                        <div className="flex items-start gap-4">

                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                            {activeJourney === 'study' ? (
                              <GraduationCap className="h-5 w-5 text-brand-600" />
                            ) : activeJourney === 'business' ? (
                              <Briefcase className="h-5 w-5 text-brand-600" />
                            ) : activeJourney === 'relocation' ? (
                              <Home className="h-5 w-5 text-brand-600" />
                            ) : (
                              <Briefcase className="h-5 w-5 text-brand-600" />
                            )}
                          </div>

                          <div>

                            <div className="flex flex-wrap items-center gap-2">

                              <h4 className="text-sm font-bold text-ink-900">
                                {item.title}
                              </h4>

                              <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-600">
                                {item.tag}
                              </span>

                            </div>

                            <p className="mt-1 text-xs font-medium text-ink-500">
                              {item.subtitle}
                            </p>

                            <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-400">
                              {item.description}
                            </p>

                          </div>

                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-5 sm:flex-col sm:items-end">

                          <span className="text-sm font-bold text-ink-900">
                            {item.price}
                          </span>

                          <span className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                            View option
                            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                          </span>

                        </div>

                      </button>
                    )
                  )}

                </div>
              )}

            </div>

          </div>

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
              Where do you want to go?
            </h2>

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

          {countries
            .filter(
              (country) =>
                country.code !== 'AZ'
            )
            .map((country) => {

              const selected =
                toCountry.code === country.code;

              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    setToCountry(country);
                    setShowRequirements(false);

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