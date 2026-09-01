import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Globe2,
  Search,
  Sparkles,
} from 'lucide-react';
import { destinations, nationalities } from '@/data';
import { landingCountries } from '../data/countries';
import type { View } from '@/types';

type LandingHeroProps = {
  go: (view: View) => void;
};

type HeroOption = {
  id: string;
  label: string;
  countryCode?: string;
};

const countryOptions: HeroOption[] = landingCountries.map((country) => ({
  id: country.code,
  label: country.name,
  countryCode: country.code,
}));

const defaultDestination =
  countryOptions.find(
    (country) => country.id === destinations[0].code
  ) ?? countryOptions[0];

const defaultLocation =
  countryOptions.find(
    (country) => country.id === nationalities[0].code
  ) ?? countryOptions[0];

const journeyOptions: HeroOption[] = [
  { id: 'work', label: 'Work' },
  { id: 'study', label: 'Study' },
  { id: 'vocational', label: 'Vocational training' },
  { id: 'business', label: 'Business' },
  { id: 'family', label: 'Family' },
  { id: 'relocation', label: 'Relocation' },
];

function SearchField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: HeroOption;
  options: HeroOption[];
  onChange: (option: HeroOption) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-ink-700">
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
        className="h-12 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
  const [destination, setDestination] = useState<HeroOption>(
    defaultDestination
  );

  const [journey, setJourney] = useState<HeroOption>(
    journeyOptions[0]
  );

  const [location, setLocation] = useState<HeroOption>(
    defaultLocation
  );

  return (
    <section className="border-b border-ink-200 bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">

        <div className="mx-auto max-w-4xl text-center">

          <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            Your journey starts here
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] text-ink-950 sm:text-6xl lg:text-7xl">
            Everything you need to
            <span className="text-brand-600"> move abroad.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-500 sm:text-lg">
            Discover the ways you can move, work, study and build a life in
            another country. Find the right pathway and connect with trusted
            experts who can help you get there.
          </p>

        </div>

        <div className="mx-auto mt-12 max-w-6xl">

          <div className="mb-4 text-center">
            <p className="text-sm font-semibold text-ink-700">
              Tell us where you want to go
            </p>

            <p className="mt-1 text-xs text-ink-400">
              We'll show you the options available for your journey.
            </p>
          </div>

          <div className="border border-ink-200 bg-white p-3 shadow-soft-lg sm:p-4">

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">

              <SearchField
                label="I'm from"
                value={location}
                options={countryOptions}
                onChange={setLocation}
              />

              <SearchField
                label="I want to go to"
                value={destination}
                options={countryOptions}
                onChange={setDestination}
              />

              <SearchField
                label="I'm looking to"
                value={journey}
                options={journeyOptions}
                onChange={setJourney}
              />

              <button
                onClick={() => go('agencies')}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Search className="h-4 w-4" />
                Find my options
              </button>

            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              Pathways, opportunities and trusted providers in one place.
            </div>

          </div>

        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">

          <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="rounded-lg bg-brand-50 p-2">
              <Globe2 className="h-5 w-5 text-brand-600" />
            </div>

            <div>
              <p className="text-sm font-semibold text-ink-900">
                Explore pathways
              </p>

              <p className="mt-1 text-xs leading-5 text-ink-500">
                Discover different ways to reach your destination.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="rounded-lg bg-brand-50 p-2">
              <BadgeCheck className="h-5 w-5 text-brand-600" />
            </div>

            <div>
              <p className="text-sm font-semibold text-ink-900">
                Find trusted providers
              </p>

              <p className="mt-1 text-xs leading-5 text-ink-500">
                Compare agencies and experts relevant to your journey.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="rounded-lg bg-brand-50 p-2">
              <ArrowRight className="h-5 w-5 text-brand-600" />
            </div>

            <div>
              <p className="text-sm font-semibold text-ink-900">
                Move with confidence
              </p>

              <p className="mt-1 text-xs leading-5 text-ink-500">
                Get support from planning through to arrival.
              </p>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}