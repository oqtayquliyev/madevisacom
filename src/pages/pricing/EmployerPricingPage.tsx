import { useState } from 'react';
import { BarChart3, Briefcase, Check, FileText, Megaphone, Pin } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import type { RequestPlanId } from '@/lib/plans';
import { EMPLOYER_PRICES } from '@/lib/pricing';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { AppLink, Faq } from '@/pages/info/InfoPage';
import { PricingSwitch } from '@/pages/pricing/PricingSwitch';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

type Offer = { id: RequestPlanId; name: string; price: string; unit: string; text: string; points: string[]; icon: typeof Pin; billing: 'monthly' | 'one_time' };

const OFFERS: Offer[] = [
  {
    id: 'sponsored_job',
    name: 'Sponsored job',
    price: `$${EMPLOYER_PRICES.sponsoredJob}`,
    unit: 'per job · 30 days',
    text: 'Pinned at the top of the jobs page and on the homepage for 30 days, clearly labelled Sponsored.',
    points: ['Reviewed within a day', 'Nothing charged before approval', 'Packs of 3 or more at a discount'],
    icon: Pin,
    billing: 'one_time',
  },
  {
    id: 'featured_social',
    name: 'Featured in social posts',
    price: `+$${EMPLOYER_PRICES.featuredSocial}`,
    unit: 'per job, added to a Sponsored job',
    text: 'Your role in MadeVisa’s LinkedIn, Instagram and Facebook job posts, labelled Sponsored, with a direct link to your job.',
    points: ['Posts that show your job and company', 'Direct link to apply', 'Add it to any Sponsored job'],
    icon: Megaphone,
    billing: 'one_time',
  },
  {
    id: 'employer',
    name: 'Employer plan',
    price: `from $${EMPLOYER_PRICES.employerPlanFrom}`,
    unit: 'per month',
    text: 'Always-on sponsored slots, applicant-interest stats and your reply speed compared with similar companies.',
    points: ['Verified company page', 'Team access', 'Monthly hiring report'],
    icon: BarChart3,
    billing: 'monthly',
  },
  {
    id: 'hiring_brief',
    name: 'Hiring Brief',
    price: `$${EMPLOYER_PRICES.hiringBrief}`,
    unit: 'per brief',
    text: 'What hiring one person from a given country involves: the visa route, timeline, costs and who usually pays what.',
    points: ['Plain language', 'Official sources', 'Delivered in 2 working days'],
    icon: FileText,
    billing: 'one_time',
  },
];

