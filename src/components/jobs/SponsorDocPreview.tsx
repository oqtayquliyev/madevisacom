// "Preview sponsorship doc": a quiet button on the job's header that opens the document as it
// would look for this job (the live demo: drag who pays what, watch the rows change), with one
// "See preview" under it (the full document in a new tab); members also get a link to make / open theirs.
import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileSignature, FileText, X } from 'lucide-react';
import { usePersonalization } from '@/lib/personalization';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { canMakeDocument, useOfferCredits } from '@/lib/sponsorOffer';

const OfferDemo = lazy(() => import('@/components/briefs/OfferDemo').then((m) => ({ default: m.OfferDemo })));

type Props = {
  jobId: string;
  title: string;
  company: string;
  /** The job's country (ISO code): the visa route shown in the document. */
  dest: string | null;
  /** Country to start the builder with when the job's own isn't covered. */
  country?: string | null;
  /** Non-members: opens the membership popup. */
  onUnlock?: () => void;
  onAuth?: (p: 'login' | 'register') => void;
  /** On a white header. */
  light?: boolean;
  /** Open right away (from a notification link). */
  defaultOpen?: boolean;
};

export function SponsorDocPreviewButton(props: Props) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-[52px] shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${props.light ? 'text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 focus-visible:outline-ink-950' : 'border border-white/40 text-white hover:bg-white/10 focus-visible:outline-white'}`}
      >
        <FileText className="h-4 w-4" aria-hidden />
        <span className="sm:hidden">Sponsor doc</span>
        <span className="hidden sm:inline">Preview sponsorship doc</span>
      </button>
      {open && <Sheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ jobId, title, company, dest, country, onClose }: Props & { onClose: () => void }) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const { profile: visitor } = usePersonalization();
  const from = (visitor.currentLocation ?? visitor.citizenship ?? '').toUpperCase() || null;
  // The full document on the recommended terms, read-only, in a new tab.
  const previewHref = `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}&preview=1`;
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchMyBriefForJob(jobId).then((b) => alive && setExisting(b?.share_id ?? null));
    return () => {
      alive = false;
    };
  }, [session, jobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-labelledby="paywall-title"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}`;
  // Members: straight to their document (or the editor) under the preview button.
  const memberLink = existing ? (
    <button type="button" onClick={() => nav(briefPath(existing))} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 underline underline-offset-2 hover:text-ink-950">
      <FileText className="h-3.5 w-3.5" /> Open my document
    </button>
  ) : canMakeDocument(credits) ? (
    <button type="button" onClick={() => nav(start)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 underline underline-offset-2 hover:text-ink-950">
      <FileSignature className="h-3.5 w-3.5" /> Make mine for this job
    </button>
  ) : null;

  return createPortal(
    <div
      data-over-job-modal
      className="job-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(238,238,238,0.72)] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-preview-title"
        className="job-modal-in job-modal-scroll relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[20px] bg-white px-5 pb-6 pt-6 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] sm:max-w-3xl sm:rounded-[20px] sm:px-9 sm:pb-9 sm:pt-8 sm:shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_30px_80px_-20px_rgba(0,0,0,0.18)]"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-400 transition hover:bg-ink-50 hover:text-ink-800 sm:right-4 sm:top-4">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">Sponsorship document</p>
        <h2 id="doc-preview-title" className="mt-1.5 pr-10 text-2xl font-bold tracking-tight text-ink-950 sm:text-[28px]">
          Your proposal to {company}
        </h2>
        <p className="mt-3 inline-flex max-w-full items-center truncate rounded-full bg-ink-50 px-3 py-1 text-[13px] font-semibold text-ink-700 ring-1 ring-ink-100">
          <span className="truncate">{title}</span>
        </p>

        <div className="mx-auto mt-6 max-w-[460px]">
          <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-ink-50" />}>
            <OfferDemo fixed from={from} job={dest ? { title, company, code: dest.toUpperCase() } : undefined} />
          </Suspense>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 border-t border-ink-100 pt-6">
          <a
            href={previewHref}
            target="_blank"
            rel="noopener"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-8 py-3.5 text-[15px] font-bold text-white transition hover:bg-brand-700 sm:w-auto"
          >
            <Eye className="h-4 w-4" aria-hidden /> See preview
          </a>
          {memberLink}
        </div>
      </div>
    </div>,
    document.body,
  );
}
