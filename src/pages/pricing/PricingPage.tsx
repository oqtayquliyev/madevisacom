import { useEffect } from 'react';
import { noteMilestone } from '@/lib/emailAttribution';
import { ArrowRight, CheckCircle2, FileSignature, Globe2, Laptop, Lightbulb, Lock, Plane, ScanSearch, Zap, type LucideIcon } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { WRAP, nav } from '@/lib/pageLayout';
import { MEMBERSHIP_PLAN, MEMBERSHIP_PRICE, PLANS, QUARTER_PER_MONTH, QUARTER_PRICE, QUARTER_SAVING, useMyPlan, type MembershipBilling } from '@/lib/plans';
import { trackBilling } from '@/lib/billing';
import { PricingSwitch } from '@/pages/pricing/PricingSwitch';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';
import { EmployerLogos } from '@/components/common/EmployerLogos';
import { TestimonialsSection } from '@/components/common/Testimonials';
import { PRO_TESTIMONIALS } from '@/data/testimonials';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

/** The membership's benefits, each with its icon (copy: supabase/functions/_shared/plans.ts). */
const ICONS: LucideIcon[] = [Globe2, Zap, Laptop, ScanSearch, Lightbulb, Plane, FileSignature];
const membership = PLANS[MEMBERSHIP_PLAN];
const CTA = `Get 3 months for ${QUARTER_PRICE}`;

