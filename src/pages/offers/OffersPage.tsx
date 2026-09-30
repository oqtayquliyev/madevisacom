import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { WRAP, nav } from '@/lib/pageLayout';
import { useOfferCredits } from '@/lib/sponsorOffer';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CreditMeter, OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';
import { OfferDemo, OfferSteps } from '@/components/briefs/OfferDemo';
import { OfferJobPicker } from '@/components/briefs/OfferJobPicker';
import { BuyOffers } from '@/components/briefs/BuyOffers';
import { MyBriefsSection } from '@/components/briefs/MyBriefsSection';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

/** /offers — "Make Offer": pick a job, prepare the PDF, buy more credits. */
export function OffersPage({ go, onAuth }: Props) {
  const { profile } = useAuth();
  const credits = useOfferCredits();

  useSeo({
    title: 'Make a sponsor offer — MadeVisa',
    description: 'Show employers how hiring you works: the visa route, the steps on their side and which costs you carry. One page, ready to sign. 5 free.',
    path: '/offers',
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'offers' as View} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-10 sm:py-14`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <OfferFlags size={30} />
            {credits && <CreditMeter credits={credits} light />}
          </div>
          <div className="mt-6 flex items-start gap-2">
            <h1 className="max-w-3xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[48px]">Make an offer they can sign.</h1>
            <OfferInfo light className="mt-2" />
          </div>
          <div className="mt-6">
            <OfferSteps light active={0} />
          </div>
        </div>
      </section>

      <main className={`${WRAP} space-y-12 py-10 sm:py-12`}>
        <OfferJobPicker onAuth={onAuth} limit={8} />

        <section aria-labelledby="demo-title">
          <h2 id="demo-title" className="text-[17px] font-bold text-ink-950">
            Drag. The document rewrites itself.
          </h2>
          <div className="mt-3">
            <OfferDemo />
          </div>
        </section>

        <section id="buy" aria-labelledby="buy-title" className="scroll-mt-24">
          <h2 id="buy-title" className="text-[17px] font-bold text-ink-950">
            More offers
          </h2>
          <div className="mt-3">
            <BuyOffers onAuth={onAuth} onPro={() => nav('/pricing#pro')} />
          </div>
        </section>

        {profile && <MyBriefsSection />}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
