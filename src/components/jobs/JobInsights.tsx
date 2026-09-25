import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/lib/auth';
import { fetchJobPageInsights, SHOW_LIVE_FROM, SHOW_RESPONSE_FROM, type JobPageInsights } from '@/lib/jobInsights';

/**
 * Three graphics at the end of a job page, measured only on MadeVisa:
 *   1. Will they answer you?            → response rate (liquid gauge)
 *   2. Do they hire people from abroad? → interviews by nationality (bars)
 *   3. Is this job real?                → jobs checked live on the careers page (area)
 * 1 and 2 show an invitation to take part until there's enough data; a
 * number that isn't good is never shown. 3 only appears for synced companies.
 */

const BLUE = '#2563EB';

export function JobInsights({ publisherId, company, onTrack }: { publisherId: string; company: string; onTrack: (signedIn: boolean) => void }) {
  const [data, setData] = useState<JobPageInsights | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchJobPageInsights(publisherId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [publisherId]);

  if (data === undefined) return null;
  const r = data?.response;
  const i = data?.international;
  const l = data?.live;
  // Real data that isn't good → hidden. No data yet → invitation.
  const response = r ? (r.rate >= SHOW_RESPONSE_FROM ? r : 'hide') : 'invite';
  const international = i && i.people >= 3 ? i : 'invite';
  const live = l && l.imported_open >= 5 && l.open > 0 && l.checked / l.open >= SHOW_LIVE_FROM && l.weeks.some((n) => n > 0) ? l : null;

  const cards: ReactNode[] = [];
  if (response !== 'hide') cards.push(response === 'invite' ? <ResponseInvite key="r" company={company} onTrack={onTrack} /> : <ResponseCard key="r" r={response} />);
  cards.push(international === 'invite' ? <InternationalInvite key="i" company={company} onTrack={onTrack} /> : <InternationalCard key="i" d={international} />);
  if (live) cards.push(<LiveCard key="l" l={live} />);

  return (
    <section aria-label={`How ${company} hires`} className="mt-4 rounded-xl bg-[#2563EB]/20 p-4 text-ink-950 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight">How {company} hires</h2>
        <p className="flex items-center gap-2 text-[11px] font-semibold text-ink-600">
          Measured on <Logo style={{ height: 16 }} />
        </p>
      </div>
      <div className={`mt-4 grid gap-3 ${cards.length === 3 ? 'md:grid-cols-3' : cards.length === 2 ? 'md:grid-cols-2' : ''}`}>{cards}</div>
    </section>
  );
}

