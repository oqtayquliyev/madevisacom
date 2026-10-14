import type { MouseEvent } from 'react';
import { ArrowDown, FileCheck2, Paperclip, SlidersHorizontal } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { useAuth } from '@/lib/auth';
import { WRAP, nav } from '@/lib/pageLayout';
import { allowanceLabel, useOfferCredits } from '@/lib/sponsorOffer';
import { priceLabel } from '@/lib/plans';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { OfferFlags } from '@/components/briefs/OfferBits';
import { OfferJobPicker } from '@/components/briefs/OfferJobPicker';
import { ProPlanCard } from '@/components/pro/ProPlanCard';
import { CustomOfferCard } from '@/components/briefs/CustomOfferCard';
import { OfferOddsStat } from '@/components/briefs/OfferOddsStat';
import { OfferFlip } from '@/components/briefs/OfferFlip';
import { InviteCard } from '@/components/briefs/InviteCard';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const WHY: { icon: typeof FileCheck2; title: string; text: string }[] = [
  { icon: FileCheck2, title: 'Open a job and check your match', text: 'The document is listed under “Your application” as the missing piece. Or type any company yourself, below.' },
  { icon: SlidersHorizontal, title: 'Choose who pays what', text: 'Start from a balanced suggestion and change any line. The route that may apply and what it asks of the employer are filled in for you.' },
  { icon: Paperclip, title: 'Attach the PDF when you apply', text: 'A short proposal with the source of every line. The employer sees what sponsoring you would involve, what is confirmed and what is still open, and can reply in one click.' },
];

/**
 * /offers — sponsorship documents in one straight page:
 *   hero (what it is, why it works, what you have left) → how it works
 *   (3 steps) → your jobs → any other company → the plan.
 * No longer in the main menu: people reach the document from a job's
 * "Your application" list, and land here from Pricing and their profile.
 */
export function OffersPage({ go, onAuth }: Props) {
  const { user } = useAuth();
  const credits = useOfferCredits();

  useSeo({ ...SEO_META.offers, path: '/offers' });

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
          <h1 className="mt-5 max-w-3xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[48px]">Job doesn’t mention a visa? Send them a Visa Plan.</h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-white/85 sm:text-[17px]">
            An employer who has never sponsored often doesn’t know what it involves. A Visa Plan is your proposal: the route that may apply, what it asks of them, and which costs
            you offer to cover.
          </p>
          <OfferOddsStat light className="mt-6" />
          <OfferFlip light className="mt-6 max-w-4xl" />
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {user ? (
              <a href="#jobs" onClick={jump('jobs')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50">
                Prepare for a job <ArrowDown className="h-4 w-4" />
              </a>
            ) : (
              <a href="#buy" onClick={jump('buy')} className="rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50">
                See the plan
              </a>
            )}
            <a href="#custom" onClick={jump('custom')} className="rounded-full px-5 py-3.5 text-[15px] font-bold text-white ring-1 ring-white/40 hover:bg-white/10">
              Any other company
            </a>
            <p className="text-[14px] text-white/80">
              {credits && credits.left > 0 ? (
                <>
                  You have <strong className="text-white">{allowanceLabel(credits)}</strong>
                </>
              ) : (
                <>
                  Free: 1 a month. Starter (20 a month, <strong className="text-white">{priceLabel('starter')}</strong>) and Pro (50 a month, <strong className="text-white">{priceLabel('pro')}</strong>)
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

        {/* 5. The plan */}
        <section id="buy" aria-labelledby="buy-title" className="scroll-mt-24">
          <h2 id="buy-title" className="text-[17px] font-bold text-ink-950">
            Included in Starter and Pro
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-500">Sponsorship documents come with the full CV match report. The same price in every country.</p>
          <div className="mt-5 max-w-2xl">
            <ProPlanCard plan="starter" source="documents_page" onAuth={onAuth} compact />
          </div>
          {user && (
            <div className="mt-3">
              <InviteCard />
            </div>
          )}
        </section>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
