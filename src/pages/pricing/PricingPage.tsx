import { useEffect } from 'react';
import { noteMilestone } from '@/lib/emailAttribution';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { WRAP, nav } from '@/lib/pageLayout';
import { BOOK, BOOK_ONLY_PRICE, FEATURES_TITLE, MEMBERSHIP_PLAN, MEMBERSHIP_PRICE, MEMBERSHIP_PRICE_LABEL, PLANS, useMyPlan } from '@/lib/plans';
import { LaunchOfferBox, MissionNote } from '@/components/pro/LaunchOffer';
import { FeatureList } from '@/components/pro/FeatureList';
import { trackBilling } from '@/lib/billing';
import { PricingSwitch } from '@/pages/pricing/PricingSwitch';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';
import { EmployerLogos } from '@/components/common/EmployerLogos';
import { TestimonialsSection } from '@/components/common/Testimonials';
import { PRO_TESTIMONIALS } from '@/data/testimonials';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const membership = PLANS[MEMBERSHIP_PLAN];
const CTA = `Get Book + 1 Year for ${MEMBERSHIP_PRICE}`;

export function PricingPage({ go, onAuth }: Props) {
  const my = useMyPlan();

  useSeo({
    title: SEO_META.pricing.title,
    description: `The book “${BOOK.title}” + 1 year of MadeVisa Membership: ${MEMBERSHIP_PRICE_LABEL}. Jobs from company career pages, CV match on every job, companies that sponsor visas and sponsorship documents. Book only: ${BOOK_ONLY_PRICE}. No subscription.`,
    path: '/pricing',
  });

  useEffect(() => {
    trackBilling('pricing_viewed', { plan: my.plan });
    noteMilestone('pricing_viewed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    // Older links (emails, ads) pointed at /pricing#employers.
    if (id === 'employers') return nav(`/pricing/employers${window.location.search}`);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  // Straight to the "Opening secure payment…" screen, then Gumroad. No account needed first.
  const getStarted = (source: string) => nav(`/checkout?source=${source}`);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-10 text-center sm:py-14`}>
          <PricingSwitch active="seekers" />
          <h1 className="mx-auto mt-6 max-w-3xl text-[34px] font-bold leading-[1.08] tracking-tight text-ink-950 sm:text-[56px]">
            The book + 1 year of everything.
            <span className="block text-brand-700">{MEMBERSHIP_PRICE}. Pay once.</span>
          </h1>
          <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
            {['The 2026–2027 job market book', '500,000+ more jobs a month', 'Visa sponsor proof', 'CV match on every job'].map((t) => (
              <li key={t} className="flex items-center gap-1.5 rounded-full bg-ink-50 px-3.5 py-1.5 text-[14px] font-semibold text-ink-800 ring-1 ring-ink-200">
                <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
        {my.isPaid && (
          <p className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> You’re a member
            {my.sub?.current_period_end && new Date(my.sub.current_period_end).getFullYear() < new Date().getFullYear() + 20 ? ` until ${new Date(my.sub.current_period_end).toLocaleDateString()}` : ''}. Thank you!{' '}
            <AppLink href="/profile?tab=settings#billing" className="font-semibold underline">
              Billing
            </AppLink>
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          {/* The offer: Book Only / Book + 1 Year Membership */}
          <section aria-labelledby="plan-title" className="lg:sticky lg:top-24">
            <h2 id="plan-title" className="sr-only">
              {membership.name}: the book + 1 year for {MEMBERSHIP_PRICE}, or the book only for {BOOK_ONLY_PRICE}
            </h2>
            <LaunchOfferBox className="shadow-soft-lg sm:px-7 sm:pt-7" source="pricing" onBuy={() => getStarted('pricing')}>
              {my.isPaid ? (
                <button type="button" onClick={() => nav('/jobs')} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink-950 text-[15.5px] font-bold text-white hover:bg-ink-800">
                  Browse jobs <ArrowRight className="h-4 w-4" />
                </button>
              ) : undefined}
            </LaunchOfferBox>
            <MissionNote className="mt-4" />
            <p className="mt-3 text-center text-[13.5px]">
              <AppLink href="/book" className="font-semibold text-brand-700 hover:underline">
                About the book →
              </AppLink>
            </p>
          </section>

          {/* What's included: the five features, numbered */}
          <section aria-labelledby="included-title">
            <h2 id="included-title" className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              {FEATURES_TITLE}
            </h2>
            <FeatureList className="mt-5" />
          </section>
        </div>

        {/* Employers */}
        <section aria-labelledby="employers-title" className="mt-14 text-center">
          <h2 id="employers-title" className="text-[22px] font-bold tracking-tight text-ink-950">
            Jobs from employers like these
          </h2>
          <EmployerLogos className="mx-auto mt-5 max-w-4xl" />
          <p className="mx-auto mt-3 text-[12px] font-semibold text-ink-400">Not partners or endorsers of MadeVisa</p>
        </section>

        {/* Closing */}
        <section className="mt-14 rounded-2xl bg-brand-700 px-6 py-10 text-center text-white sm:px-10 sm:py-12">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">Your next opportunity starts here.</h2>
          {!my.isPaid && (
            <button
              type="button"
              onClick={() => getStarted('pricing_bottom')}
              className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-white px-7 text-[15px] font-bold text-brand-700 shadow-sm hover:bg-brand-50 sm:w-auto"
            >
              {CTA} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </section>

        {/* Members' own feedback. Keep it here: Google reads the ratings in this page's data and wants them visible on it. */}
        <TestimonialsSection id="pricing-feedback" eyebrow="From MadeVisa members" items={PRO_TESTIMONIALS} title="What the membership did for them." sub={`${PRO_TESTIMONIALS.length} members, all 5 stars`} initial={3} className="mt-16" />

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-5">
            <Faq
              items={[
                { q: 'How does it work?', a: `Two options. Book Only (${BOOK_ONLY_PRICE}): the complete digital guide “${BOOK.title}”. Book + 1 Year MadeVisa Membership (${MEMBERSHIP_PRICE}): the book plus one year of everything above — 500,000+ more jobs and 2,000+ more companies’ jobs unlocked every month. One payment: no subscription, nothing renews, nothing to cancel.` },
                { q: 'Is a job, an interview or a visa guaranteed?', a: 'No plan can promise that, and nobody honest will. What we do guarantee: if MadeVisa doesn’t show you at least 10 open jobs in your field at companies with an official visa-sponsor record within your first 14 days, you get a full refund. See the Subscription Terms.' },
                { q: 'What do I get for free?', a: 'Every job on MadeVisa, with search and filters. Applying to a job, CV match and the rest of the list above are part of the membership.' },
                { q: 'Do I need an account before I pay?', a: 'No. Press Get it and pay on Gumroad with your email. If you don’t have a MadeVisa account yet, we create one with that email and send you a sign-in link; if you do, the membership goes on it.' },
                { q: 'How many sponsorship documents are included?', a: 'Unlimited, with a fair-use limit of 30 in any 7 days. A sponsorship document is a proposal you send to an employer when a job needs a visa: the route that may apply, what it asks of the employer and who you suggest pays what. It isn’t a contract, a job offer or legal advice.' },
                { q: 'How is the CV match worked out?', a: 'MadeVisa reads the job ad and your CV and compares the skills the ad names, whether your roles fit the job, years of experience, the ad’s wording, languages and education. It’s the same rules for every job, and it never looks at age, gender, nationality or a photo. A score shows how well your CV, as written, fits the ad; it isn’t a prediction that you’ll get the job.' },
                { q: 'Is the price the same in every country?', a: `Yes: ${MEMBERSHIP_PRICE_LABEL}, in US dollars, everywhere. Gumroad adds sales tax or VAT at checkout where it applies, and your bank may convert the amount into your currency.` },
                { q: 'How do I pay?', a: 'On Gumroad, our payment partner and the seller on your receipt. MadeVisa never sees your card. Your membership starts once Gumroad confirms the payment, usually within a minute.' },
                { q: 'What happens after the year?', a: 'Your membership simply ends — nothing is charged. You keep the book. You can buy another year whenever you like.' },
                { q: 'Can I get a refund?', a: 'There’s nothing to cancel: you pay once. Within 14 days of paying, if you haven’t used a paid feature yet, you get a full refund — write to hello@madevisa.com. See the Subscription Terms.' },
              ]}
            />
          </div>
          <p className="mt-4 text-[13px] text-ink-500">
            <AppLink href="/subscription-terms" className="font-semibold text-brand-700 hover:underline">
              Subscription terms
            </AppLink>
          </p>
        </section>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

