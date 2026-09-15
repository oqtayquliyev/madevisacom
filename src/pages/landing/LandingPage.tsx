import { useState } from 'react';
import { ArrowRight, BadgeCheck, Briefcase, Building2, Check, ChevronDown, Clock3, Globe2, GraduationCap, MapPin, MessageCircle, Plane, Search, ShieldCheck, Star, Users } from 'lucide-react';
import { agencies, destinations, nationalities } from '@/data';
import type { View } from '@/types';
import { LandingHero } from './components/LandingHero';
import { AgencyDiscoverySection } from './components/AgencyDiscoverySection';
import { LandingHeader } from './components/LandingHeader';
import { LandingFooter } from './components/LandingFooter';
import { SponsoredCarousel, type SponsoredListing } from '@/components/ads/SponsoredCarousel';

type LandingProps = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };
type Professional = { name: string; title: string; agency: string; initials: string; location: string; served: string; specialties: string[]; rating: number; reviews: number; price: number; response: string; avatar: string; accent: string };
const pros: Professional[] = [
  { name: 'Leyla Karimova', title: 'Senior  Consultant', agency: 'Global Travel', initials: 'GT', location: 'Baku, Azerbaijan', served: 'Europe · UK · USA', specialties: ['Schengen', 'Business'], rating: 4.9, reviews: 128, price: 85, response: 'Replies in 20 min', avatar: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=160&q=80', accent: 'bg-violet-100 text-violet-700' },
  { name: 'Marco Bellini', title: 'Immigration Specialist', agency: 'Atlas Journeys', initials: 'AJ', location: 'Milan, Italy', served: 'Italy · France · Spain', specialties: ['Schengen', 'Family'], rating: 4.8, reviews: 94, price: 69, response: 'Replies in 1 hour', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=160&q=80', accent: 'bg-amber-100 text-amber-700' },
  { name: 'Sofia Rahman', title: 'Visa & Relocation Advisor', agency: 'Northstar Travel', initials: 'NT', location: 'Dubai, UAE', served: 'UAE · Canada · USA', specialties: ['Relocation', 'Tourist'], rating: 4.9, reviews: 76, price: 110, response: 'Replies in 45 min', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=160&q=80', accent: 'bg-emerald-100 text-emerald-700' },
  { name: 'Owen Williams', title: 'Visa Documentation Expert', agency: 'Wayfinder Co.', initials: 'WC', location: 'London, United Kingdom', served: 'UK · Europe · Australia', specialties: ['Student', 'Work'], rating: 4.7, reviews: 61, price: 49, response: 'Replies in 2 hours', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80', accent: 'bg-blue-100 text-blue-700' },
  { name: 'Ayla Demir', title: 'Travel Compliance Advisor', agency: 'Route & Co.', initials: 'RC', location: 'Istanbul, Turkey', served: 'Europe · Asia · USA', specialties: ['Schengen', 'Transit'], rating: 4.8, reviews: 48, price: 59, response: 'Replies in 30 min', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80', accent: 'bg-rose-100 text-rose-700' },
  { name: 'David Chen', title: 'International Visa Advisor', agency: 'Open Atlas', initials: 'OA', location: 'Toronto, Canada', served: 'Canada · USA · UK', specialties: ['Student', 'Work'], rating: 4.9, reviews: 112, price: 95, response: 'Replies in 1 hour', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80', accent: 'bg-cyan-100 text-cyan-700' },
  { name: 'Elena Rossi', title: 'Schengen Visa Consultant', agency: 'Mondo Assist', initials: 'MA', location: 'Rome, Italy', served: 'Italy · Germany · France', specialties: ['Schengen', 'Tourist'], rating: 4.8, reviews: 83, price: 55, response: 'Replies in 40 min', avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=160&q=80', accent: 'bg-orange-100 text-orange-700' },
  { name: 'Samir Patel', title: 'Global Mobility Consultant', agency: 'Borderless', initials: 'BL', location: 'Mumbai, India', served: 'USA · Canada · UK', specialties: ['Business', 'Work'], rating: 4.7, reviews: 57, price: 79, response: 'Replies in 90 min', avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=160&q=80', accent: 'bg-indigo-100 text-indigo-700' },
];
const destinationsList = [['Germany', '124 experts'], ['France', '98 experts'], ['Italy', '86 experts'], ['Canada', '74 experts'], ['United Kingdom', '69 experts'], ['United States', '61 experts'], ['Australia', '42 experts'], ['Switzerland', '37 experts']];

export function LandingPage({ go, onAuth }: LandingProps) {

  const [destination, setDestination] = useState(destinations[0]);
  const [visaType, setVisaType] = useState('Tourist visa');
  const [location, setLocation] = useState(nationalities[0]);
  const search = () => go('agencies');
  return <div className="min-h-screen bg-[#f8fafc] text-ink-900">
    <LandingHeader go={go} onAuth={onAuth} active="home" />
    <style>{'.landing-main > section:first-child { display: none; }'}</style>
    <LandingHero go={go} />
    <main className="landing-main">
      <section className="border-b border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20"><div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-sm font-semibold text-brand-600">The visa professional marketplace</p><h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-ink-950 sm:text-6xl">Find the right visa expert for your journey.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-500 sm:text-lg">Discover verified professionals who can help with your destination, visa type and application from wherever you are.</p></div><div className="mt-9 border border-ink-200 bg-white p-3 shadow-soft-lg sm:p-4"><div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1.1fr_auto] lg:items-end"><SearchField label="Destination" value={destination.name} options={destinations.map((item) => item.name)} onChange={(value) => setDestination(destinations.find((item) => item.name === value) ?? destination)} /><SearchField label="Visa type" value={visaType} options={['Tourist visa', 'Business visa', 'Student visa', 'Work visa', 'Family visa']} onChange={setVisaType} /><SearchField label="Applicant location" value={location.name} options={nationalities.map((item) => item.name)} onChange={(value) => setLocation(nationalities.find((item) => item.name === value) ?? location)} /><button onClick={search} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"><Search className="h-4 w-4" />Search experts</button></div><div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500"><BadgeCheck className="h-4 w-4 text-emerald-600" />Every professional is reviewed for experience and service quality.</div></div><div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500"><span className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" />2,400+ professionals</span><span className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-brand-600" />84 countries covered</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" />Secure communication</span></div></div></section>
      <AgencyDiscoverySection go={go} />
      <section id="how-it-works" className="border-y border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">A better way to apply</p><h2 className="mt-2 max-w-sm text-3xl font-bold tracking-tight text-ink-950">Expert help, without the guesswork.</h2></div><div className="grid gap-5 sm:grid-cols-3"><Step number="01" icon={Search} title="Tell us your route" detail="Choose your destination, visa type and where you apply from." /><Step number="02" icon={BadgeCheck} title="Compare experts" detail="Review experience, ratings, prices and response times." /><Step number="03" icon={MessageCircle} title="Move forward" detail="Message a professional and keep your application on track." /></div></div></div></section>
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><Heading eyebrow="Browse the network" title="All visa professionals" detail="Compare specialists, pricing and response times in one place." /><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{pros.map((professional) => <ProfessionalCard key={professional.name} professional={professional} onClick={search} />)}</div></section>
      <section id="destinations" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><Heading eyebrow="Popular destinations" title="Start with where you want to go." detail="Updated weekly" /><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{destinationsList.map(([name, count]) => <button key={name} onClick={() => go('agencies')} className="flex items-center justify-between border border-ink-200 bg-white px-4 py-3 text-left shadow-soft hover:border-brand-300"><span className="text-sm font-semibold text-ink-800">{name}</span><span className="text-xs text-ink-400">{count}</span></button>)}</div></section>
      <section className="bg-brand-700 px-5 py-14 text-white sm:px-8 sm:py-16"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-brand-200">Built for better applications</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Know your options before you apply.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-brand-100">Compare the people, expertise and pricing behind your next visa decision.</p></div><button onClick={() => onAuth?.('register')} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700">Get started free <ArrowRight className="h-4 w-4" /></button></div></section>
      <OpportunitiesSection go={go} />
      <TravelTeaserSection go={go} />
    </main>
    <SponsoredCarousel
      title="Travel packages & partner offers"
      detail="Bundled visa, flight, hotel and insurance deals from our partner network."
      listings={sponsoredPackages}
    />
    <LandingFooter go={go} onAuth={onAuth} />
  </div>;
}

function Heading({ eyebrow, title, detail, action, onAction }: { eyebrow: string; title: string; detail?: string; action?: string; onAction?: () => void }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">{title}</h2>{detail && <p className="mt-2 text-sm text-ink-500">{detail}</p>}</div>{action && <button onClick={onAction} className="flex items-center gap-2 text-sm font-semibold text-brand-600">{action}<ArrowRight className="h-4 w-4" /></button>}</div>; }
function SearchField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { const [open, setOpen] = useState(false); return <div className="relative"><label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label><button onClick={() => setOpen(!open)} className="flex h-12 w-full items-center justify-between rounded-lg border border-ink-200 bg-white px-3 text-left text-sm font-medium text-ink-800 hover:border-brand-300"><span>{value}</span><ChevronDown className={`h-4 w-4 text-ink-400 transition ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto border border-ink-200 bg-white p-1 shadow-xl">{options.map((option) => <button key={option} onClick={() => { onChange(option); setOpen(false); }} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50">{option}{option === value && <Check className="h-4 w-4 text-brand-600" />}</button>)}</div>}</div>; }
function ProfessionalCard({ professional, onClick }: { professional: Professional; onClick: () => void }) { return <article className="flex min-h-[282px] flex-col border border-ink-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><img src={professional.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /><div className="min-w-0"><h3 className="truncate text-sm font-bold text-ink-900">{professional.name}</h3><p className="truncate text-xs text-ink-500">{professional.title}</p></div></div><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${professional.accent}`}>{professional.initials}</span></div><div className="mt-4 flex items-center gap-1.5 text-xs text-ink-500"><Building2 className="h-3.5 w-3.5 text-ink-400" />{professional.agency}<span className="ml-auto flex items-center gap-1 font-semibold text-ink-800"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{professional.rating}<span className="font-normal text-ink-400">({professional.reviews})</span></span></div><div className="mt-3 flex items-center gap-1.5 text-xs text-ink-500"><MapPin className="h-3.5 w-3.5 text-ink-400" />{professional.location}</div><div className="mt-4 flex flex-wrap gap-1.5">{professional.specialties.map((specialty) => <span key={specialty} className="rounded-md bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-600">{specialty}</span>)}<span className="rounded-md bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-500">{professional.served}</span></div><div className="mt-auto border-t border-ink-100 pt-4"><div className="flex items-end justify-between"><div><p className="text-[11px] text-ink-400">Starting at</p><p className="mt-0.5 text-xl font-bold tracking-tight text-ink-950">€{professional.price}</p></div><p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Clock3 className="h-3.5 w-3.5" />{professional.response}</p></div><button onClick={onClick} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">View profile<ArrowRight className="h-3.5 w-3.5" /></button></div></article>; }
export function AgencyCard({ agency, onClick }: { agency: typeof agencies[number]; onClick: () => void }) { return <div className="border border-ink-200 bg-white p-5 shadow-soft"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-900 text-xs font-bold text-white">{agency.initials}</span><div><h3 className="font-semibold text-ink-900">{agency.name}</h3><p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3 w-3" />{agency.destinations.slice(0, 2).join(' · ')}</p></div></div><span className="flex items-center gap-1 text-xs font-semibold text-ink-700"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{agency.rating}</span></div><div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-xs"><div><p className="text-ink-400">Specialties</p><p className="mt-1 font-medium text-ink-700">{agency.services.slice(0, 2).join(' · ')}</p></div><div><p className="text-ink-400">Starting at</p><p className="mt-1 text-lg font-bold text-ink-950">${agency.priceFrom}</p></div></div><div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><BadgeCheck className="h-4 w-4" />Verified agency · {agency.tripsHandled.toLocaleString()} helped</div><button onClick={onClick} className="mt-4 text-xs font-semibold text-brand-600">View agency<ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div>; }
function Step({ number, icon: Icon, title, detail }: { number: string; icon: typeof Search; title: string; detail: string }) { return <div className="border-l-2 border-brand-200 pl-4"><div className="flex items-center gap-2 text-xs font-bold text-brand-600"><Icon className="h-4 w-4" />{number}</div><h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3><p className="mt-1 text-sm leading-6 text-ink-500">{detail}</p></div>; }

const sponsoredPackages: SponsoredListing[] = [
  {
    id: 'pkg-1',
    advertiser: 'Atlas Journeys',
    title: 'Schengen visa + flight + hotel bundle',
    description: 'One package covering your application, flights and 5 nights in Rome.',
    price: 'From €890',
    image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=500&q=80',
    url: 'https://madevisa.com/agencies',
    badge: 'Package deal',
  },
  {
    id: 'pkg-2',
    advertiser: 'Northstar Travel',
    title: 'Dubai relocation starter package',
    description: 'Flights, 2 weeks of housing and visa support for new arrivals.',
    price: 'From €1,240',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=500&q=80',
    url: 'https://madevisa.com/agencies',
    badge: 'Relocation',
  },
  {
    id: 'pkg-3',
    advertiser: 'SafeTrip Insurance',
    title: 'Travel & visa insurance, 30% off',
    description: 'Medical cover accepted by all Schengen embassies.',
    price: '€2.10 / day',
    image: 'https://images.unsplash.com/photo-1503437313881-503a91226402?auto=format&fit=crop&w=500&q=80',
    url: 'https://madevisa.com',
    badge: 'Insurance',
  },
  {
    id: 'pkg-4',
    advertiser: 'Wayfinder Co.',
    title: 'Student move-in package, UK',
    description: 'Airport pickup, first month housing and SIM card bundled.',
    price: 'From £310',
    image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=500&q=80',
    url: 'https://madevisa.com/agencies',
    badge: 'Student',
  },
];

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
