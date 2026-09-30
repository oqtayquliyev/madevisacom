import { useEffect, useState } from 'react';
import { Eye, FileSignature } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { formatRelativeTime } from '@/lib/dates';
import { nav } from '@/lib/pageLayout';
import { useMyPlan } from '@/lib/plans';
import { BRIEF_STATUS_LABEL, briefPath, fetchMyBriefs, type MyBrief } from '@/lib/briefs';
import { fetchOfferCredits, splitWord, type OfferCredits } from '@/lib/sponsorOffer';
import { CreditMeter, OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';

const STATUS_TONE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-600',
  sent: 'bg-sky-50 text-sky-700',
  replied: 'bg-emerald-50 text-emerald-700',
  interview: 'bg-emerald-50 text-emerald-700',
  offer: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-ink-100 text-ink-600',
  no_reply: 'bg-amber-50 text-amber-800',
};

/** "Your sponsor offers" on the dashboard. */
export function MyBriefsSection() {
  const [briefs, setBriefs] = useState<MyBrief[] | null | undefined>(undefined);
  const [credits, setCredits] = useState<OfferCredits | null>(null);
  useEffect(() => {
    fetchMyBriefs().then(setBriefs);
    fetchOfferCredits().then(setCredits);
  }, []);

  // Table missing (migration not run) → hide.
  if (briefs === null || briefs === undefined) return null;

  const sent = briefs.filter((b) => b.status !== 'created').length;
  const viewed = briefs.filter((b) => b.view_count > 0).length;

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-950">
          <FileSignature className="h-[18px] w-[18px] text-[#1D4ED8]" /> Your sponsor offers
        </h2>
        <OfferInfo />
        <div className="ml-auto">{credits && <CreditMeter credits={credits} />}</div>
      </div>

      {briefs.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg bg-[#1D4ED8]/5 p-4 sm:flex-row sm:items-center">
          <OfferFlags size={24} />
          <p className="min-w-0 flex-1 text-[14px] leading-6 text-ink-700">Open a job in one of these countries and press “Prepare your sponsor offer”.</p>
          <a href="/jobs" onClick={(e) => (e.preventDefault(), nav('/jobs'))} className="shrink-0 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-800">
            Find a job
          </a>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-ink-500">
            {briefs.length} made · {sent} sent · {viewed} opened by the company
          </p>
          <ul className="mt-4 space-y-2">
            {briefs.map((b) => (
              <li key={b.id}>
                <a
                  href={briefPath(b.share_id)}
                  onClick={(e) => (e.preventDefault(), nav(briefPath(b.share_id)))}
                  className="flex items-center gap-3 rounded-lg bg-[#1D4ED8]/5 px-3 py-3 transition-colors hover:bg-[#1D4ED8]/10"
                >
                  <CircleFlag countryCode={b.country_code} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink-900">{b.job_title}</span>
                    <span className="block truncate text-[12px] text-ink-500">
                      {b.company_name} · {b.split != null ? `${splitWord(b.split)} · ` : ''}
                      {formatRelativeTime(b.created_at, '')}
                    </span>
                  </span>
                  <span className="hidden items-center gap-1 text-[12px] text-ink-500 sm:flex" title="Opens by anyone other than you">
                    <Eye className="h-3.5 w-3.5" /> {b.view_count}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[b.status] ?? STATUS_TONE.created}`}>{BRIEF_STATUS_LABEL[b.status]}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Plan + offer credits, in the profile sidebar. */
export function PlanCard() {
  const { isPro, sub, loading } = useMyPlan();
  const [credits, setCredits] = useState<OfferCredits | null>(null);
  useEffect(() => {
    fetchOfferCredits().then(setCredits);
  }, []);
  if (loading) return null;
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-500">Your plan</p>
        <a href="/pricing" onClick={(e) => (e.preventDefault(), nav('/pricing'))} className="text-[13px] font-semibold text-[#1D4ED8] hover:underline">
          {isPro ? 'Manage' : 'Upgrade'}
        </a>
      </div>
      <p className="mt-0.5 text-[17px] font-bold text-ink-950">{isPro ? 'MadeVisa Pro' : 'Free'}</p>
      {isPro && sub?.current_period_end && <p className="text-[12px] text-ink-500">Until {new Date(sub.current_period_end).toLocaleDateString()}</p>}
      <div className="mt-3 border-t border-ink-100 pt-3">
        <div className="flex items-center gap-1">
          <p className="text-[13px] font-semibold text-ink-800">Sponsor offers</p>
          <OfferInfo />
        </div>
        <div className="mt-1.5">{credits ? <CreditMeter credits={credits} /> : <span className="text-[13px] text-ink-400">…</span>}</div>
        {credits && credits.left === 0 && (
          <a href="/pricing#offers" onClick={(e) => (e.preventDefault(), nav('/pricing#offers'))} className="mt-2 inline-block text-[13px] font-semibold text-[#1D4ED8] hover:underline">
            Top up credit
          </a>
        )}
      </div>
    </div>
  );
}