function Card({ title, children, foot, muted }: { title: string; children: ReactNode; foot?: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex flex-col rounded-lg p-4 shadow-sm ring-1 ${muted ? 'bg-white/60 ring-[#2563EB]/15' : 'bg-white ring-[#2563EB]/20'}`}>
      <p className="text-sm font-bold text-ink-950">{title}</p>
      <div className="flex-1">{children}</div>
      {foot && <div className="mt-3 text-[11px] leading-4 text-ink-500">{foot}</div>}
    </div>
  );
}

function TrackButton({ label, onTrack }: { label: string; onTrack: (signedIn: boolean) => void }) {
  const { user } = useAuth();
  return (
    <button
      onClick={() => onTrack(Boolean(user))}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
    >
      {user ? label : 'Create a free account to take part'} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// 1. Response rate — liquid gauge
// ---------------------------------------------------------------------------

function Gauge({ rate, placeholder = false }: { rate: number; placeholder?: boolean }) {
  const id = useId().replace(/:/g, '');
  const R = 70;
  const C = 2 * Math.PI * R;
  const level = 100 + R - (2 * R * rate) / 100;
  const wave = (dy: number) => `M -60 ${level + dy} q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 V 200 H -60 Z`;
  return (
    <svg viewBox="0 0 200 200" className="h-36 w-36 shrink-0" role="img" aria-label={placeholder ? 'No answers tracked yet' : `${rate}% of applicants heard back`}>
      <defs>
        <clipPath id={`c${id}`}>
          <circle cx="100" cy="100" r={R - 8} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BLUE} stopOpacity={placeholder ? 0.18 : 0.55} />
          <stop offset="1" stopColor={BLUE} stopOpacity={placeholder ? 0.08 : 0.2} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r={R - 8} fill={BLUE} fillOpacity="0.05" />
      <g clipPath={`url(#c${id})`}>
        <path d={wave(4)} fill={BLUE} fillOpacity={placeholder ? 0.06 : 0.12} className="motion-safe:animate-[mvwave_7s_linear_infinite]" />
        <path d={wave(0)} fill={`url(#g${id})`} className="motion-safe:animate-[mvwave_4s_linear_infinite]" />
      </g>
      <circle cx="100" cy="100" r={R} fill="none" stroke={BLUE} strokeOpacity="0.15" strokeWidth="6" strokeDasharray={placeholder ? '4 7' : undefined} />
      {!placeholder && (
        <circle cx="100" cy="100" r={R} fill="none" stroke={BLUE} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(C * rate) / 100} ${C}`} transform="rotate(-90 100 100)" />
      )}
      <text x="100" y="113" textAnchor="middle" fill={placeholder ? '#94a3b8' : '#0f172a'} fontSize="38" fontWeight="700" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
        {placeholder ? '?' : `${rate}%`}
      </text>
      <style>{`@keyframes mvwave { from { transform: translateX(0) } to { transform: translateX(-60px) } }`}</style>
    </svg>
  );
}

function ResponseCard({ r }: { r: NonNullable<JobPageInsights['response']> }) {
  const rate = Math.max(0, Math.min(100, r.rate));
  return (
    <Card title="Will they answer you?" foot={`From ${r.tracked} applications people tracked on MadeVisa.`}>
      <div className="mt-3 flex flex-col items-center gap-2 text-center">
        <Gauge rate={rate} />
        <p className="text-base font-bold leading-tight">of applicants heard back</p>
        {r.avg_days != null && (
          <p className="text-sm text-ink-600">
            usually within <strong className="text-ink-950">{Math.max(1, r.avg_days)} day{r.avg_days === 1 ? '' : 's'}</strong>
          </p>
        )}
      </div>
    </Card>
  );
}

function ResponseInvite({ company, onTrack }: { company: string; onTrack: (signedIn: boolean) => void }) {
  return (
    <Card title="Will they answer you?" muted>
      <div className="mt-3 flex flex-col items-center gap-1 text-center">
        <Gauge rate={22} placeholder />
        <p className="text-sm font-bold text-ink-900">No answers tracked yet</p>
        <p className="text-xs leading-5 text-ink-600">Applied to {company}? Tell us when they reply. Once a few people do, everyone sees how often {company} answers.</p>
        <TrackButton label="Track my application" onTrack={onTrack} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. International interviews — bars by country
// ---------------------------------------------------------------------------

function Bars({ rows, placeholder = false }: { rows: { key: string; label: string; code: string; n: number }[]; placeholder?: boolean }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-xs" title={placeholder ? undefined : `${r.label}: ${r.n} ${r.n === 1 ? 'person' : 'people'}`}>
          <span className={`flex min-w-0 items-center gap-1.5 ${placeholder ? 'text-ink-400' : 'text-ink-700'}`}>
            {r.code ? <CircleFlag countryCode={r.code} label={r.label} size={14} /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#2563EB]/15" />}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#2563EB]/10">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(8, (r.n / max) * 100)}%`,
                background: placeholder ? 'rgba(37,99,235,0.18)' : `linear-gradient(90deg, ${BLUE}, rgba(37,99,235,0.55))`,
              }}
            />
          </span>
          <span className={`w-5 text-right font-semibold tabular-nums ${placeholder ? 'text-ink-300' : 'text-ink-700'}`}>{placeholder ? '–' : r.n}</span>
        </li>
      ))}
    </ul>
  );
}

function InternationalCard({ d }: { d: NonNullable<JobPageInsights['international']> }) {
  const rows = [...d.top.map((t) => ({ key: t.code, label: t.name, code: t.code, n: t.n })), ...(d.other > 0 ? [{ key: 'other', label: 'Other countries', code: '', n: d.other }] : [])];
  return (
    <Card title="Do they hire people from abroad?" foot="People who reported an interview or offer here, by nationality. Small numbers are grouped.">
      <p className="mt-2 text-sm text-ink-600">
        <strong className="text-2xl font-bold tabular-nums text-ink-950">{d.people}</strong> people from <strong className="text-ink-950">{d.countries} countries</strong> got interviews
      </p>
      <Bars rows={rows} />
    </Card>
  );
}