export function PricingPage({ go, onAuth }: Props) {
  const my = useMyPlan();

  useSeo({
    title: SEO_META.pricing.title,
    description: `MadeVisa Membership: ${QUARTER_PRICE} for 3 months, or ${MEMBERSHIP_PRICE} a month. Jobs from company career pages, remote listings, CV match on every job, companies that sponsor visas and sponsorship documents. Same price in every country, cancel anytime.`,
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
  const getStarted = (source: string, billing: MembershipBilling = 'quarterly') => nav(`/checkout?source=${source}&billing=${billing}`);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-10 text-center sm:py-14`}>
          <PricingSwitch active="seekers" />
          <h1 className="mx-auto mt-6 max-w-3xl text-[34px] font-bold leading-[1.08] tracking-tight text-ink-950 sm:text-[56px]">
            Your job-search toolkit.
            <span className="block text-brand-700">3 months for {QUARTER_PRICE}.</span>
          </h1>
          <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
            {['Jobs from company career pages', 'Visa sponsor proof', 'CV match on every job', 'Checked live, scam-screened'].map((t) => (
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
            {my.sub?.current_period_end ? ` until ${new Date(my.sub.current_period_end).toLocaleDateString()}` : ''}. Thank you!{' '}
            <AppLink href="/profile?tab=settings#billing" className="font-semibold underline">
              Billing
            </AppLink>
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          {/* The plans: 3 months first */}
          <section aria-labelledby="plan-title" className="space-y-4 lg:sticky lg:top-24">
            <h2 id="plan-title" className="sr-only">{membership.name}</h2>
            <PlanOption
              title="3 months"
              price={QUARTER_PRICE}
              per={`${QUARTER_PER_MONTH} a month · one payment`}
              badge={`Best value · save ${QUARTER_SAVING}`}
              cta={CTA}
              highlight
              member={my.isPaid}
              onPick={() => getStarted('pricing', 'quarterly')}
            />
            <PlanOption title="Monthly" price={MEMBERSHIP_PRICE} per="a month · cancel anytime" cta={`Get monthly for ${MEMBERSHIP_PRICE}`} member={my.isPaid} onPick={() => getStarted('pricing', 'monthly')} />
            <p className="flex items-center justify-center gap-1.5 text-center text-[13px] font-semibold text-ink-600">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Secure checkout by Gumroad · same price everywhere
            </p>
          </section>

          {/* What's included */}
          <section aria-labelledby="included-title">
            <h2 id="included-title" className="text-2xl font-bold tracking-tight text-ink-950">
              Everything included
            </h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {membership.benefits.map((b, i) => {
                const Icon = ICONS[i] ?? CheckCircle2;
                return (
                  <li key={b.title} className="flex gap-3.5 rounded-xl border border-ink-200 bg-white p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 self-center text-[15.5px] font-bold leading-snug text-ink-950" title={b.text}>
                      {b.title}
                    </span>
                  </li>
                );
              })}
            </ul>
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
                { q: 'How does the 3-month plan work?', a: `One payment of ${QUARTER_PRICE} for 3 months (${QUARTER_PER_MONTH} a month), renewed every 3 months until you cancel. Cancel anytime in Settings → Billing; you keep everything until the end of the 3 months you paid for. Monthly is ${MEMBERSHIP_PRICE} a month.` },
                { q: 'Is a job, an interview or a visa guaranteed?', a: 'No plan can promise that, and nobody honest will. What we do guarantee: if MadeVisa doesn’t show you at least 10 open jobs in your field at companies with an official visa-sponsor record within your first 14 days, you get a full refund. See the Subscription Terms.' },
                { q: 'What do I get for free?', a: 'Every job on MadeVisa, with search and filters. Applying to a job, CV match and the rest of the list above are part of the membership.' },
                { q: 'Do I need an account before I pay?', a: 'No. Press Get Started and pay on Gumroad with your email. If you don’t have a MadeVisa account yet, we create one with that email and send you a sign-in link; if you do, the membership goes on it.' },
                { q: 'How many sponsorship documents are included?', a: '20 a month, at most 30 in any 7 days. A sponsorship document is a proposal you send to an employer when a job needs a visa: the route that may apply, what it asks of the employer and who you suggest pays what. It isn’t a contract, a job offer or legal advice.' },
                { q: 'How is the CV match worked out?', a: 'MadeVisa reads the job ad and your CV and compares the skills the ad names, whether your roles fit the job, years of experience, the ad’s wording, languages and education. It’s the same rules for every job, and it never looks at age, gender, nationality or a photo. A score shows how well your CV, as written, fits the ad; it isn’t a prediction that you’ll get the job.' },
                { q: 'Is the price the same in every country?', a: `Yes: ${QUARTER_PRICE} for 3 months or ${MEMBERSHIP_PRICE} a month, in US dollars, everywhere. Gumroad adds sales tax or VAT at checkout where it applies, and your bank may convert the amount into your currency.` },
                { q: 'How do I pay?', a: 'On Gumroad, our payment partner and the seller on your receipt. MadeVisa never sees your card. Your membership starts once Gumroad confirms the payment, usually within a minute.' },
                { q: 'Can I cancel? Can I get a refund?', a: 'Yes, cancel anytime in Settings → Billing (it opens your membership on Gumroad) or from the link in your receipt; you keep the membership until the end of the period you paid for. Within 14 days of first joining, if you haven’t used a paid feature yet, you get a full refund — write to hello@madevisa.com. See the Subscription Terms.' },
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

/** One plan: title, big price, one line, the button. */
function PlanOption(p: { title: string; price: string; per: string; badge?: string; cta: string; highlight?: boolean; member: boolean; onPick: () => void }) {
  return (
    <div className={`relative rounded-2xl bg-white p-6 sm:p-7 ${p.highlight ? 'border-2 border-brand-600 shadow-soft-lg' : 'border border-ink-200'}`}>
      {p.badge && <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white">{p.badge}</span>}
      <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-brand-700">{p.title}</p>
      <p className="mt-2 text-5xl font-extrabold tracking-tight text-ink-950">{p.price}</p>
      <p className="mt-1.5 text-[15px] font-semibold text-ink-600">{p.per}</p>
      {p.member ? (
        <button type="button" onClick={() => nav('/jobs')} className="mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-ink-100 px-5 text-[15px] font-bold text-ink-900 hover:bg-ink-200">
          Browse jobs <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={p.onPick}
          className={`mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${p.highlight ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700' : 'bg-white text-ink-900 ring-1 ring-ink-300 hover:bg-ink-50'}`}
        >
          {p.cta} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
