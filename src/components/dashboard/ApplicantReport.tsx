import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Check, Globe, Info, Loader2, Lock, Trash2 } from 'lucide-react';
import {
  NEVER_HEARD_BACK_DAYS,
  NO_RESPONSE_WEEK_DAYS,
  applicationListingPath,
  companyPath,
  confirmApplication,
  deleteApplicationReport,
  fetchCompanyResponseRates,
  fetchMyApplicationReports,
  fetchMyListingStatuses,
  hasResponse,
  respondedWithinWeek,
  setApplicationPublic,
  syncPendingApplications,
  updateApplicationReport,
  type ApplicationReport,
  type ApplicationStatus,
  type CompanyResponseRate,
  type ListingStatus,
} from '@/lib/companies';

const DAY = 86_400_000;
const TIMELINE_DAYS = NEVER_HEARD_BACK_DAYS; // the bar spans the first three weeks
const MILESTONES = [1, 5, 10, 25, 50, 100, 250];

const daysBetween = (from: string, to: string | number = Date.now()) =>
  Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** What the person can record. Older statuses map onto these. */
type Choice = 'applied' | 'responded' | 'interview' | 'rejected' | 'no_response_week' | 'no_response' | 'withdrawn';

function choiceOf(r: ApplicationReport): Choice {
  switch (r.status) {
    case 'withdrawn':
    case 'no_response_week':
    case 'no_response':
    case 'interview':
    case 'rejected':
    case 'responded':
      return r.status;
    case 'offer':
      return 'interview';
    default:
      return hasResponse(r) ? 'responded' : 'applied';
  }
}

const isResponse = (c: Choice) => c === 'responded' || c === 'interview' || c === 'rejected';

const RESPONSE_LABEL: Record<'responded' | 'interview' | 'rejected', string> = {
  responded: 'Got a reply',
  interview: 'Interview invite',
  rejected: 'Rejection email',
};

type Filter = 'all' | 'waiting' | 'responded';