function InternationalInvite({ company, onTrack }: { company: string; onTrack: (signedIn: boolean) => void }) {
  const sample = [
    { key: 'a', label: 'Your country', code: '', n: 5 },
    { key: 'b', label: 'Country', code: '', n: 3 },
    { key: 'c', label: 'Country', code: '', n: 2 },
  ];
  return (
    <Card title="Do they hire people from abroad?" muted>
      <p className="mt-2 text-sm font-bold text-ink-900">Be one of the first to show it</p>
      <Bars rows={sample} placeholder />
      <p className="mt-3 text-xs leading-5 text-ink-600">
        Got an interview at {company}? Add it to your applicant report. With your nationality on your profile, people from your country can see that {company} hires from abroad.
      </p>
      <TrackButton label="Add my interview" onTrack={onTrack} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Live-checked jobs — area chart of new jobs per week
// ---------------------------------------------------------------------------

function LiveCard({ l }: { l: NonNullable<JobPageInsights['live']> }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const pct = Math.round((l.checked / l.open) * 100);
  // A trend needs at least 3 weeks with new jobs; a first import lands in one week.
  const hasHistory = l.weeks.filter((n) => n > 0).length >= 3;
  const W = 300;
  const H = 110;
  const pad = 6;
  const max = Math.max(...l.weeks, 1);
  const step = (W - 2 * pad) / (l.weeks.length - 1);
  const pts = l.weeks.map((n, i) => [pad + i * step, H - 8 - (n / max) * (H - 24)] as const);
  const line = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, '');
  const area = `${line} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`;
  const weekLabel = (i: number) => {
    const ago = l.weeks.length - 1 - i;
    return ago === 0 ? 'This week' : ago === 1 ? 'Last week' : `${ago} weeks ago`;
  };

  return (
    <Card
      title="Is this job real?"
      foot={`MadeVisa checks every job against the company’s own careers page.${l.avg_open_days ? ` Their jobs usually stay open about ${l.avg_open_days} days.` : ''}`}
    >
      <p className="mt-2 text-sm text-ink-600">
        <strong className="text-2xl font-bold tabular-nums text-ink-950">{pct}%</strong> of {l.open.toLocaleString()} open jobs checked live in the last 48 h
      </p>
      {!hasHistory ? (
        // Too new for a weekly trend (e.g. just imported): show the live check itself.
        <div className="mt-4">
          <div className="h-3 overflow-hidden rounded-full bg-[#2563EB]/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, rgba(37,99,235,0.55), ${BLUE})` }} />
          </div>
          <p className="mt-2 text-xs text-ink-600">
            <strong className="text-ink-950">{l.checked.toLocaleString()}</strong> of {l.open.toLocaleString()} jobs found on the careers page. A weekly hiring trend appears here after a few weeks.
          </p>
        </div>
      ) : (
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="New jobs per week over the last 8 weeks">
          <defs>
            <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={BLUE} stopOpacity="0.28" />
              <stop offset="1" stopColor={BLUE} stopOpacity="0" />
            </linearGradient>
          </defs>
          {pts.map(([x], i) => (i % 2 === 1 ? <line key={i} x1={x} x2={x} y1={4} y2={H} stroke={BLUE} strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null))}
          <path d={area} fill={`url(#f${id})`} />
          <path d={line} fill="none" stroke={BLUE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={H} stroke={BLUE} strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />}
          {pts.map(([x], i) => (
            <rect key={`h${i}`} x={x - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950 px-2 py-1 text-[11px] font-semibold text-white shadow" style={{ left: `${(pts[hover][0] / W) * 100}%` }}>
            {weekLabel(hover)}: {l.weeks[hover]} new job{l.weeks[hover] === 1 ? '' : 's'}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-ink-400">
          <span>8 weeks ago</span>
          <span>New jobs per week</span>
          <span>Now</span>
        </div>
      </div>
      )}
    </Card>
  );
}
