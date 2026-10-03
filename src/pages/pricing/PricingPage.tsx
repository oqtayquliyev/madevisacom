import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, FileSignature, Lock, ScanSearch, Minus } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { FREE_FEATURES, missingProfileFields, useMyPlan, type Billing, type PlanId } from '@/lib/plans';
import { EMPLOYER_PRICES, FREE_DAILY_CHECKS, PLAN_RANGE, PLAN_USD, PRO_MONTHLY_DOCS, usePrices, type Money, type Prices } from '@/lib/pricing';
import { countryName } from '@/lib/visaFit';
import { useCv } from '@/lib/cv/store';
import { CvUpload } from '@/components/cv/CvUpload';
import { BillingToggle, ProPlanCard } from '@/components/pro/ProPlanCard';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const EMPLOYER: { id: PlanId; name: string; price: string; unit: string; text: string; points: string[] }[] = [
  { id: 'sponsored_job', name: 'Sponsored job', price: `$${EMPLOYER_PRICES.sponsoredJob}`, unit: 'per job · 30 days', text: 'Pinned at the top of /jobs and on the homepage, labelled Sponsored.', points: ['Reviewed within a day', 'Nothing charged before approval', 'Packs of 3+ at a discount'] },
  { id: 'featured_social', name: 'Featured in social posts', price: `+$${EMPLOYER_PRICES.featuredSocial}`, unit: 'per job', text: 'Your role in MadeVisa’s LinkedIn, Instagram and Facebook job posts, labelled Sponsored.', points: ['Real job seekers, fresh posts', 'Direct link to your job', 'Add to any sponsored job'] },
  { id: 'employer', name: 'Employer plan', price: `from $${EMPLOYER_PRICES.employerPlanFrom}`, unit: 'per month', text: 'Always-on sponsored slots, applicant-interest stats and your reply speed vs. similar companies.', points: ['Verified company page', 'Team access', 'Monthly hiring report'] },
  { id: 'hiring_brief', name: 'Hiring Brief', price: `$${EMPLOYER_PRICES.hiringBrief}`, unit: 'per brief', text: 'What hiring one person from a given country involves: route, timeline, costs and who pays what.', points: ['Plain language', 'Official sources', 'Delivered in 2 working days'] },
];

/** What each level of the CV match shows. */
const COMPARE: { what: string; guest: string | boolean; free: string | boolean; pro: string | boolean }[] = [
  { what: 'Match score on every job', guest: true, free: true, pro: true },
  { what: 'Skills missing from your CV', guest: false, free: `${FREE_DAILY_CHECKS} jobs a day`, pro: 'Every job' },
  { what: 'Where each point of the score comes from', guest: false, free: false, pro: true },
  { what: 'What to change in your CV for the job', guest: false, free: false, pro: true },
  { what: 'Checks on the CV itself (dates, length, results)', guest: false, free: false, pro: true },
  { what: 'Sponsorship documents', guest: false, free: false, pro: `${PRO_MONTHLY_DOCS} a month` },
];

/**
 * What Pro costs, in plain words and without an account: the list price, and
 * the price for the visitor's own country. Deliberately NOT a table of every
 * country: a public list of the cheapest countries is an invitation to pick
 * one with a VPN. Each visitor sees the list price and their own.
 */
