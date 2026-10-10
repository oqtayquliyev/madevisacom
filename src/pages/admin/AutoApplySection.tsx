import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  SkipForward,
  Square,
  Undo2,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { jobPath, parseJobPath } from '@/lib/jobUrl';
import { fetchSponsoredJobByShortId } from '@/lib/sponsoredJobs';

// Admin → Auto Apply: Pro members who turned on Auto Apply on /cv-match.
//
//   The list    who is running it, how many jobs wait in their queue, how many
//               were applied today. Busiest first.
//   One person  their details, CV and answers (with "Copy all" for pasting into
//               forms), then the queue: open the employer's page, apply with
//               their details, press "Mark applied". The person gets a bell
//               notification and the "You applied" email at that moment, and
//               the job shows as Applied on their CV match page and profile.
//               "Start" shows it to them as "Applying" while you work on it.
//               Jobs from elsewhere can be added (and marked applied) too.
//
// Server side: migration 20261215090000 (admin_auto_apply_*).

type Status = 'active' | 'paused' | 'stopped' | 'ended';
type ItemStatus = 'queued' | 'applying' | 'applied' | 'skipped';

type Row = {
  id: string;
  user_id: string;
  status: Status;
  started_at: string;
  ends_at: string;
  per_day: number;
  min_score: number;
  roles: string[];
  countries: string[];
  name: string | null;
  email: string | null;
  avatar: string | null;
  pro: boolean;
  has_cv: boolean;
  queued: number;
  applied: number;
  applied_today: number;
  last_applied_at: string | null;
};
type ListData = { counts: { open: number; active: number; all: number; queued: number; applied_today: number }; rows: Row[] };

type Item = {
  id: string;
  job_id: string | null;
  title: string;
  company: string;
  location: string | null;
  score: number | null;
  status: ItemStatus;
  note: string | null;
  admin_note: string | null;
  applied_at: string | null;
  created_at: string;
  url: string | null;
  source: 'match' | 'admin';
  live: boolean | null;
  notified_at: string | null;
};
type Detail = {
  request: Row & { answers: Record<string, string>; contact_email: string | null; consent_text: string; consent_at: string; admin_note: string | null };
  person: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    linkedin: string | null;
    username: string | null;
    occupation: string | null;
    specialization: string | null;
    education: string | null;
    experience: string | null;
    languages: string[] | null;
    lives_in: string | null;
    citizenship: string | null;
    pro: boolean;
    joined: string | null;
  } | null;
  cv: { file_name: string | null; storage_path: string | null; text: string; updated_at: string; titles: string[]; years: number | null } | null;
  items: Item[];
  history: { id: string; status: Status; started_at: string; ends_at: string }[];
};

