import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Languages, Loader2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EDU_NAME, type CvProfile } from '@/lib/cv/cvProfile';
import { LEVEL_NAME } from '@/lib/cv/languages';
import { skillName } from '@/lib/cv/skills';

// Admin → CVs: every CV stored with an account, newest first.
//
// Search by name, email, file name or any word in the CV. Open one to read
// its text, what the site read from it (skills, titles, years, education,
// languages), the jobs it was checked against, and to download the original
// file. CVs of visitors without an account never leave their browser, so they
// are counted (Control room) but can't be listed here.
//
// One CV per person: a new upload REPLACES the person's earlier CV. So the
// number of people only goes up with someone's first CV; what moves with every
// upload is "uploads today" and the row's date (it goes to the top, marked
// "Replaced"). The list refreshes by itself every minute and when the admin
// comes back to the tab.
//
// Server side: admin_cv_list / admin_cv_get and the admin read policies on
// user_cvs and the private `cvs` bucket (migration 20261127090000).

type Row = {
  user_id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  file_name: string | null;
  file_size: number | null;
  has_file: boolean;
  words: number | null;
  skills: number;
  years: number | null;
  titles: string[];
  education: number | null;
  languages: { name: string; level: number | null }[];
  created_at: string;
  updated_at: string;
  checks: number;
  avg_score: number | null;
  pro: boolean;
};
type Detail = {
  user_id: string;
  file_name: string | null;
  storage_path: string | null;
  text: string;
  profile: Partial<CvProfile> | null;
  created_at: string;
  updated_at: string;
  checks: { job_key: string; score: number; at: string; title: string | null; company: string | null }[];
};
/** admin_cv_limits(). The two upload counts come with migration 20261202090000. */
type Limits = { guests_today: number; guests_blocked_today: number; uploads_today?: number; guest_uploads_today?: number };
/** translate_status(), migration 20261128090000. */
type Translation = { enabled: boolean; monthly_chars: number | null; provider: 'google' | 'azure' | null; last_error: string | null; used: number; calls: number; jobs: number; cvs: number };
const FREE_CHARS = { google: 480_000, azure: 1_900_000 } as const;

/** Translation of ads and CVs in other languages: what it has used this month, the switch and the limit. */
function TranslationCard() {
  const [t, setT] = useState<Translation | null>(null);
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('translate_status');
    if (!error && data) setT(data as Translation);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!t) return null; // migration 20261128090000 not run yet
  const limit = t.monthly_chars ?? (t.provider ? FREE_CHARS[t.provider] : FREE_CHARS.google);
  const share = Math.min(100, Math.round((100 * t.used) / Math.max(1, limit)));
  const configure = async (args: { p_enabled?: boolean; p_monthly_chars?: number; p_reset_cap?: boolean }) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('translate_configure', args);
    setBusy(false);
    if (!error && data) setT(data as Translation);
  };
  return (
    <section aria-label="Translation" className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <Languages className="h-4 w-4 text-ink-400" /> Translation for matching
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!t.provider ? 'bg-amber-100 text-amber-900' : t.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-600'}`}>
          {!t.provider ? 'Not used yet' : t.enabled ? `On · ${t.provider === 'google' ? 'Google' : 'Azure'}` : 'Off'}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-700">
          <input type="checkbox" checked={t.enabled} disabled={busy} onChange={(e) => void configure({ p_enabled: e.target.checked })} /> Translate
        </label>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-600">
        Job ads and CVs written in another language are translated into English once, then compared. {t.jobs.toLocaleString('en-US')} job {t.jobs === 1 ? 'ad' : 'ads'} and {t.cvs.toLocaleString('en-US')} {t.cvs === 1 ? 'CV' : 'CVs'} translated so far.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className={`h-full rounded-full ${share >= 90 ? 'bg-amber-500' : 'bg-brand-600'}`} style={{ width: `${share}%` }} />
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-ink-500">
            {t.used.toLocaleString('en-US')} of {limit.toLocaleString('en-US')} characters this month{t.monthly_chars == null ? ' (the free allowance)' : ''}. When it is used up, nothing more is translated until next month.
          </p>
        </div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.round(Number(cap.replace(/[^0-9]/g, '')));
            if (n > 0) void configure({ p_monthly_chars: n }).then(() => setCap(''));
          }}
        >
          <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" placeholder="New monthly limit" className="w-36 rounded-md border border-ink-200 px-2.5 py-1.5 text-xs" aria-label="Monthly character limit" />
          <button disabled={busy || !cap} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            Set
          </button>
          {t.monthly_chars != null && (
            <button type="button" disabled={busy} onClick={() => void configure({ p_reset_cap: true })} className="rounded-md px-2 py-1.5 text-xs font-semibold text-brand-700 hover:underline">
              Back to free allowance
            </button>
          )}
        </form>
      </div>
      {!t.provider && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Nothing has been translated yet. To switch it on, add <span className="font-mono">GOOGLE_TRANSLATE_API_KEY</span> (or <span className="font-mono">AZURE_TRANSLATOR_KEY</span> and <span className="font-mono">AZURE_TRANSLATOR_REGION</span>) as a secret and deploy the function: <span className="font-mono">supabase functions deploy translate --no-verify-jwt</span>. Until then ads and CVs are compared in their own language.
        </p>
      )}
      {t.last_error && <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">Last problem: {t.last_error}</p>}
    </section>
  );
}

