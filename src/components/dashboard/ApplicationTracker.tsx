import { useEffect, useState } from 'react';
import { ClipboardList, Star } from 'lucide-react';
import {
  APPLICATION_STATUSES,
  companyPath,
  fetchMyApplicationReports,
  updateApplicationReport,
  type ApplicationReport,
  type ApplicationStatus,
} from '@/lib/companies';
import { formatRelativeTime } from '@/lib/dates';

/**
 * "Your applications" — every job/program the user applied to through
 * MadeVisa while signed in. Updating the outcome here (response,
 * interview, offer, …) is what powers each company's public response
 * statistics; individual answers are never shown to anyone.
 */
export function ApplicationTracker() {
  const [rows, setRows] = useState<ApplicationReport[] | null>(null);
  useEffect(() => {
    fetchMyApplicationReports().then(setRows);
  }, []);

  if (rows === null) return null;

  const set = async (r: ApplicationReport, patch: { status?: ApplicationStatus; experience_rating?: number | null }) => {
    setRows((prev) => prev?.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) ?? prev);
    const res = await updateApplicationReport(r.id, patch);
    if (!res.ok) window.alert(res.error);
  };

  return (
    <section className="border border-ink-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-ink-400" />
          <h2 className="text-lg font-bold text-ink-950">Your applications</h2>
          {rows.length > 0 && <span className="text-xs text-ink-400">{rows.length}</span>}
        </div>
        <p className="text-[11px] text-ink-400">Your answers stay private — only anonymous totals are shown on company pages.</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          When you click <strong>Apply</strong> on a job or program while signed in, it appears here so you can track what happens next.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-ink-100">
          {rows.map((r) => {
            const waitingLong = r.status === 'applied' && Date.now() - new Date(r.applied_at).getTime() > 14 * 86_400_000;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{r.listing_title ?? 'Application'}</p>
                  <p className="text-xs text-ink-500">
                    {r.publisher ? (
                      <a href={companyPath(r.publisher)} className="hover:text-brand-700">
                        {r.publisher.name}
                      </a>
                    ) : null}{' '}
                    · applied {formatRelativeTime(r.applied_at, '')}
                    {waitingLong && <span className="ml-1 font-semibold text-amber-700">· any news? Update it →</span>}
                  </p>
                </div>
                <select
                  value={r.status}
                  onChange={(e) => set(r, { status: e.target.value as ApplicationStatus })}
                  className={`h-8 rounded-md border px-2 text-xs font-semibold ${
                    r.status === 'offer' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : r.status === 'applied' ? 'border-ink-200 text-ink-700' : 'border-brand-200 bg-brand-50 text-brand-800'
                  }`}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {r.status !== 'applied' && (
                  <div className="flex items-center" title="How was the application experience?">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => set(r, { experience_rating: r.experience_rating === n ? null : n })} aria-label={`${n} stars`}>
                        <Star className={`h-4 w-4 ${(r.experience_rating ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-200 hover:text-amber-300'}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