function ProPrice({ prices }: { prices: Prices }) {
  const pro = prices.pro;
  const place = prices.country ? countryName(prices.country) ?? prices.country : null;
  const usd = (m: Money) => (m.local ? ` (${m.usdLabel})` : '');
  return (
    <section id="prices" className="mt-12 scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-6" aria-labelledby="prices-title">
      <h2 id="prices-title" className="text-lg font-bold text-ink-950">
        What MadeVisa Pro costs
      </h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-ink-500">List price</dt>
          <dd className="mt-0.5 text-[17px] font-bold text-ink-950">
            ${PLAN_RANGE.monthly.high} a month or ${PLAN_RANGE.yearly.high} a year
          </dd>
        </div>
        <div data-my-price>
          <dt className="text-sm font-semibold text-ink-500">{place ? `Your price in ${place}` : 'Your price'}</dt>
          <dd className="mt-0.5 text-[17px] font-bold text-ink-950">
            {pro.monthly.label}
            {usd(pro.monthly)} a month or {pro.yearly.label}
            {usd(pro.yearly)} a year
          </dd>
        </div>
      </dl>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">
        Prices are set in US dollars. In countries where incomes are lower, a regional price applies; it follows the country you live in and pay from, and is confirmed at payment. Pro is billed
        monthly or yearly. You can cancel any time, and it then stops at the end of the month or year you paid for.
      </p>
    </section>
  );
}

