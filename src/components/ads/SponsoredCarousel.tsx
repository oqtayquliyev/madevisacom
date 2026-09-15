import { ArrowRight, Megaphone } from 'lucide-react';

export type SponsoredListing = {
  id: string;
  advertiser: string;
  title: string;
  description: string;
  price?: string;
  image: string;
  url: string;
  badge?: string;
};

type SponsoredCarouselProps = {
  eyebrow?: string;
  title: string;
  detail?: string;
  listings: SponsoredListing[];
};

/**
 * A clearly-labeled advertising rail. Drop this anywhere (landing page,
 * jobs board, programs board, travel page) to sell placements to travel
 * agencies, airlines, insurers, relocation services, etc.
 *
 * Wire real inventory in by replacing `listings` with data from an ad
 * server / CMS — see ADVERTISING in OPPORTUNITIES.md for the plan.
 */
export function SponsoredCarousel({ eyebrow = 'Sponsored', title, detail, listings }: SponsoredCarouselProps) {
  if (listings.length === 0) return null;

  return (
    <section className="border-y border-ink-200 bg-ink-50/60 px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-600">
              <Megaphone className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{title}</h2>
            {detail && <p className="mt-2 max-w-xl text-sm text-ink-500">{detail}</p>}
          </div>

          <p className="text-xs text-ink-400">Advertise here &middot; partners@madevisa.com</p>
        </div>

        <div className="mt-7 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {listings.map((listing) => (
            <a
              key={listing.id}
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="group relative flex w-72 shrink-0 flex-col overflow-hidden border border-ink-200 bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg sm:w-auto"
            >
              <div className="relative h-36 w-full overflow-hidden">
                <img
                  src={listing.image}
                  alt=""
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {listing.badge ?? 'Sponsored'}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{listing.advertiser}</p>
                <h3 className="mt-1 text-sm font-bold text-ink-900">{listing.title}</h3>
                <p className="mt-1.5 flex-1 text-xs leading-5 text-ink-500">{listing.description}</p>

                <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                  {listing.price ? (
                    <span className="text-sm font-bold text-ink-950">{listing.price}</span>
                  ) : (
                    <span className="text-xs text-ink-400">Learn more</span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-brand-600 transition group-hover:translate-x-1" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
