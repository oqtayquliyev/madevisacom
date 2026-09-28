import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Eye, FileText, Loader2, Newspaper, Pencil, Plus, Save, Sparkles, Stamp, Trash2, X } from 'lucide-react';
import { RichTextField } from '@/components/admin/RichTextField';
import { visaGuides } from '@/data/visa';
import {
  articleSlug,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  deleteArticle,
  fetchAllArticlesAdmin,
  fetchArticle,
  fetchSeoSettings,
  insertGeneratedArticles,
  runReportsNow,
  saveArticle,
  updateSeoSettings,
  type Article,
  type ArticleCard,
  type ArticleCategory,
  type ArticleInput,
  type SeoSettings,
} from '@/lib/articles';
import { visaGuideArticle } from '@/lib/visaArticles';

type Filter = 'all' | 'live' | 'scheduled' | 'draft';

const input =
  'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

const stateOf = (a: Pick<ArticleCard, 'status' | 'publish_at'>): 'live' | 'scheduled' | 'draft' =>
  a.status !== 'published' ? 'draft' : a.publish_at && Date.parse(a.publish_at) > Date.now() ? 'scheduled' : 'live';

const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** <input type="datetime-local"> value for a Date, in local time. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Badge({ a }: { a: ArticleCard }) {
  const s = stateOf(a);
  const cls = s === 'live' ? 'bg-emerald-100 text-emerald-800' : s === 'scheduled' ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-600';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{s === 'live' ? 'Live' : s === 'scheduled' ? `Scheduled ${fmtWhen(a.publish_at)}` : 'Draft'}</span>;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function Editor({ initial, onClose, onSaved }: { initial: Partial<Article>; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState<Partial<Article>>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [mode, setMode] = useState<'visual' | 'html'>(initial.source && initial.source !== 'manual' ? 'html' : 'visual');
  const [when, setWhen] = useState(initial.publish_at ? localInput(new Date(initial.publish_at)) : localInput(new Date(Date.now() + 3_600_000)));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<Article>) => setA((cur) => ({ ...cur, ...patch }));

  const save = async (kind: 'draft' | 'now' | 'schedule') => {
    if (!a.title?.trim()) return setErr('Add a title.');
    if (!a.slug?.trim()) return setErr('Add an address (slug).');
    setBusy(kind);
    setErr(null);
    const row: ArticleInput = {
      id: a.id,
      title: a.title.trim(),
      slug: a.slug.trim(),
      excerpt: (a.excerpt ?? '').trim(),
      body_html: a.body_html ?? '',
      category: (a.category ?? 'guides') as ArticleCategory,
      country_code: a.country_code || null,
      cover_url: a.cover_url?.trim() || null,
      author_name: a.author_name?.trim() || 'MadeVisa Editorial',
      tags: a.tags ?? [],
      status: kind === 'draft' ? 'draft' : 'published',
      publish_at: kind === 'now' ? new Date().toISOString() : kind === 'schedule' ? new Date(when).toISOString() : a.publish_at ?? null,
      ...(a.id ? {} : { source: 'manual' as const }),
    };
    const res = await saveArticle(row);
    setBusy(null);
    if (!res.ok) return setErr(res.error);
    onSaved();
    onClose();
  };

  const excerptLen = (a.excerpt ?? '').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/40" role="dialog" aria-modal="true" aria-label="Edit article">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <p className="font-semibold text-ink-950">{a.id ? 'Edit article' : 'New article'}</p>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label className="block text-xs font-medium text-ink-700">
            Title
            <input
              className={`${input} mt-1 text-base font-semibold`}
              value={a.title ?? ''}
              onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: articleSlug(e.target.value) }) })}
              placeholder="e.g. How to find jobs with visa sponsorship in Germany"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium text-ink-700 sm:col-span-2">
              Address
              <div className="mt-1 flex items-center rounded-md border border-ink-200 focus-within:border-brand-500">
                <span className="pl-3 text-sm text-ink-400">/blog/</span>
                <input
                  className="w-full rounded-md px-1 py-2 text-sm focus:outline-none"
                  value={a.slug ?? ''}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') });
                  }}
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Category
              <select className={`${input} mt-1`} value={a.category ?? 'guides'} onChange={(e) => set({ category: e.target.value as ArticleCategory })}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-ink-700">
            Summary (shown in Google and on the blog)
            <textarea className={`${input} mt-1`} rows={2} value={a.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} maxLength={400} />
            <span className={`mt-0.5 block font-normal ${excerptLen > 160 ? 'text-amber-700' : 'text-ink-400'}`}>{excerptLen}/160 — Google usually shows about 155 characters.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium text-ink-700">
              Country (optional)
              <select className={`${input} mt-1`} value={a.country_code ?? ''} onChange={(e) => set({ country_code: e.target.value || null })}>
                <option value="">—</option>
                {visaGuides.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-700 sm:col-span-2">
              Cover image URL (optional)
              <input className={`${input} mt-1`} value={a.cover_url ?? ''} onChange={(e) => set({ cover_url: e.target.value })} placeholder="https://…" />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-700">Article</span>
              <div className="flex rounded-md bg-ink-100 p-0.5 text-xs font-semibold">
                {(['visual', 'html'] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`rounded px-2.5 py-1 ${mode === m ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>
                    {m === 'visual' ? 'Visual' : 'HTML'}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'visual' ? (
              <>
                <RichTextField value={a.body_html ?? ''} onChange={(html) => set({ body_html: html })} />
                <p className="mt-1 text-xs text-ink-400">Visual mode keeps headings, lists, bold and links. Tables and stat boxes need HTML mode.</p>
              </>
            ) : (
              <textarea className={`${input} min-h-[360px] font-mono text-xs`} value={a.body_html ?? ''} onChange={(e) => set({ body_html: e.target.value })} spellCheck={false} />
            )}
          </div>
        </div>

        <div className="border-t border-ink-200 px-5 py-3">
          {err && <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{err}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void save('now')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />} Publish now
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border border-ink-200 p-1">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded px-1.5 py-1 text-xs focus:outline-none" aria-label="Publish at" />
              <button onClick={() => void save('schedule')} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2.5 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-200 disabled:opacity-50">
                <CalendarClock className="h-3.5 w-3.5" /> Schedule
              </button>
            </div>
            <button onClick={() => void save('draft')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50">
              <Save className="h-4 w-4" /> Save as draft
            </button>
            {a.id && a.slug && (
              <a href={`/blog/${a.slug}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                <Eye className="h-3.5 w-3.5" /> Preview
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function ArticlesSection() {
  const [articles, setArticles] = useState<ArticleCard[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Partial<Article> | null>(null);
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [visaPick, setVisaPick] = useState<Set<string>>(() => new Set(visaGuides.map((g) => g.code)));
  const [visaEvery, setVisaEvery] = useState(24);

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([fetchAllArticlesAdmin(), fetchSeoSettings()]);
    setMissing(list === null);
    setArticles(list ?? []);
    setSettings(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, scheduled: 0, draft: 0 };
    for (const a of articles ?? []) {
      c.all++;
      c[stateOf(a)]++;
    }
    return c;
  }, [articles]);

  const shown = (articles ?? []).filter((a) => filter === 'all' || stateOf(a) === filter);

  const openEdit = async (card: ArticleCard) => {
    const full = await fetchArticle(card.slug);
    setEditing(full ?? card);
  };

  const remove = async (a: ArticleCard) => {
    if (!window.confirm(`Delete “${a.title}”? This can’t be undone.`)) return;
    const res = await deleteArticle(a.id);
    if (!res.ok) setMsg({ ok: false, text: res.error ?? 'Could not delete.' });
    void load();
  };

  const saveSettings = async (patch: Partial<SeoSettings>, label: string) => {
    setBusy(label);
    const res = await updateSeoSettings(patch);
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? 'Could not save.' });
    setSettings((s) => (s ? { ...s, ...patch } : s));
  };

  const generateVisa = async () => {
    const guides = visaGuides.filter((g) => visaPick.has(g.code));
    if (!guides.length) return;
    setBusy('visa');
    setMsg(null);
    // One per slot, starting tomorrow at 09:00 local time.
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const rows = guides.map((g, i) => ({ ...visaGuideArticle(g), publish_at: new Date(start.getTime() + i * visaEvery * 3_600_000).toISOString() }));
    const res = await insertGeneratedArticles(rows);
    setBusy(null);
    setMsg(
      res.error
        ? { ok: false, text: res.error }
        : { ok: true, text: `${res.added} visa guides scheduled, one every ${visaEvery} h from tomorrow 09:00${res.skipped ? ` · ${res.skipped} already existed` : ''}.` }
    );
    void load();
  };

  const reportsNow = async () => {
    setBusy('reports');
    setMsg(null);
    const res = await runReportsNow();
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: 'Writing this week’s hiring reports on the server — they appear in the list in a minute or two.' } : { ok: false, text: res.error ?? 'Failed.' });
    if (res.ok) window.setTimeout(() => void load(), 60_000);
  };

  if (missing) {
    return (
      <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Run the migration <code>20261102090000_seo_articles_insights.sql</code> to turn on the blog.
      </section>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Automation */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
            <Sparkles className="h-4 w-4 text-brand-600" /> Weekly hiring reports
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            Every Monday the server writes one report per top country from live data (who’s hiring, roles, remote, visa sponsorship, week-on-week change) and publishes them through the week.
          </p>
          {settings && (
            <>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.auto_reports_enabled} onChange={(e) => void saveSettings({ auto_reports_enabled: e.target.checked }, 'auto')} disabled={busy !== null} />
                Publish automatically every week
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-600">
                <label>
                  Countries per week
                  <input type="number" min={1} max={25} className={`${input} mt-1`} value={settings.reports_per_week} onChange={(e) => setSettings({ ...settings, reports_per_week: Number(e.target.value) })} onBlur={() => void saveSettings({ reports_per_week: settings.reports_per_week }, 'n')} />
                </label>
                <label>
                  Hours between posts
                  <input type="number" min={1} max={72} className={`${input} mt-1`} value={settings.reports_spread_hours} onChange={(e) => setSettings({ ...settings, reports_spread_hours: Number(e.target.value) })} onBlur={() => void saveSettings({ reports_spread_hours: settings.reports_spread_hours }, 'h')} />
                </label>
              </div>
              {settings.last_reports_at && <p className="mt-2 text-xs text-ink-400">Last written {fmtWhen(settings.last_reports_at)}</p>}
            </>
          )}
          <button onClick={() => void reportsNow()} disabled={busy !== null} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-200 disabled:opacity-50">
            {busy === 'reports' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Write this week’s reports now
          </button>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
            <Stamp className="h-4 w-4 text-brand-600" /> Visa guides
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-600">One long-form guide per country, built from the checked visa data on each country page. Scheduled one at a time.</p>
          <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {visaGuides.map((g) => {
              const on = visaPick.has(g.code);
              return (
                <button
                  key={g.code}
                  onClick={() => setVisaPick((s) => {
                    const n = new Set(s);
                    if (on) n.delete(g.code);
                    else n.add(g.code);
                    return n;
                  })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-500'}`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-600">
            One every
            <input type="number" min={1} max={168} className="w-16 rounded-md border border-ink-200 px-2 py-1 text-xs" value={visaEvery} onChange={(e) => setVisaEvery(Math.max(1, Number(e.target.value)))} />
            hours
          </label>
          <button onClick={() => void generateVisa()} disabled={busy !== null || !visaPick.size} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy === 'visa' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />} Schedule {visaPick.size} guides
          </button>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm font-bold text-ink-950">Google Indexing</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            Tells Google about each new job the moment it’s published, so it appears in search within hours. Needs the <code>GOOGLE_INDEXING_SA</code> secret (see setup notes).
          </p>
          {settings && (
            <>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.google_indexing_enabled} onChange={(e) => void saveSettings({ google_indexing_enabled: e.target.checked }, 'g')} disabled={busy !== null} />
                Send new jobs to Google
              </label>
              <label className="mt-3 block text-xs text-ink-600">
                Daily limit (Google’s default quota is 200)
                <input type="number" min={0} className={`${input} mt-1`} value={settings.google_daily_cap} onChange={(e) => setSettings({ ...settings, google_daily_cap: Number(e.target.value) })} onBlur={() => void saveSettings({ google_daily_cap: settings.google_daily_cap }, 'cap')} />
              </label>
              <p className="mt-2 text-xs text-ink-400">
                Sent today: {settings.google_day === new Date().toISOString().slice(0, 10) ? settings.google_sent_today : 0}
              </p>
            </>
          )}
        </div>
      </section>

      {msg && <p className={`rounded-md px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}

      {/* List */}
      <section className="rounded-xl border border-ink-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'live', 'scheduled', 'draft'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-ink-950 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
                {f === 'all' ? 'All' : f === 'live' ? 'Live' : f === 'scheduled' ? 'Scheduled' : 'Drafts'} · {counts[f]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing({ category: 'guides', status: 'draft', body_html: '', source: 'manual' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New article
          </button>
        </div>

        {!articles ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : !shown.length ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">No articles here yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-950">{a.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <Badge a={a} />
                    <span>{CATEGORY_LABEL[a.category]}</span>
                    {a.source !== 'manual' && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{a.source === 'auto-report' ? 'Auto report' : 'Visa guide'}</span>}
                    <span>/blog/{a.slug}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`/blog/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Open">
                    <Eye className="h-4 w-4" />
                  </a>
                  <button onClick={() => void openEdit(a)} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void remove(a)} className="rounded-md p-2 text-ink-500 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <Editor initial={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}