export function PricingPage({ go, onAuth }: Props) {
  const { profile } = useAuth();
  const { isPro, sub } = useMyPlan();
  const { cv } = useCv();
  const [billing, setBilling] = useState<Exclude<Billing, 'one_time'>>('monthly');
  const [dialog, setDialog] = useState<{ plan: PlanId; billing: Billing; label: string } | null>(null);

  useSeo({
    title: 'Pricing — one plan: full CV match reports and sponsorship documents',
    description: `Checking how well your CV matches a job is free. MadeVisa Pro adds the full report on every job and ${PRO_MONTHLY_DOCS} sponsorship documents a month: $${PLAN_RANGE.monthly.high} a month or $${PLAN_RANGE.yearly.high} a year, with lower regional prices in lower-income countries.`,
    path: '/pricing',
  });

  const prices = usePrices();
  const pro = prices.pro;
  const missing = useMemo(() => (profile ? missingProfileFields(profile) : []), [profile]);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  const cell = (v: string | boolean) =>
    v === true ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Yes" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-ink-300" aria-label="No" /> : <span className="font-semibold text-ink-900">{v}</span>;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-12 text-center sm:py-16`}>
          <p className="text-sm font-semibold text-brand-700">Pricing</p>
          <h1 className="mx-auto mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink-950 sm:text-5xl">Check your match for free. One plan for everything else.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-7 text-ink-600">
            Every job shows how well your CV fits it. Pro tells you exactly why, what to change, and adds the sponsorship document you send to an employer when the job needs a visa.
          </p>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
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

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">Plans</h2>
          <BillingToggle value={billing} onChange={setBilling} saving={pro.saving} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6">
            <p className="text-lg font-bold text-ink-950">Free</p>
            <p className="mt-2 text-4xl font-bold tracking-tight text-ink-950">{prices.m(0).label}</p>
            <p className="text-sm text-ink-500">forever</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-ink-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> {f}
                </li>
              ))}
            </ul>
            {!cv ? (
              <div className="mt-6">
                <CvUpload compact />
              </div>
            ) : !profile ? (
              <button onClick={() => onAuth?.('register')} className="mt-6 rounded-lg border border-ink-200 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Create free account
              </button>
            ) : (
              <button onClick={() => nav('/jobs')} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                <ScanSearch className="h-4 w-4" /> Check a job
              </button>
            )}
          </div>

          <ProPlanCard onAuth={onAuth} billing={billing} />
        </div>

        <ProPrice prices={prices} />

        {/* What you see at each level */}
        <section className="mt-12" aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-2xl font-bold tracking-tight text-ink-950">
            What you see when you check a job
          </h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-200 bg-white">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs font-bold uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-bold">&nbsp;</th>
                  <th scope="col" className="w-[18%] px-3 py-3 text-center font-bold">No account</th>
                  <th scope="col" className="w-[18%] px-3 py-3 text-center font-bold">Free account</th>
                  <th scope="col" className="w-[18%] bg-brand-50 px-3 py-3 text-center font-bold text-brand-800">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {COMPARE.map((r) => (
                  <tr key={r.what}>
                    <th scope="row" className="px-4 py-3 font-medium text-ink-800">
                      {r.what}
                    </th>
                    <td className="px-3 py-3 text-center text-ink-600">{cell(r.guest)}</td>
                    <td className="px-3 py-3 text-center text-ink-600">{cell(r.free)}</td>
                    <td className="bg-brand-50/60 px-3 py-3 text-center text-ink-600">{cell(r.pro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                listed under “Your application” as the missing piece. {PRO_MONTHLY_DOCS} a month are part of Pro.
              </p>
            </div>
            <AppLink href="/offers" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
              <Lock className="h-3.5 w-3.5" /> How it works
            </AppLink>
          </div>
        </section>

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
                { q: 'How is the match score worked out?', a: 'MadeVisa reads the job ad and your CV and compares six things: the skills the ad names (40 points), whether your roles fit the job (20), years of experience (15), the ad’s own wording (10), languages (8) and education (7). Anything the ad doesn’t ask for is left out, so an ad can’t lower your score with something it never mentioned. If the ad requires a language your CV doesn’t show, the score is held at 60%. It’s the same rules for every job — no AI guesswork — and it never looks at age, gender, nationality or a photo.' },
                { q: 'Is the score a prediction that I’ll get the job?', a: 'No. It tells you how closely your CV, as written, matches what the ad asks for. A low score often means the CV doesn’t say something you can do — which is what the full report helps you fix.' },
                { q: 'What is free, exactly?', a: `The match score, on every job, with no limit. With a free account you also see which skills are missing from your CV on ${FREE_DAILY_CHECKS} different jobs a day; a job you opened once stays open. The full report — each part of the score, what to change, and the checks on your CV — is Pro.` },
                { q: 'Who can see my CV?', a: 'You, and MadeVisa staff when they need it to run or support the service — for example to fix a problem with your account or to improve how CVs are read. It is never sent or shown to employers: you apply on the employer’s own site, with your own file. Until you create an account your CV stays in your browser. You can replace or delete it in your profile at any time.' },
                { q: 'What is the sponsorship document, and is it legally binding?', a: 'It is a proposal you send to an employer when a job needs a visa: the route that may apply, what it usually asks of the employer, and who you suggest pays each cost. Every line shows its source and whether it is known, your proposal, or still needs confirmation. It is not a contract, a job offer or a visa guarantee: its terms count only once you and the employer put them into the employment contract or a signed agreement. It never moves costs the law puts on the employer, never touches salary, and isn’t legal advice.' },
                { q: 'Can I buy one document without the plan?', a: `No — documents are part of Pro, ${PRO_MONTHLY_DOCS} each calendar month, which is cheaper than they were one by one. Credits you bought or earned before this change are still yours and still work.` },
                { q: 'Why is the price different in my country?', a: `The list price is ${prices.m(PLAN_USD.top).usdLabel} a month. Where incomes are lower, a regional price applies, so the plan stays affordable there. It follows the country you live in and pay from, which we read from your internet connection and confirm at payment, and it is shown in your currency when we can (otherwise in US dollars). Pro is exactly the same in every country.` },
                { q: 'How do I pay?', a: 'Choose monthly or yearly and send the short form. We email you a secure payment link within one working day, and Pro starts as soon as it’s paid. No card is needed to send the request.' },
                { q: 'Can I cancel? Can I get a refund?', a: 'Yes. Monthly stops at the end of the month, yearly at the end of the year — email hello@madevisa.com. Within 14 days of first starting Pro, if you haven’t used any Pro documents, you get a full refund — see the Sponsorship Document Terms.' },
                { q: 'Does paying change Company Scores?', a: 'Never. Scores and reply rates are calculated the same way for every company — see our Advertising Policy.' },
              ]}
            />
          </div>
        </section>
      </main>

      {dialog && <PlanRequestDialog plan={dialog.plan} billing={dialog.billing} priceLabel={dialog.label} region={prices.country ?? prices.tier} onClose={() => setDialog(null)} onAuth={onAuth} />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
