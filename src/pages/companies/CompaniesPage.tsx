import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, Building2, ChevronDown, Loader2, MessageSquarePlus, Search, SlidersHorizontal, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { companyPath, fetchCompaniesDirectory, type DirectoryCompany } from '@/lib/companies';
import { formatRelativeTime } from '@/lib/dates';
import { MiniArea } from '@/components/charts/SoftCharts';
import { HireCountries } from '@/components/companies/HireCountries';
import { ShareExperienceDialog } from '@/components/companies/ShareExperienceDialog';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const PAGE_SIZE = 18;

type Sort = 'open' | 'new' | 'growth' | 'response' | 'fastest' | 'recent' | 'name';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'open', label: 'Most open listings' },
  { value: 'new', label: 'Most new (30 days)' },
  { value: 'growth', label: 'Fastest growing' },
  { value: 'response', label: 'Highest response rate' },
  { value: 'fastest', label: 'Fastest reply' },
  { value: 'recent', label: 'Recently hiring' },
  { value: 'name', label: 'Name A–Z' },
];
const MIN_OPEN = [0, 1, 10, 100, 1000];
const ORG_LABEL: Record<string, string> = { company: 'Companies', government: 'Government', agency: 'Agencies', expert: 'Experts' };

type Filters = { q: string; hires: string; hq: string; type: string; min: number; hiring: boolean; response: boolean; growing: boolean; sort: Sort };
const EMPTY: Filters = { q: '', hires: '', hq: '', type: '', min: 0, hiring: false, response: false, growing: false, sort: 'open' };

function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get('sort') as Sort | null;
  return {
    q: p.get('q') ?? '',
    hires: p.get('hires') ?? '',
    hq: p.get('hq') ?? '',
    type: p.get('type') ?? '',
    min: Number(p.get('min')) || 0,
    hiring: p.get('hiring') === '1',
    response: p.get('response') === '1',
    growing: p.get('growing') === '1',
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : 'open',
  };
}

function writeFilters(f: Filters) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.hires) p.set('hires', f.hires);
  if (f.hq) p.set('hq', f.hq);
  if (f.type) p.set('type', f.type);
  if (f.min) p.set('min', String(f.min));
  if (f.hiring) p.set('hiring', '1');
  if (f.response) p.set('response', '1');
  if (f.growing) p.set('growing', '1');
  if (f.sort !== 'open') p.set('sort', f.sort);
  const qs = p.toString();
  window.history.replaceState({}, '', qs ? `/companies?${qs}` : '/companies');
}

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

