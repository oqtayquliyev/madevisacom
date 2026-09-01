import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  Globe2,
  GraduationCap,
  Heart,
  Home,
  Loader2,
  Plane,
  Search,
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

type Country = {
  name: string;
  code: string;
  flag: string;
  image: string;
};

const services: {
  id: Service;
  label: string;
  icon: typeof Plane;
}[] = [
  {
    id: 'visa',
    label: 'Visa & pathways',
    icon: Globe2,
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

const costEstimates: Record<Journey, number> = {
  work: 2850,
  study: 4200,
  vocational: 3100,
  business: 5200,
  family: 2400,
  relocation: 3350,
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
    'University or school admission letter',
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
    'Proof of purpose of relocation',
    'Proof of accommodation',
    'Proof of sufficient funds',
    'Health insurance',
    'Civil status documents',
    'Background documents',
    'Visa application form',
  ],
};

function getCountry(name: string) {
  return countries.find((country) => country.name === name);
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

function SearchCountryButton({
  label,
  country,
  countries: availableCountries,
  onChange,
}: {
  label: string;
  country: Country;
  countries: Country[];
  onChange: (country: Country) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[82px] w-full items-center gap-3 px-5 text-left transition hover:bg-ink-50"
      >
        <CountryFlag country={country} size="h-6 w-9" />

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

          <div className="absolute left-2 right-2 top-[86px] z-40 max-h-72 overflow-auto border border-ink-200 bg-white p-2 shadow-xl">
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

export function LandingHero({ go }: LandingHeroProps) {
  const [fromCountry, setFromCountry] = useState<Country>(
    countries.find((country) => country.code === 'AZ') ??
      countries[0]
  );

  const [toCountry, setToCountry] = useState<Country>(
    countries.find((country) => country.code === 'DE') ??
      countries[0]
  );

  const [activeJourney, setActiveJourney] =
    useState<Journey>('work');

  const [activeService, setActiveService] =
    useState<Service>('visa');

  const [currency, setCurrency] =
    useState<Currency>('USD');

  const [showRequirements, setShowRequirements] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const requirements = useMemo(
    () => requirementsByJourney[activeJourney],
    [activeJourney]
  );

  const baseCost = costEstimates[activeJourney];

  const convertedCost = Math.round(
    baseCost * currencyRates[currency]
  );

  useEffect(() => {
    setLoading(true);

    const timer = window.setTimeout(() => {
      setLoading(false);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [fromCountry.code, toCountry.code, activeJourney]);

  const handleJourneyChange = (journey: Journey) => {
    setActiveJourney(journey);
    setShowRequirements(false);
  };

  const handleServiceChange = (service: Service) => {
    setActiveService(service);
    setShowRequirements(false);
  };

  return (
    <main className="bg-white">

      {/* HERO */}

      <section className="bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 pb-24 pt-10 sm:px-8 sm:pb-28 sm:pt-12">

          {/* SERVICES */}

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

          {/* HERO CONTENT */}

          <div className="mt-14 max-w-4xl">

            <p className="text-sm font-medium text-white/70">
              {activeService === 'visa'
                ? 'Visa & relocation'
                : services.find(
                    (service) =>
                      service.id === activeService
                  )?.label}
            </p>

            <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Choose where you are coming from, where you want
              to go and what you want to do there.
            </p>

          </div>

          {/* JOURNEY */}

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

      {/* SEARCH AREA */}

      <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-5 sm:px-8">

        <div className="border border-ink-200 bg-white shadow-xl">

          {/* COST AND REQUIREMENTS */}

          <div className="flex flex-col gap-4 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">

            <div className="flex items-center gap-6">

              <div>
                <p className="text-xs font-medium text-ink-400">
                  Approximate cost
                </p>

                <div className="mt-1 flex items-center gap-2">

                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  ) : (
                    <Calculator className="h-4 w-4 text-brand-600" />
                  )}

                  <span className="text-xl font-bold text-ink-950">
                    {currencySymbols[currency]}
                    {convertedCost.toLocaleString()}
                  </span>

                  <span className="text-xs text-ink-400">
                    estimated
                  </span>

                </div>
              </div>

              {/* CURRENCY */}

              <select
                value={currency}
                onChange={(event) =>
                  setCurrency(
                    event.target.value as Currency
                  )
                }
                className="h-9 rounded-md border border-ink-200 bg-white px-2 text-xs font-semibold text-ink-700 outline-none focus:border-brand-500"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AZN">AZN</option>
              </select>

            </div>

            <button
              type="button"
              onClick={() =>
                setShowRequirements(
                  (value) => !value
                )
              }
              className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                showRequirements
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              <FileCheck2 className="h-4 w-4" />

              Requirements

              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                {requirements.length}
              </span>

              <ChevronDown
                className={`h-4 w-4 transition ${
                  showRequirements ? 'rotate-180' : ''
                }`}
              />
            </button>

          </div>

          {/* COUNTRY PAIR */}

          <div className="grid lg:grid-cols-[1fr_1fr_1fr_auto]">

            <SearchCountryButton
              label="I'm from"
              country={fromCountry}
              countries={countries}
              onChange={setFromCountry}
            />

            <SearchCountryButton
              label="I want to go to"
              country={toCountry}
              countries={countries}
              onChange={setToCountry}
            />

            {/* JOURNEY */}

            <div className="border-t border-ink-100 lg:border-l lg:border-t-0">

              <div className="relative">

                <select
                  value={activeJourney}
                  onChange={(event) =>
                    handleJourneyChange(
                      event.target.value as Journey
                    )
                  }
                  className="min-h-[82px] w-full appearance-none bg-white px-5 pr-10 text-sm font-semibold text-ink-900 outline-none transition hover:bg-ink-50"
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

                <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2">
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                </div>

                <div className="pointer-events-none absolute left-5 top-3 text-xs font-medium text-ink-400">
                  I'm looking to
                </div>

              </div>

            </div>

            {/* SEARCH BUTTON */}

            <button
              type="button"
              onClick={() => {
                setLoading(true);

                window.setTimeout(() => {
                  setLoading(false);
                }, 650);
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

          {/* REQUIREMENTS */}

          {showRequirements && (
            <div className="border-t border-ink-100 bg-ink-50/50 px-5 py-6 sm:px-6">

              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {fromCountry.name} → {toCountry.name}
                  </p>

                  <h2 className="mt-1 text-lg font-bold text-ink-950">
                    {requirements.length} requirements for{' '}
                    {activeJourney}
                  </h2>

                  <p className="mt-1 text-sm text-ink-500">
                    Approximate requirements based on your
                    current selections.
                  </p>
                </div>

                {loading && (
                  <div className="flex items-center gap-2 text-xs font-medium text-brand-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating information
                  </div>
                )}

              </div>

              {!loading && (
                <div className="mt-6 grid gap-2 sm:grid-cols-2">

                  {requirements.map(
                    (requirement, index) => (
                      <div
                        key={requirement}
                        className="flex items-center gap-3 border border-ink-100 bg-white px-4 py-3"
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

      </section>

      {/* COUNTRIES */}

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8">

        <div className="flex items-end justify-between gap-4">

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Destinations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Choose your destination
            </h2>
          </div>

          <button
            type="button"
            onClick={() => go('explore')}
            className="hidden items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 sm:flex"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </button>

        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">

          {countries.map((country) => {
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

                {/* BACKGROUND IMAGE */}

                <img
                  src={country.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />

                {/* GRADIENT */}

                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/5" />

                {/* COUNTRY CONTENT */}

                <div className="absolute inset-x-0 bottom-0 p-4">

                  <div className="flex items-center gap-2">

                    <CountryFlag
                      country={country}
                      size="h-5 w-7"
                    />

                    <span className="text-sm font-bold text-white">
                      {country.name}
                    </span>

                  </div>

                  <div className="mt-2 flex items-center gap-1.5 text-xs text-white/70">
                    Explore pathways
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
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