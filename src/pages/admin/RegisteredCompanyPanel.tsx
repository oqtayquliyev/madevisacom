import { useMemo, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import {
  addPublisherMember,
  removePublisherMember,
  setProgramStatus,
  setSponsoredJobStatus,
  updatePublisherMember,
  type AdminProgram,
  type AdminSponsoredJob,
  type PendingPublisher,
  type PublisherMember,
} from '@/lib/admin';
import { jobPath } from '@/lib/jobUrl';

/**
 * Filters for the "Verified publisher accounts" list: companies that signed
 * up on MadeVisa themselves vs. ones MadeVisa imported from careers sites.
 */
export type PublisherFilter = 'all' | 'registered' | 'imported' | 'review';

export function PublisherFilterChips({
  value,
  onChange,
  counts,
}: {
  value: PublisherFilter;
  onChange: (v: PublisherFilter) => void;
  counts: Record<PublisherFilter, number>;
}) {
  const options: { key: PublisherFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'registered', label: 'Registered on MadeVisa' },
    { key: 'review', label: 'Has listings in review' },
    { key: 'imported', label: 'Imported' },
  ];
  return (
    <div className="mt-6 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            value === o.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
          }`}
        >
          {o.label} ({counts[o.key]})
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  expired: 'bg-ink-100 text-ink-500',
  draft: 'bg-ink-100 text-ink-500',
  rejected: 'bg-rose-50 text-rose-700',
};
const STATUS_LABEL: Record<string, string> = { published: 'Live', pending: 'In review', expired: 'Closed', draft: 'Unpublished', rejected: 'Rejected' };

type Listing = { kind: 'job' | 'program'; id: string; title: string; status: string; created_at: string; approved_at: string | null; origin?: string };

/**
 * Everything about one company that registered on MadeVisa, in one place:
 * who can manage it (owner + team, trusted or reviewed) and the listings it
 * submitted, with approve / close / reopen.
 */
export function RegisteredCompanyPanel({
  publisher,
  ownerEmail,
  members,
  jobs,
  programs,
  onChange,
}: {
  publisher: PendingPublisher;
  ownerEmail: string | null;
  members: PublisherMember[];
  jobs: AdminSponsoredJob[];
  programs: AdminProgram[];
  onChange: () => void;
}) {
  const [email, setEmail] = useState('');
  const [trusted, setTrusted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'review' | 'live' | 'closed'>('all');
  const [originFilter, setOriginFilter] = useState<'direct' | 'all'>('direct');
  const [busy, setBusy] = useState<string | null>(null);

  const listings: Listing[] = useMemo(
    () =>
      [
        ...jobs.map((j) => ({ kind: 'job' as const, id: j.id, title: j.title, status: j.status, created_at: j.created_at, approved_at: j.approved_at, origin: j.origin })),
        ...programs.map((p) => ({ kind: 'program' as const, id: p.id, title: p.title, status: p.status, created_at: p.created_at, approved_at: p.approved_at, origin: p.origin })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [jobs, programs]
  );
  const byOrigin = listings.filter((l) => originFilter === 'all' || l.origin === 'direct');
  const shown = byOrigin.filter((l) =>
    filter === 'all' ? true : filter === 'review' ? l.status === 'pending' : filter === 'live' ? l.status === 'published' : ['expired', 'draft', 'rejected'].includes(l.status)
  );
  const count = (f: typeof filter) =>
    byOrigin.filter((l) => (f === 'all' ? true : f === 'review' ? l.status === 'pending' : f === 'live' ? l.status === 'published' : ['expired', 'draft', 'rejected'].includes(l.status))).length;

  const setStatus = async (l: Listing, status: 'published' | 'expired' | 'rejected') => {
    setBusy(l.id);
    const r = l.kind === 'job' ? await setSponsoredJobStatus(l.id, status) : await setProgramStatus(l.id, status);
    setBusy(null);
    if (!r.ok) window.alert(r.error ?? 'Failed.');
    else onChange();
  };

  return (
    <div className="grid gap-4 border-t border-ink-100 bg-ink-50/60 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ACCESS */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Who can manage {publisher.name}</p>
        <div className="mt-2 divide-y divide-ink-100 rounded-md border border-ink-200 bg-white text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{ownerEmail ?? 'Owner account'}</span>
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">Owner</span>
          </div>
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-ink-700" title={m.hasAccount ? 'Has an account' : 'Not signed up yet'}>
                {m.email}
              </span>
              <label className="flex items-center gap-1 text-ink-600" title="Publishes without MadeVisa review">
                <input
                  type="checkbox"
                  checked={m.can_publish}
                  onChange={async (e) => {
                    const r = await updatePublisherMember(m.id, { can_publish: e.target.checked });
                    if (r.ok) onChange();
                    else window.alert(r.error);
                  }}
                />
                Trusted
              </label>
              <button
                onClick={async () => {
                  if (!window.confirm(`Remove ${m.email}'s access to ${publisher.name}?`)) return;
                  await removePublisherMember(m.id);
                  onChange();
                }}
                className="text-ink-300 hover:text-rose-600"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))}
            placeholder="person@company.com"
            className="h-8 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 text-xs outline-none focus:border-brand-500"
          />
          <button
            disabled={!email}
            onClick={async () => {
              const r = await addPublisherMember(publisher.id, email, trusted);
              setMsg(r.ok ? `Added ${email.toLowerCase()}.` : r.error ?? 'Failed.');
              if (r.ok) {
                setEmail('');
                setTrusted(false);
                onChange();
              }
            }}
            className="rounded-md bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-600">
          <input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} /> Trusted (publishes without review)
        </label>
        {msg && <p className="mt-1 text-[11px] text-ink-500">{msg}</p>}
        <p className="mt-3 text-[11px] leading-4 text-ink-400">
          The owner's own listings always go to review. Company name and details are locked for them once verified — edit them here with the pencil.
        </p>
      </div>

      {/* LISTINGS */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="mr-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">Listings</p>
          {(['all', 'review', 'live', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${filter === f ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
            >
              {{ all: 'All', review: 'In review', live: 'Live', closed: 'Closed' }[f]} ({count(f)})
            </button>
          ))}
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
            className="ml-auto h-7 rounded-md border border-ink-200 bg-white px-1.5 text-[11px]"
          >
            <option value="direct">Posted by the company</option>
            <option value="all">Include imported</option>
          </select>
        </div>
        <div className="mt-2 max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-200 bg-white">
          {shown.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-400">Nothing here.</p>}
          {shown.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-500">{l.kind}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-900" title={l.title}>
                {l.title}
              </span>
              <span className="text-[11px] text-ink-400">{new Date(l.created_at).toLocaleDateString()}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[l.status] ?? 'bg-ink-100 text-ink-600'}`}>{STATUS_LABEL[l.status] ?? l.status}</span>
              {l.status === 'pending' && (
                <>
                  <button disabled={busy === l.id} onClick={() => setStatus(l, 'published')} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button disabled={busy === l.id} onClick={() => setStatus(l, 'rejected')} className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                    Reject
                  </button>
                </>
              )}
              {l.status === 'published' && (
                <button disabled={busy === l.id} onClick={() => setStatus(l, 'expired')} className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">
                  Close
                </button>
              )}
              {['expired', 'draft', 'rejected'].includes(l.status) && (
                <button disabled={busy === l.id} onClick={() => setStatus(l, 'published')} className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">
                  Publish
                </button>
              )}
              {l.kind === 'job' && (
                <>
                  <a href={`/admin/jobs/${l.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">
                    Edit
                  </a>
                  {l.status === 'published' && (
                    <a href={jobPath({ id: `sponsored-${l.id}`, title: l.title, company: publisher.name })} target="_blank" rel="noopener noreferrer" className="text-ink-400 hover:text-brand-700" aria-label="Open job page">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
