import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Heart,
  Home,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Briefcase,
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

type Tool =
  | 'calculator'
  | 'requirements'
  | null;

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

const countries = [
  {
    name: 'Germany',
    code: 'DE',
    description: 'Work, study and relocation',
  },
  {
    name: 'Italy',
    code: 'IT',
    description: 'Study, work and lifestyle',
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    description: 'Work, study and family',
  },
  {
    name: 'Canada',
    code: 'CA',
    description: 'Immigration and study',
  },
  {
    name: 'Australia',
    code: 'AU',
    description: 'Work and study pathways',
  },
  {
    name: 'Switzerland',
    code: 'CH',
    description: 'Work and relocation',
  },
  {
    name: 'Netherlands',
    code: 'NL',
    description: 'Work, study and business',
  },
  {
    name: 'Spain',
    code: 'ES',
    description: 'Relocation and lifestyle',
  },
];

const serviceDescriptions: Record<Service, string> = {
  visa:
    'Explore visa pathways, eligibility requirements and trusted providers for your move.',
  flights:
    'Flight search will be available here. Compare routes, dates and prices in one place.',
  hotels:
    'Hotel search will be available here. Find accommodation near your destination.',
  airbnb:
    'Airbnb and short stay search will be available here for your arrival and relocation.',
  experts:
    'Find immigration lawyers, visa advisors, relocation specialists and other trusted experts.',
};

