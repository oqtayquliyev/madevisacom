import { useEffect, useMemo, useState } from 'react';
import { Building2, Info, Scale, Search, X } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { companyPath, fetchCompaniesDirectory, fetchCompanyInsights, type CompanyInsights, type DirectoryCompany } from '@/lib/companies';
import { formatRelativeTime } from '@/lib/dates';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const MAX_COMPARE = 3;

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export function CompaniesPage({ go, onAuth }: Props) {
  useSeo({
    title: 'Companies — hiring activity & applicant response',
    description: 'Compare companies by real hiring activity and applicant response data tracked on MadeVisa before you apply.',
    path: '/companies',
  });
  const [rows, setRows] = useState<DirectoryCompany[] | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'active' | 'recent' | 'response' | 'name'>('active');
  const [compare, setCompare] = useState<string[]>(() => {
    const ids = new URLSearchParams(window.location.search).get('compare');
    return ids ? ids.split(',').filter(Boolean).slice(0, MAX_COMPARE) : [];
  });
  const [insights, setInsights] = useState<Record<string, CompanyInsights | null>>({});

  useEffect(() => {
    fetchCompaniesDirectory().then(setRows);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (compare.length) params.set('compare', compare.join(','));
    else params.delete('compare');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/companies?${qs}` : '/companies');
    for (const id of compare) {
      if (!(id in insights)) fetchCompanyInsights(id).then((i) => setInsights((prev) => ({ ...prev, [id]: i })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !term || r.name.toLowerCase().includes(term) || (r.country_name ?? '').toLowerCase().includes(term));
    return [...list].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'recent'
        ? (b.last_listed ?? '').localeCompare(a.last_listed ?? '')
        : sort === 'response'
        ? (b.response_rate ?? -1) - (a.response_rate ?? -1)
        : b.active_jobs + b.active_programs - (a.active_jobs + a.active_programs)
    );
  }, [rows, q, sort]);

  const toggle = (id: string) =>
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? [...prev.slice(1), id] : [...prev, id]));

  const compared = compare.map((id) => (rows ?? []).find((r) => r.id === id)).filter((r): r is DirectoryCompany => Boolean(r));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />
      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-8 sm:px-8">
          <h1 className="font-slab text-3xl font-bold tracking-tight sm:text-4xl">Companies</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
            Real hiring activity and applicant response data, based on verified interactions on MadeVisa. Compare companies before you apply.
          </p>
          <div className="mt-5 flex max-w-xl items-center gap-2 rounded-lg bg-white px-3">
            <Search className="h-4 w-4 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies or countries"
              className="h-11 w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {/* COMPARE */}
        {compared.length > 0 && (
          <section className="mb-8 rounded-lg border border-brand-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink-950">
                <Scale className="h-4 w-4 text-brand-600" /> Compare ({compared.length}/{MAX_COMPARE})
              </h2>
              <button onClick={() => setCompare([])} className="text-xs font-semibold text-ink-500 hover:text-ink-800">
                Clear
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th className="w-44" />
                    {compared.map((c) => (
                      <th key={c.id} className="px-3 pb-3 text-left align-bottom">
                        <div className="flex items-center gap-2">
                          <Logo url={c.logo_url} />
                          <a
                            href={companyPath(c)}
                            onClick={(e) => {
                              e.preventDefault();
                              nav(companyPath(c));
                            }}
                            className="font-bold text-ink-950 hover:text-brand-700"
                          >
                            {c.name}
                          </a>
                          <button onClick={() => toggle(c.id)} className="text-ink-300 hover:text-ink-700" aria-label="Remove">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  <CompareRow label="Open jobs" values={compared.map((c) => c.active_jobs.toLocaleString())} best={maxIdx(compared.map((c) => c.active_jobs))} />
                  <CompareRow label="Open programs" values={compared.map((c) => c.active_programs.toLocaleString())} />
                  <CompareRow label="New in last 30 days" values={compared.map((c) => c.posted_30d.toLocaleString())} best={maxIdx(compared.map((c) => c.posted_30d))} />
                  <CompareRow
                    label="Closed / filled (90d)"
                    values={compared.map((c) => (insights[c.id] ? String(insights[c.id]!.closed_90d) : '…'))}
                  />
                  <CompareRow label="Applications tracked" values={compared.map((c) => c.tracked.toLocaleString())} />
                  <CompareRow
                    label="Response rate"
                    values={compared.map((c) => (c.response_rate != null ? `${c.response_rate}%` : '—'))}
                    best={maxIdx(compared.map((c) => c.response_rate ?? -1), true)}
                  />
                  <CompareRow
                    label="Avg. response time"
                    values={compared.map((c) => (c.avg_response_days != null ? `${c.avg_response_days} days` : '—'))}
                    best={minIdx(compared.map((c) => c.avg_response_days))}
                  />
                  <CompareRow
                    label="Reached interview"
                    values={compared.map((c) => {
                      const i = insights[c.id];
                      return i === undefined ? '…' : i?.interview_rate != null ? `${i.interview_rate}%` : '—';
                    })}
                  />
                  <CompareRow
                    label="Candidate rating"
                    values={compared.map((c) => {
                      const i = insights[c.id];
                      return i === undefined ? '…' : i?.rating != null ? `${i.rating} / 5` : '—';
                    })}
                  />
                  <CompareRow
                    label="Data confidence"
                    values={compared.map((c) => {
                      const i = insights[c.id];
                      return i === undefined ? '…' : i ? { high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Not enough data' }[i.confidence] : '—';
                    })}
                  />
                  <CompareRow label="Latest listing" values={compared.map((c) => (c.last_listed ? formatRelativeTime(c.last_listed, '—') : '—'))} />
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Response figures come from applications MadeVisa users tracked; rates show from 5 tracked applications.
            </p>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-500">
            {rows ? `${shown.length.toLocaleString()} companies` : rows === null ? '' : 'Loading…'}
            {compare.length === 0 && rows && <span className="text-ink-400"> · tick up to 3 to compare</span>}
          </p>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm">
            <option value="active">Most open listings</option>
            <option value="recent">Recently hiring</option>
            <option value="response">Highest response rate</option>
            <option value="name">Name</option>
          </select>
        </div>

        {rows === null && (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Company statistics aren't available yet. (Admins: run the 20260928090000 migration.)
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows === undefined && [0, 1, 2, 3].map((k) => <div key={k} className="skeleton-shimmer h-28 rounded-lg" />)}
          {shown.map((c) => {
            const selected = compare.includes(c.id);
            return (
              <div key={c.id} className={`rounded-lg border bg-white p-4 transition ${selected ? 'border-brand-400 ring-1 ring-brand-200' : 'border-ink-200 hover:border-brand-200'}`}>
                <div className="flex items-start gap-3">
                  <Logo url={c.logo_url} size="lg" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={companyPath(c)}
                      onClick={(e) => {
                        e.preventDefault();
                        nav(companyPath(c));
                      }}
                      className="font-slab text-base font-bold text-ink-950 hover:text-brand-700"
                    >
                      {c.name}
                    </a>
                    <p className="text-xs text-ink-500">
                      {[c.country_name, c.last_listed ? `last listing ${formatRelativeTime(c.last_listed, '')}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-semibold text-ink-500">
                    <input type="checkbox" checked={selected} onChange={() => toggle(c.id)} /> Compare
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
                  <span>
                    <strong className="text-ink-950">{c.active_jobs.toLocaleString()}</strong> jobs
                  </span>
                  {c.active_programs > 0 && (
                    <span>
                      <strong className="text-ink-950">{c.active_programs.toLocaleString()}</strong> programs
                    </span>
                  )}
                  <span>
                    <strong className="text-ink-950">{c.posted_30d.toLocaleString()}</strong> new (30d)
                  </span>
                  <span>
                    Response rate <strong className="text-ink-950">{c.response_rate != null ? `${c.response_rate}%` : '—'}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Logo({ url, size = 'sm' }: { url: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-11 w-11' : 'h-7 w-7';
  return url ? (
    <img src={url} alt="" className={`${box} shrink-0 rounded border border-ink-100 bg-white object-contain p-0.5`} />
  ) : (
    <span className={`${box} grid shrink-0 place-items-center rounded border border-ink-100 bg-ink-50`}>
      <Building2 className="h-4 w-4 text-ink-300" />
    </span>
  );
}

function CompareRow({ label, values, best }: { label: string; values: string[]; best?: number }) {
  return (
    <tr>
      <td className="py-2.5 pr-3 text-xs font-semibold text-ink-500">{label}</td>
      {values.map((v, idx) => (
        <td key={idx} className={`px-3 py-2.5 tabular-nums ${best === idx ? 'font-bold text-emerald-700' : 'text-ink-900'}`}>
          {v}
        </td>
      ))}
    </tr>
  );
}

function maxIdx(nums: number[], requirePositive = false): number | undefined {
  if (nums.length < 2) return undefined;
  const m = Math.max(...nums);
  if (requirePositive && m < 0) return undefined;
  const idx = nums.indexOf(m);
  return nums.filter((n) => n === m).length === 1 ? idx : undefined;
}

function minIdx(nums: (number | null)[]): number | undefined {
  const valid = nums.map((n, i) => [n, i] as const).filter(([n]) => n != null) as [number, number][];
  if (valid.length < 2) return undefined;
  valid.sort((a, b) => a[0] - b[0]);
  return valid[0][0] === valid[1][0] ? undefined : valid[0][1];
}
