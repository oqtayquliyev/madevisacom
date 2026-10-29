import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { JobEdgePanel, useJobEdge, type EdgeInput } from '@/components/jobs/JobEdge';

// "Check your match" for members: one popup with the CV match report and "Your edge on this job"
// (sponsor proof, move math, reply odds). Non-members never get here — the button opens the
// membership card (or sign-up first when signed out).

type Props = {
  onClose: () => void;
  title: string;
  company: string;
  /** The CV match panel, or null when the ad can't be matched. */
  match: ReactNode;
  input: EdgeInput;
};

export function JobMatchSheet({ onClose, title, company, match, input }: Props) {
  const edge = useJobEdge(input);
  const hasEdge = Boolean(edge.sponsor?.length || edge.move || edge.odds || edge.diaspora != null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-labelledby="paywall-title"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      data-over-job-modal
      className="job-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(238,238,238,0.72)] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-sheet-title"
        className="job-modal-in job-modal-scroll relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-[20px] bg-[#f8fafc] px-4 pb-6 pt-6 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] sm:max-w-3xl sm:rounded-[20px] sm:px-8 sm:pb-8 sm:pt-7 sm:shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_30px_80px_-20px_rgba(0,0,0,0.18)]"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-800 sm:right-4 sm:top-4">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <h2 id="match-sheet-title" className="pr-10 text-2xl font-bold tracking-tight text-ink-950">
          Your match
        </h2>
        <p className="mt-2 inline-flex max-w-full items-center rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-ink-700 ring-1 ring-ink-200">
          <span className="truncate">
            {title} · {company}
          </span>
        </p>

        {match && <div className="mt-5">{match}</div>}

        {hasEdge && (
          <div className="mt-6">
            <h3 className="mb-2 text-[15px] font-bold text-ink-950">Your edge on this job</h3>
            <JobEdgePanel edge={edge} company={company} locked={false} bare />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
