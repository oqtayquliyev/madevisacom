import { LandingHero } from './components/LandingHero';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { LandingHeader } from './components/LandingHeader';
import { LandingFooter } from './components/LandingFooter';
import { OriginCountryProvider } from '@/lib/originCountry';
import { MatchSection } from './components/MatchSection';
import { TestimonialsSection } from '@/components/common/Testimonials';
import { TESTIMONIALS } from '@/data/testimonials';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({ ...SEO_META.home, path: '/' });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <LandingHero go={go} onAuth={onAuth} />
    <MatchSection />
    <div className="mx-auto max-w-7xl px-3 pb-14 sm:px-8 sm:pb-20 lg:px-10">
      <TestimonialsSection id="landing-feedback" items={TESTIMONIALS} title="How MadeVisa helped their search abroad." />
    </div>
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

