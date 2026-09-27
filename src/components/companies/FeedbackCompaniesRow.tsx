import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronRight, Clock, MessageSquarePlus, Plus, Search, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { companyPath, type DirectoryCompany } from '@/lib/companies';
import { EXPERIENCE_OUTCOMES, fetchMyExperienceReports, type ExperienceStatus, type MyExperienceReport } from '@/lib/companyExperiences';

const PAGE = 5;

function go(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

type Pick = { id?: string | null; name: string; logo_url?: string | null };

/**
 * /feedback: companies in one horizontal row — 5 at a time with "Load 5
 * more" at the end, plus search. The visitor's own recent reports come
 * first, with their review status.
 */
export function FeedbackCompaniesRow({ companies, onShare, refreshKey }: { companies: DirectoryCompany[] | null; onShare: (pick: Pick) => void; refreshKey: number }) {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [mine, setMine] = useState<MyExperienceReport[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);

  // Own reports: on load, when signing in, and after sharing (refreshKey).
  useEffect(() => {
    if (!session) {
      setMine([]);
      return;
    }
    fetchMyExperienceReports().then(setMine);
  }, [session, refreshKey]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = companies ?? [];
    return t ? list.filter((c) => c.name.toLowerCase().includes(t) || (c.country_name ?? '').toLowerCase().includes(t)) : list;
  }, [companies, q]);

  const shown = filtered.slice(0, limit);
  const left = filtered.length - shown.length;
  const mineShown = q.trim() ? mine.filter((m) => (m.publisher?.name ?? m.company_name).toLowerCase().includes(q.trim().toLowerCase())) : mine;

  const loadMore = () => {
    setLimit((n) => n + PAGE);
    // Bring the new cards into view.
    window.setTimeout(() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.8, behavior: 'smooth' }), 60);
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium text-ink-900">Companies</h2>
          <p className="mt-0.5 text-[14px] text-ink-500">Pick a company to share how your application went — or see how it replies.</p>
        </div>
        <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] sm:w-80">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
              rowRef.current?.scrollTo({ left: 0 });
            }}
            placeholder="Search companies"
            aria-label="Search companies"
            className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400"
          />
        </label>
      </div>

      <div ref={rowRef} className="-mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {mineShown.map((r) => (
          <MyReportCard key={r.id} r={r} />
        ))}

        {companies === null
          ? Array.from({ length: PAGE }, (_, i) => <div key={i} className="skeleton-shimmer h-[228px] w-[232px] shrink-0 rounded-xl" />)
          : shown.map((c) => <CompanyCard key={c.id} c={c} onShare={() => onShare({ id: c.id, name: c.name, logo_url: c.logo_url })} />)}

        {companies !== null && left > 0 && (
          <button
            onClick={loadMore}
            className="flex h-[228px] w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 bg-white text-ink-600 transition hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold">Load {Math.min(PAGE, left)} more</span>
            <span className="text-[12px] text-ink-400">{left.toLocaleString()} left</span>
          </button>
        )}

        {companies !== null && filtered.length === 0 && (
          <div className="flex h-[228px] w-full min-w-[280px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white px-6 text-center">
            <p className="text-[15px] font-semibold text-ink-800">No company called “{q.trim()}” yet</p>
            <p className="mt-1 text-[13px] text-ink-500">You can still share — we'll check it and add the company.</p>
            <button onClick={() => onShare({ name: q.trim() })} className="mt-3 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-800">
              Share about “{q.trim()}”
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Logo({ url, size = 44 }: { url: string | null | undefined; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-lg border border-ink-100 bg-white object-contain p-1" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10" style={{ width: size, height: size }}>
      <Building2 className="h-5 w-5 text-[#1D4ED8]/60" />
    </span>
  );
}

function CompanyCard({ c, onShare }: { c: DirectoryCompany; onShare: () => void }) {
  const rate = c.response_rate;
  const tone = rate == null ? 'bg-ink-100 text-ink-600' : rate >= 60 ? 'bg-emerald-50 text-emerald-700' : rate >= 30 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';
  const href = companyPath({ id: c.id, name: c.name });
  return (
    <article className="flex h-[228px] w-[232px] shrink-0 snap-start flex-col rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Logo url={c.logo_url} />
        <div className="min-w-0">
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              go(href);
            }}
            className="line-clamp-2 text-[15px] font-bold leading-snug text-ink-950 hover:text-[#1D4ED8]"
          >
            {c.name}
          </a>
          {c.country_name && <p className="mt-0.5 truncate text-[12px] text-ink-500">{c.country_name}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${tone}`}>{rate == null ? 'No reply data yet' : `Replies to ${Math.round(rate)}%`}</span>
        {c.active_jobs > 0 && <span className="rounded-md bg-[#1D4ED8]/5 px-2 py-0.5 text-[12px] font-semibold text-[#1D4ED8]">{c.active_jobs.toLocaleString()} open jobs</span>}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <button onClick={onShare} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-800">
          <MessageSquarePlus className="h-4 w-4" /> Share
        </button>
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            go(href);
          }}
          aria-label={`Open ${c.name}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
        >
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

const STATUS: Record<ExperienceStatus, { label: string; note: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'In review', note: 'Counts once MadeVisa approves it.', cls: 'border-amber-300 bg-amber-50/60', icon: Clock },
  approved: { label: 'Counted', note: 'Added to this company’s totals.', cls: 'border-emerald-300 bg-emerald-50/60', icon: CheckCircle2 },
  rejected: { label: 'Not accepted', note: 'It didn’t meet the rules, so it isn’t counted.', cls: 'border-ink-200 bg-ink-50', icon: XCircle },
};

function MyReportCard({ r }: { r: MyExperienceReport }) {
  const s = STATUS[r.status] ?? STATUS.pending;
  const Icon = s.icon;
  const outcome = EXPERIENCE_OUTCOMES.find((o) => o.value === r.outcome)?.label ?? r.outcome;
  const applied = new Date(r.applied_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return (
    <article className={`flex h-[228px] w-[232px] shrink-0 snap-start flex-col rounded-xl border-2 p-4 ${s.cls}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Your report</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-ink-200 text-ink-700' : 'bg-amber-100 text-amber-900'
          }`}
        >
          <Icon className="h-3 w-3" /> {s.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Logo url={r.publisher?.logo_url} size={40} />
        <p className="line-clamp-2 min-w-0 text-[15px] font-bold leading-snug text-ink-950">{r.publisher?.name ?? r.company_name}</p>
      </div>
      <p className="mt-3 text-[13px] text-ink-700">
        <span className="font-semibold">{outcome}</span> · applied {applied}
      </p>
      <p className="mt-auto text-[12px] leading-4 text-ink-500">{s.note}</p>
    </article>
  );
}
