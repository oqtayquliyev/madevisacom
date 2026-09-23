import { BadgeCheck, MessageCircle, Search } from 'lucide-react';
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
    title: 'Find Visas, Jobs, Study & Work Abroad',
    description: 'Find your path abroad with MadeVisa. Explore visa options, jobs, study programs, business and family pathways, flights, accommodation and trusted experts in one place.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <CountrySwitcher />
    <LandingHero go={go} onAuth={onAuth} />
    <main className="landing-main">
      <section id="how-it-works" className="border-y border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">A better way to apply</p><h2 className="mt-2 max-w-sm text-3xl font-bold tracking-tight text-ink-950">From discover to move, in one place.</h2></div><div className="grid gap-5 sm:grid-cols-3"><Step number="01" icon={Search} title="Discover & compare" detail="Official programs, sponsored jobs and visa pathways matched to you." /><Step number="02" icon={BadgeCheck} title="Get expert help" detail="Verified agencies and independent experts, when you want a hand." /><Step number="03" icon={MessageCircle} title="Apply & move" detail="Track requirements, book travel and follow your application through." /></div></div></div></section>
    </main>
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

function Step({ number, icon: Icon, title, detail }: { number: string; icon: typeof Search; title: string; detail: string }) { return <div className="border-l-2 border-brand-200 pl-4"><div className="flex items-center gap-2 text-xs font-bold text-brand-600"><Icon className="h-4 w-4" />{number}</div><h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3><p className="mt-1 text-sm leading-6 text-ink-500">{detail}</p></div>; }
