import { useEffect, useState } from 'react';
import { BadgeCheck, EyeOff, FileSearch, X } from 'lucide-react';
import { evidenceSignedUrl, fetchPendingEvidence, reviewEvidence, setReportExcluded, type EvidenceReview } from '@/lib/companies';

/**
 * Applicant evidence waiting for review. Verifying a report upgrades the
 * company's applicant statistics to "Verified data" once enough reports
 * are verified; excluding removes a suspicious report from statistics
 * (the applicant still sees it in their own tracker).
 */
export function EvidenceReviewSection() {
  const [rows, setRows] = useState<EvidenceReview[] | null>(null);
  const load = () => fetchPendingEvidence().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await fn();
    if (!r.ok) window.alert(r.error);
    load();
  };

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
        <FileSearch className="h-4 w-4" /> Applicant evidence to verify
        {rows && rows.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white">{rows.length}</span>}
      </h2>
      <p className="mt-1 text-[11px] text-ink-400">
        Private screenshots/PDFs applicants attached to prove a company's reply. Check the email matches the company and the status they reported.
      </p>
      <div className="mt-3 divide-y divide-ink-100 border border-ink-200 bg-white">
        {rows === null && <p className="px-4 py-4 text-sm text-ink-400">Loading…</p>}
        {rows?.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">Nothing waiting.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{r.listing_title ?? 'Application'}</p>
              <p className="text-xs text-ink-500">
                {r.publisher?.name ?? 'Unknown company'} · reported <strong>{r.status.replace('_', ' ')}</strong> · applied {new Date(r.applied_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={async () => {
                const url = r.evidence_path ? await evidenceSignedUrl(r.evidence_path) : null;
                if (url) window.open(url, '_blank', 'noopener');
                else window.alert('Could not open the file.');
              }}
              className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
            >
              Open evidence
            </button>
            <button
              onClick={() => act(() => reviewEvidence(r.id, 'verified'))}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              <BadgeCheck className="h-3.5 w-3.5" /> Verify
            </button>
            <button
              onClick={() => act(() => reviewEvidence(r.id, 'rejected'))}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
            >
              <X className="h-3.5 w-3.5" /> Can't verify
            </button>
            <button
              onClick={() => {
                const reason = window.prompt('Exclude this report from company statistics? Reason (shown to admins only):', 'Evidence does not match the report');
                if (reason) act(() => setReportExcluded(r.id, true, reason));
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
              title="Suspicious or fake — leave it out of company statistics"
            >
              <EyeOff className="h-3.5 w-3.5" /> Exclude
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
