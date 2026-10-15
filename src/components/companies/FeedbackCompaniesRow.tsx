import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronRight, Clock, MessageSquarePlus, Plus, Search, Sparkles, Star, Timer, Warehouse, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { GHOST_BAD_SRC, GHOST_GOOD_SRC, GHOST_SRC } from '@/components/companies/Ghost';
import { companyPath, type DirectoryCompany } from '@/lib/companies';
import { EXPERIENCE_OUTCOMES, FEEDBACK_MIN_PEOPLE, FEEDBACK_MIN_REPORTS, fetchMyExperienceReports, type ExperienceStatus, type FeedbackStat, type MyExperienceReport } from '@/lib/companyExperiences';

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
export function FeedbackCompaniesRow({
  companies,
  stats,
  onShare,
  refreshKey,
}: {
  companies: DirectoryCompany[] | null;
  stats: Record<string, FeedbackStat>;
  onShare: (pick: Pick) => void;
  refreshKey: number;
}) {
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
    const hits = t ? list.filter((c) => c.name.toLowerCase().includes(t) || (c.country_name ?? '').toLowerCase().includes(t)) : list;
    // Companies with a score first, then the ones with most reports; otherwise as listed.
    const rank = (c: DirectoryCompany) => (stats[c.id]?.pct != null ? 100000 : 0) + (stats[c.id]?.n ?? 0);
    return hits.map((c, i) => ({ c, i })).sort((a, b) => rank(b.c) - rank(a.c) || a.i - b.i).map((x) => x.c);
  }, [companies, q, stats]);

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
          <h2 className="text-[28px] font-bold tracking-tight text-ink-950">How companies reply</h2>
          <p className="mt-1 text-[15px] text-ink-500">From people who applied. A score shows at {FEEDBACK_MIN_REPORTS} reports from {FEEDBACK_MIN_PEOPLE}+ people.</p>
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

      <div ref={rowRef} className="-mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pt-1 pb-4 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {mineShown.map((r) => (
          <MyReportCard key={r.id} r={r} />
        ))}

        {!q.trim() && EXAMPLES.map((e) => <ExampleCard key={e.name} e={e} />)}

        {companies === null
          ? Array.from({ length: PAGE }, (_, i) => <div key={i} className="skeleton-shimmer h-[340px] w-[310px] shrink-0 rounded-xl" />)
          : shown.map((c) => <CompanyCard key={c.id} c={c} stat={stats[c.id]} onShare={() => onShare({ id: c.id, name: c.name, logo_url: c.logo_url })} />)}

        {companies !== null && left > 0 && (
          <button
            onClick={loadMore}
            className="flex min-h-[340px] w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 bg-white text-ink-600 transition hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold">Load {Math.min(PAGE, left)} more</span>
            <span className="text-[12px] text-ink-400">{left.toLocaleString()} left</span>
          </button>
        )}

        {companies !== null && filtered.length === 0 && (
          <div className="flex min-h-[340px] w-full min-w-[280px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white px-6 text-center">
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

function Logo({ url, size = 52 }: { url: string | null | undefined; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-xl border border-ink-100 bg-white object-contain p-1.5" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl bg-[#1D4ED8]/10" style={{ width: size, height: size }}>
      <Building2 className="h-6 w-6 text-[#1D4ED8]/60" />
    </span>
  );
}

/** Logo, name (2 lines max) and country in a fixed-height block, so every card's score starts at the same line. */
const HEAD = 'flex h-[72px] items-start gap-3.5';
const CARD = 'flex min-h-[340px] w-[310px] shrink-0 snap-start flex-col rounded-2xl p-6';

function CompanyCard({ c, stat, onShare }: { c: DirectoryCompany; stat?: FeedbackStat; onShare: () => void }) {
  const href = companyPath({ id: c.id, name: c.name });
  return (
    <article className={`${CARD} border border-ink-200 bg-white transition hover:border-ink-300 hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)]`}>
      <div className={HEAD}>
        <Logo url={c.logo_url} />
        <div className="min-w-0">
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              go(href);
            }}
            className="line-clamp-2 text-[17px] font-bold leading-snug text-ink-950 hover:text-[#1D4ED8]"
          >
            {c.name}
          </a>
          {c.country_name && <p className="mt-0.5 truncate text-[13px] text-ink-500">{c.country_name}</p>}
        </div>
      </div>
      <ReplyScore score={stat?.score ?? null} pct={stat?.pct ?? null} days={stat?.days ?? null} reports={stat?.n ?? 0} people={stat?.people ?? 0} />
      <p className="mt-3 h-5 text-[13px] font-semibold text-[#1D4ED8]">{c.active_jobs > 0 ? `${c.active_jobs.toLocaleString()} open jobs` : ''}</p>
      <div className="mt-auto flex items-center gap-2 pt-4">
        <button onClick={onShare} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-3 text-[15px] font-semibold text-white hover:bg-brand-800">
          <MessageSquarePlus className="h-4 w-4" /> Share
        </button>
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            go(href);
          }}
          aria-label={`Open ${c.name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-ink-200 text-ink-600 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
        >
          <ChevronRight className="h-5 w-5" />
        </a>
      </div>
    </article>
  );
}

/** The responsiveness score (0–100, from every report: replies, interviews, offers, timing) as 1–5 stars. */
function scoreStars(score: number): number {
  return Math.max(1, Math.min(5, Math.round((score / 20) * 10) / 10));
}

/** Good, so-so or poor: which ghost, which colours, which words. */
function verdict(stars: number) {
  if (stars >= 3.5) return { ghost: GHOST_GOOD_SRC, label: 'Great at replying', ink: 'text-emerald-700', box: 'border-emerald-200 bg-emerald-50/60', star: 'text-emerald-500' };
  if (stars >= 2.5) return { ghost: GHOST_SRC, label: 'Hit or miss', ink: 'text-amber-700', box: 'border-amber-200 bg-amber-50/60', star: 'text-amber-500' };
  return { ghost: GHOST_BAD_SRC, label: 'Mostly ghosts', ink: 'text-rose-700', box: 'border-rose-200 bg-rose-50/60', star: 'text-rose-500' };
}

/** "Replies in about…" in words, not numbers to the decimal. */
function replyTiming(days: number | null, pct: number | null): string {
  if (days == null) return pct != null && pct < 30 ? 'Rarely replies' : 'Reply time not known yet';
  if (days <= 2) return 'Replies in 1–2 days';
  if (days <= 7) return 'Replies within a week';
  if (days <= 14) return 'Replies in 1–2 weeks';
  if (days <= 30) return 'Replies in 2–4 weeks';
  return 'Replies after a month or more';
}

function Stars({ value, cls }: { value: number; cls: string }) {
  return (
    <span className="relative inline-flex" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="flex gap-0.5 text-ink-200">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="h-[18px] w-[18px] fill-current" />
        ))}
      </span>
      <span className={`absolute inset-0 flex gap-0.5 overflow-hidden ${cls}`} style={{ width: `${(value / 5) * 100}%` }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="h-[18px] w-[18px] shrink-0 fill-current" />
        ))}
      </span>
    </span>
  );
}

const MIN_REPORTS = FEEDBACK_MIN_REPORTS;

function ReplyScore({ score, pct, days, reports, people }: { score: number | null; pct: number | null; days: number | null; reports: number; people: number }) {
  if (score == null) {
    const have = Math.min(Math.max(reports, 0), MIN_REPORTS);
    const needPeople = have >= MIN_REPORTS && people < FEEDBACK_MIN_PEOPLE;
    return (
      <div className="mt-5 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
        <div className="flex items-center gap-3">
          <img src={GHOST_SRC} alt="" className="h-14 w-14 shrink-0 opacity-50 grayscale" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-5 text-ink-800">{needPeople ? 'Needs more people' : 'No score yet'}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-500">
              {have}/{MIN_REPORTS} reports so far
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
          {Array.from({ length: MIN_REPORTS }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i < have ? 'bg-[#1D4ED8]' : 'bg-ink-200'}`} />
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-500">
          <Timer className="h-3.5 w-3.5" /> Score shows at {MIN_REPORTS} reports
        </p>
      </div>
    );
  }
  const stars = scoreStars(score);
  const v = verdict(stars);
  return (
    <div className={`mt-5 rounded-2xl border p-4 ${v.box}`}>
      <div className="flex items-center gap-3">
        <img src={v.ghost} alt="" className="h-14 w-14 shrink-0 drop-shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[24px] font-bold leading-none tracking-tight tabular-nums text-ink-950">{stars.toFixed(1)}</span>
            <Stars value={stars} cls={v.star} />
          </div>
          <p className={`mt-1 text-[15px] font-bold leading-5 ${v.ink}`}>{v.label}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[14px] font-medium text-ink-700">
        <Timer className="h-4 w-4 text-ink-400" /> {replyTiming(days, pct)}
      </p>
    </div>
  );
}

