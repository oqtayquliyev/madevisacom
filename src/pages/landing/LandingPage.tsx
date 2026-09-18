import { ArrowRight, BadgeCheck, Briefcase, Building2, GraduationCap, MessageCircle, Plane, Search, ShieldCheck } from 'lucide-react';
import { LandingHero } from './components/LandingHero';
import { LocationMatchSection } from './components/LocationMatchSection';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from './components/LandingHeader';import { LandingFooter } from './components/LandingFooter';
import { OriginCountryProvider } from '@/lib/originCountry';
import { CountrySwitcher } from '@/components/location/CountrySwitcher';
import { TripCostEstimator } from '@/components/estimator/TripCostEstimator';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };
const destinationsList = [['Germany', 'Explore'], ['France', 'Explore'], ['Italy', 'Explore'], ['Canada', 'Explore'], ['United Kingdom', 'Explore'], ['United States', 'Explore'], ['Australia', 'Explore'], ['Netherlands', 'Explore']];

export function LandingPage({ go, onAuth }: LandingProps) {
  useSeo({
    title: 'Find Visas, Jobs, Study & Work Abroad',
    description: 'Find your path abroad with MadeVisa. Explore visa options, jobs, study programs, business and family pathways, flights, accommodation and trusted experts in one place.',
    path: '/',
  });

  return <OriginCountryProvider><div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <CountrySwitcher />
    <style>{'.landing-main > section:first-child { display: none; }'}</style>
    <LandingHero go={go} />
    <LocationMatchSection />
    <main className="landing-main">
      <section id="how-it-works" className="border-y border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">A better way to apply</p><h2 className="mt-2 max-w-sm text-3xl font-bold tracking-tight text-ink-950">From discover to move, in one place.</h2></div><div className="grid gap-5 sm:grid-cols-3"><Step number="01" icon={Search} title="Discover & compare" detail="Official programs, sponsored jobs and visa pathways matched to you." /><Step number="02" icon={BadgeCheck} title="Get expert help" detail="Verified agencies and independent experts, when you want a hand." /><Step number="03" icon={MessageCircle} title="Apply & move" detail="Track requirements, book travel and follow your application through." /></div></div></div></section>
      <section id="destinations" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><Heading eyebrow="Popular destinations" title="Start with where you want to go." detail="Official government sources" action="See all destinations" onAction={() => go('destinations')} /><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{destinationsList.map(([name, count]) => <button key={name} onClick={() => go('destinations')} className="flex items-center justify-between border border-ink-200 bg-white px-4 py-3 text-left shadow-soft hover:border-brand-300"><span className="text-sm font-semibold text-ink-800">{name}</span><span className="text-xs text-ink-400">{count}</span></button>)}</div></section>
      <section className="bg-brand-700 px-5 py-14 text-white sm:px-8 sm:py-16"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-brand-200">Built for better applications</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Know your options before you apply.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-brand-100">Real programs, real jobs, and verified people who can help — not guesswork.</p></div><button onClick={() => onAuth?.('register')} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700">Get started free <ArrowRight className="h-4 w-4" /></button></div></section>
      <OpportunitiesSection go={go} />
      <TravelTeaserSection go={go} />
    </main>
    <TripCostEstimator go={go} />
    <LandingFooter go={go} onAuth={onAuth} />
  </div></OriginCountryProvider>;
}

function Heading({ eyebrow, title, detail, action, onAction }: { eyebrow: string; title: string; detail?: string; action?: string; onAction?: () => void }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">{title}</h2>{detail && <p className="mt-2 text-sm text-ink-500">{detail}</p>}</div>{action && <button onClick={onAction} className="flex items-center gap-2 text-sm font-semibold text-brand-600">{action}<ArrowRight className="h-4 w-4" /></button>}</div>; }
function Step({ number, icon: Icon, title, detail }: { number: string; icon: typeof Search; title: string; detail: string }) { return <div className="border-l-2 border-brand-200 pl-4"><div className="flex items-center gap-2 text-xs font-bold text-brand-600"><Icon className="h-4 w-4" />{number}</div><h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3><p className="mt-1 text-sm leading-6 text-ink-500">{detail}</p></div>; }

function OpportunitiesSection({ go }: { go: (view: View) => void }) {
  return (
    <section className="border-y border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <Heading
          eyebrow="Beyond visas"
          title="Jobs and programs you can actually apply for."
          detail="Sponsored jobs, scholarships and exchange programs, filtered to your citizenship, age and location."
        />

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => go('jobs')}
            className="group flex items-start gap-4 border border-ink-200 bg-white p-6 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Briefcase className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-bold text-ink-950">Jobs abroad</span>
              <span className="mt-1 block text-sm leading-6 text-ink-500">
                Vacancies from multiple sources in one searchable board, with a fit
                badge based on your profile.
              </span>
              <span className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                Browse jobs
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </span>
          </button>

          <button
            onClick={() => go('programs')}
            className="group flex items-start gap-4 border border-ink-200 bg-white p-6 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-bold text-ink-950">Programs &amp; exchanges</span>
              <span className="mt-1 block text-sm leading-6 text-ink-500">
                Scholarships, work &amp; travel schemes and apprenticeships, matched
                against your citizenship and age.
              </span>
              <span className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                Browse programs
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function TravelTeaserSection({ go }: { go: (view: View) => void }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="grid gap-6 border border-ink-200 bg-white p-6 shadow-soft sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            <Plane className="h-3.5 w-3.5" />
            Once your route is set
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">Book stays &amp; flights for your trip.</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-ink-500">
            Search hotels and flights in the same place you sorted your visa and
            experts — no need to jump to another site.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => go('travel')} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              <Building2 className="h-4 w-4" />
              Search stays
            </button>
            <button onClick={() => go('travel')} className="flex items-center gap-2 rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              <Plane className="h-4 w-4" />
              Search flights
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Building2, label: 'Stays', detail: 'Hotels & apartments' },
            { icon: Plane, label: 'Flights', detail: 'Compare fares' },
            { icon: ShieldCheck, label: 'Insurance', detail: 'Visa-ready cover' },
            { icon: BadgeCheck, label: 'Packages', detail: 'Bundled deals' },
          ].map((item) => (
            <div key={item.label} onClick={() => go('travel')} className="flex cursor-pointer flex-col gap-2 border border-ink-100 bg-ink-50/60 p-4 transition hover:border-brand-300">
              <item.icon className="h-5 w-5 text-brand-600" />
              <p className="text-sm font-bold text-ink-900">{item.label}</p>
              <p className="text-xs text-ink-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
