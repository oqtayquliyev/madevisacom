import { useEffect, useState } from 'react';
import { ExternalLink, Mail } from 'lucide-react';
import { fetchListingRequests, setListingRequestStatus, type ListingRequest } from '@/lib/listingRequests';

const STATUS: { key: ListingRequest['status']; label: string; cls: string }[] = [
  { key: 'new', label: 'New', cls: 'bg-amber-50 text-amber-700' },
  { key: 'contacted', label: 'Contacted', cls: 'bg-sky-50 text-sky-700' },
  { key: 'converted', label: 'Done', cls: 'bg-emerald-50 text-emerald-700' },
  { key: 'closed', label: 'Closed', cls: 'bg-ink-100 text-ink-500' },
  { key: 'spam', label: 'Spam', cls: 'bg-rose-50 text-rose-700' },
];

/** "Post a job" requests from /submit-job (people without a company yet). */
export function ListingRequestsSection() {
  const [rows, setRows] = useState<ListingRequest[] | null>(null);
  const [filter, setFilter] = useState<ListingRequest['status'] | 'all'>('new');
  const load = () => fetchListingRequests().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);
  const count = (k: ListingRequest['status']) => (rows ?? []).filter((r) => r.status === k).length;

  const reply = (r: ListingRequest) => {
    const subject = r.plan === 'sponsored_job' ? `Your sponsored job on MadeVisa — ${r.company_name}` : `Posting jobs on MadeVisa — ${r.company_name}`;
    const body = `Hi ${r.full_name.split(' ')[0]},\n\nThanks for your request to post ${r.plan === 'sponsored_job' ? 'a sponsored job' : 'jobs'} for ${r.company_name} on MadeVisa.\n\n`;
    return `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Post-a-job requests</h2>
        <div className="ml-auto flex flex-wrap gap-1">
          {(['all', ...STATUS.map((s) => s.key)] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${filter === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
            >
              {k === 'all' ? `All (${rows?.length ?? 0})` : `${STATUS.find((s) => s.key === k)!.label} (${count(k)})`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 divide-y divide-ink-100 border border-ink-200 bg-white">
        {rows === null && <p className="p-4 text-xs text-ink-400">Loading…</p>}
        {rows !== null && shown.length === 0 && <p className="p-4 text-xs text-ink-400">Nothing here.</p>}
        {shown.map((r) => {
          const st = STATUS.find((s) => s.key === r.status)!;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs">
              <div className="min-w-0 flex-1 basis-60">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {r.company_name}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${r.plan === 'sponsored_job' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600'}`}>
                    {r.plan === 'sponsored_job' ? `Sponsored · $${r.price_usd}` : 'Free'}
                  </span>
                </p>
                <p className="truncate text-ink-500">
                  {r.full_name} · {r.email} · {new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {r.user_id ? ' · has account' : ''}
                </p>
              </div>
              {r.job_url && (
                <a href={r.job_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-ink-500 hover:text-brand-700">
                  Job link <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <a href={reply(r)} className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 font-semibold text-ink-700 hover:bg-ink-50">
                <Mail className="h-3 w-3" /> Reply
              </a>
              <select
                value={r.status}
                onChange={async (e) => {
                  const res = await setListingRequestStatus(r.id, e.target.value as ListingRequest['status']);
                  if (!res.ok) window.alert(res.error);
                  load();
                }}
                className={`h-7 rounded-md border-0 px-2 text-[11px] font-bold ${st.cls}`}
              >
                {STATUS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
