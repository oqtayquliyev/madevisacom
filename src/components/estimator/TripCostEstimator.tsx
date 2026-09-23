import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Info, Plane, Receipt, ShieldCheck, Users } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { useOriginCountry } from '@/lib/originCountry';
import { destinationCosts, estimateTripCost, type DestinationCost } from '@/lib/costEstimates';
import type { View } from '@/types';

function formatUSD(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function TripCostEstimator({ go }: { go?: (view: View) => void }) {
  const { countryCode, countryName } = useOriginCountry();
  const [destination, setDestination] = useState<DestinationCost>(destinationCosts[0]);
  const [nights, setNights] = useState(7);
  const [travelers, setTravelers] = useState(1);
  const [openDestination, setOpenDestination] = useState(false);

  const estimate = useMemo(
    () =>
      estimateTripCost({
        originCountryCode: countryCode,
        destination,
        nights,
        travelers,
      }),
    [countryCode, destination, nights, travelers]
  );

  return (
    <section className="border-y border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Budget in seconds</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              What should this trip cost?
            </h2>
            <p className="mt-2 max-w-xl text-sm text-ink-500">
              Flights (cheapest fares, next 30 days), accommodation and visa fees, estimated automatically for{' '}
              {countryName ? (
                <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
                  <CircleFlag countryCode={countryCode} label={countryName} size={14} />
                  {countryName}
                </span>
              ) : (
                'your route'
              )}
              .
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-6 border border-ink-200 bg-white p-5 shadow-soft sm:p-6 lg:grid-cols-[1fr_1.1fr]">
          {/* CONTROLS */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Destination</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDestination((v) => !v)}
                  className="flex h-12 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-left hover:border-brand-300"
                >
                  <CircleFlag countryCode={destination.countryCode} label={destination.countryName} size={22} />
                  <span className="flex-1 text-sm font-semibold text-ink-900">{destination.countryName}</span>
                  <ChevronDown className={`h-4 w-4 text-ink-400 transition ${openDestination ? 'rotate-180' : ''}`} />
                </button>

                {openDestination && (
                  <>
                    <button
                      type="button"
                      aria-label="close"
                      onClick={() => setOpenDestination(false)}
                      className="fixed inset-0 z-30"
                    />
                    <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto border border-ink-200 bg-white p-1 shadow-xl">
                      {destinationCosts.map((option) => (
                        <button
                          key={option.countryCode}
                          type="button"
                          onClick={() => {
                            setDestination(option);
                            setOpenDestination(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-ink-50 ${
                            option.countryCode === destination.countryCode ? 'bg-brand-50' : ''
                          }`}
                        >
                          <CircleFlag countryCode={option.countryCode} label={option.countryName} size={20} />
                          <span className="text-sm font-medium text-ink-800">{option.countryName}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Nights
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={nights}
                  onChange={(e) => setNights(Math.max(1, Number(e.target.value) || 1))}
                  className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                  <Users className="h-3.5 w-3.5" />
                  Travelers
                </label>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={travelers}
                  onChange={(e) => setTravelers(Math.max(1, Number(e.target.value) || 1))}
                  className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-[11px] leading-4 text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              Estimates only, based on typical regional fares and published visa fees — not a live quote. Confirm
              exact costs before booking or applying.
            </div>
          </div>

          {/* BREAKDOWN */}
          <div className="border-t border-ink-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Estimated total</p>
              <p className="text-2xl font-bold tracking-tight text-ink-950">
                {formatUSD(estimate.totalLowUSD)} – {formatUSD(estimate.totalHighUSD)}
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <CostRow
                icon={Plane}
                label="Flights (round trip, cheapest fares next 30 days)"
                value={`${formatUSD(estimate.flightLowUSD)} – ${formatUSD(estimate.flightHighUSD)}`}
              />
              <CostRow
                icon={Receipt}
                label={`Accommodation (${nights} night${nights === 1 ? '' : 's'})`}
                value={formatUSD(estimate.accommodationTotalUSD)}
              />
              <CostRow
                icon={ShieldCheck}
                label={`Visa fee (${travelers} traveler${travelers === 1 ? '' : 's'})`}
                value={formatUSD(estimate.visaFeeUSD)}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => go?.('travel')}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plane className="h-3.5 w-3.5" />
                See real flight prices
              </button>
              <button
                type="button"
                onClick={() => go?.('agencies')}
                className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                Get a visa quote
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CostRow({ icon: Icon, label, value }: { icon: typeof Plane; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-ink-600">
        <Icon className="h-4 w-4 shrink-0 text-ink-400" />
        {label}
      </span>
      <span className="shrink-0 font-semibold text-ink-900">{value}</span>
    </div>
  );
}
