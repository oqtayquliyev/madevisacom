import { LandingHero } from './components/LandingHero';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from './components/LandingHeader';
import { LandingFooter } from './components/LandingFooter';
import { OriginCountryProvider } from '@/lib/originCountry';
import { MatchSection } from './components/MatchSection';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({
    title: 'MadeVisa | Find a job abroad. See how well you match it.',
    description:
      'Live jobs from company career pages. Upload your CV once and every job shows your match score, the skills you’re missing and what to change before you apply. The score is free.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <LandingHero go={go} onAuth={onAuth} />
    <MatchSection />
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

