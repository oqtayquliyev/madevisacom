import { LandingHero } from './components/LandingHero';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from './components/LandingHeader';
import { LandingFooter } from './components/LandingFooter';
import { OriginCountryProvider } from '@/lib/originCountry';
import { CountrySwitcher } from '@/components/location/CountrySwitcher';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({
    title: 'MadeVisa | All-in-One Opportunity Library: Jobs, Programs & Visas',
    description:
      'Find your path with MadeVisa. Jobs from company career pages, sponsored opportunities, programs, study options and visa pathways, plus flights, stays and experts, in one place.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <CountrySwitcher />
    <LandingHero go={go} onAuth={onAuth} />
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

