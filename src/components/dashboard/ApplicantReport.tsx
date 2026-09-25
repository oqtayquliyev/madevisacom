import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Check, ChevronDown, ChevronRight, Clock, Eye, Info, Loader2, Lock, MessageSquare, Trash2, Zap } from 'lucide-react';
import {
  NEVER_HEARD_BACK_DAYS,
  NO_RESPONSE_WEEK_DAYS,
  companyPath,
  deleteApplicationReport,
  fetchMyApplicationReports,
  fetchMyListingStatuses,
  hasResponse,
  respondedWithinWeek,
  syncPendingApplications,
  updateApplicationReport,
  type ApplicationReport,
  type ApplicationStatus,
  type ListingStatus,
} from '@/lib/companies';

const DAY = 86_400_000;

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** What the status menu shows. Older, more detailed statuses count as a response. */
type Choice = 'applied' | 'responded' | 'no_response_week' | 'no_response' | 'withdrawn';

function choiceOf(r: ApplicationReport): Choice {
  if (r.status === 'withdrawn') return 'withdrawn';
  if (r.status === 'no_response_week' || r.status === 'no_response') return r.status;
  if (hasResponse(r)) return 'responded';
  return 'applied';
}

type Filter = 'all' | 'waiting' | 'responded';

export function ApplicantReport({ viewedCount = 0 }: { viewedCount?: number }) {
  const [rows, setRows] = useState<ApplicationReport[] | null>(null);
  const [listing, setListing] = useState<Map<string, ListingStatus>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDelete, setConfirmDelete] = useState<ApplicationReport | null>(null);

  useEffect(() => {
    // Apply clicks made before signing in are added first.
    syncPendingApplications().finally(() => {
      fetchMyApplicationReports().then(setRows);
      fetchMyListingStatuses().then(setListing);
    });
  }, []);

  const stats = useMemo(() => {
    const applied = (rows ?? []).filter((r) => r.status !== 'withdrawn');
    const responded = applied.filter(hasResponse);
    const week = applied.filter((r) => hasResponse(r) && respondedWithinWeek(r));
    const pct = (n: number) => (applied.length ? Math.round((100 * n) / applied.length) : null);
    return { applied: applied.length, responded: responded.length, week: week.length, rate: pct(responded.length), weekRate: pct(week.length) };
  }, [rows]);

  const shown = (rows ?? []).filter((r) => {
    if (filter === 'all') return true;
    const c = choiceOf(r);
    return filter === 'responded' ? c === 'responded' : c === 'applied' || c === 'no_response_week' || c === 'no_response';
  });

  const patchLocal = (id: string, patch: Partial<ApplicationReport>) =>
    setRows((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev);

  const removeLocal = (id: string) => setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev);

  return (
    <div className="space-y-5">
      {/* Viewed › Applied › Responses › Within a week */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-200 bg-ink-200 sm:grid-cols-4">
        <Kpi icon={Eye} label="Jobs viewed" value={viewedCount} hint="last 48 hours" />
        <Kpi icon={Briefcase} label="Applied" value={stats.applied} arrow />
        <Kpi icon={MessageSquare} label="Responses" value={stats.responded} rate={stats.rate} arrow highlight={stats.responded > 0} />
        <Kpi icon={Zap} label="Replied within a week" value={stats.week} rate={stats.weekRate} arrow highlight={stats.week > 0} />
      </div>

      <section className="rounded-md border border-ink-200 bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-ink-950">Applicant Response Report</h2>
          <span className="inline-flex items-center gap-1 rounded bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
            <Lock className="h-3 w-3" /> Private to you
          </span>
          <div className="ml-auto flex gap-1">
            {(['all', 'waiting', 'responded'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold ${filter === f ? 'bg-[#2563EB] text-white' : 'text-ink-500 hover:bg-ink-50 hover:text-[#2563EB]'}`}
              >
                {f === 'all' ? 'All' : f === 'waiting' ? 'Waiting' : 'Responded'}
              </button>
            ))}
          </div>
        </header>

        {rows === null ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your applications…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-ink-200" />
            <p className="mt-2 text-sm font-semibold text-ink-800">No applications yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-500">
              When you click <strong>Apply</strong> on a MadeVisa job, it shows up here. Mark when a company gets back to you to see your response rate.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-400">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((r) => (
              <ReportRow key={r.id} r={r} listing={listing.get(r.id)} onPatch={(p) => patchLocal(r.id, p)} onDelete={() => setConfirmDelete(r)} />
            ))}
          </ul>
        )}

        <footer className="border-t border-ink-100 px-4 py-3 text-[11px] leading-5 text-ink-400 sm:px-5">
          Only applications started through MadeVisa appear here. Company pages show anonymous response rates only — never your name, and only once
          enough different applicants have reported.
        </footer>
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

function Kpi({
  icon: Icon,
  label,
  value,
  rate,
  hint,
  arrow = false,
  highlight = false,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  rate?: number | null;
  hint?: string;
  arrow?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="relative bg-white p-3.5 sm:pl-5">
      {arrow && (
        <ChevronRight className="absolute -left-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-white text-ink-300 sm:block" aria-hidden="true" />
      )}
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
        <Icon className={`h-3.5 w-3.5 ${highlight ? 'text-emerald-600' : 'text-[#2563EB]'}`} /> {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 font-slab text-2xl font-bold tabular-nums text-ink-950">
        {value.toLocaleString()}
        {rate != null && <span className="font-sans text-xs font-semibold text-emerald-700">{rate}%</span>}
      </p>
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

function ReportRow({
  r,
  listing,
  onPatch,
  onDelete,
}: {
  r: ApplicationReport;
  listing?: ListingStatus;
  onPatch: (p: Partial<ApplicationReport>) => void;
  onDelete: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const days = daysSince(r.applied_at);
  const choice = choiceOf(r);
  const company = r.publisher?.name ?? 'the company';
  const weekIn = Math.max(0, NO_RESPONSE_WEEK_DAYS - days);
  const neverIn = Math.max(0, NEVER_HEARD_BACK_DAYS - days);
  // Taken down from MadeVisa because the company's careers page no longer lists it.
  const removed = Boolean(listing && ['expired', 'deleted', 'rejected', 'archived'].includes(listing.status));
  const noun = r.listing_kind === 'program' ? 'program' : 'job';
  const responded = choice === 'responded';

  const setChoice = async (next: Choice) => {
    if (next === choice || next === 'withdrawn') return;
    const status: ApplicationStatus = next;
    const before = { status: r.status, responded_at: r.responded_at };
    onPatch({
      status,
      responded_at: next === 'responded' ? r.responded_at ?? new Date().toISOString() : null,
    });
    setSaving(true);
    setMsg(null);
    const res = await updateApplicationReport(r.id, { status });
    setSaving(false);
    if (!res.ok) {
      onPatch(before); // put it back
      setMsg(res.error ?? 'Could not update.');
    }
  };

  const options: { value: Choice; label: string; disabled?: boolean }[] = [
    { value: 'applied', label: 'Waiting for a response' },
    { value: 'responded', label: 'Got a response' },
    {
      value: 'no_response_week',
      label: weekIn > 0 ? `No response within 1 week (in ${plural(weekIn, 'day')})` : 'No response within 1 week',
      disabled: weekIn > 0,
    },
    {
      value: 'no_response',
      label: neverIn > 0 ? `Never heard back (from day ${NEVER_HEARD_BACK_DAYS})` : 'Never heard back',
      disabled: neverIn > 0,
    },
  ];
  if (choice === 'withdrawn') options.push({ value: 'withdrawn', label: 'Withdrawn', disabled: true });

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5 sm:flex-nowrap">
        {r.publisher?.logo_url ? (
          <img src={r.publisher.logo_url} alt="" className="h-10 w-10 shrink-0 rounded border border-ink-100 object-contain p-0.5" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-ink-50">
            <Briefcase className="h-4 w-4 text-ink-300" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold text-ink-950 sm:truncate">{r.listing_title ?? 'Application'}</p>
          <p className="text-xs text-ink-500">
            {r.publisher ? (
              <a href={companyPath(r.publisher)} className="font-medium hover:text-[#2563EB]">
                {r.publisher.name}
              </a>
            ) : null}
            {' · '}Applied {fmtDate(r.applied_at)}
          </p>
        </div>
        {/* Phones: full-width row under the title. Wider screens: on the right. */}
        <div className="flex w-full items-center gap-1 sm:w-auto sm:shrink-0">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Response status</span>
            <select
              value={choice}
              disabled={saving}
              onChange={(e) => setChoice(e.target.value as Choice)}
              className={`h-9 w-full appearance-none truncate rounded border py-0 pl-2.5 pr-7 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60 sm:h-8 sm:w-auto ${
                responded ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-ink-200 bg-white text-ink-700'
              }`}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          </label>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove this application"
            className="grid h-9 w-9 shrink-0 place-items-center rounded text-ink-300 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Path choice={choice} />

      {/* Where things stand, and what can be marked when. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
          <Clock className="h-3 w-3 text-ink-400" />
          In your list for {days === 0 ? 'less than a day' : plural(days, 'day')}
        </span>
        <StatusLine r={r} choice={choice} days={days} />
      </div>
      {!responded && choice !== 'no_response' && choice !== 'withdrawn' && (weekIn > 0 || neverIn > 0) && (
        <p className="mt-1 text-[11px] text-ink-400">
          {weekIn > 0
            ? `You can mark “No response within 1 week” in ${plural(weekIn, 'day')}, and “Never heard back” in ${plural(neverIn, 'day')}.`
            : `You can mark “Never heard back” in ${plural(neverIn, 'day')}.`}
        </p>
      )}

      {removed && (
        <div className="mt-3 flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div>
            <p>
              <strong>This {noun} was removed from {company}'s careers page</strong>
              {listing?.removedAt ? ` on ${fmtDate(listing.removedAt)}` : ''}. That usually means someone was hired or the {noun} closed.
            </p>
            {!responded && choice !== 'no_response' && (
              neverIn > 0 ? (
                <p className="mt-0.5 text-amber-800">
                  If you don't hear back, you can mark “Never heard back” from day {NEVER_HEARD_BACK_DAYS} ({plural(neverIn, 'day')} from now).
                </p>
              ) : (
                <button onClick={() => setChoice('no_response')} className="mt-0.5 text-left font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
                  Didn't hear anything? Mark “Never heard back”
                </button>
              )
            )}
          </div>
        </div>
      )}

      {msg && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{msg}</p>}
    </li>
  );
}

function StatusLine({ r, choice, days }: { r: ApplicationReport; choice: Choice; days: number }) {
  if (choice === 'responded') {
    const after = r.responded_at ? Math.max(0, Math.round((+new Date(r.responded_at) - +new Date(r.applied_at)) / DAY)) : null;
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
        <Check className="h-3 w-3" />
        Got a response{after != null ? (after === 0 ? ' the same day' : ` after ${plural(after, 'day')}`) : ''}
        {respondedWithinWeek(r) && <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px]">within a week</span>}
      </span>
    );
  }
  if (choice === 'no_response_week')
    return <span className="text-ink-500">No response in the first week — still open. Switch to “Got a response” if they get back to you.</span>;
  if (choice === 'no_response') return <span className="text-ink-500">Never heard back — you can still switch to “Got a response”.</span>;
  if (choice === 'withdrawn') return <span className="text-ink-500">You withdrew</span>;
  return <span className="text-amber-700">Waiting · day {days + 1}</span>;
}

/** Viewed job ✓ → Applied ✓ → Response */
function Path({ choice }: { choice: Choice }) {
  const response = { label: 'Response', state: choice === 'responded' ? ('done' as const) : ('todo' as const) };
  const steps = [
    { label: 'Viewed job', state: 'done' as const },
    { label: 'Applied', state: 'done' as const },
    response,
  ];
  return (
    <ol className="mt-3 flex items-center overflow-x-auto pb-1 [scrollbar-width:none]">
      {steps.map((s, i) => (
        <li key={s.label} className="flex shrink-0 items-center">
          <span className="flex items-center gap-1.5">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                s.state === 'done' ? 'bg-emerald-500 text-white' : 'border border-ink-200 bg-white text-ink-300'
              }`}
            >
              {s.state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`text-[11px] font-semibold ${s.state === 'done' ? 'text-ink-800' : 'text-ink-400'}`}>{s.label}</span>
          </span>
          {i < steps.length - 1 && <span className={`mx-1.5 h-px w-4 sm:mx-2 sm:w-10 ${steps[i + 1].state === 'done' ? 'bg-emerald-400' : 'bg-ink-200'}`} />}
        </li>
      ))}
    </ol>
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