/** Made-up companies, clearly marked, so a first visitor sees what a score looks like. */
type Example = { name: string; country: string; score: number; pct: number; days: number | null; icon: typeof Building2 };
const EXAMPLES: Example[] = [
  { name: 'Sunny Logistics GmbH', country: 'Germany', score: 92, pct: 88, days: 3, icon: Warehouse },
  { name: 'Ghostly Corp Ltd', country: 'United Kingdom', score: 24, pct: 9, days: null, icon: Building2 },
];

function ExampleCard({ e }: { e: Example }) {
  const Icon = e.icon;
  return (
    <article className={`${CARD} relative border border-dashed border-ink-300 bg-white/70`}>
      <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md bg-ink-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
        <Sparkles className="h-3 w-3" /> Example
      </span>
      <div className={`${HEAD} pr-20`}>
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-ink-200">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[17px] font-bold leading-snug text-ink-950">{e.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-ink-500">{e.country}</p>
        </div>
      </div>
      <ReplyScore score={e.score} pct={e.pct} days={e.days} reports={MIN_REPORTS} people={FEEDBACK_MIN_PEOPLE} />
      <p className="mt-3 h-5 text-[13px] text-ink-400">Not a real company</p>
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
    <article className={`flex min-h-[340px] w-[310px] shrink-0 snap-start flex-col rounded-xl border-2 p-4 ${s.cls}`}>
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