const ANSWER_LABEL: Record<string, string> = {
  phone: 'Phone',
  linkedin: 'LinkedIn',
  sponsorship: 'Needs visa sponsorship',
  workRights: 'Allowed to work in',
  relocate: 'Willing to relocate',
  remote: 'Work setup',
  notice: 'Notice period',
  salary: 'Salary expectation',
  startDate: 'Earliest start',
  languages: 'Languages',
  note: 'Note for employers',
};
const STATUS_CHIP: Record<Status, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  stopped: 'bg-ink-100 text-ink-600',
  ended: 'bg-ink-100 text-ink-600',
};
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
const friendly = (m: string) => (/admin_auto_apply|schema cache/i.test(m) ? 'Run migration 20261215090000_emails_and_auto_apply_service.sql first.' : m);

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AutoApplySection() {
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(window.location.search).get('r'));
  const openRequest = (id: string | null) => {
    setOpen(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('r', id);
    else params.delete('r');
    window.history.replaceState({}, '', `/admin?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return open ? <RequestView id={open} onBack={() => openRequest(null)} /> : <ListView onOpen={openRequest} />;
}

/* ------------------------------------------------------------------ List */

function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [data, setData] = useState<ListData | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_auto_apply_list', { p_filter: filter });
    if (error) {
      setErr(friendly(error.message));
      setData(null);
    } else {
      setErr(null);
      setData(data as ListData);
    }
  }, [filter]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (data === undefined) return <Spinner />;
  if (!data) return <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const rows = [...data.rows].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.queued - a.queued);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Auto Apply</h2>
          <p className="text-sm text-ink-500">Pro members who asked MadeVisa to apply for them. Apply with their CV and answers, then mark each job applied — they get an email.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: 'Running', v: data.counts.active },
          { k: 'Jobs waiting', v: data.counts.queued },
          { k: 'Applied in 24 h', v: data.counts.applied_today },
          { k: 'All time', v: data.counts.all },
        ].map((t) => (
          <div key={t.k} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-xs font-medium text-ink-500">{t.k}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink-950">{t.v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <p className="text-sm font-bold text-ink-950">{filter === 'open' ? 'Running and paused' : 'Everyone'}</p>
          <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold">
            {(['open', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 ${filter === f ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                {f === 'open' ? 'Running' : 'All'}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">Nobody has Auto Apply {filter === 'open' ? 'running' : ''} yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => {
              const behind = r.status === 'active' && r.queued > 0 && r.applied_today < r.per_day;
              return (
                <li key={r.id}>
                  <button onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50/60">
                    <Avatar name={r.name ?? r.email ?? '?'} url={r.avatar} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-950">{r.name || r.email}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS_CHIP[r.status]}`}>{r.status}</span>
                        {!r.pro && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Pro lapsed</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {r.roles.join(', ') || 'Any role'} · {r.countries.join(', ') || 'any country'} · {r.per_day}/day from {r.min_score}%
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs sm:block">
                      <span className={`block font-semibold ${behind ? 'text-brand-700' : 'text-ink-800'}`}>
                        {r.queued} waiting · {r.applied_today}/{r.per_day} today
                      </span>
                      <span className="block text-ink-500">
                        {r.applied} applied · {r.status === 'active' || r.status === 'paused' ? `${daysLeft(r.ends_at)} days left` : `ended ${date(r.ends_at)}`}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ One person */

function RequestView({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCv, setShowCv] = useState(false);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_auto_apply_get', { p_request: id });
    if (error) {
      setErr(friendly(error.message));
      setD(null);
      return;
    }
    setD((data as Detail) ?? null);
    setNote((data as Detail | null)?.request.admin_note ?? '');
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (d === undefined) return <Spinner />;
  if (!d) return (
    <div className="mt-6">
      <BackButton onBack={onBack} />
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err ?? 'Not found.'}</p>
    </div>
  );

  const r = d.request;
  const p = d.person;
  const answers = Object.entries(r.answers ?? {}).filter(([, v]) => v && String(v).trim());
  const email = r.contact_email ?? p?.email ?? '';
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };
  const allText = [
    `Name: ${p?.name ?? ''}`,
    `Email: ${email}`,
    ...answers.map(([k, v]) => `${ANSWER_LABEL[k] ?? k}: ${v}`),
    p?.lives_in ? `Lives in: ${p.lives_in}` : '',
    p?.citizenship ? `Citizenship: ${p.citizenship}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const update = async (args: { p_status?: Status; p_extend_days?: number; p_per_day?: number; p_admin_note?: string }, key: string) => {
    setBusy(key);
    const { error } = await supabase.rpc('admin_auto_apply_update', { p_request: r.id, ...args });
    setBusy(null);
    if (error) return setErr(friendly(error.message));
    setErr(null);
    void load();
  };
  const setItem = async (item: Item, status: ItemStatus, extra: { p_note?: string; p_admin_note?: string } = {}) => {
    setBusy(item.id + status);
    const { error } = await supabase.rpc('admin_auto_apply_item', { p_item: item.id, p_status: status, ...extra });
    setBusy(null);
    if (error) return setErr(friendly(error.message));
    setErr(null);
    void load();
  };
  const downloadCv = async () => {
    if (!d.cv?.storage_path) return;
    const { data, error } = await supabase.storage.from('cvs').createSignedUrl(d.cv.storage_path, 120, { download: d.cv.file_name ?? true });
    if (error || !data?.signedUrl) return setErr(error?.message ?? 'Couldn’t open the file.');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const todo = d.items.filter((i) => i.status === 'queued' || i.status === 'applying');
  const done = d.items.filter((i) => i.status === 'applied' || i.status === 'skipped');
  const today = d.items.filter((i) => i.status === 'applied' && i.applied_at && Date.now() - Date.parse(i.applied_at) < 86_400_000).length;
  const running = r.status === 'active' || r.status === 'paused';

  return (
    <div className="mt-6 space-y-5">
      <BackButton onBack={onBack} />

      {/* Header */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={p?.name ?? p?.email ?? '?'} url={p?.avatar ?? null} size={48} />
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink-950">
                {p?.name || p?.email}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS_CHIP[r.status]}`}>{r.status}</span>
                {p && !p.pro && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Pro lapsed</span>}
              </h2>
              <p className="text-sm text-ink-500">
                Started {date(r.started_at)} · {running ? `ends ${date(r.ends_at)} (${daysLeft(r.ends_at)} days left)` : `ended ${date(r.ends_at)}`} · agreed {dateTime(r.consent_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status === 'active' && (
              <SmallBtn onClick={() => void update({ p_status: 'paused' }, 'pause')} busy={busy === 'pause'} icon={Pause}>
                Pause
              </SmallBtn>
            )}
            {r.status === 'paused' && (
              <SmallBtn onClick={() => void update({ p_status: 'active' }, 'resume')} busy={busy === 'resume'} icon={Play}>
                Resume
              </SmallBtn>
            )}
            <SmallBtn onClick={() => void update({ p_extend_days: 30 }, 'extend')} busy={busy === 'extend'} icon={Plus}>
              {running ? '+30 days' : 'Restart 30 days'}
            </SmallBtn>
            {running && (
              <SmallBtn onClick={() => window.confirm('End Auto Apply for this person?') && void update({ p_status: 'ended' }, 'end')} busy={busy === 'end'} icon={Square} tone="rose">
                End
              </SmallBtn>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: 'Waiting', v: todo.length },
            { k: 'Applied today', v: `${today} / ${r.per_day}` },
            { k: 'Applied', v: d.items.filter((i) => i.status === 'applied').length },
            { k: 'Matches from', v: `${r.min_score}%` },
          ].map((t) => (
            <div key={t.k} className="rounded-lg bg-ink-50 px-3 py-2.5">
              <p className="text-[11px] font-medium text-ink-500">{t.k}</p>
              <p className="text-lg font-bold tabular-nums text-ink-950">{t.v}</p>
            </div>
          ))}
        </div>
        {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Queue */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white ring-1 ring-ink-200">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
              <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold">
                <button onClick={() => setTab('todo')} className={`rounded-md px-2.5 py-1 ${tab === 'todo' ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                  To apply ({todo.length})
                </button>
                <button onClick={() => setTab('done')} className={`rounded-md px-2.5 py-1 ${tab === 'done' ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                  Done ({done.length})
                </button>
              </div>
              <span className="text-xs text-ink-500">Best match first</span>
            </div>
            {(tab === 'todo' ? todo : done).length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-500">
                {tab === 'todo' ? 'Nothing waiting. New matches arrive when they open CV match — or add a job below.' : 'No applications yet.'}
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {(tab === 'todo' ? todo : done).map((i) => (
                  <ItemRow key={i.id} item={i} busy={busy} onSet={setItem} />
                ))}
              </ul>
            )}
          </div>
          <AddJob requestId={r.id} onAdded={() => void load()} />
        </div>

        {/* The person */}
        <aside className="space-y-4">
          <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-950">Apply with</p>
              <button onClick={() => void copy('all', allText)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                {copied === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === 'all' ? 'Copied' : 'Copy all'}
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-[13px]">
              {[
                ['Name', p?.name],
                ['Email', email],
                ...answers.map(([k, v]) => [ANSWER_LABEL[k] ?? k, k === 'sponsorship' ? (v === 'yes' ? 'Yes' : 'No') : String(v)]),
                ['Lives in', p?.lives_in],
                ['Citizenship', p?.citizenship],
                ['Account phone', p?.phone],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="group flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <dt className="text-[11px] text-ink-500">{k}</dt>
                      <dd className="break-words font-medium text-ink-900">{v}</dd>
                    </div>
                    <button onClick={() => void copy(k as string, String(v))} aria-label={`Copy ${k}`} className="mt-3 shrink-0 text-ink-300 hover:text-brand-700">
                      {copied === k ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
            </dl>
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-sm font-bold text-ink-950">CV</p>
            {d.cv ? (
              <>
                <p className="mt-1 text-xs text-ink-500">
                  {d.cv.file_name ?? 'Pasted text'} · updated {date(d.cv.updated_at)}
                  {d.cv.titles?.length ? ` · ${d.cv.titles.slice(0, 2).join(', ')}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.cv.storage_path && (
                    <SmallBtn onClick={() => void downloadCv()} icon={Download}>
                      Download file
                    </SmallBtn>
                  )}
                  <SmallBtn onClick={() => setShowCv((v) => !v)} icon={FileText}>
                    {showCv ? 'Hide text' : 'Read text'}
                  </SmallBtn>
                </div>
                {showCv && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-[12px] leading-5 text-ink-800">{d.cv.text}</pre>}
              </>
            ) : (
              <p className="mt-1 text-sm text-rose-700">No CV on file.</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-sm font-bold text-ink-950">What they asked for</p>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <div><dt className="inline text-ink-500">Roles: </dt><dd className="inline font-medium text-ink-900">{r.roles.join(', ') || 'Any'}</dd></div>
              <div><dt className="inline text-ink-500">Countries: </dt><dd className="inline font-medium text-ink-900">{r.countries.join(', ') || 'Any'}</dd></div>
              <div><dt className="inline text-ink-500">Per day: </dt><dd className="inline font-medium text-ink-900">up to {r.per_day}</dd></div>
              {p?.specialization && <div><dt className="inline text-ink-500">Specialization: </dt><dd className="inline font-medium text-ink-900">{p.specialization}</dd></div>}
              {p?.linkedin && (
                <div>
                  <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                    LinkedIn <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </dl>
            <p className="mt-3 rounded-lg bg-ink-50 p-2.5 text-[11.5px] leading-4 text-ink-500">“{r.consent_text}”</p>
          </div>

          <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-sm font-bold text-ink-950">Private note</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Only admins see this" className="mt-2 w-full rounded-lg border border-ink-200 p-2 text-[13px] outline-none focus:border-brand-500" />
            <SmallBtn onClick={() => void update({ p_admin_note: note }, 'note')} busy={busy === 'note'} icon={Check}>
              Save note
            </SmallBtn>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ItemRow({ item, busy, onSet }: { item: Item; busy: string | null; onSet: (i: Item, s: ItemStatus, extra?: { p_note?: string; p_admin_note?: string }) => Promise<void> }) {
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState('');
  const page = item.job_id ? jobPath({ id: `sponsored-${item.job_id}`, title: item.title, company: item.company }) : null;
  const b = (s: ItemStatus) => busy === item.id + s;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold ${item.score != null && item.score >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-700'}`}>
          {item.score != null ? `${item.score}` : '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-950">
            {item.title}
            {item.status === 'applying' && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">Applying</span>}
            {item.live === false && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Closed</span>}
            {item.source === 'admin' && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Added by admin</span>}
          </p>
          <p className="text-xs text-ink-500">
            {item.company}
            {item.location ? ` · ${item.location}` : ''}
            {item.status === 'applied' ? ` · applied ${dateTime(item.applied_at)}${item.notified_at ? ' · emailed' : ''}` : ` · added ${date(item.created_at)}`}
            {item.status === 'skipped' ? ' · skipped' : ''}
          </p>
          {item.note && <p className="mt-1 text-xs text-ink-600">Note to them: {item.note}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700">
                Employer’s page <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {page && (
              <a href={page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline">
                On MadeVisa <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.status === 'queued' && (
            <SmallBtn onClick={() => void onSet(item, 'applying')} busy={b('applying')} icon={Zap}>
              Start
            </SmallBtn>
          )}
          {(item.status === 'queued' || item.status === 'applying') && (
            <SmallBtn onClick={() => setMarking((v) => !v)} icon={CheckCircle2} tone="green">
              Mark applied
            </SmallBtn>
          )}
          {(item.status === 'queued' || item.status === 'applying') && (
            <button onClick={() => void onSet(item, 'skipped', { p_note: 'Not a fit after review' })} disabled={b('skipped')} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500 hover:text-ink-800">
              <SkipForward className="h-3.5 w-3.5" /> Skip
            </button>
          )}
          {item.status === 'skipped' && (
            <SmallBtn onClick={() => void onSet(item, 'queued')} busy={b('queued')} icon={Undo2}>
              Back to queue
            </SmallBtn>
          )}
          {item.status === 'applied' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Applied
            </span>
          )}
        </div>
      </div>
      {marking && (
        <div className="mt-3 rounded-lg bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
          <label className="block text-[12px] font-semibold text-ink-700">
            Note for them (optional, shown in the email)
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. Applied on Workday with your Gmail address" className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] font-normal outline-none focus:border-brand-500" />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <SmallBtn
              onClick={async () => {
                await onSet(item, 'applied', note.trim() ? { p_note: note.trim() } : {});
                setMarking(false);
              }}
              busy={b('applied')}
              icon={Send}
              tone="green"
            >
              Applied — email them
            </SmallBtn>
            <button onClick={() => setMarking(false)} className="text-[12px] font-semibold text-ink-500 hover:text-ink-800">
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddJob({ requestId, onAdded }: { requestId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** A MadeVisa job link (or id) → the job's id. */
  const resolve = async (s: string): Promise<string | null> => {
    const v = s.trim();
    const uuid = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuid) return uuid[0].toLowerCase();
    const path = v.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/?jobs\//, '').split(/[?#]/)[0];
    const parsed = parseJobPath(path);
    if (parsed.kind === 'legacy') return parsed.uuid;
    if (parsed.kind === 'slug') return (await fetchSponsoredJobByShortId(parsed.shortId, parsed.titleSlug))?.id ?? null;
    return null;
  };

  const add = async () => {
    setBusy(true);
    setMsg(null);
    let job: string | null = null;
    if (link.trim()) {
      job = await resolve(link);
      if (!job) {
        setBusy(false);
        return setMsg({ ok: false, text: 'That MadeVisa link wasn’t found. Paste the job page link, or fill in the job by hand.' });
      }
    }
    const { error } = await supabase.rpc('admin_auto_apply_add', {
      p_request: requestId,
      p_job: job,
      p_title: title || null,
      p_company: company || null,
      p_url: url || null,
      p_location: location || null,
      p_status: applied ? 'applied' : 'queued',
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    setMsg({ ok: true, text: applied ? 'Added as applied — they’ve been emailed.' : 'Added to the queue.' });
    setLink('');
    setTitle('');
    setCompany('');
    setUrl('');
    setLocation('');
    onAdded();
  };

  const input = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] outline-none focus:border-brand-500';
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-bold text-ink-950">
        <span className="inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Add a job
        </span>
        <span className="text-xs font-medium text-ink-500">{open ? 'Close' : 'A MadeVisa job, or any other'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <label className="block text-[12px] font-semibold text-ink-700">
            MadeVisa job link
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://madevisa.com/jobs/company/role-8c8cf15d" className={`${input} mt-1`} />
          </label>
          <p className="text-[12px] text-ink-500">…or a job from somewhere else. For a MadeVisa job the link is enough.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" className={input} />
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className={input} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… application page" className={input} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, country" className={input} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-800">
            <input type="checkbox" checked={applied} onChange={(e) => setApplied(e.target.checked)} className="h-4 w-4 accent-[#2563EB]" />
            I already applied — email them now
          </label>
          <div className="flex items-center gap-3">
            <SmallBtn onClick={() => void add()} busy={busy} icon={Plus} tone="green">
              Add
            </SmallBtn>
            {msg && <span className={`text-[12.5px] ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SmallBtn({ onClick, busy = false, icon: Icon, children, tone = 'ink' }: { onClick: () => void; busy?: boolean; icon: typeof Check; children: React.ReactNode; tone?: 'ink' | 'green' | 'rose' }) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : tone === 'rose'
        ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
        : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50';
  return (
    <button onClick={onClick} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${cls}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" /> All Auto Apply requests
    </button>
  );
}

function Spinner() {
  return (
    <div className="mt-8 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
    </div>
  );
}
