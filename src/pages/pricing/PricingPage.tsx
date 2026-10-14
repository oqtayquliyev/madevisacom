import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, FileSignature, Lock, Minus } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { WRAP, nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { missingProfileFields, PLANS, priceLabel, useMyPlan, type RequestPlanId } from '@/lib/plans';
import { EMPLOYER_PRICES } from '@/lib/pricing';
import { useCv } from '@/lib/cv/store';
import { useCardPayments } from '@/lib/gumroad';
import { trackBilling, useBillingCatalog } from '@/lib/billing';
import { PlanCard } from '@/components/pro/ProPlanCard';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';
import { TestimonialsSection } from '@/components/common/Testimonials';
import { PRO_TESTIMONIALS } from '@/data/testimonials';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const EMPLOYER: { id: RequestPlanId; name: string; price: string; unit: string; text: string; points: string[] }[] = [
  { id: 'sponsored_job', name: 'Sponsored job', price: `$${EMPLOYER_PRICES.sponsoredJob}`, unit: 'per job · 30 days', text: 'Pinned at the top of /jobs and on the homepage, labelled Sponsored.', points: ['Reviewed within a day', 'Nothing charged before approval', 'Packs of 3+ at a discount'] },
  { id: 'featured_social', name: 'Featured in social posts', price: `+$${EMPLOYER_PRICES.featuredSocial}`, unit: 'per job', text: 'Your role in MadeVisa’s LinkedIn, Instagram and Facebook job posts, labelled Sponsored.', points: ['Real job seekers, fresh posts', 'Direct link to your job', 'Add to any sponsored job'] },
  { id: 'employer', name: 'Employer plan', price: `from $${EMPLOYER_PRICES.employerPlanFrom}`, unit: 'per month', text: 'Always-on sponsored slots, applicant-interest stats and your reply speed vs. similar companies.', points: ['Verified company page', 'Team access', 'Monthly hiring report'] },
  { id: 'hiring_brief', name: 'Hiring Brief', price: `$${EMPLOYER_PRICES.hiringBrief}`, unit: 'per brief', text: 'What hiring one person from a given country involves: route, timeline, costs and who pays what.', points: ['Plain language', 'Official sources', 'Delivered in 2 working days'] },
];

type Cell = string | boolean;
/** What each plan includes, side by side. Limits are the fair-use limits the database applies. */
const compareRows = (autoApply: { free: number; pro: number } | null): { what: string; free: Cell; starter: Cell; pro: Cell }[] => [
  { what: 'Every job, search, filters and visa route', free: true, starter: true, pro: true },
  { what: 'CV match score on every job', free: false, starter: true, pro: true },
  { what: 'Skills missing from your CV, and what the ad also wants', free: false, starter: 'Every job', pro: 'Every job' },
  { what: 'Full report: where each point comes from, what to change', free: false, starter: true, pro: true },
  { what: 'All your best matches, ranked', free: false, starter: true, pro: true },
  { what: 'Saved jobs', free: 'Up to 5', starter: 'No limit', pro: 'No limit' },
  { what: 'Application tracking with reminders', free: true, starter: true, pro: true },
  { what: 'Job alerts', free: '1', starter: 'Up to 5', pro: 'Up to 10' },
  { what: 'Companies that sponsor visas, reply rates', free: false, starter: true, pro: true },
  { what: 'Sponsorship documents', free: '1 a month', starter: '20 a month', pro: '50 a month' },
  { what: 'Auto Apply (tailored CV and cover letter)', free: autoApply ? `${autoApply.free} a month to try` : 'To try', starter: autoApply ? `${autoApply.free} a month to try` : 'To try', pro: autoApply ? `Up to ${autoApply.pro} a month` : true },
  { what: '“Jobs for you” emails', free: '5 jobs each', starter: '5 jobs each', pro: '10 jobs each' },
];

export function PricingPage({ go, onAuth }: Props) {
  const { profile } = useAuth();
  const my = useMyPlan();
  const { cv } = useCv();
  const catalog = useBillingCatalog();
  // Card payments on (Admin → Plans): the answers about paying and cancelling say how that works.
  const card = useCardPayments();
  const [dialog, setDialog] = useState<{ plan: RequestPlanId; billing: 'monthly' | 'one_time'; label: string } | null>(null);

  useSeo({
    title: SEO_META.pricing.title,
    description: `Job search and 1 sponsorship document a month are free. Starter (${priceLabel('starter')}) adds the full CV match report on every job and sponsorship documents; Pro (${priceLabel('pro')}) adds Auto Apply. Same price in every country, cancel any time.`,
    path: '/pricing',
  });

  useEffect(() => {
    trackBilling('pricing_viewed', { plan: my.plan });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = useMemo(() => (profile ? missingProfileFields(profile) : []), [profile]);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  const cell = (v: Cell) =>
    v === true ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Included" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-ink-300" aria-label="Not included" /> : <span className="font-semibold text-ink-900">{v}</span>;
  const aa = catalog?.auto_apply?.enabled ? { free: catalog.auto_apply.free_monthly, pro: catalog.auto_apply.pro_monthly } : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-12 text-center sm:py-16`}>
          <p className="text-sm font-semibold text-brand-700">Pricing</p>
          <h1 className="mx-auto mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink-950 sm:text-5xl">Get noticed. Get hired. Keep growing.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-7 text-ink-600">
            Browsing jobs stays free, with 1 sponsorship document a month. Starter adds CV match on every job; Pro prepares applications for you.
          </p>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
        {my.plan !== 'free' && (
          <p className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> You’re on MadeVisa {PLANS[my.plan].name}
            {my.sub?.current_period_end ? ` until ${new Date(my.sub.current_period_end).toLocaleDateString()}` : ''}. Thank you!{' '}
            <AppLink href="/profile?tab=settings#billing" className="font-semibold underline">
              Billing
            </AppLink>
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

        <h2 className="sr-only">Plans</h2>
        <div className="grid gap-5 lg:grid-cols-3">
          <PlanCard
            plan="free"
            source="pricing"
            onFree={!cv ? { label: 'Upload your CV', onClick: () => nav('/cv-match') } : !profile ? { label: 'Create free account', onClick: () => onAuth?.('register') } : { label: 'Check a job', onClick: () => nav('/jobs') }}
          />
          <PlanCard plan="starter" source="pricing" highlight />
          <PlanCard plan="pro" source="pricing" />
        </div>
        <p className="mt-4 text-center text-[13px] leading-5 text-ink-500">
          Prices in US dollars, the same in every country. Tax is added by Gumroad at checkout where it applies. Billed monthly; cancel any time and keep your plan to the end of the month.{' '}
          <AppLink href="/subscription-terms" className="font-semibold text-brand-700 hover:underline">
            Subscription terms
          </AppLink>
        </p>

        <section className="mt-14" aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-2xl font-bold tracking-tight text-ink-950">
            Compare plans
          </h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs font-bold uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-bold">
                    &nbsp;
                  </th>
                  <th scope="col" className="w-[17%] px-3 py-3 text-center font-bold">
                    Free
                  </th>
                  <th scope="col" className="w-[17%] bg-brand-50 px-3 py-3 text-center font-bold text-brand-800">
                    Starter
                  </th>
                  <th scope="col" className="w-[17%] px-3 py-3 text-center font-bold">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {compareRows(aa).map((r) => (
                  <tr key={r.what}>
                    <th scope="row" className="px-4 py-3 font-medium text-ink-800">
                      {r.what}
                    </th>
                    <td className="px-3 py-3 text-center text-ink-600">{cell(r.free)}</td>
                    <td className="bg-brand-50/60 px-3 py-3 text-center text-ink-600">{cell(r.starter)}</td>
                    <td className="px-3 py-3 text-center text-ink-600">{cell(r.pro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] leading-5 text-ink-500">
            Coming to Pro, not included yet: {PLANS.pro.coming.join('; ')}. Sponsorship documents: at most 30 in any 7 days on every plan. No plan guarantees interviews, a job, sponsorship or a visa.
          </p>
        </section>

        {/* The sponsorship document, where it is now */}
        <section id="offers" className="mt-12 scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <FileSignature className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-ink-950">The sponsorship document</h2>
              <p className="mt-1 text-sm leading-6 text-ink-600">
                A proposal you send with your application when the job needs a visa: the route that may apply, what it asks of the employer and who you suggest pays what. Open any job, check your match, and it is
                listed under “Your application” as the missing piece. Free accounts get 1 a month, Starter 20 and Pro 50.
              </p>
            </div>
            <AppLink href="/offers" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
              <Lock className="h-3.5 w-3.5" /> How it works
            </AppLink>
          </div>
        </section>

        {/* The same Pro members' feedback as /cv-match. Keep it here: Google reads the ratings in this page's data and wants them visible on it. */}
        <TestimonialsSection
          id="pricing-feedback"
          eyebrow="From MadeVisa Pro members"
          items={PRO_TESTIMONIALS}
          title="What Pro did for them."
          sub={`${PRO_TESTIMONIALS.length} Pro members, all 5 stars`}
          initial={3}
          className="mt-16"
        />

        <section id="employers" className="mt-16 scroll-mt-24">
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
                { q: 'How is the match score worked out?', a: 'MadeVisa reads the job ad and your CV and compares six things: the skills the ad names (40 points), whether your roles fit the job (20), years of experience (15), the ad’s own wording (10), languages (8) and education (7). Anything the ad doesn’t ask for is left out, so an ad can’t lower your score with something it never mentioned. If the ad requires a language your CV doesn’t show, the score is held at 60%. It’s the same rules for every job — no AI guesswork — and it never looks at age, gender, nationality or a photo.' },
                { q: 'Is the score a prediction that I’ll get the job?', a: 'No. It tells you how closely your CV, as written, matches what the ad asks for. A low score often means the CV doesn’t say something you can do — which is what the full report helps you fix.' },
                { q: 'What is free, exactly?', a: 'Every job, search and filter, 1 sponsorship document a month you can download straight away and edit later, up to 5 saved jobs, application tracking and one job alert. CV match — your score on every job, the skills missing from your CV and the full report — is in Starter and Pro.' },
                { q: 'Who can see my CV?', a: 'You, and MadeVisa staff when they need it to run or support the service — for example to fix a problem with your account or to improve how CVs are read. It goes to an employer only when you ask MadeVisa to apply to that employer’s job for you, and only if the employer takes applications through MadeVisa; for every other job you apply on the employer’s own site. Until you create an account your CV stays in your browser. You can replace or delete it in your profile at any time.' },
                { q: 'What is the sponsorship document, and is it legally binding?', a: 'It is a proposal you send to an employer when a job needs a visa: the route that may apply, what it usually asks of the employer, and who you suggest pays each cost. Every line shows its source and whether it is known, your proposal, or still needs confirmation. It is not a contract, a job offer or a visa guarantee: its terms count only once you and the employer put them into the employment contract or a signed agreement. It never moves costs the law puts on the employer, never touches salary, and isn’t legal advice.' },
                { q: 'What’s the difference between Starter and Pro?', a: `Starter (${priceLabel('starter')}) makes each application stronger: the full CV match report on every job, all your matches, 20 sponsorship documents a month, the companies that sponsor visas, up to 5 job alerts and unlimited saved jobs. Pro (${priceLabel('pro')}) adds Auto Apply — a CV tailored to each job and a cover letter when one helps, sent for you or ready to send — 50 documents a month and up to 10 alerts. Features listed as “coming” aren’t included until they’re released.` },
                { q: 'Can I make a document without a plan?', a: 'Yes — every account gets 1 free sponsorship document a month. You download it straight away and can edit it later from your profile. Starter includes 20 a month and Pro 50. Credits you bought or earned before October 2026 are still yours and still work.' },
                { q: 'Is the price the same in every country?', a: `Yes: ${priceLabel('starter')} for Starter and ${priceLabel('pro')} for Pro, in US dollars, everywhere. Gumroad adds sales tax or VAT at checkout where it applies, and your bank may convert the amount into your currency. Members who joined Pro before October 2026 keep the price they signed up with.` },
                card.on
                  ? { q: 'How do I pay?', a: 'Choose a plan and press Get Starter or Get Pro. The checkout page shows what you pay today and every month; then you pay on Gumroad, our payment partner and the seller on your receipt. MadeVisa never sees your card. Your plan starts once Gumroad confirms the payment, usually within a minute.' }
                  : { q: 'How do I pay?', a: 'Choose a plan and send the short form. We email you a secure payment link within one working day, and the plan starts as soon as it’s paid. No card is needed to send the request.' },
                { q: 'Can I cancel? Can I get a refund?', a: 'Yes. Cancel any time in Settings → Billing (it opens your membership on Gumroad) or from the link in your receipt; you keep the plan until the end of the month you paid for. Within 14 days of first starting a plan, if you haven’t used any sponsorship documents from it, you get a full refund — write to hello@madevisa.com. See the Subscription Terms.' },
                { q: 'Can I switch between Starter and Pro?', a: 'Yes. Cancel your current plan on Gumroad (you keep it until the end of the month you paid for), then start the other one from its checkout page. Gumroad can’t move a membership between plans, so there is no automatic pro-rated switch; while both run you get the higher plan.' },
                { q: 'Does paying change Company Scores?', a: 'Never. Scores and reply rates are calculated the same way for every company — see our Advertising Policy.' },
              ]}
            />
          </div>
        </section>
      </main>

      {dialog && <PlanRequestDialog plan={dialog.plan} billing={dialog.billing} priceLabel={dialog.label} region="USD" onClose={() => setDialog(null)} onAuth={onAuth} />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
