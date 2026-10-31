import { useState, type ReactNode } from 'react';
import { ExternalLink, Mail, PenLine } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/plans';
import { nav } from '@/lib/pageLayout';
import { rememberAuthIntent } from '@/lib/authIntent';
import { maskEmailShort } from '@/lib/conversion';
import { hostOf } from '@/lib/proposal';
import { Paywall } from '@/components/pro/Paywall';

// /brief/new?job=…&preview=1 — opened in a new tab from "See preview" on a job.
// The document, full page, on the recommended terms, exactly as it would be sent. Nothing on the
// page can be changed; the one button is "Edit and send to <company>" (members go to the editor;
// everyone else gets the payment popup first). Above it: where to send it.

type Props = {
  /** The two flags, from → to. */
  flags: ReactNode;
  company: string;
  title: string;
  /** HR / recruiter email for this job, when known. */
  contact: string | null;
  /** The job ad on the company's site. */
  source: string | null;
  /** The editor for this job. */
  editHref: string;
  paper: ReactNode;
};

export function DocPreviewShell({ flags, company, title, contact, source, editHref, paper }: Props) {
  const { user } = useAuth();
  const { member } = useMembership();
  const [paywall, setPaywall] = useState(false);

  const edit = () => {
    if (member) return nav(editHref);
    // Everyone else: the payment popup first. After paying they come back to this page, unlocked.
    rememberAuthIntent({ reason: 'offer', next: editHref });
    setPaywall(true);
  };
  const shownEmail = contact ? (member ? contact : maskEmailShort(contact) ?? null) : null;
  const host = hostOf(source);

  return (
    <div className="min-h-screen bg-[#e9edf3] text-ink-900 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 px-3 py-2.5 sm:px-6">
          {flags}
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-800">
            {company}
            <span className="font-normal text-ink-500"> · {title}</span>
          </p>
          <button type="button" onClick={edit} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink-950 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-ink-800">
            <PenLine className="h-4 w-4" aria-hidden />
            <span className="sm:hidden">Edit and send</span>
            <span className="hidden sm:inline">Edit and send to {company}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[900px] px-3 pt-5 sm:px-6 print:hidden">
        {shownEmail ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-4 py-3 text-[14px] text-ink-700 ring-1 ring-ink-200">
            <Mail className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
            <span>Send it to</span>
            {member ? (
              <a href={`mailto:${contact}?subject=${encodeURIComponent(`Application: ${title}`)}`} className="font-mono font-semibold text-ink-950 underline underline-offset-2">
                {shownEmail}
              </a>
            ) : (
              <button type="button" onClick={edit} className="font-mono font-semibold text-ink-950" title="Members see the full email">
                {shownEmail}
              </button>
            )}
            <span className="text-ink-500">· HR / recruiter at {company}</span>
          </p>
        ) : source ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-4 py-3 text-[14px] text-ink-700 ring-1 ring-ink-200">
            <ExternalLink className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
            <span>Find the recruiter’s contact on the job’s page:</span>
            <a href={source} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">
              {host ?? 'the original job ad'}
            </a>
          </p>
        ) : null}
        {!user && <p className="mt-2 px-1 text-[12px] text-ink-500">Your name and details go on it when you edit.</p>}
      </div>

      <main className="mx-auto w-full max-w-[900px] px-3 py-5 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        {/* For reading only: nothing on the document reacts to clicks. */}
        <div className="pointer-events-none select-text">{paper}</div>
      </main>

      {paywall && <Paywall reason="doc" source="doc_preview" job={{ title, company }} onClose={() => setPaywall(false)} />}
    </div>
  );
}
