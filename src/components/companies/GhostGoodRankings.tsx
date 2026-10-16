import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Building2, ChevronRight, Info, MessageSquareText, Star, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import { companyPath } from '@/lib/companies';
import { fetchGhostGoodRankings, type GhostGoodRankings as Data, type RankedCompany } from '@/lib/companyExperiences';
import { GHOST_BAD_SRC, GHOST_GOOD_SRC, GHOST_SRC } from '@/components/companies/Ghost';
import { CircleFlag } from '@/components/common/CircleFlag';

type Tab = 'best' | 'worst' | 'most';
const TABS: { key: Tab; label: string; icon: typeof ThumbsUp }[] = [
  { key: 'best', label: 'Best', icon: ThumbsUp },
  { key: 'worst', label: 'Needs improvement', icon: ThumbsDown },
  { key: 'most', label: 'Most reviewed', icon: Users },
];

function go(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

function monthLabel(iso: string, final: boolean, current: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const name = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return current && !final ? `${name} (so far)` : name;
}

/**
 * "Who's getting hiring right?" — the month's best and worst employer
 * experiences, from server-side, confidence-adjusted scores. Only companies
 * with enough reports are shown; everything is user-reported.
 */
export function GhostGoodRankings() {
  const [month, setMonth] = useState<string | null>(null);
  const [country, setCountry] = useState<string>('');
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('best');
  const [months, setMonths] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setData(undefined);
    fetchGhostGoodRankings(month, country).then((d) => {
      if (!alive) return;
      setData(d);
      if (d?.months?.length) setMonths(d.months);
      if (d && !country) setCountries(d.countries ?? []);
    });
    return () => {
      alive = false;
    };
  }, [month, country]);

  const currentMonth = months[0] ?? null;
  const shownMonth = data?.month ?? month ?? currentMonth;
  const list = data ? data[tab] : [];

  return (
    <section aria-labelledby="gg-rank-title" className="scroll-mt-24" id="rankings">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="gg-rank-title" className="text-[28px] font-bold tracking-tight text-ink-950 sm:text-[34px]">
            Who’s Getting Hiring Right?
          </h2>
          <p className="mt-1 text-[16px] text-ink-500">Celebrate the good. Call for better.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select label="Month" value={shownMonth ?? ''} onChange={(v) => setMonth(v || null)}>
            {(months.length ? months : shownMonth ? [shownMonth] : []).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, Boolean(data?.final) && m === data?.month, m === currentMonth)}
              </option>
            ))}
          </Select>
          <Select label="Country" value={country} onChange={setCountry}>
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {regionName(c)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Featured: Employer of the Month / Needs Improvement */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Featured kind="best" company={data ? data.best[0] : undefined} loading={data === undefined} />
        <Featured kind="worst" company={data ? data.worst[0] : undefined} loading={data === undefined} />
      </div>

      {/* Leaderboard */}
      <div className="mt-6 rounded-2xl border border-ink-200 bg-white">
        <Tabs value={tab} onChange={setTab} />
        <div role="tabpanel" id={`gg-panel-${tab}`} aria-labelledby={`gg-tab-${tab}`} className="p-2 sm:p-3">
          {data === undefined ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
              ))}
            </div>
          ) : data === null ? (
            <p className="p-6 text-center text-[15px] text-ink-500">Couldn’t load the rankings. Please try again in a moment.</p>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <img src={GHOST_SRC} alt="" className="h-16 w-16 opacity-60 grayscale" />
              <p className="text-[15px] font-semibold text-ink-800">Not enough data yet</p>
              <p className="max-w-md text-[14px] text-ink-500">
                A company is ranked once at least 5 different people shared their experience this month.
                {data.companies_with_reports > 0 && ` ${data.companies_with_reports.toLocaleString()} ${data.companies_with_reports === 1 ? 'company has' : 'companies have'} reports so far.`}
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-ink-100">
              {list.map((c, i) => (
                <Row key={c.publisher_id} rank={i + 1} c={c} tab={tab} avg={data.prior_mean} />
              ))}
            </ol>
          )}
        </div>
      </div>

      <Methodology data={data ?? null} />
    </section>
  );
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-[14px] sm:w-auto">
      <span className="text-ink-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold text-ink-900 outline-none">
        {children}
      </select>
    </label>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    onChange(TABS[n].key);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label="Rankings" className="flex gap-1 overflow-x-auto border-b border-ink-100 p-2">
      {TABS.map((t, i) => {
        const active = value === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            id={`gg-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`gg-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 ${
              active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'
            }`}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="relative inline-flex" aria-hidden>
      <span className="flex gap-0.5 text-ink-200">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="h-4 w-4 fill-current" />
        ))}
      </span>
      <span className="absolute inset-0 flex gap-0.5 overflow-hidden text-amber-400" style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="h-4 w-4 shrink-0 fill-current" />
        ))}
      </span>
    </span>
  );
}

/** Positive / neutral / negative as one bar, with text labels (never colour alone). */
function Distribution({ c }: { c: RankedCompany }) {
  const total = c.positive + c.neutral + c.negative || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
        <span className="bg-emerald-500" style={{ width: seg(c.positive) }} />
        <span className="bg-amber-400" style={{ width: seg(c.neutral) }} />
        <span className="bg-rose-500" style={{ width: seg(c.negative) }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-600">
        <span>
          <ThumbsUp className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
          {c.positive} heard back
        </span>
        <span>
          <MessageSquareText className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
          {c.neutral} rejected
        </span>
        <span>
          <ThumbsDown className="mr-1 inline h-3.5 w-3.5 text-rose-600" />
          {c.negative} ignored
        </span>
        {c.unanswered > 0 && <span className="text-ink-400">+{c.unanswered} waiting (not scored)</span>}
      </p>
    </div>
  );
}

function Logo({ c, size = 48 }: { c: RankedCompany; size?: number }) {
  return c.logo_url ? (
    <img src={c.logo_url} alt="" loading="lazy" className="shrink-0 rounded-xl border border-ink-100 bg-white object-contain p-1" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl bg-[#1D4ED8]/10" style={{ width: size, height: size }}>
      <Building2 className="h-5 w-5 text-[#1D4ED8]/60" />
    </span>
  );
}

function Featured({ kind, company, loading }: { kind: 'best' | 'worst'; company: RankedCompany | undefined; loading: boolean }) {
  const best = kind === 'best';
  const tone = best ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white' : 'border-rose-200 bg-gradient-to-br from-rose-50 to-white';
  const title = best ? 'Employer of the Month' : 'Needs Improvement';
  const label = best ? 'Green Ghost' : 'Red Ghost';
  const Icon = best ? ThumbsUp : ThumbsDown;
  const href = company ? companyPath({ id: company.publisher_id, name: company.name }) : null;
  const body = (
    <>
      <img src={best ? GHOST_GOOD_SRC : GHOST_BAD_SRC} alt="" className={`ghost-float h-24 w-24 shrink-0 sm:h-28 sm:w-28 ${company ? '' : 'opacity-50 grayscale'}`} />
      <div className="min-w-0 flex-1">
        <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${best ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
          <Icon className="h-3.5 w-3.5" /> {label}: {title}
        </p>
        {loading ? (
          <div className="mt-3 space-y-2">
            <div className="skeleton-shimmer h-6 w-2/3 rounded" />
            <div className="skeleton-shimmer h-4 w-1/2 rounded" />
          </div>
        ) : company ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <Logo c={company} size={44} />
              <p className="min-w-0 text-[19px] font-bold leading-tight text-ink-950">{company.name}</p>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-ink-700">
              <Stars value={company.stars} />
              <span className="font-bold text-ink-950">{company.stars.toFixed(1)} / 5</span>
              <span className="text-ink-400">·</span>
              <span>{company.voices} reports</span>
              <span className="text-ink-400">·</span>
              <span>{company.jobs} jobs posted this month</span>
            </p>
            <div className="mt-3">
              <Distribution c={company} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[17px] font-bold text-ink-800">Not enough data yet</p>
            <p className="mt-1 text-[14px] text-ink-500">
              {best ? 'No company has enough positive reports this month.' : 'No company has enough reports to call out this month.'} Share yours to help.
            </p>
          </>
        )}
      </div>
    </>
  );
  return href ? (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        go(href);
      }}
      className={`flex items-start gap-4 rounded-2xl border p-5 transition hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 sm:p-6 ${tone}`}
    >
      {body}
    </a>
  ) : (
    <div className={`flex items-start gap-4 rounded-2xl border p-5 sm:p-6 ${tone}`}>{body}</div>
  );
}

function Row({ rank, c, tab, avg }: { rank: number; c: RankedCompany; tab: Tab; avg: number }) {
  const href = companyPath({ id: c.publisher_id, name: c.name });
  // Same line as the tabs: at or above the month average = better than most.
  const good = c.score >= avg;
  return (
    <li>
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          go(href);
        }}
        className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 sm:gap-4 sm:px-3"
      >
        <span className="w-6 shrink-0 text-center text-[15px] font-bold tabular-nums text-ink-400">{rank}</span>
        <Logo c={c} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-bold text-ink-950">
            {c.name}
            {c.country_code && <CircleFlag countryCode={c.country_code} label={c.country_code} size={14} />}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-500">
            <span className={`inline-flex items-center gap-1 font-semibold ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
              {good ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
              {good ? 'Above average' : 'Below average'}
            </span>
            <span>
              {c.voices} reports · {c.jobs} jobs{c.per100 != null ? ` · ${c.per100} reports per 100 jobs` : ''}
            </span>
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Stars value={c.stars} />
          <span className="w-8 text-right text-[15px] font-bold tabular-nums text-ink-950">{c.stars.toFixed(1)}</span>
        </div>
        <span className="text-[14px] font-bold tabular-nums text-ink-950 sm:hidden">{c.stars.toFixed(1)}★</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
        <span className="sr-only">{tab === 'most' ? 'Most reviewed' : ''}</span>
      </a>
    </li>
  );
}

function Methodology({ data }: { data: Data | null }) {
  const id = useId();
  return (
    <details className="group mt-4 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-[14px] leading-6 text-ink-600">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink-800" aria-describedby={id}>
        <Info className="h-4 w-4 text-[#1D4ED8]" /> How this ranking works
        <ChevronRight className="ml-auto h-4 w-4 transition group-open:rotate-90" />
      </summary>
      <div id={id} className="mt-3 space-y-2">
        <p>
          <b>User-reported experiences, not all applicants.</b> Each month (UTC) we count moderated reports shared on GhostGood and applications tracked on MadeVisa. One voice per person per
          company: repeat reports never add weight.
        </p>
        <p>
          <b>Score:</b> heard back = 100, rejected = 50, reported as ignored = 0. Tracked applications with no update are shown as “waiting” and never counted as negative. The score is a
          confidence-adjusted average: (10 × month average + sum of points) ÷ (10 + reports), so a few reports can’t push a company to the top or bottom. Stars = score ÷ 20.
        </p>
        <p>
          <b>Eligibility:</b> at least 5 different people that month. Below that the company shows “Not enough data” and no numbers are published, so no single report can be identified.
        </p>
        <p>
          <b>Jobs posted</b> is shown as context (“reports per 100 jobs”). We don’t know how many people applied to each job, so it is not a chance of being ghosted, and it never changes the score.
          Industry isn’t recorded for companies yet, so there is no industry filter.
        </p>
        <p>
          <b>Past months are frozen:</b> each month is saved on the 3rd of the next month and doesn’t change later.
          {data && (data.final ? ` This month was saved on ${new Date(data.computed_at ?? '').toLocaleDateString()}.` : ' This month is still open and updates as reports come in.')}
          {data && ` Month average: ${data.prior_mean} / 100.`}
        </p>
      </div>
    </details>
  );
}
