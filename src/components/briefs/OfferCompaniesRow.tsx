import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileSignature, Plus, Search } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { companyPath, fetchCompaniesDirectory, type DirectoryCompany } from '@/lib/companies';
import { briefCountries } from '@/lib/sponsorOffer';
import { CircleFlag } from '@/components/common/CircleFlag';

const PAGE = 5;

export type OfferCompanyPick = { id: string | null; name: string; countryCode: string | null };

type Filter = 'all' | 'hiring' | 'checked' | 'replies';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'hiring', label: 'Hiring now' },
  { value: 'checked', label: 'Checked visa routes' },
  { value: 'replies', label: 'Replies to applicants' },
];

/**
 * /offers: companies in one horizontal row — search, filters and a
 * country menu, 5 at a time with "Load 5 more" (same pattern as /feedback).
 * "Make offer" hands the company to the custom offer below.
 */
export function OfferCompaniesRow({ onPick }: { onPick: (c: OfferCompanyPick) => void }) {
  const [companies, setCompanies] = useState<DirectoryCompany[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('hiring');
  const [country, setCountry] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchCompaniesDirectory().then((rows) => alive && setCompanies(rows ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const countries = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    for (const c of companies ?? []) {
      if (!c.country_code || !c.country_name) continue;
      const e = m.get(c.country_code) ?? { code: c.country_code, name: c.country_name, n: 0 };
      e.n++;
      m.set(c.country_code, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [companies]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (companies ?? [])
      .filter((c) => {
        if (t && !c.name.toLowerCase().includes(t) && !(c.country_name ?? '').toLowerCase().includes(t)) return false;
        if (country && c.country_code !== country) return false;
        if (filter === 'hiring' && !(c.active_jobs > 0)) return false;
        if (filter === 'checked' && !(c.country_code && briefCountries.has(c.country_code))) return false;
        if (filter === 'replies' && !(c.response_rate != null && c.response_rate >= 30)) return false;
        return true;
      })
      .sort((a, b) => (filter === 'replies' ? (b.response_rate ?? 0) - (a.response_rate ?? 0) : b.active_jobs - a.active_jobs));
  }, [companies, q, filter, country]);

  const shown = filtered.slice(0, limit);
  const left = filtered.length - shown.length;
  const reset = () => {
    setLimit(PAGE);
    rowRef.current?.scrollTo({ left: 0 });
  };
  const loadMore = () => {
    setLimit((n) => n + PAGE);
    window.setTimeout(() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.8, behavior: 'smooth' }), 60);
  };

  return (
    <section aria-labelledby="offer-companies">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="offer-companies" className="text-[17px] font-bold text-ink-950">
            Companies
          </h2>
          <p className="mt-0.5 text-[14px] text-ink-500">Pick a company to make it a sponsorship offer — even without a job on MadeVisa.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] sm:w-64 sm:flex-none">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
              placeholder="Search companies"
              aria-label="Search companies"
              className="h-full w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-ink-400"
            />
          </label>
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              reset();
            }}
            aria-label="Country"
            className="h-10 max-w-[180px] rounded-lg border border-ink-200 bg-white px-2 text-[14px] text-ink-800 outline-none focus:border-[#1D4ED8]"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.n})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter companies">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilter(f.value);
              reset();
            }}
            aria-pressed={filter === f.value}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
              filter === f.value ? 'bg-[#1D4ED8] text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:ring-[#1D4ED8]/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div ref={rowRef} className="-mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {companies === null
          ? Array.from({ length: PAGE }, (_, i) => <div key={i} className="skeleton-shimmer h-[212px] w-[232px] shrink-0 rounded-xl" />)
          : shown.map((c) => <CompanyCard key={c.id} c={c} onPick={() => onPick({ id: c.id, name: c.name, countryCode: c.country_code ?? null })} />)}

        {companies !== null && left > 0 && (
          <button
            onClick={loadMore}
            className="flex h-[212px] w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 bg-white text-ink-600 transition hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold">Load {Math.min(PAGE, left)} more</span>
            <span className="text-[12px] text-ink-400">{left.toLocaleString()} left</span>
          </button>
        )}

        {companies !== null && filtered.length === 0 && (
          <div className="flex h-[212px] w-full min-w-[280px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white px-6 text-center">
            <p className="text-[15px] font-semibold text-ink-800">{q.trim() ? `No company called “${q.trim()}” yet` : 'No companies match these filters'}</p>
            <p className="mt-1 text-[13px] text-ink-500">You can still make a custom offer for any company.</p>
            <button
              onClick={() => onPick({ id: null, name: q.trim(), countryCode: country || null })}
              className="mt-3 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-800"
            >
              {q.trim() ? `Make an offer to “${q.trim()}”` : 'Make a custom offer'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CompanyCard({ c, onPick }: { c: DirectoryCompany; onPick: () => void }) {
  const rate = c.response_rate;
  const tone = rate == null ? 'bg-ink-100 text-ink-600' : rate >= 60 ? 'bg-emerald-50 text-emerald-700' : rate >= 30 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';
  const href = companyPath({ id: c.id, name: c.name });
  const jobs = `/jobs?q=${encodeURIComponent(c.name)}`;
  return (
    <article className="flex h-[212px] w-[232px] shrink-0 snap-start flex-col rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-3">
        {c.logo_url ? (
          <img src={c.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-ink-100 bg-white object-contain p-1" loading="lazy" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10">
            <Building2 className="h-5 w-5 text-[#1D4ED8]/60" />
          </span>
        )}
        <div className="min-w-0">
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              nav(href);
            }}
            className="line-clamp-2 text-[15px] font-bold leading-snug text-ink-950 hover:text-[#1D4ED8]"
          >
            {c.name}
          </a>
          {c.country_name && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-500">
              {c.country_code && <CircleFlag countryCode={c.country_code} size={12} />}
              {c.country_name}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {c.active_jobs > 0 && (
          <a
            href={jobs}
            onClick={(e) => {
              e.preventDefault();
              nav(jobs);
            }}
            className="rounded-md bg-[#1D4ED8]/5 px-2 py-0.5 text-[12px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/10"
          >
            {c.active_jobs.toLocaleString()} open jobs
          </a>
        )}
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${tone}`}>{rate == null ? 'No reply data yet' : `Replies to ${Math.round(rate)}%`}</span>
      </div>
      <button
        onClick={onPick}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-800"
      >
        <FileSignature className="h-4 w-4" /> Make offer
      </button>
    </article>
  );
}
