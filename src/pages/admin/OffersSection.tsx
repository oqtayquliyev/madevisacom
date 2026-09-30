import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CircleFlag } from '@/components/common/CircleFlag';
import { BRIEF_STATUS_LABEL, briefPath, type BriefStatus } from '@/lib/briefs';
import { splitWord } from '@/lib/sponsorOffer';

// Admin → Offers: who made sponsor offers, who opened the builder and
// didn't finish, and totals. Data: admin_offer_activity() (migration 20261110090000).

type Credits = { balance?: number; left: number; pro?: boolean; pro_left?: number };
type OfferRow = {
  share_id: string;
  created_at: string;
  job_id: string | null;
  job_title: string;
  company_name: string;
  country_code: string;
  split: number | null;
  status: BriefStatus;
  views: number;
  pdf_saves: number;
  company_pdf_saves: number;
  paid_with?: 'legacy' | 'credit' | 'pro';
  cost_usd?: number;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  username: string | null;
  credits: Credits | null;
};
type DraftRow = {
  job_id: string;
  job_title: string | null;
  company_name: string | null;
  country_code: string | null;
  opens: number;
  first_at: string;
  last_at: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
};
type Totals = { offers: number; creators: number; offers_7d: number; builder_users: number; pdf_saves: number; company_opens: number; credits_sold: number };
type Data = { offers: OfferRow[]; drafts: DraftRow[]; totals: Totals };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function OffersSection() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'offers' | 'drafts'>('offers');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const { data: d, error: e } = await supabase.rpc('admin_offer_activity', { p_limit: 500 });
    if (e) setError(/admin_offer_activity|function/i.test(e.message) ? 'Run migration 20261110090000_sponsor_offer_activity.sql to turn this on.' : e.message);
    else setData(d as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{error}</p>;
  if (!data)
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading offers…
      </p>
    );

  const t = data.totals;
  const match = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(q.trim().toLowerCase());
  const offers = data.offers.filter((o) => !q || match(o.user_name) || match(o.user_email) || match(o.company_name) || match(o.job_title));
  const drafts = data.drafts.filter((d) => !q || match(d.user_name) || match(d.user_email) || match(d.company_name) || match(d.job_title));

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Tile v={t.offers} k="Offers made" />
        <Tile v={t.creators} k="People who made one" />
        <Tile v={t.offers_7d} k="Last 7 days" />
        <Tile v={t.builder_users} k="Opened the builder" />
        <Tile v={t.pdf_saves} k="PDF saves" />
        <Tile v={t.company_opens} k="Opened by a company" />
        <Tile v={t.credits_sold} k="Dollar credit sold (before Oct 2026)" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-ink-100 p-0.5 text-sm font-semibold">
          <button onClick={() => setView('offers')} className={`rounded-md px-3 py-1.5 ${view === 'offers' ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>
            Created ({data.offers.length})
          </button>
          <button onClick={() => setView('drafts')} className={`rounded-md px-3 py-1.5 ${view === 'drafts' ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>
            Opened, not created ({data.drafts.length})
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, company, job" className="min-w-[220px] flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-600" />
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        {view === 'offers' ? (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Person</th>
                <th className="px-3 py-2 font-semibold">Job</th>
                <th className="px-3 py-2 font-semibold">Terms</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Opens</th>
                <th className="px-3 py-2 text-right font-semibold">PDF (company)</th>
                <th className="px-3 py-2 font-semibold">Credit now</th>
                <th className="px-3 py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {offers.map((o) => (
                <tr key={o.share_id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink-900">{o.user_name ?? '—'}</p>
                    <p className="text-xs text-ink-500">{o.user_email ?? o.user_id.slice(0, 8)}</p>
                    {o.username && (
                      <a href={`/u/${o.username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">
                        @{o.username}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-1.5 font-medium text-ink-900">
                      <CircleFlag countryCode={o.country_code} size={16} /> {o.job_title}
                    </p>
                    <p className="text-xs text-ink-500">{o.company_name}</p>
                    <a href={briefPath(o.share_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                      Open document <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-700">
                    {o.split != null ? `${splitWord(o.split)} (${o.split})` : 'Before slider'}
                    <span className="block text-ink-400">{o.paid_with === 'pro' ? 'Pro allowance' : o.paid_with === 'credit' ? `Paid $${o.cost_usd ?? 15}` : 'Before pricing'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-ink-700">{BRIEF_STATUS_LABEL[o.status] ?? o.status}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.views}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {o.pdf_saves} <span className="text-ink-400">({o.company_pdf_saves})</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-700">{o.credits ? `${o.credits.left} doc${o.credits.left === 1 ? '' : 's'} left${o.credits.pro ? ` · Pro ${o.credits.pro_left ?? 0}/10` : ''}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-500">{when(o.created_at)}</td>
                </tr>
              ))}
              {!offers.length && <EmptyRow cols={8} />}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Person</th>
                <th className="px-3 py-2 font-semibold">Job</th>
                <th className="px-3 py-2 text-right font-semibold">Opens</th>
                <th className="px-3 py-2 font-semibold">First</th>
                <th className="px-3 py-2 font-semibold">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {drafts.map((d) => (
                <tr key={`${d.user_id}-${d.job_id}`} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink-900">{d.user_name ?? '—'}</p>
                    <p className="text-xs text-ink-500">{d.user_email ?? d.user_id.slice(0, 8)}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-1.5 font-medium text-ink-900">
                      {d.country_code && <CircleFlag countryCode={d.country_code} size={16} />} {d.job_title ?? 'Job removed'}
                    </p>
                    <p className="text-xs text-ink-500">{d.company_name ?? '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{d.opens}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-500">{when(d.first_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-500">{when(d.last_at)}</td>
                </tr>
              ))}
              {!drafts.length && <EmptyRow cols={5} />}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Tile({ v, k }: { v: number; k: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
      <p className="text-2xl font-bold tabular-nums text-ink-950">{Number(v ?? 0).toLocaleString()}</p>
      <p className="text-xs text-ink-500">{k}</p>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-ink-500">
        Nothing yet.
      </td>
    </tr>
  );
}
