import type { MouseEvent } from 'react';
import { ArrowDown, FileCheck2, Paperclip, SlidersHorizontal } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { WRAP, nav } from '@/lib/pageLayout';
import { docsLabel, useOfferCredits } from '@/lib/sponsorOffer';
import { usePrices } from '@/lib/pricing';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { OfferFlags } from '@/components/briefs/OfferBits';
import { OfferJobPicker } from '@/components/briefs/OfferJobPicker';
import { BuyOffers } from '@/components/briefs/BuyOffers';
import { CustomOfferCard } from '@/components/briefs/CustomOfferCard';
import { OfferOddsStat } from '@/components/briefs/OfferOddsStat';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const WHY: { icon: typeof FileCheck2; title: string; text: string }[] = [
  { icon: FileCheck2, title: 'Pick a job', text: 'Any job you opened on MadeVisa — or type any company yourself.' },
  { icon: SlidersHorizontal, title: 'Choose who pays what', text: 'Start from balanced, recommended terms. The route and the employer’s few steps are filled in for you.' },
  { icon: Paperclip, title: 'Attach the PDF when you apply', text: 'One page, ready to sign. The employer sees exactly how hiring you works — and that it’s cheaper than they think.' },
];

/**
 * /offers — sponsorship documents in one straight page:
 *   hero (what it is, why it works, your credits) → how it works (3 steps)
 *   → your jobs → any other company → credits.
 */
export function OffersPage({ go, onAuth }: Props) {
  const { user } = useAuth();
  const credits = useOfferCredits();
  const prices = usePrices();

  useSeo({
    title: 'Sponsorship offer for your job application — MadeVisa',
    description: 'Job doesn’t mention a visa? Attach a one-page sponsorship offer: the visa route, the employer’s steps and who pays what. Your first one is free.',
    path: '/offers',
  });

  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'offers' as View} />

      {/* 1. What it is and why it works */}
      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-10 sm:py-14`}>
          <OfferFlags size={28} />
          <h1 className="mt-5 max-w-3xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[48px]">Job doesn’t mention a visa? Make them an offer.</h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-white/85 sm:text-[17px]">
            Most employers skip sponsorship because they guess it’s slow, costly and risky. A one-page offer shows them the legal route, their few steps, and which costs
            you’ll cover.
          </p>
          <OfferOddsStat light className="mt-6" />
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {user ? (
              <a href="#jobs" onClick={jump('jobs')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50">
                Prepare for a job <ArrowDown className="h-4 w-4" />
              </a>
            ) : (
              <button onClick={() => onAuth?.('register')} className="rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50">
                Try it free
              </button>
            )}
            <a href="#custom" onClick={jump('custom')} className="rounded-full px-5 py-3.5 text-[15px] font-bold text-white ring-1 ring-white/40 hover:bg-white/10">
              Any other company
            </a>
            <p className="text-[14px] text-white/80">
              {credits ? (
                <>
                  You have <strong className="text-white">{docsLabel(credits.left)}</strong> left
                </>
              ) : (
                <>
                  First one free · then from <strong className="text-white">{prices.packs[2].perDoc.label}</strong>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <main className={`${WRAP} space-y-12 py-10 sm:py-12`}>
        {/* 2. How it works */}
        <ol className="grid gap-3 sm:grid-cols-3">
          {WHY.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-200">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink-950">
                  <span className="mr-1 tabular-nums text-ink-400">{i + 1}.</span>
                  {title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-5 text-ink-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* 3. Your jobs */}
        <div id="jobs" className="scroll-mt-24">
          <OfferJobPicker onAuth={onAuth} />
          {user && (
            <p className="mt-2 text-right text-[13px]">
              <a
                href="/profile"
                onClick={(e) => {
                  e.preventDefault();
                  nav('/profile');
                }}
                className="font-semibold text-[#1D4ED8] hover:underline"
              >
                All your documents →
              </a>
            </p>
          )}
        </div>

        {/* 4. Any other company */}
        <div id="custom" className="scroll-mt-24">
          <CustomOfferCard onAuth={onAuth} />
        </div>

        {/* 5. Credits */}
        <section id="buy" aria-labelledby="buy-title" className="scroll-mt-24">
          <h2 id="buy-title" className="text-[17px] font-bold text-ink-950">
            Credits
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-500">One credit prepares one document. Priced for your country.</p>
          <div className="mt-3">
            <BuyOffers onAuth={onAuth} onPro={() => nav('/pricing#pro')} />
          </div>
        </section>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
