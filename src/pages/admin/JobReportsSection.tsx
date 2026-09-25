import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Flag, Loader2, RotateCcw, X } from 'lucide-react';
import { fetchJobReports, REPORT_REASONS, REPORTS_PAGE, setJobReportStatus, type JobReport } from '@/lib/jobReports';

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const REASON_TONE: Record<string, string> = {
  fake: 'bg-rose-50 text-rose-700',
  offensive: 'bg-rose-50 text-rose-700',
  inaccurate: 'bg-amber-50 text-amber-700',
  closed: 'bg-ink-100 text-ink-600',
  advertisement: 'bg-sky-50 text-sky-700',
  other: 'bg-ink-100 text-ink-600',
};

function when(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Admin inbox for "Report this job": scrollable list, 20 at a time with "Load more". */
export function JobReportsSection() {
  const [tab, setTab] = useState<'new' | 'handled' | 'all'>('new');
  const [rows, setRows] = useState<JobReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (append: boolean, before?: string) => {
      setLoading(true);
      const res = await fetchJobReports({ status: tab, before });
      setError(res.error ?? null);
      setRows((r) => (append ? [...r, ...res.rows] : res.rows));
      setMore(res.rows.length === REPORTS_PAGE);
      setLoading(false);
    },
    [tab]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const mark = async (r: JobReport, status: JobReport['status']) => {
    setBusy(r.id);
    const res = await setJobReportStatus(r.id, status);
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not update.');
      return;
    }
    // Leaves the "New" list once handled; stays (updated) in the others.
    setRows((list) => (tab === 'new' && status !== 'new' ? list.filter((x) => x.id !== r.id) : list.map((x) => (x.id === r.id ? { ...x, status } : x))));
  };

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
          <Flag className="h-4 w-4" /> Job reports
        </h2>
        <div className="ml-auto flex gap-1">
          {(['new', 'handled', 'all'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tab === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
            >
              {k === 'new' ? 'New' : k === 'handled' ? 'Handled' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-200 bg-white">
        {error && <p className="border-b border-ink-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
        <div className="max-h-[520px] overflow-y-auto overscroll-contain">
          {rows.length === 0 && !loading ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">{tab === 'new' ? 'No new reports.' : 'No reports yet.'}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {rows.map((r) => (
                <li key={r.id} className={`flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start ${r.status !== 'new' ? 'bg-ink-50/50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${REASON_TONE[r.reason] ?? 'bg-ink-100 text-ink-600'}`}>{REASON_LABEL[r.reason] ?? r.reason}</span>
                      <span className="text-[11px] text-ink-400">{when(r.created_at)}</span>
                      {r.status !== 'new' && <span className="text-[11px] font-semibold text-ink-500">{r.status === 'resolved' ? 'Fixed' : 'Dismissed'}</span>}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-ink-900">
                      {r.job_title ?? 'Job removed'}
                      {r.company_name && <span className="font-normal text-ink-500"> · {r.company_name}</span>}
                    </p>
                    {r.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink-700">“{r.details}”</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.job_id && (
                      <a
                        href={`/admin/jobs/${r.job_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
                      >
                        Open job <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {r.status === 'new' ? (
                      <>
                        <button
                          disabled={busy === r.id}
                          onClick={() => mark(r, 'resolved')}
                          className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Fixed
                        </button>
                        <button
                          disabled={busy === r.id}
                          onClick={() => mark(r, 'dismissed')}
                          className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Dismiss
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy === r.id}
                        onClick={() => mark(r, 'new')}
                        className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Reopen
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(more || loading) && (
            <div className="border-t border-ink-100 p-3 text-center">
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-ink-400" />
              ) : (
                <button onClick={() => load(true, rows[rows.length - 1]?.created_at)} className="rounded-lg border border-ink-200 px-4 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
