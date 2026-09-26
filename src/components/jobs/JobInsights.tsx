import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { trackAppliedListing } from '@/lib/companies';
import { fetchJobPageInsights, SHOW_LIVE_FROM, SHOW_RESPONSE_FROM, type JobPageInsights } from '@/lib/jobInsights';
import { AreaTrend, Bars, Gauge, InsightCard, InsightGrid, InsightPanel, Meter, Tag, type BarRow } from '@/components/charts/InsightCharts';

/**
 * Three graphics at the end of a job page, measured only on MadeVisa:
 *   1. Will they answer you?            → response rate (liquid gauge)
 *   2. Do they hire people from abroad? → interviews by nationality (bars)
 *   3. Is this job real?                → jobs checked live on the careers page
 * 1 and 2 invite people to take part until there's enough data; a number
 * that isn't good is never shown. 3 only appears for synced companies.
 * Below them: "I applied — track this job".
 */
export function JobInsights({
  publisherId,
  company,
  listing,
  onOpenTracking,
  onSignUp,
}: {
  publisherId: string;
  company: string;
  listing: { id: string; title: string; kind: 'job' | 'program' };
  /** Go to the profile's applicant report, focused on this job. */
  onOpenTracking: () => void;
  onSignUp: () => void;
}) {
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
  const live = l && l.imported_open >= 5 && l.open > 0 && l.checked / l.open >= SHOW_LIVE_FROM ? l : null;
  const accuracy = data?.accuracy && data.accuracy.answers >= 3 && data.accuracy.ok / data.accuracy.answers >= 0.7 ? data.accuracy : null;

  const cards: ReactNode[] = [];
  if (response !== 'hide') cards.push(response === 'invite' ? <ResponseInvite key="r" /> : <ResponseCard key="r" r={response} />);
  cards.push(international === 'invite' ? <InternationalInvite key="i" company={company} /> : <InternationalCard key="i" d={international} />);
  if (live) cards.push(<LiveCard key="l" l={live} accuracy={accuracy} />);

  return (
    <div className="mt-4">
      <InsightPanel
        title={`How ${company} hires`}
        right={
          <p className="flex items-center gap-2 text-[11px] font-semibold text-ink-600">
            Measured on <Logo style={{ height: 16 }} />
          </p>
        }
        foot="From MadeVisa reports and careers-page checks. A guide, not a guarantee."
      >
        <InsightGrid count={cards.length}>{cards}</InsightGrid>
        <TrackCta publisherId={publisherId} listing={listing} onOpenTracking={onOpenTracking} onSignUp={onSignUp} />
      </InsightPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "I applied — track this job"
// ---------------------------------------------------------------------------

function TrackCta({
  publisherId,
  listing,
  onOpenTracking,
  onSignUp,
}: {
  publisherId: string;
  listing: { id: string; title: string; kind: 'job' | 'program' };
  onOpenTracking: () => void;
  onSignUp: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const res = await trackAppliedListing({ publisherId, kind: listing.kind, listingId: listing.id, title: listing.title });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not start tracking.');
    if (res.signedIn) onOpenTracking();
    else onSignUp();
  };
  return (
    <div className="mt-3 flex flex-col items-start gap-3 rounded-lg bg-[#1D4ED8]/5 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-950">Applied to this job?</p>
        <p className="text-xs leading-5 text-ink-600">Track it — 3 quick check-ins help the next applicant.</p>
        {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
      </div>
      <button
        onClick={go}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I applied — track this job <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Response rate
// ---------------------------------------------------------------------------

function ResponseCard({ r }: { r: NonNullable<JobPageInsights['response']> }) {
  const early = Boolean(r.early);
  return (
    <InsightCard
      title="Will they answer you?"
      tag={
        <Tag tone={early ? 'amber' : 'blue'}>
          {early ? 'Early data' : 'Reliable'} · {r.people ?? r.tracked} people
        </Tag>
      }
      foot={`${r.tracked} tracked applications`}
    >
      <div className="mt-3 flex flex-col items-center gap-2 text-center">
        <Gauge value={r.rate} />
        <p className="text-base font-bold leading-tight">of applicants heard back</p>
        {early && r.low != null && r.high != null && r.high - r.low >= 5 && (
          <p className="text-sm text-ink-600">
            likely between <strong className="text-ink-950">{r.low}%</strong> and <strong className="text-ink-950">{r.high}%</strong>
          </p>
        )}
        {r.avg_days != null && (
          <p className="text-sm text-ink-600">
            usually within <strong className="text-ink-950">{Math.max(1, r.avg_days)} day{r.avg_days === 1 ? '' : 's'}</strong>
          </p>
        )}
      </div>
    </InsightCard>
  );
}

function ResponseInvite() {
  return (
    <InsightCard title="Will they answer you?" muted>
      <div className="mt-3 flex flex-col items-center gap-1 text-center">
        <Gauge value={22} placeholder />
        <p className="text-sm font-bold text-ink-900">No answers tracked yet</p>
        <p className="text-xs leading-5 text-ink-600">Appears once applicants report back.</p>
      </div>
    </InsightCard>
  );
}

// ---------------------------------------------------------------------------
// 2. International interviews
// ---------------------------------------------------------------------------

function InternationalCard({ d }: { d: NonNullable<JobPageInsights['international']> }) {
  const rows: BarRow[] = [...d.top.map((t) => ({ key: t.code, label: t.name, code: t.code, n: t.n })), ...(d.other > 0 ? [{ key: 'other', label: 'Other countries', n: d.other }] : [])];
  return (
    <InsightCard
      title="Do they hire people from abroad?"
      tag={<Tag tone={d.people < 15 ? 'amber' : 'blue'}>{d.people < 15 ? 'Early data' : 'Reliable'}</Tag>}
      foot="Interviews and offers by nationality"
    >
      <p className="mt-2 text-sm text-ink-600">
        <strong className="text-2xl font-bold tabular-nums text-ink-950">{d.people}</strong> people from <strong className="text-ink-950">{d.countries} countries</strong> got interviews
      </p>
      <Bars rows={rows} unit={['person', 'people']} />
    </InsightCard>
  );
}

function InternationalInvite({ company }: { company: string }) {
  const sample: BarRow[] = [
    { key: 'a', label: 'Your country', n: 5 },
    { key: 'b', label: 'Country', n: 3 },
    { key: 'c', label: 'Country', n: 2 },
  ];
  return (
    <InsightCard title="Do they hire people from abroad?" muted>
      <p className="mt-2 text-sm font-bold text-ink-900">Be one of the first to show it</p>
      <Bars rows={sample} placeholder />
      <p className="mt-3 text-xs leading-5 text-ink-600">
        Got an interview at {company}? Add your nationality to show it.
      </p>
    </InsightCard>
  );
}

// ---------------------------------------------------------------------------
// 3. Live-checked jobs
// ---------------------------------------------------------------------------

function LiveCard({ l, accuracy }: { l: NonNullable<JobPageInsights['live']>; accuracy: { answers: number; ok: number } | null }) {
  const pct = Math.round((l.checked / l.open) * 100);
  // A trend needs at least 3 weeks with new jobs; a first import lands in one week.
  const hasHistory = l.weeks.filter((n) => n > 0).length >= 3;
  return (
    <InsightCard
      title="Is this job real?"
      tag={<Tag>Checked by MadeVisa</Tag>}
      foot={l.avg_open_days ? `Jobs stay open ~${l.avg_open_days} days` : undefined}
    >
      <p className="mt-2 text-sm text-ink-600">
        <strong className="text-2xl font-bold tabular-nums text-ink-950">{pct}%</strong> of {l.open.toLocaleString()} open jobs checked live in the last 48 h
      </p>
      {hasHistory ? (
        <AreaTrend values={l.weeks} label="New jobs per week" noun={['new job', 'new jobs']} />
      ) : (
        <div className="mt-4">
          <Meter value={pct} />
          <p className="mt-2 text-xs text-ink-600">
            <strong className="text-ink-950">{l.checked.toLocaleString()}</strong> of {l.open.toLocaleString()} found on the careers page
          </p>
        </div>
      )}
      {accuracy && (
        <p className="mt-3 rounded-md bg-[#1D4ED8]/[0.06] px-2.5 py-1.5 text-xs text-ink-700">
          <strong className="text-ink-950">
            {accuracy.ok} of {accuracy.answers}
          </strong>{' '}
          applicants said the job was as described
        </p>
      )}
    </InsightCard>
  );
}
