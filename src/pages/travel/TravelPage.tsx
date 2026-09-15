import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Info,
  MapPin,
  Plane,
  Search,
  ShieldCheck,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { SponsoredCarousel, type SponsoredListing } from '@/components/ads/SponsoredCarousel';
import { CircleFlag } from '@/components/common/CircleFlag';
import { airports, defaultDestination, defaultOrigin, type Airport } from '@/data/airports';
import { affiliateConfig, buildFlightSearchUrl } from '@/lib/affiliate';

type TravelPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type Tab = 'stays' | 'flights';
type TripType = 'roundtrip' | 'oneway';

const stayResults = [
  {
    id: 'stay-1',
    name: 'Hotel Adlon Kempinski',
    city: 'Berlin, Germany',
    rating: 4.8,
    reviews: 2140,
    price: 189,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',
    tag: 'Near city center',
  },
  {
    id: 'stay-2',
    name: 'The Ritz-Carlton',
    city: 'Toronto, Canada',
    rating: 4.9,
    reviews: 1870,
    price: 245,
    image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=600&q=80',
    tag: 'Free cancellation',
  },
  {
    id: 'stay-3',
    name: 'Citadines Apart-Hotel',
    city: 'Paris, France',
    rating: 4.5,
    reviews: 980,
    price: 132,
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80',
    tag: 'Kitchenette included',
  },
  {
    id: 'stay-4',
    name: 'Ibis Styles Central',
    city: 'Dublin, Ireland',
    rating: 4.3,
    reviews: 640,
    price: 98,
    image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=600&q=80',
    tag: 'Breakfast included',
  },
];

// "Popular routes" — each Select button below builds a REAL Aviasales
// affiliate deep link (via buildFlightSearchUrl) using this route info,
// so clicking through and booking earns a real commission.
const popularRoutes = [
  { id: 'fl-1', airline: 'Popular on this route', from: 'GYD', to: 'IST', duration: '2h 15m', stops: 'Direct', priceHint: 'from $120' },
  { id: 'fl-2', airline: 'Popular on this route', from: 'GYD', to: 'BER', duration: '5h 20m', stops: '1 stop', priceHint: 'from $310' },
  { id: 'fl-3', airline: 'Popular on this route', from: 'GYD', to: 'PAR', duration: '6h 40m', stops: '1 stop', priceHint: 'from $340' },
  { id: 'fl-4', airline: 'Popular on this route', from: 'GYD', to: 'DXB', duration: '2h 45m', stops: 'Direct', priceHint: 'from $150' },
];

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

