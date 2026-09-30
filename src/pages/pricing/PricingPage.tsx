import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Crown, Sparkles } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/visaFit';
import { missingProfileFields, PRO_FEATURES, useMyPlan, type Billing, type PlanId } from '@/lib/plans';
import { EMPLOYER_PRICES, priceNote, PRO_MONTHLY_DOCS, PRO_PRICE, usePrices } from '@/lib/pricing';
import { priceRequestLabel } from '@/components/briefs/BuyOffers';
import { OfferInfo } from '@/components/briefs/OfferBits';
import { OfferJobPicker } from '@/components/briefs/OfferJobPicker';
import { BuyOffers } from '@/components/briefs/BuyOffers';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const FREE = ['Every job, straight from company career pages', 'Your first sponsorship document, free', 'Reply-rate and hiring-activity line on every job', 'Your visa route for every job', 'Track your applications, with reminders', 'Visa guides for 20+ countries'];

const EMPLOYER: { id: PlanId; name: string; price: string; unit: string; text: string; points: string[] }[] = [
  { id: 'sponsored_job', name: 'Sponsored job', price: `$${EMPLOYER_PRICES.sponsoredJob}`, unit: 'per job · 30 days', text: 'Pinned at the top of /jobs and on the homepage, labelled Sponsored.', points: ['Reviewed within a day', 'Nothing charged before approval', 'Packs of 3+ at a discount'] },
  { id: 'featured_social', name: 'Featured in social posts', price: `+$${EMPLOYER_PRICES.featuredSocial}`, unit: 'per job', text: 'Your role in MadeVisa’s LinkedIn, Instagram and Facebook job posts, labelled Sponsored.', points: ['Real job seekers, fresh posts', 'Direct link to your job', 'Add to any sponsored job'] },
  { id: 'employer', name: 'Employer plan', price: `from $${EMPLOYER_PRICES.employerPlanFrom}`, unit: 'per month', text: 'Always-on sponsored slots, applicant-interest stats and your reply speed vs. similar companies.', points: ['Verified company page', 'Team access', 'Monthly hiring report'] },
  { id: 'hiring_brief', name: 'Hiring Brief', price: `$${EMPLOYER_PRICES.hiringBrief}`, unit: 'per brief', text: 'What hiring one person from a given country involves: route, timeline, costs and who pays what.', points: ['Plain language', 'Official sources', 'Delivered in 2 working days'] },
];