const newOf = (c: DirectoryCompany) => c.new_30d ?? c.posted_30d;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** Last 4 weeks vs the 4 before, in % (null when there's nothing to compare). */
function growthOf(c: DirectoryCompany): number | null {
  const w = c.weekly;
  if (!w || w.length < 8) return null;
  const now = sum(w.slice(-4));
  const before = sum(w.slice(-8, -4));
  if (!before) return now ? 100 : null;
  return Math.round(((now - before) / before) * 100);
}

export function CompaniesPage({ go, onAuth }: Props) {
  useSeo({
    title: 'Company Scores — hiring activity & applicant response',
    description: 'Search companies by where they hire, how much they are hiring and how often they reply to applicants — based on real data on MadeVisa.',
    path: '/companies',
  });
  const [rows, setRows] = useState<DirectoryCompany[] | null | undefined>(undefined);
  const [f, setF] = useState<Filters>(readFilters);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePick, setSharePick] = useState<{ id?: string | null; name: string; logo_url?: string | null } | null>(null);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    fetchCompaniesDirectory().then(setRows);
  }, []);
  useEffect(() => {
    writeFilters(f);
    setVisibleCount(PAGE_SIZE);
  }, [f]);

  const all = rows ?? [];
  const pickList = useMemo(() => all.map((c) => ({ id: c.id, name: c.name, logo_url: c.logo_url })), [all]);
  const hasV2 = all.some((r) => r.weekly !== undefined);

  // Options come from the data, with counts.
  const hireOptions = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    for (const r of all) for (const c of r.countries ?? []) {
      const e = m.get(c.code) ?? { code: c.code, name: c.name, n: 0 };
      e.n += 1;
      m.set(c.code, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);
  const hqOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.country_name) m.set(r.country_name, (m.get(r.country_name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const typeOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.org_type, (m.get(r.org_type) ?? 0) + 1);
    return [...m.entries()];
  }, [all]);

  const shown = useMemo(() => {
    const term = f.q.trim().toLowerCase();
    const list = all.filter((r) => {
      if (term) {
        const hay = [r.name, r.country_name ?? '', r.website ?? '', ...(r.countries ?? []).map((c) => c.name)].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (f.hires && !(r.countries ?? []).some((c) => c.code === f.hires)) return false;
      if (f.hq && r.country_name !== f.hq) return false;
      if (f.type && r.org_type !== f.type) return false;
      if (f.min && r.active_jobs + r.active_programs < f.min) return false;
      if (f.hiring && newOf(r) <= 0) return false;
      if (f.response && r.response_rate == null) return false;
      if (f.growing && (growthOf(r) ?? 0) <= 0) return false;
      return true;
    });
    const open = (r: DirectoryCompany) => r.active_jobs + r.active_programs;
    const by: Record<Sort, (a: DirectoryCompany, b: DirectoryCompany) => number> = {
      open: (a, b) => open(b) - open(a),
      new: (a, b) => newOf(b) - newOf(a) || open(b) - open(a),
      growth: (a, b) => (growthOf(b) ?? -1e9) - (growthOf(a) ?? -1e9) || newOf(b) - newOf(a),
      response: (a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1) || open(b) - open(a),
      fastest: (a, b) => (a.avg_response_days ?? 1e9) - (b.avg_response_days ?? 1e9),
      recent: (a, b) => (b.last_listed ?? '').localeCompare(a.last_listed ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort((a, b) => by[f.sort](a, b) || a.name.localeCompare(b.name));
  }, [all, f]);

  // Highlights: most new listings in 30 days, and — among companies with
  // at least 10 open roles — the fewest new listings for their size.
  const [top, low] = useMemo(() => {
    const pool = all.filter((r) => r.active_jobs >= 1);
    if (pool.length < 2) return [null, null] as const;
    const best = [...pool].sort((a, b) => newOf(b) - newOf(a) || b.active_jobs - a.active_jobs)[0];
    const sized = pool.filter((r) => r.active_jobs >= 10 && r.id !== best.id);
    const ratio = (r: DirectoryCompany) => newOf(r) / Math.max(1, r.active_jobs);
    const worst = (sized.length ? sized : pool.filter((r) => r.id !== best.id)).sort((a, b) => ratio(a) - ratio(b) || b.active_jobs - a.active_jobs)[0] ?? null;
    return [newOf(best) > 0 ? best : null, worst] as const;
  }, [all]);

  const visible = shown.slice(0, visibleCount);
  const hasMore = visibleCount < shown.length;
  const showMore = () => {
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 250);
  };

  const hireName = hireOptions.find((c) => c.code === f.hires)?.name;
  const chips: { key: string; label: string; clear: () => void }[] = [
    f.q.trim() && { key: 'q', label: `“${f.q.trim()}”`, clear: () => set('q', '') },
    f.hires && { key: 'hires', label: `Hires in ${hireName ?? f.hires}`, clear: () => set('hires', '') },
    f.hq && { key: 'hq', label: `Based in ${f.hq}`, clear: () => set('hq', '') },
    f.type && { key: 'type', label: ORG_LABEL[f.type] ?? f.type, clear: () => set('type', '') },
    f.min > 0 && { key: 'min', label: `${f.min.toLocaleString()}+ open`, clear: () => set('min', 0) },
    f.hiring && { key: 'hiring', label: 'Hiring now', clear: () => set('hiring', false) },
    f.growing && { key: 'growing', label: 'Growing', clear: () => set('growing', false) },
    f.response && { key: 'response', label: 'Has response data', clear: () => set('response', false) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const activeCount = chips.length - (f.q.trim() ? 1 : 0);

  const totalOpen = useMemo(() => sum(all.map((r) => r.active_jobs)), [all]);
  const totalNew = useMemo(() => sum(all.map(newOf)), [all]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="companies" />

      {/* HERO + SEARCH */}
      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-8 sm:px-8 lg:px-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Company Scores</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-white/80">Who's hiring, where, and how fast — from real listings and applicant data.</p>
          {rows && rows.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/85">
              <span>
                <strong className="text-white">{all.length.toLocaleString()}</strong> companies
              </span>
              <span>
                <strong className="text-white">{totalOpen.toLocaleString()}</strong> open jobs
              </span>
              {totalNew > 0 && (
                <span>
                  <strong className="text-white">{totalNew.toLocaleString()}</strong> new in 30 days
                </span>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 rounded-xl bg-white p-2 shadow-lg shadow-black/10 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
              <Search className="h-5 w-5 shrink-0 text-ink-400" />
              <input
                value={f.q}
                onChange={(e) => set('q', e.target.value)}
                placeholder="Search company, website or country"
                className="h-11 w-full bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
              />
              {f.q && (
                <button onClick={() => set('q', '')} className="text-ink-300 hover:text-ink-600" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Select
                value={f.hires}
                onChange={(v) => set('hires', v)}
                className="min-w-0 flex-1 sm:w-52 sm:flex-none"
                options={[{ value: '', label: 'Hires in: any country' }, ...hireOptions.map((c) => ({ value: c.code, label: `${c.name} (${c.n})` }))]}
                disabled={!hasV2}
              />
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
                  showFilters || activeCount ? 'bg-[#1D4ED8] text-white hover:bg-brand-800' : 'bg-[#1D4ED8]/10 text-[#1D4ED8] hover:bg-[#1D4ED8]/15'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeCount > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">{activeCount}</span>}
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">
        {/* FILTER PANEL */}
        {showFilters && (
          <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Based in">
                <Select value={f.hq} onChange={(v) => set('hq', v)} options={[{ value: '', label: 'Any country' }, ...hqOptions.map(([n, k]) => ({ value: n, label: `${n} (${k})` }))]} />
              </Field>
              <Field label="Type">
                <Select value={f.type} onChange={(v) => set('type', v)} options={[{ value: '', label: 'All types' }, ...typeOptions.map(([t, k]) => ({ value: t, label: `${ORG_LABEL[t] ?? t} (${k})` }))]} />
              </Field>
              <Field label="Open listings">
                <div className="flex flex-wrap gap-1.5">
                  {MIN_OPEN.map((m) => (
                    <Pill key={m} active={f.min === m} onClick={() => set('min', m)}>
                      {m === 0 ? 'Any' : `${m.toLocaleString()}+`}
                    </Pill>
                  ))}
                </div>
              </Field>
              <Field label="Show only">
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={f.hiring} onClick={() => set('hiring', !f.hiring)}>
                    Hiring now
                  </Pill>
                  {hasV2 && (
                    <Pill active={f.growing} onClick={() => set('growing', !f.growing)}>
                      Growing
                    </Pill>
                  )}
                  <Pill active={f.response} onClick={() => set('response', !f.response)}>
                    Response data
                  </Pill>
                </div>
              </Field>
            </div>
          </section>
        )}

        {/* HIGHLIGHTS */}
        {!chips.length && (top || low) && (
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            {top && <Highlight c={top} tone="up" title="Highest hiring performance" note="Most new listings in the past 30 days" />}
            {low && <Highlight c={low} tone="down" title="Lowest hiring performance" note="Fewest new listings for its number of open roles" />}
          </div>
        )}

        {/* SHARE YOUR EXPERIENCE */}
        {!chips.length && all.length > 0 && <SharePromo companies={all} onPick={(c) => { setSharePick(c); setShareOpen(true); }} />}

        {/* RESULTS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-700">{rows ? `${shown.length.toLocaleString()} ${shown.length === 1 ? 'company' : 'companies'}` : rows === null ? '' : 'Loading…'}</p>
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={c.clear}
                className="flex items-center gap-1 rounded-full bg-[#1D4ED8]/10 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] transition hover:bg-[#1D4ED8]/15"
              >
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            {chips.length > 1 && (
              <button onClick={() => setF({ ...EMPTY, sort: f.sort })} className="text-xs font-semibold text-ink-500 hover:text-ink-800">
                Clear all
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-500">
            Sort
            <Select
              value={f.sort}
              onChange={(v) => set('sort', v as Sort)}
              className="h-9 w-52"
              options={SORTS.filter((s) => hasV2 || s.value !== 'growth')}
            />
          </label>
        </div>

        {rows === null && (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Company statistics aren't available right now. Please try again later.</p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows === undefined && [0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="skeleton-shimmer h-44 rounded-xl" />)}
          {visible.map((c, i) => {
            const fade = !hasMore || loadingMore ? '' : i >= visible.length - 3 ? (i === visible.length - 1 ? 'mask-fade-b' : i === visible.length - 2 ? 'md:mask-fade-b' : 'xl:mask-fade-b') : '';
            return <CompanyCard key={c.id} c={c} className={fade} />;
          })}
          {loadingMore && [0, 1, 2].map((k) => <div key={`more-${k}`} className="skeleton-shimmer h-44 rounded-xl" />)}
        </div>

        {rows && shown.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-ink-300 bg-white p-10 text-center">
            <p className="font-semibold text-ink-800">No companies match these filters.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-4">
              <button onClick={() => setF({ ...EMPTY })} className="text-sm font-semibold text-[#1D4ED8] hover:underline">
                Clear filters
              </button>
              <button onClick={() => { setSharePick(f.q.trim() ? { name: f.q.trim() } : null); setShareOpen(true); }} className="text-sm font-semibold text-[#1D4ED8] hover:underline">
                Company missing? Share your experience with it
              </button>
            </div>
          </div>
        )}

        {hasMore && (
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={showMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-md border border-ink-300 px-6 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </>
              ) : (
                <>
                  Show more companies <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </main>
      <ShareExperienceDialog open={shareOpen} onClose={() => setShareOpen(false)} initial={sharePick} companies={pickList} onAuth={onAuth} />
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function linkProps(c: DirectoryCompany) {
  const href = companyPath(c);
  return {
    href,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      nav(href);
    },
  };
}

/** "Open listings 4,688 ↑ 4,710 new in past 30 days" */
function OpenStat({ c, big = false }: { c: DirectoryCompany; big?: boolean }) {
  const n = newOf(c);
  const open = c.active_jobs + c.active_programs;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Open listings</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className={`font-bold tabular-nums text-ink-950 ${big ? 'text-3xl' : 'text-2xl'}`}>{open.toLocaleString()}</span>
        {n > 0 ? (
          <span className="flex items-baseline gap-1 text-xs text-ink-500">
            <span className="flex items-center font-bold text-emerald-600">
              <ArrowUp className="h-3 w-3 self-center" strokeWidth={3} />
              {n.toLocaleString()}
            </span>
            new in past 30 days
          </span>
        ) : (
          <span className="text-xs text-ink-400">no new in 30 days</span>
        )}
      </p>
    </div>
  );
}

function CompanyCard({ c, className = '' }: { c: DirectoryCompany; className?: string }) {
  const g = growthOf(c);
  const hasTrend = (c.weekly ?? []).some((v) => v > 0);
  return (
    <a
      {...linkProps(c)}
      className={`group flex flex-col rounded-xl border border-ink-200 bg-white p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-lg hover:shadow-[#1D4ED8]/5 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Logo url={c.logo_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink-950 transition-colors group-hover:text-[#1D4ED8]">{c.name}</p>
          {c.countries && c.countries.length > 0 ? (
            <HireCountries countries={c.countries} total={c.country_count} max={2} className="mt-1" />
          ) : (
            <p className="mt-0.5 truncate text-xs text-ink-500">{c.country_name ?? ORG_LABEL[c.org_type]?.replace(/s$/, '') ?? 'Organization'}</p>
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 -translate-x-1 text-ink-300 opacity-0 transition group-hover:translate-x-0 group-hover:text-[#1D4ED8] group-hover:opacity-100" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <OpenStat c={c} />
        {hasTrend && (
          <div className="shrink-0 text-right" title="New listings per week, last 12 weeks">
            <MiniArea values={c.weekly!} width={112} height={38} />
            <p className="mt-0.5 text-[10px] font-semibold text-ink-400">
              12 weeks
              {g != null && (
                <span className={`ml-1 ${g > 0 ? 'text-emerald-600' : g < 0 ? 'text-rose-500' : ''}`}>
                  {g > 0 ? '+' : ''}
                  {g}%
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
        {c.response_rate != null ? (
          <span>
            Replies to <strong className="text-ink-900">{c.response_rate}%</strong>
          </span>
        ) : (
          <span className="text-ink-400">No response data yet</span>
        )}
        {c.response_rate != null && c.avg_response_days != null && (
          <span>
            in <strong className="text-ink-900">{c.avg_response_days}d</strong>
          </span>
        )}
        {c.last_listed && <span className="ml-auto">Latest {formatRelativeTime(c.last_listed, '')}</span>}
      </div>
    </a>
  );
}

function Highlight({ c, tone, title, note }: { c: DirectoryCompany; tone: 'up' | 'down'; title: string; note: string }) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <a
      {...linkProps(c)}
      className="group relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-lg hover:shadow-[#1D4ED8]/5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-full ${tone === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <span className="hidden text-xs text-ink-400 sm:inline">· {note}</span>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Logo url={c.logo_url} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-xl font-bold text-ink-950 group-hover:text-[#1D4ED8]">{c.name}</p>
            {c.countries && c.countries.length > 0 && <HireCountries countries={c.countries} total={c.country_count} max={2} className="mt-1" />}
            <div className="mt-3">
              <OpenStat c={c} big />
            </div>
          </div>
        </div>
        {(c.weekly ?? []).some((v) => v > 0) && (
          <div className="rounded-lg bg-[#1D4ED8]/5 px-3 pb-2 pt-3">
            <MiniArea values={c.weekly!} width={220} height={70} />
            <p className="mt-1 text-[10px] font-semibold text-ink-400">New listings per week · 12 weeks</p>
          </div>
        )}
      </div>
    </a>
  );
}

/**
 * "Applied and heard nothing?" — invites people to share how an application
 * went: pick a company from the list (or type one), or tap a logo.
 */
function SharePromo({ companies, onPick }: { companies: DirectoryCompany[]; onPick: (c: { id?: string | null; name: string; logo_url?: string | null } | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  // Quick pick: the biggest companies (most open listings) that have a logo,
  // as many as fill two full rows of the box.
  const pickRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(8);
  useEffect(() => {
    const el = pickRef.current;
    if (!el) return;
    const measure = () => setPerRow(Math.max(4, Math.floor((el.clientWidth + 8) / (40 + 8))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const quick = useMemo(
    () =>
      companies
        .filter((c) => c.logo_url)
        .sort((a, b) => b.active_jobs + b.active_programs - (a.active_jobs + a.active_programs))
        .slice(0, perRow * 2),
    [companies, perRow],
  );
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? companies.filter((c) => c.name.toLowerCase().includes(t)) : companies).slice(0, 8);
  }, [companies, q]);
  const pick = (c: DirectoryCompany) => {
    onPick({ id: c.id, name: c.name, logo_url: c.logo_url });
    setQ('');
    setOpen(false);
  };

  return (
    <section className="relative z-20 mb-8 rounded-xl bg-brand-700 p-5 text-white sm:p-7">
      {/* Decoration is clipped on its own layer, so the company list can drop below the box. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
      </div>
      <div className="relative grid gap-6 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
            <MessageSquarePlus className="h-3.5 w-3.5" /> 20 seconds · private
          </p>
          <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-[28px]">Applied and heard nothing? Make it count.</h2>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-white/80">
            Share how your application went — silence, rejection or interview. It stays private and only adds to the totals, so the next applicant knows where their time is well spent.
          </p>
        </div>
        <div className="rounded-xl bg-white p-3 text-ink-900 shadow-lg shadow-black/10">
          <div className="relative flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && q.trim().length >= 2) matches[0] && matches[0].name.toLowerCase() === q.trim().toLowerCase() ? pick(matches[0]) : (onPick({ name: q.trim() }), setQ(''));
                }}
                placeholder="Which company did you apply to?"
                className="h-11 w-full rounded-lg border border-ink-200 pl-9 pr-8 text-sm outline-none transition focus:border-[#1D4ED8]"
              />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              {open && (
                <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#1D4ED8]/5">
                        <MiniLogo url={c.logo_url} />
                        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                        <span className="text-[11px] text-ink-400">{c.active_jobs.toLocaleString()} jobs</span>
                      </button>
                    </li>
                  ))}
                  {q.trim().length >= 2 && (
                    <li className="border-t border-ink-100">
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick({ name: q.trim() }), setQ(''), setOpen(false))} className="w-full px-3 py-2 text-left text-[13px] text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                        Not listed? Share about “{q.trim()}”
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <button
              onClick={() => (q.trim().length >= 2 ? (onPick({ name: q.trim() }), setQ('')) : onPick(null))}
              className="shrink-0 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Share
            </button>
          </div>
          <div className="mt-3" ref={pickRef}>
            {quick.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Quick pick · top companies</p>}
            {quick.length > 0 && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
                {quick.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    title={c.name}
                    className="grid aspect-square w-full max-w-[48px] place-items-center justify-self-center rounded-lg border border-ink-100 bg-white p-1 transition hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-md"
                  >
                    <img src={c.logo_url!} alt={c.name} className="max-h-full max-w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniLogo({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-6 w-6 shrink-0 rounded border border-ink-100 bg-white object-contain p-0.5" />
  ) : (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#1D4ED8]/10">
      <Building2 className="h-3 w-3 text-[#1D4ED8]/60" />
    </span>
  );
}

function Logo({ url, size = 'md' }: { url: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  return url ? (
    <img src={url} alt="" className={`${box} shrink-0 rounded-lg border border-ink-100 bg-white object-contain p-1`} />
  ) : (
    <span className={`${box} grid shrink-0 place-items-center rounded-lg border border-ink-100 bg-[#1D4ED8]/5`}>
      <Building2 className="h-5 w-5 text-[#1D4ED8]/40" />
    </span>
  );
}

function Select({
  value,
  onChange,
  options,
  className = '',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-[#1D4ED8] disabled:opacity-50 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-[#1D4ED8] text-white' : 'bg-[#1D4ED8]/5 text-ink-700 hover:bg-[#1D4ED8]/10'}`}
    >
      {children}
    </button>
  );
}