export function ApplicantReport({ viewedCount = 0, hasPublicProfile = false }: { viewedCount?: number; hasPublicProfile?: boolean }) {
  const [rows, setRows] = useState<ApplicationReport[] | null>(null);
  const [listing, setListing] = useState<Map<string, ListingStatus>>(new Map());
  const [rates, setRates] = useState<Map<string, CompanyResponseRate>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDelete, setConfirmDelete] = useState<ApplicationReport | null>(null);

  useEffect(() => {
    // Apply clicks made before signing in are added first.
    syncPendingApplications().finally(() => {
      fetchMyApplicationReports().then((list) => {
        setRows(list);
        fetchCompanyResponseRates(list.map((r) => r.publisher_id)).then(setRates);
      });
      fetchMyListingStatuses().then(setListing);
    });
  }, []);

  const pending = useMemo(() => (rows ?? []).filter((r) => r.status === 'clicked'), [rows]);
  const tracked = useMemo(() => (rows ?? []).filter((r) => r.status !== 'clicked'), [rows]);

  const stats = useMemo(() => {
    const applied = tracked.filter((r) => r.status !== 'withdrawn');
    const replied = applied.filter(hasResponse);
    const week = replied.filter(respondedWithinWeek);
    const silent = applied.filter((r) => r.status === 'no_response' || r.status === 'no_response_week');
    return {
      applied: applied.length,
      replied: replied.length,
      week: week.length,
      later: replied.length - week.length,
      silent: silent.length,
      waiting: applied.length - replied.length - silent.length,
      rate: applied.length ? Math.round((100 * replied.length) / applied.length) : null,
    };
  }, [tracked]);

  const shown = tracked.filter((r) => {
    if (filter === 'all') return true;
    return filter === 'responded' ? isResponse(choiceOf(r)) : !isResponse(choiceOf(r));
  });

  const patchLocal = (id: string, patch: Partial<ApplicationReport>) =>
    setRows((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev);
  const removeLocal = (id: string) => setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev);

  return (
    <div className="space-y-6">
      <Scoreboard viewed={viewedCount} stats={stats} />

      {pending.length > 0 && (
        <section aria-labelledby="confirm-heading" className="rounded-md border-2 border-[#2563EB] bg-white">
          <header className="border-b border-ink-100 px-4 py-3 sm:px-5">
            <h2 id="confirm-heading" className="text-base font-bold text-ink-950">
              Did you apply? <span className="font-semibold text-[#2563EB]">{pending.length} to confirm</span>
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              You clicked Apply on these. If you sent an application, confirm it to start tracking. Knowing which companies reply keeps hiring
              accountable and tells the next applicant what to expect.
            </p>
          </header>
          <ul className="divide-y divide-ink-100">
            {pending.map((r) => (
              <ConfirmRow
                key={r.id}
                r={r}
                onConfirmed={() => patchLocal(r.id, { status: 'applied', confirmed_at: new Date().toISOString(), excluded: false })}
                onDismissed={() => removeLocal(r.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="report-heading">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="report-heading" className="text-lg font-bold text-ink-950">
            Applicant Response Report
          </h2>
          <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            <Lock className="h-3 w-3" /> Private unless you share it
          </span>
          <div className="ml-auto flex rounded-md border border-ink-200 bg-white p-0.5">
            {(['all', 'waiting', 'responded'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === f ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-[#2563EB]'
                }`}
              >
                {f === 'all' ? `All ${tracked.length}` : f === 'waiting' ? 'Waiting' : 'Replied'}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-ink-200 bg-white px-5 py-6 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your applications…
          </div>
        ) : tracked.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-ink-300 bg-white px-5 py-10 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-2 text-sm font-semibold text-ink-800">{pending.length ? 'Confirm an application above to start tracking' : 'No applications tracked yet'}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-500">
              Click <strong>Apply</strong> on a MadeVisa job, apply on the company's site, then confirm it here. You'll see the day count and whether they
              reply.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-md border border-ink-200 bg-white px-5 py-6 text-sm text-ink-400">Nothing here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {shown.map((r) => (
              <TrackCard
                key={r.id}
                r={r}
                listing={listing.get(r.id)}
                rate={rates.get(r.publisher_id)}
                hasPublicProfile={hasPublicProfile}
                onPatch={(p) => patchLocal(r.id, p)}
                onDelete={() => setConfirmDelete(r)}
              />
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] leading-5 text-ink-400">
          Only applications started through MadeVisa appear here. Company pages show anonymous response rates only — never your name — and only once
          enough different applicants have reported.
        </p>
      </section>

      {confirmDelete && (
        <ConfirmDelete
          r={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const res = await deleteApplicationReport(confirmDelete.id);
            if (res.ok) {
              removeLocal(confirmDelete.id);
              setConfirmDelete(null);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

type Stats = { applied: number; replied: number; week: number; later: number; silent: number; waiting: number; rate: number | null };

function Scoreboard({ viewed, stats }: { viewed: number; stats: Stats }) {
  const next = MILESTONES.find((m) => m > stats.applied) ?? stats.applied;
  const progress = next > 0 ? Math.min(1, stats.applied / next) : 1;
  const segments = [
    { n: stats.week, cls: 'bg-emerald-400', label: 'Reply within a week' },
    { n: stats.later, cls: 'bg-emerald-700', label: 'Reply later' },
    { n: stats.waiting, cls: 'bg-amber-400', label: 'Waiting' },
    { n: stats.silent, cls: 'bg-ink-500', label: 'No reply' },
  ];

  return (
    <section className="overflow-hidden rounded-md bg-ink-950 text-white">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10">
        {/* Response rate */}
        <div>
          <p className="text-xs font-semibold text-white/60">Your response rate</p>
          <p className="mt-1 font-slab text-5xl font-bold tabular-nums leading-none sm:text-6xl">
            {stats.rate != null ? (
              <>
                {stats.rate}
                <span className="text-3xl text-white/60 sm:text-4xl">%</span>
              </>
            ) : (
              <span className="text-white/40">—</span>
            )}
          </p>
          <p className="mt-2 text-sm text-white/70">
            {stats.applied ? `${stats.replied} of ${plural(stats.applied, 'application')} got a reply` : 'Confirm an application to start'}
          </p>
          {stats.applied > 0 && (
            <>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-sm bg-white/10" role="img" aria-label="Replies, waiting and no reply">
                {segments.map((s) => (s.n ? <span key={s.label} className={s.cls} style={{ width: `${(100 * s.n) / stats.applied}%` }} /> : null))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
                {segments.map((s) => (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-sm ${s.cls}`} />
                    {s.label} <span className="font-semibold tabular-nums text-white">{s.n}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Funnel */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded bg-white/10 sm:grid-cols-4">
          {[
            { label: 'Viewed', value: viewed, sub: 'last 48 hours' },
            { label: 'Applied', value: stats.applied, sub: 'confirmed' },
            { label: 'Replies', value: stats.replied, sub: stats.rate != null ? `${stats.rate}% of applied` : '' },
            { label: 'Within a week', value: stats.week, sub: stats.applied ? `${Math.round((100 * stats.week) / stats.applied)}% of applied` : '' },
          ].map((k, i) => (
            <div key={k.label} className="bg-ink-950 p-3.5">
              <p className="text-[11px] font-semibold text-white/60">
                {i > 0 && <span className="mr-1 text-white/30">→</span>}
                {k.label}
              </p>
              <p className="mt-1 font-slab text-3xl font-bold tabular-nums">{k.value.toLocaleString()}</p>
              <p className="text-[10px] text-white/45">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Milestone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 bg-white/[0.03] px-5 py-3 text-xs sm:px-6">
        <span className="font-semibold text-white/80">
          {stats.applied >= MILESTONES[MILESTONES.length - 1]
            ? `${stats.applied} applications tracked`
            : `${stats.applied} of ${next} tracked applications`}
        </span>
        <span className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-sm bg-white/10">
          <span className="block h-full bg-[#2563EB]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
        <span className="text-white/55">Every confirmed application adds to the company's public response rate.</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Did you apply?"
// ---------------------------------------------------------------------------

function ConfirmRow({ r, onConfirmed, onDismissed }: { r: ApplicationReport; onConfirmed: () => void; onDismissed: () => void }) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const company = r.publisher?.name ?? 'the company';

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
      <Logo url={r.publisher?.logo_url} size={40} />
      <div className="min-w-0 flex-1">
        <a href={applicationListingPath(r, company)} className="line-clamp-2 text-sm font-bold text-ink-950 hover:text-[#2563EB]">
          {r.listing_title ?? 'Application'}
        </a>
        <p className="text-xs text-ink-500">
          {company} · clicked Apply {fmtDate(r.applied_at)}
        </p>
        {msg && <p className="mt-1 text-[11px] font-medium text-rose-600">{msg}</p>}
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          disabled={busy !== null}
          onClick={async () => {
            setBusy('yes');
            setMsg(null);
            const res = await confirmApplication(r.id);
            setBusy(null);
            if (res.ok) onConfirmed();
            else setMsg(res.error ?? 'Could not confirm.');
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:flex-none"
        >
          {busy === 'yes' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Yes, I applied — start tracking
        </button>
        <button
          disabled={busy !== null}
          onClick={async () => {
            setBusy('no');
            const res = await deleteApplicationReport(r.id);
            setBusy(null);
            if (res.ok) onDismissed();
            else setMsg(res.error ?? 'Could not remove.');
          }}
          className="flex-1 rounded border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-600 hover:border-ink-300 hover:text-ink-900 disabled:opacity-60 sm:flex-none"
        >
          No, I didn't
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One tracked application
// ---------------------------------------------------------------------------

function TrackCard({
  r,
  listing,
  rate,
  hasPublicProfile,
  onPatch,
  onDelete,
}: {
  r: ApplicationReport;
  listing?: ListingStatus;
  rate?: CompanyResponseRate;
  hasPublicProfile: boolean;
  onPatch: (p: Partial<ApplicationReport>) => void;
  onDelete: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choice = choiceOf(r);
  const company = r.publisher?.name ?? 'the company';
  const daysIn = daysBetween(r.applied_at);
  const replyDay = isResponse(choice) && r.responded_at ? daysBetween(r.applied_at, r.responded_at) : null;
  const weekIn = Math.max(0, NO_RESPONSE_WEEK_DAYS - daysIn);
  const neverIn = Math.max(0, NEVER_HEARD_BACK_DAYS - daysIn);
  const removed = Boolean(listing && ['expired', 'deleted', 'rejected', 'archived'].includes(listing.status));
  const noun = r.listing_kind === 'program' ? 'program' : 'job';

  const setChoice = async (next: Choice) => {
    if (next === choice || next === 'withdrawn') return;
    const before = { status: r.status, responded_at: r.responded_at };
    const status: ApplicationStatus = next;
    onPatch({
      status,
      responded_at: isResponse(next) ? r.responded_at ?? new Date().toISOString() : null,
    });
    setSaving(true);
    setMsg(null);
    const res = await updateApplicationReport(r.id, { status });
    setSaving(false);
    if (!res.ok) {
      onPatch(before);
      setMsg(res.error ?? 'Could not update.');
    }
  };

  const togglePublic = async () => {
    const next = !r.is_public;
    onPatch({ is_public: next });
    const res = await setApplicationPublic(r.id, next);
    if (!res.ok) {
      onPatch({ is_public: !next });
      setMsg(res.error ?? 'Could not update.');
    }
  };

  // Big day counter (top right): the day the reply came, or today's day.
  const counter = isResponse(choice)
    ? { day: replyDay ?? daysIn, caption: RESPONSE_LABEL[choice as 'responded' | 'interview' | 'rejected'], tone: 'text-emerald-700', dayTone: 'text-emerald-700' }
    : choice === 'no_response'
      ? { day: daysIn, caption: 'Never heard back', tone: 'text-ink-500', dayTone: 'text-ink-400' }
      : choice === 'no_response_week'
        ? { day: daysIn, caption: 'No reply in week 1', tone: 'text-ink-600', dayTone: 'text-ink-900' }
        : choice === 'withdrawn'
          ? { day: daysIn, caption: 'Withdrawn', tone: 'text-ink-500', dayTone: 'text-ink-400' }
          : { day: daysIn, caption: 'No response yet', tone: 'text-amber-700', dayTone: 'text-ink-950' };

  const options: { value: Choice; label: string; lockedFor?: number }[] = [
    { value: 'applied', label: 'Waiting' },
    { value: 'responded', label: 'Got a reply' },
    { value: 'interview', label: 'Interview invite' },
    { value: 'rejected', label: 'Rejection email' },
    { value: 'no_response_week', label: 'No reply in week 1', lockedFor: weekIn },
    { value: 'no_response', label: 'Never heard back', lockedFor: neverIn },
  ];

  return (
    <li className={`rounded-md border bg-white ${isResponse(choice) ? 'border-emerald-300' : 'border-ink-200'}`}>
      <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
        <Logo url={r.publisher?.logo_url} size={52} />
        <div className="min-w-0 flex-1">
          <a href={applicationListingPath(r, company)} className="line-clamp-2 text-base font-bold leading-snug text-ink-950 hover:text-[#2563EB]">
            {r.listing_title ?? 'Application'}
          </a>
          <p className="mt-0.5 text-sm text-ink-600">
            {r.publisher ? (
              <a href={companyPath(r.publisher)} className="font-semibold hover:text-[#2563EB]">
                {r.publisher.name}
              </a>
            ) : (
              'Company'
            )}
            <span className="text-ink-400"> · applied {fmtDate(r.applied_at)}</span>
          </p>
          <CompanyRateLine company={company} rate={rate} />
        </div>
        <div className="w-[88px] shrink-0 text-right sm:w-[136px]">
          <p className={`font-slab font-bold tabular-nums leading-none ${counter.dayTone}`}>
            <span className="text-xs font-semibold text-ink-500 sm:text-sm">Day </span>
            <span className="text-3xl sm:text-4xl">{pad2(counter.day)}</span>
          </p>
          <p className={`mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs ${counter.tone}`}>{counter.caption}</p>
        </div>
      </div>

      <Timeline daysIn={daysIn} replyDay={replyDay} responded={isResponse(choice)} />

      {removed && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 sm:mx-5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div>
            <p>
              <strong>
                This {noun} was removed from {company}'s careers page
              </strong>
              {listing?.removedAt ? ` on ${fmtDate(listing.removedAt)}` : ''}. That usually means someone was hired or the {noun} closed.
            </p>
            {!isResponse(choice) &&
              choice !== 'no_response' &&
              (neverIn > 0 ? (
                <p className="mt-0.5 text-amber-800">
                  If you don't hear back, you can mark “Never heard back” from day {NEVER_HEARD_BACK_DAYS} ({plural(neverIn, 'day')} from now).
                </p>
              ) : (
                <button onClick={() => setChoice('no_response')} className="mt-0.5 text-left font-semibold underline underline-offset-2 hover:text-amber-950">
                  Didn't hear anything? Mark “Never heard back”
                </button>
              ))}
          </div>
        </div>
      )}

      {/* What happened */}
      <div className="mt-3 border-t border-ink-100 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What happened with this application">
          {options.map((o) => {
            const locked = (o.lockedFor ?? 0) > 0;
            const active = choice === o.value;
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={active}
                disabled={locked || saving}
                onClick={() => setChoice(o.value)}
                title={locked ? `Available in ${plural(o.lockedFor!, 'day')}` : undefined}
                className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? isResponse(o.value)
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-ink-900 bg-ink-900 text-white'
                    : locked
                      ? 'cursor-not-allowed border-dashed border-ink-200 text-ink-300'
                      : 'border-ink-200 text-ink-700 hover:border-[#2563EB] hover:text-[#2563EB]'
                }`}
              >
                {locked && <Lock className="h-3 w-3" />}
                {o.label}
                {locked && <span className="font-medium">· {o.lockedFor}d</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <span className="text-ink-500">
            In your list for <strong className="text-ink-800">{daysIn === 0 ? 'less than a day' : plural(daysIn, 'day')}</strong>
          </span>
          <label className={`inline-flex items-center gap-2 ${hasPublicProfile ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(r.is_public)}
              disabled={!hasPublicProfile}
              onClick={togglePublic}
              className={`relative h-4 w-7 rounded-full transition-colors ${r.is_public ? 'bg-[#2563EB]' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${r.is_public ? 'left-3.5' : 'left-0.5'}`} />
            </button>
            <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
              <Globe className="h-3 w-3" />
              {hasPublicProfile ? 'Show on my public profile' : 'Set a profile link in Settings to share'}
            </span>
          </label>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-1 font-semibold text-ink-400 transition-colors hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
        {msg && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{msg}</p>}
      </div>
    </li>
  );
}

function CompanyRateLine({ company, rate }: { company: string; rate?: CompanyResponseRate }) {
  if (!rate) return null;
  if (rate.responseRate == null) {
    return (
      <p className="mt-1 text-xs text-ink-400">
        Not enough data yet on {company}'s response rate{rate.tracked ? ` (${plural(rate.tracked, 'application')} tracked)` : ''}
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-ink-600">
      {company} replies to <strong className="text-ink-900">{rate.responseRate}%</strong> of applicants
      {rate.responseWeekRate != null && (
        <>
          {' '}
          · <strong className="text-ink-900">{rate.responseWeekRate}%</strong> within a week
        </>
      )}
    </p>
  );
}

/** Day 0 → 21 track: filled up to today (or the reply), with the day 7 and day 21 checkpoints. */
function Timeline({ daysIn, replyDay, responded }: { daysIn: number; replyDay: number | null; responded: boolean }) {
  const end = responded && replyDay != null ? replyDay : daysIn;
  const pct = (d: number) => Math.min(100, (100 * d) / TIMELINE_DAYS);
  return (
    <div className="px-4 sm:px-5">
      <div className="relative h-1.5 rounded-sm bg-ink-100">
        <span className={`absolute inset-y-0 left-0 rounded-sm ${responded ? 'bg-emerald-500' : 'bg-[#2563EB]'}`} style={{ width: `${Math.max(2, pct(end))}%` }} />
        {[NO_RESPONSE_WEEK_DAYS, NEVER_HEARD_BACK_DAYS].map((d) => (
          <span key={d} className="absolute -top-1 h-3.5 w-0.5 bg-ink-300" style={{ left: `calc(${pct(d)}% - 1px)` }} />
        ))}
        {responded && replyDay != null && (
          <span
            className="absolute -top-[5px] h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow"
            style={{ left: `calc(${pct(replyDay)}% - 8px)` }}
            title={`Reply on day ${replyDay}`}
          />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] font-semibold text-ink-400">
        <span className="absolute left-0">Applied</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(NO_RESPONSE_WEEK_DAYS)}%` }}>
          Day {NO_RESPONSE_WEEK_DAYS}
        </span>
        <span className="absolute right-0">Day {NEVER_HEARD_BACK_DAYS}{daysIn > NEVER_HEARD_BACK_DAYS ? '+' : ''}</span>
      </div>
    </div>
  );
}

function Logo({ url, size }: { url?: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded border border-ink-100 bg-white"
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain p-1" />
      ) : (
        <Briefcase className="h-4 w-4 text-ink-300" />
      )}
    </span>
  );
}

function ConfirmDelete({
  r,
  onCancel,
  onConfirm,
}: {
  r: ApplicationReport;
  onCancel: () => void;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" role="dialog" aria-modal="true" aria-labelledby="delete-app-title">
      <div className="menu-pop w-full max-w-sm rounded-md bg-white p-5 shadow-2xl">
        <h3 id="delete-app-title" className="text-base font-bold text-ink-950">
          Remove this application?
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          <strong className="text-ink-900">{r.listing_title ?? 'This application'}</strong>
          {r.publisher?.name ? ` at ${r.publisher.name}` : ''} will be removed from your report and won't count in any response rates. This can't be undone.
        </p>
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded px-3.5 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50">
            Cancel
          </button>
          <button
            autoFocus
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await onConfirm();
              if (!res.ok) {
                setBusy(false);
                setError(res.error ?? 'Could not remove it — please try again.');
              }
            }}
            className="flex items-center gap-1.5 rounded bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
