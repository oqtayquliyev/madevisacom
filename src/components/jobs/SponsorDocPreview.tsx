// "Preview sponsorship doc": a quiet button on the job's header that opens the document as it
// would look for this job (the live demo: drag who pays what, watch the rows change), with one
// button under it — make it (members), open it (already made), or unlock it (everyone else).
import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSignature, FileText, Lock, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { priceLabel } from '@/lib/plans';
import { checkoutHref } from '@/lib/billing';
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
};

export function SponsorDocPreviewButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[52px] shrink-0 items-center gap-2 rounded-full border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <FileText className="h-4 w-4" aria-hidden />
        <span className="sm:hidden">Sponsor doc</span>
        <span className="hidden sm:inline">Preview sponsorship doc</span>
      </button>
      {open && <Sheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ jobId, title, company, dest, country, onUnlock, onAuth, onClose }: Props & { onClose: () => void }) {
  const { session } = useAuth();
  const credits = useOfferCredits();
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
  const btn = 'inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-brand-700 sm:w-auto';

  const action = existing ? (
    <button type="button" onClick={() => nav(briefPath(existing))} className={btn}>
      <FileText className="h-4 w-4" /> Open my document
    </button>
  ) : canMakeDocument(credits) ? (
    <button type="button" onClick={() => nav(start)} className={btn}>
      <FileSignature className="h-4 w-4" /> Make mine for this job
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        onClose();
        if (onUnlock) onUnlock();
        else if (session) nav(checkoutHref('starter', 'sponsor_document_preview'));
        else onAuth?.('register');
      }}
      className={btn}
    >
      <Lock className="h-4 w-4" /> Get it · {priceLabel('starter')}
    </button>
  );

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

        <div className="mt-6">
          <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-ink-50" />}>
            <OfferDemo job={dest ? { title, company, code: dest.toUpperCase() } : undefined} />
          </Suspense>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5 text-[12px] font-bold text-ink-600">
            {['Visa route', 'Who pays what', 'PDF to attach'].map((t) => (
              <span key={t} className="rounded-full bg-ink-50 px-2.5 py-1 ring-1 ring-ink-100">
                {t}
              </span>
            ))}
          </div>
          {action}
        </div>
      </div>
    </div>,
    document.body,
  );
}
