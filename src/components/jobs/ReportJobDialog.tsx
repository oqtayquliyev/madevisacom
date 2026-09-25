import { useEffect, useRef, useState } from 'react';
import { Check, Flag, Info, Loader2, Sprout, X } from 'lucide-react';
import { REPORT_DETAILS_MAX, REPORT_REASONS, solveProofOfWork, submitJobReport, type PowSolution, type ReportReason } from '@/lib/jobReports';

/** "Report job" button + popup. Spam checks run on the server; the browser does a small proof of work while the popup is open. */
export function ReportJobButton({ jobId, className = '' }: { jobId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50 ${className}`}
      >
        <Flag className="h-4 w-4" /> Report job
      </button>
      {open && <ReportJobDialog jobId={jobId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportJobDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [pow, setPow] = useState<PowSolution | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());
  const closeRef = useRef<HTMLButtonElement>(null);

  // Proof of work in the background while the person reads the options.
  useEffect(() => {
    const signal = { cancelled: false };
    solveProofOfWork(signal).then((p) => !signal.cancelled && setPow(p));
    return () => {
      signal.cancelled = true;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const needsDetails = reason === 'other' && !details.trim();
  const canSend = Boolean(reason) && !needsDetails && !sending;

  const send = async () => {
    if (!reason || !canSend) return;
    setSending(true);
    setError(null);
    const solution = pow ?? (await solveProofOfWork());
    if (!solution) {
      setError('Please try again.');
      setSending(false);
      return;
    }
    const res = await submitJobReport({ jobId, reason, details: details.trim(), website, startedAt: startedAt.current, pow: solution });
    setSending(false);
    if (res.ok) setDone(true);
    else {
      setError(res.error ?? 'Could not send the report.');
      // A proof of work can be used once — get a fresh one for the next try.
      setPow(null);
      solveProofOfWork().then(setPow);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-job-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-soft-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4 sm:px-6">
          <h2 id="report-job-title" className="text-base font-bold text-ink-950">
            Report this job
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="px-5 pb-7 pt-8 text-center sm:px-6">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="mt-4 text-lg font-bold text-ink-950">Thank you — we’ll take a look</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-ink-600">Our team reviews every report. If the job breaks our rules or is wrong, we’ll fix or remove it.</p>
            <button onClick={onClose} className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5 pt-4 sm:px-6">
            <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[13px] leading-5 text-ink-700">
              <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p>
                <strong className="text-ink-900">MadeVisa is new.</strong> We collect jobs straight from company careers pages and are still improving how we read
                descriptions and add details like salary and visa support. If something looks wrong or is missing, tell us — it helps a lot.
              </p>
            </div>

            <fieldset className="mt-4 rounded-xl border border-ink-200">
              <legend className="sr-only">What’s the problem?</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-3 border-b border-ink-100 px-4 py-3 text-sm text-ink-800 last:border-b-0 hover:bg-ink-50">
                  <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-brand-600" />
                  {r.label}
                </label>
              ))}
            </fieldset>

            <label className="mt-5 block text-sm font-bold text-ink-900" htmlFor="report-details">
              Additional information {reason === 'other' ? <span className="font-normal text-rose-600">(required)</span> : <span className="font-normal text-ink-400">(optional)</span>}
            </label>
            <textarea
              id="report-details"
              value={details}
              maxLength={REPORT_DETAILS_MAX}
              onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX))}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-ink-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <p className={`mt-1 text-xs ${details.length >= REPORT_DETAILS_MAX ? 'text-rose-600' : 'text-ink-400'}`}>
              {details.length} / {REPORT_DETAILS_MAX}
            </p>

            {/* Honeypot: hidden from people, bots fill it */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
              aria-hidden="true"
            />

            <div className="mt-4 flex gap-3 rounded-xl bg-ink-50 p-3.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <div className="text-[13px] leading-5">
                <p className="font-bold text-ink-900">Protect your privacy</p>
                <p className="text-ink-600">Don’t include personal information like your name, phone number or email.</p>
              </div>
            </div>

            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <button
              onClick={send}
              disabled={!canSend}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-200"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />} Submit
            </button>
            <p className="mt-3 text-[11px] leading-4 text-ink-400">
              Reports are reviewed by the MadeVisa team. Reporting a job doesn’t remove it automatically. Limited to a few reports per hour to keep this fair.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
