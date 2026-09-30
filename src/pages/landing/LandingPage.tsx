import { LandingHero } from './components/LandingHero';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from './components/LandingHeader';
import { LandingFooter } from './components/LandingFooter';
import { OriginCountryProvider } from '@/lib/originCountry';
import { OfferSection } from './components/OfferSection';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({
    title: 'MadeVisa | Jobs from the Source + Hiring Insights',
    description:
      'Live jobs straight from company career pages, plus hiring insights: company scores, reply rates and hiring trends. Programs, study and visas too — in one place.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <LandingHero go={go} onAuth={onAuth} />
    <OfferSection />
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

