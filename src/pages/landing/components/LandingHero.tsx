import { useState } from 'react';
import { BadgeCheck, Globe2, Search, ShieldCheck, Users } from 'lucide-react';
import { destinations, nationalities } from '@/data';
import { landingCountries } from '../data/countries';
import { visaTypeOptions } from '../data/visaTypes';
import { HeroSearchField, type HeroOption } from './HeroSearchField';
import type { View } from '@/types';

type LandingHeroProps = { go: (view: View) => void };

const countryOptions: HeroOption[] = landingCountries.map((country) => ({ id: country.code, label: country.name, countryCode: country.code }));
const defaultDestination = countryOptions.find((country) => country.id === destinations[0].code) ?? countryOptions[0];
const defaultLocation = countryOptions.find((country) => country.id === nationalities[0].code) ?? countryOptions[0];
const visaOptions: HeroOption[] = visaTypeOptions.map((option) => ({ ...option }));

export function LandingHero({ go }: LandingHeroProps) {
  const [destination, setDestination] = useState(defaultDestination);
  const [visaType, setVisaType] = useState(visaOptions[0]);
  const [location, setLocation] = useState(defaultLocation);

  return (
    <section className="border-b border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-brand-600">Travel made easier</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-ink-950 sm:text-6xl">Everything you need for your next journey.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink-500 sm:text-lg">Discover destinations, understand visa requirements, connect with trusted travel agencies and learn from travellers who have already made the journey.</p>
        </div>
        <div className="mt-9 border border-ink-200 bg-white p-3 shadow-soft-lg sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1.1fr_auto] lg:items-end">
            <HeroSearchField label="Destination" value={destination} options={countryOptions} onChange={setDestination} />
            <HeroSearchField label="Visa type" value={visaType} options={visaOptions} onChange={setVisaType} />
            <HeroSearchField label="Travelling from" value={location} options={countryOptions} onChange={setLocation} />
            <button onClick={() => go('agencies')} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700"><Search className="h-4 w-4" />Explore options</button>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500"><BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />Trusted guidance for every stage of your journey.</div>
        </div>
        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500"><span className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" />500+ travel agencies</span><span className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-brand-600" />10,000+ travellers</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" />84 countries covered</span></div>
      </div>
    </section>
  );
}