const PAGE = 25;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const kb = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
/**
 * Has this CV been replaced since it was first added? Saving a first CV writes
 * the row twice within seconds (the text, then the file's path), so only a
 * later change counts.
 */
const replaced = (created: string, updated: string) => Date.parse(updated) - Date.parse(created) > 2 * 60_000;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const scoreTone = (n: number) => (n >= 75 ? 'bg-emerald-100 text-emerald-800' : n >= 50 ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-700');

function CvDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.rpc('admin_cv_get', { p_user: row.user_id }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) setErr(error?.message ?? 'This CV has been removed.');
      else setD(data as Detail);
    });
    return () => {
      alive = false;
    };
  }, [row.user_id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    if (!d?.storage_path) return;
    setBusy(true);
    const { data, error } = await supabase.storage.from('cvs').createSignedUrl(d.storage_path, 120, { download: d.file_name ?? true });
    setBusy(false);
    if (error || !data?.signedUrl) return setErr(error?.message ?? 'The file could not be opened.');
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const downloadText = () => {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([d.text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(row.name || row.email || 'cv').replace(/[^\p{L}\p{N}]+/gu, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const p = d?.profile ?? null;
  const skills = Object.entries(p?.skills ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/50" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`CV of ${row.name || row.email || 'this person'}`} className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-ink-950">{row.name || 'No name yet'}</p>
            <p className="truncate text-sm text-ink-500">
              {row.email ? (
                <a href={`mailto:${row.email}`} className="text-brand-700 hover:underline">
                  {row.email}
                </a>
              ) : (
                '—'
              )}
              {row.pro ? ' · Pro' : ''}
              {row.username ? (
                <>
                  {' · '}
                  <a href={`/u/${row.username}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    profile
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {err && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
          {!d && !err && (
            <p className="flex items-center gap-2 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {d && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {d.storage_path ? (
                  <button onClick={() => void download()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download {d.file_name ?? 'the file'}
                  </button>
                ) : (
                  <span className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">No file stored — this CV was pasted as text, or uploaded before signing up.</span>
                )}
                <button onClick={downloadText} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <FileText className="h-4 w-4" /> Text as .txt
                </button>
                <span className="text-xs text-ink-500">
                  Added {when(d.created_at)}
                  {replaced(d.created_at, d.updated_at) ? ` · replaced ${when(d.updated_at)}` : ''}
                </span>
              </div>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">What the site read from it</h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-500">Job titles</dt>
                    <dd className="text-ink-900">{p?.titles?.length ? p.titles.slice(0, 6).join(' · ') : 'None found'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Experience</dt>
                    <dd className="text-ink-900">{p?.years != null ? `${p.years} ${p.years === 1 ? 'year' : 'years'}${p.yearsFrom === 'stated' ? ' (as stated)' : ' (from the dates)'}` : 'Not found'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Education</dt>
                    <dd className="text-ink-900">{p?.education ? EDU_NAME[p.education] : 'Not found'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Languages</dt>
                    <dd className="text-ink-900">{p?.languages?.length ? p.languages.map((l) => `${l.name}${l.level ? ` ${LEVEL_NAME[l.level]}` : ''}`).join(' · ') : 'None found'}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-ink-500">
                  {skills.length} {skills.length === 1 ? 'skill' : 'skills'} · {p?.words ?? 0} words
                </p>
                {skills.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {skills.slice(0, 60).map(([id, n]) => (
                      <span key={id} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-800">
                        {skillName(id)}
                        {n > 1 ? <span className="text-ink-400"> ×{n}</span> : null}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Jobs checked with this CV · {d.checks.length}</h3>
                {!d.checks.length ? (
                  <p className="mt-2 text-sm text-ink-500">No job has been checked yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-200">
                    {d.checks.map((c) => (
                      <li key={c.job_key} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className={`w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${scoreTone(c.score)}`}>{c.score}%</span>
                        <span className="min-w-0 flex-1 truncate">
                          {c.title ? (
                            <a href={`/jobs/${c.job_key}`} target="_blank" rel="noreferrer" className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                              {c.title}
                            </a>
                          ) : (
                            <span className="text-ink-500">A job no longer listed</span>
                          )}
                          {c.company ? <span className="text-ink-500"> · {c.company}</span> : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-400">{when(c.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">The CV as text</h3>
                <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-200 bg-ink-50 p-4 font-sans text-[13px] leading-6 text-ink-900">{d.text}</pre>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function CvsSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_cv_list', { p_search: query || null, p_limit: PAGE, p_offset: page * PAGE });
    setLoading(false);
    if (error) {
      if (/function|schema cache|does not exist/i.test(error.message)) setMissing(true);
      else setErr(error.message);
      return;
    }
    setErr(null);
    const out = data as { total: number; rows: Row[] };
    setRows(out.rows ?? []);
    setTotal(out.total ?? 0);
    const lim = await supabase.rpc('admin_cv_limits');
    setLimits(lim.error ? null : (lim.data as Limits));
  }, [query, page]);
  // Kept up to date without a click: every minute, and when the admin comes
  // back to this tab (say, after uploading a CV in another one).
  useEffect(() => {
    void load();
    let last = Date.now();
    const refresh = (minGap: number) => {
      if (document.visibilityState !== 'visible' || Date.now() - last < minGap) return;
      last = Date.now();
      void load();
    };
    const t = window.setInterval(() => refresh(0), 60_000);
    // Coming back fires both events; one reload is enough.
    const onBack = () => refresh(3_000);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [load]);
  // Search as you type, after a short pause.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(0);
      setQuery(search.trim());
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  if (missing) {
    return (
      <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        Run the migration <span className="font-mono text-[13px]">20261127090000_control_room_cvs_media.sql</span> in the Supabase SQL Editor to see CVs here (after <span className="font-mono text-[13px]">20261126090000_cv_match_one_plan.sql</span>).
      </p>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const uploadsToday = limits?.uploads_today;
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, an email, a file name or a word in the CV (e.g. “nurse”, “Python”)" className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
        <p className="text-sm text-ink-600" title="One CV per person: a new upload replaces the person’s earlier CV. This number goes up only when someone adds their first CV.">
          <strong className="tabular-nums text-ink-950">{total.toLocaleString('en-US')}</strong> {query ? (total === 1 ? 'CV found' : 'CVs found') : total === 1 ? 'person with a CV' : 'people with a CV'}
          {uploadsToday != null && !query && (
            <span title="Every time an account saved a new or changed CV today (the day runs on UTC, like the daily limits).">
              {' · '}
              <strong className="tabular-nums text-ink-950">{uploadsToday.toLocaleString('en-US')}</strong> {uploadsToday === 1 ? 'upload' : 'uploads'} today
            </span>
          )}
        </p>
        <button onClick={() => void load()} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Refresh">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
        <p>
          CVs are personal data: open one when there is a reason to (support, a problem with a match, checking how CVs are read). The Privacy Policy tells people that MadeVisa staff can, and that employers never see them. Each person has one CV: a new upload replaces the earlier one, so the row moves to the top with a new date and the number of people stays the same. Limits: an account can change its CV 15 times a day; a visitor without an account can try 3 CVs a day
          {limits ? ` — today ${limits.guests_today} ${limits.guests_today === 1 ? 'visitor has' : 'visitors have'} uploaded without an account${limits.guest_uploads_today != null ? ` (${limits.guest_uploads_today} ${limits.guest_uploads_today === 1 ? 'CV' : 'CVs'})` : ''}, ${limits.guests_blocked_today} reached the limit.` : '.'} Visitors’ CVs stay in their browser, so only CVs with an account are listed.
        </p>
      </div>
      {err && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">{err}</p>}
      <TranslationCard />

      {!rows ? (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : !rows.length ? (
        <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">{query ? `No CV matches “${query}”.` : 'No CVs yet. They appear here as people upload them.'}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs font-semibold text-ink-500">
                <tr>
                  <th className="px-4 py-2.5">Person</th>
                  <th className="px-4 py-2.5">What the CV says</th>
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5 text-right">Checks</th>
                  <th className="px-4 py-2.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.user_id} onClick={() => setOpen(r)} className="cursor-pointer align-top hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <button onClick={() => setOpen(r)} className="block max-w-[200px] truncate text-left font-semibold text-ink-950 hover:text-brand-700">
                        {r.name || 'No name yet'}
                      </button>
                      <span className="block max-w-[200px] truncate text-xs text-ink-500">{r.email ?? '—'}</span>
                      {r.pro && <span className="mt-1 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800">Pro</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[280px] truncate text-ink-900">{r.titles?.[0] ?? 'No job title found'}</span>
                      <span className="block text-xs text-ink-500">
                        {[r.years != null ? `${r.years} yrs` : null, r.education ? EDU_NAME[r.education] : null, `${r.skills} skills`, r.languages?.length ? r.languages.map((l) => l.name).slice(0, 3).join(', ') : null].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[180px] truncate text-ink-800">{r.file_name ?? 'CV'}</span>
                      <span className="block text-xs text-ink-500">{[r.words ? `${r.words.toLocaleString('en-US')} words` : null, r.has_file ? kb(r.file_size) : 'text only'].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="block text-ink-900">{r.checks}</span>
                      {r.avg_score != null && <span className="block text-xs text-ink-500">avg {r.avg_score}%</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-ink-500">
                      <span className="block">{when(r.updated_at)}</span>
                      <span className="block text-ink-400">{replaced(r.created_at, r.updated_at) ? `Replaced · first added ${day(r.created_at)}` : 'First CV'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5 text-xs text-ink-600">
              <span>
                {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString('en-US')}
              </span>
              <span className="flex items-center gap-1">
                <button onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page === 0} className="rounded-md p-1.5 hover:bg-ink-100 disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                Page {page + 1} of {pages}
                <button onClick={() => setPage((n) => Math.min(pages - 1, n + 1))} disabled={page >= pages - 1} className="rounded-md p-1.5 hover:bg-ink-100 disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}
        </div>
      )}

      {open && <CvDetail row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