export function LandingHero({ go }: LandingHeroProps) {
  const [activeService, setActiveService] =
    useState<Service>('visa');

  const [activeJourney, setActiveJourney] =
    useState<Journey>('work');

  const [activeTool, setActiveTool] =
    useState<Tool>(null);

  const [selectedCountry, setSelectedCountry] =
    useState<string | null>(null);

  const handleServiceChange = (service: Service) => {
    setActiveService(service);
    setActiveTool(null);
  };

  const handleJourneyChange = (journey: Journey) => {
    setActiveJourney(journey);
    setActiveTool(null);
  };

  const handleSearch = () => {
    setActiveTool(null);
  };

  return (
    <main className="bg-white">

      {/* HERO */}

      <section className="relative overflow-hidden bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 pb-28 pt-12 sm:px-8 sm:pb-32 sm:pt-16">

          {/* SERVICE NAVIGATION */}

          <div className="flex flex-wrap items-center gap-2">

            {services.map((service) => {
              const Icon = service.icon;
              const isActive = activeService === service.id;

              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => handleServiceChange(service.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'border-white bg-white text-brand-700'
                      : 'border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {service.label}
                </button>
              );
            })}

          </div>

          {/* HERO COPY */}

          <div className="mt-16 max-w-3xl">

            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              Your journey starts here
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
              Explore visas, flights, accommodation, experts and everything
              you need to plan your move to another country.
            </p>

          </div>

          {/* JOURNEY TYPES */}

          <div className="mt-10 flex flex-wrap gap-2">

            {journeys.map((journey) => {
              const Icon = journey.icon;
              const isActive = activeJourney === journey.id;

              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => handleJourneyChange(journey.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    isActive
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/25 text-white/75 hover:border-white/50 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {journey.label}
                </button>
              );
            })}

          </div>

        </div>

        {/* SEARCH PANEL */}

        <div className="absolute bottom-0 left-1/2 w-full max-w-6xl -translate-x-1/2 translate-y-1/2 px-5 sm:px-8">

          <div className="border border-ink-200 bg-white p-2 shadow-xl">

            <div className="grid lg:grid-cols-[1fr_1fr_1fr_auto]">

              {/* DESTINATION */}

              <button
                type="button"
                onClick={() => setSelectedCountry(null)}
                className="flex min-h-20 items-center gap-3 border-b border-ink-100 px-5 text-left transition hover:bg-ink-50 lg:border-b-0 lg:border-r"
              >
                <div className="rounded-lg bg-brand-50 p-2.5">
                  <Globe2 className="h-5 w-5 text-brand-600" />
                </div>

                <div>
                  <p className="text-xs font-medium text-ink-400">
                    Destination
                  </p>

                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {selectedCountry ?? 'Choose a country'}
                  </p>
                </div>
              </button>

              {/* JOURNEY */}

              <button
                type="button"
                onClick={() => {
                  setActiveService('visa');
                  setActiveTool(null);
                }}
                className="flex min-h-20 items-center gap-3 border-b border-ink-100 px-5 text-left transition hover:bg-ink-50 lg:border-b-0 lg:border-r"
              >
                <div className="rounded-lg bg-brand-50 p-2.5">
                  <Briefcase className="h-5 w-5 text-brand-600" />
                </div>

                <div>
                  <p className="text-xs font-medium text-ink-400">
                    I'm looking to
                  </p>

                  <p className="mt-1 text-sm font-semibold capitalize text-ink-900">
                    {activeJourney}
                  </p>
                </div>
              </button>

              {/* SERVICE */}

              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="flex min-h-20 items-center gap-3 border-b border-ink-100 px-5 text-left transition hover:bg-ink-50 lg:border-b-0 lg:border-r"
              >
                <div className="rounded-lg bg-brand-50 p-2.5">
                  {(() => {
                    const Icon =
                      services.find(
                        (service) => service.id === activeService
                      )?.icon ?? Globe2;

                    return (
                      <Icon className="h-5 w-5 text-brand-600" />
                    );
                  })()}
                </div>

                <div>
                  <p className="text-xs font-medium text-ink-400">
                    I need
                  </p>

                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {services.find(
                      (service) => service.id === activeService
                    )?.label}
                  </p>
                </div>
              </button>

              {/* SEARCH */}

              <button
                type="button"
                onClick={handleSearch}
                className="m-1 flex min-h-16 items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Search className="h-4 w-4" />
                Search
              </button>

            </div>

          </div>

        </div>

      </section>

      {/* TOOL BAR */}

      <section className="border-b border-ink-100 bg-white pt-20">

        <div className="mx-auto max-w-6xl px-5 sm:px-8">

          <div className="flex flex-wrap items-center justify-between gap-4">

            <div>
              <p className="text-sm font-semibold text-ink-900">
                Plan your move
              </p>

              <p className="mt-1 text-xs text-ink-400">
                Useful tools to help you understand the journey.
              </p>
            </div>

            <div className="flex gap-2">

              <button
                type="button"
                onClick={() =>
                  setActiveTool(
                    activeTool === 'calculator'
                      ? null
                      : 'calculator'
                  )
                }
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  activeTool === 'calculator'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                <Calculator className="h-4 w-4" />
                Cost calculator
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveTool(
                    activeTool === 'requirements'
                      ? null
                      : 'requirements'
                  )
                }
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  activeTool === 'requirements'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Requirements
              </button>

            </div>

          </div>

          {/* TOOL PLACEHOLDER */}

          {activeTool && (
            <div className="mt-5 border border-brand-100 bg-brand-50/50 p-6">

              {activeTool === 'calculator' ? (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <div className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-brand-600" />

                      <h3 className="font-semibold text-ink-900">
                        Moving cost calculator
                      </h3>
                    </div>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">
                      Calculator placeholder. This will estimate visa,
                      application, flight, accommodation and relocation
                      costs based on your selected destination.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Start calculator
                  </button>

                </div>
              ) : (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-brand-600" />

                      <h3 className="font-semibold text-ink-900">
                        Visa requirements
                      </h3>
                    </div>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">
                      Requirements placeholder. This area will show
                      documents, eligibility criteria, application steps
                      and other requirements for your selected destination.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Check requirements
                  </button>

                </div>
              )}

            </div>
          )}

        </div>

      </section>

      {/* ACTIVE SERVICE PLACEHOLDER */}

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">

        <div className="border border-ink-100 bg-white p-6 shadow-soft-lg sm:p-8">

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-start gap-4">

              <div className="rounded-xl bg-brand-50 p-3">
                <ShieldCheck className="h-6 w-6 text-brand-600" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {services.find(
                    (service) => service.id === activeService
                  )?.label}
                </p>

                <h2 className="mt-1 text-xl font-bold text-ink-900">
                  {serviceDescriptions[activeService]}
                </h2>

                <p className="mt-2 text-sm leading-6 text-ink-500">
                  This feature is currently a placeholder and will become
                  a full searchable experience.
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={() => setActiveTool('requirements')}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-ink-200 px-5 py-3 text-sm font-semibold text-ink-800 transition hover:border-brand-300 hover:bg-brand-50"
            >
              Explore
              <ArrowRight className="h-4 w-4" />
            </button>

          </div>

        </div>

      </section>

      {/* COUNTRIES */}

      <section className="border-t border-ink-100 bg-ink-50/40">

        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Explore destinations
              </p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">
                Where do you want to go?
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">
                Choose a destination to explore available pathways,
                services and opportunities.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveService('visa')}
              className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              View all countries
              <ArrowRight className="h-4 w-4" />
            </button>

          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {countries.map((country) => {
              const isSelected =
                selectedCountry === country.name;

              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() =>
                    setSelectedCountry(country.name)
                  }
                  className={`group border bg-white p-5 text-left transition ${
                    isSelected
                      ? 'border-brand-500 shadow-md'
                      : 'border-ink-100 hover:border-brand-300 hover:shadow-sm'
                  }`}
                >

                  <div className="flex items-start justify-between">

                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-600">
                      {country.code}
                    </div>

                    <ArrowRight
                      className={`h-4 w-4 transition ${
                        isSelected
                          ? 'text-brand-600'
                          : 'text-ink-300 group-hover:text-brand-600'
                      }`}
                    />

                  </div>

                  <h3 className="mt-5 font-semibold text-ink-900">
                    {country.name}
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-ink-500">
                    {country.description}
                  </p>

                </button>
              );
            })}

          </div>

        </div>

      </section>

      {/* FEATURES */}

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">

        <div className="grid gap-4 sm:grid-cols-3">

          <button
            type="button"
            onClick={() => setActiveService('visa')}
            className="border border-ink-100 bg-white p-6 text-left transition hover:border-brand-200 hover:shadow-sm"
          >
            <div className="rounded-lg bg-brand-50 p-2.5 w-fit">
              <Globe2 className="h-5 w-5 text-brand-600" />
            </div>

            <h3 className="mt-5 font-semibold text-ink-900">
              Explore pathways
            </h3>

            <p className="mt-2 text-sm leading-6 text-ink-500">
              Discover different ways to work, study, relocate or build a
              life abroad.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveService('experts')}
            className="border border-ink-100 bg-white p-6 text-left transition hover:border-brand-200 hover:shadow-sm"
          >
            <div className="rounded-lg bg-brand-50 p-2.5 w-fit">
              <BadgeCheck className="h-5 w-5 text-brand-600" />
            </div>

            <h3 className="mt-5 font-semibold text-ink-900">
              Find trusted providers
            </h3>

            <p className="mt-2 text-sm leading-6 text-ink-500">
              Compare agencies, lawyers, advisors and relocation experts.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('calculator')}
            className="border border-ink-100 bg-white p-6 text-left transition hover:border-brand-200 hover:shadow-sm"
          >
            <div className="rounded-lg bg-brand-50 p-2.5 w-fit">
              <Calculator className="h-5 w-5 text-brand-600" />
            </div>

            <h3 className="mt-5 font-semibold text-ink-900">
              Understand the cost
            </h3>

            <p className="mt-2 text-sm leading-6 text-ink-500">
              Estimate the cost of visas, travel, accommodation and moving.
            </p>
          </button>

        </div>

      </section>

      {/* FINAL CTA */}

      <section className="border-t border-ink-100 bg-white">

        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">

          <div className="flex flex-col gap-6 border border-brand-100 bg-brand-50 p-8 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                MadeVisa
              </p>

              <h2 className="mt-2 text-2xl font-bold text-ink-950">
                Everything for your move, in one place.
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">
                From discovering a pathway to finding accommodation and
                trusted experts, build your journey step by step.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveService('visa')}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Start exploring
              <ArrowRight className="h-4 w-4" />
            </button>

          </div>

        </div>

      </section>

    </main>
  );
}