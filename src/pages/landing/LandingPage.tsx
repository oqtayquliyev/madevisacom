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
    title: 'MadeVisa | Find a job abroad. Get the visa sponsored.',
    description:
      'Live jobs from company career pages, plus a sponsorship offer you attach to your application: the visa route, the steps for the employer and who pays what. 5 free.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <LandingHero go={go} onAuth={onAuth} />
    <OfferSection />
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