export function PricingPage({ go, onAuth }: Props) {
  const { profile } = useAuth();
  const { isPro, sub } = useMyPlan();
  const [billing, setBilling] = useState<Exclude<Billing, 'one_time'>>('yearly');
  const [dialog, setDialog] = useState<{ plan: PlanId; billing: Billing; label: string } | null>(null);

  useSeo({
    title: 'Pricing — MadeVisa Pro for job seekers, sponsored jobs for employers',
    description: 'Free job search with reply rates and visa routes on every job. Pro adds instant job alerts, full company response data and visa-sponsoring companies. Fair prices by country.',
    path: '/pricing',
  });

  const prices = usePrices();
  const region = prices.tier;
  const pro = prices.pro;
  const proLabel = priceRequestLabel(prices, billing === 'monthly' ? 'Pro monthly' : 'Pro yearly', billing === 'monthly' ? pro.monthly : pro.yearly);
  const saving = pro.saving;
  const PRO_PRICE_USD = PRO_PRICE[prices.tier].monthly;
  const missing = useMemo(() => (profile ? missingProfileFields(profile) : []), [profile]);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-12 text-center sm:py-16`}>
          <p className="text-sm font-semibold text-brand-700">Pricing</p>
          <h1 className="mx-auto mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink-950 sm:text-5xl">Free to search. Pro to get there first.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-7 text-ink-600">
            Every job, reply rate and visa route is free. Pro adds instant alerts, full company data and the companies that sponsor visas — so you apply early, and to the right places.
          </p>
          <p className="mt-3 text-xs text-ink-500">{priceNote(prices, countryName)}</p>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
        {/* Sponsor offers first: your last jobs → prepare the PDF, then buy more. */}
        <section id="offers" className="mb-14 scroll-mt-24 space-y-5">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-ink-950">Sponsor offers</h2>
            <OfferInfo />
          </div>
          {profile && <OfferJobPicker limit={3} onAuth={onAuth} />}
          <BuyOffers onAuth={onAuth} onPro={() => document.getElementById('pro')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        </section>

        {isPro && (
          <p className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> You’re on MadeVisa Pro{sub?.current_period_end ? ` until ${new Date(sub.current_period_end).toLocaleDateString()}` : ''}. Thank you!
          </p>
        )}

        {profile && missing.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">
              <strong>Finish your profile to get matched alerts:</strong> add your {missing.join(', ')}.
            </p>
            <AppLink href="/profile" className="shrink-0 text-sm font-semibold text-amber-900 underline">
              Complete profile
            </AppLink>
          </div>
        )}

        {/* Monthly / yearly — right above the plans it changes */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">Plans</h2>
          <div className="inline-flex rounded-full bg-ink-100 p-1 text-sm font-semibold" role="tablist" aria-label="Billing">
            {(['monthly', 'yearly'] as const).map((b) => (
              <button key={b} role="tab" aria-selected={billing === b} onClick={() => setBilling(b)} className={`rounded-full px-4 py-1.5 ${billing === b ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>
                {b === 'monthly' ? 'Monthly' : `Yearly · save ${saving}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6">
            <p className="text-lg font-bold text-ink-950">Free</p>
            <p className="mt-2 text-3xl font-bold text-ink-950">{prices.m(0).label}</p>
            <p className="text-sm text-ink-500">forever</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {FREE.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-ink-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> {f}
                </li>
              ))}
            </ul>
            {!profile && (
              <button onClick={() => onAuth?.('register')} className="mt-6 rounded-lg border border-ink-200 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Create free account
              </button>
            )}
          </div>

          {/* Pro */}
          <div id="pro" className="relative flex scroll-mt-24 flex-col rounded-2xl border-2 border-brand-600 bg-white p-6 shadow-lg">
            <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
              <Sparkles className="h-3.5 w-3.5" /> Most popular
            </span>
            <p className="text-lg font-bold text-ink-950">MadeVisa Pro</p>
            <p className="mt-2 text-3xl font-bold text-ink-950">
              {billing === 'monthly' ? pro.monthly.label : pro.yearly.label}
              <span className="text-base font-medium text-ink-500"> / {billing === 'monthly' ? 'month' : 'year'}</span>
            </p>
            <p className="text-sm text-ink-500">{billing === 'yearly' ? `${pro.yearlyPerMonth.label} a month, billed yearly` : 'Cancel any time'}</p>
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {PRO_MONTHLY_DOCS} sponsorship documents a month · {pro.perDoc.label} each
            </p>
            <ul className="mt-5 flex-1 space-y-3">
              <li className="text-sm font-semibold text-ink-900">Everything in Free, plus:</li>
              {PRO_FEATURES.map((f) => (
                <li key={f.title} className="flex gap-2 text-sm text-ink-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <span>
                    <strong className="text-ink-900">{f.title}.</strong> {f.text}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setDialog({ plan: 'pro', billing, label: proLabel })}
              disabled={isPro}
              className="mt-6 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isPro ? 'Your current plan' : 'Get Pro'}
            </button>
          </div>

          {/* Pro Relocation — everything in Pro, plus a personal plan for one country */}
          <div className="relative flex flex-col rounded-2xl bg-ink-950 p-6 text-white shadow-lg">
            <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-ink-950">
              <Crown className="h-3.5 w-3.5" /> Best for moving soon
            </span>
            <p className="text-lg font-bold">Pro Relocation</p>
            <p className="mt-2 text-3xl font-bold">{prices.relocation.label}</p>
            <p className="text-sm text-white/60">one-time · 3 months of Pro, for one country</p>
            <p className="mt-3 rounded-lg bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-300">
              {3 * PRO_MONTHLY_DOCS} sponsorship documents · 3 months of Pro
            </p>
            <ul className="mt-5 flex-1 space-y-3">
              <li className="text-sm font-semibold">Everything in Pro for 3 months, plus:</li>
              {[
                ['Your personal relocation plan', 'The visa routes your passport qualifies for in the country you choose, with every step and deadline.'],
                ['Document checklist', 'What to gather, translate and certify — in the right order.'],
                ['Real costs', 'Visa fees, deposits and your first months, so you know the budget before you apply.'],
                ['Employers that sponsor there', 'A shortlist of companies in your field that hired from abroad recently.'],
                ['Priority help', 'Questions answered by email within one working day.'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-2 text-sm text-white/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    <strong className="text-white">{t}.</strong> {d}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/50">
              Pro for 3 months alone: {prices.m(Math.round(PRO_PRICE_USD * 3)).label}
            </p>
            <button
              onClick={() => setDialog({ plan: 'relocation', billing: 'one_time', label: priceRequestLabel(prices, 'Pro Relocation', prices.relocation) })}
              className="mt-3 rounded-lg bg-amber-400 py-3 text-sm font-bold text-ink-950 hover:bg-amber-300"
            >
              Get Pro Relocation
            </button>
          </div>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">For employers and companies</h2>
          <p className="mt-1 text-[15px] text-ink-600">Reach people looking for exactly your roles — including the ones ready to relocate. Paying never changes Company Scores or rankings.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EMPLOYER.map((e) => (
              <div key={e.id} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5">
                <p className="font-bold text-ink-950">{e.name}</p>
                <p className="mt-2 text-2xl font-bold text-ink-950">{e.price}</p>
                <p className="text-xs text-ink-500">{e.unit}</p>
                <p className="mt-3 text-sm leading-6 text-ink-600">{e.text}</p>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {e.points.map((p) => (
                    <li key={p} className="flex gap-2 text-xs text-ink-600">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" /> {p}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setDialog({ plan: e.id, billing: e.id === 'employer' ? 'monthly' : 'one_time', label: `${e.price} ${e.unit}` })} className="mt-4 rounded-lg border border-ink-200 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                  Request
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-5">
            <Faq
              items={[
                { q: 'Is a sponsor offer legally binding?', a: 'Not on its own. It’s a proposal that becomes binding only when both you and the employer sign it, or when its terms go into your employment contract. It never covers costs the law puts on the employer, never touches salary, and isn’t legal advice.' },
                { q: 'How do I attach a sponsor offer to my application?', a: 'Open the offer, press Save as PDF, and upload it as an extra document next to your CV. If the form has no upload field, paste the offer’s link into your cover letter or message.' },
                { q: 'How much does a sponsorship document cost?', a: `One credit each. Your first document is free. Credits come in packs of 1, 5 or 15 — from ${prices.packs[0].price.label} for one, down to ${prices.packs[2].perDoc.label} each in the pack of 15 — and never expire. Pro includes ${PRO_MONTHLY_DOCS} a month. You review every document before a credit is used; once approved it’s final and can’t be edited.` },
                { q: 'Can I get a refund?', a: 'Unused credits you bought can be refunded within 14 days of purchase. A prepared document is delivered instantly and is final, so its credit can’t be refunded — unless something went wrong on our side, such as a double charge or a document that didn’t generate. The free first document has no cash value. Pro can be cancelled any time and stops at the end of the period; see the Sponsorship Document Terms.' },
                { q: 'How do I pay?', a: 'Choose a plan and send the short form. We email you a secure payment link within one working day, and your plan starts as soon as it’s paid. No card is needed to send the request.' },
                { q: 'Why is the price different in my country?', a: 'Prices follow local incomes, so MadeVisa is affordable wherever you’re applying from. We check where you are from your internet connection and show prices in your currency when we can (otherwise in US dollars). A credit is worth one document everywhere, and Pro includes the same features and documents in every country.' },
                { q: 'Can I cancel?', a: 'Yes. Monthly plans stop at the end of the month; yearly plans at the end of the year. Email hello@madevisa.com.' },
                { q: 'Does paying change Company Scores?', a: 'Never. Scores and reply rates are calculated the same way for every company — see our Advertising Policy.' },
                { q: 'Why do you ask for my role and experience?', a: 'Job alerts and visa matching use them to send you only the roles that fit. You can change them any time in your profile.' },
              ]}
            />
          </div>
        </section>
      </main>

      {dialog && <PlanRequestDialog plan={dialog.plan} billing={dialog.billing} priceLabel={dialog.label} region={region} onClose={() => setDialog(null)} onAuth={onAuth} />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