// Sensible default dates so a first-click search already works: four
// weeks out, one week trip.
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function TravelPage({ go, onAuth }: TravelPageProps) {
  const [tab, setTab] = useState<Tab>('stays');
  const [destination, setDestination] = useState('Berlin, Germany');

  const [tripType, setTripType] = useState<TripType>('roundtrip');
  const [originAirport, setOriginAirport] = useState<Airport>(defaultOrigin);
  const [destinationAirport, setDestinationAirport] = useState<Airport>(defaultDestination);
  const [departDate, setDepartDate] = useState(isoDaysFromNow(28));
  const [returnDate, setReturnDate] = useState(isoDaysFromNow(35));
  const [adults, setAdults] = useState(1);

  const searchUrl = useMemo(
    () =>
      buildFlightSearchUrl({
        origin: originAirport.code,
        destination: destinationAirport.code,
        departDate,
        returnDate: tripType === 'roundtrip' ? returnDate : undefined,
        adults,
      }),
    [originAirport, destinationAirport, departDate, returnDate, tripType, adults]
  );

  const goToSearch = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const swapAirports = () => {
    setOriginAirport(destinationAirport);
    setDestinationAirport(originAirport);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="travel" />

      {/* HERO / SEARCH — booking.com style */}
      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
          <p className="text-sm font-medium text-white/70">Once your route is set, book the rest right here</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-[-0.03em] sm:text-5xl">
            Stays and flights for your trip.
          </h1>

          {/* TABS */}
          <div className="mt-8 flex gap-1">
            <TabButton active={tab === 'stays'} onClick={() => setTab('stays')} icon={Building2} label="Stays" />
            <TabButton active={tab === 'flights'} onClick={() => setTab('flights')} icon={Plane} label="Flights" />
          </div>

          {/* SEARCH CARD */}
          <div className="mt-1 border border-ink-200 bg-white p-3 shadow-xl sm:p-4">
            {tab === 'stays' ? (
              <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
                <TextField label="Destination" icon={MapPin} value={destination} onChange={setDestination} />
                <TextField label="Check-in — Check-out" icon={CalendarDays} value="Select dates" onChange={() => undefined} readOnly />
                <TextField label="Guests" icon={Users} value="2 adults · 1 room" onChange={() => undefined} readOnly />
                <button className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700">
                  <Search className="h-4 w-4" />
                  Search stays
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                  <TripTypeButton active={tripType === 'roundtrip'} onClick={() => setTripType('roundtrip')} label="Round trip" />
                  <TripTypeButton active={tripType === 'oneway'} onClick={() => setTripType('oneway')} label="One way" />

                  <div className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-500">
                    <Users className="h-3.5 w-3.5" />
                    <select
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-semibold text-ink-800 outline-none"
                    >
                      {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} adult{n > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`grid gap-3 lg:items-end ${tripType === 'roundtrip' ? 'lg:grid-cols-[1fr_auto_1fr_0.8fr_0.8fr_auto]' : 'lg:grid-cols-[1fr_auto_1fr_0.8fr_auto]'}`}>
                  <AirportSelect label="From" value={originAirport} onChange={setOriginAirport} />

                  <button
                    type="button"
                    onClick={swapAirports}
                    aria-label="Swap origin and destination"
                    className="mx-auto hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-500 hover:bg-ink-50 lg:flex"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>

                  <AirportSelect label="To" value={destinationAirport} onChange={setDestinationAirport} />

                  <DateField label="Depart" value={departDate} onChange={setDepartDate} />

                  {tripType === 'roundtrip' && (
                    <DateField label="Return" value={returnDate} onChange={setReturnDate} min={departDate} />
                  )}

                  <button
                    type="button"
                    onClick={() => goToSearch(searchUrl)}
                    className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <Search className="h-4 w-4" />
                    Search flights
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              {tab === 'flights' ? (
                <span>
                  You'll be taken to our flight search partner, Aviasales, to see live prices and complete
                  booking. MadeVisa may earn a commission on bookings made this way, at no extra cost to you.
                </span>
              ) : (
                <span>Prices shown are estimates. You'll confirm final pricing with the provider before booking.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* RESULTS */}
      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        {tab === 'stays' ? (
          <>
            <h2 className="text-xl font-bold text-ink-950">
              {stayResults.length} stays near {destination.split(',')[0]}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stayResults.map((stay) => (
                <article key={stay.id} className="flex flex-col overflow-hidden border border-ink-200 bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
                  <div className="h-36 w-full overflow-hidden">
                    <img src={stay.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="text-sm font-bold text-ink-900">{stay.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                      <MapPin className="h-3 w-3" />
                      {stay.city}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-700">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {stay.rating}
                      <span className="font-normal text-ink-400">({stay.reviews})</span>
                    </p>
                    <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <Tag className="h-3 w-3" />
                      {stay.tag}
                    </span>
                    <div className="mt-auto flex items-end justify-between border-t border-ink-100 pt-3">
                      <div>
                        <p className="text-[11px] text-ink-400">Per night</p>
                        <p className="text-lg font-bold text-ink-950">€{stay.price}</p>
                      </div>
                      <button className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                        View
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-400">
              Prototype results. See OPPORTUNITIES.md for how to connect a real stays affiliate provider.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-ink-950">
                Popular routes from {originAirport.city}
              </h2>
              <a
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                See live results on Aviasales
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-6 flex flex-col divide-y divide-ink-100 border border-ink-200 bg-white">
              {popularRoutes.map((flight) => {
                const routeUrl = buildFlightSearchUrl({
                  origin: flight.from,
                  destination: flight.to,
                  departDate,
                  returnDate: tripType === 'roundtrip' ? returnDate : undefined,
                  adults,
                });
                const toAirport = airports.find((a) => a.code === flight.to);

                return (
                  <div key={flight.id} className="flex flex-col gap-3 p-4 transition hover:bg-ink-50/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
                        <Plane className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                          {toAirport && <CircleFlag countryCode={toAirport.countryCode} label={toAirport.country} size={16} />}
                          {flight.from} → {flight.to}
                        </p>
                        <p className="text-xs text-ink-500">
                          {flight.duration} · {flight.stops} · {flight.airline}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:justify-end">
                      <p className="text-sm font-semibold text-ink-700">{flight.priceHint}</p>
                      <a
                        href={routeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Search
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              <span>
                "Search" opens live results on Aviasales with your dates and passenger count carried over. Prices
                shown here are indicative — real fares are confirmed on their site.
              </span>
            </div>

            {!affiliateConfig.isConfigured && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Using a demo affiliate marker — bookings won't be credited to you yet. Set{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">VITE_TRAVELPAYOUTS_MARKER</code> in your
                  environment once you have a Travelpayouts account. See OPPORTUNITIES.md for setup steps.
                </span>
              </div>
            )}
          </>
        )}
      </main>

      <SponsoredCarousel
        title="Travel packages & partner offers"
        detail="Bundled visa, flight, hotel and insurance packages from our partner network."
        listings={sponsoredPackages}
      />

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Plane;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-t-lg border border-b-0 px-5 py-2.5 text-sm font-semibold transition ${
        active ? 'border-ink-200 bg-white text-ink-900' : 'border-transparent text-white/70 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function TripTypeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:border-brand-300'
      }`}
    >
      {label}
    </button>
  );
}

function TextField({
  label,
  icon: Icon,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  icon: typeof MapPin;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <div className="flex h-12 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
        <Icon className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full min-w-0 bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
        />
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <div className="flex h-12 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
        <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          type="date"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full min-w-0 bg-transparent text-sm font-medium text-ink-900 outline-none"
        />
      </div>
    </div>
  );
}

function AirportSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Airport;
  onChange: (airport: Airport) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = airports.filter((airport) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      airport.city.toLowerCase().includes(q) ||
      airport.country.toLowerCase().includes(q) ||
      airport.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-left hover:border-brand-300"
      >
        <CircleFlag countryCode={value.countryCode} label={value.country} size={20} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-900">{value.city}</span>
          <span className="block text-[11px] text-ink-400">{value.code}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" aria-label="close" onClick={() => setOpen(false)} className="fixed inset-0 z-30" />
          <div className="absolute left-0 right-0 top-full z-40 mt-1 w-72 border border-ink-200 bg-white p-2 shadow-xl">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city, airport or code"
              className="mb-1 h-9 w-full rounded-md border border-ink-200 px-3 text-sm outline-none focus:border-brand-500"
            />
            <div className="max-h-64 overflow-y-auto">
              {filtered.map((airport) => (
                <button
                  key={airport.code}
                  type="button"
                  onClick={() => {
                    onChange(airport);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-ink-50 ${
                    airport.code === value.code ? 'bg-brand-50' : ''
                  }`}
                >
                  <CircleFlag countryCode={airport.countryCode} label={airport.country} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-800">
                      {airport.city}, {airport.country}
                    </span>
                    <span className="block text-[11px] text-ink-400">{airport.code}</span>
                  </span>
                  {airport.code === value.code && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-ink-400">No matches</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
