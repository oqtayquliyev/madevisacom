import { FileSignature } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { creditsBadge, useOfferCredits } from '@/lib/sponsorOffer';
import { OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';
import { OfferDemo, OfferSteps } from '@/components/briefs/OfferDemo';

/** Landing: what a sponsor offer is, shown rather than told. */
export function OfferSection() {
  const credits = useOfferCredits();
  return (
    <section aria-labelledby="landing-offer" className="mx-auto max-w-7xl px-3 py-14 sm:px-8 sm:py-20 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <OfferFlags size={26} />
          <div className="mt-4 flex items-start gap-2">
            <h2 id="landing-offer" className="max-w-2xl text-[30px] font-bold leading-[1.1] tracking-tight text-ink-950 sm:text-[40px]">
              Job doesn’t mention a visa? Make them an offer.
            </h2>
            <OfferInfo className="mt-2" />
          </div>
        </div>
        <a
          href="/offers"
          onClick={(e) => {
            e.preventDefault();
            nav('/offers');
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[#1D4ED8] px-6 py-3.5 text-[15px] font-bold text-white shadow-soft-lg hover:bg-brand-800"
        >
          <FileSignature className="h-4 w-4" /> Make Offer
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700">{creditsBadge(credits)}</span>
        </a>
      </div>
      <div className="mt-6">
        <OfferSteps active={1} />
      </div>
      <div className="mt-6">
        <OfferDemo />
      </div>
    </section>
  );
}
