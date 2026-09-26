import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, ExternalLink, Loader2, MessageSquarePlus, Plus, RotateCcw, Search, X } from 'lucide-react';
import {
  CHANNEL_LABEL,
  EXPERIENCES_PAGE,
  OUTCOME_LABEL,
  fetchExperienceReports,
  findPublisherMatches,
  reviewExperience,
  searchPublishers,
  fetchExperienceReporters,
  type ExperienceReport,
  type ExperienceReporter,
  type ExperienceStatus,
  type PublisherMatch,
} from '@/lib/companyExperiences';
import { companyPath } from '@/lib/companies';

const OUTCOME_TONE: Record<string, string> = {
  no_response: 'bg-ink-100 text-ink-700',
  rejected: 'bg-rose-50 text-rose-700',
  responded: 'bg-sky-50 text-sky-700',
  interview: 'bg-brand-50 text-brand-700',
  offer: 'bg-emerald-50 text-emerald-700',
};

function when(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Admin inbox for "Share your application experience". Each report is
 * linked to an existing company (same company under another name is
 * suggested automatically), or the company is created — or it's rejected.
 */
export function ExperienceReportsSection() {
  const [tab, setTab] = useState<ExperienceStatus | 'all'>('pending');
  const [rows, setRows] = useState<ExperienceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Who sent each report — loaded in one batch per page of reports.
  const [people, setPeople] = useState<Record<string, ExperienceReporter | null>>({});
  const [peopleError, setPeopleError] = useState<string | null>(null);

  useEffect(() => {
    const missing = [...new Set(rows.map((r) => r.user_id))].filter((id) => !(id in people));
    if (!missing.length) return;
    setPeople((p) => ({ ...p, ...Object.fromEntries(missing.map((id) => [id, undefined as unknown as null])) }));
    fetchExperienceReporters(missing).then((res) => {
      setPeopleError(res.error ?? null);
      const got = Object.fromEntries(res.rows.map((x) => [x.user_id, x]));
      setPeople((p) => ({ ...p, ...Object.fromEntries(missing.map((id) => [id, got[id] ?? null])) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const load = useCallback(
    async (append: boolean, before?: string) => {
      setLoading(true);
      const res = await fetchExperienceReports(tab, before);
      setError(res.error ?? null);
      setRows((r) => (append ? [...r, ...res.rows] : res.rows));
      setMore(res.rows.length === EXPERIENCES_PAGE);
      setLoading(false);
    },
    [tab],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const done = (id: string, patch: Partial<ExperienceReport>) =>
    setRows((list) => (tab !== 'all' && patch.status && patch.status !== tab ? list.filter((x) => x.id !== id) : list.map((x) => (x.id === id ? { ...x, ...patch } : x))));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
          <MessageSquarePlus className="h-4 w-4" /> Shared application experiences
        </h2>
        <div className="ml-auto flex gap-1">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${tab === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
            >
              {k === 'pending' ? 'To review' : k}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-200 bg-white">
        {error && <p className="border-b border-ink-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
        {peopleError && <p className="border-b border-ink-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{peopleError}</p>}
        <div className="max-h-[640px] overflow-y-auto overscroll-contain">
          {rows.length === 0 && !loading ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">{tab === 'pending' ? 'Nothing to review.' : 'No reports here yet.'}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {rows.map((r) => (
                <ReportRow key={r.id} r={r} person={people[r.user_id]} onDone={(patch) => done(r.id, patch)} />
              ))}
            </ul>
          )}
          {loading && (
            <p className="flex items-center justify-center gap-2 px-4 py-4 text-xs text-ink-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          )}
          {more && !loading && (
            <button onClick={() => load(true, rows[rows.length - 1]?.created_at)} className="w-full border-t border-ink-100 py-2.5 text-xs font-semibold text-brand-700 hover:bg-ink-50">
              Load more
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ReportRow({ r, person, onDone }: { r: ExperienceReport; person: ExperienceReporter | null | undefined; onDone: (patch: Partial<ExperienceReport>) => void }) {
  const [matches, setMatches] = useState<PublisherMatch[] | null>(null);
  const [picked, setPicked] = useState<PublisherMatch | null>(r.publisher ? { id: r.publisher.id, name: r.publisher.name, website: null, verification_status: 'verified', country: null } : null);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<PublisherMatch[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(r.company_name);
  const [newSite, setNewSite] = useState(r.company_website ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = r.status === 'pending';

  useEffect(() => {
    if (pending) findPublisherMatches(r.company_name, r.company_website).then(setMatches);
  }, [pending, r.company_name, r.company_website]);

  useEffect(() => {
    if (term.trim().length < 2) return setFound([]);
    const t = window.setTimeout(() => searchPublishers(term).then(setFound), 250);
    return () => window.clearTimeout(t);
  }, [term]);

  const act = async (action: 'approve' | 'reject' | 'pending') => {
    setBusy(true);
    setErr(null);
    const res = await reviewExperience(
      r.id,
      action,
      action === 'approve'
        ? creating
          ? { newName: newName.trim(), newWebsite: newSite.trim() || null, newCountryId: r.country_id }
          : { publisherId: picked?.id ?? null }
        : {},
    );
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? 'Failed.');
    onDone({
      status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending',
      publisher_id: res.publisherId ?? r.publisher_id,
      publisher: action === 'approve' ? { id: res.publisherId!, name: creating ? newName.trim() : picked?.name ?? '' } : r.publisher,
    });
  };

  const chip = (m: PublisherMatch) => (
    <button
      key={m.id}
      onClick={() => {
        setPicked(m);
        setCreating(false);
      }}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        picked?.id === m.id && !creating ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300'
      }`}
    >
      <Building2 className="h-3 w-3" /> {m.name}
      {m.country?.name && <span className="font-normal text-ink-400">· {m.country.name}</span>}
      {m.verification_status !== 'verified' && <span className="font-normal text-amber-600">· {m.verification_status}</span>}
    </button>
  );

  return (
    <li className={`px-4 py-4 ${pending ? '' : 'bg-ink-50/50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${OUTCOME_TONE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
        <span className="text-[11px] text-ink-400">sent {when(r.created_at)}</span>
        {r.email_verified ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Email verified · full weight</span>
        ) : (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Email not verified · half weight</span>
        )}
        {r.match_pct != null && <span className="text-[11px] text-ink-500">matched {r.match_pct}%</span>}
        {!pending && <span className="text-[11px] font-semibold capitalize text-ink-500">{r.status}</span>}
      </div>
      <p className="mt-1 text-sm font-bold text-ink-950">
        {r.company_name}
        {r.company_website && (
          <a href={r.company_website} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand-700 hover:underline">
            {r.company_website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-600">
        {[r.role_title ? `Role: ${r.role_title}` : null, r.country?.name ? `from ${r.country.name}` : null, `applied ${new Date(r.applied_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, CHANNEL_LABEL[r.channel], r.reply_days != null ? `first reply after ${r.reply_days} days` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <p className="mt-0.5 text-[11px] text-ink-400">
        Sent {new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {r.form_ms != null && ` · form filled in ${Math.max(1, Math.round(r.form_ms / 1000))}s`}
        {r.publisher_id && !r.publisher && ' · linked company removed'}
      </p>

      <Sender person={person} />

      {pending ? (
        <div className="mt-3 rounded-lg bg-ink-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Link to company</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matches === null ? (
              <span className="text-[11px] text-ink-400">Looking for matches…</span>
            ) : matches.length ? (
              matches.map(chip)
            ) : (
              <span className="text-[11px] text-ink-500">No similar company on MadeVisa.</span>
            )}
            {picked && !matches?.some((m) => m.id === picked.id) && chip(picked)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search another company" className="h-8 w-56 rounded-md border border-ink-200 bg-white pl-7 pr-2 text-xs outline-none focus:border-brand-500" />
            </div>
            <button
              onClick={() => {
                setCreating((v) => !v);
                setPicked(null);
              }}
              className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold ${creating ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`}
            >
              <Plus className="h-3 w-3" /> New company
            </button>
          </div>
          {found.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{found.map(chip)}</div>}
          {creating && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs outline-none focus:border-brand-500" />
              <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="Website" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs outline-none focus:border-brand-500" />
              <p className="text-[11px] text-ink-500 sm:col-span-2">Creates a verified company page. Only do this once you've checked the company is real.</p>
            </div>
          )}
          {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              disabled={busy || (!picked && !(creating && newName.trim().length >= 2))}
              onClick={() => act('approve')}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {creating ? 'Create company & approve' : picked ? `Approve for ${picked.name}` : 'Pick a company to approve'}
            </button>
            <button disabled={busy} onClick={() => act('reject')} className="flex items-center gap-1 rounded-md border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-700 hover:bg-white disabled:opacity-40">
              <X className="h-3 w-3" /> Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {r.publisher && (
            <a href={companyPath(r.publisher)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50">
              {r.publisher.name} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button disabled={busy} onClick={() => act('pending')} className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-40">
            <RotateCcw className="h-3 w-3" /> Back to review
          </button>
          {err && <span className="text-[12px] text-rose-700">{err}</span>}
        </div>
      )}
    </li>
  );
}

function ago(iso: string | null) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${(d / 365).toFixed(1)} years ago`;
}

/** Who sent the report, with their history — so fakes and brigading stand out. */
function Sender({ person }: { person: ExperienceReporter | null | undefined }) {
  if (person === undefined) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-ink-100 p-3">
        <span className="h-10 w-10 animate-pulse rounded-full bg-ink-100" />
        <span className="flex-1 space-y-1.5">
          <span className="block h-3 w-40 animate-pulse rounded bg-ink-100" />
          <span className="block h-3 w-64 animate-pulse rounded bg-ink-100" />
        </span>
        <Loader2 className="h-4 w-4 animate-spin text-ink-300" />
      </div>
    );
  }
  if (person === null) return <p className="mt-3 rounded-lg border border-ink-100 p-3 text-[12px] text-ink-400">Sender details unavailable (account deleted?).</p>;
  const p = person;
  const newAccount = p.joined_at ? Date.now() - new Date(p.joined_at).getTime() < 2 * 86_400_000 : false;
  const flags = [
    newAccount && 'New account (under 2 days)',
    p.shared_24h >= 2 && `${p.shared_24h} reports in 24 h`,
    p.shared_rejected >= 2 && `${p.shared_rejected} earlier reports rejected`,
    !p.email_verified && 'Email not confirmed',
  ].filter(Boolean) as string[];
  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-white p-3">
      <div className="flex flex-wrap items-start gap-3">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700">
            {(p.full_name ?? p.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-bold text-ink-900">
            {p.full_name || 'No name'}
            {p.role === 'admin' && <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Admin</span>}
            {p.email_verified ? (
              <span className="text-[11px] font-semibold text-emerald-600">✓ email confirmed</span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-600">email not confirmed</span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-600">
            {p.email && (
              <a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">
                {p.email}
              </a>
            )}
            {p.username && (
              <a href={`/u/${p.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                /u/{p.username} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {p.linkedin_url && (
              <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {[p.occupation, p.country_name, `joined ${ago(p.joined_at)}`, `last sign-in ${ago(p.last_sign_in_at)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
        <Stat label="Shared" value={p.shared_total} />
        <Stat label="Waiting" value={p.shared_pending} />
        <Stat label="Approved" value={p.shared_approved} tone="good" />
        <Stat label="Rejected" value={p.shared_rejected} tone={p.shared_rejected ? 'bad' : undefined} />
        <Stat label="Tracked on MadeVisa" value={p.tracked_total} />
      </div>
      {p.recent_companies && p.recent_companies.length > 1 && (
        <p className="mt-2 text-[11px] text-ink-500">
          Recently shared about: <span className="text-ink-700">{[...new Set(p.recent_companies)].join(', ')}</span>
        </p>
      )}
      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <span key={f} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              ⚠ {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-semibold ${tone === 'good' ? 'bg-emerald-50 text-emerald-700' : tone === 'bad' ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-700'}`}>
      {label} <strong>{value}</strong>
    </span>
  );
}
