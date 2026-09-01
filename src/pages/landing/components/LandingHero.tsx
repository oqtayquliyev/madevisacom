import { useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  GraduationCap,
  Globe2,
  Heart,
  Plane,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { destinations, nationalities } from '@/data';
import { landingCountries } from '../data/countries';
import type { View } from '@/types';

type LandingHeroProps = {
  go: (view: View) => void;
};

type Option = {
  id: string;
  label: string;
  countryCode?: string;
};

const countryOptions: Option[] = landingCountries.map((country) => ({
  id: country.code,
  label: country.name,
  countryCode: country.code,
}));

const defaultDestination =
  countryOptions.find(
    (country) => country.id === destinations[0]?.code
  ) ?? countryOptions[0];

const defaultLocation =
  countryOptions.find(
    (country) => country.id === nationalities[0]?.code
  ) ?? countryOptions[0];

const journeyOptions: Option[] = [
  {
    id: 'work',
    label: 'Work',
  },
  {
    id: 'study',
    label: 'Study',
  },
  {
    id: 'vocational',
    label: 'Vocational training',
  },
  {
    id: 'business',
    label: 'Business',
  },
  {
    id: 'family',
    label: 'Family',
  },
  {
    id: 'relocation',
    label: 'Relocation',
  },
];

function SearchField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Option;
  options: Option[];
  onChange: (option: Option) => void;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-[11px] font-medium text-ink-500">
        {label}
      </label>

      <select
        value={value?.id ?? ''}
        onChange={(event) => {
          const selected = options.find(
            (option) => option.id === event.target.value
          );

          if (selected) {
            onChange(selected);
          }
        }}
        className="h-12 w-full cursor-pointer appearance-none rounded-md border-0 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:ring-0"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LandingHero({ go }: LandingHeroProps) {
  const [destination, setDestination] = useState<Option>(
    defaultDestination
  );

  const [location, setLocation] = useState<Option>(
    defaultLocation
  );

  const [journey, setJourney] = useState<Option>(
    journeyOptions[0]
  );

  return (
    <section className="relative">

      <div className="bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 sm:px-8">

          <header className="flex h-20 items-center justify-between">

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700">
                <Globe2 className="h-5 w-5" />
              </div>

              <span className="text-xl font-bold tracking-tight">
                madevisa.
              </span>
            </div>

            <nav className="hidden items-center gap-7 lg:flex">

              <button
                type="button"
                onClick={() => go('agencies')}
                className="text-sm font-medium text-white/90 transition hover:text-white"
              >
                Find Experts
              </button>

              <button
                type="button"
                onClick={() => go('agencies')}
                className="text-sm font-medium text-white/90 transition hover:text-white"
              >
                Agencies
              </button>

              <button
                type="button"
                onClick={() => go('agencies')}
                className="text-sm font-medium text-white/90 transition hover:text-white"
              >
                Destinations
              </button>

              <button
                type="button"
                onClick={() => go('agencies')}
                className="text-sm font-medium text-white/90 transition hover:text-white"
              >
                How It Works
              </button>

            </nav>

            <div className="flex items-center gap-2">

              <button
                type="button"
                onClick={() => go('agencies')}
                className="hidden px-3 py-2 text-sm font-medium text-white/90 transition hover:text-white sm:block"
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => go('agencies')}
                className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                Get started
              </button>

            </div>

          </header>

          <div className="flex gap-2 overflow-x-auto pb-5 pt-2">

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[0])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'work'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Work
            </button>

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[1])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'study'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Study
            </button>

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[2])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'vocational'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Vocational training
            </button>

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[3])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'business'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Business
            </button>

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[4])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'family'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <Heart className="h-4 w-4" />
              Family
            </button>

            <button
              type="button"
              onClick={() => setJourney(journeyOptions[5])}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                journey.id === 'relocation'
                  ? 'border-white bg-white/10 text-white'
                  : 'border-white/30 text-white/85 hover:border-white/60'
              }`}
            >
              <Plane className="h-4 w-4" />
              Relocation
            </button>

          </div>

          <div className="max-w-3xl pb-32 pt-14 sm:pb-36 sm:pt-16">

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5" />
              Your journey starts here
            </div>

            <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
              Find your path to a new life abroad.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
              Explore ways to work, study, build a business, reunite with
              family and relocate to another country.
            </p>

          </div>

        </div>

      </div>

      <div className="bg-white">

        <div className="mx-auto max-w-7xl px-5 sm:px-8">

          <div className="relative z-10 -mt-12">

            <div className="rounded-lg border-2 border-brand-500 bg-white p-1 shadow-xl sm:p-1.5">

              <div className="grid gap-1 lg:grid-cols-[1fr_1fr_1fr_auto]">

                <div className="rounded-md px-3 py-2">
                  <SearchField
                    label="I'm from"
                    value={location}
                    options={countryOptions}
                    onChange={setLocation}
                  />
                </div>

                <div className="rounded-md border-t border-ink-100 px-3 py-2 lg:border-l lg:border-t-0">
                  <SearchField
                    label="I want to go to"
                    value={destination}
                    options={countryOptions}
                    onChange={setDestination}
                  />
                </div>

                <div className="rounded-md border-t border-ink-100 px-3 py-2 lg:border-l lg:border-t-0">
                  <SearchField
                    label="I'm looking to"
                    value={journey}
                    options={journeyOptions}
                    onChange={setJourney}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => go('agencies')}
                  className="flex h-14 items-center justify-center gap-2 rounded-md bg-brand-600 px-7 text-sm font-bold text-white transition hover:bg-brand-700 lg:h-auto"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>

              </div>

            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1 py-4 text-xs text-ink-500">

              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Find experts for your journey
              </div>

              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4" />
                Explore destinations
              </div>

              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Compare your options
              </div>

            </div>

          </div>

          <div className="pb-16 pt-8 sm:pb-20">

            <div className="grid gap-4 sm:grid-cols-3">

              <div className="rounded-xl border border-ink-100 bg-white p-5">

                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Globe2 className="h-5 w-5" />
                </div>

                <h3 className="text-sm font-semibold text-ink-900">
                  Explore pathways
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-ink-500">
                  Discover different ways to reach your destination.
                </p>

              </div>

              <div className="rounded-xl border border-ink-100 bg-white p-5">

                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Users className="h-5 w-5" />
                </div>

                <h3 className="text-sm font-semibold text-ink-900">
                  Find trusted providers
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-ink-500">
                  Compare agencies and experts relevant to your journey.
                </p>

              </div>

              <div className="rounded-xl border border-ink-100 bg-white p-5">

                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <ArrowRight className="h-5 w-5" />
                </div>

                <h3 className="text-sm font-semibold text-ink-900">
                  Move with confidence
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-ink-500">
                  Get support from planning through to arrival.
                </p>

              </div>

            </div>

          </div>

        </div>

      </div>

    </section>
  );
}