/** /pricing/employers — what companies pay (and what is free). Job seekers' plans are on /pricing. */
export function EmployerPricingPage({ go, onAuth }: Props) {
  const [dialog, setDialog] = useState<{ plan: RequestPlanId; billing: 'monthly' | 'one_time'; label: string } | null>(null);
  useSeo({
    title: 'Pricing for employers — MadeVisa',
    description: `List jobs on MadeVisa for free. A Sponsored job is $${EMPLOYER_PRICES.sponsoredJob} for 30 days at the top of the jobs page, reviewed within a day and charged only after approval. Social promotion +$${EMPLOYER_PRICES.featuredSocial}.`,
    path: '/pricing/employers',
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <section className="border-b border-ink-200 bg-white">
        <div className={`${WRAP} py-12 text-center sm:py-16`}>
          <PricingSwitch active="employers" />
          <p className="mt-6 text-sm font-semibold text-brand-700">Pricing for employers</p>
          <h1 className="mx-auto mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink-950 sm:text-5xl">Reach candidates who are ready to move for the job.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-7 text-ink-600">
            Listing a job is free. Pay only when one role needs more visibility, and only after we approve it.
          </p>
        </div>
      </section>

      <main className={`${WRAP} py-10 sm:py-14`}>
        {/* Free first: it is the first step for every company. */}
        <div className="grid gap-5 rounded-2xl border border-brand-200 bg-white p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <Briefcase className="h-4 w-4" aria-hidden /> Free job listing
            </p>
            <p className="mt-2 text-3xl font-bold text-ink-950">$0</p>
            <ul className="mt-4 grid gap-2 text-[14px] text-ink-700 sm:grid-cols-2">
              {[
                'Post a role yourself, or we list your open roles from your careers page',
                'Candidates compare their CV with your job before they apply',
                'Say whether you sponsor visas, so the right people apply',
                'Shown to people looking for jobs in 30+ countries',
              ].map((p) => (
                <li key={p} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <button onClick={() => nav('/submit-job')} className="rounded-xl bg-brand-600 px-6 py-3 text-[15px] font-bold text-white hover:bg-brand-700">
            Post a job for free
          </button>
        </div>

        <h2 className="mt-14 text-2xl font-bold tracking-tight text-ink-950">When a role needs more</h2>
        <p className="mt-1 text-[15px] text-ink-600">Optional, per job or per month. Paying never changes Company Scores or how other jobs rank.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OFFERS.map((e) => (
            <div key={e.id} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5">
              <e.icon className="h-5 w-5 text-brand-600" aria-hidden />
              <p className="mt-3 font-bold text-ink-950">{e.name}</p>
              <p className="mt-2 text-2xl font-bold text-ink-950">{e.price}</p>
              <p className="text-xs text-ink-500">{e.unit}</p>
              <p className="mt-3 text-sm leading-6 text-ink-600">{e.text}</p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {e.points.map((p) => (
                  <li key={p} className="flex gap-2 text-xs text-ink-600">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
              <button onClick={() => setDialog({ plan: e.id, billing: e.billing, label: `${e.price} ${e.unit}` })} className="mt-4 rounded-lg border border-ink-200 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Request
              </button>
            </div>
          ))}
        </div>

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            ['1', 'Send the request', 'Tell us the job and what you’d like. No card needed.'],
            ['2', 'We review it within a day', 'We check the listing and confirm what it includes.'],
            ['3', 'Pay after approval', 'You get a payment link only once it’s approved, and the placement starts when it’s paid.'],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">{n}</span>
              <p className="mt-3 font-bold text-ink-950">{t}</p>
              <p className="mt-1 text-sm leading-6 text-ink-600">{d}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950">Questions</h2>
          <div className="mt-5">
            <Faq
              items={[
                { q: 'Is listing a job really free?', a: 'Yes. You can post a role yourself, or send us your careers page and we list your open roles. Free listings appear in search and filters like every other job.' },
                { q: 'What does a Sponsored job add?', a: `For $${EMPLOYER_PRICES.sponsoredJob}, your job is pinned at the top of the jobs page and on the homepage for 30 days, clearly labelled Sponsored. For $${EMPLOYER_PRICES.featuredSocial} more it also appears in MadeVisa’s LinkedIn, Instagram and Facebook job posts.` },
                { q: 'When am I charged?', a: 'Only after we approve the listing, usually within a day. Nothing is charged before approval. Packs of 3 or more sponsored jobs get a discount; ask in your request.' },
                { q: 'Does paying change Company Scores or rankings?', a: 'Never. Scores and reply rates are calculated the same way for every company, whether it pays or not. See the Advertising Policy.' },
                { q: 'Who are the candidates?', a: 'People looking for jobs in other countries. Many upload a CV and see how well it matches your job before applying. Whether a candidate needs a visa depends on the person and the country; your listing can say whether you sponsor.' },
                { q: 'Do you guarantee hires or applications?', a: 'No. MadeVisa puts your job in front of relevant candidates; how many apply depends on the role, the location and the market.' },
              ]}
            />
          </div>
          <p className="mt-6 text-center text-[13px] text-ink-500">
            Looking for a job instead?{' '}
            <AppLink href="/pricing" className="font-semibold text-brand-700 hover:underline">
              Plans for job seekers
            </AppLink>
            {' · '}
            <AppLink href="/sponsored-listing-terms" className="font-semibold text-brand-700 hover:underline">
              Sponsored listing terms
            </AppLink>
          </p>
        </section>
      </main>

      {dialog && <PlanRequestDialog plan={dialog.plan} billing={dialog.billing} priceLabel={dialog.label} region="USD" onClose={() => setDialog(null)} onAuth={onAuth} />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
